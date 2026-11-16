param([switch]$Visible, [switch]$Audio, [ValidateSet(1536,2048,2560)][int]$MemoryMB = 1536)
$ErrorActionPreference = 'Stop'
$vmRoot = $PSScriptRoot
$sdk = "$vmRoot\sdk"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_AVD_HOME = "$vmRoot\avd"
$env:ANDROID_USER_HOME = "$vmRoot\state"
$env:ANDROID_EMULATOR_HOME = "$vmRoot\state"
$env:TEMP = "$vmRoot\temp"
$env:TMP = $env:TEMP
$adb = "$sdk\platform-tools\adb.exe"
$device = & $adb devices | Select-String '^emulator-5580\s'
if ($device) {
    $name = & $adb -s emulator-5580 emu avd name 2>$null | Select-Object -First 1
    if ($name -ne 'KittenFocus_API36_QA') { throw 'Port 5580 is occupied by another device.' }
    Write-Output 'Project emulator is already running: emulator-5580'
    exit 0
}
$emuArgs = @('-avd','KittenFocus_API36_QA','-port','5580','-memory',"$MemoryMB",'-cores','2','-no-snapshot','-no-boot-anim','-no-metrics')
if ($MemoryMB -lt 2560) { $emuArgs += '-lowram' }
if (!$Visible) { $emuArgs += '-no-window' }
if (!$Audio) { $emuArgs += '-no-audio' }
$process = Start-Process -FilePath "$sdk\emulator\emulator.exe" -ArgumentList $emuArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput "$vmRoot\logs\emulator.out.log" -RedirectStandardError "$vmRoot\logs\emulator.err.log"
$process.Id | Set-Content -LiteralPath "$vmRoot\logs\launcher.pid"
Write-Output "Starting emulator-5580, PID $($process.Id); guest RAM $MemoryMB MB."
Write-Output 'Default: no window, no audio, no automatic snapshots. Use -Visible and/or -Audio when required.'
