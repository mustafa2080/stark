import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, CheckSquare, Square, Printer } from "lucide-react";
import { format } from "date-fns";

const shipmentStatusLabels: Record<string, string> = {
  waiting:          "انتظار",
  confirmed:        "مؤكدة",
  picked_up:        "تم الاستلام",
  in_transit:       "قيد الشحن",
  out_for_delivery: "خرجت للتسليم",
  delivered:        "تم التسليم",
  delayed:          "متأخرة",
  returned:         "مرتجع",
  cancelled:        "ملغية",
  warehouse_ready:  "قيد الشحن في المخزن",
};

const shipmentStatusClasses: Record<string, string> = {
  waiting:          "bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",
  confirmed:        "bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",
  picked_up:        "bg-teal-600   dark:bg-teal-700       text-white        dark:text-white        border-teal-700    dark:border-teal-600",
  in_transit:       "bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",
  out_for_delivery: "bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",
  delivered:        "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700",
  delayed:          "bg-indigo-600 dark:bg-indigo-700       text-white        dark:text-white        border-indigo-700    dark:border-indigo-600",
  returned:         "bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",
  cancelled:        "bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",
  warehouse_ready:  "bg-teal-600   dark:bg-teal-700       text-white        dark:text-white        border-teal-700    dark:border-teal-600",
};

const PARCEL_LABELS_AR: Record<string, string> = {
  document: "مستندات", normal: "عادي", regular: "عادي", fragile: "قابل للكسر",
  heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس", food: "طعام", other: "أخرى",
};

const formatCurrency = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  const isWhole = rounded % 1 === 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rounded) + " ج.م";
};

