param(
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$BuildDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'target\release'),
    [string]$Tag,
    # Release builds signed through SignPath must not ship an unsigned file by mistake.
    [switch]$RequireSignature,
    [string]$Signer = 'SignPath Foundation'
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
function Assert-Signed([string]$Path, [string]$Label) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid') { throw "$Label is not validly signed ($($signature.Status))." }
    # Compare the certificate's common name exactly; a substring of the subject could be spoofed.
    if ($Signer -and $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -ne $Signer) {
        throw "$Label is signed by an unexpected certificate: $($signature.SignerCertificate.Subject)"
    }
}
if ($RequireSignature) {
    # Windows PowerShell started from PowerShell 7 inherits PS7 module paths and cannot autoload its own
    # security cmdlets, so load the module that belongs to the running shell explicitly.
    Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security')
    Assert-Signed $cli 'The CLI'
    Assert-Signed $installers[0].FullName 'The installer'
    # The installer embeds its own copies of the app and CLI; check those, not just the build folder.
    # Prefer the installed 7-Zip over whatever 7z.exe happens to be first on PATH.
    $sevenZip = @((Join-Path $env:ProgramFiles '7-Zip\7z.exe'), (Get-Command 7z.exe -ErrorAction SilentlyContinue).Source) |
        Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
    if (-not $sevenZip) { throw '7-Zip is required to check the executables inside the installer.' }
    $payload = Join-Path ([IO.Path]::GetTempPath()) ('silolink-payload-' + [guid]::NewGuid())
    try {
        & $sevenZip x $installers[0].FullName "-o$payload" -y 'silolink-desktop.exe' 'bin\silolink.exe' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not read the executables inside the installer.' }
        foreach ($relative in @('silolink-desktop.exe', 'bin\silolink.exe')) {
            $embedded = Join-Path $payload $relative
            if (-not (Test-Path -LiteralPath $embedded -PathType Leaf)) { throw "The installer does not contain $relative." }
            Assert-Signed $embedded "The installed $relative"
        }
    } finally { Remove-Item -LiteralPath $payload -Recurse -Force -ErrorAction SilentlyContinue }
}
New-Item -ItemType Directory -Path $destination | Out-Null
Copy-Item -LiteralPath $installers[0].FullName -Destination (Join-Path $destination "SiloLink-Setup-$version-windows-x64.exe")
& (Join-Path $PSScriptRoot 'package-plugin.ps1') -BinaryPath $cli -OutputDirectory (Join-Path $destination "SiloLink-Codex-Windows-$version") | Out-Null
$assets = @(Get-ChildItem -LiteralPath $destination -File | Where-Object { $_.Extension -in @('.exe', '.zip') } | Sort-Object Name)
if ($assets.Count -ne 2) { throw 'Expected an installer and a plugin ZIP.' }
$checksums = @($assets | ForEach-Object { (Get-Sha256 $_.FullName) + '  ' + $_.Name })
[IO.File]::WriteAllLines((Join-Path $destination 'SHA256SUMS.txt'), [string[]]$checksums, (New-Object System.Text.UTF8Encoding $false))
@{ status = 'success'; version = $version; assets = $assets.Name } | ConvertTo-Json -Compress
