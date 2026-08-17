import { Router, type IRouter } from "express";
import { db, ordersTable, productsTable, productVariantsTable, shippingCompaniesTable, shippingManifestsTable, shippingManifestOrdersTable, warehouseStockTable, warehousesTable, inventoryMovementsTable, shipmentsTable, shipmentRatingsTable, usersTable, sessionLogsTable, shipmentManifestsTable, shipmentManifestItemsTable, expensesTable, cashTransactionsTable, receiverClientsTable, clientsTable, zoneCostsTable, shipmentZonesTable, appSettingsTable } from "@workspace/db";
import { eq, isNull, and, or, desc, lte, gte, sql, inArray, count, isNotNull } from "drizzle-orm";
import { requireAdmin, requirePermission } from "../middlewares/requireRole.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getTenantId } from "../middlewares/requireTenant.js";
import { computeNetRevenueDueForAllClients, computeExpectedRevenueTotalForTenant } from "../lib/clientAccountBalance.js";

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
  // امسح كل الـ keys اللي فيها smart-insights أو analytics-profit أو analytics-alerts أو analytics-financial
  for (const key of analyticsCache.keys()) {
    if (key.startsWith(`smart-insights:${tenantId ?? "global"}`) ||
        key.startsWith(`analytics-profit:${tenantId ?? "global"}`) ||
        key.startsWith(`analytics-alerts:${tenantId ?? "global"}`) ||
        key.startsWith(`analytics-financial:${tenantId ?? "global"}`)) {
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
    ? db.select({ id: shippingManifestsTable.id, status: shippingManifestsTable.status, manualShippingCost: shippingManifestsTable.manualShippingCost, createdAt: shippingManifestsTable.createdAt }).from(shippingManifestsTable).where(sql.raw(`shipping_manifests.tenant_id = ${tenantId}`))
    : db.select({ id: shippingManifestsTable.id, status: shippingManifestsTable.status, manualShippingCost: shippingManifestsTable.manualShippingCost, createdAt: shippingManifestsTable.createdAt }).from(shippingManifestsTable);
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

  // كروت اليوم/الأسبوع/الشهر لازم تتحسب دايمًا من كل الأوردرات (allOrdersRaw)
  // مش من allOrders (اللي بيتفلتر بالـ period/from/to القادم من الفرونت)
  // عشان لو المستخدم واقف على فلتر "أسبوع" مثلاً، كارت "الشهر" لازم يفضل يعرض إجمالي الشهر كامل
  const today = periodStats(filterByPeriod(allOrdersRaw, startOfToday), variantMap, productMap, shippingPerOrder);
  const week = periodStats(filterByPeriod(allOrdersRaw, startOfWeek), variantMap, productMap, shippingPerOrder);
  const month = periodStats(filterByPeriod(allOrdersRaw, startOfMonth), variantMap, productMap, shippingPerOrder);
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

  const fsShipmentConditions: any[] = [isNull(shipmentsTable.deletedAt)];
  if (tenantId !== null) fsShipmentConditions.push(eq(shipmentsTable.tenantId, tenantId));

  const [allOrdersRaw, products, variants, allManifests, allManifestOrders, pendingShipmentsRaw, openShipmentManifests, shipmentManifestItemsRaw] = await Promise.all([
    db.select().from(ordersTable).where(and(...fsBaseConditions)),
    getProductsForTenant(tenantId),
    getVariantsForTenant(tenantId),
    getManifestsForTenant(tenantId),
    db.select({ manifestId: shippingManifestOrdersTable.manifestId, orderId: shippingManifestOrdersTable.orderId })
      .from(shippingManifestOrdersTable),
    db.select({ id: shipmentsTable.id, status: shipmentsTable.status, codAmount: shipmentsTable.codAmount })
      .from(shipmentsTable).where(and(...fsShipmentConditions)),
    db.select({ id: shipmentManifestsTable.id })
      .from(shipmentManifestsTable).where(eq(shipmentManifestsTable.status, "open")),
    db.select({ manifestId: shipmentManifestItemsTable.manifestId, shipmentId: shipmentManifestItemsTable.shipmentId })
      .from(shipmentManifestItemsTable),
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
    }
  }

  // "في الطريق" = مؤشر لحظي (snapshot) — بيتحسب من نظام shipments/shipment_manifests
  // (النظام الفعلي المستخدم للمناديب)، بغض النظر عن فلتر التاريخ المختار
  const openShipmentManifestIds = new Set(openShipmentManifests.map(m => m.id));
  const pendingShipmentIdsFromManifests = new Set(
    shipmentManifestItemsRaw.filter(mi => openShipmentManifestIds.has(mi.manifestId)).map(mi => mi.shipmentId)
  );
  for (const s of pendingShipmentsRaw) {
    if (
      (s.status === "in_transit" || s.status === "delayed") &&
      pendingShipmentIdsFromManifests.has(s.id)
    ) {
      pendingRevenue += Number(s.codAmount ?? 0);
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

// ─── Helper: نفس منطق manifests-pnl-summary لكن قابل لإعادة الاستخدام ────────
// (بيستخدمه route الخاص بيه وكمان executive-summary عشان الرقمين يفضلوا متطابقين
// ومبنيين على نفس مصدر الحقيقة — بيانات المناديب المقفولة + مصروفات الخزنة الفعلية).
async function computeManifestsPnl(tenantId: number | null, fromDate: Date | null, toDate: Date | null) {
  const manifestConditions: any[] = [eq(shipmentManifestsTable.status, "closed")];
  if (tenantId !== null) manifestConditions.push(eq(shipmentManifestsTable.tenantId, tenantId));
  if (fromDate) manifestConditions.push(gte(shipmentManifestsTable.closedAt, fromDate));
  if (toDate) manifestConditions.push(lte(shipmentManifestsTable.closedAt, toDate));

  const rows = await db
    .select({
      deliveryStatus: shipmentManifestItemsTable.deliveryStatus,
      returnReason: shipmentManifestItemsTable.returnReason,
      partialQuantity: shipmentManifestItemsTable.partialQuantity,
      returnValueReceived: shipmentManifestItemsTable.returnValueReceived,
      deliveredValueReceived: shipmentManifestItemsTable.deliveredValueReceived,
      codAmount: shipmentsTable.codAmount,
      shippingFee: shipmentsTable.shippingFee,
      zoneId: shipmentsTable.zoneId,
      returnReceived: shipmentManifestItemsTable.returnReceived,
      shippingCompanyId: shipmentManifestsTable.shippingCompanyId,
    })
    .from(shipmentManifestItemsTable)
    .innerJoin(shipmentManifestsTable, eq(shipmentManifestItemsTable.manifestId, shipmentManifestsTable.id))
    .innerJoin(shipmentsTable, eq(shipmentManifestItemsTable.shipmentId, shipmentsTable.id))
    .where(and(...manifestConditions));

  const RETURN_REASONS_WITH_SHIPPING_COST = ["refused_paid", "refused_unpaid", "quality"];

  // الإيراد هنا هو كل ما تم تحصيله من الشحنات المؤهلة، قبل خصم أي مصروف.
  // لا نستخدم صافي رسوم الشحن لهذا الرقم حتى يظل مطابقًا لإجمالي الإيرادات
  // الظاهر في مركز العمليات.
  let totalRevenue = 0;
  let eligibleCount = 0;
  let returnCount = 0;

  for (const r of rows) {
    const isEligible =
      r.deliveryStatus === "delivered" ||
      r.deliveryStatus === "partial_delivered" ||
      (r.deliveryStatus === "returned" && RETURN_REASONS_WITH_SHIPPING_COST.includes(r.returnReason ?? ""));
    if (!isEligible) continue;

    eligibleCount++;
    if (r.deliveryStatus === "returned") returnCount++;

    if (r.deliveryStatus === "partial_delivered" && r.partialQuantity != null) {
      totalRevenue += Number(r.partialQuantity);
    } else if (r.deliveryStatus === "returned") {
      totalRevenue += Number(r.returnValueReceived ?? 0);
    } else {
      totalRevenue += r.deliveredValueReceived != null ? Number(r.deliveredValueReceived) : Number(r.codAmount ?? 0);
    }

  }

  const returnRate = eligibleCount > 0 ? Math.round((returnCount / eligibleCount) * 100) : 0;
  // تكلفة التشغيل = كل المصروفات الخارجة من الخزائن، مع استبعاد حركات
  // حسابات العملاء؛ فهي تسويات أرصدة وليست مصروف تشغيل للشركة.
  const cashExpenseConditions: any[] = [
    sql`${cashTransactionsTable.type} IN ('withdrawal', 'expense_paid', 'purchase_paid')`,
    sql`(${cashTransactionsTable.expenseId} IS NULL OR ${cashTransactionsTable.expenseId} NOT IN (
      SELECT id FROM expenses WHERE category = 'client_payment'
    ))`,
  ];
  if (tenantId !== null) {
    cashExpenseConditions.push(
      sql`${cashTransactionsTable.registerId} IN (SELECT id FROM cash_registers WHERE tenant_id = ${tenantId})`
    );
  }
  if (fromDate) cashExpenseConditions.push(gte(cashTransactionsTable.transactionDate, fromDate));
  if (toDate) cashExpenseConditions.push(lte(cashTransactionsTable.transactionDate, toDate));

  const [{ totalExpenses }] = await db
    .select({ totalExpenses: sql<number>`COALESCE(SUM(CAST(${cashTransactionsTable.amount} AS DECIMAL(14,2))), 0)` })
    .from(cashTransactionsTable)
    .where(and(...cashExpenseConditions));

  const operatingExpenses = Number(totalExpenses ?? 0);

  const companyIds = [...new Set(rows.map(r => r.shippingCompanyId).filter((id): id is number => id != null))];
  const companies = companyIds.length
    ? await db.select({ id: shippingCompaniesTable.id, costMode: shippingCompaniesTable.costMode, shippingCost: shippingCompaniesTable.shippingCost })
        .from(shippingCompaniesTable)
        .where(inArray(shippingCompaniesTable.id, companyIds))
    : [];
  const companyMap = new Map(companies.map(c => [c.id, c]));

  const zoneIds = [...new Set(rows.map(r => r.zoneId).filter((id): id is number => id != null))];
  const zoneCosts = zoneIds.length
    ? await db.select({ zoneId: zoneCostsTable.zoneId, deliveryCost: zoneCostsTable.deliveryCost })
        .from(zoneCostsTable)
        .where(and(
          inArray(zoneCostsTable.zoneId, zoneIds),
          tenantId !== null
            ? or(eq(zoneCostsTable.tenantId, tenantId), isNull(zoneCostsTable.tenantId))
            : undefined,
        ))
    : [];
  const zoneCostMap = new Map(zoneCosts.map(z => [z.zoneId, Number(z.deliveryCost ?? 0)]));

  let deliveredShippingFeesClosed = 0;
  let courierCostClosed = 0;
  for (const r of rows) {
    const hasShippingFee =
      r.deliveryStatus === "delivered" ||
      r.deliveryStatus === "partial_delivered" ||
      (r.deliveryStatus === "partial_received" && (r as any).returnReceived === 1) ||
      (r.deliveryStatus === "returned" && RETURN_REASONS_WITH_SHIPPING_COST.includes(r.returnReason ?? ""));
    if (!hasShippingFee) continue;

    const shipping = Number(r.shippingFee ?? 0);
    deliveredShippingFeesClosed += shipping;

    const company = r.shippingCompanyId != null ? companyMap.get(r.shippingCompanyId) : undefined;
    const companyCostMode = (company as any)?.costMode === "zone" ? "zone" : "rep";
    const courierCostPerShipment = Math.abs(Number(company?.shippingCost ?? 0));
    courierCostClosed += companyCostMode === "zone"
      ? Number(zoneCostMap.get(r.zoneId ?? -1) ?? 0)
      : courierCostPerShipment;
  }

  const repNetDue = deliveredShippingFeesClosed - courierCostClosed;
  const netRevenue = repNetDue - operatingExpenses;

  return {
    totalRevenue: repNetDue,
    totalExpenses: operatingExpenses,
    netRevenue,
    orders: eligibleCount,
    returnCount,
    returnRate,
  };
}

// ─── GET /api/analytics/manifests-pnl-summary ───────────────────────────────
// ملخص أرباح المناديب (بيانات الشحن) + مصروفات الخزنة، مجمّعين على مستوى الشركة كلها.
// نفس منطق realNetProfit في shipment-manifests.ts (لبيان واحد) لكن على كل البيانات
// دفعة واحدة — بدون N+1 queries.
//
// ملحوظة مهمة (تصحيح بناءً على توضيح بشمهندس مصطفى):
// "صافي الإيراد" هنا لازم يتغذى فقط من البيانات (manifests) اللي اتقفلت فعليًا
// (status = "closed") — يعني بعد ما المندوب اتحاسب وصافي ربحه اتحوّل فعليًا
// للخزينة (createTreasuryEntryOnClose). البيانات المفتوحة (لسه تحت التسوية)
// مستبعدة تمامًا من الحساب، حتى لو فيها شحنات مُسلَّمة فعليًا — لأن ده رصيد
// لسه مش مؤكد نهائيًا لحد ما المندوب يقفل البيان.
//
// الفلترة بالفترة (اليوم/أسبوع/شهر) بقت على أساس تاريخ إغلاق البيان (closedAt)
// مش تاريخ تسليم شحنة فردية (deliveredAt) — عشان الرقم يبقى متسق ومترابط
// بمنطق واحد بغض النظر عن الفترة المختارة (فلترة زمنية بس، مش مصدر بيانات مختلف).
router.get("/analytics/manifests-pnl-summary", requirePermission("orders.financials"), async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = req.query.period as string | undefined;
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;
    const now = new Date();

    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (period === "custom" && customFrom) {
      fromDate = new Date(customFrom + "T00:00:00");
      if (customTo) {
        toDate = new Date(customTo + "T23:59:59");
      }
    } else if (period === "week") {
      // بداية الأسبوع التقويمي الحالي (نفس منطق startOfWeek في /analytics/profit)
      // مش آخر 7 أيام متدحرجة — عشان في أول الشهر ما يرجعش لشهر فات ويطلع أكبر من فلتر "شهر"
      fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      fromDate.setDate(fromDate.getDate() - fromDate.getDay());
    } else if (period === "month") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "year") {
      fromDate = new Date(now.getFullYear(), 0, 1);
    } else if (period === "today") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const pnl = await computeManifestsPnl(tenantId, fromDate, toDate);
    res.json(pnl);
  } catch (err) {
    console.error("[analytics/manifests-pnl-summary]", err);
    res.status(500).json({ error: "فشل تحميل ملخص أرباح المناديب", detail: String(err) });
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
    quality: "هرب من الاستلام بدون معاينة",
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
// يرجع الشحنات اللي حالتها: قيد الشحن في المخزن / قيد الشحن / مؤجل — فقط
// ومر عليها أكتر من 3 أيام منذ الإنشاء
// المصدر: جدول الشحنات (shipmentsTable) نفسه — مش جدول الطلبات (orders)
// daysPending = based on createdAt (oldest date) to avoid reset on edits
const SHIPPING_FOLLOWUP_ACTIVE_STATUSES = [
  "warehouse_ready", "in_shipping", "delayed",
] as const;

router.get("/analytics/shipping-followup", requireAuth, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);

  const sfBaseConditions: any[] = [
    isNull(shipmentsTable.deletedAt),
    inArray(shipmentsTable.status, SHIPPING_FOLLOWUP_ACTIVE_STATUSES as unknown as string[]),
  ];
  if (tenantId !== null) sfBaseConditions.push(eq(shipmentsTable.tenantId, tenantId));

  const shipments = await db
    .select()
    .from(shipmentsTable)
    .where(and(...sfBaseConditions))
    .orderBy(desc(shipmentsTable.createdAt));

  const shippingCompanies = tenantId !== null
    ? await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
    : await db.select().from(shippingCompaniesTable);
  const companyMap = new Map(shippingCompanies.map(c => [c.id, c.name]));

  const warehouses = tenantId !== null
    ? await db.select().from(warehousesTable).where(eq(warehousesTable.tenantId, tenantId))
    : await db.select().from(warehousesTable);
  const warehouseMap = new Map(warehouses.map(w => [w.id, w.name]));

  // اسماء المناديب/الموظفين المسؤولين عن الشحنات
  const assignedUserIds = Array.from(new Set(shipments.map(s => s.assignedUserId).filter((v): v is number => !!v)));
  const assignedUsers = assignedUserIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.displayName }).from(usersTable).where(inArray(usersTable.id, assignedUserIds))
    : [];
  const userNameMap = new Map(assignedUsers.map(u => [u.id, u.name]));

  // صورة بروفايل الراسل — لو الشحنة مربوطة بعميل مسجّل (clientId)، بنجيب صورته الحقيقية من جدول clients
  const senderClientIds = Array.from(new Set(shipments.map(s => s.clientId).filter((v): v is number => !!v)));
  const senderClients = senderClientIds.length > 0
    ? await db.select({ id: clientsTable.id, avatar: clientsTable.avatar }).from(clientsTable).where(inArray(clientsTable.id, senderClientIds))
    : [];
  const senderAvatarMap = new Map(senderClients.map(c => [c.id, c.avatar]));

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const result = shipments
    .map(s => {
      const createdAt = new Date(s.createdAt);
      return {
        id: s.id,
        shipmentNumber: s.shipmentNumber,
        customerName: s.receiverName,
        senderName: s.senderName,
        senderAvatar: s.clientId ? (senderAvatarMap.get(s.clientId) ?? null) : null,
        phone: s.receiverPhone,
        city: s.receiverCity,
        address: s.receiverAddress,
        product: s.description || (s.pieces ? `${s.pieces} قطعة` : "—"),
        invoiceNumber: s.shipmentNumber,
        trackingNumber: s.trackingNumber,
        shippingCompany: s.shippingCompanyId ? companyMap.get(s.shippingCompanyId) ?? null : null,
        warehouseName: s.warehouseId ? warehouseMap.get(s.warehouseId) ?? null : null,
        assignedUserName: s.assignedUserId ? (userNameMap.get(s.assignedUserId) ?? s.createdByName ?? null) : (s.createdByName ?? null),
        status: s.status,
        daysPending: Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        totalPrice: Number(s.totalAmount ?? 0),
        shippingCost: Number(s.shippingFee ?? 0),
        createdAt,
      };
    })
    .filter(r => (now - r.createdAt.getTime()) >= THREE_DAYS_MS)
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
      const DAY_LABELS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
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

// ─── GET /analytics/shipment-charts-range ────────────────────────────────────
// بيانات الشحنات لفترة "السنة الماضية" (12 شهر) أو فترة مخصصة (from/to).
// التجميع تلقائي حسب طول الفترة: يومي (≤31 يوم) / أسبوعي (≤180 يوم) / شهري (أكبر).
router.get("/analytics/shipment-charts-range", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = (req.query.period as string | undefined) ?? "custom";
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;
    const cacheKey = `shipment-charts-range:${tenantId ?? "global"}:${period}:${customFrom ?? ""}:${customTo ?? ""}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const localDateStr = (d: Date): string =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

    const now = new Date();

    // ─── تحديد نطاق الفترة ────────────────────────────────────────────────────
    let rangeFrom: Date;
    let rangeTo: Date;
    if (period === "lastYear") {
      // آخر 12 شهر بالكامل (من أول الشهر اللي فاته 11 شهر لحد النهاردة)
      rangeFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
      rangeTo = now;
    } else if (customFrom) {
      rangeFrom = new Date(customFrom + "T00:00:00");
      rangeTo = customTo ? new Date(customTo + "T23:59:59") : now;
    } else {
      res.status(400).json({ error: "من فضلك حدد from (و to اختياري) أو period=lastYear" });
      return;
    }
    if (rangeFrom > rangeTo) {
      res.status(400).json({ error: "تاريخ البداية أكبر من تاريخ النهاية" });
      return;
    }

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt), gte(shipmentsTable.createdAt, rangeFrom), lte(shipmentsTable.createdAt, rangeTo))
      : and(isNull(shipmentsTable.deletedAt), gte(shipmentsTable.createdAt, rangeFrom), lte(shipmentsTable.createdAt, rangeTo));

    const rows = await db
      .select({
        createdAt: shipmentsTable.createdAt,
        codAmount: shipmentsTable.codAmount,
        collectedAmount: shipmentsTable.collectedAmount,
      })
      .from(shipmentsTable)
      .where(cond);

    // ─── تحديد نوع التجميع تلقائيًا حسب طول الفترة ──────────────────────────
    const spanDays = Math.ceil((rangeTo.getTime() - rangeFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const granularity: "day" | "week" | "month" = period === "lastYear"
      ? "month"
      : spanDays <= 31 ? "day" : spanDays <= 180 ? "week" : "month";

    type Point = { date: string; label: string; count: number; codAmount: number };
    const points: Point[] = [];
    const MONTH_LABELS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

    if (granularity === "day") {
      const cur = new Date(rangeFrom);
      while (cur <= rangeTo) {
        const dateStr = localDateStr(cur);
        const mmdd = `${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getDate()).padStart(2, "0")}`;
        points.push({ date: dateStr, label: mmdd, count: 0, codAmount: 0 });
        cur.setDate(cur.getDate() + 1);
      }
    } else if (granularity === "week") {
      const cur = new Date(rangeFrom);
      cur.setHours(0, 0, 0, 0);
      while (cur <= rangeTo) {
        const weekEnd = new Date(cur);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const label = `${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getDate()).padStart(2, "0")}`;
        points.push({ date: localDateStr(cur), label, count: 0, codAmount: 0 });
        cur.setDate(cur.getDate() + 7);
      }
    } else {
      // شهري
      const cur = new Date(rangeFrom.getFullYear(), rangeFrom.getMonth(), 1);
      const end = new Date(rangeTo.getFullYear(), rangeTo.getMonth(), 1);
      while (cur <= end) {
        const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-01`;
        points.push({ date: dateStr, label: `${MONTH_LABELS[cur.getMonth()]} ${cur.getFullYear()}`, count: 0, codAmount: 0 });
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    // ─── تعبئة البيانات في الـ buckets المناسبة ─────────────────────────────
    for (const s of rows) {
      const d = new Date(s.createdAt);
      const cod = Number(s.collectedAmount ?? s.codAmount ?? 0);
      let bucket: Point | undefined;

      if (granularity === "day") {
        const dateStr = localDateStr(d);
        bucket = points.find(p => p.date === dateStr);
      } else if (granularity === "week") {
        // آخر نقطة تاريخها <= تاريخ الشحنة
        for (let i = points.length - 1; i >= 0; i--) {
          if (points[i].date <= localDateStr(d)) { bucket = points[i]; break; }
        }
      } else {
        // شهري: نستخرج السنة/الشهر بتوقيت القاهرة (مش UTC) عشان نفس منطق باقي الحبيبات
        const cairoDateStr = localDateStr(d); // "YYYY-MM-DD" بتوقيت القاهرة
        const dateStr = `${cairoDateStr.slice(0, 7)}-01`;
        bucket = points.find(p => p.date === dateStr);
      }

      if (bucket) { bucket.count++; bucket.codAmount += cod; }
    }

    const totalCount = points.reduce((s, p) => s + p.count, 0);
    const totalCod = points.reduce((s, p) => s + p.codAmount, 0);

    const result = {
      granularity,
      from: localDateStr(rangeFrom),
      to: localDateStr(rangeTo),
      points,
      total: { count: totalCount, codAmount: totalCod },
    };

    setCached(cacheKey, result, 5 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/operations-kpis ──────────────────────────────────────────
// لوحة العمليات: 6 كروت KPI مبنية على الفترة المختارة (اليوم/أسبوع/شهر/سنة/فترة محددة).
// نسبة التغيّر ("change") دايمًا بتقارن اليوم بأمس بغض النظر عن الفترة المختارة،
// لأنها مؤشر "حركة النهاردة" مش جزء من نطاق الفترة نفسها.
router.get("/analytics/operations-kpis", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = (req.query.period as string | undefined) ?? "week";
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;
    const cacheKey = `operations-kpis:${tenantId ?? "global"}:${period}:${customFrom ?? ""}:${customTo ?? ""}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const localDateStr = (d: Date): string =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

    const now = new Date();

    // ── تحديد نطاق التجميع اليومي حسب الفترة المختارة ──────────────────────
    // كل الفترات بتتجمّع يوميًا (buckets) عشان نقدر نطلع sparkline لكل كارت،
    // لكن نطاق الأيام نفسه بيختلف حسب الفترة (يوم واحد / أسبوع / شهر / فترة مخصصة).
    let rangeFrom: Date;
    let rangeTo: Date = now;
    if (period === "today") {
      rangeFrom = new Date(now); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      rangeFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "year") {
      rangeFrom = new Date(now.getFullYear(), 0, 1);
    } else if (period === "custom" && customFrom) {
      rangeFrom = new Date(customFrom + "T00:00:00");
      rangeTo = customTo ? new Date(customTo + "T23:59:59") : now;
    } else {
      // "week" (الافتراضي) — بداية الأسبوع التقويمي الحالي (نفس منطق باقي endpoints)
      // مش آخر 7 أيام متدحرجة — عشان في أول الشهر ما يرجعش لشهر فات ويطلع أكبر من "شهر"
      rangeFrom = new Date(now); rangeFrom.setHours(0, 0, 0, 0);
      rangeFrom.setDate(rangeFrom.getDate() - rangeFrom.getDay());
    }
    // للـ sparkline والمقارنة اليوم/أمس محتاجين بيانات يوم أمس على الأقل حتى لو الفترة "اليوم" بس
    const fetchFrom = new Date(Math.min(rangeFrom.getTime(), new Date(now).setDate(now.getDate() - 1)));

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt), gte(shipmentsTable.createdAt, fetchFrom), lte(shipmentsTable.createdAt, rangeTo))
      : and(isNull(shipmentsTable.deletedAt), gte(shipmentsTable.createdAt, fetchFrom), lte(shipmentsTable.createdAt, rangeTo));

    const rows = await db
      .select({
        status: shipmentsTable.status,
        createdAt: shipmentsTable.createdAt,
        codAmount: shipmentsTable.codAmount,
        collectedAmount: shipmentsTable.collectedAmount,
        shippingFee: shipmentsTable.shippingFee,
      })
      .from(shipmentsTable)
      .where(cond);

    // ── تجميع يومي لكل الأيام ضمن نطاق الفترة (لعرض sparkline) ──────────────
    const days: string[] = [];
    {
      const cursor = new Date(rangeFrom);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(rangeTo);
      end.setHours(0, 0, 0, 0);
      while (cursor <= end) {
        days.push(localDateStr(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      if (days.length === 0) days.push(localDateStr(now));
    }
    const todayStr = localDateStr(now);
    const yesterdayD = new Date(now); yesterdayD.setDate(yesterdayD.getDate() - 1);
    const yesterdayStr = localDateStr(yesterdayD);

    type DayBucket = { total: number; delivered: number; inShipping: number; returned: number; delayed: number; revenue: number };
    const emptyBucket = (): DayBucket => ({ total: 0, delivered: 0, inShipping: 0, returned: 0, delayed: 0, revenue: 0 });
    const buckets: Record<string, DayBucket> = {};
    for (const day of days) buckets[day] = emptyBucket();
    // نضمن وجود اليوم وأمس حتى لو خارج نطاق الفترة (لحساب change بدقة)
    if (!buckets[todayStr]) buckets[todayStr] = emptyBucket();
    if (!buckets[yesterdayStr]) buckets[yesterdayStr] = emptyBucket();

    for (const r of rows) {
      const day = localDateStr(new Date(r.createdAt));
      // لو اليوم مش موجود أصلاً في buckets (حافة توقيت بين نطاق rangeFrom/rangeTo
      // المحسوب بتوقيت السيرفر الخام واليوم الفعلي بتوقيت القاهرة)، نضيفه بدل ما نضيّع الشحنة
      if (!buckets[day]) buckets[day] = emptyBucket();
      const status = normalize(r.status);
      const b = buckets[day];
      b.total += 1;
      if (status === "received") b.delivered += 1;
      if (status === "in_shipping") b.inShipping += 1;
      if (status === "returned") b.returned += 1;
      if (status === "delayed") b.delayed += 1;
      b.revenue += Number(r.collectedAmount ?? r.codAmount ?? 0);
    }

    // بعد إضافة أي أيام حدّية جديدة، لازم نحدّث days عشان totals/sparkline تشمل كل الـ buckets الفعلية
    const allBucketDays = Object.keys(buckets).sort();
    for (const d of allBucketDays) {
      if (!days.includes(d)) days.push(d);
    }
    days.sort();

    const sparkline = (key: keyof DayBucket) => days.map(d => buckets[d][key]);

    const todayBucket = buckets[todayStr] ?? emptyBucket();
    const yesterdayBucket = buckets[yesterdayStr] ?? emptyBucket();

    const pctChange = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    // ── إجماليات الفترة المختارة بس (مش fetchFrom كامل، لو الفترة "اليوم" مثلاً) ──
    const totals = days.reduce((acc, d) => {
      const b = buckets[d];
      return {
        total: acc.total + b.total,
        delivered: acc.delivered + b.delivered,
        inShipping: acc.inShipping + b.inShipping,
        returned: acc.returned + b.returned,
        delayed: acc.delayed + b.delayed,
        revenue: acc.revenue + b.revenue,
      };
    }, { total: 0, delivered: 0, inShipping: 0, returned: 0, delayed: 0, revenue: 0 });

    const result = {
      cards: [
        {
          key: "total", label: "إجمالي الشحنات", value: totals.total,
          change: pctChange(todayBucket.total, yesterdayBucket.total),
          sparkline: sparkline("total"),
        },
        {
          key: "delivered", label: "تم التسليم", value: totals.delivered,
          change: pctChange(todayBucket.delivered, yesterdayBucket.delivered),
          sparkline: sparkline("delivered"),
        },
        {
          key: "inShipping", label: "قيد الشحن", value: totals.inShipping,
          change: pctChange(todayBucket.inShipping, yesterdayBucket.inShipping),
          sparkline: sparkline("inShipping"),
        },
        {
          key: "returned", label: "مرتجعة", value: totals.returned,
          change: pctChange(todayBucket.returned, yesterdayBucket.returned),
          sparkline: sparkline("returned"),
        },
        {
          key: "delayed", label: "مؤجلة", value: totals.delayed,
          change: pctChange(todayBucket.delayed, yesterdayBucket.delayed),
          sparkline: sparkline("delayed"),
        },
        {
          key: "revenue", label: "إجمالي الإيرادات", value: Math.round(totals.revenue),
          change: pctChange(todayBucket.revenue, yesterdayBucket.revenue),
          sparkline: sparkline("revenue"),
        },
      ],
      generatedAt: now.toISOString(),
    };

    setCached(cacheKey, result, 2 * 60 * 1000); // cache دقيقتين — بيانات شبه لحظية
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/status-distribution ──────────────────────────────────────
// توزيع كل الشحنات النشطة (آخر 90 يوم) حسب الحالة الحقيقية — لكارت "توزيع الشحنات حسب الحالة"
router.get("/analytics/status-distribution", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `status-distribution:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt), gte(shipmentsTable.createdAt, ninetyDaysAgo))
      : and(isNull(shipmentsTable.deletedAt), gte(shipmentsTable.createdAt, ninetyDaysAgo));

    const rows = await db
      .select({ status: shipmentsTable.status })
      .from(shipmentsTable)
      .where(cond);

    const STATUS_META: Record<string, { label: string; color: string }> = {
      pending:          { label: "قيد الانتظار",  color: "#f59e0b" },
      warehouse_ready:  { label: "بالمخزن",        color: "#a855f7" },
      in_shipping:      { label: "قيد الشحن",      color: "#0ea5e9" },
      delayed:          { label: "مؤجلة",          color: "#eab308" },
      partial_received: { label: "تسليم جزئي",     color: "#6366f1" },
      received:         { label: "تم التسليم",     color: "#10b981" },
      returned:         { label: "مرتجعة",         color: "#ef4444" },
    };

    const counts: Record<string, number> = {};
    for (const r of rows) {
      const status = normalize(r.status);
      counts[status] = (counts[status] ?? 0) + 1;
    }

    const distribution = Object.entries(counts)
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([status, value]) => ({
        status,
        label: STATUS_META[status]?.label ?? status,
        color: STATUS_META[status]?.color ?? "#94a3b8",
        value,
      }));

    const result = { distribution, total: rows.length, generatedAt: now.toISOString() };

    setCached(cacheKey, result, 3 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/performance-metrics ──────────────────────────────────────
// لوحة العمليات: 6 مؤشرات دائرية — الالتزام، وقت التوصيل، المرتجعات،
// التأخير، تقييم العملاء، زمن الاستلام. مبنية على الفترة المختارة (اليوم/أسبوع/شهر/سنة/فترة محددة).
// كل مؤشر مع نسبة تغيّر عن أمس (بغض النظر عن الفترة المختارة).
router.get("/analytics/performance-metrics", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = (req.query.period as string | undefined) ?? "week";
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;
    const cacheKey = `performance-metrics:${tenantId ?? "global"}:${period}:${customFrom ?? ""}:${customTo ?? ""}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);

    // ── تحديد نطاق الفترة المختارة ──────────────────────────────────────────
    let rangeFrom: Date;
    let rangeTo: Date = now;
    if (period === "today") {
      rangeFrom = new Date(now); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      rangeFrom = new Date(now); rangeFrom.setDate(rangeFrom.getDate() - 6); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      rangeFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "year") {
      rangeFrom = new Date(now.getFullYear(), 0, 1);
    } else if (period === "custom" && customFrom) {
      rangeFrom = new Date(customFrom + "T00:00:00");
      rangeTo = customTo ? new Date(customTo + "T23:59:59") : now;
    } else {
      rangeFrom = new Date(now); rangeFrom.setDate(rangeFrom.getDate() - 6); rangeFrom.setHours(0, 0, 0, 0);
    }

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const rows = await db
      .select({
        id: shipmentsTable.id,
        status: shipmentsTable.status,
        createdAt: shipmentsTable.createdAt,
        updatedAt: shipmentsTable.updatedAt,
        estimatedDelivery: shipmentsTable.estimatedDelivery,
      })
      .from(shipmentsTable)
      .where(cond);

    // ─── دالة حساب المؤشرات لمجموعة صفوف (تُستخدم لحساب اليوم وأمس بنفس المنطق) ───
    function computeMetrics(subset: typeof rows) {
      const total = subset.length;
      if (total === 0) {
        return { onTimeRate: 0, avgDeliveryHours: 0, returnRate: 0, delayRate: 0, avgPickupHours: 0 };
      }

      let delivered = 0, onTime = 0, returned = 0, delayed = 0;
      let deliveryHoursSum = 0, deliveryCount = 0;
      let pickupHoursSum = 0, pickupCount = 0;

      for (const r of subset) {
        const status = normalize(r.status);
        if (status === "received") {
          delivered++;
          const created = new Date(r.createdAt).getTime();
          const updated = new Date(r.updatedAt).getTime();
          const hours = (updated - created) / (1000 * 60 * 60);
          if (hours >= 0 && hours < 24 * 30) { // استبعاد قيم شاذة (أكتر من شهر)
            deliveryHoursSum += hours;
            deliveryCount++;
          }
          // نسبة الالتزام: قورن وقت الوصول الفعلي (updatedAt) بالمتوقع
          if (r.estimatedDelivery) {
            const est = new Date(r.estimatedDelivery).getTime();
            if (updated <= est) onTime++;
          } else {
            onTime++; // مفيش موعد متوقع = مانعتبروش تأخير
          }
        }
        if (status === "returned") returned++;
        if (status === "delayed") delayed++;

        // زمن الاستلام بالمخزن (warehouse_ready) — من الإنشاء لحد أول تجهيز
        if (status === "warehouse_ready" || status === "in_shipping" || status === "received") {
          const created = new Date(r.createdAt).getTime();
          const updated = new Date(r.updatedAt).getTime();
          const hours = (updated - created) / (1000 * 60 * 60);
          if (hours >= 0 && hours < 24 * 7) {
            pickupHoursSum += hours;
            pickupCount++;
          }
        }
      }

      return {
        onTimeRate: delivered > 0 ? Math.round((onTime / delivered) * 1000) / 10 : 0,
        avgDeliveryHours: deliveryCount > 0 ? Math.round((deliveryHoursSum / deliveryCount) * 10) / 10 : 0,
        returnRate: Math.round((returned / total) * 1000) / 10,
        delayRate: Math.round((delayed / total) * 1000) / 10,
        avgPickupHours: pickupCount > 0 ? Math.round((pickupHoursSum / pickupCount) * 10) / 10 : 0,
      };
    }

    // "overall" دلوقتي = بيانات الفترة المختارة فقط (مش كل التاريخ زي قبل كده)
    const periodRows = rows.filter((r: typeof rows[number]) => {
      const d = new Date(r.createdAt);
      return d >= rangeFrom && d <= rangeTo;
    });
    const todayRows = rows.filter((r: typeof rows[number]) => new Date(r.createdAt) >= new Date(now.toDateString()));
    const yesterdayRows = rows.filter((r: typeof rows[number]) => {
      const d = new Date(r.createdAt);
      return d >= new Date(yesterday.toDateString()) && d < new Date(now.toDateString());
    });

    const overall = computeMetrics(periodRows);
    const todayMetrics = computeMetrics(todayRows);
    const yesterdayMetrics = computeMetrics(yesterdayRows);

    const pctPointChange = (curr: number, prev: number): number =>
      Math.round((curr - prev) * 10) / 10;

    // ─── متوسط تقييم العملاء من جدول shipment_ratings (بنفس نطاق الفترة) ───────
    const ratingConditions: any[] = [gte(shipmentRatingsTable.createdAt, rangeFrom), lte(shipmentRatingsTable.createdAt, rangeTo)];
    if (tenantId !== null) ratingConditions.push(eq(shipmentRatingsTable.tenantId, tenantId));
    const ratingRows = await db.select({ rating: shipmentRatingsTable.rating })
      .from(shipmentRatingsTable)
      .where(and(...ratingConditions));
    const avgRating = ratingRows.length > 0
      ? Math.round((ratingRows.reduce((s: number, r: typeof ratingRows[number]) => s + r.rating, 0) / ratingRows.length) * 10) / 10
      : 0;

    const result = {
      metrics: [
        {
          key: "onTimeRate", label: "نسبة الالتزام", value: overall.onTimeRate, unit: "%", max: 100,
          change: pctPointChange(todayMetrics.onTimeRate, yesterdayMetrics.onTimeRate),
        },
        {
          key: "avgDeliveryHours", label: "متوسط وقت التوصيل", value: overall.avgDeliveryHours, unit: "ساعة", max: null,
          change: pctPointChange(todayMetrics.avgDeliveryHours, yesterdayMetrics.avgDeliveryHours),
        },
        {
          key: "returnRate", label: "نسبة المرتجعات", value: overall.returnRate, unit: "%", max: 100,
          change: pctPointChange(todayMetrics.returnRate, yesterdayMetrics.returnRate),
        },
        {
          key: "delayRate", label: "نسبة التأخير", value: overall.delayRate, unit: "%", max: 100,
          change: pctPointChange(todayMetrics.delayRate, yesterdayMetrics.delayRate),
        },
        {
          key: "avgRating", label: "متوسط تقييم العملاء", value: avgRating, unit: "/5", max: 5,
          change: 0, // مفيش تاريخ كافي للمقارنة اليومية حاليًا
          ratingsCount: ratingRows.length,
        },
        {
          key: "avgPickupHours", label: "متوسط زمن الاستلام", value: overall.avgPickupHours, unit: "ساعة", max: null,
          change: pctPointChange(todayMetrics.avgPickupHours, yesterdayMetrics.avgPickupHours),
        },
      ],
      generatedAt: now.toISOString(),
    };

    setCached(cacheKey, result, 5 * 60 * 1000); // cache 5 دقائق
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/city-activity ────────────────────────────────────────────
// الخريطة الرمزية: تجميع الشحنات النشطة حسب المحافظة (receiverCity) مع
// تفصيل الحالات (قيد التوصيل / متأخرة / تم التسليم / مشكلة) لكل محافظة.
router.get("/analytics/city-activity", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `city-activity:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    // نجيب بس الشحنات "النشطة" (مش قديمة جدًا) عشان الخريطة تعكس الوضع الحالي —
    // آخر 30 يوم كافية لعرض حركة حقيقية بدون إثقال الكويري بكل تاريخ الشحنات.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rows = await db
      .select({
        city: shipmentsTable.receiverCity,
        status: shipmentsTable.status,
      })
      .from(shipmentsTable)
      .where(and(cond, gte(shipmentsTable.createdAt, thirtyDaysAgo)));

    type CityBucket = {
      city: string;
      total: number;
      inTransit: number;   // قيد التوصيل
      delivered: number;   // تم التسليم
      delayed: number;     // متأخرة
      problem: number;     // مرتجعة/ملغية (بها مشكلة)
    };

    const byCity = new Map<string, CityBucket>();
    for (const r of rows) {
      const cityName = (r.city ?? "").trim();
      if (!cityName) continue; // نتجاهل الشحنات من غير محافظة محددة

      const status = normalize(r.status);
      if (!byCity.has(cityName)) {
        byCity.set(cityName, { city: cityName, total: 0, inTransit: 0, delivered: 0, delayed: 0, problem: 0 });
      }
      const bucket = byCity.get(cityName)!;
      bucket.total++;
      if (status === "in_shipping" || status === "warehouse_ready") bucket.inTransit++;
      else if (status === "received") bucket.delivered++;
      else if (status === "delayed") bucket.delayed++;
      else if (status === "returned") bucket.problem++;
    }

    const cities = Array.from(byCity.values()).sort((a, b) => b.total - a.total);

    const result = {
      cities,
      totalActiveCities: cities.length,
      generatedAt: new Date().toISOString(),
    };

    setCached(cacheKey, result, 5 * 60 * 1000); // cache 5 دقائق
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/live-map ──────────────────────────────────────────────────
// خريطة موسّعة لصفحة "الخريطة المباشرة": نفس تجميع city-activity + مندوبين
// نشطين لكل محافظة + نسبة تأخير (heat score) لتحديد المناطق المزدحمة/المتأخرة.
router.get("/analytics/live-map", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `live-map:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [rows, users] = await Promise.all([
      db.select({
          id: shipmentsTable.id,
          shipmentNumber: shipmentsTable.shipmentNumber,
          receiverName: shipmentsTable.receiverName,
          city: shipmentsTable.receiverCity,
          status: shipmentsTable.status,
          shippingCompanyId: shipmentsTable.shippingCompanyId,
        })
        .from(shipmentsTable)
        .where(and(cond, gte(shipmentsTable.createdAt, thirtyDaysAgo))),
      tenantId !== null
        ? db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name })
            .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
        : db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name })
            .from(shippingCompaniesTable),
    ]);
    const repNameById = new Map(users.map((u: typeof users[number]) => [u.id, u.displayName]));

    type LiveCityShipment = {
      id: number;
      shipmentNumber: string | null;
      receiverName: string | null;
      status: string;
    };

    type LiveCityBucket = {
      city: string;
      total: number;
      inTransit: number;
      delivered: number;
      delayed: number;
      problem: number;
      repIds: Set<number>;
      shipments: LiveCityShipment[];
    };

    const byCityLive = new Map<string, LiveCityBucket>();
    for (const r of rows) {
      const cityName = (r.city ?? "").trim();
      if (!cityName) continue;

      const status = normalize(r.status);
      if (!byCityLive.has(cityName)) {
        byCityLive.set(cityName, { city: cityName, total: 0, inTransit: 0, delivered: 0, delayed: 0, problem: 0, repIds: new Set(), shipments: [] });
      }
      const bucket = byCityLive.get(cityName)!;
      bucket.total++;
      if (status === "in_shipping" || status === "warehouse_ready") bucket.inTransit++;
      else if (status === "received") bucket.delivered++;
      else if (status === "delayed") bucket.delayed++;
      else if (status === "returned") bucket.problem++;
      if (r.shippingCompanyId) bucket.repIds.add(r.shippingCompanyId);
      if (bucket.shipments.length < 8) {
        bucket.shipments.push({ id: r.id, shipmentNumber: r.shipmentNumber, receiverName: r.receiverName, status });
      }
    }

    const liveCities = Array.from(byCityLive.values())
      .sort((a, b) => b.total - a.total)
      .map((b) => {
        const delayRate = b.total > 0 ? Math.round(((b.delayed + b.problem) / b.total) * 100) : 0;
        // heat score: يجمع بين الحجم (ازدحام) ونسبة التأخير (مشاكل) في مؤشر واحد 0-100
        const congestionScore = Math.min(100, Math.round((b.total / 5) * 10));
        const heatScore = Math.min(100, Math.round(congestionScore * 0.5 + delayRate * 0.5));
        return {
          city: b.city,
          total: b.total,
          inTransit: b.inTransit,
          delivered: b.delivered,
          delayed: b.delayed,
          problem: b.problem,
          delayRate,
          heatScore,
          representatives: Array.from(b.repIds).map((id) => repNameById.get(id) ?? "مندوب").slice(0, 8),
          representativesCount: b.repIds.size,
          shipments: b.shipments,
        };
      });

    const busiestCity = liveCities.length > 0 ? liveCities.reduce((a, b) => (b.total > a.total ? b : a)) : null;
    const mostDelayedCity = liveCities.filter(c => c.total >= 3).length > 0
      ? liveCities.filter(c => c.total >= 3).reduce((a, b) => (b.delayRate > a.delayRate ? b : a))
      : null;

    const liveMapResult = {
      cities: liveCities,
      totalActiveCities: liveCities.length,
      totalActiveShipments: rows.filter((r: typeof rows[number]) => {
        const s = normalize(r.status);
        return s === "in_shipping" || s === "warehouse_ready";
      }).length,
      totalOnlineReps: users.length,
      busiestCity: busiestCity ? { city: busiestCity.city, total: busiestCity.total } : null,
      mostDelayedCity: mostDelayedCity ? { city: mostDelayedCity.city, delayRate: mostDelayedCity.delayRate } : null,
      generatedAt: new Date().toISOString(),
    };

    setCached(cacheKey, liveMapResult, 3 * 60 * 1000); // cache 3 دقائق
    res.json(liveMapResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/ops-alerts ────────────────────────────────────────────────
// لوحة العمليات: تنبيهات ذكية (AI) عن أنماط تشغيلية حقيقية + أرقام السايدبار
// الخمسة (شحنات متأخرة، بها مشكلة، خارجة اليوم، مندوبين متصلين، عملاء يحتاجون متابعة).
router.get("/analytics/ops-alerts", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `ops-alerts:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const now = new Date();
    const todayStart = new Date(now.toDateString());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [rows, users] = await Promise.all([
      db.select({
          id: shipmentsTable.id,
          status: shipmentsTable.status,
          createdAt: shipmentsTable.createdAt,
          receiverCity: shipmentsTable.receiverCity,
          senderName: shipmentsTable.senderName,
          clientId: shipmentsTable.clientId,
          assignedUserId: shipmentsTable.assignedUserId,
          shippingCompanyId: shipmentsTable.shippingCompanyId,
        })
        .from(shipmentsTable)
        .where(and(cond, gte(shipmentsTable.createdAt, thirtyDaysAgo))),
      tenantId !== null
        ? db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name, isActive: shippingCompaniesTable.isActive })
            .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
        : db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name, isActive: shippingCompaniesTable.isActive })
            .from(shippingCompaniesTable),
    ]);

    // ─── أرقام السايدبار ────────────────────────────────────────────────────
    type OpsRow = typeof rows[number];
    const delayedShipments = rows.filter((r: OpsRow) => normalize(r.status) === "delayed");
    const problemShipments = rows.filter((r: OpsRow) => normalize(r.status) === "returned");
    const outToday = rows.filter((r: OpsRow) => {
      const st = normalize(r.status);
      return (st === "in_shipping" || st === "warehouse_ready") && new Date(r.createdAt) >= todayStart;
    });

    // شركات شحن نشطة الآن: "المندوب" هنا = شركة الشحن (شاشة "مناديب Stark")
    const onlineRepIds = new Set(
      users.filter((u: typeof users[number]) => u.isActive).map((u: typeof users[number]) => u.id),
    );

    // عملاء يحتاجون متابعة: عميل (بالاسم) عنده شحنتين+ مرتجعة/متأخرة خلال آخر 30 يوم
    const clientIssueCount = new Map<string, number>();
    for (const r of rows) {
      const status = normalize(r.status);
      if (status !== "returned" && status !== "delayed") continue;
      const key = r.senderName?.trim();
      if (!key) continue;
      clientIssueCount.set(key, (clientIssueCount.get(key) ?? 0) + 1);
    }
    const clientsNeedingFollowup = Array.from(clientIssueCount.entries()).filter(([, n]) => n >= 2);

    // ─── التنبيهات الذكية ───────────────────────────────────────────────────
    type SmartAlert = { id: string; type: "warning" | "info" | "critical" | "opportunity"; title: string; detail: string };
    const alerts: SmartAlert[] = [];

    // 1) منطقة بتأخير عالي (نسبة delayed لكل مدينة، لو ≥3 شحنات وأعلى من 20%)
    const cityTotals = new Map<string, { total: number; delayed: number }>();
    for (const r of rows) {
      const city = r.receiverCity?.trim();
      if (!city) continue;
      if (!cityTotals.has(city)) cityTotals.set(city, { total: 0, delayed: 0 });
      const b = cityTotals.get(city)!;
      b.total++;
      if (normalize(r.status) === "delayed") b.delayed++;
    }
    let worstCity: { city: string; rate: number; total: number } | null = null;
    for (const [city, b] of cityTotals) {
      if (b.total < 3) continue;
      const rate = (b.delayed / b.total) * 100;
      if (rate > 20 && (!worstCity || rate > worstCity.rate)) worstCity = { city, rate: Math.round(rate), total: b.total };
    }
    if (worstCity) {
      alerts.push({
        id: "high-delay-city",
        type: "warning",
        title: `منطقة ${worstCity.city} تأخيرًا عاليًا`,
        detail: `نسبة التأخير ارتفعت إلى ${worstCity.rate}% من إجمالي ${worstCity.total} شحنة للمعتاد`,
      });
    }

    // 2) أفضل مدينة (أعلى نسبة تسليم ناجح، لو ≥5 شحنات)
    let bestCity: { city: string; rate: number; total: number } | null = null;
    for (const [city, b] of cityTotals) {
      if (b.total < 5) continue;
      const delivered = rows.filter((r: OpsRow) => r.receiverCity?.trim() === city && normalize(r.status) === "received").length;
      const rate = (delivered / b.total) * 100;
      if (rate >= 90 && (!bestCity || rate > bestCity.rate)) bestCity = { city, rate: Math.round(rate), total: b.total };
    }
    if (bestCity) {
      alerts.push({
        id: "best-performing-city",
        type: "info",
        title: `منطقة ${bestCity.city} أفضل أداء هذا الأسبوع`,
        detail: `نسبة نجاح ${bestCity.rate}% في ${bestCity.total} شحنة`,
      });
    }

    // 3) عملاء يحتاجون متابعة (تنبيه critical لو فيه عملاء بمشاكل متكررة)
    if (clientsNeedingFollowup.length > 0) {
      const [topClient, topCount] = clientsNeedingFollowup.sort((a, b) => b[1] - a[1])[0];
      alerts.push({
        id: "client-repeated-issues",
        type: "critical",
        title: `العميل ${topClient} شحنات مرتجعة متكررة`,
        detail: `${topCount} شحنات متأخرة/مرتجعة خلال آخر 30 يوم، يوصى بمتابعة جودة الشحن`,
      });
    }

    // 4) فرصة نمو (منطقة نشطة بحجم شحنات مرتفع نسبيًا وبدون مشاكل تُذكر)
    const growthCandidates = Array.from(cityTotals.entries())
      .filter(([, b]) => b.total >= 8 && b.delayed / b.total < 0.1)
      .sort((a, b) => b[1].total - a[1].total);
    if (growthCandidates.length > 0) {
      const [city, b] = growthCandidates[0];
      alerts.push({
        id: "growth-opportunity",
        type: "opportunity",
        title: `منطقة ${city} فرصة نمو ممتازة`,
        detail: `${b.total} شحنة بأداء مستقر هذا الشهر، فرصة للتوسع في المنطقة`,
      });
    }

    const result = {
      sidebar: {
        delayedShipments: delayedShipments.length,
        problemShipments: problemShipments.length,
        outToday: outToday.length,
        activeRepresentatives: onlineRepIds.size,
        totalRepresentatives: users.length,
        clientsNeedingFollowup: clientsNeedingFollowup.length,
      },
      alerts,
      generatedAt: now.toISOString(),
    };

    setCached(cacheKey, result, 3 * 60 * 1000); // cache 3 دقائق
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/operations-center ────────────────────────────────────────
// صفحة "مركز العمليات": نفس منطق ops-alerts لكن برجّع القوائم التفصيلية الكاملة
// (شحنة بشحنة، مندوب بمندوب، عميل بعميل) بدل الأرقام الملخصة فقط.
router.get("/analytics/operations-center", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `ops-center:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const now = new Date();
    const todayStart = new Date(now.toDateString());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [rows, users] = await Promise.all([
      db.select({
          id: shipmentsTable.id,
          trackingNumber: shipmentsTable.trackingNumber,
          status: shipmentsTable.status,
          createdAt: shipmentsTable.createdAt,
          updatedAt: shipmentsTable.updatedAt,
          receiverCity: shipmentsTable.receiverCity,
          receiverName: shipmentsTable.receiverName,
          receiverPhone: shipmentsTable.receiverPhone,
          senderName: shipmentsTable.senderName,
          clientId: shipmentsTable.clientId,
          assignedUserId: shipmentsTable.assignedUserId,
          shippingCompanyId: shipmentsTable.shippingCompanyId,
          totalAmount: shipmentsTable.totalAmount,
        })
        .from(shipmentsTable)
        .where(and(cond, gte(shipmentsTable.createdAt, thirtyDaysAgo))),
      tenantId !== null
        ? db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name, isActive: shippingCompaniesTable.isActive })
            .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
        : db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name, isActive: shippingCompaniesTable.isActive })
            .from(shippingCompaniesTable),
    ]);

    type OpsRow = typeof rows[number];

    // ─── شحنات متأخرة (تفصيلي) ──────────────────────────────────────────────
    const hoursSince = (d: Date) => Math.round((now.getTime() - new Date(d).getTime()) / (1000 * 60 * 60));
    const delayedShipments = rows
      .filter((r: OpsRow) => normalize(r.status) === "delayed")
      .sort((a: OpsRow, b: OpsRow) => new Date(a.updatedAt ?? a.createdAt).getTime() - new Date(b.updatedAt ?? b.createdAt).getTime())
      .slice(0, 30)
      .map((r: OpsRow) => ({
        id: r.id,
        trackingNumber: r.trackingNumber,
        receiverName: r.receiverName,
        receiverPhone: r.receiverPhone,
        receiverCity: r.receiverCity,
        senderName: r.senderName,
        delayedHours: hoursSince(r.updatedAt ?? r.createdAt),
        totalAmount: r.totalAmount,
      }));

    // ─── شحنات بها مشكلة (مرتجعة) ────────────────────────────────────────────
    const problemShipments = rows
      .filter((r: OpsRow) => normalize(r.status) === "returned")
      .sort((a: OpsRow, b: OpsRow) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
      .slice(0, 30)
      .map((r: OpsRow) => ({
        id: r.id,
        trackingNumber: r.trackingNumber,
        receiverName: r.receiverName,
        receiverPhone: r.receiverPhone,
        receiverCity: r.receiverCity,
        senderName: r.senderName,
        totalAmount: r.totalAmount,
      }));

    // ─── شحنات خارجة اليوم ──────────────────────────────────────────────────
    const outToday = rows
      .filter((r: OpsRow) => {
        const st = normalize(r.status);
        return (st === "in_shipping" || st === "warehouse_ready") && new Date(r.createdAt) >= todayStart;
      })
      .sort((a: OpsRow, b: OpsRow) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30)
      .map((r: OpsRow) => ({
        id: r.id,
        trackingNumber: r.trackingNumber,
        receiverName: r.receiverName,
        receiverCity: r.receiverCity,
        status: normalize(r.status),
        assignedUserId: r.assignedUserId,
        totalAmount: r.totalAmount,
      }));

    // ─── المندوبين (شركات الشحن: نشطة الآن + إحصائياتها آخر 30 يوم) ──────────
    // ملاحظة: "المندوب" هنا = شركة الشحن (من شاشة "مناديب Stark")، وليس حساب
    // مستخدم users — الشحنات ترتبط بشركة الشحن عبر shipments.shipping_company_id.
    const representatives = users.map((u: typeof users[number]) => {
      const repShipments = rows.filter((r: OpsRow) => r.shippingCompanyId === u.id);
      const delivered = repShipments.filter((r: OpsRow) => normalize(r.status) === "received").length;
      const active = repShipments.filter((r: OpsRow) => ["in_shipping", "warehouse_ready", "pending"].includes(normalize(r.status))).length;
      const isOnline = Boolean(u.isActive);
      return {
        id: u.id,
        displayName: u.displayName,
        isOnline,
        onlineSince: null as string | null,
        totalShipments: repShipments.length,
        deliveredShipments: delivered,
        activeShipments: active,
        successRate: repShipments.length > 0 ? Math.round((delivered / repShipments.length) * 100) : 0,
      };
    }).sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0) || b.activeShipments - a.activeShipments);

    // ─── عملاء يحتاجون متابعة (تفصيلي) ───────────────────────────────────────
    const clientIssues = new Map<string, { count: number; lastIssueAt: Date; shipmentIds: number[] }>();
    for (const r of rows) {
      const status = normalize(r.status);
      if (status !== "returned" && status !== "delayed") continue;
      const key = r.senderName?.trim();
      if (!key) continue;
      const entry = clientIssues.get(key) ?? { count: 0, lastIssueAt: new Date(0), shipmentIds: [] };
      entry.count++;
      entry.shipmentIds.push(r.id);
      const issueDate = new Date(r.updatedAt ?? r.createdAt);
      if (issueDate > entry.lastIssueAt) entry.lastIssueAt = issueDate;
      clientIssues.set(key, entry);
    }
    const clientsNeedingFollowup = Array.from(clientIssues.entries())
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([name, v]) => ({
        clientName: name,
        issueCount: v.count,
        lastIssueAt: v.lastIssueAt.toISOString(),
        shipmentIds: v.shipmentIds.slice(0, 5),
      }));

    const result = {
      summary: {
        delayedCount: delayedShipments.length,
        problemCount: problemShipments.length,
        outTodayCount: outToday.length,
        onlineRepsCount: representatives.filter(r => r.isOnline).length,
        totalRepsCount: representatives.length,
        followupCount: clientsNeedingFollowup.length,
      },
      delayedShipments,
      problemShipments,
      outToday,
      representatives,
      clientsNeedingFollowup,
      generatedAt: now.toISOString(),
    };

    setCached(cacheKey, result, 2 * 60 * 1000); // cache دقيقتين — بيانات حساسة تشغيليًا
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/reps-daily ────────────────────────────────────────────────
// لوحة العمليات: "جدول المندوبين اليومي" — نفس منطق representatives في
// operations-center، لكن بفلتر فترة مستقل (اليوم/الأسبوع) بدل تثبيت 30 يوم.
router.get("/analytics/reps-daily", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const periodParam = req.query.period as string;
    const period: "today" | "week" | "custom" =
      periodParam === "week" ? "week" : periodParam === "custom" ? "custom" : "today";
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const cacheKey = period === "custom"
      ? `reps-daily:${tenantId ?? "global"}:custom:${fromParam}:${toParam}`
      : `reps-daily:${tenantId ?? "global"}:${period}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date;
    if (period === "custom" && fromParam && toParam) {
      rangeStart = new Date(fromParam);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(toParam);
      rangeEnd.setHours(23, 59, 59, 999);
    } else {
      rangeStart = new Date(now);
      if (period === "week") {
        rangeStart.setDate(now.getDate() - 6);
      }
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = now;
    }

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt), gte(shipmentsTable.createdAt, rangeStart), lte(shipmentsTable.createdAt, rangeEnd))
      : and(isNull(shipmentsTable.deletedAt), gte(shipmentsTable.createdAt, rangeStart), lte(shipmentsTable.createdAt, rangeEnd));

    const [rows, companies] = await Promise.all([
      db.select({
          status: shipmentsTable.status,
          shippingCompanyId: shipmentsTable.shippingCompanyId,
        })
        .from(shipmentsTable)
        .where(cond),
      tenantId !== null
        ? db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name })
            .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
        : db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name })
            .from(shippingCompaniesTable),
    ]);

    const representatives = companies.map((c) => {
      const repShipments = rows.filter((r) => r.shippingCompanyId === c.id);
      const delivered = repShipments.filter((r) => normalize(r.status) === "received").length;
      return {
        id: c.id,
        displayName: c.displayName,
        totalShipments: repShipments.length,
        deliveredShipments: delivered,
        successRate: repShipments.length > 0 ? Math.round((delivered / repShipments.length) * 100) : 0,
      };
    }).sort((a, b) => b.totalShipments - a.totalShipments);

    const result = { period, representatives, generatedAt: now.toISOString() };
    setCached(cacheKey, result, 2 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/shipments-profit ─────────────────────────────────────────
// لوحة العمليات: ملخص الأرباح (donut) + اتجاه الإيرادات والأرباح اليومي (line chart).
// مبني بالكامل على shipmentsTable (وليس ordersTable) — الإيرادات = المبلغ المحصَّل
// فعليًا، التشغيل = تكلفة البضاعة، الشحن = رسوم الشحن، مصروفات أخرى = رسوم التأمين.
router.get("/analytics/shipments-profit", requirePermission("orders.financials"), async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `shipments-profit:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        status: shipmentsTable.status,
        createdAt: shipmentsTable.createdAt,
        collectedAmount: shipmentsTable.collectedAmount,
        totalAmount: shipmentsTable.totalAmount,
        costPrice: shipmentsTable.costPrice,
        shippingFee: shipmentsTable.shippingFee,
        insuranceFee: shipmentsTable.insuranceFee,
      })
      .from(shipmentsTable)
      .where(and(cond, gte(shipmentsTable.createdAt, thirtyDaysAgo)));

    type ProfitRow = typeof rows[number];

    // الشحنات المُسلَّمة فقط تُحتسب كإيرادات فعلية (received = تم التسليم والتحصيل)
    function computeProfit(subset: ProfitRow[]) {
      let revenue = 0, cost = 0, shippingSpend = 0, otherExpenses = 0, returnCount = 0, ordersCount = 0;
      for (const r of subset) {
        const status = normalize(r.status);
        if (status === "returned") { returnCount++; continue; }
        if (status !== "received") continue; // نحسب الإيراد فقط بعد التسليم الفعلي
        ordersCount++;
        revenue += Number(r.collectedAmount) > 0 ? Number(r.collectedAmount) : Number(r.totalAmount ?? 0);
        cost += Number(r.costPrice ?? 0);
        shippingSpend += Number(r.shippingFee ?? 0);
        otherExpenses += Number(r.insuranceFee ?? 0);
      }
      const netProfit = revenue - cost - shippingSpend - otherExpenses;
      const total = subset.length;
      const returnRate = total > 0 ? Math.round((returnCount / total) * 1000) / 10 : 0;
      return { orders: ordersCount, revenue, cost, shippingSpend, otherExpenses, netProfit, returnRate, returnCount };
    }

    const todayStart = new Date(now.toDateString());
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now); monthStart.setDate(monthStart.getDate() - 30);

    const todayRows = rows.filter((r: ProfitRow) => new Date(r.createdAt) >= todayStart);
    const weekRows = rows.filter((r: ProfitRow) => new Date(r.createdAt) >= weekStart);
    const monthRows = rows; // آخر 30 يوم بالفعل

    // ─── اتجاه يومي (آخر 30 يوم) للرسم البياني ────────────────────────────────
    const dayBuckets = new Map<string, ProfitRow[]>();
    for (const r of rows) {
      const dayKey = new Date(r.createdAt).toISOString().slice(0, 10);
      if (!dayBuckets.has(dayKey)) dayBuckets.set(dayKey, []);
      dayBuckets.get(dayKey)!.push(r);
    }
    const dailyTrend: { date: string; revenue: number; profit: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayRows = dayBuckets.get(key) ?? [];
      const p = computeProfit(dayRows);
      dailyTrend.push({ date: key, revenue: Math.round(p.revenue), profit: Math.round(p.netProfit) });
    }

    const result = {
      today: computeProfit(todayRows),
      week: computeProfit(weekRows),
      month: computeProfit(monthRows),
      dailyTrend,
      generatedAt: now.toISOString(),
    };

    setCached(cacheKey, result, 5 * 60 * 1000); // cache 5 دقائق
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/financial-dashboard ───────────────────────────────────────
// لوحة الأرباح: أرباح اليوم/الشهر، تكلفة التشغيل، تكلفة كل مندوب، تكلفة كل منطقة،
// أعلى وأقل العملاء ربحًا. مبني بالكامل على shipmentsTable (الإيراد = المبلغ المحصَّل
// فعليًا بعد التسليم). آخر 30 يوم لتكلفة المندوب/المنطقة، وaggregate كامل للعملاء.
router.get("/analytics/financial-dashboard", requirePermission("orders.financials"), async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `financial-dashboard:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.toDateString());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [rows, reps] = await Promise.all([
      db.select({
          status: shipmentsTable.status,
          createdAt: shipmentsTable.createdAt,
          collectedAmount: shipmentsTable.collectedAmount,
          totalAmount: shipmentsTable.totalAmount,
          costPrice: shipmentsTable.costPrice,
          shippingFee: shipmentsTable.shippingFee,
          insuranceFee: shipmentsTable.insuranceFee,
          receiverCity: shipmentsTable.receiverCity,
          assignedUserId: shipmentsTable.assignedUserId,
          shippingCompanyId: shipmentsTable.shippingCompanyId,
          senderName: shipmentsTable.senderName,
          clientId: shipmentsTable.clientId,
        })
        .from(shipmentsTable)
        .where(and(cond, gte(shipmentsTable.createdAt, thirtyDaysAgo))),
      tenantId !== null
        ? db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name })
            .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
        : db.select({ id: shippingCompaniesTable.id, displayName: shippingCompaniesTable.name })
            .from(shippingCompaniesTable),
    ]);
    const repNameById = new Map(reps.map((u: typeof reps[number]) => [u.id, u.displayName]));

    type Row = typeof rows[number];

    function computePeriod(subset: Row[]) {
      let revenue = 0, cost = 0, shippingSpend = 0, otherExpenses = 0, orders = 0;
      for (const r of subset) {
        if (normalize(r.status) !== "received") continue;
        orders++;
        revenue += Number(r.collectedAmount) > 0 ? Number(r.collectedAmount) : Number(r.totalAmount ?? 0);
        cost += Number(r.costPrice ?? 0);
        shippingSpend += Number(r.shippingFee ?? 0);
        otherExpenses += Number(r.insuranceFee ?? 0);
      }
      const operatingCost = cost + shippingSpend + otherExpenses;
      const netProfit = revenue - operatingCost;
      return { orders, revenue: Math.round(revenue), cost: Math.round(cost), shippingSpend: Math.round(shippingSpend), otherExpenses: Math.round(otherExpenses), operatingCost: Math.round(operatingCost), netProfit: Math.round(netProfit) };
    }

    const todayRows = rows.filter((r: Row) => new Date(r.createdAt) >= todayStart);
    const monthRows = rows.filter((r: Row) => new Date(r.createdAt) >= monthStart);

    // ─── تكلفة كل مندوب (آخر 30 يوم) ────────────────────────────────────────
    type RepBucket = { repId: number; repName: string; orders: number; revenue: number; cost: number; shippingSpend: number; operatingCost: number; netProfit: number };
    const byRep = new Map<number, RepBucket>();
    for (const r of rows) {
      if (normalize(r.status) !== "received" || !r.assignedUserId) continue;
      const id = r.assignedUserId;
      if (!byRep.has(id)) {
        byRep.set(id, { repId: id, repName: repNameById.get(id) ?? "غير معروف", orders: 0, revenue: 0, cost: 0, shippingSpend: 0, operatingCost: 0, netProfit: 0 });
      }
      const b = byRep.get(id)!;
      const revenue = Number(r.collectedAmount) > 0 ? Number(r.collectedAmount) : Number(r.totalAmount ?? 0);
      const cost = Number(r.costPrice ?? 0);
      const shippingSpend = Number(r.shippingFee ?? 0);
      b.orders++; b.revenue += revenue; b.cost += cost; b.shippingSpend += shippingSpend;
      b.operatingCost += cost + shippingSpend + Number(r.insuranceFee ?? 0);
      b.netProfit += revenue - cost - shippingSpend - Number(r.insuranceFee ?? 0);
    }
    const repCosts = [...byRep.values()]
      .map(b => ({ ...b, revenue: Math.round(b.revenue), cost: Math.round(b.cost), shippingSpend: Math.round(b.shippingSpend), operatingCost: Math.round(b.operatingCost), netProfit: Math.round(b.netProfit) }))
      .sort((a, b) => b.operatingCost - a.operatingCost);

    // ─── تكلفة كل منطقة (آخر 30 يوم) ────────────────────────────────────────
    type ZoneBucket = { city: string; orders: number; revenue: number; operatingCost: number; netProfit: number };
    const byZone = new Map<string, ZoneBucket>();
    for (const r of rows) {
      if (normalize(r.status) !== "received") continue;
      const city = (r.receiverCity ?? "").trim() || "غير محدد";
      if (!byZone.has(city)) byZone.set(city, { city, orders: 0, revenue: 0, operatingCost: 0, netProfit: 0 });
      const b = byZone.get(city)!;
      const revenue = Number(r.collectedAmount) > 0 ? Number(r.collectedAmount) : Number(r.totalAmount ?? 0);
      const opCost = Number(r.costPrice ?? 0) + Number(r.shippingFee ?? 0) + Number(r.insuranceFee ?? 0);
      b.orders++; b.revenue += revenue; b.operatingCost += opCost; b.netProfit += revenue - opCost;
    }
    const zoneCosts = [...byZone.values()]
      .map(b => ({ ...b, revenue: Math.round(b.revenue), operatingCost: Math.round(b.operatingCost), netProfit: Math.round(b.netProfit) }))
      .sort((a, b) => b.operatingCost - a.operatingCost);

    // ─── العملاء (بالاسم senderName، آخر 30 يوم) — الأعلى والأقل ربحًا ───────
    type ClientBucket = { name: string; orders: number; revenue: number; netProfit: number };
    const byClient = new Map<string, ClientBucket>();
    for (const r of rows) {
      if (normalize(r.status) !== "received") continue;
      const name = (r.senderName ?? "").trim() || "غير محدد";
      if (!byClient.has(name)) byClient.set(name, { name, orders: 0, revenue: 0, netProfit: 0 });
      const b = byClient.get(name)!;
      const revenue = Number(r.collectedAmount) > 0 ? Number(r.collectedAmount) : Number(r.totalAmount ?? 0);
      const opCost = Number(r.costPrice ?? 0) + Number(r.shippingFee ?? 0) + Number(r.insuranceFee ?? 0);
      b.orders++; b.revenue += revenue; b.netProfit += revenue - opCost;
    }
    const clientsSorted = [...byClient.values()]
      .map(b => ({ ...b, revenue: Math.round(b.revenue), netProfit: Math.round(b.netProfit) }))
      .filter(c => c.orders >= 2); // استبعاد العملاء بشحنة واحدة فقط لتقليل التشويش
    const topClients = [...clientsSorted].sort((a, b) => b.netProfit - a.netProfit).slice(0, 10);
    const bottomClients = [...clientsSorted].sort((a, b) => a.netProfit - b.netProfit).slice(0, 10);

    const result = {
      today: computePeriod(todayRows),
      month: computePeriod(monthRows),
      last30Days: computePeriod(rows),
      repCosts: repCosts.slice(0, 20),
      zoneCosts: zoneCosts.slice(0, 20),
      topClients,
      bottomClients,
      generatedAt: now.toISOString(),
    };

    setCached(cacheKey, result, 5 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/top-performers ────────────────────────────────────────────
// لوحة العمليات: أفضل العملاء (من جدول العملاء التجاريين الحقيقي عبر clientId،
// مش من اسم/هاتف المستلم النصي) + أفضل المندوبين — حسب الفترة المختارة
// (اليوم/أسبوع/شهر/سنة/فترة مخصصة)، بيانات حقيقية 100%.
router.get("/analytics/top-performers", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = (req.query.period as string | undefined) ?? "month";
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;
    const cacheKey = `top-performers:${tenantId ?? "global"}:${period}:${customFrom ?? ""}:${customTo ?? ""}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    // ── تحديد نطاق الفترة (نفس منطق /analytics/operations-kpis) ────────────
    const now = new Date();
    let rangeFrom: Date;
    let rangeTo: Date = now;
    let periodLabel: string;
    if (period === "today") {
      rangeFrom = new Date(now); rangeFrom.setHours(0, 0, 0, 0);
      periodLabel = "اليوم";
    } else if (period === "week") {
      rangeFrom = new Date(now); rangeFrom.setDate(rangeFrom.getDate() - 6); rangeFrom.setHours(0, 0, 0, 0);
      periodLabel = "آخر 7 أيام";
    } else if (period === "year") {
      rangeFrom = new Date(now.getFullYear(), 0, 1);
      periodLabel = "هذا العام";
    } else if (period === "custom" && customFrom) {
      rangeFrom = new Date(customFrom + "T00:00:00");
      rangeTo = customTo ? new Date(customTo + "T23:59:59") : now;
      periodLabel = "الفترة المحددة";
    } else {
      // "month" (الافتراضي)
      rangeFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      periodLabel = "هذا الشهر";
    }

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const dateCond = and(cond, gte(shipmentsTable.createdAt, rangeFrom), lte(shipmentsTable.createdAt, rangeTo));

    // ═══ 1) أفضل العملاء — تجميع حسب clientId الحقيقي، لكل العملاء (تجاري + عادي) ═══
    // ملحوظة: بنستبعد الشحنات اللي مالهاش clientId (عميل مسجّل) — دي شحنات
    // فردية بدون حساب عميل، مش المطلوب في "أفضل العملاء".
    const allClientCond = tenantId !== null
      ? eq(clientsTable.tenantId, tenantId)
      : undefined;
    type ClientInfoRow = { id: number; name: string; phone: string | null; avatar: string | null; clientType: string | null };
    const allClientInfoRows: ClientInfoRow[] = allClientCond
      ? await db.select({ id: clientsTable.id, name: clientsTable.name, phone: clientsTable.phone, avatar: clientsTable.avatar, clientType: clientsTable.clientType })
          .from(clientsTable).where(allClientCond)
      : await db.select({ id: clientsTable.id, name: clientsTable.name, phone: clientsTable.phone, avatar: clientsTable.avatar, clientType: clientsTable.clientType })
          .from(clientsTable);
    const allClientIdSet = new Set(allClientInfoRows.map(c => c.id));
    const clientNetRevenueDueMap = await computeNetRevenueDueForAllClients(
      allClientInfoRows.map(c => c.id),
      { from: rangeFrom, to: rangeTo, closedOnly: true },
    );

    type ShipmentPerfRow = {
      id: number;
      clientId: number | null;
      status: string | null;
      totalAmount: string | null;
      collectedAmount: string | null;
      assignedUserId: number | null;
      shippingCompanyId: number | null;
    };
    const shipmentRows: ShipmentPerfRow[] = await db
      .select({
        id: shipmentsTable.id,
        clientId: shipmentsTable.clientId,
        status: shipmentsTable.status,
        totalAmount: shipmentsTable.totalAmount,
        collectedAmount: shipmentsTable.collectedAmount,
        assignedUserId: shipmentsTable.assignedUserId,
        shippingCompanyId: shipmentsTable.shippingCompanyId,
      })
      .from(shipmentsTable)
      .where(dateCond);

    type ClientBucket = { clientId: number; shipmentsCount: number; delivered: number };
    const byClient = new Map<number, ClientBucket>();
    for (const r of shipmentRows) {
      if (!r.clientId) continue;
      if (!allClientIdSet.has(r.clientId)) continue; // لازم يكون عميل مسجّل فعليًا
      if (!byClient.has(r.clientId)) byClient.set(r.clientId, { clientId: r.clientId, shipmentsCount: 0, delivered: 0 });
      const b = byClient.get(r.clientId)!;
      b.shipmentsCount++;
      if (normalize(r.status) === "received") b.delivered++;
    }

    const topClients = allClientInfoRows
      .map(info => {
        const bucket = byClient.get(info.id);
        return {
          clientId: info.id,
          name: info.name,
          phone: info.phone,
          avatar: info.avatar,
          clientType: info.clientType ?? "normal",
          shipmentsCount: bucket?.shipmentsCount ?? 0,
          revenue: Math.round(clientNetRevenueDueMap[info.id] ?? 0),
          successRate: bucket && bucket.shipmentsCount > 0 ? Math.round((bucket.delivered / bucket.shipmentsCount) * 100) : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.shipmentsCount - a.shipmentsCount)
      .slice(0, 10);

    // ═══ 2) أفضل المندوبين — دي فعليًا "مناديب Stark" (شركات الشحن)، مش حسابات users.
    // الشحنة ترتبط بالمندوب عبر shipments.shippingCompanyId، مش assignedUserId.
    // بنعرض كل المندوبين المسجّلين (حتى لو مالهمش شحنات في الفترة)، مرتبين من
    // الأفضل نسبة نجاح للأقل، عشان "أفضل المندوبين" يبقى ترتيب كامل مش قايمة جزئية.
    const repCompanies = tenantId !== null
      ? await db.select({ id: shippingCompaniesTable.id, name: shippingCompaniesTable.name, logo: shippingCompaniesTable.logo })
          .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
      : await db.select({ id: shippingCompaniesTable.id, name: shippingCompaniesTable.name, logo: shippingCompaniesTable.logo })
          .from(shippingCompaniesTable);

    type RepBucket = { companyId: number; assigned: number; delivered: number };
    const byRep = new Map<number, RepBucket>();
    for (const r of shipmentRows) {
      const companyId = r.shippingCompanyId;
      if (!companyId) continue;
      if (!byRep.has(companyId)) byRep.set(companyId, { companyId, assigned: 0, delivered: 0 });
      const b = byRep.get(companyId)!;
      b.assigned++;
      if (normalize(r.status) === "received") b.delivered++;
    }

    const companyIds = repCompanies.map(c => c.id);
    type RatingRow = { shipmentId: number; rating: number; shippingCompanyId: number | null };
    const ratingRows: RatingRow[] = companyIds.length > 0
      ? await db.select({ shipmentId: shipmentRatingsTable.shipmentId, rating: shipmentRatingsTable.rating, shippingCompanyId: shipmentsTable.shippingCompanyId })
          .from(shipmentRatingsTable)
          .innerJoin(shipmentsTable, eq(shipmentRatingsTable.shipmentId, shipmentsTable.id))
          .where(and(inArray(shipmentsTable.shippingCompanyId, companyIds), gte(shipmentRatingsTable.createdAt, rangeFrom), lte(shipmentRatingsTable.createdAt, rangeTo)))
      : [];

    const ratingSumByRep = new Map<number, { sum: number; count: number }>();
    for (const rt of ratingRows) {
      const repId = rt.shippingCompanyId;
      if (!repId) continue;
      if (!ratingSumByRep.has(repId)) ratingSumByRep.set(repId, { sum: 0, count: 0 });
      const acc = ratingSumByRep.get(repId)!;
      acc.sum += rt.rating;
      acc.count++;
    }

    const topReps = repCompanies
      .map(company => {
        const bucket = byRep.get(company.id) ?? { companyId: company.id, assigned: 0, delivered: 0 };
        const ratingAcc = ratingSumByRep.get(company.id);
        return {
          userId: company.id,
          name: company.name,
          avatar: company.logo ?? null,
          assigned: bucket.assigned,
          delivered: bucket.delivered,
          successRate: bucket.assigned > 0 ? Math.round((bucket.delivered / bucket.assigned) * 100) : 0,
          avgRating: ratingAcc && ratingAcc.count > 0 ? Math.round((ratingAcc.sum / ratingAcc.count) * 10) / 10 : 0,
          ratingsCount: ratingAcc?.count ?? 0,
        };
      })
      .sort((a, b) => b.successRate - a.successRate || b.assigned - a.assigned)
      .slice(0, 10);

    const result = {
      topClients,
      topReps,
      period,
      periodLabel,
      generatedAt: new Date().toISOString(),
    };

    setCached(cacheKey, result, 5 * 60 * 1000); // cache 5 دقائق
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/recent-events ─────────────────────────────────────────────
// لوحة العمليات: "آخر التنبيهات" — سجل زمني حقيقي لآخر الشحنات ذات الحالات
// الحرجة (متأخرة/مرتجعة/استلام جزئي)، حسب آخر تحديث فعلي على الشحنة.
router.get("/analytics/recent-events", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `recent-events:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    type RecentRow = {
      id: number;
      shipmentNumber: string | null;
      receiverName: string | null;
      status: string | null;
      updatedAt: Date;
    };
    const rows: RecentRow[] = await db
      .select({
        id: shipmentsTable.id,
        shipmentNumber: shipmentsTable.shipmentNumber,
        receiverName: shipmentsTable.receiverName,
        status: shipmentsTable.status,
        updatedAt: shipmentsTable.updatedAt,
      })
      .from(shipmentsTable)
      .where(and(cond, gte(shipmentsTable.updatedAt, thirtyDaysAgo)))
      .orderBy(desc(shipmentsTable.updatedAt))
      .limit(200); // نجيب دفعة أكبر ونفلتر الحالات الحرجة يدويًا، لأن status قيم متعددة قديمة/جديدة

    const CRITICAL_STATUSES = new Set(["delayed", "returned", "partial_received"]);
    const EVENT_META: Record<string, { label: string; type: "delayed" | "returned" | "partial" }> = {
      delayed:          { label: "تم تأجيل الشحنة",         type: "delayed" },
      returned:         { label: "تم إرجاع الشحنة",          type: "returned" },
      partial_received: { label: "استلام جزئي للشحنة",       type: "partial" },
    };

    const events = rows
      .map(r => ({ ...r, normStatus: normalize(r.status) }))
      .filter(r => CRITICAL_STATUSES.has(r.normStatus))
      .slice(0, 8)
      .map(r => ({
        id: r.id,
        shipmentNumber: r.shipmentNumber ?? `#${r.id}`,
        receiverName: r.receiverName ?? "—",
        type: EVENT_META[r.normStatus]?.type ?? "other",
        label: EVENT_META[r.normStatus]?.label ?? "تحديث حالة",
        updatedAt: r.updatedAt,
      }));

    const result = { events, generatedAt: new Date().toISOString() };
    setCached(cacheKey, result, 3 * 60 * 1000); // cache 3 دقائق (أحدث من غيرها لأنها زمنية)
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics/recent-shipments ─────────────────────────────────────────
// لوحة العمليات: "آخر الشحنات" — أحدث N شحنة بغض النظر عن الحالة، مرتبة بآخر تحديث
router.get("/analytics/recent-shipments", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `recent-shipments:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const rows = await db
      .select({
        id: shipmentsTable.id,
        trackingNumber: shipmentsTable.trackingNumber,
        senderName: shipmentsTable.senderName,
        receiverName: shipmentsTable.receiverName,
        status: shipmentsTable.status,
        totalAmount: shipmentsTable.totalAmount,
        updatedAt: shipmentsTable.updatedAt,
      })
      .from(shipmentsTable)
      .where(cond)
      .orderBy(desc(shipmentsTable.updatedAt))
      .limit(20);

    const STATUS_META: Record<string, { label: string; color: string }> = {
      pending:          { label: "قيد الانتظار",  color: "amber" },
      warehouse_ready:  { label: "بالمخزن",        color: "amber" },
      in_shipping:      { label: "قيد الشحن",      color: "sky" },
      delayed:          { label: "مؤجلة",          color: "amber" },
      partial_received: { label: "تسليم جزئي",     color: "sky" },
      received:         { label: "تم التسليم",     color: "emerald" },
      returned:         { label: "مرتجعة",         color: "red" },
    };

    const shipments = rows.map(r => {
      const norm = normalize(r.status);
      const meta = STATUS_META[norm] ?? { label: norm, color: "amber" };
      return {
        id: r.id,
        trackingNumber: r.trackingNumber ?? `#${r.id}`,
        clientName: r.senderName ?? r.receiverName ?? "—",
        status: meta.label,
        statusColor: meta.color,
        amount: r.totalAmount ? Number(r.totalAmount) : 0,
      };
    });

    const result = { shipments, generatedAt: new Date().toISOString() };
    setCached(cacheKey, result, 60 * 1000); // cache دقيقة واحدة — بيانات شبه لحظية
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// شاشة المدير التنفيذي — نظرة سريعة: إيرادات/أرباح الشهر الحالي، معدل النمو
// (مقارنة بنفس الفترة من الشهر السابق)، عدد العملاء الفريدين، عدد الشحنات،
// نسبة النجاح، أكثر منطقة نشاطاً، وتوقع مبسّط للشهر القادم (extrapolation خطي
// بناءً على المعدل اليومي الحالي).
router.get("/analytics/executive-summary", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cacheKey = `executive-summary:${tenantId ?? "global"}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const LEGACY_MAP: Record<string, string> = {
      picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
      delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
    };
    const normalize = (s: string | null) => (s ? (LEGACY_MAP[s] ?? s) : "pending");

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // ── إيرادات/أرباح حقيقية: نفس مصدر "رقم الـ 300" (بيانات المناديب المقفولة + مصروفات الخزنة) ──
    // بدل الحساب القديم من shipmentsTable مباشرة اللي كان بيديلي رقم مختلف عن باقي الشاشة.
    const [currentMonthPnl, prevMonthPnl] = await Promise.all([
      computeManifestsPnl(tenantId, monthStart, null),
      computeManifestsPnl(tenantId, prevMonthStart, monthStart),
    ]);
    const monthProfit = currentMonthPnl.netRevenue;
    const prevMonthProfit = prevMonthPnl.netRevenue;
    const growthRate = prevMonthProfit !== 0
      ? Math.round(((monthProfit - prevMonthProfit) / Math.abs(prevMonthProfit)) * 1000) / 10
      : 0;

    // ── عدد الشحنات: إجمالي كل الشحنات المسجلة (زي قسم الشحنات) — بدون فلتر شهر ──
    const totalShipmentsCountRows = await db.select({ c: count() }).from(shipmentsTable).where(cond);
    const shipmentsCount = totalShipmentsCountRows[0]?.c ?? 0;

    // ── نسبة النجاح وأكثر منطقة نشاطًا: تبقى من شحنات الشهر الحالي (دلالة تشغيلية) ──
    const rows = await db
      .select({
        status: shipmentsTable.status,
        createdAt: shipmentsTable.createdAt,
        receiverCity: shipmentsTable.receiverCity,
      })
      .from(shipmentsTable)
      .where(and(cond, gte(shipmentsTable.createdAt, monthStart)));

    const monthShipmentsCount = rows.length;
    const deliveredCount = rows.filter(r => normalize(r.status) === "received").length;
    const successRate = monthShipmentsCount > 0 ? Math.round((deliveredCount / monthShipmentsCount) * 100) : 0;

    const cityCounts = new Map<string, number>();
    for (const r of rows) {
      const city = (r.receiverCity ?? "").trim() || "غير محدد";
      cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
    }
    let topArea = "—";
    let topAreaCount = 0;
    for (const [city, count] of cityCounts) {
      if (count > topAreaCount) { topArea = city; topAreaCount = count; }
    }

    // ── عدد العملاء: من جدول العملاء (clients) — نفس مصدر شاشة "العملاء التجاريون" بالكامل ──
    const clientsCountCond = tenantId !== null ? eq(clientsTable.tenantId, tenantId) : undefined;
    const clientsCountRows = clientsCountCond
      ? await db.select({ clientsCount: count() }).from(clientsTable).where(clientsCountCond)
      : await db.select({ clientsCount: count() }).from(clientsTable);
    const clientsCount = clientsCountRows[0]?.clientsCount ?? 0;

    // توقع الشهر القادم: مجموع هامش كل الشحنات الجارية حاليًا فى النظام (قيد الشحن
    // فى المخزن / قيد الشحن) مضروبة فى نسبة تسليم ثابتة 60%، بدل الـ extrapolation
    // القديم من متوسط الأداء التاريخي.
    const nextMonthForecast = Math.round(await computeExpectedRevenueTotalForTenant(tenantId));

    const result = {
      revenue: Math.round(currentMonthPnl.totalRevenue),
      profit: Math.round(monthProfit),
      growthRate,
      clientsCount,
      shipmentsCount,
      successRate,
      topArea,
      nextMonthForecast,
      generatedAt: new Date().toISOString(),
    };
    setCached(cacheKey, result, 2 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// لوحة العمليات: اتجاه الإيرادات والأرباح اليومي — آخر 7 أيام أو فترة محددة.
// نفس منطق manifests-pnl-summary بالظبط (بيانات مقفولة فقط، status="closed")،
// لكن مجمّعة يوميًا على أساس تاريخ إغلاق البيان (closedAt) بدل رقم إجمالي واحد.
// خط "الأرباح" = صافي ربح المناديب بس (deliveredShippingFees − totalCourierCost)
// بدون خصم مصاريف الخزنة — حسب طلب المدير.
router.get("/analytics/revenue-trend", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = String(req.query.period ?? "week");
    const fromQ = typeof req.query.from === "string" ? req.query.from : "";
    const toQ = typeof req.query.to === "string" ? req.query.to : "";
    const cacheKey = `revenue-trend:${tenantId ?? "global"}:${period}:${fromQ}:${toQ}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const now = new Date();
    let fromDate = new Date(now);
    let toDate = new Date(now);

    if (period === "custom" && fromQ && toQ) {
      fromDate = new Date(`${fromQ}T00:00:00`);
      toDate = new Date(`${toQ}T23:59:59.999`);
    } else {
      fromDate.setDate(now.getDate() - 6);
      fromDate.setHours(0, 0, 0, 0);
      toDate.setHours(23, 59, 59, 999);
    }
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      res.status(400).json({ error: "Invalid from/to date range" });
      return;
    }
    if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];

    const manifestConditions: any[] = [
      eq(shipmentManifestsTable.status, "closed"),
      gte(shipmentManifestsTable.closedAt, fromDate),
      lte(shipmentManifestsTable.closedAt, toDate),
    ];
    if (tenantId !== null) manifestConditions.push(eq(shipmentManifestsTable.tenantId, tenantId));

    const rows = await db
      .select({
        closedAt: shipmentManifestsTable.closedAt,
        deliveryStatus: shipmentManifestItemsTable.deliveryStatus,
        returnReason: shipmentManifestItemsTable.returnReason,
        partialQuantity: shipmentManifestItemsTable.partialQuantity,
        returnValueReceived: shipmentManifestItemsTable.returnValueReceived,
        deliveredValueReceived: shipmentManifestItemsTable.deliveredValueReceived,
        codAmount: shipmentsTable.codAmount,
        shippingFee: shipmentsTable.shippingFee,
        courierCostPerShipment: shippingCompaniesTable.shippingCost,
      })
      .from(shipmentManifestItemsTable)
      .innerJoin(shipmentManifestsTable, eq(shipmentManifestItemsTable.manifestId, shipmentManifestsTable.id))
      .innerJoin(shipmentsTable, eq(shipmentManifestItemsTable.shipmentId, shipmentsTable.id))
      .leftJoin(shippingCompaniesTable, eq(shipmentManifestsTable.shippingCompanyId, shippingCompaniesTable.id))
      .where(and(...manifestConditions));

    const RETURN_REASONS_WITH_SHIPPING_COST = ["refused_paid", "refused_unpaid", "quality"];

    const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const buckets: { day: string; date: string; revenue: number; profit: number }[] = [];
    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    const lastDay = new Date(toDate);
    lastDay.setHours(0, 0, 0, 0);
    while (cursor <= lastDay) {
      const d = new Date(cursor);
      d.setHours(0, 0, 0, 0);
      buckets.push({ day: DAY_NAMES[d.getDay()], date: d.toISOString().slice(0, 10), revenue: 0, profit: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    const bucketByDate = new Map(buckets.map(b => [b.date, b]));

    for (const r of rows) {
      const isEligible =
        r.deliveryStatus === "delivered" ||
        r.deliveryStatus === "partial_delivered" ||
        (r.deliveryStatus === "returned" && RETURN_REASONS_WITH_SHIPPING_COST.includes(r.returnReason ?? ""));
      if (!isEligible || !r.closedAt) continue;

      const dateKey = new Date(r.closedAt).toISOString().slice(0, 10);
      const bucket = bucketByDate.get(dateKey);
      if (!bucket) continue;

      let revenue = 0;
      if (r.deliveryStatus === "partial_delivered" && r.partialQuantity != null) {
        revenue = Number(r.partialQuantity);
      } else if (r.deliveryStatus === "returned") {
        revenue = Number(r.returnValueReceived ?? 0);
      } else {
        revenue = r.deliveredValueReceived != null ? Number(r.deliveredValueReceived) : Number(r.codAmount ?? 0);
      }
      bucket.revenue += revenue;

      // صافي الربح = رسوم الشحن (shippingFee) − تكلفة المندوب (نفس معادلة manifests-pnl-summary)
      bucket.profit += Number(r.shippingFee ?? 0);
      if (r.deliveryStatus === "delivered" || r.deliveryStatus === "returned") {
        bucket.profit -= Math.abs(Number(r.courierCostPerShipment ?? 0));
      }
    }
    for (const b of buckets) {
      b.revenue = Math.round(b.revenue);
      b.profit = Math.round(b.profit);
    }

    const result = { days: buckets, generatedAt: new Date().toISOString() };
    setCached(cacheKey, result, 5 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /analytics/shipments-intelligence
// المصدر الوحيد: جدول الشحنات (shipmentsTable) — صفحة "تحليل الشحنات"
// بيرجع كل حاجة محتاجها الصفحة في نداء واحد: health score، توزيع الحالات،
// أداء المدن، أداء شركات الشحن، تحليل زمن التسليم/الأعمار، أسباب المرتجعات،
// النبض المالي (COD)، أداء المناديب، الترند الزمني، وتنبيهات ذكية.
// ═══════════════════════════════════════════════════════════════════════════
const SI_LEGACY_MAP: Record<string, string> = {
  picked_up: "warehouse_ready", in_transit: "in_shipping", out_for_delivery: "in_shipping",
  delivered: "received", waiting: "pending", confirmed: "pending", cancelled: "returned",
};
const SI_normalize = (s: string | null) => (s ? (SI_LEGACY_MAP[s] ?? s) : "pending");

const SI_STATUS_META: Record<string, { label: string; color: string }> = {
  pending:          { label: "قيد الانتظار",         color: "#eab308" },
  warehouse_ready:  { label: "قيد الشحن في المخزن",  color: "#14b8a6" },
  in_shipping:      { label: "قيد الشحن",             color: "#3b82f6" },
  delayed:          { label: "مؤجلة",                 color: "#8b5cf6" },
  partial_received: { label: "استلام جزئي",           color: "#06b6d4" },
  received:         { label: "تم التسليم",            color: "#22c55e" },
  returned:         { label: "مرتجعة",                color: "#ef4444" },
};

const SI_RETURN_REASON_LABELS: Record<string, string> = {
  refused_paid:     "رفض بعد المعاينة (دفع الشحن)",
  refused_unpaid:   "رفض بعد المعاينة (بدون دفع)",
  quality:          "تهرب من الاستلام",
  unaware:          "لا يعلم عن الشحنة",
  cancel_requested: "طلب إلغاء",
  no_answer:        "لا يوجد رد",
  out_of_coverage:  "خارج نطاق التغطية",
  closed:           "مغلق",
};

// ── هدف الشحنات الشهري (يُخزَّن في app_settings بمفتاح ديناميكي لكل tenant/شهر) ──
function siMonthlyGoalKey(tenantId: number | null, yearMonth: string): string {
  return `shipments_monthly_goal:${tenantId ?? "global"}:${yearMonth}`;
}

async function getMonthlyGoal(tenantId: number | null, yearMonth: string): Promise<number | null> {
  const key = siMonthlyGoalKey(tenantId, yearMonth);
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  if (!row?.value) return null;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function setMonthlyGoal(tenantId: number | null, yearMonth: string, target: number): Promise<void> {
  const key = siMonthlyGoalKey(tenantId, yearMonth);
  await db.execute(
    sql`INSERT INTO app_settings (\`key\`, \`value\`, \`updated_at\`)
        VALUES (${key}, ${String(target)}, NOW())
        ON DUPLICATE KEY UPDATE \`value\` = ${String(target)}, \`updated_at\` = NOW()`
  );
}

// GET /analytics/shipments-monthly-goal?month=2026-08 — جلب هدف الشهر المحدد (أو الحالي)
router.get("/analytics/shipments-monthly-goal", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const now = new Date();
    const yearMonth = (req.query.month as string | undefined) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const target = await getMonthlyGoal(tenantId, yearMonth);
    res.json({ month: yearMonth, target });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /analytics/shipments-monthly-goal — تحديد/تحديث هدف شهر معيّن (أدمن فقط)
router.put("/analytics/shipments-monthly-goal", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { month, target } = req.body as { month?: string; target?: number };
    const now = new Date();
    const yearMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const targetNum = Number(target);
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      res.status(400).json({ error: "الهدف لازم يكون رقم أكبر من صفر" });
      return;
    }
    await setMonthlyGoal(tenantId, yearMonth, Math.round(targetNum));
    // امسح كاش شهر الحالي/كل الفترات لأن الهدف مرتبط بالـ response
    for (const key of analyticsCache.keys()) {
      if (key.startsWith(`shipments-intelligence:${tenantId ?? "global"}`)) analyticsCache.delete(key);
    }
    res.json({ month: yearMonth, target: Math.round(targetNum) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/analytics/shipments-intelligence", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = (req.query.period as string | undefined) ?? "month"; // today | week | month | year | custom
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;
    const cacheKey = `shipments-intelligence:${tenantId ?? "global"}:${period}:${customFrom ?? ""}:${customTo ?? ""}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const now = new Date();
    let rangeFrom: Date;
    let rangeTo: Date = now;
    if (period === "today") {
      rangeFrom = new Date(now); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      rangeFrom = new Date(now); rangeFrom.setDate(rangeFrom.getDate() - 6); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      rangeFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else if (period === "year") {
      rangeFrom = new Date(now.getFullYear(), 0, 1);
    } else if (period === "custom" && customFrom) {
      rangeFrom = new Date(customFrom + "T00:00:00");
      rangeTo = customTo ? new Date(customTo + "T23:59:59") : now;
    } else {
      rangeFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    // ── فترة المقارنة (السابقة): نفس مدة الفترة الحالية بالظبط، فورًا قبلها ──
    // مثال: لو الفترة الحالية "آخر 30 يوم"، السابقة هي الـ 30 يوم اللي قبلها مباشرة
    const rangeDurationMs = rangeTo.getTime() - rangeFrom.getTime();
    const prevRangeTo = new Date(rangeFrom.getTime() - 1); // لحظة قبل بداية الفترة الحالية مباشرة
    const prevRangeFrom = new Date(prevRangeTo.getTime() - rangeDurationMs);

    const baseCond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    // كل الشحنات النشطة (لغرض توزيع الحالة الحالي — مش محصور بالفترة عشان نعرف الصورة الكاملة)
    const allActiveRows = await db
      .select({
        id: shipmentsTable.id,
        shipmentNumber: shipmentsTable.shipmentNumber,
        receiverName: shipmentsTable.receiverName,
        status: shipmentsTable.status,
        receiverCity: shipmentsTable.receiverCity,
        senderCity: shipmentsTable.senderCity,
        shippingCompanyId: shipmentsTable.shippingCompanyId,
        assignedUserId: shipmentsTable.assignedUserId,
        codAmount: shipmentsTable.codAmount,
        shippingFee: shipmentsTable.shippingFee,
        collectedAmount: shipmentsTable.collectedAmount,
        totalAmount: shipmentsTable.totalAmount,
        returnReason: shipmentsTable.returnReason,
        paymentMethod: shipmentsTable.paymentMethod,
        weight: shipmentsTable.weight,
        pieces: shipmentsTable.pieces,
        createdAt: shipmentsTable.createdAt,
        updatedAt: shipmentsTable.updatedAt,
        estimatedDelivery: shipmentsTable.estimatedDelivery,
        actualDelivery: shipmentsTable.actualDelivery,
      })
      .from(shipmentsTable)
      .where(baseCond);

    // الشحنات اللي وقعت داخل الفترة المختارة (بالـ createdAt) — لاستخدامها في المؤشرات المرتبطة بالفترة
    const rangeRows = allActiveRows.filter(r => {
      const t = new Date(r.createdAt).getTime();
      return t >= rangeFrom.getTime() && t <= rangeTo.getTime();
    });

    // نفس الفلترة لكن للفترة السابقة — عشان نقدر نقارن (مقارنة فترات: هل تحسّنّا ولا لأ)
    const prevRangeRows = allActiveRows.filter(r => {
      const t = new Date(r.createdAt).getTime();
      return t >= prevRangeFrom.getTime() && t <= prevRangeTo.getTime();
    });

    const companies = tenantId !== null
      ? await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
      : await db.select().from(shippingCompaniesTable);
    const companyMap = new Map(companies.map(c => [c.id, c.name]));

    const assignedUserIds = Array.from(new Set(allActiveRows.map(r => r.assignedUserId).filter((v): v is number => !!v)));
    const users = assignedUserIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.displayName }).from(usersTable).where(inArray(usersTable.id, assignedUserIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, u.name]));

    // ── 1) Health Score: مركّب من معدل التسليم + الالتزام بالمواعيد + معدل المرتجعات + السرعة ──
    let delivered = 0, returned = 0, onTime = 0, deliveredWithEta = 0;
    let deliveryHoursSum = 0, deliveryHoursCount = 0;
    for (const r of rangeRows) {
      const status = SI_normalize(r.status);
      if (status === "received") {
        delivered++;
        const created = new Date(r.createdAt).getTime();
        const finished = r.actualDelivery ? new Date(r.actualDelivery).getTime() : new Date(r.updatedAt).getTime();
        const hours = (finished - created) / (1000 * 60 * 60);
        if (hours >= 0 && hours < 24 * 30) { deliveryHoursSum += hours; deliveryHoursCount++; }
        if (r.estimatedDelivery) {
          deliveredWithEta++;
          if (finished <= new Date(r.estimatedDelivery).getTime()) onTime++;
        }
      }
      if (status === "returned") returned++;
    }
    const totalInRange = rangeRows.length;
    // ⚠️ عدّاد "تحقيق الهدف" (kpis.total) لازم يستبعد الشحنات "قيد الانتظار" (waiting/pending)
    // لأنها لسه معلقة ومكانتش اتأكدت في المخزن — نفس منطق استبعادها من إجمالي شحنات العميل.
    // باقي المعدلات (deliveryRate, returnRate...) تفضل مبنية على totalInRange الشامل لأنها
    // نسب محسوبة أصلاً من حالات فعلية (delivered/returned) مش من عدد pending.
    const achievedInRange = rangeRows.filter(r => !["pending", "waiting"].includes(SI_normalize(r.status))).length;
    const deliveryRate = totalInRange > 0 ? (delivered / totalInRange) * 100 : 0;
    const returnRate = totalInRange > 0 ? (returned / totalInRange) * 100 : 0;
    const onTimeRate = deliveredWithEta > 0 ? (onTime / deliveredWithEta) * 100 : (delivered > 0 ? 100 : 0);
    const avgDeliveryHours = deliveryHoursCount > 0 ? deliveryHoursSum / deliveryHoursCount : 0;
    // سرعة التسليم كنسبة: كل ما قلّت الساعات عن 72 ساعة (3 أيام) كل ما زادت النقطة
    const speedScore = avgDeliveryHours > 0 ? Math.max(0, Math.min(100, 100 - ((avgDeliveryHours - 24) / 96) * 100)) : 70;
    const healthScore = Math.round(
      deliveryRate * 0.35 + onTimeRate * 0.25 + (100 - returnRate) * 0.25 + speedScore * 0.15
    );
    const healthGrade = healthScore >= 85 ? "excellent" : healthScore >= 70 ? "good" : healthScore >= 50 ? "warning" : "critical";

    // ── 1.5) نفس الحسابات لكن على الفترة السابقة — لمقارنة الفترات (This vs Last) ──
    let prevDelivered = 0, prevReturned = 0, prevOnTime = 0, prevDeliveredWithEta = 0;
    let prevDeliveryHoursSum = 0, prevDeliveryHoursCount = 0;
    for (const r of prevRangeRows) {
      const status = SI_normalize(r.status);
      if (status === "received") {
        prevDelivered++;
        const created = new Date(r.createdAt).getTime();
        const finished = r.actualDelivery ? new Date(r.actualDelivery).getTime() : new Date(r.updatedAt).getTime();
        const hours = (finished - created) / (1000 * 60 * 60);
        if (hours >= 0 && hours < 24 * 30) { prevDeliveryHoursSum += hours; prevDeliveryHoursCount++; }
        if (r.estimatedDelivery) {
          prevDeliveredWithEta++;
          if (finished <= new Date(r.estimatedDelivery).getTime()) prevOnTime++;
        }
      }
      if (status === "returned") prevReturned++;
    }
    const prevTotalInRange = prevRangeRows.length;
    // نفس استبعاد "قيد الانتظار" من عدّاد الهدف، لكن للفترة السابقة (عشان مقارنة الفترات تفضل متسقة)
    const prevAchievedInRange = prevRangeRows.filter(r => !["pending", "waiting"].includes(SI_normalize(r.status))).length;
    const prevDeliveryRate = prevTotalInRange > 0 ? (prevDelivered / prevTotalInRange) * 100 : 0;
    const prevReturnRate = prevTotalInRange > 0 ? (prevReturned / prevTotalInRange) * 100 : 0;
    const prevOnTimeRate = prevDeliveredWithEta > 0 ? (prevOnTime / prevDeliveredWithEta) * 100 : (prevDelivered > 0 ? 100 : 0);
    const prevAvgDeliveryHours = prevDeliveryHoursCount > 0 ? prevDeliveryHoursSum / prevDeliveryHoursCount : 0;

    // نسبة التغيّر: (الحالي - السابق) / السابق × 100 — null لو مفيش بيانات كافية للمقارنة (مش صفر مضلل)
    const pctChange = (curr: number, prev: number): number | null => {
      if (prevTotalInRange === 0) return null; // مفيش فترة سابقة نقارن بيها أصلاً
      if (prev === 0) return curr > 0 ? 100 : 0; // كان صفر وبقى فيه حاجة = تحسّن كامل
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };
    // للمعدلات (نسب مئوية زي deliveryRate)، الفرق بالنقطة المئوية أوضح من نسبة التغيّر النسبية
    const ptChange = (curr: number, prev: number): number | null => {
      if (prevTotalInRange === 0) return null;
      return Math.round((curr - prev) * 10) / 10;
    };

    // ── تفصيل مكوّنات مؤشر الصحة — عشان يبقى للرقم معنى واضح للمدير ────────
    const returnRateInverted = 100 - returnRate;
    const healthScoreBreakdown = [
      { key: "deliveryRate", label: "معدل التسليم", value: Math.round(deliveryRate * 10) / 10, weight: 35, points: Math.round(deliveryRate * 0.35 * 10) / 10, unit: "%" },
      { key: "onTimeRate", label: "الالتزام بالمواعيد", value: Math.round(onTimeRate * 10) / 10, weight: 25, points: Math.round(onTimeRate * 0.25 * 10) / 10, unit: "%" },
      { key: "returnRate", label: "معدل المرتجعات", value: Math.round(returnRate * 10) / 10, weight: 25, points: Math.round(returnRateInverted * 0.25 * 10) / 10, unit: "%", invert: true },
      { key: "speedScore", label: "سرعة التسليم", value: Math.round(avgDeliveryHours * 10) / 10, weight: 15, points: Math.round(speedScore * 0.15 * 10) / 10, unit: "س" },
    ];

    // ── 2) توزيع الحالات الحالي (كل الشحنات النشطة، مش محصور بالفترة) ──────
    const statusCounts: Record<string, number> = {};
    for (const r of allActiveRows) {
      const s = SI_normalize(r.status);
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
    const statusDistribution = Object.entries(statusCounts)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([status, value]) => ({
        status, value,
        label: SI_STATUS_META[status]?.label ?? status,
        color: SI_STATUS_META[status]?.color ?? "#94a3b8",
        pct: allActiveRows.length > 0 ? Math.round((value / allActiveRows.length) * 100) : 0,
      }));

    // ── 3) أداء المدن (استلام/مرتجع/قيمة) — من receiverCity داخل الفترة ────
    const cityMap = new Map<string, { total: number; delivered: number; returned: number; codValue: number }>();
    for (const r of rangeRows) {
      const city = (r.receiverCity || "غير محدد").trim() || "غير محدد";
      if (!cityMap.has(city)) cityMap.set(city, { total: 0, delivered: 0, returned: 0, codValue: 0 });
      const c = cityMap.get(city)!;
      c.total++;
      const status = SI_normalize(r.status);
      if (status === "received") c.delivered++;
      if (status === "returned") c.returned++;
      c.codValue += Number(r.codAmount ?? 0);
    }
    const cityPerformance = Array.from(cityMap.entries())
      .map(([city, d]) => ({
        city, total: d.total, delivered: d.delivered, returned: d.returned,
        codValue: Math.round(d.codValue),
        successRate: d.total > 0 ? Math.round((d.delivered / d.total) * 100) : 0,
        returnRate: d.total > 0 ? Math.round((d.returned / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    // ── 4) أداء شركات الشحن ─────────────────────────────────────────────────
    const companyStatsMap = new Map<number | "none", { total: number; delivered: number; returned: number; hoursSum: number; hoursCount: number; fee: number }>();
    for (const r of rangeRows) {
      const key = r.shippingCompanyId ?? "none";
      if (!companyStatsMap.has(key)) companyStatsMap.set(key, { total: 0, delivered: 0, returned: 0, hoursSum: 0, hoursCount: 0, fee: 0 });
      const c = companyStatsMap.get(key)!;
      c.total++;
      c.fee += Number(r.shippingFee ?? 0);
      const status = SI_normalize(r.status);
      if (status === "received") {
        c.delivered++;
        const created = new Date(r.createdAt).getTime();
        const finished = r.actualDelivery ? new Date(r.actualDelivery).getTime() : new Date(r.updatedAt).getTime();
        const hours = (finished - created) / (1000 * 60 * 60);
        if (hours >= 0 && hours < 24 * 30) { c.hoursSum += hours; c.hoursCount++; }
      }
      if (status === "returned") c.returned++;
    }
    const companyPerformance = Array.from(companyStatsMap.entries())
      .map(([key, d]) => ({
        companyId: key === "none" ? null : key,
        companyName: key === "none" ? "شحنة بدون مندوب شحن" : (companyMap.get(key as number) ?? "—"),
        total: d.total, delivered: d.delivered, returned: d.returned,
        successRate: d.total > 0 ? Math.round((d.delivered / d.total) * 100) : 0,
        returnRate: d.total > 0 ? Math.round((d.returned / d.total) * 100) : 0,
        avgDeliveryHours: d.hoursCount > 0 ? Math.round(d.hoursSum / d.hoursCount) : 0,
        totalFees: Math.round(d.fee),
      }))
      .sort((a, b) => b.total - a.total);

    // ── 4.5) تحليل الوزن وعدد القطع مقابل معدل النجاح ───────────────────────
    // بيوضح هل الشحنات التقيلة/متعددة القطع بترجع أكتر — يفيد في سياسة التغليف والتسعير
    const WEIGHT_BUCKETS = [
      { key: "light",  label: "خفيفة (أقل من 1 كجم)", min: 0, max: 1 },
      { key: "medium", label: "متوسطة (1 - 5 كجم)",    min: 1, max: 5 },
      { key: "heavy",  label: "تقيلة (أكتر من 5 كجم)",  min: 5, max: Infinity },
    ];
    const weightStatsMap = new Map<string, { total: number; delivered: number; returned: number }>();
    for (const r of rangeRows) {
      const w = Number(r.weight);
      if (!Number.isFinite(w) || w <= 0) continue; // استبعاد الشحنات بدون وزن مسجّل
      const bucket = WEIGHT_BUCKETS.find(b => w > b.min && w <= b.max) ?? WEIGHT_BUCKETS[WEIGHT_BUCKETS.length - 1];
      if (!weightStatsMap.has(bucket.key)) weightStatsMap.set(bucket.key, { total: 0, delivered: 0, returned: 0 });
      const s = weightStatsMap.get(bucket.key)!;
      s.total++;
      const status = SI_normalize(r.status);
      if (status === "received") s.delivered++;
      if (status === "returned") s.returned++;
    }
    const weightAnalysis = WEIGHT_BUCKETS
      .map(b => {
        const s = weightStatsMap.get(b.key) ?? { total: 0, delivered: 0, returned: 0 };
        return {
          key: b.key, label: b.label, total: s.total, delivered: s.delivered, returned: s.returned,
          successRate: s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0,
          returnRate: s.total > 0 ? Math.round((s.returned / s.total) * 100) : 0,
        };
      })
      .filter(b => b.total > 0);

    const PIECES_BUCKETS = [
      { key: "single", label: "قطعة واحدة",  min: 1, max: 1 },
      { key: "few",    label: "2 - 3 قطع",   min: 2, max: 3 },
      { key: "many",   label: "4 قطع فأكتر", min: 4, max: Infinity },
    ];
    const piecesStatsMap = new Map<string, { total: number; delivered: number; returned: number }>();
    for (const r of rangeRows) {
      const p = Number(r.pieces);
      if (!Number.isFinite(p) || p <= 0) continue; // استبعاد الشحنات بدون عدد قطع مسجّل
      const bucket = PIECES_BUCKETS.find(b => p >= b.min && p <= b.max) ?? PIECES_BUCKETS[PIECES_BUCKETS.length - 1];
      if (!piecesStatsMap.has(bucket.key)) piecesStatsMap.set(bucket.key, { total: 0, delivered: 0, returned: 0 });
      const s = piecesStatsMap.get(bucket.key)!;
      s.total++;
      const status = SI_normalize(r.status);
      if (status === "received") s.delivered++;
      if (status === "returned") s.returned++;
    }
    const piecesAnalysis = PIECES_BUCKETS
      .map(b => {
        const s = piecesStatsMap.get(b.key) ?? { total: 0, delivered: 0, returned: 0 };
        return {
          key: b.key, label: b.label, total: s.total, delivered: s.delivered, returned: s.returned,
          successRate: s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0,
          returnRate: s.total > 0 ? Math.round((s.returned / s.total) * 100) : 0,
        };
      })
      .filter(b => b.total > 0);

    // ── 4.6) خريطة اتجاه الشحن (Sender City → Receiver City) ────────────────
    // أكتر المسارات تكرارًا وأداء كل مسار لوحده — بيفيد في معرفة مثلاً
    // إن مسار "القاهرة → الإسكندرية" بيرجع أكتر من غيره، حتى لو كل مدينة لوحدها شكلها كويس
    const routeMap = new Map<string, { from: string; to: string; total: number; delivered: number; returned: number; hoursSum: number; hoursCount: number }>();
    for (const r of rangeRows) {
      const from = (r.senderCity || "غير محدد").trim() || "غير محدد";
      const to = (r.receiverCity || "غير محدد").trim() || "غير محدد";
      const key = `${from}→${to}`;
      if (!routeMap.has(key)) routeMap.set(key, { from, to, total: 0, delivered: 0, returned: 0, hoursSum: 0, hoursCount: 0 });
      const rt = routeMap.get(key)!;
      rt.total++;
      const status = SI_normalize(r.status);
      if (status === "received") {
        rt.delivered++;
        const created = new Date(r.createdAt).getTime();
        const finished = r.actualDelivery ? new Date(r.actualDelivery).getTime() : new Date(r.updatedAt).getTime();
        const hours = (finished - created) / (1000 * 60 * 60);
        if (hours >= 0 && hours < 24 * 30) { rt.hoursSum += hours; rt.hoursCount++; }
      }
      if (status === "returned") rt.returned++;
    }
    const routeAnalysis = Array.from(routeMap.values())
      .filter(r => r.total >= 2) // نستبعد المسارات النادرة اللي شحنة واحدة فقط — مش كافية لاستنتاج نمط
      .map(r => ({
        from: r.from, to: r.to,
        total: r.total, delivered: r.delivered, returned: r.returned,
        successRate: r.total > 0 ? Math.round((r.delivered / r.total) * 100) : 0,
        returnRate: r.total > 0 ? Math.round((r.returned / r.total) * 100) : 0,
        avgDeliveryHours: r.hoursCount > 0 ? Math.round((r.hoursSum / r.hoursCount) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // ── 4.7) تنبيه "SLA حقيقي" — الفرق الفعلي بالساعات بين الموعد المتوقع والتسليم الفعلي ──
    // بيغطي حالتين: (أ) شحنات اتسلمت فعلاً لكن متأخرة عن estimatedDelivery
    //              (ب) شحنات لسه ماشية (مش received/returned) وفات ميعادها المتوقع بالفعل (متأخرة دلوقتي)
    // مصدر الداتا: allActiveRows (كل الشحنات النشطة، مش محصور بالفترة) — عشان التأخير الحالي يبان
    // حتى لو الشحنة اتعملت من فترة أطول من الفترة المختارة في الفلتر
    type SlaBreach = {
      id: number; shipmentNumber: string | null; receiverName: string;
      receiverCity: string; status: string;
      estimatedDelivery: string; actualDelivery: string | null;
      delayHours: number; isOngoing: boolean; // isOngoing = لسه متأخرة ومستنية، مش اتسلمت
    };
    const slaBreaches: SlaBreach[] = [];
    for (const r of allActiveRows) {
      if (!r.estimatedDelivery) continue; // مفيش ميعاد متوقع مسجّل أصلاً، مينفعش نقارن
      const status = SI_normalize(r.status);
      const estimatedTime = new Date(r.estimatedDelivery).getTime();
      if (status === "received") {
        // اتسلمت — قارن بالتسليم الفعلي (أو updatedAt لو مفيش actualDelivery مسجّل)
        const finished = r.actualDelivery ? new Date(r.actualDelivery).getTime() : new Date(r.updatedAt).getTime();
        const delayHours = (finished - estimatedTime) / (1000 * 60 * 60);
        if (delayHours > 0) {
          slaBreaches.push({
            id: r.id, shipmentNumber: r.shipmentNumber, receiverName: r.receiverName,
            receiverCity: r.receiverCity || "غير محدد", status,
            estimatedDelivery: r.estimatedDelivery.toISOString(),
            actualDelivery: r.actualDelivery ? r.actualDelivery.toISOString() : null,
            delayHours: Math.round(delayHours * 10) / 10, isOngoing: false,
          });
        }
      } else if (status !== "returned") {
        // لسه ماشية (pending/warehouse_ready/in_shipping/delayed) وفات ميعادها المتوقع فعلاً
        const delayHours = (now.getTime() - estimatedTime) / (1000 * 60 * 60);
        if (delayHours > 0) {
          slaBreaches.push({
            id: r.id, shipmentNumber: r.shipmentNumber, receiverName: r.receiverName,
            receiverCity: r.receiverCity || "غير محدد", status,
            estimatedDelivery: r.estimatedDelivery.toISOString(),
            actualDelivery: null,
            delayHours: Math.round(delayHours * 10) / 10, isOngoing: true,
          });
        }
      }
    }
    slaBreaches.sort((a, b) => b.delayHours - a.delayHours);
    const slaAnalysis = {
      totalBreaches: slaBreaches.length,
      ongoingBreaches: slaBreaches.filter(b => b.isOngoing).length, // متأخرة دلوقتي وليها متابعة فورية
      avgDelayHours: slaBreaches.length > 0
        ? Math.round((slaBreaches.reduce((s, b) => s + b.delayHours, 0) / slaBreaches.length) * 10) / 10
        : 0,
      worstBreaches: slaBreaches.slice(0, 20), // أكتر 20 شحنة تأخرًا
    };

    // ── 5) تحليل أعمار الشحنات النشطة (Aging buckets) — لكل الشحنات المعلقة حالياً ──
    const AGING_BUCKETS = [
      { key: "0-3",   label: "0-3 أيام",   min: 0,  max: 3 },
      { key: "4-7",   label: "4-7 أيام",   min: 4,  max: 7 },
      { key: "8-14",  label: "8-14 يوم",   min: 8,  max: 14 },
      { key: "15+",   label: "15+ يوم",    min: 15, max: Infinity },
    ];
    const pendingStatuses = new Set(["pending", "warehouse_ready", "in_shipping", "delayed"]);
    const agingCounts = AGING_BUCKETS.map(b => ({ ...b, count: 0 }));
    for (const r of allActiveRows) {
      const status = SI_normalize(r.status);
      if (!pendingStatuses.has(status)) continue;
      const days = Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const bucket = agingCounts.find(b => days >= b.min && days <= b.max);
      if (bucket) bucket.count++;
    }
    const agingAnalysis = agingCounts.map(({ key, label, count }) => ({ key, label, count }));

    // ── 6) أسباب المرتجعات ──────────────────────────────────────────────────
    const returnReasonCounts: Record<string, number> = {};
    let returnedTotalInRange = 0;
    for (const r of rangeRows) {
      if (SI_normalize(r.status) !== "returned") continue;
      returnedTotalInRange++;
      const reason = r.returnReason || "غير محدد";
      returnReasonCounts[reason] = (returnReasonCounts[reason] ?? 0) + 1;
    }
    const returnReasons = Object.entries(returnReasonCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({
        reason,
        label: SI_RETURN_REASON_LABELS[reason] ?? reason,
        count,
        pct: returnedTotalInRange > 0 ? Math.round((count / returnedTotalInRange) * 100) : 0,
      }));

    // ── 7) النبض المالي (COD) ──────────────────────────────────────────────
    let codExpected = 0, codCollected = 0, shippingFeesTotal = 0;
    let codOrders = 0, prepaidOrders = 0, deferredOrders = 0;
    for (const r of rangeRows) {
      codExpected += Number(r.codAmount ?? 0);
      codCollected += Number(r.collectedAmount ?? 0);
      shippingFeesTotal += Number(r.shippingFee ?? 0);
      if (r.paymentMethod === "cod") codOrders++;
      else if (r.paymentMethod === "prepaid") prepaidOrders++;
      else if (r.paymentMethod === "deferred") deferredOrders++;
    }
    const financialPulse = {
      codExpected: Math.round(codExpected),
      codCollected: Math.round(codCollected),
      collectionRate: codExpected > 0 ? Math.round((codCollected / codExpected) * 100) : 0,
      shippingFeesTotal: Math.round(shippingFeesTotal),
      paymentMix: { cod: codOrders, prepaid: prepaidOrders, deferred: deferredOrders },
    };

    // ── 8) أداء المناديب/المسؤولين عن الشحنات ──────────────────────────────
    const repMap = new Map<number, { total: number; delivered: number; returned: number }>();
    for (const r of rangeRows) {
      if (!r.assignedUserId) continue;
      if (!repMap.has(r.assignedUserId)) repMap.set(r.assignedUserId, { total: 0, delivered: 0, returned: 0 });
      const rp = repMap.get(r.assignedUserId)!;
      rp.total++;
      const status = SI_normalize(r.status);
      if (status === "received") rp.delivered++;
      if (status === "returned") rp.returned++;
    }
    const repPerformance = Array.from(repMap.entries())
      .map(([userId, d]) => ({
        userId, name: userMap.get(userId) ?? `#${userId}`,
        total: d.total, delivered: d.delivered, returned: d.returned,
        successRate: d.total > 0 ? Math.round((d.delivered / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // ── 9) الترند الزمني (تجميع يومي لآخر 30 يوم أو حسب الفترة) ────────────
    const trendDays = Math.min(60, Math.max(7, Math.ceil((rangeTo.getTime() - rangeFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1));
    const trendBuckets: { date: string; total: number; delivered: number; returned: number }[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date(rangeTo); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      trendBuckets.push({ date: d.toISOString().slice(0, 10), total: 0, delivered: 0, returned: 0 });
    }
    const trendIndexByDate = new Map(trendBuckets.map((b, i) => [b.date, i]));
    for (const r of rangeRows) {
      const dateKey = new Date(r.createdAt).toISOString().slice(0, 10);
      const idx = trendIndexByDate.get(dateKey);
      if (idx === undefined) continue;
      trendBuckets[idx].total++;
      const status = SI_normalize(r.status);
      if (status === "received") trendBuckets[idx].delivered++;
      if (status === "returned") trendBuckets[idx].returned++;
    }

    // ── 10) تنبيهات ذكية ─────────────────────────────────────────────────
    const alerts: { level: "critical" | "warning" | "info"; message: string }[] = [];
    if (slaAnalysis.ongoingBreaches > 0) {
      alerts.push({ level: "critical", message: `${slaAnalysis.ongoingBreaches} شحنة متأخرة عن ميعادها المتوقع فعليًا ومستنية متابعة الآن` });
    }
    const criticalAging = agingAnalysis.find(b => b.key === "15+");
    if (criticalAging && criticalAging.count > 0) {
      alerts.push({ level: "critical", message: `${criticalAging.count} شحنة متأخرة أكتر من 15 يوم وتحتاج متابعة فورية` });
    }
    if (returnRate > 15) {
      alerts.push({ level: "warning", message: `معدل المرتجعات ${Math.round(returnRate)}% أعلى من المعدل الصحي (15%)` });
    }
    const worstCity = cityPerformance.filter(c => c.total >= 5).sort((a, b) => b.returnRate - a.returnRate)[0];
    if (worstCity && worstCity.returnRate > 25) {
      alerts.push({ level: "warning", message: `مدينة "${worstCity.city}" بمعدل مرتجعات ${worstCity.returnRate}%` });
    }
    const worstCompany = companyPerformance.filter(c => c.total >= 5).sort((a, b) => a.successRate - b.successRate)[0];
    if (worstCompany && worstCompany.successRate < 70) {
      const worstCompanyLabel = worstCompany.companyId == null ? `"${worstCompany.companyName}"` : `شركة "${worstCompany.companyName}"`;
      alerts.push({ level: "warning", message: `${worstCompanyLabel} بمعدل نجاح ${worstCompany.successRate}% فقط` });
    }
    if (financialPulse.collectionRate < 85 && codExpected > 0) {
      alerts.push({ level: "info", message: `نسبة تحصيل COD ${financialPulse.collectionRate}% — فرق ${Math.round(codExpected - codCollected)} ج.م لم يُحصّل بعد` });
    }
    if (alerts.length === 0) {
      alerts.push({ level: "info", message: "كل المؤشرات ضمن النطاق الصحي — أداء ممتاز 👌" });
    }

    const result = {
      period, rangeFrom: rangeFrom.toISOString(), rangeTo: rangeTo.toISOString(),
      healthScore, healthGrade, healthScoreBreakdown,
      kpis: {
        total: totalInRange,
        // achieved: نفس total لكن مستبعد منه الشحنات "قيد الانتظار" (waiting/pending) —
        // ده اللي المفروض يتستخدم لحساب نسبة "تحقيق الهدف" الشهري (مش total الخام)
        achieved: achievedInRange,
        delivered, returned,
        deliveryRate: Math.round(deliveryRate * 10) / 10,
        returnRate: Math.round(returnRate * 10) / 10,
        onTimeRate: Math.round(onTimeRate * 10) / 10,
        avgDeliveryHours: Math.round(avgDeliveryHours * 10) / 10,
      },
      // ── مقارنة الفترات: نفس الـ KPIs لكن للفترة السابقة مباشرة + نسبة/فرق التغيّر ──
      // hasPreviousPeriod = false لو مفيش شحنات في الفترة السابقة أصلاً (يمنع عرض "0%" مضلل)
      previousPeriod: {
        hasPreviousPeriod: prevTotalInRange > 0,
        rangeFrom: prevRangeFrom.toISOString(),
        rangeTo: prevRangeTo.toISOString(),
        kpis: {
          total: prevTotalInRange,
          achieved: prevAchievedInRange,
          delivered: prevDelivered, returned: prevReturned,
          deliveryRate: Math.round(prevDeliveryRate * 10) / 10,
          returnRate: Math.round(prevReturnRate * 10) / 10,
          onTimeRate: Math.round(prevOnTimeRate * 10) / 10,
          avgDeliveryHours: Math.round(prevAvgDeliveryHours * 10) / 10,
        },
      },
      kpiTrends: {
        total: pctChange(totalInRange, prevTotalInRange),
        delivered: pctChange(delivered, prevDelivered),
        returned: pctChange(returned, prevReturned),
        deliveryRate: ptChange(deliveryRate, prevDeliveryRate),
        returnRate: ptChange(returnRate, prevReturnRate),
        onTimeRate: ptChange(onTimeRate, prevOnTimeRate),
        avgDeliveryHours: pctChange(avgDeliveryHours, prevAvgDeliveryHours),
      },
      statusDistribution,
      cityPerformance,
      companyPerformance,
      weightAnalysis,
      piecesAnalysis,
      routeAnalysis,
      slaAnalysis,
      agingAnalysis,
      returnReasons,
      financialPulse,
      repPerformance,
      trend: trendBuckets,
      alerts,
      generatedAt: now.toISOString(),
    };

    setCached(cacheKey, result, 3 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /analytics/representatives-intelligence
// المصدر الوحيد: جدول الشحنات (shipmentsTable) مربوطًا بـ shippingCompaniesTable
// (كل صف في shipping_companies يمثّل "مندوب شحن" — الاسم القديم للجدول لسه company لأسباب تاريخية)
// صفحة "التحليل الذكي لمناديب الشحن" — تحليل مخصص لأداء كل مندوب لوحده، مش نظرة عامة على الشحنات
// ═══════════════════════════════════════════════════════════════════════════
router.get("/analytics/representatives-intelligence", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = (req.query.period as string | undefined) ?? "month";
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;
    const cacheKey = `representatives-intelligence:${tenantId ?? "global"}:${period}:${customFrom ?? ""}:${customTo ?? ""}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const now = new Date();
    let rangeFrom: Date;
    let rangeTo: Date = now;
    if (period === "today") {
      rangeFrom = new Date(now); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      rangeFrom = new Date(now); rangeFrom.setDate(rangeFrom.getDate() - 6); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      rangeFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else if (period === "year") {
      rangeFrom = new Date(now.getFullYear(), 0, 1);
    } else if (period === "custom" && customFrom) {
      rangeFrom = new Date(customFrom + "T00:00:00");
      rangeTo = customTo ? new Date(customTo + "T23:59:59") : now;
    } else {
      rangeFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }
    // فترة سابقة بنفس المدة — لحساب اتجاه أداء كل مندوب (تحسّن/تراجع)
    const rangeDurationMs = rangeTo.getTime() - rangeFrom.getTime();
    const prevRangeTo = new Date(rangeFrom.getTime() - 1);
    const prevRangeFrom = new Date(prevRangeTo.getTime() - rangeDurationMs);

    const baseCond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const reps = tenantId !== null
      ? await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.tenantId, tenantId))
      : await db.select().from(shippingCompaniesTable);

    const rows = await db
      .select({
        id: shipmentsTable.id,
        status: shipmentsTable.status,
        shippingCompanyId: shipmentsTable.shippingCompanyId,
        codAmount: shipmentsTable.codAmount,
        collectedAmount: shipmentsTable.collectedAmount,
        shippingFee: shipmentsTable.shippingFee,
        createdAt: shipmentsTable.createdAt,
        updatedAt: shipmentsTable.updatedAt,
        estimatedDelivery: shipmentsTable.estimatedDelivery,
        actualDelivery: shipmentsTable.actualDelivery,
      })
      .from(shipmentsTable)
      .where(baseCond);

    const inRange = rows.filter(r => {
      const t = new Date(r.createdAt).getTime();
      return t >= rangeFrom.getTime() && t <= rangeTo.getTime();
    });
    const inPrevRange = rows.filter(r => {
      const t = new Date(r.createdAt).getTime();
      return t >= prevRangeFrom.getTime() && t <= prevRangeTo.getTime();
    });

    // ── دالة حساب مجموعة كاملة من المقاييس لمندوب واحد في نطاق زمني معيّن ──
    type RepMetrics = {
      total: number; delivered: number; returned: number; ongoing: number;
      deliveryRate: number; returnRate: number;
      onTime: number; deliveredWithEta: number; onTimeRate: number;
      deliveryHoursSum: number; deliveryHoursCount: number; avgDeliveryHours: number;
      codExpected: number; codCollected: number; collectionRate: number;
      shippingFeesTotal: number;
    };
    function computeRepMetrics(repRows: typeof rows): RepMetrics {
      let total = 0, delivered = 0, returned = 0, ongoing = 0;
      let onTime = 0, deliveredWithEta = 0;
      let deliveryHoursSum = 0, deliveryHoursCount = 0;
      let codExpected = 0, codCollected = 0, shippingFeesTotal = 0;
      for (const r of repRows) {
        total++;
        const status = SI_normalize(r.status);
        codExpected += Number(r.codAmount ?? 0);
        codCollected += Number(r.collectedAmount ?? 0);
        shippingFeesTotal += Number(r.shippingFee ?? 0);
        if (status === "received") {
          delivered++;
          const created = new Date(r.createdAt).getTime();
          const finished = r.actualDelivery ? new Date(r.actualDelivery).getTime() : new Date(r.updatedAt).getTime();
          const hours = (finished - created) / (1000 * 60 * 60);
          if (hours >= 0 && hours < 24 * 30) { deliveryHoursSum += hours; deliveryHoursCount++; }
          if (r.estimatedDelivery) {
            deliveredWithEta++;
            if (finished <= new Date(r.estimatedDelivery).getTime()) onTime++;
          }
        } else if (status === "returned") {
          returned++;
        } else {
          ongoing++;
        }
      }
      const deliveryRate = total > 0 ? (delivered / total) * 100 : 0;
      const returnRate = total > 0 ? (returned / total) * 100 : 0;
      const onTimeRate = deliveredWithEta > 0 ? (onTime / deliveredWithEta) * 100 : (delivered > 0 ? 100 : 0);
      const avgDeliveryHours = deliveryHoursCount > 0 ? deliveryHoursSum / deliveryHoursCount : 0;
      const collectionRate = codExpected > 0 ? (codCollected / codExpected) * 100 : 0;
      return {
        total, delivered, returned, ongoing,
        deliveryRate, returnRate, onTime, deliveredWithEta, onTimeRate,
        deliveryHoursSum, deliveryHoursCount, avgDeliveryHours,
        codExpected, codCollected, collectionRate, shippingFeesTotal,
      };
    }

    // ── تجميع صفوف الفترة الحالية والسابقة حسب المندوب ──────────────────────
    const rangeByRep = new Map<number, typeof rows>();
    for (const r of inRange) {
      if (!r.shippingCompanyId) continue;
      if (!rangeByRep.has(r.shippingCompanyId)) rangeByRep.set(r.shippingCompanyId, []);
      rangeByRep.get(r.shippingCompanyId)!.push(r);
    }
    const prevRangeByRep = new Map<number, typeof rows>();
    for (const r of inPrevRange) {
      if (!r.shippingCompanyId) continue;
      if (!prevRangeByRep.has(r.shippingCompanyId)) prevRangeByRep.set(r.shippingCompanyId, []);
      prevRangeByRep.get(r.shippingCompanyId)!.push(r);
    }

    // سرعة التسليم كنقاط (0-100): كل ما قلّت الساعات عن 72 ساعة (3 أيام) كل ما زادت النقطة — نفس منطق shipments-intelligence
    const speedScoreOf = (avgDeliveryHours: number) =>
      avgDeliveryHours > 0 ? Math.max(0, Math.min(100, 100 - ((avgDeliveryHours - 24) / 96) * 100)) : 70;

    // ── 1) Ranking Score مركّب لكل مندوب: نجاح + سرعة + التزام بالمواعيد + (عكس) المرتجعات ──
    // نفس أوزان health score بتاع shipments-intelligence عشان يبقى فيه اتساق بين الصفحتين
    const rankingScoreOf = (m: RepMetrics) => {
      const speedScore = speedScoreOf(m.avgDeliveryHours);
      return Math.round(
        m.deliveryRate * 0.35 + m.onTimeRate * 0.25 + (100 - m.returnRate) * 0.25 + speedScore * 0.15
      );
    };

    // ── 2) اتجاه الأداء عبر الزمن (تحسّن/تراجع) — بمقارنة Ranking Score الحالي بالسابق ──
    const trendOf = (currScore: number, prevMetrics: RepMetrics | null): { direction: "up" | "down" | "flat" | "new"; delta: number | null } => {
      if (!prevMetrics || prevMetrics.total === 0) return { direction: "new", delta: null };
      const prevScore = rankingScoreOf(prevMetrics);
      const delta = Math.round((currScore - prevScore) * 10) / 10;
      if (Math.abs(delta) < 2) return { direction: "flat", delta };
      return { direction: delta > 0 ? "up" : "down", delta };
    };

    // ── حساب تكلفة الشحن الفعلية لكل مندوب (من shippingCompaniesTable.shippingCost) ──
    // ملحوظة: costMode ممكن يكون "rep" (سعر ثابت) أو "zone" — بنستخدم shippingCost كتقدير موحّد لكل الحالتين
    // لأن حساب تكلفة الزون الفعلي محتاج ربط بجدول zone_costs لكل شحنة، وده تفصيل زايد عن هدف "نظرة سريعة على التكلفة"
    const repCostById = new Map(reps.map(r => [r.id, Number(r.shippingCost ?? 0)]));

    // ── بناء صف تحليل كامل لكل مندوب ─────────────────────────────────────────
    type RepInsight = {
      id: number; name: string; logo: string | null; isActive: boolean;
      metrics: RepMetrics;
      rankingScore: number;
      trend: { direction: "up" | "down" | "flat" | "new"; delta: number | null };
      shippingCost: number;
      costPerDelivery: number | null; // تكلفة الشحن / عدد الشحنات المُسلَّمة — كل ما قلّت كل ما كان أفضل
      loadSharePct: number; // نسبة الشحنات اللي شايلها المندوب من إجمالي شحنات الفترة
    };

    const totalShipmentsInRange = inRange.length;
    const repInsights: RepInsight[] = reps.map(rep => {
      const repRows = rangeByRep.get(rep.id) ?? [];
      const metrics = computeRepMetrics(repRows);
      const prevMetrics = prevRangeByRep.has(rep.id) ? computeRepMetrics(prevRangeByRep.get(rep.id)!) : null;
      const rankingScore = rankingScoreOf(metrics);
      const trend = trendOf(rankingScore, prevMetrics);
      const shippingCost = repCostById.get(rep.id) ?? 0;
      const costPerDelivery = metrics.delivered > 0 && shippingCost > 0
        ? Math.round((shippingCost * metrics.total / metrics.delivered) * 100) / 100
        : null;
      const loadSharePct = totalShipmentsInRange > 0 ? Math.round((metrics.total / totalShipmentsInRange) * 1000) / 10 : 0;
      return {
        id: rep.id, name: rep.name, logo: rep.logo ?? null, isActive: rep.isActive,
        metrics, rankingScore, trend, shippingCost, costPerDelivery, loadSharePct,
      };
    });

    // ── ترتيب المناديب: الأعلى نقاطًا أولاً، ثم الأكتر حجمًا للمتساويين ────
    const ranking = [...repInsights]
      .sort((a, b) => b.rankingScore - a.rankingScore || b.metrics.total - a.metrics.total)
      .map((r, idx) => ({
        rank: idx + 1,
        id: r.id, name: r.name, logo: r.logo,
        rankingScore: r.rankingScore,
        trend: r.trend,
        total: r.metrics.total,
        delivered: r.metrics.delivered,
        returned: r.metrics.returned,
        deliveryRate: Math.round(r.metrics.deliveryRate * 10) / 10,
        returnRate: Math.round(r.metrics.returnRate * 10) / 10,
        onTimeRate: Math.round(r.metrics.onTimeRate * 10) / 10,
        avgDeliveryHours: Math.round(r.metrics.avgDeliveryHours * 10) / 10,
      }));

    // ── 3) تحليل التكلفة مقابل الأداء — بس للمناديب اللي عندها تكلفة مسجّلة وشحنات فعلية ──
    const costVsPerformance = repInsights
      .filter(r => r.shippingCost > 0 && r.metrics.total > 0)
      .map(r => ({
        id: r.id, name: r.name,
        shippingCost: r.shippingCost,
        costPerDelivery: r.costPerDelivery,
        deliveryRate: Math.round(r.metrics.deliveryRate * 10) / 10,
        avgDeliveryHours: Math.round(r.metrics.avgDeliveryHours * 10) / 10,
        rankingScore: r.rankingScore,
        // تصنيف سريع: "قيمة ممتازة" = تكلفة أقل من المتوسط + أداء أعلى من المتوسط
        total: r.metrics.total,
      }))
      .sort((a, b) => (a.costPerDelivery ?? Infinity) - (b.costPerDelivery ?? Infinity));

    // تصنيف كل مندوب بالنسبة لمتوسط التكلفة ومتوسط الأداء في نفس المجموعة
    const avgCostPerDelivery = costVsPerformance.length > 0
      ? costVsPerformance.reduce((s, r) => s + (r.costPerDelivery ?? 0), 0) / costVsPerformance.length
      : 0;
    const avgRankingScore = costVsPerformance.length > 0
      ? costVsPerformance.reduce((s, r) => s + r.rankingScore, 0) / costVsPerformance.length
      : 0;
    const costVsPerformanceLabeled = costVsPerformance.map(r => {
      const cheap = (r.costPerDelivery ?? Infinity) <= avgCostPerDelivery;
      const fast = r.rankingScore >= avgRankingScore;
      const quadrant = cheap && fast ? "best_value" : !cheap && fast ? "premium" : cheap && !fast ? "budget_risk" : "underperformer";
      return { ...r, quadrant };
    });

    // ── 4) تحليل COD (نسبة التحصيل الفعلي لكل مندوب) — بس للي عندهم COD في الفترة ──
    const codAnalysis = repInsights
      .filter(r => r.metrics.codExpected > 0)
      .map(r => ({
        id: r.id, name: r.name,
        codExpected: Math.round(r.metrics.codExpected),
        codCollected: Math.round(r.metrics.codCollected),
        collectionRate: Math.round(r.metrics.collectionRate * 10) / 10,
        shippingFeesTotal: Math.round(r.metrics.shippingFeesTotal),
      }))
      .sort((a, b) => a.collectionRate - b.collectionRate); // الأسوأ تحصيلاً أولاً — يحتاج انتباه

    // ── 5) توزيع الحمل (Load Balance) — هل الشحنات موزّعة بعدل ولا مندوب واحد شايل كل الحمل؟ ──
    const activeReps = repInsights.filter(r => r.metrics.total > 0);
    const loadBalance = activeReps
      .map(r => ({ id: r.id, name: r.name, total: r.metrics.total, loadSharePct: r.loadSharePct }))
      .sort((a, b) => b.total - a.total);
    // مؤشر التركّز: نسبة الشحنات اللي بيشيلها أعلى مندوب واحد فقط — كل ما زادت كل ما كان الاعتماد عليه خطر
    const topRepLoadSharePct = loadBalance.length > 0 ? loadBalance[0].loadSharePct : 0;
    const loadBalanceStatus: "balanced" | "concentrated" | "critical" =
      topRepLoadSharePct >= 60 ? "critical" : topRepLoadSharePct >= 40 ? "concentrated" : "balanced";

    // ── 6) تنبيهات ذكية خاصة بالمناديب ───────────────────────────────────────
    type RepAlert = { type: string; severity: "critical" | "warning" | "info"; repId: number; repName: string; message: string };
    const alerts: RepAlert[] = [];
    for (const r of repInsights) {
      if (r.metrics.total === 0) continue;
      // مندوب معدل نجاحه بينزل بشكل واضح (تراجع 10+ نقطة في Ranking Score)
      if (r.trend.direction === "down" && r.trend.delta !== null && r.trend.delta <= -10) {
        alerts.push({
          type: "declining_performance", severity: "warning", repId: r.id, repName: r.name,
          message: `أداء "${r.name}" تراجع ${Math.abs(r.trend.delta)} نقطة عن الفترة السابقة`,
        });
      }
      // مندوب معدل مرتجعاته مرتفع بشكل ملحوظ
      if (r.metrics.total >= 5 && r.metrics.returnRate >= 25) {
        alerts.push({
          type: "high_return_rate", severity: "critical", repId: r.id, repName: r.name,
          message: `"${r.name}" معدل مرتجعاته ${Math.round(r.metrics.returnRate)}% — أعلى من المعتاد`,
        });
      }
      // مندوب شايل حمل غير متناسب (أكتر من 50% من إجمالي الشحنات)
      if (r.loadSharePct >= 50) {
        alerts.push({
          type: "overloaded", severity: "warning", repId: r.id, repName: r.name,
          message: `"${r.name}" شايل ${r.loadSharePct}% من إجمالي الشحنات — اعتماد مركّز عليه`,
        });
      }
      // مندوب نسبة تحصيله للـ COD منخفضة
      if (r.metrics.codExpected > 0 && r.metrics.collectionRate < 70) {
        alerts.push({
          type: "low_collection_rate", severity: "warning", repId: r.id, repName: r.name,
          message: `نسبة تحصيل COD عند "${r.name}" ${Math.round(r.metrics.collectionRate)}% فقط`,
        });
      }
      // مندوب التزامه بالمواعيد ضعيف رغم إنه بيسلّم
      if (r.metrics.deliveredWithEta >= 5 && r.metrics.onTimeRate < 50) {
        alerts.push({
          type: "low_on_time_rate", severity: "info", repId: r.id, repName: r.name,
          message: `"${r.name}" يلتزم بالمواعيد في ${Math.round(r.metrics.onTimeRate)}% فقط من شحناته`,
        });
      }
    }
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const periodLabels: Record<string, string> = { today: "اليوم", week: "آخر 7 أيام", month: "آخر 30 يوم", year: "السنة الحالية", custom: "فترة مخصصة" };
    const periodLabel = periodLabels[period] ?? "آخر 30 يوم";

    const result = {
      period, periodLabel,
      generatedAt: new Date().toISOString(),
      repsCount: reps.length,
      activeRepsCount: activeReps.length,
      totalShipmentsInRange,
      ranking,
      costVsPerformance: costVsPerformanceLabeled,
      codAnalysis,
      loadBalance: { reps: loadBalance, topRepLoadSharePct, status: loadBalanceStatus },
      alerts,
    };

    setCached(cacheKey, result, 5 * 60 * 1000); // cache 5 دقائق زي باقي endpoints الثقيلة
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /analytics/zones-intelligence
// المصدر: shipmentsTable مربوطًا بـ shipmentZonesTable (المناطق) وzoneCostsTable (تكلفة التوصيل)
// صفحة "تحليل المناطق الذكي" — تحليل مخصص لأداء كل منطقة جغرافية لوحدها
// (نجاح/مرتجعات/سرعة/ربحية/تركّز الحمل) — مش نظرة عامة على الشحنات
// ═══════════════════════════════════════════════════════════════════════════
router.get("/analytics/zones-intelligence", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = (req.query.period as string | undefined) ?? "month";
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;
    const cacheKey = `zones-intelligence:${tenantId ?? "global"}:${period}:${customFrom ?? ""}:${customTo ?? ""}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const now = new Date();
    let rangeFrom: Date;
    let rangeTo: Date = now;
    if (period === "today") {
      rangeFrom = new Date(now); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      rangeFrom = new Date(now); rangeFrom.setDate(rangeFrom.getDate() - 6); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      rangeFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else if (period === "year") {
      rangeFrom = new Date(now.getFullYear(), 0, 1);
    } else if (period === "custom" && customFrom) {
      rangeFrom = new Date(customFrom + "T00:00:00");
      rangeTo = customTo ? new Date(customTo + "T23:59:59") : now;
    } else {
      rangeFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }
    // فترة سابقة بنفس المدة — لحساب اتجاه أداء كل منطقة (تحسّن/تراجع)
    const rangeDurationMs = rangeTo.getTime() - rangeFrom.getTime();
    const prevRangeTo = new Date(rangeFrom.getTime() - 1);
    const prevRangeFrom = new Date(prevRangeTo.getTime() - rangeDurationMs);

    const baseCond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const zones = tenantId !== null
      ? await db.select().from(shipmentZonesTable).where(eq(shipmentZonesTable.tenantId, tenantId))
      : await db.select().from(shipmentZonesTable);
    const zoneById = new Map(zones.map(z => [z.id, z]));

    const rows = await db
      .select({
        id: shipmentsTable.id,
        status: shipmentsTable.status,
        zoneId: shipmentsTable.zoneId,
        zonePrice: shipmentsTable.zonePrice,
        receiverCity: shipmentsTable.receiverCity,
        codAmount: shipmentsTable.codAmount,
        collectedAmount: shipmentsTable.collectedAmount,
        shippingFee: shipmentsTable.shippingFee,
        createdAt: shipmentsTable.createdAt,
        updatedAt: shipmentsTable.updatedAt,
        estimatedDelivery: shipmentsTable.estimatedDelivery,
        actualDelivery: shipmentsTable.actualDelivery,
      })
      .from(shipmentsTable)
      .where(baseCond);

    const inRange = rows.filter(r => {
      const t = new Date(r.createdAt).getTime();
      return t >= rangeFrom.getTime() && t <= rangeTo.getTime();
    });
    const inPrevRange = rows.filter(r => {
      const t = new Date(r.createdAt).getTime();
      return t >= prevRangeFrom.getTime() && t <= prevRangeTo.getTime();
    });

    // ── تكلفة التوصيل الفعلية لكل منطقة (من zoneCostsTable) — تُستخدم لحساب هامش الربح ──
    const zoneIds = [...new Set(zones.map(z => z.id))];
    const zoneCosts = zoneIds.length
      ? await db.select({ zoneId: zoneCostsTable.zoneId, deliveryCost: zoneCostsTable.deliveryCost })
          .from(zoneCostsTable)
          .where(and(
            inArray(zoneCostsTable.zoneId, zoneIds),
            tenantId !== null
              ? or(eq(zoneCostsTable.tenantId, tenantId), isNull(zoneCostsTable.tenantId))
              : undefined,
          ))
      : [];
    const zoneCostMap = new Map(zoneCosts.map(z => [z.zoneId, Number(z.deliveryCost ?? 0)]));

    // ── دالة حساب مجموعة كاملة من المقاييس لمنطقة واحدة في نطاق زمني معيّن ──
    type ZoneMetrics = {
      total: number; delivered: number; returned: number; ongoing: number;
      deliveryRate: number; returnRate: number;
      onTime: number; deliveredWithEta: number; onTimeRate: number;
      deliveryHoursSum: number; deliveryHoursCount: number; avgDeliveryHours: number;
      codExpected: number; codCollected: number; collectionRate: number;
      revenueTotal: number; // إجمالي سعر الشحن المحصَّل من العملاء لشحنات هذه المنطقة
    };
    function computeZoneMetrics(zoneRows: typeof rows): ZoneMetrics {
      let total = 0, delivered = 0, returned = 0, ongoing = 0;
      let onTime = 0, deliveredWithEta = 0;
      let deliveryHoursSum = 0, deliveryHoursCount = 0;
      let codExpected = 0, codCollected = 0, revenueTotal = 0;
      for (const r of zoneRows) {
        total++;
        const status = SI_normalize(r.status);
        codExpected += Number(r.codAmount ?? 0);
        codCollected += Number(r.collectedAmount ?? 0);
        revenueTotal += Number(r.zonePrice ?? 0) || Number(r.shippingFee ?? 0);
        if (status === "received") {
          delivered++;
          const created = new Date(r.createdAt).getTime();
          const finished = r.actualDelivery ? new Date(r.actualDelivery).getTime() : new Date(r.updatedAt).getTime();
          const hours = (finished - created) / (1000 * 60 * 60);
          if (hours >= 0 && hours < 24 * 30) { deliveryHoursSum += hours; deliveryHoursCount++; }
          if (r.estimatedDelivery) {
            deliveredWithEta++;
            if (finished <= new Date(r.estimatedDelivery).getTime()) onTime++;
          }
        } else if (status === "returned") {
          returned++;
        } else {
          ongoing++;
        }
      }
      const deliveryRate = total > 0 ? (delivered / total) * 100 : 0;
      const returnRate = total > 0 ? (returned / total) * 100 : 0;
      const onTimeRate = deliveredWithEta > 0 ? (onTime / deliveredWithEta) * 100 : (delivered > 0 ? 100 : 0);
      const avgDeliveryHours = deliveryHoursCount > 0 ? deliveryHoursSum / deliveryHoursCount : 0;
      const collectionRate = codExpected > 0 ? (codCollected / codExpected) * 100 : 0;
      return {
        total, delivered, returned, ongoing,
        deliveryRate, returnRate, onTime, deliveredWithEta, onTimeRate,
        deliveryHoursSum, deliveryHoursCount, avgDeliveryHours,
        codExpected, codCollected, collectionRate, revenueTotal,
      };
    }

    // ── تجميع صفوف الفترة الحالية والسابقة حسب المنطقة ──────────────────────
    const rangeByZone = new Map<number, typeof rows>();
    for (const r of inRange) {
      if (!r.zoneId) continue;
      if (!rangeByZone.has(r.zoneId)) rangeByZone.set(r.zoneId, []);
      rangeByZone.get(r.zoneId)!.push(r);
    }
    const prevRangeByZone = new Map<number, typeof rows>();
    for (const r of inPrevRange) {
      if (!r.zoneId) continue;
      if (!prevRangeByZone.has(r.zoneId)) prevRangeByZone.set(r.zoneId, []);
      prevRangeByZone.get(r.zoneId)!.push(r);
    }

    // سرعة التسليم كنقاط (0-100) — نفس منطق shipments-intelligence وrepresentatives-intelligence
    const speedScoreOf = (avgDeliveryHours: number) =>
      avgDeliveryHours > 0 ? Math.max(0, Math.min(100, 100 - ((avgDeliveryHours - 24) / 96) * 100)) : 70;

    // ── 1) Zone Score مركّب لكل منطقة: نجاح + سرعة + التزام بالمواعيد + (عكس) المرتجعات ──
    // نفس أوزان health score بتاع shipments-intelligence وrepresentatives-intelligence عشان اتساق كامل بين الصفحات
    const zoneScoreOf = (m: ZoneMetrics) => {
      const speedScore = speedScoreOf(m.avgDeliveryHours);
      return Math.round(
        m.deliveryRate * 0.35 + m.onTimeRate * 0.25 + (100 - m.returnRate) * 0.25 + speedScore * 0.15
      );
    };

    // ── 2) اتجاه الأداء عبر الزمن (تحسّن/تراجع) — بمقارنة Zone Score الحالي بالسابق ──
    const trendOf = (currScore: number, prevMetrics: ZoneMetrics | null): { direction: "up" | "down" | "flat" | "new"; delta: number | null } => {
      if (!prevMetrics || prevMetrics.total === 0) return { direction: "new", delta: null };
      const prevScore = zoneScoreOf(prevMetrics);
      const delta = Math.round((currScore - prevScore) * 10) / 10;
      if (Math.abs(delta) < 2) return { direction: "flat", delta };
      return { direction: delta > 0 ? "up" : "down", delta };
    };

    // ── بناء صف تحليل كامل لكل منطقة ─────────────────────────────────────────
    type ZoneInsight = {
      id: number; name: string; fromGovernorate: string | null; toGovernorate: string | null; isActive: boolean;
      metrics: ZoneMetrics;
      zoneScore: number;
      trend: { direction: "up" | "down" | "flat" | "new"; delta: number | null };
      deliveryCost: number; // تكلفة التوصيل المسجّلة للمنطقة (zone_costs)
      avgRevenuePerShipment: number | null;
      marginPerShipment: number | null; // متوسط السعر المحصَّل - تكلفة التوصيل — هامش الربح الفعلي للمنطقة
      marginPct: number | null;
      loadSharePct: number; // نسبة شحنات المنطقة من إجمالي شحنات الفترة
    };

    const totalShipmentsInRange = inRange.length;
    const zoneInsights: ZoneInsight[] = zones.map(zone => {
      const zoneRows = rangeByZone.get(zone.id) ?? [];
      const metrics = computeZoneMetrics(zoneRows);
      const prevMetrics = prevRangeByZone.has(zone.id) ? computeZoneMetrics(prevRangeByZone.get(zone.id)!) : null;
      const zoneScore = zoneScoreOf(metrics);
      const trend = trendOf(zoneScore, prevMetrics);
      const deliveryCost = zoneCostMap.get(zone.id) ?? 0;
      const avgRevenuePerShipment = metrics.total > 0 ? Math.round((metrics.revenueTotal / metrics.total) * 100) / 100 : null;
      const marginPerShipment = avgRevenuePerShipment !== null && deliveryCost > 0
        ? Math.round((avgRevenuePerShipment - deliveryCost) * 100) / 100
        : null;
      const marginPct = marginPerShipment !== null && avgRevenuePerShipment && avgRevenuePerShipment > 0
        ? Math.round((marginPerShipment / avgRevenuePerShipment) * 1000) / 10
        : null;
      const loadSharePct = totalShipmentsInRange > 0 ? Math.round((metrics.total / totalShipmentsInRange) * 1000) / 10 : 0;
      return {
        id: zone.id, name: zone.name, fromGovernorate: zone.fromGovernorate ?? null, toGovernorate: zone.toGovernorate ?? null,
        isActive: zone.isActive ?? true,
        metrics, zoneScore, trend, deliveryCost, avgRevenuePerShipment, marginPerShipment, marginPct, loadSharePct,
      };
    });

    // ── ترتيب المناطق: الأعلى نقاطًا أولاً، ثم الأكتر حجمًا للمتساويين ────
    const ranking = [...zoneInsights]
      .sort((a, b) => b.zoneScore - a.zoneScore || b.metrics.total - a.metrics.total)
      .map((z, idx) => ({
        rank: idx + 1,
        id: z.id, name: z.name, fromGovernorate: z.fromGovernorate, toGovernorate: z.toGovernorate,
        zoneScore: z.zoneScore,
        trend: z.trend,
        total: z.metrics.total,
        delivered: z.metrics.delivered,
        returned: z.metrics.returned,
        deliveryRate: Math.round(z.metrics.deliveryRate * 10) / 10,
        returnRate: Math.round(z.metrics.returnRate * 10) / 10,
        onTimeRate: Math.round(z.metrics.onTimeRate * 10) / 10,
        avgDeliveryHours: Math.round(z.metrics.avgDeliveryHours * 10) / 10,
      }));

    // ── 3) تحليل الربحية لكل منطقة — بس للمناطق اللي عندها تكلفة توصيل مسجّلة وشحنات فعلية ──
    const profitability = zoneInsights
      .filter(z => z.deliveryCost > 0 && z.metrics.total > 0)
      .map(z => ({
        id: z.id, name: z.name,
        deliveryCost: z.deliveryCost,
        avgRevenuePerShipment: z.avgRevenuePerShipment,
        marginPerShipment: z.marginPerShipment,
        marginPct: z.marginPct,
        totalMargin: z.marginPerShipment !== null ? Math.round(z.marginPerShipment * z.metrics.total) : null,
        zoneScore: z.zoneScore,
        total: z.metrics.total,
      }))
      .sort((a, b) => (a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity)); // الأضعف هامشًا أولاً — يحتاج مراجعة تسعير

    // تصنيف كل منطقة بالنسبة لمتوسط الهامش ومتوسط الأداء في نفس المجموعة (Quadrant زي المناديب)
    const avgMarginPct = profitability.length > 0
      ? profitability.reduce((s, z) => s + (z.marginPct ?? 0), 0) / profitability.length
      : 0;
    const avgZoneScore = profitability.length > 0
      ? profitability.reduce((s, z) => s + z.zoneScore, 0) / profitability.length
      : 0;
    const profitabilityLabeled = profitability.map(z => {
      const profitable = (z.marginPct ?? -Infinity) >= avgMarginPct;
      const reliable = z.zoneScore >= avgZoneScore;
      const quadrant = profitable && reliable ? "star_zone" : !profitable && reliable ? "underpriced" : profitable && !reliable ? "risky_margin" : "review_needed";
      return { ...z, quadrant };
    });

    // ── 4) تحليل COD حسب المنطقة (نسبة التحصيل الفعلي) — بس للمناطق اللي عندها COD في الفترة ──
    const codAnalysis = zoneInsights
      .filter(z => z.metrics.codExpected > 0)
      .map(z => ({
        id: z.id, name: z.name,
        codExpected: Math.round(z.metrics.codExpected),
        codCollected: Math.round(z.metrics.codCollected),
        collectionRate: Math.round(z.metrics.collectionRate * 10) / 10,
      }))
      .sort((a, b) => a.collectionRate - b.collectionRate); // الأسوأ تحصيلاً أولاً — يحتاج انتباه

    // ── 5) توزيع الحمل بين المناطق (Load Balance) — هل الشحنات موزّعة جغرافيًا بعدل ولا منطقة واحدة شايلة كل الحمل؟ ──
    const activeZones = zoneInsights.filter(z => z.metrics.total > 0);
    const loadBalance = activeZones
      .map(z => ({ id: z.id, name: z.name, total: z.metrics.total, loadSharePct: z.loadSharePct }))
      .sort((a, b) => b.total - a.total);
    const topZoneLoadSharePct = loadBalance.length > 0 ? loadBalance[0].loadSharePct : 0;
    const loadBalanceStatus: "balanced" | "concentrated" | "critical" =
      topZoneLoadSharePct >= 60 ? "critical" : topZoneLoadSharePct >= 40 ? "concentrated" : "balanced";

    // ── 6) أداء حسب المحافظة (تجميع كل مناطق نفس محافظة الوجهة toGovernorate) ──
    const byGovernorate = new Map<string, { total: number; delivered: number; returned: number }>();
    for (const z of zoneInsights) {
      const gov = z.toGovernorate || "غير محدد";
      if (!byGovernorate.has(gov)) byGovernorate.set(gov, { total: 0, delivered: 0, returned: 0 });
      const g = byGovernorate.get(gov)!;
      g.total += z.metrics.total; g.delivered += z.metrics.delivered; g.returned += z.metrics.returned;
    }
    const governoratePerformance = [...byGovernorate.entries()]
      .filter(([, g]) => g.total > 0)
      .map(([governorate, g]) => ({
        governorate, total: g.total, delivered: g.delivered, returned: g.returned,
        deliveryRate: Math.round((g.delivered / g.total) * 1000) / 10,
        returnRate: Math.round((g.returned / g.total) * 1000) / 10,
      }))
      .sort((a, b) => b.total - a.total);

    // ── 7) تنبيهات ذكية خاصة بالمناطق ───────────────────────────────────────
    type ZoneAlert = { type: string; severity: "critical" | "warning" | "info"; zoneId: number; zoneName: string; message: string };
    const alerts: ZoneAlert[] = [];
    for (const z of zoneInsights) {
      if (z.metrics.total === 0) continue;
      // منطقة معدل نجاحها بينزل بشكل واضح (تراجع 10+ نقطة في Zone Score)
      if (z.trend.direction === "down" && z.trend.delta !== null && z.trend.delta <= -10) {
        alerts.push({
          type: "declining_performance", severity: "warning", zoneId: z.id, zoneName: z.name,
          message: `أداء منطقة "${z.name}" تراجع ${Math.abs(z.trend.delta)} نقطة عن الفترة السابقة`,
        });
      }
      // منطقة معدل مرتجعاتها مرتفع بشكل ملحوظ
      if (z.metrics.total >= 5 && z.metrics.returnRate >= 25) {
        alerts.push({
          type: "high_return_rate", severity: "critical", zoneId: z.id, zoneName: z.name,
          message: `منطقة "${z.name}" معدل مرتجعاتها ${Math.round(z.metrics.returnRate)}% — أعلى من المعتاد`,
        });
      }
      // منطقة شايلة حمل غير متناسب (أكتر من 50% من إجمالي الشحنات) — خطر تركّز جغرافي
      if (z.loadSharePct >= 50) {
        alerts.push({
          type: "overloaded", severity: "warning", zoneId: z.id, zoneName: z.name,
          message: `منطقة "${z.name}" تستحوذ على ${z.loadSharePct}% من إجمالي الشحنات — اعتماد جغرافي مركّز`,
        });
      }
      // منطقة هامش ربحها سالب أو ضعيف جدًا رغم وجود تكلفة مسجّلة — يحتاج مراجعة تسعير
      if (z.marginPct !== null && z.marginPct < 5 && z.metrics.total >= 5) {
        alerts.push({
          type: "low_margin", severity: z.marginPct < 0 ? "critical" : "warning", zoneId: z.id, zoneName: z.name,
          message: z.marginPct < 0
            ? `منطقة "${z.name}" بتخسر فعليًا — سعر التوصيل أقل من التكلفة (هامش ${z.marginPct}%)`
            : `هامش ربح منطقة "${z.name}" ضعيف جدًا (${z.marginPct}%) — يحتاج مراجعة تسعير`,
        });
      }
      // منطقة التزامها بالمواعيد ضعيف رغم إنها بتسلّم
      if (z.metrics.deliveredWithEta >= 5 && z.metrics.onTimeRate < 50) {
        alerts.push({
          type: "low_on_time_rate", severity: "info", zoneId: z.id, zoneName: z.name,
          message: `منطقة "${z.name}" يُلتزم بمواعيدها في ${Math.round(z.metrics.onTimeRate)}% فقط من شحناتها`,
        });
      }
      // منطقة نسبة تحصيل COD منخفضة
      if (z.metrics.codExpected > 0 && z.metrics.collectionRate < 70) {
        alerts.push({
          type: "low_collection_rate", severity: "warning", zoneId: z.id, zoneName: z.name,
          message: `نسبة تحصيل COD في منطقة "${z.name}" ${Math.round(z.metrics.collectionRate)}% فقط`,
        });
      }
    }
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const periodLabels: Record<string, string> = { today: "اليوم", week: "آخر 7 أيام", month: "آخر 30 يوم", year: "السنة الحالية", custom: "فترة مخصصة" };
    const periodLabel = periodLabels[period] ?? "آخر 30 يوم";

    const result = {
      period, periodLabel,
      generatedAt: new Date().toISOString(),
      zonesCount: zones.length,
      activeZonesCount: activeZones.length,
      totalShipmentsInRange,
      ranking,
      profitability: profitabilityLabeled,
      codAnalysis,
      loadBalance: { zones: loadBalance, topZoneLoadSharePct, status: loadBalanceStatus },
      governoratePerformance,
      alerts,
    };

    setCached(cacheKey, result, 5 * 60 * 1000); // cache 5 دقائق زي باقي endpoints الثقيلة
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /analytics/inventory-intelligence
// المصدر: productsTable + productVariantsTable + warehouseStockTable + warehousesTable + inventoryMovementsTable
// صفحة "تحليل المخزون الذكي" — تحليل مخصص لصحة المخزون: سرعة الحركة، رأس المال
// المجمد، توزيع المخازن، اتجاه الحركة عبر الزمن، وتنبيهات ذكية للمنتجات الخطرة
// ═══════════════════════════════════════════════════════════════════════════
router.get("/analytics/inventory-intelligence", requireAuth, async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const period = (req.query.period as string | undefined) ?? "month";
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;
    const cacheKey = `inventory-intelligence:${tenantId ?? "global"}:${period}:${customFrom ?? ""}:${customTo ?? ""}`;
    const cached = getCached<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const now = new Date();
    let rangeFrom: Date;
    let rangeTo: Date = now;
    if (period === "today") {
      rangeFrom = new Date(now); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      rangeFrom = new Date(now); rangeFrom.setDate(rangeFrom.getDate() - 6); rangeFrom.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      rangeFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else if (period === "year") {
      rangeFrom = new Date(now.getFullYear(), 0, 1);
    } else if (period === "custom" && customFrom) {
      rangeFrom = new Date(customFrom + "T00:00:00");
      rangeTo = customTo ? new Date(customTo + "T23:59:59") : now;
    } else {
      rangeFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }
    const rangeDurationMs = rangeTo.getTime() - rangeFrom.getTime();
    const prevRangeTo = new Date(rangeFrom.getTime() - 1);
    const prevRangeFrom = new Date(prevRangeTo.getTime() - rangeDurationMs);

    // ── منتجات الـ tenant (غير مؤرشفة فقط للتحليل الحي) ──────────────────────
    const productConditions: any[] = [eq(productsTable.isArchived, false)];
    if (tenantId !== null) productConditions.push(eq(productsTable.tenantId, tenantId));

    const products = await db.select().from(productsTable).where(and(...productConditions));
    const productIds = products.map(p => p.id);
    const productById = new Map(products.map(p => [p.id, p]));

    const variants = productIds.length
      ? await db.select().from(productVariantsTable).where(inArray(productVariantsTable.productId, productIds))
      : [];
    const variantsByProduct = new Map<number, typeof variants>();
    for (const v of variants) {
      if (!variantsByProduct.has(v.productId)) variantsByProduct.set(v.productId, []);
      variantsByProduct.get(v.productId)!.push(v);
    }

    const warehouses = tenantId !== null
      ? await db.select().from(warehousesTable).where(eq(warehousesTable.tenantId, tenantId))
      : await db.select().from(warehousesTable);
    const warehouseById = new Map(warehouses.map(w => [w.id, w]));

    const stockRows = productIds.length
      ? await db.select().from(warehouseStockTable).where(inArray(warehouseStockTable.productId, productIds))
      : [];

    // ── حركات المخزون لكل منتجات الـ tenant (فترة موسّعة تكفي الفترة الحالية والسابقة) ──
    const movementsWindowFrom = prevRangeFrom;
    const movements = productIds.length
      ? await db.select().from(inventoryMovementsTable).where(and(
          inArray(inventoryMovementsTable.productId, productIds),
          gte(inventoryMovementsTable.createdAt, movementsWindowFrom),
        ))
      : [];

    const movementsInRange = movements.filter(m => {
      const t = new Date(m.createdAt).getTime();
      return t >= rangeFrom.getTime() && t <= rangeTo.getTime();
    });
    const movementsInPrevRange = movements.filter(m => {
      const t = new Date(m.createdAt).getTime();
      return t >= prevRangeFrom.getTime() && t <= prevRangeTo.getTime();
    });

    // ── إجمالي الكمية الفعلية لكل منتج من warehouse_stock (أدق من totalQuantity الثابت) ──
    const stockByProduct = new Map<number, number>();
    const stockByProductWarehouse = new Map<number, Map<number, number>>();
    for (const s of stockRows) {
      if (!s.productId) continue;
      stockByProduct.set(s.productId, (stockByProduct.get(s.productId) ?? 0) + Math.max(0, s.quantity));
      if (!stockByProductWarehouse.has(s.productId)) stockByProductWarehouse.set(s.productId, new Map());
      const whMap = stockByProductWarehouse.get(s.productId)!;
      whMap.set(s.warehouseId, (whMap.get(s.warehouseId) ?? 0) + Math.max(0, s.quantity));
    }
    // منتجات بدون variants ومالهاش سجل في warehouse_stock — استخدم totalQuantity من المنتج نفسه
    for (const p of products) {
      if (!stockByProduct.has(p.id) && (variantsByProduct.get(p.id)?.length ?? 0) === 0) {
        stockByProduct.set(p.id, Math.max(0, p.totalQuantity));
      }
    }

    // ── تجميع حركات OUT (بيع/جزئي) لكل منتج في الفترة الحالية والسابقة — أساس السرعة ──
    function soldQtyOf(rows: typeof movements): Map<number, number> {
      const m = new Map<number, number>();
      for (const mv of rows) {
        if (!mv.productId) continue;
        if (mv.type === "OUT" && (mv.reason === "sale" || mv.reason === "partial_sale")) {
          m.set(mv.productId, (m.get(mv.productId) ?? 0) + mv.quantity);
        }
      }
      return m;
    }
    const soldInRange = soldQtyOf(movementsInRange);
    const soldInPrevRange = soldQtyOf(movementsInPrevRange);

    // ── تجميع حركات التالف (damaged) والمرتجع (return) لكل منتج في الفترة الحالية ──
    const damagedInRange = new Map<number, number>();
    const returnedInRange = new Map<number, number>();
    for (const mv of movementsInRange) {
      if (!mv.productId) continue;
      if (mv.type === "OUT" && mv.reason === "damaged") {
        damagedInRange.set(mv.productId, (damagedInRange.get(mv.productId) ?? 0) + mv.quantity);
      }
      if (mv.type === "IN" && mv.reason === "return") {
        returnedInRange.set(mv.productId, (returnedInRange.get(mv.productId) ?? 0) + mv.quantity);
      }
    }

    const rangeDays = Math.max(1, Math.round(rangeDurationMs / (1000 * 60 * 60 * 24)));

    // ── دالة تصنيف صحة منتج واحد (fast/medium/slow/stale/out) — نفس منطق stock-intelligence القديم لثبات الهوية ──
    type StockCategory = "out" | "fast" | "medium" | "slow" | "stale";
    function categorize(availableQty: number, hasHistory: boolean, daysUntilStockout: number | null): StockCategory {
      if (availableQty <= 0) return hasHistory ? "out" : "stale";
      if (daysUntilStockout !== null) {
        if (daysUntilStockout <= 7) return "fast";
        if (daysUntilStockout <= 30) return "medium";
        return "slow";
      }
      return "stale";
    }

    type ProductInsight = {
      productId: number; name: string; sku: string | null;
      availableQty: number; reservedQty: number; lowStockThreshold: number;
      costPrice: number; unitPrice: number;
      soldInRange: number; soldInPrevRange: number; velocityPerDay: number;
      daysUntilStockout: number | null; category: StockCategory;
      frozenCapital: number; potentialRevenue: number;
      damagedInRange: number; returnedInRange: number;
      trendPct: number | null; // تغيّر سرعة البيع مقابل الفترة السابقة
      warehouseSpread: number; // عدد المخازن اللي فيها كمية من المنتج
      variantsCount: number;
    };

    const insights: ProductInsight[] = products.map(p => {
      const hasVariants = (variantsByProduct.get(p.id)?.length ?? 0) > 0;
      const availableQty = stockByProduct.get(p.id) ?? 0;
      const sold = soldInRange.get(p.id) ?? 0;
      const soldPrev = soldInPrevRange.get(p.id) ?? 0;
      const velocity = sold / rangeDays;
      const hasHistory = sold > 0 || soldPrev > 0;
      let daysUntilStockout: number | null = null;
      if (availableQty <= 0) daysUntilStockout = 0;
      else if (velocity > 0) daysUntilStockout = Math.round(availableQty / velocity);
      const category = categorize(availableQty, hasHistory, daysUntilStockout);
      const trendPct = soldPrev > 0 ? Math.round(((sold - soldPrev) / soldPrev) * 1000) / 10 : (sold > 0 ? 100 : null);
      const whMap = stockByProductWarehouse.get(p.id);
      const warehouseSpread = whMap ? [...whMap.values()].filter(q => q > 0).length : 0;
      return {
        productId: p.id, name: p.name, sku: p.sku ?? null,
        availableQty, reservedQty: Math.max(0, p.reservedQuantity), lowStockThreshold: p.lowStockThreshold,
        costPrice: p.costPrice ?? 0, unitPrice: p.unitPrice,
        soldInRange: sold, soldInPrevRange: soldPrev, velocityPerDay: Math.round(velocity * 100) / 100,
        daysUntilStockout, category,
        frozenCapital: availableQty * (p.costPrice ?? 0), potentialRevenue: availableQty * p.unitPrice,
        damagedInRange: damagedInRange.get(p.id) ?? 0, returnedInRange: returnedInRange.get(p.id) ?? 0,
        trendPct, warehouseSpread, variantsCount: variantsByProduct.get(p.id)?.length ?? 0,
      };
    });

    // ── 1) KPIs عامة ──────────────────────────────────────────────────────────
    const totalProducts = insights.length;
    const totalUnitsInStock = insights.reduce((s, i) => s + i.availableQty, 0);
    const totalFrozenCapital = insights.filter(i => i.category === "slow" || i.category === "stale").reduce((s, i) => s + i.frozenCapital, 0);
    const totalPotentialRevenue = insights.reduce((s, i) => s + i.potentialRevenue, 0);
    const outOfStockCount = insights.filter(i => i.category === "out").length;
    const lowStockCount = insights.filter(i => i.availableQty > 0 && i.availableQty <= i.lowStockThreshold).length;
    const fastMoversCount = insights.filter(i => i.category === "fast").length;
    const slowMoversCount = insights.filter(i => i.category === "slow" || i.category === "stale").length;
    const totalDamagedInRange = insights.reduce((s, i) => s + i.damagedInRange, 0);
    const totalReturnedInRange = insights.reduce((s, i) => s + i.returnedInRange, 0);
    const totalSoldInRange = insights.reduce((s, i) => s + i.soldInRange, 0);

    // ── 2) الترتيب — الأسرع حركة أولاً (فرص) ثم الأبطأ (مخاطر) منفصلين ──────
    const categoryOrder: Record<StockCategory, number> = { fast: 0, medium: 1, slow: 2, stale: 3, out: 4 };
    const ranking = [...insights]
      .sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category] || b.velocityPerDay - a.velocityPerDay)
      .map(i => ({
        productId: i.productId, name: i.name, sku: i.sku,
        availableQty: i.availableQty, category: i.category,
        velocityPerDay: i.velocityPerDay, daysUntilStockout: i.daysUntilStockout,
        soldInRange: i.soldInRange, trendPct: i.trendPct,
      }));

    // ── 3) رأس المال المجمّد — أعلى المنتجات تجميدًا لرأس المال (بطيئة/راكدة وعندها مخزون) ──
    const frozenCapitalRanking = insights
      .filter(i => (i.category === "slow" || i.category === "stale") && i.availableQty > 0 && i.frozenCapital > 0)
      .sort((a, b) => b.frozenCapital - a.frozenCapital)
      .slice(0, 15)
      .map(i => ({
        productId: i.productId, name: i.name, availableQty: i.availableQty,
        costPrice: i.costPrice, frozenCapital: Math.round(i.frozenCapital),
        daysUntilStockout: i.daysUntilStockout, category: i.category,
      }));

    // ── 4) توزيع المخزون على المخازن ─────────────────────────────────────────
    const warehouseTotals = new Map<number, number>();
    for (const whMap of stockByProductWarehouse.values()) {
      for (const [whId, qty] of whMap.entries()) {
        warehouseTotals.set(whId, (warehouseTotals.get(whId) ?? 0) + qty);
      }
    }
    const totalStockAcrossWarehouses = [...warehouseTotals.values()].reduce((s, q) => s + q, 0);
    const warehouseDistribution = warehouses
      .map(w => {
        const qty = warehouseTotals.get(w.id) ?? 0;
        return {
          id: w.id, name: w.name, city: w.city ?? null,
          totalQty: qty,
          sharePct: totalStockAcrossWarehouses > 0 ? Math.round((qty / totalStockAcrossWarehouses) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.totalQty - a.totalQty);
    const topWarehouseSharePct = warehouseDistribution.length > 0 ? warehouseDistribution[0].sharePct : 0;
    const warehouseLoadStatus: "balanced" | "concentrated" | "critical" =
      topWarehouseSharePct >= 70 ? "critical" : topWarehouseSharePct >= 50 ? "concentrated" : "balanced";

    // ── 5) حركات المخزون حسب السبب في الفترة (توزيع IN/OUT) ────────────────
    const reasonLabels: Record<string, string> = {
      sale: "بيع", partial_sale: "بيع جزئي", return: "مرتجع", damaged: "تالف",
      manual_in: "إضافة يدوية", manual_out: "خصم يدوي", adjustment: "تسوية",
      to_shipping: "تحويل للشحن", from_shipping: "عودة من الشحن", transfer: "تحويل بين مخازن",
    };
    const movementsByReason = new Map<string, { in: number; out: number }>();
    for (const mv of movementsInRange) {
      if (!movementsByReason.has(mv.reason)) movementsByReason.set(mv.reason, { in: 0, out: 0 });
      const r = movementsByReason.get(mv.reason)!;
      if (mv.type === "IN") r.in += mv.quantity; else r.out += mv.quantity;
    }
    const movementsBreakdown = [...movementsByReason.entries()]
      .map(([reason, v]) => ({ reason, label: reasonLabels[reason] ?? reason, in: v.in, out: v.out, total: v.in + v.out }))
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);

    // ── 6) تنبيهات ذكية ───────────────────────────────────────────────────────
    type InventoryAlert = { type: string; severity: "critical" | "warning" | "info"; productId: number; productName: string; message: string };
    const alerts: InventoryAlert[] = [];
    for (const i of insights) {
      if (i.category === "out" && i.soldInRange > 0) {
        alerts.push({ type: "out_of_stock", severity: "critical", productId: i.productId, productName: i.name,
          message: `منتج "${i.name}" نفد من المخزون رغم وجود طلب فعلي عليه (${i.soldInRange} بيعة في الفترة)` });
      } else if (i.availableQty > 0 && i.availableQty <= i.lowStockThreshold) {
        alerts.push({ type: "low_stock", severity: "warning", productId: i.productId, productName: i.name,
          message: `مخزون "${i.name}" منخفض (${i.availableQty} قطعة) — أقل من أو يساوي حد الأمان (${i.lowStockThreshold})` });
      }
      if (i.daysUntilStockout !== null && i.daysUntilStockout > 0 && i.daysUntilStockout <= 5 && i.availableQty > 0) {
        alerts.push({ type: "stockout_soon", severity: "warning", productId: i.productId, productName: i.name,
          message: `منتج "${i.name}" هيخلص خلال ${i.daysUntilStockout} أيام بمعدل البيع الحالي` });
      }
      if ((i.category === "slow" || i.category === "stale") && i.frozenCapital >= 2000) {
        alerts.push({ type: "frozen_capital", severity: "info", productId: i.productId, productName: i.name,
          message: `منتج "${i.name}" مجمّد فيه ${Math.round(i.frozenCapital).toLocaleString("ar-EG")} ج.م رأس مال بدون حركة بيع كافية` });
      }
      if (i.trendPct !== null && i.trendPct <= -50 && i.soldInPrevRange >= 5) {
        alerts.push({ type: "declining_velocity", severity: "warning", productId: i.productId, productName: i.name,
          message: `سرعة بيع "${i.name}" تراجعت ${Math.abs(i.trendPct)}% عن الفترة السابقة` });
      }
      if (i.damagedInRange > 0 && i.damagedInRange >= Math.max(3, i.soldInRange * 0.15)) {
        alerts.push({ type: "high_damage_rate", severity: "critical", productId: i.productId, productName: i.name,
          message: `منتج "${i.name}" سجّل ${i.damagedInRange} قطعة تالفة في الفترة — نسبة مرتفعة مقارنة بالمبيعات` });
      }
    }
    if (warehouseLoadStatus === "critical") {
      const top = warehouseDistribution[0];
      alerts.push({ type: "warehouse_concentration", severity: "warning", productId: 0, productName: top?.name ?? "",
        message: `مخزن "${top?.name}" شايل ${top?.sharePct}% من إجمالي المخزون — اعتماد مركّز خطر` });
    }
    const invSeverityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => invSeverityOrder[a.severity] - invSeverityOrder[b.severity]);

    const periodLabels: Record<string, string> = { today: "اليوم", week: "آخر 7 أيام", month: "آخر 30 يوم", year: "السنة الحالية", custom: "فترة مخصصة" };
    const periodLabel = periodLabels[period] ?? "آخر 30 يوم";

    const result = {
      period, periodLabel,
      generatedAt: new Date().toISOString(),
      kpis: {
        totalProducts, totalUnitsInStock,
        totalFrozenCapital: Math.round(totalFrozenCapital),
        totalPotentialRevenue: Math.round(totalPotentialRevenue),
        outOfStockCount, lowStockCount, fastMoversCount, slowMoversCount,
        totalSoldInRange, totalDamagedInRange, totalReturnedInRange,
      },
      ranking,
      frozenCapitalRanking,
      warehouseDistribution: { warehouses: warehouseDistribution, topWarehouseSharePct, status: warehouseLoadStatus },
      movementsBreakdown,
      alerts,
    };

    setCached(cacheKey, result, 5 * 60 * 1000);
    res.json(result);
  } catch (err: any) {
    console.error("[inventory-intelligence] error:", err?.message ?? err);
    res.status(500).json({ error: "فشل تحليل المخزون الذكي", detail: err?.message ?? String(err) });
  }
});

export default router;
