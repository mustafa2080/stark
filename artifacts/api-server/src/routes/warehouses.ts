import { Router, type IRouter } from "express";
import { eq, and, or, desc, count, isNull, inArray, sql } from "drizzle-orm";
import {
  db,
  warehousesTable,
  warehouseStockTable,
  warehouseTransfersTable,
  productsTable,
  productVariantsTable,
  inventoryMovementsTable,
  ordersTable,
  shipmentsTable,
  shippingCompaniesTable,
} from "@workspace/db";
import { getTenantId } from "../middlewares/requireTenant.js";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { syncProductQuantityFromWarehouses } from "../lib/inventory.js";

// ─── Helper: سجّل حركة تسوية في inventory_movements ─────────────────────────
async function recordAdjustmentMovement(
  variantId: number | null,
  productId: number | null,
  oldQty: number,
  newQty: number,
  warehouseId: number,
): Promise<void> {
  const delta = newQty - oldQty;
  if (delta === 0) return;

  // جيب اسم المنتج/variant
  let productName = "منتج غير محدد";
  let color: string | null = null;
  let size:  string | null = null;

  if (variantId) {
    const [v] = await db
      .select({ color: productVariantsTable.color, size: productVariantsTable.size, name: productsTable.name })
      .from(productVariantsTable)
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .where(eq(productVariantsTable.id, variantId));
    if (v) { productName = v.name; color = v.color; size = v.size; }
  } else if (productId) {
    const [p] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, productId));
    if (p) productName = p.name;
  }

  await db.insert(inventoryMovementsTable).values({
    product:     productName,
    color:       color ?? null,
    size:        size  ?? null,
    quantity:    Math.abs(delta),
    type:        delta > 0 ? "IN" : "OUT",
    reason:      "adjustment",
    productId:   productId  ?? null,
    variantId:   variantId  ?? null,
    warehouseId: warehouseId,
    orderId:     null,
    notes:       `تسوية مخزون: ${oldQty} ← ${newQty}`,
  });
}

const router: IRouter = Router();
router.use(requireAuth);

const WarehouseSchema = z.object({
  name: z.string().min(1),
  address: z.string().nullish(),
  city: z.string().nullish(),
  notes: z.string().nullish(),
  isDefault: z.boolean().optional(),
});

