import { Router, type IRouter } from "express";
import { eq, desc, and, inArray, count, isNull, or } from "drizzle-orm";
import {
  db,
  clientAccountManifestsTable,
  clientAccountManifestItemsTable,
  shipmentsTable,
  clientsTable,
  usersTable,
  warehousesTable,
  clientAccountPaymentsTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getTenantId } from "../middlewares/requireTenant.js";
import { syncManifestItemToShipment } from "../lib/manifestSync.js";
import { syncShipmentInventory } from "./shipments.js";
import { syncShipmentItemsInventory } from "../lib/inventory.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── حساب أقرب موعد إغلاق متوقع (أحد أو أربعاء) من تاريخ إنشاء البيان ─────────
// الأحد = 0, الأربعاء = 3 في getDay(). لو اليوم نفسه يوم إغلاق، الموعد بيبقى
// نفس اليوم (يعني "خلال ساعات" في عرض الفرونت).
function computeNextClosingDate(from: Date): Date {
  const day = from.getDay();
  const daysUntil = (target: number) => (target - day + 7) % 7;
  const untilSunday = daysUntil(0);
  const untilWednesday = daysUntil(3);
  const nearest = Math.min(untilSunday, untilWednesday);
  const result = new Date(from);
  result.setDate(from.getDate() + nearest);
  result.setHours(23, 59, 59, 0);
  return result;
}

// ─── توليد رقم البيان ────────────────────────────────────────────────────────
async function generateManifestNumber(clientId: number): Promise<string> {
  const [row] = await db
    .select({ cnt: count() })
    .from(clientAccountManifestsTable)
    .where(eq(clientAccountManifestsTable.clientId, clientId));
  const seq = (Number(row?.cnt ?? 0) + 1).toString().padStart(3, "0");
  return `CAM-${clientId}-${seq}`;
}

// ─── إضافة تلقائية للبيان عند دخول الشحنة "قيد الشحن في المخزن" ──────────────
// لو فيه بيان مفتوح لنفس العميل: تتضاف له الشحنة (لو مش مضافة بالفعل).
// لو مفيش بيان مفتوح: يتفتح بيان جديد تلقائيًا وتتضاف له الشحنة.
// آمنة للاستدعاء المتكرر (idempotent) — بتتجاهل لو الشحنة مضافة بالفعل لأي بيان مفتوح.
export async function autoAddShipmentToClientAccountManifest(
  shipmentId: number,
  clientId: number | null | undefined,
  tenantId: number | null,
): Promise<void> {
  if (!clientId) return;

  try {
    // لو الشحنة دي مضافة بالفعل لبيان "مفتوح" لسه موجود فعليًا — متضافش تاني.
    // لو مضافة لبيان "مقفول" أو "ملغى" (اتقفل/اتلغى بعد كده)، لازم تتحرك لبيان جديد
    // بمجرد ما تدخل تاني "قيد الشحن في المخزن" — عشان كده بنشترط status = "open" هنا.
    const [existingOpenItem] = await db
      .select({ id: clientAccountManifestItemsTable.id })
      .from(clientAccountManifestItemsTable)
      .innerJoin(clientAccountManifestsTable, eq(clientAccountManifestItemsTable.manifestId, clientAccountManifestsTable.id))
      .where(and(
        eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
        eq(clientAccountManifestsTable.status, "open"),
      ))
      .limit(1);
    if (existingOpenItem) return;

    // ملحوظة: manifestId عليها onDelete: "cascade"، يعني لو البيان اتحذف (إلغاء)
    // الـ items بتاعته بتتمسح تلقائيًا مع الشحنة على مستوى الداتابيز، فمفيش سيناريو
    // "صف يتيم" هنا. وبما إن shipmentId مالهاش unique constraint، الشحنة تقدر تتضاف
    // لأكتر من بيان بمرور الوقت (بيان قديم مقفول + بيان جديد مفتوح) من غير أي تعارض،
    // فمفيش داعي نمسح سجل البيان المقفول القديم — بيفضل محفوظ للتاريخ كما هو.
    const tenantCondition = tenantId !== null
      ? or(eq(clientAccountManifestsTable.tenantId, tenantId), isNull(clientAccountManifestsTable.tenantId))
      : undefined;

    // دور على بيان مفتوح لنفس العميل
    const [openManifest] = await db
      .select({ id: clientAccountManifestsTable.id })
      .from(clientAccountManifestsTable)
      .where(and(
        eq(clientAccountManifestsTable.clientId, clientId),
        eq(clientAccountManifestsTable.status, "open"),
        tenantCondition,
      ))
      .limit(1);

    const now = new Date();

    if (openManifest) {
      await db.insert(clientAccountManifestItemsTable).values({
        manifestId:     openManifest.id,
        shipmentId,
        deliveryStatus: "pending",
        addedAt:        now,
      });
      return;
    }

    // مفيش بيان مفتوح → افتح بيان جديد تلقائيًا
    const manifestNumber = await generateManifestNumber(clientId);
    const [result] = await db.insert(clientAccountManifestsTable).values({
      tenantId: tenantId ?? null,
      manifestNumber,
      clientId,
      status:   "open",
      notes:    null,
      createdAt: now,
      scheduledCloseAt: computeNextClosingDate(now),
    });
    const manifestId = (result as any).insertId as number;

    await db.insert(clientAccountManifestItemsTable).values({
      manifestId,
      shipmentId,
      deliveryStatus: "pending",
      addedAt:        now,
    });
  } catch (e) {
    // ما نكسرش تحديث حالة الشحنة لو فشلت الإضافة التلقائية للبيان — بس نسجل الخطأ
    console.error("[autoAddShipmentToClientAccountManifest]", e);
  }
}

