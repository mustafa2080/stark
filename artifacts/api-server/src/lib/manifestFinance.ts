import { eq, inArray } from "drizzle-orm";
import {
  db,
  shipmentManifestsTable,
  shipmentManifestItemsTable,
  shipmentsTable,
  shippingCompaniesTable,
  zoneCostsTable,
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

  // جيب شركة الشحن بتاعة البيان: costMode بيحدد طريقة حساب تكلفة كل شحنة —
  //   "rep"  → سعر ثابت واحد لكل شحنة (company.shippingCost)
  //   "zone" → سعر تكلفة منطقة الشحنة الفعلي (zone_costs.deliveryCost حسب zoneId)
  // نفس المنطق بالظبط المستخدم في الفرونت (getShipmentShippingCost بصفحة تفاصيل
  // بيان المندوب) وفي client-account-manifests.ts (getZoneCost) — لازم تفضل الثلاثة متطابقة.
  const [company] = manifest.shippingCompanyId != null
    ? await db.select({
        costMode: shippingCompaniesTable.costMode,
        shippingCost: shippingCompaniesTable.shippingCost,
      }).from(shippingCompaniesTable)
        .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId))
    : [];
  const isZoneMode = company?.costMode === "zone";
  const flatShippingCost = Math.abs(Number(company?.shippingCost ?? 0));

  // في وضع "zone" محتاجين تكلفة كل منطقة (zone_costs.deliveryCost) حسب zoneId
  // بتاع كل شحنة — نفس مصدر عمود "شحن" في صفحة تفاصيل بيان المندوب بالظبط.
  let zoneCostMap: Record<number, number> = {};
  if (isZoneMode) {
    const zoneIds = [...new Set(shipments.map(s => (s as any).zoneId).filter((v): v is number => v != null))];
    if (zoneIds.length) {
      const zoneCostRows = await db.select().from(zoneCostsTable).where(inArray(zoneCostsTable.zoneId, zoneIds));
      zoneCostMap = Object.fromEntries(zoneCostRows.map(z => [z.zoneId as number, Number(z.deliveryCost) || 0]));
    }
  }

  // نفس الأسباب المالية المستخدمة في عرض إحصائيات البيان (RETURN_REASONS_IN_PNL بالفرونت)
  // — لازم تفضل متطابقة، لأن المرتجع بالأسباب دي بيرجّع فلوس فعلية من المندوب
  const RETURN_REASONS_IN_PNL = ["refused_paid", "refused_unpaid", "quality"];

  // شحن بيُحسب فقط لو الحالة delivered / partial_delivered / partial_received
  // أو returned بسبب مالي (رفض بعد معاينة مدفوع/غير مدفوع، أو مشكلة جودة) —
  // بغض النظر هل البضاعة اتأكد رجوعها للمخزن ولا لسه، لأن تكلفة التوصيل نفسها
  // اتصرفت فعليًا بمجرد محاولة التسليم. نفس shipmentIncursShippingCost بالفرونت.
  function shipmentIncursShippingCost(status: string | null | undefined, returnReason: string | null | undefined): boolean {
    if (status === "delivered" || status === "partial_delivered" || status === "partial_received") return true;
    if (status === "returned") return RETURN_REASONS_IN_PNL.includes(returnReason ?? "");
    return false;
  }

  function getShipmentShippingCost(shipment: any): number {
    if (!shipment) return 0;
    if (isZoneMode) {
      return shipment.zoneId != null ? (zoneCostMap[shipment.zoneId] ?? 0) : 0;
    }
    return flatShippingCost;
  }

  let deliveredGross = 0;
  let courierCostManual = 0;

  for (const item of items) {
    const shipment = shipmentMap.get(item.shipmentId);
    if (!shipment) continue;
    // السعر الكامل للشحنة المسلَّمة = totalAmount (codAmount + shippingFee)، مش codAmount
    // لوحده — نفس totalPrice المستخدم في deliveredCOD بالفرونت بالظبط.
    const price = Number((shipment as any).totalAmount ?? (Number((shipment as any).codAmount ?? 0) + Number(shipment.shippingFee ?? 0)));

    // تكلفة الشحن بتتحسب فقط للحالات اللي بتستوجب شحن (نفس شرط الفرونت)، ومن
    // نفس مصدر عمود "شحن" (costMode: rep = سعر شركة ثابت، zone = تكلفة المنطقة
    // الفعلية) — مش من shipment.shippingFee المجمَّد وقت الإنشاء.
    if (shipmentIncursShippingCost((item as any).deliveryStatus, (item as any).returnReason)) {
      courierCostManual += getShipmentShippingCost(shipment);
    }

    if (item.deliveryStatus === "delivered") {
      // القيمة الفعلية المستلمة لو المندوب دخلها (زيادة أو نقص)، وإلا السعر العادي
      const dvr = (item as any).deliveredValueReceived;
      deliveredGross += dvr != null ? Number(dvr) : price;
    } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
      // partialQuantity هنا قيمة مالية فعلية أدخلها المندوب (مش عدد قطع) — تُستخدم كما هي
      deliveredGross += Number(item.partialQuantity);
    } else if (item.deliveryStatus === "partial_received") {
      // إشعار "باقي مرتجع من استلام جزئي" مُرحَّل من بيان قديم. بياخد قيمة مالية
      // بس لو اتأكد استلامه فعليًا من شركة الشحن في البيان ده نفسه
      // (returnReceived === 1) — نفس شرط الفرونت بالظبط (isStillAtShipping/isReceivedBack).
      const rr = (shipment as any).returnReceived;
      const isReceivedBack = rr === 1 || rr === true || rr === "1";
      if (isReceivedBack && item.partialQuantity != null) {
        // partialQuantity هنا قيمة مالية فعلية (زي unitPrice بالفرونت = codAmount + shippingFee)
        const unitPriceEquivalent = Number((shipment as any).codAmount ?? (shipment as any).totalAmount ?? 0) + Number(shipment.shippingFee ?? 0);
        deliveredGross += unitPriceEquivalent * Number(item.partialQuantity);
      }
    } else if (item.deliveryStatus === "returned" && RETURN_REASONS_IN_PNL.includes((item as any).returnReason)) {
      // مرتجع بسبب مالي (رفض بالدفع / جودة): القيمة اللي استلمها المندوب فعليًا من العميل
      deliveredGross += Number((item as any).returnValueReceived ?? 0);
    }
    // delayed / pending / مرتجع بأسباب أخرى → مفيش إيراد ولا تكلفة شحن
  }

  // الصافي المستحق من المندوب (COD المسلَّم − إجمالي تكلفة الشحن للشحنات المؤهلة)
  return { gross: deliveredGross, net: deliveredGross - courierCostManual };
}
