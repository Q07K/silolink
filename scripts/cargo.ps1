param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CargoArguments)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$localToolchain = Join-Path $repository '.tools\rustup\toolchains\1.90.0-x86_64-pc-windows-msvc\bin'
$savedEnvironment = @{}
foreach ($name in @('RUSTC', 'RUSTDOC', 'CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN', 'PATH')) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$cargoExitCode = 1
try {
  if (Test-Path -LiteralPath (Join-Path $localToolchain 'cargo.exe')) {
    $env:RUSTC = Join-Path $localToolchain 'rustc.exe'
    $env:RUSTDOC = Join-Path $localToolchain 'rustdoc.exe'
    $env:CARGO_HOME = Join-Path $repository '.tools\cargo'
    $env:RUSTUP_HOME = Join-Path $repository '.tools\rustup'
    $env:RUSTUP_TOOLCHAIN = '1.90.0-x86_64-pc-windows-msvc'
    $env:PATH = $localToolchain + [IO.Path]::PathSeparator + $env:PATH
    & (Join-Path $localToolchain 'cargo.exe') @CargoArguments
  } else {
    & cargo @CargoArguments
  }
  $cargoExitCode = $LASTEXITCODE
} finally {
    foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}
exit $cargoExitCode
