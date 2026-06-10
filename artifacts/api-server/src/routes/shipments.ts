import { Router, type IRouter } from "express";
import { eq, desc, and, like, or, inArray, sql, isNull } from "drizzle-orm";
import { db, shipmentsTable, shipmentZonesTable, parcelTypePricingTable, clientsTable } from "@workspace/db";
import { z } from "zod";
import { getTenantId } from "../middlewares/requireTenant.js";

const router: IRouter = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const CreateShipmentSchema = z.object({
  clientId:        z.number().int().positive().nullish(),
  senderName:      z.string().min(1),
  senderPhone:     z.string().nullish(),
  senderPhone2:    z.string().nullish(),
  senderEmail:     z.string().nullish(),
  senderAddress:   z.string().nullish(),
  senderCity:      z.string().nullish(),
  receiverName:    z.string().min(1),
  receiverPhone:   z.string().nullish(),
  receiverPhone2:  z.string().nullish(),
  receiverAddress: z.string().nullish(),
  receiverCity:    z.string().nullish(),
  zoneId:          z.number().int().positive().nullish(),
  zonePrice:       z.coerce.number().default(0),
  parcelType:      z.string().nullish(),
  parcelTypePrice: z.coerce.number().default(0),
  weight:          z.coerce.number().nullish(),
  pieces:          z.coerce.number().int().default(1),
  description:     z.string().nullish(),
  declaredValue:   z.coerce.number().default(0),
  paymentMethod:   z.enum(["cod", "prepaid", "deferred"]).default("cod"),
  codAmount:       z.coerce.number().default(0),
  shippingFee:     z.coerce.number().default(0),
  insuranceFee:    z.coerce.number().default(0),
  totalAmount:     z.coerce.number().default(0),
  shippingCompanyId: z.number().int().positive().nullish(),
  notes:           z.string().nullish(),
  internalNotes:   z.string().nullish(),
  status:          z.string().default("waiting"),
});

const UpdateShipmentSchema = CreateShipmentSchema.partial().extend({
  status: z.string().nullish(),
  trackingNumber: z.string().nullish(),
  collectedAmount: z.coerce.number().nullish(),
});

// ─── توليد رقم شحنة تلقائي ────────────────────────────────────────────────────
async function generateShipmentNumber(tenantId: number | null): Promise<string> {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(-2);
  const mm  = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `SHP${yy}${mm}`;
  const rows = await db
    .select({ n: shipmentsTable.shipmentNumber })
    .from(shipmentsTable)
    .where(
      tenantId !== null
        ? and(eq(shipmentsTable.tenantId, tenantId), like(shipmentsTable.shipmentNumber, `${prefix}%`))
        : like(shipmentsTable.shipmentNumber, `${prefix}%`)
    )
    .orderBy(desc(shipmentsTable.createdAt))
    .limit(1);
  const last = rows[0]?.n;
  const seq  = last ? (parseInt(last.slice(-4)) + 1) : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// ─── GET /shipments ───────────────────────────────────────────────────────────
router.get("/shipments", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { status, search, limit = "50", offset = "0" } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (tenantId !== null) conditions.push(eq(shipmentsTable.tenantId, tenantId));
    conditions.push(isNull(shipmentsTable.deletedAt));
    if (status && status !== "all") conditions.push(eq(shipmentsTable.status, status));
    if (search) {
      conditions.push(
        or(
          like(shipmentsTable.senderName,      `%${search}%`),
          like(shipmentsTable.receiverName,     `%${search}%`),
          like(shipmentsTable.receiverPhone,    `%${search}%`),
          like(shipmentsTable.senderPhone,      `%${search}%`),
          like(shipmentsTable.shipmentNumber,   `%${search}%`),
          like(shipmentsTable.trackingNumber,   `%${search}%`),
          like(shipmentsTable.receiverCity,     `%${search}%`),
        )
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, countRows] = await Promise.all([
      db.select().from(shipmentsTable).where(where)
        .orderBy(desc(shipmentsTable.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset)),
      db.select({ count: sql<number>`count(*)` }).from(shipmentsTable).where(where),
    ]);

    res.json({ data: rows, total: Number(countRows[0]?.count ?? 0) });
  } catch (e) {
    console.error("[GET /shipments]", e);
    res.status(500).json({ error: "خطأ في استرجاع الشحنات" });
  }
});

// ─── GET /shipments/stats ─────────────────────────────────────────────────────
router.get("/shipments/stats", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const rows = await db
      .select({ status: shipmentsTable.status, count: sql<number>`count(*)` })
      .from(shipmentsTable).where(cond)
      .groupBy(shipmentsTable.status);

    const totals = await db
      .select({
        totalShippingFee: sql<number>`coalesce(sum(shipping_fee),0)`,
        totalCod:         sql<number>`coalesce(sum(cod_amount),0)`,
        totalCollected:   sql<number>`coalesce(sum(collected_amount),0)`,
      })
      .from(shipmentsTable).where(cond);

    res.json({ statuses: rows, ...totals[0] });
  } catch (e) {
    res.status(500).json({ error: "خطأ في إحصائيات الشحنات" });
  }
});

