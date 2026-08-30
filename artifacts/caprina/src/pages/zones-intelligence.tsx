import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, TrendingUp, TrendingDown, Minus, Sparkles, MapPin, Package,
  Award, DollarSign, Wallet, Scale, AlertTriangle, AlertCircle, Info,
  ChevronDown, ChevronUp, Building2,
} from "lucide-react";
import { analyticsApi, ZonesIntelligenceResponse } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (نفس منطق shipments-intelligence.tsx / representatives-intelligence.tsx لثبات الهوية البصرية)
// ═══════════════════════════════════════════════════════════════════════════
const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0));
const fmtMoney = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0));

function rateColor(pct: number, invert = false): string {
  const good = invert ? pct <= 10 : pct >= 80;
  const warn = invert ? pct <= 25 : pct >= 60;
  if (good) return "#22c55e";
  if (warn) return "#eab308";
  return "#ef4444";
}

const ALERT_META: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertTriangle, color: "#ef4444", bg: "bg-red-500/10 border-red-500/30" },
  warning:  { icon: AlertCircle,   color: "#f97316", bg: "bg-orange-500/10 border-orange-500/30" },
  info:     { icon: Info,          color: "#06b6d4", bg: "bg-cyan-500/10 border-cyan-500/30" },
};

const QUADRANT_META: Record<string, { label: string; color: string }> = {
  star_zone:     { label: "منطقة نجمة",       color: "#22c55e" },
  underpriced:   { label: "تسعير ناقص",       color: "#06b6d4" },
  risky_margin:  { label: "هامش خطر",         color: "#eab308" },
  review_needed: { label: "تحتاج مراجعة",     color: "#ef4444" },
};

const LOAD_STATUS_META: Record<string, { label: string; color: string }> = {
  balanced:    { label: "توزيع جغرافي متوازن", color: "#22c55e" },
  concentrated:{ label: "اعتماد مركّز",         color: "#eab308" },
  critical:    { label: "اعتماد خطر على منطقة واحدة", color: "#ef4444" },
};

