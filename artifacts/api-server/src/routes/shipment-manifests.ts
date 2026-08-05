import { Router, type IRouter } from "express";
import { eq, desc, and, inArray, sql, count, isNull, or } from "drizzle-orm";
import {
  db,
  shipmentManifestsTable,
  shipmentManifestItemsTable,
  shipmentsTable,
  shippingCompaniesTable,
  cashRegistersTable,
  cashTransactionsTable,
  warehousesTable,
  clientsTable,
  clientAccountAdjustmentsTable,
  representativeWalletTransactionsTable,
  shipmentZonesTable,
  zoneCostsTable,
  parcelTypePricingTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getTenantId } from "../middlewares/requireTenant.js";
import { syncShipmentInventory } from "./shipments.js";
import { syncShipmentItemsInventory } from "../lib/inventory.js";
import { syncShipmentStatusToManifests } from "../lib/manifestSync.js";
import { broadcastUrgentToCompany } from "./representative.js";
import { pushNotification } from "../lib/notifications.js";
import { computeManifestNetDue } from "../lib/manifestFinance.js";
import { invalidateSmartCache, invalidateChartsCache } from "./analytics.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── توليد رقم البيان ────────────────────────────────────────────────────────
async function generateManifestNumber(companyId: number): Promise<string> {
  const [row] = await db
    .select({ cnt: count() })
    .from(shipmentManifestsTable)
    .where(eq(shipmentManifestsTable.shippingCompanyId, companyId));
  const seq = (Number(row?.cnt ?? 0) + 1).toString().padStart(3, "0");
  return `SMF-${companyId}-${seq}`;
}

// ─── توليد رقم البيان لعميل تجاري (نمط مختلف عشان يتميز عن بيانات المناديب) ──
async function generateClientManifestNumber(clientId: number): Promise<string> {
  const [row] = await db
    .select({ cnt: count() })
    .from(shipmentManifestsTable)
    .where(eq(shipmentManifestsTable.clientId, clientId));
  const seq = (Number(row?.cnt ?? 0) + 1).toString().padStart(3, "0");
  return `SMC-${clientId}-${seq}`;
}

// ─── GET /shipment-manifests?companyId=X ─────────────────────────────────────
router.get("/shipment-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const reqUser = (req as any).user;
    // المندوب يشوف بيانات شركته بس — نتجاهل أي companyId جاي من العميل
    const companyId = reqUser?.role === "representative"
      ? reqUser.shippingCompanyId
      : (req.query.companyId ? Number(req.query.companyId) : undefined);
    // العميل التجاري يشوف بياناته هو بس — بدون أي إمكانية لتمرير clientId
    // من الـ query (أمان: منع عميل من رؤية بيانات عميل آخر)
    const clientId = reqUser?.role === "client" ? reqUser.clientId : undefined;

    // tenantId === null يعني super_admin → بدون فلتر tenant
    const tenantCondition = tenantId !== null
      ? or(eq(shipmentManifestsTable.tenantId, tenantId), isNull(shipmentManifestsTable.tenantId))
      : undefined;

    const where = and(
      tenantCondition,
      companyId ? eq(shipmentManifestsTable.shippingCompanyId, companyId) : undefined,
      clientId ? eq(shipmentManifestsTable.clientId, clientId) : undefined,
    );

    const manifests = await db
      .select()
      .from(shipmentManifestsTable)
      .where(where)
      .orderBy(desc(shipmentManifestsTable.createdAt));

    // جيب عدد الشحنات لكل بيان مع تفصيل الحالات
    const ids = manifests.map(m => m.id);
    let countMap: Record<number, number> = {};
    let statusCountMap: Record<number, { pending: number; delayed: number; returned: number; delivered: number; partial: number }> = {};
    if (ids.length) {
      const counts = await db
        .select({
          manifestId: shipmentManifestItemsTable.manifestId,
          deliveryStatus: shipmentManifestItemsTable.deliveryStatus,
          cnt: count(),
        })
        .from(shipmentManifestItemsTable)
        .where(inArray(shipmentManifestItemsTable.manifestId, ids))
        .groupBy(shipmentManifestItemsTable.manifestId, shipmentManifestItemsTable.deliveryStatus);

      counts.forEach(r => {
        const mid = r.manifestId;
        countMap[mid] = (countMap[mid] ?? 0) + Number(r.cnt);
        if (!statusCountMap[mid]) statusCountMap[mid] = { pending: 0, delayed: 0, returned: 0, delivered: 0, partial: 0 };
        const st = r.deliveryStatus ?? "pending";
        const n = Number(r.cnt);
        if (st === "pending") statusCountMap[mid].pending += n;
        else if (st === "delayed") statusCountMap[mid].delayed += n;
        else if (st === "returned") statusCountMap[mid].returned += n;
        else if (st === "delivered") statusCountMap[mid].delivered += n;
        else if (st === "partial_delivered") statusCountMap[mid].partial += n;
      });
    }

    // جيب اسم الشركة
    const companies = await db.select({ id: shippingCompaniesTable.id, name: shippingCompaniesTable.name, logo: shippingCompaniesTable.logo })
      .from(shippingCompaniesTable);
    const coMap: Record<number, { name: string; logo: string | null }> = {};
    companies.forEach(c => { coMap[c.id] = { name: c.name, logo: c.logo }; });

    // جيب اسم العميل (لبيانات العملاء التجاريين — shippingCompanyId يكون null هنا)
    const manifestClientIds = [...new Set(manifests.map(m => m.clientId).filter((v): v is number => !!v))];
    let clientMap: Record<number, { name: string; avatar: string | null }> = {};
    if (manifestClientIds.length) {
      const clientRows = await db.select({ id: clientsTable.id, name: clientsTable.name, avatar: clientsTable.avatar })
        .from(clientsTable).where(inArray(clientsTable.id, manifestClientIds));
      clientMap = Object.fromEntries(clientRows.map(c => [c.id, { name: c.name, avatar: c.avatar }]));
    }

    const result = manifests.map(m => ({
      ...m,
      shipmentCount: countMap[m.id] ?? 0,
      statusCounts: statusCountMap[m.id] ?? { pending: 0, delayed: 0, returned: 0, delivered: 0, partial: 0 },
      companyName: m.shippingCompanyId ? (coMap[m.shippingCompanyId]?.name ?? "") : "",
      companyLogo: m.shippingCompanyId ? (coMap[m.shippingCompanyId]?.logo ?? null) : null,
      clientName: m.clientId ? (clientMap[m.clientId]?.name ?? "") : "",
      clientAvatar: m.clientId ? (clientMap[m.clientId]?.avatar ?? null) : null,
    }));

    res.json(result);
  } catch (e) {
    console.error("[GET /shipment-manifests]", e);
    res.status(500).json({ error: "خطأ في جلب البيانات" });
  }
});

