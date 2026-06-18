import { Router, type IRouter } from "express";
import { db, ordersTable, productsTable, productVariantsTable, shippingCompaniesTable, shippingManifestsTable, shippingManifestOrdersTable, warehouseStockTable, shipmentsTable } from "@workspace/db";
import { eq, isNull, and, desc, lte, gte, sql, inArray, count } from "drizzle-orm";
import { requireAdmin, requirePermission } from "../middlewares/requireRole.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getTenantId } from "../middlewares/requireTenant.js";

// ── In-memory cache for heavy analytics endpoints ─────────────────────────────
const analyticsCache = new Map<string, { data: any; expiresAt: number }>();
function getCached<T>(key: string): T | null {
  const entry = analyticsCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data as T;
  analyticsCache.delete(key);
  return null;
}
function setCached(key: string, data: any, ttlMs = 30 * 60 * 1000) {
  analyticsCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
// ظٹظڈظ†ط§ط¯ظ‰ ط¹ظ„ظٹظ‡ط§ ظ…ظ† orders route ط¹ظ†ط¯ ط£ظٹ طھط؛ظٹظٹط± ظپظٹ ط­ط§ظ„ط© ط§ظ„ط·ظ„ط¨ط§طھ
export function invalidateChartsCache(tenantId: number | null) {
  const key = `charts:${tenantId ?? "global"}`;
  analyticsCache.delete(key);
}

export function invalidateSmartCache(tenantId: number | null) {
  // امسح كل الـ keys اللي فيها smart-insights أو analytics-profit أو analytics-alerts
  for (const key of analyticsCache.keys()) {
    if (key.startsWith(`smart-insights:${tenantId ?? "global"}`) ||
        key.startsWith(`analytics-profit:${tenantId ?? "global"}`) ||
        key.startsWith(`analytics-alerts:${tenantId ?? "global"}`)) {
      analyticsCache.delete(key);
    }
  }
}

const router: IRouter = Router();

// ── Tenant-safe helpers ────────────────────────────────────────────────────────
async function getProductsForTenant(tenantId: number | null) {
  return tenantId !== null
    ? db.select().from(productsTable).where(eq(productsTable.tenantId, tenantId))
    : db.select().from(productsTable);
}
async function getVariantsForTenant(tenantId: number | null) {
  if (tenantId !== null) {
    // الـ variants مفيهاش tenantId مباشرة — نجيبها عن طريق الـ products التابعة للـ tenant
    const tenantProducts = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.tenantId, tenantId));
    const productIds = tenantProducts.map(p => p.id);
    if (productIds.length === 0) return [];
    return db.select().from(productVariantsTable).where(inArray(productVariantsTable.productId, productIds));
  }
  return db.select().from(productVariantsTable);
}
async function getManifestsForTenant(tenantId: number | null) {
  return tenantId !== null
    ? db.select({ id: shippingManifestsTable.id, manualShippingCost: shippingManifestsTable.manualShippingCost, createdAt: shippingManifestsTable.createdAt }).from(shippingManifestsTable).where(sql.raw(`shipping_manifests.tenant_id = ${tenantId}`))
    : db.select({ id: shippingManifestsTable.id, manualShippingCost: shippingManifestsTable.manualShippingCost, createdAt: shippingManifestsTable.createdAt }).from(shippingManifestsTable);
}

// ─── Dynamic cost resolver ──────────────────────────────────────────────────────
function resolveCost(
  order: { costPrice: number | null; variantId: number | null; productId: number | null },
  variantMap: Map<number, number | null>,
  productMap: Map<number, number | null>,
): number {
  if (order.variantId && variantMap.has(order.variantId)) {
    const variantCost = variantMap.get(order.variantId);
    if (variantCost !== null && variantCost !== undefined && variantCost > 0) return variantCost;
  }
  if (order.productId && productMap.has(order.productId)) {
    const productCost = productMap.get(order.productId);
    if (productCost !== null && productCost !== undefined && productCost > 0) return productCost;
  }
  return order.costPrice ?? 0;
}

// ─── Profit calculation ─────────────────────────────────────────────────────────
function calcOrderProfit(
  order: {
    status: string;
    quantity: number;
    partialQuantity: number | null;
    unitPrice: number;
    shippingCost: number | null;
  },
  resolvedCost: number,
): { revenue: number; cost: number; shippingCost: number; netProfit: number } {
  const sc = order.shippingCost ?? 0;

  if (order.status === "received") {
    const revenue = order.quantity * order.unitPrice;
    const cost = order.quantity * resolvedCost;
    return { revenue, cost, shippingCost: sc, netProfit: revenue - cost - sc };
  }
  if (order.status === "partial_received") {
    const qty = order.partialQuantity ?? order.quantity;
    const revenue = qty * order.unitPrice;
    const cost = qty * resolvedCost;
    return { revenue, cost, shippingCost: sc, netProfit: revenue - cost - sc };
  }
  if (order.status === "returned") {
    if ((order as any).isDamaged) {
      // منتج تالف → خسارة تكلفة البضاعة كاملة + الشحن
      const damagedCost = order.quantity * resolvedCost;
      return { revenue: 0, cost: damagedCost, shippingCost: sc, netProfit: -(damagedCost + sc) };
    }
    // مرتجع عادي → البضاعة رجعت للمخزن، لا ربح ولا خسارة (الشحن فقط)
    return { revenue: 0, cost: 0, shippingCost: sc, netProfit: -sc };
  }
  const revenue = order.quantity * order.unitPrice;
  const cost = order.quantity * resolvedCost;
  return { revenue, cost, shippingCost: sc, netProfit: revenue - cost - sc };
}

function filterByPeriod(orders: any[], from: Date) {
  return orders.filter(o => new Date(o.createdAt) >= from);
}

function periodStats(
  orders: any[],
  variantMap: Map<number, number | null>,
  productMap: Map<number, number | null>,
  shippingPerOrder: Map<number, number>,
) {
  const completed = orders.filter(o => o.status === "received" || o.status === "partial_received");
  const returned = orders.filter(o => o.status === "returned");

  // نعدّ الفواتير الفريدة بدل عدد الصفوف
  const completedInvoices = new Set(completed.map(o => o.invoiceNumber ?? `solo-${o.id}`));
  const returnedInvoices  = new Set(returned.map(o => o.invoiceNumber ?? `solo-${o.id}`));
  const allInvoices       = new Set(orders.map(o => o.invoiceNumber ?? `solo-${o.id}`));
  const closedInvoices    = new Set([...completedInvoices, ...returnedInvoices]);

  let revenue = 0, cost = 0, shipping = 0, netProfit = 0;
  const processedInvoices = new Set<string>();

  // الطلبات المكتملة — الإيرادات والتكلفة لكل منتج، الشحن مرة واحدة لكل فاتورة
  for (const o of completed) {
    const rc = resolveCost(o, variantMap, productMap);
    const sc = (o.shippingCost ?? 0) + (shippingPerOrder.get(o.id) ?? 0);
    const invKey = o.invoiceNumber ?? `solo-${o.id}`;
    const qty = o.status === "partial_received" ? (o.partialQuantity ?? o.quantity) : o.quantity;
    const rev = qty * o.unitPrice;
    const cst = qty * rc;
    revenue += rev;
    cost += cst;
    // الشحن مرة واحدة فقط لكل فاتورة
    if (!processedInvoices.has(invKey)) {
      processedInvoices.add(invKey);
      shipping += sc;
    }
  }

  // صافي الربح = إيرادات − تكلفة بضاعة − شحن
  netProfit = revenue - cost - shipping;

  // الطلبات المرتجعة — شحن مرة واحدة لكل فاتورة + تكلفة التوالف
  for (const o of returned) {
    const sc = (o.shippingCost ?? 0) + (shippingPerOrder.get(o.id) ?? 0);
    const invKey = o.invoiceNumber ?? `solo-${o.id}`;
    if (!processedInvoices.has(invKey)) {
      processedInvoices.add(invKey);
      shipping += sc;
      netProfit -= sc;
    }
    // إضافة تكلفة التوالف لكل منتج تالف (مش مرة واحدة للفاتورة)
    if ((o as any).isDamaged === 1) {
      const rc = resolveCost(o, variantMap, productMap);
      const damagedCost = o.quantity * rc;
      cost += damagedCost;
      netProfit -= damagedCost;
    }
  }

  const returnRate = closedInvoices.size > 0 ? Math.round((returnedInvoices.size / closedInvoices.size) * 100) : 0;

  return { orders: allInvoices.size, revenue, cost, shippingCost: shipping, netProfit, returnRate, returnCount: returnedInvoices.size };
}

