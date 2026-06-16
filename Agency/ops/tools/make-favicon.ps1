Add-Type -AssemblyName System.Drawing
$src = 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\CROWN MEDIA GROUP LOGO.png'

# 32x32 standard favicon
$dst32 = 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\favicon-32.png'
# 180x180 Apple touch icon
$dst180 = 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\favicon-180.png'
# 192x192 Android / PWA
$dst192 = 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\favicon-192.png'

foreach ($pair in @(@($dst32, 32), @($dst180, 180), @($dst192, 192))) {
    $dst = $pair[0]
    $size = $pair[1]
    $img = [System.Drawing.Image]::FromFile($src)
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $size, $size)
    $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose(); $img.Dispose(); $g.Dispose()
    Write-Host ($size.ToString() + 'x' + $size + ': ' + (Get-Item $dst).Length + ' bytes')
}
