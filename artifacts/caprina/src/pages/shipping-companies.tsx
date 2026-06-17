import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { shippingApi, manifestsApi, shipmentManifestsApi, shipmentsApi, type ShippingCompany, type ShippingManifestListItem, type ShipmentManifestListItem, type ManifestCompanyStats, type Shipment } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Truck, Edit2, Trash2, Phone, Globe, ToggleLeft, ToggleRight, FileText, TrendingUp, TrendingDown, PackagePlus, ChevronDown, ChevronUp, Clock, CheckCircle2, RotateCcw, Search, ImagePlus, X as XIcon } from "lucide-react";
import { format } from "date-fns";

// الحالات اللي تعتبر "متاحة" للإضافة لبيان شحن شحنات جديد — قيد الشحن في المخزن فقط
const AVAILABLE_SHIPMENT_STATUSES = ["waiting"];

const SHIPMENT_STATUS_LABELS_LOCAL: Record<string, string> = {
  waiting: "🏠 قيد الشحن",
  confirmed: "مؤكدة",
  delayed: "متأخرة",
  warehouse_ready: "🏠 قيد الشحن",
};

const emptyForm = { name: "", phone: "", website: "", notes: "", logo: "", isActive: true };
const formatCurrency = (n: number) => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

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
function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <Label className="text-xs mb-1.5 block flex items-center gap-1"><ImagePlus className="w-3 h-3" />لوجو الشركة</Label>
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
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="w-3.5 h-3.5" />
            {value ? "تغيير الصورة" : "رفع صورة"}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, WEBP — الصورة ستظهر دائرية</p>
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
  const [expanded, setExpanded] = useState(false);
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
        <div className="mt-2 space-y-1.5">
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

  // لا نحتاج فلتر إضافي — الكويري برجع warehouse_ready بس
  const availableShipments = allCompanyShipments as Shipment[];

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

  const createMutation = useMutation({
    mutationFn: () =>
      shipmentManifestsApi.create({
        shippingCompanyId: company.id,
        shipmentIds: Array.from(selectedIds),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (manifest) => {
      queryClient.invalidateQueries({ queryKey: ["shipment-manifests", company.id] });
      queryClient.invalidateQueries({ queryKey: ["shipments-available-for-manifest", "waiting"] });
      queryClient.invalidateQueries({ queryKey: ["company-shipments", company.id] });
      queryClient.invalidateQueries({ queryKey: ["company-stats", company.id] });
      toast({ title: "تم إنشاء البيان", description: `${manifest.manifestNumber} — ${manifest.shipmentCount} شحنة` });
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
                      : "لا توجد شحنات قيد الشحن في المخزن جاهزة للبيان — باقي الشحنات في حالات أخرى (مؤكدة / تم الاستلام / قيد الشحن / تم التسليم...)"
                    : "لا توجد نتائج تطابق البحث"}
                </p>
              </div>
            ) : (
              <>
                {/* Table header — desktop only */}
                <div className="hidden sm:grid sm:grid-cols-[auto_2fr_1fr_100px_80px] gap-0 border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold text-muted-foreground sticky top-0">
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
                      <div className="hidden sm:grid sm:grid-cols-[auto_2fr_1fr_100px_80px] gap-0 items-center px-3 py-2.5">
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
                          <Badge variant="outline" className="text-[9px] font-bold border max-w-[75px] truncate justify-center">
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

export default function ShippingCompanies() {
  const { toast } = useToast();
  const { can, isAdmin, canViewFinancials } = useAuth();
  // ── Shipping permission shortcuts ──────────────────────────────────────────
  const canEdit       = isAdmin || can("shipping.edit");
  const canFinancials = isAdmin || can("shipping.financials");
  const canManifests  = isAdmin || can("shipping.manifests");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<ShippingCompany | null>(null);
  const [deleteCompany, setDeleteCompany] = useState<ShippingCompany | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: companies, isLoading } = useQuery({ queryKey: ["shipping"], queryFn: shippingApi.list });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => shippingApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shipping"] }); setDialogOpen(false); setForm(emptyForm); toast({ title: "تمت الإضافة" }); },
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
  const openEdit = (c: ShippingCompany) => { setEditingCompany(c); setForm({ name: c.name, phone: c.phone ?? "", website: c.website ?? "", notes: c.notes ?? "", logo: c.logo ?? "", isActive: c.isActive }); setDialogOpen(true); };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast({ title: "خطأ", description: "اسم الشركة مطلوب.", variant: "destructive" }); return; }
    const data = {
      ...form,
      phone: form.phone || null,
      website: form.website || null,
      notes: form.notes || null,
      logo: form.logo || null,
    };
    if (editingCompany) updateMutation.mutate({ id: editingCompany.id, data });
    else createMutation.mutate(data as any);
  };

  const toggleActive = (c: ShippingCompany) => updateMutation.mutate({ id: c.id, data: { isActive: !c.isActive } });

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">شركات الشحن</h1>
          <p className="text-muted-foreground text-sm mt-0.5">إدارة شركاء الشحن وبيانات التسليم</p>
        </div>
        {can("shipping.edit") && (
          <Button onClick={openAdd} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm">
            <Plus className="w-4 h-4" />إضافة شركة
          </Button>
        )}
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
          <p className="text-xs text-muted-foreground">إجمالي الشركات</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                {company.phone && <p className="text-xs text-muted-foreground flex items-center gap-2"><Phone className="w-3 h-3" />{company.phone}</p>}
                {company.website && (
                  <p className="text-xs text-muted-foreground flex items-center gap-2"><Globe className="w-3 h-3" />
                    <a href={company.website} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: `rgba(${p.rgb},0.85)` }}>{company.website}</a>
                  </p>
                )}
                {company.notes && <p className="text-xs text-muted-foreground pt-1 border-t" style={{ borderColor: `rgba(${p.rgb},0.15)` }}>{company.notes}</p>}
              </div>

              <CompanyStats companyId={company.id} canViewFinancials={canViewFinancials && canFinancials} />
              <CompanyManifests company={company} allCompanies={companies ?? []} canShipping={canManifests} />
            </div>
            );
          })}
        </div>
      ) : (
        <Card className="border-border p-12 text-center">
          <Truck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
          <p className="font-bold">لا توجد شركات شحن</p>
          <p className="text-sm text-muted-foreground mt-1">أضف شركات الشحن التي تتعامل معها.</p>
          {canEdit && <Button onClick={openAdd} className="mt-4 gap-2 text-sm"><Plus className="w-4 h-4" />إضافة شركة</Button>}
        </Card>
      )}

      {/* Add/Edit Company Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{editingCompany ? "تعديل شركة الشحن" : "إضافة شركة شحن"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <LogoUploader value={form.logo} onChange={v => setForm(f => ({ ...f, logo: v }))} />
            <div>
              <Label className="text-xs mb-1.5 block">اسم الشركة *</Label>
              <Input placeholder="مثال: أرامكس، DHL" className="h-9 text-sm bg-background" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><Phone className="w-3 h-3" />الهاتف</Label>
                <Input placeholder="05xxxxxxxx" className="h-9 text-sm bg-background" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><Globe className="w-3 h-3" />الموقع</Label>
                <Input placeholder="https://..." className="h-9 text-sm bg-background" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">ملاحظات</Label>
              <Textarea placeholder="معلومات إضافية..." className="min-h-[70px] text-sm resize-none bg-background" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-md">
              <span className="text-xs font-medium">حالة الشركة</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 mr-auto" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}>
                {form.isActive ? <><ToggleRight className="w-4 h-4 text-emerald-400" />نشط</> : <><ToggleLeft className="w-4 h-4" />موقف</>}
              </Button>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 h-9 text-sm font-bold bg-primary text-primary-foreground" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : editingCompany ? "حفظ" : "إضافة"}
              </Button>
              <Button variant="outline" className="h-9 text-sm border-border" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteCompany} onOpenChange={() => setDeleteCompany(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف شركة الشحن "{deleteCompany?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
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
    </div>
  );
}
