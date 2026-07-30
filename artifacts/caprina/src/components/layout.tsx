import { Link, useLocation } from "wouter";
import { useState, useMemo, useRef, useEffect } from "react";
import { firstLogoBase64 } from "@/lib/first-logo";
import { secondLogoBase64 } from "@/lib/second-logo";
import { LayoutDashboard, Package, Plus, Boxes, Truck, FileText, Upload, Activity, BarChart3, Users, Shield, LogOut, ChevronDown, KeyRound, Warehouse, Megaphone, UserCheck, UserCog, Sun, Moon, Brain, Archive, Clock, MessageCircle, Menu, X, Download, DollarSign, Receipt, Wallet, ChevronLeft, Crown, Settings, PanelRightClose, PanelRightOpen, User, MapPin, Layers, Navigation, RotateCcw } from "lucide-react";
import { BrandFull, BrandLogoMark } from "@/components/brand-logo";
import { BrandSettingsDialog } from "@/components/brand-settings-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { authApi, appSettingsApi, apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── أيقونة واتساب الحقيقية ────────────────────────────────────────────────────
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

interface LayoutProps {
  children: React.ReactNode;
}

// ── زر سداسي ذهبي بارز في نص الـ bottom nav — "شحنة جديدة" ────────────────────
function HexActionButton({ href, label = "شحنة جديدة" }: { href: string; label?: string }) {
  return (
    <Link href={href}>
      <div className="flex flex-col items-center -mt-6 relative z-10">
        <div
          className="w-14 h-14 flex items-center justify-center transition-all duration-200 active:scale-90"
          style={{
            clipPath: "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)",
            background: "linear-gradient(145deg, #f9d976 0%, #e8b93f 45%, #b8860b 100%)",
            boxShadow: "0 0 0 3px rgba(5,5,5,1), 0 4px 18px rgba(232,185,63,0.55), 0 0 24px rgba(232,185,63,0.35)",
          }}
        >
          <Plus style={{ width: "22px", height: "22px", color: "#0a0a0a" }} strokeWidth={3} />
        </div>
        <span className="mt-1" style={{ fontSize: "9px", fontWeight: 700, color: "rgba(232,185,63,0.9)" }}>{label}</span>
      </div>
    </Link>
  );
}

const ALL_NAV = [
  { href: "/my-dashboard",      label: "لوحتي",              icon: LayoutDashboard, exact: true, permission: null, section: null, employeeOnly: true,  iconColor: "text-emerald-400",    group: "dashboard"    },
  { href: "/operations-center", label: "لوحة التحكم",       icon: Layers,          exact: true, permission: "section_dashboard",       section: "section_dashboard",          iconColor: "text-emerald-400",    group: "dashboard"    },
  { href: "/finance/clients",   label: "العملاء التجاريون",   icon: UserCheck,                   permission: "finance.view",            section: "section_dashboard",          iconColor: "text-cyan-400",       group: "clients_business" },
  { href: "/shipments-list",    label: "الشحنات",             icon: Package,                     permission: "orders.view",             section: "section_orders",             iconColor: "text-orange-400",     group: "orders"       },
  { href: "/shipments/new",     label: "شحنة جديدة",            icon: Plus,                        permission: "orders.create",           section: "section_new_order",          iconColor: "text-emerald-400",    group: "orders"       },
  { href: "/invoices",          label: "فواتير الشحن",             icon: FileText,                    permission: "invoices.view",           section: "section_invoices",           iconColor: "text-yellow-400",     group: "orders"       },
  { href: "/shipping-followup", label: "متابعة الشحنات",        icon: Clock,                       permission: "section_shipping_followup", section: "section_shipping_followup",  iconColor: "text-cyan-400",       group: "orders"       },
  { href: "/shipping",          label: "مناديب STARK",         icon: Truck,                       permission: "shipping.view",           section: "section_shipping",           iconColor: "text-sky-400",        group: "shipping"     },
  { href: "/inventory",         label: "المخزون",               icon: Boxes,        permission: "inventory.view",          section: "section_inventory",          iconColor: "text-violet-400",     group: "inventory"    },
  { href: "/shipments",         label: "المناطق",             icon: MapPin,          exact: true, permission: "section_dashboard",       section: "section_dashboard",          iconColor: "text-cyan-400",       group: "zones"        },
  { href: "/warehouses",        label: "المخازن",               icon: Warehouse,    permission: "inventory.view",          section: "section_warehouses",         iconColor: "text-indigo-400",     group: "inventory"    },
  { href: "/movements",         label: "حركات المخزون",       icon: Activity,                    permission: "inventory.movements",     section: "section_movements",          iconColor: "text-purple-400",     group: "inventory"    },
  { href: "/product-performance",label: "أداء الشحنات",      icon: BarChart3,                   permission: "analytics.products",      section: "section_product_performance", iconColor: "text-pink-400",      group: "analytics"    },
  { href: "/smart",             label: "التحليل الذكي",       icon: Brain,                       permission: "analytics.smart",         section: "section_smart_analytics",    iconColor: "text-fuchsia-400",    group: "analytics"    },
  { href: "/ads-analytics",     label: "تحليل الإعلانات",    icon: Megaphone,                   permission: "analytics.ads",           section: "section_ads_analytics",      iconColor: "text-rose-400",       group: "analytics"    },
  { href: "/finance/cash/analytics", label: "تحليل الماليات الذكي", icon: Brain,                  permission: "analytics.smart",         section: "section_smart_analytics",    iconColor: "text-teal-400",       group: "analytics"    },
  { href: "/sessions-report",   label: "تقارير الجلسات",      icon: Clock,                       permission: "settings.sessions",       section: "section_sessions_report",    iconColor: "text-slate-400",      group: "analytics"    },
  { href: "/team",              label: "إدارة الفريق",        icon: UserCog,                     permission: "team.view",               section: "section_team_management",    iconColor: "text-lime-400",       group: "team",         exact: true },
  { href: "/team-performance",  label: "أداء فريق المبيعات",         icon: UserCheck,                   permission: "team.performance",        section: "section_team_management",    iconColor: "text-lime-300",       group: "team"         },
  { href: "/users",             label: "إدارة المستخدمين",   icon: Users,                       permission: "settings.users",          section: "section_users",              iconColor: "text-green-400",      group: "team"         },
  { href: "/audit-logs",        label: "سجل العمليات",        icon: Shield,                      permission: "settings.audit",          section: "section_audit",              iconColor: "text-red-400",        group: "team"         },
  { href: "/import",            label: "استيراد Excel",       icon: Upload,                      permission: "tools.import",            section: "section_import",             iconColor: "text-amber-400",      group: "tools"        },
  { href: "/export",            label: "تصدير البيانات",      icon: Download,                    permission: "tools.export",            section: "section_export_data",        iconColor: "text-orange-300",     group: "tools"        },
  { href: "/archive",           label: "الأرشيف",             icon: Archive,                     permission: "section_archive",         section: "section_archive",            iconColor: "text-stone-400",      group: "tools"        },
  { href: "/clients-showcase",  label: "عملاؤنا",             icon: Users,                       permission: "section_dashboard",       section: "section_dashboard",          iconColor: "text-purple-400",     group: "tools"        },
  { href: "/whatsapp",          label: "إعدادات واتساب",     icon: WhatsAppIcon,                permission: "settings.whatsapp",       section: "section_whatsapp",           iconColor: "text-[#25D366]",      group: "settings"     },
  { href: "/audit-logs",        label: "سجل التعديلات",       icon: Shield,                      permission: "settings.audit",          section: "section_audit",              iconColor: "text-red-400",        group: "settings"     },
];

const FINANCE_NAV = [
  { href: "/finance/client-account-sheet", label: "حسابات العملاء", icon: UserCheck,    iconColor: "text-cyan-400"     },
  { href: "/finance/cash",              label: "الخزنة",             icon: Wallet,       iconColor: "text-yellow-400"   },
  { href: "/finance",                   label: "لوحة الماليات",     icon: DollarSign,   iconColor: "text-emerald-400"  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير", employee: "موظف مبيعات", warehouse: "مسؤول مخزون", custom: "مخصص",
};

function getRoleLabel(user: any): string {
  if (!user) return "";
  const perms: string[] = Array.isArray(user.permissions) ? user.permissions : [];
  const marker = perms.find((p: string) => p.startsWith("__rolename__"));
  if (marker) return marker.replace("__rolename__", "");
  return ROLE_LABELS[user.role ?? ""] ?? user.role ?? "";
}

function NavItem({ item, location, sub = false, collapsed = false }: { item: any; location: string; sub?: boolean; collapsed?: boolean }) {
  const basePath = item.href.split("?")[0];
  const isActive = item.exact
    ? location === basePath
    : location === basePath || location.startsWith(basePath + "/") || (basePath !== "/" && location.startsWith(basePath));
  const Icon = item.icon;
  const rgb = resolveRgb(item.iconColor ?? "text-blue-400");
  const hasQuery = item.href.includes("?");
  return (
    <Link href={item.href}
      onClick={hasQuery ? (e: React.MouseEvent) => { e.preventDefault(); window.location.href = item.href; } : undefined}      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg text-[11.5px] font-semibold transition-all duration-300 group",
        collapsed ? "px-0 py-2 justify-center" : "px-3 py-2",
        sub && !collapsed && "mr-2",
        isActive ? "text-white" : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90 hover:bg-white/[0.04]"
      )}
      style={isActive ? {
        background: collapsed ? `rgba(${rgb},0.15)` : `linear-gradient(135deg, rgba(${rgb},0.18) 0%, rgba(${rgb},0.07) 100%)`,
        border: `1px solid rgba(${rgb},0.25)`,
        boxShadow: `0 1px 8px rgba(${rgb},0.15), inset 0 1px 0 rgba(255,255,255,0.06)`,
      } : { border: "1px solid transparent" }}
    >
      <div className="shrink-0 flex items-center justify-center" style={{
        width: "28px", height: "28px", borderRadius: "8px",
        background: isActive ? `linear-gradient(145deg, rgba(${rgb},0.85) 0%, rgba(${rgb},0.45) 100%)` : `linear-gradient(145deg, rgba(${rgb},0.15) 0%, rgba(${rgb},0.06) 100%)`,
        border: isActive ? `1px solid rgba(${rgb},0.5)` : `1px solid rgba(${rgb},0.12)`,
        boxShadow: isActive ? `0 3px 10px rgba(${rgb},0.35), inset 0 1px 0 rgba(255,255,255,0.15)` : `0 1px 4px rgba(${rgb},0.1)`,
      }}>
        <Icon style={{ width: "13px", height: "13px", color: isActive ? "rgba(255,255,255,0.95)" : `rgba(${rgb},0.75)` }} />
      </div>
      {!collapsed && <span className="flex-1 text-right overflow-hidden whitespace-nowrap">{item.label}</span>}
    </Link>
  );
}

