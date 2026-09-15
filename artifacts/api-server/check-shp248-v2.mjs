import mysql from "file:///C:/Users/musta/Desktop/pro/stark/stark/node_modules/.pnpm/mysql2@3.22.1_@types+node@25.3.5/node_modules/mysql2/promise.js";

const conn = await mysql.createConnection("mysql://root:123456@localhost:3306/stark_dev");

const [shipment] = await conn.execute("SELECT id, shipment_number, status FROM shipments WHERE id = 248");
console.log("SHIPMENT:", shipment);

const [items] = await conn.execute(
  `SELECT cami.manifest_id, cam.manifest_number, cam.status AS manifest_status, cam.client_id,
          cami.shipment_id, cami.delivery_status, cami.return_reason, cami.return_received,
          cami.delivered_value_received, cami.added_at
   FROM client_account_manifest_items cami
   JOIN client_account_manifests cam ON cam.id = cami.manifest_id
   WHERE cami.shipment_id = 248
   ORDER BY cami.manifest_id`
);
console.log("MANIFEST ITEMS:", items);

await conn.end();
