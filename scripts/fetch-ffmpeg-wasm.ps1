<#
.SYNOPSIS
    ffmpeg.wasm(단일 스레드) 런타임 자산을 tools/ffmpeg-wasm 으로 내려받습니다.

.DESCRIPTION
    모바일(APK)에는 ffmpeg.exe와 로컬 파이썬 서버가 없으므로, MP4 Export를
    브라우저 안에서 직접 수행합니다. 앱은 오프라인으로 동작해야 하므로 CDN을
    쓰지 않고 아래 4개 파일을 APK/웹 빌드에 함께 넣습니다.

      ffmpeg.js        @ffmpeg/ffmpeg UMD 진입점
      814.ffmpeg.js    위 UMD가 띄우는 워커 청크 (classWorkerURL 로 직접 지정)
      ffmpeg-core.js   wasm 로더
      ffmpeg-core.wasm 코어 (약 31MB)

    멀티스레드 코어(core-mt)는 SharedArrayBuffer가 필요하고 그러려면
    COOP/COEP 헤더가 있어야 하는데, Android WebView의 appassets 로더에는
    헤더를 붙일 수 없습니다. 그래서 단일 스레드 코어를 사용합니다.
#>
[CmdletBinding()]
param(
    [string]$OutputDir,
    [string]$FfmpegVersion = "0.12.15",
    [string]$CoreVersion = "0.12.10",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
if (-not $OutputDir) {
    $OutputDir = Join-Path $projectPath "tools\ffmpeg-wasm"
}

$expected = @("ffmpeg.js", "814.ffmpeg.js", "ffmpeg-core.js", "ffmpeg-core.wasm")
$allPresent = $true
foreach ($name in $expected) {
    if (-not (Test-Path -LiteralPath (Join-Path $OutputDir $name))) { $allPresent = $false }
}
if ($allPresent -and -not $Force) {
    Write-Host "ffmpeg.wasm 자산이 이미 있습니다: $OutputDir (다시 받으려면 -Force)"
    exit 0
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$scratch = Join-Path ([System.IO.Path]::GetTempPath()) "exgame-ffmpeg-wasm"
if (Test-Path -LiteralPath $scratch) {
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $scratch | Out-Null

# 패키지 이름 -> (tarball URL, 압축 해제 폴더)
$packages = @(
    @{ Name = "ffmpeg"; Url = "https://registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-$FfmpegVersion.tgz" },
    @{ Name = "core";   Url = "https://registry.npmjs.org/@ffmpeg/core/-/core-$CoreVersion.tgz" }
)

foreach ($pkg in $packages) {
    $tgz = Join-Path $scratch "$($pkg.Name).tgz"
    $dest = Join-Path $scratch $pkg.Name
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Write-Host "다운로드: $($pkg.Url)"
    Invoke-WebRequest -Uri $pkg.Url -OutFile $tgz -TimeoutSec 600
    tar -xzf $tgz -C $dest
    if ($LASTEXITCODE -ne 0) {
        throw "tar 압축 해제 실패: $tgz"
    }
}

# npm tarball 내부 구조는 항상 package/ 하위입니다.
$copies = @(
    @{ From = Join-Path $scratch "ffmpeg\package\dist\umd\ffmpeg.js";          To = "ffmpeg.js" },
    @{ From = Join-Path $scratch "ffmpeg\package\dist\umd\814.ffmpeg.js";      To = "814.ffmpeg.js" },
    @{ From = Join-Path $scratch "core\package\dist\umd\ffmpeg-core.js";       To = "ffmpeg-core.js" },
    @{ From = Join-Path $scratch "core\package\dist\umd\ffmpeg-core.wasm";     To = "ffmpeg-core.wasm" }
)

foreach ($copy in $copies) {
    if (-not (Test-Path -LiteralPath $copy.From)) {
        throw "패키지에서 파일을 찾지 못했습니다: $($copy.From)"
    }
    Copy-Item -LiteralPath $copy.From -Destination (Join-Path $OutputDir $copy.To) -Force
}

Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "ffmpeg.wasm 준비 완료: $OutputDir"
Get-ChildItem -LiteralPath $OutputDir -File |
    Select-Object Name, @{ n = "MB"; e = { [math]::Round($_.Length / 1MB, 2) } } |
    Format-Table -AutoSize
