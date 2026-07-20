// Diagnostic (read-only): inspect manifests + items to find why today-tasks is empty
import mysql from "mysql2/promise";

const pool = mysql.createPool(process.env.DATABASE_URL);
const companyId = process.argv[2] ? parseInt(process.argv[2]) : null;

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("=== Manifests (latest 15", companyId ? `for companyId=${companyId}` : "all companies", ") ===");
    const [manifests] = await conn.execute(
      companyId
        ? "SELECT id, shipping_company_id, status, created_at FROM shipment_manifests WHERE shipping_company_id = ? ORDER BY id DESC LIMIT 15"
        : "SELECT id, shipping_company_id, status, created_at FROM shipment_manifests ORDER BY id DESC LIMIT 15",
      companyId ? [companyId] : []
    );
    console.table(manifests);

    const manifestIds = manifests.map(m => m.id);
    if (manifestIds.length === 0) {
      console.log("لا توجد بيانات (manifests) أصلاً.");
      return;
    }

    console.log("\n=== Delivery status breakdown for items in these manifests ===");
    const placeholders = manifestIds.map(() => "?").join(",");
    const [statusBreakdown] = await conn.execute(
      `SELECT manifest_id, delivery_status, COUNT(*) as cnt
       FROM shipment_manifest_items
       WHERE manifest_id IN (${placeholders})
       GROUP BY manifest_id, delivery_status
       ORDER BY manifest_id DESC`,
      manifestIds
    );
    console.table(statusBreakdown);

    const openManifestIds = manifests.filter(m => m.status === "open").map(m => m.id);
    console.log("\nBيانات مفتوحة (status=open):", openManifestIds.length ? openManifestIds.join(", ") : "لا يوجد");

    if (openManifestIds.length > 0) {
      const openPlaceholders = openManifestIds.map(() => "?").join(",");
      const [activeCount] = await conn.execute(
        `SELECT COUNT(*) as active_count FROM shipment_manifest_items
         WHERE manifest_id IN (${openPlaceholders})
         AND delivery_status IN ('pending','delayed','partial_delivered')`,
        openManifestIds
      );
      console.log("عدد الـ items النشطة (pending/delayed/partial_delivered) في البيانات المفتوحة:", activeCount[0].active_count);
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => { console.error("Diagnostic failed:", err); process.exit(1); });
