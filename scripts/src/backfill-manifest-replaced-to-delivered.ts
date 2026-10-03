/**
 * backfill-manifest-replaced-to-delivered.ts
 *
 * Shipment manifest items used to be stored with delivery_status = 'replaced' /
 * 'parcel_picked', which the manifest financial calculations ignore (no revenue,
 * no shipping cost). These items must be stored as 'delivered'; the specific
 * state stays in shipments.status + shipments.shipment_kind.
 *
 * Usage: npx tsx scripts/src/backfill-manifest-replaced-to-delivered.ts
 * (dry-run by default; add --apply to write changes)
 */
import "dotenv/config";
import { db, shipmentManifestItemsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");

  const affected = await db
    .select({
      id: shipmentManifestItemsTable.id,
      manifestId: shipmentManifestItemsTable.manifestId,
      shipmentId: shipmentManifestItemsTable.shipmentId,
      deliveryStatus: shipmentManifestItemsTable.deliveryStatus,
    })
    .from(shipmentManifestItemsTable)
    .where(inArray(shipmentManifestItemsTable.deliveryStatus, ["replaced", "parcel_picked"]));

  console.log(`\n=== manifest items stored as replaced/parcel_picked: ${affected.length} ===\n`);
  for (const r of affected) console.log(JSON.stringify(r));

  if (!apply) {
    console.log("\n(dry-run) nothing changed. Add --apply to write.");
    return;
  }
  if (affected.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  for (const r of affected) {
    await db.update(shipmentManifestItemsTable)
      .set({ deliveryStatus: "delivered" })
      .where(eq(shipmentManifestItemsTable.id, r.id));
  }
  console.log(`\nUpdated ${affected.length} items.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
