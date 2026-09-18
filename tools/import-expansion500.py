#!/usr/bin/env python3
"""Review regional camera research; append qualified records only with --write.

Default inputs: research/expansion500/{lane}.json.
Explicit --input files are also supported. Probe/pool/check JSON is never
silently treated as a completed regional candidate file. Dry runs write only
the import report when input records exist. Existing catalog values survive.
"""
from __future__ import annotations

import argparse
import copy
from collections import Counter
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path, PureWindowsPath
import re
import sys
import tempfile
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
LANES = ("east-asia", "europe-north", "europe-south", "oceania", "south-asia",
         "south-world", "us-east", "us-west")
SECRET_QUERY = {"token", "auth", "authorization", "expires", "expiry", "exp",
                "signature", "sig", "policy", "key-pair-id", "hdnea", "hdnts",
                "jwt", "key", "api_key", "apikey", "access_token"}
VISUAL_METHODS = {"actual_playback", "video_playback", "playback", "paired_frames",
                  "frame_pair", "sampled_frames", "contact_sheet", "visual_inspection"}


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def norm(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value).casefold()).strip()


def hold_paths(value, path="candidate"):
    found = []
    if isinstance(value, dict):
        if value.get("do_not_auto_import") or value.get("hold") is True:
            found.append(path)
        for key, child in value.items():
            found.extend(hold_paths(child, path + "." + key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(hold_paths(child, f"{path}[{index}]"))
    return found


def public_value(value):
    """Keep evidence references useful without publishing workstation paths."""
    if isinstance(value, dict):
        return {str(k): public_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [public_value(x) for x in value]
    if not isinstance(value, str):
        return value
    if re.match(r"^https?://\S+$", value):
        return value
    text = re.sub(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\n,;\"<>]+",
                  lambda m: PureWindowsPath(m.group()).name, value)
    text = re.sub(r"/(?:home|Users|tmp|mnt)/[^\n,;\"<>]+",
                  lambda m: m.group().rstrip("/").split("/")[-1], text)
    return text


def parse_time(value):
    if not isinstance(value, str):
        return None
    try:
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.replace(tzinfo=dt.timezone.utc) if result.tzinfo is None else result
    except ValueError:
        return None


def number(value, low, high):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and low <= value <= high)


def youtube_id(url):
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
        if host in {"youtu.be", "www.youtu.be"}:
            return parts.path.strip("/").split("/")[0]
        if host in {"youtube.com", "www.youtube.com", "m.youtube.com",
                    "youtube-nocookie.com", "www.youtube-nocookie.com"}:
            bits = parts.path.strip("/").split("/")
            if len(bits) > 1 and bits[0] in {"embed", "live", "shorts"}:
                return bits[1]
            return dict(parse_qsl(parts.query)).get("v")
    except (ValueError, TypeError):
        pass
    return None


def canonical_hls(url):
    try:
        p = urlsplit(url)
        if p.scheme != "https" or not p.hostname or p.username or p.password:
            raise ValueError("HLS requires a public HTTPS URL without credentials")
        query = parse_qsl(p.query, keep_blank_values=True)
        if any(k.lower() in SECRET_QUERY or k.lower().startswith("x-amz-")
               or re.search(r"token|signature|expires|auth_key|wssecret|wstime", k, re.I)
               for k, _ in query):
            raise ValueError("HLS URL contains credentials or an expiring token")
        if re.search(r"(?:^|/)(?:token|signature|expires|auth)=", p.path, re.I):
            raise ValueError("HLS path contains an expiring credential")
        if re.search(r"\.(?:jpg|jpeg|png|gif|webp|mp4|webm)$", p.path, re.I):
            raise ValueError("HLS URL points to a still image or finite video file")
        host = p.hostname.lower() + (f":{p.port}" if p.port and p.port != 443 else "")
        query = sorted((k, v) for k, v in query if not k.lower().startswith("utm_"))
        return urlunsplit(("https", host, p.path, urlencode(query), ""))
    except (TypeError, AttributeError) as exc:
        raise ValueError("HLS URL missing") from exc


def media_key(c):
    kind = c.get("kind")
    if kind == "youtube":
        vid = c.get("video_id") or youtube_id(c.get("url", ""))
        if not isinstance(vid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
            raise ValueError("YouTube video_id invalid")
        from_url = youtube_id(c.get("url", ""))
        if from_url and from_url != vid:
            raise ValueError("YouTube URL and video_id disagree")
        return "youtube:" + vid
    if kind == "hls":
        return "hls:" + canonical_hls(c.get("url"))
    raise ValueError("Unsupported kind; only live YouTube and public HLS are accepted")


def identity_keys(c):
    """Only evidence-backed physical keys, never geographic proximity alone."""
    keys = set()
    try:
        keys.add(media_key(c))
    except ValueError:
        if c.get("video_id"):
            keys.add("youtube:" + c["video_id"])
    for key in ("physical_scene_id", "scene_id", "canonical_scene_id"):
        if c.get(key):
            keys.add("scene:" + norm(c[key]))
    for key in ("replaces_video_id", "previous_video_id"):
        if c.get(key):
            keys.add("youtube:" + c[key])
    for vid in c.get("previous_video_ids", []):
        keys.add("youtube:" + vid)
    evidence = c.get("source_provenance") or c.get("provenance") or {}
    if isinstance(evidence, dict) and evidence.get("single_camera_page") is True:
        url = evidence.get("source_url") or c.get("watch_url")
        if url:
            keys.add("operator-scene:" + url.rstrip("/"))
    name = norm(c.get("name", ""))
    name = re.sub(r"\b(?:live|webcam|camera|cam|24 7|4k|hd)\b", "", name)
    name = " ".join(name.split())
    location = norm(c.get("location") or c.get("place") or "")
    country = norm(c.get("country", ""))
    if name and location and country:
        keys.add(f"named-scene:{country}:{location}:{name}")
    pose = c.get("pose") or {}
    lat, lng = c.get("lat", pose.get("lat")), c.get("lng", pose.get("lng"))
    if name and country and number(lat, -90, 90) and number(lng, -180, 180):
        keys.add(f"mapped-scene:{country}:{name}:{lat:.3f}:{lng:.3f}")
    return keys


def inspect_candidate(c, now, max_age_days=2, include_reviewed_reserves=False):
    """Return disposition and reasons. Positive metadata alone never suffices."""
    if not isinstance(c, dict):
        return "rejected", ["Candidate must be an object"]
    reasons = []
    if hold_paths(c):
        return "rejected", ["Explicit import hold: " + ", ".join(hold_paths(c))]
    try:
        media_key(c)
    except ValueError as exc:
        reasons.append(str(exc))
    score = c.get("quality_score")
    if not isinstance(score, int) or isinstance(score, bool) or not 0 <= score <= 5:
        reasons.append("Shot score missing or outside integer0–5")
    elif score <= 1:
        return "rejected", [f"Shot score{score}: below acceptable scene quality"]
    elif score == 2:
        reasons.append("Score2 mostly static/weak scene: reserve only")
    v = c.get("validation") or {}
    if not isinstance(v, dict):
        return "rejected", ["Validation must be an object"]
    live = v.get("is_live", v.get("isLiveNow", v.get("is_live_now")))
    playable = v.get("playable", v.get("playableInEmbed", v.get("playable_in_embed")))
    if live is False or playable is False:
        return "rejected", ["Explicit live/playable failure"]
    if live is not True:
        reasons.append("Positive current liveness evidence missing")
    if playable is not True:
        reasons.append("Positive playback/embedding evidence missing")
    checked = parse_time(v.get("checked_at") or v.get("verified_at"))
    if checked is None:
        reasons.append("Dated live/playable verification missing")
    elif checked > now + dt.timedelta(minutes=5) or now - checked > dt.timedelta(days=max_age_days):
        reasons.append("Live/playable verification is stale or future-dated")
    if not v.get("method"):
        reasons.append("Liveness verification method missing")
    qe = c.get("quality_evidence") or {}
    if not isinstance(qe, dict):
        reasons.append("Structured visual inspection evidence missing")
        qe = {}
    method = norm(qe.get("method", "")).replace(" ", "_")
    explicit_inspection = qe.get("visual_inspected") is True or qe.get("actual_visual_inspection") is True
    descriptive_method = norm(qe.get("method", ""))
    described_inspection = bool(re.search(
        r"visual inspection|playback (?:inspected|observed|viewed)|screenshot observations|screen inspected|"
        r"(?:frames?|contact sheet).*\b(?:inspected|viewed|reviewed)\b", descriptive_method))
    negated_inspection = bool(re.search(r"not (?:visually )?(?:inspected|viewed|reviewed)|"
                                        r"no visual inspection|thumbnail only", descriptive_method))
    visual = (explicit_inspection or method in VISUAL_METHODS or described_inspection) and not negated_inspection
    if not visual:
        reasons.append("Actual visual inspection not established")
    if method in {"thumbnail", "metadata", "title", "thumbnail_only"}:
        reasons.append("Thumbnail/metadata alone cannot establish an active scene")
    if v.get("motion_observed") is not True and qe.get("motion_observed") is not True:
        reasons.append("Observed motion evidence missing")
    if not (qe.get("source") or qe.get("source_url") or qe.get("evidence_path") or qe.get("evidence_paths")
            or qe.get("frames") or qe.get("path")):
        reasons.append("Visual evidence source/reference missing")
    inspected = parse_time(qe.get("checked_at") or qe.get("inspected_at") or qe.get("timestamp"))
    if inspected is None:
        reasons.append("Dated visual inspection missing")
    elif inspected > now + dt.timedelta(minutes=5) or now - inspected > dt.timedelta(days=max_age_days):
        reasons.append("Visual inspection is stale or future-dated")
    if not isinstance(c.get("quality_reason"), str) or not c["quality_reason"].strip():
        reasons.append("Observed shot-quality explanation missing")
    manual = c.get("manual_review") or {}
    reviewed = (include_reviewed_reserves and manual.get("accepted") is True
                and bool(manual.get("reviewer")) and bool(manual.get("reason"))
                and parse_time(manual.get("checked_at")) is not None)
    if (qe.get("provisional") is True or qe.get("prior_visual_inspection") is True) and not reviewed:
        reasons.append("Prior/provisional visual rating requires explicit manual review")
    pose = c.get("pose") or {}
    if not number(c.get("lat", pose.get("lat")), -90, 90) or not number(c.get("lng", pose.get("lng")), -180, 180):
        reasons.append("Research coordinates missing or invalid")
    for field in ("name", "country", "category", "provider", "timezone", "coordinate_confidence"):
        if not isinstance(c.get(field), str) or not c[field].strip():
            reasons.append(f"Required researched field missing: {field}")
    if not (c.get("location") or c.get("place")):
        reasons.append("Location missing")
    tags = c.get("tags")
    if not isinstance(tags, list) or not tags or any(not isinstance(t, str) or not t.strip() for t in tags):
        reasons.append("Search tags missing or invalid")
    elif not {"indoor", "outdoor", "underwater"}.intersection(t.lower() for t in tags):
        reasons.append("Search tags need a researched indoor/outdoor/underwater classification")
    if not (c.get("watch_url") or c.get("source_url")):
        reasons.append("Public operator/watch source missing")
    if c.get("replay") is True or v.get("replay") is True or c.get("kind") in {"image", "snapshot"}:
        return "rejected", ["Replay/static image is outside this expansion"]
    return ("reserve", reasons) if reasons else ("accepted", [])


def normalize(c, source_file):
    pose = c.get("pose") or {}
    lat, lng = c.get("lat", pose.get("lat")), c.get("lng", pose.get("lng"))
    vid = c.get("video_id") or youtube_id(c.get("url", ""))
    tags = list(dict.fromkeys(t.strip().lower() for t in c["tags"]))
    tags.extend(tag for tag in (f"quality-{c['quality_score']}", f"score-{c['quality_score']}") if tag not in tags)
    # Add only known geographic/category strings; don't invent subject aliases.
    for text in (c["country"], c.get("location") or c.get("place"), c["category"]):
        for tag in text.split(","):
            tag = tag.strip().lower()
            if tag and tag not in tags:
                tags.append(tag)
    v = c["validation"]
    checked = v.get("checked_at") or v.get("verified_at")
    record = {"name": c["name"], "location": c.get("location") or c.get("place"),
              "country": c["country"], "category": c["category"], "provider": c["provider"],
              "kind": c["kind"], "url": c.get("url"),
              "watch_url": c.get("watch_url") or c.get("source_url"),
              "requires_login": False, "last_verified": checked[:10],
              "notes": c.get("notes", ""), "timezone": c["timezone"], "tags": tags,
              "curated_tags": list(tags),
              "scene_set": "expansion500", "in_sets": ["expansion500"],
              "pose": {"lat": lat, "lng": lng, "alt_m": None, "heading": None,
                       "pitch": None, "fov": None, "aligned": False, "confidence": "low",
                       "basis": c["coordinate_confidence"], "position_kind": "approximate-site"},
              "quality_score": c["quality_score"], "quality_reason": c["quality_reason"],
              "quality_evidence": copy.deepcopy(c["quality_evidence"]),
              "validation": copy.deepcopy(v),
              "provenance": {"research_file": Path(source_file).name,
                             "source": copy.deepcopy(c.get("source_provenance") or c.get("provenance")
                                                     or c.get("source_url") or c.get("watch_url"))},
              "check": {"verdict": "live", "checked": checked, "method": v["method"],
                        "embed": "verified", "embed_reason": "Positive source playback evidence; see validation."},
              "audio": c.get("audio", "unknown"), "ads": c.get("ads", "unknown")}
    if c["kind"] == "youtube":
        record["video_id"] = vid
        record["url"] = f"https://www.youtube.com/embed/{vid}?autoplay=1&mute=1"
    else:
        record["url"] = canonical_hls(c["url"])
    for key in ("physical_scene_id", "scene_id", "canonical_scene_id", "previous_video_ids",
                "replaces_video_id", "previous_video_id", "active_local_hours_hint", "seasonal_hint",
                "attribution_url", "attribution_text"):
        if c.get(key) is not None:
            record[key] = copy.deepcopy(c[key])
    return public_value(record)


def unpack(data):
    if isinstance(data, list):
        return [(x, "candidates") for x in data]
    if isinstance(data, dict):
        rows = []
        for key in ("candidates", "accepted", "reserve", "reserves", "rejected"):
            if isinstance(data.get(key), list):
                rows.extend((x, key) for x in data[key])
        return rows
    raise ValueError("Regional file must contain an array or candidates/accepted/reserve lists")


def read_inputs(paths):
    rows = []
    for path in sorted(set(Path(p).resolve() for p in paths)):
        data = load(path)
        source_hold = isinstance(data, dict) and (bool(data.get("do_not_auto_import")) or data.get("hold") is True)
        for index, (candidate, bucket) in enumerate(unpack(data)):
            lane = path.stem if path.stem in LANES else path.parent.name
            rows.append({"candidate": candidate, "source": str(path), "lane": lane,
                         "source_bucket": bucket, "source_index": index, "source_hold": source_hold})
    return rows


def build(catalog, rows, *, now=None, max_age_days=2, include_reviewed_reserves=False, limit=500):
    now = now or dt.datetime.now(dt.timezone.utc)
    existing = catalog.get("cameras")
    if not isinstance(existing, list):
        raise ValueError("Catalog requires a cameras array")
    occupied = {}
    for c in existing:
        for key in identity_keys(c):
            occupied.setdefault(key, c.get("video_id") or c.get("url") or c.get("name"))
    report = {"generated_at": now.isoformat(), "existing_count": len(existing),
              "requested_additions": limit, "accepted": [], "reserve": [], "rejected": [],
              "duplicates": [], "input_count": len(rows), "lane_counts": {}}
    additions = []
    def order(row):
        c = row["candidate"] if isinstance(row["candidate"], dict) else {}
        score = c.get("quality_score")
        rank = score if isinstance(score, int) and not isinstance(score, bool) else -1
        disposition, _ = inspect_candidate(c, now, max_age_days, include_reviewed_reserves)
        priority = {"accepted": 0, "reserve": 1, "rejected": 2}[disposition]
        if row["source_bucket"] == "rejected" or row.get("source_hold"):
            priority = 2
        return (priority, -rank, row["lane"], norm(c.get("name", "")), c.get("video_id", ""), row["source_index"])
    for row in sorted(rows, key=order):
        c = row["candidate"]
        summary = {"name": c.get("name") if isinstance(c, dict) else None,
                   "video_id": c.get("video_id") if isinstance(c, dict) else None,
                   "lane": row["lane"], "source_file": Path(row["source"]).name,
                   "quality_score": c.get("quality_score") if isinstance(c, dict) else None}
        disposition, reasons = inspect_candidate(c, now, max_age_days, include_reviewed_reserves)
        if row.get("source_hold"):
            disposition, reasons = "rejected", ["Research source file explicitly held for review"]
        elif row["source_bucket"] == "rejected":
            disposition, reasons = "rejected", ["Research lane explicitly rejected this entry"]
        if isinstance(c, dict):
            keys = identity_keys(c)
            matches = sorted(keys & occupied.keys())
            if matches:
                report["duplicates"].append({**summary, "duplicate_of": occupied[matches[0]],
                                               "matched_keys": matches})
                continue
        else:
            keys = set()
        if disposition == "accepted" and len(additions) >= limit:
            disposition, reasons = "reserve", ["Qualified but requested addition limit reached"]
        if disposition == "accepted":
            additions.append(normalize(c, row["source"]))
        for key in keys:
            occupied[key] = c.get("video_id") or c.get("url") or c.get("name")
        report[disposition].append({**summary, "reasons": reasons})
    result = copy.deepcopy(catalog)
    result["cameras"].extend(additions)
    assert result["cameras"][:len(existing)] == existing
    for lane in sorted({x["lane"] for x in rows}):
        report["lane_counts"][lane] = {key: sum(x["lane"] == lane for x in report[key])
                                      for key in ("accepted", "reserve", "rejected", "duplicates")}
    report["counts"] = {key: len(report[key]) for key in ("accepted", "reserve", "rejected", "duplicates")}
    report["new_total"] = len(result["cameras"])
    report["shortfall"] = max(0, limit - len(additions))
    report["rating_distribution"] = dict(sorted(Counter(x["quality_score"] for x in additions).items()))
    report["existing_values_preserved"] = True
    return result, public_value(report)


def discover(directory):
    paths = []
    for lane in LANES:
        for path in (directory / f"{lane}.json",):
            if path.is_file():
                paths.append(path)
    return paths


def atomic_json(path, data, newline="\n", expected=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").replace("\n", newline)
    fd, name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload.encode("utf-8"))
        if expected is not None and path.read_bytes() != expected:
            raise ValueError("Catalog changed before replacement; rerun before writing")
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=ROOT / "cameras.json")
    parser.add_argument("--research", type=Path, default=ROOT / "research/expansion500")
    parser.add_argument("--input", action="append", type=Path, default=[])
    parser.add_argument("--report", type=Path)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--max-age-days", type=int, default=2)
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--include-reviewed-reserves", action="store_true")
    args = parser.parse_args(argv)
    if args.limit < 1 or args.max_age_days < 1:
        parser.error("limit and max-age-days must be positive")
    paths = args.input or discover(args.research)
    rows = read_inputs(paths)
    if not rows:
        print(json.dumps({"mode": "write" if args.write else "dry-run", "status": "waiting-for-regional-candidates",
                          "catalog_changed": False, "report_written": False}))
        return 0
    original = args.catalog.read_bytes()
    catalog = json.loads(original.decode("utf-8-sig"))
    result, report = build(catalog, rows, max_age_days=args.max_age_days,
                           include_reviewed_reserves=args.include_reviewed_reserves, limit=args.limit)
    report["mode"] = "write" if args.write else "dry-run"
    report["catalog_changed"] = False
    if args.write and report["counts"]["accepted"]:
        if args.catalog.read_bytes() != original:
            raise ValueError("Catalog changed during review; rerun before writing")
        backup = args.research / "backups" / ("cameras-" + hashlib.sha256(original).hexdigest()[:16] + ".json")
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            backup.write_bytes(original)
        atomic_json(args.catalog, result, "\r\n" if b"\r\n" in original else "\n", expected=original)
        if load(args.catalog) != result:
            raise ValueError("Catalog read-back did not match intended result")
        report["catalog_changed"] = True
        report["backup"] = backup.name
    atomic_json(args.report or args.research / "import-report.json", report)
    print(json.dumps({k: report[k] for k in ("mode", "counts", "existing_count", "new_total", "shortfall", "catalog_changed")}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(1)
