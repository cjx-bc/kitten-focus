param(
    [string]$SdkPath = $env:ANDROID_HOME,
    [string]$JavaHome = $env:JAVA_HOME
)
$ErrorActionPreference = 'Stop'
if (-not $SdkPath) { throw 'Pass -SdkPath or set ANDROID_HOME.' }
if (-not $JavaHome) { throw 'Pass -JavaHome or set JAVA_HOME (Java 17+).' }
$wrapper = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../android/gradlew.bat'))
$previousJava = $env:JAVA_HOME
$previousAndroid = $env:ANDROID_HOME
$previousSdk = $env:ANDROID_SDK_ROOT
try {
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $SdkPath
    $env:ANDROID_SDK_ROOT = $SdkPath
    & (Join-Path $PSScriptRoot 'self-check.ps1') -JavaHome $JavaHome
    & $wrapper -p $PSScriptRoot :sender:assembleDebug :controller:assembleDebug --no-daemon --max-workers=2
    if ($LASTEXITCODE -ne 0) { throw 'Notification probe build failed.' }
} finally {
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousAndroid
    $env:ANDROID_SDK_ROOT = $previousSdk
}
