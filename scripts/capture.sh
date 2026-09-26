#!/usr/bin/env bash
# Regenerate README/social media: runs an isolated omaplex instance (no access to
# your real Plex login), captures each channel + bare mode + a channel-flip clip,
# then composites them onto theme-coloured backdrops in docs/.
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)"
# The screen shows Big Buck Bunny (CC BY 3.0, Blender Foundation) rather than a
# real Plex library, so no personal media, accounts or ads end up in the shots.
video="${XDG_CACHE_HOME:-$HOME/.cache}/omaplex/big_buck_bunny_720p.mp4"
if [[ ! -f $video ]]; then
  mkdir -p "$(dirname "$video")"
  curl -fL -o "$video" https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4
fi
url="file://$dir/demo/screen.html?src=file://$video&t=75"
if [[ -n ${OMAPLEX_CAPTURE_WORK:-} ]]; then
  work="$OMAPLEX_CAPTURE_WORK"   # keep the raw captures around
else
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
fi

mkdir -p "$work/profile" "$dir/docs"
cat > "$work/profile/state.json" <<JSON
{ "url": "$url", "skin": "omarchy", "size": "L", "corner": "bl", "pinned": false, "fx": true }
JSON

OMAPLEX_PROFILE="$work/profile" OMAPLEX_CAPTURE="$work/out" \
  "$dir/node_modules/.bin/electron" "$dir" --class=omaplex --ozone-platform=wayland

python3 "$dir/scripts/compose.py" "$work/out" "$dir/docs"
