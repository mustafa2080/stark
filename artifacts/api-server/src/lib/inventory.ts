import { eq, like, and, sum } from "drizzle-orm";
import { db, productsTable, productVariantsTable, inventoryMovementsTable, warehouseStockTable, warehousesTable, shipmentItemsTable } from "@workspace/db";
import type { MovementReason } from "@workspace/db";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  فلسفة المخزون — الحقيقة الوحيدة:
 *
 *  warehouse_stock   = الكمية الفعلية في كل مخزن  ← المصدر الوحيد للحقيقة
 *  totalQuantity     = sum(warehouse_stock)         ← يُحسب تلقائياً دائماً
 *  inventory_movements = سجل تاريخي لكل عملية      ← للعرض والتقارير فقط
 *
 *  القاعدة الذهبية:
 *    كل عملية تغيّر المخزون → تمر عبر adjustWarehouseStock أولاً
 *    ثم syncProductQuantityFromWarehouses تزامن totalQuantity تلقائياً
 *    ثم recordMovement تسجّل الحركة للتاريخ
 *
 *  لا أحد يكتب في totalQuantity مباشرة — ممنوع تماماً
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ─── SYNC: مزامنة totalQuantity من مجموع المخازن ─────────────────────────────
/**
 * الدالة الوحيدة المسموح لها بكتابة totalQuantity.
 * تُستدعى تلقائياً بعد كل تعديل على warehouse_stock.
 */
export async function syncProductQuantityFromWarehouses(
  variantId: number | null,
  productId: number | null,
): Promise<void> {
  if (variantId) {
    const [row] = await db
      .select({ total: sum(warehouseStockTable.quantity) })
      .from(warehouseStockTable)
      .where(eq(warehouseStockTable.variantId, variantId));
    const total = Number(row?.total ?? 0);
    await db
      .update(productVariantsTable)
      .set({ totalQuantity: total, updatedAt: new Date() })
      .where(eq(productVariantsTable.id, variantId));

    // حدّث المنتج الأب = مجموع variants
    const [variant] = await db
      .select({ productId: productVariantsTable.productId })
      .from(productVariantsTable)
      .where(eq(productVariantsTable.id, variantId));
    if (variant) await syncParentProductFromVariants(variant.productId);

  } else if (productId) {
    const [row] = await db
      .select({ total: sum(warehouseStockTable.quantity) })
      .from(warehouseStockTable)
      .where(eq(warehouseStockTable.productId, productId));
    const total = Number(row?.total ?? 0);
    await db
      .update(productsTable)
      .set({ totalQuantity: total, updatedAt: new Date() })
      .where(eq(productsTable.id, productId));
  }
}

async function syncParentProductFromVariants(productId: number): Promise<void> {
  const variants = await db
    .select({ qty: productVariantsTable.totalQuantity })
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, productId));
  const total = variants.reduce((s, v) => s + (v.qty ?? 0), 0);
  await db
    .update(productsTable)
    .set({ totalQuantity: total, updatedAt: new Date() })
    .where(eq(productsTable.id, productId));
}

