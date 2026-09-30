function Get-PulseProcess([string]$PidPath, [string]$ExpectedScript, [string]$ExpectedName) {
    if (-not (Test-Path -LiteralPath $PidPath)) { return $null }
    $pulseProcessId = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $PidPath -Raw).Trim(), [ref]$pulseProcessId)) { return $null }
    $pulseProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $pulseProcessId) -ErrorAction SilentlyContinue
    if ($pulseProcess -and $pulseProcess.Name -eq $ExpectedName -and $pulseProcess.CommandLine -and $pulseProcess.CommandLine.Contains($ExpectedScript)) { return $pulseProcess }
    return $null
}

function Set-PulseProxy {
    # Follow the user's existing proxy, including a proxy that starts after logon.
    if ($script:PulseInheritedProxy) { $env:HTTPS_PROXY = $script:PulseInheritedProxy; return }
    $env:HTTPS_PROXY = $null
    $proxySettings = Get-ItemProperty -LiteralPath 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Internet Settings' -ErrorAction SilentlyContinue
    if ($proxySettings.ProxyEnable -eq 1 -and $proxySettings.ProxyServer) {
        $proxyAddress = [string]$proxySettings.ProxyServer
        if ($proxyAddress.Contains('=')) {
            $proxyEntry = $proxyAddress.Split(';') | Where-Object { $_ -like 'https=*' } | Select-Object -First 1
            if (-not $proxyEntry) { $proxyEntry = $proxyAddress.Split(';') | Where-Object { $_ -like 'http=*' } | Select-Object -First 1 }
            $proxyAddress = if ($proxyEntry) { $proxyEntry.Substring($proxyEntry.IndexOf('=') + 1) } else { '' }
        }
        if ($proxyAddress) { $env:HTTPS_PROXY = if ($proxyAddress -match '^https?://') { $proxyAddress } else { 'http://' + $proxyAddress } }
    }
    if (-not $env:NO_PROXY) { $env:NO_PROXY = 'localhost,127.0.0.1,::1' }
}
