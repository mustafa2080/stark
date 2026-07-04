import { Router, type IRouter } from "express";
import { eq, desc, and, or, like, isNull, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  shippingManifestOrdersTable,
  shippingManifestsTable,
  warehousesTable,
  clientAccountClosuresTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getTenantId } from "../middlewares/requireTenant.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── حالة الأوردر المعروضة فى شيت حساب العميل ───────────────────────────────
type SheetStatus =
  | "pending" | "warehouse_ready" | "in_shipping" | "delayed"
  | "received" | "partial_received" | "returned" | "cancelled";

async function getOpenManifestPostponedSet() {
  const openManifests = await db
    .select({ id: shippingManifestsTable.id })
    .from(shippingManifestsTable)
    .where(eq(shippingManifestsTable.status, "open"));
  const openIds = openManifests.map((m: any) => m.id);
  const postponedSet = new Set<number>();
  const noteMap = new Map<number, string | null>();
  if (openIds.length > 0) {
    const links = await db
      .select({ orderId: shippingManifestOrdersTable.orderId, deliveryNote: shippingManifestOrdersTable.deliveryNote })
      .from(shippingManifestOrdersTable)
      .where(and(
        inArray(shippingManifestOrdersTable.manifestId, openIds),
        eq(shippingManifestOrdersTable.deliveryStatus, "postponed"),
      ));
    for (const l of links) {
      postponedSet.add(l.orderId);
      if (!noteMap.has(l.orderId)) noteMap.set(l.orderId, l.deliveryNote ?? null);
    }
  }
  return { postponedSet, noteMap };
}

// ─── GET /client-account-sheet/orders ── جلب كل أوردرات عميل (زبون نهائي) ────
router.get("/client-account-sheet/orders", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const name  = (req.query.name as string | undefined)?.trim();
    const phone = (req.query.phone as string | undefined)?.trim();

    if (!name && !phone) { res.status(400).json({ error: "لازم اسم أو رقم تليفون للبحث" }); return; }

    const conditions: any[] = [isNull(ordersTable.deletedAt)];
    if (tenantId !== null) conditions.push(eq(ordersTable.tenantId, tenantId));

    if (phone) conditions.push(eq(ordersTable.phone, phone));
    else if (name) conditions.push(like(ordersTable.customerName, `%${name}%`));

    const rows = await db
      .select()
      .from(ordersTable)
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt));

    if (rows.length === 0) { res.json({ client: null, orders: [], stats: null }); return; }

    const warehouseIds = [...new Set(rows.map((r: any) => r.warehouseId).filter((v: any): v is number => v != null))];
    const warehouses = warehouseIds.length
      ? await db.select({ id: warehousesTable.id, name: warehousesTable.name }).from(warehousesTable).where(inArray(warehousesTable.id, warehouseIds))
      : [];
    const warehouseMap = new Map(warehouses.map((w: any) => [w.id, w.name]));

    const { postponedSet, noteMap } = await getOpenManifestPostponedSet();

    const returnedNullIds = rows.filter((o: any) => o.status === "returned" && o.returnReceived == null).map((o: any) => o.id);
    const manifestReturnMap = new Map<number, number | null>();
    if (returnedNullIds.length > 0) {
      const links = await db
        .select({ orderId: shippingManifestOrdersTable.orderId, returnReceived: shippingManifestOrdersTable.returnReceived })
        .from(shippingManifestOrdersTable)
        .where(inArray(shippingManifestOrdersTable.orderId, returnedNullIds));
      for (const l of links) manifestReturnMap.set(l.orderId, l.returnReceived ?? null);
    }

    const orders = rows.map((o: any) => {
      let resolvedStatus: SheetStatus = o.status as SheetStatus;
      let noteAuto: string | null = null;

      if (o.status === "in_shipping" && postponedSet.has(o.id)) {
        resolvedStatus = "delayed";
        noteAuto = noteMap.get(o.id) ?? null;
      } else if (o.status === "delayed") {
        resolvedStatus = "delayed";
      }

      const collected = o.collectedAmount;
      let collectedNote: string | null = null;
      if (collected != null) {
        const diff = Number(o.totalPrice) - Number(collected);
        if (diff > 0.01) collectedNote = `أقل بـ ${diff.toFixed(0)}`;
        else if (diff < -0.01) collectedNote = `زيادة ${Math.abs(diff).toFixed(0)}`;
      }

      const returnStillPending = o.status === "returned"
        ? (o.returnReceived ?? manifestReturnMap.get(o.id) ?? null)
        : null;

      return {
        id: o.id,
        customerName: o.customerName,
        phone: o.phone,
        city: o.city,
        address: o.address,
        senderName: o.customerName,
        warehouseName: o.warehouseId ? (warehouseMap.get(o.warehouseId) ?? null) : null,
        unitPrice: o.unitPrice,
        totalPrice: o.totalPrice,
        shippingCost: o.shippingCost,
        collectedAmount: o.collectedAmount,
        status: resolvedStatus,
        returnReceived: returnStillPending,
        product: o.product,
        invoiceNumber: o.invoiceNumber,
        createdAt: o.createdAt,
        notes: [o.notes, noteAuto, collectedNote].filter(Boolean).join(" — ") || null,
      };
    });

    const stats = {
      newOrders: orders.filter((o: any) => o.status === "pending").length,
      returnedNotReceived: orders.filter((o: any) => o.status === "returned" && o.returnReceived !== 1).length,
      delayedOrInDelivery: orders.filter((o: any) => o.status === "delayed" || o.status === "in_shipping").length,
      totalOrders: orders.length,
    };

    const first = rows[0];
    res.json({
      client: { name: first.customerName, phone: first.phone, city: first.city, address: first.address },
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

    const [existing] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, id), isNull(ordersTable.deletedAt)));
    if (!existing) { res.status(404).json({ error: "الأوردر غير موجود" }); return; }

    await db.update(ordersTable)
      .set({ collectedAmount: parsed.data.collectedAmount, updatedAt: new Date() })
      .where(eq(ordersTable.id, id));

    await logAudit({
      action: "update", entityType: "order", entityId: id,
      entityName: `${existing.customerName} — تحديث المبلغ المحصَّل`,
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
  name: z.string().nullish(),
  phone: z.string().nullish(),
  notes: z.string().nullish(),
});

