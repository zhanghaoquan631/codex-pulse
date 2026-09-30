param([string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'LinganJianying'))
$ErrorActionPreference = 'Stop'
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (!$pythonCommand) { throw '需要 Python 3。请先安装 Python，然后重新运行此脚本。' }
$pythonPath = (& $pythonCommand.Source -c 'import sys; print(sys.executable)').Trim()
if (!(Test-Path -LiteralPath $pythonPath)) { throw 'Python 尚未完成安装。' }
$pythonwPath = Join-Path (Split-Path $pythonPath) 'pythonw.exe'
if (!(Test-Path -LiteralPath $pythonwPath)) { throw '缺少 pythonw.exe，请安装完整 Python 3。' }
$installPath = [IO.Path]::GetFullPath($InstallDirectory)
New-Item -ItemType Directory -Path $installPath -Force | Out-Null
$assistantPath = Join-Path $installPath 'assistant.py'
$sourcePath = Join-Path $PSScriptRoot 'assistant.py'
if ([IO.Path]::GetFullPath($sourcePath) -ne $assistantPath) { Copy-Item -LiteralPath $sourcePath -Destination $assistantPath -Force }
foreach ($folder in @('data', 'data\素材', 'data\成品')) { New-Item -ItemType Directory -Path (Join-Path $installPath $folder) -Force | Out-Null }
$schemeKey = 'HKCU:\Software\Classes\lingan-jianying'
New-Item -Path $schemeKey -Force | Out-Null
Set-Item -Path $schemeKey -Value 'URL:Lingan Jianying'
New-ItemProperty -Path $schemeKey -Name 'URL Protocol' -Value '' -Force | Out-Null
New-Item -Path "$schemeKey\shell\open\command" -Force | Out-Null
Set-Item -Path "$schemeKey\shell\open\command" -Value ('"' + $pythonwPath + '" "' + $assistantPath + '" --uri "%1"')
$startupKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-ItemProperty -Path $startupKey -Name 'LinganJianying' -Value ('"' + $pythonwPath + '" "' + $assistantPath + '" --watch') -PropertyType String -Force | Out-Null
Write-Output ('助手已安装。剪映导出文件夹：' + (Join-Path $installPath 'data\成品'))
Write-Output '请回到灵感库的剪映板块，点击连接此电脑。电脑运行时自动回传成品，网站关闭也可同步。'
