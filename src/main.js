// omaplex: a floating CRT television for Plex on Omarchy / Hyprland.
const { app, BrowserWindow, ipcMain, session } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const CLASS = "omaplex";
// OMAPLEX_PROFILE runs an isolated instance (own state + browser profile), used
// by the screenshot capture so it never touches your real Plex session.
const PROFILE = process.env.OMAPLEX_PROFILE;
const CONFIG_DIR = PROFILE || path.join(os.homedir(), ".config", "omaplex");
const STATE_FILE = path.join(CONFIG_DIR, "state.json");
const THEME_DIR = path.join(os.homedir(), ".local", "state", "omarchy", "current");

const DEFAULTS = {
  url: "https://app.plex.tv/desktop/",
  skin: "omarchy",
  opacity: 1,
  ghost: false,
  fx: true,
  pinned: true,
  size: "M",
  corner: "tr",
  bare: false,
  muted: false,
  profile: "", // Plex Home profile to pick at "Select User" (omaplex profile)
  pin: "",
  away: false, // pause while stashed, resume when brought back
  geom: null, // where you last dragged/resized it: { monitor, x, y, w, h }
};

// Window sizes (logical px) for the S/M/L presets, with and without the cabinet.
// Bare mode is a 16:9 screen plus the 24px remote strip.
const SIZES = {
  S: { tv: [440, 350], bare: [400, 249] },
  M: { tv: [600, 470], bare: [560, 339] },
  L: { tv: [820, 630], bare: [800, 474] },
};
const CORNERS = ["tr", "br", "bl", "tl"];
const MARGIN = 24;

app.commandLine.appendSwitch("class", CLASS);
app.commandLine.appendSwitch("enable-features", "HardwareMediaKeyHandling,MediaSessionService");
app.setName(CLASS);
if (PROFILE) app.setPath("userData", path.join(PROFILE, "browser"));

// Plex web is pickier about Electron than plain Chromium.
app.userAgentFallback = app.userAgentFallback.replace(/ (omaplex|Electron)\/\S+/g, "");

let win;
let state = loadState();

function loadState() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveState() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  // Private: it can hold a Plex Home PIN.
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.chmodSync(STATE_FILE, 0o600);
}

function hypr(args) {
  return new Promise((resolve) => {
    execFile("hyprctl", args, (err, stdout) => resolve(err ? null : stdout));
  });
}

async function hyprJson(what) {
  const out = await hypr(["-j", what]);
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function dispatch(lua) {
  return hypr(["dispatch", lua]);
}

async function ourClient() {
  const clients = (await hyprJson("clients")) || [];
  // Match by pid only: a second instance (e.g. the capture profile) must never
  // grab someone else's TV.
  return clients.find((c) => c.pid === process.pid);
}

function windowSelector(client) {
  return `address:${client.address}`;
}

async function applyPin() {
  const client = await ourClient();
  if (!client || client.pinned === state.pinned) return;
  await dispatch(`hl.dsp.window.pin({ window = "${windowSelector(client)}", action = "${state.pinned ? "on" : "off"}" })`);
}

// Reapply a hand-dragged position/size if its monitor is still around.
async function restoreGeom() {
  const g = state.geom;
  const monitors = (await hyprJson("monitors")) || [];
  const client = await ourClient();
  if (!g || !client || !monitors.some((m) => m.name === g.monitor)) return false;
  const sel = windowSelector(client);
  await dispatch(`hl.dsp.window.resize({ window = "${sel}", x = ${g.w}, y = ${g.h} })`);
  await dispatch(`hl.dsp.window.move({ window = "${sel}", x = ${g.x}, y = ${g.y} })`);
  lastGeom = JSON.stringify(g);
  return true;
}

// Hyprland doesn't tell Wayland clients where they are, so check now and then
// (and on the way out) whether the TV has been dragged or resized by hand.
let lastGeom;
async function trackGeom() {
  const client = await ourClient();
  if (!client || client.workspace.name.startsWith("special:")) return;
  const monitors = (await hyprJson("monitors")) || [];
  const mon = monitors.find((m) => m.id === client.monitor);
  if (!mon) return;
  const [x, y] = client.at;
  const [w, h] = client.size;
  const next = JSON.stringify({ monitor: mon.name, x, y, w, h });
  if (lastGeom === undefined) lastGeom = next; // first sighting: nothing moved yet
  if (next === lastGeom) return;
  lastGeom = next;
  state.geom = JSON.parse(next);
  saveState();
}

async function place() {
  const client = await ourClient();
  const monitors = (await hyprJson("monitors")) || [];
  const mon = monitors.find((m) => client && m.id === client.monitor) || monitors.find((m) => m.focused) || monitors[0];
  if (!client || !mon) return;

  const [w, h] = SIZES[state.size][state.bare ? "bare" : "tv"];
  const [rl, rt, rr, rb] = mon.reserved || [0, 0, 0, 0];
  const mw = Math.round(mon.width / mon.scale);
  const mh = Math.round(mon.height / mon.scale);
  const left = mon.x + rl + MARGIN;
  const right = mon.x + mw - rr - MARGIN - w;
  const top = mon.y + rt + MARGIN;
  const bottom = mon.y + mh - rb - MARGIN - h;
  const x = state.corner.endsWith("l") ? left : right;
  const y = state.corner.startsWith("t") ? top : bottom;

  const sel = windowSelector(client);
  await dispatch(`hl.dsp.window.resize({ window = "${sel}", x = ${w}, y = ${h} })`);
  await dispatch(`hl.dsp.window.move({ window = "${sel}", x = ${x}, y = ${y} })`);
  // A preset (SIZE / MOVE / BARE) replaces any hand-dragged spot.
  state.geom = null;
  saveState();
  lastGeom = JSON.stringify({ monitor: mon.name, x, y, w, h });
}

// Tell the renderer when the TV is stashed on / brought back from the special
// workspace, straight from Hyprland's event socket.
function watchStash() {
  const sig = process.env.HYPRLAND_INSTANCE_SIGNATURE;
  const dir = process.env.XDG_RUNTIME_DIR;
  if (!sig || !dir) return;
  const sock = net.connect(path.join(dir, "hypr", sig, ".socket2.sock"));
  let buf = "";
  sock.on("data", async (chunk) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const [event, data] = line.split(">>");
      if (event !== "movewindowv2") continue;
      const [addr, , wsName] = data.split(",");
      const client = await ourClient();
      if (client && client.address.replace(/^0x/, "") === addr.replace(/^0x/, "")) {
        win?.webContents.send("stashed", wsName.startsWith("special:"));
      }
    }
  });
  sock.on("error", () => {});
}

