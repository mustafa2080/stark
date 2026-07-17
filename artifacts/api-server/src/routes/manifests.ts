import { Router, type IRouter } from "express";
import { eq, desc, and, inArray, or, sql, count, isNull } from "drizzle-orm";
import {
  db,
  shippingManifestsTable,
  shippingManifestOrdersTable,
  shippingCompaniesTable,
  ordersTable,
  inventoryMovementsTable,
  shippingFinancialInvoicesTable,
  cashRegistersTable,
  cashTransactionsTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireRole";
import {
  processToShipping,
  reverseShipping,
  reverseDelivery,
  resolveInventoryTarget,
  recordMovement,
  resolveProductIdFromVariant,
  adjustWarehouseStock,
  syncProductQuantityFromWarehouses,
} from "../lib/inventory";

const router: IRouter = Router();
router.use(requireAuth);

const CreateManifestSchema = z.object({
  shippingCompanyId: z.number().int().positive(),
  orderIds: z.array(z.number().int().positive()).min(1),
  notes: z.string().nullish(),
});

async function expandOrderIdsByInvoice(orderIds: number[]) {
  const seedOrders = await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds));
  if (seedOrders.length === 0) return [];
  const invoiceNumbers = Array.from(new Set(
    seedOrders.map((o) => o.invoiceNumber?.trim()).filter((n): n is string => Boolean(n))
  ));
  const soloIds = seedOrders.filter((o) => !o.invoiceNumber?.trim()).map((o) => o.id);
  const expandedOrders = invoiceNumbers.length > 0
    ? await db.select().from(ordersTable).where(and(isNull(ordersTable.deletedAt), inArray(ordersTable.invoiceNumber, invoiceNumbers)))
    : [];
  const allIds = new Set<number>([...soloIds, ...expandedOrders.map((o) => o.id)]);
  return Array.from(allIds);
}

async function generateManifestNumber(companyId: number): Promise<string> {
  const [row] = await db.select({ cnt: count() }).from(shippingManifestsTable)
    .where(eq(shippingManifestsTable.shippingCompanyId, companyId));
  const seq = (Number(row?.cnt ?? 0) + 1).toString().padStart(3, "0");
  return `MNF-${companyId}-${seq}`;
}

// ─── إنشاء فاتورة مالية تلقائية عند قفل البيان + تحويل للخزنة ───────────────
async function createFinancialInvoiceOnClose(
  manifest: typeof shippingManifestsTable.$inferSelect,
  allOrders: (typeof ordersTable.$inferSelect & { deliveryStatus: string; partialQuantity?: number | null })[],
  userId: number | null,
  userName: string | null,
): Promise<void> {
  const now = new Date();

  // ── حساب إحصائيات البيان ──────────────────────────────────────────────────
  const totalOrders = allOrders.length;
  const delivered   = allOrders.filter(o => o.deliveryStatus === "delivered").length;
  const returned    = allOrders.filter(o => o.deliveryStatus === "returned").length;
  // partial_received: عدد مستقل (لا delivered ولا returned)

  let grossRevenue = 0;
  let shippingFees = 0;
  let returnFees   = 0;

  for (const o of allOrders) {
    const isPartial = o.deliveryStatus === "partial_received";
    const shipping  = Number(o.shippingCost ?? 0);

    if (o.deliveryStatus === "delivered") {
      // تسليم كامل → إيراد كامل + تكلفة شحن كاملة
      grossRevenue += Number(o.totalPrice);
      shippingFees += shipping;
    } else if (isPartial) {
      // rv = 0  → البيان الأول: إيراد على القطع اللي اتستلمت فعلاً
      // rv = null → بيان مرحّل: القطعة لسه عند الشحن → إيراد صفر تماماً
      if (Number((o as any).returnReceived) === 0) {
        const deliveredQty = o.partialQuantity != null ? Number(o.partialQuantity) : 0;
        if (deliveredQty > 0) {
          grossRevenue += Number((o as any).unitPrice ?? 0) * deliveredQty;
          shippingFees += shipping;
        }
      }
    } else if (o.deliveryStatus === "returned") {
      // مرتجع كامل → خسارة تكلفة الشحن فقط
      returnFees += shipping;
    }
  }

  // لو في manualShippingCost على البيان → استخدمه كـ shippingFees
  if (manifest.manualShippingCost != null) {
    shippingFees = Number(manifest.manualShippingCost);
  }

  const netDue = grossRevenue - shippingFees - returnFees;

  // رقم الفاتورة = FIN-{manifestNumber}
  const invoiceNumber = `FIN-${manifest.manifestNumber}`;

  // إنشاء الفاتورة المالية
  const [insertResult] = await db.insert(shippingFinancialInvoicesTable).values({
    invoiceNumber,
    shippingCompanyId: manifest.shippingCompanyId,
    manifestId: manifest.id,
    totalOrders,
    deliveredOrders: delivered,
    returnedOrders:  returned,
    grossRevenue: String(grossRevenue),
    shippingFees:  String(shippingFees),
    returnFees:    String(returnFees),
    netDue:        String(netDue > 0 ? netDue : 0),
    paidAmount:    "0",
    status: "pending",
    notes: manifest.notes ?? null,
    invoiceDate: now,
    dueDate: null,
    createdByUserId: userId,
    createdByName:   userName,
    createdAt: now,
    updatedAt: now,
  });

  const newInvoiceId = (insertResult as any).insertId ?? (insertResult as any)[0]?.insertId;
  if (!newInvoiceId || netDue <= 0) return;

  // ── تحويل صافي المستحق للخزنة الرئيسية لو موجودة ──────────────────────────
  const [mainRegister] = await db
    .select()
    .from(cashRegistersTable)
    .where(and(eq(cashRegistersTable.type, "main"), eq(cashRegistersTable.isActive, true)))
    .limit(1);

  if (!mainRegister) {
    // مفيش خزنة رئيسية → نسجل في الفاتورة إنها في انتظار الخزنة (status يفضل pending)
    return;
  }

  // إيداع في الخزنة الرئيسية
  const balanceBefore = Number(mainRegister.balance ?? 0);
  const balanceAfter  = balanceBefore + netDue;
  const [company] = await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId));

  await db.insert(cashTransactionsTable).values({
    registerId:       mainRegister.id,
    type:             "shipping_transfer" as any,
    amount:           String(netDue),
    balanceBefore:    String(balanceBefore),
    balanceAfter:     String(balanceAfter),
    description:      `تحصيل بيان شحن ${manifest.manifestNumber} - ${company?.name ?? ""}`,
    referenceNumber:  invoiceNumber,
    transactionDate:  now,
    createdByUserId:  userId,
    createdByName:    userName,
    createdAt:        now,
  });

  await db.update(cashRegistersTable)
    .set({ balance: String(balanceAfter), updatedAt: now })
    .where(eq(cashRegistersTable.id, mainRegister.id));

  // تحديث الفاتورة لـ paid
  await db.update(shippingFinancialInvoicesTable)
    .set({ status: "paid", paidAmount: String(netDue), paidAt: now, updatedAt: now })
    .where(eq(shippingFinancialInvoicesTable.id, newInvoiceId));
}

type OrderWithDelivery = typeof ordersTable.$inferSelect & {
  deliveryStatus: string;
  deliveryNote: string | null;
  deliveredAt: Date | null;
  manifestOrderId: number;
  addedAt?: Date | null;
};

