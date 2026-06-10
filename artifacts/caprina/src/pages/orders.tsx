import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { format } from "date-fns";
import { Search, Filter, Plus, Package, CalendarDays, X, RotateCcw, MessageCircle, Trash2, CheckSquare, RefreshCw, ChevronUp, ChevronDown, Download, FileText, Truck, MapPin, Clock, CheckCircle, AlertTriangle, XCircle, CreditCard, Boxes } from "lucide-react";
import { useUpdateOrder } from "@workspace/api-client-react";
import type { UpdateOrderBodyStatus } from "@workspace/api-zod";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { returnReasonLabel } from "@/lib/order-constants";
import { type WhatsAppOrderData, type WaSettings, applyTemplate, applyShippingTemplate, buildWhatsAppLink } from "@/lib/whatsapp";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ordersApi, shippingApi, apiFetch } from "@/lib/api";

// Local type alias – includes warehouse_ready which older generated types may omit
type OrderStatusValue = "pending" | "warehouse_ready" | "in_shipping" | "received" | "delayed" | "returned" | "partial_received";

const statusLabels: Record<string, string> = {
  pending:          "قيد الانتظار",
  warehouse_ready:  "قيد الشحن في المخزن",
  in_shipping:      "قيد الشحن",
  received:         "استلم",
  delayed:          "مؤجل",
  returned:         "مرتجع",
  partial_received: "استلم جزئي",
};

const statusClasses: Record<string, string> = {
  pending:          "bg-amber-50   dark:bg-amber-900/30   text-amber-700   dark:text-amber-400   border-amber-300   dark:border-amber-800",
  warehouse_ready:  "bg-teal-50    dark:bg-teal-900/30    text-teal-700    dark:text-teal-400    border-teal-300    dark:border-teal-800",
  in_shipping:      "bg-sky-50     dark:bg-sky-900/30     text-sky-700     dark:text-sky-400     border-sky-300     dark:border-sky-800",
  received:         "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
  delayed:          "bg-blue-50    dark:bg-blue-900/30    text-blue-700    dark:text-blue-400    border-blue-300    dark:border-blue-800",
  returned:         "bg-red-50     dark:bg-red-900/30     text-red-700     dark:text-red-400     border-red-300     dark:border-red-800",
  partial_received: "bg-purple-50  dark:bg-purple-900/30  text-purple-700  dark:text-purple-400  border-purple-300  dark:border-purple-800",
};

const STATUS_OPTIONS = [
  { value: "pending",          label: "قيد الانتظار",          color: "text-amber-500" },
  { value: "warehouse_ready",  label: "قيد الشحن في المخزن",   color: "text-teal-500" },
  { value: "in_shipping",      label: "قيد الشحن",              color: "text-sky-500" },
  { value: "received",         label: "استلم",                  color: "text-emerald-500" },
  { value: "delayed",          label: "مؤجل",                   color: "text-blue-500" },
  { value: "returned",         label: "مرتجع",                  color: "text-red-500" },
  { value: "partial_received", label: "استلم جزئي",             color: "text-purple-500" },
];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(amount);

// ── Shipment Types & Constants ─────────────────────────────────────────────
type ShipmentStatus = "waiting"|"confirmed"|"picked_up"|"in_transit"|"out_for_delivery"|"delivered"|"delayed"|"returned"|"cancelled";
type ShipPaymentMethod = "cod"|"prepaid"|"deferred";
type ParcelType = "document"|"normal"|"fragile"|"heavy"|"electronics"|"clothing"|"food"|"other";

interface Shipment {
  id: number; shipmentNumber?: string; trackingNumber?: string;
  senderName: string; senderPhone?: string;
  receiverName: string; receiverPhone?: string; receiverCity?: string;
  parcelType?: ParcelType; paymentMethod: ShipPaymentMethod;
  codAmount?: string|number; shippingFee?: string|number;
  status: ShipmentStatus; createdAt: string; createdByName?: string;
}
interface ShipmentZone { id: number; name: string; governorate?: string; price: string|number; isActive?: boolean }
interface ParcelTypePricing { id: number; parcelType: ParcelType; label?: string; basePrice: string|number }
interface Client { id: number; name: string; phone?: string }