function readThemeColors() {
  const colors = {};
  try {
    const toml = fs.readFileSync(path.join(THEME_DIR, "theme", "colors.toml"), "utf8");
    for (const [, key, value] of toml.matchAll(/^\s*(\w+)\s*=\s*"([^"]+)"/gm)) colors[key] = value;
    colors.name = fs.readFileSync(path.join(THEME_DIR, "theme.name"), "utf8").trim();
  } catch {}
  return colors;
}

// Push the palette to the renderer when it changes. Triggered by the Omarchy
// theme-set hook (`omaplex reload-theme`) and, as a fallback when the hook
// isn't installed, by polling the current theme files.
let lastTheme = JSON.stringify(readThemeColors());
let themeTimer;
function checkTheme(delay = 400) {
  clearTimeout(themeTimer);
  themeTimer = setTimeout(() => {
    const colors = readThemeColors();
    const next = JSON.stringify(colors);
    if (next === lastTheme || !colors.accent) return;
    lastTheme = next;
    win?.webContents.send("theme", colors);
  }, delay);
}

function watchTheme() {
  fs.watchFile(path.join(THEME_DIR, "theme.name"), { interval: 1000 }, () => checkTheme());
  fs.watchFile(path.join(THEME_DIR, "theme", "colors.toml"), { interval: 1000 }, () => checkTheme());
}

function createWindow() {
  const [w, h] = SIZES[state.size][state.bare ? "bare" : "tv"];
  win = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 320,
    minHeight: 180,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    title: "omaplex",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
  win.on("focus", () => win.webContents.send("focus", true));
  win.on("blur", () => win.webContents.send("focus", false));

  // Hyprland maps the window asynchronously; apply pin/placement once it exists.
  win.once("ready-to-show", async () => {
    for (let i = 0; i < 20 && !(await ourClient()); i++) await new Promise((r) => setTimeout(r, 150));
    await applyPin();
    if (!(await restoreGeom())) await place();
    setInterval(trackGeom, 4000);
  });
}

ipcMain.handle("init", () => ({ state, theme: readThemeColors(), sizes: SIZES }));

ipcMain.handle("set", async (_e, patch) => {
  const before = { ...state };
  state = { ...state, ...patch };
  saveState();
  if (before.pinned !== state.pinned) await applyPin();
  if (before.size !== state.size || before.corner !== state.corner || before.bare !== state.bare) await place();
  return state;
});

ipcMain.handle("cycle-corner", async () => {
  // Start from wherever the window was dragged to, not the last stored corner.
  const client = await ourClient();
  const monitors = (await hyprJson("monitors")) || [];
  const mon = monitors.find((m) => client && m.id === client.monitor);
  let current = state.corner;
  if (client && mon) {
    const cx = client.at[0] + client.size[0] / 2 - mon.x;
    const cy = client.at[1] + client.size[1] / 2 - mon.y;
    current = (cy < mon.height / mon.scale / 2 ? "t" : "b") + (cx < mon.width / mon.scale / 2 ? "l" : "r");
  }
  state.corner = CORNERS[(CORNERS.indexOf(current) + 1) % CORNERS.length];
  saveState();
  await place();
  return state;
});

ipcMain.handle("quit", async () => {
  await trackGeom();
  app.quit();
});

// One TV per profile. A second launch just forwards its arguments here.
const primary = app.requestSingleInstanceLock();
if (!primary) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    if (argv.includes("--reload-theme")) return checkTheme(0);
    const media = argv.find((a) => a.startsWith("--media="));
    if (media) return win?.webContents.send("media", media.slice("--media=".length));
    const profile = argv.find((a) => a.startsWith("--set-profile="));
    if (profile) {
      state.profile = profile.slice("--set-profile=".length);
      state.pin = (argv.find((a) => a.startsWith("--set-pin=")) || "").slice("--set-pin=".length);
      saveState();
      return win?.webContents.send("state", state);
    }
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
}

app.whenReady().then(() => {
  if (!primary) return;
  // Let the Plex webview keep its login between launches.
  session.fromPartition("persist:plex").setPermissionRequestHandler((_wc, perm, cb) => {
    cb(["fullscreen", "media", "notifications", "clipboard-sanitized-write"].includes(perm));
  });
  createWindow();
  watchTheme();
  watchStash();
  if (process.env.OMAPLEX_CAPTURE) require("./capture")(win, process.env.OMAPLEX_CAPTURE);
});

app.on("web-contents-created", (_e, contents) => {
  if (contents.getType() !== "webview") return;
  // Open Plex's external links in the real browser instead of inside the TV.
  contents.setWindowOpenHandler(({ url }) => {
    execFile("xdg-open", [url]);
    return { action: "deny" };
  });
});

app.on("window-all-closed", () => app.quit());
