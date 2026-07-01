import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { analyticsApi, type FinancialDashboardRepCost, type FinancialDashboardZoneCost, type FinancialDashboardClient } from "@/lib/api";
import {
  Wallet, TrendingUp, TrendingDown, RefreshCw, Truck, MapPin,
  Crown, AlertTriangle, DollarSign, Package, Percent,
} from "lucide-react";

const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));
const money = (n: number) => `${fn(n)} ج.م`;

// ─── كارت ملخص علوي ───────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg, border, sub }: {
  icon: any; label: string; value: string; color: string; bg: string; border: string; sub?: string;
}) {
  return (
    <Card className={`border ${border} bg-card overflow-hidden`}>
      <CardContent className="p-3.5 sm:p-4 flex items-center gap-3">
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs text-muted-foreground font-bold truncate">{label}</p>
          <p className={`text-base sm:text-xl font-black truncate ${color}`}>{value}</p>
          {sub && <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── قسم فترة (اليوم / الشهر) ─────────────────────────────────────────────────
function PeriodSection({ title, data }: {
  title: string;
  data: { orders: number; revenue: number; operatingCost: number; netProfit: number } | undefined;
}) {
  const isProfit = (data?.netProfit ?? 0) >= 0;
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 sm:p-5">
        <h3 className="text-sm font-black mb-3 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" /> {title}
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-2.5 rounded-lg bg-blue-500/10">
            <p className="text-[10px] text-muted-foreground font-bold">الإيرادات</p>
            <p className="text-sm font-black text-blue-500">{money(data?.revenue ?? 0)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-orange-500/10">
            <p className="text-[10px] text-muted-foreground font-bold">تكلفة التشغيل</p>
            <p className="text-sm font-black text-orange-500">{money(data?.operatingCost ?? 0)}</p>
          </div>
          <div className={`p-2.5 rounded-lg ${isProfit ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
            <p className="text-[10px] text-muted-foreground font-bold">صافي الربح</p>
            <p className={`text-sm font-black flex items-center gap-1 ${isProfit ? "text-emerald-500" : "text-red-500"}`}>
              {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {money(data?.netProfit ?? 0)}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-violet-500/10">
            <p className="text-[10px] text-muted-foreground font-bold">عدد الشحنات</p>
            <p className="text-sm font-black text-violet-500">{fn(data?.orders ?? 0)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── جدول تكلفة المندوبين ─────────────────────────────────────────────────────
function RepCostsTable({ reps }: { reps: FinancialDashboardRepCost[] }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 sm:p-5">
        <h3 className="text-sm font-black mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4 text-sky-500" /> تكلفة كل مندوب (آخر 30 يوم)
        </h3>
        {reps.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات كافية</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
            {reps.map((r) => (
              <div key={r.repId} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 text-xs">
                <div className="min-w-0">
                  <p className="font-bold truncate">{r.repName}</p>
                  <p className="text-[10px] text-muted-foreground">{fn(r.orders)} شحنة</p>
                </div>
                <div className="text-left shrink-0">
                  <p className="font-black text-orange-500">{money(r.operatingCost)}</p>
                  <p className={`text-[10px] font-bold ${r.netProfit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    صافي {money(r.netProfit)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── جدول تكلفة المناطق ───────────────────────────────────────────────────────
function ZoneCostsTable({ zones }: { zones: FinancialDashboardZoneCost[] }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 sm:p-5">
        <h3 className="text-sm font-black mb-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-500" /> تكلفة كل منطقة (آخر 30 يوم)
        </h3>
        {zones.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات كافية</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
            {zones.map((z) => (
              <div key={z.city} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 text-xs">
                <div className="min-w-0">
                  <p className="font-bold truncate">{z.city}</p>
                  <p className="text-[10px] text-muted-foreground">{fn(z.orders)} شحنة</p>
                </div>
                <div className="text-left shrink-0">
                  <p className="font-black text-orange-500">{money(z.operatingCost)}</p>
                  <p className={`text-[10px] font-bold ${z.netProfit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    صافي {money(z.netProfit)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── جدول العملاء (أعلى / أقل ربحًا) ──────────────────────────────────────────
function ClientsTable({ title, icon: Icon, color, clients }: {
  title: string; icon: any; color: string; clients: FinancialDashboardClient[];
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 sm:p-5">
        <h3 className="text-sm font-black mb-3 flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} /> {title}
        </h3>
        {clients.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات كافية (يتطلب شحنتين فأكثر)</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
            {clients.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-black shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="font-bold truncate">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{fn(c.orders)} شحنة</p>
                  </div>
                </div>
                <p className={`font-black shrink-0 ${c.netProfit >= 0 ? "text-emerald-500" : "text-red-500"}`}>{money(c.netProfit)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── الصفحة الرئيسية ─────────────────────────────────────────────────────────
export default function FinancialDashboard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["financial-dashboard"],
    queryFn: analyticsApi.financialDashboard,
    staleTime: 60_000,
    refetchInterval: 180_000,
  });

  const marginPct = data?.month.revenue ? Math.round((data.month.netProfit / data.month.revenue) * 1000) / 10 : 0;

  return (
    <div className="p-4 sm:p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" /> لوحة الأرباح
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">الأرباح والتكاليف التفصيلية بدل رقم الإيرادات فقط</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card border border-border text-sm font-bold hover:bg-muted/40 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> تحديث
        </button>
      </div>

      {/* كروت الملخص الشهري */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="إيرادات الشهر" value={isLoading ? "..." : money(data?.month.revenue ?? 0)} color="text-blue-500" bg="bg-blue-500/10" border="border-blue-500/20" />
        <StatCard
          icon={data && data.month.netProfit >= 0 ? TrendingUp : TrendingDown}
          label="صافي ربح الشهر"
          value={isLoading ? "..." : money(data?.month.netProfit ?? 0)}
          sub={!isLoading ? `هامش ${marginPct}%` : undefined}
          color={data && data.month.netProfit >= 0 ? "text-emerald-500" : "text-red-500"}
          bg={data && data.month.netProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}
          border={data && data.month.netProfit >= 0 ? "border-emerald-500/20" : "border-red-500/20"}
        />
        <StatCard icon={Package} label="تكلفة التشغيل" value={isLoading ? "..." : money(data?.month.operatingCost ?? 0)} color="text-orange-500" bg="bg-orange-500/10" border="border-orange-500/20" />
        <StatCard icon={Percent} label="عدد شحنات الشهر" value={isLoading ? "..." : fn(data?.month.orders ?? 0)} color="text-violet-500" bg="bg-violet-500/10" border="border-violet-500/20" />
      </div>

      {/* أرباح اليوم والشهر */}
      <div className="grid sm:grid-cols-2 gap-4">
        <PeriodSection title="أرباح اليوم" data={data?.today} />
        <PeriodSection title="أرباح الشهر" data={data?.month} />
      </div>

      {/* تكلفة المندوبين والمناطق */}
      <div className="grid lg:grid-cols-2 gap-4">
        {isLoading ? (
          <>
            <div className="h-96 rounded-2xl bg-muted/20 animate-pulse" />
            <div className="h-96 rounded-2xl bg-muted/20 animate-pulse" />
          </>
        ) : (
          <>
            <RepCostsTable reps={data?.repCosts ?? []} />
            <ZoneCostsTable zones={data?.zoneCosts ?? []} />
          </>
        )}
      </div>

      {/* أعلى وأقل العملاء ربحًا */}
      <div className="grid lg:grid-cols-2 gap-4">
        {isLoading ? (
          <>
            <div className="h-96 rounded-2xl bg-muted/20 animate-pulse" />
            <div className="h-96 rounded-2xl bg-muted/20 animate-pulse" />
          </>
        ) : (
          <>
            <ClientsTable title="أعلى العملاء ربحًا" icon={Crown} color="text-amber-500" clients={data?.topClients ?? []} />
            <ClientsTable title="أقل العملاء ربحًا" icon={AlertTriangle} color="text-red-500" clients={data?.bottomClients ?? []} />
          </>
        )}
      </div>
    </div>
  );
}
