import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  TrendingUp, TrendingDown, Minus, BarChart3,
  Wallet, RefreshCw, ArrowUpCircle, ArrowDownCircle,
  Star, Building2, Activity,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell, Sector,
} from "recharts";
import { apiFetch as _apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const apiFetch = (url: string) => _apiFetch<any>(url.replace(/^\/api/, ""));

const fmt = (v: number) =>
  v >= 1000000 ? (v / 1000000).toFixed(2) + "م" :
  v >= 1000    ? (v / 1000).toFixed(1)    + "k" :
  v.toLocaleString("ar-EG", { minimumFractionDigits: 0 });

const fmtFull = (v: number) =>
  Number(v).toLocaleString("ar-EG", { minimumFractionDigits: 2 }) + " ج.م";

const TX_LABELS: Record<string, string> = {
  deposit: "إيداع", withdrawal: "سحب", order_collected: "تحصيل طلب",
  shipping_transfer: "تحويل شحن", cash_sale: "مبيعات نقدية",
  expense_paid: "دفع مصروف", purchase_paid: "دفع مورد",
  transfer_in: "تحويل وارد", transfer_out: "تحويل صادر",
};
const CREDIT_TYPES = ["deposit","order_collected","shipping_transfer","cash_sale","transfer_in"];

const MONTH_NAMES: Record<string, string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل","05":"مايو","06":"يونيو",
  "07":"يوليو","08":"أغسطس","09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};

const PIE_COLORS = ["#10b981","#f43f5e","#3b82f6","#f59e0b","#8b5cf6","#06b6d4","#ec4899","#84cc16","#f97316"];

interface Analytics {
  currentMonth: { totalIn: number; totalOut: number; net: number; txCount: number };
  lastMonth:    { totalIn: number; totalOut: number; net: number; txCount: number };
  changes:      { inPct: number|null; outPct: number|null; netPct: number|null };
  monthlyChart: { month: string; in: number; out: number; net: number }[];
  typeBreakdown: { type: string; total: number; count: number }[];
  registerComparison: { id:number; name:string; type:string; balance:number; monthlyIn:number; monthlyOut:number; txCount:number }[];
  topTransactions: any[];
}

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${up ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
      {up ? <TrendingUp className="w-3 h-3"/> : <TrendingDown className="w-3 h-3"/>}
      {Math.abs(pct)}%
    </span>
  );
}