// ─── GET /shipment-manifests/:id ─────────────────────────────────────────────
router.get("/shipment-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [manifest] = await db.select().from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }

    // ── اسم المندوب: في هذا النظام "شركة الشحن" تحمل اسم المندوب نفسه ──
    let manifestRepName: string | null = null;
    if (manifest.shippingCompanyId) {
      const [company] = await db
        .select({ name: shippingCompaniesTable.name })
        .from(shippingCompaniesTable)
        .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId))
        .limit(1);
      manifestRepName = company?.name ?? null;
    }

    // المندوب يشوف بيانات شركته فقط، والعميل التجاري يشوف بياناته هو فقط
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative" && manifest.shippingCompanyId !== reqUser.shippingCompanyId) {
      res.status(403).json({ error: "غير مصرح بعرض هذا البيان" });
      return;
    }
    if (reqUser?.role === "client" && manifest.clientId !== reqUser.clientId) {
      res.status(403).json({ error: "غير مصرح بعرض هذا البيان" });
      return;
    }

    const items = await db
      .select()
      .from(shipmentManifestItemsTable)
      .where(eq(shipmentManifestItemsTable.manifestId, id));

    const shipmentIds = items.map(i => i.shipmentId);
    let shipments: any[] = [];
    if (shipmentIds.length) {
      shipments = await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds));
    }

    const shipmentMap: Record<number, any> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    // ── جلب أسماء المخازن (warehouseId) دفعة واحدة — المخزن اللي المرتجع بيرجع له ──
    const warehouseIds = [...new Set(shipments.map(s => s.warehouseId).filter((v): v is number => !!v))];
    let warehouseNameMap: Record<number, string> = {};
    if (warehouseIds.length) {
      const warehouseRows = await db
        .select({ id: warehousesTable.id, name: warehousesTable.name })
        .from(warehousesTable)
        .where(inArray(warehousesTable.id, warehouseIds));
      warehouseNameMap = Object.fromEntries(warehouseRows.map(w => [w.id, w.name]));
    }

    // ── جلب أسعار المناطق (من قسم "المناطق والأسعار") دفعة واحدة لكل الشحنات في البيان ──
    const zoneIds = [...new Set(shipments.map(s => s.zoneId).filter((v): v is number => !!v))];
    let zonePriceMap: Record<number, number> = {};
    if (zoneIds.length) {
      const zoneRows = await db
        .select({ id: shipmentZonesTable.id, price: shipmentZonesTable.price })
        .from(shipmentZonesTable)
        .where(inArray(shipmentZonesTable.id, zoneIds));
      zonePriceMap = Object.fromEntries(zoneRows.map(z => [z.id, Number(z.price ?? 0)]));
    }

    const parcelTypes = [...new Set(shipments.map(s => s.parcelType).filter((v): v is string => !!v))];
    let parcelPricingMap: Record<string, { label: string; repExtraCost: number }> = {};
    if (parcelTypes.length) {
      const conds: any[] = [inArray(parcelTypePricingTable.parcelType, parcelTypes)];
      if (manifest.tenantId !== null && manifest.tenantId !== undefined) {
        conds.push(or(eq(parcelTypePricingTable.tenantId, manifest.tenantId), isNull(parcelTypePricingTable.tenantId)));
      }
      const pricingRows = await db
        .select({
          tenantId: parcelTypePricingTable.tenantId,
          parcelType: parcelTypePricingTable.parcelType,
          label: parcelTypePricingTable.label,
          repExtraCost: parcelTypePricingTable.repExtraCost,
        })
        .from(parcelTypePricingTable)
        .where(and(...conds));
      const currentTenantId = manifest.tenantId ?? null;
      for (const row of pricingRows) {
        const existing = parcelPricingMap[row.parcelType];
        const isTenantRow = row.tenantId !== null && row.tenantId !== undefined && row.tenantId === currentTenantId;
        if (!existing || isTenantRow) {
          parcelPricingMap[row.parcelType] = {
            label: row.label ?? row.parcelType,
            repExtraCost: Number(row.repExtraCost ?? 0),
          };
        }
      }
    }

    const enrichedItems = items.map(item => {
      const sh = shipmentMap[item.shipmentId] ?? null;
      return {
        ...item,
        shipment: sh,
        // حقول مُستخرجة مباشرةً من بيانات الشحنة للفرونت
        customerName:  sh?.receiverName  ?? "",
        phone:         sh?.receiverPhone ?? "",
        city:          sh?.receiverCity  ?? "",
        address:       sh?.receiverAddress ?? "",
        senderName:    sh?.senderName    ?? "",
        quantity:      sh?.pieces        ?? 1,
        zoneId:        sh?.zoneId ?? null,
        // سعر المنطقة (المحافظة) من قسم "المناطق والأسعار" — لعرضه في عمود "شحن" بالجدول
        zonePrice:     sh?.zoneId != null ? (zonePriceMap[sh.zoneId] ?? null) : null,
        // الإجمالي = مبلغ التحصيل (codAmount) + سعر الشحن (shippingFee)، زي قسم "الشحنات" بالظبط
        totalPrice:    Number(sh?.codAmount ?? sh?.totalAmount ?? 0) + Number(sh?.shippingFee ?? 0),
        unitPrice:     Number(sh?.codAmount ?? sh?.totalAmount ?? 0) + Number(sh?.shippingFee ?? 0),
        shippingCost:  Number(sh?.shippingFee ?? 0),
        parcelType:    sh?.parcelType ?? null,
        repExtraCost:  sh?.parcelType ? (parcelPricingMap[sh.parcelType]?.repExtraCost ?? 0) : 0,
        repExtraReason: sh?.parcelType && (parcelPricingMap[sh.parcelType]?.repExtraCost ?? 0) > 0
          ? (parcelPricingMap[sh.parcelType]?.label ?? sh.parcelType)
          : null,
        invoiceNumber: sh?.shipmentNumber ?? "",
        warehouseName: sh?.warehouseId ? (warehouseNameMap[sh.warehouseId] ?? null) : null,
        returnReceived: sh?.returnReceived ?? null,
        manifestRepName,
      };
    });

    // إحصائيات
    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending").length;
    const delayed   = items.filter(i => i.deliveryStatus === "delayed").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered" || i.deliveryStatus === "partial_received").length;

    // ─── حسابات مالية (P&L) ───────────────────────────────────────────────
    // الحقول:
    //   cod      = قيمة الشحنة (COD) التي يدفعها العميل
    //   shipping = رسوم الشحن (shippingFee) التي تأخذها شركة الشحن
    //   cost     = تكلفة البضاعة (costPrice)
    let totalRevenue = 0, totalCost = 0, totalShippingCost = 0, returnLosses = 0, deliveredGross = 0;
    // إجمالي رسوم الشحن (shippingFee) للشحنات المسلَّمة — تُخصم من المستحق وتدخل في حساب الربح
    let deliveredShippingFees = 0;
    for (const item of items) {
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
      const shipping = Number(shipment.shippingFee ?? 0);
      const cost     = Number(shipment.costPrice ?? 0);

      if (item.deliveryStatus === "delivered") {
        // القيمة الفعلية المستلمة لو المندوب دخلها (زيادة أو نقص)، وإلا السعر الإجمالي للطلب (totalAmount)
        // — نفس مصدر القيمة المستخدم في صفحة تفاصيل البيان (لازم يفضل متطابق معاه).
        const dvr = (item as any).deliveredValueReceived;
        const actualCod = dvr != null ? Number(dvr) : Number(shipment.totalAmount ?? cod);
        totalRevenue += actualCod;
        deliveredGross += actualCod;
        totalCost += cost;
        totalShippingCost += shipping;
        deliveredShippingFees += shipping;
      } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
        // partialQuantity هنا قيمة مالية فعلية أدخلها المندوب (مش عدد قطع) — تُستخدم كما هي كإيراد فعلي
        const partialCod = Number(item.partialQuantity);
        totalRevenue += partialCod;
        deliveredGross += partialCod;
        // رسوم الشحن تُحسب دايمًا طالما فيه جزء اتسلم، بغض النظر عن استلام المرتجع من شركة الشحن
        totalShippingCost += shipping;
        deliveredShippingFees += shipping;
        // ملاحظة: returnReceived بيتحكم في المخزون فقط، ومالوش أي تأثير على الإيرادات هنا
      } else if (item.deliveryStatus === "partial_received") {
        // إشعار "باقي مرتجع من استلام جزئي" مُرحَّل من بيان قديم — بدون قيمة
        // مالية (زي المرتجع العادي بالظبط)، حتى بعد تأكيد الاستلام. الجزء
        // المسلَّم الفعلي محسوب أصلًا في البيان القديم على السجل الأصلي.
      } else if (item.deliveryStatus === "returned") {
        // مرتجع بسبب مالي (رفض بعد معاينة مدفوع/غير مدفوع، أو هروب بدون معاينة):
        // المندوب راح فعليًا وتحرك، فتكلفة الشحن اتصرفت بغض النظر عن نتيجة التحصيل —
        // تُحسب دايمًا في الحالات الثلاث دي، حتى لو القيمة المستلمة فعليًا = صفر
        // (نفس منطق صفحة تفاصيل البيان — لازم يفضل متطابق معاه).
        const returnReasonHasValue = ["refused_paid", "refused_unpaid", "quality"].includes((item as any).returnReason);
        if (returnReasonHasValue) {
          const manualVal = Number((item as any).returnValueReceived ?? 0);
          deliveredGross += manualVal;
          deliveredShippingFees += shipping;
          totalRevenue += manualVal;
          totalShippingCost += shipping;
        }
      } else {
        // pending/delayed → لسه عند شركة الشحن، مفيش تكلفة شحن تُحسب عليه دلوقتي
      }
    }
    const netProfit = totalRevenue - totalCost - totalShippingCost - returnLosses;

    // ─── حسابات بيان التسوية الجديدة ───────────────────────────────────────
    const [company] = await db.select().from(shippingCompaniesTable)
      .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId));

    // تكلفة المندوب تُحسب تلقائيًا من تكلفة الشحن المسجّلة على شركة الشحن نفسها
    // (company.shippingCost) × عدد الشحنات اللي اتصرف عليها تكلفة شحن فعليًا، بدل
    // الإدخال اليدوي القديم. لو الشركة معندهاش shippingCost مسجل → صفر.
    // ملحوظة مهمة: تكلفة الشحن مش بس على "delivered" — المندوب بيتحرك فعليًا (وبالتالي
    // تُحسب عليه تكلفة شحن) كمان في المرتجع بالأسباب المالية الثلاثة: رفض الاستلام بعد
    // المعاينة (مدفوع/غير مدفوع)، أو الهروب من الاستلام بدون معاينة — لازم تفضل مطابقة
    // لـ RETURN_REASONS_IN_PNL تحت بالظبط.
    const RETURN_REASONS_WITH_SHIPPING_COST = ["refused_paid", "refused_unpaid", "quality"];
    const returnedWithShippingCost = items.filter(i =>
      i.deliveryStatus === "returned" && RETURN_REASONS_WITH_SHIPPING_COST.includes((i as any).returnReason)
    ).length;
    const isItemEligibleForCourierCost = (i: any) =>
      i.deliveryStatus === "delivered" ||
      i.deliveryStatus === "partial_delivered" ||
      (i.deliveryStatus === "returned" && RETURN_REASONS_WITH_SHIPPING_COST.includes(i.returnReason));
    const courierCostPerShipment = Math.abs(Number(company?.shippingCost ?? 0));
    const repExtraCostBreakdown = items
      .filter(isItemEligibleForCourierCost)
      .map(item => {
        const sh = shipmentMap[item.shipmentId];
        const pricing = sh?.parcelType ? parcelPricingMap[sh.parcelType] : null;
        const amount = Math.abs(Number(pricing?.repExtraCost ?? 0));
        return amount > 0 ? {
          shipmentId: item.shipmentId,
          parcelType: sh?.parcelType ?? null,
          reason: pricing?.label ?? sh?.parcelType ?? "نوع الشحنة",
          amount,
        } : null;
      })
      .filter(Boolean);
    const repExtraCostTotal = repExtraCostBreakdown.reduce((s: number, x: any) => s + Number(x.amount ?? 0), 0);
    const courierBaseCost = courierCostPerShipment * (delivered + returnedWithShippingCost);
    const courierCostManual = courierBaseCost + repExtraCostTotal;
    // صافي المستحق للشركة = إجمالي المسلَّم (COD) − تكلفة المندوب
    const netDueToCompany   = deliveredGross - courierCostManual;
    // صافي الربح الحقيقي = إجمالي رسوم الشحن − تكلفة المندوب
    const realNetProfit     = deliveredShippingFees - courierCostManual;

    res.json({
      ...manifest,
      closedByName: manifest.closedByRole === "representative" ? manifestRepName : null, // اسم المندوب اللي قفل البيان مؤقتًا
      company: company ?? null,
      items: enrichedItems,
      stats: {
        total: items.length, delivered, returned, pending, delayed, partial,
        totalRevenue, totalCost, totalShippingCost, returnLosses,
        netProfit, deliveredGross,
        // ── بيان التسوية الجديد ──
        deliveredShippingFees,                       // إجمالي رسوم الشحن (shippingFee) للشحنات المسلَّمة
        netDueToCompany,                             // صافي المستحق للشركة = المسلَّم − تكلفة المندوب
        realNetProfit,                               // صافي الربح الحقيقي = رسوم الشحن − تكلفة المندوب
        courierBaseCost,
        repExtraCostTotal,
        repExtraCostBreakdown,
      },
      courierCostManual, // محسوبة تلقائيًا الآن من company.shippingCost × عدد المسلَّم
    });
  } catch (e) {
    console.error("[GET /shipment-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في جلب البيان" });
  }
});

