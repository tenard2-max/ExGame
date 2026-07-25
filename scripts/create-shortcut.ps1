param(
    [string]$ShortcutPath = "",
    [switch]$Desktop
)

$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
$targetBat = Join-Path $projectPath "auto-run.bat"
$iconPath = Join-Path $projectPath "branding\exgame.ico"
$workingDir = $projectPath

if (-not (Test-Path -LiteralPath $targetBat)) {
    throw "실행 파일이 없습니다: $targetBat"
}
if (-not (Test-Path -LiteralPath $iconPath)) {
    throw "아이콘이 없습니다: $iconPath (먼저 scripts\make-icon.ico.py 실행)"
}

if (-not $ShortcutPath) {
    if ($Desktop) {
        $desktop = [Environment]::GetFolderPath("Desktop")
        $ShortcutPath = Join-Path $desktop "ExGame.lnk"
    } else {
        $ShortcutPath = Join-Path $projectPath "ExGame.lnk"
    }
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = $targetBat
$shortcut.WorkingDirectory = $workingDir
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "ExGame 오프라인 실행 (서버 기동 + 브라우저)"
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Host "바로가기 생성: $ShortcutPath"
Write-Host "대상: $targetBat"
Write-Host "아이콘: $iconPath"
