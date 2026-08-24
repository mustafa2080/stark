import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [manifests] = await conn.query(
  "SELECT * FROM client_account_manifests WHERE manifest_number = ?",
  ["CAM-7-002"]
);
console.log("=== MANIFEST ===");
console.log(JSON.stringify(manifests, null, 2));

if (manifests.length) {
  const id = manifests[0].id;
  const [items] = await conn.query(
    "SELECT * FROM client_account_manifest_items WHERE manifest_id = ?",
    [id]
  );
  console.log("=== ITEMS ===");
  console.log(JSON.stringify(items, null, 2));
}

await conn.end();
