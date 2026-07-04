import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User, Phone, MapPin, ArrowRight, Loader2, Wallet,
  CheckCircle2, AlertTriangle, ListOrdered, TrendingUp,
  Lock, History,
} from "lucide-react";

const fmt = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });

const STATUS_LABELS: Record<string, string> = {
  waiting: "انتظار", confirmed: "مؤكدة", picked_up: "تم الاستلام",
  in_transit: "في الطريق", out_for_delivery: "خرجت للتسليم", delayed: "مؤجل",
  delivered: "تم التسليم", partial_received: "استلام جزئي", returned: "مرتجع", cancelled: "ملغي",
};

const STATUS_COLORS: Record<string, string> = {
  waiting: "#f59e0b", confirmed: "#14b8a6", picked_up: "#0ea5e9",
  in_transit: "#0ea5e9", out_for_delivery: "#3b82f6", delayed: "#f97316",
  delivered: "#10b981", partial_received: "#06b6d4", returned: "#ef4444", cancelled: "#64748b",
};

type DetailResponse = {
  client: { name: string; phone: string | null; city: string | null; address: string | null } | null;
  totals: {
    totalShippingValue: number;
    totalCollected: number;
    totalRemaining: number;
    ordersCount: number;
  } | null;
  statusDistribution: { status: string; count: number; percentage: number }[];
  weeklyShipments: number;
  closures: {
    id: number;
    clientName: string;
    clientPhone: string;
    ordersCount: number;
    totalShippingValue: string;
    totalCollected: string;
    totalShippingFee: string;
    notes: string | null;
    closedByName: string | null;
    createdAt: string;
  }[];
};

function TotalBox({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <Card className="p-4 border-border relative overflow-hidden">
      <div className="absolute -top-6 -left-6 w-20 h-20 rounded-full opacity-10" style={{ background: color }} />
      <div className="relative z-10 flex items-center justify-between">
        <div>
          <p className="text-2xl font-black">{fmt(value)}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </Card>
  );
}

export default function ClientAccountDetailPage() {
  const params = useParams<{ phone: string }>();
  const [, navigate] = useLocation();
  const phone = decodeURIComponent(params.phone ?? "");

  const { data, isLoading } = useQuery<DetailResponse>({
    queryKey: ["client-account-detail", phone],
    queryFn: () => apiFetch<DetailResponse>(`/client-account-sheet/detail?phone=${encodeURIComponent(phone)}`),
    enabled: !!phone,
  });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="outline" size="icon"
          onClick={() => navigate(`/finance/client-account-sheet`)}
        >
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-black flex items-center gap-2">
            <User className="w-5 h-5 text-primary" /> تفاصيل حساب العميل
          </h1>
          <p className="text-xs text-muted-foreground mt-1">الإجماليات المالية، توزيع الحالات، وسجل الإقفالات السابقة</p>
        </div>
      </div>

      {isLoading && (
        <Card className="p-10 border-border text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...
        </Card>
      )}

      {!isLoading && data && !data.client && (
        <Card className="p-10 border-border text-center text-muted-foreground">
          مفيش بيانات لهذا العميل
        </Card>
      )}

      {!isLoading && data?.client && (
        <>
          <Card className="p-4 border-border">
            <div className="space-y-1">
              <p className="font-bold text-lg flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> {data.client.name}
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                {data.client.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {data.client.phone}</span>}
                {data.client.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {data.client.city}</span>}
              </div>
            </div>
          </Card>

          {data.totals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <TotalBox label="قيمة الشحنات الكلية" value={data.totals.totalShippingValue} icon={ListOrdered} color="#3b82f6" />
              <TotalBox label="المحصَّل فعلياً" value={data.totals.totalCollected} icon={CheckCircle2} color="#10b981" />
              <TotalBox label="المتبقي" value={data.totals.totalRemaining} icon={Wallet} color="#f59e0b" />
              <TotalBox label="عدد الأوردرات" value={data.totals.ordersCount} icon={AlertTriangle} color="#8b5cf6" />
            </div>
          )}

          <Card className="p-4 border-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> توزيع حالات الشحنات
              </p>
              <Badge variant="outline" className="text-[11px]">
                {fmt(data.weeklyShipments)} شحنة آخر 7 أيام
              </Badge>
            </div>

            <div className="space-y-2">
              {data.statusDistribution.map((s) => (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-xs w-24 shrink-0">{STATUS_LABELS[s.status] ?? s.status}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${s.percentage}%`, background: STATUS_COLORS[s.status] ?? "#64748b" }}
                    />
                  </div>
                  <span className="text-xs w-16 shrink-0 text-left text-muted-foreground">{s.count} ({s.percentage}%)</span>
                </div>
              ))}
              {data.statusDistribution.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">لا يوجد بيانات</p>
              )}
            </div>
          </Card>

          <Card className="p-4 border-border">
            <p className="text-sm font-bold flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-primary" /> سجل إقفالات الحساب السابقة
            </p>
            {data.closures.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">لا يوجد إقفالات سابقة لهذا العميل</p>
            )}
            <div className="space-y-2">
              {data.closures.map((c) => (
                <div key={c.id} className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg border border-border/60 bg-muted/10">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-red-400" />
                    <div>
                      <p className="text-xs font-bold">{fmtDate(c.createdAt)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.ordersCount} أوردر — بواسطة {c.closedByName || "—"}
                      </p>
                      {c.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{c.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span>قيمة: <b>{fmt(c.totalShippingValue)}</b></span>
                    <span>محصَّل: <b className="text-emerald-400">{fmt(c.totalCollected)}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
