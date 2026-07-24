import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Package, Search, ChevronRight, RefreshCcw, Plus, Upload,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

// ── Helpers ─────────────────────────────────────────────────────────────
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

interface ShipmentRow {
  id: number;
  trackingNumber: string | null;
  shipmentNumber: string | null;
  receiverName: string;
  receiverPhone: string | null;
  receiverCity: string | null;
  status: string;
  codAmount: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  delivered:         { label: "تم التسليم بالكامل", color: "#16a34a", bg: "rgba(34,197,94,0.12)" },
  in_transit:        { label: "قيد التوصيل",        color: "#2563eb", bg: "rgba(59,130,246,0.12)" },
  picked_up:         { label: "قيد التوصيل",        color: "#2563eb", bg: "rgba(59,130,246,0.12)" },
  out_for_delivery:  { label: "قيد التوصيل",        color: "#2563eb", bg: "rgba(59,130,246,0.12)" },
  waiting:           { label: "في الانتظار",         color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  confirmed:         { label: "في الانتظار",         color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  returned:          { label: "مرتجع",              color: "#db2777", bg: "rgba(236,72,153,0.12)" },
  delayed:           { label: "متأخرة",              color: "#d97706", bg: "rgba(245,158,11,0.12)" },
  cancelled:         { label: "ملغية",               color: "#dc2626", bg: "rgba(239,68,68,0.12)" },
  partial_received:  { label: "استلام جزئي",         color: "#9333ea", bg: "rgba(168,85,247,0.12)" },
  still_in_warehouse:{ label: "في المخزن",           color: "#0891b2", bg: "rgba(6,182,212,0.12)" },
};
function statusMeta(status: string) {
  return STATUS_LABELS[status] ?? { label: status, color: "#64748b", bg: "rgba(100,116,139,0.12)" };
}

// ══════════════════════════════════════════════════════════════════════════
export default function ClientShipmentsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: shipmentsData, isLoading, refetch } = useQuery<{ data: ShipmentRow[]; total: number }>({
    queryKey: ["client-portal-shipments-full", statusFilter, search, page],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter !== "all") q.set("status", statusFilter);
      if (search.trim()) q.set("search", search.trim());
      q.set("page", String(page));
      q.set("pageSize", "20");
      return apiFetch(`/client-portal/shipments?${q.toString()}`);
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  const shipments = shipmentsData?.data ?? [];
  const totalShipments = shipmentsData?.total ?? 0;
  const pageSize = 20;

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-foreground">قائمة الشحنات</h1>
            <p className="text-sm text-muted-foreground mt-1">كل شحناتك المسجلة في حسابك</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/client-shipments/new")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-foreground text-background">
              <Plus size={15} /> إنشاء شحنة
            </button>
            <button onClick={() => navigate("/client-shipments/import")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <Upload size={15} /> تحميل من إكسيل
            </button>
            <button onClick={() => refetch()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <RefreshCcw size={15} /> تحديث
            </button>
          </div>
        </div>

        {/* ── Shipments Table ── */}
        <div className="rounded-2xl overflow-hidden bg-muted/25 border border-border">
          <div className="flex items-center justify-between flex-wrap gap-3 p-4 border-b border-border">
            <p className="text-sm font-black text-foreground">
              {totalShipments > 0 ? `${fn(totalShipments)} شحنة` : "شحناتي"}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="بحث بالكود أو الاسم..."
                  className="pr-9 pl-3 py-2 rounded-lg text-xs text-foreground outline-none w-52 bg-muted/50 border border-border" />
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
              </div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="py-2 px-3 rounded-lg text-xs text-foreground outline-none bg-muted/50 border border-border">
                <option value="all">كل الحالات</option>
                <option value="delivered">تم التسليم</option>
                <option value="in_transit">قيد التوصيل</option>
                <option value="waiting">في الانتظار</option>
                <option value="returned">مرتجع</option>
                <option value="delayed">متأخرة</option>
                <option value="cancelled">ملغية</option>
                <option value="partial_received">استلام جزئي</option>
              </select>
            </div>
          </div>

          {/* ── Table body ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs" dir="rtl">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">الكود</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">المستلم</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">الوجهة</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">قيمة الطرد</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">حالة الطلب</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">التاريخ</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">جارٍ التحميل...</td></tr>
                ) : shipments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-14 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Package size={40} className="opacity-30" />
                        <p className="text-sm">لا توجد شحنات مطابقة</p>
                      </div>
                    </td>
                  </tr>
                ) : shipments.map(s => {
                  const meta = statusMeta(s.status);
                  return (
                    <tr key={s.id} className="cursor-pointer hover:bg-muted/30 transition-colors border-t border-border"
                      onClick={() => navigate(`/client-shipment-detail/${s.id}`)}>
                      <td className="px-4 py-3 font-mono text-foreground/60">{s.trackingNumber || s.shipmentNumber || s.id}</td>
                      <td className="px-4 py-3 text-foreground/80">{s.receiverName}</td>
                      <td className="px-4 py-3 text-foreground/60">{s.receiverCity || "—"}</td>
                      <td className="px-4 py-3 text-foreground/80 font-bold">{fn(Number(s.codAmount ?? 0))}</td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.createdAt ? new Date(s.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "—"}
                      </td>
                      <td className="px-4 py-3"><ChevronRight size={14} className="text-muted-foreground/50" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalShipments > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                عرض {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalShipments)} من {fn(totalShipments)}
              </span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-foreground/70 disabled:opacity-30 bg-muted/50">السابق</button>
                <button disabled={page * pageSize >= totalShipments} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-foreground/70 disabled:opacity-30 bg-muted/50">التالي</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
