// Screenshot/recording mode for the README and socials (see scripts/capture.sh).
// Drives the renderer through each channel and bare mode, saving transparent PNGs,
// then records a burst of frames while flipping channels.
const fs = require("node:fs");
const path = require("node:path");

// Channel -> moment in the demo film (Big Buck Bunny) to freeze on.
const SHOTS = { omarchy: 75, walnut: 250, atomic: 95, vapor: 330, noir: 370, sunburst: 180 };
// Stock Omarchy themes to show the theme-following channel in.
const THEMES = ["tokyo-night", "catppuccin", "gruvbox", "rose-pine", "everforest", "retro-82"];
const THEME_ROOT = process.env.OMARCHY_PATH ? path.join(process.env.OMARCHY_PATH, "themes") : "/usr/share/omarchy/themes";

function themeColors(name) {
  const colors = { name };
  const toml = fs.readFileSync(path.join(THEME_ROOT, name, "colors.toml"), "utf8");
  for (const [, key, value] of toml.matchAll(/^\s*(\w+)\s*=\s*"([^"]+)"/gm)) colors[key] = value;
  return colors;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function capture(win, outDir) {
  fs.mkdirSync(path.join(outDir, "frames"), { recursive: true });
  const run = (js) => win.webContents.executeJavaScript(js);
  const seek = (t, pause = true) => run(`plex.executeJavaScript("window.seek && seek(${t}, ${pause})")`);
  const shot = async (file) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, file), img.toPNG());
    console.log("captured", file);
  };

  // Let Plex finish loading and the power-on animation play out.
  await wait(Number(process.env.OMAPLEX_CAPTURE_SETTLE || 5000));

  for (const [skin, t] of Object.entries(SHOTS)) {
    await seek(t);
    await run(`set({ skin: "${skin}", bare: false })`);
    await wait(1400);
    await shot(`skin-${skin}.png`);
  }

  await run(`set({ skin: "omarchy", bare: false })`);
  const ownTheme = await run("theme");
  for (const [i, name] of THEMES.entries()) {
    if (!fs.existsSync(path.join(THEME_ROOT, name, "colors.toml"))) continue;
    await seek([75, 95, 180, 250, 370, 330][i]);
    await run(`theme = ${JSON.stringify(themeColors(name))}; applySkin()`);
    await wait(900);
    await shot(`theme-${name}.png`);
  }
  await seek(215);
  await run(`theme = ${JSON.stringify(themeColors("catppuccin"))}; set({ skin: "omarchy", bare: true })`);
  await wait(2000);
  await shot("bare.png");
  await run(`theme = ${JSON.stringify(ownTheme)}; applySkin()`);

  await run(`set({ skin: "omarchy", bare: false })`);
  await seek(62, false);
  await wait(2000);

  // Stream painted frames (raw BGRA) for 9s while flipping channels; compose.py
  // turns them into the GIF/MP4. capturePage() is far too slow for this.
  const frames = [];
  let size;
  let last = 0;
  win.webContents.beginFrameSubscription(false, (image) => {
    const now = Date.now();
    if (now - last < 33) return;
    last = now;
    size = image.getSize();
    frames.push({ t: now, buf: image.toBitmap() });
  });
  const started = Date.now();
  for (let flip = 900; flip < 9000; flip += 1300) {
    await wait(started + flip - Date.now());
    run("changeChannel(1)");
  }
  await wait(started + 9000 - Date.now());
  win.webContents.endFrameSubscription();

  // Re-time onto a fixed 25fps grid, repeating frames when nothing repainted.
  const fps = 25;
  let n = 0;
  for (let i = 0, t = frames[0].t; t < frames.at(-1).t; t += 1000 / fps) {
    while (i + 1 < frames.length && frames[i + 1].t <= t) i++;
    fs.writeFileSync(path.join(outDir, "frames", `f${String(n++).padStart(4, "0")}.bgra`), frames[i].buf);
  }
  fs.writeFileSync(path.join(outDir, "frames", "meta.json"), JSON.stringify({ ...size, fps, count: n }));
  console.log("frames", n, "from", frames.length, "paints");

  await run(`set({ skin: "omarchy", bare: false })`);
  process.exit(0);
};
