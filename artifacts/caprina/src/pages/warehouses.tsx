import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Warehouse, Package, Edit2, Trash2, Star, ArrowLeft, Printer, TrendingDown, DollarSign, BoxIcon, ShoppingBag, Search, X, SlidersHorizontal, ChevronDown, ChevronUp, Wrench, Truck, ArrowLeftRight, UserCheck, Phone, PackageSearch, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "wouter";
import { warehousesApi, shippingApi, apiFetch, type Warehouse as WarehouseType, type WarehouseDetail, type WarehouseShipment, type ShippingCompany, productsApi, variantsApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/use-debounce";

const fmt = (n: number) =>
  new Intl.NumberFormat("ar-EG").format(n);

// ── تسميات أنواع الطرود ─────────────────────────────────────────────────────
const PARCEL_LABELS: Record<string, string> = {
  regular:    "عادي",
  fragile:    "قابل للكسر",
  clothes:    "ملابس",
  electronics:"إلكترونيات",
  documents:  "مستندات",
  food:       "أغذية",
  medicine:   "أدوية",
  heavy:      "ثقيل",
};

// ── ترجمة حالات الشحنات ─────────────────────────────────────────────────────
const SHIPMENT_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  waiting:          { label: "قيد الانتظار",       color: "text-muted-foreground", bg: "bg-muted/20" },
  confirmed:        { label: "مؤكدة",              color: "text-sky-600",          bg: "bg-sky-500/10" },
  picked_up:        { label: "تم الاستلام",         color: "text-blue-600",         bg: "bg-blue-500/10" },
  in_transit:       { label: "في الطريق",           color: "text-indigo-600",       bg: "bg-indigo-500/10" },
  out_for_delivery: { label: "مع المندوب",          color: "text-amber-600",        bg: "bg-amber-500/10" },
  warehouse_ready:  { label: "قيد الشحن بالمخزن",  color: "text-orange-600",       bg: "bg-orange-500/10" },
  delivered:        { label: "مسلّمة",             color: "text-emerald-600",      bg: "bg-emerald-500/10" },
  returned:         { label: "مرتجعة",             color: "text-red-600",          bg: "bg-red-500/10" },
  cancelled:        { label: "ملغية",              color: "text-gray-500",         bg: "bg-gray-500/10" },
  partial_delivered:{ label: "تسليم جزئي",          color: "text-violet-600",       bg: "bg-violet-500/10" },
};

