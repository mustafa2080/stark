import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useState, useMemo } from "react";
import {
  ArrowRight, FileText, Lock, LockOpen, Package, CheckCircle2,
  Clock, RotateCcw, AlertCircle, Printer, Search, Truck, MapPin, Phone,
  PackageX, Sparkles, Layers,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const formatCurrency = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);

interface ManifestItem {
  id: number;
  shipmentId: number;
  deliveryStatus: "pending" | "delivered" | "returned" | "delayed" | "partial_delivered";
  deliveryNote: string | null;
  partialQuantity: number | null;
  returnReceived: number | null;
  addedAt: string;
  customerName: string;
  phone: string;
  city: string;
  address: string;
  quantity: number;
  totalPrice: number;
  shippingCost: number;
  invoiceNumber: string;
  representativeName: string | null;
  warehouseName: string | null;
}

interface ManifestDetail {
  id: number;
  manifestNumber: string;
  status: "open" | "closed";
  notes: string | null;
  createdAt: string;
  closedAt: string | null;
  items: ManifestItem[];
  stats: { total: number; delivered: number; returned: number; pending: number; delayed: number; partial: number };
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:           { label: "قيد الانتظار", color: "text-muted-foreground",  bg: "border-border" },
  delivered:         { label: "مسلَّم ✓",      color: "text-emerald-400",       bg: "border-emerald-700 bg-emerald-900/20" },
  partial_delivered: { label: "مسلَّم جزئي",   color: "text-teal-400",          bg: "border-teal-700 bg-teal-900/20" },
  delayed:           { label: "مؤجل",          color: "text-orange-400",        bg: "border-orange-700 bg-orange-900/20" },
  returned:          { label: "مرتجع",         color: "text-red-400",           bg: "border-red-700 bg-red-900/20" },
};

