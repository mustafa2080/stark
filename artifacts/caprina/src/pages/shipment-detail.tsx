import { useState, useEffect, useRef } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { createPortal } from "react-dom";
import {
  ArrowRight, Truck, MapPin, Phone, Package, CreditCard, Clock,
  CheckCircle, AlertTriangle, XCircle, Pencil, Printer, RotateCcw,
  User, FileText, DollarSign, Trash2, Save, CheckCircle2,
} from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── helpers ────────────────────────────────────────────────────────────────────
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

// ── types ──────────────────────────────────────────────────────────────────────
type ShipmentStatus = "waiting"|"confirmed"|"picked_up"|"in_transit"|"out_for_delivery"|"delivered"|"delayed"|"returned"|"cancelled";

interface Shipment {
  id: number; shipmentNumber?: string; trackingNumber?: string;
  clientId?: number;
  senderName: string; senderPhone?: string; senderPhone2?: string;
  senderEmail?: string; senderAddress?: string; senderCity?: string;
  receiverName: string; receiverPhone?: string; receiverPhone2?: string;
  receiverAddress?: string; receiverCity?: string;
  zoneId?: number; zonePrice?: string|number;
  parcelType?: string; parcelTypePrice?: string|number;
  weight?: string|number; pieces?: number;
  description?: string; declaredValue?: string|number;
  paymentMethod: string; codAmount?: string|number;
  shippingFee?: string|number; insuranceFee?: string|number;
  totalAmount?: string|number; collectedAmount?: string|number;
  status: ShipmentStatus; notes?: string; internalNotes?: string;
  createdAt: string; updatedAt?: string; createdByName?: string;
}

