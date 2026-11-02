param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repository 'desktop\src-tauri\windows\generated' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
& (Join-Path $PSScriptRoot 'build-installer-controls.ps1') -OutputDirectory $OutputDirectory
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $repository 'desktop\src-tauri\windows\installer-artwork.cs') -ReferencedAssemblies System.Drawing
$bitmap = New-Object Drawing.Bitmap(1320, 1212, ([Drawing.Imaging.PixelFormat]::Format24bppRgb))
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$icon = [Drawing.Image]::FromFile((Join-Path $repository 'desktop\public\branding\silolink-app-icon.png'))
try {
    $graphics.ScaleTransform(2, 2)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#191a1d'))
    $header = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#141517'))
    $hero = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#111214'))
    try { $graphics.FillRectangle($header, 0, 0, 660, 58); $graphics.FillRectangle($hero, 0, 58, 660, 304) }
    finally { $header.Dispose(); $hero.Dispose() }
    $glowPath = New-Object Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(360, -80, 430, 530)
    $glow = New-Object Drawing.Drawing2D.PathGradientBrush($glowPath)
    try {
        $glow.CenterColor = [Drawing.ColorTranslator]::FromHtml('#616468')
        $glow.SurroundColors = @([Drawing.ColorTranslator]::FromHtml('#111214'))
        # Keep native text on a flat left surface; the cinematic light lives behind the icon.
        $graphics.SetClip((New-Object Drawing.Rectangle(360, 58, 300, 304)))
        $graphics.FillEllipse($glow, 360, -80, 430, 530)
        $line = New-Object Drawing.Pen([Drawing.Color]::FromArgb(7, 255, 255, 255), 1)
        try { for ($x = 310; $x -lt 950; $x += 95) { $graphics.DrawLine($line, $x, 58, ($x - 170), 362) } }
        finally { $line.Dispose() }
        $graphics.ResetClip()
    } finally { $glow.Dispose(); $glowPath.Dispose() }
    $graphics.DrawImage($icon, 24, 9, 40, 40)
    $block = [SiloLink.InstallerArtwork]::Block($icon, 2)
    try {
        $graphics.SetClip((New-Object Drawing.Rectangle(0, 58, 660, 304)))
        $graphics.DrawImage($block, 350, 50, 320, 340)
        $graphics.ResetClip()
    } finally { $block.Dispose() }
    $bitmap.Save((Join-Path $OutputDirectory 'cinematic.bmp'), [Drawing.Imaging.ImageFormat]::Bmp)
} finally { $icon.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
