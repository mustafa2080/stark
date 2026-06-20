import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area,
  PieChart, Pie, Cell, Sector,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, ShoppingCart, Receipt,
  DollarSign, ArrowRight, Target, Award,
  ChevronLeft, BarChart2, Percent,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: string | number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n));
const fmtNum = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

// ── Payment Donut ─────────────────────────────────────────────────────────────
const PAY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  paid:    { label: "مدفوع",      color: "#10b981", bg: "#10b98118" },
  partial: { label: "جزئي",       color: "#f59e0b", bg: "#f59e0b18" },
  unpaid:  { label: "غير مدفوع", color: "#ef4444", bg: "#ef444418" },
};

function PayActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const cfg = PAY_CFG[payload.key] ?? { label: payload.name, color: fill, bg: "" };
  return (
    <g tabIndex={-1} style={{ outline: "none" }}>
      {/* outer soft glow */}
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 7} outerRadius={outerRadius + 13}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.08} cornerRadius={8} />
      {/* inner glow ring */}
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 2} outerRadius={outerRadius + 8}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.22} cornerRadius={7} />
      {/* main expanded segment */}
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 5} outerRadius={outerRadius + 9}
        startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={7}
        tabIndex={-1} style={{ outline: "none", filter: `drop-shadow(0 0 10px ${fill}99)` }} />
      {/* center: count */}
      <text x={cx} y={cy - 14} textAnchor="middle" fill="hsl(var(--foreground))"
        fontSize={28} fontWeight={900} fontFamily="inherit"
        style={{ pointerEvents: "none", userSelect: "none" }}>{value}</text>
      {/* center: label */}
      <text x={cx} y={cy + 8} textAnchor="middle" fill="hsl(var(--muted-foreground))"
        fontSize={11} fontFamily="inherit"
        style={{ pointerEvents: "none", userSelect: "none" }}>{cfg.label}</text>
      {/* center: percent */}
      <text x={cx} y={cy + 27} textAnchor="middle" fill={fill}
        fontSize={15} fontWeight={900} fontFamily="inherit"
        style={{ pointerEvents: "none", userSelect: "none" }}>{`${(percent * 100).toFixed(0)}%`}</text>
    </g>
  );
}

function PayPctLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.08) return null;
  const R = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * R);
  const y = cy + r * Math.sin(-midAngle * R);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={12} fontWeight={800}
      style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function PaymentDonut({ data, total }: {
  data: { name: string; value: number; color: string; key: string }[];
  total: number;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const isActive = activeIdx !== null;

  return (
    <div className="space-y-4">
      {/* Donut */}
      <div className="relative" style={{ height: 220 }}>
        {/* center total — fade on hover */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10"
          style={{ opacity: isActive ? 0 : 1, transition: "opacity 200ms ease" }}>
          <p className="text-4xl font-black text-foreground leading-none">{total}</p>
          <p className="text-xs text-muted-foreground mt-1">إجمالي الشحنات</p>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <PieChart tabIndex={-1} style={{ outline: "none" }}>
            <Pie
              data={data} cx="50%" cy="50%"
              innerRadius="50%" outerRadius="76%"
              paddingAngle={3} dataKey="value" stroke="none"
              cornerRadius={6} startAngle={90} endAngle={-270}
              labelLine={false}
              label={!isActive ? <PayPctLabel /> : undefined}
              activeIndex={activeIdx ?? undefined}
              activeShape={PayActiveShape}
              animationBegin={0} animationDuration={700} animationEasing="ease-out"
              onMouseEnter={(_, i) => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              style={{ outline: "none", cursor: "default" }}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color}
                  opacity={activeIdx !== null && activeIdx !== i ? 0.35 : 1} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="space-y-1.5">
        {data.map((d, i) => {
          const cfg = PAY_CFG[d.key] ?? { label: d.name, color: d.color, bg: d.color + "18" };
          const isHl  = activeIdx === i;
          const isDim = activeIdx !== null && !isHl;
          const pct   = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={d.key}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5"
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              style={{
                background: isHl ? cfg.bg : "transparent",
                border: isHl ? `1px solid ${cfg.color}44` : "1px solid transparent",
                opacity: isDim ? 0.38 : 1,
                transition: "all 200ms ease",
                cursor: "default",
              }}>
              <span className="w-3 h-3 rounded-full shrink-0"
                style={{ background: cfg.color, boxShadow: isHl ? `0 0 7px ${cfg.color}` : "none", transition: "box-shadow 200ms ease" }} />
              <span className="text-xs font-semibold text-foreground flex-1">{cfg.label}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-md shrink-0"
                style={{ background: cfg.bg, color: cfg.color }}>{d.value}</span>
              <span className="text-xs font-black w-9 text-right shrink-0"
                style={{ color: cfg.color }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SaleOrder = {
  id: number; soNumber: string; clientName: string; status: string;
  paymentStatus: string; totalAmount: string; paidAmount: string;
  discountAmount: string; createdAt: string; deliveredAt: string | null;
};
type Client = { id: number; name: string; totalSales: string; totalPaid: string; };

const PERIOD_OPTIONS = [
  { key: "7",     label: "آخر 7 أيام" },
  { key: "30",    label: "آخر 30 يوم" },
  { key: "month", label: "هذا الشهر" },
  { key: "all",   label: "الكل" },
];

export default function SalesReportPage() {
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState("30");

  // ── Finance access guard ───────────────────────────────────────────────────
  const { isAdmin: _fAdmin, can: _fCan } = useAuth();
  if (!_fAdmin && !_fCan("finance.reports")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
        <p className="text-muted-foreground text-sm max-w-xs">ليس لديك صلاحية لعرض تقارير الأرباح والخسائر. تواصل مع المدير.</p>
      </div>
    );
  }

  const { data: orders = [], isLoading: loadingOrders } = useQuery<SaleOrder[]>({
    queryKey: ["finance-sale-orders-report"],
    queryFn: () => apiFetch<SaleOrder[]>("/finance/sale-orders"),
    staleTime: 60_000,
  });
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["finance-clients-report"],
    queryFn: () => apiFetch<Client[]>("/finance/clients"),
    staleTime: 60_000,
  });

  // ── filter by period ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = new Date();
    if (period === "all") return orders;
    if (period === "month") {
      const start = startOfMonth(now), end = endOfMonth(now);
      return orders.filter(o => {
        try { return isWithinInterval(parseISO(o.createdAt), { start, end }); } catch { return false; }
      });
    }
    const days = parseInt(period);
    const cutoff = subDays(now, days);
    return orders.filter(o => {
      try { return parseISO(o.createdAt) >= cutoff; } catch { return false; }
    });
  }, [orders, period]);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalRevenue   = filtered.reduce((s, o) => s + parseFloat(o.totalAmount), 0);
  const totalPaid      = filtered.reduce((s, o) => s + (o.paymentStatus === "paid" ? parseFloat(o.totalAmount) : parseFloat(o.paidAmount ?? "0")), 0);
  const totalUnpaid    = Math.max(0, totalRevenue - totalPaid);
  const totalDiscount  = filtered.reduce((s, o) => s + parseFloat(o.discountAmount ?? "0"), 0);
  const totalOrders    = filtered.length;
  const delivered      = filtered.filter(o => o.status === "delivered").length;
  const deliveryRate   = totalOrders > 0 ? Math.round((delivered / totalOrders) * 100) : 0;
  const paidCount      = filtered.filter(o => o.paymentStatus === "paid").length;
  const collectRate    = totalOrders > 0 ? Math.round((paidCount / totalOrders) * 100) : 0;
  const avgOrderValue  = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // ── daily chart ──────────────────────────────────────────────────────────
  const dailyData = useMemo(() => {
    const days = period === "7" ? 7 : period === "30" ? 30 : period === "month" ? 30 : 30;
    const map: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "MM/dd");
      map[d] = 0;
    }
    filtered.forEach(o => {
      try {
        const d = format(parseISO(o.createdAt), "MM/dd");
        if (d in map) map[d] += parseFloat(o.totalAmount);
      } catch {}
    });
    return Object.entries(map).map(([date, value]) => ({ date, value }));
  }, [filtered, period]);

  // ── payment status donut ─────────────────────────────────────────────────
  const paidOrders    = filtered.filter(o => o.paymentStatus === "paid").length;
  const partialOrders = filtered.filter(o => o.paymentStatus === "partial").length;
  const unpaidOrders  = filtered.filter(o => o.paymentStatus === "unpaid").length;
  const donutData = [
    { name: "مدفوع",     key: "paid",    value: paidOrders,    color: "#10b981" },
    { name: "جزئي",      key: "partial", value: partialOrders, color: "#f59e0b" },
    { name: "غير مدفوع", key: "unpaid",  value: unpaidOrders,  color: "#ef4444" },
  ].filter(d => d.value > 0);

  // ── top clients ──────────────────────────────────────────────────────────
  const clientMap: Record<string, number> = {};
  filtered.forEach(o => {
    clientMap[o.clientName] = (clientMap[o.clientName] ?? 0) + parseFloat(o.totalAmount);
  });
  const topClients = Object.entries(clientMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, total]) => ({ name, total }));
  const maxClientVal = topClients[0]?.total ?? 1;

  // ── order status bar ─────────────────────────────────────────────────────
  const statusCounts = [
    { label: "مسودة",        key: "draft",       color: "#6b7280" },
    { label: "قيد التجهيز",  key: "processing",  color: "#f59e0b" },
    { label: "تم التسليم",   key: "delivered",   color: "#10b981" },
    { label: "ملغي",         key: "cancelled",   color: "#ef4444" },
  ].map(s => ({ ...s, count: filtered.filter(o => o.status === s.key).length }));

  if (loadingOrders) return (
    <div className="flex items-center justify-center min-h-[40vh]" dir="rtl">
      <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/finance/clients")}>
            <ArrowRight className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">تقرير الشحنات</h1>
            <p className="text-muted-foreground text-sm mt-0.5">تحليل شامل لأداء الشحنات والتحصيل</p>
          </div>
        </div>
        {/* Period Selector */}
        <div className="flex items-center gap-1 bg-muted/20 rounded-xl p-1">
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setPeriod(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                period === opt.key ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* ── 6 KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "إجمالي الشحنات",   value: fmtNum(totalOrders), icon: <ShoppingCart className="w-5 h-5" />, color: "text-primary",      bg: "bg-primary/10" },
          { label: "إجمالي الإيرادات", value: fmt(totalRevenue),   icon: <DollarSign className="w-5 h-5" />,  color: "text-foreground",    bg: "bg-muted/30" },
          { label: "المحصَّل",          value: fmt(totalPaid),      icon: <TrendingUp className="w-5 h-5" />,  color: "text-emerald-400",   bg: "bg-emerald-900/20" },
          { label: "المتبقي",           value: fmt(totalUnpaid),    icon: <TrendingDown className="w-5 h-5" />,color: "text-red-400",       bg: "bg-red-900/20" },
          { label: "نسبة التسليم",      value: `${deliveryRate}%`,  icon: <Target className="w-5 h-5" />,      color: "text-amber-400",     bg: "bg-amber-900/20" },
          { label: "متوسط قيمة الشحنة", value: fmt(avgOrderValue),  icon: <BarChart2 className="w-5 h-5" />,   color: "text-blue-400",      bg: "bg-blue-900/20" },
        ].map((kpi, i) => (
          <Card key={i} className="border-border bg-card p-4">
            <div className={`w-9 h-9 rounded-xl ${kpi.bg} flex items-center justify-center mb-3 ${kpi.color}`}>
              {kpi.icon}
            </div>
            <p className={`text-xl font-black ${kpi.color}`}>{kpi.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{kpi.label}</p>
          </Card>
        ))}
      </div>

      {/* ── Revenue Chart + Payment Pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Area chart */}
        <Card className="lg:col-span-2 border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm">الشحنات اليومية</h2>
            <span className="text-[10px] text-muted-foreground">{PERIOD_OPTIONS.find(o=>o.key===period)?.label}</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="rptGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(43,74%,50%)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(43,74%,50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:8, fontSize:11 }} formatter={(v:any) => [fmt(v), "الإيرادات"]} />
              <Area type="monotone" dataKey="value" stroke="hsl(43,74%,50%)" strokeWidth={2} fill="url(#rptGrad)" dot={false} activeDot={{ r:4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Payment Donut — pro animated */}
        <Card className="border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm">حالة الدفع</h2>
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              مباشر
            </span>
          </div>
          {donutData.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">لا توجد بيانات</div>
          ) : (
            <PaymentDonut data={donutData} total={totalOrders} />
          )}
        </Card>
      </div>

      {/* ── Top Clients + Order Status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top Clients Bar */}
        <Card className="border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm">أفضل العملاء</h2>
            <Award className="w-4 h-4 text-primary" />
          </div>
          {topClients.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">لا توجد بيانات</div>
          ) : (
            <div className="space-y-3">
              {topClients.map((c, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                        i===0?"bg-primary text-primary-foreground":i===1?"bg-muted/40 text-foreground":"bg-muted/20 text-muted-foreground"
                      }`}>{i+1}</div>
                      <span className="text-xs font-bold truncate max-w-[140px]">{c.name}</span>
                    </div>
                    <span className="text-xs font-black text-primary">{fmt(c.total)}</span>
                  </div>
                  <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${Math.round((c.total / maxClientVal) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Order Status Bars */}
        <Card className="border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm">حالة الشحنات</h2>
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-4">
            {statusCounts.map((s, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">{s.count}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {totalOrders > 0 ? `${Math.round((s.count/totalOrders)*100)}%` : "0%"}
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: totalOrders > 0 ? `${Math.round((s.count/totalOrders)*100)}%` : "0%", background: s.color }} />
                </div>
              </div>
            ))}
          </div>
          {/* Collection Rate Card */}
          <div className="mt-5 p-3 rounded-xl bg-muted/10 border border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">نسبة التحصيل</span>
            </div>
            <span className={`text-lg font-black ${collectRate >= 70 ? "text-emerald-400" : collectRate >= 40 ? "text-amber-400" : "text-red-400"}`}>
              {collectRate}%
            </span>
          </div>
        </Card>
      </div>

      {/* ── Recent Invoices Table ── */}
      <Card className="border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-sm">آخر الشحنات</h2>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-border"
            onClick={() => navigate("/finance/sales")}>
            عرض الكل <ChevronLeft className="w-3 h-3" />
          </Button>
        </div>
        <div className="grid grid-cols-5 gap-2 px-4 py-2 text-[10px] font-bold text-muted-foreground border-b border-border bg-muted/5">
          <span>رقم الشحنة</span><span className="col-span-2">العميل</span><span>الإجمالي</span><span>حالة الدفع</span>
        </div>
        <div>
          {filtered.slice(0, 8).map(o => {
            const paid = o.paymentStatus === "paid";
            const partial = o.paymentStatus === "partial";
            return (
              <div key={o.id} className="grid grid-cols-5 gap-2 px-4 py-3 border-b border-border/50 hover:bg-muted/10 transition-colors items-center cursor-pointer"
                onClick={() => navigate(`/finance/sales/${o.id}`)}>
                <span className="text-xs font-bold text-primary">{o.soNumber}</span>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-muted/30 flex items-center justify-center shrink-0">
                    <Users className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <span className="text-xs font-bold truncate">{o.clientName}</span>
                </div>
                <span className="text-xs font-bold">{fmt(o.totalAmount)}</span>
                <div>
                  {paid ? (
                    <Badge variant="outline" className="text-[9px] border-emerald-700 bg-emerald-900/20 text-emerald-400">مدفوع</Badge>
                  ) : partial ? (
                    <Badge variant="outline" className="text-[9px] border-amber-700 bg-amber-900/20 text-amber-400">جزئي</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] border-red-700 bg-red-900/20 text-red-400">غير مدفوع</Badge>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p>لا توجد شحنات في هذه الفترة</p>
            </div>
          )}
        </div>
      </Card>

      {/* ── Summary Footer ── */}
      {totalDiscount > 0 && (
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-900/20 flex items-center justify-center text-purple-400">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الخصومات الممنوحة</p>
              <p className="text-lg font-black text-purple-400">{fmt(totalDiscount)}</p>
            </div>
          </div>
        </Card>
      )}

    </div>
  );
}
