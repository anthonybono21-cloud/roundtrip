#!/usr/bin/env python3
"""Validate an explicit camera expansion plan. Dry run unless --apply is given.

The plan holds dated research evidence separately from the application catalog.
Existing catalog entries and metadata are preserved verbatim as JSON values.
No network calls, video guesses, camera-angle defaults, or implicit selections.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":")).encode()).hexdigest()


def valid_number(value, minimum, maximum):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and minimum <= value <= maximum)


def reject_import_hold(value, label):
    """Holds anywhere in the record remain binding after metadata refreshes."""
    if isinstance(value, dict):
        require(not value.get("do_not_auto_import"),
                f"Import held at {label}: " + str(value.get("conditional_reason") or "do_not_auto_import"))
        for key, child in value.items():
            reject_import_hold(child, f"{label}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_import_hold(child, f"{label}[{index}]")


def reject_current_source_hold(entry):
    # A research agent may add a hold after the plan was snapshotted. Check
    # the current source candidate too; its absence is a review failure.
    source = entry.get("source_file")
    if not source:
        return
    path = ROOT / source
    require(path.is_file(), f"Candidate source missing: {source}")
    data = load(path)
    records = data if isinstance(data, list) else data.get("candidates", [])
    vid = entry["candidate"]["video_id"]
    current = [x for x in records if x.get("video_id") == vid]
    require(len(current) == 1, f"Candidate {vid} missing/duplicated in current source: {source}")
    reject_import_hold(current[0], f"current source {source}/{vid}")


def normalize(entry):
    """Convert a research candidate, preserving truth of its dated checks."""
    reject_import_hold(entry, "plan entry")
    reject_current_source_hold(entry)
    c = entry["candidate"]
    vid = c.get("video_id", "")
    require(re.fullmatch(r"[A-Za-z0-9_-]{11}", vid), f"Invalid video ID: {vid}")
    pose = c.get("pose") or {}
    lat, lng = c.get("lat", pose.get("lat")), c.get("lng", pose.get("lng"))
    require(valid_number(lat, -90, 90) and valid_number(lng, -180, 180),
            f"Missing/invalid coordinates: {vid}")
    location = c.get("place") or c.get("location")
    for label, value in (("name", c.get("name")), ("country", c.get("country")),
                         ("location", location), ("timezone", c.get("timezone"))):
        require(isinstance(value, str) and value.strip(), f"Missing {label}: {vid}")
    validation = c.get("validation") or c.get("check") or {}
    live = (validation.get("isLiveNow") is True
            or validation.get("is_live_now") is True
            or validation.get("current_live_ui_verified") is True)
    embed_now = (validation.get("playableInEmbed") is True
                 or validation.get("playable_in_embed") is True)
    embed_prior = validation.get("prior_embed_verified") is True
    require(live, f"No positive live evidence: {vid}")
    require(embed_now or embed_prior, f"No positive embed evidence: {vid}")
    status = validation.get("playabilityStatus", validation.get("playability_status"))
    require(status in (None, "OK"), f"Unplayable candidate: {vid}: {status}")
    checked = validation.get("checked_at") or validation.get("verified_at")
    require(isinstance(checked, str) and re.match(r"\d{4}-\d{2}-\d{2}", checked),
            f"Missing dated verification: {vid}")
    checked_day = dt.date.fromisoformat(checked[:10])
    require(checked_day <= dt.datetime.now(dt.timezone.utc).date(),
            f"Future verification date: {vid}")
    if embed_prior:
        require(validation.get("prior_embed_checked_at"),
                f"Missing prior embed check date: {vid}")
    tags = list(dict.fromkeys(c.get("tags") or []))
    category = c.get("category") or next((x for x in tags if x not in
                   {"indoor", "outdoor", "live", "public-webcam", "people"}), "scene")
    evidence = c.get("source_evidence") or c.get("prior_research") or {}
    basis = (evidence.get("geolocation_basis") or pose.get("basis")
             or c.get("coordinate_confidence") or "Approximate researched site position.")
    # These source poses explicitly contain defaults, not surveyed camera angles.
    # Null means unknown. Current globe and satellite journeys use lat/lng only.
    new_pose = {"lat": lat, "lng": lng, "alt_m": None, "heading": None,
                "pitch": None, "fov": None, "aligned": False,
                "confidence": "low", "basis": basis,
                "position_kind": "approximate-site",
                "orientation_status": "unknown"}
    notes = c.get("notes") or c.get("description") or ""
    embed_reason = ("Positive YouTube embed metadata; device playback untested."
                    if embed_now else "Current live UI verified; embed evidence is dated "
                    + validation["prior_embed_checked_at"] + "; current iframe untested.")
    record = {
        "name": c["name"], "location": location, "country": c["country"],
        "category": category, "provider": c.get("provider") or c.get("operator") or "Unknown",
        "kind": "youtube", "video_id": vid,
        "url": f"https://www.youtube.com/embed/{vid}?autoplay=1&mute=1",
        "watch_url": f"https://www.youtube.com/watch?v={vid}",
        "requires_login": False, "last_verified": checked[:10], "notes": notes,
        "scene_set": "camera-expansion-2026-09-18", "pose": new_pose,
        "timezone": c["timezone"], "in_sets": ["camera-expansion-2026-09-18"],
        "check": {"verdict": "live", "checked": checked,
                  "method": validation.get("method") or validation.get("level") or "metadata",
                  "reason": "Live broadcast evidence; present scene activity is not guaranteed.",
                  "embed": "metadata-ok" if embed_now else "prior-evidence",
                  "embed_reason": embed_reason, "in_app_playback_verified": False,
                  "research_ref": "research/camera-expansion-plan.json#" + vid},
        "audio": "unknown", "audio_basis": "Not verified by listening.",
        "tags": tags, "ads": "unknown"
    }
    for key in ("active_local_hours_hint", "seasonal_hint", "night_hint", "replay_risk"):
        if c.get(key) is not None:
            record[key] = c[key]
    return record


def build(catalog, plan, include_prior=True):
    require(plan.get("status") == "ready", "Selection is not finalized: plan.status must be ready")
    selected = plan.get("selected", [])
    prior = plan.get("prior_additions", []) if include_prior else []
    require(len(selected) == 100, f"Expected exactly100 additional cameras, got {len(selected)}")
    if include_prior:
        require(len(prior) == 11, f"Expected11 prior additions, got {len(prior)}")
    excluded = set(plan.get("previous_11_ids", []))
    selected_ids = [x["candidate"]["video_id"] for x in selected]
    require(not (set(selected_ids) & excluded), "Prior11 incorrectly counted toward new100")
    records = [normalize(x) for x in prior + selected]
    ids = [x["video_id"] for x in records]
    require(len(set(ids)) == len(ids), "Duplicate IDs within expansion")
    semantic = [x["semantic_key"] for x in prior + selected]
    require(len(set(semantic)) == len(semantic), "Duplicate semantic views within expansion")
    existing = catalog.get("cameras")
    require(isinstance(existing, list), "Catalog cameras must be an array")
    baseline = plan.get("baseline", {})
    base_count = baseline.get("camera_count")
    require(isinstance(base_count, int) and len(existing) >= base_count,
            "Catalog is shorter than reviewed baseline")
    require(digest(existing[:base_count]) == baseline.get("cameras_sha256"),
            "Existing baseline camera values changed; rebase/review plan before importing")
    existing_by_id = {x.get("video_id"): x for x in existing}
    require(len(existing_by_id) == len(existing), "Existing catalog contains duplicate/missing IDs")
    additions, already = [], []
    for record in records:
        vid = record["video_id"]
        if vid in existing_by_id:
            require(existing_by_id[vid] == record,
                    f"Candidate {vid} already exists with different data; manual review required")
            already.append(vid)
        else:
            additions.append(record)
    result = copy.deepcopy(catalog)
    result["cameras"].extend(additions)
    require(result["cameras"][:len(existing)] == existing, "Existing records unexpectedly changed")
    return result, {"existing": len(existing), "new": len(additions),
                    "already_imported": len(already), "total": len(result["cameras"]),
                    "selected_new_request": len(selected), "prior_request": len(prior)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, default=ROOT / "research/camera-expansion-plan.json")
    parser.add_argument("--catalog", type=Path, default=ROOT / "cameras.json")
    parser.add_argument("--apply", action="store_true", help="Write after all validation passes")
    parser.add_argument("--skip-prior", action="store_true", help="Import only the new100")
    args = parser.parse_args()
    initial = args.catalog.read_bytes()
    catalog = json.loads(initial.decode("utf-8-sig"))
    result, report = build(catalog, load(args.plan), not args.skip_prior)
    report["mode"] = "apply" if args.apply else "dry-run"
    if args.apply and report["new"]:
        require(args.catalog.read_bytes() == initial, "Catalog changed during validation; retry")
        backup_dir = args.plan.parent / "camera-import-backups"
        backup_dir.mkdir(exist_ok=True)
        backup = backup_dir / ("cameras-" + hashlib.sha256(initial).hexdigest()[:16] + ".json")
        if not backup.exists():
            backup.write_bytes(initial)
        newline = "\r\n" if b"\r\n" in initial else "\n"
        payload = (json.dumps(result, indent=2, ensure_ascii=False) + "\n").replace("\n", newline)
        temporary = args.catalog.with_name(args.catalog.name + ".import-tmp")
        require(not temporary.exists(), f"Temporary file exists: {temporary}")
        temporary.write_bytes(payload.encode("utf-8"))
        try:
            require(args.catalog.read_bytes() == initial, "Catalog changed before write; retry")
            os.replace(temporary, args.catalog)
        finally:
            if temporary.exists():
                temporary.unlink()
        require(load(args.catalog) == result, "Read-back verification failed")
        report["backup"] = str(backup)
        report["existing_values_preserved"] = True
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(1)
