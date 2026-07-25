param(
    [switch]$SkipSync
)

$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectPath "mobile\android"
$studioJbr = "I:\Program Files\Android\Android Studio\jbr"
$sdk = "C:\Users\lee\AppData\Local\Android\Sdk"
$tools = Join-Path (Split-Path -Parent $projectPath) "tools"
if (-not (Test-Path $tools)) {
    $tools = Join-Path $projectPath "tools"
}
$gradleVer = "8.11.1"
$gradleHome = Join-Path $tools "gradle-$gradleVer"
$gradleZip = Join-Path $tools "gradle-$gradleVer-bin.zip"
$packageJson = Get-Content -LiteralPath (Join-Path $projectPath "package.json") -Raw | ConvertFrom-Json
$version = [string]$packageJson.version

if (-not (Test-Path "$studioJbr\bin\java.exe")) {
    throw "Android Studio JBR를 찾을 수 없습니다: $studioJbr"
}
if (-not (Test-Path $sdk)) {
    throw "Android SDK를 찾을 수 없습니다: $sdk"
}

$env:JAVA_HOME = $studioJbr
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$sdkDirProp = $sdk.Replace('\', '/')
Set-Content -LiteralPath (Join-Path $androidDir "local.properties") -Value "sdk.dir=$sdkDirProp" -Encoding ASCII

if (-not $SkipSync) {
    Write-Host "[1/4] 웹 빌드 → assets/www 동기화"
    & (Join-Path $PSScriptRoot "sync-android-www.ps1")
} else {
    Write-Host "[1/4] sync 생략"
}

New-Item -ItemType Directory -Path $tools -Force | Out-Null
if (-not (Test-Path "$gradleHome\bin\gradle.bat")) {
    Write-Host "[2/4] Gradle $gradleVer 준비 ($tools)"
    if (-not (Test-Path $gradleZip)) {
        Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-$gradleVer-bin.zip" -OutFile $gradleZip
    }
    if (Test-Path $gradleHome) {
        Remove-Item -LiteralPath $gradleHome -Recurse -Force
    }
    tar -xf $gradleZip -C $tools
    if (-not (Test-Path "$gradleHome\bin\gradle.bat")) {
        throw "Gradle 압축 해제 실패: $gradleHome"
    }
} else {
    Write-Host "[2/4] Gradle 이미 있음"
}

Set-Location $androidDir
if (-not (Test-Path ".\gradlew.bat") -or -not (Test-Path ".\gradle\wrapper\gradle-wrapper.jar")) {
    Write-Host "[3/4] Gradle Wrapper 생성"
    & "$gradleHome\bin\gradle.bat" wrapper --gradle-version $gradleVer
    if ($LASTEXITCODE -ne 0) { throw "gradle wrapper 실패" }
} else {
    Write-Host "[3/4] Wrapper 이미 있음"
}

Write-Host "[4/4] assembleDebug"
& .\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { throw "assembleDebug 실패" }

$debugApk = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path -LiteralPath $debugApk)) {
    throw "APK를 찾지 못했습니다: $debugApk"
}

$outDir = Join-Path $projectPath "release"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$dest = Join-Path $outDir "exgame-$version-android-debug.apk"
Copy-Item -LiteralPath $debugApk -Destination $dest -Force

Write-Host ""
Write-Host "APK 빌드 완료:"
Write-Host "  $dest"
Write-Host "  Size: $((Get-Item $dest).Length) bytes"
Write-Host "폰에 설치: adb install -r `"$dest`""
