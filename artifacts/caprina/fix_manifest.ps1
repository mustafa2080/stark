$f = 'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\shipping-manifest.tsx'
$c = [System.IO.File]::ReadAllText($f)
$c2 = $c.Replace('manifest.orders', 'manifest.items').Replace('manifest?.orders', 'manifest?.items')
[System.IO.File]::WriteAllText($f, $c2)
Write-Host "done, replacements: $(($c.Split('manifest.orders').Length - 1) + ($c.Split('manifest?.orders').Length - 1))"
