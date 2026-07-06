import { useParams, Link, useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight, User, Phone, MapPin, Lock, Package,
  CheckCircle2, RotateCcw, TrendingUp, TrendingDown, Loader2,
  Calendar, ChevronRight, FileSpreadsheet, Printer, Wallet, Send,
} from "lucide-react";
import { format } from "date-fns";

const fmt = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

type ClientOrder = {
  id: number;
  customerName: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  totalPrice: number;
  shippingCost: number;
  collectedAmount: number | null;
  status: string;
  product: string;
  invoiceNumber: string | null;
  createdAt: string;
  notes: string | null;
};

type CardStats = {
  total: number; delivered: number; returned: number;
  netProfit: number; totalCollected: number; totalShipping: number;
};

type Closure = {
  id: number;
  clientName: string;
  ordersCount: number;
  totalShippingValue: string;
  totalCollected: string;
  totalShippingFee: string;
  notes: string | null;
  closedByName: string | null;
  createdAt: string;
};

type SummaryResponse = {
  client: { id: number; name: string; phone: string | null; city: string | null; address: string | null };
  cardStats: CardStats;
  currentCycleOrders: ClientOrder[];
  lastClosedAt: string | null;
  closures: Closure[];
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  waiting:           { label: "انتظار",        color: "text-amber-400",   bg: "bg-amber-900/20",   border: "border-amber-700" },
  confirmed:         { label: "مؤكدة",         color: "text-teal-400",    bg: "bg-teal-900/20",    border: "border-teal-700" },
  picked_up:         { label: "تم الاستلام",    color: "text-sky-400",     bg: "bg-sky-900/20",     border: "border-sky-700" },
  in_transit:        { label: "في الطريق",      color: "text-sky-400",     bg: "bg-sky-900/20",     border: "border-sky-700" },
  out_for_delivery:  { label: "خرجت للتسليم",   color: "text-blue-400",    bg: "bg-blue-900/20",    border: "border-blue-700" },
  delayed:           { label: "مؤجل",           color: "text-orange-400",  bg: "bg-orange-900/20",  border: "border-orange-700" },
  delivered:         { label: "تم التسليم",     color: "text-emerald-400", bg: "bg-emerald-900/20", border: "border-emerald-700" },
  returned:          { label: "مرتجع",          color: "text-red-400",    bg: "bg-red-900/20",     border: "border-red-700" },
  cancelled:         { label: "ملغي",           color: "text-slate-400",   bg: "bg-slate-900/20",   border: "border-slate-700" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border" };
  return (
    <Badge variant="outline" className={`text-[10px] ${cfg.border} ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </Badge>
  );
}

function OrderRow({ o }: { o: ClientOrder }) {
  return (
    <div className="flex items-stretch gap-0 rounded-lg border border-border bg-card/50">
      <div className={`w-1 rounded-r-lg shrink-0 ${o.status === "delivered" ? "bg-emerald-500" : o.status === "returned" || o.status === "cancelled" ? "bg-red-500" : "bg-blue-500"}`} />
      <div className="flex-1 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-sm">{o.invoiceNumber ?? `#${o.id}`}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" />{o.customerName}</span>
              {o.city && <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{o.city}</span>}
              <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" />{format(new Date(o.createdAt), "yyyy/MM/dd")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={o.status} />
            {o.collectedAmount != null && (
              <span className="text-xs font-bold text-primary">{fmt(o.collectedAmount)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClosureRow({ c }: { c: Closure }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md bg-muted/20 border border-border/40 overflow-hidden">
      <div
        className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <p className="text-xs font-bold flex items-center gap-1.5">
            إقفال #{c.id}
            <Badge variant="outline" className="text-[9px] font-bold border-emerald-700 bg-emerald-900/20 text-emerald-400">
              <Lock className="w-2.5 h-2.5 inline ml-0.5" />مغلق
            </Badge>
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {format(new Date(c.createdAt), "yyyy/MM/dd")} · {c.ordersCount} طلبية
          </p>
        </div>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
      </div>
      {expanded && (
        <div className="border-t border-border/40 p-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-[10px] text-muted-foreground">المحصَّل</p>
            <p className="font-bold">{fmt(c.totalCollected)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">قيمة الشحن</p>
            <p className="font-bold">{fmt(c.totalShippingFee)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">صافي الربح</p>
            <p className="font-bold text-primary">{fmt(Number(c.totalCollected) - Number(c.totalShippingFee))}</p>
          </div>
          {c.notes && <p className="col-span-3 text-muted-foreground mt-1">{c.notes}</p>}
          {c.closedByName && <p className="col-span-3 text-[10px] text-muted-foreground">أُغلق بواسطة: {c.closedByName}</p>}
        </div>
      )}
    </div>
  );
}

export default function ClientAccountClientPage() {
  const params = useParams();
  const clientId = Number(params.clientId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");

  const { data, isLoading } = useQuery<SummaryResponse>({
    queryKey: ["client-account-client-summary", clientId],
    queryFn: () => apiFetch<SummaryResponse>(`/client-account-sheet/client/${clientId}/summary`),
    enabled: !isNaN(clientId),
  });

  const closeMutation = useMutation({
    mutationFn: () => apiFetch(`/client-account-sheet/client/${clientId}/close`, {
      method: "POST",
      body: JSON.stringify({ notes: closeNotes.trim() || undefined }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-account-client-summary", clientId] });
      toast({ title: "تم إقفال الحساب بنجاح" });
      setShowCloseDialog(false);
      setCloseNotes("");
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  if (isNaN(clientId)) return <div className="p-8 text-center text-muted-foreground">معرّف غير صحيح</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/finance/client-account-sheet">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-border">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border">
            <User className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{data?.client?.name ?? "…"}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {data?.client?.phone && (
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{data.client.phone}</span>
              )}
              {data?.client?.city && (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{data.client.city}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 print:hidden">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" />طباعة
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1 bg-red-600 hover:bg-red-700 text-white font-bold"
            onClick={() => setShowCloseDialog(true)}
            disabled={!data || data.currentCycleOrders.length === 0}
          >
            <Lock className="w-3.5 h-3.5" />قفل الحساب
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="py-12 text-center text-muted-foreground text-sm animate-pulse">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />جاري التحميل...
        </div>
      )}

      {!isLoading && data && (
        <>
          {/* ─── Stats Cards ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي الطلبيات</p>
              <p className="text-2xl font-black">{data.cardStats.total}</p>
              <p className="text-[10px] text-muted-foreground">الدورة الحالية</p>
            </Card>
            <Card className="border-emerald-900/40 bg-emerald-900/10 p-3 text-center">
              <p className="text-[10px] text-emerald-400 mb-0.5 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" />مُسلَّم
              </p>
              <p className="text-2xl font-black text-emerald-400">{data.cardStats.delivered}</p>
            </Card>
            <Card className="border-red-900/40 bg-red-900/10 p-3 text-center">
              <p className="text-[10px] text-red-400 mb-0.5 flex items-center justify-center gap-1">
                <RotateCcw className="w-3 h-3" />مُرتجَع
              </p>
              <p className="text-2xl font-black text-red-400">{data.cardStats.returned}</p>
            </Card>
            <Card className={`p-3 text-center border ${data.cardStats.netProfit >= 0 ? "border-primary/30 bg-primary/5" : "border-red-900/40 bg-red-900/10"}`}>
              <p className="text-[10px] text-muted-foreground mb-0.5">صافي الربح</p>
              <p className={`text-xl font-black ${data.cardStats.netProfit >= 0 ? "text-primary" : "text-red-400"}`}>
                {fmt(Math.abs(data.cardStats.netProfit))}
              </p>
              <p className="text-[10px] flex items-center justify-center gap-0.5 text-muted-foreground">
                {data.cardStats.netProfit >= 0
                  ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                  : <TrendingDown className="w-3 h-3 text-red-400" />}
                {data.cardStats.netProfit >= 0 ? "ربح" : "خسارة"}
              </p>
            </Card>
          </div>

          {/* ─── إضافي: المحصَّل / قيمة الشحن ─── */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                <Wallet className="w-3 h-3" />إجمالي المحصَّل
              </p>
              <p className="text-lg font-black">{fmt(data.cardStats.totalCollected)}</p>
            </Card>
            <Card className="border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                <Send className="w-3 h-3" />إجمالي قيمة الشحن
              </p>
              <p className="text-lg font-black">{fmt(data.cardStats.totalShipping)}</p>
            </Card>
          </div>

          {/* ─── سجل الإقفالات ─── */}
          {data.closures.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
                سجل الإقفالات ({data.closures.length})
              </p>
              <div className="space-y-2">
                {data.closures.map((c) => <ClosureRow key={c.id} c={c} />)}
              </div>
            </div>
          )}

          {/* ─── الدورة الحالية ─── */}
          <div>
            <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider px-1 mb-2">
              الدورة الحالية — {data.currentCycleOrders.length} طلبية
            </p>
            {data.currentCycleOrders.length === 0 ? (
              <div className="py-12 text-center">
                <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground text-sm">لا توجد طلبيات في الدورة الحالية</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.currentCycleOrders.map((o) => <OrderRow key={o.id} o={o} />)}
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Close Account Dialog ─── */}
      {showCloseDialog && (
        <Dialog open onOpenChange={setShowCloseDialog}>
          <DialogContent className="bg-card border-border max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Lock className="w-4 h-4 text-red-500" />
                إقفال حساب العميل
              </DialogTitle>
              <p className="text-xs text-muted-foreground">{data?.client?.name}</p>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-xs text-amber-400 bg-amber-900/10 border border-amber-900/40 rounded-md p-2">
                سيتم إقفال {data?.currentCycleOrders.length ?? 0} طلبية من الدورة الحالية كإقفال دائم. الشحنات المؤجلة أو تحت التسليم لن يتم إقفالها.
              </p>
              <Textarea
                placeholder="ملاحظات (اختياري)"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="text-sm bg-background"
                rows={3}
              />
              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 h-8 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => closeMutation.mutate()}
                  disabled={closeMutation.isPending}
                >
                  {closeMutation.isPending ? "جاري الإقفال..." : "تأكيد الإقفال"}
                </Button>
                <Button variant="outline" className="h-8 text-xs border-border" onClick={() => setShowCloseDialog(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
