// ══════════════════════════════════════════════════════════════════════════
// Operations Center — Mock Data (المرحلة 1: UI فقط، بدون API)
// عند ربط الـ API لاحقاً، استبدل الاستدعاءات هنا بـ react-query hooks
// ══════════════════════════════════════════════════════════════════════════

// ── 1) مركز العمليات ────────────────────────────────────────────────────────
export const mockDelayedShipments = [
  { id: "STK-10231", client: "متجر النور", city: "القاهرة", hours: 26 },
  { id: "STK-10188", client: "بيوتي سنتر", city: "الجيزة", hours: 14 },
  { id: "STK-10099", client: "تك ستور", city: "الإسكندرية", hours: 9 },
];
export const mockProblemShipments = [
  { id: "STK-10250", client: "فاشون هب", issue: "رفض الاستلام", city: "المنصورة" },
  { id: "STK-10241", client: "سمارت شوب", issue: "عنوان خاطئ", city: "طنطا" },
];
export const mockTodayOutbound = { count: 58, target: 70 };
// ── 3) مؤشرات الأداء (KPIs) ──────────────────────────────────────────────────
export const mockKpis = [
  { key: "firstAttempt", label: "التسليم أول محاولة", value: 87, suffix: "%" },
  { key: "avgDeliveryTime", label: "متوسط وقت التوصيل", value: 68, suffix: "% (1.4 يوم)" },
  { key: "returnRate", label: "نسبة المرتجعات", value: 4, suffix: "%" },
  { key: "delayRate", label: "نسبة التأخير", value: 9, suffix: "%" },
  { key: "avgRating", label: "متوسط تقييم العملاء", value: 92, suffix: "% (4.6/5)" },
  { key: "avgPickupTime", label: "متوسط زمن الاستلام", value: 74, suffix: "% (3 ساعات)" },
];

// ── 6) اتجاه الإيرادات والأرباح ──────────────────────────────────────────────
export const mockRevenueTrend = [
  { day: "السبت", revenue: 42000, profit: 12000 },
  { day: "الأحد", revenue: 48000, profit: 14500 },
  { day: "الاثنين", revenue: 51000, profit: 15800 },
  { day: "الثلاثاء", revenue: 46500, profit: 13200 },
  { day: "الأربعاء", revenue: 58000, profit: 18100 },
  { day: "الخميس", revenue: 61500, profit: 19700 },
  { day: "الجمعة", revenue: 55000, profit: 16900 },
];

// ── أفضل العملاء وأفضل المندوبين (fallback لو الـ API رجع فاضي) ─────────────
export const mockTopPerformers = {
  topClients: [
    { name: "متجر النور", phone: "01012345678", shipmentsCount: 142, revenue: 186000, successRate: 94 },
    { name: "بيوتي سنتر", phone: "01098765432", shipmentsCount: 121, revenue: 154500, successRate: 89 },
    { name: "تك ستور", phone: "01123456789", shipmentsCount: 98, revenue: 132750, successRate: 91 },
    { name: "فاشون هب", phone: "01234567890", shipmentsCount: 76, revenue: 97200, successRate: 78 },
    { name: "سمارت شوب", phone: "01555555555", shipmentsCount: 64, revenue: 81300, successRate: 85 },
  ],
  topReps: [
    { userId: 1, name: "أحمد سعيد", avatar: null, assigned: 210, successRate: 96, avgRating: 4.8, ratingsCount: 154 },
    { userId: 2, name: "محمود جمال", avatar: null, assigned: 187, successRate: 92, avgRating: 4.6, ratingsCount: 132 },
    { userId: 3, name: "كريم عادل", avatar: null, assigned: 165, successRate: 88, avgRating: 4.4, ratingsCount: 109 },
    { userId: 4, name: "يوسف حسن", avatar: null, assigned: 143, successRate: 84, avgRating: 4.2, ratingsCount: 97 },
  ],
};

