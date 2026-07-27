import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import {
  Brain, ArrowRight, MapPin, TrendingUp, TrendingDown, RotateCcw, Package,
  ChevronLeft, X, Calendar, Percent, Wallet, Minus,
  Sparkles, AlertTriangle, CheckCircle2, Target, ThumbsUp, ShieldAlert, Flame,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Sector, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────
interface GovBreakdown {
  governorate: string;
  count: number;
  pct: number;
  revenue?: number;
  reasons?: { reason: string; label: string; count: number; pct: number }[];
}
interface KpiBlock {
  total: number;
  deliveredCount: number;
  returnedCount: number;
  deliveryRate: number;
  returnRate: number;
  totalRevenue: number;
  avgOrderValue: number;
}
interface KpiData {
  current: KpiBlock;
  previous: KpiBlock;
  changes: { deliveryRate: number; returnRate: number; totalRevenue: number; avgOrderValue: number; total: number };
}
interface TrendPoint { key: string; label: string; delivered: number; returned: number; revenue: number }
interface SmartAnalyticsResponse {
  total: number;
  kpis?: KpiData;
  trend?: TrendPoint[];
  delivered: { total: number; totalRevenue: number; byGovernorate: GovBreakdown[] } | null;
  returned: { total: number; byGovernorate: GovBreakdown[] } | null;
}

// ─── Utils ──────────────────────────────────────────────────────────────
const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

const PALETTE = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#38bdf8", "#fb923c", "#4ade80", "#f87171", "#c084fc"];
function colorFor(i: number) { return PALETTE[i % PALETTE.length]; }

// ─── هدف الأوردرات الشهري (ثابت حالياً لكل العملاء) ────────────────────
const MONTHLY_ORDER_TARGET = 200;

// ─── Insight = رسالة واحدة من كابرينا للعميل ──────────────────────────
type InsightTone = "success" | "warning" | "danger" | "info";
interface Insight {
  tone: InsightTone;
  icon: any;
  title: string;
  body: string;
}

const TONE_STYLE: Record<InsightTone, { color: string; bg: string }> = {
  success: { color: "#10b981", bg: "linear-gradient(145deg, rgba(16,185,129,0.14) 0%, rgba(255,255,255,0.02) 60%)" },
  warning: { color: "#f59e0b", bg: "linear-gradient(145deg, rgba(245,158,11,0.14) 0%, rgba(255,255,255,0.02) 60%)" },
  danger:  { color: "#f43f5e", bg: "linear-gradient(145deg, rgba(244,63,94,0.14) 0%, rgba(255,255,255,0.02) 60%)" },
  info:    { color: "#60a5fa", bg: "linear-gradient(145deg, rgba(96,165,250,0.14) 0%, rgba(255,255,255,0.02) 60%)" },
};

// ─── محرك توليد النصائح — كله مبني على أرقام حقيقية جايه من الـ API، مفيش نص ثابت ─
function buildInsights(data: SmartAnalyticsResponse): Insight[] {
  const insights: Insight[] = [];
  if (!data.kpis) return insights;
  const { current, changes } = data.kpis;

  // 1) الخلاصة العامة — تحسن ولا تراجع؟ بنحسبها من نسبة التسليم + نسبة المرتجعات مع بعض
  const overallScore = changes.deliveryRate - changes.returnRate;
  if (overallScore > 3) {
    insights.push({
      tone: "success", icon: ThumbsUp,
      title: "أداءك بيتحسن 👏",
      body: `نسبة التسليم عندك اتحسنت والمرتجعات في تراجع مقارنة بالفترة اللي فاتت. كمّل على نفس الوتيرة دي.`,
    });
  } else if (overallScore < -3) {
    insights.push({
      tone: "danger", icon: ShieldAlert,
      title: "الأداء محتاج وقفة سريعة",
      body: `فيه تراجع ملحوظ في مؤشراتك الأساسية مقارنة بالفترة السابقة. خد بالك من الملاحظات اللي تحت دي وابدأ عالجها بسرعة.`,
    });
  } else {
    insights.push({
      tone: "info", icon: CheckCircle2,
      title: "أداءك مستقر",
      body: `مفيش تغيّر كبير في مؤشراتك عن الفترة اللي فاتت. ثبات كويس، بس فيه مساحة تتحسن فيها أكتر — شوف التفاصيل تحت.`,
    });
  }

  // 2) تنبيه المرتجعات — لو معدل المرتجع زاد فعلاً (نسبة مئوية حقيقية من التغيير)
  if (changes.returnRate > 10) {
    insights.push({
      tone: "danger", icon: AlertTriangle,
      title: "المرتجعات في زيادة ⚠️",
      body: `نسبة المرتجعات ارتفعت بنسبة ${changes.returnRate}% عن الفترة السابقة (وصلت لـ${current.returnRate}% من إجمالي شحناتك). راجع أسباب المرتجعات حسب المحافظة تحت في قسم "المرتجعات" عشان تعرف المشكلة فين بالظبط.`,
    });
  } else if (changes.returnRate < -10) {
    insights.push({
      tone: "success", icon: TrendingDown,
      title: "المرتجعات بتقل 🎉",
      body: `نسبة المرتجعات نزلت ${Math.abs(changes.returnRate)}% عن الفترة السابقة (بقت ${current.returnRate}%). استمر على نفس السياسة في التعامل مع العملاء.`,
    });
  }

  // 3) تنبيه الإيرادات
  if (changes.totalRevenue < -15) {
    insights.push({
      tone: "warning", icon: TrendingDown,
      title: "الإيرادات بتقل",
      body: `إجمالي إيراداتك قل بنسبة ${Math.abs(changes.totalRevenue)}% عن الفترة السابقة. ممكن يكون بسبب قلة عدد الأوردرات أو زيادة المرتجعات — راجع القسمين تحت.`,
    });
  } else if (changes.totalRevenue > 15) {
    insights.push({
      tone: "success", icon: Flame,
      title: "الإيرادات في نمو 🔥",
      body: `إيراداتك زادت ${changes.totalRevenue}% عن الفترة السابقة. أداء ممتاز، حافظ عليه.`,
    });
  }

  // 4) أكتر سبب مرتجع منتشر — مبني على بيانات المحافظات الفعلية
  if (data.returned && data.returned.byGovernorate.length > 0) {
    let topReason: { label: string; count: number; gov: string } | null = null;
    for (const gov of data.returned.byGovernorate) {
      const r = gov.reasons?.[0];
      if (r && (!topReason || r.count > topReason.count)) {
        topReason = { label: r.label, count: r.count, gov: gov.governorate };
      }
    }
    if (topReason && topReason.count >= 2) {
      insights.push({
        tone: "warning", icon: AlertTriangle,
        title: "أكتر سبب لمرتجعاتك",
        body: `"${topReason.label}" هو السبب الأكتر تكراراً في مرتجعاتك، وبالأخص في ${topReason.gov}. لو عالجت السبب ده هتقلل نسبة المرتجعات بشكل ملحوظ.`,
      });
    }
  }

  // 5) هدف الأوردرات الشهري — تتبع فعلي بناءً على عدد الشحنات الحالي
  const remaining = MONTHLY_ORDER_TARGET - current.total;
  if (remaining <= 0) {
    insights.push({
      tone: "success", icon: Target,
      title: "وصلت لهدفك 🎯",
      body: `حققت ${fn(current.total)} أوردر، وده أكتر من هدف الـ${MONTHLY_ORDER_TARGET} أوردر شهرياً. استمر بنفس الوتيرة أو حاول تزود أكتر.`,
    });
  } else {
    const progressPct = Math.round((current.total / MONTHLY_ORDER_TARGET) * 100);
    insights.push({
      tone: progressPct >= 60 ? "info" : "warning", icon: Target,
      title: "المسافة للهدف الشهري",
      body: `أنت حالياً عند ${fn(current.total)} أوردر من أصل ${MONTHLY_ORDER_TARGET} (${progressPct}%). محتاج ${fn(remaining)} أوردر كمان عشان توصل للهدف — يلا نكمل مع بعض.`,
    });
  }

  return insights;
}

// ─── Active pie sector (grow on hover) ────────────────────────────────────
function ActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8}
      startAngle={startAngle} endAngle={endAngle} fill={fill} stroke="none"
      style={{ filter: `drop-shadow(0 0 8px ${fill}66)` }} />
  );
}

