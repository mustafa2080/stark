import { Router, type IRouter } from "express";
import { eq, desc, and, like, or, inArray, sql, isNull } from "drizzle-orm";
import { db, shipmentsTable, shipmentItemsTable, shipmentZonesTable, parcelTypePricingTable, clientsTable, shippingCompaniesTable, usersTable, warehousesTable } from "@workspace/db";
import { z } from "zod";
import { getTenantId } from "../middlewares/requireTenant.js";
import { processToShipping, reverseShipping, processReturn, syncShipmentItemsInventory } from "../lib/inventory.js";

const router: IRouter = Router();

// ─── Public router (no auth) ──────────────────────────────────────────────────
export const publicShipmentsRouter: IRouter = Router();

publicShipmentsRouter.get("/shipments/track/:number", async (req, res): Promise<void> => {
  try {
    const { number } = req.params;
    const rows = await db
      .select({
        shipment:        shipmentsTable,
        warehouseName:   warehousesTable.name,
        warehouseCity:   warehousesTable.city,
        courierName:     shippingCompaniesTable.name,
        courierPhone:    shippingCompaniesTable.phone,
      })
      .from(shipmentsTable)
      .leftJoin(warehousesTable,        eq(shipmentsTable.warehouseId,        warehousesTable.id))
      .leftJoin(shippingCompaniesTable, eq(shipmentsTable.shippingCompanyId,  shippingCompaniesTable.id))
      .where(
        and(
          isNull(shipmentsTable.deletedAt),
          or(
            eq(shipmentsTable.trackingNumber, number),
            eq(shipmentsTable.shipmentNumber,  number),
          )
        )
      )
      .limit(1);

    if (!rows.length) {
      res.status(404).json({ error: "لم يتم العثور على الشحنة" });
      return;
    }
    const { shipment, warehouseName, warehouseCity, courierName, courierPhone } = rows[0];
    res.json({ ...shipment, warehouseName, warehouseCity, courierName, courierPhone });
  } catch (e) {
    console.error("[GET /shipments/track]", e);
    res.status(500).json({ error: "خطأ في البحث عن الشحنة" });
  }
});

// ─── Public: البحث بالاسم التجاري + رقم الفون ────────────────────────────────
publicShipmentsRouter.get("/shipments/track-by-client", async (req, res): Promise<void> => {
  try {
    const name  = (req.query.name  as string | undefined)?.trim();
    const phone = (req.query.phone as string | undefined)?.trim();

    if (!name || !phone) {
      res.status(400).json({ error: "يرجى إدخال اسم العميل ورقم الهاتف" });
      return;
    }

    // اسم الراسل (senderName) + رقم المستلم (receiverPhone) — مطابقة تامة
    const conditions = [
      isNull(shipmentsTable.deletedAt),
      eq(shipmentsTable.senderName, name),
      or(
        eq(shipmentsTable.receiverPhone,  phone),
        eq(shipmentsTable.receiverPhone2, phone),
      ) as any,
    ];

    const rows = await db
      .select()
      .from(shipmentsTable)
      .where(and(...conditions))
      .orderBy(desc(shipmentsTable.id))
      .limit(20);

    if (!rows.length) {
      res.status(404).json({ error: "لم يتم العثور على شحنات لهذا العميل" });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json(rows);
  } catch (e) {
    console.error("[GET /shipments/track-by-client]", e);
    res.status(500).json({ error: "خطأ في البحث" });
  }
});

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
  costPrice:       z.coerce.number().default(0),
  shippingFee:     z.coerce.number().default(0),
  insuranceFee:    z.coerce.number().default(0),
  totalAmount:     z.coerce.number().default(0),
  shippingCompanyId: z.number().int().positive().nullish(),
  notes:           z.string().nullish(),
  internalNotes:   z.string().nullish(),
  returnReason:    z.string().nullish(),
  returnReceived:  z.union([z.boolean(), z.literal(0), z.literal(1)]).nullish(),
  returnNote:      z.string().nullish(),
  partialQuantity: z.coerce.number().int().nullish(),
  productId:       z.number().int().positive().nullish(),
  variantId:       z.number().int().positive().nullish(),
  warehouseId:     z.number().int().positive().nullish(),
  status:          z.string().default("waiting"),
  items: z.array(z.object({
    productId:   z.number().int().positive().nullish(),
    variantId:   z.number().int().positive().nullish(),
    warehouseId: z.number().int().positive().nullish(),
    product:     z.string().nullish(),
    color:       z.string().nullish(),
    size:        z.string().nullish(),
    quantity:    z.coerce.number().int().min(1).default(1),
    unitPrice:   z.coerce.number().min(0).default(0),
    costPrice:   z.coerce.number().min(0).default(0),
  })).nullish(),
});

