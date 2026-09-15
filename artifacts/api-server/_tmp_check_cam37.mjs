import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  `SELECT cami.*, s.tracking_number, s.order_total
   FROM client_account_manifest_items cami
   JOIN shipments s ON s.id = cami.shipment_id
   WHERE cami.manifest_id = 37`
);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
