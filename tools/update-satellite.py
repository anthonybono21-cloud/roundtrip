#!/usr/bin/env python3
"""Refresh public GeoColor images for a Pages artifact, never for Git history.

pip install Pillow
python tools/update-satellite.py --output assets/satellite
"""
import argparse
import concurrent.futures
import hashlib
import io
import json
import os
from pathlib import Path
import time
from datetime import datetime, timezone
import urllib.request

from PIL import Image, ImageStat

CIRA = "https://slider.cira.colostate.edu/data"
NOAA = "https://cdn.star.nesdis.noaa.gov"
SATS = [
    ("goes-19", -75.2, .151872, "x", 678),
    ("goes-18", -137.0, .151872, "x", 678),
    ("himawari", 140.7, .153802, "y", 688),
    ("meteosat-0deg", 0.0, .155613, "y", 464),
    ("meteosat-9", 45.5, .155613, "y", 464),
]


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def validate(data, expected=None):
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        if expected and im.size != expected:
            raise ValueError(f"wrong dimensions {im.size}; expected {expected}")
        if min(im.size) < 400 or max(im.size) > 12000:
            raise ValueError(f"invalid dimensions {im.size}")
        probe = im.convert("RGB").resize((64, 64))
        if max(ImageStat.Stat(probe).stddev) < 2:
            raise ValueError("blank or near-uniform satellite image")
        return im.copy()


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def refresh(output, seconds):
    output.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + seconds
    manifest_path = output / "manifest.json"
    old = json.loads(manifest_path.read_text("utf-8")) if manifest_path.exists() else {}
    previous = {r["id"]: r for r in old.get("satellites", [])}
    if old.get("conus"):
        previous["conus"] = old["conus"]
    errors = []
    refreshed = 0
    pending_images = {}

    def get(url):
        failure = None
        for attempt in range(2):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("satellite refresh deadline reached")
            try:
                req = urllib.request.Request(url, headers={
                    "User-Agent": "Roundtrip/1.0 (public GeoColor display; cached imagery)",
                    "Accept": "image/*,application/json;q=0.9,*/*;q=0.5",
                })
                with urllib.request.urlopen(req, timeout=min(20, remaining)) as response:
                    return response.read(), {k.lower(): v for k, v in response.headers.items()}
            except Exception as exc:
                failure = exc
                if attempt == 0:
                    time.sleep(.4)
        raise RuntimeError(f"{url}: {failure}")

    def save_image(record, data, name, expected):
        validate(data, expected)
        pending_images[name] = data
        record.update(image=name, receivedAt=utcnow(), stale=False,
                      sha256=hashlib.sha256(data).hexdigest())
        return record

    def satellite(spec):
        sid, longitude, half, sweep, tile_size = spec
        record = dict(id=sid, longitude=longitude, half=half, sweep=sweep)
        if sid.startswith("goes-"):
            number = sid.split("-")[1]
            url = f"{NOAA}/GOES{number}/ABI/FD/GEOCOLOR/1808x1808.jpg"
            data, headers = get(url)
            # A CDN modification time is NOT a measured satellite capture time.
            record.update(timestamp=None, timestampKind="unavailable", sourceUrl=url,
                          httpLastModified=headers.get("last-modified"))
            return save_image(record, data, sid + ".jpg", (1808, 1808))

        metadata_url = f"{CIRA}/json/{sid}/full_disk/geocolor/latest_times.json"
        raw, _ = get(metadata_url)
        stamps = json.loads(raw)["timestamps_int"]
        stamp = str(stamps[0])
        captured = datetime.strptime(stamp, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        if abs((datetime.now(timezone.utc) - captured).total_seconds()) > 3 * 3600:
            raise ValueError(f"{sid}: newest available capture is over three hours old: {stamp}")
        prefix = (f"{CIRA}/imagery/{stamp[:4]}/{stamp[4:6]}/{stamp[6:8]}/"
                  f"{sid}---full_disk/geocolor/{stamp}/02/")

        def tile(position):
            row, col = position
            data, _ = get(prefix + f"{row:03d}_{col:03d}.png")
            # Space-only corner tiles are valid; do not apply the blank-disk test.
            with Image.open(io.BytesIO(data)) as im:
                im.load()
                if im.size != (tile_size, tile_size):
                    raise ValueError(f"{sid} tile dimensions {im.size}")
                return row, col, im.convert("RGB")

        disk = Image.new("RGB", (tile_size * 4, tile_size * 4))
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for row, col, im in pool.map(tile, [(r, c) for r in range(4) for c in range(4)]):
                disk.paste(im, (col * tile_size, row * tile_size))
        encoded = io.BytesIO()
        disk.save(encoded, "JPEG", quality=93)
        record.update(timestamp=captured.isoformat().replace("+00:00", "Z"),
                      timestampKind="satellite-capture", sourceUrl=metadata_url,
                      imageryUrl=prefix, credit="CIRA/RAMMB; JMA" if sid == "himawari" else "CIRA/RAMMB; EUMETSAT")
        return save_image(record, encoded.getvalue(), sid + ".jpg", disk.size)

    def conus():
        url = f"{NOAA}/GOES19/ABI/CONUS/GEOCOLOR/5000x3000.jpg"
        data, headers = get(url)
        record = dict(id="conus", timestamp=None, timestampKind="unavailable",
                      httpLastModified=headers.get("last-modified"), sourceUrl=url,
                      extent=[-.101360, .128240, .038640, .044240])
        return save_image(record, data, "conus.jpg", (5000, 3000))

    def attempt(sid, operation):
        nonlocal refreshed
        try:
            record = operation()
            refreshed += 1
            print(f"FRESH {sid}: {record.get('timestamp') or 'capture time unavailable; see receivedAt'}", flush=True)
            return record
        except Exception as exc:
            message = f"{sid}: {exc}"
            errors.append(message)
            cached = previous.get(sid)
            if cached:
                path = (output / cached["image"]).resolve()
                if path.parent != output.resolve():
                    raise ValueError("cached image path escapes output directory") from exc
                data = path.read_bytes()
                validate(data)
                if cached.get("sha256") and hashlib.sha256(data).hexdigest() != cached["sha256"]:
                    raise ValueError(f"{sid}: cached image hash mismatch") from exc
                print(f"::warning::STALE {message}; retaining last good image", flush=True)
                return dict(cached, stale=True, refreshError=str(exc))
            raise RuntimeError(f"{message}; no valid previous image exists") from exc

    records = [attempt(spec[0], lambda spec=spec: satellite(spec)) for spec in SATS]
    regional = attempt("conus", conus)
    manifest = dict(version=1, generatedAt=utcnow(), satellites=records, conus=regional,
                    refresh=dict(freshImages=refreshed, staleImages=len(errors), errors=errors),
                    credit="NOAA/CIRA/RAMMB, JMA, EUMETSAT. GeoColor city lights are a static reference layer.")
    for name, data in pending_images.items():
        atomic(output / name, data)
    atomic(manifest_path, (json.dumps(manifest, indent=2) + "\n").encode())
    print(f"Manifest written: {refreshed} refreshed, {len(errors)} retained", flush=True)


def offline(source, output):
    manifest = json.loads((source / "manifest.json").read_text("utf-8"))
    output.mkdir(parents=True, exist_ok=True)
    for row in manifest["satellites"] + [manifest["conus"]]:
        path = (source / row["image"]).resolve()
        if path.parent != source.resolve():
            raise ValueError("fixture image path escapes source directory")
        data = path.read_bytes()
        validate(data)
        if row.get("sha256") and hashlib.sha256(data).hexdigest() != row["sha256"]:
            raise ValueError("fixture image hash mismatch")
        atomic(output / row["image"], data)
    # Preserve original freshness and dates; an offline copy is not a refresh.
    atomic(output / "manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=int, default=240, help="overall network deadline in seconds")
    parser.add_argument("--offline-from", type=Path)
    args = parser.parse_args()
    if args.offline_from:
        offline(args.offline_from, args.output)
    else:
        refresh(args.output, args.timeout)
