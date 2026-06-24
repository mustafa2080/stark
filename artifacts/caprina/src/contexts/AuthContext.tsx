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
  role: "super_admin" | "super-admin" | "admin" | "employee" | "warehouse" | "client" | string;
  permissions: string[];
  isActive: boolean;
  planStatus?: "active" | "expired" | "suspended" | "grace";
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
    { key: "dashboard.view",           label: "دخول لوحة التحكم",               desc: "يشوف الصفحة الرئيسية" },
    { key: "dashboard.financials",     label: "بطاقات الأرباح والخسائر",        desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.shipping_stats", label: "إحصائيات شركات الشحن",          desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.returns",        label: "بطاقة المرتجعات",                desc: "إخفاء إذا لم يُمنح" },
    { key: "dashboard.team",           label: "قسم أداء الفريق",                desc: "إخفاء إذا لم يُمنح" },
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
  // 6. الماليات
  finance: [
    { key: "finance.view",      label: "دخول الماليات",            desc: "الصفحة الرئيسية للماليات" },
    { key: "finance.sales",     label: "المبيعات والفواتير",        desc: "تقارير وفواتير المبيعات" },
    { key: "finance.expenses",  label: "المصروفات",                 desc: "عرض وإدارة المصروفات" },
    { key: "finance.cash",      label: "الخزينة والصندوق",         desc: "إدارة الصندوق النقدي" },
    { key: "finance.suppliers", label: "الموردين والمشتريات",       desc: "حسابات الموردين" },
    { key: "finance.reports",   label: "تقارير الأرباح والخسائر",   desc: "التقارير المالية الشاملة" },
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
    "orders.view","orders.create","orders.edit","orders.delete","orders.financials","orders.export","orders.profitability",
    "inventory.view","inventory.edit","inventory.delete","inventory.cost","inventory.movements","inventory.warehouses",
    "shipping.view","shipping.edit","shipping.financials","shipping.manifests",
    "analytics.view","analytics.financial","analytics.products","analytics.ads","analytics.smart",
    "finance.view","finance.sales","finance.expenses","finance.cash","finance.suppliers","finance.reports",
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
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
        if (!roleChanged && !activeChanged && !planChanged && !permsChanged && !profileLinkChanged) return prev;
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
          if (!roleChanged && !activeChanged && !planChanged && !permsChanged && !profileLinkChanged) return prev;
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
            setUser({ ...normalized });
            localStorage.setItem(USER_KEY, JSON.stringify(normalized));
          } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            setToken(null); setUser(null);
          }
          setLoading(false);
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
    const handle401 = () => {
      const tkn = localStorage.getItem(TOKEN_KEY);
      if (!tkn) {
        // مفيش توكن أصلاً → logout
        logoutRef.current();
        return;
      }
      // تحقق من /auth/me — لو فشل فعلاً → logout، لو نجح → ignore (كان error مؤقت)
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${tkn}` }, cache: "no-store" })
        .then((r) => {
          if (!r.ok) logoutRef.current();
          // لو ok → ignore — الـ 401 كان في request تاني مش في الـ session
        })
        .catch(() => {
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
      // super_admin / super-admin عنده كل الصلاحيات دايماً
      if (user.role === "super_admin" || user.role === ("super-admin" as any)) return true;
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

      // صلاحية تفصيلية (مثلاً "orders.view") — لازم تكون موجودة بالضبط
      return realPerms.includes(permission);
    },
    [user]
  );

  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.role === ("super-admin" as any);

  const canViewFinancials = isAdmin || can("orders.financials");
  const canViewProfitability = isAdmin || can("orders.financials");

  return (
    <AuthContext.Provider value={{
      user, token, sessionId, login, logout, refreshUser,
      isSuperAdmin: user?.role === "super_admin" || user?.role === ("super-admin" as any),
      isAdmin,
      isEmployee: user?.role === "employee",
      isWarehouse: user?.role === "warehouse",
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