// ─── POST /shipment-manifests ─────────────────────────────────────────────────
// shippingCompanyId اختيارية دلوقتي — لو الطالب عميل تجاري (role=client) بيتجاهل
// أي shippingCompanyId جاي في الـ body، وبيتحدد clientId من التوكن مباشرةً (أمان:
// العميل مايقدرش ينشئ بيان باسم عميل تاني حتى لو عدّل الـ body يدوياً).
const CreateSchema = z.object({
  shippingCompanyId: z.number().int().positive().nullish(),
  shipmentIds:       z.array(z.number().int().positive()).min(1),
  notes:             z.string().nullish(),
});

router.post("/shipment-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const reqUser = (req as any).user;
    const body = CreateSchema.parse(req.body);

    const isClientRequest = reqUser?.role === "client";
    const clientId = isClientRequest ? reqUser.clientId : undefined;

    if (isClientRequest && !clientId) {
      res.status(403).json({ error: "لا يوجد حساب عميل مرتبط بهذا الحساب" });
      return;
    }
    if (!isClientRequest && !body.shippingCompanyId) {
      res.status(400).json({ error: "shippingCompanyId مطلوب" });
      return;
    }

    // لو عميل: تأكد إن كل الشحنات المختارة بتاعته هو فعلاً (سيرفر-سايد،
    // بغض النظر عن الشحنات اللي عرضها الفرونت إند) — منع أي محاولة لضم
    // شحنة بتاعة عميل تاني بتعديل الـ request يدوياً.
    if (isClientRequest) {
      const ownedShipments = await db
        .select({ id: shipmentsTable.id })
        .from(shipmentsTable)
        .where(and(
          inArray(shipmentsTable.id, body.shipmentIds),
          eq(shipmentsTable.clientId, clientId!),
        ));
      if (ownedShipments.length !== body.shipmentIds.length) {
        res.status(403).json({ error: "بعض الشحنات المختارة لا تخص هذا العميل" });
        return;
      }
    }

    // تأكد مفيش بيان مفتوح لنفس الشركة/العميل
    const [existing] = await db
      .select({ id: shipmentManifestsTable.id })
      .from(shipmentManifestsTable)
      .where(and(
        isClientRequest
          ? eq(shipmentManifestsTable.clientId, clientId!)
          : eq(shipmentManifestsTable.shippingCompanyId, body.shippingCompanyId!),
        eq(shipmentManifestsTable.status, "open"),
        tenantId !== null
          ? or(eq(shipmentManifestsTable.tenantId, tenantId), isNull(shipmentManifestsTable.tenantId))
          : undefined,
      ));
    if (existing) {
      res.status(409).json({ error: isClientRequest ? "يوجد بيان مفتوح بالفعل لحسابك" : "يوجد بيان مفتوح بالفعل لهذه الشركة" });
      return;
    }

    const manifestNumber = isClientRequest
      ? await generateClientManifestNumber(clientId!)
      : await generateManifestNumber(body.shippingCompanyId!);
    const now = new Date();

    const [result] = await db.insert(shipmentManifestsTable).values({
      tenantId:          tenantId ?? null,
      manifestNumber,
      shippingCompanyId: isClientRequest ? null : body.shippingCompanyId!,
      clientId:          isClientRequest ? clientId! : null,
      status:            "open",
      notes:             body.notes ?? null,
      createdAt:         now,
    });
    const manifestId = (result as any).insertId as number;

    // أضف الشحنات للبيان
    await db.insert(shipmentManifestItemsTable).values(
      body.shipmentIds.map(sid => ({
        manifestId,
        shipmentId:     sid,
        deliveryStatus: "pending",
        addedAt:        now,
      }))
    );

    // حدّث حالة الشحنات → in_shipping. لو الشركة (مندوب) هي اللي بتنشئ البيان
    // بنسجل shippingCompanyId على الشحنة كمان؛ لو عميل، ما نلمسش shippingCompanyId
    // بتاع الشحنة خالص (مالوش علاقة ببيان العميل).
    await db.update(shipmentsTable)
      .set(isClientRequest
        ? { status: "in_shipping", updatedAt: now }
        : { status: "in_shipping", shippingCompanyId: body.shippingCompanyId!, updatedAt: now })
      .where(inArray(shipmentsTable.id, body.shipmentIds));

    res.status(201).json({
      id: manifestId,
      manifestNumber,
      shipmentCount: body.shipmentIds.length,
    });
  } catch (e: any) {
    console.error("[POST /shipment-manifests]", e);
    if (e?.name === "ZodError") { res.status(400).json({ error: e.errors[0]?.message }); return; }
    res.status(500).json({ error: "خطأ في إنشاء البيان" });
  }
});

// ─── PATCH /shipment-manifests/:id/items/:shipmentId ─────────────────────────
const UpdateItemSchema = z.object({
  // partial_received مقبولة كمرادف لـ partial_delivered (فرق تسمية قديم بين
  // بيانات الشحنة وجدول shipments نفسه) — بنطبّعها فورًا بعد الـ parse تحت.
  // postponed ("قيد الشحن") من خيارات الفرونت إند (SHIPMENT_DELIVERY_OPTIONS) —
  // لازم تكون مقبولة هنا وإلا فشل الحفظ بـ 500 وقت اختيارها.
  deliveryStatus: z.enum(["pending", "delivered", "returned", "delayed", "partial_delivered", "partial_received", "postponed"]),
  deliveryNote:   z.string().nullish(),
  partialQuantity: z.number().int().nullish(),
  returnReceived: z.boolean().nullish(),
  returnReason:   z.string().nullish(),
  returnValueReceived: z.coerce.number().nullish(),
  deliveredValueReceived: z.coerce.number().nullish(),
  itemReceivedQuantities: z.record(z.string(), z.coerce.number().int().min(0)).nullish(),
});