function WarehouseFormDialog({
  open, onClose, existing,
}: {
  open: boolean; onClose: () => void; existing?: WarehouseType;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [saving, setSaving] = useState(false);

  // إعادة تعيين القيم كل ما يتغير المخزن المحدد أو يُفتح الـ dialog
  useEffect(() => {
    setName(existing?.name ?? "");
    setAddress(existing?.address ?? "");
    setCity(existing?.city ?? "");
    setNotes(existing?.notes ?? "");
    setIsDefault(existing?.isDefault ?? false);
  }, [existing, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "خطأ", description: "اسم المخزن مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await warehousesApi.update(existing.id, { name, address: address || null, city: city || null, notes: notes || null, isDefault });
        toast({ title: "تم تحديث المخزن" });
      } else {
        await warehousesApi.create({ name, address: address || null, city: city || null, notes: notes || null, isDefault });
        toast({ title: "تم إنشاء المخزن" });
      }
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      onClose();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>{existing ? "تعديل المخزن" : "إضافة مخزن جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">اسم المخزن *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="مخزن القاهرة" className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">المدينة</Label>
            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="القاهرة / الإسكندرية..." className="h-9 text-sm" />
            <div className="flex gap-1.5 pt-1">
              {["القاهرة", "الإسكندرية"].map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setCity(c)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${
                    city === c ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >{c}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">العنوان</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="شارع، تفاصيل العنوان..." className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="..." className="min-h-[60px] text-sm resize-none" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">مخزن افتراضي</Label>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-xs h-8">إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} className="text-xs h-8">{saving ? "جاري الحفظ..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── تحويل شحنة لمخزن آخر / تعيين مندوب ──────────────────────────────────────
function TransferShipmentDialog({
  shipment, currentWarehouseId, warehouses, shippingCompanies, onClose,
}: {
  shipment: WarehouseShipment;
  currentWarehouseId: number;
  warehouses: WarehouseType[];
  shippingCompanies: ShippingCompany[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [toWarehouseId, setToWarehouseId] = useState<string>(
    shipment.warehouseId ? String(shipment.warehouseId) : "none"
  );
  const [shippingCompanyId, setShippingCompanyId] = useState<string>(
    shipment.shippingCompanyId ? String(shipment.shippingCompanyId) : "none"
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isReturn = shipment.status === "returned";
  const isAssigningCourier = shippingCompanyId !== "none" && Number(shippingCompanyId) !== (shipment.shippingCompanyId ?? -1);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["warehouse-shipments"] });
    qc.invalidateQueries({ queryKey: ["warehouse-stats"] });
    qc.invalidateQueries({ queryKey: ["warehouses"] });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await warehousesApi.transferShipment({
        shipmentId: shipment.id,
        toWarehouseId: toWarehouseId === "none" ? null : Number(toWarehouseId),
        shippingCompanyId: shippingCompanyId === "none" ? null : Number(shippingCompanyId),
        notes: notes.trim() || undefined,
        // لو عيّنّا مندوب جديد وهو لسه في حالة انتظار/مؤكدة، خرّجها "خرجت للتسليم"
        newStatus: isAssigningCourier && ["waiting", "confirmed", "picked_up"].includes(shipment.status)
          ? "out_for_delivery"
          : undefined,
      });
      invalidateAll();
      toast({ title: "✅ تم تحديث الشحنة" });
      onClose();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            تحويل الشحنة {shipment.shipmentNumber ?? `#${shipment.id}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isReturn && shipment.returnReceived !== 1 && (
            <p className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md px-2.5 py-1.5">
              ⚠ هذه شحنة مرتجعة لسه لم تُستلم في أي مخزن — حدّد المخزن الذي ستستقبلها.
            </p>
          )}

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Warehouse className="w-3 h-3" />المخزن</Label>
            <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون مخزن —</SelectItem>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.name}{w.city ? ` — ${w.city}` : ""}{w.id === currentWarehouseId ? " (الحالي)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><UserCheck className="w-3 h-3" />المندوب (شركة الشحن)</Label>
            <Select value={shippingCompanyId} onValueChange={setShippingCompanyId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="بدون مندوب..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون مندوب —</SelectItem>
                {shippingCompanies.filter(c => c.isActive !== false).map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.phone ? ` — ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAssigningCourier && (
              <p className="text-[10px] text-sky-500 flex items-center gap-1">
                <Truck className="w-3 h-3" />سيتم تحويل حالة الشحنة إلى "خرجت للتسليم" مع المندوب
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">ملاحظة التحويل (اختياري)</Label>
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="سبب التحويل أو أي تفاصيل..."
              className="min-h-[60px] text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-xs h-8">إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} className="text-xs h-8 gap-1">
            <ArrowLeftRight className="w-3 h-3" />{saving ? "جاري الحفظ..." : "تأكيد التحويل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StockEditor({ warehouseId, onClose, canEdit }: { warehouseId: number; onClose: () => void; canEdit: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"stock" | "shipments">("stock");
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<"active" | "delivered" | "returned" | "all">("active");

  const { data: warehouse, isLoading } = useQuery({
    queryKey: ["warehouses", warehouseId],
    queryFn: () => warehousesApi.get(warehouseId),
    staleTime: 0,
    refetchInterval: 5000,
  });

  const { data: warehouseShipments, isLoading: loadingShipments } = useQuery({
    queryKey: ["warehouse-shipments", warehouseId, shipmentStatusFilter],
    queryFn: () => warehousesApi.shipments(warehouseId, shipmentStatusFilter),
    staleTime: 30_000,
    refetchInterval: activeTab === "shipments" ? 30_000 : false,
  });
  const { data: warehouseStats } = useQuery({
    queryKey: ["warehouse-stats", warehouseId],
    queryFn: () => warehousesApi.stats(warehouseId),
    staleTime: 30_000,
    enabled: activeTab === "shipments",
    refetchInterval: activeTab === "shipments" ? 30_000 : false,
  });
  const { data: allWarehouses } = useQuery({ queryKey: ["warehouses"], queryFn: warehousesApi.list, staleTime: 30_000 });
  const { data: shippingCompanies } = useQuery({ queryKey: ["shipping-companies"], queryFn: shippingApi.list, staleTime: 60_000 });
  const [transferShipmentId, setTransferShipmentId] = useState<number | null>(null);
  const [courierShipmentId, setCourierShipmentId] = useState<number | null>(null);
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: productsApi.list, staleTime: 0 });
  const { data: allVariants } = useQuery({ queryKey: ["variants-all"], queryFn: variantsApi.listAll, staleTime: 0, refetchInterval: 5000 });
  const [selectedProductId, setSelectedProductId] = useState<number | "">("");
  const [selectedVariantId, setSelectedVariantId] = useState<number | "">("");
  const [qty, setQty] = useState(0);
  const [adding, setAdding] = useState(false);

  // ── فلاتر البحث داخل المخزن ──────────────────────────────────────────────
  const [stockSearch, setStockSearch]         = useState("");
  const [showAdvanced, setShowAdvanced]       = useState(false);
  const [filterStockMin, setFilterStockMin]   = useState("");
  const [filterStockMax, setFilterStockMax]   = useState("");
  const [filterStockStatus, setFilterStockStatus] = useState<"all" | "low" | "ok" | "zero">("all");
  const debouncedStockSearch = useDebounce(stockSearch, 250);

  const productVariants = allVariants?.filter(v => v.productId === Number(selectedProductId)) ?? [];

  // ── حسابات المخزون ──────────────────────────────────────────────────────────
  const stockItems = warehouse?.stock ?? [];
  const totalUnits    = stockItems.reduce((s, i) => s + i.quantity, 0);
  const availableQty  = stockItems.filter(i => i.quantity > 0).reduce((s, i) => s + i.quantity, 0);
  const lowStockCount = stockItems.filter(i => i.quantity > 0 && i.quantity <= (i.lowStockThreshold ?? 5)).length;
  const stockValue    = stockItems.reduce((s, i) => s + i.quantity * (i.costPrice ?? i.unitPrice ?? 0), 0);

  // ── تطبيق الفلاتر على جدول المنتجات ─────────────────────────────────────
  const filteredStock = useMemo(() => {
    return stockItems.filter(item => {
      const q = debouncedStockSearch.toLowerCase();
      if (q) {
        const nameMatch    = item.productName?.toLowerCase().includes(q);
        const colorMatch   = item.variantColor?.toLowerCase().includes(q);
        const sizeMatch    = item.variantSize?.toLowerCase().includes(q);
        if (!nameMatch && !colorMatch && !sizeMatch) return false;
      }
      if (filterStockMin && item.quantity < parseFloat(filterStockMin)) return false;
      if (filterStockMax && item.quantity > parseFloat(filterStockMax)) return false;
      if (filterStockStatus === "zero" && item.quantity !== 0) return false;
      if (filterStockStatus === "low"  && !(item.quantity > 0 && item.quantity <= (item.lowStockThreshold ?? 5))) return false;
      if (filterStockStatus === "ok"   && !(item.quantity > (item.lowStockThreshold ?? 5))) return false;
      return true;
    });
  }, [stockItems, debouncedStockSearch, filterStockMin, filterStockMax, filterStockStatus]);

  const hasStockFilter = stockSearch || filterStockMin || filterStockMax || filterStockStatus !== "all";
  const advancedCount  = [filterStockMin, filterStockMax, filterStockStatus !== "all"].filter(Boolean).length;

  const clearStockFilters = () => {
    setStockSearch(""); setFilterStockMin(""); setFilterStockMax(""); setFilterStockStatus("all");
  };

  // ── طباعة المخزون ───────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!warehouse) return;
    const printDate = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const rows = stockItems.map(item => `
      <tr>
        <td>${item.productName ?? "—"}</td>
        <td>${item.variantColor ? `${item.variantColor} / ${item.variantSize}` : "إجمالي"}</td>
        <td style="text-align:center;font-weight:bold;color:${item.quantity <= (item.lowStockThreshold ?? 5) && item.quantity > 0 ? "#dc2626" : "#16a34a"}">${item.quantity}</td>
        <td style="text-align:center">${item.costPrice ?? item.unitPrice ?? "—"}</td>
        <td style="text-align:center">${((item.costPrice ?? item.unitPrice ?? 0) * item.quantity).toLocaleString("ar-EG")}</td>
        <td style="text-align:center">${new Date(item.updatedAt).toLocaleDateString("ar-EG")}</td>
      </tr>`).join("");

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>جرد مخزن: ${warehouse.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 24px; color: #111; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #111; padding-bottom: 12px; }
    .header h1 { font-size: 20px; font-weight: bold; }
    .header p  { font-size: 12px; color: #555; margin-top: 4px; }
    .stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
    .stat { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
    .stat .val { font-size: 20px; font-weight: 900; }
    .stat .lbl { font-size: 10px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; font-size: 11px; padding: 8px 10px; text-align: right; border-bottom: 2px solid #d1d5db; }
    td { padding: 7px 10px; font-size: 12px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    .footer { margin-top: 20px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    @media print { button { display: none; } body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>📦 جرد مخزن: ${warehouse.name}</h1>
      <p>${warehouse.address ? `📍 ${warehouse.address}` : ""}</p>
    </div>
    <div style="text-align:left">
      <p style="font-size:12px">تاريخ الطباعة: ${printDate}</p>
      ${warehouse.isDefault ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:11px">مخزن افتراضي</span>' : ""}
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="val">${totalUnits.toLocaleString("ar-EG")}</div><div class="lbl">إجمالي الوحدات</div></div>
    <div class="stat"><div class="val" style="color:#16a34a">${availableQty.toLocaleString("ar-EG")}</div><div class="lbl">متاح للبيع</div></div>
    <div class="stat"><div class="val" style="color:#dc2626">${lowStockCount}</div><div class="lbl">مخزون منخفض</div></div>
    <div class="stat"><div class="val" style="color:#2563eb">${stockValue.toLocaleString("ar-EG")} ج.م</div><div class="lbl">قيمة المخزون</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>المنتج</th><th>النوع</th><th style="text-align:center">الكمية</th>
        <th style="text-align:center">سعر التكلفة</th><th style="text-align:center">القيمة الإجمالية</th>
        <th style="text-align:center">آخر تحديث</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">كابرينا — نظام إدارة المخزون | ${printDate}</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
    win.document.close();
  };

  const handleAddStock = async () => {
    if (!selectedProductId) { toast({ title: "اختر منتجاً", variant: "destructive" }); return; }
    setAdding(true);
    try {
      await warehousesApi.addStock(warehouseId, {
        productId: selectedVariantId ? null : Number(selectedProductId),
        variantId: selectedVariantId ? Number(selectedVariantId) : null,
        quantity: qty,
      });
      // ── تزامن كل البيانات المرتبطة ──────────────────────────────────────
      qc.invalidateQueries({ queryKey: ["warehouses", warehouseId] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["variants"] });
      qc.invalidateQueries({ queryKey: ["variants-all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-intelligence"] });
      qc.invalidateQueries({ queryKey: ["smart-insights"] });
      qc.invalidateQueries({ queryKey: ["analytics-alerts"] });
      if (selectedVariantId) {
        qc.invalidateQueries({ queryKey: ["variant-wh-stock", Number(selectedVariantId)] });
      }
      toast({ title: "✅ تم تحديث المخزون", description: "تم تزامن الكميات مع قسم المنتجات" });
      setSelectedProductId(""); setSelectedVariantId(""); setQty(0);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateQty = async (stockId: number, newQty: number, variantId?: number | null) => {
    try {
      await warehousesApi.updateStock(warehouseId, stockId, newQty);
      // ── تزامن كل البيانات المرتبطة ──────────────────────────────────────
      qc.invalidateQueries({ queryKey: ["warehouses", warehouseId] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["variants"] });
      qc.invalidateQueries({ queryKey: ["variants-all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-intelligence"] });
      qc.invalidateQueries({ queryKey: ["smart-insights"] });
      qc.invalidateQueries({ queryKey: ["analytics-alerts"] });
      if (variantId) {
        qc.invalidateQueries({ queryKey: ["variant-wh-stock", variantId] });
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>;

  const stats = warehouseShipments?.stats;

  return (
    <div className="space-y-4" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h2 className="text-base font-bold flex items-center gap-1.5">
              <Warehouse className="w-4 h-4 text-primary" />
              {warehouse?.name}
              {warehouse?.isDefault && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
            </h2>
            {warehouse?.address && <p className="text-xs text-muted-foreground">{warehouse.address}</p>}
          </div>
        </div>
        {activeTab === "stock" && (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" />طباعة الجرد
          </Button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 bg-muted/20 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("stock")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === "stock" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="w-3.5 h-3.5" />المخزون
        </button>
        <button
          onClick={() => setActiveTab("shipments")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === "shipments" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Truck className="w-3.5 h-3.5" />الشحنات
          {(stats?.active ?? 0) > 0 && (
            <span className="bg-amber-500 text-white rounded-full w-4 h-4 text-[9px] font-black flex items-center justify-center">
              {stats!.active}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════ TAB: المخزون ══════════════ */}
      {activeTab === "stock" && (<>

      {/* ── الأربع مربعات ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <BoxIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-black leading-tight">{fmt(totalUnits)}</p>
              <p className="text-[10px] text-muted-foreground">إجمالي المنتجات</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-black leading-tight text-green-600">{fmt(availableQty)}</p>
              <p className="text-[10px] text-muted-foreground">متاح للبيع</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${lowStockCount > 0 ? "bg-red-500/10" : "bg-muted/40"}`}>
              <TrendingDown className={`w-4 h-4 ${lowStockCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className={`text-lg font-black leading-tight ${lowStockCount > 0 ? "text-red-500" : ""}`}>{lowStockCount}</p>
              <p className="text-[10px] text-muted-foreground">مخزون منخفض</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-black leading-tight text-blue-600">{fmt(Math.round(stockValue))}</p>
              <p className="text-[10px] text-muted-foreground">قيمة المخزون (ج.م)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add stock row — فقط لو عنده صلاحية تعديل المخزون */}
      {canEdit && (
      <Card className="border-primary/30">
        <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-xs font-bold text-primary">إضافة / تحديث منتج</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">المنتج</Label>
              <select
                className="w-full h-8 text-xs bg-card border border-input rounded-md px-2"
                value={selectedProductId}
                onChange={e => { setSelectedProductId(e.target.value ? Number(e.target.value) : ""); setSelectedVariantId(""); }}
              >
                <option value="">اختر منتج...</option>
                {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">النوع (اختياري)</Label>
              <select
                className="w-full h-8 text-xs bg-card border border-input rounded-md px-2"
                value={selectedVariantId}
                onChange={e => setSelectedVariantId(e.target.value ? Number(e.target.value) : "")}
                disabled={!selectedProductId || productVariants.length === 0}
              >
                <option value="">كل الأنواع</option>
                {productVariants.map(v => <option key={v.id} value={v.id}>{v.color} — {v.size}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">الكمية</Label>
              <Input type="number" min="0" value={qty} onChange={e => setQty(Number(e.target.value))} className="h-8 text-xs" />
            </div>
          </div>
          <Button size="sm" onClick={handleAddStock} disabled={adding} className="text-xs h-7 gap-1">
            <Plus className="w-3 h-3" />{adding ? "جاري الحفظ..." : "تحديث الكمية"}
          </Button>
        </CardContent>
      </Card>
      )}

      {/* ── شريط البحث والفلاتر ── */}
      <div className="rounded-md border border-border bg-muted/5 p-3 space-y-2">
        {/* صف البحث */}
        <div className="flex gap-2 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="ابحث باسم المنتج، اللون، أو المقاس..."
              className="pr-9 h-8 text-xs bg-card"
              value={stockSearch}
              onChange={e => setStockSearch(e.target.value)}
            />
            {stockSearch && (
              <button onClick={() => setStockSearch("")} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Button
            variant={showAdvanced ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs shrink-0"
            onClick={() => setShowAdvanced(v => !v)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            فلتر متقدم
            {advancedCount > 0 && (
              <span className="bg-primary-foreground text-primary rounded-full w-4 h-4 text-[9px] font-black flex items-center justify-center">
                {advancedCount}
              </span>
            )}
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          {hasStockFilter && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearStockFilters}>
              <X className="w-3 h-3" />مسح
            </Button>
          )}
        </div>

        {/* فلاتر متقدمة */}
        {showAdvanced && (
          <div className="pt-2 border-t border-border space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* حالة المخزون */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 font-semibold">📊 حالة المخزون</p>
                <div className="flex gap-1 flex-wrap">
                  {(["all", "ok", "low", "zero"] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStockStatus(s)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                        filterStockStatus === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary/40"
                      }`}
                    >
                      {s === "all" ? "الكل" : s === "ok" ? "✅ جيد" : s === "low" ? "⚠️ منخفض" : "❌ نفذ"}
                    </button>
                  ))}
                </div>
              </div>

              {/* نطاق الكمية */}
              <div className="sm:col-span-2">
                <p className="text-[10px] text-muted-foreground mb-1 font-semibold">📦 نطاق الكمية</p>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="من" className="h-7 text-xs bg-background w-24" value={filterStockMin} onChange={e => setFilterStockMin(e.target.value)} />
                  <span className="text-xs text-muted-foreground">—</span>
                  <Input type="number" placeholder="إلى" className="h-7 text-xs bg-background w-24" value={filterStockMax} onChange={e => setFilterStockMax(e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* إحصاء النتائج */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
          <span>
            {filteredStock.length !== stockItems.length
              ? `${filteredStock.length} من ${stockItems.length} صنف`
              : `${stockItems.length} صنف`}
          </span>
          {filteredStock.length > 0 && (
            <span className="text-primary font-bold">
              إجمالي: {fmt(filteredStock.reduce((s, i) => s + i.quantity, 0))} وحدة
            </span>
          )}
        </div>
      </div>

      {/* Stock table */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs text-right">المنتج</TableHead>
              <TableHead className="text-xs text-right">النوع</TableHead>
              <TableHead className="text-xs text-center">الكمية</TableHead>
              <TableHead className="text-xs text-right">آخر تحديث</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStock.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-6">
                {hasStockFilter ? "لا توجد نتائج — جرّب تغيير الفلاتر" : "لا توجد بيانات مخزون"}
              </TableCell></TableRow>
            )}
            {filteredStock.map(item => (
              <TableRow key={item.id}>
                <TableCell className="text-xs font-medium">{item.productName ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.variantColor ? `${item.variantColor} / ${item.variantSize}` : "إجمالي"}
                </TableCell>
                <TableCell className="text-center">
                  <Input
                    type="number" min="0"
                    defaultValue={item.quantity}
                    readOnly={!canEdit}
                    onBlur={canEdit ? e => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v !== item.quantity) handleUpdateQty(item.id, v, item.variantId);
                    } : undefined}
                    className={`h-7 w-20 text-xs text-center mx-auto ${!canEdit ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(item.updatedAt).toLocaleDateString("ar-EG")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>)}

      {/* ══════════════ TAB: الشحنات ══════════════ */}
      {activeTab === "shipments" && (
        <div className="space-y-4">

          {/* إحصائيات سريعة (الحالة) */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "الكل",        value: stats?.total ?? 0,     key: "all",       color: "text-foreground",  bg: "bg-muted/20" },
              { label: "قيد الشحن",   value: stats?.active ?? 0,    key: "active",    color: "text-amber-500",   bg: "bg-amber-500/10" },
              { label: "مسلّمة",      value: stats?.delivered ?? 0, key: "delivered", color: "text-emerald-500", bg: "bg-emerald-500/10" },
              { label: "مرتجعة",      value: stats?.returned ?? 0,  key: "returned",  color: "text-red-500",     bg: "bg-red-500/10" },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setShipmentStatusFilter(s.key as any)}
                className={`rounded-xl p-3 text-center transition-all border ${
                  shipmentStatusFilter === s.key
                    ? `${s.bg} border-current ${s.color}`
                    : "bg-muted/10 border-border hover:border-primary/30"
                }`}
              >
                <p className={`text-xl font-black ${shipmentStatusFilter === s.key ? s.color : ""}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              </button>
            ))}
          </div>

          {/* إحصائيات إجمالية: أنواع الطرود + أكتر عملاء */}
          {warehouseStats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-[11px] font-bold flex items-center gap-1.5 text-muted-foreground">
                    <PackageSearch className="w-3.5 h-3.5 text-primary" />أنواع الشحنات في هذا المخزن
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0">
                  {Object.keys(warehouseStats.byParcelType).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-3">لا توجد بيانات أنواع طرود بعد</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(warehouseStats.byParcelType)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                          <span key={type} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-muted/30 border border-border">
                            {PARCEL_LABELS[type] ?? type}
                            <span className="text-primary font-black">{count}</span>
                          </span>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-[11px] font-bold flex items-center gap-1.5 text-muted-foreground">
                    <Users className="w-3.5 h-3.5 text-primary" />أكتر العملاء تعاملاً
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0">
                  {warehouseStats.topClients.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-3">لا توجد بيانات عملاء بعد</p>
                  ) : (
                    <div className="space-y-1">
                      {warehouseStats.topClients.slice(0, 5).map((c, i) => (
                        <div key={c.name} className="flex items-center justify-between text-[11px]">
                          <span className="truncate flex items-center gap-1.5">
                            <span className="text-muted-foreground font-bold w-3">{i + 1}.</span>
                            {c.name}
                          </span>
                          <span className="font-black text-primary shrink-0">{c.count} شحنة</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* جدول الشحنات */}
          <Card className="border-border bg-card overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border bg-muted/5 text-[10px] font-bold text-muted-foreground">
              <span className="col-span-2">رقم الشحنة</span>
              <span className="col-span-2">المُرسِل</span>
              <span className="col-span-2">المستلم</span>
              <span className="col-span-2">النوع</span>
              <span className="col-span-2">الحالة</span>
              <span className="col-span-1">المندوب</span>
              <span className="col-span-1 text-center">إجراء</span>
            </div>

            {loadingShipments ? (
              <div className="py-10 text-center text-muted-foreground text-xs animate-pulse">جاري التحميل...</div>
            ) : !warehouseShipments?.shipments.length ? (
              <div className="py-12 text-center">
                <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">لا توجد شحنات في هذه الفئة</p>
              </div>
            ) : warehouseShipments.shipments.map(s => {
              const st = SHIPMENT_STATUS_MAP[s.status] ?? { label: s.status, color: "text-muted-foreground", bg: "bg-muted/20" };
              const isReturnPending = s.status === "returned" && s.returnReceived !== 1;
              return (
                <div key={s.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/50 hover:bg-muted/10 transition-colors items-center text-xs">
                  <div className="col-span-2 min-w-0">
                    <p className="font-bold text-primary truncate">{s.shipmentNumber ?? `#${s.id}`}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{s.receiverCity ?? "—"}</p>
                  </div>
                  <div className="col-span-2 truncate">{s.senderName}</div>
                  <div className="col-span-2 truncate">
                    {s.receiverName}
                    {s.notes && <p className="text-[9px] text-muted-foreground truncate" title={s.notes}>{s.notes}</p>}
                  </div>
                  <div className="col-span-2">
                    {s.parcelType ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-muted/30 border border-border">
                        {PARCEL_LABELS[s.parcelType] ?? s.parcelType}
                      </span>
                    ) : <span className="text-muted-foreground text-[10px]">—</span>}
                    {(s.pieces ?? 1) > 1 && <span className="text-[9px] text-muted-foreground mr-1">×{s.pieces}</span>}
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${st.bg} ${st.color}`}>
                      {st.label}
                    </span>
                    {isReturnPending && (
                      <p className="text-[9px] text-amber-500 mt-0.5">لسه عند شركة الشحن</p>
                    )}
                  </div>
                  <div className="col-span-1 min-w-0">
                    {s.courierName ? (
                      <div className="truncate">
                        <p className="text-[10px] font-bold truncate flex items-center gap-1"><UserCheck className="w-2.5 h-2.5 text-sky-400 shrink-0" />{s.courierName}</p>
                        {s.courierPhone && <p className="text-[9px] text-muted-foreground flex items-center gap-1" dir="ltr"><Phone className="w-2.5 h-2.5" />{s.courierPhone}</p>}
                      </div>
                    ) : <span className="text-muted-foreground text-[10px]">—</span>}
                  </div>
                  <div className="col-span-1 text-center">
                    {canEdit && (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="تحويل لمخزن آخر / تعيين مندوب"
                        onClick={() => setTransferShipmentId(s.id)}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {transferShipmentId !== null && warehouseShipments && (() => {
        const target = warehouseShipments.shipments.find(s => s.id === transferShipmentId);
        if (!target) return null;
        return (
          <TransferShipmentDialog
            shipment={target}
            currentWarehouseId={warehouseId}
            warehouses={allWarehouses ?? []}
            shippingCompanies={shippingCompanies ?? []}
            onClose={() => setTransferShipmentId(null)}
          />
        );
      })()}

    </div>
  );
}

export default function WarehousesPage() {
  const { can, isAdmin } = useAuth();
  const canEdit = isAdmin || can("inventory.warehouses");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseType | undefined>();
  const [stockViewId, setStockViewId] = useState<number | null>(null);
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const debouncedWarehouseSearch = useDebounce(warehouseSearch, 250);

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: warehousesApi.list,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const deleteWarehouse = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المخزن؟")) return;
    try {
      await warehousesApi.delete(id);
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast({ title: "تم حذف المخزن" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const [repairing, setRepairing] = useState(false);

  const handleRepairStock = async () => {
    if (!confirm("سيتم إصلاح أي كمية موجودة في المنتجات لكن غير مسجلة في المخازن — تكملة؟")) return;
    setRepairing(true);
    try {
      const res = await fetch("/api/warehouses/repair-stock", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      const data = await res.json();
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["variants"] });
      toast({ title: "✅ تم الإصلاح", description: data.message });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setRepairing(false);
    }
  };

  const filteredWarehouses = useMemo(() => {
    if (!debouncedWarehouseSearch) return warehouses;
    const q = debouncedWarehouseSearch.toLowerCase();
    return warehouses.filter(w =>
      w.name.toLowerCase().includes(q) ||
      w.address?.toLowerCase().includes(q) ||
      w.notes?.toLowerCase().includes(q)
    );
  }, [warehouses, debouncedWarehouseSearch]);

  if (stockViewId !== null) {
    return (
      <div className="max-w-4xl mx-auto">
        <StockEditor warehouseId={stockViewId} onClose={() => setStockViewId(null)} canEdit={canEdit} />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">المخازن</h1>
          <p className="text-muted-foreground text-xs mt-0.5">إدارة المخازن ومخزون كل فرع</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs text-amber-600 border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              onClick={handleRepairStock} disabled={repairing}>
              <Wrench className="w-3.5 h-3.5" />
              {repairing ? "جاري الإصلاح..." : "إصلاح المخزون"}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" className="gap-2 h-8 text-xs" onClick={() => { setEditingWarehouse(undefined); setFormOpen(true); }}>
              <Plus className="w-3.5 h-3.5" />إضافة مخزن
            </Button>
          )}
        </div>
      </div>

      {/* ── شريط البحث ── */}
      {!isLoading && warehouses.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="ابحث باسم المخزن أو العنوان..."
            className="pr-9 h-9 text-sm bg-card"
            value={warehouseSearch}
            onChange={e => setWarehouseSearch(e.target.value)}
          />
          {warehouseSearch && (
            <button onClick={() => setWarehouseSearch("")} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {isLoading && <p className="text-center text-muted-foreground text-sm py-12">جاري التحميل...</p>}

      {!isLoading && warehouses.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Warehouse className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">لا توجد مخازن بعد. أضف مخزنك الأول.</p>
        </div>
      )}

      {!isLoading && filteredWarehouses.length === 0 && warehouses.length > 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">لا توجد مخازن تطابق البحث</p>
          <button onClick={() => setWarehouseSearch("")} className="text-xs text-primary mt-1 hover:underline">مسح البحث</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredWarehouses.map(w => (
          <Card key={w.id} className="border-border bg-card hover:border-primary/40 transition-colors">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Warehouse className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate flex items-center gap-1.5">
                      {w.name}
                      {w.city && <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">{w.city}</span>}
                    </p>
                    {w.address && <p className="text-[10px] text-muted-foreground truncate">{w.address}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {w.isDefault && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary"
                        onClick={() => { setEditingWarehouse(w); setFormOpen(true); }}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteWarehouse(w.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/20 rounded-md p-2">
                  <p className="text-base font-bold text-primary">{fmt(w.totalUnits)}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">وحدة</p>
                </div>
                <div className="bg-muted/20 rounded-md p-2">
                  <p className="text-base font-bold">{w.skuCount}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">صنف</p>
                </div>
                <div className={`rounded-md p-2 ${w.shipmentCount > 0 ? "bg-amber-500/10" : "bg-muted/20"}`}>
                  <div className="flex items-center justify-center gap-1">
                    {w.shipmentCount > 0 && <Truck className="w-3 h-3 text-amber-500" />}
                    <p className={`text-base font-bold ${w.shipmentCount > 0 ? "text-amber-500" : ""}`}>
                      {w.shipmentCount ?? 0}
                    </p>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5">قيد الشحن</p>
                </div>
              </div>
              {w.notes && <p className="text-[10px] text-muted-foreground border-t border-border pt-2">{w.notes}</p>}
              <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1"
                onClick={() => setStockViewId(w.id)}>
                <Package className="w-3 h-3" />إدارة المخزون
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <WarehouseFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingWarehouse(undefined); }}
        existing={editingWarehouse}
      />
    </div>
  );
}
