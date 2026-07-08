import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  saleOrderManifestsApi,
  type SaleOrderManifestDetail,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  ArrowRight,
  Package,
  TrendingUp,
  Clock,
  Printer,
  Lock,
  Unlock,
  Trash2,
  Receipt,
  Banknote,
  Edit2,
  Check,
  X,
  Search,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

const formatCurrency = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  confirmed: "مؤكد",
  processing: "قيد الانتظار",
  delivered: "تم التسليم",
  closed: "مغلق",
  cancelled: "ملغي",
};

const STATUS_STYLES: Record<string, string> = {
  draft:      "text-muted-foreground border-border",
  confirmed:  "text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20",
  processing: "text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20",
  delivered:  "text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20",
  closed:     "text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20",
  cancelled:  "text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20",
};

export default function SaleOrderManifestDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [editingInvoicePrice, setEditingInvoicePrice] = useState(false);
  const [invoicePriceInput, setInvoicePriceInput] = useState("");

  const { data: manifest, isLoading, error } = useQuery<SaleOrderManifestDetail>({
    queryKey: ["sale-order-manifest", id],
    queryFn: () => saleOrderManifestsApi.get(id),
    enabled: !isNaN(id),
  });

  const filteredItems = useMemo(() => {
    const items = manifest?.items ?? [];
    if (!customerSearch) return items;
    const s = customerSearch.toLowerCase();
    return items.filter(it =>
      (it.order?.soNumber ?? "").toLowerCase().includes(s) ||
      (it.order?.clientPhone ?? "").toLowerCase().includes(s)
    );
  }, [manifest?.items, customerSearch]);

  const toggleLockMutation = useMutation({
    mutationFn: (status: "open" | "closed") =>
      saleOrderManifestsApi.update(id, { status, rollover: status === "closed" }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["sale-order-manifest", id] });
      qc.invalidateQueries({ queryKey: ["sale-order-manifests"] });
      if (res.rolled) {
        toast({
          title: "🔒 تم إغلاق البيان بنجاح",
          description: `تم ترحيل ${res.rolled.orderCount} فاتورة غير مكتملة إلى بيان جديد: ${res.rolled.manifestNumber}`,
          duration: 8000,
        });
      } else {
        toast({ title: "تم تحديث البيان" });
      }
      setShowCloseDialog(false);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const invoicePriceMutation = useMutation({
    mutationFn: (invoicePrice: number | null) =>
      saleOrderManifestsApi.update(id, { invoicePrice }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sale-order-manifest", id] });
      toast({ title: "تم تحديث سعر الفاتورة" });
      setEditingInvoicePrice(false);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => saleOrderManifestsApi.delete(id),
    onSuccess: () => {
      toast({ title: "تم حذف البيان" });
      window.history.back();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;
  }
  if (error || !manifest) {
    return <div className="p-8 text-center text-destructive">تعذر تحميل البيان</div>;
  }

  const stats = manifest.stats;
  const deliveryRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
  const isClosed = manifest.status === "closed";
  const invoicePrice = manifest.invoicePrice != null ? Number(manifest.invoicePrice) : null;
  const netProfit = invoicePrice != null ? invoicePrice - stats.totalShippingCost : null;

  const startEditInvoicePrice = () => {
    setInvoicePriceInput(invoicePrice != null ? String(invoicePrice) : "");
    setEditingInvoicePrice(true);
  };
  const saveInvoicePrice = () => {
    const val = parseFloat(invoicePriceInput.replace(/,/g, ""));
    invoicePriceMutation.mutate(isNaN(val) ? null : val);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={isClosed ? "outline" : "default"} className={isClosed ? "text-emerald-600 border-emerald-500/50" : ""}>
                {isClosed ? "مغلق" : "مفتوح"}
              </Badge>
              <h1 className="text-xl font-black">{manifest.manifestNumber}</h1>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              {format(new Date(manifest.createdAt), "yyyy/MM/dd")}
              <span>·</span>
              {manifest.client?.name ?? "—"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-4 h-4 ml-1.5" /> حذف
          </Button>
          <Button
            variant={isClosed ? "outline" : "secondary"}
            size="sm"
            onClick={() => isClosed ? toggleLockMutation.mutate("open") : setShowCloseDialog(true)}
          >
            {isClosed ? <Unlock className="w-4 h-4 ml-1.5" /> : <Lock className="w-4 h-4 ml-1.5" />}
            {isClosed ? "إعادة فتح" : "إغلاق البيان"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 ml-1.5" /> طباعة
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border-orange-300/50 dark:border-orange-700/50 bg-orange-50/50 dark:bg-orange-900/10">
          <div className="flex items-center gap-1.5 text-orange-700 dark:text-orange-400 text-xs font-bold mb-1">
            <Clock className="w-3.5 h-3.5" /> قيد الانتظار
          </div>
          <div className="text-2xl font-black">{stats.processing}</div>
        </Card>
        <Card className="p-4 border-emerald-300/50 dark:border-emerald-700/50 bg-emerald-50/50 dark:bg-emerald-900/10">
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-bold mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> تم التسليم
          </div>
          <div className="text-2xl font-black">{stats.delivered}</div>
          <div className="text-[10px] text-muted-foreground">نسبة التسليم {deliveryRate}%</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-bold mb-1">
            <Package className="w-3.5 h-3.5" /> إجمالي الفواتير
          </div>
          <div className="text-2xl font-black">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-bold mb-1">
            <Banknote className="w-3.5 h-3.5" /> صافي المستحق
          </div>
          <div className="text-lg font-black">{formatCurrency(stats.netDue)}</div>
        </Card>
      </div>

      {/* ── نسبة التسليم ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-black text-orange-500">{deliveryRate}%</span>
          <span className="text-sm font-bold">نسبة التسليم</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${deliveryRate}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
          <span>قيد الانتظار: {stats.processing}</span>
          <span>مسلَّم: {stats.delivered}</span>
        </div>
      </Card>

      {/* ── فاتورة البيان ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <Receipt className="w-4 h-4" /> فاتورة البيان
          </div>
        </div>
        <div className="text-xs text-muted-foreground mb-2">
          المبلغ المتفق عليه مع العميل (ما سيدفعه لنا)
        </div>
        {editingInvoicePrice ? (
          <div className="flex items-center gap-2">
            <Input
              value={invoicePriceInput}
              onChange={(e) => setInvoicePriceInput(e.target.value)}
              placeholder="أدخل السعر"
              className="max-w-[180px]"
              autoFocus
            />
            <Button size="icon" variant="default" onClick={saveInvoicePrice}>
              <Check className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => setEditingInvoicePrice(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-lg font-black">
              {invoicePrice != null ? formatCurrency(invoicePrice) : "غير محدد"}
            </span>
            <Button size="sm" variant="ghost" onClick={startEditInvoicePrice}>
              <Edit2 className="w-3.5 h-3.5 ml-1" /> تعديل
            </Button>
          </div>
        )}
      </Card>

      {/* ── مصاريف الشحن الداخلي ── */}
      <Card className="p-4">
        <div className="flex items-center gap-1.5 font-bold text-sm mb-3">
          <TrendingUp className="w-4 h-4" /> مصاريف الشحن الداخلي
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-1">إجمالي فاتورة البيان</div>
            <div className="font-black">
              {invoicePrice != null ? formatCurrency(invoicePrice) : "غير محدد"}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-1">تكلفة الشحن الداخلي</div>
            <div className="font-black text-orange-600 dark:text-orange-400">
              {formatCurrency(stats.totalShippingCost)}
            </div>
          </div>
          <div className="rounded-lg border p-3 border-emerald-300/50 dark:border-emerald-700/50 bg-emerald-50/50 dark:bg-emerald-900/10">
            <div className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">صافي الربح الحقيقي</div>
            <div className="font-black text-emerald-700 dark:text-emerald-400">
              {netProfit != null ? formatCurrency(netProfit) : "—"}
            </div>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">
          صافي الربح = فاتورة البيان − تكلفة الشحن الداخلي لكل الفواتير في البيان
        </div>
      </Card>

      {/* ── جدول الفواتير ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <Package className="w-4 h-4" /> الفواتير في البيان
            <Badge variant="secondary">{filteredItems.length}</Badge>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="ابحث برقم الفاتورة أو الهاتف..."
              className="pr-8"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-right font-bold p-2">رقم الفاتورة</th>
                <th className="text-right font-bold p-2">العميل</th>
                <th className="text-right font-bold p-2">الهاتف</th>
                <th className="text-right font-bold p-2">تكلفة الشحن</th>
                <th className="text-right font-bold p-2">الإجمالي</th>
                <th className="text-right font-bold p-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((it) => (
                <tr key={it.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="p-2 font-bold">
                    <Link href={`/sales/orders/${it.order?.id}`} className="hover:underline">
                      {it.order?.soNumber ?? "—"}
                    </Link>
                  </td>
                  <td className="p-2">{it.order?.clientName ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{it.order?.clientPhone ?? "—"}</td>
                  <td className="p-2">{formatCurrency(it.order?.shippingCost)}</td>
                  <td className="p-2 font-bold">{formatCurrency(it.order?.totalAmount)}</td>
                  <td className="p-2">
                    <Badge variant="outline" className={STATUS_STYLES[it.order?.status ?? ""] ?? ""}>
                      {STATUS_LABELS[it.order?.status ?? ""] ?? it.order?.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    لا توجد فواتير مطابقة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── حوار الحذف ── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف البيان</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا البيان؟ لن يتم حذف الفواتير نفسها، وسيتم فك ارتباطها بالبيان فقط.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── حوار الإغلاق ── */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إغلاق البيان</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إغلاق البيان، وأي فواتير غير مكتملة (غير مُسلَّمة) سيتم ترحيلها تلقائيًا إلى بيان جديد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => toggleLockMutation.mutate("closed")}>
              تأكيد الإغلاق
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
