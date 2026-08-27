import { eq, and, inArray, or, isNull, gte, lte } from "drizzle-orm";
import {
  db,
  clientAccountManifestsTable,
  clientAccountManifestItemsTable,
  clientAccountPaymentsTable,
  shipmentsTable,
  shipmentZonesTable,
  zoneCostsTable,
  shippingCompaniesTable,
  shipmentManifestsTable as shippingManifestsTable,
  parcelTypePricingTable,
  shipmentManifestItemsTable,
  clientsTable,
} from "@workspace/db";

// ─── حساب قيمة كل بيان حساب عميل مقفول على حدة ────────────────────────────────
// نفس منطق GET /client-account-manifests/balance/:clientId بالظبط (مستخرج هنا
// كدالة مشتركة عشان يُستخدم أيضًا في كشف الحساب /finance/clients/:id/statement
// — لازم يفضلوا متطابقين تمامًا، الرقم الظاهر في كارت "رصيد العميل" بالداشبورد
// هو المرجع الوحيد الصحيح).
export async function computeClosedManifestsForClient(clientId: number): Promise<{
  manifests: { id: number; manifestNumber: string; closedAt: Date | null; createdAt: Date; itemsCount: number; value: number; dueValue: number; returnedCount: number }[];
  totalManifestsValue: number;
  payments: { id: number; amount: number; notes: string | null; createdAt: Date; createdByName: string | null }[];
  totalPaid: number;
  balance: number;
}> {
  const allManifests = await db
    .select()
    .from(clientAccountManifestsTable)
    .where(and(
      eq(clientAccountManifestsTable.clientId, clientId),
      eq(clientAccountManifestsTable.status, "closed"),
    ));

  const manifestIds = allManifests.map(m => m.id);
  const manifestResults: { id: number; manifestNumber: string; closedAt: Date | null; createdAt: Date; itemsCount: number; value: number; dueValue: number; returnedCount: number }[] = [];

  if (manifestIds.length) {
    const items = await db
      .select()
      .from(clientAccountManifestItemsTable)
      .where(inArray(clientAccountManifestItemsTable.manifestId, manifestIds));

    const shipmentIds = items.map(i => i.shipmentId);
    const shipments = shipmentIds.length
      ? await db.select().from(shipmentsTable).where(and(inArray(shipmentsTable.id, shipmentIds), isNull(shipmentsTable.deletedAt)))
      : [];
    const shipmentMap: Record<number, any> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
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

    const parcelTypes = [...new Set(shipments.map(s => s.parcelType).filter((v): v is string => !!v))];
    let parcelBasePriceMap: Record<string, number> = {};
    if (parcelTypes.length) {
      const conds: any[] = [inArray(parcelTypePricingTable.parcelType, parcelTypes)];
      const tenantId = allManifests[0]?.tenantId ?? null;
      if (tenantId !== null && tenantId !== undefined) {
        conds.push(or(eq(parcelTypePricingTable.tenantId, tenantId), isNull(parcelTypePricingTable.tenantId)));
      }
      const pricingRows = await db
        .select({ tenantId: parcelTypePricingTable.tenantId, parcelType: parcelTypePricingTable.parcelType, basePrice: parcelTypePricingTable.basePrice })
        .from(parcelTypePricingTable)
        .where(and(...conds));
      for (const row of pricingRows) {
        const existing = parcelBasePriceMap[row.parcelType];
        const isTenantRow = row.tenantId != null && row.tenantId === tenantId;
        if (existing === undefined || isTenantRow) parcelBasePriceMap[row.parcelType] = Number(row.basePrice ?? 0);
      }
    }

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
        .forEach(row => {
          shipmentReturnValueMap[row.shipmentId] = Number(row.returnValueReceived);
        });
    }

    const RETURN_REASONS_FINANCIAL = new Set(["refused_paid", "refused_unpaid", "quality"]);
    const isShippingZeroedRow = (item: any, st: string, shipment: any) => {
      if (st === "postponed" || st === "delayed" || st === "pending") return true;
      if (st === "returned") {
        const reason = item.returnReason ?? shipment?.returnReason ?? null;
        if (!RETURN_REASONS_FINANCIAL.has(String(reason ?? ""))) return true;
      }
      return false;
    };

    // نجمّع قيمة كل بيان على حدة (بدل إجمالي واحد بس) عشان نعرضها كحركة مستقلة في كشف الحساب
    const valueByManifest: Record<number, number> = {};
    const countByManifest: Record<number, number> = {};
    // ── قيمة "المستحق" فقط لكل بيان (بدون أي أثر مالي للمرتجعات) + عدد المرتجعات ─
    // المرتجعات بكل أنواعها تُستبعد تمامًا من القيمة المالية للبيان وتُسجَّل كعدد
    // فقط — لاستخدامها في كشف الحساب (إجمالي المستحق يعكس البيانات المستحقة فقط).
    const dueValueByManifest: Record<number, number> = {};
    const returnedCountByManifest: Record<number, number> = {};

    for (const item of items) {
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const st = item.deliveryStatus;
      const reason = (item as any).returnReason ?? (shipment as any)?.returnReason ?? null;
      const isReturnedWithValue = st === "returned" && RETURN_REASONS_FINANCIAL.has(String(reason ?? ""));
      const zoneShippingForItem = (st !== "returned" || isReturnedWithValue) ? getZoneShipping(shipment) : 0;
      const totalPrice = Number(shipment.codAmount ?? shipment.totalAmount ?? 0) + zoneShippingForItem;

      let collected = 0;
      if (st === "delivered") {
        const dvr = (item as any).deliveredValueReceived;
        collected = dvr != null ? Number(dvr) : totalPrice;
      } else if (st === "partial_delivered") {
        const pq = item.partialQuantity != null ? item.partialQuantity : (shipment as any)?.partialQuantity;
        collected = pq != null ? Number(pq) : 0;
      } else if (st === "partial_received") {
        const pq = item.partialQuantity != null ? item.partialQuantity : (shipment as any)?.partialQuantity;
        collected = pq != null ? Math.round(Number(pq)) : 0;
      } else if (isReturnedWithValue) {
        const rvr = (item as any).returnValueReceived;
        collected = rvr != null ? Number(rvr) : (shipmentReturnValueMap[item.shipmentId] ?? 0);
      }

      let rowValue = collected;
      if (!isShippingZeroedRow(item, st, shipment)) {
        const repExtraCost = (zoneShippingForItem > 0 && shipment.parcelType) ? (parcelBasePriceMap[shipment.parcelType] ?? 0) : 0;
        rowValue -= (zoneShippingForItem + repExtraCost);
      }

      valueByManifest[item.manifestId] = (valueByManifest[item.manifestId] ?? 0) + rowValue;
      countByManifest[item.manifestId] = (countByManifest[item.manifestId] ?? 0) + 1;

      if (st === "returned") {
        returnedCountByManifest[item.manifestId] = (returnedCountByManifest[item.manifestId] ?? 0) + 1;
      } else {
        dueValueByManifest[item.manifestId] = (dueValueByManifest[item.manifestId] ?? 0) + rowValue;
      }
    }

    for (const m of allManifests) {
      manifestResults.push({
        id: m.id,
        manifestNumber: m.manifestNumber,
        closedAt: m.closedAt ?? null,
        createdAt: m.createdAt,
        itemsCount: countByManifest[m.id] ?? 0,
        value: Number((valueByManifest[m.id] ?? 0).toFixed(2)),
        dueValue: Number((dueValueByManifest[m.id] ?? 0).toFixed(2)),
        returnedCount: returnedCountByManifest[m.id] ?? 0,
      });
    }
  }

  const totalManifestsValue = manifestResults.reduce((s, m) => s + m.value, 0);

  const paymentRows = await db
    .select()
    .from(clientAccountPaymentsTable)
    .where(eq(clientAccountPaymentsTable.clientId, clientId));
  const payments = paymentRows.map(p => ({
    id: p.id,
    amount: Number(p.amount ?? 0),
    notes: (p as any).notes ?? null,
    createdAt: p.createdAt,
    createdByName: (p as any).createdByName ?? null,
  }));
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return {
    manifests: manifestResults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    totalManifestsValue: Number(totalManifestsValue.toFixed(2)),
    payments,
    totalPaid: Number(totalPaid.toFixed(2)),
    balance: Number((totalManifestsValue - totalPaid).toFixed(2)),
  };
}

