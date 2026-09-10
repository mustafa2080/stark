/**
 * investigate-manifest243.ts
 * تحقيق: الفرق بين عدد الأوردرات في القائمة (list) وتفاصيل البيان (detail)
 * للعميل 115 / المانيفست id=243
 * npx tsx scripts/investigate-manifest243.ts
 */
import { db, clientAccountManifestItemsTable, clientAccountManifestsTable, shipmentsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { isShipmentVisibleInManifest } from "../../artifacts/api-server/src/lib/manifestSync.js";

async function main() {
  const manifest = await db.select().from(clientAccountManifestsTable)
    .where(eq(clientAccountManifestsTable.id, 243));
  console.log("=== المانيفست 243 ===");
  console.log(JSON.stringify(manifest, null, 0));

  const items = await db.select().from(clientAccountManifestItemsTable)
    .where(eq(clientAccountManifestItemsTable.manifestId, 243));

  console.log(`\n=== بنود clientAccountManifestItemsTable للمانيفست 243 (عدد: ${items.length}) ===\n`);

  const shipmentIds = items.map(i => i.shipmentId);
  const shipments = shipmentIds.length
    ? await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds))
    : [];
  const shipMap = Object.fromEntries(shipments.map(s => [s.id, s]));

  for (const it of items) {
    const sh = shipMap[it.shipmentId];
    console.log(JSON.stringify({
      itemId: it.id,
      shipmentId: it.shipmentId,
      itemDeliveryStatus: it.deliveryStatus,
      itemDeletedAt: (it as any).deletedAt,
      shipmentExists: !!sh,
      shipmentStatus: sh?.status,
      shipmentDeletedAt: (sh as any)?.deletedAt,
      isVisibleInDetail: sh ? isShipmentVisibleInManifest(sh.status) : null,
    }, null, 0));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