const UpdateShipmentSchema = CreateShipmentSchema.partial().extend({
  status: z.string().nullish(),
  trackingNumber: z.string().nullish(),
  collectedAmount: z.coerce.number().nullish(),
  itemReceivedQuantities: z.record(z.string(), z.coerce.number().int().min(0)).nullish(),
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

// ─── ربط الشحنة بالمخزون: خصم/إرجاع تلقائي حسب الحالة ────────────────────────
export type ShipmentRow = typeof shipmentsTable.$inferSelect;

export async function syncShipmentInventory(
  before: ShipmentRow,
  afterPatch: Record<string, any>,
): Promise<void> {
  // الشحنة الناتجة بعد التحديث (لمعرفة الحالة/الكمية النهائية)
  const after: ShipmentRow = { ...before, ...afterPatch };

  const hasInventoryLink = !!(after.productId || after.variantId);
  if (!hasInventoryLink) return; // الشحنة غير مرتبطة بمنتج → لا شيء يخص المخزون

  const totalPieces = Number(after.pieces ?? 1);
  const orderShape = {
    productId:   after.productId ?? null,
    variantId:   after.variantId ?? null,
    product:     after.description ?? null,
    color:       null,
    size:        null,
    warehouseId: after.warehouseId ?? null,
  };

  // 1) أول مرة يتربط المنتج بالشحنة (أو لسه متخصوم) و الحالة لسه مش مرتجعة بالكامل
  //    → اخصم كمية القطع من المخزن (مرة واحدة فقط)
  const wasDeducted = !!before.inventoryDeducted;
  if (!wasDeducted) {
    await processToShipping(orderShape, totalPieces, null, before.id);
    afterPatch.inventoryDeducted = 1;
  }

  // 2) تحول لحالة "مرتجع" → رجّع كل القطع للمخزن — فقط لما يتم تأكيد "تم الاستلام" فعليًا (returnReceived === 1)
  //    لأن المرتجع لسه عند شركة الشحن لحد ما يتأكد استلامه
  const newStatus = afterPatch.status as string | undefined;
  const wasReturned = !!before.inventoryReturned;

  if (newStatus === "returned") {
    const wasReturnReceived = before.returnReceived === 1;
    const isReturnReceivedNow = afterPatch.returnReceived === 1;
    if (isReturnReceivedNow && !wasReturnReceived && !wasReturned) {
      await reverseShipping(orderShape, totalPieces, null, before.id);
      afterPatch.inventoryReturned = 1;
    }
  }

  // 3) استلام جزئي → الباقي (الفرق بين القطع الكلية والمستلمة) يرجع للمخزن
  //    فقط لما يتم تأكيد "تم الاستلام" فعليًا (returnReceived === 1)، مش بمجرد تسجيل partial_received
  //    لأن الكمية الباقية لسه عند شركة الشحن لحد ما يتأكد استلامها
  if (newStatus === "partial_received") {
    const wasReturnReceived = before.returnReceived === 1;
    const isReturnReceivedNow = afterPatch.returnReceived === 1;
    if (isReturnReceivedNow && !wasReturnReceived) {
      const receivedQty = Number(afterPatch.partialQuantity ?? after.partialQuantity ?? 0);
      const remaining = totalPieces - receivedQty;
      if (remaining > 0 && !wasReturned) {
        await reverseShipping(orderShape, remaining, null, before.id);
        afterPatch.inventoryReturned = 1; // يمنع تكرار الإرجاع لو الحالة اتعدلت تاني لنفس partial
      }
    }
  }
}

// ─── GET /shipments/track/:number (public — no auth) ──────────────────────────
router.get("/shipments/track/:number", async (req, res): Promise<void> => {
  try {
    const { number } = req.params;
    const rows = await db
      .select()
      .from(shipmentsTable)
      .where(
        and(
          isNull(shipmentsTable.deletedAt),
          or(
            eq(shipmentsTable.trackingNumber, number),
            eq(shipmentsTable.shipmentNumber,  number),
          )
        )
      )
      .limit(1);

    if (!rows.length) {
      res.status(404).json({ error: "لم يتم العثور على الشحنة" });
      return;
    }
    res.json(rows[0]);
  } catch (e) {
    console.error("[GET /shipments/track]", e);
    res.status(500).json({ error: "خطأ في البحث عن الشحنة" });
  }
});

// ─── GET /shipments ───────────────────────────────────────────────────────────
router.get("/shipments", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { status, search, limit = "50", offset = "0", shippingCompanyId } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (tenantId !== null) conditions.push(eq(shipmentsTable.tenantId, tenantId));
    conditions.push(isNull(shipmentsTable.deletedAt));
    // map legacy statuses to new ones
    const STATUS_ALIASES: Record<string, string[]> = {
      warehouse_ready: ["warehouse_ready", "picked_up"],
      in_shipping:     ["in_shipping", "in_transit", "out_for_delivery"],
      received:        ["received", "delivered"],
      pending:         ["pending", "waiting", "confirmed"],
      returned:        ["returned", "cancelled"],
    };
    if (status && status !== "all") {
      const aliases = STATUS_ALIASES[status];
      if (aliases && aliases.length > 1) {
        conditions.push(inArray(shipmentsTable.status, aliases));
      } else {
        conditions.push(eq(shipmentsTable.status, status));
      }
    }
    if (shippingCompanyId) {
      conditions.push(eq(shipmentsTable.shippingCompanyId, parseInt(shippingCompanyId)));
    }
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
      db
        .select({
          // ── كل حقول الشحنة ──
          id:               shipmentsTable.id,
          tenantId:         shipmentsTable.tenantId,
          shipmentNumber:   shipmentsTable.shipmentNumber,
          trackingNumber:   shipmentsTable.trackingNumber,
          clientId:         shipmentsTable.clientId,
          senderName:       shipmentsTable.senderName,
          senderPhone:      shipmentsTable.senderPhone,
          senderPhone2:     shipmentsTable.senderPhone2,
          senderCity:       shipmentsTable.senderCity,
          receiverName:     shipmentsTable.receiverName,
          receiverPhone:    shipmentsTable.receiverPhone,
          receiverPhone2:   shipmentsTable.receiverPhone2,
          receiverAddress:  shipmentsTable.receiverAddress,
          receiverCity:     shipmentsTable.receiverCity,
          zoneId:           shipmentsTable.zoneId,
          zonePrice:        shipmentsTable.zonePrice,
          parcelType:       shipmentsTable.parcelType,
          parcelTypePrice:  shipmentsTable.parcelTypePrice,
          weight:           shipmentsTable.weight,
          pieces:           shipmentsTable.pieces,
          description:      shipmentsTable.description,
          declaredValue:    shipmentsTable.declaredValue,
          paymentMethod:    shipmentsTable.paymentMethod,
          codAmount:        shipmentsTable.codAmount,
          costPrice:        shipmentsTable.costPrice,
          shippingFee:      shipmentsTable.shippingFee,
          insuranceFee:     shipmentsTable.insuranceFee,
          totalAmount:      shipmentsTable.totalAmount,
          collectedAmount:  shipmentsTable.collectedAmount,
          status:           shipmentsTable.status,
          shippingCompanyId: shipmentsTable.shippingCompanyId,
          assignedUserId:   shipmentsTable.assignedUserId,
          createdByUserId:  shipmentsTable.createdByUserId,
          createdByName:    shipmentsTable.createdByName,
          notes:            shipmentsTable.notes,
          internalNotes:    shipmentsTable.internalNotes,
          returnReason:     shipmentsTable.returnReason,
          returnReceived:   shipmentsTable.returnReceived,
          returnNote:       shipmentsTable.returnNote,
          partialQuantity:  shipmentsTable.partialQuantity,
          productId:        shipmentsTable.productId,
          variantId:        shipmentsTable.variantId,
          warehouseId:      shipmentsTable.warehouseId,
          inventoryDeducted: shipmentsTable.inventoryDeducted,
          inventoryReturned: shipmentsTable.inventoryReturned,
          estimatedDelivery: shipmentsTable.estimatedDelivery,
          actualDelivery:   shipmentsTable.actualDelivery,
          createdAt:        shipmentsTable.createdAt,
          updatedAt:        shipmentsTable.updatedAt,
          // ── JOIN: اسم شركة الشحن ──
          shippingCompanyName: shippingCompaniesTable.name,
          // ── JOIN: اسم المندوب ──
          assignedUserName: usersTable.displayName,
          // ── JOIN: المنطقة ──
          zoneLabel:       shipmentZonesTable.name,
          zoneGovernorate: shipmentZonesTable.governorate,
        })
        .from(shipmentsTable)
        .leftJoin(shippingCompaniesTable, eq(shipmentsTable.shippingCompanyId, shippingCompaniesTable.id))
        .leftJoin(usersTable, eq(shipmentsTable.assignedUserId, usersTable.id))
        .leftJoin(shipmentZonesTable, eq(shipmentsTable.zoneId, shipmentZonesTable.id))
        .where(where)
        .orderBy(desc(shipmentsTable.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset)),
      db.select({ count: sql<number>`count(*)` }).from(shipmentsTable).where(where),
    ]);

    // normalize: لو receiverCity فاضية خد من zoneGovernorate
    const normalized = rows.map(r => {
      const city = (r as any).receiverCity || (r as any).receiver_city || r.zoneGovernorate || (r as any).zone_governorate || null;
      return {
        ...r,
        receiverCity: city,
        zoneGovernorate: r.zoneGovernorate || (r as any).zone_governorate || null,
      };
    });

    res.json({ data: normalized, total: Number(countRows[0]?.count ?? 0) });
  } catch (e) {
    console.error("[GET /shipments]", e);
    res.status(500).json({ error: "خطأ في استرجاع الشحنات" });
  }
});