// ─── GET /client-account-manifests?clientId=X ────────────────────────────────
router.get("/client-account-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;

    const tenantCondition = tenantId !== null
      ? or(eq(clientAccountManifestsTable.tenantId, tenantId), isNull(clientAccountManifestsTable.tenantId))
      : undefined;

    const where = and(
      tenantCondition,
      clientId ? eq(clientAccountManifestsTable.clientId, clientId) : undefined,
    );

    const manifests = await db
      .select()
      .from(clientAccountManifestsTable)
      .where(where)
      .orderBy(desc(clientAccountManifestsTable.createdAt));

    const ids = manifests.map(m => m.id);
    let countMap: Record<number, number> = {};
    let statusCountMap: Record<number, { pending: number; delayed: number; returned: number; delivered: number; partial: number }> = {};
    if (ids.length) {
      const counts = await db
        .select({
          manifestId: clientAccountManifestItemsTable.manifestId,
          deliveryStatus: clientAccountManifestItemsTable.deliveryStatus,
          cnt: count(),
        })
        .from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.manifestId, ids))
        .groupBy(clientAccountManifestItemsTable.manifestId, clientAccountManifestItemsTable.deliveryStatus);

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

    const clientIds = [...new Set(manifests.map(m => m.clientId))];
    const clientsRows = clientIds.length
      ? await db.select({ id: clientsTable.id, name: clientsTable.name, avatar: clientsTable.avatar })
          .from(clientsTable).where(inArray(clientsTable.id, clientIds))
      : [];
    const clientMap: Record<number, { name: string; avatar: string | null }> = {};
    clientsRows.forEach(c => { clientMap[c.id] = { name: c.name, avatar: c.avatar }; });

    const result = manifests.map(m => ({
      ...m,
      shipmentCount: countMap[m.id] ?? 0,
      statusCounts: statusCountMap[m.id] ?? { pending: 0, delayed: 0, returned: 0, delivered: 0, partial: 0 },
      clientName: clientMap[m.clientId]?.name ?? "",
      clientAvatar: clientMap[m.clientId]?.avatar ?? null,
    }));

    res.json(result);
  } catch (e) {
    console.error("[GET /client-account-manifests]", e);
    res.status(500).json({ error: "خطأ في جلب البيانات" });
  }
});

