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
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getTenantId } from "../middlewares/requireTenant.js";

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

// ─── GET /shipment-manifests?companyId=X ─────────────────────────────────────
router.get("/shipment-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;

    // tenantId === null يعني super_admin → بدون فلتر tenant
    const tenantCondition = tenantId !== null
      ? or(eq(shipmentManifestsTable.tenantId, tenantId), isNull(shipmentManifestsTable.tenantId))
      : undefined;

    const where = and(
      tenantCondition,
      companyId ? eq(shipmentManifestsTable.shippingCompanyId, companyId) : undefined,
    );

    const manifests = await db
      .select()
      .from(shipmentManifestsTable)
      .where(where)
      .orderBy(desc(shipmentManifestsTable.createdAt));

    // جيب عدد الشحنات لكل بيان
    const ids = manifests.map(m => m.id);
    let countMap: Record<number, number> = {};
    if (ids.length) {
      const counts = await db
        .select({
          manifestId: shipmentManifestItemsTable.manifestId,
          cnt: count(),
        })
        .from(shipmentManifestItemsTable)
        .where(inArray(shipmentManifestItemsTable.manifestId, ids))
        .groupBy(shipmentManifestItemsTable.manifestId);
      counts.forEach(r => { countMap[r.manifestId] = Number(r.cnt); });
    }

    // جيب اسم الشركة
    const companies = await db.select({ id: shippingCompaniesTable.id, name: shippingCompaniesTable.name, logo: shippingCompaniesTable.logo })
      .from(shippingCompaniesTable);
    const coMap: Record<number, { name: string; logo: string | null }> = {};
    companies.forEach(c => { coMap[c.id] = { name: c.name, logo: c.logo }; });

    const result = manifests.map(m => ({
      ...m,
      shipmentCount: countMap[m.id] ?? 0,
      companyName: coMap[m.shippingCompanyId]?.name ?? "",
      companyLogo: coMap[m.shippingCompanyId]?.logo ?? null,
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

    const enrichedItems = items.map(item => ({
      ...item,
      shipment: shipmentMap[item.shipmentId] ?? null,
    }));

    // إحصائيات
    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending").length;
    const delayed   = items.filter(i => i.deliveryStatus === "delayed").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered").length;

    // ─── حسابات مالية (P&L) ───────────────────────────────────────────────
    let totalRevenue = 0, totalCost = 0, totalShippingCost = 0, returnLosses = 0, deliveredGross = 0;
    for (const item of items) {
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
      const shipping = Number(shipment.shippingFee ?? 0);
      const cost     = Number(shipment.costPrice ?? 0);

      if (item.deliveryStatus === "delivered") {
        totalRevenue += cod;
        deliveredGross += cod;
        totalCost += cost;
        totalShippingCost += shipping;
      } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
        const qty = Number(shipment.quantity ?? 1);
        const unitCod = qty > 0 ? cod / qty : cod;
        const unitCost = qty > 0 ? cost / qty : cost;
        const partialCod = unitCod * Number(item.partialQuantity);
        totalRevenue += partialCod;
        deliveredGross += partialCod;
        totalCost += unitCost * Number(item.partialQuantity);
        totalShippingCost += shipping;
      } else if (item.deliveryStatus === "returned") {
        totalShippingCost += shipping;
      } else {
        totalShippingCost += shipping;
      }
    }
    const netProfit = totalRevenue - totalCost - totalShippingCost - returnLosses;

    const [company] = await db.select().from(shippingCompaniesTable)
      .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId));

    res.json({
      ...manifest,
      company: company ?? null,
      items: enrichedItems,
      stats: {
        total: items.length, delivered, returned, pending, delayed, partial,
        totalRevenue, totalCost, totalShippingCost, returnLosses,
        netProfit, deliveredGross,
      },
    });
  } catch (e) {
    console.error("[GET /shipment-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في جلب البيان" });
  }
});

// ─── POST /shipment-manifests ─────────────────────────────────────────────────
const CreateSchema = z.object({
  shippingCompanyId: z.number().int().positive(),
  shipmentIds:       z.array(z.number().int().positive()).min(1),
  notes:             z.string().nullish(),
});

