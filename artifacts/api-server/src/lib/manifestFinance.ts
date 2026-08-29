import { eq, inArray, and, isNull, or, lt } from "drizzle-orm";
import {
  db,
  shipmentManifestsTable,
  shipmentManifestItemsTable,
  shipmentsTable,
  shippingCompaniesTable,
  shipmentZonesTable,
  zoneCostsTable,
  parcelTypePricingTable,
  clientAccountManifestsTable,
  clientAccountManifestItemsTable,
  clientsTable,
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
  // المندوب بالظبط. costMode بيحدد الطريقة:
  //   "rep"  → سعر ثابت واحد لكل شحنة (company.shippingCost)
  //   "zone" → سعر منطقة الشحنة، مع سلسلة fallback كاملة (تحت)
  const [company] = manifest.shippingCompanyId != null
    ? await db.select().from(shippingCompaniesTable)
        .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId))
    : [];
  const isZoneMode = company?.costMode === "zone";
  const flatShippingCost = Math.abs(Number(company?.shippingCost ?? 0));

  // في وضع "zone" محتاجين: تكلفة كل منطقة (zone_costs.deliveryCost)، وسعرها
  // العادي (shipment_zones.price) كـ fallback لو مفيش costPrice مسجل ليها.
  let zoneCostMap: Record<number, number> = {};
  let zonePriceMap: Record<number, number> = {};
  let defaultZoneId: number | null = null;
  if (isZoneMode) {
    const shipmentZoneIds = [...new Set(shipments.map(s => (s as any).zoneId).filter((v): v is number => v != null))];

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

  // إضافة "رب إكسترا كوست" حسب نوع الطرد (parcelType) — سعر ثابت بيضاف على تكلفة
  // شحن الشحنة الواحدة (زي "طرد منطقة متطرفة +35") — نفس عمود "شحن" في الفرونت
  // بالظبط. بتتضاف بس للشحنات المؤهلة لتكلفة شحن أصلاً (shipmentIncursShippingCost تحت).
  const parcelTypes = [...new Set(shipments.map(s => (s as any).parcelType).filter((v): v is string => !!v))];
  let repExtraCostMap: Record<string, number> = {};
  if (parcelTypes.length) {
    const pricingRows = await db.select({
      tenantId: parcelTypePricingTable.tenantId,
      parcelType: parcelTypePricingTable.parcelType,
      repExtraCost: parcelTypePricingTable.repExtraCost,
    }).from(parcelTypePricingTable).where(inArray(parcelTypePricingTable.parcelType, parcelTypes));
    const currentTenantId = manifest.tenantId ?? null;
    for (const row of pricingRows) {
      const isTenantRow = row.tenantId != null && row.tenantId === currentTenantId;
      if (repExtraCostMap[row.parcelType] == null || isTenantRow) {
        repExtraCostMap[row.parcelType] = Number(row.repExtraCost ?? 0);
      }
    }
  }

  // تكلفة الشحن الكاملة لشحنة واحدة (لو مؤهلة) = الأساسي (rep/zone) + إضافة نوع
  // الطرد — نفس عمود "شحن" الظاهر في صفحة تفاصيل بيان المندوب بالظبط.
  function getShipmentShippingCost(shipment: any): number {
    if (!shipment) return 0;
    let base: number;
    if (isZoneMode) {
      const zoneId = shipment.zoneId != null ? Number(shipment.zoneId) : null;
      const costForZone = (zId: number | null): number => {
        if (zId == null) return 0;
        if (zoneCostMap[zId] != null) return zoneCostMap[zId];
        if (zonePriceMap[zId] != null) return zonePriceMap[zId];
        return 0;
      };
      base = (zoneId != null && (zoneCostMap[zoneId] != null || zonePriceMap[zoneId] != null))
        ? costForZone(zoneId)
        : (defaultZoneId != null ? costForZone(defaultZoneId) : 0);
    } else {
      base = flatShippingCost;
    }
    const extra = shipment.parcelType ? (repExtraCostMap[shipment.parcelType] ?? 0) : 0;
    return base + extra;
  }

  // نفس الأسباب المالية المستخدمة في عرض إحصائيات البيان (RETURN_REASONS_IN_PNL بالفرونت)
  // — لازم تفضل متطابقة، لأن المرتجع بالأسباب دي بيرجّع فلوس فعلية من المندوب.
  const RETURN_REASONS_IN_PNL = ["refused_paid", "refused_unpaid", "quality"];

  // شحن بيُحسب فقط لو الحالة delivered / partial_delivered / partial_received
  // أو returned بسبب مالي (رفض بعد معاينة مدفوع/غير مدفوع، أو مشكلة جودة) —
  // نفس shipmentIncursShippingCost بالفرونت بالظبط. المرتجع بأسباب أخرى
  // (unaware, wrong_address...) مبيتحسبش عليه شحن خالص — شحن = صفر في عمود الجدول.
  function shipmentIncursShippingCost(status: string | null | undefined, returnReason: string | null | undefined): boolean {
    if (status === "delivered" || status === "partial_delivered" || status === "partial_received") return true;
    if (status === "returned") return RETURN_REASONS_IN_PNL.includes(returnReason ?? "");
    return false;
  }

  let deliveredGross = 0;
  let courierCostManual = 0;

  for (const item of items) {
    const shipment = shipmentMap.get(item.shipmentId);
    if (!shipment) continue;
    // بند مُرحَّل من بيان مقفول: قيمته المالية وتكلفة شحنه اتحسبوا أصلًا في البيان
    // القديم وقت قفله (وترحّلوا للخزنة/محفظة المندوب ساعتها). فبيتعامل كـ"لا شيء مالي"
    // في أي بيان جديد — لا إيراد ولا تكلفة شحن — عشان البيان المُرحّل يبدأ بصفر مستحق.
    // مصدر الحقيقة = عمود is_rolled_over؛ بادئة [ROLLED_OVER] النصية fallback للبنود
    // القديمة قبل الـbackfill. لازم يفضل متطابق مع استبعاد الفرونت
    // (shipmentIncursShippingCost) وإحصائيات الراوت (isRolledOverItem في
    // shipment-manifests.ts) — وإلا هيتحسب مرتين (مرة في القديم ومرة في الجديد).
    if ((item as any).isRolledOver === 1 || ((item as any).deliveryNote ?? "").startsWith("[ROLLED_OVER]")) continue;
    // السعر الكامل للشحنة المسلَّمة = totalAmount (codAmount + shippingFee)، مش codAmount
    // لوحده — نفس totalPrice المستخدم في deliveredCOD بالفرونت بالظبط.
    const price = Number((shipment as any).totalAmount ?? (Number((shipment as any).codAmount ?? 0) + Number(shipment.shippingFee ?? 0)));

    // تكلفة الشحن (الأساسي + إضافة نوع الطرد) بتتخصم فقط للحالات اللي بتستوجب
    // شحن (نفس شرط الفرونت) — نفس عمود "شحن" المعروض في صفحة البيان بالظبط.
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

  // الصافي المستحق من المندوب (COD المسلَّم − إجمالي تكلفة الشحن لكل شحنات البيان)
  return { gross: deliveredGross, net: deliveredGross - courierCostManual };
}

// ─── حساب صافي المستحق من/على عميل من بيان حساب عميل معين (netDueFromClient) ──
// نسخة self-contained من نفس المنطق المستخدم في GET /client-account-manifests/:id
// (نفس نتيجة stats.netDueFromClient بالظبط) — لازم تفضل الاتنين متطابقين تمامًا.
// مُستخدمة في: الترحيل التلقائي لـ "تسوية الرحلات" عند إغلاق بيان العميل
// (lib/tripSettlementSync.ts) — بتاخد snapshot للرصيد في لحظة الإغلاق بالظبط.
export async function computeClientManifestNetDue(manifestId: number): Promise<number> {
  const [manifest] = await db.select().from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, manifestId));
  if (!manifest) return 0;

  const items = await db.select().from(clientAccountManifestItemsTable)
    .where(eq(clientAccountManifestItemsTable.manifestId, manifestId));

  const shipmentIds = items.map(i => i.shipmentId);
  let shipments: any[] = [];
  if (shipmentIds.length) {
    shipments = await db.select().from(shipmentsTable).where(and(inArray(shipmentsTable.id, shipmentIds), isNull(shipmentsTable.deletedAt)));
  }
  const shipmentMap: Record<number, any> = {};
  shipments.forEach(s => { shipmentMap[s.id] = s; });

  const EXCLUDED_SHIPMENT_STATUSES = new Set(["waiting", "pending"]);
  const visibleItems = items.filter(item => {
    const sh = shipmentMap[item.shipmentId];
    if (!sh) return false;
    if (EXCLUDED_SHIPMENT_STATUSES.has(sh.status)) return false;
    return true;
  });

  let shipmentReturnValueMap: Record<number, number> = {};
  if (shipmentIds.length) {
    const smItems = await db
      .select({
        shipmentId: shipmentManifestItemsTable.shipmentId,
        returnValueReceived: shipmentManifestItemsTable.returnValueReceived,
        addedAt: shipmentManifestItemsTable.addedAt,
      })
      .from(shipmentManifestItemsTable)
      .where(and(
        inArray(shipmentManifestItemsTable.shipmentId, shipmentIds),
        eq(shipmentManifestItemsTable.deliveryStatus, "returned"),
      ));
    smItems
      .filter(r => r.returnValueReceived != null)
      .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime())
      .forEach(row => { shipmentReturnValueMap[row.shipmentId] = Number(row.returnValueReceived); });
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, manifest.clientId));
  const clientType = client?.clientType ?? "normal";

  const zoneIds = [...new Set(shipments.map(s => s.zoneId).filter((v): v is number => !!v))];
  let zoneShippingMap: Record<number, number> = {};
  if (zoneIds.length) {
    const zones = await db.select().from(shipmentZonesTable).where(inArray(shipmentZonesTable.id, zoneIds));
    zoneShippingMap = Object.fromEntries(zones.map(z => {
      const priceByType =
        clientType === "vip"        ? z.priceVip :
        clientType === "commercial" ? z.priceCommercial :
        z.priceNormal;
      const resolved = priceByType != null && Number(priceByType) > 0 ? priceByType : z.price;
      return [z.id, Number(resolved) || 0];
    }));
  }
  const getZoneShipping = (shipment: any) =>
    shipment?.zoneId ? (zoneShippingMap[shipment.zoneId] ?? Number(shipment.shippingFee ?? 0)) : Number(shipment?.shippingFee ?? 0);

  let shipmentToCompanyId: Record<number, number> = {};
  if (shipmentIds.length) {
    const manifestLinkRows = await db
      .select({
        shipmentId: shipmentManifestItemsTable.shipmentId,
        addedAt: shipmentManifestItemsTable.addedAt,
        companyId: shipmentManifestsTable.shippingCompanyId,
      })
      .from(shipmentManifestItemsTable)
      .innerJoin(shipmentManifestsTable, eq(shipmentManifestItemsTable.manifestId, shipmentManifestsTable.id))
      .where(and(
        inArray(shipmentManifestItemsTable.shipmentId, shipmentIds),
        isNull(shipmentManifestsTable.clientId),
      ));
    manifestLinkRows
      .filter(r => r.companyId != null)
      .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime())
      .forEach(row => { shipmentToCompanyId[row.shipmentId] = row.companyId as number; });
  }
  const shipmentCompanyIds = [...new Set([
    ...shipments.map(s => s.shippingCompanyId).filter((v): v is number => !!v),
    ...Object.values(shipmentToCompanyId),
  ])];
  let companyCostModeMap: Record<number, { costMode: string; shippingCost: number }> = {};
  if (shipmentCompanyIds.length) {
    const companyRows = await db.select({
      id: shippingCompaniesTable.id,
      costMode: shippingCompaniesTable.costMode,
      shippingCost: shippingCompaniesTable.shippingCost,
    }).from(shippingCompaniesTable).where(inArray(shippingCompaniesTable.id, shipmentCompanyIds));
    companyCostModeMap = Object.fromEntries(companyRows.map(c => [c.id, {
      costMode: c.costMode === "zone" ? "zone" : "rep",
      shippingCost: Math.abs(Number(c.shippingCost ?? 0)),
    }]));
  }
  let zoneCostMap: Record<number, number> = {};
  if (zoneIds.length) {
    const zoneCostRows = await db.select().from(zoneCostsTable).where(inArray(zoneCostsTable.zoneId, zoneIds));
    zoneCostMap = Object.fromEntries(zoneCostRows.map(z => [z.zoneId as number, Number(z.deliveryCost) || 0]));
  }
  const getZoneCost = (shipment: any) => {
    if (!shipment) return 0;
    const companyId = shipment.shippingCompanyId ?? shipmentToCompanyId[shipment.id];
    const company = companyId ? companyCostModeMap[companyId] : null;
    if (company) {
      return company.costMode === "zone"
        ? (shipment.zoneId != null ? (zoneCostMap[shipment.zoneId] ?? 0) : 0)
        : company.shippingCost;
    }
    return shipment.zoneId != null ? (zoneCostMap[shipment.zoneId] ?? 0) : 0;
  };

  const parcelTypes = [...new Set(shipments.map(s => s.parcelType).filter((v): v is string => !!v))];
  let parcelPricingMap: Record<string, { repExtraCost: number; basePrice: number }> = {};
  if (parcelTypes.length) {
    const conds: any[] = [inArray(parcelTypePricingTable.parcelType, parcelTypes)];
    if (manifest.tenantId !== null && manifest.tenantId !== undefined) {
      conds.push(or(eq(parcelTypePricingTable.tenantId, manifest.tenantId), isNull(parcelTypePricingTable.tenantId)));
    }
    const pricingRows = await db
      .select({
        tenantId: parcelTypePricingTable.tenantId,
        parcelType: parcelTypePricingTable.parcelType,
        repExtraCost: parcelTypePricingTable.repExtraCost,
        basePrice: parcelTypePricingTable.basePrice,
      })
      .from(parcelTypePricingTable)
      .where(and(...conds));
    const currentTenantId = manifest.tenantId ?? null;
    for (const row of pricingRows) {
      const existing = parcelPricingMap[row.parcelType];
      const isTenantRow = row.tenantId !== null && row.tenantId !== undefined && row.tenantId === currentTenantId;
      if (!existing || isTenantRow) {
        parcelPricingMap[row.parcelType] = {
          repExtraCost: Number(row.repExtraCost ?? 0),
          basePrice: Number(row.basePrice ?? 0),
        };
      }
    }
  }

  const RETURN_REASONS_WITH_VALUE = new Set(["refused_paid", "refused_unpaid", "quality"]);

  const rolledOverShipmentIds = new Set<number>();
  if (shipmentIds.length) {
    const olderItemRows = await db
      .select({ shipmentId: clientAccountManifestItemsTable.shipmentId })
      .from(clientAccountManifestItemsTable)
      .innerJoin(
        clientAccountManifestsTable,
        eq(clientAccountManifestItemsTable.manifestId, clientAccountManifestsTable.id)
      )
      .where(and(
        inArray(clientAccountManifestItemsTable.shipmentId, shipmentIds),
        lt(clientAccountManifestItemsTable.manifestId, manifestId),
      ));
    olderItemRows.forEach(r => rolledOverShipmentIds.add(r.shipmentId));
  }

  const RETURN_REASONS_DUE = new Set(["refused_paid", "refused_unpaid", "quality"]);
  let netDueFromClientAllStatuses = 0;
  for (const rawItem of visibleItems as any[]) {
    const sh = shipmentMap[rawItem.shipmentId];
    if (!sh) continue;
    const effectiveReturnReason = rawItem.returnReason ?? sh.returnReason ?? null;
    const isReturnedWithValue = rawItem.deliveryStatus === "returned"
      && RETURN_REASONS_WITH_VALUE.has(String(effectiveReturnReason ?? ""));
    const zoneShippingForItem = (rawItem.deliveryStatus !== "returned" || isReturnedWithValue) ? getZoneShipping(sh) : 0;
    const zoneCostForItem = (rawItem.deliveryStatus !== "returned" || isReturnedWithValue) ? getZoneCost(sh) : 0;
    const partialQuantity = rawItem.partialQuantity != null ? rawItem.partialQuantity : (sh.partialQuantity ?? null);
    const rolledOver = rolledOverShipmentIds.has(rawItem.shipmentId);
    const returnValueReceived = isReturnedWithValue
      ? (rawItem.returnValueReceived != null
          ? rawItem.returnValueReceived
          : (rolledOver ? null : (shipmentReturnValueMap[rawItem.shipmentId] ?? null)))
      : null;
    const totalPrice = Number(sh.codAmount ?? sh.totalAmount ?? 0) + zoneShippingForItem;
    const repExtraCost = (zoneShippingForItem > 0 && sh.parcelType) ? (parcelPricingMap[sh.parcelType]?.basePrice ?? 0) : 0;

    const item = {
      deliveryStatus: rawItem.deliveryStatus,
      returnReason: effectiveReturnReason,
      partialQuantity,
      returnValueReceived,
      deliveredValueReceived: rawItem.deliveredValueReceived,
      totalPrice,
      zonePrice: zoneShippingForItem,
      zoneCost: zoneCostForItem,
      repExtraCost,
      rolledOver,
    };

    const st = item.deliveryStatus;
    const reason = item.returnReason;
    const isReturnedWithValueDue = st === "returned" && RETURN_REASONS_DUE.has(String(reason ?? ""));

    if (item.rolledOver && st === "returned" && rawItem.returnReceived !== 1) continue;
    if (st === "returned" && !isReturnedWithValueDue) continue;

    let collected = 0;
    if (st === "delivered") {
      collected = item.deliveredValueReceived != null ? Number(item.deliveredValueReceived) : item.totalPrice;
    } else if (st === "partial_delivered") {
      collected = item.partialQuantity != null ? Number(item.partialQuantity) : (sh.partialQuantity != null ? Number(sh.partialQuantity) : 0);
    } else if (st === "partial_received") {
      const pq = item.partialQuantity != null ? item.partialQuantity : sh.partialQuantity;
      collected = pq != null ? Math.round(Number(pq)) : 0;
    } else if (isReturnedWithValueDue) {
      collected = item.returnValueReceived != null ? Number(item.returnValueReceived) : (shipmentReturnValueMap[rawItem.shipmentId] ?? 0);
    }

    const useRepCostForDue = isReturnedWithValueDue && (reason === "refused_unpaid" || reason === "quality");
    const isShippingZeroedForDue = st === "postponed" || st === "pending";
    const dueShippingBase = isShippingZeroedForDue ? 0 : (useRepCostForDue ? item.zoneCost : item.zonePrice);
    const dueRepExtraCost = isShippingZeroedForDue ? 0 : item.repExtraCost;
    netDueFromClientAllStatuses += collected - (dueShippingBase + dueRepExtraCost);
  }

  return netDueFromClientAllStatuses;
}