// ─── GET /client-account-manifests/clients-with-balance ──────────────────────
// قائمة كل العملاء التجاريين (اللي عندهم بيانات حساب عميل) مع رصيد كل واحد محسوب
// تُستخدم في القائمة المنسدلة لصفحة "سداد حساب عميل" بالمصروفات
router.get("/client-account-manifests/clients-with-balance", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);

    // كل العملاء اللي عندهم بيان حساب عميل واحد على الأقل
    const manifestConds: any[] = [];
    if (tenantId !== null) manifestConds.push(eq(clientAccountManifestsTable.tenantId, tenantId));
    const allManifests = await db
      .select({ id: clientAccountManifestsTable.id, clientId: clientAccountManifestsTable.clientId, status: clientAccountManifestsTable.status })
      .from(clientAccountManifestsTable)
      .where(manifestConds.length ? and(...manifestConds) : undefined);

    const clientIds = Array.from(new Set(allManifests.map(m => m.clientId).filter(Boolean)));
    if (!clientIds.length) { res.json({ clients: [] }); return; }

    const clients = await db
      .select({ id: clientsTable.id, name: clientsTable.name, phone: clientsTable.phone })
      .from(clientsTable)
      .where(inArray(clientsTable.id, clientIds));

    const closedManifestIds = allManifests.filter(m => m.status === "closed").map(m => m.id);

    const itemsByManifest = closedManifestIds.length
      ? await db.select().from(clientAccountManifestItemsTable).where(inArray(clientAccountManifestItemsTable.manifestId, closedManifestIds))
      : [];
    const shipmentIds = Array.from(new Set(itemsByManifest.map(i => i.shipmentId)));
    const shipments = shipmentIds.length
      ? await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds))
      : [];
    const shipmentMap: Record<number, any> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    const manifestClientMap: Record<number, number> = {};
    allManifests.forEach(m => { manifestClientMap[m.id] = m.clientId; });

    // تجميع صافي المستحق لكل عميل من كل الـ items بتاعة البيانات المقفولة
    const balanceByClient: Record<number, number> = {};
    for (const item of itemsByManifest) {
      const cId = manifestClientMap[item.manifestId];
      if (!cId) continue;
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
      const shipping = Number(shipment.shippingFee ?? 0);
      let delta = 0;

      if (item.deliveryStatus === "delivered") {
        const dvr = (item as any).deliveredValueReceived;
        const actualCod = dvr != null ? Number(dvr) : cod;
        delta = actualCod - shipping;
      } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
        delta = Number(item.partialQuantity) - shipping;
      }
      balanceByClient[cId] = (balanceByClient[cId] ?? 0) + delta;
    }

    // خصم السدادات السابقة (سداد حساب عميل) من رصيد كل عميل
    const paymentConds: any[] = [inArray(clientAccountPaymentsTable.clientId, clientIds)];
    const payments = await db
      .select({ clientId: clientAccountPaymentsTable.clientId, amount: clientAccountPaymentsTable.amount })
      .from(clientAccountPaymentsTable)
      .where(and(...paymentConds));
    for (const p of payments) {
      balanceByClient[p.clientId] = (balanceByClient[p.clientId] ?? 0) - Number(p.amount ?? 0);
    }

    const result = clients
      .map(c => ({ id: c.id, name: c.name, phone: c.phone, balance: balanceByClient[c.id] ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));

    res.json({ clients: result });
  } catch (e) {
    console.error("[GET /client-account-manifests/clients-with-balance]", e);
    res.status(500).json({ error: "خطأ في جلب قائمة العملاء بالأرصدة" });
  }
});