// ─── GET /shipments/zones (alias for /shipment-zones) ───────────────────────
router.get("/shipments/zones", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cond = tenantId !== null ? eq(shipmentZonesTable.tenantId, tenantId) : undefined;
    const rows = await db.select().from(shipmentZonesTable).where(cond).orderBy(shipmentZonesTable.name);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "خطأ في استرجاع المناطق" }); }
});

// ─── GET /shipments/parcel-pricing (alias for /parcel-type-pricing) ──────────
router.get("/shipments/parcel-pricing", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cond = tenantId !== null
      ? or(eq(parcelTypePricingTable.tenantId, tenantId), isNull(parcelTypePricingTable.tenantId))
      : undefined;
    const rows = await db.select().from(parcelTypePricingTable).where(cond).orderBy(parcelTypePricingTable.parcelType);
    const seen = new Set<string>();
    const result = rows.filter(r => {
      if (r.tenantId !== null && r.tenantId !== undefined) { seen.add(r.parcelType); return true; }
      return !seen.has(r.parcelType);
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: "خطأ في استرجاع أسعار الطرود" }); }
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
    const rows = await db
      .select({
        ...shipmentsTable,
        assignedUserName: usersTable.displayName,
        zoneLabel: shipmentZonesTable.name,
        zoneGovernorate: shipmentZonesTable.governorate,
      })
      .from(shipmentsTable)
      .leftJoin(usersTable, eq(shipmentsTable.assignedUserId, usersTable.id))
      .leftJoin(shipmentZonesTable, eq(shipmentsTable.zoneId, shipmentZonesTable.id))
      .where(cond).limit(1);
    if (!rows.length) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }
    const row = rows[0];
    // إذا receiverCity فاضية، خد من المحافظة الخاصة بالمنطقة
    if (!row.receiverCity && row.zoneGovernorate) {
      (row as any).receiverCity = row.zoneGovernorate;
    }
    res.json(row);
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

    // لو receiverCity فاضي وعنده zoneId، خد governorate من الـ zone
    let resolvedReceiverCity = d.receiverCity ?? undefined;
    if (!resolvedReceiverCity && d.zoneId) {
      const zone = await db.select({ governorate: shipmentZonesTable.governorate })
        .from(shipmentZonesTable)
        .where(eq(shipmentZonesTable.id, d.zoneId))
        .limit(1);
      resolvedReceiverCity = zone[0]?.governorate ?? undefined;
    }

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
      receiverCity:    resolvedReceiverCity,
      zoneId:          d.zoneId      ?? undefined,
      zonePrice:       String(d.zonePrice),
      parcelType:      d.parcelType  ?? undefined,
      parcelTypePrice: String(d.parcelTypePrice),
      weight:          d.weight      ? String(d.weight) : undefined,
      pieces:          d.pieces,
      description:     d.description ?? undefined,
      productId:       d.productId   ?? undefined,
      variantId:       d.variantId   ?? undefined,
      warehouseId:     d.warehouseId ?? undefined,
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
    let newShipment = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, insertId)).limit(1);

    // لو فيه منتجات متعددة (items) → أضفهم لجدول shipment_items
    if (d.items && d.items.length > 0) {
      await db.insert(shipmentItemsTable).values(
        d.items.map((it) => ({
          shipmentId:  insertId,
          tenantId:    tenantId ?? null,
          productId:   it.productId ?? null,
          variantId:   it.variantId ?? null,
          warehouseId: it.warehouseId ?? d.warehouseId ?? null,
          product:     it.product ?? null,
          color:       it.color ?? null,
          size:        it.size ?? null,
          quantity:    it.quantity,
          unitPrice:   String(it.unitPrice),
          costPrice:   String(it.costPrice),
          totalPrice:  String(it.quantity * it.unitPrice),
          createdAt:   now,
          updatedAt:   now,
        }))
      );
    }

    // لو الشحنة اتعملت مرتبطة بمنتج من البداية (single product أو items) → اخصم من المخزون فوراً
    if (newShipment[0]) {
      const invPatch: any = {};
      await syncShipmentInventory(newShipment[0], invPatch);
      if (Object.keys(invPatch).length) {
        await db.update(shipmentsTable).set(invPatch).where(eq(shipmentsTable.id, insertId));
      }
      // خصم بنود المنتجات المتعددة (items)
      await syncShipmentItemsInventory(insertId, newShipment[0].status);
      newShipment = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, insertId)).limit(1);
    }

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

    const [existingShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!existingShipment) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

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
    if (d.zoneId           !== undefined) {
      updateData.zoneId = d.zoneId;
      // لو مفيش receiverCity جديد، خد governorate من الـ zone
      if (d.receiverCity === undefined && d.zoneId) {
        const zone = await db.select({ governorate: shipmentZonesTable.governorate })
          .from(shipmentZonesTable).where(eq(shipmentZonesTable.id, d.zoneId)).limit(1);
        if (zone[0]?.governorate) updateData.receiverCity = zone[0].governorate;
      }
    }
    if (d.zonePrice        !== undefined) updateData.zonePrice        = String(d.zonePrice);
    if (d.parcelType       !== undefined) updateData.parcelType       = d.parcelType;
    if (d.parcelTypePrice  !== undefined) updateData.parcelTypePrice  = String(d.parcelTypePrice);
    if (d.weight           !== undefined) updateData.weight           = d.weight ? String(d.weight) : null;
    if (d.pieces           !== undefined) updateData.pieces           = d.pieces;
    if (d.description      !== undefined) updateData.description      = d.description;
    if (d.productId        !== undefined) updateData.productId        = d.productId;
    if (d.variantId        !== undefined) updateData.variantId        = d.variantId;
    if (d.warehouseId      !== undefined) updateData.warehouseId      = d.warehouseId;
    if (d.paymentMethod    !== undefined) updateData.paymentMethod    = d.paymentMethod;
    if (d.codAmount        !== undefined) updateData.codAmount        = String(d.codAmount);
    if (d.costPrice        !== undefined) updateData.costPrice        = String(d.costPrice);
    if (d.shippingFee      !== undefined) updateData.shippingFee      = String(d.shippingFee);
    if (d.insuranceFee     !== undefined) updateData.insuranceFee     = String(d.insuranceFee);
    if (d.totalAmount      !== undefined) updateData.totalAmount      = String(d.totalAmount);
    if (d.notes            !== undefined) updateData.notes            = d.notes;
    if (d.internalNotes    !== undefined) updateData.internalNotes    = d.internalNotes;
    if (d.returnReason     !== undefined) updateData.returnReason     = d.returnReason;
    if (d.returnReceived   !== undefined) updateData.returnReceived   = d.returnReceived === true || d.returnReceived === 1 ? 1 : (d.returnReceived === false || d.returnReceived === 0 ? 0 : null);
    if (d.returnNote       !== undefined) updateData.returnNote       = d.returnNote;
    if (d.partialQuantity  !== undefined) updateData.partialQuantity  = d.partialQuantity;
    if (d.shippingCompanyId !== undefined) updateData.shippingCompanyId = d.shippingCompanyId;

    // ربط المخزون: خصم/إرجاع تلقائي حسب التغييرات (منتج جديد / مرتجع / استلام جزئي)
    await syncShipmentInventory(existingShipment, updateData);
    // ربط مخزون بنود الشحنة المتعددة (items) — لو الحالة اتغيرت لمرتجع/استلام جزئي
    await syncShipmentItemsInventory(
      id,
      updateData.status ?? existingShipment.status,
      d.itemReceivedQuantities ?? undefined,
      updateData.returnReceived === 1,
    );

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

