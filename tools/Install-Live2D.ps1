param([string]$Destination, [switch]$NoShortcut, [switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
function Get-InstallHash([string]$File) {
    $installHasher = [Security.Cryptography.SHA256]::Create()
    $installStream = [IO.File]::OpenRead($File)
    try { return ([BitConverter]::ToString($installHasher.ComputeHash($installStream))).Replace('-', '').ToLowerInvariant() }
    finally { $installStream.Dispose(); $installHasher.Dispose() }
}
$installSource = [IO.Path]::GetFullPath($PSScriptRoot)
$installManifest = Get-Content -LiteralPath (Join-Path $installSource 'build-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($installManifest.kind -ne 'windows-preview' -or $installManifest.buildId -notmatch '^[a-zA-Z0-9-]+$') { throw 'Invalid release manifest' }
if (-not $Destination) { $Destination = Join-Path $env:LOCALAPPDATA ('Programs\Live2D-LLM-Chat\' + $installManifest.buildId) }
$installTarget = [IO.Path]::GetFullPath($Destination)
if (-not $VerifyOnly -and (Test-Path -LiteralPath $installTarget)) { throw 'Installation directory already exists; choose a new directory' }
foreach ($entry in $installManifest.files) {
    if ($entry.path -match '(^/|\\|:|(^|/)\.\.(/|$))' -or $entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid manifest path' }
    $installInput = [IO.Path]::GetFullPath((Join-Path $installSource $entry.path))
    $installOutput = [IO.Path]::GetFullPath((Join-Path $installTarget $entry.path))
    if (-not $installInput.StartsWith($installSource + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or -not $installOutput.StartsWith($installTarget + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escaped release directory' }
    $installInfo = Get-Item -LiteralPath $installInput
    if (($installInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $installInfo.Length -ne $entry.bytes -or (Get-InstallHash $installInput) -ne $entry.sha256) { throw 'Release checksum mismatch' }
}
if ($VerifyOnly) { Write-Output 'Release checksums verified'; return }
New-Item -ItemType Directory -Path $installTarget | Out-Null
foreach ($entry in $installManifest.files) {
    $installOutput = [IO.Path]::GetFullPath((Join-Path $installTarget $entry.path))
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($installOutput)) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $installSource $entry.path) -Destination $installOutput
    if ((Get-InstallHash $installOutput) -ne $entry.sha256) { throw 'Installed checksum mismatch' }
}
Copy-Item -LiteralPath (Join-Path $installSource 'build-manifest.json') -Destination (Join-Path $installTarget 'build-manifest.json')
& icacls.exe $installTarget /grant '*S-1-15-2-1:(OI)(CI)(RX)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant Electron sandbox read access' }
if (-not $NoShortcut) {
    $installShell = New-Object -ComObject WScript.Shell
    $installLink = $installShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Live2D-LLM-Chat.lnk'))
    $installLink.TargetPath = Join-Path $installTarget 'Live2D-LLM-Chat.exe'
    $installLink.WorkingDirectory = $installTarget
    $installLink.Save()
}
Write-Output ('Installed: ' + (Join-Path $installTarget 'Live2D-LLM-Chat.exe'))
