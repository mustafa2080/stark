import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { Plus, Package, User, MapPin, Boxes, CreditCard, RefreshCw, ArrowRight, Megaphone, Warehouse, UserCheck, Check, ChevronsUpDown, Save } from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, warehousesApi, usersApi, shipmentsApi } from "@/lib/api";

type PaymentMethod = "cod" | "prepaid" | "deferred";
type ParcelType    = "document" | "normal" | "fragile" | "heavy" | "electronics" | "clothing" | "food" | "other";

interface ShipmentZone        { id: number; name: string; fromGovernorate?: string; toGovernorate?: string; price: number; isActive?: boolean }
interface ParcelTypePricing   { id: number; parcelType: string; label?: string; basePrice: number; isActive?: boolean }
interface ShipmentClient      { id: number; name: string; phone?: string; phone2?: string; city?: string; region?: string; governorate?: string; address?: string; warehouseId?: number | null; avatar?: string | null; defaultAdSource?: string | null }

const PARCEL_LABELS: Record<string, string> = {
  document: "مستندات", normal: "عادي", fragile: "قابل للكسر",
  heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس", food: "طعام", other: "أخرى",
};
const PAYMENT_LABELS: Record<PaymentMethod, string> = { cod: "الدفع عند الاستلام (COD)", prepaid: "مدفوع مسبقاً", deferred: "آجل" };
const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  cod:      "bg-amber-500/10  text-amber-600  dark:text-amber-400  border-amber-400/40",
  prepaid:  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-400/40",
  deferred: "bg-blue-500/10   text-blue-600   dark:text-blue-400   border-blue-400/40",
};

const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

const AdSourceIcon = ({ value, className = "w-4 h-4 shrink-0" }: { value: string; className?: string }) => {
  if (value === "facebook")  return <svg className={className} viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>;
  if (value === "tiktok")    return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>;
  if (value === "instagram") return <svg className={className} viewBox="0 0 24 24" fill="url(#igG)"><defs><linearGradient id="igG" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="50%" stopColor="#dc2743"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
  if (value === "whatsapp")  return <svg className={className} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
  if (value === "organic")   return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>;
};

const AD_SOURCES = [
  { value: "facebook",  label: "فيسبوك" },
  { value: "tiktok",   label: "تيك توك" },
  { value: "instagram", label: "إنستجرام" },
  { value: "whatsapp", label: "واتساب" },
  { value: "organic",  label: "ويبسايت" },
  { value: "other",    label: "أخرى" },
];

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

