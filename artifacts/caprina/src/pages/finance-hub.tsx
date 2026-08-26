import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch as _apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Wallet, TrendingUp, TrendingDown, ArrowRightLeft, Building2,
  Star, AlertCircle, RefreshCw, Banknote, BarChart3, Receipt,
  ShoppingCart, ShoppingBag, Truck, FileText, Activity, CheckCircle2,
  Package, Clock, Info, ArrowLeft, Zap, Eye, ChevronRight,
  DollarSign, ArrowUpCircle, ArrowDownCircle, PiggyBank,
  ShieldAlert, Layers, CircleDot, Flame, Target, TrendingUp as TrendUp,
  Crosshair, Minus, AlertTriangle, CheckCircle, Users,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, ComposedChart,
} from "recharts";
import { format, startOfMonth } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ─── Config ───────────────────────────────────────────────────────────────────
const PIE_COLORS = ["#10b981","#f43f5e","#3b82f6","#f59e0b","#8b5cf6","#06b6d4","#ec4899","#84cc16","#f97316"];

const MONTH_AR: Record<string,string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل","05":"مايو","06":"يونيو",
  "07":"يوليو","08":"أغسطس","09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};

const CAT_LABELS: Record<string,string> = {
  shipping_fees:"مصاريف شحن", warehouse_rent:"إيجار مخزن", salary:"مرتبات",
  marketing:"تسويق", packaging:"تغليف", utilities:"خدمات", maintenance:"صيانة",
  returns_loss:"خسائر مرتجعات", other:"أخرى",
};

const TX_LABELS: Record<string,{label:string;credit:boolean}> = {
  deposit:{label:"إيداع",credit:true}, withdrawal:{label:"سحب",credit:false},
  order_collected:{label:"تحصيل طلب",credit:true}, shipping_transfer:{label:"تحويل شحن",credit:true},
  cash_sale:{label:"مبيعات نقدية",credit:true}, expense_paid:{label:"دفع مصروف",credit:false},
  purchase_paid:{label:"دفع مورد",credit:false}, transfer_in:{label:"تحويل وارد",credit:true},
  transfer_out:{label:"تحويل صادر",credit:false},
};

const ALERT_STYLE: Record<string,{bg:string;border:string;icon:string;Icon:any}> = {
  danger:  {bg:"bg-rose-500/8",  border:"border-rose-500/30",  icon:"text-rose-500",   Icon:ShieldAlert  },
  warning: {bg:"bg-amber-500/8", border:"border-amber-500/30", icon:"text-amber-500",  Icon:AlertCircle  },
  info:    {bg:"bg-sky-500/8",   border:"border-sky-500/30",   icon:"text-sky-500",    Icon:Info         },
  success: {bg:"bg-emerald-500/8",border:"border-emerald-500/30",icon:"text-emerald-500",Icon:CheckCircle2},
};

// ─── Utils ────────────────────────────────────────────────────────────────────
const apiFetch = (url: string) => _apiFetch<any>(url.replace(/^\/api/, ""));

const fmt  = (v:number) => Number(v).toLocaleString("ar-EG", {minimumFractionDigits:0, maximumFractionDigits:0});
const fmtF = (v:number) => Number(v).toLocaleString("ar-EG", {minimumFractionDigits:2}) + " ج.م";
const fmtS = (v:number) => v >= 1_000_000 ? (v/1_000_000).toFixed(1)+"م" : v >= 1_000 ? (v/1_000).toFixed(1)+"k" : fmt(v);
const pctColor = (v:number|null,inverse=false) => {
  if (v===null) return "text-muted-foreground";
  return (inverse ? v < 0 : v > 0) ? "text-emerald-500" : "text-rose-500";
};

// ─── Animated Counter ─────────────────────────────────────────────────────────
function AnimNum({ value, prefix="", suffix="" }:{value:number;prefix?:string;suffix?:string}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const start = ref.current; const diff = value - start;
    const dur = 900; const t0 = performance.now();
    const step = (now:number) => {
      const t = Math.min((now-t0)/dur,1);
      const ease = 1-Math.pow(1-t,3);
      setDisplay(Math.round(start+diff*ease));
      if (t<1) requestAnimationFrame(step); else ref.current=value;
    };
    requestAnimationFrame(step);
  }, [value]);
  return <>{prefix}{display.toLocaleString("ar-EG")}{suffix}</>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KPI_THEMES: Record<string, {
  grad: string; border: string; shadow: string; glow: string;
  iconBg: string; iconBorder: string; topLine: string; orb: string;
}> = {
  yellow: {
    grad:       "linear-gradient(135deg, rgba(245,158,11,0.13) 0%, rgba(251,191,36,0.05) 60%, rgba(0,0,0,0) 100%)",
    border:     "rgba(245,158,11,0.35)",
    shadow:     "0 0 0 1px rgba(245,158,11,0.15), 0 8px 40px rgba(245,158,11,0.22), 0 2px 8px rgba(245,158,11,0.10)",
    glow:       "0 0 60px rgba(245,158,11,0.18)",
    iconBg:     "linear-gradient(135deg,rgba(245,158,11,0.28),rgba(251,191,36,0.12))",
    iconBorder: "rgba(245,158,11,0.45)",
    topLine:    "linear-gradient(90deg,transparent,#f59e0b,transparent)",
    orb:        "rgba(245,158,11,0.12)",
  },
  emerald: {
    grad:       "linear-gradient(135deg, rgba(16,185,129,0.13) 0%, rgba(52,211,153,0.05) 60%, rgba(0,0,0,0) 100%)",
    border:     "rgba(16,185,129,0.35)",
    shadow:     "0 0 0 1px rgba(16,185,129,0.15), 0 8px 40px rgba(16,185,129,0.22), 0 2px 8px rgba(16,185,129,0.10)",
    glow:       "0 0 60px rgba(16,185,129,0.18)",
    iconBg:     "linear-gradient(135deg,rgba(16,185,129,0.28),rgba(52,211,153,0.12))",
    iconBorder: "rgba(16,185,129,0.45)",
    topLine:    "linear-gradient(90deg,transparent,#10b981,transparent)",
    orb:        "rgba(16,185,129,0.12)",
  },
  blue: {
    grad:       "linear-gradient(135deg, rgba(59,130,246,0.13) 0%, rgba(96,165,250,0.05) 60%, rgba(0,0,0,0) 100%)",
    border:     "rgba(59,130,246,0.35)",
    shadow:     "0 0 0 1px rgba(59,130,246,0.15), 0 8px 40px rgba(59,130,246,0.22), 0 2px 8px rgba(59,130,246,0.10)",
    glow:       "0 0 60px rgba(59,130,246,0.18)",
    iconBg:     "linear-gradient(135deg,rgba(59,130,246,0.28),rgba(96,165,250,0.12))",
    iconBorder: "rgba(59,130,246,0.45)",
    topLine:    "linear-gradient(90deg,transparent,#3b82f6,transparent)",
    orb:        "rgba(59,130,246,0.12)",
  },
  rose: {
    grad:       "linear-gradient(135deg, rgba(244,63,94,0.13) 0%, rgba(251,113,133,0.05) 60%, rgba(0,0,0,0) 100%)",
    border:     "rgba(244,63,94,0.35)",
    shadow:     "0 0 0 1px rgba(244,63,94,0.15), 0 8px 40px rgba(244,63,94,0.22), 0 2px 8px rgba(244,63,94,0.10)",
    glow:       "0 0 60px rgba(244,63,94,0.18)",
    iconBg:     "linear-gradient(135deg,rgba(244,63,94,0.28),rgba(251,113,133,0.12))",
    iconBorder: "rgba(244,63,94,0.45)",
    topLine:    "linear-gradient(90deg,transparent,#f43f5e,transparent)",
    orb:        "rgba(244,63,94,0.12)",
  },
};