function computeStats(orders: OrderWithDelivery[]) {
  const groupMap = new Map<string, OrderWithDelivery[]>();
  for (const order of orders) {
    const key = order.invoiceNumber?.trim() || `solo-${order.id}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(order);
  }
  const groupedOrders = Array.from(groupMap.values());
  // الإحصائيات تُحسب على مستوى الفواتير/الطلبات (مش المنتجات الفردية)
  // كل فاتورة = طلب واحد، حالتها = حالة أسوأ منتج فيها
  function groupStatus(group: OrderWithDelivery[]): string {
    // أولوية الحالات: returned > postponed > partial_received > pending > delivered
    const priority: Record<string, number> = { returned: 5, postponed: 4, partial_received: 3, pending: 2, delivered: 1 };
    return group.reduce((worst, o) => {
      return (priority[o.deliveryStatus] ?? 0) > (priority[worst] ?? 0) ? o.deliveryStatus : worst;
    }, group[0].deliveryStatus);
  }
  const total     = groupedOrders.length;
  const delivered = groupedOrders.filter((g) => groupStatus(g) === "delivered").length;
  const returned  = groupedOrders.filter((g) => groupStatus(g) === "returned").length;
  // partial_received: يُعدّ منفصلاً (لا delivered ولا returned)
  const partial   = groupedOrders.filter((g) => groupStatus(g) === "partial_received").length;
  const postponed = groupedOrders.filter((g) => groupStatus(g) === "postponed").length;
  const pending   = groupedOrders.filter((g) => groupStatus(g) === "pending").length;
  const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;
  let totalRevenue = 0, totalCost = 0, totalShippingCost = 0, returnLosses = 0, deliveredGross = 0;
  let stillAtShippingCount = 0, stillAtShippingAmount = 0;

  // حساب stillAtShipping على مستوى الفواتير (مش الطلبات الفردية)
  // المبلغ المتوقع = المؤجل فقط (لأن المرتجع والجزئي بيرجعوا مخزن مش فلوس)
  // العداد (count) = المؤجل فقط كمان — الجزئي والمرتجع مش "لسه عند الشحن" بمعنى فلوس
  for (const group of groupedOrders) {
    const gStatus = groupStatus(group);
    if (gStatus === "postponed") {
      stillAtShippingCount++;
      stillAtShippingAmount += group.reduce((sum, o) => sum + o.totalPrice, 0);
    }
    // pending بيتعد بس بدون مبلغ (مش واضح وضعه بعد)
    else if (gStatus === "pending") {
      stillAtShippingCount++;
    }
    // partial_received و returned → بيرجعوا مخزن — مش "لسه عند الشحن"
  }

  for (const o of orders) {
    const isPartial  = o.deliveryStatus === "partial_received";
    const shipping   = o.shippingCost ?? 0;
    const rv         = (o as any).returnReceived;

    if (o.deliveryStatus === "delivered") {
      // تسليم كامل → إيراد كامل
      totalRevenue += o.totalPrice; totalCost += (o.costPrice ?? 0) * o.quantity;
      totalShippingCost += shipping; deliveredGross += o.totalPrice;

    } else if (isPartial) {
      // rv = 0  → البيان الأول: المستخدم سجّل استلام جزئي → إيراد على القطع اللي اتستلمت
      // rv = null → بيان مرحّل: القطعة لسه عند الشحن → إيراد صفر
      if (rv === 0) {
        const deliveredQty = o.partialQuantity != null ? Number(o.partialQuantity) : 0;
        if (deliveredQty > 0) {
          const revenue = Number((o as any).unitPrice ?? 0) * deliveredQty;
          totalRevenue += revenue; deliveredGross += revenue;
          totalCost += (o.costPrice ?? 0) * deliveredQty;
          totalShippingCost += shipping;
        }
      }
      // الجزء الباقي (أو كله لو مرحّل) — محسوب بالفعل في loop الفواتير

    } else if (o.deliveryStatus === "returned") {
      // مرتجع كامل → خسارة شحن فقط — المرتجع مش "لسه عند الشحن"
      totalShippingCost += shipping;

    } else {
      // مؤجل / pending → محسوب بالفعل في loop الفواتير
      totalShippingCost += shipping;
    }
  }
  const actuallyDeliveredShipping = orders
    .filter(o => o.deliveryStatus === "delivered" || o.deliveryStatus === "partial_received")
    .reduce((sum, o) => sum + (o.shippingCost ?? 0), 0);
  const dueFromCompany = deliveredGross - actuallyDeliveredShipping;
  return {
    total, delivered, returned, partial, pending, postponed, deliveryRate,
    totalRevenue, totalCost, totalShippingCost, returnLosses,
    netProfit: totalRevenue - totalCost - totalShippingCost,
    deliveredGross, dueFromCompany, stillAtShippingCount, stillAtShippingAmount, actuallyDeliveredShipping,
  };
}

// ─── Helper: بناء orderRef من طلب ────────────────────────────────────────────
function buildOrderRef(order: typeof ordersTable.$inferSelect) {
  return {
    variantId:   order.variantId,
    productId:   order.productId,
    product:     order.product,
    color:       order.color,
    size:        order.size,
    warehouseId: order.warehouseId,
  };
}

// ─── List manifests ───────────────────────────────────────────────────────────

router.get("/shipping-manifests", async (req, res): Promise<void> => {
  const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
  const manifests = await db.select({ manifest: shippingManifestsTable, company: shippingCompaniesTable })
    .from(shippingManifestsTable)
    .leftJoin(shippingCompaniesTable, eq(shippingManifestsTable.shippingCompanyId, shippingCompaniesTable.id))
    .where(companyId ? eq(shippingManifestsTable.shippingCompanyId, companyId) : undefined)
    .orderBy(desc(shippingManifestsTable.createdAt));
  const manifestIds = manifests.map((m) => m.manifest.id);
  if (manifestIds.length === 0) { res.json([]); return; }
  const allLinks = await db
    .select({
      manifestId: shippingManifestOrdersTable.manifestId,
      orderId: shippingManifestOrdersTable.orderId,
      deliveryStatus: shippingManifestOrdersTable.deliveryStatus,
    })
    .from(shippingManifestOrdersTable)
    .where(inArray(shippingManifestOrdersTable.manifestId, manifestIds));

  // جيب invoiceNumber لكل orderId محتاجينه
  const allOrderIds = allLinks.map(l => l.orderId);
  const allOrdersData = allOrderIds.length > 0
    ? await db.select({ id: ordersTable.id, invoiceNumber: ordersTable.invoiceNumber })
        .from(ordersTable)
        .where(inArray(ordersTable.id, allOrderIds))
    : [];
  const invoiceMap = new Map(allOrdersData.map(o => [o.id, o.invoiceNumber?.trim() || null]));

  // بناء map: manifestId → { orderId → deliveryStatus }
  const manifestLinkMap: Record<number, { orderId: number; deliveryStatus: string }[]> = {};
  for (const link of allLinks) {
    if (!manifestLinkMap[link.manifestId]) manifestLinkMap[link.manifestId] = [];
    manifestLinkMap[link.manifestId].push({ orderId: link.orderId, deliveryStatus: link.deliveryStatus });
  }

  // عدّ الفواتير الفريدة لكل بيان + عدّ المؤجل والمرتجع على مستوى الفواتير
  const countMap: Record<number, number> = {};
  const postponedMap: Record<number, number> = {};
  const returnedMap: Record<number, number> = {};
  const pendingMap: Record<number, number> = {};
  const partialMap: Record<number, number> = {};
  for (const [manifestIdStr, links] of Object.entries(manifestLinkMap)) {
    const manifestId = Number(manifestIdStr);
    // Map: invoiceKey → worst status (لو فاتورة فيها مؤجل وغيره → مؤجل)
    const invoiceStatusMap = new Map<string, string>();
    const statusPriority: Record<string, number> = { returned: 5, postponed: 4, delayed: 4, pending: 3, partial_received: 2, delivered: 1 };
    for (const link of links) {
      const inv = invoiceMap.get(link.orderId);
      const key = inv ? inv : `solo-${link.orderId}`;
      const existing = invoiceStatusMap.get(key);
      const existingPriority = existing ? (statusPriority[existing] ?? 0) : 0;
      const newPriority = statusPriority[link.deliveryStatus] ?? 0;
      if (newPriority > existingPriority) invoiceStatusMap.set(key, link.deliveryStatus);
    }
    countMap[manifestId] = invoiceStatusMap.size;
    let postponed = 0, returned = 0, pending = 0, partial = 0;
    for (const status of invoiceStatusMap.values()) {
      if (status === "postponed" || status === "delayed") postponed++;
      if (status === "returned") returned++;
      if (status === "pending") pending++;
      if (status === "partial_received") partial++;
    }
    postponedMap[manifestId] = postponed;
    returnedMap[manifestId] = returned;
    (pendingMap as Record<number, number>)[manifestId] = pending;
    (partialMap as Record<number, number>)[manifestId] = partial;
  }

  res.json(manifests.map((m) => ({
    ...m.manifest, invoicePrice: m.manifest.invoicePrice ? Number(m.manifest.invoicePrice) : null,
    companyName: m.company?.name ?? "غير محدد", orderCount: countMap[m.manifest.id] ?? 0,
    postponedCount: postponedMap[m.manifest.id] ?? 0,
    returnedCount: returnedMap[m.manifest.id] ?? 0,
    pendingCount: pendingMap[m.manifest.id] ?? 0,
    partialCount: partialMap[m.manifest.id] ?? 0,
  })));
});

// ─── Create manifest ──────────────────────────────────────────────────────────
// عند إنشاء البيان → processToShipping لكل طلب (خصم من المخزن + حركة to_shipping)

router.post("/shipping-manifests", async (req, res): Promise<void> => {
  const parsed = CreateManifestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { shippingCompanyId, orderIds, notes } = parsed.data;
  const normalizedOrderIds = await expandOrderIdsByInvoice(orderIds);
  const company = await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, shippingCompanyId)).then((r) => r[0]);
  if (!company) { res.status(404).json({ error: "شركة الشحن غير موجودة" }); return; }
  const manifestNumber = await generateManifestNumber(shippingCompanyId);
  const insertResult = await db.insert(shippingManifestsTable).values({ manifestNumber, shippingCompanyId, notes: notes ?? null, status: "open", createdAt: new Date() });
  const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
  const [manifest] = await db.select().from(shippingManifestsTable).where(eq(shippingManifestsTable.id, insertId));
  await db.insert(shippingManifestOrdersTable).values(normalizedOrderIds.map((orderId) => ({ manifestId: manifest.id, orderId, deliveryStatus: "pending", addedAt: new Date() })));

  // خصم من المخزن + حركة to_shipping
  // القاعدة: أوردرات من نفس الفاتورة بنفس المنتج (variantId/productId) → حركة واحدة مجمّعة
  const ordersToShip = await db.select().from(ordersTable).where(inArray(ordersTable.id, normalizedOrderIds));

  // ── Step 1: جمّع الأوردرات in_shipping (نقل من بيان سابق) ──────────────
  for (const order of ordersToShip.filter(o => o.status === "in_shipping")) {
    const [existingMov] = await db
      .select({ id: inventoryMovementsTable.id })
      .from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.orderId, order.id))
      .orderBy(desc(inventoryMovementsTable.id))
      .limit(1)
      .catch(() => []);
    if (existingMov) {
      await db.update(inventoryMovementsTable)
        .set({ reason: "to_shipping" as any, notes: "تحويل لشركة الشحن (نُقل من بيان سابق)" })
        .where(eq(inventoryMovementsTable.id, existingMov.id))
        .catch(() => {});
    } else {
      const ref = buildOrderRef(order);
      const { variantId, productId } = await resolveInventoryTarget(ref);
      if (variantId || productId) {
        const resolved = await resolveProductIdFromVariant(variantId, productId);
        await recordMovement({
          product: order.product ?? "منتج",
          color: order.color,
          size: order.size,
          quantity: order.quantity,
          type: "OUT",
          reason: "to_shipping",
          productId: resolved.productId,
          variantId: resolved.variantId,
          warehouseId: order.warehouseId,
          orderId: order.id,
          notes: "تحويل لشركة الشحن (نُقل من بيان سابق)",
        });
      }
    }
  }

  // ── Step 2: warehouse_ready و pending → اجمع الكميات لنفس المنتج في حركة واحدة ──
  const newOrders = ordersToShip.filter(o => o.status !== "in_shipping");

  // اجمع الأوردرات by (variantId أو productId) + warehouseId
  type GroupKey = string;
  const groupMap = new Map<GroupKey, { orders: typeof newOrders; variantId: number | null; productId: number | null; warehouseId: number | null; product: string; color: string | null; size: string | null }>();

  for (const order of newOrders) {
    const ref = buildOrderRef(order);
    const { variantId, productId } = await resolveInventoryTarget(ref);
    const key: GroupKey = `${variantId ?? "p" + productId}_${order.warehouseId ?? 0}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { orders: [], variantId, productId, warehouseId: order.warehouseId ?? null, product: order.product ?? "منتج", color: order.color ?? null, size: order.size ?? null });
    }
    groupMap.get(key)!.orders.push(order);
  }

  for (const group of groupMap.values()) {
    const totalQtyGroup = group.orders.reduce((s, o) => s + o.quantity, 0);
    if (totalQtyGroup <= 0) continue;

    // خصم المخزون مرة واحدة بالكمية المجمّعة (يمنع الخصم المكرر)
    const usedWhId = await adjustWarehouseStock(group.warehouseId, group.variantId, group.productId, -totalQtyGroup);
    await syncProductQuantityFromWarehouses(group.variantId, group.productId);

    const resolved = await resolveProductIdFromVariant(group.variantId, group.productId);

    if (group.orders.length === 1) {
      // أوردر واحد → حركة واحدة عادية
      await recordMovement({
        product: group.product,
        color: group.color,
        size: group.size,
        quantity: totalQtyGroup,
        type: "OUT",
        reason: "to_shipping",
        productId: resolved.productId,
        variantId: resolved.variantId,
        warehouseId: usedWhId,
        orderId: group.orders[0].id,
        notes: "تحويل لشركة الشحن",
      });
    } else {
      // أوردرات متعددة من نفس المنتج → حركة واحدة في صفحة حركات المخزون
      // لكن نسجل orderId لكل أوردر عشان يقدر كل أوردر يلاقي حركته عند تحديث التوصيل
      // الحل: نسجل حركة بكمية 0 لكل أوردر بعد الأول (للربط) + حركة واحدة بالكمية الكلية للأول
      const groupNote = `تحويل لشركة الشحن — مجموعة ${group.orders.length} طلبات (${group.orders.map(o => "#" + o.id).join(", ")})`;
      // حركة رئيسية بالكمية الكاملة — مرتبطة بأول أوردر
      await recordMovement({
        product: group.product,
        color: group.color,
        size: group.size,
        quantity: totalQtyGroup,
        type: "OUT",
        reason: "to_shipping",
        productId: resolved.productId,
        variantId: resolved.variantId,
        warehouseId: usedWhId,
        orderId: group.orders[0].id,
        notes: groupNote,
      });
      // حركات مرجعية بكمية 0 لكل أوردر تاني — عشان لما نحدث حالة التوصيل نلاقي الحركة
      for (let i = 1; i < group.orders.length; i++) {
        await recordMovement({
          product: group.product,
          color: group.color,
          size: group.size,
          quantity: 0,
          type: "OUT",
          reason: "to_shipping",
          productId: resolved.productId,
          variantId: resolved.variantId,
          warehouseId: usedWhId,
          orderId: group.orders[i].id,
          notes: `مرجع — مجمّع مع طلب #${group.orders[0].id}`,
        });
      }
    }
  }
  await db.update(ordersTable).set({ status: "in_shipping", shippingCompanyId }).where(inArray(ordersTable.id, normalizedOrderIds));
  res.status(201).json({ ...manifest, invoicePrice: null, companyName: company.name, orderCount: normalizedOrderIds.length });
});

