"""Build the classic-script, double-clickable Roundtrip.html distribution.

Application code and local visual assets are embedded. If a generated satellite
cache exists, its verified images are embedded too; otherwise satellite imagery
is loaded from the published HTTPS mirror. Live webcams/maps still need internet.
"""
import base64
import json
import mimetypes
import pathlib
import re

D = pathlib.Path(__file__).parent
SATELLITE_MIRROR = 'https://anthonybono21-cloud.github.io/roundtrip/assets/satellite/'


def data_uri(rel, mime=None):
    path = D / rel
    mime = mime or mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def script(text):
    return '<script>\n' + re.sub(r'</script', r'<\\/script', text, flags=re.I) + '\n</script>\n'


def bundled_satellites():
    path = D / 'assets/satellite/manifest.json'
    if not path.exists():
        return None
    manifest = json.loads(path.read_text(encoding='utf-8'))
    rows = manifest.get('satellites', []) + ([manifest['conus']] if manifest.get('conus') else [])
    for row in rows:
        image = (path.parent / row['image']).resolve()
        if image.parent != path.parent.resolve() or not image.is_file():
            raise ValueError(f'Invalid satellite cache image: {row["image"]}')
        if row.get('sha256'):
            import hashlib
            if hashlib.sha256(image.read_bytes()).hexdigest() != row['sha256']:
                raise ValueError(f'Satellite cache hash mismatch: {row["image"]}')
        row['image'] = data_uri(image)
    return manifest


embedded_satellites = bundled_satellites()


def classic_module(rel, imported):
    """Keep each module's private scope so DEG/clamp helpers cannot collide."""
    source = (D / rel).read_text(encoding='utf-8')
    names = [name.strip() for name in imported.split(',') if name.strip()]
    assert all(re.fullmatch(r'\w+', name) for name in names), 'unsupported aliased import'
    exported = re.findall(r'^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)', source, re.M)
    assert all(name in exported for name in names), f'missing export in {rel}'
    source = re.sub(r'^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)', '', source, flags=re.M)

    # import.meta does not exist in classic scripts; file:// textures must be embedded.
    asset = re.compile(r"new URL\(['\"](\./assets/[^'\"]+)['\"],\s*import\.meta\.url\)(\.href)?")
    def inline_asset(match):
        rel_asset = match.group(1)[2:]
        if rel_asset == 'assets/satellite/':
            return 'new URL(' + json.dumps(SATELLITE_MIRROR) + ')'
        return json.dumps(data_uri(rel_asset))
    source = asset.sub(inline_asset, source)

    if rel == 'satellite-earth.js':
        # A query suffix would corrupt a base64 data URL. Preserve normal remote URLs.
        source = source.replace('new URL(row.image,imageRoot)', 'bundledImageURL(row.image,imageRoot)')
        source = source.replace('let manifest, imageRoot=root;',
            'let manifest=status.generatedAt===null?bundledManifest:null, imageRoot=root;')
        old_bases = "[root,new URL('" + SATELLITE_MIRROR + "')]"
        assert old_bases in source, 'satellite refresh source list changed'
        source = source.replace(old_bases, '(manifest?[]:[root])')
        source = source.replace("if(!manifest)throw new Error(", "if(!manifest)manifest=bundledManifest;\n      if(!manifest)throw new Error(")
        source = ('const bundledManifest=' + json.dumps(embedded_satellites, ensure_ascii=False) + ';\n'
            'function bundledImageURL(image, root){\n'
            "  return image.startsWith('data:') ? {href:image,searchParams:{set(){}}} : new URL(image,root);\n"
            '}\n' + source)
    assert 'import.meta' not in source, f'unresolved module asset in {rel}'
    assert not re.search(r'^\s*(import|export)\s', source, re.M), f'unresolved module syntax in {rel}'
    return 'const {' + ','.join(names) + '} = (()=>{\n' + source + '\nreturn {' + ','.join(names) + '};\n})();\n'


html = (D / 'index.html').read_text(encoding='utf-8')
three = (D / 'vendor/three.module.js').read_text(encoding='utf-8')
m = re.search(r'\nexport \{([^}]*)\};\s*$', three)
assert m, 'could not find the Three export list'
exports = []
for value in m.group(1).split(','):
    parts = re.split(r'\s+as\s+', value.strip())
    exports.append(parts[-1] + ':' + parts[0])
three_classic = '(function(){\n' + three[:m.start()] + '\nwindow.THREE={' + ','.join(exports) + '};\n})();'
cams = json.loads((D / 'cameras.json').read_text(encoding='utf-8'))
prelude = script(three_classic) + script('const CAMERA_DATA=' + json.dumps(cams, ensure_ascii=False) + ';')

# Inline current scripts and the optional legacy cloud script if present.
html = re.sub(r'<script src="\./([^"?]+\.js)"></script>',
              lambda match: script((D / match.group(1)).read_text(encoding='utf-8')), html)
anchor = "<script type=\"module\">\nimport * as THREE from './vendor/three.module.js';\n"
assert anchor in html, 'module header not found'
html = html.replace(anchor, prelude + '<script>\n', 1)
html = re.sub(r"^import\s+\{([^}]+)\}\s+from\s+['\"]\./([^'\"]+)['\"];\s*$",
              lambda match: classic_module(match.group(2), match.group(1)), html, flags=re.M)

# Local images in markup/app code, including brand and favicons.
image_pattern = re.compile(r'''(["'])(\./assets/[^"']+\.(?:jpg|jpeg|png|webp|svg|ico))\1''', re.I)
html = image_pattern.sub(lambda match: match.group(1) + data_uri(match.group(2)[2:]) + match.group(1), html)
assert not re.search(r'^\s*(import|export)\s', html, re.M), 'module syntax remains'
assert 'import.meta' not in html, 'module-relative URL remains'
assert 'type="module"' not in html, 'module script remains'
assert 'window.THREE' in html
out = D / 'Roundtrip.html'
out.write_text(html, encoding='utf-8')
print(f'built {out.name}: {out.stat().st_size/1048576:.2f} MB')
print('satellite imagery: ' + ('embedded cache, with later HTTPS refresh' if embedded_satellites else 'published HTTPS mirror (internet required)'))