// ─── GET /api/analytics/profit ──────────────────────────────────────────────────
router.get("/analytics/profit", requirePermission("orders.financials"), async (req, res): Promise<void> => {
  try {
  const tenantId = getTenantId(req);
  const now = new Date();

  // ── Cache key يشمل tenant + period/from/to ──
  const fromParam = req.query.from as string | undefined;
  const toParam   = req.query.to   as string | undefined;
  const period    = req.query.period as string | undefined;
  const cacheKey = `analytics-profit:${tenantId ?? "global"}:${period ?? ""}:${fromParam ?? ""}:${toParam ?? ""}`;
  const cached = getCached<any>(cacheKey);
  if (cached) { res.json(cached); return; }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const ordersBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) ordersBaseConditions.push(eq(ordersTable.tenantId, tenantId));

  const productsConditions: any[] = [];
  if (tenantId !== null) productsConditions.push(eq(productsTable.tenantId, tenantId));

  const variantsConditions: any[] = [];
  if (tenantId !== null) variantsConditions.push(eq(productVariantsTable.tenantId, tenantId));

  const manifestsConditions: any[] = [];
  if (tenantId !== null) manifestsConditions.push(sql.raw(`shipping_manifests.tenant_id = ${tenantId}`));

  const [allOrdersRaw, products, variants, manifests, manifestOrders] = await Promise.all([
    db.select().from(ordersTable).where(and(...ordersBaseConditions)),
    getProductsForTenant(tenantId),
    getVariantsForTenant(tenantId),
    getManifestsForTenant(tenantId),
    db.select({ manifestId: shippingManifestOrdersTable.manifestId, orderId: shippingManifestOrdersTable.orderId }).from(shippingManifestOrdersTable),
  ]);

  // بناء map: orderId → تكلفة شحن موزعة (manualShippingCost ÷ عدد الطلبيات في البيان)
  const manifestOrderCount = new Map<number, number>();
  for (const mo of manifestOrders) {
    manifestOrderCount.set(mo.manifestId, (manifestOrderCount.get(mo.manifestId) ?? 0) + 1);
  }
  const shippingPerOrder = new Map<number, number>();
  for (const mo of manifestOrders) {
    const manifest = manifests.find(m => m.id === mo.manifestId);
    const cost = Number(manifest?.manualShippingCost ?? 0);
    if (cost > 0) {
      const count = manifestOrderCount.get(mo.manifestId) ?? 1;
      const existing = shippingPerOrder.get(mo.orderId) ?? 0;
      shippingPerOrder.set(mo.orderId, existing + cost / count);
    }
  }

  const variantMap = new Map<number, number | null>(variants.map(v => [v.id, v.costPrice]));
  const productMap = new Map<number, number | null>(products.map(p => [p.id, p.costPrice]));
  let productImageMap = new Map<string, string | null>();
  try {
    productImageMap = new Map<string, string | null>(
      products.filter(p => p && p.name).map(p => [String(p.name).trim(), (p as any).image ?? null])
    );
  } catch(imgErr) {
    console.error('[smart-insights] productImageMap error:', imgErr);
  }

  // تحديد نطاق الفلتر
  let filteredOrders = allOrdersRaw;
  if (fromParam || toParam || period) {
    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (period === "week") {
      fromDate = startOfWeek;
      toDate = now;
    } else if (period === "month") {
      fromDate = startOfMonth;
      toDate = now;
    } else if (period === "year") {
      fromDate = new Date(now.getFullYear(), 0, 1);
      toDate = now;
    } else if (fromParam || toParam) {
      fromDate = fromParam ? new Date(fromParam) : null;
      toDate   = toParam   ? new Date(new Date(toParam).setHours(23, 59, 59, 999)) : null;
    }

    filteredOrders = allOrdersRaw.filter(o => {
      const d = new Date(o.createdAt);
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      return true;
    });
  }

  const allOrders = filteredOrders;

  const today = periodStats(filterByPeriod(allOrders, startOfToday), variantMap, productMap, shippingPerOrder);
  const week = periodStats(filterByPeriod(allOrders, startOfWeek), variantMap, productMap, shippingPerOrder);
  const month = periodStats(filterByPeriod(allOrders, startOfMonth), variantMap, productMap, shippingPerOrder);
  const allTime = periodStats(allOrders, variantMap, productMap, shippingPerOrder);

  const productProfitMap: Record<string, {
    name: string; revenue: number; cost: number; profit: number;
    quantity: number; orderCount: number; closedCount: number; returnCount: number;
    invoiceSet: Set<string>; returnedInvoiceSet: Set<string>;
  }> = {};

  for (const o of allOrders) {
    const key = o.product;
    if (!productProfitMap[key]) {
      productProfitMap[key] = { name: o.product, revenue: 0, cost: 0, profit: 0, quantity: 0, orderCount: 0, closedCount: 0, returnCount: 0, invoiceSet: new Set(), returnedInvoiceSet: new Set() };
    }
    const pm = productProfitMap[key];
    const rc = resolveCost(o, variantMap, productMap);
    const sc = (o.shippingCost ?? 0) + (shippingPerOrder.get(o.id) ?? 0);

    // نعدّ الفاتورة مرة واحدة فقط
    const invoiceKey = o.invoiceNumber ?? `solo-${o.id}`;
    if (!pm.invoiceSet.has(invoiceKey)) {
      pm.invoiceSet.add(invoiceKey);
      pm.orderCount++;
    }

    if (o.status === "returned") {
      // نعدّ الفاتورة المرتجعة مرة واحدة فقط
      if (!pm.returnedInvoiceSet.has(invoiceKey)) {
        pm.returnedInvoiceSet.add(invoiceKey);
        pm.returnCount++;
        pm.closedCount++;
        // البضاعة رجعت للمخزن → خسارة الشحن فقط
        pm.profit -= sc;
      }
    } else if (o.status === "received" || o.status === "partial_received") {
      const p = calcOrderProfit({ ...o, shippingCost: sc }, rc);
      const qty = o.status === "partial_received" ? (o.partialQuantity ?? o.quantity) : o.quantity;
      pm.closedCount++;
      pm.revenue += p.revenue;
      pm.cost += p.cost;
      pm.profit += p.netProfit;
      pm.quantity += qty;
    }
  }

  const productList = Object.values(productProfitMap).map(p => ({
    ...p,
    // نسبة المرتجعات من الطلبات المغلقة فقط (received + partial_received + returned)
    returnRate: p.closedCount > 0 ? Math.round((p.returnCount / p.closedCount) * 100) : 0,
    margin: p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0,
  }));

  const topProducts = productList
    .filter(p => p.quantity > 0 || p.returnCount > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  const losingProducts = productList
    .filter(p => p.closedCount >= 2 && p.returnRate > 30)
    .sort((a, b) => b.returnRate - a.returnRate)
    .slice(0, 5);

  const variantInventoryValue = variants.reduce((s, v) => {
    const avail = Math.max(0, v.totalQuantity - v.reservedQuantity - v.soldQuantity);
    return s + avail * (v.costPrice ?? 0);
  }, 0);

  const productInventoryValue = products.reduce((s, p) => {
    const avail = Math.max(0, p.totalQuantity - p.reservedQuantity - p.soldQuantity);
    return s + avail * (p.costPrice ?? 0);
  }, 0);

  const inventoryValue = {
    byProduct: productInventoryValue,
    byVariant: variantInventoryValue,
    total: variantInventoryValue + productInventoryValue,
    totalUnits: products.reduce((s, p) => s + Math.max(0, p.totalQuantity - p.soldQuantity), 0),
    lowStock: products.filter(p => (p.totalQuantity - p.reservedQuantity - p.soldQuantity) <= p.lowStockThreshold),
  };

  res.json({ today, week, month, allTime, topProducts, losingProducts, inventoryValue });
  setCached(cacheKey, { today, week, month, allTime, topProducts, losingProducts, inventoryValue }, 2 * 60 * 1000);
  } catch (err) {
    console.error("[analytics/profit]", err);
    res.status(500).json({ error: "فشل تحميل بيانات الأرباح", detail: String(err) });
  }
});

// ─── GET /api/analytics/financial-summary ──────────────────────────────────────
router.get("/analytics/financial-summary", requirePermission("orders.financials"), async (req, res): Promise<void> => {
  try {
  const tenantId = getTenantId(req);
  const fromParam = req.query.from as string | undefined;
  const toParam   = req.query.to   as string | undefined;
  const period    = req.query.period as string | undefined;
  const now = new Date();

  const productConditions: any[] = [eq(productsTable.isArchived, false)];
  if (tenantId !== null) productConditions.push(eq(productsTable.tenantId, tenantId));

  const [productVersionRows, variantVersionRows, stockVersionRows] = await Promise.all([
    db.select({
      count: count(),
      lastUpdated: sql<string | null>`MAX(${productsTable.updatedAt})`,
    })
      .from(productsTable)
      .where(and(...productConditions)),
    db.select({
      count: count(),
      lastUpdated: sql<string | null>`MAX(${productVariantsTable.updatedAt})`,
    })
      .from(productVariantsTable)
      .innerJoin(productsTable, and(eq(productVariantsTable.productId, productsTable.id), ...productConditions))
      .where(and(...productConditions)),
    db.select({
      count: count(),
      qty: sql<number | null>`COALESCE(SUM(${warehouseStockTable.quantity}), 0)`,
      lastUpdated: sql<string | null>`MAX(${warehouseStockTable.updatedAt})`,
    })
      .from(warehouseStockTable)
      .innerJoin(productsTable, and(eq(warehouseStockTable.productId, productsTable.id), ...productConditions))
      .where(and(...productConditions)),
  ]);

  const productVersion = productVersionRows[0] ?? { count: 0, lastUpdated: null };
  const variantVersion = variantVersionRows[0] ?? { count: 0, lastUpdated: null };
  const stockVersion = stockVersionRows[0] ?? { count: 0, qty: 0, lastUpdated: null };

  const fsCacheKey = `analytics-financial:${tenantId ?? "global"}:${period ?? ""}:${fromParam ?? ""}:${toParam ?? ""}:${productVersion.count}:${productVersion.lastUpdated ?? ""}:${variantVersion.count}:${variantVersion.lastUpdated ?? ""}:${stockVersion.count}:${stockVersion.qty ?? 0}:${stockVersion.lastUpdated ?? ""}`;
  const fsCached = getCached<any>(fsCacheKey);
  if (fsCached) { res.json(fsCached); return; }

  const fsBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) fsBaseConditions.push(eq(ordersTable.tenantId, tenantId));

  const [allOrdersRaw, products, variants, allManifests, allManifestOrders] = await Promise.all([
    db.select().from(ordersTable).where(and(...fsBaseConditions)),
    getProductsForTenant(tenantId),
    getVariantsForTenant(tenantId),
    getManifestsForTenant(tenantId),
    db.select({ manifestId: shippingManifestOrdersTable.manifestId, orderId: shippingManifestOrdersTable.orderId })
      .from(shippingManifestOrdersTable),
  ]);

  // فلتر التاريخ
  let allOrders = allOrdersRaw;
  if (fromParam || toParam || period) {
    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (period === "week") {
      fromDate = new Date(now); fromDate.setDate(now.getDate() - 7);
    } else if (period === "month") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "year") {
      fromDate = new Date(now.getFullYear(), 0, 1);
    } else {
      fromDate = fromParam ? new Date(fromParam) : null;
      toDate   = toParam   ? new Date(new Date(toParam).setHours(23, 59, 59, 999)) : null;
    }
    allOrders = allOrdersRaw.filter(o => {
      const d = new Date(o.createdAt);
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      return true;
    });
  }

  const variantMap = new Map<number, number | null>(variants.map(v => [v.id, v.costPrice]));
  const productMap = new Map<number, number | null>(products.map(p => [p.id, p.costPrice]));
  const productImageMap = new Map<string, string | null>(
    products.filter(p => p && p.name).map(p => [String(p.name).trim(), (p as any).image ?? null])
  );

  // بناء map: orderId → manifestId لربط كل أوردر ببيانه
  const orderToManifest = new Map<number, number>();
  for (const mo of allManifestOrders) {
    orderToManifest.set(mo.orderId, mo.manifestId);
  }
  const manifestMap = new Map<number, typeof allManifests[0]>(allManifests.map(m => [m.id, m]));
  // shippingSpend = مجموع manualShippingCost للبيانات التي لها أوردرات مستلمة — يُضاف مرة واحدة لكل بيان
  const countedManifestsForShipping = new Set<number>();

  let cashIn = 0, costOfGoods = 0, shippingSpend = 0;
  let returnLoss = 0, returnRevLost = 0, pendingRevenue = 0;
  let returnDamagedValue = 0; // تكلفة التوالف = المرتجعات التالفة (isDamaged=1) × تكلفة البضاعة

  const completedOrders: Array<{ profit: number; value: number; cost: number }> = [];
  // نحسب الشحن مرة واحدة فقط لكل فاتورة لتفادي التضاعف
  const processedShippingInvoices = new Set<string>();

  for (const o of allOrders) {
    const rc = resolveCost(o, variantMap, productMap);
    // تكلفة الشحن الثابتة على الأوردر فقط (بدون توزيع manualShippingCost — يُضاف من البيان مباشرة)
    const sc = (o.shippingCost ?? 0);
    const invKey = (o.invoiceNumber ?? `solo-${o.id}`) as string;
    const isNewInvoice = !processedShippingInvoices.has(invKey);

    // تكلفة شحن البيان: تُضاف مرة واحدة عند أول أوردر مستلم/مرتجع ينتمي للبيان
    const manifestId = orderToManifest.get(o.id);
    const manifestCost = (manifestId !== undefined && !countedManifestsForShipping.has(manifestId))
      ? Number(manifestMap.get(manifestId)?.manualShippingCost ?? 0)
      : 0;

    if (o.status === "received") {
      const revenue = o.quantity * o.unitPrice;
      const cost = o.quantity * rc;
      cashIn += revenue;
      costOfGoods += cost;
      if (isNewInvoice) { processedShippingInvoices.add(invKey); shippingSpend += sc; }
      if (manifestCost > 0 && manifestId !== undefined) { countedManifestsForShipping.add(manifestId); shippingSpend += manifestCost; }
      completedOrders.push({ profit: revenue - cost - (isNewInvoice ? sc : 0) - manifestCost, value: revenue, cost: cost + (isNewInvoice ? sc : 0) + manifestCost });
    } else if (o.status === "partial_received") {
      const qty = o.partialQuantity ?? o.quantity;
      const revenue = qty * o.unitPrice;
      const cost = qty * rc;
      cashIn += revenue;
      costOfGoods += cost;
      if (isNewInvoice) { processedShippingInvoices.add(invKey); shippingSpend += sc; }
      if (manifestCost > 0 && manifestId !== undefined) { countedManifestsForShipping.add(manifestId); shippingSpend += manifestCost; }
      completedOrders.push({ profit: revenue - cost - (isNewInvoice ? sc : 0) - manifestCost, value: revenue, cost: cost + (isNewInvoice ? sc : 0) + manifestCost });
    } else if (o.status === "returned") {
      if (isNewInvoice) { processedShippingInvoices.add(invKey); shippingSpend += sc; }
      if (manifestCost > 0 && manifestId !== undefined) { countedManifestsForShipping.add(manifestId); shippingSpend += manifestCost; }
      returnRevLost += o.quantity * o.unitPrice;
      if (o.isDamaged === 1) {
        const damagedCost = o.quantity * rc;
        returnDamagedValue += damagedCost;
        returnLoss += damagedCost;
      }
    } else if (o.status === "in_shipping") {
      pendingRevenue += o.quantity * o.unitPrice;
    }
  }


  // صافي الربح = إجمالي المقبوض − تكلفة البضاعة − تكلفة الشحن − خسائر المرتجعات
  const netProfit = cashIn - costOfGoods - shippingSpend - returnLoss;
  const grossProfit = cashIn - costOfGoods;
  const grossMargin = cashIn > 0 ? Math.round((grossProfit / cashIn) * 100) : 0;
  const netMargin = cashIn > 0 ? Math.round((netProfit / cashIn) * 100) : 0;

  // Order metrics
  const avgProfitPerOrder = completedOrders.length > 0
    ? Math.round(completedOrders.reduce((s, o) => s + o.profit, 0) / completedOrders.length)
    : 0;
  const avgOrderValue = completedOrders.length > 0
    ? Math.round(completedOrders.reduce((s, o) => s + o.value, 0) / completedOrders.length)
    : 0;
  const avgCostPerOrder = completedOrders.length > 0
    ? Math.round(completedOrders.reduce((s, o) => s + o.cost, 0) / completedOrders.length)
    : 0;

  // المنتجات التي عندها variants — نحسب قيمتها من الـ variants فقط لتفادي التضاعف
  const productsWithVariants = new Set(variants.map(v => v.productId));

  const variantStockRows = await db
    .select({
      quantity: warehouseStockTable.quantity,
      costPrice: productVariantsTable.costPrice,
      unitPrice: productVariantsTable.unitPrice,
    })
    .from(warehouseStockTable)
    .innerJoin(productVariantsTable, eq(warehouseStockTable.variantId, productVariantsTable.id))
    .innerJoin(productsTable, and(
      eq(productVariantsTable.productId, productsTable.id),
      eq(productsTable.isArchived, false),
      ...(tenantId !== null ? [eq(productsTable.tenantId, tenantId)] : []),
    ));

  const productStockRows = await db
    .select({
      quantity: warehouseStockTable.quantity,
      costPrice: productsTable.costPrice,
      unitPrice: productsTable.unitPrice,
      productId: productsTable.id,
    })
    .from(warehouseStockTable)
    .innerJoin(productsTable, and(
      eq(warehouseStockTable.productId, productsTable.id),
      eq(productsTable.isArchived, false),
      ...(tenantId !== null ? [eq(productsTable.tenantId, tenantId)] : []),
    ));

  const inventoryAtCost =
    variantStockRows.reduce((s, row) => s + Math.max(0, row.quantity) * (row.costPrice ?? 0), 0)
    + productStockRows.reduce((s, row) => {
      if (productsWithVariants.has(row.productId)) return s;
      return s + Math.max(0, row.quantity) * (row.costPrice ?? 0);
    }, 0);

  const inventoryAtSell =
    variantStockRows.reduce((s, row) => s + Math.max(0, row.quantity) * row.unitPrice, 0)
    + productStockRows.reduce((s, row) => {
      if (productsWithVariants.has(row.productId)) return s;
      return s + Math.max(0, row.quantity) * row.unitPrice;
    }, 0);

  const returnCount = new Set(allOrders.filter(o => o.status === "returned").map(o => o.invoiceNumber ?? `solo-${o.id}`)).size;
  // نسبة المرتجعات من الطلبات المنتهية فعلاً (received + partial_received + returned) — نعدّ الفواتير الفريدة
  const closedInvoices = new Set(allOrders.filter(o => ["received", "partial_received", "returned"].includes(o.status)).map(o => o.invoiceNumber ?? `solo-${o.id}`)).size;
  const returnRate = closedInvoices > 0 ? Math.round((returnCount / closedInvoices) * 100) : 0;

  const fsResponse = {
    cashIn, costOfGoods, shippingSpend, grossProfit, grossMargin, netProfit, netMargin,
    returnLoss, returnRevLost, returnDamagedValue, pendingRevenue, returnCount, returnRate,
    totalOrders: new Set(allOrders.map(o => o.invoiceNumber ?? `solo-${o.id}`)).size,
    completedOrders: new Set(allOrders.filter(o => ["received","partial_received"].includes(o.status)).map(o => o.invoiceNumber ?? `solo-${o.id}`)).size,
    avgProfitPerOrder, avgOrderValue, avgCostPerOrder,
    inventoryAtCost, inventoryAtSell,
    potentialInventoryProfit: inventoryAtSell - inventoryAtCost,
  };
  setCached(fsCacheKey, fsResponse, 2 * 60 * 1000);
  res.json(fsResponse);
  } catch (err) {
    console.error("[analytics/financial-summary]", err);
    res.status(500).json({ error: "فشل تحميل الملخص المالي", detail: String(err) });
  }
});

