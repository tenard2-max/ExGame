@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-offline.ps1" %*
if errorlevel 1 (
  echo.
  echo 오프라인 실행에 실패했습니다.
  pause
)
