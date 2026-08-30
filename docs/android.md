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

## Simulating on a phone (emulator)

```
powershell -ExecutionPolicy Bypass -File androidsim.ps1 [-KeepRunning] [-SettleSeconds 20]
```

Boots the `dayhop` AVD (Pixel 6, API 34 Play-Store image), installs the APK, completes Chrome's
first-run, forces on-device Digital Asset Links verification (`pm verify-app-links`), launches
DayHop, auto-dismisses ANR / Chrome nag sheets, saves `android/sim-screenshot.png` and exits
0 = full-screen TWA, 2 = browser bar present (asset links not verified), 3 = unknown.
Reuses an emulator that is already running; otherwise kills it at the end unless `-KeepRunning`.

Machine prerequisites (all done on the founder's box, 2026-08-30):

- Android Emulator Hypervisor Driver (AEHD) — one-time admin install; the command is in the
  header of `sim.ps1`. Without it pure-software x86 emulation stalls (verified 2026-08-29).
  `emulator -accel-check` must say "installed and usable".
- The AVD must run with host GPU: in `%USERPROFILE%.androidavddayhop.avdconfig.ini` set
  `hw.gpu.enabled = yes`, `hw.gpu.mode = host`, `hw.ramSize = 3072`, `hw.cpu.ncore = 6`,
  `vm.heapSize = 512M`. The defaults (`hw.gpu.enabled = no`, 2 GB) made the Play image ANR
  itself to death on first boot ("Process system isn't responding").
- A Custom-Tab-style URL bar inside the app on the emulator means either Chrome's first-run
  was never completed or the device has not verified `assetlinks.json` yet — the script handles
  both; `adb shell pm get-app-links quest.dayhop.app` should show `dayhop.quest: verified`.

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

### Store listing copy (ready to paste)

- **App name:** DayHop
- **Short description (≤80):** Plan your perfect day out in Ontario — trails, lakes, towns, weather-aware.
- **Full description:**
  DayHop plans your day out for you. Tell it where you are and what mood you're in — Rest & Relax or
  Adventure — and it builds a real itinerary for today: trails, beaches, small towns, markets, viewpoints,
  and the drives between them, checked against the weather and official park/road advisories.

  • Day-trip ideas across the Greater Toronto Area, York Region, Hamilton, Lake Simcoe and beyond
  • R&R vs Adventure mode — same day, two very different plans
  • Live weather + government advisories baked into every plan (never a fake all-clear)
  • Seasonal picks: fall colours, swimming holes, maple season, winter trails
  • Deep-dive city nature guides for Markham, Richmond Hill, Newmarket, Toronto, Hamilton, Lake Simcoe
  • Weekly Thursday digest of the best days out, if you want it

  Free to start. Premium plans and the $20 city nature guides are available in-app.
- **Category:** Travel & Local · **Tags:** day trips, hiking, Ontario, itinerary, weekend
- **Contact email:** the founder's · **Privacy policy:** https://dayhop.quest/privacy
- **Assets:** icon `android/store_icon.png` (512×512), feature graphic 1024×500 (render from the
  hackathon-media 'Field Notes' sheets), phone screenshots = `android/sim-screenshot.png` runs
  from the emulator (1080×2400; Play wants 2–8 of them).

Play developer account for an **organization** requires a D-U-N-S number
(free from Dun & Bradstreet, ~2–30 days to issue). Register as an individual
only if the listing should stay under a personal name.
