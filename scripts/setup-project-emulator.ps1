param([switch]$Recreate)
$ErrorActionPreference = 'Stop'
$vmRoot = 'D:\KittenFocus-Android'
$projectRoot = Split-Path $PSScriptRoot -Parent
$bootstrapSdk = Join-Path $projectRoot '.tools\android-sdk'
$sdk = Join-Path $vmRoot 'sdk'
$avdName = 'KittenFocus_API36_QA'
$avdPath = Join-Path $vmRoot "avd\$avdName.avd"

New-Item -ItemType Directory -Force -Path $vmRoot,"$vmRoot\avd","$vmRoot\logs","$vmRoot\temp","$vmRoot\state","$sdk\cmdline-tools" | Out-Null
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_AVD_HOME = "$vmRoot\avd"
$env:ANDROID_USER_HOME = "$vmRoot\state"
$env:ANDROID_EMULATOR_HOME = "$vmRoot\state"
$env:TEMP = "$vmRoot\temp"
$env:TMP = $env:TEMP

foreach ($component in @('cmdline-tools\latest', 'licenses', 'platform-tools')) {
    $destination = Join-Path $sdk $component
    if (!(Test-Path -LiteralPath $destination)) {
        Copy-Item -LiteralPath (Join-Path $bootstrapSdk $component) -Destination $destination -Recurse
    }
}
$androidCli = "$sdk\cmdline-tools\latest\bin\android.exe"
foreach ($package in @(
    @{Path='emulator\emulator.exe'; Id='emulator'},
    @{Path='system-images\android-36\google_apis\x86_64\system.img'; Id='system-images/android-36/google_apis/x86_64'}
)) {
    if (!(Test-Path -LiteralPath (Join-Path $sdk $package.Path))) {
        & $androidCli "--sdk=$sdk" sdk install $package.Id
        if ($LASTEXITCODE -ne 0) { throw "SDK package installation failed: $($package.Id)" }
    }
}

if ($Recreate) {
    $adb = "$sdk\platform-tools\adb.exe"
    $targetListed = & $adb devices | Select-String '^emulator-5580\s'
    if ($targetListed) {
        $runningName = (& $adb -s emulator-5580 emu avd name 2>$null | Select-Object -First 1)
        if ($runningName -ne $avdName) { throw 'Port 5580 belongs to another device.' }
        & $adb -s emulator-5580 emu kill
        $deadline = (Get-Date).AddSeconds(30)
        do {
            Start-Sleep -Seconds 1
            $targetListed = & $adb devices | Select-String '^emulator-5580\s'
        } while ($targetListed -and (Get-Date) -lt $deadline)
        if ($targetListed) { throw 'Emulator has not stopped; data was not removed.' }
    }
    # Only the explicitly named disposable AVD is removed. SDK downloads are retained.
    if (Test-Path -LiteralPath $avdPath) {
        $resolvedAvd = (Resolve-Path -LiteralPath $avdPath).Path
        if ($resolvedAvd -ne 'D:\KittenFocus-Android\avd\KittenFocus_API36_QA.avd') { throw 'Unexpected AVD path.' }
        Remove-Item -LiteralPath $resolvedAvd -Recurse -Force
    }
    $avdIndex = "$vmRoot\avd\$avdName.ini"
    if (Test-Path -LiteralPath $avdIndex) { Remove-Item -LiteralPath $avdIndex -Force }
}
if (!(Test-Path -LiteralPath "$avdPath\config.ini")) {
    'no' | & "$sdk\cmdline-tools\latest\bin\avdmanager.bat" create avd -n $avdName -p $avdPath -k 'system-images;android-36;google_apis;x86_64'
    if ($LASTEXITCODE -ne 0) { throw 'AVD creation failed.' }
}
$settings = [ordered]@{
    'AvdId'=$avdName; 'avd.ini.displayname'='Kitten Focus API 36 (1.5GB)';
    'hw.cpu.ncore'='2'; 'hw.ramSize'='1536'; 'vm.heapSize'='192';
    'hw.lcd.width'='540'; 'hw.lcd.height'='960'; 'hw.lcd.density'='240';
    # The API36 base userdata filesystem is approximately 6GB. It is sparse;
    # asking for 2GB cannot shrink the filesystem supplied by the image.
    'disk.dataPartition.size'='6G'; 'disk.cachePartition.size'='64MB';
    'hw.sdCard'='no'; 'hw.camera.back'='none'; 'hw.camera.front'='none';
    'hw.gpu.enabled'='yes'; 'hw.gpu.mode'='auto';
    'hw.keyboard'='yes'; 'hw.mainKeys'='no';
    'showDeviceFrame'='no'; 'skin.dynamic'='yes'; 'skin.name'='540x960';
    'fastboot.forceColdBoot'='yes'; 'fastboot.forceFastBoot'='no';
    'snapshot.present'='no'
}
$configFile = "$avdPath\config.ini"
$lines = @(Get-Content -LiteralPath $configFile)
foreach ($key in $settings.Keys) {
    $keyPattern = '^' + [regex]::Escape($key) + '\s*='
    $lines = @($lines | Where-Object { $_ -notmatch $keyPattern })
    $lines += "$key=$($settings[$key])"
}
[IO.File]::WriteAllLines($configFile, [string[]]$lines, [Text.UTF8Encoding]::new($false))
if ($PSCommandPath -ne "$vmRoot\Setup.ps1") {
    Copy-Item -LiteralPath $PSCommandPath -Destination "$vmRoot\Setup.ps1" -Force
}
$templateRoot = Join-Path $PSScriptRoot 'android-test-machine'
if (Test-Path -LiteralPath $templateRoot) {
    Get-ChildItem -LiteralPath $templateRoot -File | Copy-Item -Destination $vmRoot -Force
}
Write-Output "Ready: $avdName at $vmRoot (2 cores, 1536 MB RAM, 540x960, no automatic snapshots)."
