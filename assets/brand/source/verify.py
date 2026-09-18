"""Validate the exported package independently and write its file manifest."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import xml.etree.ElementTree as ET
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
required = {
    'icons/favicon-16.png': (16, 16),
    'icons/favicon-32.png': (32, 32),
    'icons/favicon-48.png': (48, 48),
    'icons/apple-touch-icon-180.png': (180, 180),
    'icons/icon-192.png': (192, 192),
    'icons/icon-512.png': (512, 512),
    'icons/ios-1024.png': (1024, 1024),
    'icons/android-foreground-432.png': (432, 432),
    'icons/android-background-432.png': (432, 432),
    'firetv/firetv-banner-1280x720.png': (1280, 720),
    'firetv/firetv-background-1920x1080.png': (1920, 1080),
    'splash/splash-dark-1920x1080.png': (1920, 1080),
    'splash/splash-dark-1170x2532.png': (1170, 2532),
    'splash/splash-dark-2732x2732.png': (2732, 2732),
}
for w, h in ((1280, 768), (800, 480), (400, 240)):
    for layer in ('back', 'middle', 'front'):
        required[f'tvos/tvos-{w}x{h}-{layer}.png'] = (w, h)

opaque = {
    'icons/ios-1024.png', 'icons/android-background-432.png',
    'icons/apple-touch-icon-180.png',
    *[p for p in required if p.startswith(('firetv/', 'splash/')) or p.endswith('-back.png')],
}

for name, size in required.items():
    with Image.open(ROOT / name) as im:
        assert im.size == size, (name, im.size, size)
        rgba = im.convert('RGBA')
        assert rgba.getchannel('A').getextrema()[1] >= 128, f'Invisible image: {name}'
        if name in opaque:
            assert rgba.getchannel('A').getextrema() == (255, 255), f'Nonopaque: {name}'
        if not name.endswith(('-back.png', 'android-background-432.png')):
            rgb = im.convert('RGB')
            background = Image.new('RGB', im.size, rgb.getpixel((0, 0)))
            assert ImageChops.difference(rgb, background).getbbox(), f'Blank image: {name}'

for kind in ('color', 'white'):
    for suffix in ('', '-mark', '-wordmark', '-horizontal'):
        name = f'handle-flight-{kind}{suffix}.png'
        with Image.open(ROOT / name) as im:
            assert im.mode == 'RGBA', name
            alpha = im.getchannel('A')
            assert alpha.getextrema()[0] == 0 and alpha.getextrema()[1] >= 128, name
            x0, y0, x1, y1 = alpha.point(lambda a: 255 if a > 32 else 0).getbbox()
            assert x1 - x0 > 16 and y1 - y0 > 16, f'Bad crop: {name}'
            if kind == 'white':
                assert all(r == g == b == 255 for r, g, b, a in im.getdata() if a), name

with Image.open(ROOT / 'icons/favicon.ico') as ico:
    assert ico.info['sizes'] == {(16, 16), (32, 32), (48, 48)}, ico.info
    for size in sorted(ico.info['sizes']):
        im = ico.ico.getimage(size).convert('RGBA')
        assert im.getchannel('A').getextrema()[1] >= 128, f'Blank ICO: {size}'
        assert len(set(im.getdata())) > 4, f'Uniform ICO: {size}'

with Image.open(ROOT / 'icons/android-foreground-432.png') as im:
    alpha = im.convert('RGBA').getchannel('A')
    outside = sum(1 for y in range(432) for x in range(432)
                  if alpha.getpixel((x, y)) > 0 and (x + .5 - 216)**2 + (y + .5 - 216)**2 > 132**2)
    assert outside == 0, f'Android foreground outside safe circle: {outside} pixels'

svgs = sorted(ROOT.glob('*.svg'))
assert svgs, 'Missing vector masters'
for path in svgs:
    tree = ET.parse(path)
    names = [node.tag.split('}')[-1] for node in tree.iter()]
    assert 'path' in names and 'image' not in names, f'Not a path vector: {path.name}'
    if 'white' in path.name:
        assert all(node.attrib.get('fill', '').upper() == '#FFFFFF'
                   for node in tree.iter() if node.tag.split('}')[-1] == 'path'), path.name

files = []
for path in sorted(ROOT.rglob('*')):
    if not path.is_file() or path.name == 'manifest.json' or '__pycache__' in path.parts:
        continue
    data = path.read_bytes()
    is_text = path.suffix.lower() in ('.md', '.py', '.json', '.svg', '.txt') or path.name == '.gitignore'
    hash_data = data.replace(b'\r\n', b'\n') if is_text else data
    entry = {'path': path.relative_to(ROOT).as_posix(), 'bytes': len(data),
             'sha256': hashlib.sha256(hash_data).hexdigest(),
             'hash_basis': 'LF-normalized text' if is_text else 'exact file bytes'}
    if path.suffix.lower() == '.png':
        with Image.open(path) as im:
            entry.update(width=im.width, height=im.height, mode=im.mode)
    files.append(entry)
manifest = {
    'brand': 'Roundtrip', 'selected_concept': 'Handle Flight',
    'integration_status': 'assets ready; app and native wiring remains with consumers',
    'masters': {'color': 'handle-flight-color.png', 'white_overlay': 'handle-flight-white.png',
                'color_mark': 'handle-flight-color-mark.png', 'white_mark': 'handle-flight-white-mark.png'},
    'checks': {'required_dimensions': 'passed', 'white_rgb': '#FFFFFF',
               'opaque_platform_backgrounds': 'passed', 'android_safe_circle_diameter_px': 264,
               'android_pixels_outside_safe_circle': outside, 'ico_sizes': [16, 32, 48],
               'svg_contains_paths_not_embedded_bitmaps': True},
    'files': files,
}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(f'PASS: {len(required)} sized exports, 8 transparent masters, ICO, Android safe circle, {len(svgs)} SVGs; {len(files)} files indexed.')