// ─── RESOLVE: تحديد المنتج / الـ variant من الطلب ────────────────────────────
export async function resolveInventoryTarget(order: {
  variantId?: number | null;
  productId?: number | null;
  product?: string | null;
  color?: string | null;
  size?: string | null;
}): Promise<{ variantId: number | null; productId: number | null }> {
  // ─── 1. variantId مباشر ────────────────────────────────────────────────────
  if (order.variantId) {
    // تحقق إن الـ variant موجود فعلاً في warehouse_stock
    const [stockRow] = await db
      .select({ id: warehouseStockTable.id })
      .from(warehouseStockTable)
      .where(eq(warehouseStockTable.variantId, order.variantId))
      .limit(1);

    if (stockRow) {
      // الـ variant موجود في المخزن → استخدمه مباشرة
      return { variantId: order.variantId, productId: null };
    }

    // الـ variant مش في warehouse_stock → جرب بالـ productId بتاعه
    const [variant] = await db
      .select({ productId: productVariantsTable.productId })
      .from(productVariantsTable)
      .where(eq(productVariantsTable.id, order.variantId))
      .limit(1);

    if (variant?.productId) {
      // شوف لو المنتج الأب عنده stock
      const [prodStock] = await db
        .select({ id: warehouseStockTable.id })
        .from(warehouseStockTable)
        .where(eq(warehouseStockTable.productId, variant.productId))
        .limit(1);
      if (prodStock) {
        return { variantId: null, productId: variant.productId };
      }
      // حتى لو مش موجود في warehouse_stock، ارجع الـ variantId الأصلي
      // عشان الـ adjustWarehouseStock يقدر ينشئ سجل جديد لو delta > 0
    }
    return { variantId: order.variantId, productId: null };
  }

  // ─── 2. productId مباشر ────────────────────────────────────────────────────
  if (order.productId) {
    // شوف لو في variant واحد بس للمنتج ده → استخدم variantId
    const variants = await db
      .select({ id: productVariantsTable.id })
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, order.productId));

    if (variants.length === 1) {
      // منتج بـ variant واحد → استخدم variantId عشان الـ stock أدق
      const [vStock] = await db
        .select({ id: warehouseStockTable.id })
        .from(warehouseStockTable)
        .where(eq(warehouseStockTable.variantId, variants[0].id))
        .limit(1);
      if (vStock) return { variantId: variants[0].id, productId: null };
    }
    return { variantId: null, productId: order.productId };
  }

  // ─── 3. بحث بالاسم + اللون + المقاس ──────────────────────────────────────
  if (order.product && order.color && order.size) {
    const variants = await db
      .select({ id: productVariantsTable.id })
      .from(productVariantsTable)
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .where(and(
        like(productsTable.name, `%${order.product}%`),
        like(productVariantsTable.color, `%${order.color}%`),
        like(productVariantsTable.size, `%${order.size}%`),
      ));
    if (variants.length > 0) return { variantId: variants[0].id, productId: null };
  }

  // ─── 4. بحث بالاسم فقط ───────────────────────────────────────────────────
  if (order.product) {
    const products = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(like(productsTable.name, `%${order.product}%`));
    if (products.length > 0) return { variantId: null, productId: products[0].id };
  }

  return { variantId: null, productId: null };
}

// ─── WAREHOUSE STOCK: التعديل الفعلي على المخزن ──────────────────────────────
/**
 * الدالة المركزية لتعديل warehouse_stock.
 *
 * warehouseId محدد → تعديل في المخزن ده بالظبط
 * warehouseId غير محدد + delta سالب → خصم تدريجي من المخازن (الأكبر رصيداً أولاً)
 * warehouseId غير محدد + delta موجب → إضافة للمخزن الافتراضي أو الأول
 *
 * ترجع: الـ warehouseId اللي اتعدل فعلاً (للاستخدام في تسجيل الحركة)
 */
