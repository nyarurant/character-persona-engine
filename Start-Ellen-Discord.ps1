param(
    [switch]$LowMemory,
    [switch]$KeepTts,
    [ValidateRange(1, 32)]
    [int]$Threads = 6,
    [ValidateRange(1, 1000000)]
    [int]$ModelStep = 1000
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$ttsRoot = Get-ChildItem -LiteralPath 'C:\' -Directory | ForEach-Object {
    $candidate = Join-Path $_.FullName 'local-tts'
    if (Test-Path -LiteralPath (Join-Path $candidate 'Start-LocalTTS.ps1')) { $candidate }
} | Select-Object -First 1
if (-not $ttsRoot) { throw 'Could not locate local-tts under C:\' }
$startedTtsHere = $false
$configPath = Join-Path $root 'config.ellen.discord.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$ttsBaseUrl = [string]$config.discord.voiceOutput.baseUrl
$directmlTts = $ttsBaseUrl -eq 'http://127.0.0.1:5001'

try {
    $null = Invoke-RestMethod -Uri "$ttsBaseUrl/health" -TimeoutSec 2
} catch {
    $startedTtsHere = $true
    if ($directmlTts) {
        & (Join-Path $ttsRoot 'Start-DirectMLTTS.ps1') -Threads $Threads -ModelStep $ModelStep
    } else {
        & (Join-Path $ttsRoot 'Start-LocalTTS.ps1') -Threads $Threads -ModelStep $ModelStep
    }
}

$arguments = @('run', 'start:discord', '--', '--config=./config.ellen.discord.json')
if ($LowMemory) { $arguments += '--low-memory' }

try {
    Push-Location $root
    try {
        & npm.cmd @arguments
        if ($LASTEXITCODE -ne 0) { throw "Discord bot exited with code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
} finally {
    if ($startedTtsHere -and -not $KeepTts) {
        if ($directmlTts) {
            & (Join-Path $ttsRoot 'Stop-DirectMLTTS.ps1')
        } else {
            & (Join-Path $ttsRoot 'Stop-LocalTTS.ps1') -ShutdownWSL
        }
    }
}
