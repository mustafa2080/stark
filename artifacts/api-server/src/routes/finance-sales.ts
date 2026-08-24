import { Router } from "express";
import { db, saleOrdersTable, saleOrderItemsTable, warehousesTable, warehouseStockTable, productVariantsTable, productsTable, cashRegistersTable, cashTransactionsTable } from "@workspace/db";
import { eq, desc, gte, lte, and, sql, inArray } from "drizzle-orm";
import { getTenantId } from "../middlewares/requireTenant.js";
import { adjustWarehouseStock, syncProductQuantityFromWarehouses, recordMovement } from "../lib/inventory.js";

// ── خصم المخزن + مزامنة totalQuantity + تسجيل حركة مخزون ──────────────────
async function deductStock(
  warehouseId: number,
  orderId: number,
  soNumber: string,
  items: { variantId: number | null; productId: number | null; productName: string; color?: string | null; size?: string | null; quantity: number }[]
) {
  for (const item of items) {
    if (!item.variantId && !item.productId) continue;
    await adjustWarehouseStock(warehouseId, item.variantId, item.productId, -item.quantity);
    await syncProductQuantityFromWarehouses(item.variantId, item.productId);
    await recordMovement({
      product:     item.productName,
      color:       item.color   ?? null,
      size:        item.size    ?? null,
      quantity:    item.quantity,
      type:        "OUT",
      reason:      "sale",
      variantId:   item.variantId,
      productId:   item.productId,
      warehouseId: warehouseId,
      orderId:     orderId,
      notes:       `أمر بيع ${soNumber}`,
    });
  }
}

const router = Router();

