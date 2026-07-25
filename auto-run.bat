@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\auto-run.ps1" %*
if errorlevel 1 (
  echo.
  echo 자동 실행에 실패했습니다.
  pause
)
