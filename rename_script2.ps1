$path = 'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\client-account-manifest.tsx'
$tmp = $path + '.tmp'
$content = Get-Content -Raw -Path $path -Encoding UTF8

$content = $content -replace 'companyName: rawManifest\.company\?\.name \?\? ''—''', 'clientName: rawManifest.client?.name ?? ''—'''
$content = $content -replace 'companyPhone: null as string \| null,', 'clientPhone: rawManifest.client?.phone ?? null,'
$content = $content -replace 'companyLogo: rawManifest\.company\?\.logo \?\? null,', 'clientCity: rawManifest.client?.city ?? null,'

$content = $content -replace 'manifest\.companyName', 'manifest.clientName'
$content = $content -replace 'manifest\.companyLogo', 'null'
$content = $content -replace 'manifest\.companyPhone', 'manifest.clientPhone'

Set-Content -Path $tmp -Value $content -Encoding UTF8 -NoNewline
Move-Item -Force $tmp $path
Write-Output 'done'