// ─── GET /api/analytics/damaged-orders ──────────────────────────────────────
// يجيب تفاصيل الطلبات التالفة (isDamaged=1 + status=returned)
router.get("/analytics/damaged-orders", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conditions: any[] = [
    isNull(ordersTable.deletedAt),
    eq(ordersTable.status, "returned" as any),
  ];
  if (tenantId !== null) conditions.push(eq(ordersTable.tenantId, tenantId));

  const [allOrders, products, variants] = await Promise.all([
    db.select().from(ordersTable).where(and(...conditions)).orderBy(desc(ordersTable.createdAt)),
    getProductsForTenant(tenantId),
    getVariantsForTenant(tenantId),
  ]);

  const variantMap = new Map<number, number | null>(variants.map(v => [v.id, v.costPrice]));
  const productMap = new Map<number, number | null>(products.map(p => [p.id, p.costPrice]));

  // فلتر التوالف فقط
  const damagedOrders = allOrders.filter(o => o.isDamaged === 1);

  const result = damagedOrders.map(o => {
    const rc = resolveCost(o, variantMap, productMap);
    const damagedCost = o.quantity * rc;
    const shippingLoss = o.shippingCost ?? 0;
    return {
      id: o.id,
      customerName: o.customerName,
      phone: o.phone,
      product: o.product,
      color: o.color,
      size: o.size,
      quantity: o.quantity,
      unitPrice: o.unitPrice,
      totalPrice: o.totalPrice,
      costPrice: rc,
      damagedCost: Math.round(damagedCost),
      shippingLoss: Math.round(shippingLoss),
      totalLoss: Math.round(damagedCost + shippingLoss),
      invoiceNumber: o.invoiceNumber,
      returnReason: o.returnReason,
      returnNote: o.returnNote,
      createdAt: o.createdAt,
    };
  });

  const totalDamagedValue = result.reduce((s, o) => s + o.damagedCost, 0);
  const totalLoss = result.reduce((s, o) => s + o.totalLoss, 0);

  res.json({ orders: result, totalDamagedValue, totalLoss, count: result.length });
});

// ─── GET /api/analytics/product-performance ─────────────────────────────────────
// Full per-product breakdown: revenue, profit, returns, margin, avg price
router.get("/analytics/product-performance", requirePermission("orders.financials"), async (req, res): Promise<void> => {
  try {
  const tenantId = getTenantId(req);
  const cacheKey = `product-performance:${tenantId ?? "global"}`;
  const cached = getCached<any>(cacheKey);
  if (cached) { res.json(cached); return; }

  const ppBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) ppBaseConditions.push(eq(ordersTable.tenantId, tenantId));

  // نجيب الـ columns المطلوبة بس — مش كل الجدول
  const [allOrders, products, variants] = await Promise.all([
    db.select({
      id:              ordersTable.id,
      product:         ordersTable.product,
      productId:       ordersTable.productId,
      variantId:       ordersTable.variantId,
      quantity:        ordersTable.quantity,
      partialQuantity: ordersTable.partialQuantity,
      unitPrice:       ordersTable.unitPrice,
      costPrice:       ordersTable.costPrice,
      shippingCost:    ordersTable.shippingCost,
      status:          ordersTable.status,
      invoiceNumber:   ordersTable.invoiceNumber,
    }).from(ordersTable).where(and(...ppBaseConditions)),
    getProductsForTenant(tenantId),
    getVariantsForTenant(tenantId),
  ]);

  const variantMap = new Map<number, number | null>(variants.map(v => [v.id, v.costPrice]));
  const productMap = new Map<number, number | null>(products.map(p => [p.id, p.costPrice]));
  const productImageMap = new Map<number, string | null>(products.map(p => [p.id, (p as any).image ?? null]));
  // productId lookup by name
  const productIdByName = new Map<string, number>(products.map(p => [p.name.trim().toLowerCase(), p.id]));

  type ProductStats = {
    name: string;
    productId: number | null;
    image: string | null;
    totalOrders: number;      // عدد الفواتير الفريدة (مش عدد الصفوف)
    completedOrders: number;
    totalSalesQty: number;
    totalRevenue: number;
    totalCost: number;
    totalShipping: number;
    returnCount: number;
    returnCostLoss: number;
    netProfit: number;
    avgSalePrice: number;
    margin: number;
    returnRate: number;
    roi: number;
  };

  const statsMap = new Map<string, Omit<ProductStats, "avgSalePrice" | "margin" | "returnRate" | "roi"> & { invoiceSet: Set<string>; returnedInvoiceSet: Set<string> }>();

  for (const o of allOrders) {
    const key = o.product.trim();
    if (!statsMap.has(key)) {
      const pid = o.productId ?? productIdByName.get(key.toLowerCase()) ?? null;
      statsMap.set(key, {
        name: key, productId: pid,
        image: pid ? (productImageMap.get(pid) ?? null) : null,
        totalOrders: 0, completedOrders: 0, totalSalesQty: 0,
        totalRevenue: 0, totalCost: 0, totalShipping: 0,
        returnCount: 0, returnCostLoss: 0, netProfit: 0,
        invoiceSet: new Set(),
        returnedInvoiceSet: new Set(),
      });
    }

    const s = statsMap.get(key)!;
    const rc = resolveCost(o, variantMap, productMap);
    const sc = o.shippingCost ?? 0;
    const invoiceKey = o.invoiceNumber ?? `solo-${o.id}`;

    // نعدّ كل فاتورة مرة واحدة بس في totalOrders
    if (!s.invoiceSet.has(invoiceKey)) {
      s.invoiceSet.add(invoiceKey);
      s.totalOrders++;
    }

    if (o.status === "received") {
      const qty = o.quantity;
      const rev = qty * o.unitPrice;
      const cost = qty * rc;
      s.completedOrders++;
      s.totalSalesQty += qty;
      s.totalRevenue += rev;
      s.totalCost += cost;
      s.totalShipping += sc;
      s.netProfit += rev - cost - sc;
    } else if (o.status === "partial_received") {
      const qty = o.partialQuantity ?? o.quantity;
      const rev = qty * o.unitPrice;
      const cost = qty * rc;
      s.completedOrders++;
      s.totalSalesQty += qty;
      s.totalRevenue += rev;
      s.totalCost += cost;
      s.totalShipping += sc;
      s.netProfit += rev - cost - sc;
    } else if (o.status === "returned") {
      // البضاعة رجعت للمخزن → الخسارة الحقيقية هي تكلفة الشحن فقط
      // نعدّ الفاتورة المرتجعة مرة واحدة فقط بغض النظر عن عدد المنتجات فيها
      if (!s.returnedInvoiceSet.has(invoiceKey)) {
        s.returnedInvoiceSet.add(invoiceKey);
        s.returnCount++;
        s.totalShipping += sc;
        s.returnCostLoss += sc;
        s.netProfit -= sc;
      }
    }
  }

  const productList: ProductStats[] = Array.from(statsMap.values()).map(s => {
    const avgSalePrice = s.totalSalesQty > 0 ? Math.round(s.totalRevenue / s.totalSalesQty) : 0;
    const margin = s.totalRevenue > 0 ? Math.round((s.netProfit / s.totalRevenue) * 100) : 0;
    // نسبة المرتجعات من الطلبات المنتهية فقط (received + partial_received + returned)
    const closedOrders = s.completedOrders + s.returnCount;
    const returnRate = closedOrders > 0 ? Math.round((s.returnCount / closedOrders) * 100) : 0;
    const roi = s.totalCost > 0 ? Math.round((s.netProfit / s.totalCost) * 100) : 0;
    return { ...s, avgSalePrice, margin, returnRate, roi };
  });

  // Sort variants: by profit desc, by loss asc, by return rate desc
  const byProfit = [...productList].sort((a, b) => b.netProfit - a.netProfit);
  const byLoss = [...productList].filter(p => p.netProfit < 0).sort((a, b) => a.netProfit - b.netProfit);
  const byReturns = [...productList]
    .filter(p => p.returnCount > 0)
    .sort((a, b) => b.returnRate - a.returnRate || b.returnCount - a.returnCount);

  const responseData = {
    products: byProfit,
    byProfit,
    byLoss,
    byReturns,
    summary: {
      totalProducts: productList.length,
      profitableCount: productList.filter(p => p.netProfit > 0).length,
      losingCount: productList.filter(p => p.netProfit < 0).length,
      highReturnCount: productList.filter(p => p.returnRate >= 30).length,
      totalNetProfit: productList.reduce((s, p) => s + p.netProfit, 0),
      totalRevenue: productList.reduce((s, p) => s + p.totalRevenue, 0),
    },
  };
  setCached(cacheKey, responseData, 30 * 60 * 1000); // cache 30 دقيقة
  res.setHeader("Cache-Control", "private, max-age=1800"); // براوزر يكاش 30 دقيقة
  res.json(responseData);
  } catch (err) {
    console.error("[product-performance]", err);
    res.status(500).json({ error: "فشل تحليل أداء المنتجات", detail: String(err) });
  }
});

