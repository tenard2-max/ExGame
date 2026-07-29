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

function Test-LocalPortOpen([int]$ListenPort) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect("127.0.0.1", $ListenPort, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(200, $false)
        if (-not $ok) {
            $client.Close()
            return $false
        }
        $client.EndConnect($async)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Get-ListenerPids([int]$ListenPort) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
        return @($conns | ForEach-Object { $_.OwningProcess } | Where-Object { $_ -gt 0 } | Select-Object -Unique)
    } catch {
        return @()
    }
}

function Stop-ListenersOnPort([int]$ListenPort) {
    $pids = Get-ListenerPids $ListenPort
    foreach ($procId in $pids) {
        Write-Host "기존 서버 종료 (PID $procId, 포트 $ListenPort)"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
}

function Resolve-PythonCommand {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        return @{
            FilePath = $py.Source
            PrefixArgs = @("-3")
        }
    }
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return @{
            FilePath = $python.Source
            PrefixArgs = @()
        }
    }
    return $null
}

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

    Write-Host "Chrome/Edge를 찾지 못해 기본 브라우저로 엽니다."
    Start-Process $TargetUrl
}

function Wait-ForPort([int]$ListenPort, [int]$TimeoutMs = 15000) {
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalPortOpen $ListenPort) { return $true }
        Start-Sleep -Milliseconds 150
    }
    return $false
}

$pythonCmd = Resolve-PythonCommand
if (-not $pythonCmd) {
    throw "로컬 서버 실행에는 Python(py 또는 python)이 필요합니다. https://www.python.org/downloads/ 에서 설치 후 다시 실행하세요."
}

$urlVersion = ""
try {
    $pkgPath = Join-Path (Split-Path -Parent $scriptDirectory) "package.json"
    if (-not (Test-Path -LiteralPath $pkgPath)) {
        $pkgPath = Join-Path $gameRoot "package.json"
    }
    # 배포 패키지에는 package.json이 없을 수 있어 index/settings 대신 폴더명 사용
    if (Test-Path -LiteralPath $pkgPath) {
        $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
        $urlVersion = [string]$pkg.version
    } else {
        $urlVersion = Split-Path -Leaf $gameRoot
    }
} catch {
    $urlVersion = "local"
}
$url = "http://127.0.0.1:$Port/?offline=1&fullscreen=1&v=$([uri]::EscapeDataString($urlVersion))"
$portBusy = Test-LocalPortOpen $Port

# 기본: 포트가 점유되어 있으면 재시작 (옛 빌드 재사용 방지)
# 명시적으로 -ForceRestart:$false 를 준 경우에만 재사용
if ($portBusy) {
    if ($PSBoundParameters.ContainsKey('ForceRestart') -and -not $ForceRestart) {
        Write-Host "포트 $Port 재사용 요청됨 (-ForceRestart:`$false)"
    } else {
        Write-Host "포트 $Port 기존 서버 종료 후 현재 경로로 재기동..."
        Stop-ListenersOnPort $Port
        $portBusy = $false
    }
}

Write-Host "========================================"
Write-Host " ExGame 로컬 서버"
Write-Host "========================================"
Write-Host "접속: $url"
Write-Host "경로: $gameRoot"
Write-Host "Python: $($pythonCmd.FilePath)"
Write-Host ""

if ($portBusy) {
    Write-Host "포트 $Port 에 이미 서버가 실행 중입니다. 기존 서버를 재사용합니다."
    if (-not $NoBrowser) {
        Open-GameInFullscreenBrowser $url
    }
    Write-Host "브라우저만 열었습니다. (서버 재기동: start-server.bat -ForceRestart)"
    return
}

# Media Editor Export API 가 포함된 로컬 서버를 기동합니다.
# (fallback: 스크립트 없으면 python -m http.server)
$localServerPyCandidates = @(
    (Join-Path $scriptDirectory "exgame-local-server.py"),
    (Join-Path (Split-Path -Parent $scriptDirectory) "scripts\exgame-local-server.py"),
    (Join-Path $gameRoot "exgame-local-server.py")
)
$localServerPy = $localServerPyCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

$argList = @()
$argList += $pythonCmd.PrefixArgs
if ($localServerPy) {
    $argList += @(
        $localServerPy,
        "--port", "$Port",
        "--bind", "127.0.0.1",
        "--directory", $gameRoot
    )
    Write-Host "서버 스크립트: $localServerPy"
} else {
    Write-Host "경고: exgame-local-server.py 없음 — 정적 http.server 로 기동 (Export API 불가)"
    $argList += @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $gameRoot)
}

Write-Host "서버 기동 중..."
$server = Start-Process `
    -FilePath $pythonCmd.FilePath `
    -ArgumentList $argList `
    -WorkingDirectory $gameRoot `
    -PassThru `
    -WindowStyle Hidden

if (-not (Wait-ForPort -ListenPort $Port -TimeoutMs 20000)) {
    if ($server -and -not $server.HasExited) {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
    throw "포트 $Port 에서 서버가 기동되지 않았습니다. Python/방화벽/포트 충돌을 확인하세요."
}

Write-Host "서버 준비 완료 (PID $($server.Id))"
if (-not $NoBrowser) {
    Open-GameInFullscreenBrowser $url
}

Write-Host ""
Write-Host "플레이 중... 이 창을 닫으면 서버가 종료됩니다."
Write-Host "종료: Ctrl+C 또는 창 닫기"
try {
    Wait-Process -Id $server.Id
} finally {
    if ($server -and -not $server.HasExited) {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
}
