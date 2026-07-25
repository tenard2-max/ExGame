@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1" %*
if errorlevel 1 (
  echo.
  echo APK 빌드에 실패했습니다. 디스크 여유 공간과 Android SDK를 확인하세요.
  pause
  exit /b 1
)
echo.
pause
