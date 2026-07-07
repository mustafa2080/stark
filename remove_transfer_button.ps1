$p = 'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\movements.tsx'
$lines = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $p -Encoding UTF8)
# Remove lines 844..847 (1-indexed) => index 843..846
$lines.RemoveRange(843, 4)
[System.IO.File]::WriteAllLines($p, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Done. New line 843 area:"
$check = Get-Content -LiteralPath $p -Encoding UTF8
$check[838..846]
