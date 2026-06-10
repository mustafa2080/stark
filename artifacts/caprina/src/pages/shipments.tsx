import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Plus, Search, Filter, Truck, MapPin, Phone, User,
  CreditCard, Clock, CheckCircle, AlertTriangle, XCircle,
  ChevronDown, X, RefreshCw, Eye, Edit, Trash2,
  ArrowUpDown, Building2, DollarSign, FileText, Boxes, Tag,
} from "lucide-react";
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
                    {(["document","normal","fragile","heavy","electronics","clothing","food","other"] as ParcelType[]).map(t => {
                      const pp = parcelPricing.find(p => p.parcelType === t);
                      return (
                        <SelectItem key={t} value={t}>
                          <div className="flex items-center justify-between gap-4 w-full">
                            <span>{PARCEL_LABELS[t]}</span>
                            {pp && <span className="text-xs text-muted-foreground font-bold">{fc(pp.basePrice)}</span>}
                          </div>
                        </SelectItem>
                      );
                    })}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ShipmentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("all");
  const [formOpen, setFormOpen]      = useState(false);
  const [editTarget, setEditTarget]  = useState<Shipment | null>(null);

  // ─ data fetching ─
  const { data: shipmentsData, isLoading } = useQuery({
    queryKey: ["shipments", statusFilter, search],
    queryFn:  () => apiFetch<{ data: Shipment[]; total: number }>(
      `/shipments?status=${statusFilter}&search=${encodeURIComponent(search)}&limit=100`
    ),
  });

  const { data: stats } = useQuery({
    queryKey: ["shipments-stats"],
    queryFn:  () => apiFetch<any>("/shipments/stats"),
  });

  const { data: zones = [] } = useQuery({
    queryKey: ["shipment-zones"],
    queryFn:  () => apiFetch<ShipmentZone[]>("/shipment-zones"),
  });

  const { data: parcelPricing = [] } = useQuery({
    queryKey: ["parcel-type-pricing"],
    queryFn:  () => apiFetch<ParcelTypePricing[]>("/parcel-type-pricing"),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn:  () => apiFetch<Client[]>("/clients?limit=500"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/shipments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["shipments-stats"] });
      toast({ title: "تم حذف الشحنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const shipments = shipmentsData?.data ?? [];
  const total     = shipmentsData?.total ?? 0;

  // ─ status counts from stats ─
  const statusCounts: Record<string, number> = {};
  (stats?.statuses ?? []).forEach((r: any) => { statusCounts[r.status] = Number(r.count); });
  const totalAll = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            إدارة الشحنات
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">تتبع وإدارة جميع شحناتك من مكان واحد</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2 text-sm font-bold">
          <Plus className="w-4 h-4" /> شحنة جديدة
        </Button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="إجمالي الشحنات" value={totalAll} icon={Boxes} color="bg-primary/10 text-primary" />
        <KpiCard label="تم التسليم" value={statusCounts["delivered"] ?? 0}
          sub={totalAll ? `${Math.round(((statusCounts["delivered"]??0)/totalAll)*100)}%` : undefined}
          icon={CheckCircle} color="bg-emerald-500/10 text-emerald-500" />
        <KpiCard label="في الطريق"
          value={(statusCounts["in_transit"]??0) + (statusCounts["out_for_delivery"]??0) + (statusCounts["confirmed"]??0)}
          icon={Truck} color="bg-violet-500/10 text-violet-500" />
        <KpiCard label="مرتجع / ملغي"
          value={(statusCounts["returned"]??0) + (statusCounts["cancelled"]??0)}
          icon={XCircle} color="bg-red-500/10 text-red-500" />
      </div>

      {/* ── Financial Summary ── */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground font-medium">إجمالي رسوم الشحن</p>
              <p className="text-base font-black text-foreground mt-0.5">{fc(stats.totalShippingFee ?? 0)}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground font-medium">إجمالي COD المتوقع</p>
              <p className="text-base font-black text-amber-500 mt-0.5">{fc(stats.totalCod ?? 0)}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground font-medium">إجمالي المحصَّل</p>
              <p className="text-base font-black text-emerald-500 mt-0.5">{fc(stats.totalCollected ?? 0)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pr-9 text-sm h-9" placeholder="بحث باسم أو هاتف أو رقم الشحنة..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات ({totalAll})</SelectItem>
            {(Object.keys(STATUS_CFG) as ShipmentStatus[]).map(s => (
              <SelectItem key={s} value={s}>
                {STATUS_CFG[s].label} {statusCounts[s] ? `(${statusCounts[s]})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Status Pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setStatus("all")}
          className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${statusFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"}`}>
          الكل {totalAll > 0 && `(${totalAll})`}
        </button>
        {(Object.keys(STATUS_CFG) as ShipmentStatus[]).map(s => {
          const cnt = statusCounts[s] ?? 0;
          if (!cnt && statusFilter !== s) return null;
          return (
            <button key={s} onClick={() => setStatus(s === statusFilter ? "all" : s)}
              className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${statusFilter === s ? STATUS_CFG[s].cls : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"}`}>
              {STATUS_CFG[s].label} {cnt > 0 && `(${cnt})`}
            </button>
          );
        })}
      </div>

      {/* ── List ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : shipments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/15 flex items-center justify-center mb-4">
            <Package className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-sm font-bold text-foreground">لا توجد شحنات</p>
          <p className="text-xs text-muted-foreground mt-1">ابدأ بإضافة شحنة جديدة</p>
          <Button onClick={() => setFormOpen(true)} className="mt-4 gap-2 text-xs" size="sm">
            <Plus className="w-3.5 h-3.5" /> شحنة جديدة
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shipments.map(s => (
            <ShipmentCard key={s.id} shipment={s}
              onEdit={() => setEditTarget(s)}
              onDelete={() => {
                if (confirm(`حذف الشحنة ${s.shipmentNumber}؟`)) deleteMutation.mutate(s.id);
              }}
            />
          ))}
        </div>
      )}

      {total > shipments.length && (
        <p className="text-center text-xs text-muted-foreground">يتم عرض {shipments.length} من {total} شحنة</p>
      )}

      {/* ── Dialogs ── */}
      {formOpen && (
        <ShipmentFormDialog open zones={zones} parcelPricing={parcelPricing} clients={clients} onClose={() => setFormOpen(false)} />
      )}
      {editTarget && (
        <EditStatusDialog shipment={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}
