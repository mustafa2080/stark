import { eq, and, inArray, or, isNull } from "drizzle-orm";
import {
  db,
  clientAccountManifestsTable,
  clientAccountManifestItemsTable,
  clientAccountPaymentsTable,
  shipmentsTable,
  shipmentZonesTable,
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
  manifests: { id: number; manifestNumber: string; closedAt: Date | null; createdAt: Date; itemsCount: number; value: number }[];
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
  const manifestResults: { id: number; manifestNumber: string; closedAt: Date | null; createdAt: Date; itemsCount: number; value: number }[] = [];

  if (manifestIds.length) {
    const items = await db
      .select()
      .from(clientAccountManifestItemsTable)
      .where(inArray(clientAccountManifestItemsTable.manifestId, manifestIds));

    const shipmentIds = items.map(i => i.shipmentId);
    const shipments = shipmentIds.length
      ? await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds))
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
    }

    for (const m of allManifests) {
      manifestResults.push({
        id: m.id,
        manifestNumber: m.manifestNumber,
        closedAt: m.closedAt ?? null,
        createdAt: m.createdAt,
        itemsCount: countByManifest[m.id] ?? 0,
        value: Number((valueByManifest[m.id] ?? 0).toFixed(2)),
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