router.post("/shipment-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const body = CreateSchema.parse(req.body);

    // تأكد مفيش بيان مفتوح لنفس الشركة
    const [existing] = await db
      .select({ id: shipmentManifestsTable.id })
      .from(shipmentManifestsTable)
      .where(and(
        eq(shipmentManifestsTable.shippingCompanyId, body.shippingCompanyId),
        eq(shipmentManifestsTable.status, "open"),
        tenantId !== null
          ? or(eq(shipmentManifestsTable.tenantId, tenantId), isNull(shipmentManifestsTable.tenantId))
          : undefined,
      ));
    if (existing) {
      res.status(409).json({ error: "يوجد بيان مفتوح بالفعل لهذه الشركة" });
      return;
    }

    const manifestNumber = await generateManifestNumber(body.shippingCompanyId);
    const now = new Date();

    const [result] = await db.insert(shipmentManifestsTable).values({
      tenantId:          tenantId ?? null,
      manifestNumber,
      shippingCompanyId: body.shippingCompanyId,
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

    // حدّث حالة الشحنات → in_transit
    await db.update(shipmentsTable)
      .set({ status: "in_transit", updatedAt: now })
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
  deliveryStatus: z.enum(["pending", "delivered", "returned", "delayed", "partial_delivered"]),
  deliveryNote:   z.string().nullish(),
  partialQuantity: z.number().int().nullish(),
  returnReceived: z.boolean().nullish(),
  returnReason:   z.string().nullish(),
});

router.patch("/shipment-manifests/:id/items/:shipmentId", async (req, res): Promise<void> => {
  try {
    const manifestId  = Number(req.params.id);
    const shipmentId  = Number(req.params.shipmentId);
    const body        = UpdateItemSchema.parse(req.body);
    const now         = new Date();

    await db.update(shipmentManifestItemsTable)
      .set({
        deliveryStatus: body.deliveryStatus,
        deliveryNote:   body.deliveryNote ?? null,
        partialQuantity: body.partialQuantity ?? null,
        returnReason:   body.returnReason ?? null,
        returnReceived: body.returnReceived == null ? null : body.returnReceived ? 1 : 0,
        deliveredAt:    (body.deliveryStatus === "delivered" || body.deliveryStatus === "partial_delivered") ? now : undefined,
      })
      .where(and(
        eq(shipmentManifestItemsTable.manifestId, manifestId),
        eq(shipmentManifestItemsTable.shipmentId, shipmentId),
      ));

    // حدّث حالة الشحنة نفسها
    const statusMap: Record<string, string> = {
      delivered: "delivered",
      returned:  "returned",
      delayed:   "delayed",
      partial_delivered: "delivered",
      pending:   "in_transit",
    };
    await db.update(shipmentsTable)
      .set({ status: statusMap[body.deliveryStatus] ?? "in_transit", updatedAt: now })
      .where(eq(shipmentsTable.id, shipmentId));

    res.json({ success: true });
  } catch (e: any) {
    console.error("[PATCH /shipment-manifests/:id/items/:shipmentId]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الشحنة" });
  }
});