// ─── Get stock breakdown by variant ───────────────────────────────────────────
router.get("/warehouses/stock/by-variant/:variantId", async (req, res): Promise<void> => {
  const variantId = parseInt(req.params.variantId);
  if (isNaN(variantId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const rows = await db
    .select({
      warehouseId: warehouseStockTable.warehouseId,
      warehouseName: warehousesTable.name,
      isDefault: warehousesTable.isDefault,
      quantity: warehouseStockTable.quantity,
    })
    .from(warehouseStockTable)
    .innerJoin(warehousesTable, eq(warehouseStockTable.warehouseId, warehousesTable.id))
    .where(eq(warehouseStockTable.variantId, variantId));

  res.json(rows);
});

// ─── List ──────────────────────────────────────────────────────────────────────
router.get("/warehouses", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const whConditions: any[] = [];
  if (tenantId !== null) whConditions.push(eq(warehousesTable.tenantId, tenantId));

  const warehouses = await db
    .select()
    .from(warehousesTable)
    .where(whConditions.length > 0 ? and(...whConditions) : undefined)
    .orderBy(desc(warehousesTable.isDefault), warehousesTable.name);

  // For each warehouse, get total stock items and order count
  const enriched = await Promise.all(
    warehouses.map(async (w) => {
      // فقط صفوف الـ variants اللي المنتج بتاعها مش مأرشف
      const stockItems = await db
        .select({ quantity: warehouseStockTable.quantity })
        .from(warehouseStockTable)
        .innerJoin(productVariantsTable, eq(warehouseStockTable.variantId, productVariantsTable.id))
        .innerJoin(productsTable, and(
          eq(productVariantsTable.productId, productsTable.id),
          eq(productsTable.isArchived, false),
        ))
        .where(eq(warehouseStockTable.warehouseId, w.id));

      const totalUnits = stockItems.reduce((s, si) => s + si.quantity, 0);
      const skuCount = stockItems.length;

      const [orderCountRow] = await db
        .select({ cnt: count() })
        .from(ordersTable)
        .where(eq(ordersTable.warehouseId, w.id));

      // عدد الشحنات "قيد الشحن بالمخزن" فقط — مفيش عد لحالات قبل ما توصل warehouse_ready
      const [shipmentCountRow] = await db
        .select({ cnt: count() })
        .from(shipmentsTable)
        .where(and(
          eq(shipmentsTable.warehouseId, w.id),
          isNull(shipmentsTable.deletedAt),
          inArray(shipmentsTable.status, ["warehouse_ready"]),
        ));

      return { ...w, totalUnits, skuCount, orderCount: Number(orderCountRow?.cnt ?? 0), shipmentCount: Number(shipmentCountRow?.cnt ?? 0) };
    })
  );

  res.json(enriched);
});

// ─── Create ────────────────────────────────────────────────────────────────────
router.post("/warehouses", async (req, res): Promise<void> => {
  const parsed = WarehouseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.isDefault) {
    await db
      .update(warehousesTable)
      .set({ isDefault: false })
      .where(eq(warehousesTable.isDefault, true));
  }

  const insertResult = await db
    .insert(warehousesTable)
    .values({
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      notes: parsed.data.notes ?? null,
      isDefault: parsed.data.isDefault ?? false,
    });
  const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
  const [w] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, insertId));

  // ── تلقائياً: أضف صف بكمية 0 لكل المنتجات والـ variants الموجودة ──────────
  try {
    const allProducts = await db.select({ id: productsTable.id }).from(productsTable);
    const allVariants = await db.select({ id: productVariantsTable.id }).from(productVariantsTable);
    const now = new Date();
    for (const p of allProducts) {
      await db.insert(warehouseStockTable).values({ warehouseId: w.id, productId: p.id, variantId: null, quantity: 0, updatedAt: now }).catch(() => {});
    }
    for (const v of allVariants) {
      await db.insert(warehouseStockTable).values({ warehouseId: w.id, productId: null, variantId: v.id, quantity: 0, updatedAt: now }).catch(() => {});
    }
  } catch (_) {}

  res.status(201).json(w);
});

// ─── Get single + stock ────────────────────────────────────────────────────────
router.get("/warehouses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [warehouse] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, id));
  if (!warehouse) { res.status(404).json({ error: "المخزن غير موجود" }); return; }

  // Stock items with product/variant details
  // نجيب فقط صفوف الـ variants (variantId IS NOT NULL) — هي المصدر الصح للكميات
  // الصفوف اللي productId فقط (بدون variant) نتجاهلها لأن كل المنتجات عندها variants
  const stockRows = await db
    .select({
      stock: warehouseStockTable,
      product: productsTable,
      variant: productVariantsTable,
    })
    .from(warehouseStockTable)
    .innerJoin(productVariantsTable, eq(warehouseStockTable.variantId, productVariantsTable.id))
    .innerJoin(productsTable, and(
      eq(productVariantsTable.productId, productsTable.id),
      eq(productsTable.isArchived, false),
    ))
    .where(eq(warehouseStockTable.warehouseId, id))
    .orderBy(productsTable.name);

  const stock = stockRows.map((r) => ({
    id: r.stock.id,
    warehouseId: r.stock.warehouseId,
    quantity: r.stock.quantity,
    productId: r.stock.productId,
    variantId: r.stock.variantId,
    productName: r.product?.name ?? null,
    productSku: r.product?.sku ?? null,
    variantColor: r.variant?.color ?? null,
    variantSize: r.variant?.size ?? null,
    unitPrice: r.variant?.unitPrice ?? r.product?.unitPrice ?? null,
    costPrice: r.variant?.costPrice ?? r.product?.costPrice ?? null,
    lowStockThreshold: r.variant?.lowStockThreshold ?? r.product?.lowStockThreshold ?? 5,
    updatedAt: r.stock.updatedAt,
  }));

  res.json({ ...warehouse, stock });
});