// ─── Get manifest ─────────────────────────────────────────────────────────────

router.get("/shipping-manifests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [row] = await db.select({ manifest: shippingManifestsTable, company: shippingCompaniesTable })
    .from(shippingManifestsTable)
    .leftJoin(shippingCompaniesTable, eq(shippingManifestsTable.shippingCompanyId, shippingCompaniesTable.id))
    .where(eq(shippingManifestsTable.id, id));
  if (!row) { res.status(404).json({ error: "البيان غير موجود" }); return; }
  const links = await db.select().from(shippingManifestOrdersTable).where(eq(shippingManifestOrdersTable.manifestId, id));
  const orderIds = links.map((l) => l.orderId);
  let orders: OrderWithDelivery[] = [];
  if (orderIds.length > 0) {
    // جيب الأوردرات المضافة في البيان فقط — بدون expand عشان ما يجيبش أوردرات بـ pending مش في البيان
    const rawOrders = await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds)).orderBy(desc(ordersTable.createdAt));
    const linkMap = new Map(links.map((l) => [l.orderId, l]));
    orders = rawOrders.map((o) => {
      const link = linkMap.get(o.id);
      if (!link) return { ...o, deliveryStatus: "pending", deliveryNote: null, deliveredAt: null, manifestOrderId: 0 };
      const _rrNum = link.returnReceived == null ? null : Number(link.returnReceived);
      // إذا الـ link حالته pending لكن الـ order نفسه partial_received → نعرضه partial_received
      const _deliveryStatus = (link.deliveryStatus === "pending" && o.status === "partial_received")
        ? "partial_received"
        : link.deliveryStatus;
      // كمان لو الـ link نفسه partial_received بس partialQuantity = null → نجيب من ordersTable
      const _pq = (link as any).partialQuantity != null
        ? Number((link as any).partialQuantity)
        : (_deliveryStatus === "partial_received" && o.partialQuantity != null ? Number(o.partialQuantity) : null);
      return { ...o, deliveryStatus: _deliveryStatus, deliveryNote: link.deliveryNote, deliveredAt: link.deliveredAt, partialQuantity: _pq, manifestOrderId: link.id, returnReceived: _rrNum, addedAt: link.addedAt };
    });
  }
  res.json({ ...row.manifest, invoicePrice: row.manifest.invoicePrice ? Number(row.manifest.invoicePrice) : null, manualShippingCost: row.manifest.manualShippingCost ? Number(row.manifest.manualShippingCost) : null, companyName: row.company?.name ?? "غير محدد", companyPhone: row.company?.phone ?? null, companyLogo: row.company?.logo ?? null, orders, stats: computeStats(orders) });
});