// ─── GET /api/analytics/alerts ──────────────────────────────────────────────────
// Smart automatic alerts: high returns, losing products, low stock, low margin
router.get("/analytics/alerts", async (req, res): Promise<void> => {
  try {
  const tenantId = getTenantId(req);
  const alertProductConditions: any[] = [eq(productsTable.isArchived, false)];
  if (tenantId !== null) alertProductConditions.push(eq(productsTable.tenantId, tenantId));

  const [productVersionRows, variantVersionRows, stockVersionRows] = await Promise.all([
    db.select({
      count: count(),
      lastUpdated: sql<string | null>`MAX(${productsTable.updatedAt})`,
    })
      .from(productsTable)
      .where(and(...alertProductConditions)),
    db.select({
      count: count(),
      lastUpdated: sql<string | null>`MAX(${productVariantsTable.updatedAt})`,
    })
      .from(productVariantsTable)
      .innerJoin(productsTable, and(eq(productVariantsTable.productId, productsTable.id), ...alertProductConditions))
      .where(and(...alertProductConditions)),
    db.select({
      count: count(),
      qty: sql<number | null>`COALESCE(SUM(${warehouseStockTable.quantity}), 0)`,
      lastUpdated: sql<string | null>`MAX(${warehouseStockTable.updatedAt})`,
    })
      .from(warehouseStockTable)
      .innerJoin(productsTable, and(eq(warehouseStockTable.productId, productsTable.id), ...alertProductConditions))
      .where(and(...alertProductConditions)),
  ]);

  const productVersion = productVersionRows[0] ?? { count: 0, lastUpdated: null };
  const variantVersion = variantVersionRows[0] ?? { count: 0, lastUpdated: null };
  const stockVersion = stockVersionRows[0] ?? { count: 0, qty: 0, lastUpdated: null };
  const cacheKey = `analytics-alerts:${tenantId ?? "global"}:${productVersion.count}:${productVersion.lastUpdated ?? ""}:${variantVersion.count}:${variantVersion.lastUpdated ?? ""}:${stockVersion.count}:${stockVersion.qty ?? 0}:${stockVersion.lastUpdated ?? ""}`;
  const cached = getCached<any>(cacheKey);
  if (cached) { res.json(cached); return; }
  const alertsBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) alertsBaseConditions.push(eq(ordersTable.tenantId, tenantId));
  const [allOrders, products, variants] = await Promise.all([
    db.select().from(ordersTable).where(and(...alertsBaseConditions)),
    getProductsForTenant(tenantId),
    getVariantsForTenant(tenantId),
  ]);

  const variantMap = new Map<number, number | null>(variants.map(v => [v.id, v.costPrice]));
  const productMap = new Map<number, number | null>(products.map(p => [p.id, p.costPrice]));
  const liveProducts = products.filter(p => !(p as any).isArchived);
  const productsWithVariants = new Set(variants.map(v => v.productId));
  const variantStockRows = await db
    .select({
      variantId: warehouseStockTable.variantId,
      productId: productVariantsTable.productId,
      quantity: warehouseStockTable.quantity,
    })
    .from(warehouseStockTable)
    .innerJoin(productVariantsTable, eq(warehouseStockTable.variantId, productVariantsTable.id))
    .innerJoin(productsTable, and(
      eq(productVariantsTable.productId, productsTable.id),
      eq(productsTable.isArchived, false),
      ...(tenantId !== null ? [eq(productsTable.tenantId, tenantId)] : []),
    ));
  const productStockRows = await db
    .select({
      productId: productsTable.id,
      quantity: warehouseStockTable.quantity,
    })
    .from(warehouseStockTable)
    .innerJoin(productsTable, and(
      eq(warehouseStockTable.productId, productsTable.id),
      eq(productsTable.isArchived, false),
      ...(tenantId !== null ? [eq(productsTable.tenantId, tenantId)] : []),
    ));
  const stockByProductId = new Map<number, number>();
  const stockByVariantId = new Map<number, number>();
  for (const row of variantStockRows) {
    stockByVariantId.set(row.variantId, (stockByVariantId.get(row.variantId) ?? 0) + Math.max(0, row.quantity));
    stockByProductId.set(row.productId, (stockByProductId.get(row.productId) ?? 0) + Math.max(0, row.quantity));
  }
  for (const row of productStockRows) {
    if (productsWithVariants.has(row.productId)) continue;
    stockByProductId.set(row.productId, (stockByProductId.get(row.productId) ?? 0) + Math.max(0, row.quantity));
  }

  type Alert = {
    id: string;
    type: "HIGH_RETURN" | "LOSING_PRODUCT" | "LOW_STOCK" | "LOW_MARGIN" | "STALE_STOCK" | "NO_COST_DATA";
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
    productName?: string;
    value?: number;
  };

  const alerts: Alert[] = [];

  // Build product stats for alerts — نعدّ الفواتير الفريدة مش الصفوف
  const statsMap = new Map<string, {
    name: string; totalOrders: number; closedOrders: number; returned: number;
    revenue: number; profit: number; costMissing: boolean;
    invoiceSet: Set<string>; returnedInvoiceSet: Set<string>; closedInvoiceSet: Set<string>;
  }>();

  for (const o of allOrders) {
    const key = o.product.trim();
    if (!statsMap.has(key)) {
      statsMap.set(key, {
        name: key, totalOrders: 0, closedOrders: 0, returned: 0,
        revenue: 0, profit: 0, costMissing: false,
        invoiceSet: new Set(), returnedInvoiceSet: new Set(), closedInvoiceSet: new Set(),
      });
    }
    const s = statsMap.get(key)!;
    const rc = resolveCost(o, variantMap, productMap);
    if (rc === 0) s.costMissing = true;

    const invoiceKey = o.invoiceNumber ?? `solo-${o.id}`;

    // كل فاتورة تتعدّ مرة واحدة فقط في totalOrders
    if (!s.invoiceSet.has(invoiceKey)) {
      s.invoiceSet.add(invoiceKey);
      s.totalOrders++;
    }

    if (o.status === "returned") {
      // الفاتورة المرتجعة تتعدّ مرة واحدة فقط
      if (!s.returnedInvoiceSet.has(invoiceKey)) {
        s.returnedInvoiceSet.add(invoiceKey);
        s.returned++;
        s.profit -= o.shippingCost ?? 0; // خسارة الشحن فقط
      }
      if (!s.closedInvoiceSet.has(invoiceKey)) {
        s.closedInvoiceSet.add(invoiceKey);
        s.closedOrders++;
      }
    } else if (o.status === "received" || o.status === "partial_received") {
      const qty = o.status === "partial_received" ? (o.partialQuantity ?? o.quantity) : o.quantity;
      const rev = qty * o.unitPrice;
      const cost = qty * rc;
      const sc = o.shippingCost ?? 0;
      // الإيرادات والتكلفة تُحسب لكل منتج في الفاتورة (صح)
      s.revenue += rev;
      s.profit += rev - cost - sc;
      // الفاتورة المكتملة تتعدّ مرة واحدة فقط
      if (!s.closedInvoiceSet.has(invoiceKey)) {
        s.closedInvoiceSet.add(invoiceKey);
        s.closedOrders++;
      }
    }
    // pending / in_shipping / delayed لا تُحسب في نسبة الإرجاع
  }

  for (const [, s] of statsMap) {
    // نسبة المرتجعات من الطلبات المغلقة فقط (received + partial_received + returned)
    const returnRate = s.closedOrders > 0 ? (s.returned / s.closedOrders) * 100 : 0;
    const margin = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;

    // Alert: high return rate (>= 30%, min 1 closed order)
    if (s.closedOrders >= 1 && returnRate >= 30) {
      alerts.push({
        id: `high_return_${s.name}`,
        type: "HIGH_RETURN",
        severity: returnRate >= 50 ? "high" : "medium",
        title: `نسبة إرجاع عالية`,
        detail: `${s.name} — ${Math.round(returnRate)}% مرتجع (${s.returned} من ${s.closedOrders} طلب مغلق)`,
        productName: s.name,
        value: Math.round(returnRate),
      });
    }

    // Alert: losing product (negative profit, at least 1 completed order)
    if (s.profit < 0 && (s.closedOrders - s.returned) > 0) {
      alerts.push({
        id: `losing_${s.name}`,
        type: "LOSING_PRODUCT",
        severity: s.profit < -500 ? "high" : "medium",
        title: `منتج خاسر`,
        detail: `${s.name} — خسارة ${Math.abs(Math.round(s.profit))} ج.م`,
        productName: s.name,
        value: Math.round(s.profit),
      });
    }

    // Alert: low margin (<= 10% and > 0, has sales)
    if (s.revenue > 0 && margin > 0 && margin <= 10) {
      alerts.push({
        id: `low_margin_${s.name}`,
        type: "LOW_MARGIN",
        severity: "low",
        title: `هامش ربح منخفض`,
        detail: `${s.name} — هامش ${Math.round(margin)}% فقط`,
        productName: s.name,
        value: Math.round(margin),
      });
    }

    // Alert: no cost data (orders exist but cost unknown)
    if (s.costMissing && s.totalOrders > 0) {
      alerts.push({
        id: `no_cost_${s.name}`,
        type: "NO_COST_DATA",
        severity: "low",
        title: `بيانات تكلفة ناقصة`,
        detail: `${s.name} — لا يوجد سعر تكلفة، الأرباح غير دقيقة`,
        productName: s.name,
      });
    }
  }

  // Low stock alerts (products + variants)
  for (const p of liveProducts) {
    const avail = stockByProductId.get(p.id) ?? 0;
    if (avail <= p.lowStockThreshold && avail > 0) {
      alerts.push({
        id: `low_stock_p_${p.id}`,
        type: "LOW_STOCK",
        severity: "medium",
        title: `مخزون منخفض`,
        detail: `${p.name} — باقي ${avail} وحدة`,
        productName: p.name,
        value: avail,
      });
    }
  }

  for (const v of variants) {
    const avail = stockByVariantId.get(v.id) ?? 0;
    if (avail <= v.lowStockThreshold && avail > 0) {
      const label = [v.color, v.size].filter(Boolean).join(" / ");
      alerts.push({
        id: `low_stock_v_${v.id}`,
        type: "LOW_STOCK",
        severity: "medium",
        title: `مخزون منخفض`,
        detail: `متغير ${label} — باقي ${avail} وحدة`,
        value: avail,
      });
    }
  }

  // Sort: high → medium → low
  const severityOrder = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  res.json({
    alerts,
    counts: {
      total: alerts.length,
      high: alerts.filter(a => a.severity === "high").length,
      medium: alerts.filter(a => a.severity === "medium").length,
      low: alerts.filter(a => a.severity === "low").length,
    },
  });
  setCached(cacheKey, {
    alerts,
    counts: {
      total: alerts.length,
      high: alerts.filter(a => a.severity === "high").length,
      medium: alerts.filter(a => a.severity === "medium").length,
      low: alerts.filter(a => a.severity === "low").length,
    },
  }, 15 * 60 * 1000);
  } catch (err) {
    console.error("[analytics/alerts]", err);
    res.status(500).json({ error: "فشل تحميل التنبيهات", detail: String(err) });
  }
});

