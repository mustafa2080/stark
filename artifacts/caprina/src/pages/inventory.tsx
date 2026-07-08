import { useState, useMemo, useEffect } from "react";
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
  AlertCircle, Zap, Target, Activity, PieChart, ShieldAlert, CircleDollarSign, PackageCheck, Wallet,
  Globe, Image as LucideImage, Pencil
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

  // ── الشحنات حسب الفرع/المخزن ──────────────────────────────────────────────
  const byBranch = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of shipments) {
      const name = (s as any).warehouseName || "بدون فرع";
      m[name] = (m[name] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [shipments]);

  // ── الشحنات حسب نوع الطرد (ملابس / مستندات / إلكترونيات ..) ──────────────
  const PARCEL_LABELS: Record<string, string> = {
    document: "مستندات", normal: "طرد عادي", fragile: "قابل للكسر",
    heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس",
    food: "طعام", other: "أخرى",
  };
  const PARCEL_ICONS_MAP: Record<string, string> = {
    document: "📄", normal: "📦", fragile: "🔮", heavy: "⚖️",
    electronics: "💻", clothing: "👕", food: "🍱", other: "📫",
  };
  const byParcelType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of shipments) {
      const key = (s as any).parcelType || "normal";
      m[key] = (m[key] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [shipments]);

  // ── أداء شركات الشحن: scorecard مركّب (معدل تسليم + سرعة + معدل إرجاع) ────
  const companyPerf = useMemo(() => {
    const m: Record<string, { total: number; delivered: number; returned: number; name: string; deliveryHoursSum: number; deliveryHoursCount: number }> = {};
    for (const s of shipments) {
      const key  = String(s.shippingCompanyId ?? "بدون شركة");
      const name = s.shippingCompanyName || "بدون شركة";
      if (!m[key]) m[key] = { total: 0, delivered: 0, returned: 0, name, deliveryHoursSum: 0, deliveryHoursCount: 0 };
      m[key].total++;
      if (s.status === "delivered") {
        m[key].delivered++;
        // متوسط وقت التسليم = من إنشاء الشحنة لحد التسليم الفعلي
        if (s.actualDelivery && s.createdAt) {
          const hrs = (new Date(s.actualDelivery).getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60);
          if (hrs >= 0 && hrs < 24 * 30) { // استبعاد قيم شاذة (أكتر من شهر = خطأ بيانات)
            m[key].deliveryHoursSum += hrs;
            m[key].deliveryHoursCount++;
          }
        }
      }
      if (s.status === "returned")  m[key].returned++;
    }
    const list = Object.values(m)
      .filter(c => c.total >= 2)
      .map(c => {
        const closedCount = c.delivered + c.returned;
        const deliveryRate = closedCount > 0 ? (c.delivered / closedCount) * 100 : 0;
        const returnRate   = closedCount > 0 ? (c.returned  / closedCount) * 100 : 0;
        const avgHours     = c.deliveryHoursCount > 0 ? c.deliveryHoursSum / c.deliveryHoursCount : null;
        // score مركّب: معدل التسليم هو الأساس، وبننزل منه نقاط لو السرعة بطيئة (أكتر من 72 ساعة)
        const speedPenalty = avgHours !== null && avgHours > 72 ? Math.min(20, (avgHours - 72) / 12) : 0;
        const score = Math.max(0, deliveryRate - speedPenalty);
        return { ...c, deliveryRate, returnRate, avgHours, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return list;
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

        {/* أداء شركات الشحن — مرتبة من الأفضل للأقل (composite score) */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-violet-50/50 dark:bg-violet-900/5">
            <Activity className="w-4 h-4 text-violet-500 shrink-0" />
            <span className="text-sm font-bold text-violet-600 dark:text-violet-400">أداء شركات الشحن</span>
            <span className="text-[9px] text-muted-foreground mr-auto">مرتبة حسب الأداء</span>
          </div>
          {companyPerf.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Truck className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">لا توجد بيانات كافية</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {companyPerf.map((c, idx) => {
                const rate = Math.round(c.deliveryRate);
                return (
                  <div key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black ${idx === 0 ? "bg-amber-400/20 text-amber-500" : "bg-violet-500/10 text-violet-500"}`}>
                      {idx === 0 ? "★" : `#${idx + 1}`}
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
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[9px] text-muted-foreground">{c.total} شحنة</span>
                        <span className="text-[9px] text-emerald-500">{c.delivered} تسليم</span>
                        {c.returned > 0 && <span className="text-[9px] text-red-400">{c.returned} مرتجع</span>}
                        {c.avgHours !== null && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <Clock3 className="w-2.5 h-2.5" />
                            متوسط {formatAge(c.avgHours)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 2.5: الشحنات حسب الفرع + حسب نوع الطرد ────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* الشحنات حسب الفرع */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-blue-50/50 dark:bg-blue-900/5">
            <WarehouseIcon className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">الشحنات حسب الفرع</span>
            <span className="text-[10px] text-muted-foreground mr-auto">من آخر 200 شحنة</span>
          </div>
          {byBranch.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <WarehouseIcon className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">لا توجد بيانات</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {byBranch.map(([name, count], i) => {
                const maxCount = byBranch[0][1];
                const barW = pct(count, maxCount);
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className={`text-[10px] font-black w-4 text-center shrink-0 ${i === 0 ? "text-blue-500" : "text-muted-foreground"}`}>{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold truncate">{name}</span>
                        <span className={`text-[11px] font-black shrink-0 ml-2 ${i === 0 ? "text-blue-500" : "text-muted-foreground"}`}>{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${i === 0 ? "bg-blue-500" : i === 1 ? "bg-blue-400" : "bg-muted-foreground/40"}`}
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

        {/* الشحنات حسب نوع الطرد */}
        <Card className="border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-violet-50/50 dark:bg-violet-900/5">
            <Boxes className="w-4 h-4 text-violet-500 shrink-0" />
            <span className="text-sm font-bold text-violet-600 dark:text-violet-400">الشحنات حسب نوع الطرد</span>
            <span className="text-[10px] text-muted-foreground mr-auto">من آخر 200 شحنة</span>
          </div>
          {byParcelType.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Boxes className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">لا توجد بيانات</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {byParcelType.map(([type, count], i) => {
                const maxCount = byParcelType[0][1];
                const barW = pct(count, maxCount);
                const label = PARCEL_LABELS[type] || type;
                const icon  = PARCEL_ICONS_MAP[type] || "📦";
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-sm w-5 text-center shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold truncate">{label}</span>
                        <span className={`text-[11px] font-black shrink-0 ml-2 ${i === 0 ? "text-violet-500" : "text-muted-foreground"}`}>{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${i === 0 ? "bg-violet-500" : i === 1 ? "bg-violet-400" : "bg-muted-foreground/40"}`}
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
const SHIP_STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string; icon: any }> = {
  // القيم من DB (Stark schema)
  pending:          { label: "قيد الانتظار",           color: "text-slate-600 dark:text-slate-300",    bg: "bg-slate-100 dark:bg-slate-800/40",   border: "border-slate-300 dark:border-slate-600",       dot: "bg-slate-500",    icon: Clock3 },
  warehouse_ready:  { label: "قيد الشحن في المخزن",   color: "text-cyan-600 dark:text-cyan-400",      bg: "bg-cyan-50 dark:bg-cyan-900/20",      border: "border-cyan-200 dark:border-cyan-700",         dot: "bg-cyan-500",     icon: PackageCheck },
  in_shipping:      { label: "قيد الشحن",              color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-50 dark:bg-violet-900/20",  border: "border-violet-200 dark:border-violet-700",     dot: "bg-violet-500",   icon: Truck },
  received:         { label: "استلم",                  color: "text-emerald-600 dark:text-emerald-400",bg: "bg-emerald-50 dark:bg-emerald-900/20",border: "border-emerald-200 dark:border-emerald-700",   dot: "bg-emerald-500",  icon: CheckCircle2 },
  partial_received: { label: "استلام جزئي",            color: "text-amber-600 dark:text-amber-400",    bg: "bg-amber-50 dark:bg-amber-900/20",    border: "border-amber-200 dark:border-amber-700",       dot: "bg-amber-500",    icon: AlertTriangle },
  delayed:          { label: "مؤجل",                   color: "text-orange-600 dark:text-orange-400",  bg: "bg-orange-50 dark:bg-orange-900/20",  border: "border-orange-200 dark:border-orange-700",     dot: "bg-orange-500",   icon: AlertCircle },
  returned:         { label: "مرتجع",                  color: "text-red-600 dark:text-red-400",        bg: "bg-red-50 dark:bg-red-900/20",        border: "border-red-200 dark:border-red-700",           dot: "bg-red-500",      icon: RotateCcw },
  // aliases قديمة من APIs القديمة
  waiting:          { label: "قيد الانتظار",           color: "text-slate-600 dark:text-slate-300",    bg: "bg-slate-100 dark:bg-slate-800/40",   border: "border-slate-300 dark:border-slate-600",       dot: "bg-slate-500",    icon: Clock3 },
  confirmed:        { label: "قيد الانتظار",           color: "text-slate-600 dark:text-slate-300",    bg: "bg-slate-100 dark:bg-slate-800/40",   border: "border-slate-300 dark:border-slate-600",       dot: "bg-slate-500",    icon: Clock3 },
  picked_up:        { label: "قيد الشحن في المخزن",   color: "text-cyan-600 dark:text-cyan-400",      bg: "bg-cyan-50 dark:bg-cyan-900/20",      border: "border-cyan-200 dark:border-cyan-700",         dot: "bg-cyan-500",     icon: PackageCheck },
  in_transit:       { label: "قيد الشحن",              color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-50 dark:bg-violet-900/20",  border: "border-violet-200 dark:border-violet-700",     dot: "bg-violet-500",   icon: Truck },
  out_for_delivery: { label: "قيد الشحن",              color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-50 dark:bg-violet-900/20",  border: "border-violet-200 dark:border-violet-700",     dot: "bg-violet-500",   icon: Truck },
  delivered:        { label: "استلم",                  color: "text-emerald-600 dark:text-emerald-400",bg: "bg-emerald-50 dark:bg-emerald-900/20",border: "border-emerald-200 dark:border-emerald-700",   dot: "bg-emerald-500",  icon: CheckCircle2 },
  cancelled:        { label: "ملغي",                   color: "text-zinc-500 dark:text-zinc-400",      bg: "bg-zinc-100 dark:bg-zinc-800/40",     border: "border-zinc-300 dark:border-zinc-600",         dot: "bg-zinc-400",     icon: RotateCcw },
};

const fc2 = (n: number | string) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);

const ACTIVE_STATUSES  = ["pending", "warehouse_ready", "in_shipping", "waiting", "confirmed", "picked_up", "in_transit", "out_for_delivery"] as const;
const CLOSED_STATUSES  = ["received", "delivered", "partial_received", "delayed", "returned", "cancelled"] as const;
const ALL_SHIP_STATUSES = [...ACTIVE_STATUSES, ...CLOSED_STATUSES] as const;

// ─── SLA: حدود الإنذار بالساعات لكل حالة (شركات الشحن الكبيرة بتفرّق هنا) ──────
// كل حالة عندها "نافذة زمنية طبيعية" مختلفة — انتظار يومين طبيعي مش زي قيد الشحن يومين
const SLA_HOURS: Partial<Record<string, { warn: number; critical: number }>> = {
  // DB values (Stark schema)
  pending:          { warn: 24,  critical: 48  },
  warehouse_ready:  { warn: 24,  critical: 48  },
  in_shipping:      { warn: 72,  critical: 120 },
  // legacy aliases
  waiting:          { warn: 24,  critical: 48  },
  confirmed:        { warn: 24,  critical: 72  },
  picked_up:        { warn: 24,  critical: 48  },
  in_transit:       { warn: 72,  critical: 120 },
  out_for_delivery: { warn: 24,  critical: 48  },
};

const hoursSince = (dateStr: string | null | undefined): number => {
  if (!dateStr) return 0;
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return 0;
  return (Date.now() - d) / (1000 * 60 * 60);
};

const formatAge = (hours: number): string => {
  if (hours < 1) return "أقل من ساعة";
  if (hours < 24) return `${Math.floor(hours)} س`;
  const days = Math.floor(hours / 24);
  const remHours = Math.floor(hours % 24);
  return remHours > 0 ? `${days} ي ${remHours} س` : `${days} ي`;
};

// مستوى الخطورة بناءً على عمر الشحنة في حالتها الحالية
type AgeLevel = "ok" | "warn" | "critical";
const getAgeLevel = (status: string, hours: number): AgeLevel => {
  const sla = SLA_HOURS[status];
  if (!sla) return "ok"; // حالات نهائية (delivered/returned/cancelled/delayed) مالهاش SLA aging
  if (hours >= sla.critical) return "critical";
  if (hours >= sla.warn) return "warn";
  return "ok";
};

const AGE_LEVEL_STYLE: Record<AgeLevel, string> = {
  ok:       "text-muted-foreground",
  warn:     "text-amber-600 dark:text-amber-400 font-bold",
  critical: "text-red-600 dark:text-red-400 font-black animate-pulse",
};

// ─── Tab definitions — كل تاب ممكن يجمع أكتر من status واحد ────────────────────
// ملحوظة: التابات التالتة دي بس اللي ظاهرة في مستودع الشحنات (قيد الانتظار/قيد الشحن/استلام
// جزئي/استلم اتشالوا من هنا بناءً على طلب المستخدم، بس الداتا لسه موجودة وبتظهر في تحليلات الشحن)
const WAREHOUSE_TABS = [
  {
    id:       "warehouse_ready",
    label:    "قيد الشحن في المخزن",
    statuses: ["picked_up", "warehouse_ready"],
    icon:     PackageCheck,
    color:    "text-cyan-600 dark:text-cyan-400",
    bg:       "bg-cyan-50 dark:bg-cyan-900/20",
    border:   "border-cyan-200 dark:border-cyan-700",
    dot:      "bg-cyan-500",
  },
  {
    id:       "returned",
    label:    "مرتجع",
    statuses: ["returned"],
    icon:     RotateCcw,
    color:    "text-red-600 dark:text-red-400",
    bg:       "bg-red-50 dark:bg-red-900/20",
    border:   "border-red-200 dark:border-red-700",
    dot:      "bg-red-500",
  },
  {
    id:       "delayed",
    label:    "مؤجل",
    statuses: ["delayed"],
    icon:     AlertCircle,
    color:    "text-orange-600 dark:text-orange-400",
    bg:       "bg-orange-50 dark:bg-orange-900/20",
    border:   "border-orange-200 dark:border-orange-700",
    dot:      "bg-orange-500",
  },
] as const;

type TabId = typeof WAREHOUSE_TABS[number]["id"];

function ShipmentWarehouseTab() {
  const [activeTab, setActiveTab] = useState<TabId>("warehouse_ready");
  const [search,          setSearch]          = useState("");
  const [dateFrom,        setDateFrom]        = useState("");
  const [dateTo,          setDateTo]          = useState("");
  const [shippingCompany, setShippingCompany] = useState<string>("all");
  const [showFilters,     setShowFilters]     = useState(false);
  const [slaOnly,         setSlaOnly]         = useState(false);
  const [warehouseId,     setWarehouseId]     = useState<string>("all");

  // ── شركات الشحن للفلتر ────────────────────────────────────────────────────
  const { data: companies = [] } = useQuery({
    queryKey: ["shipping-companies-wh"],
    queryFn:  () => import("@/lib/api").then(m => m.shippingApi.list()),
    staleTime: 5 * 60_000,
  });

  // ── المخازن للفلتر — تاب "مستودع الشحنات" بيعرض شحنات مخزن واحد محدد ──────
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-wh-tab"],
    queryFn:  () => warehousesApi.list(),
    staleTime: 5 * 60_000,
  });

  // لو فيه مخزن واحد بس متاح، نختاره تلقائياً بدل "الكل"
  useEffect(() => {
    if (warehouseId === "all" && warehouses.length === 1) {
      setWarehouseId(String(warehouses[0].id));
    }
  }, [warehouses, warehouseId]);

  // ── جلب شحنات المخزن المحدد من الـ endpoint المخصص /warehouses/:id/shipments ─
  // لو "الكل" محدد، نجمع شحنات كل المخازن في نفس الوقت — query واحدة ثابتة (مش .map على عدد متغيّر،
  // عشان ده بيكسر Rules of Hooks لما يتغيّر عدد المخازن بين الـ renders)
  const targetWarehouseIds = warehouseId === "all" ? warehouses.map(w => w.id) : [Number(warehouseId)].filter(Number.isFinite);

  const { data: warehouseShipmentsData, isLoading: isLoadingShipments } = useQuery({
    queryKey: ["warehouse-shipments", warehouseId, targetWarehouseIds.join(",")],
    queryFn: async () => {
      const results = await Promise.all(targetWarehouseIds.map(id => warehousesApi.shipments(id, "all")));
      return results.flatMap(r => r.shipments ?? []);
    },
    enabled: warehouses.length > 0 && targetWarehouseIds.length > 0,
    staleTime: 30_000,
  });

  const isLoading = warehouses.length === 0 || isLoadingShipments;

  // legacy → canonical لا نحتاجها — كل tab عنده statuses[] صح من الـ DB
  const allWarehouseShipments = useMemo(() => {
    let data = (warehouseShipmentsData ?? []) as any[];
    if (dateFrom) data = data.filter((s: any) => s.createdAt >= dateFrom);
    if (dateTo)   data = data.filter((s: any) => s.createdAt <= dateTo + "T23:59:59");
    if (shippingCompany !== "all") data = data.filter((s: any) => String(s.shippingCompanyId) === shippingCompany);
    return data;
  }, [warehouseShipmentsData, dateFrom, dateTo, shippingCompany]);

  // tabMap: لكل tab نجمع الشحنات اللي status بتاعتها موجود في statuses[] بتاعت الـ tab
  const tabMap = useMemo(() => {
    const result: Record<TabId, any[]> = {} as any;
    for (const tab of WAREHOUSE_TABS) {
      result[tab.id] = allWarehouseShipments.filter((sh: any) => (tab.statuses as readonly string[]).includes(sh.status));
    }
    return result;
  }, [allWarehouseShipments]);

  // للـ KPIs نستخدم tabMap
  const activeTab_def = WAREHOUSE_TABS.find(t => t.id === activeTab)!;

  // ── KPI aggregations ──────────────────────────────────────────────────────
  const activeCount    = tabMap.warehouse_ready?.length ?? 0;
  const inTransitCount = 0; // لا يوجد تاب "قيد الشحن" منفصل في هذا الـ view بعد التبسيط
  const returnedCount  = tabMap.returned?.length ?? 0;
  const deliveredCount = 0; // لا يوجد تاب "استلم" في هذا الـ view بعد التبسيط
  const totalAll       = WAREHOUSE_TABS.reduce((s, t) => s + (tabMap[t.id]?.length ?? 0), 0);

  const activeCOD  = (tabMap.warehouse_ready ?? [])
    .reduce((s: number, sh: any) => s + (Number(sh.codAmount) || 0), 0);
  const transitCOD = 0;
  const deliveredCOD = 0;

  // ── SLA: شحنات نشطة تجاوزت الحد الحرج (مرتبة من الأقدم) ──────────────────
  const slaBreaches = useMemo(() => {
    const activeSh = [...(tabMap.warehouse_ready ?? [])];
    return activeSh.map((sh: any) => ({
        ...sh,
        _ageHours: hoursSince(sh.updatedAt ?? sh.createdAt),
        _ageLevel: getAgeLevel(sh.status, hoursSince(sh.updatedAt ?? sh.createdAt)),
      }))
      .filter((sh: any) => sh._ageLevel === "critical")
      .sort((a: any, b: any) => b._ageHours - a._ageHours);
  }, [tabMap]);
  const slaBreachCount = slaBreaches.length;
  const slaBreachCOD = slaBreaches.reduce((s: number, sh: any) => s + (Number(sh.codAmount) || 0), 0);

  // ── مطابقة الكاش: شحنات received لسه فلوسها متجمعتش بالكامل ─────────────
  // ملحوظة: تاب "استلم" اتشال من مستودع الشحنات، فمافيش شحنات received نتابعها هنا
  const cashReconciliation = useMemo(() => {
    const delivered: any[] = [];
    let pendingCOD = 0;
    let shortfallCount = 0;
    const byCompany: Record<string, { name: string; outstanding: number; count: number }> = {};


    for (const sh of delivered) {
      const expected = Number(sh.codAmount) || 0;
      const collected = Number(sh.collectedAmount) || 0;
      const diff = expected - collected;
      if (diff > 0.5) {
        pendingCOD += diff;
        shortfallCount += 1;
        const key = sh.shippingCompanyName ?? "بدون شركة شحن";
        if (!byCompany[key]) byCompany[key] = { name: key, outstanding: 0, count: 0 };
        byCompany[key].outstanding += diff;
        byCompany[key].count += 1;
      }
    }

    const companiesRanked = Object.values(byCompany).sort((a, b) => b.outstanding - a.outstanding);
    return { pendingCOD, shortfallCount, companiesRanked };
  }, []);

  // ── handlePrint: طباعة احترافية للجدول الحالي ────────────────────────────
  const handlePrint = (status: string, shipments: any[], statusLabel: string) => {
    const now = new Date().toLocaleString("ar-EG", { dateStyle: "full", timeStyle: "short" });
    const totalCOD = shipments.reduce((s, sh) => s + (Number(sh.codAmount) || 0), 0);
    const fmt = (n: number) => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
    const isActive = ["pending", "warehouse_ready", "in_shipping"].includes(status);

    const rows = shipments.map((sh, i) => {
      const age    = isActive ? hoursSince(sh.updatedAt ?? sh.createdAt) : null;
      const ageStr = age !== null ? formatAge(age) : null;
      const level  = age !== null ? getAgeLevel(sh.status, age) : "ok";
      const ageColor = level === "critical" ? "#dc2626" : level === "warn" ? "#d97706" : "#374151";
      return `<tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">
        <td style="padding:10px 14px;font-weight:700;color:#9ca3af;font-size:13px;white-space:nowrap;">${i + 1}</td>
        <td style="padding:10px 14px;">
          <div style="font-size:14px;font-weight:700;color:#111827;">${sh.senderName ?? "—"}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">${sh.senderPhone ?? ""}</div>
        </td>
        <td style="padding:10px 14px;">
          <div style="font-size:14px;font-weight:600;color:#111827;">${sh.receiverName ?? "—"}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">${sh.receiverPhone ?? ""}</div>
        </td>
        <td style="padding:10px 14px;font-size:13px;color:#374151;white-space:nowrap;">${sh.receiverCity ?? sh.zoneGovernorate ?? "—"}</td>
        <td style="padding:10px 14px;font-size:15px;font-weight:900;color:#059669;white-space:nowrap;">${fmt(sh.codAmount)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#6b7280;">${sh.shippingCompanyName ?? "—"}</td>
        <td style="padding:10px 14px;font-size:12px;font-family:monospace;color:#9ca3af;">${sh.trackingNumber ?? sh.shipmentNumber ?? "—"}</td>
        ${ageStr !== null ? `<td style="padding:10px 14px;font-size:13px;font-weight:700;color:${ageColor};white-space:nowrap;">${ageStr}</td>` : ""}
      </tr>`;
    }).join("");

    const ageHeader = isActive ? `<th style="padding:12px 14px;text-align:right;font-size:13px;font-weight:700;color:#fff;white-space:nowrap;">العمر</th>` : "";

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>تقرير المخزون — ${statusLabel}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      color: #111827;
      background: #fff;
      font-size: 14px;
    }

    /* ─── Header ─── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 16px;
      margin-bottom: 20px;
      border-bottom: 2px solid #111827;
    }
    .brand-name {
      font-size: 36px;
      font-weight: 900;
      letter-spacing: -2px;
      color: #111827;
      line-height: 1;
    }
    .brand-sub {
      font-size: 13px;
      color: #6b7280;
      font-weight: 500;
      margin-top: 5px;
    }
    .header-meta {
      text-align: left;
    }
    .status-pill {
      display: inline-block;
      background: #1e293b;
      color: #fff;
      font-size: 14px;
      font-weight: 800;
      padding: 5px 16px;
      border-radius: 999px;
      margin-bottom: 8px;
    }
    .header-meta-row {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.9;
    }

    /* ─── Summary ─── */
    .summary {
      display: flex;
      gap: 14px;
      margin-bottom: 22px;
    }
    .sc {
      flex: 1;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 14px 16px;
      background: #f9fafb;
    }
    .sc-label {
      font-size: 11px;
      color: #9ca3af;
      font-weight: 600;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .sc-value {
      font-size: 26px;
      font-weight: 900;
      color: #111827;
      line-height: 1;
    }
    .sc-value.green { color: #059669; }

    /* ─── Table ─── */
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      overflow: hidden;
    }
    thead tr {
      background: #1e293b;
    }
    thead th {
      padding: 12px 14px;
      text-align: right;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
    }
    tbody tr:last-child td {
      border-bottom: none;
    }
    tbody td {
      border-bottom: 1px solid #f1f5f9;
    }

    /* ─── Footer ─── */
    .footer {
      margin-top: 22px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #9ca3af;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead tr { background: #1e293b !important; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="brand-name">STARK</div>
      <div class="brand-sub">نظام إدارة الشحنات</div>
    </div>
    <div class="header-meta">
      <div class="status-pill">${statusLabel}</div>
      <div class="header-meta-row">تاريخ الطباعة: ${now}</div>
      <div class="header-meta-row">إجمالي الشحنات: <strong>${shipments.length}</strong></div>
    </div>
  </div>

  <div class="summary">
    <div class="sc">
      <div class="sc-label">عدد الشحنات</div>
      <div class="sc-value">${shipments.length}</div>
    </div>
    <div class="sc">
      <div class="sc-label">إجمالي COD</div>
      <div class="sc-value green">${fmt(totalCOD)}</div>
    </div>
    <div class="sc">
      <div class="sc-label">شركات الشحن</div>
      <div class="sc-value">${new Set(shipments.map(s => s.shippingCompanyName).filter(Boolean)).size}</div>
    </div>
    <div class="sc">
      <div class="sc-label">مدن التوصيل</div>
      <div class="sc-value">${new Set(shipments.map(s => s.receiverCity ?? s.zoneGovernorate).filter(Boolean)).size}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="padding:12px 14px;text-align:right;font-size:13px;font-weight:700;color:#fff;">#</th>
        <th style="padding:12px 14px;text-align:right;font-size:13px;font-weight:700;color:#fff;">المُرسِل</th>
        <th style="padding:12px 14px;text-align:right;font-size:13px;font-weight:700;color:#fff;">المستلم</th>
        <th style="padding:12px 14px;text-align:right;font-size:13px;font-weight:700;color:#fff;white-space:nowrap;">المدينة</th>
        <th style="padding:12px 14px;text-align:right;font-size:13px;font-weight:700;color:#fff;white-space:nowrap;">COD</th>
        <th style="padding:12px 14px;text-align:right;font-size:13px;font-weight:700;color:#fff;">شركة الشحن</th>
        <th style="padding:12px 14px;text-align:right;font-size:13px;font-weight:700;color:#fff;white-space:nowrap;">رقم التتبع</th>
        ${ageHeader}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    <span>STARK — نظام إدارة الشحنات</span>
    <span>${now}</span>
  </div>

  <script>window.onload = function(){ window.focus(); window.print(); };<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  // ── Phase 4: تنبيهات استباقية ─────────────────────────────────────────────
  // 1) شحنات ستتجاوز SLA خلال 24 ساعة القادمة
  const upcomingSlaWarnings = useMemo(() => {
    const activeSh = [
      ...(tabMap.pending ?? []),
      ...(tabMap.warehouse_ready ?? []),
      ...(tabMap.in_shipping ?? []),
    ];
    return activeSh.map((sh: any) => {
        const ageHours = hoursSince(sh.updatedAt ?? sh.createdAt);
        const sla = SLA_HOURS[sh.status];
        if (!sla) return null;
        const hoursLeft = sla.warn - ageHours;
        if (hoursLeft > 0 && hoursLeft <= 24) return { ...sh, _hoursLeft: hoursLeft, _ageHours: ageHours };
        return null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a._hoursLeft - b._hoursLeft) as any[];
  }, [tabMap]);

  // 2) أنماط غريبة — شركة شحن معدل إرجاعها أعلى من المتوسط بـ 50%+
  const anomalousCompanies = useMemo(() => {
    // نجمع per-company: delivered count + returned count
    const compMap: Record<string, { name: string; delivered: number; returned: number }> = {};
    for (const sh of [...(tabMap.received ?? []), ...(tabMap.delayed ?? [])]) {
      const key = sh.shippingCompanyName ?? "بدون شركة";
      if (!compMap[key]) compMap[key] = { name: key, delivered: 0, returned: 0 };
      if (["received", "delivered"].includes(sh.status)) compMap[key].delivered += 1;
      else compMap[key].returned += 1;
    }
    const entries = Object.values(compMap).filter(c => c.delivered + c.returned >= 5); // نحتاج على الأقل 5 شحنات عشان النسبة تبقى ذات معنى
    if (entries.length < 2) return [];
    const avgReturnRate = entries.reduce((s, c) => s + c.returned / (c.delivered + c.returned), 0) / entries.length;
    return entries
      .map(c => ({ ...c, returnRate: c.returned / (c.delivered + c.returned) }))
      .filter(c => c.returnRate > avgReturnRate * 1.5 && c.returnRate > 0.1) // > 10% إرجاع وأعلى من المتوسط بـ 50%
      .sort((a, b) => b.returnRate - a.returnRate);
  }, [tabMap.received, tabMap.delayed]);

  // ── اسم المخزن لكل شحنة: بنطابق warehouseId مع قائمة المخازن ─────────────
  // شحنة "مرتجع" لسه في شركة الشحن (مفيهاش warehouseId) بنعرض ليها المخزن الافتراضي
  // (اللي المفروض تتسلم له) بدل ما تفضل الخانة فاضية
  const defaultWarehouseName = useMemo(() => {
    const def = warehouses.find((w: any) => w.isDefault);
    return def?.name ?? warehouses[0]?.name ?? null;
  }, [warehouses]);

  const getWarehouseName = (sh: any): string => {
    if (sh.warehouseId != null) {
      const w = warehouses.find((w: any) => w.id === sh.warehouseId);
      if (w) return w.name;
    }
    if (sh.status === "returned") {
      return defaultWarehouseName ? `${defaultWarehouseName} (متوقع)` : "—";
    }
    return "—";
  };

  // ── فلتر بحث client-side ─────────────────────────────────────────────────
  const activeShipments = useMemo(() => {
    let base = tabMap[activeTab] ?? [];
    const isActiveTab = ["pending", "warehouse_ready", "in_shipping"].includes(activeTab);
    base = base.map((sh: any) => {
      const ageHours = hoursSince(sh.updatedAt ?? sh.createdAt);
      return { ...sh, _ageHours: ageHours, _ageLevel: getAgeLevel(sh.status, ageHours), _warehouseName: getWarehouseName(sh) };
    });
    if (slaOnly) base = base.filter((sh: any) => sh._ageLevel === "critical" || sh._ageLevel === "warn");
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter((s: any) =>
      (s.senderName   ?? "").toLowerCase().includes(q) ||
      (s.receiverName ?? "").toLowerCase().includes(q) ||
      (s.receiverCity ?? "").toLowerCase().includes(q) ||
      (s.senderPhone  ?? "").includes(q) ||
      (s.receiverPhone?? "").includes(q) ||
      (s.shipmentNumber ?? "").toLowerCase().includes(q) ||
      (s.trackingNumber ?? "").toLowerCase().includes(q)
    );
  }, [tabMap, activeTab, search, slaOnly]);

  const activeTotalCOD = activeShipments.reduce((s: number, sh: any) => s + (Number(sh.codAmount) || 0), 0);
  const activeFiltersCount = [dateFrom, dateTo, shippingCompany !== "all", warehouseId !== "all"].filter(Boolean).length;
  const clearFilters = () => { setDateFrom(""); setDateTo(""); setShippingCompany("all"); setWarehouseId("all"); };

  return (
    <div className="space-y-3 sm:space-y-4">

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">

        {/* قيد الشحن في المخزن */}
        <Card onClick={() => setActiveTab("warehouse_ready")}
          className="border-cyan-200 dark:border-cyan-800/40 bg-cyan-50 dark:bg-cyan-900/10 p-3 sm:p-4 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all active:scale-100">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
              <PackageCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <span className="text-[9px] font-bold bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600/70 dark:text-cyan-400/70 px-1.5 py-0.5 rounded-full">بالمخزن</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400">{isLoading ? "—" : activeCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">قيد الشحن في المخزن</p>
          <p className="text-[10px] font-bold text-cyan-600/70 mt-1 truncate">{isLoading ? "" : fc2(activeCOD)}</p>
        </Card>

        {/* مرتجع */}
        <Card onClick={() => setActiveTab("returned")}
          className={`p-3 sm:p-4 border cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all active:scale-100 ${returnedCount > 0 ? "border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10" : "border-border bg-card"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${returnedCount > 0 ? "bg-red-500/15" : "bg-muted/30"}`}>
              <RotateCcw className={`w-4 h-4 ${returnedCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
            </div>
            {returnedCount > 0 && <span className="text-[9px] font-bold bg-red-100 dark:bg-red-900/30 text-red-600/70 px-1.5 py-0.5 rounded-full">مرتجع</span>}
          </div>
          <p className={`text-2xl sm:text-3xl font-black ${returnedCount > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{isLoading ? "—" : returnedCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">شحنة مرتجعة</p>
        </Card>

        {/* مؤجل */}
        <Card onClick={() => setActiveTab("delayed")}
          className={`p-3 sm:p-4 border cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all active:scale-100 ${(tabMap.delayed?.length ?? 0) > 0 ? "border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/10" : "border-border bg-card"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${(tabMap.delayed?.length ?? 0) > 0 ? "bg-orange-500/15" : "bg-muted/30"}`}>
              <AlertCircle className={`w-4 h-4 ${(tabMap.delayed?.length ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`} />
            </div>
            {(tabMap.delayed?.length ?? 0) > 0 && <span className="text-[9px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600/70 px-1.5 py-0.5 rounded-full">مؤجل</span>}
          </div>
          <p className={`text-2xl sm:text-3xl font-black ${(tabMap.delayed?.length ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>{isLoading ? "—" : (tabMap.delayed?.length ?? 0)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">شحنة مؤجلة</p>
        </Card>

        {/* تجاوزت SLA */}
        <Card onClick={() => setSlaOnly(v => !v)}
          className={`p-3 sm:p-4 border cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all active:scale-100 ${slaOnly ? "ring-2 ring-rose-500" : ""} ${slaBreachCount > 0 ? "border-rose-300 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-950/20" : "border-border bg-card"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${slaBreachCount > 0 ? "bg-rose-500/15" : "bg-muted/30"}`}>
              <AlertCircle className={`w-4 h-4 ${slaBreachCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`} />
            </div>
            {slaBreachCount > 0 && <span className="text-[9px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-600/70 px-1.5 py-0.5 rounded-full animate-pulse">عاجل</span>}
          </div>
          <p className={`text-2xl sm:text-3xl font-black ${slaBreachCount > 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{isLoading ? "—" : slaBreachCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">تجاوزت الوقت الطبيعي</p>
          <p className="text-[10px] font-bold text-rose-600/70 mt-1 truncate">{isLoading ? "" : fc2(slaBreachCOD)}</p>
        </Card>
      </div>

      {/* ── Phase 4: لوحة التنبيهات الاستباقية ─────────────────────────── */}
      {!isLoading && (upcomingSlaWarnings.length > 0 || anomalousCompanies.length > 0) && (
        <div className="space-y-2">

          {/* تنبيه 1: شحنات ستتجاوز الوقت المسموح خلال 24 ساعة */}
          {upcomingSlaWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/15 overflow-hidden">
              <div className="px-3 py-2 border-b border-amber-200 dark:border-amber-800/40 flex items-center gap-2">
                <Zap className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="text-[12px] font-bold text-amber-700 dark:text-amber-400">تنبيه استباقي — شحنات ستتأخر خلال 24 ساعة القادمة</span>
                <span className="mr-auto text-[10px] font-black bg-amber-200 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">{upcomingSlaWarnings.length}</span>
              </div>
              <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
                {upcomingSlaWarnings.slice(0, 5).map((sh: any) => {
                  const meta = SHIP_STATUS_META[sh.status];
                  return (
                    <div key={sh.id} className="flex items-center gap-2 px-3 py-2 hover:bg-amber-100/40 dark:hover:bg-amber-900/10 transition-colors">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta?.dot ?? "bg-amber-400"}`} />
                      <span className="text-[12px] font-semibold truncate flex-1">{sh.receiverName}</span>
                      <span className="text-[10px] text-muted-foreground hidden sm:inline truncate">{sh.shippingCompanyName ?? "—"}</span>
                      <span className={`text-[10px] font-bold shrink-0 px-2 py-0.5 rounded-full border ${meta?.bg ?? ""} ${meta?.border ?? ""} ${meta?.color ?? ""}`}>{meta?.label}</span>
                      <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 shrink-0 tabular-nums">
                        ⏱ {Math.ceil(sh._hoursLeft)} س
                      </span>
                    </div>
                  );
                })}
                {upcomingSlaWarnings.length > 5 && (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground text-center">
                    + {upcomingSlaWarnings.length - 5} شحنة أخرى
                  </div>
                )}
              </div>
            </div>
          )}

          {/* تنبيه 2: شركات شحن معدل إرجاعها مرتفع بشكل غير طبيعي */}
          {anomalousCompanies.length > 0 && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-700/50 bg-rose-50/60 dark:bg-rose-950/15 overflow-hidden">
              <div className="px-3 py-2 border-b border-rose-200 dark:border-rose-800/40 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span className="text-[12px] font-bold text-rose-700 dark:text-rose-400">نمط غير طبيعي — معدل إرجاع مرتفع</span>
                <span className="mr-auto text-[10px] font-black bg-rose-200 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">{anomalousCompanies.length} شركة</span>
              </div>
              <div className="divide-y divide-rose-100 dark:divide-rose-900/30">
                {anomalousCompanies.map((c: any) => (
                  <div key={c.name} className="flex items-center gap-2 px-3 py-2 hover:bg-rose-100/40 dark:hover:bg-rose-900/10 transition-colors">
                    <Truck className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span className="text-[12px] font-semibold truncate flex-1">{c.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{c.delivered + c.returned} شحنة</span>
                      <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 tabular-nums">
                        {Math.round(c.returnRate * 100)}% إرجاع
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SLA Filter Indicator */}
      {slaOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-300 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-950/20 px-3 py-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>عرض الشحنات المتأخرة فقط (تحذير + عاجل)</span>
          <button onClick={() => setSlaOnly(false)} className="mr-auto hover:underline">إلغاء الفلتر</button>
        </div>
      )}

      {/* ── Search + Filter Bar ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input placeholder="اسم المرسل · المستلم · المدينة · رقم الشحنة · التتبع..."
            className="pr-9 h-9 text-[12px] bg-card border-border w-full"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch("")} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <button onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[12px] font-bold transition-all shrink-0 ${showFilters || activeFiltersCount > 0 ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
          <Filter className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">فلتر</span>
          {activeFiltersCount > 0 && <span className="bg-white/20 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{activeFiltersCount}</span>}
        </button>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1"><WarehouseIcon className="w-3 h-3" /> المخزن</label>
              <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="all">كل المخازن</option>
                {warehouses.map((w: any) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" /> شركة الشحن</label>
              <select value={shippingCompany} onChange={e => setShippingCompany(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="all">الكل</option>
                {companies.map((c: any) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1"><Clock3 className="w-3 h-3" /> من تاريخ</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1"><Clock3 className="w-3 h-3" /> إلى تاريخ</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          {activeFiltersCount > 0 && <button onClick={clearFilters} className="flex items-center gap-1.5 text-[11px] font-bold text-destructive hover:underline"><X className="w-3 h-3" /> مسح الفلاتر</button>}
        </div>
      )}

      {/* ── Status Tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {WAREHOUSE_TABS.map(tab => {
          const Icon  = tab.icon;
          const count = tabMap[tab.id]?.length ?? 0;
          const isAct = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${isAct ? `${tab.bg} ${tab.border} ${tab.color} shadow-sm` : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${isAct ? "bg-white/30 dark:bg-black/20" : "bg-muted"}`}>
                {isLoading ? "…" : count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <Card className="border-border bg-card overflow-hidden">
        <div className={`px-3 sm:px-4 py-2.5 border-b flex items-center gap-2 ${activeTab_def.bg} ${activeTab_def.border}`}>
          {(() => { const Icon = activeTab_def.icon; return <Icon className={`w-4 h-4 shrink-0 ${activeTab_def.color}`} />; })()}
          <span className={`text-sm font-bold ${activeTab_def.color}`}>{activeTab_def.label}</span>
          <span className="text-xs text-muted-foreground mr-auto">{activeShipments.length} شحنة</span>
          {isLoading && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
          {/* ── زرار الطباعة ── */}
          {!isLoading && (
            <button
              onClick={() => handlePrint(activeTab, activeShipments, activeTab_def.label)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-bold text-muted-foreground hover:text-foreground transition-all print:hidden"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">طباعة</span>
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />)}</div>
        ) : activeShipments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
              <Package className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-bold text-muted-foreground">لا توجد شحنات</p>
            <p className="text-xs text-muted-foreground/60">{search ? `لا نتائج للبحث "${search}"` : `لا توجد شحنات بحالة "${activeTab_def.label}"`}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right px-3 sm:px-4 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap">المُرسِل</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap">المستلم</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap hidden sm:table-cell">المدينة</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap">COD</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap hidden md:table-cell">شركة الشحن</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap hidden lg:table-cell">رقم التتبع</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap hidden md:table-cell">المخزن</th>
                  <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap">الحالة</th>
                  {["pending", "warehouse_ready", "in_shipping"].includes(activeTab) && (
                    <th className="text-right px-3 py-2.5 text-[10px] sm:text-[11px] font-bold text-muted-foreground whitespace-nowrap hidden sm:table-cell">العمر</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeShipments.map((sh: any, idx: number) => {
                  const meta = SHIP_STATUS_META[sh.status] ?? SHIP_STATUS_META["waiting"];
                  return (
                    <tr key={sh.id} className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${idx % 2 !== 0 ? "bg-muted/5" : ""}`}>
                      <td className="px-3 sm:px-4 py-2.5">
                        <p className="font-bold text-[12px] leading-tight line-clamp-1">{sh.senderName ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{sh.senderPhone ?? ""}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-[12px] font-semibold line-clamp-1">{sh.receiverName ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{sh.receiverPhone ?? ""}</p>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell whitespace-nowrap">
                        <span className="text-[11px] font-semibold">{sh.receiverCity ?? sh.zoneGovernorate ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-[12px] font-black text-emerald-600 dark:text-emerald-400">{fc2(sh.codAmount)}</span>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell whitespace-nowrap">
                        <span className="text-[11px] text-muted-foreground">{sh.shippingCompanyName ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell whitespace-nowrap">
                        <span className="text-[10px] font-mono text-muted-foreground">{sh.trackingNumber ?? sh.shipmentNumber ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell whitespace-nowrap">
                        <span className="text-[11px] font-semibold">{sh._warehouseName ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${meta.bg} ${meta.border} ${meta.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                          <span className="hidden sm:inline">{meta.label}</span>
                        </span>
                      </td>
                      {["pending", "warehouse_ready", "in_shipping"].includes(activeTab) && (
                        <td className="px-3 py-2.5 hidden sm:table-cell whitespace-nowrap">
                          <span className={`text-[11px] ${AGE_LEVEL_STYLE[sh._ageLevel as AgeLevel ?? "ok"]}`}>
                            {formatAge(sh._ageHours ?? 0)}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Cash Reconciliation: مطابقة الكاش مع شركات الشحن ──────────────── */}
      {!isLoading && cashReconciliation.shortfallCount > 0 && (
        <Card className="border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/10 overflow-hidden">
          <div className="px-3 sm:px-4 py-2.5 border-b border-amber-200 dark:border-amber-800/40 flex items-center gap-2">
            <Wallet className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">مطابقة الكاش — شحنات مُسلَّمة وفلوسها ناقصة</span>
            <span className="text-xs text-muted-foreground mr-auto">{cashReconciliation.shortfallCount} شحنة</span>
          </div>
          <div className="p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-card border border-border px-3 py-2.5">
              <span className="text-[12px] font-bold text-muted-foreground">إجمالي الكاش المعلّق</span>
              <span className="text-lg font-black text-amber-600 dark:text-amber-400">{fc2(cashReconciliation.pendingCOD)}</span>
            </div>
            {cashReconciliation.companiesRanked.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-muted-foreground">حسب شركة الشحن (الأكثر مديونية أولاً)</p>
                {cashReconciliation.companiesRanked.slice(0, 6).map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-2 rounded-lg bg-card/60 border border-border/60 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[12px] font-semibold truncate">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">({c.count} شحنة)</span>
                    </div>
                    <span className="text-[12px] font-black text-amber-600 dark:text-amber-400 shrink-0">{fc2(c.outstanding)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Summary Footer ───────────────────────────────────────────────── */}
      {!isLoading && activeShipments.length > 0 && (
        <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-4 py-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-muted-foreground">{activeShipments.length} شحنة</span>
            {activeFiltersCount > 0 && <span className="text-muted-foreground/60">· بعد الفلتر</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">إجمالي COD:</span>
            <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">{fc2(activeTotalCOD)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Parcel Types Tab (منقولة من parcel-types.tsx) ──────────────────────────
type ParcelTypeKey = "document" | "normal" | "fragile" | "heavy" | "electronics" | "clothing" | "food" | "other";
interface ParcelTypePricingItem { id: number; parcelType: ParcelTypeKey; label?: string; basePrice: string | number; imageUrl?: string | null }

const PARCEL_LABELS_MAP: Record<ParcelTypeKey, string> = {
  document: "مستندات", normal: "طرد عادي", fragile: "قابل للكسر",
  heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس",
  food: "طعام", other: "أخري",
};
const PARCEL_ICONS: Record<string, string> = {
  document: "📄", normal: "📦", fragile: "🔮", heavy: "⚖️",
  electronics: "💻", clothing: "👕", food: "🍱", other: "📫",
};

function compressParcelImage(file: File, onDone: (b64: string) => void, onStart?: () => void) {
  if (!file.type.startsWith("image/")) return;
  onStart?.();
  const reader = new FileReader();
  reader.onload = (e) => {
    const src = e.target?.result as string;
    const img = new Image();
    img.onload = () => {
      const MAX = 400;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      onDone(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = src;
  };
  reader.readAsDataURL(file);
}

// ─── Status helpers for ParcelTypesTab ───────────────────────────────────────
const SHIPMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  waiting:          { label: "في الانتظار",       color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  pending:          { label: "في الانتظار",       color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  confirmed:        { label: "مؤكدة",             color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  warehouse_ready:  { label: "جاهزة بالمخزن",    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  picked_up:        { label: "جاهزة بالمخزن",    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  in_transit:       { label: "في الطريق",         color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  in_shipping:      { label: "في الطريق",         color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  out_for_delivery: { label: "مع المندوب",        color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  delivered:        { label: "تم التسليم",        color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  received:         { label: "تم التسليم",        color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  returned:         { label: "مرتجع",             color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  cancelled:        { label: "ملغية",             color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
};
function getStatusInfo(status: string) {
  return SHIPMENT_STATUS_LABELS[status] ?? { label: status, color: "bg-muted text-muted-foreground" };
}

function ParcelTypesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editPrices, setEditPrices] = useState<Record<number, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newImage, setNewImage] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [editImgId, setEditImgId] = useState<number | null>(null);
  const [editImgPreview, setEditImgPreview] = useState<string | null>(null);
  const [savingImg, setSavingImg] = useState(false);
  const [expandedWarehouse, setExpandedWarehouse] = useState<number | null>(null);

  // جلب المخازن
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-parcel-tab"],
    queryFn:  () => warehousesApi.list(),
    staleTime: 5 * 60_000,
  });

  // جلب الشحنات (كل الحالات) لكل المخازن مرة واحدة — محتاجينها كلها عشان نحسب
  // إجمالي الإيرادات (المبلغ المُحصَّل فعلاً) وليس بس الشحنات النشطة
  const { data: allShipmentsData } = useQuery({
    queryKey: ["parcel-tab-shipments-all", warehouses.map(w => w.id).join(",")],
    queryFn: async () => {
      if (!warehouses.length) return [];
      const results = await Promise.all(
        warehouses.map(w => warehousesApi.shipments(w.id, "all"))
      );
      // ندمج مع معرف المخزن
      return results.flatMap((res, i) =>
        (res.shipments ?? []).map(s => ({ ...s, _warehouseId: warehouses[i].id, _warehouseName: warehouses[i].name }))
      );
    },
    enabled: warehouses.length > 0,
    staleTime: 60_000,
  });
  const allShipments = allShipmentsData ?? [];

  const { data: pricing = [], isLoading } = useQuery({
    queryKey: ["parcel-type-pricing"],
    queryFn: () => import("@/lib/api").then(m => m.apiFetch<ParcelTypePricingItem[]>("/parcel-type-pricing")),
    staleTime: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] });

  const callApi = async (path: string, opts?: RequestInit) => {
    const token = localStorage.getItem("caprina_token") || localStorage.getItem("token");
    const r = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...opts,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || r.statusText); }
    return r.json();
  };

  const initMutation = useMutation({
    mutationFn: () => callApi("/parcel-type-pricing/init", { method: "POST" }),
    onSuccess: () => { invalidate(); toast({ title: "تمت التهيئة ✅" }); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, basePrice }: { id: number; basePrice: number }) =>
      callApi(`/parcel-type-pricing/${id}`, { method: "PUT", body: JSON.stringify({ basePrice }) }),
    onSuccess: () => { invalidate(); toast({ title: "تم التحديث ✅" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });
  const addMutation = useMutation({
    mutationFn: (d: any) => callApi("/parcel-type-pricing", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      invalidate(); toast({ title: "تمت الإضافة ✅" });
      setAddOpen(false); setNewType(""); setNewLabel(""); setNewPrice(""); setNewImage(null);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => callApi(`/parcel-type-pricing/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "تم الحذف" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const handleSaveImage = async (id: number) => {
    if (!editImgPreview) return;
    setSavingImg(true);
    try {
      await callApi(`/parcel-type-pricing/${id}`, { method: "PUT", body: JSON.stringify({ imageUrl: editImgPreview }) });
      invalidate(); toast({ title: "تم حفظ الصورة ✅" });
      setEditImgId(null); setEditImgPreview(null);
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setSavingImg(false); }
  };
  const handleRemoveImage = async (id: number) => {
    setSavingImg(true);
    try {
      await callApi(`/parcel-type-pricing/${id}`, { method: "PUT", body: JSON.stringify({ imageUrl: null }) });
      invalidate(); toast({ title: "تم حذف الصورة" });
      setEditImgId(null); setEditImgPreview(null);
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setSavingImg(false); }
  };

  return (
    <div className="space-y-4" dir="rtl">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-black flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-500" /> أنواع الشحنات وأسعارها
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">السعر الإجمالي = سعر المنطقة + سعر النوع + رسوم التأمين</p>
        </div>
        <div className="flex gap-2">
          {pricing.length === 0 && (
            <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8"
              onClick={() => initMutation.mutate()} disabled={initMutation.isPending}>
              {initMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              تهيئة الأسعار الافتراضية
            </Button>
          )}
          <Button size="sm" className="text-xs gap-1.5 h-8" onClick={() => setAddOpen(true)}>
            <Plus className="w-3 h-3" /> إضافة نوع جديد
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      {pricing.length > 0 && (() => {
        const totalShipmentsAll = allShipments.length;
        const totalRevenueAll = allShipments.reduce((s, sh) => s + (Number((sh as any).shippingFee) || 0), 0);
        const maxPrice = Math.max(...pricing.map(p => Number(p.basePrice)));
        const minPrice = Math.min(...pricing.map(p => Number(p.basePrice)));
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Card className="border-violet-200 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-900/10 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                  <Layers className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">إجمالي الأنواع</p>
              </div>
              <p className="text-2xl font-black text-violet-600 dark:text-violet-400">{pricing.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">نوع شحنة مُعرَّف</p>
            </Card>
            <Card className="border-primary/20 dark:border-primary/30 bg-primary/5 dark:bg-primary/10 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Truck className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">الشحنات (كل الحالات)</p>
              </div>
              <p className="text-2xl font-black text-primary">{totalShipmentsAll}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">عبر كل الأنواع</p>
            </Card>
            <Card className="border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/10 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <CircleDollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">إجمالي الإيرادات</p>
              </div>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{totalRevenueAll > 0 ? totalRevenueAll.toLocaleString() : "—"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">جنيه</p>
            </Card>
            <Card className="border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">نطاق الأسعار</p>
              </div>
              <p className="text-lg font-black text-amber-600 dark:text-amber-400">{minPrice} – {maxPrice}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">جنيه (أدنى – أعلى)</p>
            </Card>
          </div>
        );
      })()}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin opacity-40" />
          <span>جاري التحميل...</span>
        </div>
      ) : pricing.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm flex flex-col items-center gap-3">
          <Layers className="w-10 h-10 opacity-20" />
          <span>لا توجد أنواع — اضغط "تهيئة الأسعار الافتراضية" لإضافة الأنواع الـ 8</span>
        </div>
      ) : (
        <div className="space-y-3">
          {pricing.map(p => {
            const label = p.label || PARCEL_LABELS_MAP[p.parcelType as ParcelTypeKey] || p.parcelType;
            const icon  = PARCEL_ICONS[p.parcelType] ?? "📦";
            const isOpen = selectedId === p.id;
            const currentPrice = Number(editPrices[p.id] ?? p.basePrice);

            // شحنات هذا النوع مجمعة على المخازن
            const byWarehouse = warehouses.map(wh => ({
              wh,
              shipments: allShipments.filter(s =>
                s._warehouseId === wh.id &&
                (s.parcelType === p.parcelType || (!s.parcelType && p.parcelType === "normal"))
              ),
            })).filter(g => g.shipments.length > 0);
            const totalShipCount = byWarehouse.reduce((n, g) => n + g.shipments.length, 0);
            const totalRevenue = byWarehouse.flatMap(g => g.shipments).reduce((s, sh) => s + (Number((sh as any).shippingFee) || 0), 0);

            return (
              <Card key={p.id} className={`overflow-hidden border transition-all ${isOpen ? "border-violet-400 dark:border-violet-600 shadow-sm" : "border-border"}`}>

                {/* ── Card Header (icons + clickable toggle) ────────────── */}
                <div className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors">
                  {/* أيقونات: حذف + تعديل (زي تصميم صفحة المنتجات) */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={(e) => { e.stopPropagation(); if (confirm("حذف هذا النوع؟")) { deleteMutation.mutate(p.id); setSelectedId(null); } }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditImgId(p.id);
                        setEditImgPreview(null);
                      }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <button
                    type="button"
                    className="flex-1 min-w-0 flex items-center gap-3 text-right"
                    onClick={() => { setSelectedId(isOpen ? null : p.id); setExpandedWarehouse(null); }}
                  >
                  {/* أيقونة/صورة */}
                  <div className={`w-11 h-11 rounded-xl overflow-hidden border-2 shrink-0 flex items-center justify-center
                    ${isOpen ? "border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20" : "border-border bg-muted/20"}`}>
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={label} className="w-full h-full object-cover" />
                      : <span className="text-2xl">{icon}</span>}
                  </div>

                  {/* اسم + نوع */}
                  <div className="flex-1 min-w-0 text-right">
                    <p className={`text-sm font-black truncate ${isOpen ? "text-violet-700 dark:text-violet-300" : ""}`}>{label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{p.parcelType}</p>
                  </div>

                  {/* stats chips */}
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-black text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-2.5 py-1 rounded-full">
                      {Number(p.basePrice)} ج
                    </span>
                    {totalShipCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-black text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                        <Package className="w-3 h-3" />{totalShipCount} شحنة
                      </span>
                    )}
                    {totalRevenue > 0 && (
                      <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full">
                        {totalRevenue.toLocaleString()} ج
                      </span>
                    )}
                  </div>

                  {/* mobile: price only */}
                  <div className="flex sm:hidden items-center gap-2 shrink-0">
                    <span className="text-xs font-black text-violet-600 dark:text-violet-400">{Number(p.basePrice)} ج</span>
                    {totalShipCount > 0 && (
                      <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">{totalShipCount}</span>
                    )}
                  </div>

                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-violet-500 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
                </div>

                {/* ── Expanded Body ──────────────────────────────────────── */}
                {isOpen && (
                  <div className="border-t border-border/60">

                    {/* ── Stats Row ────────────────────────────────────── */}
                    <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border/60 bg-muted/10">
                      <div className="px-4 py-3 text-center">
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">السعر الإضافي</p>
                        <p className="text-xl font-black text-violet-600 dark:text-violet-400">{Number(p.basePrice)} <span className="text-xs font-bold">ج</span></p>
                      </div>
                      <div className="px-4 py-3 text-center">
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">الشحنات (كل الحالات)</p>
                        <p className="text-xl font-black text-primary">{totalShipCount}</p>
                      </div>
                      <div className="px-4 py-3 text-center">
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">إجمالي الإيرادات</p>
                        <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{totalRevenue > 0 ? `${totalRevenue.toLocaleString()}` : "—"}</p>
                        {totalRevenue > 0 && <p className="text-[10px] text-muted-foreground">جنيه</p>}
                      </div>
                    </div>

                    {/* ── الشحنات بالمخازن ─────────────────────────────── */}
                    <div className="border-t border-border/60">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20">
                        <Truck className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-bold">الشحنات بالمخازن</span>
                        {totalShipCount > 0 && (
                          <span className="bg-primary text-primary-foreground text-[10px] font-black px-2 py-0.5 rounded-full">{totalShipCount}</span>
                        )}
                      </div>

                      {allShipmentsData === undefined ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground p-5 justify-center">
                          <RefreshCw className="w-4 h-4 animate-spin" /> جاري التحميل...
                        </div>
                      ) : byWarehouse.length === 0 ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-5">
                          <PackageX className="w-5 h-5 opacity-30" />
                          <span>لا توجد شحنات من هذا النوع</span>
                        </div>
                      ) : (
                        <div className="divide-y divide-border/50">
                          {byWarehouse.map(({ wh, shipments: wShipments }) => {
                            const isWhOpen = expandedWarehouse === wh.id;
                            const whRevenue = wShipments.reduce((s, sh) => s + (Number((sh as any).collectedAmount) || 0), 0);
                            return (
                              <div key={wh.id}>
                                {/* رأس المخزن */}
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-right"
                                  onClick={() => setExpandedWarehouse(isWhOpen ? null : wh.id)}
                                >
                                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <WarehouseIcon className="w-3.5 h-3.5 text-primary" />
                                  </div>
                                  <span className="flex-1 text-sm font-bold">{wh.name}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {whRevenue > 0 && (
                                      <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                        {whRevenue.toLocaleString()} ج
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1 text-[11px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                                      <Package className="w-3 h-3" />{wShipments.length}
                                    </span>
                                    {isWhOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                  </div>
                                </button>

                                {/* جدول الشحنات */}
                                {isWhOpen && (
                                  <div className="bg-muted/10">
                                    <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1fr_1.2fr_auto] gap-2 px-4 py-2 bg-muted/30 border-y border-border/50 text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                      <span>المرسل / رقم الشحنة</span>
                                      <span>المستلم</span>
                                      <span>المدينة</span>
                                      <span>الحالة</span>
                                      <span className="text-left min-w-[72px]">الإيراد</span>
                                    </div>
                                    <div className="divide-y divide-border/40">
                                      {wShipments.map((s, idx) => {
                                        const st = getStatusInfo((s as any).status);
                                        return (
                                          <div key={(s as any).id ?? idx} className="px-4 py-2.5 hover:bg-muted/20 transition-colors">
                                            {/* Desktop */}
                                            <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1fr_1.2fr_auto] gap-2 items-center">
                                              <div className="min-w-0">
                                                <p className="text-xs font-semibold truncate">{(s as any).senderName ?? "—"}</p>
                                                {(s as any).shipmentNumber && (
                                                  <p className="text-[10px] text-muted-foreground font-mono">{(s as any).shipmentNumber}</p>
                                                )}
                                              </div>
                                              <div className="min-w-0">
                                                <p className="text-xs truncate">{(s as any).receiverName ?? "—"}</p>
                                                {(s as any).receiverPhone && (
                                                  <p className="text-[10px] text-muted-foreground">{(s as any).receiverPhone}</p>
                                                )}
                                              </div>
                                              <p className="text-xs text-muted-foreground truncate">{(s as any).receiverCity ?? "—"}</p>
                                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${st.color}`}>{st.label}</span>
                                              <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 min-w-[72px] text-left">
                                                {(s as any).collectedAmount ? `${Number((s as any).collectedAmount).toLocaleString()} ج` : "—"}
                                              </p>
                                            </div>
                                            {/* Mobile */}
                                            <div className="sm:hidden flex items-start gap-2">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <p className="text-xs font-semibold">{(s as any).senderName ?? "—"}</p>
                                                  {(s as any).shipmentNumber && (
                                                    <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded font-mono">{(s as any).shipmentNumber}</span>
                                                  )}
                                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                  → {(s as any).receiverName ?? "—"} · {(s as any).receiverCity ?? "—"}
                                                </p>
                                              </div>
                                              {(s as any).collectedAmount && (
                                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                                                  {Number((s as any).collectedAmount).toLocaleString()} ج
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add Dialog ───────────────────────────────────────────────────── */}
      {addOpen && (
        <Dialog open onOpenChange={() => { setAddOpen(false); setNewImage(null); }}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-sm font-black flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-500" /> إضافة نوع شحنة جديد
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-bold mb-1.5 block">المعرف (بالإنجليزية) *</Label>
                <Input className="text-sm" placeholder="مثال: special" value={newType}
                  onChange={e => setNewType(e.target.value.toLowerCase().replace(/\s/g, "_"))} />
                <p className="text-[10px] text-muted-foreground mt-1">حروف إنجليزية صغيرة وشرطة سفلية فقط</p>
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">الاسم بالعربية *</Label>
                <Input className="text-sm" placeholder="مثال: شحنة خاصة" value={newLabel}
                  onChange={e => setNewLabel(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">السعر الإضافي (جنيه) *</Label>
                <Input type="number" className="text-sm" placeholder="0" value={newPrice}
                  onChange={e => setNewPrice(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">صورة (اختياري)</Label>
                <div
                  className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer
                    ${newImage ? "border-primary/50 bg-primary/5" : "border-border bg-muted/10 hover:border-primary/40"}`}
                  onClick={() => document.getElementById("pimg-new")?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) compressParcelImage(f, setNewImage, () => setUploadingImg(true)); }}
                >
                  <input id="pimg-new" type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) compressParcelImage(f, (b) => { setNewImage(b); setUploadingImg(false); }, () => setUploadingImg(true)); }} />
                  {newImage ? (
                    <div className="flex items-center gap-3 p-3">
                      <img src={newImage} alt="preview" className="w-16 h-16 rounded-lg object-cover border border-border shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-primary">تم اختيار الصورة ✅</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">اضغط لتغييرها</p>
                      </div>
                      <button type="button" className="text-muted-foreground hover:text-destructive p-1"
                        onClick={e => { e.stopPropagation(); setNewImage(null); }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      {uploadingImg ? <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" /> : (
                        <>
                          <LucideImage className="w-8 h-8 text-muted-foreground/40" />
                          <p className="text-xs text-muted-foreground">اسحب صورة أو اضغط للاختيار</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-1 border-t border-border">
                <Button variant="outline" className="flex-1 text-xs" onClick={() => { setAddOpen(false); setNewImage(null); }}>إلغاء</Button>
                <Button className="flex-1 text-xs gap-1.5"
                  disabled={!newType || !newLabel || !newPrice || addMutation.isPending || uploadingImg}
                  onClick={() => addMutation.mutate({ parcelType: newType, label: newLabel, basePrice: Number(newPrice), isActive: true, imageUrl: newImage })}>
                  {addMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  إضافة
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Edit Dialog (صورة + سعر إضافي) ─────────────────────────────────── */}
      {editImgId !== null && (() => {
        const p = pricing.find(x => x.id === editImgId);
        if (!p) return null;
        const label = p.label || PARCEL_LABELS_MAP[p.parcelType as ParcelTypeKey] || p.parcelType;
        const icon  = PARCEL_ICONS[p.parcelType] ?? "📦";
        return (
          <Dialog open onOpenChange={() => { setEditImgId(null); setEditImgPreview(null); }}>
            <DialogContent className="max-w-sm" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-sm font-black flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-violet-500" /> تعديل {label}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* صورة */}
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">الصورة</Label>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <input id={`pimg-${p.id}`} type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]; if (!f) return;
                          compressParcelImage(f, (b64) => setEditImgPreview(b64));
                          e.target.value = "";
                        }} />
                      <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-border shadow-sm">
                        {editImgPreview
                          ? <img src={editImgPreview} className="w-full h-full object-cover" alt="preview" />
                          : p.imageUrl
                            ? <img src={p.imageUrl} className="w-full h-full object-cover" alt={label} />
                            : <span className="w-full h-full flex items-center justify-center text-3xl bg-muted/20">{icon}</span>
                        }
                      </div>
                      <button type="button"
                        className="absolute -bottom-1.5 -left-1.5 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center shadow hover:bg-primary/80 transition-colors"
                        onClick={() => document.getElementById(`pimg-${p.id}`)?.click()}>
                        <LucideImage className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {editImgPreview ? (
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-[11px] px-3 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleSaveImage(p.id)} disabled={savingImg}>
                            {savingImg ? <RefreshCw className="w-3 h-3 animate-spin" /> : "✓ حفظ الصورة"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2"
                            onClick={() => setEditImgPreview(null)}>إلغاء</Button>
                        </div>
                      ) : (
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-3 gap-1"
                            onClick={() => document.getElementById(`pimg-${p.id}`)?.click()}>
                            <LucideImage className="w-3 h-3" /> {p.imageUrl ? "تغيير الصورة" : "رفع صورة"}
                          </Button>
                          {p.imageUrl && (
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] px-3 gap-1 text-red-500 hover:text-red-600"
                              onClick={() => handleRemoveImage(p.id)} disabled={savingImg}>
                              <Trash2 className="w-3 h-3" /> حذف الصورة
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* السعر الإضافي */}
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">السعر الإضافي (جنيه)</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      type="number"
                      className="text-sm h-9 font-bold flex-1"
                      value={editPrices[p.id] ?? String(p.basePrice)}
                      onChange={e => setEditPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                    />
                    <span className="text-xs text-muted-foreground">ج</span>
                  </div>
                  {Number(editPrices[p.id] ?? p.basePrice) !== Number(p.basePrice) && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">كان: {Number(p.basePrice)} ج</p>
                  )}
                </div>

                <div className="flex gap-2 pt-1 border-t border-border">
                  <Button variant="outline" className="flex-1 text-xs"
                    onClick={() => { setEditImgId(null); setEditImgPreview(null); }}>إغلاق</Button>
                  <Button className="flex-1 text-xs gap-1.5"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ id: p.id, basePrice: Number(editPrices[p.id] ?? p.basePrice) })}>
                    {updateMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "✓ حفظ السعر"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
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
  const [activeTab, setActiveTab] = useState<"shipments" | "insights" | "parcel-types">("shipments");
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
            {activeTab === "parcel-types" ? "أنواع الطرود • الأسعار الإضافية • الصور" : activeTab === "shipments" ? "تتبع الشحنات • المستودع • المرتجعات" : "تحليلات الشحنات • الأداء • المناطق • المالي"}
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
          onClick={() => setActiveTab("parcel-types")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${
            activeTab === "parcel-types"
              ? "bg-background shadow-sm border border-border text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          أنواع الشحنات
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
      </div>

      {/* Shipment Warehouse Tab */}
      {activeTab === "shipments" && <ShipmentWarehouseTab />}

      {/* Shipment Insights Tab */}
      {activeTab === "insights" && <ShipmentInsightsTab />}

      {/* Parcel Types Tab */}
      {activeTab === "parcel-types" && <ParcelTypesTab />}

      {/* Products Tab removed */}
      {false && (<>

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
