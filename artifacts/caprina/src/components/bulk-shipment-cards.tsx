import { useState } from "react";
import { Plus, Trash2, Copy, ChevronDown, PackagePlus, AlertCircle, Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * كروت الشحنات المتعددة في شاشة "شحنة جديدة".
 * بيانات العميل التجاري (الراسل / المخزن / المصدر) بتفضل ثابتة فوق في الصفحة،
 * وكل كارت هنا بيمثّل شحنة واحدة فيها البيانات المتغيّرة (المستلم، المنطقة، السعر...).
 */

export type BulkPaymentMethod = "cod" | "prepaid" | "deferred";

export interface BulkShipmentDraft {
  /** معرّف محلي ثابت للـ key (مش بيروح للسيرفر) */
  uid: string;
  receiverName: string;
  receiverPhone: string;
  receiverPhone2: string;
  receiverAddress: string;
  zoneId: string;
  parcelType: string;
  weight: string;
  paymentMethod: BulkPaymentMethod;
  /** "سعر الشحنة" الإجمالي زي الفورم العادي (COD الفعلي = الإجمالي − رسوم الشحن) */
  codAmount: string;
  notes: string;
  canOpen: string;
  isDivisible: string;
  rejectionPolicy: string;
}

export interface BulkZone {
  id: number;
  name: string;
  toGovernorate?: string;
  fromGovernorate?: string;
}
export interface BulkParcelPricing {
  id: number;
  parcelType: string;
  label?: string;
  basePrice: number;
  isActive?: boolean;
}

export const emptyDraft = (): BulkShipmentDraft => ({
  uid: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
  receiverName: "", receiverPhone: "", receiverPhone2: "", receiverAddress: "",
  zoneId: "", parcelType: "", weight: "",
  paymentMethod: "cod", codAmount: "", notes: "",
  canOpen: "", isDivisible: "", rejectionPolicy: "",
});

/** أخطاء كارت واحد: اسم الحقل → رسالة */
export type DraftErrors = Partial<Record<keyof BulkShipmentDraft, string>>;

/** تحقق من شحنة واحدة (نفس شروط الفورم العادي: اسم المستلم مطلوب) */
export function validateDraft(d: BulkShipmentDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.receiverName.trim()) e.receiverName = "اسم المستلم مطلوب";
  if (d.receiverPhone.trim() && d.receiverPhone.replace(/\D/g, "").length < 8) e.receiverPhone = "رقم الهاتف غير صالح";
  if (!d.zoneId) e.zoneId = "اختر المحافظة / المنطقة";
  if (d.paymentMethod === "cod") {
    const n = Number(d.codAmount);
    if (d.codAmount.trim() === "" || !Number.isFinite(n) || n < 0) e.codAmount = "أدخل سعر الشحنة";
  }
  return e;
}

const PAYMENT_LABELS: Record<BulkPaymentMethod, string> = {
  cod: "عند الاستلام (COD)", prepaid: "مدفوع مسبقاً", deferred: "آجل",
};

const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

interface Props {
  drafts: BulkShipmentDraft[];
  onChange: (next: BulkShipmentDraft[]) => void;
  /** أخطاء التحقق لكل كارت (بنفس ترتيب drafts) — بتظهر بعد أول محاولة إنشاء */
  errors: DraftErrors[];
  showErrors: boolean;
  /** المناطق المتاحة لمحافظة الراسل الحالية (محسوبة في الصفحة) */
  zoneOptions: Array<{ label: string; zone: BulkZone }>;
  /** سعر المنطقة حسب تصنيف العميل (نفس دالة الصفحة) */
  getZonePrice: (zoneId: string) => number;
  parcelPricing: BulkParcelPricing[];
  parcelLabels: Record<string, string>;
  /** الكارت المفتوح حاليًا (للتحكم من الصفحة لما التحقق يفشل) */
  openUid: string | null;
  onOpenChange: (uid: string | null) => void;
}

