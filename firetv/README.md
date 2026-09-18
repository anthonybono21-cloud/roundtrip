# Roundtrip on a Fire Stick

Two ways to run it on the television, and the first one needs nothing
installed.

## 1. The browser, which already works

Open <https://anthonybono21-cloud.github.io/roundtrip/> in Silk. The page
recognises a Fire TV from its user agent and sizes itself for a screen across
the room, and the remote drives it:

| Remote | What it does |
| --- | --- |
| **Select** | shows what you can do here, and changes nothing on its own |
| **Right** / fast forward | next camera |
| **Left** / rewind | the camera before |
| **Up** | good camera, bring it round more often |
| **Down** | bad camera, drop it and move on |
| **Play/Pause** | stay on this one |
| **Back** | pull out to orbit |

The first press of anything also takes the page full screen, which is what
loses Silk's title bar.

Add `?tv=0` to the address to get the desk layout back, or `?tv=1` on a
desktop to see the television one. The choice is remembered.

## 2. The app, which puts it on the home row

`rt.apk` at the root of the site is a real Fire TV app: a tile on the home
row, no browser, no title bar, a screen that never sleeps and a back button
that pulls out to orbit rather than leaving. It is a full-screen WebView
pointed at the same live address, so a push to this repository reaches the
television on its next launch and the app itself never needs rebuilding.

Installing it is the one part that has to happen at the Fire Stick, because
nothing off the device can put an app onto it:

1. Settings → My Fire TV → Developer Options → **Install unknown apps**, and
   turn it on for **Downloader**. (If Developer Options is not there, open
   Settings → My Fire TV → About and press Select on the serial number seven
   times.)
2. Install **Downloader** from the Amazon Appstore if it is not there already.
3. Open Downloader and enter:

   ```
   anthonybono21-cloud.github.io/roundtrip/rt.apk
   ```

4. Install it. Roundtrip appears in **Your Apps & Channels**; hold Select on
   it to move it onto the home row.

To update, run the same address in Downloader again. The app is signed with a
fixed key held in this repository, so a new build installs straight over the
old one.

### What it is made of

`firetv/` is a plain Android project with no libraries at all: one activity,
one WebView, about a megabyte of apk.

* `app/src/main/java/com/roundtrip/tv/MainActivity.java` — the whole app.
* `app/src/main/AndroidManifest.xml` — `LEANBACK_LAUNCHER` is what puts it on
  the Fire TV home row; declaring leanback and touchscreen as not required is
  what lets it install on a device with neither.
* `roundtrip-sideload.jks` — the signing key, in the open on purpose. It
  protects nothing, since this is sideloaded onto one television and is not
  going near a store. A fixed key is what makes each build install over the
  last one instead of being refused as a different app.
* `.github/workflows/firetv.yml` builds it on every change under `firetv/` and
  commits the apk to `rt.apk` at the repository root, which is what serves it
  from the short address above.

`?tv=1` is on the URL rather than left to detection: inside a WebView the user
agent belongs to the host app, not to Silk, so the page cannot tell it is on a
television unless it is told.

### Known ground

Roundtrip renders a WebGL globe, and how well that goes depends on the stick.
A Fire TV Stick 4K or 4K Max has the graphics for it. A first-generation stick
or a Fire TV Lite will be slower on the dive down; if it struggles, the globe
is the part to turn down, not the feeds. This has not been measured on a real
device from here — no session in this project can reach one.

Amazon also has an HTML5 "web app" route of its own, which wraps a page into
an apk with their tooling. It was not taken: it still ends in an apk that has
to be installed the same way, and it goes through a developer account and
Amazon's packaging first, so it is more work for the same result. Whether that
platform is still maintained could not be checked from here — Amazon's
developer site is blocked to this environment — but it does not change the
choice.
