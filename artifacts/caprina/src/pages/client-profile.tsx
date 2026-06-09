import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { ar } from "date-fns/locale";
import {
  User, Phone, Mail, MapPin, Building2, Calendar,
  TrendingUp, Package, CheckCircle2, XCircle, Clock,
  Wallet, Receipt, Target, BarChart3, ArrowUpRight,
  ShoppingCart, DollarSign, Percent, ChevronRight,
  BadgeCheck, AlertCircle, Star, Shield,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ── helpers ───────────────────────────────────────────────────────────────
const fc = (n: number | string) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n));
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

// ── Avatar ────────────────────────────────────────────────────────────────
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
function ClientAvatarBig({ avatar, name }: { avatar?: string | null; name: string }) {
  if (avatar?.startsWith("data:"))
    return <img src={avatar} className="w-24 h-24 rounded-full object-cover border-4 border-primary/30" />;
  const [bg, fg] = avatarColor(name || "?");
  return (
    <div className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black border-4 border-primary/30"
      style={{ background: bg, color: fg }}>
      {name ? initials(name) : "؟"}
    </div>
  );
}

// ── MiniCard ──────────────────────────────────────────────────────────────
function MiniCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className={`rounded-xl p-4 border bg-gradient-to-br ${color} flex flex-col gap-1`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <Icon className="w-4 h-4 opacity-50" />
      </div>
      <p className="text-xl font-black">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── AnimatedBar ───────────────────────────────────────────────────────────
function AnimatedBar({ pct: p, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-700`}
        style={{ width: `${Math.min(100, Math.max(0, p))}%` }} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function ClientProfilePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"overview" | "orders" | "invoices">("overview");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [search, setSearch] = useState("");
  const [tabFilter, setTabFilter] = useState<"all" | "paid" | "partial" | "unpaid">("all");

  const monthOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy", { locale: ar }) };
  }), []);

  // ── Data ──────────────────────────────────────────────────────────────
  // العميل المسجل — نجيب بياناته بالـ tenantId بتاعه
  const { data: clientData } = useQuery<any>({
    queryKey: ["client-profile-me", user?.id],
    queryFn: () => apiFetch<any>("/finance/clients/me"),
    staleTime: 30_000,
    enabled: !!user,
  });

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ["client-orders-me", user?.id],
    queryFn: () => apiFetch<any[]>("/finance/clients/me/orders"),
    staleTime: 30_000,
    enabled: !!user,
  });

  const client = clientData ?? null;

  // الأوامر جاية مباشرة خاصة بالعميل من الـ API
  const clientOrders = orders;

  const monthOrders = useMemo(() =>
    clientOrders.filter((o: any) => (o.createdAt ?? "").startsWith(selectedMonth)),
    [clientOrders, selectedMonth]
  );

  // ── KPIs ──────────────────────────────────────────────────────────────
  const totalSales   = parseFloat(client?.totalSales  ?? "0");
  const totalPaid    = parseFloat(client?.totalPaid   ?? "0");
  const totalUnpaid  = Math.max(0, totalSales - totalPaid);
  const target       = parseFloat(client?.creditLimit ?? "0") || 1_000_000;
  const targetPct    = Math.min((totalSales / target) * 100, 100);
  const paidOrders   = clientOrders.filter((o: any) => o.paymentStatus === "paid").length;
  const partialOrders = clientOrders.filter((o: any) => o.paymentStatus === "partial").length;
  const unpaidOrders = clientOrders.filter((o: any) => o.paymentStatus === "unpaid" || !o.paymentStatus).length;
  const deliveredOrders = clientOrders.filter((o: any) => o.status === "delivered").length;
  const collectionRate = clientOrders.length > 0
    ? Math.round((paidOrders / clientOrders.length) * 100) : 0;

  // ── Chart: آخر 6 أشهر ────────────────────────────────────────────────
  const chartData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const key = format(d, "yyyy-MM");
      const monthOrd = clientOrders.filter((o: any) => (o.createdAt ?? "").startsWith(key));
      const value = monthOrd.reduce((s: number, o: any) => s + parseFloat(o.totalAmount ?? "0"), 0);
      return { label: format(d, "MMM", { locale: ar }), sales: value };
    });
  }, [clientOrders]);

  // ── Filtered Orders (for table) ───────────────────────────────────────
  const filteredOrders = useMemo(() => {
    let list = clientOrders;
    if (tabFilter !== "all") list = list.filter((o: any) => (o.paymentStatus ?? "unpaid") === tabFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o: any) =>
        String(o.invoiceNumber ?? o.id).includes(q) ||
        (o.products ?? []).some((p: any) => (p.productName ?? "").toLowerCase().includes(q))
      );
    }
    return list;
  }, [clientOrders, tabFilter, search]);

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center" dir="rtl">
        <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center">
          <User className="w-10 h-10 text-muted-foreground/30" />
        </div>
        <p className="font-black text-xl">لا يوجد بروفايل عميل</p>
        <p className="text-muted-foreground text-sm max-w-xs">لم يتم إنشاء أي عميل تجاري بعد.</p>
        <button onClick={() => navigate("/finance/clients")}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm">
          <User className="w-4 h-4" /> إضافة عميل جديد
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-6" dir="rtl">

      {/* ── Hero Card ── */}
      <div className="relative rounded-3xl overflow-hidden border border-border bg-card">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">

            {/* Avatar */}
            <div className="relative shrink-0">
              <ClientAvatarBig avatar={client.avatar} name={client.name} />
              {client.isActive && (
                <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-2xl sm:text-3xl font-black truncate">{client.name}</h1>
                <Badge variant="outline" className={`text-[10px] font-bold border ${
                  client.isActive
                    ? "border-emerald-600 bg-emerald-900/20 text-emerald-400"
                    : "border-border text-muted-foreground"
                }`}>
                  {client.isActive ? "✓ نشط" : "موقف"}
                </Badge>
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
                {client.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />{client.phone}
                  </span>
                )}
                {client.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />{client.email}
                  </span>
                )}
                {(client.city || client.region) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />{[client.city, client.region].filter(Boolean).join(" • ")}
                  </span>
                )}
                {client.paymentTerms && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />{client.paymentTerms}
                  </span>
                )}
                {client.createdAt && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    منذ {format(new Date(client.createdAt), "MMMM yyyy", { locale: ar })}
                  </span>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex flex-col gap-2 shrink-0">
              <button onClick={() => navigate(`/finance/clients/${client.id}`)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors">
                <ChevronRight className="w-3.5 h-3.5" /> فتح الملف الكامل
              </button>
              <button onClick={() => navigate("/finance/sales/new")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted/20 transition-colors">
                <ShoppingCart className="w-3.5 h-3.5" /> أمر بيع جديد
              </button>
            </div>
          </div>

          {/* Target Progress */}
          <div className="mt-5 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">تحقيق الهدف</span>
                <span className="text-xs text-muted-foreground">{fc(totalSales)} من {fc(target)}</span>
              </div>
              <span className={`text-sm font-black ${
                targetPct >= 75 ? "text-emerald-400" : targetPct >= 50 ? "text-amber-400" : "text-primary"
              }`}>{targetPct.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${
                targetPct >= 75 ? "bg-emerald-500" : targetPct >= 50 ? "bg-amber-500" : "bg-primary"
              }`} style={{ width: `${targetPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard label="إجمالي المبيعات" value={fc(totalSales)}
          sub={`${fn(clientOrders.length)} أمر`}
          icon={TrendingUp} color="from-primary/15 to-primary/5 border-primary/20 text-primary" />
        <MiniCard label="المحصّل" value={fc(totalPaid)}
          sub={`${Math.round(totalSales > 0 ? (totalPaid / totalSales) * 100 : 0)}% من الإجمالي`}
          icon={Wallet} color="from-emerald-500/15 to-green-600/5 border-emerald-500/20 text-emerald-400" />
        <MiniCard label="المتبقي" value={fc(totalUnpaid)}
          sub={`${fn(unpaidOrders + partialOrders)} أمر غير مسدد`}
          icon={AlertCircle} color="from-red-500/15 to-red-600/5 border-red-500/20 text-red-400" />
        <MiniCard label="معدل التحصيل" value={`${collectionRate}%`}
          sub={`${fn(paidOrders)} أمر مكتمل`}
          icon={Percent} color="from-blue-500/15 to-blue-600/5 border-blue-500/20 text-blue-400" />
      </div>

      {/* ── 4 Status Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الأوامر", count: clientOrders.length, color: "text-blue-500", border: "border-blue-200 dark:border-blue-900/40", bg: "bg-blue-50 dark:bg-blue-900/20" },
          { label: "تم التحصيل",     count: paidOrders,          color: "text-emerald-500", border: "border-emerald-200 dark:border-emerald-900/40", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
          { label: "تحت التحصيل",   count: partialOrders,        color: "text-amber-500",  border: "border-amber-200 dark:border-amber-900/40",  bg: "bg-amber-50 dark:bg-amber-900/20" },
          { label: "غير مسدد",       count: unpaidOrders,         color: "text-red-500",   border: "border-red-200 dark:border-red-900/40",   bg: "bg-red-50 dark:bg-red-900/20" },
        ].map((s, i) => (
          <div key={i} className={`bg-card rounded-2xl border-2 ${s.border} p-5`}>
            <p className={`text-xs font-bold mb-2 ${s.color}`}>{s.label}</p>
            <p className={`text-4xl font-black ${s.color}`}>{fn(s.count)}</p>
          </div>
        ))}
      </div>


      {/* ── Chart + Top Products ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Area Chart */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            المبيعات — آخر 6 أشهر
          </p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="cpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis hide />
                <Tooltip formatter={(v: any) => fc(v)} />
                <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))"
                  strokeWidth={2} fill="url(#cpGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
              لا توجد بيانات كافية
            </div>
          )}
        </div>

        {/* Payment breakdown bar */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm font-bold mb-4 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            توزيع التحصيل
          </p>
          <div className="space-y-4 mt-2">
            {[
              { label: "تم التحصيل",   val: totalPaid,   pctVal: totalSales > 0 ? (totalPaid / totalSales) * 100 : 0,   color: "bg-emerald-500" },
              { label: "جزئي",         val: totalSales - totalPaid - totalUnpaid < 0 ? 0 : totalSales - totalPaid - totalUnpaid,
                pctVal: totalSales > 0 ? ((totalSales - totalPaid - totalUnpaid) / totalSales) * 100 : 0, color: "bg-amber-500" },
              { label: "غير مسدد",     val: totalUnpaid, pctVal: totalSales > 0 ? (totalUnpaid / totalSales) * 100 : 0,  color: "bg-red-500" },
            ].map((r, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-muted-foreground">{fc(r.val)} ({pct(r.pctVal)})</span>
                </div>
                <AnimatedBar pct={r.pctVal} color={r.color} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Orders Table ── */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Receipt className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">سجل الأوامر</span>
            <Badge variant="secondary" className="text-xs">{fn(filteredOrders.length)}</Badge>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم الأمر أو المنتج..."
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b border-border bg-muted/20 overflow-x-auto">
          {[
            { key: "all",     label: "الكل",          count: clientOrders.length },
            { key: "paid",    label: "تم التحصيل",   count: paidOrders },
            { key: "partial", label: "جزئي",          count: partialOrders },
            { key: "unpaid",  label: "غير مسدد",      count: unpaidOrders },
          ].map(t => (
            <button key={t.key}
              onClick={() => setTabFilter(t.key as any)}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                tabFilter === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}>
              {t.label} ({fn(t.count)})
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {filteredOrders.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">لا توجد أوامر</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-right font-bold">رقم الأمر</th>
                  <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                  <th className="px-4 py-3 text-right font-bold">الإجمالي</th>
                  <th className="px-4 py-3 text-right font-bold">المدفوع</th>
                  <th className="px-4 py-3 text-right font-bold">المتبقي</th>
                  <th className="px-4 py-3 text-right font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.slice(0, 50).map((o: any) => {
                  const oTotal  = Number(o.totalAmount  ?? 0);
                  const oPaid   = Number(o.paidAmount   ?? 0);
                  const oRemain = oTotal - oPaid;
                  const st = o.paymentStatus ?? o.status ?? "unpaid";
                  const statusMap: Record<string, { label: string; cls: string }> = {
                    paid:    { label: "مسدد",      cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" },
                    partial: { label: "جزئي",      cls: "bg-amber-500/15  text-amber-400  border border-amber-500/30"  },
                    unpaid:  { label: "غير مسدد",  cls: "bg-red-500/15    text-red-400    border border-red-500/30"    },
                  };
                  const badge = statusMap[st] ?? statusMap.unpaid;
                  return (
                    <tr key={o.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-primary">
                        #{String(o.invoiceNumber ?? o.id).padStart(4, "0")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {o.createdAt ? format(new Date(o.createdAt), "dd MMM yyyy", { locale: ar }) : "—"}
                      </td>
                      <td className="px-4 py-3 font-bold">{fc(oTotal)}</td>
                      <td className="px-4 py-3 text-emerald-400 font-bold">{fc(oPaid)}</td>
                      <td className="px-4 py-3 text-red-400 font-bold">{oRemain > 0 ? fc(oRemain) : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {filteredOrders.length > 50 && (
          <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
            يعرض أول 50 أمر من {fn(filteredOrders.length)}
          </div>
        )}
      </div>

    </div>
  );
}
