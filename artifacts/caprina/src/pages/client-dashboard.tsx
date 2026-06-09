import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, Package, CheckCircle2, XCircle, Clock,
  Wallet, Receipt, BarChart3, Search, Calendar,
  Truck, ArrowUpRight, DollarSign, RotateCcw,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fc = (n: number | string) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n));
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

// ─── Financial KPI Card (صف 1 — بالألوان المميزة) ────────────────────────────
function FinCard({
  label, value, icon, borderColor, iconBg, iconColor,
}: {
  label: string; value: string; icon: React.ReactNode;
  borderColor: string; iconBg: string; iconColor: string;
}) {
  return (
    <div className={`bg-card rounded-2xl border-r-4 ${borderColor} shadow-sm p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
        <p className={`text-2xl font-black ${iconColor}`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Status Card (صف 2 — رقم كبير مع border سفلي) ────────────────────────────
function StatCard({
  label, count, icon, textColor, borderColor,
}: {
  label: string; count: number; icon: React.ReactNode;
  textColor: string; borderColor: string;
}) {
  return (
    <div className={`bg-card rounded-2xl border-b-4 ${borderColor} shadow-sm p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold ${textColor}`}>{label}</span>
        <span className={textColor}>{icon}</span>
      </div>
      <p className={`text-4xl font-black ${textColor}`}>{fn(count)}</p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ClientDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("today");

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ["finance-sale-orders-all"],
    queryFn: () => apiFetch<any[]>("/finance/sale-orders"),
    staleTime: 30_000,
  });

  const { data: shipments = [] } = useQuery<any[]>({
    queryKey: ["shipping-orders"],
    queryFn: () => apiFetch<any[]>("/shipping/orders").catch(() => []),
    staleTime: 30_000,
  });

  // ── Date filter ───────────────────────────────────────────────────────────
  const now = new Date();
  const filteredByDate = useMemo(() => {
    if (dateFilter === "all") return orders;
    return orders.filter(o => {
      const d = new Date(o.createdAt ?? o.date ?? "");
      if (dateFilter === "today") return d.toDateString() === now.toDateString();
      if (dateFilter === "week") return (now.getTime() - d.getTime()) <= 7 * 86400000;
      if (dateFilter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return true;
    });
  }, [orders, dateFilter]);

  // ── KPIs صف 1 (مالي) ─────────────────────────────────────────────────────
  const totalCOD    = filteredByDate.reduce((s, o) => s + parseFloat(o.totalAmount   ?? "0"), 0);
  const totalPaid   = filteredByDate.reduce((s, o) => s + parseFloat(o.paidAmount    ?? "0"), 0);
  const agentComm   = filteredByDate.reduce((s, o) => s + parseFloat(o.agentCommission ?? o.commission ?? "0"), 0);
  const netProfit   = Math.max(0, totalPaid - agentComm);

  // ── KPIs صف 2 (حالات) ────────────────────────────────────────────────────
  const totalShipments  = filteredByDate.length;
  const underDelivery   = filteredByDate.filter(o => o.status === "shipped" || o.status === "in_transit" || o.status === "processing").length;
  const delivered       = filteredByDate.filter(o => o.status === "delivered" || o.paymentStatus === "paid").length;
  const returned        = filteredByDate.filter(o => o.status === "returned" || o.status === "cancelled").length;

  // ── Chart ─────────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[format(d, "MM/dd")] = 0;
    }
    orders.forEach(o => {
      try {
        const key = format(new Date(o.createdAt ?? ""), "MM/dd");
        if (key in days) days[key] += parseFloat(o.totalAmount ?? "0");
      } catch {}
    });
    return Object.entries(days).map(([date, value]) => ({ date, value }));
  }, [orders]);

  // ── Table ─────────────────────────────────────────────────────────────────
  const tabFiltered = useMemo(() => {
    let list = filteredByDate;
    if (tab === "paid")    list = list.filter(o => o.paymentStatus === "paid");
    if (tab === "partial") list = list.filter(o => o.paymentStatus === "partial");
    if (tab === "unpaid")  list = list.filter(o => !o.paymentStatus || o.paymentStatus === "unpaid");
    if (search.trim()) {
      const q = search.trim();
      list = list.filter(o =>
        (o.clientName ?? "").includes(q) ||
        (o.soNumber   ?? "").includes(q) ||
        (o.invoiceNumber ?? "").includes(q)
      );
    }
    return list;
  }, [filteredByDate, tab, search]);

  const paidCount    = filteredByDate.filter(o => o.paymentStatus === "paid").length;
  const partialCount = filteredByDate.filter(o => o.paymentStatus === "partial").length;
  const unpaidCount  = filteredByDate.filter(o => !o.paymentStatus || o.paymentStatus === "unpaid").length;

  const today = format(now, "EEEE, dd MMM yyyy", { locale: ar });

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-6" dir="rtl">

      {/* ── Header ── */}
      <div className="bg-card rounded-2xl border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* User info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center shrink-0">
            <span className="text-lg">👤</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{user?.role ?? "Admin"}</p>
            <p className="font-black text-sm">{user?.displayName ?? "المدير"}</p>
            <p className="text-[10px] text-muted-foreground">إدارة النظام</p>
          </div>
        </div>

        {/* Date + filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>{today}</span>
          </div>
          <div className="flex gap-1">
            {([
              { key: "today", label: "اليوم" },
              { key: "week",  label: "الأسبوع" },
              { key: "month", label: "الشهر" },
              { key: "all",   label: "الكل" },
            ] as { key: typeof dateFilter; label: string }[]).map(f => (
              <button key={f.key} onClick={() => setDateFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  dateFilter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Welcome ── */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">👋</span>
        <div>
          <h1 className="text-2xl font-black">أهلاً بك في STARK</h1>
          <p className="text-sm text-muted-foreground">
            جاري العمل بصلاحيات: {user?.role ?? "Admin"} ({user?.displayName ?? ""})
          </p>
        </div>
      </div>


      {/* ── Row 1: 4 Financial KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <FinCard
          label="إجمالي التحصيلات (COD)"
          value={fc(totalCOD)}
          icon={<Wallet className="w-6 h-6" />}
          borderColor="border-r-violet-500"
          iconBg="bg-violet-100 dark:bg-violet-900/30"
          iconColor="text-violet-600 dark:text-violet-400"
        />
        <FinCard
          label="إجمالي عمولات الشحن"
          value={fc(totalPaid)}
          icon={<Truck className="w-6 h-6" />}
          borderColor="border-r-emerald-500"
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <FinCard
          label="عمولات المناديب"
          value={fc(agentComm)}
          icon={<DollarSign className="w-6 h-6" />}
          borderColor="border-r-red-500"
          iconBg="bg-red-100 dark:bg-red-900/30"
          iconColor="text-red-500 dark:text-red-400"
        />
        <FinCard
          label="صافي أرباح الشحن"
          value={fc(netProfit)}
          icon={<TrendingUp className="w-6 h-6" />}
          borderColor="border-r-blue-500"
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
        />
      </div>

      {/* ── Row 2: 4 Status Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="إجمالي الشحنات"
          count={totalShipments}
          icon={<Package className="w-5 h-5" />}
          textColor="text-blue-600 dark:text-blue-400"
          borderColor="border-b-blue-500"
        />
        <StatCard
          label="تحت التوصيل"
          count={underDelivery}
          icon={<Clock className="w-5 h-5" />}
          textColor="text-amber-500 dark:text-amber-400"
          borderColor="border-b-amber-500"
        />
        <StatCard
          label="تم الاستلام ✅"
          count={delivered}
          icon={<CheckCircle2 className="w-5 h-5" />}
          textColor="text-emerald-600 dark:text-emerald-400"
          borderColor="border-b-emerald-500"
        />
        <StatCard
          label="إجمالي المرتجعات ✗"
          count={returned}
          icon={<RotateCcw className="w-5 h-5" />}
          textColor="text-red-500 dark:text-red-400"
          borderColor="border-b-red-500"
        />
      </div>

      {/* ── Chart ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-black text-sm">مبيعات آخر 7 أيام</h2>
            <p className="text-2xl font-black text-primary mt-1">{fc(totalCOD)}</p>
          </div>
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
              formatter={(v: any) => [fc(v), "المبيعات"]} />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5}
              fill="url(#dashGrad)" dot={{ fill: "hsl(var(--primary))", r: 3 }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>


      {/* ── Table: سجل حركة الشحنات ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-3">
          <h2 className="font-black text-sm">سجل حركة الشحنات (التفصيلي)</h2>
          <div className="relative">
            <Search className="absolute right-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث سريع في النتائج..."
              className="h-8 text-xs bg-background border border-border rounded-lg pr-8 pl-3 w-48 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/5 overflow-x-auto">
          {([
            { key: "all",     label: "الكل",         count: filteredByDate.length },
            { key: "paid",    label: "تم التحصيل",  count: paidCount },
            { key: "partial", label: "تحت التحصيل", count: partialCount },
            { key: "unpaid",  label: "غير مسدد",    count: unpaidCount },
          ] as { key: typeof tab; label: string; count: number }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                tab === t.key ? "bg-white/20" : "bg-muted/30"
              }`}>{fn(t.count)}</span>
            </button>
          ))}
        </div>

        {/* Table head */}
        <div className="grid grid-cols-6 gap-2 px-4 py-2 text-[10px] font-bold text-muted-foreground border-b border-border bg-muted/5">
          <span>البوليصة</span>
          <span className="col-span-2">المستلم</span>
          <span>التحصيل</span>
          <span>الحالة الحالية</span>
          <span>تنبيه</span>
        </div>

        {/* Rows */}
        <div>
          {tabFiltered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-20" />
              لا توجد نتائج
            </div>
          ) : tabFiltered.slice(0, 20).map(o => {
            const remaining = Math.max(0, parseFloat(o.totalAmount ?? "0") - parseFloat(o.paidAmount ?? "0"));
            const paid    = o.paymentStatus === "paid";
            const partial = o.paymentStatus === "partial";
            return (
              <div key={o.id}
                className="grid grid-cols-6 gap-2 px-4 py-3 border-b border-border/40 hover:bg-muted/10 transition-colors items-center cursor-pointer"
                onClick={() => navigate(`/finance/sales/${o.id}`)}>

                {/* البوليصة */}
                <span className="text-xs font-bold text-primary font-mono">
                  {o.soNumber ?? o.invoiceNumber ?? `#${o.id}`}
                </span>

                {/* المستلم */}
                <div className="col-span-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center shrink-0 text-[11px] font-bold">
                    {(o.clientName ?? "؟").slice(0, 1)}
                  </div>
                  <span className="text-xs font-bold truncate">{o.clientName ?? "—"}</span>
                </div>

                {/* التحصيل */}
                <span className="text-xs font-bold">{fc(o.totalAmount)}</span>

                {/* الحالة */}
                <div>
                  {paid ? (
                    <Badge variant="outline" className="text-[9px] border-emerald-600 bg-emerald-900/20 text-emerald-400">✓ مدفوع</Badge>
                  ) : partial ? (
                    <Badge variant="outline" className="text-[9px] border-amber-600 bg-amber-900/20 text-amber-400">جزئي</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] border-red-600 bg-red-900/20 text-red-400">غير مسدد</Badge>
                  )}
                </div>

                {/* تنبيه */}
                <span className={`text-[10px] font-bold ${remaining > 0 ? "text-red-500" : "text-emerald-400"}`}>
                  {remaining > 0 ? `${fc(remaining)} ✗` : "مسدد ✓"}
                </span>
              </div>
            );
          })}

          {tabFiltered.length > 20 && (
            <div className="p-4 text-center border-t border-border">
              <button onClick={() => navigate("/finance/sales")}
                className="text-xs text-primary font-bold hover:underline flex items-center gap-1 mx-auto">
                عرض جميع الأوامر ({fn(tabFiltered.length)}) <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
