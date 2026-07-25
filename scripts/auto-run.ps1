param(
    [int]$Port = 7456,
    [switch]$ForceRestart,
    [switch]$SkipSync
)

$ErrorActionPreference = "Stop"

$scriptDirectory = $PSScriptRoot
$projectPath = Split-Path -Parent $scriptDirectory
$gameRoot = Join-Path $projectPath "build\web-desktop"
$indexPath = Join-Path $gameRoot "index.html"

if (-not (Test-Path -LiteralPath $indexPath)) {
    # 배포 패키지(루트에 index.html)에서도 동작
    if (Test-Path -LiteralPath (Join-Path $scriptDirectory "index.html")) {
        $gameRoot = $scriptDirectory
    } else {
        throw "웹 빌드가 없습니다: $indexPath`n먼저 scripts\build-web.ps1 을 실행하세요."
    }
}

Write-Host "========================================"
Write-Host " ExGame 자동 실행"
Write-Host "========================================"
Write-Host ""

if (-not $SkipSync) {
    $syncScript = Join-Path $scriptDirectory "sync-runtime-atlases.ps1"
    $devAssets = Join-Path (Split-Path -Parent $scriptDirectory) "assets\textures"
    # 개발 트리에서만 동기화 (배포 패키지에는 소스 아틀라스가 없음)
    if ((Test-Path -LiteralPath $syncScript) -and (Test-Path -LiteralPath $devAssets)) {
        Write-Host "[1/2] 런타임 아틀라스 동기화..."
        try {
            & $syncScript -OutputPath $gameRoot
        } catch {
            Write-Host "[경고] 아틀라스 동기화 실패 — 서버는 계속 기동합니다: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[1/2] 아틀라스 동기화 생략 (배포 패키지 또는 스크립트 없음)"
    }
} else {
    Write-Host "[1/2] 아틀라스 동기화 생략 (-SkipSync)"
}

Write-Host "[2/2] 로컬 서버 기동 + 브라우저 열기..."
$startServer = Join-Path $scriptDirectory "start-server.ps1"
$args = @{ Port = $Port }
if ($ForceRestart) {
    $args.ForceRestart = $true
}
& $startServer @args
