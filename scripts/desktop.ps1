param(
    [ValidateSet('dev', 'build')][string]$Mode = 'dev',
    [switch]$NoBundle,
    [string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$resolvedConfig = if ($ConfigPath) { (Resolve-Path -LiteralPath $ConfigPath).Path } else { $null }
$desktopDirectory = Join-Path $repository 'desktop'
$localToolchain = Join-Path $repository '.tools\rustup\toolchains\1.90.0-x86_64-pc-windows-msvc\bin'
$savedEnvironment = @{}
foreach ($name in @('RUSTC', 'RUSTDOC', 'CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN', 'PATH')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$desktopExitCode = 1
& (Join-Path $PSScriptRoot 'prepare-desktop.ps1') -Profile $(if ($Mode -eq 'build') { 'release' } else { 'debug' })
if ($LASTEXITCODE -ne 0) { throw 'Desktop CLI preparation failed.' }
Push-Location $desktopDirectory
try {
    if (Test-Path -LiteralPath (Join-Path $localToolchain 'cargo.exe')) {
        $env:RUSTC = Join-Path $localToolchain 'rustc.exe'
        $env:RUSTDOC = Join-Path $localToolchain 'rustdoc.exe'
        $env:CARGO_HOME = Join-Path $repository '.tools\cargo'
        $env:RUSTUP_HOME = Join-Path $repository '.tools\rustup'
        $env:RUSTUP_TOOLCHAIN = '1.90.0-x86_64-pc-windows-msvc'
        $env:PATH = $localToolchain + [IO.Path]::PathSeparator + $env:PATH
    }
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Desktop dependency installation failed.' }
    }
    $desktopArguments = @('run', 'tauri', '--', $Mode)
    if ($resolvedConfig) { $desktopArguments += @('--config', $resolvedConfig) }
    if ($Mode -eq 'build' -and $NoBundle) { $desktopArguments += '--no-bundle' }
    & npm.cmd @desktopArguments
    $desktopExitCode = $LASTEXITCODE
} finally {
    Pop-Location
    # PowerShell passes $null to .NET as '', which pwsh 7 keeps as an empty variable (e.g. RUSTC='').
    foreach ($name in $savedEnvironment.Keys) {
        if ($null -eq $savedEnvironment[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
        else { Set-Item -LiteralPath "Env:$name" -Value $savedEnvironment[$name] }
    }
}
exit $desktopExitCode
