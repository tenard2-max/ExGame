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
    throw "Android Studio JBR not found: $studioJbr"
}
if (-not (Test-Path $sdk)) {
    throw "Android SDK not found: $sdk"
}

$env:JAVA_HOME = $studioJbr
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$sdkDirProp = $sdk.Replace('\', '/')
Set-Content -LiteralPath (Join-Path $androidDir "local.properties") -Value "sdk.dir=$sdkDirProp" -Encoding ASCII

if (-not $SkipSync) {
    Write-Host "[1/4] Sync web build to assets/www"
    & (Join-Path $PSScriptRoot "sync-android-www.ps1")
} else {
    Write-Host "[1/4] Skip sync"
}

New-Item -ItemType Directory -Path $tools -Force | Out-Null
if (-not (Test-Path "$gradleHome\bin\gradle.bat")) {
    Write-Host "[2/4] Prepare Gradle $gradleVer ($tools)"
    if (-not (Test-Path $gradleZip)) {
        Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-$gradleVer-bin.zip" -OutFile $gradleZip
    }
    if (Test-Path $gradleHome) {
        Remove-Item -LiteralPath $gradleHome -Recurse -Force
    }
    tar -xf $gradleZip -C $tools
    if (-not (Test-Path "$gradleHome\bin\gradle.bat")) {
        throw "Gradle extract failed: $gradleHome"
    }
} else {
    Write-Host "[2/4] Gradle already present"
}

Set-Location $androidDir
if (-not (Test-Path ".\gradlew.bat") -or -not (Test-Path ".\gradle\wrapper\gradle-wrapper.jar")) {
    Write-Host "[3/4] Create Gradle Wrapper"
    & "$gradleHome\bin\gradle.bat" wrapper --gradle-version $gradleVer
    if ($LASTEXITCODE -ne 0) { throw "gradle wrapper failed" }
} else {
    Write-Host "[3/4] Wrapper already present"
}

Write-Host "[4/4] assembleDebug"
& .\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { throw "assembleDebug failed" }

$debugApk = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path -LiteralPath $debugApk)) {
    throw "APK not found: $debugApk"
}

$outDir = Join-Path $projectPath "release"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$dest = Join-Path $outDir "exgame-$version-android-debug.apk"
Copy-Item -LiteralPath $debugApk -Destination $dest -Force

Write-Host ""
Write-Host "APK build done:"
Write-Host "  $dest"
Write-Host "  Size: $((Get-Item $dest).Length) bytes"
Write-Host ('Install: adb install -r "' + $dest + '"')
