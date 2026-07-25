param(
    [int]$Port = 7456,
    [switch]$NoBrowser,
    [switch]$ForceRestart
)

$ErrorActionPreference = "Stop"

# 패키지 루트 또는 개발 트리(scripts/)에서 모두 동작합니다.
$scriptDirectory = $PSScriptRoot
$candidateRoots = @(
    $scriptDirectory,
    (Join-Path (Split-Path -Parent $scriptDirectory) "build\web-desktop")
)

$gameRoot = $candidateRoots | Where-Object {
    Test-Path -LiteralPath (Join-Path $_ "index.html")
} | Select-Object -First 1

if (-not $gameRoot) {
    throw "index.html을 찾을 수 없습니다. 먼저 build-web.ps1 또는 package-release.ps1을 실행하세요."
}

function Get-ListenersOnPort([int]$ListenPort) {
    Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
}

function Stop-ListenersOnPort([int]$ListenPort) {
    $listeners = Get-ListenersOnPort $ListenPort
    foreach ($conn in $listeners) {
        $procId = $conn.OwningProcess
        if ($procId -and $procId -gt 0) {
            Write-Host "기존 서버 종료 (PID $procId, 포트 $ListenPort)"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 400
}

$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command python -ErrorAction SilentlyContinue
}
if (-not $python) {
    throw "로컬 서버 실행에는 Python(py 또는 python)이 필요합니다. 설치 후 다시 실행하세요."
}

$url = "http://127.0.0.1:$Port/?offline=1&fullscreen=1"
$existing = @(Get-ListenersOnPort $Port)

if ($ForceRestart -and $existing.Count -gt 0) {
    Stop-ListenersOnPort $Port
    $existing = @()
}

Write-Host "========================================"
Write-Host " ExGame 로컬 서버"
Write-Host "========================================"
Write-Host "접속: $url"
Write-Host "경로: $gameRoot"
Write-Host ""

function Open-GameInFullscreenBrowser([string]$TargetUrl) {
    $launchers = @(
        @{
            Path = Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
            Args = @("--start-fullscreen", "--app=$TargetUrl")
        },
        @{
            Path = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
            Args = @("--start-fullscreen", "--app=$TargetUrl")
        },
        @{
            Path = Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"
            Args = @("--start-fullscreen", "--app=$TargetUrl")
        },
        @{
            Path = Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
            Args = @("--start-fullscreen", "--app=$TargetUrl")
        }
    )

    foreach ($launcher in $launchers) {
        if (-not (Test-Path -LiteralPath $launcher.Path)) { continue }
        Write-Host "전체화면 브라우저로 실행: $($launcher.Path)"
        Start-Process -FilePath $launcher.Path -ArgumentList $launcher.Args | Out-Null
        return
    }

    Write-Host "Chrome/Edge를 찾지 못해 기본 브라우저로 엽니다. (페이지에서 전체화면 전환)"
    Start-Process $TargetUrl
}

if ($existing.Count -gt 0) {
    Write-Host "포트 $Port 에 이미 서버가 실행 중입니다. 기존 서버를 재사용합니다."
    if (-not $NoBrowser) {
        Open-GameInFullscreenBrowser $url
    }
    Write-Host "브라우저만 열었습니다. (서버 재기동: -ForceRestart)"
    return
}

if (-not $NoBrowser) {
    Open-GameInFullscreenBrowser $url
}

Write-Host "서버 기동 중... 종료하려면 Ctrl+C"
& $python.Source -m http.server $Port --bind 127.0.0.1 --directory $gameRoot
