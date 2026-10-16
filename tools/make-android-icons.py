"""Replace Capacitor's default Android icons and splash screens with the Forge icon.
Keeps each file's size. Run after `npx cap add android`: python3 tools/make-android-icons.py
"""
import struct
import zlib
from pathlib import Path

BG = (13, 17, 23)
RECTS = [  # Forge "F" + ember block on a 100x100 grid (same as make-icons.py)
    (34, 27, 46, 73, (255, 122, 26)),
    (34, 27, 68, 38, (255, 122, 26)),
    (34, 46, 61, 56, (255, 122, 26)),
    (52, 64, 68, 73, (255, 194, 71)),
]
RES = Path(__file__).resolve().parent.parent / "android" / "app" / "src" / "main" / "res"


def size_of(png):
    w, h = struct.unpack(">II", png.read_bytes()[16:24])
    return w, h


def draw(w, h, glyph):
    """Dark w×h image with the glyph drawn in a centered square of side `glyph`."""
    ox, oy = (w - glyph) / 2, (h - glyph) / 2
    rects = [(ox + x0 * glyph / 100, oy + y0 * glyph / 100, ox + x1 * glyph / 100, oy + y1 * glyph / 100, c) for x0, y0, x1, y1, c in RECTS]
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            c = BG
            for x0, y0, x1, y1, col in rects:
                if x0 <= x < x1 and y0 <= y < y1:
                    c = col
            row += bytes(c)
        rows.append(bytes(row))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


n = 0
for png in sorted(RES.glob("*/*.png")):
    w, h = size_of(png)
    if png.name == "splash.png":
        png.write_bytes(draw(w, h, int(min(w, h) * 0.45)))
    else:  # ic_launcher, ic_launcher_round, ic_launcher_foreground: full square, glyph keeps its safe zone
        png.write_bytes(draw(w, h, min(w, h)))
    n += 1
bg = RES / "values" / "ic_launcher_background.xml"
bg.write_text(bg.read_text().replace("#FFFFFF", "#0D1117"))
print(f"{n} images replaced; adaptive icon background set to #0D1117")
