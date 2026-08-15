import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw, AlertTriangle, Package, Search, Trash2, CheckSquare, Square } from "lucide-react";
import { ordersApi, shipmentsApi, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:          { label: "معلق",        color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  warehouse_ready:  { label: "قيد الشحن في المخزن", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  in_shipping:      { label: "قيد الشحن",   color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  received:         { label: "تم الاستلام", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  partial_received: { label: "استلام جزئي", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  returned:         { label: "مُرتجع",       color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  cancelled:        { label: "ملغي",         color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

// ── حالات الشحنات (Stark) — نفس منطق التلوين لكن labels خاصة بالشحنات ─────────
const SHIPMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:      { label: "قيد الانتظار",  color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  in_shipping:  { label: "قيد الشحن",     color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  delivered:    { label: "تم التسليم",    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  returned:     { label: "مُرتجع",         color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  delayed:      { label: "متأخر",         color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  cancelled:    { label: "ملغي",          color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

export default function ArchivePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [restoring, setRestoring] = useState<number | null>(null);

  // ── Pagination (client-side على النتيجة المجمّعة بالفاتورة) ─────────────
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  // ── تحديد ── مفتاح مركب "type:id" عشان نفرّق بين order وshipment بنفس الرقم ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const rowKey = (type: "order" | "shipment", id: number) => `${type}:${id}`;

  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["archived-orders"],
    queryFn: ordersApi.archived,
  });

  const { data: shipments = [], isLoading: shipmentsLoading, refetch: refetchShipments } = useQuery({
    queryKey: ["archived-shipments"],
    queryFn: shipmentsApi.archived,
  });

  const isLoading = ordersLoading || shipmentsLoading;
  const refetch = async () => { await Promise.all([refetchOrders(), refetchShipments()]); };

  // ── توحيد الشحنات على شكل صفوف تشبه orders (مع تمييز _type: "shipment") ──
  const shipmentRows = shipments.map(s => ({
    id: s.id,
    _type: "shipment" as const,
    customerName: s.receiverName,
    phone: s.receiverPhone,
    product: s.parcelType || "شحنة",
    status: s.status,
    totalPrice: Number(s.totalAmount) || 0,
    createdAt: s.createdAt,
    deletedAt: (s as any).deletedAt,
  }));

  const orderRows = orders.map(o => ({ ...o, _type: "order" as const }));

  const allRows = [...orderRows, ...shipmentRows];

  const filtered = allRows.filter(o =>
    !search ||
    o.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    o.product?.toLowerCase().includes(search.toLowerCase()) ||
    o.phone?.includes(search)
  );

  // ── جمّع الطلبات بالفاتورة (invoiceNumber) — الشحنات لا تُجمّع (كل شحنة مستقلة) ──
  const groupedFiltered = (() => {
    const groupMap = new Map<string, typeof filtered>();
    for (const o of filtered) {
      const key = o._type === "order" && (o as any).invoiceNumber?.trim()
        ? (o as any).invoiceNumber.trim()
        : `solo-${o._type}-${o.id}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(o);
    }
    return Array.from(groupMap.values()).map(grp => {
      const rep = { ...grp[0] } as any;
      // كل صف بيحمل مفاتيحه المركّبة الخاصة به دايمًا (حتى لو صف مفرد) عشان التحديد يبقى متسق
      rep._groupKeys   = grp.map(o => rowKey(o._type, o.id));
      if (grp.length > 1) {
        rep._groupCount  = grp.length;
        rep._products    = grp.map(o => `${o.product} ×${(o as any).quantity ?? 1}`).join(" ، ");
        rep.totalPrice   = grp.reduce((s, o) => s + o.totalPrice, 0);
      }
      return rep;
    });
  })();

  // ── Pagination (client-side) — بعد التجميع بالفاتورة عشان الأرقام تكون دقيقة ──
  const totalPages = Math.max(1, Math.ceil(groupedFiltered.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages]);
  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);
  // لما اليوزر يغيّر الصفحة، اسكرول لفوق تلقائيًا عشان يبدأ من أول صف بدل ما يفضل تحت
  // ملاحظة: الـ scroll الفعلي بيحصل جوه container داخلي (#main-scroll-area) مش على الـ window نفسه
  useEffect(() => {
    const scrollContainer = document.getElementById("main-scroll-area");
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [page]);
  const paginatedRows = groupedFiltered.slice((page - 1) * pageSize, page * pageSize);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    if (totalPages <= maxButtons + 2) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const nums = new Set<number>([1, totalPages, page]);
    if (page > 1) nums.add(page - 1);
    if (page < totalPages) nums.add(page + 1);
    const sorted = [...nums].sort((a, b) => a - b);
    const withGaps: (number | "gap")[] = [];
    sorted.forEach((n, i) => {
      if (i > 0 && n - sorted[i - 1] > 1) withGaps.push("gap");
      withGaps.push(n);
    });
    return withGaps;
  }, [page, totalPages]);

  // ── تحديد الكل / إلغاء الكل ────────────────────────────────────────────
  const allGroupKeys = groupedFiltered.flatMap(o => (o as any)._groupKeys as string[]);
  const allFilteredSelected = groupedFiltered.length > 0 && allGroupKeys.every(k => selectedIds.has(k));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allGroupKeys));
    }
  };

  const toggleOne = (o: any) => {
    const keys: string[] = (o as any)._groupKeys;
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSel = keys.every(k => next.has(k));
      if (allSel) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  const isRowSelected = (o: any) => {
    const keys: string[] = (o as any)._groupKeys;
    return keys.every(k => selectedIds.has(k));
  };

  // ── استرجاع (بيوجّه لكل API حسب النوع: order أو shipment) ───────────────
  const handleRestore = async (o: any) => {
    const keys: string[] = (o as any)._groupKeys;
    setRestoring(o.id);
    try {
      for (const key of keys) {
        const [type, idStr] = key.split(":");
        const id = Number(idStr);
        if (type === "order") await ordersApi.restore(id);
        else await shipmentsApi.restore(id);
      }
      await refetch();
      setSelectedIds(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-summary"] });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      const msg = keys.length > 1 ? `تم استرجاع الفاتورة (${keys.length} عناصر) للنشط.` : `${o.customerName} تم نقله للنشط.`;
      toast({ title: "تم الاسترجاع", description: msg });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setRestoring(null);
    }
  };

  // ── حذف المحدد نهائياً (مقسّم حسب النوع على كل endpoint) ─────────────────
  const handleDeleteSelected = async () => {
    setDeletingSelected(true);
    try {
      const orderIds: number[] = [];
      const shipmentIds: number[] = [];
      for (const key of Array.from(selectedIds)) {
        const [type, idStr] = key.split(":");
        (type === "order" ? orderIds : shipmentIds).push(Number(idStr));
      }
      if (orderIds.length) {
        await apiFetch("/orders/archived/purge", { method: "DELETE", body: JSON.stringify({ ids: orderIds }) });
      }
      if (shipmentIds.length) {
        await shipmentsApi.purgeSelected(shipmentIds);
      }
      await refetch();
      const total = orderIds.length + shipmentIds.length;
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      toast({ title: "✅ تم الحذف النهائي", description: `تم حذف ${total} عنصر نهائياً.` });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setDeletingSelected(false);
      setShowDeleteSelectedDialog(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
          <Archive className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">الأرشيف</h1>
          <p className="text-sm text-muted-foreground">الطلبات والشحنات المحذوفة (يمكن استرجاعها)</p>
        </div>
        <Badge variant="outline" className="mr-auto">{orders.length} طلب + {shipments.length} شحنة</Badge>

        {/* زر الحذف النهائي للمحدد — للأدمن فقط */}
        {isAdmin && someSelected && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowDeleteSelectedDialog(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            حذف المحدد ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* ── Search ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو المنتج أو الهاتف..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedIds(new Set()); }}
              className="max-w-sm h-8 text-sm"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <div className="text-center space-y-2">
                <Archive className="h-8 w-8 mx-auto animate-pulse" />
                <p className="text-sm">جاري التحميل...</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
              <Package className="h-10 w-10 opacity-30" />
              <p className="text-sm">{search ? "لا توجد نتائج" : "الأرشيف فارغ"}</p>
              {!search && <p className="text-xs opacity-70">الطلبات المحذوفة ستظهر هنا وبإمكانك استرجاعها</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* checkbox تحديد الكل — للأدمن فقط */}
                    {isAdmin && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allFilteredSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="تحديد الكل"
                        />
                      </TableHead>
                    )}
                    <TableHead>#</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>المنتج</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>تاريخ الإنشاء</TableHead>
                    <TableHead>تاريخ الحذف</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody key={`${page}-${pageSize}-${search}`} className="animate-in fade-in duration-300">
                  {paginatedRows.map(o => {
                    const isShipment = (o as any)._type === "shipment";
                    const labelsMap = isShipment ? SHIPMENT_STATUS_LABELS : STATUS_LABELS;
                    const statusInfo = labelsMap[o.status] ?? { label: o.status, color: "bg-gray-100 text-gray-600" };
                    const isSelected = isRowSelected(o);
                    const isGroup = !!(o as any)._groupCount && (o as any)._groupCount > 1;
                    return (
                      <TableRow
                        key={`${(o as any)._type}-${o.id}`}
                        className={`transition-opacity ${isSelected ? "bg-red-950/20 opacity-100" : "opacity-75 hover:opacity-100"}`}
                      >
                        {isAdmin && (
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(o)}
                              aria-label={`تحديد عنصر ${o.id}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isShipment ? "bg-indigo-500/10 text-indigo-500" : "bg-cyan-500/10 text-cyan-500"}`}>
                            {isShipment ? "شحنة" : "طلب"}
                          </span>
                          #{o.id}
                          {isGroup && (
                            <span className="mr-1 text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                              {(o as any)._groupCount} منتجات
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{o.customerName}</div>
                          {o.phone && <div className="text-xs text-muted-foreground">{o.phone}</div>}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px]">
                          <span className="truncate block">
                            {isGroup ? (o as any)._products : o.product}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{formatCurrency(o.totalPrice)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{(o as any).deletedAt ? formatDate((o as any).deletedAt) : "—"}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline" size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => handleRestore(o)}
                            disabled={restoring === o.id}
                          >
                            <RotateCcw className={`h-3 w-3 ${restoring === o.id ? "animate-spin" : ""}`} />
                            استرجاع
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── Pagination (client-side) — أرقام صفحات + انيميشن، زي صفحة الشحنات ── */}
          {groupedFiltered.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border gap-3 flex-wrap animate-in fade-in duration-300">
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] sm:text-xs text-muted-foreground truncate">
                  عرض <span className="font-semibold text-foreground">{(page - 1) * pageSize + 1}</span>
                  –<span className="font-semibold text-foreground">{Math.min(page * pageSize, groupedFiltered.length)}</span>
                  {" "}من <span className="font-semibold text-foreground">{groupedFiltered.length}</span>
                </span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="h-7 text-[11px] rounded-md border border-border bg-background px-2"
                >
                  <option value="25">25 / صفحة</option>
                  <option value="50">50 / صفحة</option>
                  <option value="100">100 / صفحة</option>
                </select>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline" size="sm"
                    className="h-8 w-8 p-0 transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    title="السابق"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </Button>

                  {pageNumbers.map((n, i) =>
                    n === "gap" ? (
                      <span key={`gap-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-muted-foreground select-none">···</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-all duration-200 ${
                          n === page
                            ? "bg-primary text-primary-foreground shadow-md scale-105"
                            : "text-muted-foreground hover:bg-muted hover:scale-105 active:scale-95"
                        }`}
                      >
                        {n}
                      </button>
                    )
                  )}

                  <Button
                    variant="outline" size="sm"
                    className="h-8 w-8 p-0 transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    title="التالي"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(orders.length > 0 || shipments.length > 0) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>الطلبات والشحنات في الأرشيف مخفية من جميع التقارير والإحصائيات. يمكن استرجاعها في أي وقت.</p>
        </div>
      )}

      {/* ── Dialog تأكيد حذف المحدد ── */}
      <AlertDialog open={showDeleteSelectedDialog} onOpenChange={setShowDeleteSelectedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⛔ حذف نهائي للعناصر المحددة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف <strong>{selectedIds.size} عنصر (طلب/شحنة)</strong> نهائياً بشكل لا يمكن التراجع عنه.
              هذه العملية غير قابلة للاسترجاع. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSelected}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={deletingSelected}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingSelected ? "جاري الحذف..." : `نعم، احذف ${selectedIds.size} عنصر`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
