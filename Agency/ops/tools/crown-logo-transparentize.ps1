# Removes white background from Crown Media logo, creates transparent versions
# at multiple sizes for hero, footer, and favicons.

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Drawing.Imaging

$src = 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\CROWN MEDIA GROUP LOGO.png'

function Remove-White-Bg {
    param([System.Drawing.Bitmap]$bmp, [int]$threshold = 230)
    $rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bytes = New-Object byte[] ($data.Stride * $data.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    for ($i = 0; $i -lt $bytes.Length; $i += 4) {
        $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]
        # If pixel is near-white, make transparent. Softer transition for off-white.
        if ($r -ge $threshold -and $g -ge $threshold -and $b -ge $threshold) {
            $bytes[$i + 3] = 0  # alpha = 0
        } elseif ($r -ge 200 -and $g -ge 200 -and $b -ge 200) {
            # Soft fade for off-white edges (anti-aliasing)
            $avg = ($r + $g + $b) / 3
            $fade = [Math]::Max(0, 255 - (($avg - 200) * 4))
            $bytes[$i + 3] = [byte]([Math]::Min($bytes[$i + 3], $fade))
        }
    }
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
    $bmp.UnlockBits($data)
    return $bmp
}

function Make-Resized-Transparent {
    param([string]$srcPath, [string]$dstPath, [int]$size)
    $img = [System.Drawing.Image]::FromFile($srcPath)
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($img, 0, 0, $size, $size)
    $bmp = Remove-White-Bg -bmp $bmp
    $bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose(); $img.Dispose(); $g.Dispose()
    Write-Host ($size.ToString() + 'x' + $size + ': ' + (Get-Item $dstPath).Length + ' bytes -> ' + $dstPath)
}

# Hero thumbnail (transparent)
Make-Resized-Transparent -srcPath $src -dstPath 'C:\Users\ldavi\Downloads\crown-logo-transparent.png' -size 320

# Favicons (transparent so dark browsers show the crown clean)
Make-Resized-Transparent -srcPath $src -dstPath 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\favicon-32.png' -size 32
Make-Resized-Transparent -srcPath $src -dstPath 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\favicon-180.png' -size 180
Make-Resized-Transparent -srcPath $src -dstPath 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\favicon-192.png' -size 192

# Base64 for inline embed
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\Users\ldavi\Downloads\crown-logo-transparent.png'))
[IO.File]::WriteAllText('C:\Users\ldavi\Downloads\crown-b64.txt', $b64)
Write-Host ('b64 length: ' + $b64.Length)