// ─── Update manifest (PATCH) ──────────────────────────────────────────────────

router.patch("/shipping-manifests/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const Schema = z.object({ status: z.enum(["open", "closed"]).optional(), notes: z.string().nullish(), invoicePrice: z.number().nonnegative().nullish(), invoiceNotes: z.string().nullish(), manualShippingCost: z.number().nonnegative().nullish() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes ?? null;
  if (parsed.data.invoicePrice !== undefined) updateData.invoicePrice = parsed.data.invoicePrice != null ? String(parsed.data.invoicePrice) : null;
  if (parsed.data.invoiceNotes !== undefined) updateData.invoiceNotes = parsed.data.invoiceNotes ?? null;
  if (parsed.data.manualShippingCost !== undefined) updateData.manualShippingCost = parsed.data.manualShippingCost != null ? String(parsed.data.manualShippingCost) : null;
  if (parsed.data.status === "closed") updateData.closedAt = new Date();
  if (parsed.data.status === "open") updateData.closedAt = null;
  if (Object.keys(updateData).length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
  await db.update(shippingManifestsTable).set(updateData).where(eq(shippingManifestsTable.id, id));
  const [updated] = await db.select().from(shippingManifestsTable).where(eq(shippingManifestsTable.id, id));
  if (!updated) { res.status(404).json({ error: "البيان غير موجود" }); return; }

  let rolledOverManifest: any = null;

  if (parsed.data.status === "closed") {
    // الطلبات اللي "مازال في شركة الشحن" = pending/postponed/in_shipping + returned/partial بدون returnReceived
    const pendingLinks = await db.select().from(shippingManifestOrdersTable).where(
      and(
        eq(shippingManifestOrdersTable.manifestId, id),
        or(
          inArray(shippingManifestOrdersTable.deliveryStatus, ["postponed", "pending", "in_shipping"]),
          and(eq(shippingManifestOrdersTable.deliveryStatus, "returned"), or(sql`${shippingManifestOrdersTable.returnReceived} = 0`, isNull(shippingManifestOrdersTable.returnReceived))),
          and(eq(shippingManifestOrdersTable.deliveryStatus, "partial_received"), or(sql`${shippingManifestOrdersTable.returnReceived} = 0`, isNull(shippingManifestOrdersTable.returnReceived)))
        )
      )
    );

    console.log(`[CLOSE manifest ${id}] pendingLinks count=${pendingLinks.length}`, JSON.stringify(pendingLinks.map(l => ({ orderId: l.orderId, deliveryStatus: l.deliveryStatus, returnReceived: l.returnReceived, partialQuantity: l.partialQuantity }))));

    if (pendingLinks.length > 0) {
      // جيب كل الطلبات مرة واحدة في البداية عشان نستخدمها في كل العمليات
      const allPendingIds = pendingLinks.map((l) => l.orderId);
      const pendingOrders = await db.select().from(ordersTable).where(inArray(ordersTable.id, allPendingIds));

      // ── الطلبات اللي لسه عند شركة الشحن (pending/postponed/in_shipping) ────────
      // كانت خرجت بـ to_shipping → نرجعها بـ from_shipping + نرجع حالتها لـ pending
      const stillAtShippingLinks = pendingLinks.filter(
        (l) => l.deliveryStatus === "pending" || l.deliveryStatus === "postponed" || l.deliveryStatus === "in_shipping"
      );
      for (const link of stillAtShippingLinks) {
        const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, link.orderId));
        if (!order) continue;
        // أرجع الكمية الكاملة للمخزن + سجل from_shipping
        await reverseShipping(buildOrderRef(order), order.quantity, order.id);
      }

      // ── الطلبات الجزئية (partial_received) بدون returnReceived ──────────────
      // الجزء المتبقي (لم يستلم) لسه عند شركة الشحن → نرجعه للمخزن
      const partialWithoutReturn = pendingLinks.filter((l) => l.deliveryStatus === "partial_received");
      for (const link of partialWithoutReturn) {
        const order = pendingOrders.find(o => o.id === link.orderId);
        if (!order) continue;
        // الكمية اللي اتستلمت = link.partialQuantity (دايماً من الـ link مش ordersTable)
        // لأن ordersTable.partialQuantity ممكن يكون اتغير في بيانات سابقة
        const deliveredQty = link.partialQuantity != null ? Number(link.partialQuantity) : 0;
        const remainingQty = order.quantity - deliveredQty;
        // الجزء الباقي كان عند شركة الشحن → أرجعه للمخزن
        if (remainingQty > 0) await reverseShipping(buildOrderRef(order), remainingQty, order.id);
      }

      // ── رحّل كل الطلبات لبيان جديد ───────────────────────────────────────────
      const newManifestNumber = await generateManifestNumber(updated.shippingCompanyId);
      const insertResult = await db.insert(shippingManifestsTable).values({
        manifestNumber: newManifestNumber, shippingCompanyId: updated.shippingCompanyId,
        notes: `مُرحَّل من البيان ${updated.manifestNumber}`, status: "open", createdAt: new Date(),
      });
      const newId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
      const [newManifest] = await db.select().from(shippingManifestsTable).where(eq(shippingManifestsTable.id, newId));

      // الطلبات في البيان الجديد: المؤجل يفضل مؤجل، المرتجع يفضل مرتجع، الباقي pending
      await db.insert(shippingManifestOrdersTable).values(
        pendingLinks.map((link) => {
          const isDelayed   = link.deliveryStatus === "postponed" || link.deliveryStatus === "delayed";
          const isReturned  = link.deliveryStatus === "returned";
          const isPartial   = link.deliveryStatus === "partial_received";
          // partial_received المُرحَّل بيبقى "returned" (مرتجع لم يتم الاستلام) في البيان الجديد
          // بنفس منطق returned العادي — عشان يتفلتر ماليًا (صفر) لحد ما يتحدد مصيره فعليًا
          const newStatus   = isDelayed ? link.deliveryStatus : (isReturned || isPartial) ? "returned" : "pending";
          const newNote     = isDelayed || isReturned || isPartial ? link.deliveryNote : null;
          // partial: نحسب الكمية الباقية عند شركة الشحن = quantity - partialQuantity
          // هنحتاج order.quantity — هنجيبه من pendingOrders
          const pOrder = pendingOrders.find(o => o.id === link.orderId);
          const deliveredQty = isPartial && link.partialQuantity != null ? Number(link.partialQuantity) : 0;
          const remainingQty = isPartial && pOrder ? (pOrder.quantity - deliveredQty) : null;
          return {
            manifestId: newManifest.id,
            orderId: link.orderId,
            deliveryStatus: newStatus as any,
            deliveryNote: newNote,
            deliveredAt: null,
            // في البيان الجديد: partialQuantity = الكمية الباقية عند الشحن (مش اللي اتستلمت)
            partialQuantity: isPartial ? (remainingQty != null && remainingQty > 0 ? remainingQty : null) : null,
            // returnReceived = null دايمًا للمُرحَّل الجديد (لسه معلّق) — سواء كان returned أو partial أصلًا
            returnReceived: (isReturned || isPartial) ? link.returnReceived ?? null : null,
            addedAt: new Date(),
          };
        })
      );

      console.log(`[CLOSE manifest ${id}] new manifest ${newManifest.id} inserted links:`, JSON.stringify(pendingLinks.map(l => { const isPartial = l.deliveryStatus === "partial_received"; const newStatus = (l.deliveryStatus === "postponed" || l.deliveryStatus === "delayed") ? l.deliveryStatus : (l.deliveryStatus === "returned" || isPartial) ? "returned" : "pending"; return { orderId: l.orderId, newStatus, partialQuantity: isPartial ? l.partialQuantity : null }; })));

      // ── جيب الطلبات وأضفها للبيان الجديد بدون خصم مخزون إضافي ─────────────
      // المخزون اتخصم بالفعل لما الطلبات دخلت البيان الأول
      // نعمل to_shipping جديدة في السجل بس (بدون تعديل المخزون = skipWarehouseStock=true)

      // ── الطلبات المرحّلة: لما ترجعت للمخزن عبر reverseShipping ──
      // processToShipping هتخصمها تاني وتسجل to_shipping في البيان الجديد
      // الطلبات المرتجعة (returned) والـ partial_received (بقت returned برضو) لا تحتاج to_shipping
      const returnedIdsForShipping = new Set(
        pendingLinks
          .filter((l) => l.deliveryStatus === "returned" || l.deliveryStatus === "partial_received")
          .map((l) => l.orderId)
      );
      for (const order of pendingOrders) {
        if (!returnedIdsForShipping.has(order.id)) {
          await processToShipping(buildOrderRef(order), order.quantity, order.id);
        }
      }

      // تحديث الطلبات: المرتجعة (وpartial_received المُحوَّل لمرتجع) تفضل "returned"، الباقي يبقى "in_shipping"
      const partialIds = pendingLinks.filter((l) => l.deliveryStatus === "partial_received").map((l) => l.orderId);
      const originallyReturnedIds = pendingLinks
        .filter((l) => l.deliveryStatus === "returned")
        .map((l) => l.orderId);
      // partial_received بقت returned برضو في البيان الجديد
      const returnedIds = [...originallyReturnedIds, ...partialIds];
      const nonReturnedIds = allPendingIds.filter((id) => !returnedIds.includes(id));

      if (nonReturnedIds.length > 0) {
        await db.update(ordersTable)
          .set({ status: "in_shipping", shippingCompanyId: updated.shippingCompanyId, partialQuantity: null })
          .where(inArray(ordersTable.id, nonReturnedIds));
      }
      if (returnedIds.length > 0) {
        await db.update(ordersTable)
          .set({ status: "returned", shippingCompanyId: updated.shippingCompanyId, partialQuantity: null })
          .where(inArray(ordersTable.id, returnedIds));
      }

      rolledOverManifest = {
        ...newManifest, orderCount: pendingLinks.length,
        postponedCount: pendingLinks.filter((l) => l.deliveryStatus === "postponed").length,
        pendingCount: pendingLinks.filter((l) => l.deliveryStatus === "pending" || l.deliveryStatus === "in_shipping").length,
        returnedInShippingCount: pendingLinks.filter((l) => l.deliveryStatus === "returned").length,
        partialInShippingCount: pendingLinks.filter((l) => l.deliveryStatus === "partial_received").length,
      };
    }
  }

  // ── إنشاء فاتورة مالية تلقائية عند قفل البيان ─────────────────────────────
  if (parsed.data.status === "closed") {
    try {
      // جيب كل طلبات البيان مع حالة التسليم
      const allLinks = await db.select().from(shippingManifestOrdersTable)
        .where(eq(shippingManifestOrdersTable.manifestId, id));
      const allOrderIds = allLinks.map(l => l.orderId);
      if (allOrderIds.length > 0) {
        const allManifestOrders = await db.select().from(ordersTable)
          .where(inArray(ordersTable.id, allOrderIds));
        // دمج deliveryStatus من links
        const enriched = allManifestOrders.map(o => ({
          ...o,
          deliveryStatus: allLinks.find(l => l.orderId === o.id)?.deliveryStatus ?? "pending",
          partialQuantity: allLinks.find(l => l.orderId === o.id)?.partialQuantity ?? null,
        }));
        const userId   = (req as any).user?.id ?? null;
        const userName = (req as any).user?.name ?? null;
        await createFinancialInvoiceOnClose(updated, enriched, userId, userName);
      }
    } catch (invoiceErr) {
      // لو فيه error في إنشاء الفاتورة → نلوغ بس ومش نوقف الـ response
      console.error("[manifest close] error creating financial invoice:", invoiceErr);
    }
  }

  res.json({ ...updated, invoicePrice: updated.invoicePrice ? Number(updated.invoicePrice) : null, rolledOverManifest });
  } catch (err: any) {
    console.error("[PATCH shipping-manifests] error:", err);
    res.status(500).json({ error: err?.message ?? "حدث خطأ أثناء تحديث البيان" });
  }
});

