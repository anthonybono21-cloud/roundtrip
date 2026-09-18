#!/usr/bin/env python3
"""Applies Roundtrip's own settings to the Xcode project Capacitor generates.

`npx cap add ios` writes a stock project; everything below is what Roundtrip
needs on top of it, kept here as a script rather than as clicks in Xcode so the
project can be thrown away and regenerated without losing any of it:

  * the two Swift files that make up the map, added to the App target
  * Mac Catalyst switched on, which is the whole Mac app
  * iPhone and iPad both, portrait and landscape
  * a version number that means something

Idempotent: run it as often as you like.

    pip install pbxproj && python3 configure-project.py
"""

import sys
from pathlib import Path

try:
    from pbxproj import XcodeProject
except ImportError:
    sys.exit("pbxproj is not installed:  pip install pbxproj")

HERE = Path(__file__).resolve().parent
PROJECT = HERE / "App" / "App.xcodeproj" / "project.pbxproj"

SOURCES = ["RoundtripMapPlugin.swift", "RoundtripMapViewController.swift"]

SETTINGS = {
    # Mac Catalyst is the Mac app: the same iPad build, running natively on
    # macOS, MapKit and all. Nothing else in the project changes.
    "SUPPORTS_MACCATALYST": "YES",
    # Keep one bundle identifier across iPhone, iPad and Mac rather than
    # letting Xcode prefix the Mac one with "maccatalyst.".
    "DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER": "NO",
    # iPhone and iPad.
    "TARGETED_DEVICE_FAMILY": "1,2",
    "MARKETING_VERSION": "1.0",
    "CURRENT_PROJECT_VERSION": "1",
    "SWIFT_VERSION": "5.0",
    "IPHONEOS_DEPLOYMENT_TARGET": "14.0",
    # Catalyst needs its own floor; 14.0 maps to roughly macOS 11.
    "MACOSX_DEPLOYMENT_TARGET": "11.0",
}


def main() -> None:
    if not PROJECT.exists():
        sys.exit(f"no Xcode project at {PROJECT} — run `npx cap add ios` first")

    project = XcodeProject.load(str(PROJECT))

    existing = {f.path.split("/")[-1] for f in project.objects.get_objects_in_section("PBXFileReference")
                if getattr(f, "path", None)}

    for name in SOURCES:
        if name in existing:
            print(f"  {name} already in the project")
            continue
        added = project.add_file(str(HERE / "App" / "App" / name),
                                 target_name="App", force=False)
        print(f"  added {name}" if added else f"  could not add {name}")

    for key, value in SETTINGS.items():
        project.set_flags(key, value, target_name="App")
        print(f"  {key} = {value}")

    project.save()
    print("project.pbxproj updated")


if __name__ == "__main__":
    main()
