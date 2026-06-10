import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { ArrowRight, Truck, MapPin, Phone, Package, CreditCard, Clock, CheckCircle, AlertTriangle, XCircle, Pencil, Save, X, Printer, RotateCcw, User, FileText, DollarSign } from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

// ─── helpers ───────────────────────────────────────────────────────────────────
function apiHeaders() {
  const token = localStorage.getItem("caprina_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function shipApiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { headers: apiHeaders(), ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || r.statusText); }
  return r.json();
}
const fc = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fdate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// ─── Status config ─────────────────────────────────────────────────────────────
type ShipmentStatus = "waiting"|"confirmed"|"picked_up"|"in_transit"|"out_for_delivery"|"delivered"|"delayed"|"returned"|"cancelled";

const STATUS_CFG: Record<ShipmentStatus, { label: string; icon: React.ElementType; cls: string; dot: string }> = {
  waiting:          { label: "انتظار",          icon: Clock,         cls: "bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600",    dot: "bg-slate-400" },
  confirmed:        { label: "مؤكدة",           icon: CheckCircle,   cls: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700",           dot: "bg-blue-500" },
  picked_up:        { label: "تم الاستلام",     icon: Package,       cls: "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-700",           dot: "bg-cyan-500" },
  in_transit:       { label: "في الطريق",       icon: Truck,         cls: "bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-700", dot: "bg-violet-500" },
  out_for_delivery: { label: "خارج للتسليم",   icon: MapPin,        cls: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700",     dot: "bg-amber-500" },
  delivered:        { label: "تم التسليم ✓",   icon: CheckCircle,   cls: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700", dot: "bg-emerald-500" },
  delayed:          { label: "مؤجلة",           icon: AlertTriangle, cls: "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700", dot: "bg-orange-500" },
  returned:         { label: "مرتجعة",          icon: RotateCcw,     cls: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700",               dot: "bg-red-500" },
  cancelled:        { label: "ملغية",           icon: XCircle,       cls: "bg-gray-50 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700",          dot: "bg-gray-400" },
};

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  cod:      { label: "الدفع عند الاستلام", cls: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-300" },
  prepaid:  { label: "مدفوع مسبقاً",       cls: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-300" },
  deferred: { label: "الدفع لاحقاً",        cls: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-300" },
};

const PARCEL_LABELS: Record<string, string> = {
  document:    "مستندات",
  normal:      "عادي",
  fragile:     "هش",
  heavy:       "ثقيل",
  electronics: "إلكترونيات",
  clothing:    "ملابس",
  food:        "طعام",
  other:       "أخرى",
};

// ─── Status timeline steps ─────────────────────────────────────────────────────
const STATUS_STEPS: ShipmentStatus[] = ["waiting","confirmed","picked_up","in_transit","out_for_delivery","delivered"];

// ─── Shipment interface ────────────────────────────────────────────────────────
interface Shipment {
  id: number;
  shipmentNumber?: string;
  trackingNumber?: string;
  clientId?: number;
  senderName: string;
  senderPhone?: string;
  senderPhone2?: string;
  senderEmail?: string;
  senderAddress?: string;
  senderCity?: string;
  receiverName: string;
  receiverPhone?: string;
  receiverPhone2?: string;
  receiverAddress?: string;
  receiverCity?: string;
  zoneId?: number;
  zonePrice?: string | number;
  parcelType?: string;
  parcelTypePrice?: string | number;
  weight?: string | number;
  pieces?: number;
  description?: string;
  declaredValue?: string | number;
  paymentMethod: string;
  codAmount?: string | number;
  shippingFee?: string | number;
  insuranceFee?: string | number;
  totalAmount?: string | number;
  collectedAmount?: string | number;
  status: ShipmentStatus;
  notes?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt?: string;
  createdByName?: string;
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ShipmentDetailPage() {
  const [, params] = useRoute("/shipments/:id");
  const id = Number(params?.id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  // ─── fetch shipment ──────────────────────────────────────────────────────
  const { data: shipment, isLoading, error } = useQuery<Shipment>({
    queryKey: ["shipment-detail", id],
    queryFn: () => shipApiFetch<Shipment>(`/shipments/${id}`),
    enabled: !!id,
  });

  // ─── fetch zone name ─────────────────────────────────────────────────────
  const { data: zones = [] } = useQuery<{ id: number; name: string; governorate?: string }[]>({
    queryKey: ["shipment-zones"],
    queryFn: () => shipApiFetch("/shipment-zones"),
  });
  const zone = zones.find(z => z.id === shipment?.zoneId);

  // ─── inline status edit ──────────────────────────────────────────────────
  const [editStatus, setEditStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<ShipmentStatus>("waiting");
  const [newTracking, setNewTracking] = useState("");
  const [editNotes, setEditNotes] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [iNotesVal, setINotesVal] = useState("");

  useEffect(() => {
    if (shipment) {
      setNewStatus(shipment.status);
      setNewTracking(shipment.trackingNumber ?? "");
      setNotesVal(shipment.notes ?? "");
      setINotesVal(shipment.internalNotes ?? "");
    }
  }, [shipment]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => shipApiFetch(`/shipments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-detail", id] });
      qc.invalidateQueries({ queryKey: ["shipments-orders"] });
      toast({ title: "تم الحفظ ✅" });
      setEditStatus(false);
      setEditNotes(false);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // ─── guards ──────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Truck className="w-10 h-10 animate-pulse text-primary" />
        <p className="text-sm">جاري تحميل بيانات الشحنة...</p>
      </div>
    </div>
  );

  if (error || !shipment) return (
    <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
      <div className="text-center space-y-3">
        <XCircle className="w-12 h-12 text-red-500 mx-auto" />
        <p className="font-bold text-foreground">الشحنة غير موجودة</p>
        <Link href="/orders" className="text-sm text-primary underline">← العودة للشحنات</Link>
      </div>
    </div>
  );

  const cfg = STATUS_CFG[shipment.status] ?? STATUS_CFG.waiting;
  const StatusIcon = cfg.icon;
  const paymentCfg = PAYMENT_CFG[shipment.paymentMethod] ?? PAYMENT_CFG.cod;
  const currentStepIdx = STATUS_STEPS.indexOf(shipment.status);
  const isTerminal = shipment.status === "returned" || shipment.status === "cancelled";

  return (
    <div className="space-y-5 animate-in fade-in duration-500 max-w-5xl mx-auto" dir="rtl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/orders"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors">
            <ArrowRight className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              شحنة #{shipment.shipmentNumber ?? String(id).padStart(4, "0")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fdate(shipment.createdAt)}
              {shipment.createdByName && <span> · بواسطة {shipment.createdByName}</span>}
            </p>
          </div>
        </div>

        {/* Status badge + edit */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${cfg.cls}`}>
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <StatusIcon className="w-3.5 h-3.5" />
            {cfg.label}
          </span>
          {isAdmin && (
            <button onClick={() => setEditStatus(v => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground hover:text-primary">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => window.print()}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground">
            <Printer className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Inline status edit panel ──────────────────────────────────────── */}
      {editStatus && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" />تعديل الحالة
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold mb-1 block">الحالة الجديدة</label>
                <select className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  value={newStatus} onChange={e => setNewStatus(e.target.value as ShipmentStatus)}>
                  {(Object.keys(STATUS_CFG) as ShipmentStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">رقم التتبع</label>
                <input className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  value={newTracking} onChange={e => setNewTracking(e.target.value)} placeholder="رقم التتبع..." />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditStatus(false)}
                className="h-8 px-3 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors">
                إلغاء
              </button>
              <button
                onClick={() => updateMutation.mutate({ status: newStatus, trackingNumber: newTracking || undefined })}
                disabled={updateMutation.isPending}
                className="h-8 px-4 text-xs rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors flex items-center gap-1.5">
                <Save className="w-3 h-3" />{updateMutation.isPending ? "جاري..." : "حفظ"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Progress timeline ─────────────────────────────────────────────── */}
      {!isTerminal && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-bold text-muted-foreground mb-4 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />مسار الشحنة
            </p>
            <div className="flex items-center gap-0">
              {STATUS_STEPS.map((s, i) => {
                const done = currentStepIdx > i;
                const active = currentStepIdx === i;
                const scfg = STATUS_CFG[s];
                const Icon = scfg.icon;
                return (
                  <div key={s} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                        done   ? "bg-emerald-500 border-emerald-500 text-white" :
                        active ? "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20" :
                                 "bg-muted border-border text-muted-foreground"
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className={`text-[9px] font-bold text-center leading-tight ${
                        active ? "text-primary" : done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                      }`}>{scfg.label}</span>
                    </div>
                    {i < STATUS_STEPS.length - 1 && (
                      <div className={`h-0.5 flex-1 mx-1 rounded-full transition-all ${done ? "bg-emerald-500" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {isTerminal && (
        <Card className={shipment.status === "returned" ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10" : "border-gray-300 dark:border-gray-700"}>
          <CardContent className="p-4 flex items-center gap-3">
            {shipment.status === "returned" ? <RotateCcw className="w-5 h-5 text-red-500" /> : <XCircle className="w-5 h-5 text-gray-500" />}
            <p className="font-bold text-sm">{cfg.label}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Tracking number ──────────────────────────────────────────────── */}
      {shipment.trackingNumber && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/5">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground">رقم التتبع:</span>
          <span className="font-black text-sm text-primary font-mono">{shipment.trackingNumber}</span>
        </div>
      )}

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left col: sender + receiver ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* بيانات المُرسِل */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                </div>
                بيانات المُرسِل
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <InfoRow label="الاسم" value={shipment.senderName} bold />
              {shipment.senderPhone && <InfoRow label="الهاتف" value={shipment.senderPhone} mono dir="ltr" />}
              {shipment.senderPhone2 && <InfoRow label="هاتف 2" value={shipment.senderPhone2} mono dir="ltr" />}
              {shipment.senderCity && <InfoRow label="المدينة" value={shipment.senderCity} />}
              {shipment.senderAddress && <InfoRow label="العنوان" value={shipment.senderAddress} />}
              {shipment.senderEmail && <InfoRow label="البريد" value={shipment.senderEmail} />}
            </CardContent>
          </Card>

          {/* بيانات المُستلِم */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                بيانات المُستلِم
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <InfoRow label="الاسم" value={shipment.receiverName} bold />
              {shipment.receiverPhone && <InfoRow label="الهاتف" value={shipment.receiverPhone} mono dir="ltr" />}
              {shipment.receiverPhone2 && <InfoRow label="هاتف 2" value={shipment.receiverPhone2} mono dir="ltr" />}
              {shipment.receiverCity && <InfoRow label="المدينة / المنطقة" value={
                zone ? `${zone.name}${zone.governorate ? ` — ${zone.governorate}` : ""}` : shipment.receiverCity
              } />}
              {shipment.receiverAddress && <InfoRow label="العنوان" value={shipment.receiverAddress} />}
            </CardContent>
          </Card>

          {/* تفاصيل الطرد */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Package className="w-3.5 h-3.5 text-violet-500" />
                </div>
                تفاصيل الطرد
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {shipment.parcelType && (
                <InfoRow label="نوع الطرد" value={PARCEL_LABELS[shipment.parcelType] ?? shipment.parcelType} />
              )}
              {shipment.weight && <InfoRow label="الوزن" value={`${shipment.weight} كجم`} />}
              {shipment.pieces && shipment.pieces > 1 && <InfoRow label="عدد القطع" value={String(shipment.pieces)} />}
              {shipment.description && <InfoRow label="الوصف" value={shipment.description} />}
              {shipment.declaredValue && Number(shipment.declaredValue) > 0 && (
                <InfoRow label="القيمة المعلنة" value={fc(shipment.declaredValue)} />
              )}
            </CardContent>
          </Card>

          {/* الملاحظات */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  الملاحظات
                </div>
                {isAdmin && (
                  <button onClick={() => setEditNotes(v => !v)}
                    className="text-muted-foreground hover:text-primary transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {editNotes ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold mb-1 block">ملاحظات عامة</label>
                    <textarea className="w-full text-sm px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      rows={3} value={notesVal} onChange={e => setNotesVal(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold mb-1 block">ملاحظات داخلية</label>
                    <textarea className="w-full text-sm px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      rows={3} value={iNotesVal} onChange={e => setINotesVal(e.target.value)} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditNotes(false)}
                      className="h-8 px-3 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted">إلغاء</button>
                    <button onClick={() => updateMutation.mutate({ notes: notesVal, internalNotes: iNotesVal })}
                      disabled={updateMutation.isPending}
                      className="h-8 px-4 text-xs rounded-lg bg-primary text-primary-foreground font-bold flex items-center gap-1.5">
                      <Save className="w-3 h-3" />حفظ
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {shipment.notes ? (
                    <p className="text-sm text-foreground leading-relaxed">{shipment.notes}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">لا توجد ملاحظات</p>
                  )}
                  {shipment.internalNotes && (
                    <div className="mt-2 pt-2 border-t border-dashed border-border">
                      <p className="text-[10px] font-bold text-muted-foreground mb-1">ملاحظات داخلية</p>
                      <p className="text-sm text-foreground leading-relaxed">{shipment.internalNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* ── Right col: financial summary ── */}
        <div className="space-y-4">

          {/* الملخص المالي */}
          <Card className="border-primary/30">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-primary" />
                </div>
                الملخص المالي
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {/* payment method badge */}
              <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border ${paymentCfg.cls}`}>
                {paymentCfg.label}
              </span>
              <Separator />
              <div className="space-y-2 text-sm">
                {Number(shipment.zonePrice) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">سعر المنطقة</span>
                    <span className="font-semibold">{fc(shipment.zonePrice)}</span>
                  </div>
                )}
                {Number(shipment.parcelTypePrice) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">سعر نوع الطرد</span>
                    <span className="font-semibold">+{fc(shipment.parcelTypePrice)}</span>
                  </div>
                )}
                {Number(shipment.insuranceFee) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">رسوم التأمين</span>
                    <span className="font-semibold">{fc(shipment.insuranceFee)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-bold">رسوم الشحن</span>
                  <span className="font-black text-base text-primary">{fc(shipment.shippingFee)}</span>
                </div>
                {Number(shipment.codAmount) > 0 && (
                  <div className="flex justify-between mt-1">
                    <span className="text-muted-foreground">مبلغ COD</span>
                    <span className="font-black text-base text-amber-500">{fc(shipment.codAmount)}</span>
                  </div>
                )}
                {Number(shipment.collectedAmount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">تم تحصيله</span>
                    <span className="font-bold text-emerald-500">{fc(shipment.collectedAmount)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* معلومات إضافية */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-500/10 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                </div>
                معلومات إضافية
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <InfoRow label="رقم الشحنة" value={shipment.shipmentNumber ?? "—"} mono />
              {shipment.trackingNumber && <InfoRow label="رقم التتبع" value={shipment.trackingNumber} mono />}
              <InfoRow label="تاريخ الإنشاء" value={fdate(shipment.createdAt)} />
              {shipment.updatedAt && shipment.updatedAt !== shipment.createdAt && (
                <InfoRow label="آخر تعديل" value={fdate(shipment.updatedAt)} />
              )}
              {shipment.createdByName && <InfoRow label="بواسطة" value={shipment.createdByName} />}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}

// ─── InfoRow helper ────────────────────────────────────────────────────────────
function InfoRow({ label, value, bold, mono, dir: d }: {
  label: string; value: string; bold?: boolean; mono?: boolean; dir?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-left break-all ${bold ? "font-bold text-foreground" : "text-foreground"} ${mono ? "font-mono" : ""}`}
        dir={d}>{value}</span>
    </div>
  );
}
