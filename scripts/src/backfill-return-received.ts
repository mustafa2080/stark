/**
 * backfill-return-received.ts
 * (بطلب مصطفى 2026-09-12) — فيكس تلقائي في الكود (PUT/PATCH /shipments/:id)
 * بيمسح assignedUserId/shippingCompanyId بس لما returnReceived "يتحول" لـ 1
 * *من الآن فصاعدًا*. الشحنات اللي كانت already returnReceived=1 قبل الديبلوي
 * (زي شحنة الحاج هشام أبو الفتوح) هتفضل عالقة لأن الشرط existingShipment.returnReceived
 * !== 1 مبيتفعّلش تاني ليها. الاسكريبت ده بيصلح الداتا القديمة مرة واحدة بس.
 *
 * تشغيل: npx tsx scripts/src/backfill-return-received.ts
 * (dry-run افتراضي — يطبع بس. شغله بـ --apply عشان يعدل فعليًا)
 */
import "dotenv/config";
import { db, shipmentsTable } from "@workspace/db";
import { and, eq, isNotNull, or } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");

  const affected = await db
    .select({
      id: shipmentsTable.id,
      shipmentNumber: shipmentsTable.shipmentNumber,
      status: shipmentsTable.status,
      assignedUserId: shipmentsTable.assignedUserId,
      shippingCompanyId: shipmentsTable.shippingCompanyId,
    })
    .from(shipmentsTable)
    .where(and(
      eq(shipmentsTable.returnReceived, 1),
      or(isNotNull(shipmentsTable.assignedUserId), isNotNull(shipmentsTable.shippingCompanyId)),
    ));

  console.log(`\n=== شحنات returnReceived=1 لسه مربوطة بمندوب/شركة شحن: ${affected.length} ===\n`);
  for (const s of affected) {
    console.log(JSON.stringify(s));
  }

  if (!apply) {
    console.log("\n(dry-run) — مفيش تعديل اتعمل. شغل بـ --apply عشان تنفّذ فعليًا.");
    return;
  }

  if (affected.length === 0) {
    console.log("\nمفيش حاجة تتصلح.");
    return;
  }

  for (const s of affected) {
    await db.update(shipmentsTable)
      .set({ assignedUserId: null, shippingCompanyId: null })
      .where(eq(shipmentsTable.id, s.id));
  }
  console.log(`\n✅ تم تصليح ${affected.length} شحنة.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
