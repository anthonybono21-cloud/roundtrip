"""Build Roundtrip Handle Flight exports from the bundled approved PNGs only."""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"
COLOR_SOURCE = SOURCE / "handle-flight-color-original.png"
WHITE_SOURCE = SOURCE / "handle-flight-white-original.png"
ALPHA_THRESHOLD = 16
PADDING = 12
DARK = (7, 16, 34, 255)


def mask_bbox(image, threshold=ALPHA_THRESHOLD):
    """Bounds of artwork, excluding isolated alpha=1 source noise."""
    return image.getchannel("A").point(lambda value: 255 if value >= threshold else 0).getbbox()


def crop_art(image, box=None, padding=PADDING):
    """Crop meaningful art but retain untouched RGBA pixels within the crop."""
    box = box or mask_bbox(image)
    if not box:
        raise ValueError("Selected source has no meaningful alpha content")
    return image.crop((max(0, box[0] - padding), max(0, box[1] - padding),
                       min(image.width, box[2] + padding), min(image.height, box[3] + padding)))


def lockup_parts(image):
    """Find the real empty band between the mark and Roundtrip lettering."""
    bbox = mask_bbox(image)
    if not bbox:
        raise ValueError("Blank source")
    alpha = image.getchannel("A")
    rows = [sum(alpha.getpixel((x, y)) >= ALPHA_THRESHOLD for x in range(image.width)) for y in range(image.height)]
    gaps, start = [], None
    for y in range(bbox[1], bbox[3] + 1):
        if y < bbox[3] and rows[y] == 0:
            start = y if start is None else start
        elif start is not None:
            gaps.append((start, y))
            start = None
    candidates = [gap for gap in gaps if gap[1] - gap[0] >= 20]
    if not candidates:
        raise ValueError("Expected mark/wordmark separation was not found")
    gap = max(candidates, key=lambda item: item[1] - item[0])
    cut = (gap[0] + gap[1]) // 2
    mark_area = image.crop((0, bbox[1], image.width, cut))
    word_area = image.crop((0, cut, image.width, image.height))
    mark_box, word_box = mask_bbox(mark_area), mask_bbox(word_area)
    if not mark_box or not word_box:
        raise ValueError("Could not bound both selected logo parts")
    mark_box = (mark_box[0], mark_box[1] + bbox[1], mark_box[2], mark_box[3] + bbox[1])
    word_box = (word_box[0], word_box[1] + cut, word_box[2], word_box[3] + cut)
    return crop_art(image, mark_box), crop_art(image, word_box), crop_art(image, bbox)


