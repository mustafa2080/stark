// ══════════════════════════════════════════════════════════════════════════
// Operations Center — Mock Data (المرحلة 1: UI فقط، بدون API)
// عند ربط الـ API لاحقاً، استبدل الاستدعاءات هنا بـ react-query hooks
// ══════════════════════════════════════════════════════════════════════════

export const mockOverviewCards = [
  { key: "total",      label: "إجمالي الشحنات",  value: 1284, change: 8.2,  spark: [40,52,48,60,55,70,65,80] },
  { key: "delivered",  label: "تم التسليم",       value: 942,  change: 5.4,  spark: [30,35,40,42,50,55,60,65] },
  { key: "inShipping", label: "قيد التوصيل",      value: 213,  change: -2.1, spark: [50,48,45,44,40,38,35,33] },
  { key: "returned",   label: "مرتجعة",           value: 47,   change: 1.3,  spark: [10,12,11,13,14,12,15,14] },
  { key: "rating",     label: "متوسط التقييم",    value: 4.6,  change: 0.3,  spark: [4,4.2,4.1,4.3,4.4,4.5,4.5,4.6] },
  { key: "revenue",    label: "إجمالي الإيرادات", value: 386400, change: 12.7, spark: [200,220,250,270,300,320,350,386] },
];

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
export const mockActiveReps = [
  { name: "أحمد سعيد", area: "مدينة نصر", status: "متاح", load: 12 },
  { name: "محمود جابر", area: "المعادي", status: "في الطريق", load: 9 },
  { name: "كريم عادل", area: "6 أكتوبر", status: "متاح", load: 5 },
];
export const mockClientsNeedFollowup = [
  { name: "متجر الأمل", reason: "شكوى مرتجع", lastContact: "منذ يومين" },
  { name: "ستور بلس", reason: "تأخر سداد", lastContact: "منذ 3 أيام" },
];

// ── 2) لوحة الأرباح ──────────────────────────────────────────────────────────
export const mockFinancials = {
  todayProfit: 12400,
  monthProfit: 268500,
  operatingCost: 84200,
  costPerRep: [
    { name: "أحمد سعيد", cost: 4200 },
    { name: "محمود جابر", cost: 3800 },
    { name: "كريم عادل", cost: 3100 },
  ],
  costPerArea: [
    { area: "مدينة نصر", cost: 12100 },
    { area: "المعادي", cost: 9800 },
    { area: "6 أكتوبر", cost: 8700 },
  ],
  topClients: [
    { name: "متجر النور", profit: 42100 },
    { name: "بيوتي سنتر", profit: 35600 },
    { name: "تك ستور", profit: 28900 },
  ],
  lowClients: [
    { name: "فاشون هب", profit: 1200 },
    { name: "سمارت شوب", profit: 1800 },
  ],
};

// ── 3) مؤشرات الأداء (KPIs) ──────────────────────────────────────────────────
export const mockKpis = [
  { key: "firstAttempt", label: "التسليم أول محاولة", value: 87, suffix: "%" },
  { key: "avgDeliveryTime", label: "متوسط وقت التوصيل", value: 68, suffix: "% (1.4 يوم)" },
  { key: "returnRate", label: "نسبة المرتجعات", value: 4, suffix: "%" },
  { key: "delayRate", label: "نسبة التأخير", value: 9, suffix: "%" },
  { key: "avgRating", label: "متوسط تقييم العملاء", value: 92, suffix: "% (4.6/5)" },
  { key: "avgPickupTime", label: "متوسط زمن الاستلام", value: 74, suffix: "% (3 ساعات)" },
];

// ── 4) الذكاء الاصطناعي ──────────────────────────────────────────────────────
export const mockAiInsights = [
  { type: "warning", text: "متجر النور ارتفعت نسبة المرتجعات لديه إلى 28% هذا الأسبوع" },
  { type: "alert",   text: "منطقة مدينة نصر تعاني من تأخير ملحوظ اليوم" },
  { type: "info",    text: "المندوب أحمد سعيد هو الأعلى أداءً هذا الأسبوع" },
  { type: "opportunity", text: "فرصة زيادة الشحنات في المعادي بناءً على نمو الطلب" },
];

// ── 5) التنبيهات ─────────────────────────────────────────────────────────────
export const mockAlerts = [
  { id: 1, type: "delayed", text: "شحنة STK-10231 متأخرة 26 ساعة", time: "منذ 10 دقائق" },
  { id: 2, type: "rep",     text: "المندوب محمود جابر متأخر عن الجدول", time: "منذ 25 دقيقة" },
  { id: 3, type: "client",  text: "عميل جديد: فاشون هب", time: "منذ ساعة" },
  { id: 4, type: "returned",text: "شحنة STK-10188 تم إرجاعها", time: "منذ ساعتين" },
  { id: 5, type: "payment", text: "مشكلة دفع في فاتورة #4521", time: "منذ 3 ساعات" },
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

// ── 7) أفضل المندوبين (mock حالياً — سيُربط لاحقاً) ─────────────────────────
// ملحوظة: "أفضل العملاء" أصبح يستخدم بيانات حقيقية من /analytics/top-performers
export const mockTopReps = [
  { name: "أحمد سعيد", rating: 4.9, shipments: 312, successRate: 96 },
  { name: "محمود جابر", rating: 4.6, shipments: 268, successRate: 91 },
  { name: "كريم عادل", rating: 4.4, shipments: 201, successRate: 89 },
];

// ── 8) توزيع الشحنات حسب الحالة ──────────────────────────────────────────────
export const mockStatusDistribution = [
  { status: "تم التسليم", value: 942, color: "#10b981" },
  { status: "قيد التوصيل", value: 213, color: "#0ea5e9" },
  { status: "قيد الانتظار", value: 82,  color: "#f59e0b" },
  { status: "مرتجعة", value: 47,  color: "#ef4444" },
];

// ── 9) آخر الشحنات + جدول المندوبين اليومي ───────────────────────────────────
export const mockRecentShipments = [
  { id: "STK-10312", client: "متجر النور", status: "تم التسليم", statusColor: "emerald", amount: 850 },
  { id: "STK-10311", client: "بيوتي سنتر", status: "قيد التوصيل", statusColor: "sky", amount: 620 },
  { id: "STK-10310", client: "تك ستور", status: "قيد الانتظار", statusColor: "amber", amount: 410 },
  { id: "STK-10309", client: "فاشون هب", status: "مرتجعة", statusColor: "red", amount: 990 },
  { id: "STK-10308", client: "سمارت شوب", status: "تم التسليم", statusColor: "emerald", amount: 340 },
];
export const mockDailyReps = [
  { name: "أحمد سعيد", shipments: 18, delivered: 16, hours: "8 ساعات" },
  { name: "محمود جابر", shipments: 14, delivered: 12, hours: "7.5 ساعة" },
  { name: "كريم عادل", shipments: 11, delivered: 10, hours: "6 ساعات" },
];

// ── 10) شاشة المدير التنفيذي ──────────────────────────────────────────────────
export const mockExecutiveSummary = {
  revenue: 386400, profit: 268500, growthRate: 12.7,
  clientsCount: 214, shipmentsCount: 1284, successRate: 91,
  topArea: "مدينة نصر",
  nextMonthForecast: 421000,
};
