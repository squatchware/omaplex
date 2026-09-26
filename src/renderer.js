const SKINS = ["omarchy", "walnut", "atomic", "vapor", "noir", "sunburst"];
const SIZE_ORDER = ["S", "M", "L"];
const body = document.body;
const plex = document.getElementById("plex");
const $ = (id) => document.getElementById(id);

let state;
let theme = {};

// ---------- skins ----------
// Every variable a skin can set; the omarchy skin fills them from the live theme.
const THEME_VARS = ["--cab-a", "--cab-b", "--panel", "--panel-ink", "--bezel", "--knob-a", "--knob-b",
  "--accent", "--led", "--badge", "--grain", "--antenna", "--osd"];

function luminance(hex) {
  const n = parseInt((hex || "#000").replace("#", "").slice(0, 6), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function themeVars(t) {
  const bg = t.background || "#1e1e2e";
  const fg = t.foreground || "#cdd6f4";
  const accent = t.accent || t.blue || fg;
  const dark = t.mode ? t.mode !== "light" : luminance(bg) < 0.5;
  // The switch/antenna-tip colour should pop against the accent-coloured cabinet.
  const pop = [t.magenta, t.orange, t.yellow, t.red, t.green].find((c) => c && c.toLowerCase() !== accent.toLowerCase()) || fg;
  return {
    "--cab-a": `color-mix(in srgb, ${accent} 88%, #fff)`,
    "--cab-b": `color-mix(in srgb, ${accent} 55%, #000)`,
    "--panel": dark ? (t.lighter_background || bg) : bg,
    "--panel-ink": fg,
    "--bezel": dark ? (t.darker_background || `color-mix(in srgb, ${bg} 60%, #000)`) : `color-mix(in srgb, ${fg} 80%, #000)`,
    "--knob-a": dark ? (t.light_foreground || fg) : (t.lighter_background || bg),
    "--knob-b": t.muted || t.dark_foreground || fg,
    "--accent": pop,
    "--led": t.green || accent,
    "--badge": dark ? (t.bright_foreground || fg) : bg,
    "--antenna": t.light_foreground || t.muted || "#c9ccd1",
    "--osd": t.green || accent,
    "--grain": "0",
  };
}

function applySkin() {
  for (const skin of SKINS) body.classList.toggle(`skin-${skin}`, skin === state.skin);
  const s = body.style;
  THEME_VARS.forEach((v) => s.removeProperty(v));
  if (state.skin === "omarchy" && Object.keys(theme).length) {
    for (const [k, v] of Object.entries(themeVars(theme))) s.setProperty(k, v);
  }
  $("channel").style.setProperty("--rot", `${SKINS.indexOf(state.skin) * 60 - 150}deg`);
}

// ---------- toggles ----------
function render() {
  applySkin();
  body.classList.toggle("fx", state.fx);
  body.classList.toggle("bare", state.bare);
  body.style.setProperty("--opacity", state.opacity);
  $("dim").style.setProperty("--rot", `${-135 + ((state.opacity - 0.25) / 0.75) * 270}deg`);
  $("pin").classList.toggle("on", state.pinned);
  $("ghost").classList.toggle("on", state.ghost);
  $("fx").classList.toggle("on", state.fx);
  $("mute").classList.toggle("on", state.muted);
  $("bare").classList.toggle("on", state.bare);
  $("size").textContent = `SIZE ${state.size}`;
  document.querySelector('.rb[data-act="pin"]').classList.toggle("on", state.pinned);
}

async function set(patch) {
  state = await window.tv.set(patch);
  render();
}

// ---------- static & OSD ----------
const canvas = $("static");
const ctx = canvas.getContext("2d");
let staticUntil = 0;

function drawStatic() {
  const img = ctx.createImageData(canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // A rolling hum bar, because of course.
  const y = ((performance.now() / 6) % (canvas.height + 30)) - 30;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, y, canvas.width, 18);
  if (performance.now() < staticUntil) requestAnimationFrame(drawStatic);
  else body.classList.remove("static");
}

function burst(ms = 450) {
  const running = performance.now() < staticUntil;
  staticUntil = performance.now() + ms;
  body.classList.add("static");
  if (!running) requestAnimationFrame(drawStatic);
}

let osdTimer;
function osd(text) {
  const el = $("osd");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => el.classList.remove("show"), 1400);
}

function wiggle() {
  body.classList.remove("wiggle");
  void body.offsetWidth;
  body.classList.add("wiggle");
}

// ---------- controls ----------
function changeChannel(step) {
  const i = (SKINS.indexOf(state.skin) + step + SKINS.length) % SKINS.length;
  burst();
  wiggle();
  const label = SKINS[i] === "omarchy" ? `THEME ${(theme.name || "").toUpperCase()}` : SKINS[i].toUpperCase();
  osd(`CH ${String(i + 1).padStart(2, "0")} ${label}`);
  set({ skin: SKINS[i] });
}

$("channel").addEventListener("click", () => changeChannel(1));
$("channel").addEventListener("contextmenu", (e) => { e.preventDefault(); changeChannel(-1); });
$("channel").addEventListener("wheel", (e) => changeChannel(e.deltaY > 0 ? 1 : -1), { passive: true });

function setOpacity(value) {
  const opacity = Math.round(Math.min(1, Math.max(0.25, value)) * 100) / 100;
  if (opacity === state.opacity) return;
  state.opacity = opacity;
  render();
  osd(`OPAC ${"▮".repeat(Math.round(opacity * 10))}${"▯".repeat(10 - Math.round(opacity * 10))}`);
  clearTimeout(setOpacity.save);
  setOpacity.save = setTimeout(() => set({ opacity }), 300);
}

$("dim").addEventListener("wheel", (e) => setOpacity(state.opacity + (e.deltaY > 0 ? -0.05 : 0.05)), { passive: true });
$("dim").addEventListener("pointerdown", (e) => {
  const knob = e.currentTarget;
  knob.setPointerCapture(e.pointerId);
  const move = (ev) => setOpacity(state.opacity - ev.movementY / 150);
  knob.addEventListener("pointermove", move);
  knob.addEventListener("pointerup", () => knob.removeEventListener("pointermove", move), { once: true });
});

const actions = {
  pin: () => { osd(state.pinned ? "UNPINNED" : "PINNED ★ ALL WS"); return set({ pinned: !state.pinned }); },
  ghost: () => { osd(state.ghost ? "GHOST OFF" : "GHOST ON"); return set({ ghost: !state.ghost }); },
  fx: () => set({ fx: !state.fx }),
  mute: () => { plex.setAudioMuted(!state.muted); osd(state.muted ? "SOUND ON" : "MUTE"); return set({ muted: !state.muted }); },
  home: () => { burst(600); plex.loadURL(state.url); },
  size: () => { const size = SIZE_ORDER[(SIZE_ORDER.indexOf(state.size) + 1) % 3]; osd(`SIZE ${size}`); wiggle(); return set({ size }); },
  corner: async () => { wiggle(); state = await window.tv.cycleCorner(); render(); },
  bare: () => { burst(350); return set({ bare: !state.bare }); },
  power: () => {
    body.classList.add("off");
    setTimeout(() => window.tv.quit(), 600);
  },
};

for (const id of ["pin", "ghost", "fx", "mute", "home", "size", "corner", "bare", "power"]) {
  $(id).addEventListener("click", actions[id]);
}
document.querySelectorAll("#remote .rb").forEach((b) => b.addEventListener("click", () => actions[b.dataset.act]()));

// ---------- ghost mode ----------
window.tv.onFocus((focused) => body.classList.toggle("ghosted", state.ghost && !focused));

// ---------- plex webview ----------
let booted = false;
plex.addEventListener("did-start-loading", () => { if (booted) burst(400); });
plex.addEventListener("dom-ready", () => {
  if (state.muted) plex.setAudioMuted(true);
  requestAnimationFrame(fit);
  if (!booted) {
    booted = true;
    fit();
    burst(500);
    setTimeout(() => body.classList.remove("booting"), 900);
  }
});

// The speaker grille thumps along while something is playing.
setInterval(async () => {
  if (!booted) return;
  try {
    const playing = await plex.executeJavaScript(
      "[...document.querySelectorAll('video,audio')].some(m => !m.paused && !m.ended)"
    );
    body.classList.toggle("playing", playing);
  } catch {}
}, 1500);

// ---------- fit to window size ----------
// Scale the control panel with the cabinet and shrink Plex's UI on small tubes.
function fit() {
  const panelRoom = window.innerHeight - 60 - 14 - 32;
  body.style.setProperty("--pz", Math.min(1.25, Math.max(0.55, panelRoom / 330)).toFixed(3));
  const screen = document.querySelector(".screen").clientWidth;
  if (booted) plex.setZoomFactor(Math.min(1, Math.max(0.6, screen / 640)));
}
window.addEventListener("resize", fit);

// ---------- boot ----------
(async () => {
  ({ state, theme } = await window.tv.init());
  render();
  fit();
  window.tv.onTheme((colors) => {
    theme = colors;
    if (state.skin !== "omarchy") return;
    burst(700);
    wiggle();
    osd(`THEME ${(colors.name || "").toUpperCase()}`);
    applySkin();
  });
  plex.src = state.url;
  // Failsafe: never leave the tube dark if Plex is slow to answer.
  setTimeout(() => body.classList.remove("booting"), 4000);
})();