// ─── PATCH /shipments/:id — alias for PUT (partial update) ───────────────────
router.patch("/shipments/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const parsed = UpdateShipmentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existingShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!existingShipment) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

    const d = parsed.data;
    const updateData: any = { updatedAt: new Date() };
    if (d.status            !== undefined) updateData.status            = d.status;
    if (d.trackingNumber    !== undefined) updateData.trackingNumber    = d.trackingNumber;
    if (d.collectedAmount   !== undefined) updateData.collectedAmount   = String(d.collectedAmount);
    if (d.senderName        !== undefined) updateData.senderName        = d.senderName;
    if (d.senderPhone       !== undefined) updateData.senderPhone       = d.senderPhone;
    if (d.receiverName      !== undefined) updateData.receiverName      = d.receiverName;
    if (d.receiverPhone     !== undefined) updateData.receiverPhone     = d.receiverPhone;
    if (d.receiverAddress   !== undefined) updateData.receiverAddress   = d.receiverAddress;
    if (d.receiverCity      !== undefined) updateData.receiverCity      = d.receiverCity;
    if (d.zoneId            !== undefined) updateData.zoneId            = d.zoneId;
    if (d.zonePrice         !== undefined) updateData.zonePrice         = String(d.zonePrice);
    if (d.parcelType        !== undefined) updateData.parcelType        = d.parcelType;
    if (d.parcelTypePrice   !== undefined) updateData.parcelTypePrice   = String(d.parcelTypePrice);
    if (d.weight            !== undefined) updateData.weight            = d.weight ? String(d.weight) : null;
    if (d.pieces            !== undefined) updateData.pieces            = d.pieces;
    if (d.description       !== undefined) updateData.description       = d.description;
    if (d.productId         !== undefined) updateData.productId         = d.productId;
    if (d.variantId         !== undefined) updateData.variantId         = d.variantId;
    if (d.warehouseId       !== undefined) updateData.warehouseId       = d.warehouseId;
    if (d.paymentMethod     !== undefined) updateData.paymentMethod     = d.paymentMethod;
    if (d.codAmount         !== undefined) updateData.codAmount         = String(d.codAmount);
    if (d.costPrice         !== undefined) updateData.costPrice         = String(d.costPrice);
    if (d.shippingFee       !== undefined) updateData.shippingFee       = String(d.shippingFee);
    if (d.insuranceFee      !== undefined) updateData.insuranceFee      = String(d.insuranceFee);
    if (d.totalAmount       !== undefined) updateData.totalAmount       = String(d.totalAmount);
    if (d.notes             !== undefined) updateData.notes             = d.notes;
    if (d.internalNotes     !== undefined) updateData.internalNotes     = d.internalNotes;
    if (d.returnReason      !== undefined) updateData.returnReason      = d.returnReason;
    if (d.returnReceived    !== undefined) updateData.returnReceived    = d.returnReceived === true || d.returnReceived === 1 ? 1 : (d.returnReceived === false || d.returnReceived === 0 ? 0 : null);
    if (d.returnNote        !== undefined) updateData.returnNote        = d.returnNote;
    if (d.partialQuantity   !== undefined) updateData.partialQuantity   = d.partialQuantity;
    if (d.shippingCompanyId !== undefined) updateData.shippingCompanyId = d.shippingCompanyId;

    // لو الحالة الجديدة مش returned ولا partial_received ولم يُرسَل returnReceived صريحًا
    // → نصفّره عشان ميفضلش متعلق بقيمة قديمة من حالة سابقة
    const effectiveStatus = updateData.status ?? existingShipment.status;
    if (d.returnReceived === undefined && effectiveStatus !== "returned" && effectiveStatus !== "partial_received") {
      updateData.returnReceived = null;
    }

    // ربط المخزون: خصم/إرجاع تلقائي حسب التغييرات (منتج جديد / مرتجع / استلام جزئي)
    await syncShipmentInventory(existingShipment, updateData);
    // ربط مخزون بنود الشحنة المتعددة (items) — لو الحالة اتغيرت لمرتجع/استلام جزئي
    await syncShipmentItemsInventory(
      id,
      updateData.status ?? existingShipment.status,
      d.itemReceivedQuantities ?? undefined,
      updateData.returnReceived === 1,
    );

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);
    await db.update(shipmentsTable).set(updateData).where(cond);
    const updated = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    res.json(updated[0]);
  } catch (e) {
    console.error("[PATCH /shipments/:id]", e);
    res.status(500).json({ error: "خطأ في تحديث الشحنة" });
  }
});

