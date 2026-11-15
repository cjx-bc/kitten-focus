param([string]$JavaHome = 'C:/Program Files/Microsoft/jdk-21.0.12.8-hotspot')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$output = Join-Path $env:TEMP 'catfocus-notification-policy'
$sources = @(
    (Join-Path $root 'android/app/src/main/java/com/xiaomao/focus/NotificationSystem.java'),
    (Join-Path $root 'android/app/src/main/java/com/xiaomao/focus/NotificationPolicy.java'),
    (Join-Path $PSScriptRoot 'NotificationPolicyTest.java')
)
& (Join-Path $JavaHome 'bin/javac.exe') -d $output @sources
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $JavaHome 'bin/java.exe') -cp $output com.xiaomao.focus.NotificationPolicyTest
exit $LASTEXITCODE