// ─── GET /client-account-manifests/balance/:clientId ─────────────────────────
// إجمالي رصيد العميل = مجموع صافي المستحق (netDueFromClient) لكل البيانات "المقفولة" الخاصة به
// (نفس معادلة netDueFromClient المُستخدمة داخل كل بيان — إجمالي المُسلَّم فعليًا − تكلفة الشحن)
router.get("/client-account-manifests/balance/:clientId", async (req, res): Promise<void> => {
  try {
    const clientId = Number(req.params.clientId);
    if (!clientId) { res.status(400).json({ error: "معرّف العميل غير صالح" }); return; }

    const closedManifests = await db
      .select()
      .from(clientAccountManifestsTable)
      .where(and(
        eq(clientAccountManifestsTable.clientId, clientId),
        eq(clientAccountManifestsTable.status, "closed"),
      ));

    const manifestIds = closedManifests.map(m => m.id);
    let totalBalance = 0;

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

      let deliveredGross = 0;
      let totalShippingCost = 0;

      for (const item of items) {
        const shipment = shipmentMap[item.shipmentId];
        if (!shipment) continue;
        const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
        const shipping = Number(shipment.shippingFee ?? 0);

        if (item.deliveryStatus === "delivered") {
          const dvr = (item as any).deliveredValueReceived;
          const actualCod = dvr != null ? Number(dvr) : cod;
          deliveredGross += actualCod;
          totalShippingCost += shipping;
        } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
          totalShippingCost += shipping;
          deliveredGross += Number(item.partialQuantity);
        }
      }

      totalBalance = deliveredGross - totalShippingCost;
    }

    // ── سدادات سبق دفعها للعميل كمصروف "سداد حساب عميل" — بتتخصم من الرصيد ──
    const payments = await db
      .select({ amount: clientAccountPaymentsTable.amount })
      .from(clientAccountPaymentsTable)
      .where(eq(clientAccountPaymentsTable.clientId, clientId));
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    totalBalance -= totalPaid;

    res.json({ clientId, balance: totalBalance, closedManifestsCount: manifestIds.length });
  } catch (e) {
    console.error("[GET /client-account-manifests/balance/:clientId]", e);
    res.status(500).json({ error: "خطأ في حساب رصيد العميل" });
  }
});

// ─── GET /client-account-manifests/:id ───────────────────────────────────────
router.get("/client-account-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [manifest] = await db.select().from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, id));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }

    const items = await db
      .select()
      .from(clientAccountManifestItemsTable)
      .where(eq(clientAccountManifestItemsTable.manifestId, id));

    const shipmentIds = items.map(i => i.shipmentId);
    let shipments: any[] = [];
    if (shipmentIds.length) {
      shipments = await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds));
    }
    const shipmentMap: Record<number, any> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    // ── جلب أسماء المناديب (assignedUserId) دفعة واحدة ──────────────────────
    const repUserIds = [...new Set(shipments.map(s => s.assignedUserId).filter((v): v is number => !!v))];
    let repNameMap: Record<number, string> = {};
    if (repUserIds.length) {
      const repUsers = await db
        .select({ id: usersTable.id, displayName: usersTable.displayName })
        .from(usersTable)
        .where(inArray(usersTable.id, repUserIds));
      repNameMap = Object.fromEntries(repUsers.map(u => [u.id, u.displayName]));
    }

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

    const enrichedItems = items.map(item => {
      const sh = shipmentMap[item.shipmentId] ?? null;
      return {
        ...item,
        shipment: sh,
        customerName:  sh?.receiverName  ?? "",
        phone:         sh?.receiverPhone ?? "",
        city:          sh?.receiverCity  ?? "",
        address:       sh?.receiverAddress ?? "",
        senderName:    sh?.senderName    ?? "",
        quantity:      sh?.pieces        ?? 1,
        totalPrice:    Number(sh?.codAmount  ?? 0) || Number(sh?.totalAmount ?? 0),
        unitPrice:     Number(sh?.codAmount  ?? 0) || Number(sh?.totalAmount ?? 0),
        shippingCost:  Number(sh?.shippingFee ?? 0),
        invoiceNumber: sh?.shipmentNumber ?? "",
        representativeName: sh?.assignedUserId ? (repNameMap[sh.assignedUserId] ?? null) : null,
        warehouseName: sh?.warehouseId ? (warehouseNameMap[sh.warehouseId] ?? null) : null,
      };
    });

    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending").length;
    const delayed   = items.filter(i => i.deliveryStatus === "delayed").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered").length;

    // ─── حسابات مالية — من منظور حساب العميل (بدل شركة الشحن) ────────────────
    let totalRevenue = 0, totalCost = 0, totalShippingCost = 0, returnLosses = 0, deliveredGross = 0;
    let deliveredShippingFees = 0;
    for (const item of items) {
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
      const shipping = Number(shipment.shippingFee ?? 0);
      const cost     = Number(shipment.costPrice ?? 0);

      if (item.deliveryStatus === "delivered") {
        // القيمة الفعلية المستلمة لو المندوب دخلها (زيادة أو نقص)، وإلا الإجمالي العادي (cod)
        const dvr = (item as any).deliveredValueReceived;
        const actualCod = dvr != null ? Number(dvr) : cod;
        totalRevenue += actualCod;
        deliveredGross += actualCod;
        totalCost += cost;
        totalShippingCost += shipping;
        deliveredShippingFees += shipping;
      } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
        // partialQuantity هنا في بيان الشحن قيمة مالية فعلية أدخلها المندوب (مش عدد قطع) — تُستخدم كما هي
        // رسوم الشحن تُحسب دايمًا طالما فيه جزء اتسلم، بغض النظر عن استلام المرتجع من شركة الشحن
        totalShippingCost += shipping;
        deliveredShippingFees += shipping;
        const partialCod = Number(item.partialQuantity);
        totalRevenue += partialCod;
        deliveredGross += partialCod;
        if ((item as any).returnReceived === 1) {
          const qty = Number(shipment.quantity ?? 1);
          const unitCost = qty > 0 ? cost / qty : cost;
          totalCost += unitCost * partialCod;
        }
      }
    }
    const netProfit = totalRevenue - totalCost - totalShippingCost - returnLosses;
    const netDueFromClient = deliveredGross - totalShippingCost; // صافي المستحق من/على العميل

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, manifest.clientId));

    res.json({
      ...manifest,
      client: client ?? null,
      items: enrichedItems,
      stats: {
        total: items.length, delivered, returned, pending, delayed, partial,
        totalRevenue, totalCost, totalShippingCost, returnLosses,
        netProfit, deliveredGross,
        deliveredShippingFees,
        netDueFromClient,
      },
    });
  } catch (e) {
    console.error("[GET /client-account-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في جلب البيان" });
  }
});