// ─── تحويل إيراد البيان للخزنة عند الإغلاق ──────────────────────────────────
async function createTreasuryEntryOnClose(
  manifest: typeof shipmentManifestsTable.$inferSelect,
  items: (typeof shipmentManifestItemsTable.$inferSelect)[],
  userId: number | null,
  userName: string | null,
): Promise<void> {
  const now = new Date();

  // جيب الشحنات لمعرفة سعر كل شحنة
  const shipmentIds = items.map(i => i.shipmentId);
  const shipments = shipmentIds.length > 0
    ? await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds))
    : [];
  const shipmentMap = new Map(shipments.map(s => [s.id, s]));

  let grossRevenue = 0;

  for (const item of items) {
    const shipment = shipmentMap.get(item.shipmentId);
    if (!shipment) continue;
    const price = Number(shipment.totalPrice ?? shipment.shippingFee ?? 0);

    if (item.deliveryStatus === "delivered") {
      grossRevenue += price;
    } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
      // لو الشحنة مسلمة جزئياً → نحسب نسبة من السعر
      const qty = Number(shipment.quantity ?? 1);
      const unitPrice = qty > 0 ? price / qty : price;
      grossRevenue += unitPrice * Number(item.partialQuantity);
    }
    // returned / delayed / pending → مش بيتحسب
  }

  if (grossRevenue <= 0) return;

  // جيب الخزنة الرئيسية
  const [mainRegister] = await db
    .select()
    .from(cashRegistersTable)
    .where(and(eq(cashRegistersTable.type, "main"), eq(cashRegistersTable.isActive, true)))
    .limit(1);

  if (!mainRegister) return;

  const balanceBefore = Number(mainRegister.balance ?? 0);
  const balanceAfter  = balanceBefore + grossRevenue;

  const [company] = await db.select().from(shippingCompaniesTable)
    .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId));

  await db.insert(cashTransactionsTable).values({
    registerId:      mainRegister.id,
    type:            "shipping_transfer" as any,
    amount:          String(grossRevenue),
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

// ─── PATCH /shipment-manifests/:id  (قفل/فتح البيان) ────────────────────────
router.patch("/shipment-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id   = Number(req.params.id);
    const body = req.body as { status?: "open" | "closed"; notes?: string; invoicePrice?: number | null };
    const now  = new Date();

    await db.update(shipmentManifestsTable)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.invoicePrice !== undefined ? { invoicePrice: String(body.invoicePrice) } : {}),
        ...(body.status === "closed" ? { closedAt: now } : {}),
        ...(body.status === "open"   ? { closedAt: null } : {}),
      })
      .where(eq(shipmentManifestsTable.id, id));

    // ── تحويل الإيراد للخزنة عند الإغلاق ──────────────────────────────────
    if (body.status === "closed") {
      try {
        const [manifest] = await db.select().from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id));
        if (manifest) {
          const items = await db.select().from(shipmentManifestItemsTable)
            .where(eq(shipmentManifestItemsTable.manifestId, id));
          const userId   = (req as any).user?.id   ?? null;
          const userName = (req as any).user?.name ?? null;
          await createTreasuryEntryOnClose(manifest, items, userId, userName);
        }
      } catch (err) {
        console.error("[PATCH /shipment-manifests/:id] treasury entry error:", err);
        // لا نوقف الـ response — البيان اتقفل بنجاح حتى لو الخزنة فيها مشكلة
      }
    }

    res.json({ success: true });
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
    const newIds = shipmentIds.filter(id => !existingIds.has(id));

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

    const manifests = await db.select({ id: shipmentManifestsTable.id })
      .from(shipmentManifestsTable)
      .where(and(
        eq(shipmentManifestsTable.shippingCompanyId, companyId),
        tenantId !== null
          ? or(eq(shipmentManifestsTable.tenantId, tenantId), isNull(shipmentManifestsTable.tenantId))
          : undefined,
      ));

    const manifestIds = manifests.map(m => m.id);
    let items: any[] = [];
    if (manifestIds.length) {
      items = await db.select().from(shipmentManifestItemsTable)
        .where(inArray(shipmentManifestItemsTable.manifestId, manifestIds));
    }

    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending" || i.deliveryStatus === "delayed").length;
    const total     = items.length;
    const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;

    // ─── حسابات مالية (P&L) من بيانات الشحنات نفسها ─────────────────────────
    let totalRevenue = 0, totalCost = 0, totalShippingCost = 0, returnLosses = 0, deliveredGross = 0;
    if (items.length) {
      const shipmentIds = items.map(i => i.shipmentId);
      const shipments = await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds));
      const shipmentMap = new Map(shipments.map(s => [s.id, s]));

      for (const item of items) {
        const shipment = shipmentMap.get(item.shipmentId);
        if (!shipment) continue;
        const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
        const shipping = Number(shipment.shippingFee ?? 0);
        const cost     = Number(shipment.costPrice ?? 0);

        if (item.deliveryStatus === "delivered" || item.deliveryStatus === "partial_delivered") {
          totalRevenue += cod;
          deliveredGross += cod;
          totalCost += cost;
          totalShippingCost += shipping;
        } else if (item.deliveryStatus === "returned") {
          returnLosses += shipping;
        } else {
          totalShippingCost += shipping;
        }
      }
    }
    const netProfit = totalRevenue - totalCost - totalShippingCost - returnLosses;

    res.json({
      total, delivered, partial, returned, pending,
      deliveryRate,
      totalRevenue, totalCost, totalShippingCost, returnLosses,
      netProfit, deliveredGross,
      manifestCount: manifests.length,
    });
  } catch (e) {
    console.error("[GET /shipping-companies/:id/shipment-stats]", e);
    res.status(500).json({ error: "خطأ في جلب الإحصائيات" });
  }
});

export default router;
