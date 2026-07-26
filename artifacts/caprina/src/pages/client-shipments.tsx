import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Package, Search, ChevronRight, RefreshCcw, Plus, Upload, MessageCircle, ChevronUp, ChevronDown, X, Filter, CalendarDays,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

// ── Column Filters (Excel-style) ─────────────────────────────────────────
type ColKey = "id" | "date" | "sender" | "receiver" | "phone" | "city" | "cod" | "agent" | "status";
type ColFilters = Record<ColKey, Set<string>>;

function ColFilterBtn({ col, colFilters, getColOptions, toggleColFilter, clearColFilter, sortCol, sortDir, onSort }: {
  col: ColKey;
  colFilters: ColFilters;
  getColOptions: (col: ColKey) => string[];
  toggleColFilter: (col: ColKey, val: string) => void;
  clearColFilter: (col: ColKey) => void;
  sortCol: ColKey | null;
  sortDir: "asc" | "desc";
  onSort: (col: ColKey, dir: "asc" | "desc") => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const sort = sortCol === col ? sortDir : "asc";
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const active = colFilters[col].size > 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const panelW = 208;
      const left = Math.max(4, Math.min(r.left, window.innerWidth - panelW - 4));
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(o => !o);
    setSearch("");
  };

  let opts = getColOptions(col);
  if (search) opts = opts.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  if (sort === "desc") opts = [...opts].reverse();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        title="فلتر"
        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-all shrink-0 ${active ? "text-primary bg-primary/15" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
      >
        {active ? (
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        )}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-background border border-border rounded-lg shadow-2xl text-[11px] w-52"
          dir="rtl"
        >
          <div className="flex gap-1 p-2 border-b border-border/50">
            <button type="button" onClick={() => { onSort(col, "asc"); setOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${sort === "asc" && sortCol === col ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronUp className="w-2.5 h-2.5" />أ→ي
            </button>
            <button type="button" onClick={() => { onSort(col, "desc"); setOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${sort === "desc" && sortCol === col ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronDown className="w-2.5 h-2.5" />ي→أ
            </button>
          </div>
          <div className="px-2 pt-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث في القيم..."
              className="w-full h-7 text-[10px] px-2 border border-border rounded bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="max-h-52 overflow-y-auto px-1 py-1.5 flex flex-col gap-0.5">
            {opts.length === 0
              ? <p className="text-muted-foreground text-center py-3 text-[10px]">لا توجد قيم</p>
              : opts.map(val => (
                <label key={val} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer">
                  <input type="checkbox" checked={colFilters[col].has(val)}
                    onChange={() => toggleColFilter(col, val)}
                    className="accent-primary w-3 h-3 shrink-0" />
                  <span className="truncate">{val}</span>
                </label>
              ))
            }
          </div>
          {active && (
            <div className="border-t border-border/50 px-2 py-1.5">
              <button type="button" onClick={() => { clearColFilter(col); setOpen(false); }}
                className="text-destructive text-[10px] hover:underline w-full text-right">
                مسح الفلتر
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

interface ClientStatsBreakdown { key: string; label: string; count: number; pct: number; color: string }
interface ClientStatsResponse {
  total: number;
  breakdown: ClientStatsBreakdown[];
  finance?: { totalCod: string; totalCollected: string; totalShippingFee: string; outstanding: string };
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  return `${(bigint >> 16) & 255},${(bigint >> 8) & 255},${bigint & 255}`;
}

// ══════════════════════════════════════════════════════════════════════════
export default function ClientShipmentsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // ── إحصائيات (نفس شكل قسم الشحنات بتاع الأدمن) ──────────────────────────
  const { data: stats } = useQuery<ClientStatsResponse>({
    queryKey: ["client-portal-shipments-stats"],
    queryFn: () => apiFetch("/client-portal/stats"),
    enabled: !!user,
    staleTime: 30_000,
  });

  // ── نجيب كل شحنات العميل (بدون تقسيم صفحات سيرفر) عشان الفلاتر تشتغل زي الأدمن ──
  const { data: allShipments = [], isLoading, refetch } = useQuery<ShipmentRow[]>({
    queryKey: ["client-portal-shipments-all"],
    queryFn: async () => {
      const pageSize = 100;
      let page = 1;
      let all: ShipmentRow[] = [];
      while (true) {
        const q = new URLSearchParams();
        q.set("page", String(page));
        q.set("pageSize", String(pageSize));
        const res: { data: ShipmentRow[]; total: number } = await apiFetch(`/client-portal/shipments?${q.toString()}`);
        all = all.concat(res.data);
        if (all.length >= res.total || res.data.length === 0) break;
        page += 1;
      }
      return all;
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  // ── Column Filters (Excel-style) ────────────────────────────────────────
  const [colFilters, setColFilters] = useState<ColFilters>({
    id: new Set(), date: new Set(), sender: new Set(), receiver: new Set(),
    phone: new Set(), city: new Set(), cod: new Set(), agent: new Set(), status: new Set(),
  });
  const colFilterHasActive = Object.values(colFilters).some(s => s.size > 0);
  const [showColFilters, setShowColFilters] = useState(false);
  const [sortCol, setSortCol] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback((col: ColKey, dir: "asc" | "desc") => {
    setSortCol(col);
    setSortDir(dir);
  }, []);

  // ── فلترة البحث النصي + حالة الطلب (زي القديم، بس محليًا) ──────────────────
  const filtered = useMemo(() => {
    return allShipments.filter(s => {
      if (statusFilter !== "all") {
        const STATUS_GROUPS: Record<string, string[]> = {
          delivered:        ["delivered", "received"],
          in_transit:       ["in_transit", "picked_up", "out_for_delivery"],
          warehouse_ready:  ["warehouse_ready", "in_shipping", "still_in_warehouse"],
          waiting:          ["waiting", "confirmed"],
          returned:         ["returned"],
          delayed:          ["delayed"],
          cancelled:        ["cancelled"],
          partial_received: ["partial_received"],
        };
        const group = STATUS_GROUPS[statusFilter] ?? [statusFilter];
        if (!group.includes(s.status)) return false;
      }
      if (customerSearch.trim()) {
        const words = customerSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
        const receiver = (s.receiverName ?? "").toLowerCase();
        const matchesAll = words.every(w => receiver.includes(w));
        if (!matchesAll) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hit =
          (s.trackingNumber ?? "").toLowerCase().includes(q) ||
          (s.shipmentNumber ?? "").toLowerCase().includes(q) ||
          (s.receiverPhone ?? "").toLowerCase().includes(q) ||
          String(s.id).includes(q);
        if (!hit) return false;
      }
      if (dateFrom && s.createdAt && new Date(s.createdAt) < new Date(dateFrom)) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (s.createdAt && new Date(s.createdAt) > to) return false;
      }
      return true;
    });
  }, [allShipments, statusFilter, search, customerSearch, dateFrom, dateTo]);

  // ── Col Filter helpers ──────────────────────────────────────────────────
  const getColVal = useCallback((col: ColKey, s: ShipmentRow): string => {
    switch (col) {
      case "id":       return s.trackingNumber ?? s.shipmentNumber ?? `#${s.id.toString().padStart(4,"0")}`;
      case "date":     return s.createdAt ? new Date(s.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "";
      case "sender":   return s.senderName ?? "";
      case "receiver": return s.receiverName ?? "";
      case "phone":    return s.receiverPhone ?? "";
      case "city":     return s.receiverCity ?? "";
      case "cod":      return String(Math.round(Number(s.codAmount || 0)));
      case "agent":    return s.assignedUserName ?? "";
      case "status":   return statusMeta(s.status).label;
      default:         return "";
    }
  }, []);

  const getColOptions = useCallback((col: ColKey): string[] => {
    const vals = [...new Set(filtered.map(s => getColVal(col, s)))].filter(Boolean);
    return vals.sort((a, b) => a.localeCompare(b, "ar"));
  }, [filtered, getColVal]);

  const toggleColFilter = useCallback((col: ColKey, val: string) => {
    setColFilters(prev => {
      const next = new Set(prev[col]);
      next.has(val) ? next.delete(val) : next.add(val);
      return { ...prev, [col]: next };
    });
  }, []);

  const clearColFilter = useCallback((col: ColKey) => {
    setColFilters(prev => ({ ...prev, [col]: new Set() }));
  }, []);

  const colFilteredRows = useMemo(() => {
    if (!colFilterHasActive) return filtered;
    return filtered.filter(s =>
      (Object.keys(colFilters) as ColKey[]).every(col => {
        const set = colFilters[col];
        if (set.size === 0) return true;
        return set.has(getColVal(col, s));
      })
    );
  }, [filtered, colFilters, colFilterHasActive, getColVal]);

  const displayRows = useMemo(() => {
    if (!sortCol) return colFilteredRows;
    return [...colFilteredRows].sort((a, b) => {
      const va = getColVal(sortCol, a);
      const vb = getColVal(sortCol, b);
      const cmp = va.localeCompare(vb, "ar", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [colFilteredRows, sortCol, sortDir, getColVal]);

  // ── Pagination (client-side) ────────────────────────────────────────────
  const pageSize = 20;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(displayRows.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages]);
  const shipments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return displayRows.slice(start, start + pageSize);
  }, [displayRows, page]);
  const totalShipments = displayRows.length;

  const hasActiveFilter = search.trim() !== "" || customerSearch.trim() !== "" || statusFilter !== "all" || dateFrom !== "" || dateTo !== "" || colFilterHasActive;
  const clearAllFilters = () => {
    setSearch("");
    setCustomerSearch("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setColFilters({ id: new Set(), date: new Set(), sender: new Set(), receiver: new Set(), phone: new Set(), city: new Set(), cod: new Set(), agent: new Set(), status: new Set() });
    setSortCol(null);
    setPage(1);
  };

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

        {/* ── إحصائيات ── */}
        {stats && stats.breakdown.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div
              className="relative overflow-hidden rounded-2xl p-5 flex flex-col justify-between"
              style={{
                background: "linear-gradient(145deg, rgba(251,191,36,0.22) 0%, rgba(251,146,60,0.14) 50%, rgba(251,191,36,0.06) 100%)",
                border: "1px solid rgba(251,191,36,0.35)",
                boxShadow: "0 8px 32px rgba(251,191,36,0.15), 0 2px 8px rgba(251,146,60,0.1), inset 0 1px 0 rgba(255,255,255,0.08)",
                minHeight: "140px",
              }}
            >
              <span className="absolute -top-6 -left-6 w-28 h-28 rounded-full opacity-10"
                style={{ background: "radial-gradient(circle, rgba(251,191,36,1) 0%, transparent 70%)" }} />
              <span className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full opacity-10"
                style={{ background: "radial-gradient(circle, rgba(251,146,60,1) 0%, transparent 70%)" }} />
              <p className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: "rgba(251,191,36,0.75)", letterSpacing: "0.12em" }}>
                إجمالي شحناتي
              </p>
              <div className="mt-2">
                <span className="text-5xl font-black" style={{ color: "rgba(251,191,36,1)", lineHeight: 1 }}>
                  {stats.total}
                </span>
              </div>
              <p className="text-xs mt-2" style={{ color: "rgba(251,191,36,0.5)" }}>إجمالي الشحنات</p>
            </div>

            <div
              className="lg:col-span-2 rounded-2xl p-4"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              }}
            >
              <p className="text-xs font-bold mb-3 tracking-wide" style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em" }}>
                توزيع الحالات
              </p>
              <div className="space-y-2">
                {stats.breakdown.map(b => {
                  const rgb = hexToRgb(b.color);
                  return (
                    <div key={b.key} className="flex items-center gap-3">
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full"
                        style={{ background: `rgba(${rgb},0.9)`, boxShadow: `0 0 6px rgba(${rgb},0.6)` }} />
                      <span className="flex-1 text-xs font-medium text-right" style={{ color: "rgba(255,255,255,0.75)" }}>
                        {b.label}
                      </span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.max(b.pct, 8)}%`,
                            background: `linear-gradient(90deg, rgba(${rgb},0.9), rgba(${rgb},0.5))`,
                            boxShadow: `0 0 6px rgba(${rgb},0.4)`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold w-9 text-left" style={{ color: `rgba(${rgb},0.9)` }}>
                        {b.pct}%
                      </span>
                      <span
                        className="text-xs font-black w-7 text-center rounded-md py-0.5"
                        style={{ color: `rgba(${rgb},1)`, background: `rgba(${rgb},0.12)` }}
                      >
                        {b.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Shipments Table ── */}
        <div className="rounded-2xl overflow-hidden bg-muted/25 border border-border">
          <div className="p-3 border-b border-border bg-muted/10 flex flex-col gap-2">
            <p className="text-sm font-black text-foreground px-1">
              {totalShipments > 0 ? `${fn(totalShipments)} شحنة` : "شحناتي"}
            </p>

            {/* ── بحث اسم العميل realtime ── */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60" />
              <Input
                placeholder="ابحث باسم العميل..."
                className="pr-9 bg-card text-sm h-10 font-medium border-primary/30 focus-visible:ring-primary/40 placeholder:text-muted-foreground/60"
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setPage(1); }}
              />
              {customerSearch && (
                <>
                  <button
                    className="absolute left-9 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setCustomerSearch("")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    {filtered.length}
                  </span>
                </>
              )}
            </div>

            {/* ── الصف الأول: بحث عام + حالة ── */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث برقم الهاتف..."
                  className="pr-9 bg-card text-sm h-9"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-48 bg-card h-9 text-sm">
                  <div className="flex items-center gap-2"><Filter className="w-3.5 h-3.5 text-muted-foreground" /><SelectValue /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الشحنات</SelectItem>
                  <SelectItem value="waiting">قيد الانتظار</SelectItem>
                  <SelectItem value="warehouse_ready">قيد الشحن في المخزن</SelectItem>
                  <SelectItem value="in_transit">قيد الشحن</SelectItem>
                  <SelectItem value="delivered">استلم</SelectItem>
                  <SelectItem value="delayed">مؤجل</SelectItem>
                  <SelectItem value="returned">مرتجع</SelectItem>
                  <SelectItem value="partial_received">استلم جزئي</SelectItem>
                  <SelectItem value="cancelled">ملغية</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── الصف الثاني: تاريخ من + زر فلتر + مسح ── */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input type="date" className="pr-9 bg-card text-sm h-8 w-40 text-xs" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} title="من تاريخ" />
              </div>
              <span className="text-xs text-muted-foreground">←</span>
              <div className="relative">
                <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input type="date" className="pr-9 bg-card text-sm h-8 w-40 text-xs" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} title="إلى تاريخ" />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (showColFilters) {
                    setColFilters({ id: new Set(), date: new Set(), sender: new Set(), receiver: new Set(), phone: new Set(), city: new Set(), cod: new Set(), agent: new Set(), status: new Set() });
                    setSortCol(null);
                  }
                  setShowColFilters(v => !v);
                }}
                className={`hidden md:flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${showColFilters ? "text-primary bg-primary/10 border-primary/30" : "text-foreground/70 bg-muted/50 border-border"}`}
              >
                <Filter className="w-3.5 h-3.5" /> فلاتر الأعمدة
              </button>
              {hasActiveFilter && (
                <button type="button" onClick={clearAllFilters}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-muted-foreground bg-muted/50 border border-border">
                  <X size={13} /> مسح الكل
                </button>
              )}
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
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-1">#{showColFilters && <ColFilterBtn col="id" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                  </th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-1">التاريخ{showColFilters && <ColFilterBtn col="date" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                  </th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-1">الراسل{showColFilters && <ColFilterBtn col="sender" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                  </th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-1">المستلم{showColFilters && <ColFilterBtn col="receiver" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                  </th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-1">الهاتف{showColFilters && <ColFilterBtn col="phone" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                  </th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-1">المحافظة{showColFilters && <ColFilterBtn col="city" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                  </th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-1">سعر الشحنة{showColFilters && <ColFilterBtn col="cod" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                  </th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-1">المندوب{showColFilters && <ColFilterBtn col="agent" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                  </th>
                  <th className="text-right font-bold text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-1">الحالة{showColFilters && <ColFilterBtn col="status" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                  </th>
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