function resolveRgb(iconColor: string): string {
  if (iconColor.includes("orange"))  return "251,146,60";
  if (iconColor.includes("sky"))     return "56,189,248";
  if (iconColor.includes("violet"))  return "167,139,250";
  if (iconColor.includes("pink"))    return "244,114,182";
  if (iconColor.includes("fuchsia")) return "232,121,249";
  if (iconColor.includes("emerald")) return "52,211,153";
  if (iconColor.includes("teal"))    return "45,212,191";
  if (iconColor.includes("cyan"))    return "34,211,238";
  if (iconColor.includes("lime"))    return "163,230,53";
  if (iconColor.includes("green"))   return "74,222,128";
  if (iconColor.includes("amber"))   return "251,191,36";
  if (iconColor.includes("yellow"))  return "250,204,21";
  if (iconColor.includes("red"))     return "248,113,113";
  if (iconColor.includes("rose"))    return "251,113,133";
  if (iconColor.includes("blue"))    return "96,165,250";
  if (iconColor.includes("indigo"))  return "129,140,248";
  if (iconColor.includes("purple"))  return "192,132,252";
  if (iconColor.includes("slate"))   return "148,163,184";
  if (iconColor.includes("stone"))   return "168,162,158";
  return "251,191,36";
}

function NavGroup({ label, icon: Icon, iconColor, location, prefixes, excludePrefixes = [], children, isOpen, onToggle, collapsed = false, onExpandSidebar, firstHref, groupKey }: {
  label: string; icon: any; iconColor: string;
  location: string; prefixes: string[]; excludePrefixes?: string[];
  children: React.ReactNode;
  isOpen: boolean; onToggle: () => void;
  collapsed?: boolean;
  onExpandSidebar?: () => void;
  firstHref?: string;
  groupKey?: string;
}) {
  const [, navigate] = useLocation();
  const isExcluded = excludePrefixes.some(p => location === p || location.startsWith(p + "/"));
  const isActive = !isExcluded && prefixes.some(p => location === p || location.startsWith(p + "/"));
  const rgb = resolveRgb(iconColor);

  if (collapsed) {
    return (
      <div className="pt-1 flex justify-center">
        <button type="button" title={label}
          onClick={(e) => {
            e.stopPropagation();
            onExpandSidebar?.();
            onToggle();
            if (firstHref) navigate(firstHref);
          }}
          className={cn("flex items-center justify-center rounded-xl transition-all duration-200 cursor-pointer")}
          style={{
            width: "42px", height: "42px",
            background: isActive
              ? `linear-gradient(145deg, rgba(${rgb},0.9) 0%, rgba(${rgb},0.55) 60%, rgba(${rgb},0.3) 100%)`
              : `linear-gradient(145deg, rgba(${rgb},0.18) 0%, rgba(${rgb},0.08) 100%)`,
            border: isActive ? `1px solid rgba(${rgb},0.6)` : `1px solid rgba(${rgb},0.15)`,
            boxShadow: isActive
              ? `0 4px 14px rgba(${rgb},0.45), 0 1px 4px rgba(${rgb},0.3), inset 0 1px 0 rgba(255,255,255,0.2)`
              : `0 2px 6px rgba(${rgb},0.12), inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          <Icon style={{
            width: "20px", height: "20px",
            color: isActive ? "rgba(255,255,255,0.95)" : `rgba(${rgb},0.7)`,
            filter: isActive ? "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" : "none",
          }} />
        </button>
      </div>
    );
  }

  return (
    <div className="pt-1" data-group={groupKey}>
      <button type="button" onClick={onToggle}
        className={cn("w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 group",
          isActive ? "text-white" : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:bg-white/[0.03]")}
        style={isActive ? {
          background: `linear-gradient(135deg, rgba(${rgb},0.1) 0%, rgba(${rgb},0.04) 100%)`,
          border: `1px solid rgba(${rgb},0.2)`,
          boxShadow: `0 1px 6px rgba(${rgb},0.12)`,
        } : { border: "1px solid transparent" }}
      >
        <div className="shrink-0 flex items-center justify-center transition-all duration-200" style={{
          width: "42px", height: "42px", borderRadius: "13px",
          background: isActive
            ? `linear-gradient(145deg, rgba(${rgb},0.9) 0%, rgba(${rgb},0.55) 60%, rgba(${rgb},0.3) 100%)`
            : `linear-gradient(145deg, rgba(${rgb},0.18) 0%, rgba(${rgb},0.08) 100%)`,
          border: isActive ? `1px solid rgba(${rgb},0.6)` : `1px solid rgba(${rgb},0.15)`,
          boxShadow: isActive
            ? `0 4px 14px rgba(${rgb},0.45), 0 1px 4px rgba(${rgb},0.3), inset 0 1px 0 rgba(255,255,255,0.2)`
            : `0 2px 6px rgba(${rgb},0.12), inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}>
          <Icon style={{
            width: isActive ? "22px" : "20px", height: isActive ? "22px" : "20px",
            color: isActive ? "rgba(255,255,255,0.95)" : `rgba(${rgb},0.7)`,
            filter: isActive ? "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" : "none",
            transition: "all 0.2s ease",
          }} />
        </div>
        <span className="flex-1 text-right font-semibold transition-colors duration-200 overflow-hidden whitespace-nowrap" style={{ fontSize: "13.5px", letterSpacing: "0.01em" }}>
          {label}
        </span>
        <ChevronLeft
          className="shrink-0"
          style={{
            width: "13px", height: "13px",
            color: isActive ? `rgba(${rgb},0.6)` : "rgba(100,116,139,0.35)",
            transform: isOpen ? "rotate(-90deg)" : "rotate(0deg)",
            transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      </button>
      <div
        style={{
          maxHeight: isOpen ? "600px" : "0px",
          overflow: "hidden",
          transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="mt-1 mr-3 pr-1.5 space-y-px pb-1" style={{ borderRight: `2px solid rgba(${rgb},0.2)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout, can, isAdmin, isSuperAdmin } = useAuth();
  const { theme, toggleTheme, setTheme } = useTheme();
  const { toast } = useToast();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userCardRef = useRef<HTMLDivElement>(null);
  const [userMenuPos, setUserMenuPos] = useState<{top: number; left: number; width: number} | null>(null);
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // ── العميل: بيانات الـ client الفعلية (فيها الـ avatar الحقيقي، لأنه بيتخزن في جدول clients مش users) ──
  const { data: clientProfileData } = useQuery<{ client: { avatar?: string | null } | null }>({
    queryKey: ["client-portal-profile"],
    queryFn: () => apiFetch("/client-portal/profile"),
    enabled: user?.role === "client",
    staleTime: 30_000,
  });
  const clientAvatar = clientProfileData?.client?.avatar ?? null;
  const toggleGroup = (key: string, firstHref?: string) => {
    setOpenGroup(prev => {
      const opening = prev !== key;
      if (opening && firstHref) navigate(firstHref);
      if (opening) {
        setTimeout(() => {
          const nav = navRef.current;
          const groupEl = nav?.querySelector(`[data-group="${key}"]`) as HTMLElement | null;
          if (nav && groupEl) {
            const navTop = nav.getBoundingClientRect().top;
            const groupTop = groupEl.getBoundingClientRect().top;
            const offset = groupTop - navTop + nav.scrollTop - 8;
            nav.scrollTo({ top: offset, behavior: "smooth" });
          }
        }, 450);
      }
      return opening ? key : null;
    });
  };
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [brandSettingsOpen, setBrandSettingsOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const visibleNav = useMemo(() => {
    return ALL_NAV.filter((item) => {
      // لوحتي → للـ employee فقط
      if ((item as any).employeeOnly) return user?.role === "employee";
      // لوحة التحكم → تتخفى عن الـ employee (عنده لوحتي بدلها)
      if (item.href === "/" && user?.role === "employee") return false;
      // super_admin / admin → كل الصفحات
      if (isAdmin) return true;
      // لو مفيش permission مطلوب → اظهر دايماً
      if (!item.permission) return true;
      // تحقق من الصلاحية
      return can(item.permission);
    });
  }, [can, isAdmin, user?.role]);

  // لو اليوزر واقف على صفحة اتشالت صلاحيتها → ننقله لأول صفحة متاحة
  const redirectingRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // صفحات عامة مش محتاجة nav permission — ما نعملش ليها redirect أبداً
    const globalPages = [
      "/profile", "/my-dashboard", "/subscription-expired", "/dashboard", "/representative", "/super-admin",
      "/client-dashboard", "/client-profile", "/client-account", "/client-shipment", "/client-shipment-detail",
      "/client-shipments", "/client-shipping-invoices", "/client-wallet", "/client-pickup-requests",
      "/client-smart-analytics",
    ];
    if (globalPages.some(p => location === p || location.startsWith(p + "/"))) return;
    // أي sub-route تحت nav item متاح → لا redirect
    const allowed = visibleNav.map(i => i.href);
    if (allowed.length === 0) return;
    const onAllowedPage = allowed.some(href => {
      if (href === "/") return location === "/";
      if (location === href) return true;
      if (location.startsWith(href + "/")) return true;
      // sub-route: لو location بيشترك في الـ base segment مع أي nav item
      // مثلاً /finance/sales مع nav item /finance/clients → كلهم /finance
      const hrefBase = "/" + href.split("/")[1];
      const locBase  = "/" + location.split("/")[1];
      if (hrefBase === locBase && hrefBase !== "/") return true;
      return false;
    });
    // تأكد إضافي: لو الـ location بيبدأ بـ أي href في allowed (بدون trailing slash)
    // مثلاً /orders/5 و /orders موجود → allowed
    const alsoAllowed = allowed.some(href =>
      href !== "/" && location.startsWith(href)
    );
    if (!onAllowedPage && !alsoAllowed) {
      // نستنى 800ms بدل 500 عشان الـ permissions تتحدث كلها
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = setTimeout(() => {
        // نعيد التحقق بعد الـ delay
        if (redirectingRef.current) return;
        // تحقق نهائي قبل الـ redirect
        const currentAllowed = visibleNav.map(i => i.href);
        const stillNotAllowed = !currentAllowed.some(href =>
          href === "/" ? location === "/" : location === href || location.startsWith(href)
        );
        if (stillNotAllowed) {
          redirectingRef.current = true;
          navigate(currentAllowed[0] ?? "/");
          setTimeout(() => { redirectingRef.current = false; }, 2000);
        }
      }, 800);
    } else {
      // الصفحة متاحة → امسح أي redirect معلق
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    }
  }, [visibleNav, location, isAdmin]);

  const handleChangePassword = async () => {
    if (!currentPw || newPw.length < 6) {
      toast({ title: "خطأ", description: "أدخل كلمة المرور الحالية وكلمة مرور جديدة (6 أحرف على الأقل)", variant: "destructive" });
      return;
    }
    setSavingPw(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      setPwDialogOpen(false);
      setCurrentPw("");
      setNewPw("");
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSavingPw(false);
    }
  };

  // ── بوابة العميل: layout مبسط 100% بدون sidebar إداري ────────────────────
  if (user?.role === "client") {
    const CLIENT_NAV = [
      { href: "/client-dashboard",       label: "الرئيسية",        icon: LayoutDashboard, exact: true },
      { href: "/client-smart-analytics", label: "التحليل الذكي",   icon: Brain },
      { href: "/client-pickup-requests", label: "طلبات الالتقاط",   icon: Truck },
    ];
    const CLIENT_SHIPMENTS_SUBNAV = [
      { href: "/client-shipments",        label: "قائمة الشحنات",  icon: Package },
      { href: "/client-shipments/new",    label: "إنشاء شحنة",     icon: Plus },
      { href: "/client-shipping-invoices", label: "فواتير الشحن",  icon: Receipt },
      { href: "/client-shipments/import", label: "تحميل من إكسيل", icon: Upload },
    ];
    const CLIENT_FINANCE_SUBNAV = [
      { href: "/client-manifests", label: "البيانات",          icon: FileText },
      { href: "/client-wallet",    label: "التسويات المالية",  icon: Wallet },
      { href: "/client-returns",   label: "المرتجعات",         icon: RotateCcw },
    ];
    const isClientActive = (href: string, exact?: boolean) =>
      exact ? location === href : location === href || location.startsWith(href + "/");
    const shipmentsGroupActive = CLIENT_SHIPMENTS_SUBNAV.some(item => isClientActive(item.href));
    const financeGroupActive = CLIENT_FINANCE_SUBNAV.some(item => isClientActive(item.href));
    const [clientShipmentsOpen, setClientShipmentsOpen] = useState(shipmentsGroupActive);
    const [clientFinanceOpen, setClientFinanceOpen] = useState(financeGroupActive);
    const [mobileShipmentsSheetOpen, setMobileShipmentsSheetOpen] = useState(false);
    const [mobileFinanceSheetOpen, setMobileFinanceSheetOpen] = useState(false);

    return (
      <div
        className="flex bg-background overflow-hidden"
        style={{ height: "100dvh" }}
        dir="rtl"
        onClick={(e) => {
          if (!sidebarCollapsed && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
            setSidebarCollapsed(true);
          }
        }}
      >

        {/* ── Sidebar جانبي قابل للطي (desktop) ── */}
        <div ref={sidebarRef} className="hidden md:flex print:hidden shrink-0 relative"
          style={{ width: sidebarCollapsed ? "68px" : "230px", transition: "width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>

          {/* زر Toggle */}
          <button type="button" onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? "توسيع القائمة" : "تصغير القائمة"}
            style={{
              position: "absolute", top: "50%", left: "-13px", transform: "translateY(-50%)", zIndex: 50,
              width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: "hsl(var(--sidebar))", border: "2px solid hsl(var(--sidebar-border))",
              boxShadow: "-2px 0 8px rgba(0,0,0,0.25)", cursor: "pointer", transition: "background 0.2s ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "hsl(var(--primary))")}
            onMouseLeave={e => (e.currentTarget.style.background = "hsl(var(--sidebar))")}>
            <ChevronLeft style={{ width: "13px", height: "13px", color: "hsl(var(--sidebar-foreground))",
              transform: sidebarCollapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
          </button>

          <aside className="border-l border-sidebar-border bg-sidebar flex flex-col h-full w-full overflow-hidden"
            style={{ boxShadow: sidebarCollapsed ? "none" : "4px 0 24px rgba(0,0,0,0.18)", cursor: sidebarCollapsed ? "pointer" : "default" }}
            onClick={() => { if (sidebarCollapsed) setSidebarCollapsed(false); }}>

            {/* Header / Logo */}
            <div className={cn("shrink-0 border-b border-sidebar-border/60 flex flex-col",
              sidebarCollapsed ? "items-center gap-2 py-3 px-1" : "gap-2 py-3 px-3")}>
              <div className="flex items-center justify-center">
                {/* ── كارت شعار معدني (خلفية غامقة + برواز دهبي + لمعان) ── */}
                <div
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-2xl overflow-hidden",
                    sidebarCollapsed ? "w-14 h-14 px-1.5 py-2 gap-0.5" : "w-full px-4 py-3 gap-1"
                  )}
                  style={{
                    background: "linear-gradient(160deg, #1c1c1c 0%, #0a0a0a 55%, #050505 100%)",
                    border: "1px solid hsl(var(--primary) / 0.35)",
                    boxShadow: "0 4px 16px -4px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
                  }}
                >
                  <BrandLogoMark size={sidebarCollapsed ? "sm" : "md"} />
                  {!sidebarCollapsed && (
                    <>
                      <div
                        className="h-px w-10 rounded-full"
                        style={{ background: "linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)" }}
                      />
                      <span
                        className="text-[8px] font-black tracking-[0.25em] uppercase"
                        style={{ color: "hsl(var(--primary))" }}
                      >
                        Win or Die
                      </span>
                    </>
                  )}
                </div>
              </div>


              {/* ── صورة العميل + الاسم — جنب بعض أفقيًا لما الـ sidebar متوسعة ── */}
              <Link href="/client-account" title="بروفايلي"
                onClick={(e) => { if (sidebarCollapsed) e.stopPropagation(); }}
                className={cn("flex items-center transition-all rounded-xl",
                  sidebarCollapsed ? "justify-center" : "gap-2.5 w-full px-1.5 py-1.5 hover:bg-white/[0.04]")}>
                <span className={cn("relative rounded-full flex items-center justify-center font-black shrink-0 overflow-hidden",
                  sidebarCollapsed ? "w-10 h-10" : "w-9 h-9",
                  isClientActive("/client-account") ? "ring-2 ring-offset-2 ring-offset-sidebar ring-primary" : "")}
                  style={{
                    background: "linear-gradient(145deg, hsl(var(--primary)) 0%, hsl(var(--primary)/.65) 100%)",
                    boxShadow: "0 4px 14px -2px rgba(0,0,0,0.35)",
                  }}>
                  {clientAvatar ? (
                    <img src={clientAvatar} alt={user?.displayName ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    <span className={cn("text-white select-none", sidebarCollapsed ? "text-sm" : "text-xs")}>
                      {(user?.displayName || "ع").trim().charAt(0)}
                    </span>
                  )}
                </span>

                {!sidebarCollapsed && (
                  <div className="text-right min-w-0 flex-1">
                    <p className="text-xs font-bold text-sidebar-foreground truncate">{user?.displayName}</p>
                    <p className="text-[10px] text-sidebar-foreground/40">بوابة العميل</p>
                  </div>
                )}
              </Link>
            </div>

            {/* روابط التنقل */}
            <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-1">
              {/* الرئيسية */}
              {(() => {
                const item = CLIENT_NAV[0];
                const active = isClientActive(item.href, item.exact);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} title={sidebarCollapsed ? item.label : undefined}
                    onClick={(e) => { if (sidebarCollapsed) e.stopPropagation(); }}
                    className={cn("flex items-center gap-3 rounded-xl text-sm font-bold transition-all",
                      sidebarCollapsed ? "justify-center h-12 w-12 mx-auto" : "px-3 py-2.5",
                      active ? "text-white bg-white/10 border border-white/15" : "text-sidebar-foreground/55 hover:text-sidebar-foreground/85 hover:bg-white/5 border border-transparent")}>
                    <Icon className={cn("shrink-0", sidebarCollapsed ? "w-6 h-6" : "w-4.5 h-4.5")} />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })()}

              {/* ── الشحنات: dropdown ── */}
              {sidebarCollapsed ? (
                <Link href="/client-shipments" title="الشحنات"
                  className={cn("flex items-center justify-center h-12 w-12 mx-auto rounded-xl transition-all",
                    shipmentsGroupActive ? "text-white bg-white/10 border border-white/15" : "text-sidebar-foreground/55 hover:text-sidebar-foreground/85 hover:bg-white/5 border border-transparent")}>
                  <Package className="w-6 h-6 shrink-0" />
                </Link>
              ) : (
                <div>
                  <button type="button" onClick={() => setClientShipmentsOpen(v => !v)}
                    className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all",
                      shipmentsGroupActive ? "text-white bg-white/10 border border-white/15" : "text-sidebar-foreground/55 hover:text-sidebar-foreground/85 hover:bg-white/5 border border-transparent")}>
                    <Package className="w-4.5 h-4.5 shrink-0" />
                    <span className="flex-1 text-right truncate">الشحنات</span>
                    <ChevronLeft className={cn("w-3.5 h-3.5 shrink-0 transition-transform", clientShipmentsOpen ? "-rotate-90" : "")} />
                  </button>
                  {clientShipmentsOpen && (
                    <div className="mt-0.5 mr-2 pr-2 space-y-0.5 border-r border-white/10">
                      {CLIENT_SHIPMENTS_SUBNAV.map(sub => {
                        const subActive = isClientActive(sub.href);
                        const SubIcon = sub.icon;
                        return (
                          <Link key={sub.href} href={sub.href}
                            className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                              subActive ? "text-white bg-white/10" : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:bg-white/5")}>
                            <SubIcon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── التسويات المالية: dropdown ── */}
              {sidebarCollapsed ? (
                <Link href="/client-manifests" title="التسويات المالية"
                  className={cn("flex items-center justify-center h-12 w-12 mx-auto rounded-xl transition-all",
                    financeGroupActive ? "text-white bg-white/10 border border-white/15" : "text-sidebar-foreground/55 hover:text-sidebar-foreground/85 hover:bg-white/5 border border-transparent")}>
                  <Wallet className="w-6 h-6 shrink-0" />
                </Link>
              ) : (
                <div>
                  <button type="button" onClick={() => setClientFinanceOpen(v => !v)}
                    className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all",
                      financeGroupActive ? "text-white bg-white/10 border border-white/15" : "text-sidebar-foreground/55 hover:text-sidebar-foreground/85 hover:bg-white/5 border border-transparent")}>
                    <Wallet className="w-4.5 h-4.5 shrink-0" />
                    <span className="flex-1 text-right truncate">التسويات المالية</span>
                    <ChevronLeft className={cn("w-3.5 h-3.5 shrink-0 transition-transform", clientFinanceOpen ? "-rotate-90" : "")} />
                  </button>
                  {clientFinanceOpen && (
                    <div className="mt-0.5 mr-2 pr-2 space-y-0.5 border-r border-white/10">
                      {CLIENT_FINANCE_SUBNAV.map(sub => {
                        const subActive = isClientActive(sub.href);
                        const SubIcon = sub.icon;
                        return (
                          <Link key={sub.href} href={sub.href}
                            className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                              subActive ? "text-white bg-white/10" : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:bg-white/5")}>
                            <SubIcon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* باقي الروابط */}
              {CLIENT_NAV.slice(1).map(item => {
                const active = isClientActive(item.href, item.exact);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} title={sidebarCollapsed ? item.label : undefined}
                    onClick={(e) => { if (sidebarCollapsed) e.stopPropagation(); }}
                    className={cn("flex items-center gap-3 rounded-xl text-sm font-bold transition-all",
                      sidebarCollapsed ? "justify-center h-12 w-12 mx-auto" : "px-3 py-2.5",
                      active ? "text-white bg-white/10 border border-white/15" : "text-sidebar-foreground/55 hover:text-sidebar-foreground/85 hover:bg-white/5 border border-transparent")}>
                    <Icon className={cn("shrink-0", sidebarCollapsed ? "w-6 h-6" : "w-4.5 h-4.5")} />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </nav>

            {/* أسفل الـ sidebar: الثيم + خروج */}
            <div className={cn("shrink-0 border-t border-sidebar-border/60 p-2 flex gap-2", sidebarCollapsed ? "flex-col items-center" : "flex-row items-center justify-between")}>
              <NotificationBell />
              <button type="button" onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
                title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0"
                style={{
                  background: theme === "dark" ? "linear-gradient(135deg,#1e293b,#0f172a)" : "linear-gradient(135deg,#fef3c7,#fde68a)",
                  border: theme === "dark" ? "1px solid rgba(148,163,184,0.25)" : "1px solid rgba(251,191,36,0.6)",
                }}>
                {theme === "dark" ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-indigo-600" />}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); logout(); }}
                title="خروج"
                className={cn("flex items-center gap-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors rounded-lg shrink-0",
                  sidebarCollapsed ? "w-9 h-9 justify-center" : "px-3 py-2")}>
                <LogOut className="w-4 h-4" /> {!sidebarCollapsed && "خروج"}
              </button>
            </div>
          </aside>
        </div>

        {/* ── Header علوي بسيط (موبايل) ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="md:hidden print:hidden shrink-0 border-b border-sidebar-border bg-sidebar">
            <div className="flex items-center justify-between px-4 h-14 gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandLogoMark size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-sidebar-foreground truncate">{user?.displayName}</p>
                  <p className="text-[10px] text-sidebar-foreground/40">بوابة العميل</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <NotificationBell />
                <button type="button" onClick={toggleTheme} title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0"
                  style={{
                    background: theme === "dark" ? "linear-gradient(135deg,#1e293b,#0f172a)" : "linear-gradient(135deg,#fef3c7,#fde68a)",
                    border: theme === "dark" ? "1px solid rgba(148,163,184,0.25)" : "1px solid rgba(251,191,36,0.6)",
                  }}>
                  {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
                </button>
                <Link href="/client-account" title="بروفايلي"
                  className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden",
                    isClientActive("/client-account") ? "ring-2 ring-offset-1 ring-offset-sidebar ring-primary" : "")}
                  style={{
                    background: "linear-gradient(145deg, hsl(var(--primary)) 0%, hsl(var(--primary)/.65) 100%)",
                    boxShadow: "0 2px 8px -2px rgba(0,0,0,0.35)",
                  }}>
                  {clientAvatar ? (
                    <img src={clientAvatar} alt={user?.displayName ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-black select-none">
                      {(user?.displayName || "ع").trim().charAt(0)}
                    </span>
                  )}
                </Link>
              </div>
            </div>
          </header>

          {/* محتوى الصفحة */}
          <main id="main-scroll-area" className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
            {children}
          </main>
        </div>

        {/* Bottom nav — موبايل فقط */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2"
          style={{
            background: "linear-gradient(180deg, rgba(10,10,10,0.97) 0%, rgba(5,5,5,1) 100%)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.6)",
          }}>
          {/* الرئيسية */}
          {(() => {
            const item = CLIENT_NAV[0];
            const active = isClientActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
                    style={{
                      background: active ? "linear-gradient(145deg, rgba(96,165,250,0.9) 0%, rgba(96,165,250,0.5) 100%)" : "linear-gradient(145deg, rgba(96,165,250,0.15) 0%, rgba(96,165,250,0.07) 100%)",
                      border: active ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(96,165,250,0.12)",
                    }}>
                    <Icon style={{ width: "20px", height: "20px", color: active ? "rgba(255,255,255,0.95)" : "rgba(96,165,250,0.65)" }} />
                  </div>
                  <span style={{ fontSize: "9px", fontWeight: active ? 700 : 500, color: active ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.35)" }}>{item.label}</span>
                </div>
              </Link>
            );
          })()}

          {/* الشحنات — يفتح bottom sheet بالخيارات الثلاثة */}
          <button type="button" onClick={() => setMobileShipmentsSheetOpen(true)}>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
                style={{
                  background: shipmentsGroupActive ? "linear-gradient(145deg, rgba(96,165,250,0.9) 0%, rgba(96,165,250,0.5) 100%)" : "linear-gradient(145deg, rgba(96,165,250,0.15) 0%, rgba(96,165,250,0.07) 100%)",
                  border: shipmentsGroupActive ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(96,165,250,0.12)",
                }}>
                <Package style={{ width: "20px", height: "20px", color: shipmentsGroupActive ? "rgba(255,255,255,0.95)" : "rgba(96,165,250,0.65)" }} />
              </div>
              <span style={{ fontSize: "9px", fontWeight: shipmentsGroupActive ? 700 : 500, color: shipmentsGroupActive ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.35)" }}>الشحنات</span>
            </div>
          </button>

          {/* التسويات المالية — يفتح bottom sheet بالخيارات الثلاثة */}
          <button type="button" onClick={() => setMobileFinanceSheetOpen(true)}>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
                style={{
                  background: financeGroupActive ? "linear-gradient(145deg, rgba(96,165,250,0.9) 0%, rgba(96,165,250,0.5) 100%)" : "linear-gradient(145deg, rgba(96,165,250,0.15) 0%, rgba(96,165,250,0.07) 100%)",
                  border: financeGroupActive ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(96,165,250,0.12)",
                }}>
                <Wallet style={{ width: "20px", height: "20px", color: financeGroupActive ? "rgba(255,255,255,0.95)" : "rgba(96,165,250,0.65)" }} />
              </div>
              <span style={{ fontSize: "9px", fontWeight: financeGroupActive ? 700 : 500, color: financeGroupActive ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.35)" }}>التسويات</span>
            </div>
          </button>

          <HexActionButton href="/client-shipments/new" />

          {/* باقي الروابط (بروفايلي / الالتقاط) */}
          {CLIENT_NAV.slice(1).map(item => {
            const active = isClientActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
                    style={{
                      background: active ? "linear-gradient(145deg, rgba(96,165,250,0.9) 0%, rgba(96,165,250,0.5) 100%)" : "linear-gradient(145deg, rgba(96,165,250,0.15) 0%, rgba(96,165,250,0.07) 100%)",
                      border: active ? "1px solid rgba(96,165,250,0.6)" : "1px solid rgba(96,165,250,0.12)",
                    }}>
                    <Icon style={{ width: "20px", height: "20px", color: active ? "rgba(255,255,255,0.95)" : "rgba(96,165,250,0.65)" }} />
                  </div>
                  <span style={{ fontSize: "9px", fontWeight: active ? 700 : 500, color: active ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.35)" }}>{item.label}</span>
                </div>
              </Link>
            );
          })}
          <button type="button" onClick={logout}>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(145deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.07) 100%)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <LogOut style={{ width: "20px", height: "20px", color: "rgba(239,68,68,0.75)" }} />
              </div>
              <span style={{ fontSize: "9px", fontWeight: 500, color: "rgba(239,68,68,0.6)" }}>خروج</span>
            </div>
          </button>
        </nav>

        {/* Bottom sheet — خيارات الشحنات (موبايل فقط) */}
        {mobileShipmentsSheetOpen && (
          <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setMobileShipmentsSheetOpen(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl p-3 pb-6"
              style={{ background: "linear-gradient(180deg, rgba(15,15,15,0.98) 0%, rgba(5,5,5,1) 100%)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
              onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-3" />
              <p className="text-xs font-bold text-white/50 px-2 mb-2">الشحنات</p>
              <div className="flex flex-col gap-1">
                {CLIENT_SHIPMENTS_SUBNAV.map(sub => {
                  const SubIcon = sub.icon;
                  const subActive = isClientActive(sub.href);
                  return (
                    <Link key={sub.href} href={sub.href} onClick={() => setMobileShipmentsSheetOpen(false)}>
                      <div className={cn("flex items-center gap-3 px-3 py-3 rounded-xl transition-all",
                        subActive ? "bg-white/10" : "hover:bg-white/5")}>
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.25)" }}>
                          <SubIcon style={{ width: "18px", height: "18px", color: "rgba(96,165,250,0.9)" }} />
                        </div>
                        <span className="text-sm font-semibold text-white/85">{sub.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom sheet — خيارات التسويات المالية (موبايل فقط) */}
        {mobileFinanceSheetOpen && (
          <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setMobileFinanceSheetOpen(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl p-3 pb-6"
              style={{ background: "linear-gradient(180deg, rgba(15,15,15,0.98) 0%, rgba(5,5,5,1) 100%)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
              onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-3" />
              <p className="text-xs font-bold text-white/50 px-2 mb-2">التسويات المالية</p>
              <div className="flex flex-col gap-1">
                {CLIENT_FINANCE_SUBNAV.map(sub => {
                  const SubIcon = sub.icon;
                  const subActive = isClientActive(sub.href);
                  return (
                    <Link key={sub.href} href={sub.href} onClick={() => setMobileFinanceSheetOpen(false)}>
                      <div className={cn("flex items-center gap-3 px-3 py-3 rounded-xl transition-all",
                        subActive ? "bg-white/10" : "hover:bg-white/5")}>
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.25)" }}>
                          <SubIcon style={{ width: "18px", height: "18px", color: "rgba(96,165,250,0.9)" }} />
                        </div>
                        <span className="text-sm font-semibold text-white/85">{sub.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── بوابة المندوب: الصفحة بتدير الـ header والـ sidebar بتاعها بالكامل ────
  if (user?.role === "representative") {
    return (
      <div className="bg-background overflow-hidden" style={{ height: "100dvh" }} dir="rtl">
        <main id="main-scroll-area" className="h-full overflow-y-auto">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div
      className="flex bg-background overflow-hidden"
      style={{ height: "100dvh" }}
      dir="rtl"
      onClick={(e) => {
        if (!sidebarCollapsed && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
          setSidebarCollapsed(true);
        }
      }}
    >

      {/* ── Sidebar wrapper (desktop) ── */}
      <div
        ref={sidebarRef}
        className="hidden md:flex print:hidden shrink-0 relative"
        style={{
          width: sidebarCollapsed ? "68px" : "240px",
          transition: "width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* زر Toggle على الحافة اليسرى للـ sidebar (في RTL يكون على يسار الصفحة = الحافة الخارجية للـ main) */}
        <button
          type="button"
          onClick={() => setSidebarCollapsed(v => !v)}
          title={sidebarCollapsed ? "توسيع القائمة" : "تصغير القائمة"}
          style={{
            position: "absolute",
            top: "50%",
            left: "-13px",
            transform: "translateY(-50%)",
            zIndex: 50,
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "hsl(var(--sidebar))",
            border: "2px solid hsl(var(--sidebar-border))",
            boxShadow: "-2px 0 8px rgba(0,0,0,0.25)",
            cursor: "pointer",
            transition: "background 0.2s ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "hsl(var(--primary))")}
          onMouseLeave={e => (e.currentTarget.style.background = "hsl(var(--sidebar))")}
        >
          <ChevronLeft style={{
            width: "13px", height: "13px",
            color: "hsl(var(--sidebar-foreground))",
            transform: sidebarCollapsed ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }} />
        </button>

        {/* الـ Sidebar الفعلي */}
        <aside
          className="border-l border-sidebar-border bg-sidebar flex flex-col h-full w-full overflow-hidden"
          style={{
            transition: "opacity 0.3s ease, box-shadow 0.4s ease",
            boxShadow: sidebarCollapsed ? "none" : "4px 0 24px rgba(0,0,0,0.18)",
            cursor: sidebarCollapsed ? "pointer" : "default",
          }}
          onClick={(e) => {
            if (sidebarCollapsed) {
              e.stopPropagation();
              setSidebarCollapsed(false);
            }
          }}
        >

          {/* Header */}
          <div className="shrink-0 border-b border-sidebar-border/60">
            {sidebarCollapsed && (
              <div className="flex flex-col items-center gap-2 py-3 px-1">
                {/* Second Logo في وضع الـ collapsed */}
                <div style={{
                  width: "44px", height: "44px", borderRadius: "12px", overflow: "hidden",
                  background: "linear-gradient(180deg, #0a0a0a 0%, #111 100%)",
                  border: "1px solid hsl(var(--primary)/0.4)",
                  boxShadow: "0 0 10px hsl(var(--primary)/0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <img src={firstLogoBase64} alt="Logo" style={{
                    width: "100%", height: "100%", objectFit: "cover",
                  }} />
                </div>
                {/* Brand Logo */}
                <BrandLogoMark size="sm" onClick={() => setBrandSettingsOpen(true)} />
                {/* User avatar */}
                <button type="button" onClick={(e) => {
                  e.stopPropagation();
                  navigate("/profile");
                }} title={user?.displayName}
                  className="relative w-10 h-10 rounded-full flex items-center justify-center hover:ring-2 hover:ring-primary/40 transition-all mt-1">
                  {(user as any)?.avatar
                    ? <img src={(user as any).avatar} className="w-10 h-10 rounded-full object-cover border-2 border-primary/30" alt={user?.displayName} />
                    : <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: "linear-gradient(135deg,hsl(var(--primary)/0.8),hsl(var(--primary)/0.4))", color: "hsl(var(--primary-foreground))", border: "2px solid hsl(var(--primary)/0.3)" }}>
                        {user?.displayName?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>}
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-sidebar z-10" style={{boxShadow:"0 0 6px rgba(52,211,153,0.9)"}}>
                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" style={{opacity:0.7}} />
                  </span>
                </button>
              </div>
            )}
            {!sidebarCollapsed && (<>
              {/* First Logo - full width top */}
              <div style={{
                position: "relative", width: "100%",
                background: "#000",
                borderBottom: "1px solid hsl(var(--primary)/0.4)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0px",
                overflow: "hidden",
              }}>
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 100% 100% at 50% 50%, hsl(var(--primary)/0.08) 0%, transparent 70%)" }} />
                <img src={firstLogoBase64} alt="Logo" style={{
                  display: "block", width: "100%", height: "auto", maxHeight: "200px",
                  objectFit: "cover", objectPosition: "center", position: "relative", zIndex: 1,
                }} />
              </div>

              {/* Brand hero */}
              <div className="px-4 pt-2 pb-4 flex flex-row items-center justify-between relative overflow-hidden"
                style={{ background: "linear-gradient(160deg, hsl(var(--primary)/0.12) 0%, hsl(var(--primary)/0.04) 100%)" }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(var(--primary)/0.18) 0%, transparent 80%)" }} />
                <div className="relative z-10 cursor-pointer" onClick={() => setBrandSettingsOpen(true)}>
                  <div className="brand-name-glow flex flex-col items-center gap-0">
                    <BrandFull logoSize="md" layout="row" nameClass="text-base font-black tracking-[0.2em] uppercase brand-name-text" taglineClass="text-[0px] opacity-0 h-0 overflow-hidden" />
                    <span className="block h-[2px] rounded-full" style={{
                      width: "5.5rem", alignSelf: "center", marginTop: "2px", marginRight: "2.5rem",
                      background: "linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 20%, #fff 50%, hsl(var(--primary)) 80%, transparent 100%)",
                      boxShadow: "0 0 6px hsl(var(--primary)/0.9), 0 0 14px hsl(var(--primary)/0.5)",
                    }} />
                    <style>{".brand-name-text{background:linear-gradient(135deg,hsl(var(--primary)) 0%,#fff 50%,hsl(var(--primary)) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 8px hsl(var(--primary)/0.8))}"}</style>
                  </div>
                </div>

                <div className="absolute bottom-0 left-6 right-6 h-px" style={{ background: "linear-gradient(90deg, transparent, hsl(var(--primary)/0.4), transparent)" }} />
              </div>

              {/* User card */}
              <div ref={userCardRef} className="px-3 py-3 relative">
                <button type="button" onClick={() => {
                  if (userCardRef.current) {
                    const rect = userCardRef.current.getBoundingClientRect();
                    setUserMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                  }
                  setUserMenuOpen(v => !v);
                }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all hover:bg-foreground/5"
                  style={{ background: "hsl(var(--muted)/0.4)", border: "1px solid hsl(var(--border)/0.5)" }}>
                  <div className="relative shrink-0">
                    {(user as any)?.avatar
                      ? <img src={(user as any).avatar} className="w-8 h-8 rounded-full object-cover border-2 border-primary/30" alt={user?.displayName} />
                      : <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ background: "linear-gradient(135deg,hsl(var(--primary)/0.8),hsl(var(--primary)/0.4))", color: "hsl(var(--primary-foreground))", border: "2px solid hsl(var(--primary)/0.3)" }}>
                          {user?.displayName?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>}
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#111] z-10" style={{boxShadow:"0 0 8px rgba(52,211,153,0.9)"}}>
                      <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" style={{opacity:0.75}} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-xs font-bold text-sidebar-foreground truncate">{user?.displayName}</p>
                    <p className="text-[10px] text-sidebar-foreground/45 truncate">{getRoleLabel(user)}</p>
                  </div>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-sidebar-foreground/30 shrink-0 transition-transform", userMenuOpen && "rotate-180")} />
                </button>
              </div>
            </>)}
          </div>

          {/* Nav */}
          <nav ref={navRef} className={cn("py-3 flex-1 space-y-0.5 overflow-y-auto", sidebarCollapsed ? "px-1" : "px-2")} style={sidebarCollapsed ? { cursor: "default" } : undefined}>
            {visibleNav.filter(i => i.group === "dashboard").map(item => <NavItem key={item.href} item={item} location={location} collapsed={sidebarCollapsed} />)}

            {visibleNav.some(i => i.group === "orders") && (
              <NavGroup label="الشحنات" icon={Package} iconColor="text-orange-400" location={location} prefixes={["/orders","/invoices","/shipping-followup"]} isOpen={openGroup === "orders"} onToggle={() => toggleGroup("orders", visibleNav.find(i => i.group === "orders")?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={visibleNav.find(i => i.group === "orders")?.href} groupKey="orders">
                {visibleNav.filter(i => i.group === "orders").map(item => <NavItem key={item.href+item.label} item={item} location={location} sub />)}
              </NavGroup>
            )}

            {visibleNav.some(i => i.group === "shipping") && (
              <NavGroup label="مناديب الشحن" icon={Truck} iconColor="text-sky-400" location={location} prefixes={["/shipping"]} isOpen={openGroup === "shipping"} onToggle={() => toggleGroup("shipping", visibleNav.find(i => i.group === "shipping")?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={visibleNav.find(i => i.group === "shipping")?.href} groupKey="shipping">
                {visibleNav.filter(i => i.group === "shipping").map(item => <NavItem key={item.href} item={item} location={location} sub />)}
              </NavGroup>
            )}

            {visibleNav.some(i => i.group === "zones") && (
              <NavGroup label="المناطق والأسعار" icon={MapPin} iconColor="text-cyan-400" location={location} prefixes={["/shipments"]} isOpen={openGroup === "zones"} onToggle={() => toggleGroup("zones", visibleNav.find(i => i.group === "zones")?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={visibleNav.find(i => i.group === "zones")?.href} groupKey="zones">
                {visibleNav.filter(i => i.group === "zones").map(item => <NavItem key={item.href} item={item} location={location} sub />)}
              </NavGroup>
            )}

            {visibleNav.some(i => i.group === "inventory") && (
              <NavGroup label="المخزون" icon={Boxes} iconColor="text-violet-400" location={location} prefixes={["/inventory","/warehouses","/movements"]} isOpen={openGroup === "inventory"} onToggle={() => toggleGroup("inventory", visibleNav.find(i => i.group === "inventory")?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={visibleNav.find(i => i.group === "inventory")?.href} groupKey="inventory">
                {visibleNav.filter(i => i.group === "inventory").map(item => <NavItem key={item.href} item={item} location={location} sub />)}
              </NavGroup>
            )}

            {visibleNav.some(i => i.group === "clients_business") && (
              <NavGroup label="العملاء التجاريون" icon={UserCheck} iconColor="text-cyan-400" location={location} prefixes={["/finance/clients"]} isOpen={openGroup === "clients_business"} onToggle={() => toggleGroup("clients_business", visibleNav.find(i => i.group === "clients_business")?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={visibleNav.find(i => i.group === "clients_business")?.href} groupKey="clients_business">
                {visibleNav.filter(i => i.group === "clients_business").map(item => <NavItem key={item.href} item={item} location={location} sub />)}
              </NavGroup>
            )}

            {visibleNav.some(i => i.group === "analytics") && (
              <NavGroup label="التحليلات" icon={BarChart3} iconColor="text-pink-400" location={location} prefixes={["/product-performance","/smart","/ads-analytics","/team-performance","/sessions-report","/finance/cash/analytics"]} isOpen={openGroup === "analytics"} onToggle={() => toggleGroup("analytics", visibleNav.find(i => i.group === "analytics")?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={visibleNav.find(i => i.group === "analytics")?.href} groupKey="analytics">
                {visibleNav.filter(i => i.group === "analytics").map(item => <NavItem key={item.href+item.label} item={item} location={location} sub />)}
              </NavGroup>
            )}

            {can("finance.view") && (
              <NavGroup label="الماليات" icon={DollarSign} iconColor="text-emerald-400" location={location} prefixes={["/finance"]} excludePrefixes={["/finance/cash/analytics","/finance/clients"]} isOpen={openGroup === "finance"} onToggle={() => toggleGroup("finance", FINANCE_NAV[0]?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={FINANCE_NAV[0]?.href} groupKey="finance">
                {FINANCE_NAV.map((item) => {
                  const isActive = location === item.href;
                  const Icon = item.icon;
                  const rgb2 = resolveRgb(item.iconColor ?? "text-blue-400");
                  return (
                    <Link key={item.href} href={item.href}
                      className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-[11.5px] font-semibold transition-all duration-200 mr-2 group",
                        isActive ? "text-white" : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90 hover:bg-white/[0.04]")}
                      style={isActive ? {
                        background: `linear-gradient(135deg, rgba(${rgb2},0.18) 0%, rgba(${rgb2},0.07) 100%)`,
                        border: `1px solid rgba(${rgb2},0.25)`,
                        boxShadow: `0 1px 8px rgba(${rgb2},0.15)`,
                      } : { border: "1px solid transparent" }}>
                      <div className="shrink-0 flex items-center justify-center" style={{
                        width: "28px", height: "28px", borderRadius: "8px",
                        background: isActive ? `linear-gradient(145deg, rgba(${rgb2},0.85) 0%, rgba(${rgb2},0.45) 100%)` : `linear-gradient(145deg, rgba(${rgb2},0.15) 0%, rgba(${rgb2},0.06) 100%)`,
                        border: isActive ? `1px solid rgba(${rgb2},0.5)` : `1px solid rgba(${rgb2},0.12)`,
                        boxShadow: isActive ? `0 3px 10px rgba(${rgb2},0.35)` : `0 1px 4px rgba(${rgb2},0.1)`,
                      }}>
                        <Icon style={{ width: "13px", height: "13px", color: isActive ? "rgba(255,255,255,0.95)" : `rgba(${rgb2},0.75)` }} />
                      </div>
                      <span className="flex-1 text-right">{item.label}</span>
                    </Link>
                  );
                })}
              </NavGroup>
            )}

            {visibleNav.some(i => i.group === "team") && (
              <NavGroup label="الفريق والإدارة" icon={Users} iconColor="text-green-400" location={location} prefixes={["/team","/team-performance","/users","/audit-logs"]} isOpen={openGroup === "team"} onToggle={() => toggleGroup("team", visibleNav.find(i => i.group === "team")?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={visibleNav.find(i => i.group === "team")?.href} groupKey="team">
                {visibleNav.filter(i => i.group === "team").map(item => <NavItem key={item.href+item.label} item={item} location={location} sub />)}
              </NavGroup>
            )}

            {visibleNav.some(i => i.group === "tools") && (
              <NavGroup label="الأدوات" icon={Upload} iconColor="text-amber-400" location={location} prefixes={["/import","/export","/archive","/clients-showcase"]} isOpen={openGroup === "tools"} onToggle={() => toggleGroup("tools", visibleNav.find(i => i.group === "tools")?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={visibleNav.find(i => i.group === "tools")?.href} groupKey="tools">
                {visibleNav.filter(i => i.group === "tools").map(item => <NavItem key={item.href} item={item} location={location} sub />)}
              </NavGroup>
            )}

            {visibleNav.some(i => i.group === "settings") && (
              <NavGroup label="الإعدادات والدعم" icon={Settings} iconColor="text-emerald-500" location={location} prefixes={["/whatsapp","/audit-logs"]} isOpen={openGroup === "settings"} onToggle={() => toggleGroup("settings", visibleNav.find(i => i.group === "settings")?.href)} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref={visibleNav.find(i => i.group === "settings")?.href} groupKey="settings">
                {visibleNav.filter(i => i.group === "settings").map(item => <NavItem key={item.href+item.label} item={item} location={location} sub />)}
              </NavGroup>
            )}

            {/* ── قسم السوبر ادمن ── */}
            {isSuperAdmin && (
              <NavGroup label="إدارة النظام" icon={Crown} iconColor="text-yellow-400" location={location} prefixes={["/super-admin"]} isOpen={openGroup === "superadmin"} onToggle={() => toggleGroup("superadmin", "/super-admin")} collapsed={sidebarCollapsed} onExpandSidebar={() => setSidebarCollapsed(false)} firstHref="/super-admin" groupKey="superadmin">
                <NavItem item={{ href: "/super-admin", label: "لوحة السوبر أدمن", icon: Crown, iconColor: "text-yellow-400", exact: true }} location={location} sub />
                <NavItem item={{ href: "/super-admin", label: "الاشتراكات", icon: Receipt, iconColor: "text-amber-400" }} location={location} sub />
              </NavGroup>
            )}
          </nav>

          {/* Footer */}
          <div className="shrink-0 border-t border-sidebar-border">
            {sidebarCollapsed ? (
              /* Collapsed */
              <div className="py-3 flex flex-col items-center gap-2">
                <NotificationBell />
                <button type="button" onClick={toggleTheme} title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
                  style={{
                    background: theme === "dark" ? "linear-gradient(135deg,#1e293b,#0f172a)" : "linear-gradient(135deg,#fef3c7,#fde68a)",
                    border: theme === "dark" ? "1px solid rgba(148,163,184,0.25)" : "1px solid rgba(251,191,36,0.6)",
                    boxShadow: theme === "dark" ? "0 0 8px rgba(148,163,184,0.2)" : "0 0 10px rgba(251,191,36,0.4)",
                  }}>
                  {theme === "dark" ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-indigo-600" />}
                </button>
                <button type="button" onClick={logout} title="تسجيل الخروج"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group"
                  style={{
                    background: "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(185,28,28,0.1))",
                    border: "1px solid rgba(239,68,68,0.25)",
                    boxShadow: "0 0 8px rgba(239,68,68,0.1)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg,rgba(239,68,68,0.35),rgba(185,28,28,0.25))"; e.currentTarget.style.boxShadow = "0 0 14px rgba(239,68,68,0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(185,28,28,0.1))"; e.currentTarget.style.boxShadow = "0 0 8px rgba(239,68,68,0.1)"; }}>
                  <LogOut className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ) : (
              /* Expanded */
              <div className="px-3 py-2.5 flex items-center gap-2">
                <NotificationBell />
                <button type="button" onClick={toggleTheme} title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
                  style={{
                    background: theme === "dark" ? "linear-gradient(135deg,#1e293b,#0f172a)" : "linear-gradient(135deg,#fef3c7,#fde68a)",
                    border: theme === "dark" ? "1px solid rgba(148,163,184,0.25)" : "1px solid rgba(251,191,36,0.6)",
                    boxShadow: theme === "dark" ? "0 0 8px rgba(148,163,184,0.2)" : "0 0 10px rgba(251,191,36,0.4)",
                  }}>
                  {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
                </button>
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-xs font-bold text-sidebar-foreground truncate">{user?.displayName}</p>
                  <p className="text-[10px] text-sidebar-foreground/40">{getRoleLabel(user)}</p>
                </div>
                <button type="button" className="relative shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/40 rounded-full transition-all" onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setUserMenuPos({ top: rect.top - 195, left: Math.max(8, rect.left - 90), width: 220 });
                  setUserMenuOpen(v=>!v);
                }} title={user?.displayName}>
                  {(user as any)?.avatar
                    ? <img src={(user as any).avatar} className="w-8 h-8 rounded-full object-cover border-2 border-primary/30" alt={user?.displayName} />
                    : <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: "linear-gradient(135deg,hsl(var(--primary)/0.8),hsl(var(--primary)/0.4))", color: "hsl(var(--primary-foreground))", border: "2px solid hsl(var(--primary)/0.3)" }}>
                        {user?.displayName?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-sidebar z-10" style={{boxShadow:"0 0 6px rgba(52,211,153,0.9)"}}>
                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" style={{opacity:0.7}} />
                  </span>
                </button>
                {/* زر تسجيل الخروج */}
                <button type="button" onClick={logout} title="تسجيل الخروج"
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
                  style={{
                    background: "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(185,28,28,0.1))",
                    border: "1px solid rgba(239,68,68,0.25)",
                    boxShadow: "0 0 6px rgba(239,68,68,0.1)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg,rgba(239,68,68,0.35),rgba(185,28,28,0.25))"; e.currentTarget.style.boxShadow = "0 0 14px rgba(239,68,68,0.5)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(185,28,28,0.1))"; e.currentTarget.style.boxShadow = "0 0 6px rgba(239,68,68,0.1)"; }}>
                  <LogOut className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            )}
          </div>

        </aside>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="border-b border-sidebar-border/40 bg-sidebar md:hidden print:hidden shrink-0">
          <div className="flex items-center justify-between px-3 h-12 gap-2">

            {/* ── وسط: brand logo + name (same style as desktop) ── */}
            <div className="flex-1 flex justify-start">
              <div className="brand-name-glow flex flex-row items-center gap-3">
                <img src={firstLogoBase64} alt="STARK" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                <div className="flex flex-col items-start gap-0">
                  <span className="text-base font-black tracking-[0.2em] uppercase brand-name-text">STARK</span>
                  <span className="block h-[2px] rounded-full" style={{
                    width: "4rem", marginTop: "2px",
                    background: "linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 20%, #fff 50%, hsl(var(--primary)) 80%, transparent 100%)",
                    boxShadow: "0 0 6px hsl(var(--primary)/0.9), 0 0 14px hsl(var(--primary)/0.5)",
                  }} />
                </div>
              </div>
            </div>

            {/* ── شمال: avatar أونلاين + dark/light toggle ── */}
            <div className="flex items-center gap-2 shrink-0">
              {/* زر الإشعارات */}
              <NotificationBell />

              {/* زر الثيم */}
              <button
                type="button"
                onClick={toggleTheme}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-90"
                style={{
                  background: theme === "dark"
                    ? "linear-gradient(135deg,#1e3a5f,#0f172a)"
                    : "linear-gradient(135deg,#fbbf24,#f59e0b)",
                  boxShadow: theme === "dark"
                    ? "0 0 8px rgba(96,165,250,0.35)"
                    : "0 0 8px rgba(251,191,36,0.5)",
                }}
              >
                {theme === "dark"
                  ? <Moon className="w-3.5 h-3.5 text-blue-300" />
                  : <Sun className="w-3.5 h-3.5 text-white" />}
              </button>

              {/* صورة المستخدم + نقطة أونلاين */}
              <div
                ref={userCardRef}
                className="relative cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/profile");
                }}
              >
                {(user as any)?.avatar
                  ? <img
                      src={(user as any).avatar}
                      className="w-8 h-8 rounded-full object-cover"
                      style={{ border: "2px solid rgba(52,211,153,0.5)" }}
                      alt={user?.displayName}
                    />
                  : <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-primary"
                      style={{
                        background: "linear-gradient(135deg,rgba(99,102,241,0.2),rgba(99,102,241,0.05))",
                        border: "2px solid rgba(52,211,153,0.45)",
                      }}
                    >
                      {user?.displayName?.charAt(0) ?? "?"}
                    </div>}
                {/* نقطة أونلاين */}
                <span
                  className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-sidebar z-10"
                  style={{ boxShadow: "0 0 6px rgba(52,211,153,0.8)" }}
                >
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" style={{ opacity: 0.6 }} />
                </span>
              </div>
            </div>

          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden" dir="rtl">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <div className="absolute top-0 right-0 h-full w-72 bg-sidebar border-l border-sidebar-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
                <BrandFull logoSize="sm" layout="row" nameClass="text-sm text-sidebar-foreground" onLogoClick={() => { setBrandSettingsOpen(true); setMobileMenuOpen(false); }} />
                <button type="button" onClick={() => setMobileMenuOpen(false)} className="text-sidebar-foreground/50 hover:text-sidebar-foreground p-1 rounded-md hover:bg-foreground/5">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
                {visibleNav.map((item) => {
                  const isActive = item.exact ? location === item.href : (location === item.href || location.startsWith(item.href + "/") || (item.href !== "/" && location.startsWith(item.href)));
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                      className={cn("flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-all",
                        isActive ? "bg-primary text-primary-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-foreground/5")}>
                      <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary-foreground" : item.iconColor)} />
                      {item.label}
                    </Link>
                  );
                })}
                {(true) && (
                  <div className="pt-1">
                    <button type="button" onClick={() => setFinanceOpen(v => !v)}
                      className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-all",
                        location.startsWith("/finance") ? "bg-emerald-500/15 text-emerald-400" : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-foreground/5")}>
                      <DollarSign className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span className="flex-1 text-right">الماليات</span>
                      <ChevronLeft className={cn("w-3.5 h-3.5 transition-transform", financeOpen ? "-rotate-90" : "")} />
                    </button>
                    {financeOpen && (
                      <div className="mt-0.5 mr-2 border-r border-emerald-500/20 pr-1 space-y-0.5">
                        {FINANCE_NAV.map((item) => {
                          const isActive = location === item.href || location.startsWith(item.href + "/");
                          const Icon = item.icon;
                          return (
                            <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                              className={cn("flex items-center gap-3 px-3 py-2 rounded-md text-sm font-semibold transition-all",
                                isActive ? "bg-primary text-primary-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-foreground/5")}>
                              <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary-foreground" : item.iconColor)} />
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </nav>
              <div className="border-t border-sidebar-border p-3 space-y-2">
                {/* Theme Toggle — أنيق */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-300 active:scale-95"
                  style={{
                    background: theme === "dark"
                      ? "linear-gradient(135deg,rgba(30,41,59,0.8),rgba(15,23,42,0.6))"
                      : "linear-gradient(135deg,rgba(254,243,199,0.8),rgba(253,230,138,0.5))",
                    border: theme === "dark"
                      ? "1px solid rgba(148,163,184,0.15)"
                      : "1px solid rgba(251,191,36,0.4)",
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: theme === "dark"
                          ? "linear-gradient(135deg,#1e3a5f,#0f172a)"
                          : "linear-gradient(135deg,#fbbf24,#f59e0b)",
                        boxShadow: theme === "dark"
                          ? "0 0 10px rgba(96,165,250,0.3)"
                          : "0 0 10px rgba(251,191,36,0.5)",
                      }}>
                      {theme === "dark"
                        ? <Moon className="w-3.5 h-3.5 text-blue-300" />
                        : <Sun className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: theme === "dark" ? "rgba(148,163,184,0.9)" : "rgba(120,80,0,0.85)" }}>
                      {theme === "dark" ? "الوضع الليلي" : "الوضع النهاري"}
                    </span>
                  </div>
                  {/* Toggle pill */}
                  <div className="relative w-10 h-5 rounded-full transition-all duration-300 shrink-0"
                    style={{
                      background: theme === "dark"
                        ? "linear-gradient(90deg,#3b82f6,#1d4ed8)"
                        : "rgba(209,213,219,0.7)",
                      boxShadow: theme === "dark" ? "0 0 8px rgba(59,130,246,0.4)" : "none",
                    }}>
                    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300"
                      style={{ right: theme === "dark" ? "2px" : "auto", left: theme === "dark" ? "auto" : "2px" }} />
                  </div>
                </button>
                <div className="flex items-center gap-2 px-1 py-1">
                  <div className="relative shrink-0">
                    {(user as any)?.avatar
                      ? <img src={(user as any).avatar} className="w-8 h-8 rounded-full object-cover border-2 border-primary/30" alt={user?.displayName} />
                      : <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">{user?.displayName?.charAt(0) ?? "?"}</div>}
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#111] z-10" style={{boxShadow:"0 0 6px rgba(52,211,153,0.8)"}}>
                      <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" style={{opacity:0.7}} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-sidebar-foreground truncate">{user?.displayName}</p>
                    <p className="text-[10px] text-sidebar-foreground/40">{getRoleLabel(user)}</p>
                  </div>
                </div>
                <button type="button" onClick={() => { setMobileMenuOpen(false); setPwDialogOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md hover:bg-foreground/5 transition-colors text-sidebar-foreground/70">
                  <KeyRound className="w-3.5 h-3.5" />تغيير كلمة المرور
                </button>
                <button type="button" onClick={() => { setMobileMenuOpen(false); logout(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md text-red-400 hover:bg-red-500/10 transition-colors">
                  <LogOut className="w-3.5 h-3.5" />تسجيل الخروج
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page content */}
        <div
          id="main-scroll-area"
          className="flex-1 overflow-y-auto overflow-x-hidden min-w-0"
        >
          <div className="w-full max-w-screen-2xl mx-auto p-3 sm:p-4 md:p-5 xl:p-6 2xl:p-8 min-w-0 overflow-x-hidden pb-20 md:pb-8">
            {children}
          </div>
        </div>

        {/* ── Bottom Navigation Bar (mobile only) ── */}
        {/* ── Bottom Navigation Bar (mobile only) — ديناميكي حسب الصلاحيات ── */}
        {(() => {
          // ── حساب "مخصص" (custom): bottom bar مبسّط بترتيب ثابت — متابعة / طلبات / المزيد / خروج ──
          if (user?.role === "custom") {
            const CUSTOM_BOTTOM_ITEMS: Array<{ href: string; icon: any; rgb: string; label: string; exact?: boolean }> = [
              { href: "/shipping-followup", icon: Clock,   rgb: "34,211,238",  label: "متابعة", exact: false },
              { href: "/shipments-list",    icon: Package, rgb: "251,146,60", label: "طلبات",  exact: false },
            ];
            return (
              <nav className="bottom-nav-mobile md:hidden print:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2"
                style={{
                  background: "linear-gradient(180deg, rgba(10,10,10,0.97) 0%, rgba(5,5,5,1) 100%)",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  boxShadow: "0 -4px 24px rgba(0,0,0,0.6)",
                  backdropFilter: "blur(12px)",
                }}
              >
                {CUSTOM_BOTTOM_ITEMS.map(({ href, icon: Icon, rgb, label, exact }) => {
                  const isActive = exact ? location === href : (location === href || location.startsWith(href + "/"));
                  return (
                    <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)}>
                      <div className="flex flex-col items-center gap-0.5 relative">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90"
                          style={{
                            background: isActive
                              ? `linear-gradient(145deg, rgba(${rgb},0.9) 0%, rgba(${rgb},0.55) 60%, rgba(${rgb},0.3) 100%)`
                              : `linear-gradient(145deg, rgba(${rgb},0.15) 0%, rgba(${rgb},0.07) 100%)`,
                            border: isActive ? `1px solid rgba(${rgb},0.6)` : `1px solid rgba(${rgb},0.12)`,
                            boxShadow: isActive
                              ? `0 4px 16px rgba(${rgb},0.5), 0 0 8px rgba(${rgb},0.3), inset 0 1px 0 rgba(255,255,255,0.2)`
                              : `0 2px 6px rgba(${rgb},0.1)`,
                          }}
                        >
                          <Icon style={{
                            width: "20px", height: "20px",
                            color: isActive ? "rgba(255,255,255,0.95)" : `rgba(${rgb},0.65)`,
                            filter: isActive ? "drop-shadow(0 1px 3px rgba(0,0,0,0.4))" : "none",
                          }} />
                        </div>
                        <span style={{
                          fontSize: "9px",
                          fontWeight: isActive ? "700" : "500",
                          color: isActive ? `rgba(${rgb},0.9)` : "rgba(255,255,255,0.35)",
                          letterSpacing: "0.02em",
                        }}>{label}</span>
                        {isActive && (
                          <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                            style={{ background: `rgba(${rgb},0.8)`, boxShadow: `0 0 6px rgba(${rgb},1)` }} />
                        )}
                      </div>
                    </Link>
                  );
                })}
                <HexActionButton href="/shipments/new" />
                {/* المزيد */}
                <button type="button" onClick={() => setMobileMenuOpen(true)}>
                  <div className="flex flex-col items-center gap-0.5">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90"
                      style={{
                        background: mobileMenuOpen
                          ? "linear-gradient(145deg, rgba(251,191,36,0.9) 0%, rgba(251,191,36,0.5) 100%)"
                          : "linear-gradient(145deg, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.07) 100%)",
                        border: mobileMenuOpen ? "1px solid rgba(251,191,36,0.6)" : "1px solid rgba(251,191,36,0.12)",
                      }}
                    >
                      <Menu style={{ width: "20px", height: "20px", color: mobileMenuOpen ? "rgba(255,255,255,0.95)" : "rgba(251,191,36,0.65)" }} />
                    </div>
                    <span style={{ fontSize: "9px", fontWeight: 500, color: "rgba(251,191,36,0.65)" }}>المزيد</span>
                  </div>
                </button>
                {/* خروج */}
                <button type="button" onClick={logout}>
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                      style={{ background: "linear-gradient(145deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.07) 100%)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <LogOut style={{ width: "20px", height: "20px", color: "rgba(239,68,68,0.75)" }} />
                    </div>
                    <span style={{ fontSize: "9px", fontWeight: 500, color: "rgba(239,68,68,0.6)" }}>خروج</span>
                  </div>
                </button>
              </nav>
            );
          }

          // قائمة المرشحين بترتيب الأولوية
          const BOTTOM_CANDIDATES: Array<{
            section: string; href: string; icon: any;
            rgb: string; label: string; exact?: boolean;
            permCheck?: string;
          }> = [
            { section: "section_dashboard",         href: "/",               icon: LayoutDashboard, rgb: "96,165,250",  label: "الرئيسية", exact: true },
            { section: "section_orders",            href: "/shipments-list", icon: Package,         rgb: "251,146,60",  label: "الطلبات"  },
            { section: "section_new_order",         href: "/orders/new",     icon: Plus,            rgb: "52,211,153",  label: "جديد"     },
            { section: "section_inventory",         href: "/inventory",      icon: Boxes,           rgb: "167,139,250", label: "الأنواع" },
            { section: "section_invoices",          href: "/invoices",       icon: FileText,        rgb: "250,204,21",  label: "فواتير الشحن" },
            { section: "section_finance",           href: "/finance",        icon: DollarSign,      rgb: "52,211,153",  label: "الماليات", permCheck: "finance.view" },
            { section: "section_smart_analytics",   href: "/smart",          icon: Brain,           rgb: "232,121,249", label: "ذكاء"    },
            { section: "section_shipping",          href: "/shipping",       icon: Truck,           rgb: "56,189,248",  label: "الشحن"   },
            { section: "section_shipping_followup", href: "/shipping-followup", icon: Clock,        rgb: "34,211,238",  label: "متابعة"  },
            { section: "section_team_management",   href: "/team",           icon: UserCog,         rgb: "163,230,53",  label: "الفريق"  },
            { section: "section_users",             href: "/users",          icon: Users,           rgb: "74,222,128",  label: "المستخدمين" },
            { section: "section_movements",         href: "/movements",      icon: Activity,        rgb: "192,132,252", label: "الحركات" },
            { section: "section_import",            href: "/import",         icon: Upload,          rgb: "251,191,36",  label: "استيراد" },
            { section: "section_ads_analytics",     href: "/ads-analytics",  icon: Megaphone,       rgb: "251,113,133", label: "الإعلانات" },
          ];

          // فلتر حسب الصلاحيات — نفس منطق الـ sidebar
          const allowed = BOTTOM_CANDIDATES.filter(c => {
            if (isAdmin) return true;
            const sectionOk = can(c.section);
            const permOk = c.permCheck ? can(c.permCheck) : true;
            return sectionOk && permOk;
          });

          // خذ أول 5 فقط + زر المزيد
          const visible = allowed.slice(0, 5);

          return (
            <nav className="bottom-nav-mobile md:hidden print:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2"
              style={{
                background: "linear-gradient(180deg, rgba(10,10,10,0.97) 0%, rgba(5,5,5,1) 100%)",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "0 -4px 24px rgba(0,0,0,0.6)",
                backdropFilter: "blur(12px)",
              }}
            >
              {visible.map(({ href, icon: Icon, rgb, label, exact }) => {
                const isActive = exact ? location === href : (location === href || location.startsWith(href + "/"));
                return (
                  <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)}>
                    <div className="flex flex-col items-center gap-0.5 relative">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90"
                        style={{
                          background: isActive
                            ? `linear-gradient(145deg, rgba(${rgb},0.9) 0%, rgba(${rgb},0.55) 60%, rgba(${rgb},0.3) 100%)`
                            : `linear-gradient(145deg, rgba(${rgb},0.15) 0%, rgba(${rgb},0.07) 100%)`,
                          border: isActive ? `1px solid rgba(${rgb},0.6)` : `1px solid rgba(${rgb},0.12)`,
                          boxShadow: isActive
                            ? `0 4px 16px rgba(${rgb},0.5), 0 0 8px rgba(${rgb},0.3), inset 0 1px 0 rgba(255,255,255,0.2)`
                            : `0 2px 6px rgba(${rgb},0.1)`,
                        }}
                      >
                        <Icon style={{
                          width: "20px", height: "20px",
                          color: isActive ? "rgba(255,255,255,0.95)" : `rgba(${rgb},0.65)`,
                          filter: isActive ? "drop-shadow(0 1px 3px rgba(0,0,0,0.4))" : "none",
                        }} />
                      </div>
                      <span style={{
                        fontSize: "9px",
                        fontWeight: isActive ? "700" : "500",
                        color: isActive ? `rgba(${rgb},0.9)` : "rgba(255,255,255,0.35)",
                        letterSpacing: "0.02em",
                      }}>{label}</span>
                      {isActive && (
                        <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                          style={{ background: `rgba(${rgb},0.8)`, boxShadow: `0 0 6px rgba(${rgb},1)` }} />
                      )}
                    </div>
                  </Link>
                );
              })}
              <HexActionButton href="/shipments/new" />
              {/* زر المزيد — دايماً ظاهر */}
              <button type="button" onClick={() => setMobileMenuOpen(true)}>
                <div className="flex flex-col items-center gap-0.5">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90"
                    style={{
                      background: mobileMenuOpen
                        ? "linear-gradient(145deg, rgba(251,191,36,0.9) 0%, rgba(251,191,36,0.5) 100%)"
                        : "linear-gradient(145deg, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.07) 100%)",
                      border: mobileMenuOpen ? "1px solid rgba(251,191,36,0.6)" : "1px solid rgba(251,191,36,0.12)",
                      boxShadow: mobileMenuOpen
                        ? "0 4px 16px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.2)"
                        : "0 2px 6px rgba(251,191,36,0.1)",
                    }}
                  >
                    <Menu style={{
                      width: "20px", height: "20px",
                      color: mobileMenuOpen ? "rgba(255,255,255,0.95)" : "rgba(251,191,36,0.65)",
                    }} />
                  </div>
                  <span style={{
                    fontSize: "9px", fontWeight: "500",
                    color: mobileMenuOpen ? "rgba(251,191,36,0.9)" : "rgba(255,255,255,0.35)",
                  }}>المزيد</span>
                </div>
              </button>

              {/* زر تسجيل الخروج — دايماً ظاهر في الـ bottom bar */}
              <button type="button" onClick={logout}>
                <div className="flex flex-col items-center gap-0.5">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90"
                    style={{
                      background: "linear-gradient(145deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.07) 100%)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      boxShadow: "0 2px 6px rgba(239,68,68,0.1)",
                    }}
                  >
                    <LogOut style={{ width: "20px", height: "20px", color: "rgba(239,68,68,0.75)" }} />
                  </div>
                  <span style={{ fontSize: "9px", fontWeight: "500", color: "rgba(239,68,68,0.6)" }}>خروج</span>
                </div>
              </button>
            </nav>
          );
        })()}
      </main>

      {/* User menu dropdown — position:fixed عشان يطلع فوق overflow-hidden */}
      {userMenuOpen && userMenuPos && (
        <div
          style={{
            position: "fixed",
            top: userMenuPos.top,
            left: userMenuPos.left,
            width: userMenuPos.width,
            minWidth: "200px",
            maxHeight: "calc(100vh - 16px)",
            overflowY: "auto",
            zIndex: 9999,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", padding: "6px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            {/* User info header */}
            <div className="px-3 py-2.5 mb-1">
              <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                  {(user as any)?.avatar
                    ? <img src={(user as any).avatar} className="w-8 h-8 rounded-full object-cover border-2 border-primary/30" alt={user?.displayName} />
                    : <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: "linear-gradient(135deg,hsl(var(--primary)/0.8),hsl(var(--primary)/0.4))", color: "hsl(var(--primary-foreground))", border: "2px solid hsl(var(--primary)/0.3)" }}>
                        {user?.displayName?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-card" style={{boxShadow:"0 0 5px rgba(52,211,153,0.8)"}} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{user?.displayName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">@{(user as any)?.username}</p>
                </div>
              </div>
            </div>
            <div style={{ height: "1px", background: "hsl(var(--border)/0.5)", margin: "2px 8px 4px" }} />
            {/* Profile link — مخفي لو showProfileLink = 0 أو false صراحةً */}
            {((user as any)?.showProfileLink ?? 1) != 0 && (
            <Link href="/profile" onClick={() => setUserMenuOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-sidebar-foreground/80 hover:bg-foreground/5 transition-colors text-right">
              <User className="w-3.5 h-3.5 shrink-0 text-primary/70" />
              <span>صفحة البروفايل</span>
            </Link>
            )}
            <button type="button" onClick={() => { setUserMenuOpen(false); setPwDialogOpen(true); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-sidebar-foreground/80 hover:bg-foreground/5 transition-colors text-right">
              <KeyRound className="w-3.5 h-3.5 shrink-0 text-sidebar-foreground/50" />
              <span>تغيير كلمة المرور</span>
            </button>
            <div style={{ height: "1px", background: "hsl(var(--border)/0.5)", margin: "4px 8px" }} />
            <button type="button" onClick={() => { setUserMenuOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors text-right">
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      )}
      {userMenuOpen && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setUserMenuOpen(false)} />
      )}

      <BrandSettingsDialog open={brandSettingsOpen} onClose={() => setBrandSettingsOpen(false)} />

      <Dialog open={pwDialogOpen} onOpenChange={setPwDialogOpen}>
        <DialogContent className="bg-card border-border max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>تغيير كلمة المرور</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs mb-1.5 block">كلمة المرور الحالية</Label>
              <Input type="password" className="h-9 text-sm bg-background" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">كلمة المرور الجديدة</Label>
              <Input type="password" className="h-9 text-sm bg-background" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="6 أحرف على الأقل" />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 h-9 text-sm font-bold" onClick={handleChangePassword} disabled={savingPw}>
                {savingPw ? "جاري الحفظ..." : "حفظ"}
              </Button>
              <Button variant="outline" className="h-9 text-sm border-border" onClick={() => setPwDialogOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
