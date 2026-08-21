import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useState, type ElementType } from "react";
import {
  ArrowRight, FileText, Lock, LockOpen, Package, CheckCircle2,
  Clock, RotateCcw, AlertCircle, Printer, Search, Truck, MapPin, Phone,
  ChevronDown, Download, FileSpreadsheet, X,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RETURN_REASONS, returnReasonLabel } from "@/lib/order-constants";

const formatCurrency = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);

// ─── نفس منطق الحسابات المالية المستخدم في صفحة الأدمن (client-account-manifest-detail.tsx) بالظبط ───
const RETURN_REASONS_FINANCIAL = ["refused_paid", "refused_unpaid", "quality"];

function getCollectedAmount(item: ManifestItem): number {
  if (item.deliveryStatus === "delivered") {
    const dvr = item.deliveredValueReceived;
    return dvr != null ? Number(dvr) : Number(item.totalPrice ?? 0);
  }
  if (item.deliveryStatus === "partial_delivered") {
    return item.partialQuantity != null ? Number(item.partialQuantity) : 0;
  }
  if (item.deliveryStatus === "partial_received") {
    return item.partialQuantity != null ? Math.round(Number(item.partialQuantity)) : 0;
  }
  if (item.deliveryStatus === "returned" && RETURN_REASONS_FINANCIAL.includes(String(item.returnReason ?? ""))) {
    const rvr = item.returnValueReceived;
    return rvr != null ? Number(rvr) : 0;
  }
  return 0;
}

function isShippingZeroedRow(item: ManifestItem): boolean {
  const st = item.deliveryStatus;
  if (st === "postponed" || st === "delayed" || st === "pending") return true;
  if (st === "returned") {
    if (!RETURN_REASONS_FINANCIAL.includes(String(item.returnReason ?? ""))) return true;
  }
  return false;
}

function getChargeableShipping(item: ManifestItem): number {
  return isShippingZeroedRow(item) ? 0 : Number(item.shippingCost ?? 0);
}

// ─── تجميع الشحنات المتشابهة (نفس رقم الفاتورة أو نفس العميل/الهاتف/العنوان) — نفس منطق الأدمن ───
function getManifestGroupKey(item: ManifestItem) {
  return item.invoiceNumber?.trim() || `${item.customerName}__${item.phone ?? ""}__${item.address ?? ""}`;
}
function groupManifestItems(items: ManifestItem[]) {
  const groupMap = new Map<string, ManifestItem[]>();
  items.forEach((item) => {
    const key = getManifestGroupKey(item);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(item);
  });
  return Array.from(groupMap.values());
}

interface ManifestItem {
  id: number;
  shipmentId: number;
  deliveryStatus: "pending" | "delivered" | "returned" | "delayed" | "postponed" | "partial_delivered" | "partial_received";
  deliveryNote: string | null;
  partialQuantity: number | null;
  returnReceived: number | null;
  returnReason: string | null;
  returnValueReceived: number | null;
  deliveredValueReceived: number | null;
  addedAt: string;
  customerName: string;
  phone: string;
  city: string;
  address: string;
  senderName: string;
  quantity: number;
  totalPrice: number;
  shippingCost: number;
  invoiceNumber: string;
  representativeName: string | null;
  warehouseName: string | null;
  unitPrice?: number | null;
  repExtraCost?: number | null;
  repExtraReason?: string | null;
}

