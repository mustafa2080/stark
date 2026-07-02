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

// ملحوظة: "أفضل العملاء" و"أفضل المندوبين" أصبحا يستخدمان بيانات حقيقية
// من /analytics/top-performers

// ملحوظة: "مركز الذكاء الاصطناعي" أصبح يستخدم بيانات حقيقية من /analytics/ops-alerts
// ملحوظة: "جدول المندوبين اليومي" أصبح يستخدم بيانات حقيقية من /analytics/operations-center
// ملحوظة: "شاشة المدير التنفيذي" أصبحت تستخدم بيانات حقيقية من /analytics/executive-summary
