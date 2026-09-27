import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Brain, TrendingUp, Activity, Sparkles, Package, Boxes, Truck, MapPin,
  AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, ChevronRight, Warehouse as WarehouseIcon,
  CircleDollarSign, Clock3, PackageCheck, ShieldAlert, Target, PieChart, DollarSign, RotateCcw,
} from "lucide-react";
import { shipmentsApi } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (نفس منطق zones-intelligence.tsx / shipments-intelligence.tsx لثبات الهوية البصرية)
// ═══════════════════════════════════════════════════════════════════════════
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

const ALERT_META: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertTriangle, color: "#ef4444", bg: "bg-red-500/10 border-red-500/30" },
  warning:  { icon: AlertCircle,   color: "#f97316", bg: "bg-orange-500/10 border-orange-500/30" },
  info:     { icon: Info,          color: "#06b6d4", bg: "bg-cyan-500/10 border-cyan-500/30" },
};

const PARCEL_LABELS: Record<string, string> = {
  document: "مستندات", normal: "طرد عادي", fragile: "قابل للكسر",
  heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس",
  food: "طعام", other: "أخرى",
};
const PARCEL_ICONS_MAP: Record<string, string> = {
  document: "📄", normal: "📦", fragile: "🔮", heavy: "⚖️",
  electronics: "💻", clothing: "👕", food: "🍱", other: "📫",
};

const formatAge = (hours: number): string => {
  if (hours < 1) return "أقل من ساعة";
  if (hours < 24) return `${Math.floor(hours)} س`;
  const days = Math.floor(hours / 24);
  const remHours = Math.floor(hours % 24);
  return remHours > 0 ? `${days} ي ${remHours} س` : `${days} ي`;
};

