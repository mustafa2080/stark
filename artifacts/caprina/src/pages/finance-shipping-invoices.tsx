import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, CheckCircle, Clock, AlertCircle, ArrowRight, Package, RotateCcw, Wallet, Link as LinkIcon, ChevronRight, Trash2, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { useBrand } from "@/contexts/BrandContext";

const STATUS_LABELS: Record<string, { label: string; color: string; solid: string; glow: string }> = {
  pending:  { label: "في انتظار التسوية", color: "#F59E0B", glow: "rgba(245,158,11,0.25)",  solid: "rgba(245,158,11,0.15)",  },
  verified: { label: "تم التحقق",         color: "#3B82F6", glow: "rgba(59,130,246,0.25)",  solid: "rgba(59,130,246,0.15)",  },
  paid:     { label: "تم التحويل للخزنة", color: "#10B981", glow: "rgba(16,185,129,0.25)",  solid: "rgba(16,185,129,0.15)",  },
  disputed: { label: "متنازع عليها",      color: "#EF4444", glow: "rgba(239,68,68,0.25)",   solid: "rgba(239,68,68,0.15)",   },
};

const fmt = (n: string | number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n));

export default function FinanceShippingInvoices() {

  // ── Finance access guard ───────────────────────────────────────────────────
  const { isAdmin: _fAdmin, can: _fCan } = useAuth();
  if (!_fAdmin && !_fCan("finance.view")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
        <p className="text-muted-foreground text-sm max-w-xs">ليس لديك صلاحية لعرض صفحة الماليات. تواصل مع المدير.</p>
      </div>
    );
  }
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { brand } = useBrand();
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── جيب الفواتير المالية ──────────────────────────────────────────────────
  const { data: invoices = [], isLoading } = useQuery<any[]>({
    queryKey: ["finance-shipping-invoices"],
    queryFn: () => apiFetch<any[]>("/finance/shipping-invoices"),
  });

  // ── جيب شركات الشحن للأسماء ───────────────────────────────────────────────
  const { data: companies = [] } = useQuery<any[]>({
    queryKey: ["shipping"],
    queryFn: () => apiFetch<any[]>("/shipping-companies"),
  });

  // ── جيب الخزنة الرئيسية ──────────────────────────────────────────────────
  const { data: cashData } = useQuery<any>({
    queryKey: ["/api/cash-registers"],
    queryFn: () => apiFetch<any>("/cash-registers"),
  });

  const mainRegister = cashData?.registers?.find((r: any) => r.type === "main");

  // ── تعيين حالة الفاتورة ───────────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch<any>(`/finance/shipping-invoices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-shipping-invoices"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-registers"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-registers/alerts"] });
      qc.invalidateQueries({ queryKey: ["finance-hub"] });
      toast({ title: "✅ تم تحديث حالة الفاتورة" });
    },
    onError: (e: any) => toast({ title: "❌ خطأ", description: e.message, variant: "destructive" }),
  });

  // ── حذف الفاتورة ─────────────────────────────────────────────────────────
  const deleteInvoice = useMutation({
    mutationFn: (id: number) =>
      apiFetch<any>(`/finance/shipping-invoices/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-shipping-invoices"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-registers"] });
      qc.invalidateQueries({ queryKey: ["finance-hub"] });
      setDeleteConfirmId(null);
      toast({ title: "✅ تم حذف الفاتورة بنجاح" });
    },
    onError: (e: any) => {
      setDeleteConfirmId(null);
      toast({ title: "❌ فشل الحذف", description: e.message, variant: "destructive" });
    },
  });

  // ── فلترة ────────────────────────────────────────────────────────────────
  const filtered = statusFilter === "all"
    ? invoices
    : invoices.filter(inv => inv.status === statusFilter);

  const safeNum = (v: any): number => {
    const n = parseFloat(String(v ?? 0));
    return isNaN(n) ? 0 : n;
  };

  const totalPending = invoices
    .filter(i => i.status === "pending")
    .reduce((s, i) => s + safeNum(i.netDue) - safeNum(i.paidAmount), 0);

  const totalPaid = invoices
    .filter(i => i.status === "paid")
    .reduce((s, i) => s + safeNum(i.netDue), 0);

  // ── طباعة فواتير متعددة بتخطيط 2×2 ──────────────────────────────────────
  const handlePrintSelected = async () => {
    if (selectedIds.size === 0) return;
    const selected = invoices.filter(i => selectedIds.has(i.id));

    const logoUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < data.data.length; i += 4) {
          const r = data.data[i], g = data.data[i+1], b = data.data[i+2];
          if (r < 40 && g < 40 && b < 40) data.data[i+3] = 0;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(`${window.location.origin}/logo.jpg`);
      img.src = `${window.location.origin}/logo.jpg`;
    });

    const STATUS_AR: Record<string, string> = {
      pending:"قيد الانتظار", warehouse_ready:"جاهزة للشحن", in_shipping:"قيد الشحن",
      received:"استلم", partial_received:"استلم جزئي", returned:"مرتجع",
      delivered:"استلم", waiting:"انتظار", cancelled:"ملغية", delayed:"مؤجل",
    };
    const fmtEN = (n: any) =>
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n || 0));

    // جيب شحنات كل فاتورة
    const invoicesData = await Promise.all(selected.map(async (inv) => {
      let shipments: any[] = [];
      if (inv.manifestId) {
        try {
          const manifest = await apiFetch<any>(`/shipping-manifests/${inv.manifestId}`);
          shipments = manifest?.orders ?? manifest?.shipments ?? [];
        } catch {}
      }
      return { inv, shipments };
    }));

    // اعمل HTML لكل فاتورة
    const invoiceCards = invoicesData.map(({ inv, shipments }) => {
      const company = companies.find((c: any) => c.id === inv.shippingCompanyId);
      const dateLabel = inv.createdAt ? format(new Date(inv.createdAt), "yyyy/MM/dd") : "";
      const totalShippingFees = shipments.reduce((s: number, sh: any) => s + Number(sh.shippingFee || 0), 0);
      const totalCodAmount    = shipments.reduce((s: number, sh: any) => s + Number(sh.codAmount   || 0), 0);
      const netDue     = Number(inv.netDue    || 0);
      const paidAmount = Number(inv.paidAmount || 0);
      const remaining  = netDue - paidAmount;
      const rowsHtml = shipments.slice(0, 12).map((s: any, idx: number) => {
        const statusAr = STATUS_AR[s.status] ?? s.status ?? "—";
        const receiverName = s.receiverName || s.customerName || "—";
        const city = s.receiverCity || s.city || "—";
        const shippingFee = Number(s.shippingFee || 0);
        const totalAmount = Number(s.totalAmount || 0) || shippingFee + Number(s.codAmount || 0);
        const isRet = s.status === "returned";
        return `<tr class="${isRet ? "ret" : ""}">
          <td>${idx + 1}</td>
          <td class="name">${receiverName}</td>
          <td>${city}</td>
          <td><span class="badge">${statusAr}</span></td>
          <td>${fmtEN(shippingFee)}</td>
          <td class="tot">${fmtEN(totalAmount)}</td>
        </tr>`;
      }).join("");

      const statusAr = inv.status === "paid" ? "مدفوعة" : inv.status === "verified" ? "تم التحقق" : inv.status === "disputed" ? "متنازع" : "انتظار";

      return `
        <div class="inv-card">
          <div class="inv-header">
            <div>
              <div class="inv-title">فاتورة شحن</div>
              <div class="inv-meta">${inv.invoiceNumber} · ${company?.name ?? "—"} · ${dateLabel}</div>
              <div class="inv-meta">عدد الشحنات: ${shipments.length} · الحالة: ${statusAr}</div>
            </div>
            <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
          </div>
          <table>
            <thead><tr>
              <th>#</th><th class="name">المستلم</th><th>المحافظة</th><th>الحالة</th><th>رسوم الشحن</th><th>الإجمالي</th>
            </tr></thead>
            <tbody>${rowsHtml}${shipments.length > 12 ? `<tr><td colspan="6" style="text-align:center;color:#888;font-style:italic">... و${shipments.length - 12} شحنة أخرى</td></tr>` : ""}</tbody>
          </table>
          <div class="summary">
            <div class="s-row"><span>إجمالي رسوم الشحن</span><span>${fmtEN(totalShippingFees)} ج</span></div>
            <div class="s-row"><span>إجمالي COD</span><span>${fmtEN(totalCodAmount)} ج</span></div>
            <div class="s-row total"><span>صافي المستحق</span><span class="green">${fmtEN(netDue)} ج</span></div>
          </div>
        </div>`;
    }).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>طباعة الفواتير المحددة</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}
html,body{width:100%;height:100%;font-family:'Cairo',Arial,sans-serif;background:#fff;direction:rtl}

/* شاشة: معاينة قبل الطباعة */
.page{
  display:grid;
  grid-template-columns:1fr 1fr;
  grid-template-rows:1fr 1fr;
  gap:10px;
  padding:14px;
  width:297mm;
  height:210mm;
  margin:auto;
  background:#fff;
}

/* كارت الفاتورة */
.inv-card{
  border:1.5px solid #ddd;
  border-radius:6px;
  padding:8px 10px;
  display:flex;
  flex-direction:column;
  gap:4px;
  overflow:hidden;
  background:#fff;
}

/* هيدر */
.inv-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #222;padding-bottom:5px;margin-bottom:4px}
.inv-title{font-size:11px;font-weight:900;color:#111;margin-bottom:2px}
.inv-meta{font-size:7.5px;color:#555;font-weight:600;line-height:1.5}
.logo{width:38px;height:38px;object-fit:contain}

/* شريط ملون */
.color-bar{height:3px;background:linear-gradient(90deg,#111,#555);border-radius:2px;margin-bottom:4px}

/* جدول */
table{width:100%;border-collapse:collapse;flex:1}
thead tr{background:#1a1a1a;color:#fff}
th{padding:3px 4px;font-size:7px;font-weight:700;text-align:center;white-space:nowrap}
th.name{text-align:right}
td{padding:2.5px 4px;text-align:center;font-size:7px;color:#333;border-bottom:1px solid #f0f0f0}
td.name{text-align:right;font-weight:700;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
td.tot{font-weight:900;color:#111}
tr:nth-child(even) td{background:#fafafa}
tr.ret td{color:#bbb;text-decoration:line-through}
.badge{font-size:6.5px;padding:1px 4px;border-radius:8px;background:#f3f4f6;color:#374151;font-weight:700;white-space:nowrap}

/* ملخص */
.summary{border-top:1.5px solid #222;padding-top:4px;margin-top:auto}
.s-row{display:flex;justify-content:space-between;font-size:7.5px;padding:1.5px 0;color:#555;font-weight:600}
.s-row.total{font-size:9px;font-weight:900;color:#111;border-top:1px solid #ccc;margin-top:2px;padding-top:2px}
.green{color:#16a34a}

/* طباعة: A4 landscape، 4 فواتير في صفحة واحدة */
@page{size:A4 landscape;margin:0}
@media print{
  html,body{width:297mm;height:210mm;overflow:hidden}
  .page{
    width:297mm;
    height:210mm;
    padding:8mm;
    gap:6mm;
    page-break-after:always;
  }
  .inv-card{border-color:#ccc}
}
</style>
</head>
<body>
<div class="page">
${invoiceCards}
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),800);}<\/script>
</body></html>`);
    printWindow.document.close();
  };

  // الفاتورة المراد حذفها (للعرض في الـ dialog)
  const invoiceToDelete = invoices.find(i => i.id === deleteConfirmId);

  // ── طباعة فاتورة شحن منفردة ──────────────────────────────────────────────
  const handlePrintInvoice = async (inv: any) => {
    const logoUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < data.data.length; i += 4) {
          const r = data.data[i], g = data.data[i+1], b = data.data[i+2];
          if (r < 40 && g < 40 && b < 40) data.data[i+3] = 0;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(`${window.location.origin}/logo.jpg`);
      img.src = `${window.location.origin}/logo.jpg`;
    });

    const fmtEN = (n: any) =>
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n || 0));

    let shipments: any[] = [];
    if (inv.manifestId) {
      try {
        const manifest = await apiFetch<any>(`/shipping-manifests/${inv.manifestId}`);
        shipments = manifest?.orders ?? manifest?.shipments ?? [];
      } catch {
        toast({ title: "⚠️ تعذر جلب الشحنات", variant: "destructive" });
        return;
      }
    }
    if (!shipments.length) {
      toast({ title: "⚠️ لا توجد شحنات مرتبطة بهذه الفاتورة" });
      return;
    }

    const STATUS_AR: Record<string, string> = {
      pending:"قيد الانتظار", warehouse_ready:"جاهزة للشحن", in_shipping:"قيد الشحن",
      received:"استلم", partial_received:"استلم جزئي", returned:"مرتجع",
      delivered:"استلم", waiting:"انتظار", cancelled:"ملغية", delayed:"مؤجل",
    };

    const dateLabel = inv.createdAt ? format(new Date(inv.createdAt), "yyyy/MM/dd HH:mm") : format(new Date(), "yyyy/MM/dd HH:mm");

    // صفوف الشحنات
    const rowsHtml = shipments.map((s: any, idx: number) => {
      const receiverName = s.receiverName || s.customerName || "—";
      const city = s.receiverCity || s.city || "—";
      const shippingFee = Number(s.shippingFee || 0);
      const codAmount   = Number(s.codAmount   || 0);
      const totalAmount = Number(s.totalAmount || 0) || shippingFee + codAmount;
      const isRet = s.status === "returned";
      const canOpenVal = (s.canOpen !== null && s.canOpen !== undefined) ? (s.canOpen === 0 || s.canOpen === "0" ? "غير مسموح" : "مسموح") : "—";
      const isDivisibleVal = (s.isDivisible !== null && s.isDivisible !== undefined) ? (s.isDivisible === 1 || s.isDivisible === "1" ? "قابلة" : "غير قابلة") : "—";
      return `
        <tr class="${isRet ? "row-returned" : ""}">
          <td>${idx + 1}</td>
          <td class="name">${receiverName}</td>
          <td>${city}</td>
          <td><span class="status-badge">${canOpenVal}</span></td>
          <td><span class="status-badge">${isDivisibleVal}</span></td>
          <td class="total-cell">${fmtEN(totalAmount)}</td>
        </tr>`;
    }).join("");

    const totalShippingFees = shipments.reduce((s: number, sh: any) => s + Number(sh.shippingFee || 0), 0);
    const totalCodAmount    = shipments.reduce((s: number, sh: any) => s + Number(sh.codAmount   || 0), 0);
    const netDue   = Number(inv.netDue   || 0);
    const paidAmount = Number(inv.paidAmount || 0);
    const remaining  = netDue - paidAmount;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>فاتورة شحن — ${inv.invoiceNumber}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}
