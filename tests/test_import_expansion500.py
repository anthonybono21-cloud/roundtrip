"""Meaningful admission, duplicate, preservation, and write-safety tests."""
import contextlib
import copy
import datetime as dt
import io
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE = {"__name__": "import_expansion500_test_module", "__file__": str(ROOT / "tools/import-expansion500.py")}
exec(compile(Path(MODULE["__file__"]).read_text(encoding="utf-8"), MODULE["__file__"], "exec"), MODULE)
NOW = dt.datetime.now(dt.timezone.utc)


def candidate(vid="newcam00001", score=4, name="Central Square"):
    return {"video_id": vid, "name": name, "location": "Example City, Example State",
            "country": "Example Country", "category": "square", "provider": "City operator",
            "kind": "youtube", "url": "https://www.youtube.com/embed/" + vid,
            "watch_url": "https://operator.example/cameras/central-square",
            "lat": 40.0, "lng": -75.0, "timezone": "America/New_York",
            "coordinate_confidence": "Approximate operator-published site, mount unverified",
            "tags": ["outdoor", "people", "walking", "square"], "quality_score": score,
            "quality_reason": "Unobstructed plaza framing; several pedestrians cross between samples.",
            "quality_evidence": {"method": "paired_frames", "checked_at": NOW.isoformat(),
                                 "source": "samples/central-square.jpg", "visual_inspected": True},
            "validation": {"checked_at": NOW.isoformat(), "is_live": True, "playable": True,
                           "method": "YouTube player metadata and sampled decode",
                           "motion_observed": True, "resolution": [1920, 1080]},
            "notes": "Activity varies by hour."}


def row(c, lane="us-east", index=0):
    return {"candidate": c, "source": f"{lane}.json", "lane": lane,
            "source_bucket": "candidates", "source_index": index}


def catalog(*cameras):
    return {"set": "existing", "unknown_top_level": {"keep": [1, 2, None]}, "cameras": list(cameras)}


