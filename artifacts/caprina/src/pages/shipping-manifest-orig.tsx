import { useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  manifestsApi,
  type ShippingManifestDetail,
  type ManifestOrder,
  type DeliveryStatus,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  Truck,
  Package,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Clock,
  Printer,
  Lock,
  Unlock,
  Trash2,
  Save,
  Receipt,
  Banknote,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Edit2,
  X,
  Check,
  FileText,
} from "lucide-react";
import { format } from "date-fns";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(n);

const DELIVERY_OPTIONS: { value: DeliveryStatus; label: string; color: string; bg: string }[] = [
  { value: "pending",          label: "┘é┘è╪» ╪د┘╪د┘╪ز╪╕╪د╪▒",   color: "text-muted-foreground",                                          bg: "border-border" },
  { value: "delivered",        label: "┘à╪│┘┘┘ّ┘à ظ£ô",        color: "text-emerald-700 dark:text-emerald-400",                         bg: "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20" },
  { value: "postponed",        label: "┘à╪ج╪ش┘",            color: "text-orange-700  dark:text-orange-400",                          bg: "border-orange-300  dark:border-orange-700  bg-orange-50  dark:bg-orange-900/20" },
  { value: "partial_received", label: "╪د╪│╪ز┘┘à ╪ش╪▓╪خ┘è",     color: "text-teal-700    dark:text-teal-400",                            bg: "border-teal-300    dark:border-teal-700    bg-teal-50    dark:bg-teal-900/20" },
  { value: "returned",         label: "┘à╪▒╪ز╪ش╪╣",           color: "text-red-700     dark:text-red-400",                             bg: "border-red-300     dark:border-red-700     bg-red-50     dark:bg-red-900/20" },
];

const deliveryOpt = (v: DeliveryStatus) =>
  DELIVERY_OPTIONS.find((o) => o.value === v) ?? DELIVERY_OPTIONS[0];

