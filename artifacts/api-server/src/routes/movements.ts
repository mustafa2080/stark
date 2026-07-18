import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte, or, like, sum, isNull, ne, inArray, sql } from "drizzle-orm";
import {
  db,
  inventoryMovementsTable,
  productsTable,
  productVariantsTable,
  warehousesTable,
  warehouseStockTable,
  ordersTable,
  shipmentsTable,
} from "@workspace/db";
import { getTenantId } from "../middlewares/requireTenant.js";
import {
  adjustWarehouseStock,
  syncProductQuantityFromWarehouses,
  resolveInventoryTarget,
  recordMovement,
} from "../lib/inventory.js";

const router: IRouter = Router();

// ─── Build filter conditions ──────────────────────────────────────────────────
async function buildConditions(query: Record<string, string>) {
  const { type, reason, productId, warehouseId, dateFrom, dateTo } = query;
  const conditions: any[] = [];

  if (type === "IN" || type === "OUT")
    conditions.push(eq(inventoryMovementsTable.type, type));

  if (reason)
    conditions.push(eq(inventoryMovementsTable.reason, reason as any));

  if (warehouseId)
    conditions.push(eq(inventoryMovementsTable.warehouseId, parseInt(warehouseId)));

  if (productId) {
    const pid = parseInt(productId);
    const [product] = await db
      .select({ name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.id, pid))
      .limit(1);
    if (product?.name) {
      conditions.push(
        or(
          eq(inventoryMovementsTable.productId, pid),
          like(inventoryMovementsTable.product, `%${product.name}%`)
        )
      );
    } else {
      conditions.push(eq(inventoryMovementsTable.productId, pid));
    }
  }

  if (dateFrom)
    conditions.push(gte(inventoryMovementsTable.createdAt, new Date(dateFrom)));

  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(inventoryMovementsTable.createdAt, end));
  }

  return conditions;
}

// ─── List movements ────────────────────────────────────────────────────────────
router.get("/inventory/movements", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conditions = await buildConditions(req.query as Record<string, string>);

  // لو tenant → نضيف filter على الـ warehouse المرتبط بالـ tenant
  if (tenantId !== null) {
    const tenantWarehouses = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(eq(warehousesTable.tenantId, tenantId));
    const warehouseIds = tenantWarehouses.map(w => w.id);
    if (warehouseIds.length > 0) {
      conditions.push(inArray(inventoryMovementsTable.warehouseId, warehouseIds));
    } else {
      res.json([]); return;
    }
  }

  let query = db
    .select({
      id:           inventoryMovementsTable.id,
      productId:    inventoryMovementsTable.productId,
      variantId:    inventoryMovementsTable.variantId,
      warehouseId:  inventoryMovementsTable.warehouseId,
      warehouseName: warehousesTable.name,
      product:      inventoryMovementsTable.product,
      color:        inventoryMovementsTable.color,
      size:         inventoryMovementsTable.size,
      quantity:     inventoryMovementsTable.quantity,
      type:         inventoryMovementsTable.type,
      reason:       inventoryMovementsTable.reason,
      orderId:      inventoryMovementsTable.orderId,
      shipmentId:   inventoryMovementsTable.shipmentId,
      shipmentNumber: shipmentsTable.shipmentNumber,
      customerName: sql<string | null>`COALESCE(${ordersTable.customerName}, ${shipmentsTable.receiverName})`,
      customerPhone: sql<string | null>`COALESCE(${ordersTable.phone}, ${shipmentsTable.receiverPhone})`,
      fromLocation: inventoryMovementsTable.fromLocation,
      toLocation:   inventoryMovementsTable.toLocation,
      notes:        inventoryMovementsTable.notes,
      createdAt:    inventoryMovementsTable.createdAt,
    })
    .from(inventoryMovementsTable)
    .leftJoin(warehousesTable, eq(inventoryMovementsTable.warehouseId, warehousesTable.id))
    .leftJoin(ordersTable, eq(inventoryMovementsTable.orderId, ordersTable.id))
    .leftJoin(shipmentsTable, eq(inventoryMovementsTable.shipmentId, shipmentsTable.id))
    .orderBy(desc(inventoryMovementsTable.createdAt))
    .$dynamic();

  // استثني أي حركة مرتبطة بطلب حالته pending
  // استثني الحركات المرجعية (كمية 0) — دي بتتسجل للأوردرات المجمّعة في فاتورة واحدة
  const pendingFilter = or(
    isNull(inventoryMovementsTable.orderId),
    ne(ordersTable.status, "pending")
  );
  const zeroQtyFilter = ne(inventoryMovementsTable.quantity, 0);
  const allConditions = conditions.length > 0
    ? and(pendingFilter, zeroQtyFilter, ...conditions)
    : and(pendingFilter, zeroQtyFilter);
  query = query.where(allConditions);

  res.json(await query);
});

