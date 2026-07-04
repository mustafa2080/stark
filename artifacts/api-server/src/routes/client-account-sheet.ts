import { Router, type IRouter } from "express";
import { eq, desc, and, like, isNull, inArray, sql } from "drizzle-orm";
import {
  db,
  shipmentsTable,
  shipmentManifestsTable,
  shipmentManifestItemsTable,
  warehousesTable,
  clientAccountClosuresTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getTenantId } from "../middlewares/requireTenant.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── تطبيع رقم الهاتف للمقارنة المرنة ────────────────────────────────────────
// بيشيل أي حروف غير رقمية (مسافات/شرطات/+20)، وياخد آخر 9 أرقام فقط
// (ده بيتخطى مشاكل صفر البداية الناقص/الزيادة وكود الدولة، وكافي لتمييز رقم موبايل مصري)
function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.slice(-9);
}

// ─── حالة الشحنة المعروضة فى شيت حساب العميل ────────────────────────────────
type SheetStatus =
  | "waiting" | "confirmed" | "picked_up" | "in_transit" | "out_for_delivery"
  | "delayed" | "delivered" | "partial_received" | "returned" | "cancelled";

// ─── هل الشحنة "مؤجلة" حاليًا داخل بيان مفتوح؟ ────────────────────────────────
// deliveryStatus = 'delayed' فى shipment_manifest_items ضمن بيان status='open'
async function getOpenManifestDelayedMap() {
  const openManifests = await db
    .select({ id: shipmentManifestsTable.id })
    .from(shipmentManifestsTable)
    .where(eq(shipmentManifestsTable.status, "open"));
  const openIds = openManifests.map((m: any) => m.id);
  const delayedMap = new Map<number, string | null>();
  if (openIds.length > 0) {
    const links = await db
      .select({ shipmentId: shipmentManifestItemsTable.shipmentId, deliveryNote: shipmentManifestItemsTable.deliveryNote })
      .from(shipmentManifestItemsTable)
      .where(and(
        inArray(shipmentManifestItemsTable.manifestId, openIds),
        eq(shipmentManifestItemsTable.deliveryStatus, "delayed"),
      ));
    for (const l of links) delayedMap.set(l.shipmentId, l.deliveryNote ?? null);
  }
  return delayedMap;
}

// ─── GET /client-account-sheet/search ── بحث بالاسم لإيجاد أرقام الهاتف المطابقة ─
// البحث الدقيق بيتم بالفون فقط (مفتاح موحّد). البحث بالاسم بيرجع قائمة مرشحين
// (اسم + فون + عدد شحنات) عشان تختار الرقم الصح لو فيه أكتر من زبون بنفس الاسم.
// "اسم العميل" = اسم المستلم (receiverName) لأنه هو الزبون النهائي اللي بيستلم الشحنة.
router.get("/client-account-sheet/search", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const name = (req.query.name as string | undefined)?.trim();
    if (!name) { res.status(400).json({ error: "لازم اسم للبحث" }); return; }

    const conditions: any[] = [isNull(shipmentsTable.deletedAt), like(shipmentsTable.receiverName, `%${name}%`)];
    if (tenantId !== null) conditions.push(eq(shipmentsTable.tenantId, tenantId));

    const rows = await db
      .select({ receiverName: shipmentsTable.receiverName, receiverPhone: shipmentsTable.receiverPhone })
      .from(shipmentsTable)
      .where(and(...conditions));

    // التجميع بيتم على الرقم المطبَّع عشان لو نفس العميل مكتوب فونه بصيغ مختلفة شوية
    // (زي صفر ناقص/زيادة) يتجمع تحت نفس المرشح بدل ما يتقسم لعملاء وهميين مختلفين
    const byPhone = new Map<string, { name: string; phone: string; shipmentsCount: number }>();
    for (const r of rows) {
      if (!r.receiverPhone) continue;
      const key = normalizePhone(r.receiverPhone) || r.receiverPhone;
      const existing = byPhone.get(key);
      if (existing) existing.shipmentsCount++;
      else byPhone.set(key, { name: r.receiverName, phone: r.receiverPhone, shipmentsCount: 1 });
    }

    res.json({ matches: [...byPhone.values()].sort((a, b) => b.shipmentsCount - a.shipmentsCount) });
  } catch (err: any) {
    console.error("client-account-sheet/search error:", err);
    res.status(500).json({ error: "حصل خطأ فى البحث" });
  }
});