function KpiCard({label,value,sub,icon:Icon,hexColor,theme,delta,link}:{
  label:string; value:number; sub:string; icon:any;
  hexColor:string; theme:keyof typeof KPI_THEMES;
  delta?:number|null; link?:string;
}) {
  const t = KPI_THEMES[theme] ?? KPI_THEMES.emerald;
  const inner = (
    <div
      className={`rounded-[22px] p-5 relative overflow-hidden group transition-all duration-300 hover:-translate-y-1.5 ${link?"cursor-pointer":""}`}
      style={{
        background: t.grad,
        border: `1px solid ${t.border}`,
        boxShadow: t.shadow,
        backdropFilter: "blur(14px)",
      }}
    >
      {/* خط ضوء علوي */}
      <div className="absolute inset-x-8 top-0 h-px pointer-events-none"
        style={{ background: t.topLine }} />

      {/* كرة الضوء الخلفية */}
      <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full pointer-events-none transition-opacity duration-300 group-hover:opacity-100 opacity-70"
        style={{ background: `radial-gradient(circle, ${t.orb} 0%, transparent 70%)` }} />

      {/* أيقونة */}
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 relative z-10"
        style={{
          background: t.iconBg,
          border: `1px solid ${t.iconBorder}`,
          boxShadow: `0 4px 14px ${t.orb}, inset 0 1px 0 rgba(255,255,255,0.15)`,
        }}>
        <Icon className="w-5 h-5" style={{ color: hexColor, filter: `drop-shadow(0 0 6px ${hexColor}88)` }} />
      </div>

      {/* Label */}
      <p className="text-xs text-muted-foreground mb-1 font-semibold relative z-10 tracking-wide">{label}</p>

      {/* Value */}
      <p className="text-2xl font-black relative z-10 leading-tight"
        style={{ color: hexColor, textShadow: `0 0 20px ${hexColor}55` }}>
        {value < 0 && <span style={{ color: "#f43f5e" }}>-</span>}
        <AnimNum value={Math.round(Math.abs(value))} />
        <span className="text-xs font-normal text-muted-foreground mr-1">ج.م</span>
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2.5 relative z-10"
        style={{ borderTop: `1px solid ${t.border}` }}>
        <p className="text-xs text-muted-foreground">{sub}</p>
        {delta != null && (
          <span
            className="text-xs font-black flex items-center gap-0.5 px-2 py-0.5 rounded-full"
            style={{
              background: delta >= 0 ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)",
              color: delta >= 0 ? "#10b981" : "#f43f5e",
              border: `1px solid ${delta >= 0 ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.25)"}`,
            }}>
            {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
  return link ? <Link href={link}>{inner}</Link> : inner;
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({icon:Icon,title,sub,link}:{icon:any;title:string;sub?:string;link?:string}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary"/>
        </div>
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {link && (
        <Link href={link}>
          <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
            عرض الكل <ChevronRight className="w-3 h-3"/>
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({active,payload,label}:any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card/95 backdrop-blur p-3 shadow-xl text-xs space-y-1.5">
      <p className="font-bold text-muted-foreground">{label}</p>
      {payload.map((p:any,i:number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{background:p.color}}/>
          <span>{p.name}: <strong>{fmtS(p.value)}</strong></span>
        </div>
      ))}
    </div>
  );
}

// ─── Cash Flow Sankey ─────────────────────────────────────────────────────────
function CashFlowMap({registers}:{registers:any[]}) {
  const main     = registers.find(r => r.type === "main");
  const branches = registers.filter(r => r.type !== "main");
  const total    = registers.reduce((s,r) => s + r.balance, 0);
  return (
    <div className="space-y-3">
      {branches.map(b => {
        const pct = total > 0 ? Math.round((b.balance/total)*100) : 0;
        return (
          <div key={b.id} className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 group hover:border-blue-500/40 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Building2 className="w-3 h-3 text-blue-400"/>{b.name}
                {b.lowBalanceThreshold && b.balance <= b.lowBalanceThreshold && (
                  <span className="text-[10px] bg-rose-500/10 text-rose-500 px-1 rounded-full">منخفض!</span>
                )}
              </span>
              <span className="text-xs text-blue-400 font-bold">{pct}%</span>
            </div>
            <p className="text-base font-black text-blue-500">{fmtF(b.balance)}</p>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>↑ دخل: {fmtS(b.monthlyIn)}</span>
              <span>↓ خرج: {fmtS(b.monthlyOut)}</span>
            </div>
            <div className="mt-1.5 h-1 bg-blue-500/10 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{width:`${pct}%`,transition:"width 1.2s cubic-bezier(.4,0,.2,1)"}}/>
            </div>
          </div>
        );
      })}

      {/* الخزنة الرئيسية */}
      {main && (
        <div className="rounded-xl border-2 border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 to-amber-500/5 p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent pointer-events-none"/>
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500"/>
            <span className="text-sm font-bold text-yellow-600">{main.name}</span>
            <span className="text-[10px] bg-yellow-500/15 text-yellow-600 px-1.5 py-0.5 rounded-full">رئيسية</span>
          </div>
          <p className="text-2xl font-black text-yellow-500">{fmtF(main.balance)}</p>
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>↑ دخل هذا الشهر: {fmtS(main.monthlyIn)}</span>
            <span>↓ خرج هذا الشهر: {fmtS(main.monthlyOut)}</span>
          </div>
        </div>
      )}
      {registers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Wallet className="w-8 h-8 mx-auto mb-2 opacity-20"/>
          لا توجد خزن مضافة بعد
        </div>
      )}
    </div>
  );
}

// ─── Break-Even Tracker ───────────────────────────────────────────────────────
function BreakEvenTracker({ pnl, orders, isLoading }: { pnl: any; orders: any; isLoading: boolean }) {
  const revenue   = Number(pnl?.revenue   ?? 0);
  const cogs      = Number(pnl?.cogs      ?? 0);
  const shipping  = Number(pnl?.shipping  ?? 0);
  const expenses  = Number(pnl?.expenses  ?? 0);
  const delivered = Number(orders?.delivered ?? 0);

  // الحسابات
  const avgRevPerOrder      = delivered > 0 ? revenue / delivered : 0;
  const variableCostPerOrder = delivered > 0 ? (cogs + shipping) / delivered : 0;
  const contributionMargin  = avgRevPerOrder - variableCostPerOrder;
  const cmRatio             = avgRevPerOrder > 0 ? (contributionMargin / avgRevPerOrder) * 100 : 0;
  const breakEvenUnits      = contributionMargin > 0 ? Math.ceil(expenses / contributionMargin) : null;
  const breakEvenRevenue    = breakEvenUnits !== null ? breakEvenUnits * avgRevPerOrder : null;
  const safetyMargin        = breakEvenUnits !== null && delivered > 0
    ? +((( delivered - breakEvenUnits) / delivered) * 100).toFixed(1)
    : null;
  const progressPct         = breakEvenUnits !== null && breakEvenUnits > 0
    ? Math.min(Math.round((delivered / breakEvenUnits) * 100), 100)
    : 0;
  const achieved            = breakEvenUnits !== null && delivered >= breakEvenUnits;
  const hasData             = revenue > 0 && delivered > 0;

  const statusColor  = achieved ? "#10B981" : progressPct >= 70 ? "#F59E0B" : "#EF4444";
  const statusGlow   = achieved ? "rgba(16,185,129,0.25)" : progressPct >= 70 ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.25)";
  const statusLabel  = achieved ? "✅ تجاوزت نقطة التعادل" : progressPct >= 70 ? "⚡ قريب جداً" : "📊 لم تصل بعد";

  return (
    <div className="relative overflow-hidden rounded-[22px] p-5"
      style={{
        background: `linear-gradient(135deg, ${statusGlow.replace("0.25","0.20")} 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${statusGlow}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 32px ${statusGlow}`,
        backdropFilter: "blur(12px)",
      }}>
      {/* خط الضوء العلوي */}
      <div className="absolute inset-x-10 top-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${statusColor}, transparent)` }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: statusGlow, border: `1px solid ${statusGlow.replace("0.25","0.40")}` }}>
            <Crosshair className="w-4 h-4" style={{ color: statusColor }} />
          </div>
          <div>
            <h3 className="text-sm font-black" style={{ color: "hsl(var(--foreground))" }}>نقطة التعادل</h3>
            <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>كام طلب محتاج عشان تغطي مصروفاتك؟</p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: statusGlow, color: statusColor, border: `1px solid ${statusGlow.replace("0.25","0.35")}` }}>
          {isLoading ? "..." : statusLabel}
        </span>
      </div>

      {!hasData && !isLoading ? (
        <div className="text-center py-6" style={{ color: "hsl(var(--muted-foreground))" }}>
          <Target className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p className="text-sm">لا توجد بيانات كافية في هذه الفترة</p>
          <p className="text-xs mt-1 opacity-60">سجّل طلبات ومصروفات لتفعيل الحساب</p>
        </div>
      ) : (
        <>
          {/* أرقام Break-Even الرئيسية */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              {
                label: "نقطة التعادل (طلبات)",
                value: isLoading ? "..." : breakEvenUnits !== null ? breakEvenUnits.toLocaleString("ar-EG") : "—",
                sub: "الحد الأدنى للربحية",
                color: statusColor, icon: Target,
              },
              {
                label: "إيراد التعادل",
                value: isLoading ? "..." : breakEvenRevenue !== null ? fmtS(breakEvenRevenue) + " ج.م" : "—",
                sub: "الإيراد اللازم للتغطية",
                color: "#6366F1", icon: DollarSign,
              },
              {
                label: "هامش الأمان",
                value: isLoading ? "..." : safetyMargin !== null ? `${safetyMargin > 0 ? "+" : ""}${safetyMargin}%` : "—",
                sub: safetyMargin !== null && safetyMargin > 0 ? "فوق نقطة التعادل" : "تحت نقطة التعادل",
                color: safetyMargin !== null && safetyMargin > 0 ? "#10B981" : "#EF4444", icon: TrendingUp,
              },
              {
                label: "هامش المساهمة",
                value: isLoading ? "..." : contributionMargin > 0 ? fmtS(contributionMargin) + " ج.م" : "—",
                sub: `${cmRatio.toFixed(1)}% لكل طلب`,
                color: "#F59E0B", icon: PiggyBank,
              },
            ].map(c => (
              <div key={c.label} className="relative overflow-hidden rounded-[16px] px-3 py-3 text-center"
                style={{
                  background: `rgba(255,255,255,0.04)`,
                  border: `1px solid rgba(255,255,255,0.10)`,
                  backdropFilter: "blur(8px)",
                }}>
                <c.icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: c.color }} />
                <p className="text-[10px] font-bold mb-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>{c.label}</p>
                <p className="font-black text-base leading-tight" style={{ color: c.color, textShadow: `0 0 12px ${c.color}66` }}>{c.value}</p>
                <p className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          {breakEvenUnits !== null && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: "hsl(var(--muted-foreground))" }}>
                  التقدم نحو نقطة التعادل
                </span>
                <span className="text-xs font-black" style={{ color: statusColor }}>
                  {delivered.toLocaleString("ar-EG")} / {breakEvenUnits.toLocaleString("ar-EG")} طلب ({progressPct}%)
                </span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-1000 relative"
                  style={{
                    width: `${progressPct}%`,
                    background: `linear-gradient(90deg, ${statusColor}99, ${statusColor})`,
                    boxShadow: `0 0 10px ${statusColor}88`,
                  }}>
                  {progressPct > 15 && (
                    <div className="absolute inset-0 flex items-center justify-end pr-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
                    </div>
                  )}
                </div>
              </div>
              {achieved && (
                <p className="text-[11px] mt-1.5 font-bold text-center" style={{ color: "#10B981" }}>
                  🎉 تجاوزت نقطة التعادل بـ {(delivered - breakEvenUnits).toLocaleString("ar-EG")} طلب إضافي
                </p>
              )}
              {!achieved && breakEvenUnits !== null && (
                <p className="text-[11px] mt-1.5 text-center" style={{ color: "rgba(255,255,255,0.45)" }}>
                  محتاج {Math.max(breakEvenUnits - delivered, 0).toLocaleString("ar-EG")} طلب إضافي للوصول لنقطة التعادل
                </p>
              )}
            </div>
          )}

          {/* تفاصيل الحساب */}
          <div className="rounded-[14px] p-3.5 space-y-2.5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.50)" }}>📐 تفاصيل الحساب</p>
            {[
              { label: "متوسط إيراد الطلب",           value: fmtF(avgRevPerOrder),      color: "#10B981" },
              { label: "متوسط التكلفة المتغيرة / طلب", value: fmtF(variableCostPerOrder), color: "#EF4444" },
              { label: "هامش المساهمة / طلب",          value: fmtF(contributionMargin),  color: "#F59E0B" },
              { label: "المصروفات الثابتة (التشغيلية)", value: fmtF(expenses),            color: "#8B5CF6" },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.50)" }}>{row.label}</span>
                <span className="text-[11px] font-bold" style={{ color: row.color }}>{isLoading ? "..." : row.value}</span>
              </div>
            ))}
            <div className="pt-2 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.30)" }}>
                نقطة التعادل = المصروفات الثابتة ÷ هامش المساهمة لكل طلب
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── MoM Expense Comparison ──────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  shipping_fees: "#3B82F6", warehouse_rent: "#8B5CF6", salary: "#10B981",
  marketing: "#F59E0B", packaging: "#06B6D4", utilities: "#EAB308",
  maintenance: "#F97316", returns_loss: "#EF4444", other: "#6B7280",
};

function MoMExpenseReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["expense-monthly-breakdown"],
    queryFn: () => apiFetch("/api/finance/expenses/monthly-breakdown"),
    staleTime: 120_000,
  });

  const months: string[]     = data?.months     ?? [];
  const categories: string[] = data?.categories ?? [];
  const raw: Record<string, Record<string, number>> = data?.data ?? {};

  // حوّل البيانات لـ recharts format
  const chartData = months.map(m => {
    const row: Record<string, any> = { month: m };
    let total = 0;
    for (const cat of categories) {
      const val = raw[m]?.[cat] ?? 0;
      row[cat] = val;
      total += val;
    }
    row._total = total;
    return row;
  });

  // جدول مقارنة: كل فئة × كل شهر
  const tableCategories = categories.filter(cat =>
    months.some(m => (raw[m]?.[cat] ?? 0) > 0)
  );

  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <div className="relative overflow-hidden rounded-[22px] p-5"
      style={{
        background: "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(255,255,255,0.01) 100%)",
        border: "1px solid rgba(245,158,11,0.25)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 32px rgba(245,158,11,0.12)",
        backdropFilter: "blur(12px)",
      }}>
      {/* خط الضوء العلوي */}
      <div className="absolute inset-x-10 top-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, #f59e0b, transparent)" }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)" }}>
            <BarChart3 className="w-4 h-4" style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <h3 className="text-sm font-black">مقارنة المصروفات شهر بشهر</h3>
            <p className="text-[11px] text-muted-foreground">كل فئة مصروف لكل شهر — اعرف فين بتصرف أكتر</p>
          </div>
        </div>
        <div className="flex gap-1">
          {(["chart","table"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`text-xs px-3 py-1 rounded-lg font-bold transition-all ${view===v ? "text-white" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}
              style={view===v ? { background: "#f59e0b" } : {}}>
              {v === "chart" ? "📊 رسم بياني" : "📋 جدول"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
      ) : months.length === 0 ? (
        <div className="h-52 flex flex-col items-center justify-center text-muted-foreground">
          <BarChart3 className="w-10 h-10 mb-2 opacity-20" />
          <p className="text-sm">لا توجد مصروفات مسجلة بعد</p>
        </div>
      ) : view === "chart" ? (
        <>
          <div className="rounded-[18px] px-2 py-3"
            style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="goldTotalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 5" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} axisLine={false} tickLine={false} tickFormatter={v => fmtS(v)} width={42} />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div dir="rtl" className="rounded-2xl px-4 py-3 shadow-2xl text-xs space-y-1.5 min-w-[160px]"
                        style={{ background: "hsl(var(--card))", border: "1px solid rgba(245,158,11,0.35)" }}>
                        <p className="font-black text-sm" style={{ color: "#f59e0b" }}>{label}</p>
                        {payload.map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                              <span className="text-muted-foreground">{p.name}</span>
                            </div>
                            <span className="font-black" style={{ color: p.color }}>{fmtS(p.value)} ج.م</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone" dataKey="_total" name="الإجمالي"
                  stroke="#f59e0b" strokeWidth={3} fill="url(#goldTotalGrad)"
                  dot={{ r: 5, fill: "#f59e0b", stroke: "#000", strokeWidth: 1.5 }}
                  activeDot={{ r: 7, fill: "#f59e0b", stroke: "#fff", strokeWidth: 2,
                    style: { filter: "drop-shadow(0 0 8px #f59e0b)" } }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Totals row */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {chartData.map(d => (
              <div key={d.month} className="shrink-0 text-center px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.20)" }}>
                <p className="text-[10px] text-muted-foreground">{d.month}</p>
                <p className="text-xs font-black" style={{ color: "#f59e0b" }}>{fmtS(d._total)}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Table view */
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-right pb-2 pr-1 text-muted-foreground font-bold">الفئة</th>
                {months.map(m => (
                  <th key={m} className="text-center pb-2 px-2 text-muted-foreground font-bold whitespace-nowrap">{m}</th>
                ))}
                <th className="text-center pb-2 px-2 font-bold" style={{ color: "#f59e0b" }}>المجموع</th>
              </tr>
            </thead>
            <tbody>
              {tableCategories.map((cat, i) => {
                const catTotal = months.reduce((s, m) => s + (raw[m]?.[cat] ?? 0), 0);
                return (
                  <tr key={cat} className={`border-b border-white/5 ${i % 2 === 0 ? "bg-white/2" : ""}`}>
                    <td className="py-2 pr-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: CAT_COLORS[cat] ?? PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="font-medium">{CAT_LABELS[cat] ?? cat}</span>
                      </div>
                    </td>
                    {months.map(m => {
                      const val = raw[m]?.[cat] ?? 0;
                      const maxForCat = Math.max(...months.map(mo => raw[mo]?.[cat] ?? 0));
                      const isMax = val > 0 && val === maxForCat;
                      return (
                        <td key={m} className="text-center px-2 py-2">
                          {val > 0 ? (
                            <span className={`font-bold ${isMax ? "text-rose-400" : "text-foreground"}`}>
                              {isMax ? "🔴 " : ""}{fmtS(val)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center px-2 py-2 font-black" style={{ color: "#f59e0b" }}>{fmtS(catTotal)}</td>
                  </tr>
                );
              })}
              {/* صف الإجمالي */}
              <tr style={{ borderTop: "2px solid rgba(245,158,11,0.30)", background: "rgba(245,158,11,0.05)" }}>
                <td className="py-2.5 pr-1 font-black" style={{ color: "#f59e0b" }}>الإجمالي</td>
                {months.map(m => (
                  <td key={m} className="text-center px-2 py-2.5 font-black" style={{ color: "#f59e0b" }}>
                    {fmtS(chartData.find(d => d.month === m)?._total ?? 0)}
                  </td>
                ))}
                <td className="text-center px-2 py-2.5 font-black" style={{ color: "#f59e0b" }}>
                  {fmtS(chartData.reduce((s, d) => s + d._total, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Monthly Flow Chart — منحنى دهبي ──────────────────────────────────────────

function MonthlyFlowChart({ data, isLoading }: { data: any[]; isLoading: boolean }) {
  const GOLD = "#f59e0b";
  const GOLD_GLOW = "rgba(245,158,11,0.35)";

  const total = data.reduce((s, m) => s + (m.revenue ?? 0), 0);
  const best  = data.reduce((a, b) => (b.revenue > a.revenue ? b : a), data[0] ?? { label: "—", revenue: 0 });

  return (
    <div className="relative overflow-hidden rounded-[26px] p-5"
      style={{
        background: "linear-gradient(135deg, rgba(245,158,11,0.07) 0%, rgba(255,255,255,0.01) 100%)",
        border: "1px solid rgba(245,158,11,0.25)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 32px rgba(245,158,11,0.10)",
      }}>
      {/* خط ضوء علوي */}
      <div className="absolute inset-x-12 top-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, #f59e0b, transparent)" }} />

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)" }}>
          <BarChart3 className="w-4 h-4" style={{ color: GOLD }} />
        </div>
        <div>
          <h3 className="text-sm font-black">التدفق المالي — آخر 6 شهور</h3>
          <p className="text-[11px] text-muted-foreground">إجمالي الإيراد الشهري</p>
        </div>
        {/* stat صغير */}
        <div className="mr-auto flex items-center gap-3">
          <div className="text-end">
            <p className="text-[10px] text-muted-foreground">الإجمالي</p>
            <p className="text-sm font-black" style={{ color: GOLD }}>{fmtS(total)} ج.م</p>
          </div>
          <div className="text-end">
            <p className="text-[10px] text-muted-foreground">أفضل شهر</p>
            <p className="text-sm font-black" style={{ color: GOLD }}>{best.label}</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
      ) : data.length === 0 ? (
        <div className="h-56 flex flex-col items-center justify-center text-muted-foreground">
          <BarChart3 className="w-10 h-10 mb-2 opacity-20" />
          <p className="text-sm">لا توجد بيانات بعد</p>
        </div>
      ) : (
        <div className="rounded-[18px] px-2 py-3"
          style={{ background: "hsl(var(--muted)/0.25)", border: "1px solid hsl(var(--border)/0.5)" }}>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={GOLD} stopOpacity={0.40} />
                  <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 5" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => fmtS(v)} width={44} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div dir="rtl" className="rounded-2xl px-4 py-3 shadow-2xl text-xs space-y-1 min-w-[140px]"
                      style={{ background: "hsl(var(--card))", border: `1px solid ${GOLD}55` }}>
                      <p className="font-black text-sm" style={{ color: GOLD }}>{label}</p>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">الإيراد</span>
                        <span className="font-black" style={{ color: GOLD }}>{fmtS(payload[0]?.value as number)} ج.م</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="revenue" name="الإيراد"
                stroke={GOLD} strokeWidth={3} fill="url(#goldGrad)"
                dot={{ r: 5, fill: GOLD, stroke: "#000", strokeWidth: 1.5 }}
                activeDot={{ r: 7, fill: GOLD, stroke: "#fff", strokeWidth: 2, style: { filter: `drop-shadow(0 0 8px ${GOLD})` } }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FinanceHub() {
  const { user, can, isAdmin } = useAuth();

  // ── Finance access guard ───────────────────────────────────────────────────
  if (!isAdmin && !can("finance.view")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
        <p className="text-muted-foreground text-sm max-w-xs">ليس لديك صلاحية لعرض صفحة الماليات. تواصل مع المدير.</p>
      </div>
    );
  }

  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to,   setTo]   = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["finance-hub", from, to],
    queryFn: () => apiFetch(`/api/finance/hub?from=${from}&to=${to}`),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  const pnl  = data?.pnl;
  const cash = data?.cash;
  const ords = data?.orders;
  const alts = data?.alerts ?? [];
  const expCat = data?.expByCategory ?? [];
  const monthly: any[] = data?.monthlyChart ?? [];
  const dailyFlow: any[] = data?.dailyFlow ?? [];
  const recentTx: any[] = data?.recentTransactions ?? [];

  const monthlyChartData = (() => {
    // نبني قائمة آخر 6 شهور دائماً
    const months: { month: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const mon = String(d.getMonth() + 1).padStart(2, "0");
      months.push({ month: key, label: MONTH_AR[mon] ?? key });
    }
    // دمج مع البيانات الحقيقية
    return months.map(({ month, label }) => {
      const found = monthly.find((m: any) => m.month === month);
      return { month, label, revenue: found?.revenue ?? 0, expenses: found?.expenses ?? 0, profit: found?.profit ?? 0, orders: found?.orders ?? 0 };
    });
  })();

  const dailyChartData = dailyFlow.map(d => ({
    ...d,
    label: new Date(d.day).toLocaleDateString("ar-EG", {day:"numeric", month:"numeric"}),
  }));

  // Pie chart للمصروفات
  const pieData = expCat.slice(0,7).map((e:any) => ({
    name: CAT_LABELS[e.category] ?? e.category,
    value: e.total,
  }));

  const totalCash = cash?.totalBalance ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
              <Layers className="w-5 h-5 text-primary-foreground"/>
            </div>
            <h1 className="text-2xl font-black">مركز الماليات</h1>
            {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground"/>}
          </div>
          <p className="text-muted-foreground text-sm mr-11">لوحة تحكم مالية شاملة — أرباح · خزن · مصروفات · تحليلات</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm bg-card border border-border rounded-xl px-3 py-2">
            <span className="text-muted-foreground text-xs">من</span>
            <input type="date" className="bg-transparent text-sm outline-none w-32" value={from} onChange={e=>setFrom(e.target.value)}/>
            <span className="text-muted-foreground text-xs">إلى</span>
            <input type="date" className="bg-transparent text-sm outline-none w-32" value={to} onChange={e=>setTo(e.target.value)}/>
          </div>
          <Button variant="outline" size="sm" onClick={()=>refetch()} className="gap-1.5 h-9">
            <RefreshCw className="w-3.5 h-3.5"/> تحديث
          </Button>
        </div>
      </div>

      {/* ── Smart Alerts ────────────────────────────────────────────────────── */}
      {alts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-2">
          {alts.map((a:any, i:number) => {
            const s = ALERT_STYLE[a.type] ?? ALERT_STYLE.info;
            return (
              <div key={i} className={`flex items-start gap-2.5 rounded-xl border ${s.border} ${s.bg} px-3.5 py-2.5 animate-in slide-in-from-top-1`} style={{animationDelay:`${i*50}ms`}}>
                <s.Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.icon}`}/>
                <div>
                  <p className="text-xs font-semibold">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground">{a.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="إجمالي الكاش" value={totalCash} sub={`${cash?.registers?.length ?? 0} خزنة نشطة`}
          icon={Banknote} hexColor="#f59e0b" theme="yellow"
          link="/finance/cash"
        />
        <KpiCard label="الإيراد" value={pnl?.revenue ?? 0} sub={`${fmt(ords?.delivered ?? 0)} طلب مسلّم`}
          icon={TrendingUp} hexColor="#10b981" theme="emerald"
          delta={pnl?.changes?.revenue}
        />
        <KpiCard label="صافي الربح" value={pnl?.netProfit ?? 0} sub={`هامش ${pnl?.netMargin ?? 0}%`}
          icon={PiggyBank}
          hexColor={(pnl?.netProfit ?? 0) >= 0 ? "#3b82f6" : "#f43f5e"}
          theme={(pnl?.netProfit ?? 0) >= 0 ? "blue" : "rose"}
          delta={pnl?.changes?.netProfit}
        />
        <KpiCard label="المصروفات" value={pnl?.expenses ?? 0} sub={`${expCat.length} فئة مصروفات`}
          icon={Receipt} hexColor="#f43f5e" theme="rose"
          delta={pnl?.changes?.expenses} link="/finance/expenses"
        />
      </div>


      {/* ── Chart المبيعات والأرباح (آخر 6 شهور) ───────────────────────────── */}
      <MonthlyFlowChart data={monthlyChartData} isLoading={isLoading} />

      {/* ── التدفق النقدي + الخزنة (always 2 cols on md+) ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* التدفق النقدي اليومي */}
        <Card className="border-border p-5">
          <SectionHeader icon={Activity} title="التدفق النقدي اليومي" sub="آخر 30 يوم" link="/finance/cash/analytics"/>
          {isLoading ? (
            <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
          ) : dailyChartData.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-muted-foreground">
              <Activity className="w-8 h-8 mb-2 opacity-20"/>
              <p className="text-xs text-center">لا توجد حركات خزنة بعد<br/>أضف خزنة وسجّل أول حركة</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={176}>
              <AreaChart data={dailyChartData} margin={{top:5,right:5,left:0,bottom:0}}>
                <defs>
                  <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3}/>
                <XAxis dataKey="label" tick={{fontSize:9}} axisLine={false} tickLine={false} interval={4}/>
                <YAxis tick={{fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>fmtS(v)} width={38}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Area type="monotone" dataKey="in" name="دخل" stroke="#10b981" strokeWidth={2} fill="url(#gradIn)"/>
                <Area type="monotone" dataKey="out" name="خرج" stroke="#f43f5e" strokeWidth={1.5} fill="url(#gradOut)"/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* خريطة الخزن */}
        <Card className="border-border p-5">
          <SectionHeader icon={Wallet} title="الخزنة وتدفق الأموال" sub={`إجمالي الكاش: ${fmtF(totalCash)}`} link="/finance/cash"/>
          <CashFlowMap registers={cash?.registers ?? []}/>
        </Card>
      </div>


      {/* ── Grid: P&L + مؤشرات الطلبات ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* P&L Statement */}
        <Card className="border-border overflow-hidden lg:col-span-3">
          <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
            <SectionHeader icon={FileText} title="قائمة الأرباح والخسائر" sub="مقارنة بالفترة السابقة"/>
          </div>
          <div className="divide-y divide-border">
            {[
              {label:"الإيراد الإجمالي",   val:pnl?.revenue??0,     color:"text-emerald-500", sign:"+",Icon:DollarSign },
              {label:"تكلفة البضاعة",      val:pnl?.cogs??0,         color:"text-orange-400",  sign:"−",Icon:Package    },
              {label:"مصاريف الشحن",       val:pnl?.shipping??0,     color:"text-sky-400",     sign:"−",Icon:Truck      },
              {label:"خسائر المرتجعات",    val:pnl?.returnLoss??0,   color:"text-red-400",     sign:"−",Icon:RefreshCw  },
              {label:"المصروفات التشغيلية",val:pnl?.expenses??0,     color:"text-rose-400",    sign:"−",Icon:Receipt    },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-2.5">
                  <row.Icon className={`w-4 h-4 ${row.color}`}/>
                  <p className="text-sm">{row.label}</p>
                </div>
                <p className={`text-sm font-bold ${row.color}`}>{isLoading?"...": `${row.sign} ${fmtF(row.val)}`}</p>
              </div>
            ))}
            {/* مجمل الربح */}
            <div className="flex items-center justify-between px-5 py-3 bg-blue-500/5">
              <p className="text-sm font-semibold text-blue-500">مجمل الربح</p>
              <div className="text-end">
                <p className="text-sm font-bold text-blue-500">{isLoading?"...":fmtF(pnl?.grossProfit??0)}</p>
                <p className="text-[11px] text-muted-foreground">هامش {pnl?.grossMargin??0}%</p>
              </div>
            </div>
            {/* صافي الربح */}
            <div className={`flex items-center justify-between px-5 py-4 ${(pnl?.netProfit??0)>=0?"bg-emerald-500/8":"bg-rose-500/8"}`}>
              <div className="flex items-center gap-2">
                {(pnl?.netProfit??0)>=0 ? <TrendingUp className="w-5 h-5 text-emerald-500"/> : <TrendingDown className="w-5 h-5 text-rose-500"/>}
                <p className="font-bold">صافي الربح</p>
              </div>
              <div className="text-end">
                <p className={`text-xl font-black ${(pnl?.netProfit??0)>=0?"text-emerald-500":"text-rose-500"}`}>
                  {isLoading?"...":fmtF(pnl?.netProfit??0)}
                </p>
                <p className="text-xs text-muted-foreground">هامش {pnl?.netMargin??0}%</p>
              </div>
            </div>
          </div>
        </Card>

        {/* مؤشرات الطلبات */}
        <div className="lg:col-span-2 space-y-3">
          <SectionHeader icon={Package} title="مؤشرات الطلبات"/>
          {[
            {label:"إجمالي الطلبات", val:fmt(ords?.total??0), sub:"في الفترة المحددة", color:"text-foreground", bg:"bg-muted/50", Icon:Package},
            {label:"طلبات مسلّمة",   val:fmt(ords?.delivered??0), sub:`نسبة ${ords?.deliveryRate??0}%`, color:"text-emerald-500", bg:"bg-emerald-500/10", Icon:CheckCircle2},
            {label:"طلبات مرتجعة",  val:fmt(ords?.returned??0), sub:`نسبة ${ords?.returnRate??0}%`, color:"text-rose-500", bg:"bg-rose-500/10", Icon:RefreshCw},
            {label:"قيد الشحن",     val:fmt(ords?.pending??0), sub:"لم يُحسم بعد", color:"text-sky-500", bg:"bg-sky-500/10", Icon:Truck},
          ].map(item => (
            <div key={item.label} className={`rounded-xl ${item.bg} border border-border p-3.5 flex items-center gap-3`}>
              <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                <item.Icon className={`w-4 h-4 ${item.color}`}/>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`text-xl font-black ${item.color}`}>{isLoading?"...":item.val}</p>
                <p className="text-[11px] text-muted-foreground">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>


      {/* ── Grid: توزيع المصروفات + آخر الحركات ────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Pie: توزيع المصروفات */}
        <div className="relative overflow-hidden rounded-[22px] p-5"
          style={{
            background: "linear-gradient(135deg, rgba(244,63,94,0.10) 0%, rgba(251,113,133,0.04) 60%, rgba(0,0,0,0) 100%)",
            border: "1px solid rgba(244,63,94,0.28)",
            boxShadow: "0 0 0 1px rgba(244,63,94,0.10), 0 8px 40px rgba(244,63,94,0.18), 0 2px 8px rgba(244,63,94,0.08)",
            backdropFilter: "blur(14px)",
          }}>
          {/* خط ضوء علوي */}
          <div className="absolute inset-x-10 top-0 h-px pointer-events-none"
            style={{ background: "linear-gradient(90deg,transparent,#f43f5e,transparent)" }}/>
          {/* كرة ضوء */}
          <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full pointer-events-none opacity-30"
            style={{ background: "radial-gradient(circle,rgba(244,63,94,0.18) 0%,transparent 70%)" }}/>
          <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(244,63,94,0.18)", border: "1px solid rgba(244,63,94,0.35)" }}>
                <Receipt className="w-4 h-4" style={{ color: "#f43f5e", filter: "drop-shadow(0 0 6px #f43f5e88)" }}/>
              </div>
              <div>
                <h2 className="text-sm font-bold">توزيع المصروفات</h2>
                <p className="text-xs text-muted-foreground">بالفئة للفترة المحددة</p>
              </div>
            </div>
            <Link href="/finance/expenses">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                عرض الكل <ChevronRight className="w-3 h-3"/>
              </Button>
            </Link>
          </div>
          {isLoading ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
          ) : pieData.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-muted-foreground">
              <Receipt className="w-8 h-8 mb-2 opacity-20"/>
              <p className="text-xs text-center">لا توجد مصروفات بعد<br/>أضف أول مصروف من قسم المصروفات</p>
            </div>
          ) : (() => {
            const totalExp = pieData.reduce((s:number, e:any) => s + e.value, 0);
            return (
              <div className="space-y-4">
                {/* Donut Chart */}
                <div className="relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData} cx="50%" cy="50%"
                        innerRadius={70} outerRadius={100}
                        paddingAngle={3} dataKey="value"
                        isAnimationActive animationDuration={900}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                          if (percent < 0.04) return null;
                          const RADIAN = Math.PI / 180;
                          const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                          const x = cx + r * Math.cos(-midAngle * RADIAN);
                          const y = cy + r * Math.sin(-midAngle * RADIAN);
                          return (
                            <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
                              style={{ fontSize: 11, fontWeight: 700 }}>
                              {`${Math.round(percent * 100)}%`}
                            </text>
                          );
                        }}
                        labelLine={false}
                      >
                        {pieData.map((_:any, i:number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}
                            style={{ filter: `drop-shadow(0 0 4px ${PIE_COLORS[i % PIE_COLORS.length]}66)` }}/>
                        ))}
                      </Pie>
                      <Tooltip formatter={(v:number) => [fmtF(v), "المبلغ"]}/>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* النص في المنتصف */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-3xl font-black text-foreground">{pieData.length}</p>
                    <p className="text-xs text-muted-foreground">فئة مصروفات</p>
                  </div>
                </div>
                {/* Legend */}
                <div className="space-y-2">
                  {pieData.map((e:any, i:number) => {
                    const pct = totalExp > 0 ? Math.round((e.value / totalExp) * 100) : 0;
                    const color = PIE_COLORS[i % PIE_COLORS.length];
                    return (
                      <div key={i} className="flex items-center gap-2">
                        {/* النقطة الملونة */}
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }}/>
                        {/* الاسم */}
                        <span className="text-xs flex-1 truncate text-foreground/80">{e.name}</span>
                        {/* النسبة */}
                        <span className="text-xs font-bold shrink-0" style={{ color }}>{pct}%</span>
                        {/* المبلغ في badge */}
                        <span className="text-xs font-black shrink-0 min-w-[36px] text-center rounded-md px-1.5 py-0.5"
                          style={{ background: `${color}22`, color }}>
                          {fmtS(e.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          </div>
        </div>

        {/* آخر حركات الخزنة */}
        <div className="relative overflow-hidden rounded-[22px] p-5"
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(52,211,153,0.04) 60%, rgba(0,0,0,0) 100%)",
            border: "1px solid rgba(16,185,129,0.28)",
            boxShadow: "0 0 0 1px rgba(16,185,129,0.10), 0 8px 40px rgba(16,185,129,0.18), 0 2px 8px rgba(16,185,129,0.08)",
            backdropFilter: "blur(14px)",
          }}>
          {/* خط ضوء علوي */}
          <div className="absolute inset-x-10 top-0 h-px pointer-events-none"
            style={{ background: "linear-gradient(90deg,transparent,#10b981,transparent)" }}/>
          {/* كرة ضوء */}
          <div className="absolute -top-10 -left-10 w-44 h-44 rounded-full pointer-events-none opacity-25"
            style={{ background: "radial-gradient(circle,rgba(16,185,129,0.18) 0%,transparent 70%)" }}/>
          <div className="relative z-10">
          <SectionHeader icon={Clock} title="آخر الحركات النقدية" link="/finance/cash"/>
          {isLoading ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
          ) : recentTx.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center text-muted-foreground">
              <Clock className="w-8 h-8 mb-2 opacity-20"/>
              <p className="text-xs text-center">لا توجد حركات بعد<br/>ستظهر هنا بعد أول حركة خزنة</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
              {recentTx.map((tx:any, i:number) => {
                const info = TX_LABELS[tx.type] ?? {label:tx.type, credit:true};
                return (
                  <div key={tx.id} className="flex items-center gap-2.5 py-2 border-b border-border/50 last:border-0 animate-in slide-in-from-right-1" style={{animationDelay:`${i*30}ms`}}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${info.credit?"bg-emerald-500/10":"bg-rose-500/10"}`}>
                      {info.credit ? <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-500"/> : <ArrowDownCircle className="w-3.5 h-3.5 text-rose-500"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{info.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{tx.description ?? "—"}</p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className={`text-xs font-bold ${info.credit?"text-emerald-500":"text-rose-500"}`}>
                        {info.credit?"+":"−"}{fmtS(parseFloat(tx.amount??0))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(tx.transactionDate).toLocaleDateString("ar-EG",{month:"numeric",day:"numeric"})}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>


      {/* ── Break-Even Tracker ──────────────────────────────────────────────── */}
      <BreakEvenTracker pnl={pnl} orders={ords} isLoading={isLoading} />

      {/* ── MoM Expense Comparison ──────────────────────────────────────────── */}
      <MoMExpenseReport />

      {/* ── مستحقات + أوامر الشراء + وصول سريع ────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* مستحقات الشحن — sky glow */}
        <Link href="/shipping">
          <div className="relative overflow-hidden rounded-[22px] p-5 group transition-all duration-300 hover:-translate-y-1.5 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(56,189,248,0.04) 60%, rgba(0,0,0,0) 100%)",
              border: "1px solid rgba(14,165,233,0.30)",
              boxShadow: "0 0 0 1px rgba(14,165,233,0.10), 0 8px 40px rgba(14,165,233,0.18), 0 2px 8px rgba(14,165,233,0.08)",
              backdropFilter: "blur(14px)",
            }}>
            <div className="absolute inset-x-8 top-0 h-px pointer-events-none"
              style={{ background: "linear-gradient(90deg,transparent,#0ea5e9,transparent)" }}/>
            <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full pointer-events-none opacity-60"
              style={{ background: "radial-gradient(circle,rgba(14,165,233,0.15) 0%,transparent 70%)" }}/>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,rgba(14,165,233,0.28),rgba(56,189,248,0.12))", border: "1px solid rgba(14,165,233,0.40)", boxShadow: "0 4px 14px rgba(14,165,233,0.15), inset 0 1px 0 rgba(255,255,255,0.15)" }}>
                  <Truck className="w-4 h-4" style={{ color: "#0ea5e9", filter: "drop-shadow(0 0 6px #0ea5e988)" }}/>
                </div>
                <div>
                  <p className="text-sm font-bold">مستحقات الشحن</p>
                  <p className="text-[11px] text-muted-foreground">طلبات في الشحن</p>
                </div>
              </div>
              <p className="text-2xl font-black" style={{ color: "#0ea5e9", textShadow: "0 0 20px #0ea5e955" }}>
                {isLoading ? "..." : fmtF(data?.unpaidShipping?.total ?? 0)}
              </p>
              <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: "1px solid rgba(14,165,233,0.20)" }}>
                {isLoading ? (
                  <p className="text-xs text-muted-foreground">جاري التحميل...</p>
                ) : (data?.unpaidShipping?.byCompany ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد طلبات في الشحن</p>
                ) : (
                  (data?.unpaidShipping?.byCompany ?? []).map((co: any) => (
                    <div key={co.id} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground truncate max-w-[55%]">{co.name}</span>
                      <span className="text-xs font-bold" style={{ color: "#0ea5e9" }}>
                        {co.count} طلب
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Link>

        {/* أوامر الشراء — violet glow */}
        <Link href="/finance/purchases">
          <div className="relative overflow-hidden rounded-[22px] p-5 group transition-all duration-300 hover:-translate-y-1.5 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(167,139,250,0.04) 60%, rgba(0,0,0,0) 100%)",
              border: "1px solid rgba(139,92,246,0.30)",
              boxShadow: "0 0 0 1px rgba(139,92,246,0.10), 0 8px 40px rgba(139,92,246,0.18), 0 2px 8px rgba(139,92,246,0.08)",
              backdropFilter: "blur(14px)",
            }}>
            <div className="absolute inset-x-8 top-0 h-px pointer-events-none"
              style={{ background: "linear-gradient(90deg,transparent,#8b5cf6,transparent)" }}/>
            <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full pointer-events-none opacity-60"
              style={{ background: "radial-gradient(circle,rgba(139,92,246,0.15) 0%,transparent 70%)" }}/>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.28),rgba(167,139,250,0.12))", border: "1px solid rgba(139,92,246,0.40)", boxShadow: "0 4px 14px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.15)" }}>
                  <ShoppingCart className="w-4 h-4" style={{ color: "#8b5cf6", filter: "drop-shadow(0 0 6px #8b5cf688)" }}/>
                </div>
                <div>
                  <p className="text-sm font-bold">أوامر الشراء</p>
                  <p className="text-[11px] text-muted-foreground">معلقة وجارية</p>
                </div>
              </div>
              <p className="text-2xl font-black" style={{ color: "#8b5cf6", textShadow: "0 0 20px #8b5cf655" }}>
                {isLoading ? "..." : fmtF(data?.pendingPurchases?.total ?? 0)}
              </p>
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(139,92,246,0.20)" }}>
                <p className="text-xs text-muted-foreground">{data?.pendingPurchases?.count ?? 0} أمر شراء</p>
              </div>
            </div>
          </div>
        </Link>

        {/* وصول سريع — multi-color subtle glow */}
        <div className="relative overflow-hidden rounded-[22px] p-5"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.03) 50%, rgba(0,0,0,0) 100%)",
            border: "1px solid rgba(99,102,241,0.22)",
            boxShadow: "0 0 0 1px rgba(99,102,241,0.08), 0 8px 32px rgba(99,102,241,0.12)",
            backdropFilter: "blur(14px)",
          }}>
          <div className="absolute inset-x-8 top-0 h-px pointer-events-none"
            style={{ background: "linear-gradient(90deg,transparent,#818cf8,transparent)" }}/>
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none opacity-20"
            style={{ background: "radial-gradient(circle,rgba(99,102,241,0.25) 0%,transparent 70%)" }}/>
          <div className="relative z-10">
            <p className="text-xs font-bold mb-3" style={{ color: "#818cf8" }}>⚡ وصول سريع</p>
            <div className="space-y-1.5">
              {[
                {href:"/finance/cash",           label:"الخزنة والحركات",   Icon:Wallet,      color:"#f59e0b"},
                {href:"/finance/client-account-sheet", label:"حساب العميل", Icon:Users,       color:"#ec4899"},
                {href:"/finance/sales",          label:"أوامر البيع (B2B)", Icon:ShoppingBag, color:"#14b8a6"},
                {href:"/finance/expenses",       label:"إضافة مصروف",       Icon:Receipt,     color:"#f43f5e"},
                {href:"/finance/suppliers",      label:"الموردون",          Icon:Building2,   color:"#3b82f6"},
                {href:"/finance/trip-settlement", label:"تسوية الرحلات والتحصيل", Icon:Truck, color:"#f97316"},
                {href:"/finance/cash/analytics", label:"تحليلات الخزنة",    Icon:BarChart3,   color:"#10b981"},
              ].map(item => (
                <Link key={item.href} href={item.href}>
                  <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group/item">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${item.color}18`, border: `1px solid ${item.color}30` }}>
                      <item.Icon className="w-3 h-3" style={{ color: item.color }}/>
                    </div>
                    <span className="text-xs flex-1">{item.label}</span>
                    <ArrowLeft className="w-3 h-3 opacity-30 group-hover/item:opacity-70 transition-opacity" style={{ color: item.color }}/>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
