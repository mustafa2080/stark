import { Router, type IRouter } from "express";
import { eq, desc, and, inArray, count, isNull, or, notInArray } from "drizzle-orm";
import {
  db,
  saleOrderManifestsTable,
  saleOrderManifestItemsTable,
  saleOrdersTable,
  clientsTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getTenantId } from "../middlewares/requireTenant.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── توليد رقم البيان ────────────────────────────────────────────────────────
async function generateManifestNumber(clientId: number): Promise<string> {
  const [row] = await db
    .select({ cnt: count() })
    .from(saleOrderManifestsTable)
    .where(eq(saleOrderManifestsTable.clientId, clientId));
  const seq = (Number(row?.cnt ?? 0) + 1).toString().padStart(3, "0");
  return `SOM-${clientId}-${seq}`;
}

// ─── GET /sale-order-manifests?clientId=X ────────────────────────────────────
router.get("/sale-order-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;

    const tenantCondition = tenantId !== null
      ? or(eq(saleOrderManifestsTable.tenantId, tenantId), isNull(saleOrderManifestsTable.tenantId))
      : undefined;

    const where = and(
      tenantCondition,
      clientId ? eq(saleOrderManifestsTable.clientId, clientId) : undefined,
    );

    const manifests = await db
      .select()
      .from(saleOrderManifestsTable)
      .where(where)
      .orderBy(desc(saleOrderManifestsTable.createdAt));

    const ids = manifests.map(m => m.id);
    let orderCountMap: Record<number, number> = {};
    let itemsByManifest: Record<number, number[]> = {};
    if (ids.length) {
      const items = await db
        .select({ manifestId: saleOrderManifestItemsTable.manifestId, saleOrderId: saleOrderManifestItemsTable.saleOrderId })
        .from(saleOrderManifestItemsTable)
        .where(inArray(saleOrderManifestItemsTable.manifestId, ids));

      items.forEach(it => {
        orderCountMap[it.manifestId] = (orderCountMap[it.manifestId] ?? 0) + 1;
        if (!itemsByManifest[it.manifestId]) itemsByManifest[it.manifestId] = [];
        itemsByManifest[it.manifestId].push(it.saleOrderId);
      });
    }

    const allOrderIds = Object.values(itemsByManifest).flat();
    let statusMap: Record<number, string> = {};
    if (allOrderIds.length) {
      const orderRows = await db
        .select({ id: saleOrdersTable.id, status: saleOrdersTable.status })
        .from(saleOrdersTable)
        .where(inArray(saleOrdersTable.id, allOrderIds));
      orderRows.forEach(o => { statusMap[o.id] = o.status; });
    }

    const statusCountMap: Record<number, { draft: number; confirmed: number; processing: number; delivered: number; closed: number }> = {};
    Object.entries(itemsByManifest).forEach(([mid, orderIds]) => {
      const m = Number(mid);
      const counts = { draft: 0, confirmed: 0, processing: 0, delivered: 0, closed: 0 };
      orderIds.forEach(oid => {
        const st = statusMap[oid] as keyof typeof counts | undefined;
        if (st && st in counts) counts[st]++;
      });
      statusCountMap[m] = counts;
    });

    const clientIds = [...new Set(manifests.map(m => m.clientId))];
    const clientsRows = clientIds.length
      ? await db.select({ id: clientsTable.id, name: clientsTable.name, avatar: clientsTable.avatar })
          .from(clientsTable).where(inArray(clientsTable.id, clientIds))
      : [];
    const clientMap: Record<number, { name: string; avatar: string | null }> = {};
    clientsRows.forEach(c => { clientMap[c.id] = { name: c.name, avatar: c.avatar }; });

    const result = manifests.map(m => ({
      ...m,
      orderCount: orderCountMap[m.id] ?? 0,
      statusCounts: statusCountMap[m.id] ?? { draft: 0, confirmed: 0, processing: 0, delivered: 0, closed: 0 },
      clientName: clientMap[m.clientId]?.name ?? "",
      clientAvatar: clientMap[m.clientId]?.avatar ?? null,
    }));

    res.json(result);
  } catch (e) {
    console.error("[GET /sale-order-manifests]", e);
    res.status(500).json({ error: "خطأ في جلب البيانات" });
  }
});

