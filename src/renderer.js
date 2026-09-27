const SKINS = ["omarchy", "walnut", "atomic", "vapor", "noir", "sunburst"];
const SIZE_ORDER = ["S", "M", "L"];
const body = document.body;
const plex = document.getElementById("plex");
const $ = (id) => document.getElementById(id);

let state;
let theme = {};
let volume = 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  $("vol").classList.toggle("muted", state.muted);
  $("vol").style.setProperty("--rot", `${-135 + volume * 270}deg`);
  $("vol-label").textContent = state.muted ? "MUTE" : "VOL";
  document.querySelector('.rb[data-act="mute"]').classList.toggle("on", state.muted);
  $("bare").classList.toggle("on", state.bare);
  $("away").classList.toggle("on", state.away);
  $("size").textContent = `SIZE ${state.size}`;
  document.querySelector('.rb[data-act="pin"]').classList.toggle("on", state.pinned);
}

async function set(patch) {
  state = await window.tv.set(patch);
  render();
  if ("profile" in patch) syncPicker();
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
function osd(text, ms = 1400) {
  const el = $("osd");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => el.classList.remove("show"), ms);
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
  osd(`OPAC ${bars(opacity)}`);
  clearTimeout(setOpacity.save);
  setOpacity.save = setTimeout(() => set({ opacity }), 300);
}

function bars(value) {
  const n = Math.round(value * 10);
  return "▮".repeat(n) + "▯".repeat(10 - n);
}

// Scroll or drag a knob to turn it; a click without a drag still reaches onclick.
function knob(el, get, turn) {
  el.addEventListener("wheel", (e) => turn(get() + (e.deltaY > 0 ? -0.05 : 0.05)), { passive: true });
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    el.dragged = false;
    const move = (ev) => {
      if (!ev.movementY) return;
      el.dragged = true;
      turn(get() - ev.movementY / 150);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", () => el.removeEventListener("pointermove", move), { once: true });
  });
}

knob($("dim"), () => state.opacity, setOpacity);
knob($("vol"), () => volume, async (value) => {
  const status = await media("volume", Math.round(Math.min(1, Math.max(0, value)) * 100) / 100);
  if (!status) return osd("NO SIGNAL");
  volume = status.volume;
  render();
  osd(`VOL ${bars(volume)}`);
});

const actions = {
  pin: () => { osd(state.pinned ? "UNPINNED" : "PINNED ★ ALL WS"); return set({ pinned: !state.pinned }); },
  away: () => { osd(state.away ? "AWAY OFF" : "AWAY: PAUSE WHEN STASHED"); return set({ away: !state.away }); },
  ghost: () => { osd(state.ghost ? "GHOST OFF" : "GHOST ON"); return set({ ghost: !state.ghost }); },
  fx: () => set({ fx: !state.fx }),
  mute: () => { plex.setAudioMuted(!state.muted); osd(state.muted ? "SOUND ON" : "MUTE"); return set({ muted: !state.muted }); },
  play: () => transport("toggle"),
  back: () => transport("seekbackward"),
  fwd: () => transport("seekforward"),
  home: () => { burst(600); plex.loadURL(state.url); },
  size: () => { const size = SIZE_ORDER[(SIZE_ORDER.indexOf(state.size) + 1) % 3]; osd(`SIZE ${size}`); wiggle(); return set({ size }); },
  corner: async () => { wiggle(); state = await window.tv.cycleCorner(); render(); },
  bare: () => { burst(350); return set({ bare: !state.bare }); },
  power: () => {
    body.classList.add("off");
    setTimeout(() => window.tv.quit(), 600);
  },
};

for (const id of ["pin", "ghost", "fx", "home", "size", "corner", "bare", "away", "play", "back", "fwd", "power"]) {
  $(id).addEventListener("click", actions[id]);
}
$("vol").addEventListener("click", () => { if (!$("vol").dragged) actions.mute(); });
document.querySelectorAll("#remote .rb").forEach((b) => b.addEventListener("click", () => actions[b.dataset.act]()));
// Right-click the skip buttons to jump a whole item instead.
for (const [el, action] of [...document.querySelectorAll('#back, .rb[data-act="back"]')].map((el) => [el, "previoustrack"])
  .concat([...document.querySelectorAll('#fwd, .rb[data-act="fwd"]')].map((el) => [el, "nexttrack"]))) {
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); transport(action); });
}

// ---------- ghost mode ----------
window.tv.onFocus((focused) => body.classList.toggle("ghosted", state.ghost && !focused));

// ---------- plex webview ----------
let booted = false;
plex.addEventListener("did-start-loading", () => { if (booted) burst(400); });
plex.addEventListener("dom-ready", () => {
  if (state.muted) plex.setAudioMuted(true);
  plex.executeJavaScript(MEDIA_HOOK).catch(() => {});
  plex.executeJavaScript(PICKER_HOOK).then(syncPicker, () => {});
  pickProfile();
  requestAnimationFrame(fit);
  if (!booted) {
    booted = true;
    fit();
    burst(500);
    setTimeout(() => body.classList.remove("booting"), 900);
  }
});

