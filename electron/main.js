/* Coverage — native shell.
 *
 * The app itself is the single index.html at the repo root; there is no server
 * to boot. The only real job here is giving that file a stable origin so the
 * browser storage behind it survives updates: pages loaded over file:// get an
 * opaque origin, and localStorage keyed to it is unreliable across launches and
 * across Chromium versions. So index.html is served over a private app://
 * scheme instead. app://coverage never changes, which means the records written
 * on first run are still there after the app is replaced with a newer build.
 */

const { app, BrowserWindow, Menu, net, protocol, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SCHEME = "app";
const HOST = "coverage";
const ORIGIN = SCHEME + "://" + HOST;
const ROOT = path.join(__dirname, "..");

/* standard + secure so the page is a proper web origin: persistent
   localStorage, a working fetch(), no mixed-content warnings. */
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

function serve(request) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (rel === "/" || rel === "") rel = "/index.html";

  /* Resolve inside ROOT and refuse anything that climbs out of it. */
  const file = path.normalize(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  /* net.fetch rather than a hand-built Response: it streams the body to
     completion (a Response wrapped around a Buffer leaves the HTML parser
     waiting on a stream that never closes), sets the content type, and reads
     straight out of the asar archive in a packaged build. */
  return net.fetch(pathToFileURL(file).toString());
}

/* ---------- remembered window size and position ---------- */

const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function loadWindowState() {
  const fallback = { width: 1280, height: 860 };
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (!Number.isFinite(s.width) || !Number.isFinite(s.height)) return fallback;
    return s;
  } catch {
    return fallback;
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  const b = win.getNormalBounds();
  try {
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() })
    );
  } catch {
    /* a lost window position is not worth interrupting a quit over */
  }
}

/* ---------- window ---------- */

let mainWindow = null;

function createWindow() {
  const s = loadWindowState();

  mainWindow = new BrowserWindow({
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    minWidth: 720,
    minHeight: 560,
    title: "Coverage",
    show: false,
    backgroundColor: "#F1F3F6",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  if (s.maximized) mainWindow.maximize();
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", () => saveWindowState(mainWindow));
  mainWindow.on("closed", () => { mainWindow = null; });

  /* Anything that is not the app itself belongs in the real browser. */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(ORIGIN)) return;
    e.preventDefault();
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
  });

  mainWindow.loadURL(ORIGIN + "/index.html");
}

/* ---------- menu ----------
   Not decoration: without an Edit menu, macOS has nothing to bind Cmd-C,
   Cmd-V or Cmd-Z to, and the text fields in the app stop behaving. */

function buildMenu() {
  const mac = process.platform === "darwin";
  const template = [
    ...(mac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Contact",
          accelerator: "CmdOrCtrl+N",
          /* the page owns the form; just press its button */
          click: () => mainWindow &&
            mainWindow.webContents.executeJavaScript('document.getElementById("addbtn").click()')
        },
        { type: "separator" },
        mac ? { role: "close" } : { role: "quit" }
      ]
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    { role: "windowMenu" }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- lifecycle ---------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