router.patch("/shipment-manifests/:id/items/:shipmentId", async (req, res): Promise<void> => {
  try {
    const manifestId  = Number(req.params.id);
    const shipmentId  = Number(req.params.shipmentId);
    const parsedBody  = UpdateItemSchema.parse(req.body);
    // تطبيع partial_received → partial_delivered عشان باقي الراوت (statusMap، شروط
    // الحسابات المالية، إلخ) يتعامل مع قيمة واحدة بس زي ما كان متوقع أصلًا.
    // postponed تعدّي زي ما هي بدون تطبيع (مالهاش مرادف).
    const body = {
      ...parsedBody,
      deliveryStatus: (parsedBody.deliveryStatus === "partial_received" ? "partial_delivered" : parsedBody.deliveryStatus) as
        "pending" | "delivered" | "returned" | "delayed" | "partial_delivered" | "postponed",
    };
    const now         = new Date();

    // المندوب يقدر يعدّل بيانات شركته بس، وبشرط البيان يكون لسه مفتوح من ناحيته
    // (نفحص closedByRole مش status بس — لأن قفل المندوب "مؤقت" وميغيّرش status)
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative") {
      const [manifestRow] = await db.select({
        shippingCompanyId: shipmentManifestsTable.shippingCompanyId,
        status: shipmentManifestsTable.status,
        closedByRole: shipmentManifestsTable.closedByRole,
      }).from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, manifestId)).limit(1);
      if (!manifestRow || manifestRow.shippingCompanyId !== reqUser.shippingCompanyId) {
        res.status(403).json({ error: "غير مصرح بتعديل هذا البيان" });
        return;
      }
      if (manifestRow.status === "closed" || manifestRow.closedByRole) {
        res.status(400).json({ error: "البيان مغلق — لا يمكن التعديل" });
        return;
      }
    }

    await db.update(shipmentManifestItemsTable)
      .set({
        deliveryStatus: body.deliveryStatus,
        deliveryNote:   body.deliveryNote ?? null,
        partialQuantity: body.partialQuantity ?? null,
        // returnReason و returnValueReceived: لو الطلب مابعتهمش (undefined) — زي زرار
        // "تم الاستلام" السريع اللي بيبعت returnReceived بس — نسيب القيمة القديمة زي
        // ما هي (undefined في drizzle .set = تجاهل العمود)، عشان الحسابات المالية
        // اللي اتسجلت وقت تسجيل المرتجع تفضل زي ما هي ومتتصفرش بمجرد "تم الاستلام".
        ...(body.returnReason !== undefined ? { returnReason: body.returnReason ?? null } : {}),
        returnReceived: body.returnReceived == null ? null : body.returnReceived ? 1 : 0,
        ...(body.returnValueReceived !== undefined ? { returnValueReceived: body.returnValueReceived == null ? null : String(body.returnValueReceived) } : {}),
        ...(body.deliveredValueReceived !== undefined ? { deliveredValueReceived: body.deliveredValueReceived == null ? null : String(body.deliveredValueReceived) } : {}),
        deliveredAt:    (body.deliveryStatus === "delivered" || body.deliveryStatus === "partial_delivered") ? now : undefined,
      })
      .where(and(
        eq(shipmentManifestItemsTable.manifestId, manifestId),
        eq(shipmentManifestItemsTable.shipmentId, shipmentId),
      ));

    // حدّث حالة الشحنة نفسها — partial_delivered (البيان) يقابل partial_received (شحنات) بنفس الاسم
    // عشان عمود "الحالة" في صفحة الشحنات يفضل واحد ثابت، والفرق (لسه عند الشحن / في المخزن) بييجي من returnReceived
    //
    // ملاحظة: لو "مرتجع" واتسجل returnReceived=true (يعني رجعت المخزن فعليًا) —
    // الحالة تفضل "returned". صفحة المخزون (warehouses.ts) عندها تاب "مرتجع" مخصص
    // بيفلتر بالظبط على status=returned AND returnReceived=1، فالشحنة بتظهر هناك
    // صح كمرتجع مستلم فعليًا — مش بتتفقد. رجوعها warehouse_ready تلقائيًا كان بيخليها
    // تظهر جاهزة لبيان شحن جديد من غير ما حد يراجعها؛ نقلها لقيد الشحن لازم يبقى
    // قرار يدوي من المسؤول بعد المراجعة، مش تلقائي بمجرد الاستلام.
    const statusMap: Record<string, string> = {
      delivered: "delivered",
      returned:  "returned",
      delayed:   "delayed",
      partial_delivered: "partial_received",
      pending:   "in_transit",
      postponed: "in_transit",
    };

    // ربط المخزون: لو الحالة "مرتجع" أو "استلام جزئي" → نفس منطق صفحة الشحنة مباشرة
    // (deliveryStatus بتاع البيان بيستخدم "partial_delivered"، نظام المخزون بيتوقع "partial_received")
    const inventoryStatus =
      body.deliveryStatus === "returned"          ? "returned" :
      body.deliveryStatus === "partial_delivered" ? "partial_received" :
      undefined;

    const shipmentPatch: Record<string, any> = {
      status: statusMap[body.deliveryStatus] ?? "in_transit",
      updatedAt: now,
    };
    if (body.partialQuantity != null) shipmentPatch.partialQuantity = body.partialQuantity;
    // returnReceived و returnReason بتاعين "مرتجع"/"استلام جزئي" — لازم ينعكسوا على جدول الشحنات
    // عشان صفحة الشحنات تعرض نفس التاج (ما زال عند شركة الشحن / في المخزن) من البيان
    if (body.deliveryStatus === "returned" || body.deliveryStatus === "partial_delivered") {
      shipmentPatch.returnReceived = body.returnReceived == null ? null : body.returnReceived ? 1 : 0;
    } else {
      shipmentPatch.returnReceived = null;
    }
    // returnReason: لو الطلب مابعتهش (زرار "تم الاستلام" السريع) نسيبها زي ما هي
    if (body.deliveryStatus === "returned" && body.returnReason !== undefined) {
      shipmentPatch.returnReason = body.returnReason ?? null;
    }

    if (inventoryStatus) {
      const [existingShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
      if (existingShipment) {
        // منتج واحد (single product) على الشحنة نفسها — afterPatch.status هنا للمخزون فقط
        // (مش نفس status اللي هيتسجل فعليًا)، فبنستخدم نسخة مؤقتة ونلقط الفلاجز اللي ضافها
        const invPatch: Record<string, any> = { ...shipmentPatch, status: inventoryStatus };
        await syncShipmentInventory(existingShipment, invPatch);
        if (invPatch.inventoryDeducted != null) shipmentPatch.inventoryDeducted = invPatch.inventoryDeducted;
        if (invPatch.inventoryReturned != null) shipmentPatch.inventoryReturned = invPatch.inventoryReturned;
        // منتجات متعددة (shipment_items) على الشحنة
        await syncShipmentItemsInventory(shipmentId, inventoryStatus, body.itemReceivedQuantities ?? undefined, body.returnReceived === true);
      }
    }

    await db.update(shipmentsTable)
      .set(shipmentPatch)
      .where(eq(shipmentsTable.id, shipmentId));

    // مزامنة الحالة الجديدة مع بيان حساب العميل التجاري فقط (لو الشحنة مضافة له كمان).
    // ملحوظة: مش بنمرر التحديث لبيان شركة الشحن نفسه هنا لأننا أصلاً حدّثنا
    // deliveryStatus فوق بالقيمة الدقيقة اللي المستخدم اختارها (زي "postponed").
    // الـ statusMap العام جوه syncShipmentStatusToManifests مبيفرقش بين
    // pending/postponed (الاثنين بيترجموا لـ in_transit)، فلو سبناها تحدّث
    // shipmentManifestItemsTable كمان كانت بترجّع "postponed" لـ "pending" فورًا
    // بعد الحفظ (كانت هي سبب مشكلة "قيد الشحن" بترجع قيد الانتظار بعد الريفريش).
    if (shipmentPatch.status) {
      await syncShipmentStatusToManifests(shipmentId, shipmentPatch.status, { skipShipmentManifestItems: true });
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("[PATCH /shipment-manifests/:id/items/:shipmentId]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الشحنة" });
  }
});

// ─── DELETE /shipment-manifests/:id/items/:shipmentId — إلغاء الشحنة خالص من البيان ──
router.delete("/shipment-manifests/:id/items/:shipmentId", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const shipmentId = Number(req.params.shipmentId);

    // المندوب يقدر يمسح من بيان شركته بس، وبشرط البيان لسه مفتوح من ناحيته
    const reqUser = (req as any).user;
    const [manifestRow] = await db.select({
      shippingCompanyId: shipmentManifestsTable.shippingCompanyId,
      status: shipmentManifestsTable.status,
      closedByRole: shipmentManifestsTable.closedByRole,
    }).from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, manifestId)).limit(1);

    if (!manifestRow) { res.status(404).json({ error: "البيان غير موجود" }); return; }

    if (reqUser?.role === "representative") {
      if (manifestRow.shippingCompanyId !== reqUser.shippingCompanyId) {
        res.status(403).json({ error: "غير مصرح بتعديل هذا البيان" });
        return;
      }
      if (manifestRow.status === "closed" || manifestRow.closedByRole) {
        res.status(400).json({ error: "البيان مغلق — لا يمكن التعديل" });
        return;
      }
    }

    const [item] = await db.select({ id: shipmentManifestItemsTable.id })
      .from(shipmentManifestItemsTable)
      .where(and(
        eq(shipmentManifestItemsTable.manifestId, manifestId),
        eq(shipmentManifestItemsTable.shipmentId, shipmentId),
      ))
      .limit(1);

    if (!item) { res.status(404).json({ error: "الشحنة غير موجودة في هذا البيان" }); return; }

    await db.delete(shipmentManifestItemsTable).where(eq(shipmentManifestItemsTable.id, item.id));

    // رجّع حالة الشحنة نفسها → قيد الشحن في المخزن (زي قبل ما تتضاف للبيان)
    await db.update(shipmentsTable)
      .set({ status: "warehouse_ready", updatedAt: new Date() })
      .where(eq(shipmentsTable.id, shipmentId));

    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /shipment-manifests/:id/items/:shipmentId]", e);
    res.status(500).json({ error: "خطأ في إلغاء الشحنة من البيان" });
  }
});

