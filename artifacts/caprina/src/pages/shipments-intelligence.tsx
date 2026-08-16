import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, TrendingUp, TrendingDown, Package, CheckCircle2, RotateCcw,
  Clock, MapPin, Truck, AlertTriangle, AlertCircle,
  Info, ChevronDown, ChevronUp, Activity, Timer, Percent, Zap, Gauge,
} from "lucide-react";
import { analyticsApi, ShipmentsIntelligenceResponse } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════
const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0));
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
// Ring Gauge — دائرة تقدّم موحّدة (نفس ستايل التطبيق: فجوة علوية + حواف مدورة)
// تُستخدم لأي مؤشر دائري في الصفحة (Health Score، نسب النجاح، إلخ)
// ═══════════════════════════════════════════════════════════════════════════
function RingGauge({
  value, max = 100, size = 220, strokeWidth = 20, color, label, sub,
  gapDeg = 26,
}: {
  value: number; max?: number; size?: number; strokeWidth?: number; color: string;
  label: string; sub?: string; gapDeg?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // فجوة علوية بمقدار gapDeg درجة، مقسومة على جانبين حول أعلى الدائرة (12 o'clock)
  const gapLen = (gapDeg / 360) * circumference;
  const arcLen = circumference - gapLen;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const filledLen = (pct / 100) * arcLen;

  return (
    <div
      className="relative inline-flex items-center justify-center transition-transform duration-300 outline-none focus:outline-none focus-visible:outline-none border-0 select-none"
      style={{ width: size, height: size, WebkitTapHighlightColor: "transparent" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      tabIndex={-1}
    >
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ transform: `rotate(${90 + gapDeg / 2}deg)`, outline: "none", display: "block" }}
      >
        {/* المسار الخلفي (الفاضي) */}
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="#ffffff12" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference}`}
        />
        {/* المسار الممتلئ */}
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference}`}
          initial={{ strokeDashoffset: arcLen }}
          animate={{
            strokeDashoffset: arcLen - filledLen,
            filter: hovered
              ? `drop-shadow(0 0 16px ${color}) drop-shadow(0 0 4px ${color})`
              : `drop-shadow(0 0 8px ${color}88)`,
          }}
          transition={{ strokeDashoffset: { duration: 1.2, ease: "easeOut" }, filter: { duration: 0.35, ease: "easeInOut" } }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="font-black text-white tabular-nums"
          style={{ fontSize: size * 0.19 }}
        >
          {fmt(value)}
        </motion.span>
        <span className="text-white/45 mt-0.5" style={{ fontSize: size * 0.055 }}>{label}</span>
        {sub && (
          <span
            className="mt-2 px-2.5 py-0.5 rounded-full font-bold border transition-opacity duration-300"
            style={{ color, borderColor: `${color}55`, background: `${color}15`, fontSize: size * 0.05, opacity: hovered ? 1 : 0.85 }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Health Score Gauge — العنصر المميز في الصفحة (يستخدم RingGauge)
// ═══════════════════════════════════════════════════════════════════════════
function HealthScoreGauge({ score, grade }: { score: number; grade: string }) {
  const meta = GRADE_META[grade] ?? GRADE_META.good;
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <RingGauge value={score} max={100} size={220} strokeWidth={18} color={meta.color} label="من 100" sub={meta.label} />
      <div className="mt-2 text-center">
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
      whileHover={{ y: -2 }}
      className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-4 overflow-hidden transition-colors duration-300 hover:border-white/20"
    >
      <div
        className="absolute -top-8 -left-8 w-24 h-24 rounded-full blur-2xl opacity-20 transition-opacity duration-300 group-hover:opacity-35"
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
        <p key={i} style={{ color: p.color || p.stroke }} className="font-bold">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Status Distribution — دائرة رئيسية (إجمالي الشحنات) + تفصيل كل حالة بشريط
// نفس ستايل الصورة المرجعية بالظبط
// ═══════════════════════════════════════════════════════════════════════════
function StatusDonut({ data, total }: { data: ShipmentsIntelligenceResponse["statusDistribution"]; total: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const top = hoveredIdx !== null ? data[hoveredIdx] : data[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <div className="flex justify-center">
        <RingGauge
          value={total} max={total} size={210} strokeWidth={20}
          color={top?.color ?? "#e8b93f"} label="إجمالي الشحنات"
        />
      </div>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <motion.div
            key={d.status}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="flex items-center justify-between text-sm rounded-lg px-2 py-1.5 transition-colors duration-200 cursor-default hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full transition-transform duration-200"
                style={{ background: d.color, transform: hoveredIdx === i ? "scale(1.3)" : "scale(1)" }}
              />
              <span className="text-white/70">{d.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold tabular-nums">{fmt(d.value)}</span>
              <span className="text-white/40 text-xs w-9 text-left">{d.pct}%</span>
            </div>
          </motion.div>
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
// Aging Line — تحليل أعمار الشحنات المعلقة كخط احترافي (بدل الأعمدة)
// ═══════════════════════════════════════════════════════════════════════════
function AgingLine({ data }: { data: ShipmentsIntelligenceResponse["agingAnalysis"] }) {
  const worst = data[data.length - 1];
  const lineColor = worst && worst.count > 0 ? rateColor(0) : "#e8b93f"; // أحمر لو فيه تراكم في أعلى شريحة عمر
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="siAgingGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#ffffff60", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#ffffff60", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone" dataKey="count" name="عدد الشحنات"
            stroke="#f97316" strokeWidth={2.5} fill="url(#siAgingGrad)"
            dot={{ r: 4, fill: "#f97316", strokeWidth: 2, stroke: "#0a0f1e" }}
            activeDot={{ r: 6, fill: "#f97316", strokeWidth: 2, stroke: "#0a0f1e" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Mini Ring — دائرة صغيرة بنفس ستايل RingGauge، تُستخدم داخل الصفوف المرتّبة
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
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(101deg)", outline: "none", display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#ffffff12" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={`${arcLen} ${circumference}`} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference}`}
          initial={{ strokeDashoffset: arcLen }}
          animate={{ strokeDashoffset: arcLen - filledLen, filter: hovered ? `drop-shadow(0 0 6px ${color})` : "none" }}
          transition={{ strokeDashoffset: { duration: 0.8, ease: "easeOut" }, filter: { duration: 0.25 } }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums" style={{ color }}>
        {Math.round(pct)}%
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Ranked Row — صف مرتّب بدائرة صغيرة (يُستخدم للمدن/الشركات/المناديب)
// ═══════════════════════════════════════════════════════════════════════════
function RankedRow({
  rank, name, total, successRate, sub, ringColor,
}: {
  rank: number; name: string; total: number; successRate: number; sub?: string; ringColor?: string;
}) {
  const color = ringColor ?? rateColor(successRate);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02] rounded-lg px-1">
      <span className="w-6 text-center text-xs font-bold text-white/30">{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{name}</p>
        <p className="text-xs text-white/45 mt-0.5">{fmt(total)} شحنة{sub ? ` · ${sub}` : ""}</p>
      </div>
      <MiniRing pct={successRate} color={color} />
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
              className="border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02]"
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
      className="px-2 py-0.5 rounded-full text-xs font-bold transition-opacity duration-200 hover:opacity-80"
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
        <div key={d.reason} className="group">
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
              className="h-full rounded-full transition-opacity duration-200 group-hover:opacity-80"
              style={{ background: "linear-gradient(90deg,#ef4444,#f97316)" }}
            />
          </div>
        </div>
      ))}
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
// Delivery Intelligence Panel — تحليل زمن التسليم الذكي (بديل القسم المالي)
// مبني بالكامل على بيانات الشحنات: الالتزام بالمواعيد + سرعة كل شركة
// ═══════════════════════════════════════════════════════════════════════════
function DeliveryIntelligencePanel({ data }: { data: ShipmentsIntelligenceResponse }) {
  const { kpis, companyPerformance } = data;
  const fastest = [...companyPerformance].filter(c => c.avgDeliveryHours > 0).sort((a, b) => a.avgDeliveryHours - b.avgDeliveryHours)[0];
  const slowest = [...companyPerformance].filter(c => c.avgDeliveryHours > 0).sort((a, b) => b.avgDeliveryHours - a.avgDeliveryHours)[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div className="flex justify-center">
          <RingGauge value={kpis.onTimeRate} max={100} size={150} strokeWidth={13} color={rateColor(kpis.onTimeRate)} label="الالتزام بالمواعيد" sub={`${kpis.avgDeliveryHours} ساعة متوسط`} />
        </div>
        <div className="space-y-2.5">
          {fastest && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="w-8 h-8 rounded-lg bg-[#22c55e]/15 text-[#22c55e] flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white/45">الأسرع في التسليم</p>
                <p className="text-sm font-bold text-white truncate">{fastest.companyName} · {fastest.avgDeliveryHours} ساعة</p>
              </div>
            </div>
          )}
          {slowest && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="w-8 h-8 rounded-lg bg-[#ef4444]/15 text-[#ef4444] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white/45">الأبطأ في التسليم</p>
                <p className="text-sm font-bold text-white truncate">{slowest.companyName} · {slowest.avgDeliveryHours} ساعة</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-white/40 mb-2">متوسط زمن التسليم لكل شركة</p>
        <div className="space-y-1">
          {companyPerformance.filter(c => c.avgDeliveryHours > 0).sort((a, b) => a.avgDeliveryHours - b.avgDeliveryHours).slice(0, 6).map((c, i) => (
            <div key={String(c.companyId)} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02] rounded-lg px-1">
              <span className="w-6 text-center text-xs font-bold text-white/30">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{c.companyName}</p>
                <p className="text-xs text-white/45 mt-0.5">{fmt(c.total)} شحنة · نجاح {c.successRate}%</p>
              </div>
              <span className="text-sm font-bold tabular-nums text-[#06b6d4] shrink-0">{c.avgDeliveryHours} س</span>
            </div>
          ))}
        </div>
      </div>
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
// Collapsible section wrapper — للأقسام التفصيلية الطويلة
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
          <StatusDonut data={data.statusDistribution} total={data.statusDistribution.reduce((s, d) => s + d.value, 0)} />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={TrendingUp} title="الاتجاه الزمني" subtitle="إجمالي / تم التسليم / مرتجع خلال الفترة" />
          <TrendChart data={data.trend} />
        </SectionCard>
      </div>

      {/* Aging — line chart احترافي */}
      <SectionCard>
        <SectionHeader icon={Clock} title="تحليل أعمار الشحنات المعلقة" subtitle="عدد الشحنات المعلقة حاليًا حسب عمرها منذ الإنشاء" />
        <AgingLine data={data.agingAnalysis} />
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
            ]}
          />
        </CollapsibleDetail>
      </SectionCard>

      {/* أسباب المرتجعات + تحليل زمن التسليم الذكي (بديل القسم المالي) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={RotateCcw} title="تحليل أسباب المرتجعات" subtitle="تفصيل كل سبب بالعدد والنسبة" />
          <ReturnReasonsBreakdown data={data.returnReasons} />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={Gauge} title="تحليل زمن التسليم الذكي" subtitle="الالتزام بالمواعيد وسرعة كل شركة شحن" />
          <DeliveryIntelligencePanel data={data} />
        </SectionCard>
      </div>

      {/* Footer */}
      <p className="text-center text-[11px] text-white/25 pb-2">
        آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")} — البيانات مبنية على جدول الشحنات فقط
      </p>
    </div>
  );
}
