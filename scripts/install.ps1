param(
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'SiloLink\bin'),
    [string]$BinaryPath,
    [ValidateSet('all', 'codex', 'claude', 'antigravity')][string]$HostName = 'all',
    [switch]$NoPath,
    [switch]$SkipSkills
)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
if (-not $BinaryPath) {
    Push-Location $repository
    try {
        & (Join-Path $PSScriptRoot 'cargo.ps1') -CargoArguments @('build', '--release', '--locked', '--bin', 'silolink')
        if ($LASTEXITCODE -ne 0) { throw 'SiloLink release build failed.' }
    } finally { Pop-Location }
    $BinaryPath = Join-Path $repository 'target\release\silolink.exe'
}
$source = (Resolve-Path -LiteralPath $BinaryPath).Path
$destination = [IO.Path]::GetFullPath($InstallDirectory)
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$installed = Join-Path $destination 'silolink.exe'
if ($source -ne $installed) { Copy-Item -LiteralPath $source -Destination $installed -Force -ErrorAction Stop }
if (-not $NoPath) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($userPath -split ';' | Where-Object { $_ })
    [Environment]::SetEnvironmentVariable('Path', ((@($destination) + @($entries | Where-Object { $_ -ne $destination })) -join ';'), 'User')
    if (($env:PATH -split ';') -notcontains $destination) { $env:PATH = $destination + ';' + $env:PATH }
}
if (-not $SkipSkills) {
    & $installed setup --host $HostName
    exit $LASTEXITCODE
}
@{ status = 'success'; executable = $installed; skillsInstalled = $false } | ConvertTo-Json -Compress
exit 0