export default function ClientShippingInvoices() {
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<Set<number>>(new Set());

  const { data: shipmentsData, isLoading } = useQuery({
    queryKey: ["client-shipments-invoices"],
    queryFn: () => apiFetch<{ data: any[]; total: number }>("/client-portal/shipments?status=waiting&pageSize=200"),
  });
  const warehouseShipments: any[] = shipmentsData?.data ?? [];

  const toggleShipment = (id: number) => {
    setSelectedShipmentIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── طباعة بوليصات الشحنات المحددة ────────────────────────────────────────
  const handleShipmentPrint = async () => {
    const selected = warehouseShipments.filter((sh: any) => selectedShipmentIds.has(sh.id));
    if (!selected.length) return;

    const logoUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(`${window.location.origin}/logo.jpg`);
      img.src = `${window.location.origin}/logo.jpg`;
    });

    const fmtCurr = (n: any) =>
      new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n || 0));

    const buildPage = (sh: any) => {
      const shipNum  = sh.shipmentNumber ?? `SHP#${String(sh.id).padStart(4,"0")}`;
      const tracking = sh.trackingNumber || sh.tracking_number || shipNum;
      const dateLabel = sh.createdAt ? format(new Date(sh.createdAt), "yyyy/MM/dd HH:mm") : "";
      const paymentMethodAr = sh.paymentMethod === "cod" ? "عند الاستلام" : sh.paymentMethod === "prepaid" ? "مدفوع مسبقاً" : "لاحقاً";
      const shippingFee  = Number(sh.shippingFee  || 0);
      const codAmount    = Number(sh.codAmount    || 0);
      const insuranceFee = Number(sh.insuranceFee || 0);
      const storedTotal  = Number(sh.totalAmount  || 0);
      const totalAmount  = storedTotal > 0 ? storedTotal : shippingFee + codAmount + insuranceFee;

      return `
<div class="page">
  <div class="header">
    <div class="header-title">
      بوليصة شحن
      ${sh.isReplacementRequested ? `<span class="repl-badge-print">🔄 طلب استبدال</span>` : ""}
      <span>رقم الشحنة: ${shipNum} &nbsp;|&nbsp; ${dateLabel}</span>
    </div>
    <img class="logo" src="${logoUrl}" alt="Logo" onerror="this.style.display='none'"/>
  </div>
  <div class="tracking-bar">
    <div class="tracking-item"><div class="t-label">رقم التتبع</div><div class="t-value highlight">${tracking}</div></div>
    <div class="tracking-item"><div class="t-label">طريقة الدفع</div><div class="t-value">${paymentMethodAr}</div></div>
    <div class="tracking-item"><div class="t-value brand">STARK</div></div>
  </div>
  <div class="parties">
    <div class="party-box receiver">
      <div class="party-title">📦 المستلم</div>
      <div class="party-name">${sh.receiverName || "—"}</div>
      ${[sh.receiverPhone, sh.receiverPhone2].filter(Boolean).length ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${[sh.receiverPhone, sh.receiverPhone2].filter(Boolean).join("  -  ")}</span></div>` : ""}
      ${sh.receiverCity ? `<div class="party-row"><span class="icon">📍</span><span class="val">${sh.receiverCity}</span></div>` : ""}
      ${sh.receiverAddress ? `<div class="party-row"><span class="icon">🏠</span><span class="val addr">${sh.receiverAddress}</span></div>` : ""}
    </div>
    <div class="party-box">
      <div class="party-title">📤 الراسل</div>
      <div class="party-name">${sh.senderName || "—"}</div>
      ${[sh.senderPhone, sh.senderPhone2].filter(Boolean).length ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${[sh.senderPhone, sh.senderPhone2].filter(Boolean).join("  -  ")}</span></div>` : ""}
      ${sh.senderCity ? `<div class="party-row"><span class="icon">📍</span><span class="val">${sh.senderCity}</span></div>` : ""}
    </div>
  </div>
  <div class="details-row" style="grid-template-columns:1fr 1fr">
    <div class="detail-box"><div class="d-label">نوع الشحنة</div><div class="d-value">${PARCEL_LABELS_AR[sh.parcelType] || sh.parcelType || "—"}</div></div>
    <div class="detail-box highlight"><div class="d-label">الإجمالي</div><div class="d-value">${fmtCurr(totalAmount)}</div></div>
  </div>
  ${(sh.canOpen !== null && sh.canOpen !== undefined) || (sh.isDivisible !== null && sh.isDivisible !== undefined) || sh.rejectionPolicy ? `
  <div class="details-row" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:4px">
    ${(sh.canOpen !== null && sh.canOpen !== undefined) ? `<div class="detail-box" style="background:#fff;${(sh.canOpen === 0 || sh.canOpen === "0") ? "border-color:#ef4444" : "border-color:#22c55e"}"><div class="d-label" style="${(sh.canOpen === 0 || sh.canOpen === "0") ? "color:#991b1b" : "color:#166534"}">حالة الشحنة (الفتح)</div><div class="d-value" style="${(sh.canOpen === 0 || sh.canOpen === "0") ? "color:#dc2626" : "color:#16a34a"}">${(sh.canOpen === 0 || sh.canOpen === "0") ? "غير مسموح بفتح الشحنة" : "مسموح بفتح الشحنة"}</div></div>` : `<div></div>`}
    ${(sh.isDivisible !== null && sh.isDivisible !== undefined) ? `<div class="detail-box" style="background:#fff;${(sh.isDivisible === 1 || sh.isDivisible === "1") ? "border-color:#22c55e" : "border-color:#ef4444"}"><div class="d-label" style="${(sh.isDivisible === 1 || sh.isDivisible === "1") ? "color:#166534" : "color:#991b1b"}">تجزئة الشحنة</div><div class="d-value" style="${(sh.isDivisible === 1 || sh.isDivisible === "1") ? "color:#16a34a" : "color:#dc2626"}">${(sh.isDivisible === 1 || sh.isDivisible === "1") ? "الشحنة قابلة للتجزئة" : "الشحنة غير قابلة للتجزئة"}</div></div>` : `<div></div>`}
    ${sh.rejectionPolicy ? `<div class="detail-box" style="background:#fff;${sh.rejectionPolicy === "free" ? "border-color:#22c55e" : "border-color:#f59e0b"}"><div class="d-label" style="${sh.rejectionPolicy === "free" ? "color:#166534" : "color:#92400e"}">حالة الرفض</div><div class="d-value" style="${sh.rejectionPolicy === "free" ? "color:#16a34a" : "color:#b45309"}">${sh.rejectionPolicy === "free" ? "الشحن مجانا" : "يتم دفع مبلغ الشحن كاملا"}</div></div>` : `<div></div>`}
  </div>` : ""}
  ${insuranceFee > 0 ? `
  <div class="details-row" style="grid-template-columns:1fr 1fr;margin-bottom:4px">
    <div class="detail-box"><div class="d-label">رسوم التأمين</div><div class="d-value">${fmtCurr(insuranceFee)}</div></div>
    <div></div>
  </div>` : ""}
  ${sh.notes ? `<div class="notes-box"><div class="n-title">ملاحظات</div><div class="n-text">${sh.notes}</div></div>` : ""}
  <div class="footer">
    <span>شحنة رقم: <strong>${shipNum}</strong>${sh.assignedUserName ? ` &nbsp;|&nbsp; المندوب: <strong>${sh.assignedUserName}</strong>` : ""}</span>
    <span class="date">طُبع في: ${dateLabel}</span>
  </div>
</div>`;
    };

    const builtPages = selected.map((sh: any) => buildPage(sh));
    const sheetsHtml: string[] = [];
    for (let i = 0; i < builtPages.length; i += 4) {
      sheetsHtml.push(`<div class="sheet">${builtPages.slice(i, i + 4).join("")}</div>`);
    }
    const pagesHtml = sheetsHtml.join("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>بوليصة شحن</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}
body{font-family:'Cairo',Tahoma,Arial,sans-serif;background:#fff;color:#111;direction:rtl;font-size:15px}
.sheet{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2mm;width:297mm;height:210mm;padding:2mm;box-sizing:border-box;page-break-after:always}
.sheet:last-child{page-break-after:auto}
.page{border:1.5px solid #111;border-radius:2mm;padding:8px 9px;background:#fff;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:4px;border-bottom:2.5px solid #111;margin-bottom:5px}
.header-title{font-size:16px;font-weight:900;letter-spacing:-0.5px}
.header-title span{font-size:8px;font-weight:700;color:#555;display:block;margin-top:2px}
.repl-badge-print{display:inline-block;font-size:9px;font-weight:800;color:#7c3aed;background:#f3e8ff;border:1px solid #c4b5fd;border-radius:4px;padding:1px 6px;margin-inline-start:6px;vertical-align:middle}
.logo{width:48px;height:48px;object-fit:contain;border-radius:5px}
.tracking-bar{background:#111;color:#fff;border-radius:5px;padding:4px 7px;display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:6px;flex-wrap:wrap}
.tracking-item{text-align:center}
.tracking-item .t-label{font-size:7px;color:#ccc;font-weight:700;margin-bottom:1px}
.tracking-item .t-value{font-size:10px;font-weight:900;color:#fff}
.tracking-item .t-value.highlight{color:#f0c040;font-size:13px}
.tracking-item .t-value.green{color:#4ade80}
.tracking-item .t-value.brand{font-size:18px;font-weight:900;letter-spacing:4px;color:#fff;font-style:italic}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:4px}
.party-box{border:1.5px solid #111;border-radius:3px;padding:5px 6px}
.party-box.receiver{border-width:2px}
.party-title{font-size:7px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;padding-bottom:1px;border-bottom:1px solid #e0e0e0}
.party-name{font-size:13px;font-weight:900;color:#111;margin-bottom:2px;line-height:1.15}
.party-row{display:flex;align-items:center;gap:3px;font-size:9px;font-weight:800;color:#333;margin-bottom:1px}
.party-row .icon{font-size:9px;flex-shrink:0}
.party-row .val{font-size:10px;font-weight:900;color:#111}
.party-row .val.phone{direction:ltr;display:inline-block}
.party-row .val.addr{font-size:8.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.details-row{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:4px}
.detail-box{border:1px solid #ddd;border-radius:2px;padding:4px;text-align:center;background:#fafafa}
.detail-box .d-label{font-size:7px;font-weight:800;color:#666;margin-bottom:1px}
.detail-box .d-value{font-size:12px;font-weight:900;color:#111}
.detail-box.highlight{background:#fff;border-color:#111;border-width:1.5px}
.detail-box.highlight .d-label{color:#666}
.detail-box.highlight .d-value{color:#111;font-size:12.5px}
.notes-box{border:1px dashed #ccc;border-radius:3px;padding:3px 6px;margin-bottom:3px;font-size:9px;font-weight:800;color:#333;line-height:1.3}
.notes-box .n-title{font-size:7px;font-weight:800;color:#888;margin-bottom:1px}
.notes-box .n-text{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden;word-break:break-word}
.footer{border-top:1.5px solid #ddd;padding-top:3px;margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:9px;font-weight:800;color:#555}
.footer .date{font-size:8px}
@media print{
  @page{size:A4 landscape;margin:0}
  html,body{width:297mm;height:210mm;overflow:hidden}
  .sheet{width:297mm;height:210mm;padding:2mm;gap:2mm}
  .page{padding:7px 8px}
  .header-title{font-size:15px}
  .logo{width:42px;height:42px}
  .tracking-bar{padding:3px 6px;margin-bottom:4px}
  .tracking-item .t-value{font-size:9.5px}
  .tracking-item .t-value.highlight{font-size:12px}
  .footer{padding-top:3px;font-size:8.5px}
  .header,.tracking-bar,.parties,.details-row,.notes-box{page-break-inside:avoid}
}
</style>
</head>
<body>${pagesHtml}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      if ((printWindow as any).document.fonts?.ready) {
        (printWindow as any).document.fonts.ready.then(() => {
          setTimeout(() => { printWindow.focus(); printWindow.print(); }, 300);
        });
      } else {
        setTimeout(() => { printWindow.focus(); printWindow.print(); }, 1200);
      }
    };
  };

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-in fade-in duration-500" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">فواتير الشحنات</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            تظهر الشحنات في مرحلة «قيد الانتظار»
          </p>
        </div>
        <Button onClick={() => void handleShipmentPrint()} className="gap-2 font-bold text-sm h-9" disabled={selectedShipmentIds.size === 0}>
          <Printer className="w-4 h-4" />طباعة ({selectedShipmentIds.size})
        </Button>
      </div>

      <Card className="border-border overflow-hidden">
        <div className="p-3 flex items-center gap-2 flex-wrap">
          <Button
            variant="outline" size="sm"
            className="h-8 text-xs gap-1 border-border"
            onClick={() => setSelectedShipmentIds(new Set(warehouseShipments.map((s: any) => s.id)))}
          >
            <CheckSquare className="w-3.5 h-3.5" />تحديد الكل ({warehouseShipments.length})
          </Button>
          {selectedShipmentIds.size > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setSelectedShipmentIds(new Set())}>
              <Square className="w-3.5 h-3.5" />إلغاء التحديد
            </Button>
          )}
          {selectedShipmentIds.size > 0 && (
            <span className="text-xs text-primary font-bold">{selectedShipmentIds.size} محدد</span>
          )}
          {!isLoading && (
            <span className="text-xs text-muted-foreground mr-auto">
              {warehouseShipments.length} شحنة
              {warehouseShipments.length > 0 && (
                <span className="mr-1 text-primary font-bold">
                  · {formatCurrency(warehouseShipments.reduce((s: number, sh: any) => s + (parseFloat(sh.codAmount) || 0), 0))} COD
                </span>
              )}
            </span>
          )}
        </div>
      </Card>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
      ) : warehouseShipments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {warehouseShipments.map((sh: any) => {
            const sel = selectedShipmentIds.has(sh.id);
            return (
              <Card
                key={sh.id}
                onClick={() => toggleShipment(sh.id)}
                className={`border p-4 cursor-pointer transition-all select-none ${
                  sel
                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/10"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {sel
                      ? <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                      : <Square className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <div>
                      <p className="font-bold text-sm leading-tight">{sh.receiverName || "—"}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        #{sh.shipmentNumber ?? String(sh.id).padStart(4, "0")}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[9px] font-bold border shrink-0 ${shipmentStatusClasses[sh.status] || ""}`}>
                    {shipmentStatusLabels[sh.status] ?? sh.status}
                  </Badge>
                </div>

                {sh.isReplacementRequested ? (
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-400 bg-purple-900/20 border border-purple-600 rounded-full px-2 py-0.5">
                      🔄 طلب استبدال
                    </span>
                  </div>
                ) : null}

                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {sh.receiverPhone && <span className="font-mono text-[11px] text-foreground">📞 {sh.receiverPhone}</span>}
                    {sh.receiverCity && <span className="font-semibold text-foreground">📍 {sh.receiverCity}</span>}
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-border/40">
                    <span className="text-foreground font-medium">الإجمالي</span>
                    <span className="font-bold text-primary">{formatCurrency(parseFloat(sh.totalAmount) || (parseFloat(sh.shippingFee) || 0) + (parseFloat(sh.codAmount) || 0) + (parseFloat(sh.insuranceFee) || 0))}</span>
                  </div>
                  {sh.description && (
                    <p className="text-foreground font-medium truncate">📦 {sh.description}</p>
                  )}
                  {sh.trackingNumber && (
                    <p className="font-mono text-[10px] opacity-70 dir-ltr text-left">🔎 {sh.trackingNumber}</p>
                  )}
                  <p className="text-[10px] opacity-60">{sh.createdAt ? format(new Date(sh.createdAt), "yyyy/MM/dd") : ""}</p>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-border p-12 text-center">
          <Truck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
          <p className="font-bold">لا توجد شحنات</p>
          <p className="text-sm text-muted-foreground mt-1">سيظهر هنا الشحنات التي حالتها «قيد الانتظار»</p>
        </Card>
      )}
    </div>
  );
}