// ─── DELETE /shipments/bulk — حذف شحنات متعددة (MUST be before /:id) ──────────
router.delete("/shipments/bulk", async (req, res): Promise<void> => {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids مطلوبة" });
      return;
    }
    const now = new Date();

    const existing = await db
      .select()
      .from(shipmentsTable)
      .where(and(inArray(shipmentsTable.id, ids), isNull(shipmentsTable.deletedAt)));

    let deleted = 0;
    let skipped = 0;

    for (const sh of existing) {
      if (sh.status === "received") {
        skipped++;
        continue;
      }
      if (sh.inventoryDeducted && !sh.inventoryReturned) {
        try {
          await reverseShipping(
            { productId: null, variantId: null, product: "", color: null, size: null, warehouseId: null },
            0, null, sh.id
          );
        } catch (_) {}
      }
      await db.update(shipmentsTable)
        .set({ deletedAt: now } as any)
        .where(eq(shipmentsTable.id, sh.id));
      deleted++;
    }

    res.json({ deleted, skipped });
  } catch (e: any) {
    res.status(500).json({ error: "خطأ في الحذف الجماعي" });
  }
});

// ─── PATCH /shipments/bulk-status — تغيير حالة شحنات متعددة (MUST be before /:id) ──
router.patch("/shipments/bulk-status", async (req, res): Promise<void> => {
  try {
    const { ids, status } = req.body as { ids: number[]; status: string };
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      res.status(400).json({ error: "ids و status مطلوبة" });
      return;
    }
    const now = new Date();

    await db.update(shipmentsTable)
      .set({ status: status as any, updatedAt: now } as any)
      .where(inArray(shipmentsTable.id, ids));

    res.json({ updated: ids.length });
  } catch (e: any) {
    res.status(500).json({ error: "خطأ في تحديث الحالة" });
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
    const { name, governorate, price, priceNormal, priceCommercial, priceVip, isActive = true } = req.body;
    if (!name) { res.status(400).json({ error: "اسم المنطقة مطلوب" }); return; }
    const normalPrice = priceNormal ?? price ?? 0;
    const result = await db.insert(shipmentZonesTable).values({
      ...(tenantId !== null ? { tenantId } : {}),
      name, governorate: governorate ?? null,
      price:           String(normalPrice),
      priceNormal:     String(normalPrice),
      priceCommercial: String(priceCommercial ?? 0),
      priceVip:        String(priceVip        ?? 0),
      isActive,
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
    const { name, governorate, price, priceNormal, priceCommercial, priceVip, isActive } = req.body;
    const upd: any = { updatedAt: new Date() };
    if (name            !== undefined) upd.name            = name;
    if (governorate     !== undefined) upd.governorate     = governorate;
    if (priceNormal     !== undefined) { upd.priceNormal   = String(priceNormal);     upd.price = String(priceNormal); }
    else if (price      !== undefined) { upd.price         = String(price);           upd.priceNormal = String(price); }
    if (priceCommercial !== undefined) upd.priceCommercial = String(priceCommercial);
    if (priceVip        !== undefined) upd.priceVip        = String(priceVip);
    if (isActive        !== undefined) upd.isActive        = isActive;
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
    // يرجع أسعار الـ tenant الحالي أو الأسعار الـ global (tenantId = null) — أيهما موجود
    const cond = tenantId !== null
      ? or(eq(parcelTypePricingTable.tenantId, tenantId), isNull(parcelTypePricingTable.tenantId))
      : undefined;
    const rows = await db.select().from(parcelTypePricingTable).where(cond).orderBy(parcelTypePricingTable.parcelType);
    // لو في أسعار خاصة بالـ tenant، تطغى على الـ global
    const seen = new Set<string>();
    const result = rows.filter(r => {
      if (r.tenantId !== null && r.tenantId !== undefined) { seen.add(r.parcelType); return true; }
      return !seen.has(r.parcelType);
    });
    res.json(result);
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

router.post("/parcel-type-pricing", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { parcelType, label, basePrice, isActive = true } = req.body;
    if (!parcelType || basePrice === undefined) { res.status(400).json({ error: "parcelType والسعر مطلوبان" }); return; }
    const now = new Date();
    const result = await db.insert(parcelTypePricingTable).values({
      ...(tenantId !== null ? { tenantId } : {}),
      parcelType, label: label ?? parcelType,
      basePrice: String(basePrice), isActive,
      createdAt: now, updatedAt: now,
    });
    const id = (result as any)[0]?.insertId ?? (result as any).insertId;
    const rows = await db.select().from(parcelTypePricingTable).where(eq(parcelTypePricingTable.id, id)).limit(1);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: "خطأ في إضافة النوع" }); }
});