interface ManifestDetail {
  id: number;
  manifestNumber: string;
  status: "open" | "closed";
  notes: string | null;
  createdAt: string;
  closedAt: string | null;
  items: ManifestItem[];
  stats: { total: number; delivered: number; returned: number; pending: number; delayed: number; partial: number };
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:           { label: "قيد الانتظار", color: "text-muted-foreground",  bg: "border-border" },
  delivered:         { label: "مسلَّم ✓",      color: "text-emerald-400",       bg: "border-emerald-700 bg-emerald-900/20" },
  partial_delivered: { label: "مسلَّم جزئي",   color: "text-teal-400",          bg: "border-teal-700 bg-teal-900/20" },
  partial_received:  { label: "مسلَّم جزئي",   color: "text-teal-400",          bg: "border-teal-700 bg-teal-900/20" },
  delayed:           { label: "مؤجل",          color: "text-orange-400",        bg: "border-orange-700 bg-orange-900/20" },
  postponed:         { label: "مؤجل",          color: "text-orange-400",        bg: "border-orange-700 bg-orange-900/20" },
  returned:          { label: "مرتجع",         color: "text-red-400",           bg: "border-red-700 bg-red-900/20" },
};

// ─── كارت مصغّر لعرض العداد داخل الحاوية القابلة للطي — نفس شكل ClientLookCard في الأدمن ───
function StatusCountCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: ElementType;
  value: number;
  label: string;
  tone: "amber" | "sky" | "orange" | "muted" | "red" | "emerald";
}) {
  const styles = {
    amber: "from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/30 text-amber-300 bg-amber-500/15 border-amber-500/30",
    sky: "from-sky-500/15 via-sky-500/5 to-transparent border-sky-500/30 text-sky-300 bg-sky-500/15 border-sky-500/30",
    orange: "from-orange-500/15 via-orange-500/5 to-transparent border-orange-500/30 text-orange-300 bg-orange-500/15 border-orange-500/30",
    muted: "from-gray-500/15 via-gray-500/5 to-transparent border-gray-500/30 text-foreground bg-gray-500/15 border-gray-500/30",
    red: "from-red-500/15 via-red-500/5 to-transparent border-red-500/30 text-red-300 bg-red-500/15 border-red-500/30",
    emerald: "from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/30 text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  }[tone];
  const [wrap, iconBg] = styles.split(" bg-");

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${wrap} p-3 flex flex-col items-center gap-1.5 shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5`}>
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center bg-${iconBg}`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-xl font-black">{value}</span>
      <span className="text-[10px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}


// ─── تصدير Excel لبيان العميل — نفس تصميم شيت "الطلبيات" في الأدمن، بدون أي بيانات تكلفة داخلية ───
async function exportClientManifestExcel(manifest: ManifestDetail, groups: ManifestItem[][]) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CAPRINA";
  workbook.created = new Date();

  const manifestDate = format(new Date(manifest.createdAt), "yyyy/MM/dd");
  const printDate = format(new Date(), "yyyy/MM/dd HH:mm");

  const C = {
    bg: "FF0F172A", panel: "FF1E293B", gold: "FFF59E0B", white: "FFFFFFFF",
    offWhite: "FFF8FAFC", darkText: "FF0F172A", green: "FF15803D", greenBg: "FFD1FAE5",
    red: "FFDC2626", redBg: "FFFEE2E2", amber: "FFD97706", amberBg: "FFFEF3C7",
    teal: "FF0F766E", tealBg: "FFCCFBF1", gray: "FF64748B", grayBg: "FFF1F5F9", blue: "FF1D4ED8",
  };
  const makeFill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
  const makeBorder = (argb = "FFCBD5E1") => {
    const side = { style: "thin" as const, color: { argb } };
    return { top: side, bottom: side, left: side, right: side };
  };
  const setCell = (cell: any, value: unknown, options?: { fill?: string; font?: Record<string, any>; align?: Record<string, any>; border?: string; numFmt?: string }) => {
    cell.value = value as any;
    if (options?.fill) cell.fill = makeFill(options.fill);
    if (options?.font) cell.font = { name: "Tahoma", size: 10, ...options.font };
    if (options?.align) cell.alignment = options.align;
    if (options?.border) cell.border = makeBorder(options.border);
    if (options?.numFmt) cell.numFmt = options.numFmt;
  };

  const ws = workbook.addWorksheet("الطلبيات", { views: [{ state: "frozen", ySplit: 5, rightToLeft: true }] });
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ws.columns = [
    { key: "idx", width: 6 }, { key: "sender", width: 16 }, { key: "customer", width: 20 },
    { key: "phone", width: 14 }, { key: "gov", width: 14 }, { key: "address", width: 30 },
    { key: "cod", width: 14 }, { key: "received", width: 14 }, { key: "fee", width: 12 },
    { key: "status", width: 14 }, { key: "note", width: 24 },
  ];

  ws.mergeCells("A1:K1");
  setCell(ws.getCell("A1"), "CAPRINA", { fill: C.bg, font: { bold: true, size: 16, color: { argb: C.gold } }, align: { horizontal: "center", vertical: "middle" }, border: C.bg });
  ws.getRow(1).height = 28;
  ws.mergeCells("A2:K2");
  setCell(ws.getCell("A2"), `بيان الشحن — ${manifest.manifestNumber}   |   ${manifestDate}`, { fill: C.bg, font: { bold: true, size: 12, color: { argb: C.gold } }, align: { horizontal: "center", vertical: "middle" }, border: C.bg });
  ws.getRow(2).height = 24;
  ws.mergeCells("A3:K3");
  setCell(ws.getCell("A3"), `طُبع: ${printDate}`, { fill: C.panel, font: { size: 10, color: { argb: "FF6B7280" } }, align: { horizontal: "center", vertical: "middle" }, border: "FF334155" });
  ws.getRow(3).height = 22;
  ws.mergeCells("A4:K4");
  setCell(ws.getCell("A4"), "", { fill: C.bg, border: C.bg });
  ws.getRow(4).height = 8;

  const headers = ["#", "الشركة الراسلة", "اسم العميل", "الهاتف", "المحافظة", "العنوان", "إجمالي سعر الشحنة", "القيمة المستلمة", "قيمة الشحن", "حالة التسليم", "ملاحظة"];
  const headerRow = ws.getRow(5);
  headerRow.values = headers;
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    setCell(cell, cell.value, { fill: C.panel, font: { bold: true, color: { argb: C.white }, size: 10 }, align: { horizontal: "center", vertical: "middle", wrapText: true }, border: "FF334155" });
  });

  groups.forEach((group, idx) => {
    const rep = group[0];
    const cod = group.reduce((sum, o) => sum + Number(o.totalPrice ?? 0), 0);
    const fee = group.reduce((sum, o) => sum + getChargeableShipping(o), 0);
    const shipmentTotal = cod + fee;
    const receivedValue = group.reduce((sum, o) => sum + getCollectedAmount(o), 0);
    const statuses = [...new Set(group.map((o) => o.deliveryStatus))];
    const deliveryStatus = statuses.length === 1 ? statuses[0] : "pending";
    const deliveryLabel = statuses.length === 1 ? (STATUS_META[statuses[0]]?.label ?? statuses[0]) : "حالات متعددة";
    const notes = [...new Set(group.map((o) => o.deliveryNote).filter(Boolean))].join(" | ");
    const baseFill = idx % 2 === 0 ? C.white : C.offWhite;
    const baseFont = { color: { argb: C.darkText } };
    const row = ws.getRow(idx + 6);
    row.height = 32;
    setCell(row.getCell(1), idx + 1, { fill: baseFill, font: { bold: true, color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(2), rep.senderName ?? "—", { fill: baseFill, font: { bold: true, color: { argb: C.blue } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(3), rep.customerName, { fill: baseFill, font: { bold: true, color: { argb: C.darkText } }, align: { horizontal: "right", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(4), rep.phone ?? "—", { fill: baseFill, font: baseFont, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(5), rep.city ?? "—", { fill: baseFill, font: baseFont, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(6), rep.address ?? "—", { fill: baseFill, font: { size: 9, color: { argb: C.darkText } }, align: { horizontal: "right", vertical: "middle", wrapText: true }, border: "FFD1D5DB" });
    setCell(row.getCell(7), shipmentTotal, { fill: baseFill, font: { bold: true, color: { argb: C.green } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: '#,##0 "ج.م"' });
    setCell(row.getCell(8), receivedValue > 0 ? receivedValue : "—", { fill: baseFill, font: { bold: true, color: { argb: C.blue } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: receivedValue > 0 ? '#,##0 "ج.م"' : undefined });
    setCell(row.getCell(9), fee > 0 ? fee : "—", { fill: baseFill, font: { color: { argb: C.amber } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: fee > 0 ? '#,##0 "ج.م"' : undefined });
    setCell(row.getCell(10), deliveryLabel, {
      fill: deliveryStatus === "delivered" ? C.greenBg : deliveryStatus === "returned" ? C.redBg : (deliveryStatus === "partial_received" || deliveryStatus === "partial_delivered") ? C.tealBg : (deliveryStatus === "postponed" || deliveryStatus === "delayed") ? C.amberBg : C.grayBg,
      font: { bold: true, color: { argb: deliveryStatus === "delivered" ? C.green : deliveryStatus === "returned" ? C.red : (deliveryStatus === "partial_received" || deliveryStatus === "partial_delivered") ? C.teal : (deliveryStatus === "postponed" || deliveryStatus === "delayed") ? C.amber : C.gray } },
      align: { horizontal: "center", vertical: "middle" },
      border: "FFCBD5E1",
    });
    setCell(row.getCell(11), notes || "", { fill: baseFill, font: baseFont, align: { horizontal: "right", vertical: "middle", wrapText: true }, border: "FFD1D5DB" });
  });

  ws.eachRow((row) => {
    row.eachCell((cell) => { if (!cell.alignment) cell.alignment = { horizontal: "right", vertical: "middle" }; });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `بيان-${manifest.manifestNumber}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── نافذة اختيار طريقة التصدير: Excel / PDF (طباعة) ───
function ExportDialog({
  open,
  onClose,
  onExportExcel,
  onExportPDF,
}: {
  open: boolean;
  onClose: () => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            تصدير
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <button
            type="button"
            onClick={() => { onExportExcel(); onClose(); }}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-emerald-700/60 hover:bg-emerald-900/10 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-900/20 border border-emerald-700/50 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold">Excel</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">جدول الطلبيات كامل</p>
            </div>
          </button>
          <button
            type="button"
            onClick={onExportPDF}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-red-700/60 hover:bg-red-900/10 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-red-900/20 border border-red-700/50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold">PDF / طباعة</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">نسخة قابلة للطباعة</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientManifestViewPage() {
  const params = useParams();
  const id = Number(params.id);
  const [statusBreakdownOpen, setStatusBreakdownOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [showExportDialog, setShowExportDialog] = useState(false);

  const { data: manifest, isLoading, refetch } = useQuery<ManifestDetail>({
    queryKey: [`/client-portal/manifests/${id}`],
    queryFn: async () => apiFetch<ManifestDetail>(`/client-portal/manifests/${id}`),
    enabled: !isNaN(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        جارٍ التحميل...
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-sm text-muted-foreground">
        <AlertCircle className="w-8 h-8" />
        البيان غير موجود
      </div>
    );
  }

  const items = manifest.items ?? [];
  const groupedItems = groupManifestItems(items);

  const manifestGroupPriority: Record<string, number> = {
    returned: 5,
    postponed: 4,
    delayed: 4,
    partial_received: 3,
    partial_delivered: 3,
    pending: 2,
    delivered: 1,
  };
  const groupStatus = (group: ManifestItem[]) =>
    group.reduce(
      (worst, item) =>
        (manifestGroupPriority[item.deliveryStatus] ?? 0) > (manifestGroupPriority[worst] ?? 0)
          ? item.deliveryStatus
          : worst,
      group[0]?.deliveryStatus ?? "pending"
    );

  const groupedDeliveredCount = groupedItems.filter((g) => groupStatus(g) === "delivered").length;
  const groupedPartialCountDisplay = groupedItems.filter((g) =>
    ["partial_received", "partial_delivered"].includes(groupStatus(g))
  ).length;
  const groupedPostponedCount = groupedItems.filter((g) =>
    ["postponed", "delayed"].includes(groupStatus(g))
  ).length;
  const groupedPendingCount = groupedItems.filter((g) => groupStatus(g) === "pending").length;
  const groupedReturnedCount = groupedItems.filter((g) => groupStatus(g) === "returned").length;
  const groupedCompletedCount = groupedDeliveredCount + groupedPartialCountDisplay;
  const groupedTotal = groupedItems.length || 1;
  const groupedDeliveryRate = Math.round((groupedCompletedCount / groupedTotal) * 100);

  const searchLower = search.trim().toLowerCase();
  const displayGroups = searchLower
    ? groupedItems.filter((group) =>
        group.some(
          (item) =>
            item.customerName?.toLowerCase().includes(searchLower) ||
            item.phone?.toLowerCase().includes(searchLower) ||
            String(item.shipmentId).includes(searchLower)
        )
      )
    : groupedItems;

  // ─── بضاعة لسه عند شركة الشحن (مرتجع/جزئي لسه محتاج تأكيد استلام) ───
  const pendingReturnItems = items.filter(
    (item) =>
      (item.deliveryStatus === "returned" ||
        item.deliveryStatus === "partial_received" ||
        item.deliveryStatus === "partial_delivered") &&
      item.returnReceived !== 1
  );

  // ─── كروت المجاميع المالية — بدون أي بيانات تكلفة داخلية (zoneCost/costPrice) ───
  const deliveredItems = items.filter((i) => i.deliveryStatus === "delivered");
  const partialItems = items.filter(
    (i) => i.deliveryStatus === "partial_received" || i.deliveryStatus === "partial_delivered"
  );
  const returnedItems = items.filter((i) => i.deliveryStatus === "returned");
  const returnedDueItems = returnedItems.filter((i) =>
    RETURN_REASONS_FINANCIAL.includes(String(i.returnReason ?? ""))
  );
  const netAmount = items.reduce((s, i) => s + getCollectedAmount(i), 0);
  const shippingCost = items.reduce((s, i) => s + getChargeableShipping(i), 0);
  const repExtraCostTotal = items.reduce(
    (s, i) => s + (isShippingZeroedRow(i) ? 0 : Number(i.repExtraCost ?? 0)),
    0
  );
  const displayedShippingCost = shippingCost + repExtraCostTotal;
  const totalDueFromClient = netAmount - displayedShippingCost;
  const dueOrdersCount = deliveredItems.length + partialItems.length + returnedDueItems.length;

  return (
    <div className="flex flex-col gap-4 max-w-5xl mx-auto p-4" dir="rtl">
      <div className="flex items-center gap-2 flex-wrap print:hidden">
        <Link href="/client-manifests" className="p-2 rounded-lg hover:bg-muted/40 transition-colors">
          <ArrowRight className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black flex items-center gap-1.5 truncate">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            بيان {manifest.manifestNumber}
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {format(new Date(manifest.createdAt), "yyyy/MM/dd", { locale: ar })}
            {manifest.status === "closed" ? (
              <span className="inline-flex items-center gap-1 mr-2 text-red-400">
                <Lock className="w-3 h-3" /> مُغلق
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 mr-2 text-emerald-400">
                <LockOpen className="w-3 h-3" /> مفتوح
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 border-border"
            onClick={() => window.print()}
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
        </div>
      </div>

      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExportExcel={() => exportClientManifestExcel(manifest, groupedItems)}
        onExportPDF={() => window.print()}
      />

      {/* ─── حاوية "إجمالي عدد الشحنات" القابلة للطي ─── */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 via-violet-500/[0.03] to-transparent overflow-hidden">
        <button
          type="button"
          onClick={() => setStatusBreakdownOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 p-4"
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-black text-violet-300">إجمالي عدد الشحنات</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-violet-300">{items.length}</span>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${statusBreakdownOpen ? "rotate-180" : ""}`}
            />
          </div>
        </button>
        <div
          className="grid transition-all duration-300 ease-in-out"
          style={{ gridTemplateRows: statusBreakdownOpen ? "1fr" : "0fr" }}
        >
          <div className={`overflow-hidden transition-opacity duration-300 ${statusBreakdownOpen ? "opacity-100" : "opacity-0"}`}>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-4 pb-4">
              <StatusCountCard icon={CheckCircle2} value={groupedDeliveredCount} label="استلم" tone="emerald" />
              <StatusCountCard icon={CheckCircle2} value={groupedPartialCountDisplay} label="استلم جزئي" tone="sky" />
              <StatusCountCard icon={AlertCircle} value={groupedPostponedCount} label="مؤجل" tone="orange" />
              <StatusCountCard icon={Clock} value={groupedPendingCount} label="قيد الانتظار" tone="muted" />
              <StatusCountCard icon={RotateCcw} value={groupedReturnedCount} label="مرتجع" tone="red" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── بروجرس بار نسبة التسليم ─── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted/25 to-transparent p-4 shadow-md shadow-black/10">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground font-bold">نسبة التسليم</span>
          <span className="font-black text-emerald-400 text-lg drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]">{groupedDeliveryRate}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-emerald-400 to-emerald-600 rounded-full transition-all shadow-[0_0_10px_rgba(52,211,153,0.5)]"
            style={{ width: `${groupedDeliveryRate}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-emerald-500 font-bold">مُسلَّم: {groupedCompletedCount}</span>
          <span className="text-red-500 font-bold">مؤجل: {groupedPostponedCount}</span>
          <span className="text-red-500 font-bold">مرتجع: {groupedReturnedCount}</span>
        </div>
      </div>

      {/* ─── بحث ─── */}
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم العميل أو رقم الشحنة أو الهاتف..."
          className="w-full h-11 rounded-xl bg-muted/25 border border-border pr-10 pl-3 text-sm outline-none focus:border-primary/50 focus:bg-muted/35 transition-all"
          dir="rtl"
        />
      </div>

      {/* ─── جدول الشحنات — مطابق لتصميم الأدمن بالكامل ─── */}
      <div className="rounded-2xl border border-border bg-muted/10 overflow-hidden shadow-lg shadow-black/10 manifest-print">
        <div className="px-4 py-3.5 border-b border-border flex items-center justify-between bg-gradient-to-l from-muted/30 to-transparent">
          <p className="text-sm font-black flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            الشحنات في البيان
          </p>
          <span className="text-[11px] text-muted-foreground font-bold px-2.5 py-1 rounded-full bg-muted/40 border border-border/60">
            {displayGroups.length} شحنة
          </span>
        </div>

        {displayGroups.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">لا توجد نتائج مطابقة</div>
        ) : (
          <div className="overflow-x-auto">
            {/* رأس الجدول */}
            <div dir="rtl" className="grid grid-cols-[minmax(140px,1fr)_100px_90px_90px_80px_140px] md:grid-cols-[110px_minmax(120px,1fr)_95px_90px_minmax(130px,1.2fr)_85px_85px_80px_130px] gap-0 border-b-2 border-border bg-muted/20 text-[10px] font-bold text-muted-foreground tracking-wide [&>*:not(:last-child)]:border-l [&>*]:border-border/30">
              <div className="hidden md:flex items-center gap-1.5 px-3 h-9">
                <Truck className="w-2.5 h-2.5 opacity-50 shrink-0" />
                اسم الراسل
              </div>
              <div className="flex items-center px-3 h-9 font-bold">اسم العميل</div>
              <div className="flex items-center gap-1.5 px-3 h-9">رقم تليفون العميل</div>
              <div className="flex items-center gap-1.5 px-3 h-9">
                <MapPin className="w-2.5 h-2.5 opacity-50 shrink-0" />
                المحافظة
              </div>
              <div className="hidden md:flex items-center gap-1.5 px-3 h-9">العنوان</div>
              <div className="flex items-center px-3 h-9 font-bold">اجمالى سعر الشحنة</div>
              <div className="hidden md:flex items-center justify-center gap-1 px-2 h-9">القيمة المستلمة</div>
              <div className="flex items-center justify-center gap-1 px-2 h-9 text-amber-500">قيمة الشحن</div>
              <div className="flex items-center gap-1 px-2 h-9">
                <CheckCircle2 className="w-2.5 h-2.5 opacity-50" />
                حالة الاوردر
              </div>
            </div>

            {/* صفوف الجدول */}
            <div className="divide-y divide-border/50">
              {displayGroups.map((group, idx) => {
                const rep = group[0];
                const status = groupStatus(group) as ManifestItem["deliveryStatus"];
                const statuses = [...new Set(group.map((i) => i.deliveryStatus))];
                const meta = STATUS_META[status] ?? STATUS_META.pending;
                const total = group.reduce((sum, item) => sum + item.totalPrice + getChargeableShipping(item), 0);
                const received = group.reduce((sum, item) => sum + getCollectedAmount(item), 0);
                const shipping = group.reduce((sum, item) => sum + getChargeableShipping(item), 0);
                return (
                  <div
                    key={idx}
                    dir="rtl"
                    className="grid grid-cols-[minmax(140px,1fr)_100px_90px_90px_80px_140px] md:grid-cols-[110px_minmax(120px,1fr)_95px_90px_minmax(130px,1.2fr)_85px_85px_80px_130px] gap-0 items-center py-2.5 text-xs hover:bg-muted/10 transition-colors"
                  >
                    <div className="hidden md:flex min-w-0 px-3 items-center">
                      {rep.senderName ? (
                        <p className="text-[10px] font-semibold text-primary/80 truncate">{rep.senderName}</p>
                      ) : (
                        <p className="text-muted-foreground/40 text-[10px]">—</p>
                      )}
                    </div>
                    <div className="min-w-0 px-3 flex items-start">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{rep.customerName}</p>
                        {rep.invoiceNumber && (
                          <span className="text-[9px] bg-primary/10 text-primary px-1 rounded font-mono">
                            {rep.invoiceNumber}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 px-3 flex items-center">
                      {rep.phone ? (
                        <p className="text-[10px] text-muted-foreground truncate">{rep.phone}</p>
                      ) : (
                        <p className="text-muted-foreground/40 text-[10px]">—</p>
                      )}
                    </div>
                    <div className="min-w-0 px-3 flex items-center">
                      {rep.city ? (
                        <p className="font-semibold text-[10px] truncate">{rep.city}</p>
                      ) : (
                        <p className="text-muted-foreground/40 text-[10px]">—</p>
                      )}
                    </div>
                    <div className="hidden md:flex min-w-0 px-3 items-start">
                      {rep.address ? (
                        <p className="text-[10px] leading-relaxed text-foreground/80 whitespace-normal break-words">{rep.address}</p>
                      ) : (
                        <p className="text-muted-foreground/40 text-[10px]">—</p>
                      )}
                    </div>
                    <div className="text-left font-bold px-3 flex items-center">
                      <span className="text-emerald-500">{formatCurrency(total)}</span>
                    </div>
                    <div className="hidden md:flex text-center px-2 items-center justify-center">
                      <span className="text-emerald-500 font-semibold">{formatCurrency(received)}</span>
                    </div>
                    <div className="text-center px-2 flex items-center justify-center">
                      {shipping > 0 ? (
                        <span className="text-amber-500 font-semibold">{formatCurrency(shipping)}</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </div>
                    <div className="px-3 flex flex-col gap-1">
                      {statuses.length > 1 ? (
                        <Badge variant="outline" className="text-[9px] font-bold border border-border text-muted-foreground w-fit">
                          حالات متعددة
                        </Badge>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className={`text-[9px] font-bold border w-fit ${meta.bg} ${meta.color}`}>
                            {meta.label}
                          </Badge>
                          {(status === "delayed" || status === "postponed") && rep.deliveryNote && (
                            <p className="text-[10px] text-orange-400 font-semibold">⏸ {rep.deliveryNote}</p>
                          )}
                          {status === "returned" && (
                            <p className="text-[10px] text-red-400 flex items-center gap-0.5">
                              ↳ {rep.returnReason ? returnReasonLabel(rep.returnReason) : "لم يحدد السبب"}
                            </p>
                          )}
                          {(status === "partial_received" || status === "partial_delivered") && (
                            <p className="text-[9px] text-teal-600 dark:text-teal-400">
                              ◑ {rep.partialQuantity ?? 0}/{group.reduce((s, i) => s + i.quantity, 0)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── بضاعة لسه عند شركة الشحن ─── */}
      {pendingReturnItems.length > 0 && (
        <div
          className="rounded-xl border-2 border-red-500/70 bg-red-950/30 p-4"
          style={{ boxShadow: "0 0 30px 6px rgba(239,68,68,0.4), 0 0 60px 10px rgba(239,68,68,0.15), inset 0 0 20px 2px rgba(239,68,68,0.05)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🚚</span>
            <h2 className="font-bold text-sm text-red-400">
              بضاعة لسه عند شركة الشحن ({pendingReturnItems.length})
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {pendingReturnItems.map((item) => {
              const isPartial = item.deliveryStatus === "partial_received" || item.deliveryStatus === "partial_delivered";
              const deliveredQty = item.partialQuantity ?? 0;
              const remainingQty = isPartial ? (item.quantity - deliveredQty) : item.quantity;
              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-lg border border-red-800/30 bg-red-950/30 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-xs truncate text-foreground">{item.customerName}</span>
                      {item.phone && <span className="text-[10px] text-muted-foreground">{item.phone}</span>}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isPartial ? "bg-teal-900/40 text-teal-400" : "bg-red-900/40 text-red-400"}`}>
                        {isPartial ? "جزئي" : "مرتجع"}
                      </span>
                    </div>
                    <p className="text-[10px] font-semibold text-red-400 mt-0.5">
                      {isPartial
                        ? `كمية باقية عند الشحن: ${remainingQty} من ${item.quantity}`
                        : `كمية مرتجعة: ${item.quantity}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── كروت المجاميع المالية ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-emerald-500/[0.03] to-transparent p-4 shadow-lg shadow-black/10">
          <p className="text-xs text-emerald-400 mb-1">إجمالي الإيرادات</p>
          <p className="text-lg font-black text-emerald-400">{formatCurrency(netAmount)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{dueOrdersCount} شحنة</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-amber-500/[0.03] to-transparent p-4 shadow-lg shadow-black/10">
          <p className="text-xs text-amber-400 mb-1">إجمالي تكلفة الشحن</p>
          <p className="text-lg font-black text-amber-400">{formatCurrency(displayedShippingCost)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {items.length} شحنة
            {repExtraCostTotal > 0 ? ` · إضافات أنواع: ${formatCurrency(repExtraCostTotal)}` : ""}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-sky-500/[0.03] to-transparent p-4 shadow-lg shadow-black/10">
          <p className="text-xs text-sky-400 mb-1">الرصيد المستحق</p>
          <p className="text-lg font-black text-sky-400">{formatCurrency(totalDueFromClient)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{dueOrdersCount} شحنة</p>
        </div>
      </div>

      {/* ─── إعدادات الطباعة: نطبع الجدول بس ونخفي باقي الصفحة ─── */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .manifest-print, .manifest-print * { visibility: visible; }
          .manifest-print { position: absolute; top: 0; left: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
