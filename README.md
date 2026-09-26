<p align="center">
  <img src="docs/demo.gif" alt="omaplex flipping through its channels while Big Buck Bunny plays" width="720">
</p>

<h1 align="center">omaplex</h1>

<p align="center">
  <b>A funky floating CRT television for Plex on <a href="https://omarchy.org">Omarchy</a>.</b><br>
  It hovers over your tiling grid, follows you across workspaces, and wears your theme.
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-ff71ce?labelColor=0C0D11">
  <img alt="Omarchy" src="https://img.shields.io/badge/omarchy-lua%20config-01f9ff?labelColor=0C0D11">
  <img alt="Hyprland" src="https://img.shields.io/badge/hyprland-0.56%2B-fffb96?labelColor=0C0D11">
  <img alt="GitHub stars" src="https://img.shields.io/github/stars/aplaceforallmystuff/omaplex?style=flat&color=05ffa1&labelColor=0C0D11">
</p>

Tiling window managers are great until you want something on in the corner.
omaplex puts Plex in a little TV set that never takes a tile: rabbit ears,
chunky knobs, scanlines, static between channels and a CRT switch-off when
you power down. Think [Afloat](https://afloat.en.softonic.com/mac) for
Hyprland, with more wood grain.

![omaplex floating over a tiled Omarchy desktop](docs/hero.png)

## Install

Needs Omarchy with the Lua Hyprland config (Hyprland 0.56+), plus `git`, `jq` and `npm`
(`omarchy pkg add nodejs npm` if you don't have them).

```sh
curl -fsSL https://raw.githubusercontent.com/aplaceforallmystuff/omaplex/main/install.sh | bash
```

Or from a checkout (read `install.sh` first, it's short):

```sh
git clone https://github.com/aplaceforallmystuff/omaplex && cd omaplex && ./install.sh
```

Then press <kbd>Super</kbd> + <kbd>Alt</kbd> + <kbd>P</kbd>, sign in to Plex once, and you're watching.
Pick a different key with `OMAPLEX_KEY="SUPER + SHIFT + T" ./install.sh`, or `OMAPLEX_KEY=none` for no binding.
The installer skips the binding if the key is already taken.

## Keys & commands

| Key / command | Action |
|---|---|
| <kbd>Super</kbd> + <kbd>Alt</kbd> + <kbd>P</kbd> | Turn on, then toggle between stashed (keeps playing) and on screen |
| `omaplex` | Launch, or focus the TV if it's already on |
| `omaplex toggle` | Same as the keybinding |
| `omaplex reload-theme` | Repaint from the current Omarchy theme (the theme hook runs this for you) |
| <kbd>Super</kbd> + drag | Move (or grab the cabinet or antennas) |
| <kbd>Super</kbd> + right-drag | Resize freely |

## The controls

| Control | What it does |
|---|---|
| **CH** knob | Click, scroll or right-click to change channel (the TV's skin) |
| **OPAC** knob | Scroll or drag to fade the whole set from 25 to 100% |
| **PIN** | Show on every workspace (Hyprland `pin`) |
| **GHOST** | Fade right down whenever the TV isn't focused |
| **SIZE** | Small / medium / large |
| **MOVE** | Hop to the next screen corner |
| **FX** | Scanlines, vignette and glass glare |
| **MUTE** · **HOME** | Mute Plex · back to the Plex home screen |
| **BARE** | Lose the cabinet: a clean 16:9 screen with a slim remote strip |
| ⏻ | CRT switch-off, then quit |

The speaker grille thumps while something's playing.

## Channels

![The six channels: your theme, walnut, atomic, vapor, noir and sunburst](docs/channels.png)

## It wears your theme

Channel 1 builds the cabinet, panel, knobs, antennas and on-screen text from your
current Omarchy theme's `colors.toml`. When you run `omarchy theme set`, a
`theme-set` hook repaints it (with a burst of static) without restarting.

![The theme channel in Catppuccin, Everforest, Gruvbox, Retro 82, Rose Pine and Tokyo Night](docs/themes.png)

## Bare mode

![Bare mode: just the screen and a slim remote strip](docs/bare.png)

## Files it touches

| Path | What |
|---|---|
| `~/.config/hypr/omaplex.lua` | Window rule (float, pin, no border/shadow/blur) and the keybinding. Owned by omaplex |
| `~/.config/hypr/hyprland.lua` | One line appended, ending in `-- omaplex`, that loads the file above via `require_optional` (backed up first) |
| `~/.config/omarchy/hooks/theme-set.d/omaplex` | Theme hook, installed with `omarchy hook install` |
| `~/.local/bin/omaplex` | Launcher symlink |
| `~/.local/share/applications/omaplex.desktop` | Launcher entry |
| `~/.config/omaplex/` | Your settings (`state.json`) and Plex login |

Want it in the Omarchy menu too? Add this to `~/.config/omarchy/extensions/omarchy-menu.jsonc`:

```jsonc
"omaplex": { "icon": "󰔂", "label": "Plex TV", "action": "omaplex toggle" }
```

## Config

`~/.config/omaplex/state.json` holds everything the knobs set. To go straight to
your own server instead of app.plex.tv, set `"url"`, for example `"http://my-server:32400/web"`.

## Uninstall

```sh
~/.local/share/omaplex/install.sh --uninstall   # or ./install.sh --uninstall from your checkout
```

This removes everything in the table above except `~/.config/omaplex`.

## Known limits

- Built for Omarchy/Hyprland only. It drives the window with `hyprctl` and relies on Omarchy's Lua config.
- It's Electron, so expect ~250 MB of RAM. Your own Plex media plays fine; DRM-protected streams may not, because stock Electron ships without Widevine.
- Stashing keeps playback going. Pause first if you want silence.

## Screenshots

Everything in `docs/` is generated by `npm run capture`. It runs an isolated
instance (separate profile, no Plex login) that plays
[Big Buck Bunny](https://peach.blender.org/) instead of a real library, then
composites the shots.

## Credits

- Demo footage: *Big Buck Bunny* © Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- Fonts: [Monoton](https://fonts.google.com/specimen/Monoton) and [Righteous](https://fonts.google.com/specimen/Righteous) (SIL OFL).

omaplex is an independent project and is not affiliated with or endorsed by Plex, Inc.
It's a window onto Plex's own web app; you'll need a Plex account.

## License

[MIT](LICENSE)
