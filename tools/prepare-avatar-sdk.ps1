# PowerShell 7. Reproduce the SDK files from the pinned source tree.
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $workspaceRoot 'packages/avatar/vendor-manifest.json') -Raw | ConvertFrom-Json
$revision = $manifest.revision
$vendorRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'packages/avatar/vendor'))
$manifest.files | ForEach-Object -Parallel {
    $entry = $_
    $root = $using:vendorRoot
    $target = [IO.Path]::GetFullPath((Join-Path $root $entry.path))
    if (-not $target.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'SDK target escapes vendor root' }
    function Matches-Blob($file, $expected) {
        if (-not (Test-Path -LiteralPath $file)) { return $false }
        $bytes = [IO.File]::ReadAllBytes($file)
        $header = [Text.Encoding]::UTF8.GetBytes("blob $($bytes.Length)`0")
        $blob = [byte[]]::new($header.Length + $bytes.Length)
        [Array]::Copy($header, 0, $blob, 0, $header.Length)
        [Array]::Copy($bytes, 0, $blob, $header.Length, $bytes.Length)
        return ([Convert]::ToHexString([Security.Cryptography.SHA1]::HashData($blob)).ToLowerInvariant() -eq $expected)
    }
    if (-not (Matches-Blob $target $entry.gitBlob)) {
        [IO.Directory]::CreateDirectory((Split-Path $target -Parent)) | Out-Null
        $url = "https://raw.githubusercontent.com/suzuran0y/Cute-Partner/$using:revision/characters/default/web/$($entry.path)"
        Invoke-WebRequest -Uri $url -OutFile ($target + '.part') -TimeoutSec 45 -MaximumRetryCount 2
        if (-not (Matches-Blob ($target + '.part') $entry.gitBlob)) { throw "SDK blob mismatch: $($entry.path)" }
        Move-Item -LiteralPath ($target + '.part') -Destination $target -Force
    }
} -ThrottleLimit 4
Write-Output "Pinned SDK files verified: $($manifest.files.Count)"
