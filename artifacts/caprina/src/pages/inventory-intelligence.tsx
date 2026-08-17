import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, TrendingUp, TrendingDown, Minus, Sparkles, Package, Boxes,
  AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, Warehouse,
  Wallet, PackageX, PackageCheck, Recycle, ShieldAlert,
} from "lucide-react";
import { analyticsApi, InventoryIntelligenceResponse } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (نفس منطق zones-intelligence.tsx / shipments-intelligence.tsx لثبات الهوية البصرية)
// ═══════════════════════════════════════════════════════════════════════════
const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0));
const fmtMoney = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0));

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  fast:   { label: "حركة سريعة", color: "#22c55e" },
  medium: { label: "حركة متوسطة", color: "#06b6d4" },
  slow:   { label: "حركة بطيئة", color: "#eab308" },
  stale:  { label: "راكد", color: "#f97316" },
  out:    { label: "نفد المخزون", color: "#ef4444" },
};

const ALERT_META: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertTriangle, color: "#ef4444", bg: "bg-red-500/10 border-red-500/30" },
  warning:  { icon: AlertCircle,   color: "#f97316", bg: "bg-orange-500/10 border-orange-500/30" },
  info:     { icon: Info,          color: "#06b6d4", bg: "bg-cyan-500/10 border-cyan-500/30" },
};

