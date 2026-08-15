import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, TrendingUp, TrendingDown, Package, CheckCircle2, RotateCcw,
  Clock, MapPin, Truck, Wallet, Users, AlertTriangle, AlertCircle,
  Info, ChevronDown, ChevronUp, Activity, Timer, Percent,
} from "lucide-react";
import { analyticsApi, ShipmentsIntelligenceResponse } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════
const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0));
const fmtMoney = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0)) + " ج.م";
const fmtPct = (n: number) => `${n}%`;

function rateColor(pct: number, invert = false): string {
  const good = invert ? pct <= 10 : pct >= 80;
  const warn = invert ? pct <= 25 : pct >= 60;
  if (good) return "#22c55e";
  if (warn) return "#eab308";
  return "#ef4444";
}

const GRADE_META: Record<string, { label: string; color: string; glow: string }> = {
  excellent: { label: "ممتاز", color: "#22c55e", glow: "34,197,94" },
  good:      { label: "جيد",   color: "#e8b93f", glow: "232,185,63" },
  warning:   { label: "متوسط", color: "#f97316", glow: "249,115,22" },
  critical:  { label: "حرج",   color: "#ef4444", glow: "239,68,68" },
};

const ALERT_META: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertTriangle, color: "#ef4444", bg: "bg-red-500/10 border-red-500/30" },
  warning:  { icon: AlertCircle,   color: "#f97316", bg: "bg-orange-500/10 border-orange-500/30" },
  info:     { icon: Info,          color: "#06b6d4", bg: "bg-cyan-500/10 border-cyan-500/30" },
};

// ═══════════════════════════════════════════════════════════════════════════
// Health Score Gauge — العنصر المميز في الصفحة
// ═══════════════════════════════════════════════════════════════════════════
function HealthScoreGauge({ score, grade }: { score: number; grade: string }) {
  const meta = GRADE_META[grade] ?? GRADE_META.good;
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div className="relative flex flex-col items-center justify-center py-4">
      <div className="relative" style={{ width: 220, height: 220 }}>
        <svg width={220} height={220} viewBox="0 0 220 220" className="-rotate-90">
          <circle cx={110} cy={110} r={radius} fill="none" stroke="#1a1a1a" strokeWidth={14} />
          <motion.circle
            cx={110} cy={110} r={radius} fill="none"
            stroke={meta.color} strokeWidth={14} strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.4, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 10px rgba(${meta.glow},0.65))` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-5xl font-black tabular-nums"
            style={{ color: meta.color, textShadow: `0 0 20px rgba(${meta.glow},0.5)` }}
          >
            {score}
          </motion.span>
          <span className="text-xs text-white/40 mt-1">من 100</span>
          <span
            className="mt-2 px-3 py-1 rounded-full text-xs font-bold border"
            style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}15` }}
          >
            {meta.label}
          </span>
        </div>
        <div
          className="absolute inset-0 rounded-full pointer-events-none animate-pulse"
          style={{ boxShadow: `0 0 40px 4px rgba(${meta.glow},0.15)` }}
        />
      </div>
      <div className="mt-3 text-center">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 justify-center">
          <Brain className="w-5 h-5" style={{ color: "#e8b93f" }} />
          مؤشر صحة الشحنات
        </h2>
        <p className="text-xs text-white/40 mt-1">مركّب من معدل التسليم + الالتزام بالمواعيد + المرتجعات + السرعة</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KPI Tile
