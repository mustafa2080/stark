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

  // الفاتورة المراد حذفها (للعرض في الـ dialog)
  const invoiceToDelete = invoices.find(i => i.id === deleteConfirmId);

  // ── طباعة بوليصة شحن لكل شحنة (نفس تصميم بوليصة الشحن في تفاصيل الشحنة) ──
  const handlePrintInvoice = async (inv: any) => {
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

    // بناء صفحة بوليصة شحن واحدة لكل شحنة (نفس تصميم بوليصة الشحن في تفاصيل الشحنة)
    const buildInvoicePage = (s: any) => {
      const shipNum  = s.shipmentNumber ?? s.shipment_number ?? `#${String(s.id).padStart(4,"0")}`;
      const tracking = s.trackingNumber ?? s.tracking_number ?? "—";
      const dateLabel = s.createdAt ? format(new Date(s.createdAt), "yyyy/MM/dd HH:mm") : "";
      const statusAr = STATUS_AR[s.status] ?? s.status ?? "—";
      const paymentMethodAr = s.paymentMethod === "cod" ? "عند الاستلام" : s.paymentMethod === "prepaid" ? "مدفوع مسبقاً" : (s.paymentMethod ? "لاحقاً" : "—");

      const shippingFee  = Number(s.shippingFee  || 0);
      const codAmount    = Number(s.codAmount    || 0);
      const insuranceFee = Number(s.insuranceFee || 0);
      const storedTotal  = Number(s.totalAmount  || 0);
      const totalAmount  = storedTotal > 0 ? storedTotal : shippingFee + codAmount + insuranceFee;

      return `
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-title">
      بوليصة شحن
      <span>رقم الشحنة: ${shipNum} &nbsp;|&nbsp; ${dateLabel}</span>
    </div>
    <img class="logo" src="${logoUrl}" alt="Logo" onerror="this.style.display='none'"/>
  </div>

  <!-- TRACKING BAR -->
  <div class="tracking-bar">
    <div class="tracking-item">
      <div class="t-label">رقم التتبع</div>
      <div class="t-value highlight">${tracking}</div>
    </div>
    <div class="tracking-item">
      <div class="t-label">شركة الشحن</div>
      <div class="t-value">${s.shippingCompanyName || "—"}</div>
    </div>
    <div class="tracking-item">
      <div class="t-label">طريقة الدفع</div>
      <div class="t-value">${paymentMethodAr}</div>
    </div>
    <div class="tracking-item">
      <div class="t-label">الحالة</div>
      <div class="t-value green">${statusAr}</div>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="parties">
    <!-- المرسل -->
    <div class="party-box">
      <div class="party-title">📤 المرسل</div>
      <div class="party-name">${s.senderName || "—"}</div>
      ${s.senderPhone ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${s.senderPhone}</span></div>` : ""}
      ${s.senderPhone2 ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${s.senderPhone2}</span></div>` : ""}
      ${s.senderCity ? `<div class="party-row"><span class="icon">📍</span><span class="val">${s.senderCity}</span></div>` : ""}
    </div>
    <!-- المستلم -->
    <div class="party-box receiver">
      <div class="party-title">📦 المستلم</div>
      <div class="party-name">${s.receiverName || s.customerName || "—"}</div>
      ${(s.receiverPhone || s.phone) ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${s.receiverPhone || s.phone}</span></div>` : ""}
      ${s.receiverPhone2 ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${s.receiverPhone2}</span></div>` : ""}
      ${(s.receiverCity || s.city) ? `<div class="party-row"><span class="icon">📍</span><span class="val">${s.receiverCity || s.city}</span></div>` : ""}
      ${(s.receiverAddress || s.address) ? `<div class="party-row"><span class="icon">🏠</span><span class="val">${s.receiverAddress || s.address}</span></div>` : ""}
    </div>
  </div>

  <!-- DETAILS -->
  <div class="details-row">
    <div class="detail-box">
      <div class="d-label">نوع الشحنة</div>
      <div class="d-value">${s.parcelType || "—"}</div>
    </div>
    <div class="detail-box">
      <div class="d-label">${s.weight ? "الوزن" : "عدد القطع"}</div>
      <div class="d-value">${s.weight ? `${s.weight} كجم` : (s.pieces || "—")}</div>
    </div>
    <div class="detail-box">
      <div class="d-label">رسوم الشحن</div>
      <div class="d-value">${fmtCurr(shippingFee)}</div>
    </div>
    <div class="detail-box highlight">
      <div class="d-label">الإجمالي</div>
      <div class="d-value">${fmtCurr(totalAmount)}</div>
    </div>
  </div>

  ${codAmount > 0 ? `
  <div class="details-row" style="grid-template-columns:1fr 1fr;margin-bottom:10px">
    <div class="detail-box" style="background:#fffbeb;border-color:#f59e0b">
      <div class="d-label" style="color:#92400e">مبلغ COD</div>
      <div class="d-value" style="color:#b45309">${fmtCurr(codAmount)}</div>
    </div>
    ${insuranceFee > 0 ? `<div class="detail-box"><div class="d-label">رسوم التأمين</div><div class="d-value">${fmtCurr(insuranceFee)}</div></div>` : `<div></div>`}
  </div>` : ""}

  ${s.notes ? `
  <div class="notes-box">
    <div class="n-title">ملاحظات</div>
    ${s.notes}
  </div>` : ""}

  ${tracking !== "—" ? `
  <div class="barcode-area">
    <div class="b-label">رقم التتبع</div>
    <div class="barcode-num">${tracking}</div>
  </div>` : ""}

  <!-- FOOTER -->
  <div class="footer">
    <span>شحنة رقم: <strong>${shipNum}</strong>${s.assignedUserName ? ` &nbsp;|&nbsp; المندوب: <strong>${s.assignedUserName}</strong>` : ""}</span>
    <span class="date">طُبع في: ${dateLabel}</span>
  </div>

</div>`;
    };

    const pagesHtml = shipments.map(buildInvoicePage).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>فواتير شحن — ${inv.invoiceNumber}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}
