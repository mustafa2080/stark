import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ClientAccountProPanel from "@/components/client-account-pro-panel";
import {
  User, Phone, MapPin, ArrowRight, Wallet,
  CheckCircle2, ListOrdered, TrendingUp, Lock, History, Ban, Search,
} from "lucide-react";

const fmt = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });

function initials(name: string) {
  return (name || "؟").trim().charAt(0);
}

const STATUS_LABELS: Record<string, string> = {
  waiting: "انتظار", confirmed: "مؤكدة", picked_up: "تم الاستلام",
  in_transit: "في الطريق", out_for_delivery: "خرجت للتسليم", delayed: "مؤجل",
  delivered: "تم التسليم", partial_received: "استلام جزئي", returned: "مرتجع", cancelled: "ملغي",
  // ── حالات إضافية موجودة فى قاعدة البيانات (aliases قديمة/بيانات استيراد) ──
  pending: "قيد الانتظار", warehouse_ready: "قيد الشحن في المخزن", in_shipping: "قيد الشحن",
  received: "تم الاستلام",
};

const STATUS_COLORS: Record<string, string> = {
  waiting: "#f59e0b", confirmed: "#14b8a6", picked_up: "#0ea5e9",
  in_transit: "#0ea5e9", out_for_delivery: "#3b82f6", delayed: "#f97316",
  delivered: "#10b981", partial_received: "#06b6d4", returned: "#ef4444", cancelled: "#64748b",
  pending: "#eab308", warehouse_ready: "#14b8a6", in_shipping: "#3b82f6", received: "#22c55e",
};

// أى حالة مش موجودة فى الـ map أعلاه (بيانات قديمة/غير متوقعة) تتحول لتسمية عربية عامة
// بدل ما تظهر بالكود الإنجليزي الخام
function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? "حالة أخرى";
}
function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "#64748b";
}

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

