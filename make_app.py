#!/usr/bin/env python3
"""Build Coverage.app from local/index.html + local/server.py."""
import os, plistlib, shutil, subprocess, sys

# ---- edit these three lines to rebrand for another project ----------------
APP_NAME    = "Coverage"
BUNDLE_ID   = "com.jacobklein.coverage"
ICON_LETTER = "C"
# ---------------------------------------------------------------------------

ROOT = os.path.dirname(os.path.abspath(__file__))
APP  = os.path.join(ROOT, APP_NAME + ".app")
RES  = os.path.join(APP, "Contents", "Resources")
MACOS= os.path.join(APP, "Contents", "MacOS")

# ---------------------------------------------------------------- icon
S, INSET, R = 1024, 88, 200
k = 0.5523 * R
x0 = y0 = INSET
x1 = y1 = S - INSET

def rrect(x0, y0, x1, y1, r, k):
    return (f"{x0+r} {y0} m\n{x1-r} {y0} l\n"
            f"{x1-r+k} {y0} {x1} {y0+r-k} {x1} {y0+r} c\n{x1} {y1-r} l\n"
            f"{x1} {y1-r+k} {x1-r+k} {y1} {x1-r} {y1} c\n{x0+r} {y1} l\n"
            f"{x0+r-k} {y1} {x0} {y1-r+k} {x0} {y1-r} c\n{x0} {y0+r} l\n"
            f"{x0} {y0+r-k} {x0+r-k} {y0} {x0+r} {y0} c\nh")

def build_icon(dest):
    content = (f"q\n0.055 0.082 0.125 rg\n{rrect(x0,y0,x1,y1,R,k)}\nf\nQ\n"
               "q\n0.847 0.671 0.333 rg\n"
               f"BT /F1 560 Tf 1 0 0 1 300 352 Tm ({ICON_LETTER}) Tj ET\nQ\n"
               "q\n0.847 0.671 0.333 rg\n232 236 560 26 re f\nQ\n")
    objs = ["<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {S} {S}] "
            "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"]
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += f"{i} 0 obj\n{o}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n"
    for off in offs: out += f"{off:010d} 00000 n \n"
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"

    work = os.path.join(ROOT, "_icon")
    iconset = os.path.join(work, "icon.iconset")
    shutil.rmtree(work, ignore_errors=True); os.makedirs(iconset)
    pdf = os.path.join(work, "icon.pdf")
    open(pdf, "w").write(out)
    for size in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = size * scale
            name = "icon_%dx%d%s.png" % (size, size, "@2x" if scale == 2 else "")
            subprocess.run(["sips", "-s", "format", "png", pdf, "--out",
                            os.path.join(iconset, name), "-Z", str(px)],
                           check=True, capture_output=True)
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", dest],
                   check=True, capture_output=True)
    shutil.rmtree(work, ignore_errors=True)

# ---------------------------------------------------------------- launcher
LAUNCHER = r'''#!/bin/bash
# __APP_NAME__ — starts the local server, opens a dedicated window, cleans up on exit.
set -u
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
SUPPORT="$HOME/Library/Application Support/__APP_NAME__"
PORTFILE="$SUPPORT/.port"

# GUI apps inherit a minimal PATH, so prefer the system interpreter explicitly.
if [ -x /usr/bin/python3 ]; then PY=/usr/bin/python3; else PY="$(command -v python3 || true)"; fi
if [ -z "${PY:-}" ]; then
  osascript -e 'display alert "Python 3 not found" message "Coverage needs python3. Install the Xcode Command Line Tools with: xcode-select --install" as critical'
  exit 1
fi

mkdir -p "$SUPPORT"

# Reuse a server that is already up, so relaunching never stacks a second one.
SERVER=""
if [ -f "$PORTFILE" ] && curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$(cat "$PORTFILE")/"; then
  URL="http://127.0.0.1:$(cat "$PORTFILE")/"
else
  rm -f "$PORTFILE"
  "$PY" "$RES/server.py" --no-open --watch-parent &
  SERVER=$!
  for _ in $(seq 1 100); do
    [ -f "$PORTFILE" ] && break
    kill -0 "$SERVER" 2>/dev/null || break
    sleep 0.1
  done
  if [ ! -f "$PORTFILE" ]; then
    osascript -e 'display alert "__APP_NAME__ could not start" message "The local server did not come up." as critical'
    exit 1
  fi
  URL="http://127.0.0.1:$(cat "$PORTFILE")/"
fi

# Only tear down a server this launch actually started.
cleanup() {
  if [ -n "$SERVER" ]; then
    kill "$SERVER" 2>/dev/null
    wait "$SERVER" 2>/dev/null
    rm -f "$PORTFILE"
  fi
}
trap cleanup EXIT INT TERM

# A Chromium browser gives a real app window: no tabs, no address bar.
# Its own profile dir keeps it separate from your everyday browsing.
PROFILE="$SUPPORT/window"
for B in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
         "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
         "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  if [ -x "$B" ]; then
    "$B" --app="$URL" --user-data-dir="$PROFILE" \
         --no-first-run --no-default-browser-check --window-size=1280,860
    exit 0
  fi
done

# No Chromium browser: default browser, with a dialog owning the app's lifetime.
open "$URL"
osascript -e 'display dialog "__APP_NAME__ is running in your browser.

Click Quit when you are done." with title "__APP_NAME__" buttons {"Quit Coverage"} default button 1 with icon note' >/dev/null 2>&1
exit 0
'''

def main():
    shutil.rmtree(APP, ignore_errors=True)
    os.makedirs(RES); os.makedirs(MACOS)

    shutil.copy2(os.path.join(ROOT, "index.html"), RES)
    shutil.copy2(os.path.join(ROOT, "server.py"), RES)
    build_icon(os.path.join(RES, "icon.icns"))

    exe = os.path.join(MACOS, APP_NAME)
    open(exe, "w").write(LAUNCHER.replace("__APP_NAME__", APP_NAME))
    os.chmod(exe, 0o755)

    plist = {
        "CFBundleName": APP_NAME,
        "CFBundleDisplayName": APP_NAME,
        "CFBundleIdentifier": BUNDLE_ID,
        "CFBundleExecutable": APP_NAME,
        "CFBundleIconFile": "icon",
        "CFBundlePackageType": "APPL",
        "CFBundleShortVersionString": "1.0",
        "CFBundleVersion": "1",
        "CFBundleInfoDictionaryVersion": "6.0",
        "LSMinimumSystemVersion": "11.0",
        "NSHighResolutionCapable": True,
    }
    with open(os.path.join(APP, "Contents", "Info.plist"), "wb") as f:
        plistlib.dump(plist, f)
    print("built", APP)

if __name__ == "__main__":
    main()
