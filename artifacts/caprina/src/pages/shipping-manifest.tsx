import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import ExcelJS from "exceljs";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  shipmentManifestsApi,
  manifestsApi,
  shipmentsApi,
  apiFetch,
  type ShipmentManifestDetail as ShippingManifestDetail,
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
  Search,
  PackagePlus,
  FileSpreadsheet,
  Download,
  Eye,
  EyeOff,
  Zap,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { format } from "date-fns";
import { RETURN_REASONS, returnReasonLabel } from "@/lib/order-constants";

const formatCurrency = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const DELIVERY_OPTIONS: { value: DeliveryStatus; label: string; color: string; bg: string }[] = [
  { value: "pending",          label: "قيد الانتظار",   color: "text-muted-foreground",                                          bg: "border-border" },
  { value: "delivered",        label: "مسلَّم ✓",        color: "text-emerald-700 dark:text-emerald-400",                         bg: "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20" },
  { value: "postponed",        label: "مؤجل",            color: "text-orange-700  dark:text-orange-400",                          bg: "border-orange-300  dark:border-orange-700  bg-orange-50  dark:bg-orange-900/20" },
  { value: "partial_received", label: "استلم جزئي",     color: "text-teal-700    dark:text-teal-400",                            bg: "border-teal-300    dark:border-teal-700    bg-teal-50    dark:bg-teal-900/20" },
  { value: "returned",         label: "مرتجع",           color: "text-red-700     dark:text-red-400",                             bg: "border-red-300     dark:border-red-700     bg-red-50     dark:bg-red-900/20" },
];

// ─── خيارات حالة التسليم لبيانات الشحنات (shipment manifests) ────────────────
// تشمل كل قيم DeliveryStatus السبعة لتجنب الرجوع للقيمة الافتراضية الخاطئة (fallback)
const SHIPMENT_DELIVERY_OPTIONS: { value: DeliveryStatus; label: string; color: string; bg: string }[] = [
  { value: "pending",           label: "قيد الانتظار", color: "text-muted-foreground",                                 bg: "border-border" },
  { value: "delivered",         label: "مسلَّم ✓",      color: "text-emerald-700 dark:text-emerald-400",                bg: "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20" },
  { value: "partial_delivered", label: "مسلَّم جزئي",   color: "text-teal-700 dark:text-teal-400",                     bg: "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20" },
  { value: "postponed",         label: "قيد الشحن",     color: "text-orange-700  dark:text-orange-400",                bg: "border-orange-300  dark:border-orange-700  bg-orange-50  dark:bg-orange-900/20" },
  { value: "delayed",           label: "مؤجل",          color: "text-orange-700  dark:text-orange-400",                bg: "border-orange-300  dark:border-orange-700  bg-orange-50  dark:bg-orange-900/20" },
  { value: "returned",          label: "مرتجع",         color: "text-red-700     dark:text-red-400",                   bg: "border-red-300     dark:border-red-700     bg-red-50     dark:bg-red-900/20" },
];

const deliveryOpt = (v: DeliveryStatus, isShipmentManifest = false) => {
  const list = isShipmentManifest ? SHIPMENT_DELIVERY_OPTIONS : DELIVERY_OPTIONS;
  return list.find((o) => o.value === v) ?? list[0];
};

