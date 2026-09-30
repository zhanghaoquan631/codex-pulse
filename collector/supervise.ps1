$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'process-utils.ps1')
$dataPath = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$script:PulseInheritedProxy = $env:HTTPS_PROXY
$pathHash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($PSScriptRoot.ToLowerInvariant()))).Replace('-', '').Substring(0, 20)
$guardianMutex = New-Object System.Threading.Mutex($false, ('Local\CodexPulse-' + $pathHash))
$ownsMutex = $false
try {
    try { $ownsMutex = $guardianMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { exit 0 }
    Set-Content -LiteralPath (Join-Path $dataPath 'supervisor.pid') -Value $PID -Encoding ascii
    $serviceScript = Join-Path $PSScriptRoot 'service.mjs'
    $misses = 0
    $previousProxy = $null
    while (-not (Test-Path -LiteralPath (Join-Path $dataPath 'paused'))) {
        try {
            Set-PulseProxy
            $proxyChanged = $null -ne $previousProxy -and $previousProxy -ne [string]$env:HTTPS_PROXY
            $previousProxy = [string]$env:HTTPS_PROXY
            $child = Get-PulseProcess (Join-Path $dataPath 'service.pid') $serviceScript 'node.exe'
            $health = $null
            try { $health = Invoke-RestMethod 'http://127.0.0.1:43871/health' -TimeoutSec 3 } catch {}
            if ($health -and $health.app -eq 'codex-pulse' -and $child -and $health.pid -eq $child.ProcessId -and -not $proxyChanged) {
                $misses = 0
            } else {
                $misses++
                if ($child -and ($misses -ge 3 -or $proxyChanged)) {
                    Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
                    $child = $null
                }
                if (-not $child -and (-not $health -or $health.app -eq 'codex-pulse')) {
                    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
                    foreach ($logName in @('service.log', 'service-error.log')) {
                        $logPath = Join-Path $dataPath $logName
                        if (Test-Path -LiteralPath $logPath) { Move-Item -LiteralPath $logPath -Destination ($logPath + '.previous') -Force }
                    }
                    $launched = Start-Process -FilePath $nodePath -ArgumentList ('--use-env-proxy "' + $serviceScript + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'service.log') -RedirectStandardError (Join-Path $dataPath 'service-error.log') -PassThru
                    Set-Content -LiteralPath (Join-Path $dataPath 'service.pid') -Value $launched.Id -Encoding ascii
                    $misses = 0
                }
            }
        } catch {
            # Keep startup resilient to late network availability and temporary locks.
            $guardianLog = Join-Path $dataPath 'supervisor-status.log'
            if ((Test-Path -LiteralPath $guardianLog) -and (Get-Item -LiteralPath $guardianLog).Length -gt 262144) { Move-Item -LiteralPath $guardianLog -Destination ($guardianLog + '.previous') -Force }
            Add-Content -LiteralPath $guardianLog -Value ((Get-Date -Format o) + ' Collector restart will be retried.') -Encoding utf8
        }
        Start-Sleep -Seconds 15
    }
} finally {
    if ($ownsMutex) { $guardianMutex.ReleaseMutex() }
    $guardianMutex.Dispose()
}
