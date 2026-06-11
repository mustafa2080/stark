import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Plus, Package, User, MapPin, Boxes, CreditCard, RefreshCw, ArrowRight } from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

type PaymentMethod = "cod" | "prepaid" | "deferred";
type ParcelType    = "document" | "normal" | "fragile" | "heavy" | "electronics" | "clothing" | "food" | "other";

interface ShipmentZone        { id: number; name: string; governorate?: string; price: number; isActive?: boolean }
interface ParcelTypePricing   { id: number; parcelType: string; label?: string; basePrice: number; isActive?: boolean }
interface ShipmentClient      { id: number; name: string; phone?: string; phone2?: string; city?: string }

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

export default function NewShipmentPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    clientId: "",
    senderName: "", senderPhone: "", senderPhone2: "", senderCity: "",
    receiverName: "", receiverPhone: "", receiverPhone2: "", receiverAddress: "", receiverCity: "",
    zoneId: "", parcelType: "" as ParcelType | "",
    weight: "", pieces: "1", description: "", declaredValue: "",
    paymentMethod: "cod" as PaymentMethod,
    codAmount: "", insuranceFee: "0", notes: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data: zones = [] }         = useQuery<ShipmentZone[]>({ queryKey: ["shipment-zones"],        queryFn: () => apiFetch("/shipments/zones") });
  const { data: parcelPricing = [] } = useQuery<ParcelTypePricing[]>({ queryKey: ["parcel-pricing"],   queryFn: () => apiFetch("/shipments/parcel-pricing") });
  const { data: clients = [] }       = useQuery<ShipmentClient[]>({ queryKey: ["clients-list-basic"],  queryFn: () => apiFetch<any[]>("/finance/clients").then(d => (d || []).filter((c: any) => c && typeof c.name === "string" && c.name.trim() !== "")) });

  const selectedZone    = zones.find(z => String(z.id) === form.zoneId);
  const selectedPricing = parcelPricing.find(p => p.parcelType === form.parcelType);
  const zonePrice       = Number(selectedZone?.price) || 0;
  const parcelPrice     = Number(selectedPricing?.basePrice) || 0;
  const shippingFee     = zonePrice + parcelPrice;
  const insurance       = Number(form.insuranceFee) || 0;
  const cod             = Number(form.codAmount) || 0;
  const total           = (form.paymentMethod === "cod" ? cod : 0) + shippingFee + insurance;

  const mutation = useMutation({
    mutationFn: (data: any) => apiFetch("/shipments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      toast({ title: "تم إنشاء الشحنة بنجاح ✅" });
      navigate("/orders");
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
      weight:          form.weight    || undefined,
      pieces:          Number(form.pieces) || 1,
      description:     form.description || undefined,
      declaredValue:   form.declaredValue || undefined,
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
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate("/orders")} className="p-2 rounded-lg hover:bg-muted/60 transition-colors">
          <ArrowRight className="w-4 h-4" />
        </button>
        <Package className="w-5 h-5 text-primary" />
        <h1 className="text-base font-black">شحنة جديدة</h1>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* بيانات المرسل */}
        <section className="space-y-4">
          <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
            <User className="w-3.5 h-3.5" /> بيانات المرسل / العميل
          </h3>
          <div>
            <Label className="text-xs font-bold mb-1.5 block">العميل التجاري (اختياري)</Label>
            <Select value={form.clientId || "__none__"} onValueChange={v => {
              if (v === "__none__") { setForm(f => ({ ...f, clientId: "", senderName: "", senderPhone: "", senderPhone2: "", senderCity: "" })); return; }
              const c = clients.find(x => String(x.id) === v);
              if (c) setForm(f => ({ ...f, clientId: String(c.id), senderName: c.name, senderPhone: c.phone || "", senderPhone2: c.phone2 || "", senderCity: c.city || "" }));
            }}>
              <SelectTrigger className="text-sm h-10"><div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-muted-foreground" /><SelectValue placeholder="اختر العميل..." /></div></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__"><span className="text-muted-foreground text-xs">— بدون عميل —</span></SelectItem>
                {clients.filter(c => c.name).map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">{(c.name || "؟").charAt(0)}</div>
                      <div className="flex flex-col"><span className="text-xs font-bold">{c.name}</span>{c.phone && <span className="text-[10px] text-muted-foreground">{c.phone}</span>}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.clientId && <p className="text-[10px] text-primary mt-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />تم تعبئة بيانات المرسل تلقائياً</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs font-bold mb-1.5 block">اسم المرسل <span className="text-red-500">*</span></Label><Input className="text-sm" placeholder="الاسم الكامل" value={form.senderName} onChange={e => set("senderName", e.target.value)} /></div>
            <div><Label className="text-xs font-bold mb-1.5 block">رقم الهاتف</Label><Input className="text-sm" placeholder="01XXXXXXXXX" value={form.senderPhone} onChange={e => set("senderPhone", e.target.value)} /></div>
            <div><Label className="text-xs font-bold mb-1.5 block">هاتف 2</Label><Input className="text-sm" placeholder="رقم بديل" value={form.senderPhone2} onChange={e => set("senderPhone2", e.target.value)} /></div>
            <div><Label className="text-xs font-bold mb-1.5 block">المدينة</Label><Input className="text-sm" placeholder="مدينة المرسل" value={form.senderCity} onChange={e => set("senderCity", e.target.value)} /></div>
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
            <div><Label className="text-xs font-bold mb-1.5 block">عدد القطع</Label><Input type="number" min="1" className="text-sm" value={form.pieces} onChange={e => set("pieces", e.target.value)} /></div>
            <div><Label className="text-xs font-bold mb-1.5 block">القيمة المعلنة (جنيه)</Label><Input type="number" className="text-sm" placeholder="0" value={form.declaredValue} onChange={e => set("declaredValue", e.target.value)} /></div>
            <div className="sm:col-span-2"><Label className="text-xs font-bold mb-1.5 block">وصف الشحنة</Label><Input className="text-sm" placeholder="محتوى الشحنة..." value={form.description} onChange={e => set("description", e.target.value)} /></div>
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
              <div><Label className="text-xs font-bold mb-1.5 block">مبلغ التحصيل (COD)</Label><Input type="number" className="text-sm" placeholder="0" value={form.codAmount} onChange={e => set("codAmount", e.target.value)} /></div>
            )}
            <div><Label className="text-xs font-bold mb-1.5 block">رسوم التأمين</Label><Input type="number" className="text-sm" placeholder="0" value={form.insuranceFee} onChange={e => set("insuranceFee", e.target.value)} /></div>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <h4 className="text-xs font-black text-primary">ملخص التكاليف</h4>
            <div className="space-y-1.5">
              {[
                { label: "سعر منطقة التوصيل", value: fc(zonePrice) },
                { label: "إضافة نوع الشحنة",  value: fc(parcelPrice) },
                { label: "رسوم التأمين",       value: fc(insurance) },
                form.paymentMethod === "cod" ? { label: "مبلغ التحصيل (COD)", value: fc(cod), highlight: true } : null,
              ].filter(Boolean).map((row: any, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className={`font-bold ${row.highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>{row.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-black border-t border-primary/20 pt-2 mt-1">
                <span>الإجمالي</span>
                <span className="text-primary">{fc(total)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ملاحظات */}
        <div><Label className="text-xs font-bold mb-1.5 block">ملاحظات</Label><Input className="text-sm" placeholder="أي تعليمات خاصة..." value={form.notes} onChange={e => set("notes", e.target.value)} /></div>

        {/* أزرار */}
        <div className="flex gap-3 pt-2 border-t border-border pb-10">
          <Button variant="outline" onClick={() => navigate("/orders")} className="flex-1">إلغاء</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} className="flex-1 gap-2">
            {mutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إنشاء الشحنة
          </Button>
        </div>

      </div>
    </div>
  );
}
