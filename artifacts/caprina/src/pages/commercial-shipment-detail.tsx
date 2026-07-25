import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { shipmentsApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Truck, Package, CheckCircle2, RotateCcw, Clock,
  TrendingUp, TrendingDown, FileText, Calendar, User, MapPin,
  Phone, DollarSign, Send, Hourglass,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const formatCurrency = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency", currency: "EGP", maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// ─── حالة الشحنة — تسمية ولون زي باقي النظام ─────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  waiting: "انتظار", confirmed: "مؤكد", picked_up: "تم الاستلام",
  warehouse_ready: "جاهز للشحن", in_transit: "قيد الشحن", in_shipping: "في الشحن",
  out_for_delivery: "خرج للتسليم", delivered: "مسلَّم", received: "مستلم",
  partial_received: "استلام جزئي", delayed: "مؤجل",
  returned: "مرتجع", cancelled: "ملغي",
};
const STATUS_COLORS: Record<string, string> = {
  waiting:           "border-amber-700 bg-amber-900/20 text-amber-400",
  confirmed:         "border-blue-700 bg-blue-900/20 text-blue-400",
  picked_up:         "border-indigo-700 bg-indigo-900/20 text-indigo-400",
  warehouse_ready:   "border-purple-700 bg-purple-900/20 text-purple-400",
  in_transit:        "border-cyan-700 bg-cyan-900/20 text-cyan-400",
  in_shipping:       "border-cyan-700 bg-cyan-900/20 text-cyan-400",
  out_for_delivery:  "border-sky-700 bg-sky-900/20 text-sky-400",
  delivered:         "border-emerald-700 bg-emerald-900/20 text-emerald-400",
  received:          "border-emerald-700 bg-emerald-900/20 text-emerald-400",
  partial_received:  "border-teal-700 bg-teal-900/20 text-teal-400",
  delayed:           "border-violet-700 bg-violet-900/20 text-violet-400",
  returned:          "border-red-700 bg-red-900/20 text-red-400",
  cancelled:         "border-red-700 bg-red-900/20 text-red-400",
};

const isDelivered = (s: string) => s === "delivered" || s === "received";
const isReturned  = (s: string) => s === "returned" || s === "cancelled";