router.delete("/parcel-type-pricing/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(parcelTypePricingTable).where(eq(parcelTypePricingTable.id, id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "خطأ في الحذف" }); }
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

// ─── Shipment Items CRUD ─────────────────────────────────────────────────────

const ShipmentItemSchema = z.object({
  productId:   z.number().int().positive().nullish(),
  variantId:   z.number().int().positive().nullish(),
  warehouseId: z.number().int().positive().nullish(),
  product:     z.string().nullish(),
  color:       z.string().nullish(),
  size:        z.string().nullish(),
  quantity:    z.coerce.number().int().min(1).default(1),
  unitPrice:   z.coerce.number().min(0).default(0),
  costPrice:   z.coerce.number().min(0).default(0),
  notes:       z.string().nullish(),
});

// GET /shipments/:id/items
router.get("/shipments/:id/items", async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const tenantId   = getTenantId(req);
    const conditions = [eq(shipmentItemsTable.shipmentId, shipmentId)];
    if (tenantId !== null) conditions.push(eq(shipmentItemsTable.tenantId, tenantId) as any);
    const items = await db
      .select()
      .from(shipmentItemsTable)
      .where(and(...conditions))
      .orderBy(shipmentItemsTable.createdAt);
    res.json(items);
  } catch (e) { console.error("[GET /shipments/:id/items]", e); res.status(500).json({ error: "خطأ في استرجاع بنود الشحنة", detail: String(e) }); }
});

