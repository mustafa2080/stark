import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: "super_admin" | "super-admin" | "admin" | "employee" | "warehouse" | "client" | "representative" | string;
  permissions: string[];
  isActive: boolean;
  planStatus?: "active" | "expired" | "suspended" | "grace";
  receiverClientId?: number | null;
  phone?: string | null;
  email?: string | null;
  avatar?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  sessionId: number | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isEmployee: boolean;
  isWarehouse: boolean;
  isRepresentative: boolean;
  isClient: boolean;
  can: (permission: string) => boolean;
  canViewFinancials: boolean;
  canViewProfitability: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "caprina_token";
const USER_KEY = "caprina_user";
const EDIT_BRAND_KEY = "edit_brand";

// polling كل 60 ثانية — تغييرات الصلاحيات تنعكس في دقيقة
const POLL_INTERVAL_MS = 60_000;

// عدد المرات المتتالية اللي ممكن يفشل فيها الـ polling قبل الـ logout
const MAX_POLL_FAILURES = 3;

// ══════════════════════════════════════════════════════════════════════
//  جميع مفاتيح الصلاحيات المتاحة في النظام
//  مقسّمة على 9 أقسام — يُستخدم هذا الكائن في users.tsx لعرضها
// ══════════════════════════════════════════════════════════════════════
export const ALL_PERMISSIONS = {
  // 1. لوحة التحكم
  dashboard: [
    { key: "dashboard.view",                  label: "رؤية لوحة التحكم",             desc: "الدخول الأساسي على الداشبورد" },
    // ── الحاويات الرئيسية (الكروت العلوية) ────────────────────────────
    { key: "dashboard.overview_kpis",         label: "رؤية نظرة عامة على الشحنات والإيرادات", desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.cash_registers",        label: "رؤية إجمالي أرصدة الخزن",      desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.status_distribution",   label: "رؤية توزيع الشحنات",            desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.weekly_shipments",      label: "رؤية الشحنات الأسبوعية",        desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.delayed_shipments",     label: "رؤية الشحنات المتأخرة",         desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.problem_shipments",     label: "رؤية الشحنات اللي فيها مشكلة",  desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.online_reps",           label: "رؤية المندوبين الموجودين حالياً", desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.clients_followup",      label: "رؤية العملاء المحتاجين متابعة", desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.live_map",              label: "رؤية الخريطة المباشرة",         desc: "إخفاء إذا لم يُمنح" },
    // ── حاويات اختيارية (مش ظاهرة إلا لو مُنحت صراحةً لاحقاً لو احتجنا) ──
    { key: "dashboard.performance_metrics",   label: "رؤية مؤشرات الأداء الخاصة بالشركة", desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.revenue_summary",       label: "رؤية ملخص الإيرادات",           desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.revenue_trend",         label: "رؤية اتجاه صافي الإيرادات",     desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.ai_center",             label: "رؤية مركز الذكاء الاصطناعي",    desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.top_clients",           label: "رؤية أفضل العملاء",             desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.top_reps",              label: "رؤية أفضل المندوبين",           desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.recent_events",         label: "رؤية أحدث التنبيهات",           desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.recent_shipments",      label: "رؤية آخر الشحنات",              desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.quick_actions",         label: "رؤية إجراءات سريعة",            desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.reps_daily_table",      label: "رؤية جدول المندوبين اليومي",    desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.executive_summary",     label: "رؤية شاشة المدير التنفيذي",     desc: "إخفاء إذا لم يُمنح" },
    // ── قديمة (deprecated) — نسيبها للتوافق مع مستخدمين قدامى ─────────
    { key: "dashboard.financials",     label: "بطاقات الأرباح والخسائر [قديم]",        desc: "متروكة للتوافق فقط" },
    { key: "dashboard.shipping_stats", label: "إحصائيات شركات الشحن [قديم]",          desc: "متروكة للتوافق فقط" },
    { key: "dashboard.returns",        label: "بطاقة المرتجعات [قديم]",                desc: "متروكة للتوافق فقط" },
    { key: "dashboard.team",           label: "قسم أداء الفريق [قديم]",                desc: "متروكة للتوافق فقط" },
  ],
  // 1.5. صفحة المخزون (حاويات داخلية)
  inventory_page: [
    // ── تاب "شحنات المخزن" ──────────────────────────────────────────
    { key: "inventory_page.tab_shipments",        label: "تاب: شحنات المخزن",              desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.warehouse_ready_card", label: "كارت: قيد الشحن في المخزن",       desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.returned_card",        label: "كارت: مرتجع",                    desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.delayed_card",         label: "كارت: مؤجل",                     desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.sla_card",             label: "كارت: تجاوزت الوقت الطبيعي",      desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.proactive_alerts",     label: "لوحة التنبيهات الاستباقية",       desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.cash_reconciliation",  label: "مطابقة الكاش مع شركات الشحن",     desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.shipments_table",      label: "جدول الشحنات الرئيسي",            desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.summary_footer",       label: "ملخص أسفل الجدول",                desc: "إخفاء إذا لم يُمنح" },
    // ── تاب "تحليلات" ────────────────────────────────────────────────
    { key: "inventory_page.tab_insights",         label: "تاب: تحليلات",                   desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.net_collected",        label: "كارت: صافي المحصّل",              desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.cod_pending",          label: "كارت: COD المعلق في الطريق",      desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.delivery_rate",        label: "كارت: معدل التسليم",              desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.return_rate",          label: "كارت: معدل الإرجاع",              desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.top_return_zones",     label: "أكثر مناطق الإرجاع",              desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.company_performance",  label: "أداء شركات الشحن",                desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.by_branch",            label: "الشحنات حسب الفرع",               desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.by_parcel_type",       label: "الشحنات حسب نوع الطرد",           desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.status_distribution",  label: "توزيع حالات الشحنات",             desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.financial_summary",    label: "الملخص المالي للشحنات",           desc: "إخفاء إذا لم يُمنح" },
    // ── تاب "أنواع الشحنات وأسعارها" ────────────────────────────────
    { key: "inventory_page.tab_parcel_types",       label: "تاب: أنواع الشحنات وأسعارها",   desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.parcel_types_count",     label: "كارت: إجمالي الأنواع",          desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.parcel_shipments_count", label: "كارت: الشحنات (كل الحالات)",    desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.parcel_total_revenue",   label: "كارت: إجمالي الإيرادات",        desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.parcel_price_range",     label: "كارت: نطاق الأسعار",            desc: "إخفاء إذا لم يُمنح" },
    { key: "inventory_page.parcel_types_table",     label: "جدول أنواع الطرود",             desc: "إخفاء إذا لم يُمنح" },
  ],
  // 2. الطلبات
  orders: [
    { key: "orders.view",       label: "رؤية الطلبات",            desc: "دخول صفحة الطلبات" },
    { key: "orders.create",     label: "إضافة طلب",               desc: "زر إضافة طلب جديد" },
    { key: "orders.edit",       label: "تعديل طلب",               desc: "تعديل بيانات طلب موجود" },
    { key: "orders.delete",     label: "حذف طلب",                 desc: "حذف طلب بشكل نهائي" },
    { key: "orders.financials",    label: "الأسعار داخل الطلب",      desc: "إظهار التكلفة والربح في الطلب" },
    { key: "orders.export",        label: "تصدير الطلبات",           desc: "تصدير Excel / PDF" },
    { key: "orders.profitability", label: "تحليل الربحية",           desc: "إظهار قسم تحليل الربحية في تفاصيل الطلب" },
  ],
  // 3. المنتجات والمخزون
  inventory: [
    { key: "inventory.view",       label: "رؤية المخزون",          desc: "دخول صفحة المخزون" },
    { key: "inventory.edit",       label: "تعديل الكميات",         desc: "تعديل وإضافة منتجات" },
    { key: "inventory.delete",     label: "حذف منتج",              desc: "حذف منتج من المخزون" },
    { key: "inventory.cost",       label: "تكلفة المنتجات",        desc: "إخفاء سعر التكلفة إذا لم يُمنح" },
    { key: "inventory.movements",  label: "حركات المخزون",         desc: "رؤية وإدارة الحركات" },
    { key: "inventory.warehouses", label: "إدارة المخازن",         desc: "إضافة وتعديل المخازن" },
  ],
  // 4. الشحن والتوصيل
  shipping: [
    { key: "shipping.view",       label: "رؤية شركات الشحن",      desc: "دخول صفحة الشحن" },
    { key: "shipping.edit",       label: "تعديل شركات الشحن",     desc: "تعديل الأسعار والبيانات" },
    { key: "shipping.financials", label: "تكاليف الشحن المالية",   desc: "إخفاء أرباح/تكاليف الشحن" },
    { key: "shipping.manifests",  label: "بوليصات الشحن",          desc: "إنشاء وتصدير البوليصات" },
  ],
  // 5. التحليلات
  analytics: [
    { key: "analytics.view",      label: "دخول التحليلات",         desc: "صفحة التحليلات العامة" },
    { key: "analytics.financial", label: "التحليلات المالية",       desc: "إخفاء أرقام الأرباح في التحليلات" },
    { key: "analytics.products",  label: "أداء المنتجات",           desc: "تحليل أداء المنتجات" },
    { key: "analytics.ads",       label: "تحليل الإعلانات",         desc: "ربط مصادر الإعلانات بالطلبات" },
    { key: "analytics.smart",     label: "التحليل الذكي",           desc: "التوصيات الذكية والتنبيهات" },
  ],
  // 5.5. صفحة التحليل الذكي (حاويات داخلية)
  smart_analytics_page: [
    { key: "smart_analytics.summary_bar",      label: "شريط الملخص العلوي",              desc: "إخفاء إذا لم يُمنح" },
    { key: "smart_analytics.ad_attribution",   label: "كارت: أفضل منصة إعلانية",         desc: "إخفاء إذا لم يُمنح" },
    { key: "smart_analytics.stars_deadstock",  label: "كارت: المنتجات النجوم والمخزون الراكد", desc: "إخفاء إذا لم يُمنح" },
    { key: "smart_analytics.return_insights",  label: "كارت: أسباب المرتجعات وتحذيراتها", desc: "إخفاء إذا لم يُمنح" },
    { key: "smart_analytics.stock_predictor",  label: "كارت: التنبؤ بالمخزون",           desc: "إخفاء إذا لم يُمنح" },
    { key: "smart_analytics.cash_flow",        label: "كارت: التدفق المالي",             desc: "إخفاء إذا لم يُمنح" },
    { key: "smart_analytics.ads_details_link", label: "زرار: تفاصيل الحملات",            desc: "إخفاء إذا لم يُمنح" },
  ],
  // 6. الماليات
  finance: [
    { key: "finance.view",      label: "دخول الماليات",            desc: "الصفحة الرئيسية للماليات" },
    { key: "finance.sales",     label: "المبيعات والفواتير",        desc: "تقارير وفواتير المبيعات" },
    { key: "finance.expenses",  label: "المصروفات",                 desc: "عرض وإدارة المصروفات" },
    { key: "finance.cash",      label: "الخزينة والصندوق",         desc: "إدارة الصندوق النقدي" },
    { key: "finance.suppliers", label: "الموردين والمشتريات",       desc: "حسابات الموردين" },
    { key: "finance.reports",   label: "تقارير الأرباح والخسائر",   desc: "التقارير المالية الشاملة" },
    { key: "finance.trip_settlement", label: "تسوية الرحلات والتحصيل", desc: "إدارة رحلات المناديب وتحصيل العملاء" },
  ],
  // 6.5. صفحة العملاء التجاريون (حاويات داخلية)
  finance_clients_page: [
    { key: "finance_clients.kpi_total_clients",     label: "كارت: إجمالي العملاء",           desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.kpi_monthly_collected",  label: "كارت: المحصّل هذا الشهر",        desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.kpi_total_outstanding",  label: "كارت: المستحق الإجمالي",         desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.kpi_total_shipments",    label: "كارت: إجمالي الشحنات",           desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.top_clients",            label: "كارت: أفضل العملاء",             desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.shipments_chart",        label: "كارت: الرسم البياني للشحنات",     desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.sales_report_link",      label: "كارت: تقرير المبيعات",           desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.clients_table",          label: "الجدول الرئيسي للعملاء",         desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.add_client_btn",         label: "زرار: إضافة عميل تجاري",         desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.edit_client_btn",        label: "زرار: تعديل عميل (بالجدول)",      desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.delete_client_btn",      label: "زرار: حذف عميل (بالجدول)",        desc: "إخفاء إذا لم يُمنح" },
    { key: "finance_clients.view_all_clients_btn",   label: "زرار: عرض جميع العملاء",         desc: "إخفاء إذا لم يُمنح" },
  ],
  // 7. الفريق والإدارة
  team: [
    { key: "team.view",        label: "رؤية أعضاء الفريق",         desc: "قائمة الموظفين" },
    { key: "team.performance", label: "أداء الفريق",               desc: "إحصائيات وتقارير الأداء" },
    { key: "team.manage",      label: "إدارة الفريق",              desc: "إضافة / تعديل / حذف أعضاء" },
    { key: "team.salaries",    label: "الرواتب والمدفوعات",         desc: "إخفاء الأرقام المالية للفريق" },
  ],
  // 8. الأدوات
  tools: [
    { key: "tools.import", label: "استيراد Excel",     desc: "رفع وقراءة ملفات البيانات" },
    { key: "tools.export", label: "تصدير البيانات",    desc: "تحميل البيانات بصيغ مختلفة" },
  ],
  // 9. الإعدادات والدعم
  settings: [
    { key: "settings.brand",    label: "تعديل البراند والشعار",     desc: "اسم النظام والشعار والألوان" },
    { key: "settings.users",    label: "إدارة المستخدمين",          desc: "إضافة وتعديل وحذف المستخدمين" },
    { key: "settings.audit",    label: "سجل التعديلات",             desc: "عرض تاريخ التعديلات" },
    { key: "settings.sessions", label: "تقرير الجلسات",             desc: "عرض جلسات تسجيل الدخول" },
    { key: "settings.whatsapp", label: "إعدادات واتساب",            desc: "ربط وتهيئة واتساب" },
  ],
} as const;

