param(
    [string]$CreatorPath = "C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CreatorPath)) {
    throw "Cocos Creator 3.8.8 실행 파일을 찾을 수 없습니다: $CreatorPath"
}

$projectPath = Split-Path -Parent $PSScriptRoot
$buildRoot = Join-Path $projectPath "build"
$outputPath = Join-Path $buildRoot "web-desktop"
$buildConfigPath = Join-Path $projectPath "build-config\web-desktop.json"
$buildOptions = "configPath=$buildConfigPath"

$creatorProcess = Start-Process `
    -FilePath $CreatorPath `
    -ArgumentList @("--project", "`"$projectPath`"", "--build", "`"$buildOptions`"") `
    -Wait `
    -PassThru `
    -NoNewWindow

if (-not (Test-Path -LiteralPath (Join-Path $outputPath "index.html"))) {
    throw "Cocos Creator Web 빌드가 실패했습니다. 종료 코드: $($creatorProcess.ExitCode)"
}

Write-Host "Web 빌드 완료: $outputPath"