// ─── PATCH /shipment-manifests/:id/items/:shipmentId/urgent — تفعيل/إلغاء الاستعجال ──
router.patch("/shipment-manifests/:id/items/:shipmentId/urgent", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const shipmentId = Number(req.params.shipmentId);
    const { isUrgent, urgentNote } = z.object({
      isUrgent:   z.boolean(),
      urgentNote: z.string().max(255).optional().nullable(),
    }).parse(req.body);

    // تأكد إن البيان موجود والمستخدم مش مندوب (المندوب مش يقدر يستعجل نفسه)
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative") {
      res.status(403).json({ error: "المندوب لا يملك صلاحية هذا الإجراء" });
      return;
    }

    const [item] = await db
      .select({ id: shipmentManifestItemsTable.id })
      .from(shipmentManifestItemsTable)
      .where(and(
        eq(shipmentManifestItemsTable.manifestId, manifestId),
        eq(shipmentManifestItemsTable.shipmentId, shipmentId),
      ))
      .limit(1);

    if (!item) { res.status(404).json({ error: "الشحنة غير موجودة في هذا البيان" }); return; }

    await db
      .update(shipmentManifestItemsTable)
      .set({
        isUrgent:   isUrgent ? 1 : 0,
        urgentNote: isUrgent ? (urgentNote ?? null) : null,
        urgentAt:   isUrgent ? new Date() : null,
      })
      .where(eq(shipmentManifestItemsTable.id, item.id));

    // ─── SSE: أبلّغ المندوب فوراً ───────────────────────────────────────────
    if (isUrgent) {
      const [manifest] = await db
        .select({ shippingCompanyId: shipmentManifestsTable.shippingCompanyId, manifestNumber: shipmentManifestsTable.manifestNumber })
        .from(shipmentManifestsTable)
        .where(eq(shipmentManifestsTable.id, manifestId))
        .limit(1);
      if (manifest?.shippingCompanyId) {
        const [shipmentItem] = await db
          .select({
            customerName: shipmentsTable.receiverName,
            phone:        shipmentsTable.receiverPhone,
            city:         shipmentsTable.receiverCity,
            invoiceNumber:shipmentsTable.shipmentNumber,
            totalPrice:   shipmentsTable.totalAmount,
          })
          .from(shipmentsTable)
          .where(eq(shipmentsTable.id, shipmentId))
          .limit(1);
        broadcastUrgentToCompany(manifest.shippingCompanyId, {
          type: "urgent",
          manifestId,
          manifestNumber: manifest.manifestNumber,
          shipmentId,
          urgentNote: urgentNote ?? null,
          urgentAt: new Date().toISOString(),
          ...(shipmentItem ?? {}),
        });
      }
    }

    res.json({ success: true, isUrgent });
  } catch (e: any) {
    console.error("[PATCH /shipment-manifests/:id/items/:shipmentId/urgent]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الاستعجال" });
  }
});

// ─── حساب صافي المستحق من بيان معين — منقولة لـ lib/manifestFinance.ts (computeManifestNetDue)
// عشان تُستخدم كمان في /representative/wallet بدون circular import مع representative.ts


// ─── تحويل إيراد البيان للخزنة عند الإغلاق ──────────────────────────────────
async function createTreasuryEntryOnClose(
  manifest: typeof shipmentManifestsTable.$inferSelect,
  items: (typeof shipmentManifestItemsTable.$inferSelect)[],
  userId: number | null,
  userName: string | null,
): Promise<void> {
  const now = new Date();
  const netDueToCompany = (await computeManifestNetDue(manifest, items)).net;

  // جيب شركة الشحن (لاسمها في وصف حركة الخزنة)
  const [company] = await db.select().from(shippingCompaniesTable)
    .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId));

  // جيب الشحنات لخصم أجرة الشحن على حساب كل عميل (مصروف منفصل لكل عميل)
  const shipmentIds = items.map(i => i.shipmentId);
  const shipments = shipmentIds.length > 0
    ? await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds))
    : [];
  const shipmentMap = new Map(shipments.map(s => [s.id, s]));

  // ─── خصم أجرة الشحن على حساب كل عميل، لكل شحنة "مُسلَّمة" فعلاً في البيان ──
  // (مصروف منفصل لكل عميل — مش مصروف إجمالي واحد على مستوى البيان)
  {
    const deliveredWithClient = items.filter(item => {
      const shipment = shipmentMap.get(item.shipmentId);
      return item.deliveryStatus === "delivered" && shipment?.clientId != null;
    });

    if (deliveredWithClient.length > 0) {
      const clientIds = [...new Set(
        deliveredWithClient.map(item => shipmentMap.get(item.shipmentId)!.clientId as number)
      )];
      const clientsRows = await db.select().from(clientsTable).where(inArray(clientsTable.id, clientIds));
      const clientMap = new Map(clientsRows.map(c => [c.id, c]));

      for (const item of deliveredWithClient) {
        const shipment = shipmentMap.get(item.shipmentId)!;
        const client = clientMap.get(shipment.clientId as number);
        if (!client?.normalizedPhone) continue;

        const shippingFee = Number(shipment.shippingFee ?? 0);
        if (shippingFee <= 0) continue;

        await db.insert(clientAccountAdjustmentsTable).values({
          tenantId: manifest.tenantId ?? null,
          clientPhone: client.phone,
          normalizedPhone: client.normalizedPhone,
          type: "shipping_fee",
          direction: "debit",
          amount: String(shippingFee),
          linkedShipmentId: shipment.id,
          reason: `أجرة شحن — بيان ${manifest.manifestNumber} — شحنة #${shipment.shipmentNumber ?? shipment.id}`,
          createdByUserId: userId,
          createdByName: userName,
          adjustedAt: now,
          createdAt: now,
        }).catch((e) => console.error("[createTreasuryEntryOnClose] client adjustment error", e));
      }
    }
  }

  if (netDueToCompany <= 0) return;

  // جيب الخزنة الرئيسية
  const [mainRegister] = await db
    .select()
    .from(cashRegistersTable)
    .where(and(eq(cashRegistersTable.type, "main"), eq(cashRegistersTable.isActive, true)))
    .limit(1);

  if (!mainRegister) return;

  const balanceBefore = Number(mainRegister.balance ?? 0);
  const balanceAfter  = balanceBefore + netDueToCompany;

  await db.insert(cashTransactionsTable).values({
    registerId:      mainRegister.id,
    type:            "shipping_transfer" as any,
    amount:          String(netDueToCompany),
    balanceBefore:   String(balanceBefore),
    balanceAfter:    String(balanceAfter),
    description:     `تحصيل بيان شحنات ${manifest.manifestNumber} - ${company?.name ?? ""}`,
    referenceNumber: manifest.manifestNumber,
    transactionDate: now,
    createdByUserId: userId,
    createdByName:   userName,
    createdAt:       now,
  });

  await db.update(cashRegistersTable)
    .set({ balance: String(balanceAfter), updatedAt: now })
    .where(eq(cashRegistersTable.id, mainRegister.id));
}

// ─── تصفية محفظة المندوب عند إغلاقه بيانه بنفسه ──────────────────────────────
// المندوب هو اللي سلّم الفلوس بمجرد إغلاق البيان، فرصيده المتعلّق بالبيان ده
// بيتصفّر لحظيًا. بنسجل حركة (سجل تاريخي) بالقيمة المستحقة (netDueToCompany)،
// بدون تراكم فعلي — الرصيد الحقيقي المعروض في الداشبورد مشتق من الشحنات في
// بيانات لسه مفتوحة، فبمجرد ما البيان يتقفل، هو أصلًا بيخرج من هذا الحساب.
async function recordRepresentativeWalletEntry(
  manifest: typeof shipmentManifestsTable.$inferSelect,
  items: (typeof shipmentManifestItemsTable.$inferSelect)[],
  representativeUserId: number,
  representativeName: string | null,
): Promise<void> {
  const now = new Date();
  const netDue = (await computeManifestNetDue(manifest, items)).net;
  if (netDue <= 0) return;

  await db.insert(representativeWalletTransactionsTable).values({
    tenantId: manifest.tenantId ?? null,
    representativeUserId,
    manifestId: manifest.id,
    manifestNumber: manifest.manifestNumber,
    amount: String(netDue),
    // الرصيد بيتصفر فورًا وقت التصفية — مفيش تراكم بين البيانات
    balanceBefore: String(netDue),
    balanceAfter: "0",
    closedByUserId: representativeUserId,
    closedByName: representativeName,
    createdAt: now,
  }).catch((e) => console.error("[recordRepresentativeWalletEntry] error", e));
}

// ─── جلب أو إنشاء البيان المفتوح المستهدف لنفس شركة الشحن ────────────────────
async function getOrCreateOpenManifest(
  closedManifest: typeof shipmentManifestsTable.$inferSelect,
  defaultNotes: string,
): Promise<{ id: number; manifestNumber: string }> {
  const [openManifest] = await db
    .select()
    .from(shipmentManifestsTable)
    .where(and(
      eq(shipmentManifestsTable.shippingCompanyId, closedManifest.shippingCompanyId),
      eq(shipmentManifestsTable.status, "open"),
    ));

  if (openManifest) return { id: openManifest.id, manifestNumber: openManifest.manifestNumber };

  const manifestNumber = await generateManifestNumber(closedManifest.shippingCompanyId);
  const [result] = await db.insert(shipmentManifestsTable).values({
    tenantId:          closedManifest.tenantId,
    manifestNumber,
    shippingCompanyId: closedManifest.shippingCompanyId,
    status:            "open",
    notes:             defaultNotes,
    createdAt:         new Date(),
  });
  const newId = (result as any).insertId as number;
  return { id: newId, manifestNumber };
}

