import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shipmentManifestsApi, type ShipmentManifestDetail } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
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
  ArrowRight, Package, CheckCircle2, Clock, AlertTriangle,
  Lock, Unlock, Trash2, Edit2, Save, X, Search, TrendingUp, TrendingDown, Receipt,
} from "lucide-react";
import { format } from "date-fns";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

type DeliveryStatus = "pending" | "delivered" | "returned" | "delayed";

const DELIVERY_OPTIONS: { value: DeliveryStatus; label: string; color: string; bg: string }[] = [
  { value: "pending",   label: "قيد الانتظار", color: "text-muted-foreground",                        bg: "border-border" },
  { value: "delivered", label: "مُسلَّم ✓",     color: "text-emerald-700 dark:text-emerald-400",       bg: "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20" },
  { value: "delayed",   label: "مؤجل",          color: "text-orange-700  dark:text-orange-400",        bg: "border-orange-300  dark:border-orange-700  bg-orange-50  dark:bg-orange-900/20" },
  { value: "returned",  label: "مرتجع",         color: "text-red-700     dark:text-red-400",           bg: "border-red-300     dark:border-red-700     bg-red-50     dark:bg-red-900/20" },
];

const deliveryOpt = (v: DeliveryStatus) =>
  DELIVERY_OPTIONS.find((o) => o.value === v) ?? DELIVERY_OPTIONS[0];

type ManifestItem = ShipmentManifestDetail["items"][0];