// ─── GET /api/analytics/stock-intelligence ──────────────────────────────────────
// Stock velocity (units/day), days until stockout, frozen capital
router.get("/analytics/stock-intelligence", async (req, res): Promise<void> => {
  try {
  const tenantId = getTenantId(req);
  const siBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) siBaseConditions.push(eq(ordersTable.tenantId, tenantId));
  const [allOrders, products, variants] = await Promise.all([
    db.select().from(ordersTable).where(and(...siBaseConditions)),
    getProductsForTenant(tenantId),
    getVariantsForTenant(tenantId),
  ]);

  const variantMap = new Map<number, number | null>(variants.map(v => [v.id, v.costPrice]));
  const productMap = new Map<number, number | null>(products.map(p => [p.id, p.costPrice]));

  // Calculate sales velocity per product name
  // Use last 30 days sold qty to estimate daily velocity
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Days since first order per product (to determine active period)
  const firstOrderDate = new Map<string, Date>();
  const last30DaysSales = new Map<string, number>();
  const allTimeSales = new Map<string, number>();

  for (const o of allOrders) {
    const key = o.product.trim();
    const oDate = new Date(o.createdAt);

    if (!firstOrderDate.has(key) || oDate < firstOrderDate.get(key)!) {
      firstOrderDate.set(key, oDate);
    }

    if (o.status === "received" || o.status === "partial_received") {
      const qty = o.status === "partial_received" ? (o.partialQuantity ?? o.quantity) : o.quantity;
      allTimeSales.set(key, (allTimeSales.get(key) ?? 0) + qty);
      if (oDate >= thirtyDaysAgo) {
        last30DaysSales.set(key, (last30DaysSales.get(key) ?? 0) + qty);
      }
    }
  }

  type StockItem = {
    name: string;
    productId: number | null;
    availableQty: number;
    reservedQty: number;
    soldQty: number;
    costPrice: number;
    unitPrice: number;
    last30DaysSales: number;
    velocityPerDay: number;      // units sold per day (last 30d)
    daysUntilStockout: number | null; // null = never sold / infinite
    category: "out" | "fast" | "medium" | "slow" | "stale";
    frozenCapital: number;       // availableQty × costPrice
    potentialRevenue: number;    // availableQty × unitPrice
  };

  // حساب المخزون الفعلي من الـ variants (أدق من totalQuantity على مستوى المنتج)
  const variantStockByProduct = new Map<number, number>();
  for (const v of variants) {
    variantStockByProduct.set(v.productId, (variantStockByProduct.get(v.productId) ?? 0) + Math.max(0, v.totalQuantity));
  }

  const items: StockItem[] = products.map(p => {
    const key = p.name.trim();
    const avail = variantStockByProduct.get(p.id) ?? 0;
    const sold30 = last30DaysSales.get(key) ?? 0;
    const costPrice = (productMap.get(p.id) ?? 0);

    // Velocity: avg per day over last 30 days
    const velocity = sold30 / 30;

    let daysUntilStockout: number | null = null;
    if (avail <= 0) {
      daysUntilStockout = 0;
    } else if (velocity > 0) {
      daysUntilStockout = Math.round(avail / velocity);
    }

    let category: StockItem["category"] = "stale";
    if (avail <= 0) {
      // "out" فقط لو عنده variants فعلية أو أوردرات تاريخية (يعني المخزون نفد فعلاً)
      const hasVariants = variants.some(v => v.productId === p.id);
      const hasOrders = (allTimeSales.get(key) ?? 0) > 0;
      if (hasVariants || hasOrders) {
        category = "out";
      }
      // لو مفيهوش variants ولا أوردرات → stale (منتج جديد مش "نفد")
    } else if (daysUntilStockout !== null) {
      if (daysUntilStockout <= 7) category = "fast";
      else if (daysUntilStockout <= 30) category = "medium";
      else category = "slow";
    }
    // stale = عنده مخزون (avail > 0) لكن velocity = 0 (لا مبيعات في 30 يوم)

    return {
      name: key,
      productId: p.id,
      availableQty: avail,
      reservedQty: 0,
      soldQty: allTimeSales.get(key) ?? 0,
      costPrice,
      unitPrice: p.unitPrice,
      last30DaysSales: sold30,
      velocityPerDay: Math.round(velocity * 100) / 100,
      daysUntilStockout,
      category,
      frozenCapital: avail * costPrice,
      potentialRevenue: avail * p.unitPrice,
    };
  });

  // Sort: fast first (most urgent), then medium, slow, stale, out
  const categoryOrder = { fast: 0, medium: 1, slow: 2, stale: 3, out: 4 };
  items.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category] || b.velocityPerDay - a.velocityPerDay);

  // slowMovers = slow أو stale لكن فقط اللي عنده مخزون فعلي (avail > 0)
  const totalFrozenCapital = items.filter(i => (i.category === "slow" || i.category === "stale") && i.availableQty > 0).reduce((s, i) => s + i.frozenCapital, 0);
  const totalFastMovers = items.filter(i => i.category === "fast").length;
  const totalSlowMovers = items.filter(i => (i.category === "slow" || i.category === "stale") && i.availableQty > 0).length;

  res.json({
    items,
    summary: {
      totalProducts: items.length,
      fastMovers: totalFastMovers,
      slowMovers: totalSlowMovers,
      outOfStock: items.filter(i => i.category === "out").length,
      totalFrozenCapital,
    },
  });
  } catch (err: any) {
    console.error("[stock-intelligence] error:", err?.message ?? err);
    res.status(500).json({ error: "ظپط´ظ„ طھط­ظ„ظٹظ„ ط§ظ„ظ…ط®ط²ظˆظ†", detail: err?.message ?? String(err) });
  }
});

