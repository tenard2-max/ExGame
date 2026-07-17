param(
    [int]$Port = 7456
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
    throw "index.html을 찾을 수 없습니다. build-web.ps1 또는 package-release.ps1을 먼저 실행하세요."
}

$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command python -ErrorAction SilentlyContinue
}
if (-not $python) {
    throw "오프라인 실행에는 Python(py 또는 python)이 필요합니다. 설치 후 다시 실행하세요."
}

$url = "http://127.0.0.1:$Port/?offline=1"
Write-Host "오프라인 로컬 서버 시작: $url"
Write-Host "게임 경로: $gameRoot"
Write-Host "종료하려면 Ctrl+C"

Start-Process $url
& $python.Source -m http.server $Port --bind 127.0.0.1 --directory $gameRoot
