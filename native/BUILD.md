# Building and installing Roundtrip's apps

Copy-runnable commands, meant for a session driving the MacBook over SSH. Every
one is non-interactive: nothing here opens Xcode or waits for a click.

All paths are relative to the repository root.

## Once, before anything

```sh
cd native
npm ci
npm run sync-web
```

`sync-web` copies `index.html` and everything it references out of the repo
root into `native/www`. Run it again after any change to the web app; the apps
bundle a copy rather than loading the site.

## iPhone

Signing is already set up in the project: automatic, team `867VXT3658`, bundle
identifier `com.anthonybono.roundtrip`. Xcode picks up the "Apple Development:
Anthony Bono" identity and the installed profiles on its own, so no settings
need touching. `-allowProvisioningUpdates` lets it register a new device or
refresh a profile without a dialog.

```sh
cd native && npx cap sync ios && cd ios/App

xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build \
  -allowProvisioningUpdates \
  build
```

Then install it on the paired phone. `devicectl` is the modern tool and works
over the wireless pairing:

```sh
# What is reachable, and its identifier
xcrun devicectl list devices

# Install. Substitute the identifier from the line above; the name works too.
xcrun devicectl device install app \
  --device "Anthony's iPhone" \
  build/Build/Products/Debug-iphoneos/App.app

# And launch it
xcrun devicectl device process launch \
  --device "Anthony's iPhone" \
  com.anthonybono.roundtrip
```

The product is `App.app` because the Xcode target is called App; the name on
the home screen is Roundtrip, which comes from `CFBundleDisplayName`.

If the phone is asleep or out of range, `devicectl list devices` shows it as
unavailable. Wake it and run the install again; the build does not need
repeating.

## iPad

The same build. An iPad is another iOS device, so point `--device` at it
instead.

## Mac

The Mac app is the same target under Mac Catalyst.

```sh
cd native && npx cap sync ios && cd ios/App

xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath build-mac \
  -allowProvisioningUpdates \
  build

open build-mac/Build/Products/Debug-maccatalyst/App.app
```

To keep it, drag that `App.app` into `/Applications`, or:

```sh
cp -R build-mac/Build/Products/Debug-maccatalyst/App.app /Applications/Roundtrip.app
```

## Android

No Mac needed; this builds anywhere with a JDK and the Android SDK.

```sh
cd native && npx cap sync android && cd android
./gradlew --no-daemon assembleDebug
# -> app/build/outputs/apk/debug/app-debug.apk
```

Install it over ADB, the same way the Fire TV app goes onto the stick:

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`-r` replaces an existing install, which works because the app is signed with
the shared sideload key rather than a throwaway debug one.

CI also builds this on every push to `main` and leaves it at
<https://anthonybono21-cloud.github.io/roundtrip/phone.apk>, so a phone can
install it from a link with nothing plugged in.

## If a build fails

- **"No account for team"** or a signing error on iOS: the Mac is not signed
  into the developer account. `xcodebuild -showBuildSettings -workspace
  App.xcworkspace -scheme App | grep DEVELOPMENT_TEAM` should print
  `867VXT3658`.
- **CocoaPods errors**: `cd native/ios/App && pod install --repo-update`, then
  build again. `npx cap sync ios` normally does this.
- **Android cannot find the SDK**: set `ANDROID_HOME`, or write
  `sdk.dir=/path/to/sdk` into `native/android/local.properties`.
- **The app opens on an old version of the site**: `npm run sync-web` was not
  re-run. The apps bundle the web build; they do not fetch it.
