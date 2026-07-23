import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Plus, Package, MapPin, Boxes, CreditCard, RefreshCw, ArrowRight, Check, ChevronsUpDown } from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

type PaymentMethod = "cod" | "prepaid" | "deferred";
type ParcelType    = "document" | "normal" | "fragile" | "heavy" | "electronics" | "clothing" | "food" | "other";

interface ShipmentZone        { id: number; name: string; fromGovernorate?: string; toGovernorate?: string; price: number; isActive?: boolean }
interface ParcelTypePricing   { id: number; parcelType: string; label?: string; basePrice: number; isActive?: boolean }

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
    receiverName: "", receiverPhone: "", receiverPhone2: "", receiverAddress: "", receiverCity: "",
    zoneId: "", parcelType: "" as ParcelType | "",
    weight: "", pieces: "1", description: "",
    paymentMethod: "cod" as PaymentMethod,
    codAmount: "", notes: "",
    canOpen: "", isDivisible: "", rejectionPolicy: "",
  });
  const [govOpen, setGovOpen] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data: zones = [] }         = useQuery<ShipmentZone[]>({ queryKey: ["shipment-zones"],      queryFn: () => apiFetch("/shipments/zones") });
  const { data: parcelPricing = [] } = useQuery<ParcelTypePricing[]>({ queryKey: ["parcel-pricing"], queryFn: () => apiFetch("/shipments/parcel-pricing") });

  // كل مناطق التوصيل — محافظة - منطقة (بدون تكرار لنفس الاسم)
  const toGovernorates = useMemo(() => {
    const seen = new Set<string>();
    return zones
      .filter(z => z.isActive !== false)
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
  }, [zones]);

  const selectedZone    = zones.find(z => String(z.id) === form.zoneId);
  const selectedPricing = parcelPricing.find(p => p.parcelType === form.parcelType);
  const zonePrice       = Number(selectedZone?.price) || 0;
  const parcelPrice     = Number(selectedPricing?.basePrice) || 0;
  const shippingFee     = zonePrice + parcelPrice;
  // المستخدم بيدخل "سعر الشحنة" (الإجمالي)، ومبلغ COD الفعلي = الإجمالي ناقص رسوم الشحن
  const total           = Number(form.codAmount) || 0;
  const cod             = form.paymentMethod === "cod" ? (total - shippingFee) : total;

  const mutation = useMutation({
    mutationFn: (data: any) => apiFetch("/client-portal/shipments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-portal-shipments-full"] });
      toast({ title: "تم إنشاء الشحنة بنجاح ✅" });
      navigate("/client-shipments");
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.receiverName) {
      toast({ title: "الحقول المطلوبة", description: "اسم المستلم مطلوب", variant: "destructive" });
      return;
    }
    mutation.mutate({
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
      paymentMethod:   form.paymentMethod,
      codAmount:       cod || undefined,
      shippingFee:     shippingFee || undefined,
      totalAmount:     total || undefined,
      notes:           form.notes || undefined,
      canOpen:         form.canOpen     !== "" ? Number(form.canOpen)     : undefined,
      isDivisible:     form.isDivisible !== "" ? Number(form.isDivisible) : undefined,
      rejectionPolicy: form.rejectionPolicy || undefined,
    });
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate("/client-shipments")} className="p-2 rounded-lg hover:bg-muted/60 transition-colors">
          <ArrowRight className="w-4 h-4" />
        </button>
        <Package className="w-5 h-5 text-primary" />
        <h1 className="text-base font-black">شحنة جديدة</h1>
      </div>

      {/* Form + Sidebar */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ── يمين: الفورم ── */}
          <div className="lg:col-span-2 space-y-8">

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
                    : <Plus className="w-4 h-4" />}
                  إنشاء الشحنة
                </Button>
                <Button variant="outline" onClick={() => navigate("/client-shipments")} className="w-full">إلغاء</Button>
              </div>
            </div>
          </div>

        </div>{/* end grid */}
      </div>
    </div>
  );
}