export async function adjustWarehouseStock(
  warehouseId: number | null | undefined,
  variantId: number | null,
  productId: number | null,
  delta: number,
): Promise<number | null> {
  if (!variantId && !productId) return null;

  const stockCondition = (whId: number) => and(
    eq(warehouseStockTable.warehouseId, whId),
    variantId
      ? eq(warehouseStockTable.variantId, variantId)
      : eq(warehouseStockTable.productId, productId!),
  );

  if (warehouseId) {
    // ── مخزن محدد ──────────────────────────────────────────────────────────
    const [row] = await db.select().from(warehouseStockTable).where(stockCondition(warehouseId));
    if (row) {
      const newQty = Math.max(0, row.quantity + delta);
      await db.update(warehouseStockTable)
        .set({ quantity: newQty, updatedAt: new Date() })
        .where(eq(warehouseStockTable.id, row.id));
    } else if (delta > 0) {
      // تحقق إن المخزن موجود فعلاً قبل الإضافة
      const [wh] = await db.select({ id: warehousesTable.id }).from(warehousesTable).where(eq(warehousesTable.id, warehouseId));
      if (!wh) return warehouseId; // المخزن اتحذف — تجاهل العملية
      // صف جديد — فقط للإضافة
      await db.insert(warehouseStockTable).values({
        warehouseId,
        variantId: variantId ?? null,
        productId: productId ?? null,
        quantity: delta,
        updatedAt: new Date(),
      });
    }
    return warehouseId;
  }

  // ── بدون مخزن محدد ──────────────────────────────────────────────────────
  const rows = await db
    .select()
    .from(warehouseStockTable)
    .where(
      variantId
        ? eq(warehouseStockTable.variantId, variantId)
        : eq(warehouseStockTable.productId, productId!),
    );

  if (delta > 0) {
    // إضافة → للمخزن الافتراضي أو الأول
    let targetWhId: number | null = null;

    if (rows.length > 0) {
      // ابحث عن المخزن الافتراضي أولاً
      const defaultRow = rows.find(r => r.warehouseId);
      const allWh = await db.select().from(warehousesTable).orderBy(warehousesTable.isDefault);
      const defaultWh = allWh.find(w => w.isDefault) ?? allWh[0];
      if (defaultWh) {
        targetWhId = defaultWh.id;
        const existing = rows.find(r => r.warehouseId === targetWhId);
        if (existing) {
          await db.update(warehouseStockTable)
            .set({ quantity: existing.quantity + delta, updatedAt: new Date() })
            .where(eq(warehouseStockTable.id, existing.id));
        } else {
          await db.insert(warehouseStockTable).values({
            warehouseId: targetWhId,
            variantId: variantId ?? null,
            productId: productId ?? null,
            quantity: delta,
            updatedAt: new Date(),
          });
        }
      } else if (defaultRow) {
        await db.update(warehouseStockTable)
          .set({ quantity: defaultRow.quantity + delta, updatedAt: new Date() })
          .where(eq(warehouseStockTable.id, defaultRow.id));
        targetWhId = defaultRow.warehouseId;
      }
    } else {
      // مفيش صف بالمرة → ابحث عن مخزن وأنشئ صف
      const [anyWh] = await db.select().from(warehousesTable).orderBy(warehousesTable.isDefault).limit(1);
      if (anyWh) {
        await db.insert(warehouseStockTable).values({
          warehouseId: anyWh.id,
          variantId: variantId ?? null,
          productId: productId ?? null,
          quantity: delta,
          updatedAt: new Date(),
        });
        targetWhId = anyWh.id;
      }
    }
    return targetWhId;

  } else {
    // خصم → من المخازن اللي فيها رصيد (الأكبر أولاً)
    let remaining = Math.abs(delta);
    const sorted = rows.filter(r => r.quantity > 0).sort((a, b) => b.quantity - a.quantity);
    let firstWhId: number | null = sorted[0]?.warehouseId ?? null;

    for (const row of sorted) {
      if (remaining <= 0) break;
      const deduct = Math.min(row.quantity, remaining);
      await db.update(warehouseStockTable)
        .set({ quantity: row.quantity - deduct, updatedAt: new Date() })
        .where(eq(warehouseStockTable.id, row.id));
      remaining -= deduct;
    }
    return firstWhId;
  }
}

// ─── RESOLVE PRODUCT ID FROM VARIANT: جيب productId من variantId ─────────────
export async function resolveProductIdFromVariant(variantId: number | null, productId: number | null): Promise<{ variantId: number | null; productId: number | null }> {
  // لو عندنا variantId بس بدون productId → جيب productId من DB
  if (variantId && !productId) {
    const [variant] = await db
      .select({ productId: productVariantsTable.productId })
      .from(productVariantsTable)
      .where(eq(productVariantsTable.id, variantId))
      .limit(1);
    if (variant?.productId) {
      return { variantId, productId: variant.productId };
    }
  }
  return { variantId, productId };
}

// ─── RECORD MOVEMENT: تسجيل الحركة في السجل التاريخي ────────────────────────
export async function recordMovement(data: {
  product: string;
  color?: string | null;
  size?: string | null;
  quantity: number;
  type: "IN" | "OUT";
  reason: MovementReason;
  productId?: number | null;
  variantId?: number | null;
  warehouseId?: number | null;
  orderId?: number | null;
  shipmentId?: number | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  notes?: string | null;
}): Promise<void> {
  await db.insert(inventoryMovementsTable).values({
    product: data.product,
    color: data.color ?? null,
    size: data.size ?? null,
    quantity: data.quantity,
    type: data.type,
    reason: data.reason,
    productId: data.productId ?? null,
    variantId: data.variantId ?? null,
    warehouseId: data.warehouseId ?? null,
    orderId: data.orderId ?? null,
    shipmentId: data.shipmentId ?? null,
    fromLocation: data.fromLocation ?? null,
    toLocation: data.toLocation ?? null,
    notes: data.notes ?? null,
  });
}