// ─── ترحيل الشحنات لبيان جديد عند إغلاق البيان ───────────────────────────────
// الشرط العام: تترحّل فقط الشحنات اللي لسه ما اتاخدش فيها أي إجراء فعلي —
// يعني الرصيد في حساباتها المالية (returnValueReceived / deliveredValueReceived) صفر أو فارغ.
// لو فيه أي مبلغ اتحصّل فعلاً، الشحنة بتفضل في البيان المغلق ومتترحلش تلقائي.
// 1) قيد الانتظار (pending) أو مؤجل (delayed): يترحّل كصف pending جديد كامل في الجدول
// 2) مرتجع (returned) أو استلام جزئي (partial_delivered) لسه عند شركة الشحن (returnReceived != 1):
//    يترحّل "زي ما هو تماماً" بدون أي تغيير في الجدول — بيفضل ظاهر في حاوية "بضاعة لسه عند شركة الشحن"
//    بنفس بياناته (الملاحظات والكمية الجزئية) من بيان لبيان لحد ما اليوزر يضغط "تم الاستلام"
//    (ده شامل الحالتين: لسه ولا اتستلمش خالص، أو اتستلم جزء وفضل جزء عند الشحن)
function hasZeroBalance(item: typeof shipmentManifestItemsTable.$inferSelect): boolean {
  const returnVal = (item as any).returnValueReceived != null ? Number((item as any).returnValueReceived) : 0;
  const deliveredVal = (item as any).deliveredValueReceived != null ? Number((item as any).deliveredValueReceived) : 0;
  return returnVal === 0 && deliveredVal === 0;
}

async function rolloverPartialShipments(
  closedManifest: typeof shipmentManifestsTable.$inferSelect,
  items: (typeof shipmentManifestItemsTable.$inferSelect)[],
): Promise<{
  id: number;
  manifestNumber: string;
  orderCount: number;
  postponedCount: number;
  returnedInShippingCount: number;
  partialInShippingCount: number;
} | null> {
  const now = new Date();

  // ── 1) قيد الانتظار أو مؤجل: يترحّل كصف pending جديد زي ما هو (بشرط رصيد صفر) ─
  const delayedItems = items.filter(i =>
    (i.deliveryStatus === "delayed" || i.deliveryStatus === "pending") && hasZeroBalance(i)
  );

  // ── 2) مرتجع لسه عند شركة الشحن (بدون returnReceived) → يترحّل بنفس بياناته بالظبط ─
  const stillAtShippingItems = items.filter(i =>
    i.deliveryStatus === "returned" && i.returnReceived !== 1
  );

  // ── 3) استلام جزئي (partial_delivered) لسه فيه باقي عند شركة الشحن (returnReceived != 1):
  //    الجزء المسلَّم يفضل ثابت في البيان القديم زي ما هو (مش بيتلمس خالص) —
  //    ده جزء منفّذ وقيمته المالية مسجَّلة في البيان اللي اتسلّم فيه فعلاً.
  //    اللي بيترحّل هو بس "إشعار" إن فيه باقي مرتجع لسه عند الشحن (بدون clone
  //    للسجل الأصلي ولا قيمة مالية) — بالظبط زي منطق المرتجع العادي لسه عند
  //    الشحن، عشان يظهر في الحاوية الحمرا بس في البيان الجديد.
  //    تحديث بناءً على تعليمات بشمهندس مصطفى: الجزء المسلَّم ميترحلش، بس
  //    الباقي المرتجع (بدون قيمة مالية) هو اللي بيتمثّل في البيان الجديد.
  const partialItems = items.filter(i =>
    i.deliveryStatus === "partial_delivered" && i.returnReceived !== 1
  );

  const hasRollover = delayedItems.length > 0 || stillAtShippingItems.length > 0 || partialItems.length > 0;
  if (!hasRollover) return null;

  const targetManifest = await getOrCreateOpenManifest(closedManifest, "بيان مرحّل تلقائياً");
  const targetManifestId = targetManifest.id;

  // الشحنات اللي ممكن تتكرر بين الفئات (نادراً) — نمنع تكرار نفس shipmentId في نفس البيان
  const existing = await db
    .select({ shipmentId: shipmentManifestItemsTable.shipmentId })
    .from(shipmentManifestItemsTable)
    .where(eq(shipmentManifestItemsTable.manifestId, targetManifestId));
  const existingIds = new Set(existing.map(e => e.shipmentId));

  const rowsToInsert: (typeof shipmentManifestItemsTable.$inferInsert)[] = [];
  const shipmentIdsToMarkInTransit: number[] = [];
  let delayedCount = 0;
  let returnedStillAtShippingCount = 0;
  let partialStillAtShippingCount = 0;

  // 1) مؤجل → يترحّل بنفس حالته "مؤجل" (مش pending) عشان يفضل واضح إنه كان مؤجل
  //    قيد الانتظار → يترحّل كصف pending جديد زي ما هو
  for (const item of delayedItems) {
    if (existingIds.has(item.shipmentId)) continue;
    rowsToInsert.push({
      manifestId:     targetManifestId,
      shipmentId:     item.shipmentId,
      deliveryStatus: item.deliveryStatus === "delayed" ? "delayed" : "pending",
      deliveryNote:   item.deliveryStatus === "delayed"
        ? `مؤجل من بيان ${closedManifest.manifestNumber}`
        : `مرحّل من بيان ${closedManifest.manifestNumber} — لسه قيد الانتظار`,
      addedAt:        now,
    });
    shipmentIdsToMarkInTransit.push(item.shipmentId);
    existingIds.add(item.shipmentId);
    delayedCount++;
  }

  // 2) مرتجع لسه عند الشحن → الحالة والملاحظات والسبب يترحّلوا زي ما هم،
  //    لكن القيم المالية (returnValueReceived) تترصفّر عمدًا لـ NULL في البيان
  //    الجديد: البيان الجديد لازم يبدأ نضيف ماليًا (تأكيد صريح من بشمهندس مصطفى).
  //    بادئة "[ROLLED_OVER]" بتتحط في deliveryNote عشان الفرونت إند يقدر يميّز
  //    الطلبية المرحّلة من بيان قديم عن طلبية مرتجع اتسجلت لأول مرة في البيان
  //    الحالي — المرحّلة لازم تفضل في الحاوية الحمرا بس (تختفي من جدول الطلبيات)،
  //    والأصلية لازم تظهر في الجدول والحاوية الحمرا مع بعض طول ما البيان مفتوح.
  for (const item of stillAtShippingItems) {
    if (existingIds.has(item.shipmentId)) continue;
    rowsToInsert.push({
      manifestId:          targetManifestId,
      shipmentId:          item.shipmentId,
      deliveryStatus:      item.deliveryStatus,
      deliveryNote:        `[ROLLED_OVER] ${item.deliveryNote ?? ""}`.trim(),
      partialQuantity:     null,
      returnReceived:      item.returnReceived,
      returnReason:        item.returnReason,
      returnValueReceived: null,
      addedAt:             now,
    } as typeof shipmentManifestItemsTable.$inferInsert);
    existingIds.add(item.shipmentId);
    if (item.deliveryStatus === "returned") returnedStillAtShippingCount++;
    else partialStillAtShippingCount++;
    // الشحنة لسه فعلياً عند شركة الشحن، فمش بنغيّر حالتها في shipmentsTable
  }

  // 3) استلام جزئي (partial_delivered) لسه فيه باقي عند الشحن → الجزء المسلَّم
  //    يفضل زي ما هو في البيان القديم من غير أي تعديل (مش بيتلمس خالص).
  //    اللي بيترحّل هو إشعار بس (clone منفصل بحالة partial_received، بدون قيمة
  //    مالية) في الحاوية الحمرا للبيان الجديد — بمجرد "تم الاستلام" هناك، برضو
  //    مفيش رقم مالي بيتضاف، هو مجرد تأكيد إن الباقي رجع المخزن.
  for (const item of partialItems) {
    if (existingIds.has(item.shipmentId)) continue;
    rowsToInsert.push({
      manifestId:          targetManifestId,
      shipmentId:          item.shipmentId,
      deliveryStatus:      "partial_received",
      deliveryNote:        `[ROLLED_OVER] ${item.deliveryNote ?? `استلام جزئي — الباقي مرتجع من بيان ${closedManifest.manifestNumber}`}`.trim(),
      partialQuantity:     null,
      returnReceived:      0,
      returnReason:        item.returnReason ?? "استلام جزئي",
      returnValueReceived: null,
      addedAt:             now,
    } as typeof shipmentManifestItemsTable.$inferInsert);
    existingIds.add(item.shipmentId);
    partialStillAtShippingCount++;
    // الشحنة الأصلية والسجل بتاعها في البيان القديم مايتلمسوش خالص —
    // الجزء المسلَّم فعلاً يفضل محسوب في نفس البيان اللي اتسلّم فيه.
  }

  if (rowsToInsert.length === 0) return null;

  await db.insert(shipmentManifestItemsTable).values(rowsToInsert);

  if (shipmentIdsToMarkInTransit.length > 0) {
    await db.update(shipmentsTable)
      .set({ status: "in_transit", updatedAt: now })
      .where(inArray(shipmentsTable.id, shipmentIdsToMarkInTransit));
  }

  // ملحوظة: الشحنات الأصلية بتاعة الاستلام الجزئي مابتتلمسش خالص هنا —
  // الجزء المسلَّم فعلاً محسوب ومستقر في البيان القديم، والباقي المرتجع بس
  // هو اللي اتمثّل بإشعار (clone) في البيان الجديد فوق.

  return {
    id:                      targetManifestId,
    manifestNumber:          targetManifest.manifestNumber,
    orderCount:              rowsToInsert.length,
    postponedCount:          delayedCount,
    returnedInShippingCount: returnedStillAtShippingCount,
    partialInShippingCount:  partialStillAtShippingCount,
  };
}

