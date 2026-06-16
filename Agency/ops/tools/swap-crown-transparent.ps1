# Swaps the existing Crown logo data URI in her.html for the new transparent version
# AND adds favicon link tags to <head>

$htmlPath = 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\her.html'
$b64Path  = 'C:\Users\ldavi\Downloads\crown-b64.txt'

$html = [IO.File]::ReadAllText($htmlPath)
$b64 = [IO.File]::ReadAllText($b64Path)
$dataUri = 'data:image/png;base64,' + $b64

# Replace the crown-logo src — anything between src=" and " on the crown-logo line
$html = [regex]::Replace($html, '(<img class="crown-logo[^"]*"[^>]*src=")[^"]+(")', ('${1}' + $dataUri + '${2}'))

# Replace the crown-foot-logo src
$html = [regex]::Replace($html, '(<img class="crown-foot-logo"[^>]*src=")[^"]+(")', ('${1}' + $dataUri + '${2}'))

# Add favicon links to <head> if not already present
if (-not $html.Contains('favicon-32.png')) {
    $faviconTags = @"
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180.png">
<meta name="theme-color" content="#1C0620">

"@
    $html = $html.Replace('<title>Samantha — H.E.R. Vision</title>', '<title>Samantha — H.E.R. Vision</title>' + "`n" + $faviconTags.Trim())
}

[IO.File]::WriteAllText($htmlPath, $html)

# Sync to Downloads
Copy-Item $htmlPath 'C:\Users\ldavi\Downloads\HER_Samantha_v6.html' -Force

# Verify swaps
$crownLogoCount = ([regex]::Matches($html, 'class="crown-logo[^"]*"[^>]*src="data:image/png;base64,' + $b64.Substring(0, 40))).Count
$footLogoCount = ([regex]::Matches($html, 'class="crown-foot-logo"[^>]*src="data:image/png;base64,' + $b64.Substring(0, 40))).Count
$faviconCount = ([regex]::Matches($html, 'favicon-32\.png')).Count

Write-Host ('hero crown-logo swapped: ' + $crownLogoCount)
Write-Host ('foot crown-logo swapped: ' + $footLogoCount)
Write-Host ('favicon links present: ' + $faviconCount)
