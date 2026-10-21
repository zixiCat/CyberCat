# Windows PowerShell / PowerShell on Windows. No external imaging dependency.
# Only crops, scales and packages the generated artwork; never redraws it.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Export-Png {
    param(
        [System.Drawing.Image]$Source,
        [System.Drawing.Rectangle]$Crop,
        [int]$Width,
        [int]$Height,
        [int]$Padding,
        [string]$OutputPath
    )

    $bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $scale = [Math]::Min(($Width - 2 * $Padding) / $Crop.Width, ($Height - 2 * $Padding) / $Crop.Height)
        $scaledWidth = [int][Math]::Round($Crop.Width * $scale)
        $scaledHeight = [int][Math]::Round($Crop.Height * $scale)
        $destination = [System.Drawing.Rectangle]::new(
            [int](($Width - $scaledWidth) / 2), [int](($Height - $scaledHeight) / 2),
            $scaledWidth, $scaledHeight
        )
        $graphics.DrawImage($Source, $destination, $Crop, [System.Drawing.GraphicsUnit]::Pixel)
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

$artwork = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'source/CyberCatDetailedGreen.png'))
try {
    Export-Png $artwork ([System.Drawing.Rectangle]::new(0, 0, $artwork.Width, $artwork.Height)) `
        768 960 30 (Join-Path $PSScriptRoot 'CyberCatDetailed.png')
    # A single fixed square crop keeps the ears, goggles, face and upper coat readable.
    Export-Png $artwork ([System.Drawing.Rectangle]::new(190, 0, 820, 820)) `
        512 512 20 (Join-Path $PSScriptRoot 'CyberCatDetailedAvatar.png')
} finally {
    $artwork.Dispose()
}

# Multi-resolution PNG-backed ICO: browsers and the Windows installer use one asset.
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @()
$avatar = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'CyberCatDetailedAvatar.png'))
try {
    foreach ($size in $sizes) {
        $bitmap = [System.Drawing.Bitmap]::new($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $stream = [System.IO.MemoryStream]::new()
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($avatar, 0, 0, $size, $size)
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            $frames += ,$stream.ToArray()
        } finally {
            $stream.Dispose()
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally {
    $avatar.Dispose()
}

$iconStream = [System.IO.File]::Create((Join-Path $PSScriptRoot 'CyberCatDetailed.ico'))
$writer = [System.IO.BinaryWriter]::new($iconStream)
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($index = 0; $index -lt $sizes.Count; $index++) {
        $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
        $writer.Write([byte]$dimension)
        $writer.Write([byte]$dimension)
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$frames[$index].Length)
        $writer.Write([uint32]$offset)
        $offset += $frames[$index].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
} finally {
    $writer.Dispose()
}

Write-Output 'Exported full-body PNG, avatar PNG and seven-resolution ICO.'
