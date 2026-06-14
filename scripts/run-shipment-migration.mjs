import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_URL = "mysql://u144001284_caprina:Capitan@123456@lavender-armadillo-743548.hostingersite.com:3306/u144001284_caprina";

async function run() {
  const conn = await mysql.createConnection(DB_URL);
  console.log("✅ اتصلنا بالـ DB");

  const sql = readFileSync(join(__dirname, "add-shipment-manifests.sql"), "utf8");
  const stmts = sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 10 && !s.startsWith("--"));

  for (const stmt of stmts) {
    try {
      await conn.execute(stmt);
      console.log("✅", stmt.slice(0, 70).replace(/\n/g, " "));
    } catch (e) {
      if (e.code === "ER_TABLE_EXISTS_ERROR") {
        console.log("⚠️  موجود بالفعل:", stmt.slice(0, 50));
      } else {
        console.error("❌ خطأ:", e.message);
      }
    }
  }

  await conn.end();
  console.log("\n✅ الـ migration اتنفذ!");
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