// ─── GET /api/analytics/smart-insights ──────────────────────────────────────
// Comprehensive smart analytics: ad attribution, stars, dead stock,
// return insights, stock predictor
router.get("/analytics/smart-insights", async (req, res): Promise<void> => {
  try {
  const tenantId = getTenantId(req);
  const smartProductConditions: any[] = [eq(productsTable.isArchived, false)];
  if (tenantId !== null) smartProductConditions.push(eq(productsTable.tenantId, tenantId));

  const [productVersionRows, variantVersionRows, stockVersionRows] = await Promise.all([
    db.select({
      count: count(),
      lastUpdated: sql<string | null>`MAX(${productsTable.updatedAt})`,
    })
      .from(productsTable)
      .where(and(...smartProductConditions)),
    db.select({
      count: count(),
      lastUpdated: sql<string | null>`MAX(${productVariantsTable.updatedAt})`,
    })
      .from(productVariantsTable)
      .innerJoin(productsTable, and(eq(productVariantsTable.productId, productsTable.id), ...smartProductConditions))
      .where(and(...smartProductConditions)),
    db.select({
      count: count(),
      qty: sql<number | null>`COALESCE(SUM(${warehouseStockTable.quantity}), 0)`,
      lastUpdated: sql<string | null>`MAX(${warehouseStockTable.updatedAt})`,
    })
      .from(warehouseStockTable)
      .innerJoin(productsTable, and(eq(warehouseStockTable.productId, productsTable.id), ...smartProductConditions))
      .where(and(...smartProductConditions)),
  ]);

  const productVersion = productVersionRows[0] ?? { count: 0, lastUpdated: null };
  const variantVersion = variantVersionRows[0] ?? { count: 0, lastUpdated: null };
  const stockVersion = stockVersionRows[0] ?? { count: 0, qty: 0, lastUpdated: null };

  const siCacheKey = `smart-insights:${tenantId ?? "global"}:${productVersion.count}:${productVersion.lastUpdated ?? ""}:${variantVersion.count}:${variantVersion.lastUpdated ?? ""}:${stockVersion.count}:${stockVersion.qty ?? 0}:${stockVersion.lastUpdated ?? ""}`;
  const siCached = getCached<any>(siCacheKey);
  if (siCached) { res.json(siCached); return; }
  const smBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) smBaseConditions.push(eq(ordersTable.tenantId, tenantId));
  const [allOrders, products, variants, allManifests, allManifestOrders] = await Promise.all([
    db.select().from(ordersTable).where(and(...smBaseConditions)),
    getProductsForTenant(tenantId),
    getVariantsForTenant(tenantId),
    getManifestsForTenant(tenantId),
    db.select({ manifestId: shippingManifestOrdersTable.manifestId, orderId: shippingManifestOrdersTable.orderId })
      .from(shippingManifestOrdersTable),
  ]);

  const variantMap = new Map<number, number | null>(variants.map(v => [v.id, v.costPrice]));
  const productMap = new Map<number, number | null>(products.map(p => [p.id, p.costPrice]));
  const productImageMap = new Map<string, string | null>(
    products.filter(p => p && p.name).map(p => [String(p.name).trim(), (p as any).image ?? null])
  );
  const liveProducts = products.filter(p => !(p as any).isArchived);
  const productsWithVariants = new Set(variants.map(v => v.productId));

  const variantStockRows = await db
    .select({
      quantity: warehouseStockTable.quantity,
      productId: productVariantsTable.productId,
      costPrice: productVariantsTable.costPrice,
      unitPrice: productVariantsTable.unitPrice,
    })
    .from(warehouseStockTable)
    .innerJoin(productVariantsTable, eq(warehouseStockTable.variantId, productVariantsTable.id))
    .innerJoin(productsTable, and(
      eq(productVariantsTable.productId, productsTable.id),
      eq(productsTable.isArchived, false),
      ...(tenantId !== null ? [eq(productsTable.tenantId, tenantId)] : []),
    ));

  const productStockRows = await db
    .select({
      quantity: warehouseStockTable.quantity,
      costPrice: productsTable.costPrice,
      unitPrice: productsTable.unitPrice,
      productId: productsTable.id,
    })
    .from(warehouseStockTable)
    .innerJoin(productsTable, and(
      eq(warehouseStockTable.productId, productsTable.id),
      eq(productsTable.isArchived, false),
      ...(tenantId !== null ? [eq(productsTable.tenantId, tenantId)] : []),
    ));

  const stockByProductId = new Map<number, number>();
  for (const row of variantStockRows) {
    stockByProductId.set(row.productId, (stockByProductId.get(row.productId) ?? 0) + Math.max(0, row.quantity));
  }
  for (const row of productStockRows) {
    if (productsWithVariants.has(row.productId)) continue;
    stockByProductId.set(row.productId, (stockByProductId.get(row.productId) ?? 0) + Math.max(0, row.quantity));
  }

  // بناء map: orderId → shippingCost من البيان (manualShippingCost ÷ عدد الأوردرات في البيان)
  const manifestOrderCount = new Map<number, number>();
  for (const mo of allManifestOrders) {
    manifestOrderCount.set(mo.manifestId, (manifestOrderCount.get(mo.manifestId) ?? 0) + 1);
  }
  const manifestShippingPerOrder = new Map<number, number>();
  for (const mo of allManifestOrders) {
    const manifest = allManifests.find(m => m.id === mo.manifestId);
    const cost = Number(manifest?.manualShippingCost ?? 0);
    if (cost > 0) {
      const count = manifestOrderCount.get(mo.manifestId) ?? 1;
      manifestShippingPerOrder.set(mo.orderId, (manifestShippingPerOrder.get(mo.orderId) ?? 0) + cost / count);
    }
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── 1. Ad Attribution ────────────────────────────────────────────────────────
  // كل منصة عندها invoiceSet و processedShippingInvoices خاصة بيها
  // الـ manifestCost بيتوزع على كل منصة موجودة في البيان بشكل متناسب
  const sourceMap: Record<string, {
    orders: number; revenue: number; cost: number; profit: number;
    adSpend: number; returned: number; shippingSpend: number;
    invoiceSet: Set<string>; returnedInvoiceSet: Set<string>; processedShippingInvoices: Set<string>;
  }> = {};

  // نبني map: manifestId → { totalOrders, sourceBreakdown } عشان نوزّع تكلفة البيان بالتساوي
  const manifestSourceMap = new Map<number, Map<string, Set<string>>>();
  for (const o of allOrders) {
    const src = o.adSource ?? "unknown";
    const manifestId = allManifestOrders.find(mo => mo.orderId === o.id)?.manifestId;
    if (manifestId !== undefined) {
      if (!manifestSourceMap.has(manifestId)) manifestSourceMap.set(manifestId, new Map());
      const srcMap2 = manifestSourceMap.get(manifestId)!;
      if (!srcMap2.has(src)) srcMap2.set(src, new Set());
      srcMap2.get(src)!.add(o.invoiceNumber ?? `solo-${o.id}`);
    }
  }

  const countedManifestsSI = new Set<number>();

  for (const o of allOrders) {
    const src = o.adSource ?? "unknown";
    if (!sourceMap[src]) sourceMap[src] = {
      orders: 0, revenue: 0, cost: 0, profit: 0, adSpend: 0, returned: 0, shippingSpend: 0,
      invoiceSet: new Set<string>(), returnedInvoiceSet: new Set<string>(), processedShippingInvoices: new Set<string>(),
    };
    const s = sourceMap[src];
    const invoiceKey = o.invoiceNumber ?? `solo-${o.id}`;
    const manifestId = allManifestOrders.find(mo => mo.orderId === o.id)?.manifestId;

    if (o.status === "returned") {
      if (!s.returnedInvoiceSet.has(invoiceKey)) {
        s.returnedInvoiceSet.add(invoiceKey);
        s.returned++;
        // طرح شحن الطلب مرة واحدة لكل فاتورة مرتجعة
        const sc = o.shippingCost ?? 0;
        if (sc > 0) { s.shippingSpend += sc; s.profit -= sc; }
      }
      // طرح حصة المنصة من تكلفة البيان (مرة واحدة لكل منصة لكل بيان)
      if (manifestId !== undefined) {
        const mKey = `${manifestId}_${src}`;
        if (!countedManifestsSI.has(Number(mKey.replace(/[^0-9]/g, '')))) {
          const manifest = allManifests.find(m => m.id === manifestId);
          const totalManifestCost = Number(manifest?.manualShippingCost ?? 0);
          if (totalManifestCost > 0) {
            const srcMapForManifest = manifestSourceMap.get(manifestId);
            const totalOrdersInManifest = srcMapForManifest
              ? Array.from(srcMapForManifest.values()).reduce((sum, set) => sum + set.size, 0)
              : 1;
            const srcOrdersInManifest = srcMapForManifest?.get(src)?.size ?? 1;
            const srcShare = (srcOrdersInManifest / totalOrdersInManifest) * totalManifestCost;
            // تأكد ما تحسبش نفس المنصة في نفس البيان أكتر من مرة
            const manifestSrcKey = manifestId * 10000 + Object.keys(sourceMap).indexOf(src);
            if (!countedManifestsSI.has(manifestSrcKey)) {
              countedManifestsSI.add(manifestSrcKey);
              s.shippingSpend += srcShare;
              s.profit -= srcShare;
            }
          }
        }
      }
      if (!s.invoiceSet.has(invoiceKey)) { s.invoiceSet.add(invoiceKey); s.orders++; }

    } else if (o.status === "received" || o.status === "partial_received") {
      const qty = o.status === "partial_received" ? (o.partialQuantity ?? o.quantity) : o.quantity;
      const rc = resolveCost(o, variantMap, productMap);
      const rev = qty * o.unitPrice;
      const cst = qty * rc;
      s.revenue += rev;
      s.cost += cst;
      s.profit += rev - cst;

      // طرح shippingCost للطلب مرة واحدة لكل فاتورة لكل منصة
      if (!s.processedShippingInvoices.has(invoiceKey)) {
        s.processedShippingInvoices.add(invoiceKey);
        const sc = o.shippingCost ?? 0;
        if (sc > 0) { s.shippingSpend += sc; s.profit -= sc; }
      }

      // طرح حصة المنصة من تكلفة البيان (موزّعة بالتساوي بين المنصات)
      if (manifestId !== undefined) {
        const manifest = allManifests.find(m => m.id === manifestId);
        const totalManifestCost = Number(manifest?.manualShippingCost ?? 0);
        if (totalManifestCost > 0) {
          const srcMapForManifest = manifestSourceMap.get(manifestId);
          const totalOrdersInManifest = srcMapForManifest
            ? Array.from(srcMapForManifest.values()).reduce((sum, set) => sum + set.size, 0)
            : 1;
          const srcOrdersInManifest = srcMapForManifest?.get(src)?.size ?? 1;
          const srcShare = (srcOrdersInManifest / totalOrdersInManifest) * totalManifestCost;
          const manifestSrcKey = manifestId * 10000 + Object.keys(sourceMap).indexOf(src);
          if (!countedManifestsSI.has(manifestSrcKey)) {
            countedManifestsSI.add(manifestSrcKey);
            s.shippingSpend += srcShare;
            s.profit -= srcShare;
          }
        }
      }
      if (!s.invoiceSet.has(invoiceKey)) { s.invoiceSet.add(invoiceKey); s.orders++; }

    } else {
      if (!s.invoiceSet.has(invoiceKey)) { s.invoiceSet.add(invoiceKey); s.orders++; }
    }
  }

  const adBreakdown = Object.entries(sourceMap)
    .map(([source, s]) => ({
      source,
      orders: s.orders,
      revenue: Math.round(s.revenue),
      profit: Math.round(s.profit),
      // نسبة المرتجعات من الطلبات المغلقة فقط
      returnRate: (s.orders - s.returned) + s.returned > 0
        ? Math.round((s.returned / ((s.orders - s.returned) + s.returned)) * 100)
        : 0,
      roi: s.cost > 0 ? Math.round(((s.profit) / s.cost) * 100) : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  const bestSource = adBreakdown.length > 0 ? adBreakdown[0] : null;

  // ── 2. Stars vs Dead Stock ───────────────────────────────────────────────────
  const productStatsMap: Record<string, {
    name: string; revenue: number; cost: number; profit: number;
    quantity: number; orderCount: number; closedCount: number; returnCount: number;
    invoiceSet: Set<string>; returnedInvoiceSet: Set<string>;
  }> = {};

  for (const o of allOrders) {
    const key = o.product.trim();
    if (!productStatsMap[key]) {
      productStatsMap[key] = { name: key, revenue: 0, cost: 0, profit: 0, quantity: 0, orderCount: 0, closedCount: 0, returnCount: 0, invoiceSet: new Set(), returnedInvoiceSet: new Set() };
    }
    const pm = productStatsMap[key];
    const rc = resolveCost(o, variantMap, productMap);
    const sc = o.shippingCost ?? 0;

    // عدّ الفاتورة مرة واحدة فقط
    const invoiceKey = o.invoiceNumber ?? `solo-${o.id}`;
    if (!pm.invoiceSet.has(invoiceKey)) {
      pm.invoiceSet.add(invoiceKey);
      pm.orderCount++;
    }

    if (o.status === "returned") {
      // نعدّ الفاتورة المرتجعة مرة واحدة فقط
      if (!pm.returnedInvoiceSet.has(invoiceKey)) {
        pm.returnedInvoiceSet.add(invoiceKey);
        pm.returnCount++;
        pm.closedCount++;
        // البضاعة رجعت → خسارة الشحن فقط
        pm.profit -= sc;
      }
    } else if (o.status === "received" || o.status === "partial_received") {
      const p = calcOrderProfit({ ...o, shippingCost: sc }, rc);
      const qty = o.status === "partial_received" ? (o.partialQuantity ?? o.quantity) : o.quantity;
      pm.closedCount++;
      pm.revenue += p.revenue;
      pm.cost += p.cost;
      pm.profit += p.netProfit;
      pm.quantity += qty;
    }
  }

  // Track last sale date and 30d sales per product name
  const lastSaleDate = new Map<string, Date>();
  const sales30d = new Map<string, number>();

  for (const o of allOrders) {
    if (o.status === "received" || o.status === "partial_received") {
      const key = o.product.trim();
      const oDate = new Date(o.createdAt);
      if (!lastSaleDate.has(key) || oDate > lastSaleDate.get(key)!) {
        lastSaleDate.set(key, oDate);
      }
      if (oDate >= thirtyDaysAgo) {
        const qty = o.status === "partial_received" ? (o.partialQuantity ?? o.quantity) : o.quantity;
        sales30d.set(key, (sales30d.get(key) ?? 0) + qty);
      }
    }
  }

  const productList = Object.values(productStatsMap).map(p => ({
    ...p,
    // نسبة المرتجعات من الطلبات المغلقة فقط (received + partial_received + returned)
    returnRate: p.closedCount > 0 ? Math.round((p.returnCount / p.closedCount) * 100) : 0,
    margin: p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0,
    revenue: Math.round(p.revenue),
    cost: Math.round(p.cost),
    profit: Math.round(p.profit),
    image: (typeof productImageMap !== 'undefined' ? productImageMap.get(p.name) : null) ?? null,
  }));

  const stars = productList
    .filter(p => p.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  // Dead stock: products with available inventory but fewer than 5 units sold in 30d
  const deadStock = liveProducts
    .map(p => {
      const key = p.name.trim();
      const avail = stockByProductId.get(p.id) ?? 0;
      const s30 = sales30d.get(key) ?? 0;
      const last = lastSaleDate.get(key);
      const daysSinceLastSale = last
        ? Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const frozenCapital = avail * (p.costPrice ?? 0);
      return { name: key, availableQty: avail, frozenCapital: Math.round(frozenCapital), last30DaysSales: s30, daysSinceLastSale, image: (() => { try { return productImageMap.get(key) ?? null; } catch { return null; } })() };
    })
    .filter(p => p.availableQty > 0 && p.last30DaysSales < 5)
    .sort((a, b) => b.frozenCapital - a.frozenCapital)
    .slice(0, 8);

  // ── 3. Return Insights ────────────────────────────────────
  const returnedOrders = allOrders.filter(o => o.status === "returned");

  // حساب بالفاتورة — orders نفس الفاتورة تتحسب مرة واحدة فقط
  const seenInvoices = new Set<string>();
  const uniqueReturnedUnits: typeof returnedOrders = [];
  for (const o of returnedOrders) {
    const inv = (o as any).invoiceNumber as string | null;
    if (inv) {
      if (seenInvoices.has(inv)) continue;
      seenInvoices.add(inv);
    }
    uniqueReturnedUnits.push(o);
  }

  const reasonCount: Record<string, number> = {};
  const otherNoteCount: Record<string, number> = {};
  let noReasonCount = 0;

  for (const o of uniqueReturnedUnits) {
    const reason = (o as any).returnReason ?? "__none__";
    if (reason === "__none__") { noReasonCount++; continue; }
    reasonCount[reason] = (reasonCount[reason] ?? 0) + 1;
    if (reason === "other") {
      const note = ((o as any).returnNote as string | null)?.trim();
      if (note) otherNoteCount[note] = (otherNoteCount[note] ?? 0) + 1;
    }
  }

  const REASON_LABELS: Record<string, string> = {
    size_mismatch: "مقاس غير مناسب",
    quality: "جودة المنتج",
    customer_refused: "عميل غير جاد",
    customer_requested_return: "طلب العميل مرتجع",
    delay: "التأخير على العميل",
    other: "سبب آخر",
  };

  const totalReturns = uniqueReturnedUnits.length;

  const otherTotal = reasonCount["other"] ?? 0;
  const otherNotesEntries = Object.entries(otherNoteCount).sort((a: any, b: any) => b[1] - a[1]);
  const otherWithoutNote = otherTotal - otherNotesEntries.reduce((s: number, [, c]: any) => s + c, 0);

  const expandedReasons: Array<{ reason: string; label: string; count: number; pct: number }> = [];
  for (const [reason, count] of Object.entries(reasonCount)) {
    if (reason === "other") {
      for (const [note, cnt] of otherNotesEntries as any) {
        expandedReasons.push({ reason: "other_note", label: note as string, count: cnt, pct: totalReturns > 0 ? Math.round((cnt / totalReturns) * 100) : 0 });
      }
      if (otherWithoutNote > 0) {
        expandedReasons.push({ reason: "other", label: "سبب آخر (غير مفصّل)", count: otherWithoutNote, pct: totalReturns > 0 ? Math.round((otherWithoutNote / totalReturns) * 100) : 0 });
      }
    } else {
      expandedReasons.push({ reason, label: REASON_LABELS[reason] ?? reason, count, pct: totalReturns > 0 ? Math.round((count / totalReturns) * 100) : 0 });
    }
  }

  const byReason = [
    ...expandedReasons,
    ...(noReasonCount > 0 ? [{ reason: "__none__", label: "غير محدد", count: noReasonCount, pct: Math.round((noReasonCount / totalReturns) * 100) }] : []),
  ].sort((a, b) => b.count - a.count);

  // نسبة المرتجعات من الطلبات المغلقة فقط (received + partial_received + returned)
  const closedOrdersCount = allOrders.filter(o => ["received", "partial_received", "returned"].includes(o.status)).length;
  const totalReturnRate = closedOrdersCount > 0 ? Math.round((totalReturns / closedOrdersCount) * 100) : 0;

  // High return products (>= 50%, min 3 closed orders)
  const highReturnProducts = productList
    .filter(p => p.closedCount >= 3 && p.returnRate >= 50)
    .sort((a, b) => b.returnRate - a.returnRate)
    .map(p => ({ name: p.name, returnRate: p.returnRate, returnCount: p.returnCount, orderCount: p.closedCount }));

  // ── 4. Stock Predictor ───────────────────────────────────────────────────────
  const stockPredictor = liveProducts
    .map(p => {
      const key = p.name.trim();
      const avail = stockByProductId.get(p.id) ?? 0;
      const sold30 = sales30d.get(key) ?? 0;
      const velocity = sold30 / 30;
      const daysUntilStockout = avail > 0 && velocity > 0 ? Math.round(avail / velocity) : null;
      const frozenCapital = avail * (p.costPrice ?? 0);
      return { name: key, availableQty: avail, velocityPerDay: Math.round(velocity * 100) / 100, daysUntilStockout, frozenCapital: Math.round(frozenCapital) };
    })
    .filter(p => p.daysUntilStockout !== null && p.daysUntilStockout <= 14 && p.availableQty > 0)
    .sort((a, b) => (a.daysUntilStockout ?? 999) - (b.daysUntilStockout ?? 999))
    .slice(0, 8);

  const siResult = {
    adAttribution: { bestSource, breakdown: adBreakdown },
    stars,
    deadStock,
    returnInsights: { byReason, highReturnProducts, totalReturnRate, totalReturns },
    stockPredictor,
  };
  setCached(siCacheKey, siResult, 15 * 60 * 1000); // 15 min cache
  res.json(siResult);
  } catch (err) {
    console.error("[analytics/smart-insights]", err);
    res.status(500).json({ error: "فشل تحميل التحليلات الذكية", detail: String(err) });
  }
});

// ─── GET /api/analytics/charts ──────────────────────────────────────────────
// Returns all data needed for visual charts: status breakdown, weekly sales, ad sources
router.get("/analytics/charts", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const chartsCacheKey = `charts:${tenantId ?? "global"}`;
  const chartsCached = getCached<any>(chartsCacheKey);
  if (chartsCached) { res.json(chartsCached); return; }
  const chartsBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) chartsBaseConditions.push(eq(ordersTable.tenantId, tenantId));

  const manifestsChartConditions: any[] = [];
  if (tenantId !== null) manifestsChartConditions.push(sql.raw(`shipping_manifests.tenant_id = ${tenantId}`));

  const [allOrders, chartsManifests, chartsManifestOrders] = await Promise.all([
    db.select().from(ordersTable).where(and(...chartsBaseConditions)),
    db.select({ id: shippingManifestsTable.id, manualShippingCost: shippingManifestsTable.manualShippingCost })
      .from(shippingManifestsTable)
      .where(manifestsChartConditions.length ? and(...manifestsChartConditions) : undefined),
    db.select({ manifestId: shippingManifestOrdersTable.manifestId, orderId: shippingManifestOrdersTable.orderId })
      .from(shippingManifestOrdersTable),
  ]);

  // بناء chartsManifestOrders و chartsManifests لاستخدامها لاحقاً في حساب الإيرادات

  // Group by invoiceNumber — multi-product invoices count as ONE order
  type InvoiceGroup = {
    invoiceKey: string;
    status: string;
    createdAt: Date;
    adSource: string | null;
    revenue: number;
  };

  // نجمع كل الحالات لكل invoice — نفس منطق صفحة الطلبات تماماً
  // invoice بتتحسب بحالة X بس لو كل rows فيها بحالة X
  type InvoiceRaw = {
    invoiceKey: string;
    statuses: Set<string>;
    createdAt: Date;
    adSource: string | null;
    revenue: number;
  };
  const invoiceMapRaw = new Map<string, InvoiceRaw>();
  // نفس منطق financial-summary بالضبط:
  // شحن الأوردر (o.shippingCost) → يُطرح مرة واحدة لكل فاتورة
  // شحن البيان (manualShippingCost) → يُطرح مرة واحدة للبيان كله من أول أوردر مكتمل ينتمي له
  const chartsProcessedShippingInvoices = new Set<string>();
  const chartsCountedManifests = new Set<number>();
  const chartsOrderToManifest = new Map<number, number>();
  for (const mo of chartsManifestOrders) chartsOrderToManifest.set(mo.orderId, mo.manifestId);
  const chartsManifestMap = new Map(chartsManifests.map(m => [m.id, m]));

  for (const o of allOrders) {
    const key = o.invoiceNumber ?? `solo-${o.id}`;
    if (!invoiceMapRaw.has(key)) {
      invoiceMapRaw.set(key, {
        invoiceKey: key,
        statuses: new Set(),
        createdAt: o.createdAt,
        adSource: o.adSource ?? null,
        revenue: 0,
      });
    }
    const grp = invoiceMapRaw.get(key)!;
    grp.statuses.add(o.status);
    if (o.status === "received" || o.status === "partial_received") {
      const qty = o.status === "partial_received" ? (o.partialQuantity ?? o.quantity) : o.quantity;
      grp.revenue += qty * o.unitPrice;
      // طرح شحن الأوردر مرة واحدة لكل فاتورة
      if (!chartsProcessedShippingInvoices.has(key)) {
        chartsProcessedShippingInvoices.add(key);
        grp.revenue -= (o.shippingCost ?? 0);
      }
      // طرح تكلفة البيان مرة واحدة للبيان كله
      const manifestId = chartsOrderToManifest.get(o.id);
      if (manifestId !== undefined && !chartsCountedManifests.has(manifestId)) {
        chartsCountedManifests.add(manifestId);
        grp.revenue -= Number(chartsManifestMap.get(manifestId)?.manualShippingCost ?? 0);
      }
    }
  }
  // حوّل لـ invoiceMap: نفس منطق صفحة الطلبات — أولوية الحالات
  // لو كل rows بحالة واحدة → استخدمها مباشرة
  // لو مختلطة → استخدم الحالة الأكثر "نشاطاً" (أولوية: pending > in_shipping > warehouse_ready > delayed > partial_received > received > returned)
  const STATUS_PRIORITY: Record<string, number> = {
    pending: 1,
    in_shipping: 2,
    warehouse_ready: 3,
    delayed: 4,
    partial_received: 5,
    received: 6,
    returned: 7,
  };
  const invoiceMap = new Map<string, InvoiceGroup>();
  for (const [key, raw] of invoiceMapRaw.entries()) {
    let resolvedStatus: string;
    if (raw.statuses.size === 1) {
      resolvedStatus = Array.from(raw.statuses)[0];
    } else {
      // اختار الحالة الأقل رقماً (الأكثر نشاطاً)
      resolvedStatus = Array.from(raw.statuses).sort(
        (a, b) => (STATUS_PRIORITY[a] ?? 99) - (STATUS_PRIORITY[b] ?? 99)
      )[0];
    }
    invoiceMap.set(key, {
      invoiceKey: key,
      status: resolvedStatus,
      createdAt: raw.createdAt,
      adSource: raw.adSource,
      revenue: raw.revenue,
    });
  }

  const invoices = Array.from(invoiceMap.values());
  const total = invoices.length;

  // نجمع الـ invoiceKeys لكل status عشان نقدر نجيب الطلبات بناءً عليها
  const statusInvoiceKeys: Record<string, string[]> = {};
  const statusCounts: Record<string, number> = {};
  for (const inv of invoices) {
    statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1;
    if (!statusInvoiceKeys[inv.status]) statusInvoiceKeys[inv.status] = [];
    statusInvoiceKeys[inv.status].push(inv.invoiceKey);
  }
  const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
    invoiceKeys: statusInvoiceKeys[status] ?? [],
  }));

  const days: { date: string; label: string; orders: number; revenue: number }[] = [];
  const prevDays: { date: string; label: string; orders: number; revenue: number }[] = [];
  const monthDays: { date: string; label: string; orders: number; revenue: number }[] = [];
  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  // الأسبوع الحالي (آخر 7 أيام)
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    days.push({ date: dateStr, label: dayNames[d.getDay()], orders: 0, revenue: 0 });
  }
  // الأسبوع السابق (الـ 7 أيام قبلها)
  for (let i = 13; i >= 7; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    prevDays.push({ date: dateStr, label: dayNames[d.getDay()], orders: 0, revenue: 0 });
  }
  // الشهر الحالي (من أول الشهر حتى اليوم)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const today = now.getDate();
  for (let day = 1; day <= today; day++) {
    const d = new Date(currentYear, currentMonth, day);
    const dateStr = d.toISOString().split("T")[0];
    monthDays.push({ date: dateStr, label: String(day), orders: 0, revenue: 0 });
  }

  for (const inv of invoices) {
    const dateStr = new Date(inv.createdAt).toISOString().split("T")[0];
    const day = days.find(d => d.date === dateStr);
    if (day) { day.orders += 1; day.revenue += inv.revenue; }
    const prev = prevDays.find(d => d.date === dateStr);
    if (prev) { prev.orders += 1; prev.revenue += inv.revenue; }
    const monthDay = monthDays.find(d => d.date === dateStr);
    if (monthDay) { monthDay.orders += 1; monthDay.revenue += inv.revenue; }
  }

  // إحصائيات مقارنة الأسبوعين
  const thisWeekTotal  = days.reduce((s, d) => s + d.orders, 0);
  const prevWeekTotal  = prevDays.reduce((s, d) => s + d.orders, 0);
  const thisWeekRev    = days.reduce((s, d) => s + d.revenue, 0);
  const prevWeekRev    = prevDays.reduce((s, d) => s + d.revenue, 0);
  const ordersChange   = prevWeekTotal > 0 ? Math.round(((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100) : null;
  const revenueChange  = prevWeekRev   > 0 ? Math.round(((thisWeekRev   - prevWeekRev)   / prevWeekRev)   * 100) : null;
  const weekComparison = {
    thisWeek:     { orders: thisWeekTotal, revenue: Math.round(thisWeekRev) },
    prevWeek:     { orders: prevWeekTotal, revenue: Math.round(prevWeekRev) },
    ordersChange,
    revenueChange,
    prevWeekDays: prevDays,
  };

  const sourceCounts: Record<string, number> = {};
  for (const inv of invoices) {
    const src = inv.adSource ?? "other";
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
  }
  const adSourceBreakdown = Object.entries(sourceCounts)
    .map(([source, count]) => ({
      source,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const chartsResult = { statusBreakdown, weeklySales: days, monthlySales: monthDays, adSourceBreakdown, total, weekComparison,
    _debug: { shippingFromOrders: [...chartsProcessedShippingInvoices].length, shippingFromManifests: chartsCountedManifests.size, totalRevenue: invoices.reduce((s,i)=>s+i.revenue,0) }
  };
  setCached(chartsCacheKey, chartsResult, 30 * 1000); // 30 sec cache â€” real-time friendly
  res.json(chartsResult);
});

// ─── GET /api/analytics/monthly-sales ─────────────────────────────────────────
// يجيب مبيعات شهر معين: ?month=YYYY-MM (default = الشهر الحالي)
router.get("/analytics/monthly-sales", requireAuth, async (req, res): Promise<void> => {
  const monthParam = req.query.month as string | undefined;
  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  let year: number, month: number;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    [year, month] = monthParam.split("-").map(Number);
    month -= 1; // 0-indexed
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const lastDay = isCurrentMonth ? today.getDate() : daysInMonth;

  const monthDays: { date: string; label: string; orders: number; revenue: number }[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    const dateStr = d.toISOString().split("T")[0];
    monthDays.push({ date: dateStr, label: String(day), orders: 0, revenue: 0 });
  }

  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59);

  const tenantId = getTenantId(req);
  const msBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) msBaseConditions.push(eq(ordersTable.tenantId, tenantId));
  const allOrders = await db.select().from(ordersTable).where(and(...msBaseConditions));

  // group by invoice
  const invoiceMap = new Map<string, { status: string; createdAt: Date; revenue: number }>();
  for (const o of allOrders) {
    const created = new Date(o.createdAt);
    if (created < startDate || created > endDate) continue;
    const key = o.invoiceNumber ?? `solo-${o.id}`;
    if (!invoiceMap.has(key)) {
      invoiceMap.set(key, { status: o.status, createdAt: created, revenue: 0 });
    }
    const grp = invoiceMap.get(key)!;
    grp.status = o.status;
    grp.revenue += o.totalPrice;
  }

  for (const inv of invoiceMap.values()) {
    const dateStr = inv.createdAt.toISOString().split("T")[0];
    const dayEntry = monthDays.find(d => d.date === dateStr);
    if (dayEntry) { dayEntry.orders += 1; dayEntry.revenue += inv.revenue; }
  }

  const totalOrders = monthDays.reduce((s, d) => s + d.orders, 0);
  const totalRevenue = monthDays.reduce((s, d) => s + d.revenue, 0);

  res.json({
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    days: monthDays,
    totalOrders,
    totalRevenue: Math.round(totalRevenue),
    daysCount: lastDay,
    avgPerDay: lastDay > 0 ? (totalOrders / lastDay).toFixed(1) : "0.0",
  });
});

// ─── GET /api/analytics/orders-by-status ─────────────────────────────────────
// يجيب الطلبات الفعلية المرتبطة بالـ statusBreakdown في الداشبورد
// بيستخدم نفس منطق grouping الـ charts endpoint بدقة
router.get("/analytics/orders-by-status", requireAuth, async (req, res): Promise<void> => {
  const status = req.query.status as string;
  if (!status) { res.status(400).json({ error: "status required" }); return; }

  const tenantId = getTenantId(req);
  const obsBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) obsBaseConditions.push(eq(ordersTable.tenantId, tenantId));
  const allOrders = await db
    .select()
    .from(ordersTable)
    .where(and(...obsBaseConditions))
    .orderBy(desc(ordersTable.createdAt));

  // نفس منطق charts بالظبط: أولوية الحالات للـ invoices المختلطة
  const STATUS_PRIO: Record<string, number> = {
    pending: 1, in_shipping: 2, warehouse_ready: 3, delayed: 4,
    partial_received: 5, received: 6, returned: 7,
  };
  const invoiceMap = new Map<string, { invoiceKey: string; statuses: Set<string>; rows: typeof allOrders }>();
  for (const o of allOrders) {
    const key = o.invoiceNumber ?? `solo-${o.id}`;
    if (!invoiceMap.has(key)) {
      invoiceMap.set(key, { invoiceKey: key, statuses: new Set(), rows: [] });
    }
    const grp = invoiceMap.get(key)!;
    grp.statuses.add(o.status);
    grp.rows.push(o);
  }
  const resolveInvStatus = (statuses: Set<string>): string => {
    if (statuses.size === 1) return Array.from(statuses)[0];
    return Array.from(statuses).sort(
      (a, b) => (STATUS_PRIO[a] ?? 99) - (STATUS_PRIO[b] ?? 99)
    )[0];
  };

  // فلتر بالـ status المطلوب بعد تطبيق الأولوية
  const matchedGroups = Array.from(invoiceMap.values()).filter(g => resolveInvStatus(g.statuses) === status);

  // نبني الـ response: كل invoice = row واحد merged
  const result = matchedGroups.map(grp => {
    const rows = grp.rows;
    if (rows.length === 1) return rows[0];
    const rep = { ...rows[0] } as any;
    rep.totalPrice = rows.reduce((s, o) => s + o.totalPrice, 0);
    rep.quantity   = rows.reduce((s, o) => s + o.quantity, 0);
    rep.product    = rows.map(o => `${o.product}×${o.quantity}`).join("، ");
    return rep;
  });

  res.json(result);
});