function OrderDeliveryRow({
  order,
  manifestId,
  locked,
  onSaved,
}: {
  order: ManifestOrder;
  manifestId: number;
  locked: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<DeliveryStatus>(order.deliveryStatus);
  const [note, setNote] = useState(order.deliveryNote ?? "");
  const [partialQty, setPartialQty] = useState(
    order.partialQuantity?.toString() ?? ""
  );

  const mutation = useMutation({
    mutationFn: () =>
      manifestsApi.updateOrderDelivery(manifestId, order.id, {
        deliveryStatus: status,
        deliveryNote: note.trim() || null,
        partialQuantity:
          status === "partial_received" && partialQty
            ? parseInt(partialQty)
            : null,
      }),
    onSuccess: () => {
      toast({ title: "╪ز┘à ╪ص┘╪╕ ╪ص╪د┘╪ر ╪د┘╪ز╪│┘┘è┘à" });
      setEditing(false);
      onSaved();
    },
    onError: (e: any) =>
      toast({ title: "╪«╪╖╪ث", description: e.message, variant: "destructive" }),
  });

  const opt = deliveryOpt(order.deliveryStatus);
  const needsNote = status === "postponed" || status === "returned";
  const needsPartial = status === "partial_received";

  const hasChanges =
    status !== order.deliveryStatus ||
    note !== (order.deliveryNote ?? "") ||
    (status === "partial_received" &&
      partialQty !== (order.partialQuantity?.toString() ?? ""));

  return (
    <div className={`border-b border-border/50 transition-colors ${editing ? "bg-primary/5" : "hover:bg-muted/10"}`}>
      {/* Main row */}
      <div className="grid grid-cols-[1fr_1fr_60px_80px_120px_80px] gap-0 items-start px-3 py-2.5 text-xs">
        {/* Customer */}
        <div className="min-w-0 pr-1">
          <p className="font-semibold truncate">{order.customerName}</p>
          <p className="text-muted-foreground text-[10px] flex gap-1">
            <span className="font-mono">#{order.id.toString().padStart(4, "0")}</span>
            {order.phone && <span>┬╖ {order.phone}</span>}
          </p>
        </div>
        {/* Product */}
        <div className="min-w-0 pr-2">
          <p className="truncate">{order.product}</p>
          {(order.color || order.size) && (
            <p className="text-muted-foreground text-[10px]">
              {[order.color, order.size].filter(Boolean).join(" / ")}
            </p>
          )}
        </div>
        {/* Qty */}
        <div className="text-center font-bold">
          {order.deliveryStatus === "partial_received" && order.partialQuantity ? (
            <span>
              <span className="text-teal-400">{order.partialQuantity}</span>
              <span className="text-muted-foreground">/{order.quantity}</span>
            </span>
          ) : (
            order.quantity
          )}
        </div>
        {/* Price */}
        <div className="text-left font-bold">{formatCurrency(order.totalPrice)}</div>
        {/* Delivery Status Badge */}
        <div>
          <Badge
            variant="outline"
            className={`text-[9px] font-bold border ${opt.bg} ${opt.color}`}
          >
            {opt.label}
          </Badge>
          {order.deliveryNote && !editing && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[110px]">
              {order.deliveryNote}
            </p>
          )}
        </div>
        {/* Action */}
        <div className="flex justify-end">
          {!locked && (
            editing ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-1.5 text-muted-foreground"
                onClick={() => {
                  setEditing(false);
                  setStatus(order.deliveryStatus);
                  setNote(order.deliveryNote ?? "");
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-1.5 text-primary hover:text-primary"
                onClick={() => setEditing(true)}
              >
                <Edit2 className="w-3 h-3 ml-0.5" />╪ز┘é┘┘è┘
              </Button>
            )
          )}
          {locked && (
            <Link href={`/orders/${order.id}`}>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-primary hover:text-primary">
                ╪╣╪▒╪╢
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Editing panel */}
      {editing && (
        <div className="px-4 pb-3 flex flex-col gap-2 bg-primary/5 border-t border-primary/10">
          <div className="flex flex-wrap gap-2 items-end mt-2">
            <div>
              <Label className="text-[10px] mb-1 block text-muted-foreground">╪ص╪د┘╪ر ╪د┘╪ز╪│┘┘è┘à</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as DeliveryStatus)}
              >
                <SelectTrigger className="h-8 text-xs w-40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      <span className={o.color}>{o.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsPartial && (
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground">
                  ╪د┘┘â┘à┘è╪ر ╪د┘┘à╪│╪ز┘┘à╪ر (┘à┘ {order.quantity})
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={order.quantity}
                  value={partialQty}
                  onChange={(e) => setPartialQty(e.target.value)}
                  className="h-8 text-xs w-28 bg-background"
                  placeholder="╪د┘┘â┘à┘è╪ر"
                />
              </div>
            )}
          </div>

          {(needsNote || needsPartial || status === "pending") && (
            <div>
              <Label className="text-[10px] mb-1 block text-muted-foreground">
                {needsNote ? "╪│╪ذ╪ذ / ┘à┘╪د╪ص╪╕╪ر (┘à╪╖┘┘ê╪ذ)" : "┘à┘╪د╪ص╪╕╪ر (╪د╪«╪ز┘è╪د╪▒┘è)"}
              </Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-8 text-xs bg-background"
                placeholder={
                  status === "postponed"
                    ? "┘à╪س╪د┘: ╪د┘╪╣┘à┘è┘ ╪╖┘╪ذ ╪د┘╪ز╪ث╪ش┘è┘ ╪ث╪│╪ذ┘ê╪╣╪د┘ï..."
                    : status === "returned"
                    ? "┘à╪س╪د┘: ╪د┘╪╣┘à┘è┘ ╪▒┘╪╢ ╪د┘╪د╪│╪ز┘╪د┘à..."
                    : "┘à┘╪د╪ص╪╕╪ر..."
                }
              />
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              className="h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                !hasChanges ||
                (needsNote && !note.trim()) ||
                (needsPartial && (!partialQty || parseInt(partialQty) < 1))
              }
            >
              <Save className="w-3 h-3" />
              {mutation.isPending ? "╪ش╪د╪▒┘è ╪د┘╪ص┘╪╕..." : "╪ص┘╪╕"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoicePriceEditor({
  manifestId,
  current,
  currentNotes,
  onSaved,
}: {
  manifestId: number;
  current: number | null;
  currentNotes: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(current?.toString() ?? "");
  const [notes, setNotes] = useState(currentNotes ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      manifestsApi.update(manifestId, {
        invoicePrice: price ? parseFloat(price) : null,
        invoiceNotes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "╪ز┘à ╪ص┘╪╕ ╪│╪╣╪▒ ╪د┘┘╪د╪ز┘ê╪▒╪ر" });
      setEditing(false);
      onSaved();
    },
    onError: (e: any) =>
      toast({ title: "╪«╪╖╪ث", description: e.message, variant: "destructive" }),
  });

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <div>
          {current != null ? (
            <span className="text-lg font-black text-primary">
              {formatCurrency(current)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">┘┘à ┘è┘╪ص╪»┘┘ّ╪» ╪ذ╪╣╪»</span>
          )}
          {currentNotes && (
            <p className="text-[10px] text-muted-foreground">{currentNotes}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setPrice(current?.toString() ?? "");
            setNotes(currentNotes ?? "");
            setEditing(true);
          }}
        >
          <Edit2 className="w-3 h-3" />╪ز╪╣╪»┘è┘
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.01"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="h-8 text-sm w-36 bg-background"
          placeholder="0.00"
          autoFocus
        />
        <span className="text-xs text-muted-foreground">╪ش.┘à</span>
        <Button
          size="sm"
          className="h-7 text-xs gap-1 bg-primary text-primary-foreground"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          <Check className="w-3 h-3" />╪ص┘╪╕
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setEditing(false)}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      <Input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="h-8 text-xs bg-background"
        placeholder="┘à┘╪د╪ص╪╕╪د╪ز ╪د┘┘╪د╪ز┘ê╪▒╪ر (╪د╪«╪ز┘è╪د╪▒┘è)..."
      />
    </div>
  );
}

function SettlementCard({ manifest }: { manifest: ShippingManifestDetail }) {
  const s = manifest.stats;
  const invoicePrice = manifest.invoicePrice ?? 0;

  const deliveredTotal = s.deliveredGross;
  const netBeforeInvoice = deliveredTotal - s.totalShippingCost;
  const balance = invoicePrice > 0 ? invoicePrice - netBeforeInvoice : null;

  return (
    <Card className="border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-primary" />
        <h2 className="font-bold text-sm">╪ذ┘è╪د┘ ╪د┘╪ز╪│┘ê┘è╪ر ظ¤ ╪د┘╪ص╪│╪د╪ذ ┘à╪╣ ╪┤╪▒┘â╪ر ╪د┘╪┤╪ص┘</h2>
        {manifest.status === "closed" && (
          <Badge variant="outline" className="text-[9px] border-emerald-500 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 mr-auto">
            ┘à┘╪║┘┘é
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-card rounded-md p-3 border border-border">
          <p className="text-[10px] text-muted-foreground mb-1">╪ح╪ش┘à╪د┘┘è ╪د┘┘à╪│┘┘┘ّ┘à</p>
          <p className="text-base font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(deliveredTotal)}</p>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-600">{s.delivered} ╪╖┘╪ذ┘è╪ر</p>
        </div>
        <div className="bg-card rounded-md p-3 border border-border">
          <p className="text-[10px] text-muted-foreground mb-1">╪▒╪│┘ê┘à ╪د┘╪┤╪ص┘</p>
          <p className="text-base font-black text-amber-700 dark:text-amber-400">ظêْ{formatCurrency(s.totalShippingCost)}</p>
          <p className="text-[10px] text-amber-600">┘à┘╪«╪╡┘ê┘à╪ر</p>
        </div>
        <div className="bg-card rounded-md p-3 border border-border">
          <p className="text-[10px] text-muted-foreground mb-1">╪╡╪د┘┘è ╪د┘┘à╪│╪ز╪ص┘é</p>
          <p className="text-base font-black text-primary">{formatCurrency(netBeforeInvoice)}</p>
          <p className="text-[10px] text-muted-foreground">╪ذ╪╣╪» ╪د┘╪┤╪ص┘</p>
        </div>
        <div className={`rounded-md p-3 border ${manifest.invoicePrice != null ? "bg-card border-border" : "bg-muted/20 border-dashed border-border"}`}>
          <p className="text-[10px] text-muted-foreground mb-1">╪│╪╣╪▒ ╪د┘┘╪د╪ز┘ê╪▒╪ر ╪د┘┘à╪ز┘┘é</p>
          {manifest.invoicePrice != null ? (
            <>
              <p className="text-base font-black">{formatCurrency(manifest.invoicePrice)}</p>
              <p className="text-[10px] text-muted-foreground">╪د┘┘à╪ذ┘╪║ ╪د┘┘à╪ز┘┘é</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground/50">╪║┘è╪▒ ┘à╪ص╪»╪»</p>
          )}
        </div>
      </div>

      {/* Balance */}
      {balance !== null && (
        <div className={`rounded-md p-3 border flex items-center justify-between ${balance >= 0 ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/10" : "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/10"}`}>
          <div>
            <p className={`text-xs font-bold mb-0.5 ${balance >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
              {balance >= 0 ? "ظ£ô ┘╪▒┘é ┘╪╡╪د┘╪ص┘╪د" : "ظأب ┘╪▒┘é ╪╣┘┘ë ╪ص╪│╪د╪ذ┘╪د"}
            </p>
            <p className={`text-xl font-black ${balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {formatCurrency(Math.abs(balance))}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              ╪د┘┘╪د╪ز┘ê╪▒╪ر ({formatCurrency(invoicePrice)}) {balance >= 0 ? "╪ث╪╣┘┘ë" : "╪ث┘é┘"} ┘à┘ ╪د┘╪╡╪د┘┘è ({formatCurrency(netBeforeInvoice)})
            </p>
          </div>
          {balance >= 0
            ? <TrendingUp className="w-10 h-10 text-emerald-500 dark:text-emerald-400 opacity-20" />
            : <AlertTriangle className="w-10 h-10 text-red-500 dark:text-red-400 opacity-20" />}
        </div>
      )}

      {manifest.invoiceNotes && (
        <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3">
          ┘à┘╪د╪ص╪╕╪د╪ز ╪د┘┘╪د╪ز┘ê╪▒╪ر: {manifest.invoiceNotes}
        </p>
      )}
    </Card>
  );
}

function CloseConfirmDialog({
  manifest,
  onClose,
  onConfirm,
  loading,
}: {
  manifest: ShippingManifestDetail;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const s = manifest.stats;
  const pendingCount = manifest.orders.filter(
    (o) => o.deliveryStatus === "pending"
  ).length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ╪ح╪║┘╪د┘é ╪د┘╪ذ┘è╪د┘ {manifest.manifestNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {pendingCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                ┘è┘ê╪ش╪» <strong>{pendingCount}</strong> ╪╖┘╪ذ┘è╪ر ┘┘à ┘è┘╪ص╪»┘┘ّ╪» ┘ê╪╢╪╣┘ç╪د ╪ذ╪╣╪». ┘ç┘ ╪ز╪▒┘è╪» ╪د┘╪ح╪║┘╪د┘é ╪▒╪║┘à ╪░┘┘â╪ا
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-md bg-muted/20 border border-border">
              <p className="text-muted-foreground">╪ح╪ش┘à╪د┘┘è ╪د┘╪╖┘╪ذ┘è╪د╪ز</p>
              <p className="font-bold text-base">{s.total}</p>
            </div>
            <div className="p-2 rounded-md bg-emerald-900/10 border border-emerald-700">
              <p className="text-emerald-400">┘à╪│┘┘┘ّ┘à</p>
              <p className="font-bold text-base text-emerald-400">{s.delivered}</p>
            </div>
            <div className="p-2 rounded-md bg-orange-900/10 border border-orange-700">
              <p className="text-orange-400">┘à╪ج╪ش┘</p>
              <p className="font-bold text-base text-orange-400">
                {manifest.orders.filter((o) => o.deliveryStatus === "postponed").length}
              </p>
            </div>
            <div className="p-2 rounded-md bg-red-900/10 border border-red-700">
              <p className="text-red-400">┘à╪▒╪ز╪ش╪╣</p>
              <p className="font-bold text-base text-red-400">{s.returned}</p>
            </div>
          </div>

          <div className="p-3 rounded-md bg-primary/10 border border-primary/30 text-xs">
            <p className="text-muted-foreground mb-1">╪╡╪د┘┘è ╪د┘┘à╪│╪ز╪ص┘é ┘à┘ ╪د┘╪┤╪▒┘â╪ر</p>
            <p className="font-black text-lg text-primary">
              {formatCurrency(s.deliveredGross - s.totalShippingCost)}
            </p>
            {manifest.invoicePrice != null && (
              <p className="text-muted-foreground mt-1">
                ╪│╪╣╪▒ ╪د┘┘╪د╪ز┘ê╪▒╪ر ╪د┘┘à╪ز┘┘é: {formatCurrency(manifest.invoicePrice)}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 mt-2">
          <Button
            className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white gap-1"
            onClick={onConfirm}
            disabled={loading}
          >
            <Lock className="w-3 h-3" />
            {loading ? "╪ش╪د╪▒┘è ╪د┘╪ح╪║┘╪د┘é..." : "╪ز╪ث┘â┘è╪» ╪د┘╪ح╪║┘╪د┘é"}
          </Button>
          <Button variant="outline" className="border-border" onClick={onClose}>
            ╪ح┘╪║╪د╪ة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ShippingManifestPage() {
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showOrders, setShowOrders] = useState(true);

  const { data: manifest, isLoading, error } = useQuery({
    queryKey: ["shipping-manifest", id],
    queryFn: () => manifestsApi.get(id),
    enabled: !isNaN(id),
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["shipping-manifest", id] });
    queryClient.invalidateQueries({ queryKey: ["shipping-manifests"] });
  }, [queryClient, id]);

  const updateMutation = useMutation({
    mutationFn: (data: { status: "open" | "closed" }) =>
      manifestsApi.update(id, data),
    onSuccess: (result) => {
      refetch();
      setShowCloseDialog(false);
      if (result.rolledOverManifest) {
        toast({
          title: "ظ£à ╪ز┘à ╪ح╪║┘╪د┘é ╪د┘╪ذ┘è╪د┘",
          description: `${result.rolledOverManifest.orderCount} ╪╖┘╪ذ┘è╪ر ┘à╪╣┘┘é╪ر ╪▒┘╪ص┘┘ّ┘╪ز ╪ز┘┘é╪د╪خ┘è╪د┘ï ╪ح┘┘ë ╪ذ┘è╪د┘ ╪ش╪»┘è╪»: ${result.rolledOverManifest.manifestNumber}`,
        });
        queryClient.invalidateQueries({ queryKey: ["shipping-manifests"] });
      } else {
        toast({ title: manifest?.status === "open" ? "╪ز┘à ╪ح╪║┘╪د┘é ╪د┘╪ذ┘è╪د┘" : "╪ز┘à ┘╪ز╪ص ╪د┘╪ذ┘è╪د┘" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => manifestsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping-manifests"] });
      toast({ title: "╪ز┘à ╪د┘╪ص╪░┘" });
      window.history.back();
    },
    onError: () =>
      toast({
        title: "╪«╪╖╪ث",
        description: "┘╪┤┘ ╪ص╪░┘ ╪د┘╪ذ┘è╪د┘",
        variant: "destructive",
      }),
  });

  const handlePrint = () => window.print();

  if (isLoading)
    return (
      <div className="p-12 text-center text-muted-foreground animate-pulse">
        ╪ش╪د╪▒┘è ╪د┘╪ز╪ص┘à┘è┘...
      </div>
    );
  if (error || !manifest)
    return (
      <div className="p-12 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
        <h2 className="text-lg font-bold mb-2">╪د┘╪ذ┘è╪د┘ ╪║┘è╪▒ ┘à┘ê╪ش┘ê╪»</h2>
        <Link href="/shipping">
          <Button variant="outline" className="mt-3">
            ╪د┘╪╣┘ê╪»╪ر ┘╪┤╪▒┘â╪د╪ز ╪د┘╪┤╪ص┘
          </Button>
        </Link>
      </div>
    );

  const s = manifest.stats;
  const isLocked = manifest.status === "closed";
  const pendingOrders = manifest.orders.filter(
    (o) => o.deliveryStatus === "pending"
  ).length;

  const statusLabel = (st: DeliveryStatus) => {
    switch (st) {
      case "delivered":        return { label: "┘à╪│┘┘┘ّ┘à",          cls: "status-delivered" };
      case "returned":         return { label: "┘à╪▒╪ز╪ش╪╣",           cls: "status-returned" };
      case "postponed":        return { label: "┘à╪ج╪ش┘",            cls: "status-postponed" };
      case "partial_received": return { label: "╪ش╪▓╪خ┘è",            cls: "status-partial" };
      default:                 return { label: "╪د┘╪ز╪╕╪د╪▒",          cls: "status-pending" };
    }
  };

  const deliveredGross = manifest.orders
    .filter(o => o.deliveryStatus === "delivered")
    .reduce((sum, o) => sum + o.totalPrice, 0);

  const partialGross = manifest.orders
    .filter(o => o.deliveryStatus === "partial_received")
    .reduce((sum, o) => {
      const pct = o.partialQuantity && o.quantity ? o.partialQuantity / o.quantity : 1;
      return sum + o.totalPrice * pct;
    }, 0);

  const totalCollected = deliveredGross + partialGross;

  return (
    <>
    {/* ظـظـظـظـظـظـظـظـظـظـظـظـظـظـ PRINT-ONLY ظـظـظـظـظـظـظـظـظـظـظـظـظـظـ */}
    <div className="manifest-print hidden" dir="rtl">
      {/* Header */}
      <div className="manifest-print-header">
        <div>
          <div className="manifest-print-title">╪ذ┘è╪د┘ ╪د┘╪┤╪ص┘ ظ¤ {manifest.manifestNumber}</div>
          <div className="manifest-print-meta">
            ╪┤╪▒┘â╪ر ╪د┘╪┤╪ص┘: {manifest.companyName} &nbsp;|&nbsp;
            ╪د┘╪ز╪د╪▒┘è╪«: {format(new Date(manifest.createdAt), "yyyy/MM/dd")} &nbsp;|&nbsp;
            ╪د┘╪ص╪د┘╪ر: {manifest.status === "closed" ? "┘à╪║┘┘é" : "┘à┘╪ز┘ê╪ص"}
            {manifest.closedAt && ` | ╪ث┘╪║┘┘é: ${format(new Date(manifest.closedAt), "yyyy/MM/dd")}`}
          </div>
        </div>
        <div style={{ textAlign: "left", fontSize: "8pt", color: "#555" }}>
          <div style={{ fontWeight: 900, fontSize: "11pt" }}>CAPRINA</div>
          <div>╪╖┘╪ذ╪╣: {format(new Date(), "yyyy/MM/dd HH:mm")}</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="manifest-print-stats">
        <div className="manifest-print-stat">
          <div className="manifest-print-stat-label">╪ح╪ش┘à╪د┘┘è ╪د┘╪╖┘╪ذ┘è╪د╪ز</div>
          <div className="manifest-print-stat-value">{s.total}</div>
        </div>
        <div className="manifest-print-stat">
          <div className="manifest-print-stat-label">┘à╪│┘┘┘ّ┘à</div>
          <div className="manifest-print-stat-value status-delivered">{s.delivered}</div>
        </div>
        <div className="manifest-print-stat">
          <div className="manifest-print-stat-label">┘à╪▒╪ز╪ش╪╣</div>
          <div className="manifest-print-stat-value status-returned">{s.returned}</div>
        </div>
        <div className="manifest-print-stat">
          <div className="manifest-print-stat-label">┘à╪ج╪ش┘ / ╪د┘╪ز╪╕╪د╪▒</div>
          <div className="manifest-print-stat-value status-postponed">{s.pending}</div>
        </div>
        <div className="manifest-print-stat">
          <div className="manifest-print-stat-label">┘╪│╪ذ╪ر ╪د┘╪ز╪│┘┘è┘à</div>
          <div className="manifest-print-stat-value">{s.deliveryRate}%</div>
        </div>
      </div>

      {/* Orders table */}
      <table className="manifest-print-table">
        <thead>
          <tr>
            <th style={{ width: "6%" }}>#</th>
            <th style={{ width: "20%" }}>╪د┘╪╣┘à┘è┘</th>
            <th style={{ width: "14%" }}>╪د┘┘ç╪د╪ز┘</th>
            <th style={{ width: "28%" }}>╪د┘┘à┘╪ز╪ش / ╪د┘┘à┘é╪د╪│ / ╪د┘┘┘ê┘</th>
            <th style={{ width: "7%", textAlign: "center" }}>╪د┘┘â┘à┘è╪ر</th>
            <th style={{ width: "12%", textAlign: "center" }}>╪د┘╪ح╪ش┘à╪د┘┘è</th>
            <th style={{ width: "13%", textAlign: "center" }}>╪د┘╪ص╪د┘╪ر</th>
          </tr>
        </thead>
        <tbody>
          {manifest.orders.map((o, idx) => {
            const { label, cls } = statusLabel(o.deliveryStatus);
            const variant = [o.color, o.size].filter(Boolean).join(" / ");
            return (
              <tr key={o.id}>
                <td style={{ textAlign: "center", color: "#888" }}>{idx + 1}</td>
                <td style={{ fontWeight: 700 }}>{o.customerName}</td>
                <td style={{ direction: "ltr", textAlign: "right" }}>{o.phone ?? "ظ¤"}</td>
                <td>
                  {o.product}
                  {variant && <span style={{ color: "#666" }}> ({variant})</span>}
                </td>
                <td style={{ textAlign: "center" }}>
                  {o.deliveryStatus === "partial_received" && o.partialQuantity
                    ? `${o.partialQuantity}/${o.quantity}`
                    : o.quantity}
                </td>
                <td style={{ textAlign: "center", fontWeight: 700 }}>
                  {o.totalPrice.toLocaleString("ar-EG")} ╪ش
                </td>
                <td style={{ textAlign: "center" }}>
                  <span className={cls}>{label}</span>
                  {o.deliveryNote && (
                    <div style={{ fontSize: "7pt", color: "#777", marginTop: "0.5mm" }}>
                      {o.deliveryNote}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer / Totals */}
      <div className="manifest-print-footer">
        <div>
          <div className="manifest-print-total">
            ╪ح╪ش┘à╪د┘┘è ╪د┘┘à╪ص╪╡┘┘ّ┘: {totalCollected.toLocaleString("ar-EG")} ╪ش.┘à
          </div>
          <div style={{ fontSize: "8pt", color: "#555", marginTop: "1.5mm" }}>
            ╪▒╪│┘ê┘à ╪د┘╪┤╪ص┘: {s.totalShippingCost.toLocaleString("ar-EG")} ╪ش.┘à &nbsp;|&nbsp;
            ╪د┘╪╡╪د┘┘è ╪د┘┘à╪│╪ز╪ص┘é: {(totalCollected - s.totalShippingCost).toLocaleString("ar-EG")} ╪ش.┘à
            {manifest.invoicePrice != null && (
              <> &nbsp;|&nbsp; ╪│╪╣╪▒ ╪د┘┘╪د╪ز┘ê╪▒╪ر ╪د┘┘à╪ز┘┘é: {manifest.invoicePrice.toLocaleString("ar-EG")} ╪ش.┘à</>
            )}
          </div>
        </div>
        <div className="manifest-print-sig">
          <div>╪ز┘ê┘é┘è╪╣ ╪د┘┘à┘╪»┘ê╪ذ: ________________</div>
          <div style={{ marginTop: "3mm" }}>╪ز┘ê┘é┘è╪╣ ╪د┘┘à╪│╪ج┘ê┘: ________________</div>
        </div>
      </div>
    </div>

    {/* ظـظـظـظـظـظـظـظـظـظـظـظـظـظـ SCREEN-ONLY ظـظـظـظـظـظـظـظـظـظـظـظـظـظـ */}
    <div className="manifest-screen max-w-5xl mx-auto space-y-5 animate-in fade-in duration-500" dir="rtl">
      {/* ظ¤ظ¤ظ¤ Header ظ¤ظ¤ظ¤ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/shipping">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full border-border"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{manifest.manifestNumber}</h1>
              <Badge
                variant="outline"
                className={`text-[10px] font-bold border ${
                  isLocked
                    ? "border-emerald-700 bg-emerald-900/20 text-emerald-400"
                    : "border-blue-700 bg-blue-900/20 text-blue-400"
                }`}
              >
                {isLocked ? "┘à╪║┘┘é" : "┘à┘╪ز┘ê╪ص"}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Truck className="w-3 h-3" />
                {manifest.companyName}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(manifest.createdAt), "yyyy/MM/dd")}
              </p>
              {manifest.closedAt && (
                <p className="text-xs text-emerald-600">
                  ╪ث┘╪║┘┘é: {format(new Date(manifest.closedAt), "yyyy/MM/dd")}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 border-border"
            onClick={handlePrint}
          >
            <Printer className="w-3 h-3" />╪╖╪ذ╪د╪╣╪ر
          </Button>
          {isLocked ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-amber-800 text-amber-400 hover:bg-amber-900/20"
              onClick={() => updateMutation.mutate({ status: "open" })}
              disabled={updateMutation.isPending}
            >
              <Unlock className="w-3 h-3" />┘╪ز╪ص
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-emerald-800 text-emerald-400 hover:bg-emerald-900/20"
              onClick={() => setShowCloseDialog(true)}
            >
              <Lock className="w-3 h-3" />╪ح╪║┘╪د┘é ╪د┘╪ذ┘è╪د┘
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 border-red-800 text-red-400 hover:bg-red-900/20 hover:text-red-400"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-3 h-3" />╪ص╪░┘
          </Button>
        </div>
      </div>

      {/* ظ¤ظ¤ظ¤ KPI Cards ظ¤ظ¤ظ¤ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">╪ح╪ش┘à╪د┘┘è ╪د┘╪╖┘╪ذ┘è╪د╪ز</p>
          <p className="text-2xl font-black">{s.total}</p>
          {pendingOrders > 0 && !isLocked && (
            <p className="text-[10px] text-amber-500 mt-0.5">
              {pendingOrders} ╪ذ╪د┘╪ز╪╕╪د╪▒ ╪د┘╪ز┘é┘┘è┘
            </p>
          )}
        </Card>
        <Card className="border-emerald-900/50 bg-emerald-900/10 p-4">
          <p className="text-xs text-emerald-400 mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />┘à┘╪│┘┘┘ّ┘à
          </p>
          <p className="text-2xl font-black text-emerald-400">{s.delivered}</p>
          <p className="text-xs text-emerald-600 mt-0.5 font-bold">
            {s.deliveryRate}% ┘╪│╪ذ╪ر ╪د┘╪ز╪│┘┘è┘à
          </p>
        </Card>
        <Card className="border-red-900/50 bg-red-900/10 p-4">
          <p className="text-xs text-red-400 mb-1 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />┘à┘╪▒╪ز╪ش┘╪╣
          </p>
          <p className="text-2xl font-black text-red-400">{s.returned}</p>
          <p className="text-xs text-red-600 mt-0.5 font-bold">
            {s.total > 0 ? Math.round((s.returned / s.total) * 100) : 0}% ┘╪│╪ذ╪ر ╪د┘╪ح╪▒╪ش╪د╪╣
          </p>
        </Card>
        <Card className="border-amber-900/50 bg-amber-900/10 p-4">
          <p className="text-xs text-amber-400 mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />┘à╪ج╪ش┘ / ┘à╪╣┘┘┘ّ┘é
          </p>
          <p className="text-2xl font-black text-amber-400">{s.pending}</p>
          <p className="text-xs text-amber-600 mt-0.5 font-bold">
            {s.total > 0 ? Math.round((s.pending / s.total) * 100) : 0}% ┘à┘ ╪د┘╪ح╪ش┘à╪د┘┘è
          </p>
        </Card>
      </div>

      {/* ظ¤ظ¤ظ¤ Delivery Rate Bar ظ¤ظ¤ظ¤ */}
      <Card className="border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold">┘╪│╪ذ╪ر ╪د┘╪ز╪│┘┘è┘à</p>
          <p
            className={`text-xl font-black ${
              s.deliveryRate >= 70
                ? "text-emerald-400"
                : s.deliveryRate >= 40
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {s.deliveryRate}%
          </p>
        </div>
        <div className="w-full bg-muted rounded-full h-3 overflow-hidden flex">
          <div
            className="h-3 bg-emerald-500 transition-all"
            style={{ width: `${s.total > 0 ? (s.delivered / s.total) * 100 : 0}%` }}
          />
          <div
            className="h-3 bg-orange-500 transition-all"
            style={{
              width: `${s.total > 0 ? (s.pending / s.total) * 100 : 0}%`,
            }}
          />
          <div
            className="h-3 bg-red-500 transition-all"
            style={{ width: `${s.total > 0 ? (s.returned / s.total) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
          <span className="text-emerald-600">┘à┘╪│┘┘┘ّ┘à: {s.delivered}</span>
          <span className="text-orange-600">┘à╪ج╪ش┘: {s.pending}</span>
          <span className="text-red-600">┘à┘╪▒╪ز╪ش┘╪╣: {s.returned}</span>
        </div>
      </Card>

      {/* ظ¤ظ¤ظ¤ Invoice Section ظ¤ظ¤ظ¤ */}
      <Card className="border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Banknote className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-sm">┘╪د╪ز┘ê╪▒╪ر ╪د┘╪ذ┘è╪د┘</h2>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[10px] text-muted-foreground">
            ╪د┘┘à╪ذ┘╪║ ╪د┘┘à╪ز┘┘é ╪╣┘┘è┘ç ┘à╪╣ ╪┤╪▒┘â╪ر ╪د┘╪┤╪ص┘ (┘à╪د ╪│┘è┘╪»┘╪╣ ┘┘╪د)
          </p>
          <InvoicePriceEditor
            manifestId={id}
            current={manifest.invoicePrice}
            currentNotes={manifest.invoiceNotes}
            onSaved={refetch}
          />
        </div>
      </Card>

      {/* ظ¤ظ¤ظ¤ Settlement Card ظ¤ظ¤ظ¤ */}
      <SettlementCard manifest={manifest} />

      {/* ظ¤ظ¤ظ¤ Orders Table ظ¤ظ¤ظ¤ */}
      <Card className="border-border bg-card overflow-hidden print:break-inside-avoid">
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/10 transition-colors"
          onClick={() => setShowOrders(!showOrders)}
        >
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            ╪د┘╪╖┘╪ذ┘è╪د╪ز ┘┘è ╪د┘╪ذ┘è╪د┘
            <Badge variant="outline" className="text-[9px]">
              {manifest.orders.length}
            </Badge>
            {!isLocked && pendingOrders > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] border-amber-700 bg-amber-900/20 text-amber-400"
              >
                {pendingOrders} ╪ذ╪د┘╪ز╪╕╪د╪▒ ╪د┘╪ز┘é┘┘è┘
              </Badge>
            )}
          </h2>
          {showOrders ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        {showOrders && (
          <>
            {manifest.orders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                ┘╪د ╪ز┘ê╪ش╪» ╪╖┘╪ذ┘è╪د╪ز
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_1fr_60px_80px_120px_80px] gap-0 border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold text-muted-foreground">
                  <div>╪د┘╪╣┘à┘è┘</div>
                  <div>╪د┘┘à┘╪ز╪ش</div>
                  <div className="text-center">╪د┘┘â┘à┘è╪ر</div>
                  <div className="text-left">╪د┘╪ح╪ش┘à╪د┘┘è</div>
                  <div>╪ص╪د┘╪ر ╪د┘╪ز╪│┘┘è┘à</div>
                  <div className="text-left">╪ح╪ش╪▒╪د╪ة</div>
                </div>
                {manifest.orders.map((order) => (
                  <OrderDeliveryRow
                    key={order.id}
                    order={order}
                    manifestId={id}
                    locked={isLocked}
                    onSaved={refetch}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ظ¤ظ¤ظ¤ P&L Summary (admin only ظ¤ hidden in print) ظ¤ظ¤ظ¤ */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 print:hidden">
        <Card className="border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">╪ح╪ش┘à╪د┘┘è ╪د┘╪ح┘è╪▒╪د╪»╪د╪ز</p>
          <p className="text-lg font-black text-emerald-400">
            {formatCurrency(s.totalRevenue)}
          </p>
        </Card>
        <Card className="border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">╪ز┘â┘┘╪ر ╪د┘╪┤╪ص┘</p>
          <p className="text-lg font-black text-amber-400">
            {formatCurrency(s.totalShippingCost)}
          </p>
        </Card>
        <Card className="border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">╪«╪│╪د╪خ╪▒ ╪د┘╪ح╪▒╪ش╪د╪╣</p>
          <p className="text-lg font-black text-red-400">
            {formatCurrency(s.returnLosses)}
          </p>
        </Card>
        <Card className="border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">╪ز┘â┘┘╪ر ╪د┘╪ذ╪╢╪د╪╣╪ر</p>
          <p className="text-lg font-black">{formatCurrency(s.totalCost)}</p>
        </Card>
        <Card
          className={`col-span-2 p-4 border ${
            s.netProfit >= 0
              ? "border-emerald-900/50 bg-emerald-900/10"
              : "border-red-900/50 bg-red-900/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className={`text-xs mb-1 font-bold ${
                  s.netProfit >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {s.netProfit >= 0 ? "╪╡╪د┘┘è ╪د┘╪▒╪ذ╪ص" : "╪╡╪د┘┘è ╪د┘╪«╪│╪د╪▒╪ر"}
              </p>
              <p
                className={`text-2xl font-black ${
                  s.netProfit >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {formatCurrency(Math.abs(s.netProfit))}
              </p>
            </div>
            {s.netProfit >= 0 ? (
              <TrendingUp className="w-10 h-10 text-emerald-400 opacity-30" />
            ) : (
              <TrendingDown className="w-10 h-10 text-red-400 opacity-30" />
            )}
          </div>
          {s.totalRevenue > 0 && (
            <p
              className={`text-xs mt-2 font-bold ${
                s.netProfit >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              ┘ç╪د┘à╪┤ ╪د┘╪▒╪ذ╪ص: {Math.round((s.netProfit / s.totalRevenue) * 100)}%
            </p>
          )}
        </Card>
      </div>

      {/* ظ¤ظ¤ظ¤ Close Confirm Dialog ظ¤ظ¤ظ¤ */}
      {showCloseDialog && (
        <CloseConfirmDialog
          manifest={manifest}
          onClose={() => setShowCloseDialog(false)}
          onConfirm={() => updateMutation.mutate({ status: "closed" })}
          loading={updateMutation.isPending}
        />
      )}

      {/* ظ¤ظ¤ظ¤ Delete Dialog ظ¤ظ¤ظ¤ */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>╪ز╪ث┘â┘è╪» ╪ص╪░┘ ╪د┘╪ذ┘è╪د┘</AlertDialogTitle>
            <AlertDialogDescription>
              ┘ç┘ ╪ث┘╪ز ┘à╪ز╪ث┘â╪» ┘à┘ ╪ص╪░┘ ╪ذ┘è╪د┘ ╪د┘╪┤╪ص┘ {manifest.manifestNumber}╪ا ┘┘ ┘è╪ز┘à
              ╪ص╪░┘ ╪د┘╪╖┘╪ذ┘è╪د╪ز ╪د┘┘à╪▒╪ز╪ذ╪╖╪ر ╪ذ┘ç.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>╪ح┘╪║╪د╪ة</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? "╪ش╪د╪▒┘è ╪د┘╪ص╪░┘..." : "┘╪╣┘à╪î ╪د╪ص╪░┘"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}