function StatCard({ label, value, sub, pct, color = "emerald" }: { label:string; value:number; sub:string; pct:number|null; color?:string }) {
  const colorMap: Record<string,string> = { emerald:"text-emerald-600", rose:"text-rose-600", sky:"text-sky-600", amber:"text-amber-600" };
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-black ${colorMap[color]}`}>{fmtFull(value)}</p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{sub}</p>
        <PctBadge pct={pct}/>
      </div>
    </div>
  );
}

// ─── Active Donut Shape (hover expand + glow) ─────────────────────────────────
function ActiveTxShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const label = TX_LABELS[payload.type] ?? payload.type;
  return (
    <g tabIndex={-1} style={{ outline: "none" }}>
      {/* Glow ring — أكبر وأنعم */}
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 4} outerRadius={outerRadius + 10}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.18} cornerRadius={8} />
      {/* Outer glow soft ring */}
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 10} outerRadius={outerRadius + 16}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.07} cornerRadius={8} />
      {/* Main segment — expanded */}
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 5} outerRadius={outerRadius + 8}
        startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={7}
        tabIndex={-1} style={{ outline: "none", filter: `drop-shadow(0 0 8px ${fill}88)` }} />
      {/* Center texts */}
      <text x={cx} y={cy - 14} textAnchor="middle" fill="hsl(var(--foreground))"
        fontSize={26} fontWeight={900} fontFamily="inherit" style={{ pointerEvents: "none", userSelect: "none" }}>
        {value}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="hsl(var(--muted-foreground))"
        fontSize={10} fontFamily="inherit" style={{ pointerEvents: "none", userSelect: "none" }}>
        {label}
      </text>
      <text x={cx} y={cy + 26} textAnchor="middle" fill={fill}
        fontSize={14} fontWeight={900} fontFamily="inherit" style={{ pointerEvents: "none", userSelect: "none" }}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    </g>
  );
}

// ─── Percent label inside each slice ─────────────────────────────────────────
function TxPctLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.07) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={11} fontWeight={700} style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))" }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ─── TxDonut — مكوّن الدائرة الكاملة ─────────────────────────────────────────
function TxDonut({ data }: { data: { type: string; total: number; count: number }[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = data.reduce((s, t) => s + t.count, 0);
  const isActive = activeIndex !== null;

  return (
    <div className="space-y-4">
      {/* Donut */}
      <div className="relative" style={{ height: 230 }}>
        {/* Center overlay — fade بدل snap */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10"
          style={{
            opacity: isActive ? 0 : 1,
            transition: "opacity 200ms ease",
          }}
        >
          <p className="text-4xl font-black text-foreground leading-none">{total}</p>
          <p className="text-xs text-muted-foreground mt-1">إجمالي الحركات</p>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart tabIndex={-1} style={{ outline: "none" }}>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius="50%" outerRadius="76%"
              paddingAngle={3}
              dataKey="count"
              stroke="none"
              cornerRadius={5}
              startAngle={90}
              endAngle={-270}
              labelLine={false}
              label={!isActive ? <TxPctLabel /> : undefined}
              activeIndex={activeIndex ?? undefined}
              activeShape={ActiveTxShape}
              animationBegin={0}
              animationDuration={700}
              animationEasing="ease-out"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              style={{ outline: "none", cursor: "pointer" }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="space-y-1.5">
        {data.map((t, i) => {
          const color = PIE_COLORS[i % PIE_COLORS.length];
          const pct = Math.round((t.count / total) * 100);
          const bg = color + "18";
          const isHighlighted = activeIndex === i;
          const isDimmed = activeIndex !== null && !isHighlighted;
          return (
            <div
              key={t.type}
              className="flex items-center gap-3 rounded-lg px-2 py-1"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              style={{
                background: isHighlighted ? bg : "transparent",
                border: isHighlighted ? `1px solid ${color}44` : "1px solid transparent",
                opacity: isDimmed ? 0.4 : 1,
                transition: "all 200ms ease",
                cursor: "pointer",
              }}
            >
              <span className="w-3 h-3 rounded-full shrink-0"
                style={{ background: color, boxShadow: isHighlighted ? `0 0 6px ${color}` : "none", transition: "box-shadow 200ms ease" }} />
              <span className="text-xs font-semibold text-foreground flex-1 truncate">
                {TX_LABELS[t.type] ?? t.type}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-md shrink-0"
                style={{ background: bg, color }}>
                {t.count}
              </span>
              <span className="text-xs font-black w-8 text-right shrink-0" style={{ color }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FinanceCashAnalyticsPage() {
  // ── Finance access guard ───────────────────────────────────────────────────
  const { isAdmin: _fAdmin, can } = useAuth();
  if (!_fAdmin && !can("finance.cash_analytics")) {
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

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["/api/cash-registers/analytics"],
    queryFn: () => apiFetch("/api/cash-registers/analytics"),
    refetchInterval: 120000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground" dir="rtl">
      <RefreshCw className="w-5 h-5 animate-spin"/> جارٍ تحميل التحليلات...
    </div>
  );
  if (!data) return null;

  const { currentMonth, lastMonth, changes, monthlyChart, typeBreakdown, registerComparison, topTransactions } = data;

  const creditBreakdown = typeBreakdown.filter(t => CREDIT_TYPES.includes(t.type));
  const debitBreakdown  = typeBreakdown.filter(t => !CREDIT_TYPES.includes(t.type));

  // كمّل الـ 6 شهور الفاضية بأصفار عشان الـ chart يظهر صح دايماً
  const chartData = (() => {
    const now = new Date();
    const months: { month: string; label: string; in: number; out: number; net: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const found = monthlyChart.find((r: any) => r.month === key);
      months.push({
        month: key,
        label: MONTH_NAMES[String(d.getMonth() + 1).padStart(2, "0")] ?? key,
        in:  found ? Number(found.in)  : 0,
        out: found ? Number(found.out) : 0,
        net: found ? Number(found.net) : 0,
      });
    }
    return months;
  })();

  const maxReg = registerComparison.reduce((m, r) => r.txCount > (m?.txCount??0) ? r : m, registerComparison[0]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-500"/> تحليلات الخزنة
        </h1>
        <p className="text-sm text-muted-foreground">ملخص مالي مقارن — الشهر الحالي vs السابق</p>
      </div>

      {/* KPI Cards */}
      {can("finance_cash_analytics.kpi_cards") && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="إجمالي الدخل" value={currentMonth.totalIn}  sub={`الشهر السابق: ${fmtFull(lastMonth.totalIn)}`}  pct={changes.inPct}  color="emerald"/>
        <StatCard label="إجمالي الخروج" value={currentMonth.totalOut} sub={`الشهر السابق: ${fmtFull(lastMonth.totalOut)}`} pct={changes.outPct} color="rose"/>
        <StatCard label="الصافي"         value={currentMonth.net}      sub={`الشهر السابق: ${fmtFull(lastMonth.net)}`}      pct={changes.netPct} color={currentMonth.net>=0?"emerald":"rose"}/>
        <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
          <p className="text-xs text-muted-foreground">عدد الحركات</p>
          <p className="text-2xl font-black text-sky-600">{currentMonth.txCount.toLocaleString("ar-EG")}</p>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">السابق: {lastMonth.txCount}</p>
            <PctBadge pct={lastMonth.txCount===0?null:Math.round(((currentMonth.txCount-lastMonth.txCount)/lastMonth.txCount)*100)}/>
          </div>
        </div>
      </div>
      )}

      {/* Chart شهري — Glass Style */}
      {can("finance_cash_analytics.monthly_chart") && (
      <div
        className="rounded-[26px] p-4 sm:p-5"
        dir="rtl"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
        }}
      >
        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-4">
          {[
            {
              label: "إجمالي الدخل",
              value: chartData.length > 0 ? fmtFull(chartData.reduce((s,r)=>s+r.in,0)) : "0 ج.م",
              color: "#FFD54F",
              glow: "rgba(255,213,79,0.32)",
              background: "linear-gradient(135deg, rgba(255,213,79,0.42) 0%, rgba(255,213,79,0.16) 52%, rgba(255,255,255,0.08) 100%)",
            },
            {
              label: "إجمالي المصروفات",
              value: chartData.length > 0 ? fmtFull(chartData.reduce((s,r)=>s+r.out,0)) : "0 ج.م",
              color: "#f43f5e",
              glow: "rgba(244,63,94,0.28)",
              background: "linear-gradient(135deg, rgba(244,63,94,0.40) 0%, rgba(244,63,94,0.16) 52%, rgba(255,255,255,0.08) 100%)",
            },
            {
              label: "صافي التدفق",
              value: chartData.length > 0 ? fmtFull(chartData.reduce((s,r)=>s+(r.in-r.out),0)) : "0 ج.م",
              color: "#26A69A",
              glow: "rgba(38,166,154,0.28)",
              background: "linear-gradient(135deg, rgba(38,166,154,0.44) 0%, rgba(38,166,154,0.18) 52%, rgba(255,255,255,0.08) 100%)",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-[18px] px-4 py-3.5 text-center"
              style={{
                background: card.background,
                border: `1px solid ${card.glow}`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 24px ${card.glow}`,
                backdropFilter: "blur(12px)",
              }}
            >
              <div
                className="absolute inset-x-6 top-0 h-px opacity-80"
                style={{ background: `linear-gradient(90deg, transparent, ${card.color}, transparent)` }}
              />
              <p className="text-[11px] font-bold tracking-tight text-foreground/80">{card.label}</p>
              <p className="mt-1 truncate text-lg font-black sm:text-xl" style={{ color: card.color, textShadow: `0 0 14px ${card.color}88` }}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Chart Area */}
        {chartData.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-[22px] border border-border" style={{ background: "hsl(var(--muted)/0.3)" }}>
            <span className="text-4xl opacity-20">📊</span>
            <p className="text-xs text-muted-foreground">لا توجد بيانات كافية</p>
          </div>
        ) : (
          <div
            className="rounded-[22px] px-2 py-3 sm:px-3"
            style={{ background: "hsl(var(--muted)/0.3)", border: "1px solid hsl(var(--border))" }}
          >
            <div className="mb-3 px-2 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-foreground/80">التدفق المالي — آخر 6 شهور</p>
                <p className="text-[10px] text-muted-foreground">مقارنة الدخل بالمصروفات شهرياً</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:"#FFD54F"}}/>دخل
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-400"/>مصروفات
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{top:12,right:12,left:-18,bottom:0}}>
                <defs>
                  <linearGradient id="cashGradIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FFD54F" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#FFD54F" stopOpacity={0.03}/>
                  </linearGradient>
                  <linearGradient id="cashGradOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.45}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.03}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false}/>
                <XAxis
                  dataKey="label"
                  tick={{fontSize:12, fill:"hsl(var(--muted-foreground))", fontWeight:600}}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{fontSize:10, fill:"hsl(var(--muted-foreground))"}}
                  tickFormatter={v => v === 0 ? "0" : fmt(v)}
                  axisLine={false} tickLine={false}
                  tickCount={5}
                />
                <Tooltip
                  contentStyle={{
                    background:"hsl(var(--card))",
                    border:"1px solid rgba(255,213,79,0.4)",
                    borderRadius:"12px",
                    fontSize:"12px",
                    direction:"rtl",
                  }}
                  formatter={(v:any, name:any) => [fmtFull(Number(v)), name==="in"?"💰 دخل":"💸 مصروفات"]}
                  labelFormatter={v=>`📅 ${v}`}
                />
                <Area
                  type="monotone" dataKey="in" stroke="#FFD54F" strokeWidth={2.5}
                  fill="url(#cashGradIn)"
                  dot={{r:4, fill:"#FFD54F", strokeWidth:2, stroke:"hsl(var(--background))"}}
                  activeDot={{r:6, fill:"#FFD54F", strokeWidth:2, stroke:"hsl(var(--background))", style:{filter:"drop-shadow(0 0 8px #FFD54F99)"}}}
                  name="in"
                />
                <Area
                  type="monotone" dataKey="out" stroke="#f43f5e" strokeWidth={2}
                  fill="url(#cashGradOut)"
                  dot={{r:4, fill:"#f43f5e", strokeWidth:2, stroke:"hsl(var(--background))"}}
                  activeDot={{r:6, fill:"#f43f5e", strokeWidth:2, stroke:"hsl(var(--background))", style:{filter:"drop-shadow(0 0 8px #f43f5e99)"}}}
                  name="out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      )}

      {/* توزيع + مقارنة الخزن */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Donut Chart توزيع نوع الحركة — احترافي */}
        {can("finance_cash_analytics.type_breakdown") && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-bold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-500"/> توزيع الحركات (الشهر الحالي)
          </p>
          {typeBreakdown.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">لا توجد حركات هذا الشهر</div>
          ) : (
            <TxDonut data={typeBreakdown} />
          )}
        </div>
        )}

        {/* مقارنة الخزن */}
        {can("finance_cash_analytics.register_comparison") && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-bold mb-3 flex items-center gap-2"><Wallet className="w-4 h-4 text-sky-500"/> مقارنة الخزن (الشهر الحالي)</p>
          {registerComparison.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">لا توجد خزن</div>
          ) : (
            <div className="space-y-3">
              {registerComparison.sort((a,b)=>b.txCount-a.txCount).map(r => {
                const maxTx = Math.max(...registerComparison.map(x=>x.txCount), 1);
                const pctBar = Math.round((r.txCount/maxTx)*100);
                return (
                  <div key={r.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        {r.type==="main"?<Star className="w-3 h-3 text-yellow-500"/>:<Building2 className="w-3 h-3 text-blue-500"/>}
                        {r.name}
                        {r.id===maxReg?.id && <span className="bg-emerald-500/10 text-emerald-600 text-[10px] px-1 rounded">الأكثر نشاطاً</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.txCount} حركة</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full transition-all" style={{width:`${pctBar}%`}}/>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span className="text-emerald-600">+{fmt(r.monthlyIn)}</span>
                      <span className="text-rose-600">-{fmt(r.monthlyOut)}</span>
                      <span className="font-medium">رصيد: {fmt(r.balance)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {/* أكبر حركات الشهر */}
      {can("finance_cash_analytics.top_transactions") && (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <p className="text-sm font-bold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-amber-500"/> أكبر 5 حركات هذا الشهر</p>
        </div>
        {topTransactions.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">لا توجد حركات هذا الشهر</div>
        ) : (
          <div className="divide-y divide-border">
            {topTransactions.map((tx:any, i:number) => {
              const isCredit = CREDIT_TYPES.includes(tx.type);
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">{i+1}</span>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isCredit?"bg-emerald-500/10":"bg-rose-500/10"}`}>
                    {isCredit?<ArrowUpCircle className="w-4 h-4 text-emerald-500"/>:<ArrowDownCircle className="w-4 h-4 text-rose-500"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{TX_LABELS[tx.type]??tx.type}</p>
                    {tx.description && <p className="text-xs text-muted-foreground truncate">{tx.description}</p>}
                    <p className="text-xs text-muted-foreground">{new Date(tx.transactionDate).toLocaleDateString("ar-EG")}</p>
                  </div>
                  <p className={`text-sm font-black shrink-0 ${isCredit?"text-emerald-600":"text-rose-600"}`}>
                    {isCredit?"+":"-"}{fmtFull(parseFloat(tx.amount))}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

    </div>
  );
}
