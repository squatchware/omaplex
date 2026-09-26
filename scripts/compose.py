#!/usr/bin/env python3
"""Composite raw omaplex captures (transparent PNGs) into README/social images.

usage: compose.py <capture-dir> <docs-dir>
"""
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
(OUT.parent / "social").mkdir(exist_ok=True)  # MP4 for posting; kept out of git
THEMES = Path("/usr/share/omarchy/themes")
FONT = "/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Regular.ttf"
FONT_BOLD = "/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Bold.ttf"


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT, size)
    except OSError:
        return ImageFont.load_default(size)


def palette(name):
    text = (THEMES / name / "colors.toml").read_text()
    return dict(re.findall(r'^\s*(\w+)\s*=\s*"([^"]+)"', text, re.M))


def rgb(hex_):
    hex_ = hex_.lstrip("#")
    return tuple(int(hex_[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        draw.line([(0, y), (w, y)], fill=mix(top, bottom, y / max(1, h - 1)))
    return img.convert("RGBA")


def with_shadow(tv, blur=28, offset=(0, 22), alpha=120):
    pad = blur * 3
    canvas = Image.new("RGBA", (tv.width + pad * 2, tv.height + pad * 2), (0, 0, 0, 0))
    mask = tv.getchannel("A").point(lambda a: alpha if a > 20 else 0)
    shadow = Image.new("RGBA", tv.size, (0, 0, 0, 255))
    shadow.putalpha(mask)
    canvas.alpha_composite(shadow, (pad + offset[0], pad + offset[1]))
    canvas = canvas.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(tv, (pad, pad))
    return canvas, pad


def place(bg, tv, width, center):
    tv = tv.resize((width, round(tv.height * width / tv.width)), Image.LANCZOS)
    shadowed, pad = with_shadow(tv)
    bg.alpha_composite(shadowed, (round(center[0] - tv.width / 2 - pad), round(center[1] - tv.height / 2 - pad)))


def load(name):
    return Image.open(SRC / name).convert("RGBA")


# ---------- hero: TV floating over a tiled Omarchy desktop ----------
def desktop(theme, size=(1600, 900)):
    c = {k: rgb(v) for k, v in palette(theme).items() if v.startswith("#")}
    bg = gradient(size, mix(c["background"], c["accent"], 0.25), c["darker_background"])
    d = ImageDraw.Draw(bg)
    w, h = size
    # Bar
    d.rectangle([0, 0, w, 30], fill=c["darker_background"])
    for i in range(5):
        d.ellipse([18 + i * 22, 10, 28 + i * 22, 20], fill=c["accent"] if i == 1 else c["muted"])
    d.text((w // 2, 15), "Sat 22:40", font=font(14), fill=c["foreground"], anchor="mm")
    # Tiles
    gap, top = 12, 42
    tiles = [
        (gap, top, w * 0.56, h - gap),
        (w * 0.56 + gap, top, w - gap, h * 0.52),
        (w * 0.56 + gap, h * 0.52 + gap, w - gap, h - gap),
    ]
    rows = [
        [("muted", 4), ("magenta", 8), ("foreground", 18)],
        [("blue", 6), ("foreground", 26)],
        [("muted", 4), ("green", 12), ("foreground", 10), ("yellow", 8)],
        [("foreground", 30)],
        [("cyan", 7), ("foreground", 16)],
    ]
    for n, (x0, y0, x1, y1) in enumerate(tiles):
        d.rounded_rectangle([x0, y0, x1, y1], 8, fill=c["background"],
                            outline=c["accent"] if n == 0 else c["lighter_background"], width=2)
        y = y0 + 22
        line = 0
        while y < y1 - 20:
            x = x0 + 22
            for colour, length in rows[line % len(rows)]:
                seg = length * 9
                if x + seg > x1 - 20:
                    break
                d.rounded_rectangle([x, y, x + seg, y + 8], 4, fill=c.get(colour, c["foreground"]))
                x += seg + 12
            y += 24
            line += 1
    return bg


def hero():
    bg = desktop("tokyo-night")
    place(bg, load("theme-tokyo-night.png"), 700, (1600 - 390, 900 - 300))
    bg.convert("RGB").save(OUT / "hero.png", optimize=True)


# ---------- grids ----------
def grid(items, file, cols=3, cell=(620, 520), label_fill=(235, 235, 245)):
    rows = (len(items) + cols - 1) // cols
    img = Image.new("RGBA", (cols * cell[0], rows * cell[1]), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    for i, (capture, label, top, bottom) in enumerate(items):
        x, y = (i % cols) * cell[0], (i // cols) * cell[1]
        img.alpha_composite(gradient(cell, top, bottom), (x, y))
        tile = Image.new("RGBA", cell, (0, 0, 0, 0))
        place(tile, load(capture), 500, (cell[0] / 2, cell[1] / 2 - 14))
        img.alpha_composite(tile, (x, y))
        d.text((x + cell[0] / 2, y + cell[1] - 26), label, font=font(22, True), fill=label_fill, anchor="mm")
    img.convert("RGB").save(OUT / file, optimize=True)


def channels():
    skins = [
        ("omarchy", "CH 01 · YOUR THEME", "#2b3b47", "#11181d"),
        ("walnut", "CH 02 · WALNUT", "#3e2a1c", "#140c07"),
        ("atomic", "CH 03 · ATOMIC", "#2c4a44", "#0f1c1a"),
        ("vapor", "CH 04 · VAPOR", "#3a1850", "#12061c"),
        ("noir", "CH 05 · NOIR", "#2a2a2e", "#0a0a0b"),
        ("sunburst", "CH 06 · SUNBURST", "#4a2a12", "#160b04"),
    ]
    grid([(f"skin-{s}.png", label, rgb(a), rgb(b)) for s, label, a, b in skins], "channels.png")


def themes():
    items = []
    for f in sorted(SRC.glob("theme-*.png")):
        name = f.stem.removeprefix("theme-")
        c = palette(name)
        items.append((f.name, name.replace("-", " ").upper(), rgb(c["background"]),
                      mix(rgb(c["background"]), (0, 0, 0), 0.45)))
    if items:
        grid(items, "themes.png")


def bare():
    bg = desktop("catppuccin")
    place(bg, load("bare.png"), 760, (800, 470))
    bg.convert("RGB").save(OUT / "bare.png", optimize=True)


# ---------- channel-flip clip ----------
def clip():
    meta_file = SRC / "frames" / "meta.json"
    if not meta_file.exists():
        return
    import json
    meta = json.loads(meta_file.read_text())
    tmp = SRC / "clip"
    tmp.mkdir(exist_ok=True)
    backdrop = gradient((1280, 720), (43, 45, 66), (12, 12, 20))
    for i in range(meta["count"]):
        raw = (SRC / "frames" / f"f{i:04d}.bgra").read_bytes()
        frame = Image.frombuffer("RGBA", (meta["width"], meta["height"]), raw, "raw", "BGRA", 0, 1)
        bg = backdrop.copy()
        place(bg, frame, 820, (640, 360))
        bg.convert("RGB").save(tmp / f"c{i:04d}.png")
    common = ["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(meta["fps"]), "-i", str(tmp / "c%04d.png")]
    subprocess.run(common + ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart",
                             str(OUT.parent / "social" / "demo.mp4")], check=True)
    subprocess.run(common + ["-vf", "fps=15,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
                             str(OUT / "demo.gif")], check=True)


for step in (hero, channels, themes, bare, clip):
    step()
    print("composed", step.__name__)