// ═══════════════════════════════════════════════════════════════════════════
// Mini Ring — نفس ستايل shipments-intelligence.tsx
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
// Trend Badge — سهم اتجاه الأداء (تحسّن/تراجع/ثابت/جديد)
// ═══════════════════════════════════════════════════════════════════════════
function TrendBadge({ trend }: { trend: ZonesIntelligenceResponse["ranking"][number]["trend"] }) {
  if (trend.direction === "new" || trend.delta === null) {
    return <span className="text-[11px] text-white/35 font-bold">بدون مقارنة</span>;
  }
  if (trend.direction === "flat") {
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-white/45">
        <Minus className="w-3 h-3" /> ثابت
      </span>
    );
  }
  const up = trend.direction === "up";
  return (
    <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: up ? "#22c55e" : "#ef4444" }}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(trend.delta)} نقطة
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Ranking Card — كارت ترتيب منطقة واحدة (نقاط مركّبة + اتجاه + KPIs مختصرة)
// ═══════════════════════════════════════════════════════════════════════════
function RankingCard({ row, index }: { row: ZonesIntelligenceResponse["ranking"][number]; index: number }) {
  const color = rateColor(row.zoneScore);
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
        style={{ background: color }}
      />
      <div className="relative flex items-start gap-3">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
          style={{ background: index < 3 ? "#e8b93f22" : "#ffffff0a", color: index < 3 ? "#e8b93f" : "#ffffff60" }}
        >
          {row.rank}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{row.name}</p>
          <p className="text-[11px] text-white/40 mt-0.5">
            {row.fromGovernorate && row.toGovernorate ? `${row.fromGovernorate} ← ${row.toGovernorate} · ` : ""}
            {fmt(row.total)} شحنة
          </p>
        </div>
        <MiniRing pct={row.zoneScore} color={color} size={46} />
      </div>
      <div className="relative mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-white/35">نجاح</p>
          <p className="text-xs font-bold tabular-nums" style={{ color: rateColor(row.deliveryRate) }}>{row.deliveryRate}%</p>
        </div>
        <div>
          <p className="text-[10px] text-white/35">مواعيد</p>
          <p className="text-xs font-bold tabular-nums" style={{ color: rateColor(row.onTimeRate) }}>{row.onTimeRate}%</p>
        </div>
        <div>
          <p className="text-[10px] text-white/35">سرعة</p>
          <p className="text-xs font-bold tabular-nums text-white/70">{row.avgDeliveryHours} س</p>
        </div>
      </div>
      <div className="relative mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[11px] text-white/40">اتجاه الأداء</span>
        <TrendBadge trend={row.trend} />
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Profitability Table — جدول الربحية (السعر مقابل التكلفة) مع تصنيف Quadrant
// ═══════════════════════════════════════════════════════════════════════════
function ProfitabilityTable({ data }: { data: ZonesIntelligenceResponse["profitability"] }) {
  if (!data.length) {
    return <p className="text-center text-sm text-white/40 py-8">لا توجد تكلفة توصيل مسجّلة للمناطق في هذه الفترة</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-right">المنطقة</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">تكلفة التوصيل</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">متوسط السعر</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">الهامش</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">التصنيف</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const q = QUADRANT_META[r.quadrant] ?? QUADRANT_META.review_needed;
            return (
              <motion.tr
                key={r.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
                className="border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02]"
              >
                <td className="py-2.5 px-2 whitespace-nowrap text-right font-medium text-white">{r.name}</td>
                <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-white/70">{fmtMoney(r.deliveryCost)} ج.م</td>
                <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-white/70">{r.avgRevenuePerShipment !== null ? `${fmtMoney(r.avgRevenuePerShipment)} ج.م` : "—"}</td>
                <td className="py-2.5 px-2 whitespace-nowrap text-left">
                  {r.marginPct !== null ? (
                    <Pill color={r.marginPct < 0 ? "#ef4444" : rateColor(r.marginPct, false)}>{r.marginPct}%</Pill>
                  ) : "—"}
                </td>
                <td className="py-2.5 px-2 whitespace-nowrap text-left"><Pill color={q.color}>{q.label}</Pill></td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COD Analysis — نسبة التحصيل الفعلي لكل منطقة
// ═══════════════════════════════════════════════════════════════════════════
function CodAnalysisPanel({ data }: { data: ZonesIntelligenceResponse["codAnalysis"] }) {
  if (!data.length) {
    return <p className="text-center text-sm text-white/40 py-8">لا توجد شحنات دفع عند الاستلام (COD) في هذه الفترة</p>;
  }
  return (
    <div className="space-y-1">
      {data.map((r, i) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
          className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02] rounded-lg px-1"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{r.name}</p>
            <p className="text-xs text-white/45 mt-0.5">
              {fmtMoney(r.codCollected)} من {fmtMoney(r.codExpected)} ج.م محصّلة
            </p>
          </div>
          <MiniRing pct={r.collectionRate} color={rateColor(r.collectionRate)} />
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Load Balance — توزيع الحمل بين المناطق (Bar chart بسيط بنفس هوية الصفحة)
// ═══════════════════════════════════════════════════════════════════════════
function LoadBalancePanel({ data }: { data: ZonesIntelligenceResponse["loadBalance"] }) {
  const statusMeta = LOAD_STATUS_META[data.status] ?? LOAD_STATUS_META.balanced;
  if (!data.zones.length) {
    return <p className="text-center text-sm text-white/40 py-8">لا توجد شحنات مسندة لمناطق في هذه الفترة</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4" style={{ color: statusMeta.color }} />
          <span className="text-sm font-bold" style={{ color: statusMeta.color }}>{statusMeta.label}</span>
        </div>
        <span className="text-xs text-white/45">أعلى منطقة تشيل {data.topZoneLoadSharePct}% من الحمل</span>
      </div>
      <div className="space-y-2.5">
        {data.zones.slice(0, 8).map((z, i) => (
          <div key={z.id}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-white/75 font-medium truncate">{z.name}</span>
              <span className="text-white/45 tabular-nums shrink-0">{fmt(z.total)} · {z.loadSharePct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, z.loadSharePct)}%` }}
                transition={{ duration: 0.6, delay: Math.min(i * 0.04, 0.4), ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: z.loadSharePct >= 50 ? "#ef4444" : z.loadSharePct >= 30 ? "#eab308" : "#22c55e" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Governorate Performance — أداء حسب المحافظة (تجميع كل مناطق نفس محافظة الوجهة)
// ═══════════════════════════════════════════════════════════════════════════
function GovernoratePerformanceTable({ data }: { data: ZonesIntelligenceResponse["governoratePerformance"] }) {
  if (!data.length) {
    return <p className="text-center text-sm text-white/40 py-8">لا توجد بيانات محافظات في هذه الفترة</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-right">المحافظة</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">الشحنات</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">معدل النجاح</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">معدل المرتجعات</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 12).map((g, i) => (
            <motion.tr
              key={g.governorate}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
              className="border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02]"
            >
              <td className="py-2.5 px-2 whitespace-nowrap text-right font-medium text-white">{g.governorate}</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-white/70">{fmt(g.total)}</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left"><Pill color={rateColor(g.deliveryRate)}>{g.deliveryRate}%</Pill></td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left"><Pill color={rateColor(g.returnRate, true)}>{g.returnRate}%</Pill></td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Alerts Banner — تنبيهات ذكية خاصة بالمناطق
// ═══════════════════════════════════════════════════════════════════════════
function AlertsBanner({ alerts }: { alerts: ZonesIntelligenceResponse["alerts"] }) {
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
// Period Switcher — نفس ستايل shipments-intelligence.tsx
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
export default function ZonesIntelligencePage() {
  const [period, setPeriod] = useState("month");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["analytics", "zones-intelligence", period],
    queryFn: () => analyticsApi.zonesIntelligence({ period }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen text-white p-4 md:p-6 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#e8b93f]/30 border-t-[#e8b93f] animate-spin" />
          <p className="text-white/50 text-sm">جاري تحميل التحليل الذكي للمناطق...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen text-white p-4 md:p-6 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-white/70">تعذّر تحميل البيانات{error instanceof Error ? `: ${error.message}` : ""}</p>
        </div>
      </div>
    );
  }

  const topThree = data.ranking.slice(0, 3);
  const starZonesCount = data.profitability.filter(z => z.quadrant === "star_zone").length;

  return (
    <div className="min-h-screen text-white p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-400/20 flex items-center justify-center">
            <Brain className="w-5.5 h-5.5 text-violet-300" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white">تحليل المناطق الذكي</h1>
            <p className="text-xs text-white/40">ترتيب، اتجاه أداء، ربحية، وتوزيع حمل جغرافي لكل منطقة على حدة</p>
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
              <MapPin className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">إجمالي المناطق</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.zonesCount)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#22c55e]/20 text-[#22c55e]">
              <Building2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">مناطق نشطة بالفترة</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.activeZonesCount)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#06b6d4]/20 text-[#06b6d4]">
              <Package className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">إجمالي الشحنات</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.totalShipmentsInRange)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#8b5cf6]/20 text-[#8b5cf6]">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">مناطق نجمة (ربح ممتاز)</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(starZonesCount)}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* أفضل 3 مناطق — عرض مميز */}
      {topThree.length > 0 && (
        <SectionCard>
          <SectionHeader icon={Award} title="أفضل المناطق أداءً" subtitle="حسب نقاط الأداء المركّبة (نجاح + التزام بالمواعيد + سرعة − مرتجعات)" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topThree.map((r, i) => <RankingCard key={r.id} row={r} index={i} />)}
          </div>
        </SectionCard>
      )}

      {/* الترتيب الكامل */}
      <SectionCard>
        <SectionHeader icon={TrendingUp} title="ترتيب كل المناطق" subtitle="نقاط الأداء المركّبة واتجاه التحسّن/التراجع مقابل الفترة السابقة" />
        {data.ranking.length === 0 ? (
          <p className="text-center text-sm text-white/40 py-8">لا توجد مناطق مسجّلة</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.ranking.slice(0, 6).map((r, i) => <RankingCard key={r.id} row={r} index={i} />)}
            </div>
            {data.ranking.length > 6 && (
              <CollapsibleDetail title={`عرض باقي المناطق (${data.ranking.length - 6})`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.ranking.slice(6).map((r, i) => <RankingCard key={r.id} row={r} index={i} />)}
                </div>
              </CollapsibleDetail>
            )}
          </>
        )}
      </SectionCard>

      {/* الربحية + توزيع الحمل */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={DollarSign} title="الربحية — السعر مقابل التكلفة" subtitle="منطقة تسعيرها ناقص وبتخسر فيها الشركة، مقابل منطقة نجمة بهامش ممتاز" />
          <ProfitabilityTable data={data.profitability} />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={Scale} title="توزيع الحمل بين المناطق" subtitle="هل الشحنات موزّعة جغرافيًا بعدل ولا منطقة واحدة شايلة كل الحمل؟" />
          <LoadBalancePanel data={data.loadBalance} />
        </SectionCard>
      </div>

      {/* تحليل COD + أداء المحافظات */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={Wallet} title="تحليل التحصيل (COD)" subtitle="نسبة المبلغ المحصَّل فعليًا مقابل المتوقع لكل منطقة" />
          <CodAnalysisPanel data={data.codAnalysis} />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={Building2} title="الأداء حسب المحافظة" subtitle="تجميع كل مناطق نفس محافظة الوجهة — نظرة أوسع من مستوى المنطقة" />
          <GovernoratePerformanceTable data={data.governoratePerformance} />
        </SectionCard>
      </div>

      {/* Footer */}
      <p className="text-center text-[11px] text-white/25 pb-2">
        آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")} — {data.periodLabel} — البيانات مبنية على جدول الشحنات والمناطق فقط
      </p>
    </div>
  );
}