// ── كروت KPI الرئيسية (فوق الصفحة) ───────────────────────────────────────────
export const mockOperationsKpis = {
  cards: [
    { key: "total", label: "إجمالي الشحنات", value: 1284, change: 8, sparkline: [40, 55, 48, 62, 58, 70, 65] },
    { key: "delivered", label: "تم التسليم", value: 1046, change: 6, sparkline: [30, 42, 38, 50, 47, 60, 55] },
    { key: "inShipping", label: "قيد الشحن", value: 158, change: -3, sparkline: [20, 18, 22, 15, 19, 14, 17] },
    { key: "returned", label: "مرتجعة", value: 52, change: -5, sparkline: [10, 9, 12, 8, 7, 6, 5] },
    { key: "delayed", label: "متأخرة", value: 28, change: 12, sparkline: [5, 6, 4, 7, 9, 8, 10] },
    { key: "revenue", label: "إجمالي الإيرادات", value: 362000, change: 9, sparkline: [42000, 48000, 51000, 46500, 58000, 61500, 55000] },
  ],
};

// ── العمود الجانبي: مركز العمليات (شحنات متأخرة/مشكلة/مندوبين/عملاء) ────────
export const mockOperationsCenter = {
  delayedShipments: [
    { id: 1, trackingNumber: "STK-10231", receiverName: "متجر النور", receiverCity: "القاهرة", delayedHours: 26 },
    { id: 2, trackingNumber: "STK-10188", receiverName: "بيوتي سنتر", receiverCity: "الجيزة", delayedHours: 14 },
    { id: 3, trackingNumber: "STK-10099", receiverName: "تك ستور", receiverCity: "الإسكندرية", delayedHours: 9 },
  ],
  problemShipments: [
    { id: 4, trackingNumber: "STK-10250", receiverName: "فاشون هب", receiverCity: "المنصورة" },
    { id: 5, trackingNumber: "STK-10241", receiverName: "سمارت شوب", receiverCity: "طنطا" },
  ],
  outToday: [{ id: 1 }],
  representatives: [
    { id: 1, displayName: "أحمد سعيد", activeShipments: 12, successRate: 96, isOnline: true, totalShipments: 210, deliveredShipments: 202 },
    { id: 2, displayName: "محمود جمال", activeShipments: 9, successRate: 92, isOnline: true, totalShipments: 187, deliveredShipments: 172 },
    { id: 3, displayName: "كريم عادل", activeShipments: 6, successRate: 88, isOnline: false, totalShipments: 165, deliveredShipments: 145 },
    { id: 4, displayName: "يوسف حسن", activeShipments: 4, successRate: 84, isOnline: true, totalShipments: 143, deliveredShipments: 120 },
  ],
  clientsNeedingFollowup: [
    { clientName: "فاشون هب", issueCount: 3, lastIssueAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
    { clientName: "سمارت شوب", issueCount: 2, lastIssueAt: new Date(Date.now() - 5 * 3600_000).toISOString() },
    { clientName: "تك ستور", issueCount: 1, lastIssueAt: new Date(Date.now() - 20 * 3600_000).toISOString() },
  ],
};

// ── توزيع الشحنات حسب الحالة ─────────────────────────────────────────────────
export const mockStatusDistribution = {
  distribution: [
    { status: "delivered", label: "تم التسليم", color: "#10b981", value: 1046 },
    { status: "inShipping", label: "قيد الشحن", color: "#0ea5e9", value: 158 },
    { status: "returned", label: "مرتجعة", color: "#f59e0b", value: 52 },
    { status: "delayed", label: "متأخرة", color: "#8b5cf6", value: 28 },
  ],
};

// ── أحدث التنبيهات ────────────────────────────────────────────────────────────
export const mockRecentEvents = {
  events: [
    { id: 1, label: "تم التسليم", receiverName: "متجر النور", shipmentNumber: "STK-10344", updatedAt: new Date(Date.now() - 8 * 60_000).toISOString() },
    { id: 2, label: "تأخير في الشحن", receiverName: "بيوتي سنتر", shipmentNumber: "STK-10188", updatedAt: new Date(Date.now() - 40 * 60_000).toISOString() },
    { id: 3, label: "رفض الاستلام", receiverName: "فاشون هب", shipmentNumber: "STK-10250", updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
    { id: 4, label: "خرجت للتوصيل", receiverName: "تك ستور", shipmentNumber: "STK-10360", updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString() },
  ],
};

// ── آخر الشحنات ───────────────────────────────────────────────────────────────
export const mockRecentShipments = {
  shipments: [
    { id: 1, trackingNumber: "STK-10344", clientName: "متجر النور", status: "تم التسليم", statusColor: "emerald", amount: 1250 },
    { id: 2, trackingNumber: "STK-10188", clientName: "بيوتي سنتر", status: "قيد الشحن", statusColor: "sky", amount: 890 },
    { id: 3, trackingNumber: "STK-10250", clientName: "فاشون هب", status: "مرتجعة", statusColor: "amber", amount: 640 },
    { id: 4, trackingNumber: "STK-10360", clientName: "تك ستور", status: "خرجت للتوصيل", statusColor: "sky", amount: 1120 },
    { id: 5, trackingNumber: "STK-10099", clientName: "سمارت شوب", status: "متأخرة", statusColor: "red", amount: 780 },
  ],
};

// ── ملخص الأرباح ──────────────────────────────────────────────────────────────
export const mockFinancialDashboard = {
  today: { netProfit: 19700 },
  month: { netProfit: 362000, operatingCost: 145000 },
};

// ── تنبيهات الذكاء الاصطناعي / العمليات ─────────────────────────────────────
export const mockOpsAlerts = {
  alerts: [
    { id: 1, type: "warning", title: "ارتفاع نسبة التأخير في الجيزة", detail: "9% من الشحنات متأخرة أكثر من المعتاد هذا الأسبوع" },
    { id: 2, type: "opportunity", title: "فرصة نمو مع متجر النور", detail: "زيادة الطلبات بنسبة 18% مقارنة بالشهر الماضي" },
    { id: 3, type: "critical", title: "مندوب بمعدل نجاح منخفض", detail: "كريم عادل: نسبة نجاح 88%، أقل من متوسط الفريق" },
  ],
};

// ── شاشة المدير التنفيذي ──────────────────────────────────────────────────────
export const mockExecutiveSummary = {
  revenue: 362000,
  profit: 96500,
  growthRate: 9,
  clientsCount: 214,
  shipmentsCount: 1284,
  successRate: 91,
  topArea: "القاهرة",
  nextMonthForecast: 398000,
};

// ── مؤشرات الأداء الدائرية ────────────────────────────────────────────────────
export const mockPerformanceMetrics = {
  metrics: [
    { key: "firstAttempt", label: "التسليم أول محاولة", value: 87, unit: "%", max: 100 },
    { key: "avgDeliveryTime", label: "متوسط وقت التوصيل", value: 34, unit: "ساعة" },
    { key: "returnRate", label: "نسبة المرتجعات", value: 4, unit: "%", max: 100 },
    { key: "delayRate", label: "نسبة التأخير", value: 9, unit: "%", max: 100 },
    { key: "avgRating", label: "متوسط تقييم العملاء", value: 92, unit: "%", max: 100 },
    { key: "avgPickupTime", label: "متوسط زمن الاستلام", value: 3, unit: "ساعة" },
  ],
};

// ── الخريطة المباشرة ──────────────────────────────────────────────────────────
export const mockLiveMap = {
  totalActiveCities: 6,
  totalActiveShipments: 158,
  cities: [
    { city: "القاهرة", lat: 30.0444, lng: 31.2357, activeShipments: 62, reps: 4 },
    { city: "الجيزة", lat: 30.0131, lng: 31.2089, activeShipments: 38, reps: 3 },
    { city: "الإسكندرية", lat: 31.2001, lng: 29.9187, activeShipments: 24, reps: 2 },
    { city: "المنصورة", lat: 31.0409, lng: 31.3785, activeShipments: 14, reps: 1 },
    { city: "طنطا", lat: 30.7865, lng: 31.0004, activeShipments: 12, reps: 1 },
    { city: "الزقازيق", lat: 30.5877, lng: 31.5022, activeShipments: 8, reps: 1 },
  ],
};

// ملحوظة: كل الكائنات أعلاه تُستخدم كـ initialData/fallback لصفحة مركز العمليات فقط.
// عند وصول بيانات حقيقية من الباك اند، react-query تستبدلها تلقائياً.