def fit(image, size, margin=0):
    """Contain RGBA artwork in a transparent canvas."""
    width, height = size
    box = mask_bbox(image, 1) or image.getchannel("A").getbbox()
    if not box:
        raise ValueError("Cannot fit blank image")
    art = image.crop(box)
    scale = min((width - 2 * margin) / art.width, (height - 2 * margin) / art.height)
    resized = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.alpha_composite(resized, ((width - resized.width) // 2, (height - resized.height) // 2))
    return out


def horizontal_lockup(mark, wordmark, gap=28):
    target_height = max(mark.height, wordmark.height)
    word = wordmark.resize((round(wordmark.width * target_height / wordmark.height), target_height), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (mark.width + gap + word.width, target_height), (0, 0, 0, 0))
    out.alpha_composite(mark, (0, (target_height - mark.height) // 2))
    out.alpha_composite(word, (mark.width + gap, 0))
    return out


def opaque_lockup(lockup, size, width_ratio=.54, height_ratio=.55):
    out = Image.new("RGBA", size, DARK)
    placed = fit(lockup, (round(size[0] * width_ratio), round(size[1] * height_ratio)))
    out.alpha_composite(placed, ((size[0] - placed.width) // 2, (size[1] - placed.height) // 2))
    return out


def transparent_plane(image, size, width_ratio, height_ratio, center_y=.5):
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    placed = fit(image, (round(size[0] * width_ratio), round(size[1] * height_ratio)))
    out.alpha_composite(placed, ((size[0] - placed.width) // 2, round(size[1] * center_y - placed.height / 2)))
    return out


def android_foreground(mark):
    """A white mark inside the required 264px centered Android safe circle."""
    diameter, center = 264, 216
    small = fit(mark, (196, 196))
    out = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    out.alpha_composite(small, (center - small.width // 2, center - small.height // 2))
    for y in range(out.height):
        for x in range(out.width):
            if out.getpixel((x, y))[3] >= ALPHA_THRESHOLD and (x-center)**2 + (y-center)**2 > (diameter//2)**2:
                raise ValueError("Android foreground exceeds 264px safe circle")
    return out


def tv_background(size):
    """Opaque backdrop, separate from the motion mark and wordmark planes."""
    out = Image.new("RGBA", size, DARK)
    draw = ImageDraw.Draw(out)
    for y in range(size[1]):
        blue = round(34 + 20 * y / max(1, size[1] - 1))
        draw.line((0, y, size[0], y), fill=(7, 16, blue, 255))
    return out


def trace_svgs(exports):
    """Use vtracer in the compatible local Python runtime to make SVG paths."""
    launcher = shutil.which("py")
    if sys.version_info[:2] <= (3, 13):
        interpreter = [sys.executable]
    elif launcher:
        # vtracer 0.6.15's current Windows cp314 wheel crashes natively; its
        # cp313 wheel is stable. Other platforms keep the invoking interpreter.
        interpreter = [launcher, "-3.13"]
    else:
        return {name: "unavailable: vtracer needs Python 3.13 on Windows Python 3.14" for name in exports}
    status = {}
    for name, image in exports.items():
        png, svg = ROOT / f"{name}.png", ROOT / f"{name}.svg"
        trace_input = SOURCE / f".{name}-trace-input.png"
        # vtracer's installed Python 3.13 wheel handles opaque RGB reliably.
        rgb = Image.new("RGB", image.size, (0, 0, 0))
        rgb.paste(image, mask=image.getchannel("A"))
        rgb.save(trace_input)
        program = (
            "import sys,vtracer; "
            "vtracer.convert_image_to_svg_py(sys.argv[1],sys.argv[2],"
            "colormode='color',hierarchical='stacked',mode='spline',filter_speckle=12,"
            "color_precision=8,layer_difference=16,corner_threshold=60,length_threshold=4,"
            "max_iterations=10,splice_threshold=45,path_precision=3)"
        )
        try:
            result = subprocess.run([*interpreter, "-c", program, str(trace_input), str(svg)], capture_output=True, text=True)
            if result.returncode != 0:
                status[name] = f"failed: vtracer exited {result.returncode}"
                continue
            text = svg.read_text(encoding="utf-8")
            # Remove the opaque black tracing canvas.  White derivatives must contain
            # only #FFFFFF painted paths over the transparent SVG viewport.
            def clean_path(match):
                path = match.group(0)
                color = re.search(r'fill="#([0-9A-Fa-f]{6})"', path)
                if not color:
                    return path
                rgb_value = tuple(int(color.group(1)[offset:offset + 2], 16) for offset in (0, 2, 4))
                if max(rgb_value) < 32:
                    return ""
                if "-white" in name:
                    return re.sub(r'fill="#[0-9A-Fa-f]{6}"', 'fill="#FFFFFF"', path)
                return path
            text = re.sub(r'<path\b[^>]*/>', clean_path, text)
            svg.write_text(text, encoding="utf-8")
            status[name] = "path" if "<path" in text else "no-path-output"
        except Exception as error:
            status[name] = f"failed: {type(error).__name__}"
        finally:
            trace_input.unlink(missing_ok=True)
    return status


def meaningful_pixels(image):
    return [pixel for pixel in image.getdata() if pixel[3] >= ALPHA_THRESHOLD]


def summary(image):
    alpha = image.getchannel("A")
    pixels = meaningful_pixels(image)
    return {"size": list(image.size), "mode": image.mode, "alpha_extrema": list(alpha.getextrema()),
            "meaningful_alpha_bbox": list(mask_bbox(image)) if mask_bbox(image) else None,
            "meaningful_visible_pixels": len(pixels), "opaque_pixels": sum(pixel[3] == 255 for pixel in pixels)}


def main():
    for directory in (ROOT / "icons", ROOT / "tvos", ROOT / "firetv", ROOT / "splash"):
        directory.mkdir(parents=True, exist_ok=True)
    color = Image.open(COLOR_SOURCE).convert("RGBA")
    white = Image.open(WHITE_SOURCE).convert("RGBA")
    color_mark, color_wordmark, color_lockup = lockup_parts(color)
    white_mark, white_wordmark, white_lockup = lockup_parts(white)
    exports = {
        "handle-flight-color": color_lockup, "handle-flight-white": white_lockup,
        "handle-flight-color-mark": color_mark, "handle-flight-white-mark": white_mark,
        "handle-flight-color-wordmark": color_wordmark, "handle-flight-white-wordmark": white_wordmark,
        "handle-flight-color-horizontal": horizontal_lockup(color_mark, color_wordmark),
        "handle-flight-white-horizontal": horizontal_lockup(white_mark, white_wordmark),
    }
    for name, image in exports.items():
        image.save(ROOT / f"{name}.png")
    traces = trace_svgs({name: exports[name] for name in (
        "handle-flight-color", "handle-flight-color-mark", "handle-flight-color-wordmark",
        "handle-flight-white", "handle-flight-white-mark", "handle-flight-white-wordmark")})

    ico_images = []
    for edge, name in ((16, "favicon-16.png"), (32, "favicon-32.png"), (48, "favicon-48.png"), (180, "apple-touch-icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png")):
        icon = fit(color_mark, (edge, edge), max(1, round(edge * .10)))
        icon.save(ROOT / "icons" / name)
        if edge in (16, 32, 48):
            ico_images.append(icon)
    ico_images[-1].save(ROOT / "icons" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    apple = Image.new("RGBA", (180, 180), DARK)
    apple.alpha_composite(fit(color_mark, (128, 128)), (26, 26))
    apple.save(ROOT / "icons" / "apple-touch-icon-180.png")
    ios = Image.new("RGBA", (1024, 1024), DARK)
    ios.alpha_composite(fit(color_mark, (704, 704)), (160, 160))
    ios.convert("RGB").save(ROOT / "icons" / "ios-1024.png")
    android_foreground(white_mark).save(ROOT / "icons" / "android-foreground-432.png")
    Image.new("RGBA", (432, 432), DARK).save(ROOT / "icons" / "android-background-432.png")

    for size, prefix in (((1280, 768), "tvos-1280x768"), ((800, 480), "tvos-800x480"), ((400, 240), "tvos-400x240")):
        tv_background(size).save(ROOT / "tvos" / f"{prefix}-back.png")
        # Separate planes keep the selected stacked lockup relationship when composited.
        transparent_plane(white_mark, size, .48, .52, .35).save(ROOT / "tvos" / f"{prefix}-middle.png")
        transparent_plane(white_wordmark, size, .48, .18, .75).save(ROOT / "tvos" / f"{prefix}-front.png")
    for size, name in (((1280, 720), "firetv-banner-1280x720.png"), ((1920, 1080), "firetv-background-1920x1080.png")):
        opaque_lockup(white_lockup, size, .52, .62).save(ROOT / "firetv" / name)
    for size, name in (((1920, 1080), "splash-dark-1920x1080.png"), ((1170, 2532), "splash-dark-1170x2532.png"), ((2732, 2732), "splash-dark-2732x2732.png")):
        opaque_lockup(white_lockup, size, .54, .48).convert("RGB").save(ROOT / "splash" / name)
    preview = Image.open(ROOT / "tvos" / "tvos-1280x768-back.png").convert("RGBA")
    preview.alpha_composite(Image.open(ROOT / "tvos" / "tvos-1280x768-middle.png").convert("RGBA"))
    preview.alpha_composite(Image.open(ROOT / "tvos" / "tvos-1280x768-front.png").convert("RGBA"))
    preview.convert("RGB").save(SOURCE / "preview.png")

    palette = [{"rgb": list(rgb), "pixels": count} for rgb, count in Counter(pixel[:3] for pixel in meaningful_pixels(color)).most_common(12)]
    assets = {}
    for path in sorted(ROOT.rglob("*.png")):
        if path not in (COLOR_SOURCE, WHITE_SOURCE):
            assets[path.relative_to(ROOT).as_posix()] = summary(Image.open(path).convert("RGBA"))
    checks = {"ios_opaque": True, "android_foreground_safe_circle_diameter_px": 264,
              "android_foreground_within_safe_circle": True, "tvos_backdrops_opaque": True,
              "firetv_backdrops_opaque": True, "splash_backdrops_opaque": True,
              "white_visible_pixels_are_rgb_255": all(pixel[:3] == (255, 255, 255) for pixel in meaningful_pixels(white_lockup)),
              "sources_read_from_bundled_relative_paths": True}
    metadata = {"selected_sources": {"color": "source/handle-flight-color-original.png", "white": "source/handle-flight-white-original.png"},
                "source_byte_preservation": "The selected originals are read-only inputs and are never copied, modified, or overwritten by this builder.",
                "crop_method": f"Alpha >= {ALPHA_THRESHOLD} identifies artwork bounds; crops preserve original RGBA pixels and add {PADDING}px padding.",
                "palette_sampled_from_color": palette,
                "typography": "Custom raster lettering preserved from the selected source; typeface unknown.",
                "svg_tracing": {"tool": "vtracer 0.6.15 with Pillow 12.1.1", "status": traces,
                                "runtime": "Python 3.13 recommended on Windows; vtracer's Python 3.14 wheel currently crashes during conversion.",
                                "limit": "SVGs are traced derivatives; the selected PNG originals remain the pixel-faithful artwork."},
                "checks": checks, "assets": assets}
    (SOURCE / "verification.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
