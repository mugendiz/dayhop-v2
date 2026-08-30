# Boot the Pixel 6 emulator, install the latest signed APK, open DayHop as a
# Trusted Web Activity, and drop screenshots next to this script.
#   powershell -ExecutionPolicy Bypass -File android\sim.ps1
# One-time prerequisite (admin; done 2026-08-30): the Android Emulator Hypervisor Driver -
#   Start-Process -Verb RunAs cmd -ArgumentList '/c "%USERPROFILE%\.bubblewrap\android_sdk\extras\google\Android_Emulator_Hypervisor_Driver\silent_install.bat"'
# AVD `dayhop` must have hw.gpu.enabled=yes / hw.gpu.mode=host / hw.ramSize=3072 in
# %USERPROFILE%\.android\avd\dayhop.avd\config.ini or the guest ANRs itself to death.
param([switch]$KeepRunning, [int]$SettleSeconds = 20)

$sdk = "$env:USERPROFILE\.bubblewrap\android_sdk"
$env:ANDROID_SDK_ROOT = $sdk; $env:ANDROID_HOME = $sdk
$adb = "$sdk\platform-tools\adb.exe"
$apk = Join-Path $PSScriptRoot 'app-release-signed.apk'
$pkg = 'quest.dayhop.app'
$shot = Join-Path $PSScriptRoot 'sim-screenshot.png'

function Adb { & $adb @args 2>&1 | Out-String }
function Ui-Dump { (& $adb exec-out uiautomator dump /dev/tty 2>$null | Out-String) }
function Tap-Text([string]$xml, [string[]]$labels) {
  foreach ($l in $labels) {
    $m = [regex]::Match($xml, "<node[^>]*text=`"$([regex]::Escape($l))`"[^>]*bounds=`"\[(\d+),(\d+)\]\[(\d+),(\d+)\]`"")
    if ($m.Success) {
      $x = ([int]$m.Groups[1].Value + [int]$m.Groups[3].Value) / 2
      $y = ([int]$m.Groups[2].Value + [int]$m.Groups[4].Value) / 2
      & $adb shell input tap $x $y | Out-Null
      Write-Host "  tapped '$l'"
      return $true
    }
  }
  return $false
}
# ANR sheets ("X isn't responding") + Chrome first-run + sync/notification nags.
$dismissables = @('Wait','Use without an account','No thanks','No, thanks','Got it','Accept & continue','Continue','OK','Not now','Skip')
function Dismiss-Dialogs([int]$rounds) {
  for ($i = 0; $i -lt $rounds; $i++) {
    $xml = Ui-Dump
    if (-not (Tap-Text $xml $dismissables)) { return $xml }
    Start-Sleep 2
  }
  return (Ui-Dump)
}

$accel = & "$sdk\emulator\emulator.exe" -accel-check 2>&1 | Out-String
if ($accel -match 'not installed|not found') {
  Write-Host "Hypervisor driver not installed - run the admin command in the header of this script first." -ForegroundColor Yellow
  Write-Host $accel; exit 1
}

$running = (Adb devices) -match 'emulator-\d+\s+device'
if ($running) {
  Write-Host "Reusing running emulator."
} else {
  Start-Process -FilePath "$sdk\emulator\emulator.exe" -ArgumentList @('-avd','dayhop','-no-audio','-no-boot-anim','-gpu','host','-cores','6','-memory','3072')
  Write-Host "Waiting for Android to boot..."
  & $adb wait-for-device
  do { Start-Sleep 3; $b = (& $adb shell getprop sys.boot_completed 2>$null) } until ("$b".Trim() -eq '1')
  # Play images keep churning for a minute after boot_completed; let it settle before we poke it.
  Write-Host "Booted; settling ${SettleSeconds}s..."
  Start-Sleep $SettleSeconds
}
& $adb shell input keyevent KEYCODE_WAKEUP | Out-Null
Dismiss-Dialogs 5 | Out-Null

Write-Host "Installing $apk"
Adb install -r $apk | Write-Host

# Digital Asset Links: make the device fetch dayhop.quest/.well-known/assetlinks.json now.
Adb shell pm set-app-links --package $pkg 0 all | Out-Null
Adb shell pm verify-app-links --re-verify $pkg | Out-Null
Start-Sleep 6
$links = Adb shell pm get-app-links $pkg
Write-Host "App-link state:`n$links"

# Chrome must complete its first-run once or the TWA falls back to a Custom Tab.
& $adb shell monkey -p com.android.chrome -c android.intent.category.LAUNCHER 1 | Out-Null
Start-Sleep 8
Dismiss-Dialogs 6 | Out-Null
& $adb shell am force-stop com.android.chrome | Out-Null

Write-Host "Launching DayHop"
& $adb shell am force-stop $pkg | Out-Null
& $adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 | Out-Null
Start-Sleep 12   # splash + first paint (cold start on Render can be slow)
$xml = Dismiss-Dialogs 6
Start-Sleep 4

& $adb shell screencap -p /sdcard/sim.png | Out-Null
& $adb pull /sdcard/sim.png $shot | Out-Null
Write-Host "Screenshot: $shot"

$xml = Ui-Dump
if ($xml -match 'com\.android\.chrome:id/url_bar') {
  Write-Host "BROWSER BAR PRESENT - asset links not verified on device (check assetlinks.json + get-app-links above)." -ForegroundColor Red
  $exit = 2
} elseif ($xml -match 'resource-id="quest\.dayhop\.app' -or $xml -match 'package="com\.android\.chrome"') {
  Write-Host "TWA OK - full-screen, no browser bar." -ForegroundColor Green
  $exit = 0
} else {
  Write-Host "Could not determine foreground state; inspect the screenshot." -ForegroundColor Yellow
  $exit = 3
}
if (-not $KeepRunning -and -not $running) { & $adb emu kill | Out-Null }
exit $exit
