import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight, ClipboardList, Search, Printer, FileText, FileSpreadsheet,
  Lock, LockOpen, Package, CheckCircle2, Hourglass, Loader2, Filter, FilterX,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { clientReturnManifestsApi } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { returnReasonLabel } from "@/lib/order-constants";

// ════════════════════════════════════════════════════════════════════════════
// فلتر عمود بطريقة إكسل — أيقونة تفتح قايمة القيم الفريدة مع تحديد متعدد
// ════════════════════════════════════════════════════════════════════════════
function ColumnFilterButton({
  values, selected, onChange,
}: {
  values: string[];
  selected: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
}) {
  const isActive = selected !== null;
  const allChecked = (v: string) => (selected === null ? true : selected.has(v));

  const toggle = (v: string) => {
    const base = selected === null ? new Set(values) : new Set(selected);
    if (base.has(v)) base.delete(v); else base.add(v);
    onChange(base.size === values.length ? null : base);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center w-4 h-4 rounded transition-colors",
            isActive ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
        >
          {isActive ? <FilterX className="w-3 h-3" /> : <Filter className="w-3 h-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="start" className="w-56 p-2 space-y-1">
        <div className="flex items-center justify-between px-1 pb-1.5 border-b border-border/60">
          <button
            type="button"
            className="text-[11px] font-bold text-primary hover:underline"
            onClick={() => onChange(null)}
          >
            مسح الفلتر
          </button>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => onChange(new Set())}
          >
            إلغاء تحديد الكل
          </button>
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {values.map(v => (
            <label key={v} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/40 cursor-pointer text-xs">
              <Checkbox checked={allChecked(v)} onCheckedChange={() => toggle(v)} />
              <span className="truncate">{v}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// صفحة تفاصيل بيان مرتجعات واحد — مستقلة بالكامل (بدل القائمة المنسدلة)
// تعمل مع البيان المفتوح والمغلق. طباعة + تحميل PDF + تحميل Excel.
// ════════════════════════════════════════════════════════════════════════════
export default function ClientReturnManifestDetailPage() {
  const params = useParams<{ id: string }>();
  const manifestId = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [itemsSearch, setItemsSearch] = useState("");
  const [filterModeOn, setFilterModeOn] = useState(false);
  const [reasonFilter, setReasonFilter] = useState<Set<string> | null>(null);
  const [cityFilter, setCityFilter] = useState<Set<string> | null>(null);
  const [amountFilter, setAmountFilter] = useState<Set<string> | null>(null);
  const [phoneFilter, setPhoneFilter] = useState<Set<string> | null>(null);
  const [receiverFilter, setReceiverFilter] = useState<Set<string> | null>(null);
  const [shipmentFilter, setShipmentFilter] = useState<Set<string> | null>(null);
  const [senderFilter, setSenderFilter] = useState<Set<string> | null>(null);
  const [shipmentCodAmountFilter, setShipmentCodAmountFilter] = useState<Set<string> | null>(null);
  const [shippingFeeFilter, setShippingFeeFilter] = useState<Set<string> | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [courierName, setCourierName] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [selfDelivered, setSelfDelivered] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["client-return-manifest-detail", manifestId],
    queryFn: () => clientReturnManifestsApi.get(manifestId),
    enabled: !isNaN(manifestId),
  });

  const manifest = data?.manifest ?? null;
  const items = data?.items ?? [];

  const reasonLabelOf = (it: typeof items[number]) => it.returnReason ? returnReasonLabel(it.returnReason) : "-";
  const cityOf = (it: typeof items[number]) => it.receiverCity ?? "-";
  const totalOf = (it: typeof items[number]) =>
    parseFloat(it.shipmentCodAmount ?? "0") + parseFloat(it.shippingFee ?? "0");
  const amountOf = (it: typeof items[number]) => formatCurrency(totalOf(it));
  const phoneOf = (it: typeof items[number]) => it.receiverPhone ?? "-";
  const receiverOf = (it: typeof items[number]) => it.receiverName ?? "-";
  const shipmentOf = (it: typeof items[number]) => it.shipmentNumber;
  const senderOf = (it: typeof items[number]) => it.senderName ?? "-";
  const shipmentCodAmountOf = (it: typeof items[number]) => it.shipmentCodAmount != null ? formatCurrency(parseFloat(it.shipmentCodAmount)) : "-";
  const shippingFeeOf = (it: typeof items[number]) => it.shippingFee != null ? formatCurrency(parseFloat(it.shippingFee)) : "-";

  const uniqueReasons = useMemo(() => Array.from(new Set(items.map(reasonLabelOf))).sort(), [items]);
  const uniqueCities = useMemo(() => Array.from(new Set(items.map(cityOf))).sort(), [items]);
  const uniqueAmounts = useMemo(() => Array.from(new Set(items.map(amountOf))).sort(), [items]);
  const uniquePhones = useMemo(() => Array.from(new Set(items.map(phoneOf))).sort(), [items]);
  const uniqueReceivers = useMemo(() => Array.from(new Set(items.map(receiverOf))).sort(), [items]);
  const uniqueShipments = useMemo(() => Array.from(new Set(items.map(shipmentOf))).sort(), [items]);
  const uniqueSenders = useMemo(() => Array.from(new Set(items.map(senderOf))).sort(), [items]);
  const uniqueShipmentCodAmounts = useMemo(() => Array.from(new Set(items.map(shipmentCodAmountOf))).sort(), [items]);
  const uniqueShippingFees = useMemo(() => Array.from(new Set(items.map(shippingFeeOf))).sort(), [items]);

  const totalCod = items.reduce((sum, it) => sum + totalOf(it), 0);

  const clearAllFilters = () => {
    setReasonFilter(null); setCityFilter(null); setAmountFilter(null);
    setPhoneFilter(null); setReceiverFilter(null); setShipmentFilter(null);
    setSenderFilter(null); setShipmentCodAmountFilter(null); setShippingFeeFilter(null);
    setFilterModeOn(false);
  };
  const toggleFilterMode = () => {
    if (filterModeOn) { clearAllFilters(); } else { setFilterModeOn(true); }
  };

  const filteredItems = useMemo(() => {
    const q = itemsSearch.trim();
    const qDigits = q.replace(/\D/g, "");
    return items.filter(it => {
      if (reasonFilter !== null && !reasonFilter.has(reasonLabelOf(it))) return false;
      if (cityFilter !== null && !cityFilter.has(cityOf(it))) return false;
      if (amountFilter !== null && !amountFilter.has(amountOf(it))) return false;
      if (phoneFilter !== null && !phoneFilter.has(phoneOf(it))) return false;
      if (receiverFilter !== null && !receiverFilter.has(receiverOf(it))) return false;
      if (shipmentFilter !== null && !shipmentFilter.has(shipmentOf(it))) return false;
      if (senderFilter !== null && !senderFilter.has(senderOf(it))) return false;
      if (shipmentCodAmountFilter !== null && !shipmentCodAmountFilter.has(shipmentCodAmountOf(it))) return false;
      if (shippingFeeFilter !== null && !shippingFeeFilter.has(shippingFeeOf(it))) return false;
      if (!q) return true;
      return (
        (qDigits && (it.receiverPhone ?? "").replace(/\D/g, "").includes(qDigits)) ||
        (it.receiverName ?? "").includes(q) ||
        it.shipmentNumber.toLowerCase().includes(q.toLowerCase())
      );
    });
  }, [items, itemsSearch, reasonFilter, cityFilter, amountFilter, phoneFilter, receiverFilter, shipmentFilter, senderFilter, shipmentCodAmountFilter, shippingFeeFilter]);

  const closeMutation = useMutation({
    mutationFn: () => clientReturnManifestsApi.close(
      manifestId,
      selfDelivered ? (closeNotes.trim() || "العميل تم استلام مرتجعاته بنفسه") : (closeNotes.trim() || null),
      selfDelivered ? null : courierName.trim(),
    ),
    onSuccess: () => {
      toast({ title: "تم إغلاق البيان ✅", description: "تم فتح بيان مرتجعات جديد تلقائيًا" });
      qc.invalidateQueries({ queryKey: ["client-return-manifest-detail", manifestId] });
      qc.invalidateQueries({ queryKey: ["client-return-manifests"] });
      setCourierName("");
      setCloseNotes("");
      setSelfDelivered(false);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const buildPrintHtml = () => {
    if (!manifest) return "";
    const rowsHtml = items.map((it, i) => `
      <tr class="${i % 2 === 1 ? "mp-row-alt" : ""}">
        <td class="mp-td-center mp-td-muted">${i + 1}</td>
        <td class="mp-td-center mp-td-mono">${it.shipmentNumber}</td>
        <td>${it.senderName ?? "-"}</td>
        <td class="mp-td-bold">${it.receiverName ?? "-"}</td>
        <td class="mp-td-ltr mp-td-center">${it.receiverPhone ?? "-"}</td>
        <td class="mp-td-center">${it.receiverCity ?? "-"}</td>
        <td class="mp-td-center">${it.shipmentCodAmount != null ? formatCurrency(parseFloat(it.shipmentCodAmount)) : "-"}</td>
        <td class="mp-td-center">${it.shippingFee != null ? formatCurrency(parseFloat(it.shippingFee)) : "-"}</td>
        <td class="mp-td-center mp-td-bold mp-td-primary">${formatCurrency(totalOf(it))}</td>
        <td class="mp-td-center">
          <span class="mp-badge">مرتجع</span>
          <div class="mp-sub">${it.returnReason ? returnReasonLabel(it.returnReason) : "-"}</div>
        </td>
      </tr>`).join("");

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>بيان مرتجعات — ${manifest.manifestNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 landscape; margin: 8mm 10mm; }
    body { font-family:'Cairo','Segoe UI',Arial,sans-serif; font-size:9.5pt; color:#111; background:#fff; direction:rtl; padding:0 2mm; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .mp-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1e3a5f; padding-bottom:3mm; margin-bottom:4mm; }
    .mp-title { font-size:17pt; font-weight:900; color:#1e3a5f; }
    .mp-meta { font-size:9pt; color:#555; margin-top:1.5mm; line-height:1.8; }
    .mp-meta b { color:#1e293b; font-weight:700; }
    .mp-company-name { font-size:15pt; font-weight:900; color:#1e3a5f; text-align:left; letter-spacing:0.5px; }
    .mp-status { display:inline-block; font-size:8pt; font-weight:700; padding:1mm 3.5mm; border-radius:3mm; margin-top:2mm; }
    .mp-status-open { background:#dcfce7; color:#15803d; }
    .mp-status-closed { background:#e2e8f0; color:#475569; }
    .mp-summary { display:flex; gap:3mm; margin-bottom:4mm; }
    .mp-sum-card { flex:1; border:1.5px solid #cbd5e1; border-radius:2mm; padding:2.5mm 3mm; text-align:center; background:#f8fafc; }
    .mp-sum-card.mp-sum-total { border-color:#15803d; background:#f0fdf4; }
    .mp-sum-lbl { font-size:7.5pt; color:#64748b; margin-bottom:1mm; font-weight:700; }
    .mp-sum-val { font-size:12pt; font-weight:900; color:#1e3a5f; }
    .mp-sum-total .mp-sum-val { color:#15803d; }
    .mp-table { width:100%; border-collapse:collapse; margin-bottom:4mm; font-size:8.3pt; border:2px solid #1e3a5f; }
    .mp-table thead tr { background:#1e3a5f; }
    .mp-table th { color:#fff; font-size:8pt; font-weight:700; padding:2.2mm 2mm; text-align:center; border:1px solid rgba(255,255,255,0.4); white-space:nowrap; }
    .mp-table td { padding:2mm 2mm; border:1px solid #cbd5e1; vertical-align:middle; line-height:1.4; }
    .mp-row-alt td { background:#f4f7fa; }
    .mp-td-center { text-align:center; } .mp-td-bold { font-weight:700; }
    .mp-td-ltr { direction:ltr; }
    .mp-td-muted { color:#94a3b8; font-size:7.8pt; }
    .mp-td-mono { color:#64748b; font-size:7.8pt; }
    .mp-td-primary { color:#15803d; }
    .mp-sub { font-size:7pt; color:#b45309; margin-top:0.5mm; }
    .mp-badge { display:inline-block; font-size:7.3pt; font-weight:700; color:#b91c1c; background:#fee2e2; border-radius:2mm; padding:0.3mm 2mm; }
    .mp-footer { border-top:1.5px solid #e2e8f0; padding-top:4mm; margin-top:6mm; display:flex; justify-content:space-between; align-items:flex-end; }
    .mp-sig { min-width:50mm; text-align:center; }
    .mp-sig-title { font-size:9pt; color:#64748b; margin-bottom:8mm; font-weight:700; }
    .mp-sig-line { border-top:1.5px solid #333; width:80%; margin:0 auto; }
    .mp-sig-name { font-size:8pt; color:#555; margin-top:2mm; }
    .mp-print-footer { text-align:center; font-size:7.5pt; color:#94a3b8; margin-top:6mm; border-top:1px solid #e2e8f0; padding-top:2mm; }
  </style>
</head>
<body>
  <div class="mp-header">
    <div>
      <div class="mp-title">بيان مرتجعات</div>
      <div class="mp-meta">
        رقم البيان: <b>${manifest.manifestNumber}</b><br/>
        العميل: <b>${manifest.clientName ?? "-"}</b><br/>
        تاريخ الطباعة: <b>${format(new Date(), "yyyy/MM/dd")}</b>
      </div>
      <span class="mp-status ${manifest.status === "open" ? "mp-status-open" : "mp-status-closed"}">
        ${manifest.status === "open" ? "بيان مفتوح" : "بيان مغلق"}
      </span>
    </div>
    <div class="mp-company-name">STARK</div>
  </div>

  <div class="mp-summary">
    <div class="mp-sum-card">
      <div class="mp-sum-lbl">عدد المرتجعات</div>
      <div class="mp-sum-val">${items.length}</div>
    </div>
    <div class="mp-sum-card mp-sum-total">
      <div class="mp-sum-lbl">إجمالي القيمة</div>
      <div class="mp-sum-val">${formatCurrency(totalCod)}</div>
    </div>
  </div>

  <table class="mp-table">
    <thead>
      <tr>
        <th>#</th>
        <th>رقم الشحنة</th>
        <th>الراسل</th>
        <th>المستلم</th>
        <th>الهاتف</th>
        <th>المحافظة</th>
        <th>سعر الشحنة</th>
        <th>سعر الشحن</th>
        <th>الإجمالي</th>
        <th>الحالة</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="mp-footer">
    <div class="mp-sig">
      <div class="mp-sig-title">توقيع المندوب</div>
      <div class="mp-sig-line"></div>
    </div>
    <div class="mp-sig">
      <div class="mp-sig-title">توقيع العميل / المستلم</div>
      <div class="mp-sig-line"></div>
      <div class="mp-sig-name">${manifest.clientName ?? ""}</div>
    </div>
  </div>

  <div class="mp-print-footer">تم إنشاء هذا البيان بواسطة نظام STARK — ${format(new Date(), "yyyy/MM/dd HH:mm")}</div>
</body>
</html>`;
  };

  const handlePrint = () => {
    if (!manifest || !items.length) return;
    const html = buildPrintHtml();
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { window.print(); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  const handleExportExcel = async () => {
    if (!manifest || !items.length) return;
    const XLSX = await import("xlsx");
    const header = ["#", "رقم الشحنة", "الراسل", "المستلم", "الهاتف", "المحافظة", "سعر الشحنة", "سعر الشحن", "الإجمالي", "الحالة", "سبب المرتجع"];
    const rows = items.map((it, i) => [
      i + 1,
      it.shipmentNumber,
      it.senderName ?? "-",
      it.receiverName ?? "-",
      it.receiverPhone ?? "-",
      it.receiverCity ?? "-",
      it.shipmentCodAmount != null ? parseFloat(it.shipmentCodAmount) : 0,
      it.shippingFee != null ? parseFloat(it.shippingFee) : 0,
      totalOf(it),
      "مرتجع",
      it.returnReason ? returnReasonLabel(it.returnReason) : "-",
    ]);
    const infoRows = [
      ["رقم البيان", manifest.manifestNumber],
      ["العميل", manifest.clientName ?? "-"],
      ["الحالة", manifest.status === "open" ? "مفتوح" : "مغلق"],
      ["عدد المرتجعات", items.length],
      ["إجمالي القيمة", totalCod],
      [],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...infoRows, header, ...rows]);
    ws["!cols"] = [{ wch: 5 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "بيان المرتجعات");
    XLSX.writeFile(wb, `بيان-مرتجعات-${manifest.manifestNumber}.xlsx`);
    toast({ title: "تم تحميل ملف Excel" });
  };

  const handleExportPdf = async () => {
    if (!manifest || !items.length || exportingPdf) return;
    setExportingPdf(true);
    try {
      const html = buildPrintHtml();
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1123px;height:794px;border:0;";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument;
      if (!doc) throw new Error("تعذر تجهيز المستند");
      doc.open(); doc.write(html); doc.close();

      await new Promise<void>(resolve => {
        const check = () => {
          if (doc.readyState === "complete") resolve();
          else setTimeout(check, 80);
        };
        check();
      });
      await new Promise(r => setTimeout(r, 400));

      const body = doc.body;
      const canvas = await html2canvas(body, {
        scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false,
        windowWidth: body.scrollWidth, windowHeight: body.scrollHeight,
      });
      document.body.removeChild(iframe);

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const margin = 8;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;
      const imgData = canvas.toDataURL("image/png");
      const imageHeight = (canvas.height * usableWidth) / canvas.width;
      const pageHeightInCanvas = (usableHeight * canvas.width) / usableWidth;
      let position = 0; let pageIndex = 0;
      while (position < imageHeight) {
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, margin - position, usableWidth, imageHeight, undefined, "FAST");
        position += pageHeightInCanvas; pageIndex += 1;
      }
      pdf.save(`بيان-مرتجعات-${manifest.manifestNumber}.pdf`);
      toast({ title: "تم تحميل ملف PDF" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err?.message || "تعذر إنشاء ملف PDF", variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center text-sm text-muted-foreground animate-pulse" dir="rtl">
        جاري تحميل بيان المرتجعات...
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center space-y-3" dir="rtl">
        <p className="text-sm text-muted-foreground">تعذر العثور على بيان المرتجعات المطلوب</p>
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowRight className="w-4 h-4 ml-1" /> رجوع
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-4 sm:p-6 animate-in fade-in duration-500" dir="rtl">

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline" size="icon"
            className="h-8 w-8 rounded-full border-border shrink-0"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else navigate("/finance/clients");
            }}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black truncate">{manifest.manifestNumber}</h1>
              {manifest.status === "open" ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-emerald-900/30 text-emerald-400 border border-emerald-800">
                  <LockOpen className="w-2.5 h-2.5" /> مفتوح
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-muted text-muted-foreground border border-border">
                  <Lock className="w-2.5 h-2.5" /> مغلق
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {manifest.clientName ? `عميل: ${manifest.clientName} — ` : ""}
              {format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Button size="sm" variant="outline" className="gap-1 h-8 text-xs px-3" disabled={!items.length} onClick={handlePrint}>
            <Printer className="w-3 h-3" /> طباعة
          </Button>
          <Button size="sm" variant="outline" className="gap-1 h-8 text-xs px-3" disabled={!items.length || exportingPdf} onClick={handleExportPdf}>
            {exportingPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF
          </Button>
          <Button size="sm" variant="outline" className="gap-1 h-8 text-xs px-3" disabled={!items.length} onClick={handleExportExcel}>
            <FileSpreadsheet className="w-3 h-3" /> Excel
          </Button>
          {manifest.status === "open" && (
            <Button
              size="sm" variant="outline"
              className="gap-1 h-8 text-xs px-3 border-emerald-700 text-emerald-400 hover:bg-emerald-900/20"
              disabled={!items.length || closeMutation.isPending}
              onClick={() => setCloseConfirmOpen(true)}
            >
              <Lock className="w-3 h-3" /> إغلاق
            </Button>
          )}
        </div>
      </div>

      {/* ─── Mini stats ─── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center gap-0.5 py-3 rounded-xl bg-muted/20 border border-border/40">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-base font-black text-emerald-400">{items.length}</span>
          <span className="text-[10px] text-muted-foreground">عدد المرتجعات في البيان</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 py-3 rounded-xl bg-muted/20 border border-border/40">
          <Package className="w-4 h-4 text-foreground" />
          <span className="text-base font-black">{formatCurrency(totalCod)}</span>
          <span className="text-[10px] text-muted-foreground">إجمالي القيمة</span>
        </div>
      </div>

      {manifest.status === "open" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-800/40 bg-amber-950/10 px-3 py-2">
          <Hourglass className="w-3.5 h-3.5 text-amber-400 animate-[spin_2.5s_linear_infinite]" />
          <span className="text-[11px] font-bold text-amber-300">
            البيان حالياً قيد العمل — يتم إضافة شحنات العميل عليه
          </span>
        </div>
      )}

      {manifest.status === "closed" && (
        <div className="rounded-lg border border-sky-800/40 bg-sky-950/20 px-3 py-2.5 space-y-1">
          {manifest.closedAt && (
            <p className="text-[11px] text-sky-300">
              أُغلق بتاريخ {format(new Date(manifest.closedAt), "d MMMM yyyy", { locale: ar })}
            </p>
          )}
          {manifest.courierName ? (
            <p className="text-[11px] font-semibold text-sky-300">
              تم تسليم مرتجعات البيان من خلال المندوب: {manifest.courierName}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">لم يتم تسجيل اسم المندوب لهذا البيان</p>
          )}
          {manifest.notes && (
            <p className="text-[11px] text-amber-300/90">ملاحظات: {manifest.notes}</p>
          )}
        </div>
      )}

      {/* ─── قايمة المرتجعات ─── */}
      <div className="space-y-2">
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={itemsSearch}
                onChange={(e) => setItemsSearch(e.target.value)}
                placeholder="بحث برقم التليفون أو الاسم أو رقم الشحنة..."
                className="h-9 pr-8 text-xs"
              />
            </div>
            <Button
              variant={filterModeOn ? "default" : "outline"}
              size="sm"
              className="h-9 text-[11px] gap-1 shrink-0"
              onClick={toggleFilterMode}
            >
              {filterModeOn ? <FilterX className="w-3.5 h-3.5" /> : <Filter className="w-3.5 h-3.5" />}
              {filterModeOn ? "إلغاء الفلتر" : "إنشاء فلتر"}
            </Button>
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">لا توجد مرتجعات مسجّلة في هذا البيان</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">لا توجد نتائج مطابقة للبحث</div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>#</span>
                      {filterModeOn && (
                        <ColumnFilterButton values={uniqueShipments} selected={shipmentFilter} onChange={setShipmentFilter} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>الراسل</span>
                      {filterModeOn && (
                        <ColumnFilterButton values={uniqueSenders} selected={senderFilter} onChange={setSenderFilter} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>المستلم</span>
                      {filterModeOn && (
                        <ColumnFilterButton values={uniqueReceivers} selected={receiverFilter} onChange={setReceiverFilter} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>الهاتف</span>
                      {filterModeOn && (
                        <ColumnFilterButton values={uniquePhones} selected={phoneFilter} onChange={setPhoneFilter} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>المحافظة</span>
                      {filterModeOn && (
                        <ColumnFilterButton values={uniqueCities} selected={cityFilter} onChange={setCityFilter} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>سعر الشحنة</span>
                      {filterModeOn && (
                        <ColumnFilterButton values={uniqueShipmentCodAmounts} selected={shipmentCodAmountFilter} onChange={setShipmentCodAmountFilter} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>سعر الشحن</span>
                      {filterModeOn && (
                        <ColumnFilterButton values={uniqueShippingFees} selected={shippingFeeFilter} onChange={setShippingFeeFilter} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>الإجمالي</span>
                      {filterModeOn && (
                        <ColumnFilterButton values={uniqueAmounts} selected={amountFilter} onChange={setAmountFilter} />
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>الحالة</span>
                      {filterModeOn && (
                        <ColumnFilterButton values={uniqueReasons} selected={reasonFilter} onChange={setReasonFilter} />
                      )}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(it => (
                  <TableRow key={it.id}>
                    <TableCell className="text-center text-[11px] text-muted-foreground whitespace-nowrap">{it.shipmentNumber}</TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">{it.senderName ?? "-"}</TableCell>
                    <TableCell className="text-center text-xs font-medium whitespace-nowrap">{it.receiverName ?? "-"}</TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap" dir="ltr">{it.receiverPhone ?? "-"}</TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">{it.receiverCity ?? "-"}</TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">
                      {it.shipmentCodAmount != null ? formatCurrency(parseFloat(it.shipmentCodAmount)) : "-"}
                    </TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">
                      {it.shippingFee != null ? formatCurrency(parseFloat(it.shippingFee)) : "-"}
                    </TableCell>
                    <TableCell className="text-center text-xs font-bold text-primary whitespace-nowrap">
                      {formatCurrency(totalOf(it))}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[11px] font-semibold text-red-400">مرتجع</span>
                        <span className="text-[10px] text-amber-400">
                          {it.returnReason ? returnReasonLabel(it.returnReason) : "-"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" /> إغلاق بيان المرتجعات
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground leading-relaxed">
            سيتم إغلاق البيان <strong>{manifest.manifestNumber}</strong>، وفتح بيان مرتجعات جديد تلقائيًا لاستقبال أي مرتجعات قادمة.
          </p>

          <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selfDelivered}
              onChange={e => setSelfDelivered(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-xs font-semibold">العميل استلم مرتجعاته بنفسه (بدون مندوب)</span>
          </label>

          {!selfDelivered && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                يرجى إدخال اسم المندوب الذي سيتم تسليم المرتجع للعميل <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={courierName}
                onChange={e => setCourierName(e.target.value)}
                placeholder="اسم المندوب"
                className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 outline-none focus:border-primary"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">ملاحظات (اختياري)</label>
            <textarea
              value={closeNotes}
              onChange={e => setCloseNotes(e.target.value)}
              placeholder="مثال: العميل تم استلام مرتجعاته بنفسه"
              rows={2}
              className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={(!selfDelivered && !courierName.trim()) || closeMutation.isPending}
              onClick={() => { setCloseConfirmOpen(false); closeMutation.mutate(); }}
            >
              {closeMutation.isPending ? "جاري الإغلاق..." : "تأكيد الإغلاق"}
            </Button>
            <Button variant="outline" onClick={() => setCloseConfirmOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