// ─── Totals ────────────────────────────────────────────────────────────────────
router.get("/inventory/movements/totals", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conditions = await buildConditions(req.query as Record<string, string>);

  // tenant filter عبر المخازن
  if (tenantId !== null) {
    const tenantWarehouses = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(eq(warehousesTable.tenantId, tenantId));
    const warehouseIds = tenantWarehouses.map(w => w.id);
    if (warehouseIds.length > 0) {
      conditions.push(inArray(inventoryMovementsTable.warehouseId, warehouseIds));
    } else {
      res.json({ totalIn: 0, totalOut: 0, balance: 0, currentStock: 0 }); return;
    }
  }

  let query = db
    .select()
    .from(inventoryMovementsTable)
    .leftJoin(ordersTable, eq(inventoryMovementsTable.orderId, ordersTable.id))
    .$dynamic();

  const pendingFilter = or(
    isNull(inventoryMovementsTable.orderId),
    ne(ordersTable.status, "pending")
  );
  const zeroQtyFilterT = ne(inventoryMovementsTable.quantity, 0);
  const allConditions = conditions.length > 0
    ? and(pendingFilter, zeroQtyFilterT, ...conditions)
    : and(pendingFilter, zeroQtyFilterT);
  query = query.where(allConditions);

  const rows = await query;
  const totalIn  = rows.filter(r => r.inventory_movements.type === "IN").reduce((s, r) => s + r.inventory_movements.quantity, 0);
  const totalOut = rows.filter(r => r.inventory_movements.type === "OUT").reduce((s, r) => s + r.inventory_movements.quantity, 0);

  // ── الرصيد الحقيقي من المخزون (إذا تم الفلتر على منتج معين) ──────────────
  // الرصيد = الكمية الفعلية في المخازن (مش مجموع الحركات)
  const { productId: pidStr, variantId: vidStr } = req.query as Record<string, string>;
  let currentStock = 0;

  if (vidStr) {
    const vid = parseInt(vidStr);
    if (!isNaN(vid)) {
      const [row] = await db
        .select({ total: sum(warehouseStockTable.quantity) })
        .from(warehouseStockTable)
        .where(eq(warehouseStockTable.variantId, vid));
      currentStock = Number(row?.total ?? 0);
    }
  } else if (pidStr) {
    const pid = parseInt(pidStr);
    if (!isNaN(pid)) {
      // جيب الـ variants الخاصة بالمنتج واجمع مخزونها
      const variants = await db
        .select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(eq(productVariantsTable.productId, pid));

      if (variants.length > 0) {
        // مخزون الـ variants
        for (const v of variants) {
          const [row] = await db
            .select({ total: sum(warehouseStockTable.quantity) })
            .from(warehouseStockTable)
            .where(eq(warehouseStockTable.variantId, v.id));
          currentStock += Number(row?.total ?? 0);
        }
      } else {
        // مخزون المنتج مباشرة (بدون variants)
        const [row] = await db
          .select({ total: sum(warehouseStockTable.quantity) })
          .from(warehouseStockTable)
          .where(eq(warehouseStockTable.productId, pid));
        currentStock = Number(row?.total ?? 0);
      }
    }
  }

  // لو مفيش فلتر منتج → جيب إجمالي كل المخزون
  if (!pidStr && !vidStr) {
    const [row] = await db
      .select({ total: sum(warehouseStockTable.quantity) })
      .from(warehouseStockTable);
    currentStock = Number(row?.total ?? 0);
  }

  res.json({
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
    currentStock, // دايماً رصيد حقيقي من المخزن
  });
});

// ─── Create manual movement ────────────────────────────────────────────────────
/**
 * كل حركة يدوية تمر عبر المنطق المركزي في inventory.ts:
 *   1. adjustWarehouseStock  → يعدّل warehouse_stock
 *   2. syncProductQuantity   → يزامن totalQuantity
 *   3. recordMovement        → يسجّل في inventory_movements
 *
 * استثناء: transfer → يعالج المصدر والوجهة منفصلَين
 */