// ── status config ──────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "waiting",          label: "انتظار",          icon: "⏳", color: "text-slate-400",   bg: "bg-slate-500/10",   border: "border-slate-600/40",   dot: "bg-slate-400" },
  { value: "confirmed",        label: "مؤكدة",           icon: "✅", color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-600/40",    dot: "bg-blue-400" },
  { value: "picked_up",        label: "تم الاستلام",     icon: "📦", color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-600/40",    dot: "bg-cyan-400" },
  { value: "in_transit",       label: "في الطريق",       icon: "🚚", color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-600/40",  dot: "bg-violet-400" },
  { value: "out_for_delivery", label: "خارج للتسليم",   icon: "📍", color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-600/40",   dot: "bg-amber-400" },
  { value: "delivered",        label: "تم التسليم ✓",   icon: "🎉", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-600/40", dot: "bg-emerald-400" },
  { value: "delayed",          label: "مؤجلة",           icon: "⚠️", color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-600/40",  dot: "bg-orange-400" },
  { value: "returned",         label: "مرتجعة",          icon: "↩️", color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-600/40",     dot: "bg-red-400" },
  { value: "cancelled",        label: "ملغية",           icon: "❌", color: "text-gray-400",    bg: "bg-gray-500/10",    border: "border-gray-600/40",    dot: "bg-gray-400" },
] as const;

const PAYMENT_LABELS: Record<string, string> = {
  cod: "الدفع عند الاستلام", prepaid: "مدفوع مسبقاً", deferred: "الدفع لاحقاً",
};
const PARCEL_LABELS: Record<string, string> = {
  document: "مستندات", normal: "عادي", fragile: "هش",
  heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس", food: "طعام", other: "أخرى",
};
const STATUS_STEPS: ShipmentStatus[] = ["waiting","confirmed","picked_up","in_transit","out_for_delivery","delivered"];

// ── StatusSelect (same as order-detail) ───────────────────────────────────────
function StatusSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const current = STATUS_OPTIONS.find(o => o.value === value) ?? STATUS_OPTIONS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
          dropRef.current  && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: Math.max(rect.width, 220) });
    }
    setOpen(p => !p);
  };

  return (
    <div className="relative select-none" style={{ minWidth: 190 }}>
      <button ref={triggerRef} type="button" disabled={disabled} onClick={handleOpen}
        className={`w-full flex items-center gap-2 px-3 h-9 rounded-lg border text-sm font-semibold transition-all duration-150 cursor-pointer ${current.bg} ${current.border} ${current.color} hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm`}>
        <span className="text-base leading-none">{current.icon}</span>
        <span className="flex-1 text-right">{current.label}</span>
        <svg className={`w-4 h-4 opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden">
          <div className="p-1.5 flex flex-col gap-0.5">
            {STATUS_OPTIONS.map(opt => {
              const isActive = opt.value === value;
              return (
                <button key={opt.value} type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-100 text-right cursor-pointer ${isActive ? `${opt.bg} ${opt.color} ${opt.border} border` : "hover:bg-muted text-foreground border border-transparent"}`}>
                  <span className="text-base leading-none w-5 text-center">{opt.icon}</span>
                  <span className="flex-1">{opt.label}</span>
                  {isActive && <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── InfoRow helper ─────────────────────────────────────────────────────────────
function InfoRow({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-left break-all ${bold ? "font-bold text-foreground" : "text-foreground"} ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ShipmentDetailPage() {
  const [, params] = useRoute("/shipments/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectStatus, setSelectStatus] = useState<string | null>(null);
  const [newTracking, setNewTracking] = useState("");
  const [showTrackingEdit, setShowTrackingEdit] = useState(false);

  // ── edit mode ──────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Shipment & { trackingNumber: string }>>({});
  const { data: parcelPricing = [] } = useQuery<{ id: number; parcelType: string; label: string; basePrice: string }[]>({
    queryKey: ["parcel-type-pricing"],
    queryFn: () => shipApiFetch("/parcel-type-pricing"),
  });

  const startEdit = () => {
    if (!shipment) return;
    setEditForm({
      senderName: shipment.senderName, senderPhone: shipment.senderPhone ?? "",
      senderPhone2: shipment.senderPhone2 ?? "", senderCity: shipment.senderCity ?? "",
      senderAddress: shipment.senderAddress ?? "", senderEmail: shipment.senderEmail ?? "",
      receiverName: shipment.receiverName, receiverPhone: shipment.receiverPhone ?? "",
      receiverPhone2: shipment.receiverPhone2 ?? "", receiverCity: shipment.receiverCity ?? "",
      receiverAddress: shipment.receiverAddress ?? "",
      zoneId: shipment.zoneId,
      parcelType: shipment.parcelType ?? "",
      weight: shipment.weight ?? "", pieces: shipment.pieces ?? 1,
      description: shipment.description ?? "", declaredValue: shipment.declaredValue ?? 0,
      paymentMethod: shipment.paymentMethod, codAmount: shipment.codAmount ?? 0,
      shippingFee: shipment.shippingFee ?? 0, insuranceFee: shipment.insuranceFee ?? 0,
      notes: shipment.notes ?? "", internalNotes: shipment.internalNotes ?? "",
      trackingNumber: shipment.trackingNumber ?? "",
    });
    setEditMode(true);
  };

  const cancelEdit = () => { setEditMode(false); setEditForm({}); };

  const ef = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEditForm(p => ({ ...p, [k]: e.target.value }));

  const handleSaveEdit = () => {
    const payload: any = { ...editForm };
    if (payload.zoneId) {
      const z = zones.find(z => z.id === Number(payload.zoneId));
      payload.zoneId = Number(payload.zoneId);
      payload.zonePrice = z ? Number((z as any).price ?? 0) : Number(shipment?.zonePrice ?? 0);
    }
    if (payload.parcelType) {
      const p = parcelPricing.find(p => p.parcelType === payload.parcelType);
      payload.parcelTypePrice = p ? Number(p.basePrice) : Number(shipment?.parcelTypePrice ?? 0);
    }
    payload.shippingFee = Number(payload.zonePrice ?? shipment?.zonePrice ?? 0)
      + Number(payload.parcelTypePrice ?? shipment?.parcelTypePrice ?? 0)
      + Number(payload.insuranceFee ?? 0);
    payload.pieces = Number(payload.pieces ?? 1);
    updateMutation.mutate(payload, {
      onSuccess: () => { setEditMode(false); setEditForm({}); },
    });
  };

  const { data: shipment, isLoading, error } = useQuery<Shipment>({
    queryKey: ["shipment-detail", id],
    queryFn: () => shipApiFetch<Shipment>(`/shipments/${id}`),
    enabled: !!id,
  });
  const { data: zones = [] } = useQuery<{ id: number; name: string; governorate?: string }[]>({
    queryKey: ["shipment-zones"],
    queryFn: () => shipApiFetch("/shipment-zones"),
  });
  const zone = zones.find(z => z.id === shipment?.zoneId);

  useEffect(() => {
    if (shipment) {
      setSelectStatus(shipment.status);
      setNewTracking(shipment.trackingNumber ?? "");
    }
  }, [shipment]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => shipApiFetch(`/shipments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-detail", id] });
      qc.invalidateQueries({ queryKey: ["shipments-orders"] });
      toast({ title: "تم الحفظ ✅" });
      setShowTrackingEdit(false);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const handleStatusChange = (newStatus: string) => {
    setSelectStatus(newStatus);
    updateMutation.mutate({ status: newStatus });
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await shipApiFetch(`/shipments/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["shipments-orders"] });
      toast({ title: "تم حذف الشحنة" });
      navigate("/orders");
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handlePrint = () => {
    if (!shipment) return;
    const statusLabel = STATUS_OPTIONS.find(o => o.value === shipment.status)?.label ?? shipment.status;
    const paymentLabel = PAYMENT_LABELS[shipment.paymentMethod] ?? shipment.paymentMethod;
    const parcelLabel = shipment.parcelType ? (PARCEL_LABELS[shipment.parcelType] ?? shipment.parcelType) : "—";
    const zoneLabel = zone ? `${zone.name}${zone.governorate ? ` — ${zone.governorate}` : ""}` : (shipment.receiverCity ?? "—");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"/><title>شحنة ${shipment.shipmentNumber ?? id}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:"Cairo",sans-serif; }
  body { background:#fff; color:#111; padding:24px; font-size:13px; direction:rtl; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; padding-bottom:16px; border-bottom:2px solid #e5e7eb; }
  .title { font-size:22px; font-weight:900; } .sub { color:#6b7280; font-size:12px; margin-top:4px; }
  .status-badge { display:inline-block; padding:4px 12px; border-radius:20px; font-weight:700; font-size:12px; background:#f3f4f6; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
  .card { border:1px solid #e5e7eb; border-radius:10px; padding:14px; }
  .card-title { font-weight:800; font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px; }
  .row { display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #f3f4f6; font-size:12px; }
  .row:last-child { border:none; } .row .label { color:#6b7280; } .row .val { font-weight:600; }
  .financial { border:2px solid #e5e7eb; border-radius:10px; padding:14px; margin-bottom:16px; }
  .total { font-size:18px; font-weight:900; color:#7c3aed; }
  @media print { body { padding:0; } }
</style></head><body>
<div class="header">
  <div>
    <div class="title">شحنة #${shipment.shipmentNumber ?? id}</div>
    <div class="sub">${fdate(shipment.createdAt)}${shipment.createdByName ? ` · ${shipment.createdByName}` : ""}</div>
    ${shipment.trackingNumber ? `<div class="sub" style="margin-top:4px;font-weight:700">رقم التتبع: ${shipment.trackingNumber}</div>` : ""}
  </div>
  <span class="status-badge">${statusLabel}</span>
</div>
<div class="grid">
  <div class="card">
    <div class="card-title">المُرسِل</div>
    <div class="row"><span class="label">الاسم</span><span class="val">${shipment.senderName}</span></div>
    ${shipment.senderPhone ? `<div class="row"><span class="label">الهاتف</span><span class="val">${shipment.senderPhone}</span></div>` : ""}
    ${shipment.senderCity ? `<div class="row"><span class="label">المدينة</span><span class="val">${shipment.senderCity}</span></div>` : ""}
    ${shipment.senderAddress ? `<div class="row"><span class="label">العنوان</span><span class="val">${shipment.senderAddress}</span></div>` : ""}
  </div>
  <div class="card">
    <div class="card-title">المُستلِم</div>
    <div class="row"><span class="label">الاسم</span><span class="val">${shipment.receiverName}</span></div>
    ${shipment.receiverPhone ? `<div class="row"><span class="label">الهاتف</span><span class="val">${shipment.receiverPhone}</span></div>` : ""}
    <div class="row"><span class="label">المنطقة</span><span class="val">${zoneLabel}</span></div>
    ${shipment.receiverAddress ? `<div class="row"><span class="label">العنوان</span><span class="val">${shipment.receiverAddress}</span></div>` : ""}
  </div>
</div>
<div class="card" style="margin-bottom:16px">
  <div class="card-title">تفاصيل الطرد</div>
  <div class="row"><span class="label">نوع الطرد</span><span class="val">${parcelLabel}</span></div>
  ${shipment.weight ? `<div class="row"><span class="label">الوزن</span><span class="val">${shipment.weight} كجم</span></div>` : ""}
  <div class="row"><span class="label">طريقة الدفع</span><span class="val">${paymentLabel}</span></div>
  ${shipment.description ? `<div class="row"><span class="label">الوصف</span><span class="val">${shipment.description}</span></div>` : ""}
</div>
<div class="financial">
  <div class="card-title">الملخص المالي</div>
  ${Number(shipment.zonePrice) > 0 ? `<div class="row"><span class="label">سعر المنطقة</span><span class="val">${fc(shipment.zonePrice)}</span></div>` : ""}
  ${Number(shipment.parcelTypePrice) > 0 ? `<div class="row"><span class="label">سعر النوع</span><span class="val">+${fc(shipment.parcelTypePrice)}</span></div>` : ""}
  <div class="row" style="margin-top:8px"><span class="label" style="font-weight:700">رسوم الشحن</span><span class="total">${fc(shipment.shippingFee)}</span></div>
  ${Number(shipment.codAmount) > 0 ? `<div class="row"><span class="label">مبلغ COD</span><span class="val" style="color:#d97706;font-weight:700">${fc(shipment.codAmount)}</span></div>` : ""}
</div>
${shipment.notes ? `<div class="card"><div class="card-title">ملاحظات</div><p style="font-size:13px;line-height:1.6">${shipment.notes}</p></div>` : ""}
<script>window.onload=()=>{window.print();window.close();}<\/script>
</body></html>`);
    w.document.close();
  };

  // ── guards ────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Truck className="w-10 h-10 animate-pulse text-primary" />
        <p className="text-sm">جاري تحميل الشحنة...</p>
      </div>
    </div>
  );
  if (error || !shipment) return (
    <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
      <div className="text-center space-y-3">
        <XCircle className="w-12 h-12 text-red-500 mx-auto" />
        <p className="font-bold">الشحنة غير موجودة</p>
        <Link href="/orders" className="text-sm text-primary underline">← العودة للشحنات</Link>
      </div>
    </div>
  );

  const currentStepIdx = STATUS_STEPS.indexOf(shipment.status);
  const isTerminal = shipment.status === "returned" || shipment.status === "cancelled";
  const currentStatusOpt = STATUS_OPTIONS.find(o => o.value === (selectStatus ?? shipment.status)) ?? STATUS_OPTIONS[0];

  return (
    <div className="space-y-4 animate-in fade-in duration-500 max-w-5xl mx-auto" dir="rtl">

      {/* ══ HEADER CARD — نفس شكل order-detail ══════════════════════════════ */}
      <div className="rounded-xl overflow-hidden border border-border shadow-sm">

        {/* صف العنوان */}
        <div className="bg-card px-4 py-3 flex items-center justify-between gap-3 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/orders">
              <button className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors border border-border bg-card">
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold truncate flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-primary" />
                  شحنة {shipment.shipmentNumber ?? `#${id}`}
                </h1>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${currentStatusOpt.bg} ${currentStatusOpt.border} ${currentStatusOpt.color}`}>
                  <span className="text-xs">{currentStatusOpt.icon}</span>
                  {currentStatusOpt.label}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {fdate(shipment.createdAt)}
                {shipment.createdByName && <span> · {shipment.createdByName}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* صف الأزرار — نفس ترتيب order-detail بالظبط */}
        <div className="bg-muted/30 px-3 py-2 flex items-center gap-1.5 flex-wrap">

          {/* فاتورة / طباعة */}
          <button onClick={handlePrint}
            className="h-8 px-3 text-xs gap-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors flex items-center font-medium">
            <Printer className="w-3.5 h-3.5" />فاتورة
          </button>

          {/* حذف — للأدمن */}
          {isAdmin && (
            <button onClick={() => setShowDeleteDialog(true)}
              className="h-8 px-3 text-xs gap-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/20 bg-card transition-colors flex items-center font-medium">
              <Trash2 className="w-3.5 h-3.5" />حذف
            </button>
          )}

          {/* تعديل — للأدمن */}
          {isAdmin && !editMode && (
            <button onClick={startEdit}
              className="h-8 px-3 text-xs gap-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors flex items-center font-medium">
              <Pencil className="w-3.5 h-3.5" />تعديل
            </button>
          )}
          {isAdmin && editMode && (
            <>
              <button onClick={handleSaveEdit} disabled={updateMutation.isPending}
                className="h-8 px-3 text-xs gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 transition-colors flex items-center font-bold">
                <Save className="w-3.5 h-3.5" />{updateMutation.isPending ? "جاري..." : "حفظ"}
              </button>
              <button onClick={cancelEdit}
                className="h-8 px-3 text-xs gap-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors flex items-center font-medium text-muted-foreground">
                إلغاء
              </button>
            </>
          )}

          {/* تغيير الحالة — للأدمن */}
          {isAdmin && (
            <div className="mr-auto">
              <StatusSelect
                value={selectStatus ?? shipment.status}
                onChange={handleStatusChange}
                disabled={updateMutation.isPending}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── tracking edit panel ── */}
      {showTrackingEdit && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-bold mb-1 block">رقم التتبع</label>
            <input className="w-full h-9 text-sm px-3 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              value={newTracking} onChange={e => setNewTracking(e.target.value)} placeholder="رقم التتبع..." />
          </div>
          <button onClick={() => updateMutation.mutate({ trackingNumber: newTracking || null })}
            disabled={updateMutation.isPending}
            className="h-9 px-4 text-xs rounded-lg bg-primary text-primary-foreground font-bold flex items-center gap-1.5 shrink-0">
            <Save className="w-3 h-3" />{updateMutation.isPending ? "جاري..." : "حفظ"}
          </button>
          <button onClick={() => setShowTrackingEdit(false)}
            className="h-9 px-3 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted shrink-0">
            إلغاء
          </button>
        </div>
      )}

      {/* ── tracking number highlight ── */}
      {shipment.trackingNumber && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/5">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground">رقم التتبع:</span>
          <span className="font-black text-sm text-primary font-mono">{shipment.trackingNumber}</span>
        </div>
      )}

      {/* ── Progress timeline ── */}
      {!isTerminal && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-bold text-muted-foreground mb-4 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />مسار الشحنة
            </p>
            <div className="flex items-start gap-0">
              {STATUS_STEPS.map((s, i) => {
                const done = currentStepIdx > i;
                const active = currentStepIdx === i;
                const opt = STATUS_OPTIONS.find(o => o.value === s)!;
                return (
                  <div key={s} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                        done   ? "bg-emerald-500 text-white" :
                        active ? `${opt.bg} ${opt.color} ring-2 ring-offset-2 ring-offset-background ring-current` :
                                 "bg-muted text-muted-foreground"
                      }`}>{opt.icon}</div>
                      <span className={`text-[9px] font-bold text-center leading-tight ${active ? opt.color : done ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {opt.label}
                      </span>
                    </div>
                    {i < STATUS_STEPS.length - 1 && (
                      <div className={`h-0.5 flex-1 mx-1 rounded-full ${done ? "bg-emerald-500" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {isTerminal && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border font-bold text-sm ${
          shipment.status === "returned"
            ? "border-red-800 bg-red-900/10 text-red-400"
            : "border-gray-700 bg-gray-800/20 text-gray-400"
        }`}>
          {shipment.status === "returned" ? <RotateCcw className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {currentStatusOpt.label}
        </div>
      )}

      {/* ══ MAIN GRID ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── left 2/3: sender + receiver + parcel + notes ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* المُرسِل */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                </div>
                بيانات المُرسِل
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-0.5">
              {editMode ? (
                <div className="space-y-2">
                  {([["senderName","الاسم *"],["senderPhone","الهاتف"],["senderPhone2","هاتف 2"],["senderCity","المدينة"],["senderAddress","العنوان"],["senderEmail","البريد الإلكتروني"]] as [string,string][]).map(([k,lbl]) => (
                    <div key={k}>
                      <label className="text-[10px] text-muted-foreground">{lbl}</label>
                      <input className="w-full h-8 text-xs px-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                        value={(editForm as any)[k] ?? ""} onChange={ef(k)} />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <InfoRow label="الاسم" value={shipment.senderName} bold />
                  {shipment.senderPhone    && <InfoRow label="الهاتف"   value={shipment.senderPhone} mono />}
                  {shipment.senderPhone2   && <InfoRow label="هاتف 2"   value={shipment.senderPhone2} mono />}
                  {shipment.senderCity     && <InfoRow label="المدينة"  value={shipment.senderCity} />}
                  {shipment.senderAddress  && <InfoRow label="العنوان"  value={shipment.senderAddress} />}
                  {shipment.senderEmail    && <InfoRow label="البريد"   value={shipment.senderEmail} />}
                </>
              )}
            </CardContent>
          </Card>

          {/* المُستلِم */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                بيانات المُستلِم
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-0.5">
              {editMode ? (
                <div className="space-y-2">
                  {([["receiverName","الاسم *"],["receiverPhone","الهاتف"],["receiverPhone2","هاتف 2"],["receiverCity","المدينة"],["receiverAddress","العنوان"]] as [string,string][]).map(([k,lbl]) => (
                    <div key={k}>
                      <label className="text-[10px] text-muted-foreground">{lbl}</label>
                      <input className="w-full h-8 text-xs px-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                        value={(editForm as any)[k] ?? ""} onChange={ef(k)} />
                    </div>
                  ))}
                  <div>
                    <label className="text-[10px] text-muted-foreground">المنطقة</label>
                    <select className="w-full h-8 text-xs px-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                      value={editForm.zoneId ?? ""} onChange={ef("zoneId")}>
                      <option value="">— بدون منطقة —</option>
                      {zones.map(z => <option key={z.id} value={z.id}>{z.name}{(z as any).governorate ? ` — ${(z as any).governorate}` : ""}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="الاسم" value={shipment.receiverName} bold />
                  {shipment.receiverPhone  && <InfoRow label="الهاتف"        value={shipment.receiverPhone} mono />}
                  {shipment.receiverPhone2 && <InfoRow label="هاتف 2"        value={shipment.receiverPhone2} mono />}
                  <InfoRow label="المنطقة" value={zone ? `${zone.name}${zone.governorate ? ` — ${zone.governorate}` : ""}` : (shipment.receiverCity ?? "—")} />
                  {shipment.receiverAddress && <InfoRow label="العنوان" value={shipment.receiverAddress} />}
                </>
              )}
            </CardContent>
          </Card>

          {/* تفاصيل الطرد */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                  <Package className="w-3.5 h-3.5 text-violet-500" />
                </div>
                تفاصيل الطرد
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-0.5">
              {editMode ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">نوع الطرد</label>
                    <select className="w-full h-8 text-xs px-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                      value={editForm.parcelType ?? ""} onChange={ef("parcelType")}>
                      <option value="">— اختر نوع —</option>
                      {parcelPricing.length > 0
                        ? parcelPricing.map(p => <option key={p.parcelType} value={p.parcelType}>{p.label}</option>)
                        : Object.entries(PARCEL_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)
                      }
                    </select>
                  </div>
                  {([["weight","الوزن (كجم)","number"],["pieces","عدد القطع","number"],["description","الوصف","text"],["declaredValue","القيمة المعلنة","number"]] as [string,string,string][]).map(([k,lbl,type]) => (
                    <div key={k}>
                      <label className="text-[10px] text-muted-foreground">{lbl}</label>
                      <input type={type} className="w-full h-8 text-xs px-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                        value={(editForm as any)[k] ?? ""} onChange={ef(k)} />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {shipment.parcelType && <InfoRow label="نوع الطرد" value={PARCEL_LABELS[shipment.parcelType] ?? shipment.parcelType} />}
                  {shipment.weight     && <InfoRow label="الوزن"     value={`${shipment.weight} كجم`} />}
                  {(shipment.pieces ?? 1) > 1 && <InfoRow label="القطع" value={String(shipment.pieces)} />}
                  {shipment.description && <InfoRow label="الوصف"    value={shipment.description} />}
                  {Number(shipment.declaredValue) > 0 && <InfoRow label="القيمة المعلنة" value={fc(shipment.declaredValue)} />}
                </>
              )}
            </CardContent>
          </Card>

          {/* الملاحظات */}
          {(editMode || shipment.notes || shipment.internalNotes) && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-black flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  الملاحظات
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {editMode ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">ملاحظات</label>
                      <textarea rows={2} className="w-full text-xs px-2.5 py-1.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary mt-0.5 resize-none"
                        value={editForm.notes ?? ""} onChange={ef("notes")} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">ملاحظات داخلية</label>
                      <textarea rows={2} className="w-full text-xs px-2.5 py-1.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary mt-0.5 resize-none"
                        value={editForm.internalNotes ?? ""} onChange={ef("internalNotes")} />
                    </div>
                  </div>
                ) : (
                  <>
                    {shipment.notes && <p className="text-sm text-foreground leading-relaxed">{shipment.notes}</p>}
                    {shipment.internalNotes && (
                      <div className="pt-2 border-t border-dashed border-border">
                        <p className="text-[10px] font-bold text-muted-foreground mb-1">ملاحظات داخلية</p>
                        <p className="text-sm text-foreground leading-relaxed">{shipment.internalNotes}</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── right 1/3: financial + info ── */}
        <div className="space-y-4">

          {/* الملخص المالي */}
          <Card className="border-primary/30">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <DollarSign className="w-3.5 h-3.5 text-primary" />
                </div>
                الملخص المالي
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {editMode ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">طريقة الدفع</label>
                    <select className="w-full h-8 text-xs px-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                      value={editForm.paymentMethod ?? "cod"} onChange={ef("paymentMethod")}>
                      <option value="cod">الدفع عند الاستلام</option>
                      <option value="prepaid">مدفوع مسبقاً</option>
                      <option value="deferred">الدفع لاحقاً</option>
                    </select>
                  </div>
                  {([["codAmount","مبلغ COD"],["insuranceFee","رسوم التأمين"],["trackingNumber","رقم التتبع"]] as [string,string][]).map(([k,lbl]) => (
                    <div key={k}>
                      <label className="text-[10px] text-muted-foreground">{lbl}</label>
                      <input className="w-full h-8 text-xs px-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                        value={(editForm as any)[k] ?? ""} onChange={ef(k)} />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                    shipment.paymentMethod === "cod"      ? "bg-amber-500/10 border-amber-600/40 text-amber-400" :
                    shipment.paymentMethod === "prepaid"  ? "bg-emerald-500/10 border-emerald-600/40 text-emerald-400" :
                                                            "bg-blue-500/10 border-blue-600/40 text-blue-400"
                  }`}>{PAYMENT_LABELS[shipment.paymentMethod] ?? shipment.paymentMethod}</span>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    {Number(shipment.zonePrice) > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">سعر المنطقة</span><span className="font-semibold">{fc(shipment.zonePrice)}</span></div>
                    )}
                    {Number(shipment.parcelTypePrice) > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">سعر نوع الطرد</span><span className="font-semibold">+{fc(shipment.parcelTypePrice)}</span></div>
                    )}
                    {Number(shipment.insuranceFee) > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">رسوم التأمين</span><span className="font-semibold">{fc(shipment.insuranceFee)}</span></div>
                    )}
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-bold">رسوم الشحن</span>
                      <span className="font-black text-xl text-primary">{fc(shipment.shippingFee)}</span>
                    </div>
                    {Number(shipment.codAmount) > 0 && (
                      <div className="flex justify-between mt-1">
                        <span className="text-muted-foreground">مبلغ COD</span>
                        <span className="font-black text-lg text-amber-500">{fc(shipment.codAmount)}</span>
                      </div>
                    )}
                    {Number(shipment.collectedAmount) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">تم تحصيله</span>
                        <span className="font-bold text-emerald-500">{fc(shipment.collectedAmount)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* معلومات الشحنة */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                </div>
                معلومات الشحنة
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-0.5">
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

      {/* ── Delete dialog ── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الشحنة</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف الشحنة {shipment.shipmentNumber}؟ لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white">
              {isDeleting ? "جاري الحذف..." : "نعم، احذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