function OrderDeliveryRow({
  order,
  manifestId,
  locked,
  onSaved,
  hideAction = false,
  isShipmentManifest = false,
}: {
  order: ManifestOrder;
  manifestId: number;
  locked: boolean;
  onSaved: () => void;
  hideAction?: boolean;
  isShipmentManifest?: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<DeliveryStatus>(order.deliveryStatus);
  const [note, setNote] = useState(order.deliveryNote ?? "");
  const [partialQty, setPartialQty] = useState(
    order.partialQuantity?.toString() ?? ""
  );
  const [partialProduct, setPartialProduct] = useState(
    order.deliveryNote?.startsWith("منتج:") ? order.deliveryNote.split("|")[0].replace("منتج:", "").trim() : ""
  );
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [returnReceived, setReturnReceived] = useState<boolean | null>(
    (order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null
  );
  const [returnReason, setReturnReason] = useState<string>(
    (order as any).returnReason ?? ""
  );
  const [returnValueReceived, setReturnValueReceived] = useState<string>(
    (order as any).returnValueReceived != null ? String((order as any).returnValueReceived) : ""
  );
  const [deliveredValueReceived, setDeliveredValueReceived] = useState<string>(
    (order as any).deliveredValueReceived != null ? String((order as any).deliveredValueReceived) : ""
  );
  const [partialReturnReceived, setPartialReturnReceived] = useState<boolean | null>(
    (order.deliveryStatus === "partial_received" || order.deliveryStatus === "partial_delivered")
      ? ((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null)
      : null
  );
  const RETURN_REASONS_NEED_VALUE = ["refused_paid", "refused_unpaid", "quality"];
  const needsReturnValue = status === "returned" && RETURN_REASONS_NEED_VALUE.includes(returnReason);

  // مزامنة الـ state مع الـ prop بعد كل refetch
  useEffect(() => {
    if (!editing) {
      setStatus(order.deliveryStatus);
      setNote(order.deliveryNote ?? "");
      setPartialQty(order.partialQuantity?.toString() ?? "");
      setReturnReceived(
        (order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null
      );
      setReturnReason((order as any).returnReason ?? "");
      setReturnValueReceived((order as any).returnValueReceived != null ? String((order as any).returnValueReceived) : "");
      setDeliveredValueReceived((order as any).deliveredValueReceived != null ? String((order as any).deliveredValueReceived) : "");
      setPartialReturnReceived(
        (order.deliveryStatus === "partial_received" || order.deliveryStatus === "partial_delivered")
          ? ((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null)
          : null
      );
    }
  }, [order.deliveryStatus, order.deliveryNote, order.partialQuantity, (order as any).returnReceived, (order as any).returnValueReceived, (order as any).deliveredValueReceived, editing]);

  const cancelMutation = useMutation({
    mutationFn: () =>
      isShipmentManifest
        ? shipmentManifestsApi.deleteItem(manifestId, order.shipmentId)
        : manifestsApi.cancelOrder(manifestId, order.id),
    onSuccess: () => {
      toast({ title: "تم إلغاء الطلبية من البيان نهائيًا" });
      setEditing(false);
      onSaved();
    },
    onError: (e: any) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (status === "partial_received" || status === "partial_delivered") {
        const qty = parseInt(partialQty);
        if (partialQty === "" || partialQty === null || partialQty === undefined || isNaN(qty) || qty < 0) {
          throw new Error(status === "partial_delivered" && isShipmentManifest ? "يجب إدخال القيمة المستلمة أولاً" : "يجب إدخال الكمية المستلمة أولاً");
        }
        const maxVal: number = status === "partial_delivered" && isShipmentManifest ? Number(order.totalPrice ?? 0) : Number(order.quantity ?? 0);
        if (qty > maxVal) {
          throw new Error((status === "partial_delivered" && isShipmentManifest ? "القيمة لا يمكن أن تتجاوز " : "الكمية لا يمكن أن تتجاوز ") + maxVal);
        }
      }
      let finalNote = note.trim() || null;
      if ((status === "partial_received" || status === "partial_delivered") && partialProduct.trim()) {
        finalNote = partialProduct.trim() + (note.trim() ? " | " + note.trim() : "");
      }
      if (status === "returned" && needsReturnValue) {
        if (returnValueReceived.trim() === "" || isNaN(Number(returnValueReceived))) {
          throw new Error("يجب إدخال القيمة المستلمة فعليًا قبل الحفظ");
        }
      }
      if ((status === "partial_received" || status === "partial_delivered") && partialReturnReceived === null) {
        throw new Error("يجب اختيار حالة الباقي (عند الشحن / تم استلامه في المخزن) قبل الحفظ");
      }
      if (isShipmentManifest) {
        // shipment manifests: deliveryStatus, deliveryNote, partialQuantity, returnReceived, returnReason, returnValueReceived
        const allowed = ["pending","delivered","partial_delivered","returned","delayed"] as const;
        const safeStatus = allowed.includes(status as any) ? status as "pending"|"delivered"|"partial_delivered"|"returned"|"delayed" : "pending";
        return shipmentManifestsApi.updateItem(manifestId, order.shipmentId, {
          deliveryStatus: safeStatus,
          deliveryNote: finalNote,
          partialQuantity:
            safeStatus === "partial_delivered" && partialQty !== "" && partialQty !== null && partialQty !== undefined
              ? parseInt(partialQty)
              : null,
          returnReceived:
            status === "returned" ? returnReceived :
            status === "partial_delivered" ? partialReturnReceived :
            null,
          returnReason: status === "returned" ? (returnReason || null) : null,
          returnValueReceived: status === "returned" && needsReturnValue ? Number(returnValueReceived) : null,
          deliveredValueReceived:
            status === "delivered" && deliveredValueReceived.trim() !== "" && !isNaN(Number(deliveredValueReceived))
              ? Number(deliveredValueReceived)
              : null,
        });
      }
      return manifestsApi.updateOrderDelivery(manifestId, order.id, {
        deliveryStatus: status,
        deliveryNote: finalNote,
        partialQuantity:
          status === "partial_received" && partialQty !== "" && partialQty !== null && partialQty !== undefined
            ? parseInt(partialQty)
            : null,
        ...(status === "returned" ? { returnReceived } : {}),
        ...(status === "returned" ? { returnReason: returnReason || null } : {}),
        ...(status === "partial_received" ? { partialReturnReceived } : {}),
      });
    },
    onSuccess: () => {
      toast({ title: "تم حفظ حالة التسليم" });
      setEditing(false);
      onSaved();
    },
    onError: (e: any) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const opt = deliveryOpt(order.deliveryStatus, isShipmentManifest);
  const needsNote = status === "postponed" || status === "returned" || status === "delayed";
  const needsPartial = status === "partial_received" || status === "partial_delivered";

  const hasChanges =
    status !== order.deliveryStatus ||
    note !== (order.deliveryNote ?? "") ||
    ((status === "partial_received" || status === "partial_delivered") &&
      partialQty !== (order.partialQuantity?.toString() ?? "")) ||
    (status === "partial_received" &&
      partialReturnReceived !== ((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null)) ||
    (status === "returned" &&
      returnReceived !== ((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null)) ||
    (status === "delivered" &&
      deliveredValueReceived !== ((order as any).deliveredValueReceived != null ? String((order as any).deliveredValueReceived) : "")) ||
    (status === "returned" &&
      returnValueReceived !== ((order as any).returnValueReceived != null ? String((order as any).returnValueReceived) : ""));

  return (
    <div className={`border-b border-border/50 transition-colors ${editing ? "bg-primary/5" : "hover:bg-muted/10"}`}>
      {/* Main row */}
      <div className="hidden md:grid grid-cols-[minmax(140px,1fr)_minmax(120px,1fr)_minmax(140px,1fr)_60px_80px_80px] min-w-[860px] gap-0 items-start px-3 py-2.5 text-xs">
        {/* Order ID only — no customer name (already shown in parent row) */}
        <div className="min-w-0 pr-1 flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5 border border-border/40">
            #{order.id.toString().padStart(4, "0")}
          </span>
          {order.phone && (
            <span className="text-[10px] text-muted-foreground">{order.phone}</span>
          )}
        </div>
        {/* Product */}
        <div className="min-w-0 pr-2">
          <p className="truncate font-medium">{order.product}</p>
          {(order.color || order.size) && (
            <p className="text-muted-foreground text-[10px]">
              {[order.color, order.size].filter(Boolean).join(" / ")}
            </p>
          )}
        </div>
        {/* Qty */}
        <div className="text-center font-bold">
          {(order.deliveryStatus === "partial_received" || order.deliveryStatus === "partial_delivered") && order.partialQuantity ? (
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
        {/* Delivery Status Badge -- always visible */}
        <div>
          <Badge
            variant="outline"
            className={`text-[9px] font-bold border ${opt.bg} ${opt.color}`}
          >
            {opt.label}
          </Badge>
          {/* سبب التأجيل تحت الـ badge مباشرة */}
          {(order.deliveryStatus === "delayed" || order.deliveryStatus === "postponed") && (
            <p className="text-[10px] text-orange-400 mt-0.5 font-semibold">
              ⏸ {order.deliveryNote || "لم يحدد السبب"}
            </p>
          )}
          {/* sub-status للمرتجع */}
          {order.deliveryStatus === "returned" && (order as any).returnReceived === 1 && (
            <>
              <p className="text-[10px] text-emerald-600 mt-0.5 font-semibold">↩ تم الاستلام</p>
              <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-0.5">
                ↳ {(order as any).returnReason ? returnReasonLabel((order as any).returnReason) : "لم يحدد السبب"}
              </p>
            </>
          )}
          {order.deliveryStatus === "returned" && (order as any).returnReceived === 0 && (
            <>
              <p className="text-[10px] text-orange-500 mt-0.5 font-semibold">⏳ عند شركة الشحن</p>
              <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-0.5">
                ↳ {(order as any).returnReason ? returnReasonLabel((order as any).returnReason) : "لم يحدد السبب"}
              </p>
            </>
          )}
          {/* لو returnReceived لسه null (لم يختر بعد) */}
          {order.deliveryStatus === "returned" && (order as any).returnReceived == null && (
            <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-0.5">
              ↳ {(order as any).returnReason ? returnReasonLabel((order as any).returnReason) : "لم يحدد السبب"}
            </p>
          )}
          {/* sub-status للاستلام الجزئي — المبلغ المستلم من الإجمالي، ثم اسم المخزن دايمًا، ثم حالة الباقي */}
          {order.deliveryStatus === "partial_received" && order.partialQuantity != null && (
            <p className="text-[10px] text-teal-400 mt-0.5 font-semibold">
              {formatCurrency(order.partialQuantity)} من {formatCurrency(order.totalPrice ?? 0)}
            </p>
          )}
          {order.deliveryStatus === "partial_received" && (order as any).returnReceived === 1 && (
            <p className="text-[10px] text-emerald-600 mt-0.5 font-semibold">
              ↩ الباقي في مخزن {(order as any).warehouseName || "—"}
            </p>
          )}
          {order.deliveryStatus === "partial_received" && (order as any).returnReceived !== 1 && (
            <p className="text-[10px] text-orange-400 mt-0.5 font-semibold">🚚 المرتجع ما زال مع مندوب الشحن</p>
          )}
          {/* sub-status لمسلَّم جزئي (shipment) — partialQuantity هنا قيمة مالية (مبلغ) دفعه العميل فعليًا */}
          {order.deliveryStatus === "partial_delivered" && order.partialQuantity != null && (
            <p className="text-[10px] text-teal-400 mt-0.5 font-semibold">
              {formatCurrency(order.partialQuantity)} من {formatCurrency(order.totalPrice ?? 0)}
            </p>
          )}
          {order.deliveryStatus === "partial_delivered" && (order as any).returnReceived === 1 && (
            <p className="text-[10px] text-emerald-600 mt-0.5 font-semibold">
              ↩ الباقي في مخزن {(order as any).warehouseName || "—"}
            </p>
          )}
          {order.deliveryStatus === "partial_delivered" && (order as any).returnReceived !== 1 && (
            <p className="text-[10px] text-orange-400 mt-0.5 font-semibold">🚚 المرتجع ما زال مع مندوب الشحن</p>
          )}
          {(order.deliveryStatus === "delayed" || order.deliveryStatus === "postponed") && !editing && (
            <p className="text-[10px] text-orange-400 mt-0.5 font-semibold truncate max-w-[110px]">
              ⏸ {order.deliveryNote || "لم يحدد السبب"}
            </p>
          )}
          {order.deliveryStatus !== "delayed" && order.deliveryStatus !== "postponed" && order.deliveryNote && !editing && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[110px]">
              {order.deliveryNote}
            </p>
          )}
        </div>
        {/* Action */}
        <div className="flex justify-end">
          {!locked && !hideAction && (
            editing ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-1.5 text-muted-foreground"
                onClick={() => {
                  setEditing(false);
                  setStatus(order.deliveryStatus);
                  setNote(order.deliveryNote ?? "");
                  setPartialProduct("");
                  setPartialQty(order.partialQuantity?.toString() ?? "");
                  setReturnReceived((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null);
                  setReturnReason((order as any).returnReason ?? "");
                  setReturnValueReceived((order as any).returnValueReceived != null ? String((order as any).returnValueReceived) : "");
                  setDeliveredValueReceived((order as any).deliveredValueReceived != null ? String((order as any).deliveredValueReceived) : "");
                  setPartialReturnReceived(order.deliveryStatus === "partial_received" ? ((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null) : null);
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-1.5 text-primary hover:text-primary"
                onClick={() => {
                  setStatus(order.deliveryStatus);
                  setNote(order.deliveryNote ?? "");
                  setPartialQty(order.partialQuantity?.toString() ?? "");
                  setReturnReceived((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null);
                  setReturnReason((order as any).returnReason ?? "");
                  setReturnValueReceived((order as any).returnValueReceived != null ? String((order as any).returnValueReceived) : "");
                  setDeliveredValueReceived((order as any).deliveredValueReceived != null ? String((order as any).deliveredValueReceived) : "");
                  setPartialReturnReceived(order.deliveryStatus === "partial_received" ? ((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null) : null);
                  setEditing(true);
                }}
              >
                <Edit2 className="w-3 h-3 ml-0.5" />تقفيل
              </Button>
            )
          )}
          {locked && !hideAction && (
            <Link href={`/orders/${order.id}`}>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-primary hover:text-primary">
                عرض
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile card (md:hidden) */}
      <div className="md:hidden px-3 py-2.5 text-xs flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-mono text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5 border border-border/40 self-start">
              #{order.id.toString().padStart(4, "0")}
            </span>
            {order.phone && <span className="text-[10px] text-muted-foreground">{order.phone}</span>}
          </div>
          <Badge variant="outline" className={`text-[9px] font-bold border shrink-0 ${opt.bg} ${opt.color}`}>
            {opt.label}
          </Badge>
        </div>
        {/* سبب التأجيل تحت الـ badge في الموبايل */}
        {(order.deliveryStatus === "delayed" || order.deliveryStatus === "postponed") && (
          <p className="text-[10px] text-orange-400 font-semibold">⏸ {order.deliveryNote || "لم يحدد السبب"}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium truncate">{order.product}</p>
            {(order.color || order.size) && (
              <p className="text-muted-foreground text-[10px]">{[order.color, order.size].filter(Boolean).join(" / ")}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-bold">{order.quantity}</span>
            <span className="font-bold text-primary">{formatCurrency(order.totalPrice)}</span>
          </div>
        </div>
        {order.deliveryStatus === "returned" && (order as any).returnReceived === 1 && (
          <>
            <p className="text-[10px] text-emerald-600 font-semibold">↩ تم الاستلام</p>
            <p className="text-[10px] text-red-400 font-semibold">
              ↳ {(order as any).returnReason ? returnReasonLabel((order as any).returnReason) : "لم يحدد السبب"}
            </p>
          </>
        )}
        {order.deliveryStatus === "returned" && (order as any).returnReceived === 0 && (
          <>
            <p className="text-[10px] text-orange-500 font-semibold">⏳ عند شركة الشحن</p>
            <p className="text-[10px] text-red-400 font-semibold">
              ↳ {(order as any).returnReason ? returnReasonLabel((order as any).returnReason) : "لم يحدد السبب"}
            </p>
          </>
        )}
        {/* لو returnReceived لسه null */}
        {order.deliveryStatus === "returned" && (order as any).returnReceived == null && (
          <p className="text-[10px] text-red-400 font-semibold">
            ↳ {(order as any).returnReason ? returnReasonLabel((order as any).returnReason) : "لم يحدد السبب"}
          </p>
        )}
        {/* سبب الإرجاع مباشرة تحت حالة الاستلام */}
        {order.deliveryStatus === "partial_received" && order.partialQuantity != null && (
          <p className="text-[10px] text-teal-400 font-semibold">
            {formatCurrency(order.partialQuantity)} من {formatCurrency(order.totalPrice ?? 0)}
          </p>
        )}
        {order.deliveryStatus === "partial_received" && (
          <p className="text-[10px] text-emerald-600 font-semibold">
            ↩ الباقي في مخزن {(order as any).warehouseName || "—"}
          </p>
        )}
        {order.deliveryStatus === "partial_received" && (order as any).returnReceived !== 1 && (
          <>
            {(order as any).returnReceived === 0 && (
              <p className="text-[10px] text-orange-500 font-semibold">🚚 الباقي عند الشحن</p>
            )}
            <p className="text-[10px] text-orange-400 font-semibold">🚚 المرتجع ما زال في شركة الشحن</p>
          </>
        )}
        {/* استلام جزئي (بيان شركة الشحن) — القيمة المستلمة من الإجمالي + مكان المرتجع */}
        {order.deliveryStatus === "partial_delivered" && order.partialQuantity != null && (
          <p className="text-[10px] text-teal-400 font-semibold">
            {formatCurrency(order.partialQuantity)} من {formatCurrency(order.totalPrice ?? 0)}
          </p>
        )}
        {order.deliveryStatus === "partial_delivered" && (
          <p className="text-[10px] text-emerald-600 font-semibold">
            ↩ الباقي في مخزن {(order as any).warehouseName || "—"}
          </p>
        )}
        {order.deliveryStatus === "partial_delivered" && (order as any).returnReceived !== 1 && (
          <p className="text-[10px] text-orange-400 font-semibold">🚚 المرتجع ما زال في شركة الشحن</p>
        )}
        {order.deliveryStatus === "delayed" && order.deliveryNote && !editing && (
          <p className="text-[10px] text-orange-400 mt-0.5 font-semibold">
            ⏸ {order.deliveryNote}
          </p>
        )}
        {order.deliveryStatus !== "delayed" && order.deliveryNote && !editing && (
          <p className="text-[10px] text-muted-foreground">{order.deliveryNote}</p>
        )}
        {!locked && !hideAction && (
          <div className="flex justify-end">
            {editing ? (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-muted-foreground"
                onClick={() => { setEditing(false); setStatus(order.deliveryStatus); setNote(order.deliveryNote ?? ""); setPartialProduct(""); setPartialQty(order.partialQuantity?.toString() ?? ""); setReturnReceived((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null); setPartialReturnReceived(order.deliveryStatus === "partial_received" ? ((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null) : null); setReturnValueReceived((order as any).returnValueReceived != null ? String((order as any).returnValueReceived) : ""); setDeliveredValueReceived((order as any).deliveredValueReceived != null ? String((order as any).deliveredValueReceived) : ""); }}>
                <X className="w-3 h-3" />
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-primary hover:text-primary"
                onClick={() => { setStatus(order.deliveryStatus); setNote(order.deliveryNote ?? ""); setPartialQty(order.partialQuantity?.toString() ?? ""); setReturnReceived((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null); setPartialReturnReceived(order.deliveryStatus === "partial_received" ? ((order as any).returnReceived === 1 ? true : (order as any).returnReceived === 0 ? false : null) : null); setReturnValueReceived((order as any).returnValueReceived != null ? String((order as any).returnValueReceived) : ""); setDeliveredValueReceived((order as any).deliveredValueReceived != null ? String((order as any).deliveredValueReceived) : ""); setEditing(true); }}>
                <Edit2 className="w-3 h-3 ml-0.5" />تقفيل
              </Button>
            )}
          </div>
        )}
        {locked && !hideAction && (
          <div className="flex justify-end">
            <Link href={`/orders/${order.id}`}>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-primary hover:text-primary">عرض</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Editing panel -- Select + qty + note + save */}
      {editing && (
        <div className="px-4 pb-3 flex flex-col gap-2 bg-primary/5 border-t border-primary/10">
          <div className="flex flex-wrap gap-2 items-end mt-2">
            <div className="w-full sm:w-auto">
              <Label className="text-[10px] mb-1 block text-muted-foreground">حالة التسليم</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as DeliveryStatus)}
              >
                <SelectTrigger className="h-8 text-xs w-full sm:w-40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isShipmentManifest
                    ? SHIPMENT_DELIVERY_OPTIONS.filter((o) => o.value !== "pending")
                    : DELIVERY_OPTIONS.filter((o) => o.value !== "partial_received" || Number(order.quantity ?? 0) > 1)
                  ).map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      <span className={o.color}>{o.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsPartial && (() => {
              const isValueMode = status === "partial_delivered" && isShipmentManifest;
              const maxVal = isValueMode ? Number(order.totalPrice ?? 0) : Number(order.quantity ?? 0);
              return (
              <>
                <div>
                  <Label className="text-[10px] mb-1 block text-muted-foreground">
                    {isValueMode ? `القيمة المستلمة من العميل (من إجمالي الشحنة ${formatCurrency(maxVal)})` : `الكمية المستلمة (من ${order.quantity})`} <span className="text-destructive font-bold">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={maxVal}
                    value={partialQty}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") { setPartialQty(""); return; }
                      const n = parseInt(val);
                      if (!isNaN(n) && n > maxVal) { setPartialQty(String(maxVal)); e.target.value = String(maxVal); return; }
                      if (!isNaN(n) && n < 0) { setPartialQty("0"); e.target.value = "0"; return; }
                      setPartialQty(val);
                    }}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value);
                      if (!isNaN(n) && n > maxVal) setPartialQty(String(maxVal));
                      if (!isNaN(n) && n < 0) setPartialQty("0");
                    }}
                    className={`h-8 text-xs w-28 bg-background ${partialQty === "" || parseInt(partialQty) > maxVal ? "border-destructive" : ""}`}
                    placeholder="مطلوب"
                    autoFocus
                  />
                  {(partialQty === "") && (
                    <p className="text-[10px] text-destructive mt-0.5">{isValueMode ? "⚠ أدخل القيمة المستلمة" : "⚠ أدخل الكمية المستلمة"}</p>
                  )}
                  {(partialQty !== "" && parseInt(partialQty) > maxVal) && (
                    <p className="text-[10px] text-destructive mt-0.5">⚠ الحد الأقصى {isValueMode ? formatCurrency(maxVal) : maxVal}</p>
                  )}
                </div>
                <div>
                  <Label className="text-[10px] mb-1 block text-muted-foreground">
                    المنتج المستلم
                  </Label>
                  <Input
                    value={partialProduct}
                    onChange={(e) => setPartialProduct(e.target.value)}
                    className="h-8 text-xs w-44 bg-background"
                    placeholder={order.product}
                  />
                </div>
              </>
              );
            })()}
          </div>
          {/* هل الباقي من الاستلام الجزئي عند الشحن؟ */}
          {(status === "partial_received" || status === "partial_delivered") && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">هل الباقي عند شركة الشحن؟ *</p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setPartialReturnReceived(false)}
                  className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-xs font-bold transition-all ${
                    partialReturnReceived === false
                      ? "border-amber-500 bg-amber-900/30 text-amber-300"
                      : "border-border text-muted-foreground hover:bg-muted/20"
                  }`}
                >
                  <span className="text-base">🚚</span>
                  <span>مازال عند الشحن</span>
                  <span className="text-[9px] font-normal opacity-70">سيُرحَّل للبيان الجديد</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPartialReturnReceived(true)}
                  className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-xs font-bold transition-all ${
                    partialReturnReceived === true
                      ? "border-emerald-500 bg-emerald-900/30 text-emerald-300"
                      : "border-border text-muted-foreground hover:bg-muted/20"
                  }`}
                >
                  <span className="text-base">✅</span>
                  <span>تم استلامه في المخزن</span>
                  <span className="text-[9px] font-normal opacity-70">يُعاد للمخزن تلقائياً</span>
                </button>
              </div>
              <p className="text-[10px] text-center font-medium" style={{ color: partialReturnReceived === true ? "#0F6E56" : partialReturnReceived === false ? "#854F0B" : "var(--color-text-secondary)" }}>
                {partialReturnReceived === true && "✓ سيتم إرجاع الباقي للمخزن"}
                {partialReturnReceived === false && "⏳ الباقي مازال في شركة الشحن — سيُرحَّل"}
                {partialReturnReceived === null && "⚠ يجب اختيار حالة الباقي قبل الحفظ"}
              </p>
            </div>
          )}
          {/* القيمة المستلمة فعليًا عند التسليم — مقارنة تلقائية بإجمالي الطلب */}
          {status === "delivered" && isShipmentManifest && (() => {
            const totalVal = Number(order.totalPrice ?? 0);
            const receivedVal = deliveredValueReceived.trim() === "" || isNaN(Number(deliveredValueReceived))
              ? null
              : Number(deliveredValueReceived);
            const diff = receivedVal != null ? receivedVal - totalVal : null;
            return (
              <div className="space-y-1.5">
                <div>
                  <Label className="text-[10px] mb-1 block text-muted-foreground">
                    القيمة المستلمة فعليًا (من إجمالي الشحنة {formatCurrency(totalVal)})
                  </Label>
                  <Input
                    type="number"
                    value={deliveredValueReceived}
                    onChange={(e) => setDeliveredValueReceived(e.target.value)}
                    className="h-8 text-xs w-40 bg-background"
                    placeholder={String(totalVal)}
                  />
                </div>
                {diff != null && diff > 0 && (
                  <p className="text-[10px] font-semibold text-emerald-500">
                    ⬆ المندوب استلم زيادة قدرها {formatCurrency(diff)}
                  </p>
                )}
                {diff != null && diff < 0 && (
                  <p className="text-[10px] font-semibold text-destructive">
                    ⬇ المندوب استلم ناقص قدرها {formatCurrency(Math.abs(diff))}
                  </p>
                )}
              </div>
            );
          })()}
          {/* حالة استلام المرتجع + سبب — زي الطلبات */}
          {status === "returned" && (
            <div className="flex flex-wrap gap-2 items-end">
              {/* سبب الإرجاع */}
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground">سبب الإرجاع</Label>
                <Select value={returnReason} onValueChange={setReturnReason}>
                  <SelectTrigger className="h-8 text-xs w-44 bg-background border-red-800/60 focus:ring-red-700">
                    <SelectValue placeholder="اختر السبب..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_REASONS.map(r => (
                      <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* هل تم استلام المرتجع */}
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground">حالة الاستلام *</Label>
                <Select
                  value={returnReceived === true ? "received" : returnReceived === false ? "at_shipping" : ""}
                  onValueChange={v => setReturnReceived(v === "received" ? true : v === "at_shipping" ? false : null)}
                >
                  <SelectTrigger className="h-8 text-xs w-44 bg-background border-red-800/60 focus:ring-red-700">
                    <SelectValue placeholder="اختر الحالة... *" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received" className="text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400">↩ تم استلام المرتجع — يُعاد للمخزن</span>
                    </SelectItem>
                    <SelectItem value="at_shipping" className="text-xs">
                      <span className="text-orange-600 dark:text-orange-400">🚚 مازال في الشحن — سيُرحَّل</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {returnReceived === null && (
                <p className="text-[10px] text-destructive w-full">⚠ يجب اختيار حالة الاستلام قبل الحفظ</p>
              )}
              {needsReturnValue && (
                <div>
                  <Label className="text-[10px] mb-1 block text-muted-foreground">القيمة المستلمة فعليًا *</Label>
                  <Input
                    type="number"
                    value={returnValueReceived}
                    onChange={(e) => setReturnValueReceived(e.target.value)}
                    className="h-8 text-xs w-32 bg-background border-red-800/60 focus-visible:ring-red-700"
                    placeholder="0"
                  />
                </div>
              )}
              {needsReturnValue && returnValueReceived.trim() === "" && (
                <p className="text-[10px] text-destructive w-full">⚠ يجب إدخال القيمة المستلمة فعليًا قبل الحفظ</p>
              )}
            </div>
          )}
          <div>
            <Label className="text-[10px] mb-1 block text-muted-foreground">
              {needsNote ? "سبب / ملاحظة (مطلوب)" : "ملاحظة (اختياري)"}
            </Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-8 text-xs bg-background"
              placeholder={
                status === "postponed"
                  ? "مثال: العميل طلب التأجيل أسبوعاً..."
                  : status === "delayed"
                  ? "مثال: العميل مش راد، العنوان غلط..."
                  : status === "returned"
                  ? "مثال: العميل رفض الاستلام..."
                  : "ملاحظة (اختياري)..."
              }
              autoFocus={!needsPartial}
            />
          </div>
          <div className="flex gap-2 justify-between items-center">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
              onClick={() => setConfirmCancel(true)}
              disabled={cancelMutation.isPending}
            >
              <Trash2 className="w-3 h-3" />
              إلغاء من البيان
            </Button>
            <Button
              size="sm"
              className="h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                (needsNote && !note.trim()) ||
                (needsPartial && (partialQty === "")) ||
                (needsPartial && parseInt(partialQty) > (status === "partial_delivered" && isShipmentManifest ? Number(order.totalPrice ?? 0) : Number(order.quantity ?? 0))) ||
                (status === "returned" && returnReceived === null) ||
                (needsReturnValue && returnValueReceived.trim() === "") ||
                ((status === "partial_received" || status === "partial_delivered") && partialReturnReceived === null)
              }
            >
              <Save className="w-3 h-3" />
              {mutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
          <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>إلغاء الطلبية من البيان</AlertDialogTitle>
                <AlertDialogDescription>
                  هل أنت متأكد من إلغاء طلبية <strong>{order.customerName}</strong> ({order.product}) من البيان؟
                  <br />سيتم إرجاعها لحالة &quot;انتظار&quot; وإلغاء تأثيرها على المخزون.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>لا، تراجع</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => { setConfirmCancel(false); cancelMutation.mutate(); }}
                >
                  نعم، إلغاء الطلبية
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// ─── Urgent Button ────────────────────────────────────────────────────────────
function UrgentButton({
  manifestId,
  shipmentId,
  isUrgent,
  urgentNote,
  onToggled,
  disabled = false,
}: {
  manifestId: number;
  shipmentId: number;
  isUrgent: boolean;
  urgentNote?: string | null;
  onToggled: () => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [note, setNote] = useState(urgentNote ?? "");

  const mutation = useMutation({
    mutationFn: (payload: { isUrgent: boolean; urgentNote?: string | null }) =>
      apiFetch(`/shipment-manifests/${manifestId}/items/${shipmentId}/urgent`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_: any, vars: any) => {
      toast({
        title: vars.isUrgent ? "🔴 تم وضع الاستعجال" : "تم إلغاء الاستعجال",
        description: vars.isUrgent ? "سيظهر إشعار للمندوب فوراً" : undefined,
      });
      setShowNoteDialog(false);
      onToggled();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // لو مستعجل → اضغط يلغي مباشرة
  // لو مش مستعجل → اضغط يفتح dialog لكتابة سبب (اختياري) ثم يفعّل
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUrgent) {
      mutation.mutate({ isUrgent: false, urgentNote: null });
    } else {
      setNote("");
      setShowNoteDialog(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || mutation.isPending}
        title={isUrgent ? `إلغاء الاستعجال${urgentNote ? ` — ${urgentNote}` : ""}` : "استعجال هذه الشحنة"}
        className={`
          flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-black border transition-all duration-200
          ${isUrgent
            ? "bg-red-500/20 border-red-500/60 text-red-400 hover:bg-red-500/30 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)]"
            : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400"
          }
          ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        <Zap className={`w-3 h-3 shrink-0 ${isUrgent ? "fill-red-400" : ""}`} />
        {isUrgent ? "مستعجل!" : "استعجال"}
      </button>

      {/* Dialog كتابة سبب الاستعجال */}
      {showNoteDialog && (
        <Dialog open onOpenChange={open => { if (!open) setShowNoteDialog(false); }}>
          <DialogContent className="bg-card border-red-500/30 max-w-sm" dir="rtl"
            onClick={e => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-400">
                <Zap className="w-4 h-4 fill-red-400" />
                استعجال الشحنة
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-1">
              <p className="text-xs text-muted-foreground">
                سيصل إشعار استعجال للمندوب فور الحفظ. أضف سبباً اختيارياً يظهر له.
              </p>
              <div>
                <Label className="text-xs mb-1.5 block">سبب الاستعجال (اختياري)</Label>
                <Input
                  placeholder="مثال: العميل مستعجل جداً — اتصل قبل التوصيل"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="h-8 text-sm bg-background border-red-500/30 focus:border-red-500"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") mutation.mutate({ isUrgent: true, urgentNote: note.trim() || null }); }}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 h-8 text-xs font-black bg-red-500 hover:bg-red-600 text-white gap-1.5"
                  onClick={() => mutation.mutate({ isUrgent: true, urgentNote: note.trim() || null })}
                  disabled={mutation.isPending}
                >
                  <Zap className="w-3.5 h-3.5 fill-white" />
                  {mutation.isPending ? "جاري الإرسال..." : "استعجال الآن"}
                </Button>
                <Button variant="outline" className="h-8 text-xs border-border" onClick={() => setShowNoteDialog(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Invoice Group Row — يعرض مجموعة طلبات بنفس invoiceNumber كصف واحد ─────
function InvoiceGroupDeliveryRow({
  group,
  manifestId,
  locked,
  onSaved,
  rowIndex = 0,
  selected = false,
  onToggleSelect,
  isShipmentManifest = false,
  courierShippingCost = null,
}: {
  group: ManifestOrder[];
  manifestId: number;
  locked: boolean;
  onSaved: () => void;
  rowIndex?: number;
  selected?: boolean;
  onToggleSelect?: (groupKey: string) => void;
  isShipmentManifest?: boolean;
  courierShippingCost?: number | null;
}) {
  const { toast } = useToast();

  const rep = group[0];
  const groupKey = getManifestGroupKey(rep);
  const totalQty = group.reduce((s, o) => s + o.quantity, 0);
  // السعر الفعلي: لو partial_received احسب الجزء المستلم (كمية)، لو partial_delivered في بيان الشحن القيمة مسجَّلة مباشرة
  const totalPrice = group.reduce((s, o) => {
    if (o.deliveryStatus === "partial_delivered" && isShipmentManifest && o.partialQuantity != null) {
      return s + Number(o.partialQuantity);
    }
    if (o.deliveryStatus === "partial_received" && o.partialQuantity != null) {
      return s + Number(o.unitPrice) * Number(o.partialQuantity);
    }
    return s + Number(o.totalPrice);
  }, 0);
  // السعر الكامل للفاتورة (للعرض والمرجع)
  const totalFullPrice = group.reduce((s, o) => s + Number(o.totalPrice), 0);
  // القيمة المستلمة فعليًا (عمود "المستلم" في الجدول): صفر لحد ما المندوب يحدد حالة فيها قيمة فعلية
  // مسلَّم بالكامل = القيمة كاملة | استلام جزئي = القيمة اللي دخلها المندوب | مرتجع (دفع مصاريف الشحن) = مصاريف الشحن | غير كده = صفر
  const receivedAmount = group.reduce((s, o) => {
    if (o.deliveryStatus === "delivered") {
      const dvr = (o as any).deliveredValueReceived;
      return s + (dvr != null ? Number(dvr) : Number(o.totalPrice ?? 0));
    }
    if (o.deliveryStatus === "partial_delivered" && isShipmentManifest && o.partialQuantity != null) {
      return s + Number(o.partialQuantity);
    }
    if (o.deliveryStatus === "partial_received" && o.partialQuantity != null) {
      return s + Number(o.unitPrice) * Number(o.partialQuantity);
    }
    if (o.deliveryStatus === "returned" && ["refused_paid", "refused_unpaid", "quality"].includes((o as any).returnReason)) {
      return s + Number((o as any).returnValueReceived ?? 0);
    }
    return s;
  }, 0);
  const invoiceNum = (rep as any).invoiceNumber?.trim() || null;
  const isMulti = group.length > 1;


  // حالة المجموعة: لو كل الطلبات بنفس الحالة → اعرضها
  // لو مختلطة بين partial_received و pending/postponed → partial_received (بعض المنتجات استُلمت وبعضها لا)
  // وإلا → "pending"
  const statuses = [...new Set(group.map(o => o.deliveryStatus))];
  const hasMixedPartial = statuses.includes("partial_received") && statuses.every(s => s === "partial_received" || s === "pending" || s === "postponed");
  const groupStatus: DeliveryStatus = statuses.length === 1
    ? statuses[0] as DeliveryStatus
    : hasMixedPartial
      ? "partial_received"
      : "pending";
  const groupOpt = deliveryOpt(groupStatus, isShipmentManifest);
  const hasMultipleStatuses = statuses.length > 1;

  // الحالة المعروضة: لو في وضع تعديل أو بعد حفظ (قبل refetch) → نعرض bulkStatus، غير كده نعرض groupStatus
  // هيتحدث بعد ما groupPartialKey يتغير (refetch رجع) لأن pendingSaveRef.current سيُمسح

  // تقفيل جماعي — state
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<DeliveryStatus>(groupStatus);
  const [bulkNote, setBulkNote] = useState(rep.deliveryNote ?? "");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [bulkReturnReceived, setBulkReturnReceived] = useState<boolean | null>(
    (rep as any).returnReceived === 1 ? true : (rep as any).returnReceived === 0 ? false : null
  );
  const [bulkReturnReason, setBulkReturnReason] = useState<string>((rep as any).returnReason ?? "");
  const [bulkReturnValueReceived, setBulkReturnValueReceived] = useState<string>(
    (rep as any).returnValueReceived != null ? String((rep as any).returnValueReceived) : ""
  );
  const [bulkDeliveredValueReceived, setBulkDeliveredValueReceived] = useState<string>(
    (rep as any).deliveredValueReceived != null ? String((rep as any).deliveredValueReceived) : ""
  );
  const RETURN_REASONS_NEED_VALUE_BULK = ["refused_paid", "refused_unpaid", "quality"];
  const bulkNeedsReturnValue = bulkStatus === "returned" && RETURN_REASONS_NEED_VALUE_BULK.includes(bulkReturnReason);

  // لكل منتج في الفاتورة: حالة مستقلة — نستخدم o.id كـ key
  const [perOrderStatus, setPerOrderStatus] = useState<Record<number, DeliveryStatus>>(
    Object.fromEntries(group.map(o => [o.id, o.deliveryStatus as DeliveryStatus]))
  );
  const [partialQtyMap, setPartialQtyMap] = useState<Record<number, string>>(
    Object.fromEntries(group.map(o => [o.id, o.partialQuantity?.toString() ?? ""]))
  );
  const [partialReturnReceived, setPartialReturnReceived] = useState<boolean | null>(
    group[0]?.returnReceived === 1 ? true : group[0]?.returnReceived === 0 ? false : null
  );
  // نحفظ القيم المُرسَلة للـ API هنا عشان نستخدمها في onSuccess
  const pendingSaveRef = useRef<{
    partialQtyMap: Record<number, string>;
    perOrderStatus: Record<number, DeliveryStatus>;
    bulkStatus: DeliveryStatus;
    partialReturnReceived: boolean | null;
  } | null>(null);

  // key مستقر للـ group — بيتغير لما partialQuantity أو returnReceived أو القيمة المستلمة فعليًا يتغيروا
  const groupPartialKey = group.map(o => `${o.id}:${o.partialQuantity ?? ""}:${(o as any).returnReceived ?? ""}:${(o as any).deliveredValueReceived ?? ""}:${(o as any).returnValueReceived ?? ""}`).join(",");

  // الكميات المعروضة: لو في وضع التعديل أو بعد حفظ فوري → من state، وإلا من server
  // الحالة المعروضة في الـ UI (خارج وضع التعديل): لما pendingSaveRef موجود نعرض bulkStatus (الحالة المحفوظة) لحد ما يجي الـ refetch
  const displayStatus: DeliveryStatus = (bulkEditing || pendingSaveRef.current !== null) ? bulkStatus : groupStatus;
  const displayOpt = deliveryOpt(displayStatus, isShipmentManifest);

  const displayPartialQtyMap: Record<number, number> = Object.fromEntries(
    group.map(o => {
      const stateVal = partialQtyMap[o.id];
      const parsed = stateVal !== "" && stateVal !== undefined ? parseInt(stateVal) : NaN;
      const useState = bulkEditing || pendingSaveRef.current !== null;
      return [o.id, useState && !isNaN(parsed) ? parsed : (o.partialQuantity ?? 0)];
    })
  );
  const displayTotalPartialQty = Object.values(displayPartialQtyMap).reduce((s, v) => s + v, 0);

  // مزامنة الـ state مع الـ prop بعد كل refetch أو لما نخرج من وضع التعديل
  // تتبع آخر groupPartialKey شفناه — عشان نعرف لو الـ server data فعلاً اتغيرت
  const prevGroupPartialKeyRef = useRef(groupPartialKey);

  useEffect(() => {
    if (!bulkEditing) {
      const keyChanged = prevGroupPartialKeyRef.current !== groupPartialKey;
      prevGroupPartialKeyRef.current = groupPartialKey;

      if (pendingSaveRef.current) {
        if (keyChanged) {
          // server data وصلت فعلاً وفيها التغيير → امسح الـ ref واعمل sync
          pendingSaveRef.current = null;
        } else {
          // refetch لسه ما خلصش أو مفيش تغيير في الـ key → مش نعمل sync دلوقتي
          return;
        }
      }
      setBulkStatus(groupStatus);
      setBulkNote(rep.deliveryNote ?? "");
      setBulkReturnReceived((rep as any).returnReceived === 1 ? true : (rep as any).returnReceived === 0 ? false : null);
      setBulkReturnReason((rep as any).returnReason ?? "");
      setBulkReturnValueReceived((rep as any).returnValueReceived != null ? String((rep as any).returnValueReceived) : "");
      setBulkDeliveredValueReceived((rep as any).deliveredValueReceived != null ? String((rep as any).deliveredValueReceived) : "");
      setPerOrderStatus(Object.fromEntries(group.map(o => [o.id, o.deliveryStatus as DeliveryStatus])));
      setPartialQtyMap(Object.fromEntries(group.map(o => [o.id, o.partialQuantity?.toString() ?? ""])));
      const serverPartialReturn = group[0]?.returnReceived === 1 ? true : group[0]?.returnReceived === 0 ? false : null;
      setPartialReturnReceived(groupStatus === "partial_received" && serverPartialReturn === null ? false : serverPartialReturn);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupStatus, rep.deliveryNote, (rep as any).returnReceived, bulkEditing, groupPartialKey]);

  const cancelGroupMutation = useMutation({
    mutationFn: async () => {
      for (const order of group) {
        if (isShipmentManifest) {
          await shipmentManifestsApi.deleteItem(manifestId, order.shipmentId);
        } else {
          await manifestsApi.cancelOrder(manifestId, order.id);
        }
      }
    },
    onSuccess: () => {
      toast({ title: "تم إلغاء الفاتورة كاملها من البيان نهائيًا" });
      setBulkEditing(false);
      onSaved();
    },
    onError: (e: any) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // وضع per-item: لما فاتورة متعددة → دايماً كل منتج له حالته المستقلة
  // لما فاتورة منتج واحد → bulkStatus على الكل
  const isPerItemMode = isMulti;

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (bulkStatus === "returned" && bulkNeedsReturnValue && (bulkReturnValueReceived.trim() === "" || isNaN(Number(bulkReturnValueReceived)))) {
        throw new Error("يجب إدخال القيمة المستلمة فعليًا قبل الحفظ");
      }
      // نحفظ snapshot من القيم الحالية قبل الـ API calls
      pendingSaveRef.current = {
        partialQtyMap: { ...partialQtyMap },
        perOrderStatus: { ...perOrderStatus },
        bulkStatus,
        partialReturnReceived,
      };
      for (const order of group) {
        let finalStatus: DeliveryStatus = bulkStatus;
        let finalPartialQty: number | null = null;

        if (isMulti && (bulkStatus === "partial_received" || bulkStatus === "partial_delivered")) {
          // فاتورة متعددة + partial: كل منتج له كميته المستقلة من partialQtyMap
          const key = order.id;
          const val = partialQtyMap[key];
          const parsed = (val !== "" && val !== undefined && val !== null) ? parseInt(val) : null;
          if (parsed !== null && !isNaN(parsed) && parsed >= 0) {
            finalStatus = bulkStatus;
            finalPartialQty = parsed;
          } else if (order.partialQuantity && order.partialQuantity > 0) {
            // مفيش قيمة جديدة → نستخدم الكمية الموجودة في DB (مش نغير الحالة)
            finalStatus = bulkStatus;
            finalPartialQty = order.partialQuantity;
          } else {
            // مفيش قيمة خالص → نفضل على نفس الحالة القديمة (مش نبعت pending)
            finalStatus = (order.deliveryStatus as DeliveryStatus) ?? bulkStatus;
            finalPartialQty = null;
          }
        } else if (isPerItemMode && bulkStatus !== "partial_received" && bulkStatus !== "partial_delivered") {
          // فاتورة متعددة + حالة أخرى: كل منتج له حالته المستقلة من perOrderStatus
          const key = order.id;
          finalStatus = perOrderStatus[key] ?? bulkStatus;
          if (finalStatus === "partial_received" || finalStatus === "partial_delivered") {
            const val = partialQtyMap[key];
            finalPartialQty = (val !== "" && val !== undefined) ? parseInt(val) : null;
          }
        } else {
          // فاتورة منتج واحد
          finalStatus = bulkStatus;
          if (finalStatus === "partial_received" || finalStatus === "partial_delivered") {
            const key = order.id;
            const val = partialQtyMap[key];
            finalPartialQty = (val !== "" && val !== undefined) ? parseInt(val) : null;
          }
        }

        if (isShipmentManifest) {
          const allowedSt = ["pending","delivered","partial_delivered","returned","delayed"] as const;
          const safeSt = allowedSt.includes(finalStatus as any) ? finalStatus as "pending"|"delivered"|"partial_delivered"|"returned"|"delayed" : "pending";
          await shipmentManifestsApi.updateItem(manifestId, order.shipmentId, {
            deliveryStatus: safeSt,
            deliveryNote: bulkNote.trim() || null,
            partialQuantity: safeSt === "partial_delivered" ? finalPartialQty : null,
            returnReceived: safeSt === "returned" ? bulkReturnReceived : null,
            returnReason: safeSt === "returned" ? (bulkReturnReason.trim() || null) : null,
            returnValueReceived: safeSt === "returned" && bulkNeedsReturnValue ? Number(bulkReturnValueReceived) : null,
            deliveredValueReceived:
              safeSt === "delivered" && bulkDeliveredValueReceived.trim() !== "" && !isNaN(Number(bulkDeliveredValueReceived))
                ? Number(bulkDeliveredValueReceived)
                : null,
          });
        } else {
          await manifestsApi.updateOrderDelivery(manifestId, order.id, {
            deliveryStatus: finalStatus,
            deliveryNote: bulkNote.trim() || null,
            partialQuantity: finalPartialQty,
            ...(finalStatus === 'partial_received' ? { partialReturnReceived: partialReturnReceived ?? false } : {}),
            ...(finalStatus === 'returned' ? { returnReceived: bulkReturnReceived, returnReason: bulkReturnReason || null } : {}),
          });
        }
      }
    },
    onSuccess: () => {
      toast({ title: "تم حفظ حالة التسليم للفاتورة كاملها" });
      // نطبق القيم المُرسَلة في الـ state فوراً
      if (pendingSaveRef.current) {
        const { partialQtyMap: savedQty, perOrderStatus: savedStatus, bulkStatus: savedBulk, partialReturnReceived: savedPartialReturn } = pendingSaveRef.current;
        setPartialQtyMap(savedQty);
        setPerOrderStatus(savedStatus);
        setBulkStatus(savedBulk);
        setPartialReturnReceived(savedPartialReturn);
        // لا نمسح pendingSaveRef هنا — يحمي useEffect من override بالقيم القديمة
        // سيُمسح في useEffect لما groupPartialKey يتغير (= server data وصلت فعلاً)
      }
      setBulkEditing(false);
      onSaved();
    },
    onError: (e: any) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });
  const needsBulkNote = bulkStatus === "postponed" || bulkStatus === "returned" || bulkStatus === "delayed";

  // products summary
  const productsText = group.map(o => {
    const variant = [o.color, o.size].filter(Boolean).join("/");
    return variant ? `${o.product} (${variant}) ×${o.quantity}` : `${o.product} ×${o.quantity}`;
  }).join("، ");

  return (
    <>
      {/* ── Main group row ── */}
      <div
        className={`border-b border-border/50 transition-colors ${bulkEditing ? "bg-primary/5" : selected ? "bg-primary/10 border-primary/30" : "hover:bg-muted/10"}`}
        style={{
          animation: "rowFadeIn 0.35s ease both",
          animationDelay: `${rowIndex * 45}ms`,
        }}
      >
        {/* Row (fully responsive, no horizontal scroll) */}
        <div
          dir="rtl"
          className="grid grid-cols-[28px_minmax(0,1fr)_74px_64px_56px] md:grid-cols-[28px_90px_minmax(0,0.65fr)_88px_84px_minmax(0,1.65fr)_72px_64px_64px_100px_90px] gap-0 items-start py-2.5 text-xs"
        >
          {/* تحديد */}
          <div className="flex items-center justify-center pt-0.5" onClick={e => e.stopPropagation()}>
            {onToggleSelect && (
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect(groupKey)}
                className="shrink-0"
              />
            )}
          </div>
          {/* اسم الراسل */}
          <div className="hidden md:flex min-w-0 px-1.5 items-center overflow-hidden">
            {(rep as any).senderName ? (
              <p className="text-[10px] font-semibold text-primary/80 truncate">{(rep as any).senderName}</p>
            ) : (
              <p className="text-muted-foreground/40 text-[10px]">—</p>
            )}
          </div>
          {/* اسم العميل */}
          <div className="min-w-0 px-1.5 flex items-start overflow-hidden">
            <div className="min-w-0 w-full">
              <p className="font-semibold truncate">{rep.customerName}</p>
              <div className="flex items-center gap-1 flex-wrap">
                {invoiceNum && (
                  <span className="text-[9px] bg-primary/10 text-primary px-1 rounded font-mono truncate max-w-full">
                    {invoiceNum}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* رقم تليفون العميل */}
          <div className="flex min-w-0 px-1.5 items-center overflow-hidden">
            {rep.phone ? (
              <p className="text-[10px] text-muted-foreground truncate">{rep.phone}</p>
            ) : (
              <p className="text-muted-foreground/40 text-[10px]">—</p>
            )}
          </div>
          {/* المحافظة */}
          <div className="min-w-0 px-1.5 flex items-center overflow-hidden">
            {rep.city ? (
              <p className="font-semibold text-[10px] truncate">{rep.city}</p>
            ) : (
              <p className="text-muted-foreground/40 text-[10px]">—</p>
            )}
          </div>
          {/* العنوان التفصيلي */}
          <div className="hidden md:flex min-w-0 px-1.5 items-start overflow-hidden">
            {(rep as any).address ? (
              <p className="text-[10px] leading-relaxed text-foreground/80 truncate">{(rep as any).address}</p>
            ) : (
              <p className="text-muted-foreground/40 text-[10px]">—</p>
            )}
          </div>
          {/* اجمالى سعر الشحنة (COD) */}
          <div className="text-left font-bold px-1.5 flex items-center overflow-hidden">
            <span className="text-emerald-500 truncate">{formatCurrency(totalFullPrice)}</span>
          </div>
          {/* القيمة المستلمة (فعليًا) */}
          <div className="hidden md:flex text-center px-1 items-center justify-center overflow-hidden">
            <span className="text-emerald-500 font-semibold truncate">{formatCurrency(receivedAmount)}</span>
          </div>
          {/* تكلفة الشحن (المندوب) */}
          <div className="text-center px-1 flex items-center justify-center overflow-hidden">
            {courierShippingCost != null ? (
              <span className="text-amber-500 font-semibold truncate">{formatCurrency(courierShippingCost)}</span>
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </div>
          {/* حالة الاوردر + زرار التقفيل */}
          <div className="px-1.5 flex flex-col gap-1 overflow-hidden" onClick={e => e.stopPropagation()}>
            {hasMultipleStatuses && !hasMixedPartial ? (
              <div className="flex flex-col gap-0.5">
                <Badge variant="outline" className="text-[9px] font-bold border border-border text-muted-foreground">
                  حالات متعددة
                </Badge>
                {group.map(o => {
                  const opt = deliveryOpt(o.deliveryStatus as DeliveryStatus, isShipmentManifest);
                  const label = (o.deliveryStatus === "partial_received" || o.deliveryStatus === "partial_delivered") && o.partialQuantity
                    ? `${o.product} ×${o.partialQuantity}/${o.quantity}`
                    : `${o.product}`;
                  return (
                    <p key={o.id} className={`text-[9px] truncate max-w-[110px] font-medium ${opt.color}`}>
                      {o.deliveryStatus === "delivered" ? "✓" :
                       o.deliveryStatus === "returned" ? "✕" :
                       (o.deliveryStatus === "partial_received" || o.deliveryStatus === "partial_delivered") ? "◑" :
                       (o.deliveryStatus === "postponed" || o.deliveryStatus === "delayed") ? "⏸" : "○"} {label}
                    </p>
                  );
                })}
              </div>
            ) : (displayStatus === "partial_received" || displayStatus === "partial_delivered") ? (
              <div className="flex flex-col gap-0.5">
                <Badge variant="outline" className={`text-[9px] font-bold border ${displayOpt.bg} ${displayOpt.color}`}>
                  {displayOpt.label} ({displayTotalPartialQty}/{totalQty})
                </Badge>
                {group.filter(o => (displayPartialQtyMap[o.id] ?? 0) > 0).map(o => (
                  <p key={o.id} className="text-[9px] text-teal-600 dark:text-teal-400 truncate max-w-[110px]">
                    ◑ {o.product} ×{displayPartialQtyMap[o.id]}
                  </p>
                ))}
                {(rep as any).returnReceived === 0 && (
                  <p className="text-[9px] text-orange-500 font-semibold">🚚 الباقي عند الشحن</p>
                )}
                <p className="text-[9px] text-emerald-500 font-semibold">
                  ↩ الباقي في مخزن {(rep as any).warehouseName || "—"}
                </p>
                {(rep as any).returnReceived !== 1 && (
                  <p className="text-[9px] text-orange-400 font-semibold">🚚 المرتجع ما زال في شركة الشحن</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <Badge variant="outline" className={`text-[9px] font-bold border ${displayOpt.bg} ${displayOpt.color}`}>
                  {displayOpt.label}
                </Badge>
                {/* سبب التأجيل تحت الـ badge مباشرة */}
                {(displayStatus === "delayed" || displayStatus === "postponed") && (
                  <p className="text-[10px] text-orange-400 mt-0.5 font-semibold">
                    ⏸ {rep.deliveryNote || "لم يحدد السبب"}
                  </p>
                )}
                {/* sub-status للمرتجع في الـ group row */}
                {displayStatus === "returned" && (rep as any).returnReceived === 1 && (
                  <>
                    <p className="text-[10px] text-emerald-600 mt-0.5 font-semibold">↩ تم الاستلام</p>
                    <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-0.5">
                      ↳ {(rep as any).returnReason ? (RETURN_REASONS.find(r => r.value === (rep as any).returnReason)?.label ?? (rep as any).returnReason) : "لم يحدد السبب"}
                    </p>
                  </>
                )}
                {displayStatus === "returned" && (rep as any).returnReceived === 0 && (
                  <>
                    <p className="text-[10px] text-orange-500 mt-0.5 font-semibold">⏳ عند شركة الشحن</p>
                    <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-0.5">
                      ↳ {(rep as any).returnReason ? (RETURN_REASONS.find(r => r.value === (rep as any).returnReason)?.label ?? (rep as any).returnReason) : "لم يحدد السبب"}
                    </p>
                  </>
                )}
                {displayStatus === "returned" && (rep as any).returnReceived == null && (
                  <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-0.5">
                    ↳ {(rep as any).returnReason ? (RETURN_REASONS.find(r => r.value === (rep as any).returnReason)?.label ?? (rep as any).returnReason) : "لم يحدد السبب"}
                  </p>
                )}
                {displayStatus === "partial_received" && (
                  <p className="text-[10px] text-emerald-600 mt-0.5 font-semibold">
                    ↩ الباقي في مخزن {(rep as any).warehouseName || "—"}
                  </p>
                )}
                {displayStatus === "partial_received" && (rep as any).returnReceived !== 1 && (
                  <>
                    {(rep as any).returnReceived === 0 && (
                      <p className="text-[10px] text-orange-500 mt-0.5 font-semibold">🚚 الباقي عند الشحن</p>
                    )}
                    <p className="text-[10px] text-orange-400 mt-0.5 font-semibold">🚚 المرتجع ما زال في شركة الشحن</p>
                  </>
                )}
              </div>
            )}
            {/* زرار التقفيل + الاستعجال جنب بعض */}
            {!locked && (
              <div className="flex items-center gap-1 mt-1">
                {bulkEditing ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-1.5 text-muted-foreground self-start"
                    onClick={() => setBulkEditing(false)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-1.5 text-primary hover:text-primary self-start"
                    onClick={() => {
                      setBulkEditing(true);
                      setBulkStatus(groupStatus);
                      setBulkNote(rep.deliveryNote ?? "");
                      setPartialQtyMap(Object.fromEntries(group.map(o => [o.id, o.partialQuantity?.toString() ?? ""])));
                      setPerOrderStatus(Object.fromEntries(group.map(o => [o.id, o.deliveryStatus as DeliveryStatus])));
                      setBulkReturnReceived((rep as any).returnReceived === 1 ? true : (rep as any).returnReceived === 0 ? false : null);
                      const existingPartialReturn = (rep as any).returnReceived === 1 ? true : (rep as any).returnReceived === 0 ? false : null;
                      setPartialReturnReceived(groupStatus === "partial_received" && existingPartialReturn === null ? false : existingPartialReturn);
                    }}
                  >
                    <Edit2 className="w-3 h-3 ml-0.5" />تقفيل
                  </Button>
                )}
                {/* ── زرار الاستعجال جنب التقفيل ── */}
                {false && isShipmentManifest && (
                  <div onClick={e => e.stopPropagation()}>
                    <UrgentButton
                      manifestId={manifestId}
                      shipmentId={(rep as any).shipmentId ?? rep.id}
                      isUrgent={!!(rep as any).isUrgent}
                      urgentNote={(rep as any).urgentNote}
                      onToggled={onSaved}
                      disabled={false}
                    />
                  </div>
                )}
              </div>
            )}
            {/* لو البيان مغلق وعايزين نعرض الاستعجال بس */}
            {false && locked && isShipmentManifest && (
              <div className="mt-1" onClick={e => e.stopPropagation()}>
                <UrgentButton
                  manifestId={manifestId}
                  shipmentId={(rep as any).shipmentId ?? rep.id}
                  isUrgent={!!(rep as any).isUrgent}
                  urgentNote={(rep as any).urgentNote}
                  onToggled={onSaved}
                  disabled={false}
                />
              </div>
            )}
          </div>
          {/* ملاحظات */}
          <div className="hidden md:flex min-w-0 px-1.5 items-start overflow-hidden">
            {rep.deliveryNote ? (
              <p className="text-[10px] leading-relaxed text-foreground/80 truncate">{rep.deliveryNote}</p>
            ) : (
              <p className="text-muted-foreground/40 text-[10px]">—</p>
            )}
          </div>
        </div>
        {/* Row is fully responsive — no horizontal scroll needed on any breakpoint */}

        {/* Bulk editing panel */}
        {bulkEditing && (
          <div className="px-4 pb-3 flex flex-col gap-2 bg-primary/5 border-t border-primary/10">

            {/* ── Dropdown الحالة: يظهر دايماً سواء منتج واحد أو متعددة ── */}
            <div className="flex flex-wrap gap-2 items-end mt-2">
              <div className="w-full sm:w-auto">
                <Label className="text-[10px] mb-1 block text-muted-foreground">حالة التسليم</Label>
                <Select
                  value={bulkStatus}
                  onValueChange={(v) => {
                    setBulkStatus(v as DeliveryStatus);
                    // sync perOrderStatus مع الاختيار الجديد دايماً
                    setPerOrderStatus(Object.fromEntries(group.map(o => [o.id, v as DeliveryStatus])));
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-full sm:w-40 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(isShipmentManifest
                      ? SHIPMENT_DELIVERY_OPTIONS.filter((o) => o.value !== "pending")
                      : DELIVERY_OPTIONS.filter((o) => {
                          if (o.value !== "partial_received") return true;
                          // أظهر "استلام جزئي" فقط لو الكمية الكلية للمجموعة أكتر من 1
                          const totalQty = group.reduce((s, o) => s + (o.quantity ?? 1), 0);
                          return totalQty > 1;
                        })
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        <span className={o.color}>{o.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* منتج واحد: خانة الكمية في نفس الصف */}
              {!isMulti && (bulkStatus === "partial_received" || bulkStatus === "partial_delivered") && group[0] && (() => {
                const o = group[0];
                const variant = [o.color, o.size].filter(Boolean).join(" / ");
                const oQty = Number(o.quantity ?? 0);
                const oTotal = Number(o.totalPrice ?? 0);
                const unitPrice = oQty > 0 ? oTotal / oQty : 0;
                const isValueMode = bulkStatus === "partial_delivered" && isShipmentManifest;
                const maxVal = isValueMode ? oTotal : oQty;
                const rawVal = partialQtyMap[o.id];
                const hasQty = rawVal !== "" && rawVal !== undefined && rawVal !== null;
                const partialVal = hasQty ? parseInt(rawVal) : 0;
                return (
                  <div className="flex flex-col gap-2 border border-teal-300 dark:border-teal-700 rounded-md p-2.5 bg-teal-50 dark:bg-teal-900/20">
                    <Label className="text-[10px] font-bold text-teal-700 dark:text-teal-400">
                      {isValueMode ? "حدد القيمة المستلمة من العميل" : "حدد الكمية المستلمة"}
                    </Label>
                    <div className="rounded-md border border-teal-200 dark:border-teal-800 bg-background p-2 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold">{o.product || o.invoiceNumber}</p>
                          {variant && <p className="text-[10px] text-muted-foreground">{variant}</p>}
                        </div>
                        <span className="text-xs font-bold text-muted-foreground">{isValueMode ? `إجمالي الشحنة: ${formatCurrency(maxVal)}` : `الإجمالي: ${o.quantity}`}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-muted-foreground shrink-0">المستلم:</Label>
                        <input
                          type="number"
                          min={0}
                          max={maxVal}
                          value={rawVal ?? ""}
                          onChange={e => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setPartialQtyMap(prev => ({ ...prev, [o.id]: "" }));
                            } else {
                              const n = parseInt(raw);
                              if (!isNaN(n) && n >= 0 && n <= maxVal) {
                                setPartialQtyMap(prev => ({ ...prev, [o.id]: String(n) }));
                              }
                            }
                          }}
                          className={`h-7 w-20 rounded border bg-background px-2 text-xs text-center ${!hasQty ? "border-destructive" : "border-teal-400"}`}
                          placeholder="مطلوب"
                          autoFocus
                        />
                        <span className="text-[10px] text-muted-foreground">من {isValueMode ? formatCurrency(maxVal) : maxVal}</span>
                        {!hasQty && (
                          <span className="text-[10px] text-destructive">⚠ مطلوب</span>
                        )}
                        {!isValueMode && partialVal > 0 && (
                          <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                            = {(unitPrice * partialVal).toFixed(0)} ج.م
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── فاتورة متعددة + partial_received/partial_delivered: اعرض كل منتج على حدة ── */}
            {isMulti && (bulkStatus === "partial_received" || bulkStatus === "partial_delivered") && (
              <div className="flex flex-col gap-2 border border-teal-300 dark:border-teal-700 rounded-md p-2.5 bg-teal-50 dark:bg-teal-900/20">
                <Label className="text-[10px] font-bold text-teal-700 dark:text-teal-400">
                  {bulkStatus === "partial_delivered" && isShipmentManifest ? "حدد القيمة المستلمة من العميل لكل منتج" : "حدد الكمية المستلمة لكل منتج"}
                </Label>
                {group.map((o) => {
                  const variant = [o.color, o.size].filter(Boolean).join(" / ");
                  const oQty = Number(o.quantity ?? 0);
                  const oTotal = Number(o.totalPrice ?? 0);
                  const unitPrice = oQty > 0 ? oTotal / oQty : 0;
                  const isValueMode = bulkStatus === "partial_delivered" && isShipmentManifest;
                  const maxVal = isValueMode ? oTotal : oQty;
                  const mKey = o.id;
                  const rawVal = partialQtyMap[mKey];
                  const hasQty = rawVal !== "" && rawVal !== undefined && rawVal !== null;
                  const partialVal = hasQty ? parseInt(rawVal) : 0;
                  return (
                    <div key={mKey} className="rounded-md border border-teal-200 dark:border-teal-800 bg-background p-2 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold">{o.product}</p>
                          {variant && <p className="text-[10px] text-muted-foreground">{variant}</p>}
                        </div>
                        <span className="text-xs font-bold text-muted-foreground">{isValueMode ? `إجمالي الشحنة: ${formatCurrency(maxVal)}` : `الإجمالي: ${o.quantity}`}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-muted-foreground shrink-0">المستلم:</Label>
                        <input
                          type="number"
                          min={0}
                          max={maxVal}
                          value={partialQtyMap[mKey] ?? ""}
                          onChange={e => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setPartialQtyMap(prev => ({ ...prev, [mKey]: "" }));
                            } else {
                              const n = parseInt(raw);
                              if (!isNaN(n) && n >= 0 && n <= maxVal) {
                                setPartialQtyMap(prev => ({ ...prev, [mKey]: String(n) }));
                              }
                            }
                          }}
                          className={`h-7 w-20 rounded border bg-background px-2 text-xs text-center ${!hasQty ? "border-destructive" : "border-teal-400"}`}
                          placeholder="مطلوب"
                          autoFocus={o.id === group[0].id}
                        />
                        <span className="text-[10px] text-muted-foreground">من {isValueMode ? formatCurrency(maxVal) : maxVal}</span>
                        {!hasQty && (
                          <span className="text-[10px] text-destructive">⚠ مطلوب</span>
                        )}
                        {!isValueMode && partialVal > 0 && (
                          <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                            = {(unitPrice * partialVal).toFixed(0)} ج.م
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── فاتورة متعددة + حالة أخرى (مش partial): لا تظهر تفاصيل — الحالة بتتطبق على الكل تلقائياً ── */}
            {isMulti && bulkStatus !== "partial_received" && false && (
              <div className="flex flex-col gap-2 border border-border/40 rounded-md p-2.5 bg-muted/10">
                <Label className="text-[10px] font-bold text-muted-foreground">
                  تفاصيل المنتجات — يمكن تعديل حالة كل منتج على حدة
                </Label>
                {group.map((o) => {
                  const variant = [o.color, o.size].filter(Boolean).join(" / ");
                  const oStatus = perOrderStatus[o.id] ?? bulkStatus;
                  return (
                    <div key={o.id} className="rounded-md border border-border/40 bg-background p-2 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold">{o.product}</p>
                          {variant && <p className="text-[10px] text-muted-foreground">{variant}</p>}
                        </div>
                        <span className="text-xs font-bold text-muted-foreground">{o.quantity}x</span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {([
                          { v: "delivered",        label: "مسلَّم ✓", cls: "border-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" },
                          { v: "partial_received", label: "جزئي",     cls: "border-teal-400 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400" },
                          { v: "returned",         label: "مرتجع",   cls: "border-red-400 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400" },
                          { v: "pending",          label: "انتظار",  cls: "border-border bg-muted/30 text-muted-foreground" },
                        ] as { v: DeliveryStatus; label: string; cls: string }[]).map(btn => (
                          <button
                            key={btn.v}
                            type="button"
                            onClick={() => setPerOrderStatus(prev => ({ ...prev, [o.id]: btn.v }))}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-all ${
                              oStatus === btn.v
                                ? btn.cls + " ring-1 ring-offset-1 ring-current"
                                : "border-border/40 text-muted-foreground hover:bg-muted/20"
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                      {oStatus === "partial_received" && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <Label className="text-[10px] text-muted-foreground shrink-0">المستلم من {o.quantity}:</Label>
                          <input
                            type="number"
                            min={0}
                            max={o.quantity}
                            value={partialQtyMap[o.id] ?? ""}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === "") { setPartialQtyMap(prev => ({ ...prev, [o.id]: "" })); return; }
                              const n = parseInt(raw);
                              if (!isNaN(n) && n > o.quantity) { setPartialQtyMap(prev => ({ ...prev, [o.id]: String(o.quantity) })); return; }
                              if (!isNaN(n) && n < 0) { setPartialQtyMap(prev => ({ ...prev, [o.id]: "0" })); return; }
                              setPartialQtyMap(prev => ({ ...prev, [o.id]: raw }));
                            }}
                            className={`h-7 w-20 rounded border bg-background px-2 text-xs text-center ${
                              partialQtyMap[o.id] === "" || partialQtyMap[o.id] === undefined
                                ? "border-border text-muted-foreground"
                                : parseInt(partialQtyMap[o.id]) > 0
                                  ? "border-teal-400 text-teal-600"
                                  : "border-amber-400 text-amber-600"
                            }`}
                            placeholder="0"
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {partialQtyMap[o.id] === "" || partialQtyMap[o.id] === undefined
                              ? "اتركها 0 إذا لم يُستلم"
                              : parseInt(partialQtyMap[o.id]) > 0
                                ? "✓ سيُسجَّل كاستلام جزئي"
                                : "لم يُستلم — سيبقى عند الشحن"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* حالة الباقي من الاستلام الجزئي — تظهر فقط لما يختار "استلام جزئي" */}
            {bulkStatus === "partial_received" && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">الباقي عند شركة الشحن؟ <span className="text-destructive">*</span></p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPartialReturnReceived(false)}
                    className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-xs font-bold transition-all ${
                      partialReturnReceived === false
                        ? "border-amber-500 bg-amber-900/30 text-amber-300"
                        : "border-border text-muted-foreground hover:bg-muted/20"
                    }`}
                  >
                    <span className="text-base">🚚</span>
                    <span>مازال عند الشحن</span>
                    <span className="text-[9px] font-normal opacity-70">سيُرحَّل للبيان الجديد</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartialReturnReceived(true)}
                    className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-xs font-bold transition-all ${
                      partialReturnReceived === true
                        ? "border-emerald-500 bg-emerald-900/30 text-emerald-300"
                        : "border-border text-muted-foreground hover:bg-muted/20"
                    }`}
                  >
                    <span className="text-base">✅</span>
                    <span>تم استلامه في المخزن</span>
                    <span className="text-[9px] font-normal opacity-70">يُعاد للمخزن تلقائياً</span>
                  </button>
                </div>
                {partialReturnReceived === null && (
                  <p className="text-[10px] text-destructive font-medium">⚠ يجب اختيار حالة الباقي قبل الحفظ</p>
                )}
              </div>
            )}

            {/* القيمة المستلمة فعليًا عند التسليم — مقارنة تلقائية بإجمالي الطلبات في المجموعة */}
            {bulkStatus === "delivered" && isShipmentManifest && (() => {
              const totalVal = group.reduce((s, o) => s + Number(o.totalPrice ?? 0), 0);
              const receivedVal = bulkDeliveredValueReceived.trim() === "" || isNaN(Number(bulkDeliveredValueReceived))
                ? null
                : Number(bulkDeliveredValueReceived);
              const diff = receivedVal != null ? receivedVal - totalVal : null;
              return (
                <div className="space-y-1.5">
                  <div className="w-full sm:w-auto">
                    <Label className="text-[10px] mb-1 block text-muted-foreground">
                      القيمة المستلمة فعليًا (من إجمالي الشحنة {formatCurrency(totalVal)})
                    </Label>
                    <Input
                      type="number"
                      value={bulkDeliveredValueReceived}
                      onChange={(e) => setBulkDeliveredValueReceived(e.target.value)}
                      className="h-8 text-xs w-40 bg-background"
                      placeholder={String(totalVal)}
                    />
                  </div>
                  {diff != null && diff > 0 && (
                    <p className="text-[10px] font-semibold text-emerald-500">
                      ⬆ المندوب استلم زيادة قدرها {formatCurrency(diff)}
                    </p>
                  )}
                  {diff != null && diff < 0 && (
                    <p className="text-[10px] font-semibold text-destructive">
                      ⬇ المندوب استلم ناقص قدرها {formatCurrency(Math.abs(diff))}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* حالة استلام المرتجع — تظهر فقط لما المستخدم يختار "مرتجع" */}
            {bulkStatus === "returned" && (
              <div className="space-y-2">
                {/* سبب الإرجاع */}
                <div className="w-full sm:w-auto">
                  <Label className="text-[10px] mb-1 block text-muted-foreground">سبب الإرجاع</Label>
                  <Select value={bulkReturnReason} onValueChange={setBulkReturnReason}>
                    <SelectTrigger className="h-8 text-xs w-full sm:w-52 bg-background border-red-800/60 focus:ring-red-700">
                      <SelectValue placeholder="اختر السبب..." />
                    </SelectTrigger>
                    <SelectContent>
                      {RETURN_REASONS.map(r => (
                        <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {bulkNeedsReturnValue && (
                  <div className="w-full sm:w-auto">
                    <Label className="text-[10px] mb-1 block text-muted-foreground">القيمة المستلمة فعليًا *</Label>
                    <Input
                      type="number"
                      value={bulkReturnValueReceived}
                      onChange={(e) => setBulkReturnValueReceived(e.target.value)}
                      className="h-8 text-xs w-32 bg-background border-red-800/60 focus-visible:ring-red-700"
                      placeholder="0"
                    />
                  </div>
                )}
                {bulkNeedsReturnValue && bulkReturnValueReceived.trim() === "" && (
                  <p className="text-[10px] text-destructive font-medium">⚠ يجب إدخال القيمة المستلمة فعليًا قبل الحفظ</p>
                )}
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">هل تم استلام المرتجع؟</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setBulkReturnReceived(true)}
                    className="flex-1 relative outline-none cursor-pointer p-0 border-0 bg-transparent select-none"
                    style={{ borderRadius: 18 }}>
                    <div className="absolute inset-0 rounded-[18px] transition-all duration-150" style={{
                      background: bulkReturnReceived === true ? "linear-gradient(175deg,#043d2a 0%,#021f15 100%)" : "linear-gradient(175deg,#065c3e 0%,#033d28 100%)",
                      boxShadow: bulkReturnReceived === true ? "0 1px 0 #010f09, 0 0 0 1.5px rgba(0,180,100,0.18)" : "0 5px 0 #032918, 0 0 0 1.5px rgba(0,180,100,0.22), 0 8px 20px rgba(0,180,100,0.12)",
                    }} />
                    <div className="relative z-10 flex flex-col items-center gap-1 px-3 pt-4 pb-3.5 rounded-[18px] overflow-hidden transition-all duration-150" style={{
                      background: bulkReturnReceived === true ? "linear-gradient(155deg,#0d8f62 0%,#09714c 55%,#065539 100%)" : "linear-gradient(155deg,#12c482 0%,#0daa6e 55%,#098f5b 100%)",
                      border: bulkReturnReceived === true ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.14)",
                      boxShadow: bulkReturnReceived === true ? "inset 0 -4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)" : "inset 0 -4px 8px rgba(0,0,0,0.18), inset 0 2px 0 rgba(255,255,255,0.28)",
                      transform: bulkReturnReceived === true ? "translateY(4px)" : "translateY(0)",
                    }}>
                      <div className="absolute left-1/2 -translate-x-1/2 w-14 h-5 rounded-full" style={{ background: "radial-gradient(ellipse,rgba(180,255,220,0.38) 0%,transparent 75%)", top: 6 }} />
                      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-0.5" style={{ background: bulkReturnReceived === true ? "radial-gradient(circle,rgba(0,0,0,0.25) 0%,rgba(0,0,0,0.35) 100%)" : "radial-gradient(circle,rgba(0,0,0,0.12) 0%,rgba(0,0,0,0.22) 100%)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3), 0 0 12px rgba(20,220,140,0.3)" }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c6f6d5" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgba(134,239,172,0.85))" }}>
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      </div>
                      <span className="text-[12.5px] font-black leading-tight tracking-tight" style={{ color: bulkReturnReceived === true ? "#a7f3d0" : "#d1fae5", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>تم استلام المرتجع</span>
                      <span className="text-[9.5px] font-medium leading-tight" style={{ color: bulkReturnReceived === true ? "rgba(167,243,208,0.65)" : "rgba(209,250,229,0.7)" }}>يُعاد للمخزن تلقائياً</span>
                    </div>
                  </button>
                  <button type="button" onClick={() => setBulkReturnReceived(false)}
                    className="flex-1 relative outline-none cursor-pointer p-0 border-0 bg-transparent select-none"
                    style={{ borderRadius: 18 }}>
                    <div className="absolute inset-0 rounded-[18px] transition-all duration-150" style={{
                      background: bulkReturnReceived === false ? "linear-gradient(175deg,#4a2204 0%,#2e1502 100%)" : "linear-gradient(175deg,#7c3d08 0%,#4f2804 100%)",
                      boxShadow: bulkReturnReceived === false ? "0 1px 0 #180900, 0 0 0 1.5px rgba(200,130,20,0.2)" : "0 5px 0 #3e1d03, 0 0 0 1.5px rgba(200,140,30,0.25), 0 8px 20px rgba(200,140,30,0.12)",
                    }} />
                    <div className="relative z-10 flex flex-col items-center gap-1 px-3 pt-4 pb-3.5 rounded-[18px] overflow-hidden transition-all duration-150" style={{
                      background: bulkReturnReceived === false ? "linear-gradient(155deg,#b8860b 0%,#996b08 55%,#7a5406 100%)" : "linear-gradient(155deg,#e8a820 0%,#c98e14 55%,#a87010 100%)",
                      border: bulkReturnReceived === false ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(255,255,255,0.15)",
                      boxShadow: bulkReturnReceived === false ? "inset 0 -4px 8px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 -4px 8px rgba(0,0,0,0.18), inset 0 2px 0 rgba(255,255,255,0.30)",
                      transform: bulkReturnReceived === false ? "translateY(4px)" : "translateY(0)",
                    }}>
                      <div className="absolute left-1/2 -translate-x-1/2 w-14 h-5 rounded-full" style={{ background: "radial-gradient(ellipse,rgba(255,240,160,0.38) 0%,transparent 75%)", top: 6 }} />
                      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-0.5" style={{ background: bulkReturnReceived === false ? "radial-gradient(circle,rgba(0,0,0,0.28) 0%,rgba(0,0,0,0.38) 100%)" : "radial-gradient(circle,rgba(0,0,0,0.12) 0%,rgba(0,0,0,0.22) 100%)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.32), 0 0 12px rgba(220,170,20,0.3)" }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fef3c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgba(253,230,138,0.85))" }}>
                          <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/>
                          <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                        </svg>
                      </div>
                      <span className="text-[12.5px] font-black leading-tight tracking-tight" style={{ color: bulkReturnReceived === false ? "#fde68a" : "#fff8e1", textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}>مازال في الشحن</span>
                      <span className="text-[9.5px] font-medium leading-tight" style={{ color: bulkReturnReceived === false ? "rgba(253,230,138,0.65)" : "rgba(255,248,225,0.72)" }}>لن يؤثر على المخزن</span>
                    </div>
                  </button>
                </div>
                <p className="text-[10px] text-center font-medium" style={{ color: bulkReturnReceived === true ? "#0F6E56" : bulkReturnReceived === false ? "#854F0B" : "var(--color-text-secondary)" }}>
                  {bulkReturnReceived === true && "✓ سيتم إرجاع البضاعة للمخزن تلقائياً"}
                  {bulkReturnReceived === false && "⏳ مرتجع مازال في شركة الشحن — لن يؤثر على المخزن"}
                  {bulkReturnReceived === null && "⚠ يجب اختيار حالة استلام المرتجع قبل الحفظ"}
                </p>
              </div>
            )}

            <div>
              <Label className="text-[10px] mb-1 block text-muted-foreground">
                {needsBulkNote ? "سبب / ملاحظة (مطلوب)" : "ملاحظة (اختياري)"}
              </Label>
              <Input
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                className="h-8 text-xs bg-background"
                placeholder={
                  bulkStatus === "postponed" ? "مثال: العميل طلب التأجيل..."
                  : bulkStatus === "returned" ? "مثال: العميل رفض الاستلام..."
                  : "ملاحظة (اختياري)..."
                }
              />
            </div>
            <div className="flex gap-2 justify-between items-center">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                onClick={() => setConfirmCancel(true)}
                disabled={cancelGroupMutation.isPending}
              >
                <Trash2 className="w-3 h-3" />
                إلغاء من البيان
              </Button>
              <Button
                size="sm"
                className="h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
                onClick={() => bulkMutation.mutate()}
                disabled={
                  bulkMutation.isPending ||
                  (needsBulkNote && !bulkNote.trim()) ||
                  (bulkStatus === "returned" && bulkReturnReceived === null) ||
                  (bulkNeedsReturnValue && bulkReturnValueReceived.trim() === "") ||
                  (bulkStatus === "partial_received" && partialReturnReceived === null) ||
                  (!isPerItemMode && (bulkStatus === "partial_received" || bulkStatus === "partial_delivered") && group[0] && (
                    partialQtyMap[group[0].id] === "" || partialQtyMap[group[0].id] === undefined
                  )) ||
                  (isMulti && (bulkStatus === "partial_received" || bulkStatus === "partial_delivered") && !group.some(o => {
                    const val = partialQtyMap[o.id];
                    return val !== "" && val !== undefined && val !== null && parseInt(val) > 0;
                  })) ||
                  (isPerItemMode && bulkStatus !== "partial_received" && group.some(o =>
                    perOrderStatus[o.id] === "partial_received" &&
                    (partialQtyMap[o.id] === "" || partialQtyMap[o.id] === undefined)
                  ))
                }
              >
                <Save className="w-3 h-3" />
                {bulkMutation.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
            <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>إلغاء الفاتورة من البيان</AlertDialogTitle>
                  <AlertDialogDescription>
                    هل أنت متأكد من إلغاء فاتورة <strong>{rep.customerName}</strong> ({group.length > 1 ? `${group.length} منتجات` : rep.product}) من البيان؟
                    <br />سيتم إرجاع جميع طلبياتها لحالة &quot;انتظار&quot; وإلغاء تأثيرها على المخزون.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>لا، تراجع</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => { setConfirmCancel(false); cancelGroupMutation.mutate(); }}
                  >
                    نعم، إلغاء الفاتورة
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

    </>
  );
}

function InvoicePriceEditor({
  manifestId,
  current,
  currentNotes,
  isShipmentManifest = false,
  onSaved,
}: {
  manifestId: number;
  current: number | null;
  currentNotes: string | null;
  isShipmentManifest?: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(current?.toString() ?? "");
  const [notes, setNotes] = useState(currentNotes ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      isShipmentManifest
        ? shipmentManifestsApi.update(manifestId, {
            invoicePrice: price ? parseFloat(price) : null,
            notes: notes.trim() || null,
          })
        : manifestsApi.update(manifestId, {
            invoicePrice: price ? parseFloat(price) : null,
            invoiceNotes: notes.trim() || null,
          }),
    onSuccess: () => {
      toast({ title: "تم حفظ سعر الفاتورة" });
      setEditing(false);
      onSaved();
    },
    onError: (e: any) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
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
            <span className="text-sm text-muted-foreground">لم يُحدَّد بعد</span>
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
          <Edit2 className="w-3 h-3" />تعديل
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
        <span className="text-xs text-muted-foreground">ج.م</span>
        <Button
          size="sm"
          className="h-7 text-xs gap-1 bg-primary text-primary-foreground"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          <Check className="w-3 h-3" />حفظ
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
        placeholder="ملاحظات الفاتورة (اختياري)..."
      />
    </div>
  );
}

function SettlementCard({ manifest, onSaved, isShipmentManifest = false }: { manifest: ShippingManifestDetail; onSaved: () => void; isShipmentManifest?: boolean }) {
  const { toast } = useToast();
  const s = manifest.stats;
  const invoicePrice = manifest.invoicePrice != null ? Number(manifest.invoicePrice) : 0;
  const [netProfitOpen, setNetProfitOpen] = useState(false);
  const [netDueOpen, setNetDueOpen] = useState(false);

  // تكلفة الشحن الفعلية = رسوم الشحن المحصَّلة فعليًا من الباك إند (مسلَّم / مسلَّم جزئي مستلم / مرتجع دفع الشحن فقط)
  // pending/delayed وأي حالة تانية = صفر تلقائيًا لأنها مش داخلة في الحساب أصلًا
  const effectiveShippingCost = Number((s as any).deliveredShippingFees ?? 0);

  // سعر المنطقة = سعر أول منطقة مرتبطة بشركة الشحن (من قسم المناطق والأسعار)
  const { data: settlementZones = [] } = useQuery<{ id: number; price: number }[]>({
    queryKey: ["shipment-zones"],
    queryFn: () => apiFetch("/shipments/zones"),
  });
  const zonePriceValue = (() => {
    const companyAny = (manifest as any).company;
    let zIds: number[] = [];
    if (companyAny?.zoneIds) {
      try { zIds = JSON.parse(companyAny.zoneIds); } catch {}
    } else if (companyAny?.zoneId) {
      zIds = [companyAny.zoneId];
    }
    if (!zIds.length) return 0;
    const zone = settlementZones.find(z => z.id === zIds[0]);
    return zone?.price != null ? Number(zone.price) : 0;
  })();

  const deliveredTotal = s.deliveredGross;
  // صافي الربح الحقيقي = سعر المنطقة (من شركة الشحن) − تكلفة الشحن الثابتة
  const netProfit = zonePriceValue - effectiveShippingCost;
  const netBeforeInvoice = deliveredTotal - effectiveShippingCost;
  const balance = invoicePrice > 0 ? invoicePrice - netBeforeInvoice : null;

  // (تم إلغاء الإدخال اليدوي لتكلفة الشحن — تُحسب تلقائيًا الآن أعلاه)

  return (
    <Card className="border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-primary" />
        <h2 className="font-bold text-sm">بيان التسوية — الحساب مع شركة الشحن</h2>
        {manifest.status === "closed" && (
          <Badge variant="outline" className="text-[9px] border-emerald-500 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 mr-auto">
            مُغلق
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-card rounded-md p-3 border border-border">
          <p className="text-[10px] text-muted-foreground mb-1">إجمالي المسلَّم</p>
          <p className="text-base font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(deliveredTotal)}</p>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-600">{s.delivered} طلبية</p>
        </div>
        <div className={`bg-card rounded-md p-3 border ${effectiveShippingCost === 0 ? "border-dashed border-amber-500/40" : "border-border"}`}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-muted-foreground">رسوم الشحن</p>
          </div>
          <p className="text-base font-black text-amber-700 dark:text-amber-400">
            {formatCurrency(effectiveShippingCost)}
          </p>
          {effectiveShippingCost === 0 ? (
            <p className="text-[10px] text-muted-foreground/60">لم تُحدَّد تكلفة شحن للشركة</p>
          ) : (
            <p className="text-[10px] text-amber-600">مُخصومة</p>
          )}
        </div>
        <div className="bg-card rounded-md p-3 border border-border">
          <p className="text-[10px] text-muted-foreground mb-1">صافي المستحق من الشركة</p>
          <p className="text-base font-black text-primary">{formatCurrency(netBeforeInvoice)}</p>
          <p className="text-[10px] text-muted-foreground">إيرادات − شحن</p>
        </div>
        <div className={`rounded-md p-3 border ${manifest.invoicePrice != null ? "bg-card border-border" : "bg-muted/20 border-dashed border-border"}`}>
          <p className="text-[10px] text-muted-foreground mb-1">سعر الفاتورة المتفق</p>
          {manifest.invoicePrice != null ? (
            <>
              <p className="text-base font-black">{formatCurrency(manifest.invoicePrice)}</p>
              <p className="text-[10px] text-muted-foreground">المبلغ المتفق</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground/50">غير محدد</p>
          )}
        </div>
      </div>

      {/* صافي الربح الحقيقي = سعر المنطقة (من شركة الشحن) − تكلفة الشحن الثابتة */}
      <div className={`rounded-md border overflow-hidden transition-all duration-300 ${netProfit >= 0 ? "border-emerald-700/40 bg-emerald-900/10" : "border-red-700/40 bg-red-900/10"}`}>
        <button
          type="button"
          onClick={() => setNetProfitOpen(v => !v)}
          className="w-full flex items-center justify-between p-4 text-right"
        >
          <p className="text-[10px] font-bold text-muted-foreground mb-0">صافي الربح الحقيقي</p>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${netProfitOpen ? "rotate-180" : ""}`} />
        </button>
        <div className={`grid transition-all duration-300 ease-in-out ${netProfitOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            <div className="flex items-center justify-between px-4 pb-1">
              <p className={`text-2xl font-black ${netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatCurrency(netProfit)}
              </p>
              {netProfit >= 0
                ? <TrendingUp className="w-10 h-10 text-emerald-500 opacity-20" />
                : <TrendingDown className="w-10 h-10 text-red-500 opacity-20" />}
            </div>
            <p className="text-[10px] text-muted-foreground px-4 pb-4">
              {formatCurrency(zonePriceValue)} سعر المنطقة
              &nbsp;−&nbsp;{formatCurrency(effectiveShippingCost)} شحن
            </p>
          </div>
        </div>
      </div>

      {/* Balance */}
      {balance !== null && (
        <div className={`rounded-md p-3 border flex items-center justify-between ${balance >= 0 ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/10" : "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/10"}`}>
          <div>
            <p className={`text-xs font-bold mb-0.5 ${balance >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
              {balance >= 0 ? "✓ فرق لصالحنا" : "⚠ فرق على حسابنا"}
            </p>
            <p className={`text-xl font-black ${balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {formatCurrency(Math.abs(balance))}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              الفاتورة ({formatCurrency(invoicePrice)}) {balance >= 0 ? "أعلى" : "أقل"} من الصافي ({formatCurrency(netBeforeInvoice)})
            </p>
          </div>
          {balance >= 0
            ? <TrendingUp className="w-10 h-10 text-emerald-500 dark:text-emerald-400 opacity-20" />
            : <AlertTriangle className="w-10 h-10 text-red-500 dark:text-red-400 opacity-20" />}
        </div>
      )}

      {manifest.invoiceNotes && (
        <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3">
          ملاحظات الفاتورة: {manifest.invoiceNotes}
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
  const [netDueOpen, setNetDueOpen] = useState(false);

  // احسب الإحصائيات على مستوى الفواتير (مش الطلبات الفردية)
  const invoiceStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    const priority: Record<string, number> = {
      returned: 5, postponed: 4, delayed: 4,
      partial_received: 3, partial_delivered: 3,
      pending: 2, delivered: 1,
    };
    for (const o of manifest.orders) {
      const key = (o as any).invoiceNumber?.trim() || `solo-${o.id}`;
      const existing = map.get(key);
      const existingP = existing ? (priority[existing] ?? 0) : 0;
      const newP = priority[o.deliveryStatus] ?? 0;
      if (newP > existingP) map.set(key, o.deliveryStatus);
    }
    return map;
  }, [manifest.orders]);

  const invoiceCounts = useMemo(() => {
    let pending = 0, postponed = 0, returned = 0, partial = 0, delivered = 0;
    for (const status of invoiceStatusMap.values()) {
      if (status === "pending") pending++;
      else if (status === "postponed" || status === "delayed") postponed++;
      else if (status === "returned") returned++;
      else if (status === "partial_received" || status === "partial_delivered") partial++;
      else if (status === "delivered") delivered++;
    }
    return { pending, postponed, returned, partial, delivered };
  }, [invoiceStatusMap]);

  const pendingCount = invoiceCounts.pending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            إغلاق البيان {manifest.manifestNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {pendingCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                يوجد <strong>{pendingCount}</strong> طلبية لم يُحدَّد وضعها بعد. هل تريد الإغلاق رغم ذلك؟
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-md bg-muted/20 border border-border">
              <p className="text-muted-foreground">إجمالي الطلبيات</p>
              <p className="font-bold text-base">{s.total}</p>
            </div>
            <div className="p-2 rounded-md bg-emerald-900/10 border border-emerald-700">
              <p className="text-emerald-400">مسلَّم</p>
              <p className="font-bold text-base text-emerald-400">{s.delivered}</p>
            </div>
            <div className="p-2 rounded-md bg-orange-900/10 border border-orange-700">
              <p className="text-orange-400">مؤجل</p>
              <p className="font-bold text-base text-orange-400">
                {invoiceCounts.postponed}
              </p>
            </div>
            <div className="p-2 rounded-md bg-red-900/10 border border-red-700">
              <p className="text-red-400">مرتجع</p>
              <p className="font-bold text-base text-red-400">{s.returned}</p>
              {(() => {
                const atShipping = manifest.orders.filter(o => o.deliveryStatus === "returned" && (o as any).returnReceived === 0).length;
                const atWarehouse = manifest.orders.filter(o => o.deliveryStatus === "returned" && (o as any).returnReceived === 1).length;
                return (
                  <>
                    {atShipping > 0 && <p className="text-[9px] text-orange-400">🚚 عند الشحن: {atShipping}</p>}
                    {atWarehouse > 0 && <p className="text-[9px] text-emerald-400">↩ في المخزن: {atWarehouse}</p>}
                  </>
                );
              })()}
            </div>
            <div className="p-2 rounded-md bg-teal-900/10 border border-teal-700">
              <p className="text-teal-400">استلم جزئي</p>
              <p className="font-bold text-base text-teal-400">
                {invoiceCounts.partial}
              </p>
              {(() => {
                const partialOrders = manifest.orders.filter(o =>
                  o.deliveryStatus === "partial_received" || o.deliveryStatus === "partial_delivered"
                );
                const totalPartialReturned = partialOrders.reduce((sum, o) => {
                  const delivered = o.partialQuantity ?? 0;
                  const remaining = o.quantity - delivered;
                  return sum + (remaining > 0 ? remaining : 0);
                }, 0);
                const atShipping = partialOrders.filter(o => (o as any).returnReceived !== 1).length;
                const atWarehouse = partialOrders.filter(o => (o as any).returnReceived === 1).length;
                return (
                  <>
                    {totalPartialReturned > 0 && (
                      <p className="text-[9px] text-red-400 mt-0.5 font-semibold">↩ مرتجع جزئي: {totalPartialReturned} قطعة</p>
                    )}
                    {atShipping > 0 && <p className="text-[9px] text-orange-400">🚚 باقي عند الشحن: {atShipping}</p>}
                    {atWarehouse > 0 && <p className="text-[9px] text-emerald-400">↩ باقي في المخزن: {atWarehouse}</p>}
                  </>
                );
              })()}
            </div>
          </div>

          {/* ─── صافي المستحق من الشركة ─── */}
          <div className="space-y-2">
            <div className="rounded-md bg-primary/10 border border-primary/30 overflow-hidden transition-all duration-300">
              <button
                type="button"
                onClick={() => setNetDueOpen(v => !v)}
                className="w-full flex items-center justify-between p-3 text-right text-xs"
              >
                <p className="text-muted-foreground mb-0">صافي المستحق من الشركة</p>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${netDueOpen ? "rotate-180" : ""}`} />
              </button>
              <div className={`grid transition-all duration-300 ease-in-out ${netDueOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden px-3 pb-3 text-xs">
                  {(() => {
                    const effectiveShipping = (manifest as any)?.company?.shippingCost != null ? Number((manifest as any).company.shippingCost) : 0;
                    const due = (s?.deliveredGross ?? 0) - effectiveShipping;
                    return (
                      <>
                        <p className="font-black text-lg text-primary">
                          {formatCurrency(due)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          إيرادات مستلمة ({formatCurrency(s?.deliveredGross ?? 0)}) − تكلفة شحن ({formatCurrency(effectiveShipping)})
                        </p>
                      </>
                    );
                  })()}
                  {manifest.invoicePrice != null && (
                    <p className="text-muted-foreground mt-1">
                      سعر الفاتورة المتفق: {formatCurrency(manifest.invoicePrice)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {(s as any).stillAtShippingCount > 0 && (
              <div className="p-2 rounded-md bg-orange-900/10 border border-orange-700 text-xs flex items-start gap-2">
                <span className="text-base">🚚</span>
                <div className="space-y-0.5">
                  <p className="text-orange-400 font-bold">لسه عند الشحن: {(s as any).stillAtShippingCount} طلبية</p>
                  {(s as any).stillAtShippingAmount > 0 && (
                    <p className="text-orange-300 text-[10px]">
                      💰 مبلغ متوقع (مؤجل فقط): {formatCurrency((s as any).stillAtShippingAmount ?? 0)}
                    </p>
                  )}
                </div>
              </div>
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
            {loading ? "جاري الإغلاق..." : "تأكيد الإغلاق"}
          </Button>
          <Button variant="outline" className="border-border" onClick={onClose}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status sort priority — ترتيب أبجدي عربي ────────────────────────────────
// أ→ي: استلم جزئي(0) ← مرتجع(1) ← مسلَّم(2) ← مؤجل(3) ← قيد الانتظار(4)
const STATUS_SORT_PRIORITY: Record<string, number> = {
  partial_received: 0, // استلم جزئي
  returned:         1, // مرتجع
  delivered:        2, // مسلَّم
  postponed:        3, // مؤجل
  pending:          4, // قيد الانتظار
};

// ─── Status label helper ──────────────────────────────────────────────────────
const STATUS_LABEL_AR: Record<string, string> = {
  delivered:          "مسلَّم",
  returned:           "مرتجع",
  postponed:          "مؤجل",
  delayed:            "مؤجل",
  partial_received:   "استلم جزئي",
  partial_delivered:  "مسلَّم جزئي",
  pending:            "قيد الانتظار",
};

function getManifestGroupKey(order: ManifestOrder) {
  return (order as any).invoiceNumber?.trim() || `${order.customerName}__${order.phone ?? ""}__${order.address ?? ""}`;
}

function groupManifestOrders(orders: ManifestOrder[]) {
  const groupMap = new Map<string, ManifestOrder[]>();
  orders.forEach((order) => {
    const key = getManifestGroupKey(order);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(order);
  });
  return Array.from(groupMap.values());
}

// ─── Export Dialog (Excel + PDF) ──────────────────────────────────────────────
function ExportDialog({
  manifest,
  onClose,
}: {
  manifest: ShippingManifestDetail;
  onClose: () => void;
}) {
  const s = manifest.stats;
  const effectiveShipping = (manifest as any)?.company?.shippingCost != null ? Number((manifest as any).company.shippingCost) : 0;
  const { brand } = useBrand();
  const groupedManifestOrders = groupManifestOrders(manifest.orders ?? []);
  const manifestGroupPriority: Record<string, number> = {
    returned: 5,
    postponed: 4,
    delayed: 4,
    partial_received: 3,
    partial_delivered: 3,
    pending: 2,
    delivered: 1,
  };
  const groupManifestStatus = (group: ManifestOrder[]) =>
    group.reduce(
      (worst, order) =>
        (manifestGroupPriority[order.deliveryStatus] ?? 0) >
        (manifestGroupPriority[worst] ?? 0)
          ? order.deliveryStatus
          : worst,
      group[0]?.deliveryStatus ?? "pending"
    );
  const groupedPostponedCount = groupedManifestOrders.filter(
    (group) => groupManifestStatus(group) === "postponed"
  ).length;
  const groupedPartialCount = groupedManifestOrders.filter(
    (group) => ["partial_received", "partial_delivered"].includes(groupManifestStatus(group))
  ).length;
  const groupedPendingCount = groupedManifestOrders.filter(
    (group) => groupManifestStatus(group) === "pending"
  ).length;

  const safeOrders = manifest.orders ?? [];

  const deliveredGross = safeOrders
    .filter(o => o.deliveryStatus === "delivered")
    .reduce((sum, o) => sum + Number(o.totalPrice ?? 0), 0);
  const partialGross = safeOrders
    .filter(o => o.deliveryStatus === "partial_received" || o.deliveryStatus === "partial_delivered")
    .reduce((sum, o) => {
      const returnReceived = (o as any).returnReceived == null ? null : Number((o as any).returnReceived);
      if (returnReceived == null) return sum;
      if (o.partialQuantity == null) return sum;
      // partial_delivered (بيان شحن): القيمة الفعلية متسجّلة مباشرة في partialQuantity
      if (o.deliveryStatus === "partial_delivered") {
        return sum + Number(o.partialQuantity);
      }
      if (o.quantity <= 0) return sum;
      const unitPrice = (o as any).unitPrice != null
        ? Number((o as any).unitPrice)
        : Number(o.totalPrice) / Number(o.quantity);
      return sum + Math.round(unitPrice * Number(o.partialQuantity));
    }, 0);
  const totalCollected = deliveredGross + partialGross;
  const netDue = totalCollected - effectiveShipping;

  // ── Excel Export — styled workbook with RTL layout ────────────────────────
  const exportExcel = async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CAPRINA";
    workbook.created = new Date();
    workbook.modified = new Date();

    const brandName = brand.name || "CAPRINA";
    const brandTagline = brand.tagline || "";
    const manifestDate = format(new Date(manifest.createdAt), "yyyy/MM/dd");
    const printDate = format(new Date(), "yyyy/MM/dd HH:mm");
    const groupedOrders = groupManifestOrders(manifest.orders ?? []);
    const fmtMoney = (n: number) => `${Number(n ?? 0).toLocaleString("ar-EG")} ج.م`;

    const C = {
      bg: "FF0F172A",
      panel: "FF1E293B",
      gold: "FFF59E0B",
      white: "FFFFFFFF",
      offWhite: "FFF8FAFC",
      slate: "FF64748B",
      darkText: "FF0F172A",
      green: "FF15803D",
      greenBg: "FFD1FAE5",
      red: "FFDC2626",
      redBg: "FFFEE2E2",
      amber: "FFD97706",
      amberBg: "FFFEF3C7",
      teal: "FF0F766E",
      tealBg: "FFCCFBF1",
      gray: "FF64748B",
      grayBg: "FFF1F5F9",
      blue: "FF1D4ED8",
    };

    const makeFill = (argb: string) => ({
      type: "pattern" as const,
      pattern: "solid" as const,
      fgColor: { argb },
    });
    const makeBorder = (argb = "FFCBD5E1") => {
      const side = { style: "thin" as const, color: { argb } };
      return { top: side, bottom: side, left: side, right: side };
    };
    const groupPriority: Record<string, number> = {
      returned: 5,
      postponed: 4,
      delayed: 4,
      partial_received: 3,
      partial_delivered: 3,
      pending: 2,
      delivered: 1,
    };
    const groupStatus = (group: ManifestOrder[]) =>
      group.reduce((worst, order) =>
        (groupPriority[order.deliveryStatus] ?? 0) > (groupPriority[worst] ?? 0)
          ? order.deliveryStatus
          : worst,
      group[0]?.deliveryStatus ?? "pending");
    const groupedTotal = groupedOrders.length;
    const groupedDelivered = groupedOrders.filter((group) => groupStatus(group) === "delivered").length;
    const groupedReturned = groupedOrders.filter((group) => groupStatus(group) === "returned").length;
    const groupedPartial = groupedOrders.filter((group) => ["partial_received", "partial_delivered"].includes(groupStatus(group))).length;
    const groupedPostponed = groupedOrders.filter((group) => groupStatus(group) === "postponed").length;
    const groupedPending = groupedOrders.filter((group) => groupStatus(group) === "pending").length;
    const groupedCompleted = groupedDelivered;
    const groupedDeliveryRate = groupedTotal > 0 ? Math.round((groupedDelivered / groupedTotal) * 100) : 0;
    const setCell = (cell: any, value: unknown, options?: {
      fill?: string;
      font?: Record<string, any>;
      align?: Record<string, any>;
      border?: string;
      numFmt?: string;
    }) => {
      cell.value = value as any;
      if (options?.fill) cell.fill = makeFill(options.fill);
      if (options?.font) cell.font = { name: "Tahoma", size: 10, ...options.font };
      if (options?.align) cell.alignment = options.align;
      if (options?.border) cell.border = makeBorder(options.border);
      if (options?.numFmt) cell.numFmt = options.numFmt;
    };

    // ── Sheet 1: Main manifest ───────────────────────────────────────────────
    const ws1 = workbook.addWorksheet("الطلبيات", { views: [{ state: "frozen", ySplit: 5, rightToLeft: true }] });
    ws1.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws1.pageMargins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.35, header: 0.15, footer: 0.15 };
    ws1.columns = [
      { key: "idx",        width: 6  },
      { key: "sender",     width: 18 },
      { key: "customer",   width: 20 },
      { key: "phone",      width: 14 },
      { key: "gov",        width: 14 },
      { key: "address",    width: 30 },
      { key: "cod",        width: 14 },
      { key: "received",   width: 14 },
      { key: "courier",    width: 14 },
      { key: "status",     width: 14 },
      { key: "note",       width: 24 },
      { key: "invoice",    width: 16 },
    ];

    ws1.mergeCells("A1:L1");
    setCell(ws1.getCell("A1"), `${brandName}${brandTagline ? `  ·  ${brandTagline}` : ""}`, {
      fill: C.bg,
      font: { bold: true, size: 16, color: { argb: C.gold } },
      align: { horizontal: "center", vertical: "middle" },
      border: C.bg,
    });
    ws1.getRow(1).height = 28;

    ws1.mergeCells("A2:L2");
    setCell(ws1.getCell("A2"), `بيان الشحن — ${manifest.manifestNumber}   |   ${manifest.companyName}   |   ${manifestDate}`, {
      fill: C.bg,
      font: { bold: true, size: 12, color: { argb: C.gold } },
      align: { horizontal: "center", vertical: "middle" },
      border: C.bg,
    });
    ws1.getRow(2).height = 24;

    ws1.mergeCells("A3:L3");
    setCell(ws1.getCell("A3"), `طُبع: ${printDate}   |   إجمالي المسلَّم: ${groupedCompleted} من ${groupedTotal}   |   نسبة التسليم: ${groupedDeliveryRate}%`, {
      fill: C.panel,
      font: { size: 10, color: { argb: "FF6B7280" } },
      align: { horizontal: "center", vertical: "middle" },
      border: "FF334155",
    });
    ws1.getRow(3).height = 22;

    ws1.mergeCells("A4:L4");
    setCell(ws1.getCell("A4"), "", { fill: C.bg, border: C.bg });
    ws1.getRow(4).height = 8;

    const headers = ["#", "اسم الراسل", "اسم العميل", "رقم تليفون العميل", "المحافظة", "العنوان", "اجمالى سعر الشحنة", "القيمة المستلمة", "تكلفة الشحن", "حالة الاوردر", "ملاحظات", "رقم الشحنة"];
    const headerRow = ws1.getRow(5);
    headerRow.values = headers;
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      setCell(cell, cell.value, {
        fill: C.panel,
        font: { bold: true, color: { argb: C.white }, size: 10 },
        align: { horizontal: "center", vertical: "middle", wrapText: true },
        border: "FF334155",
      });
    });

    groupedOrders.forEach((group, idx) => {
      const rep = group[0];
      const invoiceNum = (rep as any).invoiceNumber?.trim() || `S-${rep.id}`;
      const cod = group.reduce((sum, order) => sum + order.totalPrice, 0);
      const courierCost = rawManifest?.company?.shippingCost != null ? Number(rawManifest.company.shippingCost) : null;
      const statuses = [...new Set(group.map((order) => order.deliveryStatus))];
      const deliveryStatus = statuses.length === 1 ? statuses[0] : "pending";
      const deliveryLabel = statuses.length === 1
        ? (STATUS_LABEL_AR[statuses[0]] ?? statuses[0])
        : "حالات متعددة";
      const notes = [...new Set(group.map((order) => order.deliveryNote).filter(Boolean))].join(" | ");
      const baseFill = idx % 2 === 0 ? C.white : C.offWhite;
      const baseFont = { color: { argb: C.darkText } };

      const row = ws1.getRow(idx + 6);
      row.height = 32;
      // 1: #
      setCell(row.getCell(1), idx + 1, {
        fill: baseFill,
        font: { bold: true, color: { argb: C.darkText } },
        align: { horizontal: "center", vertical: "middle" },
        border: "FFD1D5DB",
      });
      // 2: اسم الراسل
      setCell(row.getCell(2), (rep as any).senderName ?? "—", {
        fill: baseFill,
        font: { bold: true, color: { argb: C.blue } },
        align: { horizontal: "center", vertical: "middle" },
        border: "FFD1D5DB",
      });
      // 3: اسم العميل
      setCell(row.getCell(3), rep.customerName, {
        fill: baseFill,
        font: { bold: true, color: { argb: C.darkText } },
        align: { horizontal: "right", vertical: "middle" },
        border: "FFD1D5DB",
      });
      // 4: رقم تليفون العميل
      setCell(row.getCell(4), rep.phone ?? "—", {
        fill: baseFill,
        font: baseFont,
        align: { horizontal: "center", vertical: "middle" },
        border: "FFD1D5DB",
      });
      // 5: المحافظة
      setCell(row.getCell(5), rep.city ?? "—", {
        fill: baseFill,
        font: baseFont,
        align: { horizontal: "center", vertical: "middle" },
        border: "FFD1D5DB",
      });
      // 6: العنوان
      setCell(row.getCell(6), (rep as any).address ?? "—", {
        fill: baseFill,
        font: { size: 9, color: { argb: C.darkText } },
        align: { horizontal: "right", vertical: "middle", wrapText: true },
        border: "FFD1D5DB",
      });
      // 7: اجمالى سعر الشحنة (COD)
      setCell(row.getCell(7), cod, {
        fill: baseFill,
        font: { bold: true, color: { argb: C.green } },
        align: { horizontal: "center", vertical: "middle" },
        border: "FFD1D5DB",
        numFmt: '#,##0 "ج.م"',
      });
      // 8: القيمة المستلمة (= سعر الشحنة)
      setCell(row.getCell(8), cod, {
        fill: baseFill,
        font: { bold: true, color: { argb: C.green } },
        align: { horizontal: "center", vertical: "middle" },
        border: "FFD1D5DB",
        numFmt: '#,##0 "ج.م"',
      });
      // 9: تكلفة الشحن (المندوب)
      setCell(row.getCell(9), courierCost != null && courierCost > 0 ? courierCost : "—", {
        fill: baseFill,
        font: { color: { argb: C.amber } },
        align: { horizontal: "center", vertical: "middle" },
        border: "FFD1D5DB",
        numFmt: courierCost != null && courierCost > 0 ? '#,##0 "ج.م"' : undefined,
      });
      // 10: حالة الاوردر
      setCell(row.getCell(10), deliveryLabel, {
        fill: deliveryStatus === "delivered" ? C.greenBg : deliveryStatus === "returned" ? C.redBg : deliveryStatus === "partial_received" ? C.tealBg : deliveryStatus === "postponed" ? C.amberBg : C.grayBg,
        font: { bold: true, color: { argb: deliveryStatus === "delivered" ? C.green : deliveryStatus === "returned" ? C.red : deliveryStatus === "partial_received" ? C.teal : deliveryStatus === "postponed" ? C.amber : C.gray } },
        align: { horizontal: "center", vertical: "middle" },
        border: deliveryStatus === "delivered" ? C.green : deliveryStatus === "returned" ? C.red : deliveryStatus === "partial_received" ? C.teal : deliveryStatus === "postponed" ? C.amber : "FFCBD5E1",
      });
      // 11: ملاحظات
      setCell(row.getCell(11), notes || "", {
        fill: baseFill,
        font: baseFont,
        align: { horizontal: "right", vertical: "middle", wrapText: true },
        border: "FFD1D5DB",
      });
      // 12: رقم الشحنة
      setCell(row.getCell(12), invoiceNum, {
        fill: baseFill,
        font: { color: { argb: C.gray } },
        align: { horizontal: "center", vertical: "middle" },
        border: "FFD1D5DB",
      });
    });

    const totalRowIndex = groupedOrders.length + 6;
    const totalSummaryRows = [
      { row: totalRowIndex, label: "الإجمالي", value: totalCollected, note: `${groupedDeliveryRate}% نسبة تسليم`, fill: C.green },
      { row: totalRowIndex + 1, label: "خصم الشحن", value: effectiveShipping, note: "", fill: C.green },
      { row: totalRowIndex + 2, label: "الصافي المستحق", value: netDue, note: "", fill: C.green },
    ];
    for (const item of totalSummaryRows) {
      setCell(ws1.getCell(`A${item.row}`), item.label, {
        fill: C.grayBg,
        font: { bold: true, color: { argb: C.gold }, size: 11 },
        align: { horizontal: "right", vertical: "middle", wrapText: false, shrinkToFit: true },
        border: "FFF59E0B",
      });
      setCell(ws1.getCell(`B${item.row}`), item.value, {
        fill: item.fill,
        font: { bold: true, color: { argb: C.white }, size: 11 },
        align: { horizontal: "center", vertical: "middle", wrapText: false, shrinkToFit: true },
        border: C.green,
        numFmt: '#,##0 "ج.م"',
      });
      setCell(ws1.getCell(`C${item.row}`), item.note, {
        fill: C.grayBg,
        font: { bold: true, color: { argb: C.gold }, size: 11 },
        align: { horizontal: "center", vertical: "middle", wrapText: false, shrinkToFit: true },
        border: "FFF59E0B",
      });
      for (const col of ["D", "E", "F", "G", "H", "I", "J", "K", "L"]) {
        setCell(ws1.getCell(`${col}${item.row}`), "", {
          fill: C.grayBg,
          border: "FFF59E0B",
        });
      }
      ws1.getRow(item.row).height = 24;
    }

    // ── Sheet 2: summary ────────────────────────────────────────────────────
    const ws2 = workbook.addWorksheet("ملخص البيان", { views: [{ state: "frozen", ySplit: 4, rightToLeft: true }] });
    ws2.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws2.columns = [{ width: 28 }, { width: 20 }];
    ws2.mergeCells("A1:B1");
    setCell(ws2.getCell("A1"), `${brandName}${brandTagline ? `  ·  ${brandTagline}` : ""}`, {
      fill: C.bg,
      font: { bold: true, size: 16, color: { argb: C.gold } },
      align: { horizontal: "center", vertical: "middle" },
      border: C.bg,
    });
    ws2.getRow(1).height = 28;
    ws2.mergeCells("A2:B2");
    setCell(ws2.getCell("A2"), `ملخص بيان الشحن — ${manifest.manifestNumber}`, {
      fill: C.bg,
      font: { bold: true, size: 12, color: { argb: C.gold } },
      align: { horizontal: "center", vertical: "middle" },
      border: C.bg,
    });
    ws2.getRow(2).height = 24;
    ws2.mergeCells("A3:B3");
    setCell(ws2.getCell("A3"), "", { fill: C.panel, border: "FF334155" });
    ws2.getRow(3).height = 8;

    const summaryRows: Array<[string, string, string]> = [
      ["رقم البيان", manifest.manifestNumber, C.blue],
      ["شركة الشحن", manifest.companyName, C.blue],
      ["تاريخ الإنشاء", manifestDate, C.gray],
      ["الحالة", manifest.status === "closed" ? "مغلق ✓" : "مفتوح", manifest.status === "closed" ? C.green : C.blue],
      ["إجمالي البيان", String(groupedTotal), C.blue],
      ["إجمالي المسلَّم", String(groupedCompleted), C.green],
      ["مسلَّم", String(groupedDelivered), C.green],
      ["مرتجع", String(groupedReturned), C.red],
      ["مؤجل", String(groupedPostponed), C.amber],
      ["استلم جزئي", String(groupedPartial), C.teal],
      ["قيد الانتظار", String(groupedPending), C.gray],
      ["نسبة التسليم", `${groupedDeliveryRate}%`, groupedDeliveryRate >= 70 ? C.green : groupedDeliveryRate >= 40 ? C.amber : C.red],
      ["إجمالي المحصَّل", fmtMoney(totalCollected), C.green],
      ["رسوم الشحن", fmtMoney(effectiveShipping), C.amber],
      ["صافي المستحق", fmtMoney(netDue), C.green],
    ];

    let sRow = 4;
    for (const [label, value, color] of summaryRows) {
      const row = ws2.getRow(sRow++);
      row.height = 24;
      setCell(row.getCell(1), label, {
        fill: C.offWhite,
        font: { color: { argb: C.slate } },
        align: { horizontal: "right", vertical: "middle" },
        border: "FFD1D5DB",
      });
      setCell(row.getCell(2), value, {
        fill: C.offWhite,
        font: { bold: true, color: { argb: color } },
        align: { horizontal: "center", vertical: "middle" },
        border: "FFD1D5DB",
      });
    }
    ws2.views = [{ state: "frozen", ySplit: 3, rightToLeft: true }];

    // ── sheet styling ───────────────────────────────────────────────────────
    ws1.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.alignment) cell.alignment = { horizontal: "right", vertical: "middle" };
      });
    });
    ws2.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.alignment) cell.alignment = { horizontal: "right", vertical: "middle" };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `بيان-${manifest.manifestNumber}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── PDF Export (via print) ──────────────────────────────────────────────────
  const exportPDF = () => {
    onClose();
    setTimeout(() => window.print(), 150);
  };

  // stats for preview
  const statusGroups = [
    { label: "مسلَّم", count: s.delivered, color: "#15803d", bg: "#dcfce7" },
    { label: "مرتجع", count: s.returned, color: "#dc2626", bg: "#fee2e2" },
    { label: "مؤجل", count: groupedPostponedCount, color: "#d97706", bg: "#fef3c7" },
    { label: "جزئي", count: groupedPartialCount, color: "#0f766e", bg: "#ccfbf1" },
    { label: "انتظار", count: groupedPendingCount, color: "#64748b", bg: "#f1f5f9" },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            تصدير البيان — {manifest.manifestNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Preview card */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black text-base">{manifest.manifestNumber}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Truck className="w-3 h-3" />{manifest.companyName}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                manifest.status === "closed"
                  ? "bg-emerald-900/30 text-emerald-400 border border-emerald-700"
                  : "bg-blue-900/30 text-blue-400 border border-blue-700"
              }`}>
                {manifest.status === "closed" ? "✓ مغلق" : "● مفتوح"}
              </span>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-1.5">
              {statusGroups.filter(g => g.count > 0).map(g => (
                <span key={g.label} className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                  style={{ color: g.color, backgroundColor: g.bg + "33", borderColor: g.color + "44" }}>
                  {g.label}: {g.count}
                </span>
              ))}
            </div>

            {/* Financials */}
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground mb-0.5">محصَّل</p>
                <p className="text-xs font-black text-emerald-400">{Number(totalCollected || 0).toLocaleString("ar-EG")} ج</p>
              </div>
              <div className="text-center border-x border-border">
                <p className="text-[9px] text-muted-foreground mb-0.5">شحن</p>
                <p className="text-xs font-black text-amber-400">−{Number(effectiveShipping || 0).toLocaleString("ar-EG")} ج</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground mb-0.5">صافي</p>
                <p className="text-xs font-black text-primary">{Number(netDue || 0).toLocaleString("ar-EG")} ج</p>
              </div>
            </div>
          </div>

          {/* Export options */}
          <div className="grid grid-cols-2 gap-3">
            {/* Excel */}
            <button
              onClick={exportExcel}
              className="group flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-emerald-600 bg-card hover:bg-emerald-900/10 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-900/20 border border-emerald-700/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="font-black text-sm text-foreground">تصدير Excel</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">3 شيتات: الطلبيات · الملخص · حسب الحالة</p>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-900/20 border border-emerald-800 px-2.5 py-0.5 rounded-full">
                .xlsx
              </span>
            </button>

            {/* PDF */}
            <button
              onClick={exportPDF}
              className="group flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-red-600 bg-card hover:bg-red-900/10 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-red-900/20 border border-red-700/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-center">
                <p className="font-black text-sm text-foreground">تصدير PDF</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">بيان رسمي مع الإحصائيات والأرقام</p>
              </div>
              <span className="text-[10px] font-bold text-red-400 bg-red-900/20 border border-red-800 px-2.5 py-0.5 rounded-full">
                .pdf
              </span>
            </button>
          </div>

          {/* Info note */}
          <p className="text-[10px] text-muted-foreground text-center border-t border-border pt-3">
            Excel: {manifest.stats.total} طلبية في {[...new Set(manifest.orders.map(o => o.deliveryStatus))].length} حالات مختلفة &nbsp;·&nbsp;
            PDF: طباعة البيان الرسمي بصيغة A4
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Shipments Dialog ─────────────────────────────────────────────────────
function AddOrdersToManifestDialog({
  manifestId,
  manifestNumber,
  companyId,
  existingOrderIds,
  onClose,
  onAdded,
}: {
  manifestId: number;
  manifestNumber: string;
  companyId: number;
  existingOrderIds: Set<number>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // "picked_up" قيمة قديمة فالداتابيز بنفس تسمية "قيد الشحن في المخزن" — لازم تتحسب كمان
  const AVAILABLE_STATUSES = ["warehouse_ready", "picked_up"];

  // ملحوظة: متعمد عدم تحديد shippingCompanyId — أي شحنة "قيد الشحن في المخزن" بتظهر هنا
  // بغض النظر عن شركة الشحن المرتبطة بيها، عشان تقدر تنقلها لأي بيان.
  const { data: shipmentsData, isLoading } = useQuery({
    queryKey: ["shipments-available-for-manifest"],
    queryFn: () => shipmentsApi.list({ status: "warehouse_ready", limit: 500 }),
    staleTime: 10000,
  });

  const addMutation = useMutation({
    mutationFn: () => shipmentManifestsApi.addShipments(manifestId, Array.from(selectedIds)),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["shipment-manifest", manifestId] });
      queryClient.invalidateQueries({ queryKey: ["shipments-available-for-manifest"] });
      toast({ title: `✅ تمت الإضافة`, description: `تم إضافة ${res.added} شحنة للبيان ${res.manifestNumber}` });
      onAdded();
      onClose();
    },
    onError: (e: any) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const available = useMemo(() => {
    return (shipmentsData?.data ?? []).filter(s =>
      AVAILABLE_STATUSES.includes(s.status) && !existingOrderIds.has(s.id)
    );
  }, [shipmentsData, existingOrderIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.toLowerCase();
    return available.filter(s =>
      s.receiverName?.toLowerCase().includes(q) ||
      s.shipmentNumber?.toLowerCase().includes(q) ||
      (s.receiverPhone && s.receiverPhone.includes(q)) ||
      (s.receiverCity && s.receiverCity.toLowerCase().includes(q)) ||
      (s.trackingNumber && s.trackingNumber.toLowerCase().includes(q))
    );
  }, [available, search]);

  const toggleAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(s => s.id)));
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border w-[94vw] sm:w-full max-w-3xl max-h-[90vh] flex flex-col p-4 sm:p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2 pr-8 text-base sm:text-lg">
            <PackagePlus className="w-4 h-4 text-primary shrink-0" />
            إضافة شحنات إلى البيان — {manifestNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 mt-2">
          {/* Search + counter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم / رقم الشحنة / الهاتف / المدينة..."
                className="h-9 text-sm bg-background pr-8"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {!isLoading && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {available.length} شحنة متاحة
              </span>
            )}
          </div>

          {/* Select-all */}
          {!isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onCheckedChange={toggleAll}
                />
                <span className="text-xs text-muted-foreground">تحديد الكل ({filtered.length})</span>
              </div>
              <span className="text-xs font-bold text-primary">{selectedIds.size} محدد</span>
            </div>
          )}

          {/* Shipments list */}
          <div className="overflow-y-auto flex-1 border border-border rounded-md">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">جاري تحميل الشحنات...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <PackagePlus className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">
                  {available.length === 0 ? "لا توجد شحنات بحالة (قيد الشحن في المخزن) جاهزة للبيان" : "لا توجد نتائج تطابق البحث"}
                </p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="hidden sm:grid grid-cols-[auto_1fr_1fr_80px] gap-0 border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold text-muted-foreground sticky top-0">
                  <div className="w-5" />
                  <div>المستلم</div>
                  <div>رقم الشحنة / المدينة</div>
                  <div className="text-left">المبلغ</div>
                </div>
                {/* Rows */}
                {filtered.map(s => {
                  const isSelected = selectedIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      className={`flex flex-col gap-2 sm:grid sm:grid-cols-[auto_1fr_1fr_80px] sm:gap-0 sm:items-center px-3 py-2.5 border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                      onClick={() => {
                        const next = new Set(selectedIds);
                        if (isSelected) next.delete(s.id); else next.add(s.id);
                        setSelectedIds(next);
                      }}
                    >
                      <div className="hidden sm:flex w-5 items-center">
                        <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                      </div>
                      <div className="flex items-start gap-2 sm:contents">
                        <div className="sm:hidden shrink-0 pt-0.5">
                          <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                        </div>
                        <div className="min-w-0 pr-2 flex-1">
                          <p className="font-semibold text-xs truncate">{s.receiverName}</p>
                          <p className="text-muted-foreground text-[10px]">
                            {s.receiverPhone ?? ""}
                          </p>
                        </div>
                        <div className="sm:hidden shrink-0 text-xs font-bold text-primary">{formatCurrency(Number(s.codAmount))}</div>
                      </div>
                      <div className="min-w-0 pr-2">
                        <p className="text-xs truncate">{s.shipmentNumber}</p>
                        {s.receiverCity && (
                          <p className="text-muted-foreground text-[10px]">{s.receiverCity}</p>
                        )}
                      </div>
                      <div className="hidden sm:block text-left text-xs font-bold text-primary">{formatCurrency(Number(s.codAmount))}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2 mt-2">
          <Button
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || selectedIds.size === 0}
          >
            <PackagePlus className="w-3.5 h-3.5" />
            {addMutation.isPending ? "جاري الإضافة..." : `إضافة ${selectedIds.size > 0 ? selectedIds.size + " شحنات" : ""}`}
          </Button>
          <Button variant="outline" className="border-border" onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ColFilters = {
  customer: Set<string>;
  governorate: Set<string>;
  product: Set<string>;
  qty: Set<string>;
  total: Set<string>;
  date: Set<string>;
  status: Set<string>;
};

/* ── أيقونة فلتر Excel لكل عمود ── */
function ColFilterBtn({ col, colFilters, getColOptions, toggleColFilter, clearColFilter, sortCol, sortDir, onSort }: {
  col: keyof ColFilters;
  colFilters: ColFilters;
  getColOptions: (col: keyof ColFilters) => string[];
  toggleColFilter: (col: keyof ColFilters, val: string) => void;
  clearColFilter: (col: keyof ColFilters) => void;
  sortCol: keyof ColFilters | null;
  sortDir: "asc" | "desc";
  onSort: (col: keyof ColFilters, dir: "asc" | "desc") => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const sort = sortCol === col ? sortDir : "asc";
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const active = colFilters[col].size > 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // استخدم fixed بدل absolute — بيعمل صح بغض النظر عن الـ scroll أو الـ overflow
      const panelW = 208; // w-52
      const left = Math.max(4, Math.min(r.left, window.innerWidth - panelW - 4));
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(o => !o);
    setSearch("");
  };

  let opts = getColOptions(col);
  if (search) opts = opts.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  if (sort === "desc") opts = [...opts].reverse();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        title="فلتر"
        className={`flex items-center justify-center w-5 h-5 rounded transition-all shrink-0 ${active ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
      >
        {active ? (
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        )}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-background border border-border rounded-lg shadow-2xl text-[11px] w-52"
          dir="rtl"
        >
          <div className="flex gap-1 p-2 border-b border-border/50">
            <button type="button" onClick={() => { onSort(col, "asc"); setOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${sort === "asc" && sortCol === col ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronUp className="w-2.5 h-2.5" />أ→ي
            </button>
            <button type="button" onClick={() => { onSort(col, "desc"); setOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${sort === "desc" && sortCol === col ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronDown className="w-2.5 h-2.5" />ي→أ
            </button>
          </div>
          <div className="px-2 pt-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث في القيم..."
              className="w-full h-7 text-[10px] px-2 border border-border rounded bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="max-h-48 overflow-y-auto px-1 py-1.5 flex flex-col gap-0.5">
            {opts.length === 0
              ? <p className="text-muted-foreground text-center py-3 text-[10px]">لا توجد قيم</p>
              : opts.map(val => (
                <label key={val} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer">
                  <input type="checkbox" checked={colFilters[col].has(val)}
                    onChange={() => toggleColFilter(col, val)}
                    className="accent-primary w-3 h-3 shrink-0" />
                  <span className="truncate">{val}</span>
                </label>
              ))
            }
          </div>
          {active && (
            <div className="border-t border-border/50 px-2 py-1.5">
              <button type="button" onClick={() => { clearColFilter(col); setOpen(false); }}
                className="text-destructive text-[10px] hover:underline w-full text-right">
                مسح الفلتر
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── ReturnReceivedButton — زرار "تم الاستلام" / "لم يتم الاستلام" ──────────
function ReturnReceivedButton({
  manifestId,
  order,
  received,
  onSaved,
  locked,
  currentlyAtShipping = false,
}: {
  manifestId: number;
  order: ManifestOrder;
  received: boolean;
  onSaved: () => void;
  locked: boolean;
  currentlyAtShipping?: boolean;
}) {
  const { toast } = useToast();
  const isPartial = order.deliveryStatus === "partial_received" || order.deliveryStatus === "partial_delivered";
  const currentRR = (order as any).returnReceived; // 0 | 1 | null

  // هل الزر ده هو الحالة الحالية (مظلَّل)؟
  const isActive = received
    ? currentRR === 1
    : currentRR === 0;

  const [confirmReceive, setConfirmReceive] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      shipmentManifestsApi.updateItem(manifestId, order.shipmentId, {
        deliveryStatus: order.deliveryStatus,
        deliveryNote: order.deliveryNote ?? null,
        partialQuantity: order.partialQuantity ?? null,
        returnReceived: received,
      }),
    onSuccess: () => {
      toast({
        title: received ? "تم الاستلام ✅" : "لم يتم الاستلام بعد",
        description: received
          ? "تمت إضافة البضاعة للمخزن"
          : "سيُرحَّل هذا الطلب للبيان التالي عند الإغلاق",
      });
      onSaved();
    },
    onError: (e: any) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  if (received) {
    return (
      <>
        <button
          type="button"
          onClick={() => !locked && !isActive && setConfirmReceive(true)}
          disabled={locked || mutation.isPending}
          className={`flex flex-1 sm:flex-initial flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all min-w-[72px] ${
            isActive
              ? "border-emerald-500 bg-emerald-900/40 text-emerald-300"
              : "border-border text-muted-foreground hover:border-emerald-700 hover:text-emerald-400 hover:bg-emerald-900/10"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="text-sm">✅</span>
          <span>تم الاستلام</span>
        </button>
        <AlertDialog open={confirmReceive} onOpenChange={setConfirmReceive}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد استلام البضاعة</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من استلام بضاعة طلبية <strong>{order.customerName}</strong> ({order.product}) من مندوب الشحن؟
                <br />سيتم إضافتها للمخزن فورًا.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>لا، تراجع</AlertDialogCancel>
              <AlertDialogAction
                className="bg-emerald-700 text-white hover:bg-emerald-600"
                onClick={() => { setConfirmReceive(false); mutation.mutate(); }}
              >
                نعم، تم الاستلام
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => !locked && !isActive && mutation.mutate()}
      disabled={locked || mutation.isPending}
      className={`flex flex-1 sm:flex-initial flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all min-w-[72px] ${
        isActive
          ? "border-orange-500 bg-orange-900/40 text-orange-300"
          : "border-border text-muted-foreground hover:border-orange-700 hover:text-orange-400 hover:bg-orange-900/10"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span className="text-sm">🚚</span>
      <span>لم يتم بعد</span>
    </button>
  );
}

export default function ShippingManifestPage() {
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canViewFinancials, isAdmin } = useAuth();
  const { brand } = useBrand();
  // سعر المنطقة (لحاوية صافي المستحق) — نفس مصدر صافي الربح الحقيقي
  const { data: pnlSettlementZones = [] } = useQuery<{ id: number; price: number }[]>({
    queryKey: ["shipment-zones"],
    queryFn: () => apiFetch("/shipments/zones"),
  });
  const [netDueOpen, setNetDueOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [showAddOrdersDialog, setShowAddOrdersDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showOrders, setShowOrders] = useState(true);
  const [showRolloverDialog, setShowRolloverDialog] = useState<null | { id: number; manifestNumber: string; orderCount: number; breakdown: string }>(null);
  // ─── البحث المباشر — بدون popover ──────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  // ─── ترتيب حسب الحالة ───────────────────────────────────────────────────────
  const [statusSort, setStatusSort] = useState<"none" | "asc" | "desc">("none");
  // ─── ترتيب حسب تاريخ الإضافة ────────────────────────────────────────────────
  const [dateSort, setDateSort] = useState<"none" | "asc" | "desc">("none");
  // ─── Excel-style Column Filters ─────────────────────────────────────────────
  const [colFilterOpen, setColFilterOpen] = useState(false);
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);
  const [colFilters, setColFilters] = useState<ColFilters>({
    customer: new Set(), governorate: new Set(), product: new Set(),
    qty: new Set(), total: new Set(), date: new Set(), status: new Set(),
  });
  const [showColFilters, setShowColFilters] = useState(false);
  const [manifestCustomerSearch, setManifestCustomerSearch] = useState("");
  const [manifestProductSearch, setManifestProductSearch] = useState("");
  const [manifestTotalSearch, setManifestTotalSearch] = useState("");
  const [sortCol, setSortCol] = useState<keyof ColFilters | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const handleSort = useCallback((col: keyof ColFilters, dir: "asc" | "desc") => {
    setSortCol(col); setSortDir(dir);
  }, []);
  const [colFilterSearch, setColFilterSearch] = useState("");
  const [colFilterSort, setColFilterSort] = useState<"none" | "asc" | "desc">("none");
  // ─── نظام التحديد (Bulk Selection) ─────────────────────────────────────────
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const { data: rawManifest, isLoading, error } = useQuery({
    queryKey: ["shipping-manifest", id],
    queryFn: () => shipmentManifestsApi.get(id),
    enabled: !isNaN(id),
  });

  // Adapter: convert ShipmentManifestDetail to ShippingManifestDetail-compatible shape
  const manifest = useMemo(() => {
    if (!rawManifest) return undefined;
    const orders: ManifestOrder[] = (rawManifest.items ?? []).map((item) => {
      const sh = item.shipment;
      // نقرأ من الـ enriched fields اللي الـ backend بيبعتها مباشرة على الـ item
      const codAmt = (item as any).totalPrice != null
        ? Number((item as any).totalPrice)
        : sh ? parseFloat(sh.codAmount ?? '0') : 0;
      const shippingFeeAmt = (item as any).shippingCost != null
        ? Number((item as any).shippingCost)
        : sh ? parseFloat(sh.shippingFee ?? '0') : 0;
      return {
        id: item.shipmentId,
        shipmentId: item.shipmentId,
        manifestOrderId: item.id,
        invoiceNumber: sh?.shipmentNumber ?? `S-${item.shipmentId}`,
        customerName: sh?.receiverName ?? '—',
        customerPhone: sh?.receiverPhone ?? null,
        phone: sh?.receiverPhone ?? null,
        city: sh?.receiverCity ?? sh?.zoneGovernorate ?? null,
        address: sh?.receiverAddress ?? null,
        senderName: sh?.senderName ?? null,
        product: sh ? `${sh.shipmentNumber}${sh.trackingNumber ? ` (${sh.trackingNumber})` : ''}` : '—',
        quantity: sh?.pieces ?? 1,
        warehouseName: (item as any).warehouseName ?? null,
        total: codAmt,
        totalPrice: codAmt,
        cost: null,
        shippingCost: shippingFeeAmt,
        status: sh?.status ?? 'pending',
        notes: sh?.notes ?? null,
        color: null,
        size: null,
        source: null,
        createdAt: sh?.createdAt ?? rawManifest.createdAt,
        updatedAt: sh?.updatedAt ?? null,
        assignedUserId: sh?.assignedUserId ?? null,
        createdByUserId: null,
        shippingCompanyId: sh?.shippingCompanyId ?? rawManifest.shippingCompanyId,
        deliveryStatus: (() => {
          // لو البيان لسه pending بس الشحنة نفسها اتغيرت → sync الحالة
          if (item.deliveryStatus === "pending" && sh?.status) {
            const statusMap: Record<string, string> = {
              returned:         "returned",
              partial_received: "partial_delivered",
              delivered:        "delivered",
              received:         "delivered",
            };
            return (statusMap[sh.status] ?? item.deliveryStatus) as DeliveryStatus;
          }
          return item.deliveryStatus as DeliveryStatus;
        })(),
        deliveryNote: item.deliveryNote,
        deliveredAt: item.deliveredAt,
        returnReceived: item.returnReceived,
        addedAt: rawManifest.createdAt,
        partialQuantity: item.partialQuantity ?? null,
        returnReason: item.returnReason ?? null,
        returnValueReceived: (item as any).returnValueReceived != null ? Number((item as any).returnValueReceived) : null,
        deliveredValueReceived: (item as any).deliveredValueReceived != null ? Number((item as any).deliveredValueReceived) : null,
      } as any;
    });
    const manualShippingCost = rawManifest.invoicePrice != null ? parseFloat(rawManifest.invoicePrice) : null;

    return {
      ...rawManifest,
      companyName: rawManifest.company?.name ?? '—',
      companyPhone: null as string | null,
      companyLogo: rawManifest.company?.logo ?? null,
      invoiceNotes: rawManifest.notes ?? null,
      manualShippingCost,
      orders,
      stats: rawManifest.stats,
    };
  }, [rawManifest]);

  // ─── Search filter — real-time, no popover ────────────────────────────────
  const filteredManifestOrders = useMemo(() => {
    const orders = manifest?.orders ?? [];
    // كل الطلبيات تفضل ظاهرة في الجدول دايمًا، بما فيها المرتجع/الجزئي بعد "تم الاستلام"
    // (الحالة نفسها بتتغير في الـ badge، لكن الطلبية ملهاش تختفي)
    const groups = groupManifestOrders(orders);
    if (!manifestCustomerSearch && !manifestProductSearch) return groups;
    const cLow = manifestCustomerSearch.toLowerCase();
    const pLow = manifestProductSearch.toLowerCase();
    return groups.filter(group => {
      const rep = group[0];
      if (cLow && !(rep.customerName ?? "").toLowerCase().includes(cLow)) return false;
      if (pLow && !group.some(o => (o.product ?? "").toLowerCase().includes(pLow) || (o.phone ?? "").toLowerCase().includes(pLow))) return false;
      return true;
    });
  }, [manifest?.orders, manifestCustomerSearch, manifestProductSearch]);

  // ─── Sort — حسب الحالة فوق الـ filter ──────────────────────────────────────
  const sortedManifestOrders = useMemo(() => {
    if (statusSort === "none" && dateSort === "none") return filteredManifestOrders;
    const getGroupPriority = (group: ManifestOrder[]) => {
      const statuses = [...new Set(group.map(o => o.deliveryStatus))];
      const maxP = Math.max(...statuses.map(s => STATUS_SORT_PRIORITY[s] ?? 0));
      return maxP;
    };
    const getGroupDate = (group: ManifestOrder[]) => {
      const ts = (group[0] as any).addedAt;
      return ts ? new Date(ts).getTime() : 0;
    };
    return [...filteredManifestOrders].sort((a, b) => {
      // الترتيب حسب التاريخ له الأولوية لو كان مفعّل
      if (dateSort !== "none") {
        const diff = getGroupDate(a) - getGroupDate(b);
        if (diff !== 0) return dateSort === "asc" ? diff : -diff;
      }
      // ثم الترتيب حسب الحالة
      if (statusSort !== "none") {
        const diff = getGroupPriority(a) - getGroupPriority(b);
        if (diff !== 0) return statusSort === "asc" ? diff : -diff;
      }
      return 0;
    });
  }, [filteredManifestOrders, statusSort, dateSort]);

  // ─── Excel Column Filter helpers ─────────────────────────────────────────────
  const getGroupVal = (col: keyof ColFilters, group: ManifestOrder[]): string => {
    const rep = group[0];
    switch (col) {
      case "customer":    return rep.customerName ?? "";
      case "governorate": return rep.city ?? "";
      case "product":     return group.map(o => o.product).filter(Boolean).join(", ");
      case "qty":         return String(group.reduce((s, o) => s + o.quantity, 0));
      case "total":       return String(group.reduce((s, o) => s + o.totalPrice, 0));
      case "date":        return (rep as any).addedAt ? new Date((rep as any).addedAt).toLocaleDateString("ar-EG") : "—";
      case "status": {
        const statuses = [...new Set(group.map(o => o.deliveryStatus))];
        const labels: Record<string, string> = {
          delivered:"مسلَّم", returned:"مرتجع", pending:"قيد الانتظار",
          postponed:"مؤجَّل", partial_received:"استلام جزئي",
        };
        return statuses.map(s => labels[s] ?? s).join(" / ");
      }
      default: return "";
    }
  };

  const colFilteredGroups = useMemo(() => {
    const hasAny = Object.values(colFilters).some(s => s.size > 0);
    if (!hasAny) return sortedManifestOrders;
    return sortedManifestOrders.filter(group =>
      (Object.keys(colFilters) as (keyof ColFilters)[]).every(col => {
        const set = colFilters[col];
        if (set.size === 0) return true;
        return set.has(getGroupVal(col, group));
      })
    );
  }, [sortedManifestOrders, colFilters]);

  const colFilterHasActive = Object.values(colFilters).some(s => s.size > 0);

  const displayGroups = useMemo(() => {
    if (!sortCol) return colFilteredGroups;
    return [...colFilteredGroups].sort((a, b) => {
      const va = getGroupVal(sortCol, a);
      const vb = getGroupVal(sortCol, b);
      const cmp = va.localeCompare(vb, "ar", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [colFilteredGroups, sortCol, sortDir]);

  // القيم المتاحة لكل عمود بناءً على البيانات الحالية بعد باقي الفلاتر
  const getColOptions = (col: keyof ColFilters): string[] => {
    const base = sortedManifestOrders; // نعرض كل القيم الموجودة
    const vals = [...new Set(base.map(g => getGroupVal(col, g)))].filter(v => v && v !== "—");
    return vals.sort((a, b) => a.localeCompare(b, "ar"));
  };

  const toggleColFilter = (col: keyof ColFilters, val: string) => {
    setColFilters(prev => {
      const next = new Set(prev[col]);
      next.has(val) ? next.delete(val) : next.add(val);
      return { ...prev, [col]: next };
    });
  };

  const clearColFilter = (col: keyof ColFilters) => {
    setColFilters(prev => ({ ...prev, [col]: new Set() }));
  };

  const clearAllColFilters = () => {
    setColFilters({ customer: new Set(), governorate: new Set(), product: new Set(), qty: new Set(), total: new Set(), date: new Set(), status: new Set() });
  };

  // ─── Selection helpers ───────────────────────────────────────────────────────
  const allGroupKeys = useMemo(
    () => colFilteredGroups.map(g => getManifestGroupKey(g[0])),
    [colFilteredGroups]
  );
  const allSelected = allGroupKeys.length > 0 && allGroupKeys.every(k => selectedGroups.has(k));
  const someSelected = !allSelected && allGroupKeys.some(k => selectedGroups.has(k));

  const toggleGroup = useCallback((key: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(allGroupKeys));
    }
  }, [allSelected, allGroupKeys]);

  const clearSelection = useCallback(() => setSelectedGroups(new Set()), []);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["shipping-manifest", id] });
    queryClient.invalidateQueries({ queryKey: ["shipping-manifests"] });
    queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    queryClient.invalidateQueries({ queryKey: ["variants"] });
    queryClient.invalidateQueries({ queryKey: ["variants-all"] });
    queryClient.invalidateQueries({ queryKey: ["orders-in-manifest-ids"] });
    // تحديث حركات المخزون والمنتجات تلقائياً بعد كل تغيير حالة
    queryClient.invalidateQueries({ queryKey: ["movements"] });
    queryClient.invalidateQueries({ queryKey: ["movements-totals"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["stock-intelligence"] });
    queryClient.invalidateQueries({ queryKey: ["smart-insights"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] });
    queryClient.invalidateQueries({ queryKey: ["variant-wh-stock"] });
    // مزامنة حالة الشحنات: أي تغيير في البيان ينعكس فوراً على قسم الشحنات
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    queryClient.invalidateQueries({ queryKey: ["shipment-manifest"] });
    queryClient.invalidateQueries({ queryKey: ["warehouse-shipments"] });
  }, [queryClient, id]);

  const updateMutation = useMutation({
    mutationFn: (data: { status: "open" | "closed" }) =>
      shipmentManifestsApi.update(id, data),
    onSuccess: (result: any) => {
      refetch();
      setShowCloseDialog(false);
      if (result?.rolledOverManifest) {
        const rolled = result.rolledOverManifest;
        const parts: string[] = [];
        if (rolled.postponedCount > 0) parts.push(`${rolled.postponedCount} مؤجل`);
        if (rolled.pendingCount > 0) parts.push(`${rolled.pendingCount} قيد الانتظار`);
        if (rolled.returnedInShippingCount > 0) parts.push(`${rolled.returnedInShippingCount} مرتجع في الشحن`);
        if (rolled.partialInShippingCount > 0) parts.push(`${rolled.partialInShippingCount} جزئي في الشحن`);
        const breakdown = parts.length > 0 ? ` (${parts.join(" · ")})` : "";
        toast({
          title: "🔒 تم إغلاق البيان بنجاح",
          description: `📦 تم إنشاء بيان جديد "${rolled.manifestNumber}" — ${rolled.orderCount} طلبية${breakdown}`,
          duration: 15000,
        });
        setShowRolloverDialog({ id: rolled.id, manifestNumber: rolled.manifestNumber, orderCount: rolled.orderCount, breakdown });
      } else {
        toast({ title: "🔒 تم إغلاق البيان بنجاح" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => shipmentManifestsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping-manifests"] });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["variants"] });
      queryClient.invalidateQueries({ queryKey: ["variants-all"] });
      toast({ title: "تم الحذف" });
      window.history.back();
    },
    onError: () =>
      toast({
        title: "خطأ",
        description: "فشل حذف البيان",
        variant: "destructive",
      }),
  });

  const handlePrint = async () => {
    const printEl = document.querySelector(".manifest-print") as HTMLElement | null;
    if (!printEl) return;

    // تحويل لوجو شركة الشحن لـ base64 — فقط لو فيه لوجو فعلاً
    let logoB64 = "";
    if (manifest.companyLogo) {
      try {
        const r = await fetch(manifest.companyLogo);
        if (r.ok) {
          const blob = await r.blob();
          logoB64 = await new Promise<string>(res => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      } catch { /* تجاهل لو فشل */ }
    }

    // استبدل الـ img tag في الـ innerHTML بالـ base64 version — فقط لو فيه لوجو
    let html = printEl.innerHTML;
    if (logoB64) {
      html = html.replace(/<img[^>]*class="mp-logo"[^>]*>/g,
        `<img src="${logoB64}" class="mp-logo" alt="${manifest.companyName}" />`);
    }

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { window.print(); return; }

    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>بيان الشحن — ${manifest.manifestNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 8mm 10mm; }
    body {
      font-family: 'Cairo', 'Segoe UI', Arial, sans-serif;
      font-size: 10pt;
      color: #111;
      background: #fff;
      direction: rtl;
      padding: 0 2mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* ── Header ── */
    .mp-header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #1e3a5f; padding-bottom:3mm; margin-bottom:3mm; }
    .mp-header-left { flex:1; }
    .mp-header-right { display:flex; align-items:center; gap:3mm; flex-direction:row; flex-shrink:0; }
    .mp-stark-brand { display:flex; align-items:baseline; gap:2mm; margin-bottom:1.5mm; }
    .mp-stark-name { font-size:15pt; font-weight:900; letter-spacing:3px; color:#0f172a; background:linear-gradient(90deg,#0f172a,#1e3a5f); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
    .mp-stark-tagline { font-size:6.5pt; font-weight:700; letter-spacing:2px; color:#c9a24b; border-left:2px solid #c9a24b; padding-left:2mm; }
    .mp-title { font-size:18pt; font-weight:900; color:#1e3a5f; line-height:1.1; }
    .mp-meta { font-size:9pt; color:#555; margin-top:1.5mm; line-height:1.7; }
    .mp-badge { display:inline-block; margin-top:2mm; padding:1mm 4mm; border-radius:10mm; font-size:8pt; font-weight:800; }
    .mp-badge-open   { background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd; }
    .mp-badge-closed { background:#dcfce7; color:#15803d; border:1px solid #86efac; }
    .mp-company-name { font-size:16pt; font-weight:900; color:#1e3a5f; letter-spacing:1px; text-align:left; }
    .mp-company-sub  { font-size:7pt; color:#94a3b8; letter-spacing:2px; margin-top:0.5mm; text-align:left; }
    .mp-logo { width:16mm; height:16mm; border-radius:50%; object-fit:cover; border:2px solid #e2e8f0; }
    /* ── Stats ── */
    .mp-stats { display:grid; grid-template-columns:repeat(6,1fr); border:2.5px solid #1e3a5f; border-radius:2mm; overflow:hidden; margin-bottom:3mm; }
    .mp-stat { padding:2mm; text-align:center; border-left:2px solid #94a3b8; background:#f8fafc; }
    .mp-stat:last-child { border-left:none; }
    .mp-stat-delivered { background:#f0fdf4; } .mp-stat-returned { background:#fff1f2; }
    .mp-stat-postponed { background:#fffbeb; } .mp-stat-partial   { background:#f0fdfa; }
    .mp-stat-lbl { font-size:8pt; color:#64748b; margin-bottom:0.5mm; font-weight:700; }
    .mp-stat-val { font-size:14pt; font-weight:900; color:#111; }
    .mp-stat-delivered .mp-stat-val { color:#15803d; } .mp-stat-returned .mp-stat-val { color:#dc2626; }
    .mp-stat-postponed .mp-stat-val { color:#b45309; } .mp-stat-partial .mp-stat-val  { color:#0f766e; }
    /* ── Table ── */
    .mp-table { width:100%; border-collapse:collapse; margin-bottom:3mm; font-size:9.5pt; border:2.5px solid #1e3a5f; }
    .mp-table thead tr { background:#1e3a5f; }
    .mp-table th { color:#fff; font-size:9pt; font-weight:700; padding:2.5mm 3mm; text-align:right; border:2px solid rgba(255,255,255,0.5); }
    .mp-table td { padding:2.5mm 3mm; border:2px solid #94a3b8; vertical-align:middle; line-height:1.5; }
    .mp-row-alt td { background:#f0f4f8; }
    .mp-td-center { text-align:center; } .mp-td-bold { font-weight:700; }
    .mp-td-ltr { direction:ltr; text-align:right; }
    .mp-num { color:#94a3b8; font-size:8pt; } .mp-sub { font-size:7.5pt; color:#94a3b8; font-weight:400; margin-top:0.5mm; }
    .mp-note { font-size:8pt; color:#6b7280; }
    /* ── Status badges ── */
    .st-d { color:#15803d; font-weight:800; background:#dcfce7; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    .st-r { color:#dc2626; font-weight:800; background:#fee2e2; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    .st-p { color:#b45309; font-weight:800; background:#fef3c7; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    .st-x { color:#0f766e; font-weight:800; background:#ccfbf1; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    .st-n { color:#64748b; background:#f1f5f9; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    /* ── Totals ── */
    .mp-totals { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; margin-bottom:4mm; }
    .mp-total-card { border:2.5px solid #94a3b8; border-radius:2mm; padding:3mm 4mm; text-align:center; background:#f8fafc; }
    .mp-total-highlight { background:#f0fdf4; border-color:#15803d; }
    .mp-total-lbl { font-size:8pt; color:#64748b; margin-bottom:1mm; font-weight:700; }
    .mp-total-val { font-size:13pt; font-weight:900; color:#111; }
    .mp-total-orange { color:#d97706; } .mp-total-green { color:#15803d; } .mp-total-blue { color:#1d4ed8; }
    /* ── Footer ── */
    .mp-footer { border-top:1.5px solid #e2e8f0; padding-top:4mm; margin-top:5mm; display:flex; justify-content:space-between; align-items:flex-end; }
    .mp-watermark { font-size:7.5pt; color:#cbd5e1; text-align:center; }
    .mp-sig { min-width:50mm; text-align:center; }
    .mp-sig-title { font-size:9pt; color:#64748b; margin-bottom:8mm; font-weight:700; }
    .mp-sig-line  { border-top:1.5px solid #333; width:80%; margin:0 auto; }
    .mp-sig-name  { font-size:8pt; color:#555; margin-top:2mm; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800);
  };

  if (isLoading)
    return (
      <div className="p-12 text-center text-muted-foreground animate-pulse">
        جاري التحميل...
      </div>
    );
  if (error || !manifest)
    return (
      <div className="p-12 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
        <h2 className="text-lg font-bold mb-2">البيان غير موجود</h2>
        <Link href="/shipping">
          <Button variant="outline" className="mt-3">
            العودة لشركات الشحن
          </Button>
        </Link>
      </div>
    );

  const s = manifest.stats;
  const isLocked = manifest.status === "closed";
  const pendingOrders = manifest.orders.filter(
    (o) => o.deliveryStatus === "pending"
  ).length;
  // helper: هل الطلبية دي بضاعة لسه عند شركة الشحن؟
  // (مرتجع أو استلام جزئي (قديم) مرحَّل ولم يُستلم بعد — partial_delivered مستثناة لأن جزءها المستلم مؤكد فورًا)
  // استثناء: مرتجع بأحد الأسباب الثلاثة (القيمة مُدخلة يدويًا) يعتبر مؤكدًا ماليًا فورًا بغض النظر عن returnReceived
  const isStillAtShipping = (o: typeof manifest.orders[number]) => {
    const RETURN_REASONS_IN_PNL = ["refused_paid", "refused_unpaid", "quality"];
    if (o.deliveryStatus === "returned" && RETURN_REASONS_IN_PNL.includes((o as any).returnReason)) {
      return false;
    }
    const rr = (o as any).returnReceived;
    const isConfirmed = rr === 1 || rr === true || rr === "1";
    return (o.deliveryStatus === "returned" || o.deliveryStatus === "partial_received") &&
      !isConfirmed;
  };

  // استبعد: (1) اللي لسه عند الشحن، (2) اللي تم استلامها (returnReceived=1) — خالص مش في البيان
  // استثناء: مرتجع بأحد الأسباب الثلاثة (القيمة مُدخلة يدويًا) يفضل داخل في الحسابات المالية دايمًا
  const isReturnConfirmed = (o: typeof manifest.orders[number]) => {
    const RETURN_REASONS_IN_PNL = ["refused_paid", "refused_unpaid", "quality"];
    if (o.deliveryStatus === "returned" && RETURN_REASONS_IN_PNL.includes((o as any).returnReason)) {
      return false;
    }
    const rr = (o as any).returnReceived;
    return rr === 1 || rr === true || rr === "1";
  };
  const ordersExcludingPendingShipping = (manifest.orders ?? []).filter(
    (o) => !isStillAtShipping(o) && !isReturnConfirmed(o)
  );

  // ─── عدادات الكروت لازم تتطابق بالظبط مع صفوف جدول "الطلبيات في البيان" ───
  // الجدول (filteredManifestOrders) بيعرض manifest.orders كامل بدون أي استبعاد
  // (ولا isStillAtShipping ولا isReturnConfirmed) عشان أي طلبية "ملهاش تختفي".
  // فالكروت لازم تاخد بالظبط نفس المصدر ده، مش ordersExcludingPendingShipping.
  const groupedManifestOrders = groupManifestOrders(manifest.orders ?? []);
  const allGroupedOrders = groupedManifestOrders;
  const manifestGroupPriority: Record<string, number> = {
    returned: 5,
    postponed: 4,
    partial_received: 3,
    partial_delivered: 3,
    pending: 2,
    delivered: 1,
  };
  const groupManifestStatus = (group: ManifestOrder[]) =>
    group.reduce((worst, order) =>
      (manifestGroupPriority[order.deliveryStatus] ?? 0) > (manifestGroupPriority[worst] ?? 0)
        ? order.deliveryStatus
        : worst,
    group[0]?.deliveryStatus ?? "pending");
  const isPartialStatus = (st: string) => st === "partial_received" || st === "partial_delivered";
  const isPostponedStatus = (st: string) => st === "postponed" || st === "delayed";

  // عدادات كل الحالات لازم تتحسب من نفس المصدر (allGroupedOrders) عشان مجموع الحالات = الإجمالي دايمًا
  const groupedPartialCount   = allGroupedOrders.filter((group) => isPartialStatus(groupManifestStatus(group))).length;
  // كارت "استلم جزئي" لازم يشمل كل الطلبيات partial حتى اللي لسه عند شركة الشحن ومتأكدش استلامها
  // (allGroupedOrders بتستثنيها زي ما بتستثني المرتجع، فكانت بتخفي العداد ده بالكامل)
  const groupManifestStatusAll = (group: ManifestOrder[]) =>
    group.reduce((worst, order) =>
      (manifestGroupPriority[order.deliveryStatus] ?? 0) > (manifestGroupPriority[worst] ?? 0)
        ? order.deliveryStatus
        : worst,
    group[0]?.deliveryStatus ?? "pending");
  // ─── كروت العرض (إجمالي/مرتجع/مسلَّم/مؤجل/جزئي) لازم تتطابق حرفيًا مع صفوف جدول
  // "الطلبيات في البيان" اللي بيتعرض من allGroupedOrders (= groupedManifestOrders) نفسها.
  // مفيش مصدر تاني منفصل — أي فلترة إضافية هنا كانت بتخلي الكروت تختلف عن الجدول.
  const groupedReturnedCount  = allGroupedOrders.filter((group) => groupManifestStatusAll(group) === "returned").length;
  const groupedPendingCount   = allGroupedOrders.filter((group) => groupManifestStatusAll(group) === "pending").length;
  const groupedDeliveredCount = allGroupedOrders.filter((group) => groupManifestStatusAll(group) === "delivered").length;
  const groupedPostponedCount = allGroupedOrders.filter((group) => isPostponedStatus(groupManifestStatusAll(group))).length;
  const groupedTotalCount     = allGroupedOrders.length;
  const groupedCompletedCount = groupedDeliveredCount + groupedPartialCount;
  const groupedDeliveryRate   = groupedTotalCount > 0 ? Math.round((groupedCompletedCount / groupedTotalCount) * 100) : 0;
  const screenDeliveryRate    = groupedTotalCount > 0 ? Math.round((groupedDeliveredCount / groupedTotalCount) * 100) : 0;
  const groupedPendingOrders  = groupedPendingCount;

  const statusLabel = (st: DeliveryStatus) => {
    switch (st) {
      case "delivered":        return { label: "مسلَّم",         cls: "st-d" };
      case "returned":         return { label: "مرتجع",           cls: "st-r" };
      case "postponed":        return { label: "مؤجل",            cls: "st-p" };
      case "delayed":          return { label: "مؤجل",            cls: "st-p" };
      case "partial_received": return { label: "جزئي",            cls: "st-x" };
      case "partial_delivered":return { label: "جزئي",            cls: "st-x" };
      default:                 return { label: "قيد الانتظار",   cls: "st-n" };
    }
  };

  // ─── حسابات الطباعة: نفس منطق كارت الشاشة (deliveredCOD / shippingCost / totalDueToCourier) بالضبط ───
  // الحسابات بتعتمد بس على deliveryStatus/returnReason، وميتأثرش بـ returnReceived
  // (تم الاستلام) خالص — "تم الاستلام" بترجع الأوردر للمخزن فقط ومتغيرش أي رقم مالي.
  const ordersForPnlPrint = (manifest.orders ?? []);
  const RETURN_REASONS_IN_PNL_PRINT = ["refused_paid", "refused_unpaid", "quality"];
  const printDeliveredOrders = ordersForPnlPrint.filter(o =>
    o.deliveryStatus === "delivered" || o.deliveryStatus === "partial_delivered" || o.deliveryStatus === "partial_received"
  );
  // إجمالي الإيرادات = القيمة المستلمة فعليًا (مسلَّم كامل + جزء مُسلَّم/مُستلم + مرتجع بأسباب مالية معتبرة)
  const totalCollected = printDeliveredOrders.reduce((s, o) => {
    if (o.deliveryStatus === "partial_delivered" && o.partialQuantity != null) {
      return s + Number(o.partialQuantity);
    }
    if (o.deliveryStatus === "partial_received" && o.partialQuantity != null) {
      const unitPrice = (o as any).unitPrice != null ? Number((o as any).unitPrice) : (o.quantity > 0 ? Number(o.totalPrice) / Number(o.quantity) : 0);
      return s + unitPrice * Number(o.partialQuantity);
    }
    // مسلَّم بالكامل: القيمة الفعلية المستلمة لو المندوب دخلها (زيادة أو نقص)، وإلا الإجمالي العادي
    const dvrPrint = (o as any).deliveredValueReceived;
    return s + (dvrPrint != null ? Number(dvrPrint) : Number(o.totalPrice ?? 0));
  }, 0) + ordersForPnlPrint
    .filter(o => o.deliveryStatus === "returned" && RETURN_REASONS_IN_PNL_PRINT.includes((o as any).returnReason))
    .reduce((s, o) => s + Number((o as any).returnValueReceived ?? 0), 0);
  // رسوم الشحن = تكلفة الشحن الثابتة على شركة الشحن × عدد الطلبات الداخلة في الحساب (مسلَّم/جزئي/مرتجع بسبب مالي)
  const courierCostPerShipmentPrint = Number((manifest as any)?.company?.shippingCost ?? 0);
  const shippingCostOrdersPrint = ordersForPnlPrint.filter(o =>
    o.deliveryStatus === "delivered" || o.deliveryStatus === "partial_delivered" || o.deliveryStatus === "partial_received" ||
    (o.deliveryStatus === "returned" && RETURN_REASONS_IN_PNL_PRINT.includes((o as any).returnReason))
  );
  const effectiveShipping = courierCostPerShipmentPrint * groupManifestOrders(shippingCostOrdersPrint).length;


  return (
    <>
    {/* ══════════════ PRINT-ONLY ══════════════ */}
    <div className="manifest-print print:block hidden" dir="rtl">

      {/* ─── Header ─── */}
      <div className="mp-header">
        <div className="mp-header-left">
          <div className="mp-stark-brand">
            <span className="mp-stark-name">STARK</span>
            <span className="mp-stark-tagline">SHIPPING &amp; LOGISTICS</span>
          </div>
          <div className="mp-title">بيان الشحن — {manifest.manifestNumber}</div>
          <div className="mp-meta">
            تاريخ الإنشاء: {format(new Date(manifest.createdAt), "yyyy/MM/dd")}
            {manifest.closedAt && <>&emsp;أُغلق: {format(new Date(manifest.closedAt), "yyyy/MM/dd")}</>}
            <br />طُبع: {format(new Date(), "yyyy/MM/dd — HH:mm")}
          </div>
          <span className={`mp-badge ${manifest.status === "closed" ? "mp-badge-closed" : "mp-badge-open"}`}>
            {manifest.status === "closed" ? "✓ مغلق" : "● مفتوح"}
          </span>
        </div>
        <div className="mp-header-right">
          {manifest.companyLogo
            ? <img src={manifest.companyLogo} className="mp-logo" alt={manifest.companyName} crossOrigin="anonymous" />
            : null
          }
          <div>
            <div className="mp-company-name">{manifest.companyName}</div>
            <div className="mp-company-sub">SHIPPING MANIFEST</div>
          </div>
        </div>
      </div>

      {/* ─── Stats strip ─── */}
      <div className="mp-stats">
        <div className="mp-stat"><div className="mp-stat-lbl">إجمالي الطلبيات</div><div className="mp-stat-val">{groupedTotalCount}</div></div>
        <div className="mp-stat mp-stat-delivered"><div className="mp-stat-lbl">مسلَّم</div><div className="mp-stat-val">{groupedDeliveredCount}</div></div>
        <div className="mp-stat mp-stat-returned"><div className="mp-stat-lbl">مرتجع</div><div className="mp-stat-val">{groupedReturnedCount}</div></div>
        <div className="mp-stat mp-stat-postponed"><div className="mp-stat-lbl">مؤجل</div><div className="mp-stat-val">{groupedPostponedCount}</div></div>
        <div className="mp-stat mp-stat-partial"><div className="mp-stat-lbl">جزئي</div><div className="mp-stat-val">{groupedPartialCount}</div></div>
        <div className="mp-stat"><div className="mp-stat-lbl">نسبة التسليم</div><div className="mp-stat-val">{screenDeliveryRate}%</div></div>
      </div>

      {/* ─── Orders table ─── */}
      <table className="mp-table">
        <thead>
          <tr>
            <th style={{ width: "3%" }}>#</th>
            <th style={{ width: "10%" }}>الراسل</th>
            <th style={{ width: "13%" }}>العميل</th>
            <th style={{ width: "9%" }}>الهاتف</th>
            <th style={{ width: "7%" }}>المحافظة</th>
            <th style={{ width: "16%" }}>العنوان</th>
            <th style={{ width: "9%" }}>اجمالى سعر الشحنة</th>
            <th style={{ width: "9%" }}>القيمة المستلمة</th>
            <th style={{ width: "8%" }}>تكلفة الشحن</th>
            <th style={{ width: "8%" }}>حالة الاوردر</th>
            <th style={{ width: "8%" }}>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {groupedManifestOrders.map((group, idx) => {
            const rep = group[0];
            const statuses = [...new Set(group.map((o) => o.deliveryStatus))];
            const isSingleStatus = statuses.length === 1;
            const { label, cls } = statusLabel(isSingleStatus ? statuses[0] as DeliveryStatus : "pending");
            const totalQty = group.reduce((sum, o) => sum + o.quantity, 0);
            const cod = group.reduce((sum, o) => sum + Number(o.totalPrice ?? 0), 0);
            const courierCost = rawManifest?.company?.shippingCost != null ? Number(rawManifest.company.shippingCost) : null;
            const notes = [...new Set(group.map((o) => o.deliveryNote).filter(Boolean))].join(" | ");
            return (
              <tr key={group.map((o) => o.id).join("-")} className={idx % 2 === 1 ? "mp-row-alt" : ""}>
                <td className="mp-td-center mp-num">{idx + 1}</td>
                <td style={{ fontSize: "8.5pt" }}>{(rep as any).senderName ?? "—"}</td>
                <td className="mp-td-bold">{rep.customerName}</td>
                <td className="mp-td-center" style={{ fontSize: "8.5pt" }}>{rep.phone ?? "—"}</td>
                <td>{rep.city ?? "—"}</td>
                <td style={{ fontSize: "8.5pt" }}>{(rep as any).address ?? "—"}</td>
                <td className="mp-td-center mp-td-bold" style={{ color: "#15803d" }}>{cod.toLocaleString("ar-EG")} ج</td>
                <td className="mp-td-center mp-td-bold" style={{ color: "#15803d" }}>{cod.toLocaleString("ar-EG")} ج</td>
                <td className="mp-td-center" style={{ color: "#d97706" }}>{courierCost != null ? courierCost.toLocaleString("ar-EG") + " ج" : "—"}</td>
                <td className="mp-td-center"><span className={cls}>{isSingleStatus ? label : "متعددة"}</span></td>
                <td className="mp-note">{notes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ─── Totals ─── */}
      <div className="mp-totals">
        <div className="mp-total-card">
          <div className="mp-total-lbl">إجمالي المحصَّل</div>
          <div className="mp-total-val">{Number(totalCollected || 0).toLocaleString("ar-EG")} ج.م</div>
        </div>
        <div className="mp-total-card">
          <div className="mp-total-lbl">رسوم الشحن</div>
          <div className="mp-total-val mp-total-orange">{Number(effectiveShipping).toLocaleString("ar-EG")} ج.م</div>
        </div>
        <div className="mp-total-card mp-total-highlight">
          <div className="mp-total-lbl">الصافي المستحق</div>
          <div className="mp-total-val mp-total-green">{Number((totalCollected || 0) - Number(effectiveShipping)).toLocaleString("ar-EG")} ج.م</div>
        </div>
        {manifest.invoicePrice != null && (
          <div className="mp-total-card">
            <div className="mp-total-lbl">سعر الفاتورة المتفق</div>
            <div className="mp-total-val mp-total-blue">{Number(manifest.invoicePrice).toLocaleString("ar-EG")} ج.م</div>
          </div>
        )}
      </div>

      {/* ─── Footer ─── */}
      <div className="mp-footer">
        <div className="mp-sig"><div className="mp-sig-title">توقيع المندوب</div><div className="mp-sig-line"/><div className="mp-sig-name">الاسم: ___________</div></div>
        <div className="mp-watermark">{brand.name} · {manifest.manifestNumber} · {format(new Date(), "yyyy")}</div>
        <div className="mp-sig"><div className="mp-sig-title">توقيع المسؤول</div><div className="mp-sig-line"/><div className="mp-sig-name">الاسم: ___________</div></div>
      </div>

    </div>

    {/* ══════════════ SCREEN-ONLY ══════════════ */}
    <div className="manifest-screen print:hidden max-w-5xl mx-auto space-y-5 animate-in fade-in duration-500" dir="rtl">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/shipping">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full border-border shrink-0"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold">{manifest.manifestNumber}</h1>
              <Badge
                variant="outline"
                className={`text-[10px] font-bold border ${
                  isLocked
                    ? "border-emerald-700 bg-emerald-900/20 text-emerald-400"
                    : "border-blue-700 bg-blue-900/20 text-blue-400"
                }`}
              >
                {isLocked ? "مغلق" : "مفتوح"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Truck className="w-3 h-3" />
                {manifest.companyName}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(manifest.createdAt), "yyyy/MM/dd")}
              </p>
              {manifest.closedAt && (
                <p className="text-xs text-emerald-600">
                  أُغلق: {format(new Date(manifest.closedAt), "yyyy/MM/dd")}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap print:hidden">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 border-border"
            onClick={() => setShowPreview(true)}
          >
            <Eye className="w-3 h-3" />معاينة
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 border-border"
            onClick={handlePrint}
          >
            <Printer className="w-3 h-3" />طباعة
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 border-primary/50 text-primary hover:bg-primary/10"
            onClick={() => setShowExportDialog(true)}
          >
            <Download className="w-3 h-3" />تصدير
          </Button>
          {/* إضافة شحنات — أدمن فقط + البيان مفتوح */}
          {isAdmin && !isLocked && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-primary/50 text-primary hover:bg-primary/10"
              onClick={() => setShowAddOrdersDialog(true)}
            >
              <PackagePlus className="w-3 h-3" />إضافة شحنات
            </Button>
          )}
          {/* إغلاق / فتح البيان — أدمن فقط */}
          {isAdmin && (
            isLocked ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 border-amber-800 text-amber-400 hover:bg-amber-900/20"
                onClick={() => setShowReopenDialog(true)}
              >
                <Unlock className="w-3 h-3" />فتح
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 border-emerald-800 text-emerald-400 hover:bg-emerald-900/20"
                onClick={() => setShowCloseDialog(true)}
              >
                <Lock className="w-3 h-3" />إغلاق البيان
              </Button>
            )
          )}
          {/* حذف البيان — أدمن فقط */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-red-800 text-red-400 hover:bg-red-900/20 hover:text-red-400"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-3 h-3" />حذف
            </Button>
          )}
        </div>
      </div>

      {/* ─── بانر البيان المغلق — للموظف فقط ─── */}
      {isLocked && !isAdmin && (
        <div className="flex items-center gap-3 rounded-xl border border-red-800/50 bg-red-900/10 px-4 py-3">
          <Lock className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-400">هذا البيان مغلق</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              لا يمكن إجراء أي تعديلات على بيان مغلق. تواصل مع الأدمن لإعادة فتحه.
            </p>
          </div>
        </div>
      )}

      {/* ─── بانر البيان المغلق — للأدمن ─── */}
      {isLocked && isAdmin && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-800/50 bg-amber-900/10 px-4 py-3">
          <Lock className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-400">البيان مغلق</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              أُغلق بتاريخ {manifest.closedAt ? format(new Date(manifest.closedAt), "yyyy/MM/dd") : "—"} · لإعادة الفتح اضغط زر "فتح" في الأعلى
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 border-amber-800 text-amber-400 hover:bg-amber-900/20 shrink-0"
            onClick={() => setShowReopenDialog(true)}
          >
            <Unlock className="w-3 h-3" />فتح البيان
          </Button>
        </div>
      )}

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">إجمالي الطلبيات</p>
          <p className="text-2xl font-black">{groupedTotalCount}</p>
          {groupedPendingOrders > 0 && !isLocked && (
            <p className="text-[10px] text-amber-500 mt-0.5">
              {groupedPendingOrders} بانتظار التقفيل
            </p>
          )}
        </Card>
        <Card className="border-emerald-900/50 bg-emerald-900/10 p-4">
          <p className="text-xs text-emerald-400 mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />مُسلَّم
          </p>
          <p className="text-2xl font-black text-emerald-400">{groupedDeliveredCount}</p>
          <p className="text-xs text-emerald-600 mt-0.5 font-bold">
            {screenDeliveryRate}% نسبة التسليم
          </p>
        </Card>
        <Card className="border-red-900/50 bg-red-900/10 p-4">
          <p className="text-xs text-red-400 mb-1 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />مُرتجَع
          </p>
          <p className="text-2xl font-black text-red-400">{groupedReturnedCount}</p>
          <p className="text-xs text-red-600 mt-0.5 font-bold">
            {groupedTotalCount > 0 ? Math.round((groupedReturnedCount / groupedTotalCount) * 100) : 0}% نسبة الإرجاع
          </p>
        </Card>
        <Card className="border-teal-900/50 bg-teal-900/10 p-4">
          <p className="text-xs text-teal-400 mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />استلم جزئي
          </p>
          <p className="text-2xl font-black text-teal-400">{groupedPartialCount}</p>
          {(() => {
            const partialOrders = manifest.orders.filter(o => o.deliveryStatus === "partial_received" || o.deliveryStatus === "partial_delivered");
            const partialReturnedAmount = partialOrders.reduce((sum, o) => {
              const delivered = o.partialQuantity ?? 0; // partialQuantity قيمة مالية دايمًا (مش عدد قطع)
              const total = o.totalPrice ?? 0;
              const remaining = total - delivered;
              return sum + (remaining > 0 ? remaining : 0);
            }, 0);
            const stillAtShipping = partialOrders.filter(o => (o as any).returnReceived !== 1).length;
            return (
              <>
                {partialReturnedAmount > 0 && (
                  <p className="text-[10px] text-red-400 mt-0.5 font-semibold">
                    ↩ مرتجع جزئي: {formatCurrency(partialReturnedAmount)}
                  </p>
                )}
                {stillAtShipping > 0 && (
                  <p className="text-[10px] text-orange-400 mt-0.5 font-semibold">
                    🚚 المرتجع ما زال في شركة الشحن
                  </p>
                )}
              </>
            );
          })()}
        </Card>
        <Card className="border-amber-900/50 bg-amber-900/10 p-4">
          <p className="text-xs text-amber-400 mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />مؤجل / معلَّق
          </p>
          <p className="text-2xl font-black text-amber-400">{groupedPostponedCount}</p>
          <p className="text-xs text-amber-600 mt-0.5 font-bold">
            {groupedTotalCount > 0 ? Math.round((groupedPostponedCount / groupedTotalCount) * 100) : 0}% من الإجمالي
          </p>
        </Card>
      </div>

      {/* ─── Delivery Rate Bar ─── */}
      <Card className="border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold">نسبة التسليم</p>
          <p
            className={`text-xl font-black ${
              groupedDeliveryRate >= 70
                ? "text-emerald-400"
                : groupedDeliveryRate >= 40
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {groupedDeliveryRate}%
          </p>
        </div>
        <div className="w-full bg-muted rounded-full h-3 overflow-hidden flex">
          <div
            className="h-3 bg-emerald-500 transition-all"
            style={{ width: `${groupedTotalCount > 0 ? (groupedDeliveredCount / groupedTotalCount) * 100 : 0}%` }}
          />
          <div
            className="h-3 bg-teal-500 transition-all"
            style={{ width: `${groupedTotalCount > 0 ? (groupedPartialCount / groupedTotalCount) * 100 : 0}%` }}
          />
          <div
            className="h-3 bg-orange-500 transition-all"
            style={{
              width: `${groupedTotalCount > 0 ? (groupedPendingCount / groupedTotalCount) * 100 : 0}%`,
            }}
          />
          <div
            className="h-3 bg-red-500 transition-all"
            style={{ width: `${groupedTotalCount > 0 ? (groupedReturnedCount / groupedTotalCount) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
          <span className="text-emerald-600">مُسلَّم: {groupedDeliveredCount}</span>
          <span className="text-teal-600">جزئي: {groupedPartialCount}</span>
          <span className="text-orange-600">مؤجل: {groupedPostponedCount}</span>
          <span className="text-red-600">مُرتجَع: {groupedReturnedCount}</span>
        </div>
      </Card>

      {/* ─── Orders Table ─── */}
      <Card className="border-border bg-card overflow-visible print:break-inside-avoid">
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/10 transition-colors"
          onClick={() => setShowOrders(!showOrders)}
        >
          <h2 className="font-bold text-sm flex items-center gap-2 flex-wrap min-w-0">
              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="shrink-0">الطلبيات في البيان</span>
              <Badge variant="outline" className="text-[9px] shrink-0">
                {groupedManifestOrders.length}
              </Badge>
            {!isLocked && pendingOrders > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] border-amber-700 bg-amber-900/20 text-amber-400 shrink-0"
              >
                {pendingOrders} بانتظار التقفيل
              </Badge>
            )}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (showColFilters) {
                  setColFilters({ customer: new Set(), governorate: new Set(), product: new Set(), qty: new Set(), total: new Set(), date: new Set(), status: new Set() });
                  setSortCol(null);
                }
                setShowColFilters(v => !v);
              }}
              className={`flex h-7 items-center gap-1.5 px-2.5 rounded-lg border text-xs font-medium transition-all shrink-0 ${showColFilters ? "border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10" : "border-primary/40 text-primary bg-primary/5 hover:bg-primary/10"}`}
            >
              <svg viewBox="0 0 24 24" className="w-3 h-3" fill={showColFilters ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {showColFilters ? "إلغاء الفلتر" : "إنشاء فلتر"}
            </button>
            {showOrders ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {showOrders && (
          <>
            {manifest.orders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  لا توجد طلبيات
                </div>
              ) : (
                <>
                {/* ══ Selection Action Bar ══ */}
                {selectedGroups.size > 0 && (
                  <div dir="rtl" className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border-b border-primary/30 text-xs">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} className={someSelected ? "opacity-60" : ""} />
                    <span className="font-bold text-primary">
                      {selectedGroups.size} محدد من {allGroupKeys.length}
                    </span>
                    <div className="flex items-center gap-2 mr-auto">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] px-2.5 text-muted-foreground hover:text-foreground border border-border/50"
                        onClick={clearSelection}
                      >
                        <X className="w-3 h-3 ml-1" />
                        إلغاء التحديد
                      </Button>
                    </div>
                  </div>
                )}
                {/* ══ Search Bar ══ */}
                <div className="p-3 border-b border-border bg-muted/10 flex flex-col gap-2">
                  <div className="relative">
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input
                      value={manifestCustomerSearch}
                      onChange={e => setManifestCustomerSearch(e.target.value)}
                      placeholder="ابحث باسم العميل..."
                      className="w-full pr-9 pl-8 bg-card text-sm h-9 border border-primary/30 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60 font-medium"
                      dir="rtl"
                    />
                    {manifestCustomerSearch && (
                      <>
                        <button className="absolute left-9 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setManifestCustomerSearch("")}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          {displayGroups.length}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="relative">
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input
                      value={manifestProductSearch}
                      onChange={e => setManifestProductSearch(e.target.value)}
                      placeholder="ابحث بالمنتج أو الهاتف..."
                      className="w-full pr-9 bg-card text-sm h-9 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60"
                      dir="rtl"
                    />
                    {manifestProductSearch && (
                      <button className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setManifestProductSearch("")}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {/* ══ رأس الجدول المحسَّن ══ */}
                <div className="w-full">
                <div dir="rtl" className="grid grid-cols-[28px_minmax(0,1fr)_74px_64px_56px] md:grid-cols-[28px_90px_minmax(0,0.65fr)_88px_84px_minmax(0,1.65fr)_72px_64px_64px_100px_90px] gap-0 border-b-2 border-border bg-muted/20 text-[10px] font-bold text-muted-foreground tracking-wide
                  [&>*:not(:last-child)]:border-l [&>*]:border-border/30">
                  {/* ─── تحديد ─── */}
                  <div className="flex items-center justify-center h-9">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      className={someSelected ? "opacity-60" : ""}
                      aria-label="تحديد الكل"
                    />
                  </div>
                  {/* ─── اسم الراسل ─── */}
                  <div className="hidden md:flex items-center gap-1 px-1.5 h-9 overflow-hidden">
                    <Truck className="w-2.5 h-2.5 opacity-50 shrink-0" />
                    <span className="truncate">اسم الراسل</span>
                  </div>
                  {/* ─── اسم العميل ─── */}
                  <div className="relative flex items-center">
                    <div className="flex items-center justify-between w-full h-9 px-1.5 overflow-hidden">
                      <span className="font-bold truncate">اسم العميل</span>
                      {showColFilters && <ColFilterBtn col="customer" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                    </div>
                  </div>
                  {/* ─── رقم تليفون العميل ─── */}
                  <div className="flex items-center gap-1 px-1.5 h-9 overflow-hidden">
                    <span className="truncate">تليفون</span>
                  </div>
                  {/* ─── المحافظة ─── */}
                  <div className="flex items-center justify-between gap-1 px-1.5 h-9 overflow-hidden">
                    <div className="flex items-center gap-1 min-w-0">
                      <svg className="w-2.5 h-2.5 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span className="truncate">المحافظة</span>
                    </div>
                    {showColFilters && <ColFilterBtn col="governorate" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  </div>
                  {/* ─── العنوان التفصيلي ─── */}
                  <div className="hidden md:flex items-center gap-1 px-1.5 h-9 overflow-hidden">
                    <svg className="w-2.5 h-2.5 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h7"/></svg>
                    <span className="truncate">العنوان</span>
                  </div>
                  {/* ─── اجمالى سعر الشحنة (COD) ─── */}
                  <div className="flex flex-col justify-center gap-0.5 px-1.5 h-9 overflow-hidden">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold truncate">إجمالي</span>
                      {showColFilters && <ColFilterBtn col="total" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                    </div>
                  </div>
                  {/* ─── القيمة المستلمة (= سعر الشحنة) ─── */}
                  <div className="hidden md:flex items-center justify-center gap-1 px-1 h-9 overflow-hidden">
                    <span className="truncate">مستلم</span>
                  </div>
                  {/* ─── تكلفة الشحن (المندوب) ─── */}
                  <div className="flex items-center justify-center gap-1 px-1 h-9 text-amber-500 overflow-hidden">
                    <span className="truncate">شحن</span>
                  </div>
                  {/* ─── حالة الاوردر ─── */}
                  <div className="flex items-center gap-1 px-1.5 h-9 overflow-hidden">
                    <span className="shrink-0 truncate">الحالة</span>
                    {showColFilters && <ColFilterBtn col="status" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  </div>
                  {/* ─── ملاحظات ─── */}
                  <div className="hidden md:flex items-center gap-1 px-1.5 h-9 overflow-hidden">
                    <span className="truncate">ملاحظات</span>
                  </div>
                </div>
                {displayGroups.length === 0 && colFilterHasActive ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>لا توجد نتائج للبحث</p>
                    <button
                      onClick={() => { setCustomerSearch(""); clearAllColFilters(); }}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      مسح كل الفلاتر
                    </button>
                  </div>
                ) : (
                  <div key={customerSearch}>
                  {displayGroups.map((group, index) => (
                  <InvoiceGroupDeliveryRow
                    key={group.map((order) => `${order.id}-${order.deliveryStatus}-${order.partialQuantity ?? 0}-${order.deliveryNote ?? ""}`).join("|")}
                    group={group}
                    manifestId={id}
                    locked={isLocked && !isAdmin}
                    onSaved={refetch}
                    rowIndex={index}
                    selected={selectedGroups.has(getManifestGroupKey(group[0]))}
                    onToggleSelect={toggleGroup}
                    isShipmentManifest={true}
                    courierShippingCost={rawManifest?.company?.shippingCost != null ? Number(rawManifest.company.shippingCost) : null}
                  />
                  ))}
                  </div>
                )}
                </div>{/* end table container */}
              </>
            )}
          </>
        )}
      </Card>

      {/* ─── حاوية المرتجعات والجزئي لسه عند شركة الشحن ─── */}
      {(() => {
        const pendingReturnOrders = (manifest.orders ?? []).filter(o =>
          (o.deliveryStatus === "returned" || o.deliveryStatus === "partial_received" || o.deliveryStatus === "partial_delivered") &&
          (o as any).returnReceived !== 1
        );
        if (pendingReturnOrders.length === 0) return null;
        return (
          <div
            className="rounded-xl border-2 border-red-500/70 bg-red-950/30 p-4 print:hidden"
            style={{ boxShadow: "0 0 30px 6px rgba(239,68,68,0.4), 0 0 60px 10px rgba(239,68,68,0.15), inset 0 0 20px 2px rgba(239,68,68,0.05)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🚚</span>
              <h2 className="font-bold text-sm text-red-400">
                بضاعة لسه عند شركة الشحن ({pendingReturnOrders.length})
              </h2>
              <span className="text-[10px] text-red-400/60">— اضغط "تم الاستلام" لما توصلك من الشركة</span>
            </div>
            <div className="flex flex-col gap-2">
              {pendingReturnOrders.map(order => {
                const isPartial = order.deliveryStatus === "partial_received" || order.deliveryStatus === "partial_delivered";
                const deliveredAmount = order.partialQuantity ?? 0; // partialQuantity قيمة مالية دايمًا
                const totalAmount = order.totalPrice ?? 0;
                const remainingAmount = isPartial ? Math.max(totalAmount - deliveredAmount, 0) : order.quantity;
                const rr = (order as any).returnReceived;
                const isAtShipping = rr === 0 || rr === null;
                return (
                  <div
                    key={order.id}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-lg border border-red-800/30 bg-red-950/30 px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-xs truncate text-foreground">{order.customerName}</span>
                        {order.phone && (
                          <span className="text-[10px] text-muted-foreground">{order.phone}</span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isPartial ? "bg-teal-900/40 text-teal-400" : "bg-red-900/40 text-red-400"}`}>
                          {isPartial ? "جزئي" : "مرتجع"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {order.product}
                        {(order.color || order.size) && ` — ${[order.color, order.size].filter(Boolean).join(" / ")}`}
                      </p>
                      <p className="text-[10px] font-semibold text-red-400 mt-0.5">
                        {isPartial
                          ? `باقي عند الشحن: ${formatCurrency(remainingAmount)} من ${formatCurrency(totalAmount)}`
                          : `كمية مرتجعة: ${order.quantity}`}
                      </p>
                    </div>
                    <div className="flex gap-1.5 w-full sm:w-auto sm:shrink-0">
                      <ReturnReceivedButton
                        manifestId={id}
                        order={order}
                        received={true}
                        onSaved={refetch}
                        locked={isLocked}
                      />
                      <ReturnReceivedButton
                        manifestId={id}
                        order={order}
                        received={false}
                        onSaved={refetch}
                        locked={isLocked}
                        currentlyAtShipping={isAtShipping}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── P&L Summary for shipment manifests ─── */}
      {canViewFinancials && (() => {
        // الحسابات المالية بتعتمد بس على deliveryStatus/returnReason، وميتأثرش
        // بـ returnReceived (تم الاستلام) خالص — "تم الاستلام" بترجع الأوردر
        // للمخزن فقط ومتغيرش أي رقم مالي: الأرقام قبلها وبعدها لازم تفضل واحدة.
        const ordersForPnl = (manifest.orders ?? []);
        const deliveredOrders = ordersForPnl.filter(o => o.deliveryStatus === "delivered" || o.deliveryStatus === "partial_delivered" || o.deliveryStatus === "partial_received");
        const returnedOrders  = ordersForPnl.filter(o => o.deliveryStatus === "returned");
        // سعر المنطقة = سعر أول منطقة مرتبطة بشركة الشحن (نفس مصدر صافي الربح الحقيقي فوق)
        const companyAnyPnl = (rawManifest as any)?.company;
        // تكلفة الشحن = مجموع رسوم شحن الطلبيات (مسلَّم / مسلَّم جزئي / استلام جزئي / مرتجع مع دفع رسوم الشحن فقط)
        // pending/delayed لا تُحسب أبدًا (صفر) حتى تتغيّر حالتها فعليًا
        const courierShippingCostForCalc = companyAnyPnl?.shippingCost != null ? Number(companyAnyPnl.shippingCost) : 0;
        // أسباب المرتجع اللي بتدخل في الحسابات المالية (شحن فعليًا اتنفذ رغم الرفض/الهروب)
        const RETURN_REASONS_IN_PNL = ["refused_paid", "refused_unpaid", "quality"] as const;
        // إجمالي الإيرادات = القيمة المستلمة فعليًا (نفس عمود "مستلم" في الجدول)
        // مسلَّم بالكامل = السعر الكامل، مسلَّم جزئي = القيمة المستلمة من العميل المُدخلة مباشرة
        // مرتجع (الثلاث أسباب) = القيمة اللي أدخلها المندوب يدويًا (returnValueReceived) — صفر لو لسه ماتسجّلش
        const deliveredCOD    = deliveredOrders.reduce((s, o) => {
          if (o.deliveryStatus === "partial_delivered" && (o as any).partialQuantity != null) {
            return s + Number((o as any).partialQuantity);
          }
          if (o.deliveryStatus === "partial_received" && (o as any).partialQuantity != null) {
            return s + Number((o as any).unitPrice) * Number((o as any).partialQuantity);
          }
          // مسلَّم بالكامل: القيمة الفعلية المستلمة لو المندوب دخلها (زيادة أو نقص)، وإلا الإجمالي العادي
          const dvr = (o as any).deliveredValueReceived;
          return s + (dvr != null ? Number(dvr) : Number(o.totalPrice ?? 0));
        }, 0) + ordersForPnl
          .filter(o => o.deliveryStatus === "returned" && RETURN_REASONS_IN_PNL.includes((o as any).returnReason))
          .reduce((s, o) => s + Number((o as any).returnValueReceived ?? 0), 0);
        const returnedCOD     = returnedOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
        const shippingCostOrders = ordersForPnl.filter(o =>
          o.deliveryStatus === "delivered" ||
          o.deliveryStatus === "partial_delivered" ||
          o.deliveryStatus === "partial_received" ||
          (o.deliveryStatus === "returned" && RETURN_REASONS_IN_PNL.includes((o as any).returnReason))
        );
        const shippingCostGroupsCount = groupManifestOrders(shippingCostOrders).length;
        const shippingCost    = courierShippingCostForCalc * shippingCostGroupsCount;
        let pnlZoneIds: number[] = [];
        if (companyAnyPnl?.zoneIds) {
          try { pnlZoneIds = JSON.parse(companyAnyPnl.zoneIds); } catch {}
        } else if (companyAnyPnl?.zoneId) {
          pnlZoneIds = [companyAnyPnl.zoneId];
        }
        // سعر الشحنة = مجموع "سعر الشحنة" الفعلي المسجَّل على كل شحنة (shippingCost/shippingFee)
        // لنفس مجموعة الطلبات اللي دخلت في حساب تكلفة الشحن (مسلَّم / جزئي / مرتجع بأسباب الثلاثة)
        const zonePricePnl = shippingCostOrders.reduce((s, o) => s + Number((o as any).shippingCost ?? 0), 0);
        // صافي الربح الحقيقي = سعر الشحنة (من جدول الشحنات) - إجمالي تكلفة الشحن
        const netAmount       = zonePricePnl - shippingCost;
        const isProfit        = netAmount >= 0;
        // الرصيد المستحق من المندوب = إجمالي الإيرادات - إجمالي تكلفة الشحن
        const totalDueToCourier = deliveredCOD - shippingCost;
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 print:hidden">
            <Card className="border-emerald-900/40 bg-emerald-900/10 p-4">
              <p className="text-xs text-emerald-400 mb-1">إجمالي الإيرادات</p>
              <p className="text-lg font-black text-emerald-400">{formatCurrency(deliveredCOD)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{deliveredOrders.length} شحنة</p>
            </Card>
            <Card className="border-amber-900/40 bg-amber-900/10 p-4">
              <p className="text-xs text-amber-400 mb-1">إجمالي تكلفة الشحن</p>
              <p className="text-lg font-black text-amber-400">{formatCurrency(shippingCost)}</p>
            </Card>
            <Card className="border-sky-900/40 bg-sky-900/10 p-4">
              <p className="text-xs text-sky-400 mb-1">الرصيد المستحق من المندوب</p>
              <p className="text-lg font-black text-sky-400">{formatCurrency(totalDueToCourier)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{deliveredOrders.length} شحنة</p>
            </Card>
            <Card className={`col-span-2 border overflow-hidden transition-all duration-300 ${isProfit ? "border-emerald-900/50 bg-emerald-900/10" : "border-red-900/50 bg-red-900/10"}`}>
              <button
                type="button"
                onClick={() => setNetDueOpen(v => !v)}
                className="w-full flex items-center justify-between p-4 text-right"
              >
                <p className={`text-xs mb-0 font-bold flex items-center gap-1.5 ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                  {netDueOpen ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  صافي الربح الحقيقي
                </p>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${netDueOpen ? "rotate-180" : ""}`} />
              </button>
              <div className={`grid transition-all duration-300 ease-in-out ${netDueOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="flex items-center justify-between px-4 pb-1">
                    <p className={`text-2xl font-black ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                      {formatCurrency(Math.abs(netAmount))}
                    </p>
                    {isProfit
                      ? <TrendingUp className="w-10 h-10 text-emerald-400 opacity-30" />
                      : <TrendingDown className="w-10 h-10 text-red-400 opacity-30" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground px-4 pb-4">
                    {formatCurrency(zonePricePnl)} سعر الشحنة − {formatCurrency(shippingCost)} إجمالي تكلفة الشحن
                  </p>
                </div>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* ─── Close Confirm Dialog ─── */}
      {showCloseDialog && (
        <CloseConfirmDialog
          manifest={manifest}
          onClose={() => setShowCloseDialog(false)}
          onConfirm={() => updateMutation.mutate({ status: "closed" })}
          loading={updateMutation.isPending}
        />
      )}

      {/* ─── Rollover Dialog — بيان جديد اتنشأ ─── */}
      {showRolloverDialog && (
        <AlertDialog open onOpenChange={() => setShowRolloverDialog(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="w-5 h-5" />
                تم إغلاق البيان وإنشاء بيان جديد
              </AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-3">
                <span className="block text-foreground font-medium text-sm">
                  تم إنشاء البيان <strong className="text-emerald-400">{showRolloverDialog.manifestNumber}</strong> تلقائياً
                </span>
                <span className="block text-muted-foreground text-xs">
                  يحتوي على <strong>{showRolloverDialog.orderCount}</strong> طلبية مرحَّلة{showRolloverDialog.breakdown && <span className="text-amber-400"> {showRolloverDialog.breakdown}</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  هل تريد الانتقال للبيان الجديد الآن؟
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowRolloverDialog(null)}>لاحقاً</AlertDialogCancel>
              <AlertDialogAction
                className="bg-emerald-700 hover:bg-emerald-600 text-white gap-1"
                onClick={() => { window.location.href = `/shipping/shipment-manifests/${showRolloverDialog.id}`; }}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                انتقل للبيان الجديد
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ─── Reopen Confirm Dialog — أدمن فقط ─── */}
      <AlertDialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
              <Unlock className="w-5 h-5" />
              تأكيد إعادة فتح البيان
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <span className="block">
                هل تريد إعادة فتح البيان <strong className="text-foreground">{manifest.manifestNumber}</strong>؟
              </span>
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                ⚠ هذا الإجراء متاح للأدمن فقط. بعد الفتح يمكن تعديل حالات التسليم مجدداً.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-500 text-white gap-1"
              onClick={() => {
                setShowReopenDialog(false);
                updateMutation.mutate({ status: "open" });
              }}
              disabled={updateMutation.isPending}
            >
              <Unlock className="w-3.5 h-3.5" />
              نعم، افتح البيان
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Add Orders Dialog ─── */}
      {showExportDialog && manifest && (
        <ExportDialog
          manifest={manifest}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {showAddOrdersDialog && manifest && rawManifest && (
        <AddOrdersToManifestDialog
          manifestId={id}
          manifestNumber={manifest.manifestNumber}
          companyId={rawManifest.shippingCompanyId}
          existingOrderIds={new Set(manifest.orders.map(o => o.shipmentId ?? o.id))}
          onClose={() => setShowAddOrdersDialog(false)}
          onAdded={refetch}
        />
      )}

      {/* ─── Delete Dialog ─── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف البيان</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف بيان الشحن {manifest.manifestNumber}؟ لن يتم
              حذف الطلبيات المرتبطة به.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "نعم، احذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

    {/* ══════════════ PREVIEW MODAL ══════════════ */}
    {showPreview && createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/70 overflow-y-auto py-6"
        onClick={(e) => { if (e.target === e.currentTarget) setShowPreview(false); }}
      >
        <div className="bg-white rounded-xl shadow-2xl w-[210mm] max-w-[96vw] relative">
          {/* شريط التحكم */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800 rounded-t-xl sticky top-0 z-10">
            <span className="text-white text-sm font-bold">معاينة قبل الطباعة — {manifest.manifestNumber}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowPreview(false); handlePrint(); }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-white text-xs font-bold hover:bg-primary/90"
              >
                <Printer className="w-3.5 h-3.5" />طباعة
              </button>
              <button
                onClick={() => setShowPreview(false)}
                className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-700 text-slate-300 hover:bg-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* المحتوى — iframe بيعرض نفس HTML الطباعة */}
          <iframe
            className="w-full rounded-b-xl border-0"
            style={{ height: "80vh" }}
            srcDoc={(() => {
              const el = document.querySelector(".manifest-print") as HTMLElement | null;
              const html = el?.innerHTML ?? "";
              return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', Arial, sans-serif; font-size: 10pt; color: #111; background: #fff; direction: rtl; padding: 8mm 10mm; }
    .mp-header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #1e3a5f; padding-bottom:3mm; margin-bottom:3mm; }
    .mp-header-left { flex:1; }
    .mp-header-right { display:flex; align-items:center; gap:3mm; flex-direction:row; flex-shrink:0; }
    .mp-stark-brand { display:flex; align-items:baseline; gap:2mm; margin-bottom:1.5mm; }
    .mp-stark-name { font-size:15pt; font-weight:900; letter-spacing:3px; color:#0f172a; background:linear-gradient(90deg,#0f172a,#1e3a5f); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
    .mp-stark-tagline { font-size:6.5pt; font-weight:700; letter-spacing:2px; color:#c9a24b; border-left:2px solid #c9a24b; padding-left:2mm; }
    .mp-title { font-size:18pt; font-weight:900; color:#1e3a5f; line-height:1.1; }
    .mp-meta { font-size:9pt; color:#555; margin-top:1.5mm; line-height:1.7; }
    .mp-badge { display:inline-block; margin-top:2mm; padding:1mm 4mm; border-radius:10mm; font-size:8pt; font-weight:800; }
    .mp-badge-open { background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd; }
    .mp-badge-closed { background:#dcfce7; color:#15803d; border:1px solid #86efac; }
    .mp-company-name { font-size:16pt; font-weight:900; color:#1e3a5f; letter-spacing:1px; }
    .mp-company-sub { font-size:7pt; color:#94a3b8; letter-spacing:2px; margin-top:0.5mm; }
    .mp-logo { width:16mm; height:16mm; border-radius:50%; object-fit:cover; border:2px solid #e2e8f0; }
    .mp-stats { display:grid; grid-template-columns:repeat(6,1fr); border:2.5px solid #1e3a5f; border-radius:2mm; overflow:hidden; margin-bottom:4mm; }
    .mp-stat { padding:2.5mm 2mm; text-align:center; border-left:2px solid #94a3b8; background:#f8fafc; }
    .mp-stat:last-child { border-left:none; }
    .mp-stat-delivered { background:#f0fdf4; } .mp-stat-returned { background:#fff1f2; }
    .mp-stat-postponed { background:#fffbeb; } .mp-stat-partial { background:#f0fdfa; }
    .mp-stat-lbl { font-size:8pt; color:#64748b; margin-bottom:1mm; font-weight:700; }
    .mp-stat-val { font-size:14pt; font-weight:900; color:#111; }
    .mp-stat-delivered .mp-stat-val { color:#15803d; } .mp-stat-returned .mp-stat-val { color:#dc2626; }
    .mp-stat-postponed .mp-stat-val { color:#b45309; } .mp-stat-partial .mp-stat-val { color:#0f766e; }
    .mp-table { width:100%; border-collapse:collapse; margin-bottom:3mm; font-size:9.5pt; border:2.5px solid #1e3a5f; }
    .mp-table thead tr { background:#1e3a5f; }
    .mp-table th { color:#fff; font-size:9pt; font-weight:700; padding:2.5mm 3mm; text-align:right; border:2px solid rgba(255,255,255,0.5); }
    .mp-table td { padding:2.5mm 3mm; border:2px solid #94a3b8; vertical-align:middle; line-height:1.5; }
    .mp-row-alt td { background:#f0f4f8; }
    .mp-td-center { text-align:center; } .mp-td-bold { font-weight:700; } .mp-td-ltr { direction:ltr; text-align:right; }
    .mp-num { color:#94a3b8; font-size:8pt; } .mp-sub { font-size:7.5pt; color:#94a3b8; margin-top:0.5mm; }
    .mp-note { font-size:8pt; color:#6b7280; }
    .st-d { color:#15803d; font-weight:800; background:#dcfce7; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    .st-r { color:#dc2626; font-weight:800; background:#fee2e2; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    .st-p { color:#b45309; font-weight:800; background:#fef3c7; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    .st-x { color:#0f766e; font-weight:800; background:#ccfbf1; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    .st-n { color:#64748b; background:#f1f5f9; padding:0.5mm 2.5mm; border-radius:1mm; font-size:8.5pt; white-space:nowrap; }
    .mp-totals { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; margin-bottom:4mm; }
    .mp-total-card { border:2.5px solid #94a3b8; border-radius:2mm; padding:3mm 4mm; text-align:center; background:#f8fafc; }
    .mp-total-highlight { background:#f0fdf4; border-color:#15803d; }
    .mp-total-lbl { font-size:8pt; color:#64748b; margin-bottom:1mm; font-weight:700; }
    .mp-total-val { font-size:13pt; font-weight:900; color:#111; }
    .mp-total-orange { color:#d97706; } .mp-total-green { color:#15803d; } .mp-total-blue { color:#1d4ed8; }
    .mp-footer { border-top:1.5px solid #e2e8f0; padding-top:4mm; margin-top:5mm; display:flex; justify-content:space-between; align-items:flex-end; }
    .mp-watermark { font-size:7.5pt; color:#cbd5e1; text-align:center; }
    .mp-sig { min-width:50mm; text-align:center; }
    .mp-sig-title { font-size:9pt; color:#64748b; margin-bottom:8mm; font-weight:700; }
    .mp-sig-line { border-top:1.5px solid #333; width:80%; margin:0 auto; }
    .mp-sig-name { font-size:8pt; color:#555; margin-top:2mm; }
  </style>
</head>
<body>${html}</body>
</html>`;
            })()}
            title="معاينة"
          />
        </div>
      </div>,
      document.body
    )}

    </>
  );
}
