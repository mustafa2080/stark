$f = 'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\shipping-manifest.tsx'
$c = [System.IO.File]::ReadAllText($f)
$search = 'export default function ShippingManifestPage() {'
$idx = $c.IndexOf($search)
Write-Host "idx=$idx"
if ($idx -ge 0) {
  $insert = "`r`n  const params = useParams();`r`n  const id = Number(params.id);`r`n  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/shipping/shipment-manifests/')) { window.location.replace('/shipping'); return null; }"
  $old = $search + "`r`n  const params = useParams();`r`n  const id = Number(params.id);"
  $new = $search + $insert
  $c2 = $c.Replace($old, $new)
  [System.IO.File]::WriteAllText($f, $c2)
  Write-Host 'done'
} else { Write-Host 'not found' }
