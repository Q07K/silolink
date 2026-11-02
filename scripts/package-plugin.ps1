param(
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$BinaryPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'target\release\silolink.exe')
)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$binary = (Resolve-Path -LiteralPath $BinaryPath -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw 'Choose the built Windows x64 silolink.exe.' }
$destination = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $destination) { throw 'Output already exists. Choose a new output directory; existing files are preserved.' }
$archive = $destination + '.zip'
if (Test-Path -LiteralPath $archive) { throw 'Archive already exists. Choose a new output directory; existing files are preserved.' }

# Use an allowlist: never ship local histories, environment files, or toolchains.
$plugin = Join-Path $destination 'plugins\silolink'
$skillDirectory = Join-Path $plugin 'skills\silolink'
$catalogDirectory = Join-Path $destination '.agents\plugins'
foreach ($directory in @($skillDirectory, (Join-Path $plugin 'bin'), (Join-Path $plugin 'assets'), (Join-Path $plugin '.codex-plugin'), $catalogDirectory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
$utf8 = New-Object System.Text.UTF8Encoding $false
$manifestSource = Join-Path $repository 'integrations\plugins\silolink\plugin.json'
Copy-Item -LiteralPath $manifestSource -Destination (Join-Path $plugin 'plugin.json')
$manifest = Get-Content -LiteralPath $manifestSource -Raw -Encoding UTF8 | ConvertFrom-Json
$compatibility = [ordered]@{
    name = $manifest.name; version = $manifest.version; description = $manifest.description
    author = $manifest.author; skills = './skills/'; interface = $manifest.extensions.'com.openai'.interface
}
[IO.File]::WriteAllText((Join-Path $plugin '.codex-plugin\plugin.json'), ($compatibility | ConvertTo-Json -Depth 12), $utf8)
Copy-Item -LiteralPath $binary -Destination (Join-Path $plugin 'bin\silolink.exe')
$skillSources = Get-ChildItem -LiteralPath (Join-Path $repository 'integrations\skills') -Directory
foreach ($sourceSkill in $skillSources) {
    if ($sourceSkill.Name -notmatch '^silolink(-[a-z0-9-]+)?$') { throw 'Unexpected skill folder name.' }
    $entry = Join-Path $sourceSkill.FullName 'SKILL.md'
    if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'A bundled skill is missing SKILL.md.' }
    $targetSkill = Join-Path $plugin ('skills\' + $sourceSkill.Name)
    New-Item -ItemType Directory -Path $targetSkill -Force | Out-Null
    Copy-Item -LiteralPath $entry -Destination (Join-Path $targetSkill 'SKILL.md')
    $interface = Join-Path $sourceSkill.FullName 'agents\openai.yaml'
    if (Test-Path -LiteralPath $interface -PathType Leaf) {
        New-Item -ItemType Directory -Path (Join-Path $targetSkill 'agents') -Force | Out-Null
        Copy-Item -LiteralPath $interface -Destination (Join-Path $targetSkill 'agents\openai.yaml')
    }
}
Copy-Item -LiteralPath (Join-Path $repository 'assets\branding\silolink-v1\silolink-symbol-blue.png') -Destination (Join-Path $plugin 'assets\icon.png')
$catalog = [ordered]@{
    name = 'silolink-preview'
    interface = @{ displayName = 'SiloLink 체험' }
    plugins = @(@{
        name = 'silolink'; source = @{ source = 'local'; path = './plugins/silolink' }
        policy = @{ installation = 'AVAILABLE'; authentication = 'ON_INSTALL' }; category = 'Productivity'
    })
}
[IO.File]::WriteAllText((Join-Path $catalogDirectory 'marketplace.json'), ($catalog | ConvertTo-Json -Depth 12), $utf8)
$registration = Get-Content -LiteralPath (Join-Path $repository 'integrations\plugins\register-codex.cmd') -Raw -Encoding UTF8
[IO.File]::WriteAllText((Join-Path $destination 'Codex에 등록.cmd'), (($registration -replace '\r?\n', "`r`n")), $utf8)
Copy-Item -LiteralPath (Join-Path $repository 'integrations\plugins\start.html') -Destination (Join-Path $destination '시작 안내.html')
$hash = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead($binary)
try { $cliHash = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
finally { $stream.Dispose(); $hash.Dispose() }
$info = @{ version = $manifest.version; platform = 'windows-x64'; cliSha256 = $cliHash }
[IO.File]::WriteAllText((Join-Path $destination 'package-info.json'), ($info | ConvertTo-Json), $utf8)
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($destination, $archive)
@{ status = 'success'; directory = $destination; archive = $archive } | ConvertTo-Json -Compress