// ─── SOLD QUANTITY: تحديث soldQuantity فقط (للتقارير) ───────────────────────
async function updateSoldQuantity(
  variantId: number | null,
  productId: number | null,
  soldDelta: number,
): Promise<void> {
  if (soldDelta === 0) return;
  if (variantId) {
    const [v] = await db.select({ soldQuantity: productVariantsTable.soldQuantity })
      .from(productVariantsTable).where(eq(productVariantsTable.id, variantId));
    if (v) await db.update(productVariantsTable)
      .set({ soldQuantity: Math.max(0, (v.soldQuantity ?? 0) + soldDelta), updatedAt: new Date() })
      .where(eq(productVariantsTable.id, variantId));
  } else if (productId) {
    const [p] = await db.select({ soldQuantity: productsTable.soldQuantity })
      .from(productsTable).where(eq(productsTable.id, productId));
    if (p) await db.update(productsTable)
      .set({ soldQuantity: Math.max(0, (p.soldQuantity ?? 0) + soldDelta), updatedAt: new Date() })
      .where(eq(productsTable.id, productId));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC API — كل عملية تمر عبر: adjustWarehouseStock → sync → recordMovement
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * إضافة مخزون (تموين / إدخال أولي).
 * warehouseId مطلوب — إذا مفيش، يختار الافتراضي تلقائياً.
 */
export async function addStock(
  target: {
    variantId?: number | null;
    productId?: number | null;
    product?: string | null;
    color?: string | null;
    size?: string | null;
    warehouseId?: number | null;
  },
  quantity: number,
  notes?: string | null,
): Promise<void> {
  if (quantity <= 0) return;
  const { variantId, productId } = await resolveInventoryTarget(target);
  if (!variantId && !productId) return;

  // 1. عدّل warehouse_stock
  const usedWhId = await adjustWarehouseStock(target.warehouseId, variantId, productId, quantity);

  // 2. زامن totalQuantity
  await syncProductQuantityFromWarehouses(variantId, productId);

  // 3. سجّل الحركة
  if (target.product) {
    // تأكد إن productId موجود دايماً (لو variantId بدون productId → جيبه)
    const resolved = await resolveProductIdFromVariant(variantId, productId);
    await recordMovement({
      product: target.product,
      color: target.color ?? null,
      size: target.size ?? null,
      quantity,
      type: "IN",
      reason: "manual_in",
      productId: resolved.productId ?? null,
      variantId: resolved.variantId ?? null,
      warehouseId: usedWhId,
      notes: notes ?? null,
    });
  }
}

/**
 * تسليم طلب → خصم من المخزن.
 * يُستدعى لما الطلب يبقى "received" أو "partial_received".
 */
export async function processDelivery(
  order: {
    variantId?: number | null;
    productId?: number | null;
    product?: string | null;
    color?: string | null;
    size?: string | null;
    warehouseId?: number | null;
  },
  deliveredQty: number,
  reason: "sale" | "partial_sale",
  orderId?: number | null,
  skipWarehouseStock = false,
): Promise<void> {
  if (deliveredQty <= 0) return;
  const { variantId, productId } = await resolveInventoryTarget(order);
  if (!variantId && !productId) return;

  let productName = order.product ?? null;
  if (!productName) {
    if (variantId) {
      const [v] = await db.select({ name: productsTable.name }).from(productVariantsTable)
        .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
        .where(eq(productVariantsTable.id, variantId)).limit(1);
      productName = v?.name ?? "منتج";
    } else if (productId) {
      const [p] = await db.select({ name: productsTable.name }).from(productsTable)
        .where(eq(productsTable.id, productId)).limit(1);
      productName = p?.name ?? "منتج";
    }
  }

  let usedWhId: number | null = order.warehouseId ?? null;

  if (!skipWarehouseStock) {
    // 1. عدّل warehouse_stock
    usedWhId = await adjustWarehouseStock(order.warehouseId, variantId, productId, -deliveredQty);
    // 2. زامن totalQuantity
    await syncProductQuantityFromWarehouses(variantId, productId);
  }

  // 3. حدّث soldQuantity (للتقارير فقط)
  await updateSoldQuantity(variantId, productId, deliveredQty);

  // 4. سجّل الحركة دايماً
  const resolvedDelivery = await resolveProductIdFromVariant(variantId, productId);
  await recordMovement({
    product: productName ?? "منتج",
    color: order.color,
    size: order.size,
    quantity: deliveredQty,
    type: "OUT",
    reason,
    productId: resolvedDelivery.productId,
    variantId: resolvedDelivery.variantId,
    warehouseId: usedWhId,
    orderId,
  });
}

/**
 * إلغاء تسليم → إرجاع الكمية للمخزن.
 */
export async function reverseDelivery(
  order: {
    variantId?: number | null;
    productId?: number | null;
    product?: string | null;
    color?: string | null;
    size?: string | null;
    warehouseId?: number | null;
  },
  deliveredQty: number,
  orderId?: number | null,
): Promise<void> {
  if (deliveredQty <= 0) return;
  const { variantId, productId } = await resolveInventoryTarget(order);
  if (!variantId && !productId) return;

  let productName = order.product ?? null;
  if (!productName) {
    if (variantId) {
      const [v] = await db.select({ name: productsTable.name }).from(productVariantsTable)
        .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
        .where(eq(productVariantsTable.id, variantId)).limit(1);
      productName = v?.name ?? "منتج";
    } else if (productId) {
      const [p] = await db.select({ name: productsTable.name }).from(productsTable)
        .where(eq(productsTable.id, productId)).limit(1);
      productName = p?.name ?? "منتج";
    }
  }

  // 1. أرجع لـ warehouse_stock
  const usedWhId = await adjustWarehouseStock(order.warehouseId, variantId, productId, deliveredQty);

  // 2. زامن totalQuantity
  await syncProductQuantityFromWarehouses(variantId, productId);

  // 3. عكس soldQuantity
  await updateSoldQuantity(variantId, productId, -deliveredQty);

  // 4. سجّل الحركة دايماً
  const resolvedReverse = await resolveProductIdFromVariant(variantId, productId);
  await recordMovement({
    product: productName ?? "منتج",
    color: order.color,
    size: order.size,
    quantity: deliveredQty,
    type: "IN",
    reason: "adjustment",
    productId: resolvedReverse.productId,
    variantId: resolvedReverse.variantId,
    warehouseId: usedWhId,
    orderId,
    notes: "إلغاء تسليم",
  });
}

/**
 * مرتجع طلب.
 * isDamaged=false → أرجع للمخزن
 * isDamaged=true  → سجّل فقط كـ audit (لا يضاف للمخزون)
 */
export async function processReturn(
  order: {
    variantId?: number | null;
    productId?: number | null;
    product?: string | null;
    color?: string | null;
    size?: string | null;
    quantity: number;
    warehouseId?: number | null;
  },
  wasReceived: boolean,
  isDamaged: boolean,
  orderId?: number | null,
): Promise<void> {
  if (!wasReceived) return;
  const { variantId, productId } = await resolveInventoryTarget(order);
  if (!variantId && !productId) return;

  let usedWhId: number | null = order.warehouseId ?? null;

  if (!isDamaged) {
    // 1. أرجع لـ warehouse_stock
    usedWhId = await adjustWarehouseStock(order.warehouseId, variantId, productId, order.quantity);
    // 2. زامن totalQuantity
    await syncProductQuantityFromWarehouses(variantId, productId);
    // 3. عكس soldQuantity
    await updateSoldQuantity(variantId, productId, -order.quantity);
  }

  // 4. سجّل الحركة
  if (order.product) {
    const resolvedReturn = await resolveProductIdFromVariant(variantId, productId);
    await recordMovement({
      product: order.product,
      color: order.color,
      size: order.size,
      quantity: order.quantity,
      type: "IN",
      reason: isDamaged ? ("damaged" as MovementReason) : "return",
      productId: resolvedReturn.productId,
      variantId: resolvedReturn.variantId,
      warehouseId: usedWhId,
      orderId,
      notes: isDamaged ? "مرتجع تالف — لا يُضاف للمخزون" : null,
    });
  }
}

/**
 * تحويل للشحن → خصم من المخزن لما يتضاف للبيان.
 */
export async function processToShipping(
  order: {
    variantId?: number | null;
    productId?: number | null;
    product?: string | null;
    color?: string | null;
    size?: string | null;
    warehouseId?: number | null;
  },
  qty: number,
  orderId?: number | null,
  shipmentId?: number | null,
): Promise<void> {
  if (qty <= 0) return;
  const { variantId, productId } = await resolveInventoryTarget(order);
  if (!variantId && !productId) return;

  // جيب اسم المنتج من DB لو مش موجود في الطلب
  let productName = order.product ?? null;
  if (!productName) {
    if (variantId) {
      const [v] = await db.select({ name: productsTable.name }).from(productVariantsTable)
        .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
        .where(eq(productVariantsTable.id, variantId)).limit(1);
      productName = v?.name ?? "منتج";
    } else if (productId) {
      const [p] = await db.select({ name: productsTable.name }).from(productsTable)
        .where(eq(productsTable.id, productId)).limit(1);
      productName = p?.name ?? "منتج";
    }
  }

  // 1. خصم من warehouse_stock
  const usedWhId = await adjustWarehouseStock(order.warehouseId, variantId, productId, -qty);

  // 2. زامن totalQuantity
  await syncProductQuantityFromWarehouses(variantId, productId);

  // 3. سجّل الحركة دايماً — مع ضمان productId موجود
  const resolvedShipping = await resolveProductIdFromVariant(variantId, productId);
  await recordMovement({
    product: productName ?? "منتج",
    color: order.color,
    size: order.size,
    quantity: qty,
    type: "OUT",
    reason: "to_shipping",
    productId: resolvedShipping.productId,
    variantId: resolvedShipping.variantId,
    warehouseId: usedWhId,
    orderId,
    shipmentId,
    notes: "تحويل لشركة الشحن",
  });
}

/**
 * إرجاع من الشحن للمخزن.
 */
export async function reverseShipping(
  order: {
    variantId?: number | null;
    productId?: number | null;
    product?: string | null;
    color?: string | null;
    size?: string | null;
    warehouseId?: number | null;
  },
  qty: number,
  orderId?: number | null,
  shipmentId?: number | null,
): Promise<void> {
  if (qty <= 0) return;
  // لو الطلب مش مرتبط بمخزن محدد → تخطى عملية المخزون (طلبات قديمة بدون warehouse_id)
  if (!order.warehouseId && !order.variantId && !order.productId) return;
  const { variantId, productId } = await resolveInventoryTarget(order);
  if (!variantId && !productId) return;

  let productName = order.product ?? null;
  if (!productName) {
    if (variantId) {
      const [v] = await db.select({ name: productsTable.name }).from(productVariantsTable)
        .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
        .where(eq(productVariantsTable.id, variantId)).limit(1);
      productName = v?.name ?? "منتج";
    } else if (productId) {
      const [p] = await db.select({ name: productsTable.name }).from(productsTable)
        .where(eq(productsTable.id, productId)).limit(1);
      productName = p?.name ?? "منتج";
    }
  }

  // 1. أرجع لـ warehouse_stock
  const usedWhId = await adjustWarehouseStock(order.warehouseId, variantId, productId, qty);

  // 2. زامن totalQuantity
  await syncProductQuantityFromWarehouses(variantId, productId);

  // 3. سجّل الحركة دايماً
  const resolvedRevShip = await resolveProductIdFromVariant(variantId, productId);
  await recordMovement({
    product: productName ?? "منتج",
    color: order.color,
    size: order.size,
    quantity: qty,
    type: "IN",
    reason: "from_shipping",
    productId: resolvedRevShip.productId,
    variantId: resolvedRevShip.variantId,
    warehouseId: usedWhId,
    orderId,
    shipmentId,
    notes: "إرجاع من شركة الشحن للمخزن",
  });
}

/**
 * تغيير reason الحركة الموجودة (بدون خصم مخزون جديد).
 * يُستخدم لما الأوردر يتحول من to_shipping → sale/partial_sale
 * بدل ما تتعمل حركة جديدة.
 */
export async function updateMovementReason(
  orderId: number,
  oldReason: MovementReason,
  newReason: MovementReason,
  notes?: string | null,
): Promise<boolean> {
  const [movement] = await db
    .select({ id: inventoryMovementsTable.id })
    .from(inventoryMovementsTable)
    .where(
      and(
        eq(inventoryMovementsTable.orderId, orderId),
        eq(inventoryMovementsTable.reason, oldReason),
      )
    )
    .orderBy(inventoryMovementsTable.id)
    .limit(1);

  if (!movement) return false;

  await db
    .update(inventoryMovementsTable)
    .set({
      reason: newReason,
      ...(notes !== undefined ? { notes } : {}),
    })
    .where(eq(inventoryMovementsTable.id, movement.id));

  return true;
}

// Legacy exports
export const RESERVED_STATUSES: string[] = [];

// ═══════════════════════════════════════════════════════════════════════════════
//  SHIPMENT ITEMS — ربط بنود الشحنة (منتجات متعددة) بالمخزون
//
//  يُستخدم من routes/shipments.ts (تعديل مباشر للشحنة) ومن
//  routes/shipment-manifests.ts (تعديل حالة التسليم من جوه "البيان") — نفس
//  الدالة في المكانين عشان السلوك يفضل متطابق دايماً.
//
//  1. خصم تلقائي: كل بند لسه ماخصمش (inventoryDeducted=0) → يُخصم من المخزن.
//     (idempotent — آمن نستدعيها كل مرة، مش بتخصم مرتين لنفس البند)
//  2. لو newStatus === "returned" و returnReceived === true → رجّع كل الكمية لكل بند لسه ما رجعش.
//     (لو returnReceived لسه مش true → البضاعة لسه عند شركة الشحن، مفيش إرجاع للمخزن)
//  3. لو newStatus === "partial_received" و returnReceived === true → رجّع الفرق (الكمية - المستلم)
//     لكل بند حسب itemReceivedQuantities[itemId]، وسجّل receivedQuantity.
//     (نفس المبدأ: لحد ما يتأكد الاستلام فعليًا، الكمية الباقية تفضل عند الشحن)
// ═══════════════════════════════════════════════════════════════════════════════
export async function syncShipmentItemsInventory(
  shipmentId: number,
  newStatus?: string | null,
  itemReceivedQuantities?: Record<number, number>,
  returnReceived?: boolean | null,
): Promise<void> {
  const items = await db
    .select()
    .from(shipmentItemsTable)
    .where(eq(shipmentItemsTable.shipmentId, shipmentId));

  if (items.length === 0) return;

  // ── 1. خصم أولي لأي بند لسه ماخصمش ────────────────────────────────────────
  for (const item of items) {
    if (item.inventoryDeducted) continue;
    if (!item.productId && !item.variantId) continue;
    await processToShipping(
      {
        productId: item.productId,
        variantId: item.variantId,
        product: item.product,
        color: item.color,
        size: item.size,
        warehouseId: item.warehouseId,
      },
      item.quantity,
      null,
      shipmentId,
    );
    await db.update(shipmentItemsTable)
      .set({ inventoryDeducted: 1, updatedAt: new Date() })
      .where(eq(shipmentItemsTable.id, item.id));
  }

  // ── 2. مرتجع كامل → رجّع كل بند لسه ما رجعش — فقط لما يتأكد الاستلام فعليًا (returnReceived === true)
  //     لأن المرتجع لسه عند شركة الشحن لحد ما يتأكد استلامه
  if (newStatus === "returned" && returnReceived === true) {
    for (const item of items) {
      if (item.inventoryReturned) continue;
      if (!item.productId && !item.variantId) continue;
      await reverseShipping(
        {
          productId: item.productId,
          variantId: item.variantId,
          product: item.product,
          color: item.color,
          size: item.size,
          warehouseId: item.warehouseId,
        },
        item.quantity,
        null,
        shipmentId,
      );
      await db.update(shipmentItemsTable)
        .set({ inventoryReturned: 1, receivedQuantity: 0, updatedAt: new Date() })
        .where(eq(shipmentItemsTable.id, item.id));
    }
    return;
  }

  // ── 3. استلام جزئي → رجّع الفرق لكل بند حسب الكمية المستلمة منه
  //     فقط لما يتأكد الاستلام فعليًا (returnReceived === true)، مش بمجرد تسجيل partial_received
  if (newStatus === "partial_received" && returnReceived === true) {
    for (const item of items) {
      if (item.inventoryReturned) continue;
      if (!item.productId && !item.variantId) continue;
      const received = Math.max(0, Number(itemReceivedQuantities?.[item.id] ?? 0));
      const remaining = Math.max(0, item.quantity - received);
      if (remaining > 0) {
        await reverseShipping(
          {
            productId: item.productId,
            variantId: item.variantId,
            product: item.product,
            color: item.color,
            size: item.size,
            warehouseId: item.warehouseId,
          },
          remaining,
          null,
          shipmentId,
        );
      }
      await db.update(shipmentItemsTable)
        .set({ inventoryReturned: 1, receivedQuantity: received, updatedAt: new Date() })
        .where(eq(shipmentItemsTable.id, item.id));
    }
  }
}
