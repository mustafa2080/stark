import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  RotateCcw, CheckCircle2, Truck, Clock, Package,
  Search, MapPin, Phone, FileText, AlertTriangle,
} from "lucide-react";

const fc = (n: number | string) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);

interface ReturnItem {
  id: number;
  shipmentId: number;
  manifestId: number;
  manifestNumber: string;
  deliveryStatus: "returned" | "delayed" | "partial_delivered";
  deliveryNote: string | null;
  returnReceived: number | null;
  returnReason: string | null;
  partialQuantity: number | null;
  customerName: string;
  phone: string;
  city: string;
  totalPrice: number;
  invoiceNumber: string;
  addedAt: string;
}

// ── Glow style helpers — نفس نمط الصفحات الاحترافية في المشروع ─────────────
const GLOW = {
  emerald: {
    background: "linear-gradient(145deg, rgba(16,185,129,.10) 0%, hsl(var(--card)/.85) 100%)",
    boxShadow: "0 0 0 1px rgba(16,185,129,.32), 0 4px 24px -6px rgba(16,185,129,.28), 0 0 44px -12px rgba(16,185,129,.22)",
  },
  orange: {
    background: "linear-gradient(145deg, rgba(245,158,11,.10) 0%, hsl(var(--card)/.85) 100%)",
    boxShadow: "0 0 0 1px rgba(245,158,11,.30), 0 4px 22px -6px rgba(245,158,11,.26), 0 0 42px -14px rgba(245,158,11,.20)",
  },
  red: {
    background: "linear-gradient(145deg, rgba(220,38,38,.10) 0%, hsl(var(--card)/.85) 100%)",
    boxShadow: "0 0 0 1px rgba(220,38,38,.28), 0 4px 22px -6px rgba(220,38,38,.25), 0 0 40px -14px rgba(220,38,38,.18)",
  },
  teal: {
    background: "linear-gradient(145deg, rgba(13,148,136,.12) 0%, hsl(var(--card)/.85) 100%)",
    boxShadow: "0 0 0 1px rgba(13,148,136,.30), 0 4px 22px -6px rgba(13,148,136,.28), 0 0 40px -14px rgba(13,148,136,.20)",
  },
} as const;

const RETURN_REASON_LABELS: Record<string, string> = {
  refused_paid: "رفض الاستلام (مدفوع)",
  refused_unpaid: "رفض الاستلام (غير مدفوع)",
  quality: "مشكلة في الجودة",
  wrong_address: "عنوان خاطئ",
  no_answer: "لا يوجد رد",
  other: "سبب آخر",
};

export default function ClientReturnsPage() {
  const [tab, setTab] = useState<"pending" | "received">("pending");
  const [search, setSearch] = useState("");

  const { data: returns, isLoading } = useQuery<ReturnItem[]>({
    queryKey: ["client-portal-returns"],
    queryFn: () => apiFetch("/client-portal/returns"),
    staleTime: 15_000,
  });

  const all = returns ?? [];

  // "تم الاستلام" = returnReceived === 1 (أو حالة مؤجلة اتحلت... نعتمد على returnReceived)
  const received = all.filter(i => i.returnReceived === 1);
  const pending = all.filter(i => i.returnReceived !== 1);

  const activeList = tab === "pending" ? pending : received;

  const filteredList = useMemo(() => {
    if (!search.trim()) return activeList;
    const q = search.trim().toLowerCase();
    return activeList.filter(i =>
      i.customerName?.toLowerCase().includes(q) ||
      i.phone?.includes(q) ||
      i.invoiceNumber?.toLowerCase().includes(q)
    );
  }, [activeList, search]);

  const totalValuePending = pending.reduce((s, i) => s + Number(i.totalPrice || 0), 0);
  const totalValueReceived = received.reduce((s, i) => s + Number(i.totalPrice || 0), 0);
  const returnedCount = all.filter(i => i.deliveryStatus === "returned").length;
  const delayedCount = all.filter(i => i.deliveryStatus === "delayed").length;

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[1200px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-orange-400" />
            المرتجعات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            كل الشحنات المرتجعة أو المؤجلة الخاصة بحسابك — مجمّعة من كل بياناتك
          </p>
        </div>

        {/* ── Stat containers — glow + shadow + gradient ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatContainer
            tone="orange"
            icon={Truck}
            value={pending.length}
            label="لسه عند مندوب الشحن"
            sub={fc(totalValuePending)}
          />
          <StatContainer
            tone="emerald"
            icon={CheckCircle2}
            value={received.length}
            label="تم استلامها بالمخزن"
            sub={fc(totalValueReceived)}
          />
          <StatContainer
            tone="red"
            icon={RotateCcw}
            value={returnedCount}
            label="إجمالي المرتجعات"
          />
          <StatContainer
            tone="teal"
            icon={Clock}
            value={delayedCount}
            label="إجمالي المؤجل"
          />
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              tab === "pending"
                ? "text-orange-300"
                : "bg-muted/40 text-muted-foreground border border-border"
            }`}
            style={tab === "pending" ? GLOW.orange : undefined}
          >
            <Truck size={15} /> لم يتم استلامها بعد ({pending.length})
          </button>
          <button
            onClick={() => setTab("received")}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              tab === "received"
                ? "text-emerald-300"
                : "bg-muted/40 text-muted-foreground border border-border"
            }`}
            style={tab === "received" ? GLOW.emerald : undefined}
          >
            <CheckCircle2 size={15} /> تم الاستلام ({received.length})
          </button>
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم العميل أو رقم الشحنة أو الهاتف..."
            className="w-full h-10 rounded-xl bg-muted/30 border border-border pr-10 pl-3 text-sm outline-none focus:border-primary/50"
          />
        </div>

        {/* ── List ── */}
        {isLoading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">جاري التحميل...</div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-muted/25 border border-border">
            <RotateCcw className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {tab === "pending" ? "لا توجد شحنات لسه عند مندوب الشحن" : "لا توجد مرتجعات مستلمة بعد"}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredList.map((item) => (
              <ReturnCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

