import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Package, CheckCircle2, Clock, RotateCcw, Truck, Ban,
  Search, Wallet, TrendingUp, User,
  ChevronRight, RefreshCcw, ShieldCheck, AlertCircle, PackagePlus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

// ── Helpers ─────────────────────────────────────────────────────────────
const fc = (n: number | string) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

interface StatsResponse {
  total: number;
  breakdown: { key: string; label: string; count: number; pct: number; color: string }[];
  finance: { totalCod: string; totalCollected: string; totalShippingFee: string; outstanding: string };
  accountStatus: string;
  creditLimit: string;
}

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

// ── Donut Chart (SVG) ─────────────────────────────────────────────────────
function DonutChart({ breakdown, total }: { breakdown: StatsResponse["breakdown"]; total: number }) {
  const size = 260, stroke = 34, r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offsetAcc = 0;

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--muted-foreground)/0.15)" strokeWidth={stroke} />
        {breakdown.map((b, i) => {
          const dash = (b.pct / 100) * circumference;
          const el = (
            <circle key={b.key} cx={cx} cy={cy} r={r} fill="none" stroke={b.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offsetAcc}
              strokeLinecap="butt"
              style={{ transition: "stroke-dasharray 0.6s ease" }} />
          );
          offsetAcc += dash;
          return el;
        })}
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-foreground">{fn(total)}</span>
        <span className="text-xs text-muted-foreground mt-1">الإجمالي</span>
      </div>
    </div>
  );
}

// ── Small stat pill (top-left cards like "الانتظار / الموافقة") ───────────
function StatPill({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-muted/40 border border-border">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black bg-muted text-foreground">
        {value}
      </span>
    </div>
  );
}

// ── Legend item ───────────────────────────────────────────────────────────
function LegendItem({ color, label, count, pct }: { color: string; label: string; count: number; pct: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/25">
      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-xs text-foreground/70 flex-1">{label}</span>
      <span className="text-xs font-bold text-foreground/90">{fn(count)}</span>
      <span className="text-[10px] text-muted-foreground">({pct}%)</span>
    </div>
  );
}

// ── Wallet mini-card ──────────────────────────────────────────────────────
function WalletCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3 bg-muted/40 border border-border">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}22` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
        <p className="text-base font-black text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════
export default function ClientDashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: profileData } = useQuery<{ client: any }>({
    queryKey: ["client-portal-profile"],
    queryFn: () => apiFetch("/client-portal/profile"),
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<StatsResponse>({
    queryKey: ["client-portal-stats"],
    queryFn: () => apiFetch("/client-portal/stats"),
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: shipmentsData, isLoading: shipmentsLoading, refetch } = useQuery<{ data: ShipmentRow[]; total: number }>({
    queryKey: ["client-portal-shipments", statusFilter, search, page],
    queryFn: () => {
      const q = new URLSearchParams();
      if (statusFilter !== "all") q.set("status", statusFilter);
      if (search.trim()) q.set("search", search.trim());
      q.set("page", String(page));
      q.set("pageSize", "10");
      return apiFetch(`/client-portal/shipments?${q.toString()}`);
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  const client = profileData?.client;
  const shipments = shipmentsData?.data ?? [];
  const totalShipments = shipmentsData?.total ?? 0;

  const finance = stats?.finance;

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-foreground">أهلاً، {client?.name || user?.displayName || "عميلنا العزيز"} 👋</h1>
            <p className="text-sm text-muted-foreground mt-1">لوحة متابعة شحناتك ومستحقاتك المالية</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/client-wallet")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <Wallet size={15} /> التسويات المالية
            </button>
            <button onClick={() => navigate("/client-pickup-requests")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-foreground text-background">
              <PackagePlus size={15} /> طلب التقاط
            </button>
            <button onClick={() => refetch()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <RefreshCcw size={15} /> تحديث
            </button>
          </div>
        </div>

        {/* ── Top Grid: sidebar cards + donut ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">

          {/* ── Left column (account + wallet mini) ── */}
          <div className="space-y-4">
            <button onClick={() => navigate("/client-account")}
              className="w-full text-right rounded-2xl p-4 bg-muted/25 border border-border hover:bg-muted/40 transition-colors group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary/10 flex-shrink-0">
                  <User size={18} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-foreground truncate">{client?.name || user?.displayName || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">عرض البروفايل الكامل</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground/60 pt-2 border-t border-border/50">
                <ShieldCheck size={13} style={{ color: stats?.accountStatus === "active" ? "#22c55e" : "#f59e0b" }} />
                {stats?.accountStatus === "active" ? "الحساب نشط" : "الحساب موقوف مؤقتاً"}
              </div>
            </button>

            <StatPill value={fn(stats?.total ?? 0)} label="إجمالي الشحنات" />
          </div>

          {/* ── Right column: Donut + Legend ── */}
          <div className="rounded-2xl p-5 bg-muted/25 border border-border">
            <p className="text-sm font-black text-foreground mb-4">إحصائيات الشحنات</p>
            {statsLoading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">جارٍ التحميل...</div>
            ) : !stats || stats.total === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Package size={40} className="opacity-30" />
                <p className="text-sm">لا توجد شحنات مسجلة بعد</p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-6">
                <DonutChart breakdown={stats.breakdown} total={stats.total} />
                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stats.breakdown.map(b => (
                    <LegendItem key={b.key} color={b.color} label={b.label} count={b.count} pct={b.pct} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>


        {/* ── Shipments Table ── */}
        <div className="rounded-2xl overflow-hidden bg-muted/25 border border-border">
          <div className="flex items-center justify-between flex-wrap gap-3 p-4 border-b border-border">
            <p className="text-sm font-black text-foreground">شحناتي</p>
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
                {shipmentsLoading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">جارٍ التحميل...</td></tr>
                ) : shipments.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">لا توجد شحنات مطابقة</td></tr>
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
          {totalShipments > 10 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                عرض {(page - 1) * 10 + 1}–{Math.min(page * 10, totalShipments)} من {fn(totalShipments)}
              </span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-foreground/70 disabled:opacity-30 bg-muted/50">السابق</button>
                <button disabled={page * 10 >= totalShipments} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-foreground/70 disabled:opacity-30 bg-muted/50">التالي</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
