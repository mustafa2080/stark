import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Package, Search, ChevronRight, RefreshCcw, Plus, Upload, MessageCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

// ── Helpers ─────────────────────────────────────────────────────────────
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

interface ShipmentRow {
  id: number;
  trackingNumber: string | null;
  shipmentNumber: string | null;
  senderName: string | null;
  receiverName: string;
  receiverPhone: string | null;
  receiverCity: string | null;
  status: string;
  codAmount: string | null;
  shippingFee: string | null;
  assignedUserName: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  delivered:         { label: "استلم",               color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  in_transit:        { label: "قيد الشحن",           color: "#4a7cf5", bg: "rgba(74,124,245,0.12)" },
  picked_up:         { label: "قيد الشحن",           color: "#4a7cf5", bg: "rgba(74,124,245,0.12)" },
  out_for_delivery:  { label: "قيد الشحن",           color: "#4a7cf5", bg: "rgba(74,124,245,0.12)" },
  warehouse_ready:   { label: "قيد الشحن في المخزن", color: "#2dd4bf", bg: "rgba(45,212,191,0.12)" },
  in_shipping:       { label: "قيد الشحن في المخزن", color: "#2dd4bf", bg: "rgba(45,212,191,0.12)" },
  waiting:           { label: "قيد الانتظار",         color: "#f5a623", bg: "rgba(245,166,35,0.12)" },
  confirmed:         { label: "قيد الانتظار",         color: "#f5a623", bg: "rgba(245,166,35,0.12)" },
  returned:          { label: "مرتجع",              color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  delayed:           { label: "مؤجل",                color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  cancelled:         { label: "ملغية",               color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
  partial_received:  { label: "استلم جزئى",          color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  received:          { label: "استلم",               color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  still_in_warehouse:{ label: "في المخزن",           color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
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
    <div className="min-h-screen -m-4 md:-m-6 p-3 sm:p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-4 md:space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-foreground">قائمة الشحنات</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">كل شحناتك المسجلة في حسابك</p>
          </div>
          <div className="grid grid-cols-3 sm:flex sm:items-center gap-2">
            <button onClick={() => navigate("/client-shipments/new")}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-[11px] sm:text-sm font-bold bg-foreground text-background">
              <Plus size={14} className="shrink-0" /> <span className="truncate">إنشاء شحنة</span>
            </button>
            <button onClick={() => navigate("/client-shipments/import")}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-[11px] sm:text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <Upload size={14} className="shrink-0" /> <span className="truncate">تحميل إكسيل</span>
            </button>
            <button onClick={() => refetch()}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-[11px] sm:text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <RefreshCcw size={14} className="shrink-0" /> <span className="truncate">تحديث</span>
            </button>
          </div>
        </div>

        {/* ── Shipments Table ── */}
        <div className="rounded-2xl overflow-hidden bg-muted/25 border border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-border">
            <p className="text-sm font-black text-foreground">
              {totalShipments > 0 ? `${fn(totalShipments)} شحنة` : "شحناتي"}
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative w-full sm:w-auto">
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="بحث بالكود أو الاسم..."
                  className="pr-9 pl-3 py-2 rounded-lg text-xs text-foreground outline-none w-full sm:w-52 bg-muted/50 border border-border" />
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
              </div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="py-2 px-3 rounded-lg text-xs text-foreground outline-none w-full sm:w-auto bg-muted/50 border border-border">
                <option value="all">كل الحالات</option>
                <option value="delivered">استلم</option>
                <option value="in_transit">قيد الشحن</option>
                <option value="warehouse_ready">قيد الشحن في المخزن</option>
                <option value="waiting">قيد الانتظار</option>
                <option value="returned">مرتجع</option>
                <option value="delayed">مؤجل</option>
                <option value="cancelled">ملغية</option>
                <option value="partial_received">استلم جزئى</option>
              </select>
            </div>
          </div>

          {/* ── Mobile: cards ── */}
          <div className="md:hidden divide-y divide-border">
            {isLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">جارٍ التحميل...</div>
            ) : shipments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                <Package size={40} className="opacity-30" />
                <p className="text-sm">لا توجد شحنات مطابقة</p>
              </div>
            ) : shipments.map(s => {
              const meta = statusMeta(s.status);
              return (
                <button key={s.id} onClick={() => navigate(`/client-shipment-detail/${s.id}`)}
                  className="w-full text-right p-3.5 flex flex-col gap-2 active:bg-muted/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-foreground/60 truncate">{s.trackingNumber || s.shipmentNumber || s.id}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ background: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-foreground/85 truncate">{s.receiverName}</span>
                    <span className="text-sm font-black text-foreground shrink-0">{fn(Number(s.codAmount ?? 0))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{s.receiverCity || "—"}</span>
                    <span className="shrink-0">{s.createdAt ? new Date(s.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Table body (desktop) ── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs" dir="rtl">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">#</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">التاريخ</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">الراسل</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">المستلم</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">الهاتف</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">المحافظة</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">سعر الشحنة</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">المندوب</th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">الحالة</th>
                  <th className="text-center font-bold text-muted-foreground px-4 py-3 w-10"></th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={11} className="text-center py-10 text-muted-foreground">جارٍ التحميل...</td></tr>
                ) : shipments.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-14 text-muted-foreground">
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
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.createdAt ? new Date(s.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground/70">{s.senderName || "—"}</td>
                      <td className="px-4 py-3 text-foreground/80">{s.receiverName}</td>
                      <td className="px-4 py-3 text-foreground/60">{s.receiverPhone || "—"}</td>
                      <td className="px-4 py-3 text-foreground/60">{s.receiverCity || "—"}</td>
                      <td className="px-4 py-3 text-foreground/80 font-bold">{fn(Number(s.codAmount ?? 0))}</td>
                      <td className="px-4 py-3 text-foreground/60">{s.assignedUserName || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {s.receiverPhone && (
                          <a
                            href={`https://wa.me/${s.receiverPhone.replace(/[^0-9]/g, "")}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-green-500 hover:bg-green-500/10 transition-colors"
                          >
                            <MessageCircle size={15} />
                          </a>
                        )}
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-border gap-2">
              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">
                عرض {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalShipments)} من {fn(totalShipments)}
              </span>
              <div className="flex items-center gap-2 shrink-0">
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