body{font-family:'Cairo',Tahoma,Arial,sans-serif;background:#fff;color:#111;direction:rtl;font-size:15px}
.page{max-width:800px;margin:20px auto;padding:28px 32px;background:#fff;page-break-after:always}
.page:last-child{page-break-after:auto}

/* HEADER */
.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:3px solid #111;margin-bottom:20px}
.header-title{font-size:28px;font-weight:900;letter-spacing:-0.5px}
.header-title span{font-size:16px;font-weight:600;color:#555;display:block;margin-top:4px}
.logo{width:90px;height:90px;object-fit:contain;border-radius:8px}

/* TRACKING BAR */
.tracking-bar{background:#111;color:#fff;border-radius:8px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;gap:16px;flex-wrap:wrap}
.tracking-item{text-align:center}
.tracking-item .t-label{font-size:11px;color:#aaa;font-weight:600;margin-bottom:4px}
.tracking-item .t-value{font-size:17px;font-weight:900;color:#fff}
.tracking-item .t-value.highlight{color:#f0c040;font-size:20px}
.tracking-item .t-value.green{color:#4ade80}

/* PARTIES */
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
.party-box{border:2px solid #111;border-radius:8px;padding:16px 18px}
.party-box.receiver{border-color:#111;border-width:3px}
.party-title{font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e0e0e0}
.party-name{font-size:22px;font-weight:900;color:#111;margin-bottom:8px;line-height:1.3}
.party-row{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:#333;margin-bottom:5px}
.party-row .icon{font-size:14px;flex-shrink:0}
.party-row .val{font-size:15px;font-weight:800;color:#111}
.party-row .val.phone{direction:ltr;display:inline-block}

/* DETAILS ROW */
.details-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.detail-box{border:1px solid #ddd;border-radius:6px;padding:12px;text-align:center;background:#fafafa}
.detail-box .d-label{font-size:11px;font-weight:700;color:#666;margin-bottom:6px}
.detail-box .d-value{font-size:18px;font-weight:900;color:#111}
.detail-box.highlight{background:#111;border-color:#111}
.detail-box.highlight .d-label{color:#aaa}
.detail-box.highlight .d-value{color:#f0c040;font-size:22px}

/* NOTES */
.notes-box{border:2px dashed #ccc;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:14px;font-weight:700;color:#333;line-height:1.8}
.notes-box .n-title{font-size:12px;font-weight:700;color:#888;margin-bottom:4px}

/* BARCODE AREA */
.barcode-area{border:2px solid #111;border-radius:8px;padding:14px 20px;text-align:center;margin-bottom:20px;background:#fafafa}
.barcode-area .b-label{font-size:12px;font-weight:700;color:#666;margin-bottom:6px}
.barcode-num{font-size:30px;font-weight:900;letter-spacing:4px;color:#111;font-family:monospace}

/* FOOTER */
.footer{border-top:2px solid #ddd;padding-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;color:#555}
.footer .date{font-size:12px}

@media print{
  @page{size:A4;margin:10mm 12mm}
  body{font-size:11px}
  .page{margin:0;padding:0;max-width:none}
  .header{padding-bottom:8px;margin-bottom:10px}
  .header-title{font-size:20px}
  .logo{width:60px;height:60px}
  .tracking-bar{padding:8px 14px;margin-bottom:10px;gap:10px}
  .tracking-item .t-label{font-size:9px}
  .tracking-item .t-value{font-size:13px}
  .tracking-item .t-value.highlight{font-size:15px}
  .parties{gap:10px;margin-bottom:10px}
  .party-box{padding:10px 12px}
  .party-name{font-size:17px;margin-bottom:5px}
  .party-row{font-size:12px;margin-bottom:3px}
  .party-row .val{font-size:13px}
  .details-row{gap:6px;margin-bottom:10px}
  .detail-box{padding:8px}
  .detail-box .d-label{font-size:9px;margin-bottom:3px}
  .detail-box .d-value{font-size:14px}
  .detail-box.highlight .d-value{font-size:16px}
  .notes-box{padding:8px 12px;margin-bottom:10px;font-size:12px}
  .barcode-area{padding:8px 14px;margin-bottom:10px}
  .barcode-num{font-size:22px;letter-spacing:3px}
  .footer{padding-top:8px;font-size:11px}
  .header,.tracking-bar,.parties,.details-row,.notes-box,.barcode-area{page-break-inside:avoid}
}
</style>
</head>
<body>${pagesHtml}</body></html>`);

    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 1200);
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
        <Link href="/shipping">
          <Button variant="outline" className="gap-2 border-border">
            <LinkIcon className="w-4 h-4" />
            إدارة بيانات الشحن
          </Button>
        </Link>
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