router.post("/client-account-sheet/close", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CloseAccountSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { name, phone, notes } = parsed.data;
    if (!name && !phone) { res.status(400).json({ error: "لازم اسم أو رقم تليفون" }); return; }

    const conditions: any[] = [isNull(ordersTable.deletedAt)];
    if (tenantId !== null) conditions.push(eq(ordersTable.tenantId, tenantId));
    if (phone) conditions.push(eq(ordersTable.phone, phone));
    else if (name) conditions.push(like(ordersTable.customerName, `%${name}%`));

    const rows = await db.select().from(ordersTable).where(and(...conditions));
    if (rows.length === 0) { res.status(404).json({ error: "لا يوجد أوردرات لهذا العميل" }); return; }

    const { postponedSet } = await getOpenManifestPostponedSet();
    const closable = rows.filter((o: any) => {
      if (o.status === "delayed") return false;
      if (o.status === "in_shipping" && postponedSet.has(o.id)) return false;
      return true;
    });

    if (closable.length === 0) {
      res.status(400).json({ error: "كل الأوردرات مؤجلة/تحت التسليم — مفيش حاجة تتقفل دلوقتي" });
      return;
    }

    const totalShippingValue = closable.reduce((s: number, o: any) => s + Number(o.totalPrice ?? 0), 0);
    const totalCollected     = closable.reduce((s: number, o: any) => s + Number(o.collectedAmount ?? o.totalPrice ?? 0), 0);
    const totalShippingFee   = closable.reduce((s: number, o: any) => s + Number(o.shippingCost ?? 0), 0);

    const insertResult = await db.insert(clientAccountClosuresTable).values({
      tenantId,
      clientName: name || rows[0].customerName,
      clientPhone: phone || rows[0].phone,
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
      entityName: `إقفال حساب ${name || rows[0].customerName}`,
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
    else if (name) conditions.push(like(clientAccountClosuresTable.clientName, `%${name}%`));

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