const WAREHOUSE_STATUS_META: Record<string, { label: string; color: string }> = {
  balanced:     { label: "توزيع متوازن بين المخازن", color: "#22c55e" },
  concentrated: { label: "تركّز في مخزن واحد",         color: "#eab308" },
  critical:     { label: "اعتماد خطر على مخزن واحد",   color: "#ef4444" },
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
// Trend Badge — سهم اتجاه سرعة البيع مقابل الفترة السابقة
// ═══════════════════════════════════════════════════════════════════════════
function TrendBadge({ trendPct }: { trendPct: number | null }) {
  if (trendPct === null) {
    return <span className="text-[11px] text-white/35 font-bold">بدون مقارنة</span>;
  }
  if (Math.abs(trendPct) < 5) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-white/45">
        <Minus className="w-3 h-3" /> ثابت
      </span>
    );
  }
  const up = trendPct > 0;
  return (
    <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: up ? "#22c55e" : "#ef4444" }}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(trendPct)}%
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Ranking Card — كارت منتج واحد (فئة الحركة + سرعة + اتجاه)
// ═══════════════════════════════════════════════════════════════════════════
function RankingCard({ row, index }: { row: InventoryIntelligenceResponse["ranking"][number]; index: number }) {
  const meta = CATEGORY_META[row.category] ?? CATEGORY_META.stale;
  const stockoutPct = row.daysUntilStockout !== null ? Math.max(0, Math.min(100, 100 - (row.daysUntilStockout / 30) * 100)) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -2 }}
      className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 overflow-hidden transition-colors duration-300 hover:border-white/20"
    >
      <div
        className="absolute -top-8 -left-8 w-24 h-24 rounded-full blur-2xl opacity-15 transition-opacity duration-300 hover:opacity-30"
        style={{ background: meta.color }}
      />
      <div className="relative flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{row.name}</p>
          <p className="text-[11px] text-white/40 mt-0.5">
            {row.sku ? `${row.sku} · ` : ""}{fmt(row.availableQty)} قطعة متاحة
          </p>
        </div>
        {row.category !== "out" ? (
          <MiniRing pct={row.daysUntilStockout !== null ? (100 - stockoutPct) : 100} color={meta.color} size={46} />
        ) : (
          <div className="w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0" style={{ background: `${meta.color}18` }}>
            <PackageX className="w-5 h-5" style={{ color: meta.color }} />
          </div>
        )}
      </div>
      <div className="relative mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-white/35">مبيعات الفترة</p>
          <p className="text-xs font-bold tabular-nums text-white/70">{fmt(row.soldInRange)}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/35">سرعة/يوم</p>
          <p className="text-xs font-bold tabular-nums text-white/70">{row.velocityPerDay}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/35">ينفد خلال</p>
          <p className="text-xs font-bold tabular-nums text-white/70">{row.daysUntilStockout !== null ? `${row.daysUntilStockout} يوم` : "—"}</p>
        </div>
      </div>
      <div className="relative mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
        <Pill color={meta.color}>{meta.label}</Pill>
        <TrendBadge trendPct={row.trendPct} />
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Frozen Capital Table — أعلى المنتجات تجميدًا لرأس المال (بطيئة/راكدة)
// ═══════════════════════════════════════════════════════════════════════════
function FrozenCapitalTable({ data }: { data: InventoryIntelligenceResponse["frozenCapitalRanking"] }) {
  if (!data.length) {
    return <p className="text-center text-sm text-white/40 py-8">لا يوجد رأس مال مجمّد في منتجات بطيئة أو راكدة حاليًا</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-right">المنتج</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">الكمية</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">رأس المال المجمّد</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">التصنيف</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const meta = CATEGORY_META[r.category] ?? CATEGORY_META.stale;
            return (
              <motion.tr
                key={r.productId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
                className="border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02]"
              >
                <td className="py-2.5 px-2 whitespace-nowrap text-right font-medium text-white">{r.name}</td>
                <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-white/70">{fmt(r.availableQty)}</td>
                <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-white/70">{fmtMoney(r.frozenCapital)} ج.م</td>
                <td className="py-2.5 px-2 whitespace-nowrap text-left"><Pill color={meta.color}>{meta.label}</Pill></td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Warehouse Distribution — توزيع المخزون بين المخازن (Bar chart بسيط بنفس هوية الصفحة)
// ═══════════════════════════════════════════════════════════════════════════
function WarehouseDistributionPanel({ data }: { data: InventoryIntelligenceResponse["warehouseDistribution"] }) {
  const statusMeta = WAREHOUSE_STATUS_META[data.status] ?? WAREHOUSE_STATUS_META.balanced;
  if (!data.warehouses.length) {
    return <p className="text-center text-sm text-white/40 py-8">لا يوجد مخزون مسجّل في أي مخزن حاليًا</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Warehouse className="w-4 h-4" style={{ color: statusMeta.color }} />
          <span className="text-sm font-bold" style={{ color: statusMeta.color }}>{statusMeta.label}</span>
        </div>
        <span className="text-xs text-white/45">أعلى مخزن يشيل {data.topWarehouseSharePct}% من المخزون</span>
      </div>
      <div className="space-y-2.5">
        {data.warehouses.slice(0, 8).map((w, i) => (
          <div key={w.id}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-white/75 font-medium truncate">{w.name}{w.city ? ` · ${w.city}` : ""}</span>
              <span className="text-white/45 tabular-nums shrink-0">{fmt(w.totalQty)} · {w.sharePct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, w.sharePct)}%` }}
                transition={{ duration: 0.6, delay: Math.min(i * 0.04, 0.4), ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: w.sharePct >= 50 ? "#ef4444" : w.sharePct >= 30 ? "#eab308" : "#22c55e" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Movements Breakdown — توزيع حركات المخزون حسب السبب (IN/OUT) في الفترة
// ═══════════════════════════════════════════════════════════════════════════
function MovementsBreakdownPanel({ data }: { data: InventoryIntelligenceResponse["movementsBreakdown"] }) {
  if (!data.length) {
    return <p className="text-center text-sm text-white/40 py-8">لا توجد حركات مخزون مسجّلة في هذه الفترة</p>;
  }
  const maxTotal = Math.max(...data.map(d => d.total), 1);
  return (
    <div className="space-y-1">
      {data.slice(0, 10).map((r, i) => (
        <motion.div
          key={r.reason}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
          className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02] rounded-lg px-1"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-white truncate">{r.label}</span>
              <span className="text-xs text-white/45 tabular-nums shrink-0">
                {r.in > 0 && <span className="text-emerald-400">+{fmt(r.in)}</span>}
                {r.in > 0 && r.out > 0 && "  ·  "}
                {r.out > 0 && <span className="text-rose-400">-{fmt(r.out)}</span>}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(r.total / maxTotal) * 100}%` }}
                transition={{ duration: 0.6, delay: Math.min(i * 0.04, 0.4), ease: "easeOut" }}
                className="h-full rounded-full bg-[#e8b93f]"
              />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Alerts Banner — تنبيهات ذكية خاصة بالمخزون
// ═══════════════════════════════════════════════════════════════════════════
function AlertsBanner({ alerts }: { alerts: InventoryIntelligenceResponse["alerts"] }) {
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
// Period Switcher — نفس ستايل zones-intelligence.tsx
// ═══════════════════════════════════════════════════════════════════════════
const PERIODS: { key: string; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "أسبوع" },
  { key: "month", label: "شهر" },
  { key: "year", label: "سنة" },
];

function PeriodSwitcher({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {PERIODS.map(p => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors duration-200 ${
            value === p.key ? "bg-[#e8b93f] text-black" : "text-white/60 hover:text-white"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Collapsible section wrapper
// ═══════════════════════════════════════════════════════════════════════════
function CollapsibleDetail({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm font-bold text-white/70 hover:text-white transition-colors duration-200 mb-3"
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {title}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: "hidden" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ═══════════════════════════════════════════════════════════════════════════
export default function InventoryIntelligencePage() {
  const [period, setPeriod] = useState("month");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["analytics", "inventory-intelligence", period],
    queryFn: () => analyticsApi.inventoryIntelligence({ period }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white p-4 md:p-6 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#e8b93f]/30 border-t-[#e8b93f] animate-spin" />
          <p className="text-white/50 text-sm">جاري تحميل التحليل الذكي للمخزون...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white p-4 md:p-6 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-white/70">تعذّر تحميل البيانات{error instanceof Error ? `: ${error.message}` : ""}</p>
        </div>
      </div>
    );
  }

  const topRisky = data.ranking.filter(r => r.category === "out" || r.category === "fast").slice(0, 3);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-400/20 flex items-center justify-center">
            <Brain className="w-5.5 h-5.5 text-violet-300" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white">تحليل المخزون الذكي</h1>
            <p className="text-xs text-white/40">سرعة الحركة، رأس المال المجمّد، توزيع المخازن، وتنبيهات ذكية لكل منتج</p>
          </div>
        </div>
        <PeriodSwitcher value={period} onChange={setPeriod} />
      </div>

      {/* Alerts */}
      <AlertsBanner alerts={data.alerts} />

      {/* Hero KPIs */}
      <SectionCard>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#e8b93f]/20 text-[#e8b93f]">
              <Boxes className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">إجمالي المنتجات</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.kpis.totalProducts)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#06b6d4]/20 text-[#06b6d4]">
              <Package className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">إجمالي القطع بالمخزون</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.kpis.totalUnitsInStock)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#ef4444]/20 text-[#ef4444]">
              <PackageX className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">نافد المخزون</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.kpis.outOfStockCount)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#eab308]/20 text-[#eab308]">
              <AlertCircle className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">مخزون منخفض</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.kpis.lowStockCount)}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Financial KPIs */}
      <SectionCard>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#f97316]/20 text-[#f97316]">
              <Wallet className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">رأس مال مجمّد</p>
              <p className="text-lg font-black text-white tabular-nums">{fmtMoney(data.kpis.totalFrozenCapital)} ج.م</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#8b5cf6]/20 text-[#8b5cf6]">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">إيراد محتمل من المخزون</p>
              <p className="text-lg font-black text-white tabular-nums">{fmtMoney(data.kpis.totalPotentialRevenue)} ج.م</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#22c55e]/20 text-[#22c55e]">
              <PackageCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">مبيعات الفترة (قطعة)</p>
              <p className="text-lg font-black text-white tabular-nums">{fmt(data.kpis.totalSoldInRange)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#ef4444]/20 text-[#ef4444]">
              <ShieldAlert className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">تالف الفترة</p>
              <p className="text-lg font-black text-white tabular-nums">{fmt(data.kpis.totalDamagedInRange)}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* منتجات تحتاج انتباه فوري — نافدة أو سريعة الحركة (فرصة/خطر) */}
      {topRisky.length > 0 && (
        <SectionCard>
          <SectionHeader icon={AlertTriangle} title="منتجات تحتاج انتباه فوري" subtitle="نافدة من المخزون أو حركتها سريعة جدًا وقربانة تخلص" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topRisky.map((r, i) => <RankingCard key={r.productId} row={r} index={i} />)}
          </div>
        </SectionCard>
      )}

      {/* الترتيب الكامل */}
      <SectionCard>
        <SectionHeader icon={TrendingUp} title="كل المنتجات حسب سرعة الحركة" subtitle="من الأسرع حركة (فرصة نمو) إلى الراكد والنافد (يحتاج مراجعة)" />
        {data.ranking.length === 0 ? (
          <p className="text-center text-sm text-white/40 py-8">لا توجد منتجات مسجّلة</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.ranking.slice(0, 6).map((r, i) => <RankingCard key={r.productId} row={r} index={i} />)}
            </div>
            {data.ranking.length > 6 && (
              <CollapsibleDetail title={`عرض باقي المنتجات (${data.ranking.length - 6})`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.ranking.slice(6).map((r, i) => <RankingCard key={r.productId} row={r} index={i} />)}
                </div>
              </CollapsibleDetail>
            )}
          </>
        )}
      </SectionCard>

      {/* رأس المال المجمّد + توزيع المخازن */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={Wallet} title="رأس المال المجمّد" subtitle="أعلى المنتجات البطيئة أو الراكدة اللي مجمّدة فيها فلوس بدون حركة بيع كافية" />
          <FrozenCapitalTable data={data.frozenCapitalRanking} />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={Warehouse} title="توزيع المخزون بين المخازن" subtitle="هل المخزون موزّع بعدل بين المخازن ولا مخزن واحد شايل كل الحمل؟" />
          <WarehouseDistributionPanel data={data.warehouseDistribution} />
        </SectionCard>
      </div>

      {/* حركات المخزون حسب السبب */}
      <SectionCard>
        <SectionHeader icon={Recycle} title="حركات المخزون حسب السبب" subtitle="توزيع كل حركات الإدخال والإخراج في الفترة المختارة حسب سببها" />
        <MovementsBreakdownPanel data={data.movementsBreakdown} />
      </SectionCard>

      {/* Footer */}
      <p className="text-center text-[11px] text-white/25 pb-2">
        آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")} — {data.periodLabel} — البيانات مبنية على جداول المنتجات والمخازن وحركات المخزون فقط
      </p>
    </div>
  );
}
