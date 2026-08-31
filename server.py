#!/usr/bin/env python3
"""
Coverage — local server.

Serves the app and owns data.json, which sits next to this file. Binds to
127.0.0.1 only, so nothing is reachable from your network or the internet.

    python3 server.py
"""
import datetime, http.server, json, os, shutil, socketserver, sys, threading, time, webbrowser

APP_NAME = "Coverage"          # also names the data folder

HERE = os.path.dirname(os.path.abspath(__file__))


def data_dir():
    """Where records live. Never inside the app bundle — that breaks on move,
    update, and reinstall. One location, so the .app and `python3 server.py`
    share a single dataset."""
    env = os.environ.get(APP_NAME.upper() + "_DATA_DIR")
    if env:
        return os.path.expanduser(env)
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/" + APP_NAME)
    return os.path.join(os.path.expanduser("~"), ".coverage")


ROOT     = data_dir()
DATA     = os.path.join(ROOT, "data.json")
BACKUPS  = os.path.join(ROOT, "backups")
KEEP     = 40
PORT     = int(os.environ.get("PORT", "8765"))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".html": "text/html; charset=utf-8",
                      ".json": "application/json; charset=utf-8"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/info":
            return self._json(200, {"dataFile": DATA, "backups": BACKUPS})
        if self.path.split("?")[0] == "/api/data":
            if not os.path.exists(DATA):
                return self._json(200, {})          # first run — app plants its seed
            try:
                with open(DATA, encoding="utf-8") as f:
                    return self._json(200, json.load(f))
            except Exception as e:
                return self._json(500, {"error": "could not read data.json: %s" % e})
        return super().do_GET()

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/data":
            return self.send_error(404)
        os.makedirs(ROOT, exist_ok=True)
        try:
            raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            obj = json.loads(raw)
        except Exception:
            return self._json(400, {"error": "invalid json"})
        if not isinstance(obj, dict) or not isinstance(obj.get("contacts"), list) \
           or not isinstance(obj.get("firms"), list):
            return self._json(400, {"error": "payload is not a Coverage dataset"})

        # keep a timestamped copy, but only when something actually changed
        new = json.dumps(obj, indent=1, ensure_ascii=False)
        if os.path.exists(DATA):
            try:
                with open(DATA, encoding="utf-8") as f:
                    changed = f.read() != new
            except Exception:
                changed = True
            if changed:
                os.makedirs(BACKUPS, exist_ok=True)
                stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
                shutil.copy2(DATA, os.path.join(BACKUPS, "data-%s.json" % stamp))
                old = sorted(f for f in os.listdir(BACKUPS) if f.endswith(".json"))
                for name in old[:-KEEP]:
                    try:
                        os.remove(os.path.join(BACKUPS, name))
                    except OSError:
                        pass

        tmp = DATA + ".tmp"                          # atomic: never a half-written file
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(new)
        os.replace(tmp, DATA)
        return self._json(200, {"ok": True, "contacts": len(obj["contacts"])})

    def log_message(self, *a):
        pass                                          # keep the terminal quiet


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    port = PORT
    for attempt in range(20):
        try:
            httpd = Server(("127.0.0.1", port), Handler)
            break
        except OSError:
            port += 1
    else:
        print("Could not find a free port. Close whatever is using 8765-8785.", flush=True)
        return 1

    os.makedirs(ROOT, exist_ok=True)
    portfile = os.path.join(ROOT, ".port")
    try:                                    # tell the launcher which port won
        with open(portfile, "w") as f:
            f.write(str(port))
    except OSError:
        portfile = None

    url = "http://127.0.0.1:%d/" % port
    n = 0
    if os.path.exists(DATA):
        try:
            with open(DATA, encoding="utf-8") as f:
                n = len(json.load(f).get("contacts", []))
        except Exception:
            pass

    print("\n  Coverage is running at  %s" % url, flush=True)
    print("  Data file:  %s" % DATA, flush=True)
    print("  %s" % ("Loaded %d contacts." % n if n else "No data.json yet — it will be created on your first edit."), flush=True)
    print("\n  Leave this window open while you use the app.", flush=True)
    print("  Press Ctrl+C to stop.\n", flush=True)

    if "--watch-parent" in sys.argv:
        # If the launcher is force-quit, bash cannot run its trap while a
        # foreground child is alive — so we notice being orphaned and exit,
        # rather than lingering with the port held.
        def watch(parent):
            while True:
                time.sleep(2)
                if os.getppid() != parent:
                    httpd.shutdown()
                    return
        threading.Thread(target=watch, args=(os.getppid(),), daemon=True).start()

    if "--no-open" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped. Your data is saved in data.json.\n", flush=True)
    finally:
        httpd.server_close()
        if portfile:
            try:
                os.remove(portfile)
            except OSError:
                pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
