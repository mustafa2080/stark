import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [shipRows] = await conn.query(
  "SELECT id, shipment_number, status, notes, updated_at FROM shipments WHERE shipment_number = ?",
  ["SHP26080288"]
);
console.log("--- shipments ---");
console.log(JSON.stringify(shipRows, null, 2));

if (shipRows.length) {
  const shipmentId = shipRows[0].id;
  const [itemRows] = await conn.query(
    "SELECT id, manifest_id, shipment_id, delivery_status, delivery_note, added_at FROM shipment_manifest_items WHERE shipment_id = ?",
    [shipmentId]
  );
  console.log("--- shipment_manifest_items ---");
  console.log(JSON.stringify(itemRows, null, 2));
}

await conn.end();
