import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CheckCircle2, AlertCircle, TrendingUp, FileText,
  RefreshCcw, ArrowDownCircle, ArrowUpCircle, Receipt, Clock, RotateCcw,
  Download, FileSpreadsheet,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBrand, type BrandSettings } from "@/contexts/BrandContext";

// ── Helpers ─────────────────────────────────────────────────────────────
const fc = (n: number | string) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);

const fd = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }) : "—";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  wallet: "محفظة إلكترونية",
  instapay: "انستاباي",
  other: "أخرى",
};

const INVOICE_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  unpaid:  { label: "غير مدفوعة",   color: "#dc2626", bg: "rgba(239,68,68,0.12)" },
  partial: { label: "مدفوعة جزئياً", color: "#d97706", bg: "rgba(245,158,11,0.12)" },
  paid:    { label: "مدفوعة",        color: "#16a34a", bg: "rgba(34,197,94,0.12)" },
};

interface PaymentRow {
  id: number;
  amount: string;
  paymentMethod: string;
  receiptNumber: string | null;
  linkedShipmentId: number | null;
  notes: string | null;
  paidAt: string;
}

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  periodFrom: string | null;
  periodTo: string | null;
  shipmentIds: number[];
  totalAmount: string;
  paidAmount: string;
  status: string;
  createdAt: string;
}

interface ManifestTxnRow {
  type: "manifest" | "manifest_payment";
  date: string;
  label: string;
  amount: number;
  manifestId?: number;
  manifestNumber?: string;
}

interface WalletResponse {
  payments: PaymentRow[];
  invoices: InvoiceRow[];
  creditLimit: string;
  accountStatus: string;
  clientBalance: number;
  manifestTransactions: ManifestTxnRow[];
  manifestTransactionsSummary: { totalManifestsValue: number; totalManifestsPaid: number; netBalance: number };
}

// ── Summary card (glow + shadow + gradient) ────────────────────────────────
function SummaryCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="relative rounded-2xl p-4 overflow-hidden group transition-transform duration-300 hover:-translate-y-0.5"
      style={{
        background: `linear-gradient(160deg, ${color}14 0%, hsl(var(--muted)/0.35) 55%)`,
        border: `1px solid ${color}33`,
        boxShadow: `0 4px 20px -6px ${color}40, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}>
      {/* glow blob */}
      <div className="absolute -top-6 -left-6 w-20 h-20 rounded-full blur-2xl opacity-60 pointer-events-none transition-opacity duration-300 group-hover:opacity-90"
        style={{ background: color }} />
      <div className="relative flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(145deg, ${color} 0%, ${color}99 100%)`,
            boxShadow: `0 3px 12px -2px ${color}80, inset 0 1px 0 rgba(255,255,255,0.25)`,
          }}>
          <Icon size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
          <p className="text-base font-black text-foreground truncate">{value}</p>
        </div>
      </div>
      {sub && <p className="relative text-[10px] text-muted-foreground/70 mt-2 pt-2 border-t border-border/40">{sub}</p>}
    </div>
  );
}