// ─── GET /api/analytics/shipping-followup ───────────────────────────────────
// Returns in_shipping orders (grouped by invoice) pending > 3 days
// daysPending = based on createdAt (oldest date) to avoid reset on edits
router.get("/analytics/shipping-followup", requireAuth, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);

  // جيب كل الطلبات اللي ستاتوسها in_shipping ومش محذوفة
  const sfBaseConditions: any[] = [
    isNull(ordersTable.deletedAt),
    eq(ordersTable.status, "in_shipping" as any),
  ];
  if (tenantId !== null) sfBaseConditions.push(eq(ordersTable.tenantId, tenantId));

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...sfBaseConditions))
    .orderBy(desc(ordersTable.createdAt));

  const shippingCompanies = tenantId !== null
    ? await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
    : await db.select().from(shippingCompaniesTable);
  const companyMap = new Map(shippingCompanies.map(c => [c.id, c.name]));

  // ── Group by invoiceNumber (فاتورة واحدة = صف واحد) ──────────────────────
  const invoiceMap = new Map<string, {
    id: number;
    customerName: string;
    phone: string | null;
    city: string | null;
    product: string;
    trackingNumber: string | null;
    shippingCompanyId: number | null;
    totalPrice: number;
    createdAt: Date;
    quantity: number;
  }>();

  for (const o of orders) {
    const key = o.invoiceNumber?.trim() || `solo-${o.id}`;
    if (!invoiceMap.has(key)) {
      invoiceMap.set(key, {
        id: o.id,
        customerName: o.customerName,
        phone: o.phone ?? null,
        city: o.city ?? null,
        // اسم المنتج: سيُجمّع لو نفس الفاتورة فيها أكتر من منتج
        product: `${o.product}×${o.quantity}`,
        trackingNumber: o.trackingNumber ?? null,
        shippingCompanyId: o.shippingCompanyId ?? null,
        totalPrice: o.totalPrice,
        createdAt: new Date(o.createdAt),
        quantity: o.quantity,
      });
    } else {
      const grp = invoiceMap.get(key)!;
      grp.totalPrice += o.totalPrice;
      grp.quantity   += o.quantity;
      grp.product    += `، ${o.product}×${o.quantity}`;
      // تتبع وشركة الشحن من أي صف متاح
      if (!grp.trackingNumber && o.trackingNumber) grp.trackingNumber = o.trackingNumber;
      if (!grp.shippingCompanyId && o.shippingCompanyId) grp.shippingCompanyId = o.shippingCompanyId;
      // الأقدم = أساس الحساب
      const oDate = new Date(o.createdAt);
      if (oDate < grp.createdAt) grp.createdAt = oDate;
    }
  }

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const result = Array.from(invoiceMap.values())
    .map(grp => ({
      id: grp.id,
      customerName: grp.customerName,
      phone: grp.phone,
      product: grp.product,
      city: grp.city,
      trackingNumber: grp.trackingNumber,
      shippingCompany: grp.shippingCompanyId ? companyMap.get(grp.shippingCompanyId) ?? null : null,
      // ✅ الإصلاح: daysPending من createdAt مش updatedAt
      daysPending: Math.floor((now - grp.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      totalPrice: grp.totalPrice,
      createdAt: grp.createdAt,
    }))
    // ✅ الإصلاح: فلتر هنا بعد الـ grouping بدل ما يكون في الـ query
    .filter(r => (now - new Date(r.createdAt).getTime()) >= THREE_DAYS_MS)
    .sort((a, b) => b.daysPending - a.daysPending);

  res.json(result);
});

