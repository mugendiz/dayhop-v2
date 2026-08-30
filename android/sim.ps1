# Boot the Pixel 6 emulator, install the latest signed APK, open DayHop,
# and drop a screenshot next to this script. Run from a normal PowerShell:
#   powershell -ExecutionPolicy Bypass -File android\sim.ps1
# One-time prerequisite (admin, reboot not needed): the Android Emulator
# Hypervisor Driver —
#   Start-Process -Verb RunAs cmd -ArgumentList '/c "%USERPROFILE%\.bubblewrap\android_sdk\extras\google\Android_Emulator_Hypervisor_Driver\silent_install.bat"'
$sdk = "$env:USERPROFILE\.bubblewrap\android_sdk"
$env:ANDROID_SDK_ROOT = $sdk; $env:ANDROID_HOME = $sdk
$adb = "$sdk\platform-tools\adb.exe"
$apk = Join-Path $PSScriptRoot 'app-release-signed.apk'
$shot = Join-Path $PSScriptRoot 'sim-screenshot.png'

$accel = & "$sdk\emulator\emulator.exe" -accel-check 2>&1 | Out-String
if ($accel -match 'not installed|not found|0') {
  Write-Host "Hypervisor driver not installed — run the admin command in the header of this script first." -ForegroundColor Yellow
  Write-Host $accel; exit 1
}

Start-Process -FilePath "$sdk\emulator\emulator.exe" -ArgumentList @('-avd','dayhop','-no-audio','-no-boot-anim','-gpu','auto','-no-snapshot')
Write-Host "Waiting for Android to boot..."
& $adb wait-for-device
do { Start-Sleep 3; $b = (& $adb shell getprop sys.boot_completed 2>$null) } until ("$b".Trim() -eq '1')

& $adb install -r $apk
& $adb shell monkey -p quest.dayhop.app -c android.intent.category.LAUNCHER 1 | Out-Null
Start-Sleep 12   # splash + first paint (cold start on Render can be slow)
& $adb exec-out screencap -p > $shot
Write-Host "Screenshot: $shot"
