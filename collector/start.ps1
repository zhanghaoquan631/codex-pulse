$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'process-utils.ps1')
$dataPath = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$pausePath = Join-Path $dataPath 'paused'
if (Test-Path -LiteralPath $pausePath) { Remove-Item -LiteralPath $pausePath }
$supervisorScript = Join-Path $PSScriptRoot 'supervise.ps1'
$supervisorProcess = Get-PulseProcess (Join-Path $dataPath 'supervisor.pid') $supervisorScript 'powershell.exe'
if (-not $supervisorProcess) {
    $powerShellPath = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    Start-Process -FilePath $powerShellPath -ArgumentList ('-NoProfile -File "' + $supervisorScript + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'supervisor.log') -RedirectStandardError (Join-Path $dataPath 'supervisor-error.log') | Out-Null
}
for ($attempt = 0; $attempt -lt 8; $attempt++) {
    $guardian = Get-PulseProcess (Join-Path $dataPath 'supervisor.pid') $supervisorScript 'powershell.exe'
    try { $health = Invoke-RestMethod 'http://127.0.0.1:43871/health' -TimeoutSec 2; if ($guardian -and $health.app -eq 'codex-pulse') { Write-Output 'Codex Pulse is recording. Automatic recovery is enabled.'; exit 0 } } catch {}
    Start-Sleep -Seconds 1
}
throw 'Collector or supervisor did not respond. Check collector/data logs.'

