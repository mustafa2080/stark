import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shipmentManifestsApi, type ShipmentManifestDetail } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowRight, Truck, Package, CheckCircle2, RotateCcw, Clock,
  Lock, Unlock, Trash2, Save, Edit2, X, Phone, MapPin,
} from "lucide-react";
import { format } from "date-fns";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

type DeliveryStatus = "pending" | "delivered" | "returned" | "delayed";

const DELIVERY_OPTIONS: { value: DeliveryStatus; label: string; color: string; bg: string }[] = [
  { value: "pending",   label: "قيد الانتظار", color: "text-muted-foreground", bg: "border-border" },
  { value: "delivered", label: "مسلَّم ✓",      color: "text-emerald-400",      bg: "border-emerald-700 bg-emerald-900/20" },
  { value: "delayed",   label: "مؤجل",          color: "text-orange-400",       bg: "border-orange-700 bg-orange-900/20" },
  { value: "returned",  label: "مرتجع",          color: "text-red-400",          bg: "border-red-700 bg-red-900/20" },
];
const deliveryOpt = (v: DeliveryStatus) => DELIVERY_OPTIONS.find(o => o.value === v) ?? DELIVERY_OPTIONS[0];

function ManifestItemRow({ item, manifestId, locked, onSaved }: {
  item: ShipmentManifestDetail["items"][number];
  manifestId: number;
  locked: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<DeliveryStatus>(item.deliveryStatus);
  const [note, setNote] = useState(item.deliveryNote ?? "");
  const [returnReceived, setReturnReceived] = useState<boolean | null>(
    item.returnReceived === 1 ? true : item.returnReceived === 0 ? false : null
  );

  const mutation = useMutation({
    mutationFn: () => shipmentManifestsApi.updateItem(manifestId, item.shipmentId, {
      deliveryStatus: status,
      deliveryNote: note.trim() || null,
      ...(status === "returned" ? { returnReceived } : {}),
    }),
    onSuccess: () => { toast({ title: "تم حفظ الحالة" }); setEditing(false); onSaved(); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const opt = deliveryOpt(item.deliveryStatus);
  const s = item.shipment;
  const needsNote = status === "delayed" || status === "returned";

  return (
    <div className={`border-b border-border/50 ${editing ? "bg-primary/5" : "hover:bg-muted/10"} transition-colors`}>
      <div className="flex flex-col md:flex-row md:items-center gap-2 px-3 py-2.5 text-xs">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">{s?.receiverName ?? "—"}</span>
            <span className="font-mono text-[10px] text-primary/70">{s?.shipmentNumber}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
            {s?.receiverPhone && <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5" />{s.receiverPhone}</span>}
            {s?.receiverCity && <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{s.receiverCity}</span>}
            {s?.codAmount && Number(s.codAmount) > 0 && <span className="font-bold text-primary">{formatCurrency(Number(s.codAmount))}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={`text-[9px] font-bold border ${opt.bg} ${opt.color}`}>{opt.label}</Badge>
          {item.deliveryStatus === "returned" && item.returnReceived === 1 && (
            <span className="text-[10px] text-emerald-500">↩ تم استلامه</span>
          )}
          {item.deliveryStatus === "returned" && item.returnReceived === 0 && (
            <span className="text-[10px] text-orange-500">🚚 عند الشحن</span>
          )}
          {item.deliveryNote && !editing && (
            <span className="text-[10px] text-muted-foreground max-w-[120px] truncate">{item.deliveryNote}</span>
          )}
          {!locked ? (
            editing ? (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => setEditing(false)}>
                <X className="w-3 h-3" />
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-primary" onClick={() => setEditing(true)}>
                <Edit2 className="w-3 h-3 ml-0.5" />تعديل
              </Button>
            )
          ) : s ? (
            <Link href={`/shipments/${s.id}`}>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-primary">عرض</Button>
            </Link>
          ) : null}
        </div>
      </div>

      {editing && (
        <div className="px-4 pb-3 flex flex-col gap-2 bg-primary/5 border-t border-primary/10">
          <div className="flex flex-wrap gap-2 items-end mt-2">
            <div>
              <Label className="text-[10px] mb-1 block text-muted-foreground">حالة التسليم</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DeliveryStatus)}>
                <SelectTrigger className="h-8 text-xs w-40 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      <span className={o.color}>{o.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {status === "returned" && (
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground">حالة الاستلام *</Label>
                <Select
                  value={returnReceived === true ? "received" : returnReceived === false ? "at_shipping" : ""}
                  onValueChange={v => setReturnReceived(v === "received" ? true : v === "at_shipping" ? false : null)}
                >
                  <SelectTrigger className="h-8 text-xs w-48 bg-background border-red-800/60"><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received" className="text-xs"><span className="text-emerald-400">↩ تم استلام المرتجع</span></SelectItem>
                    <SelectItem value="at_shipping" className="text-xs"><span className="text-orange-400">🚚 مازال عند الشحن</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-[10px] mb-1 block text-muted-foreground">{needsNote ? "سبب / ملاحظة (مطلوب)" : "ملاحظة (اختياري)"}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs bg-background" placeholder="ملاحظة..." />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || (needsNote && !note.trim()) || (status === "returned" && returnReceived === null)}
            >
              <Save className="w-3 h-3" />{mutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShipmentManifestDetailPage() {
  const params = useParams();
  const manifestId = Number(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { can, isAdmin } = useAuth();
  const canManifests = isAdmin || can("shipping.manifests");
  const canFinancials = isAdmin || can("shipping.financials");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [invoicePrice, setInvoicePrice] = useState("");
  const [editingInvoice, setEditingInvoice] = useState(false);

  const { data: manifest, isLoading, refetch } = useQuery({
    queryKey: ["shipment-manifest", manifestId],
    queryFn: () => shipmentManifestsApi.get(manifestId),
    enabled: !isNaN(manifestId),
  });

  const toggleLockMutation = useMutation({
    mutationFn: (status: "open" | "closed") => shipmentManifestsApi.update(manifestId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-manifest", manifestId] });
      qc.invalidateQueries({ queryKey: ["shipment-manifests"] });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const saveInvoiceMutation = useMutation({
    mutationFn: () => shipmentManifestsApi.update(manifestId, { invoicePrice: invoicePrice.trim() ? Number(invoicePrice) : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-manifest", manifestId] });
      setEditingInvoice(false);
      toast({ title: "تم الحفظ" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => shipmentManifestsApi.delete(manifestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-manifests"] });
      toast({ title: "تم حذف البيان" });
      window.history.back();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  if (isNaN(manifestId)) return <div className="p-8 text-center text-muted-foreground">معرّف غير صحيح</div>;
  if (isLoading || !manifest) return <div className="p-12 text-center text-muted-foreground text-sm animate-pulse">جاري التحميل...</div>;

  const locked = manifest.status === "closed";
  const { stats } = manifest;

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500" dir="rtl">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/shipping/company/${manifest.shippingCompanyId}`}>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-border">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border">
            {manifest.company?.logo
              ? <img src={manifest.company.logo} alt={manifest.company.name} className="w-full h-full object-cover" />
              : <Truck className="w-5 h-5 text-muted-foreground" />}
          </div>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              {manifest.manifestNumber}
              <Badge variant="outline" className={`text-[9px] font-bold border ${locked ? "border-emerald-700 bg-emerald-900/20 text-emerald-400" : "border-blue-700 bg-blue-900/20 text-blue-400"}`}>
                {locked ? <><Lock className="w-2.5 h-2.5 inline ml-0.5" />مغلق</> : <><Clock className="w-2.5 h-2.5 inline ml-0.5" />مفتوح</>}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{manifest.company?.name} · {format(new Date(manifest.createdAt), "yyyy/MM/dd")}</p>
          </div>
        </div>
        {canManifests && (
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              className="h-8 text-xs gap-1"
              onClick={() => toggleLockMutation.mutate(locked ? "open" : "closed")}
              disabled={toggleLockMutation.isPending}
            >
              {locked ? <><Unlock className="w-3.5 h-3.5" />فتح البيان</> : <><Lock className="w-3.5 h-3.5" />تقفيل البيان</>}
            </Button>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive border-destructive/30" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* ─── Stats ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي الشحنات</p>
          <p className="text-2xl font-black">{stats.total}</p>
        </Card>
        <Card className="border-emerald-900/40 bg-emerald-900/10 p-3 text-center">
          <p className="text-[10px] text-emerald-400 mb-0.5 flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3" />مُسلَّم</p>
          <p className="text-2xl font-black text-emerald-400">{stats.delivered}</p>
        </Card>
        <Card className="border-red-900/40 bg-red-900/10 p-3 text-center">
          <p className="text-[10px] text-red-400 mb-0.5 flex items-center justify-center gap-1"><RotateCcw className="w-3 h-3" />مرتجع</p>
          <p className="text-2xl font-black text-red-400">{stats.returned}</p>
        </Card>
        <Card className="border-amber-900/40 bg-amber-900/10 p-3 text-center">
          <p className="text-[10px] text-amber-400 mb-0.5 flex items-center justify-center gap-1"><Clock className="w-3 h-3" />قيد الانتظار</p>
          <p className="text-2xl font-black text-amber-400">{stats.pending + stats.delayed}</p>
        </Card>
      </div>

      {/* ─── Invoice price (financials only) ─── */}
      {canFinancials && (
        <Card className="border-border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">قيمة فاتورة الشحن:</span>
            {editingInvoice ? (
              <Input
                type="number" value={invoicePrice} onChange={(e) => setInvoicePrice(e.target.value)}
                className="h-7 w-32 text-xs bg-background" placeholder="0"
              />
            ) : (
              <span className="font-bold">{manifest.invoicePrice ? formatCurrency(Number(manifest.invoicePrice)) : "—"}</span>
            )}
          </div>
          {canManifests && (
            editingInvoice ? (
              <div className="flex gap-1">
                <Button size="sm" className="h-7 text-[11px]" onClick={() => saveInvoiceMutation.mutate()} disabled={saveInvoiceMutation.isPending}>حفظ</Button>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setEditingInvoice(false)}>إلغاء</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => { setInvoicePrice(manifest.invoicePrice ?? ""); setEditingInvoice(true); }}>
                <Edit2 className="w-3 h-3" />تعديل
              </Button>
            )
          )}
        </Card>
      )}

      {/* ─── Notes ─── */}
      {manifest.notes && (
        <Card className="border-border bg-card p-3 text-xs text-muted-foreground">{manifest.notes}</Card>
      )}

      {/* ─── Items ─── */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-muted/20 border-b border-border text-xs font-semibold flex items-center gap-2">
          <Package className="w-3.5 h-3.5" />الشحنات ({manifest.items.length})
        </div>
        {manifest.items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">لا توجد شحنات في هذا البيان</div>
        ) : (
          manifest.items.map(item => (
            <ManifestItemRow key={item.id} item={item} manifestId={manifestId} locked={locked} onSaved={refetch} />
          ))
        )}
      </div>

      {/* ─── Delete confirm ─── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف البيان</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف بيان <strong>{manifest.manifestNumber}</strong>؟ ستُرجَّع كل الشحنات الموجودة فيه لحالة "انتظار".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteMutation.mutate()}>نعم، احذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
