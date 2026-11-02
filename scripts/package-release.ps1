param(
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$BuildDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'target\release'),
    [string]$Tag
)
$ErrorActionPreference = 'Stop'
$version = & (Join-Path $PSScriptRoot 'release-version.ps1') -Tag $Tag
$destination = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $destination) { throw 'Release output already exists; existing files are preserved.' }
$build = (Resolve-Path -LiteralPath $BuildDirectory).Path
$cli = Join-Path $build 'silolink.exe'
$bundledCli = Join-Path $build 'bin\silolink.exe'
$installers = @(Get-ChildItem -LiteralPath (Join-Path $build 'bundle\nsis') -Filter '*-setup.exe' -File)
if ($installers.Count -ne 1 -or -not (Test-Path -LiteralPath $cli -PathType Leaf) -or -not (Test-Path -LiteralPath $bundledCli -PathType Leaf)) {
    throw 'Build the app installer and bundled CLI before packaging a release.'
}
function Get-Sha256([string]$Path) {
    $hash = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hash.Dispose() }
}
if ((Get-Sha256 $cli) -ne (Get-Sha256 $bundledCli)) { throw 'The bundled CLI differs from the built CLI. Rebuild the desktop app.' }
New-Item -ItemType Directory -Path $destination | Out-Null
Copy-Item -LiteralPath $installers[0].FullName -Destination (Join-Path $destination "SiloLink-Setup-$version-windows-x64.exe")
& (Join-Path $PSScriptRoot 'package-plugin.ps1') -BinaryPath $cli -OutputDirectory (Join-Path $destination "SiloLink-Codex-Windows-$version") | Out-Null
$assets = @(Get-ChildItem -LiteralPath $destination -File | Where-Object { $_.Extension -in @('.exe', '.zip') } | Sort-Object Name)
if ($assets.Count -ne 2) { throw 'Expected an installer and a plugin ZIP.' }
$checksums = @($assets | ForEach-Object { (Get-Sha256 $_.FullName) + '  ' + $_.Name })
[IO.File]::WriteAllLines((Join-Path $destination 'SHA256SUMS.txt'), [string[]]$checksums, (New-Object System.Text.UTF8Encoding $false))
@{ status = 'success'; version = $version; assets = $assets.Name } | ConvertTo-Json -Compress