// ─── PATCH /shipment-manifests/:id  (قفل/فتح البيان) ────────────────────────
router.patch("/shipment-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id   = Number(req.params.id);
    const tenantId = getTenantId(req);
    let body = req.body as { status?: "open" | "closed"; notes?: string; invoicePrice?: number | null };
    const now  = new Date();
    const reqUser = (req as any).user;

    // جيب حالة البيان الحالية عشان نمنع تكرار الترحيل المالي لو كان اتقفل نهائيًا بالفعل
    const [manifestBeforeUpdate] = await db.select({
      status: shipmentManifestsTable.status,
      closedByRole: shipmentManifestsTable.closedByRole,
    }).from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id)).limit(1);
    const alreadyFinalClosed = manifestBeforeUpdate?.status === "closed" && manifestBeforeUpdate?.closedByRole === "admin";

    // المندوب يقدر يقفل بيانه بس — مش يعيد فتحه بعد الإغلاق (ده حصريًا للأدمن)، ومش يعدّل ملاحظات أو سعر فاتورة
    // ملحوظة مهمة: قفل المندوب "قفل مؤقت" — البيان بيفضل status="open" فعليًا عند
    // الأدمن (عشان يفضل ظاهر في كل الشاشات/الفلاتر اللي بتعرض "مفتوح")، وبس
    // closedByRole="representative" هو اللي بيتسجل كعلامة "المندوب طلب القفل".
    // فبنفحص closedByRole هنا مش status، عشان نمنع المندوب من التعديل تاني بعد
    // ما يقفل، حتى لو الأدمن لسه ما أكّدش القفل النهائي.
    if (reqUser?.role === "representative") {
      const [existingManifest] = await db.select({
        shippingCompanyId: shipmentManifestsTable.shippingCompanyId,
        status: shipmentManifestsTable.status,
        closedByRole: shipmentManifestsTable.closedByRole,
      })
        .from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id)).limit(1);
      if (!existingManifest || existingManifest.shippingCompanyId !== reqUser.shippingCompanyId) {
        res.status(403).json({ error: "غير مصرح بتعديل هذا البيان" });
        return;
      }
      if (body.status === "open") {
        res.status(403).json({ error: "لا يمكن إعادة فتح بيان مُغلق — يرجى التواصل مع الأدمن" });
        return;
      }
      if (existingManifest.status === "closed" || existingManifest.closedByRole) {
        res.status(403).json({ error: "هذا البيان مُغلق بالفعل ولا يمكن تعديله" });
        return;
      }
      body = { status: body.status };
    }

    // العميل التجاري يقدر يعدّل ملاحظات بيانه هو بس، ويقفله (مش يعيد فتحه بعد
    // الإغلاق، ومش يلمس invoicePrice — ده حصريًا للأدمن)
    if (reqUser?.role === "client") {
      const [existingManifest] = await db.select({
        clientId: shipmentManifestsTable.clientId,
        status: shipmentManifestsTable.status,
      })
        .from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id)).limit(1);
      if (!existingManifest || existingManifest.clientId !== reqUser.clientId) {
        res.status(403).json({ error: "غير مصرح بتعديل هذا البيان" });
        return;
      }
      if (body.status === "open") {
        res.status(403).json({ error: "لا يمكن إعادة فتح بيان مُغلق" });
        return;
      }
      if (existingManifest.status === "closed") {
        res.status(403).json({ error: "هذا البيان مُغلق بالفعل ولا يمكن تعديله" });
        return;
      }
      body = { status: body.status, notes: body.notes };
    }

    // قفل المندوب "مؤقت" — البيان لازم يفضل status="open" فعليًا عند الأدمن (عشان
    // يفضل ظاهر في كل شاشات/فلاتر "المفتوح")، وبس closedByRole="representative"
    // هو اللي بيتسجل كعلامة "طلب قفل من المندوب" لحد ما الأدمن يأكّد القفل الفعلي.
    // قفل الأدمن يفضل زي ما هو (status="closed" فعليًا + ترحيل مالي).
    const isRepClose = body.status === "closed" && reqUser?.role === "representative";
    const effectiveStatus = isRepClose ? "open" : body.status;

    await db.update(shipmentManifestsTable)
      .set({
        ...(effectiveStatus ? { status: effectiveStatus } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.invoicePrice !== undefined ? { invoicePrice: String(body.invoicePrice) } : {}),
        ...(body.status === "closed" ? { closedAt: now } : {}),
        ...(body.status === "open"   ? { closedAt: null, closedByRole: null, closedByUserId: null } : {}),
        // نسجّل مين قفل البيان: المندوب أو الأدمن — عشان نفرّق بين "قفل مؤقت" و"قفل نهائي"
        ...(body.status === "closed" ? {
          closedByRole: reqUser?.role === "representative" ? "representative" : "admin",
          closedByUserId: reqUser?.id ?? null,
        } : {}),
      })
      .where(eq(shipmentManifestsTable.id, id));

    invalidateSmartCache(tenantId);
    invalidateChartsCache(tenantId);

    // ── تحويل الإيراد للخزنة عند الإغلاق ──────────────────────────────────
    // ملحوظة: ده مش من اختصاص المندوب — لما المندوب هو اللي بيقفل بيانه،
    // إغلاقه نهائي بدون أي ترحيل مالي للخزنة ولا ترحيل شحنات معلّقة لبيان جديد.
    // الترحيل بيحصل فقط لما الأدمن هو اللي بيقفل البيان.
    let rolledOverManifest: any = null;
    if (body.status === "closed" && reqUser?.role !== "representative" && !alreadyFinalClosed) {
      try {
        const [manifest] = await db.select().from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id));
        if (manifest) {
          const items = await db.select().from(shipmentManifestItemsTable)
            .where(eq(shipmentManifestItemsTable.manifestId, id));
          const userId   = (req as any).user?.id   ?? null;
          const userName = (req as any).user?.displayName ?? null;
          await createTreasuryEntryOnClose(manifest, items, userId, userName);

          // ترحيل الشحنات المعلّقة لبيان جديد: مؤجل (صف جديد) + استلام جزئي (الباقي كصف جديد)
          // + مرتجع/جزئي لسه عند الشحن (يترحّل زي ما هو بدون تغيير لحد ما يُستلم)
          rolledOverManifest = await rolloverPartialShipments(manifest, items);
        }
      } catch (err) {
        console.error("[PATCH /shipment-manifests/:id] treasury entry error:", err);
        // لا نوقف الـ response — البيان اتقفل بنجاح حتى لو الخزنة فيها مشكلة
      }
    }

    // ── تصفية محفظة المندوب + إشعار الأدمن لما المندوب هو اللي قفل البيان ──
    if (body.status === "closed" && reqUser?.role === "representative") {
      try {
        const [manifest] = await db.select().from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id));
        if (manifest) {
          const userName = (req as any).user?.displayName ?? null;
          const items = await db.select().from(shipmentManifestItemsTable)
            .where(eq(shipmentManifestItemsTable.manifestId, id));
          await recordRepresentativeWalletEntry(manifest, items, reqUser.id, userName);
          const closedAt = manifest.closedAt ?? now;
          const dateStr = closedAt.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric" });
          const timeStr = closedAt.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true });
          await pushNotification({
            tenantId: manifest.tenantId ?? null,
            type: "manifest_closed",
            severity: "warning",
            title: `المندوب قفل البيان ${manifest.manifestNumber} — بانتظار قفلك النهائي`,
            message: `المندوب ${userName ?? "غير معروف"} قفل البيان ${manifest.manifestNumber} من عنده بتاريخ ${dateStr} الساعة ${timeStr}. البيان لسه مفتوح عندك — راجعه واقفله نهائيًا لما يكون جاهز.`,
            entityType: "shipment_manifest",
            entityId: manifest.id,
            link: `/shipping/shipment-manifests/${manifest.id}`,
          });
        }
      } catch (err) {
        console.error("[PATCH /shipment-manifests/:id] notify admin error:", err);
      }
    }

    res.json({ success: true, rolledOverManifest });
  } catch (e) {
    console.error("[PATCH /shipment-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في تحديث البيان" });
  }
});

