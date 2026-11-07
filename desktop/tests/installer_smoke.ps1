param(
    [string]$ScriptPath = (Join-Path $PSScriptRoot '..\..\target\release\nsis\x64\installer.nsi'),
    [string]$MakeNsis = (Join-Path $env:LOCALAPPDATA 'tauri\NSIS\makensis.exe'),
    [switch]$FirstScreenOnly,
    [string]$PreviewExecutable
)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$sourcePath = (Resolve-Path -LiteralPath $ScriptPath).Path
$testRoot = Join-Path $repository ('.tools\installer-smoke\' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class InstallerWindows {
    public delegate bool EnumProc(IntPtr window, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr window, EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll")] public static extern bool EnableWindow(IntPtr window, bool enabled);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr window, int id);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder name, int count);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool SetWindowText(IntPtr window, string text);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    public static IntPtr Find(int process) {
        IntPtr found=IntPtr.Zero;
        EnumWindows((window,param)=>{ uint owner; GetWindowThreadProcessId(window,out owner); if(owner==process && IsWindowVisible(window)){found=window;return false;}return true;},IntPtr.Zero);
        return found;
    }
    public static string Text(IntPtr window){var text=new StringBuilder(4096);GetWindowText(window,text,text.Capacity);return text.ToString();}
    public static string Class(IntPtr window){var text=new StringBuilder(256);GetClassName(window,text,text.Capacity);return text.ToString();}
    public static IntPtr[] Children(IntPtr window){var result=new List<IntPtr>();EnumChildWindows(window,(child,param)=>{if(IsWindowVisible(child))result.Add(child);return true;},IntPtr.Zero);return result.ToArray();}
}
'@
[InstallerWindows]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Wait-Until([scriptblock]$Condition, [string]$Message) {
    $deadline = [datetime]::UtcNow.AddSeconds(20)
    do {
        $value = & $Condition
        if ($value) { return $value }
        Start-Sleep -Milliseconds 100
    } while ([datetime]::UtcNow -lt $deadline)
    throw $Message
}
function Find-Control([IntPtr]$Window, [string]$Text) {
    foreach ($control in [InstallerWindows]::Children($Window)) {
        if ([InstallerWindows]::Text($control) -eq $Text) { return $control }
    }
    return [IntPtr]::Zero
}
function Save-Screenshot([IntPtr]$Window, [string]$Name) {
    Start-Sleep -Milliseconds 300
    $rect = New-Object InstallerWindows+Rect
    [InstallerWindows]::GetWindowRect($Window, [ref]$rect) | Out-Null
    $bitmap = New-Object Drawing.Bitmap(($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top))
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $dc = $graphics.GetHdc()
    try { [InstallerWindows]::PrintWindow($Window, $dc, 2) | Out-Null }
    finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
    try { $bitmap.Save((Join-Path $testRoot "$Name.png"), [Drawing.Imaging.ImageFormat]::Png) }
    finally { $bitmap.Dispose() }
    [InstallerWindows]::Children($Window) | ForEach-Object {
        $bounds = New-Object InstallerWindows+Rect
        [InstallerWindows]::GetWindowRect($_, [ref]$bounds) | Out-Null
        '{0}: [{1},{2},{3},{4}] {5}' -f [InstallerWindows]::GetDlgCtrlID($_), $bounds.Left, $bounds.Top, $bounds.Right, $bounds.Bottom, [InstallerWindows]::Text($_)
    } | Set-Content -LiteralPath (Join-Path $testRoot ($Name + '-controls.txt')) -Encoding utf8
}