const SHIP_STATUS_CFG: Record<ShipmentStatus, { label: string; icon: React.ElementType; cls: string }> = {
  waiting:          { label: "انتظار",        icon: Clock,         cls: "bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600" },
  confirmed:        { label: "مؤكدة",         icon: CheckCircle,   cls: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700" },
  picked_up:        { label: "تم الاستلام",   icon: Package,       cls: "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-700" },
  in_transit:       { label: "في الطريق",     icon: Truck,         cls: "bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-700" },
  out_for_delivery: { label: "خرجت للتسليم", icon: MapPin,        cls: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700" },
  delivered:        { label: "تم التسليم",    icon: CheckCircle,   cls: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700" },
  delayed:          { label: "متأخرة",        icon: AlertTriangle, cls: "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700" },
  returned:         { label: "مرتجع",         icon: RotateCcw,     cls: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700" },
  cancelled:        { label: "ملغية",         icon: XCircle,       cls: "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-600" },
};
const SHIP_PAYMENT_LABELS: Record<ShipPaymentMethod, string> = {
  cod: "الدفع عند الاستلام", prepaid: "مدفوع مسبقاً", deferred: "الدفع لاحق",
};
const SHIP_PAYMENT_COLORS: Record<ShipPaymentMethod, string> = {
  cod:      "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700",
  prepaid:  "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700",
  deferred: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700",
};
const PARCEL_LABELS: Record<ParcelType, string> = {
  document:"مستندات", normal:"طرد عادي", fragile:"قابل للكسر",
  heavy:"ثقيل", electronics:"إلكترونيات", clothing:"ملابس", food:"طعام", other:"أخرى",
};
const shipFmt = (d: string) => new Date(d).toLocaleDateString("ar-EG", { year:"numeric", month:"short", day:"numeric" });
const shipFc  = (n: number|string) => new Intl.NumberFormat("ar-EG", { style:"currency", currency:"EGP", maximumFractionDigits:0 }).format(Number(n)||0);

function apiHeaders() {
  const token = localStorage.getItem("caprina_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function shipApiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { headers: apiHeaders(), ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || r.statusText); }
  return r.json();
}

// ── Shipment ColFilter types ───────────────────────────────────────────────
type ShipColKey = "num"|"date"|"sender"|"receiver"|"city"|"parcel"|"payment"|"fee"|"cod"|"status"|"creator";
type ShipColFilters = Record<ShipColKey, Set<string>>;

// ── ShipColFilterBtn ───────────────────────────────────────────────────────
function ShipColFilterBtn({ col, colFilters, getColOptions, toggleColFilter, clearColFilter, sortCol, sortDir, onSort }: {
  col: ShipColKey; colFilters: ShipColFilters;
  getColOptions: (col: ShipColKey) => string[];
  toggleColFilter: (col: ShipColKey, val: string) => void;
  clearColFilter: (col: ShipColKey) => void;
  sortCol: ShipColKey | null; sortDir: "asc"|"desc";
  onSort: (col: ShipColKey, dir: "asc"|"desc") => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const active = colFilters[col].size > 0;
  const isSorted = sortCol === col;
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current  && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const panelW = 208;
      setPos({ top: r.bottom + 4, left: Math.max(4, Math.min(r.left, window.innerWidth - panelW - 4)) });
    }
    setOpen(o => !o); setSearch("");
  };
  let opts = getColOptions(col);
  if (search) opts = opts.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <button ref={btnRef} type="button" onClick={handleOpen} title="فلتر"
        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-all shrink-0 ${active ? "text-primary bg-primary/15" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
        {active ? <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                : <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} style={{ position:"fixed", top:pos.top, left:pos.left, zIndex:9999 }}
          className="bg-background border border-border rounded-lg shadow-2xl text-[11px] w-52" dir="rtl">
          <div className="flex gap-1 p-2 border-b border-border/50">
            <button type="button" onClick={() => { onSort(col,"asc"); setOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${isSorted && sortDir==="asc" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronUp className="w-2.5 h-2.5"/>أ→ي
            </button>
            <button type="button" onClick={() => { onSort(col,"desc"); setOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${isSorted && sortDir==="desc" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronDown className="w-2.5 h-2.5"/>ي→أ
            </button>
          </div>
          <div className="px-2 pt-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في القيم..."
              className="w-full h-7 text-[10px] px-2 border border-border rounded bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"/>
          </div>
          <div className="max-h-52 overflow-y-auto px-1 py-1.5 flex flex-col gap-0.5">
            {opts.length === 0
              ? <p className="text-muted-foreground text-center py-3 text-[10px]">لا توجد قيم</p>
              : opts.map(val => (
                <label key={val} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer">
                  <input type="checkbox" checked={colFilters[col].has(val)} onChange={() => toggleColFilter(col,val)} className="accent-primary w-3 h-3 shrink-0"/>
                  <span className="truncate">{val}</span>
                </label>
              ))}
          </div>
          {active && (
            <div className="border-t border-border/50 px-2 py-1.5">
              <button type="button" onClick={() => { clearColFilter(col); setOpen(false); }}
                className="text-destructive text-[10px] hover:underline w-full text-right">مسح الفلتر</button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ── ShipmentStatusBadge ────────────────────────────────────────────────────
function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const cfg = SHIP_STATUS_CFG[status] ?? SHIP_STATUS_CFG.waiting;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5"/>{cfg.label}
    </span>
  );
}

// ── ShipmentFormDialog & EditStatusDialog (forward to shipments page) ──────
// These live in shipments.tsx — here we inline a minimal new-shipment dialog
function NewShipmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [senderName, setSenderName] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverCity, setReceiverCity] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ShipPaymentMethod>("cod");
  const [codAmount, setCodAmount] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [status, setStatus] = useState<ShipmentStatus>("waiting");

  const { data: zones = [] } = useQuery({ queryKey:["shipment-zones"], queryFn: () => shipApiFetch<ShipmentZone[]>("/shipment-zones") });

  const createMutation = useMutation({
    mutationFn: (data: any) => shipApiFetch("/shipments", { method:"POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey:["shipments-orders"] }); toast({ title:"تم إنشاء الشحنة ✅" }); onClose(); },
    onError: (e: any) => toast({ title:"خطأ", description: e.message, variant:"destructive" }),
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black flex items-center gap-2"><Truck className="w-4 h-4 text-primary"/>شحنة جديدة</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4"/></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-bold mb-1 block">اسم المُرسِل *</label>
            <input className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary" value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="اسم المُرسِل"/>
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">اسم المُستلِم *</label>
            <input className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary" value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="اسم المُستلِم"/>
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">هاتف المُستلِم</label>
            <input className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary" value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} placeholder="01xxxxxxxxx"/>
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">المدينة</label>
            <input className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary" value={receiverCity} onChange={e => setReceiverCity(e.target.value)} placeholder="القاهرة"/>
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">طريقة الدفع</label>
            <select className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as ShipPaymentMethod)}>
              <option value="cod">الدفع عند الاستلام</option>
              <option value="prepaid">مدفوع مسبقاً</option>
              <option value="deferred">الدفع لاحق</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">COD (جنيه)</label>
            <input type="number" className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary" value={codAmount} onChange={e => setCodAmount(e.target.value)} placeholder="0"/>
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">رسوم الشحن (جنيه)</label>
            <input type="number" className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary" value={shippingFee} onChange={e => setShippingFee(e.target.value)} placeholder="0"/>
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">الحالة</label>
            <select className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-muted/20 focus:outline-none focus:ring-1 focus:ring-primary" value={status} onChange={e => setStatus(e.target.value as ShipmentStatus)}>
              {(Object.keys(SHIP_STATUS_CFG) as ShipmentStatus[]).map(s => <option key={s} value={s}>{SHIP_STATUS_CFG[s].label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 pt-1 border-t border-border">
          <button onClick={onClose} className="flex-1 h-9 text-sm border border-border rounded-lg text-muted-foreground hover:bg-muted/40 transition-all">إلغاء</button>
          <button
            disabled={!senderName || !receiverName || createMutation.isPending}
            onClick={() => createMutation.mutate({ senderName, receiverName, receiverPhone, receiverCity, paymentMethod, codAmount: codAmount ? Number(codAmount) : undefined, shippingFee: shippingFee ? Number(shippingFee) : undefined, status })}
            className="flex-1 h-9 text-sm font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
            {createMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Plus className="w-3.5 h-3.5"/>}
            إنشاء الشحنة
          </button>
        </div>
      </div>
    </div>
  );
}
// ── ColFilterBtn types ──────────────────────────────────────────────────────
type ColKey = "id" | "date" | "customer" | "phone" | "product" | "total" | "creator" | "status";
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

export default function Orders() {
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterShippingCo, setFilterShippingCo] = useState("all");
  // ── Column Filters (Excel-style) ────────────────────────────────────────────
  const [colFilters, setColFilters] = useState<ColFilters>({
    id: new Set(), date: new Set(), customer: new Set(), phone: new Set(),
    product: new Set(), total: new Set(), creator: new Set(), status: new Set(),
  });
  const colFilterHasActive = Object.values(colFilters).some(s => s.size > 0);
  const [showColFilters, setShowColFilters] = useState(false);
  const [totalSearch, setTotalSearch] = useState("");
  const [sortCol, setSortCol] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Shipments state ──────────────────────────────────────────────────────
  const [shipSearch, setShipSearch]   = useState("");
  const [shipStatus, setShipStatus]   = useState("all");
  const [newShipOpen, setNewShipOpen] = useState(false);
  const [showShipFilters, setShowShipFilters] = useState(false);
  const EMPTY_SHIP_FILTERS: ShipColFilters = {
    num:new Set(), date:new Set(), sender:new Set(), receiver:new Set(),
    city:new Set(), parcel:new Set(), payment:new Set(), fee:new Set(),
    cod:new Set(), status:new Set(), creator:new Set(),
  };
  const [shipColFilters, setShipColFilters] = useState<ShipColFilters>(EMPTY_SHIP_FILTERS);
  const [shipSortCol, setShipSortCol] = useState<ShipColKey | null>(null);
  const [shipSortDir, setShipSortDir] = useState<"asc"|"desc">("asc");
  const shipColFilterActive = Object.values(shipColFilters).some(s => s.size > 0);

  const handleShipSort = useCallback((col: ShipColKey, dir: "asc"|"desc") => { setShipSortCol(col); setShipSortDir(dir); }, []);
  const toggleShipColFilter = useCallback((col: ShipColKey, val: string) => {
    setShipColFilters(prev => { const next = { ...prev, [col]: new Set(prev[col]) }; next[col].has(val) ? next[col].delete(val) : next[col].add(val); return next; });
  }, []);
  const clearShipColFilter = useCallback((col: ShipColKey) => {
    setShipColFilters(prev => ({ ...prev, [col]: new Set() }));
  }, []);

  const handleSort = useCallback((col: ColKey, dir: "asc" | "desc") => {
    setSortCol(col);
    setSortDir(dir);
  }, []);
  const debouncedSearch = useDebounce(search, 300);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isAdmin, can } = useAuth();
  // ── Orders permission shortcuts ──────────────────────────────────────
  const canView        = isAdmin || can("orders.view");
  const canCreate      = isAdmin || can("orders.create");
  const canEdit        = isAdmin || can("orders.edit");
  const canDelete      = isAdmin || can("orders.delete");
  const canFinancials  = isAdmin || can("orders.financials");
  const canExport      = isAdmin || can("orders.export");
  const canInvoices    = isAdmin || can("invoices.view");
  // canWriteOrders: للـ bulk select والواتساب (أي صلاحية تعديل)
  const canWriteOrders = isAdmin || canEdit || canCreate;
  const updateOrder = useUpdateOrder();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [pendingBulkStatus, setPendingBulkStatus] = useState<string | null>(null);

  // قالب واتساب — يتحمل مرة وبيستخدمه الـ handleWhatsApp مباشرة
  const { data: waSettings } = useQuery<WaSettings>({
    queryKey: ["whatsapp-settings"],
    queryFn: () => apiFetch<WaSettings>("/whatsapp/settings"),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: isAdmin,
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders-list", debouncedSearch, status, dateFrom, dateTo, filterShippingCo],
    queryFn: () => ordersApi.list({
      search: debouncedSearch || undefined,
      status: status !== "all" ? status : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      shippingCompanyId: filterShippingCo !== "all" ? filterShippingCo : undefined,
    }),
    staleTime: 15_000,
    gcTime: 60_000,
  } as any);

  // IDs of orders already in a shipping manifest (to detect "still in warehouse")
  const { data: inManifestData } = useQuery({
    queryKey: ["orders-in-manifest-ids"],
    queryFn: () => ordersApi.inManifestIds(),
    staleTime: 0,
  });
  const inManifestSet = new Set(inManifestData?.ids ?? []);

  // ── Shipments data ─────────────────────────────────────────────────────────
  const { data: shipmentsData, isLoading: isShipLoading } = useQuery({
    queryKey: ["shipments-orders", shipStatus, shipSearch],
    queryFn: () => shipApiFetch<{ data: Shipment[]; total: number }>(
      `/shipments?status=${shipStatus}&search=${encodeURIComponent(shipSearch)}&limit=200`
    ),
  });
  const { data: shipStats } = useQuery({
    queryKey: ["shipments-stats"],
    queryFn: () => shipApiFetch<any>("/shipments/stats"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => shipApiFetch(`/shipments/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shipments-orders"] }); toast({ title: "تم حذف الشحنة" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });
  const shipments = shipmentsData?.data ?? [];
  const shipTotal = shipmentsData?.total ?? 0;
  const shipStatusCounts: Record<string, number> = {};
  (shipStats?.statuses ?? []).forEach((r: any) => { shipStatusCounts[r.status] = Number(r.count); });
  const shipTotalAll = Object.values(shipStatusCounts).reduce((a, b) => a + b, 0);

  const getShipColOptions = useCallback((col: ShipColKey): string[] => {
    const vals = new Set<string>();
    shipments.forEach(s => {
      const v = (() => { switch(col) {
        case "num":     return s.shipmentNumber || s.trackingNumber || String(s.id);
        case "date":    return shipFmt(s.createdAt);
        case "sender":  return s.senderName;
        case "receiver":return s.receiverName;
        case "city":    return s.receiverCity || "";
        case "parcel":  return s.parcelType ? PARCEL_LABELS[s.parcelType] : "";
        case "payment": return SHIP_PAYMENT_LABELS[s.paymentMethod];
        case "fee":     return shipFc(s.shippingFee ?? 0);
        case "cod":     return shipFc(s.codAmount ?? 0);
        case "status":  return SHIP_STATUS_CFG[s.status]?.label ?? s.status;
        case "creator": return s.createdByName || "";
        default: return "";
      }})();
      if (v) vals.add(v);
    });
    return Array.from(vals).sort((a, b) => a.localeCompare(b, "ar"));
  }, [shipments]);

  const displayedShipments = useMemo(() => {
    let rows = [...shipments];
    (Object.keys(shipColFilters) as ShipColKey[]).forEach(col => {
      if (!shipColFilters[col].size) return;
      rows = rows.filter(s => {
        const v = (() => { switch(col) {
          case "num":     return s.shipmentNumber || s.trackingNumber || String(s.id);
          case "date":    return shipFmt(s.createdAt);
          case "sender":  return s.senderName;
          case "receiver":return s.receiverName;
          case "city":    return s.receiverCity || "";
          case "parcel":  return s.parcelType ? PARCEL_LABELS[s.parcelType] : "";
          case "payment": return SHIP_PAYMENT_LABELS[s.paymentMethod];
          case "fee":     return shipFc(s.shippingFee ?? 0);
          case "cod":     return shipFc(s.codAmount ?? 0);
          case "status":  return SHIP_STATUS_CFG[s.status]?.label ?? s.status;
          case "creator": return s.createdByName || "";
          default: return "";
        }})();
        return shipColFilters[col].has(v);
      });
    });
    if (shipSortCol) {
      rows.sort((a, b) => {
        const getV = (s: Shipment) => { switch(shipSortCol) {
          case "num":     return s.shipmentNumber || s.trackingNumber || String(s.id);
          case "date":    return shipFmt(s.createdAt);
          case "sender":  return s.senderName;
          case "receiver":return s.receiverName;
          case "city":    return s.receiverCity || "";
          case "parcel":  return s.parcelType ? PARCEL_LABELS[s.parcelType] : "";
          case "payment": return SHIP_PAYMENT_LABELS[s.paymentMethod];
          case "fee":     return shipFc(s.shippingFee ?? 0);
          case "cod":     return shipFc(s.codAmount ?? 0);
          case "status":  return SHIP_STATUS_CFG[s.status]?.label ?? s.status;
          case "creator": return s.createdByName || "";
          default: return "";
        }};
        const cmp = getV(a).localeCompare(getV(b), "ar", { numeric: true });
        return shipSortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [shipments, shipColFilters, shipSortCol, shipSortDir]);

  const filtered = orders?.filter(o => {
    if (customerSearch && !o.customerName?.toLowerCase().includes(customerSearch.toLowerCase())) return false;
    if (totalSearch && !String(Math.round(o.totalPrice)).includes(totalSearch)) return false;
    return true;
  }) ?? [];

  // ── Col Filter helpers ──────────────────────────────────────────────────────
  const getColVal = useCallback((col: ColKey, o: (typeof filtered)[0]): string => {
    switch (col) {
      case "id":       return `#${o.id.toString().padStart(4,"0")}`;
      case "date":     return format(new Date(o.createdAt), "yyyy/MM/dd");
      case "customer": return o.customerName ?? "";
      case "phone":    return o.phone ?? "";
      case "product":  return o.product ?? "";
      case "total":    return String(Math.round(o.totalPrice));
      case "creator":  return (o as any).createdByName ?? "";
      case "status":   return statusLabels[o.status] ?? o.status;
      default:         return "";
    }
  }, []);

  const getColOptions = useCallback((col: ColKey): string[] => {
    const vals = [...new Set(filtered.map(o => getColVal(col, o)))].filter(Boolean);
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
    return filtered.filter(o =>
      (Object.keys(colFilters) as ColKey[]).every(col => {
        const s = colFilters[col];
        if (s.size === 0) return true;
        return s.has(getColVal(col, o));
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

  const hasActiveFilter = search || customerSearch || status !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch(""); setCustomerSearch(""); setStatus("all"); setDateFrom(""); setDateTo("");
    setFilterShippingCo("all");
  };

  const toggleSelect = (order: (typeof filtered)[0]) => {
    const ids: number[] = (order as any)._groupIds?.length > 1
      ? (order as any)._groupIds
      : [order.id];
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const isGroupSelected = (order: (typeof filtered)[0]) => {
    const ids: number[] = (order as any)._groupIds?.length > 1
      ? (order as any)._groupIds
      : [order.id];
    return ids.every(id => selectedIds.has(id));
  };

  const toggleSelectAll = () => {
    const allIds = displayRows.flatMap(o => (o as any)._groupIds?.length > 1 ? (o as any)._groupIds : [o.id]);
    setSelectedIds(selectedIds.size === allIds.length ? new Set() : new Set(allIds));
  };

  const exitBulkMode = () => { setBulkSelectMode(false); setSelectedIds(new Set()); };

  // عدد الفواتير المحددة (مش عدد الـ sub-IDs)
  const selectedInvoiceCount = displayRows.filter(o => {
    const ids: number[] = (o as any)._groupIds?.length > 1 ? (o as any)._groupIds : [o.id];
    return ids.every(id => selectedIds.has(id));
  }).length;

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    // ── تحقق من وجود طلبات في بيان مفتوح ─────────────────────────────────
    const lockedIds = Array.from(selectedIds).filter(id => inManifestSet.has(id));
    if (lockedIds.length > 0) {
      toast({
        title: "⛔ لا يمكن حذف بعض الطلبات",
        description: `${lockedIds.length} طلب مرتبط ببيان شحن مفتوح — لا يمكن حذفه إلا بعد إغلاق البيان من قسم شركات الشحن.`,
        variant: "destructive",
      });
      setShowBulkDeleteConfirm(false);
      return;
    }

    setIsBulkDeleting(true);
    try {
      const token = localStorage.getItem("caprina_token");
      const res = await fetch("/api/orders/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      await queryClient.refetchQueries({ queryKey: ["orders-list"] });
      queryClient.invalidateQueries({ queryKey: ["archived-orders"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-charts"] });
      queryClient.invalidateQueries({ queryKey: ["orders-summary"] });
      const skippedMsg = data.skipped > 0 ? ` (${data.skipped} محظور — مسلّمة)` : "";
      toast({ title: `تم حذف ${data.deleted} طلب ✅`, description: `تم حذف الطلبات بنجاح${skippedMsg}` });
      exitBulkMode();
    } catch {
      toast({ title: "خطأ", description: "فشل حذف الطلبات", variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedIds.size === 0) return;

    // ── تحقق من وجود طلبات في بيان مفتوح ─────────────────────────────────
    const lockedIds = Array.from(selectedIds).filter(id => inManifestSet.has(id));
    if (lockedIds.length > 0) {
      toast({
        title: "⛔ لا يمكن تعديل حالة بعض الطلبات",
        description: `${lockedIds.length} طلب مرتبط ببيان شحن مفتوح — يجب تعديل حالته من داخل البيان في قسم شركات الشحن فقط.`,
        variant: "destructive",
      });
      setPendingBulkStatus(null);
      return;
    }
    setIsBulkUpdating(true);
    let done = 0;
    let failed = 0;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await new Promise<void>((resolve, reject) => {
          updateOrder.mutate(
            { id, data: { status: newStatus as any } },
            { onSuccess: () => resolve(), onError: () => reject() }
          );
        });
        done++;
      } catch {
        failed++;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["orders-list"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-charts"] });
    queryClient.invalidateQueries({ queryKey: ["orders-summary"] });
    const label = statusLabels[newStatus] ?? newStatus;
    const failedMsg = failed > 0 ? ` (${failed} فشل)` : "";
    toast({ title: `تم تحديث ${done} طلب ✅`, description: `تم تغيير الحالة إلى «${label}»${failedMsg}` });
    setPendingBulkStatus(null);
    exitBulkMode();
    setIsBulkUpdating(false);
  };

  const handleWhatsApp = (e: React.MouseEvent, order: NonNullable<typeof orders>[0]) => {
    e.stopPropagation();
    if (!order.phone) {
      toast({ title: "لا يوجد رقم هاتف", description: "أضف رقم هاتف للعميل أولاً", variant: "destructive" });
      return;
    }

    const templates = waSettings?.templates ?? [];
    const status = order.status;

    // اختيار القالب بناءً على حالة الأوردر — بالاسم بالظبط أو مطابقة مرنة
    const TEMPLATE_NAMES: Record<string, string> = {
      pending:         "تأكيد الأوردر",
      warehouse_ready: "إشعار الشحن",
      in_shipping:     "متابعة الشحن",
      delayed:         "متابعة بعد التأجيل",
    };

    const TEMPLATE_KEYWORDS: Record<string, string[]> = {
      pending:         ["تأكيد"],
      warehouse_ready: ["إشعار الشحن", "اشعار الشحن"],
      in_shipping:     ["متابعة الشحن"],
      delayed:         ["تأجيل", "مؤجل", "متابعة بعد"],
    };

    // أول حاجة: دور بالاسم بالظبط
    const exactName = TEMPLATE_NAMES[status];
    let tpl = exactName ? (templates.find(t => t.name === exactName) ?? null) : null;

    // لو ملقوش بالاسم: دور بـ keywords
    if (!tpl) {
      const keywords = TEMPLATE_KEYWORDS[status] ?? [];
      tpl = keywords.length > 0
        ? templates.find(t => keywords.some(kw => t.name.includes(kw))) ?? null
        : null;
    }
    // fallback عام: الـ default أو أول قالب
    if (!tpl) tpl = templates.find(t => t.isDefault) ?? templates[0] ?? null;

    let message = "";
    if (status === "in_shipping" && tpl) {
      // استخدام applyShippingTemplate للحالة دي
      message = applyShippingTemplate(tpl.body, {
        id: order.id,
        customerName: order.customerName,
        product: order.product,
        trackingNumber: (order as any).trackingNumber ?? null,
        shippingCompany: (order as any).shippingCompany ?? null,
        daysPending: (order as any).daysPending ?? 0,
      });
    } else if (tpl) {
      message = applyTemplate(tpl.body, {
        id: order.id,
        customerName: order.customerName,
        product: order.product,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        status: order.status,
        phone: order.phone,
      });
    }

    if (!message) {
      toast({ title: "لا يوجد قالب", description: "أضف قالب رسالة أولاً من إعدادات واتساب", variant: "destructive" });
      return;
    }

    const link = buildWhatsAppLink(order.phone, message);
    window.open(link, "_blank", "noopener,noreferrer");

    // تغيير الحالة تلقائياً لو pending → warehouse_ready
    if (status === "pending") {
      updateOrder.mutate(
        { id: order.id, data: { status: "warehouse_ready" as UpdateOrderBodyStatus } },
        { onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["orders-list"] });
          toast({ title: "تم فتح واتساب ✅", description: `تم تحويل الطلب #${order.id.toString().padStart(4,"0")} إلى «قيد الشحن في المخزن»` });
        }}
      );
    } else {
      const statusMsg: Record<string, string> = {
        warehouse_ready: "تم إرسال إشعار الشحن",
        in_shipping:     "تم فتح متابعة الشحن",
        delayed:         "تم فتح متابعة التأجيل",
      };
      toast({ title: "تم فتح واتساب ✅", description: statusMsg[status] ?? "الرسالة جاهزة للإرسال" });
    }
  };

  if (!canView) return (
    <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground" dir="rtl">
      <div className="text-center space-y-2">
        <p className="text-4xl">🔒</p>
        <p className="font-bold">ليس لديك صلاحية لعرض الطلبات</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الطلبات</h1>
          <p className="text-muted-foreground text-sm mt-0.5">إدارة وتتبع جميع الطلبات</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canWriteOrders && (bulkSelectMode ? (
            <>
              <Button variant="outline" size="sm" className="gap-1 text-xs h-9" onClick={exitBulkMode}>
                <X className="w-3.5 h-3.5" />إلغاء
              </Button>

              {/* تغيير الحالة بالجملة — يظهر لو عنده canEdit */}
              {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs h-9 border-primary/50 text-primary"
                    disabled={selectedIds.size === 0 || isBulkUpdating}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isBulkUpdating ? "animate-spin" : ""}`} />
                    تغيير الحالة {selectedInvoiceCount > 0 ? `(${selectedInvoiceCount})` : ""}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44" style={{ direction: "rtl" }}>
                  {STATUS_OPTIONS.map(opt => (
                    <DropdownMenuItem
                      key={opt.value}
                      className={`text-xs font-semibold gap-2 cursor-pointer ${opt.color}`}
                      onClick={() => setPendingBulkStatus(opt.value)}
                    >
                      <span className="w-2 h-2 rounded-full bg-current shrink-0" />
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              )}

              {/* حذف بالجملة — يظهر لو عنده canDelete */}
              {canDelete && (() => {
                const lockedCount = Array.from(selectedIds).filter(id => inManifestSet.has(id)).length;
                return (
                  <Button
                    size="sm"
                    className="gap-1 text-xs h-9 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                    disabled={selectedIds.size === 0 || lockedCount > 0}
                    title={lockedCount > 0 ? `${lockedCount} طلب مرتبط ببيان مفتوح — أغلق البيان أولاً` : undefined}
                    onClick={() => setShowBulkDeleteConfirm(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف {selectedInvoiceCount > 0 ? `(${selectedInvoiceCount})` : ""}
                    {lockedCount > 0 && <span className="text-[9px] bg-white/20 rounded px-1">⛔ {lockedCount} مرتبط ببيان شحن</span>}
                  </Button>
                );
              })()}
            </>
          ) : (
            <>
              {/* زر تحديد — فقط لو عنده edit أو delete */}
              {(canEdit || canDelete) && (
              <Button variant="outline" size="sm" className="gap-1 text-xs h-9" onClick={() => setBulkSelectMode(true)}>
                <CheckSquare className="w-3.5 h-3.5" />تحديد
              </Button>
              )}
              {/* زر الفواتير — فقط لو عنده invoices.view */}
              {canInvoices && (
              <Link href="/invoices">
                <Button variant="outline" size="sm" className="gap-1 text-xs h-9">
                  <FileText className="w-3.5 h-3.5" />الفواتير
                </Button>
              </Link>
              )}
              {/* زر تصدير — فقط لو عنده orders.export */}
              {canExport && (
              <Button variant="outline" size="sm" className="gap-1 text-xs h-9" onClick={() => {
                if (!orders?.length) return;
                const rows = filtered.map(o => ({
                  "#": o.id,
                  "العميل": o.customerName,
                  "الهاتف": o.phone ?? "",
                  "المنتج": o.product,
                  "الكمية": o.quantity,
                  "السعر": o.unitPrice,
                  "الإجمالي": o.totalPrice,
                  "الحالة": o.status,
                  "التاريخ": new Date(o.createdAt).toLocaleDateString("ar-EG"),
                }));
                const header = Object.keys(rows[0]).join(",");
                const csv = [header, ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(","))].join("\n");
                const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `orders-${new Date().toISOString().slice(0,10)}.csv`; a.click();
                URL.revokeObjectURL(url);
              }}>
                <Download className="w-3.5 h-3.5" />تصدير
              </Button>
              )}
              {/* زر طلب جديد — فقط لو عنده canCreate */}
              {canCreate && (
              <Link href="/orders/new">
                <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm">
                  <Plus className="w-4 h-4" />طلب جديد
                </Button>
              </Link>
              )}
              {/* زر شحنة جديدة — معدني */}
              <button
                onClick={() => setNewShipOpen(true)}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-bold transition-all"
                style={{
                  background: "linear-gradient(135deg, #9ca3af 0%, #6b7280 40%, #4b5563 70%, #374151 100%)",
                  color: "#f9fafb",
                  border: "1px solid rgba(156,163,175,0.4)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                <Truck className="w-4 h-4"/>
                شحنة جديدة
              </button>
            </>
          ))}
        </div>
      </div>

      {/* إحصائيات الطلبات */}
      {!isLoading && orders && (() => {
        const total = orders.length;
        const statusData = [
          { key: "warehouse_ready",  label: "قيد الشحن في المخزن", rgb: "45,212,191"  },
          { key: "received",         label: "فسلّم",                rgb: "52,211,153"  },
          { key: "pending",          label: "قيد الانتظار",         rgb: "251,191,36"  },
          { key: "returned",         label: "مرتجع",                rgb: "248,113,113" },
          { key: "in_shipping",      label: "قيد الشحن",            rgb: "56,189,248"  },
          { key: "partial_received", label: "استلم جزئي",           rgb: "34,211,238"  },
        ];
        const counts = statusData.map(s => ({
          ...s,
          count: orders.filter(o => o.status === s.key).length,
          pct: total > 0 ? Math.round(orders.filter(o => o.status === s.key).length / total * 100) : 0,
        })).filter(s => s.count > 0);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
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
                طلبيات الأسبوع
              </p>
              <div className="mt-2">
                <span className="text-5xl font-black" style={{ color: "rgba(251,191,36,1)", lineHeight: 1 }}>
                  {total}
                </span>
              </div>
              <p className="text-xs mt-2" style={{ color: "rgba(251,191,36,0.5)" }}>إجمالي الطلبات</p>
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
                {counts.map(s => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="shrink-0 w-2.5 h-2.5 rounded-full"
                      style={{ background: `rgba(${s.rgb},0.9)`, boxShadow: `0 0 6px rgba(${s.rgb},0.6)` }} />
                    <span className="flex-1 text-xs font-medium text-right" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {s.label}
                    </span>
                    <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${s.pct}%`,
                          background: `linear-gradient(90deg, rgba(${s.rgb},0.9), rgba(${s.rgb},0.5))`,
                          boxShadow: `0 0 6px rgba(${s.rgb},0.4)`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold w-9 text-left" style={{ color: `rgba(${s.rgb},0.9)` }}>
                      {s.pct}%
                    </span>
                    <span
                      className="text-xs font-black w-7 text-center rounded-md py-0.5"
                      style={{
                        color: `rgba(${s.rgb},1)`,
                        background: `rgba(${s.rgb},0.12)`,
                      }}
                    >
                      {s.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

            <Card className="border-border overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/10 flex flex-col gap-2">
          {/* ── بحث اسم العميل realtime ── */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60" />
            <Input
              placeholder="ابحث باسم العميل..."
              className="pr-9 bg-card text-sm h-10 font-medium border-primary/30 focus-visible:ring-primary/40 placeholder:text-muted-foreground/60"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
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
              <Input placeholder="ابحث بالمنتج أو الهاتف..." className="pr-9 bg-card text-sm h-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-48 bg-card h-9 text-sm">
                <div className="flex items-center gap-2"><Filter className="w-3.5 h-3.5 text-muted-foreground" /><SelectValue /></div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الطلبات</SelectItem>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
                <SelectItem value="warehouse_ready">قيد الشحن في المخزن</SelectItem>
                <SelectItem value="in_shipping">قيد الشحن</SelectItem>
                <SelectItem value="received">استلم</SelectItem>
                <SelectItem value="delayed">مؤجل</SelectItem>
                <SelectItem value="returned">مرتجع</SelectItem>
                <SelectItem value="partial_received">استلم جزئي</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── الصف الثاني: تاريخ من + زر فلتر + مسح ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input type="date" className="pr-9 bg-card text-sm h-8 w-40 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="من تاريخ" />
            </div>
            <span className="text-xs text-muted-foreground">←</span>
            <div className="relative">
              <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input type="date" className="pr-9 bg-card text-sm h-8 w-40 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} title="إلى تاريخ" />
            </div>
            <button
              type="button"
              onClick={() => {
                if (showColFilters) {
                  setColFilters({ id: new Set(), date: new Set(), customer: new Set(), phone: new Set(), product: new Set(), total: new Set(), creator: new Set(), status: new Set() });
                  setSortCol(null);
                }
                setShowColFilters(v => !v);
              }}
              className={`h-8 flex items-center gap-1.5 px-3 rounded-lg border text-xs font-medium transition-all ${showColFilters ? "border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10" : "border-primary/40 text-primary bg-primary/5 hover:bg-primary/10"}`}
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill={showColFilters ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {showColFilters ? "إلغاء الفلتر" : "إنشاء فلتر"}
            </button>
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
                <X className="w-3 h-3" />مسح الكل
              </Button>
            )}
            {bulkSelectMode && filtered.length > 0 && canWriteOrders && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 mr-auto" onClick={toggleSelectAll}>
                {selectedIds.size === filtered.length ? "إلغاء تحديد الكل" : `تحديد الكل (${filtered.length})`}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : filtered.length > 0 ? (
          <>
            {/* ── Mobile ── */}
            <div className="sm:hidden divide-y divide-border">
              {filtered.map((order) => {
                const isGroup = !!(order as any)._groupCount && (order as any)._groupCount > 1;
                const waStatuses = new Set(["pending","warehouse_ready","in_shipping","delayed"]);
                const groupStatuses: string[] = (order as any)._groupStatuses ?? [order.status];
                const canWhatsApp = canWriteOrders && !bulkSelectMode && groupStatuses.some(s => waStatuses.has(s));
                const retReason = (order as any).returnReason as string | null;
                const retNote   = (order as any).returnNote   as string | null;
                const isSelected = isGroupSelected(order);
                const groupCount = (order as any)._groupCount as number | undefined;
                const navTarget = `/orders/${order.id}`;
                return (
                  <div
                    key={order.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/10 active:bg-muted/20 cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                    onClick={() => canWriteOrders && bulkSelectMode ? toggleSelect(order) : (window.location.href = navTarget)}
                  >
                    {canWriteOrders && bulkSelectMode && (
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(order)} onClick={e => e.stopPropagation()} className="shrink-0" />
                    )}
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                      {order.customerName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-sm truncate">{order.customerName}</p>
                        {canFinancials && (
                        <span className="font-bold text-xs text-primary shrink-0">
                          {order.status === "partial_received" && (order as any)._receivedPrice != null
                            ? <>{formatCurrency((order as any)._receivedPrice)}<span className="line-through text-muted-foreground font-normal mr-1 text-[9px]">{formatCurrency(order.totalPrice)}</span></>
                            : formatCurrency(order.totalPrice)}
                        </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono">#{order.id.toString().padStart(4,"0")}</span>
                        {isGroup && groupCount && (
                          <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{groupCount} منتجات</span>
                        )}
                        <span className="text-[10px] text-muted-foreground truncate">{order.product}</span>
                          {((order as any).color || (order as any).size) && (
                            <span className="text-[9px] text-primary/70 font-bold mr-1">
                              {(order as any).color}{(order as any).color && (order as any).size ? " / " : ""}{(order as any).size}
                            </span>
                          )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-[9px] font-bold border ${statusClasses[order.status] || ""}`}>
                          {statusLabels[order.status] || order.status}
                        </Badge>
                        {order.status === "warehouse_ready" && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-500 dark:text-amber-400">🏠 ما زال في المخزن</span>
                        )}
                        {order.status === "returned" && (() => {
                          const rr = (order as any).returnReceived as 0 | 1 | null | undefined;
                          if (rr === 0) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-orange-500 dark:text-orange-400">⏳ عند شركة الشحن</span>;
                          return null;
                        })()}
                        {order.status === "delayed" && (() => {
                          const dn = (order as any).delayNote as string | null | undefined;
                          if (!dn) return null;
                          return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400">⏸ {dn}</span>;
                        })()}
                        {order.status === "partial_received" && (() => {
                          const rr = (order as any).returnReceived as 0 | 1 | null | undefined;
                          const pq = (order as any).partialQuantity as number | null | undefined;
                          const qty = (order as any).quantity as number | undefined;
                          return (
                            <span className="inline-flex flex-col gap-0 text-[9px] font-bold leading-tight">
                              {pq != null && qty != null && <span className="text-teal-600 dark:text-teal-400">✓ استُلم {pq} من {qty}</span>}
                              {rr === 0 && <span className="text-orange-500 dark:text-orange-400">🚚 المرتجع مازال في شركة الشحن</span>}
                              {rr === 1 && <span className="text-emerald-600 dark:text-emerald-400">↩ الباقي في المخزن</span>}
                            </span>
                          );
                        })()}
                        {order.status === "returned" && retReason && (
                          <span className="text-[9px] text-red-600 dark:text-red-400">{retReason === "other" && retNote ? retNote : returnReasonLabel(retReason)}</span>
                        )}
                        <span className="text-[9px] text-muted-foreground mr-auto">{format(new Date(order.createdAt), "MM/dd")}</span>
                      </div>
                    </div>
                    {canWhatsApp && (
                      <button className="shrink-0 w-9 h-9 rounded-full text-green-500 hover:bg-green-500/10 flex items-center justify-center" onClick={(e) => handleWhatsApp(e, order)}>
                        <MessageCircle className="w-4.5 h-4.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Desktop ── */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    {canWriteOrders && bulkSelectMode && (
                      <TableHead className="w-10 text-center">
                        <Checkbox checked={selectedIds.size === displayRows.length && displayRows.length > 0} onCheckedChange={toggleSelectAll} />
                      </TableHead>
                    )}
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">#{showColFilters && <ColFilterBtn col="id" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">التاريخ{showColFilters && <ColFilterBtn col="date" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">
                        {!showColFilters
                          ? <input
                              value={customerSearch}
                              onChange={e => setCustomerSearch(e.target.value)}
                              placeholder="العميل..."
                              className="w-24 h-5 text-[10px] px-1.5 border border-border rounded bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          : <span>العميل</span>
                        }
                        {showColFilters && <ColFilterBtn col="customer" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                      </div>
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">الهاتف{showColFilters && <ColFilterBtn col="phone" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">المنتج{showColFilters && <ColFilterBtn col="product" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                    </TableHead>
                    {canFinancials && (
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">
                        {!showColFilters
                          ? <input
                              value={totalSearch}
                              onChange={e => setTotalSearch(e.target.value)}
                              placeholder="الإجمالي..."
                              className="w-20 h-5 text-[10px] px-1.5 border border-border rounded bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          : <span>الإجمالي</span>
                        }
                        {showColFilters && <ColFilterBtn col="total" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                      </div>
                    </TableHead>
                    )}
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">المنشئ{showColFilters && <ColFilterBtn col="creator" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                    </TableHead>
                    <TableHead className="text-center text-xs w-36">
                      <div className="flex items-center justify-center gap-1">الحالة{showColFilters && <ColFilterBtn col="status" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                    </TableHead>
                    <TableHead className="text-center text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map((order, rowIndex) => {
                    const retReason  = (order as any).returnReason as string | null;
                    const retNote    = (order as any).returnNote   as string | null;
                    const isGroup = !!(order as any)._groupCount && (order as any)._groupCount > 1;
                    const waStatuses = new Set(["pending","warehouse_ready","in_shipping","delayed"]);
                    const groupStatuses: string[] = (order as any)._groupStatuses ?? [order.status];
                    const canWhatsApp = canWriteOrders && !bulkSelectMode && groupStatuses.some(s => waStatuses.has(s));
                    const isSelected  = isGroupSelected(order);
                    const groupCount = (order as any)._groupCount as number | undefined;
                    const navTarget = `/orders/${order.id}`;
                    return (
                      <TableRow
                        key={order.id}
                        className={`border-border hover:bg-muted/20 cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                        style={{
                          animation: "rowFadeIn 0.3s ease both",
                          animationDelay: `${Math.min(rowIndex * 35, 600)}ms`,
                        }}
                        onClick={() => canWriteOrders && bulkSelectMode ? toggleSelect(order) : (window.location.href = navTarget)}
                      >
                        {canWriteOrders && bulkSelectMode && (
                          <TableCell className="text-center p-2">
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(order)} onClick={e => e.stopPropagation()} />
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs text-primary font-bold">
                          #{order.id.toString().padStart(4,"0")}
                          {isGroup && groupCount && (
                            <span className="mr-1 text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{groupCount} منتجات</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(order.createdAt), "yyyy/MM/dd")}</TableCell>
                        <TableCell className="text-sm font-semibold">{order.customerName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{order.phone || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[200px]">
                          <span className="truncate block font-medium">{order.product}</span>
                          {((order as any).color || (order as any).size) && (
                            <span className="text-[10px] text-primary/70 font-semibold">
                              {(order as any).color}{(order as any).color && (order as any).size ? " / " : ""}{(order as any).size}
                            </span>
                          )}
                          {!isGroup && <span className="text-muted-foreground text-[10px]">×{order.quantity}</span>}
                        </TableCell>
                        {canFinancials && (
                        <TableCell className="text-xs font-bold text-primary">
                          {order.status === "partial_received" && (order as any)._receivedPrice != null
                            ? <div><span>{formatCurrency((order as any)._receivedPrice)}</span><div className="line-through text-muted-foreground font-normal text-[9px]">{formatCurrency(order.totalPrice)}</div></div>
                            : formatCurrency(order.totalPrice)}
                        </TableCell>
                        )}
                        <TableCell className="text-xs text-muted-foreground">
                          {(order as any).createdByName
                            ? <span className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded-full text-[10px] font-medium"><span>👤</span>{(order as any).createdByName}</span>
                            : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[9px] font-bold border ${statusClasses[order.status] || ""}`}>
                            {statusLabels[order.status] || order.status}
                          </Badge>
                          {order.status === "warehouse_ready" && (
                            <div className="flex items-center justify-center gap-0.5 mt-1">
                              <span className="text-[9px] font-bold text-amber-500 dark:text-amber-400 leading-none">🏠 ما زال في المخزن</span>
                            </div>
                          )}
                          {order.status === "returned" && (() => {
                            const rr = (order as any).returnReceived as 0 | 1 | null | undefined;
                            if (rr === 0) return <div className="flex items-center justify-center gap-0.5 mt-1"><span className="text-[9px] font-bold text-orange-500 dark:text-orange-400 leading-none">⏳ عند شركة الشحن</span></div>;
                            return null;
                          })()}
                          {order.status === "delayed" && (() => {
                            const dn = (order as any).delayNote as string | null | undefined;
                            if (!dn) return null;
                            return (
                              <div className="flex items-center justify-center gap-0.5 mt-1">
                                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 leading-none">⏸ {dn}</span>
                              </div>
                            );
                          })()}
                          {order.status === "partial_received" && (() => {
                            const rr = (order as any).returnReceived as 0 | 1 | null | undefined;
                            const pq = (order as any).partialQuantity as number | null | undefined;
                            const qty = (order as any).quantity as number | undefined;
                            return (
                              <div className="flex flex-col items-center gap-0 mt-1 text-[9px] font-bold leading-tight">
                                {pq != null && qty != null && <span className="text-teal-600 dark:text-teal-400">✓ استُلم {pq} من {qty}</span>}
                                {rr === 0 && <span className="text-orange-500 dark:text-orange-400">🚚 المرتجع مازال في شركة الشحن</span>}
                                {rr === 1 && <span className="text-emerald-600 dark:text-emerald-400">↩ الباقي في المخزن</span>}
                              </div>
                            );
                          })()}
                          {order.status === "returned" && retReason && (
                            <div className="flex items-center justify-center gap-0.5 mt-1">
                              <RotateCcw className="w-2.5 h-2.5 text-red-500 shrink-0" />
                              <span className="text-[9px] text-red-600 dark:text-red-400 leading-none">
                                {retReason === "other" && retNote ? retNote : returnReasonLabel(retReason)}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center p-1">
                          {canWhatsApp && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full text-green-500 hover:text-green-400 hover:bg-green-500/10" onClick={(e) => handleWhatsApp(e, order)}>
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="font-bold text-foreground">لا توجد طلبات</p>
            <p className="text-sm text-muted-foreground mt-1">{hasActiveFilter ? "جرّب تغيير معايير البحث." : "لا يوجد طلبات حتى الآن."}</p>
          </div>
        )}
      </Card>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-left">
          إجمالي {filtered.length} طلب
          {orders && filtered.length !== orders.length && ` (من ${orders.length})`}
          {bulkSelectMode && selectedIds.size > 0 && ` — محدد: ${selectedInvoiceCount}`}
        </p>
      )}

      {/* تأكيد الحذف بالجملة */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الطلبات</AlertDialogTitle>
            <AlertDialogDescription>
              هتحذف {selectedInvoiceCount} طلب. الطلبات المسلّمة لن تُحذف إلا إذا كنت مدير. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleBulkDelete} disabled={isBulkDeleting}>
              {isBulkDeleting ? "جاري الحذف..." : `حذف ${selectedInvoiceCount} طلب`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تأكيد تغيير الحالة بالجملة */}
      <AlertDialog open={!!pendingBulkStatus} onOpenChange={open => { if (!open) setPendingBulkStatus(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تغيير الحالة</AlertDialogTitle>
            <AlertDialogDescription>
              هتغير حالة {selectedInvoiceCount} طلب إلى «{statusLabels[pendingBulkStatus ?? ""] ?? pendingBulkStatus}». هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingBulkStatus && handleBulkStatusChange(pendingBulkStatus)} disabled={isBulkUpdating}>
              {isBulkUpdating ? "جاري التحديث..." : "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════════════════
          ── قسم الشحنات ──────────────────────────────────────────────────────
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="mt-8 space-y-4" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-border">
          <div>
            <h2 className="text-lg font-black text-foreground flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary"/>
              الشحنات
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">تتبع وإدارة جميع شحناتك</p>
          </div>
          <button
            onClick={() => setNewShipOpen(true)}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-bold transition-all"
            style={{
              background: "linear-gradient(135deg, #9ca3af 0%, #6b7280 40%, #4b5563 70%, #374151 100%)",
              color: "#f9fafb",
              border: "1px solid rgba(156,163,175,0.4)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            <Plus className="w-4 h-4"/>شحنة جديدة
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "إجمالي الشحنات", value: shipTotalAll, color: "bg-primary/10 text-primary", icon: Boxes },
            { label: "تم التسليم",      value: shipStatusCounts["delivered"] ?? 0, color: "bg-emerald-500/10 text-emerald-500", icon: CheckCircle },
            { label: "في الطريق",       value: (shipStatusCounts["in_transit"]??0)+(shipStatusCounts["out_for_delivery"]??0)+(shipStatusCounts["confirmed"]??0), color: "bg-violet-500/10 text-violet-500", icon: Truck },
            { label: "مرتجع / ملغي",    value: (shipStatusCounts["returned"]??0)+(shipStatusCounts["cancelled"]??0), color: "bg-red-500/10 text-red-500", icon: XCircle },
          ].map(({ label, value, color, icon: Icon }) => (
            <Card key={label} className="border-border bg-card">
              <div className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-5 h-5"/>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
                  <p className="text-lg font-black text-foreground">{value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"/>
            <input className="w-full h-9 pr-9 pl-3 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-primary" placeholder="بحث باسم أو رقم الشحنة..." value={shipSearch} onChange={e => setShipSearch(e.target.value)}/>
            {shipSearch && <button onClick={() => setShipSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5"/></button>}
          </div>
          <select className="h-9 text-xs px-3 border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-primary" value={shipStatus} onChange={e => setShipStatus(e.target.value)}>
            <option value="all">كل الحالات ({shipTotalAll})</option>
            {(Object.keys(SHIP_STATUS_CFG) as ShipmentStatus[]).map(s => (
              <option key={s} value={s}>{SHIP_STATUS_CFG[s].label} {shipStatusCounts[s] ? `(${shipStatusCounts[s]})` : ""}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowShipFilters(v => !v)}
            className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs font-medium transition-all ${showShipFilters ? "border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10" : "border-primary/40 text-primary bg-primary/5 hover:bg-primary/10"}`}
          >
            <Filter className="w-3.5 h-3.5"/>
            {showShipFilters ? "إلغاء الفلتر" : "فلتر الأعمدة"}
            {shipColFilterActive && (
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center">
                {Object.values(shipColFilters).filter(s => s.size > 0).length}
              </span>
            )}
          </button>
          {shipColFilterActive && (
            <button onClick={() => setShipColFilters(EMPTY_SHIP_FILTERS)} className="text-xs text-destructive hover:underline">مسح الفلاتر</button>
          )}
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShipStatus("all")} className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${shipStatus==="all" ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"}`}>
            الكل {shipTotalAll > 0 && `(${shipTotalAll})`}
          </button>
          {(Object.keys(SHIP_STATUS_CFG) as ShipmentStatus[]).map(s => {
            const cnt = shipStatusCounts[s] ?? 0;
            if (!cnt && shipStatus !== s) return null;
            return (
              <button key={s} onClick={() => setShipStatus(s === shipStatus ? "all" : s)}
                className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${shipStatus===s ? SHIP_STATUS_CFG[s].cls : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"}`}>
                {SHIP_STATUS_CFG[s].label} {cnt > 0 && `(${cnt})`}
              </button>
            );
          })}
        </div>

        {/* Table */}
        {isShipLoading ? (
          <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground"/></div>
        ) : displayedShipments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/5 border border-primary/15 flex items-center justify-center mb-3">
              <Truck className="w-6 h-6 text-primary/40"/>
            </div>
            <p className="text-sm font-bold text-foreground">لا توجد شحنات</p>
            <p className="text-xs text-muted-foreground mt-1">ابدأ بإضافة شحنة جديدة</p>
            <button onClick={() => setNewShipOpen(true)} className="mt-3 text-xs text-primary hover:underline font-bold flex items-center gap-1"><Plus className="w-3 h-3"/>شحنة جديدة</button>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            {shipColFilterActive && (
              <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-border text-xs text-primary font-bold">
                <Filter className="w-3 h-3"/>
                فلتر مفعّل — يتم عرض {displayedShipments.length} من {shipments.length} شحنة
                <button onClick={() => setShipColFilters(EMPTY_SHIP_FILTERS)} className="mr-auto text-destructive hover:underline text-[10px]">مسح الفلاتر</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    {([
                      { col:"num",      label:"رقم الشحنة" },
                      { col:"date",     label:"التاريخ" },
                      { col:"sender",   label:"المُرسِل" },
                      { col:"receiver", label:"المُستلِم" },
                      { col:"city",     label:"المدينة" },
                      { col:"parcel",   label:"النوع" },
                      { col:"payment",  label:"الدفع" },
                      { col:"fee",      label:"رسوم الشحن" },
                      { col:"cod",      label:"COD" },
                      { col:"status",   label:"الحالة" },
                      { col:"creator",  label:"المنشئ" },
                    ] as { col: ShipColKey; label: string }[]).map(({ col, label }) => (
                      <TableHead key={col} className="text-right text-[11px] font-bold text-muted-foreground whitespace-nowrap px-3">
                        <span className="inline-flex items-center gap-1">
                          {label}
                          {showShipFilters && (
                            <ShipColFilterBtn col={col} colFilters={shipColFilters} getColOptions={getShipColOptions}
                              toggleColFilter={toggleShipColFilter} clearColFilter={clearShipColFilter}
                              sortCol={shipSortCol} sortDir={shipSortDir} onSort={handleShipSort}/>
                          )}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="text-right text-[11px] font-bold text-muted-foreground px-3">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedShipments.map((s, i) => (
                    <TableRow key={s.id} className={`text-xs hover:bg-muted/20 transition-colors ${i%2===1 ? "bg-muted/5" : ""}`}>
                      <TableCell className="px-3 py-2.5 font-mono font-bold text-primary whitespace-nowrap">
                        {s.shipmentNumber || s.trackingNumber || `#${s.id}`}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{shipFmt(s.createdAt)}</TableCell>
                      <TableCell className="px-3 py-2.5">
                        <p className="font-bold text-foreground">{s.senderName}</p>
                        {s.senderPhone && <p className="text-[10px] text-muted-foreground">{s.senderPhone}</p>}
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <p className="font-bold text-foreground">{s.receiverName}</p>
                        {s.receiverPhone && <p className="text-[10px] text-muted-foreground">{s.receiverPhone}</p>}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{s.receiverCity || "—"}</TableCell>
                      <TableCell className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{s.parcelType ? PARCEL_LABELS[s.parcelType] : "—"}</TableCell>
                      <TableCell className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border ${SHIP_PAYMENT_COLORS[s.paymentMethod]}`}>
                          {SHIP_PAYMENT_LABELS[s.paymentMethod]}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">{shipFc(s.shippingFee ?? 0)}</TableCell>
                      <TableCell className="px-3 py-2.5 font-bold text-amber-500 whitespace-nowrap">{shipFc(s.codAmount ?? 0)}</TableCell>
                      <TableCell className="px-3 py-2.5 whitespace-nowrap"><ShipmentStatusBadge status={s.status}/></TableCell>
                      <TableCell className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{s.createdByName || "—"}</TableCell>
                      <TableCell className="px-3 py-2.5">
                        <button onClick={() => { if (confirm(`حذف الشحنة ${s.shipmentNumber || s.id}؟`)) deleteMutation.mutate(s.id); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {shipTotal > shipments.length && (
              <p className="text-center text-xs text-muted-foreground py-3 border-t border-border">
                يتم عرض {shipments.length} من {shipTotal} شحنة
              </p>
            )}
          </div>
        )}
      </div>

      {/* New Shipment Dialog */}
      <NewShipmentDialog open={newShipOpen} onClose={() => setNewShipOpen(false)}/>
    </div>
  );
}
