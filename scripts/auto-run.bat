@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>&1
if errorlevel 1 (
  where python >nul 2>&1
  if errorlevel 1 (
    echo.
    echo [ERROR] Python not found. Install Python and enable "Add to PATH".
    echo https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-run.ps1" %*
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo Auto-run failed. Exit code %ERR%
  pause
  exit /b %ERR%
)
exit /b 0