// ─── نفس حساب computeClosedManifestsForClient، بس لكل العملاء دفعة واحدة ──────
// مُستخدمة في كارت العميل بصفحة /finance/client-account-sheet (اللست الكاملة)
// عشان نعرض "رصيد العميل" و"المتبقي" لكل عميل من غير ما ننادي الدالة الفردية
// N مرة (N+1 queries). نفس الجداول ونفس شرط status = "closed" بالضبط — أي رقم
// هنا لازم يطابق تمامًا اللي هيرجع لو ناديت computeClosedManifestsForClient
// لأي عميل واحد بمفرده.
export async function computeClientBalancesForAllClients(
  clientIds: number[],
): Promise<Record<number, { totalManifestsValue: number; totalPaid: number; balance: number }>> {
  const result: Record<number, { totalManifestsValue: number; totalPaid: number; balance: number }> = {};
  for (const id of clientIds) result[id] = { totalManifestsValue: 0, totalPaid: 0, balance: 0 };
  if (!clientIds.length) return result;

  const allManifests = await db
    .select()
    .from(clientAccountManifestsTable)
    .where(and(
      inArray(clientAccountManifestsTable.clientId, clientIds),
      eq(clientAccountManifestsTable.status, "closed"),
    ));

  if (allManifests.length) {
    const manifestIds = allManifests.map(m => m.id);
    const manifestClientMap: Record<number, number> = {};
    allManifests.forEach(m => { manifestClientMap[m.id] = m.clientId; });

    const items = await db
      .select()
      .from(clientAccountManifestItemsTable)
      .where(inArray(clientAccountManifestItemsTable.manifestId, manifestIds));

    const shipmentIds = items.map(i => i.shipmentId);
    const shipments = shipmentIds.length
      ? await db.select().from(shipmentsTable).where(and(inArray(shipmentsTable.id, shipmentIds), isNull(shipmentsTable.deletedAt)))
      : [];
    const shipmentMap: Record<number, any> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    const clients = await db.select().from(clientsTable).where(inArray(clientsTable.id, clientIds));
    const clientTypeMap: Record<number, string> = {};
    clients.forEach(c => { clientTypeMap[c.id] = (c as any).clientType ?? "normal"; });

    const zoneIds = [...new Set(shipments.map(s => s.zoneId).filter((v): v is number => !!v))];
    let zoneRowsById: Record<number, any> = {};
    if (zoneIds.length) {
      const zones = await db.select().from(shipmentZonesTable).where(inArray(shipmentZonesTable.id, zoneIds));
      zones.forEach(z => { zoneRowsById[z.id] = z; });
    }
    const getZoneShipping = (shipment: any, clientType: string) => {
      if (!shipment?.zoneId) return Number(shipment?.shippingFee ?? 0);
      const z = zoneRowsById[shipment.zoneId];
      if (!z) return Number(shipment.shippingFee ?? 0);
      const priceByType =
        clientType === "vip"        ? z.priceVip :
        clientType === "commercial" ? z.priceCommercial :
        z.priceNormal;
      const resolved = priceByType != null && Number(priceByType) > 0 ? priceByType : z.price;
      return Number(resolved) || Number(shipment.shippingFee ?? 0) || 0;
    };

    const parcelTypes = [...new Set(shipments.map(s => s.parcelType).filter((v): v is string => !!v))];
    let parcelBasePriceMap: Record<string, number> = {};
    if (parcelTypes.length) {
      const tenantIds = [...new Set(allManifests.map(m => m.tenantId).filter((v): v is number => v != null))];
      const conds: any[] = [inArray(parcelTypePricingTable.parcelType, parcelTypes)];
      if (tenantIds.length) {
        conds.push(or(inArray(parcelTypePricingTable.tenantId, tenantIds), isNull(parcelTypePricingTable.tenantId)));
      }
      const pricingRows = await db
        .select({ tenantId: parcelTypePricingTable.tenantId, parcelType: parcelTypePricingTable.parcelType, basePrice: parcelTypePricingTable.basePrice })
        .from(parcelTypePricingTable)
        .where(and(...conds));
      for (const row of pricingRows) {
        const existing = parcelBasePriceMap[row.parcelType];
        const isTenantRow = row.tenantId != null;
        if (existing === undefined || isTenantRow) parcelBasePriceMap[row.parcelType] = Number(row.basePrice ?? 0);
      }
    }

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
        .forEach(row => {
          shipmentReturnValueMap[row.shipmentId] = Number(row.returnValueReceived);
        });
    }

    const RETURN_REASONS_FINANCIAL = new Set(["refused_paid", "refused_unpaid", "quality"]);
    const isShippingZeroedRow = (item: any, st: string, shipment: any) => {
      if (st === "postponed" || st === "delayed" || st === "pending") return true;
      if (st === "returned") {
        const reason = item.returnReason ?? shipment?.returnReason ?? null;
        if (!RETURN_REASONS_FINANCIAL.has(String(reason ?? ""))) return true;
      }
      return false;
    };

    for (const item of items) {
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const clientId = manifestClientMap[item.manifestId];
      if (clientId == null) continue;
      const clientType = clientTypeMap[clientId] ?? "normal";

      const st = item.deliveryStatus;
      const reason = (item as any).returnReason ?? (shipment as any)?.returnReason ?? null;
      const isReturnedWithValue = st === "returned" && RETURN_REASONS_FINANCIAL.has(String(reason ?? ""));
      const zoneShippingForItem = (st !== "returned" || isReturnedWithValue) ? getZoneShipping(shipment, clientType) : 0;
      const totalPrice = Number(shipment.codAmount ?? shipment.totalAmount ?? 0) + zoneShippingForItem;

      let collected = 0;
      if (st === "delivered") {
        const dvr = (item as any).deliveredValueReceived;
        collected = dvr != null ? Number(dvr) : totalPrice;
      } else if (st === "partial_delivered") {
        const pq = item.partialQuantity != null ? item.partialQuantity : (shipment as any)?.partialQuantity;
        collected = pq != null ? Number(pq) : 0;
      } else if (st === "partial_received") {
        const pq = item.partialQuantity != null ? item.partialQuantity : (shipment as any)?.partialQuantity;
        collected = pq != null ? Math.round(Number(pq)) : 0;
      } else if (isReturnedWithValue) {
        const rvr = (item as any).returnValueReceived;
        collected = rvr != null ? Number(rvr) : (shipmentReturnValueMap[item.shipmentId] ?? 0);
      }

      let rowValue = collected;
      if (!isShippingZeroedRow(item, st, shipment)) {
        const repExtraCost = (zoneShippingForItem > 0 && shipment.parcelType) ? (parcelBasePriceMap[shipment.parcelType] ?? 0) : 0;
        rowValue -= (zoneShippingForItem + repExtraCost);
      }

      result[clientId].totalManifestsValue += rowValue;
    }
  }

  const paymentRows = await db
    .select({ clientId: clientAccountPaymentsTable.clientId, amount: clientAccountPaymentsTable.amount })
    .from(clientAccountPaymentsTable)
    .where(inArray(clientAccountPaymentsTable.clientId, clientIds));
  for (const p of paymentRows) {
    if (p.clientId == null || !result[p.clientId]) continue;
    result[p.clientId].totalPaid += Number(p.amount ?? 0);
  }

  for (const id of clientIds) {
    const r = result[id];
    r.totalManifestsValue = Number(r.totalManifestsValue.toFixed(2));
    r.totalPaid = Number(r.totalPaid.toFixed(2));
    r.balance = Number((r.totalManifestsValue - r.totalPaid).toFixed(2));
  }

  return result;
}

