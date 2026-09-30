[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$cachedPnpm = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
$pnpmCommand = if (Test-Path -LiteralPath $cachedPnpm) { $cachedPnpm } else { $null }

if ([string]::IsNullOrWhiteSpace($pnpmCommand)) {
  $resolvedPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($null -ne $resolvedPnpm) {
    $pnpmCommand = $resolvedPnpm.Source
  }
}

if ([string]::IsNullOrWhiteSpace($pnpmCommand)) {
  throw 'pnpm.cmd is unavailable; ME.zip local website cannot be started.'
}
$viteArguments = @('--dir', 'apps/web', 'exec', 'vite', '--host', '127.0.0.1', '--port', '5174')
$githubBridgeArguments = @('--filter', '@me-zip/github-workspace', 'dev:server')
$captureBridgeArguments = @('--filter', '@me-zip/social-connectors', 'dev:local-capture')
$captureBridgeDirectory = Join-Path $repoRoot 'services\social-connectors'
$captureBridgeEntry = Join-Path $captureBridgeDirectory 'dist\local-capture-server.js'
$githubBridgeDirectory = Join-Path $repoRoot 'services\github-workspace'
$githubBridgeEntry = Join-Path $githubBridgeDirectory 'dist\local-dev-server.js'
$financeBridgeEntry = Join-Path $repoRoot 'services\finance-mobile-bridge\src\finance-mobile-bridge.mjs'
$lifeBridgeEntry = Join-Path $repoRoot 'services\life-mobile-bridge\src\life-mobile-bridge.mjs'
$identityBridgeEntry = Join-Path $repoRoot 'services\identity-browser-security\src\identity-security-server.mjs'
$cachedNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeCommand = if (Test-Path -LiteralPath $cachedNode) { $cachedNode } else { (Get-Command node.exe -ErrorAction Stop).Source }

function Get-LocalListener([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Start-LocalService([string[]]$Arguments) {
  $argumentLine = $Arguments -join ' '
  $commandLine = '""{0}" {1}"' -f $pnpmCommand, $argumentLine
  Start-Process -FilePath "$env:SystemRoot\System32\cmd.exe" `
    -ArgumentList @('/d', '/c', $commandLine) `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden | Out-Null
}

function Start-LocalGitHubBridge {
  if (Test-Path -LiteralPath $githubBridgeEntry) {
    # The production-like bridge is already built. Starting Node directly keeps
    # the existing encrypted authorization available even in a Windows task
    # environment where pnpm may not inherit the interactive shell PATH.
    Start-Process -FilePath $nodeCommand `
      -ArgumentList @($githubBridgeEntry) `
      -WorkingDirectory $githubBridgeDirectory `
      -WindowStyle Hidden | Out-Null
    return
  }

  Start-LocalService $githubBridgeArguments
}

function Start-LocalCaptureBridge {
  if (Test-Path -LiteralPath $captureBridgeEntry) {
    # Use the already-built entrypoint so the logon task does not depend on
    # pnpm/cmd quoting or an interactive shell. The service itself owns port
    # 4319 and remains headless.
    Start-Process -FilePath $nodeCommand `
      -ArgumentList @('--experimental-transform-types', $captureBridgeEntry) `
      -WorkingDirectory $captureBridgeDirectory `
      -WindowStyle Hidden | Out-Null
    return
  }

  Start-LocalService $captureBridgeArguments
}

function Start-LocalNodeService([string]$Entry, [string]$WorkingDirectory, [hashtable]$Environment = @{}) {
  if (-not (Test-Path -LiteralPath $Entry)) { return }
  $originalEnvironment = @{}
  foreach ($key in $Environment.Keys) {
    $originalEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], 'Process')
  }
  try {
    Start-Process -FilePath $nodeCommand `
      -ArgumentList @($Entry) `
      -WorkingDirectory $WorkingDirectory `
      -WindowStyle Hidden | Out-Null
  } finally {
    foreach ($key in $Environment.Keys) {
      [Environment]::SetEnvironmentVariable($key, $originalEnvironment[$key], 'Process')
    }
  }
}

# Keep both the local-only website and the encrypted GitHub connection bridge
# available after Windows sign-in. The bridge reuses the already-authorized,
# encrypted local connection; it never stores a browser password or changes
# the GitHub App permissions.
while ($true) {
  if ($null -eq (Get-LocalListener 5174)) {
    Start-LocalService $viteArguments
    Start-Sleep -Seconds 3
  }

  if ($null -eq (Get-LocalListener 4317)) {
    Start-LocalGitHubBridge
    Start-Sleep -Seconds 3
  }

  # Keep the feature-area bridges available without opening any page. The
  # login launcher below is the only thing that opens a browser window.
  if ($null -eq (Get-LocalListener 4319)) {
    Start-LocalCaptureBridge
    Start-Sleep -Seconds 3
  }

  if ($null -eq (Get-LocalListener 4325)) {
    Start-LocalNodeService $financeBridgeEntry $repoRoot @{
      MEZIP_FINANCE_MOBILE_HOST = '0.0.0.0'
      MEZIP_FINANCE_MOBILE_PORT = '4325'
    }
    Start-Sleep -Seconds 1
  }

  # Life Studio uses an independent local data store. It never replaces the
  # finance inbox, login page, or any existing feature-area bridge.
  if ($null -eq (Get-LocalListener 4327)) {
    Start-LocalNodeService $lifeBridgeEntry $repoRoot @{
      MEZIP_LIFE_MOBILE_HOST = '0.0.0.0'
      MEZIP_LIFE_MOBILE_PORT = '4327'
    }
    Start-Sleep -Seconds 1
  }

  if ($null -eq (Get-LocalListener 4326)) {
    Start-LocalNodeService $identityBridgeEntry $repoRoot
    Start-Sleep -Seconds 1
  }

  Start-Sleep -Seconds 7
}
