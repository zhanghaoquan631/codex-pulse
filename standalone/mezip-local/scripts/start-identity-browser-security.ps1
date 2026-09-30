$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$server = Join-Path $repoRoot 'services\identity-browser-security\src\identity-security-server.mjs'
if (-not (Test-Path -LiteralPath $server)) { throw "Identity Security Center server was not found: $server" }
Set-Location $repoRoot
node $server