body{font-family:'Cairo',Tahoma,Arial,sans-serif;background:#fff;color:#111;font-size:15px;direction:rtl}
.page{max-width:900px;margin:24px auto;background:#fff;padding:32px 36px}

/* ── HEADER ── */
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #ddd;margin-bottom:18px}
.header-left .inv-title{font-size:26px;font-weight:900;color:#111;margin-bottom:6px}
.header-left .inv-meta{font-size:14px;color:#555;line-height:2;font-weight:600}
.header-right .logo{width:140px;height:140px;border-radius:12px;object-fit:contain;border:none;background:transparent;margin-top:16px}

/* ── INFO BAR ── */
.info-bar{background:#fafafa;border:1px solid #ddd;color:#111;border-radius:8px;padding:12px 20px;display:flex;justify-content:center;align-items:center;margin-bottom:18px;gap:16px;flex-wrap:wrap}
.info-item{text-align:center}
.info-item .i-label{font-size:11px;color:#666;font-weight:600;margin-bottom:3px}
.info-item .i-value{font-size:16px;font-weight:900;color:#111}
.info-item .i-value.highlight{color:#111}
.info-item .i-value.green{color:#111}

/* ── TABLE ── */
table{width:100%;border-collapse:collapse;margin-bottom:18px}
thead tr{background:#333;color:#fff}
th{padding:11px 10px;font-size:14px;font-weight:800;text-align:center}
th:nth-child(2){text-align:right}
tbody tr{border-bottom:1px solid #e0e0e0}
tbody tr:last-child{border-bottom:2px solid #ccc}
td{padding:10px 10px;text-align:center;font-size:14px;font-weight:600;color:#222}
td.name{font-weight:800;text-align:right}
td.total-cell{font-weight:900;color:#111}
tr.row-returned td{color:#aaa;text-decoration:line-through}
.status-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:12px;font-weight:700;background:#f3f4f6;color:#374151}

/* ── SUMMARY ── */
.summary-wrap{display:flex;justify-content:flex-start;margin-bottom:18px}
.summary-table{width:400px;border:1px solid #ccc;border-radius:6px;overflow:hidden}
.s-row{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;font-size:15px;border-bottom:1px solid #e4e4e4}
.s-row:last-child{border:none;background:#fff;border-top:2px solid #111;color:#111;font-size:17px;font-weight:900;padding:13px 16px}
.s-row:last-child .s-val{color:#111}
.s-lbl{font-weight:600;color:#444}
.s-row:last-child .s-lbl{color:#111;font-weight:700}
.s-val{font-weight:800;color:#111}
.s-val.green{color:#1a7a4a}
.s-val.red{color:#c0392b}

/* ── FOOTER ── */
.footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:14px;font-weight:600;color:#666}

@media print{
  body{background:#fff}
  .page{margin:0;padding:20px 24px;max-width:none}
}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <div class="inv-title">فاتورة شحن</div>
      <div class="inv-meta">
        رقم الفاتورة: ${inv.invoiceNumber}<br>
        شركة الشحن: ${inv.shippingCompanyName || "—"}<br>
        التاريخ: ${dateLabel}<br>
        عدد الشحنات: ${shipments.length}
      </div>
    </div>
    <div class="header-right">
      <img class="logo" src="${logoUrl}" alt="Logo" onerror="this.style.display='none'"/>
    </div>
  </div>

  <!-- INFO BAR -->
  <div class="info-bar">
    <div class="info-item">
      <div class="i-label">عدد الشحنات</div>
      <div class="i-value highlight">${shipments.length}</div>
    </div>
  </div>

  <!-- SHIPMENTS TABLE -->
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th style="text-align:right">المستلم</th>
        <th>المحافظة</th>
        <th>حالة الشحنة</th>
        <th>تجزئة الشحنة</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <!-- SUMMARY -->
  <div class="summary-wrap">
    <div class="summary-table">
      <div class="s-row"><span class="s-lbl">إجمالي مستحق</span><span class="s-val">${fmtEN(netDue)}</span></div>
      <div class="s-row"><span class="s-lbl">المدفوع</span><span class="s-val green">${fmtEN(paidAmount)}</span></div>
      <div class="s-row"><span class="s-lbl">المتبقي</span><span class="s-val ${remaining > 0 ? "red" : "green"}">${fmtEN(remaining)}</span></div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">طُبع في: ${format(new Date(), "yyyy/MM/dd HH:mm")}</div>

</div>
</body></html>`);

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
  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ── Confirm Delete Dialog ─────────────────────────────────────────── */}
      {deleteConfirmId !== null && invoiceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}>
          <div className="relative w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            style={{
              background: "hsl(var(--card))",
              border: "1.5px solid rgba(239,68,68,0.40)",
              boxShadow: "0 24px 60px rgba(239,68,68,0.20)",
            }}>
            {/* خط ضوء أعلى */}
            <div className="absolute inset-x-12 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, #EF4444, transparent)" }} />

            {/* أيقونة */}
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)" }}>
              <Trash2 className="w-7 h-7" style={{ color: "#EF4444" }} />
            </div>

            <h3 className="text-lg font-black text-center mb-1">حذف الفاتورة</h3>
            <p className="text-sm text-center text-muted-foreground mb-1">
              هل أنت متأكد من حذف الفاتورة
            </p>
            <p className="text-center font-bold mb-1" style={{ color: "#EF4444" }}>
              {invoiceToDelete.invoiceNumber}
            </p>
            {invoiceToDelete.status === "paid" && (
              <div className="mt-2 mb-3 rounded-xl px-3 py-2 text-xs text-center"
                style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", color: "#F59E0B" }}>
                ⚠️ هذه الفاتورة مدفوعة — سيتم خصم {fmt(invoiceToDelete.paidAmount)} من الخزنة تلقائياً
              </div>
            )}
            <p className="text-xs text-center text-muted-foreground mb-5">
              هذا الإجراء لا يمكن التراجع عنه
            </p>

            <div className="flex gap-3">
              <Button
                className="flex-1 h-10 font-bold"
                variant="outline"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleteInvoice.isPending}>
                إلغاء
              </Button>
              <button
                className="flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                style={{
                  background: "rgba(239,68,68,0.20)",
                  border: "1.5px solid rgba(239,68,68,0.50)",
                  color: "#EF4444",
                  opacity: deleteInvoice.isPending ? 0.6 : 1,
                }}
                onClick={() => deleteInvoice.mutate(deleteConfirmId)}
                disabled={deleteInvoice.isPending}>
                <Trash2 className="w-4 h-4" />
                {deleteInvoice.isPending ? "جاري الحذف..." : "تأكيد الحذف"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => navigate("/finance")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ChevronRight className="w-4 h-4" />
            لوحة الماليات
          </button>
          <h1 className="text-2xl font-bold">فواتير شركات الشحن</h1>
          <p className="text-muted-foreground text-sm">
            الفواتير المالية المُنشأة تلقائياً عند إقفال بيانات الشحن
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <button
              onClick={handlePrintSelected}
              className="flex items-center gap-2 h-9 px-4 rounded-xl font-bold text-sm transition-all"
              style={{
                background: "rgba(99,102,241,0.15)",
                border: "1.5px solid rgba(99,102,241,0.40)",
                color: "#818cf8",
              }}>
              <Printer className="w-4 h-4" />
              طباعة المحدد ({selectedIds.size})
            </button>
          )}
          <Link href="/shipping">
            <Button variant="outline" className="gap-2 border-border">
              <LinkIcon className="w-4 h-4" />
              إدارة بيانات الشحن
            </Button>
          </Link>
        </div>
      </div>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* انتظار التسوية */}
        <div className="relative overflow-hidden rounded-[20px] p-4 transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.38) 0%, rgba(245,158,11,0.14) 52%, rgba(255,255,255,0.05) 100%)",
            border: "1px solid rgba(245,158,11,0.28)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(245,158,11,0.22)",
            backdropFilter: "blur(12px)",
          }}>
          <div className="absolute inset-x-8 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, #F59E0B, transparent)" }} />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(245,158,11,0.20)", border: "1px solid rgba(245,158,11,0.35)" }}>
              <Clock className="w-4 h-4" style={{ color: "#F59E0B" }} />
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.60)" }}>في انتظار التسوية</p>
              <p className="text-lg font-black" style={{ color: "#F59E0B", textShadow: "0 0 14px rgba(245,158,11,0.55)" }}>{fmt(totalPending)}</p>
            </div>
          </div>
        </div>

        {/* تم التحويل للخزنة */}
        <div className="relative overflow-hidden rounded-[20px] p-4 transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.38) 0%, rgba(16,185,129,0.14) 52%, rgba(255,255,255,0.05) 100%)",
            border: "1px solid rgba(16,185,129,0.28)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(16,185,129,0.22)",
            backdropFilter: "blur(12px)",
          }}>
          <div className="absolute inset-x-8 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, #10B981, transparent)" }} />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(16,185,129,0.20)", border: "1px solid rgba(16,185,129,0.35)" }}>
              <Wallet className="w-4 h-4" style={{ color: "#10B981" }} />
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.60)" }}>تم التحويل للخزنة</p>
              <p className="text-lg font-black" style={{ color: "#10B981", textShadow: "0 0 14px rgba(16,185,129,0.55)" }}>{fmt(totalPaid)}</p>
            </div>
          </div>
        </div>

        {/* رصيد الخزنة */}
        <div className="relative overflow-hidden rounded-[20px] p-4 transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.38) 0%, rgba(99,102,241,0.14) 52%, rgba(255,255,255,0.05) 100%)",
            border: "1px solid rgba(99,102,241,0.28)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(99,102,241,0.22)",
            backdropFilter: "blur(12px)",
          }}>
          <div className="absolute inset-x-8 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, #6366F1, transparent)" }} />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(99,102,241,0.20)", border: "1px solid rgba(99,102,241,0.35)" }}>
              <Truck className="w-4 h-4" style={{ color: "#6366F1" }} />
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.60)" }}>رصيد الخزنة الرئيسية</p>
              <p className="text-lg font-black" style={{ color: "#6366F1", textShadow: "0 0 14px rgba(99,102,241,0.55)" }}>
                {mainRegister ? fmt(mainRegister.balance) : <span className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>لا توجد خزنة رئيسية</span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* تنبيه لو مفيش خزنة رئيسية */}
      {!mainRegister && totalPending > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">لا توجد خزنة رئيسية</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              يوجد {fmt(totalPending)} في انتظار التحويل. أنشئ خزنة رئيسية من قسم الخزنة وسيتم تحويل المبالغ إليها تلقائياً.
            </p>
            <Link href="/finance/cash">
              <Button size="sm" className="mt-2 h-7 text-xs gap-1">
                <ArrowRight className="w-3 h-3" />
                إنشاء خزنة رئيسية
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* فلتر الحالة */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 h-9 text-sm border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفواتير ({invoices.length})</SelectItem>
            <SelectItem value="pending">في انتظار التسوية</SelectItem>
            <SelectItem value="paid">تم التحويل للخزنة</SelectItem>
            <SelectItem value="verified">تم التحقق</SelectItem>
            <SelectItem value="disputed">متنازع عليها</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} فاتورة</span>
      </div>

      {/* قائمة الفواتير */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center border-dashed border-border">
          <Truck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {statusFilter === "all"
              ? "لا توجد فواتير بعد. ستظهر هنا تلقائياً عند إقفال بيانات الشحن."
              : "لا توجد فواتير بهذه الحالة."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(inv => {
            const company = companies.find((c: any) => c.id === inv.shippingCompanyId);
            const st = STATUS_LABELS[inv.status] ?? { label: inv.status, color: "#6B7280", glow: "rgba(107,114,128,0.25)", solid: "rgba(107,114,128,0.15)" };
            const remaining = safeNum(inv.netDue) - safeNum(inv.paidAmount);

            return (
              <div key={inv.id}
                className="group relative overflow-hidden rounded-[20px] p-4 transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: `linear-gradient(135deg, ${st.solid} 0%, rgba(255,255,255,0.03) 100%)`,
                  border: `1px solid ${st.glow}`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 6px 24px ${st.glow}`,
                  backdropFilter: "blur(10px)",
                }}>
                <div className="absolute inset-x-10 top-0 h-px pointer-events-none"
                  style={{ background: `linear-gradient(90deg, transparent, ${st.color}, transparent)` }} />

                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedIds.has(inv.id)}
                      onChange={() => toggleSelect(inv.id)}
                      className="w-4 h-4 rounded cursor-pointer shrink-0 mt-3"
                      style={{ accentColor: "#6366f1" }}
                    />
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: st.solid, border: `1px solid ${st.glow.replace("0.25","0.40")}` }}>
                      <Truck className="w-5 h-5" style={{ color: st.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm" style={{ color: "hsl(var(--foreground))" }}>{inv.invoiceNumber}</p>
                        {inv.manifestId && (
                          <Link href="/shipping">
                            <span className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1"
                              style={{ color: st.color, border: `1px solid ${st.glow}`, background: st.solid }}>
                              <LinkIcon className="w-2.5 h-2.5" />بيان شحن مرتبط
                            </span>
                          </Link>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {company?.name ?? "—"} · {format(new Date(inv.invoiceDate), "yyyy/MM/dd")}
                      </p>
                    </div>
                  </div>

                  {/* الأزرار */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: st.solid, color: st.color, border: `1px solid ${st.glow}` }}>
                      {st.label}
                    </span>
                    {inv.status === "pending" && (
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs"
                        style={{ borderColor: "rgba(59,130,246,0.40)", color: "#3B82F6" }}
                        onClick={() => updateStatus.mutate({ id: inv.id, status: "verified" })}
                        disabled={updateStatus.isPending}>
                        <CheckCircle className="w-3 h-3 mr-1" />تحقق
                      </Button>
                    )}
                    {/* زر الطباعة */}
                    {inv.manifestId && (
                      <button
                        className="h-7 w-7 rounded-lg flex items-center justify-center transition-all"
                        style={{
                          background: "rgba(99,102,241,0.10)",
                          border: "1px solid rgba(99,102,241,0.30)",
                          color: "#6366F1",
                        }}
                        title="طباعة بوالص الشحن"
                        onClick={() => handlePrintInvoice(inv)}>
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* زر الحذف */}
                    <button
                      className="h-7 w-7 rounded-lg flex items-center justify-center transition-all"
                      style={{
                        background: "rgba(239,68,68,0.10)",
                        border: "1px solid rgba(239,68,68,0.30)",
                        color: "#EF4444",
                      }}
                      title="حذف الفاتورة"
                      onClick={() => setDeleteConfirmId(inv.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* الأرقام */}
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3"
                  style={{ borderTop: `1px solid ${st.glow}` }}>
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>الإيراد الإجمالي</p>
                    <p className="text-sm font-bold text-emerald-500">{fmt(inv.grossRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>رسوم الشحن + المرتجعات</p>
                    <p className="text-sm font-bold text-rose-500">
                      {fmt(Number(inv.shippingFees) + Number(inv.returnFees))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>صافي المستحق</p>
                    <p className="text-sm font-black" style={{ color: st.color, textShadow: `0 0 10px ${st.glow}` }}>{fmt(inv.netDue)}</p>
                  </div>
                </div>

                {/* إحصائيات الطلبات */}
                <div className="flex flex-wrap gap-4 mt-2 text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  <span className="flex items-center gap-1"><Package className="w-3 h-3" />إجمالي: {inv.totalOrders}</span>
                  <span className="flex items-center gap-1 text-emerald-500"><CheckCircle className="w-3 h-3" />مسلّم: {inv.deliveredOrders}</span>
                  <span className="flex items-center gap-1 text-rose-400"><RotateCcw className="w-3 h-3" />مرتجع: {inv.returnedOrders}</span>
                </div>

                {/* حالة التحويل */}
                {inv.status === "paid" && (
                  <div className="mt-2 pt-2 flex items-center gap-2" style={{ borderTop: `1px solid ${st.glow}` }}>
                    <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                    <p className="text-[10px] text-emerald-500">
                      تم إضافة {fmt(safeNum(inv.paidAmount) || safeNum(inv.netDue))} للخزنة الرئيسية
                      {inv.paidAt ? ` · ${format(new Date(inv.paidAt), "yyyy/MM/dd")}` : ""}
                    </p>
                  </div>
                )}
                {inv.status === "pending" && !mainRegister && (
                  <div className="mt-2 pt-2 flex items-center gap-2" style={{ borderTop: `1px solid ${st.glow}` }}>
                    <Clock className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
                    <p className="text-[10px]" style={{ color: "#F59E0B" }}>
                      في انتظار إنشاء الخزنة الرئيسية لتحويل {fmt(remaining)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