// ─── Get warehouse shipments ───────────────────────────────────────────────────
router.get("/warehouses/:id/shipments", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const statusFilter = req.query.status as string | undefined;

  // الشحنة "قيد الشحن بالمخزن" فقط — قبل ما توصل للحالة دي متظهرش في المخزن خالص
  // (مفيش legacy "in_shipping" هنا عمداً — مطلوب warehouse_ready بالظبط)
  const ACTIVE_STATUSES = ["warehouse_ready"];

  // الشحنة لازم تكون أو كانت في warehouse_ready عشان تظهر في صفحة المخزن أصلاً —
  // الحالات اللي قبلها (pending, waiting, confirmed...) متظهرش خالص لحد ما توصل warehouse_ready
  const VISIBLE_IN_WAREHOUSE = [
    "warehouse_ready", "picked_up", "in_transit", "out_for_delivery",
    "delivered", "received", "partial_received", "returned", "cancelled",
  ];

  const conditions: any[] = [
    eq(shipmentsTable.warehouseId, id),
    isNull(shipmentsTable.deletedAt),
    inArray(shipmentsTable.status, VISIBLE_IN_WAREHOUSE),
  ];

  if (statusFilter === "active") {
    conditions.push(inArray(shipmentsTable.status, ACTIVE_STATUSES));
  } else if (statusFilter === "delivered") {
    conditions.push(inArray(shipmentsTable.status, ["delivered", "received", "partial_received"]));
  } else if (statusFilter === "returned") {
    conditions.push(inArray(shipmentsTable.status, ["returned", "cancelled"]));
  }
  // بدون فلتر = كل الشحنات اللي وصلت warehouse_ready على الأقل (مش كل الشحنات المرتبطة بالمخزن)

  const shipments = await db
    .select({
      id:                shipmentsTable.id,
      shipmentNumber:    shipmentsTable.shipmentNumber,
      trackingNumber:    shipmentsTable.trackingNumber,
      senderName:        shipmentsTable.senderName,
      receiverName:      shipmentsTable.receiverName,
      receiverPhone:     shipmentsTable.receiverPhone,
      receiverCity:      shipmentsTable.receiverCity,
      status:            shipmentsTable.status,
      parcelType:        shipmentsTable.parcelType,
      notes:             shipmentsTable.notes,
      codAmount:         shipmentsTable.codAmount,
      shippingFee:       shipmentsTable.shippingFee,
      pieces:            shipmentsTable.pieces,
      createdAt:         shipmentsTable.createdAt,
      deliveredAt:       shipmentsTable.actualDelivery,
      warehouseId:       shipmentsTable.warehouseId,
      returnReceived:    shipmentsTable.returnReceived,
      shippingCompanyId: shipmentsTable.shippingCompanyId,
      courierName:       shippingCompaniesTable.name,
      courierPhone:      shippingCompaniesTable.phone,
    })
    .from(shipmentsTable)
    .leftJoin(shippingCompaniesTable, eq(shipmentsTable.shippingCompanyId, shippingCompaniesTable.id))
    .where(and(...conditions))
    .orderBy(desc(shipmentsTable.createdAt))
    .limit(200);

  // إحصائيات سريعة — بنفس قيد VISIBLE_IN_WAREHOUSE (مفيش عد للشحنات اللي لسه قبل warehouse_ready)
  const allForStats = await db
    .select({ status: shipmentsTable.status })
    .from(shipmentsTable)
    .where(and(
      eq(shipmentsTable.warehouseId, id),
      isNull(shipmentsTable.deletedAt),
      inArray(shipmentsTable.status, VISIBLE_IN_WAREHOUSE),
    ));

  const stats = {
    total:     allForStats.length,
    active:    allForStats.filter(s => ACTIVE_STATUSES.includes(s.status)).length,
    delivered: allForStats.filter(s => ["delivered", "received", "partial_received"].includes(s.status)).length,
    returned:  allForStats.filter(s => ["returned", "cancelled"].includes(s.status)).length,
  };

  res.json({ shipments, stats });
});

