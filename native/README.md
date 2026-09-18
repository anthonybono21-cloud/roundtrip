# Roundtrip as a real app

Roundtrip lives at <https://anthonybono21-cloud.github.io/roundtrip/> and that
stays the source of truth. This directory wraps that same app in native shells
so it can be installed rather than opened: **iPhone, iPad, Mac and Android**.

Each shell is a thin native app around the web build, plus one thing the web
build cannot do for itself: a **detailed map**. Tap the screen to bring up the
action strip and there is a **Map** action beside Full. It puts every camera as
a dot on the device's own map engine, Apple's 3D satellite Flyover on iPhone,
iPad and Mac, MapLibre with Esri satellite imagery on Android. Tap a camera,
tap *Watch this one*, and the map closes and the globe dives into it. The
rotation is held while the map is open so you come back to what you left.

The action strip is `menu.js`, which reserved that slot for this; the bridge
only registers an item, and falls back to a floating button if it is talking
to a build that predates the strip.

Nothing here needs a paid API, a key, or an account to *build*. Putting the
Apple apps on a device does need an Apple developer account, which is Apple's
rule, not a choice made here.

## What state each one is in

| | Builds | Runs | What is missing |
|---|---|---|---|
| **Android** | Yes, in CI, on every push | Phone and tablet | Nothing, for sideloading |
| **iPhone / iPad** | Compiles in CI; needs Xcode for a device build | — | An Apple developer account to sign it |
| **Mac** | Same project, Mac Catalyst | — | The same account |
| **Apple TV** | Not possible as a web shell | — | See below |

### The Fire TV app is a separate thing, on purpose

`firetv/` in this repository is its own Android app for the Fire Stick, and it
stays that way. It is a one-megabyte WebView pointed at the live address, with
no libraries at all, so the television always shows today's build and the
remote drives it. This one bundles the app and carries a map engine, which is
right for a phone you hold and wrong for a screen you point a D-pad at. Two
small apps beat one that is bad at both.

### Apple TV

tvOS ships no web view at all — `WKWebView` does not exist there, and it is the
one Apple platform with no browser. Roundtrip is a web app whose cameras are
YouTube embeds, so there is nothing on an Apple TV that can display it. The
only route is a full native rewrite, and even then the cameras would be a
problem: a YouTube live stream has no public URL a native player can open, so
a native tvOS Roundtrip would lose most of the camera list.

**An Amazon Fire TV stick runs the Android app**, because Fire OS is Android
and has a WebView. That is the working answer for a television today, and the
APK this directory builds is the same one the Fire TV work uses.

## Building

Everything starts from the repo root's `index.html`, which is copied in by
`sync-web.mjs`. Nothing in this directory ever writes back to the root.

```sh
cd native
npm install
npm run sync            # copy the web app in, then sync both shells
```

**Android**

```sh
npm run android:apk     # -> android/app/build/outputs/apk/debug/app-debug.apk
```

Or let CI do it: every push to `main` that touches the app builds an APK,
attaches it to the run, and drops it beside the site as
<https://anthonybono21-cloud.github.io/roundtrip/phone.apk> — open that on the
phone you want it on.

It is signed with the same sideload key the Fire TV app uses, so each build
installs over the last one instead of being refused. That key is declared once,
in `firetv/app/build.gradle`, and read from there rather than copied. It is in
the repository on purpose and protects nothing: neither app is going near a
store. A real store release would need a private key kept somewhere else.

**iPhone, iPad and Mac** (needs a Mac with Xcode)

```sh
npm run ios:open        # opens the Xcode project
```

Pick a simulator and it runs straight away. For a real device or a Mac build,
set a team in *Signing & Capabilities* first. The Mac build is the iPad app
under Mac Catalyst, which is already switched on — choose *My Mac (Mac
Catalyst)* as the destination.

## How it fits together

```
native/
  sync-web.mjs          copies index.html and friends from the repo root into www/
  bridge/
    roundtrip-native.js the map button and the JS side of the bridge; bundled
                        into the apps only, never served on the web
  android/
    .../RoundtripMapPlugin.java   MapLibre map, camera dots, the detail card
    .../MainActivity.java         registers the plugin, keeps the screen awake
  ios/
    App/App/RoundtripMapPlugin.swift          the Capacitor plugin
    App/App/RoundtripMapViewController.swift  the MapKit screen
    configure-project.py                      re-applies Roundtrip's Xcode settings
```

`www/` is generated and is not in git. Both `android/` and `ios/` are checked
in, because the Swift and Java above live inside them.

If the Capacitor projects ever need regenerating from scratch
(`npx cap add ios`), run `python3 ios/configure-project.py` afterwards: it puts
the two Swift files back into the Xcode target and switches Mac Catalyst on
again.

## Decisions worth knowing

**The web app is bundled, not loaded from the web address.** The app opens
instantly and is a real app rather than a shortcut. The trade is that a change
to the site does not reach an installed app until the app is rebuilt — which,
for Android, CI does on every push.

**Imagery is Esri World Imagery on Android**, the same free keyless layer the
globe's descent already uses, so the map and the dive show the same ground and
nothing new had to be signed up for. Apple's map is MapKit's own imagery.

**Google Maps was not used on Android.** The SDK is free of charge but wants an
API key tied to a Google Cloud project with billing switched on, and MapLibre
gives 3D satellite with no key at all.

**3D terrain is not on the Android map.** MapLibre's Android SDK (13.6.1) has no
public terrain API — checked against the shipped library, not the docs. The
Apple map has real terrain, because Flyover does it for free.