class AdmissionTests(unittest.TestCase):
    def build(self, *candidates, original=None, **kwargs):
        return MODULE["build"](original or catalog(), [row(c, index=i) for i, c in enumerate(candidates)],
                               now=NOW, **kwargs)

    def test_valid_scene_preserves_existing_values_and_unknown_fields(self):
        old = {"kind": "youtube", "video_id": "oldcam00001", "name": "Old", "opaque": {"x": None}}
        original = catalog(old)
        result, report = self.build(candidate(), original=original)
        self.assertEqual(result["cameras"][0], old)
        self.assertEqual(result["unknown_top_level"], original["unknown_top_level"])
        self.assertEqual(original["cameras"], [old])
        self.assertEqual(report["counts"]["accepted"], 1)
        new = result["cameras"][1]
        self.assertIsNone(new["pose"]["heading"])
        self.assertIsNone(new["pose"]["alt_m"])
        self.assertFalse(new["pose"]["aligned"])
        self.assertIn("quality-4", new["tags"])
        self.assertIn("score-4", new["tags"])
        self.assertIn("example country", new["tags"])

    def test_researched_tags_and_publisher_credit_survive_import_and_retag(self):
        c = candidate()
        c['attribution_url'] = 'https://operator.example/'
        c['attribution_text'] = 'City camera operator'
        c['tags'].append('fedex')
        result, _ = self.build(c)
        new = result['cameras'][0]
        self.assertEqual(new['attribution_url'], c['attribution_url'])
        self.assertEqual(new['attribution_text'], c['attribution_text'])
        import runpy
        tagger = runpy.run_path(str(ROOT / 'tag.py'))
        self.assertIn('fedex', tagger['tags_for'](new))
        self.assertIn('quality-4', tagger['tags_for'](new))

    def test_score_three_is_honest_admission_two_reserve_zero_one_reject(self):
        cams = [candidate(f"newcam0000{s}", s, f"Square{s}") for s in range(6)]
        _, report = self.build(*cams)
        self.assertEqual(report["counts"], {"accepted": 3, "reserve": 1, "rejected": 2, "duplicates": 0})
        self.assertEqual(report["rating_distribution"], {"3": 1, "4": 1, "5": 1})

    def test_metadata_only_and_single_thumbnail_do_not_prove_motion(self):
        c = candidate()
        c["validation"]["motion_observed"] = False
        _, report = self.build(c)
        self.assertEqual(report["counts"]["accepted"], 0)
        self.assertIn("Observed motion evidence missing", report["reserve"][0]["reasons"])
        c["validation"]["motion_observed"] = True
        c["quality_evidence"]["method"] = "thumbnail"
        _, report = self.build(c)
        self.assertEqual(report["counts"]["accepted"], 0)

    def test_negative_live_playable_and_replay_rejected(self):
        for field in ("is_live", "playable"):
            c = candidate()
            c["validation"][field] = False
            _, report = self.build(c)
            self.assertEqual(report["counts"]["rejected"], 1)
        c = candidate()
        c["replay"] = True
        _, report = self.build(c)
        self.assertEqual(report["counts"]["rejected"], 1)

    def test_descriptive_lane_evidence_supported_but_negated_inspection_fails(self):
        c = candidate()
        c["quality_evidence"] = {"method": "Human visual inspection of ffmpeg-decoded frame pair",
                                 "checked_at": NOW.isoformat(), "evidence_path": "frames/view.jpg"}
        _, report = self.build(c)
        self.assertEqual(report["counts"]["accepted"], 1)
        c["quality_evidence"]["method"] = "Paired frames extracted but not visually inspected"
        _, report = self.build(c)
        self.assertEqual(report["counts"]["accepted"], 0)

    def test_expired_or_future_evidence_never_admitted(self):
        for delta in (-3, 1):
            c = candidate()
            c["validation"]["checked_at"] = (NOW + dt.timedelta(days=delta)).isoformat()
            _, report = self.build(c)
            self.assertEqual(report["counts"]["accepted"], 0)

    def test_hold_recurses_into_historic_validation_and_sources(self):
        c = candidate()
        c["quality_evidence"]["previous_record"] = {"do_not_auto_import": True}
        _, report = self.build(c)
        self.assertEqual(report["counts"]["rejected"], 1)

    def test_prior_visual_rating_needs_explicit_review_and_live_gate_still_applies(self):
        c = candidate()
        c["quality_evidence"]["provisional"] = True
        c["manual_review"] = {"accepted": True, "reviewer": "operator", "checked_at": NOW.isoformat(),
                              "reason": "Reviewed cited paired frames and scene is active."}
        _, report = self.build(c)
        self.assertEqual(report["counts"]["accepted"], 0)
        _, report = self.build(c, include_reviewed_reserves=True)
        self.assertEqual(report["counts"]["accepted"], 1)
        c["validation"]["is_live"] = False
        _, report = self.build(c, include_reviewed_reserves=True)
        self.assertEqual(report["counts"]["accepted"], 0)

    def test_boolean_score_missing_coords_and_unknown_orientation(self):
        c = candidate()
        c["quality_score"] = True
        c["lat"] = None
        _, report = self.build(c)
        self.assertEqual(report["counts"]["accepted"], 0)

    def test_exact_media_duplicate_and_restarted_id_alias(self):
        old = candidate("oldcam00001")
        same = candidate("oldcam00001", name="Renamed")
        restarted = candidate("newcam00002", name="New name")
        restarted["previous_video_ids"] = ["oldcam00001"]
        _, report = self.build(same, restarted, original=catalog(old))
        self.assertEqual(report["counts"]["duplicates"], 2)

    def test_physical_scene_match_and_distinct_same_venue_views(self):
        old = candidate("oldcam00001")
        restarted = candidate("newcam00002")
        _, report = self.build(restarted, original=catalog(old))
        self.assertEqual(report["counts"]["duplicates"], 1)
        tank1 = candidate("newcam00003", name="Aquarium Shark Tank")
        tank2 = candidate("newcam00004", name="Aquarium Penguin Pool")
        _, report = self.build(tank1, tank2)
        self.assertEqual(report["counts"]["accepted"], 2)

    def test_strongest_qualified_duplicate_wins_deterministically(self):
        bad = candidate(score=5)
        bad["validation"]["motion_observed"] = False
        good = candidate(score=4)
        a, ra = self.build(bad, good)
        b, rb = self.build(good, bad)
        self.assertEqual(a, b)
        self.assertEqual(a["cameras"][0]["quality_score"], 4)
        self.assertEqual(ra["counts"]["duplicates"], 1)
        self.assertEqual(ra["counts"], rb["counts"])

    def test_limit_prefers_four_five_without_inflating_three(self):
        low = candidate("newcam00003", score=3, name="Good View")
        high = candidate("newcam00005", score=5, name="Exceptional View")
        result, report = self.build(low, high, limit=1)
        self.assertEqual(result["cameras"][0]["quality_score"], 5)
        self.assertEqual(report["counts"]["reserve"], 1)

    def test_hls_canonicalization_and_token_rejection(self):
        canonical = MODULE["canonical_hls"]
        self.assertEqual(canonical("https://MEDIA.example:443/live.m3u8?b=2&a=1&utm_source=x#x"),
                         "https://media.example/live.m3u8?a=1&b=2")
        for url in ("https://host/live.m3u8?token=secret", "https://host/live.m3u8?X-Amz-Signature=abc",
                    "https://host/live.m3u8?expires=123", "https://user:pass@host/live.m3u8",
                    "http://host/live.m3u8", "https://host/live.m3u8?authToken=secret",
                    "https://host/snapshot.jpg", "https://host/replay.mp4"):
            with self.assertRaises(ValueError):
                canonical(url)
        c = candidate()
        c["kind"] = "hls"
        c.pop("video_id")
        c["url"] = "https://media.example/live.m3u8?b=2&a=1"
        old = copy.deepcopy(c)
        old["url"] = "https://media.example/live.m3u8?a=1&b=2&utm_source=y"
        _, report = self.build(c, original=catalog(old))
        self.assertEqual(report["counts"]["duplicates"], 1)

    def test_private_paths_removed_from_published_evidence(self):
        c = candidate()
        c["quality_evidence"]["source"] = r"C:\Users\Anthony\private\frames\scene.jpg"
        c["notes"] = "Observed frame at C:/Users/Anthony/private/scene.jpg"
        result, _ = self.build(c)
        payload = json.dumps(result)
        self.assertNotIn("Anthony", payload)
        self.assertIn("scene.jpg", payload)


