param(
    [string]$BuildDirectory = (Join-Path $PSScriptRoot '..\..\target\release'),
    [switch]$StaticOnly
)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$build = (Resolve-Path -LiteralPath $BuildDirectory).Path
$output = Join-Path $repository ('.tools\process-branding\' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $output -Force | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class BrandingWindows {
    delegate bool EnumProc(IntPtr window, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left,Top,Right,Bottom; }
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out Rect bounds);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr window,uint message,IntPtr wparam,IntPtr lparam,uint flags,uint timeout,out IntPtr result);
    [DllImport("user32.dll", EntryPoint="GetClassLongPtrW")] static extern IntPtr ClassLong64(IntPtr window,int index);
    [DllImport("user32.dll", EntryPoint="GetClassLongW")] static extern uint ClassLong32(IntPtr window,int index);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window,uint message,IntPtr wparam,IntPtr lparam);
    public static IntPtr Find(int process) {
        IntPtr found=IntPtr.Zero;
        EnumWindows((window,param)=>{uint owner;GetWindowThreadProcessId(window,out owner);var title=new StringBuilder(256);GetWindowText(window,title,title.Capacity);Rect bounds;GetClientRect(window,out bounds);
            if(owner==process && title.ToString()=="SiloLink" && bounds.Right>=300 && bounds.Bottom>=200){found=window;return false;}return true;},IntPtr.Zero);
        return found;
    }
    public static IntPtr Icon(IntPtr window) {
        // Tao sets the title-bar icon as ICON_SMALL; ICON_BIG is optional.
        foreach(int type in new[]{1,0,2}) {
            IntPtr icon;
            SendMessageTimeout(window,0x7F,new IntPtr(type),IntPtr.Zero,2,1000,out icon);
            if(icon!=IntPtr.Zero)return icon;
        }
        foreach(int index in new[]{-14,-34}) {
            IntPtr icon=IntPtr.Size==8?ClassLong64(window,index):new IntPtr(ClassLong32(window,index));
            if(icon!=IntPtr.Zero)return icon;
        }
        return IntPtr.Zero;
    }
}
'@
function Assert-Brand([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Normalize-Image([Drawing.Image]$Source) {
    $image = New-Object Drawing.Bitmap(32,32)
    $graphics = [Drawing.Graphics]::FromImage($image)
    try { $graphics.Clear([Drawing.Color]::White); $graphics.DrawImage($Source, (New-Object Drawing.Rectangle(0,0,32,32))) }
    finally { $graphics.Dispose() }
    return $image
}
function Normalize-Icon([Drawing.Icon]$Icon) {
    $source = $Icon.ToBitmap()
    try { return Normalize-Image $source }
    finally { $source.Dispose() }
}
function Icon-Difference([Drawing.Bitmap]$Actual, [Drawing.Bitmap]$Expected) {
    $difference = 0L
    for ($y=0; $y -lt 32; $y++) { for ($x=0; $x -lt 32; $x++) {
        $a=$Actual.GetPixel($x,$y); $e=$Expected.GetPixel($x,$y)
        $difference += [Math]::Abs([int]$a.R-$e.R)+[Math]::Abs([int]$a.G-$e.G)+[Math]::Abs([int]$a.B-$e.B)
    } }
    return $difference/(32.0*32*3)
}
$sourceIcon = [Drawing.Icon]::ExtractAssociatedIcon((Join-Path $repository 'desktop\src-tauri\icons\icon.ico'))
$reference = Normalize-Icon $sourceIcon
$reference.Save((Join-Path $output 'reference-icon.png'),[Drawing.Imaging.ImageFormat]::Png)
$sourceIcon.Dispose()
$checks = @()
$executables = @(
    @{ Path=(Join-Path $build 'silolink-desktop.exe'); Description='SiloLink' },
    @{ Path=(Join-Path $build 'silolink.exe'); Description='SiloLink CLI' }
)
$installer = @(Get-ChildItem -LiteralPath (Join-Path $build 'bundle\nsis') -Filter '*-setup.exe' -File)
Assert-Brand ($installer.Count -eq 1) 'Expected one built installer.'
$executables += @{ Path=$installer[0].FullName; Description='SiloLink' }
$process = $null
$savedEnvironment = @{}
try {
    foreach ($executable in $executables) {
        $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($executable.Path)
        Assert-Brand ($version.FileDescription -ceq $executable.Description) "Process display name is missing or incorrect: $($executable.Path) [$($version.FileDescription)]"
        Assert-Brand ($version.ProductName -ceq 'SiloLink') "Product name is missing: $($executable.Path)"
        $icon = [Drawing.Icon]::ExtractAssociatedIcon($executable.Path)
        $image = Normalize-Icon $icon
        try {
            $difference = Icon-Difference $image $reference
            $image.Save((Join-Path $output ((Split-Path $executable.Path -Leaf)+'.png')), [Drawing.Imaging.ImageFormat]::Png)
            Assert-Brand ($difference -le 3) "Process icon differs from the SiloLink brand: $($executable.Path), difference=$difference"
            $checks += @{ executable=(Split-Path $executable.Path -Leaf); displayName=$version.FileDescription; iconDifference=$difference }
        } finally { $image.Dispose(); $icon.Dispose() }
    }
    if (-not $StaticOnly) {
        $isolatedEnvironment = @{
            SILOLINK_DESKTOP_CONFIG_DIR=(Join-Path $output 'profile')
            SILOLINK_USER_HOME=(Join-Path $output 'tool-user')
            SILOLINK_PROJECT_REGISTRY_DIR=(Join-Path $output 'projects')
            WEBVIEW2_USER_DATA_FOLDER=(Join-Path $output 'webview')
        }
        foreach ($name in $isolatedEnvironment.Keys) {
            $savedEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')
            [Environment]::SetEnvironmentVariable($name,$isolatedEnvironment[$name],'Process')
        }
        $process=Start-Process -FilePath (Join-Path $build 'silolink-desktop.exe') -WorkingDirectory $output -PassThru -WindowStyle Hidden
        $deadline=[datetime]::UtcNow.AddSeconds(30)
        $window=[IntPtr]::Zero
        do {
            Assert-Brand (-not $process.HasExited) 'App exited before its process branding could be verified; an existing instance may be running.'
            $window=[BrandingWindows]::Find($process.Id)
            if ($window -ne [IntPtr]::Zero) { break }
            Start-Sleep -Milliseconds 100
        } while ([datetime]::UtcNow -lt $deadline)
        Assert-Brand ($window -ne [IntPtr]::Zero) 'The running app did not expose a SiloLink window.'
        Assert-Brand ($process.WaitForInputIdle(10000)) 'The app did not finish initializing its window.'
        $iconDeadline=[datetime]::UtcNow.AddSeconds(10)
        do {
            $handle=[BrandingWindows]::Icon($window)
            if ($handle -ne [IntPtr]::Zero) { break }
            Start-Sleep -Milliseconds 100
        } while ([datetime]::UtcNow -lt $iconDeadline)
        Assert-Brand ($handle -ne [IntPtr]::Zero) 'The running app has no window/class icon.'
        # Compare the runtime PNG at the same resolution, rather than the shell's
        # separately rendered 32px ICO entry (which has different edge padding).
        $sourceImage=[Drawing.Image]::FromFile((Join-Path $repository 'desktop\src-tauri\icons\128x128.png'))
        try { $windowReference=Normalize-Image $sourceImage }
        finally { $sourceImage.Dispose() }
        $icon=[Drawing.Icon]::FromHandle($handle).Clone()
        $image=Normalize-Icon $icon
        try {
            $difference=Icon-Difference $image $windowReference
            $windowReference.Save((Join-Path $output 'reference-window-icon.png'),[Drawing.Imaging.ImageFormat]::Png)
            $image.Save((Join-Path $output 'running-window-icon.png'),[Drawing.Imaging.ImageFormat]::Png)
            Assert-Brand ($difference -le 8) "Running app icon does not match SiloLink: $difference, size=$($icon.Size), output=$output"
            $checks += @{ runningAppTitle='SiloLink'; processId=$process.Id; iconDifference=$difference }
        } finally { $image.Dispose(); $icon.Dispose(); $windowReference.Dispose() }
        [BrandingWindows]::PostMessage($window,0x10,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null
        Assert-Brand ($process.WaitForExit(15000)) 'Isolated branding verification app did not close.'
        Assert-Brand ($process.ExitCode -eq 0) 'Isolated branding verification app did not exit cleanly.'
    }
    $result=@{ checks=$checks; output=$output }
    $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding utf8
    $result | ConvertTo-Json -Depth 5 -Compress
} finally {
    if ($process -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
    foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process') }
    $reference.Dispose()
}
