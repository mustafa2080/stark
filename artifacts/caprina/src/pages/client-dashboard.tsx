import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Users, TrendingUp, Wallet, AlertCircle, CheckCircle,
  Clock, XCircle, ShoppingCart, Search, ArrowUpRight,
  MapPin, Phone, Target, Receipt, BarChart3, Eye,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type Client = {
  id: number; name: string; phone: string | null; city: string | null;
  totalOrders: number; totalSales: string; totalPaid: string;
  creditLimit: string; isActive: boolean; createdAt: string; avatar: string | null;
  paymentTerms: string | null;
};
type SaleOrder = {
  id: number; soNumber: string; status: string; paymentStatus: string;
  totalAmount: string; paidAmount: string; clientName: string; createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fc = (n: number | string) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n));
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

// ─── Avatar ────────────────────────────────────────────────────────────────────
const COLORS = [
  ["#f59e0b","#78350f"],["#10b981","#064e3b"],["#3b82f6","#1e3a8a"],
  ["#8b5cf6","#4c1d95"],["#ef4444","#7f1d1d"],["#ec4899","#831843"],
  ["#06b6d4","#164e63"],["#f97316","#7c2d12"],
];
function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}
function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function Avatar({ avatar, name, size = "md" }: { avatar?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-7 h-7 text-[10px]" : size === "lg" ? "w-11 h-11 text-base" : "w-9 h-9 text-sm";
  if (avatar?.startsWith("data:"))
    return <img src={avatar} className={`${sz} rounded-full object-cover border border-border/50 shrink-0`} />;
  const [bg, fg] = avatarColor(name || "?");
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold shrink-0`} style={{ background: bg, color: fg }}>
      {name ? initials(name) : "؟"}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon, accentColor, borderColor,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; accentColor: string; borderColor: string;
}) {
  return (
    <div className={`bg-card rounded-2xl border-2 ${borderColor} p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">{label}</span>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accentColor}`}>
          {icon}
        </div>
      </div>
      <p className={`text-3xl font-black leading-none`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Status Card ──────────────────────────────────────────────────────────────
function StatusCard({
  label, count, icon, bg, text, border,
}: {
  label: string; count: number; icon: React.ReactNode; bg: string; text: string; border: string;
}) {
  return (
    <div className={`bg-card rounded-2xl border-2 ${border} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold ${text}`}>{label}</span>
        <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>{icon}</div>
      </div>
      <p className={`text-4xl font-black ${text}`}>{fn(count)}</p>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function ClientDashboard() {
  const { isAdmin, can } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "unpaid" | "partial" | "paid">("all");

  if (!isAdmin && !can("finance.view")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-3xl">🔒</div>
        <p className="font-bold text-lg">غير مصرح بالوصول</p>
      </div>
    );
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: clients = [], isLoading: loadingClients } = useQuery<Client[]>({
    queryKey: ["finance-clients"],
    queryFn: () => apiFetch<Client[]>("/finance/clients"),
    staleTime: 30_000,
  });

  const { data: orders = [] } = useQuery<SaleOrder[]>({
    queryKey: ["finance-sale-orders-all"],
    queryFn: () => apiFetch<SaleOrder[]>("/finance/sale-orders"),
    staleTime: 30_000,
  });

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalSales     = clients.reduce((s, c) => s + parseFloat(c.totalSales  ?? "0"), 0);
  const totalPaid      = clients.reduce((s, c) => s + parseFloat(c.totalPaid   ?? "0"), 0);
  const totalUnpaid    = Math.max(0, totalSales - totalPaid);
  const activeClients  = clients.filter(c => c.isActive).length;
  const newThisMonth   = clients.filter(c => {
    const d = new Date(c.createdAt), n = new Date();
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  }).length;

  // ── Status Counts ─────────────────────────────────────────────────────────
  const paidCount    = orders.filter(o => o.paymentStatus === "paid").length;
  const partialCount = orders.filter(o => o.paymentStatus === "partial").length;
  const unpaidCount  = orders.filter(o => o.paymentStatus === "unpaid" || !o.paymentStatus).length;
  const totalOrders  = orders.length;

  // ── Top Clients ───────────────────────────────────────────────────────────
  const topClients = useMemo(() =>
    [...clients].sort((a, b) => parseFloat(b.totalSales ?? "0") - parseFloat(a.totalSales ?? "0")).slice(0, 6),
    [clients]
  );

  // ── Chart: آخر 7 أيام ────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[format(d, "MM/dd")] = 0;
    }
    orders.forEach(o => {
      const key = format(new Date(o.createdAt), "MM/dd");
      if (key in days) days[key] += parseFloat(o.totalAmount ?? "0");
    });
    return Object.entries(days).map(([date, value]) => ({ date, value }));
  }, [orders]);

  // ── Table filter ──────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    let list = orders;
    if (tab === "paid")    list = orders.filter(o => o.paymentStatus === "paid");
    if (tab === "partial") list = orders.filter(o => o.paymentStatus === "partial");
    if (tab === "unpaid")  list = orders.filter(o => o.paymentStatus === "unpaid" || !o.paymentStatus);
    if (search) list = list.filter(o => o.clientName.includes(search) || o.soNumber.includes(search));
    return list;
  }, [orders, tab, search]);

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">داشبورد العملاء</h1>
          <p className="text-muted-foreground text-sm mt-0.5">نظرة شاملة على أداء العملاء والمبيعات</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/finance/clients")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted/20 transition-colors">
            <Users className="w-3.5 h-3.5" /> إدارة العملاء
          </button>
          <button onClick={() => navigate("/finance/sales/new")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">
            <ShoppingCart className="w-3.5 h-3.5" /> أمر بيع جديد
          </button>
        </div>
      </div>

      {/* ── Row 1: 4 KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="إجمالي العملاء" value={fn(clients.length)}
          sub={`+${newThisMonth} هذا الشهر • ${activeClients} نشط`}
          icon={<Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
          accentColor="bg-violet-100 dark:bg-violet-900/30"
          borderColor="border-violet-200 dark:border-violet-800/50" />

        <KpiCard label="إجمالي المبيعات" value={fc(totalSales)}
          sub={`${fn(totalOrders)} أمر بيع`}
          icon={<TrendingUp className="w-5 h-5 text-primary" />}
          accentColor="bg-primary/10"
          borderColor="border-primary/30" />

        <KpiCard label="إجمالي المحصّل" value={fc(totalPaid)}
          sub={`${Math.round(totalSales > 0 ? (totalPaid / totalSales) * 100 : 0)}% من الإجمالي`}
          icon={<Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          accentColor="bg-emerald-100 dark:bg-emerald-900/30"
          borderColor="border-emerald-300 dark:border-emerald-800/50" />

        <KpiCard label="إجمالي المتبقي" value={fc(totalUnpaid)}
          sub={`${fn(unpaidCount + partialCount)} أمر غير مسدد`}
          icon={<AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400" />}
          accentColor="bg-red-100 dark:bg-red-900/30"
          borderColor="border-red-300 dark:border-red-800/50" />
      </div>

      {/* ── Row 2: 4 Status Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard label="إجمالي الأوامر" count={totalOrders}
          icon={<Receipt className="w-4 h-4 text-blue-500" />}
          bg="bg-blue-100 dark:bg-blue-900/30" text="text-blue-600 dark:text-blue-400"
          border="border-blue-200 dark:border-blue-800/50" />

        <StatusCard label="تحت التحصيل" count={partialCount}
          icon={<Clock className="w-4 h-4 text-amber-500" />}
          bg="bg-amber-100 dark:bg-amber-900/30" text="text-amber-600 dark:text-amber-400"
          border="border-amber-200 dark:border-amber-800/50" />

        <StatusCard label="تم التحصيل" count={paidCount}
          icon={<CheckCircle className="w-4 h-4 text-emerald-500" />}
          bg="bg-emerald-100 dark:bg-emerald-900/30" text="text-emerald-600 dark:text-emerald-400"
          border="border-emerald-200 dark:border-emerald-800/50" />

        <StatusCard label="غير مسدد" count={unpaidCount}
          icon={<XCircle className="w-4 h-4 text-red-500" />}
          bg="bg-red-100 dark:bg-red-900/30" text="text-red-600 dark:text-red-400"
          border="border-red-200 dark:border-red-800/50" />
      </div>

      {/* ── Row 3: أفضل العملاء + الرسم البياني ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* أفضل العملاء */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-sm">أفضل العملاء مبيعاً</h2>
            <button onClick={() => navigate("/finance/all-clients")}
              className="text-[11px] text-primary font-bold flex items-center gap-1 hover:underline">
              عرض الكل <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {loadingClients ? (
              <p className="text-xs text-muted-foreground animate-pulse text-center py-4">جارٍ التحميل…</p>
            ) : topClients.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">لا يوجد بيانات</p>
            ) : topClients.map((c, i) => {
              const sales = parseFloat(c.totalSales ?? "0");
              const target = parseFloat(c.creditLimit ?? "0") || 1_000_000;
              const pct = Math.min((sales / target) * 100, 100);
              const barColor = pct >= 75 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-primary";
              return (
                <div key={c.id} className="flex items-center gap-3 cursor-pointer hover:bg-muted/10 rounded-xl px-2 py-1.5 transition-colors"
                  onClick={() => navigate(`/finance/clients/${c.id}`)}>
                  {/* ترتيب */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                    i === 0 ? "bg-amber-400 text-black" : i === 1 ? "bg-zinc-400 text-black" : i === 2 ? "bg-amber-700 text-white" : "bg-muted text-muted-foreground"
                  }`}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</div>
                  <Avatar avatar={c.avatar} name={c.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{c.name}</p>
                    <div className="h-1 bg-muted/30 rounded-full mt-1 overflow-hidden">
                      <div className={`h-1 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-black text-primary shrink-0">{fc(sales)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* الرسم البياني */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-1">
            <h2 className="font-black text-sm">مبيعات آخر 7 أيام</h2>
            <p className="text-2xl font-black text-primary mt-1">{fc(totalSales)}</p>
            <p className="text-[11px] text-muted-foreground mb-3">إجمالي المبيعات الكلية</p>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cliGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(43,74%,50%)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(43,74%,50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [fc(v), "المبيعات"]} />
              <Area type="monotone" dataKey="value" stroke="hsl(43,74%,50%)" strokeWidth={2.5}
                fill="url(#cliGrad)" dot={{ fill: "hsl(43,74%,50%)", r: 3 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Row 4: سجل حركة الأوامر ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-3">
          <h2 className="font-black text-sm">سجل حركة الأوامر (التفصيلي)</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute right-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="بحث سريع في النتائج..." className="h-8 text-xs bg-background pr-8 w-48"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/5 overflow-x-auto">
          {([
            { key: "all",     label: "الكل",         count: totalOrders },
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

        {/* Table header */}
        <div className="grid grid-cols-6 gap-2 px-4 py-2 text-[10px] font-bold text-muted-foreground border-b border-border bg-muted/5">
          <span>البوليصة</span>
          <span className="col-span-2">المستلم</span>
          <span>التحصيل</span>
          <span>الحالة الحالية</span>
          <span>تنبيه</span>
        </div>

        {/* Rows */}
        <div>
          {filteredOrders.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-20" />
              لا توجد نتائج
            </div>
          ) : filteredOrders.slice(0, 15).map(o => {
            const paid    = o.paymentStatus === "paid";
            const partial = o.paymentStatus === "partial";
            const unpaid  = !o.paymentStatus || o.paymentStatus === "unpaid";
            const remaining = Math.max(0, parseFloat(o.totalAmount ?? "0") - parseFloat(o.paidAmount ?? "0"));
            return (
              <div key={o.id} className="grid grid-cols-6 gap-2 px-4 py-3 border-b border-border/40 hover:bg-muted/10 transition-colors items-center cursor-pointer"
                onClick={() => navigate(`/finance/sales/${o.id}`)}>
                <span className="text-xs font-bold text-primary">{o.soNumber}</span>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center shrink-0">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-xs font-bold truncate">{o.clientName}</span>
                </div>
                <span className="text-xs font-bold">{fc(o.totalAmount)}</span>
                {/* حالة الدفع */}
                <div>
                  {paid ? (
                    <Badge variant="outline" className="text-[9px] border-emerald-600 bg-emerald-900/20 text-emerald-400">✓ مدفوع</Badge>
                  ) : partial ? (
                    <Badge variant="outline" className="text-[9px] border-amber-600 bg-amber-900/20 text-amber-400">جزئي</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] border-red-600 bg-red-900/20 text-red-400">غير مسدد</Badge>
                  )}
                </div>
                {/* تنبيه المتبقي */}
                <span className={`text-[10px] font-bold ${remaining > 0 ? "text-red-500" : "text-emerald-400"}`}>
                  {remaining > 0 ? `${fc(remaining)} ✗` : "مسدد ✓"}
                </span>
              </div>
            );
          })}
          {filteredOrders.length > 15 && (
            <div className="p-4 text-center">
              <button onClick={() => navigate("/finance/sales")}
                className="text-xs text-primary font-bold hover:underline flex items-center gap-1 mx-auto">
                عرض جميع الأوامر ({fn(filteredOrders.length)}) <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
