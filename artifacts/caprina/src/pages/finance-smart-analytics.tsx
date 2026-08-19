import { useState, useEffect, useRef, useMemo } from "react";
import { apiFetch as _apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, startOfMonth } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Brain, Sparkles, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ShieldAlert, Target, Zap, ArrowUpRight, ArrowDownRight, Minus, Activity,
  DollarSign, Wallet, Receipt, PiggyBank, Percent, RefreshCw, ChevronRight,
  Gauge, Flame, Info, Layers, LineChart as LineChartIcon, ArrowRight,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, RadialBarChart, RadialBar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PolarAngleAxis,
} from "recharts";

const apiFetch = (url: string) => _apiFetch<any>(url.replace(/^\/api/, ""));

const fmt  = (v: number) => Number(v || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 });
const fmtF = (v: number) => Number(v || 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 }) + " ج.م";
const fmtS = (v: number) => {
  const n = Number(v || 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "م";
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return fmt(n);
};

const CAT_LABELS: Record<string, string> = {
  shipping_fees: "مصاريف شحن", warehouse_rent: "إيجار مخزن", salary: "مرتبات",
  marketing: "تسويق", packaging: "تغليف", utilities: "خدمات", maintenance: "صيانة",
  returns_loss: "خسائر مرتجعات", other: "أخرى",
};

const MONTH_AR: Record<string, string> = {
  "01": "يناير", "02": "فبراير", "03": "مارس", "04": "أبريل", "05": "مايو", "06": "يونيو",
  "07": "يوليو", "08": "أغسطس", "09": "سبتمبر", "10": "أكتوبر", "11": "نوفمبر", "12": "ديسمبر",
};

// ─── Animated Counter ─────────────────────────────────────────────────────────
function AnimNum({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const start = ref.current; const diff = value - start;
    const dur = 1000; const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + diff * ease));
      if (t < 1) requestAnimationFrame(step); else ref.current = value;
    };
    requestAnimationFrame(step);
  }, [value]);
  return <>{display.toLocaleString("ar-EG")}</>;
}

// ─── Glow Theme Palette ─────────────────────────────────────────────────────────
const THEMES: Record<string, { c: string; grad: string; border: string; shadow: string; glow: string; iconBg: string }> = {
  violet:  { c: "#8b5cf6", grad: "linear-gradient(135deg, rgba(139,92,246,0.16) 0%, rgba(167,139,250,0.05) 60%, rgba(0,0,0,0) 100%)", border: "rgba(139,92,246,0.35)", shadow: "0 0 0 1px rgba(139,92,246,0.15), 0 8px 40px rgba(139,92,246,0.22)", glow: "rgba(139,92,246,0.18)", iconBg: "linear-gradient(135deg,rgba(139,92,246,0.30),rgba(167,139,250,0.12))" },
  emerald: { c: "#10b981", grad: "linear-gradient(135deg, rgba(16,185,129,0.16) 0%, rgba(52,211,153,0.05) 60%, rgba(0,0,0,0) 100%)", border: "rgba(16,185,129,0.35)", shadow: "0 0 0 1px rgba(16,185,129,0.15), 0 8px 40px rgba(16,185,129,0.22)", glow: "rgba(16,185,129,0.18)", iconBg: "linear-gradient(135deg,rgba(16,185,129,0.30),rgba(52,211,153,0.12))" },
  blue:    { c: "#3b82f6", grad: "linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(96,165,250,0.05) 60%, rgba(0,0,0,0) 100%)", border: "rgba(59,130,246,0.35)", shadow: "0 0 0 1px rgba(59,130,246,0.15), 0 8px 40px rgba(59,130,246,0.22)", glow: "rgba(59,130,246,0.18)", iconBg: "linear-gradient(135deg,rgba(59,130,246,0.30),rgba(96,165,250,0.12))" },
  rose:    { c: "#f43f5e", grad: "linear-gradient(135deg, rgba(244,63,94,0.16) 0%, rgba(251,113,133,0.05) 60%, rgba(0,0,0,0) 100%)", border: "rgba(244,63,94,0.35)", shadow: "0 0 0 1px rgba(244,63,94,0.15), 0 8px 40px rgba(244,63,94,0.22)", glow: "rgba(244,63,94,0.18)", iconBg: "linear-gradient(135deg,rgba(244,63,94,0.30),rgba(251,113,133,0.12))" },
  amber:   { c: "#f59e0b", grad: "linear-gradient(135deg, rgba(245,158,11,0.16) 0%, rgba(251,191,36,0.05) 60%, rgba(0,0,0,0) 100%)", border: "rgba(245,158,11,0.35)", shadow: "0 0 0 1px rgba(245,158,11,0.15), 0 8px 40px rgba(245,158,11,0.22)", glow: "rgba(245,158,11,0.18)", iconBg: "linear-gradient(135deg,rgba(245,158,11,0.30),rgba(251,191,36,0.12))" },
  cyan:    { c: "#06b6d4", grad: "linear-gradient(135deg, rgba(6,182,212,0.16) 0%, rgba(34,211,238,0.05) 60%, rgba(0,0,0,0) 100%)", border: "rgba(6,182,212,0.35)", shadow: "0 0 0 1px rgba(6,182,212,0.15), 0 8px 40px rgba(6,182,212,0.22)", glow: "rgba(6,182,212,0.18)", iconBg: "linear-gradient(135deg,rgba(6,182,212,0.30),rgba(34,211,238,0.12))" },
};

