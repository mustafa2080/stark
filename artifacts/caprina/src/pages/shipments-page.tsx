import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import ExcelJS from "exceljs";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Search, Filter, Plus, Package, CalendarDays, X, RotateCcw, MessageCircle, Trash2, CheckSquare, RefreshCw, ChevronUp, ChevronDown, Download, FileText, User, MapPin, Boxes, CreditCard, Clock, PackageCheck, Truck, CheckCircle2, ShieldAlert, AlertTriangle, Warehouse, Megaphone, UserCheck } from "lucide-react";
import { useUpdateOrder } from "@workspace/api-client-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { returnReasonLabel } from "@/lib/order-constants";
import { type WhatsAppOrderData, type WaSettings, applyTemplate, applyShippingTemplate, buildWhatsAppLink } from "@/lib/whatsapp";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ordersApi, shippingApi, apiFetch } from "@/lib/api";

const AD_SOURCES = [
  { value: "facebook",  label: "فيسبوك" },
  { value: "tiktok",   label: "تيك توك" },
  { value: "instagram", label: "إنستجرام" },
  { value: "whatsapp", label: "واتساب" },
  { value: "organic",  label: "ويبسايت" },
  { value: "other",    label: "أخرى" },
];

const AdSourceIcon = ({ value, className = "w-4 h-4 shrink-0" }: { value: string; className?: string }) => {
  if (value === "facebook")  return <svg className={className} viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>;
  if (value === "tiktok")    return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>;
  if (value === "instagram") return <svg className={className} viewBox="0 0 24 24" fill="url(#igGS2)"><defs><linearGradient id="igGS2" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="50%" stopColor="#dc2743"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
  if (value === "whatsapp")  return <svg className={className} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
  if (value === "organic")   return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>;
};

// حالات الشحنة — تتطابق مع DB schema (SHIPMENT_STATUSES)
type ShipmentStatusValue = "pending" | "warehouse_ready" | "in_shipping" | "received" | "partial_received" | "delayed" | "returned";

const statusLabels: Record<string, string> = {
  pending:          "قيد الانتظار",
  warehouse_ready:  "قيد الشحن في المخزن",
  in_shipping:      "قيد الشحن",
  received:         "استلم",
  partial_received: "استلام جزئي",
  delayed:          "مؤجل",
  returned:         "مرتجع",
  // fallback للقيم القديمة في الـ DB
  out_for_delivery: "قيد الشحن",
  in_transit:       "قيد الشحن",
  delivered:        "استلم",
  waiting:          "قيد الانتظار",
  confirmed:        "قيد الانتظار",
  picked_up:        "قيد الشحن في المخزن",
  cancelled:        "مرتجع",
};

const statusClasses: Record<string, string> = {
  pending:          "bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",
  warehouse_ready:  "bg-transparent text-teal-400 border-teal-400",
  in_shipping:      "bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",
  received:         "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700",
  partial_received: "bg-cyan-100   dark:bg-cyan-900/40    text-cyan-800    dark:text-cyan-300    border-cyan-400    dark:border-cyan-700",
  delayed:          "bg-transparent text-violet-400 border-violet-400",
  returned:         "bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",
  // fallback للقيم القديمة في الـ DB
  out_for_delivery: "bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",
  in_transit:       "bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",
  delivered:        "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700",
  waiting:          "bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",
  confirmed:        "bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",
  picked_up:        "bg-transparent text-teal-400 border-teal-400",
  cancelled:        "bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending:          Clock,
  warehouse_ready:  PackageCheck,
  in_shipping:      Truck,
  received:         CheckCircle2,
  partial_received: AlertTriangle,
  delayed:          ShieldAlert,
  returned:         RotateCcw,
  // fallback للقيم القديمة في الـ DB
  out_for_delivery: Truck,
  in_transit:       Truck,
  delivered:        CheckCircle2,
  waiting:          Clock,
  confirmed:        Clock,
  picked_up:        PackageCheck,
  cancelled:        RotateCcw,
};

const STATUS_OPTIONS = [
  { value: "pending",          label: "قيد الانتظار",        color: "text-amber-500"   },
  { value: "warehouse_ready",  label: "قيد الشحن في المخزن", color: "text-orange-500"  },
  { value: "in_shipping",      label: "قيد الشحن",           color: "text-blue-500"    },
  { value: "received",         label: "استلم",               color: "text-emerald-500" },
  { value: "partial_received", label: "استلام جزئي",         color: "text-cyan-500"    },
  { value: "delayed",          label: "مؤجل",                color: "text-purple-500"  },
  { value: "returned",         label: "مرتجع",               color: "text-red-500"     },
];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(amount);

// ── Types للشحنات ────────────────────────────────────────────────────────────
type PaymentMethod = "cod" | "prepaid" | "deferred";
type ParcelType    = "document" | "normal" | "fragile" | "heavy" | "electronics" | "clothing" | "food" | "other";
interface ShipmentZone      { id: number; name: string; fromGovernorate?: string; toGovernorate?: string; price: string | number; isActive?: boolean }
interface ParcelTypePricing { id: number; parcelType: ParcelType; label?: string; basePrice: string | number; isActive?: boolean }
interface ShipmentClient    { id: number; name: string; phone?: string; phone2?: string; email?: string; address?: string; city?: string; region?: string; warehouseId?: number | null; avatar?: string | null }

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
  food: "طعام", other: "أخرى",
};
const fc = (n: number | string) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);

// ── Avatar helpers (نفس منطق صفحة العملاء التجاريون) ─────────────────────────
const AVATAR_COLORS = [
  ["#f59e0b","#78350f"],["#10b981","#064e3b"],["#3b82f6","#1e3a8a"],
  ["#8b5cf6","#4c1d95"],["#ef4444","#7f1d1d"],["#ec4899","#831843"],
  ["#06b6d4","#164e63"],["#f97316","#7c2d12"],
];
function getAvatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function ClientAvatar({ avatar, name, className = "w-6 h-6 text-[10px]" }: { avatar?: string | null; name: string; className?: string }) {
  if (avatar && avatar.startsWith("data:")) {
    return <img src={avatar} className={`${className} rounded-full object-cover border border-border/50 shrink-0`} />;
  }
  const [bg, fg] = getAvatarColor(name || "؟");
  return (
    <div className={`${className} rounded-full flex items-center justify-center font-bold shrink-0 border border-primary/20`}
      style={{ background: bg, color: fg }}>
      {(name || "؟").charAt(0)}
    </div>
  );
}

