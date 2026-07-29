param(
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
if (-not $OutputDir) {
    $OutputDir = Join-Path $projectPath "tools\ffmpeg"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$destExe = Join-Path $OutputDir "ffmpeg.exe"
if (Test-Path -LiteralPath $destExe) {
    Write-Host "이미 존재: $destExe"
    exit 0
}

# gyan.dev essentials release (windows amp64 zip)
$url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$zipPath = Join-Path $env:TEMP "exgame-ffmpeg-essentials.zip"
$extractRoot = Join-Path $env:TEMP "exgame-ffmpeg-extract"

Write-Host "다운로드: $url"
Invoke-WebRequest -Uri $url -OutFile $zipPath
if (Test-Path -LiteralPath $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
}
Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force

$found = Get-ChildItem -Path $extractRoot -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $found) {
    throw "ffmpeg.exe를 zip에서 찾지 못했습니다."
}
Copy-Item -LiteralPath $found.FullName -Destination $destExe -Force
Write-Host "저장: $destExe"