// POST /shipments/:id/items
router.post("/shipments/:id/items", async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const tenantId   = getTenantId(req);
    const body = ShipmentItemSchema.parse(req.body);
    const now = new Date();
    const totalPrice = body.quantity * body.unitPrice;
    const [result] = await db.insert(shipmentItemsTable).values({
      shipmentId,
      tenantId,
      productId:   body.productId ?? null,
      variantId:   body.variantId ?? null,
      warehouseId: body.warehouseId ?? null,
      product:     body.product ?? null,
      color:       body.color ?? null,
      size:        body.size ?? null,
      quantity:    body.quantity,
      unitPrice:   String(body.unitPrice),
      costPrice:   String(body.costPrice),
      totalPrice:  String(totalPrice),
      notes:       body.notes ?? null,
      createdAt:   now,
      updatedAt:   now,
    });
    const newItem = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, (result as any).insertId)).limit(1);

    // اخصم من المخزون فوراً (نفس منطق الشحنة وقت الإنشاء)
    await syncShipmentItemsInventory(shipmentId);
    const refreshed = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, (result as any).insertId)).limit(1);

    res.status(201).json(refreshed[0] ?? newItem[0]);
  } catch (e: any) {
    console.error("[POST /shipments/:id/items]", e);
    if (e?.name === "ZodError") { res.status(400).json({ error: e.errors }); return; }
    res.status(500).json({ error: "خطأ في إضافة البند", detail: e?.message });
  }
});

