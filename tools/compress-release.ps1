param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $Output) { throw 'Output already exists' }
[IO.Compression.ZipFile]::CreateFromDirectory($Source, $Output, [IO.Compression.CompressionLevel]::Optimal, $false)