// ---------- playback ----------
// Installed into Plex on every page load. It drives whatever <video>/<audio> is
// loaded, preferring the Media Session handlers Plex registers for the MPRIS
// media keys (captured by wrapping setActionHandler) so Plex's own player logic
// does the seeking and track changes.
const MEDIA_HOOK = `(() => {
  if (window.__omaplex) return;
  const handlers = {};
  const session = navigator.mediaSession;
  const setActionHandler = session.setActionHandler.bind(session);
  session.setActionHandler = (action, fn) => { handlers[action] = fn; return setActionHandler(action, fn); };
  const media = () => {
    const all = [...document.querySelectorAll("video, audio")].filter((m) => m.currentSrc);
    return all.find((m) => !m.paused) || all[0];
  };
  const SKIP = { seekbackward: -10, seekforward: 30 };
  window.__omaplex = (cmd, arg) => {
    const m = media();
    if (!m) return null;
    const was = !m.paused && !m.ended;
    let ok = true;
    if (cmd === "play" || cmd === "pause") {
      handlers[cmd] ? handlers[cmd]({ action: cmd }) : m[cmd]();
    } else if (cmd === "toggle") {
      const action = m.paused ? "play" : "pause";
      handlers[action] ? handlers[action]({ action }) : m.paused ? m.play() : m.pause();
    } else if (cmd in SKIP) {
      if (handlers[cmd]) handlers[cmd]({ action: cmd, seekOffset: Math.abs(SKIP[cmd]) });
      else m.currentTime = Math.max(0, Math.min(m.duration || Infinity, m.currentTime + SKIP[cmd]));
    } else if (cmd === "volume") {
      m.volume = arg;
    } else if (cmd === "nexttrack" || cmd === "previoustrack") {
      ok = !!handlers[cmd];
      if (ok) handlers[cmd]({ action: cmd });
    }
    const md = session.metadata;
    const title = md ? [md.artist, md.title].filter(Boolean).join(" · ") : "";
    return { ok, was, playing: !m.paused && !m.ended, volume: m.volume, title };
  };
})()`;

async function media(cmd, arg) {
  if (!booted) return null;
  try {
    return await plex.executeJavaScript(`window.__omaplex && __omaplex(${JSON.stringify(cmd)}, ${JSON.stringify(arg ?? null)})`);
  } catch {
    return null;
  }
}

const TRANSPORT_OSD = { seekbackward: "◀◀ 10", seekforward: "30 ▶▶", previoustrack: "◀◀ PREV", nexttrack: "NEXT ▶▶" };
async function transport(cmd) {
  const status = await media(cmd);
  if (!status) return osd("NO SIGNAL");
  if (!status.ok) return osd(cmd === "nexttrack" ? "NO NEXT" : "NO PREV");
  if (cmd === "previoustrack" || cmd === "nexttrack") burst(300);
  osd(cmd === "toggle" ? (status.was ? "❚❚ PAUSE" : "▶ PLAY") : TRANSPORT_OSD[cmd]);
}

// Keep the play state and VOL knob in step with Plex, and caption each new
// title like an old set changing programme. The speaker grille thumps along
// while something is playing.
let nowPlaying = "";
setInterval(async () => {
  const status = await media("status");
  body.classList.toggle("playing", !!status?.playing);
  const title = status?.title || "";
  if (title !== nowPlaying) {
    nowPlaying = title;
    if (title) osd(`▶ ${title.toUpperCase()}`, 4000);
  }
  if (status && status.volume !== volume) {
    volume = status.volume;
    render();
  }
}, 1500);

// ---------- auto profile ----------
// A Plex Home account opens on "Select User" at every full page load. Pick the
// pinned profile so the TV boots straight in. Profiles are pinned with the pin
// button omaplex adds to each tile on that screen (or `omaplex profile`).

// Installed into Plex: puts a pin on every profile tile whenever the picker is on
// screen (including Plex's own "Switch User"). Clicks are reported back through
// the console, which the TV listens to.
const PICKER_HOOK = `(() => {
  if (window.__omaplexPicker) return;
  window.__omaplexPicker = true;
  const nameOf = (tile) => tile.querySelector(".username")?.textContent.trim() || "";
  const paint = () => {
    for (const tile of document.querySelectorAll(".user-select-container.loaded")) {
      let pin = tile.querySelector(".omaplex-pin");
      if (!pin) {
        pin = document.createElement("button");
        pin.className = "omaplex-pin";
        pin.textContent = "📌";
        pin.style.cssText = "position:absolute;top:4px;right:4px;z-index:5;width:30px;height:30px;border:none;border-radius:50%;" +
          "font-size:15px;line-height:30px;padding:0;cursor:pointer;transition:opacity .2s,filter .2s,background .2s";
        pin.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const locked = !!tile.querySelector(".protected-icon:not(.hidden)");
          console.log("omaplex:pin-profile:" + JSON.stringify({ name: nameOf(tile), locked }));
        }, true);
        if (getComputedStyle(tile).position === "static") tile.style.position = "relative";
        tile.appendChild(pin);
      }
      const on = nameOf(tile).toLowerCase() === (window.__omaplexProfile || "").toLowerCase();
      pin.title = on ? "omaplex boots as " + nameOf(tile) + " (click to stop)" : "Always boot omaplex as " + nameOf(tile);
      pin.style.opacity = on ? "1" : "0.45";
      pin.style.filter = on ? "none" : "grayscale(1)";
      pin.style.background = on ? "#e5a00d" : "rgba(0,0,0,.45)";
    }
  };
  window.__omaplexPaintPicker = paint;
  // Tiles get their "loaded" class after they're inserted, so watch classes too.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; paint(); });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  paint();
})()`;

