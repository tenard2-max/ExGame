param(
    [string]$Version = "",
    [switch]$SkipWebBuild
)

$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content -LiteralPath (Join-Path $projectPath "package.json") -Raw | ConvertFrom-Json
if (-not $Version) {
    $Version = [string]$packageJson.version
}

if (-not $SkipWebBuild) {
    Write-Host "[1/4] Web 빌드..."
    & (Join-Path $PSScriptRoot "build-web.ps1")
} else {
    Write-Host "[1/4] Web 빌드 생략 (-SkipWebBuild)"
}

Write-Host "[2/4] PC 오프라인 ZIP 패키징..."
& (Join-Path $PSScriptRoot "package-release.ps1") -Version $Version

Write-Host "[3/4] Android www 동기화..."
& (Join-Path $PSScriptRoot "sync-android-www.ps1")

$androidDir = Join-Path $projectPath "mobile\android"
$gradlew = Join-Path $androidDir "gradlew.bat"
$releaseApk = Join-Path $androidDir "app\build\outputs\apk\release\app-release-unsigned.apk"
$debugApk = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
$outDir = Join-Path $projectPath "release"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

Write-Host "[4/4] APK 빌드 시도..."
$apkBuilt = $false

# Android Studio JBR / SDK 환경
$studioJbr = "C:\Program Files\Android\Android Studio\jbr"
if (-not (Test-Path -LiteralPath (Join-Path $studioJbr "bin\java.exe"))) {
  $studioJbr = "I:\Program Files\Android\Android Studio\jbr"
}
if (Test-Path -LiteralPath (Join-Path $studioJbr "bin\java.exe")) {
  $env:JAVA_HOME = $studioJbr
  $env:Path = "$studioJbr\bin;" + $env:Path
}
$sdkDirCandidates = @(
  (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
  "C:\Users\lee\AppData\Local\Android\Sdk",
  "C:\Android\Sdk"
)
$sdkDir = $sdkDirCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($sdkDir) {
  $env:ANDROID_HOME = $sdkDir
  $env:ANDROID_SDK_ROOT = $sdkDir
  $localProps = Join-Path $androidDir "local.properties"
  # Gradle properties: escape backslashes (and drive colon)
  $sdkProp = $sdkDir.Replace('\', '\\').Replace(':', '\:')
  "sdk.dir=$sdkProp" | Set-Content -LiteralPath $localProps -Encoding ascii
}

if (Test-Path -LiteralPath $gradlew) {
  Push-Location $androidDir
  try {
    & .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "gradlew assembleDebug 실패" }
    $apkBuilt = $true
  } finally {
    Pop-Location
  }
} else {
  Write-Host "  gradlew.bat 없음 — Android Studio에서 프로젝트를 한 번 열면 wrapper가 생성됩니다."
  Write-Host "  수동: Android Studio로 mobile/android 열기 → Build → Build APK(s)"
}

$copiedApk = $null
if ($apkBuilt -and (Test-Path -LiteralPath $debugApk)) {
    $copiedApk = Join-Path $outDir "exgame-$Version-android-debug.apk"
    Copy-Item -LiteralPath $debugApk -Destination $copiedApk -Force
} elseif (Test-Path -LiteralPath $debugApk) {
    $copiedApk = Join-Path $outDir "exgame-$Version-android-debug.apk"
    Copy-Item -LiteralPath $debugApk -Destination $copiedApk -Force
} elseif (Test-Path -LiteralPath $releaseApk) {
    $copiedApk = Join-Path $outDir "exgame-$Version-android-release-unsigned.apk"
    Copy-Item -LiteralPath $releaseApk -Destination $copiedApk -Force
}

Write-Host ""
Write-Host "배포 산출물:"
Write-Host "  PC ZIP : release\exgame-$Version.zip"
if ($copiedApk) {
    Write-Host "  APK   : $copiedApk"
} else {
    Write-Host "  APK   : (아직 없음 — docs/MOBILE.md 참고)"
}
Write-Host "상세: docs\RELEASE.md , docs\MOBILE.md"