// ─── GET /shipments/:id ───────────────────────────────────────────────────────
router.get("/shipments/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);
    const rows = await db.select().from(shipmentsTable).where(cond).limit(1);
    if (!rows.length) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "خطأ" });
  }
});

// ─── POST /shipments ──────────────────────────────────────────────────────────
router.post("/shipments", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const user     = (req as any).user;
    const parsed   = CreateShipmentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const d = parsed.data;
    const shipmentNumber = await generateShipmentNumber(tenantId);
    const now = new Date();

    const result = await db.insert(shipmentsTable).values({
      ...(tenantId !== null ? { tenantId } : {}),
      shipmentNumber,
      clientId:        d.clientId    ?? undefined,
      senderName:      d.senderName,
      senderPhone:     d.senderPhone ?? undefined,
      senderPhone2:    d.senderPhone2 ?? undefined,
      senderCity:      d.senderCity  ?? undefined,
      receiverName:    d.receiverName,
      receiverPhone:   d.receiverPhone  ?? undefined,
      receiverPhone2:  d.receiverPhone2 ?? undefined,
      receiverAddress: d.receiverAddress ?? undefined,
      receiverCity:    d.receiverCity ?? undefined,
      zoneId:          d.zoneId      ?? undefined,
      zonePrice:       String(d.zonePrice),
      parcelType:      d.parcelType  ?? undefined,
      parcelTypePrice: String(d.parcelTypePrice),
      weight:          d.weight      ? String(d.weight) : undefined,
      pieces:          d.pieces,
      description:     d.description ?? undefined,
      declaredValue:   String(d.declaredValue),
      paymentMethod:   d.paymentMethod,
      codAmount:       String(d.codAmount),
      shippingFee:     String(d.shippingFee),
      insuranceFee:    String(d.insuranceFee),
      totalAmount:     String(d.totalAmount),
      collectedAmount: "0",
      status:          d.status ?? "waiting",
      notes:           d.notes ?? undefined,
      shippingCompanyId: d.shippingCompanyId ?? undefined,
      createdByUserId: user?.id,
      createdByName:   user?.displayName ?? user?.username,
      createdAt:       now,
      updatedAt:       now,
    });

    const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
    const newShipment = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, insertId)).limit(1);
    res.status(201).json(newShipment[0]);
  } catch (e) {
    console.error("[POST /shipments]", e);
    res.status(500).json({ error: "خطأ في إنشاء الشحنة" });
  }
});

// ─── PUT /shipments/:id ───────────────────────────────────────────────────────
router.put("/shipments/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const parsed = UpdateShipmentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const d = parsed.data;
    const updateData: any = { updatedAt: new Date() };

    if (d.status           !== undefined) updateData.status           = d.status;
    if (d.trackingNumber   !== undefined) updateData.trackingNumber   = d.trackingNumber;
    if (d.collectedAmount  !== undefined) updateData.collectedAmount  = String(d.collectedAmount);
    if (d.senderName       !== undefined) updateData.senderName       = d.senderName;
    if (d.senderPhone      !== undefined) updateData.senderPhone      = d.senderPhone;
    if (d.receiverName     !== undefined) updateData.receiverName     = d.receiverName;
    if (d.receiverPhone    !== undefined) updateData.receiverPhone    = d.receiverPhone;
    if (d.receiverAddress  !== undefined) updateData.receiverAddress  = d.receiverAddress;
    if (d.receiverCity     !== undefined) updateData.receiverCity     = d.receiverCity;
    if (d.zoneId           !== undefined) updateData.zoneId           = d.zoneId;
    if (d.zonePrice        !== undefined) updateData.zonePrice        = String(d.zonePrice);
    if (d.parcelType       !== undefined) updateData.parcelType       = d.parcelType;
    if (d.parcelTypePrice  !== undefined) updateData.parcelTypePrice  = String(d.parcelTypePrice);
    if (d.weight           !== undefined) updateData.weight           = d.weight ? String(d.weight) : null;
    if (d.pieces           !== undefined) updateData.pieces           = d.pieces;
    if (d.description      !== undefined) updateData.description      = d.description;
    if (d.paymentMethod    !== undefined) updateData.paymentMethod    = d.paymentMethod;
    if (d.codAmount        !== undefined) updateData.codAmount        = String(d.codAmount);
    if (d.shippingFee      !== undefined) updateData.shippingFee      = String(d.shippingFee);
    if (d.insuranceFee     !== undefined) updateData.insuranceFee     = String(d.insuranceFee);
    if (d.totalAmount      !== undefined) updateData.totalAmount      = String(d.totalAmount);
    if (d.notes            !== undefined) updateData.notes            = d.notes;
    if (d.internalNotes    !== undefined) updateData.internalNotes    = d.internalNotes;
    if (d.shippingCompanyId !== undefined) updateData.shippingCompanyId = d.shippingCompanyId;

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);

    await db.update(shipmentsTable).set(updateData).where(cond);
    const updated = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    res.json(updated[0]);
  } catch (e) {
    console.error("[PUT /shipments/:id]", e);
    res.status(500).json({ error: "خطأ في تحديث الشحنة" });
  }
});