// ── Financial hero banner ──────────────────────────────────────────────────
function FinanceHero({ outstanding, totalCollected, totalInvoiced }: { outstanding: number; totalCollected: number; totalInvoiced: number }) {
  const isOwing = outstanding > 0;
  const isOverpaid = outstanding < 0; // العميل اتصرفله أكتر من المستحق (رصيد زيادة له)
  const heroColor = isOwing ? "#f59e0b" : "#22c55e";

  return (
    <div className="relative rounded-3xl p-6 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${heroColor}1f 0%, hsl(var(--muted)/0.4) 45%, hsl(var(--muted)/0.25) 100%)`,
        border: `1px solid ${heroColor}30`,
        boxShadow: `0 12px 40px -12px ${heroColor}45, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}>
      {/* ambient glow blobs */}
      <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full blur-3xl opacity-40 pointer-events-none" style={{ background: heroColor }} />
      <div className="absolute -bottom-20 -left-16 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: "#3b82f6" }} />

      <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <p className="text-xs font-bold text-muted-foreground mb-1.5">
            {isOwing ? "المستحق لك حالياً" : isOverpaid ? "رصيد زيادة لك (مصروف أكتر من المستحق)" : "حسابك متوازن تماماً"}
          </p>
          <p className="text-4xl font-black tracking-tight" style={{ color: heroColor }}>
            {fc(Math.abs(outstanding))}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-2">
            من إجمالي مستحقات {fc(totalInvoiced)} — تم صرف {fc(totalCollected)} لك بالفعل
          </p>
        </div>

      </div>
    </div>
  );
}

// ─── تصدير Excel لكشف الحساب الشامل — ملخص مالي + حركة حساب الشحن + مدفوعات + فواتير (4 شيتات) ───
// brand: اسم/لوجو الشركة الحقيقيين (useBrand) — نفس نمط client-manifest-view.tsx.
async function exportWalletExcel(data: WalletResponse, brand: BrandSettings) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const brandName = brand.name || "STARK";
  workbook.creator = brandName;
  workbook.created = new Date();

  let logoImageId: number | null = null;
  if (brand.hasLogo && brand.logoUrl) {
    try {
      const resp = await fetch(brand.logoUrl);
      const blob = await resp.blob();
      const buf = await blob.arrayBuffer();
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("gif") ? "gif" : "jpeg";
      logoImageId = workbook.addImage({ buffer: buf as any, extension: ext as any });
    } catch {
      // فشل تحميل اللوجو مش لازم يمنع باقي التصدير
    }
  }

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

  // هيدر موحّد لكل شيت (اسم البراند/لوجو + عنوان الشيت + تاريخ الطباعة)
  const addHeader = (ws: any, colCount: number, subtitle: string) => {
    const lastCol = String.fromCharCode(64 + colCount);
    const logoRowHeight = logoImageId !== null ? 46 : 28;
    ws.mergeCells(`A1:${lastCol}1`);
    setCell(ws.getCell("A1"), logoImageId !== null ? "" : brandName, { fill: C.bg, font: { bold: true, size: 16, color: { argb: C.gold } }, align: { horizontal: "center", vertical: "middle" }, border: C.bg });
    ws.getRow(1).height = logoRowHeight;
    if (logoImageId !== null) {
      ws.addImage(logoImageId, { tl: { col: colCount - 2, row: 0.05 }, ext: { width: 60, height: logoRowHeight - 6 } });
      setCell(ws.getCell("A1"), brandName, { fill: C.bg, font: { bold: true, size: 16, color: { argb: C.gold } }, align: { horizontal: "center", vertical: "middle" }, border: C.bg });
    }
    ws.mergeCells(`A2:${lastCol}2`);
    setCell(ws.getCell("A2"), subtitle, { fill: C.bg, font: { bold: true, size: 12, color: { argb: C.gold } }, align: { horizontal: "center", vertical: "middle" }, border: C.bg });
    ws.getRow(2).height = 24;
    ws.mergeCells(`A3:${lastCol}3`);
    setCell(ws.getCell("A3"), `طُبع: ${printDate}`, { fill: C.panel, font: { size: 10, color: { argb: "FF6B7280" } }, align: { horizontal: "center", vertical: "middle" }, border: "FF334155" });
    ws.getRow(3).height = 22;
    ws.mergeCells(`A4:${lastCol}4`);
    setCell(ws.getCell("A4"), "", { fill: C.bg, border: C.bg });
    ws.getRow(4).height = 8;
  };

  const totalCollected = data.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalInvoiced = data.manifestTransactionsSummary?.totalManifestsValue ?? 0;
  const outstanding = data.clientBalance ?? 0;

  // ── شيت 1: الملخص المالي ──
  const wsSummary = workbook.addWorksheet("الملخص المالي", { views: [{ rightToLeft: true }] });
  wsSummary.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  wsSummary.columns = [{ key: "label", width: 30 }, { key: "value", width: 22 }];
  addHeader(wsSummary, 2, "الملخص المالي");
  const summaryRows: [string, number][] = [
    ["إجمالي المصروف لك", totalCollected],
    ["إجمالي المستحقات", totalInvoiced],
    ["المستحق لك حالياً", outstanding],
  ];
  summaryRows.forEach(([label, value], idx) => {
    const row = wsSummary.getRow(6 + idx);
    row.height = 26;
    setCell(row.getCell(1), label, { fill: idx % 2 === 0 ? C.white : C.offWhite, font: { bold: true, color: { argb: C.darkText } }, align: { horizontal: "right", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(2), value, { fill: idx % 2 === 0 ? C.white : C.offWhite, font: { bold: true, color: { argb: value >= 0 ? C.green : C.red } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: '#,##0 "ج.م"' });
  });

  // ── شيت 2: حركة حساب الشحن ──
  const wsManifest = workbook.addWorksheet("حركة حساب الشحن", { views: [{ state: "frozen", ySplit: 5, rightToLeft: true }] });
  wsManifest.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  wsManifest.columns = [{ key: "date", width: 16 }, { key: "label", width: 40 }, { key: "amount", width: 20 }];
  addHeader(wsManifest, 3, "حركة حساب الشحن");
  const mHeaderRow = wsManifest.getRow(5);
  mHeaderRow.values = ["التاريخ", "البيان", "المبلغ"];
  mHeaderRow.height = 24;
  mHeaderRow.eachCell((cell: any) => setCell(cell, cell.value, { fill: C.panel, font: { bold: true, color: { argb: C.white }, size: 10 }, align: { horizontal: "center", vertical: "middle" }, border: "FF334155" }));
  (data.manifestTransactions ?? []).forEach((t, idx) => {
    const row = wsManifest.getRow(6 + idx);
    row.height = 24;
    const baseFill = idx % 2 === 0 ? C.white : C.offWhite;
    setCell(row.getCell(1), format(new Date(t.date), "yyyy/MM/dd"), { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(2), t.label, { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "right", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(3), t.amount, { fill: baseFill, font: { bold: true, color: { argb: t.amount >= 0 ? C.green : C.red } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: '#,##0 "ج.م"' });
  });

  // ── شيت 3: سجل المدفوعات ──
  const wsPayments = workbook.addWorksheet("سجل المدفوعات", { views: [{ state: "frozen", ySplit: 5, rightToLeft: true }] });
  wsPayments.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  wsPayments.columns = [
    { key: "date", width: 16 }, { key: "amount", width: 16 }, { key: "method", width: 16 },
    { key: "receipt", width: 18 }, { key: "shipment", width: 14 }, { key: "notes", width: 26 },
  ];
  addHeader(wsPayments, 6, "سجل المدفوعات لك");
  const pHeaderRow = wsPayments.getRow(5);
  pHeaderRow.values = ["التاريخ", "المبلغ", "طريقة الدفع", "رقم الإيصال", "شحنة مرتبطة", "ملاحظات"];
  pHeaderRow.height = 24;
  pHeaderRow.eachCell((cell: any) => setCell(cell, cell.value, { fill: C.panel, font: { bold: true, color: { argb: C.white }, size: 10 }, align: { horizontal: "center", vertical: "middle" }, border: "FF334155" }));
  data.payments.forEach((p, idx) => {
    const row = wsPayments.getRow(6 + idx);
    row.height = 24;
    const baseFill = idx % 2 === 0 ? C.white : C.offWhite;
    setCell(row.getCell(1), format(new Date(p.paidAt), "yyyy/MM/dd"), { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(2), Number(p.amount), { fill: baseFill, font: { bold: true, color: { argb: C.green } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: '#,##0 "ج.م"' });
    setCell(row.getCell(3), PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod, { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(4), p.receiptNumber || "—", { fill: baseFill, font: { color: { argb: C.gray } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(5), p.linkedShipmentId ? `#${p.linkedShipmentId}` : "—", { fill: baseFill, font: { color: { argb: C.gray } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(6), p.notes || "—", { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "right", vertical: "middle", wrapText: true }, border: "FFD1D5DB" });
  });

  // ── شيت 4: الفواتير ──
  const wsInvoices = workbook.addWorksheet("الفواتير", { views: [{ state: "frozen", ySplit: 5, rightToLeft: true }] });
  wsInvoices.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  wsInvoices.columns = [
    { key: "num", width: 16 }, { key: "period", width: 24 }, { key: "count", width: 14 },
    { key: "total", width: 16 }, { key: "paid", width: 16 }, { key: "status", width: 16 }, { key: "created", width: 16 },
  ];
  addHeader(wsInvoices, 7, "الفواتير");
  const iHeaderRow = wsInvoices.getRow(5);
  iHeaderRow.values = ["رقم الفاتورة", "الفترة", "عدد الشحنات", "إجمالي المستحق", "المصروف لك", "الحالة", "تاريخ الإصدار"];
  iHeaderRow.height = 24;
  iHeaderRow.eachCell((cell: any) => setCell(cell, cell.value, { fill: C.panel, font: { bold: true, color: { argb: C.white }, size: 10 }, align: { horizontal: "center", vertical: "middle" }, border: "FF334155" }));
  data.invoices.forEach((inv, idx) => {
    const row = wsInvoices.getRow(6 + idx);
    row.height = 24;
    const baseFill = idx % 2 === 0 ? C.white : C.offWhite;
    const meta = INVOICE_STATUS_META[inv.status] ?? { label: inv.status, color: "#64748b" };
    setCell(row.getCell(1), inv.invoiceNumber, { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(2), inv.periodFrom && inv.periodTo ? `${format(new Date(inv.periodFrom), "yyyy/MM/dd")} - ${format(new Date(inv.periodTo), "yyyy/MM/dd")}` : "—", { fill: baseFill, font: { color: { argb: C.gray } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(3), inv.shipmentIds?.length ?? 0, { fill: baseFill, font: { color: { argb: C.gray } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(4), Number(inv.totalAmount), { fill: baseFill, font: { bold: true, color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: '#,##0 "ج.م"' });
    setCell(row.getCell(5), Number(inv.paidAmount), { fill: baseFill, font: { bold: true, color: { argb: C.green } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: '#,##0 "ج.م"' });
    setCell(row.getCell(6), meta.label, { fill: baseFill, font: { bold: true, color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
    setCell(row.getCell(7), format(new Date(inv.createdAt), "yyyy/MM/dd"), { fill: baseFill, font: { color: { argb: C.gray } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
  });

  [wsSummary, wsManifest, wsPayments, wsInvoices].forEach((ws) => {
    ws.eachRow((row: any) => {
      row.eachCell((cell: any) => { if (!cell.alignment) cell.alignment = { horizontal: "right", vertical: "middle" }; });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `كشف-حساب-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── طباعة احترافية لكشف الحساب الشامل — نافذة منفصلة بتصميم A4 (نفس أسلوب client-manifest-view) ───
function buildWalletPrintHtml(data: WalletResponse, brand: BrandSettings) {
  const brandName = brand.name || "STARK";
  const logoHtml = brand.hasLogo && brand.logoUrl
    ? `<img src="${brand.logoUrl}" class="mp-logo-img" alt="${brandName}" />`
    : `<div class="mp-company-name">${brandName}</div>`;
  const printDate = format(new Date(), "yyyy/MM/dd HH:mm");

  const totalCollected = data.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalInvoiced = data.manifestTransactionsSummary?.totalManifestsValue ?? 0;
  const outstanding = data.clientBalance ?? 0;

  const manifestRows = (data.manifestTransactions ?? [])
    .map((t, idx) => `
      <tr class="${idx % 2 === 1 ? "mp-row-alt" : ""}">
        <td class="mp-td-center mp-td-muted">${fd(t.date)}</td>
        <td>${t.label}</td>
        <td class="mp-td-center mp-td-bold" style="color:${t.amount >= 0 ? "#15803d" : "#dc2626"}">${t.amount >= 0 ? "+" : ""}${fc(t.amount)}</td>
      </tr>`).join("");

  const paymentRows = data.payments
    .map((p, idx) => `
      <tr class="${idx % 2 === 1 ? "mp-row-alt" : ""}">
        <td class="mp-td-center mp-td-muted">${fd(p.paidAt)}</td>
        <td class="mp-td-center mp-td-bold" style="color:#15803d">${fc(p.amount)}</td>
        <td class="mp-td-center">${PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</td>
        <td class="mp-td-center mp-td-muted">${p.receiptNumber || "-"}</td>
        <td class="mp-td-center mp-td-muted">${p.linkedShipmentId ? `#${p.linkedShipmentId}` : "-"}</td>
      </tr>`).join("");

  const invoiceRows = data.invoices
    .map((inv, idx) => {
      const meta = INVOICE_STATUS_META[inv.status] ?? { label: inv.status, color: "#64748b", bg: "#f1f5f9" };
      return `
      <tr class="${idx % 2 === 1 ? "mp-row-alt" : ""}">
        <td class="mp-td-center mp-td-muted">${inv.invoiceNumber}</td>
        <td class="mp-td-center">${inv.periodFrom && inv.periodTo ? `${fd(inv.periodFrom)} - ${fd(inv.periodTo)}` : "-"}</td>
        <td class="mp-td-center">${inv.shipmentIds?.length ?? 0}</td>
        <td class="mp-td-center mp-td-bold">${fc(inv.totalAmount)}</td>
        <td class="mp-td-center" style="color:#15803d">${fc(inv.paidAmount)}</td>
        <td class="mp-td-center"><span class="mp-badge" style="color:${meta.color};background:${meta.bg}">${meta.label}</span></td>
      </tr>`;
    }).join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>كشف حساب</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 10mm 12mm; }
    body { font-family:'Cairo','Segoe UI',Arial,sans-serif; font-size:9.5pt; color:#111; background:#fff; direction:rtl; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .mp-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1e3a5f; padding-bottom:3mm; margin-bottom:4mm; }
    .mp-title { font-size:17pt; font-weight:900; color:#1e3a5f; }
    .mp-meta { font-size:9pt; color:#555; margin-top:1.5mm; line-height:1.8; }
    .mp-meta b { color:#1e293b; font-weight:700; }
    .mp-company-name { font-size:15pt; font-weight:900; color:#1e3a5f; text-align:left; letter-spacing:0.5px; }
    .mp-logo-img { max-height:16mm; max-width:45mm; object-fit:contain; }
    .mp-summary { display:flex; gap:3mm; margin-bottom:5mm; }
    .mp-sum-card { flex:1; border:1.5px solid #cbd5e1; border-radius:2mm; padding:3mm; text-align:center; background:#f8fafc; }
    .mp-sum-card.mp-sum-total { border-color:#15803d; background:#f0fdf4; }
    .mp-sum-card.mp-sum-due { border-color:#0284c7; background:#f0f9ff; }
    .mp-sum-lbl { font-size:8pt; color:#64748b; margin-bottom:1.5mm; font-weight:700; }
    .mp-sum-val { font-size:13pt; font-weight:900; color:#1e3a5f; }
    .mp-sum-total .mp-sum-val { color:#15803d; }
    .mp-sum-due .mp-sum-val { color:#0284c7; }
    .mp-section-title { font-size:11pt; font-weight:900; color:#1e3a5f; margin:5mm 0 2.5mm; padding-bottom:1.5mm; border-bottom:1.5px solid #cbd5e1; }
    .mp-table { width:100%; border-collapse:collapse; margin-bottom:2mm; font-size:8.3pt; border:2px solid #1e3a5f; }
    .mp-table thead tr { background:#1e3a5f; }
    .mp-table th { color:#fff; font-size:8pt; font-weight:700; padding:2.2mm 2mm; text-align:center; border:1px solid rgba(255,255,255,0.4); white-space:nowrap; }
    .mp-table td { padding:1.8mm 2mm; border:1px solid #cbd5e1; vertical-align:middle; line-height:1.35; }
    .mp-row-alt td { background:#f4f7fa; }
    .mp-td-center { text-align:center; } .mp-td-bold { font-weight:700; }
    .mp-td-muted { color:#94a3b8; font-size:7.8pt; }
    .mp-badge { display:inline-block; font-size:7.5pt; font-weight:700; border-radius:2mm; padding:0.5mm 2.5mm; }
    .mp-empty { text-align:center; color:#94a3b8; font-size:8.5pt; padding:4mm; }
    .mp-print-footer { text-align:center; font-size:7.5pt; color:#94a3b8; margin-top:6mm; border-top:1px solid #e2e8f0; padding-top:2mm; }
  </style>
</head>
<body>
  <div class="mp-header">
    <div>
      <div class="mp-title">كشف حساب مالي</div>
      <div class="mp-meta">تاريخ الطباعة: <b>${printDate}</b></div>
    </div>
    ${logoHtml}
  </div>

  <div class="mp-summary">
    <div class="mp-sum-card">
      <div class="mp-sum-lbl">إجمالي المصروف لك</div>
      <div class="mp-sum-val">${fc(totalCollected)}</div>
    </div>
    <div class="mp-sum-card mp-sum-total">
      <div class="mp-sum-lbl">إجمالي المستحقات</div>
      <div class="mp-sum-val">${fc(totalInvoiced)}</div>
    </div>
    <div class="mp-sum-card mp-sum-due">
      <div class="mp-sum-lbl">المستحق لك حالياً</div>
      <div class="mp-sum-val">${fc(outstanding)}</div>
    </div>
  </div>

  <div class="mp-section-title">تفاصيل حركة حساب الشحن</div>
  <table class="mp-table">
    <thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th></tr></thead>
    <tbody>${manifestRows || `<tr><td colspan="3" class="mp-empty">لا يوجد حركات</td></tr>`}</tbody>
  </table>

  <div class="mp-section-title">سجل المدفوعات لك</div>
  <table class="mp-table">
    <thead><tr><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>رقم الإيصال</th><th>شحنة مرتبطة</th></tr></thead>
    <tbody>${paymentRows || `<tr><td colspan="5" class="mp-empty">لا يوجد مدفوعات</td></tr>`}</tbody>
  </table>

  <div class="mp-section-title">الفواتير</div>
  <table class="mp-table">
    <thead><tr><th>رقم الفاتورة</th><th>الفترة</th><th>عدد الشحنات</th><th>إجمالي المستحق</th><th>المصروف لك</th><th>الحالة</th></tr></thead>
    <tbody>${invoiceRows || `<tr><td colspan="6" class="mp-empty">لا يوجد فواتير</td></tr>`}</tbody>
  </table>

  <div class="mp-print-footer">تم إنشاء هذا الكشف بواسطة نظام ${brandName} — ${printDate}</div>
</body>
</html>`;
}

function printWalletStatement(data: WalletResponse, brand: BrandSettings) {
  const html = buildWalletPrintHtml(data, brand);
  const win = window.open("", "_blank", "width=1000,height=750");
  if (!win) { window.print(); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 500);
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
            تصدير كشف الحساب
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
              <p className="text-[10px] text-muted-foreground mt-0.5">4 شيتات: ملخص + حركة + مدفوعات + فواتير</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => { onExportPDF(); onClose(); }}
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

// ── Section shell ─────────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden bg-muted/25 border border-border">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Icon size={16} className="text-muted-foreground" />
        <p className="text-sm font-black text-foreground">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════
export default function ClientWalletPage() {
  const { user } = useAuth();
  const { brand } = useBrand();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"payments" | "invoices">("payments");
  const [showExportDialog, setShowExportDialog] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<WalletResponse>({
    queryKey: ["client-portal-wallet"],
    queryFn: () => apiFetch("/client-portal/wallet"),
    enabled: !!user,
    staleTime: 20_000,
  });

  const payments = data?.payments ?? [];
  const invoices = data?.invoices ?? [];
  const manifestTxns = data?.manifestTransactions ?? [];

  const totalCollected = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  // ── المستحق/رصيد العميل: نفس مصدر الحقيقة الموحّد (بيانات حساب العميل
  // المقفولة ناقص السدادات — computeClosedManifestsForClient بالباك إند)، مش
  // نظام الفواتير القديم (clientInvoicesTable) اللي غالبًا فاضي للعملاء اللي
  // بيشتغلوا بنظام "بيان حساب العميل" — كان بيخلي الصفحة تقول "متوازن تمامًا"
  // برغم إن عليه مبلغ فعلي ظاهر صح في لوحة الأدمن.
  const totalInvoiced = data?.manifestTransactionsSummary?.totalManifestsValue ?? 0;
  const totalPaidOnInvoices = data?.manifestTransactionsSummary?.totalManifestsPaid ?? 0;
  const outstanding = data?.clientBalance ?? 0;

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-foreground">التسويات المالية</h1>
            <p className="text-sm text-muted-foreground mt-1">سجل مدفوعاتك وفواتيرك ومستحقاتك بالتفصيل</p>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button onClick={() => setShowExportDialog(true)} disabled={!data}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border disabled:opacity-50">
              <Download size={15} /> تصدير
            </button>
            <button onClick={() => setLocation("/client-returns")}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <RotateCcw size={15} /> المرتجعات
            </button>
            <button onClick={() => refetch()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <RefreshCcw size={15} className={isRefetching ? "animate-spin" : ""} /> تحديث
            </button>
          </div>
        </div>

        <ExportDialog
          open={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          onExportExcel={() => data && exportWalletExcel(data, brand)}
          onExportPDF={() => data && printWalletStatement(data, brand)}
        />

        {/* ── Financial hero ── */}
        <FinanceHero
          outstanding={outstanding}
          totalCollected={totalCollected}
          totalInvoiced={totalInvoiced}
        />

        {/* ── تفاصيل حركة حساب الشحن (بيانات مغلقة + سدادات) ── */}
        {manifestTxns.length > 0 && (
          <SectionCard title="تفاصيل حركة حساب الشحن" icon={FileText}>
            <div className="divide-y divide-border/60">
              {manifestTxns.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{fd(t.date)}</p>
                  </div>
                  <span className={cn("text-sm font-black shrink-0", t.amount >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {t.amount >= 0 ? "+" : ""}{fc(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={CheckCircle2} label="إجمالي المصروف لك" value={fc(totalCollected)} color="#22c55e" />
          <SummaryCard icon={Receipt} label="إجمالي المستحقات" value={fc(totalInvoiced)} color="#3b82f6" />
          <SummaryCard icon={AlertCircle} label="المستحق لك" value={fc(outstanding)} color="#f59e0b" />
        </div>

        {/* ── Tabs ── */}
        <div className="grid grid-cols-2 sm:flex items-center gap-2">
          <button onClick={() => setTab("payments")}
            className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-colors text-center",
              tab === "payments" ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground")}>
            <ArrowDownCircle size={14} className="inline-block ml-1.5 -mt-0.5" /> سجل المدفوعات لك ({payments.length})
          </button>
          <button onClick={() => setTab("invoices")}
            className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-colors text-center",
              tab === "invoices" ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground")}>
            <FileText size={14} className="inline-block ml-1.5 -mt-0.5" /> الفواتير ({invoices.length})
          </button>
        </div>

        {/* ── Payments Tab ── */}
        {tab === "payments" && (
          <SectionCard title="سجل المدفوعات لك" icon={ArrowDownCircle}>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-border">
              {isLoading ? (
                <div className="text-center py-10 text-muted-foreground text-sm">جارٍ التحميل...</div>
              ) : payments.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">لا يوجد مدفوعات مسجلة بعد</div>
              ) : payments.map(p => (
                <div key={p.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-foreground/60">
                      <Clock size={12} className="text-muted-foreground/50" /> {fd(p.paidAt)}
                    </span>
                    <span className="font-bold text-sm" style={{ color: "#22c55e" }}>{fc(p.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">طريقة الدفع</span>
                    <span className="text-foreground/70">{PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">رقم الإيصال</span>
                    <span className="font-mono text-muted-foreground">{p.receiptNumber || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">شحنة مرتبطة</span>
                    <span className="text-muted-foreground">{p.linkedShipmentId ? `#${p.linkedShipmentId}` : "—"}</span>
                  </div>
                  {p.notes && (
                    <div className="text-xs text-muted-foreground/70 pt-1 border-t border-border/40">{p.notes}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs" dir="rtl">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">التاريخ</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">المبلغ</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">طريقة الدفع</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">رقم الإيصال</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">شحنة مرتبطة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">جارٍ التحميل...</td></tr>
                  ) : payments.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">لا يوجد مدفوعات مسجلة بعد</td></tr>
                  ) : payments.map(p => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-3 text-foreground/60">
                        <span className="inline-flex items-center gap-1.5"><Clock size={12} className="text-muted-foreground/50" /> {fd(p.paidAt)}</span>
                      </td>
                      <td className="px-4 py-3 font-bold" style={{ color: "#22c55e" }}>{fc(p.amount)}</td>
                      <td className="px-4 py-3 text-foreground/70">{PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{p.receiptNumber || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.linkedShipmentId ? `#${p.linkedShipmentId}` : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground/70 max-w-[200px] truncate">{p.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Invoices Tab ── */}
        {tab === "invoices" && (
          <SectionCard title="الفواتير" icon={FileText}>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-border">
              {isLoading ? (
                <div className="text-center py-10 text-muted-foreground text-sm">جارٍ التحميل...</div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">لا يوجد فواتير مسجلة بعد</div>
              ) : invoices.map(inv => {
                const meta = INVOICE_STATUS_META[inv.status] ?? { label: inv.status, color: "#64748b", bg: "rgba(100,116,139,0.12)" };
                return (
                  <div key={inv.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-foreground/70">{inv.invoiceNumber}</span>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">الفترة</span>
                      <span className="text-muted-foreground">
                        {inv.periodFrom && inv.periodTo ? `${fd(inv.periodFrom)} — ${fd(inv.periodTo)}` : "—"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
                      <div>
                        <p className="text-[10px] text-muted-foreground">إجمالي المستحق</p>
                        <p className="text-xs font-bold text-foreground/90">{fc(inv.totalAmount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">المصروف لك</p>
                        <p className="text-xs font-bold" style={{ color: "#22c55e" }}>{fc(inv.paidAmount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">عدد الشحنات</p>
                        <p className="text-xs font-bold text-foreground/60">{inv.shipmentIds?.length ?? 0}</p>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70">تاريخ الإصدار: {fd(inv.createdAt)}</div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs" dir="rtl">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">رقم الفاتورة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">الفترة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">عدد الشحنات</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">إجمالي المستحق</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">المصروف لك</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">الحالة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">تاريخ الإصدار</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">جارٍ التحميل...</td></tr>
                  ) : invoices.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">لا يوجد فواتير مسجلة بعد</td></tr>
                  ) : invoices.map(inv => {
                    const meta = INVOICE_STATUS_META[inv.status] ?? { label: inv.status, color: "#64748b", bg: "rgba(100,116,139,0.12)" };
                    return (
                      <tr key={inv.id} className="border-t border-border">
                        <td className="px-4 py-3 font-mono text-foreground/70">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {inv.periodFrom && inv.periodTo ? `${fd(inv.periodFrom)} — ${fd(inv.periodTo)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground/60">{inv.shipmentIds?.length ?? 0}</td>
                        <td className="px-4 py-3 font-bold text-foreground/90">{fc(inv.totalAmount)}</td>
                        <td className="px-4 py-3" style={{ color: "#22c55e" }}>{fc(inv.paidAmount)}</td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{fd(inv.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

      </div>
    </div>
  );
}
