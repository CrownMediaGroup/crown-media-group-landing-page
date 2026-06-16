$html = [IO.File]::ReadAllText('C:\Users\ldavi\Documents\AllGloryAgency\landing-page\her.html')
$b64 = [IO.File]::ReadAllText('C:\Users\ldavi\Downloads\crown-b64.txt')
$dataUri = 'data:image/png;base64,' + $b64
$out = $html.Replace('__CROWN_LOGO_B64__', $dataUri)
[IO.File]::WriteAllText('C:\Users\ldavi\Documents\AllGloryAgency\landing-page\her.html', $out)
Copy-Item 'C:\Users\ldavi\Documents\AllGloryAgency\landing-page\her.html' 'C:\Users\ldavi\Downloads\HER_Samantha_v6.html' -Force
Write-Host ('placeholder gone: ' + (-not $out.Contains('__CROWN_LOGO_B64__')))
