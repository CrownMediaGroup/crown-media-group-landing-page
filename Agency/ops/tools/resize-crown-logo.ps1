Add-Type -AssemblyName System.Drawing
$src = 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\CROWN MEDIA GROUP LOGO.png'
$dst = 'C:\Users\ldavi\Downloads\crown-logo-thumb.png'
$img = [System.Drawing.Image]::FromFile($src)
$ratio = 320 / $img.Width
$newH = [int]($img.Height * $ratio)
$bmp = New-Object System.Drawing.Bitmap 320, $newH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($img, 0, 0, 320, $newH)
$bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose(); $img.Dispose(); $g.Dispose()
Write-Host ('thumb size: ' + (Get-Item $dst).Length + ' bytes, 320x' + $newH)
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($dst))
[IO.File]::WriteAllText('C:\Users\ldavi\Downloads\crown-b64.txt', $b64)
Write-Host ('b64 length: ' + $b64.Length)