// ─── POST /shipment-manifests/:id/add-shipments ──────────────────────────────
router.post("/shipment-manifests/:id/add-shipments", async (req, res): Promise<void> => {
  try {
    const manifestId  = Number(req.params.id);
    const { shipmentIds } = req.body as { shipmentIds: number[] };

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      res.status(400).json({ error: "يجب إرسال قائمة شحنات" });
      return;
    }

    const [manifest] = await db.select().from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, manifestId));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifest.status === "closed") { res.status(400).json({ error: "البيان مغلق" }); return; }

    const now = new Date();

    // استبعد الشحنات الموجودة في البيان
    const existing = await db.select({ shipmentId: shipmentManifestItemsTable.shipmentId })
      .from(shipmentManifestItemsTable)
      .where(eq(shipmentManifestItemsTable.manifestId, manifestId));
    const existingIds = new Set(existing.map(e => e.shipmentId));
    const candidateIds = shipmentIds.filter(id => !existingIds.has(id));

    if (candidateIds.length === 0) {
      res.json({ added: 0, manifestNumber: manifest.manifestNumber });
      return;
    }

    // اتأكد إن الشحنات لسه "قيد الشحن في المخزن" فعلياً (مش picked_up أو أي حالة تانية)
    const candidates = await db.select({ id: shipmentsTable.id, status: shipmentsTable.status })
      .from(shipmentsTable)
      .where(inArray(shipmentsTable.id, candidateIds));
    const newIds = candidates.filter(c => c.status === "warehouse_ready").map(c => c.id);

    if (newIds.length === 0) {
      res.json({ added: 0, manifestNumber: manifest.manifestNumber });
      return;
    }

    await db.insert(shipmentManifestItemsTable).values(
      newIds.map(sid => ({
        manifestId,
        shipmentId:     sid,
        deliveryStatus: "pending",
        addedAt:        now,
      }))
    );

    // حدّث حالة الشحنات → in_transit
    await db.update(shipmentsTable)
      .set({ status: "in_transit", updatedAt: now })
      .where(inArray(shipmentsTable.id, newIds));

    res.json({ added: newIds.length, manifestNumber: manifest.manifestNumber });
  } catch (e) {
    console.error("[POST /shipment-manifests/:id/add-shipments]", e);
    res.status(500).json({ error: "خطأ في إضافة الشحنات" });
  }
});

// ─── DELETE /shipment-manifests/:id ──────────────────────────────────────────
router.delete("/shipment-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);

    // المندوب ممنوع يحذف البيان بالكامل — الحذف مسموح للأدمن بس
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative") {
      res.status(403).json({ error: "غير مسموح — المندوب لا يمكنه حذف البيان بالكامل" });
      return;
    }

    // العميل التجاري يقدر يحذف بيانه هو بس — وبس لو لسه مفتوح (بعد الإغلاق
    // الحذف بيبقى حصريًا للأدمن عشان البيان يبقى فيه سجل تاريخي)
    if (reqUser?.role === "client") {
      const [existingManifest] = await db.select({
        clientId: shipmentManifestsTable.clientId,
        status: shipmentManifestsTable.status,
      })
        .from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id)).limit(1);
      if (!existingManifest || existingManifest.clientId !== reqUser.clientId) {
        res.status(403).json({ error: "غير مصرح بحذف هذا البيان" });
        return;
      }
      if (existingManifest.status === "closed") {
        res.status(403).json({ error: "لا يمكن حذف بيان مُغلق — يرجى التواصل مع الأدمن" });
        return;
      }
    }

    // أرجع حالة الشحنات → waiting
    const items = await db.select({ shipmentId: shipmentManifestItemsTable.shipmentId })
      .from(shipmentManifestItemsTable)
      .where(eq(shipmentManifestItemsTable.manifestId, id));
    if (items.length) {
      const ids = items.map(i => i.shipmentId);
      await db.update(shipmentsTable)
        .set({ status: "waiting", updatedAt: new Date() })
        .where(inArray(shipmentsTable.id, ids));
    }
    await db.delete(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id));
    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /shipment-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في حذف البيان" });
  }
});

// ─── GET /shipping-companies/:id/shipment-stats ───────────────────────────────
router.get("/shipping-companies/:id/shipment-stats", async (req, res): Promise<void> => {
  try {
    const companyId = Number(req.params.id);
    const tenantId  = getTenantId(req);

    const manifests = await db.select({
      id: shipmentManifestsTable.id,
      status: shipmentManifestsTable.status,
      closedByRole: shipmentManifestsTable.closedByRole,
    })
      .from(shipmentManifestsTable)
      .where(and(
        eq(shipmentManifestsTable.shippingCompanyId, companyId),
        tenantId !== null
          ? or(eq(shipmentManifestsTable.tenantId, tenantId), isNull(shipmentManifestsTable.tenantId))
          : undefined,
      ));

    const manifestIds = manifests.map(m => m.id);
    const closedManifestIds = new Set(
      manifests
        .filter(m => m.status === "closed" || !!m.closedByRole)
        .map(m => m.id)
    );
    let items: any[] = [];
    if (manifestIds.length) {
      items = await db.select().from(shipmentManifestItemsTable)
        .where(inArray(shipmentManifestItemsTable.manifestId, manifestIds));
    }

    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered" || i.deliveryStatus === "partial_received").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending" || i.deliveryStatus === "delayed").length;
    const total     = items.length;
    const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;

    // ─── حسابات مالية (P&L) من بيانات الشحنات نفسها ─────────────────────────
    let totalRevenue = 0, totalCost = 0, totalShippingCost = 0, returnLosses = 0, deliveredGross = 0;
    // ─── صافي الإيراد الحقيقي = نفس معادلة "صافي الإيراد الحقيقي" في تفاصيل
    // البيان (realNetProfit = deliveredShippingFees − courierCostManual)،
    // مجمّعة على مستوى كل البيانات المغلقة فقط للمندوب/الشركة دي. ─────────
    const RETURN_REASONS_WITH_SHIPPING_COST = ["refused_paid", "refused_unpaid", "quality"];
    const [company] = await db.select().from(shippingCompaniesTable)
      .where(eq(shippingCompaniesTable.id, companyId));
    let deliveredShippingFeesClosed = 0;
    let courierCostClosed = 0;

    if (items.length) {
      const shipmentIds = items.map(i => i.shipmentId);
      const shipments = await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds));
      const shipmentMap = new Map(shipments.map(s => [s.id, s]));
      const zoneIds = [...new Set(shipments.map(s => s.zoneId).filter((id): id is number => id != null))];
      const zoneCosts = zoneIds.length
        ? await db.select({ zoneId: zoneCostsTable.zoneId, deliveryCost: zoneCostsTable.deliveryCost })
            .from(zoneCostsTable)
            .where(and(
              inArray(zoneCostsTable.zoneId, zoneIds),
              tenantId !== null
                ? or(eq(zoneCostsTable.tenantId, tenantId), isNull(zoneCostsTable.tenantId))
                : undefined,
            ))
        : [];
      const zoneCostMap = new Map(zoneCosts.map(z => [z.zoneId, Number(z.deliveryCost ?? 0)]));
      const companyCostMode = (company as any)?.costMode === "zone" ? "zone" : "rep";
      const courierCostPerShipment = Math.abs(Number(company?.shippingCost ?? 0));

      for (const item of items) {
        const shipment = shipmentMap.get(item.shipmentId);
        if (!shipment) continue;
        const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
        const shipping = Number(shipment.shippingFee ?? 0);
        const cost     = Number(shipment.costPrice ?? 0);
        const isClosed = closedManifestIds.has(item.manifestId);

        if (item.deliveryStatus === "delivered" || item.deliveryStatus === "partial_delivered") {
          totalRevenue += cod;
          deliveredGross += cod;
          totalCost += cost;
          totalShippingCost += shipping;
        } else if (item.deliveryStatus === "partial_received") {
          // إشعار باقي مرتجع من استلام جزئي — بدون قيمة مالية (زي المرتجع)
        } else if (item.deliveryStatus === "returned") {
          returnLosses += shipping;
          if ((item as any).returnReason === "refused_paid") {
            deliveredGross += shipping;
          }
        } else {
          totalShippingCost += shipping;
        }

        // ─── صافي الإيراد الحقيقي (بيانات مغلقة فقط) ──────────────────────
        if (isClosed) {
          const hasShippingFee =
            item.deliveryStatus === "delivered" ||
            item.deliveryStatus === "partial_delivered" ||
            (item.deliveryStatus === "partial_received" && (item as any).returnReceived === 1) ||
            (item.deliveryStatus === "returned" && RETURN_REASONS_WITH_SHIPPING_COST.includes((item as any).returnReason));

          if (hasShippingFee) {
            deliveredShippingFeesClosed += shipping;
            courierCostClosed += companyCostMode === "zone"
              ? Number(zoneCostMap.get(shipment.zoneId ?? -1) ?? 0)
              : courierCostPerShipment;
          }
        }
      }
    }
    const netProfit = totalRevenue - totalCost - totalShippingCost - returnLosses;
    const realNetRevenue = deliveredShippingFeesClosed - courierCostClosed;

    res.json({
      total, delivered, partial, returned, pending,
      deliveryRate,
      totalRevenue, totalCost, totalShippingCost, returnLosses,
      netProfit, deliveredGross, realNetRevenue,
      manifestCount: manifests.length,
    });
  } catch (e) {
    console.error("[GET /shipping-companies/:id/shipment-stats]", e);
    res.status(500).json({ error: "خطأ في جلب الإحصائيات" });
  }
});

export default router;
