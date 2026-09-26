#!/usr/bin/env bash
# omaplex installer for Omarchy (Lua Hyprland config, Omarchy 3.x "Quattro"+).
#
#   ./install.sh               install from this checkout
#   curl -fsSL https://raw.githubusercontent.com/squatchware/omaplex/main/install.sh | bash
#                              clone to ~/.local/share/omaplex and install
#   ./install.sh --uninstall   remove everything except your settings (~/.config/omaplex)
#   ./install.sh --integrate   only the Hyprland rule, keybinding and theme hook, for an
#                              omaplex installed some other way (e.g. the Arch package runs
#                              this as `omaplex setup`)
#
# Environment:
#   OMAPLEX_KEY="SUPER + ALT + P"   keybinding for `omaplex toggle` ("none" to skip)
set -euo pipefail

REPO="https://github.com/squatchware/omaplex.git"
KEY="${OMAPLEX_KEY:-SUPER + ALT + P}"

HYPR="$HOME/.config/hypr"
MODULE="$HYPR/omaplex.lua"
REQUIRE='require("default.hypr.require_optional").module("hypr.omaplex") -- omaplex'
BIN="$HOME/.local/bin/omaplex"
DESKTOP="$HOME/.local/share/applications/omaplex.desktop"
HOOK="$HOME/.config/omarchy/hooks/theme-set.d/omaplex"
CLONE="$HOME/.local/share/omaplex"

say() { printf '\033[1;35m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

backup() { [[ -f $1 ]] && cp "$1" "$1.bak.$(date +%Y%m%d-%H%M%S)"; }

uninstall() {
  say "Removing omaplex integration"
  rm -f "$MODULE" "$DESKTOP" "$HOOK"
  [[ -L $BIN ]] && rm -f "$BIN"   # only our symlink, never a packaged /usr/bin copy
  if grep -qF -- "-- omaplex" "$HYPR/hyprland.lua" 2>/dev/null; then
    backup "$HYPR/hyprland.lua"
    sed -i '/-- omaplex$/d' "$HYPR/hyprland.lua"
  fi
  hyprctl reload >/dev/null 2>&1 || true
  [[ -d $CLONE/.git ]] && rm -rf "$CLONE" && say "Removed $CLONE"
  say "Done. Your settings and Plex login in ~/.config/omaplex were kept."
}

mode="${1:-}"
[[ $mode == --uninstall ]] && { uninstall; exit 0; }

# ---------- preflight ----------
command -v hyprctl >/dev/null || die "Hyprland not found. omaplex is built for Omarchy/Hyprland."
[[ -f $HYPR/hyprland.lua ]] || die "No ~/.config/hypr/hyprland.lua. omaplex needs Omarchy's Lua Hyprland config."
needs="jq"
[[ $mode == --integrate ]] || needs="git jq npm"
for cmd in $needs; do
  command -v "$cmd" >/dev/null || die "Missing '$cmd'. Try: omarchy pkg add ${cmd/npm/nodejs npm}"
done

if [[ $mode == --integrate ]]; then
  BIN="$(command -v omaplex || true)"
  [[ -n $BIN ]] || die "omaplex isn't on your PATH."
else
  # ---------- source ----------
  here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
  if [[ -n $here && -f $here/package.json && -f $here/src/main.js ]]; then
    dir="$here"
  else
    if [[ -d $CLONE/.git ]]; then
      say "Updating $CLONE"
      git -C "$CLONE" pull --ff-only
    else
      say "Cloning into $CLONE"
      git clone --depth 1 "$REPO" "$CLONE"
    fi
    dir="$CLONE"
  fi

  say "Installing Electron (npm)"
  (cd "$dir" && npm install --no-audit --no-fund --loglevel=error)

  # ---------- launcher + desktop entry ----------
  mkdir -p "$(dirname "$BIN")" "$(dirname "$DESKTOP")"
  ln -sf "$dir/bin/omaplex" "$BIN"
  cat >"$DESKTOP" <<EOF
[Desktop Entry]
Name=Omaplex
Comment=Floating CRT TV for Plex
Exec=$BIN toggle
Icon=tv
Terminal=false
Type=Application
Categories=AudioVideo;Video;Player;
StartupWMClass=omaplex
EOF
fi

# ---------- Hyprland ----------
bind=""
if [[ $KEY != none ]]; then
  normalized="$(tr -d ' ' <<<"$KEY" | tr '[:lower:]' '[:upper:]')"
  taken="$(omarchy menu keybindings --print 2>/dev/null | awk -F'→' '{print $1}' | tr -d ' ' | tr '[:lower:]' '[:upper:]' |
    awk -v k="$normalized" 'BEGIN{split(k,a,"+"); n=asort(a)} {m=split($0,b,/\+/); if (m!=n) next; asort(b); same=1; for(i=1;i<=n;i++) if(a[i]!=b[i]) same=0; if(same) print}')"
  if [[ -n $taken ]] && ! grep -q "omaplex" "$MODULE" 2>/dev/null; then
    say "Keybinding $KEY is already used; skipping it (set OMAPLEX_KEY to choose another)."
  else
    bind="o.bind(\"$KEY\", \"Plex TV (omaplex)\", \"$BIN toggle\")"
  fi
fi

cat >"$MODULE" <<EOF
-- omaplex: floating CRT TV for Plex. Managed by omaplex's install.sh;
-- remove with \`install.sh --uninstall\`. Loaded from hyprland.lua via require_optional.

-- Float above the tiling grid on every workspace. No border/shadow/blur so the
-- transparent cabinet shape shows; the app handles opacity and placement itself.
o.window("^omaplex$", {
  tag = "-default-opacity",
  float = true,
  pin = true,
  size = { 600, 470 },
  move = { "(monitor_w-window_w-24)", "(monitor_h*0.06)" },
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_blur = true,
  no_dim = true,
  opacity = "1 1",
  animation = "popin 70%",
})

${bind}
EOF

if ! grep -qF "$REQUIRE" "$HYPR/hyprland.lua"; then
  backup "$HYPR/hyprland.lua"
  printf '\n%s\n' "$REQUIRE" >>"$HYPR/hyprland.lua"
fi

if [[ $(hyprctl reload 2>&1) == ok ]] && [[ -z $(hyprctl configerrors 2>/dev/null | tr -d '[:space:]') ]]; then
  say "Hyprland rules loaded ($MODULE)"
else
  rm -f "$MODULE"
  hyprctl reload >/dev/null 2>&1 || true
  die "Hyprland reported config errors; rolled back $MODULE. Run: hyprctl configerrors"
fi

# ---------- theme hook ----------
tmp="$(mktemp -d)"
printf '#!/bin/bash\n# Repaint omaplex when the Omarchy theme changes.\n"%s" reload-theme >/dev/null 2>&1 &\n' "$BIN" >"$tmp/omaplex"
if command -v omarchy >/dev/null; then
  omarchy hook install theme-set "$tmp/omaplex" >/dev/null
else
  mkdir -p "$(dirname "$HOOK")" && install -m 755 "$tmp/omaplex" "$HOOK"
fi
rm -rf "$tmp"
say "Theme hook installed ($HOOK)"

say "Installed. Launch with: omaplex${bind:+  (or $KEY)}"
