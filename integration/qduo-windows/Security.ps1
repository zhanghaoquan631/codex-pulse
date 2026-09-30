param([Parameter(Mandatory=$true)][ValidateSet('status','quick','full','remediate','refresh')][string]$Action)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function Iso($value) { if ($null -eq $value) { return $null }; try { return ([datetime]$value).ToUniversalTime().ToString('o') } catch { return $null } }
function Snapshot {
    $errors = [Collections.Generic.List[string]]::new()
    $available = $false
    $status = $null
    $threats = @()
    $detections = @()
    try {
        Import-Module Defender -ErrorAction Stop
        $computer = Get-MpComputerStatus -ErrorAction Stop
        $available = $true
        $status = [ordered]@{
            antivirusEnabled = [bool]$computer.AntivirusEnabled
            realTimeProtectionEnabled = [bool]$computer.RealTimeProtectionEnabled
            signatureVersion = [string]$computer.AntivirusSignatureVersion
            signatureUpdatedAt = Iso $computer.AntivirusSignatureLastUpdated
            quickScanStartedAt = Iso $computer.QuickScanStartTime
            quickScanEndedAt = Iso $computer.QuickScanEndTime
            fullScanStartedAt = Iso $computer.FullScanStartTime
            fullScanEndedAt = Iso $computer.FullScanEndTime
            runningMode = [string]$computer.AMRunningMode
            rebootRequired = [bool]$computer.RebootRequired
        }
    } catch { $errors.Add($_.Exception.Message) }
    if ($available) {
        try {
            $threats = @(Get-MpThreat -ErrorAction Stop | Select-Object -First 500 | ForEach-Object {
                [ordered]@{ id = [string]$_.ThreatID; name = [string]$_.ThreatName; severityId = [int]$_.SeverityID; isActive = [bool]$_.IsActive; resources = @($_.Resources | ForEach-Object { [string]$_ }) }
            })
        } catch { $errors.Add('Threat query: ' + $_.Exception.Message) }
        try {
            $detections = @(Get-MpThreatDetection -ErrorAction Stop | Sort-Object InitialDetectionTime -Descending | Select-Object -First 500 | ForEach-Object {
                [ordered]@{ id = [string]$_.DetectionID; threatId = [string]$_.ThreatID; initialDetectionAt = Iso $_.InitialDetectionTime; lastStatusChangeAt = Iso $_.LastThreatStatusChangeTime; actionSuccess = [bool]$_.ActionSuccess; resources = @($_.Resources | ForEach-Object { [string]$_ }); remediationAt = Iso $_.RemediationTime }
            })
        } catch { $errors.Add('Detection query: ' + $_.Exception.Message) }
    }
    [ordered]@{ schemaVersion = 1; checkedAt = [datetime]::UtcNow.ToString('o'); available = $available; status = $status; threats = $threats; detections = $detections; errors = @($errors.ToArray()) }
}
try {
    # Fixed enum only. Never modify exclusions, disable protection, or accept paths/commands.
    switch ($Action) {
        'quick' { Import-Module Defender; Start-MpScan -ScanType QuickScan -ErrorAction Stop }
        'full' { Import-Module Defender; Start-MpScan -ScanType FullScan -ErrorAction Stop }
        'remediate' {
            Import-Module Defender
            $active = @(Get-MpThreat -ErrorAction Stop | Where-Object { $_.IsActive })
            if ($active.Count -gt 0) { Remove-MpThreat -ErrorAction Stop }
        }
        'refresh' { Import-Module Defender; Update-MpSignature -ErrorAction Stop }
    }
    Snapshot | ConvertTo-Json -Depth 8 -Compress
    exit 0
} catch {
    $failure = $_.Exception.Message
    $snapshot = Snapshot
    $snapshot.errors = @($snapshot.errors) + @('Requested action failed: ' + $failure)
    $snapshot | ConvertTo-Json -Depth 8 -Compress
    exit 1
}
