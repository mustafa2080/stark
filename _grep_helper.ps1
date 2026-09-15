$matches = Select-String -Path 'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\shipping-manifest.tsx' -Pattern 'bulkReturnReceived'
foreach ($m in $matches) {
    Write-Host ($m.LineNumber.ToString() + ": " + $m.Line.Trim())
}
