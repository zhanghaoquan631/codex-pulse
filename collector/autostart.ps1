param([switch]$Disable)
$ErrorActionPreference = 'Stop'
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'Codex Pulse.lnk'
if ($Disable) {
  if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
  Write-Output 'Codex Pulse automatic startup disabled.'
} else {
  $shortcutShell = New-Object -ComObject WScript.Shell
  $shortcut = $shortcutShell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
  $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'start.ps1') + '"'
  $shortcut.WorkingDirectory = $PSScriptRoot
  $shortcut.Description = 'Start Codex usage collection and automatic recovery at Windows login.'
  $shortcut.WindowStyle = 7
  $shortcut.Save()
  Write-Output 'Codex Pulse will start when you sign in to Windows.'
}
