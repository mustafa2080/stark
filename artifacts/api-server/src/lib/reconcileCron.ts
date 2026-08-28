import { db, shipmentsTable, clientAccountManifestItemsTable, shipmentManifestItemsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { SHIPMENT_STATUS_TO_DELIVERY } from "./manifestSync.js";

/**
 * reconcileManifestStatuses — مهمة دورية تراجع تطابق الحالات
 *
 * المشكلة: مزامنة الحالات (manifestSync.ts) بتحصل جوه نفس الـ request، لكن لو
 * فشلت لأي سبب تقني الخطأ بيتسجل في اللوج بس والعملية الأساسية بتكمل — فيمكن
 * يحصل عدم تزامن صامت: الشحنة "مُسلَّمة" عند المندوب لكن بند البيان لسه "قيد الانتظار".
 *
 * الحل: الفحص الدوري ده بيعتبر shipmentsTable.status هو مصدر الحقيقة (لأن كل
 * مسارات التحديث بتمر به أولاً) ويصلّح أي انحراف في deliveryStatus الخاص ببنود:
 *   1) بيان حساب العميل (client_account_manifest_items)
 *   2) بيان شركة الشحن / المندوب (shipment_manifest_items) — بنفس الحماية:
 *      بنسيب أي بند حالته "postponed" أو "delayed" (اختيار يدوي من المندوب/الأدمن
 *      لتأجيل الشحنة عن قصد، والـ mapping العام مش بيميزه عن حالات shipments.status
 *      التانية زي in_transit/warehouse_ready) عشان منمسحش اختيار المستخدم.
 *
 * ⚠️ إصلاح (2026-08-28): "delayed" كان ناقص من قائمة الحماية دي، فأي شحنة
 * اتأجّلت يدويًا (deliveryStatus = "delayed") كانت بترجع تلقائيًا لـ "pending"
 * أول ما shipments.status يتغيّر لأي حالة تانية (زي in_transit) — حتى لو محدّش
 * عدّل بند البيان نفسه يدويًا. ده كان بيسبب فرق في "الرصيد المستحق" بين صفحة
 * البيان الفردي (اتحسبت وقت ما كانت لسه delayed) ورصيد العميل الإجمالي (اتحسب
 * بعد ما الـ cron قلبها pending بصمت).
 *
 * ملاحظات مهمة:
 * - بنلمس deliveryStatus و deliveredAt فقط — مفيش أي حقول مالية (القيم المستلمة
 *   إدخالات يدوية من المندوب مش بتُشتق من الحالة).
 */

const MANUAL_PROTECTED_STATUSES = ["postponed", "delayed"] as const;

// شرط SQL: الحالة الفعلية للشحنة ليها mapping معروف، والبند مختلف عنه،
// والبند مش من الحالات المحمية (اختيار يدوي من المندوب/الأدمن)
function mismatchCondition(itemStatusColumn: typeof clientAccountManifestItemsTable.deliveryStatus | typeof shipmentManifestItemsTable.deliveryStatus) {
  const colName = itemStatusColumn === clientAccountManifestItemsTable.deliveryStatus
    ? "client_account_manifest_items.delivery_status"
    : "shipment_manifest_items.delivery_status";
  const caseExpr =
    "CASE shipments.status " +
    Object.entries(SHIPMENT_STATUS_TO_DELIVERY)
      .map(([s, d]) => `WHEN '${s}' THEN '${d}'`)
      .join(" ") +
    ` ELSE ${colName} END`;
  return and(
    isNull(shipmentsTable.deletedAt),
    sql`${itemStatusColumn} NOT IN (${sql.join(MANUAL_PROTECTED_STATUSES.map(s => sql`${s}`), sql`, `)})`,
    sql`${itemStatusColumn} <> ${sql.raw(caseExpr)}`,
  );
}

async function reconcileTable(
  table: typeof clientAccountManifestItemsTable | typeof shipmentManifestItemsTable,
  label: string,
): Promise<number> {
  const statusCol = table.deliveryStatus;
  const mismatched = await db
    .select({
      itemId:         table.id,
      shipmentId:     table.shipmentId,
      itemStatus:     statusCol,
      shipmentStatus: shipmentsTable.status,
    })
    .from(table)
    .innerJoin(shipmentsTable, eq(table.shipmentId, shipmentsTable.id))
    .where(mismatchCondition(statusCol))
    .limit(500);

  let fixed = 0;
  for (const row of mismatched) {
    const expected = SHIPMENT_STATUS_TO_DELIVERY[row.shipmentStatus];
    if (!expected || expected === row.itemStatus) continue;

    const now = new Date();
    await db
      .update(table)
      .set({
        deliveryStatus: expected,
        ...(expected === "delivered" || expected === "partial_delivered" ? { deliveredAt: now } : {}),
      })
      .where(eq(table.id, row.itemId));
    fixed++;

    console.warn(
      `[ReconcileCron] 🔧 [${label}] shipment #${row.shipmentId} — البند كان "${row.itemStatus}" والحالة الفعلية "${row.shipmentStatus}" → اتظبطت لـ "${expected}"`
    );
  }
  return fixed;
}

export async function runManifestReconciliation(): Promise<void> {
  const started = Date.now();

  try {
    const clientFixed  = await reconcileTable(clientAccountManifestItemsTable, "بيان عميل");
    const repFixed     = await reconcileTable(shipmentManifestItemsTable, "بيان مندوب");

    if (clientFixed === 0 && repFixed === 0) {
      console.log(`[ReconcileCron] ✅ مفيش أي عدم تطابق (${Date.now() - started}ms)`);
    } else {
      console.log(
        `[ReconcileCron] 🕐 انتهى الفحص: ${clientFixed} بيان عميل + ${repFixed} بيان مندوب اتصلّحوا (${Date.now() - started}ms)`
      );
    }
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
