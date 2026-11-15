param([string]$JavaHome = $env:JAVA_HOME)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($JavaHome)) { throw 'Set JAVA_HOME or pass -JavaHome.' }
$contractOutput = Join-Path ([System.IO.Path]::GetTempPath()) ('kitten-wallpaper-contract-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $contractOutput | Out-Null
& (Join-Path $JavaHome 'bin/javac.exe') -encoding UTF-8 -d $contractOutput `
    (Join-Path $PSScriptRoot 'app/src/main/java/com/xiaomao/focus/wallpaperprobe/ProbeSession.java') `
    (Join-Path $PSScriptRoot 'tests/ProbeSessionContractTest.java')
if ($LASTEXITCODE -ne 0) { throw 'Probe contract compilation failed.' }
& (Join-Path $JavaHome 'bin/java.exe') -cp $contractOutput com.xiaomao.focus.wallpaperprobe.ProbeSessionContractTest
if ($LASTEXITCODE -ne 0) { throw 'Probe contract failed.' }
