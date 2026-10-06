@echo off
REM Removes the Parts Finder auto-start shortcut. (Does not delete the app.)
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP%\Parts Finder.lnk" (
  del "%STARTUP%\Parts Finder.lnk"
  echo Auto-start removed.
) else (
  echo No auto-start shortcut found.
)
echo.
echo Note: if the app is currently running, stop it with stop.bat.
pause