// ═══════════════════════════════════════════════════════════════════════════
function KpiTile({
  icon: Icon, label, value, sub, color = "#e8b93f", trend,
}: {
  icon: typeof Package; label: string; value: string; sub?: string; color?: string; trend?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 overflow-hidden"
      style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.02) inset` }}
    >
      <div
        className="absolute -top-8 -left-8 w-24 h-24 rounded-full blur-2xl opacity-20"
        style={{ background: color }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs text-white/50 mb-1">{label}</p>
          <p className="text-2xl font-black text-white tabular-nums">{value}</p>
          {sub && <p className="text-[11px] text-white/40 mt-1">{sub}</p>}
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}20`, color }}
        >
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      {trend !== undefined && (
        <div className="relative mt-2 flex items-center gap-1 text-[11px]" style={{ color: trend >= 0 ? "#22c55e" : "#ef4444" }}>
          {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(trend)}%
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section header + wrapper card
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

// ═══════════════════════════════════════════════════════════════════════════
// Chart tooltip (shared)
// ═══════════════════════════════════════════════════════════════════════════
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0a]/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
      {label && <p className="text-white/50 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-bold">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Status Distribution Donut
// ═══════════════════════════════════════════════════════════════════════════
function StatusDonut({ data }: { data: ShipmentsIntelligenceResponse["statusDistribution"] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="label"
              innerRadius={62} outerRadius={92} paddingAngle={2}
              stroke="none"
            >
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
              <span className="text-white/70">{d.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold tabular-nums">{fmt(d.value)}</span>
              <span className="text-white/40 text-xs w-9 text-left">{d.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Trend Area Chart
// ═══════════════════════════════════════════════════════════════════════════
function TrendChart({ data }: { data: ShipmentsIntelligenceResponse["trend"] }) {
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="siTotalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e8b93f" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#e8b93f" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="siDeliveredGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: "#ffffff60", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#ffffff60", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} labelFormatter={fmtDate} />
          <Area type="monotone" dataKey="total" name="إجمالي" stroke="#e8b93f" fill="url(#siTotalGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="delivered" name="تم التسليم" stroke="#22c55e" fill="url(#siDeliveredGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="returned" name="مرتجع" stroke="#ef4444" fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Aging Bars — أعمار الشحنات المعلقة حالياً
// ═══════════════════════════════════════════════════════════════════════════
function AgingBars({ data }: { data: ShipmentsIntelligenceResponse["agingAnalysis"] }) {
  const BUCKET_COLORS: Record<string, string> = {
    "0-3": "#22c55e", "4-7": "#eab308", "8-14": "#f97316", "15+": "#ef4444",
  };
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#ffffff60", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#ffffff60", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="count" name="عدد الشحنات" radius={[6, 6, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={BUCKET_COLORS[d.key] ?? "#e8b93f"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Ranked Row — شريط تقدّم متحرك (يُستخدم للمدن/الشركات/المناديب)
// ═══════════════════════════════════════════════════════════════════════════
function RankedRow({
  rank, name, total, successRate, sub, barColor,
}: {
  rank: number; name: string; total: number; successRate: number; sub?: string; barColor?: string;
}) {
  const color = barColor ?? rateColor(successRate);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span className="w-6 text-center text-xs font-bold text-white/30">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-white truncate">{name}</span>
          <span className="text-xs text-white/50 shrink-0 ms-2">{fmt(total)} شحنة{sub ? ` · ${sub}` : ""}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${successRate}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: color }}
          />
        </div>
      </div>
      <span className="w-11 text-left text-sm font-bold tabular-nums shrink-0" style={{ color }}>
        {successRate}%
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Detail Table — جدول تفصيلي كامل (كل الأعمدة/الأرقام) للمدن وشركات الشحن
// ═══════════════════════════════════════════════════════════════════════════
type DetailColumn<T> = { key: string; label: string; render: (row: T) => React.ReactNode; align?: "start" | "end" };

function DetailTable<T extends Record<string, any>>({
  rows, columns, emptyLabel = "لا توجد بيانات",
}: {
  rows: T[]; columns: DetailColumn<T>[]; emptyLabel?: string;
}) {
  if (!rows.length) {
    return <p className="text-center text-sm text-white/40 py-8">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-white/10">
            {columns.map(c => (
              <th
                key={c.key}
                className={`py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap ${c.align === "end" ? "text-left" : "text-right"}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
              className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
            >
              {columns.map(c => (
                <td key={c.key} className={`py-2.5 px-2 whitespace-nowrap ${c.align === "end" ? "text-left" : "text-right"}`}>
                  {c.render(row)}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}
    >
      {children}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Return Reasons Breakdown — تفصيلي: عدد + نسبة لكل سبب
// ═══════════════════════════════════════════════════════════════════════════
function ReturnReasonsBreakdown({ data }: { data: ShipmentsIntelligenceResponse["returnReasons"] }) {
  if (!data.length) {
    return <p className="text-center text-sm text-white/40 py-8">لا توجد مرتجعات في الفترة المختارة 👌</p>;
  }
  const maxCount = Math.max(...data.map(d => d.count));
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.reason}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-white/80">{d.label}</span>
            <span className="text-xs text-white/50">
              <span className="font-bold text-white">{fmt(d.count)}</span> شحنة · {d.pct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(d.count / maxCount) * 100}%` }}
              transition={{ duration: 0.7, delay: i * 0.05, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg,#ef4444,#f97316)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Financial Pulse Panel — النبض المالي (COD)
// ═══════════════════════════════════════════════════════════════════════════
function FinancialPulsePanel({ data }: { data: ShipmentsIntelligenceResponse["financialPulse"] }) {
  const gap = data.codExpected - data.codCollected;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] text-white/40 mb-1">COD متوقع</p>
          <p className="text-lg font-black text-white tabular-nums">{fmtMoney(data.codExpected)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] text-white/40 mb-1">COD محصّل</p>
          <p className="text-lg font-black text-[#22c55e] tabular-nums">{fmtMoney(data.codCollected)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] text-white/40 mb-1">فرق غير محصّل</p>
          <p className="text-lg font-black tabular-nums" style={{ color: gap > 0 ? "#ef4444" : "#22c55e" }}>
            {fmtMoney(Math.abs(gap))}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] text-white/40 mb-1">إجمالي مصاريف الشحن</p>
          <p className="text-lg font-black text-[#e8b93f] tabular-nums">{fmtMoney(data.shippingFeesTotal)}</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-white/70">نسبة التحصيل</span>
          <span className="text-sm font-bold" style={{ color: rateColor(data.collectionRate) }}>{data.collectionRate}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${data.collectionRate}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: rateColor(data.collectionRate) }}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center rounded-xl border border-white/10 bg-white/[0.02] py-2.5">
          <p className="text-base font-bold text-white">{fmt(data.paymentMix.cod)}</p>
          <p className="text-[11px] text-white/40">دفع عند الاستلام</p>
        </div>
        <div className="text-center rounded-xl border border-white/10 bg-white/[0.02] py-2.5">
          <p className="text-base font-bold text-white">{fmt(data.paymentMix.prepaid)}</p>
          <p className="text-[11px] text-white/40">مدفوع مقدمًا</p>
        </div>
        <div className="text-center rounded-xl border border-white/10 bg-white/[0.02] py-2.5">
          <p className="text-base font-bold text-white">{fmt(data.paymentMix.deferred)}</p>
          <p className="text-[11px] text-white/40">آجل</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Alerts Banner
// ═══════════════════════════════════════════════════════════════════════════
function AlertsBanner({ alerts }: { alerts: ShipmentsIntelligenceResponse["alerts"] }) {
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const meta = ALERT_META[a.level] ?? ALERT_META.info;
        const Icon = meta.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${meta.bg}`}
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
// Period Switcher
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
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
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
// Collapsible section wrapper — للأقسام التفصيلية الطويلة
// ═══════════════════════════════════════════════════════════════════════════
function CollapsibleDetail({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm font-bold text-white/70 hover:text-white transition-colors mb-3"
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
export default function ShipmentsIntelligencePage() {
  const [period, setPeriod] = useState("month");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["analytics", "shipments-intelligence", period],
    queryFn: () => analyticsApi.shipmentsIntelligence({ period }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white p-4 md:p-6 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#e8b93f]/30 border-t-[#e8b93f] animate-spin" />
          <p className="text-white/50 text-sm">جاري تحميل تحليل الشحنات الذكي...</p>
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

  const { kpis } = data;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-400/20 flex items-center justify-center">
            <Brain className="w-5.5 h-5.5 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white">تحليل الشحنات الذكي</h1>
            <p className="text-xs text-white/40">تحليل تفصيلي شامل لأداء الشحنات — مبني على بيانات الشحنات الفعلية فقط</p>
          </div>
        </div>
        <PeriodSwitcher value={period} onChange={setPeriod} />
      </div>

      {/* Alerts */}
      <AlertsBanner alerts={data.alerts} />

      {/* Hero: Health Score + KPIs */}
      <SectionCard>
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-center">
          <HealthScoreGauge score={data.healthScore} grade={data.healthGrade} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile icon={Package} label="إجمالي الشحنات" value={fmt(kpis.total)} color="#e8b93f" />
            <KpiTile icon={CheckCircle2} label="تم التسليم" value={fmt(kpis.delivered)} sub={`${kpis.deliveryRate}%`} color="#22c55e" />
            <KpiTile icon={RotateCcw} label="مرتجعة" value={fmt(kpis.returned)} sub={`${kpis.returnRate}%`} color="#ef4444" />
            <KpiTile icon={Timer} label="الالتزام بالمواعيد" value={fmtPct(kpis.onTimeRate)} color="#06b6d4" />
            <KpiTile icon={Clock} label="متوسط زمن التسليم" value={`${kpis.avgDeliveryHours} س`} color="#8b5cf6" />
            <KpiTile icon={Percent} label="معدل التسليم" value={fmtPct(kpis.deliveryRate)} color="#22c55e" />
            <KpiTile icon={Activity} label="معدل المرتجعات" value={fmtPct(kpis.returnRate)} color="#ef4444" />
            <KpiTile icon={Truck} label="شركات الشحن النشطة" value={fmt(data.companyPerformance.length)} color="#f97316" />
          </div>
        </div>
      </SectionCard>

      {/* Status distribution + Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={Activity} title="توزيع حالات الشحنات" subtitle="الصورة الحالية لكل الشحنات النشطة" />
          <StatusDonut data={data.statusDistribution} />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={TrendingUp} title="الاتجاه الزمني" subtitle="إجمالي / تم التسليم / مرتجع خلال الفترة" />
          <TrendChart data={data.trend} />
        </SectionCard>
      </div>

      {/* Aging */}
      <SectionCard>
        <SectionHeader icon={Clock} title="تحليل أعمار الشحنات المعلقة" subtitle="عدد الشحنات المعلقة حاليًا حسب عمرها منذ الإنشاء" />
        <AgingBars data={data.agingAnalysis} />
      </SectionCard>

      {/* أداء المدن — تفصيلي كامل */}
      <SectionCard>
        <SectionHeader icon={MapPin} title="أداء المدن" subtitle="ترتيب حسب حجم الشحنات — تفصيل كامل لكل مدينة" />
        <div className="space-y-1">
          {data.cityPerformance.slice(0, 8).map((c, i) => (
            <RankedRow key={c.city} rank={i + 1} name={c.city} total={c.total} successRate={c.successRate} />
          ))}
        </div>
        <CollapsibleDetail title={`عرض الجدول التفصيلي الكامل (${data.cityPerformance.length} مدينة)`}>
          <DetailTable
            rows={data.cityPerformance}
            emptyLabel="لا توجد بيانات مدن في هذه الفترة"
            columns={[
              { key: "city", label: "المدينة", render: r => <span className="font-bold text-white">{r.city}</span> },
              { key: "total", label: "إجمالي", render: r => fmt(r.total), align: "end" },
              { key: "delivered", label: "تم التسليم", render: r => <span className="text-[#22c55e]">{fmt(r.delivered)}</span>, align: "end" },
              { key: "returned", label: "مرتجع", render: r => <span className="text-[#ef4444]">{fmt(r.returned)}</span>, align: "end" },
              { key: "successRate", label: "نسبة النجاح", render: r => <Pill color={rateColor(r.successRate)}>{r.successRate}%</Pill>, align: "end" },
              { key: "returnRate", label: "نسبة المرتجع", render: r => <Pill color={rateColor(r.returnRate, true)}>{r.returnRate}%</Pill>, align: "end" },
              { key: "codValue", label: "قيمة COD", render: r => <span className="tabular-nums">{fmtMoney(r.codValue)}</span>, align: "end" },
            ]}
          />
        </CollapsibleDetail>
      </SectionCard>

      {/* أداء شركات الشحن — تفصيلي كامل */}
      <SectionCard>
        <SectionHeader icon={Truck} title="أداء شركات الشحن" subtitle="مقارنة كاملة بين كل شركات الشحن المستخدمة" />
        <div className="space-y-1">
          {data.companyPerformance.slice(0, 6).map((c, i) => (
            <RankedRow key={String(c.companyId)} rank={i + 1} name={c.companyName} total={c.total} successRate={c.successRate} sub={`${c.avgDeliveryHours} س متوسط`} />
          ))}
        </div>
        <CollapsibleDetail title={`عرض الجدول التفصيلي الكامل (${data.companyPerformance.length} شركة)`}>
          <DetailTable
            rows={data.companyPerformance}
            emptyLabel="لا توجد بيانات شركات شحن في هذه الفترة"
            columns={[
              { key: "companyName", label: "الشركة", render: r => <span className="font-bold text-white">{r.companyName}</span> },
              { key: "total", label: "إجمالي", render: r => fmt(r.total), align: "end" },
              { key: "delivered", label: "تم التسليم", render: r => <span className="text-[#22c55e]">{fmt(r.delivered)}</span>, align: "end" },
              { key: "returned", label: "مرتجع", render: r => <span className="text-[#ef4444]">{fmt(r.returned)}</span>, align: "end" },
              { key: "successRate", label: "نسبة النجاح", render: r => <Pill color={rateColor(r.successRate)}>{r.successRate}%</Pill>, align: "end" },
              { key: "returnRate", label: "نسبة المرتجع", render: r => <Pill color={rateColor(r.returnRate, true)}>{r.returnRate}%</Pill>, align: "end" },
              { key: "avgDeliveryHours", label: "متوسط زمن التسليم", render: r => `${r.avgDeliveryHours} س`, align: "end" },
              { key: "totalFees", label: "إجمالي مصاريف الشحن", render: r => <span className="tabular-nums">{fmtMoney(r.totalFees)}</span>, align: "end" },
            ]}
          />
        </CollapsibleDetail>
      </SectionCard>

      {/* أسباب المرتجعات + النبض المالي */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={RotateCcw} title="تحليل أسباب المرتجعات" subtitle="تفصيل كل سبب بالعدد والنسبة" />
          <ReturnReasonsBreakdown data={data.returnReasons} />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={Wallet} title="النبض المالي" subtitle="التحصيل النقدي عند الاستلام (COD) ومصاريف الشحن" />
          <FinancialPulsePanel data={data.financialPulse} />
        </SectionCard>
      </div>

      {/* أداء المناديب */}
      <SectionCard>
        <SectionHeader icon={Users} title="أداء المناديب / المسؤولين عن الشحنات" subtitle="أعلى 10 حسب حجم الشحنات المُدارة" />
        {data.repPerformance.length === 0 ? (
          <p className="text-center text-sm text-white/40 py-8">لا توجد شحنات مرتبطة بمناديب في هذه الفترة</p>
        ) : (
          <div className="space-y-1">
            {data.repPerformance.map((r, i) => (
              <RankedRow key={r.userId} rank={i + 1} name={r.name} total={r.total} successRate={r.successRate} sub={`${fmt(r.returned)} مرتجع`} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Footer */}
      <p className="text-center text-[11px] text-white/25 pb-2">
        آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")} — البيانات مبنية على جدول الشحنات فقط
      </p>
    </div>
  );
}
