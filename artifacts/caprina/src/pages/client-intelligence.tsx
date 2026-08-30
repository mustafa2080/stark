import { useState } from "react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, TrendingUp, TrendingDown, Crown, AlertTriangle, AlertCircle, Info,
  Moon, Sparkles, Users, DollarSign, Activity, HeartPulse, ChevronDown, ChevronUp,
  RefreshCw, Calendar as CalendarIcon, CalendarDays, Check, RotateCcw,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";
import { analyticsApi, ClientsIntelligenceResponse } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (نفس منطق zones-intelligence.tsx / shipments-intelligence.tsx لثبات الهوية البصرية)
// ═══════════════════════════════════════════════════════════════════════════
const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0));
const fmtMoney = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0));

function healthColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 45) return "#eab308";
  return "#ef4444";
}

const ALERT_META: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertTriangle, color: "#ef4444", bg: "bg-red-500/10 border-red-500/30" },
  warning:  { icon: AlertCircle,   color: "#f97316", bg: "bg-orange-500/10 border-orange-500/30" },
  info:     { icon: Info,          color: "#06b6d4", bg: "bg-cyan-500/10 border-cyan-500/30" },
};

const SEGMENT_ICONS: Record<string, typeof Crown> = {
  crown: Crown, alert: AlertCircle, "trending-up": TrendingUp, moon: Moon, user: Users,
};

const CLIENT_TYPE_LABELS: Record<string, string> = {
  normal: "عادي", commercial: "تجاري", vip: "VIP",
};

