import { useState, useMemo, useRef, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowRight, Users, ShoppingBag, TrendingUp, TrendingDown,
  ChevronRight, Calendar, Package, Phone, MapPin,
  Clock, CheckCircle2, Target, Edit2, Check, X,
  Download, FileSpreadsheet, FileText, Loader2, Bell, RefreshCw,
} from "lucide-react";
import { format, formatDistanceToNow, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";
import { apiFetch } from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

// ── Glow style helpers ──────────────────────────────────────────────────────
const GLOW = {
  neutral: {
    style: {
      background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--card)/.80) 100%)",
      boxShadow: "0 0 0 1px hsl(var(--border)/.7), 0 4px 20px -6px rgba(99,102,241,.12), 0 1px 4px rgba(0,0,0,.18)",
      transition: "box-shadow .25s, transform .2s",
    },
  },
  teal: {
    style: {
      background: "linear-gradient(145deg, rgba(13,148,136,.12) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(13,148,136,.30), 0 4px 22px -6px rgba(13,148,136,.28), 0 0 40px -14px rgba(13,148,136,.20)",
    },
  },
  red: {
    style: {
      background: "linear-gradient(145deg, rgba(220,38,38,.10) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(220,38,38,.28), 0 4px 22px -6px rgba(220,38,38,.25), 0 0 40px -14px rgba(220,38,38,.18)",
    },
  },
  emerald: {
    style: {
      background: "linear-gradient(145deg, rgba(16,185,129,.10) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(16,185,129,.32), 0 4px 24px -6px rgba(16,185,129,.28), 0 0 44px -12px rgba(16,185,129,.22)",
    },
  },
  amber: {
    style: {
      background: "linear-gradient(145deg, rgba(245,158,11,.09) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(245,158,11,.28), 0 4px 22px -6px rgba(245,158,11,.22), 0 0 40px -14px rgba(245,158,11,.16)",
    },
  },
  blue: {
    style: {
      background: "linear-gradient(145deg, rgba(59,130,246,.10) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(59,130,246,.28), 0 4px 22px -6px rgba(59,130,246,.22), 0 0 40px -14px rgba(59,130,246,.16)",
    },
  },
  danger: {
    style: {
      background: "linear-gradient(145deg, rgba(226,75,74,.14) 0%, hsl(var(--card)/.90) 100%)",
      boxShadow: "0 0 0 1px rgba(226,75,74,.42), 0 4px 26px -4px rgba(226,75,74,.30), 0 0 48px -10px rgba(226,75,74,.24)",
    },
  },
} as const;


const fmt = (n: string | number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency", currency: "EGP", maximumFractionDigits: 0,
  }).format(Number(n));

// ── شريط التقدم للفاتورة — زي DeliveryBar ──────────────────────────────────
function InvoiceProgressBar({
  paid, total,
}: { paid: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.min((paid / total) * 100, 100);
  const unpaidPct = 100 - pct;
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden flex mt-2">
      <div className="h-1.5 bg-emerald-500" style={{ width: `${pct}%` }} />
      <div className="h-1.5 bg-red-500/40" style={{ width: `${unpaidPct}%` }} />
    </div>
  );
}

// ── أنواع البيانات ──────────────────────────────────────────────────────────
type SaleOrder = {
  id: number; soNumber: string; status: string; paymentStatus: string;
  totalAmount: string; paidAmount: string;
  createdAt: string; closedAt?: string | null;
  itemCount?: number;
};

type Client = {
  id: number; name: string; phone: string | null; phone2: string | null;
  email: string | null; address: string | null; city: string | null; region: string | null;
  creditLimit: string; totalOrders: number; totalSales: string; totalPaid: string;
  notes: string | null; isActive: boolean; createdAt: string;
};

type ClientDetail = Client & { orders: SaleOrder[]; deliveryRate?: number };

