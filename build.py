import base64, json, re, pathlib
D = pathlib.Path(__file__).parent

# three.module.js -> a classic script that publishes window.THREE, so the file
# needs no module loading and therefore no web server.
three = (D/'vendor/three.module.js').read_text(encoding='utf-8')
m = re.search(r'\nexport \{([^}]*)\};\s*$', three)
assert m, 'could not find the trailing export list'
three_classic = ('(function(){\n' + three[:m.start()]
                 + '\nwindow.THREE = {' + m.group(1) + '};\n})();\n')

def data_uri(rel, mime):
    return f'data:{mime};base64,' + base64.b64encode((D/rel).read_bytes()).decode()

html = (D/'index.html').read_text(encoding='utf-8')

# Inject the library and the camera list ahead of the app, keyed off the module
# tag that is about to be replaced.
cams = json.loads((D/'cameras.json').read_text(encoding='utf-8'))
prelude = ('<script>' + three_classic + '</script>\n'
           '<script>\n'
           '/* Camera list baked in so this file works on its own. An adjacent\n'
           '   cameras.json, when reachable, takes precedence over it. */\n'
           'const CAMERA_DATA = ' + json.dumps(cams, ensure_ascii=False) + ';\n'
           '</script>\n')

# The cloud layer, inlined so the single file carries its own fallback texture.
clouds_js = (D/'clouds/et45-clouds-inline.js').read_text(encoding='utf-8')
tag = '<script src="./clouds/et45-clouds-inline.js"></script>'
assert tag in html, 'cloud script tag not found'
html = html.replace(tag, '<script>\n' + clouds_js + '\n</script>', 1)

# The search module, inlined for the same reason.
search_js = (D/'search.js').read_text(encoding='utf-8')
tag = '<script src="./search.js"></script>'
assert tag in html, 'search script tag not found'
html = html.replace(tag, '<script>\n' + search_js + '\n</script>', 1)

anchor = "<script type=\"module\">\nimport * as THREE from './vendor/three.module.js';\n"
assert anchor in html, 'module header not found'
html = html.replace(anchor, prelude + '<script>\n', 1)
assert 'three.module.js' not in html and 'window.THREE' in html

# Textures as data URIs: a file:// page cannot upload a local image into WebGL.
for rel, mime in [('assets/earth-day.jpg','image/jpeg'), ('assets/earth-night.jpg','image/jpeg'),
                  ('assets/earth-topo.png','image/png'), ('assets/stars.png','image/png')]:
    token = f"'./{rel}'"
    assert token in html, token
    html = html.replace(token, f"'{data_uri(rel, mime)}'")

out = D/'Roundtrip.html'
out.write_text(html, encoding='utf-8')
print(f'built {out.name}: {out.stat().st_size/1048576:.2f} MB')
