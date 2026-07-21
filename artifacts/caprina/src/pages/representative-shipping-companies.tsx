import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { shippingApi, manifestsApi, shipmentManifestsApi, shipmentsApi, apiFetch, type ShippingCompany, type ShippingManifestListItem, type ShipmentManifestListItem, type ManifestCompanyStats, type Shipment } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Truck, Edit2, Trash2, Phone, Globe, MapPin, ToggleLeft, ToggleRight, FileText, TrendingUp, TrendingDown, PackagePlus, ChevronDown, ChevronUp, Clock, CheckCircle2, RotateCcw, Search, ImagePlus, X as XIcon, Check, ChevronsUpDown, KeyRound, UserPlus, DollarSign } from "lucide-react";
import { format } from "date-fns";

// الحالات اللي تعتبر "متاحة" للإضافة لبيان شحن شحنات جديد — قيد الشحن في المخزن فقط
const AVAILABLE_SHIPMENT_STATUSES = ["waiting"];

const SHIPMENT_STATUS_LABELS_LOCAL: Record<string, string> = {
  waiting: "🏠 قيد الشحن في المخزن",
  confirmed: "مؤكدة",
  delayed: "متأخرة",
  warehouse_ready: "🏠 قيد الشحن في المخزن",
};

const emptyForm = { name: "", phone: "", website: "", shippingCost: "", costMode: "zone" as "rep" | "zone", zoneIds: [] as number[], zoneCostIds: [] as number[], notes: "", logo: "", isActive: true, repUsername: "", repPassword: "" };
const formatCurrency = (n: number) => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