// ─── Delete manifest ──────────────────────────────────────────────────────────
// عند حذف البيان → reverseShipping لكل طلب كان لسه في الشحن

router.delete("/shipping-manifests/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [manifest] = await db.select().from(shippingManifestsTable).where(eq(shippingManifestsTable.id, id));
  if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }

  const links = await db.select().from(shippingManifestOrdersTable)
    .where(eq(shippingManifestOrdersTable.manifestId, id));

  if (links.length > 0) {
    const orderIds = links.map((l) => l.orderId);
    const orders = await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds));
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    for (const link of links) {
      const order = orderMap.get(link.orderId);
      if (!order) continue;
      const ref = buildOrderRef(order);
      const deliveredQty  = link.partialQuantity ?? order.partialQuantity ?? 0;
      const remainingQty  = order.quantity - deliveredQty;

      try {
        if (link.deliveryStatus === "delivered") {
          await reverseDelivery(ref, order.quantity, order.id);
        } else if (link.deliveryStatus === "partial_received") {
          if (deliveredQty > 0) await reverseDelivery(ref, deliveredQty, order.id);
          if (remainingQty > 0) await reverseShipping(ref, remainingQty, order.id);
        } else if (link.deliveryStatus === "returned") {
          if (Number(link.returnReceived) !== 1) {
            await reverseShipping(ref, order.quantity, order.id);
          }
        } else {
          await reverseShipping(ref, order.quantity, order.id);
        }
      } catch (inventoryErr) {
        console.error(`[DELETE manifest ${id}] inventory error for order ${order.id}:`, inventoryErr);
        // نكمل الحذف حتى لو في error في المخزون
      }
    }

    await db.update(ordersTable)
      .set({ status: "pending", shippingCompanyId: null })
      .where(inArray(ordersTable.id, orderIds));
  }

  await db.delete(shippingManifestOrdersTable).where(eq(shippingManifestOrdersTable.manifestId, id));
  // حذف الفواتير المالية المرتبطة بالبيان أولاً (foreign key constraint)
  await db.delete(shippingFinancialInvoicesTable).where(eq(shippingFinancialInvoicesTable.manifestId, id));
  await db.delete(shippingManifestsTable).where(eq(shippingManifestsTable.id, id));
  res.status(204).send();
  } catch (err: any) {
    console.error("[DELETE shipping-manifests] error:", err);
    res.status(500).json({ error: err?.message ?? "حدث خطأ أثناء حذف البيان" });
  }
});

// ─── Remove order from manifest ───────────────────────────────────────────────
// عند إزالة طلب من البيان → reverseShipping (أرجع للمخزن)