// ─── دائرة نسبة صغيرة — بنفس روح EmployeeScoreRing فى صفحة الفريق ────────────
function RingStat({ label, value, percentage, color, icon: Icon }: {
  label: string; value: number; percentage: number; color: string; icon: any;
}) {
  const r = 30, circ = 2 * Math.PI * r;
  const dash = (Math.min(percentage, 100) / 100) * circ;
  return (
    <div className="rounded-2xl p-4 relative overflow-hidden"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
      <div className="absolute -top-8 -left-8 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `${color}12`, filter: "blur(18px)" }} />
      <div className="relative z-10 flex items-center gap-3">
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 76 76" className="w-full h-full -rotate-90">
            <circle cx="38" cy="38" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
            <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7"
              strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.6s ease" }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xl font-black" style={{ color }}>{fmt(value)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function ClientAccountDetailPage() {
  const params = useParams<{ phone: string }>();
  const [, navigate] = useLocation();
  const phone = decodeURIComponent(params.phone ?? "");
  const [closureSearch, setClosureSearch] = useState("");

  const { data, isLoading } = useQuery<DetailResponse>({
    queryKey: ["client-account-detail", phone],
    queryFn: () => apiFetch<DetailResponse>(`/client-account-sheet/detail?phone=${encodeURIComponent(phone)}`),
    enabled: !!phone,
  });

  const collectionPct = data?.totals && data.totals.totalShippingValue > 0
    ? Math.round((data.totals.totalCollected / data.totals.totalShippingValue) * 100)
    : 0;
  const remainingPct = 100 - collectionPct;

  const filteredClosures = useMemo(() => {
    const list = data?.closures ?? [];
    const q = closureSearch.trim();
    if (!q) return list;
    return list.filter(c =>
      (c.closedByName ?? "").includes(q) ||
      (c.notes ?? "").includes(q) ||
      fmtDate(c.createdAt).includes(q) ||
      String(c.ordersCount).includes(q) ||
      fmt(c.totalShippingValue).includes(q) ||
      fmt(c.totalCollected).includes(q)
    );
  }, [data?.closures, closureSearch]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate(`/finance/client-account-sheet`)}>
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" /> تفاصيل حساب العميل
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">الإجماليات المالية، توزيع الحالات، وسجل الإقفالات السابقة</p>
        </div>
      </div>

      {isLoading && <p className="text-center text-muted-foreground py-16 text-sm">جاري التحميل...</p>}

      {!isLoading && data && !data.client && (
        <div className="text-center py-16 text-muted-foreground">
          <User className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">مفيش بيانات لهذا العميل</p>
        </div>
      )}

      {!isLoading && data?.client && (
        <>
          {/* ── كارت العميل — نفس روح كارت team.tsx ── */}
          <div className="group relative overflow-hidden rounded-[22px] dark:border-white/10 border-black/10"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 2px 12px rgba(0,0,0,0.08), 0 4px 24px rgba(0,0,0,0.06)",
            }}>
            <div className="absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(201,162,39,0.6), transparent)" }} />
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: "rgba(201,162,39,0.06)", filter: "blur(20px)" }} />

            <div className="p-5 relative z-10 flex items-center gap-4 flex-wrap justify-between">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shrink-0"
                  style={{
                    background: "rgba(201,162,39,0.15)",
                    border: "2px solid rgba(201,162,39,0.35)",
                    color: "#c9a227",
                  }}>
                  {initials(data.client.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold truncate">{data.client.name}</p>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap mt-0.5">
                    {data.client.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {data.client.phone}</span>}
                    {data.client.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {data.client.city}</span>}
                  </div>
                </div>
              </div>
              {data.totals && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(201,162,39,0.12)", color: "#c9a227",
                    border: "1px solid rgba(201,162,39,0.28)",
                  }}>
                  {data.totals.ordersCount} أوردر إجمالي
                </span>
              )}
            </div>
          </div>

          {/* ── الملف الاحترافي — بروفايل / كشف حساب / تحصيلات / فواتير / تحليلات ── */}
          <ClientAccountProPanel phone={phone} clientName={data.client.name} />

          {/* ── الإجماليات المالية — دوائر نسبة ── */}
          {data.totals && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <RingStat label="قيمة الشحنات الكلية" value={data.totals.totalShippingValue} percentage={100} color="#3b82f6" icon={ListOrdered} />
              <RingStat label="المحصَّل فعلياً" value={data.totals.totalCollected} percentage={collectionPct} color="#10b981" icon={CheckCircle2} />
              <RingStat label="المتبقي" value={data.totals.totalRemaining} percentage={remainingPct} color="#f59e0b" icon={Wallet} />
            </div>
          )}

          {/* شريط نسبة التحصيل الإجمالية */}
          {data.totals && data.totals.totalShippingValue > 0 && (
            <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>نسبة التحصيل الإجمالية</span>
                <span className="font-bold">{collectionPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${collectionPct}%`, background: "#10b981" }} />
              </div>
            </div>
          )}

          {/* ── توزيع حالات الشحنات ── */}
          <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> توزيع حالات الشحنات
              </p>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted/40 text-muted-foreground">
                {fmt(data.weeklyShipments)} شحنة آخر 7 أيام
              </span>
            </div>

            <div className="space-y-2.5">
              {data.statusDistribution.map((s) => (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-xs w-28 shrink-0 truncate">{statusLabel(s.status)}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${s.percentage}%`, background: statusColor(s.status) }} />
                  </div>
                  <span className="text-xs w-16 shrink-0 text-left text-muted-foreground">{s.count} ({s.percentage}%)</span>
                </div>
              ))}
              {data.statusDistribution.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <Ban className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                  <p className="text-xs">لا يوجد بيانات</p>
                </div>
              )}
            </div>
          </div>

          {/* ── سجل إقفالات الحساب السابقة — جدول قابل للبحث ── */}
          <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="text-sm font-bold flex items-center gap-2">
                <History className="w-4 h-4 text-primary" /> سجل إقفالات الحساب السابقة
              </p>
              {data.closures.length > 0 && (
                <div className="relative">
                  <Search className="absolute right-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالتاريخ أو الموظف أو الملاحظات..."
                    className="h-8 text-xs bg-background pr-8 w-64"
                    value={closureSearch}
                    onChange={e => setClosureSearch(e.target.value)}
                  />
                </div>
              )}
            </div>

            {data.closures.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Lock className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
                <p className="text-xs">لا يوجد إقفالات سابقة لهذا العميل</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] font-bold text-muted-foreground">
                      <th className="text-right py-2 px-2">التاريخ</th>
                      <th className="text-right py-2 px-2">عدد الأوردرات</th>
                      <th className="text-right py-2 px-2">قيمة الشحنات</th>
                      <th className="text-right py-2 px-2">المحصَّل</th>
                      <th className="text-right py-2 px-2">بواسطة</th>
                      <th className="text-right py-2 px-2">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClosures.map((c) => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                        <td className="py-2.5 px-2">
                          <span className="flex items-center gap-1.5">
                            <Lock className="w-3 h-3 text-red-400 shrink-0" />
                            {fmtDate(c.createdAt)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 font-bold">{c.ordersCount}</td>
                        <td className="py-2.5 px-2 text-foreground font-bold">{fmt(c.totalShippingValue)}</td>
                        <td className="py-2.5 px-2 text-emerald-400 font-bold">{fmt(c.totalCollected)}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{c.closedByName || "—"}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{c.notes || "—"}</td>
                      </tr>
                    ))}
                    {filteredClosures.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                          لا توجد نتائج مطابقة للبحث
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