// ─── Multi-Select للزونات ────────────────────────────────────────────────────
function ZonesMultiSelect({
  value,
  onChange,
  zones,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  zones: { id: number; name: string; fromGovernorate?: string; toGovernorate?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() =>
    zones.filter(z =>
      !search.trim() ||
      z.name.toLowerCase().includes(search.toLowerCase()) ||
      (z.fromGovernorate?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (z.toGovernorate?.toLowerCase().includes(search.toLowerCase()) ?? false)
    ), [zones, search]);

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  };

  const selectedLabels = value
    .map(id => zones.find(z => z.id === id))
    .filter(Boolean)
    .map(z => ({ id: z!.id, name: z!.name }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-auto min-h-9 w-full justify-between bg-background border-input text-sm font-normal"
          type="button"
        >
          <div className="flex flex-wrap gap-1 py-0.5">
            {value.length === 0 ? (
              <span className="text-muted-foreground">اختر الزونات...</span>
            ) : (
              selectedLabels.map(label => (
                <Badge key={label.id} variant="secondary" className="text-[10px] py-0 px-1.5 h-5">
                  {label.name}
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-50 mr-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0"
        align="start"
        dir="rtl"
        onInteractOutside={e => e.preventDefault()}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute right-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="بحث في الزونات..."
              className="h-8 text-xs pr-7 bg-background"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد نتائج</p>
          ) : (
            filtered.map(zone => {
              const isSelected = value.includes(zone.id);
              return (
                <div
                  key={zone.id}
                  data-zone-item="true"
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-muted/40 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(zone.id); }}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{zone.name}</p>
                    {(zone.fromGovernorate || zone.toGovernorate) && (
                      <p className="text-[10px] text-muted-foreground">{zone.fromGovernorate ?? "؟"} → {zone.toGovernorate ?? "؟"}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {value.length > 0 && (
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => onChange([])}
              type="button"
            >
              <XIcon className="w-3 h-3 mr-1" />
              مسح الكل ({value.length})
            </Button>
          </div>
        )}
        {/* زر تم — لإغلاق الـ dropdown بعد الانتهاء من الاختيار */}
        <div className="p-2 border-t border-border">
          <Button
            size="sm"
            className="w-full h-7 text-xs font-bold"
            onClick={() => setOpen(false)}
            type="button"
          >
            <Check className="w-3 h-3 mr-1" />
            تم ({value.length} زون)
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Multi-Select لمناطق التكلفة (تكاليف المناطق) ─────────────────────────────
function ZoneCostsMultiSelect({
  value,
  onChange,
  zoneCosts,
  formatCurrency,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  zoneCosts: { id: number; name: string; fromGovernorate?: string | null; toGovernorate?: string | null; deliveryCost: number | string; isActive?: boolean }[];
  formatCurrency: (n: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const activeZoneCosts = useMemo(() => zoneCosts.filter(z => z.isActive !== false), [zoneCosts]);

  const filtered = useMemo(() =>
    activeZoneCosts.filter(z =>
      !search.trim() ||
      z.name.toLowerCase().includes(search.toLowerCase()) ||
      (z.fromGovernorate?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (z.toGovernorate?.toLowerCase().includes(search.toLowerCase()) ?? false)
    ), [activeZoneCosts, search]);

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  };

  const selectedLabels = value
    .map(id => activeZoneCosts.find(z => z.id === id))
    .filter(Boolean)
    .map(z => ({ id: z!.id, name: z!.name }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-auto min-h-9 w-full justify-between bg-background border-input text-sm font-normal"
          type="button"
        >
          <div className="flex flex-wrap gap-1 py-0.5">
            {value.length === 0 ? (
              <span className="text-muted-foreground">اختر المناطق...</span>
            ) : (
              selectedLabels.map(label => (
                <Badge key={label.id} variant="secondary" className="text-[10px] py-0 px-1.5 h-5">
                  {label.name}
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-50 mr-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] p-0"
        align="start"
        dir="rtl"
        onInteractOutside={e => e.preventDefault()}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute right-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="بحث في المناطق..."
              className="h-8 text-xs pr-7 bg-background"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد نتائج</p>
          ) : (
            filtered.map(zc => {
              const isSelected = value.includes(zc.id);
              return (
                <div
                  key={zc.id}
                  data-zonecost-item="true"
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-muted/40 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(zc.id); }}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {zc.name}
                      {(zc.fromGovernorate || zc.toGovernorate) ? ` (${zc.fromGovernorate ?? "—"} ← ${zc.toGovernorate ?? "—"})` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(Number(zc.deliveryCost))}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {value.length > 0 && (
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => onChange([])}
              type="button"
            >
              <XIcon className="w-3 h-3 mr-1" />
              مسح الكل ({value.length})
            </Button>
          </div>
        )}
        <div className="p-2 border-t border-border">
          <Button
            size="sm"
            className="w-full h-7 text-xs font-bold"
            onClick={() => setOpen(false)}
            type="button"
          >
            <Check className="w-3 h-3 mr-1" />
            تم ({value.length} منطقة)
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}


/** أيقونة شركة الشحن — صورة دائرية أو Truck fallback */
function CompanyAvatar({ logo, name, size = "md" }: { logo?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "w-14 h-14" : size === "sm" ? "w-7 h-7" : "w-10 h-10";
  const iconSize = size === "lg" ? "w-7 h-7" : size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  if (logo && logo.startsWith("data:"))
    return <img src={logo} className={`${dims} rounded-full object-cover border-2 border-border/50 shrink-0`} alt={name} />;
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0`}>
      <Truck className={`${iconSize} text-primary/60`} />
    </div>
  );
}

/** حقل رفع اللوجو */
/** يضغط ويصغّر الصورة قبل تحويلها لـ base64 — يمنع خطأ 500 الناتج عن تجاوز
 *  max_allowed_packet في MySQL عند رفع صور موبايل عالية الدقة بدون ضغط */
function resizeAndCompressImage(file: File, maxDim = 320, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        } else {
          if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas غير مدعوم")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("تعذّر قراءة الصورة"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "خطأ", description: "يجب اختيار ملف صورة (PNG, JPG, WEBP).", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const compressed = await resizeAndCompressImage(file);
      onChange(compressed);
    } catch (err: any) {
      toast({ title: "خطأ", description: err?.message ?? "تعذّر معالجة الصورة.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      // تصفير قيمة input عشان يقدر المستخدم يختار نفس الملف تاني لو احتاج
      e.target.value = "";
    }
  };
  return (
    <div>
      <Label className="text-xs mb-1.5 block flex items-center gap-1"><ImagePlus className="w-3 h-3" />صورة المندوب</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative shrink-0">
            <img src={value} className="w-14 h-14 rounded-full object-cover border-2 border-border" alt="logo" />
            <button
              type="button"
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80 transition-colors"
              onClick={() => onChange("")}
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div
            className="w-14 h-14 rounded-full bg-muted/30 border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/60 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full" disabled={isProcessing} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="w-3.5 h-3.5" />
            {isProcessing ? "جاري المعالجة..." : value ? "تغيير الصورة" : "رفع صورة"}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, WEBP — يتم ضغط الصورة وتصغيرها تلقائياً</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function DeliveryBar({ rate }: { rate: number }) {
  const color = rate >= 70 ? "bg-emerald-500" : rate >= 40 ? "bg-amber-500" : "bg-red-500";
  const textColor = rate >= 70 ? "text-emerald-400" : rate >= 40 ? "text-amber-400" : "text-red-400";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">نسبة التسليم</span>
        <span className={`text-xs font-black ${textColor}`}>{rate}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

function CompanyStats({ companyId, canViewFinancials }: { companyId: number; canViewFinancials: boolean }) {
  const { data: stats } = useQuery({
    queryKey: ["company-stats", companyId],
    queryFn: () => manifestsApi.companyStats(companyId),
    staleTime: 30000,
  });
  const { data: shipmentStats } = useQuery({
    queryKey: ["company-shipment-stats", companyId],
    queryFn: () => shipmentManifestsApi.companyStats(companyId),
    staleTime: 30000,
  });
  const { data: manifests } = useQuery({
    queryKey: ["shipping-manifests", companyId],
    queryFn: () => manifestsApi.list(companyId),
    staleTime: 10000,
  });
  const { data: shipmentManifests } = useQuery({
    queryKey: ["shipment-manifests", companyId],
    queryFn: () => shipmentManifestsApi.list(companyId),
    staleTime: 10000,
  });
  const openManifest = manifests?.find(m => m.status === "open") ?? null;
  const openShipmentManifest = shipmentManifests?.find(m => m.status === "open") ?? null;
  // البيان المفتوح الفعلي — نظام الشحنات له الأولوية
  const activeManifest = openShipmentManifest ?? openManifest;
  if (!stats && !shipmentStats) return null;

  // ─── دمج إحصائيات نظام الطلبات (القديم) ونظام الشحنات (الجديد) ─────────────
  const merged = {
    delivered:     (stats?.delivered ?? 0)     + (shipmentStats?.delivered ?? 0),
    partial:       ((stats as any)?.partial ?? 0) + (shipmentStats?.partial ?? 0),
    returned:      (stats?.returned ?? 0)      + (shipmentStats?.returned ?? 0),
    total:         (stats?.total ?? 0)         + (shipmentStats?.total ?? 0),
    netProfit:     (stats?.netProfit ?? 0)     + (shipmentStats?.netProfit ?? 0),
    manifestCount: (stats?.manifestCount ?? 0) + (shipmentStats?.manifestCount ?? 0),
  };
  const deliveryRate = merged.total > 0
    ? Math.round(((merged.delivered + merged.partial) / merged.total) * 100)
    : 0;

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      <DeliveryBar rate={deliveryRate} />
      {/* صف: مسلم | مسلم جزئي | مرتجع */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {/* مسلم */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 relative">
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]" />
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]" />
          <p className="text-[10px] text-emerald-300/70 mb-0.5">مُسلَّم</p>
          <p className="text-sm font-black text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]">{merged.delivered}</p>
        </div>
        {/* مسلم جزئي */}
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-lg p-2 relative">
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_6px_2px_rgba(45,212,191,0.6)]" />
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_6px_2px_rgba(45,212,191,0.6)]" />
          <p className="text-[10px] text-teal-300/70 mb-0.5">مُسلَّم جزئي</p>
          <p className="text-sm font-black text-teal-400 drop-shadow-[0_0_6px_rgba(45,212,191,0.8)]">{merged.partial}</p>
        </div>
        {/* مرتجع */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 relative">
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.6)]" />
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.6)]" />
          <p className="text-[10px] text-red-300/70 mb-0.5">مُرتجَع</p>
          <p className="text-sm font-black text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.8)]">{merged.returned}</p>
        </div>
      </div>
      {/* قسم البيان الحالي */}
      <div className="bg-muted/20 border border-border/40 rounded-lg p-2">
        <p className="text-[10px] text-muted-foreground text-center mb-1.5">البيان الحالي</p>
        {activeManifest ? (
          <div className="space-y-1.5">
            <p className="text-sm font-black text-amber-400 text-center drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]">• {(activeManifest as any).shipmentCount ?? (activeManifest as any).orderCount ?? 0} •</p>
            <div className="grid grid-cols-4 gap-1">
              {/* قيد الانتظار */}
              <div className="flex flex-col items-center bg-blue-500/10 border border-blue-500/20 rounded-lg py-1.5 px-0.5 relative">
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_5px_1px_rgba(96,165,250,0.7)]" />
                <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_5px_1px_rgba(96,165,250,0.7)]" />
                <span className="text-[11px] font-black text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.9)]">{(activeManifest as any).statusCounts?.pending ?? (activeManifest as any).pendingCount ?? 0}</span>
                <span className="text-[7px] text-muted-foreground leading-tight text-center mt-0.5">قيد الانتظار</span>
              </div>
              {/* شحنات مؤجلة */}
              <div className="flex flex-col items-center bg-amber-500/10 border border-amber-500/20 rounded-lg py-1.5 px-0.5 relative">
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_5px_1px_rgba(251,191,36,0.7)]" />
                <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_5px_1px_rgba(251,191,36,0.7)]" />
                <span className="text-[11px] font-black text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.9)]">{(activeManifest as any).statusCounts?.delayed ?? (activeManifest as any).postponedCount ?? 0}</span>
                <span className="text-[7px] text-muted-foreground leading-tight text-center mt-0.5">شحنات مؤجلة</span>
              </div>
              {/* شحنات مرتجعة */}
              <div className="flex flex-col items-center bg-red-500/10 border border-red-500/20 rounded-lg py-1.5 px-0.5 relative">
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-red-400 shadow-[0_0_5px_1px_rgba(248,113,113,0.7)]" />
                <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-red-400 shadow-[0_0_5px_1px_rgba(248,113,113,0.7)]" />
                <span className="text-[11px] font-black text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.9)]">{(activeManifest as any).statusCounts?.returned ?? (activeManifest as any).returnedCount ?? 0}</span>
                <span className="text-[7px] text-muted-foreground leading-tight text-center mt-0.5">شحنات مرتجعة</span>
              </div>
              {/* توصيل جزئي */}
              <div className="flex flex-col items-center bg-teal-500/10 border border-teal-500/20 rounded-lg py-1.5 px-0.5 relative">
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-teal-400 shadow-[0_0_5px_1px_rgba(45,212,191,0.7)]" />
                <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-teal-400 shadow-[0_0_5px_1px_rgba(45,212,191,0.7)]" />
                <span className="text-[11px] font-black text-teal-400 drop-shadow-[0_0_5px_rgba(45,212,191,0.9)]">{(activeManifest as any).statusCounts?.partial ?? (activeManifest as any).partialCount ?? 0}</span>
                <span className="text-[7px] text-muted-foreground leading-tight text-center mt-0.5">مرتجع جزئي</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm font-black text-muted-foreground text-center">—</p>
        )}
      </div>
      {canViewFinancials && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">صافي الربح / الخسارة</span>
          <span className={`font-black ${merged.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {merged.netProfit >= 0 ? <TrendingUp className="inline w-3 h-3 mr-0.5" /> : <TrendingDown className="inline w-3 h-3 mr-0.5" />}
            {formatCurrency(Math.abs(merged.netProfit))}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">عدد البيانات</span>
        <span className="font-bold">{merged.manifestCount}</span>
      </div>
    </div>
  );
}

function CompanyManifests({ company, allCompanies, canShipping }: { company: ShippingCompany; allCompanies: ShippingCompany[]; canShipping: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showBlockedAlert, setShowBlockedAlert] = useState(false);
  const [, navigate] = useLocation();

  const { data: manifests } = useQuery({
    queryKey: ["shipping-manifests", company.id],
    queryFn: () => manifestsApi.list(company.id),
    staleTime: 10000,
  });

  // بيانات شحن الشحنات (النظام الجديد) — نتحقق من وجود بيان مفتوح قبل السماح بإنشاء بيان جديد
  const { data: shipmentManifests } = useQuery({
    queryKey: ["shipment-manifests", company.id],
    queryFn: () => shipmentManifestsApi.list(company.id),
    staleTime: 10000,
  });

  const openManifest = manifests?.find(m => m.status === "open");
  const openShipmentManifest = shipmentManifests?.find(m => m.status === "open");

  const handleNewManifest = () => {
    if (openShipmentManifest) {
      setShowBlockedAlert(true);
    } else {
      setShowNewDialog(true);
    }
  };

  // بعد إنشاء البيان — انقل لصفحة تفاصيل البيان مباشرةً
  const handleManifestCreated = (manifest: { id: number; manifestNumber: string; shipmentCount: number }) => {
    navigate(`/shipping/shipment-manifests/${manifest.id}`);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] gap-1 border-border text-muted-foreground" onClick={() => setExpanded(!expanded)}>
          <FileText className="w-3 h-3" />البيانات
          {expanded ? <ChevronUp className="w-3 h-3 mr-auto" /> : <ChevronDown className="w-3 h-3 mr-auto" />}
        </Button>
        {canShipping && (
          <Button size="sm" className="h-7 text-[11px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold" onClick={handleNewManifest}>
            <PackagePlus className="w-3 h-3" />بيان جديد
          </Button>
        )}
      </div>

      {/* تحذير: يوجد بيان مفتوح */}
      <AlertDialog open={showBlockedAlert} onOpenChange={setShowBlockedAlert}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
              <Clock className="w-5 h-5" />
              لا يمكن إنشاء بيان جديد
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <span className="block">يوجد بيان شحن مفتوح حالياً لشركة <strong>{company.name}</strong>:</span>
              <span className="block font-bold text-foreground">
                {openShipmentManifest?.manifestNumber} — {openShipmentManifest?.shipmentCount} شحنة
              </span>
              <span className="block text-muted-foreground">
                يرجى تقفيل البيان الحالي أولاً قبل إنشاء بيان جديد.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إغلاق</AlertDialogCancel>
            {openShipmentManifest && (
              <AlertDialogAction
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => { setShowBlockedAlert(false); setExpanded(true); }}
              >
                عرض البيان المفتوح
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {expanded && (
        <div className="mt-2 space-y-1.5 max-h-[320px] overflow-y-auto pr-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
          {/* بيانات الشحنات (النظام الجديد) */}
          {shipmentManifests && shipmentManifests.length > 0 && (
            <>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide px-1">بيانات الشحنات</p>
              {shipmentManifests.map(m => (
                <Link key={`sm-${m.id}`} href={`/shipping/shipment-manifests/${m.id}`}>
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors border border-primary/10">
                    <div>
                      <p className="text-xs font-bold">{m.manifestNumber}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(m.createdAt), "yyyy/MM/dd")} · {m.shipmentCount} شحنة</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] font-bold border ${m.status === "open" ? "border-blue-700 bg-blue-900/20 text-blue-400" : "border-emerald-700 bg-emerald-900/20 text-emerald-400"}`}>
                      {m.status === "open" ? "مفتوح" : "مغلق"}
                    </Badge>
                  </div>
                </Link>
              ))}
            </>
          )}
          {/* بيانات الطلبات (النظام القديم) */}
          {manifests && manifests.length > 0 && (
            <>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide px-1 mt-2">بيانات الطلبات</p>
              {manifests.map(m => (
                <Link key={`m-${m.id}`} href={`/shipping/manifests/${m.id}`}>
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors">
                    <div>
                      <p className="text-xs font-bold">{m.manifestNumber}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(m.createdAt), "yyyy/MM/dd")} · {m.orderCount} طلب</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] font-bold border ${m.status === "open" ? "border-blue-700 bg-blue-900/20 text-blue-400" : "border-emerald-700 bg-emerald-900/20 text-emerald-400"}`}>
                      {m.status === "open" ? "مفتوح" : "مغلق"}
                    </Badge>
                  </div>
                </Link>
              ))}
            </>
          )}
          {(!shipmentManifests || shipmentManifests.length === 0) && (!manifests || manifests.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-3">لا توجد بيانات شحن بعد</p>
          )}
        </div>
      )}

      {showNewDialog && (
        <CreateManifestDialog
          company={company}
          allCompanies={allCompanies}
          onClose={() => setShowNewDialog(false)}
          onCreated={handleManifestCreated}
        />
      )}
    </div>
  );
}

export function CreateManifestDialog({
  company,
  allCompanies,
  onClose,
  onCreated,
}: {
  company: ShippingCompany;
  allCompanies: ShippingCompany[];
  onClose: () => void;
  onCreated?: (manifest: { id: number; manifestNumber: string; shipmentCount: number }) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");

  // شحنات قيد الشحن في المخزن فقط (warehouse_ready) — من كل الشركات بدون فلتر
  // ملاحظة: "waiting" = قيد الانتظار (حالة مختلفة تماماً) — مش المقصود هنا
  const { data, isLoading } = useQuery({
    queryKey: ["shipments-available-for-manifest", "warehouse_ready"],
    queryFn: () => shipmentsApi.list({ status: "warehouse_ready", limit: 500 }),
  });

  const allCompanyShipments = data?.data ?? [];

  // فلتر صارم على المستوى ده: الباك إند بيوسّع "warehouse_ready" ليشمل "picked_up" برضه
  // (alias قديم لأغراض تانية)، فلازم نتأكد إننا بنعرض فقط الشحنات اللي لسه فعلياً
  // "قيد الشحن في المخزن" ولسه ماتسلمتش من شركة الشحن.
  const availableShipmentsAllZones = (allCompanyShipments as Shipment[]).filter(
    (s) => s.status === "warehouse_ready"
  );

  // فلترة على مناطق المندوب (zoneIds) — لو المندوب محدد له مناطق تغطية،
  // بنعرض بس الشحنات اللي منطقتها ضمن المناطق دي. لو مفيش مناطق محددة للمندوب،
  // بنعرض كل الشحنات المتاحة زي ما كان (بدون فلتر) عشان مايتقفلش الفلو على مناديب قدامى.
  const companyZoneIds = useMemo(() => {
    const raw = company.zoneIds;
    if (!raw) return null;
    if (Array.isArray(raw)) return new Set(raw.map((z) => Number(z)));
    try {
      const parsed = JSON.parse(raw as string);
      if (Array.isArray(parsed)) return new Set(parsed.map((z) => Number(z)));
    } catch {
      // raw مش JSON — تجاهل
    }
    return null;
  }, [company.zoneIds]);

  const availableShipments = useMemo(() => {
    if (!companyZoneIds || companyZoneIds.size === 0) return availableShipmentsAllZones;
    // الشحنات اللي معاها zoneId بنفلترها على مناطق المندوب.
    // الشحنات اللي مفيش zoneId مسجل ليها (قديمة أو اتعملت من غير تحديد منطقة)
    // بنسيبها تظهر برضو مؤقتاً — عشان ما تختفيش شحنات فعلية من البيان.
    return availableShipmentsAllZones.filter(
      (s) => s.zoneId == null || companyZoneIds.has(Number(s.zoneId))
    );
  }, [availableShipmentsAllZones, companyZoneIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableShipments;
    const q = search.toLowerCase();
    return availableShipments.filter((s: Shipment) =>
      s.receiverName?.toLowerCase().includes(q) ||
      s.shipmentNumber?.toLowerCase().includes(q) ||
      (s.receiverPhone && s.receiverPhone.includes(q)) ||
      (s.trackingNumber && s.trackingNumber.toLowerCase().includes(q)) ||
      (s.receiverCity && s.receiverCity.toLowerCase().includes(q))
    );
  }, [availableShipments, search]);

  const toggleAll = () => {
    if (filtered.length > 0 && filtered.every((s: Shipment) => selectedIds.has(s.id))) {
      const next = new Set(selectedIds);
      filtered.forEach((s: Shipment) => next.delete(s.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach((s: Shipment) => next.add(s.id));
      setSelectedIds(next);
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["shipment-manifests", company.id] });
    queryClient.invalidateQueries({ queryKey: ["shipments-available-for-manifest", "waiting"] });
    queryClient.invalidateQueries({ queryKey: ["company-shipments", company.id] });
    queryClient.invalidateQueries({ queryKey: ["company-stats", company.id] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      try {
        return await shipmentManifestsApi.create({
          shippingCompanyId: company.id,
          shipmentIds: Array.from(selectedIds),
          notes: notes.trim() || undefined,
        });
      } catch (err: any) {
        // 409 = يوجد بيان مفتوح → أضف الشحنات له تلقائياً
        if (err?.status === 409 || err?.message?.includes("409") || err?.message?.includes("مفتوح")) {
          const manifests = await shipmentManifestsApi.list(company.id);
          const openManifest = manifests.find((m: any) => m.status === "open");
          if (!openManifest) throw err;
          const result = await shipmentManifestsApi.addShipments(openManifest.id, Array.from(selectedIds));
          // نرجع شكل مشابه لـ create response عشان onSuccess يشتغل
          return {
            id: openManifest.id,
            manifestNumber: openManifest.manifestNumber,
            shipmentCount: result.added,
            _addedToExisting: true,
          } as any;
        }
        throw err;
      }
    },
    onSuccess: (manifest: any) => {
      invalidateAll();
      if (manifest._addedToExisting) {
        toast({
          title: "تمت الإضافة للبيان المفتوح",
          description: `${manifest.manifestNumber} — أُضيف ${manifest.shipmentCount} شحنة للبيان الموجود`,
        });
      } else {
        toast({ title: "تم إنشاء البيان", description: `${manifest.manifestNumber} — ${manifest.shipmentCount} شحنة` });
      }
      if (onCreated) onCreated(manifest);
      else onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border w-[94vw] sm:w-full max-w-3xl max-h-[90vh] flex flex-col p-4 sm:p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2 pr-8 text-base sm:text-lg">
            <Truck className="w-4 h-4 text-primary shrink-0" />
            إنشاء بيان شحن جديد
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-right truncate pr-8">{company.name}</p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 mt-2">
          {/* Search + counter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم / رقم الشحنة / الهاتف..."
                className="h-9 text-sm bg-background pr-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!isLoading && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {availableShipments.length} شحنة متاحة
              </span>
            )}
          </div>

          {/* Select-all row */}
          {!isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((s: Shipment) => selectedIds.has(s.id))}
                  onCheckedChange={toggleAll}
                />
                <span className="text-xs text-muted-foreground">
                  تحديد الكل ({filtered.length} شحنة)
                </span>
              </div>
              <span className="text-xs font-bold text-primary">
                {selectedIds.size} شحنة محددة
              </span>
            </div>
          )}

          {/* Shipments table */}
          <div className="overflow-y-auto flex-1 border border-border rounded-md">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">
                جاري تحميل الشحنات...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">
                  {availableShipments.length === 0
                    ? allCompanyShipments.length === 0
                      ? "لا توجد شحنات حالياً — يمكنك إضافة شحنات جديدة من قسم الشحنات"
                      : availableShipmentsAllZones.length === 0
                        ? "لا توجد شحنات قيد الشحن في المخزن جاهزة للبيان — باقي الشحنات في حالات أخرى (مؤكدة / تم الاستلام / قيد الشحن / تم التسليم...)"
                        : "لا توجد شحنات في مناطق تغطية هذا المندوب حالياً"
                    : "لا توجد نتائج تطابق البحث"}
                </p>
              </div>
            ) : (
              <>
                {/* Table header — desktop only */}
                <div className="hidden sm:grid sm:grid-cols-[auto_2fr_1fr_100px_120px] gap-0 border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold text-muted-foreground sticky top-0">
                  <div className="w-5" />
                  <div className="pr-2">المستلم</div>
                  <div className="pr-2">المدينة</div>
                  <div className="text-center">قيمة COD</div>
                  <div className="text-center">الحالة</div>
                </div>
                {/* Rows */}
                {filtered.map((s: Shipment) => {
                  const isSelected = selectedIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => toggleOne(s.id)}
                      className={`border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/8" : ""}`}
                    >
                      {/* Desktop row */}
                      <div className="hidden sm:grid sm:grid-cols-[auto_2fr_1fr_100px_120px] gap-0 items-center px-3 py-2.5">
                        <div className="w-5 flex items-center">
                          <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                        </div>
                        {/* Receiver */}
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold truncate">{s.receiverName}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <span className="font-mono text-primary/70">{s.shipmentNumber}</span>
                            {s.receiverPhone && (
                              <span className="text-muted-foreground/70">· {s.receiverPhone}</span>
                            )}
                          </p>
                        </div>
                        {/* City */}
                        <div className="min-w-0 pr-2">
                          <p className="text-xs truncate">{s.receiverCity || "—"}</p>
                        </div>
                        {/* COD */}
                        <div className="text-center text-xs font-bold">
                          {formatCurrency(Number(s.codAmount || 0))}
                        </div>
                        {/* Status */}
                        <div className="flex justify-center">
                          <Badge variant="outline" className="text-[8px] font-bold border px-1 py-0.5 text-center leading-tight whitespace-normal text-wrap max-w-[115px]">
                            {SHIPMENT_STATUS_LABELS_LOCAL[s.status] ?? s.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Mobile card */}
                      <div className="flex sm:hidden items-start gap-2.5 px-3 py-3">
                        <div className="pt-0.5 shrink-0">
                          <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold truncate">{s.receiverName}</p>
                            <Badge variant="outline" className="text-[9px] font-bold border shrink-0">
                              {SHIPMENT_STATUS_LABELS_LOCAL[s.status] ?? s.status}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                            <span className="font-mono text-primary/70">{s.shipmentNumber}</span>
                            {s.receiverPhone && (
                              <span className="text-muted-foreground/70">· {s.receiverPhone}</span>
                            )}
                          </p>
                          <div className="flex items-center justify-between gap-2 text-[11px] pt-0.5">
                            <span className="text-muted-foreground truncate">{s.receiverCity || "—"}</span>
                            <span className="font-bold shrink-0">{formatCurrency(Number(s.codAmount || 0))}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs mb-1.5 block">ملاحظات (اختياري)</Label>
            <Textarea
              placeholder="ملاحظات على البيان..."
              className="min-h-[50px] text-sm resize-none bg-background"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="w-full sm:flex-1 h-10 sm:h-9 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => createMutation.mutate()}
              disabled={selectedIds.size === 0 || createMutation.isPending}
            >
              {createMutation.isPending
                ? "جاري الإنشاء..."
                : `إنشاء البيان (${selectedIds.size} شحنة)`}
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto h-10 sm:h-9 text-sm border-border"
              onClick={onClose}
            >
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── RepresentativeDialog — إنشاء/تحديث حساب دخول المندوب ──────────────────
function RepresentativeDialog({
  companyId,
  companyName,
  mode = "account",
  onClose,
}: {
  companyId: number;
  companyName: string;
  /** account = إنشاء/تحديث الحساب | password = تغيير الباسورد فقط */
  mode?: "account" | "password";
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPass, setShowPass] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["rep-account", companyId],
    queryFn: () => apiFetch(`/shipping-companies/${companyId}/representative`).catch(() => null),
  });
  const rep = existing as any;
  const isEdit = !!rep;

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/shipping-companies/${companyId}/representative`, {
      method: "POST",
      body: JSON.stringify({
        username: username || rep?.username,
        password: password || undefined,
        displayName: displayName || undefined,
      }),
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["rep-account", companyId] });
      toast({ title: data.created ? "✅ تم إنشاء حساب المندوب" : "✅ تم تحديث حساب المندوب" });
      onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // وضع تغيير الباسورد فقط
  if (mode === "password") {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-card border-border max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="w-4 h-4 text-primary" />
              تغيير كلمة مرور المندوب
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{companyName}</p>
          </DialogHeader>
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">جاري التحقق...</p>
          ) : !rep ? (
            <div className="rounded-lg bg-amber-900/20 border border-amber-500/30 p-3 text-xs text-amber-400 mt-2">
              لا يوجد حساب دخول لهذا المندوب بعد. قم بإنشاء الحساب أولاً.
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs text-muted-foreground">
                الحساب: <strong className="text-foreground">{rep.username}</strong>
              </div>
              <div>
                <Label className="text-xs mb-1 block">كلمة المرور الجديدة *</Label>
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    placeholder="6 أحرف على الأقل"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-8 text-sm bg-background pl-8"
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute left-2 top-1.5 text-muted-foreground hover:text-foreground">
                    <KeyRound className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 h-8 text-xs font-bold bg-primary text-primary-foreground"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || !password || password.length < 6}
                >
                  {mutation.isPending ? "جاري الحفظ..." : "تغيير كلمة المرور"}
                </Button>
                <Button variant="outline" className="h-8 text-xs border-border" onClick={onClose}>إلغاء</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // وضع إنشاء/تحديث الحساب (الافتراضي)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-4 h-4 text-primary" />
            {isEdit ? "تحديث حساب المندوب" : "إنشاء حساب دخول للمندوب"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{companyName}</p>
        </DialogHeader>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-4">جاري التحقق...</p>
        ) : (
          <div className="space-y-3 mt-2">
            {isEdit && (
              <div className="rounded-lg bg-emerald-900/20 border border-emerald-500/30 p-3 text-xs text-emerald-400">
                حساب موجود: <strong>{rep.username}</strong> — آخر تحديث: {rep.updatedAt ? new Date(rep.updatedAt).toLocaleDateString("ar-EG") : "—"}
              </div>
            )}
            <div>
              <Label className="text-xs mb-1 block">اسم المستخدم {isEdit && "(اتركه فارغاً للإبقاء)"}</Label>
              <Input
                placeholder={rep?.username ?? "مثال: courier_ahmed"}
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                className="h-8 text-sm bg-background"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">{isEdit ? "كلمة مرور جديدة (اتركها فارغة للإبقاء)" : "كلمة المرور *"}</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="6 أحرف على الأقل"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-8 text-sm bg-background pl-8"
                  dir="ltr"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute left-2 top-1.5 text-muted-foreground hover:text-foreground">
                  <KeyRound className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">الاسم المعروض (اختياري)</Label>
              <Input
                placeholder={rep?.displayName ?? companyName}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="h-8 text-sm bg-background"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 h-8 text-xs font-bold bg-primary text-primary-foreground"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || (!isEdit && (!username || !password))}
              >
                {mutation.isPending ? "جاري الحفظ..." : isEdit ? "تحديث" : "إنشاء الحساب"}
              </Button>
              <Button variant="outline" className="h-8 text-xs border-border" onClick={onClose}>إلغاء</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ShippingCompanies() {
  const { toast } = useToast();
  const { can, isAdmin, canViewFinancials, user } = useAuth();
  // ── المندوب: مسموح له يشوف بياناته بس، ومعندوش صلاحيات إدارية على غيره ────
  const canEdit       = false;
  const canFinancials = true;
  const canManifests  = isAdmin || can("shipping.manifests");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<ShippingCompany | null>(null);
  const [deleteCompany, setDeleteCompany] = useState<ShippingCompany | null>(null);
  const [repDialogCompany, setRepDialogCompany] = useState<ShippingCompany | null>(null);
  const [repDialogMode, setRepDialogMode] = useState<"account" | "password">("account");
  const [form, setForm] = useState(emptyForm);

  const { data: allCompanies, isLoading } = useQuery({ queryKey: ["shipping"], queryFn: shippingApi.list });
  // ── المندوب يشوف بياناته هو بس (اللي عنده repUsername = اسم المستخدم بتاعه) ──
  const companies = allCompanies?.filter(c => c.repUsername === user?.username);
  const { data: zones = [] } = useQuery<{ id: number; name: string; fromGovernorate?: string; toGovernorate?: string; price: number }[]>({
    queryKey: ["shipment-zones"],
    queryFn: () => apiFetch("/shipments/zones"),
  });
  const { data: zoneCosts = [] } = useQuery<{ id: number; name: string; fromGovernorate?: string; toGovernorate?: string; deliveryCost: string; isActive?: boolean }[]>({
    queryKey: ["zone-costs"],
    queryFn: () => apiFetch("/zone-costs"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => shippingApi.create(data),
    onSuccess: async (newCompany: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["shipping"] });
      setDialogOpen(false);
      // لو فيه username + password → أنشئ حساب المندوب أوتوماتيك
      if (variables.repUsername && variables.repPassword) {
        try {
          await apiFetch(`/shipping-companies/${newCompany.id}/representative`, {
            method: "POST",
            body: JSON.stringify({
              username: variables.repUsername,
              password: variables.repPassword,
              displayName: variables.name,
            }),
          });
          toast({ title: "✅ تمت الإضافة وتم إنشاء حساب المندوب" });
        } catch {
          toast({ title: "تمت الإضافة", description: "تعذّر إنشاء الحساب — يمكنك إنشاؤه من الكارد" });
        }
      } else {
        toast({ title: "تمت الإضافة" });
      }
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof emptyForm> }) => shippingApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shipping"] }); setDialogOpen(false); setEditingCompany(null); setForm(emptyForm); toast({ title: "تم التحديث" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => shippingApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shipping"] }); setDeleteCompany(null); toast({ title: "تم الحذف" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => { setEditingCompany(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (c: ShippingCompany) => {
    // استرجاع zoneCostIds: إما من الحقل الجديد أو fallback على zoneCostId القديم (منطقة واحدة)
    let parsedZoneCostIds: number[] = [];
    if ((c as any).zoneCostIds) {
      try { parsedZoneCostIds = JSON.parse((c as any).zoneCostIds); } catch {}
    } else if ((c as any).zoneCostId) {
      parsedZoneCostIds = [Number((c as any).zoneCostId)];
    }
    // استرجاع zoneIds (مناطق التغطية الجغرافية) — نفس المنطق fallback على zoneId القديم
    let parsedZoneIds: number[] = [];
    if ((c as any).zoneIds) {
      try { parsedZoneIds = JSON.parse((c as any).zoneIds); } catch {}
    } else if ((c as any).zoneId) {
      parsedZoneIds = [Number((c as any).zoneId)];
    }
    setEditingCompany(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      website: c.website ?? "",
      shippingCost: (c as any).shippingCost != null ? String((c as any).shippingCost) : "",
      costMode: ((c as any).costMode === "rep" ? "rep" : "zone") as "rep" | "zone",
      zoneIds: parsedZoneIds,
      zoneCostIds: parsedZoneCostIds,
      notes: c.notes ?? "",
      logo: c.logo ?? "",
      isActive: c.isActive,
      repUsername: "",
      repPassword: "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast({ title: "خطأ", description: "اسم المندوب مطلوب.", variant: "destructive" }); return; }
    if (form.zoneIds.length === 0) {
      toast({ title: "خطأ", description: "اختر منطقة تغطية واحدة على الأقل (المناطق اللي المندوب بيغطيها).", variant: "destructive" });
      return;
    }
    // في وضع "سعر الزون" التكلفة بتتحدد حسب منطقة كل شحنة وقت الفعلي (لا يوجد سعر إجمالي واحد)
    // في وضع "سعر المندوب" السعر بييجي يدوي من الـ input
    const resolvedCost = form.costMode === "zone"
      ? null
      : (form.shippingCost !== "" ? Number(form.shippingCost) : null);
    const data = {
      ...form,
      phone: form.phone || null,
      website: form.website || null,
      shippingCost: resolvedCost,
      costMode: form.costMode,
      zoneIds: form.zoneIds.length > 0 ? form.zoneIds : null,
      zoneId: form.zoneIds.length > 0 ? form.zoneIds[0] : null,
      zoneCostIds: form.zoneCostIds.length > 0 ? form.zoneCostIds : null,
      zoneCostId: form.zoneCostIds.length > 0 ? form.zoneCostIds[0] : null,
      notes: form.notes || null,
      logo: form.logo || null,
    };
    if (editingCompany) updateMutation.mutate({ id: editingCompany.id, data: data as any });
    else createMutation.mutate(data as any);
  };

  const toggleActive = (c: ShippingCompany) => updateMutation.mutate({ id: c.id, data: { isActive: !c.isActive } });

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">بياناتي</h1>
          <p className="text-muted-foreground text-sm mt-0.5">بيانات حسابك وإحصائيات التسليم الخاصة بك</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative overflow-hidden rounded-2xl p-4"
          style={{
            background: "linear-gradient(135deg, rgba(96,165,250,0.18) 0%, rgba(59,130,246,0.08) 100%)",
            border: "1px solid rgba(96,165,250,0.3)",
            boxShadow: "0 0 24px rgba(96,165,250,0.15), 0 4px 12px rgba(96,165,250,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
          <span className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10" style={{ background: "radial-gradient(circle, rgba(96,165,250,1) 0%, transparent 70%)" }} />
          <p className="text-xs text-muted-foreground">إجمالي المناديب</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "rgba(96,165,250,1)" }}>{companies?.length ?? 0}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl p-4"
          style={{
            background: "linear-gradient(135deg, rgba(52,211,153,0.18) 0%, rgba(16,185,129,0.08) 100%)",
            border: "1px solid rgba(52,211,153,0.3)",
            boxShadow: "0 0 24px rgba(52,211,153,0.15), 0 4px 12px rgba(52,211,153,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
          <span className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10" style={{ background: "radial-gradient(circle, rgba(52,211,153,1) 0%, transparent 70%)" }} />
          <p className="text-xs text-muted-foreground">نشط</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "rgba(52,211,153,1)" }}>{companies?.filter(c => c.isActive).length ?? 0}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
      ) : companies?.length ? (
        <div className="grid grid-cols-1 gap-4 max-w-xl">
          {companies.map((company, idx) => {
            // ألوان متنوعة لكل شركة
            const palettes = [
              { rgb: "251,146,60",  rgb2: "251,191,36"  }, // برتقالي/ذهبي
              { rgb: "56,189,248",  rgb2: "96,165,250"  }, // سماوي/أزرق
              { rgb: "167,139,250", rgb2: "192,132,252" }, // بنفسجي
              { rgb: "52,211,153",  rgb2: "45,212,191"  }, // أخضر/تيل
              { rgb: "244,114,182", rgb2: "232,121,249" }, // وردي/فوشيا
              { rgb: "251,191,36",  rgb2: "250,204,21"  }, // ذهبي/أصفر
            ];
            const p = palettes[idx % palettes.length];
            const isActive = company.isActive;
            return (
            <div key={company.id} className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300"
              style={{
                background: isActive
                  ? `linear-gradient(145deg, rgba(${p.rgb},0.13) 0%, rgba(${p.rgb2},0.06) 50%, rgba(0,0,0,0.15) 100%)`
                  : "rgba(255,255,255,0.02)",
                border: isActive
                  ? `1px solid rgba(${p.rgb},0.35)`
                  : "1px solid rgba(255,255,255,0.06)",
                boxShadow: isActive
                  ? `0 0 32px rgba(${p.rgb},0.12), 0 8px 24px rgba(${p.rgb},0.08), inset 0 1px 0 rgba(255,255,255,0.06)`
                  : "0 2px 8px rgba(0,0,0,0.15)",
              }}>
              {/* زخرفة دائرية خلفية */}
              {isActive && (
                <span className="absolute -top-8 -left-8 w-32 h-32 rounded-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, rgba(${p.rgb},0.12) 0%, transparent 70%)` }} />
              )}
              <div className="flex items-start justify-between relative">
                <div className="flex items-center gap-3">
                  <div className="shrink-0" style={isActive ? {
                    filter: `drop-shadow(0 0 8px rgba(${p.rgb},0.5))`,
                  } : {}}>
                    <CompanyAvatar logo={company.logo} name={company.name} size="md" />
                  </div>
                  <div>
                    <Link href={`/shipping/company/${company.id}`}>
                      <h3 className="font-bold text-sm hover:underline cursor-pointer transition-colors"
                        style={isActive ? { color: `rgba(${p.rgb},1)` } : {}}>
                        {company.name}
                      </h3>
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[9px] font-bold border" style={isActive ? {
                        borderColor: `rgba(${p.rgb},0.5)`,
                        background: `rgba(${p.rgb},0.1)`,
                        color: `rgba(${p.rgb},1)`,
                      } : { borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.3)" }}>
                        {company.isActive ? "نشط" : "موقف"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-primary" onClick={() => toggleActive(company)}>
                        {company.isActive ? <ToggleRight className="w-4 h-4" style={{ color: `rgba(${p.rgb},1)` }} /> : <ToggleLeft className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-primary" onClick={() => openEdit(company)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => setDeleteCompany(company)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1.5 relative">
                {company.phone && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Phone className="w-3 h-3" />{company.phone}
                    </p>
                    <a
                      href={`https://wa.me/${company.phone.replace(/[^0-9]/g, "").replace(/^0/, "20")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`تواصل مع ${company.name} على واتساب`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center justify-center w-10 h-10 rounded-full bg-[#25D366]/15 hover:bg-[#25D366] border-2 border-[#25D366]/50 hover:border-[#25D366] transition-all hover:scale-110 shrink-0 group"
                    >
                      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#25D366] group-hover:fill-white transition-colors" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.83L.057 23.215a.75.75 0 0 0 .921.921l5.455-1.43A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.706 9.706 0 0 1-4.951-1.355l-.355-.211-3.676.964.982-3.589-.232-.371A9.706 9.706 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                      </svg>
                    </a>
                  </div>
                )}
                {(company as any).costMode !== "zone" && (company as any).shippingCost != null && (
                  <p className="text-xs flex items-center gap-2">
                    <span className="text-[10px] font-bold text-primary">ج.م</span>
                    <span className="text-muted-foreground">تكلفة الشحنة:</span>
                    <span className="font-bold" style={isActive ? { color: `rgba(${p.rgb},1)` } : {}}>
                      {formatCurrency(Number((company as any).shippingCost))}
                    </span>
                  </p>
                )}
                {(() => {
                  // استخراج zoneCostIds من الشركة (المناطق المرتبطة بالمندوب)
                  let zcIds: number[] = [];
                  if ((company as any).zoneCostIds) {
                    try { zcIds = JSON.parse((company as any).zoneCostIds); } catch {}
                  } else if ((company as any).zoneCostId) {
                    zcIds = [(company as any).zoneCostId];
                  }
                  if (!zcIds.length) return null;
                  const zoneCostNames = zcIds
                    .map(id => zoneCosts.find(z => z.id === id))
                    .filter(Boolean);
                  if (!zoneCostNames.length) return null;
                  return (
                    <div className="flex items-start gap-2 pt-1">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex flex-wrap gap-1">
                        {zoneCostNames.map(z => (
                          <span
                            key={z!.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border"
                            style={isActive ? {
                              background: `rgba(${p.rgb},0.12)`,
                              borderColor: `rgba(${p.rgb},0.35)`,
                              color: `rgba(${p.rgb},1)`,
                            } : {
                              background: "rgba(255,255,255,0.04)",
                              borderColor: "rgba(255,255,255,0.12)",
                              color: "rgba(255,255,255,0.5)",
                            }}
                          >
                            {z!.name}{z!.fromGovernorate || z!.toGovernorate ? ` · ${z!.fromGovernorate ?? "؟"} → ${z!.toGovernorate ?? "؟"}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {company.website && (
                  <p className="text-xs text-muted-foreground flex items-center gap-2"><Globe className="w-3 h-3" />
                    <a href={company.website} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: `rgba(${p.rgb},0.85)` }}>{company.website}</a>
                  </p>
                )}
                {company.notes && <p className="text-xs text-muted-foreground pt-1 border-t" style={{ borderColor: `rgba(${p.rgb},0.15)` }}>{company.notes}</p>}
              </div>

              <CompanyStats companyId={company.id} canViewFinancials={canViewFinancials && canFinancials} />

              {/* ── قسم حساب الدخول ── */}
              {canEdit && (
                <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: `rgba(${p.rgb},0.15)` }}>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide flex items-center gap-1">
                    <KeyRound className="w-2.5 h-2.5" />
                    حساب الدخول
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-[10px] gap-1 border-border hover:border-primary/50 hover:text-primary"
                      onClick={() => { setRepDialogMode("account"); setRepDialogCompany(company); }}
                    >
                      <UserPlus className="w-3 h-3" />
                      إنشاء / تعديل
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-[10px] gap-1 border-border hover:border-amber-500/50 hover:text-amber-400"
                      onClick={() => { setRepDialogMode("password"); setRepDialogCompany(company); }}
                    >
                      <KeyRound className="w-3 h-3" />
                      تغيير الباسورد
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`flex-1 h-7 text-[10px] gap-1 border-border ${company.isActive ? "hover:border-red-500/50 hover:text-red-400" : "hover:border-emerald-500/50 hover:text-emerald-400"}`}
                      onClick={() => toggleActive(company)}
                    >
                      {company.isActive
                        ? <><ToggleLeft className="w-3 h-3" />إيقاف الحساب</>
                        : <><ToggleRight className="w-3 h-3" />تفعيل الحساب</>
                      }
                    </Button>
                  </div>
                </div>
              )}

              <CompanyManifests company={company} allCompanies={companies ?? []} canShipping={canManifests} />
            </div>
            );
          })}
        </div>
      ) : (
        <Card className="border-border p-12 text-center">
          <Truck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
          <p className="font-bold">لا يوجد بيانات مرتبطة بحسابك</p>
          <p className="text-sm text-muted-foreground mt-1">تواصل مع الإدارة لربط حسابك ببيانات الشحن.</p>
          {/* debug مؤقت — هنشيله بعد التأكد */}
          <div className="mt-4 p-3 rounded-lg bg-muted/30 text-[10px] text-left ltr:text-left rtl:text-right inline-block">
            <p>user.username: <b>{JSON.stringify(user?.username)}</b></p>
            <p>allCompanies count: <b>{allCompanies?.length ?? "loading"}</b></p>
            <p>repUsernames: <b>{JSON.stringify(allCompanies?.map(c => c.repUsername))}</b></p>
          </div>
        </Card>
      )}

      {/* Add/Edit Company Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border w-[calc(100%-2rem)] sm:w-full max-w-md max-h-[90vh] p-0 flex flex-col gap-0" dir="rtl">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="text-right">{editingCompany ? "تعديل بيانات المندوب" : "إضافة مندوب شحن"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-6 pb-4 overflow-y-auto flex-1 min-h-0">
            <LogoUploader value={form.logo} onChange={v => setForm(f => ({ ...f, logo: v }))} />
            <div>
              <Label className="text-xs mb-1.5 block">اسم المندوب *</Label>
              <Input placeholder="مثال: أحمد محمد، محمود علي" className="h-9 text-sm bg-background" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><Phone className="w-3 h-3" />الهاتف</Label>
                <Input placeholder="05xxxxxxxx" className="h-9 text-sm bg-background" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  تكلفة الشحنة
                </Label>
                <Select
                  value={form.costMode}
                  onValueChange={(v: "rep" | "zone") => setForm(f => ({ ...f, costMode: v, shippingCost: "" }))}
                >
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zone">سعر الزون (حسب المنطقة)</SelectItem>
                    <SelectItem value="rep">سعر المندوب (يدوي)</SelectItem>
                  </SelectContent>
                </Select>

                <div className="mt-2">
                  <Label className="text-[10px] text-muted-foreground mb-1 block flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    مناطق التغطية (المناطق اللي المندوب بيوصّل فيها)
                  </Label>
                  <ZonesMultiSelect
                    value={form.zoneIds}
                    onChange={ids => setForm(f => ({ ...f, zoneIds: ids }))}
                    zones={zones}
                  />
                  {form.zoneIds.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {form.zoneIds.length} منطقة تغطية محددة — هتستخدم لفلترة الشحنات المتاحة عند إنشاء بيان جديد
                    </p>
                  )}
                </div>

                {form.costMode !== "zone" && (
                  <div className="mt-2 space-y-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="0.00"
                      className="h-9 text-sm bg-background"
                      value={form.shippingCost}
                      onChange={e => setForm(f => ({ ...f, shippingCost: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">ملاحظات</Label>
              <Textarea placeholder="معلومات إضافية..." className="min-h-[70px] text-sm resize-none bg-background" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-md">
              <span className="text-xs font-medium">حالة المندوب</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 mr-auto" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}>
                {form.isActive ? <><ToggleRight className="w-4 h-4 text-emerald-400" />نشط</> : <><ToggleLeft className="w-4 h-4" />موقف</>}
              </Button>
            </div>
            {/* ── حساب الدخول (يظهر عند التعديل فقط) ── */}
            {editingCompany && (
              <div className="border border-primary/20 rounded-lg p-3 bg-primary/5 space-y-2">
                <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  حساب الدخول
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1.5 border-border hover:border-primary/50"
                    onClick={() => { setDialogOpen(false); setRepDialogMode("account"); setRepDialogCompany(editingCompany); }}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    إنشاء / تعديل الحساب
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1.5 border-border hover:border-primary/50"
                    onClick={() => { setDialogOpen(false); setRepDialogMode("password"); setRepDialogCompany(editingCompany); }}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    تغيير الباسورد
                  </Button>
                </div>
              </div>
            )}
            {/* ── حساب الدخول (عند الإضافة) ── */}
            {!editingCompany && (
              <div className="border border-primary/20 rounded-lg p-3 bg-primary/5 space-y-2">
                <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  حساب الدخول (اختياري)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] mb-1 block text-muted-foreground">اسم المستخدم</Label>
                    <Input
                      placeholder="courier_ahmed"
                      className="h-8 text-xs bg-background"
                      dir="ltr"
                      value={form.repUsername}
                      onChange={e => setForm(f => ({ ...f, repUsername: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] mb-1 block text-muted-foreground">كلمة المرور</Label>
                    <Input
                      type="password"
                      placeholder="6 أحرف على الأقل"
                      className="h-8 text-xs bg-background"
                      dir="ltr"
                      value={form.repPassword}
                      onChange={e => setForm(f => ({ ...f, repPassword: e.target.value }))}
                    />
                  </div>
                </div>
                {form.repUsername && !form.repPassword && (
                  <p className="text-[10px] text-amber-400">أدخل كلمة المرور لإنشاء الحساب</p>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 px-6 py-4 border-t border-border shrink-0 bg-card">
            <Button className="flex-1 h-9 text-sm font-bold bg-primary text-primary-foreground" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : editingCompany ? "حفظ" : "إضافة"}
            </Button>
            <Button variant="outline" className="h-9 text-sm border-border" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteCompany} onOpenChange={() => setDeleteCompany(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المندوب "{deleteCompany?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteCompany && deleteMutation.mutate(deleteCompany.id)} className="bg-red-600 hover:bg-red-700 text-white">
              نعم، احذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Representative Account Dialog */}
      {repDialogCompany && (
        <RepresentativeDialog
          companyId={repDialogCompany.id}
          companyName={repDialogCompany.name}
          mode={repDialogMode}
          onClose={() => setRepDialogCompany(null)}
        />
      )}
    </div>
  );
}