// ─── POST /client-account-manifests ──────────────────────────────────────────
const CreateSchema = z.object({
  clientId:    z.number().int().positive(),
  shipmentIds: z.array(z.number().int().positive()).min(1),
  notes:       z.string().nullish(),
});

router.post("/client-account-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const body = CreateSchema.parse(req.body);

    const [existing] = await db
      .select({ id: clientAccountManifestsTable.id })
      .from(clientAccountManifestsTable)
      .where(and(
        eq(clientAccountManifestsTable.clientId, body.clientId),
        eq(clientAccountManifestsTable.status, "open"),
        tenantId !== null
          ? or(eq(clientAccountManifestsTable.tenantId, tenantId), isNull(clientAccountManifestsTable.tenantId))
          : undefined,
      ));
    if (existing) {
      res.status(409).json({ error: "يوجد بيان مفتوح بالفعل لهذا العميل" });
      return;
    }

    const manifestNumber = await generateManifestNumber(body.clientId);
    const now = new Date();

    const [result] = await db.insert(clientAccountManifestsTable).values({
      tenantId: tenantId ?? null,
      manifestNumber,
      clientId: body.clientId,
      status:   "open",
      notes:    body.notes ?? null,
      createdAt: now,
      scheduledCloseAt: computeNextClosingDate(now),
    });
    const manifestId = (result as any).insertId as number;

    await db.insert(clientAccountManifestItemsTable).values(
      body.shipmentIds.map(sid => ({
        manifestId,
        shipmentId:     sid,
        deliveryStatus: "pending",
        addedAt:        now,
      }))
    );

    res.status(201).json({
      id: manifestId,
      manifestNumber,
      shipmentCount: body.shipmentIds.length,
    });
  } catch (e: any) {
    console.error("[POST /client-account-manifests]", e);
    if (e?.name === "ZodError") { res.status(400).json({ error: e.errors[0]?.message }); return; }
    res.status(500).json({ error: "خطأ في إنشاء البيان" });
  }
});

// ─── PATCH /client-account-manifests/:id/items/:shipmentId ───────────────────
const UpdateItemSchema = z.object({
  deliveryStatus: z.enum(["pending", "delivered", "returned", "delayed", "partial_delivered"]),
  deliveryNote:   z.string().nullish(),
  partialQuantity: z.number().int().nullish(),
  returnReceived: z.boolean().nullish(),
  returnReason:   z.string().nullish(),
  returnValueReceived: z.coerce.number().nullish(),
  deliveredValueReceived: z.coerce.number().nullish(),
  itemReceivedQuantities: z.record(z.string(), z.coerce.number().int().min(0)).nullish(),
});

