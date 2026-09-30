[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$siteUrl = 'http://127.0.0.1:5174/x-local-capture-v4/watch.html'
$bridgeUrl = 'http://127.0.0.1:4319/v1/x/local-capture/health'
$pnpmCommand = (Get-Command pnpm.cmd -ErrorAction Stop).Source

function Test-LocalHttp([string]$Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Start-LocalService([string[]]$Arguments) {
  Start-Process -FilePath $pnpmCommand `
    -ArgumentList $Arguments `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden | Out-Null
}

if (-not (Test-LocalHttp $bridgeUrl)) {
  Start-LocalService @('--filter', '@me-zip/social-connectors', 'dev:local-capture')
}

if (-not (Test-LocalHttp 'http://127.0.0.1:5174/')) {
  Start-LocalService @('--dir', 'apps/web', 'exec', 'vite', '--host', '127.0.0.1', '--port', '5174')
}

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  if ((Test-LocalHttp $bridgeUrl) -and (Test-LocalHttp 'http://127.0.0.1:5174/')) {
    Start-Process $siteUrl
    exit 0
  }
  Start-Sleep -Milliseconds 750
}

throw 'ME.zip local services did not start within 30 seconds. Run the launcher again from the project folder.'
