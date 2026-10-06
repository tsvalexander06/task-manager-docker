@echo off
REM ============================================================
REM  Parts Finder - install auto-start
REM  Double-click this ONCE. It makes Parts Finder launch itself
REM  (hidden) every time you log in to Windows.
REM ============================================================
setlocal
set "VBS=%~dp0run-hidden.vbs"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path '%STARTUP%' 'Parts Finder.lnk')); $s.TargetPath='%VBS%'; $s.WorkingDirectory='%~dp0..'; $s.Description='Parts Finder'; $s.Save()"

REM Start it now too, so you don't have to reboot.
start "" "%VBS%"

echo.
echo  DONE. Parts Finder will now start automatically on login,
echo  and it has been started now as well.
echo.
echo  Open it in your browser at:  http://localhost:8080
echo.
echo  To turn auto-start OFF later, run: uninstall-autostart.bat
echo.
pause