// ─── Update ────────────────────────────────────────────────────────────────────
router.patch("/warehouses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const Schema = WarehouseSchema.partial();
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.isDefault) {
    await db.update(warehousesTable).set({ isDefault: false }).where(eq(warehousesTable.isDefault, true));
  }

  await db
    .update(warehousesTable)
    .set(parsed.data)
    .where(eq(warehousesTable.id, id));
  const [updated] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, id));
  if (!updated) { res.status(404).json({ error: "المخزن غير موجود" }); return; }
  res.json(updated);
});

// ─── Delete ────────────────────────────────────────────────────────────────────
router.delete("/warehouses/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [toDelete] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, id));
  if (!toDelete) { res.status(404).json({ error: "المخزن غير موجود" }); return; }
  await db.delete(warehousesTable).where(eq(warehousesTable.id, id));
  res.status(204).send();
});

// ─── Update stock item (تسوية) ────────────────────────────────────────────────
router.patch("/warehouses/:id/stock/:stockId", async (req, res): Promise<void> => {
  const warehouseId = parseInt(req.params.id);
  const stockId = parseInt(req.params.stockId);
  if (isNaN(warehouseId) || isNaN(stockId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const Schema = z.object({ quantity: z.number().int().min(0) });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // جيب الكمية القديمة قبل التحديث
  const [before] = await db.select().from(warehouseStockTable).where(eq(warehouseStockTable.id, stockId));
  if (!before) { res.status(404).json({ error: "عنصر المخزون غير موجود" }); return; }

  const oldQty = before.quantity;
  const newQty = parsed.data.quantity;

  await db
    .update(warehouseStockTable)
    .set({ quantity: newQty, updatedAt: new Date() })
    .where(and(
      eq(warehouseStockTable.id, stockId),
      eq(warehouseStockTable.warehouseId, warehouseId)
    ));

  const [updated] = await db.select().from(warehouseStockTable).where(eq(warehouseStockTable.id, stockId));
  if (!updated) { res.status(404).json({ error: "عنصر المخزون غير موجود" }); return; }

  // ── مزامنة totalQuantity في المنتج/variant ──
  await syncProductQuantityFromWarehouses(updated.variantId ?? null, updated.productId ?? null);

  // ── تسجيل حركة التسوية في inventory_movements ──
  await recordAdjustmentMovement(updated.variantId ?? null, updated.productId ?? null, oldQty, newQty, warehouseId);

  res.json(updated);
});

// ─── Add stock item ────────────────────────────────────────────────────────────
router.post("/warehouses/:id/stock", async (req, res): Promise<void> => {
  const warehouseId = parseInt(req.params.id);
  if (isNaN(warehouseId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const Schema = z.object({
    productId: z.number().int().positive().nullish(),
    variantId: z.number().int().positive().nullish(),
    quantity: z.number().int().min(0),
  }).refine(d => d.productId || d.variantId, { message: "يجب تحديد منتج أو نوع" });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Upsert
  const [existing] = await db
    .select()
    .from(warehouseStockTable)
    .where(
      and(
        eq(warehouseStockTable.warehouseId, warehouseId),
        parsed.data.variantId
          ? eq(warehouseStockTable.variantId, parsed.data.variantId)
          : eq(warehouseStockTable.productId, parsed.data.productId!)
      )
    );

  if (existing) {
    const oldQty = existing.quantity;
    const newQty = parsed.data.quantity;
    await db
      .update(warehouseStockTable)
      .set({ quantity: newQty, updatedAt: new Date() })
      .where(eq(warehouseStockTable.id, existing.id));
    const [updated] = await db.select().from(warehouseStockTable).where(eq(warehouseStockTable.id, existing.id));

    await syncProductQuantityFromWarehouses(parsed.data.variantId ?? null, parsed.data.productId ?? null);
    await recordAdjustmentMovement(parsed.data.variantId ?? null, parsed.data.productId ?? null, oldQty, newQty, warehouseId);

    res.json(updated);
  } else {
    const insertResult = await db
      .insert(warehouseStockTable)
      .values({
        warehouseId,
        productId: parsed.data.productId ?? null,
        variantId: parsed.data.variantId ?? null,
        quantity: parsed.data.quantity,
      });
    const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
    const [created] = await db.select().from(warehouseStockTable).where(eq(warehouseStockTable.id, insertId));

    await syncProductQuantityFromWarehouses(parsed.data.variantId ?? null, parsed.data.productId ?? null);
    // إضافة stock جديد من صفر → سجّل حركة إضافة
    await recordAdjustmentMovement(parsed.data.variantId ?? null, parsed.data.productId ?? null, 0, parsed.data.quantity, warehouseId);

    res.status(201).json(created);
  }
});

// ─── Sync: تزامن كل المنتجات في كل المخازن (صف بكمية 0 للمفقود) ─────────────
router.post("/warehouses/sync-stock-matrix", async (req, res): Promise<void> => {
  const allWarehouses = await db.select({ id: warehousesTable.id, name: warehousesTable.name }).from(warehousesTable);
  const allProducts   = await db.select({ id: productsTable.id }).from(productsTable);
  const allVariants   = await db.select({ id: productVariantsTable.id }).from(productVariantsTable);

  let inserted = 0;
  const now = new Date();

  for (const wh of allWarehouses) {
    for (const p of allProducts) {
      const result = await db.insert(warehouseStockTable).values({ warehouseId: wh.id, productId: p.id, variantId: null, quantity: 0, updatedAt: now }).catch(() => null);
      if (result) inserted++;
    }
    for (const v of allVariants) {
      const result = await db.insert(warehouseStockTable).values({ warehouseId: wh.id, productId: null, variantId: v.id, quantity: 0, updatedAt: now }).catch(() => null);
      if (result) inserted++;
    }
  }

  res.json({ success: true, message: `تمت المزامنة: ${inserted} صف جديد أُضيف`, warehouses: allWarehouses.length, products: allProducts.length, variants: allVariants.length });
});

// ─── Repair: إصلاح الـ warehouse_stock اللي مجموعه 0 بينما variant عنده كمية ──
router.post("/warehouses/repair-stock", async (req, res): Promise<void> => {
  // 1. جيب المخزن الافتراضي
  const [defaultWh] = await db
    .select()
    .from(warehousesTable)
    .orderBy(desc(warehousesTable.isDefault))
    .limit(1);

  if (!defaultWh) {
    res.status(400).json({ error: "لا يوجد مخزن — أضف مخزناً أولاً" });
    return;
  }

  // 2. جيب كل variants اللي عندها totalQuantity > 0
  const variants = await db
    .select({
      id: productVariantsTable.id,
      productId: productVariantsTable.productId,
      totalQuantity: productVariantsTable.totalQuantity,
      color: productVariantsTable.color,
      size: productVariantsTable.size,
    })
    .from(productVariantsTable)
    .innerJoin(productsTable, and(
      eq(productVariantsTable.productId, productsTable.id),
      eq(productsTable.isArchived, false),
    ))
    .where(eq(productVariantsTable.totalQuantity, 0));

  // جيب كل variants بكمية > 0 بغض النظر عن warehouse_stock
  const allVariants = await db
    .select({
      id: productVariantsTable.id,
      productId: productVariantsTable.productId,
      totalQuantity: productVariantsTable.totalQuantity,
    })
    .from(productVariantsTable)
    .innerJoin(productsTable, and(
      eq(productVariantsTable.productId, productsTable.id),
      eq(productsTable.isArchived, false),
    ));

  let fixed = 0;
  const now = new Date();

  for (const v of allVariants) {
    if (v.totalQuantity <= 0) continue;

    // جيب مجموع warehouse_stock لهذا variant
    const stockRows = await db
      .select({ quantity: warehouseStockTable.quantity })
      .from(warehouseStockTable)
      .where(eq(warehouseStockTable.variantId, v.id));

    const whTotal = stockRows.reduce((s, r) => s + r.quantity, 0);

    if (whTotal === 0) {
      // warehouse_stock = 0 لكن totalQuantity > 0 → نصلح
      // ابحث عن صف موجود في المخزن الافتراضي
      const [existingRow] = await db
        .select()
        .from(warehouseStockTable)
        .where(and(
          eq(warehouseStockTable.variantId, v.id),
          eq(warehouseStockTable.warehouseId, defaultWh.id),
        ));

      if (existingRow) {
        await db
          .update(warehouseStockTable)
          .set({ quantity: v.totalQuantity, updatedAt: now })
          .where(eq(warehouseStockTable.id, existingRow.id));
      } else {
        await db.insert(warehouseStockTable).values({
          warehouseId: defaultWh.id,
          variantId: v.id,
          productId: null,
          quantity: v.totalQuantity,
          updatedAt: now,
        }).catch(() => {});
      }
      fixed++;
    }
  }

  // 3. بعد الإصلاح — زامن totalQuantity من warehouse_stock
  for (const v of allVariants) {
    await syncProductQuantityFromWarehouses(v.id, null);
  }

  res.json({
    success: true,
    message: `تم إصلاح ${fixed} SKU — تم نقل الكميات للمخزن: ${defaultWh.name}`,
    fixedCount: fixed,
    defaultWarehouse: defaultWh.name,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Shipment Warehouse Endpoints ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// GET /warehouses/:id/stats — إحصائيات مخزن معين
router.get("/warehouses/:id/stats", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const warehouseId = Number(req.params.id);

    const conditions: any[] = [
      eq(shipmentsTable.warehouseId, warehouseId),
      isNull(shipmentsTable.deletedAt),
    ];
    if (tenantId) conditions.push(eq(shipmentsTable.tenantId, tenantId));

    const shipments = await db
      .select({
        id:         shipmentsTable.id,
        status:     shipmentsTable.status,
        parcelType: shipmentsTable.parcelType,
        senderName: shipmentsTable.senderName,
        createdAt:  shipmentsTable.createdAt,
        updatedAt:  shipmentsTable.updatedAt,
      })
      .from(shipmentsTable)
      .where(and(...conditions));

    const ACTIVE = ["waiting", "confirmed", "picked_up", "in_transit", "out_for_delivery", "warehouse_ready"];
    const now = Date.now();
    const MS_PER_DAY = 86_400_000;

    // 1. عدد بنوع الطرد (الشحنات الـ active فقط)
    const byParcelType: Record<string, number> = {};
    // 2. أكتر عملاء
    const clientCount: Record<string, number> = {};
    // 3. الشحنات المتأخرة > 7 أيام (active)
    const staleShipments: { id: number; senderName: string; daysInWarehouse: number; parcelType: string | null }[] = [];
    // 4. حركة الدخول/الخروج (آخر 30 يوم — grouped by day)
    const inByDay:  Record<string, number> = {};
    const outByDay: Record<string, number> = {};

    for (const s of shipments) {
      const isActive = ACTIVE.includes(s.status);
      const created  = new Date(s.createdAt).getTime();
      const dayKey   = new Date(s.createdAt).toISOString().slice(0, 10);
      const daysIn   = Math.floor((now - created) / MS_PER_DAY);
      const isRecent = (now - created) < 30 * MS_PER_DAY;

      // نوع الطرد (active فقط)
      if (isActive && s.parcelType)
        byParcelType[s.parcelType] = (byParcelType[s.parcelType] ?? 0) + 1;

      // أكتر عملاء (كل الشحنات)
      if (s.senderName)
        clientCount[s.senderName] = (clientCount[s.senderName] ?? 0) + 1;

      // شحنات متأخرة > 7 أيام
      if (isActive && daysIn > 7)
        staleShipments.push({ id: s.id, senderName: s.senderName ?? "—", daysInWarehouse: daysIn, parcelType: s.parcelType });

      // حركة الدخول (كل الشحنات اللي دخلت في 30 يوم)
      if (isRecent) inByDay[dayKey] = (inByDay[dayKey] ?? 0) + 1;

      // حركة الخروج (delivered/returned في 30 يوم)
      if (isRecent && (s.status === "delivered" || s.status === "returned"))
        outByDay[dayKey] = (outByDay[dayKey] ?? 0) + 1;
    }

    const topClients = Object.entries(clientCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // حوّل حركة الـ 30 يوم لـ array مرتب
    const allDays = new Set([...Object.keys(inByDay), ...Object.keys(outByDay)]);
    const movement = Array.from(allDays).sort().map(day => ({
      day,
      in:  inByDay[day]  ?? 0,
      out: outByDay[day] ?? 0,
    }));

    res.json({
      total:      shipments.length,
      byStatus:   Object.fromEntries(ACTIVE.map(s => [s, shipments.filter(x => x.status === s).length])),
      byParcelType,
      topClients,
      staleShipments: staleShipments.sort((a, b) => b.daysInWarehouse - a.daysInWarehouse),
      movement,
    });
  } catch (e) {
    console.error("[GET /warehouses/:id/stats]", e);
    res.status(500).json({ error: "خطأ في جلب إحصائيات المخزن" });
  }
});

// POST /warehouses/transfer — تحويل شحنة من مخزن لآخر
router.post("/transfer", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const user = (req as any).user;
    const schema = z.object({
      shipmentId:        z.number(),
      toWarehouseId:     z.number().nullable(),
      notes:             z.string().optional(),
      shippingCompanyId: z.number().nullable().optional(), // تعيين/تغيير المندوب (شركة الشحن) وقت التحويل
      newStatus:         z.string().optional(),
    });
    const body = schema.parse(req.body);

    // اجلب الشحنة
    const [shipment] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, body.shipmentId));

    if (!shipment) {
      res.status(404).json({ error: "الشحنة غير موجودة" });
      return;
    }

    const now = new Date();

    // سجّل التحويل
    await db.insert(warehouseTransfersTable).values({
      tenantId:          tenantId ?? null,
      shipmentId:        body.shipmentId,
      fromWarehouseId:   shipment.warehouseId ?? null,
      toWarehouseId:     body.toWarehouseId,
      notes:             body.notes ?? null,
      createdByUserId:   user?.id ?? null,
      createdByName:     user?.name ?? null,
      createdAt:         now,
    });

    // حدّث الشحنة
    const updateData: any = {
      warehouseId: body.toWarehouseId,
      updatedAt: now,
    };
    if (body.newStatus !== undefined)         updateData.status            = body.newStatus;
    if (body.shippingCompanyId !== undefined) updateData.shippingCompanyId = body.shippingCompanyId;

    await db.update(shipmentsTable).set(updateData).where(eq(shipmentsTable.id, body.shipmentId));

    res.json({ success: true });
  } catch (e) {
    console.error("[POST /warehouses/transfer]", e);
    res.status(500).json({ error: "خطأ في تحويل الشحنة" });
  }
});

// GET /warehouses/transfers/:shipmentId — سجل تحويلات شحنة معينة
router.get("/transfers/:shipmentId", requireAuth, async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.shipmentId);
    const transfers = await db
      .select({
        transfer: warehouseTransfersTable,
        fromWarehouse: { id: warehousesTable.id, name: warehousesTable.name, city: warehousesTable.city },
      })
      .from(warehouseTransfersTable)
      .leftJoin(warehousesTable, eq(warehouseTransfersTable.fromWarehouseId, warehousesTable.id))
      .where(eq(warehouseTransfersTable.shipmentId, shipmentId))
      .orderBy(desc(warehouseTransfersTable.createdAt));

    res.json(transfers);
  } catch (e) {
    console.error("[GET /warehouses/transfers/:shipmentId]", e);
    res.status(500).json({ error: "خطأ في جلب سجل التحويلات" });
  }
});

// PATCH /warehouses/shipments/:id/courier — تعيين/تحديث مندوب الشحنة (شركة الشحن) عند خروجها من المخزن
router.patch("/shipments/:id/courier", requireAuth, async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const schema = z.object({
      shippingCompanyId: z.number(),               // المندوب = شركة الشحن من shippingCompaniesTable
      warehouseId:       z.number().nullable().optional(),
    });
    const body = schema.parse(req.body);

    await db.update(shipmentsTable).set({
      shippingCompanyId: body.shippingCompanyId,
      status:             "out_for_delivery",       // خرجت للتسليم مع المندوب
      warehouseId:        body.warehouseId ?? undefined,
      updatedAt:          new Date(),
    }).where(eq(shipmentsTable.id, shipmentId));

    res.json({ success: true });
  } catch (e) {
    console.error("[PATCH /warehouses/shipments/:id/courier]", e);
    res.status(500).json({ error: "خطأ في تعيين المندوب" });
  }
});

export default router;