class CommandTests(unittest.TestCase):
    def test_dry_run_write_and_repeat_preserve_original_and_report_shortfall(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            cat = base / "cameras.json"
            research = base / "research"
            research.mkdir()
            source = research / "us-east.json"
            original = catalog({"kind": "youtube", "video_id": "oldcam00001", "unknown": [False, None]})
            original_bytes = (json.dumps(original, indent=2) + "\n").replace("\n", "\r\n").encode()
            cat.write_bytes(original_bytes)
            source.write_text(json.dumps([candidate()]), encoding="utf-8")
            args = ["--catalog", str(cat), "--research", str(research)]
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(MODULE["main"](args), 0)
            self.assertEqual(cat.read_bytes(), original_bytes)
            report = json.loads((research / "import-report.json").read_text())
            self.assertEqual(report["shortfall"], 499)
            with contextlib.redirect_stdout(io.StringIO()):
                MODULE["main"](args + ["--write"])
            result = json.loads(cat.read_text())
            self.assertEqual(result["cameras"][:1], original["cameras"])
            self.assertEqual(result["unknown_top_level"], original["unknown_top_level"])
            self.assertIn(b"\r\n", cat.read_bytes())
            written = cat.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                MODULE["main"](args + ["--write"])
            self.assertEqual(cat.read_bytes(), written)
            backups = list((research / "backups").glob("*.json"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), original_bytes)

    def test_no_completed_lane_data_means_no_report_or_catalog_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            research = Path(folder)
            (research / "us-east").mkdir()
            (research / "us-east/pool.json").write_text(json.dumps([candidate()]))
            with contextlib.redirect_stdout(io.StringIO()):
                result = MODULE["main"](["--research", str(research), "--catalog", str(research / "absent.json")])
            self.assertEqual(result, 0)
            self.assertFalse((research / "import-report.json").exists())

    def test_changed_catalog_atomic_guard(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "catalog.json"
            path.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "changed"):
                MODULE["atomic_json"](path, {}, expected=b"original")
            self.assertEqual(path.read_bytes(), b"changed")
            self.assertEqual(list(Path(folder).glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
