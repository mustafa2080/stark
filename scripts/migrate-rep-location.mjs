// Migration: Add lastLat, lastLng, lastLocationAt columns to users (representative live location)
import mysql from "mysql2/promise";

const pool = mysql.createPool(process.env.DATABASE_URL);

async function migrate() {
  const conn = await pool.getConnection();
  try {
    for (const col of [
      "ALTER TABLE users ADD COLUMN last_lat DECIMAL(10,7) NULL",
      "ALTER TABLE users ADD COLUMN last_lng DECIMAL(10,7) NULL",
      "ALTER TABLE users ADD COLUMN last_location_at DATETIME NULL",
    ]) {
      await conn.execute(col).catch(e => {
        if (e.code === "ER_DUP_FIELDNAME") {
          console.log("Column already exists, skipping:", col);
        } else {
          throw e;
        }
      });
    }
    console.log("✅ Migration done: last_lat, last_lng, last_location_at added to users");
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(err => { console.error("Migration failed:", err); process.exit(1); });
