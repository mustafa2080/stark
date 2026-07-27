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

// ─── اختيار حتمي (مش عشوائي) لصياغة من مجموعة صيغ، بناءً على رقم فعلي ──
// نفس الرقم = نفس الصياغة دايماً، لكن لو الرقم اتغير (ولو بسيط) ممكن تتغير الصياغة.
function pickVariant<T>(variants: T[], seed: number): T {
  const idx = Math.abs(Math.round(seed * 7)) % variants.length;
  return variants[idx];
}

// ─── محرك توليد النصائح — كل رسالة بتدمج الأرقام الفعلية جوه نصها، ولكل حالة أكتر من صياغة ─
function buildInsights(data: SmartAnalyticsResponse): Insight[] {
  const insights: Insight[] = [];
  if (!data.kpis) return insights;
  const { current, changes } = data.kpis;

  // 1) الخلاصة العامة — درجات متعددة مبنية على overallScore الفعلي، مش تصنيف ثنائي بسيط
  const overallScore = changes.deliveryRate - changes.returnRate;
  if (overallScore > 15) {
    insights.push({
      tone: "success", icon: Flame,
      title: "أداء قوي جداً 🔥",
      body: pickVariant([
        `فرق شاسع لصالحك: التسليم اتحسن والمرتجعات اتقلصت بمجموع فرق ${overallScore}% عن الفترة السابقة. ده أداء من أفضل ما يكون، كمّل عليه.`,
        `الأرقام بتقولك حاجة واحدة: ماشي صح جداً. تحسن إجمالي ${overallScore}% في التوازن بين التسليم والمرتجعات — نادر يحصل بالمستوى ده.`,
      ], overallScore),
    });
  } else if (overallScore > 3) {
    insights.push({
      tone: "success", icon: ThumbsUp,
      title: "أداءك بيتحسن 👏",
      body: pickVariant([
        `نسبة التسليم عندك اتحسنت والمرتجعات في تراجع مقارنة بالفترة اللي فاتت (فرق ${overallScore}%). كمّل على نفس الوتيرة دي.`,
        `في تحسن واضح في أدائك (${overallScore}% فرق إيجابي) عن الفترة السابقة. الاتجاه صح، خليك مستمر.`,
      ], overallScore),
    });
  } else if (overallScore < -15) {
    insights.push({
      tone: "danger", icon: Flame,
      title: "تراجع حاد محتاج تدخّل فوري",
      body: pickVariant([
        `فيه تراجع كبير قوي في مؤشراتك (${Math.abs(overallScore)}% فرق سلبي) عن الفترة السابقة. الموضوع محتاج مراجعة سريعة قبل ما يكبر أكتر.`,
        `الأرقام بتدق جرس إنذار: تراجع ${Math.abs(overallScore)}% في التوازن بين التسليم والمرتجعات. يلا نشوف مع بعض المشكلة فين بالظبط تحت.`,
      ], overallScore),
    });
  } else if (overallScore < -3) {
    insights.push({
      tone: "danger", icon: ShieldAlert,
      title: "الأداء محتاج وقفة سريعة",
      body: pickVariant([
        `فيه تراجع ملحوظ في مؤشراتك الأساسية (${Math.abs(overallScore)}% فرق) عن الفترة السابقة. خد بالك من الملاحظات اللي تحت دي وابدأ عالجها بسرعة.`,
        `لاحظنا تراجع بسيط بس واضح (${Math.abs(overallScore)}%) في أدائك عن الفترة اللي فاتت. مفيش داعي للقلق، بس يستاهل تشوف السبب.`,
      ], overallScore),
    });
  } else {
    insights.push({
      tone: "info", icon: CheckCircle2,
      title: "أداءك مستقر",
      body: pickVariant([
        `مفيش تغيّر كبير في مؤشراتك عن الفترة اللي فاتت (فرق ${overallScore}% بس). ثبات كويس، بس فيه مساحة تتحسن فيها أكتر — شوف التفاصيل تحت.`,
        `أداءك ثابت تقريباً زي الفترة السابقة. الثبات مش سيء، بس لو عايز تكبر أكتر، ركّز على تقليل المرتجعات وزيادة عدد الأوردرات.`,
      ], current.total),
    });
  }

  // 2) تنبيه المرتجعات — درجات (شديد/متوسط) بدل قطع واحد، والنص بيدمج الأرقام الفعلية
  if (changes.returnRate > 25) {
    insights.push({
      tone: "danger", icon: AlertTriangle,
      title: "المرتجعات في زيادة كبيرة ⚠️",
      body: `نسبة المرتجعات قفزت ${changes.returnRate}% عن الفترة السابقة ووصلت لـ${current.returnRate}% من إجمالي شحناتك — ده رقم يستدعي وقفة جدية. راجع أسباب المرتجعات حسب المحافظة تحت فوراً.`,
    });
  } else if (changes.returnRate > 10) {
    insights.push({
      tone: "warning", icon: AlertTriangle,
      title: "المرتجعات في زيادة",
      body: `نسبة المرتجعات ارتفعت ${changes.returnRate}% عن الفترة السابقة (وصلت لـ${current.returnRate}%). راجع أسباب المرتجعات حسب المحافظة تحت في قسم "المرتجعات" عشان تعرف المشكلة فين بالظبط.`,
    });
  } else if (changes.returnRate < -25) {
    insights.push({
      tone: "success", icon: TrendingDown,
      title: "تحسن كبير في المرتجعات 🎉",
      body: `نسبة المرتجعات نزلت بشكل كبير ${Math.abs(changes.returnRate)}% عن الفترة السابقة (بقت ${current.returnRate}% بس). أي حاجة غيّرتها في التعامل مع العملاء شغالة تمام، استمر عليها.`,
    });
  } else if (changes.returnRate < -10) {
    insights.push({
      tone: "success", icon: TrendingDown,
      title: "المرتجعات بتقل",
      body: `نسبة المرتجعات نزلت ${Math.abs(changes.returnRate)}% عن الفترة السابقة (بقت ${current.returnRate}%). استمر على نفس السياسة في التعامل مع العملاء.`,
    });
  }

  // 3) تنبيه الإيرادات — درجات + النص بيدمج مصدر محتمل للمشكلة (عدد أوردرات ولا متوسط قيمة)
  if (changes.totalRevenue < -30) {
    const likelyCause = changes.total < -10 ? "قلة عدد الأوردرات اللي دخلت الفترة دي" : changes.returnRate > 5 ? "زيادة نسبة المرتجعات" : "قلة متوسط قيمة الأوردر";
    insights.push({
      tone: "danger", icon: TrendingDown,
      title: "انخفاض كبير في الإيرادات",
      body: `إجمالي إيراداتك قل بنسبة كبيرة ${Math.abs(changes.totalRevenue)}% عن الفترة السابقة. السبب الأقرب ليك حسب أرقامك: ${likelyCause}. يستاهل مراجعة سريعة.`,
    });
  } else if (changes.totalRevenue < -15) {
    insights.push({
      tone: "warning", icon: TrendingDown,
      title: "الإيرادات بتقل",
      body: `إجمالي إيراداتك قل بنسبة ${Math.abs(changes.totalRevenue)}% عن الفترة السابقة. ممكن يكون بسبب قلة عدد الأوردرات أو زيادة المرتجعات — راجع القسمين تحت.`,
    });
  } else if (changes.totalRevenue > 30) {
    insights.push({
      tone: "success", icon: Flame,
      title: "نمو قوي في الإيرادات 🔥",
      body: `إيراداتك قفزت ${changes.totalRevenue}% عن الفترة السابقة — نمو ملحوظ جداً. أياً كان اللي بتعمله دلوقتي، كمّل عليه.`,
    });
  } else if (changes.totalRevenue > 15) {
    insights.push({
      tone: "success", icon: TrendingUp,
      title: "الإيرادات في نمو",
      body: `إيراداتك زادت ${changes.totalRevenue}% عن الفترة السابقة. أداء كويس، حافظ عليه.`,
    });
  }

  // 4) أكتر سبب مرتجع منتشر — مبني على بيانات المحافظات الفعلية، مع درجة خطورة حسب تركّز السبب
  if (data.returned && data.returned.byGovernorate.length > 0) {
    let topReason: { label: string; count: number; gov: string; pct: number } | null = null;
    for (const gov of data.returned.byGovernorate) {
      const r = gov.reasons?.[0];
      if (r && (!topReason || r.count > topReason.count)) {
        topReason = { label: r.label, count: r.count, gov: gov.governorate, pct: r.pct };
      }
    }
    if (topReason && topReason.count >= 2) {
      const isDominant = topReason.pct >= 50;
      insights.push({
        tone: isDominant ? "danger" : "warning", icon: AlertTriangle,
        title: isDominant ? "سبب واحد وراء معظم مرتجعاتك" : "أكتر سبب لمرتجعاتك",
        body: isDominant
          ? `"${topReason.label}" هو السبب في ${topReason.pct}% من مرتجعات ${topReason.gov} — نسبة عالية جداً لسبب واحد. لو عالجته هتشوف فرق كبير وسريع في نسبة مرتجعاتك.`
          : `"${topReason.label}" هو السبب الأكتر تكراراً في مرتجعاتك (${topReason.count} حالة)، وبالأخص في ${topReason.gov}. لو عالجت السبب ده هتقلل نسبة المرتجعات بشكل ملحوظ.`,
      });
    }
  }

  // 5) هدف الأوردرات الشهري — درجات تقدّم متعددة، مش رسالة واحدة لكل حد لسه ما وصلش
  const remaining = MONTHLY_ORDER_TARGET - current.total;
  const progressPct = Math.round((current.total / MONTHLY_ORDER_TARGET) * 100);
  if (remaining <= 0) {
    insights.push({
      tone: "success", icon: Target,
      title: "وصلت لهدفك 🎯",
      body: `حققت ${fn(current.total)} أوردر، وده أكتر من هدف الـ${MONTHLY_ORDER_TARGET} أوردر شهرياً بـ${fn(Math.abs(remaining))} أوردر. استمر بنفس الوتيرة أو حاول تزود أكتر.`,
    });
  } else if (progressPct >= 80) {
    insights.push({
      tone: "success", icon: Target,
      title: "قربت قوي من الهدف 🎯",
      body: `أنت عند ${fn(current.total)} أوردر من أصل ${MONTHLY_ORDER_TARGET} (${progressPct}%) — باقي ${fn(remaining)} بس وتوصل. دفعة أخيرة وتوصل للهدف.`,
    });
  } else if (progressPct >= 60) {
    insights.push({
      tone: "info", icon: Target,
      title: "في المنتصف تقريباً",
      body: `أنت حالياً عند ${fn(current.total)} أوردر من أصل ${MONTHLY_ORDER_TARGET} (${progressPct}%). محتاج ${fn(remaining)} أوردر كمان عشان توصل للهدف — الطريق واضح، كمّل.`,
    });
  } else if (progressPct >= 30) {
    insights.push({
      tone: "warning", icon: Target,
      title: "المسافة للهدف الشهري لسه بعيدة",
      body: `أنت عند ${fn(current.total)} أوردر بس من أصل ${MONTHLY_ORDER_TARGET} (${progressPct}%). محتاج ${fn(remaining)} أوردر كمان — يلا نكمل مع بعض ونزوّد المعدل.`,
    });
  } else {
    insights.push({
      tone: "danger", icon: Target,
      title: "بداية الشهر لسه",
      body: `أنت عند ${fn(current.total)} أوردر بس من أصل ${MONTHLY_ORDER_TARGET} (${progressPct}%). فيه ${fn(remaining)} أوردر متبقّي — وقت كافي لو زودت المعدل بداية من دلوقتي.`,
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

// ─── تجميع أسباب المرتجعات من كل المحافظات مع بعض على مستوى الشركة كلها ─
interface AggregatedReason { reason: string; label: string; count: number; pct: number; topGovs: { governorate: string; count: number }[] }
function aggregateReturnReasons(byGovernorate: GovBreakdown[]): AggregatedReason[] {
  const byReason = new Map<string, { count: number; label: string; govs: Map<string, number> }>();
  let total = 0;
  for (const gov of byGovernorate) {
    for (const r of gov.reasons ?? []) {
      total += r.count;
      if (!byReason.has(r.reason)) byReason.set(r.reason, { count: 0, label: r.label, govs: new Map() });
      const entry = byReason.get(r.reason)!;
      entry.count += r.count;
      entry.govs.set(gov.governorate, (entry.govs.get(gov.governorate) ?? 0) + r.count);
    }
  }
  return [...byReason.entries()]
    .map(([reason, v]) => ({
      reason, label: v.label, count: v.count,
      pct: total > 0 ? Math.round((v.count / total) * 100) : 0,
      topGovs: [...v.govs.entries()]
        .map(([governorate, count]) => ({ governorate, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count);
}

function TopReturnReasonsPanel({ byGovernorate }: { byGovernorate: GovBreakdown[] }) {
  const reasons = useMemo(() => aggregateReturnReasons(byGovernorate), [byGovernorate]);
  if (reasons.length === 0) return null;
  const topReason = reasons[0];

  return (
    <div
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(244,63,94,0.08) 0%, rgba(255,255,255,0.02) 60%)",
        border: "1px solid rgba(244,63,94,0.22)",
        boxShadow: "0 8px 32px -14px rgba(244,63,94,0.3), 0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div className="pointer-events-none absolute -top-12 -left-12 w-48 h-48 rounded-full opacity-20 blur-3xl" style={{ background: "#f43f5e" }} />
      <div className="relative flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(244,63,94,0.18)", boxShadow: "0 0 14px rgba(244,63,94,0.5)" }}>
          <AlertTriangle className="w-4 h-4" style={{ color: "#f43f5e", filter: "drop-shadow(0 0 4px #f43f5eaa)" }} />
        </div>
        <div>
          <h3 className="font-bold text-sm">أسباب المرتجعات في شركتك كلها</h3>
          <p className="text-[11px] text-muted-foreground">مش بس داخل كل محافظة — دي كل أسبابك مجمّعة مع بعض</p>
        </div>
      </div>

      {topReason.pct >= 30 && (
        <div className="relative mt-3 mb-1 rounded-xl p-3" style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)" }}>
          <p className="text-xs font-semibold leading-relaxed">
            "{topReason.label}" هو السبب في <span className="font-black" style={{ color: "#f43f5e" }}>{topReason.pct}%</span> من كل مرتجعاتك.
            لو عالجت السبب ده لوحده، ممكن تقلل مرتجعاتك ككل بنسبة قريبة من كده.
          </p>
        </div>
      )}

      <div className="relative space-y-3 mt-3">
        {reasons.map((r, i) => (
          <div key={r.reason}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(i) }} />
                {r.label}
              </span>
              <span className="text-xs font-black">{fn(r.count)} <span className="text-muted-foreground font-semibold">({r.pct}%)</span></span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-1.5">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${r.pct}%`, background: colorFor(i) }} />
            </div>
            {r.topGovs.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground">الأكتر تكراراً في:</span>
                {r.topGovs.map((g) => (
                  <span key={g.governorate} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                    style={{ background: `${colorFor(i)}1a`, color: colorFor(i) }}>
                    <MapPin className="w-2.5 h-2.5" />{g.governorate} ({g.count})
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── مقارنة المناطق: دمج المسلّم والمرتجع لكل محافظة في صف واحد ──────────
interface GovComparison { governorate: string; delivered: number; returned: number; total: number; deliveryRate: number; returnRate: number }
function buildGovComparison(delivered: GovBreakdown[], returned: GovBreakdown[]): GovComparison[] {
  const map = new Map<string, { delivered: number; returned: number }>();
  for (const g of delivered) {
    if (!map.has(g.governorate)) map.set(g.governorate, { delivered: 0, returned: 0 });
    map.get(g.governorate)!.delivered += g.count;
  }
  for (const g of returned) {
    if (!map.has(g.governorate)) map.set(g.governorate, { delivered: 0, returned: 0 });
    map.get(g.governorate)!.returned += g.count;
  }
  return [...map.entries()]
    .map(([governorate, v]) => {
      const total = v.delivered + v.returned;
      return {
        governorate, delivered: v.delivered, returned: v.returned, total,
        deliveryRate: total > 0 ? Math.round((v.delivered / total) * 100) : 0,
        returnRate: total > 0 ? Math.round((v.returned / total) * 100) : 0,
      };
    })
    .filter(g => g.total > 0)
    .sort((a, b) => b.total - a.total);
}

type GovSortKey = "total" | "deliveryRate" | "returnRate";
function GovComparisonTable({ delivered, returned }: { delivered: GovBreakdown[]; returned: GovBreakdown[] }) {
  const rows = useMemo(() => buildGovComparison(delivered, returned), [delivered, returned]);
  const [sortKey, setSortKey] = useState<GovSortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  if (rows.length < 2) return null; // مقارنة مفيدة بس لو فيه أكتر من محافظة

  const sorted = [...rows].sort((a, b) => (sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
  const bestGov = [...rows].sort((a, b) => b.deliveryRate - a.deliveryRate)[0];
  const worstGov = [...rows].sort((a, b) => b.returnRate - a.returnRate)[0];

  const toggleSort = (key: GovSortKey) => {
    if (sortKey === key) setSortDir(d => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const headers: { key: GovSortKey; label: string }[] = [
    { key: "total", label: "إجمالي" },
    { key: "deliveryRate", label: "نسبة تسليم" },
    { key: "returnRate", label: "نسبة مرتجع" },
  ];

  return (
    <div
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(52,211,153,0.07) 0%, rgba(255,255,255,0.02) 60%)",
        border: "1px solid rgba(52,211,153,0.2)",
        boxShadow: "0 8px 32px -14px rgba(52,211,153,0.28), 0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-15 blur-3xl" style={{ background: "#34d399" }} />
      <div className="relative flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(52,211,153,0.18)", boxShadow: "0 0 14px rgba(52,211,153,0.5)" }}>
          <MapPin className="w-4 h-4" style={{ color: "#34d399", filter: "drop-shadow(0 0 4px #34d399aa)" }} />
        </div>
        <div>
          <h3 className="font-bold text-sm">مقارنة المناطق</h3>
          <p className="text-[11px] text-muted-foreground">كل محافظاتك جنب بعض — نسبة تسليم مقابل نسبة مرتجع</p>
        </div>
      </div>

      <div className="relative flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
          <ThumbsUp className="w-3 h-3" />أفضل منطقة: {bestGov.governorate} ({bestGov.deliveryRate}% تسليم)
        </span>
        {worstGov.returnRate > 0 && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: "rgba(244,63,94,0.15)", color: "#f43f5e" }}>
            <AlertTriangle className="w-3 h-3" />محتاجة متابعة: {worstGov.governorate} ({worstGov.returnRate}% مرتجع)
          </span>
        )}
      </div>

      <div className="relative overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[420px]">
          <thead>
            <tr className="text-muted-foreground border-b border-white/10">
              <th className="text-right font-bold px-2 py-2">المحافظة</th>
              {headers.map(h => (
                <th key={h.key} className="text-center font-bold px-2 py-2 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort(h.key)}>
                  <span className="inline-flex items-center gap-1">
                    {h.label}
                    {sortKey === h.key && <ChevronLeft className={`w-3 h-3 transition-transform ${sortDir === "desc" ? "-rotate-90" : "rotate-90"}`} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((g, i) => (
              <tr key={g.governorate} className="border-b border-white/5 last:border-0">
                <td className="px-2 py-2 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(i) }} />
                  {g.governorate}
                  {g.governorate === bestGov.governorate && <ThumbsUp className="w-3 h-3 text-emerald-400" />}
                  {g.governorate === worstGov.governorate && worstGov.returnRate > 0 && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                </td>
                <td className="text-center px-2 py-2 font-bold">{fn(g.total)}</td>
                <td className="text-center px-2 py-2 font-black" style={{ color: "#10b981" }}>{g.deliveryRate}%</td>
                <td className="text-center px-2 py-2 font-black" style={{ color: g.returnRate > 0 ? "#f43f5e" : "inherit" }}>{g.returnRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── قيمة كل محافظة الحقيقية بالفلوس: مساهمة في الإيراد + متوسط قيمة الأوردر ─
interface GovValue { governorate: string; count: number; revenue: number; avgOrderValue: number; revenuePct: number }
function buildGovValues(byGovernorate: GovBreakdown[], totalRevenue: number): GovValue[] {
  return byGovernorate
    .filter(g => g.revenue !== undefined)
    .map(g => ({
      governorate: g.governorate, count: g.count, revenue: g.revenue ?? 0,
      avgOrderValue: g.count > 0 ? Math.round((g.revenue ?? 0) / g.count) : 0,
      revenuePct: totalRevenue > 0 ? Math.round(((g.revenue ?? 0) / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function GovValuePanel({ byGovernorate, totalRevenue }: { byGovernorate: GovBreakdown[]; totalRevenue: number }) {
  const rows = useMemo(() => buildGovValues(byGovernorate, totalRevenue), [byGovernorate, totalRevenue]);
  if (rows.length < 2) return null;

  const overallAvg = rows.reduce((s, r) => s + r.count, 0) > 0
    ? Math.round(totalRevenue / rows.reduce((s, r) => s + r.count, 0))
    : 0;
  // فرص تسعير: محافظات بعدد أوردرات كبير نسبياً بس متوسط قيمة أقل من المتوسط العام
  const opportunities = rows.filter(r => r.avgOrderValue > 0 && r.avgOrderValue < overallAvg * 0.85 && r.count >= 3);

  return (
    <div
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(251,191,36,0.08) 0%, rgba(255,255,255,0.02) 60%)",
        border: "1px solid rgba(251,191,36,0.22)",
        boxShadow: "0 8px 32px -14px rgba(251,191,36,0.3), 0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div className="pointer-events-none absolute -top-12 -left-12 w-48 h-48 rounded-full opacity-18 blur-3xl" style={{ background: "#fbbf24" }} />
      <div className="relative flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(251,191,36,0.2)", boxShadow: "0 0 14px rgba(251,191,36,0.55)" }}>
          <Wallet className="w-4 h-4" style={{ color: "#fbbf24", filter: "drop-shadow(0 0 4px #fbbf24aa)" }} />
        </div>
        <div>
          <h3 className="font-bold text-sm">قيمة كل منطقة بالفلوس</h3>
          <p className="text-[11px] text-muted-foreground">مش بس عدد الأوردرات — مين بيجيبلك إيراد أكتر فعلياً</p>
        </div>
      </div>

      <div className="relative space-y-1 mb-3">
        {rows.map((g, i) => (
          <div key={g.governorate} className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-2" style={{ background: i === 0 ? "rgba(251,191,36,0.08)" : "transparent" }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(i) }} />
            <span className="font-semibold flex-1 truncate">{g.governorate}</span>
            <span className="text-[10px] text-muted-foreground">{fn(g.count)} أوردر</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: `${colorFor(i)}22`, color: colorFor(i) }}>
              متوسط {fc(g.avgOrderValue)}
            </span>
            <span className="font-black" style={{ color: "#fbbf24" }}>{g.revenuePct}%</span>
          </div>
        ))}
      </div>

      {opportunities.length > 0 && (
        <div className="relative rounded-xl p-3" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }}>
          <p className="text-xs font-semibold leading-relaxed">
            <span className="font-black">{opportunities.map(o => o.governorate).join("، ")}</span> بتجيبلك أوردرات كتير نسبياً بس متوسط قيمتها أقل من متوسطك العام ({fc(overallAvg)}).
            ممكن تكون فرصة تراجع فيها التسعير أو تعرض عليهم منتجات أعلى قيمة.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── مقارنة فترة بفترة: current مقابل previous جنب بعض بشكل صريح ────────
const PERIOD_METRICS: { key: keyof KpiBlock; changeKey: keyof KpiData["changes"]; label: string; format: "count" | "pct" | "currency"; goodDirection: "up" | "down" }[] = [
  { key: "total", changeKey: "total", label: "إجمالي الأوردرات", format: "count", goodDirection: "up" },
  { key: "deliveryRate", changeKey: "deliveryRate", label: "نسبة التسليم", format: "pct", goodDirection: "up" },
  { key: "returnRate", changeKey: "returnRate", label: "نسبة المرتجعات", format: "pct", goodDirection: "down" },
  { key: "totalRevenue", changeKey: "totalRevenue", label: "إجمالي الإيراد", format: "currency", goodDirection: "up" },
  { key: "avgOrderValue", changeKey: "avgOrderValue", label: "متوسط قيمة الأوردر", format: "currency", goodDirection: "up" },
];

function formatMetric(value: number, format: "count" | "pct" | "currency") {
  if (format === "pct") return `${value}%`;
  if (format === "currency") return fc(value);
  return fn(value);
}

function PeriodComparisonPanel({ kpis, hasDateFilter }: { kpis: KpiData; hasDateFilter: boolean }) {
  const { current, previous, changes } = kpis;
  if (previous.total === 0 && current.total === 0) return null;

  return (
    <div
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(96,165,250,0.08) 0%, rgba(255,255,255,0.02) 60%)",
        border: "1px solid rgba(96,165,250,0.22)",
        boxShadow: "0 8px 32px -14px rgba(96,165,250,0.3), 0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-15 blur-3xl" style={{ background: "#60a5fa" }} />
      <div className="relative flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(96,165,250,0.18)", boxShadow: "0 0 14px rgba(96,165,250,0.5)" }}>
          <Calendar className="w-4 h-4" style={{ color: "#60a5fa", filter: "drop-shadow(0 0 4px #60a5faaa)" }} />
        </div>
        <div>
          <h3 className="font-bold text-sm">مقارنة بالفترة السابقة</h3>
          <p className="text-[11px] text-muted-foreground">
            {hasDateFilter ? "الفترة المختارة مقابل فترة سابقة بنفس الطول" : "آخر 30 يوم مقابل الـ 30 يوم اللي قبلهم"}
          </p>
        </div>
      </div>

      <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {PERIOD_METRICS.map((m) => {
          const curVal = current[m.key];
          const prevVal = previous[m.key];
          const change = changes[m.changeKey];
          const isGood = m.goodDirection === "up" ? change >= 0 : change <= 0;
          const isFlat = change === 0;
          return (
            <div key={m.key} className="rounded-xl p-3 bg-white/[0.03] border border-white/10">
              <p className="text-[11px] text-muted-foreground mb-1.5">{m.label}</p>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-black">{formatMetric(curVal, m.format)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">قبل كده: {formatMetric(prevVal, m.format)}</p>
                </div>
                <span
                  className="text-[11px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0"
                  style={{
                    background: isFlat ? "rgba(148,163,184,0.15)" : isGood ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)",
                    color: isFlat ? "#94a3b8" : isGood ? "#10b981" : "#f43f5e",
                  }}
                >
                  {isFlat ? <Minus className="w-3 h-3" /> : change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(change)}%
                </span>
              </div>
            </div>
          );
        })}
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
          {data.kpis && <PeriodComparisonPanel kpis={data.kpis} hasDateFilter={!!dateFrom} />}
          {data.trend && data.trend.length > 0 && <TrendChart trend={data.trend} />}
          {data.delivered && data.returned && (
            <GovComparisonTable delivered={data.delivered.byGovernorate} returned={data.returned.byGovernorate} />
          )}
          {data.delivered && (
            <GovDonutSection
              title="المبيعات المحققة" subtitle="توزيع الأوردرات المسلّمة حسب المحافظة"
              icon={TrendingUp} color="#10b981"
              total={data.delivered.total} byGovernorate={data.delivered.byGovernorate}
              showRevenue onSelect={(gov) => setModalGov({ gov, kind: "delivered" })}
            />
          )}
          {data.delivered && data.delivered.byGovernorate.length > 1 && (
            <GovValuePanel byGovernorate={data.delivered.byGovernorate} totalRevenue={data.delivered.totalRevenue} />
          )}
          {data.returned && (
            <GovDonutSection
              title="المرتجعات" subtitle="توزيع الأوردرات المرتجعة حسب المحافظة"
              icon={RotateCcw} color="#f43f5e"
              total={data.returned.total} byGovernorate={data.returned.byGovernorate}
              showRevenue={false} onSelect={(gov) => setModalGov({ gov, kind: "returned" })}
            />
          )}
          {data.returned && data.returned.byGovernorate.length > 0 && (
            <TopReturnReasonsPanel byGovernorate={data.returned.byGovernorate} />
          )}
        </>
      )}

      {modalGov && (
        <GovDetailModal gov={modalGov.gov} kind={modalGov.kind} onClose={() => setModalGov(null)} />
      )}
    </div>
  );
}