// ── بطاقة الفاتورة — زي ManifestCard بالظبط ────────────────────────────────
function InvoiceCard({ order, isLatest }: { order: SaleOrder; isLatest: boolean }) {
  const [, navigate] = useLocation();
  const total  = parseFloat(order.totalAmount ?? "0");
  const paid   = order.paymentStatus === "paid" ? total : parseFloat(order.paidAmount ?? "0");
  const unpaid = order.paymentStatus === "paid" ? 0 : Math.max(0, total - paid);
  const isProcessing = ["draft", "confirmed", "processing"].includes(order.status);
  const statusLabel = order.status === "draft" ? "مسودة" : order.status === "confirmed" ? "مؤكد" : "قيد التجهيز";

  return (
    <div
      className={`group flex items-stretch gap-0 hover:bg-muted/10 transition-colors cursor-pointer rounded-lg border ${
        isProcessing ? "border-amber-500/30 bg-amber-900/5" : "border-border bg-card/50"
      }`}
      onClick={() => navigate("/finance/sales")}
    >
      {/* شريط اللون الجانبي */}
      <div className={`w-1 rounded-r-lg shrink-0 ${isProcessing ? "bg-amber-500" : "bg-emerald-500"}`} />

      <div className="flex-1 px-4 py-3.5">
        {/* رأس البطاقة */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-sm">{order.soNumber}</span>
              {isLatest && isProcessing && (
                <Badge variant="outline" className="text-[9px] border-amber-500/50 bg-amber-900/20 text-amber-400">الأحدث</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" />
                {format(new Date(order.createdAt), "yyyy/MM/dd")}
              </span>
              {order.status === "delivered" && order.closedAt ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  سُلِّم {format(new Date(order.closedAt), "yyyy/MM/dd")}
                </span>
              ) : (
                <span className="text-amber-500">
                  منذ {formatDistanceToNow(new Date(order.createdAt), { locale: ar, addSuffix: false })}
                </span>
              )}
            </div>
          </div>

          {/* Badge الحالة + سهم */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={`text-[9px] font-bold border ${
                isProcessing
                  ? "border-amber-700 bg-amber-900/20 text-amber-400"
                  : "border-emerald-700 bg-emerald-900/20 text-emerald-400"
              }`}
            >
              {isProcessing
                ? <><Clock className="w-2.5 h-2.5 inline ml-0.5" />{statusLabel}</>
                : <><CheckCircle2 className="w-2.5 h-2.5 inline ml-0.5" />تم التسليم</>}
            </Badge>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>

        {/* أرقام الفاتورة */}
        <div className="flex items-center gap-3 mt-2 text-[11px] flex-wrap">
          {order.itemCount != null && (
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3 text-muted-foreground" />
              <span className="font-bold">{order.itemCount}</span>
              <span className="text-muted-foreground">صنف</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            <span className="font-bold">{fmt(paid)}</span> مدفوع
          </span>
          {unpaid > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <Clock className="w-3 h-3" />
              <span className="font-bold">{fmt(unpaid)}</span> متبقي
            </span>
          )}
          <span className="flex items-center gap-1 text-primary font-bold mr-auto">
            {fmt(total)}
          </span>
        </div>

        {/* شريط الدفع */}
        {total > 0 && <InvoiceProgressBar paid={paid} total={total} />}
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية — نسخة من ShippingCompanyDetailPage بمنطق العملاء ───────
export default function CommercialClientDetailPage() {
  const params   = useParams();
  const clientId = Number(params.id);
  const qc       = useQueryClient();

  // ── تعديل الهدف inline ──────────────────────────────────────────────────
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput,   setTargetInput]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const targetMutation = useMutation({
    mutationFn: (newLimit: number) =>
      apiFetch<any>(`/finance/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({ creditLimit: newLimit }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-detail", clientId] });
      setEditingTarget(false);
    },
  });

  const startEdit = (currentLimit: number) => {
    setTargetInput(String(currentLimit > 0 ? currentLimit : 1_000_000));
    setEditingTarget(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmEdit = () => {
    const val = parseFloat(targetInput.replace(/,/g, ""));
    if (!isNaN(val) && val > 0) targetMutation.mutate(val);
  };

  const { data, isLoading } = useQuery<ClientDetail>({
    queryKey: ["client-detail", clientId],
    queryFn: () => apiFetch<ClientDetail>(`/finance/clients/${clientId}`),
    enabled: !isNaN(clientId),
  });

  // ── تصدير Excel ──────────────────────────────────────────────────────────
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPDF,   setExportingPDF]   = useState(false);

  const exportExcel = useCallback(async () => {
    if (!data) return;
    setExportingExcel(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Caprina OS";
      wb.created = new Date();

      const ws = wb.addWorksheet("كشف الحساب", { views: [{ rightToLeft: true }] });

      const TARGET_VAL = parseFloat(data.creditLimit ?? "0") > 0 ? parseFloat(data.creditLimit) : 100;
      const tOrders = data.totalOrders ?? 0;
      const tSales  = parseFloat(data.totalSales ?? "0");
      const tPaid   = parseFloat(data.totalPaid  ?? "0");
      const tUnpaid = Math.max(0, tSales - tPaid);
      const pct     = Math.min((tOrders / TARGET_VAL) * 100, 100).toFixed(1);

      const bAll = (cell: any, color = "FFB0BEC5") => {
        const s = { style: "thin" as const, color: { argb: color } };
        cell.border = { top: s, left: s, bottom: s, right: s };
      };

      // ══ سطر 1: عنوان ══
      ws.mergeCells("A1:G1");
      const t1 = ws.getCell("A1");
      t1.value     = `كشف حساب — ${data.name}`;
      t1.font      = { name: "Arial", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
      t1.alignment = { horizontal: "center", vertical: "middle" };
      t1.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      ws.getRow(1).height = 44;

      // ══ سطر 2: تاريخ ══
      ws.mergeCells("A2:G2");
      const t2 = ws.getCell("A2");
      t2.value     = `تاريخ الإصدار: ${format(new Date(), "yyyy/MM/dd  HH:mm")}`;
      t2.font      = { name: "Arial", size: 9, italic: true, color: { argb: "FF94A3B8" } };
      t2.alignment = { horizontal: "center", vertical: "middle" };
      t2.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F1A2E" } };
      ws.getRow(2).height = 18;
      ws.getRow(3).height = 8;

      // ══ سطرات 4-5: ملخص أرقام (4 بلوكات) ══
      const smColors  = ["FF0D9488","FF16A34A","FFDC2626","FF1D4ED8"];
      const smBGs     = ["FF0D3331","FF052E16","FF450A0A","FF1E3A5F"];
      const smLabels  = ["إجمالي المبيعات","إجمالي المدفوع","المديونية",`تحقيق الهدف`];
      const smVals    = [tSales, tPaid, tUnpaid, parseFloat(pct)];
      const smFmts    = ['#,##0 "ج.م"','#,##0 "ج.م"','#,##0 "ج.م"','0.0"%"'];
      const smCols    = [["A","B"],["C","D"],["E","F"],["G","G"]];

      smLabels.forEach((lbl, i) => {
        const [c1, c2] = smCols[i];
        if (c1 !== c2) { ws.mergeCells(`${c1}4:${c2}4`); ws.mergeCells(`${c1}5:${c2}5`); }
        const hCell = ws.getCell(`${c1}4`);
        hCell.value     = lbl;
        hCell.font      = { name: "Arial", size: 9, bold: true, color: { argb: smColors[i] } };
        hCell.alignment = { horizontal: "center", vertical: "middle" };
        hCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: smBGs[i] } };
        bAll(hCell, smColors[i]);
        ws.getRow(4).height = 20;

        const vCell = ws.getCell(`${c1}5`);
        vCell.value     = smVals[i];
        vCell.numFmt    = smFmts[i];
        vCell.font      = { name: "Arial", size: 14, bold: true, color: { argb: smColors[i] } };
        vCell.alignment = { horizontal: "center", vertical: "middle" };
        vCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: smBGs[i] } };
        bAll(vCell, smColors[i]);
        ws.getRow(5).height = 32;
      });

      ws.getRow(6).height = 8;

      // ══ أعمدة الجدول ══
      ws.columns = [
        { key: "soNumber",  width: 20 },
        { key: "createdAt", width: 14 },
        { key: "status",    width: 16 },
        { key: "payStatus", width: 14 },
        { key: "total",     width: 18 },
        { key: "paid",      width: 18 },
        { key: "unpaid",    width: 18 },
      ];

      // ══ سطر 7: رأس الجدول ══
      const hdr = ws.addRow(["رقم الفاتورة","التاريخ","الحالة","حالة الدفع","الإجمالي","المدفوع","المتبقي"]);
      hdr.eachCell(cell => {
        cell.font      = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
        bAll(cell, "FF3B82F6");
      });
      hdr.height = 24;

      // ══ صفوف الفواتير ══
      const stMap: Record<string,string> = { draft:"مسودة", confirmed:"مؤكد", processing:"قيد التجهيز", delivered:"تم التسليم", closed:"مغلق" };
      const pyMap: Record<string,string> = { paid:"مسدد", partial:"جزئي", unpaid:"غير مسدد" };

      data.orders.forEach((o, i) => {
        const tot  = parseFloat(o.totalAmount ?? "0");
        const pd   = o.paymentStatus === "paid" ? tot : parseFloat(o.paidAmount ?? "0");
        const unp  = Math.max(0, tot - pd);
        const rowBG = i % 2 === 0 ? "FFF0F4FA" : "FFFFFFFF";
        const isProc = ["draft","confirmed","processing"].includes(o.status);

        const row = ws.addRow({
          soNumber:  o.soNumber,
          createdAt: format(new Date(o.createdAt), "yyyy/MM/dd"),
          status:    stMap[o.status]          ?? o.status,
          payStatus: pyMap[o.paymentStatus]   ?? o.paymentStatus,
          total: tot, paid: pd, unpaid: unp,
        });

        row.eachCell(cell => {
          cell.font      = { name: "Arial", size: 10, color: { argb: "FF1E293B" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: rowBG } };
          bAll(cell, "FFD1D5DB");
        });

        row.getCell(5).numFmt = '#,##0 "ج.م"';
        row.getCell(6).numFmt = '#,##0 "ج.م"';
        row.getCell(7).numFmt = '#,##0 "ج.م"';

        // لون خلية الحالة
        row.getCell(3).font = { name:"Arial", size:10, bold:true, color:{ argb: isProc ? "FFD97706" : "FF059669" } };
        row.getCell(3).fill = { type:"pattern", pattern:"solid", fgColor:{ argb: isProc ? "FFFEF3C7" : "FFD1FAE5" } };

        // لون المتبقي
        if (unp > 0) {
          row.getCell(7).font = { name:"Arial", size:10, bold:true, color:{ argb:"FFDC2626" } };
          row.getCell(7).fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFFEE2E2" } };
        } else {
          row.getCell(7).font = { name:"Arial", size:10, color:{ argb:"FF059669" } };
        }
        row.height = 22;
      });

      // ══ صف الإجمالي ══
      const totRow = ws.addRow(["","","","الإجمالي", tSales, tPaid, tUnpaid]);
      totRow.eachCell(cell => {
        cell.font      = { name:"Arial", size:11, bold:true, color:{ argb:"FFFFFFFF" } };
        cell.fill      = { type:"pattern", pattern:"solid", fgColor:{ argb:"FF1D4ED8" } };
        cell.alignment = { horizontal:"center", vertical:"middle" };
        bAll(cell, "FF60A5FA");
      });
      totRow.getCell(5).numFmt = '#,##0 "ج.م"';
      totRow.getCell(6).numFmt = '#,##0 "ج.م"';
      totRow.getCell(7).numFmt = '#,##0 "ج.م"';
      if (tUnpaid > 0) totRow.getCell(7).font = { name:"Arial", size:11, bold:true, color:{ argb:"FFFBBF24" } };
      totRow.height = 26;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `كشف-حساب-${data.name}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingExcel(false);
    }
  }, [data]);

  // ── تصدير PDF (print) ─────────────────────────────────────────────────────
  const exportPDF = useCallback(() => {
    if (!data) return;
    setExportingPDF(true);
    const TARGET_VAL = parseFloat(data.creditLimit ?? "0") > 0 ? parseFloat(data.creditLimit) : 100;
    const tOrders = data.totalOrders ?? 0;
    const tSales  = parseFloat(data.totalSales  ?? "0");
    const tPaid   = parseFloat(data.totalPaid   ?? "0");
    const tUnpaid = Math.max(0, tSales - tPaid);
    const pct     = Math.min((tOrders / TARGET_VAL) * 100, 100).toFixed(1);
    const fmtNum  = (n: number) => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
    const statusMap: Record<string, string> = {
      draft: "مسودة", confirmed: "مؤكد", processing: "قيد التجهيز", delivered: "تم التسليم", closed: "مغلق",
    };

    const rows = data.orders.map((o, i) => {
      const total  = parseFloat(o.totalAmount ?? "0");
      const paid   = o.paymentStatus === "paid" ? total : parseFloat(o.paidAmount ?? "0");
      const unpaid = Math.max(0, total - paid);
      const bg = i % 2 === 0 ? "#1e293b" : "#0f172a";
      return `
        <tr style="background:${bg}">
          <td>${o.soNumber}</td>
          <td>${format(new Date(o.createdAt), "yyyy/MM/dd")}</td>
          <td>${statusMap[o.status] ?? o.status}</td>
          <td>${fmtNum(total)}</td>
          <td style="color:#34d399">${fmtNum(paid)}</td>
          <td style="color:${unpaid > 0 ? "#f87171" : "#94a3b8"};font-weight:${unpaid > 0 ? "bold" : "normal"}">${fmtNum(unpaid)}</td>
        </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8">
<title>كشف حساب — ${data.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; padding: 32px; }
  h1  { font-size: 22px; font-weight: 900; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #64748b; margin-bottom: 20px; }
  .summary { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
  .stat { background: #1e293b; border-radius: 8px; padding: 12px; text-align: center; }
  .stat-label { font-size: 10px; color: #64748b; margin-bottom: 4px; }
  .stat-value { font-size: 16px; font-weight: 900; }
  .goal-bar { height: 4px; background: #334155; border-radius: 99px; margin-top: 6px; overflow:hidden; }
  .goal-fill { height: 4px; background: ${parseFloat(pct) >= 75 ? "#10b981" : parseFloat(pct) >= 50 ? "#f59e0b" : "#3b82f6"}; border-radius: 99px; width: ${pct}%; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #334155; padding: 10px 8px; text-align: center; font-size: 10px; color: #94a3b8; }
  td { padding: 9px 8px; text-align: center; border-bottom: 1px solid #1e293b; }
  tfoot td { background: #1d4ed8; font-weight: 900; font-size: 12px; padding: 11px 8px; }
  @media print { body { background: #fff; color: #000; } .stat { background: #f1f5f9; } th { background: #e2e8f0; color: #334155; } tfoot td { background: #1d4ed8; color: #fff; } }
</style></head>
<body>
  <h1>كشف حساب — ${data.name}</h1>
  <p class="meta">تاريخ الطباعة: ${format(new Date(), "yyyy/MM/dd HH:mm")}</p>
  <div class="summary">
    <div class="stat"><div class="stat-label">إجمالي الفواتير</div><div class="stat-value">${data.orders.length}</div></div>
    <div class="stat"><div class="stat-label">إجمالي المبيعات</div><div class="stat-value" style="color:#2dd4bf">${fmtNum(tSales)}</div></div>
    <div class="stat"><div class="stat-label">المديونية</div><div class="stat-value" style="color:#f87171">${fmtNum(tUnpaid)}</div></div>
    <div class="stat">
      <div class="stat-label">تحقيق الهدف</div>
      <div class="stat-value" style="color:${parseFloat(pct) >= 75 ? "#10b981" : parseFloat(pct) >= 50 ? "#f59e0b" : "#3b82f6"}">${pct}%</div>
      <div class="goal-bar"><div class="goal-fill"></div></div>
      <div style="font-size:9px;color:#64748b;margin-top:4px">الهدف: ${fmtNum(TARGET_VAL)}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الحالة</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">الإجمالي</td><td>${fmtNum(tSales)}</td><td>${fmtNum(tPaid)}</td><td>${fmtNum(tUnpaid)}</td></tr></tfoot>
  </table>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.onload = () => { win.print(); setExportingPDF(false); };
    } else {
      setExportingPDF(false);
    }
  }, [data]);

  if (isNaN(clientId))
    return <div className="p-8 text-center text-muted-foreground">معرّف غير صحيح</div>;

  const client      = data;
  const creditLimit = parseFloat(client?.creditLimit ?? "0");
  // ✅ totalSales و totalPaid بيجوا live من الـ API (محسوبين من الفواتير الفعلية)
  const totalSales  = parseFloat(client?.totalSales  ?? "0");
  const totalPaid   = parseFloat(client?.totalPaid   ?? "0");
  const allOrders        = data?.orders ?? [];
  // المديونية = إجمالي المبيعات - إجمالي المدفوع (محسوبين live من الـ API)
  const unpaid = Math.max(0, totalSales - totalPaid);
  // ✅ نسبة التسليم الحقيقية من الـ API (delivered ÷ total)
  const deliveryRate = data?.deliveryRate ?? 0;
  // نسبة تحقيق الهدف (عدد الأوردرات ÷ creditLimit كهدف)
  const totalOrdersCount = client?.totalOrders ?? 0;
  const salesPct    = Math.min((totalOrdersCount / (creditLimit > 0 ? creditLimit : 100)) * 100, 100);
  const remaining   = Math.max(0, creditLimit - totalOrdersCount);

  const processingOrders = allOrders.filter(o => ["draft", "confirmed", "processing"].includes(o.status));
  const deliveredOrders  = allOrders.filter(o => ["delivered", "closed"].includes(o.status));
  const latestProcessingId = processingOrders[0]?.id;

  const TARGET = creditLimit > 0 ? creditLimit : 100;
  const monthlyTarget = Math.round(TARGET / 12);

  // ── مؤشر الخطر 0–100 (كلما قل كان أأمن) ────────────────────────────────
  const riskScore = useMemo(() => {
    if (!client || allOrders.length === 0) return null;

    // 1. نسبة السداد (0–40 نقطة خطر) — كلما قلت النسبة زاد الخطر
    const payRate = totalSales > 0 ? totalPaid / totalSales : 0;
    const payRisk = Math.round((1 - payRate) * 40);

    // 2. عمر الديون (0–35 نقطة) — أقدم فاتورة غير مسددة
    const unpaidOrders = allOrders.filter(o => o.paymentStatus !== "paid");
    let debtAgeRisk = 0;
    if (unpaidOrders.length > 0) {
      const oldestDays = Math.max(...unpaidOrders.map(o => {
        const diff = Date.now() - new Date(o.createdAt).getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
      }));
      if (oldestDays > 90)      debtAgeRisk = 35;
      else if (oldestDays > 60) debtAgeRisk = 25;
      else if (oldestDays > 30) debtAgeRisk = 15;
      else                       debtAgeRisk = 5;
    }

    // 3. انتظام الشراء (0–25 نقطة) — لو مفيش أوردر آخر 60 يوم
    const sortedDates = allOrders
      .map(o => new Date(o.createdAt).getTime())
      .sort((a, b) => b - a);
    let regularityRisk = 0;
    if (sortedDates.length > 0) {
      const daysSinceLast = Math.floor((Date.now() - sortedDates[0]) / (1000 * 60 * 60 * 24));
      if (daysSinceLast > 90)      regularityRisk = 25;
      else if (daysSinceLast > 60) regularityRisk = 18;
      else if (daysSinceLast > 30) regularityRisk = 10;
      else                          regularityRisk = 0;
    }

    const total = Math.min(100, payRisk + debtAgeRisk + regularityRisk);
    return { total, payRisk, debtAgeRisk, regularityRisk };
  }, [client, allOrders, totalSales, totalPaid]);
  // ── بيانات الـ Donut chart ───────────────────────────────────────────────
  const donutData = useMemo(() => [
    { name: "الأوردرات الفعلية", value: Math.min(totalOrdersCount, TARGET) },
    { name: "المتبقي للهدف",     value: Math.max(0, TARGET - totalOrdersCount) },
  ], [totalOrdersCount, TARGET]);

  // ── بيانات الـ Line chart — آخر 6 أشهر ─────────────────────────────────
  const monthlyData = useMemo(() => {
    const months: { label: string; sales: number; target: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d     = subMonths(new Date(), i);
      const start = startOfMonth(d);
      const end   = endOfMonth(d);
      // عدد الأوردرات في الشهر
      const ordersCount = allOrders.filter(o => {
          const cd = new Date(o.createdAt);
          return cd >= start && cd <= end;
        }).length;
      months.push({
        label: format(d, "MMM", { locale: ar }),
        sales: ordersCount,
        target: monthlyTarget,
      });
    }
    return months;
  }, [allOrders, monthlyTarget]);

  // ── أكثر المنتجات شراءً ──────────────────────────────────────────────────
  const { data: topProductsData } = useQuery<{
    items: { productName: string; quantity: number; totalValue: number; percentage: number }[];
    grandTotal: number;
  }>({
    queryKey: ["client-top-products", clientId],
    queryFn:  () => apiFetch(`/finance/clients/${clientId}/top-products`),
    enabled:  !isNaN(clientId),
  });

  const PRODUCT_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899"];

  // ── معدل تكرار الشراء ────────────────────────────────────────────────────
  const purchaseFrequency = useMemo(() => {
    if (!allOrders || allOrders.length === 0) return null;

    // ترتيب الفواتير من الأقدم للأحدث
    const sorted = [...allOrders]
      .map(o => new Date(o.createdAt).getTime())
      .sort((a, b) => a - b);

    const lastOrderDate = new Date(sorted[sorted.length - 1]);
    const daysSinceLast = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));

    // متوسط الأيام بين كل فاتورة والتالية
    let avgDays: number | null = null;
    if (sorted.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const diff = Math.floor((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24));
        gaps.push(diff);
      }
      avgDays = Math.round(gaps.reduce((s, d) => s + d, 0) / gaps.length);
    }

    // هل فاتت أكثر من 30 يوم؟
    const isOverdue = daysSinceLast > 30;
    // هل قريب من الـ 30 يوم؟ (بين 20 و30)
    const isWarning = daysSinceLast >= 20 && daysSinceLast <= 30;

    return { lastOrderDate, daysSinceLast, avgDays, isOverdue, isWarning };
  }, [allOrders]);

  // ── توقع اكتمال الهدف ────────────────────────────────────────────────────
  const goalForecast = useMemo(() => {
    if (!allOrders || allOrders.length === 0) return null;
    if (totalSales >= TARGET) return { done: true, completionDate: null, monthsLeft: 0, dailyRate: 0, confidence: "high" as const };

    const now = Date.now();

    // الـ span من أقدم فاتورة لحد دلوقتي — بيشتغل حتى مع فاتورة واحدة
    const sorted = [...allOrders].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const oldestTs  = new Date(sorted[0].createdAt).getTime();
    const spanDays  = Math.max((now - oldestTs) / (1000 * 60 * 60 * 24), 1);
    const dailyRate = totalSales / spanDays;

    if (dailyRate <= 0) return null;

    const remaining  = TARGET - totalSales;
    const daysNeeded = Math.ceil(remaining / dailyRate);

    // guard: أكثر من 10 سنين = توقع مش منطقي
    if (daysNeeded > 3650) return null;

    const completionDate = new Date(now + daysNeeded * 24 * 60 * 60 * 1000);
    if (isNaN(completionDate.getTime())) return null;

    const monthsLeft = Math.ceil(daysNeeded / 30);

    const confidence: "high" | "medium" | "low" =
      allOrders.length >= 5 && spanDays >= 30 ? "high"
      : allOrders.length >= 2 ? "medium"
      : "low";

    return { done: false, completionDate, monthsLeft, daysNeeded, dailyRate, confidence };
  }, [allOrders, totalSales, TARGET]);

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ─── Header — زي ShippingCompanyDetailPage ─── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/finance/clients">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-border">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{client?.name ?? "…"}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {client?.phone && (
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</span>
              )}
              {(client?.city || client?.address) && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {[client.address, client.city, client.region].filter(Boolean).join("، ")}
                </span>
              )}
              <Badge variant="outline" className={`text-[9px] font-bold border ${
                client?.isActive
                  ? "border-emerald-800 bg-emerald-900/30 text-emerald-400"
                  : "border-border text-muted-foreground"
              }`}>
                {client?.isActive ? "نشط" : "موقف"}
              </Badge>
            </div>
          </div>
        </div>
        {/* بدون زر "بيان جديد" — مش محتاجينه هنا */}
        {/* ─── أزرار التصدير ─── */}
        {client && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              disabled={exportingExcel}
              className="h-8 gap-1.5 text-xs border-emerald-800 text-emerald-400 hover:bg-emerald-900/20"
            >
              {exportingExcel
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileSpreadsheet className="w-3.5 h-3.5" />}
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportPDF}
              disabled={exportingPDF}
              className="h-8 gap-1.5 text-xs border-blue-800 text-blue-400 hover:bg-blue-900/20"
            >
              {exportingPDF
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5" />}
              PDF
            </Button>
          </div>
        )}
      </div>

      {/* ─── Stats Cards — زي شركات الشحن بس بأرقام العميل ─── */}
      {!isLoading && client && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="card-glow border-border p-3 text-center" style={GLOW.neutral.style}>
            <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي الفواتير</p>
            <p className="text-2xl font-black">{allOrders.length}</p>
            <p className="text-[10px] text-muted-foreground">{processingOrders.length} جارية · {deliveredOrders.length} مكتملة</p>
          </Card>
          <Card className="card-glow border-teal-900/40 p-3 text-center" style={GLOW.teal.style}>
            <p className="text-[10px] text-teal-400 mb-0.5">إجمالي المبيعات</p>
            <p className="text-xl font-black text-teal-400">{fmt(totalSales)}</p>
            <p className="text-[10px] text-teal-600">{salesPct.toFixed(1)}% من الهدف</p>
          </Card>
          <Card className="card-glow border-red-900/40 p-3 text-center" style={GLOW.red.style}>
            <p className="text-[10px] text-red-400 mb-0.5">المديونية</p>
            <p className="text-xl font-black text-red-400">{fmt(unpaid)}</p>
            <p className="text-[10px] text-muted-foreground">مدفوع: {fmt(totalPaid)}</p>
          </Card>
          <Card
            className={`card-glow p-3 text-center border ${salesPct >= 75 ? "border-emerald-900/40" : salesPct >= 50 ? "border-amber-900/40" : "border-primary/30"}`}
            style={salesPct >= 75 ? GLOW.emerald.style : salesPct >= 50 ? GLOW.amber.style : GLOW.blue.style}
          >
            <p className="text-[10px] text-muted-foreground mb-0.5">تحقيق الهدف</p>
            <p className={`text-2xl font-black ${salesPct >= 75 ? "text-emerald-400" : salesPct >= 50 ? "text-amber-400" : "text-primary"}`}>
              {salesPct.toFixed(1)}%
            </p>
            <div className="w-full bg-muted/30 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all ${salesPct >= 75 ? "bg-emerald-500" : salesPct >= 50 ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${Math.min(salesPct, 100)}%` }}
              />
            </div>

            {/* الهدف قابل للتعديل inline */}
            {editingTarget ? (
              <div className="flex items-center gap-1 mt-2 justify-center">
                <Input
                  ref={inputRef}
                  type="number"
                  value={targetInput}
                  onChange={e => setTargetInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") setEditingTarget(false); }}
                  className="h-6 text-[11px] text-center w-24 px-1 bg-background border-primary/50"
                />
                <button
                  onClick={confirmEdit}
                  disabled={targetMutation.isPending}
                  className="w-5 h-5 rounded flex items-center justify-center bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60 transition-colors"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setEditingTarget(false)}
                  className="w-5 h-5 rounded flex items-center justify-center bg-muted/40 text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEdit(creditLimit)}
                className="flex items-center justify-center gap-1 mt-1.5 mx-auto group"
              >
                <p className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                  {creditLimit > 0 ? `هدف ${creditLimit} أوردر` : `هدف 100 أوردر`}
                </p>
                <Edit2 className="w-2.5 h-2.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </button>
            )}
          </Card>
        </div>
      )}

      {/* ─── Charts: Donut + Line ─── */}
      {!isLoading && client && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Donut — مقياس الهدف */}
          <Card className="card-glow border-border p-4" style={GLOW.neutral.style}>
            <p className="text-xs font-bold mb-3 flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
              مقياس الهدف
            </p>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0" style={{ width: 110, height: 110 }}>
                <PieChart width={110} height={110}>
                  <Pie
                    data={donutData}
                    cx={55} cy={55}
                    innerRadius={34} outerRadius={50}
                    startAngle={90} endAngle={-270}
                    dataKey="value" strokeWidth={0}
                  >
                    <Cell fill={salesPct >= 75 ? "#10b981" : salesPct >= 50 ? "#f59e0b" : "#3b82f6"} />
                    <Cell fill="hsl(var(--muted)/0.3)" />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className={`text-lg font-black leading-none ${salesPct >= 75 ? "text-emerald-400" : salesPct >= 50 ? "text-amber-400" : "text-blue-400"}`}>
                    {Math.round(salesPct)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">من الهدف</p>
                </div>
              </div>
              <div className="flex-1 space-y-2.5">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: salesPct >= 75 ? "#10b981" : salesPct >= 50 ? "#f59e0b" : "#3b82f6" }} />
                    <p className="text-[10px] text-muted-foreground">الأوردرات الفعلية</p>
                  </div>
                  <p className="text-sm font-black text-primary">{totalOrdersCount} أوردر</p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />
                    <p className="text-[10px] text-muted-foreground">المتبقي للهدف</p>
                  </div>
                  <p className="text-sm font-black text-muted-foreground">{Math.max(0, TARGET - totalOrdersCount)} أوردر</p>
                </div>
                <div className="pt-1 border-t border-border">
                  <p className="text-[10px] text-muted-foreground">الهدف الكلي</p>
                  <p className="text-xs font-bold">{TARGET} أوردر</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Line chart — النمو الشهري */}
          <Card className="card-glow border-border p-4" style={GLOW.neutral.style}>
            <p className="text-xs font-bold mb-1 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
              النمو الشهري
            </p>
            <div className="flex items-center gap-3 mb-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-5 h-0.5 bg-blue-400 inline-block rounded" />المبيعات
              </span>
              <span className="flex items-center gap-1">
                <span className="w-5 h-0.5 border-t border-dashed border-amber-400 inline-block" />الهدف الشهري
              </span>
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={monthlyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}K` : String(v)} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, direction: "rtl" }}
                  formatter={(v: any, name: string) => [`${v} أوردر`, name === "sales" ? "الأوردرات" : "الهدف"]}
                  labelFormatter={(l) => `شهر ${l}`}
                />
                <ReferenceLine y={monthlyTarget} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
                <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2}
                  dot={{ fill: "#3b82f6", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[9px] text-muted-foreground text-center mt-1">
              الهدف الشهري: {monthlyTarget} أوردر
            </p>
          </Card>
        </div>
      )}

      {/* ─── مؤشر الخطر ─── */}
      {!isLoading && client && riskScore !== null && (() => {
        const s = riskScore.total;
        const isLow    = s <= 30;
        const isMed    = s > 30 && s <= 65;
        const isHigh   = s > 65;
        const color    = isLow ? "#10b981" : isMed ? "#f59e0b" : "#e24b4a";
        const bgClass  = isLow ? "border-emerald-900/40 bg-emerald-900/10" : isMed ? "border-amber-900/40 bg-amber-900/10" : "border-red-900/40 bg-red-900/10";
        const glowCls  = isLow ? "card-glow-emerald" : isMed ? "card-glow-amber" : "card-glow-danger";
        const label    = isLow ? "آمن" : isMed ? "تحت المراقبة" : "خطر مرتفع";
        const textCls  = isLow ? "text-emerald-400" : isMed ? "text-amber-400" : "text-red-400";

        const bars = [
          { label: "نسبة السداد",      max: 40, val: riskScore.payRisk,         icon: "ti-coin" },
          { label: "عمر الديون",       max: 35, val: riskScore.debtAgeRisk,     icon: "ti-calendar-x" },
          { label: "انتظام الشراء",   max: 25, val: riskScore.regularityRisk,  icon: "ti-repeat" },
        ];

        return (
          <Card className={`card-glow ${glowCls} border p-4 ${bgClass}`}
            style={isLow ? GLOW.emerald.style : isMed ? GLOW.amber.style : GLOW.danger.style}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold flex items-center gap-2">
                <i className="ti ti-shield-half" style={{ fontSize: 15, color }} aria-hidden="true" />
                مؤشر الخطر
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isLow ? "border-emerald-700 bg-emerald-900/30 text-emerald-400"
                : isMed ? "border-amber-700 bg-amber-900/30 text-amber-400"
                : "border-red-700 bg-red-900/30 text-red-400"
              }`}>{label}</span>
            </div>

            <div className="flex items-center gap-5">
              {/* الـ Score الكبير */}
              <div className="shrink-0 text-center w-20">
                <p className={`text-4xl font-black leading-none ${textCls}`}>{s}</p>
                <p className="text-[9px] text-muted-foreground mt-1">من 100</p>
                {/* شريط نصف دائري بسيط */}
                <div className="mt-2 w-full bg-muted/30 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${s}%`, background: color }} />
                </div>
              </div>

              {/* تفاصيل العوامل */}
              <div className="flex-1 space-y-2.5">
                {bars.map(b => {
                  const pct = b.max > 0 ? Math.round((b.val / b.max) * 100) : 0;
                  const barColor = pct >= 70 ? "#e24b4a" : pct >= 40 ? "#f59e0b" : "#10b981";
                  return (
                    <div key={b.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <i className={`ti ${b.icon}`} style={{ fontSize: 11 }} aria-hidden="true" />
                          {b.label}
                        </span>
                        <span className="text-[10px] font-bold" style={{ color: barColor }}>
                          {b.val}/{b.max}
                        </span>
                      </div>
                      <div className="w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[9px] text-muted-foreground mt-3 border-t border-border/50 pt-2">
              {isLow  && "العميل ملتزم بالسداد ونشيط في الشراء — لا توجد مخاطر حالياً."}
              {isMed  && "يوجد بعض التأخر في السداد أو انتظام الشراء — يُنصح بالمتابعة."}
              {isHigh && "تحذير: ديون متأخرة أو توقف في الشراء — يستلزم تدخلاً فورياً."}
            </p>
          </Card>
        );
      })()}

      {/* ─── أكثر المنتجات شراءً ─── */}
      {!isLoading && client && topProductsData && topProductsData.items.length > 0 && (
        <Card className="card-glow border-border p-4" style={GLOW.neutral.style}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-muted-foreground" />
              أكثر المنتجات شراءً
            </p>
            <span className="text-[10px] text-muted-foreground">
              إجمالي: {fmt(topProductsData.grandTotal)}
            </span>
          </div>

          <div className="space-y-3">
            {topProductsData.items.map((item, i) => (
              <div key={item.productName}>
                {/* الصف الرئيسي */}
                <div className="flex items-center gap-3 mb-1.5">
                  {/* الرقم */}
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 text-white"
                    style={{ background: PRODUCT_COLORS[i] }}
                  >
                    {i + 1}
                  </div>

                  {/* الاسم + الكمية */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold truncate">{item.productName}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {item.quantity.toLocaleString("ar-EG")} قطعة
                        </span>
                        <span className="text-[11px] font-black" style={{ color: PRODUCT_COLORS[i] }}>
                          {fmt(item.totalValue)}
                        </span>
                      </div>
                    </div>

                    {/* شريط النسبة */}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-muted/30 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full transition-all duration-700"
                          style={{ width: `${item.percentage}%`, background: PRODUCT_COLORS[i] }}
                        />
                      </div>
                      <span className="text-[10px] font-bold w-8 text-left shrink-0" style={{ color: PRODUCT_COLORS[i] }}>
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* mini donut للمقارنة البصرية */}
          {topProductsData.items.length > 1 && (
            <div className="mt-4 pt-3 border-t border-border flex items-center gap-4">
              <div className="shrink-0">
                <PieChart width={80} height={80}>
                  <Pie
                    data={topProductsData.items}
                    dataKey="totalValue"
                    nameKey="productName"
                    cx={40} cy={40}
                    innerRadius={22} outerRadius={36}
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                  >
                    {topProductsData.items.map((_, i) => (
                      <Cell key={i} fill={PRODUCT_COLORS[i]} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {topProductsData.items.map((item, i) => (
                  <div key={item.productName} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PRODUCT_COLORS[i] }} />
                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{item.productName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─── توقع اكتمال الهدف ─── */}
      {!isLoading && client && goalForecast && (() => {
        const gf = goalForecast;

        if (gf.done) return (
          <Card className="card-glow border-emerald-900/40 p-4" style={GLOW.emerald.style}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-900/40 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-400">🎉 تم تحقيق الهدف!</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  المبيعات {fmt(totalSales)} تجاوزت الهدف {fmt(TARGET)}
                </p>
              </div>
            </div>
          </Card>
        );

        const confColor   = gf.confidence === "high" ? "#10b981" : gf.confidence === "medium" ? "#f59e0b" : "#94a3b8";
        const confLabel   = gf.confidence === "high" ? "توقع موثوق" : gf.confidence === "medium" ? "توقع تقريبي" : "بيانات قليلة";
        const progressPct = Math.min((totalSales / TARGET) * 100, 100);
        const monthName   = gf.completionDate
          ? format(gf.completionDate, "MMMM yyyy", { locale: ar })
          : null;

        return (
          <Card className="card-glow border-border p-4" style={GLOW.neutral.style}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                توقع اكتمال الهدف
              </p>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ borderColor: confColor + "80", background: confColor + "15", color: confColor }}
              >
                {confLabel}
              </span>
            </div>

            {/* الشهر المتوقع — كبير في المنتصف */}
            <div className="text-center mb-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-[10px] text-muted-foreground mb-1">الشهر المتوقع لاكتمال الهدف</p>
              <p className="text-2xl font-black text-primary leading-none">{monthName}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {gf.daysNeeded! <= 30
                  ? `خلال ${gf.daysNeeded} يوم فقط 🚀`
                  : `بعد ~${gf.monthsLeft} شهر`}
              </p>
            </div>

            {/* شريط التقدم نحو الهدف */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5 text-[10px]">
                <span className="text-muted-foreground">المبيعات الحالية</span>
                <span className="font-bold">{progressPct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-muted/30 rounded-full h-3 overflow-hidden relative">
                <div
                  className="h-3 rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: progressPct >= 75 ? "#10b981" : progressPct >= 50 ? "#f59e0b" : "#3b82f6",
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[9px] text-muted-foreground">
                <span>{fmt(totalSales)}</span>
                <span>الهدف: {fmt(TARGET)}</span>
              </div>
            </div>

            {/* إحصائيات الحساب */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">المتبقي</p>
                <p className="text-xs font-black text-red-400">{fmt(TARGET - totalSales)}</p>
              </div>
              <div className="text-center border-x border-border/50">
                <p className="text-[9px] text-muted-foreground">معدل يومي</p>
                <p className="text-xs font-black text-primary">{fmt(Math.round(gf.dailyRate))}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">أيام متبقية</p>
                <p className="text-xs font-black">{gf.daysNeeded!.toLocaleString("ar-EG")}</p>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* ─── معدل تكرار الشراء ─── */}
      {!isLoading && client && purchaseFrequency && (() => {
        const pf = purchaseFrequency;
        const cardClass = pf.isOverdue
          ? "border-red-900/40 bg-red-900/10"
          : pf.isWarning
          ? "border-amber-900/40 bg-amber-900/10"
          : "border-border bg-card";
        const glowCard = pf.isOverdue ? "card-glow-danger" : pf.isWarning ? "card-glow-amber" : "card-glow";
        const textCls = pf.isOverdue ? "text-red-400" : pf.isWarning ? "text-amber-400" : "text-emerald-400";
        const badgeClass = pf.isOverdue
          ? "border-red-700 bg-red-900/30 text-red-400"
          : pf.isWarning
          ? "border-amber-700 bg-amber-900/30 text-amber-400"
          : "border-emerald-700 bg-emerald-900/30 text-emerald-400";
        const badgeLabel = pf.isOverdue ? "تنبيه — تجاوز 30 يوم" : pf.isWarning ? "قريب من 30 يوم" : "نشيط";

        return (
          <Card className={`card-glow ${glowCard} border p-4 ${cardClass}`}
            style={pf.isOverdue ? GLOW.danger.style : pf.isWarning ? GLOW.amber.style : GLOW.neutral.style}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                معدل تكرار الشراء
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${badgeClass}`}>
                {pf.isOverdue && <Bell className="w-2.5 h-2.5" />}
                {badgeLabel}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* آخر شراء */}
              <div className="text-center p-3 rounded-lg bg-muted/10 border border-border/50">
                <p className="text-[10px] text-muted-foreground mb-1">آخر شراء</p>
                <p className={`text-lg font-black leading-none ${textCls}`}>
                  {pf.daysSinceLast === 0 ? "اليوم" : `${pf.daysSinceLast}`}
                </p>
                {pf.daysSinceLast > 0 && (
                  <p className="text-[9px] text-muted-foreground mt-0.5">يوم مضى</p>
                )}
                <p className="text-[9px] text-muted-foreground mt-1 border-t border-border/30 pt-1">
                  {format(pf.lastOrderDate, "dd/MM/yyyy")}
                </p>
              </div>

              {/* متوسط الفترة */}
              <div className="text-center p-3 rounded-lg bg-muted/10 border border-border/50">
                <p className="text-[10px] text-muted-foreground mb-1">متوسط الفترة</p>
                {pf.avgDays !== null ? (
                  <>
                    <p className="text-lg font-black leading-none text-primary">{pf.avgDays}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">يوم / طلب</p>
                    <p className="text-[9px] text-muted-foreground mt-1 border-t border-border/30 pt-1">
                      من {allOrders.length} فاتورة
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-black leading-none text-muted-foreground">—</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">فاتورة واحدة</p>
                  </>
                )}
              </div>

              {/* التقييم */}
              <div className="text-center p-3 rounded-lg bg-muted/10 border border-border/50">
                <p className="text-[10px] text-muted-foreground mb-1">الحالة</p>
                <p className={`text-lg font-black leading-none ${textCls}`}>
                  {pf.isOverdue ? "⚠️" : pf.isWarning ? "⏳" : "✅"}
                </p>
                <p className={`text-[9px] font-bold mt-0.5 ${textCls}`}>
                  {pf.isOverdue ? "غائب" : pf.isWarning ? "تحت المراقبة" : "منتظم"}
                </p>
                <p className="text-[9px] text-muted-foreground mt-1 border-t border-border/30 pt-1">
                  {pf.isOverdue
                    ? `منذ ${pf.daysSinceLast} يوم`
                    : pf.avgDays !== null
                    ? `كل ~${pf.avgDays} يوم`
                    : "أول طلب"}
                </p>
              </div>
            </div>

            {/* شريط الـ 30 يوم */}
            {pf.daysSinceLast <= 60 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-muted-foreground">منذ آخر شراء</span>
                  <span className="text-[9px] text-muted-foreground">حد التنبيه (30 يوم)</span>
                </div>
                <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min((pf.daysSinceLast / 30) * 100, 100)}%`,
                      background: pf.isOverdue ? "#e24b4a" : pf.isWarning ? "#f59e0b" : "#10b981",
                    }}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
                  {pf.isOverdue
                    ? `⚠️ تجاوز حد التنبيه بـ ${pf.daysSinceLast - 30} يوم — يُنصح بالتواصل مع العميل`
                    : pf.isWarning
                    ? `متبقي ${30 - pf.daysSinceLast} يوم على حد التنبيه`
                    : `العميل نشيط — متبقي ${30 - pf.daysSinceLast} يوم على حد التنبيه`}
                </p>
              </div>
            )}
          </Card>
        );
      })()}

      {/* ─── فواتير البيع — زي Manifests Timeline ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-muted-foreground" />
            فواتير البيع
            {allOrders.length > 0 && (
              <Badge variant="outline" className="text-[9px]">
                {processingOrders.length + deliveredOrders.length}
              </Badge>
            )}
          </h2>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />قيد التجهيز: {processingOrders.length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />تم التسليم: {deliveredOrders.length}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm animate-pulse">جاري التحميل...</div>
        ) : (processingOrders.length + deliveredOrders.length) === 0 ? (
          <div className="py-16 text-center">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="text-muted-foreground text-sm">لا توجد فواتير بيع بعد</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* قيد التجهيز */}
            {processingOrders.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider px-1">
                  قيد التجهيز — تحتاج متابعة
                </p>
                {processingOrders.map(o => (
                  <InvoiceCard key={o.id} order={o} isLatest={o.id === latestProcessingId} />
                ))}
                {deliveredOrders.length > 0 && <div className="border-t border-border my-3" />}
              </>
            )}
            {/* تم التسليم */}
            {deliveredOrders.length > 0 && (
              <>
                {processingOrders.length > 0 && (
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    تم التسليم — مكتمل
                  </p>
                )}
                {deliveredOrders.map(o => (
                  <InvoiceCard key={o.id} order={o} isLatest={false} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