// ── مساعد توليد رقم SO ──────────────────────────────────────────────────────
async function generateSONumber(tenantId: number | null): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;
  const [last] = await db
    .select({ soNumber: saleOrdersTable.soNumber })
    .from(saleOrdersTable)
    .where(
      and(
        tenantId !== null ? eq(saleOrdersTable.tenantId, tenantId) : sql`1=1`,
        sql`so_number LIKE ${prefix + "%"}`
      )
    )
    .orderBy(desc(saleOrdersTable.id))
    .limit(1);

  let seq = 1;
  if (last?.soNumber) {
    const parts = last.soNumber.split("-");
    seq = (parseInt(parts[parts.length - 1]) || 0) + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// ── مساعد: تحويل مبلغ الفاتورة المغلقة للخزينة ─────────────────────────────
async function transferToTreasury(
  order: typeof saleOrdersTable.$inferSelect,
  tenantId: number | null,
  userId: number | null,
  userName: string | null,
): Promise<void> {
  const amount = Number(order.totalAmount ?? 0) - Number(order.discountAmount ?? 0) + Number(order.shippingCost ?? 0);
  if (amount <= 0) return;

  // ابحث عن الخزنة الرئيسية أو الافتراضية للـ tenant
  const registerConds: any[] = [eq(cashRegistersTable.isActive, true)];
  if (tenantId !== null) registerConds.push(eq(cashRegistersTable.tenantId, tenantId));

  const registers = await db.select().from(cashRegistersTable).where(and(...registerConds));
  const mainRegister = registers.find(r => r.type === "main") ?? registers.find(r => r.isDefault) ?? registers[0];
  if (!mainRegister) return;

  const now           = new Date();
  const balanceBefore = Number(mainRegister.balance ?? 0);
  const balanceAfter  = balanceBefore + amount;

  await db.insert(cashTransactionsTable).values({
    registerId:      mainRegister.id,
    type:            "cash_sale" as any,
    amount:          String(amount),
    balanceBefore:   String(balanceBefore),
    balanceAfter:    String(balanceAfter),
    description:     `إغلاق فاتورة بيع ${order.soNumber} - ${order.clientName}`,
    referenceNumber: order.soNumber,
    transactionDate: now,
    createdByUserId: userId,
    createdByName:   userName,
    createdAt:       now,
  });

  await db.update(cashRegistersTable)
    .set({ balance: String(balanceAfter), updatedAt: now })
    .where(eq(cashRegistersTable.id, mainRegister.id));
}

// ── GET /finance/sale-orders ─────────────────────────────────────────────────
router.get("/finance/sale-orders", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { status, paymentStatus, from, to, search } = req.query;

    const conds: any[] = [];
    if (tenantId !== null) conds.push(eq(saleOrdersTable.tenantId, tenantId));
    if (status && status !== "all") conds.push(eq(saleOrdersTable.status, status as string));
    if (paymentStatus && paymentStatus !== "all") conds.push(eq(saleOrdersTable.paymentStatus, paymentStatus as string));
    if (from) conds.push(gte(saleOrdersTable.createdAt, new Date(from as string)));
    if (to) { const d = new Date(to as string); d.setHours(23,59,59,999); conds.push(lte(saleOrdersTable.createdAt, d)); }
    if (search) {
      const q = `%${search}%`;
      conds.push(sql`(so_number LIKE ${q} OR client_name LIKE ${q} OR client_phone LIKE ${q})`);
    }

    const orders = await db
      .select()
      .from(saleOrdersTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(saleOrdersTable.createdAt));

    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/sale-orders/:id ─────────────────────────────────────────────
router.get("/finance/sale-orders/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);

    const [order] = await db.select().from(saleOrdersTable)
      .where(and(
        eq(saleOrdersTable.id, id),
        tenantId !== null ? eq(saleOrdersTable.tenantId, tenantId) : sql`1=1`
      ));

    if (!order) { res.status(404).json({ error: "غير موجود" }); return; }

    const items = await db.select().from(saleOrderItemsTable)
      .where(eq(saleOrderItemsTable.saleOrderId, id));

    res.json({ ...order, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /finance/sale-orders ─────────────────────────────────────────────────
router.post("/finance/sale-orders", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const {
      clientName, clientPhone, clientAddress,
      warehouseId, status = "draft", paymentStatus = "unpaid",
      paidAmount = 0, discountAmount = 0, shippingCost = 0, taxAmount = 0,
      notes, expectedDate, items = [],
    } = req.body;

    if (!clientName) { res.status(400).json({ error: "اسم العميل مطلوب" }); return; }

    const soNumber = await generateSONumber(tenantId);
    const now = new Date();

    // حساب الإجمالي
    const subTotal = (items as any[]).reduce((s: number, i: any) => s + (i.quantity * i.unitPrice), 0);
    const totalAmount = subTotal + Number(shippingCost) + Number(taxAmount) - Number(discountAmount);

    const [result] = await db.insert(saleOrdersTable).values({
      tenantId, soNumber, clientName,
      clientPhone: clientPhone || null,
      clientAddress: clientAddress || null,
      warehouseId: warehouseId ? parseInt(warehouseId) : null,
      status, paymentStatus,
      totalAmount: String(totalAmount),
      paidAmount:  String(paidAmount),
      discountAmount: String(discountAmount),
      shippingCost: String(shippingCost),
      taxAmount: String(taxAmount),
      notes: notes || null,
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      createdByUserId: (req as any).user?.id ?? null,
      createdByName:   (req as any).user?.name ?? null,
      createdAt: now, updatedAt: now,
    });

    const orderId = (result as any).insertId;

    // إدراج البنود
    if (items.length > 0) {
      await db.insert(saleOrderItemsTable).values(
        (items as any[]).map((item: any) => ({
          saleOrderId:  orderId,
          productId:    item.productId   ? parseInt(item.productId)  : null,
          variantId:    item.variantId   ? parseInt(item.variantId)  : null,
          productName:  item.productName,
          color:        item.color  || null,
          size:         item.size   || null,
          sku:          item.sku    || null,
          quantity:     item.quantity,
          deliveredQty: 0,
          unitPrice:    String(item.unitPrice),
          totalPrice:   String(item.quantity * item.unitPrice),
          notes:        item.notes || null,
        }))
      );
    }

    // ⚠️ حجز المخزن (reservedQuantity) اتشال — عمود reserved_quantity غير موجود
    // في جدول warehouse_stock أصلًا (شوف lib/db/src/schema/warehouse_stock.ts)،
    // فالكود القديم كان هيسقط بـ SQL error أول ما يتنادى. الخصم الفعلي بيحصل
    // تحت في بلوك "خصم فوري من المخزن".

    // لو الفاتورة اتعملت مباشرة بـ delivered أو paymentStatus = paid → خصم فوري من المخزن
    if (
      (status === "delivered" || paymentStatus === "paid") &&
      warehouseId &&
      (items as any[]).length > 0
    ) {
      const wid = parseInt(warehouseId);
      const savedItems = await db.select().from(saleOrderItemsTable)
        .where(eq(saleOrderItemsTable.saleOrderId, orderId));
      await deductStock(wid, orderId, soNumber, savedItems.map(i => ({
        variantId: i.variantId, productId: i.productId,
        productName: i.productName, color: i.color, size: i.size, quantity: i.quantity,
      })));
      for (const item of savedItems) {
        await db.update(saleOrderItemsTable).set({ deliveredQty: item.quantity }).where(eq(saleOrderItemsTable.id, item.id));
      }
    }

    res.json({ id: orderId, soNumber });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /finance/sale-orders/:id/items ──────────────────────────────────────
// إضافة صنف واحد لفاتورة موجودة
router.post("/finance/sale-orders/:id/items", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const orderId  = parseInt(req.params.id);

    // تحقق من وجود الفاتورة
    const [order] = await db.select().from(saleOrdersTable)
      .where(and(
        eq(saleOrdersTable.id, orderId),
        tenantId !== null ? eq(saleOrdersTable.tenantId, tenantId) : sql`1=1`,
      ));
    if (!order) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }

    const { variantId, quantity, unitPrice } = req.body;
    if (!quantity || !unitPrice) {
      res.status(400).json({ error: "الكمية والسعر مطلوبان" }); return;
    }

    // جلب بيانات الـ variant لو موجود
    let productName = req.body.productName ?? "";
    let color       = req.body.color       ?? null;
    let size        = req.body.size        ?? null;
    let productId   = req.body.productId   ? parseInt(req.body.productId) : null;

    if (variantId) {
      const [v] = await db.select().from(productVariantsTable)
        .where(eq(productVariantsTable.id, parseInt(variantId)));
      if (v) {
        color     = v.color    ?? color;
        size      = v.size     ?? size;
        productId = v.productId ?? productId;
        // جلب اسم المنتج من جدول products
        if (v.productId) {
          const [prod] = await db.select({ name: productsTable.name })
            .from(productsTable)
            .where(eq(productsTable.id, v.productId));
          if (prod?.name) productName = prod.name;
        }
      }
    }

    const qty   = Number(quantity);
    const price = Number(unitPrice);

    await db.insert(saleOrderItemsTable).values({
      saleOrderId: orderId,
      productId,
      variantId:   variantId ? parseInt(variantId) : null,
      productName,
      color,
      size,
      sku:         req.body.sku ?? null,
      quantity:    qty,
      deliveredQty: 0,
      unitPrice:   String(price),
      totalPrice:  String(qty * price),
      notes:       req.body.notes ?? null,
    });

    // إعادة حساب إجمالي الفاتورة
    const allItems = await db.select().from(saleOrderItemsTable)
      .where(eq(saleOrderItemsTable.saleOrderId, orderId));
    const sub = allItems.reduce((s, it) => s + it.quantity * Number(it.unitPrice), 0);
    const newTotal = sub
      + Number(order.shippingCost  ?? 0)
      + Number(order.taxAmount     ?? 0)
      - Number(order.discountAmount ?? 0);
    await db.update(saleOrdersTable)
      .set({ totalAmount: String(newTotal), updatedAt: new Date() })
      .where(eq(saleOrdersTable.id, orderId));

    // إرجاع الفاتورة كاملة مع البنود
    const updatedItems = await db.select().from(saleOrderItemsTable)
      .where(eq(saleOrderItemsTable.saleOrderId, orderId));
    const [updatedOrder] = await db.select().from(saleOrdersTable)
      .where(eq(saleOrdersTable.id, orderId));

    res.json({ ...updatedOrder, items: updatedItems });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /finance/sale-orders/:id ───────────────────────────────────────────
router.patch("/finance/sale-orders/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const {
      status, paymentStatus, paidAmount,
      notes, expectedDate, clientName, clientPhone, clientAddress,
      warehouseId, invoiceRef, discountAmount, shippingCost, taxAmount,
      items,
    } = req.body;

    // اجلب الأمر الحالي
    const [current] = await db.select().from(saleOrdersTable)
      .where(and(eq(saleOrdersTable.id, id), tenantId !== null ? eq(saleOrdersTable.tenantId, tenantId) : sql`1=1`));
    if (!current) { res.status(404).json({ error: "غير موجود" }); return; }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status        !== undefined) updates.status        = status;
    if (paymentStatus !== undefined) updates.paymentStatus = paymentStatus;
    if (paidAmount    !== undefined) updates.paidAmount    = String(paidAmount);
    if (notes         !== undefined) updates.notes         = notes;
    if (expectedDate  !== undefined) updates.expectedDate  = expectedDate ? new Date(expectedDate) : null;
    if (clientName    !== undefined) updates.clientName    = clientName;
    if (clientPhone   !== undefined) updates.clientPhone   = clientPhone;
    if (clientAddress !== undefined) updates.clientAddress = clientAddress;
    if (invoiceRef    !== undefined) updates.invoiceRef    = invoiceRef;
    if (discountAmount !== undefined) updates.discountAmount = String(discountAmount);
    if (shippingCost  !== undefined) updates.shippingCost  = String(shippingCost);
    if (taxAmount     !== undefined) updates.taxAmount     = String(taxAmount);

    // إذا أُرسلت بنود جديدة → احذف القديمة وأدرج الجديدة وأعد حساب الإجمالي
    if (Array.isArray(items) && items.length > 0) {
      await db.delete(saleOrderItemsTable).where(eq(saleOrderItemsTable.saleOrderId, id));
      const newItems = items.map((i: any) => ({
        saleOrderId: id,
        productId:   i.productId   ? parseInt(i.productId)   : null,
        variantId:   i.variantId   ? parseInt(i.variantId)   : null,
        productName: i.productName ?? "",
        color:       i.color       ?? null,
        size:        i.size        ?? null,
        sku:         i.sku         ?? null,
        quantity:    Number(i.quantity),
        unitPrice:   String(i.unitPrice),
        totalPrice:  String(Number(i.quantity) * Number(i.unitPrice)),
        subtotal:    String(Number(i.quantity) * Number(i.unitPrice)),
      }));
      await db.insert(saleOrderItemsTable).values(newItems);
      const subTotal = newItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
      const disc = discountAmount !== undefined ? Number(discountAmount) : Number(current.discountAmount ?? 0);
      const ship = shippingCost   !== undefined ? Number(shippingCost)   : Number(current.shippingCost   ?? 0);
      const tax  = taxAmount      !== undefined ? Number(taxAmount)      : Number(current.taxAmount      ?? 0);
      updates.totalAmount = String(subTotal + ship + tax - disc);
    }

    // تسجيل وقت التسليم
    if (status === "delivered" && current.status !== "delivered") {
      updates.deliveredAt = new Date();
    }

    // إغلاق الفاتورة → تحويل للخزينة أوتوماتيك
    if (status === "closed" && current.status !== "closed") {
      const updatedOrder = { ...current, ...updates, totalAmount: updates.totalAmount ?? current.totalAmount };
      const authHeader = (req as any).user;
      const userId   = authHeader?.id   ?? null;
      const userName = authHeader?.name ?? null;
      try {
        await transferToTreasury(updatedOrder as any, tenantId, userId, userName);
      } catch (cashErr) {
        console.error("[sale close] treasury transfer error:", cashErr);
      }
    }

    // ── خصم المخزن عند الدفع ────────────────────────────────────────────────
    const stockAlreadyDeducted = ["delivered", "closed"].includes(current.status);
    if (
      paymentStatus === "paid" &&
      current.paymentStatus !== "paid" &&
      !stockAlreadyDeducted
    ) {
      const orderItems = await db.select().from(saleOrderItemsTable)
        .where(eq(saleOrderItemsTable.saleOrderId, id));
      const wid = warehouseId !== undefined ? (warehouseId ? parseInt(warehouseId) : null) : current.warehouseId;
      if (wid && orderItems.length > 0) {
        await deductStock(wid, id, current.soNumber, orderItems.map(i => ({
          variantId: i.variantId, productId: i.productId,
          productName: i.productName, color: i.color, size: i.size, quantity: i.quantity,
        })));
        for (const item of orderItems) {
          await db.update(saleOrderItemsTable).set({ deliveredQty: item.quantity }).where(eq(saleOrderItemsTable.id, item.id));
        }
      }
      if (!["delivered", "closed"].includes(current.status)) {
        updates.status    = "delivered";
        updates.deliveredAt = new Date();
      }
    }

    // ⚠️ حجز المخزن (reservedQuantity) اتشال — نفس سبب بلوك الإنشاء فوق:
    // العمود غير موجود في warehouse_stock والكود كان هيكسر الـ PATCH.

    // لو الحالة تغيرت إلى delivered → خصم فعلي من المخزن
    if (status === "delivered" && current.status !== "delivered") {
      const orderItems = await db.select().from(saleOrderItemsTable)
        .where(eq(saleOrderItemsTable.saleOrderId, id));
      const wid = warehouseId ? parseInt(warehouseId) : current.warehouseId;
      if (wid && !stockAlreadyDeducted) {
        await deductStock(wid, id, current.soNumber, orderItems.map(i => ({
          variantId: i.variantId, productId: i.productId,
          productName: i.productName, color: i.color, size: i.size, quantity: i.quantity,
        })));
        for (const item of orderItems) {
          await db.update(saleOrderItemsTable).set({ deliveredQty: item.quantity }).where(eq(saleOrderItemsTable.id, item.id));
        }
      }
    }

    await db.update(saleOrdersTable).set(updates).where(eq(saleOrdersTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /finance/sale-orders/:id/items/:itemId ─────────────────────────────
router.patch("/finance/sale-orders/:id/items/:itemId", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const orderId  = parseInt(req.params.id);
    const itemId   = parseInt(req.params.itemId);
    const [order] = await db.select().from(saleOrdersTable).where(and(eq(saleOrdersTable.id, orderId), tenantId !== null ? eq(saleOrdersTable.tenantId, tenantId) : sql`1=1`));
    if (!order) { res.status(404).json({ error: "الأمر غير موجود" }); return; }
    const { productName, color, size, quantity, unitPrice } = req.body;
    const [ci] = await db.select().from(saleOrderItemsTable).where(and(eq(saleOrderItemsTable.id, itemId), eq(saleOrderItemsTable.saleOrderId, orderId)));
    if (!ci) { res.status(404).json({ error: "البند غير موجود" }); return; }
    const newQty   = quantity  !== undefined ? Number(quantity)  : ci.quantity;
    const newPrice = unitPrice !== undefined ? Number(unitPrice) : Number(ci.unitPrice);
    const upd: Record<string, any> = { quantity: newQty, unitPrice: String(newPrice), totalPrice: String(newQty * newPrice) };
    if (productName !== undefined) upd.productName = productName;
    if (color !== undefined) upd.color = color || null;
    if (size  !== undefined) upd.size  = size  || null;
    await db.update(saleOrderItemsTable).set(upd).where(and(eq(saleOrderItemsTable.id, itemId), eq(saleOrderItemsTable.saleOrderId, orderId)));
    const allItems = await db.select().from(saleOrderItemsTable).where(eq(saleOrderItemsTable.saleOrderId, orderId));
    const sub = allItems.reduce((s, it) => s + it.quantity * Number(it.unitPrice), 0);
    await db.update(saleOrdersTable).set({ totalAmount: String(sub + Number(order.shippingCost??0) + Number(order.taxAmount??0) - Number(order.discountAmount??0)), updatedAt: new Date() }).where(eq(saleOrdersTable.id, orderId));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /finance/sale-orders/:id/items/:itemId ────────────────────────────
router.delete("/finance/sale-orders/:id/items/:itemId", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const orderId  = parseInt(req.params.id);
    const itemId   = parseInt(req.params.itemId);
    const [order] = await db.select().from(saleOrdersTable).where(and(eq(saleOrdersTable.id, orderId), tenantId !== null ? eq(saleOrdersTable.tenantId, tenantId) : sql`1=1`));
    if (!order) { res.status(404).json({ error: "الأمر غير موجود" }); return; }
    await db.delete(saleOrderItemsTable).where(and(eq(saleOrderItemsTable.id, itemId), eq(saleOrderItemsTable.saleOrderId, orderId)));
    const rem = await db.select().from(saleOrderItemsTable).where(eq(saleOrderItemsTable.saleOrderId, orderId));
    const sub = rem.reduce((s, it) => s + it.quantity * Number(it.unitPrice), 0);
    await db.update(saleOrdersTable).set({ totalAmount: String(sub + Number(order.shippingCost??0) + Number(order.taxAmount??0) - Number(order.discountAmount??0)), updatedAt: new Date() }).where(eq(saleOrdersTable.id, orderId));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /finance/sale-orders/:id ──────────────────────────────────────────
router.delete("/finance/sale-orders/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);

    const [order] = await db.select({ status: saleOrdersTable.status })
      .from(saleOrdersTable)
      .where(and(eq(saleOrdersTable.id, id), tenantId !== null ? eq(saleOrdersTable.tenantId, tenantId) : sql`1=1`));

    if (!order) { res.status(404).json({ error: "غير موجود" }); return; }
    if (["delivered", "closed"].includes(order.status)) {
      res.status(400).json({ error: "لا يمكن حذف أمر مُسلَّم أو مُغلَق" }); return;
    }

    await db.delete(saleOrdersTable).where(eq(saleOrdersTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
