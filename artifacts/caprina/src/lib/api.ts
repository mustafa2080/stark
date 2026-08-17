const BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("caprina_token");
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  const { headers: optHeaders, ...restOptions } = options ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...restOptions,
    headers: { "Content-Type": "application/json", ...authHeader, ...(optHeaders as Record<string, string> | undefined) },
  });
  if (res.status === 204) return undefined as unknown as T;
  if (res.status === 401) {
    // تشخيص مؤقت: نطبع الـ endpoint اللي رجّع 401 فعليًا عشان نمسك مصدر المشكلة
    console.warn(`[401] ${restOptions.method ?? "GET"} ${BASE}${path}`, { hadToken: !!token });
    // dispatch event — AuthContext هو المسؤول عن الـ logout وليس apiFetch مباشرة
    window.dispatchEvent(new CustomEvent("caprina:unauthorized", { detail: { path } }));
    throw new Error("غير مصرح");
  }
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`) as any;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// ─── Auth API ──────────────────────────────────────────────────────────────
export interface LoginResponse {
  token: string;
  user: {
    id: number; username: string; displayName: string;
    role: "admin" | "employee" | "warehouse";
    permissions: string[]; isActive: boolean;
    createdAt: string; updatedAt: string;
  };
}

export const authApi = {
  login: (username: string, password: string) =>
    apiFetch<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => apiFetch<LoginResponse["user"]>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  updateProfile: (data: { avatar?: string | null; displayName?: string }) =>
    apiFetch<LoginResponse["user"]>("/auth/update-profile", { method: "PATCH", body: JSON.stringify(data) }),
};

// ─── Users API ─────────────────────────────────────────────────────────────
export interface AppUser {
  id: number; username: string; displayName: string;
  role: "admin" | "employee" | "warehouse";
  permissions: string[]; isActive: boolean;
  jobTitle?: string | null;
  department?: string | null;
  avatar?: string | null;
  showProfileLink?: boolean;
  createdAt: string; updatedAt: string;
}

function parseUserPermissions(u: any): AppUser {
  const perms = u.permissions;
  return {
    ...u,
    permissions: Array.isArray(perms)
      ? perms
      : typeof perms === "string"
        ? (() => { try { return JSON.parse(perms); } catch { return []; } })()
        : [],
  };
}

export const usersApi = {
  list: () => apiFetch<AppUser[]>("/users").then(arr => arr.map(parseUserPermissions)),
  create: (data: { username: string; password: string; displayName: string; role: string; permissions?: string[] }) =>
    apiFetch<AppUser>("/users", { method: "POST", body: JSON.stringify(data) }).then(parseUserPermissions),
  update: (id: number, data: Partial<{ displayName: string; role: string; permissions: string[]; isActive: boolean; password: string }>) =>
    apiFetch<AppUser>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }).then(parseUserPermissions),
  delete: (id: number) => apiFetch<void>(`/users/${id}`, { method: "DELETE" }),
};

// ─── Audit Logs API ────────────────────────────────────────────────────────
export interface AuditLogEntry {
  id: number; action: string; entityType: string;
  entityId: number | null; entityName: string | null;
  changesBefore: Record<string, unknown> | null;
  changesAfter: Record<string, unknown> | null;
  userId: number | null; userName: string | null;
  createdAt: string;
}

export const auditApi = {
  list: (params?: { entityType?: string; action?: string; search?: string; limit?: number; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.entityType) q.set("entityType", params.entityType);
    if (params?.action) q.set("action", params.action);
    if (params?.search) q.set("search", params.search);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    return apiFetch<AuditLogEntry[]>(`/audit-logs?${q.toString()}`);
  },
};

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  totalQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  lowStockThreshold: number;
  unitPrice: number;
  costPrice: number | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: number;
  productId: number;
  productName?: string;
  color: string;
  colorHex?: string | null;
  size: string;
  sku: string | null;
  totalQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  lowStockThreshold: number;
  unitPrice: number;
  costPrice: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingCompany {
  id: number;
  name: string;
  phone: string | null;
  website: string | null;
  zoneId: number | null;
  zoneIds: string | number[] | null;
  shippingCost: string | number | null;
  costMode: "rep" | "zone" | null;
  zoneCostId: string | number | null;
  zoneCostIds: string | number[] | null;
  notes: string | null;
  logo: string | null;
  isActive: boolean;
  repUsername?: string;
  repPassword?: string;
  createdAt: string;
}

export interface ParsedImport {
  headers: string[];
  sample: any[][];
  totalRows: number;
  allRows: any[][];
}

export interface ColumnMapping {
  name: string;
  phone: string;
  city: string;
  address: string;
  product: string;
  color: string;
  size: string;
  quantity: string;
  price: string;
  notes: string;
  adSource: string;
  warehouseId: string;
  assignedUserId: string;
  shippingCost: string;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
  orders: any[];
}

export const productsApi = {
  list: () => apiFetch<Product[]>("/products"),
  create: (data: Partial<Product> & { name: string }) => apiFetch<Product>("/products", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Omit<Product, "totalQuantity">>) => apiFetch<Product>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => apiFetch<void>(`/products/${id}`, { method: "DELETE" }),
  addStock: (id: number, quantity: number, notes?: string | null) =>
    apiFetch<Product>(`/products/${id}/add-stock`, { method: "POST", body: JSON.stringify({ quantity, notes }) }),
};

export const variantsApi = {
  listAll: () => apiFetch<ProductVariant[]>("/variants"),
  listByProduct: (productId: number) => apiFetch<ProductVariant[]>(`/products/${productId}/variants`),
  create: (productId: number, data: { color: string; colorHex?: string | null; size: string; sku?: string; totalQuantity?: number; lowStockThreshold: number; unitPrice: number; costPrice?: number | null }) =>
    apiFetch<ProductVariant>(`/products/${productId}/variants`, { method: "POST", body: JSON.stringify(data) }),
  update: (productId: number, variantId: number, data: Partial<Omit<ProductVariant, "totalQuantity">>) =>
    apiFetch<ProductVariant>(`/products/${productId}/variants/${variantId}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (productId: number, variantId: number) =>
    apiFetch<void>(`/products/${productId}/variants/${variantId}`, { method: "DELETE" }),
  addStock: (productId: number, variantId: number, quantity: number, notes?: string | null) =>
    apiFetch<ProductVariant>(`/products/${productId}/variants/${variantId}/add-stock`, { method: "POST", body: JSON.stringify({ quantity, notes }) }),
};

export interface FinanceClientSearchResult {
  id: number;
  name: string;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  paymentTerms: string | null;
  totalOrders: number;
  totalSales: string | null;
}

export const financeClientsApi = {
  search: (q: string) =>
    apiFetch<FinanceClientSearchResult[]>(`/finance/clients/search?q=${encodeURIComponent(q)}`),
};