// ─── Date range filter ─────────────────────────────────────────────────
function DateRangeFilter({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const hasRange = !!(from || to);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors"
        style={{
          background: hasRange ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${hasRange ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.1)"}`,
          color: hasRange ? "#60a5fa" : "inherit",
        }}
      >
        <Calendar className="w-3.5 h-3.5" />
        {hasRange ? `${from || "البداية"} → ${to || "الآن"}` : "كل الفترات"}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 w-64 rounded-xl p-3 shadow-2xl"
          style={{ background: "rgba(24,24,27,0.98)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">من</label>
              <input type="date" value={from} onChange={e => onChange(e.target.value, to)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-primary/50" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">إلى</label>
              <input type="date" value={to} onChange={e => onChange(from, e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-primary/50" />
            </div>
            {hasRange && (
              <button onClick={() => { onChange("", ""); setOpen(false); }}
                className="w-full flex items-center justify-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 pt-1">
                <X className="w-3 h-3" />مسح الفترة (كل الوقت)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KPI change badge ──────────────────────────────────────────────────
function ChangeBadge({ value, invert }: { value: number; invert?: boolean }) {
  const isUp = value > 0;
  const isFlat = Math.abs(value) < 0.05;
  const good = invert ? !isUp : isUp;
  const color = isFlat ? "#9ca3af" : good ? "#10b981" : "#f43f5e";
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color }}>
      <Icon className="w-3 h-3" />
      {isFlat ? "—" : `${Math.abs(value).toFixed(1)}%`}
    </span>
  );
}

// ─── KPI bar ────────────────────────────────────────────────────────────
function KpiBar({ kpis }: { kpis: KpiData }) {
  const { current, changes } = kpis;
  const cards = [
    { label: "نسبة التسليم", value: `${current.deliveryRate}%`, change: changes.deliveryRate, icon: Percent, color: "#10b981" },
    { label: "متوسط قيمة الأوردر", value: fc(current.avgOrderValue), change: changes.avgOrderValue, icon: Wallet, color: "#60a5fa" },
    { label: "إجمالي الإيرادات", value: fc(current.totalRevenue), change: changes.totalRevenue, icon: TrendingUp, color: "#fbbf24" },
    { label: "نسبة المرتجعات", value: `${current.returnRate}%`, change: changes.returnRate, invert: true, icon: RotateCcw, color: "#f43f5e" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="group relative rounded-2xl p-3.5 overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(145deg, ${c.color}14 0%, rgba(255,255,255,0.02) 55%)`,
            border: `1px solid ${c.color}33`,
            boxShadow: `0 4px 24px -8px ${c.color}40, 0 0 0 1px rgba(255,255,255,0.02) inset`,
          }}
        >
          <div
            className="pointer-events-none absolute -top-8 -left-8 w-24 h-24 rounded-full opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
            style={{ background: c.color }}
          />
          <div className="relative flex items-center justify-between mb-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `${c.color}26`, boxShadow: `0 0 12px ${c.color}55` }}
            >
              <c.icon className="w-3.5 h-3.5" style={{ color: c.color, filter: `drop-shadow(0 0 4px ${c.color}aa)` }} />
            </div>
            <ChangeBadge value={c.change} invert={c.invert} />
          </div>
          <p className="relative text-lg font-black leading-tight" style={{ textShadow: `0 0 18px ${c.color}55` }}>{c.value}</p>
          <p className="relative text-[10px] text-muted-foreground mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Trend chart (monthly delivered vs returned) ──────────────────────────
function TrendChart({ trend }: { trend: TrendPoint[] }) {
  if (!trend || trend.length === 0) return null;
  return (
    <div
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(96,165,250,0.06) 0%, rgba(255,255,255,0.02) 60%)",
        border: "1px solid rgba(96,165,250,0.18)",
        boxShadow: "0 8px 32px -12px rgba(96,165,250,0.25), 0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-25 blur-3xl" style={{ background: "#60a5fa" }} />
      <div className="relative flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(96,165,250,0.18)", boxShadow: "0 0 14px rgba(96,165,250,0.5)" }}>
          <TrendingUp className="w-4 h-4" style={{ color: "#60a5fa", filter: "drop-shadow(0 0 4px #60a5faaa)" }} />
        </div>
        <div>
          <h3 className="font-bold text-sm">اتجاه الأداء الشهري</h3>
          <p className="text-[11px] text-muted-foreground">تسليم مقابل مرتجعات عبر الوقت</p>
        </div>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <filter id="glowDelivered" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glowReturned" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "rgba(15,15,15,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }}
              labelStyle={{ color: "#fff", fontWeight: 700 }}
            />
            <Line type="monotone" dataKey="delivered" name="مسلّم" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} filter="url(#glowDelivered)" />
            <Line type="monotone" dataKey="returned" name="مرتجع" stroke="#f43f5e" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} filter="url(#glowReturned)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Governorate donut + list, with drill-down ────────────────────────────
function GovDonutSection({
  title, subtitle, icon: Icon, color, total, byGovernorate, showRevenue, onSelect,
}: {
  title: string; subtitle: string; icon: any; color: string; total: number;
  byGovernorate: GovBreakdown[]; showRevenue: boolean; onSelect: (gov: GovBreakdown) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  return (
    <div
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden"
      style={{
        background: `linear-gradient(160deg, ${color}10 0%, rgba(255,255,255,0.02) 60%)`,
        border: `1px solid ${color}2a`,
        boxShadow: `0 8px 32px -14px ${color}45, 0 0 0 1px rgba(255,255,255,0.02) inset`,
      }}
    >
      <div className="pointer-events-none absolute -top-12 -left-12 w-48 h-48 rounded-full opacity-20 blur-3xl" style={{ background: color }} />
      <div className="relative flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}26`, boxShadow: `0 0 14px ${color}55` }}>
          <Icon className="w-4 h-4" style={{ color, filter: `drop-shadow(0 0 4px ${color}aa)` }} />
        </div>
        <div>
          <h3 className="font-bold text-sm">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {byGovernorate.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">لا توجد بيانات كافية بعد</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          {/* Donut */}
          <div className="h-[220px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byGovernorate} dataKey="count" nameKey="governorate"
                  innerRadius={62} outerRadius={92} paddingAngle={3} cornerRadius={4} stroke="none"
                  activeIndex={activeIndex} activeShape={ActiveShape}
                  isAnimationActive animationDuration={900} animationEasing="ease-in-out"
                  onMouseEnter={(_, i) => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(undefined)}
                  onClick={(_, i) => onSelect(byGovernorate[i])}
                >
                  {byGovernorate.map((_, i) => (
                    <Cell key={i} fill={colorFor(i)} stroke="none"
                      style={{ cursor: "pointer", opacity: activeIndex === undefined || activeIndex === i ? 1 : 0.35, transition: "opacity 0.5s" }} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl sm:text-3xl font-black leading-none">{fn(total)}</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground mt-1">{title}</span>
            </div>
          </div>

          {/* List */}
          <div className="space-y-1 max-h-[220px] overflow-y-auto">
            {byGovernorate.map((g, i) => (
              <button
                key={g.governorate}
                onClick={() => onSelect(g)}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(undefined)}
                className="w-full flex items-center justify-between text-xs rounded-lg px-2.5 py-2 transition-all duration-200 text-right"
                style={{
                  background: activeIndex === i ? `${colorFor(i)}1a` : "transparent",
                  opacity: activeIndex === undefined || activeIndex === i ? 1 : 0.5,
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorFor(i) }} />
                  <span className="font-semibold truncate">{g.governorate}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="px-1.5 py-0.5 rounded-md font-bold text-[10px]" style={{ background: `${colorFor(i)}22`, color: colorFor(i) }}>
                    {g.pct}%
                  </span>
                  <span className="font-black">{fn(g.count)}</span>
                  {showRevenue && g.revenue !== undefined && (
                    <span className="text-[10px] text-emerald-400 font-bold">{fc(g.revenue)}</span>
                  )}
                  <ChevronLeft className="w-3 h-3 text-muted-foreground" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Drill-down modal: governorate detail ──────────────────────────────────
function GovDetailModal({
  gov, kind, onClose,
}: { gov: GovBreakdown; kind: "delivered" | "returned"; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full sm:w-[480px] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 overflow-y-auto"
        style={{ background: "linear-gradient(180deg, rgba(15,15,15,0.98) 0%, rgba(5,5,5,1) 100%)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-3 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-base">{gov.governorate}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="relative rounded-xl p-3 overflow-hidden" style={{ background: "linear-gradient(150deg, rgba(96,165,250,0.16) 0%, rgba(255,255,255,0.02) 70%)", border: "1px solid rgba(96,165,250,0.35)", boxShadow: "0 6px 20px -8px rgba(96,165,250,0.35)" }}>
            <p className="text-[10px] text-muted-foreground mb-1">{kind === "delivered" ? "أوردرات مسلّمة" : "أوردرات مرتجعة"}</p>
            <p className="text-xl font-black" style={{ textShadow: "0 0 16px rgba(96,165,250,0.5)" }}>{fn(gov.count)}</p>
          </div>
          <div className="relative rounded-xl p-3 overflow-hidden" style={{ background: "linear-gradient(150deg, rgba(16,185,129,0.16) 0%, rgba(255,255,255,0.02) 70%)", border: "1px solid rgba(16,185,129,0.35)", boxShadow: "0 6px 20px -8px rgba(16,185,129,0.35)" }}>
            <p className="text-[10px] text-muted-foreground mb-1">النسبة من الإجمالي</p>
            <p className="text-xl font-black" style={{ color: "#10b981", textShadow: "0 0 16px rgba(16,185,129,0.55)" }}>{gov.pct}%</p>
          </div>
          {kind === "delivered" && gov.revenue !== undefined && (
            <div className="col-span-2 relative rounded-xl p-3 overflow-hidden" style={{ background: "linear-gradient(150deg, rgba(245,158,11,0.16) 0%, rgba(255,255,255,0.02) 70%)", border: "1px solid rgba(245,158,11,0.35)", boxShadow: "0 6px 20px -8px rgba(245,158,11,0.35)" }}>
              <p className="text-[10px] text-muted-foreground mb-1">إجمالي الإيرادات المحققة من {gov.governorate}</p>
              <p className="text-xl font-black" style={{ color: "#f59e0b", textShadow: "0 0 16px rgba(245,158,11,0.55)" }}>{fc(gov.revenue)}</p>
            </div>
          )}
        </div>

        {kind === "returned" && gov.reasons && gov.reasons.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />أسباب المرتجعات في {gov.governorate}
            </p>
            <div className="space-y-2.5">
              {gov.reasons.map((r, i) => (
                <div key={r.reason}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">{r.label}</span>
                    <span className="text-xs font-black">{r.count} ({r.pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${r.pct}%`, background: colorFor(i) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── لوحة نصائح كابرينا — أول حاجة يشوفها العميل، صوت كابرينا الوحيد ليه ─
function InsightsPanel({ data }: { data: SmartAnalyticsResponse }) {
  const insights = useMemo(() => buildInsights(data), [data]);
  if (insights.length === 0) return null;

  return (
    <div
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(167,139,250,0.10) 0%, rgba(255,255,255,0.02) 60%)",
        border: "1px solid rgba(167,139,250,0.28)",
        boxShadow: "0 8px 32px -14px rgba(167,139,250,0.35), 0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div className="pointer-events-none absolute -top-12 -left-12 w-48 h-48 rounded-full opacity-20 blur-3xl" style={{ background: "#a78bfa" }} />
      <div className="relative flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(167,139,250,0.22)", boxShadow: "0 0 14px rgba(167,139,250,0.55)" }}>
          <Sparkles className="w-4 h-4" style={{ color: "#a78bfa", filter: "drop-shadow(0 0 4px #a78bfaaa)" }} />
        </div>
        <div>
          <h3 className="font-bold text-sm">نصائح كابرينا لك</h3>
          <p className="text-[11px] text-muted-foreground">قراءة سريعة لأداءك مبنية على أرقامك الفعلية</p>
        </div>
      </div>

      <div className="relative space-y-2.5">
        {insights.map((insight, i) => {
          const style = TONE_STYLE[insight.tone];
          return (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl p-3"
              style={{ background: style.bg, border: `1px solid ${style.color}30` }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: `${style.color}26`, boxShadow: `0 0 10px ${style.color}44` }}
              >
                <insight.icon className="w-3.5 h-3.5" style={{ color: style.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold mb-0.5" style={{ color: style.color }}>{insight.title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{insight.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function ClientSmartAnalytics() {
  const [, navigate] = useLocation();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modalGov, setModalGov] = useState<{ gov: GovBreakdown; kind: "delivered" | "returned" } | null>(null);

  const queryKey = useMemo(() => ["client-portal-smart-analytics", dateFrom, dateTo], [dateFrom, dateTo]);
  const { data, isLoading } = useQuery<SmartAnalyticsResponse>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const qs = params.toString();
      return apiFetch(`/client-portal/smart-analytics${qs ? `?${qs}` : ""}`);
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/client-dashboard")}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              التحليل الذكي
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">توزيع شحناتك جغرافياً — تسليم ومرتجعات</p>
          </div>
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-muted-foreground text-sm">جاري تحميل التحليل...</div>
      ) : !data || data.total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Package className="w-10 h-10 opacity-20" />
          <p className="text-sm font-bold">لا توجد شحنات كافية لعرض التحليل بعد</p>
        </div>
      ) : (
        <>
          <InsightsPanel data={data} />
          {data.kpis && <KpiBar kpis={data.kpis} />}
          {data.trend && data.trend.length > 0 && <TrendChart trend={data.trend} />}
          {data.delivered && (
            <GovDonutSection
              title="المبيعات المحققة" subtitle="توزيع الأوردرات المسلّمة حسب المحافظة"
              icon={TrendingUp} color="#10b981"
              total={data.delivered.total} byGovernorate={data.delivered.byGovernorate}
              showRevenue onSelect={(gov) => setModalGov({ gov, kind: "delivered" })}
            />
          )}
          {data.returned && (
            <GovDonutSection
              title="المرتجعات" subtitle="توزيع الأوردرات المرتجعة حسب المحافظة"
              icon={RotateCcw} color="#f43f5e"
              total={data.returned.total} byGovernorate={data.returned.byGovernorate}
              showRevenue={false} onSelect={(gov) => setModalGov({ gov, kind: "returned" })}
            />
          )}
        </>
      )}

      {modalGov && (
        <GovDetailModal gov={modalGov.gov} kind={modalGov.kind} onClose={() => setModalGov(null)} />
      )}
    </div>
  );
}