export default function NewShipmentPage() {
  const [, navigate] = useLocation();
  const params = useParams();
  const editId = params.id ? Number(params.id) : null;
  const isEditMode = !!editId;
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  // ── الشحنة الحالية (وضع التعديل فقط) ──
  const { data: existingShipment, isLoading: isLoadingShipment } = useQuery({
    queryKey: ["shipment-detail", editId],
    queryFn: () => apiFetch<any>(`/shipments/${editId}`),
    enabled: isEditMode,
  });
  const prefilledRef = useRef(false);

  const [form, setForm] = useState({
    clientId: "",
    senderName: "", senderPhone: "", senderPhone2: "", senderCity: "",
    receiverName: "", receiverPhone: "", receiverPhone2: "", receiverAddress: "", receiverCity: "",
    zoneId: "", parcelType: "" as ParcelType | "",
    weight: "", pieces: "1", description: "",
    paymentMethod: "cod" as PaymentMethod,
    codAmount: "", notes: "",
    adSource: "", adCampaign: "", warehouseId: "", assignedUserId: "",
    shippingCompanyId: "",
    canOpen: "", isDivisible: "", rejectionPolicy: "",
  });
  const [govOpen, setGovOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientOpen2, setClientOpen2] = useState(false);

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

  const { data: zones = [] }         = useQuery<ShipmentZone[]>({ queryKey: ["shipment-zones"],        queryFn: () => apiFetch("/shipments/zones") });
  const { data: parcelPricing = [] } = useQuery<ParcelTypePricing[]>({ queryKey: ["parcel-pricing"],   queryFn: () => apiFetch("/shipments/parcel-pricing") });
  const { data: clients = [] }       = useQuery<ShipmentClient[]>({ queryKey: ["clients-for-shipment"], queryFn: () => apiFetch<ShipmentClient[]>("/finance/clients/for-shipment") });
  const { data: warehouses }         = useQuery({ queryKey: ["warehouses"], queryFn: warehousesApi.list });
  const { data: users }              = useQuery({ queryKey: ["users"],      queryFn: usersApi.list, enabled: isAdmin });

  // ── تعبئة الفورم تلقائياً ببيانات الشحنة الحالية (وضع التعديل) ──
  useEffect(() => {
    if (isEditMode && existingShipment && !prefilledRef.current) {
      const s = existingShipment as any;
      setForm({
        clientId:        s.clientId != null ? String(s.clientId) : "",
        senderName:      s.senderName ?? "",
        senderPhone:     s.senderPhone ?? "",
        senderPhone2:    s.senderPhone2 ?? "",
        senderCity:      s.senderCity ?? "",
        receiverName:    s.receiverName ?? "",
        receiverPhone:   s.receiverPhone ?? "",
        receiverPhone2:  s.receiverPhone2 ?? "",
        receiverAddress: s.receiverAddress ?? "",
        receiverCity:    s.receiverCity ?? "",
        zoneId:          s.zoneId != null ? String(s.zoneId) : "",
        parcelType:      (s.parcelType ?? "") as ParcelType | "",
        weight:          s.weight != null ? String(s.weight) : "",
        pieces:          s.pieces != null ? String(s.pieces) : "1",
        description:     s.description ?? "",
        paymentMethod:   (s.paymentMethod ?? "cod") as PaymentMethod,
        codAmount:       s.totalAmount != null ? String(s.totalAmount) : (s.codAmount != null ? String(s.codAmount) : ""),
        notes:           s.notes ?? "",
        adSource:        s.adSource ?? "",
        adCampaign:      s.adCampaign ?? "",
        warehouseId:     s.warehouseId != null ? String(s.warehouseId) : "",
        assignedUserId:  s.assignedUserId != null ? String(s.assignedUserId) : "",
        shippingCompanyId: s.shippingCompanyId != null ? String(s.shippingCompanyId) : "",
        canOpen:         s.canOpen != null ? String(s.canOpen) : "",
        isDivisible:     s.isDivisible != null ? String(s.isDivisible) : "",
        rejectionPolicy: s.rejectionPolicy ?? "",
      });
      prefilledRef.current = true;
    }
  }, [isEditMode, existingShipment]);

  // كل مناطق التوصيل — محافظة - منطقة (فلترة حسب محافظة الراسل "من"، بدون تكرار لنفس الاسم)
  // ملحوظة مهمة: ممكن يكون فيه أكتر من zone بنفس toGovernorate/name لكن fromGovernorate
  // مختلفة (مثال: "داخل الاسكندرية" من الاسكندرية سعرها 65، ونفس الاسم من القاهرة سعرها
  // 85) — لازم نفلتر على أساس محافظة الراسل (senderCity) الأول عشان ناخد السعر الصح،
  // ولو مفيش senderCity محدد أو مفيش zones تطابقها، نرجع لكل المناطق كـ fallback.
  const toGovernorates = useMemo(() => {
    const activeZones = zones.filter(z => z.isActive !== false);
    const senderGov = form.senderCity?.trim() || "";
    // توحيد الهمزات/التاء المربوطة والهاء عشان "الاسكندرية" و"الاسكندريه" يتطابقوا
    const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase().replace(/ة/g, "ه").replace(/[أإآ]/g, "ا");
    const matchingSenderZones = senderGov
      ? activeZones.filter(z => normalize(z.fromGovernorate || "") === normalize(senderGov))
      : [];
    // لو فيه مناطق مطابقة لمحافظة الراسل بالظبط، نستخدمها فقط. غير كده (مفيش senderCity
    // أو مفيش zones لمحافظته) نرجع لعرض كل المناطق كـ fallback عشان الفورم يفضل شغال.
    const source = matchingSenderZones.length ? matchingSenderZones : activeZones;
    const seen = new Set<string>();
    return source
      .map(z => {
        const gov = z.toGovernorate?.trim() || "";
        const area = z.name?.trim() || "";
        const label = gov && area ? `${gov} - ${area}` : (gov || area);
        return { label, zone: z };
      })
      .filter(x => x.label)
      .filter(x => {
        const key = x.label.replace(/\s+/g, " ").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [zones, form.senderCity]);

  const selectedZone    = zones.find(z => String(z.id) === form.zoneId);
  const selectedPricing = parcelPricing.find(p => p.parcelType === form.parcelType);
  const zonePrice       = Number(selectedZone?.price) || 0;
  const parcelPrice     = Number(selectedPricing?.basePrice) || 0;
  const shippingFee     = zonePrice + parcelPrice;
  // المستخدم بيدخل "سعر الشحنة" (الإجمالي)، ومبلغ COD الفعلي = الإجمالي ناقص رسوم الشحن
  const total           = Number(form.codAmount) || 0;
  const cod             = form.paymentMethod === "cod" ? (total - shippingFee) : total;

  const mutation = useMutation({
    mutationFn: (data: any) => isEditMode
      ? apiFetch(`/shipments/${editId}`, { method: "PATCH", body: JSON.stringify(data) })
      : apiFetch("/shipments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      if (isEditMode) {
        qc.invalidateQueries({ queryKey: ["shipment-detail", editId] });
        toast({ title: "تم حفظ التعديلات بنجاح ✅" });
        navigate(`/shipments/${editId}`);
      } else {
        toast({ title: "تم إنشاء الشحنة بنجاح ✅" });
        navigate("/shipments-list");
      }
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.senderName || !form.receiverName) {
      toast({ title: "الحقول المطلوبة", description: "اسم الراسل واسم المستلم مطلوبان", variant: "destructive" });
      return;
    }
    if (!form.warehouseId) {
      toast({ title: "المخزن مطلوب", description: "من فضلك اختر المخزن الذي ستُودَع فيه الشحنة", variant: "destructive" });
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
      weight:          form.weight    || undefined,
      pieces:          isEditMode ? undefined : (Number(form.pieces) || 1),
      description:     isEditMode ? undefined : (form.description || undefined),
      paymentMethod:   form.paymentMethod,
      codAmount:       cod || undefined,
      shippingFee:     shippingFee || undefined,
      totalAmount:     total || undefined,
      notes:           form.notes || undefined,
      adSource:        form.adSource || undefined,
      adCampaign:      form.adCampaign || undefined,
      warehouseId:     form.warehouseId ? Number(form.warehouseId) : undefined,
      assignedUserId:  form.assignedUserId ? Number(form.assignedUserId) : undefined,
      shippingCompanyId: form.shippingCompanyId ? Number(form.shippingCompanyId) : undefined,
      canOpen:         form.canOpen     !== "" ? Number(form.canOpen)     : undefined,
      isDivisible:     form.isDivisible !== "" ? Number(form.isDivisible) : undefined,
      rejectionPolicy: form.rejectionPolicy || undefined,
      ...(isEditMode ? {} : { status: "waiting" }),
    });
  }

  if (isEditMode && isLoadingShipment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate(isEditMode ? `/shipments/${editId}` : "/shipments-list")} className="p-2 rounded-lg hover:bg-muted/60 transition-colors">
          <ArrowRight className="w-4 h-4" />
        </button>
        <Package className="w-5 h-5 text-primary" />
        <h1 className="text-base font-black">{isEditMode ? "تعديل الشحنة" : "شحنة جديدة"}</h1>
      </div>

      {/* Form + Sidebar */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ── يمين: الفورم ── */}
          <div className="lg:col-span-2 space-y-8">

        {/* بيانات المرسل */}
        <section className="space-y-4">
          <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
            <User className="w-3.5 h-3.5" /> بيانات المرسل / العميل
          </h3>
          <div>
            <Label className="text-xs font-bold mb-1.5 block">العميل التجاري (اختياري)</Label>
            <Popover open={clientOpen} onOpenChange={setClientOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={clientOpen}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {(() => {
                    const c = clients.find(x => String(x.id) === form.clientId);
                    if (!c) return <span className="flex items-center gap-2 text-muted-foreground"><User className="w-3.5 h-3.5" />اختر العميل...</span>;
                    return (
                      <span className="flex items-center gap-2">
                        <ClientAvatar avatar={c.avatar} name={c.name} className="w-5 h-5 text-[9px]" />
                        <span className="text-xs font-bold">{c.name}</span>
                      </span>
                    );
                  })()}
                  <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start" side="bottom" sideOffset={4} avoidCollisions={false}>
                <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                  <CommandInput placeholder="ابحث بالاسم أو المحافظة/المدينة..." className="text-sm" />
                  <CommandList className="max-h-[260px]">
                    <CommandEmpty className="text-xs text-muted-foreground py-4">لا يوجد عميل بهذا الاسم</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__ بدون عميل"
                        onSelect={() => { setForm(f => ({ ...f, clientId: "", senderName: "", senderPhone: "", senderPhone2: "", senderCity: "" })); setClientOpen(false); }}
                        className="text-sm"
                      >
                        <span className="text-muted-foreground text-xs">— بدون عميل —</span>
                      </CommandItem>
                      {clients.filter(c => c.name).map(c => {
                        const gov = c.region || c.city || c.governorate || "";
                        return (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${gov} ${c.phone || ""}`}
                            onSelect={() => {
                              // تصفير المنطقة المختارة سابقًا لو موجودة، لأن المناطق المتاحة بتتغيّر
                              // حسب محافظة الراسل (senderCity) — منطقة العميل القديم ممكن تبقى غلط
                              // أو غير موجودة أصلًا لمحافظة العميل الجديد.
                              setForm(f => ({ ...f, clientId: String(c.id), senderName: c.name, senderPhone: c.phone || "", senderPhone2: c.phone2 || "", senderCity: gov, zoneId: "", warehouseId: c.warehouseId ? String(c.warehouseId) : f.warehouseId, adSource: c.defaultAdSource || f.adSource }));
                              setClientOpen(false);
                            }}
                            className="text-sm flex items-center justify-between gap-3"
                          >
                            <span className="flex items-center gap-2">
                              <Check className={`w-3.5 h-3.5 shrink-0 ${form.clientId === String(c.id) ? "opacity-100 text-primary" : "opacity-0"}`} />
                              <ClientAvatar avatar={c.avatar} name={c.name} className="w-6 h-6 text-[10px]" />
                              <div className="flex flex-col">
                                <span className="text-xs font-bold">{c.name}</span>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  {c.phone && <span>{c.phone}</span>}
                                  {c.phone && gov && <span>·</span>}
                                  {gov && <span className="text-primary/70">{gov}</span>}
                                </span>
                              </div>
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.clientId && <p className="text-[10px] text-primary mt-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />تم تعبئة بيانات المرسل تلقائياً</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs font-bold mb-1.5 block">اسم الراسل <span className="text-red-500">*</span></Label><Input className="text-sm" placeholder="الاسم الكامل" value={form.senderName} onChange={e => set("senderName", e.target.value)} /></div>
            <div><Label className="text-xs font-bold mb-1.5 block">رقم الهاتف</Label><Input className="text-sm" placeholder="01XXXXXXXXX" value={form.senderPhone} onChange={e => set("senderPhone", e.target.value)} /></div>
            <div><Label className="text-xs font-bold mb-1.5 block">هاتف 2</Label><Input className="text-sm" placeholder="رقم بديل" value={form.senderPhone2} onChange={e => set("senderPhone2", e.target.value)} /></div>
            <div><Label className="text-xs font-bold mb-1.5 block">المحافظة</Label><Input className="text-sm" placeholder="محافظة المرسل" value={form.senderCity} onChange={e => set("senderCity", e.target.value)} /></div>
          </div>
        </section>

        {/* بيانات المستلم */}
        <section className="space-y-4">
          <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
            <MapPin className="w-3.5 h-3.5" /> بيانات المستلم والعنوان
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs font-bold mb-1.5 block">اسم المستلم <span className="text-red-500">*</span></Label><Input className="text-sm" placeholder="الاسم الكامل" value={form.receiverName} onChange={e => set("receiverName", e.target.value)} /></div>
            <div><Label className="text-xs font-bold mb-1.5 block">رقم الهاتف</Label><Input className="text-sm" placeholder="01XXXXXXXXX" value={form.receiverPhone} onChange={e => set("receiverPhone", e.target.value)} /></div>
            <div><Label className="text-xs font-bold mb-1.5 block">هاتف 2</Label><Input className="text-sm" placeholder="رقم بديل" value={form.receiverPhone2} onChange={e => set("receiverPhone2", e.target.value)} /></div>
            <div>
              <Label className="text-xs font-bold mb-1.5 block">المنطقة / المدينة</Label>
              <Popover open={govOpen} onOpenChange={setGovOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={govOpen}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <span className={selectedZone ? "" : "text-muted-foreground"}>
                      {selectedZone ? (toGovernorates.find(g => g.zone.id === selectedZone.id)?.label ?? selectedZone.name) : "اختر المحافظة / المنطقة..."}
                    </span>
                    <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start" side="bottom" sideOffset={4} avoidCollisions={false}>
                  <Command>
                    <CommandInput placeholder="ابحث عن المحافظة..." className="text-sm" />
                    <CommandList className="max-h-[260px]">
                      <CommandEmpty className="text-xs text-muted-foreground py-4">لا توجد محافظة بهذا الاسم</CommandEmpty>
                      <CommandGroup>
                        {toGovernorates.map(({ label, zone }) => (
                          <CommandItem
                            key={zone.id}
                            value={label}
                            onSelect={() => { set("zoneId", String(zone.id)); setGovOpen(false); }}
                            className="text-sm flex items-center justify-between gap-3"
                          >
                            <span className="flex items-center gap-2">
                              <Check className={`w-3.5 h-3.5 shrink-0 ${form.zoneId === String(zone.id) ? "opacity-100 text-primary" : "opacity-0"}`} />
                              {label}
                            </span>
                            <span className="text-xs text-muted-foreground font-bold">{fc(zone.price)}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedZone && <p className="text-[10px] text-primary mt-1">سعر التوصيل: {fc(selectedZone.price)}</p>}
            </div>
            <div className="sm:col-span-2"><Label className="text-xs font-bold mb-1.5 block">العنوان التفصيلي</Label><Input className="text-sm" placeholder="الشارع، المبنى، الشقة..." value={form.receiverAddress} onChange={e => set("receiverAddress", e.target.value)} /></div>
          </div>
        </section>

        {/* تفاصيل الشحنة */}
        <section className="space-y-4">
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
              {selectedPricing && <p className="text-[10px] text-primary mt-1">سعر النوع: {fc(selectedPricing.basePrice)}</p>}
            </div>
            <div><Label className="text-xs font-bold mb-1.5 block">الوزن (كجم)</Label><Input type="number" className="text-sm" placeholder="0.00" value={form.weight} onChange={e => set("weight", e.target.value)} /></div>

            <div>
              <Label className="text-xs font-bold mb-1.5 block">حالة الشحنة (الفتح)</Label>
              <Select value={form.canOpen} onValueChange={v => set("canOpen", v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="اختر..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      مسموح بفتح الشحنة
                    </span>
                  </SelectItem>
                  <SelectItem value="0">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                      غير مسموح بفتح الشحنة
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold mb-1.5 block">تجزئة الشحنة</Label>
              <Select value={form.isDivisible} onValueChange={v => set("isDivisible", v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="اختر..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                      الشحنة قابلة للتجزئة
                    </span>
                  </SelectItem>
                  <SelectItem value="0">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                      الشحنة غير قابلة للتجزئة
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold mb-1.5 block">حالة الرفض</Label>
              <Select value={form.rejectionPolicy} onValueChange={v => set("rejectionPolicy", v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="اختر..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_fee">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                      يتم دفع مبلغ الشحن كاملا
                    </span>
                  </SelectItem>
                  <SelectItem value="free">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      الشحن مجانا
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
        </section>

        {/* البيانات المالية */}
        <section className="space-y-4">
          <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
            <CreditCard className="w-3.5 h-3.5" /> البيانات المالية
          </h3>
          <div>
            <Label className="text-xs font-bold mb-2 block">طريقة الدفع</Label>
            <div className="flex flex-wrap gap-2">
              {(["cod","prepaid","deferred"] as PaymentMethod[]).map(m => (
                <button key={m} type="button" onClick={() => set("paymentMethod", m)}
                  className={`flex-1 min-w-[120px] px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${form.paymentMethod === m ? PAYMENT_COLORS[m] + " ring-2 ring-offset-1 ring-current/30" : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"}`}>
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {form.paymentMethod === "cod" && (
              <div>
                <Label className="text-xs font-bold mb-1.5 block">سعر الشحنة</Label>
                <Input type="number" className="text-sm" placeholder="0" value={form.codAmount} onChange={e => set("codAmount", e.target.value)} />
              </div>
            )}
          </div>
        </section>

        {/* ملاحظات */}
        <div><Label className="text-xs font-bold mb-1.5 block">ملاحظات</Label><Input className="text-sm" placeholder="أي تعليمات خاصة..." value={form.notes} onChange={e => set("notes", e.target.value)} /></div>

        {/* المخزن */}
        <section className="space-y-4 rounded-xl border border-teal-900/40 bg-teal-900/5 p-4">
          <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
            <Warehouse className="w-3.5 h-3.5 text-teal-400" /> المخزن
          </h3>
          <div>
            <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1"><Warehouse className="w-3 h-3" /> اختر المخزن <span className="text-red-500">*</span></Label>
            <Select value={form.warehouseId || "none"} onValueChange={v => set("warehouseId", v === "none" ? "" : v)}>
              <SelectTrigger className="text-sm h-10 bg-card">
                <div className="flex items-center gap-2">
                  <Warehouse className="w-3.5 h-3.5 text-teal-400" />
                  <SelectValue placeholder="اختر المخزن الذي ستُودَع فيه الشحنة..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— غير محدد —</SelectItem>
                {(warehouses as any[])?.map((w: any) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    <div className="flex items-center gap-2">
                      <Warehouse className="w-3 h-3 text-teal-400" />
                      <span>{w.name}{w.city ? ` — ${w.city}` : ""}{w.isDefault ? " ★" : ""}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!form.warehouseId && <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">⚠ اختر المخزن لتحديد مكان الشحنة</p>}
            {form.warehouseId && <p className="text-[10px] text-teal-400 mt-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />الشحنة ستُودَع في هذا المخزن عند الاستلام</p>}
          </div>
        </section>

        {/* تتبع الإعلان والفريق */}
        <section className="space-y-4 rounded-xl border border-purple-900/40 bg-purple-900/5 p-4">
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
              <Input className="text-sm h-10 bg-card" placeholder="Summer 2025..." value={form.adCampaign} onChange={e => set("adCampaign", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-bold mb-1.5 block flex items-center gap-1"><UserCheck className="w-3 h-3" /> الراسل</Label>
              <Popover open={clientOpen2} onOpenChange={setClientOpen2}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={clientOpen2}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {(() => {
                      const c = clients.find(x => String(x.id) === form.clientId);
                      if (!c) return <span className="text-muted-foreground">اختر العميل التجاري</span>;
                      return (
                        <span className="flex items-center gap-2">
                          <ClientAvatar avatar={c.avatar} name={c.name} className="w-5 h-5 text-[9px]" />
                          <span className="text-xs font-bold">{c.name}</span>
                        </span>
                      );
                    })()}
                    <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start" side="bottom" sideOffset={4} avoidCollisions={false}>
                  <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                    <CommandInput placeholder="ابحث بالاسم أو المحافظة/المدينة..." className="text-sm" />
                    <CommandList className="max-h-[260px]">
                      <CommandEmpty className="text-xs text-muted-foreground py-4">لا يوجد عميل بهذا الاسم</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="none __none__ غير محدد"
                          onSelect={() => { setForm(f => ({ ...f, clientId: "" })); setClientOpen2(false); }}
                          className="text-sm"
                        >
                          — غير محدد —
                        </CommandItem>
                        {clients.filter(c => c.name).map(c => {
                          const gov = c.region || c.city || c.governorate || "";
                          return (
                            <CommandItem
                              key={c.id}
                              value={`${c.name} ${gov} ${c.phone || ""}`}
                              onSelect={() => {
                                setForm(f => ({ ...f, clientId: String(c.id), senderName: c.name, senderPhone: c.phone || "", senderPhone2: c.phone2 || "", senderCity: gov, zoneId: "", warehouseId: c.warehouseId ? String(c.warehouseId) : f.warehouseId, adSource: c.defaultAdSource || f.adSource }));
                                setClientOpen2(false);
                              }}
                              className="text-sm flex items-center gap-2"
                            >
                              <Check className={`w-3.5 h-3.5 shrink-0 ${form.clientId === String(c.id) ? "opacity-100 text-primary" : "opacity-0"}`} />
                              <ClientAvatar avatar={c.avatar} name={c.name} className="w-6 h-6 text-[10px]" />
                              <span className="text-xs font-bold">{c.name}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </section>

          </div>{/* end col-span-2 */}

          {/* ── شمال: sticky card ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 rounded-2xl border border-primary/20 bg-card shadow-lg overflow-hidden">
              {/* عنوان الكارت */}
              <div className="bg-primary/5 border-b border-primary/10 px-5 py-4">
                <h3 className="text-sm font-black text-primary flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> ملخص التكاليف
                </h3>
              </div>

              {/* التفاصيل */}
              <div className="px-5 py-4 space-y-3">
                {[
                  { label: "سعر منطقة التوصيل", value: fc(zonePrice) },
                  { label: "إضافة نوع الشحنة",  value: fc(parcelPrice) },
                  form.paymentMethod === "cod" ? { label: "مبلغ COD", value: fc(cod), highlight: true } : null,
                  form.paymentMethod === "cod" ? { label: "رسوم الشحن (تُخصم)", value: `- ${fc(shippingFee)}`, negative: true } : null,
                ].filter(Boolean).map((row: any, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`font-bold ${row.negative ? "text-red-500 dark:text-red-400" : row.highlight ? "text-amber-500 dark:text-amber-400" : "text-foreground"}`}>{row.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-primary/20 pt-3 mt-1">
                  <span className="text-sm font-black">الإجمالي</span>
                  <span className="text-lg font-black text-primary">{fc(total)}</span>
                </div>
              </div>

              {/* الأزرار */}
              <div className="px-5 pb-5 space-y-2">
                <Button onClick={handleSubmit} disabled={mutation.isPending} className="w-full gap-2">
                  {mutation.isPending
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : isEditMode ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {isEditMode ? "حفظ التعديلات" : "إنشاء الشحنة"}
                </Button>
                <Button variant="outline" onClick={() => navigate(isEditMode ? `/shipments/${editId}` : "/orders")} className="w-full">إلغاء</Button>
              </div>
            </div>
          </div>

        </div>{/* end grid */}
      </div>
    </div>
  );
}
