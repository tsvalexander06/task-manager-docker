@echo off
REM Stops Parts Finder (and any other Node.js app running on this PC).
taskkill /IM node.exe /F >nul 2>&1
if %errorlevel%==0 (echo Parts Finder stopped.) else (echo Nothing was running.)
pause