// مجموعة كل الـ keys في مصفوفة واحدة (مفيدة في can checks)
export type PermissionKey = typeof ALL_PERMISSIONS[keyof typeof ALL_PERMISSIONS][number]["key"];

// الصلاحيات الافتراضية لكل دور — تُستخدم فقط لو permissions فاضية تماماً
// (للمستخدمين القدامى اللي اتعملوا قبل نظام الصلاحيات)
const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: [
    // القديمة (للتوافق)
    "dashboard", "orders", "inventory", "movements", "shipping", "invoices",
    "import", "analytics", "users", "audit", "whatsapp", "finance",
    "view_financials", "edit_inventory", "edit_delete_inventory",
    "view_product_performance", "add_team_member", "edit_brand",
    "section_dashboard", "section_product_performance", "section_team_performance",
    "section_team_management", "section_smart_analytics", "section_ads_analytics",
    "section_orders", "section_new_order", "section_archive", "section_shipping_followup",
    "section_whatsapp", "section_inventory", "section_warehouses", "section_movements",
    "section_shipping", "section_invoices", "section_import", "section_export_data",
    "section_users", "section_sessions_report", "section_audit", "section_finance",
    // الجديدة
    "dashboard.view","dashboard.financials","dashboard.shipping_stats","dashboard.returns","dashboard.team",
    "dashboard.overview_kpis",
    "dashboard.cash_registers","dashboard.status_distribution","dashboard.weekly_shipments",
    "dashboard.delayed_shipments","dashboard.problem_shipments","dashboard.online_reps",
    "dashboard.clients_followup","dashboard.live_map","dashboard.performance_metrics",
    "dashboard.revenue_summary","dashboard.revenue_trend","dashboard.ai_center",
    "dashboard.top_clients","dashboard.top_reps","dashboard.recent_events",
    "dashboard.recent_shipments","dashboard.quick_actions","dashboard.reps_daily_table",
    "dashboard.executive_summary",
    "inventory_page.tab_shipments","inventory_page.warehouse_ready_card","inventory_page.returned_card",
    "inventory_page.delayed_card","inventory_page.sla_card","inventory_page.proactive_alerts",
    "inventory_page.cash_reconciliation","inventory_page.shipments_table","inventory_page.summary_footer",
    "inventory_page.tab_insights","inventory_page.net_collected","inventory_page.cod_pending",
    "inventory_page.delivery_rate","inventory_page.return_rate","inventory_page.top_return_zones",
    "inventory_page.company_performance","inventory_page.by_branch","inventory_page.by_parcel_type",
    "inventory_page.status_distribution","inventory_page.financial_summary",
    "inventory_page.tab_parcel_types","inventory_page.parcel_types_count","inventory_page.parcel_shipments_count",
    "inventory_page.parcel_total_revenue","inventory_page.parcel_price_range","inventory_page.parcel_types_table",
    "orders.view","orders.create","orders.edit","orders.delete","orders.financials","orders.export","orders.profitability",
    "inventory.view","inventory.edit","inventory.delete","inventory.cost","inventory.movements","inventory.warehouses",
    "shipping.view","shipping.edit","shipping.financials","shipping.manifests",
    "analytics.view","analytics.financial","analytics.products","analytics.ads","analytics.smart",
    "smart_analytics.summary_bar","smart_analytics.ad_attribution","smart_analytics.stars_deadstock",
    "smart_analytics.return_insights","smart_analytics.stock_predictor","smart_analytics.cash_flow",
    "smart_analytics.ads_details_link",
    "finance.view","finance.sales","finance.expenses","finance.cash","finance.suppliers","finance.reports","finance.trip_settlement",
    "finance_clients.kpi_total_clients","finance_clients.kpi_monthly_collected","finance_clients.kpi_total_outstanding",
    "finance_clients.kpi_total_shipments","finance_clients.top_clients","finance_clients.shipments_chart",
    "finance_clients.sales_report_link","finance_clients.clients_table","finance_clients.add_client_btn",
    "finance_clients.edit_client_btn","finance_clients.delete_client_btn","finance_clients.view_all_clients_btn",
    "team.view","team.performance","team.manage","team.salaries",
    "tools.import","tools.export",
    "settings.brand","settings.users","settings.audit","settings.sessions","settings.whatsapp",
  ],
  employee: [
    // القديمة
    "dashboard", "orders",
    "section_dashboard", "section_orders", "section_new_order",
    "section_archive", "section_shipping_followup",
    // الجديدة
    "dashboard.view",
    "orders.view","orders.create","orders.edit",
  ],
  warehouse: [
    // القديمة
    "dashboard", "inventory", "movements",
    "edit_inventory", "edit_delete_inventory",
    "section_dashboard", "section_inventory", "section_warehouses", "section_movements",
    // الجديدة
    "dashboard.view",
    "inventory.view","inventory.edit","inventory.movements","inventory.warehouses",
  ],
};

