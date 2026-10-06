@echo off
REM Manually start Parts Finder in a visible window (double-click to run).
REM Keep this window open while you use the app. Close it (or Ctrl+C) to stop.
cd /d "%~dp0.."
echo Starting Parts Finder...  Open http://localhost:8080 in your browser.
node src\server.js
pause
