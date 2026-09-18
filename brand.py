"""Cuts every platform file Roundtrip ships from the Handle Flight package.

assets/brand/ is the handoff and is never edited: its manifest.json carries a
hash for every file in it, and its own verify.py checks them. Everything here
is derived from those masters and written outside that folder, so the package
stays exactly as it was signed and a future brand drop is re-wired by running
this again.

Nothing is redrawn. The wordmark is never retyped: every file below is a
resize, a crop, or a composite of the supplied artwork.

    python3 brand.py

Needs Pillow. The web page reaches for assets/brand/ directly and needs
nothing from here; this is for the files Android, Fire OS and Xcode insist on
owning copies of.
"""

import pathlib, shutil
from PIL import Image, ImageDraw

D = pathlib.Path(__file__).parent
SRC = D / 'assets' / 'brand'
wrote = []


def load(rel):
    return Image.open(SRC / rel)


def save(im, rel):
    out = D / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    wrote.append(f'{rel}  {im.width}x{im.height}')


def copy(rel_src, rel_out):
    out = D / rel_out
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SRC / rel_src, out)
    wrote.append(f'{rel_out}  (copy of {rel_src})')


def fit(im, w, h):
    """Cover: fill the box at the source's own aspect and crop the overflow.

    The artwork is a centred lockup on a wide dark field, so a crop takes
    backdrop and never the logo, where a stretch to a different aspect would
    squash the suitcase.
    """
    s = max(w / im.width, h / im.height)
    r = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    left, top = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((left, top, left + w, top + h))


def square(im, n):
    return im.resize((n, n), Image.LANCZOS)


# The Android adaptive layers composited into one opaque square, which is what
# every launcher that predates adaptive icons shows, and what Fire OS shows.
def legacy_icon():
    bg = load('icons/android-background-432.png').convert('RGBA')
    fg = load('icons/android-foreground-432.png').convert('RGBA')
    flat = Image.alpha_composite(bg, fg)
    # An adaptive icon is drawn at 72/108 of its layer, so the legacy square
    # crops to that same window; otherwise the mark comes out noticeably
    # smaller than every other icon on the shelf.
    inset = round(432 * (108 - 72) / 2 / 108)
    return flat.crop((inset, inset, 432 - inset, 432 - inset))


def round_icon(flat):
    mask = Image.new('L', flat.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, flat.width - 1, flat.height - 1), fill=255)
    out = Image.new('RGBA', flat.size, (0, 0, 0, 0))
    out.paste(flat, (0, 0), mask)
    return out


FLAT = legacy_icon()
ROUND = round_icon(FLAT)

# Launcher icon in dp, by density bucket.
LAUNCHER = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# An adaptive layer is 108dp on the same buckets.
LAYER = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}

# ── the browser ───────────────────────────────────────────────────────────
# The page links the brand icons where they lie; only the bare /favicon.ico a
# browser asks for by habit has to sit at the root.
copy('icons/favicon.ico', 'favicon.ico')

# ── Fire TV (firetv/) ─────────────────────────────────────────────────────
# The banner is the tile on the Fire TV home row: 320x180dp, so xhdpi is
# 640x360. xxhdpi covers a 4K stick's launcher.
banner = load('firetv/firetv-banner-1280x720.png').convert('RGBA')
FTV = 'firetv/app/src/main/res'
save(fit(banner, 640, 360), f'{FTV}/drawable-xhdpi/banner.png')
save(fit(banner, 960, 540), f'{FTV}/drawable-xxhdpi/banner.png')
# The window behind the WebView, which is what the television shows for the
# second or two before the globe paints. It replaces a flat #05070C.
copy('firetv/firetv-background-1920x1080.png', f'{FTV}/drawable-nodpi/tv_background.png')
for bucket, n in LAUNCHER.items():
    save(square(FLAT, n), f'{FTV}/mipmap-{bucket}/ic_launcher.png')

# ── iPhone, iPad, Mac and Android (native/) ───────────────────────────────
# Xcode takes the 1024 as supplied: opaque, square, no rounded corners.
copy('icons/ios-1024.png', 'native/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
# Capacitor's splash image set carries the same square art at three scales.
for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
    copy('splash/splash-dark-2732x2732.png',
         f'native/ios/App/App/Assets.xcassets/Splash.imageset/{name}')

AND = 'native/android/app/src/main/res'
fg = load('icons/android-foreground-432.png').convert('RGBA')
bg = load('icons/android-background-432.png').convert('RGBA')
for bucket, n in LAYER.items():
    save(square(fg, n), f'{AND}/mipmap-{bucket}/ic_launcher_foreground.png')
    save(square(bg, n), f'{AND}/mipmap-{bucket}/ic_launcher_background.png')
for bucket, n in LAUNCHER.items():
    save(square(FLAT, n), f'{AND}/mipmap-{bucket}/ic_launcher.png')
    save(square(ROUND, n), f'{AND}/mipmap-{bucket}/ic_launcher_round.png')

land = load('splash/splash-dark-1920x1080.png').convert('RGB')
port = load('splash/splash-dark-1170x2532.png').convert('RGB')
SPLASH = [
    ('drawable', land, 480, 320),
    ('drawable-land-mdpi', land, 480, 320),
    ('drawable-land-hdpi', land, 800, 480),
    ('drawable-land-xhdpi', land, 1280, 720),
    ('drawable-land-xxhdpi', land, 1600, 960),
    ('drawable-land-xxxhdpi', land, 1920, 1280),
    ('drawable-port-mdpi', port, 320, 480),
    ('drawable-port-hdpi', port, 480, 800),
    ('drawable-port-xhdpi', port, 720, 1280),
    ('drawable-port-xxhdpi', port, 960, 1600),
    ('drawable-port-xxxhdpi', port, 1280, 1920),
]
for folder, art, w, h in SPLASH:
    save(fit(art, w, h), f'{AND}/{folder}/splash.png')

print('\n'.join(wrote))
print(f'{len(wrote)} files cut from assets/brand/')
