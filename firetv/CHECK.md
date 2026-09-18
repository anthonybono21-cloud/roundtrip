# Checking Roundtrip on the actual Fire Stick

Copy-runnable commands for a session on the 3090 that reaches the stick over
adb. Every one is non-interactive. Nothing in this file can be run from a
project session: no session in this project can reach the device, github.io or
a real GPU, so this is the only place Roundtrip's behaviour on a television is
an observed fact rather than a guess.

The app is `com.roundtrip.tv`, one activity, `MainActivity`. It loads the live
site, so it never needs rebuilding to pick up a change to the web app.

## Reach the stick

```sh
# Settings > My Fire TV > Developer Options > ADB debugging must be on.
# The stick's address is in Settings > My Fire TV > About > Network.
adb connect 192.168.1.50:5555          # substitute the real address
adb devices -l
adb shell getprop ro.product.model      # AFTKA = Stick 4K Max, AFTKRT = 4K (2nd gen)
```

If more than one device answers, put `-s 192.168.1.50:5555` after `adb` on
every command below.

## Install or update the app

Only needed when something under `firetv/` changes. A change to the web app
reaches the stick on the next launch with none of this.

```sh
curl -fL -o /tmp/rt.apk https://anthonybono21-cloud.github.io/roundtrip/rt.apk
adb install -r /tmp/rt.apk
adb shell dumpsys package com.roundtrip.tv | grep -E 'versionName|versionCode'
```

`-r` keeps the data and installs over the top; the signing key is fixed, so
this never has to be uninstalled first.

## Launch it, and prove it took the television layout

```sh
adb logcat -c                                   # clear, so the next lines are this run's
adb shell am start -n com.roundtrip.tv/.MainActivity
sleep 12
adb logcat -d -s chromium | grep -i roundtrip
```

Expect one line like:

```
Roundtrip TV: layout on, 960x540 css, dpr 2, fire tv
```

**That line is the check.** If it is missing, the page did not take the
television layout and everything on screen is at desk size — the overlay will
look roughly twice as large as it should. The app puts `?tv=1` on the URL
itself, so the only way to miss it is a page that failed to load; check the
next section's screenshot before looking anywhere else.

## Drive it with the remote, from here

The stick takes key events, so the whole remote mapping can be exercised
without touching the physical remote.

```sh
K() { adb shell input keyevent "$1"; }

K KEYCODE_DPAD_CENTER      # Select: the action strip comes up
K KEYCODE_DPAD_RIGHT       # inside the strip: walk right. Closed: next camera
K KEYCODE_DPAD_LEFT        # inside the strip: walk left.  Closed: the one before
K KEYCODE_DPAD_UP          # closed: thumbs up
K KEYCODE_DPAD_DOWN        # closed: thumbs down, and it moves on
K KEYCODE_MEDIA_PLAY_PAUSE # stay on this one
K KEYCODE_BACK             # closes the strip, or pulls out to orbit
```

Two things worth confirming by eye, because they are what a remote gets wrong:

* **Select must not change the scene.** Press Select in a live feed and
  screenshot: the strip is up and the same camera is still playing.
* **Back must not leave the app.** Press Back from orbit, then screenshot: it
  is still Roundtrip. Only *holding* Back exits.

```sh
adb shell input keyevent --longpress KEYCODE_BACK   # this is how you leave
```

## Screenshots

```sh
adb exec-out screencap -p > orbit.png         # while it is on the globe
K KEYCODE_DPAD_RIGHT && sleep 14
adb exec-out screencap -p > landed.png        # after it has dived and settled
```

`orbit.png` should be the lit globe with a small place card low on the left and
nothing within about 5% of any edge. `landed.png` should be the live feed
filling the frame with the same card over it. A black `landed.png` means the
feed did not play, which is a network or a YouTube problem, not a rendering
one — check `adb logcat -d -s chromium | tail -40`.

## How fast is it actually going

The app carries a frame probe, so this is a real number off the device rather
than an impression. It is the only trustworthy way to answer "is the dive
smooth on the stick": a project session measures its own software rasteriser,
not the Fire TV.

```sh
# --ez fps true turns on a line a second, which logcat carries
adb shell am force-stop com.roundtrip.tv
adb shell am start -n com.roundtrip.tv/.MainActivity --ez fps true
sleep 15 && adb logcat -c
K KEYCODE_DPAD_RIGHT                 # start a dive and watch it through
sleep 25
adb logcat -d -s chromium | grep 'Roundtrip fps' | tail -30
```

Each line reads:

```
Roundtrip fps: 58 median 17.2ms, p90 19.1ms, worst 34.0ms, phase descend
```

`median` is the typical frame, `p90` is the frame a tenth of the way from the
slow end — one bad frame is a hiccup, a bad tenth is a stutter you can see —
and `phase` says what the app was doing.

**Healthy**, on a Stick 4K or 4K Max:

* orbit: 55-60 fps, median near 17ms, p90 under 22ms
* descent: 40 fps or better, p90 under 30ms. This is the heavy part; some dip
  here is expected and is not the complaint.
* landed: the feed is a video, so 30 fps here is the stream, not a problem

**Stuttering**, and worth reporting back:

* orbit under 30 fps — the globe itself is too heavy for this stick, and the
  answer is to turn the globe down for televisions, not to touch the feeds
* p90 over 50ms in any phase — visible hitching rather than a low steady rate
* a `worst` over 500ms — something is blocking, most likely a texture upload;
  get `adb logcat -d -s chromium | tail -60` with it

Supporting numbers, if a result needs explaining:

```sh
adb shell dumpsys meminfo com.roundtrip.tv | head -20
adb shell dumpsys gfxinfo com.roundtrip.tv | grep -A6 'Janky frames'
adb shell cat /sys/class/thermal/thermal_zone0/temp   # a hot stick throttles
```

A stick that is fast for a minute and slow after ten is thermal, not code.

## Anything else about the page

`RoundtripRemote.fps()` and the rest of `window.Roundtrip` are reachable from a
DevTools session against the WebView, which is the route for anything this file
does not cover. The app turns web contents debugging on for exactly this:

```sh
PID=$(adb shell pidof com.roundtrip.tv | tr -d '\r')
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
curl -s http://127.0.0.1:9222/json | head -40
```

Then attach any Chrome DevTools Protocol client to `127.0.0.1:9222` and
evaluate `RoundtripRemote.fps()`, `Roundtrip.state.phase`, `Roundtrip.order()`
or anything else in the console handle.

## Putting it back

```sh
adb shell am force-stop com.roundtrip.tv
adb disconnect
```