// ═══════════════════════════════════════════════════════════════════════════
// Mini Ring — نفس ستايل zones-intelligence.tsx تمامًا
// ═══════════════════════════════════════════════════════════════════════════
function MiniRing({ pct, color, size = 44 }: { pct: number; color: string; size?: number }) {
  const [hovered, setHovered] = useState(false);
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapLen = (22 / 360) * circumference;
  const arcLen = circumference - gapLen;
  const filledLen = (Math.max(0, Math.min(100, pct)) / 100) * arcLen;
  return (
    <div
      className="relative shrink-0 outline-none focus:outline-none border-0 select-none"
      style={{ width: size, height: size, WebkitTapHighlightColor: "transparent" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      tabIndex={-1}
    >
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(101deg)", outline: "none", display: "block", overflow: "visible", pointerEvents: "none" }}
      >
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#ffffff12" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={`${arcLen} ${circumference}`} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference}`}
          initial={{ strokeDashoffset: arcLen }}
          animate={{ strokeDashoffset: arcLen - filledLen, filter: hovered ? `drop-shadow(0 0 6px ${color})` : "none" }}
          transition={{ strokeDashoffset: { duration: 0.8, ease: "easeOut" }, filter: { duration: 0.25 } }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums pointer-events-none" style={{ color }}>
        {Math.round(pct)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section header + wrapper card + Pill
// ═══════════════════════════════════════════════════════════════════════════
function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof Package; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#e8b93f]/15 text-[#e8b93f]">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h3 className="text-base font-bold text-white">{title}</h3>
        {subtitle && <p className="text-[11px] text-white/40">{subtitle}</p>}
      </div>
    </div>
  );
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5 ${className}`}>
      {children}
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-bold transition-opacity duration-200 hover:opacity-80"
      style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}
    >
      {children}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Alerts Banner — تنبيهات ذكية خاصة بالشحنات
// ═══════════════════════════════════════════════════════════════════════════
function AlertsBanner({ alerts }: { alerts: { severity: string; message: string }[] }) {
  if (!alerts.length) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const meta = ALERT_META[a.severity] ?? ALERT_META.info;
        const Icon = meta.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors duration-200 hover:bg-white/[0.03] ${meta.bg}`}
          >
            <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
            <span className="text-white/85">{a.message}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Ranked Bar List — قائمة مرتبة بشرائط تقدّم (مناطق الإرجاع / الفروع / أنواع الطرود)
// ═══════════════════════════════════════════════════════════════════════════
function RankedBarList({
  items, color, accentColor, emptyIcon: EmptyIcon, emptyLabel, expandable,
}: {
  items: { key: string; label: string; count: number; icon?: string; detail?: any[] }[];
  color: string;
  accentColor?: string;
  emptyIcon: typeof Package;
  emptyLabel: string;
  expandable?: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <EmptyIcon className="w-8 h-8 text-white/15" />
        <p className="text-xs text-white/35">{emptyLabel}</p>
      </div>
    );
  }
  const maxCount = items[0].count;
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => {
        const barW = pct(it.count, maxCount);
        const isOpen = openKey === it.key;
        const barColor = i === 0 ? color : (accentColor ?? "#ffffff45");
        return (
          <div key={it.key} className="rounded-lg overflow-hidden">
            <button
              type="button"
              disabled={!expandable || !it.detail?.length}
              className={`w-full flex items-center gap-3 py-1.5 rounded-lg transition-colors px-1 -mx-1 ${expandable ? "hover:bg-white/[0.03]" : ""}`}
              onClick={() => expandable && setOpenKey(isOpen ? null : it.key)}
            >
              {it.icon ? (
                <span className="text-sm w-5 text-center shrink-0">{it.icon}</span>
              ) : (
                <span className="text-[10px] font-black w-4 text-center shrink-0" style={{ color: i === 0 ? color : "#ffffff55" }}>{i + 1}</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-white/85 truncate">{it.label}</span>
                  <span className="text-[11px] font-black shrink-0 ml-2" style={{ color: i === 0 ? color : "#ffffff70" }}>{it.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barW}%` }}
                    transition={{ duration: 0.5, delay: Math.min(i * 0.03, 0.3), ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: barColor }}
                  />
                </div>
              </div>
              {expandable && !!it.detail?.length && (isOpen ? <ChevronUp className="w-3.5 h-3.5 text-white/40 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-white/25 shrink-0" />)}
            </button>
            {expandable && isOpen && !!it.detail?.length && (
              <div className="mt-1 mb-1 rounded-lg border border-white/10 bg-white/[0.02] divide-y divide-white/5 max-h-64 overflow-y-auto">
                {it.detail.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                    <Package className="w-3 h-3 text-white/25 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-white/80 truncate">{s.receiverName ?? "بدون اسم"}</span>
                        {s.shipmentNumber && <span className="text-[9px] text-white/30 shrink-0">#{s.shipmentNumber}</span>}
                      </div>
                      <p className="text-[9px] text-white/35 truncate">{s.receiverPhone ?? "—"} · {s.warehouseName ?? "بدون فرع"}</p>
                    </div>
                    <span className="text-[9px] text-white/30 shrink-0">
                      {new Date(s.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Company Performance Panel — أداء شركات الشحن (composite score)
// ═══════════════════════════════════════════════════════════════════════════
function CompanyPerformancePanel({ companies }: { companies: any[] }) {
  if (!companies.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Truck className="w-8 h-8 text-white/15" />
        <p className="text-xs text-white/35">لا توجد بيانات كافية</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-white/5">
      {companies.map((c, idx) => {
        const rate = Math.round(c.deliveryRate);
        const rateColor = rate >= 70 ? "#22c55e" : rate >= 50 ? "#eab308" : "#ef4444";
        return (
          <div key={c.name} className="flex items-center gap-3 py-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black"
              style={{ background: idx === 0 ? "#eab30822" : "#8b5cf622", color: idx === 0 ? "#eab308" : "#8b5cf6" }}
            >
              {idx === 0 ? "★" : `#${idx + 1}`}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-white/85 truncate">{c.name}</span>
                <span className="text-[11px] font-black shrink-0 ml-2" style={{ color: rateColor }}>{rate}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${rate}%` }}
                  transition={{ duration: 0.5, delay: Math.min(idx * 0.04, 0.3), ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: rateColor }}
                />
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-[9px] text-white/40">{c.total} شحنة</span>
                <span className="text-[9px] text-emerald-400">{c.delivered} تسليم</span>
                {c.returned > 0 && <span className="text-[9px] text-rose-400">{c.returned} مرتجع</span>}
                {c.avgHours !== null && (
                  <span className="text-[9px] text-white/40 flex items-center gap-0.5">
                    <Clock3 className="w-2.5 h-2.5" /> متوسط {formatAge(c.avgHours)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Action Alert Group — شحنات بدون شركة / معلقة، قابلة للفتح
// ═══════════════════════════════════════════════════════════════════════════
function ActionAlertGroup({
  count, title, subtitle, list, color, icon: Icon,
}: {
  count: number; title: string; subtitle: string; list: any[]; color: string; icon: typeof AlertCircle;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: `${color}44`, background: `${color}0c` }}>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
        onClick={() => setOpen(o => !o)}
      >
        <Icon className="w-4 h-4 shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0 text-right">
          <p className="text-[12px] font-bold" style={{ color }}>{title}</p>
          <p className="text-[10px] text-white/40">{subtitle}</p>
        </div>
        {open ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color }} />}
      </button>
      {open && (
        <div className="border-t divide-y divide-white/5 max-h-80 overflow-y-auto" style={{ borderColor: `${color}33` }}>
          {list.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <Package className="w-3.5 h-3.5 shrink-0" style={{ color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-white/85 truncate">{s.receiverName ?? "بدون اسم"}</span>
                  {s.shipmentNumber && <span className="text-[10px] text-white/30 shrink-0">#{s.shipmentNumber}</span>}
                </div>
                <p className="text-[10px] text-white/35 truncate">{s.receiverPhone ?? "—"} · {s.warehouseName ?? "بدون فرع"}</p>
              </div>
              <span className="text-[9px] text-white/35 shrink-0">
                {new Date(s.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ═══════════════════════════════════════════════════════════════════════════
export default function InventoryIntelligencePage() {
  const fc3 = (n: number | string) =>
    new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["shipments-stats-insights"],
    queryFn: () => shipmentsApi.stats(),
    staleTime: 2 * 60_000,
  });

  const { data: shipmentsRes, isLoading: listLoading } = useQuery({
    queryKey: ["shipments-insights-list"],
    queryFn: () => shipmentsApi.list({ limit: 200, offset: 0 }),
    staleTime: 2 * 60_000,
  });

  const isLoading = statsLoading || listLoading;
  const shipments = shipmentsRes?.data ?? [];

  const statusMap = useMemo(() => {
    const m: Record<string, number> = {};
    if (stats?.statuses) {
      for (const row of stats.statuses) m[row.status] = Number(row.count) || 0;
    }
    return m;
  }, [stats]);

  const delivered  = statusMap["delivered"] ?? 0;
  const returned   = statusMap["returned"]  ?? 0;
  const inTransit  = (statusMap["in_transit"] ?? 0) + (statusMap["out_for_delivery"] ?? 0);
  const waiting    = (statusMap["waiting"] ?? 0) + (statusMap["confirmed"] ?? 0);
  const totalAll   = Object.values(statusMap).reduce((s, v) => s + v, 0);
  const closedAll  = delivered + returned;

  const deliveryRate = pct(delivered, closedAll);
  const returnRate   = pct(returned,  closedAll);

  const totalCod       = Number(stats?.totalCod)         || 0;
  const totalCollected = Number(stats?.totalCollected)    || 0;
  const totalFee       = Number(stats?.totalShippingFee)  || 0;
  const netProfit      = totalCollected - totalFee;
  const pendingCOD     = shipments
    .filter(s => (s.status === "in_transit" || s.status === "out_for_delivery") && s.paymentMethod === "cod")
    .reduce((sum, s) => sum + (Number(s.codAmount) || 0), 0);

  // ── أكثر مناطق الإرجاع ────────────────────────────────────────────────────
  const returnsByZone = useMemo(() => {
    const m: Record<string, { count: number; shipments: typeof shipments }> = {};
    for (const s of shipments) {
      if (s.status !== "returned") continue;
      const zone = (s as any).zoneLabel || s.receiverCity || "غير محدد";
      if (!m[zone]) m[zone] = { count: 0, shipments: [] };
      m[zone].count++;
      m[zone].shipments.push(s);
    }
    return Object.entries(m).sort((a, b) => b[1].count - a[1].count).slice(0, 5)
      .map(([zone, data]) => ({ key: zone, label: zone, count: data.count, detail: data.shipments }));
  }, [shipments]);

  // ── الشحنات حسب الفرع/المخزن ──────────────────────────────────────────────
  const byBranch = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of shipments) {
      const name = (s as any).warehouseName || "بدون فرع";
      m[name] = (m[name] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ key: name, label: name, count }));
  }, [shipments]);

  // ── الشحنات حسب نوع الطرد ──────────────────────────────────────────────────
  const byParcelType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of shipments) {
      const key = (s as any).parcelType || "normal";
      m[key] = (m[key] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        key: type,
        label: PARCEL_LABELS[type] || type,
        count,
        icon: PARCEL_ICONS_MAP[type] || "📦",
      }));
  }, [shipments]);

  // ── أداء شركات الشحن: scorecard مركّب (معدل تسليم + سرعة + معدل إرجاع) ────
  const companyPerf = useMemo(() => {
    const m: Record<string, { total: number; delivered: number; returned: number; name: string; deliveryHoursSum: number; deliveryHoursCount: number }> = {};
    for (const s of shipments) {
      const key  = String(s.shippingCompanyId ?? "بدون شركة");
      const name = s.shippingCompanyName || "بدون شركة";
      if (!m[key]) m[key] = { total: 0, delivered: 0, returned: 0, name, deliveryHoursSum: 0, deliveryHoursCount: 0 };
      m[key].total++;
      if (s.status === "delivered") {
        m[key].delivered++;
        if (s.actualDelivery && s.createdAt) {
          const hrs = (new Date(s.actualDelivery).getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60);
          if (hrs >= 0 && hrs < 24 * 30) {
            m[key].deliveryHoursSum += hrs;
            m[key].deliveryHoursCount++;
          }
        }
      }
      if (s.status === "returned")  m[key].returned++;
    }
    return Object.values(m)
      .filter(c => c.total >= 2)
      .map(c => {
        const closedCount = c.delivered + c.returned;
        const deliveryRate = closedCount > 0 ? (c.delivered / closedCount) * 100 : 0;
        const returnRate   = closedCount > 0 ? (c.returned  / closedCount) * 100 : 0;
        const avgHours     = c.deliveryHoursCount > 0 ? c.deliveryHoursSum / c.deliveryHoursCount : null;
        const speedPenalty = avgHours !== null && avgHours > 72 ? Math.min(20, (avgHours - 72) / 12) : 0;
        const score = Math.max(0, deliveryRate - speedPenalty);
        return { ...c, deliveryRate, returnRate, avgHours, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [shipments]);

  // ── شحنات تحتاج action ────────────────────────────────────────────────────
  const noCompanyList = useMemo(() => shipments.filter(s =>
    !s.shippingCompanyId && (s.status === "waiting" || s.status === "confirmed")
  ), [shipments]);
  const noCompany = noCompanyList.length;

  const longPendingList = useMemo(() => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    return shipments.filter(s =>
      (s.status === "waiting" || s.status === "confirmed") &&
      new Date(s.createdAt).getTime() < threeDaysAgo
    );
  }, [shipments]);
  const longPending = longPendingList.length;

  // ── تنبيهات ذكية مركّبة (نفس منطق زي inventory-intelligence القديمة) ─────
  const alerts = useMemo(() => {
    const list: { severity: string; message: string }[] = [];
    if (returnRate > 20) list.push({ severity: "critical", message: `معدل الإرجاع مرتفع (${returnRate}%) — راجع أعلى مناطق الإرجاع بالأسفل` });
    else if (returnRate > 12) list.push({ severity: "warning", message: `معدل الإرجاع (${returnRate}%) أعلى من المعتاد` });
    if (noCompany > 0) list.push({ severity: "warning", message: `${noCompany} شحنة مؤكدة بدون شركة شحن — تحتاج إسناد` });
    if (longPending > 0) list.push({ severity: "critical", message: `${longPending} شحنة معلقة أكثر من 3 أيام — تحتاج مراجعة فورية` });
    if (deliveryRate > 0 && deliveryRate < 60) list.push({ severity: "warning", message: `معدل التسليم (${deliveryRate}%) أقل من المستهدف` });
    return list;
  }, [returnRate, noCompany, longPending, deliveryRate]);

  if (isLoading) {
    return (
      <div className="min-h-screen text-white p-4 md:p-6 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#e8b93f]/30 border-t-[#e8b93f] animate-spin" />
          <p className="text-white/50 text-sm">جاري تحميل التحليل الذكي للمخزون...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-400/20 flex items-center justify-center">
            <Brain className="w-5.5 h-5.5 text-violet-300" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white">تحليل المخزون الذكي</h1>
            <p className="text-xs text-white/40">تحليلات الشحن: الأداء، المرتجعات، الفروع، وتنبيهات ذكية — من آخر 200 شحنة</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <AlertsBanner alerts={alerts} />

      {/* Action Alerts — شحنات بدون شركة / معلقة */}
      {(noCompany > 0 || longPending > 0) && (
        <div className="space-y-2">
          <ActionAlertGroup
            count={noCompany} color="#f59e0b" icon={ShieldAlert}
            title={`${noCompany} شحنة بدون شركة شحن`}
            subtitle="شحنات مؤكدة لم تُسند لشركة شحن بعد — اضغط للعرض"
            list={noCompanyList}
          />
          <ActionAlertGroup
            count={longPending} color="#ef4444" icon={AlertCircle}
            title={`${longPending} شحنة معلقة أكثر من 3 أيام`}
            subtitle="تحتاج مراجعة فورية أو إلغاء — اضغط للعرض"
            list={longPendingList}
          />
        </div>
      )}

      {/* Hero KPIs */}
      <SectionCard>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`rounded-2xl border p-4 flex items-center gap-3 ${netProfit >= 0 ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-red-500/20 bg-red-500/[0.04]"}`}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: netProfit >= 0 ? "#22c55e22" : "#ef444422", color: netProfit >= 0 ? "#22c55e" : "#ef4444" }}>
              <CircleDollarSign className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">صافي المحصّل</p>
              <p className="text-lg font-black tabular-nums" style={{ color: netProfit >= 0 ? "#22c55e" : "#ef4444" }}>{fc3(netProfit)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/20 text-amber-400">
              <Clock3 className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">COD معلق في الطريق</p>
              <p className="text-lg font-black text-amber-400 tabular-nums">{fc3(pendingCOD)}</p>
            </div>
          </div>
          <div className={`rounded-2xl border p-4 flex items-center gap-3 ${deliveryRate >= 70 ? "border-blue-500/20 bg-blue-500/[0.04]" : "border-orange-500/20 bg-orange-500/[0.04]"}`}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: deliveryRate >= 70 ? "#3b82f622" : "#f9731622", color: deliveryRate >= 70 ? "#3b82f6" : "#f97316" }}>
              <Target className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">معدل التسليم</p>
              <p className="text-lg font-black tabular-nums" style={{ color: deliveryRate >= 70 ? "#3b82f6" : "#f97316" }}>{deliveryRate}%</p>
            </div>
          </div>
          <div className={`rounded-2xl border p-4 flex items-center gap-3 ${returnRate <= 15 ? "border-white/10 bg-white/[0.03]" : "border-red-500/20 bg-red-500/[0.04]"}`}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: returnRate <= 15 ? "#ffffff12" : "#ef444422", color: returnRate <= 15 ? "#ffffff80" : "#ef4444" }}>
              <RotateCcw className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">معدل الإرجاع</p>
              <p className="text-lg font-black tabular-nums" style={{ color: returnRate > 15 ? "#ef4444" : "#ffffff" }}>{returnRate}%</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* مناطق الإرجاع + أداء شركات الشحن */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={MapPin} title="مناطق الإرجاع الأعلى" subtitle="من آخر 200 شحنة" />
          <RankedBarList
            items={returnsByZone}
            color="#ef4444"
            accentColor="#f97316"
            emptyIcon={PackageCheck}
            emptyLabel="لا مرتجعات 🎉"
            expandable
          />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={Activity} title="أداء شركات الشحن" subtitle="مرتبة حسب الأداء (معدل تسليم + سرعة)" />
          <CompanyPerformancePanel companies={companyPerf} />
        </SectionCard>
      </div>

      {/* الشحنات حسب الفرع + حسب نوع الطرد */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={WarehouseIcon} title="الشحنات حسب الفرع" subtitle="من آخر 200 شحنة" />
          <RankedBarList items={byBranch} color="#3b82f6" emptyIcon={WarehouseIcon} emptyLabel="لا توجد بيانات" />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={Boxes} title="الشحنات حسب نوع الطرد" subtitle="من آخر 200 شحنة" />
          <RankedBarList items={byParcelType} color="#8b5cf6" emptyIcon={Boxes} emptyLabel="لا توجد بيانات" />
        </SectionCard>
      </div>

      {/* توزيع الحالات + ملخص مالي */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={PieChart} title="توزيع حالات الشحنات" subtitle={`${totalAll} إجمالي`} />
          <div className="space-y-2.5">
            {[
              { label: "تم التسليم",   count: delivered, color: "#22c55e" },
              { label: "في الطريق",    count: inTransit, color: "#8b5cf6" },
              { label: "مرتجع",        count: returned,  color: "#ef4444" },
              { label: "انتظار/مؤكد",  count: waiting,   color: "#eab308" },
            ].filter(r => r.count > 0).map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: row.color }} />
                <span className="text-[11px] text-white/50 flex-1">{row.label}</span>
                <span className="text-[11px] font-black" style={{ color: row.color }}>{row.count}</span>
                <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct(row.count, totalAll)}%`, background: row.color }} />
                </div>
                <span className="text-[9px] text-white/35 w-6 text-left">{pct(row.count, totalAll)}%</span>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={DollarSign} title="الملخص المالي للشحنات" />
          <div className="divide-y divide-white/5">
            {[
              { label: "إجمالي COD المتوقع",  value: totalCod,       color: "#ffffffcc", icon: CircleDollarSign },
              { label: "إجمالي المحصّل",       value: totalCollected, color: "#22c55e",   icon: PackageCheck     },
              { label: "إجمالي رسوم الشحن",   value: totalFee,       color: "#eab308",   icon: Truck            },
              { label: "COD معلق في الطريق",  value: pendingCOD,     color: "#8b5cf6",   icon: Clock3           },
              { label: "صافي (محصّل - رسوم)", value: netProfit,      color: netProfit >= 0 ? "#22c55e" : "#ef4444", icon: TrendingUp },
            ].map(row => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center gap-3 px-1 py-2.5">
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: row.color }} />
                  <span className="text-[11px] text-white/50 flex-1">{row.label}</span>
                  <span className="text-[12px] font-black tabular-nums" style={{ color: row.color }}>{fc3(row.value)}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Footer */}
      <p className="text-center text-[11px] text-white/25 pb-2">
        آخر تحديث: {new Date().toLocaleString("ar-EG")} — البيانات مبنية على آخر 200 شحنة
      </p>
    </div>
  );
}
