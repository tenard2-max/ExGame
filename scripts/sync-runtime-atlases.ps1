param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) {
    $OutputPath = Join-Path $projectPath "build\web-desktop"
}

if (-not (Test-Path -LiteralPath (Join-Path $OutputPath "index.html"))) {
    throw "web-desktop output missing: $OutputPath (run build-web.ps1 first)"
}

function Copy-RuntimeAtlas {
    param(
        [string]$Label,
        [string]$SourceDir,
        [string]$DestDir,
        [string[]]$Files,
        [string]$GenerateScript = $null
    )

    $missing = $false
    foreach ($file in $Files) {
        if (-not (Test-Path -LiteralPath (Join-Path $SourceDir $file))) {
            $missing = $true
            break
        }
    }
    if ($missing -and $GenerateScript) {
        Write-Host "Generating $Label..."
        py $GenerateScript
    }

    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    foreach ($file in $Files) {
        $from = Join-Path $SourceDir $file
        if (-not (Test-Path -LiteralPath $from)) {
            throw "$Label missing: $from"
        }
        Copy-Item -LiteralPath $from -Destination (Join-Path $DestDir $file) -Force
    }
    Write-Host "Synced $Label -> $DestDir"
}

Copy-RuntimeAtlas -Label "tile atlas" `
    -SourceDir (Join-Path $projectPath "assets\textures\tiles") `
    -DestDir (Join-Path $OutputPath "tiles") `
    -Files @("atlas.png", "atlas.json") `
    -GenerateScript (Join-Path $PSScriptRoot "build-tile-atlas.py")

Copy-RuntimeAtlas -Label "monster atlas" `
    -SourceDir (Join-Path $projectPath "assets\textures\monsters") `
    -DestDir (Join-Path $OutputPath "monsters") `
    -Files @("atlas.png", "atlas.json") `
    -GenerateScript (Join-Path $PSScriptRoot "slice-lizardmen.py")

Copy-RuntimeAtlas -Label "player sprite" `
    -SourceDir (Join-Path $projectPath "assets\textures\player") `
    -DestDir (Join-Path $OutputPath "player") `
    -Files @("player.png") `
    -GenerateScript (Join-Path $PSScriptRoot "prepare-player-sprite.py")

$playerJson = Join-Path $projectPath "assets\textures\player\player.json"
if (Test-Path -LiteralPath $playerJson) {
    Copy-Item -LiteralPath $playerJson -Destination (Join-Path $OutputPath "player\player.json") -Force
}

$charactersSrc = Join-Path $projectPath "assets\textures\characters"
$charactersDest = Join-Path $OutputPath "characters"
if (Test-Path -LiteralPath $charactersSrc) {
    $portraitSrc = Join-Path $charactersSrc "portraits"
    $playSrc = Join-Path $charactersSrc "play"
    if (-not (Test-Path -LiteralPath $portraitSrc) -or -not (Test-Path -LiteralPath $playSrc)) {
        Write-Host "Generating character sprites..."
        py (Join-Path $PSScriptRoot "prepare-character-sprites.py")
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $charactersDest "portraits") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $charactersDest "play") | Out-Null
    Copy-Item -Path (Join-Path $portraitSrc "*") -Destination (Join-Path $charactersDest "portraits") -Force
    Copy-Item -Path (Join-Path $playSrc "*") -Destination (Join-Path $charactersDest "play") -Force
    $catalogSrc = Join-Path $charactersSrc "catalog.json"
    if (Test-Path -LiteralPath $catalogSrc) {
        Copy-Item -LiteralPath $catalogSrc -Destination (Join-Path $charactersDest "catalog.json") -Force
    }
    Write-Host "Synced character sprites -> $charactersDest"
}

Copy-RuntimeAtlas -Label "content atlas" `
    -SourceDir (Join-Path $projectPath "assets\textures\content") `
    -DestDir (Join-Path $OutputPath "content") `
    -Files @("atlas.png", "atlas.json") `
    -GenerateScript (Join-Path $PSScriptRoot "slice-content-tiles.py")

Copy-RuntimeAtlas -Label "potion atlas" `
    -SourceDir (Join-Path $projectPath "assets\textures\potions") `
    -DestDir (Join-Path $OutputPath "potions") `
    -Files @("atlas.png", "atlas.json") `
    -GenerateScript (Join-Path $PSScriptRoot "prepare-potion-sprites.py")

Copy-RuntimeAtlas -Label "item atlas" `
    -SourceDir (Join-Path $projectPath "assets\textures\items") `
    -DestDir (Join-Path $OutputPath "items") `
    -Files @("atlas.png", "atlas.json") `
    -GenerateScript (Join-Path $PSScriptRoot "slice-items.py")

$npcSrc = Join-Path $projectPath "assets\textures\npcs"
$npcDest = Join-Path $OutputPath "npcs"
if (Test-Path -LiteralPath $npcSrc) {
    New-Item -ItemType Directory -Force -Path $npcDest | Out-Null
    Get-ChildItem -LiteralPath $npcSrc -Filter "*.png" | ForEach-Object {
        if ($_.Name -like "*-source.png") { return }
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $npcDest $_.Name) -Force
    }
    Write-Host "Synced NPC sprites -> $npcDest"
}

$uiSrc = Join-Path $projectPath "assets\textures\ui"
$uiDest = Join-Path $OutputPath "ui"
if (Test-Path -LiteralPath $uiSrc) {
    New-Item -ItemType Directory -Force -Path $uiDest | Out-Null
    Get-ChildItem -LiteralPath $uiSrc -Filter "*.png" -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $uiDest $_.Name) -Force
    }
    $portraitSrc = Join-Path $uiSrc "portraits"
    $portraitDest = Join-Path $uiDest "portraits"
    if (Test-Path -LiteralPath $portraitSrc) {
        New-Item -ItemType Directory -Force -Path $portraitDest | Out-Null
        Get-ChildItem -LiteralPath $portraitSrc -Filter "*.png" -File | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $portraitDest $_.Name) -Force
        }
        Write-Host "Synced UI portraits -> $portraitDest"
    }
    Write-Host "Synced UI textures -> $uiDest"
}

Write-Host "Runtime atlases synced: $OutputPath"
