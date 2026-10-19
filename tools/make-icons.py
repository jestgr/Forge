"""Draw Forge app icons (PNG, no libraries). Run: python3 tools/make-icons.py

Full-bleed dark square (works as 'maskable'), orange "F" + ember bar kept
inside the central safe zone.
"""
import struct
import zlib
from pathlib import Path

BG = (13, 17, 23)
FG = (255, 122, 26)
EMBER = (255, 194, 71)


def shapes(n):
    u = n / 100  # design on a 100x100 grid; glyph inside 25..75 (safe zone)
    rects = [
        (34, 27, 46, 73, FG),   # stem
        (34, 27, 68, 38, FG),   # top bar
        (34, 46, 61, 56, FG),   # middle bar
        (52, 64, 68, 73, EMBER),  # ember block
    ]
    return [(int(x0 * u), int(y0 * u), int(x1 * u), int(y1 * u), c) for x0, y0, x1, y1, c in rects]


def png(n):
    rs = shapes(n)
    rows = []
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            c = BG
            for x0, y0, x1, y1, col in rs:
                if x0 <= x < x1 and y0 <= y < y1:
                    c = col
            row += bytes(c)
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def svg():
    parts = "".join(
        f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="rgb{c}"/>'
        for x0, y0, x1, y1, c in shapes(100)
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="rgb{BG}"/>{parts}</svg>\n'


out = Path(__file__).resolve().parent.parent / "app" / "icons"
out.mkdir(parents=True, exist_ok=True)
for n in (192, 512):
    (out / f"icon-{n}.png").write_bytes(png(n))
(out / "icon.svg").write_text(svg())
print("icons written to", out)
