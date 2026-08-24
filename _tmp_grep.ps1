$path = 'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\client-account-client-page.tsx'
$bytes = [System.IO.File]::ReadAllBytes($path)
$content = [System.Text.Encoding]::UTF8.GetString($bytes)
$lines = $content -split "`n"
$manifest = [string]([char]0x0628+[char]0x064a+[char]0x0627+[char]0x0646)  # bayan
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '<table|<th|useManifest|manifests\.map|Manifest\[\]|api/client-account-manifests') {
        Write-Output "$($i+1): $($lines[$i].Trim())"
    }
}