export const shippingApi = {
  list: () => apiFetch<ShippingCompany[]>("/shipping-companies"),
  create: (data: Partial<ShippingCompany>) => apiFetch<ShippingCompany>("/shipping-companies", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ShippingCompany>) => apiFetch<ShippingCompany>(`/shipping-companies/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => apiFetch<void>(`/shipping-companies/${id}`, { method: "DELETE" }),
};

const parseFile = async (file: File, endpoint: string): Promise<ParsedImport> => {
  // ── قراءة الملف محلياً بـ SheetJS لتجنب 413 من nginx ──────────────────────
  try {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!rows.length) throw new Error("الملف فارغ.");
    const headers = (rows[0] as any[]).map(h => String(h ?? "").trim());
    const dataRows = rows.slice(1).filter(r => (r as any[]).some(c => c !== "" && c != null));
    const sample = dataRows.slice(0, 5);
    return {
      headers,
      sample,
      allRows: dataRows,
      totalRows: dataRows.length,
    } as ParsedImport;
  } catch (localErr: any) {
    // fallback: ارفع الملف للسيرفر (للأنواع غير المدعومة)
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const res = await fetch(`${BASE}/${endpoint}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (res.status === 401) {
      localStorage.removeItem("caprina_token");
      localStorage.removeItem("caprina_user");
      window.location.href = "/login";
      throw new Error("غير مصرح");
    }
    if (res.status === 413) throw new Error("الملف كبير جداً. يرجى تقليل حجمه أو تقسيمه إلى أجزاء أصغر.");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
};

const executeImport = async (endpoint: string, payload: { headers: string[]; rows: any[][]; mapping: any }): Promise<ImportResult> => {
  const token = getToken();
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    localStorage.removeItem("caprina_token");
    localStorage.removeItem("caprina_user");
    window.location.href = "/login";
    throw new Error("غير مصرح");
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

export const importApi = {
  // Products
  parseProducts: (file: File) => parseFile(file, "products/import/parse"),
  executeProducts: (payload: { headers: string[]; rows: any[][]; mapping: any }) => executeImport("products/import/execute", payload),
  // Returns
  parseReturns: (file: File) => parseFile(file, "returns/import/parse"),
  executeReturns: (payload: { headers: string[]; rows: any[][]; mapping: any }) => executeImport("returns/import/execute", payload),
  // Shipments
  parseShipments: (file: File) => parseFile(file, "shipments/import/parse"),
  executeShipments: (payload: { headers: string[]; rows: any[][]; mapping: any }) => executeImport("shipments/import/execute", payload),
  // Client-portal: Shipments (نفس منطق الأدمن، بدون اسم راسل — العميل مقفول على نفسه)
  parseClientShipments: (file: File) => parseFile(file, "client-portal/shipments/import/parse"),
  executeClientShipments: (payload: { headers: string[]; rows: any[][]; mapping: any }) => executeImport("client-portal/shipments/import/execute", payload),
  // Inventory bulk update
  uploadInventory: async (file: File): Promise<{ updated: number; failed: number; errors: string[]; items: any[] }> => {
    const form = new FormData();
    form.append("file", file);
    const token = localStorage.getItem("caprina_token");
    const res = await fetch(`${BASE}/import/inventory`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
};

export interface OrderStats {
  today: { orders: number; revenue: number };
  week: { orders: number; revenue: number };
  month: { orders: number; revenue: number };
  bestProduct: { name: string; quantity: number } | null;
}

export interface PeriodProfit {
  orders: number;
  revenue: number;
  cost: number;
  shippingCost: number;
  netProfit: number;
  returnRate: number;
  returnCount: number;
}

export interface ProductProfit {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  orderCount: number;
  returnCount: number;
  returnRate: number;
  margin: number;
}

export interface ProfitAnalytics {
  today: PeriodProfit;
  week: PeriodProfit;
  month: PeriodProfit;
  allTime: PeriodProfit;
  topProducts: ProductProfit[];
  losingProducts: ProductProfit[];
  inventoryValue: {
    byProduct: number;
    byVariant: number;
    total: number;
    totalUnits: number;
    lowStock: any[];
  };
}

export interface FinancialSummary {
  cashIn: number;
  costOfGoods: number;
  shippingSpend: number;
  grossProfit: number;
  grossMargin: number;
  netProfit: number;
  netMargin: number;
  returnLoss: number;
  returnRevLost: number;
  returnDamagedValue: number;
  pendingRevenue: number;
  returnCount: number;
  returnRate: number;
  totalOrders: number;
  completedOrders: number;
  avgProfitPerOrder: number;
  avgOrderValue: number;
  avgCostPerOrder: number;
  inventoryAtCost: number;
  inventoryAtSell: number;
  potentialInventoryProfit: number;
}

export interface ManifestsPnlSummary {
  totalRevenue: number;   // إجمالي الإيرادات المُحصّلة قبل خصم المصاريف
  totalExpenses: number;  // كل مصاريف التشغيل، مع استبعاد حسابات العملاء
  netRevenue: number;     // صافي الإيراد المستحق = سعر الشحن - تكلفة المندوب
  orders: number;         // عدد الشحنات المؤهلة (مسلَّم/مسلَّم جزئي/مرتجع بأسباب مالية)
  returnCount: number;    // عدد المرتجعات بالأسباب المالية
  returnRate: number;     // نسبة المرتجع %
}

export interface ProductPerformance {
  name: string;
  productId: number | null;
  image: string | null;
  totalOrders: number;
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
}

export interface ProductPerformanceResponse {
  products: ProductPerformance[];
  byProfit: ProductPerformance[];
  byLoss: ProductPerformance[];
  byReturns: ProductPerformance[];
  summary: {
    totalProducts: number;
    profitableCount: number;
    losingCount: number;
    highReturnCount: number;
    totalNetProfit: number;
    totalRevenue: number;
  };
}

export type AlertType = "HIGH_RETURN" | "LOSING_PRODUCT" | "LOW_STOCK" | "LOW_MARGIN" | "STALE_STOCK" | "NO_COST_DATA";
export type AlertSeverity = "high" | "medium" | "low";

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  productName?: string;
  value?: number;
}

export interface AlertsResponse {
  alerts: Alert[];
  counts: { total: number; high: number; medium: number; low: number };
}

export type StockCategory = "out" | "fast" | "medium" | "slow" | "stale";

export interface StockIntelligenceItem {
  name: string;
  productId: number | null;
  availableQty: number;
  reservedQty: number;
  soldQty: number;
  costPrice: number;
  unitPrice: number;
  last30DaysSales: number;
  velocityPerDay: number;
  daysUntilStockout: number | null;
  category: StockCategory;
  frozenCapital: number;
  potentialRevenue: number;
  badge?: "fast" | "slow" | string;
}

// ── تحليل المخزون الذكي (صفحة مستقلة) ─────────────────────────────────────────
export interface InvIntelRankingRow {
  productId: number;
  name: string;
  sku: string | null;
  availableQty: number;
  category: "out" | "fast" | "medium" | "slow" | "stale";
  velocityPerDay: number;
  daysUntilStockout: number | null;
  soldInRange: number;
  trendPct: number | null;
}
export interface InvIntelFrozenCapitalRow {
  productId: number;
  name: string;
  availableQty: number;
  costPrice: number;
  frozenCapital: number;
  daysUntilStockout: number | null;
  category: "out" | "fast" | "medium" | "slow" | "stale";
}
export interface InvIntelWarehouseRow {
  id: number;
  name: string;
  city: string | null;
  totalQty: number;
  sharePct: number;
}
export interface InvIntelMovementReasonRow {
  reason: string;
  label: string;
  in: number;
  out: number;
  total: number;
}
export interface InvIntelAlert {
  type: string;
  severity: "critical" | "warning" | "info";
  productId: number;
  productName: string;
  message: string;
}
export interface InventoryIntelligenceResponse {
  period: string;
  periodLabel: string;
  generatedAt: string;
  kpis: {
    totalProducts: number;
    totalUnitsInStock: number;
    totalFrozenCapital: number;
    totalPotentialRevenue: number;
    outOfStockCount: number;
    lowStockCount: number;
    fastMoversCount: number;
    slowMoversCount: number;
    totalSoldInRange: number;
    totalDamagedInRange: number;
    totalReturnedInRange: number;
  };
  ranking: InvIntelRankingRow[];
  frozenCapitalRanking: InvIntelFrozenCapitalRow[];
  warehouseDistribution: {
    warehouses: InvIntelWarehouseRow[];
    topWarehouseSharePct: number;
    status: "balanced" | "concentrated" | "critical";
  };
  movementsBreakdown: InvIntelMovementReasonRow[];
  alerts: InvIntelAlert[];
}

export interface StockIntelligenceResponse {
  items: StockIntelligenceItem[];
  summary: {
    totalProducts: number;
    fastMovers: number;
    slowMovers: number;
    outOfStock: number;
    totalFrozenCapital: number;
  };
}

// ─── Smart Insights Types ────────────────────────────────────────────────────
export interface AdSourceStat {
  source: string;
  orders: number;
  revenue: number;
  profit: number;
  returnRate: number;
  roi: number;
}

export interface SmartProduct {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  orderCount: number;
  returnCount: number;
  returnRate: number;
  margin: number;
  image?: string | null;
}

export interface DeadStockItem {
  name: string;
  availableQty: number;
  frozenCapital: number;
  last30DaysSales: number;
  daysSinceLastSale: number | null;
  image?: string | null;
}

export interface ReturnReasonItem {
  reason: string;
  label: string;
  count: number;
  pct: number;
}

export interface HighReturnProduct {
  name: string;
  returnRate: number;
  returnCount: number;
  orderCount: number;
}

export interface StockPredictorItem {
  name: string;
  availableQty: number;
  velocityPerDay: number;
  daysUntilStockout: number | null;
  frozenCapital: number;
}

export interface SmartInsights {
  adAttribution: {
    bestSource: AdSourceStat | null;
    breakdown: AdSourceStat[];
  };
  stars: SmartProduct[];
  deadStock: DeadStockItem[];
  returnInsights: {
    byReason: ReturnReasonItem[];
    highReturnProducts: HighReturnProduct[];
    totalReturnRate: number;
    totalReturns: number;
  };
  stockPredictor: StockPredictorItem[];
}

export interface ChartStatusItem { status: string; count: number; pct: number; }
export interface ChartDayItem { date: string; label: string; orders: number; revenue: number; }
export interface ChartSourceItem { source: string; count: number; pct: number; }
export interface WeekComparison {
  thisWeek: { orders: number; revenue: number };
  prevWeek: { orders: number; revenue: number };
  ordersChange: number | null;
  revenueChange: number | null;
  prevWeekDays: ChartDayItem[];
}
export interface ChartsData {
  statusBreakdown: ChartStatusItem[];
  weeklySales: ChartDayItem[];
  monthlySales: ChartDayItem[];
  adSourceBreakdown: ChartSourceItem[];
  total: number;
  weekComparison: WeekComparison;
}

export interface ShipmentDayItem { date: string; label: string; count: number; codAmount: number; }
export interface ShipmentChartsData {
  weeklyShipments: ShipmentDayItem[];
  monthlyShipments: ShipmentDayItem[];
  weekComparison: {
    thisWeek: { count: number; codAmount: number };
    prevWeek: { count: number; codAmount: number; days: ShipmentDayItem[] };
    countChange: number | null;
    codChange: number | null;
  };
  statusBreakdownThisWeek: { status: string; count: number }[];
}

export interface ShipmentChartsRangeResponse {
  granularity: "day" | "week" | "month";
  from: string;
  to: string;
  points: ShipmentDayItem[];
  total: { count: number; codAmount: number };
}

export interface OperationsKpiCard {
  key: string;
  label: string;
  value: number;
  change: number;
  sparkline: number[];
}
export interface OperationsKpisResponse {
  cards: OperationsKpiCard[];
  generatedAt: string;
}

export interface StatusDistributionItem {
  status: string;
  label: string;
  color: string;
  value: number;
}
export interface StatusDistributionResponse {
  distribution: StatusDistributionItem[];
  total: number;
  generatedAt: string;
}

export interface PerformanceMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  max: number | null;
  change: number;
  ratingsCount?: number;
}
export interface PerformanceMetricsResponse {
  metrics: PerformanceMetric[];
  generatedAt: string;
}

export interface CityActivityItem {
  city: string;
  total: number;
  inTransit: number;
  delivered: number;
  delayed: number;
  problem: number;
}
export interface CityActivityResponse {
  cities: CityActivityItem[];
  totalActiveCities: number;
  generatedAt: string;
}

export interface OpsAlert {
  id: string;
  type: "warning" | "info" | "critical" | "opportunity";
  title: string;
  detail: string;
}
export interface OpsAlertsResponse {
  sidebar: {
    delayedShipments: number;
    problemShipments: number;
    outToday: number;
    activeRepresentatives: number;
    totalRepresentatives: number;
    clientsNeedingFollowup: number;
  };
  alerts: OpsAlert[];
  generatedAt: string;
}

// ─── مركز العمليات (تفصيلي) ──────────────────────────────────────────────────
export interface OpsDelayedShipment {
  id: number;
  trackingNumber: string | null;
  receiverName: string;
  receiverPhone: string | null;
  receiverCity: string | null;
  senderName: string;
  delayedHours: number;
  totalAmount: string | null;
}
export interface OpsProblemShipment {
  id: number;
  trackingNumber: string | null;
  receiverName: string;
  receiverPhone: string | null;
  receiverCity: string | null;
  senderName: string;
  totalAmount: string | null;
}
export interface OpsOutTodayShipment {
  id: number;
  trackingNumber: string | null;
  receiverName: string;
  receiverCity: string | null;
  status: string;
  assignedUserId: number | null;
  totalAmount: string | null;
}
export interface OpsRepresentative {
  id: number;
  displayName: string;
  isOnline: boolean;
  onlineSince: string | null;
  totalShipments: number;
  deliveredShipments: number;
  activeShipments: number;
  successRate: number;
}
export interface OpsClientFollowup {
  clientName: string;
  issueCount: number;
  lastIssueAt: string;
  shipmentIds: number[];
}
export interface OperationsCenterResponse {
  summary: {
    delayedCount: number;
    problemCount: number;
    outTodayCount: number;
    onlineRepsCount: number;
    totalRepsCount: number;
    followupCount: number;
  };
  delayedShipments: OpsDelayedShipment[];
  problemShipments: OpsProblemShipment[];
  outToday: OpsOutTodayShipment[];
  representatives: OpsRepresentative[];
  clientsNeedingFollowup: OpsClientFollowup[];
  generatedAt: string;
}

// ─── الخريطة المباشرة (موسّعة) ────────────────────────────────────────────────
export interface LiveMapCity {
  city: string;
  total: number;
  inTransit: number;
  delivered: number;
  delayed: number;
  problem: number;
  delayRate: number;
  heatScore: number;
  representatives: string[];
  representativesCount: number;
  shipments: { id: number; shipmentNumber: string | null; receiverName: string | null; status: string }[];
}
export interface LiveMapResponse {
  cities: LiveMapCity[];
  totalActiveCities: number;
  totalActiveShipments: number;
  totalOnlineReps: number;
  busiestCity: { city: string; total: number } | null;
  mostDelayedCity: { city: string; delayRate: number } | null;
  generatedAt: string;
}

// ─── لوحة الأرباح (Financial Dashboard) ───────────────────────────────────────
export interface FinancialDashboardPeriod {
  orders: number;
  revenue: number;
  cost: number;
  shippingSpend: number;
  otherExpenses: number;
  operatingCost: number;
  netProfit: number;
}
export interface FinancialDashboardRepCost {
  repId: number;
  repName: string;
  orders: number;
  revenue: number;
  cost: number;
  shippingSpend: number;
  operatingCost: number;
  netProfit: number;
}
export interface FinancialDashboardZoneCost {
  city: string;
  orders: number;
  revenue: number;
  operatingCost: number;
  netProfit: number;
}
export interface FinancialDashboardClient {
  name: string;
  orders: number;
  revenue: number;
  netProfit: number;
}
export interface FinancialDashboardResponse {
  today: FinancialDashboardPeriod;
  month: FinancialDashboardPeriod;
  last30Days: FinancialDashboardPeriod;
  repCosts: FinancialDashboardRepCost[];
  zoneCosts: FinancialDashboardZoneCost[];
  topClients: FinancialDashboardClient[];
  bottomClients: FinancialDashboardClient[];
  generatedAt: string;
}

export interface ShipmentsProfitPeriod {
  orders: number;
  revenue: number;
  cost: number;
  shippingSpend: number;
  otherExpenses: number;
  netProfit: number;
  returnRate: number;
  returnCount: number;
}
export interface ShipmentsProfitTrendDay {
  date: string;
  revenue: number;
  profit: number;
}
export interface ShipmentsProfitResponse {
  today: ShipmentsProfitPeriod;
  week: ShipmentsProfitPeriod;
  month: ShipmentsProfitPeriod;
  dailyTrend: ShipmentsProfitTrendDay[];
  generatedAt: string;
}

export interface TopClient {
  clientId: number;
  name: string;
  phone: string | null;
  avatar: string | null;
  clientType: string;
  shipmentsCount: number;
  revenue: number;
  successRate: number;
}
export interface TopRep {
  userId: number;
  name: string;
  avatar: string | null;
  assigned: number;
  delivered: number;
  successRate: number;
  avgRating: number;
  ratingsCount: number;
}
export interface TopPerformersResponse {
  topClients: TopClient[];
  topReps: TopRep[];
  period: string;
  periodLabel: string;
  generatedAt: string;
}

export interface RecentEvent {
  id: number;
  shipmentNumber: string;
  receiverName: string;
  type: "delayed" | "returned" | "partial" | "other";
  label: string;
  updatedAt: string;
}
export interface RecentEventsResponse {
  events: RecentEvent[];
  generatedAt: string;
}

export interface RecentShipmentRow {
  id: number;
  trackingNumber: string;
  clientName: string;
  status: string;
  statusColor: string;
  amount: number;
}
export interface RecentShipmentsResponse {
  shipments: RecentShipmentRow[];
  generatedAt: string;
}

export interface ExecutiveSummaryResponse {
  revenue: number;
  profit: number;
  growthRate: number;
  clientsCount: number;
  shipmentsCount: number;
  successRate: number;
  topArea: string;
  nextMonthForecast: number;
  generatedAt: string;
}

export interface RevenueTrendDay {
  day: string;
  date: string;
  revenue: number;
  profit: number;
}
export interface RevenueTrendResponse {
  days: RevenueTrendDay[];
  generatedAt: string;
}

export interface RepDailyRow {
  id: number;
  displayName: string;
  totalShipments: number;
  deliveredShipments: number;
  successRate: number;
}
export interface RepsDailyResponse {
  period: "today" | "week" | "custom";
  representatives: RepDailyRow[];
  generatedAt: string;
}

export interface ShipmentsIntelligenceResponse {
  period: string;
  rangeFrom: string;
  rangeTo: string;
  healthScore: number;
  healthGrade: "excellent" | "good" | "warning" | "critical";
  healthScoreBreakdown: { key: string; label: string; value: number; weight: number; points: number; unit: string; invert?: boolean }[];
  kpis: {
    total: number;
    delivered: number;
    returned: number;
    deliveryRate: number;
    returnRate: number;
    onTimeRate: number;
    avgDeliveryHours: number;
  };
  // مقارنة فترات: نفس الـ KPIs بالظبط للفترة السابقة (نفس المدة، فورًا قبل الفترة الحالية)
  previousPeriod: {
    hasPreviousPeriod: boolean;
    rangeFrom: string;
    rangeTo: string;
    kpis: {
      total: number;
      delivered: number;
      returned: number;
      deliveryRate: number;
      returnRate: number;
      onTimeRate: number;
      avgDeliveryHours: number;
    };
  };
  // نسبة/فرق التغيّر لكل KPI مقارنة بالفترة السابقة — null لو مفيش فترة سابقة للمقارنة
  kpiTrends: {
    total: number | null;
    delivered: number | null;
    returned: number | null;
    deliveryRate: number | null;
    returnRate: number | null;
    onTimeRate: number | null;
    avgDeliveryHours: number | null;
  };
  statusDistribution: { status: string; label: string; color: string; value: number; pct: number }[];
  cityPerformance: { city: string; total: number; delivered: number; returned: number; codValue: number; successRate: number; returnRate: number }[];
  companyPerformance: { companyId: number | null; companyName: string; total: number; delivered: number; returned: number; successRate: number; returnRate: number; avgDeliveryHours: number; totalFees: number }[];
  weightAnalysis: { key: string; label: string; total: number; delivered: number; returned: number; successRate: number; returnRate: number }[];
  piecesAnalysis: { key: string; label: string; total: number; delivered: number; returned: number; successRate: number; returnRate: number }[];
  routeAnalysis: { from: string; to: string; total: number; delivered: number; returned: number; successRate: number; returnRate: number; avgDeliveryHours: number }[];
  // تنبيه SLA حقيقي: فرق فعلي بالساعات بين الموعد المتوقع والتسليم الفعلي (أو الوقت الحالي لو لسه ماشية)
  slaAnalysis: {
    totalBreaches: number;
    ongoingBreaches: number; // متأخرة دلوقتي فعليًا (مش اتسلمت لسه) — تحتاج متابعة فورية
    avgDelayHours: number;
    worstBreaches: {
      id: number; shipmentNumber: string | null; receiverName: string;
      receiverCity: string; status: string;
      estimatedDelivery: string; actualDelivery: string | null;
      delayHours: number; isOngoing: boolean;
    }[];
  };
  agingAnalysis: { key: string; label: string; count: number }[];
  returnReasons: { reason: string; label: string; count: number; pct: number }[];
  financialPulse: {
    codExpected: number;
    codCollected: number;
    collectionRate: number;
    shippingFeesTotal: number;
    paymentMix: { cod: number; prepaid: number; deferred: number };
  };
  repPerformance: { userId: number; name: string; total: number; delivered: number; returned: number; successRate: number }[];
  trend: { date: string; total: number; delivered: number; returned: number }[];
  alerts: { level: "critical" | "warning" | "info"; message: string }[];
  generatedAt: string;
}

export interface ShipmentsMonthlyGoalResponse {
  month: string;
  target: number | null;
}

// ── التحليل الذكي لمناديب الشحن ──────────────────────────────────────────────
export interface RepRankingRow {
  rank: number;
  id: number;
  name: string;
  logo: string | null;
  rankingScore: number;
  trend: { direction: "up" | "down" | "flat" | "new"; delta: number | null };
  total: number;
  delivered: number;
  returned: number;
  deliveryRate: number;
  returnRate: number;
  onTimeRate: number;
  avgDeliveryHours: number;
}
export interface RepCostVsPerformanceRow {
  id: number;
  name: string;
  shippingCost: number;
  costPerDelivery: number | null;
  deliveryRate: number;
  avgDeliveryHours: number;
  rankingScore: number;
  total: number;
  quadrant: "best_value" | "premium" | "budget_risk" | "underperformer";
}
export interface RepCodAnalysisRow {
  id: number;
  name: string;
  codExpected: number;
  codCollected: number;
  collectionRate: number;
  shippingFeesTotal: number;
}
export interface RepLoadBalanceRow {
  id: number;
  name: string;
  total: number;
  loadSharePct: number;
}
export interface RepAlert {
  type: string;
  severity: "critical" | "warning" | "info";
  repId: number;
  repName: string;
  message: string;
}
export interface RepresentativesIntelligenceResponse {
  period: string;
  periodLabel: string;
  generatedAt: string;
  repsCount: number;
  activeRepsCount: number;
  totalShipmentsInRange: number;
  ranking: RepRankingRow[];
  costVsPerformance: RepCostVsPerformanceRow[];
  codAnalysis: RepCodAnalysisRow[];
  loadBalance: {
    reps: RepLoadBalanceRow[];
    topRepLoadSharePct: number;
    status: "balanced" | "concentrated" | "critical";
  };
  alerts: RepAlert[];
}

// ── تحليل المناطق الذكي ───────────────────────────────────────────────────────
export interface ZoneRankingRow {
  rank: number;
  id: number;
  name: string;
  fromGovernorate: string | null;
  toGovernorate: string | null;
  zoneScore: number;
  trend: { direction: "up" | "down" | "flat" | "new"; delta: number | null };
  total: number;
  delivered: number;
  returned: number;
  deliveryRate: number;
  returnRate: number;
  onTimeRate: number;
  avgDeliveryHours: number;
}
export interface ZoneProfitabilityRow {
  id: number;
  name: string;
  deliveryCost: number;
  avgRevenuePerShipment: number | null;
  marginPerShipment: number | null;
  marginPct: number | null;
  totalMargin: number | null;
  zoneScore: number;
  total: number;
  quadrant: "star_zone" | "underpriced" | "risky_margin" | "review_needed";
}
export interface ZoneCodAnalysisRow {
  id: number;
  name: string;
  codExpected: number;
  codCollected: number;
  collectionRate: number;
}
export interface ZoneLoadBalanceRow {
  id: number;
  name: string;
  total: number;
  loadSharePct: number;
}
export interface ZoneGovernoratePerformanceRow {
  governorate: string;
  total: number;
  delivered: number;
  returned: number;
  deliveryRate: number;
  returnRate: number;
}
export interface ZoneAlert {
  type: string;
  severity: "critical" | "warning" | "info";
  zoneId: number;
  zoneName: string;
  message: string;
}
export interface ZonesIntelligenceResponse {
  period: string;
  periodLabel: string;
  generatedAt: string;
  zonesCount: number;
  activeZonesCount: number;
  totalShipmentsInRange: number;
  ranking: ZoneRankingRow[];
  profitability: ZoneProfitabilityRow[];
  codAnalysis: ZoneCodAnalysisRow[];
  loadBalance: {
    zones: ZoneLoadBalanceRow[];
    topZoneLoadSharePct: number;
    status: "balanced" | "concentrated" | "critical";
  };
  governoratePerformance: ZoneGovernoratePerformanceRow[];
  alerts: ZoneAlert[];
}

export const analyticsApi = {
  profit: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<ProfitAnalytics>(`/analytics/profit${qs ? `?${qs}` : ""}`);
  },
  financialSummary: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<FinancialSummary>(`/analytics/financial-summary${qs ? `?${qs}` : ""}`);
  },
  manifestsPnlSummary: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<ManifestsPnlSummary>(`/analytics/manifests-pnl-summary${qs ? `?${qs}` : ""}`);
  },
  productPerformance: () => apiFetch<ProductPerformanceResponse>("/analytics/product-performance"),
  alerts: () => apiFetch<AlertsResponse>("/analytics/alerts"),
  stockIntelligence: () => apiFetch<StockIntelligenceResponse>("/analytics/stock-intelligence"),
  smartInsights: () => apiFetch<SmartInsights>("/analytics/smart-insights"),
  shippingFollowup: () => apiFetch<any[]>("/analytics/shipping-followup"),
  shipmentsIntelligence: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<ShipmentsIntelligenceResponse>(`/analytics/shipments-intelligence${qs ? `?${qs}` : ""}`);
  },
  shipmentsMonthlyGoal: (month?: string) =>
    apiFetch<ShipmentsMonthlyGoalResponse>(`/analytics/shipments-monthly-goal${month ? `?month=${month}` : ""}`),
  setShipmentsMonthlyGoal: (body: { month?: string; target: number }) =>
    apiFetch<ShipmentsMonthlyGoalResponse>("/analytics/shipments-monthly-goal", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  representativesIntelligence: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<RepresentativesIntelligenceResponse>(`/analytics/representatives-intelligence${qs ? `?${qs}` : ""}`);
  },
  zonesIntelligence: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<ZonesIntelligenceResponse>(`/analytics/zones-intelligence${qs ? `?${qs}` : ""}`);
  },
  inventoryIntelligence: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<InventoryIntelligenceResponse>(`/analytics/inventory-intelligence${qs ? `?${qs}` : ""}`);
  },
  charts: () => apiFetch<ChartsData>("/analytics/charts"),
  monthlySales: (month?: string) =>
    apiFetch<{ month: string; days: ChartDayItem[]; totalOrders: number; totalRevenue: number; daysCount: number; avgPerDay: string }>(
      `/analytics/monthly-sales${month ? `?month=${month}` : ""}`
    ),
  shipmentCharts: () => apiFetch<ShipmentChartsData>("/analytics/shipment-charts"),
  shipmentChartsRange: (params: { period?: "lastYear" | "custom"; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params.period) q.set("period", params.period);
    if (params.from)   q.set("from", params.from);
    if (params.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<ShipmentChartsRangeResponse>(`/analytics/shipment-charts-range${qs ? `?${qs}` : ""}`);
  },
  operationsKpis: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<OperationsKpisResponse>(`/analytics/operations-kpis${qs ? `?${qs}` : ""}`);
  },
  statusDistribution: () => apiFetch<StatusDistributionResponse>("/analytics/status-distribution"),
  performanceMetrics: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<PerformanceMetricsResponse>(`/analytics/performance-metrics${qs ? `?${qs}` : ""}`);
  },
  cityActivity: () => apiFetch<CityActivityResponse>("/analytics/city-activity"),
  opsAlerts: () => apiFetch<OpsAlertsResponse>("/analytics/ops-alerts"),
  operationsCenter: () => apiFetch<OperationsCenterResponse>("/analytics/operations-center"),
  liveMap: () => apiFetch<LiveMapResponse>("/analytics/live-map"),
  financialDashboard: () => apiFetch<FinancialDashboardResponse>("/analytics/financial-dashboard"),
  shipmentsProfit: () => apiFetch<ShipmentsProfitResponse>("/analytics/shipments-profit"),
  topPerformers: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<TopPerformersResponse>(`/analytics/top-performers${qs ? `?${qs}` : ""}`);
  },
  recentEvents: () => apiFetch<RecentEventsResponse>("/analytics/recent-events"),
  recentShipments: () => apiFetch<RecentShipmentsResponse>("/analytics/recent-shipments"),
  executiveSummary: () => apiFetch<ExecutiveSummaryResponse>("/analytics/executive-summary"),
  revenueTrend: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from)   q.set("from", params.from);
    if (params?.to)     q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<RevenueTrendResponse>(`/analytics/revenue-trend${qs ? `?${qs}` : ""}`);
  },
  repsDaily: (params: { period: "today" | "week" } | { period: "custom"; from: string; to: string }) => {
    const q = new URLSearchParams();
    q.set("period", params.period);
    if (params.period === "custom") { q.set("from", params.from); q.set("to", params.to); }
    return apiFetch<RepsDailyResponse>(`/analytics/reps-daily?${q.toString()}`);
  },
};

