[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$server = Join-Path $repoRoot 'services\finance-mobile-bridge\src\finance-mobile-bridge.mjs'

if (-not (Test-Path -LiteralPath $server)) { throw 'Finance mobile inbox service is missing.' }

$listener = Get-NetTCPConnection -State Listen -LocalPort 4325 -ErrorAction SilentlyContinue
if ($null -eq $listener) {
  $env:MEZIP_FINANCE_MOBILE_HOST = '0.0.0.0'
  $env:MEZIP_FINANCE_MOBILE_PORT = '4325'
  Start-Process -FilePath (Get-Command node.exe -ErrorAction Stop).Source -ArgumentList @($server) -WorkingDirectory $repoRoot -WindowStyle Hidden | Out-Null
}

$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
  try {
    $health = Invoke-WebRequest -Uri 'http://127.0.0.1:4325/v1/finance/mobile/health' -UseBasicParsing -TimeoutSec 2
    if ($health.StatusCode -eq 200) {
      Start-Process 'http://127.0.0.1:5174/finance-receipt-inbox-v1/index.html'
      exit 0
    }
  } catch { }
  Start-Sleep -Milliseconds 500
}

throw 'Finance Mobile Inbox did not start. Check whether Windows Firewall allows this private-network service.'