router.patch("/client-account-manifests/:id/items/:shipmentId", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const shipmentId = Number(req.params.shipmentId);
    const body = UpdateItemSchema.parse(req.body);
    const now = new Date();

    const [manifestRow] = await db.select({ status: clientAccountManifestsTable.status })
      .from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, manifestId)).limit(1);
    if (!manifestRow) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifestRow.status === "closed") { res.status(400).json({ error: "البيان مغلق — لا يمكن التعديل" }); return; }

    await db.update(clientAccountManifestItemsTable)
      .set({
        deliveryStatus:  body.deliveryStatus,
        deliveryNote:    body.deliveryNote ?? null,
        partialQuantity: body.partialQuantity ?? null,
        // returnReason و returnValueReceived: لو الطلب مابعتهمش (undefined) — زي زرار
        // "تم الاستلام" السريع اللي بيبعت returnReceived بس — نسيب القيمة القديمة زي
        // ما هي (undefined في drizzle .set = تجاهل العمود)، عشان الحسابات المالية
        // اللي اتسجلت وقت تسجيل المرتجع تفضل زي ما هي ومتتصفرش بمجرد "تم الاستلام".
        ...(body.returnReason !== undefined ? { returnReason: body.returnReason ?? null } : {}),
        returnReceived:  body.returnReceived == null ? null : body.returnReceived ? 1 : 0,
        ...(body.returnValueReceived !== undefined ? { returnValueReceived: body.returnValueReceived ?? null } : {}),
        ...(body.deliveredValueReceived !== undefined ? { deliveredValueReceived: body.deliveredValueReceived ?? null } : {}),
        deliveredAt:     (body.deliveryStatus === "delivered" || body.deliveryStatus === "partial_delivered") ? now : undefined,
      })
      .where(and(
        eq(clientAccountManifestItemsTable.manifestId, manifestId),
        eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
      ));

    // ربط المخزون: لو الحالة "مرتجع" أو "استلام جزئي" → نفس منطق بيان شركة الشحن بالظبط
    // (deliveryStatus بتاع البيان بيستخدم "partial_delivered"، نظام المخزون بيتوقع "partial_received")
    const inventoryStatus =
      body.deliveryStatus === "returned"          ? "returned" :
      body.deliveryStatus === "partial_delivered" ? "partial_received" :
      undefined;

    if (inventoryStatus) {
      const [existingShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
      if (existingShipment) {
        const invPatch: Record<string, any> = {
          status: inventoryStatus,
          returnReceived: body.returnReceived == null ? null : body.returnReceived ? 1 : 0,
          partialQuantity: body.partialQuantity ?? undefined,
        };
        // منتج واحد (single product) على الشحنة نفسها
        await syncShipmentInventory(existingShipment, invPatch);
        // منتجات متعددة (shipment_items) على الشحنة
        await syncShipmentItemsInventory(shipmentId, inventoryStatus, body.itemReceivedQuantities ?? undefined, body.returnReceived === true);
      }
    }

    // مزامنة الحالة مع شحنة الأصل (shipmentsTable) عشان تفضل متسقة مع صفحة الشحنات
    await syncManifestItemToShipment(shipmentId, body.deliveryStatus);

    res.json({ success: true });
  } catch (e: any) {
    console.error("[PATCH /client-account-manifests/:id/items/:shipmentId]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الشحنة" });
  }
});

// ─── DELETE /client-account-manifests/:id/items/:shipmentId ──────────────────
// إلغاء/إزالة شحنة من بيان حساب العميل: بيشيل صف الـ item من البيان ويرجّع
// الشحنة نفسها (shipmentsTable) لحالة "قيد الانتظار" — بنفس فكرة إزالة الطلب
// من بيان شركة الشحن، لكن على جدول الشحنات الصحيح (shipmentsTable) مش ordersTable.
router.delete("/client-account-manifests/:id/items/:shipmentId", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const shipmentId = Number(req.params.shipmentId);
    if (isNaN(manifestId) || isNaN(shipmentId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

    const [manifestRow] = await db.select({ status: clientAccountManifestsTable.status })
      .from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, manifestId)).limit(1);
    if (!manifestRow) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifestRow.status === "closed") { res.status(400).json({ error: "البيان مغلق — لا يمكن التعديل" }); return; }

    const [item] = await db.select({ id: clientAccountManifestItemsTable.id })
      .from(clientAccountManifestItemsTable)
      .where(and(
        eq(clientAccountManifestItemsTable.manifestId, manifestId),
        eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
      ))
      .limit(1);
    if (!item) { res.status(404).json({ error: "الشحنة غير موجودة في هذا البيان" }); return; }

    await db.delete(clientAccountManifestItemsTable)
      .where(eq(clientAccountManifestItemsTable.id, item.id));

    // رجّع الشحنة الأصلية لقيد الانتظار — عشان تدخل بيان جديد لما ترجع "قيد الشحن في المخزن" تاني
    await db.update(shipmentsTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(shipmentsTable.id, shipmentId));

    res.json({ success: true, shipmentId, message: "تم إلغاء الشحنة من البيان وإرجاعها لقيد الانتظار" });
  } catch (e: any) {
    console.error("[DELETE /client-account-manifests/:id/items/:shipmentId]", e);
    res.status(500).json({ error: "خطأ في إلغاء الشحنة من البيان" });
  }
});