export interface BatchCreateOrderBody {
  invoiceNumber?: string | null;
  customerName: string;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  shippingCost?: number | null;
  shippingCompanyId?: number | null;
  warehouseId?: number | null;
  assignedUserId?: number | null;
  adSource?: string | null;
  adCampaign?: string | null;
  notes?: string | null;
  items: {
    product: string;
    color?: string | null;
    size?: string | null;
    quantity: number;
    unitPrice: number;
    costPrice?: number | null;
    productId?: number | null;
    variantId?: number | null;
  }[];
}

export interface BatchCreateOrderResponse {
  invoiceNumber: string;
  orders: any[];
}

export interface OrdersFilterParams {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  shippingCompanyId?: string;
  city?: string;
  product?: string;
  amountMin?: string;
  amountMax?: string;
}

export const ordersApi = {
  stats: () => apiFetch<OrderStats>("/orders/stats"),
  delete: (id: number) => apiFetch<void>(`/orders/${id}`, { method: "DELETE" }),
  archived: () => apiFetch<any[]>("/orders/archived"),
  restore: (id: number) => apiFetch<any>(`/orders/${id}/restore`, { method: "POST" }),
  inManifestIds: () => apiFetch<{ ids: number[] }>("/orders/in-manifest-ids"),
  byInvoice: (invoiceNumber: string) =>
    apiFetch<any[]>(`/orders/by-invoice/${encodeURIComponent(invoiceNumber)}`),
  batchCreate: (data: BatchCreateOrderBody) =>
    apiFetch<BatchCreateOrderResponse>("/orders/batch", { method: "POST", body: JSON.stringify(data) }),
  list: (filters?: OrdersFilterParams) => {
    const q = new URLSearchParams();
    if (filters?.search) q.set("search", filters.search);
    if (filters?.status && filters.status !== "all") q.set("status", filters.status);
    if (filters?.dateFrom) q.set("dateFrom", filters.dateFrom);
    if (filters?.dateTo) q.set("dateTo", filters.dateTo);
    if (filters?.shippingCompanyId && filters.shippingCompanyId !== "all") q.set("shippingCompanyId", filters.shippingCompanyId);
    const qs = q.toString();
    return apiFetch<any[]>(`/orders${qs ? `?${qs}` : ""}`);
  },
  getMyOrders: (userId: number, month?: string) => {
    const q = new URLSearchParams();
    q.set("createdByUserId", String(userId));
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const dateFrom = new Date(y, m - 1, 1);
      const dateTo = new Date(y, m, 0);
      q.set("dateFrom", dateFrom.toISOString().split("T")[0]);
      q.set("dateTo", dateTo.toISOString().split("T")[0]);
    }
    return apiFetch<any[]>(`/orders?${q.toString()}`);
  },
};