export default function CommercialShipmentDetailPage() {
  const params = useParams();
  const shipmentId = Number(params.id);

  const { data: shipment, isLoading } = useQuery({
    queryKey: ["commercial-shipment-detail", shipmentId],
    queryFn: () => shipmentsApi.get(shipmentId),
    enabled: !isNaN(shipmentId),
  });

  if (isNaN(shipmentId)) {
    return <div className="p-8 text-center text-muted-foreground">معرّف غير صحيح</div>;
  }

  if (isLoading || !shipment) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-muted-foreground text-sm animate-pulse" dir="rtl">
        جاري التحميل...
      </div>
    );
  }

  const status      = shipment.status;
  const delivered   = isDelivered(status);
  const returned    = isReturned(status);
  const pending     = !delivered && !returned;

  const cod         = Number(shipment.codAmount ?? 0);
  const shippingFee = Number(shipment.shippingFee ?? 0);
  const collected   = Number(shipment.collectedAmount ?? 0);
  // صافي المستحق للتاجر = المحصَّل - رسوم الشحن (لو اتسلمت)
  const netDue      = delivered ? collected - shippingFee : 0;

  // ─── نسبة التسليم — إما 100% (مسلَّم) أو 0% (غير ذلك) لشحنة مفردة ─────────
  const deliveryRate = delivered ? 100 : 0;

  const colorClass = STATUS_COLORS[status] ?? "border-border bg-card text-muted-foreground";

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-border shrink-0" onClick={() => window.history.back()}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border">
            <Truck className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold font-mono truncate">{shipment.shipmentNumber}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><User className="w-3 h-3" />{shipment.receiverName}</span>
              {shipment.receiverPhone && (
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{shipment.receiverPhone}</span>
              )}
              {shipment.receiverCity && (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{shipment.receiverCity}</span>
              )}
            </div>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] font-bold border shrink-0 ${colorClass}`}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
      </div>

      {/* ─── KPI Cards — زي صفحة البيان بالظبط ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">حالة الشحنة</p>
          <p className="text-sm font-black">{STATUS_LABELS[status] ?? status}</p>
          <p className="text-[10px] text-muted-foreground">
            {format(new Date(shipment.createdAt), "yyyy/MM/dd")}
          </p>
        </Card>
        <Card className="border-emerald-900/40 bg-emerald-900/10 p-3 text-center">
          <p className="text-[10px] text-emerald-400 mb-0.5 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3" />مُسلَّم
          </p>
          <p className="text-2xl font-black text-emerald-400">{delivered ? 1 : 0}</p>
        </Card>
        <Card className="border-red-900/40 bg-red-900/10 p-3 text-center">
          <p className="text-[10px] text-red-400 mb-0.5 flex items-center justify-center gap-1">
            <RotateCcw className="w-3 h-3" />مُرتجَع
          </p>
          <p className="text-2xl font-black text-red-400">{returned ? 1 : 0}</p>
        </Card>
        <Card className={`p-3 text-center border ${netDue >= 0 ? "border-primary/30 bg-primary/5" : "border-red-900/40 bg-red-900/10"}`}>
          <p className="text-[10px] text-muted-foreground mb-0.5">صافي المستحق</p>
          <p className={`text-lg font-black ${netDue >= 0 ? "text-primary" : "text-red-400"}`}>
            {delivered ? formatCurrency(Math.abs(netDue)) : "—"}
          </p>
          <p className="text-[10px] flex items-center justify-center gap-0.5 text-muted-foreground">
            {delivered ? (
              netDue >= 0
                ? <><TrendingUp className="w-3 h-3 text-emerald-400" />صافي ربح</>
                : <><TrendingDown className="w-3 h-3 text-red-400" />خصم زائد</>
            ) : "لم تُسلَّم بعد"}
          </p>
        </Card>
      </div>

      {/* ─── نسبة التسليم ─── */}
      <Card className="border-border bg-card p-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-bold">نسبة التسليم</p>
          <p className="text-sm font-black text-emerald-400">{deliveryRate}%</p>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${deliveryRate}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
          <span>مرتجع: {returned ? 1 : 0}</span>
          <span>معلَّق: {pending ? 1 : 0}</span>
          <span>مسلَّم: {delivered ? 1 : 0}</span>
        </div>
      </Card>

      {/* ─── فاتورة الشحنة ─── */}
      <Card className="border-border bg-card p-4">
        <p className="text-xs font-bold flex items-center gap-1.5 mb-3">
          <FileText className="w-3.5 h-3.5 text-primary" />فاتورة الشحنة
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-background/40 p-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">قيمة البضاعة (COD)</p>
            <p className="text-sm font-black">{formatCurrency(cod)}</p>
          </div>
          <div className="rounded-lg bg-background/40 p-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">رسوم الشحن</p>
            <p className="text-sm font-black text-amber-400">{formatCurrency(shippingFee)}</p>
          </div>
          <div className="rounded-lg bg-background/40 p-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">الإجمالي</p>
            <p className="text-sm font-black text-primary">{formatCurrency(shipment.totalAmount)}</p>
          </div>
        </div>
      </Card>

      {/* ─── بيان تسوية الحساب ─── */}
      <Card className="border-border bg-card p-4 space-y-2">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />بيان التسوية — الحساب مع شركة الشحن
        </p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-background/40 p-2.5">
            <p className="text-[10px] text-muted-foreground">إجمالي المحصَّل</p>
            <p className="text-sm font-black text-emerald-400">
              {delivered ? formatCurrency(collected) : "لم يُحصَّل بعد"}
            </p>
          </div>
          <div className="rounded-lg bg-background/40 p-2.5">
            <p className="text-[10px] text-muted-foreground">صافي المستحق لك</p>
            <p className="text-sm font-black">
              {delivered ? formatCurrency(netDue) : "—"}
            </p>
          </div>
        </div>
        {shippingFee > 0 && (
          <div className="flex justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
            <span>رسوم شحن مخصومة</span>
            <span className="text-red-400 font-bold">-{formatCurrency(shippingFee)}</span>
          </div>
        )}
      </Card>

      {/* ─── معلومات الشحنة ─── */}
      <Card className="border-border bg-card p-4 space-y-3">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-muted-foreground" />تفاصيل الشحنة
        </p>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">شركة الشحن</p>
            <p className="font-bold">{shipment.shippingCompanyName ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">المندوب المسؤول</p>
            <p className="font-bold">{shipment.assignedUserName ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
            <p className="font-bold flex items-center gap-1">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              {format(new Date(shipment.createdAt), "yyyy/MM/dd", { locale: ar })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">آخر تحديث</p>
            <p className="font-bold flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              {format(new Date(shipment.updatedAt), "yyyy/MM/dd", { locale: ar })}
            </p>
          </div>
          {shipment.receiverAddress && (
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">عنوان التسليم</p>
              <p className="font-bold">{shipment.receiverAddress}</p>
            </div>
          )}
          {shipment.notes && (
            <div className="col-span-2 pt-2 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground mb-0.5">ملاحظات</p>
              <p className="font-bold">{shipment.notes}</p>
            </div>
          )}
        </div>
      </Card>

      {/* ─── حالة معلّقة — تنبيه ─── */}
      {pending && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs flex items-center gap-1.5 text-amber-400">
            <Hourglass className="w-3.5 h-3.5" />
            الشحنة لسه في حالة "{STATUS_LABELS[status] ?? status}" — المبلغ المستحق سيظهر بعد التسليم.
          </p>
        </Card>
      )}

      {/* ─── رابط لتفاصيل الشحنة الكاملة (تعديل/منتجات) ─── */}
      <div className="flex justify-center pt-2">
        <Link href={`/shipments/${shipment.id}`}>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border text-muted-foreground hover:text-foreground">
            <Send className="w-3.5 h-3.5" />
            عرض تفاصيل الشحنة الكاملة (تعديل / منتجات)
          </Button>
        </Link>
      </div>
    </div>
  );
}
