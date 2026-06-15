$f = 'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\shipping-manifest.tsx'
$c = [System.IO.File]::ReadAllText($f)

# 1. غيّر الـ import
$c = $c.Replace(
  "  manifestsApi,`r`n  apiFetch,`r`n  type ShippingManifestDetail,`r`n  type ManifestOrder,`r`n  type DeliveryStatus,",
  "  shipmentManifestsApi,`r`n  apiFetch,`r`n  type ShipmentManifestDetail as ShippingManifestDetail,`r`n  type ManifestOrder,`r`n  type DeliveryStatus,"
)

# 2. غيّر الـ useQuery
$c = $c.Replace(
  "    queryFn: () => manifestsApi.get(id),",
  "    queryFn: () => shipmentManifestsApi.get(id),"
)

[System.IO.File]::WriteAllText($f, $c)
Write-Host "done"
