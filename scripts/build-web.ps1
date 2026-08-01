param(
    [string]$CreatorPath = "C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe",
    [switch]$SkipCreatorBuild,
    [int]$CreatorIdleTimeoutSec = 90
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CreatorPath)) {
    throw "Cocos Creator 3.8.8 not found: $CreatorPath"
}

$projectPath = Split-Path -Parent $PSScriptRoot
$buildRoot = Join-Path $projectPath "build"
$outputPath = Join-Path $buildRoot "web-desktop"
$buildConfigPath = Join-Path $projectPath "build-config\web-desktop.json"
$buildOptions = "configPath=$buildConfigPath"
$syncScript = Join-Path $PSScriptRoot "sync-runtime-atlases.ps1"

if (-not $SkipCreatorBuild) {
    # Creator often stays alive after build finishes. Wait for index.html update
    # then kill after idle timeout so atlas sync always runs.
    $indexPath = Join-Path $outputPath "index.html"
    $indexBefore = $null
    if (Test-Path -LiteralPath $indexPath) {
        $indexBefore = (Get-Item -LiteralPath $indexPath).LastWriteTimeUtc
    }

    $creatorProcess = Start-Process `
        -FilePath $CreatorPath `
        -ArgumentList @("--project", "`"$projectPath`"", "--build", "`"$buildOptions`"") `
        -PassThru `
        -NoNewWindow

    $deadline = (Get-Date).AddMinutes(15)
    $buildSeen = $false
    $idleSince = $null

    while ((Get-Date) -lt $deadline) {
        if ($creatorProcess.HasExited) {
            break
        }

        if (Test-Path -LiteralPath $indexPath) {
            $indexNow = (Get-Item -LiteralPath $indexPath).LastWriteTimeUtc
            if ($null -eq $indexBefore -or $indexNow -gt $indexBefore) {
                if (-not $buildSeen) {
                    Write-Host "Build output updated. Waiting for Creator idle exit..."
                    $buildSeen = $true
                    $idleSince = Get-Date
                }
            }
        }

        if ($buildSeen -and $idleSince) {
            $idleSec = ((Get-Date) - $idleSince).TotalSeconds
            if ($idleSec -ge $CreatorIdleTimeoutSec) {
                Write-Host "Idle ${CreatorIdleTimeoutSec}s after build - stopping Creator"
                Stop-Process -Id $creatorProcess.Id -Force -ErrorAction SilentlyContinue
                break
            }
        }

        Start-Sleep -Seconds 2
    }

    if (-not $creatorProcess.HasExited) {
        Write-Host "Forcing Creator process stop"
        Stop-Process -Id $creatorProcess.Id -Force -ErrorAction SilentlyContinue
    }

    if (-not (Test-Path -LiteralPath $indexPath)) {
        throw "Cocos Creator web build failed (no index.html)"
    }
} elseif (-not (Test-Path -LiteralPath (Join-Path $outputPath "index.html"))) {
    throw "SkipCreatorBuild but index.html missing: $outputPath"
}

$indexPath = Join-Path $outputPath "index.html"
$indexHtml = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
# 상단 헤더·푸터 제거 + GameDiv 전체 화면 (PC/모바일 공통)
$patched = $indexHtml
$patched = $patched -replace '(?s)<h1\s+class="header">.*?</h1>\s*', ''
$patched = $patched -replace '(?s)<p\s+class="footer">.*?</p>\s*', ''
$patched = $patched -replace `
    'style="width: 2560px; height: 1440px;"', `
    'style="width: 100vw; height: 100vh;"'
$patched = $patched -replace `
    'style="width: min\(100vw - 16px, 2560px\); height: min\(100vh - 120px, 1440px\);"', `
    'style="width: 100vw; height: 100vh;"'
if ($patched -ne $indexHtml) {
    Set-Content -LiteralPath $indexPath -Value $patched -Encoding UTF8
    Write-Host "Patched index.html (chrome strip + full viewport)"
}

# Cocos 기본 style.css 는 body 가 white — 로딩 중 하얀 화면 방지
$stylePath = Join-Path $outputPath "style.css"
if (Test-Path -LiteralPath $stylePath) {
    $styleText = Get-Content -LiteralPath $stylePath -Raw -Encoding UTF8
    $stylePatched = $styleText -replace 'background-color:\s*white', 'background-color: #05070c'
    if ($stylePatched -eq $styleText) {
        $stylePatched = $styleText -replace 'background-color:\s*#fff(fff)?', 'background-color: #05070c'
    }
    if ($stylePatched -ne $styleText) {
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($stylePath, $stylePatched, $utf8NoBom)
        Write-Host "Patched style.css body background to #05070c"
    }
}

# head 에는 style 만 (div를 head에 넣으면 HTML 파서가 깨져 SystemJS 미기동)
$indexAfter = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
if ($indexAfter -notmatch 'exgame-boot-skin') {
    $bootStyle = '<style id="exgame-boot-skin">html,body{background:#05070c!important;}</style>'
    $indexBoot = $indexAfter -replace '</head>', ($bootStyle + "`r`n</head>")
    # body 시작 직후에 로딩 힌트 (ASCII only — 인코딩 깨짐 방지)
    $bootHint = '<div id="exgame-boot-hint" style="position:fixed;left:50%;bottom:8%;transform:translateX(-50%);z-index:2147482000;color:#ffe7a8;font:16px/1.4 sans-serif;opacity:.85;pointer-events:none">Loading...</div><script>(function(){function c(){var e=document.getElementById("exgame-boot-hint");if(e)e.remove()}setTimeout(c,15000);var o=new MutationObserver(function(){if(document.getElementById("exgame-splash-root")){c();o.disconnect()}});o.observe(document.documentElement,{childList:true,subtree:true})})();</script>'
    $indexBoot = $indexBoot -replace '<body>', ("<body>`r`n" + $bootHint)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($indexPath, $indexBoot, $utf8NoBom)
    Write-Host "Injected early boot skin into index.html (style in head, hint in body)"
}

# Cache-proof MP4 entry button (does not depend on Cocos bundle being fresh)
$indexFinal = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
if ($indexFinal -notmatch 'exgame-mp4-fab') {
    $mp4Fab = @'
<button id="exgame-mp4-fab" type="button" title="Media Timeline Editor">MP4</button>
<style id="exgame-mp4-fab-style">
#exgame-mp4-fab{
  position:fixed!important; top:16px!important; right:230px!important;
  z-index:2147483646!important; width:72px; height:48px;
  border:2px solid #6ecf9a; border-radius:10px;
  background:rgba(20,48,36,.96); color:#e8fff3;
  font:700 16px/1 "Segoe UI",sans-serif; cursor:pointer;
  box-shadow:0 4px 14px rgba(0,0,0,.4); pointer-events:auto!important;
}
#exgame-mp4-fab:hover{ border-color:#9dffc7; }
@media (max-width:900px){
  #exgame-mp4-fab{ right:12px!important; top:auto!important; bottom:16px!important; }
}
</style>
<script id="exgame-mp4-fab-script">
(function(){
  function bind(){
    var b=document.getElementById("exgame-mp4-fab");
    if(!b||b.__exgameBound) return;
    b.__exgameBound=true;
    b.addEventListener("click", function(ev){
      ev.preventDefault(); ev.stopPropagation();
      if(typeof window.exgameOpenMediaTimelineEditor==="function"){
        window.exgameOpenMediaTimelineEditor();
      }else{
        alert("Game is still loading. Click again after the world appears.");
      }
    });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
  setInterval(bind, 1000);
})();
</script>
'@
    $indexWithFab = $indexFinal -replace '</body>', ($mp4Fab + "`r`n</body>")
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($indexPath, $indexWithFab, $utf8NoBom)
    Write-Host "Injected cache-proof MP4 FAB into index.html"
}

& $syncScript -OutputPath $outputPath

# 모바일에는 ffmpeg.exe/로컬 서버가 없으므로 브라우저 인코더를 함께 번들합니다.
# tools/ 는 git 제외 대상이라 없으면 여기서 내려받습니다.
$ffmpegWasmSrc = Join-Path $projectPath "tools\ffmpeg-wasm"
$ffmpegWasmFiles = @("ffmpeg.js", "814.ffmpeg.js", "ffmpeg-core.js", "ffmpeg-core.wasm")
$needFetch = $false
foreach ($name in $ffmpegWasmFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $ffmpegWasmSrc $name))) { $needFetch = $true }
}
if ($needFetch) {
    & (Join-Path $PSScriptRoot "fetch-ffmpeg-wasm.ps1")
}
$ffmpegWasmDst = Join-Path $outputPath "ffmpeg-wasm"
New-Item -ItemType Directory -Force -Path $ffmpegWasmDst | Out-Null
foreach ($name in $ffmpegWasmFiles) {
    Copy-Item -LiteralPath (Join-Path $ffmpegWasmSrc $name) -Destination (Join-Path $ffmpegWasmDst $name) -Force
}
Write-Host "Bundled ffmpeg.wasm runtime into build output"

# Build output sometimes keeps stale 1280x720; force QHD to match runtime DESIGN_*.
$settingsPath = Join-Path $outputPath "src\settings.json"
if (Test-Path -LiteralPath $settingsPath) {
    $settingsText = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8
    $settingsPatched = $settingsText `
        -replace '"width"\s*:\s*1280', '"width": 2560' `
        -replace '"height"\s*:\s*720', '"height": 1440'
    if ($settingsPatched -ne $settingsText) {
        Set-Content -LiteralPath $settingsPath -Value $settingsPatched -Encoding UTF8
        Write-Host "Patched settings.json designResolution to 2560x1440"
    }
}

Write-Host "Web build ready: $outputPath"
