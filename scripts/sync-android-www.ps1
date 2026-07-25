param(
    [string]$WebBuildPath = ""
)

$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
if (-not $WebBuildPath) {
    $WebBuildPath = Join-Path $projectPath "build\web-desktop"
}

$indexPath = Join-Path $WebBuildPath "index.html"
if (-not (Test-Path -LiteralPath $indexPath)) {
    throw "웹 빌드가 없습니다: $WebBuildPath`n먼저 scripts\build-web.ps1 을 실행하세요."
}

$wwwPath = Join-Path $projectPath "mobile\android\app\src\main\assets\www"
if (Test-Path -LiteralPath $wwwPath) {
    Get-ChildItem -LiteralPath $wwwPath -Force |
        Where-Object { $_.Name -ne "README.txt" } |
        Remove-Item -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $wwwPath | Out-Null
}

Get-ChildItem -LiteralPath $WebBuildPath | Copy-Item -Destination $wwwPath -Recurse -Force

if (-not (Test-Path -LiteralPath (Join-Path $wwwPath "index.html"))) {
    throw "동기화 실패: assets/www/index.html 이 없습니다."
}

Write-Host "Android assets/www 동기화 완료:"
Write-Host "  원본: $WebBuildPath"
Write-Host "  대상: $wwwPath"
