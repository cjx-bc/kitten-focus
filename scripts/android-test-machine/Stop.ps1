$ErrorActionPreference = 'Stop'
$adb = "$PSScriptRoot\sdk\platform-tools\adb.exe"
$listed = & $adb devices | Select-String '^emulator-5580\s'
if (!$listed) { Write-Output 'Project emulator is already stopped.'; exit 0 }
$name = & $adb -s emulator-5580 emu avd name 2>$null | Select-Object -First 1
if ($name -ne 'KittenFocus_API36_QA') { throw 'Port 5580 belongs to another device.' }
# Flush pending Android filesystem writes before requesting emulator shutdown.
& $adb -s emulator-5580 shell sync
if ($LASTEXITCODE -ne 0) { throw 'Could not flush guest filesystem; emulator was not stopped.' }
& $adb -s emulator-5580 emu kill
if ($LASTEXITCODE -ne 0) { throw 'Could not stop project emulator.' }
$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Seconds 1
    $listed = & $adb devices | Select-String '^emulator-5580\s'
} while ($listed -and (Get-Date) -lt $deadline)
if ($listed) { throw 'Emulator shutdown has not completed.' }
Write-Output 'Project emulator stopped.'