export default function FinanceSmartAnalytics() {
  const { isAdmin, can } = useAuth();

  if (!isAdmin && !can("finance.view")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
        <p className="text-muted-foreground text-sm max-w-xs">ليس لديك صلاحية لعرض التحليل المالي الذكي.</p>
      </div>
    );
  }

  const [from] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["finance-hub-smart", from, to],
    queryFn: () => apiFetch(`/api/finance/hub?from=${from}&to=${to}`),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  const pnl = data?.pnl ?? {};
  const ords = data?.orders ?? {};
  const cash = data?.cash ?? {};
  const expCat: any[] = data?.expByCategory ?? [];
  const monthly: any[] = data?.monthlyChart ?? [];
  const unpaidShipping = data?.unpaidShipping ?? {};
  const pendingPurchases = data?.pendingPurchases ?? {};

  const revenue = Number(pnl.revenue ?? 0);
  const netProfit = Number(pnl.netProfit ?? 0);
  const grossProfit = Number(pnl.grossProfit ?? 0);
  const netMargin = Number(pnl.netMargin ?? 0);
  const grossMargin = Number(pnl.grossMargin ?? 0);
  const expenses = Number(pnl.expenses ?? 0);
  const shipping = Number(pnl.shipping ?? 0);
  const cogs = Number(pnl.cogs ?? 0);
  const returnLoss = Number(pnl.returnLoss ?? 0);
  const totalCash = Number(cash.totalBalance ?? 0);

  const monthlyChartData = useMemo(() => {
    const months: { month: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ month: key, label: MONTH_AR[String(d.getMonth() + 1).padStart(2, "0")] });
    }
    return months.map(({ month, label }) => {
      const found = monthly.find((m: any) => m.month === month);
      return { month, label, revenue: found?.revenue ?? 0, expenses: found?.expenses ?? 0, profit: found?.profit ?? 0 };
    });
  }, [monthly]);

  // ─── Financial Health Score (0-100) ────────────────────────────────────────
  const healthScore = useMemo(() => {
    let score = 50;
    if (netMargin >= 20) score += 20; else if (netMargin >= 10) score += 10; else if (netMargin >= 0) score += 0; else score -= 20;
    if (Number(ords.returnRate ?? 0) <= 10) score += 10; else if (Number(ords.returnRate ?? 0) <= 25) score += 0; else score -= 15;
    if (cash.lowBalanceAlerts?.length > 0) score -= 10;
    if (unpaidShipping.overdueCount > 0) score -= 10;
    const expRevRatio = revenue > 0 ? expenses / revenue : 0;
    if (expRevRatio <= 0.15) score += 10; else if (expRevRatio <= 0.3) score += 0; else score -= 10;
    const trend = monthlyChartData.length >= 2 ? monthlyChartData[monthlyChartData.length - 1].profit - monthlyChartData[monthlyChartData.length - 2].profit : 0;
    if (trend > 0) score += 5; else if (trend < 0) score -= 5;
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [netMargin, ords.returnRate, cash.lowBalanceAlerts, unpaidShipping.overdueCount, expenses, revenue, monthlyChartData]);

  const healthLabel = healthScore >= 80 ? "ممتازة" : healthScore >= 60 ? "جيدة" : healthScore >= 40 ? "متوسطة" : "تحتاج انتباه";
  const healthColor = healthScore >= 80 ? "#10b981" : healthScore >= 60 ? "#06b6d4" : healthScore >= 40 ? "#f59e0b" : "#f43f5e";

  // ─── Smart Insights Engine ──────────────────────────────────────────────────
  const insights = useMemo(() => {
    const list: { type: "success" | "warning" | "danger" | "info"; icon: any; title: string; detail: string; theme: string }[] = [];

    // هامش الربح
    if (netMargin < 0) {
      list.push({ type: "danger", icon: ShieldAlert, title: "خسارة صافية في الفترة الحالية", detail: `الهامش الصافي ${netMargin}% — راجع بنود التكلفة والمصروفات فورًا`, theme: "rose" });
    } else if (netMargin < 10 && revenue > 0) {
      list.push({ type: "warning", icon: AlertTriangle, title: "هامش ربح منخفض", detail: `الهامش الصافي ${netMargin}% أقل من المعدل الصحي (20%+) — راجع التسعير أو التكاليف`, theme: "amber" });
    } else if (netMargin >= 20) {
      list.push({ type: "success", icon: CheckCircle2, title: "هامش ربح صحي", detail: `الهامش الصافي ${netMargin}% — أداء مالي قوي مقارنة بمعايير التجارة الإلكترونية`, theme: "emerald" });
    }

    // هامش إجمالي مقابل صافي (فجوة التكاليف التشغيلية)
    if (grossMargin > 0 && netMargin >= 0) {
      const gap = grossMargin - netMargin;
      if (gap > 25) {
        list.push({ type: "warning", icon: Gauge, title: "فجوة كبيرة بين الهامش الإجمالي والصافي", detail: `الفرق ${gap.toFixed(1)}% — المصروفات التشغيلية والشحن يلتهمون جزء كبير من الربح`, theme: "amber" });
      }
    }

    // تركّز المصروفات
    if (expCat.length > 0) {
      const top = expCat[0];
      const topPct = expenses > 0 ? (Number(top.total) / expenses) * 100 : 0;
      if (topPct > 40) {
        list.push({ type: "warning", icon: Flame, title: `تركّز المصروفات في "${CAT_LABELS[top.category] ?? top.category}"`, detail: `${topPct.toFixed(0)}% من إجمالي المصروفات (${fmtF(top.total)}) — فرصة للتفاوض أو الترشيد`, theme: "amber" });
      }
    }

    // نسبة المرتجعات
    const returnRate = Number(ords.returnRate ?? 0);
    if (returnRate > 25) {
      list.push({ type: "danger", icon: TrendingDown, title: "نسبة مرتجعات مرتفعة جدًا", detail: `${returnRate}% من الطلبات ترجع — راجع جودة المنتج أو دقة بيانات العميل`, theme: "rose" });
    } else if (returnRate > 15) {
      list.push({ type: "warning", icon: AlertTriangle, title: "نسبة مرتجعات فوق المعدل الطبيعي", detail: `${returnRate}% مرتجعات — المعدل الصحي عادة أقل من 15%`, theme: "amber" });
    } else if (returnRate > 0 && returnRate <= 10) {
      list.push({ type: "success", icon: CheckCircle2, title: "نسبة مرتجعات ممتازة", detail: `${returnRate}% فقط — أقل من متوسط السوق`, theme: "emerald" });
    }

    // تكلفة الشحن كنسبة من الإيراد
    const shipRatio = revenue > 0 ? (shipping / revenue) * 100 : 0;
    if (shipRatio > 15) {
      list.push({ type: "warning", icon: Zap, title: "تكلفة الشحن مرتفعة نسبيًا", detail: `الشحن يمثل ${shipRatio.toFixed(1)}% من الإيراد — قارن أسعار شركات الشحن أو فاوض على عمولة أقل`, theme: "amber" });
    }

    // اتجاه الأرباح (Momentum)
    if (monthlyChartData.length >= 3) {
      const last3 = monthlyChartData.slice(-3);
      const trendUp = last3[2].profit > last3[1].profit && last3[1].profit > last3[0].profit;
      const trendDown = last3[2].profit < last3[1].profit && last3[1].profit < last3[0].profit;
      if (trendUp) {
        list.push({ type: "success", icon: TrendingUp, title: "زخم نمو إيجابي 3 شهور متتالية", detail: "الأرباح في تحسّن مستمر — استمر في نفس الاستراتيجية الحالية", theme: "emerald" });
      } else if (trendDown) {
        list.push({ type: "danger", icon: TrendingDown, title: "تراجع الأرباح 3 شهور متتالية", detail: "اتجاه سلبي مستمر — يحتاج مراجعة استراتيجية فورية للتسعير والتكاليف", theme: "rose" });
      }
    }

    // السيولة النقدية
    if (cash.lowBalanceAlerts?.length > 0) {
      list.push({ type: "warning", icon: Wallet, title: `${cash.lowBalanceAlerts.length} خزنة برصيد منخفض`, detail: cash.lowBalanceAlerts.map((a: any) => a.name).join("، "), theme: "amber" });
    }
    if (totalCash > 0 && expenses > 0) {
      const runwayDays = (totalCash / expenses) * 30;
      if (runwayDays < 15) {
        list.push({ type: "danger", icon: ShieldAlert, title: "سيولة نقدية منخفضة", detail: `الرصيد الحالي يغطي حوالي ${Math.round(runwayDays)} يوم فقط من المصروفات بنفس المعدل`, theme: "rose" });
      }
    }

    // مستحقات شركات الشحن
    if (unpaidShipping.overdueCount > 0) {
      list.push({ type: "danger", icon: AlertTriangle, title: `${unpaidShipping.overdueCount} فاتورة شحن متأخرة السداد`, detail: "قد يؤثر على العلاقة مع شركة الشحن — سدد في أقرب وقت لتجنب توقف الخدمة", theme: "rose" });
    }

    // أوامر شراء معلقة
    if (Number(pendingPurchases.count ?? 0) > 3) {
      list.push({ type: "info", icon: Info, title: `${pendingPurchases.count} أمر شراء معلق`, detail: `بقيمة إجمالية ${fmtF(pendingPurchases.total)} — تابع مواعيد التسليم لتفادي نفاد المخزون`, theme: "cyan" });
    }

    // متوسط الإيراد لكل طلب
    const delivered = Number(ords.delivered ?? 0);
    if (delivered > 0) {
      const avgOrder = revenue / delivered;
      list.push({ type: "info", icon: Target, title: "متوسط قيمة الطلب", detail: `${fmtF(avgOrder)} للطلب الواحد — قارنه بمتوسط تكلفة اكتساب العميل لتقييم الربحية الحقيقية`, theme: "violet" });
    }

    return list;
  }, [netMargin, grossMargin, expCat, expenses, ords, revenue, shipping, monthlyChartData, cash, totalCash, unpaidShipping, pendingPurchases]);

  const positiveCount = insights.filter(i => i.type === "success").length;
  const warningCount = insights.filter(i => i.type === "warning").length;
  const dangerCount = insights.filter(i => i.type === "danger").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center relative"
              style={{
                background: "linear-gradient(135deg,#8b5cf6,#3b82f6)",
                boxShadow: "0 4px 20px rgba(139,92,246,0.45), 0 0 40px rgba(139,92,246,0.25)",
              }}>
              <Brain className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full animate-ping"
                style={{ background: "#8b5cf6", opacity: 0.6 }} />
            </div>
            <h1 className="text-2xl font-black">تحليل الماليات الذكي</h1>
            {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-muted-foreground text-sm mr-11">توصيات احترافية مبنية على بيانات مالياتك الفعلية — لحظيًا</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 h-9">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </Button>
      </div>

      {/* ── Financial Health Score ──────────────────────────────────────────── */}
      <HealthScoreCard score={healthScore} label={healthLabel} color={healthColor}
        positiveCount={positiveCount} warningCount={warningCount} dangerCount={dangerCount}
        isLoading={isLoading} />

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <GlowKpi label="صافي الربح" value={netProfit} sub={`هامش صافي ${netMargin}%`} icon={PiggyBank} theme={netProfit >= 0 ? "emerald" : "rose"} />
        <GlowKpi label="الهامش الإجمالي" value={grossMargin} suffix="%" isPct sub={fmtF(grossProfit)} icon={Percent} theme="blue" />
        <GlowKpi label="نسبة المصروفات" value={revenue > 0 ? +((expenses / revenue) * 100).toFixed(1) : 0} suffix="%" isPct sub={fmtF(expenses)} icon={Receipt} theme="amber" />
        <GlowKpi label="نسبة المرتجعات" value={Number(ords.returnRate ?? 0)} suffix="%" isPct sub={`${fmt(ords.returned ?? 0)} طلب مرتجع`} icon={TrendingDown} theme="rose" />
      </div>

      {/* ── Profit Trend Chart ─────────────────────────────────────────────── */}
      <Card className="border-border p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.05) 0%, transparent 60%)" }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)" }}>
            <LineChartIcon className="w-4 h-4" style={{ color: "#8b5cf6" }} />
          </div>
          <div>
            <h2 className="text-sm font-bold">اتجاه الأداء المالي</h2>
            <p className="text-xs text-muted-foreground">آخر 6 شهور — إيراد · مصروفات · صافي ربح</p>
          </div>
        </div>
        {isLoading ? (
          <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyChartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRevSmart" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradProfitSmart" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradExpSmart" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtS} width={40} />
              <Tooltip content={<SmartTooltip />} />
              <Area type="monotone" dataKey="revenue" name="الإيراد" stroke="#10b981" strokeWidth={2.5} fill="url(#gradRevSmart)" animationDuration={1200} />
              <Area type="monotone" dataKey="expenses" name="المصروفات" stroke="#f43f5e" strokeWidth={2} fill="url(#gradExpSmart)" animationDuration={1200} animationBegin={150} />
              <Area type="monotone" dataKey="profit" name="صافي الربح" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#gradProfitSmart)" animationDuration={1200} animationBegin={300} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Expense Distribution + Insight Feed ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2 border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
              <Receipt className="w-4 h-4" style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <h2 className="text-sm font-bold">توزيع المصروفات</h2>
              <p className="text-xs text-muted-foreground">حسب الفئة — الفترة الحالية</p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
          ) : expCat.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
              <Receipt className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-xs">لا توجد مصروفات مسجّلة بعد</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {expCat.slice(0, 6).map((e: any, i: number) => {
                const pct = expenses > 0 ? (Number(e.total) / expenses) * 100 : 0;
                const colors = ["#f59e0b", "#f43f5e", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981"];
                const color = colors[i % colors.length];
                return (
                  <div key={e.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">{CAT_LABELS[e.category] ?? e.category}</span>
                      <span className="text-xs font-black" style={{ color }}>{fmtF(e.total)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 10px ${color}66` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{pct.toFixed(1)}% من إجمالي المصروفات</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Smart Insight Feed ─────────────────────────────────────────── */}
        <Card className="lg:col-span-3 border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center relative"
              style={{ background: "rgba(139,92,246,0.15)" }}>
              <Sparkles className="w-4 h-4" style={{ color: "#8b5cf6" }} />
            </div>
            <div>
              <h2 className="text-sm font-bold">توصيات ذكية</h2>
              <p className="text-xs text-muted-foreground">مبنية تلقائيًا على تحليل بيانات الماليات</p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">جاري التحليل...</div>
          ) : insights.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
              <Brain className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-xs">لا توجد بيانات كافية للتحليل بعد</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {insights.map((ins, i) => (
                <InsightRow key={i} insight={ins} delay={i * 60} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Health Score Card ──────────────────────────────────────────────────────
function HealthScoreCard({ score, label, color, positiveCount, warningCount, dangerCount, isLoading }: {
  score: number; label: string; color: string;
  positiveCount: number; warningCount: number; dangerCount: number; isLoading: boolean;
}) {
  const radialData = [{ name: "score", value: score, fill: color }];
  return (
    <div className="relative overflow-hidden rounded-[24px] p-6"
      style={{
        background: `linear-gradient(135deg, ${color}22 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${color}55`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 40px ${color}33`,
        backdropFilter: "blur(14px)",
      }}>
      <div className="absolute inset-x-10 top-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="absolute -top-10 -left-10 w-56 h-56 rounded-full pointer-events-none opacity-40"
        style={{ background: `radial-gradient(circle, ${color}22 0%, transparent 70%)` }} />

      <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
        <div className="relative w-32 h-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart innerRadius="72%" outerRadius="100%" data={radialData} startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar background={{ fill: "rgba(255,255,255,0.06)" }} dataKey="value" cornerRadius={20} animationDuration={1400} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black" style={{ color, textShadow: `0 0 20px ${color}88` }}>
              {isLoading ? "..." : <AnimNum value={score} />}
            </span>
            <span className="text-[10px] text-muted-foreground">من 100</span>
          </div>
        </div>

        <div className="flex-1 text-center sm:text-right">
          <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
            <Gauge className="w-4 h-4" style={{ color }} />
            <h3 className="text-sm font-bold text-muted-foreground">مؤشر الصحة المالية</h3>
          </div>
          <p className="text-2xl font-black mb-3" style={{ color, textShadow: `0 0 16px ${color}55` }}>{isLoading ? "جاري التحليل..." : label}</p>
          <div className="flex items-center gap-3 justify-center sm:justify-start flex-wrap">
            <StatChip icon={CheckCircle2} color="#10b981" count={positiveCount} label="نقاط قوة" />
            <StatChip icon={AlertTriangle} color="#f59e0b" count={warningCount} label="تنبيهات" />
            <StatChip icon={ShieldAlert} color="#f43f5e" count={dangerCount} label="مخاطر" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatChip({ icon: Icon, color, count, label }: { icon: any; color: string; count: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold"
      style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}>
      <Icon className="w-3.5 h-3.5" />
      {count} {label}
    </div>
  );
}

// ─── Glow KPI ────────────────────────────────────────────────────────────────
function GlowKpi({ label, value, sub, icon: Icon, theme, isPct, suffix = "" }: {
  label: string; value: number; sub: string; icon: any; theme: keyof typeof THEMES;
  isPct?: boolean; suffix?: string;
}) {
  const t = THEMES[theme];
  return (
    <div className="rounded-[20px] p-4 relative overflow-hidden group transition-all duration-300 hover:-translate-y-1.5"
      style={{ background: t.grad, border: `1px solid ${t.border}`, boxShadow: t.shadow, backdropFilter: "blur(14px)" }}>
      <div className="absolute inset-x-6 top-0 h-px pointer-events-none" style={{ background: `linear-gradient(90deg,transparent,${t.c},transparent)` }} />
      <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full pointer-events-none transition-opacity duration-300 group-hover:opacity-100 opacity-60"
        style={{ background: `radial-gradient(circle, ${t.glow} 0%, transparent 70%)` }} />
      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 relative z-10"
        style={{ background: t.iconBg, border: `1px solid ${t.border}`, boxShadow: `0 4px 14px ${t.glow}` }}>
        <Icon className="w-4 h-4" style={{ color: t.c, filter: `drop-shadow(0 0 6px ${t.c}88)` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mb-1 font-semibold relative z-10">{label}</p>
      <p className="text-xl font-black relative z-10 leading-tight" style={{ color: t.c, textShadow: `0 0 18px ${t.c}55` }}>
        {value < 0 && <span style={{ color: "#f43f5e" }}>-</span>}
        {isPct ? Math.abs(value).toFixed(1) : <AnimNum value={Math.round(Math.abs(value))} />}{isPct ? "" : ""}{suffix}
        {!isPct && <span className="text-[10px] font-normal text-muted-foreground mr-1">ج.م</span>}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1.5 relative z-10">{sub}</p>
    </div>
  );
}

// ─── Insight Row ─────────────────────────────────────────────────────────────
function InsightRow({ insight, delay }: { insight: any; delay: number }) {
  const t = THEMES[insight.theme] ?? THEMES.violet;
  const Icon = insight.icon;
  return (
    <div className="flex items-start gap-3 rounded-xl p-3 relative overflow-hidden animate-in slide-in-from-right-2 fade-in transition-all duration-300 hover:-translate-y-0.5"
      style={{
        animationDelay: `${delay}ms`,
        background: `linear-gradient(135deg, ${t.c}12 0%, transparent 70%)`,
        border: `1px solid ${t.c}30`,
        boxShadow: `0 2px 12px ${t.c}15`,
      }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: t.iconBg, border: `1px solid ${t.c}40`, boxShadow: `0 2px 10px ${t.c}30` }}>
        <Icon className="w-4 h-4" style={{ color: t.c }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold" style={{ color: t.c }}>{insight.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{insight.detail}</p>
      </div>
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function SmartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card/95 backdrop-blur p-3 shadow-xl text-xs space-y-1.5">
      <p className="font-bold text-muted-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}: <strong>{fmtS(p.value)} ج.م</strong></span>
        </div>
      ))}
    </div>
  );
}
