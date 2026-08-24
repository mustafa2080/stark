import { db, shipmentsTable, clientAccountManifestItemsTable } from "@workspace/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { SHIPMENT_STATUS_TO_DELIVERY } from "./manifestSync.js";

/**
 * reconcileManifestStatuses — مهمة دورية تراجع تطابق الحالات
 *
 * المشكلة: مزامنة الحالات (manifestSync.ts) بتحصل جوه نفس الـ request، لكن لو
 * فشلت لأي سبب تقني الخطأ بيتسجل في اللوج بس والعملية الأساسية بتكمل — فيمكن
 * يحصل عدم تزامن صامت: الشحنة "مُسلَّمة" عند المندوب لكن بند البيان لسه "قيد الانتظار".
 *
 * الحل: الفحص الدوري ده بيعتبر shipmentsTable.status هو مصدر الحقيقة (لأن كل
 * مسارات التحديث بتمر به أولاً) ويصلّح أي انحراف في deliveryStatus الخاص
 * ببنود بيان حساب العميل.
 *
 * ملاحظات مهمة:
 * - بنلمس deliveryStatus و deliveredAt فقط — مفيش أي حقول مالية (القيم المستلمة
 *   إدخالات يدوية من المندوب مش بتُشتق من الحالة).
 * - بيان شركة الشحن (shipment_manifest_items) متعمد عدم لمسه هنا لأنه عنده
 *   قيمة "postponed" خاصة بيها الـ mapping العام مش بيميزها، وأي فرض عليها
 *   هيمسح اختيار المستخدم (نفس سبب skipShipmentManifestItems في manifestSync).
 */

export async function runManifestReconciliation(): Promise<void> {
  const started = Date.now();

  try {
    // كل بنود بيانات العملاء اللي حالتها مختلفة عن حالة شحنتها الأصلية.
    // ne على SQL مباشر بين عمودين — بنستخدم raw condition عبر sql.
    const mismatched = await db
      .select({
        itemId:         clientAccountManifestItemsTable.id,
        shipmentId:     clientAccountManifestItemsTable.shipmentId,
        itemStatus:     clientAccountManifestItemsTable.deliveryStatus,
        shipmentStatus: shipmentsTable.status,
      })
      .from(clientAccountManifestItemsTable)
      .innerJoin(shipmentsTable, eq(clientAccountManifestItemsTable.shipmentId, shipmentsTable.id))
      .where(and(
        isNull(shipmentsTable.deletedAt),
        // البند حالته موجودة في الـ mapping وحالة الشحنة كمان معروفة — والاتنين مختلفين فعلاً
        sql`${clientAccountManifestItemsTable.deliveryStatus} <> ${sql.raw(
          "CASE shipments.status " +
          Object.entries(SHIPMENT_STATUS_TO_DELIVERY)
            .map(([s, d]) => `WHEN '${s}' THEN '${d}'`)
            .join(" ") +
          " ELSE client_account_manifest_items.delivery_status END"
        )}`,
      ))
      .limit(500);

    if (!mismatched.length) {
      console.log(`[ReconcileCron] ✅ مفيش أي عدم تطابق (${Date.now() - started}ms)`);
      return;
    }

    let fixed = 0;
    for (const row of mismatched) {
      const expected = SHIPMENT_STATUS_TO_DELIVERY[row.shipmentStatus];
      if (!expected || expected === row.itemStatus) continue;

      const now = new Date();
      await db
        .update(clientAccountManifestItemsTable)
        .set({
          deliveryStatus: expected,
          ...(expected === "delivered" || expected === "partial_delivered" ? { deliveredAt: now } : {}),
        })
        .where(eq(clientAccountManifestItemsTable.id, row.itemId));
      fixed++;

      console.warn(
        `[ReconcileCron] 🔧 اتصلّحت: shipment #${row.shipmentId} — البند كان "${row.itemStatus}" والحالة الفعلية "${row.shipmentStatus}" → اتظبطت لـ "${expected}"`
      );
    }

    console.log(
      `[ReconcileCron] 🕐 انتهى الفحص: ${mismatched.length} عدم تطابق، ${fixed} اتصلّحوا (${Date.now() - started}ms)`
    );
  } catch (err) {
    console.error("[ReconcileCron] ❌ فشل الفحص:", err);
  }
}

/**
 * startReconciliationCron — يشتغل كل 10 دقايق
 * يستدعيها مرة واحدة في app.ts
 */
export function startReconciliationCron(): void {
  const MS_PER_10MIN = 10 * 60 * 1000;

  // أول فحص بعد دقيقة من الإقلاع (نسيب السيرفر يخلص boot الأول)
  setTimeout(() => {
    runManifestReconciliation();
    setInterval(runManifestReconciliation, MS_PER_10MIN);
  }, 60 * 1000);

  console.log("[ReconcileCron] ✅ تم تشغيل cron تسوية الحالات — يفحص كل 10 دقايق");
}
