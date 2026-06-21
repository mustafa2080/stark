import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { productsApi, variantsApi, analyticsApi, warehousesApi, ordersApi, shipmentsApi, type Product, type ProductVariant, type StockIntelligenceItem, type Warehouse, type VariantWarehouseStock } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Package, AlertTriangle, Edit2, Trash2, ChevronDown, ChevronRight,
  Layers, Tag, TrendingUp, DollarSign, Boxes, BarChart3, Search, PackagePlus, Archive,
  Filter, X, SortAsc, SortDesc, ChevronDown as ChevronDownIcon, Warehouse as WarehouseIcon, MapPin, Printer, ImagePlus, Trash,
  Truck, Clock3, RotateCcw, CheckCircle2, ArrowRight, PackageX, RefreshCw, TrendingDown, Eye,
  AlertCircle, Zap, Target, Activity, PieChart, ShieldAlert, CircleDollarSign, PackageCheck
} from "lucide-react";

// ─── Product Image Upload ──────────────────────────────────────────────────────
function ProductImageUpload({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("الحجم الأقصى 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.75);
        onChange(compressed);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="flex flex-col items-center gap-2">
      {value ? (
        <div className="relative group">
          <img src={value} alt="صورة المنتج" className="w-24 h-24 object-cover rounded-xl border-2 border-primary/30 shadow" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-2 -left-2 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
          >
            <Trash className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <label className="w-24 h-24 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 cursor-pointer transition-colors">
          <ImagePlus className="w-7 h-7 text-muted-foreground mb-1" />
          <span className="text-[10px] text-muted-foreground text-center">رفع صورة</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      )}
      {value && (
        <label className="text-[11px] text-primary cursor-pointer hover:underline flex items-center gap-1">
          <ImagePlus className="w-3 h-3" />تغيير الصورة
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

const getColorHex = (name: string): string => {
  // لو القيمة نفسها hex color ارجعها مباشرة
  if (/^#[0-9a-fA-F]{3,8}$/.test(name)) return name;
  const map: Record<string, string> = {
    // بهمزة
    أسود: "#1a1a1a", أبيض: "#f5f5f5", أزرق: "#1a4e8a", أحمر: "#8a1a1a",
    أخضر: "#2a7a3a", أصفر: "#c8a81a",
    // بدون همزة
    اسود: "#1a1a1a", ابيض: "#f5f5f5", ازرق: "#1a4e8a", احمر: "#8a1a1a",
    اخضر: "#2a7a3a", اصفر: "#c8a81a",
    // باقي الألوان
    بيج: "#d4b896", رمادي: "#8a8a8a", كحلي: "#1a2744", بني: "#6b3f1f",
    زيتي: "#4a5c2a", بردقاني: "#6b1a2e", وردي: "#c87892", بنفسجي: "#5a2e7a",
    برتقالي: "#c8601a", تركوازي: "#1a7a7a", ذهبي: "#c8a020", فضي: "#a0a0b0",
    لبني: "#f5ede0", تيفاني: "#0abfbc", نيلي: "#1a1a5e", سكري: "#e8a0b0",
    // إنجليزي
    blue: "#1a4e8a", red: "#8a1a1a", green: "#2a7a3a", yellow: "#c8a81a",
    black: "#1a1a1a", white: "#f5f5f5", gray: "#8a8a8a", grey: "#8a8a8a",
    pink: "#c87892", purple: "#5a2e7a", orange: "#c8601a", brown: "#6b3f1f",
    navy: "#1a2744", beige: "#d4b896", teal: "#1a7a7a", gold: "#c8a020",
  };
  const key = name.trim();
  return map[key] ?? map[key.toLowerCase()] ?? "#6b6b6b";
};

// تعيد الـ hex color للـ variant — تستخدم colorHex لو موجود، وإلا تحول اسم اللون
const getVariantColorHex = (v: { colorHex?: string | null; color: string }): string => {
  if (v.colorHex && /^#[0-9a-fA-F]{3,8}$/.test(v.colorHex.trim())) return v.colorHex.trim();
  return getColorHex(v.color);
};

const calcMargin = (unitPrice: number, costPrice: number | null) => {
  if (!costPrice || costPrice === 0 || unitPrice === 0) return null;
  return Math.round(((unitPrice - costPrice) / unitPrice) * 100);
};

// ─── Constants ────────────────────────────────────────────────────────────────
const COMMON_COLORS = ["أسود", "أبيض", "بيج", "رمادي", "كحلي", "بني", "زيتي", "بردقاني", "أزرق", "أحمر", "وردي", "بنفسجي"];
const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "28", "30", "32", "34", "36", "38", "40"];

const emptyProductForm = { name: "", sku: "", lowStockThreshold: 5, unitPrice: 0, costPrice: null as number | null, image: null as string | null };
const emptyVariantForm = { color: "", size: "", sku: "", totalQuantity: 0, lowStockThreshold: 5, unitPrice: 0, costPrice: null as number | null };

// Warehouse distribution entry
type WarehouseDistEntry = { warehouseId: number; quantity: number };

// ─── Warehouse Breakdown per SKU ──────────────────────────────────────────────
function VariantWarehouseBreakdown({ variantId }: { variantId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["variant-wh-stock", variantId],
    queryFn: () => warehousesApi.stockByVariant(variantId),
    staleTime: 30000,
  });

  if (isLoading) return <span className="text-[10px] text-muted-foreground">...</span>;
  if (!data || data.length === 0) return null;

  const active = data.filter(d => d.quantity > 0);
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
      {active.map(d => (
        <span
          key={d.warehouseId}
          className="inline-flex items-center gap-1 text-[9px] font-semibold bg-primary/8 border border-primary/20 text-primary/80 px-1.5 py-0.5 rounded-full"
          title={d.warehouseName}
        >
          <WarehouseIcon className="w-2.5 h-2.5" />
          {d.warehouseName.length > 8 ? d.warehouseName.slice(0, 8) + "…" : d.warehouseName}
          <span className="font-black">{d.quantity}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Margin Badge ─────────────────────────────────────────────────────────────
function MarginBadge({ margin }: { margin: number | null }) {
  if (margin === null) return <span className="text-muted-foreground">—</span>;
  const cls = margin >= 40 ? "border-emerald-400 text-emerald-700 bg-emerald-100 dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-900/20"
    : margin >= 20 ? "border-amber-400 text-amber-700 bg-amber-100 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-900/20"
    : "border-red-400 text-red-700 bg-red-100 dark:border-red-800 dark:text-red-400 dark:bg-red-900/20";
  return <Badge variant="outline" className={`text-[9px] font-bold border ${cls}`}>{margin}%</Badge>;
}

// ─── Print Inventory for a single product ─────────────────────────────────────
function printProductInventory(product: Product, variants: ProductVariant[], warehouses: Warehouse[] | undefined, canSeeCost: boolean) {
  const fc = (n: number) =>
    new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

  const totalStock = variants.reduce((s, v) => s + v.totalQuantity, 0);
  const now = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

  const rows = variants.map(v => {
    const isOut = v.totalQuantity === 0;
    const isLow = v.totalQuantity > 0 && v.totalQuantity <= v.lowStockThreshold;
    const status = isOut ? "نفد" : isLow ? "منخفض" : "متاح";
    const statusColor = isOut ? "#dc2626" : isLow ? "#d97706" : "#16a34a";
    const margin = canSeeCost && v.costPrice ? Math.round(((v.unitPrice - v.costPrice) / v.unitPrice) * 100) : null;
    return `
      <tr>
        <td>${v.color}</td>
        <td>${v.size}</td>
        <td>${v.sku ?? "—"}</td>
        <td style="text-align:center;font-weight:bold;color:${statusColor}">${v.totalQuantity}</td>
        <td style="text-align:center;color:${statusColor};font-weight:bold">${status}</td>
        ${canSeeCost ? `<td style="text-align:center">${fc(v.unitPrice)}</td>` : ""}
        ${canSeeCost ? `<td style="text-align:center">${margin !== null ? margin + "%" : "—"}</td>` : ""}
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>جرد مخزون - ${product.name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; padding: 24px; color: #111; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #111; padding-bottom: 12px; }
    .brand { font-size: 22px; font-weight: 900; }
    .meta { text-align: left; font-size: 11px; color: #555; }
    .product-title { font-size: 18px; font-weight: 900; margin-bottom: 4px; }
    .product-sub { font-size: 11px; color: #666; margin-bottom: 16px; }
    .kpi { display: flex; gap: 20px; margin-bottom: 20px; }
    .kpi-box { border: 1px solid #ddd; border-radius: 8px; padding: 10px 16px; text-align: center; }
    .kpi-box .val { font-size: 20px; font-weight: 900; }
    .kpi-box .lbl { font-size: 10px; color: #777; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #111; color: #fff; padding: 8px 10px; font-size: 11px; font-weight: 700; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .footer { margin-top: 24px; font-size: 10px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">🧺 كابرينا</div>
    <div class="meta"><div>تقرير جرد المخزون</div><div>${now}</div></div>
  </div>
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
    ${product.image ? `<img src="${product.image}" style="width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid #ddd;" />` : ""}
    <div>
      <div class="product-title">${product.name}${product.sku ? ` <span style="font-size:12px;color:#999;font-weight:400">(${product.sku})</span>` : ""}</div>
      <div class="product-sub">إدارة المنتجات • الألوان • المقاسات • التكاليف</div>
    </div>
  </div>
  <div class="kpi">
    <div class="kpi-box"><div class="val">${variants.length}</div><div class="lbl">إجمالي SKU</div></div>
    <div class="kpi-box"><div class="val" style="color:#16a34a">${totalStock}</div><div class="lbl">وحدة متاحة</div></div>
    <div class="kpi-box"><div class="val" style="color:#dc2626">${variants.filter(v => v.totalQuantity === 0).length}</div><div class="lbl">نفد مخزونه</div></div>
    <div class="kpi-box"><div class="val" style="color:#d97706">${variants.filter(v => v.totalQuantity > 0 && v.totalQuantity <= v.lowStockThreshold).length}</div><div class="lbl">مخزون منخفض</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>اللون</th><th>المقاس</th><th>SKU</th>
        <th style="text-align:center">الكمية</th>
        <th style="text-align:center">الحالة</th>
        ${canSeeCost ? "<th style='text-align:center'>سعر البيع</th>" : ""}
        ${canSeeCost ? "<th style='text-align:center'>هامش الربح</th>" : ""}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">تم إنشاء هذا التقرير بواسطة نظام كابرينا • ${now}</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.print(); };
}

// ─── Shipment Insights Tab (مستنبط من شحنات Stark) ──────────────────────────
function ShipmentInsightsTab() {
  const fc3 = (n: number | string) =>
    new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);
  const pct = (a: number, b: number) => b === 0 ? 0 : Math.round((a / b) * 100);

  // ── جلب stats الكلية ──────────────────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["shipments-stats-insights"],
    queryFn: () => shipmentsApi.stats(),
    staleTime: 2 * 60_000,
  });

  // ── جلب آخر 200 شحنة لحساب التحليلات ─────────────────────────────────────
  const { data: shipmentsRes, isLoading: listLoading } = useQuery({
    queryKey: ["shipments-insights-list"],
    queryFn: () => shipmentsApi.list({ limit: 200, offset: 0 }),
    staleTime: 2 * 60_000,
  });

  const isLoading = statsLoading || listLoading;
  const shipments = shipmentsRes?.data ?? [];

  // ── KPIs من stats ─────────────────────────────────────────────────────────
  const statusMap = useMemo(() => {
    const m: Record<string, number> = {};
    if (stats?.statuses) {
      for (const row of stats.statuses) m[row.status] = Number(row.count) || 0;
    }
    return m;
  }, [stats]);

  const delivered  = statusMap["delivered"] ?? 0;
  const returned   = statusMap["returned"]  ?? 0;
  const inTransit  = (statusMap["in_transit"] ?? 0) + (statusMap["out_for_delivery"] ?? 0);
  const waiting    = (statusMap["waiting"] ?? 0) + (statusMap["confirmed"] ?? 0);
  const totalAll   = Object.values(statusMap).reduce((s, v) => s + v, 0);
  const closedAll  = delivered + returned;

  const deliveryRate   = pct(delivered, closedAll);
  const returnRate     = pct(returned,  closedAll);

  const totalCod       = Number(stats?.totalCod)         || 0;
  const totalCollected = Number(stats?.totalCollected)    || 0;
  const totalFee       = Number(stats?.totalShippingFee)  || 0;
  const netProfit      = totalCollected - totalFee;
  const pendingCOD     = shipments
    .filter(s => (s.status === "in_transit" || s.status === "out_for_delivery") && s.paymentMethod === "cod")
    .reduce((sum, s) => sum + (Number(s.codAmount) || 0), 0);

  // ── أكثر مناطق الإرجاع ────────────────────────────────────────────────────
  const returnsByZone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of shipments) {
      if (s.status !== "returned") continue;
      const zone = s.zoneLabel || s.receiverCity || "غير محدد";
      m[zone] = (m[zone] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [shipments]);

  // ── أداء شركات الشحن ─────────────────────────────────────────────────────
  const companyPerf = useMemo(() => {
    const m: Record<string, { total: number; delivered: number; returned: number; name: string }> = {};
    for (const s of shipments) {
      const key  = String(s.shippingCompanyId ?? "بدون شركة");
      const name = s.shippingCompanyName || "بدون شركة";
      if (!m[key]) m[key] = { total: 0, delivered: 0, returned: 0, name };
      m[key].total++;
      if (s.status === "delivered") m[key].delivered++;
      if (s.status === "returned")  m[key].returned++;
    }
    return Object.values(m)
      .filter(c => c.total >= 2)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
  }, [shipments]);

  // ── شحنات تحتاج action ────────────────────────────────────────────────────
  const noCompany = shipments.filter(s =>
    !s.shippingCompanyId && (s.status === "waiting" || s.status === "confirmed")
  ).length;

  const longPending = useMemo(() => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    return shipments.filter(s =>
      (s.status === "waiting" || s.status === "confirmed") &&
      new Date(s.createdAt).getTime() < threeDaysAgo
    ).length;
  }, [shipments]);

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3,4].map(i => (
        <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── KPI Row 1: المالي ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">

        {/* صافي المحصّل */}
        <Card className={`p-3 sm:p-4 border ${netProfit >= 0 ? "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10" : "border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${netProfit >= 0 ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
              <CircleDollarSign className={`w-4 h-4 ${netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} />
            </div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${netProfit >= 0 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600/70 dark:text-emerald-400/70" : "bg-red-100 dark:bg-red-900/30 text-red-600/70 dark:text-red-400/70"}`}>صافي</span>
          </div>
          <p className={`text-xl sm:text-2xl font-black ${netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{fc3(netProfit)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">محصّل – رسوم الشحن</p>
          <p className="text-[9px] text-muted-foreground/60 mt-1">رسوم: {fc3(totalFee)}</p>
        </Card>

        {/* COD المعلق في الطريق */}
        <Card className="p-3 sm:p-4 border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Clock3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600/70 dark:text-amber-400/70">معلق</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">{fc3(pendingCOD)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">COD في الطريق</p>
          <p className="text-[9px] text-muted-foreground/60 mt-1">{inTransit} شحنة</p>
        </Card>

        {/* معدل التسليم */}
        <Card className={`p-3 sm:p-4 border ${deliveryRate >= 70 ? "border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/10" : "border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/10"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${deliveryRate >= 70 ? "bg-blue-500/15" : "bg-orange-500/15"}`}>
              <Target className={`w-4 h-4 ${deliveryRate >= 70 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`} />
            </div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${deliveryRate >= 70 ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600/70" : "bg-orange-100 dark:bg-orange-900/30 text-orange-600/70"}`}>
              {deliveryRate >= 70 ? "جيد" : "يحتاج تحسين"}
            </span>
          </div>
          <p className={`text-xl sm:text-2xl font-black ${deliveryRate >= 70 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}>{deliveryRate}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">معدل التسليم</p>
          {/* progress bar */}
          <div className="mt-1.5 h-1 rounded-full bg-muted/50 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${deliveryRate >= 70 ? "bg-blue-500" : "bg-orange-500"}`} style={{ width: `${deliveryRate}%` }} />
          </div>
        </Card>

        {/* معدل الإرجاع */}
        <Card className={`p-3 sm:p-4 border ${returnRate <= 15 ? "border-border bg-card" : "border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${returnRate <= 15 ? "bg-muted/30" : "bg-red-500/15"}`}>
              <RotateCcw className={`w-4 h-4 ${returnRate <= 15 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`} />
            </div>
            {returnRate > 15 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600/70 animate-pulse">تحذير</span>}
          </div>
          <p className={`text-xl sm:text-2xl font-black ${returnRate > 15 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{returnRate}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">معدل الإرجاع</p>
          <p className="text-[9px] text-muted-foreground/60 mt-1">{returned} من {closedAll} شحنة</p>
        </Card>
      </div>

      {/* ── Action Alerts ────────────────────────────────────────────────── */}
      {(noCompany > 0 || longPending > 0) && (
        <div className="space-y-2">
          {noCompany > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/15 px-4 py-3">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-amber-700 dark:text-amber-300">{noCompany} شحنة بدون شركة شحن</p>
                <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70">شحنات مؤكدة لم تُسند لشركة شحن بعد</p>
              </div>
              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            </div>
          )}
          {longPending > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-red-300 dark:border-red-700/50 bg-red-50 dark:bg-red-900/15 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-red-700 dark:text-red-300">{longPending} شحنة معلقة أكثر من 3 أيام</p>
                <p className="text-[10px] text-red-600/70 dark:text-red-400/70">تحتاج مراجعة فورية أو إلغاء</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Row 2: المناطق الأكثر إرجاعاً + أداء الشركات ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* أكثر مناطق الإرجاع */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-red-50/50 dark:bg-red-900/5">
            <MapPin className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-sm font-bold text-red-600 dark:text-red-400">مناطق الإرجاع الأعلى</span>
            <span className="text-[10px] text-muted-foreground mr-auto">من آخر 200 شحنة</span>
          </div>
          {returnsByZone.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <PackageCheck className="w-8 h-8 text-emerald-400/50" />
              <p className="text-xs text-muted-foreground">لا مرتجعات 🎉</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {returnsByZone.map(([zone, count], i) => {
                const maxCount = returnsByZone[0][1];
                const barW = pct(count, maxCount);
                return (
                  <div key={zone} className="flex items-center gap-3">
                    <span className={`text-[10px] font-black w-4 text-center shrink-0 ${i === 0 ? "text-red-500" : "text-muted-foreground"}`}>{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold truncate">{zone}</span>
                        <span className={`text-[11px] font-black shrink-0 ml-2 ${i === 0 ? "text-red-500" : "text-muted-foreground"}`}>{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${i === 0 ? "bg-red-500" : i === 1 ? "bg-orange-400" : "bg-muted-foreground/40"}`}
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* أداء شركات الشحن */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-violet-50/50 dark:bg-violet-900/5">
            <Activity className="w-4 h-4 text-violet-500 shrink-0" />
            <span className="text-sm font-bold text-violet-600 dark:text-violet-400">أداء شركات الشحن</span>
          </div>
          {companyPerf.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Truck className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">لا توجد بيانات كافية</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {companyPerf.map(c => {
                const rate = pct(c.delivered, c.total);
                return (
                  <div key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <Truck className="w-3.5 h-3.5 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold truncate">{c.name}</span>
                        <span className={`text-[11px] font-black shrink-0 ml-2 ${rate >= 70 ? "text-emerald-500" : rate >= 50 ? "text-amber-500" : "text-red-500"}`}>{rate}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${rate >= 70 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-400" : "bg-red-500"}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] text-muted-foreground">{c.total} شحنة</span>
                        <span className="text-[9px] text-emerald-500">{c.delivered} تسليم</span>
                        {c.returned > 0 && <span className="text-[9px] text-red-400">{c.returned} مرتجع</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 3: توزيع الحالات + ملخص مالي ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* توزيع الحالات */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-bold">توزيع حالات الشحنات</span>
            <span className="text-[10px] text-muted-foreground mr-auto">{totalAll} إجمالي</span>
          </div>
          <div className="p-3 space-y-2">
            {[
              { label: "تم التسليم",     count: delivered,  color: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-400" },
              { label: "في الطريق",      count: inTransit,  color: "bg-violet-500",  textColor: "text-violet-600 dark:text-violet-400"   },
              { label: "مرتجع",          count: returned,   color: "bg-red-500",     textColor: "text-red-600 dark:text-red-400"         },
              { label: "انتظار/مؤكد",    count: waiting,    color: "bg-amber-400",   textColor: "text-amber-600 dark:text-amber-400"     },
            ].filter(r => r.count > 0).map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${row.color}`} />
                <span className="text-[11px] text-muted-foreground flex-1">{row.label}</span>
                <span className={`text-[11px] font-black ${row.textColor}`}>{row.count}</span>
                <div className="w-16 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct(row.count, totalAll)}%` }} />
                </div>
                <span className="text-[9px] text-muted-foreground w-6 text-left">{pct(row.count, totalAll)}%</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ملخص مالي */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-sm font-bold">الملخص المالي للشحنات</span>
          </div>
          <div className="divide-y divide-border/40">
            {[
              { label: "إجمالي COD المتوقع",  value: totalCod,       color: "text-foreground",                       icon: CircleDollarSign },
              { label: "إجمالي المحصّل",       value: totalCollected, color: "text-emerald-600 dark:text-emerald-400", icon: PackageCheck     },
              { label: "إجمالي رسوم الشحن",   value: totalFee,       color: "text-amber-600 dark:text-amber-400",    icon: Truck            },
              { label: "COD معلق في الطريق",  value: pendingCOD,     color: "text-violet-600 dark:text-violet-400",   icon: Clock3           },
              { label: "صافي (محصّل - رسوم)", value: netProfit,      color: netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400", icon: TrendingUp },
            ].map(row => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${row.color}`} />
                  <span className="text-[11px] text-muted-foreground flex-1">{row.label}</span>
                  <span className={`text-[12px] font-black ${row.color}`}>{fc3(row.value)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

    </div>
  );
}

// ─── Shipment Warehouse Tab ───────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string; icon: any }> = {
  pending:          { label: "معلق",           color: "text-amber-600 dark:text-amber-400",    bg: "bg-amber-50 dark:bg-amber-900/10",    border: "border-amber-200 dark:border-amber-800/40",    dot: "bg-amber-500",    icon: Clock3 },
  warehouse_ready:  { label: "جاهز للشحن",     color: "text-blue-600 dark:text-blue-400",      bg: "bg-blue-50 dark:bg-blue-900/10",      border: "border-blue-200 dark:border-blue-800/40",      dot: "bg-blue-500",     icon: Package },
  in_shipping:      { label: "مع شركة الشحن",  color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-50 dark:bg-violet-900/10",  border: "border-violet-200 dark:border-violet-800/40",  dot: "bg-violet-500",   icon: Truck },
  returned:         { label: "مرتجع كامل",      color: "text-red-600 dark:text-red-400",        bg: "bg-red-50 dark:bg-red-900/10",        border: "border-red-200 dark:border-red-800/40",        dot: "bg-red-500",      icon: RotateCcw },
  partial_received: { label: "مرتجع جزئي",     color: "text-orange-600 dark:text-orange-400",  bg: "bg-orange-50 dark:bg-orange-900/10",  border: "border-orange-200 dark:border-orange-800/40",  dot: "bg-orange-500",   icon: PackageX },
};

const fc2 = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

const ALL_STATUSES = ["pending", "warehouse_ready", "in_shipping", "returned", "partial_received"] as const;

function ShipmentWarehouseTab() {
  // ── Filters state ──────────────────────────────────────────────────────────
  const [activeStatus, setActiveStatus] = useState<string>("warehouse_ready");
  const [search,           setSearch]           = useState("");
  const [dateFrom,         setDateFrom]         = useState("");
  const [dateTo,           setDateTo]           = useState("");
  const [shippingCompany,  setShippingCompany]  = useState("all");
  const [showFilters,      setShowFilters]      = useState(false);

  // ── جلب شركات الشحن للفلتر ────────────────────────────────────────────────
  const { data: companies = [] } = useQuery({
    queryKey: ["shipping-companies"],
    queryFn: () => import("@/lib/api").then(m => m.shippingApi.list()),
    staleTime: 5 * 60_000,
  });

  // ── query params مشتركة بدون status ───────────────────────────────────────
  const baseFilters = useMemo(() => ({
    ...(dateFrom         ? { dateFrom }         : {}),
    ...(dateTo           ? { dateTo }           : {}),
    ...(shippingCompany !== "all" ? { shippingCompanyId: shippingCompany } : {}),
  }), [dateFrom, dateTo, shippingCompany]);

  // ── query واحدة لكل status (5 queries بالتوازي) ───────────────────────────
  const queries = ALL_STATUSES.map(status =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ["orders-wh", status, baseFilters],
      queryFn:  () => ordersApi.list({ status, ...baseFilters } as any),
      staleTime: 60_000,
    })
  );

  const isLoading = queries.some(q => q.isLoading);
  const ordersMap = Object.fromEntries(
    ALL_STATUSES.map((s, i) => [s, queries[i].data ?? []])
  ) as Record<string, any[]>;

  // ── KPI aggregations ───────────────────────────────────────────────────────
  const inWarehouse  = (ordersMap.pending?.length ?? 0) + (ordersMap.warehouse_ready?.length ?? 0);
  const inTransit    = ordersMap.in_shipping?.length ?? 0;
  const returns      = (ordersMap.returned?.length ?? 0) + (ordersMap.partial_received?.length ?? 0);
  const totalAll     = inWarehouse + inTransit + returns;
  const warehouseCOD = [...(ordersMap.pending ?? []), ...(ordersMap.warehouse_ready ?? [])]
    .reduce((s: number, o: any) => s + (Number(o.totalPrice) || 0), 0);
  const transitCOD   = (ordersMap.in_shipping ?? [])
    .reduce((s: number, o: any) => s + (Number(o.totalPrice) || 0), 0);
  const returnsCOD   = [...(ordersMap.returned ?? []), ...(ordersMap.partial_received ?? [])]
    .reduce((s: number, o: any) => s + (Number(o.totalPrice) || 0), 0);

  // ── فلترة بحث (client-side فوق الـ server results) ────────────────────────
  const activeOrders = useMemo(() => {
    const base = ordersMap[activeStatus] ?? [];
    if (!search.trim()) return base;
    const s = search.trim().toLowerCase();
    return base.filter((o: any) =>
      (o.customerName ?? "").toLowerCase().includes(s) ||
      (o.city ?? "").toLowerCase().includes(s) ||
      (o.product ?? "").toLowerCase().includes(s) ||
      (o.phone ?? "").includes(s) ||
      (o.invoiceNumber ?? "").toLowerCase().includes(s)
    );
  }, [ordersMap, activeStatus, search]);

  const activeTotalCOD = activeOrders.reduce((s: number, o: any) => s + (Number(o.totalPrice) || 0), 0);
  const activeFiltersCount = [dateFrom, dateTo, shippingCompany !== "all"].filter(Boolean).length;

  const clearFilters = () => { setDateFrom(""); setDateTo(""); setShippingCompany("all"); };

  return (
    <div className="space-y-3 sm:space-y-4">

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">

        {/* في المستودع */}
        <Card
          onClick={() => setActiveStatus("warehouse_ready")}
          className="border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/10 p-3 sm:p-4 cursor-pointer transition-all hover:shadow-md hover:scale-[1.01] active:scale-100"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-blue-600/70 dark:text-blue-400/70 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">مستودع</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">{isLoading ? "—" : inWarehouse}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">طلب في المستودع</p>
          <p className="text-[10px] font-bold text-blue-600/70 dark:text-blue-400/70 mt-1 truncate">{isLoading ? "" : fc2(warehouseCOD)}</p>
        </Card>

        {/* عند شركة الشحن */}
        <Card
          onClick={() => setActiveStatus("in_shipping")}
          className="border-violet-200 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-900/10 p-3 sm:p-4 cursor-pointer transition-all hover:shadow-md hover:scale-[1.01] active:scale-100"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-violet-600/70 dark:text-violet-400/70 bg-violet-100 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full">تسليم</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-violet-600 dark:text-violet-400">{isLoading ? "—" : inTransit}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">طلب في الطريق</p>
          <p className="text-[10px] font-bold text-violet-600/70 dark:text-violet-400/70 mt-1 truncate">{isLoading ? "" : fc2(transitCOD)}</p>
        </Card>

        {/* المرتجعات */}
        <Card
          onClick={() => setActiveStatus("returned")}
          className={`border p-3 sm:p-4 cursor-pointer transition-all hover:shadow-md hover:scale-[1.01] active:scale-100 ${
            returns > 0 ? "border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10" : "border-border bg-card"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${returns > 0 ? "bg-red-500/15" : "bg-muted/30"}`}>
              <RotateCcw className={`w-4 h-4 ${returns > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
            </div>
            {returns > 0 && (
              <span className="text-[9px] sm:text-[10px] font-bold text-red-600/70 dark:text-red-400/70 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full animate-pulse">تنبيه</span>
            )}
          </div>
          <p className={`text-2xl sm:text-3xl font-black ${returns > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{isLoading ? "—" : returns}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">طلب مرتجع</p>
          <p className={`text-[10px] font-bold mt-1 truncate ${returns > 0 ? "text-red-600/70 dark:text-red-400/70" : "text-muted-foreground"}`}>
            {isLoading ? "" : fc2(returnsCOD)}
          </p>
        </Card>

        {/* نسبة التوزيع */}
        <Card className="border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-emerald-600/70 dark:text-emerald-400/70 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">توزيع</span>
          </div>
          {isLoading ? (
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">—</p>
          ) : (
            <>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">{totalAll}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">إجمالي نشط</p>
              {/* mini stacked bar */}
              <div className="flex w-full h-1.5 rounded-full overflow-hidden mt-2 gap-px">
                {totalAll > 0 && <>
                  <div className="bg-blue-500   transition-all" style={{ width: `${(inWarehouse/totalAll)*100}%` }} title={`مستودع ${inWarehouse}`} />
                  <div className="bg-violet-500 transition-all" style={{ width: `${(inTransit/totalAll)*100}%`  }} title={`طريق ${inTransit}`} />
                  <div className="bg-red-500    transition-all" style={{ width: `${(returns/totalAll)*100}%`    }} title={`مرتجع ${returns}`} />
                </>}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1 text-[9px] text-blue-600 dark:text-blue-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />{inWarehouse}</span>
                <span className="flex items-center gap-1 text-[9px] text-violet-600 dark:text-violet-400"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />{inTransit}</span>
                <span className="flex items-center gap-1 text-[9px] text-red-600 dark:text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />{returns}</span>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="اسم العميل · المدينة · الهاتف · رقم الفاتورة..."
            className="pr-9 h-9 text-[12px] bg-card border-border w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters toggle */}
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[12px] font-bold transition-all shrink-0 ${
            showFilters || activeFiltersCount > 0
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">فلتر</span>
          {activeFiltersCount > 0 && (
            <span className="bg-white/20 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{activeFiltersCount}</span>
          )}
        </button>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            {/* شركة الشحن */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Truck className="w-3 h-3" /> شركة الشحن
              </label>
              <select
                value={shippingCompany}
                onChange={e => setShippingCompany(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">الكل</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* من تاريخ */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Clock3 className="w-3 h-3" /> من تاريخ
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* إلى تاريخ */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Clock3 className="w-3 h-3" /> إلى تاريخ
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-[11px] font-bold text-destructive hover:underline"
            >
              <X className="w-3 h-3" /> مسح الفلاتر
            </button>
          )}
        </div>
      )}

      {/* ── Status Tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {ALL_STATUSES.map(status => {
          const meta  = STATUS_META[status];
          const Icon  = meta.icon;
          const count = ordersMap[status]?.length ?? 0;
          const isAct = activeStatus === status;
          return (
            <button
              key={status}
              onClick={() => setActiveStatus(status)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                isAct
                  ? `${meta.bg} ${meta.border} ${meta.color} shadow-sm`
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span className="hidden xs:inline sm:inline">{meta.label}</span>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${isAct ? "bg-white/30 dark:bg-black/20" : "bg-muted"}`}>
                {isLoading ? "…" : count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Table Card ──────────────────────────────────────────────────── */}
      <Card className="border-border bg-card overflow-hidden">
        {/* Table header bar */}
        <div className={`px-3 sm:px-4 py-2.5 border-b flex items-center gap-2 ${STATUS_META[activeStatus]?.bg} ${STATUS_META[activeStatus]?.border}`}>
          {(() => { const Icon = STATUS_META[activeStatus]?.icon; return <Icon className={`w-4 h-4 shrink-0 ${STATUS_META[activeStatus]?.color}`} />; })()}
          <span className={`text-sm font-bold ${STATUS_META[activeStatus]?.color}`}>{STATUS_META[activeStatus]?.label}</span>
          <span className="text-xs text-muted-foreground mr-auto">{activeOrders.length} طلب</span>
          {isLoading && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
        </div>

        {/* Loading skeleton */}
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
              <Package className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-bold text-muted-foreground">لا توجد شحنات</p>
            <p className="text-xs text-muted-foreground/60">
              {search ? `لا نتائج للبحث "${search}"` : `لا توجد شحنات بحالة "${STATUS_META[activeStatus]?.label}"`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right px-3 sm:px-4 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap">العميل</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap hidden sm:table-cell">المنتج</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap">المدينة</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap">الإجمالي</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap hidden md:table-cell">شركة الشحن</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap hidden lg:table-cell">التاريخ</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {activeOrders.map((order: any, idx: number) => {
                  const meta = STATUS_META[order.status] ?? STATUS_META["pending"];
                  return (
                    <tr
                      key={order.id}
                      className={`border-b border-border/40 transition-colors hover:bg-muted/20 ${idx % 2 !== 0 ? "bg-muted/5" : ""}`}
                    >
                      {/* العميل */}
                      <td className="px-3 sm:px-4 py-2.5">
                        <p className="font-bold text-[12px] leading-tight line-clamp-1">{order.customerName ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{order.phone ?? ""}</p>
                      </td>

                      {/* المنتج */}
                      <td className="px-3 py-2.5 hidden sm:table-cell max-w-[130px]">
                        <p className="text-[11px] truncate text-foreground/80" title={order.product}>{order.product ?? "—"}</p>
                        {order.invoiceNumber && (
                          <p className="text-[9px] text-muted-foreground">{order.invoiceNumber}</p>
                        )}
                      </td>

                      {/* المدينة */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-[11px] font-semibold">{order.city ?? "—"}</span>
                      </td>

                      {/* COD */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-[12px] font-black text-emerald-600 dark:text-emerald-400">
                          {fc2(Number(order.totalPrice) || 0)}
                        </span>
                      </td>

                      {/* شركة الشحن */}
                      <td className="px-3 py-2.5 hidden md:table-cell whitespace-nowrap">
                        <span className="text-[11px] text-muted-foreground">{order.shippingCompanyName ?? "—"}</span>
                      </td>

                      {/* التاريخ */}
                      <td className="px-3 py-2.5 hidden lg:table-cell whitespace-nowrap">
                        <span className="text-[10px] text-muted-foreground">
                          {order.createdAt
                            ? new Date(order.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "2-digit" })
                            : "—"}
                        </span>
                      </td>

                      {/* الحالة badge */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${meta.bg} ${meta.border} ${meta.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                          <span className="hidden sm:inline">{meta.label}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Summary Footer ───────────────────────────────────────────────── */}
      {!isLoading && activeOrders.length > 0 && (
        <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-4 py-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-muted-foreground">{activeOrders.length} طلب</span>
            {activeFiltersCount > 0 && (
              <span className="text-muted-foreground/60">· بعد الفلتر</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">إجمالي الطلبات:</span>
            <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">{fc2(activeTotalCOD)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Inventory() {
  const { can, isAdmin } = useAuth();
  // ── Inventory permission shortcuts ────────────────────────────────────────
  const canEdit        = isAdmin || can("inventory.edit");
  const canDelete      = isAdmin || can("inventory.delete");
  const canSeeCost     = isAdmin || can("inventory.cost");
  const canMovements   = isAdmin || can("inventory.movements");
  const canWarehouses  = isAdmin || can("inventory.warehouses");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"shipments" | "insights" | "products">("shipments");
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  // Filter & Sort — فلتر الموديل بدل الحالة
  const [filterModel, setFilterModel] = useState<string>("all");
  const [filterColor, setFilterColor] = useState<string>("all");
  const [filterSize, setFilterSize] = useState<string>("all");
  const [filterStockStatus, setFilterStockStatus] = useState<string>("all"); // all / out / low / ok
  const [filterWarehouse, setFilterWarehouse] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [showFilters, setShowFilters] = useState(false);

  // Product dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);

  // Variant dialog
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [activeProductId, setActiveProductId] = useState<number | null>(null);
  const [variantForm, setVariantForm] = useState(emptyVariantForm);
  const [pickedColorHex, setPickedColorHex] = useState("#6b6b6b");

  // Add Stock dialog
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [addStockVariant, setAddStockVariant] = useState<ProductVariant | null>(null);
  const [addStockQty, setAddStockQty] = useState("");
  const [addStockNotes, setAddStockNotes] = useState("");

  // Warehouse distribution for new SKU
  const [warehouseDist, setWarehouseDist] = useState<WarehouseDistEntry[]>([]);
  const [useWarehouseDist, setUseWarehouseDist] = useState(false);
  const [isVariantSubmitting, setIsVariantSubmitting] = useState(false);
  const [editWarehouseDist, setEditWarehouseDist] = useState<WarehouseDistEntry[]>([]);

  const { data: products, isLoading } = useQuery({ queryKey: ["products"], queryFn: productsApi.list, staleTime: 2 * 60_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false, refetchOnMount: false, placeholderData: (prev) => prev });
  const { data: allVariants } = useQuery({ queryKey: ["variants"], queryFn: variantsApi.listAll, staleTime: 2 * 60_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false, refetchOnMount: false, placeholderData: (prev) => prev });
  const { data: stockIntel } = useQuery({ queryKey: ["stock-intelligence"], queryFn: analyticsApi.stockIntelligence, staleTime: 30000 });
  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: warehousesApi.list, staleTime: 10 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false, refetchOnMount: false });

  const stockMap = new Map<string, StockIntelligenceItem>(
    stockIntel?.items.map(i => [i.name.trim().toLowerCase(), i]) ?? []
  );
  const invalidateDashboardFinancials = () => {
    queryClient.invalidateQueries({ queryKey: ["analytics-financial"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-profit"] });
  };

  const createProductMutation = useMutation({
    mutationFn: (data: typeof emptyProductForm) => productsApi.create({ ...data, totalQuantity: 0 }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); queryClient.invalidateQueries({ queryKey: ["smart-insights"] }); queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] }); invalidateDashboardFinancials(); setProductDialogOpen(false); setProductForm(emptyProductForm); toast({ title: "تمت إضافة المنتج" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });
  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof emptyProductForm> }) => productsApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); queryClient.invalidateQueries({ queryKey: ["smart-insights"] }); queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] }); invalidateDashboardFinancials(); setProductDialogOpen(false); setEditingProduct(null); setProductForm(emptyProductForm); toast({ title: "تم التحديث" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });
  const deleteProductMutation = useMutation({
    mutationFn: (id: number) => productsApi.update(id, { isArchived: true } as any),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); queryClient.invalidateQueries({ queryKey: ["variants"] }); queryClient.invalidateQueries({ queryKey: ["smart-insights"] }); queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] }); invalidateDashboardFinancials(); toast({ title: "تم أرشفة المنتج" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });
  const updateVariantMutation = useMutation({
    mutationFn: ({ productId, id, data }: { productId: number; id: number; data: Partial<typeof emptyVariantForm> }) => variantsApi.update(productId, id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["variants"] }); queryClient.invalidateQueries({ queryKey: ["smart-insights"] }); queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] }); invalidateDashboardFinancials(); setVariantDialogOpen(false); setEditingVariant(null); setVariantForm(emptyVariantForm); toast({ title: "تم التحديث" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });
  const deleteVariantMutation = useMutation({
    mutationFn: ({ productId, id }: { productId: number; id: number }) => variantsApi.delete(productId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["stock-intelligence"] });
      queryClient.invalidateQueries({ queryKey: ["smart-insights"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] });
      invalidateDashboardFinancials();
      toast({ title: "تم الحذف" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });
  const addStockMutation = useMutation({
    mutationFn: ({ productId, variantId, qty, notes }: { productId: number; variantId: number; qty: number; notes: string }) =>
      variantsApi.addStock(productId, variantId, qty, notes || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants"] });
      queryClient.invalidateQueries({ queryKey: ["variants-all"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["stock-intelligence"] });
      queryClient.invalidateQueries({ queryKey: ["smart-insights"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] });
      if (addStockVariant) {
        queryClient.invalidateQueries({ queryKey: ["variant-wh-stock", addStockVariant.id] });
      }
      setAddStockOpen(false); setAddStockVariant(null); setAddStockQty(""); setAddStockNotes("");
      toast({ title: "✅ تمت إضافة المخزون", description: "تم تزامن الكميات مع قسم المخازن" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const openAddProduct = () => { setEditingProduct(null); setProductForm(emptyProductForm); setProductDialogOpen(true); };
  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProductForm({ name: p.name, sku: p.sku ?? "", lowStockThreshold: p.lowStockThreshold, unitPrice: p.unitPrice, costPrice: p.costPrice, image: p.image ?? null });
    setProductDialogOpen(true);
  };
  const openAddVariant = (productId: number) => {
    setActiveProductId(productId);
    setEditingVariant(null);
    setPickedColorHex("#6b6b6b");
    const p = products?.find(p => p.id === productId);
    setVariantForm({ ...emptyVariantForm, unitPrice: p?.unitPrice ?? 0, costPrice: p?.costPrice ?? null });
    if (warehouses && warehouses.length > 0) {
      setUseWarehouseDist(true);
      setWarehouseDist(warehouses.map(w => ({ warehouseId: w.id, quantity: 0 })));
    } else {
      setWarehouseDist([]);
      setUseWarehouseDist(false);
    }
    setVariantDialogOpen(true);
  };
  const openEditVariant = async (v: ProductVariant) => {
    setActiveProductId(v.productId);
    setEditingVariant(v);
    // إذا كان اللون hex نضعه في الـ picker
    setPickedColorHex(v.colorHex?.trim() || getColorHex(v.color));
    setVariantForm({ color: v.color, size: v.size, sku: v.sku ?? "", totalQuantity: 0, lowStockThreshold: v.lowStockThreshold, unitPrice: v.unitPrice, costPrice: v.costPrice });
    try {
      const whStock = await warehousesApi.stockByVariant(v.id);
      const dist: WarehouseDistEntry[] = (warehouses ?? []).map(wh => {
        const found = whStock.find(s => s.warehouseId === wh.id);
        return { warehouseId: wh.id, quantity: found?.quantity ?? 0 };
      });
      setEditWarehouseDist(dist);
    } catch {
      setEditWarehouseDist((warehouses ?? []).map(wh => ({ warehouseId: wh.id, quantity: 0 })));
    }
    setVariantDialogOpen(true);
  };
  const openAddVariantStock = (v: ProductVariant) => {
    setAddStockVariant(v); setAddStockQty(""); setAddStockNotes(""); setAddStockOpen(true);
  };

  const handleAddStockSubmit = () => {
    if (!addStockVariant) return;
    const qty = parseInt(addStockQty);
    if (isNaN(qty) || qty < 1) { toast({ title: "خطأ", description: "أدخل كمية صحيحة.", variant: "destructive" }); return; }
    addStockMutation.mutate({ productId: addStockVariant.productId, variantId: addStockVariant.id, qty, notes: addStockNotes });
  };

  const handleProductSubmit = () => {
    if (!productForm.name.trim()) { toast({ title: "خطأ", description: "اسم المنتج مطلوب.", variant: "destructive" }); return; }
    if (editingProduct) updateProductMutation.mutate({ id: editingProduct.id, data: productForm });
    else createProductMutation.mutate(productForm);
  };

  const handleVariantSubmit = async () => {
    if (!variantForm.color.trim() || !variantForm.size.trim()) {
      toast({ title: "خطأ", description: "اللون والمقاس مطلوبان.", variant: "destructive" }); return;
    }
    if (!activeProductId) return;

    if (editingVariant) {
      const { totalQuantity: _qty, ...editData } = variantForm;
      setIsVariantSubmitting(true);
      try {
        await new Promise<void>((resolve, reject) => {
          updateVariantMutation.mutate(
            { productId: activeProductId, id: editingVariant.id, data: editData },
            { onSuccess: () => resolve(), onError: (e) => reject(e) }
          );
        });
        const activeEditEntries = editWarehouseDist.filter(d => d.quantity >= 0);
        if (activeEditEntries.length > 0) {
          await Promise.all(
            activeEditEntries.map(d =>
              warehousesApi.addStock(d.warehouseId, {
                variantId: editingVariant.id,
                productId: activeProductId,
                quantity: d.quantity,
              })
            )
          );
          queryClient.invalidateQueries({ queryKey: ["variant-wh-stock", editingVariant.id] });
          queryClient.invalidateQueries({ queryKey: ["warehouses"] });
          queryClient.invalidateQueries({ queryKey: ["variants"] });
          queryClient.invalidateQueries({ queryKey: ["variants-all"] });
          queryClient.invalidateQueries({ queryKey: ["products"] });
          queryClient.invalidateQueries({ queryKey: ["stock-intelligence"] });
          queryClient.invalidateQueries({ queryKey: ["smart-insights"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] });
        }
        setVariantDialogOpen(false);
        setEditingVariant(null);
        setVariantForm(emptyVariantForm);
        toast({ title: "✅ تم حفظ التعديلات", description: "تم تحديث بيانات SKU والمخازن" });
      } catch (e: any) {
        toast({ title: "خطأ", description: e.message, variant: "destructive" });
      } finally {
        setIsVariantSubmitting(false);
      }
      return;
    }

    const activeEntries = warehouseDist.filter(d => d.quantity > 0);
    const distTotal = activeEntries.reduce((s, d) => s + d.quantity, 0);

    setIsVariantSubmitting(true);
    try {
      const newVariant = await variantsApi.create(activeProductId, {
        ...variantForm,
        colorHex: pickedColorHex || null,
        totalQuantity: 0, // الكمية بتتحدد من warehouse addStock بعدين
      });

      if (distTotal > 0) {
        if (activeEntries.length > 0) {
          // sequential عشان الـ sync يحصل صح بعد كل مخزن
          for (const d of activeEntries) {
            await warehousesApi.addStock(d.warehouseId, {
              variantId: newVariant.id,
              productId: activeProductId,
              quantity: d.quantity,
            });
          }
        } else {
          await variantsApi.addStock(activeProductId, newVariant.id, distTotal, "مخزون افتتاحي");
          const defaultWh = warehouses?.find(w => w.isDefault);
          if (defaultWh) {
            await warehousesApi.addStock(defaultWh.id, {
              variantId: newVariant.id,
              productId: activeProductId,
              quantity: distTotal,
            });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["variants"] });
      queryClient.invalidateQueries({ queryKey: ["variants-all"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      invalidateDashboardFinancials();
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["stock-intelligence"] });
      queryClient.invalidateQueries({ queryKey: ["smart-insights"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] });
      setVariantDialogOpen(false);
      setVariantForm(emptyVariantForm);
      setWarehouseDist([]);
      setUseWarehouseDist(false);

      toast({
        title: "✅ تمت إضافة المقاس/اللون",
        description: activeEntries.length > 0
          ? `تم توزيع ${distTotal} وحدة على ${activeEntries.length} مخزن`
          : distTotal > 0
            ? `تم تسجيل ${distTotal} وحدة في المخزون`
            : "تمت الإضافة بدون مخزون",
      });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setIsVariantSubmitting(false);
    }
  };

  const getProductVariants = (productId: number) => allVariants?.filter(v => v.productId === productId) ?? [];
  const visibleProductIds = new Set((products ?? []).map(p => p.id));
  const visibleVariants = (allVariants ?? []).filter(v => visibleProductIds.has(v.productId));

  // â”€â”€â”€ KPI Counters â€” fully dynamic, recalculated on every allVariants change â”€â”€
  const totalVariants = visibleVariants.length;
  const lowStockVariants = visibleVariants.filter(v => v.totalQuantity > 0 && v.totalQuantity <= v.lowStockThreshold).length;
  const totalAvailable = visibleVariants.reduce((s, v) => s + Math.max(0, v.totalQuantity), 0);
  const inventoryValue = visibleVariants.reduce((s, v) => s + Math.max(0, v.totalQuantity) * (v.costPrice ?? v.unitPrice * 0.6), 0);

  const allColors = [...new Set(visibleVariants.map(v => v.color))].sort();
  const allSizes = [...new Set(visibleVariants.map(v => v.size))].sort();
  // قائمة الموديلات (أسماء المنتجات) للفلتر
  const allModels = [...new Set(products?.map(p => p.name) ?? [])].sort((a, b) => a.localeCompare(b, "ar"));

  const activeFiltersCount = [filterModel !== "all", filterColor !== "all", filterSize !== "all", filterStockStatus !== "all", filterWarehouse !== "all", sortBy !== "name"].filter(Boolean).length;

  // ─── فلترة المنتجات بشكل صحيح ───
  const filteredProducts = (products?.filter(p => {
    // فلتر الموديل (اسم المنتج)
    if (filterModel !== "all" && p.name !== filterModel) return false;

    // فلتر البحث
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    const variants = getProductVariants(p.id);

    // فلتر اللون — لازم يكون في على الأقل variant بهذا اللون
    if (filterColor !== "all" && !variants.some(v => v.color === filterColor)) return false;

    // فلتر المقاس — لازم يكون في على الأقل variant بهذا المقاس
    if (filterSize !== "all" && !variants.some(v => v.size === filterSize)) return false;

    // فلتر حالة المخزون
    if (filterStockStatus !== "all") {
      const hasOut = variants.some(v => v.totalQuantity === 0);
      const hasLow = variants.some(v => v.totalQuantity > 0 && v.totalQuantity <= v.lowStockThreshold);
      const hasOk  = variants.some(v => v.totalQuantity > v.lowStockThreshold);
      if (filterStockStatus === "out" && !hasOut) return false;
      if (filterStockStatus === "low" && !hasLow) return false;
      if (filterStockStatus === "ok"  && !hasOk)  return false;
    }

    return true;
  }) ?? []).sort((a, b) => {
    const sA = getProductVariants(a.id).reduce((s, v) => s + v.totalQuantity, 0);
    const sB = getProductVariants(b.id).reduce((s, v) => s + v.totalQuantity, 0);
    if (sortBy === "stock_desc") return sB - sA;
    if (sortBy === "stock_asc") return sA - sB;
    if (sortBy === "low_first") {
      const scoreA = getProductVariants(a.id).some(v => v.totalQuantity === 0) ? 0 : getProductVariants(a.id).some(v => v.totalQuantity > 0 && v.totalQuantity <= v.lowStockThreshold) ? 1 : 2;
      const scoreB = getProductVariants(b.id).some(v => v.totalQuantity === 0) ? 0 : getProductVariants(b.id).some(v => v.totalQuantity > 0 && v.totalQuantity <= v.lowStockThreshold) ? 1 : 2;
      return scoreA - scoreB;
    }
    if (sortBy === "price_desc") return b.unitPrice - a.unitPrice;
    if (sortBy === "price_asc") return a.unitPrice - b.unitPrice;
    return a.name.localeCompare(b.name, "ar");
  });

  // ─── فلترة الـ variants داخل كل منتج بشكل صحيح ───
  const getFilteredVariants = (productId: number) => {
    const variants = getProductVariants(productId);
    return variants.filter(v => {
      if (filterColor !== "all" && v.color !== filterColor) return false;
      if (filterSize !== "all" && v.size !== filterSize) return false;
      if (filterStockStatus === "out" && v.totalQuantity !== 0) return false;
      if (filterStockStatus === "low" && !(v.totalQuantity > 0 && v.totalQuantity <= v.lowStockThreshold)) return false;
      if (filterStockStatus === "ok"  && !(v.totalQuantity > v.lowStockThreshold)) return false;
      return true;
    });
  };

  const isPending = createProductMutation.isPending || updateProductMutation.isPending;
  const isVariantPending = updateVariantMutation.isPending;

  return (
    <div className="space-y-4 animate-in fade-in duration-500 px-2 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">المخزون</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            {activeTab === "shipments" ? "تتبع الشحنات • المستودع • المرتجعات" : activeTab === "insights" ? "تحليلات الشحنات • الأداء • المناطق • المالي" : "إدارة المنتجات • الألوان • المقاسات • التكاليف"}
          </p>
        </div>
        {activeTab === "products" && canEdit && (
          <Button onClick={openAddProduct} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs sm:text-sm h-8 sm:h-9 px-3">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">منتج جديد</span>
            <span className="xs:hidden">جديد</span>
          </Button>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border w-fit">
        <button
          onClick={() => setActiveTab("shipments")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${
            activeTab === "shipments"
              ? "bg-background shadow-sm border border-border text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          مستودع الشحنات
        </button>
        <button
          onClick={() => setActiveTab("insights")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${
            activeTab === "insights"
              ? "bg-background shadow-sm border border-border text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          تحليلات الشحن
        </button>
        <button
          onClick={() => setActiveTab("products")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${
            activeTab === "products"
              ? "bg-background shadow-sm border border-border text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          المنتجات
        </button>
      </div>

      {/* Shipment Warehouse Tab */}
      {activeTab === "shipments" && <ShipmentWarehouseTab />}

      {/* Shipment Insights Tab */}
      {activeTab === "insights" && <ShipmentInsightsTab />}

      {/* Products Tab */}
      {activeTab === "products" && (<>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Card className="border-border bg-card p-3 sm:p-4">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
            <p className="text-[10px] sm:text-xs text-muted-foreground">إجمالي المنتجات</p>
          </div>
          <p className="text-xl sm:text-2xl font-black">{products?.length ?? 0}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{totalVariants} SKU إجمالي</p>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/5 p-3 sm:p-4">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <Boxes className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-[10px] sm:text-xs text-muted-foreground">متاح للبيع</p>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">{totalAvailable}</p>
          <p className="text-[10px] text-muted-foreground mt-1">وحدة متاحة</p>
        </Card>
        <Card className={`border p-3 sm:p-4 ${lowStockVariants > 0 ? "border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/5" : "border-border bg-card"}`}>
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <AlertTriangle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${lowStockVariants > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
            <p className="text-[10px] sm:text-xs text-muted-foreground">مخزون منخفض</p>
          </div>
          <p className={`text-xl sm:text-2xl font-black ${lowStockVariants > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{lowStockVariants}</p>
          <p className="text-[10px] text-muted-foreground mt-1">SKU يحتاج تجديد</p>
        </Card>
        {canSeeCost && (
          <Card className="border-primary/30 bg-primary/5 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
              <p className="text-[10px] sm:text-xs text-muted-foreground">قيمة المخزون</p>
            </div>
            <p className="text-base sm:text-xl font-black text-primary">{fc(inventoryValue)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">بسعر التكلفة</p>
          </Card>
        )}
      </div>

      {/* Stock Intelligence */}
      {stockIntel && canSeeCost && (stockIntel.summary.fastMovers > 0 || stockIntel.summary.slowMovers > 0 || stockIntel.summary.totalFrozenCapital > 0) && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 sm:px-4 py-2.5 text-xs flex-wrap">
          <span className="text-muted-foreground font-semibold">ذكاء المخزون:</span>
          {stockIntel.summary.fastMovers > 0 && <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-bold"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{stockIntel.summary.fastMovers} سريع النفاد</span>}
          {stockIntel.summary.slowMovers > 0 && <span className="flex items-center gap-1 text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />{stockIntel.summary.slowMovers} بطيء الحركة</span>}
          {stockIntel.summary.totalFrozenCapital > 0 && <span className="text-amber-700/80 dark:text-amber-400/80">{fc(stockIntel.summary.totalFrozenCapital)} رأسمال متجمد</span>}
          {stockIntel.summary.outOfStock > 0 && <span className="text-red-600/80 dark:text-red-400/80">{stockIntel.summary.outOfStock} نفد مخزونه</span>}
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="بحث باسم المنتج أو SKU..." className="pr-9 h-9 text-sm bg-card border-border w-full" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant={showFilters ? "default" : "outline"} size="sm" className="h-9 gap-1.5 text-xs font-bold shrink-0 px-3" onClick={() => setShowFilters(v => !v)}>
          <Filter className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">فلتر</span>
          {activeFiltersCount > 0 && <span className="bg-primary-foreground text-primary rounded-full w-4 h-4 text-[9px] font-black flex items-center justify-center">{activeFiltersCount}</span>}
        </Button>
      </div>

      {/* Filter Panel — فلتر الموديل بدل الحالة */}
      {showFilters && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* فلتر الموديل */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 font-semibold">الموديل</p>
              <Select value={filterModel} onValueChange={setFilterModel}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="كل الموديلات" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الموديلات</SelectItem>
                  {allModels.map(m => (
                    <SelectItem key={m} value={m}>
                      <span className="truncate max-w-[150px] block">{m}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* فلتر اللون */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 font-semibold">اللون</p>
              <Select value={filterColor} onValueChange={setFilterColor}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="كل الألوان" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الألوان</SelectItem>
                  {allColors.map(c => (
                    <SelectItem key={c} value={c}>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full border border-border/50 shrink-0" style={{ background: getColorHex(c) }} />
                        {c}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* فلتر المقاس */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 font-semibold">المقاس</p>
              <Select value={filterSize} onValueChange={setFilterSize}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="كل المقاسات" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المقاسات</SelectItem>
                  {allSizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* ترتيب */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 font-semibold">ترتيب</p>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">الاسم</SelectItem>
                  <SelectItem value="stock_desc">مخزون ↓ (الأعلى أولاً)</SelectItem>
                  <SelectItem value="stock_asc">مخزون ↑ (الأقل أولاً)</SelectItem>
                  <SelectItem value="low_first">🔴 منخفض أولاً</SelectItem>
                  <SelectItem value="price_desc">سعر ↓</SelectItem>
                  <SelectItem value="price_asc">سعر ↑</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* صف ثاني — حالة المخزون + المستودع */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-border/50 pt-2.5">
            {/* فلتر حالة المخزون */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 font-semibold">🔍 حالة المخزون (للجرد)</p>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { value: "all", label: "الكل",       cls: "border-border text-muted-foreground" },
                  { value: "out", label: "🔴 نافد",     cls: "border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20" },
                  { value: "low", label: "🟡 منخفض",   cls: "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20" },
                  { value: "ok",  label: "🟢 متاح",    cls: "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterStockStatus(opt.value)}
                    className={`h-7 px-2.5 text-[11px] font-bold rounded-md border transition-all ${filterStockStatus === opt.value ? opt.cls + " shadow-sm" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* فلتر المستودع */}
            {warehouses && warehouses.length > 1 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 font-semibold">🏭 المستودع</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setFilterWarehouse("all")}
                    className={`h-7 px-2.5 text-[11px] font-bold rounded-md border transition-all ${filterWarehouse === "all" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    كل المستودعات
                  </button>
                  {warehouses.map(wh => (
                    <button
                      key={wh.id}
                      onClick={() => setFilterWarehouse(String(wh.id))}
                      className={`h-7 px-2.5 text-[11px] font-bold rounded-md border transition-all flex items-center gap-1 ${filterWarehouse === String(wh.id) ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary/40"}`}
                    >
                      <WarehouseIcon className="w-2.5 h-2.5" />{wh.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setFilterModel("all"); setFilterColor("all"); setFilterSize("all"); setFilterStockStatus("all"); setFilterWarehouse("all"); setSortBy("name"); }}>
              <X className="w-3 h-3" />مسح الفلاتر ({activeFiltersCount})
            </Button>
          )}
        </div>
      )}

      {/* Products List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">جاري التحميل...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {activeFiltersCount > 0 || search ? "لا توجد نتائج مطابقة للفلتر" : "لا توجد منتجات"}
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {filteredProducts.map(product => {
            const variants = getProductVariants(product.id);
            const filteredVariants = getFilteredVariants(product.id);
            const isExpanded = expandedProductId === product.id;
            const totalStock = variants.reduce((s, v) => s + v.totalQuantity, 0);
            const hasLow = variants.some(v => v.totalQuantity > 0 && v.totalQuantity <= v.lowStockThreshold);
            const hasOut = variants.some(v => v.totalQuantity === 0);
            const margin = calcMargin(product.unitPrice, product.costPrice);
            const intel = stockMap.get(product.name.trim().toLowerCase());

            return (
              <Card key={product.id} className="border-border bg-card overflow-hidden">
                {/* Product Row */}
                <div
                  className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                >
                  {/* صورة المنتج */}
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm">{product.name}</span>
                      {product.sku && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{product.sku}</span>}
                      {hasOut && <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">نفد</Badge>}
                      {hasLow && !hasOut && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-400 text-amber-700">منخفض</Badge>}
                      {intel?.badge === "fast" && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-red-400 text-red-600 hidden sm:flex">سريع النفاد</Badge>}
                      {intel?.badge === "slow" && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-muted-foreground text-muted-foreground hidden sm:flex">بطيء</Badge>}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                      <span>{variants.length} SKU</span>
                      <span className="font-semibold text-foreground">{totalStock} وحدة</span>
                      {canSeeCost && <span className="hidden sm:inline">{fc(product.unitPrice)}</span>}
                      {canSeeCost && <span className="hidden sm:inline"><MarginBadge margin={margin} /></span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hidden sm:flex" title="طباعة الجرد" onClick={e => { e.stopPropagation(); printProductInventory(product, variants, warehouses, canSeeCost); }}>
                      <Printer className="w-3.5 h-3.5" />
                    </Button>
                    {canEdit && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); openEditProduct(product); }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); if (confirm("أرشفة هذا المنتج؟")) deleteProductMutation.mutate(product.id); }}>
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Variants */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Variants Table Header — responsive */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-1.5 bg-muted/20 text-[10px] text-muted-foreground font-semibold">
                      <span>اللون / المقاس</span>
                      <span className="text-center w-16">المخزون</span>
                      {canSeeCost && <span className="text-center w-20">السعر</span>}
                      {canSeeCost && <span className="text-center w-12">هامش</span>}
                      {canEdit && <span className="w-20" />}
                    </div>
                    {filteredVariants.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-muted-foreground">
                        {variants.length > 0 ? "لا يوجد SKU مطابق للفلتر" : "لا يوجد SKU بعد"}
                      </div>
                    ) : (
                      filteredVariants.map(v => {
                        const vMargin = calcMargin(v.unitPrice, v.costPrice);
                        const isLow = v.totalQuantity > 0 && v.totalQuantity <= v.lowStockThreshold;
                        const isOut = v.totalQuantity === 0;
                        return (
                          <div key={v.id} className="border-t border-border/50">
                            {/* Desktop row */}
                            <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 py-2.5 items-start hover:bg-muted/10">
                              <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-3 h-3 rounded-full shrink-0 border border-border/50" style={{ background: getVariantColorHex(v) }} />
                                  <span className="text-xs font-medium truncate">{v.color} / {v.size}</span>
                                  {v.sku && <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded font-mono">{v.sku}</span>}
                                </div>
                                <VariantWarehouseBreakdown variantId={v.id} />
                              </div>
                              <div className={`text-center w-16 text-xs font-bold ${isOut ? "text-red-600 dark:text-red-400" : isLow ? "text-amber-600" : "text-emerald-600 dark:text-emerald-400"}`}>
                                {v.totalQuantity}
                              </div>
                              {canSeeCost && <div className="text-center w-20 text-xs text-muted-foreground">{fc(v.unitPrice)}</div>}
                              {canSeeCost && <div className="text-center w-12"><MarginBadge margin={vMargin} /></div>}
                              {(canEdit || canDelete) && (
                                <div className="flex items-center gap-1 w-20 justify-end">
                                  {canEdit && (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title="إضافة مخزون" onClick={() => openAddVariantStock(v)}>
                                    <PackagePlus className="w-3.5 h-3.5" />
                                  </Button>
                                  )}
                                  {canEdit && (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEditVariant(v)}>
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  )}
                                  {canDelete && (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm("حذف هذا SKU؟")) deleteVariantMutation.mutate({ productId: v.productId, id: v.id }); }}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Mobile row */}
                            <div className="sm:hidden flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/10">
                              <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-border/50 mt-0.5" style={{ background: getVariantColorHex(v) }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-xs font-semibold">{v.color} / {v.size}</span>
                                  <span className={`text-xs font-bold ${isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-600"}`}>
                                    {v.totalQuantity} وحدة
                                  </span>
                                </div>
                                {v.sku && <span className="text-[9px] text-muted-foreground font-mono">{v.sku}</span>}
                                <VariantWarehouseBreakdown variantId={v.id} />
                              </div>
                              {(canEdit || canDelete) && (
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {canEdit && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600" onClick={() => openAddVariantStock(v)}>
                                    <PackagePlus className="w-3.5 h-3.5" />
                                  </Button>
                                  )}
                                  {canEdit && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditVariant(v)}>
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </Button>
                                  )}
                                  {canDelete && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => { if (confirm("حذف هذا SKU؟")) deleteVariantMutation.mutate({ productId: v.productId, id: v.id }); }}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    {/* Add SKU Button */}
                    {canEdit && (
                      <div className="px-3 sm:px-4 py-2 border-t border-border/50">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-primary hover:text-primary hover:bg-primary/5" onClick={() => openAddVariant(product.id)}>
                          <Plus className="w-3.5 h-3.5" />إضافة SKU جديد
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Product Dialog — احترافي ─── */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] sm:w-full p-0 gap-0 overflow-hidden" dir="rtl">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${editingProduct ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10"}`}>
              {editingProduct ? <Edit2 className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : <PackagePlus className="w-4 h-4 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-bold leading-tight">{editingProduct ? "تعديل المنتج" : "منتج جديد"}</DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">{editingProduct ? `تعديل: ${editingProduct.name}` : "أضف منتجاً جديداً للمخزون"}</p>
            </div>
          </div>

          <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* صورة + اسم + SKU */}
            <div className="flex gap-4">
              <div className="shrink-0">
                <ProductImageUpload value={productForm.image} onChange={v => setProductForm(f => ({ ...f, image: v }))} />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <Label className="text-[11px] font-bold text-muted-foreground mb-1.5 block">اسم المنتج *</Label>
                  <Input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: تيشيرت قطن" className="h-9 text-sm font-semibold" autoFocus />
                </div>
                <div>
                  <Label className="text-[11px] font-bold text-muted-foreground mb-1.5 block">كود المنتج (SKU)</Label>
                  <Input value={productForm.sku} onChange={e => setProductForm(f => ({ ...f, sku: e.target.value }))} placeholder="مثال: TS-001" className="h-9 text-sm font-mono tracking-wider" />
                </div>
              </div>
            </div>

            <Separator />

            {/* التسعير */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                <DollarSign className="w-3 h-3" />التسعير
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-muted-foreground block">سعر البيع (ج.م) *</Label>
                  <div className="relative">
                    <Input type="number" value={productForm.unitPrice || ""} onChange={e => setProductForm(f => ({ ...f, unitPrice: parseFloat(e.target.value) || 0 }))} placeholder="0" className="h-9 text-sm font-bold pl-10" />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">ج.م</span>
                  </div>
                </div>
                {canSeeCost && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-muted-foreground block">سعر التكلفة (ج.م)</Label>
                    <div className="relative">
                      <Input type="number" value={productForm.costPrice ?? ""} onChange={e => setProductForm(f => ({ ...f, costPrice: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="اختياري" className="h-9 text-sm pl-10" />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">ج.م</span>
                    </div>
                  </div>
                )}
              </div>
              {/* Live margin preview */}
              {canSeeCost && productForm.costPrice && productForm.unitPrice > 0 && (() => {
                const m = calcMargin(productForm.unitPrice, productForm.costPrice);
                const profit = productForm.unitPrice - productForm.costPrice;
                if (m === null) return null;
                const cls = m >= 40 ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400"
                  : m >= 20 ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400"
                  : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400";
                return (
                  <div className={`mt-2.5 flex items-center gap-3 px-3 py-2 rounded-lg border text-xs font-semibold ${cls}`}>
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    <span>هامش الربح: <strong>{m}%</strong></span>
                    <span className="opacity-40 mx-0.5">•</span>
                    <span>ربح الوحدة: <strong>{fc(profit)}</strong></span>
                  </div>
                );
              })()}
            </div>

            <Separator />

            {/* تنبيهات */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                <AlertTriangle className="w-3 h-3" />تنبيهات المخزون
              </p>
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[11px] font-bold text-muted-foreground block">حد المخزون المنخفض</Label>
                  <Input type="number" value={productForm.lowStockThreshold} onChange={e => setProductForm(f => ({ ...f, lowStockThreshold: parseInt(e.target.value) || 5 }))} className="h-9 text-sm" min="0" />
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed pt-4 max-w-[160px]">سيظهر تنبيه عند وصول المخزون لهذا الحد أو أقل</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-5 py-4 border-t border-border bg-muted/20">
            <Button onClick={handleProductSubmit} disabled={isPending || !productForm.name.trim()} className="flex-1 h-9 text-sm font-bold gap-2">
              {isPending ? <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />جاري الحفظ...</> : editingProduct ? "حفظ التعديلات" : "إضافة المنتج"}
            </Button>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)} className="h-9 px-5 text-sm">إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Variant Dialog — احترافي ─── */}
      <Dialog open={variantDialogOpen} onOpenChange={setVariantDialogOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-1rem)] sm:w-full p-0 gap-0 overflow-hidden" dir="rtl">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${editingVariant ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10"}`}>
              {editingVariant ? <Edit2 className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : <Layers className="w-4 h-4 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-bold leading-tight">
                {editingVariant ? "تعديل اللون / المقاس" : "إضافة لون / مقاس جديد"}
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {(() => { const p = products?.find(p => p.id === activeProductId); return p ? p.name : "SKU جديد"; })()}
              </p>
            </div>
            {/* Live color preview */}
            {variantForm.color && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-6 h-6 rounded-full border-2 border-white shadow-md" style={{ background: pickedColorHex }} />
                <span className="text-xs font-bold text-muted-foreground">{variantForm.color}{variantForm.size ? ` / ${variantForm.size}` : ""}</span>
              </div>
            )}
          </div>

          <div className="p-5 space-y-5 max-h-[72vh] overflow-y-auto">

            {/* اللون */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground mb-2.5 uppercase tracking-wider">اللون *</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {COMMON_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setVariantForm(f => ({ ...f, color: c }));
                      setPickedColorHex(getColorHex(c));
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition-all ${
                      variantForm.color === c
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-muted/60"
                    }`}>
                    <span className="w-3 h-3 rounded-full border border-white/50 shadow-sm shrink-0" style={{ background: getColorHex(c) }} />
                    {c}
                  </button>
                ))}
              </div>
              {/* حقل اللون المخصص: color picker + اسم اللون */}
              <div className="flex items-center gap-2">
                {/* Color Picker */}
                <div className="relative shrink-0">
                  <input
                    type="color"
                    value={pickedColorHex}
                    onChange={e => {
                      setPickedColorHex(e.target.value);
                      setVariantForm(f => ({ ...f, color: f.color || e.target.value, colorHex: e.target.value }));
                    }}
                    className="w-10 h-9 rounded-lg border border-border cursor-pointer p-0.5 bg-transparent"
                    title="اختر لوناً من لوحة الألوان"
                  />
                </div>
                {/* اسم اللون */}
                <Input
                  value={variantForm.color}
                  onChange={e => {
                    setVariantForm(f => ({ ...f, color: e.target.value }));
                    // لو الاسم معروف أو hex نحدث معاينة اللون فقط
                    if (/^#[0-9a-fA-F]{6,7}$/.test(e.target.value)) {
                      setPickedColorHex(e.target.value);
                    } else if (COMMON_COLORS.includes(e.target.value)) {
                      setPickedColorHex(getColorHex(e.target.value));
                    }
                  }}
                  placeholder="اكتب اسم اللون أو اختره من اللوحة..."
                  className="h-9 text-sm flex-1"
                />
                {/* Preview */}
                {variantForm.color && (
                  <span
                    className="w-9 h-9 rounded-lg border-2 border-border shrink-0 shadow-sm"
                    style={{ background: pickedColorHex }}
                    title={variantForm.color}
                  />
                )}
              </div>
            </div>

            {/* المقاس */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground mb-2.5 uppercase tracking-wider">المقاس *</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {COMMON_SIZES.map(s => (
                  <button key={s} type="button" onClick={() => setVariantForm(f => ({ ...f, size: s }))}
                    className={`w-12 h-8 rounded-lg text-[11px] font-bold border transition-all ${
                      variantForm.size === s
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-muted/60"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
              <Input value={variantForm.size} onChange={e => setVariantForm(f => ({ ...f, size: e.target.value }))} placeholder="أو اكتب مقاساً مخصصاً..." className="h-9 text-sm" />
            </div>

            <Separator />

            {/* التسعير */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                <DollarSign className="w-3 h-3" />التسعير
              </p>
              <div className={`grid gap-3 ${canSeeCost ? "grid-cols-3" : "grid-cols-2"}`}>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-muted-foreground block">كود SKU</Label>
                  <Input value={variantForm.sku} onChange={e => setVariantForm(f => ({ ...f, sku: e.target.value }))} placeholder="اختياري" className="h-9 text-xs font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-muted-foreground block">سعر البيع (ج.م)</Label>
                  <Input type="number" value={variantForm.unitPrice || ""} onChange={e => setVariantForm(f => ({ ...f, unitPrice: parseFloat(e.target.value) || 0 }))} className="h-9 text-sm font-bold" />
                </div>
                {canSeeCost && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-muted-foreground block">سعر التكلفة (ج.م)</Label>
                    <Input type="number" value={variantForm.costPrice ?? ""} onChange={e => setVariantForm(f => ({ ...f, costPrice: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="اختياري" className="h-9 text-sm" />
                  </div>
                )}
              </div>
              {/* Live margin */}
              {canSeeCost && variantForm.costPrice && variantForm.unitPrice > 0 && (() => {
                const m = calcMargin(variantForm.unitPrice, variantForm.costPrice);
                if (m === null) return null;
                const cls = m >= 40 ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400"
                  : m >= 20 ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400"
                  : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400";
                return (
                  <div className={`mt-2.5 flex items-center gap-3 px-3 py-2 rounded-lg border text-xs font-semibold ${cls}`}>
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    <span>هامش الربح: <strong>{m}%</strong></span>
                    <span className="opacity-40 mx-0.5">•</span>
                    <span>ربح الوحدة: <strong>{fc(variantForm.unitPrice - variantForm.costPrice)}</strong></span>
                  </div>
                );
              })()}
            </div>

            <Separator />

            {/* المخازن */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <WarehouseIcon className="w-3 h-3" />
                  {editingVariant ? "كميات المخازن" : "توزيع الكميات على المخازن"}
                </p>
                {(() => {
                  const distList = editingVariant ? editWarehouseDist : warehouseDist;
                  const total = distList.reduce((s, d) => s + (d.quantity || 0), 0);
                  return total > 0 ? (
                    <span className="text-xs font-black text-primary bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-full">
                      الإجمالي: {total} وحدة
                    </span>
                  ) : null;
                })()}
              </div>

              {!warehouses || warehouses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-5 text-center">
                  <WarehouseIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">لا توجد مخازن. أضف مخازن أولاً من قسم المخازن.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  {warehouses.map((wh, idx) => {
                    const distList = editingVariant ? editWarehouseDist : warehouseDist;
                    const entry = distList.find(d => d.warehouseId === wh.id);
                    const qty = entry?.quantity ?? 0;
                    return (
                      <div key={wh.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${idx !== 0 ? "border-t border-border/50" : ""} ${qty > 0 ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${qty > 0 ? "bg-primary" : "bg-border"}`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold truncate block">{wh.name}</span>
                          {wh.isDefault && <span className="text-[9px] text-amber-600 font-bold">افتراضي</span>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" onClick={() => {
                            const newQty = Math.max(0, qty - 1);
                            const updater = (prev: WarehouseDistEntry[]) => prev.find(d => d.warehouseId === wh.id)
                              ? prev.map(d => d.warehouseId === wh.id ? { ...d, quantity: newQty } : d)
                              : [...prev, { warehouseId: wh.id, quantity: newQty }];
                            if (editingVariant) setEditWarehouseDist(updater); else setWarehouseDist(updater);
                          }} className="w-8 h-8 rounded-lg border border-border bg-card hover:bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground transition-colors">−</button>
                          <Input
                            type="number" min="0" value={qty || ""} placeholder="0"
                            className={`w-16 h-8 text-sm text-center font-bold transition-all ${qty > 0 ? "border-primary/60 bg-primary/5 text-primary" : ""}`}
                            onChange={e => {
                              const newQty = parseInt(e.target.value) || 0;
                              const updater = (prev: WarehouseDistEntry[]) => prev.find(d => d.warehouseId === wh.id)
                                ? prev.map(d => d.warehouseId === wh.id ? { ...d, quantity: newQty } : d)
                                : [...prev, { warehouseId: wh.id, quantity: newQty }];
                              if (editingVariant) setEditWarehouseDist(updater); else setWarehouseDist(updater);
                            }}
                          />
                          <button type="button" onClick={() => {
                            const newQty = qty + 1;
                            const updater = (prev: WarehouseDistEntry[]) => prev.find(d => d.warehouseId === wh.id)
                              ? prev.map(d => d.warehouseId === wh.id ? { ...d, quantity: newQty } : d)
                              : [...prev, { warehouseId: wh.id, quantity: newQty }];
                            if (editingVariant) setEditWarehouseDist(updater); else setWarehouseDist(updater);
                          }} className="w-8 h-8 rounded-lg border border-border bg-card hover:bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground transition-colors">+</button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Total row */}
                  {(() => {
                    const distList = editingVariant ? editWarehouseDist : warehouseDist;
                    const total = distList.reduce((s, d) => s + (d.quantity || 0), 0);
                    return (
                      <div className={`flex items-center justify-between px-4 py-2.5 border-t-2 ${total > 0 ? "border-primary/40 bg-primary/10" : "border-border bg-muted/30"}`}>
                        <span className="text-xs font-bold">إجمالي الكميات</span>
                        <span className={`text-lg font-black ${total > 0 ? "text-primary" : "text-muted-foreground"}`}>{total}</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <Separator />

            {/* حد التنبيه */}
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <Label className="text-[11px] font-bold text-muted-foreground block flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" />حد التنبيه (مخزون منخفض)
                </Label>
                <Input type="number" value={variantForm.lowStockThreshold} onChange={e => setVariantForm(f => ({ ...f, lowStockThreshold: parseInt(e.target.value) || 5 }))} className="h-9 text-sm" min="0" />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed pt-4 max-w-[140px]">تنبيه عند وصول المخزون لهذا الحد</p>
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-5 py-4 border-t border-border bg-muted/20">
            <Button onClick={handleVariantSubmit} disabled={isVariantPending || isVariantSubmitting || !variantForm.color.trim() || !variantForm.size.trim()} className="flex-1 h-9 text-sm font-bold gap-2">
              {(isVariantPending || isVariantSubmitting)
                ? <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />جاري الحفظ...</>
                : editingVariant ? "حفظ التعديلات" : "إضافة SKU"
              }
            </Button>
            <Button variant="outline" onClick={() => setVariantDialogOpen(false)} className="h-9 px-5 text-sm">إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Add Stock Dialog ─── */}
      <Dialog open={addStockOpen} onOpenChange={setAddStockOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)] sm:w-full" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مخزون</DialogTitle>
          </DialogHeader>
          {addStockVariant && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border">
                <span className="w-4 h-4 rounded-full border" style={{ background: getVariantColorHex(addStockVariant) }} />
                <span className="text-sm font-semibold">{addStockVariant.color} / {addStockVariant.size}</span>
                <span className="text-xs text-muted-foreground mr-auto">المخزون الحالي: {addStockVariant.totalQuantity}</span>
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">الكمية المضافة *</Label>
                <Input type="number" value={addStockQty} onChange={e => setAddStockQty(e.target.value)} placeholder="أدخل الكمية" className="h-9 text-sm" autoFocus />
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">ملاحظات (اختياري)</Label>
                <Textarea value={addStockNotes} onChange={e => setAddStockNotes(e.target.value)} placeholder="مثال: شحنة جديدة، مرتجع..." className="text-sm h-16 resize-none" />
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAddStockSubmit} disabled={addStockMutation.isPending} className="flex-1 h-9 text-sm font-bold">
              {addStockMutation.isPending ? "جاري الحفظ..." : "إضافة للمخزون"}
            </Button>
            <Button variant="outline" onClick={() => setAddStockOpen(false)} className="h-9 text-sm">إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

    </>)}
    </div>
  );
}
