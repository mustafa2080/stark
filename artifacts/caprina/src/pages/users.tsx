import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi, type AppUser } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { UserPlus, Edit2, Trash2, Shield, Users, Eye, EyeOff, TrendingUp, Package, BarChart3, LayoutGrid, Lock, User, Settings2, ChevronDown, ChevronUp, ToggleLeft, Camera, X, Crown, AlertTriangle, Search, KeyRound, Power, Home, ShoppingCart, Truck, BarChart2, Wallet, Wrench, Cog, MonitorCheck } from "lucide-react";

// helper محلي — نفس المنطق الموجود في AuthContext
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

// ── User Avatar Component ────────────────────────────────────────────────────
function getInitialsColor(name: string): string {
  const colors = [
    "from-violet-500 to-purple-600",
    "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-orange-500 to-amber-600",
    "from-rose-500 to-pink-600",
    "from-indigo-500 to-blue-600",
    "from-teal-500 to-emerald-600",
    "from-fuchsia-500 to-violet-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function UserAvatar({ avatar, name, size = "md" }: {
  avatar?: string | null; name: string; size?: "sm" | "md" | "lg";
}) {
  const sz    = size === "sm" ? "w-8 h-8 text-xs"    : size === "lg" ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm";
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  if (avatar) {
    return <img src={avatar} className={`${sz} rounded-full object-cover border-2 border-primary/20 shrink-0`} alt={name} />;
  }
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br ${getInitialsColor(name)} flex items-center justify-center font-bold text-white border-2 border-white/10 shrink-0`}>
      {initials}
    </div>
  );
}

// ── Avatar Upload Picker ─────────────────────────────────────────────────────
function AvatarUpload({ avatar, name, onChange }: {
  avatar: string; name: string; onChange: (val: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("الصورة أكبر من 2MB، اختار صورة أصغر"); return; }
    if (!file.type.startsWith("image/")) { setError("الملف ده مش صورة"); return; }
    setError("");
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground">صورة المستخدم</Label>
      <div className="flex items-center gap-4">
        {/* Preview */}
        <div className="relative group">
          <UserAvatar avatar={avatar || null} name={name || "U"} size="lg" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <Camera className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            اضغط على الصورة أو على زر الرفع لتغييرها
            <br />
            <span className="text-muted-foreground/60">الحد الأقصى 2MB — JPG أو PNG أو WebP</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg px-3 py-1.5 transition-all"
            >
              <Camera className="w-3 h-3" /> رفع صورة
            </button>
            {avatar && (
              <button
                type="button"
                onClick={() => { onChange(""); setError(""); }}
                className="flex items-center gap-1.5 text-xs bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 rounded-lg px-3 py-1.5 transition-all"
              >
                <X className="w-3 h-3" /> حذف
              </button>
            )}
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin 👑",
  admin: "مدير",
  employee: "موظف مبيعات",
  warehouse: "مسؤول مخزون",
  custom: "مخصص ⚙️",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "border-yellow-500 bg-yellow-900/30 text-yellow-300",
  admin: "border-yellow-700 bg-yellow-900/20 text-yellow-400",
  employee: "border-blue-700 bg-blue-900/20 text-blue-400",
  warehouse: "border-emerald-700 bg-emerald-900/20 text-emerald-400",
  custom: "border-primary/40 bg-primary/10 text-primary",
};

// ── ربط الصلاحيات بالـ section keys (module-level) ───────────────────────────
const PERM_TO_SECTION: Record<string, string> = {
  // لوحة التحكم
  "dashboard.view":            "section_dashboard",
  "dashboard.financials":      "section_dashboard",
  "dashboard.shipping_stats":  "section_dashboard",
  "dashboard.returns":         "section_dashboard",
  "dashboard.team":            "section_dashboard",
  // الطلبات
  "orders.view":               "section_orders",
  "orders.create":             "section_new_order",
  "orders.edit":               "section_orders",
  "orders.delete":             "section_orders",
  "orders.financials":         "section_orders",
  "orders.export":             "section_orders",
  "invoices.view":             "section_invoices",
  // المخزون
  "inventory.view":            "section_inventory",
  "inventory.edit":            "section_inventory",
  "inventory.delete":          "section_inventory",
  "inventory.cost":            "section_inventory",
  "inventory.movements":       "section_movements",
  "inventory.warehouses":      "section_warehouses",
  // الشحن
  "shipping.view":             "section_shipping",
  "shipping.edit":             "section_shipping",
  "shipping.financials":       "section_shipping",
  "shipping.manifests":        "section_shipping",
  // التحليلات
  "analytics.view":            "section_smart_analytics",
  "analytics.financial":       "section_smart_analytics",
  "analytics.products":        "section_product_performance",
  "analytics.ads":             "section_ads_analytics",
  "analytics.smart":           "section_smart_analytics",
  "analytics.team":            "section_team_management",
  // الماليات
  "finance.view":              "section_finance",
  "finance.sales":             "section_finance",
  "finance.expenses":          "section_finance",
  "finance.cash":              "section_finance",
  "finance.suppliers":         "section_finance",
  "finance.reports":           "section_finance",
  // الفريق
  "team.view":                 "section_team_management",
  "team.manage":               "section_team_management",
  "team.performance":          "section_team_performance",
  "team.salaries":             "section_team_management",
  // الأدوات
  "tools.import":              "section_import",
  "tools.export":              "section_export_data",
  // الإعدادات
  "settings.brand":            "section_dashboard",
  "settings.audit":            "section_audit",
  "settings.whatsapp":         "section_whatsapp",
  "settings.users":            "section_users",
  "settings.sessions":         "section_sessions_report",
};

// ── الصلاحية الأساسية لكل section — تُضاف تلقائياً لما الـ section يتفعّل ──
const SECTION_TO_PRIMARY_PERM: Record<string, string> = {
  "section_dashboard":           "dashboard.view",
  "section_orders":              "orders.view",
  "section_new_order":           "orders.create",
  "section_archive":             "orders.view",
  "section_shipping_followup":   "section_shipping_followup",
  "section_shipping":            "shipping.view",
  "section_inventory":           "inventory.view",
  "section_warehouses":          "inventory.warehouses",
  "section_movements":           "inventory.movements",
  "section_product_performance": "analytics.products",
  "section_smart_analytics":     "analytics.smart",
  "section_ads_analytics":       "analytics.ads",
  "section_team_management":     "team.view",
  "section_team_performance":    "team.performance",
  "section_finance":             "finance.view",
  "section_invoices":            "invoices.view",
  "section_import":              "tools.import",
  "section_export_data":         "tools.export",
  "section_users":               "settings.users",
  "section_sessions_report":     "settings.sessions",
  "section_audit":               "settings.audit",
  "section_whatsapp":            "settings.whatsapp",
};

// ── تعريف موحد لكل الأقسام المرئية — يُستخدم في تاب الأقسام و DEFAULT_PERMISSIONS ──
const ALL_SECTIONS: Array<{ key: string; label: string; icon: string; color: string; bg: string }> = [
  { key: "section_dashboard",           label: "لوحة التحكم",         icon: "🏠", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30" },
  { key: "section_orders",              label: "الطلبات",              icon: "📦", color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/30" },
  { key: "section_new_order",           label: "طلب جديد",             icon: "➕", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  { key: "section_archive",             label: "الأرشيف",              icon: "🗂️", color: "text-stone-400",   bg: "bg-stone-500/10 border-stone-500/30" },
  { key: "section_shipping_followup",   label: "متابعة الشحن",         icon: "⏱️", color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/30" },
  { key: "section_shipping",            label: "شركات الشحن",          icon: "🚚", color: "text-sky-400",     bg: "bg-sky-500/10 border-sky-500/30" },
  { key: "section_inventory",           label: "المنتجات والمخزون",    icon: "🏪", color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/30" },
  { key: "section_warehouses",          label: "المخازن",              icon: "🏭", color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/30" },
  { key: "section_movements",           label: "حركات المخزون",        icon: "🔄", color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/30" },
  { key: "section_product_performance", label: "أداء المنتجات",        icon: "📊", color: "text-pink-400",    bg: "bg-pink-500/10 border-pink-500/30" },
  { key: "section_smart_analytics",     label: "التحليل الذكي",        icon: "🧠", color: "text-fuchsia-400", bg: "bg-fuchsia-500/10 border-fuchsia-500/30" },
  { key: "section_ads_analytics",       label: "تحليل الإعلانات",      icon: "📣", color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/30" },
  { key: "section_team_management",     label: "إدارة الفريق",         icon: "👥", color: "text-lime-400",    bg: "bg-lime-500/10 border-lime-500/30" },
  { key: "section_team_performance",    label: "أداء الفريق",          icon: "🏆", color: "text-lime-300",    bg: "bg-lime-400/10 border-lime-400/30" },
  { key: "section_finance",             label: "الماليات",             icon: "💰", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  { key: "section_invoices",            label: "الفواتير",             icon: "🧾", color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/30" },
  { key: "section_import",              label: "استيراد Excel",        icon: "📤", color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
  { key: "section_export_data",         label: "تصدير البيانات",       icon: "📥", color: "text-orange-300",  bg: "bg-orange-400/10 border-orange-400/30" },
  { key: "section_users",               label: "إدارة المستخدمين",     icon: "🔐", color: "text-green-400",   bg: "bg-green-500/10 border-green-500/30" },
  { key: "section_sessions_report",     label: "تقرير الجلسات",        icon: "🕐", color: "text-slate-400",   bg: "bg-slate-500/10 border-slate-500/30" },
  { key: "section_audit",               label: "سجل العمليات",         icon: "🛡️", color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
  { key: "section_whatsapp",            label: "إعدادات واتساب",       icon: "💬", color: "text-[#25D366]",   bg: "bg-green-500/10 border-green-500/30" },
];

// ── Section Groups للـ Modal الجديد — 9 أقسام ────────────────────────────────
const SECTION_GROUPS: Array<{
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  permissions: Array<{ key: string; label: string; desc: string; sensitive?: boolean }>;
}> = [
  {
    id: "dashboard", label: "لوحة التحكم", color: "text-sky-400", bgColor: "bg-sky-500/10 border-sky-500/30",
    icon: <Home className="w-4 h-4" />,
    permissions: [
      { key: "dashboard.view",           label: "دخول لوحة التحكم",            desc: "يشوف الصفحة الرئيسية" },
      { key: "dashboard.financials",     label: "بطاقات الأرباح والخسائر",     desc: "إظهار إذا مُنح", sensitive: true },
      { key: "dashboard.shipping_stats", label: "إحصائيات شركات الشحن",       desc: "إخفاء إذا لم يُمنح" },
      { key: "dashboard.returns",        label: "بطاقة المرتجعات",             desc: "إخفاء إذا لم يُمنح" },
      { key: "dashboard.team",           label: "قسم أداء الفريق",             desc: "إخفاء إذا لم يُمنح" },
    ],
  },
  {
    id: "orders", label: "الطلبات", color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/30",
    icon: <ShoppingCart className="w-4 h-4" />,
    permissions: [
      { key: "orders.view",       label: "رؤية الطلبات",           desc: "دخول صفحة الطلبات" },
      { key: "orders.create",     label: "إضافة طلب",              desc: "زر إضافة طلب جديد" },
      { key: "orders.edit",       label: "تعديل طلب",              desc: "تعديل بيانات طلب موجود" },
      { key: "orders.delete",     label: "حذف طلب",                desc: "حذف طلب بشكل نهائي" },
      { key: "orders.financials",    label: "إظهار التكلفة والربح في الطلب", desc: "إظهار التكلفة والربح داخل الطلب", sensitive: true },
      { key: "orders.export",        label: "تصدير الطلبات",          desc: "تصدير Excel / PDF" },
      { key: "invoices.view",        label: "رؤية الفواتير",           desc: "دخول صفحة الفواتير" },
    ],
  },
  {
    id: "inventory", label: "المنتجات والمخزون", color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/30",
    icon: <Package className="w-4 h-4" />,
    permissions: [
      { key: "inventory.view",       label: "رؤية المخزون",         desc: "دخول صفحة المخزون" },
      { key: "inventory.edit",       label: "تعديل الكميات",        desc: "تعديل وإضافة منتجات" },
      { key: "inventory.delete",     label: "حذف منتج",             desc: "حذف منتج من المخزون" },
      { key: "inventory.cost", label: "إظهار سعر التكلفة", desc: "إظهار سعر التكلفة في المنتجات والمخزون", sensitive: true },
      { key: "inventory.movements",  label: "حركات المخزون",        desc: "رؤية وإدارة الحركات" },
      { key: "inventory.warehouses", label: "إدارة المخازن",        desc: "إضافة وتعديل المخازن" },
    ],
  },
  {
    id: "shipping", label: "الشحن والتوصيل", color: "text-purple-400", bgColor: "bg-purple-500/10 border-purple-500/30",
    icon: <Truck className="w-4 h-4" />,
    permissions: [
      { key: "shipping.view",       label: "رؤية شركات الشحن",     desc: "دخول صفحة الشحن" },
      { key: "shipping.edit",       label: "تعديل شركات الشحن",    desc: "تعديل الأسعار والبيانات" },
      { key: "shipping.financials", label: "تكاليف الشحن المالية",  desc: "إظهار إذا مُنح", sensitive: true },
      { key: "shipping.manifests",  label: "بوليصات الشحن",         desc: "إنشاء وتصدير البوليصات" },
    ],
  },
  {
    id: "analytics", label: "التحليلات", color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/30",
    icon: <BarChart2 className="w-4 h-4" />,
    permissions: [
      { key: "analytics.view",      label: "دخول التحليلات",        desc: "صفحة التحليلات العامة" },
      { key: "analytics.financial", label: "التحليلات المالية",      desc: "إظهار إذا مُنح", sensitive: true },
      { key: "analytics.products",  label: "أداء المنتجات",          desc: "تحليل أداء المنتجات" },
      { key: "analytics.ads",       label: "تحليل الإعلانات",        desc: "ربط مصادر الإعلانات بالطلبات" },
      { key: "analytics.smart",     label: "التحليل الذكي",          desc: "التوصيات الذكية والتنبيهات" },
      { key: "analytics.team",      label: "تحليلات الفريق",         desc: "إحصائيات وأداء أعضاء الفريق" },
    ],
  },
  {
    id: "finance", label: "الماليات", color: "text-rose-400", bgColor: "bg-rose-500/10 border-rose-500/30",
    icon: <Wallet className="w-4 h-4" />,
    permissions: [
      { key: "finance.view",      label: "دخول الماليات",           desc: "الصفحة الرئيسية للماليات", sensitive: true },
      { key: "finance.sales",     label: "المبيعات والفواتير",       desc: "تقارير وفواتير المبيعات", sensitive: true },
      { key: "finance.expenses",  label: "المصروفات",                desc: "عرض وإدارة المصروفات", sensitive: true },
      { key: "finance.cash",      label: "الخزينة والصندوق",        desc: "إدارة الصندوق النقدي", sensitive: true },
      { key: "finance.suppliers", label: "الموردين والمشتريات",      desc: "حسابات الموردين", sensitive: true },
      { key: "finance.reports",   label: "تقارير الأرباح والخسائر",  desc: "التقارير المالية الشاملة", sensitive: true },
    ],
  },
  {
    id: "team", label: "الفريق والإدارة", color: "text-teal-400", bgColor: "bg-teal-500/10 border-teal-500/30",
    icon: <Users className="w-4 h-4" />,
    permissions: [
      { key: "team.view",        label: "رؤية أعضاء الفريق",        desc: "قائمة الموظفين" },
      { key: "team.performance", label: "أداء الفريق",              desc: "إحصائيات وتقارير الأداء" },
      { key: "team.manage",      label: "إدارة الفريق",             desc: "إضافة / تعديل / حذف أعضاء" },
      { key: "team.salaries",    label: "الرواتب والمدفوعات",        desc: "إظهار إذا مُنح", sensitive: true },
    ],
  },
  {
    id: "tools", label: "الأدوات", color: "text-orange-400", bgColor: "bg-orange-500/10 border-orange-500/30",
    icon: <Wrench className="w-4 h-4" />,
    permissions: [
      { key: "tools.import", label: "استيراد Excel",    desc: "رفع وقراءة ملفات البيانات" },
      { key: "tools.export", label: "تصدير البيانات",   desc: "تحميل البيانات بصيغ مختلفة" },
    ],
  },
  {
    id: "settings", label: "الإعدادات والدعم", color: "text-slate-400", bgColor: "bg-slate-500/10 border-slate-500/30",
    icon: <Cog className="w-4 h-4" />,
    permissions: [
      { key: "settings.brand",    label: "تعديل البراند والشعار",    desc: "اسم النظام والشعار والألوان" },
      { key: "settings.users",    label: "إدارة المستخدمين",         desc: "إضافة وتعديل وحذف المستخدمين" },
      { key: "settings.audit",    label: "سجل التعديلات",            desc: "عرض تاريخ التعديلات" },
      { key: "settings.sessions", label: "تقرير الجلسات",            desc: "عرض جلسات تسجيل الدخول" },
      { key: "settings.whatsapp", label: "إعدادات واتساب",           desc: "ربط وتهيئة واتساب" },
    ],
  },
];

// ── Permission Templates ─────────────────────────────────────────────────────
const PERMISSION_TEMPLATES: Array<{
  key: string;
  label: string;
  icon: string;
  desc: string;
  color: string;
  permissions: string[];
}> = [
  {
    key: "custom",
    label: "مخصص",
    icon: "⚙️",
    desc: "ابدأ من صفر وحدد الصلاحيات يدوياً",
    color: "border-primary/40 bg-primary/5 text-primary",
    permissions: [],
  },
];

const DEFAULT_PERMISSIONS: Record<string, () => string[]> = {
  super_admin: () => ["*"],
  admin: () => [
    // صلاحيات لوحة التحكم
    "dashboard.view", "dashboard.financials", "dashboard.shipping_stats", "dashboard.returns", "dashboard.team",
    // صلاحيات الطلبات
    "orders.view", "orders.create", "orders.edit", "orders.delete", "orders.financials", "orders.export", "invoices.view",
    // صلاحيات المخزون
    "inventory.view", "inventory.edit", "inventory.delete", "inventory.cost", "inventory.movements", "inventory.warehouses",
    // صلاحيات الشحن
    "shipping.view", "shipping.edit", "shipping.financials", "shipping.manifests",
    // صلاحيات التحليلات
    "analytics.view", "analytics.financial", "analytics.products", "analytics.ads", "analytics.smart",
    // صلاحيات الماليات
    "finance.view", "finance.sales", "finance.expenses", "finance.cash", "finance.suppliers", "finance.reports",
    // صلاحيات الفريق
    "team.view", "team.performance", "team.manage", "team.salaries",
    // صلاحيات الأدوات
    "tools.import", "tools.export",
    // صلاحيات الإعدادات
    "settings.brand", "settings.users", "settings.audit", "settings.sessions", "settings.whatsapp",
    // الأقسام المرئية — مولّدة تلقائياً من ALL_SECTIONS
    ...ALL_SECTIONS.map(s => s.key),
  ],
  employee: () => ["dashboard.view", "orders.view", "section_dashboard", "section_orders", "section_new_order", "section_archive", "section_shipping_followup"],
  warehouse: () => ["dashboard.view", "inventory.view", "inventory.edit", "inventory.movements", "inventory.warehouses", "section_dashboard", "section_inventory", "section_warehouses", "section_movements"],
};

interface UserForm {
  username: string;
  password: string;
  displayName: string;
  role: string;
  permissions: string[];
  avatar: string;
  jobTitle: string;
  department: string;
  showProfileLink: boolean;
  defaultAdSource: string;
}

const AD_SOURCES = [
  { value: "facebook",  label: "فيسبوك" },
  { value: "tiktok",    label: "تيك توك" },
  { value: "instagram", label: "إنستجرام" },
  { value: "whatsapp",  label: "واتساب" },
  { value: "organic",   label: "ويبسايت" },
  { value: "other",     label: "أخرى" },
];

const emptyForm = (): UserForm => ({
  username: "", password: "", displayName: "",
  role: "employee", permissions: DEFAULT_PERMISSIONS["employee"]?.() ?? [],
  avatar: "", jobTitle: "", department: "", showProfileLink: true, defaultAdSource: "",
});

export default function UsersPage() {
  const { user: currentUser, isAdmin, refreshUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [modalTab, setModalTab] = useState<string>("account");
  const [showPassword, setShowPassword] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customRoleName, setCustomRoleName] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTION_GROUPS.map(g => [g.id, true]))
  );

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
  });

  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setDialogOpen(false); toast({ title: "تم إضافة المستخدم" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => usersApi.update(id, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
      setResetPasswordOpen(false);
      toast({ title: "تم تحديث المستخدم بنجاح" });
      refreshUser();
    },
    onError: (e: any) => toast({ title: "خطأ في الحفظ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: usersApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast({ title: "تم حذف المستخدم" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => { setEditingUser(null); setForm(emptyForm()); setShowPassword(false); setDialogOpen(true); };

  // تحويل الصلاحيات القديمة للجديدة تلقائياً
  const migrateOldPermissions = (perms: string[]): string[] => {
    const legacyMap: Record<string, string[]> = {
      "dashboard":              ["dashboard.view"],
      "orders":                 ["orders.view"],
      "inventory":              ["inventory.view"],
      "movements":              ["inventory.movements", "section_movements"],
      "shipping":               ["shipping.view"],
      "invoices":               ["finance.sales", "section_invoices"],
      "import":                 ["tools.import", "section_import"],
      "analytics":              ["analytics.view"],
      "users":                  ["settings.users", "section_users"],
      "audit":                  ["settings.audit", "section_audit"],
      "whatsapp":               ["settings.whatsapp", "section_whatsapp"],
      "finance":                ["finance.view", "section_finance"],
      "orders_write":           ["orders.create", "orders.edit", "orders.delete"],
      "view_financials":        ["dashboard.financials", "orders.financials", "analytics.financial"],
      "edit_inventory":         ["inventory.edit"],
      "edit_delete_inventory":  ["inventory.delete"],
      "view_product_performance":["analytics.products", "section_product_performance"],
      "add_team_member":        ["team.manage"],
      "edit_brand":             ["settings.brand"],
    };
    const result = new Set<string>();
    perms.forEach(p => {
      if (legacyMap[p]) legacyMap[p].forEach(np => result.add(np));
      else result.add(p);
    });
    return Array.from(result);
  };

  const expandPermissions = (perms: string[], role: string): string[] => {
    const clean = perms
      .map(p => (typeof p === "string" ? p : null))
      .filter((p): p is string => p !== null && p.trim() !== "");
    if (clean.includes("*")) return DEFAULT_PERMISSIONS[role]?.() ?? DEFAULT_PERMISSIONS["admin"]!();
    if (clean.length === 0)  return DEFAULT_PERMISSIONS[role]?.() ?? [];
    // migrate قديمة → جديدة
    return migrateOldPermissions(clean);
  };

  const openEdit = (u: AppUser) => {
    setEditingUser(u);
    const rawPerms = Array.isArray(u.permissions) ? u.permissions : [];
    setForm({
      username: u.username,
      password: "",
      displayName: u.displayName,
      role: u.role,
      permissions: expandPermissions(rawPerms, u.role),
      avatar: (u as any).avatar ?? "",
      jobTitle: (u as any).jobTitle ?? "",
      department: (u as any).department ?? "",
      showProfileLink: (u as any).showProfileLink ?? true,
      defaultAdSource: (u as any).defaultAdSource ?? "",
    });
    setShowPassword(false);
    // استخرج الـ customRoleName من الـ permissions markers
    const rawPermsForEdit = flattenPermissions((u as any).permissions ?? []);
    const roleNameMarker = rawPermsForEdit.find(p => p.startsWith("__rolename__"));
    const savedCustomName = roleNameMarker ? roleNameMarker.replace("__rolename__", "") : ((u as any).customRoleName ?? "");
    setSelectedTemplate(savedCustomName ? "custom" : null);
    setCustomRoleName(savedCustomName);
    setModalTab("account");
    setDialogOpen(true);
  };

  const handleRoleChange = (role: string) => {
    // لو مخصص محدد، نحافظ على الصلاحيات المخصصة ونغير الـ role بس
    if (selectedTemplate === "custom") {
      setForm(f => ({ ...f, role }));
    } else {
      setForm(f => ({ ...f, role, permissions: DEFAULT_PERMISSIONS[role]?.() ?? [] }));
      setSelectedTemplate(null);
      setCustomRoleName("");
    }
  };

  const applyTemplate = (templateKey: string) => {
    const tmpl = PERMISSION_TEMPLATES.find(t => t.key === templateKey);
    if (!tmpl) return;
    setSelectedTemplate(templateKey);
    if (tmpl.key === "custom") {
      // مخصص = role يبقى "custom" في الـ DB + ابدأ من صفر في الصلاحيات
      setForm(f => ({ ...f, role: "custom", permissions: [] }));
    } else {
      setForm(f => ({ ...f, permissions: tmpl.permissions }));
    }
  };

  const togglePermission = (key: string) => setForm(f => {
    const has = f.permissions.includes(key);
    let perms = has ? f.permissions.filter(p => p !== key) : [...f.permissions, key];

    // لو الصلاحية مرتبطة بـ section → نضيف/نشيل الـ section تلقائياً
    const section = PERM_TO_SECTION[key];
    if (section) {
      if (!has) {
        // أضفنا الصلاحية → نضيف الـ section لو مش موجود
        if (!perms.includes(section)) perms = [...perms, section];
      } else {
        // شلنا الصلاحية → نشيل الـ section لو مفيش صلاحية تانية تحتاجه
        const otherPermsNeedSection = Object.entries(PERM_TO_SECTION)
          .filter(([k, v]) => v === section && k !== key)
          .some(([k]) => perms.includes(k));
        if (!otherPermsNeedSection) perms = perms.filter(p => p !== section);
      }
    }

    return { ...f, permissions: perms };
  });

  // لما section يتشال → اشيل كل الصلاحيات المرتبطة بيه تلقائياً
  // لما section يتضاف → ضيفه + الـ primary permission تلقائياً
  const toggleSection = (sectionKey: string) => setForm(f => {
    const isOn = f.permissions.includes(sectionKey);
    if (isOn) {
      // شيل الـ section + كل الصلاحيات المرتبطة بيه
      const linkedPerms = Object.entries(PERM_TO_SECTION)
        .filter(([, v]) => v === sectionKey)
        .map(([k]) => k);
      return {
        ...f,
        permissions: f.permissions.filter(p => p !== sectionKey && !linkedPerms.includes(p)),
      };
    } else {
      // ضيف الـ section + الـ primary permission المقابلة تلقائياً
      const primaryPerm = SECTION_TO_PRIMARY_PERM[sectionKey];
      const toAdd = [sectionKey];
      if (primaryPerm && primaryPerm !== sectionKey && !f.permissions.includes(primaryPerm)) {
        toAdd.push(primaryPerm);
      }
      return { ...f, permissions: [...f.permissions, ...toAdd] };
    }
  });

  const handleSubmit = () => {
    if (!form.displayName.trim()) { toast({ title: "خطأ", description: "الاسم مطلوب", variant: "destructive" }); return; }

    // نضيف marker عشان نعرف إن الـ permissions اتعدلت عمداً (مش fallback للـ defaults)
    let permsWithMarker = form.permissions.includes("__customized__")
      ? form.permissions
      : ["__customized__", ...form.permissions];

    // لو مخصص، نحفظ اسم الوظيفة جوا الـ permissions كـ marker
    // أولاً: نشيل أي __rolename__ قديم
    permsWithMarker = permsWithMarker.filter(p => !p.startsWith("__rolename__"));
    // لو فيه customRoleName نضيفه (بغض النظر عن الـ template)
    if (customRoleName.trim()) {
      permsWithMarker = [...permsWithMarker, `__rolename__${customRoleName.trim()}`];
    }

    if (editingUser) {
      const data: any = {
        displayName: form.displayName,
        role: form.role,
        permissions: permsWithMarker,
        avatar: form.avatar || null,
        jobTitle: form.jobTitle || null,
        department: form.department || null,
        showProfileLink: form.showProfileLink,
        defaultAdSource: form.defaultAdSource || null,
      };
      if (form.password) data.password = form.password;
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      if (!form.username.trim()) { toast({ title: "خطأ", description: "اسم المستخدم مطلوب", variant: "destructive" }); return; }
      if (form.password.length < 6) { toast({ title: "خطأ", description: "كلمة المرور 6 أحرف على الأقل", variant: "destructive" }); return; }
      createMutation.mutate({
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim(),
        role: form.role,
        permissions: permsWithMarker,
        avatar: form.avatar || undefined,
        jobTitle: form.jobTitle || undefined,
        department: form.department || undefined,
      } as any);
    }
  };

  const handleDelete = (u: AppUser) => {
    if (!confirm(`حذف المستخدم "${u.displayName}"؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;
    deleteMutation.mutate(u.id);
  };

  const handleToggleActive = (u: AppUser) => updateMutation.mutate({ id: u.id, data: { isActive: !u.isActive } });

  const filteredUsers = users.filter(u => {
    const matchSearch = searchQuery === "" ||
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const roleCounts = {
    all: users.length,
    super_admin: users.filter(u => u.role === "super_admin").length,
    admin: users.filter(u => u.role === "admin").length,
    employee: users.filter(u => u.role === "employee").length,
    warehouse: users.filter(u => u.role === "warehouse").length,
    custom: users.filter(u => u.role === "custom").length,
  };

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" />
            </div>
            إدارة المستخدمين
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 mr-10">{users.length} مستخدم — تحكم في الأدوار والصلاحيات</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="h-9 text-xs sm:text-sm font-bold gap-1.5 shrink-0">
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">إضافة مستخدم</span>
            <span className="sm:hidden">إضافة</span>
          </Button>
        )}
      </div>

      {/* ── Search + Filter ── */}
      <div className="mb-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="ابحث بالاسم أو اسم المستخدم..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-9 h-9 text-sm bg-muted/30 border-border/60"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Role filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: "all", label: "الكل" },
            { key: "super_admin", label: "👑 Super Admin" },
            { key: "admin", label: "مدير" },
            { key: "employee", label: "موظف" },
            { key: "warehouse", label: "مخزون" },
            { key: "custom", label: "⚙️ مخصص" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterRole(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                filterRole === tab.key
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/60"
              }`}
            >
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                filterRole === tab.key ? "bg-white/20" : "bg-muted"
              }`}>
                {roleCounts[tab.key as keyof typeof roleCounts] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 rounded-2xl border border-border/40 bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا يوجد مستخدمون مطابقون</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredUsers.map(u => {
            const isSuperAdmin = u.role === "super_admin";
            const canManage = !isSuperAdmin || currentUser?.role === "super_admin";
            const isMe = u.id === currentUser?.id;

            return (
              <div
                key={u.id}
                className={`relative rounded-2xl border p-4 flex flex-col gap-3 transition-all group ${
                  u.isActive
                    ? "border-border bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                    : "border-border/30 bg-muted/10 opacity-55"
                } ${isSuperAdmin ? "border-yellow-500/30 bg-yellow-500/5" : ""}`}
              >
                {/* ── Status dot ── */}
                <div className={`absolute top-3 left-3 w-2 h-2 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-red-500"}`} title={u.isActive ? "نشط" : "معطل"} />

                {/* ── Top row: avatar + badges ── */}
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <UserAvatar avatar={(u as any).avatar} name={u.displayName} size="lg" />
                    {isSuperAdmin && (
                      <span className="absolute -top-1 -right-1 text-sm">👑</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black text-sm truncate">{u.displayName}</span>
                      {isMe && <Badge variant="outline" className="text-[9px] border-primary/50 text-primary px-1.5">أنت</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">@{u.username}</p>
                    <Badge variant="outline" className={`mt-1.5 text-[10px] font-bold ${ROLE_COLORS[u.role]}`}>
                      {(() => {
                        const perms = flattenPermissions((u as any).permissions ?? []);
                        const marker = perms.find(p => p.startsWith("__rolename__"));
                        return marker ? marker.replace("__rolename__", "") : ROLE_LABELS[u.role];
                      })()}
                    </Badge>
                  </div>
                </div>

                {/* ── Permission chips ── */}
                <div className="flex flex-wrap gap-1 min-h-[20px]">
                  {isSuperAdmin ? (
                    <span className="text-[10px] text-yellow-400 font-bold">كل الصلاحيات ✦</span>
                  ) : (
                    <>
                      {(u.permissions?.includes("orders.financials") || u.permissions?.includes("finance.view") || u.role === "admin") && (
                        <Badge variant="outline" className="text-[9px] font-bold border-amber-600/40 bg-amber-500/10 text-amber-500 gap-1 px-1.5"><TrendingUp className="w-2.5 h-2.5" />الأرباح</Badge>
                      )}
                      {(u.permissions?.includes("inventory.edit") || u.role === "admin") && (
                        <Badge variant="outline" className="text-[9px] font-bold border-emerald-600/40 bg-emerald-500/10 text-emerald-500 gap-1 px-1.5"><Package className="w-2.5 h-2.5" />المخزون</Badge>
                      )}
                      {(u.permissions?.includes("analytics.products") || u.role === "admin") && (
                        <Badge variant="outline" className="text-[9px] font-bold border-blue-600/40 bg-blue-500/10 text-blue-500 gap-1 px-1.5"><BarChart3 className="w-2.5 h-2.5" />الأداء</Badge>
                      )}
                      {u.permissions?.includes("orders.edit") && (
                        <Badge variant="outline" className="text-[9px] font-bold border-violet-600/40 bg-violet-500/10 text-violet-500 gap-1 px-1.5"><Edit2 className="w-2.5 h-2.5" />تعديل الطلبات</Badge>
                      )}
                    </>
                  )}
                </div>

                {/* ── Divider ── */}
                <div className="border-t border-border/40" />

                {/* ── Action buttons ── */}
                <div className="flex items-center gap-1.5">
                  {canManage ? (
                    <>
                      {/* تفعيل/تعطيل */}
                      <button
                        onClick={() => !isMe && handleToggleActive(u)}
                        disabled={isMe}
                        title={u.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                          isMe ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:opacity-80"
                        } ${u.isActive
                          ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-500"
                          : "border-red-600/40 bg-red-500/10 text-red-500"
                        }`}
                      >
                        <Power className="w-2.5 h-2.5" />
                        {u.isActive ? "نشط" : "معطل"}
                      </button>

                      <div className="flex-1" />

                      {/* تعديل */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                        onClick={() => openEdit(u)}
                        title="تعديل"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>

                      {/* حذف */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(u)}
                        disabled={isMe}
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-yellow-500/60 font-bold">
                      <Lock className="w-3 h-3" /> محمي — Super Admin فقط
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="bg-[#0f0f11] border border-white/[0.07] w-[96vw] max-w-2xl p-0 overflow-hidden flex flex-col gap-0 rounded-2xl shadow-2xl"
          dir="rtl"
          style={{ maxHeight: "92dvh" }}
        >
          <DialogTitle className="sr-only">{editingUser ? "تعديل مستخدم" : "إضافة مستخدم جديد"}</DialogTitle>
          <DialogDescription className="sr-only">نموذج إدارة بيانات وصلاحيات المستخدم</DialogDescription>
          {/* ── Hero Header ── */}
          <div className="relative shrink-0 overflow-hidden">
            {/* gradient bg */}
            <div className="absolute inset-0 bg-gradient-to-bl from-primary/20 via-primary/5 to-transparent pointer-events-none" />
            <div className="absolute top-0 left-0 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />

            <div className="relative flex items-center gap-4 px-6 py-5">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-primary/30 shadow-lg shadow-primary/20">
                  <UserAvatar avatar={form.avatar || null} name={form.displayName || form.username || "U"} size="lg" />
                </div>
                <button
                  type="button"
                  onClick={() => (document.getElementById("modal-avatar-input") as HTMLInputElement)?.click()}
                  className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-md hover:bg-primary/80 transition-colors"
                >
                  <Camera className="w-2.5 h-2.5 text-primary-foreground" />
                </button>
                <input
                  id="modal-avatar-input" type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file || file.size > 2 * 1024 * 1024) return;
                    const reader = new FileReader();
                    reader.onload = () => setForm(f => ({ ...f, avatar: reader.result as string }));
                    reader.readAsDataURL(file);
                  }}
                />
              </div>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {editingUser
                    ? <><Edit2 className="w-3.5 h-3.5 text-primary" /><span className="text-[10px] font-bold text-primary uppercase tracking-widest">تعديل مستخدم</span></>
                    : <><UserPlus className="w-3.5 h-3.5 text-primary" /><span className="text-[10px] font-bold text-primary uppercase tracking-widest">مستخدم جديد</span></>
                  }
                </div>
                <h2 className="text-base font-black text-white truncate">
                  {form.displayName || form.username || "بدون اسم"}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${ROLE_COLORS[form.role] || "border-border text-muted-foreground"}`}>
                    {ROLE_LABELS[form.role] || form.role}
                  </span>
                  {form.permissions.length > 0 && form.role !== "super_admin" && (
                    <span className="text-[9px] text-muted-foreground">{form.permissions.length} صلاحية</span>
                  )}
                </div>
              </div>

              {/* Close */}
              <button
                onClick={() => setDialogOpen(false)}
                className="shrink-0 w-8 h-8 rounded-xl border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white hover:border-white/30 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ── Tab Bar ── */}
            {(() => {
              const tabs = [
                { id: "account",  icon: <User className="w-3.5 h-3.5" />,       label: "الحساب" },
                { id: "role",     icon: <Shield className="w-3.5 h-3.5" />,      label: "الدور" },
                ...( form.role !== "super_admin" ? [{ id: "sections", icon: <LayoutGrid className="w-3.5 h-3.5" />, label: "الأقسام" }] : [] ),
                ...( form.role !== "super_admin" ? [{ id: "perms",    icon: <KeyRound className="w-3.5 h-3.5" />,   label: "الصلاحيات" }] : [] ),
              ];
              const active = modalTab || "account";
              const activeIdx = tabs.findIndex(t => t.id === active);
              return (
                <div className="flex border-t border-white/[0.06] bg-white/[0.02]">
                  {tabs.map((tab, idx) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => editingUser && setModalTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold transition-all border-b-2
                        ${active === tab.id
                          ? "border-primary text-primary bg-primary/5"
                          : editingUser
                            ? "border-transparent text-muted-foreground hover:text-white hover:bg-white/[0.03]"
                            : idx < activeIdx
                              ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/5 cursor-pointer"
                              : "border-transparent text-muted-foreground opacity-40 cursor-default"}`}
                    >
                      {idx < activeIdx && !editingUser
                        ? <span className="text-emerald-400">✓</span>
                        : tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* ── Tab Content ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {(() => {
              const tab = modalTab || "account";

              /* ────── TAB: الحساب ────── */
              if (tab === "account") return (
                <div className="space-y-5">
                  {/* Name + Username */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground font-semibold">الاسم الكامل *</Label>
                      <Input
                        className="h-10 text-sm bg-white/[0.04] border-white/[0.08] focus:border-primary/50 rounded-xl"
                        value={form.displayName}
                        onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                        placeholder="أحمد محمد"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground font-semibold">اسم المستخدم *</Label>
                      <Input
                        className="h-10 text-sm bg-white/[0.04] border-white/[0.08] focus:border-primary/50 rounded-xl font-mono"
                        value={form.username}
                        onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))}
                        placeholder="ahmed123"
                        disabled={!!editingUser}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      {editingUser ? "كلمة مرور جديدة (اتركها فارغة للإبقاء على القديمة)" : "كلمة المرور *"}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        className="h-10 text-sm bg-white/[0.04] border-white/[0.08] focus:border-primary/50 rounded-xl pl-10"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        placeholder={editingUser ? "••••••••" : "6 أحرف على الأقل"}
                      />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Avatar hint */}
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <Camera className="w-4 h-4 text-primary/70 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-white/80">صورة الملف الشخصي</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">اضغط على الأيقونة في الأعلى لتغيير الصورة — PNG أو JPG بحد أقصى 2MB</p>
                    </div>
                  </div>

                  {/* Job Title + Department */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground font-semibold">المسمى الوظيفي</Label>
                      <Input
                        className="h-10 text-sm bg-white/[0.04] border-white/[0.08] focus:border-primary/50 rounded-xl"
                        value={form.jobTitle}
                        onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                        placeholder="مسؤول مبيعات"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground font-semibold">القسم</Label>
                      <Input
                        className="h-10 text-sm bg-white/[0.04] border-white/[0.08] focus:border-primary/50 rounded-xl"
                        value={form.department}
                        onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                        placeholder="المبيعات"
                      />
                    </div>
                  </div>

                  {/* مصدر الإعلان الافتراضي */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground font-semibold">مصدر الإعلان الافتراضي</Label>
                    <p className="text-[10px] text-muted-foreground/70 -mt-0.5">عند اختيار هذا الموظف كـ"الموظف المسؤول" في شحنة جديدة، سيتم تعبئة هذا المصدر تلقائياً</p>
                    <select
                      className="w-full h-10 text-sm bg-white/[0.04] border border-white/[0.08] focus:border-primary/50 rounded-xl px-3 text-white"
                      value={form.defaultAdSource}
                      onChange={e => setForm(f => ({ ...f, defaultAdSource: e.target.value }))}
                    >
                      <option value="" className="bg-background">— غير محدد —</option>
                      {AD_SOURCES.map(s => (
                        <option key={s.value} value={s.value} className="bg-background">{s.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* إظهار لينك البروفايل */}
                  <div
                    className="flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition-colors"
                    style={{ borderColor: form.showProfileLink ? "hsl(var(--primary)/0.4)" : "hsl(var(--border)/0.5)", background: form.showProfileLink ? "hsl(var(--primary)/0.06)" : "hsl(var(--muted)/0.3)" }}
                    onClick={() => setForm(f => ({ ...f, showProfileLink: !f.showProfileLink }))}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center border-2 transition-all"
                        style={{ borderColor: form.showProfileLink ? "hsl(var(--primary))" : "hsl(var(--border))", background: form.showProfileLink ? "hsl(var(--primary))" : "transparent" }}
                      >
                        {form.showProfileLink && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-semibold">إظهار لينك البروفايل</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{form.showProfileLink ? "ظاهر في القائمة" : "مخفي من القائمة"}</span>
                  </div>
                </div>
              );

              /* ────── TAB: الدور ────── */
              if (tab === "role") return (
                <div className="space-y-5">
                  {/* Role cards */}
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">اختر الدور الوظيفي</p>
                    <div className={`grid gap-3 ${currentUser?.role === "super_admin" ? "grid-cols-2" : "grid-cols-3"}`}>
                      {(currentUser?.role === "super_admin"
                        ? ["super_admin", "admin", "employee", "warehouse"]
                        : ["admin", "employee", "warehouse"]
                      ).map(role => (
                        <button key={role} type="button" onClick={() => handleRoleChange(role)}
                          className={`flex flex-col items-center gap-2 py-4 rounded-2xl border-2 text-xs font-bold transition-all
                            ${form.role === role
                              ? ROLE_COLORS[role] + " scale-[1.04] shadow-lg"
                              : "border-white/[0.07] text-muted-foreground hover:border-white/20 bg-white/[0.02]"}`}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${form.role === role ? "bg-current/10" : "bg-white/[0.05]"}`}>
                            {role === "super_admin" && <Crown className="w-4.5 h-4.5" />}
                            {role === "admin"       && <Shield className="w-4.5 h-4.5" />}
                            {role === "employee"    && <User className="w-4.5 h-4.5" />}
                            {role === "warehouse"   && <Package className="w-4.5 h-4.5" />}
                          </div>
                          {ROLE_LABELS[role]}
                        </button>
                      ))}
                    </div>
                    {form.role === "super_admin" && (
                      <div className="mt-3 flex items-center gap-2.5 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                        <p className="text-[10px] text-yellow-500/90">Super Admin له كل الصلاحيات تلقائياً ولا يمكن تقييدها</p>
                      </div>
                    )}
                  </div>

                  {/* Templates */}
                  {form.role !== "super_admin" && (
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">نوع الدور</p>
                      <div className="space-y-2">
                        {/* زرار مخصص */}
                        <button
                          type="button"
                          onClick={() => applyTemplate("custom")}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-right transition-all
                            ${selectedTemplate === "custom"
                              ? "border-primary/40 bg-primary/5 text-primary scale-[1.01] shadow-md"
                              : "border-white/[0.07] bg-white/[0.02] hover:border-white/20 text-muted-foreground"}`}
                        >
                          <span className="text-lg leading-none">⚙️</span>
                          <div className="flex-1 text-right">
                            <span className="text-xs font-black block">مخصص</span>
                            <span className="text-[10px] opacity-70">ابدأ من صفر وحدد الصلاحيات يدوياً</span>
                          </div>
                          {selectedTemplate === "custom" && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">✓</span>
                          )}
                        </button>

                        {/* input اسم الدور المخصص */}
                        {selectedTemplate === "custom" && (
                          <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <label className="text-[10px] font-bold text-muted-foreground block mb-1.5">اسم الدور المخصص</label>
                            <input
                              type="text"
                              value={customRoleName}
                              onChange={e => setCustomRoleName(e.target.value)}
                              placeholder="مثال: مشرف مبيعات، محاسب، ..."
                              className="w-full h-9 px-3 text-sm rounded-xl border border-white/10 bg-white/[0.04] text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-white/[0.06] transition-all"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );

              /* ────── TAB: الأقسام المرئية ────── */
              if (tab === "sections") {
                const allOn = ALL_SECTIONS.every(s => form.permissions.includes(s.key));
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">الأقسام المرئية في القائمة الجانبية</p>
                      <button type="button"
                        onClick={() => {
                          const keys = ALL_SECTIONS.map(s => s.key);
                          if (allOn) {
                            // شيل كل الـ sections + صلاحياتهم
                            const allLinked = Object.entries(PERM_TO_SECTION)
                              .filter(([, v]) => keys.includes(v))
                              .map(([k]) => k);
                            setForm(f => ({ ...f, permissions: f.permissions.filter(k => !keys.includes(k) && !allLinked.includes(k)) }));
                          } else {
                            setForm(f => ({ ...f, permissions: [...new Set([...f.permissions, ...keys])] }));
                          }
                        }}
                        className="text-[9px] px-2 py-0.5 rounded-full border border-white/10 text-muted-foreground hover:border-white/30 hover:text-white transition-all"
                      >{allOn ? "إخفاء الكل" : "إظهار الكل"}</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_SECTIONS.map(sec => {
                        const isOn = form.permissions.includes(sec.key);
                        return (
                          <button key={sec.key} type="button"
                            onClick={() => toggleSection(sec.key)}
                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-right transition-all ${isOn ? sec.bg : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"}`}
                          >
                            <span className="text-base leading-none shrink-0">{sec.icon}</span>
                            <span className={`text-[11px] font-bold flex-1 ${isOn ? sec.color : "text-muted-foreground"}`}>{sec.label}</span>
                            <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${isOn ? "border-current bg-current/20" : "border-white/20"}`}>
                              {isOn && <div className="w-2 h-2 rounded-full bg-current" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center">القسم المُفعَّل يظهر في القائمة الجانبية للمستخدم — المُعطَّل يختفي تلقائياً</p>
                  </div>
                );
              }

              /* ────── TAB: الصلاحيات — 9 أقسام ────── */
              if (tab === "perms") return (
                <div className="space-y-3">
                  {/* Header summary */}
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      الصلاحيات التفصيلية
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground">
                        {form.permissions.filter(p => p.includes(".")).length} صلاحية محددة
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const allKeys = SECTION_GROUPS.flatMap(g => g.permissions.map(p => p.key));
                          const allOn = allKeys.every(k => form.permissions.includes(k));
                          if (allOn) setForm(f => ({ ...f, permissions: f.permissions.filter(k => !allKeys.includes(k)) }));
                          else       setForm(f => ({ ...f, permissions: [...new Set([...f.permissions, ...allKeys])] }));
                        }}
                        className="text-[9px] px-2 py-0.5 rounded-full border border-white/10 text-muted-foreground hover:border-white/30 hover:text-white transition-all"
                      >
                        {SECTION_GROUPS.flatMap(g => g.permissions.map(p => p.key)).every(k => form.permissions.includes(k)) ? "إلغاء الكل" : "تحديد الكل"}
                      </button>
                    </div>
                  </div>

                  {/* 9 Section Groups */}
                  {SECTION_GROUPS.map(group => {
                    const groupKeys = group.permissions.map(p => p.key);
                    const allOn  = groupKeys.every(k => form.permissions.includes(k));
                    const someOn = groupKeys.some(k => form.permissions.includes(k));
                    const [open, setOpen] = [
                      openGroups[group.id] ?? true,
                      (v: boolean) => setOpenGroups(g => ({ ...g, [group.id]: v })),
                    ];
                    const toggleAll = () => {
                      if (allOn) setForm(f => ({ ...f, permissions: f.permissions.filter(k => !groupKeys.includes(k)) }));
                      else       setForm(f => ({ ...f, permissions: [...new Set([...f.permissions, ...groupKeys])] }));
                    };
                    return (
                      <div key={group.id} className="rounded-2xl border border-white/[0.07] overflow-hidden">
                        {/* Group Header */}
                        <div
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                            ${open ? "bg-white/[0.04] border-b border-white/[0.06]" : "bg-white/[0.02] hover:bg-white/[0.04]"}`}
                          onClick={() => setOpen(!open)}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${group.bgColor} ${group.color}`}>
                            {group.icon}
                          </div>
                          <span className={`text-xs font-black flex-1 ${group.color}`}>{group.label}</span>
                          {/* status pill */}
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); toggleAll(); }}
                            className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold transition-colors shrink-0
                              ${allOn  ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                              : someOn ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                                       : "bg-white/[0.06] text-muted-foreground hover:bg-white/10"}`}
                          >
                            {allOn ? "✓ الكل" : someOn ? "جزئي" : "لا شيء"}
                          </button>
                          {open
                            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        </div>

                        {/* Permissions list */}
                        {open && (
                          <div className="divide-y divide-white/[0.04]">
                            {group.permissions.map(perm => {
                              const active = form.permissions.includes(perm.key);
                              return (
                                <label
                                  key={perm.key}
                                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                                    ${active ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => togglePermission(perm.key)}
                                    className="w-4 h-4 rounded shrink-0 accent-primary"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-white/90">{perm.label}</span>
                                      {perm.sensitive && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-400 shrink-0">
                                          حساسة
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{perm.desc}</p>
                                  </div>
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${active ? "bg-emerald-500" : "bg-white/10"}`} />
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );

              return null;
            })()}
          </div>

          {/* ── Footer ── */}
          {(() => {
            const tabs = [
              { id: "account" },
              { id: "role" },
              ...( form.role !== "super_admin" ? [{ id: "sections" }] : [] ),
              ...( form.role !== "super_admin" ? [{ id: "perms" }] : [] ),
            ];
            const active = modalTab || "account";
            const activeIdx = tabs.findIndex(t => t.id === active);
            const isLast = activeIdx === tabs.length - 1;
            const isFirst = activeIdx === 0;

            return (
              <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-t border-white/[0.07] bg-white/[0.02]">
                <Button
                  variant="outline"
                  className="h-10 px-5 text-sm border-white/[0.1] bg-transparent hover:bg-white/[0.05] text-muted-foreground hover:text-white rounded-xl"
                  onClick={() => {
                    if (!editingUser && !isFirst) {
                      setModalTab(tabs[activeIdx - 1].id);
                    } else {
                      setDialogOpen(false);
                    }
                  }}
                >
                  {!editingUser && !isFirst ? "← السابق" : "إلغاء"}
                </Button>

                {/* في وضع التعديل: زرار حفظ واحد فقط */}
                {editingUser ? (
                  <Button
                    className="flex-1 h-10 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                    onClick={handleSubmit}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending
                      ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />جاري الحفظ...</span>
                      : <span className="flex items-center gap-2"><Shield className="w-4 h-4" />حفظ التعديلات</span>
                    }
                  </Button>
                ) : isLast ? (
                  /* آخر تاب → زرار إنشاء مستخدم */
                  <Button
                    className="flex-1 h-10 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                    onClick={handleSubmit}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending
                      ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />جاري الإنشاء...</span>
                      : <span className="flex items-center gap-2"><UserPlus className="w-4 h-4" />إنشاء المستخدم</span>
                    }
                  </Button>
                ) : (
                  /* مش آخر تاب → زرار التالي */
                  <Button
                    className="flex-1 h-10 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                    onClick={() => setModalTab(tabs[activeIdx + 1].id)}
                  >
                    <span className="flex items-center gap-2">التالي →</span>
                  </Button>
                )}
              </div>
            );
          })()}

        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent className="bg-card border-border w-[95vw] max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إعادة تعيين كلمة المرور</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">تغيير كلمة مرور: <span className="font-bold text-foreground">{resetTarget?.displayName}</span></p>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} className="h-9 text-sm bg-background pl-9" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)" />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 h-9 text-sm font-bold" onClick={() => {
                if (resetTarget && newPassword.length >= 6) { updateMutation.mutate({ id: resetTarget.id, data: { password: newPassword } }); setNewPassword(""); }
                else toast({ title: "خطأ", description: "كلمة المرور 6 أحرف على الأقل", variant: "destructive" });
              }} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "جاري الحفظ..." : "تغيير"}
              </Button>
              <Button variant="outline" className="h-9 text-sm" onClick={() => setResetPasswordOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
