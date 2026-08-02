import { eq, inArray } from "drizzle-orm";
import {
  db,
  shipmentManifestsTable,
  shipmentManifestItemsTable,
  shipmentsTable,
  shippingCompaniesTable,
} from "@workspace/db";

// ─── حساب صافي المستحق من بيان معين (نفس منطق netDueToCompany) ──────────────
// مستخرجة كدالة مشتركة (بدل تكرارها في shipment-manifests.ts و representative.ts)
// عشان تُستخدم في: تحويل الخزنة (createTreasuryEntryOnClose)، تصفية محفظة
// المندوب (recordRepresentativeWalletEntry)، وحساب الرصيد الحالي غير المُقفل
// بعد في /representative/wallet — لازم تفضل الثلاثة متطابقة تمامًا في المنطق.
export async function computeManifestNetDue(
  manifest: typeof shipmentManifestsTable.$inferSelect,
  items: (typeof shipmentManifestItemsTable.$inferSelect)[],
): Promise<number> {
  // جيب الشحنات لمعرفة سعر كل شحنة
  const shipmentIds = items.map(i => i.shipmentId);
  const shipments = shipmentIds.length > 0
    ? await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds))
    : [];
  const shipmentMap = new Map(shipments.map(s => [s.id, s]));

  // جيب شركة الشحن عشان تكلفة المندوب لكل شحنة (courierCostPerShipment)
  const [company] = manifest.shippingCompanyId != null
    ? await db.select().from(shippingCompaniesTable)
        .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId))
    : [];
  const courierCostPerShipment = Math.abs(Number(company?.shippingCost ?? 0));

  // نفس الأسباب المالية المستخدمة في عرض إحصائيات البيان (RETURN_REASONS_IN_PNL بالفرونت)
  // — لازم تفضل متطابقة، لأن المرتجع بالأسباب دي بيرجّع فلوس فعلية من المندوب
  const RETURN_REASONS_IN_PNL = ["refused_paid", "refused_unpaid", "quality"];

  let deliveredGross = 0;
  let deliveredCount = 0;

  for (const item of items) {
    const shipment = shipmentMap.get(item.shipmentId);
    if (!shipment) continue;
    const price = Number((shipment as any).codAmount ?? (shipment as any).totalAmount ?? shipment.shippingFee ?? 0);

    if (item.deliveryStatus === "delivered") {
      // القيمة الفعلية المستلمة لو المندوب دخلها (زيادة أو نقص)، وإلا السعر العادي
      const dvr = (item as any).deliveredValueReceived;
      deliveredGross += dvr != null ? Number(dvr) : price;
      deliveredCount += 1;
    } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
      // partialQuantity هنا قيمة مالية فعلية أدخلها المندوب (مش عدد قطع) — تُستخدم كما هي
      deliveredGross += Number(item.partialQuantity);
      deliveredCount += 1;
    } else if (item.deliveryStatus === "partial_received") {
      // إشعار "باقي مرتجع من استلام جزئي" مُرحَّل من بيان قديم — بدون قيمة مالية
      // (زي المرتجع العادي)، فمفيش تحويل للخزنة عليه. الجزء المسلَّم الفعلي
      // اتحسب أصلًا وقت إغلاق البيان القديم على السجل الأصلي.
    } else if (item.deliveryStatus === "returned" && RETURN_REASONS_IN_PNL.includes((item as any).returnReason)) {
      // مرتجع بسبب مالي (رفض بالدفع / جودة): القيمة اللي استلمها المندوب فعليًا من العميل
      deliveredGross += Number((item as any).returnValueReceived ?? 0);
      deliveredCount += 1;
    }
    // delayed / pending / مرتجع بأسباب أخرى → مش بيتحسب
  }

  // الصافي المستحق من المندوب (COD المسلَّم − تكلفة شحن المندوب)
  const courierCostManual = courierCostPerShipment * deliveredCount;
  return deliveredGross - courierCostManual;
}
