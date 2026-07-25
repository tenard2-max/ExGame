<#
.SYNOPSIS
  PC 오프라인 ZIP(bat)을 만들고 GitHub Releases에 업로드합니다.
  www.zip / OTA 패키지는 만들지 않습니다.

.EXAMPLE
  .\scripts\publish-github-release.ps1
  .\scripts\publish-github-release.ps1 -Owner tenard2 -Repo ExGame -SkipUpload
#>
param(
    [string]$Version = "",
    [string]$Owner = "",
    [string]$Repo = "",
    [switch]$SkipWebBuild,
    [switch]$SkipUpload,
    [string]$Notes = ""
)

$ErrorActionPreference = "Stop"
$projectPath = Split-Path -Parent $PSScriptRoot

$packageJson = Get-Content -LiteralPath (Join-Path $projectPath "package.json") -Raw | ConvertFrom-Json
if (-not $Version) {
    $Version = [string]$packageJson.version
}

$updateXml = Join-Path $projectPath "mobile\android\app\src\main\res\values\update_config.xml"
if (-not $Owner -or -not $Repo) {
    if (Test-Path -LiteralPath $updateXml) {
        $xmlText = Get-Content -LiteralPath $updateXml -Raw -Encoding UTF8
        if (-not $Owner -and $xmlText -match 'name="github_owner"[^>]*>([^<]+)<') {
            $Owner = $Matches[1].Trim()
        }
        if (-not $Repo -and $xmlText -match 'name="github_repo"[^>]*>([^<]+)<') {
            $Repo = $Matches[1].Trim()
        }
    }
}
if (-not $Owner) { $Owner = "tenard2-max" }
if (-not $Repo) { $Repo = "ExGame" }

Write-Host "ExGame publish: v$Version -> $Owner/$Repo"

$parts = $Version.Split('.')
$vMajor = if ($parts.Length -gt 0) { [int]$parts[0] } else { 0 }
$vMinor = if ($parts.Length -gt 1) { [int]$parts[1] } else { 0 }
$vPatch = if ($parts.Length -gt 2) { [int]$parts[2] } else { 0 }
$versionCode = ($vMajor * 10000) + ($vMinor * 100) + $vPatch
if ($versionCode -lt 1) { $versionCode = 1 }

$gradlePath = Join-Path $projectPath "mobile\android\app\build.gradle"
if (Test-Path -LiteralPath $gradlePath) {
    $gradle = Get-Content -LiteralPath $gradlePath -Raw -Encoding UTF8
    $gradle2 = $gradle `
        -replace 'versionCode\s+\d+', "versionCode $versionCode" `
        -replace 'versionName\s+"[^"]+"', "versionName `"$Version`""
    if ($gradle2 -ne $gradle) {
        Set-Content -LiteralPath $gradlePath -Value $gradle2 -Encoding UTF8
        Write-Host "Synced app/build.gradle -> $Version ($versionCode)"
    }
}

$outDir = Join-Path $projectPath "release"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$webDesktop = Join-Path $projectPath "build\web-desktop"

if (-not $SkipWebBuild) {
    Write-Host '[publish] Web build...'
    & (Join-Path $PSScriptRoot "build-web.ps1")
} elseif (-not (Test-Path -LiteralPath (Join-Path $webDesktop "index.html"))) {
    throw "web-desktop build missing. Run build-web.ps1 first."
}

$versionObj = [ordered]@{
    version     = $Version
    versionCode = $versionCode
    pcZip       = "exgame-$Version.zip"
    publishedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$versionJson = ($versionObj | ConvertTo-Json -Compress)
$versionJsonPath = Join-Path $outDir "version.json"
# UTF8 no BOM — Android JSONObject 가 BOM 있으면 파싱 실패할 수 있음
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($versionJsonPath, $versionJson, $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $webDesktop "version.json"), $versionJson, $utf8NoBom)
Write-Host "Wrote version.json ($Version / $versionCode) — GitHub에는 PC ZIP만 업로드"

Write-Host '[publish] PC ZIP (bat) 패키징...'
& (Join-Path $PSScriptRoot "package-release.ps1") -Version $Version

# 이전 릴리스용 www.zip이 남아 있으면 삭제 (업로드하지 않음)
$legacyWwwZip = Join-Path $outDir "exgame-$Version-www.zip"
if (Test-Path -LiteralPath $legacyWwwZip) {
    Remove-Item -LiteralPath $legacyWwwZip -Force
    Write-Host "Removed legacy $legacyWwwZip"
}

$pcZip = Join-Path $outDir "exgame-$Version.zip"
if (-not (Test-Path -LiteralPath $pcZip)) {
    throw "PC ZIP missing: $pcZip"
}

if ($SkipUpload) {
    Write-Host "SkipUpload: local artifacts only."
    Write-Host "  $pcZip"
    Write-Host "  $versionJsonPath (local only, not uploaded)"
    exit 0
}

$ghCmd = $null
$localGh = Join-Path $projectPath "tools\gh\gh.exe"
if (Test-Path -LiteralPath $localGh) {
    $ghCmd = $localGh
} elseif (Get-Command gh -ErrorAction SilentlyContinue) {
    $ghCmd = "gh"
}
if (-not $ghCmd) {
    Write-Warning "gh CLI missing. Install tools/gh or add gh to PATH."
    Write-Host "Manual upload files:"
    Write-Host "  $pcZip"
    Write-Host "Tag: v$Version"
    exit 0
}

$tag = "v$Version"
if (-not $Notes) {
    $Notes = @"
## ExGame v$Version

### PC
1. ``exgame-$Version.zip`` 다운로드 후 압축 해제
2. ``auto-run.bat`` 실행 (Python 필요)
3. ``index.html`` 더블클릭은 지원하지 않습니다 (하얀 화면)

Android APK / www OTA zip은 Releases에 올리지 않습니다.
"@
}

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $ghCmd repo view "$Owner/$Repo" 2>$null | Out-Null
$repoMissing = ($LASTEXITCODE -ne 0)
$ErrorActionPreference = $prevEap
if ($repoMissing) {
    Write-Host "Creating repo: $Owner/$Repo"
    $ErrorActionPreference = "Continue"
    & $ghCmd repo create "$Owner/$Repo" --public --source $projectPath --remote origin --push
    $createCode = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($createCode -ne 0) {
        throw "gh repo create failed. Run: tools\gh\gh.exe auth login"
    }
}

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $ghCmd release view $tag --repo "$Owner/$Repo" 2>$null | Out-Null
$releaseExists = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEap
# GitHub Releases: PC bat 패키지(ZIP)만 등록
$assets = @($pcZip)

$ErrorActionPreference = "Continue"
try {
    if ($releaseExists) {
        Write-Host "Uploading assets to existing release $tag"
        & $ghCmd release upload $tag @assets --repo "$Owner/$Repo" --clobber
    } else {
        Write-Host "Creating release $tag"
        & $ghCmd release create $tag @assets --repo "$Owner/$Repo" --title "ExGame $tag" --notes $Notes
    }
    if ($LASTEXITCODE -ne 0) {
        throw "gh release failed"
    }
} finally {
    $ErrorActionPreference = "Stop"
}

Write-Host "Done: https://github.com/$Owner/$Repo/releases/tag/$tag"
