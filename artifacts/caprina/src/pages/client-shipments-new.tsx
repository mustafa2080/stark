import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Boxes, CreditCard, PackagePlus, RefreshCw, Save, Truck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PaymentMethod = "cod" | "prepaid" | "deferred";
type ParcelType = "document" | "normal" | "fragile" | "heavy" | "electronics" | "clothing" | "food" | "other";

interface ShipmentZone {
  id: number;
  name: string;
  toGovernorate?: string;
  price: number;
  isActive?: boolean;
}

interface ParcelTypePricing {
  id: number;
  parcelType: string;
  label?: string;
  basePrice: number;
  isActive?: boolean;
}

const PARCEL_LABELS: Record<string, string> = {
  document: "مستندات",
  normal: "عادي",
  fragile: "قابل للكسر",
  heavy: "ثقيل",
  electronics: "إلكترونيات",
  clothing: "ملابس",
  food: "طعام",
  other: "أخرى",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cod: "الدفع عند الاستلام (COD)",
  prepaid: "مدفوع مسبقاً",
  deferred: "آجل",
};

const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

export default function ClientShipmentsNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    receiverName: "",
    receiverPhone: "",
    receiverPhone2: "",
    receiverAddress: "",
    zoneId: "",
    parcelType: "" as ParcelType | "",
    weight: "",
    paymentMethod: "cod" as PaymentMethod,
    totalAmount: "",
    shippingFee: "",
    canOpen: "",
    isDivisible: "",
    rejectionPolicy: "",
    notes: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: zones = [] } = useQuery<ShipmentZone[]>({
    queryKey: ["client-shipment-zones"],
    queryFn: () => apiFetch("/shipments/zones"),
  });
  const { data: parcelPricing = [] } = useQuery<ParcelTypePricing[]>({
    queryKey: ["client-parcel-pricing"],
    queryFn: () => apiFetch("/shipments/parcel-pricing"),
  });

  const activeZones = useMemo(
    () => zones.filter((z) => z.isActive !== false),
    [zones]
  );
  const activeParcelPricing = useMemo(
    () => parcelPricing.filter((p) => p.isActive !== false),
    [parcelPricing]
  );

  const selectedZone = activeZones.find((z) => String(z.id) === form.zoneId);
  const selectedPricing = activeParcelPricing.find((p) => p.parcelType === form.parcelType);
  const zonePrice = Number(selectedZone?.price) || 0;
  const parcelPrice = Number(selectedPricing?.basePrice) || 0;
  const shippingFee = Number(form.shippingFee) || 0;
  const totalAmount = Number(form.totalAmount) || 0;
  const codAmount = form.paymentMethod === "cod" ? Math.max(0, totalAmount - shippingFee) : totalAmount;

  const mutation = useMutation({
    mutationFn: (data: any) => apiFetch("/client-portal/shipments", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-shipments"] });
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
      toast({ title: "تم إنشاء الشحنة بنجاح ✅" });
      navigate("/client-shipments");
    },
    onError: (e: any) => {
      toast({
        title: "خطأ",
        description: e?.message ?? "حدث خطأ أثناء إنشاء الشحنة",
        variant: "destructive",
      });
    },
  });

  function handleSubmit() {
    if (!form.receiverName || !form.receiverPhone || !form.receiverAddress || !form.zoneId || !form.parcelType) {
      toast({
        title: "الحقول المطلوبة",
        description: "اسم المستلم، رقم الهاتف، المنطقة، العنوان، ونوع الشحنة مطلوبة",
        variant: "destructive",
      });
      return;
    }

    mutation.mutate({
      receiverName: form.receiverName,
      receiverPhone: form.receiverPhone,
      receiverPhone2: form.receiverPhone2 || undefined,
      receiverAddress: form.receiverAddress,
      zoneId: Number(form.zoneId),
      zonePrice: zonePrice || undefined,
      parcelType: form.parcelType,
      parcelTypePrice: parcelPrice || undefined,
      weight: form.weight || undefined,
      paymentMethod: form.paymentMethod,
      totalAmount,
      shippingFee,
      codAmount: form.paymentMethod === "cod" ? codAmount : totalAmount,
      canOpen: form.canOpen !== "" ? Number(form.canOpen) : undefined,
      isDivisible: form.isDivisible !== "" ? Number(form.isDivisible) : undefined,
      rejectionPolicy: form.rejectionPolicy || undefined,
      notes: form.notes || undefined,
      status: "waiting",
    });
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate("/client-shipments")} className="p-2 rounded-lg hover:bg-muted/60 transition-colors">
          <ArrowRight className="w-4 h-4" />
        </button>
        <PackagePlus className="w-5 h-5 text-primary" />
        <h1 className="text-base font-black">إنشاء شحنة جديدة</h1>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
                <Truck className="w-3.5 h-3.5" /> بيانات المستلم
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs font-bold mb-1.5 block">اسم المستلم <span className="text-red-500">*</span></Label>
                  <Input className="text-sm" placeholder="الاسم الكامل" value={form.receiverName} onChange={(e) => set("receiverName", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">رقم الهاتف <span className="text-red-500">*</span></Label>
                  <Input className="text-sm" placeholder="01XXXXXXXXX" value={form.receiverPhone} onChange={(e) => set("receiverPhone", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">هاتف 2</Label>
                  <Input className="text-sm" placeholder="رقم بديل" value={form.receiverPhone2} onChange={(e) => set("receiverPhone2", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">المنطقة / المدينة <span className="text-red-500">*</span></Label>
                  <Select value={form.zoneId} onValueChange={(v) => set("zoneId", v)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="اختر المنطقة..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeZones.map((zone) => (
                        <SelectItem key={zone.id} value={String(zone.id)}>
                          <div className="flex items-center justify-between gap-4 w-full">
                            <span>{zone.toGovernorate ? `${zone.toGovernorate} - ${zone.name}` : zone.name}</span>
                            <span className="text-xs text-muted-foreground font-bold">{fc(zone.price)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedZone && <p className="text-[10px] text-primary mt-1">سعر المنطقة: {fc(selectedZone.price)}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs font-bold mb-1.5 block">العنوان التفصيلي <span className="text-red-500">*</span></Label>
                  <Input className="text-sm" placeholder="الشارع، المبنى، الدور، الشقة..." value={form.receiverAddress} onChange={(e) => set("receiverAddress", e.target.value)} />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 border-b border-border pb-2">
                <Boxes className="w-3.5 h-3.5" /> تفاصيل الشحنة
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">نوع الشحنة <span className="text-red-500">*</span></Label>
                  <Select value={form.parcelType} onValueChange={(v) => set("parcelType", v as ParcelType)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="اختر نوع الشحنة..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeParcelPricing.map((p) => (
                        <SelectItem key={p.id} value={p.parcelType}>
                          <div className="flex items-center justify-between gap-4 w-full">
                            <span>{p.label || PARCEL_LABELS[p.parcelType] || p.parcelType}</span>
                            <span className="text-xs text-muted-foreground font-bold">{fc(p.basePrice)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedPricing && <p className="text-[10px] text-primary mt-1">سعر النوع: {fc(selectedPricing.basePrice)}</p>}
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">الوزن (كجم)</Label>
                  <Input type="number" className="text-sm" placeholder="0.00" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">حالة الشحنة</Label>
                  <Select value={form.canOpen} onValueChange={(v) => set("canOpen", v)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="اختر..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">مسموح بفتح الشحنة</SelectItem>
                      <SelectItem value="0">غير مسموح بفتح الشحنة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">تجزئة الشحنة</Label>
                  <Select value={form.isDivisible} onValueChange={(v) => set("isDivisible", v)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="اختر..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">الشحنة قابلة للتجزئة</SelectItem>
                      <SelectItem value="0">الشحنة غير قابلة للتجزئة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">حالة الرفض</Label>
                  <Select value={form.rejectionPolicy} onValueChange={(v) => set("rejectionPolicy", v)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="اختر..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_fee">يتم دفع مبلغ الشحن كاملا</SelectItem>
                      <SelectItem value="free">الشحن مجانا</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">طريقة الدفع <span className="text-red-500">*</span></Label>
                  <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v as PaymentMethod)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cod">{PAYMENT_LABELS.cod}</SelectItem>
                      <SelectItem value="prepaid">{PAYMENT_LABELS.prepaid}</SelectItem>
                      <SelectItem value="deferred">{PAYMENT_LABELS.deferred}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-20 rounded-2xl border border-primary/20 bg-card shadow-lg overflow-hidden">
              <div className="bg-primary/5 border-b border-primary/10 px-5 py-4">
                <h3 className="text-sm font-black text-primary flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> ملخص التكاليف
                </h3>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">سعر المنطقة</span>
                  <span className="font-bold text-foreground">{fc(zonePrice)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">سعر نوع الشحنة</span>
                  <span className="font-bold text-foreground">{fc(parcelPrice)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">مصاريف الشحن</span>
                  <span className="font-bold text-foreground">{fc(shippingFee)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">سعر الشحنة شامل</span>
                  <span className="font-bold text-foreground">{fc(totalAmount)}</span>
                </div>
                {form.paymentMethod === "cod" && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">مبلغ COD</span>
                    <span className="font-bold text-amber-500 dark:text-amber-400">{fc(codAmount)}</span>
                  </div>
                )}
              </div>
              <div className="px-5 pb-5 space-y-3">
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">سعر الشحنة شامل</Label>
                  <Input
                    type="number"
                    className="text-sm"
                    placeholder="0"
                    value={form.totalAmount}
                    onChange={(e) => set("totalAmount", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">المخزن</Label>
                  <Select value="none" disabled>
                    <SelectTrigger className="text-sm bg-muted/50 cursor-not-allowed opacity-70">
                      <SelectValue placeholder="يتم تحديده من الأدمن تلقائياً" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">يتم تحديده من الأدمن تلقائياً</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">ملاحظات</Label>
                  <Input
                    className="text-sm"
                    placeholder="يُحدده الأدمن"
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    disabled
                  />
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                  <Label className="text-xs font-bold block">تتبع الإعلان والفريق</Label>
                  <div>
                    <Label className="text-[11px] font-semibold mb-1.5 block text-muted-foreground">مصدر الطلب</Label>
                    <Input className="text-sm bg-background" value="يتم تحديده من الأدمن" disabled />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold mb-1.5 block text-muted-foreground">اسم الحملة</Label>
                    <Input className="text-sm bg-background" value="يتم تحديده من الأدمن" disabled />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold mb-1.5 block text-muted-foreground">الراسل</Label>
                    <Input className="text-sm bg-background" value="يتم تحديده من الأدمن" disabled />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">مصاريف الشحن</Label>
                  <Input
                    type="number"
                    className="text-sm"
                    placeholder="0"
                    value={form.shippingFee}
                    onChange={(e) => set("shippingFee", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">ملاحظات</Label>
                  <Input
                    className="text-sm"
                    placeholder="اختياري"
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </div>
                <Button onClick={handleSubmit} disabled={mutation.isPending} className="w-full gap-2">
                  {mutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  إنشاء الشحنة
                </Button>
                <Button variant="outline" onClick={() => navigate("/client-shipments")} className="w-full">
                  إلغاء
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
