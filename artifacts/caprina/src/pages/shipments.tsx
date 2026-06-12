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
  Settings, Globe, Layers,
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

// ─── Types ────────────────────────────────────────────────────────────────────
type ShipmentStatus =
  | "waiting" | "confirmed" | "picked_up" | "in_transit"
  | "out_for_delivery" | "delivered" | "delayed" | "returned" | "cancelled";

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
  shippingCompanyId?: number;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ShipmentStatus, { label: string; icon: React.ElementType; cls: string }> = {
  waiting:          { label: "انتظار",          icon: Clock,        cls: "bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600"    },
  confirmed:        { label: "مؤكدة",           icon: CheckCircle,  cls: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700"          },
  picked_up:        { label: "تم الاستلام",     icon: Package,      cls: "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-700"           },
  in_transit:       { label: "في الطريق",       icon: Truck,        cls: "bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-700"},
  out_for_delivery: { label: "خرجت للتسليم",   icon: MapPin,       cls: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700"     },
  delivered:        { label: "تم التسليم",      icon: CheckCircle,  cls: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700"},
  delayed:          { label: "متأخرة",          icon: AlertTriangle,cls: "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700"},
  returned:         { label: "مرتجع",           icon: RefreshCw,    cls: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700"                },
  cancelled:        { label: "ملغية",           icon: XCircle,      cls: "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-600"          },
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cod:      "الدفع عند الاستلام",
  prepaid:  "مدفوع مسبقاً",
  deferred: "الدفع لاحق",
};
const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  cod:      "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700",
  prepaid:  "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700",
  deferred: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700",
};

const PARCEL_LABELS: Record<ParcelType, string> = {
  document: "مستندات", normal: "طرد عادي", fragile: "قابل للكسر",
  heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس",
  food: "طعام", other: "أخري",
};

const fc  = (n: number | string) => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fmt = (d: string)          => new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });

// ─── API helpers ──────────────────────────────────────────────────────────────
function apiHeaders() {
  const token = localStorage.getItem("caprina_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { headers: apiHeaders(), ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || r.statusText); }
  return r.json();
}

// ─── Excel-style Column Filter ────────────────────────────────────────────────
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
      <button ref={btnRef} type="button" onClick={handleOpen} title="فلتر"
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
              <ChevronUp className="w-2.5 h-2.5" />أ→ي
            </button>
            <button type="button" onClick={() => { onSort(col, "desc"); setOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${isSorted && sortDir === "desc" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronDown className="w-2.5 h-2.5" />ي→أ
            </button>
          </div>
          <div className="px-2 pt-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في القيم..."
              className="w-full h-7 text-[10px] px-2 border border-border rounded bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="max-h-52 overflow-y-auto px-1 py-1.5 flex flex-col gap-0.5">
            {opts.length === 0
              ? <p className="text-muted-foreground text-center py-3 text-[10px]">لا توجد قيم</p>
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
                className="text-destructive text-[10px] hover:underline w-full text-right">مسح الفلتر</button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
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

// ─── Summary KPI Cards ────────────────────────────────────────────────────────
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

// ─── New Shipment Form ────────────────────────────────────────────────────────
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

  const [form, setForm] = useState({
    clientId: "",
    senderName: "", senderPhone: "", senderPhone2: "", senderCity: "",
    receiverName: "", receiverPhone: "", receiverPhone2: "", receiverAddress: "", receiverCity: "",
    zoneId: "",
    parcelType: "" as ParcelType | "",
    weight: "", pieces: "1", description: "", declaredValue: "",
    paymentMethod: "cod" as PaymentMethod,
    codAmount: "", insuranceFee: "0",
    notes: "",
  });
  const [clientSearch, setClientSearch] = useState("");
  const [showClientList, setShowClientList] = useState(false);

  // الحسابات التلقائية
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

  // لما يختار عميل — يملأ بياناته تلقائياً
  function selectClient(c: Client) {
    setForm(f => ({
      ...f,
      clientId: String(c.id),
      senderName: c.name,
      senderPhone: c.phone || "",
      senderPhone2: c.phone2 || "",
      senderCity: c.city || "",
    }));
    setClientSearch(c.name);
    setShowClientList(false);
  }

  const mutation = useMutation({
    mutationFn: (data: any) => apiFetch("/shipments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      toast({ title: "تم إنشاء الشحنة بنجاح ✅" });
      onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.senderName || !form.receiverName) {
      toast({ title: "الحقول المطلوبة", description: "اسم المرسل واسم المستلم مطلوبان", variant: "destructive" });
      return;
    }
    mutation.mutate({
      clientId:        form.clientId ? Number(form.clientId) : undefined,
      senderName:      form.senderName,
      senderPhone:     form.senderPhone || undefined,
      senderPhone2:    form.senderPhone2 || undefined,
      senderCity:      form.senderCity || undefined,
      receiverName:    form.receiverName,
      receiverPhone:   form.receiverPhone || undefined,
      receiverPhone2:  form.receiverPhone2 || undefined,
      receiverAddress: form.receiverAddress || undefined,
      receiverCity:    form.receiverCity || undefined,
      zoneId:          form.zoneId    ? Number(form.zoneId)    : undefined,
      zonePrice:       zonePrice      || undefined,
      parcelType:      form.parcelType || undefined,
      parcelTypePrice: parcelPrice    || undefined,
      weight:          form.weight    ? form.weight    : undefined,
      pieces:          Number(form.pieces) || 1,
      description:     form.description || undefined,
      declaredValue:   form.declaredValue ? form.declaredValue : undefined,
      paymentMethod:   form.paymentMethod,
      codAmount:       cod || undefined,
      shippingFee:     shippingFee || undefined,
      insuranceFee:    insurance || undefined,
      totalAmount:     total || undefined,
      notes:           form.notes || undefined,
      status:          "waiting",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <Package className="w-4 h-4 text-primary" />
            شحنة جديدة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">

          {/* ── بيانات المرسل / العميل ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <User className="w-3.5 h-3.5" /> بيانات المرسل / العميل
            </h3>

            {/* اختيار العميل من القائمة */}
            <div className="relative">
              <Label className="text-xs font-bold mb-1.5 block">العميل (اختياري)</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pr-9 text-sm"
                  placeholder="ابحث باسم العميل أو رقمه..."
                  value={clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setShowClientList(true); }}
                  onFocus={() => setShowClientList(true)}
                />
              </div>
              {showClientList && filteredClients.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-card border border-border rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                  {filteredClients.slice(0, 10).map(c => (
                    <button key={c.id} type="button" onClick={() => selectClient(c)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-right">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {c.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{c.name}</p>
                        {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold mb-1.5 block">اسم المرسل <span className="text-red-500">*</span></Label>
                <Input className="text-sm" placeholder="الاسم الكامل" value={form.senderName} onChange={e => set("senderName", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">رقم الهاتف</Label>
                <Input className="text-sm" placeholder="01XXXXXXXXX" value={form.senderPhone} onChange={e => set("senderPhone", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">هاتف 2</Label>
                <Input className="text-sm" placeholder="رقم بديل" value={form.senderPhone2} onChange={e => set("senderPhone2", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">المدينة</Label>
                <Input className="text-sm" placeholder="مدينة المرسل" value={form.senderCity} onChange={e => set("senderCity", e.target.value)} />
              </div>
            </div>
          </section>

          {/* ── بيانات المستلم ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <MapPin className="w-3.5 h-3.5" /> بيانات المستلم والعنوان
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold mb-1.5 block">اسم المستلم <span className="text-red-500">*</span></Label>
                <Input className="text-sm" placeholder="الاسم الكامل" value={form.receiverName} onChange={e => set("receiverName", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">رقم الهاتف</Label>
                <Input className="text-sm" placeholder="01XXXXXXXXX" value={form.receiverPhone} onChange={e => set("receiverPhone", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">هاتف 2</Label>
                <Input className="text-sm" placeholder="رقم بديل" value={form.receiverPhone2} onChange={e => set("receiverPhone2", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">المنطقة / المدينة</Label>
                <Select value={form.zoneId} onValueChange={v => set("zoneId", v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="اختر المنطقة..." /></SelectTrigger>
                  <SelectContent>
                    {zones.filter(z => z.isActive !== false).map(z => (
                      <SelectItem key={z.id} value={String(z.id)}>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{z.name}{z.governorate ? ` — ${z.governorate}` : ""}</span>
                          <span className="text-xs text-muted-foreground font-bold">{fc(z.price)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedZone && (
                  <p className="text-[10px] text-primary mt-1">سعر التوصيل: {fc(selectedZone.price)}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-bold mb-1.5 block">العنوان التفصيلي</Label>
                <Input className="text-sm" placeholder="الشارع، المبنى، الشقة..." value={form.receiverAddress} onChange={e => set("receiverAddress", e.target.value)} />
              </div>
            </div>
          </section>

          {/* ── تفاصيل الشحنة ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <Boxes className="w-3.5 h-3.5" /> تفاصيل الشحنة
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold mb-1.5 block">نوع الشحنة</Label>
                <Select value={form.parcelType} onValueChange={v => set("parcelType", v as ParcelType)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="اختر نوع الشحنة..." /></SelectTrigger>
                  <SelectContent>
                    {parcelPricing.filter(p => (p as any).isActive !== false).map(p => (
                      <SelectItem key={p.id} value={p.parcelType}>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{p.label || PARCEL_LABELS[p.parcelType as ParcelType] || p.parcelType}</span>
                          <span className="text-xs text-muted-foreground font-bold">{fc(p.basePrice)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPricing && (
                  <p className="text-[10px] text-primary mt-1">سعر النوع: {fc(selectedPricing.basePrice)}</p>
                )}
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">الوزن (كجم)</Label>
                <Input type="number" className="text-sm" placeholder="0.00" value={form.weight} onChange={e => set("weight", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">عدد القطع</Label>
                <Input type="number" min="1" className="text-sm" value={form.pieces} onChange={e => set("pieces", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">القيمة المعلنة (جنيه)</Label>
                <Input type="number" className="text-sm" placeholder="0" value={form.declaredValue} onChange={e => set("declaredValue", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-bold mb-1.5 block">وصف الشحنة</Label>
                <Input className="text-sm" placeholder="محتوى الشحنة..." value={form.description} onChange={e => set("description", e.target.value)} />
              </div>
            </div>
          </section>

          {/* ── البيانات المالية ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <CreditCard className="w-3.5 h-3.5" /> البيانات المالية
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <Label className="text-xs font-bold mb-2 block">طريقة الدفع</Label>
                <div className="flex flex-wrap gap-2">
                  {(["cod","prepaid","deferred"] as PaymentMethod[]).map(m => (
                    <button key={m} type="button"
                      onClick={() => set("paymentMethod", m)}
                      className={`flex-1 min-w-[120px] px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        form.paymentMethod === m
                          ? PAYMENT_COLORS[m] + " ring-2 ring-offset-1 ring-current/30"
                          : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"
                      }`}
                    >
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              {form.paymentMethod === "cod" && (
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">مبلغ التحصيل (COD)</Label>
                  <Input type="number" className="text-sm" placeholder="0" value={form.codAmount} onChange={e => set("codAmount", e.target.value)} />
                </div>
              )}
              <div>
                <Label className="text-xs font-bold mb-1.5 block">رسوم التأمين</Label>
                <Input type="number" className="text-sm" placeholder="0" value={form.insuranceFee} onChange={e => set("insuranceFee", e.target.value)} />
              </div>
            </div>

            {/* ملخص الحساب التلقائي */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <h4 className="text-xs font-black text-primary">ملخص التكاليف</h4>
              <div className="space-y-1.5">
                {[
                  { label: "سعر منطقة التوصيل",  value: fc(zonePrice)  },
                  { label: "إضافة نوع الشحنة",   value: fc(parcelPrice)},
                  { label: "رسوم التأمين",        value: fc(insurance)  },
                  form.paymentMethod === "cod"
                    ? { label: "مبلغ التحصيل (COD)", value: fc(cod), highlight: true }
                    : null,
                ].filter(Boolean).map((row: any, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`font-bold ${row.highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>{row.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-black border-t border-primary/20 pt-2 mt-1">
                  <span className="text-foreground">الإجمالي</span>
                  <span className="text-primary">{fc(total)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── ملاحظات ── */}
          <div>
            <Label className="text-xs font-bold mb-1.5 block">ملاحظات</Label>
            <Input className="text-sm" placeholder="أي تعليمات خاصة..." value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>

          {/* ── أزرار ── */}
          <div className="flex gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={onClose} className="flex-1">إلغاء</Button>
            <Button onClick={handleSubmit} disabled={mutation.isPending} className="flex-1 gap-2">
              {mutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              إنشاء الشحنة
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


// ─── Edit Status Dialog ───────────────────────────────────────────────────────
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
      toast({ title: "تم تحديث حالة الشحنة ✅" });
      onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm font-black flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            تحديث شحنة #{shipment.shipmentNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs font-bold mb-2 block">الحالة</Label>
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
            <Label className="text-xs font-bold mb-1.5 block">رقم التتبع</Label>
            <Input className="text-sm" placeholder="رقم التتبع من شركة الشحن" value={tracking} onChange={e => setTracking(e.target.value)} />
          </div>
          {(shipment.paymentMethod === "cod" || status === "delivered") && (
            <div>
              <Label className="text-xs font-bold mb-1.5 block">المبلغ المحصَّل</Label>
              <Input type="number" className="text-sm" value={collected} onChange={e => setCollected(e.target.value)} />
            </div>
          )}
          <div className="flex gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={onClose} className="flex-1 text-xs">إلغاء</Button>
            <Button onClick={() => mutation.mutate({ status, trackingNumber: tracking || undefined, collectedAmount: Number(collected) })}
              disabled={mutation.isPending} className="flex-1 text-xs gap-1.5">
              {mutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              حفظ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shipment Row Card ────────────────────────────────────────────────────────
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
                <Edit className="w-3 h-3 ml-1" /> تحديث
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
        </div>
      </div>
    </div>
  );
}

// ── تصنيفات العملاء — ثابتة للـ UI ──────────────────────────────────────────
const TIER_INFO = [
  {
    key:   "normal"     as const,
    label: "عادي",
    range: "١ – ٢٠٠ شحنة / شهر",
    color: "text-slate-400",
    border:"border-slate-600/60",
    bg:    "bg-slate-800/30",
    dot:   "bg-slate-400",
    field: "priceNormal" as const,
    placeholder: "سعر العميل العادي",
  },
  {
    key:   "commercial" as const,
    label: "تجاري",
    range: "٢٠١ – ٥٠٠ شحنة / شهر",
    color: "text-blue-400",
    border:"border-blue-600/60",
    bg:    "bg-blue-900/20",
    dot:   "bg-blue-400",
    field: "priceCommercial" as const,
    placeholder: "سعر العميل التجاري",
  },
  {
    key:   "vip" as const,
    label: "VIP",
    range: "٥٠١ – ١٠٠٠ شحنة / شهر",
    color: "text-amber-400",
    border:"border-amber-600/60",
    bg:    "bg-amber-900/20",
    dot:   "bg-amber-400",
    field: "priceVip" as const,
    placeholder: "سعر عميل VIP",
  },
] as const;

type ZoneFormState = {
  name: string; governorate: string;
  priceNormal: string; priceCommercial: string; priceVip: string;
};
const emptyZoneForm = (): ZoneFormState => ({ name: "", governorate: "", priceNormal: "", priceCommercial: "", priceVip: "" });

// ─── Zones Settings Tab ───────────────────────────────────────────────────────
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
      toast({ title: "تمت إضافة المنطقة ✅" });
      setForm(emptyZoneForm());
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => apiFetch(`/shipment-zones/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-zones"] });
      toast({ title: "تم التحديث ✅" });
      setEditId(null);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/shipment-zones/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shipment-zones"] }); toast({ title: "تم الحذف" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
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

  // مكوّن صغير — شريحة السعر لكل tier داخل البطاقة
  function TierPriceChip({ tier, value }: { tier: typeof TIER_INFO[number]; value: string | number }) {
    const n = Number(value) || 0;
    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${tier.border} ${tier.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tier.dot}`} />
        <span className={`text-[9px] font-bold ${tier.color}`}>{tier.label}</span>
        <span className={`text-[11px] font-black ${tier.color} mr-auto`}>
          {n > 0 ? fc(n) : <span className="text-muted-foreground/50 font-normal text-[9px]">—</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Tier Legend (شرح مرة واحدة في الأعلى) ── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            تصنيفات العملاء — نطاقات الشحن الشهرية
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

      {/* ── Add Zone ── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-500" /> إضافة منطقة جديدة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* الاسم والمحافظة */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold mb-1.5 block">اسم المنطقة / المدينة <span className="text-red-500">*</span></Label>
              <Input className="text-sm" placeholder="مثال: القاهرة" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-bold mb-1.5 block">المحافظة</Label>
              <Input className="text-sm" placeholder="مثال: القاهرة الكبرى" value={form.governorate}
                onChange={e => setForm(f => ({ ...f, governorate: e.target.value }))} />
            </div>
          </div>

          {/* أسعار التيرز */}
          <div className="p-3 rounded-xl border border-border bg-muted/10 space-y-2.5">
            <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" />سعر التوصيل حسب تصنيف العميل
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
            إضافة المنطقة
          </Button>
        </CardContent>
      </Card>

      {/* ── Zones List ── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black">المناطق المضافة ({zones.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : zones.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">لا توجد مناطق — أضف منطقة من الأعلى</p>
          ) : (
            <div className="space-y-3">
              {(zones as any[]).map(z => (
                <div key={z.id} className="rounded-xl border border-border bg-muted/10 overflow-hidden">

                  {editId === z.id ? (
                    /* ── وضع التعديل ── */
                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] font-bold mb-1 block">الاسم</Label>
                          <Input className="text-xs h-8" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold mb-1 block">المحافظة</Label>
                          <Input className="text-xs h-8" value={editForm.governorate} onChange={e => setEditForm(f => ({ ...f, governorate: e.target.value }))} />
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border bg-muted/10 space-y-2">
                        <p className="text-[9px] font-bold text-muted-foreground">أسعار التوصيل حسب التصنيف</p>
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
                          {updateMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : "حفظ التعديلات"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditId(null)}>إلغاء</Button>
                      </div>
                    </div>
                  ) : (
                    /* ── وضع العرض ── */
                    <div className="p-3">
                      {/* رأس البطاقة */}
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
                            onClick={() => { if (confirm("حذف المنطقة؟")) deleteMutation.mutate(z.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* شرائح الأسعار */}
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

function ParcelPricingTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editPrices, setEditPrices] = useState<Record<number, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const { data: pricing = [], isLoading } = useQuery({
    queryKey: ["parcel-type-pricing"],
    queryFn: () => apiFetch<ParcelTypePricing[]>("/parcel-type-pricing"),
  });

  const initMutation = useMutation({
    mutationFn: () => apiFetch("/parcel-type-pricing/init", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] }); toast({ title: "تمت التهيئة ✅" }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, basePrice }: { id: number; basePrice: number }) =>
      apiFetch(`/parcel-type-pricing/${id}`, { method: "PUT", body: JSON.stringify({ basePrice }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] }); toast({ title: "تم التحديث ✅" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: (d: any) => apiFetch("/parcel-type-pricing", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] });
      toast({ title: "تمت الإضافة ✅" });
      setAddOpen(false); setNewType(""); setNewLabel(""); setNewPrice("");
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/parcel-type-pricing/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] }); toast({ title: "تم الحذف" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const ICONS: Record<string, string> = {
    document: "📄", normal: "📦", fragile: "🔮", heavy: "⚖️",
    electronics: "💻", clothing: "👕", food: "🍱", other: "📫",
  };

  return (
    <div className="space-y-5">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-500" /> أسعار أنواع الشحنات
          </CardTitle>
          <div className="flex gap-2">
            {pricing.length === 0 && (
              <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8"
                onClick={() => initMutation.mutate()} disabled={initMutation.isPending}>
                {initMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                تهيئة الأسعار الافتراضية
              </Button>
            )}
            <Button size="sm" className="text-xs gap-1.5 h-8"
              onClick={() => setAddOpen(true)}>
              <Plus className="w-3 h-3" /> إضافة نوع جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : pricing.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-xs text-muted-foreground mb-3">لا توجد أسعار — اضغط "تهيئة الأسعار الافتراضية" لإضافة الأنواع الـ 8</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pricing.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
                  <span className="text-xl shrink-0">{ICONS[p.parcelType] ?? "📦"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">{p.label || PARCEL_LABELS[p.parcelType as ParcelType] || p.parcelType}</p>
                    <p className="text-[10px] text-muted-foreground">سعر إضافي على رسوم المنطقة</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      className="text-xs h-8 w-24 text-center"
                      value={editPrices[p.id] ?? String(p.basePrice)}
                      onChange={e => setEditPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                    />
                    <Button size="sm" className="h-8 text-xs px-3"
                      onClick={() => updateMutation.mutate({ id: p.id, basePrice: Number(editPrices[p.id] ?? p.basePrice) })}
                      disabled={updateMutation.isPending}>
                      حفظ
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => { if (confirm("حذف هذا النوع؟")) deleteMutation.mutate(p.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-4 border-t border-border pt-3">
            💡 السعر الإجمالي للشحنة = سعر المنطقة + سعر نوع الشحنة + رسوم التأمين
          </p>
        </CardContent>
      </Card>

      {/* ── Add Type Dialog ── */}
      {addOpen && (
        <Dialog open onOpenChange={() => setAddOpen(false)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-sm font-black flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-500" /> إضافة نوع شحنة جديد
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-bold mb-1.5 block">المعرف (بالإنجليزية) <span className="text-red-500">*</span></Label>
                <Input className="text-sm" placeholder="مثال: special" value={newType}
                  onChange={e => setNewType(e.target.value.toLowerCase().replace(/\s/g, "_"))} />
                <p className="text-[10px] text-muted-foreground mt-1">حروف إنجليزية صغيرة وشرطة سفلية فقط</p>
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">الاسم بالعربية <span className="text-red-500">*</span></Label>
                <Input className="text-sm" placeholder="مثال: شحنة خاصة" value={newLabel}
                  onChange={e => setNewLabel(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">السعر الإضافي (جنيه) <span className="text-red-500">*</span></Label>
                <Input type="number" className="text-sm" placeholder="0" value={newPrice}
                  onChange={e => setNewPrice(e.target.value)} />
              </div>
              <div className="flex gap-2 pt-1 border-t border-border">
                <Button variant="outline" className="flex-1 text-xs" onClick={() => setAddOpen(false)}>إلغاء</Button>
                <Button className="flex-1 text-xs gap-1.5"
                  disabled={!newType || !newLabel || !newPrice || addMutation.isPending}
                  onClick={() => addMutation.mutate({ parcelType: newType, label: newLabel, basePrice: Number(newPrice), isActive: true })}>
                  {addMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  إضافة
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ShipmentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"zones" | "pricing">("zones");

  const { data: zones = [] } = useQuery({
    queryKey: ["shipment-zones"],
    queryFn:  () => apiFetch<ShipmentZone[]>("/shipment-zones"),
  });

  const { data: parcelPricing = [] } = useQuery({
    queryKey: ["parcel-type-pricing"],
    queryFn:  () => apiFetch<ParcelTypePricing[]>("/parcel-type-pricing"),
  });

  const TABS = [
    { key: "zones",    label: "المناطق والأسعار", icon: Globe,   count: zones.length },
    { key: "pricing",  label: "أسعار الأنواع",    icon: Layers,  count: parcelPricing.length },
  ] as const;

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            إعدادات الشحن
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">إدارة المناطق وأسعار أنواع الطرود</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                active ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab: Zones ── */}
      {activeTab === "zones" && <ZonesTab />}

      {/* ── Tab: Pricing ── */}
      {activeTab === "pricing" && <ParcelPricingTab />}
    </div>
  );
}