router.post("/inventory/movements", async (req, res): Promise<void> => {
  const {
    product, color, size, quantity, type, reason,
    productId, variantId, warehouseId,
    fromLocation, toLocation, notes,
  } = req.body;

  if (!product || !quantity || !type || !reason) {
    res.status(400).json({ error: "product, quantity, type, reason مطلوبة" });
    return;
  }
  if (type !== "IN" && type !== "OUT") {
    res.status(400).json({ error: "type يجب أن يكون IN أو OUT" });
    return;
  }

  const qty  = parseInt(quantity);
  const pid  = productId  ? parseInt(productId)  : null;
  const vid  = variantId  ? parseInt(variantId)  : null;
  const whId = warehouseId ? parseInt(warehouseId) : null;

  // جيب variantId / productId المحلولَين
  const { variantId: resolvedVid, productId: resolvedPid } = await resolveInventoryTarget({
    variantId: vid, productId: pid, product, color, size,
  });

  let usedWhId: number | null = whId;

  if (reason === "transfer" && fromLocation && toLocation) {
    // ── تحويل بين مخزنَين ──────────────────────────────────────────────────
    const extractName = (loc: string) => {
      const m = loc.match(/^مخزن:\s*(.+)$/);
      return m ? m[1].trim() : null;
    };
    const fromName = extractName(fromLocation);
    const toName   = extractName(toLocation);

    const allWh = await db.select().from(warehousesTable);
    const fromWh = fromName ? allWh.find(w => w.name === fromName) : null;
    const toWh   = toName   ? allWh.find(w => w.name === toName)   : null;

    if ((resolvedVid || resolvedPid) && fromWh && toWh) {
      // خصم من المصدر
      await adjustWarehouseStock(fromWh.id, resolvedVid, resolvedPid, -qty);
      // إضافة للوجهة
      await adjustWarehouseStock(toWh.id,   resolvedVid, resolvedPid, qty);
      // مزامنة مرة واحدة بعد العمليتين
      await syncProductQuantityFromWarehouses(resolvedVid, resolvedPid);
    }

    // سجّل حركتَين (OUT من المصدر / IN للوجهة)
    await recordMovement({
      product, color, size, quantity: qty, type: "OUT", reason: "transfer",
      productId: resolvedPid, variantId: resolvedVid,
      warehouseId: fromWh?.id ?? null,
      fromLocation, toLocation, notes: notes ?? null,
    });
    await recordMovement({
      product, color, size, quantity: qty, type: "IN", reason: "transfer",
      productId: resolvedPid, variantId: resolvedVid,
      warehouseId: toWh?.id ?? null,
      fromLocation, toLocation, notes: notes ?? null,
    });

    // أرجع الحركتين
    const movements = await db
      .select({
        id: inventoryMovementsTable.id,
        productId: inventoryMovementsTable.productId,
        variantId: inventoryMovementsTable.variantId,
        warehouseId: inventoryMovementsTable.warehouseId,
        warehouseName: warehousesTable.name,
        product: inventoryMovementsTable.product,
        color: inventoryMovementsTable.color,
        size: inventoryMovementsTable.size,
        quantity: inventoryMovementsTable.quantity,
        type: inventoryMovementsTable.type,
        reason: inventoryMovementsTable.reason,
        orderId: inventoryMovementsTable.orderId,
        fromLocation: inventoryMovementsTable.fromLocation,
        toLocation: inventoryMovementsTable.toLocation,
        notes: inventoryMovementsTable.notes,
        createdAt: inventoryMovementsTable.createdAt,
      })
      .from(inventoryMovementsTable)
      .leftJoin(warehousesTable, eq(inventoryMovementsTable.warehouseId, warehousesTable.id))
      .orderBy(desc(inventoryMovementsTable.createdAt))
      .limit(2);

    res.status(201).json(movements[0] ?? { success: true });
    return;
  }

  // ── حركة عادية (غير transfer) ────────────────────────────────────────────
  const delta = type === "IN" ? qty : -qty;

  // استخدم الـ IDs المحلولة أو الـ IDs الأصلية المرسلة مباشرة
  const effectiveVid = resolvedVid ?? vid;
  const effectivePid = resolvedVid ? null : (resolvedPid ?? pid);

  if (effectiveVid || effectivePid) {
    // 1. عدّل warehouse_stock
    usedWhId = await adjustWarehouseStock(whId, effectiveVid, effectivePid, delta) ?? whId;
    // 2. زامن totalQuantity
    await syncProductQuantityFromWarehouses(effectiveVid, effectivePid);
  }

  // 3. سجّل الحركة
  await recordMovement({
    product, color, size, quantity: qty, type,
    reason: reason as any,
    productId: effectivePid, variantId: effectiveVid,
    warehouseId: usedWhId,
    fromLocation: fromLocation ?? null,
    toLocation:   toLocation   ?? null,
    notes:        notes ?? null,
  });

  // جيب الحركة المسجّلة مع اسم المخزن
  const [movement] = await db
    .select({
      id:           inventoryMovementsTable.id,
      productId:    inventoryMovementsTable.productId,
      variantId:    inventoryMovementsTable.variantId,
      warehouseId:  inventoryMovementsTable.warehouseId,
      warehouseName: warehousesTable.name,
      product:      inventoryMovementsTable.product,
      color:        inventoryMovementsTable.color,
      size:         inventoryMovementsTable.size,
      quantity:     inventoryMovementsTable.quantity,
      type:         inventoryMovementsTable.type,
      reason:       inventoryMovementsTable.reason,
      orderId:      inventoryMovementsTable.orderId,
      fromLocation: inventoryMovementsTable.fromLocation,
      toLocation:   inventoryMovementsTable.toLocation,
      notes:        inventoryMovementsTable.notes,
      createdAt:    inventoryMovementsTable.createdAt,
    })
    .from(inventoryMovementsTable)
    .leftJoin(warehousesTable, eq(inventoryMovementsTable.warehouseId, warehousesTable.id))
    .orderBy(desc(inventoryMovementsTable.createdAt))
    .limit(1);

  res.status(201).json(movement);
});