export default function ClientManifestViewPage() {
  const params = useParams();
  const id = Number(params.id);
  const [search, setSearch] = useState("");

  const { data: manifest, isLoading, error } = useQuery<ManifestDetail>({
    queryKey: ["client-portal-manifest", id],
    queryFn: () => apiFetch(`/client-portal/manifests/${id}`),
    enabled: !isNaN(id),
  });

  const filteredItems = useMemo(() => {
    if (!manifest) return [];
    if (!search.trim()) return manifest.items;
    const q = search.trim().toLowerCase();
    return manifest.items.filter(i =>
      i.customerName?.toLowerCase().includes(q) ||
      i.phone?.includes(q) ||
      i.invoiceNumber?.toLowerCase().includes(q)
    );
  }, [manifest, search]);

  const stillAtShipping = useMemo(() => {
    if (!manifest) return [];
    return manifest.items.filter(i =>
      i.deliveryStatus === "delayed" ||
      (i.deliveryStatus === "returned" && i.returnReceived !== 1) ||
      (i.deliveryStatus === "partial_delivered" && i.returnReceived !== 1)
    );
  }, [manifest]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">جاري التحميل...</div>;
  }
  if (error || !manifest) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p>تعذر جلب بيانات هذا البيان</p>
        <Link href="/client-manifests" className="text-primary text-xs font-bold">العودة لبياناتي</Link>
      </div>
    );
  }

  const sc = manifest.stats;
  const completed = sc.delivered + sc.partial;
  const deliveryPct = sc.total > 0 ? Math.round((completed / sc.total) * 100) : 0;
  const isOpen = manifest.status === "open";
  const returnedNotArrived = manifest.items.filter(
    (i) => i.deliveryStatus === "returned" && i.returnReceived !== 1
  ).length;
  const newItemsCount = manifest.items.filter((i) => {
    if (!i.addedAt) return false;
    const addedTime = new Date(i.addedAt).getTime();
    return Date.now() - addedTime <= 24 * 60 * 60 * 1000;
  }).length;
  const totalCod = manifest.items.reduce((s, i) => s + Number(i.totalPrice || 0), 0);
  const totalShippingCost = manifest.items.reduce((s, i) => s + Number(i.shippingCost || 0), 0);

  // توزيع الشحنات على المخازن والمندوبين — بيانات موجودة أصلاً من الـ API ومش معروضة سابقًا
  const warehouseMap = new Map<string, number>();
  manifest.items.forEach((i) => {
    const name = i.warehouseName || "غير محدد";
    warehouseMap.set(name, (warehouseMap.get(name) || 0) + 1);
  });
  const warehouseBreakdown = Array.from(warehouseMap.entries()).sort((a, b) => b[1] - a[1]);

  const repMap = new Map<string, number>();
  manifest.items.forEach((i) => {
    const name = i.representativeName || "غير محدد";
    repMap.set(name, (repMap.get(name) || 0) + 1);
  });
  const representativeBreakdown = Array.from(repMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <>
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background print:hidden" dir="rtl">
      <div className="max-w-[1200px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted/40 via-muted/10 to-transparent p-4 sm:p-5">
          <div className={`absolute -top-10 -left-10 w-40 h-40 rounded-full blur-3xl opacity-40 ${isOpen ? "bg-emerald-500/30" : "bg-slate-400/20"}`} />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Link href="/client-manifests">
                <button className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted/40 border border-border hover:bg-muted/60 hover:border-primary/40 transition-all">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">{manifest.manifestNumber}</h1>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm ${
                    isOpen
                      ? "bg-emerald-900/30 text-emerald-400 border border-emerald-700/60 shadow-emerald-900/30"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}>
                    {isOpen ? <LockOpen className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                    {isOpen ? "مفتوح" : "مغلق"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                  {format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}
                  {manifest.closedAt && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                      أُغلق في {format(new Date(manifest.closedAt), "d MMMM yyyy", { locale: ar })}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border hover:bg-muted/60 hover:border-primary/30 transition-all shadow-sm"
            >
              <Printer size={15} /> طباعة
            </button>
          </div>
        </div>

        {/* ── Highlight cards (مؤجل / مرتجع لم يصل / الشحنات الجديدة / الإجمالي) — بس للبيان المفتوح ── */}
        {isOpen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <HighlightCard
              icon={Clock}
              value={sc.delayed}
              label="مؤجل"
              tone="amber"
            />
            <HighlightCard
              icon={PackageX}
              value={returnedNotArrived}
              label="مرتجع لم يصل"
              tone="rose"
            />
            <HighlightCard
              icon={Sparkles}
              value={newItemsCount}
              label="الشحنات الجديدة"
              tone="sky"
            />
            <HighlightCard
              icon={Layers}
              value={sc.total}
              label="الإجمالي"
              tone="violet"
            />
          </div>
        )}

        {/* ── Stats cards — بس للبيان المفتوح ── */}
        {isOpen && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard icon={Package} value={sc.total} label="إجمالي الشحنات" tone="violet" />
            <StatCard icon={CheckCircle2} value={sc.delivered} label="مسلَّم" tone="emerald" />
            <StatCard icon={Clock} value={sc.pending} label="قيد الانتظار" tone="muted" />
            <StatCard icon={AlertCircle} value={sc.delayed} label="مؤجل" tone="orange" />
            <StatCard icon={RotateCcw} value={sc.returned} label="مرتجع" tone="red" />
          </div>
        )}

        {/* ── توزيع المخازن والمندوبين — بس للبيان المفتوح ولو فيه أكتر من مصدر واحد ── */}
        {isOpen && (warehouseBreakdown.length > 1 || representativeBreakdown.length > 1) && (
          <div className="grid sm:grid-cols-2 gap-3">
            {warehouseBreakdown.length > 1 && (
              <BreakdownCard title="توزيع الشحنات على المخازن" icon={Layers} tone="sky" data={warehouseBreakdown} total={sc.total} />
            )}
            {representativeBreakdown.length > 1 && (
              <BreakdownCard title="توزيع الشحنات على المندوبين" icon={Truck} tone="violet" data={representativeBreakdown} total={sc.total} />
            )}
          </div>
        )}

        {/* ── Closed manifest summary — عرض بسيط واحترافي بدون إحصائيات متابعة لحظية ── */}
        {!isOpen && (
          <div className="rounded-2xl border border-border bg-muted/15 p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="text-sm font-black text-foreground">ملخص البيان النهائي</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">إجمالي الشحنات</p>
                <p className="text-lg font-black">{sc.total}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">مسلَّم</p>
                <p className="text-lg font-black text-emerald-400">{sc.delivered}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">مرتجع</p>
                <p className="text-lg font-black text-red-400">{sc.returned}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">نسبة التسليم</p>
                <p className="text-lg font-black text-foreground">{deliveryPct}%</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Progress bar — بس للبيان المفتوح ── */}
        {isOpen && (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted/25 to-transparent p-4 shadow-md shadow-black/10">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground font-bold">نسبة التسليم</span>
              <span className="font-black text-emerald-400 text-lg drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]">{deliveryPct}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-l from-emerald-400 to-emerald-600 rounded-full transition-all shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                style={{ width: `${deliveryPct}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Financial summary ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-emerald-500/[0.03] to-transparent p-4 shadow-lg shadow-black/10">
            <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full blur-3xl opacity-50 bg-emerald-500/20" />
            <p className="relative text-[11px] text-muted-foreground mb-1">إجمالي قيمة الشحنات</p>
            <p className="relative text-xl font-black text-emerald-300">{formatCurrency(totalCod)}</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-sky-500/[0.03] to-transparent p-4 shadow-lg shadow-black/10">
            <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full blur-3xl opacity-50 bg-sky-500/20" />
            <p className="relative text-[11px] text-muted-foreground mb-1">إجمالي تكلفة الشحن</p>
            <p className="relative text-xl font-black text-sky-300">{formatCurrency(totalShippingCost)}</p>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم العميل أو رقم الشحنة أو الهاتف..."
            className="w-full h-11 rounded-xl bg-muted/25 border border-border pr-10 pl-3 text-sm outline-none focus:border-primary/50 focus:bg-muted/35 focus:shadow-[0_0_0_3px_rgba(var(--primary-rgb,59,130,246),0.1)] transition-all"
          />
        </div>

        {/* ── Table ── */}
        <div className="rounded-2xl border border-border bg-muted/10 overflow-hidden shadow-lg shadow-black/10">
          <div className="px-4 py-3.5 border-b border-border flex items-center justify-between bg-gradient-to-l from-muted/30 to-transparent">
            <p className="text-sm font-black flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              الشحنات في البيان
            </p>
            <span className="text-[11px] text-muted-foreground font-bold px-2.5 py-1 rounded-full bg-muted/40 border border-border/60">{filteredItems.length} شحنة</span>
          </div>

          <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_90px_100px_110px] gap-0 px-4 py-2 text-[11px] font-bold text-muted-foreground border-b border-border/60 bg-muted/20">
            <span>العميل</span>
            <span>العنوان</span>
            <span>رقم الشحنة</span>
            <span className="text-center">القطع</span>
            <span className="text-left">الإجمالي</span>
            <span className="text-center">الحالة</span>
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">لا توجد نتائج مطابقة</div>
          ) : (
            filteredItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))
          )}
        </div>

        {/* ── بضاعة لسه مع مندوب الشحن ── */}
        {stillAtShipping.length > 0 && (
          <div className="relative overflow-hidden rounded-2xl border border-orange-700/50 bg-gradient-to-br from-orange-950/30 via-orange-950/10 to-transparent shadow-lg shadow-black/10">
            <div className="absolute -top-8 -left-8 w-28 h-28 rounded-full blur-3xl opacity-30 bg-orange-500/30" />
            <div className="relative px-4 py-3 border-b border-orange-800/40 flex items-center gap-2">
              <Truck className="w-4 h-4 text-orange-400" />
              <p className="text-sm font-black text-orange-300">
                بضاعة لسه مع مندوب الشحن ({stillAtShipping.length})
              </p>
            </div>
            {stillAtShipping.map((item) => (
              <div key={item.id} className="px-4 py-3 border-b border-orange-800/20 last:border-0 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{item.customerName}</p>
                  <p className="text-[11px] text-muted-foreground">{item.phone} — {item.invoiceNumber}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${STATUS_META[item.deliveryStatus]?.bg} ${STATUS_META[item.deliveryStatus]?.color}`}>
                  {STATUS_META[item.deliveryStatus]?.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    <PrintDocument
      manifest={manifest}
      items={manifest.items}
      sc={sc}
      deliveryPct={deliveryPct}
      totalCod={totalCod}
      totalShippingCost={totalShippingCost}
      isOpen={isOpen}
    />
    </>
  );
}

function HighlightCard({ icon: Icon, value, label, tone }: {
  icon: React.ElementType; value: number; label: string;
  tone: "amber" | "rose" | "sky" | "violet";
}) {
  const toneStyles = {
    amber: {
      wrap: "from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/30",
      glow: "bg-amber-500/25",
      icon: "text-amber-400",
      value: "text-amber-300",
      iconBg: "bg-amber-500/15 border-amber-500/30",
    },
    rose: {
      wrap: "from-rose-500/15 via-rose-500/5 to-transparent border-rose-500/30",
      glow: "bg-rose-500/25",
      icon: "text-rose-400",
      value: "text-rose-300",
      iconBg: "bg-rose-500/15 border-rose-500/30",
    },
    sky: {
      wrap: "from-sky-500/15 via-sky-500/5 to-transparent border-sky-500/30",
      glow: "bg-sky-500/25",
      icon: "text-sky-400",
      value: "text-sky-300",
      iconBg: "bg-sky-500/15 border-sky-500/30",
    },
    violet: {
      wrap: "from-violet-500/15 via-violet-500/5 to-transparent border-violet-500/30",
      glow: "bg-violet-500/25",
      icon: "text-violet-400",
      value: "text-violet-300",
      iconBg: "bg-violet-500/15 border-violet-500/30",
    },
  }[tone];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${toneStyles.wrap} p-4 shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 hover:shadow-xl`}
    >
      {/* glow blob */}
      <div className={`absolute -top-6 -left-6 w-20 h-20 rounded-full blur-2xl opacity-60 ${toneStyles.glow}`} />
      <div className="relative flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${toneStyles.iconBg}`}>
          <Icon className={`w-5 h-5 ${toneStyles.icon}`} />
        </div>
        <div className="min-w-0">
          <p className={`text-2xl font-black leading-none ${toneStyles.value}`}>{value}</p>
          <p className="text-[11px] text-muted-foreground mt-1 truncate">{label}</p>
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({ title, icon: Icon, tone, data, total }: {
  title: string;
  icon: React.ElementType;
  tone: "sky" | "violet";
  data: [string, number][];
  total: number;
}) {
  const toneStyles = {
    sky: { border: "border-sky-500/25", glow: "bg-sky-500/20", icon: "text-sky-400", bar: "from-sky-400 to-sky-600" },
    violet: { border: "border-violet-500/25", glow: "bg-violet-500/20", icon: "text-violet-400", bar: "from-violet-400 to-violet-600" },
  }[tone];

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${toneStyles.border} bg-gradient-to-br from-muted/25 to-transparent p-4 shadow-lg shadow-black/10`}>
      <div className={`absolute -top-6 -left-6 w-24 h-24 rounded-full blur-3xl opacity-40 ${toneStyles.glow}`} />
      <div className="relative flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${toneStyles.icon}`} />
        <p className="text-sm font-black text-foreground">{title}</p>
      </div>
      <div className="relative space-y-2">
        {data.slice(0, 5).map(([name, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={name}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-foreground/80 font-bold truncate">{name}</span>
                <span className="text-muted-foreground shrink-0">{count} ({pct}%)</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full bg-gradient-to-l ${toneStyles.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, value, label, tone = "default" }: {
  icon: React.ElementType; value: number; label: string;
  tone?: "default" | "emerald" | "orange" | "red" | "muted" | "violet";
}) {
  const toneStyles = {
    default: {
      wrap: "from-slate-500/15 via-slate-500/5 to-transparent border-slate-500/30",
      glow: "bg-slate-400/25",
      icon: "text-slate-300",
      value: "text-foreground",
      iconBg: "bg-slate-500/15 border-slate-500/30",
    },
    emerald: {
      wrap: "from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/30",
      glow: "bg-emerald-500/25",
      icon: "text-emerald-400",
      value: "text-emerald-300",
      iconBg: "bg-emerald-500/15 border-emerald-500/30",
    },
    orange: {
      wrap: "from-orange-500/15 via-orange-500/5 to-transparent border-orange-500/30",
      glow: "bg-orange-500/25",
      icon: "text-orange-400",
      value: "text-orange-300",
      iconBg: "bg-orange-500/15 border-orange-500/30",
    },
    red: {
      wrap: "from-red-500/15 via-red-500/5 to-transparent border-red-500/30",
      glow: "bg-red-500/25",
      icon: "text-red-400",
      value: "text-red-300",
      iconBg: "bg-red-500/15 border-red-500/30",
    },
    muted: {
      wrap: "from-gray-500/15 via-gray-500/5 to-transparent border-gray-500/30",
      glow: "bg-gray-400/20",
      icon: "text-muted-foreground",
      value: "text-foreground",
      iconBg: "bg-gray-500/15 border-gray-500/30",
    },
    violet: {
      wrap: "from-violet-500/15 via-violet-500/5 to-transparent border-violet-500/30",
      glow: "bg-violet-500/25",
      icon: "text-violet-400",
      value: "text-violet-300",
      iconBg: "bg-violet-500/15 border-violet-500/30",
    },
  }[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${toneStyles.wrap} p-3 flex flex-col items-center gap-1.5 shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 hover:shadow-xl`}
    >
      <div className={`absolute -top-5 -left-5 w-16 h-16 rounded-full blur-2xl opacity-60 ${toneStyles.glow}`} />
      <div className={`relative w-8 h-8 rounded-lg border flex items-center justify-center ${toneStyles.iconBg}`}>
        <Icon className={`w-4 h-4 ${toneStyles.icon}`} />
      </div>
      <span className={`relative text-xl font-black ${toneStyles.value}`}>{value}</span>
      <span className="relative text-[10px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function ItemRow({ item }: { item: ManifestItem }) {
  const meta = STATUS_META[item.deliveryStatus] ?? STATUS_META.pending;
  return (
    <>
      <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_90px_100px_110px] gap-0 px-4 py-3 text-xs items-center border-b border-border/40 hover:bg-muted/10 transition-colors">
        <div className="min-w-0 pr-2">
          <p className="font-bold truncate">{item.customerName}</p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Phone className="w-2.5 h-2.5" />{item.phone}
          </p>
        </div>
        <div className="min-w-0 pr-2 flex items-start gap-1">
          <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <span className="truncate text-muted-foreground">{item.city}{item.address ? ` — ${item.address}` : ""}</span>
        </div>
        <div className="min-w-0 pr-2 font-mono text-[11px] text-muted-foreground">{item.invoiceNumber}</div>
        <div className="text-center font-bold">
          {item.deliveryStatus === "partial_delivered" && item.partialQuantity != null
            ? <span><span className="text-teal-400">{item.partialQuantity}</span><span className="text-muted-foreground">/{item.quantity}</span></span>
            : item.quantity}
        </div>
        <div className="text-left font-bold">{formatCurrency(item.totalPrice)}</div>
        <div className="text-center">
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${meta.bg} ${meta.color}`}>
            {meta.label}
          </span>
          {item.deliveryStatus === "delayed" && item.deliveryNote && (
            <p className="text-[9px] text-orange-400 mt-1 truncate">⏸ {item.deliveryNote}</p>
          )}
        </div>
      </div>

      <div className="md:hidden px-4 py-3 border-b border-border/40 flex flex-col gap-1.5 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold truncate">{item.customerName}</p>
            <p className="text-[10px] text-muted-foreground">{item.phone}</p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${meta.bg} ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5" />{item.city}{item.address ? ` — ${item.address}` : ""}
        </p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground">{item.invoiceNumber}</span>
          <div className="flex items-center gap-2">
            <span className="font-bold">{item.quantity} قطعة</span>
            <span className="font-bold text-primary">{formatCurrency(item.totalPrice)}</span>
          </div>
        </div>
        {item.deliveryStatus === "delayed" && item.deliveryNote && (
          <p className="text-[10px] text-orange-400">⏸ {item.deliveryNote}</p>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ── PrintDocument — قالب طباعة رسمي منفصل تمامًا عن عرض الشاشة.
// أبيض/أسود، بدون ألوان أو ظلال أو gradients، مُخصص للورق A4 مع ترويسة
// وتذييل وتوقيعات — يظهر فقط أثناء الطباعة (hidden print:block) ---
// ─────────────────────────────────────────────────────────────────────────
function PrintDocument({ manifest, items, sc, deliveryPct, totalCod, totalShippingCost, isOpen }: {
  manifest: ManifestDetail;
  items: ManifestItem[];
  sc: ManifestDetail["stats"];
  deliveryPct: number;
  totalCod: number;
  totalShippingCost: number;
  isOpen: boolean;
}) {
  const PRINT_STATUS_LABEL: Record<string, string> = {
    pending: "قيد الانتظار",
    delivered: "مسلَّم",
    partial_delivered: "مسلَّم جزئي",
    delayed: "مؤجل",
    returned: "مرتجع",
  };

  return (
    <div className="hidden print:block" dir="rtl">
      <div className="print-doc">
        {/* ── ترويسة رسمية ── */}
        <div className="print-header">
          <div className="print-header-brand">
            <div className="print-logo">STARK</div>
            <div className="print-brand-text">
              <p className="print-brand-name">Stark Shipping &amp; Logistics</p>
              <p className="print-brand-sub">نظام إدارة الشحن والبيانات</p>
            </div>
          </div>
          <div className="print-header-meta">
            <p className="print-doc-title">بيان شحن</p>
            <p className="print-doc-number">{manifest.manifestNumber}</p>
          </div>
        </div>

        <div className="print-divider" />

        {/* ── معلومات البيان ── */}
        <div className="print-info-grid">
          <div className="print-info-item">
            <span className="print-info-label">تاريخ الإنشاء</span>
            <span className="print-info-value">{format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}</span>
          </div>
          <div className="print-info-item">
            <span className="print-info-label">الحالة</span>
            <span className="print-info-value">{isOpen ? "مفتوح" : "مغلق"}</span>
          </div>
          {manifest.closedAt && (
            <div className="print-info-item">
              <span className="print-info-label">تاريخ الإغلاق</span>
              <span className="print-info-value">{format(new Date(manifest.closedAt), "d MMMM yyyy", { locale: ar })}</span>
            </div>
          )}
          <div className="print-info-item">
            <span className="print-info-label">إجمالي الشحنات</span>
            <span className="print-info-value">{sc.total}</span>
          </div>
        </div>

        {/* ── ملخص إحصائي ── */}
        <table className="print-summary-table">
          <tbody>
            <tr>
              <td className="print-summary-label">مسلَّم</td>
              <td className="print-summary-value">{sc.delivered}</td>
              <td className="print-summary-label">قيد الانتظار</td>
              <td className="print-summary-value">{sc.pending}</td>
              <td className="print-summary-label">مؤجل</td>
              <td className="print-summary-value">{sc.delayed}</td>
              <td className="print-summary-label">مرتجع</td>
              <td className="print-summary-value">{sc.returned}</td>
              <td className="print-summary-label">نسبة التسليم</td>
              <td className="print-summary-value">{deliveryPct}%</td>
            </tr>
          </tbody>
        </table>

        {/* ── جدول الشحنات ── */}
        <table className="print-items-table">
          <thead>
            <tr>
              <th style={{ width: "22px" }}>#</th>
              <th style={{ width: "15%" }}>اسم العميل</th>
              <th style={{ width: "13%" }}>الهاتف</th>
              <th style={{ width: "26%" }}>العنوان</th>
              <th style={{ width: "13%" }}>رقم الشحنة</th>
              <th style={{ width: "36px" }}>القطع</th>
              <th style={{ width: "65px" }}>الإجمالي</th>
              <th style={{ width: "60px" }}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id}>
                <td className="print-cell-center">{idx + 1}</td>
                <td>{item.customerName}</td>
                <td className="print-cell-ltr">{item.phone}</td>
                <td>{item.city}{item.address ? ` — ${item.address}` : ""}</td>
                <td className="print-cell-mono">{item.invoiceNumber}</td>
                <td className="print-cell-center">
                  {item.deliveryStatus === "partial_delivered" && item.partialQuantity != null
                    ? `${item.partialQuantity}/${item.quantity}`
                    : item.quantity}
                </td>
                <td className="print-cell-center">{formatCurrency(item.totalPrice)}</td>
                <td className="print-cell-center">{PRINT_STATUS_LABEL[item.deliveryStatus] ?? item.deliveryStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── الملخص المالي النهائي ── */}
        <table className="print-financial-table">
          <tbody>
            <tr>
              <td className="print-financial-label">إجمالي قيمة الشحنات</td>
              <td className="print-financial-value">{formatCurrency(totalCod)}</td>
            </tr>
            <tr>
              <td className="print-financial-label">إجمالي تكلفة الشحن</td>
              <td className="print-financial-value">{formatCurrency(totalShippingCost)}</td>
            </tr>
          </tbody>
        </table>

        {/* ── التوقيعات ── */}
        <div className="print-signatures">
          <div className="print-signature-block">
            <p className="print-signature-label">توقيع المندوب</p>
            <div className="print-signature-line" />
          </div>
          <div className="print-signature-block">
            <p className="print-signature-label">توقيع العميل</p>
            <div className="print-signature-line" />
          </div>
        </div>

        {/* ── تذييل ── */}
        <div className="print-footer">
          <span>تم إنشاء هذا المستند إلكترونيًا بواسطة نظام Stark لإدارة الشحن</span>
          <span>{format(new Date(), "d MMMM yyyy — HH:mm", { locale: ar })}</span>
        </div>
      </div>

      {/* ── أنماط الطباعة ── */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm 12mm;
          }
          html, body {
            background: #ffffff !important;
          }
        }

        .print-doc {
          font-family: "Segoe UI", Tahoma, Arial, sans-serif;
          color: #111111;
          background: #ffffff;
          width: 100%;
        }

        .print-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 10px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .print-header-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .print-logo {
          width: 44px;
          height: 44px;
          border: 2px solid #111111;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 12px;
          letter-spacing: 0.5px;
        }
        .print-brand-name {
          font-weight: 900;
          font-size: 15px;
          margin: 0;
        }
        .print-brand-sub {
          font-size: 10px;
          color: #555555;
          margin: 2px 0 0;
        }
        .print-header-meta {
          text-align: left;
        }
        .print-doc-title {
          font-size: 11px;
          color: #555555;
          margin: 0;
          font-weight: 700;
        }
        .print-doc-number {
          font-size: 18px;
          font-weight: 900;
          margin: 2px 0 0;
        }

        .print-divider {
          border-bottom: 2px solid #111111;
          margin-bottom: 12px;
        }

        .print-info-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 14px;
          padding: 10px 12px;
          border: 1px solid #cccccc;
          border-radius: 6px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .print-info-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .print-info-label {
          font-size: 9px;
          color: #666666;
          font-weight: 700;
        }
        .print-info-value {
          font-size: 12px;
          font-weight: 900;
        }

        .print-summary-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 14px;
          font-size: 10px;
        }
        .print-summary-table td {
          border: 1px solid #cccccc;
          padding: 6px 4px;
          text-align: center;
        }
        .print-summary-label {
          background: #f2f2f2;
          font-weight: 700;
          color: #333333;
        }
        .print-summary-value {
          font-weight: 900;
          font-size: 12px;
        }

        .print-items-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          margin-bottom: 14px;
          font-size: 10px;
        }
        .print-items-table th {
          background: #111111 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color: #ffffff;
          padding: 6px 5px;
          font-size: 9.5px;
          font-weight: 700;
          text-align: right;
          border: 1px solid #111111;
          word-break: break-word;
          overflow-wrap: break-word;
        }
        .print-items-table td {
          border: 1px solid #999999;
          padding: 5px;
          text-align: right;
          word-break: break-word;
          overflow-wrap: break-word;
          vertical-align: top;
          line-height: 1.4;
        }
        .print-items-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .print-items-table tr:nth-child(even) {
          background: #f7f7f7 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-cell-center { text-align: center; }
        .print-cell-ltr { direction: ltr; text-align: right; }
        .print-cell-mono { font-family: "Courier New", monospace; font-size: 9.5px; }

        .print-financial-table {
          width: 50%;
          margin-inline-start: auto;
          border-collapse: collapse;
          margin-bottom: 24px;
          font-size: 11px;
        }
        .print-financial-table td {
          border: 1px solid #111111;
          padding: 7px 10px;
        }
        .print-financial-label {
          background: #f2f2f2;
          font-weight: 700;
        }
        .print-financial-value {
          font-weight: 900;
          text-align: left;
        }

        .print-signatures {
          display: flex;
          justify-content: space-between;
          gap: 40px;
          margin-top: 30px;
          margin-bottom: 20px;
        }
        .print-signature-block {
          flex: 1;
        }
        .print-signature-label {
          font-size: 10px;
          font-weight: 700;
          color: #333333;
          margin: 0 0 26px;
        }
        .print-signature-line {
          border-top: 1px solid #111111;
        }

        .print-footer {
          display: flex;
          justify-content: space-between;
          border-top: 1px solid #cccccc;
          padding-top: 8px;
          font-size: 8.5px;
          color: #777777;
        }

        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }

        .print-financial-table,
        .print-signatures,
        .print-footer {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      `}</style>
    </div>
  );
}
