USE caprina;
SELECT id, shipmentNumber, shippingFee, codAmount, status
FROM shipments
WHERE id IN (SELECT shipmentId FROM client_account_manifest_items WHERE manifestId = 9)
LIMIT 15;