if ($PreviewExecutable) {
    # Open and cancel the real deliverable. No install action is triggered.
    $preview = Start-Process -FilePath (Resolve-Path -LiteralPath $PreviewExecutable).Path -PassThru -WindowStyle Normal
    try {
        $window = Wait-Until { $handle = [InstallerWindows]::Find($preview.Id); if ($handle -ne [IntPtr]::Zero) { $handle } } 'Preview window did not appear.'
        Wait-Until { [InstallerWindows]::Children($window).Count -gt 3 } 'Preview controls did not appear.' | Out-Null
        Save-Screenshot $window 'production'
        [InstallerWindows]::PostMessage([InstallerWindows]::GetDlgItem($window, 2), 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        Assert-True ($preview.WaitForExit(20000)) 'Preview did not close after cancellation.'
        @{ preview = (Join-Path $testRoot 'production.png'); installed = $false } | ConvertTo-Json -Compress
    } finally { if (-not $preview.HasExited) { $preview.Kill(); $preview.WaitForExit() } }
    return
}

$fixtureApplication = Join-Path $testRoot 'fixture.exe'
$stub = Join-Path $testRoot 'fixture.nsi'
[IO.File]::WriteAllLines($stub, @('Unicode true', 'Name "Installer fixture"', ('OutFile "' + $fixtureApplication + '"'), 'SilentInstall silent', 'Section', 'SectionEnd'))
& $MakeNsis /V1 $stub
if ($LASTEXITCODE -ne 0) { throw 'Could not build the isolated application fixture.' }

$product = 'SiloLink Installer Check ' + [guid]::NewGuid().ToString('N')
$manufacturer = 'SiloLinkInstallerChecks'
$bundleId = 'io.silolink.installercheck.' + [guid]::NewGuid().ToString('N')
$installDirectory = Join-Path $testRoot '앱 설치 폴더'
$registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
$uninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $product
$productKey = 'Software\' + $manufacturer + '\' + $product
$processes = @()
$checks = @()
function Build-Fixture([string]$Version) {
    $script = [IO.File]::ReadAllText($sourcePath)
    $definitions = @{
        PRODUCTNAME = $product; MANUFACTURER = $manufacturer; BUNDLEID = $bundleId
        VERSION = $Version; VERSIONWITHBUILD = ($Version + '.0'); MAINBINARYNAME = 'fixture'; MAINBINARYSRCPATH = $fixtureApplication
        DISPLAYLANGUAGESELECTOR = 'false'; OUTFILE = (Join-Path $testRoot ("setup-$Version.exe"))
    }
    foreach ($name in $definitions.Keys) {
        $pattern = '(?m)^!define ' + $name + ' ".*"\r?$'
        $script = [regex]::Replace($script, $pattern, ('!define ' + $name + ' "' + $definitions[$name] + '"'))
    }
    # Keep the production sections and native UI, but isolate payload, shell folders and profiles.
    $script = [regex]::Replace($script, '(?s); Copy resources\r?\n.*?; Create file associations', '; Create file associations')
    $script = $script.Replace('$DESKTOP', (Join-Path $testRoot 'desktop')).Replace('$SMPROGRAMS', (Join-Path $testRoot 'start-menu'))
    $script = $script.Replace('$APPDATA', (Join-Path $testRoot 'roaming')).Replace('$LOCALAPPDATA', (Join-Path $testRoot 'local'))
    # The checks read Korean labels; pin the language so English Windows (e.g. CI runners) shows the same screens.
    $script = [regex]::Replace($script, '(?m)^Function \.onInit\r?$', ("Function .onInit`r`n" + '  StrCpy $$LANGUAGE $${LANG_KOREAN}'))
    $fixtureScript = Join-Path $testRoot ("setup-$Version.nsi")
    [IO.File]::WriteAllText($fixtureScript, $script, [Text.UTF8Encoding]::new($true))
    Push-Location (Split-Path $sourcePath -Parent)
    try {
        $compilerOutput = & $MakeNsis /NOCD /V3 $fixtureScript 2>&1
        if ($LASTEXITCODE -ne 0 -or ($compilerOutput -match 'warning 6000:')) {
            throw ("NSIS fixture $Version failed compilation or referenced an undeclared variable.`n" + ($compilerOutput -join "`n"))
        }
    }
    finally { Pop-Location }
    return $definitions.OUTFILE
}
function Start-Fixture([string]$Exe, [string[]]$ExtraArguments = @(), [string]$RequestedDirectory = $installDirectory, [switch]$AllowShortcut) {
    $arguments = @()
    if (-not $AllowShortcut) { $arguments += '/NS' }
    $arguments += $ExtraArguments
    $arguments += '/D=' + $RequestedDirectory
    # These are interactive test windows; the rendered controls are part of the check.
    $process = Start-Process -FilePath $Exe -ArgumentList $arguments -PassThru -WindowStyle Normal
    $script:processes += $process
    $window = Wait-Until { $handle = [InstallerWindows]::Find($process.Id); if ($handle -ne [IntPtr]::Zero) { $handle } } 'Installer window did not appear.'
    Wait-Until { [InstallerWindows]::Children($window).Count -gt 3 } 'Installer controls did not appear.' | Out-Null
    return @{ Process = $process; Window = $window }
}
function Stop-Fixture($Fixture) {
    if (-not $Fixture.Process.HasExited) { $Fixture.Process.Kill(); $Fixture.Process.WaitForExit() }
}
function Wait-Control([IntPtr]$Window, [string]$Text) {
    return Wait-Until { $control = Find-Control $Window $Text; if ($control -ne [IntPtr]::Zero) { $control } } "Control did not appear: $Text"
}
function Click-Control([IntPtr]$Control) {
    Assert-True ([InstallerWindows]::IsWindowEnabled($Control)) 'Cannot click a disabled control.'
    [InstallerWindows]::PostMessage($Control, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
}
function Assert-StyledControls($Fixture) {
    $outer = New-Object InstallerWindows+Rect
    [InstallerWindows]::GetWindowRect($Fixture.Window, [ref]$outer) | Out-Null
    $image = [Drawing.Bitmap]::FromFile((Join-Path $testRoot 'fresh.png'))
    try {
        foreach ($label in @('설치 시작', '변경')) {
            $control = Wait-Control $Fixture.Window $label
            $rect = New-Object InstallerWindows+Rect
            [InstallerWindows]::GetWindowRect($control, [ref]$rect) | Out-Null
            $corner = $image.GetPixel(($rect.Left - $outer.Left + 1), ($rect.Top - $outer.Top + 1))
            Assert-True ($corner.R -lt 65 -and $corner.G -lt 65 -and $corner.B -lt 65) "Rounded $label corners must blend into the dark surface, not use native white button borders."
            if ($label -eq '변경') {
                $inside = $image.GetPixel(($rect.Left - $outer.Left + 12), ([int](($rect.Top + $rect.Bottom) / 2) - $outer.Top))
                Assert-True ($inside.R -lt 90 -and $inside.G -lt 90 -and $inside.B -lt 90) 'Folder selection must use the dark secondary-button surface.'
            }
        }
        $close = [InstallerWindows]::GetDlgItem($Fixture.Window, 2)
        Save-Screenshot $close 'header-close'
        $rect = New-Object InstallerWindows+Rect
        [InstallerWindows]::GetWindowRect($close, [ref]$rect) | Out-Null
        $visibleIconPixels = 0
        for ($y = $rect.Top - $outer.Top; $y -lt $rect.Bottom - $outer.Top; $y++) {
            for ($x = $rect.Left - $outer.Left; $x -lt $rect.Right - $outer.Left; $x++) {
                $pixel = $image.GetPixel($x, $y)
                if ($pixel.R -gt 110 -and $pixel.G -gt 110 -and $pixel.B -gt 110) { $visibleIconPixels++ }
            }
        }
        Assert-True ($visibleIconPixels -gt 5) 'The custom header close icon must be visibly rendered.'
    } finally { $image.Dispose() }
}
function Read-InstalledVersion {
    $key = $registry.OpenSubKey($uninstallKey)
    if ($null -eq $key) { return $null }
    try { return $key.GetValue('DisplayVersion') }
    finally { $key.Dispose() }
}
function Complete-Install($Fixture, [string]$Version, [string]$Screenshot) {
    Wait-Control $Fixture.Window "SiloLink $Version 준비가 완료되었습니다.`r`n기존 프로젝트, 기록과 설정은 그대로 사용할 수 있습니다." | Out-Null
    $launch = Wait-Control $Fixture.Window 'SiloLink 실행'
    [InstallerWindows]::SendMessage($launch, 0xF1, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Save-Screenshot $Fixture.Window $Screenshot
    Click-Control (Wait-Control $Fixture.Window '완료')
    Assert-True ($Fixture.Process.WaitForExit(20000)) 'Installer did not finish.'
    Assert-True ($Fixture.Process.ExitCode -eq 0) 'Installer returned an error.'
    Assert-True ((Read-InstalledVersion) -eq $Version) 'Installed registry version does not match the successful screen.'
    Assert-True (Test-Path -LiteralPath (Join-Path $installDirectory 'fixture.exe')) 'Installed executable is missing.'
}

try {
    New-Item -ItemType Directory -Path (Join-Path $testRoot 'desktop'), (Join-Path $testRoot 'start-menu') -Force | Out-Null
    $current = Build-Fixture '0.2.0'
    $fresh = Start-Fixture $current -AllowShortcut
    try {
        $button = Find-Control $fresh.Window '설치 시작'
        Save-Screenshot $fresh.Window 'fresh'
        Assert-True ($button -ne [IntPtr]::Zero) 'Fresh install must show the cinematic screen with 설치 시작.'
        $checks += 'fresh-install-screen'
        $compactBounds = New-Object InstallerWindows+Rect
        [InstallerWindows]::GetWindowRect($fresh.Window, [ref]$compactBounds) | Out-Null
        $compactScale = [Math]::Max(1, [InstallerWindows]::GetDpiForWindow($fresh.Window) / 120.0)
        Assert-True ([Math]::Abs(($compactBounds.Right - $compactBounds.Left) - 660 * $compactScale) -le 6) 'Installer width must match the compact 660px reference at common display scales.'
        Assert-True ([Math]::Abs(($compactBounds.Bottom - $compactBounds.Top) - 606 * $compactScale) -le 6) 'Installer height must match the compact 606px reference without a second title bar.'
        $checks += 'compact-reference-window-size'
        Assert-StyledControls $fresh
        $checks += 'styled-controls-rendered'
        $shortcut = Wait-Control $fresh.Window '바탕화면 바로가기 만들기'
        Assert-True ([InstallerWindows]::SendMessage($shortcut, 0xF0, [IntPtr]::Zero, [IntPtr]::Zero).ToInt32() -eq 1) 'Shortcut starts checked.'
        [InstallerWindows]::SendMessage($shortcut, 0x100, [IntPtr]::new(32), [IntPtr]::Zero) | Out-Null
        [InstallerWindows]::SendMessage($shortcut, 0x101, [IntPtr]::new(32), [IntPtr]::Zero) | Out-Null
        Assert-True ([InstallerWindows]::SendMessage($shortcut, 0xF0, [IntPtr]::Zero, [IntPtr]::Zero).ToInt32() -eq 0) 'Space must still toggle the styled native checkbox.'
        Click-Control $shortcut
        Wait-Until { [InstallerWindows]::SendMessage($shortcut, 0xF0, [IntPtr]::Zero, [IntPtr]::Zero).ToInt32() -eq 1 } 'Click must still toggle the styled checkbox.' | Out-Null
        $checks += 'styled-checkbox-keyboard-and-click'
        $edit = [InstallerWindows]::Children($fresh.Window) | Where-Object { [InstallerWindows]::Class($_) -eq 'Edit' } | Select-Object -First 1
        Assert-True ($null -ne $edit) 'Installation folder must remain a native editable text field.'
        Assert-True ([InstallerWindows]::Text($edit) -eq $installDirectory) 'The fixture must honor its isolated /D path before editing.'
        $typedFolder = Join-Path $testRoot '직접 입력한 폴더'
        [InstallerWindows]::SetWindowText($edit, $typedFolder) | Out-Null
        Assert-True ([InstallerWindows]::Text($edit) -eq $typedFolder) 'The padded folder field must preserve Unicode text editing.'
        Click-Control (Wait-Control $fresh.Window '변경')
        $picker = Wait-Until { $handle = [InstallerWindows]::Find($fresh.Process.Id); if ($handle -ne [IntPtr]::Zero -and $handle -ne $fresh.Window) { $handle } } 'Styled folder button did not open the native folder picker.'
        [InstallerWindows]::PostMessage($picker, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        Wait-Until { [InstallerWindows]::Find($fresh.Process.Id) -eq $fresh.Window } 'Cancelling folder selection did not return to the installer.' | Out-Null
        Assert-True ([InstallerWindows]::Text($edit) -eq $typedFolder) 'Cancelling folder selection must retain the typed folder.'
        $checks += 'styled-folder-edit-browse-and-cancel'
        $headerClose = [InstallerWindows]::GetDlgItem($fresh.Window, 2)
        $captionPoint = (($compactBounds.Top + 20) -shl 16) -bor ($compactBounds.Left + 100)
        Assert-True ([InstallerWindows]::SendMessage($fresh.Window, 0x84, [IntPtr]::Zero, [IntPtr]::new($captionPoint)).ToInt32() -eq 2) 'The custom header must retain native window dragging.'
        $nativeCancel = [InstallerWindows]::GetDlgItem($fresh.Window, 2)
        [InstallerWindows]::EnableWindow($nativeCancel, $false) | Out-Null
        Wait-Until { -not [InstallerWindows]::IsWindowEnabled($headerClose) } 'Header close must be disabled when the installer cannot be cancelled.' | Out-Null
        [InstallerWindows]::EnableWindow($nativeCancel, $true) | Out-Null
        Wait-Until { [InstallerWindows]::IsWindowEnabled($headerClose) } 'Header close must become available again.' | Out-Null
        $checks += 'custom-header-drag-and-close-guard'
        Click-Control $headerClose
        Assert-True ($fresh.Process.WaitForExit(20000)) 'Cancelling before installation did not close the installer.'
        $checks += 'cancel-before-installation'
    } finally { Stop-Fixture $fresh }
    Assert-True (-not (Test-Path -LiteralPath $installDirectory)) 'Opening or cancelling the installer must not install files.'
    Assert-True ($null -eq (Read-InstalledVersion)) 'Opening or cancelling must not register an installation.'
    if ($FirstScreenOnly) {
        @{ checks = $checks; output = $testRoot } | ConvertTo-Json -Compress
        return
    }
    $fresh = Start-Fixture $current
    Click-Control (Wait-Control $fresh.Window '설치 시작')
    Complete-Install $fresh '0.2.0' 'installed'
    $checks += 'fresh-install-persisted'

    $profile = Join-Path $testRoot ('roaming\' + $bundleId)
    New-Item -ItemType Directory -Path $profile -Force | Out-Null
    $sentinels = @{
        (Join-Path $profile 'settings.json') = '{"projects":["my-project"],"theme":"dark"}'
        (Join-Path $profile 'records.db') = 'Existing user record storage, must not be replaced.'
        (Join-Path $installDirectory 'keep.txt') = 'User-created file in the install folder.'
    }
    foreach ($file in $sentinels.Keys) { [IO.File]::WriteAllText($file, $sentinels[$file]) }
    $hashes = @{}
    foreach ($file in $sentinels.Keys) { $hashes[$file] = (Get-FileHash -LiteralPath $file).Hash }
    $newer = Build-Fixture '0.3.0'
    $alternateDirectory = Join-Path $testRoot '새 경로로 중복 설치하지 않음'
    $update = Start-Fixture $newer -RequestedDirectory $alternateDirectory
    $button = Wait-Control $update.Window '업데이트 시작'
    Wait-Control $update.Window "새로운 SiloLink를 만나보세요.`r`n현재 0.2.0 → 새 버전 0.3.0" | Out-Null
    Assert-True (-not [InstallerWindows]::IsWindowEnabled((Wait-Control $update.Window '변경'))) 'An update must retain the previous installation folder.'
    Save-Screenshot $update.Window 'update'
    Click-Control $button
    Complete-Install $update '0.3.0' 'updated'
    Assert-True (-not (Test-Path -LiteralPath $alternateDirectory)) 'An update must not create the /D override directory.'
    $checks += 'update-version-and-original-path'

    $repair = Start-Fixture $newer
    Click-Control (Wait-Control $repair.Window '다시 설치')
    Complete-Install $repair '0.3.0' 'repaired'
    $checks += 'same-version-reinstall'
    foreach ($file in $sentinels.Keys) {
        Assert-True ((Get-FileHash -LiteralPath $file).Hash -eq $hashes[$file]) "Update/reinstall changed user data: $file"
    }
    $checks += 'update-and-reinstall-preserve-data'

    $blocked = Start-Fixture $current
    Wait-Control $blocked.Window "더 최신 버전을 사용 중입니다.`r`n설치된 버전 0.3.0 · 이 설치 파일 0.2.0" | Out-Null
    Save-Screenshot $blocked.Window 'downgrade-blocked'
    Click-Control (Wait-Control $blocked.Window '종료')
    Assert-True ($blocked.Process.WaitForExit(20000)) 'Blocked installer did not close.'
    Assert-True ((Read-InstalledVersion) -eq '0.3.0') 'Interactive downgrade changed the installed version.'
    $checks += 'interactive-downgrade-blocked'
    foreach ($mode in @('/S', '/P', '/S /UPDATE')) {
        $process = Start-Process -FilePath $current -ArgumentList $mode -PassThru -WindowStyle Hidden
        $processes += $process
        Assert-True ($process.WaitForExit(20000)) "Blocked mode did not exit: $mode"
        Assert-True ($process.ExitCode -ne 0) "Downgrade must fail: $mode"
        Assert-True ((Read-InstalledVersion) -eq '0.3.0') "Downgrade changed installed state: $mode"
    }
    $checks += 'silent-passive-update-downgrades-blocked'
    foreach ($file in $sentinels.Keys) {
        Assert-True ((Get-FileHash -LiteralPath $file).Hash -eq $hashes[$file]) "Downgrade changed user data: $file"
    }
    $uninstaller = Join-Path $installDirectory 'uninstall.exe'
    $process = Start-Process -FilePath $uninstaller -ArgumentList @('/S', '/P', ('_?=' + $installDirectory)) -PassThru -WindowStyle Hidden
    $processes += $process
    Assert-True ($process.WaitForExit(20000)) 'Uninstaller did not exit.'
    Assert-True ($process.ExitCode -eq 0) 'Uninstaller failed.'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $installDirectory 'fixture.exe'))) 'Uninstaller did not remove the app.'
    foreach ($file in $sentinels.Keys) {
        Assert-True ((Get-FileHash -LiteralPath $file).Hash -eq $hashes[$file]) "Default uninstall deleted user data: $file"
    }
    $checks += 'default-uninstall-preserves-data'
    $result = @{ checks = $checks; output = $testRoot }
    $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $testRoot 'result.json') -Encoding utf8
    $result | ConvertTo-Json -Compress
} catch {
    foreach ($process in $processes) {
        if (-not $process.HasExited) {
            $handle = [InstallerWindows]::Find($process.Id)
            if ($handle -ne [IntPtr]::Zero) {
                Save-Screenshot $handle ('failure-' + $process.Id)
                [InstallerWindows]::Children($handle) | ForEach-Object { [InstallerWindows]::Text($_) } | Set-Content -LiteralPath (Join-Path $testRoot ('failure-' + $process.Id + '.txt')) -Encoding utf8
            }
        }
    }
    Write-Host "Installer test evidence: $testRoot"
    throw
} finally {
    foreach ($process in $processes) { if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() } }
    $registry.DeleteSubKeyTree($uninstallKey, $false)
    $registry.DeleteSubKeyTree($productKey, $false)
    $registry.Dispose()
}
