import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, RefreshCw, BarChart3, AlertTriangle, Target, Search, X, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { analyticsApi, type ProductPerformance as ShipmentPerformance } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";

const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n}%`;

type SortMode = "profit" | "loss" | "returns";

const SORT_LABELS: Record<SortMode, string> = {
  profit: "أعلى ربح",
  loss: "أعلى خسارة",
  returns: "أعلى مرتجعات",
};

// alias للتوافق مع الكود الموجود
type ProductPerformance = ShipmentPerformance;

function ProfitBar({ value, max }: { value: number; max: number }) {
  if (max === 0) return null;
  const pct = Math.min(100, Math.abs(value) / Math.abs(max) * 100);
  const isNeg = value < 0;
  return (
    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${isNeg ? "bg-red-500" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ProductRow({ p, maxProfit, maxLoss, sort }: {
  p: ProductPerformance; maxProfit: number; maxLoss: number; sort: SortMode;
}) {
  const isLosing = p.netProfit < 0;
  const barMax = sort === "loss" ? maxLoss : maxProfit;

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 mb-1">
          {/* صورة المنتج الدائرية */}
          {p.image ? (
            <img
              src={p.image}
              alt={p.name}
              className="w-8 h-8 rounded-full object-cover border-2 shrink-0"
              style={{ borderColor: isLosing ? "rgba(248,113,113,0.4)" : "rgba(var(--primary),0.4)" }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black"
              style={{
                background: isLosing
                  ? "linear-gradient(135deg, rgba(248,113,113,0.2), rgba(239,68,68,0.1))"
                  : "linear-gradient(135deg, rgba(var(--primary),0.2), rgba(var(--primary),0.05))",
                border: isLosing ? "1.5px solid rgba(248,113,113,0.35)" : "1.5px solid rgba(var(--primary),0.3)",
                color: isLosing ? "rgba(248,113,113,0.9)" : "rgba(var(--primary),0.9)",
              }}>
              {p.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-bold text-foreground truncate">{p.name}</span>
          {p.returnRate >= 30 && (
            <Badge variant="outline" className="text-[9px] border-red-400 text-red-700 dark:border-red-800 dark:text-red-400 shrink-0">
              {p.returnRate}% مرتجع
            </Badge>
          )}
          {isLosing && (
            <Badge variant="outline" className="text-[9px] border-red-400 text-red-700 dark:border-red-800 dark:text-red-400 shrink-0">خاسر</Badge>
          )}
          {p.margin >= 40 && !isLosing && (
            <Badge variant="outline" className="text-[9px] border-primary text-primary shrink-0">هامش ممتاز</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
          <span>{p.totalOrders} طلب</span>
          <span>·</span>
          <span>{p.totalSalesQty} وحدة مباعة</span>
          {p.returnCount > 0 && <><span>·</span><span className="text-red-600 dark:text-red-400">{p.returnCount} مرتجع</span></>}
          <span>·</span>
          <span>هامش {pct(p.margin)}</span>
          <span>·</span>
          <span>ROI {pct(p.roi)}</span>
        </div>
        <ProfitBar value={p.netProfit} max={barMax} />
      </div>

      <div className="text-left shrink-0 flex flex-col items-end justify-center gap-0.5">
        <p className={`text-base font-black ${isLosing ? "text-red-600 dark:text-red-400" : "text-primary"}`}>
          {fc(p.netProfit)}
        </p>
        <p className="text-[9px] text-muted-foreground">إيرادات {fc(p.totalRevenue)}</p>
        {p.returnCostLoss > 0 && (
          <p className="text-[9px] text-red-600/70 dark:text-red-400/70">خسارة مرتجع {fc(p.returnCostLoss)}</p>
        )}
      </div>
    </div>
  );
}

export default function ShipmentPerformancePage() {
  const { can, isAdmin } = useAuth();
  const [, navigate] = useLocation();
  const [sort, setSort] = useState<SortMode>("profit");

  // ── فلاتر البحث ──────────────────────────────────────────────────────────
  const [search, setSearch]                   = useState("");
  const [showAdvanced, setShowAdvanced]       = useState(false);
  const [filterStatus, setFilterStatus]       = useState<"all" | "profit" | "loss" | "high_return">("all");
  const [filterMarginMin, setFilterMarginMin] = useState("");
  const [filterMarginMax, setFilterMarginMax] = useState("");
  const [filterRevenueMin, setFilterRevenueMin] = useState("");
  const debouncedSearch = useDebounce(search, 250);

  if (!isAdmin && !can("analytics.products")) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <BarChart3 className="w-10 h-10 opacity-20" />
        <p className="text-sm font-bold">ليس لديك صلاحية لعرض هذه الصفحة</p>
        <button onClick={() => navigate("/")} className="text-xs text-primary hover:underline">العودة للرئيسية</button>
      </div>
    );
  }

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["shipment-performance"],
    queryFn: analyticsApi.productPerformance,
    staleTime: 5 * 60 * 1000,        // ✅ البيانات تفضل valid 5 دقايق
    gcTime: 10 * 60 * 1000,          // ✅ تتحفظ في الكاش 10 دقايق
    placeholderData: (prev) => prev,  // ✅ تعرض البيانات القديمة فوراً أثناء التحديث
    refetchOnWindowFocus: false,      // ✅ متعيدش التحميل لما المستخدم يرجع للتاب
  });

  // أول تحميل فقط (مفيش بيانات في الكاش) — نعرض skeleton
  if (isLoading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-lg" />)}
        </div>
        <div className="h-12 bg-muted rounded-lg" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-600 dark:text-red-400 text-sm">
        خطأ في تحميل البيانات
      </div>
    );
  }

  const list = sort === "profit" ? data.byProfit : sort === "loss" ? data.byLoss : data.byReturns;
  const maxProfit = Math.max(...data.byProfit.map(p => p.netProfit), 1);
  const maxLoss = Math.max(...(data.byLoss.map(p => Math.abs(p.netProfit))), 1);

  // ── تطبيق الفلاتر ────────────────────────────────────────────────────────
  const applyFilters = (arr: ProductPerformance[]) => arr.filter(p => {
    if (debouncedSearch && !p.name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    if (filterStatus === "profit"      && p.netProfit <= 0) return false;
    if (filterStatus === "loss"        && p.netProfit >= 0) return false;
    if (filterStatus === "high_return" && p.returnRate < 30) return false;
    if (filterMarginMin && p.margin < parseFloat(filterMarginMin)) return false;
    if (filterMarginMax && p.margin > parseFloat(filterMarginMax)) return false;
    if (filterRevenueMin && p.totalRevenue < parseFloat(filterRevenueMin)) return false;
    return true;
  });

  const filteredList     = applyFilters(list);
  const filteredProducts = applyFilters(data.products);

  const hasFilter    = search || filterStatus !== "all" || filterMarginMin || filterMarginMax || filterRevenueMin;
  const advancedCount = [filterStatus !== "all", filterMarginMin, filterMarginMax, filterRevenueMin].filter(Boolean).length;

  const clearFilters = () => {
    setSearch(""); setFilterStatus("all");
    setFilterMarginMin(""); setFilterMarginMax(""); setFilterRevenueMin("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">أداء الشحنات</h1>
          <p className="text-xs text-muted-foreground mt-0.5">تحليل مالي شامل لكل شحنة</p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 relative"
          title="تحديث البيانات"
        >
          <RefreshCw className={`w-4 h-4 transition-transform ${isFetching ? "animate-spin text-primary" : ""}`} />
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">إجمالي الشحنات</p>
            <p className="text-2xl font-black text-foreground">{data.summary.totalProducts}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">شحنات رابحة</p>
            <p className="text-2xl font-black text-primary">{data.summary.profitableCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">شحنات خاسرة</p>
            <p className="text-2xl font-black text-red-600 dark:text-red-400">{data.summary.losingCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">مرتجعات عالية</p>
            <p className="text-2xl font-black text-amber-700 dark:text-amber-400">{data.summary.highReturnCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── شريط البحث والفلاتر ── */}
      <div className="rounded-lg border border-border bg-muted/5 p-3 space-y-2">
        {/* صف البحث */}
        <div className="flex gap-2 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="ابحث باسم الشحنة..."
              className="pr-9 h-9 text-sm bg-card"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-md border text-xs font-bold transition-colors shrink-0 ${
              showAdvanced
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            فلتر متقدم
            {advancedCount > 0 && (
              <span className={`rounded-full w-4 h-4 text-[9px] font-black flex items-center justify-center ${showAdvanced ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}>
                {advancedCount}
              </span>
            )}
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {hasFilter && (
            <button onClick={clearFilters} className="flex items-center gap-1 px-2 h-9 text-xs text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3 h-3" />مسح
            </button>
          )}
        </div>

        {/* فلاتر متقدمة */}
        {showAdvanced && (
          <div className="pt-2 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* حالة المنتج */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold">📊 حالة الشحنة</p>
              <div className="flex gap-1 flex-wrap">
                {(["all", "profit", "loss", "high_return"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                      filterStatus === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {s === "all" ? "الكل" : s === "profit" ? "✅ رابح" : s === "loss" ? "❌ خاسر" : "⚠️ مرتجعات عالية"}
                  </button>
                ))}
              </div>
            </div>

            {/* نطاق الهامش */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold">💹 نطاق الهامش %</p>
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="من" className="h-7 text-xs bg-background w-20" value={filterMarginMin} onChange={e => setFilterMarginMin(e.target.value)} />
                <span className="text-xs text-muted-foreground">—</span>
                <Input type="number" placeholder="إلى" className="h-7 text-xs bg-background w-20" value={filterMarginMax} onChange={e => setFilterMarginMax(e.target.value)} />
              </div>
            </div>

            {/* حد أدنى للإيرادات */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold">💰 حد أدنى للإيرادات (ج.م)</p>
              <Input type="number" placeholder="مثلاً: 5000" className="h-7 text-xs bg-background w-36" value={filterRevenueMin} onChange={e => setFilterRevenueMin(e.target.value)} />
            </div>
          </div>
        )}

        {/* إحصاء */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
          <span>
            {hasFilter
              ? `${filteredProducts.length} من ${data.products.length} شحنة`
              : `${data.products.length} شحنة`}
          </span>
          {filteredProducts.length > 0 && (
            <span className="text-primary font-bold">
              إجمالي الإيرادات: {fc(filteredProducts.reduce((s, p) => s + p.totalRevenue, 0))}
            </span>
          )}
        </div>
      </div>

      {/* Sort tabs + table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              تصنيف الشحنات
            </CardTitle>
            <div className="flex rounded-md border border-border overflow-hidden text-[11px] font-semibold">
              {(["profit", "loss", "returns"] as SortMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setSort(m)}
                  className={`px-3 py-1.5 transition-colors ${
                    sort === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {SORT_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {hasFilter ? "لا توجد نتائج — جرّب تغيير الفلاتر" : sort === "loss" ? "لا توجد شحنات خاسرة" : sort === "returns" ? "لا توجد مرتجعات" : "لا توجد بيانات"}
            </div>
          ) : (
            <div className="px-4">
              {filteredList.map(p => (
                <ProductRow
                  key={p.name}
                  p={p}
                  maxProfit={maxProfit}
                  maxLoss={maxLoss}
                  sort={sort}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            جدول تفصيلي — كل الشحنات
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">الشحنة</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">طلبات</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">مباع</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">مرتجع%</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">إيرادات</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">تكاليف</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">صافي الربح</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">هامش</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">ROI</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const isLosing = p.netProfit < 0;
                return (
                  <tr key={p.name} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {/* صورة دائرية */}
                        {p.image ? (
                          <img src={p.image} alt={p.name}
                            className="w-7 h-7 rounded-full object-cover shrink-0 border"
                            style={{ borderColor: isLosing ? "rgba(248,113,113,0.35)" : "rgba(var(--primary),0.35)" }} />
                        ) : (
                          <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black"
                            style={{
                              background: isLosing ? "rgba(248,113,113,0.15)" : "rgba(var(--primary),0.12)",
                              border: isLosing ? "1px solid rgba(248,113,113,0.3)" : "1px solid rgba(var(--primary),0.25)",
                              color: isLosing ? "rgba(248,113,113,0.9)" : "rgba(var(--primary),0.9)",
                            }}>
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {isLosing
                          ? <TrendingDown className="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" />
                          : <TrendingUp className="w-3 h-3 text-primary shrink-0" />
                        }
                        <span className="font-semibold text-foreground">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{p.totalOrders}</td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{p.totalSalesQty}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={p.returnRate >= 30 ? "text-red-600 dark:text-red-400 font-bold" : "text-muted-foreground"}>
                        {p.returnRate}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-left text-foreground">{fc(p.totalRevenue)}</td>
                    <td className="px-3 py-2.5 text-left text-muted-foreground">{fc(p.totalCost + p.totalShipping)}</td>
                    <td className="px-3 py-2.5 text-left">
                      <span className={`font-bold ${isLosing ? "text-red-600 dark:text-red-400" : "text-primary"}`}>
                        {fc(p.netProfit)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={p.margin < 10 ? "text-amber-700 dark:text-amber-400" : p.margin >= 40 ? "text-primary font-bold" : "text-muted-foreground"}>
                        {p.margin}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={p.roi < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                        {p.roi}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