// مقارنة الـ permissions بغض النظر عن الترتيب
function permissionsChanged(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;
  const setA = new Set(a);
  return b.some((p) => !setA.has(p));
}

function flattenPermissions(raw: any): string[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch { return []; }
      if (!Array.isArray(raw)) return [];
    } else return [];
  }
  const flat: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") flat.push(item);
    else if (Array.isArray(item)) {
      for (const sub of item) { if (typeof sub === "string") flat.push(sub); }
    }
  }
  return [...new Set(flat)];
}

function normalizeUser(u: AuthUser): AuthUser {
  return {
    ...u,
    permissions: flattenPermissions(u.permissions).sort(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // لو في user محفوظ → نبدأ بـ false مباشرةً، مش محتاجين نستنى fetchMe
  const hasStoredUser = !!(
    typeof window !== "undefined" &&
    localStorage.getItem(TOKEN_KEY) &&
    localStorage.getItem(USER_KEY)
  );

  const getInitialUser = (): AuthUser | null => {
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser  = localStorage.getItem(USER_KEY);
      if (savedToken && savedUser) return normalizeUser(JSON.parse(savedUser) as AuthUser);
    } catch { /* ignore */ }
    return null;
  };

  const getInitialToken = (): string | null => localStorage.getItem(TOKEN_KEY);

  const [user, setUser]       = useState<AuthUser | null>(getInitialUser);
  const [token, setToken]     = useState<string | null>(getInitialToken);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(!hasStoredUser);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recordLogin = useCallback(
    async (tkn: string): Promise<number | null> => {
      try {
        const res = await fetch("/api/sessions/login", {
          method: "POST",
          headers: { Authorization: `Bearer ${tkn}`, "Content-Type": "application/json" },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.sessionId ?? null;
      } catch { return null; }
    }, []
  );

  const recordLogout = useCallback(async (tkn: string, sid: number) => {
    try {
      await fetch(`/api/sessions/${sid}/logout`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tkn}` },
      });
    } catch { /* silent */ }
  }, []);

  const logoutRef = useRef<() => void>(() => {});

  const logout = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tkn = localStorage.getItem(TOKEN_KEY);
    const sid = localStorage.getItem("caprina_session_id");
    if (tkn && sid) recordLogout(tkn, parseInt(sid));
    setToken(null); setUser(null); setSessionId(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("caprina_session_id");
  }, [recordLogout]);

  useEffect(() => { logoutRef.current = logout; }, [logout]);

  const fetchMe = useCallback(async (tkn: string): Promise<AuthUser | null> => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${tkn}` },
        cache: "no-store",
      });
      if (!res.ok) return null;
      return normalizeUser((await res.json()) as AuthUser);
    } catch { return null; }
  }, []);

  const refreshUser = useCallback(async () => {
    const tkn = localStorage.getItem(TOKEN_KEY);
    if (!tkn) return;
    const updated = await fetchMe(tkn);
    if (updated) {
      // نفس منطق الـ polling — نحدّث الـ state بس لو في تغيير فعلي
      setUser((prev) => {
        if (!prev) return normalizeUser(updated);
        const roleChanged    = prev.role !== updated.role;
        const activeChanged  = prev.isActive !== updated.isActive;
        const planChanged    = prev.planStatus !== updated.planStatus;
        const permsChanged   = permissionsChanged(prev.permissions, updated.permissions);
        const profileLinkChanged = (prev as any).showProfileLink !== (updated as any).showProfileLink;
        const avatarChanged  = prev.avatar !== updated.avatar;
        const nameChanged    = prev.displayName !== updated.displayName;
        if (!roleChanged && !activeChanged && !planChanged && !permsChanged && !profileLinkChanged && !avatarChanged && !nameChanged) return prev;
        const fresh = normalizeUser(updated);
        localStorage.setItem(USER_KEY, JSON.stringify(fresh));
        return { ...fresh };
      });
    }
  }, [fetchMe]);

  const pollFailuresRef = useRef(0);

  const startPolling = useCallback((tkn: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollFailuresRef.current = 0;
    pollRef.current = setInterval(async () => {
      const updated = await fetchMe(tkn);
      if (updated) {
        pollFailuresRef.current = 0; // reset عند النجاح
        setUser((prev) => {
          if (!prev) return normalizeUser(updated);
          const roleChanged    = prev.role !== updated.role;
          const activeChanged  = prev.isActive !== updated.isActive;
          const planChanged    = prev.planStatus !== updated.planStatus;
          const permsChanged   = permissionsChanged(prev.permissions, updated.permissions);
          const profileLinkChanged = (prev as any).showProfileLink !== (updated as any).showProfileLink;
          const avatarChanged  = prev.avatar !== updated.avatar;
          const nameChanged    = prev.displayName !== updated.displayName;
          if (!roleChanged && !activeChanged && !planChanged && !permsChanged && !profileLinkChanged && !avatarChanged && !nameChanged) return prev;
          const fresh = normalizeUser(updated);
          localStorage.setItem(USER_KEY, JSON.stringify(fresh));
          return { ...fresh };
        });
      } else {
        // نزيد عداد الفشل — نعمل logout بس لو فشل MAX_POLL_FAILURES مرات متتالية
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current >= MAX_POLL_FAILURES) {
          logoutRef.current();
        }
      }
    }, POLL_INTERVAL_MS);
  }, [fetchMe]);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as AuthUser;
        setToken(savedToken);
        setUser(normalizeUser(parsed));
        fetchMe(savedToken).then((fresh) => {
          if (fresh) {
            const normalized = normalizeUser(fresh);
            // نحدّث الـ state بس لو في تغيير فعلي — نمنع re-render زيادة عند الـ load
            setUser((prev) => {
              if (
                prev &&
                prev.role === normalized.role &&
                prev.isActive === normalized.isActive &&
                prev.planStatus === normalized.planStatus &&
                !permissionsChanged(prev.permissions, normalized.permissions)
              ) return prev;
              localStorage.setItem(USER_KEY, JSON.stringify(normalized));
              return normalized;
            });
          } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            setToken(null); setUser(null);
          }
          // loading بيبقى false من الأول لو في stored user — نحدّثه بس لو كان true
          setLoading(prev => prev ? false : prev);
        });
        startPolling(savedToken);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // استمع لـ 401 من apiFetch — اعمل logout بس لو التوكن منتهي فعلاً
  useEffect(() => {
    const handle401 = (e: Event) => {
      const path = (e as CustomEvent)?.detail?.path;
      const tkn = localStorage.getItem(TOKEN_KEY);
      if (!tkn) {
        // مفيش توكن أصلاً → logout
        console.warn("[handle401] no token in storage → logout", { path });
        logoutRef.current();
        return;
      }
      // تحقق من /auth/me — لو فشل فعلاً → logout، لو نجح → ignore (كان error مؤقت)
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${tkn}` }, cache: "no-store" })
        .then((r) => {
          if (!r.ok) {
            console.warn("[handle401] /auth/me also failed → logging out", { path, authMeStatus: r.status });
            logoutRef.current();
          } else {
            console.warn("[handle401] /auth/me OK, ignoring transient 401", { path });
          }
          // لو ok → ignore — الـ 401 كان في request تاني مش في الـ session
        })
        .catch((err) => {
          console.warn("[handle401] /auth/me network error, ignoring", { path, err });
          // network error → ignore, مش logout
        });
    };
    window.addEventListener("caprina:unauthorized", handle401);
    return () => window.removeEventListener("caprina:unauthorized", handle401);
  }, []);

  const login = useCallback(
    async (newToken: string, newUser: AuthUser) => {
      const normalized = normalizeUser(newUser);
      setToken(newToken);
      setUser({ ...normalized });
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(USER_KEY, JSON.stringify(normalized));
      startPolling(newToken);
      const sid = await recordLogin(newToken);
      if (sid) {
        setSessionId(sid);
        localStorage.setItem("caprina_session_id", String(sid));
      }
    },
    [startPolling, recordLogin]
  );

  // ─── can() — المنطق الصحيح للصلاحيات ──────────────────────────────────
  // الأولوية:
  // 1. لو "*" → كل الصلاحيات
  // 2. لو permissions فاضية تماماً → استخدم الافتراضية للدور (للمستخدمين القدامى)
  // 3. لو permissions موجودة → تحقق منها بشكل صريح (حتى للأدمن)
  const can = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      const rawPerms = flattenPermissions(user.permissions);

      // "*" يعني كل الصلاحيات
      if (rawPerms.includes("*")) return true;

      // "__customized__" marker = الـ permissions اتعدلت عمداً → مش نرجع للـ defaults أبداً
      // لو فاضية بدون marker = مستخدم قديم → نرجع للـ defaults
      const isCustomized = rawPerms.includes("__customized__");
      const realPerms = rawPerms.filter(p => p !== "__customized__" && !p.startsWith("__rolename__"));

      if (!isCustomized && realPerms.length === 0) {
        // مستخدم قديم مفيش عنده permissions — نرجع للـ defaults
        const defaults = ROLE_DEFAULT_PERMISSIONS[user.role] ?? [];
        return defaults.includes(permission);
      }

      if (isCustomized && realPerms.length === 0) {
        // اتعدل عمداً وشال كل حاجة → مفيش صلاحيات خالص
        return false;
      }

      // لو الـ permission مش بيحتوي نقطة (مثلاً "orders" أو "section_orders") →
      // يكفي وجود "orders" أو أي صلاحية تفصيلية تبدأ بـ "orders."
      if (!permission.includes(".")) {
        if (realPerms.includes(permission)) return true;
        return realPerms.some(p => p.startsWith(permission + "."));
      }

      // صلاحية تفصيلية (مثلاً "orders.view" أو "dashboard.xxx") — لازم تكون موجودة بالضبط (opt-in)
      return realPerms.includes(permission);
    },
    [user]
  );

  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.role === ("super-admin" as any);
  const isRepresentative = user?.role === "representative";
  const isClient = user?.role === "client";

  const canViewFinancials = isAdmin || can("orders.financials");
  const canViewProfitability = isAdmin || can("shipments.profitability");

  return (
    <AuthContext.Provider value={{
      user, token, sessionId, login, logout, refreshUser,
      isSuperAdmin: user?.role === "super_admin" || user?.role === ("super-admin" as any),
      isAdmin,
      isEmployee: user?.role === "employee",
      isWarehouse: user?.role === "warehouse",
      isRepresentative,
      isClient,
      can, canViewFinancials, canViewProfitability, loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
