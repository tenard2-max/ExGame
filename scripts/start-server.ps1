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

$urlVersion = "local"
try {
    $pkgPath = Join-Path (Split-Path -Parent $scriptDirectory) "package.json"
    if (-not (Test-Path -LiteralPath $pkgPath)) {
        $pkgPath = Join-Path $gameRoot "package.json"
    }
    if (Test-Path -LiteralPath $pkgPath) {
        $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
        $urlVersion = [string]$pkg.version
    } else {
        $urlVersion = Split-Path -Leaf $gameRoot
    }
} catch {
    $urlVersion = "local"
}
$versionQuery = [uri]::EscapeDataString($urlVersion)
$url = "http://127.0.0.1:$Port/?offline=1&fullscreen=1&v=$versionQuery"
$portBusy = Test-LocalPortOpen $Port

# Restart occupied port by default so an old build is not reused.
# Only reuse when caller passes -ForceRestart:$false explicitly.
if ($portBusy) {
    $reuseRequested = $PSBoundParameters.ContainsKey('ForceRestart') -and (-not $ForceRestart)
    if ($reuseRequested) {
        Write-Host "Reusing port $Port (-ForceRestart:false)"
    } else {
        Write-Host "Stopping existing server on port $Port ..."
        Stop-ListenersOnPort $Port
        $portBusy = $false
    }
}

Write-Host "========================================"
Write-Host " ExGame local server"
Write-Host "========================================"
Write-Host "URL : $url"
Write-Host "Root: $gameRoot"
Write-Host "Python: $($pythonCmd.FilePath)"
Write-Host ""

if ($portBusy) {
    Write-Host "Port $Port already in use. Reusing existing server."
    if (-not $NoBrowser) {
        Open-GameInFullscreenBrowser $url
    }
    Write-Host "Opened browser only."
    return
}

# Media Editor Export API server (fallback: python -m http.server)
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
    Write-Host "Server script: $localServerPy"
} else {
    Write-Host "WARN: exgame-local-server.py missing - using static http.server (no Export API)"
    $argList += @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $gameRoot)
}

Write-Host "Starting server..."
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
    throw "Server did not start on port $Port. Check Python/firewall/port conflict."
}

Write-Host "Server ready (PID $($server.Id))"
if (-not $NoBrowser) {
    Open-GameInFullscreenBrowser $url
}

Write-Host ""
Write-Host "Playing... Closing this window stops the server."
Write-Host "Exit: Ctrl+C or close window"
try {
    Wait-Process -Id $server.Id
} finally {
    if ($server -and -not $server.HasExited) {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
}
