"""Build the aPrueba app icons (10 Nov 2026) from the logo v2 badge.
Usage: python3 tools/make_appicons.py img/aprueba-icon.svg img/app
Needs rsvg-convert (librsvg).
Writes: icon-any.svg (badge as is), icon-full.svg (square, for iOS),
icon-maskable.svg (square, glyph inside the 80% safe zone), and PNGs via rsvg-convert."""
import re, subprocess, sys, pathlib
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
svg = src.read_text()
glyph = svg.split('fill="#FFC93C"/>', 1)[1].rsplit('</svg>', 1)[0].strip()
# Visible glyph box measured from the paths: x 22..157, y 55..125 -> centre (89.5, 90)
def make(name, rx, scale):
    t = '' if scale == 1 else f' transform="translate(90 90) scale({scale}) translate(-89.5 -90)"'
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">'
         f'<rect width="180" height="180" rx="{rx}" fill="#FFC93C"/><g{t}>{glyph}</g></svg>\n')
    (out / name).write_text(s); return out / name
any_ = make('icon-any.svg', 43.2, 1)
full = make('icon-full.svg', 0, 1)
mask = make('icon-maskable.svg', 0, 0.9)
def png(svgf, size, name):
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), '-o', str(out / name), str(svgf)], check=True)
png(full, 180, 'apple-touch-icon.png')
png(any_, 192, 'icon-192.png'); png(any_, 512, 'icon-512.png')
png(mask, 512, 'icon-maskable-512.png'); png(mask, 192, 'icon-maskable-192.png')
png(any_, 32, 'favicon-32.png')
print('ok', sorted(p.name for p in out.iterdir()))