// ─── GET /client-account-sheet/orders ── جلب كل شحنات عميل بالفون (مفتاح دقيق) ─
router.get("/client-account-sheet/orders", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const phone = (req.query.phone as string | undefined)?.trim();

    if (!phone) { res.status(400).json({ error: "لازم رقم تليفون دقيق للبحث — استخدم /search للاسم أولاً" }); return; }

    const normalized = normalizePhone(phone);
    if (!normalized) { res.status(400).json({ error: "رقم التليفون غير صالح" }); return; }

    // مطابقة مرنة: نقارن آخر 9 أرقام من الرقم المخزن مع آخر 9 أرقام من رقم البحث
    // (بيتخطى فروق صفر البداية الناقص/الزيادة وكود الدولة)
    const conditions: any[] = [
      isNull(shipmentsTable.deletedAt),
      sql`RIGHT(REGEXP_REPLACE(${shipmentsTable.receiverPhone}, '[^0-9]', ''), 9) = ${normalized}`,
    ];
    if (tenantId !== null) conditions.push(eq(shipmentsTable.tenantId, tenantId));

    const rows = await db
      .select()
      .from(shipmentsTable)
      .where(and(...conditions))
      .orderBy(desc(shipmentsTable.createdAt));

    if (rows.length === 0) { res.json({ client: null, orders: [], stats: null }); return; }

    const warehouseIds = [...new Set(rows.map((r: any) => r.warehouseId).filter((v: any): v is number => v != null))];
    const warehouses = warehouseIds.length
      ? await db.select({ id: warehousesTable.id, name: warehousesTable.name }).from(warehousesTable).where(inArray(warehousesTable.id, warehouseIds))
      : [];
    const warehouseMap = new Map(warehouses.map((w: any) => [w.id, w.name]));

    const delayedMap = await getOpenManifestDelayedMap();

    const orders = rows.map((s: any) => {
      let resolvedStatus: SheetStatus = s.status as SheetStatus;
      let noteAuto: string | null = null;

      if (delayedMap.has(s.id)) {
        resolvedStatus = "delayed";
        noteAuto = delayedMap.get(s.id) ?? null;
      }

      const collected = s.collectedAmount;
      let collectedNote: string | null = null;
      if (collected != null) {
        const diff = Number(s.totalAmount) - Number(collected);
        if (diff > 0.01) collectedNote = `أقل بـ ${diff.toFixed(0)}`;
        else if (diff < -0.01) collectedNote = `زيادة ${Math.abs(diff).toFixed(0)}`;
      }

      return {
        id: s.id,
        customerName: s.receiverName,
        phone: s.receiverPhone,
        city: s.receiverCity,
        address: s.receiverAddress,
        senderName: s.senderName,
        warehouseName: s.warehouseId ? (warehouseMap.get(s.warehouseId) ?? null) : null,
        unitPrice: s.codAmount,
        totalPrice: s.totalAmount,
        shippingCost: s.shippingFee,
        collectedAmount: s.collectedAmount,
        status: resolvedStatus,
        returnReceived: s.status === "returned" ? s.returnReceived : null,
        product: s.description,
        invoiceNumber: s.shipmentNumber,
        createdAt: s.createdAt,
        notes: [s.notes, noteAuto, collectedNote].filter(Boolean).join(" — ") || null,
      };
    });

    const stats = {
      newOrders: orders.filter((o: any) => o.status === "waiting" || o.status === "confirmed").length,
      returnedNotReceived: orders.filter((o: any) => o.status === "returned" && o.returnReceived !== 1).length,
      delayedOrInDelivery: orders.filter((o: any) =>
        o.status === "delayed" || o.status === "in_transit" || o.status === "out_for_delivery" || o.status === "picked_up"
      ).length,
      totalOrders: orders.length,
    };

    const first = rows[0];
    res.json({
      client: { name: first.receiverName, phone: first.receiverPhone, city: first.receiverCity, address: first.receiverAddress },
      orders,
      stats,
    });
  } catch (err: any) {
    console.error("client-account-sheet/orders error:", err);
    res.status(500).json({ error: "حصل خطأ فى جلب حساب العميل" });
  }
});

// ─── PATCH /client-account-sheet/orders/:id/collected ── تحديث المبلغ المحصَّل ─
const CollectedSchema = z.object({
  collectedAmount: z.number().nullable(),
});

