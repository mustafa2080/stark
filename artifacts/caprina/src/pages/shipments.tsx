import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Plus, Search, Filter, Truck, MapPin, Phone, User, Users,
  CreditCard, Clock, CheckCircle, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, X, RefreshCw, Eye, Edit, Trash2,
  ArrowUpDown, Building2, DollarSign, FileText, Boxes, Tag,
  Settings, Globe, Layers, Image as ImageIcon,
  Megaphone, Warehouse, UserCheck,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ShipmentStatus =
  | "waiting" | "confirmed" | "picked_up" | "in_transit"
  | "out_for_delivery" | "delivered" | "partial_received" | "delayed" | "returned" | "cancelled";

type PaymentMethod = "cod" | "prepaid" | "deferred";
type ParcelType    = "document" | "normal" | "fragile" | "heavy" | "electronics" | "clothing" | "food" | "other";

interface ShipmentZone      { id: number; name: string; governorate?: string; price: string | number; isActive?: boolean }
interface ParcelTypePricing { id: number; parcelType: ParcelType; label?: string; basePrice: string | number }
interface Client            { id: number; name: string; phone?: string; phone2?: string; email?: string; address?: string; city?: string }
interface Shipment {
  id: number;
  shipmentNumber?: string;
  trackingNumber?: string;
  clientId?: number;
  senderName: string;
  senderPhone?: string;
  senderCity?: string;
  receiverName: string;
  receiverPhone?: string;
  receiverAddress?: string;
  receiverCity?: string;
  zoneId?: number;
  zonePrice?: string | number;
  parcelType?: ParcelType;
  parcelTypePrice?: string | number;
  weight?: string | number;
  pieces?: number;
  description?: string;
  declaredValue?: string | number;
  paymentMethod: PaymentMethod;
  codAmount?: string | number;
  shippingFee?: string | number;
  insuranceFee?: string | number;
  totalAmount?: string | number;
  collectedAmount?: string | number;
  status: ShipmentStatus;
  returnReceived?: number | boolean | null;
  shippingCompanyId?: number;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_CFG: Record<ShipmentStatus, { label: string; icon: React.ElementType; cls: string }> = {
  waiting:          { label: "ط§ظ†طھط¸ط§ط±",          icon: Clock,        cls: "bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600"    },
  confirmed:        { label: "ظ…ط¤ظƒط¯ط©",           icon: CheckCircle,  cls: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700"          },
  picked_up:        { label: "طھظ… ط§ظ„ط§ط³طھظ„ط§ظ…",     icon: Package,      cls: "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-700"           },
  in_transit:       { label: "ظ‚ظٹط¯ ط§ظ„ط´ط­ظ†",       icon: Truck,        cls: "bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-700"},
  out_for_delivery: { label: "ط®ط±ط¬طھ ظ„ظ„طھط³ظ„ظٹظ…",   icon: MapPin,       cls: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700"     },
  delivered:        { label: "طھظ… ط§ظ„طھط³ظ„ظٹظ…",      icon: CheckCircle,  cls: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700"},
  partial_received: { label: "ط§ط³طھظ„ط§ظ… ط¬ط²ط¦ظٹ",    icon: Package,      cls: "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-700"              },
  delayed:          { label: "ظ…طھط£ط®ط±ط©",          icon: AlertTriangle,cls: "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700"},
  returned:         { label: "ظ…ط±طھط¬ط¹",           icon: RefreshCw,    cls: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700"                },
  cancelled:        { label: "ظ…ظ„ط؛ظٹط©",           icon: XCircle,      cls: "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-600"          },
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cod:      "ط§ظ„ط¯ظپط¹ ط¹ظ†ط¯ ط§ظ„ط§ط³طھظ„ط§ظ…",
  prepaid:  "ظ…ط¯ظپظˆط¹ ظ…ط³ط¨ظ‚ط§ظ‹",
  deferred: "ط§ظ„ط¯ظپط¹ ظ„ط§ط­ظ‚",
};
const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  cod:      "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700",
  prepaid:  "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700",
  deferred: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700",
};

const PARCEL_LABELS: Record<ParcelType, string> = {
  document: "ظ…ط³طھظ†ط¯ط§طھ", normal: "ط·ط±ط¯ ط¹ط§ط¯ظٹ", fragile: "ظ‚ط§ط¨ظ„ ظ„ظ„ظƒط³ط±",
  heavy: "ط«ظ‚ظٹظ„", electronics: "ط¥ظ„ظƒطھط±ظˆظ†ظٹط§طھ", clothing: "ظ…ظ„ط§ط¨ط³",
  food: "ط·ط¹ط§ظ…", other: "ط£ط®ط±ظٹ",
};

const fc  = (n: number | string) => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fmt = (d: string)          => new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });

// â”€â”€â”€ API helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function apiHeaders() {
  const token = localStorage.getItem("caprina_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { headers: apiHeaders(), ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || r.statusText); }
  return r.json();
}

// â”€â”€â”€ Excel-style Column Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ShipColKey = "num" | "date" | "sender" | "receiver" | "city" | "parcel" | "payment" | "fee" | "cod" | "status" | "creator";
type ShipColFilters = Record<ShipColKey, Set<string>>;

function ColFilterBtn({ col, colFilters, getColOptions, toggleColFilter, clearColFilter, sortCol, sortDir, onSort }: {
  col: ShipColKey;
  colFilters: ShipColFilters;
  getColOptions: (col: ShipColKey) => string[];
  toggleColFilter: (col: ShipColKey, val: string) => void;
  clearColFilter: (col: ShipColKey) => void;
  sortCol: ShipColKey | null;
  sortDir: "asc" | "desc";
  onSort: (col: ShipColKey, dir: "asc" | "desc") => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const active = colFilters[col].size > 0;
  const isSorted = sortCol === col;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
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

  return (
    <>
      <button ref={btnRef} type="button" onClick={handleOpen} title="ظپظ„طھط±"
        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-all shrink-0 ${active ? "text-primary bg-primary/15" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
        {active ? (
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        )}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-background border border-border rounded-lg shadow-2xl text-[11px] w-52" dir="rtl">
          <div className="flex gap-1 p-2 border-b border-border/50">
            <button type="button" onClick={() => { onSort(col, "asc"); setOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${isSorted && sortDir === "asc" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronUp className="w-2.5 h-2.5" />ط£â†’ظٹ
            </button>
            <button type="button" onClick={() => { onSort(col, "desc"); setOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${isSorted && sortDir === "desc" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronDown className="w-2.5 h-2.5" />ظٹâ†’ط£
            </button>
          </div>
          <div className="px-2 pt-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ط¨ط­ط« ظپظٹ ط§ظ„ظ‚ظٹظ…..."
              className="w-full h-7 text-[10px] px-2 border border-border rounded bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="max-h-52 overflow-y-auto px-1 py-1.5 flex flex-col gap-0.5">
            {opts.length === 0
              ? <p className="text-muted-foreground text-center py-3 text-[10px]">ظ„ط§ طھظˆط¬ط¯ ظ‚ظٹظ…</p>
              : opts.map(val => (
                <label key={val} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer">
                  <input type="checkbox" checked={colFilters[col].has(val)} onChange={() => toggleColFilter(col, val)} className="accent-primary w-3 h-3 shrink-0" />
                  <span className="truncate">{val}</span>
                </label>
              ))
            }
          </div>
          {active && (
            <div className="border-t border-border/50 px-2 py-1.5">
              <button type="button" onClick={() => { clearColFilter(col); setOpen(false); }}
                className="text-destructive text-[10px] hover:underline w-full text-right">ظ…ط³ط­ ط§ظ„ظپظ„طھط±</button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// â”€â”€â”€ Status Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatusBadge({ status }: { status: ShipmentStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.waiting;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

// â”€â”€â”€ Summary KPI Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function KpiCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
          <p className="text-lg font-black text-foreground">{value}</p>
          {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// â”€â”€â”€ New Shipment Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AD_SOURCES = [
  { value: "facebook",  label: "ظپظٹط³ط¨ظˆظƒ" },
  { value: "tiktok",   label: "طھظٹظƒ طھظˆظƒ" },
  { value: "instagram", label: "ط¥ظ†ط³طھط¬ط±ط§ظ…" },
  { value: "whatsapp", label: "ظˆط§طھط³ط§ط¨" },
  { value: "organic",  label: "ظˆظٹط¨ط³ط§ظٹطھ" },
  { value: "other",    label: "ط£ط®ط±ظ‰" },
];

const AdSourceIcon = ({ value, className = "w-4 h-4 shrink-0" }: { value: string; className?: string }) => {
  if (value === "facebook")  return <svg className={className} viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>;
  if (value === "tiktok")    return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>;
  if (value === "instagram") return <svg className={className} viewBox="0 0 24 24" fill="url(#igGS)"><defs><linearGradient id="igGS" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="50%" stopColor="#dc2743"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
  if (value === "whatsapp")  return <svg className={className} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
  if (value === "organic")   return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>;
};

interface ShippingCompany { id: number; name: string; isActive?: boolean }

function ShipmentFormDialog({
  open, onClose, zones, parcelPricing, clients,
}: {
  open: boolean;
  onClose: () => void;
  zones: ShipmentZone[];
  parcelPricing: ParcelTypePricing[];
  clients: Client[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const [form, setForm] = useState({
    clientId: "",
    senderName: "", senderPhone: "", senderPhone2: "", senderCity: "",
    receiverName: "", receiverPhone: "", receiverPhone2: "", receiverAddress: "", receiverCity: "",
    zoneId: "", parcelType: "" as ParcelType | "",
    weight: "", pieces: "1", description: "", declaredValue: "",
    paymentMethod: "cod" as PaymentMethod,
    codAmount: "", insuranceFee: "0",
    notes: "",
    adSource: "", adCampaign: "", warehouseId: "", assignedUserId: "",
    shippingCompanyId: "",
  });

  const [clientSearch, setClientSearch] = useState("");
  const [showClientList, setShowClientList] = useState(false);

  const { data: warehouses = [] } = useQuery<any[]>({ queryKey: ["warehouses"], queryFn: () => apiFetch("/warehouses") });
  const { data: users = [] }      = useQuery<any[]>({ queryKey: ["users"],      queryFn: () => apiFetch("/users"), enabled: isAdmin });
  const { data: shippingCompanies = [] } = useQuery<ShippingCompany[]>({ queryKey: ["shipping-companies-list"], queryFn: () => apiFetch("/shipping-companies") });

  const selectedZone    = zones.find(z => String(z.id) === form.zoneId);
  const selectedPricing = parcelPricing.find(p => p.parcelType === form.parcelType);
  const zonePrice       = Number(selectedZone?.price) || 0;
  const parcelPrice     = Number(selectedPricing?.basePrice) || 0;
  const shippingFee     = zonePrice + parcelPrice;
  const insurance       = Number(form.insuranceFee) || 0;
  const cod             = Number(form.codAmount) || 0;
  const total           = (form.paymentMethod === "cod" ? cod : 0) + shippingFee + insurance;

  const filteredClients = useMemo(() =>
    clients.filter(c => c.name.includes(clientSearch) || (c.phone || "").includes(clientSearch)),
    [clients, clientSearch]
  );

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  function selectClient(c: Client) {
    setForm(f => ({
      ...f, clientId: String(c.id),
      senderName: c.name, senderPhone: c.phone || "",
      senderPhone2: c.phone2 || "", senderCity: c.city || "",
    }));
    setClientSearch(c.name);
    setShowClientList(false);
  }

  const mutation = useMutation({
    mutationFn: (data: any) => apiFetch("/shipments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      toast({ title: "طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ط´ط­ظ†ط© ط¨ظ†ط¬ط§ط­ âœ…" });
      onClose();
    },
    onError: (e: any) => toast({ title: "ط®ط·ط£", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.senderName || !form.receiverName) {
      toast({ title: "ط§ظ„ط­ظ‚ظˆظ„ ط§ظ„ظ…ط·ظ„ظˆط¨ط©", description: "ط§ط³ظ… ط§ظ„ظ…ط±ط³ظ„ ظˆط§ط³ظ… ط§ظ„ظ…ط³طھظ„ظ… ظ…ط·ظ„ظˆط¨ط§ظ†", variant: "destructive" });
      return;
    }
    mutation.mutate({
      clientId:          form.clientId ? Number(form.clientId) : undefined,
      senderName:        form.senderName,
      senderPhone:       form.senderPhone || undefined,
      senderPhone2:      form.senderPhone2 || undefined,
      senderCity:        form.senderCity || undefined,
      receiverName:      form.receiverName,
      receiverPhone:     form.receiverPhone || undefined,
      receiverPhone2:    form.receiverPhone2 || undefined,
      receiverAddress:   form.receiverAddress || undefined,
      receiverCity:      form.receiverCity || undefined,
      zoneId:            form.zoneId      ? Number(form.zoneId)      : undefined,
      zonePrice:         zonePrice        || undefined,
      parcelType:        form.parcelType  || undefined,
      parcelTypePrice:   parcelPrice      || undefined,
      weight:            form.weight      || undefined,
      pieces:            Number(form.pieces) || 1,
      description:       form.description || undefined,
      declaredValue:     form.declaredValue || undefined,
      paymentMethod:     form.paymentMethod,
      codAmount:         cod              || undefined,
      shippingFee:       shippingFee      || undefined,
      insuranceFee:      insurance        || undefined,
      totalAmount:       total            || undefined,
      notes:             form.notes       || undefined,
      adSource:          form.adSource    || undefined,
      adCampaign:        form.adCampaign  || undefined,
      warehouseId:       form.warehouseId       ? Number(form.warehouseId)       : undefined,
      assignedUserId:    form.assignedUserId     ? Number(form.assignedUserId)     : undefined,
      shippingCompanyId: form.shippingCompanyId  ? Number(form.shippingCompanyId)  : undefined,
      status: "waiting",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <Package className="w-4 h-4 text-primary" /> ط´ط­ظ†ط© ط¬ط¯ظٹط¯ط©
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">

          {/* â”€â”€ ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط±ط³ظ„ / ط§ظ„ط¹ظ…ظٹظ„ â”€â”€ */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <User className="w-3.5 h-3.5" /> ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط±ط³ظ„ / ط§ظ„ط¹ظ…ظٹظ„
            </h3>
            <div>
              <Label className="text-xs font-bold mb-1.5 block">ط§ظ„ط¹ظ…ظٹظ„ (ط§ط®طھظٹط§ط±ظٹ)</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input className="pr-9 text-sm" placeholder="ط§ط¨ط­ط« ط¨ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„ ط£ظˆ ط±ظ‚ظ…ظ‡..."
                  value={clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setShowClientList(true); }}
                  onFocus={() => setShowClientList(true)} />
              </div>
              {showClientList && filteredClients.length > 0 && (
                <div className="relative">
                  <div className="absolute top-1 w-full bg-card border border-border rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                    {filteredClients.slice(0, 10).map(c => (
                      <button key={c.id} type="button" onClick={() => selectClient(c)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-right">
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">{c.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{c.name}</p>
                          {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-xs font-bold mb-1.5 block">ط§ط³ظ… ط§ظ„ط±ط§ط³ظ„ <span className="text-red-500">*</span></Label><Input className="text-sm" placeholder="ط§ظ„ط§ط³ظ… ط§ظ„ظƒط§ظ…ظ„" value={form.senderName} onChange={e => set("senderName", e.target.value)} /></div>
              <div><Label className="text-xs font-bold mb-1.5 block">ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ</Label><Input className="text-sm" placeholder="01XXXXXXXXX" value={form.senderPhone} onChange={e => set("senderPhone", e.target.value)} /></div>
              <div><Label className="text-xs font-bold mb-1.5 block">ظ‡ط§طھظپ 2</Label><Input className="text-sm" placeholder="ط±ظ‚ظ… ط¨ط¯ظٹظ„" value={form.senderPhone2} onChange={e => set("senderPhone2", e.target.value)} /></div>
              <div><Label className="text-xs font-bold mb-1.5 block">ط§ظ„ظ…ط¯ظٹظ†ط©</Label><Input className="text-sm" placeholder="ظ…ط¯ظٹظ†ط© ط§ظ„ظ…ط±ط³ظ„" value={form.senderCity} onChange={e => set("senderCity", e.target.value)} /></div>
            </div>
          </section>

          {/* â”€â”€ ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط³طھظ„ظ… â”€â”€ */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <MapPin className="w-3.5 h-3.5" /> ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط³طھظ„ظ… ظˆط§ظ„ط¹ظ†ظˆط§ظ†
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-xs font-bold mb-1.5 block">ط§ط³ظ… ط§ظ„ظ…ط³طھظ„ظ… <span className="text-red-500">*</span></Label><Input className="text-sm" placeholder="ط§ظ„ط§ط³ظ… ط§ظ„ظƒط§ظ…ظ„" value={form.receiverName} onChange={e => set("receiverName", e.target.value)} /></div>
              <div><Label className="text-xs font-bold mb-1.5 block">ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ</Label><Input className="text-sm" placeholder="01XXXXXXXXX" value={form.receiverPhone} onChange={e => set("receiverPhone", e.target.value)} /></div>
              <div><Label className="text-xs font-bold mb-1.5 block">ظ‡ط§طھظپ 2</Label><Input className="text-sm" placeholder="ط±ظ‚ظ… ط¨ط¯ظٹظ„" value={form.receiverPhone2} onChange={e => set("receiverPhone2", e.target.value)} /></div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">ط§ظ„ظ…ظ†ط·ظ‚ط© / ط§ظ„ظ…ط¯ظٹظ†ط©</Label>
                <Select value={form.zoneId} onValueChange={v => set("zoneId", v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="ط§ط®طھط± ط§ظ„ظ…ظ†ط·ظ‚ط©..." /></SelectTrigger>
                  <SelectContent>
                    {zones.filter(z => z.isActive !== false).map(z => (
                      <SelectItem key={z.id} value={String(z.id)}>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{z.name}{z.governorate ? ` â€” ${z.governorate}` : ""}</span>
                          <span className="text-xs text-muted-foreground font-bold">{fc(Number(z.price))}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedZone && <p className="text-[10px] text-primary mt-1">ط³ط¹ط± ط§ظ„طھظˆطµظٹظ„: {fc(Number(selectedZone.price))}</p>}
              </div>
              <div className="sm:col-span-2"><Label className="text-xs font-bold mb-1.5 block">ط§ظ„ط¹ظ†ظˆط§ظ† ط§ظ„طھظپطµظٹظ„ظٹ</Label><Input className="text-sm" placeholder="ط§ظ„ط´ط§ط±ط¹طŒ ط§ظ„ظ…ط¨ظ†ظ‰طŒ ط§ظ„ط´ظ‚ط©..." value={form.receiverAddress} onChange={e => set("receiverAddress", e.target.value)} /></div>
            </div>
          </section>

          {/* â”€â”€ طھظپط§طµظٹظ„ ط§ظ„ط´ط­ظ†ط© â”€â”€ */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <Boxes className="w-3.5 h-3.5" /> طھظپط§طµظٹظ„ ط§ظ„ط´ط­ظ†ط©
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold mb-1.5 block">ظ†ظˆط¹ ط§ظ„ط´ط­ظ†ط©</Label>
                <Select value={form.parcelType} onValueChange={v => set("parcelType", v as ParcelType)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="ط§ط®طھط± ظ†ظˆط¹ ط§ظ„ط´ط­ظ†ط©..." /></SelectTrigger>
                  <SelectContent>
                    {parcelPricing.filter(p => (p as any).isActive !== false).map(p => (
                      <SelectItem key={p.id} value={p.parcelType}>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{p.label || PARCEL_LABELS[p.parcelType] || p.parcelType}</span>
                          <span className="text-xs text-muted-foreground font-bold">{fc(Number(p.basePrice))}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPricing && <p className="text-[10px] text-primary mt-1">ط³ط¹ط± ط§ظ„ظ†ظˆط¹: {fc(Number(selectedPricing.basePrice))}</p>}
              </div>
              <div><Label className="text-xs font-bold mb-1.5 block">ط§ظ„ظˆط²ظ† (ظƒط¬ظ…)</Label><Input type="number" className="text-sm" placeholder="0.00" value={form.weight} onChange={e => set("weight", e.target.value)} /></div>
              <div><Label className="text-xs font-bold mb-1.5 block">ط¹ط¯ط¯ ط§ظ„ظ‚ط·ط¹</Label><Input type="number" min="1" className="text-sm" value={form.pieces} onChange={e => set("pieces", e.target.value)} /></div>
              <div><Label className="text-xs font-bold mb-1.5 block">ط§ظ„ظ‚ظٹظ…ط© ط§ظ„ظ…ط¹ظ„ظ†ط© (ط¬ظ†ظٹظ‡)</Label><Input type="number" className="text-sm" placeholder="0" value={form.declaredValue} onChange={e => set("declaredValue", e.target.value)} /></div>
              <div className="sm:col-span-2"><Label className="text-xs font-bold mb-1.5 block">ظˆطµظپ ط§ظ„ط´ط­ظ†ط©</Label><Input className="text-sm" placeholder="ظ…ط­طھظˆظ‰ ط§ظ„ط´ط­ظ†ط©..." value={form.description} onChange={e => set("description", e.target.value)} /></div>
            </div>
          </section>

          {/* â”€â”€ ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط§ظ„ظٹط© â”€â”€ */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <CreditCard className="w-3.5 h-3.5" /> ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط§ظ„ظٹط©
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <Label className="text-xs font-bold mb-2 block">ط·ط±ظٹظ‚ط© ط§ظ„ط¯ظپط¹</Label>
                <div className="flex flex-wrap gap-2">
                  {(["cod","prepaid","deferred"] as PaymentMethod[]).map(m => (
                    <button key={m} type="button" onClick={() => set("paymentMethod", m)}
                      className={`flex-1 min-w-[120px] px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        form.paymentMethod === m ? PAYMENT_COLORS[m] + " ring-2 ring-offset-1 ring-current/30" : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"
                      }`}>{PAYMENT_LABELS[m]}</button>
                  ))}
                </div>
              </div>
              {form.paymentMethod === "cod" && (
                <div><Label className="text-xs font-bold mb-1.5 block">ظ…ط¨ظ„ط؛ ط§ظ„طھط­طµظٹظ„ (COD)</Label><Input type="number" className="text-sm" placeholder="0" value={form.codAmount} onChange={e => set("codAmount", e.target.value)} /></div>
              )}
              <div><Label className="text-xs font-bold mb-1.5 block">ط±ط³ظˆظ… ط§ظ„طھط£ظ…ظٹظ†</Label><Input type="number" className="text-sm" placeholder="0" value={form.insuranceFee} onChange={e => set("insuranceFee", e.target.value)} /></div>
            </div>
            {/* ظ…ظ„ط®طµ ط§ظ„ط­ط³ط§ط¨ */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <h4 className="text-xs font-black text-primary">ظ…ظ„ط®طµ ط§ظ„طھظƒط§ظ„ظٹظپ</h4>
              <div className="space-y-1.5">
                {[
                  { label: "ط³ط¹ط± ظ…ظ†ط·ظ‚ط© ط§ظ„طھظˆطµظٹظ„", value: fc(zonePrice) },
                  { label: "ط¥ط¶ط§ظپط© ظ†ظˆط¹ ط§ظ„ط´ط­ظ†ط©",  value: fc(parcelPrice) },
                  { label: "ط±ط³ظˆظ… ط§ظ„طھط£ظ…ظٹظ†",       value: fc(insurance) },
                  form.paymentMethod === "cod" ? { label: "ظ…ط¨ظ„ط؛ ط§ظ„طھط­طµظٹظ„ (COD)", value: fc(cod), highlight: true } : null,
                ].filter(Boolean).map((row: any, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`font-bold ${row.highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>{row.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-black border-t border-primary/20 pt-2 mt-1">
                  <span>ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ</span>
                  <span className="text-primary">{fc(total)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* â”€â”€ ظ…ظ„ط§ط­ط¸ط§طھ â”€â”€ */}
          <div>
            <Label className="text-xs font-bold mb-1.5 block">ظ…ظ„ط§ط­ط¸ط§طھ</Label>
            <Input className="text-sm" placeholder="ط£ظٹ طھط¹ظ„ظٹظ…ط§طھ ط®ط§طµط©..." value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>

          {/* â”€â”€ ط§ظ„ظ…ط®ط²ظ† â”€â”€ */}
          <section className="space-y-3 rounded-xl border border-teal-900/40 bg-teal-900/5 p-4">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <Warehouse className="w-3.5 h-3.5 text-teal-400" /> ط§ظ„ظ…ط®ط²ظ†
            </h3>
            <div>
              <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1"><Warehouse className="w-3 h-3" /> ط§ط®طھط± ط§ظ„ظ…ط®ط²ظ† <span className="text-red-500">*</span></Label>
              <Select value={form.warehouseId || "none"} onValueChange={v => set("warehouseId", v === "none" ? "" : v)}>
                <SelectTrigger className="text-sm h-10 bg-card">
                  <div className="flex items-center gap-2"><Warehouse className="w-3.5 h-3.5 text-teal-400" /><SelectValue placeholder="ط§ط®طھط± ط§ظ„ظ…ط®ط²ظ†..." /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">â€” ط؛ظٹط± ظ…ط­ط¯ط¯ â€”</SelectItem>
                  {warehouses.map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      <div className="flex items-center gap-2"><Warehouse className="w-3 h-3 text-teal-400" /><span>{w.name}{w.city ? ` â€” ${w.city}` : ""}{w.isDefault ? " âک…" : ""}</span></div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.warehouseId && <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">âڑ  ط§ط®طھط± ط§ظ„ظ…ط®ط²ظ† ظ„طھط­ط¯ظٹط¯ ظ…ظƒط§ظ† ط§ظ„ط´ط­ظ†ط©</p>}
              {form.warehouseId  && <p className="text-[10px] text-teal-400 mt-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />ط§ظ„ط´ط­ظ†ط© ط³طھظڈظˆط¯ظژط¹ ظپظٹ ظ‡ط°ط§ ط§ظ„ظ…ط®ط²ظ† ط¹ظ†ط¯ ط§ظ„ط§ط³طھظ„ط§ظ…</p>}
            </div>
          </section>

          {/* â”€â”€ ط´ط±ظƒط© ط§ظ„ط´ط­ظ† â”€â”€ */}
          <section className="space-y-3 rounded-xl border border-sky-900/40 bg-sky-900/5 p-4">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <Truck className="w-3.5 h-3.5 text-sky-400" /> ط´ط±ظƒط© ط§ظ„ط´ط­ظ†
            </h3>
            <div>
              <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1"><Truck className="w-3 h-3" /> ط´ط±ظƒط© ط§ظ„ط´ط­ظ†</Label>
              <Select value={form.shippingCompanyId || "none"} onValueChange={v => set("shippingCompanyId", v === "none" ? "" : v)}>
                <SelectTrigger className="text-sm h-10 bg-card">
                  <div className="flex items-center gap-2"><Truck className="w-3.5 h-3.5 text-sky-400" /><SelectValue placeholder="ط§ط®طھط± ط´ط±ظƒط© ط§ظ„ط´ط­ظ†..." /></div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">â€” ط؛ظٹط± ظ…ط­ط¯ط¯ â€”</SelectItem>
                  {shippingCompanies.filter(c => c.isActive !== false).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <div className="flex items-center gap-2"><Truck className="w-3 h-3 text-sky-400" /><span>{c.name}</span></div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.shippingCompanyId && <p className="text-[10px] text-sky-400 mt-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />طھظ… طھط­ط¯ظٹط¯ ط´ط±ظƒط© ط§ظ„ط´ط­ظ†</p>}
            </div>
          </section>

          {/* â”€â”€ طھطھط¨ط¹ ط§ظ„ط¥ط¹ظ„ط§ظ† ظˆط§ظ„ظپط±ظٹظ‚ â”€â”€ */}
          <section className="space-y-3 rounded-xl border border-purple-900/40 bg-purple-900/5 p-4">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <Megaphone className="w-3.5 h-3.5 text-purple-400" /> طھطھط¨ط¹ ط§ظ„ط¥ط¹ظ„ط§ظ† ظˆط§ظ„ظپط±ظٹظ‚
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1"><Megaphone className="w-3 h-3" /> ظ…طµط¯ط± ط§ظ„ط·ظ„ط¨</Label>
                <Select value={form.adSource || "none"} onValueChange={v => set("adSource", v === "none" ? "" : v)}>
                  <SelectTrigger className="text-sm h-10 bg-card">
                    <SelectValue placeholder="ط§ط®طھط± ط§ظ„ظ…طµط¯ط±">
                      {form.adSource && form.adSource !== "none" && (
                        <span className="flex items-center gap-2">
                          <AdSourceIcon value={form.adSource} />
                          {AD_SOURCES.find(s => s.value === form.adSource)?.label}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">â€” ط؛ظٹط± ظ…ط­ط¯ط¯ â€”</SelectItem>
                    {AD_SOURCES.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="flex items-center gap-2"><AdSourceIcon value={s.value} />{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">ط§ط³ظ… ط§ظ„ط­ظ…ظ„ط©</Label>
                <Input className="text-sm h-10 bg-card" placeholder="Summer 2025..." value={form.adCampaign} onChange={e => set("adCampaign", e.target.value)} />
              </div>
              {isAdmin && (
                <div>
                  <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1"><UserCheck className="w-3 h-3" /> ط§ظ„ظ…ظˆط¸ظپ ط§ظ„ظ…ط³ط¤ظˆظ„</Label>
                  <Select value={form.assignedUserId || "none"} onValueChange={v => set("assignedUserId", v === "none" ? "" : v)}>
                    <SelectTrigger className="text-sm h-10 bg-card"><SelectValue placeholder="ط§ط®طھط± ظ…ظˆط¸ظپ" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">â€” ط؛ظٹط± ظ…ط­ط¯ط¯ â€”</SelectItem>
                      {users.filter((u: any) => u.isActive).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

          {/* â”€â”€ ط£ط²ط±ط§ط± â”€â”€ */}
          <div className="flex gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={onClose} className="flex-1">ط¥ظ„ط؛ط§ط،</Button>
            <Button onClick={handleSubmit} disabled={mutation.isPending} className="flex-1 gap-2">
              {mutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              ط¥ظ†ط´ط§ط، ط§ظ„ط´ط­ظ†ط©
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}


// â”€â”€â”€ Edit Status Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EditStatusDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<ShipmentStatus>(shipment.status as ShipmentStatus);
  const [tracking, setTracking] = useState(shipment.trackingNumber || "");
  const [collected, setCollected] = useState(String(shipment.collectedAmount || "0"));

  const mutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch(`/shipments/${shipment.id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["shipments-stats"] });
      toast({ title: "طھظ… طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ط´ط­ظ†ط© âœ…" });
      onClose();
    },
    onError: (e: any) => toast({ title: "ط®ط·ط£", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm font-black flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            طھط­ط¯ظٹط« ط´ط­ظ†ط© #{shipment.shipmentNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs font-bold mb-2 block">ط§ظ„ط­ط§ظ„ط©</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(STATUS_CFG) as ShipmentStatus[]).map(s => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={`text-[11px] font-bold px-3 py-2 rounded-lg border transition-all ${
                    status === s ? STATUS_CFG[s].cls + " ring-1 ring-offset-1 ring-current/20" : "bg-muted/30 text-muted-foreground border-border"
                  }`}>
                  {STATUS_CFG[s].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold mb-1.5 block">ط±ظ‚ظ… ط§ظ„طھطھط¨ط¹</Label>
            <Input className="text-sm" placeholder="ط±ظ‚ظ… ط§ظ„طھطھط¨ط¹ ظ…ظ† ط´ط±ظƒط© ط§ظ„ط´ط­ظ†" value={tracking} onChange={e => setTracking(e.target.value)} />
          </div>
          {(shipment.paymentMethod === "cod" || status === "delivered") && (
            <div>
              <Label className="text-xs font-bold mb-1.5 block">ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„ظ…ط­طµظژظ‘ظ„</Label>
              <Input type="number" className="text-sm" value={collected} onChange={e => setCollected(e.target.value)} />
            </div>
          )}
          <div className="flex gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={onClose} className="flex-1 text-xs">ط¥ظ„ط؛ط§ط،</Button>
            <Button onClick={() => mutation.mutate({ status, trackingNumber: tracking || undefined, collectedAmount: Number(collected) })}
              disabled={mutation.isPending} className="flex-1 text-xs gap-1.5">
              {mutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              ط­ظپط¸
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ Shipment Row Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ShipmentCard({ shipment, onEdit, onDelete }: { shipment: Shipment; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all group">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-xs font-black text-foreground">{shipment.shipmentNumber}</span>
            <StatusBadge status={shipment.status as ShipmentStatus} />
            <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${PAYMENT_COLORS[shipment.paymentMethod as PaymentMethod]}`}>
              {PAYMENT_LABELS[shipment.paymentMethod as PaymentMethod]}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <User className="w-3 h-3 shrink-0" />
              <span className="truncate font-medium">{shipment.senderName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{shipment.receiverName}</span>
            </div>
            {shipment.receiverCity && (
              <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                <Building2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{shipment.receiverCity}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black text-primary">{fc(shipment.totalAmount || 0)}</span>
              {shipment.parcelType && (
                <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                  {PARCEL_LABELS[shipment.parcelType as ParcelType] ?? shipment.parcelType}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 px-2 text-xs">
                <Edit className="w-3 h-3 ml-1" /> طھط­ط¯ظٹط«
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
          {shipment.trackingNumber && (
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" /> {shipment.trackingNumber}
            </p>
          )}

          {/* ظ…ظ„ط§ط­ط¸ط© ط§ظ„ط§ط³طھظ„ط§ظ… */}
          {(shipment.status === "returned" || shipment.status === "partial_received") && (() => {
            const received = shipment.returnReceived === 1 || shipment.returnReceived === true;
            const isRet    = shipment.status === "returned";
            return (
              <div className={`flex items-center gap-1.5 mt-2 px-2 py-1 rounded-md text-[10px] font-semibold border ${
                received
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-400"
              }`}>
                <span>{received ? "âœ“" : "âڈ³"}</span>
                <span>
                  {received
                    ? (isRet ? "طھظ… ط§ط³طھظ„ط§ظ… ط§ظ„ط´ط­ظ†ط© ط§ظ„ظ…ط±طھط¬ط¹ط© ط¨ظ†ط¬ط§ط­" : "طھظ… ط§ط³طھظ„ط§ظ… ط§ظ„ظƒظ…ظٹط© ط§ظ„ط¬ط²ط¦ظٹط© ط¨ظ†ط¬ط§ط­")
                    : (isRet ? "ط¨ط§ظ†طھط¸ط§ط± ط§ط³طھظ„ط§ظ… ط§ظ„ط´ط­ظ†ط© ط§ظ„ظ…ط±طھط¬ط¹ط©"  : "ط¨ط§ظ†طھط¸ط§ط± ط§ط³طھظ„ط§ظ… ط§ظ„ظƒظ…ظٹط© ط§ظ„ط¬ط²ط¦ظٹط©")}
                </span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ طھطµظ†ظٹظپط§طھ ط§ظ„ط¹ظ…ظ„ط§ط، â€” ط«ط§ط¨طھط© ظ„ظ„ظ€ UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TIER_INFO = [
  {
    key:   "normal"     as const,
    label: "ط¹ط§ط¯ظٹ",
    range: "ظ، â€“ ظ¢ظ ظ  ط´ط­ظ†ط© / ط´ظ‡ط±",
    color: "text-slate-400",
    border:"border-slate-600/60",
    bg:    "bg-slate-800/30",
    dot:   "bg-slate-400",
    field: "priceNormal" as const,
    placeholder: "ط³ط¹ط± ط§ظ„ط¹ظ…ظٹظ„ ط§ظ„ط¹ط§ط¯ظٹ",
  },
  {
    key:   "commercial" as const,
    label: "طھط¬ط§ط±ظٹ",
    range: "ظ¢ظ ظ، â€“ ظ¥ظ ظ  ط´ط­ظ†ط© / ط´ظ‡ط±",
    color: "text-blue-400",
    border:"border-blue-600/60",
    bg:    "bg-blue-900/20",
    dot:   "bg-blue-400",
    field: "priceCommercial" as const,
    placeholder: "ط³ط¹ط± ط§ظ„ط¹ظ…ظٹظ„ ط§ظ„طھط¬ط§ط±ظٹ",
  },
  {
    key:   "vip" as const,
    label: "VIP",
    range: "ظ¥ظ ظ، â€“ ظ،ظ ظ ظ  ط´ط­ظ†ط© / ط´ظ‡ط±",
    color: "text-amber-400",
    border:"border-amber-600/60",
    bg:    "bg-amber-900/20",
    dot:   "bg-amber-400",
    field: "priceVip" as const,
    placeholder: "ط³ط¹ط± ط¹ظ…ظٹظ„ VIP",
  },
] as const;

type ZoneFormState = {
  name: string; governorate: string;
  priceNormal: string; priceCommercial: string; priceVip: string;
};
const emptyZoneForm = (): ZoneFormState => ({ name: "", governorate: "", priceNormal: "", priceCommercial: "", priceVip: "" });

// â”€â”€â”€ Zones Settings Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ZonesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<ZoneFormState>(emptyZoneForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ZoneFormState>(emptyZoneForm());

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ["shipment-zones"],
    queryFn: () => apiFetch<ShipmentZone[]>("/shipment-zones"),
  });

  const addMutation = useMutation({
    mutationFn: (d: any) => apiFetch("/shipment-zones", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-zones"] });
      toast({ title: "طھظ…طھ ط¥ط¶ط§ظپط© ط§ظ„ظ…ظ†ط·ظ‚ط© âœ…" });
      setForm(emptyZoneForm());
    },
    onError: (e: any) => toast({ title: "ط®ط·ط£", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => apiFetch(`/shipment-zones/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-zones"] });
      toast({ title: "طھظ… ط§ظ„طھط­ط¯ظٹط« âœ…" });
      setEditId(null);
    },
    onError: (e: any) => toast({ title: "ط®ط·ط£", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/shipment-zones/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shipment-zones"] }); toast({ title: "طھظ… ط§ظ„ط­ط°ظپ" }); },
    onError: (e: any) => toast({ title: "ط®ط·ط£", description: e.message, variant: "destructive" }),
  });

  function startEdit(z: ShipmentZone & { priceNormal?: string; priceCommercial?: string; priceVip?: string }) {
    setEditId(z.id);
    setEditForm({
      name:           z.name,
      governorate:    z.governorate || "",
      priceNormal:    String(z.priceNormal     ?? z.price ?? "0"),
      priceCommercial:String(z.priceCommercial ?? "0"),
      priceVip:       String(z.priceVip        ?? "0"),
    });
  }

  function submitAdd() {
    if (!form.name) return;
    addMutation.mutate({
      name: form.name,
      governorate: form.governorate || undefined,
      priceNormal:     Number(form.priceNormal     || 0),
      priceCommercial: Number(form.priceCommercial || 0),
      priceVip:        Number(form.priceVip        || 0),
      isActive: true,
    });
  }

  function submitEdit(id: number) {
    updateMutation.mutate({
      id,
      name:            editForm.name,
      governorate:     editForm.governorate || undefined,
      priceNormal:     Number(editForm.priceNormal     || 0),
      priceCommercial: Number(editForm.priceCommercial || 0),
      priceVip:        Number(editForm.priceVip        || 0),
    });
  }

  // ظ…ظƒظˆظ‘ظ† طµط؛ظٹط± â€” ط´ط±ظٹط­ط© ط§ظ„ط³ط¹ط± ظ„ظƒظ„ tier ط¯ط§ط®ظ„ ط§ظ„ط¨ط·ط§ظ‚ط©
  function TierPriceChip({ tier, value }: { tier: typeof TIER_INFO[number]; value: string | number }) {
    const n = Number(value) || 0;
    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${tier.border} ${tier.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tier.dot}`} />
        <span className={`text-[9px] font-bold ${tier.color}`}>{tier.label}</span>
        <span className={`text-[11px] font-black ${tier.color} mr-auto`}>
          {n > 0 ? fc(n) : <span className="text-muted-foreground/50 font-normal text-[9px]">â€”</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* â”€â”€ Tier Legend (ط´ط±ط­ ظ…ط±ط© ظˆط§ط­ط¯ط© ظپظٹ ط§ظ„ط£ط¹ظ„ظ‰) â”€â”€ */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            طھطµظ†ظٹظپط§طھ ط§ظ„ط¹ظ…ظ„ط§ط، â€” ظ†ط·ط§ظ‚ط§طھ ط§ظ„ط´ط­ظ† ط§ظ„ط´ظ‡ط±ظٹط©
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {TIER_INFO.map(t => (
              <div key={t.key} className={`p-2.5 rounded-xl border ${t.border} ${t.bg} text-center`}>
                <span className={`text-[11px] font-black block ${t.color}`}>{t.label}</span>
                <span className="text-[9px] text-muted-foreground mt-0.5 block">{t.range}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* â”€â”€ Add Zone â”€â”€ */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-500" /> ط¥ط¶ط§ظپط© ظ…ظ†ط·ظ‚ط© ط¬ط¯ظٹط¯ط©
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* ط§ظ„ط§ط³ظ… ظˆط§ظ„ظ…ط­ط§ظپط¸ط© */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold mb-1.5 block">ط§ط³ظ… ط§ظ„ظ…ظ†ط·ظ‚ط© / ط§ظ„ظ…ط¯ظٹظ†ط© <span className="text-red-500">*</span></Label>
              <Input className="text-sm" placeholder="ظ…ط«ط§ظ„: ط§ظ„ظ‚ط§ظ‡ط±ط©" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-bold mb-1.5 block">ط§ظ„ظ…ط­ط§ظپط¸ط©</Label>
              <Input className="text-sm" placeholder="ظ…ط«ط§ظ„: ط§ظ„ظ‚ط§ظ‡ط±ط© ط§ظ„ظƒط¨ط±ظ‰" value={form.governorate}
                onChange={e => setForm(f => ({ ...f, governorate: e.target.value }))} />
            </div>
          </div>

          {/* ط£ط³ط¹ط§ط± ط§ظ„طھظٹط±ط² */}
          <div className="p-3 rounded-xl border border-border bg-muted/10 space-y-2.5">
            <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" />ط³ط¹ط± ط§ظ„طھظˆطµظٹظ„ ط­ط³ط¨ طھطµظ†ظٹظپ ط§ظ„ط¹ظ…ظٹظ„
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {TIER_INFO.map(t => (
                <div key={t.key}>
                  <Label className={`text-[10px] font-bold mb-1 block flex items-center gap-1 ${t.color}`}>
                    <span className={`w-2 h-2 rounded-full ${t.dot}`} />
                    {t.label}
                    <span className="text-muted-foreground font-normal text-[9px] mr-0.5">({t.range})</span>
                  </Label>
                  <Input
                    type="number" min={0} step="0.5"
                    className={`text-sm h-9 border ${t.border} focus:border-current`}
                    placeholder="0"
                    value={form[t.field]}
                    onChange={e => setForm(f => ({ ...f, [t.field]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <Button className="gap-2 text-xs" size="sm"
            disabled={!form.name || addMutation.isPending}
            onClick={submitAdd}>
            {addMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            ط¥ط¶ط§ظپط© ط§ظ„ظ…ظ†ط·ظ‚ط©
          </Button>
        </CardContent>
      </Card>

      {/* â”€â”€ Zones List â”€â”€ */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black">ط§ظ„ظ…ظ†ط§ط·ظ‚ ط§ظ„ظ…ط¶ط§ظپط© ({zones.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : zones.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">ظ„ط§ طھظˆط¬ط¯ ظ…ظ†ط§ط·ظ‚ â€” ط£ط¶ظپ ظ…ظ†ط·ظ‚ط© ظ…ظ† ط§ظ„ط£ط¹ظ„ظ‰</p>
          ) : (
            <div className="space-y-3">
              {(zones as any[]).map(z => (
                <div key={z.id} className="rounded-xl border border-border bg-muted/10 overflow-hidden">

                  {editId === z.id ? (
                    /* â”€â”€ ظˆط¶ط¹ ط§ظ„طھط¹ط¯ظٹظ„ â”€â”€ */
                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] font-bold mb-1 block">ط§ظ„ط§ط³ظ…</Label>
                          <Input className="text-xs h-8" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold mb-1 block">ط§ظ„ظ…ط­ط§ظپط¸ط©</Label>
                          <Input className="text-xs h-8" value={editForm.governorate} onChange={e => setEditForm(f => ({ ...f, governorate: e.target.value }))} />
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border bg-muted/10 space-y-2">
                        <p className="text-[9px] font-bold text-muted-foreground">ط£ط³ط¹ط§ط± ط§ظ„طھظˆطµظٹظ„ ط­ط³ط¨ ط§ظ„طھطµظ†ظٹظپ</p>
                        <div className="grid grid-cols-3 gap-2">
                          {TIER_INFO.map(t => (
                            <div key={t.key}>
                              <Label className={`text-[9px] font-bold mb-1 block ${t.color}`}>{t.label}</Label>
                              <Input
                                type="number" min={0} className={`text-xs h-8 border ${t.border}`}
                                value={editForm[t.field]}
                                onChange={e => setEditForm(f => ({ ...f, [t.field]: e.target.value }))}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-8 text-xs px-4" onClick={() => submitEdit(z.id)} disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : "ط­ظپط¸ ط§ظ„طھط¹ط¯ظٹظ„ط§طھ"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditId(null)}>ط¥ظ„ط؛ط§ط،</Button>
                      </div>
                    </div>
                  ) : (
                    /* â”€â”€ ظˆط¶ط¹ ط§ظ„ط¹ط±ط¶ â”€â”€ */
                    <div className="p-3">
                      {/* ط±ط£ط³ ط§ظ„ط¨ط·ط§ظ‚ط© */}
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-cyan-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold">{z.name}</p>
                          {z.governorate && <p className="text-[10px] text-muted-foreground">{z.governorate}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(z)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => { if (confirm("ط­ط°ظپ ط§ظ„ظ…ظ†ط·ظ‚ط©طں")) deleteMutation.mutate(z.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* ط´ط±ط§ط¦ط­ ط§ظ„ط£ط³ط¹ط§ط± */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {TIER_INFO.map(t => (
                          <TierPriceChip key={t.key} tier={t} value={z[t.field] ?? (t.field === "priceNormal" ? z.price : "0")} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ShipmentsPage() {
  return (
    <div className="space-y-5" dir="rtl">

      {/* â”€â”€ Header â”€â”€ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط´ط­ظ†
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">ط¥ط¯ط§ط±ط© ط§ظ„ظ…ظ†ط§ط·ظ‚</p>
        </div>
      </div>

      <ZonesTab />
    </div>
  );
}
