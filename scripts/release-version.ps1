param([string]$Tag)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$app = Get-Content -LiteralPath (Join-Path $repository 'desktop\src-tauri\tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$plugin = Get-Content -LiteralPath (Join-Path $repository 'integrations\plugins\silolink\plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$frontend = Get-Content -LiteralPath (Join-Path $repository 'desktop\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$versions = @([string]$app.version, [string]$plugin.version, [string]$frontend.version)
foreach ($manifest in @('Cargo.toml', 'desktop\src-tauri\Cargo.toml')) {
    $content = [IO.File]::ReadAllText((Join-Path $repository $manifest))
    $match = [regex]::Match($content, '(?m)^version\s*=\s*"([^"\r\n]+)"')
    if (-not $match.Success) { throw "Missing package version in $manifest" }
    $versions += $match.Groups[1].Value
}
$version = $versions[0]
if ($version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$') { throw 'Unsupported release version.' }
if (@($versions | Where-Object { $_ -ne $version }).Count -gt 0) { throw 'App, CLI, frontend, and plugin versions must match before release.' }
if ($Tag -and $Tag -cne "v$version") { throw "Tag must match the source version: v$version" }
Write-Output $version
