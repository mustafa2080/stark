/**
 * investigate-manifest149.ts
 * تحقيق: فرق 30 ج.م بين "الرصيد المستحق" في صفحة البيان (9,440) وكشف
 * حساب العميل (9,410) — العميل JESY، بيان CAM-101-001 (id=149)
 * npx tsx scripts/investigate-manifest149.ts
 */
import { db, clientAccountManifestItemsTable, shipmentsTable, shipmentZonesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const items = await db.select().from(clientAccountManifestItemsTable)
    .where(eq(clientAccountManifestItemsTable.manifestId, 149));

  const shipmentIds = items.map(i => i.shipmentId);
  const shipments = await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds));
  const shipMap = Object.fromEntries(shipments.map(s => [s.id, s]));

  const zoneIds = [...new Set(shipments.map(s => s.zoneId).filter((v): v is number => !!v))];
  const zones = zoneIds.length ? await db.select().from(shipmentZonesTable).where(inArray(shipmentZonesTable.id, zoneIds)) : [];
  const zoneMap = Object.fromEntries(zones.map(z => [z.id, z]));

  console.log("=== بنود بيان CAM-101-001 (id=149) ===\n");
  for (const it of items) {
    const sh = shipMap[it.shipmentId];
    console.log(JSON.stringify({
      shipmentId: it.shipmentId,
      itemDeliveryStatus: it.deliveryStatus,
      shipmentStatus: sh?.status,
      returnReason: it.returnReason ?? (sh as any)?.returnReason,
      partialQuantity: it.partialQuantity,
      deliveredValueReceived: it.deliveredValueReceived,
      returnValueReceived: it.returnValueReceived,
      returnReceived: it.returnReceived,
      codAmount: sh?.codAmount,
      totalAmount: (sh as any)?.totalAmount,
      shippingFee: (sh as any)?.shippingFee,
      zoneId: sh?.zoneId,
      zonePriceNormal: sh?.zoneId ? zoneMap[sh.zoneId]?.priceNormal : null,
      zonePriceCommercial: sh?.zoneId ? zoneMap[sh.zoneId]?.priceCommercial : null,
      zonePrice: sh?.zoneId ? zoneMap[sh.zoneId]?.price : null,
      parcelType: sh?.parcelType,
      shippingCompanyId: (sh as any)?.shippingCompanyId,
    }, null, 0));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
