import { eq, inArray } from "drizzle-orm";
import {
  db,
  shipmentManifestsTable,
  shipmentManifestItemsTable,
  shipmentsTable,
  shippingCompaniesTable,
  shipmentZonesTable,
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

  // جيب شركة الشحن بتاعة البيان — نفس مصدر عمود "شحن" في صفحة تفاصيل بيان
  // المندوب بالظبط (getShipmentShippingCost بالفرونت). costMode بيحدد الطريقة:
  //   "rep"  → سعر ثابت واحد لكل شحنة (company.shippingCost)
  //   "zone" → سعر منطقة الشحنة، مع سلسلة fallback كاملة (تحت)
  const [company] = manifest.shippingCompanyId != null
    ? await db.select().from(shippingCompaniesTable)
        .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId))
    : [];
  const isZoneMode = company?.costMode === "zone";
  const flatShippingCost = Math.abs(Number(company?.shippingCost ?? 0));

  // في وضع "zone" محتاجين: تكلفة كل منطقة (zone_costs.deliveryCost)، وسعرها
  // العادي (shipment_zones.price) كـ fallback لو مفيش costPrice مسجل ليها —
  // نفس zoneForShipment.costPrice ?? zoneForShipment.price بالفرونت بالظبط.
  // ولازم كمان زون الشركة الافتراضي (company.zoneIds[0] أو company.zoneId)
  // كـ fallback تاني لو الشحنة نفسها مالهاش zoneId معروف أصلاً.
  let zoneCostMap: Record<number, number> = {};
  let zonePriceMap: Record<number, number> = {};
  let defaultZoneId: number | null = null;
  if (isZoneMode) {
    const shipmentZoneIds = [...new Set(shipments.map(s => (s as any).zoneId).filter((v): v is number => v != null))];

    // زون الشركة الافتراضي: أول عنصر في zoneIds (JSON array)، وإلا zoneId القديم
    if (company?.zoneIds) {
      try {
        const parsed = JSON.parse(company.zoneIds as any);
        if (Array.isArray(parsed) && parsed.length) defaultZoneId = Number(parsed[0]);
      } catch {}
    } else if ((company as any)?.zoneId != null) {
      defaultZoneId = Number((company as any).zoneId);
    }

    const allZoneIds = [...new Set([...shipmentZoneIds, ...(defaultZoneId != null ? [defaultZoneId] : [])])];
    if (allZoneIds.length) {
      const [zoneCostRows, zoneRows] = await Promise.all([
        db.select().from(zoneCostsTable).where(inArray(zoneCostsTable.zoneId, allZoneIds)),
        db.select().from(shipmentZonesTable).where(inArray(shipmentZonesTable.id, allZoneIds)),
      ]);
      zoneCostMap = Object.fromEntries(zoneCostRows.map(z => [z.zoneId as number, Number(z.deliveryCost) || 0]));
      zonePriceMap = Object.fromEntries(zoneRows.map(z => [z.id, Number(z.price) || 0]));
    }
  }

  // نفس الأسباب المالية المستخدمة في عرض إحصائيات البيان (RETURN_REASONS_IN_PNL بالفرونت)
  // — لازم تفضل متطابقة، لأن المرتجع بالأسباب دي بيرجّع فلوس فعلية من المندوب
  const RETURN_REASONS_IN_PNL = ["refused_paid", "refused_unpaid", "quality"];

  // شحن بيُحسب فقط لو الحالة delivered / partial_delivered / partial_received
  // أو returned بسبب مالي (رفض بعد معاينة مدفوع/غير مدفوع، أو مشكلة جودة) —
  // بغض النظر هل البضاعة اتأكد رجوعها للمخزن ولا لسه. نفس shipmentIncursShippingCost بالفرونت.
  function shipmentIncursShippingCost(status: string | null | undefined, returnReason: string | null | undefined): boolean {
    if (status === "delivered" || status === "partial_delivered" || status === "partial_received") return true;
    if (status === "returned") return RETURN_REASONS_IN_PNL.includes(returnReason ?? "");
    return false;
  }

  // نفس زون-فولباك بالفرونت بالظبط: costPrice ثم price لزون الشحنة نفسها، وإلا
  // نفس السلسلة على زون الشركة الافتراضي، وإلا صفر.
  function costForZone(zoneId: number | null): number {
    if (zoneId == null) return 0;
    if (zoneCostMap[zoneId] != null) return zoneCostMap[zoneId];
    if (zonePriceMap[zoneId] != null) return zonePriceMap[zoneId];
    return 0;
  }

  function getShipmentShippingCost(shipment: any): number {
    if (!shipment) return 0;
    if (isZoneMode) {
      const zoneId = shipment.zoneId != null ? Number(shipment.zoneId) : null;
      if (zoneId != null && (zoneCostMap[zoneId] != null || zonePriceMap[zoneId] != null)) {
        return costForZone(zoneId);
      }
      // Fallback: مفيش زون معروف للشحنة → زون الشركة الافتراضي
      return defaultZoneId != null ? costForZone(defaultZoneId) : 0;
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
    // نفس مصدر عمود "شحن" بالظبط — مش من shipment.shippingFee المجمَّد وقت الإنشاء.
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