// ─── PATCH /client-account-manifests/:id  (قفل/فتح البيان) ──────────────────
router.patch("/client-account-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const body = req.body as { status?: "open" | "closed"; notes?: string; invoicePrice?: number | null; manualShippingCost?: number | null };
    const now = new Date();

    await db.update(clientAccountManifestsTable)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.invoicePrice !== undefined ? { invoicePrice: body.invoicePrice == null ? null : String(body.invoicePrice) } : {}),
        ...(body.manualShippingCost !== undefined ? { manualShippingCost: body.manualShippingCost == null ? null : String(body.manualShippingCost) } : {}),
        ...(body.status === "closed" ? { closedAt: now } : {}),
        ...(body.status === "open"   ? { closedAt: null } : {}),
      })
      .where(eq(clientAccountManifestsTable.id, id));

    res.json({ success: true });
  } catch (e) {
    console.error("[PATCH /client-account-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في تحديث البيان" });
  }
});

// ─── POST /client-account-manifests/:id/add-shipments ────────────────────────
router.post("/client-account-manifests/:id/add-shipments", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const { shipmentIds } = req.body as { shipmentIds: number[] };

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      res.status(400).json({ error: "يجب إرسال قائمة شحنات" });
      return;
    }

    const [manifest] = await db.select().from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, manifestId));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifest.status === "closed") { res.status(400).json({ error: "البيان مغلق" }); return; }

    const now = new Date();
    const existing = await db.select({ shipmentId: clientAccountManifestItemsTable.shipmentId })
      .from(clientAccountManifestItemsTable)
      .where(eq(clientAccountManifestItemsTable.manifestId, manifestId));
    const existingIds = new Set(existing.map(e => e.shipmentId));
    const newIds = shipmentIds.filter(id => !existingIds.has(id));

    if (newIds.length === 0) {
      res.json({ added: 0, manifestNumber: manifest.manifestNumber });
      return;
    }

    await db.insert(clientAccountManifestItemsTable).values(
      newIds.map(sid => ({
        manifestId,
        shipmentId:     sid,
        deliveryStatus: "pending",
        addedAt:        now,
      }))
    );

    res.json({ added: newIds.length, manifestNumber: manifest.manifestNumber });
  } catch (e) {
    console.error("[POST /client-account-manifests/:id/add-shipments]", e);
    res.status(500).json({ error: "خطأ في إضافة الشحنات" });
  }
});

// ─── DELETE /client-account-manifests/:id ────────────────────────────────────
router.delete("/client-account-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await db.delete(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, id));
    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /client-account-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في حذف البيان" });
  }
});

// ─── GET /clients/:id/account-manifest-stats — لكارت العميل في الشبكة ────────
router.get("/clients/:id/account-manifest-stats", async (req, res): Promise<void> => {
  try {
    const clientId = Number(req.params.id);
    const tenantId = getTenantId(req);

    const manifests = await db.select({ id: clientAccountManifestsTable.id })
      .from(clientAccountManifestsTable)
      .where(and(
        eq(clientAccountManifestsTable.clientId, clientId),
        tenantId !== null
          ? or(eq(clientAccountManifestsTable.tenantId, tenantId), isNull(clientAccountManifestsTable.tenantId))
          : undefined,
      ));

    const manifestIds = manifests.map(m => m.id);
    let items: any[] = [];
    if (manifestIds.length) {
      items = await db.select().from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.manifestId, manifestIds));
    }

    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending" || i.deliveryStatus === "delayed").length;
    const total     = items.length;
    const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;

    res.json({ total, delivered, partial, returned, pending, deliveryRate, manifestCount: manifests.length });
  } catch (e) {
    console.error("[GET /clients/:id/account-manifest-stats]", e);
    res.status(500).json({ error: "خطأ في جلب الإحصائيات" });
  }
});

