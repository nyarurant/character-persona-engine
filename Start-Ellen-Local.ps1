param(
    [switch]$TextOnly,
    [switch]$LowMemory,
    [switch]$KeepTts,
    [ValidateRange(1, 32)]
    [int]$Threads = 6,
    [ValidateRange(1, 1000000)]
    [int]$ModelStep = 1000
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$ttsRoot = 'C:\ペルソナ\local-tts'
$startedTtsHere = $false

if (-not $TextOnly) {
    try {
        $null = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/health' -TimeoutSec 2
    } catch {
        $startedTtsHere = $true
        & (Join-Path $ttsRoot 'Start-LocalTTS.ps1') -Threads $Threads -ModelStep $ModelStep
    }
}

$arguments = @('run', 'start:local', '--', '--config=./config.ellen.example.json')
if ($TextOnly) { $arguments += '--text-only' }
if ($LowMemory) { $arguments += '--low-memory' }

try {
    & npm.cmd @arguments
    if ($LASTEXITCODE -ne 0) { throw "Local conversation exited with code $LASTEXITCODE" }
} finally {
    if ($startedTtsHere -and -not $KeepTts) {
        & (Join-Path $ttsRoot 'Stop-LocalTTS.ps1') -ShutdownWSL
    }
}
