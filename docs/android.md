# DayHop Android app (Trusted Web Activity)

The Android app is the live site (https://dayhop.quest) wrapped as a
**Trusted Web Activity** with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
No browser chrome, Play Store listing, same code as the web app — every web
deploy is an app update; the APK/AAB only needs rebuilding when the wrapper
itself changes (icon, colours, package id, version code for a Play release).

Package id: `quest.dayhop.app` · project: `android/` · signing: `android/android.keystore`
(gitignored, alias `dayhop`, password in `android/keystore.properties` — also gitignored).

## One-time machine setup (already done on the founder's Windows box)

```
npm i -g @bubblewrap/cli
# JDK 17 (Temurin 17.0.11+9) → %USERPROFILE%\.bubblewrap\jdk\jdk-17.0.11+9
# Android cmdline-tools    → %USERPROFILE%\.bubblewrap\android_sdk\tools
#   sdkmanager --licenses ; --install "build-tools;36.1.0" "platforms;android-36" "platform-tools"
# %USERPROFILE%\.bubblewrap\config.json points jdkPath / androidSdkPath at the two dirs above.
```

## Build

```
cd android
set BUBBLEWRAP_KEYSTORE_PASSWORD=<storePassword from keystore.properties>
set BUBBLEWRAP_KEY_PASSWORD=<keyPassword from keystore.properties>
bubblewrap build --skipPwaValidation
```

Gotchas seen on the founder's machine (2026-08-29):

- The Claude Code shell sets `NoDefaultCurrentDirectoryInExePath=1`, which makes cmd.exe
  refuse to run `gradlew.bat` from the project dir ("not recognized"). `unset` it first.
  A normal terminal does not have this problem.
- Put the JDK's `bin` on PATH or the final AAB signing step fails on `jarsigner`.
  Manual fallback: `jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore android.keystore
  -signedjar app-release-bundle.aab app/build/outputs/bundle/release/app-release.aab dayhop`
- Bubblewrap needs `twa-manifest.json` without a UTF-8 BOM (PowerShell 5 `-Encoding utf8` adds one).
- The version-name key in `twa-manifest.json` is `appVersion` (not `appVersionName`).

First build ~4 min (Gradle 8.11 + AGP download). Outputs `android/app-release-signed.apk` (sideload / testing) and
`android/app-release-bundle.aab` (what Play Console wants).

## Site-side contract (must stay true)

- `public/manifest.webmanifest` — PNG icons 192/512 (`any` + `maskable`), `id`, `scope`.
- `public/.well-known/assetlinks.json` served by an explicit route in `server.js`
  (express.static ignores dotfiles). Lists the SHA-256 of every cert that may
  sign the app. **If Android shows a browser address bar inside the app, this
  file is wrong or unreachable.** Verify: https://dayhop.quest/.well-known/assetlinks.json
- Upload key SHA-256 (local keystore):
  `37:EE:A3:6B:51:27:E1:4F:81:B1:7E:9B:38:AB:DC:46:E6:D4:92:67:BF:26:DB:36:61:FE:F8:DC:B6:82:57:B7`

## Play Store release

1. Play Console → create app `DayHop` → upload `app-release-bundle.aab` to Internal testing.
2. Play App Signing re-signs with Google's key. Copy its SHA-256 from
   **Setup → App integrity → App signing key certificate** and ADD it to
   `assetlinks.json` (keep the upload key too). Deploy. Without this the Play
   build opens with a browser bar.
3. Store listing: name, short + full description, 512×512 icon
   (`public/icons/icon-512.png`), 1024×500 feature graphic, ≥2 phone screenshots.
   Content rating questionnaire, data-safety form (Supabase auth, Stripe, GA4/Meta pixel → "collects").
4. Privacy policy URL: https://dayhop.quest/privacy
5. Bump `appVersionCode` (+1) and `appVersionName` in `android/twa-manifest.json`
   for every new Play upload, then rebuild.

Play developer account for an **organization** requires a D-U-N-S number
(free from Dun & Bradstreet, ~2–30 days to issue). Register as an individual
only if the listing should stay under a personal name.