// ─── صافي الإيراد المستحق مجمّع لكل عميل — نفس منطق "صافي الإيراد المستحق" في ─
// client-account-manifest-detail.tsx (كارت البيان الفردي) بالظبط، لكن مجمّع
// على كل بيانات العميل (مفتوحة ومقفولة مع بعض — بخلاف رصيد العميل اللي بيتجمع
// من المقفولة بس، الرقم ده حسب طلب المدير لازم يعرض حتى قبل قفل البيان). لكل
// شحنة: (سعر الشحن + إضافة نوع الشحنة) - تكلفة المندوب الحقيقية (zone_costs
// .deliveryCost أو سعر شركة الشحن الثابت حسب costMode) — بنفس شرط تصفير
// الصفوف (مؤجل/معلَّق/قيد الانتظار، أو مرتجع بسبب غير مالي = صفر بالكامل).
export async function computeNetRevenueDueForAllClients(
  clientIds: number[],
  options?: { from?: Date; to?: Date; closedOnly?: boolean },
): Promise<Record<number, number>> {
  const result: Record<number, number> = {};
  for (const id of clientIds) result[id] = 0;
  if (!clientIds.length) return result;

  const manifestConds: any[] = [inArray(clientAccountManifestsTable.clientId, clientIds)];
  // closedOnly: يُستخدم لعرض "إيراد العميل" فى أفضل العملاء بمركز العمليات —
  // لازم البيان يكون مقفول فعليًا عشان "يسمع" الإيراد (زى ما طلب المدير)، بخلاف
  // الاستخدام الافتراضى (رصيد العميل بصفحة المالية) اللى بيحسب من كل البيانات.
  // ملحوظة مهمة: فى وضع closedOnly، فلتر الفترة (from/to) لازم يتطبّق على تاريخ
  // *إغلاق* البيان (closedAt) مش تاريخ إنشائه (createdAt) — لأن المطلوب هو "الإيراد
  // اللى اتقفل/اتسمع خلال الفترة دى"، مش "البيانات اللى اتفتحت فى الفترة دى" (بيان
  // ممكن يتفتح فى شهر ويتقفل فى شهر تانى، والإيراد بيُحسب على شهر القفل).
  if (options?.closedOnly) {
    manifestConds.push(eq(clientAccountManifestsTable.status, "closed"));
    if (options?.from) manifestConds.push(gte(clientAccountManifestsTable.closedAt, options.from));
    if (options?.to) manifestConds.push(lte(clientAccountManifestsTable.closedAt, options.to));
  } else {
    if (options?.from) manifestConds.push(gte(clientAccountManifestsTable.createdAt, options.from));
    if (options?.to) manifestConds.push(lte(clientAccountManifestsTable.createdAt, options.to));
  }

  const allManifests = await db
    .select()
    .from(clientAccountManifestsTable)
    .where(and(...manifestConds));
  if (!allManifests.length) return result;

  const manifestIds = allManifests.map(m => m.id);
  const manifestClientMap: Record<number, number> = {};
  allManifests.forEach(m => { manifestClientMap[m.id] = m.clientId; });

  const items = await db
    .select()
    .from(clientAccountManifestItemsTable)
    .where(inArray(clientAccountManifestItemsTable.manifestId, manifestIds));
  if (!items.length) return result;

  const shipmentIds = items.map(i => i.shipmentId);
  const shipments = await db.select().from(shipmentsTable).where(and(inArray(shipmentsTable.id, shipmentIds), isNull(shipmentsTable.deletedAt)));
  const shipmentMap: Record<number, any> = {};
  shipments.forEach(s => { shipmentMap[s.id] = s; });

  const clients = await db.select().from(clientsTable).where(inArray(clientsTable.id, clientIds));
  const clientTypeMap: Record<number, string> = {};
  clients.forEach(c => { clientTypeMap[c.id] = (c as any).clientType ?? "normal"; });

  // ── سعر الشحن (على العميل) لكل منطقة، حسب تصنيف العميل ──────────────────
  const zoneIds = [...new Set(shipments.map(s => s.zoneId).filter((v): v is number => !!v))];
  let zoneRowsById: Record<number, any> = {};
  if (zoneIds.length) {
    const zones = await db.select().from(shipmentZonesTable).where(inArray(shipmentZonesTable.id, zoneIds));
    zones.forEach(z => { zoneRowsById[z.id] = z; });
  }
  const getZoneShipping = (shipment: any, clientType: string) => {
    if (!shipment?.zoneId) return Number(shipment?.shippingFee ?? 0);
    const z = zoneRowsById[shipment.zoneId];
    if (!z) return Number(shipment.shippingFee ?? 0);
    const priceByType =
      clientType === "vip"        ? z.priceVip :
      clientType === "commercial" ? z.priceCommercial :
      z.priceNormal;
    const resolved = priceByType != null && Number(priceByType) > 0 ? priceByType : z.price;
    return Number(resolved) || Number(shipment.shippingFee ?? 0) || 0;
  };

  // ── تكلفة المندوب الحقيقية — من بيان المندوب (شحن) اللي الشحنة اتضافتله ──
  // نفس منطق getZoneCost في GET /client-account-manifests/:id بالظبط.
  let shipmentToCompanyId: Record<number, number> = {};
  if (shipmentIds.length) {
    const manifestLinkRows = await db
      .select({
        shipmentId: shipmentManifestItemsTable.shipmentId,
        addedAt: shipmentManifestItemsTable.addedAt,
        companyId: shippingManifestsTable.shippingCompanyId,
      })
      .from(shipmentManifestItemsTable)
      .innerJoin(shippingManifestsTable, eq(shipmentManifestItemsTable.manifestId, shippingManifestsTable.id))
      .where(and(
        inArray(shipmentManifestItemsTable.shipmentId, shipmentIds),
        isNull(shippingManifestsTable.clientId),
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

  // ── إضافة نوع الشحنة (basePrice على سعر العميل) ──────────────────────────
  const parcelTypes = [...new Set(shipments.map(s => s.parcelType).filter((v): v is string => !!v))];
  let parcelBasePriceMap: Record<string, number> = {};
  if (parcelTypes.length) {
    const tenantIds = [...new Set(allManifests.map(m => m.tenantId).filter((v): v is number => v != null))];
    const conds: any[] = [inArray(parcelTypePricingTable.parcelType, parcelTypes)];
    if (tenantIds.length) {
      conds.push(or(inArray(parcelTypePricingTable.tenantId, tenantIds), isNull(parcelTypePricingTable.tenantId)));
    }
    const pricingRows = await db
      .select({ tenantId: parcelTypePricingTable.tenantId, parcelType: parcelTypePricingTable.parcelType, basePrice: parcelTypePricingTable.basePrice })
      .from(parcelTypePricingTable)
      .where(and(...conds));
    for (const row of pricingRows) {
      const existing = parcelBasePriceMap[row.parcelType];
      const isTenantRow = row.tenantId != null;
      if (existing === undefined || isTenantRow) parcelBasePriceMap[row.parcelType] = Number(row.basePrice ?? 0);
    }
  }

  const RETURN_REASONS_FINANCIAL = new Set(["refused_paid", "refused_unpaid", "quality"]);
  const isShippingZeroedRow = (item: any, st: string, shipment: any) => {
    if (st === "postponed" || st === "delayed" || st === "pending") return true;
    if (st === "returned") {
      const reason = item.returnReason ?? shipment?.returnReason ?? null;
      if (!RETURN_REASONS_FINANCIAL.has(String(reason ?? ""))) return true;
    }
    return false;
  };

  for (const item of items) {
    const shipment = shipmentMap[item.shipmentId];
    if (!shipment) continue;
    const clientId = manifestClientMap[item.manifestId];
    if (clientId == null || !(clientId in result)) continue;
    const clientType = clientTypeMap[clientId] ?? "normal";
    const st = item.deliveryStatus;

    if (isShippingZeroedRow(item, st, shipment)) continue;

    const zoneShippingForItem = getZoneShipping(shipment, clientType);
    const zoneCostForItem = getZoneCost(shipment);
    const repExtraCost = (zoneShippingForItem > 0 && shipment.parcelType) ? (parcelBasePriceMap[shipment.parcelType] ?? 0) : 0;

    result[clientId] += (zoneShippingForItem + repExtraCost) - zoneCostForItem;
  }

  for (const id of clientIds) {
    result[id] = Number(result[id].toFixed(2));
  }

  return result;
}

// ─── نسبة التسليم الفعلية لآخر 7 أيام (على مستوى الشركة كلها) ────────────────
// من كل الشحنات اللي وصلت لحالة نهائية (اتسلمت "received" أو رجعت "returned")
// خلال آخر 7 أيام، بنحسب كام بالمية منهم اتسلمت فعليًا. النسبة دي هي اللي
// بتتضرب فيها هامش الشحنات الجارية فى computeExpectedRevenueTotalForTenant
// بدل رقم ثابت مفترض، عشان تعكس الأداء الفعلي الحالي للتسليم.
async function computeRecentDeliveryRateForTenant(tenantId: number | null): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const conds: any[] = [
    inArray(shipmentsTable.status, ["received", "returned"]),
    gte(shipmentsTable.updatedAt, sevenDaysAgo),
    isNull(shipmentsTable.deletedAt),
  ];
  if (tenantId !== null) conds.push(eq(shipmentsTable.tenantId, tenantId));
  const rows = await db
    .select({ status: shipmentsTable.status })
    .from(shipmentsTable)
    .where(and(...conds));
  if (!rows.length) return 0.6; // مفيش بيانات كافية لآخر 7 أيام — نرجع لنسبة افتراضية محافظة
  const deliveredCount = rows.filter(r => r.status === "received").length;
  return deliveredCount / rows.length;
}

// ─── الإيراد المتوقع الإجمالي (على مستوى الشركة) — لكارت "توقعات الشهر القادم" ─
// فى شاشة المدير التنفيذي. بيتحسب من كل الشحنات الجارية حاليًا فى النظام (قيد
// الشحن فى المخزن / قيد الشحن)، بغض النظر عن تاريخها، بنفس صيغة (سعر الشحن +
// إضافة نوع الشحنة) - تكلفة المندوب لكل شحنة، والمجموع بيُضرب فى نسبة التسليم
// الفعلية لآخر 7 أيام (مش رقم ثابت) عشان يعكس إن مش كل الشحنات الجارية هتوصل فعليًا.
export async function computeExpectedRevenueTotalForTenant(
  tenantId: number | null,
): Promise<number> {
  const shipmentConds: any[] = [inArray(shipmentsTable.status, ["warehouse_ready", "in_shipping"]), isNull(shipmentsTable.deletedAt)];
  if (tenantId !== null) shipmentConds.push(eq(shipmentsTable.tenantId, tenantId));
  const [shipments, deliveryRate] = await Promise.all([
    db.select().from(shipmentsTable).where(and(...shipmentConds)),
    computeRecentDeliveryRateForTenant(tenantId),
  ]);
  if (!shipments.length) return 0;

  const clientIds = [...new Set(shipments.map(s => s.clientId).filter((v): v is number => !!v))];
  const clients = clientIds.length
    ? await db.select().from(clientsTable).where(inArray(clientsTable.id, clientIds))
    : [];
  const clientTypeMap: Record<number, string> = {};
  clients.forEach(c => { clientTypeMap[c.id] = (c as any).clientType ?? "normal"; });

  // ── سعر الشحن (على العميل) لكل منطقة، حسب تصنيف العميل — نفس منطق أعلاه ──
  const zoneIds = [...new Set(shipments.map(s => s.zoneId).filter((v): v is number => !!v))];
  let zoneRowsById: Record<number, any> = {};
  if (zoneIds.length) {
    const zones = await db.select().from(shipmentZonesTable).where(inArray(shipmentZonesTable.id, zoneIds));
    zones.forEach(z => { zoneRowsById[z.id] = z; });
  }
  const getZoneShipping = (shipment: any, clientType: string) => {
    if (!shipment?.zoneId) return Number(shipment?.shippingFee ?? 0);
    const z = zoneRowsById[shipment.zoneId];
    if (!z) return Number(shipment.shippingFee ?? 0);
    const priceByType =
      clientType === "vip"        ? z.priceVip :
      clientType === "commercial" ? z.priceCommercial :
      z.priceNormal;
    const resolved = priceByType != null && Number(priceByType) > 0 ? priceByType : z.price;
    return Number(resolved) || Number(shipment.shippingFee ?? 0) || 0;
  };

  // ── تكلفة المندوب الحقيقية — من شركة الشحن المرتبطة بالشحنة مباشرة ───────
  const shipmentCompanyIds = [...new Set(shipments.map(s => s.shippingCompanyId).filter((v): v is number => !!v))];
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
    if (!shipment?.shippingCompanyId) return shipment?.zoneId != null ? (zoneCostMap[shipment.zoneId] ?? 0) : 0;
    const company = companyCostModeMap[shipment.shippingCompanyId];
    if (company) {
      return company.costMode === "zone"
        ? (shipment.zoneId != null ? (zoneCostMap[shipment.zoneId] ?? 0) : 0)
        : company.shippingCost;
    }
    return shipment.zoneId != null ? (zoneCostMap[shipment.zoneId] ?? 0) : 0;
  };

  // ── إضافة نوع الشحنة (basePrice على سعر العميل) ──────────────────────────
  const parcelTypes = [...new Set(shipments.map(s => s.parcelType).filter((v): v is string => !!v))];
  let parcelBasePriceMap: Record<string, number> = {};
  if (parcelTypes.length) {
    const conds: any[] = [inArray(parcelTypePricingTable.parcelType, parcelTypes)];
    if (tenantId !== null) {
      conds.push(or(eq(parcelTypePricingTable.tenantId, tenantId), isNull(parcelTypePricingTable.tenantId)));
    }
    const pricingRows = await db
      .select({ tenantId: parcelTypePricingTable.tenantId, parcelType: parcelTypePricingTable.parcelType, basePrice: parcelTypePricingTable.basePrice })
      .from(parcelTypePricingTable)
      .where(and(...conds));
    for (const row of pricingRows) {
      const existing = parcelBasePriceMap[row.parcelType];
      const isTenantRow = row.tenantId != null;
      if (existing === undefined || isTenantRow) parcelBasePriceMap[row.parcelType] = Number(row.basePrice ?? 0);
    }
  }

  let total = 0;
  for (const shipment of shipments) {
    const clientType = shipment.clientId != null ? (clientTypeMap[shipment.clientId] ?? "normal") : "normal";
    const zoneShippingForItem = getZoneShipping(shipment, clientType);
    const zoneCostForItem = getZoneCost(shipment);
    const repExtraCost = (zoneShippingForItem > 0 && shipment.parcelType) ? (parcelBasePriceMap[shipment.parcelType] ?? 0) : 0;
    total += (zoneShippingForItem + repExtraCost) - zoneCostForItem;
  }

  return Number((total * deliveryRate).toFixed(2));
}

