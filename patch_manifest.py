import sys

path = r'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\shipping-manifest.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# ── Fix 1: Add isShipmentManifest prop to OrderDeliveryRow ──────────────────
old1 = """function OrderDeliveryRow({
  order,
  manifestId,
  locked,
  onSaved,
  hideAction = false,
}: {
  order: ManifestOrder;
  manifestId: number;
  locked: boolean;
  onSaved: () => void;
  hideAction?: boolean;
})"""

new1 = """function OrderDeliveryRow({
  order,
  manifestId,
  locked,
  onSaved,
  hideAction = false,
  isShipmentManifest = false,
}: {
  order: ManifestOrder;
  manifestId: number;
  locked: boolean;
  onSaved: () => void;
  hideAction?: boolean;
  isShipmentManifest?: boolean;
})"""

if old1 not in c:
    print("ERROR fix1 not found"); sys.exit(1)
c = c.replace(old1, new1, 1)
print("fix1 OK")

# ── Fix 2: Replace the mutationFn call - updateOrderDelivery → conditional ───
old2 = """      return manifestsApi.updateOrderDelivery(manifestId, order.id, {
        deliveryStatus: status,
        deliveryNote: finalNote,
        partialQuantity:
          status === "partial_received" && partialQty !== "" && partialQty !== null && partialQty !== undefined
            ? parseInt(partialQty)
            : null,
        ...(status === "returned" ? { returnReceived } : {}),
        ...(status === "returned" ? { returnReason: returnReason || null } : {}),
        ...(status === "partial_received" ? { partialReturnReceived } : {}),
      });"""

new2 = """      if (isShipmentManifest) {
        // shipment manifests: only deliveryStatus, deliveryNote, returnReceived supported
        const allowed = ["pending","delivered","returned","delayed"] as const;
        const safeStatus = allowed.includes(status as any) ? status as "pending"|"delivered"|"returned"|"delayed" : "pending";
        return shipmentManifestsApi.updateItem(manifestId, order.id, {
          deliveryStatus: safeStatus,
          deliveryNote: finalNote,
          returnReceived: status === "returned" ? returnReceived : null,
        });
      }
      return manifestsApi.updateOrderDelivery(manifestId, order.id, {
        deliveryStatus: status,
        deliveryNote: finalNote,
        partialQuantity:
          status === "partial_received" && partialQty !== "" && partialQty !== null && partialQty !== undefined
            ? parseInt(partialQty)
            : null,
        ...(status === "returned" ? { returnReceived } : {}),
        ...(status === "returned" ? { returnReason: returnReason || null } : {}),
        ...(status === "partial_received" ? { partialReturnReceived } : {}),
      });"""

if old2 not in c:
    print("ERROR fix2 not found"); sys.exit(1)
c = c.replace(old2, new2, 1)
print("fix2 OK")

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print("DONE")
