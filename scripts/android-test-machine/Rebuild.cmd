@echo off
echo This removes ONLY the disposable project emulator data, keeping the SDK.
choice /c YN /n /m "Rebuild the project test device? [Y/N] "
if errorlevel 2 exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup.ps1" -Recreate
pause
