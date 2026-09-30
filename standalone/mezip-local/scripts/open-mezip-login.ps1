[CmdletBinding()]
param(
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$loginUrl = 'http://127.0.0.1:5174/?login=1&returnTo=%2Fpost-login-app%2Findex.html%3FfromLogin%3D1'
$supervisor = Join-Path $PSScriptRoot 'start-local-web-supervisor.ps1'

function Test-LocalHttp([string]$Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (-not (Test-LocalHttp 'http://127.0.0.1:5174/')) {
  $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
  Start-Process -FilePath $powershell -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $supervisor) -WorkingDirectory $repoRoot -WindowStyle Hidden | Out-Null
}

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  if (Test-LocalHttp $loginUrl) {
    if (-not $NoOpen) { Start-Process $loginUrl }
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

throw 'ME.zip local website did not become available at 127.0.0.1:5174.'
