# Contributing

Issues and PRs welcome, especially new channels (skins).

- `npm install && npm start` runs the TV from your checkout.
- Skins are CSS variable sets in `src/style.css` (`body.skin-<name>`) plus an entry in `SKINS` in `src/renderer.js` (and `SHOTS` in `src/capture.js` if you regenerate screenshots).
- Hyprland is driven through `hyprctl dispatch 'hl.dsp…'` in `src/main.js`; keep window matching by pid.
- Regenerate `docs/` with `npm run capture` (runs an isolated profile; needs Hyprland, ffmpeg, Python + Pillow).
- Match the existing style: small files, no build step, comments only where the why isn't obvious.