function syncPicker() {
  const js = `window.__omaplexProfile = ${JSON.stringify(state.profile || "")}; window.__omaplexPaintPicker?.()`;
  plex.executeJavaScript(js).catch(() => {});
}

plex.addEventListener("console-message", (e) => {
  const prefix = "omaplex:pin-profile:";
  if (!e.message?.startsWith(prefix)) return;
  let tile;
  try {
    tile = JSON.parse(e.message.slice(prefix.length));
  } catch {
    return;
  }
  if (!tile.name) return;
  if (tile.name.toLowerCase() === (state.profile || "").toLowerCase()) return pinProfile("", "");
  if (tile.locked) return askPin(tile.name);
  pinProfile(tile.name, "");
});

async function pinProfile(profile, pin) {
  await set({ profile, pin });
  osd(profile ? `★ ${profile.toUpperCase()}` : "PICKER ON");
}

// A PIN-protected profile needs its PIN to be picked hands-free.
function askPin(name) {
  const form = $("pin-prompt");
  const input = form.querySelector("input");
  form.querySelector("span").textContent = `PIN FOR ${name.toUpperCase()}`;
  input.value = "";
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(input.value)) return input.select();
    form.classList.remove("show");
    pinProfile(name, input.value);
  };
  input.onkeydown = (e) => { if (e.key === "Escape") form.classList.remove("show"); };
  form.classList.add("show");
  input.focus();
}

let profileRun = 0;
async function pickProfile() {
  const run = ++profileRun;
  if (!state.profile) return;
  const name = JSON.stringify(state.profile.trim().toLowerCase());
  // Plex may take a while to draw the picker, or never show it (single user).
  for (let i = 0; i < 40 && run === profileRun; i++) {
    await sleep(500);
    let result;
    try {
      result = await plex.executeJavaScript(`(() => {
        const tiles = [...document.querySelectorAll(".user-select-container.loaded")];
        if (!tiles.length) return "";
        const tile = tiles.find((t) => t.querySelector(".username")?.textContent.trim().toLowerCase() === ${name});
        if (!tile) return "missing";
        tile.click();
        return tile.querySelector(".protected-icon:not(.hidden)") ? "pin" : "picked";
      })()`);
    } catch {
      return;
    }
    if (!result) continue;
    if (result === "missing" && i < 6) continue; // tiles are still loading
    if (result === "missing") return osd(`NO PROFILE ${state.profile.toUpperCase()}`);
    if (result === "pin" && state.pin) await typePin();
    return;
  }
}

async function typePin() {
  await sleep(700);
  plex.focus();
  for (const keyCode of String(state.pin)) {
    for (const type of ["keyDown", "char", "keyUp"]) plex.sendInputEvent({ type, keyCode });
    await sleep(90);
  }
}

// ---------- fit to window size ----------
// Scale the control panel with the cabinet and shrink Plex's UI on small tubes.
function fit() {
  const panelRoom = window.innerHeight - 60 - 14 - 32;
  body.style.setProperty("--pz", Math.min(1.25, Math.max(0.55, panelRoom / 420)).toFixed(3));
  const screen = document.querySelector(".screen").clientWidth;
  if (booted) plex.setZoomFactor(Math.min(1, Math.max(0.6, screen / 640)));
}
window.addEventListener("resize", fit);

// ---------- boot ----------
(async () => {
  ({ state, theme } = await window.tv.init());
  render();
  fit();
  window.tv.onState((next) => { state = next; render(); syncPicker(); });
  // `omaplex play-pause` and friends, forwarded by the launcher.
  const COMMANDS = { "play-pause": "toggle", next: "nexttrack", previous: "previoustrack", forward: "seekforward", back: "seekbackward" };
  window.tv.onMedia((cmd) => COMMANDS[cmd] && transport(COMMANDS[cmd]));
  // AWAY: pause when stashed, and resume only what we paused.
  let pausedAway = false;
  window.tv.onStashed(async (stashed) => {
    if (stashed) {
      pausedAway = false;
      if (!state.away || !(await media("status"))?.playing) return;
      pausedAway = !!(await media("pause"));
    } else if (pausedAway) {
      pausedAway = false;
      await media("play");
      osd("▶ WELCOME BACK");
    }
  });
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
