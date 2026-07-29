param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content -LiteralPath (Join-Path $projectPath "package.json") -Raw | ConvertFrom-Json
if (-not $Version) {
    $Version = [string]$packageJson.version
}

$sourcePath = Join-Path $projectPath "build\web-desktop"
if (-not (Test-Path -LiteralPath (Join-Path $sourcePath "index.html"))) {
    throw "배포할 Web 빌드가 없습니다. 먼저 scripts\build-web.ps1을 실행하세요."
}

$releaseRoot = Join-Path $projectPath "release"
$packageName = "exgame-$Version"
$packagePath = Join-Path $releaseRoot $packageName

if (Test-Path -LiteralPath $packagePath) {
    Remove-Item -LiteralPath $packagePath -Recurse -Force
}
New-Item -ItemType Directory -Path $packagePath | Out-Null

# -LiteralPath는 와일드카드를 확장하지 않으므로 Get-ChildItem으로 복사합니다.
Get-ChildItem -LiteralPath $sourcePath | Copy-Item -Destination $packagePath -Recurse -Force
$launcherScripts = @(
    "run-offline.ps1", "run-offline.bat",
    "start-server.ps1", "start-server.bat",
    "auto-run.ps1", "auto-run.bat",
    "sync-runtime-atlases.ps1",
    "exgame-local-server.py",
    "fetch-ffmpeg.ps1"
)
foreach ($name in $launcherScripts) {
    $src = Join-Path $PSScriptRoot $name
    if (Test-Path -LiteralPath $src) {
        Copy-Item -LiteralPath $src -Destination $packagePath -Force
    }
}
Copy-Item -LiteralPath (Join-Path $projectPath "docs\OFFLINE.md") -Destination (Join-Path $packagePath "OFFLINE.md") -Force

# Media Editor: ffmpeg.exe 동봉(있으면)
$ffmpegSrc = Join-Path $projectPath "tools\ffmpeg\ffmpeg.exe"
$ffmpegDestDir = Join-Path $packagePath "tools\ffmpeg"
New-Item -ItemType Directory -Force -Path $ffmpegDestDir | Out-Null
$ffmpegReadme = Join-Path $projectPath "tools\ffmpeg\README.md"
if (Test-Path -LiteralPath $ffmpegReadme) {
    Copy-Item -LiteralPath $ffmpegReadme -Destination (Join-Path $ffmpegDestDir "README.md") -Force
}
if (Test-Path -LiteralPath $ffmpegSrc) {
    Copy-Item -LiteralPath $ffmpegSrc -Destination (Join-Path $ffmpegDestDir "ffmpeg.exe") -Force
    Write-Host "ffmpeg.exe bundled"
} else {
    Write-Host "WARN: tools/ffmpeg/ffmpeg.exe missing - run fetch-ffmpeg.ps1 before Export"
}

if (-not (Test-Path -LiteralPath (Join-Path $packagePath "index.html"))) {
    throw "index.html missing in package. Check web build copy."
}

$zipPath = Join-Path $releaseRoot "$packageName.zip"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path $packagePath -DestinationPath $zipPath -Force

Write-Host "Package ready:"
Write-Host "  folder: $packagePath"
Write-Host "  ZIP   : $zipPath"
Write-Host "Run: $packagePath\auto-run.bat"