// ─── DELETE /shipments/:id (soft delete) ──────────────────────────────────────
router.delete("/shipments/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);
    await db.update(shipmentsTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(cond);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "خطأ في حذف الشحنة" });
  }
});

// ─── GET /shipment-zones ──────────────────────────────────────────────────────
router.get("/shipment-zones", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cond = tenantId !== null ? eq(shipmentZonesTable.tenantId, tenantId) : undefined;
    const rows = await db.select().from(shipmentZonesTable).where(cond).orderBy(shipmentZonesTable.name);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "خطأ" }); }
});

router.post("/shipment-zones", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { name, governorate, price, isActive = true } = req.body;
    if (!name || price === undefined) { res.status(400).json({ error: "الاسم والسعر مطلوبان" }); return; }
    const result = await db.insert(shipmentZonesTable).values({
      ...(tenantId !== null ? { tenantId } : {}),
      name, governorate: governorate ?? null,
      price: String(price), isActive,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const id = (result as any)[0]?.insertId ?? (result as any).insertId;
    const rows = await db.select().from(shipmentZonesTable).where(eq(shipmentZonesTable.id, id)).limit(1);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: "خطأ في إضافة المنطقة" }); }
});

router.put("/shipment-zones/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { name, governorate, price, isActive } = req.body;
    const upd: any = { updatedAt: new Date() };
    if (name       !== undefined) upd.name        = name;
    if (governorate !== undefined) upd.governorate = governorate;
    if (price      !== undefined) upd.price       = String(price);
    if (isActive   !== undefined) upd.isActive    = isActive;
    await db.update(shipmentZonesTable).set(upd).where(eq(shipmentZonesTable.id, id));
    const rows = await db.select().from(shipmentZonesTable).where(eq(shipmentZonesTable.id, id)).limit(1);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: "خطأ" }); }
});

router.delete("/shipment-zones/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(shipmentZonesTable).where(eq(shipmentZonesTable.id, id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "خطأ" }); }
});

// ─── GET /parcel-type-pricing ─────────────────────────────────────────────────
router.get("/parcel-type-pricing", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cond = tenantId !== null ? eq(parcelTypePricingTable.tenantId, tenantId) : undefined;
    const rows = await db.select().from(parcelTypePricingTable).where(cond).orderBy(parcelTypePricingTable.parcelType);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "خطأ" }); }
});

router.put("/parcel-type-pricing/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { basePrice, isActive } = req.body;
    const upd: any = { updatedAt: new Date() };
    if (basePrice !== undefined) upd.basePrice = String(basePrice);
    if (isActive  !== undefined) upd.isActive  = isActive;
    await db.update(parcelTypePricingTable).set(upd).where(eq(parcelTypePricingTable.id, id));
    const rows = await db.select().from(parcelTypePricingTable).where(eq(parcelTypePricingTable.id, id)).limit(1);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: "خطأ" }); }
});

router.post("/parcel-type-pricing/init", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const DEFAULTS = [
      { parcelType: "document",    label: "مستندات",     basePrice: "0" },
      { parcelType: "normal",      label: "طرد عادي",    basePrice: "0" },
      { parcelType: "fragile",     label: "قابل للكسر",  basePrice: "5" },
      { parcelType: "heavy",       label: "ثقيل",        basePrice: "10" },
      { parcelType: "electronics", label: "إلكترونيات",  basePrice: "10" },
      { parcelType: "clothing",    label: "ملابس",       basePrice: "0" },
      { parcelType: "food",        label: "طعام",        basePrice: "5" },
      { parcelType: "other",       label: "أخري",        basePrice: "0" },
    ];
    const now = new Date();
    for (const d of DEFAULTS) {
      const existing = tenantId !== null
        ? await db.select({ id: parcelTypePricingTable.id }).from(parcelTypePricingTable)
            .where(and(eq(parcelTypePricingTable.tenantId, tenantId), eq(parcelTypePricingTable.parcelType, d.parcelType))).limit(1)
        : await db.select({ id: parcelTypePricingTable.id }).from(parcelTypePricingTable)
            .where(eq(parcelTypePricingTable.parcelType, d.parcelType)).limit(1);
      if (!existing.length) {
        await db.insert(parcelTypePricingTable).values({
          ...(tenantId !== null ? { tenantId } : {}),
          parcelType: d.parcelType, label: d.label, basePrice: d.basePrice,
          isActive: true, createdAt: now, updatedAt: now,
        });
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "خطأ في التهيئة" }); }
});

export default router;
