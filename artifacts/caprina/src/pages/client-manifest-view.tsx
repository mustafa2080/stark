import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useState, useMemo } from "react";
import {
  ArrowRight, FileText, Lock, LockOpen, Package, CheckCircle2,
  Clock, RotateCcw, AlertCircle, Printer, Search, Truck, MapPin, Phone,
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
  const totalCod = manifest.items.reduce((s, i) => s + Number(i.totalPrice || 0), 0);
  const totalShippingCost = manifest.items.reduce((s, i) => s + Number(i.shippingCost || 0), 0);

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background print:m-0 print:p-0" dir="rtl">
      <div className="max-w-[1200px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <Link href="/client-manifests">
              <button className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted/40 border border-border hover:bg-muted/60 transition-colors">
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-foreground">{manifest.manifestNumber}</h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  isOpen
                    ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800"
                    : "bg-muted text-muted-foreground border border-border"
                }`}>
                  {isOpen ? <LockOpen className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                  {isOpen ? "مفتوح" : "مغلق"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}
              </p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border hover:bg-muted/60 transition-colors"
          >
            <Printer size={15} /> طباعة
          </button>
        </div>

        {/* ── Stats cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard icon={Package} value={sc.total} label="إجمالي الشحنات" />
          <StatCard icon={CheckCircle2} value={sc.delivered} label="مسلَّم" tone="emerald" />
          <StatCard icon={Clock} value={sc.pending} label="قيد الانتظار" tone="muted" />
          <StatCard icon={AlertCircle} value={sc.delayed} label="مؤجل" tone="orange" />
          <StatCard icon={RotateCcw} value={sc.returned} label="مرتجع" tone="red" />
        </div>

        {/* ── Progress bar ── */}
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-muted-foreground">نسبة التسليم</span>
            <span className="font-black text-emerald-400 text-lg">{deliveryPct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deliveryPct}%` }} />
          </div>
        </div>

        {/* ── Financial summary ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] text-muted-foreground mb-1">إجمالي قيمة الشحنات</p>
            <p className="text-lg font-black">{formatCurrency(totalCod)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] text-muted-foreground mb-1">إجمالي تكلفة الشحن</p>
            <p className="text-lg font-black">{formatCurrency(totalShippingCost)}</p>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="relative print:hidden">
          <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم العميل أو رقم الشحنة أو الهاتف..."
            className="w-full h-10 rounded-xl bg-muted/30 border border-border pr-10 pl-3 text-sm outline-none focus:border-primary/50"
          />
        </div>

        {/* ── Table ── */}
        <div className="rounded-2xl border border-border bg-muted/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-black flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              الشحنات في البيان
            </p>
            <span className="text-[11px] text-muted-foreground">{filteredItems.length} شحنة</span>
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
          <div className="rounded-2xl border border-orange-800/60 bg-orange-950/20 overflow-hidden print:hidden">
            <div className="px-4 py-3 border-b border-orange-800/40 flex items-center gap-2">
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
  );
}

function StatCard({ icon: Icon, value, label, tone = "default" }: {
  icon: React.ElementType; value: number; label: string;
  tone?: "default" | "emerald" | "orange" | "red" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    emerald: "text-emerald-400",
    orange: "text-orange-400",
    red: "text-red-400",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-3 flex flex-col items-center gap-1">
      <Icon className={`w-4 h-4 ${toneClass}`} />
      <span className={`text-xl font-black ${toneClass}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground text-center">{label}</span>
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
