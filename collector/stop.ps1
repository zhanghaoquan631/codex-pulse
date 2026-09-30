$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'process-utils.ps1')
$dataPath = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
Set-Content -LiteralPath (Join-Path $dataPath 'paused') -Value 'Stopped by user. Start or next Windows login will resume.' -Encoding ascii
$supervisorProcess = Get-PulseProcess (Join-Path $dataPath 'supervisor.pid') (Join-Path $PSScriptRoot 'supervise.ps1') 'powershell.exe'
if ($supervisorProcess) { Stop-Process -Id $supervisorProcess.ProcessId -ErrorAction SilentlyContinue }
$serviceProcess = Get-PulseProcess (Join-Path $dataPath 'service.pid') (Join-Path $PSScriptRoot 'service.mjs') 'node.exe'
if ($serviceProcess) { Stop-Process -Id $serviceProcess.ProcessId -ErrorAction SilentlyContinue }
Write-Output 'Codex Pulse stopped. Start it manually or at the next Windows login.'