router.patch("/client-account-sheet/orders/:id/collected", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const parsed = CollectedSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existing] = await db.select().from(shipmentsTable).where(and(eq(shipmentsTable.id, id), isNull(shipmentsTable.deletedAt)));
    if (!existing) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

    await db.update(shipmentsTable)
      .set({ collectedAmount: String(parsed.data.collectedAmount ?? 0) as any, updatedAt: new Date() })
      .where(eq(shipmentsTable.id, id));

    await logAudit({
      action: "update", entityType: "shipment", entityId: id,
      entityName: `${existing.receiverName} — تحديث المبلغ المحصَّل`,
      before: { collectedAmount: existing.collectedAmount },
      after: { collectedAmount: parsed.data.collectedAmount },
      userId: (req as any).user?.id, userName: (req as any).user?.displayName,
    }).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    console.error("update collected amount error:", err);
    res.status(500).json({ error: "حصل خطأ فى تحديث المبلغ المحصَّل" });
  }
});

// ─── POST /client-account-sheet/close ── إقفال حساب العميل ─────────────────
const CloseAccountSchema = z.object({
  phone: z.string().min(1, "رقم التليفون مطلوب"),
  notes: z.string().nullish(),
});

router.post("/client-account-sheet/close", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CloseAccountSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { phone, notes } = parsed.data;

    const normalized = normalizePhone(phone);
    if (!normalized) { res.status(400).json({ error: "رقم التليفون غير صالح" }); return; }

    const conditions: any[] = [
      isNull(shipmentsTable.deletedAt),
      sql`RIGHT(REGEXP_REPLACE(${shipmentsTable.receiverPhone}, '[^0-9]', ''), 9) = ${normalized}`,
    ];
    if (tenantId !== null) conditions.push(eq(shipmentsTable.tenantId, tenantId));

    const rows = await db.select().from(shipmentsTable).where(and(...conditions));
    if (rows.length === 0) { res.status(404).json({ error: "لا يوجد شحنات لهذا العميل" }); return; }

    const delayedMap = await getOpenManifestDelayedMap();
    const closable = rows.filter((s: any) => !delayedMap.has(s.id) && s.status !== "delayed");

    if (closable.length === 0) {
      res.status(400).json({ error: "كل الشحنات مؤجلة/تحت التسليم — مفيش حاجة تتقفل دلوقتي" });
      return;
    }

    const totalShippingValue = closable.reduce((s: number, o: any) => s + Number(o.totalAmount ?? 0), 0);
    const totalCollected     = closable.reduce((s: number, o: any) => s + Number(o.collectedAmount ?? o.totalAmount ?? 0), 0);
    const totalShippingFee   = closable.reduce((s: number, o: any) => s + Number(o.shippingFee ?? 0), 0);

    const insertResult = await db.insert(clientAccountClosuresTable).values({
      tenantId,
      clientName: rows[0].receiverName,
      clientPhone: phone,
      orderIds: closable.map((o: any) => o.id),
      ordersCount: closable.length,
      totalShippingValue: String(totalShippingValue),
      totalCollected: String(totalCollected),
      totalShippingFee: String(totalShippingFee),
      notes: notes ?? null,
      closedByUserId: (req as any).user?.id ?? null,
      closedByName: (req as any).user?.displayName ?? null,
      createdAt: new Date(),
    });
    const closureId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;

    await logAudit({
      action: "create", entityType: "client_account_closure", entityId: closureId,
      entityName: `إقفال حساب ${rows[0].receiverName}`,
      after: { ordersCount: closable.length, totalCollected },
      userId: (req as any).user?.id, userName: (req as any).user?.displayName,
    }).catch(() => {});

    res.json({
      success: true,
      closureId,
      closedOrderIds: closable.map((o: any) => o.id),
      remainingDelayedCount: rows.length - closable.length,
    });
  } catch (err: any) {
    console.error("close client account error:", err);
    res.status(500).json({ error: "حصل خطأ فى إقفال الحساب" });
  }
});

// ─── GET /client-account-sheet/closures ── سجل عمليات الإقفال ──────────────
router.get("/client-account-sheet/closures", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const name  = (req.query.name as string | undefined)?.trim();
    const phone = (req.query.phone as string | undefined)?.trim();

    const conditions: any[] = [];
    if (tenantId !== null) conditions.push(eq(clientAccountClosuresTable.tenantId, tenantId));
    if (phone) conditions.push(eq(clientAccountClosuresTable.clientPhone, phone));
    else if (name) conditions.push(like(clientAccountClosuresTable.clientName, `%${name}%`)); // عرض/فلترة فقط، مش مفتاح دقيق

    const rows = await db
      .select()
      .from(clientAccountClosuresTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(clientAccountClosuresTable.createdAt));

    res.json(rows);
  } catch (err: any) {
    console.error("get closures error:", err);
    res.status(500).json({ error: "حصل خطأ فى جلب سجل الإقفالات" });
  }
});

export default router;
