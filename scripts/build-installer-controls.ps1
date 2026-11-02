param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Visual Studio C++ Build Tools are required for native installer controls.' }
$visualStudio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $visualStudio) { throw 'Install the Visual Studio C++ x86/x64 toolset before bundling.' }
$vcvars = Join-Path $visualStudio 'VC\Auxiliary\Build\vcvarsall.bat'
$source = Join-Path $repository 'desktop\src-tauri\windows\cinematic-controls.cpp'
$exports = Join-Path $repository 'desktop\src-tauri\windows\cinematic-controls.def'
$response = Join-Path $output 'controls-compiler.rsp'
# NSIS and its System plugin are x86, even when the installed app is x64.
$arguments = @('/nologo', '/LD', '/MT', '/W4', '/WX', '/EHsc', '/std:c++17', '/utf-8', '/O2', '/DUNICODE', '/D_UNICODE', '/D_WIN32_WINNT=0x0A00',
    ('/Fo"' + (Join-Path $output 'cinematic-controls.obj') + '"'), ('"' + $source + '"'), '/link',
    ('/DEF:"' + $exports + '"'), ('/OUT:"' + (Join-Path $output 'cinematic-controls.dll') + '"'),
    ('/IMPLIB:"' + (Join-Path $output 'cinematic-controls.lib') + '"'), 'user32.lib', 'gdi32.lib', 'comctl32.lib', 'gdiplus.lib', 'uxtheme.lib')
[IO.File]::WriteAllText($response, [string]::Join(' ', $arguments), [Text.UTF8Encoding]::new($true))
$commandFile = Join-Path $output 'compile-controls.cmd'
[IO.File]::WriteAllLines($commandFile, @('@echo off', ('call "' + $vcvars + '" amd64_x86 >nul'),
    'if errorlevel 1 exit /b %errorlevel%', ('cl.exe @"' + $response + '"'), 'exit /b %errorlevel%'), [Text.Encoding]::Default)
& $env:ComSpec /d /c $commandFile
if ($LASTEXITCODE -ne 0) { throw 'Native installer control compilation failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $output 'cinematic-controls.dll'))) { throw 'Native installer controls DLL was not produced.' }
