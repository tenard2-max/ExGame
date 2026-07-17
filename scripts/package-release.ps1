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
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "run-offline.ps1") -Destination $packagePath -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "run-offline.bat") -Destination $packagePath -Force
Copy-Item -LiteralPath (Join-Path $projectPath "docs\OFFLINE.md") -Destination (Join-Path $packagePath "OFFLINE.md") -Force

if (-not (Test-Path -LiteralPath (Join-Path $packagePath "index.html"))) {
    throw "패키지에 index.html이 없습니다. 빌드 산출물 복사를 확인하세요."
}

$zipPath = Join-Path $releaseRoot "$packageName.zip"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path $packagePath -DestinationPath $zipPath -Force

Write-Host "배포 패키지 생성 완료:"
Write-Host "  폴더: $packagePath"
Write-Host "  ZIP : $zipPath"
Write-Host "실행: $packagePath\run-offline.bat"
