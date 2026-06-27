import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Redirect } from "wouter";
import { Truck, Package, CheckCircle2, RotateCcw, Clock, MapPin, AlertCircle, FileText, Lock, CheckCheck, CornerDownLeft, AlertTriangle, Hourglass, ChevronRight, ChevronLeft, Unlock, PackageCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  waiting: "انتظار", confirmed: "مؤكدة", picked_up: "تم الاستلام",
  in_transit: "في الطريق", out_for_delivery: "خرجت للتسليم",
  delivered: "تم التسليم", partial_received: "استلام جزئي",
  delayed: "متأخرة", returned: "مرتجع", cancelled: "ملغية",
};
const STATUS_COLOR: Record<string, string> = {
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  partial_received: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  returned: "bg-red-500/15 text-red-400 border-red-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  out_for_delivery: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_transit: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  delayed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};
const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl p-4 border relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, rgba(${color},0.15) 0%, rgba(${color},0.05) 100%)`,
               border: `1px solid rgba(${color},0.3)`, boxShadow: `0 0 20px rgba(${color},0.1)` }}>
      <span className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-10"
        style={{ background: `radial-gradient(circle, rgba(${color},1) 0%, transparent 70%)` }} />
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="w-4 h-4" style={{ color: `rgba(${color},1)` }} />
      </div>
      <p className="text-2xl font-black" style={{ color: `rgba(${color},1)` }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function DeliveryRing({ rate }: { rate: number }) {
  const r = 36; const c = 2 * Math.PI * r;
  const fill = (rate / 100) * c;
  const color = rate >= 70 ? "#34d399" : rate >= 40 ? "#fbbf24" : "#f87171";
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${fill} ${c}`}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black" style={{ color }}>{rate}%</span>
        <span className="text-[9px] text-muted-foreground">تسليم</span>
      </div>
    </div>
  );
}

// ─── حالات بيان الشحن (manifest item delivery status) ─────────────────────
const MANIFEST_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending",           label: "قيد الانتظار" },
  { value: "delivered",         label: "مسلَّم ✓" },
  { value: "partial_delivered", label: "مسلَّم جزئي" },
  { value: "delayed",           label: "مؤجل" },
  { value: "returned",          label: "مرتجع" },
];
const MANIFEST_STATUS_COLOR: Record<string, string> = {
  pending: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  partial_delivered: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  delayed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  returned: "bg-red-500/15 text-red-400 border-red-500/30",
};
const manifestStatusLabel = (v: string) => MANIFEST_STATUS_OPTIONS.find(o => o.value === v)?.label ?? v;

