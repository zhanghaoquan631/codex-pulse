param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'build'))
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework 4.8 compiler not found.' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$references = @('System.dll','System.Core.dll','System.Drawing.dll','System.Xml.dll','System.Windows.Forms.dll','System.Net.Http.dll','System.Security.dll','System.Web.dll','System.Web.Extensions.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll','Microsoft.VisualBasic.dll') | ForEach-Object { Join-Path $framework $_ }
$speech = Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL\System.Speech\v4.0_4.0.0.0__31bf3856ad364e35\System.Speech.dll'
$references += $speech
$references += Join-Path $framework 'WPF\UIAutomationClient.dll'
$references += Join-Path $framework 'WPF\UIAutomationTypes.dll'
$arguments = @('/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001',('/out:' + (Join-Path $output 'QDuoWindows.exe')))
$arguments += $references | ForEach-Object { '/r:' + $_ }
$arguments += Join-Path $PSScriptRoot 'Core.cs'
$arguments += Join-Path $PSScriptRoot 'Desktop.cs'
foreach ($sourceName in @('ServiceRoutes.cs','Safety.cs','FileCatalog.cs')) { $arguments += Join-Path $PSScriptRoot $sourceName }
& $compiler $arguments
if ($LASTEXITCODE -ne 0) { throw 'C# compilation failed.' }
# Hash the exact UTF-8 string the desktop reads (ReadAllText strips BOM).
$ocrText = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Ocr.ps1'), [Text.Encoding]::UTF8)
$sha = [Security.Cryptography.SHA256]::Create()
try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($ocrText))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
[IO.File]::WriteAllText((Join-Path $output 'Ocr.sha256'), $hash, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Ocr.ps1') -Destination $output -Force
$securityText = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Security.ps1'), [Text.Encoding]::UTF8)
$securitySha = [Security.Cryptography.SHA256]::Create()
try { $securityHash = [BitConverter]::ToString($securitySha.ComputeHash([Text.Encoding]::UTF8.GetBytes($securityText))).Replace('-','').ToLowerInvariant() } finally { $securitySha.Dispose() }
[IO.File]::WriteAllText((Join-Path $output 'Security.sha256'), $securityHash, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Security.ps1') -Destination $output -Force
foreach ($name in @('README.md','LICENSE','ATTRIBUTION.md')) { $source = Join-Path $PSScriptRoot $name; if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $output -Force } }
Write-Output ('Built ' + (Join-Path $output 'QDuoWindows.exe'))
