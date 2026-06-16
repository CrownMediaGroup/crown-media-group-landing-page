# Creates the H.E.R. $248 deposit Payment Link via Stripe API.
# Reads STRIPE_RESTRICTED_KEY from .env.kingdom-secrets (gitignored).
# Re-runnable; each call creates a new link (Stripe doesn't dedupe).

$envPath = Join-Path $PSScriptRoot '..\..\..\.env.kingdom-secrets'
$envContent = Get-Content $envPath -ErrorAction Stop
$keyLine = $envContent | Where-Object { $_ -match '^STRIPE_RESTRICTED_KEY=' } | Select-Object -First 1
if (-not $keyLine) { throw 'STRIPE_RESTRICTED_KEY not found in .env.kingdom-secrets' }
$key = ($keyLine -split '=', 2)[1].Trim()
$headers = @{ Authorization = 'Bearer ' + $key }

Write-Host '=== Creating product ==='
$prod = Invoke-RestMethod -Uri 'https://api.stripe.com/v1/products' -Method Post -Headers $headers -Body @{
    name = 'H.E.R. Logo + Landing Page - 50% Deposit'
    description = 'First 50% of the H.E.R. Logo + Landing Page package. Balance ($248) billed on logo approval.'
}
Write-Host ('Product ID: ' + $prod.id)

Write-Host '=== Creating $248 price ==='
$price = Invoke-RestMethod -Uri 'https://api.stripe.com/v1/prices' -Method Post -Headers $headers -Body @{
    unit_amount = 24800
    currency = 'usd'
    product = $prod.id
}
Write-Host ('Price ID: ' + $price.id)

Write-Host '=== Creating payment link ==='
$link = Invoke-RestMethod -Uri 'https://api.stripe.com/v1/payment_links' -Method Post -Headers $headers -Body @{
    'line_items[0][price]' = $price.id
    'line_items[0][quantity]' = 1
}
Write-Host ''
Write-Host 'Payment Link:'
Write-Host $link.url

[IO.File]::WriteAllText('C:\Users\ldavi\Downloads\her-deposit-link.txt', $link.url)
