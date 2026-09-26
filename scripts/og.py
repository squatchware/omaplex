#!/usr/bin/env python3
"""Render the squatchware.dev/omaplex/ social card (1280x640) in the Squatchware card style:
pixel wordmark with hard offset shadows, the squatch, and the TV itself.

    python3 scripts/og.py <transparent-tv.png> [out.png]

The TV is a raw capture from `npm run capture` (set OMAPLEX_CAPTURE_WORK to keep them).
Needs Pillow and a squatchware.dev checkout (SQUATCHWARE_SITE, default ~/Dev/squatchware.dev)
for the sprite and pixel font. Writes to that site's public/omaplex/og.png by default.
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SITE = Path(os.environ.get("SQUATCHWARE_SITE", Path.home() / "Dev/squatchware.dev"))
BRAND = SITE / "brand"
sys.path.insert(0, str(BRAND))
from sprite import png  # noqa: E402

NIGHT, PINE, FOREST = (15, 26, 20), (24, 56, 38), (36, 83, 51)
GOLD, ORANGE, PARCH, MUTED, TEAL = (212, 168, 50), (212, 114, 42), (244, 228, 188), (171, 158, 123), (43, 139, 126)
PIXEL = str(SITE / "public/fonts/press-start-2p.woff2")
MONO = "/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Regular.ttf"

W, H = 1280, 640
img = Image.new("RGBA", (W, H), NIGHT)
d = ImageDraw.Draw(img)

# Sky gradient and a treeline, as on the site.
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip((10, 18, 14), (27, 51, 37))))
for x in range(0, W, 64):
    d.polygon([(x, H - 40), (x + 32, H - 110), (x + 64, H - 40)], fill=PINE)
d.rectangle([0, H - 40, W, H], fill=PINE)


def pixel_text(xy, text, size, face=GOLD, shadow=ORANGE, step=4):
    f = ImageFont.truetype(PIXEL, size)
    x, y = xy
    d.text((x + step * 2, y + step * 2), text, font=f, fill=(0, 0, 0, 102))
    d.text((x + step, y + step), text, font=f, fill=shadow)
    d.text((x, y), text, font=f, fill=face)


# Badge
bf = ImageFont.truetype(PIXEL, 14)
d.rectangle([76, 92, 76 + 16 + d.textlength("SIGHTING CONFIRMED", font=bf), 92 + 30], fill=ORANGE)
d.text((84, 100), "SIGHTING CONFIRMED", font=bf, fill=NIGHT)

pixel_text((72, 160), "OMA", 72, step=6)
pixel_text((72, 250), "PLEX", 72, step=6)

mono = ImageFont.truetype(MONO, 26)
d.text((76, 368), "A floating CRT TV for Plex", font=mono, fill=PARCH)
d.text((76, 404), "on Omarchy.", font=mono, fill=PARCH)
d.text((76, 462), "$", font=mono, fill=TEAL)
d.text((100, 462), "omaplex toggle", font=mono, fill=MUTED)

# The squatch, whole-number scale, standing on the treeline.
squatch = png("excited", 6)
img.alpha_composite(squatch, (470, H - 40 - squatch.height))

# The TV with a hard offset shadow (no blur: brand rule).
tv = Image.open(sys.argv[1]).convert("RGBA")
tv = tv.resize((600, round(tv.height * 600 / tv.width)), Image.LANCZOS)
x, y = W - tv.width - 56, (H - tv.height) // 2 - 16
shadow = Image.new("RGBA", tv.size, (*PINE, 255))
shadow.putalpha(tv.getchannel("A").point(lambda a: 255 if a > 40 else 0))
img.alpha_composite(shadow, (x + 12, y + 12))
img.alpha_composite(tv, (x, y))

out = Path(sys.argv[2]) if len(sys.argv) > 2 else SITE / "public/omaplex/og.png"
img.convert("RGB").save(out, optimize=True)
print("wrote", out)
