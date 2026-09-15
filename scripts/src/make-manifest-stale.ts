/**
 * make-manifest-stale.ts
 * يلاقي بيان شحن مفتوح (open) لأي شركة شحن، ويعدّل created_at بتاعه ليكون
 * أقدم من 72 ساعة — عشان نختبر بانر "بيان مفتوح من أكتر من 72 ساعة" في /shipping.
 * لو مفيش بيان مفتوح خالص، بينشئ واحد جديد لأول شركة شحن موجودة.
 *
 * npx tsx scripts/src/make-manifest-stale.ts
 */
import { db, shippingManifestsTable, shippingCompaniesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  // دور على أي بيان مفتوح حاليًا
  const openManifests = await db
    .select()
    .from(shippingManifestsTable)
    .where(eq(shippingManifestsTable.status, "open"));

  const staleDate = new Date(Date.now() - 80 * 60 * 60 * 1000); // 80 ساعة (أكتر من 72)

  if (openManifests.length > 0) {
    const target = openManifests[0];
    await db
      .update(shippingManifestsTable)
      .set({ createdAt: staleDate })
      .where(eq(shippingManifestsTable.id, target.id));

    console.log("=== تم تعديل بيان موجود ===");
    console.log(JSON.stringify({
      id: target.id,
      manifestNumber: target.manifestNumber,
      shippingCompanyId: target.shippingCompanyId,
      oldCreatedAt: target.createdAt,
      newCreatedAt: staleDate,
    }, null, 2));
  } else {
    // مفيش بيان مفتوح، نجيب أول شركة شحن وننشئ بيان جديد
    const companies = await db.select().from(shippingCompaniesTable).limit(1);
    if (companies.length === 0) {
      console.error("لا توجد أي شركة شحن (representative) في قاعدة البيانات لإنشاء بيان لها.");
      process.exit(1);
    }
    const company = companies[0];
    const [inserted] = await db.insert(shippingManifestsTable).values({
      tenantId: company.tenantId,
      manifestNumber: `TEST-STALE-${Date.now()}`,
      shippingCompanyId: company.id,
      status: "open",
      createdAt: staleDate,
    });

    console.log("=== تم إنشاء بيان جديد قديم ===");
    console.log(JSON.stringify({
      insertId: (inserted as any).insertId,
      shippingCompanyId: company.id,
      shippingCompanyName: company.name,
      createdAt: staleDate,
    }, null, 2));
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