// ─── PATCH /client-account-manifests/:id/items/:shipmentId/urgent ───────────
router.patch("/client-account-manifests/:id/items/:shipmentId/urgent", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const shipmentId = Number(req.params.shipmentId);
    const { isUrgent, urgentNote } = z.object({
      isUrgent:   z.boolean(),
      urgentNote: z.string().max(255).optional().nullable(),
    }).parse(req.body);

    const [item] = await db
      .select({ id: clientAccountManifestItemsTable.id })
      .from(clientAccountManifestItemsTable)
      .where(and(
        eq(clientAccountManifestItemsTable.manifestId, manifestId),
        eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
      ))
      .limit(1);

    if (!item) { res.status(404).json({ error: "الشحنة غير موجودة في هذا البيان" }); return; }

    await db
      .update(clientAccountManifestItemsTable)
      .set({
        isUrgent:   isUrgent ? 1 : 0,
        urgentNote: isUrgent ? (urgentNote ?? null) : null,
        urgentAt:   isUrgent ? new Date() : null,
      })
      .where(eq(clientAccountManifestItemsTable.id, item.id));

    res.json({ success: true, isUrgent });
  } catch (e: any) {
    console.error("[PATCH /client-account-manifests/:id/items/:shipmentId/urgent]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الاستعجال" });
  }
});

// ─── POST /client-account-manifests/sync-warehouse-ready ─────────────────────
// حل شامل: يمر على كل الشحنات بحالة "قيد الشحن في المخزن" اللي معندهاش بيان
// (مثلاً بسبب حذف بيان قديم، أو استيراد بيانات) ويضيفهم تلقائيًا بنفس منطق
// autoAddShipmentToClientAccountManifest. آمن للتشغيل المتكرر.
router.post("/client-account-manifests/sync-warehouse-ready", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.status, "warehouse_ready"), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.status, "warehouse_ready");

    const candidates = await db
      .select({ id: shipmentsTable.id, clientId: shipmentsTable.clientId, shipmentNumber: shipmentsTable.shipmentNumber })
      .from(shipmentsTable)
      .where(cond);

    let added = 0;
    const skipped: { id: number; shipmentNumber: string | null; reason: string }[] = [];
    for (const s of candidates) {
      if (!s.clientId) { skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: "no_client_id" }); continue; }
      // ملحوظة: مبنتحققش هنا من وجود item قديم، لأن autoAddShipmentToClientAccountManifest
      // نفسها بتتأكد إن الـ item مرتبط بـ manifest موجود فعليًا (مش يتيم/بيان محذوف)
      // وبتنضف أي item يتيم قبل ما تضيف صح — فهي كافية ومش محتاجة تكرار الشرط هنا.
      const beforeCount = await db
        .select({ id: clientAccountManifestItemsTable.id })
        .from(clientAccountManifestItemsTable)
        .innerJoin(clientAccountManifestsTable, eq(clientAccountManifestItemsTable.manifestId, clientAccountManifestsTable.id))
        .where(eq(clientAccountManifestItemsTable.shipmentId, s.id))
        .limit(1);
      if (beforeCount.length) { skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: "already_in_manifest" }); continue; }
      try {
        await autoAddShipmentToClientAccountManifest(s.id, s.clientId, tenantId);
        added++;
      } catch (err: any) {
        skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: `error: ${err?.message ?? err}` });
      }
    }

    res.json({ success: true, scanned: candidates.length, added, skipped });
  } catch (e: any) {
    console.error("[POST /client-account-manifests/sync-warehouse-ready]", e);
    res.status(500).json({ error: "خطأ في مزامنة الشحنات مع بيانات العملاء" });
  }
});

export default router;
