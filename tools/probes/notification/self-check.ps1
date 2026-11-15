param([string]$JavaHome = $env:JAVA_HOME)
$ErrorActionPreference = 'Stop'
if (-not $JavaHome) { throw 'Pass -JavaHome or set JAVA_HOME (Java 17+).' }
$classes = Join-Path $PSScriptRoot 'results/host-classes'
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$policy = Join-Path $PSScriptRoot 'common/src/main/java/com/xiaomao/focus/probe/common/HoldRequest.java'
$test = Join-Path $PSScriptRoot 'tests/HoldRequestTest.java'
& (Join-Path $JavaHome 'bin/javac.exe') -encoding UTF-8 -d $classes $policy $test
if ($LASTEXITCODE -ne 0) { throw 'Host check compilation failed.' }
& (Join-Path $JavaHome 'bin/java.exe') -cp $classes HoldRequestTest
if ($LASTEXITCODE -ne 0) { throw 'Host checks failed.' }