// ─── Update movement (metadata فقط — لا يعيد حساب المخزون) ──────────────────
router.put("/inventory/movements/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id غير صحيح" }); return; }

  const { product, color, size, quantity, type, reason, warehouseId, notes, fromLocation, toLocation } = req.body;
  if (!product || !quantity || !type || !reason) {
    res.status(400).json({ error: "product, quantity, type, reason مطلوبة" }); return;
  }

  await db.update(inventoryMovementsTable)
    .set({
      product, color: color ?? null, size: size ?? null,
      quantity: parseInt(quantity), type, reason,
      warehouseId:  warehouseId  ? parseInt(warehouseId)  : null,
      fromLocation: fromLocation ?? null,
      toLocation:   toLocation   ?? null,
      notes:        notes ?? null,
    })
    .where(eq(inventoryMovementsTable.id, id));

  const [movement] = await db
    .select({
      id:           inventoryMovementsTable.id,
      productId:    inventoryMovementsTable.productId,
      variantId:    inventoryMovementsTable.variantId,
      warehouseId:  inventoryMovementsTable.warehouseId,
      warehouseName: warehousesTable.name,
      product:      inventoryMovementsTable.product,
      color:        inventoryMovementsTable.color,
      size:         inventoryMovementsTable.size,
      quantity:     inventoryMovementsTable.quantity,
      type:         inventoryMovementsTable.type,
      reason:       inventoryMovementsTable.reason,
      orderId:      inventoryMovementsTable.orderId,
      fromLocation: inventoryMovementsTable.fromLocation,
      toLocation:   inventoryMovementsTable.toLocation,
      notes:        inventoryMovementsTable.notes,
      createdAt:    inventoryMovementsTable.createdAt,
    })
    .from(inventoryMovementsTable)
    .leftJoin(warehousesTable, eq(inventoryMovementsTable.warehouseId, warehousesTable.id))
    .where(eq(inventoryMovementsTable.id, id));

  if (!movement) { res.status(404).json({ error: "الحركة غير موجودة" }); return; }
  res.json(movement);
});

// ─── Bulk Delete movements (admin only) ───────────────────────────────────────
router.delete("/inventory/movements", async (req, res): Promise<void> => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids مطلوبة وتكون array" });
    return;
  }
  const numericIds = ids.map(Number).filter(n => !isNaN(n));
  if (numericIds.length === 0) {
    res.status(400).json({ error: "ids غير صحيحة" });
    return;
  }
  await db.delete(inventoryMovementsTable).where(inArray(inventoryMovementsTable.id, numericIds));
  res.json({ success: true, deleted: numericIds.length });
});

// ─── Delete movement ───────────────────────────────────────────────────────────
router.delete("/inventory/movements/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id غير صحيح" }); return; }
  await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.id, id));
  res.json({ success: true });
});

export default router;