export function BulkShipmentCards({
  drafts, onChange, errors, showErrors, zoneOptions, getZonePrice,
  parcelPricing, parcelLabels, openUid, onOpenChange,
}: Props) {
  const [govOpenUid, setGovOpenUid] = useState<string | null>(null);

  const patch = (uid: string, p: Partial<BulkShipmentDraft>) =>
    onChange(drafts.map(d => (d.uid === uid ? { ...d, ...p } : d)));

  const addBlank = () => {
    const nd = emptyDraft();
    onChange([...drafts, nd]);
    onOpenChange(nd.uid);
  };

  const duplicate = (uid: string) => {
    const src = drafts.find(d => d.uid === uid);
    if (!src) return;
    // بننسخ الإعدادات (المنطقة/النوع/الدفع/السياسات) ونفضّي بيانات المستلم والسعر عشان مايتكررش بالغلط
    const nd: BulkShipmentDraft = {
      ...emptyDraft(),
      zoneId: src.zoneId, parcelType: src.parcelType, paymentMethod: src.paymentMethod,
      canOpen: src.canOpen, isDivisible: src.isDivisible, rejectionPolicy: src.rejectionPolicy,
    };
    const idx = drafts.findIndex(d => d.uid === uid);
    const next = [...drafts];
    next.splice(idx + 1, 0, nd);
    onChange(next);
    onOpenChange(nd.uid);
  };

  const remove = (uid: string) => {
    if (drafts.length <= 1) return; // لازم يفضل كارت واحد على الأقل
    onChange(drafts.filter(d => d.uid !== uid));
    if (openUid === uid) onOpenChange(null);
  };

  return (
    <section className="space-y-3" data-testid="bulk-shipment-cards">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <PackagePlus className="w-3.5 h-3.5" /> الشحنات
          <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-black normal-case tracking-normal">
            {drafts.length}
          </span>
        </h3>
        <p className="text-[10px] text-muted-foreground">بيانات العميل ثابتة لكل الشحنات</p>
      </div>

      {drafts.map((d, i) => {
        const err = errors[i] ?? {};
        const errCount = Object.keys(err).length;
        const hasErr = showErrors && errCount > 0;
        const isOpen = openUid === d.uid;
        const pricing = parcelPricing.find(p => p.parcelType === d.parcelType);
        const zonePrice = d.zoneId ? getZonePrice(d.zoneId) : 0;
        const parcelPrice = Number(pricing?.basePrice) || 0;
        const shippingFee = zonePrice + parcelPrice;
        const total = Number(d.codAmount) || 0;
        const cod = d.paymentMethod === "cod" ? total - shippingFee : total;
        const zoneLabel = zoneOptions.find(z => String(z.zone.id) === d.zoneId)?.label ?? "";

        return (
          <Collapsible
            key={d.uid}
            open={isOpen}
            onOpenChange={o => onOpenChange(o ? d.uid : null)}
            className={`rounded-xl border bg-card overflow-hidden transition-colors ${hasErr ? "border-red-500/60" : "border-border"}`}
          >
            {/* ── هيدر الكارت (دايمًا ظاهر): رقم + ملخص + إجراءات ── */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex-1 min-w-0 flex items-center gap-3 text-right" aria-label={`شحنة ${i + 1}`}>
                  <span className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 ${hasErr ? "bg-red-500/15 text-red-500" : "bg-primary/15 text-primary"}`}>
                    {hasErr ? <AlertCircle className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold truncate">
                      {d.receiverName.trim() || <span className="text-muted-foreground">شحنة جديدة — لم تُملأ بعد</span>}
                    </span>
                    <span className="block text-[10px] text-muted-foreground truncate">
                      {[zoneLabel, d.receiverPhone.trim(), d.codAmount ? fc(total) : ""].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  {hasErr && <span className="text-[10px] font-bold text-red-500 shrink-0">{errCount} خطأ</span>}
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <button type="button" onClick={() => duplicate(d.uid)} title="نسخ إعدادات هذه الشحنة لشحنة جديدة"
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => remove(d.uid)} disabled={drafts.length <= 1} title="حذف الشحنة"
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ── حقول الشحنة ── */}
            <CollapsibleContent>
              <div className="p-4 space-y-4 border-t border-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold mb-1.5 block">اسم المستلم <span className="text-red-500">*</span></Label>
                    <Input className={`text-sm ${showErrors && err.receiverName ? "border-red-500" : ""}`} placeholder="الاسم الكامل"
                      value={d.receiverName} onChange={e => patch(d.uid, { receiverName: e.target.value })} />
                    {showErrors && err.receiverName && <p className="text-[10px] text-red-500 mt-1">{err.receiverName}</p>}
                  </div>
                  <div>
                    <Label className="text-xs font-bold mb-1.5 block">رقم الهاتف</Label>
                    <Input className={`text-sm ${showErrors && err.receiverPhone ? "border-red-500" : ""}`} placeholder="01XXXXXXXXX" inputMode="tel"
                      value={d.receiverPhone} onChange={e => patch(d.uid, { receiverPhone: e.target.value })} />
                    {showErrors && err.receiverPhone && <p className="text-[10px] text-red-500 mt-1">{err.receiverPhone}</p>}
                  </div>
                  <div>
                    <Label className="text-xs font-bold mb-1.5 block">هاتف 2</Label>
                    <Input className="text-sm" placeholder="رقم بديل" inputMode="tel"
                      value={d.receiverPhone2} onChange={e => patch(d.uid, { receiverPhone2: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-bold mb-1.5 block">المنطقة / المدينة <span className="text-red-500">*</span></Label>
                    <Popover open={govOpenUid === d.uid} onOpenChange={o => setGovOpenUid(o ? d.uid : null)}>
                      <PopoverTrigger asChild>
                        <button type="button" role="combobox" aria-expanded={govOpenUid === d.uid}
                          className={`flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring ${showErrors && err.zoneId ? "border-red-500" : "border-input"}`}>
                          <span className={zoneLabel ? "" : "text-muted-foreground"}>{zoneLabel || "اختر المحافظة / المنطقة..."}</span>
                          <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start" side="bottom" sideOffset={4} avoidCollisions={false}>
                        <Command>
                          <CommandInput placeholder="ابحث عن المحافظة..." className="text-sm" />
                          <CommandList className="max-h-[260px]">
                            <CommandEmpty className="text-xs text-muted-foreground py-4">لا توجد محافظة بهذا الاسم</CommandEmpty>
                            <CommandGroup>
                              {zoneOptions.map(({ label, zone }) => (
                                <CommandItem key={zone.id} value={label}
                                  onSelect={() => { patch(d.uid, { zoneId: String(zone.id) }); setGovOpenUid(null); }}
                                  className="text-sm flex items-center justify-between gap-3">
                                  <span className="flex items-center gap-2">
                                    <Check className={`w-3.5 h-3.5 shrink-0 ${d.zoneId === String(zone.id) ? "opacity-100 text-primary" : "opacity-0"}`} />
                                    {label}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-bold">{fc(getZonePrice(String(zone.id)))}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {showErrors && err.zoneId && <p className="text-[10px] text-red-500 mt-1">{err.zoneId}</p>}
                    {d.zoneId && <p className="text-[10px] text-primary mt-1">سعر التوصيل: {fc(zonePrice)}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-bold mb-1.5 block">العنوان التفصيلي</Label>
                    <Input className="text-sm" placeholder="الشارع، المبنى، الشقة..."
                      value={d.receiverAddress} onChange={e => patch(d.uid, { receiverAddress: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-bold mb-1.5 block">نوع الشحنة</Label>
                    <Select value={d.parcelType} onValueChange={v => patch(d.uid, { parcelType: v })}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder="اختر نوع الشحنة..." /></SelectTrigger>
                      <SelectContent>
                        {parcelPricing.filter(p => p.isActive !== false).map(p => (
                          <SelectItem key={p.id} value={p.parcelType}>
                            <div className="flex items-center justify-between gap-4 w-full">
                              <span>{p.label || parcelLabels[p.parcelType] || p.parcelType}</span>
                              <span className="text-xs font-bold text-muted-foreground">{fc(Number(p.basePrice) || 0)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold mb-1.5 block">الوزن (كجم)</Label>
                    <Input type="number" className="text-sm" placeholder="0.00"
                      value={d.weight} onChange={e => patch(d.uid, { weight: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-bold mb-1.5 block">حالة الشحنة (الفتح)</Label>
                    <Select value={d.canOpen} onValueChange={v => patch(d.uid, { canOpen: v })}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder="اختر..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">مسموح بفتح الشحنة</SelectItem>
                        <SelectItem value="0">غير مسموح بفتح الشحنة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold mb-1.5 block">تجزئة الشحنة</Label>
                    <Select value={d.isDivisible} onValueChange={v => patch(d.uid, { isDivisible: v })}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder="اختر..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">الشحنة قابلة للتجزئة</SelectItem>
                        <SelectItem value="0">الشحنة غير قابلة للتجزئة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-bold mb-1.5 block">حالة الرفض</Label>
                    <Select value={d.rejectionPolicy} onValueChange={v => patch(d.uid, { rejectionPolicy: v })}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder="اختر..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_fee">يتم دفع مبلغ الشحن كاملا</SelectItem>
                        <SelectItem value="free">الشحن مجانا</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* الدفع والسعر */}
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled
                      className="flex-1 min-w-[110px] px-3 py-2 rounded-lg text-[11px] font-bold border transition-all bg-primary/10 text-primary border-primary/40 ring-1 ring-primary/30">
                      {PAYMENT_LABELS.cod}
                    </button>
                  </div>
                  {d.paymentMethod === "cod" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <Label className="text-xs font-bold mb-1.5 block">سعر الشحنة <span className="text-red-500">*</span></Label>
                        <Input type="number" className={`text-sm ${showErrors && err.codAmount ? "border-red-500" : ""}`} placeholder="0"
                          value={d.codAmount} onChange={e => patch(d.uid, { codAmount: e.target.value })} />
                        {showErrors && err.codAmount && <p className="text-[10px] text-red-500 mt-1">{err.codAmount}</p>}
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] space-y-0.5">
                        <div className="flex justify-between"><span className="text-muted-foreground">رسوم الشحن</span><span className="font-bold">{fc(shippingFee)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">مبلغ COD</span><span className="font-bold text-amber-500">{fc(cod)}</span></div>
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs font-bold mb-1.5 block">ملاحظات</Label>
                    <Input className="text-sm" placeholder="أي تعليمات خاصة..."
                      value={d.notes} onChange={e => patch(d.uid, { notes: e.target.value })} />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      <Button type="button" variant="outline" onClick={addBlank}
        className="w-full gap-2 border-dashed h-11 text-xs font-bold" data-testid="bulk-add-shipment">
        <Plus className="w-4 h-4" /> إضافة شحنة أخرى لنفس العميل
      </Button>
    </section>
  );
}

export default BulkShipmentCards;