// ─── صف شحنة جوّا تفاصيل البيان — تعديل الحالة من المندوب ────────────────────
function ManifestItemRow({ item, manifestId, locked, onSaved }: {
  item: any; manifestId: number; locked: boolean; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string>(item.deliveryStatus);
  const [note, setNote] = useState(item.deliveryNote ?? "");
  const [partialQty, setPartialQty] = useState(item.partialQuantity?.toString() ?? "");
  const [returnReceived, setReturnReceived] = useState<boolean | null>(
    item.returnReceived === 1 ? true : item.returnReceived === 0 ? false : null
  );
  const [returnReason, setReturnReason] = useState(item.returnReason ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      if (status === "partial_delivered") {
        const qty = parseInt(partialQty);
        if (partialQty === "" || isNaN(qty) || qty < 0) throw new Error("لازم تدخل الكمية المستلمة");
        if (qty > (item.quantity ?? 1)) throw new Error(`الكمية لا يمكن أن تتجاوز ${item.quantity}`);
      }
      return apiFetch(`/shipment-manifests/${manifestId}/items/${item.shipmentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          deliveryStatus: status,
          deliveryNote: note.trim() || null,
          partialQuantity: status === "partial_delivered" && partialQty !== "" ? parseInt(partialQty) : null,
          returnReceived: status === "returned" || status === "partial_delivered" ? returnReceived : null,
          returnReason: status === "returned" ? (returnReason || null) : null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "✅ تم تحديث حالة الشحنة" });
      setEditing(false);
      onSaved();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const needsNote = status === "returned" || status === "delayed";
  const hasChanges =
    status !== item.deliveryStatus ||
    note !== (item.deliveryNote ?? "") ||
    partialQty !== (item.partialQuantity?.toString() ?? "");

  return (
    <Card className="p-3 bg-card/60 border-border space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold truncate">{item.customerName}</p>
          <p className="text-[10px] text-muted-foreground flex gap-1 flex-wrap mt-0.5">
            <span className="font-mono text-primary/70">{item.invoiceNumber}</span>
            {item.phone && <span>· {item.phone}</span>}
            {item.city && <span>· {item.city}</span>}
          </p>
        </div>
        <Badge variant="outline" className={`text-[9px] shrink-0 border ${MANIFEST_STATUS_COLOR[item.deliveryStatus] ?? "border-border"}`}>
          {manifestStatusLabel(item.deliveryStatus)}
        </Badge>
      </div>

      {!editing ? (
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-emerald-400">{Number(item.totalPrice ?? 0).toLocaleString("ar-EG")} ج.م</span>
          {!locked && (
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setEditing(true)}>
              تعديل الحالة
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 pt-1 border-t border-border/50">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MANIFEST_STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {status === "partial_delivered" && (
            <input type="number" min={0} max={item.quantity ?? 1} value={partialQty}
              onChange={e => setPartialQty(e.target.value)}
              placeholder={`الكمية المستلمة (من ${item.quantity ?? 1})`}
              className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs" />
          )}

          {(status === "returned" || status === "partial_delivered") && (
            <div className="flex gap-2">
              <button onClick={() => setReturnReceived(true)}
                className={`flex-1 h-7 text-[10px] rounded-md border ${returnReceived === true ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "border-border text-muted-foreground"}`}>
                تم الاستلام في المخزن
              </button>
              <button onClick={() => setReturnReceived(false)}
                className={`flex-1 h-7 text-[10px] rounded-md border ${returnReceived === false ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "border-border text-muted-foreground"}`}>
                لسه عند الشحن
              </button>
            </div>
          )}

          {status === "returned" && (
            <input value={returnReason} onChange={e => setReturnReason(e.target.value)}
              placeholder="سبب الإرجاع (اختياري)"
              className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs" />
          )}

          {needsNote && (
            <Textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="ملاحظة (اختياري)" className="text-xs min-h-[50px]" />
          )}

          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-[11px] flex-1" disabled={!hasChanges || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? "بيحفظ..." : "حفظ"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setEditing(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── تفاصيل البيان — قائمة الشحنات + إغلاق البيان ────────────────────────────
function ManifestDetail({ manifestId, onBack }: { manifestId: number; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmClose, setConfirmClose] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rep-manifest", manifestId],
    queryFn: () => apiFetch(`/shipment-manifests/${manifestId}`),
  });
  const manifest = data as any;
  const locked = manifest?.status === "closed";

  const closeMutation = useMutation({
    mutationFn: () => apiFetch(`/shipment-manifests/${manifestId}`, {
      method: "PATCH", body: JSON.stringify({ status: "closed" }),
    }),
    onSuccess: () => {
      toast({ title: "✅ تم قفل البيان بنجاح" });
      qc.invalidateQueries({ queryKey: ["rep-manifest", manifestId] });
      qc.invalidateQueries({ queryKey: ["rep-manifests"] });
      setConfirmClose(false);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !manifest) {
    return <p className="text-xs text-muted-foreground text-center py-8">جاري التحميل...</p>;
  }

  const stillPending = (manifest.items as any[]).filter(i => i.deliveryStatus === "pending").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-4 h-4" /> رجوع للبيانات
        </button>
        <Badge variant="outline" className={locked ? "border-red-500/30 text-red-400 bg-red-500/10" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"}>
          {locked ? <Lock className="w-3 h-3 ml-1" /> : <Unlock className="w-3 h-3 ml-1" />}
          {locked ? "مغلق" : "مفتوح"}
        </Badge>
      </div>

      <Card className="p-3 bg-card/60 border-border">
        <p className="text-sm font-black font-mono">{manifest.manifestNumber}</p>
        <div className="grid grid-cols-3 gap-2 mt-2 text-center">
          <div>
            <p className="text-lg font-black">{manifest.stats?.total ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">إجمالي</p>
          </div>
          <div>
            <p className="text-lg font-black text-emerald-400">{manifest.stats?.delivered ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">مسلَّم</p>
          </div>
          <div>
            <p className="text-lg font-black text-red-400">{manifest.stats?.returned ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">مرتجع</p>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        {(manifest.items as any[]).map(item => (
          <ManifestItemRow key={item.id} item={item} manifestId={manifestId} locked={locked}
            onSaved={() => qc.invalidateQueries({ queryKey: ["rep-manifest", manifestId] })} />
        ))}
        {(manifest.items as any[]).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">لا توجد شحنات في هذا البيان</p>
        )}
      </div>

      {!locked && (
        <div className="pt-2">
          {!confirmClose ? (
            <Button className="w-full gap-2" onClick={() => setConfirmClose(true)}>
              <Lock className="w-4 h-4" /> قفل البيان
            </Button>
          ) : (
            <Card className="p-3 border-amber-500/30 bg-amber-500/5 space-y-2">
              <p className="text-xs flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" /> هتقفل البيان؟ مش هتقدر تعدّل بعد القفل.
              </p>
              {stillPending > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  فيه {stillPending} شحنة لسه قيد الانتظار — هتفضل من غير تحديث.
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 gap-1" disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
                  <PackageCheck className="w-3.5 h-3.5" /> {closeMutation.isPending ? "بيقفل..." : "تأكيد القفل"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmClose(false)}>إلغاء</Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── تاب البيانات — قائمة بيانات الشحن بتاعة المندوب ─────────────────────────
function ManifestsTab({ companyId }: { companyId: number | null }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rep-manifests", companyId],
    queryFn: () => apiFetch(`/shipment-manifests?companyId=${companyId}`),
    enabled: !!companyId,
  });
  const manifests = (data as any[]) ?? [];

  if (selectedId) {
    return <ManifestDetail manifestId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (isLoading) return <p className="text-xs text-muted-foreground text-center py-8">جاري التحميل...</p>;

  return (
    <div className="space-y-2">
      {manifests.map((m: any) => (
        <Card key={m.id} className="p-3 bg-card/60 border-border cursor-pointer hover:bg-card/90 transition-colors"
          onClick={() => setSelectedId(m.id)}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black font-mono">{m.manifestNumber}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {m.createdAt ? format(new Date(m.createdAt), "dd/MM/yyyy", { locale: ar }) : ""} · {m.shipmentCount ?? 0} شحنة
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={m.status === "closed" ? "border-red-500/30 text-red-400 bg-red-500/10 text-[9px]" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[9px]"}>
                {m.status === "closed" ? "مغلق" : "مفتوح"}
              </Badge>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </Card>
      ))}
      {manifests.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">لا توجد بيانات شحن حالياً</p>
      )}
    </div>
  );
}

export default function RepresentativeDashboard() {
  const { user, isRepresentative, isAdmin, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<"shipments" | "manifests">("shipments");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // فقط المندوبين والأدمن
  if (user && !isRepresentative && !isAdmin && !isSuperAdmin) return <Redirect to="/" />;

  const qParams = new URLSearchParams();
  if (dateFrom) qParams.set("dateFrom", dateFrom);
  if (dateTo)   qParams.set("dateTo",   dateTo);

  const { data: dash } = useQuery({
    queryKey: ["rep-dashboard", dateFrom, dateTo],
    queryFn: () => apiFetch(`/representative/dashboard?${qParams}`),
    enabled: !!user,
  });

  const shipParams = new URLSearchParams(qParams);
  shipParams.set("page", String(page));
  shipParams.set("limit", "20");
  if (statusFilter) shipParams.set("status", statusFilter);

  const { data: ships } = useQuery({
    queryKey: ["rep-shipments", dateFrom, dateTo, statusFilter, page],
    queryFn: () => apiFetch(`/representative/shipments?${shipParams}`),
    enabled: !!user,
  });

  const { data: meData } = useQuery({
    queryKey: ["rep-me"],
    queryFn: () => apiFetch("/representative/me"),
    enabled: !!user,
  });

  const d = dash as any;
  const s = ships as any;
  const company = (meData as any)?.company;

  return (
    <div className="space-y-5 p-4 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        {company?.logo
          ? <img src={company.logo} className="w-12 h-12 rounded-full object-cover border-2 border-border" alt={company?.name} />
          : <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary/60" />
            </div>}
        <div>
          <h1 className="text-xl font-black">{company?.name ?? user?.displayName}</h1>
          <p className="text-xs text-muted-foreground">بوابة المندوب</p>
        </div>
        {d?.highReturnRisk && (
          <Badge variant="destructive" className="mr-auto gap-1 text-xs">
            <AlertCircle className="w-3 h-3" /> معدل إرجاع مرتفع
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "shipments" | "manifests")}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="shipments" className="gap-1.5">
            <Package className="w-3.5 h-3.5" /> الشحنات
          </TabsTrigger>
          <TabsTrigger value="manifests" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> البيانات
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "manifests" && <ManifestsTab companyId={company?.id ?? null} />}

      {activeTab === "shipments" && (
        <>
      {/* Date filter */}
      <div className="flex flex-wrap gap-2">
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground" />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
            className="h-8 px-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60">
            مسح
          </button>
        )}
      </div>

      {/* KPI Cards */}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="إجمالي الشحنات"  value={d.total}      color="96,165,250"  icon={Package} />
            <KpiCard label="تم التسليم"        value={d.delivered}  color="52,211,153"  icon={CheckCircle2} />
            <KpiCard label="قيد التسليم"       value={d.inProgress} color="251,191,36"  icon={Clock} />
            <KpiCard label="مرتجع"             value={d.returned}   color="248,113,113" icon={RotateCcw} />
          </div>

          {/* Delivery rate ring + stats */}
          <Card className="p-4 bg-card/60 border-border">
            <div className="flex items-center gap-6">
              <DeliveryRing rate={d.deliveryRate} />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">معدل الإرجاع</span>
                  <span className={d.returnRate > 30 ? "text-red-400 font-bold" : "text-foreground font-bold"}>{d.returnRate}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">مبالغ محصّلة</span>
                  <span className="text-emerald-400 font-bold">{formatCurrency(d.totalCollected)}</span>
                </div>
                {d.topZone && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />أكتر منطقة</span>
                    <span className="font-bold truncate max-w-[120px]">{d.topZone.name} ({d.topZone.count})</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Zones bar chart */}
          {d.zones?.length > 0 && (
            <Card className="p-4 bg-card/60 border-border">
              <p className="text-xs font-bold mb-3 flex items-center gap-1"><MapPin className="w-3 h-3 text-primary" />المناطق</p>
              <div className="space-y-2">
                {(d.zones as any[]).slice(0, 8).map((z: any) => (
                  <div key={z.name}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-muted-foreground truncate">{z.name}</span>
                      <span className="font-bold">{z.count}</span>
                    </div>
                    <div className="w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${Math.round((z.count / d.total) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Shipments list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold">الشحنات</p>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-7 text-xs rounded-md border border-border bg-background px-2 text-foreground">
            <option value="">كل الحالات</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          {s?.data?.map((sh: any) => (
            <Card key={sh.id} className="p-3 bg-card/60 border-border">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{sh.receiverName}</p>
                  <p className="text-[10px] text-muted-foreground flex gap-1 flex-wrap mt-0.5">
                    <span className="font-mono text-primary/70">{sh.shipmentNumber}</span>
                    {sh.receiverPhone && <span>· {sh.receiverPhone}</span>}
                    {sh.receiverCity && <span>· {sh.receiverCity}</span>}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[9px] shrink-0 border ${STATUS_COLOR[sh.status] ?? "border-border"}`}>
                  {STATUS_LABELS[sh.status] ?? sh.status}
                </Badge>
              </div>
              <div className="flex justify-between text-[11px] mt-2">
                <span className="text-muted-foreground">{sh.createdAt ? format(new Date(sh.createdAt), "dd/MM/yyyy", { locale: ar }) : ""}</span>
                <span className="font-bold text-emerald-400">{formatCurrency(Number(sh.codAmount ?? 0))}</span>
              </div>
            </Card>
          ))}
          {s?.data?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">لا توجد شحنات</p>
          )}
        </div>

        {/* Pagination */}
        {s && s.total > 20 && (
          <div className="flex justify-center gap-2 mt-3">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="h-7 px-3 text-xs rounded-md border border-border bg-muted/20 disabled:opacity-40">
              السابق
            </button>
            <span className="text-xs text-muted-foreground self-center">
              {page} / {Math.ceil(s.total / 20)}
            </span>
            <button disabled={page >= Math.ceil(s.total / 20)} onClick={() => setPage(p => p + 1)}
              className="h-7 px-3 text-xs rounded-md border border-border bg-muted/20 disabled:opacity-40">
              التالي
            </button>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