// ── ShipmentFormDialog ───────────────────────────────────────────────────────
function ShipmentFormDialog({
  open, onClose, zones, parcelPricing, clients,
}: {
  open: boolean;
  onClose: () => void;
  zones: ShipmentZone[];
  parcelPricing: ParcelTypePricing[];
  clients: ShipmentClient[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  // محافظات "إلى" — unique بدون تكرار
  const toGovernorates = useMemo(() => {
    const seen = new Set<string>();
    return zones.filter(z => z.isActive !== false).reduce<{ label: string; zone: ShipmentZone }[]>((acc, z) => {
      const label = z.toGovernorate?.trim() || z.name?.trim();
      if (!label) return acc;
      const key = label.replace(/\s+/g, " ").toLowerCase();
      if (!seen.has(key)) { seen.add(key); acc.push({ label, zone: z }); }
      return acc;
    }, []);
  }, [zones]);

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
    shippingCompanyId: "",
    warehouseId: "",
    adSource: "", adCampaign: "", assignedUserId: "",
  });
  const [clientSearch, setClientSearch] = useState("");
  const [showClientList, setShowClientList] = useState(false);

  const { data: warehouses = [] } = useQuery<any[]>({ queryKey: ["warehouses"], queryFn: () => apiFetch("/warehouses") });
  const { data: users = [] }      = useQuery<any[]>({ queryKey: ["users"],      queryFn: () => apiFetch("/users"), enabled: isAdmin });

  const selectedZone    = zones.find(z => String(z.id) === form.zoneId);
  const selectedPricing = parcelPricing.find(p => p.parcelType === form.parcelType);
  const zonePrice       = Number(selectedZone?.price) || 0;
  const parcelPrice     = Number(selectedPricing?.basePrice) || 0;
  const shippingFee     = zonePrice + parcelPrice;
  const cod             = Number(form.codAmount) || 0;
  const total           = (form.paymentMethod === "cod" ? cod : 0) + shippingFee;

  const filteredClients = useMemo(() =>
    clients.filter(c => c.name.includes(clientSearch) || (c.phone || "").includes(clientSearch)),
    [clients, clientSearch]
  );

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  // لما يتم اختيار "الموظف المسؤول"، يتم تعبئة "مصدر الطلب" تلقائياً حسب المصدر الافتراضي المرتبط بالموظف
  const handleAssignedUserChange = (userId: string) => {
    setForm(f => {
      const next = { ...f, assignedUserId: userId };
      const selectedUser = (users as any[])?.find((u: any) => String(u.id) === userId);
      if (selectedUser?.defaultAdSource) {
        next.adSource = selectedUser.defaultAdSource;
      }
      return next;
    });
  };

  function selectClient(c: ShipmentClient) {
    setForm(f => ({
      ...f,
      clientId: String(c.id),
      senderName: c.name,
      senderPhone: c.phone || "",
      senderPhone2: c.phone2 || "",
      senderCity: c.region || c.city || "",
      warehouseId: c.warehouseId ? String(c.warehouseId) : f.warehouseId,
    }));
    setClientSearch(c.name);
    setShowClientList(false);
  }

  const mutation = useMutation({
    mutationFn: (data: any) => apiFetch("/shipments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments-list"] });
      qc.invalidateQueries({ queryKey: ["shipments-stats"] });
      toast({ title: "تم إنشاء الشحنة بنجاح ✅" });
      onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.senderName || !form.receiverName) {
      toast({ title: "الحقول المطلوبة", description: "اسم الراسل واسم المستلم مطلوبان", variant: "destructive" });
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
      paymentMethod:   form.paymentMethod,
      codAmount:       cod || undefined,
      shippingFee:     shippingFee || undefined,
      totalAmount:     total || undefined,
      notes:           form.notes || undefined,
      shippingCompanyId: form.shippingCompanyId ? Number(form.shippingCompanyId) : undefined,
      warehouseId:       form.warehouseId       ? Number(form.warehouseId)       : undefined,
      adSource:          form.adSource          || undefined,
      adCampaign:        form.adCampaign        || undefined,
      assignedUserId:    form.assignedUserId     ? Number(form.assignedUserId)     : undefined,
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

            {/* Dropdown اختيار العميل التجاري */}
            <div>
              <Label className="text-xs font-bold mb-1.5 block">العميل التجاري (اختياري)</Label>
              <Select
                value={form.clientId || "__none__"}
                onValueChange={v => {
                  if (v === "__none__") {
                    setForm(f => ({ ...f, clientId: "", senderName: "", senderPhone: "", senderPhone2: "", senderCity: "" }));
                    return;
                  }
                  const c = clients.find(x => String(x.id) === v);
                  if (c) {
                    setForm(f => ({
                      ...f,
                      clientId: String(c.id),
                      senderName: c.name,
                      senderPhone: c.phone || "",
                      senderPhone2: c.phone2 || "",
                      senderCity: c.region || c.city || "",
                      warehouseId: c.warehouseId ? String(c.warehouseId) : f.warehouseId,
                    }));
                  }
                }}
              >
                <SelectTrigger className="text-sm h-10">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="اختر العميل من القائمة..." />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground text-xs">— بدون عميل —</span>
                  </SelectItem>
                  {clients.filter(c => c.name).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <div className="flex items-center gap-2">
                        <ClientAvatar avatar={c.avatar} name={c.name} className="w-6 h-6 text-[10px]" />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold">{c.name}</span>
                          {c.phone && <span className="text-[10px] text-muted-foreground">{c.phone}</span>}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.clientId && (
                <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                  تم تعبئة بيانات المرسل تلقائياً
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold mb-1.5 block">اسم الراسل <span className="text-red-500">*</span></Label>
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
                <Label className="text-xs font-bold mb-1.5 block">المحافظة</Label>
                <Input className="text-sm" placeholder="محافظة المرسل" value={form.senderCity} onChange={e => set("senderCity", e.target.value)} />
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
                <Select
                  value={selectedZone ? (selectedZone.toGovernorate?.trim() || selectedZone.name?.trim() || "") : ""}
                  onValueChange={v => {
                    // جيب أول zone بنفس المحافظة
                    const firstZone = zones.filter(z => z.isActive !== false).find(z =>
                      (z.toGovernorate?.trim() || z.name?.trim() || "").replace(/\s+/g, " ").toLowerCase() ===
                      v.replace(/\s+/g, " ").toLowerCase()
                    );
                    if (firstZone) {
                      set("zoneId", String(firstZone.id));
                      if (firstZone.toGovernorate) set("receiverCity", firstZone.toGovernorate);
                    }
                  }}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="اختر المحافظة..." /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false} className="max-h-[220px] overflow-y-auto w-[var(--radix-select-trigger-width)]">
                    {toGovernorates.map(({ label, zone }) => (
                      <SelectItem key={zone.id} value={label}>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{label}</span>
                          <span className="text-xs text-muted-foreground font-bold">{fc(zone.price)}</span>
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
                    {parcelPricing.filter(p => p.isActive !== false).map(p => (
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
                  <Label className="text-xs font-bold mb-1.5 block">سعر الشحنة</Label>
                  <Input type="number" className="text-sm" placeholder="0" value={form.codAmount} onChange={e => set("codAmount", e.target.value)} />
                </div>
              )}
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <h4 className="text-xs font-black text-primary">ملخص التكاليف</h4>
              <div className="space-y-1.5">
                {[
                  { label: "سعر منطقة التوصيل",  value: fc(zonePrice)   },
                  { label: "إضافة نوع الشحنة",   value: fc(parcelPrice) },
                  form.paymentMethod === "cod"
                    ? { label: "سعر الشحنة", value: fc(cod), highlight: true }
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

          {/* ── المخزن — تلقائي من العميل التجاري ── */}
          {form.warehouseId && (() => {
            const wh = warehouses.find((w: any) => String(w.id) === form.warehouseId);
            return (
              <section className="rounded-xl border border-teal-900/40 bg-teal-900/5 p-4">
                <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2 mb-3">
                  <Warehouse className="w-3.5 h-3.5 text-teal-400" /> المخزن
                </h3>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-teal-500/30 bg-teal-500/5">
                  <Warehouse className="w-4 h-4 text-teal-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-teal-300">{wh?.name ?? "—"}{wh?.city ? ` — ${wh.city}` : ""}</p>
                    <p className="text-[10px] text-teal-500 mt-0.5">تم تحديده تلقائياً من العميل التجاري</p>
                  </div>
                  <span className="text-[10px] font-bold text-teal-400 bg-teal-900/30 border border-teal-700/40 px-2 py-0.5 rounded-full">مخزن العميل</span>
                </div>
              </section>
            );
          })()}

          {/* ── تتبع الإعلان والفريق ── */}
          <section className="space-y-3 rounded-xl border border-purple-900/40 bg-purple-900/5 p-4">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
              <Megaphone className="w-3.5 h-3.5 text-purple-400" /> تتبع الإعلان والفريق
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1"><Megaphone className="w-3 h-3" /> مصدر الطلب</Label>
                <Select value={form.adSource || "none"} onValueChange={v => set("adSource", v === "none" ? "" : v)}>
                  <SelectTrigger className="text-sm h-10 bg-card">
                    <SelectValue placeholder="اختر المصدر">
                      {form.adSource && form.adSource !== "none" && (
                        <span className="flex items-center gap-2">
                          <AdSourceIcon value={form.adSource} />
                          {AD_SOURCES.find(s => s.value === form.adSource)?.label}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— غير محدد —</SelectItem>
                    {AD_SOURCES.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="flex items-center gap-2"><AdSourceIcon value={s.value} />{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">اسم الحملة</Label>
                <input className="w-full text-sm h-10 bg-card border border-border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Summer 2025..." value={form.adCampaign} onChange={e => set("adCampaign", e.target.value)} />
              </div>
              {isAdmin && (
                <div>
                  <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1"><UserCheck className="w-3 h-3" /> الراسل</Label>
                  <Select value={form.assignedUserId || "none"} onValueChange={v => handleAssignedUserChange(v === "none" ? "" : v)}>
                    <SelectTrigger className="text-sm h-10 bg-card"><SelectValue placeholder="اختر موظف" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— غير محدد —</SelectItem>
                      {users.filter((u: any) => u.isActive).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

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

// ── ColFilterBtn: فلتر Excel لكل عمود ─────────────────────────────────────
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

// ─── Status colours for Excel ─────────────────────────────────────────────────
const EXCEL_STATUS_FILL: Record<string, string> = {
  pending:          "FFFBBF24",
  warehouse_ready:  "FFFB923C",
  in_shipping:      "FF3B82F6",
  received:         "FF22C55E",
  delayed:          "FFA855F7",
  returned:         "FFEF4444",
  partial_received: "FF06B6D4",
};

async function exportToExcel(
  rows: any[],
  canFinancials: boolean,
  statusLabels: Record<string, string>
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Caprina Orders";
  wb.created = new Date();

  const ws = wb.addWorksheet("الشحنات", { views: [{ rightToLeft: true }] });

  // ── Column definitions ─────────────────────────────────────────────────────
  const cols: { header: string; key: string; width: number }[] = [
    { header: "#",           key: "num",        width: 8  },
    { header: "التاريخ",    key: "date",       width: 14 },
    { header: "المرسل",     key: "sender",     width: 22 },
    { header: "المستلم",    key: "receiver",   width: 22 },
    { header: "الهاتف",     key: "phone",      width: 16 },
    { header: "المحافظة",   key: "gov",        width: 16 },
    ...(canFinancials ? [{ header: "سعر الشحنة", key: "price", width: 14 }] : []),
    { header: "المندوب",    key: "agent",      width: 20 },
    { header: "الحالة",     key: "status",     width: 16 },
  ];

  ws.columns = cols;

  // ── Header row style ───────────────────────────────────────────────────────
  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell(cell => {
    cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
    cell.font   = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: "Cairo" };
    cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
    cell.border = {
      top:    { style: "thin", color: { argb: "FF14532D" } },
      bottom: { style: "thin", color: { argb: "FF14532D" } },
      left:   { style: "thin", color: { argb: "FF14532D" } },
      right:  { style: "thin", color: { argb: "FF14532D" } },
    };
  });

  // ── Data rows ─────────────────────────────────────────────────────────────
  rows.forEach((o, idx) => {
    const status  = o.status as string;
    const rowData: Record<string, any> = {
      num:      (o.id ?? idx + 1).toString().padStart(4, "0"),
      date:     new Date(o.createdAt).toLocaleDateString("ar-EG"),
      sender:   (o as any).senderName   || (o as any).customerName || "",
      receiver: (o as any).receiverName || "",
      phone:    (o as any).senderPhone  || (o as any).receiverPhone || (o as any).phone || "",
      gov:      (o as any).receiverCity || (o as any).receiverGovernorate || "",
      ...(canFinancials ? { price: Number((o as any).codAmount ?? (o as any).totalAmount ?? 0) } : {}),
      agent:    (o as any).assignedUserName || (o as any).createdByName || "",
      status:   statusLabels[status] || status,
    };

    const excelRow = ws.addRow(rowData);
    excelRow.height = 22;

    // status fill colour
    const fillArgb = EXCEL_STATUS_FILL[status] ?? "FFCCCCCC";
    const statusColIdx = cols.findIndex(c => c.key === "status") + 1;

    excelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font      = { name: "Cairo", size: 11, color: { argb: "FF1F2937" } };
      cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl", wrapText: false };
      cell.border    = {
        top:    { style: "hair", color: { argb: "FFD1D5DB" } },
        bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
        left:   { style: "hair", color: { argb: "FFD1D5DB" } },
        right:  { style: "hair", color: { argb: "FFD1D5DB" } },
      };

      // zebra stripe
      if (idx % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
      }

      // status cell gets its own colour + bold white
      if (colNum === statusColIdx) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
        cell.font = { name: "Cairo", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      }

      // price cell: number format
      if (cols[colNum - 1]?.key === "price" && typeof cell.value === "number") {
        cell.numFmt = '#,##0.00" ج"';
        cell.font   = { name: "Cairo", size: 11, bold: true, color: { argb: "FF15803D" } };
      }
    });
  });

  // ── Freeze header row ──────────────────────────────────────────────────────
  ws.views = [{ state: "frozen", ySplit: 1, rightToLeft: true }];

  // ── Auto-filter on header ──────────────────────────────────────────────────
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  // ── Download ───────────────────────────────────────────────────────────────
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `shipments-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Orders() {
  const [showNewShipment, setShowNewShipment] = useState(false);
  const [location, navigate] = useLocation();

  // لو جاي من الـ sidebar بـ ?new=1 افتح الـ dialog مباشرةً
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setShowNewShipment(true);
      window.history.replaceState(null, "", "/orders");
    }
    const statusParam = params.get("status");
    if (statusParam) {
      setStatus(statusParam);
      window.history.replaceState(null, "", "/shipments");
    }
  }, [location]);
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

  const handleSort = useCallback((col: ColKey, dir: "asc" | "desc") => {
    setSortCol(col);
    setSortDir(dir);
  }, []);
  const debouncedSearch = useDebounce(search, 300);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // mutation لتحديث حالة الشحنة
  const updateShipment = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/shipments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
      queryClient.invalidateQueries({ queryKey: ["shipments-stats"] });
    },
  });
  const { user, isAdmin, can } = useAuth();

  // ── Shipment form data ───────────────────────────────────────────────────────
  const { data: shipmentZones = [] } = useQuery<ShipmentZone[]>({
    queryKey: ["shipment-zones"],
    queryFn: () => apiFetch("/shipments/zones"),
    staleTime: 5 * 60_000,
  });
  const { data: parcelPricing = [] } = useQuery<ParcelTypePricing[]>({
    queryKey: ["parcel-type-pricing"],
    queryFn: () => apiFetch("/parcel-type-pricing"),
    staleTime: 5 * 60_000,
  });
  const { data: shipmentClients = [] } = useQuery<ShipmentClient[]>({
    queryKey: ["clients-for-shipment"],
    queryFn: () => apiFetch<ShipmentClient[]>("/finance/clients/for-shipment"),
    staleTime: 5 * 60_000,
  });
  // خريطة سريعة (clientId → محافظة العميل التجاري) لعرضها في عمود الراسل
  const clientGovernorateById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of shipmentClients) {
      const gov = c.region || c.city || "";
      if (gov) map.set(c.id, gov);
    }
    return map;
  }, [shipmentClients]);
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
  const [showBulkInShippingDialog, setShowBulkInShippingDialog] = useState(false);
  const [bulkInShippingCourierId, setBulkInShippingCourierId] = useState<number | null>(null);

  // قالب واتساب — يتحمل مرة وبيستخدمه الـ handleWhatsApp مباشرة
  const { data: waSettings } = useQuery<WaSettings>({
    queryKey: ["whatsapp-settings"],
    queryFn: () => apiFetch<WaSettings>("/whatsapp/settings"),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: isAdmin,
  });

  const { data: shippingCompanies = [] } = useQuery<any[]>({
    queryKey: ["shipping-companies"],
    queryFn: () => apiFetch("/shipping-companies"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["shipments-list", debouncedSearch, status, dateFrom, dateTo],
    queryFn: () => apiFetch<any>(`/shipments?${new URLSearchParams({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(status !== "all" ? { status } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      limit: "200",
    }).toString()}`).then((res: any) => res.data ?? res),
    staleTime: 15_000,
    gcTime: 60_000,
  });

  // query منفصلة للإحصائيات — بدون فلتر حالة
  const { data: allOrdersForStats } = useQuery({
    queryKey: ["shipments-stats"],
    queryFn: () => apiFetch<any>(`/shipments/stats`),
    staleTime: 30_000,
    gcTime: 60_000,
  });

  // IDs of orders already in a shipping manifest (to detect "still in warehouse")
  const { data: inManifestData } = useQuery({
    queryKey: ["orders-in-manifest-ids"],
    queryFn: () => ordersApi.inManifestIds(),
    staleTime: 0,
  });
  const inManifestSet = new Set(inManifestData?.ids ?? []);

  const filtered = (Array.isArray(orders) ? orders : []).filter((o: any) => {
    if (customerSearch && !o.senderName?.toLowerCase().includes(customerSearch.toLowerCase()) &&
        !o.receiverName?.toLowerCase().includes(customerSearch.toLowerCase())) return false;
    if (totalSearch && !String(Math.round(Number(o.totalAmount || 0))).includes(totalSearch)) return false;
    return true;
  });

  // ── Col Filter helpers ──────────────────────────────────────────────────────
  const getColVal = useCallback((col: ColKey, o: any): string => {
    switch (col) {
      case "id":       return o.shipmentNumber ?? `#${o.id.toString().padStart(4,"0")}`;
      case "date":     return format(new Date(o.createdAt), "yyyy/MM/dd");
      case "customer": return o.senderName ?? "";
      case "phone":    return o.senderPhone ?? o.receiverPhone ?? "";
      case "product":  return o.receiverName ?? "";
      case "total":    return String(Math.round(Number(o.totalAmount || 0)));
      case "creator":  return (o as any).createdByName ?? "";
      case "status":   return statusLabels[o.status] ?? o.status ?? "";
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
      const res = await fetch("/api/shipments/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      await queryClient.refetchQueries({ queryKey: ["shipments-list"] });
      queryClient.invalidateQueries({ queryKey: ["shipments-stats"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-charts"] });
      const skippedMsg = data.skipped > 0 ? ` (${data.skipped} محظور — مستلمة)` : "";
      toast({ title: `تم حذف ${data.deleted} شحنة ✅`, description: `تم حذف الشحنات بنجاح${skippedMsg}` });
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
    try {
      const token = localStorage.getItem("caprina_token");
      const res = await fetch("/api/shipments/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: newStatus }),
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
      queryClient.invalidateQueries({ queryKey: ["shipments-stats"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-charts"] });
      const label = statusLabels[newStatus] ?? newStatus;
      toast({ title: `تم تحديث ${data.updated} شحنة ✅`, description: `تم تغيير الحالة إلى «${label}»` });
    } catch {
      toast({ title: "خطأ", description: "فشل تحديث الحالة", variant: "destructive" });
    }
    setPendingBulkStatus(null);
    exitBulkMode();
    setIsBulkUpdating(false);
  };

  const handleBulkInShipping = async (courierId: number) => {
    if (selectedIds.size === 0) return;
    const lockedIds = Array.from(selectedIds).filter(id => inManifestSet.has(id));
    if (lockedIds.length > 0) {
      toast({
        title: "⛔ لا يمكن تعديل حالة بعض الطلبات",
        description: `${lockedIds.length} طلب مرتبط ببيان شحن مفتوح — يجب تعديل حالته من داخل البيان.`,
        variant: "destructive",
      });
      setShowBulkInShippingDialog(false);
      return;
    }
    setIsBulkUpdating(true);
    try {
      const token = localStorage.getItem("caprina_token");
      const res = await fetch("/api/shipments/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: "in_shipping", shippingCompanyId: courierId }),
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
      queryClient.invalidateQueries({ queryKey: ["shipments-stats"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-charts"] });
      const courier = shippingCompanies.find((c: any) => c.id === courierId);
      toast({ title: `✅ تم تحويل ${data.updated} شحنة لقيد الشحن مع ${courier?.name ?? "المندوب"}` });
    } catch {
      toast({ title: "خطأ", description: "فشل تحديث الحالة", variant: "destructive" });
    }
    setShowBulkInShippingDialog(false);
    setBulkInShippingCourierId(null);
    exitBulkMode();
    setIsBulkUpdating(false);
  };

  const handleWhatsApp = (e: React.MouseEvent, order: NonNullable<typeof orders>[0]) => {
    e.stopPropagation();
    const phone = (order as any).receiverPhone || (order as any).phone || (order as any).senderPhone || "";
    if (!phone) {
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

    const shipment = order as any;
    const customerName = shipment.receiverName || shipment.customerName || shipment.senderName || "العميل";
    const product       = shipment.description || shipment.product || "شحنة";
    const totalPrice    = Number(shipment.totalAmount || shipment.codAmount || shipment.totalPrice || 0);
    const orderNumber   = order.id.toString().padStart(4, "0");
    const formatCurr = (n: number) =>
      new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

    let message = "";
    // حاول استخدام القالب المخزّن أولاً، لكن تحقق أنه لا يحتوي على رموز ترميز معطوبة (�)
    if (status === "in_shipping" && tpl) {
      const candidate = applyShippingTemplate(tpl.body, {
        id: order.id,
        customerName,
        product,
        trackingNumber: shipment.trackingNumber ?? null,
        shippingCompany: (shipment.shippingCompanyName || shipment.shippingCompany) ?? null,
        daysPending: shipment.daysPending ?? 0,
      });
      if (!candidate.includes("\uFFFD")) message = candidate;
    } else if (tpl) {
      const candidate = applyTemplate(tpl.body, {
        id: order.id,
        customerName,
        product,
        quantity: Number(shipment.pieces || shipment.quantity || 1),
        totalPrice,
        status: order.status,
        phone,
        senderName: shipment.senderName || shipment.storeName || null,
        senderPhone: shipment.senderPhone || null,
        senderCity: shipment.senderCity || null,
        customerCity: shipment.receiverCity || null,
        customerAddress: shipment.receiverAddress || null,
      });
      if (!candidate.includes("\uFFFD")) message = candidate;
    }

    // fallback نظيف — رسالة منسقة بإيموجيز سليمة لو القالب المخزّن مفقود أو تالف الترميز
    if (!message) {
      message =
        `أهلاً يا ${customerName} 👋\n\n` +
        `أوردرك رقم #${orderNumber} خرج للشحن 📦\n\n` +
        `المنتج: ${product}\n` +
        `المبلغ: ${formatCurr(totalPrice)}\n\n` +
        `المندوب في طريقه إليك — يرجى الاستعداد للاستلام والدفع ✅`;
    }

    if (!message) {
      toast({ title: "لا يوجد قالب", description: "أضف قالب رسالة أولاً من إعدادات واتساب", variant: "destructive" });
      return;
    }

    // ملحوظة: نص تتبع الشحنة (اسم الاستور ورقم الهاتف) بقى جزء من القالب نفسه
    // عبر متغيرات {senderName} و {senderPhone} — بيتحكم فيه بالكامل من إعدادات واتساب

    const link = buildWhatsAppLink(phone, message);
    window.open(link, "_blank", "noopener,noreferrer");

    // تحويل الحالة → warehouse_ready عند الضغط على واتساب (إلا لو استلم أو مرتجع)
    const FINAL_STATUSES = ["received", "returned", "partial_received"];
    if (!FINAL_STATUSES.includes(status)) {
      updateShipment.mutate(
        { id: order.id, data: { status: "warehouse_ready" } },
        { onSuccess: () => {
          toast({ title: "تم فتح واتساب ✅", description: `تم تحويل الشحنة إلى «قيد الشحن في المخزن»` });
        }}
      );
    } else {
      toast({ title: "تم فتح واتساب ✅", description: "الرسالة جاهزة للإرسال" });
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
          <h1 className="text-2xl font-bold">الشحنات</h1>
          <p className="text-muted-foreground text-sm mt-0.5">إدارة وتتبع جميع الشحنات</p>
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
                      onClick={() => {
                        if (opt.value === "in_shipping") {
                          setBulkInShippingCourierId(null);
                          setShowBulkInShippingDialog(true);
                        } else {
                          setPendingBulkStatus(opt.value);
                        }
                      }}
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
                if (!filtered?.length) return;
                exportToExcel(filtered, canFinancials, statusLabels);
              }}>
                <Download className="w-3.5 h-3.5" />تصدير Excel
              </Button>
              )}
              {/* زر شحنة جديدة — فقط لو عنده canCreate */}
              {canCreate && (
              <Button
                className="gap-2 font-bold text-sm border-0 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #6b7280 0%, #d1d5db 35%, #9ca3af 60%, #6b7280 100%)",
                  color: "#1a1a1a",
                  boxShadow: "0 2px 12px rgba(156,163,175,0.45), inset 0 1px 0 rgba(255,255,255,0.45)",
                  textShadow: "0 1px 0 rgba(255,255,255,0.4)",
                }}
                onClick={() => navigate("/shipments/new")}
              >
                <span
                  className="absolute inset-0 rounded-md pointer-events-none"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 60%)",
                  }}
                />
                <Plus className="w-4 h-4 relative z-10" />
                <span className="relative z-10">شحنة جديدة</span>
              </Button>
              )}
            </>
          ))}
        </div>
      </div>

      {/* إحصائيات الطلبات */}
      {(() => {
        // نقبل أي شكل response: { statuses: [...] } أو array مباشرة أو undefined
        const raw = allOrdersForStats as any;
        const statsData: { status: string; count: number }[] =
          Array.isArray(raw?.statuses) ? raw.statuses :
          Array.isArray(raw) ? raw : [];
        const total = statsData.reduce((s, r) => s + Number(r.count), 0);
        const labelMap: Record<string, string> = {
          pending:          "قيد الانتظار",
          warehouse_ready:  "قيد الشحن في المخزن",
          in_shipping:      "قيد الشحن",
          received:         "استلم",
          delayed:          "مؤجل",
          returned:         "مرتجع",
          partial_received: "استلام جزئي",
          // قيم قديمة في الـ DB
          waiting:          "قيد الانتظار",
          confirmed:        "قيد الشحن في المخزن",
          picked_up:        "قيد الشحن في المخزن",
          in_transit:       "قيد الشحن",
          out_for_delivery: "قيد الشحن",
          delivered:        "استلم",
          cancelled:        "مرتجع",
        };
        const rgbMap: Record<string, string> = {
          pending:          "251,191,36",
          warehouse_ready:  "45,212,191",
          in_shipping:      "56,189,248",
          received:         "52,211,153",
          delayed:          "99,102,241",
          returned:         "248,113,113",
          partial_received: "168,85,247",
          // قيم قديمة — نفس الألوان
          waiting:          "251,191,36",
          confirmed:        "45,212,191",
          picked_up:        "45,212,191",
          in_transit:       "56,189,248",
          out_for_delivery: "56,189,248",
          delivered:        "52,211,153",
          cancelled:        "248,113,113",
        };
        // لو البيانات ما جاتش لسه نعرض skeleton
        if (!allOrdersForStats) return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 opacity-40">
            <div className="rounded-2xl h-[140px] bg-muted/20 animate-pulse" />
            <div className="lg:col-span-2 rounded-2xl h-[140px] bg-muted/20 animate-pulse" />
          </div>
        );

        // نجمع بالـ label عشان statuses بنفس الاسم (in_transit + in_shipping = قيد الشحن) تتدمج
        const mergedByLabel: Record<string, { rgb: string; count: number }> = {};
        statsData
          .filter(r => Number(r.count) > 0)
          .forEach(r => {
            const lbl = labelMap[r.status] ?? r.status;
            const rgb = rgbMap[r.status] ?? "156,163,175";
            if (!mergedByLabel[lbl]) mergedByLabel[lbl] = { rgb, count: 0 };
            mergedByLabel[lbl].count += Number(r.count);
          });
        const mergedTotal = Object.values(mergedByLabel).reduce((s, v) => s + v.count, 0);
        const counts = Object.entries(mergedByLabel)
          .map(([label, { rgb, count }]) => ({
            key: label,
            label,
            rgb,
            count,
            pct: mergedTotal > 0 ? Math.round(count / mergedTotal * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count);

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
                شحنات الأسبوع
              </p>
              <div className="mt-2">
                <span className="text-5xl font-black" style={{ color: "rgba(251,191,36,1)", lineHeight: 1 }}>
                  {total}
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
                {counts.map(s => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="shrink-0 w-2.5 h-2.5 rounded-full"
                      style={{ background: `rgba(${s.rgb},0.9)`, boxShadow: `0 0 6px rgba(${s.rgb},0.6)` }} />
                    <span className="flex-1 text-xs font-medium text-right" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {s.label}
                    </span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.max(s.pct, 8)}%`,
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
                <SelectItem value="all">جميع الشحنات</SelectItem>
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
                const canWhatsApp = canWriteOrders && !bulkSelectMode;
                const retReason = (order as any).returnReason as string | null;
                const retNote   = (order as any).returnNote   as string | null;
                const isSelected = isGroupSelected(order);
                const groupCount = (order as any)._groupCount as number | undefined;
                const navTarget = `/shipments/${order.id}`;
                return (
                  <div
                    key={order.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/10 active:bg-muted/20 cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                    onClick={() => canWriteOrders && bulkSelectMode ? toggleSelect(order) : navigate(navTarget)}
                  >
                    {canWriteOrders && bulkSelectMode && (
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(order)} onClick={e => e.stopPropagation()} className="shrink-0" />
                    )}
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                      {(order.customerName || order.senderName || "؟").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-sm truncate">{order.customerName || order.senderName || "—"}</p>
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
                        {(() => { const SI = STATUS_ICONS[order.status] || Package; return (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusClasses[order.status] || ""}`}>
                            <SI className="w-3 h-3" />
                            {statusLabels[order.status] || order.status}
                          </span>
                        ); })()}
                        {order.status === "returned" && (() => {
                          const rr = (order as any).returnReceived as 0 | 1 | null | undefined;
                          if (rr === 0) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-orange-500 dark:text-orange-400">⏳ عند شركة الشحن</span>;
                          return null;
                        })()}
                        {order.status === "warehouse_ready" && (order as any).warehouseName && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-teal-500 dark:text-teal-400">📦 {(order as any).warehouseName}</span>
                        )}
                        {order.status === "in_shipping" && (order as any).assignedUserName && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                            🚚 مع {(order as any).assignedUserName}
                          </span>
                        )}
                        {order.status === "in_shipping" && !(order as any).assignedUserName && (order as any).shippingCompanyName && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                            🚚 مع {(order as any).shippingCompanyName}
                          </span>
                        )}
                        {order.status === "in_shipping" && !(order as any).assignedUserName && !(order as any).shippingCompanyName && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                            🚚 عند شركة الشحن
                          </span>
                        )}
                        {order.status === "delayed" && (() => {
                          const reason = (order as any).notes as string | null | undefined;
                          if (!reason) return null;
                          return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-violet-400 dark:text-violet-300">⏸ {reason}</span>;
                        })()}
                        {order.status === "partial_received" && (() => {
                          const rr = (order as any).returnReceived as 0 | 1 | null | undefined;
                          const pq = (order as any).partialQuantity as number | null | undefined;
                          const totalPrice = ((order as any).totalPrice ?? 0) as number;
                          return (
                            <span className="inline-flex flex-col gap-0 text-[9px] font-bold leading-tight">
                              {pq != null && <span className="text-teal-600 dark:text-teal-400">✓ استُلم {formatCurrency(pq)} من {formatCurrency(totalPrice)}</span>}
                              {rr === 1
                                ? <span className="text-emerald-600 dark:text-emerald-400">↪ الباقي في مخزن {(order as any).warehouseName || "—"}</span>
                                : <span className="text-orange-500 dark:text-orange-400">🚚 الباقي ما زال عند مندوب الشحن</span>}
                            </span>
                          );
                        })()}
                        {order.status === "returned" && (() => {
                          const rr = (order as any).returnReason as string | null | undefined;
                          const rn = (order as any).returnNote as string | null | undefined;
                          const reason = rr ? (rr === "other" && rn ? rn : returnReasonLabel(rr)) : null;
                          if (!reason) return null;
                          return <span className="inline-flex items-center gap-0.5 text-[9px] text-red-600 dark:text-red-400"><RotateCcw className="w-2.5 h-2.5 shrink-0" />{reason}</span>;
                        })()}
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
                        <span>الراسل</span>
                        {showColFilters && <ColFilterBtn col="customer" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                      </div>
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">المستلم{showColFilters && <ColFilterBtn col="product" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">الهاتف{showColFilters && <ColFilterBtn col="phone" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                    </TableHead>
                    <TableHead className="text-right text-xs">المحافظة</TableHead>
                    {canFinancials && (
                    <TableHead className="text-right text-xs">
                      <div className="flex items-center gap-1">
                        <span>سعر الشحنة</span>
                        {showColFilters && <ColFilterBtn col="total" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                      </div>
                    </TableHead>
                    )}
                    {canFinancials && (
                    <TableHead className="text-right text-xs">سعر الشحن</TableHead>
                    )}
                    {canFinancials && (
                    <TableHead className="text-right text-xs">الإجمالي</TableHead>
                    )}
                    <TableHead className="text-right text-xs">المندوب</TableHead>
                    <TableHead className="text-center text-xs w-36">
                      <div className="flex items-center justify-center gap-1">الحالة{showColFilters && <ColFilterBtn col="status" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}</div>
                    </TableHead>
                    <TableHead className="text-center text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map((order, rowIndex) => {
                    const o = order as any;
                    const senderPhone = o.senderPhone || o.receiverPhone || o.phone || "";
                    const canWhatsApp = canWriteOrders && !bulkSelectMode;
                    const navTarget = `/shipments/${order.id}`;
                    const isSelected = isGroupSelected(order);
                    const retReason = o.returnReason as string | null;
                    const retNote   = o.returnNote   as string | null;
                    return (
                      <TableRow
                        key={order.id}
                        className={`border-border hover:bg-muted/20 cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                        style={{ animation: "rowFadeIn 0.3s ease both", animationDelay: `${Math.min(rowIndex * 35, 600)}ms` }}
                        onClick={() => canWriteOrders && bulkSelectMode ? toggleSelect(order) : navigate(navTarget)}
                      >
                        {canWriteOrders && bulkSelectMode && (
                          <TableCell className="text-center p-2">
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(order)} onClick={e => e.stopPropagation()} />
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs text-primary font-bold">
                          #{order.id.toString().padStart(4,"0")}
                          {o.shipmentNumber && <div className="text-[9px] text-muted-foreground">{o.shipmentNumber}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(order.createdAt), "yyyy/MM/dd")}</TableCell>
                        <TableCell className="text-sm font-semibold">
                          {o.senderName || o.customerName || "—"}
                          {(() => {
                            const senderGov = (o.clientId && clientGovernorateById.get(o.clientId))
                              || o.senderCity || o.senderGovernorate;
                            if (!senderGov) return null;
                            return (
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                {senderGov}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {o.receiverName || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{(o.receiverPhone || o.senderPhone || order.phone) || "—"}</TableCell>
                        <TableCell className="text-xs font-medium">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                            {o.receiverCity || o.zoneGovernorate || o.zoneLabel || "—"}
                          </span>
                        </TableCell>
                        {canFinancials && (
                        <TableCell className="text-xs font-bold text-primary">
                          {o.codAmount != null ? formatCurrency(Number(o.codAmount)) : o.totalAmount != null ? formatCurrency(Number(o.totalAmount)) : "—"}
                        </TableCell>
                        )}
                        {canFinancials && (
                        <TableCell className="text-xs font-medium">
                          {o.shippingFee != null ? formatCurrency(Number(o.shippingFee)) : "—"}
                        </TableCell>
                        )}
                        {canFinancials && (
                        <TableCell className="text-xs font-bold text-primary">
                          {formatCurrency((Number(o.codAmount ?? o.totalAmount ?? 0)) + Number(o.shippingFee ?? 0))}
                        </TableCell>
                        )}
                        <TableCell className="text-xs text-muted-foreground">
                          {o.assignedUserName
                            ? <span className="inline-flex items-center gap-1 text-[10px] font-medium">👤 {o.assignedUserName}</span>
                            : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <Badge variant="outline" className={`text-[9px] font-bold border ${statusClasses[order.status] || ""}`}>
                              {statusLabels[order.status] || order.status}
                            </Badge>
                          {order.status === "warehouse_ready" && (
                            <div className="flex flex-col items-center gap-0.5 mt-1">
                              <span className="text-[9px] font-bold text-amber-500 dark:text-amber-400 leading-none">🏠 ما زال في المخزن</span>
                              {(order as any).warehouseName && (
                                <span className="text-[9px] font-semibold text-teal-500 dark:text-teal-400 leading-none">📦 {(order as any).warehouseName}</span>
                              )}
                            </div>
                          )}
                          {(order.status === "in_shipping" || order.status === "in_transit") && (
                            <div className="flex flex-col items-center gap-0.5 mt-1">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5 leading-none">
                                🚚 {(order as any).shippingCompanyName
                                  ? `مع ${(order as any).shippingCompanyName}`
                                  : (order as any).assignedUserName
                                  ? `مع ${(order as any).assignedUserName}`
                                  : "عند المندوب"}
                              </span>
                            </div>
                          )}
                          {order.status === "delayed" && (() => {
                            const reason = o.notes as string | null | undefined;
                            if (!reason) return null;
                            return (
                              <div className="flex items-center justify-center gap-0.5 mt-1">
                                <span className="text-[9px] font-bold text-violet-400 dark:text-violet-300 leading-none">⏸ {reason}</span>
                              </div>
                            );
                          })()}
                          {order.status === "returned" && (() => {
                            const rr = o.returnReason as string | null | undefined;
                            const rn = o.returnNote as string | null | undefined;
                            const reason = rr ? (rr === "other" && rn ? rn : returnReasonLabel(rr)) : null;
                            if (!reason) return null;
                            return (
                              <div className="flex items-center justify-center gap-0.5 mt-1">
                                <RotateCcw className="w-2.5 h-2.5 text-red-500 shrink-0" />
                                <span className="text-[9px] text-red-600 dark:text-red-400 leading-none">{reason}</span>
                              </div>
                            );
                          })()}
                          {order.status === "returned" && (() => {
                            const rr = (o as any).returnReceived as 0 | 1 | null | undefined;
                            if (rr === 0) return (
                              <div className="flex items-center justify-center gap-0.5 mt-1">
                                <span className="text-[9px] font-bold text-orange-500 dark:text-orange-400 leading-none">⏳ عند شركة الشحن</span>
                              </div>
                            );
                            return null;
                          })()}
                          {order.status === "partial_received" && (() => {
                            const rr = (o as any).returnReceived as 0 | 1 | null | undefined;
                            const pq = o.partialQuantity as number | null | undefined;
                            const totalPrice = ((o as any).totalPrice ?? 0) as number;
                            return (
                              <div className="flex flex-col items-center gap-0 mt-1 text-[9px] font-bold leading-tight">
                                {pq != null && <span className="text-teal-600 dark:text-teal-400">✓ استُلم {formatCurrency(pq)} من {formatCurrency(totalPrice)}</span>}
                                {rr === 1
                                  ? <span className="text-emerald-600 dark:text-emerald-400">↪ الباقي في مخزن {(o as any).warehouseName || "—"}</span>
                                  : <span className="text-orange-500 dark:text-orange-400">🚚 الباقي ما زال عند مندوب الشحن</span>}
                              </div>
                            );
                          })()}
                          </div>
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
            <p className="font-bold text-foreground">لا توجد شحنات</p>
            <p className="text-sm text-muted-foreground mt-1">{hasActiveFilter ? "جرّب تغيير معايير البحث." : "لا يوجد شحنات حتى الآن."}</p>
          </div>
        )}
      </Card>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-left">
          إجمالي {filtered.length} شحنة
          {orders && filtered.length !== orders.length && ` (من ${orders.length})`}
          {bulkSelectMode && selectedIds.size > 0 && ` — محدد: ${selectedInvoiceCount}`}
        </p>
      )}

      {/* Dialog شحنة جديدة */}
      <ShipmentFormDialog
        open={showNewShipment}
        onClose={() => setShowNewShipment(false)}
        zones={shipmentZones}
        parcelPricing={parcelPricing}
        clients={shipmentClients}
      />

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

      {/* dialog تحويل قيد الشحن بالجملة — اختيار المندوب */}
      <Dialog open={showBulkInShippingDialog} onOpenChange={v => { if (!v) { setShowBulkInShippingDialog(false); setBulkInShippingCourierId(null); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Truck className="w-4 h-4 text-blue-400" />تحويل {selectedIds.size > 1 ? `${selectedIds.size} شحنات` : "شحنة"} إلى قيد الشحن
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">اختر مندوب الشحن المسؤول عن هذه الشحنات:</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">المندوب <span className="text-red-500">*</span></Label>
              <select
                value={bulkInShippingCourierId ?? ""}
                onChange={e => setBulkInShippingCourierId(e.target.value ? Number(e.target.value) : null)}
                className="w-full h-10 text-sm rounded-md border border-input bg-card px-3 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— اختر المندوب —</option>
                {shippingCompanies.filter((c: any) => c.isActive !== false).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowBulkInShippingDialog(false); setBulkInShippingCourierId(null); }}>إلغاء</Button>
            <Button
              size="sm"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              disabled={!bulkInShippingCourierId || isBulkUpdating}
              onClick={() => bulkInShippingCourierId && handleBulkInShipping(bulkInShippingCourierId)}
            >
              <Truck className="w-3.5 h-3.5" />
              {isBulkUpdating ? "جاري..." : "تأكيد الشحن"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}