// ── Cache warming on startup ──────────────────────────────────────────────────
// يحمّل البيانات الثقيلة في الخلفية لما السيرفر يبدأ عشان أول طلب يكون فوري
export async function warmAnalyticsCache() {
  try {
    // نستخدم null كـ global tenant للـ warming
    const cacheKey = `product-performance:null`;
    if (getCached(cacheKey)) return; // موجود بالفعل

    const ppBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
    const [allOrders, products, variants] = await Promise.all([
      db.select({
        id: ordersTable.id, product: ordersTable.product,
        productId: ordersTable.productId, variantId: ordersTable.variantId,
        quantity: ordersTable.quantity, partialQuantity: ordersTable.partialQuantity,
        unitPrice: ordersTable.unitPrice, costPrice: ordersTable.costPrice,
        shippingCost: ordersTable.shippingCost, status: ordersTable.status,
        invoiceNumber: ordersTable.invoiceNumber,
      }).from(ordersTable).where(and(...ppBaseConditions)),
      db.select().from(productsTable),
      db.select({ id: productVariantsTable.id, costPrice: productVariantsTable.costPrice }).from(productVariantsTable),
    ]);
    console.log(`[cache-warm] product-performance: ${allOrders.length} orders loaded`);
  } catch (e) {
    console.warn("[cache-warm] product-performance failed:", e);
  }
}

// ─── Shipments Status Breakdown ───────────────────────────────────────────────
router.get("/analytics/shipments-status", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const conditions: any[] = [isNull(shipmentsTable.deletedAt)];
    if (tenantId !== null) conditions.push(eq(shipmentsTable.tenantId, tenantId));

    const rows = await db
      .select({ status: shipmentsTable.status, count: count() })
      .from(shipmentsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(shipmentsTable.status);

    // normalize legacy statuses to new ones
    const LEGACY_MAP: Record<string, string> = {
      picked_up:        "warehouse_ready",
      in_transit:       "in_shipping",
      out_for_delivery: "in_shipping",
      delivered:        "received",
      waiting:          "pending",
      confirmed:        "pending",
      cancelled:        "returned",
    };
    const total = rows.reduce((s, r) => s + Number(r.count), 0);
    // merge after normalization
    const merged: Record<string, number> = {};
    for (const r of rows) {
      const key = r.status ? (LEGACY_MAP[r.status] ?? r.status) : "pending";
      merged[key] = (merged[key] ?? 0) + Number(r.count);
    }
    const statusBreakdown = Object.entries(merged).map(([status, count]) => ({
      status,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

    res.json({ statusBreakdown, total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/shipment-charts ──────────────────────────────────────────
// بيانات الشحنات الأسبوعية والشهرية للداشبورد
router.get("/analytics/shipment-charts", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `shipment-charts:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    // ─── تحويل أي تاريخ لصيغة YYYY-MM-DD بتوقيت القاهرة (يمنع انزلاق اليوم بسبب UTC) ───
    const localDateStr = (d: Date): string =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

    const now = new Date();

    // ─── الأسبوع الحالي (من الأحد حتى اليوم) ────────────────────────────────
    const dayOfWeek = now.getDay(); // 0=sun
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);

    // ─── الأسبوع الماضي ───────────────────────────────────────────────────────
    const prevWeekEnd = new Date(weekStart);
    prevWeekEnd.setDate(weekStart.getDate() - 1);
    prevWeekEnd.setHours(23, 59, 59, 999);
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekEnd.getDate() - 6);
    prevWeekStart.setHours(0, 0, 0, 0);

    // ─── الشهر الحالي ─────────────────────────────────────────────────────────
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    // جلب كل الشحنات من بداية الشهر الحالي وما قبله (أسبوعان)
    const fromDate = prevWeekStart < monthStart ? prevWeekStart : monthStart;

    const allShipments = await db
      .select({
        id: shipmentsTable.id,
        status: shipmentsTable.status,
        createdAt: shipmentsTable.createdAt,
        codAmount: shipmentsTable.codAmount,
        shippingFee: shipmentsTable.shippingFee,
        collectedAmount: shipmentsTable.collectedAmount,
      })
      .from(shipmentsTable)
      .where(and(cond, gte(shipmentsTable.createdAt, fromDate)));

    // ─── helper: بناء array أيام ──────────────────────────────────────────────
    function buildDays(start: Date, end: Date) {
      const days: { date: string; label: string; count: number; codAmount: number }[] = [];
      const cur = new Date(start);
      const DAY_LABELS = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];
      while (cur <= end) {
        const dateStr = localDateStr(cur);
        const dayLabel = DAY_LABELS[cur.getDay()];
        const mmdd = `${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getDate()).padStart(2, "0")}`;
        days.push({ date: dateStr, label: dayLabel + " " + mmdd, count: 0, codAmount: 0 });
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    }

    const weekDays     = buildDays(weekStart, now);
    const prevWeekDays = buildDays(prevWeekStart, prevWeekEnd);
    const monthDays    = buildDays(monthStart, now);

    // ─── تعبئة البيانات ───────────────────────────────────────────────────────
    for (const s of allShipments) {
      const dateStr = localDateStr(new Date(s.createdAt));
      const cod = Number(s.codAmount ?? 0);

      for (const arr of [weekDays, prevWeekDays, monthDays]) {
        const day = arr.find(d => d.date === dateStr);
        if (day) { day.count++; day.codAmount += cod; }
      }
    }

    // ─── إحصائيات المقارنة بين الأسبوعين ─────────────────────────────────────
    const thisWeekTotal  = weekDays.reduce((s, d) => s + d.count, 0);
    const prevWeekTotal  = prevWeekDays.reduce((s, d) => s + d.count, 0);
    const thisWeekCod    = weekDays.reduce((s, d) => s + d.codAmount, 0);
    const prevWeekCod    = prevWeekDays.reduce((s, d) => s + d.codAmount, 0);
    const countChange    = prevWeekTotal > 0 ? Math.round(((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100) : null;
    const codChange      = prevWeekCod   > 0 ? Math.round(((thisWeekCod   - prevWeekCod)   / prevWeekCod)   * 100) : null;

    // ─── توزيع حالات الشحنات للأسبوع الحالي ─────────────────────────────────
    const statusMap: Record<string, number> = {};
    for (const s of allShipments) {
      const dateStr = localDateStr(new Date(s.createdAt));
      const isThisWeek = weekDays.some(d => d.date === dateStr);
      if (isThisWeek) {
        statusMap[s.status] = (statusMap[s.status] ?? 0) + 1;
      }
    }

    const result = {
      weeklyShipments:  weekDays,
      monthlyShipments: monthDays,
      weekComparison: {
        thisWeek: { count: thisWeekTotal, codAmount: thisWeekCod },
        prevWeek: { count: prevWeekTotal, codAmount: prevWeekCod, days: prevWeekDays },
        countChange,
        codChange,
      },
      statusBreakdownThisWeek: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
    };

    setCached(cacheKey, result, 5 * 60 * 1000); // cache 5 دقائق
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
