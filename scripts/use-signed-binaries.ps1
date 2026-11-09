param(
    [Parameter(Mandatory = $true)][string]$SignedDirectory,
    [string]$BuildDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'target\release'),
    [string]$ResourceDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'desktop\src-tauri\resources'),
    [string]$Signer = 'SignPath Foundation'
)
# Places the SignPath-signed app and CLI where `tauri bundle` and package-release.ps1 read them.
# Nothing is copied unless every file carries a valid signature from the expected signer.
$ErrorActionPreference = 'Stop'
# Windows PowerShell started from PowerShell 7 inherits PS7 module paths and cannot autoload its own
# security cmdlets, so load the module that belongs to the running shell explicitly.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security')
$signed = (Resolve-Path -LiteralPath $SignedDirectory).Path
$names = @('silolink-desktop.exe', 'silolink.exe')
foreach ($name in $names) {
    $path = Join-Path $signed $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "The signed artifact is missing $name." }
    $signature = Get-AuthenticodeSignature -LiteralPath $path
    if ($signature.Status -ne 'Valid') { throw "$name is not validly signed ($($signature.Status))." }
    # Compare the certificate's common name exactly; a substring of the subject could be spoofed.
    if ($Signer -and $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -ne $Signer) {
        throw "$name is signed by an unexpected certificate: $($signature.SignerCertificate.Subject)"
    }
}
# `tauri bundle` rewrites the app's bundle-type marker. Only an app already marked for NSIS (by the tested
# build) comes back byte for byte, so its signature survives; anything else would be silently unsigned.
$app = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes((Join-Path $signed 'silolink-desktop.exe')))
if (-not $app.Contains('__TAURI_BUNDLE_TYPE_VAR_NSS')) {
    throw 'silolink-desktop.exe was not bundled as NSIS before signing; bundling again would break its signature.'
}
$bundledDirectory = Join-Path $BuildDirectory 'bin'
foreach ($directory in @($BuildDirectory, $bundledDirectory, $ResourceDirectory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
Copy-Item -LiteralPath (Join-Path $signed 'silolink-desktop.exe') -Destination (Join-Path $BuildDirectory 'silolink-desktop.exe') -Force
$cli = Join-Path $signed 'silolink.exe'
foreach ($target in @((Join-Path $BuildDirectory 'silolink.exe'), (Join-Path $bundledDirectory 'silolink.exe'), (Join-Path $ResourceDirectory 'silolink.exe'))) {
    Copy-Item -LiteralPath $cli -Destination $target -Force
}
@{ status = 'success'; signed = $names } | ConvertTo-Json -Compress
