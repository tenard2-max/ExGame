@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ExGame 바로가기를 만듭니다...
cscript //nologo "%~dp0scripts\create-shortcut.vbs" desktop
if errorlevel 1 (
  echo.
  echo 바로가기 생성에 실패했습니다.
  pause
  exit /b 1
)

rem 게임 폴더에도 같은 아이콘 바로가기 생성
cscript //nologo "%~dp0scripts\create-shortcut.vbs" >nul

echo.
echo 바탕화면과 game 폴더에 "ExGame" 바로가기가 생성되었습니다.
echo 아이콘: branding\exgame.ico
pause