function ShipmentItemRow({
  item, manifestId, locked, onSaved,
}: { item: ManifestItem; manifestId: number; locked: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<DeliveryStatus>(item.deliveryStatus);
  const [note, setNote] = useState(item.deliveryNote ?? "");
  const [returnReceived, setReturnReceived] = useState<boolean | null>(
    item.returnReceived === 1 ? true : item.returnReceived === 0 ? false : null
  );

  const mutation = useMutation({
    mutationFn: () =>
      shipmentManifestsApi.updateItem(manifestId, item.shipmentId, {
        deliveryStatus: status,
        deliveryNote: note.trim() || null,
        ...(status === "returned" ? { returnReceived } : {}),
      }),
    onSuccess: () => { toast({ title: "تم حفظ حالة التسليم" }); setEditing(false); onSaved(); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const s = item.shipment;
  const opt = deliveryOpt(item.deliveryStatus);

  return (
    <div className={`border-b border-border/50 transition-colors ${editing ? "bg-primary/5" : "hover:bg-muted/10"}`}>
      <div className="flex items-start gap-3 px-4 py-3 text-xs">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{s?.receiverName ?? "—"}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {s?.shipmentNumber && <span className="text-[10px] font-mono text-primary/70 bg-primary/10 px-1 rounded">{s.shipmentNumber}</span>}
            {s?.receiverPhone && <span className="text-[10px] text-muted-foreground">{s.receiverPhone}</span>}
            {s?.receiverCity && <span className="text-[10px] text-muted-foreground">📍 {s.receiverCity}</span>}
          </div>
        </div>
        <div className="text-left font-bold shrink-0">{formatCurrency(Number(s?.codAmount ?? 0))}</div>
        <div className="shrink-0">
          <Badge variant="outline" className={`text-[9px] font-bold border ${opt.bg} ${opt.color}`}>{opt.label}</Badge>
          {item.deliveryStatus === "returned" && item.returnReceived === 1 && <p className="text-[10px] text-emerald-600 mt-0.5 font-semibold">↩ تم الاستلام</p>}
          {item.deliveryStatus === "returned" && item.returnReceived === 0 && <p className="text-[10px] text-orange-500 mt-0.5 font-semibold">⏳ عند الشحن</p>}
          {item.deliveryStatus === "delayed" && item.deliveryNote && !editing && <p className="text-[10px] text-orange-400 mt-0.5">⏸ {item.deliveryNote}</p>}
        </div>
        {!locked && (
          editing
            ? <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-muted-foreground shrink-0" onClick={() => { setEditing(false); setStatus(item.deliveryStatus); setNote(item.deliveryNote ?? ""); }}><X className="w-3 h-3" /></Button>
            : <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-primary shrink-0" onClick={() => { setStatus(item.deliveryStatus); setNote(item.deliveryNote ?? ""); setReturnReceived(item.returnReceived === 1 ? true : item.returnReceived === 0 ? false : null); setEditing(true); }}><Edit2 className="w-3 h-3 ml-0.5" />تقفيل</Button>
        )}
      </div>
      {editing && (
        <div className="px-4 pb-3 flex flex-col gap-2 bg-primary/5 border-t border-primary/10">
          <div className="flex flex-wrap gap-2 items-end mt-2">
            <div>
              <Label className="text-[10px] mb-1 block text-muted-foreground">حالة التسليم</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DeliveryStatus)}>
                <SelectTrigger className="h-8 text-xs w-40 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>{DELIVERY_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value} className="text-xs"><span className={o.color}>{o.label}</span></SelectItem>))}</SelectContent>
              </Select>
            </div>
            {status === "returned" && (
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground">حالة الاستلام *</Label>
                <Select value={returnReceived === true ? "received" : returnReceived === false ? "at_shipping" : ""} onValueChange={v => setReturnReceived(v === "received" ? true : v === "at_shipping" ? false : null)}>
                  <SelectTrigger className="h-8 text-xs w-44 bg-background border-red-800/60"><SelectValue placeholder="اختر الحالة..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received" className="text-xs"><span className="text-emerald-600 dark:text-emerald-400">↩ تم الاستلام في المخزن</span></SelectItem>
                    <SelectItem value="at_shipping" className="text-xs"><span className="text-orange-600 dark:text-orange-400">🚚 مازال في الشحن</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-[10px] mb-1 block text-muted-foreground">ملاحظة</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs bg-background" placeholder="سبب التأجيل أو الإرجاع..." />
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-[11px] bg-primary text-primary-foreground gap-1" onClick={() => mutation.mutate()} disabled={mutation.isPending || (status === "returned" && returnReceived === null)}>
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
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, can } = useAuth();
  const [search, setSearch] = useState("");
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [invoicePrice, setInvoicePrice] = useState("");

  const { data: manifest, isLoading, error } = useQuery({
    queryKey: ["shipment-manifest", id],
    queryFn: () => shipmentManifestsApi.get(id),
    enabled: !isNaN(id),
  });

  const closeMutation = useMutation({
    mutationFn: () => shipmentManifestsApi.update(id, { status: "closed" }),
    onSuccess: () => { toast({ title: "تم تقفيل البيان" }); queryClient.invalidateQueries({ queryKey: ["shipment-manifest", id] }); queryClient.invalidateQueries({ queryKey: ["shipment-manifests"] }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const reopenMutation = useMutation({
    mutationFn: () => shipmentManifestsApi.update(id, { status: "open" }),
    onSuccess: () => { toast({ title: "تم إعادة فتح البيان" }); queryClient.invalidateQueries({ queryKey: ["shipment-manifest", id] }); queryClient.invalidateQueries({ queryKey: ["shipment-manifests"] }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => shipmentManifestsApi.delete(id),
    onSuccess: () => { toast({ title: "تم حذف البيان" }); window.history.back(); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const invoiceMutation = useMutation({
    mutationFn: () => {
      const val = invoicePrice.trim() === "" ? null : parseFloat(invoicePrice);
      return shipmentManifestsApi.update(id, { invoicePrice: val });
    },
    onSuccess: () => { toast({ title: "تم حفظ قيمة الفاتورة" }); setEditingInvoice(false); queryClient.invalidateQueries({ queryKey: ["shipment-manifest", id] }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const onSaved = () => queryClient.invalidateQueries({ queryKey: ["shipment-manifest", id] });

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm animate-pulse">جاري التحميل...</div>;

  if (error || !manifest) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertTriangle className="w-8 h-8 text-destructive opacity-50" />
      <p className="text-sm text-muted-foreground">لم يتم العثور على البيان</p>
      <Link href="/shipping"><Button variant="outline" size="sm" className="gap-1.5"><ArrowRight className="w-3.5 h-3.5" />العودة</Button></Link>
    </div>
  );

  const locked = manifest.status === "closed";
  const canManage = isAdmin || can("shipping.manifests");
  const filteredItems = manifest.items.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const s = item.shipment;
    return s?.receiverName?.toLowerCase().includes(q) || s?.shipmentNumber?.toLowerCase().includes(q) || s?.receiverPhone?.includes(q) || s?.receiverCity?.toLowerCase().includes(q);
  });

  const stats = manifest.stats;
  const codTotal = manifest.items.reduce((sum, item) => sum + Number(item.shipment?.codAmount ?? 0), 0);
  const deliveredTotal = manifest.items.filter(i => i.deliveryStatus === "delivered").reduce((sum, item) => sum + Number(item.shipment?.codAmount ?? 0), 0);
  const invoicePriceNum = manifest.invoicePrice ? parseFloat(manifest.invoicePrice) : 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/shipping"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowRight className="w-4 h-4" /></Button></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{manifest.manifestNumber}</h1>
            <Badge variant="outline" className={`text-xs font-bold border ${locked ? "border-emerald-700 bg-emerald-900/20 text-emerald-400" : "border-blue-700 bg-blue-900/20 text-blue-400"}`}>
              {locked ? <><CheckCircle2 className="inline w-3 h-3 ml-1" />مقفول</> : <><Clock className="inline w-3 h-3 ml-1" />مفتوح</>}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{manifest.company?.name ?? "—"} · {format(new Date(manifest.createdAt), "yyyy/MM/dd")} · {stats.total} شحنة</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {locked
              ? <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-amber-700 text-amber-400 hover:bg-amber-900/20" onClick={() => setShowReopenDialog(true)}><Unlock className="w-3.5 h-3.5" />إعادة فتح</Button>
              : <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setShowCloseDialog(true)}><Lock className="w-3.5 h-3.5" />تقفيل البيان</Button>
            }
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteDialog(true)}><Trash2 className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
