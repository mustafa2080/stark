import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, ShoppingBag, Trash2, ChevronRight, Search, X,
  SlidersHorizontal, FileSpreadsheet, Package, Wallet, TrendingUp, Clock, UserCheck,
  ShoppingCart, Printer, CheckCircle2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";

const api = {
  get:  (url: string)            => apiFetch<any>(url),
  post: (url: string, body: any) => apiFetch<any>(url, { method: "POST", body: JSON.stringify(body) }),
};

// ── ألوان الحالات ──────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:      { label: "قيد التجهيز",   color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  confirmed:  { label: "قيد التجهيز",   color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  processing: { label: "قيد التجهيز",   color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  delivered:  { label: "قيد التجهيز",   color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  closed:     { label: "تم التسليم ✓",  color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled:  { label: "ملغي",          color: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

const PAY_LABELS: Record<string, { label: string; color: string }> = {
  unpaid:  { label: "غير مدفوع",     color: "text-rose-500" },
  partial: { label: "مدفوع جزئياً",  color: "text-amber-400" },
  paid:    { label: "مدفوع بالكامل", color: "text-emerald-400" },
};

const fmt = (n: string | number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n));

// ── فاتورة البيع (طباعة HTML) ─────────────────────────────────────────────
function printSaleInvoice(order: SaleOrder, items: any[], warehouses: Warehouse[]) {
  const wName = warehouses.find(w => w.id === order.warehouseId)?.name ?? "—";
  const total  = parseFloat(order.totalAmount ?? "0");
  const paid   = parseFloat(order.paidAmount  ?? "0");
  const due    = total - paid;
  const rows = items.map(it => `
    <tr>
      <td>${it.productName ?? "—"}</td>
      <td>${it.color ?? "—"}</td>
      <td>${it.size  ?? "—"}</td>
      <td style="text-align:center">${it.quantity}</td>
      <td style="text-align:left">${Number(it.unitPrice).toLocaleString("ar-EG")} ج</td>
      <td style="text-align:left">${(it.quantity * Number(it.unitPrice)).toLocaleString("ar-EG")} ج</td>
    </tr>`).join("");
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
  <title>فاتورة ${order.soNumber}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#222;font-size:13px}
    h1{margin:0;font-size:20px;color:#26A69A}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #26A69A;padding-bottom:12px;margin-bottom:16px}
    .badge{background:#26A69A;color:#0a0a0a;padding:2px 10px;border-radius:999px;font-size:11px}
    table{width:100%;border-collapse:collapse;margin-bottom:14px}
    th{background:#f0fafa;text-align:right;padding:6px 8px;border:1px solid #ddd;font-size:12px}
    td{padding:5px 8px;border:1px solid #eee;font-size:12px}
    .totals{text-align:left;margin-top:8px}
    .totals tr td{border:none;padding:3px 6px}
    .grand{font-size:16px;font-weight:bold;color:#26A69A}
    .footer{margin-top:24px;border-top:1px solid #ddd;padding-top:10px;font-size:11px;color:#888;text-align:center}
    @media print{.no-print{display:none}}
  </style></head><body>
  <div class="header">
    <div>
      <h1>فاتورة بيع</h1>
      <p style="margin:4px 0;font-size:12px;color:#666">رقم الأمر: <strong>${order.soNumber}</strong></p>
      <p style="margin:4px 0;font-size:12px;color:#666">التاريخ: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString("ar-EG") : "—"}</p>
    </div>
    <div style="text-align:left">
      <p style="margin:4px 0"><strong>${order.clientName}</strong></p>
      ${order.clientPhone ? `<p style="margin:4px 0;font-size:12px">${order.clientPhone}</p>` : ""}
      ${order.clientAddress ? `<p style="margin:4px 0;font-size:12px">${order.clientAddress}</p>` : ""}
      <p style="margin:6px 0"><span class="badge">المخزن: ${wName}</span></p>
    </div>
  </div>
  <table>
    <thead><tr><th>المنتج</th><th>اللون</th><th>المقاس</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>الإجمالي الفرعي:</td><td>${total.toLocaleString("ar-EG")} ج</td></tr>
    ${Number(order.discountAmount) ? `<tr><td>الخصم:</td><td style="color:#e53">- ${Number(order.discountAmount).toLocaleString("ar-EG")} ج</td></tr>` : ""}
    ${Number(order.shippingCost)   ? `<tr><td>الشحن:</td><td>${Number(order.shippingCost).toLocaleString("ar-EG")} ج</td></tr>` : ""}
    ${Number(order.taxAmount)      ? `<tr><td>الضريبة:</td><td>${Number(order.taxAmount).toLocaleString("ar-EG")} ج</td></tr>` : ""}
    <tr class="grand"><td>الإجمالي الكلي:</td><td>${total.toLocaleString("ar-EG")} ج</td></tr>
    <tr><td style="color:#26A69A">المدفوع:</td><td style="color:#26A69A">${paid.toLocaleString("ar-EG")} ج</td></tr>
    ${due > 0 ? `<tr><td style="color:#e53">المتبقي:</td><td style="color:#e53">${due.toLocaleString("ar-EG")} ج</td></tr>` : ""}
  </table>
  ${order.notes ? `<p style="font-size:12px;color:#666"><strong>ملاحظات:</strong> ${order.notes}</p>` : ""}
  <div class="footer">شكراً لتعاملكم معنا — Caprina</div>
  </body></html>`;
  // حفظ PDF مباشرة بدون فتح نافذة preview
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "none";
  document.body.appendChild(iframe);
  const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iDoc) {
    iDoc.open();
    iDoc.write(html);
    iDoc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 400);
  }
}

type SaleOrder = {
  id: number; soNumber: string;
  clientName: string; clientPhone: string | null; clientAddress: string | null;
  warehouseId: number | null; status: string; paymentStatus: string;
  totalAmount: string; paidAmount: string; discountAmount: string;
  shippingCost: string; taxAmount: string; invoiceRef: string | null;
  notes: string | null; expectedDate: string | null;
  deliveredAt: string | null; createdAt: string;
};
type Warehouse = { id: number; name: string };
type Product   = { id: number; name: string; costPrice?: string };
type Variant   = {
  id: number; productId: number; productName: string;
  color: string; size: string; sku: string | null;
  totalQuantity: number; reservedQuantity: number; soldQuantity: number;
  unitPrice: string; costPrice: string | null;
};

// ── ColFilter ─────────────────────────────────────────────────────────────
function ColFilter({ label, active, visible, isOpen, onToggle, children }: {
  label: string; active: boolean; visible: boolean;
  isOpen: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // احسب موقع الـ dropdown بناءً على موقع الزرار
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.right - 200 < 0 ? r.left : r.right - 200 });
    }
    onToggle();
  };

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) onToggle();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", h), 100);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", h); };
  }, [isOpen]);

  return (
    <div className="inline-flex items-center gap-1 select-none">
      <span className="text-xs font-semibold" style={{ color: active ? "#4DB6AC" : "hsl(var(--muted-foreground))" }}>
        {label}
      </span>

      {visible && (
        <button
          ref={btnRef}
          onClick={handleToggle}
          title={`فلتر ${label}`}
          className="relative inline-flex items-center justify-center rounded transition-all hover:scale-110"
          style={{
            width: 20, height: 20,
            background: active ? "rgba(77,182,172,0.25)" : isOpen ? "hsl(var(--muted)/0.7)" : "hsl(var(--muted)/0.3)",
            color: active ? "#4DB6AC" : isOpen ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
            border: active ? "1px solid rgba(77,182,172,0.5)" : "1px solid transparent",
            borderRadius: 4,
          }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M0.5 2h10M2.5 5.5h6M4.5 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {active && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
              style={{ background: "#4DB6AC", border: "1.5px solid hsl(var(--card))" }} />
          )}
        </button>
      )}

      {/* Dropdown — position fixed عشان يطلع فوق كل حاجة */}
      {visible && isOpen && createPortal(
        <div
          ref={dropRef}
          className="rounded-xl overflow-hidden"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            minWidth: 210,
            zIndex: 9999,
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.4)" }}>
            <span className="text-xs font-bold" style={{ color: "#4DB6AC" }}>فلتر — {label}</span>
            <button onClick={onToggle} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── PurchaseOrderQuickDialog ──────────────────────────────────────────────
type PODraftItem = { productId?: string; productName: string; color: string; size: string; quantity: number; unitPrice: number };

function PurchaseOrderQuickDialog({ draft, onClose }: {
  draft: { productName: string; color: string; size: string; needed: number };
  onClose: () => void;
}) {
  const { toast } = useToast();

  // جلب العملاء التجاريين من السيستم
  const { data: suppliers = [] } = useQuery<{ id: number; name: string; category: string | null }[]>({
    queryKey: ["clients-for-po"],
    queryFn: () => apiFetch<any>("/finance/clients"),
    staleTime: 60_000,
  });

  // Dropdown الموردين
  const [supplierId,       setSupplierId]       = useState("");
  const [supplierName,     setSupplierName]     = useState("");
  const [supplierFilter,   setSupplierFilter]   = useState("");
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);
  const supplierInputRef = useRef<HTMLDivElement>(null);
  const supplierDropRef  = useRef<HTMLDivElement>(null);

  const filteredSuppliers = useMemo(() => {
    if (!supplierFilter.trim()) return suppliers;
    const q = supplierFilter.toLowerCase();
    return suppliers.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q)
    );
  }, [suppliers, supplierFilter]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !supplierDropRef.current?.contains(e.target as Node) &&
        !supplierInputRef.current?.contains(e.target as Node)
      ) setShowSupplierDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PODraftItem[]>([{
    productName: draft.productName,
    color: draft.color,
    size: draft.size,
    quantity: draft.needed,
    unitPrice: 0,
  }]);

  const upd = (i: number, f: keyof PODraftItem, v: any) =>
    setItems(p => p.map((r, idx) => idx === i ? { ...r, [f]: v } : r));

  // ── جلب المنتجات والـ variants ─────────────────────────────────────────
  const { data: allProducts = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["products-list"],
    queryFn:  () => apiFetch<any>("/products"),
    staleTime: 60_000,
  });
  const { data: allVariants = [] } = useQuery<Variant[]>({
    queryKey: ["variants"],
    queryFn:  () => apiFetch<any>("/variants"),
    staleTime: 60_000,
  });

  // helpers
  const colorsFor  = (productId: string) =>
    [...new Set(allVariants.filter(v => String(v.productId) === productId).map(v => v.color).filter(Boolean))];
  const sizesFor   = (productId: string, color: string) =>
    allVariants.filter(v => String(v.productId) === productId && v.color === color).map(v => v.size).filter(Boolean);
  const matchVar   = (productId: string, color: string, size: string) =>
    allVariants.find(v => String(v.productId) === productId && v.color === color && v.size === size);
  const availQty   = (v: Variant) => Math.max(0, (v.totalQuantity ?? 0) - (v.reservedQuantity ?? 0) - (v.soldQuantity ?? 0));

  // عند اختيار منتج
  const handleProduct = (i: number, productId: string) => {
    const p      = allProducts.find(x => String(x.id) === productId);
    const colors = colorsFor(productId);
    const color  = colors[0] ?? "";
    const sizes  = color ? sizesFor(productId, color) : [];
    const size   = sizes[0] ?? "";
    const v      = color && size ? matchVar(productId, color, size) : undefined;
    setItems(prev => prev.map((r, idx) => idx !== i ? r : {
      ...r,
      productId,
      productName: p?.name ?? "",
      color, size,
      unitPrice: v ? parseFloat(String(v.costPrice ?? v.unitPrice)) : r.unitPrice,
    }));
  };

  // عند اختيار لون
  const handleColor = (i: number, color: string) => {
    const r     = items[i];
    const sizes = sizesFor(r.productId ?? "", color);
    const size  = sizes[0] ?? "";
    const v     = size ? matchVar(r.productId ?? "", color, size) : undefined;
    setItems(prev => prev.map((row, idx) => idx !== i ? row : {
      ...row, color, size,
      unitPrice: v ? parseFloat(String(v.costPrice ?? v.unitPrice)) : row.unitPrice,
    }));
  };

  // عند اختيار مقاس
  const handleSize = (i: number, size: string) => {
    const r = items[i];
    const v = matchVar(r.productId ?? "", r.color, size);
    setItems(prev => prev.map((row, idx) => idx !== i ? row : {
      ...row, size,
      unitPrice: v ? parseFloat(String(v.costPrice ?? v.unitPrice)) : row.unitPrice,
    }));
  };

  const total = items.reduce((s, r) => s + r.quantity * r.unitPrice, 0);

  const handleSave = async () => {
    try {
      await apiFetch<any>("/finance/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierId ? parseInt(supplierId) : null,
          supplierName: supplierName || "غير محدد",
          status: "draft",
          notes: notes || null,
          items: items.map(r => ({
            productName: r.productName,
            color: r.color || null,
            size: r.size || null,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
          })),
        }),
      });
      toast({ title: "✅ تم إنشاء أمر الشراء", description: "يمكنك تعديله من قسم أوامر الشراء" });
      onClose();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" style={{ color: "#4DB6AC" }} />
            إنشاء أمر شراء — تغطية النقص
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* العميل التجاري — Dropdown */}
          <div className="relative">
            <Label>العميل التجاري</Label>
            <div
              ref={supplierInputRef}
              className="flex items-center w-full rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors mt-1"
              style={{
                background: "hsl(var(--input,var(--background)))",
                borderColor: showSupplierDrop ? "#FFB74D" : "hsl(var(--border))",
                minHeight: 40,
              }}
              onClick={() => setShowSupplierDrop(true)}
            >
              {showSupplierDrop ? (
                <input
                  autoFocus
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                  placeholder="ابحث باسم العميل..."
                  value={supplierFilter}
                  onChange={e => setSupplierFilter(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className={`flex-1 ${supplierName ? "" : "text-muted-foreground"}`}>
                  {supplierName || "اختر عميل تجاري أو اكتب اسم جديد"}
                </span>
              )}
              <ChevronRight
                className="w-4 h-4 text-muted-foreground shrink-0 transition-transform"
                style={{ transform: showSupplierDrop ? "rotate(90deg)" : "rotate(270deg)" }}
              />
            </div>

            {showSupplierDrop && (
              <div
                ref={supplierDropRef}
                className="absolute z-50 w-full mt-1 rounded-lg border shadow-xl overflow-hidden"
                style={{
                  background: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                {supplierFilter.trim() &&
                  !filteredSuppliers.find(s => s.name.toLowerCase() === supplierFilter.toLowerCase()) && (
                  <button type="button"
                    className="w-full text-right px-3 py-2.5 flex items-center gap-2 hover:bg-accent transition-colors border-b"
                    style={{ borderColor: "hsl(var(--border)/0.5)" }}
                    onClick={() => {
                      setSupplierName(supplierFilter.trim());
                      setSupplierId("");
                      setSupplierFilter("");
                      setShowSupplierDrop(false);
                    }}>
                    <Plus className="w-4 h-4 shrink-0" style={{ color: "#FFB74D" }} />
                    <span className="text-sm">استخدم: <strong>{supplierFilter.trim()}</strong></span>
                  </button>
                )}

                {filteredSuppliers.length === 0 && !supplierFilter.trim() && (
                  <div className="px-4 py-5 text-center text-sm text-muted-foreground">لا يوجد عملاء تجاريون مسجلون</div>
                )}

                {filteredSuppliers.map(s => (
                  <button key={s.id} type="button"
                    className="w-full text-right px-3 py-2.5 flex items-center gap-2 hover:bg-accent transition-colors border-b last:border-0"
                    style={{ borderColor: "hsl(var(--border)/0.5)" }}
                    onClick={() => {
                      setSupplierId(String(s.id));
                      setSupplierName(s.name);
                      setSupplierFilter("");
                      setShowSupplierDrop(false);
                    }}>
                    <UserCheck className="w-4 h-4 shrink-0" style={{ color: "#4DB6AC" }} />
                    <div className="text-right">
                      <p className="text-sm font-medium">{s.name}</p>
                      {(s as any).phone && <p className="text-xs text-muted-foreground">{(s as any).phone}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* جدول البنود */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>البنود</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                onClick={() => setItems(p => [...p, { productId: "", productName: "", color: "", size: "", quantity: 1, unitPrice: 0 }])}>
                <Plus className="w-3 h-3" /> إضافة بند
              </Button>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ background: "hsl(var(--muted)/0.4)" }}>
                    <th className="text-right px-2 py-2 font-medium">المنتج</th>
                    <th className="text-right px-2 py-2 font-medium">اللون</th>
                    <th className="text-right px-2 py-2 font-medium">المقاس</th>
                    <th className="text-center px-2 py-2 font-medium">المتاح</th>
                    <th className="text-center px-2 py-2 font-medium">الكمية</th>
                    <th className="text-right px-2 py-2 font-medium">سعر الوحدة</th>
                    <th className="text-right px-2 py-2 font-medium">الإجمالي</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r, i) => {
                    const colors  = colorsFor(r.productId ?? "");
                    const sizes   = r.color ? sizesFor(r.productId ?? "", r.color) : [];
                    const variant = r.productId && r.color && r.size
                      ? matchVar(r.productId, r.color, r.size) : undefined;
                    const avail   = variant ? availQty(variant) : undefined;
                    return (
                      <tr key={i} className="border-t">
                        {/* المنتج */}
                        <td className="px-2 py-1.5 min-w-[160px]">
                          <Select value={r.productId ?? ""} onValueChange={v => handleProduct(i, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر منتج" /></SelectTrigger>
                            <SelectContent>
                              {allProducts.map(p => (
                                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* اللون */}
                        <td className="px-2 py-1.5 min-w-[110px]">
                          {colors.length > 0 ? (
                            <Select value={r.color} onValueChange={v => handleColor(i, v)} disabled={!r.productId}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اللون" /></SelectTrigger>
                              <SelectContent>
                                {colors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input className="h-8 text-xs w-24" placeholder="لون" value={r.color}
                              onChange={e => setItems(p => p.map((row, idx) => idx === i ? { ...row, color: e.target.value } : row))} />
                          )}
                        </td>
                        {/* المقاس */}
                        <td className="px-2 py-1.5 min-w-[100px]">
                          {sizes.length > 0 ? (
                            <Select value={r.size} onValueChange={v => handleSize(i, v)} disabled={!r.color}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="المقاس" /></SelectTrigger>
                              <SelectContent>
                                {sizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input className="h-8 text-xs w-20" placeholder="مقاس" value={r.size}
                              onChange={e => setItems(p => p.map((row, idx) => idx === i ? { ...row, size: e.target.value } : row))} />
                          )}
                        </td>
                        {/* المتاح في المخزن */}
                        <td className="px-2 py-1.5 text-center min-w-[60px]">
                          {avail !== undefined ? (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              avail === 0 ? "bg-rose-500/15 text-rose-400" :
                              avail < 5  ? "bg-amber-500/15 text-amber-400" :
                                           "bg-emerald-500/15 text-emerald-400"}`}>
                              {avail}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        {/* الكمية */}
                        <td className="px-2 py-1.5 min-w-[70px]">
                          <Input className="h-8 text-xs w-16 text-center" type="number" min={1}
                            value={r.quantity}
                            onChange={e => setItems(p => p.map((row, idx) => idx === i ? { ...row, quantity: parseInt(e.target.value) || 1 } : row))} />
                        </td>
                        {/* سعر الوحدة */}
                        <td className="px-2 py-1.5 min-w-[100px]">
                          <Input className="h-8 text-xs w-24" type="number" min={0} placeholder="0"
                            value={r.unitPrice}
                            onChange={e => setItems(p => p.map((row, idx) => idx === i ? { ...row, unitPrice: parseFloat(e.target.value) || 0 } : row))} />
                        </td>
                        {/* الإجمالي */}
                        <td className="px-2 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ color: "#4DB6AC" }}>
                          {fmt(r.quantity * r.unitPrice)}
                        </td>
                        {/* حذف */}
                        <td className="px-2 py-1.5">
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-rose-400"
                            onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}>
                            <X className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm font-bold mt-2 text-left" style={{ color: "#4DB6AC" }}>
              الإجمالي: {fmt(total)}
            </p>
          </div>

          {/* ملاحظات */}
          <div>
            <Label>ملاحظات</Label>
            <Textarea placeholder="ملاحظات إضافية..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} className="gap-1.5"
            style={{ background: "rgba(77,182,172,0.15)", color: "#4DB6AC", border: "1px solid rgba(77,182,172,0.4)" }}>
            <ShoppingCart className="w-4 h-4" /> حفظ أمر الشراء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── SORow ──────────────────────────────────────────────────────────────────
function SORow({ order, onEdit, onDelete, onTransferToTreasury, onView, warehouses }: {
  order: SaleOrder; onEdit: (o: SaleOrder) => void;
  onDelete: (id: number) => void;
  onTransferToTreasury: (o: SaleOrder) => void;
  onView: (id: number) => void;
  warehouses: Warehouse[];
}) {
  const wName = warehouses.find(w => w.id === order.warehouseId)?.name ?? "—";
  const st  = STATUS_LABELS[order.status] ?? { label: order.status, color: "" };
  const pt  = PAY_LABELS[order.paymentStatus] ?? { label: order.paymentStatus, color: "" };
  const total = parseFloat(order.totalAmount ?? "0");
  const paid  = order.paymentStatus === "paid" ? total : parseFloat(order.paidAmount ?? "0");
  const due   = order.paymentStatus === "paid" ? 0 : Math.max(0, total - paid);
  return (
    <tr
      style={{ borderBottom: "1px solid hsl(var(--border)/0.5)", cursor: "pointer" }}
      className="transition-colors hover:bg-muted/30"
      onClick={() => onView(order.id)}
    >
      <td className="px-3 py-3 font-mono text-xs font-semibold" style={{ color: "#4DB6AC" }}>{order.soNumber}</td>
      <td className="px-3 py-3">
        <p className="text-sm font-medium">{order.clientName}</p>
        {order.clientPhone && <p className="text-xs text-muted-foreground">{order.clientPhone}</p>}
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{wName}</td>
      <td className="px-3 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>{st.label}</span>
      </td>
      <td className="px-3 py-3 text-sm font-semibold">{fmt(total)}</td>
      <td className="px-3 py-3 text-sm font-medium" style={{ color: "#26A69A" }}>{fmt(paid)}</td>
      <td className="px-3 py-3 text-sm font-semibold" style={{ color: due > 0 ? "#ef4444" : "hsl(var(--muted-foreground))" }}>{fmt(due)}</td>
      <td className={`px-3 py-3 text-xs font-semibold ${pt.color}`}>{pt.label}</td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {order.createdAt ? format(new Date(order.createdAt), "dd/MM/yyyy") : "—"}
      </td>
      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
        <div className="flex gap-1 flex-wrap">
          {!["delivered","closed"].includes(order.status) && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-500 hover:bg-rose-500/10"
              onClick={() => onDelete(order.id)}><Trash2 className="w-3 h-3" /></Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── SOForm ────────────────────────────────────────────────────────────────
type ItemRow = {
  productId: string; productName: string;
  color: string; size: string; sku: string;
  quantity: number; unitPrice: number;
  availableQty?: number; deliveredQty?: number;
  variantId?: number;
};

function SOForm({ open, onClose, editOrder, warehouses, products, onSuccess }: {
  open: boolean; onClose: () => void; editOrder: SaleOrder | null;
  warehouses: Warehouse[]; products: Product[]; onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!editOrder;

  // ── Dropdown العملاء ──────────────────────────────────────────────────────
  const [allClients,      setAllClients]      = useState<any[]>([]);
  const [clientFilter,    setClientFilter]    = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const clientInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // جيب كل العملاء مرة واحدة عند فتح الـ form
  useEffect(() => {
    if (!open) return;
    apiFetch<any[]>("/finance/clients")
      .then(data => setAllClients(Array.isArray(data) ? data : []))
      .catch(() => setAllClients([]));
  }, [open]);

  // الفلترة المحلية
  const clientSuggestions = useMemo(() => {
    if (!clientFilter.trim()) return allClients;
    const q = clientFilter.toLowerCase();
    return allClients.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.city?.toLowerCase().includes(q)
    );
  }, [allClients, clientFilter]);

  const fillClientData = (c: any) => {
    setClientName(c.name ?? "");
    setClientPhone(c.phone ?? "");
    setClientAddress([c.address, c.city, c.region].filter(Boolean).join(" — "));
    setClientFilter("");
    setShowSuggestions(false);
  };

  // إغلاق الـ dropdown عند النقر خارجه
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!suggestionsRef.current?.contains(e.target as Node) &&
          !clientInputRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // جلب كل الـ variants من الـ API
  const { data: allVariants = [] } = useQuery<Variant[]>({
    queryKey: ["variants"],
    queryFn: () => apiFetch<any>("/variants"),
    staleTime: 60_000,
  });

  const [clientName,    setClientName]    = useState(editOrder?.clientName    ?? "");
  const [clientPhone,   setClientPhone]   = useState(editOrder?.clientPhone   ?? "");
  const [clientAddress, setClientAddress] = useState(editOrder?.clientAddress ?? "");
  const [warehouseId,   setWarehouseId]   = useState(String(editOrder?.warehouseId ?? ""));
  const [status,        setStatus]        = useState(editOrder?.status        ?? "draft");
  const [payStatus,     setPayStatus]     = useState(editOrder?.paymentStatus ?? "unpaid");
  const [paidAmount,    setPaidAmount]    = useState(editOrder?.paidAmount    ?? "0");
  const [discount,      setDiscount]      = useState(editOrder?.discountAmount ?? "0");
  const [shippingCost,  setShippingCost]  = useState(editOrder?.shippingCost  ?? "0");
  const [taxAmount,     setTaxAmount]     = useState(editOrder?.taxAmount     ?? "0");
  const [notes,         setNotes]         = useState(editOrder?.notes         ?? "");
  const [expectedDate,  setExpectedDate]  = useState(editOrder?.expectedDate?.split("T")[0] ?? "");
  const [invoiceRef,    setInvoiceRef]    = useState(editOrder?.invoiceRef    ?? "");
  const [itemsLoading,  setItemsLoading]  = useState(false);
  const [stockWarning, setStockWarning] = useState<{ rowIdx: number; productName: string; color: string; size: string; available: number; requested: number } | null>(null);
  const [poDraft, setPoDraft] = useState<{ productName: string; color: string; size: string; needed: number } | null>(null);

  const blank = (): ItemRow => ({ productId: "", productName: "", color: "", size: "", sku: "", quantity: 1, unitPrice: 0 });
  const [items, setItems] = useState<ItemRow[]>([blank()]);

  useEffect(() => {
    setClientName(editOrder?.clientName ?? "");
    setClientPhone(editOrder?.clientPhone ?? "");
    setClientAddress(editOrder?.clientAddress ?? "");
    setWarehouseId(String(editOrder?.warehouseId ?? warehouses[0]?.id ?? ""));
    setStatus(editOrder?.status ?? "draft");
    setPayStatus(editOrder?.paymentStatus ?? "unpaid");
    setPaidAmount(editOrder?.paidAmount ?? "0");
    setDiscount(editOrder?.discountAmount ?? "0");
    setShippingCost(editOrder?.shippingCost ?? "0");
    setTaxAmount(editOrder?.taxAmount ?? "0");
    setNotes(editOrder?.notes ?? "");
    setExpectedDate(editOrder?.expectedDate?.split("T")[0] ?? "");
    setInvoiceRef(editOrder?.invoiceRef ?? "");
    setItems([blank()]);
    if (open && editOrder?.id) {
      setItemsLoading(true);
      apiFetch<any>(`/finance/sale-orders/${editOrder.id}`)
        .then(data => {
          if (data?.items?.length) {
            setItems(data.items.map((i: any) => ({
              productId: i.productId ? String(i.productId) : "",
              productName: i.productName ?? "",
              color: i.color ?? "", size: i.size ?? "", sku: i.sku ?? "",
              quantity: i.quantity ?? 1, unitPrice: parseFloat(i.unitPrice ?? "0"),
              deliveredQty: i.deliveredQty ?? 0,
            })));
          }
        })
        .catch(() => {})
        .finally(() => setItemsLoading(false));
    }
  }, [editOrder, open]);

  const upd = (i: number, f: keyof ItemRow, v: any) =>
    setItems(p => p.map((r, idx) => idx === i ? { ...r, [f]: v } : r));

  // ── helpers للـ variants ───────────────────────────────────────────────
  // الـ variants الخاصة بمنتج معين
  const variantsForProduct = (productId: string) =>
    allVariants.filter(v => String(v.productId) === productId);

  // الألوان المتاحة للمنتج
  const colorsForProduct = (productId: string) =>
    [...new Set(variantsForProduct(productId).map(v => v.color).filter(Boolean))];

  // المقاسات المتاحة بعد اختيار اللون
  const sizesForColor = (productId: string, color: string) =>
    variantsForProduct(productId)
      .filter(v => v.color === color)
      .map(v => v.size)
      .filter(Boolean);

  // الـ variant المطابق للمنتج + اللون + المقاس
  const matchVariant = (productId: string, color: string, size: string) =>
    variantsForProduct(productId).find(v => v.color === color && v.size === size);

  // الكمية المتاحة
  const availQty = (v: Variant) =>
    Math.max(0, (v.totalQuantity ?? 0) - (v.reservedQuantity ?? 0) - (v.soldQuantity ?? 0));

  // عند اختيار منتج جديد
  const handleProductChange = (i: number, productId: string) => {
    const p = products.find(x => String(x.id) === productId);
    const colors = colorsForProduct(productId);
    const firstColor = colors[0] ?? "";
    const sizes = firstColor ? sizesForColor(productId, firstColor) : [];
    const firstSize = sizes[0] ?? "";
    const variant = firstColor && firstSize ? matchVariant(productId, firstColor, firstSize) : undefined;
    setItems(prev => prev.map((r, idx) => idx === i ? {
      ...r,
      productId,
      productName: p?.name ?? "",
      color: firstColor,
      size: firstSize,
      sku: variant?.sku ?? "",
      variantId: variant?.id,
      unitPrice: variant ? parseFloat(String(variant.unitPrice)) : 0,
      availableQty: variant ? availQty(variant) : undefined,
    } : r));
  };

  // عند اختيار لون جديد
  const handleColorChange = (i: number, color: string) => {
    const r = items[i];
    const sizes = sizesForColor(r.productId, color);
    const firstSize = sizes[0] ?? "";
    const variant = firstSize ? matchVariant(r.productId, color, firstSize) : undefined;
    setItems(prev => prev.map((row, idx) => idx === i ? {
      ...row, color, size: firstSize,
      sku: variant?.sku ?? "",
      variantId: variant?.id,
      unitPrice: variant ? parseFloat(String(variant.unitPrice)) : row.unitPrice,
      availableQty: variant ? availQty(variant) : undefined,
    } : row));
  };

  // عند اختيار مقاس جديد
  const handleSizeChange = (i: number, size: string) => {
    const r = items[i];
    const variant = matchVariant(r.productId, r.color, size);
    setItems(prev => prev.map((row, idx) => idx === i ? {
      ...row, size,
      sku: variant?.sku ?? "",
      variantId: variant?.id,
      unitPrice: variant ? parseFloat(String(variant.unitPrice)) : row.unitPrice,
      availableQty: variant ? availQty(variant) : undefined,
    } : row));
  };

  const subTotal = items.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
  const total = subTotal + Number(shippingCost) + Number(taxAmount) - Number(discount);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        clientName, clientPhone: clientPhone || null, clientAddress: clientAddress || null,
        warehouseId: warehouseId || null, status, paymentStatus: payStatus,
        paidAmount: parseFloat(paidAmount), discountAmount: parseFloat(discount),
        shippingCost: parseFloat(shippingCost), taxAmount: parseFloat(taxAmount),
        notes: notes || null, expectedDate: expectedDate || null,
        invoiceRef: invoiceRef || null,
      };
      if (isEdit) {
        body.items = items.map(r => ({
          productId: r.productId ? parseInt(r.productId) : null,
          variantId: r.variantId ?? null,
          productName: r.productName, color: r.color || null, size: r.size || null,
          sku: r.sku || null, quantity: r.quantity, unitPrice: r.unitPrice,
        }));
        return apiFetch<any>(`/finance/sale-orders/${editOrder!.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      body.items = items.map(r => ({
        productId: r.productId ? parseInt(r.productId) : null,
        variantId: r.variantId ?? null,
        productName: r.productName, color: r.color || null, size: r.size || null,
        sku: r.sku || null, quantity: r.quantity, unitPrice: r.unitPrice,
      }));
      return api.post("/finance/sale-orders", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-sale-orders"] });
      toast({ title: isEdit ? "تم تحديث الأمر" : "تم إنشاء أمر البيع" });
      onSuccess(); onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>{isEdit ? `تعديل — ${editOrder?.soNumber}` : "أمر بيع جديد"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-2">
          {/* اسم العميل — Dropdown كامل */}
          <div className="col-span-2 relative">
            <Label>اسم العميل / الشركة *</Label>
            <div className="relative">
              {/* حقل الاختيار — يعرض الاسم المختار أو يفتح البحث */}
              <div
                ref={clientInputRef}
                className="flex items-center w-full rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors"
                style={{
                  background: "hsl(var(--input,var(--background)))",
                  borderColor: showSuggestions ? "#4DB6AC" : "hsl(var(--border))",
                  minHeight: 40,
                }}
                onClick={() => setShowSuggestions(true)}
              >
                {showSuggestions ? (
                  <input
                    autoFocus
                    className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                    placeholder="ابحث باسم العميل أو رقم الهاتف..."
                    value={clientFilter}
                    onChange={e => setClientFilter(e.target.value)}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className={`flex-1 ${clientName ? "" : "text-muted-foreground"}`}>
                    {clientName || "اختر عميل أو اكتب اسم جديد"}
                  </span>
                )}
                <ChevronRight
                  className="w-4 h-4 text-muted-foreground shrink-0 transition-transform"
                  style={{ transform: showSuggestions ? "rotate(90deg)" : "rotate(270deg)" }}
                />
              </div>

              {/* Dropdown */}
              {showSuggestions && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-50 w-full mt-1 rounded-lg border shadow-xl overflow-hidden"
                  style={{
                    background: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    maxHeight: 280,
                    overflowY: "auto",
                  }}
                >
                  {/* خيار إدخال اسم جديد لو كاتب حاجة مش موجودة */}
                  {clientFilter.trim() && !clientSuggestions.find(c => c.name?.toLowerCase() === clientFilter.toLowerCase()) && (
                    <button
                      type="button"
                      className="w-full text-right px-3 py-2.5 flex items-center gap-2 hover:bg-accent transition-colors border-b"
                      style={{ borderColor: "hsl(var(--border)/0.5)" }}
                      onClick={() => {
                        setClientName(clientFilter.trim());
                        setClientFilter("");
                        setShowSuggestions(false);
                      }}
                    >
                      <Plus className="w-4 h-4 text-teal-400 shrink-0" />
                      <span className="text-sm">استخدم: <strong>{clientFilter.trim()}</strong></span>
                    </button>
                  )}

                  {clientSuggestions.length === 0 && !clientFilter.trim() && (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">لا يوجد عملاء مسجلون بعد</div>
                  )}

                  {clientSuggestions.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-right px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-accent transition-colors border-b last:border-0"
                      style={{ borderColor: "hsl(var(--border)/0.5)" }}
                      onClick={() => fillClientData(c)}
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-teal-400 shrink-0" />
                        <div className="text-right">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[c.phone, c.city].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {c.totalOrders ? `${c.totalOrders} أمر` : ""}
                        {c.totalSales ? ` · ${fmt(c.totalSales)}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div><Label>رقم الهاتف</Label><Input placeholder="01xxxxxxxxx" value={clientPhone} onChange={e => setClientPhone(e.target.value)} /></div>
          <div>
            <Label>المخزن <span className="text-red-400">*</span></Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className={!warehouseId ? "border-red-500/50" : ""}><SelectValue placeholder="اختر المخزن (مطلوب)" /></SelectTrigger>
              <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
            {!warehouseId && <p className="text-[10px] text-red-400 mt-1">⚠️ اختيار المخزن مطلوب لخصم المخزون</p>}
          </div>
          <div className="col-span-2"><Label>العنوان</Label><Input placeholder="عنوان التسليم" value={clientAddress} onChange={e => setClientAddress(e.target.value)} /></div>
          {/* الحالة والدفع */}
          <div>
            <Label>حالة الأمر</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>حالة الدفع</Label>
            <Select value={payStatus} onValueChange={setPayStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PAY_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {payStatus !== "unpaid" && (
            <div><Label>المبلغ المدفوع (ج.م)</Label><Input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} /></div>
          )}
          <div><Label>تاريخ التسليم المتوقع</Label><Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} /></div>
          {/* التكاليف الإضافية */}
          <div><Label>تكلفة الشحن</Label><Input type="number" value={shippingCost} onChange={e => setShippingCost(e.target.value)} /></div>
          <div><Label>الضريبة</Label><Input type="number" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} /></div>
          <div><Label>الخصم</Label><Input type="number" value={discount} onChange={e => setDiscount(e.target.value)} /></div>
          <div><Label>رقم الفاتورة المرتبطة</Label><Input placeholder="INV-2026-001" value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} /></div>
          <div className="col-span-2"><Label>ملاحظات</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
        </div>

        {/* ── البنود ── */}
        {isEdit ? (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base font-semibold">بنود الأمر</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setItems(p => [...p, blank()])}>
                <Plus className="w-3 h-3 ml-1" />إضافة بند
              </Button>
            </div>
            {itemsLoading ? (
              <div className="rounded-lg border p-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <ShoppingBag className="w-4 h-4 animate-pulse" /><span>جارٍ جلب البنود…</span>
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>{["المنتج","اللون","المقاس","المتاح","الكمية","سعر الوحدة","الإجمالي",""].map(h => (
                      <th key={h} className="px-2 py-2 text-right text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {items.map((r, i) => {
                      const colors  = colorsForProduct(r.productId);
                      const sizes   = r.color ? sizesForColor(r.productId, r.color) : [];
                      const avail   = r.availableQty;
                      const overQty = avail !== undefined && r.quantity > avail;
                      return (
                        <tr key={i} className="border-t">
                          {/* المنتج */}
                          <td className="px-2 py-1.5 min-w-[160px]">
                            <Select value={r.productId} onValueChange={v => handleProductChange(i, v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر منتج" /></SelectTrigger>
                              <SelectContent>{products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          {/* اللون */}
                          <td className="px-2 py-1.5 min-w-[100px]">
                            <Select value={r.color} onValueChange={v => handleColorChange(i, v)} disabled={!r.productId}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="لون" /></SelectTrigger>
                              <SelectContent>{colors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          {/* المقاس */}
                          <td className="px-2 py-1.5 min-w-[90px]">
                            <Select value={r.size} onValueChange={v => handleSizeChange(i, v)} disabled={!r.color}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="مقاس" /></SelectTrigger>
                              <SelectContent>{sizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          {/* المتاح */}
                          <td className="px-2 py-1.5 text-center text-xs" style={{ color: overQty ? "#ef4444" : "#10b981" }}>
                            {avail !== undefined ? avail : "—"}
                          </td>
                          {/* الكمية */}
                          <td className="px-2 py-1.5 min-w-[70px]">
                            <Input type="number" min={1} className="h-8 text-xs text-center"
                              style={{ borderColor: overQty ? "#ef4444" : undefined }}
                              value={r.quantity}
                              onChange={e => upd(i, "quantity", Math.max(1, parseInt(e.target.value) || 1))} />
                          </td>
                          {/* السعر */}
                          <td className="px-2 py-1.5 min-w-[90px]">
                            <Input type="number" min={0} className="h-8 text-xs" value={r.unitPrice}
                              onChange={e => upd(i, "unitPrice", parseFloat(e.target.value) || 0)} />
                          </td>
                          {/* الإجمالي */}
                          <td className="px-2 py-1.5 text-xs font-semibold whitespace-nowrap" style={{ color: "#4DB6AC" }}>
                            {fmt(r.quantity * r.unitPrice)}
                          </td>
                          {/* حذف البند */}
                          <td className="px-2 py-1.5">
                            <Button type="button" size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-500/10"
                              disabled={items.length === 1}
                              onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base font-semibold">البنود (منتجات الجملة)</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setItems(p => [...p, blank()])}><Plus className="w-3 h-3 ml-1" />إضافة بند</Button>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>{["المنتج","اللون","المقاس","المتاح","الكمية","سعر الوحدة","الإجمالي",""].map(h => (
                    <th key={h} className="px-2 py-2 text-right text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {items.map((r, i) => {
                    const colors  = colorsForProduct(r.productId);
                    const sizes   = r.color ? sizesForColor(r.productId, r.color) : [];
                    const avail   = r.availableQty;
                    const overQty = avail !== undefined && r.quantity > avail;
                    return (
                      <tr key={i} className="border-t">
                        {/* المنتج */}
                        <td className="px-2 py-1.5 min-w-[160px]">
                          <Select value={r.productId} onValueChange={v => handleProductChange(i, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر منتج" /></SelectTrigger>
                            <SelectContent>{products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        {/* اللون */}
                        <td className="px-2 py-1.5 min-w-[110px]">
                          {colors.length > 0 ? (
                            <Select value={r.color} onValueChange={v => handleColorChange(i, v)} disabled={!r.productId}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اللون" /></SelectTrigger>
                              <SelectContent>{colors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : (
                            <Input className="h-8 text-xs w-24" placeholder="لون" value={r.color} onChange={e => upd(i,"color",e.target.value)} />
                          )}
                        </td>
                        {/* المقاس */}
                        <td className="px-2 py-1.5 min-w-[100px]">
                          {sizes.length > 0 ? (
                            <Select value={r.size} onValueChange={v => handleSizeChange(i, v)} disabled={!r.color}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="المقاس" /></SelectTrigger>
                              <SelectContent>{sizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : (
                            <Input className="h-8 text-xs w-20" placeholder="مقاس" value={r.size} onChange={e => upd(i,"size",e.target.value)} />
                          )}
                        </td>
                        {/* المتاح */}
                        <td className="px-2 py-1.5 text-center min-w-[60px]">
                          {avail !== undefined ? (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${avail === 0 ? "bg-rose-500/15 text-rose-400" : avail < 5 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                              {avail}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        {/* الكمية */}
                        <td className="px-2 py-1.5 min-w-[70px]">
                          <Input
                            className={`h-8 text-xs w-16 text-center ${overQty ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
                            type="number" min={1}
                            value={r.quantity}
                            onChange={e => {
                              const qty = parseInt(e.target.value) || 1;
                              upd(i, "quantity", qty);
                            }}
                          />
                          {overQty && <p className="text-[10px] text-rose-400 mt-0.5">تجاوز المتاح</p>}
                        </td>
                        {/* سعر الوحدة */}
                        <td className="px-2 py-1.5 min-w-[90px]">
                          <Input className="h-8 text-xs w-24" type="number" min={0}
                            value={r.unitPrice}
                            onChange={e => upd(i,"unitPrice",parseFloat(e.target.value)||0)}
                          />
                        </td>
                        {/* الإجمالي */}
                        <td className="px-2 py-1.5 font-semibold text-xs whitespace-nowrap" style={{ color: "#4DB6AC" }}>
                          {fmt(r.quantity * r.unitPrice)}
                        </td>
                        {/* حذف */}
                        <td className="px-2 py-1.5">
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-rose-400"
                            onClick={() => setItems(p => p.filter((_,idx) => idx !== i))}>
                            <X className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-left space-y-0.5 text-sm">
              <p className="text-muted-foreground">الإجمالي الفرعي: <strong>{fmt(subTotal)}</strong></p>
              <p className="text-lg font-black" style={{ color: "#4DB6AC" }}>الإجمالي الكلي: {fmt(total)}</p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => {
            // تحقق من المخزون قبل الإنشاء
            if (!isEdit) {
              const overItem = items.find(r => {
                if (r.availableQty === undefined) return false;
                return r.quantity > r.availableQty;
              });
              if (overItem) {
                setStockWarning({
                  rowIdx: items.indexOf(overItem),
                  productName: overItem.productName,
                  color: overItem.color,
                  size: overItem.size,
                  available: overItem.availableQty!,
                  requested: overItem.quantity,
                });
                return;
              }
            }
            mutation.mutate();
          }} disabled={mutation.isPending || !clientName.trim() || !warehouseId}>
            {mutation.isPending ? "جارٍ الحفظ…" : isEdit ? "حفظ التعديلات" : "إنشاء الأمر"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* ── dialog تحذير الكمية ── */}
    {stockWarning && (
      <Dialog open={!!stockWarning} onOpenChange={() => setStockWarning(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <span className="text-2xl">⚠️</span> تجاوز الكمية المتاحة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p style={{ color: "hsl(var(--foreground))" }}>
              طلبت <strong className="text-rose-400">{stockWarning.requested}</strong> قطعة من{" "}
              <strong>{stockWarning.productName}</strong>
              {stockWarning.color && ` — ${stockWarning.color}`}
              {stockWarning.size && ` / ${stockWarning.size}`}
            </p>
            <p style={{ color: "hsl(var(--muted-foreground))" }}>
              الكمية المتاحة حالياً:{" "}
              <strong className="text-emerald-400">{stockWarning.available}</strong> قطعة
              &nbsp;|&nbsp; النقص:{" "}
              <strong className="text-rose-400">{stockWarning.requested - stockWarning.available}</strong> قطعة
            </p>
            <div className="rounded-lg p-3" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                الكمية المطلوبة تتجاوز المخزون — يمكنك إنشاء أمر شراء فوري بالكمية الناقصة.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setStockWarning(null)}>تجاهل</Button>
            <Button size="sm"
              className="gap-1.5"
              style={{ background: "rgba(77,182,172,0.15)", color: "#4DB6AC", border: "1px solid rgba(77,182,172,0.4)" }}
              onClick={() => {
                setPoDraft({
                  productName: stockWarning.productName,
                  color: stockWarning.color,
                  size: stockWarning.size,
                  needed: stockWarning.requested - stockWarning.available,
                });
                setStockWarning(null);
              }}>
              <ShoppingCart className="w-3.5 h-3.5" /> إنشاء أمر شراء
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}

    {/* ── dialog أمر الشراء السريع ── */}
    {poDraft && (
      <PurchaseOrderQuickDialog
        draft={poDraft}
        onClose={() => setPoDraft(null)}
      />
    )}
    </>
  );
}

// ── الصفحة الرئيسية ──────────────────────────────────────────────────────
export default function FinanceSales() {

  // ── Finance access guard ───────────────────────────────────────────────────
  const { isAdmin: _fAdmin, can: _fCan } = useAuth();
  if (!_fAdmin && !_fCan("finance.sales")) {
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

  const [search,        setSearch]        = useState("");
  const [filterStatus,    setFilterStatus]    = useState("all");
  const [filterPay,       setFilterPay]       = useState("all");
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterClient,    setFilterClient]    = useState("");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");
  const [fromDate,        setFromDate]        = useState("");
  const [toDate,          setToDate]          = useState("");
  const [colFilters,    setColFilters]    = useState(false);
  const [openCol,       setOpenCol]       = useState<string|null>(null);
  const [formOpen,      setFormOpen]      = useState(false);
  const [editOrder,     setEditOrder]     = useState<SaleOrder|null>(null);

  // فتح فورم جديد تلقائياً لو جاي من /finance/sales/new أو ?new=1
  useEffect(() => {
    if (window.location.search.includes("new=1") || window.location.pathname.endsWith("/new")) {
      setFormOpen(true);
      navigate("/finance/sales", { replace: true });
    }
  }, []);

  const { data: orders = [], isLoading } = useQuery<SaleOrder[]>({
    queryKey: ["finance-sale-orders"],
    queryFn: () => api.get("/finance/sale-orders"),
    staleTime: 0, refetchOnWindowFocus: true,
  });
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["warehouses-list"],
    queryFn: () => api.get("/warehouses"),
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products-list"],
    queryFn: () => api.get("/products"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      if (q && !o.soNumber?.toLowerCase().includes(q) && !o.clientName?.toLowerCase().includes(q) && !o.clientPhone?.toLowerCase().includes(q)) return false;
      if (filterStatus    !== "all" && o.status        !== filterStatus)    return false;
      if (filterPay       !== "all" && o.paymentStatus !== filterPay)       return false;
      if (filterWarehouse !== "all" && String(o.warehouseId) !== filterWarehouse) return false;
      if (filterClient.trim() && !o.clientName?.toLowerCase().includes(filterClient.toLowerCase())) return false;
      if (filterAmountMin && parseFloat(o.totalAmount ?? "0") < parseFloat(filterAmountMin)) return false;
      if (filterAmountMax && parseFloat(o.totalAmount ?? "0") > parseFloat(filterAmountMax)) return false;
      if (fromDate && new Date(o.createdAt) < new Date(fromDate)) return false;
      if (toDate && new Date(o.createdAt) > new Date(toDate + "T23:59:59")) return false;
      return true;
    });
  }, [orders, search, filterStatus, filterPay, filterWarehouse, filterClient, filterAmountMin, filterAmountMax, fromDate, toDate]);

  const stats = useMemo(() => {
    const total      = filtered.reduce((s,o) => s + parseFloat(o.totalAmount??"0"), 0);
    const paid       = filtered.reduce((s,o) => {
      const t = parseFloat(o.totalAmount ?? "0");
      return s + (o.paymentStatus === "paid" ? t : parseFloat(o.paidAmount ?? "0"));
    }, 0);
    const unpaid     = Math.max(0, total - paid);
    const pending    = filtered.filter(o => ["draft","confirmed","processing"].includes(o.status)).length;
    const delivered  = filtered.filter(o => o.status === "delivered").length;
    return { total, paid, unpaid, pending, delivered };
  }, [filtered]);

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/finance/sale-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance-sale-orders"] }); toast({ title: "تم الحذف" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // طباعة الفاتورة — جيب البنود أول
  const handlePrint = async (order: SaleOrder) => {
    try {
      const data = await apiFetch<any>(`/finance/sale-orders/${order.id}`);
      printSaleInvoice(order, data?.items ?? [], warehouses);
    } catch {
      printSaleInvoice(order, [], warehouses);
    }
  };

  // إغلاق الفاتورة وتحويل للخزينة
  const handleTransferToTreasury = async (order: SaleOrder) => {
    if (!confirm(`إغلاق فاتورة ${order.soNumber} وتحويل ${fmt(order.totalAmount)} للخزينة؟`)) return;
    try {
      await apiFetch<any>(`/finance/sale-orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      });
      qc.invalidateQueries({ queryKey: ["finance-sale-orders"] });
      toast({ title: "✅ تم الإغلاق والتحويل للخزينة", description: `${fmt(order.totalAmount)} تم تسجيلها في الخزينة` });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message ?? "تعذّر الإغلاق", variant: "destructive" });
    }
  };

  const activeFilters = [
    filterStatus !== "all", filterPay !== "all", filterWarehouse !== "all",
    !!filterClient.trim(), !!filterAmountMin, !!filterAmountMax, !!fromDate, !!toDate
  ].filter(Boolean).length;

  const fi = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={() => { onClick(); setOpenCol(null); }}
      className="w-full text-right px-3 py-2 text-sm transition-colors hover:bg-muted/40 flex items-center justify-between"
      style={{ color: active ? "#4DB6AC" : "hsl(var(--foreground))" }}>
      {label}
      {active && <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />}
    </button>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => navigate("/finance")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ChevronRight className="w-4 h-4" />لوحة الماليات
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-6 h-6" style={{ color: "#4DB6AC" }} />أوامر البيع
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} أمر — إجمالي {fmt(stats.total)}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input className="pr-9 h-9 w-52 text-sm" placeholder="بحث بالاسم أو الرقم…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button variant={colFilters ? "default" : "outline"} size="sm" className="gap-1.5 relative"
            onClick={() => setColFilters(p => !p)}
            style={colFilters ? { background: "rgba(77,182,172,0.15)", color: "#4DB6AC", border: "1px solid rgba(77,182,172,0.4)" } : {}}>
            <SlidersHorizontal className="w-4 h-4" />{colFilters ? "إخفاء الفلتر" : "فلتر"}
            {!colFilters && activeFilters > 0 && (
              <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ background: "#4DB6AC", color: "#000" }}>{activeFilters}</span>
            )}
          </Button>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" className="gap-1 text-rose-400"
              onClick={() => { setFilterStatus("all"); setFilterPay("all"); setFilterWarehouse("all"); setFilterClient(""); setFilterAmountMin(""); setFilterAmountMax(""); setFromDate(""); setToDate(""); }}>
              <X className="w-3.5 h-3.5" />مسح
            </Button>
          )}
          <Button size="sm" onClick={() => { setEditOrder(null); setFormOpen(true); }} className="gap-1"
            style={{ background: "linear-gradient(135deg,#4DB6AC,#26A69A)", color: "#0a0a0a" }}>
            <Plus className="w-4 h-4" />أمر بيع جديد
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الأوامر",   value: fmt(stats.total),  color: "#4DB6AC", glow: "rgba(77,182,172,0.32)",   bg: "linear-gradient(135deg,rgba(77,182,172,0.42) 0%,rgba(77,182,172,0.16) 52%,rgba(77,182,172,0.04) 100%)" },
          { label: "إجمالي المحصّل",   value: fmt(stats.paid),   color: "#26A69A", glow: "rgba(38,166,154,0.28)",   bg: "linear-gradient(135deg,rgba(38,166,154,0.44) 0%,rgba(38,166,154,0.18) 52%,rgba(38,166,154,0.04) 100%)" },
          { label: "المتبقي للتحصيل",  value: fmt(stats.unpaid), color: "#ef4444", glow: "rgba(239,68,68,0.28)",    bg: "linear-gradient(135deg,rgba(239,68,68,0.42) 0%,rgba(239,68,68,0.16) 52%,rgba(239,68,68,0.04) 100%)" },
          { label: "قيد التنفيذ / مُسلَّم", value: `${stats.pending} / ${stats.delivered}`, color: "#7E57C2", glow: "rgba(126,87,194,0.32)", bg: "linear-gradient(135deg,rgba(126,87,194,0.42) 0%,rgba(126,87,194,0.16) 52%,rgba(126,87,194,0.04) 100%)" },
        ].map(c => (
          <div key={c.label} className="relative overflow-hidden rounded-[18px] px-4 py-3.5 text-center hover:-translate-y-0.5 transition-transform duration-300"
            style={{ background: c.bg, border: `1px solid ${c.glow}`, boxShadow: `inset 0 1px 0 ${c.glow},0 10px 24px ${c.glow}`, backdropFilter: "blur(12px)" }}>
            <div className="absolute inset-x-6 top-0 h-px opacity-80" style={{ background: `linear-gradient(90deg,transparent,${c.color},transparent)` }} />
            <p className="text-[11px] font-bold" style={{ color: "hsl(var(--muted-foreground))" }}>{c.label}</p>
            <p className="mt-1 truncate text-xl font-black sm:text-2xl" style={{ color: c.color, textShadow: `0 0 14px ${c.color}88` }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="relative overflow-hidden rounded-[22px]"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "inset 0 1px 0 rgba(77,182,172,0.08),0 8px 32px rgba(0,0,0,0.18)" }}>
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg,transparent,rgba(77,182,172,0.6),rgba(38,166,154,0.6),transparent)" }} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "hsl(var(--muted)/0.3)", borderBottom: "1px solid hsl(var(--border))" }}>
                <th className="px-3 py-3 text-right">
                  <ColFilter label="رقم الأمر" active={!!search.trim()} visible={colFilters}
                    isOpen={openCol==="so"} onToggle={() => setOpenCol(p => p==="so" ? null : "so")}>
                    <div className="p-2"><Input className="h-7 text-xs" placeholder="بحث برقم الأمر…" value={search} onChange={e => setSearch(e.target.value)} autoFocus /></div>
                  </ColFilter>
                </th>
                <th className="px-3 py-3 text-right">
                  <ColFilter label="العميل" active={!!filterClient} visible={colFilters}
                    isOpen={openCol==="client"} onToggle={() => setOpenCol(p => p==="client" ? null : "client")}>
                    <div className="py-1" style={{ maxHeight: 260, overflowY: "auto" }}>
                      {filterClient && (
                        <button
                          className="w-full text-right px-3 py-2 flex items-center gap-2 hover:bg-accent transition-colors border-b text-xs text-muted-foreground"
                          style={{ borderColor: "hsl(var(--border)/0.5)" }}
                          onClick={() => { setFilterClient(""); setOpenCol(null); }}
                        >
                          <X className="w-3 h-3" /> إلغاء الفلتر
                        </button>
                      )}
                      {[...new Set(orders.map(o => o.clientName).filter(Boolean))].sort((a,b) => a.localeCompare(b,"ar")).map(name => (
                        <button
                          key={name}
                          className="w-full text-right px-3 py-2 flex items-center gap-2 hover:bg-accent transition-colors border-b last:border-0 text-sm"
                          style={{
                            borderColor: "hsl(var(--border)/0.5)",
                            background: filterClient === name ? "rgba(77,182,172,0.12)" : undefined,
                            color: filterClient === name ? "#4DB6AC" : undefined,
                            fontWeight: filterClient === name ? 600 : undefined,
                          }}
                          onClick={() => { setFilterClient(name); setOpenCol(null); }}
                        >
                          <UserCheck className="w-3.5 h-3.5 shrink-0" style={{ color: filterClient === name ? "#4DB6AC" : "hsl(var(--muted-foreground))" }} />
                          {name}
                        </button>
                      ))}
                    </div>
                  </ColFilter>
                </th>
                <th className="px-3 py-3 text-right">
                  <ColFilter label="المخزن" active={filterWarehouse!=="all"} visible={colFilters}
                    isOpen={openCol==="wh"} onToggle={() => setOpenCol(p => p==="wh" ? null : "wh")}>
                    <div className="py-1">
                      {fi("الكل", filterWarehouse==="all", () => setFilterWarehouse("all"))}
                      {warehouses.map(w => fi(w.name, filterWarehouse===String(w.id), () => setFilterWarehouse(String(w.id))))}
                    </div>
                  </ColFilter>
                </th>
                <th className="px-3 py-3 text-right">
                  <ColFilter label="الحالة" active={filterStatus!=="all"} visible={colFilters}
                    isOpen={openCol==="status"} onToggle={() => setOpenCol(p => p==="status" ? null : "status")}>
                    <div className="py-1">
                      {fi("الكل", filterStatus==="all", () => setFilterStatus("all"))}
                      {Object.entries(STATUS_LABELS).map(([k,v]) => fi(v.label, filterStatus===k, () => setFilterStatus(k)))}
                    </div>
                  </ColFilter>
                </th>
                <th className="px-3 py-3 text-right">
                  <ColFilter label="الإجمالي" active={!!filterAmountMin||!!filterAmountMax} visible={colFilters}
                    isOpen={openCol==="amount"} onToggle={() => setOpenCol(p => p==="amount" ? null : "amount")}>
                    <div className="p-2 space-y-2">
                      <div><p className="text-[10px] text-muted-foreground mb-1">من</p><Input type="number" className="h-7 text-xs" placeholder="0" value={filterAmountMin} onChange={e => setFilterAmountMin(e.target.value)} /></div>
                      <div><p className="text-[10px] text-muted-foreground mb-1">إلى</p><Input type="number" className="h-7 text-xs" placeholder="∞" value={filterAmountMax} onChange={e => setFilterAmountMax(e.target.value)} /></div>
                    </div>
                  </ColFilter>
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground">المحصّل</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground">المتبقي</th>
                <th className="px-3 py-3 text-right">
                  <ColFilter label="الدفع" active={filterPay!=="all"} visible={colFilters}
                    isOpen={openCol==="pay"} onToggle={() => setOpenCol(p => p==="pay" ? null : "pay")}>
                    <div className="py-1">
                      {fi("الكل", filterPay==="all", () => setFilterPay("all"))}
                      {Object.entries(PAY_LABELS).map(([k,v]) => fi(v.label, filterPay===k, () => setFilterPay(k)))}
                    </div>
                  </ColFilter>
                </th>
                <th className="px-3 py-3 text-right">
                  <ColFilter label="التاريخ" active={!!fromDate||!!toDate} visible={colFilters}
                    isOpen={openCol==="date"} onToggle={() => setOpenCol(p => p==="date" ? null : "date")}>
                    <div className="p-2 space-y-2">
                      <div><p className="text-[10px] text-muted-foreground mb-1">من</p><Input type="date" className="h-7 text-xs" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
                      <div><p className="text-[10px] text-muted-foreground mb-1">إلى</p><Input type="date" className="h-7 text-xs" value={toDate} onChange={e => setToDate(e.target.value)} /></div>
                      {(fromDate||toDate) && <button className="w-full text-xs text-rose-400 py-1" onClick={() => { setFromDate(""); setToDate(""); setOpenCol(null); }}>مسح</button>}
                    </div>
                  </ColFilter>
                </th>
                <th className="px-3 py-3 text-right">
                  <ColFilter label="الحالة" active={filterStatus!=="all"} visible={colFilters}
                    isOpen={openCol==="status"} onToggle={() => setOpenCol(p => p==="status" ? null : "status")}>
                    <div className="py-1">
                      {fi("الكل", filterStatus==="all", () => setFilterStatus("all"))}
                      {Object.entries(STATUS_LABELS).map(([k,v]) => fi(v.label, filterStatus===k, () => setFilterStatus(k)))}
                    </div>
                  </ColFilter>
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <ShoppingBag className="w-6 h-6 animate-pulse" /><span className="text-sm">جارٍ التحميل…</span>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2" style={{ color: "hsl(var(--muted-foreground)/0.5)" }}>
                    <ShoppingBag className="w-10 h-10 opacity-30" />
                    <p className="text-sm font-medium">{activeFilters > 0 || search ? "لا توجد نتائج للفلتر" : "لا توجد أوامر بيع حتى الآن"}</p>
                    {(activeFilters > 0 || search) && (
                      <button className="text-xs mt-1 underline" style={{ color: "#4DB6AC" }}
                        onClick={() => { setSearch(""); setFilterStatus("all"); setFilterPay("all"); setFromDate(""); setToDate(""); }}>
                        مسح الفلاتر
                      </button>
                    )}
                  </div>
                </td></tr>
              ) : filtered.map(o => (
                <SORow key={o.id} order={o} warehouses={warehouses}
                  onEdit={o => { setEditOrder(o); setFormOpen(true); }}
                  onDelete={id => { if (confirm("هل تريد حذف هذا الأمر؟")) deleteMut.mutate(id); }}
                  onView={id => navigate(`/finance/sales/${id}`)}
                  onTransferToTreasury={handleTransferToTreasury} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <SOForm open={formOpen} onClose={() => { setFormOpen(false); setEditOrder(null); }}
          editOrder={editOrder} warehouses={warehouses} products={products}
          onSuccess={() => { setFormOpen(false); setEditOrder(null); }} />
      )}
    </div>
  );
}