export type MovementType = "IN" | "OUT";
export type MovementReason = "sale" | "partial_sale" | "return" | "damaged" | "manual_in" | "manual_out" | "adjustment" | "to_shipping" | "from_shipping" | "transfer";

export interface InventoryMovement {
  id: number;
  productId: number | null;
  variantId: number | null;
  warehouseId: number | null;
  warehouseName: string | null;
  product: string;
  color: string | null;
  size: string | null;
  quantity: number;
  type: MovementType;
  reason: MovementReason;
  orderId: number | null;
  shipmentId: number | null;
  shipmentNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MovementFilters {
  type?: MovementType;
  reason?: MovementReason;
  productId?: number;
  warehouseId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface MovementTotals {
  totalIn: number;
  totalOut: number;
  balance: number;
  currentStock: number | null; // الرصيد الفعلي من المخزون — بيظهر لما يكون في فلتر على منتج
}

// ─── Shipping Manifests API ─────────────────────────────────────────────────
export type DeliveryStatus = "pending" | "delivered" | "postponed" | "partial_received" | "returned" | "delayed" | "partial_delivered";

export interface ShippingManifestListItem {
  id: number;
  manifestNumber: string;
  shippingCompanyId: number;
  companyName: string;
  status: "open" | "closed";
  notes: string | null;
  invoicePrice: number | null;
  invoiceNotes: string | null;
  orderCount: number;
  postponedCount: number;
  returnedCount: number;
  pendingCount: number;
  createdAt: string;
  closedAt: string | null;
}

export interface ManifestStats {
  total: number;
  delivered: number;
  returned: number;
  pending: number;
  postponed: number;
  deliveryRate: number;
  totalRevenue: number;
  totalCost: number;
  totalShippingCost: number;
  returnLosses: number;
  netProfit: number;
  deliveredGross: number;
}

export interface ManifestCompanyStats extends ManifestStats {
  manifestCount: number;
  realNetRevenue?: number;
}

export interface Order {
  id: number;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string | null;
  city: string | null;
  product: string | null;
  quantity: number | null;
  total: number;
  cost: number | null;
  shippingCost: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  assignedUserId: number | null;
  createdByUserId: number | null;
  shippingCompanyId: number | null;
}

export interface ManifestOrder extends Order {
  deliveryStatus: DeliveryStatus;
  deliveryNote: string | null;
  deliveredAt: string | null;
  manifestOrderId: number;
  returnReceived: 0 | 1 | null;
  addedAt: string | null;
  // ── حقول إضافية تُستخدم عند تعبئة الـ ManifestOrder من بيان حساب عميل (client-account-manifest) ──
  shipmentId?: number;
  phone?: string | null;
  address?: string | null;
  senderName?: string | null;
  totalPrice?: number;
  unitPrice?: number;
  partialQuantity?: number | null;
  returnReason?: string | null;
  returnValueReceived?: number | null;
  color?: string | null;
  size?: string | null;
  representativeName?: string | null;
  warehouseName?: string | null;
  zonePrice?: number | null;
}

export interface ShippingManifestDetail extends ShippingManifestListItem {
  companyPhone: string | null;
  companyLogo: string | null;
  orders: ManifestOrder[];
  stats: ManifestStats;
  invoiceNotes?: string | null;
  manualShippingCost: number | null;
}

export interface ManifestCloseResponse extends ShippingManifestListItem {
  rolledOverManifest: { id: number; manifestNumber: string; orderCount: number } | null;
}

export const manifestsApi = {
  list: (companyId?: number) =>
    apiFetch<ShippingManifestListItem[]>(`/shipping-manifests${companyId ? `?companyId=${companyId}` : ""}`),
  get: (id: number) =>
    apiFetch<ShippingManifestDetail>(`/shipping-manifests/${id}`),
  create: (data: { shippingCompanyId: number; orderIds: number[]; notes?: string }) =>
    apiFetch<ShippingManifestListItem>("/shipping-manifests", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { status?: "open" | "closed"; notes?: string; invoicePrice?: number | null; invoiceNotes?: string | null; manualShippingCost?: number | null }) =>
    apiFetch<ManifestCloseResponse>(`/shipping-manifests/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  updateOrderDelivery: (
    manifestId: number,
    orderId: number,
    data: { deliveryStatus: DeliveryStatus; deliveryNote?: string | null; partialQuantity?: number | null; returnReceived?: boolean | null; partialReturnReceived?: boolean | null }
  ) =>
    apiFetch<{ success: boolean; deliveryStatus: DeliveryStatus; deliveryNote: string | null }>(
      `/shipping-manifests/${manifestId}/orders/${orderId}`,
      { method: "PATCH", body: JSON.stringify(data) }
    ),
  cancelOrder: (manifestId: number, orderId: number) =>
    apiFetch<{ success: boolean; orderId: number; message: string }>(
      `/shipping-manifests/${manifestId}/orders/${orderId}`,
      { method: "DELETE" }
    ),
  delete: (id: number) =>
    apiFetch<void>(`/shipping-manifests/${id}`, { method: "DELETE" }),
  addOrders: (manifestId: number, orderIds: number[]) =>
    apiFetch<{ added: number; manifestNumber: string }>(`/shipping-manifests/${manifestId}/orders`, {
      method: "POST", body: JSON.stringify({ orderIds }),
    }),
  companyStats: (companyId: number) =>
    apiFetch<ManifestCompanyStats>(`/shipping-companies/${companyId}/stats`),
  getOrderManifestStatus: (orderId: number) =>
    apiFetch<{
      manifestId: number;
      manifestNumber: string;
      manifestStatus: "open" | "closed";
      deliveryStatus: DeliveryStatus;
      deliveryNote: string | null;
      partialQuantity: number | null;
      deliveredAt: string | null;
      returnReceived: 0 | 1 | null;
    } | null>(`/orders/${orderId}/manifest-status`),
  getInvoiceManifestStatus: (invoiceNumber: string) =>
    apiFetch<Array<{
      orderId: number;
      product: string;
      quantity: number;
      status: string;
      manifestId: number | null;
      manifestNumber: string | null;
      manifestStatus: "open" | "closed" | null;
      deliveryStatus: DeliveryStatus | null;
      deliveryNote: string | null;
      manifestPartialQuantity: number | null;
      deliveredAt: string | null;
      returnReceived: 0 | 1 | null;
    }>>(`/orders/invoice-manifest-status/${encodeURIComponent(invoiceNumber)}`),
};

// ─── Warehouses API ─────────────────────────────────────────────────────────
export interface Warehouse {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  notes: string | null;
  isDefault: boolean;
  totalUnits: number;
  skuCount: number;
  orderCount: number;
  shipmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseStockItem {
  id: number;
  warehouseId: number;
  productId: number | null;
  variantId: number | null;
  quantity: number;
  productName: string | null;
  productSku: string | null;
  variantColor: string | null;
  variantSize: string | null;
  unitPrice: number | null;
  costPrice: number | null;
  lowStockThreshold: number;
  updatedAt: string;
}

export interface WarehouseDetail extends Warehouse {
  stock: WarehouseStockItem[];
}

export interface VariantWarehouseStock {
  warehouseId: number;
  warehouseName: string;
  isDefault: boolean;
  quantity: number;
}

// ─── شحنات المخزن (Stark) ────────────────────────────────────────────────────
export interface WarehouseShipment {
  id: number;
  shipmentNumber: string | null;
  trackingNumber: string | null;
  senderName: string;
  receiverName: string;
  receiverPhone: string | null;
  receiverCity: string | null;
  status: string;
  parcelType: string | null;
  notes: string | null;
  codAmount: string | null;
  shippingFee: string | null;
  totalAmount: string | null;
  collectedAmount: string | null;
  pieces: number | null;
  createdAt: string;
  deliveredAt: string | null;
  warehouseId: number | null;
  returnReceived: 0 | 1 | null;
  shippingCompanyId: number | null;
  courierName: string | null;   // اسم المندوب (شركة الشحن)
  courierPhone: string | null;  // رقم المندوب
  courierCollectedAmount: number | null; // المبلغ اللي المندوب حصّله فعليًا من العميل (من بيان مندوب الشحن)
}

export interface WarehouseShipmentsResponse {
  shipments: WarehouseShipment[];
  stats: { total: number; active: number; delivered: number; returned: number; returnedPartial: number; delayed: number };
}

export interface WarehouseStats {
  total: number;
  byStatus: Record<string, number>;
  byParcelType: Record<string, number>;
  topClients: { name: string; count: number }[];
  staleShipments: { id: number; senderName: string; daysInWarehouse: number; parcelType: string | null }[];
  movement: { day: string; in: number; out: number }[];
}

export interface WarehouseTransfer {
  transfer: {
    id: number;
    shipmentId: number;
    fromWarehouseId: number | null;
    toWarehouseId: number | null;
    notes: string | null;
    createdByName: string | null;
    createdAt: string;
  };
  fromWarehouse: { id: number; name: string; city: string | null } | null;
}

export const warehousesApi = {
  list: () => apiFetch<Warehouse[]>("/warehouses"),
  get: (id: number) => apiFetch<WarehouseDetail>(`/warehouses/${id}`),
  stockByVariant: (variantId: number) => apiFetch<VariantWarehouseStock[]>(`/warehouses/stock/by-variant/${variantId}`),
  create: (data: { name: string; address?: string | null; city?: string | null; notes?: string | null; isDefault?: boolean }) =>
    apiFetch<Warehouse>("/warehouses", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<{ name: string; address: string | null; city: string | null; notes: string | null; isDefault: boolean }>) =>
    apiFetch<Warehouse>(`/warehouses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => apiFetch<void>(`/warehouses/${id}`, { method: "DELETE" }),
  updateStock: (warehouseId: number, stockId: number, quantity: number) =>
    apiFetch<WarehouseStockItem>(`/warehouses/${warehouseId}/stock/${stockId}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  addStock: (warehouseId: number, data: { productId?: number | null; variantId?: number | null; quantity: number }) =>
    apiFetch<WarehouseStockItem>(`/warehouses/${warehouseId}/stock`, { method: "POST", body: JSON.stringify(data) }),

  // ── شحنات Stark بالمخزن ─────────────────────────────────────────────────
  shipments: (warehouseId: number, status?: "active" | "delivered" | "returned" | "returned_partial" | "delayed" | "all") =>
    apiFetch<WarehouseShipmentsResponse>(`/warehouses/${warehouseId}/shipments${status ? `?status=${status}` : ""}`),
  stats: (warehouseId: number) =>
    apiFetch<WarehouseStats>(`/warehouses/${warehouseId}/stats`),
  transferShipment: (data: { shipmentId: number; toWarehouseId: number | null; notes?: string; shippingCompanyId?: number | null; newStatus?: string }) =>
    apiFetch<{ success: boolean }>("/warehouses/transfer", { method: "POST", body: JSON.stringify(data) }),
  transferShipmentsBulk: (data: { shipmentIds: number[]; toWarehouseId: number | null; notes?: string; shippingCompanyId?: number | null; newStatus?: string }) =>
    apiFetch<{ success: boolean; transferred: number; notFound: number[] }>("/warehouses/transfer-bulk", { method: "POST", body: JSON.stringify(data) }),
  transferHistory: (shipmentId: number) =>
    apiFetch<WarehouseTransfer[]>(`/warehouses/transfers/${shipmentId}`),
  assignCourier: (shipmentId: number, data: { shippingCompanyId: number; warehouseId?: number | null }) =>
    apiFetch<{ success: boolean }>(`/warehouses/shipments/${shipmentId}/courier`, { method: "PATCH", body: JSON.stringify(data) }),
};

// ─── Team & Campaign Analytics API ──────────────────────────────────────────
export interface TeamMemberStats {
  userId: number;
  userName: string;
  displayName: string;
  avatar: string | null;
  total: number;
  delivered: number;
  returned: number;
  pending: number;
  profit: number;
  deliveryRate: number;
  returnRate: number;
}

export interface TeamMemberExtStats extends TeamMemberStats {
  avgProcessingHours: number | null;
  sourceCounts: Record<string, number>;
  topSource: string | null;
  ordersPerDay: number;
  score: number;
}

export interface CampaignStats {
  adSource: string;
  adCampaign: string | null;
  total: number;
  delivered: number;
  returned: number;
  pending: number;
  revenue: number;
  cost: number;
  profit: number;
  deliveryRate: number;
  roi: number;
}

// ─── Employee Profiles & KPIs ────────────────────────────────────────────────
export interface EmployeeProfile {
  id: number;
  userId: number | null;
  username: string | null;
  displayName: string | null;
  role: string;
  isActive: boolean;
  isSystemUser: boolean;
  jobTitle: string | null;
  department: string | null;
  monthlySalary: number | null;
  hireDate: string | null;
  notes: string | null;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeKpi {
  id: number;
  profileId: number | null;
  userId: number | null;
  name: string;
  metric: string;
  targetValue: number;
  unit: string;
  direction: "higher_is_better" | "lower_is_better";
  weight: number;
  salaryWeight: number;
  overtargetBonus: number;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluatedKpi extends EmployeeKpi {
  actualValue: number | null;
  score: number | null;
  achieved: boolean | null;
}

export interface EmployeeReport {
  userId: number;
  username: string;
  displayName: string;
  role: string;
  profile: EmployeeProfile | null;
  period: { month: string; from: string; to: string };
  orderStats: {
    total: number;
    delivered: number;
    returned: number;
    pending: number;
    deliveryRate: number;
    returnRate: number;
    totalRevenue: number;
    totalProfit: number;
  };
  kpis: EvaluatedKpi[];
  kpiFinancials: {
    totalSalaryWeight: number;
    salaryAtRiskPercent: number;
    totalDeduction: number;
    totalBonus: number;
    achievedCount: number;
    failedCount: number;
    overTargetCount: number;
  };
  overallScore: number | null;
  rating: string;
  salary: number;
}

export interface Attendance {
  id: number;
  profileId: number;
  date: string;         // YYYY-MM-DD
  status: "present" | "absent" | "late" | "half_day" | "holiday" | "excused";
  checkIn: string | null;
  checkOut: string | null;
  lateMinutes: number;
  deduction: number;
  notes: string | null;
}

export interface AttendanceSalaryReport {
  profileId: number | null;
  displayName: string | null;
  noProfile?: boolean;
  month: string;
  baseSalary: number;
  workedDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  holidayDays: number;
  excusedDays: number;
  totalWorkingDays: number;
  totalRecordedDays?: number;
  workDays?: number;
  attendanceDeduction: number;
  bonuses: number;
  extraDeductions: number;
  netSalary: number;
  attendance: Attendance[];
  adjustments: { id: number; type: "bonus" | "deduction"; amount: number; reason: string }[];
}

export interface DailyKpiEntry extends EmployeeKpi {
  date: string;
  actualValue: number | null;
  dailyTarget: number;
  logId: number | null;
  logNotes: string | null;
  score: number | null;
  achieved: boolean | null;
}

export interface DailyLogDay {
  date: string;
  kpis: DailyKpiEntry[];
}

export interface WeekDay {
  date: string;
  actualValue: number | null;
  dailyTarget: number;
  achieved: boolean | null;
}

export interface KpiWeek {
  kpiId: number;
  kpiName: string;
  days: WeekDay[];
}

export interface WeekLogsResult {
  dates: string[];
  kpiWeeks: KpiWeek[];
}

// ─── Employee Orders (طلبات الموظف) ─────────────────────────────────────────
export interface EmployeeOrderItem {
  id: number;
  invoiceNumber: string | null;
  customerName: string;
  product: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
  city: string | null;
  adSource: string | null;
  shippingCost: number | null;
  createdAt: string;
  color: string | null;
  size: string | null;
}

export interface EmployeeOrdersStats {
  total: number;
  delivered: number;
  returned: number;
  inShipping: number;
  pending: number;
  deliveryRate: number;
  returnRate: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface EmployeeOrdersResponse {
  orders: EmployeeOrderItem[];
  stats: EmployeeOrdersStats;
  kpiImpact: {
    deliveryRate: number;
    returnRate: number;
    totalOrders: number;
    revenue: number;
    profit: number;
  };
}

export const employeeApi = {
  listProfiles: () => apiFetch<EmployeeProfile[]>("/employee-profiles"),
  getProfile: (profileId: number) => apiFetch<EmployeeProfile & { kpis: EmployeeKpi[] }>(`/employee-profiles/${profileId}`),
  createProfile: (data: {
    userId?: number;
    displayName?: string;
    jobTitle?: string | null;
    department?: string | null;
    monthlySalary?: number | null;
    hireDate?: string | null;
    notes?: string | null;
  }) => apiFetch<EmployeeProfile>("/employee-profiles", { method: "POST", body: JSON.stringify(data) }),
  upsertProfile: (data: {
    userId?: number;
    displayName?: string;
    jobTitle?: string | null;
    department?: string | null;
    monthlySalary?: number | null;
    hireDate?: string | null;
    notes?: string | null;
  }) => apiFetch<EmployeeProfile>("/employee-profiles", { method: "POST", body: JSON.stringify(data) }),
  updateProfile: (profileId: number, data: Partial<{
    displayName: string;
    jobTitle: string | null;
    department: string | null;
    monthlySalary: number | null;
    hireDate: string | null;
    notes: string | null;
    avatar: string | null;
  }>) => apiFetch<EmployeeProfile>(`/employee-profiles/${profileId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProfile: (profileId: number) => apiFetch<void>(`/employee-profiles/${profileId}`, { method: "DELETE" }),
  listKpis: (profileId: number) => apiFetch<EmployeeKpi[]>(`/employee-kpis/${profileId}`),
  createKpi: (data: {
    profileId: number; name: string; metric: string;
    targetValue: number; unit: string;
    direction: "higher_is_better" | "lower_is_better";
    weight: number; salaryWeight?: number; overtargetBonus?: number;
    isActive: boolean; description?: string | null;
  }) => apiFetch<EmployeeKpi>("/employee-kpis", { method: "POST", body: JSON.stringify(data) }),
  updateKpi: (kpiId: number, data: Partial<EmployeeKpi>) =>
    apiFetch<EmployeeKpi>(`/employee-kpis/${kpiId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteKpi: (kpiId: number) => apiFetch<void>(`/employee-kpis/${kpiId}`, { method: "DELETE" }),
  getReport: (profileId: number, month?: string, mode?: "monthly" | "daily", date?: string) => {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (mode) params.set("mode", mode);
    if (date) params.set("date", date);
    const qs = params.toString();
    return apiFetch<EmployeeReport>(`/analytics/employee-report/${profileId}${qs ? `?${qs}` : ""}`);
  },
  getMyReport: (month?: string, mode?: "monthly" | "daily", date?: string) => {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (mode)  params.set("mode", mode);
    if (date)  params.set("date", date);
    const qs = params.toString();
    return apiFetch<EmployeeReport>(`/analytics/my-report${qs ? `?${qs}` : ""}`);
  },
  getMyAttendance: (month?: string) =>
    apiFetch<Attendance[]>(`/attendance/my${month ? `?month=${month}` : ""}`),
  getMySalaryReport: (month?: string) =>
    apiFetch<AttendanceSalaryReport>(`/attendance/my/salary-report${month ? `?month=${month}` : ""}`),
  listUsers: () => apiFetch<AppUser[]>("/users"),
  getDailyLogs: (profileId: number, date?: string) =>
    apiFetch<DailyLogDay>(`/employee-daily-logs/${profileId}${date ? `?date=${date}` : ""}`),
  getWeekLogs: (profileId: number, date?: string) =>
    apiFetch<WeekLogsResult>(`/employee-daily-logs/${profileId}/week${date ? `?date=${date}` : ""}`),
  saveDailyLog: (data: { profileId: number; kpiId: number; date: string; value: number; notes?: string | null }) =>
    apiFetch<{ id: number }>("/employee-daily-logs", { method: "POST", body: JSON.stringify(data) }),
  getOrders: (profileId: number, month?: string) =>
    apiFetch<EmployeeOrdersResponse>(`/employee-orders/${profileId}${month ? `?month=${month}` : ""}`),
  getTeamRanking: (month?: string) =>
    apiFetch<any[]>(`/team-ranking${month ? `?month=${month}` : ""}`),
  getStarEmployees: () => apiFetch<any[]>("/star-employees"),
  setStarEmployees: (profileIds: number[]) =>
    apiFetch<{ success: boolean }>("/star-employees", { method: "POST", body: JSON.stringify({ profileIds }) }),
};

export const teamAnalyticsApi = {
  teamPerformance: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const qs = params.toString();
    return apiFetch<TeamMemberStats[]>(`/analytics/team-performance${qs ? `?${qs}` : ""}`);
  },
  teamPerformanceExtended: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const qs = params.toString();
    return apiFetch<TeamMemberExtStats[]>(`/analytics/team-performance-extended${qs ? `?${qs}` : ""}`);
  },
  campaigns: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const qs = params.toString();
    return apiFetch<CampaignStats[]>(`/analytics/campaigns${qs ? `?${qs}` : ""}`);
  },
};

// ─── Sessions API ────────────────────────────────────────────────────────────
export interface SessionLog {
  id: number;
  userId: number;
  loginAt: string;
  logoutAt: string | null;
  duration: number | null;
  ipAddress: string | null;
  displayName?: string;
  username?: string;
  role?: string;
}

export interface SessionReport {
  sessions: SessionLog[];
  summary: {
    userId: number;
    displayName: string;
    username: string;
    role: string;
    totalSessions: number;
    totalDuration: number;
    lastLogin: string | null;
  }[];
  period: string;
  from: string;
  to: string;
}

export const sessionsApi = {
  report: (params?: { period?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.period) q.set("period", params.period);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    return apiFetch<SessionReport>(`/sessions/report?${q.toString()}`);
  },
  me: () => apiFetch<SessionLog[]>("/sessions/me"),
};

export const movementsApi = {
  list: (filters?: MovementFilters) => {
    const params = new URLSearchParams();
    if (filters?.type)        params.set("type",        filters.type);
    if (filters?.reason)      params.set("reason",      filters.reason);
    if (filters?.productId)   params.set("productId",   String(filters.productId));
    if (filters?.warehouseId) params.set("warehouseId", String(filters.warehouseId));
    if (filters?.dateFrom)    params.set("dateFrom",    filters.dateFrom);
    if (filters?.dateTo)      params.set("dateTo",      filters.dateTo);
    const qs = params.toString();
    return apiFetch<InventoryMovement[]>(`/inventory/movements${qs ? `?${qs}` : ""}`);
  },
  totals: (filters?: MovementFilters) => {
    const params = new URLSearchParams();
    if (filters?.type)        params.set("type",        filters.type);
    if (filters?.reason)      params.set("reason",      filters.reason);
    if (filters?.productId != null)   params.set("productId",   String(filters.productId));
    if (filters?.warehouseId != null) params.set("warehouseId", String(filters.warehouseId));
    if (filters?.dateFrom)    params.set("dateFrom",    filters.dateFrom);
    if (filters?.dateTo)      params.set("dateTo",      filters.dateTo);
    const qs = params.toString();
    return apiFetch<MovementTotals>(`/inventory/movements/totals${qs ? `?${qs}` : ""}`);
  },
  create: (data: {
    product: string;
    color?: string | null;
    size?: string | null;
    quantity: number;
    type: MovementType;
    reason: MovementReason;
    productId?: number | null;
    variantId?: number | null;
    warehouseId?: number | null;
    fromLocation?: string | null;
    toLocation?: string | null;
    notes?: string | null;
  }) => apiFetch<InventoryMovement>("/inventory/movements", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: {
    product: string;
    color?: string | null;
    size?: string | null;
    quantity: number;
    type: MovementType;
    reason: MovementReason;
    warehouseId?: number | null;
    fromLocation?: string | null;
    toLocation?: string | null;
    notes?: string | null;
  }) => apiFetch<InventoryMovement>(`/inventory/movements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) => apiFetch<{ success: boolean }>(`/inventory/movements/${id}`, { method: "DELETE" }),
  deleteBulk: (ids: number[]) => apiFetch<{ success: boolean; deleted: number }>("/inventory/movements", { method: "DELETE", body: JSON.stringify({ ids }) }),
};

// ─── App Settings API ─────────────────────────────────────────────────────
export interface AppSettings {
  showAddTeamMember: boolean;
  allowBrandEdit: boolean;
  showTeamPerformance: boolean;
  showTeamManagement: boolean;
  showSmartAnalytics: boolean;
  showAdsAnalytics: boolean;
  showExportData: boolean;
}

export const appSettingsApi = {
  get: () => apiFetch<AppSettings>("/settings"),
  update: (data: Partial<AppSettings>) =>
    apiFetch<AppSettings>("/settings", { method: "PATCH", body: JSON.stringify(data) }),
};

// ─── Attendance & Payroll API ────────────────────────────────────────────────

export type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "holiday" | "excused";

export interface AttendanceRecord {
  id: number;
  profileId: number;
  date: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  lateMinutes: number;
  deduction: number;
  notes: string | null;
  createdAt: string;
}

export interface PayrollAdjustment {
  id: number;
  profileId: number;
  month: string;
  type: "bonus" | "deduction";
  amount: number;
  reason: string;
  createdAt: string;
}

export interface MonthlySalaryReport {
  profileId: number;
  displayName: string;
  month: string;
  baseSalary: number;
  workedDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  totalWorkingDays: number;
  attendanceDeduction: number;
  bonuses: number;
  extraDeductions: number;
  netSalary: number;
  attendance: AttendanceRecord[];
  adjustments: PayrollAdjustment[];
}

export const attendanceApi = {
  // جلب سجل الحضور لموظف في شهر معين
  list: (profileId: number, month: string) =>
    apiFetch<AttendanceRecord[]>(`/attendance/${profileId}?month=${month}`),

  // تسجيل أو تعديل يوم حضور
  save: (data: {
    profileId: number;
    date: string;
    status: AttendanceStatus;
    checkIn?: string | null;
    checkOut?: string | null;
    lateMinutes?: number;
    notes?: string | null;
  }) => apiFetch<AttendanceRecord>("/attendance", { method: "POST", body: JSON.stringify(data) }),

  // حذف سجل يوم
  delete: (id: number) => apiFetch<void>(`/attendance/${id}`, { method: "DELETE" }),

  // تقرير المرتب الشهري كامل
  salaryReport: (profileId: number, month: string) =>
    apiFetch<MonthlySalaryReport>(`/attendance/${profileId}/salary-report?month=${month}`),

  // إضافة خصم أو بونص
  addAdjustment: (data: {
    profileId: number;
    month: string;
    type: "bonus" | "deduction";
    amount: number;
    reason: string;
  }) => apiFetch<PayrollAdjustment>("/attendance/adjustments", { method: "POST", body: JSON.stringify(data) }),

  // جلب الخصومات والبونص لشهر
  listAdjustments: (profileId: number, month: string) =>
    apiFetch<PayrollAdjustment[]>(`/attendance/adjustments/${profileId}?month=${month}`),

  // حذف خصم أو بونص
  deleteAdjustment: (id: number) => apiFetch<void>(`/attendance/adjustments/${id}`, { method: "DELETE" }),
};

// ─── Cash Registers API ───────────────────────────────────────────────────────
export type CashRegister = {
  id: number;
  name: string;
  balance: string;
  type: string;
  isDefault: boolean;
};

export const cashRegistersApi = {
  list: () => apiFetch<{ registers: CashRegister[]; totalBalance: number }>("/cash-registers"),
};

// ─── Shipments API ────────────────────────────────────────────────────────────
export interface Shipment {
  id: number;
  shipmentNumber: string;
  trackingNumber: string | null;
  clientId: number | null;
  senderName: string;
  senderPhone: string | null;
  senderPhone2?: string | null;
  senderCity?: string | null;
  senderGovernorate?: string | null;
  senderCityGovernorate?: string | null;
  receiverName: string;
  receiverPhone: string | null;
  receiverPhone2?: string | null;
  receiverAddress: string | null;
  receiverCity: string | null;
  zoneId: number | null;
  zoneLabel: string | null;
  zoneGovernorate: string | null;
  parcelType?: string | null;
  weight?: string | null;
  pieces?: number | null;
  declaredValue?: string | null;
  paymentMethod: "cod" | "prepaid" | "deferred";
  codAmount: string;
  costPrice: string | null;
  shippingFee: string;
  insuranceFee?: string | null;
  totalAmount: string;
  collectedAmount: string;
  status: string;
  shippingCompanyId: number | null;
  shippingCompanyName: string | null;
  assignedUserId: number | null;
  assignedUserName: string | null;
  notes: string | null;
  internalNotes?: string | null;
  returnReason?: string | null;
  returnReceived?: number | null;
  returnNote?: string | null;
  partialQuantity?: number | null;
  productId?: number | null;
  variantId?: number | null;
  warehouseId?: number | null;
  estimatedDelivery?: string | null;
  actualDelivery?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentsListResponse {
  data: Shipment[];
  total: number;
}

export const shipmentsApi = {
  list: (params?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
    shippingCompanyId?: number;
    clientId?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.status)           q.set("status",           params.status);
    if (params?.search)           q.set("search",           params.search);
    if (params?.limit != null)    q.set("limit",            String(params.limit));
    if (params?.offset != null)   q.set("offset",           String(params.offset));
    if (params?.shippingCompanyId != null) q.set("shippingCompanyId", String(params.shippingCompanyId));
    if (params?.clientId != null) q.set("clientId",         String(params.clientId));
    const qs = q.toString();
    return apiFetch<ShipmentsListResponse>(`/shipments${qs ? `?${qs}` : ""}`);
  },
  get: (id: number) => apiFetch<Shipment>(`/shipments/${id}`),
  create: (data: Partial<Shipment> & { senderName: string; receiverName: string }) =>
    apiFetch<Shipment>("/shipments", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Shipment>) =>
    apiFetch<Shipment>(`/shipments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  patch: (id: number, data: Partial<Shipment>) =>
    apiFetch<Shipment>(`/shipments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => apiFetch<{ success: boolean }>(`/shipments/${id}`, { method: "DELETE" }),
  stats: () => apiFetch<any>("/shipments/stats"),
  track: (number: string) => apiFetch<Shipment>(`/shipments/track/${encodeURIComponent(number)}`),
  deleteBulk: (ids: number[]) => apiFetch<{ deleted: number; skipped: number }>("/shipments/bulk", { method: "DELETE", body: JSON.stringify({ ids }) }),
  archived: () => apiFetch<Shipment[]>("/shipments/archived"),
  restore: (id: number) => apiFetch<Shipment>(`/shipments/${id}/restore`, { method: "POST" }),
  purgeSelected: (ids: number[]) => apiFetch<{ success: boolean; deleted: number }>("/shipments/archived/purge", { method: "DELETE", body: JSON.stringify({ ids }) }),
};

// ─── Shipment Manifests API ───────────────────────────────────────────────────
export interface ShipmentManifestListItem {
  id: number;
  manifestNumber: string;
  shippingCompanyId: number;
  companyName: string;
  companyLogo: string | null;
  status: "open" | "closed";
  closedByRole: "representative" | "admin" | null;
  notes: string | null;
  invoicePrice: string | null;
  shipmentCount: number;
  statusCounts: { pending: number; delayed: number; returned: number; delivered: number; partial: number };
  createdAt: string;
  closedAt: string | null;
}

export interface ShipmentManifestDetail {
  id: number;
  manifestNumber: string;
  shippingCompanyId: number;
  status: "open" | "closed";
  closedByRole: "representative" | "admin" | null;
  closedByName: string | null;
  notes: string | null;
  invoicePrice: string | null;
  createdAt: string;
  closedAt: string | null;
  company: { id: number; name: string; logo: string | null; shippingCost?: number | null } | null;
  items: Array<{
    id: number;
    manifestId: number;
    shipmentId: number;
    deliveryStatus: "pending" | "delivered" | "returned" | "delayed" | "partial_delivered";
    deliveryNote: string | null;
    returnReceived: 0 | 1 | null;
    deliveredAt: string | null;
    partialQuantity: number | null;
    returnReason: string | null;
    shipment: Shipment | null;
    // حقول مُعززة من الـ backend
    customerName: string;
    phone: string;
    city: string;
    address: string;
    senderName: string;
    quantity: number;
    totalPrice: number;
    unitPrice: number;
    shippingCost: number;
    invoiceNumber: string;
  }>;
  stats: {
    total: number; delivered: number; returned: number; pending: number; delayed: number; partial: number;
    totalRevenue: number; totalCost: number; totalShippingCost: number;
    returnLosses: number; netProfit: number; deliveredGross: number;
    deliveredShippingFees: number; netDueToCompany: number; realNetProfit: number;
  };
  manualShippingCost?: number | null;
}

export const shipmentManifestsApi = {
  list: (companyId?: number) =>
    apiFetch<ShipmentManifestListItem[]>(`/shipment-manifests${companyId ? `?companyId=${companyId}` : ""}`),
  get: (id: number) =>
    apiFetch<ShipmentManifestDetail>(`/shipment-manifests/${id}`),
  create: (data: { shippingCompanyId: number; shipmentIds: number[]; notes?: string }) =>
    apiFetch<{ id: number; manifestNumber: string; shipmentCount: number }>(
      "/shipment-manifests", { method: "POST", body: JSON.stringify(data) }
    ),
  updateItem: (manifestId: number, shipmentId: number, data: { deliveryStatus: string; deliveryNote?: string | null; partialQuantity?: number | null; returnReceived?: boolean | null; returnReason?: string | null; returnValueReceived?: number | null; deliveredValueReceived?: number | null }) =>
    apiFetch<{ success: boolean }>(`/shipment-manifests/${manifestId}/items/${shipmentId}`, {
      method: "PATCH", body: JSON.stringify(data),
    }),
  deleteItem: (manifestId: number, shipmentId: number) =>
    apiFetch<{ success: boolean }>(`/shipment-manifests/${manifestId}/items/${shipmentId}`, {
      method: "DELETE",
    }),
  addShipments: (manifestId: number, shipmentIds: number[]) =>
    apiFetch<{ added: number; manifestNumber: string }>(
      `/shipment-manifests/${manifestId}/add-shipments`,
      { method: "POST", body: JSON.stringify({ shipmentIds }) }
    ),
  update: (id: number, data: { status?: "open" | "closed"; notes?: string; invoicePrice?: number | null }) =>
    apiFetch<{
      success: boolean;
      rolledOverManifest?: {
        id: number;
        manifestNumber: string;
        orderCount: number;
        postponedCount: number;
        returnedInShippingCount: number;
        partialInShippingCount: number;
      } | null;
    }>(`/shipment-manifests/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch<{ success: boolean }>(`/shipment-manifests/${id}`, { method: "DELETE" }),
  companyStats: (companyId: number) =>
    apiFetch<ManifestCompanyStats & { partial: number }>(
      `/shipping-companies/${companyId}/shipment-stats`
    ),
};

// ─── Client Account Manifests (بيان حساب العميل) ───────────────────────────
export interface ClientAccountManifestListItem {
  id: number;
  manifestNumber: string;
  clientId: number;
  clientName: string;
  clientAvatar: string | null;
  status: "open" | "closed";
  notes: string | null;
  invoicePrice: string | null;
  shipmentCount: number;
  statusCounts: { pending: number; delayed: number; returned: number; delivered: number; partial: number };
  createdAt: string;
  closedAt: string | null;
}

export interface ClientAccountManifestDetail {
  id: number;
  manifestNumber: string;
  clientId: number;
  status: "open" | "closed";
  notes: string | null;
  invoicePrice: string | null;
  invoiceNotes: string | null;
  createdAt: string;
  closedAt: string | null;
  client: { id: number; name: string; phone: string | null; city: string | null } | null;
  items: Array<{
    id: number;
    manifestId: number;
    shipmentId: number;
    deliveryStatus: "pending" | "delivered" | "returned" | "delayed" | "partial_delivered";
    deliveryNote: string | null;
    returnReceived: 0 | 1 | null;
    deliveredAt: string | null;
    partialQuantity: number | null;
    returnReason: string | null;
    shipment: Shipment | null;
    customerName: string;
    phone: string;
    city: string;
    address: string;
    senderName: string;
    quantity: number;
    totalPrice: number;
    unitPrice: number;
    shippingCost: number;
    invoiceNumber: string;
    representativeName?: string | null;
  }>;
  stats: {
    total: number; delivered: number; returned: number; pending: number; delayed: number; partial: number;
    totalRevenue: number; totalCost: number; totalShippingCost: number;
    returnLosses: number; netProfit: number; deliveredGross: number;
    deliveredShippingFees: number; netDueFromClient: number;
  };
  manualShippingCost?: number | null;
}

export const clientAccountManifestsApi = {
  list: (clientId?: number) =>
    apiFetch<ClientAccountManifestListItem[]>(`/client-account-manifests${clientId ? `?clientId=${clientId}` : ""}`),
  get: (id: number) =>
    apiFetch<ClientAccountManifestDetail>(`/client-account-manifests/${id}`),
  create: (data: { clientId: number; shipmentIds: number[]; notes?: string }) =>
    apiFetch<{ id: number; manifestNumber: string; shipmentCount: number }>(
      "/client-account-manifests", { method: "POST", body: JSON.stringify(data) }
    ),
  updateItem: (manifestId: number, shipmentId: number, data: { deliveryStatus: string; deliveryNote?: string | null; partialQuantity?: number | null; returnReceived?: boolean | null; returnReason?: string | null }) =>
    apiFetch<{ success: boolean }>(`/client-account-manifests/${manifestId}/items/${shipmentId}`, {
      method: "PATCH", body: JSON.stringify(data),
    }),
  addShipments: (manifestId: number, shipmentIds: number[]) =>
    apiFetch<{ added: number; manifestNumber: string }>(
      `/client-account-manifests/${manifestId}/add-shipments`,
      { method: "POST", body: JSON.stringify({ shipmentIds }) }
    ),
  update: (id: number, data: { status?: "open" | "closed"; notes?: string; invoicePrice?: number | null; manualShippingCost?: number | null }) =>
    apiFetch<{ success: boolean }>(`/client-account-manifests/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch<{ success: boolean }>(`/client-account-manifests/${id}`, { method: "DELETE" }),
  removeShipment: (manifestId: number, shipmentId: number) =>
    apiFetch<{ success: boolean; shipmentId: number; message: string }>(
      `/client-account-manifests/${manifestId}/items/${shipmentId}`, { method: "DELETE" }
    ),
  clientStats: (clientId: number) =>
    apiFetch<{ total: number; delivered: number; partial: number; returned: number; pending: number; deliveryRate: number; manifestCount: number }>(
      `/clients/${clientId}/account-manifest-stats`
    ),
};

// ─── Client Return Manifests API (بيان مرتجعات العميل) ────────────────────
export interface ClientReturnManifestListItem {
  id: number;
  tenantId: number | null;
  manifestNumber: string;
  clientId: number;
  status: "open" | "closed";
  notes: string | null;
  courierName: string | null;
  createdAt: string;
  closedAt: string | null;
  itemsCount: number;
  clientName: string | null;
}

export interface ClientReturnManifestItem {
  id: number;
  manifestId: number;
  shipmentId: number;
  shipmentNumber: string;
  senderName: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverCity: string | null;
  shipmentCodAmount: string | null;
  shippingFee: string | null;
  codAmount: string | null;
  returnReason: string | null;
  addedAt: string;
}

export interface ClientReturnManifestDetail extends ClientReturnManifestListItem {
  manifest: ClientReturnManifestListItem;
  items: ClientReturnManifestItem[];
}

export const clientReturnManifestsApi = {
  list: (clientId?: number) =>
    apiFetch<{ manifests: ClientReturnManifestListItem[] }>(`/client-return-manifests${clientId ? `?clientId=${clientId}` : ""}`),
  get: (id: number) =>
    apiFetch<{ manifest: ClientReturnManifestListItem; items: ClientReturnManifestItem[] }>(`/client-return-manifests/${id}`),
  confirmDelivery: (clientId: number, shipmentId: number) =>
    apiFetch<{ success: boolean; manifestId: number }>(
      `/client-return-manifests/${clientId}/confirm-delivery/${shipmentId}`, { method: "POST" }
    ),
  close: (id: number, notes?: string | null, courierName?: string | null) =>
    apiFetch<{ success: boolean }>(`/client-return-manifests/${id}`, {
      method: "PATCH", body: JSON.stringify({ status: "closed", notes, courierName }),
    }),
};

// ─── Sale Order Manifests API (بيان فواتير البيع للعميل) ──────────────────
export interface SaleOrderManifestListItem {
  id: number;
  tenantId: number | null;
  manifestNumber: string;
  clientId: number;
  status: "open" | "closed";
  notes: string | null;
  invoicePrice: number | null;
  invoiceNotes: string | null;
  createdAt: string;
  closedAt: string | null;
  orderCount: number;
  statusCounts: { draft: number; confirmed: number; processing: number; delivered: number; closed: number };
  clientName: string;
  clientAvatar: string | null;
}

export interface SaleOrderManifestDetail extends SaleOrderManifestListItem {
  client: { id: number; name: string; phone: string | null; city: string | null } | null;
  items: Array<{
    id: number;
    manifestId: number;
    saleOrderId: number;
    addedAt: string;
    order: {
      id: number; soNumber: string; status: string; paymentStatus: string;
      totalAmount: string; paidAmount: string; shippingCost: string | null;
      createdAt: string; closedAt?: string | null;
      clientName?: string; clientPhone?: string | null;
    } | null;
  }>;
  stats: {
    total: number; delivered: number; processing: number;
    totalAmount: number; totalPaid: number; totalUnpaid: number;
    totalShippingCost: number; netDue: number;
  };
}

export const saleOrderManifestsApi = {
  list: (clientId?: number) =>
    apiFetch<SaleOrderManifestListItem[]>(`/sale-order-manifests${clientId ? `?clientId=${clientId}` : ""}`),
  get: (id: number) =>
    apiFetch<SaleOrderManifestDetail>(`/sale-order-manifests/${id}`),
  available: (clientId: number) =>
    apiFetch<Array<{
      id: number; soNumber: string; status: string; paymentStatus: string;
      totalAmount: string; paidAmount: string; shippingCost: string | null;
      createdAt: string; closedAt?: string | null;
    }>>(`/sale-order-manifests/available/${clientId}`),
  create: (data: { clientId: number; saleOrderIds: number[]; notes?: string }) =>
    apiFetch<{ id: number; manifestNumber: string; orderCount: number }>(
      "/sale-order-manifests", { method: "POST", body: JSON.stringify(data) }
    ),
  addOrders: (manifestId: number, saleOrderIds: number[]) =>
    apiFetch<{ added: number; manifestNumber: string }>(
      `/sale-order-manifests/${manifestId}/add-orders`,
      { method: "POST", body: JSON.stringify({ saleOrderIds }) }
    ),
  update: (id: number, data: { status?: "open" | "closed"; notes?: string; invoicePrice?: number | null; rollover?: boolean }) =>
    apiFetch<{ success: boolean; rolled?: { id: number; manifestNumber: string; orderCount: number } }>(
      `/sale-order-manifests/${id}`, { method: "PATCH", body: JSON.stringify(data) }
    ),
  delete: (id: number) =>
    apiFetch<{ success: boolean }>(`/sale-order-manifests/${id}`, { method: "DELETE" }),
};

// ─── Notifications API ─────────────────────────────────────────────────────
export interface AppNotificationDTO {
  id: number; tenantId: number | null; type: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string; message: string | null;
  entityType: string | null; entityId: number | null;
  link: string | null; isRead: boolean; createdAt: string;
}
export const notificationsApi = {
  list: (limit = 30) => apiFetch<{ notifications: AppNotificationDTO[] }>(`/notifications?limit=${limit}`),
  unreadCount: () => apiFetch<{ count: number }>("/notifications/unread-count"),
  markRead: (id: number) => apiFetch<{ success: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => apiFetch<{ success: boolean }>("/notifications/read-all", { method: "PATCH" }),
};

// ─── Client Account Pro API (حساب العميل الاحترافي) ─────────────────────────
export type ReceiverAccountStatus = "active" | "suspended";
export type ReceiverPaymentMethod = "cod" | "prepaid" | "deferred";
export type ClientPaymentMethod = "cash" | "bank_transfer" | "wallet" | "instapay" | "other";
export type ClientInvoiceStatus = "unpaid" | "partial" | "paid";

export interface ReceiverClientProfile {
  id: number;
  tenantId: number | null;
  normalizedPhone: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  accountNumber: string | null;
  creditLimit: string;
  paymentMethod: ReceiverPaymentMethod;
  accountStatus: ReceiverAccountStatus;
  internalNotes: string | null;
  lastClosedPeriodTo: string | null;
  suspendedAt: string | null;
  suspendedByUserId: number | null;
  suspendedByName: string | null;
  suspendReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientStatementEntry {
  date: string;
  type: "debit" | "credit";
  description: string;
  amount: number;
  refId: number;
  balance: number;
}
export interface ClientStatementResponse {
  entries: ClientStatementEntry[];
  totalDebit: number;
  totalCredit: number;
  currentBalance: number;
}

export interface ClientPaymentDTO {
  id: number;
  tenantId: number | null;
  clientPhone: string;
  normalizedPhone: string;
  amount: string;
  paymentMethod: ClientPaymentMethod;
  receiptNumber: string | null;
  linkedShipmentId: number | null;
  receivedByUserId: number | null;
  receivedByName: string | null;
  notes: string | null;
  paidAt: string;
  createdAt: string;
}

export interface ClientInvoiceDTO {
  id: number;
  tenantId: number | null;
  invoiceNumber: string;
  clientPhone: string;
  normalizedPhone: string;
  periodFrom: string | null;
  periodTo: string | null;
  shipmentIds: number[];
  totalAmount: string;
  paidAmount: string;
  status: ClientInvoiceStatus;
  notes: string | null;
  createdByUserId: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientMonthlyStat {
  month: string;
  shipmentsCount: number;
  totalAmount: number;
  delivered: number;
  returned: number;
}
export interface ClientGovernorateStat { city: string; count: number; }
export interface ClientAnalyticsResponse {
  monthly: ClientMonthlyStat[];
  byGovernorate: ClientGovernorateStat[];
  returnRate: number;
  healthScore: number;
  healthBreakdown: {
    returnHealthComponent: number;
    paymentComplianceRate: number;
    volumeScore: number;
  } | null;
}

export type AdjustmentType =
  | "damage_deduction" | "return_deduction" | "discount" | "penalty"
  | "manual_credit" | "manual_debit" | "correction" | "shipping_fee";
export type AdjustmentDirection = "credit" | "debit";

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  damage_deduction: "خصم تالف",
  return_deduction: "خصم بضاعة مرتجعة",
  discount: "خصم تجاري",
  penalty: "غرامة / خصم تأخير",
  manual_credit: "إضافة لصالح العميل",
  manual_debit: "إضافة على العميل",
  correction: "تصحيح محاسبي",
  shipping_fee: "أجرة شحن",
};

export interface ClientAdjustmentDTO {
  id: number;
  tenantId: number | null;
  clientPhone: string;
  normalizedPhone: string;
  type: AdjustmentType;
  direction: AdjustmentDirection;
  amount: string;
  linkedShipmentId: number | null;
  reason: string;
  createdByUserId: number | null;
  createdByName: string | null;
  voidedAt: string | null;
  voidedByUserId: number | null;
  voidedByName: string | null;
  voidReason: string | null;
  adjustedAt: string;
  createdAt: string;
}

export interface ClientAccountPeriodDTO {
  id: number;
  tenantId: number | null;
  clientPhone: string;
  normalizedPhone: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  totalAdjustments: string;
  closingBalance: string;
  ordersCount: number;
  orderIds: string | null;
  notes: string | null;
  closedByUserId: number | null;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenedByUserId: number | null;
  reopenedByName: string | null;
  status: "closed" | "reopened";
  createdAt: string;
}

export interface ClientCreditStatus {
  currentBalance: number;
  creditLimit: number;
  overLimit: boolean;
  overLimitAmount: number;
}

export const clientAccountProApi = {
  getProfile: (phone: string) =>
    apiFetch<{ client: ReceiverClientProfile | null; creditStatus?: ClientCreditStatus }>(`/client-account-pro/profile?phone=${encodeURIComponent(phone)}`),
  updateProfile: (data: {
    phone: string; name?: string; email?: string | null; city?: string | null;
    address?: string | null; creditLimit?: number | null;
    paymentMethod?: ReceiverPaymentMethod; internalNotes?: string | null;
  }) => apiFetch<{ success: boolean }>("/client-account-pro/profile", { method: "PATCH", body: JSON.stringify(data) }),
  suspend: (phone: string, suspend: boolean, reason?: string | null) =>
    apiFetch<{ success: boolean }>("/client-account-pro/suspend", {
      method: "POST", body: JSON.stringify({ phone, suspend, reason }),
    }),

  getStatement: (phone: string) =>
    apiFetch<ClientStatementResponse>(`/client-account-pro/statement?phone=${encodeURIComponent(phone)}`),

  getPayments: (phone: string) =>
    apiFetch<{ payments: ClientPaymentDTO[] }>(`/client-account-pro/payments?phone=${encodeURIComponent(phone)}`),
  createPayment: (data: {
    phone: string; amount: number; paymentMethod: ClientPaymentMethod;
    receiptNumber?: string | null; linkedShipmentId?: number | null;
    notes?: string | null; paidAt?: string | null;
  }) => apiFetch<{ success: boolean; id: number }>("/client-account-pro/payments", { method: "POST", body: JSON.stringify(data) }),
  deletePayment: (id: number) =>
    apiFetch<{ success: boolean }>(`/client-account-pro/payments/${id}`, { method: "DELETE" }),

  getInvoices: (phone: string) =>
    apiFetch<{ invoices: ClientInvoiceDTO[] }>(`/client-account-pro/invoices?phone=${encodeURIComponent(phone)}`),
  createInvoice: (data: {
    phone: string; shipmentIds: number[]; periodFrom?: string | null;
    periodTo?: string | null; notes?: string | null;
  }) => apiFetch<{ success: boolean; id: number; invoiceNumber: string }>("/client-account-pro/invoices", { method: "POST", body: JSON.stringify(data) }),
  updateInvoice: (id: number, data: { paidAmount?: number; status?: ClientInvoiceStatus }) =>
    apiFetch<{ success: boolean }>(`/client-account-pro/invoices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  getAnalytics: (phone: string) =>
    apiFetch<ClientAnalyticsResponse>(`/client-account-pro/analytics?phone=${encodeURIComponent(phone)}`),

  getAdjustments: (phone: string) =>
    apiFetch<{ adjustments: ClientAdjustmentDTO[] }>(`/client-account-pro/adjustments?phone=${encodeURIComponent(phone)}`),
  createAdjustment: (data: {
    phone: string; type: AdjustmentType; direction: AdjustmentDirection;
    amount: number; reason: string; linkedShipmentId?: number | null; adjustedAt?: string | null;
  }) => apiFetch<{ success: boolean; id: number }>("/client-account-pro/adjustments", { method: "POST", body: JSON.stringify(data) }),
  voidAdjustment: (id: number, voidReason?: string | null) =>
    apiFetch<{ success: boolean }>(`/client-account-pro/adjustments/${id}`, { method: "DELETE", body: JSON.stringify({ voidReason }) }),

  getPeriods: (phone: string) =>
    apiFetch<{ periods: ClientAccountPeriodDTO[] }>(`/client-account-pro/periods?phone=${encodeURIComponent(phone)}`),
  previewPeriodClose: (data: { phone: string; periodFrom: string; periodTo: string }) =>
    apiFetch<{ summary: {
      openingBalance: number; totalDebit: number; totalCredit: number;
      totalAdjustments: number; closingBalance: number; ordersCount: number;
      creditLimit: number; overLimit: boolean; overLimitAmount: number;
      unpaidInvoicesCount: number; unpaidInvoicesTotal: number; pendingAdjustmentsCount: number;
    } }>(`/client-account-pro/periods/preview?phone=${encodeURIComponent(data.phone)}&periodFrom=${encodeURIComponent(data.periodFrom)}&periodTo=${encodeURIComponent(data.periodTo)}`),
  closePeriod: (data: { phone: string; periodFrom: string; periodTo: string; notes?: string | null }) =>
    apiFetch<{ success: boolean; id: number; summary: {
      openingBalance: number; totalDebit: number; totalCredit: number;
      totalAdjustments: number; closingBalance: number; ordersCount: number;
    } }>("/client-account-pro/periods/close", { method: "POST", body: JSON.stringify(data) }),
  reopenPeriod: (id: number, reason: string) =>
    apiFetch<{ success: boolean }>(`/client-account-pro/periods/${id}/reopen`, { method: "POST", body: JSON.stringify({ reason }) }),
};
