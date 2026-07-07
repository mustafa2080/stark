$path = 'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\client-account-manifest.tsx'
$content = Get-Content -Raw -Path $path -Encoding UTF8
$content = $content -replace 'shipmentManifestsApi', 'clientAccountManifestsApi'
$content = $content -replace 'ShipmentManifestDetail', 'ClientAccountManifestDetail'
Set-Content -Path $path -Value $content -Encoding UTF8 -NoNewline
Write-Output 'done'