// ─── GET /sale-order-manifests/available/:clientId ───────────────────────────
router.get("/sale-order-manifests/available/:clientId", async (req, res): Promise<void> => {
  try {
    const clientId = Number(req.params.clientId);
    const [client] = await db.select({ id: clientsTable.id, name: clientsTable.name })
      .from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    const usedItems = await db
      .select({ saleOrderId: saleOrderManifestItemsTable.saleOrderId })
      .from(saleOrderManifestItemsTable);
    const usedIds = usedItems.map(i => i.saleOrderId);

    const where = usedIds.length
      ? and(eq(saleOrdersTable.clientName, client.name), notInArray(saleOrdersTable.id, usedIds))
      : eq(saleOrdersTable.clientName, client.name);

    const orders = await db
      .select({
        id: saleOrdersTable.id,
        soNumber: saleOrdersTable.soNumber,
        status: saleOrdersTable.status,
        paymentStatus: saleOrdersTable.paymentStatus,
        totalAmount: saleOrdersTable.totalAmount,
        paidAmount: saleOrdersTable.paidAmount,
        createdAt: saleOrdersTable.createdAt,
      })
      .from(saleOrdersTable)
      .where(where)
      .orderBy(desc(saleOrdersTable.createdAt));

    res.json(orders);
  } catch (e) {
    console.error("[GET /sale-order-manifests/available/:clientId]", e);
    res.status(500).json({ error: "خطأ في جلب الفواتير المتاحة" });
  }
});

// ─── GET /sale-order-manifests/:id ────────────────────────────────────────────
router.get("/sale-order-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [manifest] = await db.select().from(saleOrderManifestsTable).where(eq(saleOrderManifestsTable.id, id));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }

    const items = await db
      .select()
      .from(saleOrderManifestItemsTable)
      .where(eq(saleOrderManifestItemsTable.manifestId, id));

    const orderIds = items.map(i => i.saleOrderId);
    let orders: any[] = [];
    if (orderIds.length) {
      orders = await db.select().from(saleOrdersTable).where(inArray(saleOrdersTable.id, orderIds));
    }
    const orderMap: Record<number, any> = {};
    orders.forEach(o => { orderMap[o.id] = o; });

    const enrichedItems = items.map(item => {
      const o = orderMap[item.saleOrderId] ?? null;
      return {
        ...item,
        order: o ? {
          id: o.id, soNumber: o.soNumber, status: o.status, paymentStatus: o.paymentStatus,
          totalAmount: o.totalAmount, paidAmount: o.paidAmount, createdAt: o.createdAt,
          clientName: o.clientName, clientPhone: o.clientPhone,
        } : null,
      };
    });

    const delivered  = orders.filter(o => o.status === "delivered").length;
    const processing = orders.filter(o => o.status === "processing" || o.status === "confirmed").length;
    let totalAmount = 0, totalPaid = 0;
    orders.forEach(o => {
      totalAmount += Number(o.totalAmount ?? 0);
      totalPaid   += Number(o.paidAmount ?? 0);
    });
    const totalUnpaid = totalAmount - totalPaid;

    const [client] = await db.select({ id: clientsTable.id, name: clientsTable.name, phone: clientsTable.phone, city: clientsTable.city })
      .from(clientsTable).where(eq(clientsTable.id, manifest.clientId));

    res.json({
      ...manifest,
      client: client ?? null,
      items: enrichedItems,
      stats: {
        total: items.length, delivered, processing,
        totalAmount, totalPaid, totalUnpaid,
      },
    });
  } catch (e) {
    console.error("[GET /sale-order-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في جلب البيان" });
  }
});

// ─── POST /sale-order-manifests ──────────────────────────────────────────────
const CreateSchema = z.object({
  clientId:     z.number().int().positive(),
  saleOrderIds: z.array(z.number().int().positive()).min(1),
  notes:        z.string().nullish(),
});

router.post("/sale-order-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const body = CreateSchema.parse(req.body);

    const [existing] = await db
      .select({ id: saleOrderManifestsTable.id })
      .from(saleOrderManifestsTable)
      .where(and(
        eq(saleOrderManifestsTable.clientId, body.clientId),
        eq(saleOrderManifestsTable.status, "open"),
        tenantId !== null
          ? or(eq(saleOrderManifestsTable.tenantId, tenantId), isNull(saleOrderManifestsTable.tenantId))
          : undefined,
      ));
    if (existing) {
      res.status(409).json({ error: "يوجد بيان مفتوح بالفعل لهذا العميل" });
      return;
    }

    const manifestNumber = await generateManifestNumber(body.clientId);
    const now = new Date();

    const [result] = await db.insert(saleOrderManifestsTable).values({
      tenantId: tenantId ?? null,
      manifestNumber,
      clientId: body.clientId,
      status:   "open",
      notes:    body.notes ?? null,
      createdAt: now,
    });
    const manifestId = (result as any).insertId as number;

    await db.insert(saleOrderManifestItemsTable).values(
      body.saleOrderIds.map(sid => ({
        manifestId,
        saleOrderId: sid,
        addedAt:     now,
      }))
    );

    res.status(201).json({
      id: manifestId,
      manifestNumber,
      orderCount: body.saleOrderIds.length,
    });
  } catch (e: any) {
    console.error("[POST /sale-order-manifests]", e);
    if (e?.name === "ZodError") { res.status(400).json({ error: e.errors[0]?.message }); return; }
    res.status(500).json({ error: "خطأ في إنشاء البيان" });
  }
});