router.delete("/shipping-manifests/:id/orders/:orderId", async (req, res): Promise<void> => {
  const manifestId = parseInt(req.params.id);
  const orderId    = parseInt(req.params.orderId);
  if (isNaN(manifestId) || isNaN(orderId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [link] = await db.select().from(shippingManifestOrdersTable)
    .where(and(eq(shippingManifestOrdersTable.manifestId, manifestId), eq(shippingManifestOrdersTable.orderId, orderId)));
  if (!link) { res.status(404).json({ error: "الطلب غير موجود في هذا البيان" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (order) {
    const ref = buildOrderRef(order);
    const deliveredQty = link.partialQuantity ?? order.partialQuantity ?? 0;
    const remainingQty = order.quantity - deliveredQty;

    if (link.deliveryStatus === "delivered") {
      await reverseDelivery(ref, order.quantity, order.id);
    } else if (link.deliveryStatus === "partial_received") {
      if (deliveredQty > 0) await reverseDelivery(ref, deliveredQty, order.id);
      if (remainingQty > 0) await reverseShipping(ref, remainingQty, order.id);
    } else if (link.deliveryStatus === "returned") {
      if (Number(link.returnReceived) !== 1) await reverseShipping(ref, order.quantity, order.id);
    } else {
      // pending/postponed/in_shipping → عند شركة الشحن → أرجع للمخزن
      await reverseShipping(ref, order.quantity, order.id);
    }
  }

  await db.delete(shippingManifestOrdersTable)
    .where(and(eq(shippingManifestOrdersTable.manifestId, manifestId), eq(shippingManifestOrdersTable.orderId, orderId)));
  await db.update(ordersTable)
    .set({ status: "pending", shippingCompanyId: null })
    .where(eq(ordersTable.id, orderId));

  res.json({ success: true, orderId, message: "تم إزالة الطلب من البيان" });
});

// ─── Add orders to manifest ───────────────────────────────────────────────────
// عند إضافة طلبات → processToShipping (خصم من المخزن + حركة to_shipping)

router.post("/shipping-manifests/:id/orders", async (req, res): Promise<void> => {
  const manifestId = parseInt(req.params.id);
  if (isNaN(manifestId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [manifest] = await db.select().from(shippingManifestsTable).where(eq(shippingManifestsTable.id, manifestId));
  if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }

  const { orderIds } = req.body as { orderIds: number[] };
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    res.status(400).json({ error: "يجب إرسال قائمة orderIds" }); return;
  }

  const normalizedOrderIds = await expandOrderIdsByInvoice(orderIds);
  const existing = await db.select({ orderId: shippingManifestOrdersTable.orderId })
    .from(shippingManifestOrdersTable).where(eq(shippingManifestOrdersTable.manifestId, manifestId));
  const existingIds = new Set(existing.map((e) => e.orderId));
  const newIds = normalizedOrderIds.filter((id) => !existingIds.has(id));

  if (newIds.length > 0) {
    await db.insert(shippingManifestOrdersTable).values(
      newIds.map((orderId) => ({ manifestId, orderId, deliveryStatus: "pending", addedAt: new Date() }))
    );
    // خصم من المخزن + حركة to_shipping لكل طلب جديد
    const newOrders = await db.select().from(ordersTable).where(inArray(ordersTable.id, newIds));
    for (const order of newOrders) {
      await processToShipping(buildOrderRef(order), order.quantity, order.id);
    }
    await db.update(ordersTable)
      .set({ status: "in_shipping", shippingCompanyId: manifest.shippingCompanyId })
      .where(inArray(ordersTable.id, newIds));
  }

  res.json({ added: newIds.length, manifestNumber: manifest.manifestNumber });
});

// ─── Update order delivery status in manifest ─────────────────────────────────
/**
 * منطق المخزون الكامل:
 *
 * FLOW الطبيعي:
 *   إنشاء البيان       → processToShipping  (OUT → to_shipping)   [كمية كاملة خرجت المخزن]
 *   تم الاستلام        → processDelivery    (OUT → sale)           [skip=true: الكمية مخرجة بالفعل]
 *   استلام جزئي        → processDelivery    (OUT → partial_sale)   [skip=true: الجزء المستلم]
 *   مرتجع وصل المخزن  → reverseShipping    (IN  → from_shipping)  [الجزء الباقي عند شركة الشحن]
 *                      + processReturn      (IN  → return)         [الجزء المستلم مسبقاً لو موجود]
 *   مازال في الشحن     → لا تغيير (الكمية خرجت بالفعل بـ to_shipping)
 */

const DeliveryStatusSchema = z.object({
  deliveryStatus: z.enum(["pending", "delivered", "postponed", "partial_received", "returned", "delayed"]),
  deliveryNote: z.string().nullish(),
  partialQuantity: z.union([z.number().int().min(0), z.string().transform(v => { const n = parseInt(v); return isNaN(n) ? null : n; })]).nullish(),
  partialReturnReceived: z.boolean().nullish(),
  returnReceived: z.boolean().nullish(),
  returnReason: z.string().nullish(),
});

const STATUS_MAP: Record<string, string> = {
  delivered: "received", postponed: "delayed", partial_received: "partial_received",
  returned: "returned", pending: "in_shipping", delayed: "delayed",
};

router.patch("/shipping-manifests/:id/orders/:orderId", async (req, res): Promise<void> => {
  const manifestId = parseInt(req.params.id), orderId = parseInt(req.params.orderId);
  if (isNaN(manifestId) || isNaN(orderId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = DeliveryStatusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { deliveryStatus, deliveryNote, partialQuantity, returnReceived, partialReturnReceived, returnReason } = parsed.data;

  const [link] = await db.select().from(shippingManifestOrdersTable)
    .where(and(eq(shippingManifestOrdersTable.manifestId, manifestId), eq(shippingManifestOrdersTable.orderId, orderId)));
  if (!link) { res.status(404).json({ error: "الطلب غير موجود في هذا البيان" }); return; }

  const [existingOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!existingOrder) { res.status(404).json({ error: "الطلب غير موجود" }); return; }

  const oldDeliveryStatus = link.deliveryStatus;
  const oldReturnReceived = link.returnReceived;
  const isDelivered       = deliveryStatus === "delivered" || deliveryStatus === "partial_received";

  const ref      = buildOrderRef(existingOrder);
  const totalQty = existingOrder.quantity;
  const oldPartialQty = link.partialQuantity ?? existingOrder.partialQuantity ?? 0;

  // ─── منطق المخزون ─────────────────────────────────────────────────────────
  /**
   * تذكر: لما الطلب يدخل البيان → processToShipping أخد الكمية كلها من المخزن
   * يعني الكمية الكاملة موجودة عند شركة الشحن
   *
   * القاعدة الجديدة: حركة واحدة فقط per order
   *   إنشاء البيان → to_shipping (خرجت المخزن مرة واحدة)
   *   أي تغيير حالة بعد كده → غيّر reason نفس الحركة فقط
   *     pending/postponed  → to_shipping   (لسه عند الشحن)
   *     delivered          → sale          (تم الاستلام)
   *     partial_received   → partial_sale  (استلام جزئي)
   *     returned           → from_shipping (مرتجع وصل المخزن)
   *                          أو to_shipping (مرتجع لسه في الشحن)
   */

  const parsedPartialQty = (partialQuantity != null && partialQuantity !== undefined && !isNaN(Number(partialQuantity))) ? Number(partialQuantity) : null;

  // لو partial_received وبدون كمية → خطأ صريح
  if (deliveryStatus === "partial_received" && parsedPartialQty === null) {
    res.status(400).json({ error: "يجب إدخال الكمية المستلمة للتسليم الجزئي" }); return;
  }
  // لو الكمية المستلمة أكبر من كمية الطلب → خطأ صريح
  if (deliveryStatus === "partial_received" && parsedPartialQty !== null && parsedPartialQty > existingOrder.quantity) {
    res.status(400).json({ error: `الكمية المستلمة (${parsedPartialQty}) لا يمكن أن تتجاوز كمية الطلب (${existingOrder.quantity})` }); return;
  }
  const oldPartialQtyNum = link.partialQuantity != null ? Number(link.partialQuantity) : null;

  // حساب القيمة القديمة لـ partialReturnReceived بشكل صريح
  const oldPartialReturnReceivedBool = link.returnReceived == null ? null : Number(link.returnReceived) === 1 ? true : false;

  // لو partial_received بكمية 0 وباقي عند الشحن → نعامله كـ pending (مش partial فعلاً)
  // ده بيحصل للأوردرات الـ siblings في الفاتورة المتعددة
  const effectiveDeliveryStatus = (deliveryStatus === "partial_received" && parsedPartialQty === 0 && partialReturnReceived === false)
    ? "pending"
    : deliveryStatus;

  const noChange = effectiveDeliveryStatus === oldDeliveryStatus &&
    // returned: لو returnReceived لم يتغير
    (effectiveDeliveryStatus !== "returned" || returnReceived === null || (Number(oldReturnReceived) === 1) === returnReceived) &&
    // partial_received: الكمية لم تتغير
    (effectiveDeliveryStatus !== "partial_received" || parsedPartialQty === oldPartialQtyNum) &&
    // partial_received: returnReceived لم يتغير
    (effectiveDeliveryStatus !== "partial_received" || partialReturnReceived === oldPartialReturnReceivedBool);

  console.log(`[PATCH order ${orderId}] parsedPartialQty=${parsedPartialQty} oldPartialQtyNum=${oldPartialQtyNum} noChange=${noChange}`);

  if (!noChange) {
    const { resolveInventoryTarget, adjustWarehouseStock, syncProductQuantityFromWarehouses, recordMovement } = await import("../lib/inventory.js");
    const { variantId: vid, productId: pid } = await resolveInventoryTarget(ref);

    // ── احذف كل الحركات القديمة للأوردر ده — سنسجل حركة واحدة جديدة صح ──────
    await db.delete(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.orderId, orderId));

    // ── تحديد نوع وكمية الحركة الجديدة بناءً على الحالة ─────────────────────
    // المنطق الأساسي: حركة واحدة فقط لكل أوردر تعبّر عن وضعه الحالي
    //
    // pending / postponed / returned(في الشحن) → OUT/to_shipping   (-totalQty)  [الكمية عند شركة الشحن]
    // delivered                                 → OUT/sale          (-totalQty)  [تم البيع]
    // partial_received + الباقي في الشحن        → OUT/to_shipping   (-totalQty)  [الكل عند الشحن، جزء استُلم فقط للتسجيل]
    // partial_received + الباقي رجع المخزن      → IN/from_shipping  (+remaining) [الجزء الراجع دخل المخزن]
    // returned + وصل المخزن                     → IN/from_shipping  (+totalQty)  [كل الكمية رجعت]

    let movType: "IN" | "OUT";
    let movReason: string;
    let movQty: number;
    let movNotes: string;

    if (deliveryStatus === "partial_received") {
      const newPartialQty = parsedPartialQty!;
      const newReturnBool = partialReturnReceived ?? false;
      const remainingQty  = totalQty - newPartialQty;

      if (newReturnBool && remainingQty > 0) {
        // الجزء الراجع دخل المخزن → IN
        movType   = "IN";
        movReason = "from_shipping";
        movQty    = remainingQty;
        movNotes  = `استلام جزئي — ${newPartialQty} قطعة مُسلَّمة، ${remainingQty} قطعة رجعت المخزن`;
      } else if (newReturnBool && remainingQty === 0) {
        // كل الكمية اتستلمت، مفيش باقي → بيع كامل
        movType   = "OUT";
        movReason = "sale";
        movQty    = totalQty;
        movNotes  = `استلام كامل — ${totalQty} قطعة مُسلَّمة`;
      } else {
        // الباقي لسه في الشحن → OUT/to_shipping بالكمية الكاملة
        movType   = "OUT";
        movReason = "to_shipping";
        movQty    = totalQty;
        movNotes  = `استلام جزئي — ${newPartialQty} من ${totalQty} (الباقي عند الشحن)`;
      }

      // تعديل المخزون:
      const prevStatus     = oldDeliveryStatus;
      const prevPartialQty = oldPartialQtyNum ?? 0;
      const prevReturnBool = oldPartialReturnReceivedBool;
      const prevInStock    = prevStatus === "partial_received" && prevReturnBool === true
        ? (totalQty - prevPartialQty) : 0;
      const newInStock     = (newReturnBool && remainingQty > 0) ? remainingQty : 0;
      const stockAdjust    = newInStock - prevInStock;
      if ((vid || pid) && stockAdjust !== 0) {
        await adjustWarehouseStock(ref.warehouseId, vid, pid, stockAdjust);
        await syncProductQuantityFromWarehouses(vid, pid);
      }

    } else if (deliveryStatus === "returned" && returnReceived === true) {
      // مرتجع وصل المخزن → IN بالكمية الكاملة دايماً
      const wasPartial        = oldDeliveryStatus === "partial_received";
      const prevPartialQty    = link.partialQuantity != null ? Number(link.partialQuantity) : 0;
      const prevReturnBool    = oldPartialReturnReceivedBool; // هل الباقي كان في المخزن؟

      // الكمية اللي لازم ترجع المخزن دلوقتي:
      // - لو partial + الباقي في المخزن: الجزء المستلم فقط (الباقي أصلاً في المخزن)
      // - لو partial + الباقي في الشحن: الكمية الكاملة
      // - لو مش partial: الكمية الكاملة
      let qtyToAddNow: number;
      if (wasPartial && prevReturnBool === true) {
        // الباقي (totalQty - prevPartialQty) أصلاً في المخزن
        // اللي لازم نضيفه = الجزء المستلم (prevPartialQty) فقط
        qtyToAddNow = prevPartialQty;
      } else if (wasPartial && prevReturnBool === false) {
        // الباقي كان في الشحن → كل الكمية ترجع
        qtyToAddNow = totalQty;
      } else {
        // مش partial → كل الكمية ترجع
        qtyToAddNow = totalQty;
      }

      movType   = "IN";
      movReason = "from_shipping";
      movQty    = totalQty; // الحركة تسجل الكمية الكاملة للوضوح
      movNotes  = wasPartial
        ? `مرتجع كامل — ${prevPartialQty} قطعة كانت مستلمة + ${totalQty - prevPartialQty} قطعة رجعت للمخزن`
        : "مرتجع — وصل المخزن من شركة الشحن";

      if ((vid || pid) && qtyToAddNow > 0) {
        await adjustWarehouseStock(ref.warehouseId, vid, pid, +qtyToAddNow);
        await syncProductQuantityFromWarehouses(vid, pid);
      }

    } else {
      // pending / postponed / returned(في الشحن) / delivered
      movType   = "OUT";
      movQty    = totalQty;

      if (deliveryStatus === "delivered") {
        movReason = "sale";
        movNotes  = "تم الاستلام — بيع";
      } else if (deliveryStatus === "returned") {
        movReason = "to_shipping";
        movNotes  = "مرتجع — لسه عند شركة الشحن";
      } else {
        movReason = "to_shipping";
        movNotes  = deliveryStatus === "postponed" ? "مؤجل — عند شركة الشحن" : "قيد الانتظار — عند شركة الشحن";
      }

      // لو كنا في partial+returnTrue → الباقي كان في المخزن، نخصمه
      if (oldDeliveryStatus === "partial_received" && oldPartialReturnReceivedBool === true && (vid || pid)) {
        const oldRemaining = totalQty - (oldPartialQtyNum ?? 0);
        if (oldRemaining > 0) {
          await adjustWarehouseStock(ref.warehouseId, vid, pid, -oldRemaining);
          await syncProductQuantityFromWarehouses(vid, pid);
        }
      }
      // لو كنا في returned+وصل المخزن → نخصم ما أضفناه
      if (oldDeliveryStatus === "returned" && Number(oldReturnReceived) === 1 && (vid || pid)) {
        await adjustWarehouseStock(ref.warehouseId, vid, pid, -totalQty);
        await syncProductQuantityFromWarehouses(vid, pid);
      }
    }

    // سجّل الحركة الواحدة
    if ((vid || pid) && movQty > 0) {
      const resolved = await resolveProductIdFromVariant(vid, pid);
      await recordMovement({
        type: movType, reason: movReason as any, quantity: movQty,
        warehouseId: ref.warehouseId, variantId: resolved.variantId, productId: resolved.productId,
        product: ref.product, color: ref.color, size: ref.size, orderId, notes: movNotes,
      });
    }
  } // end if (!noChange)

  // ─── تحديث جدول البيان ────────────────────────────────────────────────────
  await db.update(shippingManifestOrdersTable).set({
    deliveryStatus,
    deliveryNote: deliveryNote ?? null,
    partialQuantity: deliveryStatus === "partial_received" && parsedPartialQty != null ? parsedPartialQty : null,
    deliveredAt: isDelivered ? new Date() : null,
    ...(deliveryStatus === "partial_received" ? { returnReceived: (partialReturnReceived ?? false) ? 1 : 0 } : {}),
    ...(deliveryStatus === "returned" && returnReceived != null
      ? { returnReceived: returnReceived ? 1 : 0 }
      : deliveryStatus !== "returned" && deliveryStatus !== "partial_received"
        ? { returnReceived: null }
        : {}),
  }).where(eq(shippingManifestOrdersTable.id, link.id));

  // ─── تحديث جدول الطلبات ───────────────────────────────────────────────────
  // القاعدة: لو الطلب كان "returned" أو "partial_received" في البيان القديم
  // ونجي بـ "pending" → نحافظ على الحالة الأصلية في ordersTable
  // (pending في سياق البيان ≠ إعادة للانتظار، يعني لسه عند شركة الشحن)
  const protectedStatuses = ["returned", "partial_received"];
  const isDowngradeToInShipping = protectedStatuses.includes(oldDeliveryStatus) && deliveryStatus === "pending";
  const newOrderStatus = isDowngradeToInShipping
    ? (STATUS_MAP[oldDeliveryStatus] ?? "in_shipping")
    : (STATUS_MAP[deliveryStatus] ?? "in_shipping");
  const orderUpdate: Record<string, unknown> = { status: newOrderStatus };
  if (deliveryStatus === "partial_received" && parsedPartialQty != null) orderUpdate.partialQuantity = parsedPartialQty;
  if (deliveryStatus === "partial_received") orderUpdate.returnReceived = (partialReturnReceived ?? false) ? 1 : 0;
  if (deliveryStatus === "returned" && returnReceived != null) orderUpdate.returnReceived = returnReceived ? 1 : 0;
  else if (deliveryStatus !== "returned" && deliveryStatus !== "partial_received") orderUpdate.returnReceived = null;
  // حفظ سبب الإرجاع في جدول الطلبات
  if (deliveryStatus === "returned") orderUpdate.returnReason = returnReason ?? null;
  await db.update(ordersTable).set(orderUpdate).where(eq(ordersTable.id, orderId));

  // ─── فواتير متعددة (siblings): لا نحدث الـ siblings خالص ──
  // الـ frontend بيعمل PATCH منفصل لكل أوردر في الفاتورة المتعددة
  // تحديث الـ siblings كان بيسبب override غلط على الحالات المختلفة
  if (false && existingOrder.invoiceNumber?.trim()) {
    const siblings = await db.select({ mo: shippingManifestOrdersTable, o: ordersTable })
      .from(shippingManifestOrdersTable)
      .innerJoin(ordersTable, eq(shippingManifestOrdersTable.orderId, ordersTable.id))
      .where(and(
        eq(shippingManifestOrdersTable.manifestId, manifestId),
        eq(ordersTable.invoiceNumber, existingOrder.invoiceNumber.trim())
      ));

    for (const sib of siblings) {
      if (sib.mo.orderId === orderId) continue;

      // غيّر reason آخر حركة مخزون للـ sibling (نفس منطق الطلب الرئيسي)
      if (!noChange) {
        const sibRef = buildOrderRef(sib.o);

        if (deliveryStatus === "returned" && returnReceived === true && Number(sib.mo.returnReceived) !== 1) {
          const { resolveInventoryTarget, adjustWarehouseStock, syncProductQuantityFromWarehouses } = await import("../lib/inventory.js");
          const { variantId: sv, productId: sp } = await resolveInventoryTarget(sibRef);
          if (sv || sp) {
            await adjustWarehouseStock(sibRef.warehouseId, sv, sp, +sib.o.quantity);
            await syncProductQuantityFromWarehouses(sv, sp);
          }
          const [sibToShipMov] = await db
            .select({ id: inventoryMovementsTable.id })
            .from(inventoryMovementsTable)
            .where(and(
              eq(inventoryMovementsTable.orderId, sib.mo.orderId),
              eq(inventoryMovementsTable.reason, "to_shipping" as any),
            ))
            .orderBy(desc(inventoryMovementsTable.id))
            .limit(1);
          if (sibToShipMov) {
            await db.update(inventoryMovementsTable)
              .set({ type: "IN", reason: "from_shipping" as any, notes: "مرتجع — وصل المخزن من شركة الشحن" })
              .where(eq(inventoryMovementsTable.id, sibToShipMov.id));
          }
        } else {
          let sibReason: string;
          let sibNotes: string;

          if (deliveryStatus === "delivered") {
            sibReason = "sale"; sibNotes = "تم الاستلام — بيع";
          } else if (deliveryStatus === "partial_received") {
            sibReason = "partial_sale";
            const sibSafeQty = (sib.mo.partialQuantity != null && sib.mo.partialQuantity > 0) ? sib.mo.partialQuantity : (partialQuantity != null && partialQuantity > 0 ? partialQuantity : null);
            sibNotes = sibSafeQty != null ? `استلام جزئي — ${sibSafeQty} قطعة` : "استلام جزئي";
          } else if (deliveryStatus === "returned") {
            sibReason = "to_shipping";
            sibNotes = "مرتجع — لسه عند شركة الشحن";
          } else {
            sibReason = "to_shipping";
            sibNotes = deliveryStatus === "postponed" ? "مؤجل — عند شركة الشحن" : "قيد الانتظار — عند شركة الشحن";
          }

          const [sibLastMov] = await db
            .select({ id: inventoryMovementsTable.id, type: inventoryMovementsTable.type })
            .from(inventoryMovementsTable)
            .where(eq(inventoryMovementsTable.orderId, sib.mo.orderId))
            .orderBy(desc(inventoryMovementsTable.id))
            .limit(1);

          // لو الحركة الحالية IN وبنرجعها OUT → نخصم من المخازن والمخزون
          if (sibLastMov?.type === "IN") {
            const { resolveInventoryTarget, adjustWarehouseStock, syncProductQuantityFromWarehouses } = await import("../lib/inventory.js");
            const { variantId: sv2, productId: sp2 } = await resolveInventoryTarget(sibRef);
            if (sv2 || sp2) {
              await adjustWarehouseStock(sibRef.warehouseId, sv2, sp2, -sib.o.quantity);
              await syncProductQuantityFromWarehouses(sv2, sp2);
            }
          }

          if (sibLastMov) {
            await db
              .update(inventoryMovementsTable)
              .set({ type: "OUT", reason: sibReason as any, notes: sibNotes })
              .where(eq(inventoryMovementsTable.id, sibLastMov.id));
          } else {
            // مفيش حركة → سجّل جديدة وخصم من المخازن (حالة استثنائية)
            const { resolveInventoryTarget, adjustWarehouseStock, syncProductQuantityFromWarehouses, recordMovement } = await import("../lib/inventory.js");
            const { variantId: sv2, productId: sp2 } = await resolveInventoryTarget(sibRef);
            if (sv2 || sp2) {
              await adjustWarehouseStock(sibRef.warehouseId, sv2, sp2, -sib.o.quantity);
              await syncProductQuantityFromWarehouses(sv2, sp2);
              await recordMovement({
                type: "OUT",
                reason: sibReason as any,
                quantity: sib.o.quantity,
                warehouseId: sibRef.warehouseId,
                variantId: sv2,
                productId: sp2,
                product: sibRef.product,
                color: sibRef.color,
                size: sibRef.size,
                orderId: sib.mo.orderId,
                notes: sibNotes,
              });
            }
          }
        }
      }

      const su: Record<string, unknown> = { deliveryStatus, deliveryNote: deliveryNote ?? null, deliveredAt: isDelivered ? new Date() : null };
      // لا نحدث partialQuantity للـ siblings — كل طلب بيتبعت بكميته الخاصة في call منفصل
      // لما partial_received: لا نحدث الـ sibling بنفس الحالة — كل أوردر له call مستقل من الـ frontend
      if (deliveryStatus === "partial_received") {
        // skip — الـ frontend بيعمل PATCH منفصل لكل أوردر في الفاتورة المتعددة
        continue;
      }
      if (deliveryStatus === "returned" && returnReceived != null) su.returnReceived = returnReceived ? 1 : 0;
      else if (deliveryStatus !== "returned" && deliveryStatus !== "partial_received") su.returnReceived = null;
      await db.update(shippingManifestOrdersTable).set(su).where(eq(shippingManifestOrdersTable.id, sib.mo.id));

      const sou: Record<string, unknown> = { status: STATUS_MAP[deliveryStatus] ?? "in_shipping" };
      // لا نحدث partialQuantity للـ siblings — كل طلب بيتبعت بكميته الخاصة في call منفصل
      if (deliveryStatus === "returned" && returnReceived != null) sou.returnReceived = returnReceived ? 1 : 0;
      else if (deliveryStatus === "partial_received" && partialReturnReceived != null) sou.returnReceived = partialReturnReceived ? 1 : 0;
      else if (deliveryStatus !== "returned" && deliveryStatus !== "partial_received") sou.returnReceived = null;
      await db.update(ordersTable).set(sou).where(eq(ordersTable.id, sib.mo.orderId));
    }
  }

  res.json({ success: true, deliveryStatus, deliveryNote: deliveryNote ?? null, returnReceived: returnReceived ?? null });
});

export default router;
