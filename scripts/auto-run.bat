@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where py >nul 2>&1
if errorlevel 1 (
  where python >nul 2>&1
  if errorlevel 1 (
    echo.
    echo [오류] Python이 없습니다. py 또는 python 이 PATH에 있어야 합니다.
    echo 설치: https://www.python.org/downloads/  ^(설치 시 Add to PATH 체크^)
    echo.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-run.ps1" %*
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo 자동 실행에 실패했습니다. ^(종료 코드 %ERR%^)
  pause
  exit /b %ERR%
)
exit /b 0
