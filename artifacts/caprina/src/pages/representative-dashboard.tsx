import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Redirect } from "wouter";
import { Truck, Package, CheckCircle2, RotateCcw, Clock, TrendingUp, TrendingDown, MapPin, Star, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  waiting: "انتظار", confirmed: "مؤكدة", picked_up: "تم الاستلام",
  in_transit: "في الطريق", out_for_delivery: "خرجت للتسليم",
  delivered: "تم التسليم", partial_received: "استلام جزئي",
  delayed: "متأخرة", returned: "مرتجع", cancelled: "ملغية",
};
const STATUS_COLOR: Record<string, string> = {
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  partial_received: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  returned: "bg-red-500/15 text-red-400 border-red-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  out_for_delivery: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_transit: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  delayed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};
const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl p-4 border relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, rgba(${color},0.15) 0%, rgba(${color},0.05) 100%)`,
               border: `1px solid rgba(${color},0.3)`, boxShadow: `0 0 20px rgba(${color},0.1)` }}>
      <span className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-10"
        style={{ background: `radial-gradient(circle, rgba(${color},1) 0%, transparent 70%)` }} />
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="w-4 h-4" style={{ color: `rgba(${color},1)` }} />
      </div>
      <p className="text-2xl font-black" style={{ color: `rgba(${color},1)` }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function DeliveryRing({ rate }: { rate: number }) {
  const r = 36; const c = 2 * Math.PI * r;
  const fill = (rate / 100) * c;
  const color = rate >= 70 ? "#34d399" : rate >= 40 ? "#fbbf24" : "#f87171";
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${fill} ${c}`}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black" style={{ color }}>{rate}%</span>
        <span className="text-[9px] text-muted-foreground">تسليم</span>
      </div>
    </div>
  );
}

export default function RepresentativeDashboard() {
  const { user, isRepresentative, isAdmin, isSuperAdmin } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // فقط المندوبين والأدمن
  if (user && !isRepresentative && !isAdmin && !isSuperAdmin) return <Redirect to="/" />;

  const qParams = new URLSearchParams();
  if (dateFrom) qParams.set("dateFrom", dateFrom);
  if (dateTo)   qParams.set("dateTo",   dateTo);

  const { data: dash } = useQuery({
    queryKey: ["rep-dashboard", dateFrom, dateTo],
    queryFn: () => apiFetch(`/representative/dashboard?${qParams}`),
    enabled: !!user,
  });

  const shipParams = new URLSearchParams(qParams);
  shipParams.set("page", String(page));
  shipParams.set("limit", "20");
  if (statusFilter) shipParams.set("status", statusFilter);

  const { data: ships } = useQuery({
    queryKey: ["rep-shipments", dateFrom, dateTo, statusFilter, page],
    queryFn: () => apiFetch(`/representative/shipments?${shipParams}`),
    enabled: !!user,
  });

  const { data: meData } = useQuery({
    queryKey: ["rep-me"],
    queryFn: () => apiFetch("/representative/me"),
    enabled: !!user,
  });

  const d = dash as any;
  const s = ships as any;
  const company = (meData as any)?.company;

  return (
    <div className="space-y-5 p-4 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        {company?.logo
          ? <img src={company.logo} className="w-12 h-12 rounded-full object-cover border-2 border-border" alt={company?.name} />
          : <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary/60" />
            </div>}
        <div>
          <h1 className="text-xl font-black">{company?.name ?? user?.displayName}</h1>
          <p className="text-xs text-muted-foreground">بوابة المندوب</p>
        </div>
        {d?.highReturnRisk && (
          <Badge variant="destructive" className="mr-auto gap-1 text-xs">
            <AlertCircle className="w-3 h-3" /> معدل إرجاع مرتفع
          </Badge>
        )}
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap gap-2">
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground" />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
            className="h-8 px-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60">
            مسح
          </button>
        )}
      </div>

      {/* KPI Cards */}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="إجمالي الشحنات"  value={d.total}      color="96,165,250"  icon={Package} />
            <KpiCard label="تم التسليم"        value={d.delivered}  color="52,211,153"  icon={CheckCircle2} />
            <KpiCard label="قيد التسليم"       value={d.inProgress} color="251,191,36"  icon={Clock} />
            <KpiCard label="مرتجع"             value={d.returned}   color="248,113,113" icon={RotateCcw} />
          </div>

          {/* Delivery rate ring + stats */}
          <Card className="p-4 bg-card/60 border-border">
            <div className="flex items-center gap-6">
              <DeliveryRing rate={d.deliveryRate} />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">معدل الإرجاع</span>
                  <span className={d.returnRate > 30 ? "text-red-400 font-bold" : "text-foreground font-bold"}>{d.returnRate}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">مبالغ محصّلة</span>
                  <span className="text-emerald-400 font-bold">{formatCurrency(d.totalCollected)}</span>
                </div>
                {d.topZone && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />أكتر منطقة</span>
                    <span className="font-bold truncate max-w-[120px]">{d.topZone.name} ({d.topZone.count})</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Zones bar chart */}
          {d.zones?.length > 0 && (
            <Card className="p-4 bg-card/60 border-border">
              <p className="text-xs font-bold mb-3 flex items-center gap-1"><MapPin className="w-3 h-3 text-primary" />المناطق</p>
              <div className="space-y-2">
                {(d.zones as any[]).slice(0, 8).map((z: any) => (
                  <div key={z.name}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-muted-foreground truncate">{z.name}</span>
                      <span className="font-bold">{z.count}</span>
                    </div>
                    <div className="w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${Math.round((z.count / d.total) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Shipments list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold">الشحنات</p>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-7 text-xs rounded-md border border-border bg-background px-2 text-foreground">
            <option value="">كل الحالات</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          {s?.data?.map((sh: any) => (
            <Card key={sh.id} className="p-3 bg-card/60 border-border">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{sh.receiverName}</p>
                  <p className="text-[10px] text-muted-foreground flex gap-1 flex-wrap mt-0.5">
                    <span className="font-mono text-primary/70">{sh.shipmentNumber}</span>
                    {sh.receiverPhone && <span>· {sh.receiverPhone}</span>}
                    {sh.receiverCity && <span>· {sh.receiverCity}</span>}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[9px] shrink-0 border ${STATUS_COLOR[sh.status] ?? "border-border"}`}>
                  {STATUS_LABELS[sh.status] ?? sh.status}
                </Badge>
              </div>
              <div className="flex justify-between text-[11px] mt-2">
                <span className="text-muted-foreground">{sh.createdAt ? format(new Date(sh.createdAt), "dd/MM/yyyy", { locale: ar }) : ""}</span>
                <span className="font-bold text-emerald-400">{formatCurrency(Number(sh.codAmount ?? 0))}</span>
              </div>
            </Card>
          ))}
          {s?.data?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">لا توجد شحنات</p>
          )}
        </div>

        {/* Pagination */}
        {s && s.total > 20 && (
          <div className="flex justify-center gap-2 mt-3">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="h-7 px-3 text-xs rounded-md border border-border bg-muted/20 disabled:opacity-40">
              السابق
            </button>
            <span className="text-xs text-muted-foreground self-center">
              {page} / {Math.ceil(s.total / 20)}
            </span>
            <button disabled={page >= Math.ceil(s.total / 20)} onClick={() => setPage(p => p + 1)}
              className="h-7 px-3 text-xs rounded-md border border-border bg-muted/20 disabled:opacity-40">
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