// PATCH /shipments/:id/items/:itemId
router.patch("/shipments/:id/items/:itemId", async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const itemId   = Number(req.params.itemId);
    const tenantId = getTenantId(req);
    const body = ShipmentItemSchema.partial().parse(req.body);
    const now  = new Date().toISOString().slice(0, 19).replace("T", " ");

    const [existingItem] = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, itemId)).limit(1);

    const updateData: any = { ...body, updatedAt: now };
    if (body.quantity !== undefined && body.unitPrice !== undefined) {
      updateData.totalPrice = String(body.quantity * body.unitPrice);
    }

    // لو البند خصم من المخزون قبل كده وفيه تعديل على المنتج/الكمية/المخزن
    // → رجّع الكمية القديمة أولاً، بعدين خصم الجديدة (تتعمل تلقائي تحت)
    const touchesInventoryFields = body.productId !== undefined || body.variantId !== undefined
      || body.warehouseId !== undefined || body.quantity !== undefined;
    if (existingItem?.inventoryDeducted && touchesInventoryFields && !existingItem.inventoryReturned) {
      await reverseShipping(
        {
          productId: existingItem.productId,
          variantId: existingItem.variantId,
          product: existingItem.product,
          color: existingItem.color,
          size: existingItem.size,
          warehouseId: existingItem.warehouseId,
        },
        existingItem.quantity,
        null,
        shipmentId,
      );
      updateData.inventoryDeducted = 0;
    }

    await db.update(shipmentItemsTable).set(updateData).where(eq(shipmentItemsTable.id, itemId));

    // اخصم تاني حسب البيانات الجديدة لو لسه مخصومة
    await syncShipmentItemsInventory(shipmentId);

    const updated = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, itemId)).limit(1);
    res.json(updated[0]);
  } catch (e: any) {
    if (e?.name === "ZodError") { res.status(400).json({ error: e.errors }); return; }
    res.status(500).json({ error: "خطأ في تحديث البند" });
  }
});

// DELETE /shipments/:id/items/:itemId
router.delete("/shipments/:id/items/:itemId", async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    const [existingItem] = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, itemId)).limit(1);
    if (existingItem?.inventoryDeducted && !existingItem.inventoryReturned) {
      await reverseShipping(
        {
          productId: existingItem.productId,
          variantId: existingItem.variantId,
          product: existingItem.product,
          color: existingItem.color,
          size: existingItem.size,
          warehouseId: existingItem.warehouseId,
        },
        existingItem.quantity,
        null,
        shipmentId,
      );
    }

    await db.delete(shipmentItemsTable).where(eq(shipmentItemsTable.id, itemId));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "خطأ في حذف البند" }); }
});

export default router;
