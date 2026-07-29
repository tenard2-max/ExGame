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
    # Package layout: index.html sits next to this script.
    if (Test-Path -LiteralPath (Join-Path $scriptDirectory "index.html")) {
        $gameRoot = $scriptDirectory
    } else {
        throw "Web build missing: $indexPath. Run scripts\build-web.ps1 first."
    }
}

Write-Host "========================================"
Write-Host " ExGame auto-run"
Write-Host "========================================"
Write-Host ""

if (-not $SkipSync) {
    $syncScript = Join-Path $scriptDirectory "sync-runtime-atlases.ps1"
    $devAssets = Join-Path (Split-Path -Parent $scriptDirectory) "assets\textures"
    if ((Test-Path -LiteralPath $syncScript) -and (Test-Path -LiteralPath $devAssets)) {
        Write-Host "[1/2] Syncing runtime atlases..."
        try {
            & $syncScript -OutputPath $gameRoot
        } catch {
            Write-Host "[WARN] Atlas sync failed - continuing: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[1/2] Atlas sync skipped (package mode)"
    }
} else {
    Write-Host "[1/2] Atlas sync skipped (-SkipSync)"
}

Write-Host "[2/2] Starting local server + browser..."
$startServer = Join-Path $scriptDirectory "start-server.ps1"
# Always restart so an old :7456 server from a previous ZIP is not reused.
$doRestart = $true
if ($PSBoundParameters.ContainsKey('ForceRestart') -and -not $ForceRestart) {
    $doRestart = $false
}
$serverArgs = @{ Port = $Port }
if ($doRestart) {
    $serverArgs.ForceRestart = $true
}
& $startServer @serverArgs