// ═══════════════════════════════════════════════════════════════════════════
// Section header + wrapper card (نفس ستايل zones-intelligence.tsx)
// ═══════════════════════════════════════════════════════════════════════════
function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof Users; title: string; subtitle?: string }) {
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
// Mini Ring — نفس ستايل zones-intelligence.tsx
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
// Segment Card — كارت شريحة عملاء واحدة (نجوم / في خطر / واعد / نايم / عادي)
// ═══════════════════════════════════════════════════════════════════════════
function SegmentCard({ seg, index, active, onClick }: { seg: ClientsIntelligenceResponse["segments"][number]; index: number; active: boolean; onClick: () => void }) {
  const Icon = SEGMENT_ICONS[seg.icon] ?? Users;
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -2 }}
      className={`relative text-right rounded-2xl border p-4 overflow-hidden transition-colors duration-300 ${
        active ? "border-white/30 bg-white/[0.05]" : "border-white/10 bg-white/[0.03] hover:border-white/20"
      }`}
    >
      <div
        className="absolute -top-8 -left-8 w-24 h-24 rounded-full blur-2xl opacity-15"
        style={{ background: seg.color }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${seg.color}22`, color: seg.color }}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <span className="text-2xl font-black tabular-nums" style={{ color: seg.color }}>{fmt(seg.count)}</span>
      </div>
      <p className="relative mt-2 text-sm font-bold text-white">{seg.label}</p>
      <p className="relative text-[11px] text-white/40 mt-0.5">
        {fmtMoney(seg.totalRevenue)} ج.م · متوسط {fmtMoney(seg.avgRevenue)}
      </p>
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Segment Clients Table — جدول عملاء الشريحة المختارة
// ═══════════════════════════════════════════════════════════════════════════
function SegmentClientsTable({ clients }: { clients: ClientsIntelligenceResponse["segmentClients"][string] }) {
  if (!clients || clients.length === 0) {
    return <p className="text-center text-sm text-white/40 py-8">لا يوجد عملاء في هذه الشريحة</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-right">العميل</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">الشحنات</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">تسليم</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">مرتجع</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">الإيراد</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">آخر نشاط</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c, i) => (
            <motion.tr
              key={c.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
              className="border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02]"
            >
              <td className="py-2.5 px-2 whitespace-nowrap text-right">
                <p className="font-medium text-white">{c.name}</p>
                <p className="text-[11px] text-white/40">{c.city ?? "—"}{c.phone ? ` · ${c.phone}` : ""}</p>
              </td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-white/70">{fmt(c.total)}</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-[#22c55e]">{fmt(c.delivered)}</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-[#ef4444]">{fmt(c.returned)}</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-white/70">{fmtMoney(c.revenue)} ج.م</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left text-white/50">{c.idleDays !== null ? `منذ ${c.idleDays} يوم` : "—"}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Return Fingerprints Table — بصمة المرتجعات لكل عميل
// ═══════════════════════════════════════════════════════════════════════════
function ReturnFingerprintsTable({ data }: { data: ClientsIntelligenceResponse["returnFingerprints"] }) {
  if (!data.length) {
    return <p className="text-center text-sm text-white/40 py-8">لا يوجد عملاء بعدد مرتجعات كافٍ للتحليل في هذه الفترة</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[680px]">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-right">العميل</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">إجمالي مرتجعات</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">نسبة الارتجاع</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-right">السبب الغالب</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">الانحراف عن المتوسط</th>
          </tr>
        </thead>
        <tbody>
          {data.map((f, i) => (
            <motion.tr
              key={f.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
              className={`border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02] ${f.flagged ? "bg-red-500/[0.03]" : ""}`}
            >
              <td className="py-2.5 px-2 whitespace-nowrap text-right">
                <p className="font-medium text-white">{f.name}</p>
                {f.phone && <p className="text-[11px] text-white/40">{f.phone}</p>}
              </td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-white/70">{fmt(f.totalReturns)}</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left"><Pill color={rateColorInv(f.returnRate)}>{f.returnRate}%</Pill></td>
              <td className="py-2.5 px-2 whitespace-nowrap text-right text-white/75">{f.topReasonLabel}</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left">
                {f.flagged ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-[#ef4444] justify-end">
                    <AlertTriangle className="w-3.5 h-3.5" /> +{f.deviation}%
                  </span>
                ) : (
                  <span className="text-xs text-white/40">+{f.deviation}%</span>
                )}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function rateColorInv(pct: number): string {
  if (pct <= 10) return "#22c55e";
  if (pct <= 25) return "#eab308";
  return "#ef4444";
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
// Weekly Pulse — نبضة النشاط الأسبوعية
// ═══════════════════════════════════════════════════════════════════════════
function WeeklyPulsePanel({ data }: { data: ClientsIntelligenceResponse["weeklyPulse"] }) {
  if (!data.length) return <p className="text-center text-sm text-white/40 py-8">لا توجد بيانات نشاط في هذه الفترة</p>;
  const peak = data.reduce((max, d) => (d.count > max.count ? d : max), data[0]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-[#e8b93f]" />
          <span className="text-sm font-bold text-white">أعلى نشاط: {peak.day}</span>
        </div>
        <span className="text-xs text-white/45">{fmt(peak.count)} شحنة</span>
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="ciWeeklyPulseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8b93f" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#e8b93f" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "#ffffff60", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#ffffff60", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone" dataKey="count" name="شحنات"
              stroke="#e8b93f" strokeWidth={2.5} fill="url(#ciWeeklyPulseGrad)"
              dot={{ r: 4, fill: "#e8b93f", strokeWidth: 2, stroke: "#0a0f1e" }}
              activeDot={{ r: 6, fill: "#e8b93f", strokeWidth: 2, stroke: "#0a0f1e" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Misclassified Table — عملاء تصنيفهم مايطابقش نشاطهم الفعلي
// ═══════════════════════════════════════════════════════════════════════════
function MisclassifiedTable({ data }: { data: ClientsIntelligenceResponse["misclassified"] }) {
  if (!data.length) {
    return <p className="text-center text-sm text-white/40 py-8">كل العملاء مصنّفين بشكل مطابق لنشاطهم الفعلي 👍</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-right">العميل</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">شحنات الشهر</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">التصنيف الحالي</th>
            <th className="py-2 px-2 text-xs font-bold text-white/40 whitespace-nowrap text-left">التصنيف المقترح</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m, i) => (
            <motion.tr
              key={m.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
              className="border-b border-white/5 last:border-0 transition-colors duration-200 hover:bg-white/[0.02]"
            >
              <td className="py-2.5 px-2 whitespace-nowrap text-right font-medium text-white">{m.name}</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left tabular-nums text-white/70">{fmt(m.monthlyShipments)}</td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left"><Pill color="#64748b">{CLIENT_TYPE_LABELS[m.declared] ?? m.declared}</Pill></td>
              <td className="py-2.5 px-2 whitespace-nowrap text-left"><Pill color="#e8b93f">{CLIENT_TYPE_LABELS[m.actual] ?? m.actual}</Pill></td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Alerts Banner
// ═══════════════════════════════════════════════════════════════════════════
function AlertsBanner({ alerts }: { alerts: ClientsIntelligenceResponse["alerts"] }) {
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
// Date Range Picker — فترة مخصصة (نفس مكوّن shipments-intelligence.tsx لثبات الهوية البصرية)
// ═══════════════════════════════════════════════════════════════════════════
const fmtRangeDate = (d?: Date) =>
  d ? d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : null;

function DateRangePicker({
  active,
  range,
  onApply,
  onClear,
}: {
  active: boolean;
  range: DateRange | undefined;
  onApply: (range: DateRange) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(range);

  useEffect(() => {
    if (open) setDraft(range);
  }, [open, range]);

  const hasCompleteDraft = !!(draft?.from && draft?.to);
  const label = active && range?.from
    ? `${fmtRangeDate(range.from)} - ${fmtRangeDate(range.to)}`
    : "فترة مخصصة";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors duration-200 border ${
            active
              ? "bg-[#e8b93f] text-black border-[#e8b93f]"
              : "text-white/60 hover:text-white border-white/10 bg-white/[0.03]"
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto overflow-hidden rounded-2xl border p-0 shadow-2xl" dir="rtl" sideOffset={8}>
        <div className="border-b px-4 py-3" style={{ background: "hsl(var(--muted)/0.45)", borderColor: "hsl(var(--border))" }}>
          <p className="text-[12px] font-black text-foreground">اختيار فترة مخصصة</p>
          <p className="mt-1 text-[10px] font-semibold text-muted-foreground">حدد يوم البداية ثم يوم النهاية</p>
        </div>
        <Calendar
          mode="range"
          selected={draft}
          onSelect={setDraft}
          numberOfMonths={2}
          initialFocus
          className="p-3"
        />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-3" style={{ borderColor: "hsl(var(--border))" }}>
          <button
            type="button"
            onClick={() => { onClear(); setDraft(undefined); setOpen(false); }}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold text-muted-foreground transition hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            مسح
          </button>
          <button
            type="button"
            disabled={!hasCompleteDraft}
            onClick={() => { if (draft?.from && draft?.to) { onApply(draft); setOpen(false); } }}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: hasCompleteDraft ? "rgba(34,197,94,0.14)" : "hsl(var(--muted)/0.55)",
              color: hasCompleteDraft ? "#22c55e" : "hsl(var(--muted-foreground))",
            }}
          >
            <Check className="h-3.5 w-3.5" />
            تطبيق
          </button>
        </div>
      </PopoverContent>
    </Popover>
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
export default function ClientIntelligencePage() {
  const [period, setPeriod] = useState("month");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);

  const toDateStr = (d: Date) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const isCustomActive = !!(customRange?.from && customRange?.to);
  const effectivePeriod = isCustomActive ? "custom" : period;
  const effectiveFrom = isCustomActive ? toDateStr(customRange!.from!) : undefined;
  const effectiveTo = isCustomActive ? toDateStr(customRange!.to!) : undefined;

  const handlePeriodChange = (v: string) => {
    setCustomRange(undefined); // اختيار فترة سريعة يلغي أي فترة مخصصة مطبّقة
    setPeriod(v);
  };
  const handleCustomApply = (range: DateRange) => setCustomRange(range);
  const handleCustomClear = () => setCustomRange(undefined);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["analytics", "client-intelligence", effectivePeriod, effectiveFrom, effectiveTo],
    queryFn: () => analyticsApi.clientsIntelligence({ period: effectivePeriod, from: effectiveFrom, to: effectiveTo }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen text-white p-4 md:p-6 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#e8b93f]/30 border-t-[#e8b93f] animate-spin" />
          <p className="text-white/50 text-sm">جاري تحميل التحليل الذكي للعملاء...</p>
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

  const selectedSegment = activeSegment ?? data.segments.find(s => s.count > 0)?.key ?? null;
  const selectedClients = selectedSegment ? (data.segmentClients[selectedSegment] ?? []) : [];
  const selectedSegMeta = data.segments.find(s => s.key === selectedSegment);

  return (
    <div className="min-h-screen text-white p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-400/20 flex items-center justify-center">
            <Brain className="w-5.5 h-5.5 text-violet-300" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white">التحليل الذكي للعملاء</h1>
            <p className="text-xs text-white/40">تصنيف سلوكي، بصمة مرتجعات، نبضة نشاط، وتنبؤ إيراد لكل عميل</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSwitcher value={isCustomActive ? "" : period} onChange={handlePeriodChange} />
          <DateRangePicker
            active={isCustomActive}
            range={customRange}
            onApply={handleCustomApply}
            onClear={handleCustomClear}
          />
        </div>
      </div>

      {/* Alerts */}
      <AlertsBanner alerts={data.alerts} />

      {/* Hero KPIs */}
      <SectionCard>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#e8b93f]/20 text-[#e8b93f]">
              <Users className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">إجمالي العملاء</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.kpis.totalClients)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#06b6d4]/20 text-[#06b6d4]">
              <Activity className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">نشطين (90 يوم)</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.kpis.activeClients90d)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${healthColor(data.kpis.healthScore)}22`, color: healthColor(data.kpis.healthScore) }}>
              <HeartPulse className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">مؤشر الصحة العام</p>
              <p className="text-xl font-black tabular-nums" style={{ color: healthColor(data.kpis.healthScore) }}>{fmt(data.kpis.healthScore)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#22c55e]/20 text-[#22c55e]">
              <DollarSign className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">إجمالي الإيراد</p>
              <p className="text-xl font-black text-white tabular-nums">{fmtMoney(data.kpis.totalRevenue)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#ef4444]/20 text-[#ef4444]">
              <AlertTriangle className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs text-white/50">في خطر</p>
              <p className="text-xl font-black text-white tabular-nums">{fmt(data.kpis.atRiskCount)}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* شرائح العملاء (RFM) */}
      <SectionCard>
        <SectionHeader icon={Sparkles} title="خريطة قيمة × ولاء العملاء" subtitle="تصنيف سلوكي بناءً على عدد الطلبات، القيمة، وحداثة آخر نشاط — اضغط على شريحة لعرض عملائها" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {data.segments.map((seg, i) => (
            <SegmentCard
              key={seg.key}
              seg={seg}
              index={i}
              active={selectedSegment === seg.key}
              onClick={() => setActiveSegment(seg.key)}
            />
          ))}
        </div>
        {selectedSegment && (
          <div className="mt-5 pt-5 border-t border-white/5">
            <p className="text-sm font-bold text-white/70 mb-3">
              عملاء شريحة "{selectedSegMeta?.label ?? selectedSegment}" ({fmt(selectedClients.length)} من أصل {fmt(selectedSegMeta?.count ?? 0)})
            </p>
            <SegmentClientsTable clients={selectedClients} />
          </div>
        )}
      </SectionCard>

      {/* بصمة المرتجعات + نبضة النشاط */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={AlertCircle} title="بصمة المرتجعات" subtitle="أعلى سبب ارتجاع لكل عميل مقارنة بالمتوسط العام — انحراف واضح يستاهل تنبيه" />
          <ReturnFingerprintsTable data={data.returnFingerprints} />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={HeartPulse} title="نبضة النشاط الأسبوعية" subtitle="توزيع الشحنات على أيام الأسبوع لكل العملاء مجمّعين" />
          <WeeklyPulsePanel data={data.weeklyPulse} />
        </SectionCard>
      </div>

      {/* تصنيف غير مطابق + تنبؤ الإيراد */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard>
          <SectionHeader icon={Users} title="تصنيف غير مطابق للنشاط الفعلي" subtitle="عملاء تصنيفهم الحالي (عادي/تجاري/VIP) مايعكسش نشاطهم الشهري الفعلي" />
          <MisclassifiedTable data={data.misclassified} />
        </SectionCard>
        <SectionCard>
          <SectionHeader icon={TrendingUp} title="تنبؤ الإيراد للشهر القادم" subtitle="مبني على متوسط آخر شهرين مع معدل النمو (مقيّد لتقليل التقلب الشديد)" />
          {data.forecast ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                <div>
                  <p className="text-xs text-white/50">الإيراد المتوقع الشهر القادم</p>
                  <p className="text-2xl font-black text-[#e8b93f] tabular-nums mt-1">{fmtMoney(data.forecast.nextMonthEstimate)} ج.م</p>
                </div>
                <div className="text-left">
                  <span
                    className="flex items-center gap-1 text-sm font-bold justify-end"
                    style={{ color: data.forecast.growthRate >= 0 ? "#22c55e" : "#ef4444" }}
                  >
                    {data.forecast.growthRate >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {data.forecast.growthRate >= 0 ? "+" : ""}{data.forecast.growthRate}%
                  </span>
                  <p className="text-[11px] text-white/40 mt-1">ثقة التوقع: {data.forecast.confidence}%</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-white/50">الإيراد الفعلي الشهر الماضي</span>
                <span className="text-white/80 font-bold tabular-nums">{fmtMoney(data.forecast.lastMonthActual)} ج.م</span>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-white/40 py-8">لا توجد بيانات كافية للتنبؤ</p>
          )}
        </SectionCard>
      </div>

      {/* Footer */}
      <p className="text-center text-[11px] text-white/25 pb-2">
        آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")} — {data.periodLabel} — البيانات مبنية على جدول العملاء والشحنات فقط
      </p>
    </div>
  );
}
