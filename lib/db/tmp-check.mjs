import fs from "fs";
import mysql from "mysql2/promise";

const envText = fs.readFileSync(new URL("../../.env", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  `SELECT id, manifest_number, status, client_id, tenant_id, closed_at, created_at
   FROM client_account_manifests WHERE manifest_number = 'CAM-61-001'`
);
console.log("MANIFEST:", JSON.stringify(rows, null, 2));
await conn.end();
