param([ValidateSet('debug', 'release')][string]$Profile = 'debug')
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$arguments = @('build', '--locked', '--bin', 'silolink')
if ($Profile -eq 'release') { $arguments += '--release' }
Push-Location $repository
try {
    & (Join-Path $PSScriptRoot 'cargo.ps1') -CargoArguments $arguments
    if ($LASTEXITCODE -ne 0) { throw 'Bundled SiloLink CLI build failed.' }
    $targetDirectory = Join-Path $repository 'target'
    if ($env:CARGO_TARGET_DIR) {
        $targetDirectory = if ([IO.Path]::IsPathRooted($env:CARGO_TARGET_DIR)) { $env:CARGO_TARGET_DIR } else { Join-Path $repository $env:CARGO_TARGET_DIR }
    }
    $resourceDirectory = Join-Path $repository 'desktop\src-tauri\resources'
    New-Item -ItemType Directory -Path $resourceDirectory -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $targetDirectory "$Profile\silolink.exe") -Destination (Join-Path $resourceDirectory 'silolink.exe') -Force
} finally { Pop-Location }
