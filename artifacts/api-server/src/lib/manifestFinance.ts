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
): Promise<{ gross: number; net: number }> {
  // جيب الشحنات لمعرفة سعر كل شحنة
  const shipmentIds = items.map(i => i.shipmentId);
  const shipments = shipmentIds.length > 0
    ? await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds))
    : [];
  const shipmentMap = new Map(shipments.map(s => [s.id, s]));

  // جيب شركة الشحن (احتياطي بس لو الشحنة مفيهاش shippingFee مسجل)
  const [company] = manifest.shippingCompanyId != null
    ? await db.select().from(shippingCompaniesTable)
        .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId))
    : [];
  const courierCostPerShipment = Math.abs(Number(company?.shippingCost ?? 0));

  // نفس الأسباب المالية المستخدمة في عرض إحصائيات البيان (RETURN_REASONS_IN_PNL بالفرونت)
  // — لازم تفضل متطابقة، لأن المرتجع بالأسباب دي بيرجّع فلوس فعلية من المندوب
  const RETURN_REASONS_IN_PNL = ["refused_paid", "refused_unpaid", "quality"];

  let deliveredGross = 0;
  let courierCostManual = 0;

  for (const item of items) {
    const shipment = shipmentMap.get(item.shipmentId);
    if (!shipment) continue;
    // السعر الكامل للشحنة المسلَّمة = totalAmount (codAmount + shippingFee)، مش codAmount
    // لوحده — نفس totalPrice المستخدم في deliveredCOD بالفرونت بالظبط.
    const price = Number((shipment as any).totalAmount ?? (Number((shipment as any).codAmount ?? 0) + Number(shipment.shippingFee ?? 0)));
    // تكلفة شحن الشحنة الواحدة = عمود الشحن الفعلي المكتوب عليها (shippingFee) —
    // مش سعر ثابت مضروب في العدد. لو الشحنة مفيهاش shippingFee مسجل (صفر/فاضي)،
    // بنرجع لسعر الشركة الثابت كاحتياطي بس.
    const shipmentShippingFee = Number(shipment.shippingFee ?? 0) > 0
      ? Number(shipment.shippingFee)
      : courierCostPerShipment;

    if (item.deliveryStatus === "delivered") {
      // القيمة الفعلية المستلمة لو المندوب دخلها (زيادة أو نقص)، وإلا السعر العادي
      const dvr = (item as any).deliveredValueReceived;
      deliveredGross += dvr != null ? Number(dvr) : price;
      courierCostManual += shipmentShippingFee;
    } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
      // partialQuantity هنا قيمة مالية فعلية أدخلها المندوب (مش عدد قطع) — تُستخدم كما هي
      deliveredGross += Number(item.partialQuantity);
      courierCostManual += shipmentShippingFee;
    } else if (item.deliveryStatus === "partial_received") {
      // إشعار "باقي مرتجع من استلام جزئي" مُرحَّل من بيان قديم. بيدخل في تكلفة
      // الشحن دايمًا، لكن بياخد قيمة مالية بس لو اتأكد استلامه فعليًا من شركة
      // الشحن في البيان ده نفسه (returnReceived === 1) — نفس شرط الفرونت بالظبط
      // (isStillAtShipping/isReceivedBack) في تفاصيل البيان.
      courierCostManual += shipmentShippingFee;
      const rr = (shipment as any).returnReceived;
      const isReceivedBack = rr === 1 || rr === true || rr === "1";
      if (isReceivedBack && item.partialQuantity != null) {
        // partialQuantity هنا قيمة مالية فعلية (زي unitPrice بالفرونت = codAmount + shippingFee)
        const unitPriceEquivalent = Number((shipment as any).codAmount ?? (shipment as any).totalAmount ?? 0) + Number(shipment.shippingFee ?? 0);
        deliveredGross += unitPriceEquivalent * Number(item.partialQuantity);
      }
    } else if (item.deliveryStatus === "returned" && RETURN_REASONS_IN_PNL.includes((item as any).returnReason)) {
      // مرتجع بسبب مالي (رفض بالدفع / جودة): القيمة اللي استلمها المندوب فعليًا من العميل
      // — بتدخل في تكلفة الشحن برضه زي الفرونت بالظبط
      deliveredGross += Number((item as any).returnValueReceived ?? 0);
      courierCostManual += shipmentShippingFee;
    }
    // delayed / pending / مرتجع بأسباب أخرى → مش بيتحسب خالص (لا إيراد ولا تكلفة شحن)
  }

  // الصافي المستحق من المندوب (COD المسلَّم − مجموع عمود الشحن الفعلي للشحنات المؤهلة)
  return { gross: deliveredGross, net: deliveredGross - courierCostManual };
}
