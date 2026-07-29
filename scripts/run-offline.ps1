param(

    [int]$Port = 7460,

    [switch]$ForceRestart

)



$ErrorActionPreference = "Stop"



# 하위 호환: run-offline → auto-run (아틀라스 동기화 + 서버 + 브라우저)

$autoRun = Join-Path $PSScriptRoot "auto-run.ps1"

& $autoRun -Port $Port -ForceRestart:$ForceRestart