// ─── POST /sale-order-manifests/:id/add-orders ───────────────────────────────
router.post("/sale-order-manifests/:id/add-orders", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const { saleOrderIds } = req.body as { saleOrderIds: number[] };

    if (!Array.isArray(saleOrderIds) || saleOrderIds.length === 0) {
      res.status(400).json({ error: "يجب إرسال قائمة فواتير" });
      return;
    }

    const [manifest] = await db.select().from(saleOrderManifestsTable).where(eq(saleOrderManifestsTable.id, manifestId));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifest.status === "closed") { res.status(400).json({ error: "البيان مغلق" }); return; }

    const now = new Date();
    const existing = await db.select({ saleOrderId: saleOrderManifestItemsTable.saleOrderId })
      .from(saleOrderManifestItemsTable)
      .where(eq(saleOrderManifestItemsTable.manifestId, manifestId));
    const existingIds = new Set(existing.map(e => e.saleOrderId));
    const newIds = saleOrderIds.filter(id => !existingIds.has(id));

    if (newIds.length === 0) {
      res.json({ added: 0, manifestNumber: manifest.manifestNumber });
      return;
    }

    await db.insert(saleOrderManifestItemsTable).values(
      newIds.map(sid => ({
        manifestId,
        saleOrderId: sid,
        addedAt:     now,
      }))
    );

    res.json({ added: newIds.length, manifestNumber: manifest.manifestNumber });
  } catch (e) {
    console.error("[POST /sale-order-manifests/:id/add-orders]", e);
    res.status(500).json({ error: "خطأ في إضافة الفواتير" });
  }
});

// ─── PATCH /sale-order-manifests/:id  (فتح/قفل البيان + ترحيل تلقائي) ────────
router.patch("/sale-order-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const body = req.body as {
      status?: "open" | "closed";
      notes?: string;
      invoicePrice?: number | null;
      rollover?: boolean;
    };
    const now = new Date();

    const [manifest] = await db.select().from(saleOrderManifestsTable).where(eq(saleOrderManifestsTable.id, id));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }

    await db.update(saleOrderManifestsTable)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.invoicePrice !== undefined ? { invoicePrice: body.invoicePrice == null ? null : String(body.invoicePrice) } : {}),
        ...(body.status === "closed" ? { closedAt: now } : {}),
        ...(body.status === "open"   ? { closedAt: null } : {}),
      })
      .where(eq(saleOrderManifestsTable.id, id));

    let rolled: { id: number; manifestNumber: string; orderCount: number } | undefined;

    // ─── ترحيل تلقائي: أي فاتورة لسه مش delivered/closed تتنقل لبيان جديد مفتوح ───
    if (body.status === "closed" && body.rollover) {
      const items = await db.select({ saleOrderId: saleOrderManifestItemsTable.saleOrderId })
        .from(saleOrderManifestItemsTable)
        .where(eq(saleOrderManifestItemsTable.manifestId, id));
      const orderIds = items.map(i => i.saleOrderId);

      let unfinishedIds: number[] = [];
      if (orderIds.length) {
        const orderRows = await db.select({ id: saleOrdersTable.id, status: saleOrdersTable.status })
          .from(saleOrdersTable)
          .where(inArray(saleOrdersTable.id, orderIds));
        unfinishedIds = orderRows
          .filter(o => o.status !== "delivered" && o.status !== "closed" && o.status !== "cancelled")
          .map(o => o.id);
      }

      if (unfinishedIds.length > 0) {
        const newManifestNumber = await generateManifestNumber(manifest.clientId);
        const [newResult] = await db.insert(saleOrderManifestsTable).values({
          tenantId: manifest.tenantId ?? null,
          manifestNumber: newManifestNumber,
          clientId: manifest.clientId,
          status: "open",
          createdAt: now,
        });
        const newManifestId = (newResult as any).insertId as number;

        await db.insert(saleOrderManifestItemsTable).values(
          unfinishedIds.map(sid => ({
            manifestId: newManifestId,
            saleOrderId: sid,
            addedAt: now,
          }))
        );

        rolled = { id: newManifestId, manifestNumber: newManifestNumber, orderCount: unfinishedIds.length };
      }
    }

    res.json({ success: true, ...(rolled ? { rolled } : {}) });
  } catch (e) {
    console.error("[PATCH /sale-order-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في تحديث البيان" });
  }
});

// ─── DELETE /sale-order-manifests/:id ─────────────────────────────────────────
router.delete("/sale-order-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await db.delete(saleOrderManifestsTable).where(eq(saleOrderManifestsTable.id, id));
    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /sale-order-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في حذف البيان" });
  }
});

export default router;
