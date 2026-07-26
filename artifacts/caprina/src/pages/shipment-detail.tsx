import { useParams, Link, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowRight, AlertCircle, Pencil, Save, X, Printer, Phone, MapPin, Trash2, RotateCcw, TrendingUp, TrendingDown, AlertTriangle, Lock, MessageCircle, Package, Truck, CheckCircle2, Clock, Plus, Search, Megaphone, Warehouse, UserCheck, DollarSign, Zap, Users, ChevronsUpDown, Check, Boxes } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useRef, useEffect, useMemo } from "react";
import React from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetOrder, getGetOrderQueryKey, useUpdateOrder, getListOrdersQueryKey, getGetOrdersSummaryQueryKey, getGetRecentOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ToastAction } from "@/components/ui/toast";
import { shippingApi, ordersApi, productsApi, variantsApi, manifestsApi, warehousesApi, usersApi, cashRegistersApi, apiFetch } from "@/lib/api";
import { type WhatsAppOrderData, applySenderIssueTemplate, buildWhatsAppLink } from "@/lib/whatsapp";
import { WhatsAppDialog, WhatsAppShipmentDialog } from "@/components/whatsapp-dialog";
import { formatCurrency } from "@/lib/utils";
import { ProductSearchCombobox } from "@/components/product-search-combobox";
import { RETURN_REASONS, returnReasonLabel, STATUS_LABELS as statusLabels, STATUS_CLASSES as statusClasses } from "@/lib/order-constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const AD_SOURCES = [
  { value: "facebook",  label: "فيسبوك" },
  { value: "tiktok",   label: "تيك توك" },
  { value: "instagram",label: "إنستجرام" },
  { value: "whatsapp", label: "واتساب" },
  { value: "organic",  label: "ويبسايت" },
  { value: "other",    label: "أخرى" },
];

const AdSourceIcon = ({ value, className = "w-4 h-4 shrink-0" }: { value: string; className?: string }) => {
  if (value === "facebook") return <svg className={className} viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>;
  if (value === "tiktok") return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>;
  if (value === "instagram") return <svg className={className} viewBox="0 0 24 24" fill="url(#igGrad2)"><defs><linearGradient id="igGrad2" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="25%" stopColor="#e6683c"/><stop offset="50%" stopColor="#dc2743"/><stop offset="75%" stopColor="#cc2366"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
  if (value === "whatsapp") return <svg className={className} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
  if (value === "organic") return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>;
};

const editSchema = z.object({
  customerName:      z.string().min(2, "اسم العميل يجب أن يكون حرفين على الأقل."),
  phone:             z.string().optional().nullable(),
  city:              z.string().optional().nullable(),
  address:           z.string().optional().nullable(),
  zoneId:            z.coerce.number().optional().nullable(),
  clientId:          z.coerce.number().optional().nullable(),
  senderName:        z.string().optional().nullable(),
  senderPhone:       z.string().optional().nullable(),
  senderPhone2:      z.string().optional().nullable(),
  receiverPhone2:    z.string().optional().nullable(),
  parcelType:        z.string().optional().nullable(),
  weight:            z.string().optional().nullable(),
  shippingCost:      z.coerce.number().min(0).optional().nullable(),
  shippingCompanyId: z.coerce.number().optional().nullable(),
  trackingNumber:    z.string().optional().nullable(),
  warehouseId:       z.coerce.number().optional().nullable(),
  assignedUserId:    z.coerce.number().optional().nullable(),
  adSource:          z.string().optional().nullable(),
  adCampaign:        z.string().optional().nullable(),
  canOpen:           z.coerce.number().optional().nullable(),
  isDivisible:       z.coerce.number().optional().nullable(),
  rejectionPolicy:   z.string().optional().nullable(),
  notes:             z.string().optional().nullable(),
});

type EditFormValues = z.infer<typeof editSchema>;

// ── Add Product Dialog ────────────────────────────────────────────────────────
function AddProductDialog({ open, onOpenChange, order, onSuccess }: {
  open: boolean; onOpenChange: (v: boolean) => void; order: any; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: productsApi.list });
  const { data: allVariants = [] } = useQuery({ queryKey: ["variants"], queryFn: variantsApi.listAll });
  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: warehousesApi.list });
  const { canViewFinancials } = useAuth();

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [variantRows, setVariantRows] = useState<{ color: string; size: string; quantity: number }[]>([{ color: "", size: "", quantity: 1 }]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [unitPrice, setUnitPrice] = useState(0);
  const [costPrice, setCostPrice] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // combobox state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // افتح الـ dropdown تلقائي لما الـ dialog يفتح
  useEffect(() => {
    if (open && !selectedProduct) {
      setSearchOpen(true);
    }
  }, [open]);

  const productVariants = allVariants.filter((v: any) => v.productId === selectedProduct?.id);
  const availableColors = [...new Set(productVariants.map((v: any) => v.color))] as string[];
  const hasVariants = productVariants.length > 0;

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const allProds = (products as any[]);
    return (q ? allProds.filter((p: any) => p.name?.toLowerCase().includes(q)) : allProds).slice(0, 20);
  }, [searchQuery, products]);

  const reset = () => {
    setSelectedProduct(null);
    setVariantRows([{ color: "", size: "", quantity: 1 }]);
    setUnitPrice(0); setCostPrice(null); setWarehouseId(null);
    setSearchQuery(""); setSearchOpen(false);
  };

  const handleSelectProduct = (p: any) => {
    setSelectedProduct(p);
    setVariantRows([{ color: "", size: "", quantity: 1 }]);
    setSearchQuery(""); setSearchOpen(false);
    if (p.unitPrice) setUnitPrice(p.unitPrice);
    if (p.costPrice) setCostPrice(p.costPrice);
  };

  const updateRow = (i: number, key: string, val: any) => {
    setVariantRows(rows => {
      const next = rows.map((r, idx) => idx === i ? { ...r, [key]: val, ...(key === "color" ? { size: "" } : {}) } : r);
      if (key === "size") {
        const row = next[i];
        const v = productVariants.find((pv: any) => pv.color === row.color && pv.size === val);
        if (v?.unitPrice) setUnitPrice(v.unitPrice);
        if (v?.costPrice) setCostPrice(v.costPrice);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selectedProduct) return;
    setIsSubmitting(true);
    try {
      const row = variantRows[0];
      const variantId = hasVariants
        ? (productVariants.find((v: any) => v.color === row.color && v.size === row.size)?.id ?? null)
        : null;
      if (hasVariants && (!row.color || !row.size)) {
        toast({ title: "خطأ", description: "اختر لون ومقاس.", variant: "destructive" });
        return;
      }
      await apiFetch(`/shipments/${order.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          productId:   selectedProduct.id,
          variantId,
          warehouseId: warehouseId ?? null,
          product:     selectedProduct.name,
          color:       row.color || null,
          size:        row.size  || null,
          quantity:    row.quantity,
          unitPrice:   unitPrice ?? 0,
          costPrice:   costPrice ?? 0,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["shipment-items", order.id] });
      await queryClient.invalidateQueries({ queryKey: ["shipment-detail", String(order.id)] });
      toast({ title: "تم إضافة المنتج", description: `${selectedProduct.name} اتضاف للشحنة.` });
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "فشل الإضافة.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent
        className="max-w-md"
        dir="rtl"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4 text-primary" />ربط منتج بالشحنة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Product selector — inline combobox بدون portal */}
          <div>
            <label className="text-xs font-medium mb-1.5 block">اختر من المخزون *</label>
            {selectedProduct ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-md">
                <div className="flex items-center gap-2">
                  {selectedProduct.image ? (
                    <img src={selectedProduct.image} alt={selectedProduct.name} className="w-8 h-8 rounded object-cover border border-emerald-300 shrink-0" />
                  ) : (
                    <Package className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  <span className="text-sm font-bold">{selectedProduct.name}</span>
                </div>
                <button type="button" onClick={() => { setSelectedProduct(null); setVariantRows([{ color: "", size: "", quantity: 1 }]); }}
                  className="text-muted-foreground hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                {/* Search input */}
                <div className="relative">
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    className="w-full h-9 text-sm pr-8 pl-3 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="ابحث عن منتج..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery("")}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {/* Dropdown — inline داخل الـ Dialog */}
                {searchOpen && (
                  <div className="mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto z-10 relative">
                    {filteredProducts.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        {searchQuery ? "لا يوجد منتج بهذا الاسم" : "لا توجد منتجات في المخزون"}
                      </div>
                    ) : filteredProducts.map((p: any) => {
                      const variants = (allVariants as any[]).filter((v: any) => v.productId === p.id);
                      const stock = variants.length > 0
                        ? variants.reduce((s: number, v: any) => s + (v.totalQuantity ?? 0), 0)
                        : (p.totalQuantity ?? 0);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleSelectProduct(p); }}
                          className="w-full text-right flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors text-sm border-b border-border/20 last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="w-7 h-7 rounded object-cover border border-border shrink-0" />
                            ) : (
                              <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span className="font-medium truncate">{p.name}</span>
                          </div>
                          <Badge variant="outline" className={`text-[9px] font-bold shrink-0 ${stock > 0 ? "border-emerald-400 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400" : "border-red-400 text-red-600"}`}>
                            {stock > 0 ? `${stock} متاح` : "نفد"}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Variants */}
          {selectedProduct && hasVariants && (
            <div className="space-y-2">
              {variantRows.map((row, ri) => {
                const sizesForColor = productVariants.filter((v: any) => v.color === row.color).map((v: any) => v.size);
                const rowVariant = productVariants.find((v: any) => v.color === row.color && v.size === row.size);
                const avail = rowVariant ? (rowVariant.totalQuantity ?? 0) : null;
                return (
                  <div key={ri} className="flex items-end gap-2 p-2 bg-muted/10 rounded-md border border-border/40">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">اللون</label>
                      <select value={row.color} onChange={e => updateRow(ri, "color", e.target.value)}
                        className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="">اختر لون...</option>
                        {availableColors.map((c: string) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">المقاس</label>
                      <select value={row.size} disabled={!row.color} onChange={e => updateRow(ri, "size", e.target.value)}
                        className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50">
                        <option value="">اختر مقاس...</option>
                        {sizesForColor.map((s: string) => {
                          const v = productVariants.find((pv: any) => pv.color === row.color && pv.size === s);
                          const a = v ? (v.totalQuantity ?? 0) : 0;
                          return <option key={s} value={s} disabled={a === 0}>{s} {a === 0 ? "(نفد)" : `(${a})`}</option>;
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">الكمية</label>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => updateRow(ri, "quantity", Math.max(1, row.quantity - 1))}
                          className="w-7 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">−</button>
                        <span className="w-8 text-center text-sm font-bold">{row.quantity}</span>
                        <button type="button" onClick={() => updateRow(ri, "quantity", avail !== null ? Math.min(avail, row.quantity + 1) : row.quantity + 1)}
                          className="w-7 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">+</button>
                      </div>
                    </div>
                    {variantRows.length > 1 && (
                      <button type="button" onClick={() => setVariantRows(r => r.filter((_, idx) => idx !== ri))}
                        className="mb-0.5 p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {avail !== null && (
                      <span className={`text-[9px] font-bold mb-1 shrink-0 ${avail <= 5 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>متاح:{avail}</span>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setVariantRows(r => [...r, { color: "", size: "", quantity: 1 }])}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-primary border border-dashed border-primary/40 hover:bg-primary/5 py-2 rounded-md transition-colors">
                <Plus className="w-3.5 h-3.5" />أضف لون / مقاس آخر
              </button>
            </div>
          )}

          {/* Qty (no variants) */}
          {selectedProduct && !hasVariants && (
            <div>
              <label className="text-xs font-medium mb-1.5 block">الكمية *</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setVariantRows(r => [{ ...r[0], quantity: Math.max(1, r[0].quantity - 1) }])}
                  className="w-9 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">−</button>
                <span className="w-10 text-center text-sm font-bold">{variantRows[0]?.quantity ?? 1}</span>
                <button type="button" onClick={() => setVariantRows(r => [{ ...r[0], quantity: r[0].quantity + 1 }])}
                  className="w-9 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">+</button>
              </div>
            </div>
          )}

          {/* Preview Card + Warehouse + Price */}
          {selectedProduct && (
            <>
              {/* ── Preview Card ── */}
              <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
                <div className="px-3 py-2 bg-primary/5 border-b border-primary/10 flex items-center gap-1.5">
                  <Package className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">معاينة المنتج</span>
                </div>
                <div className="p-3 flex items-start gap-3">
                  {selectedProduct.image ? (
                    <img src={selectedProduct.image} alt={selectedProduct.name}
                      className="w-16 h-16 rounded-lg object-cover border border-border shrink-0 shadow-sm" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted/30 border border-border flex items-center justify-center shrink-0">
                      <Package className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="font-black text-sm">{selectedProduct.name}</p>
                    {hasVariants && variantRows.filter(r => r.color && r.size).length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {variantRows.filter(r => r.color && r.size).map((r, i) => (
                          <div key={i} className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-bold">{r.color}</span>
                            <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-bold">{r.size}</span>
                            <span className="text-[10px] text-muted-foreground">× {r.quantity}</span>
                          </div>
                        ))}
                      </div>
                    ) : !hasVariants ? (
                      <span className="text-[10px] text-muted-foreground">كمية: {variantRows[0]?.quantity ?? 1}</span>
                    ) : (
                      <span className="text-[10px] text-amber-500">اختر لون ومقاس أولاً</span>
                    )}
                    {unitPrice > 0 && (
                      <p className="text-sm font-black text-primary">
                        {new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(
                          unitPrice * (hasVariants
                            ? variantRows.filter(r => r.color && r.size).reduce((s, r) => s + r.quantity, 0)
                            : (variantRows[0]?.quantity ?? 1))
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── المخزن ── */}
              <div>
                <label className="text-xs font-medium mb-1.5 block">المخزن</label>
                <select
                  value={warehouseId ?? ""}
                  onChange={e => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">اختر مخزن...</option>
                  {(warehouses as any[]).map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              {/* ── السعر ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1.5 block">سعر البيع (ج.م) *</label>
                  <Input type="number" min={0} value={unitPrice || ""} onChange={e => setUnitPrice(Number(e.target.value))} className="h-9 text-sm" />
                </div>
                {canViewFinancials && (
                  <div>
                    <label className="text-xs font-medium mb-1.5 block">تكلفة الوحدة (ج.م)</label>
                    <Input type="number" min={0} value={costPrice ?? ""} onChange={e => setCostPrice(e.target.value ? Number(e.target.value) : null)} className="h-9 text-sm" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }} className="flex-1">إلغاء</Button>
          <Button size="sm" onClick={handleSubmit}
            disabled={isSubmitting || !selectedProduct}
            className="flex-1 gap-1">
            <Plus className="w-3 h-3" />{isSubmitting ? "جاري الربط..." : "ربط بالشحنة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -- Edit Single Order Row Dialog (Full Form)
function EditOrderRowDialog({ open, onOpenChange, order: o, shippingCompanies, products, allVariants, warehouses, users, onSuccess }: {
  open: boolean; onOpenChange: (v: boolean) => void; order: any;
  shippingCompanies: any[]; products: any[]; allVariants: any[];
  warehouses: any[]; users: any[]; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateOrder = useUpdateOrder();
  const { canViewFinancials } = useAuth();

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [variantRows, setVariantRows] = useState<{ color: string; size: string; quantity: number }[]>([{ color: "", size: "", quantity: 1 }]);
  const [unitPrice, setUnitPrice] = useState(0);
  const [costPrice, setCostPrice] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  // حقول بيانات العميل والشحن والإعلان
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingCompanyId, setShippingCompanyId] = useState<number | null>(null);
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [assignedUserId, setAssignedUserId] = useState<number | null>(null);
  const [adSource, setAdSource] = useState<string | null>(null);
  const [adCampaign, setAdCampaign] = useState("");

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const inStock = (products as any[]).filter((p: any) => {
      const variants = (allVariants as any[]).filter((v: any) => v.productId === p.id);
      return variants.length > 0
        ? variants.some((v: any) => (v.totalQuantity ?? 0) > 0)
        : (p.totalQuantity ?? 0) > 0;
    });
    return (q ? inStock.filter((p: any) => p.name?.toLowerCase().includes(q)) : inStock).slice(0, 20);
  }, [searchQuery, products, allVariants]);

  const productVariants = useMemo(
    () => (allVariants as any[]).filter((v: any) => v.productId === selectedProduct?.id),
    [allVariants, selectedProduct]
  );
  const availableColors = useMemo(() => [...new Set(productVariants.map((v: any) => v.color))] as string[], [productVariants]);
  const hasVariants = productVariants.length > 0;

  useEffect(() => {
    if (o && open) {
      const existingProduct = o.productId
        ? (products as any[]).find((p: any) => p.id === o.productId) ?? null
        : null;
      setSelectedProduct(existingProduct);
      setSearchQuery(""); setSearchOpen(false);
      setUnitPrice(o.unitPrice ?? 0);
      setCostPrice(o.costPrice ?? null);
      setNotes(o.notes ?? "");
      setVariantRows([{ color: o.color ?? "", size: o.size ?? "", quantity: o.quantity ?? 1 }]);
      // بيانات العميل والشحن والإعلان
      setCustomerName(o.customerName ?? "");
      setPhone(o.phone ?? "");
      setCity(o.city ?? "");
      setAddress(o.address ?? "");
      setTrackingNumber(o.trackingNumber ?? "");
      setShippingCompanyId(o.shippingCompanyId ?? null);
      setShippingCost(o.shippingCost ?? null);
      setWarehouseId(o.warehouseId ?? null);
      setAssignedUserId(o.assignedUserId ?? null);
      setAdSource(o.adSource ?? null);
      setAdCampaign(o.adCampaign ?? "");
    }
  }, [o, open]);

  const handleSelectProduct = (p: any) => {
    setSelectedProduct(p);
    setVariantRows([{ color: "", size: "", quantity: variantRows[0]?.quantity ?? 1 }]);
    setSearchQuery(""); setSearchOpen(false);
    if (p.unitPrice) setUnitPrice(p.unitPrice);
    if (p.costPrice) setCostPrice(p.costPrice);
  };

  const updateRow = (i: number, key: string, val: any) => {
    setVariantRows(rows => {
      const next = rows.map((r, idx) => idx === i ? { ...r, [key]: val, ...(key === "color" ? { size: "" } : {}) } : r);
      if (key === "size") {
        const row = next[i];
        const v = productVariants.find((pv: any) => pv.color === row.color && pv.size === val);
        if (v?.unitPrice) setUnitPrice(v.unitPrice);
        if (v?.costPrice) setCostPrice(v.costPrice);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      toast({ title: "خطأ", description: "اسم العميل مطلوب.", variant: "destructive" });
      return;
    }
    try {
      const row = variantRows[0];
      const variant = hasVariants && row.color && row.size
        ? productVariants.find((v: any) => v.color === row.color && v.size === row.size)
        : null;
      await updateOrder.mutateAsync({
        id: o.id,
        data: {
          customerName: customerName.trim(),
          phone: phone || null,
          city: city || null,
          address: address || null,
          trackingNumber: trackingNumber || null,
          shippingCompanyId: shippingCompanyId ?? null,
          shippingCost: shippingCost ?? null,
          warehouseId: warehouseId ?? null,
          assignedUserId: assignedUserId ?? null,
          adSource: adSource ?? null,
          adCampaign: adCampaign || null,
          product: selectedProduct?.name ?? o.product,
          color: variant?.color ?? (row.color || null),
          size: variant?.size ?? (row.size || null),
          quantity: row.quantity,
          unitPrice,
          costPrice: costPrice ?? null,
          productId: selectedProduct?.id ?? null,
          variantId: variant?.id ?? null,
          notes: notes || null,
        } as any,
      });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["invoice-orders"] });
      toast({ title: "تم الحفظ", description: "تم تعديل الطلب بنجاح." });
      onSuccess(); onOpenChange(false);
    } catch {
      toast({ title: "خطأ", description: "فشل الحفظ.", variant: "destructive" });
    }
  };

  const row = variantRows[0];
  const sizesForColor = productVariants.filter((v: any) => v.color === row.color).map((v: any) => v.size);
  const rowVariant = productVariants.find((v: any) => v.color === row.color && v.size === row.size);
  const avail = rowVariant ? (rowVariant.totalQuantity ?? 0) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        dir="rtl"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Pencil className="w-4 h-4 text-primary" />تعديل الطلب
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[70vh] space-y-4 py-1 pr-1">

          {/* ── قسم 1: بيانات العميل ── */}
          <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-muted/20">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" />بيانات العميل</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium mb-1.5 block">اسم العميل *</label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="اسم العميل" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">رقم الهاتف</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className="h-9 text-sm" dir="ltr" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">المحافظة</label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="القاهرة، الجيزة..." className="h-9 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium mb-1.5 block">العنوان التفصيلي</label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="الشارع، الحي..." className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* ── قسم 2: المنتج ── */}
          <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-muted/20">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />تفاصيل المنتج</p>
            <div>
              <label className="text-xs font-medium mb-1.5 block">المنتج</label>
              {selectedProduct ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-md">
                  <div className="flex items-center gap-2">
                    {selectedProduct.image ? (
                      <img src={selectedProduct.image} alt={selectedProduct.name} className="w-8 h-8 rounded object-cover border border-emerald-300 shrink-0" />
                    ) : (
                      <Package className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span className="text-sm font-bold">{selectedProduct.name}</span>
                  </div>
                  <button type="button" onClick={() => { setSelectedProduct(null); setVariantRows([{ color: "", size: "", quantity: row.quantity }]); }}
                    className="text-muted-foreground hover:text-red-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      className="w-full h-9 text-sm pr-8 pl-3 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder={`ابحث عن منتج... (حالياً: ${o?.product ?? ""})`}
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                      onFocus={() => setSearchOpen(true)}
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery("")}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {searchOpen && (
                    <div className="mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto z-10 relative">
                      {filteredProducts.length === 0 ? (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                          {searchQuery ? "لا يوجد منتج بهذا الاسم" : "لا توجد منتجات في المخزون"}
                        </div>
                      ) : filteredProducts.map((p: any) => {
                        const variants = (allVariants as any[]).filter((v: any) => v.productId === p.id);
                        const stock = variants.length > 0
                          ? variants.reduce((s: number, v: any) => s + (v.totalQuantity ?? 0), 0)
                          : (p.totalQuantity ?? 0);
                        return (
                          <button key={p.id} type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleSelectProduct(p); }}
                            className="w-full text-right flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors text-sm border-b border-border/20 last:border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              {p.image ? (
                                <img src={p.image} alt={p.name} className="w-7 h-7 rounded object-cover border border-border shrink-0" />
                              ) : (
                                <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              )}
                              <span className="font-medium truncate">{p.name}</span>
                            </div>
                            <Badge variant="outline" className={`text-[9px] font-bold shrink-0 ${stock > 0 ? "border-emerald-400 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400" : "border-red-400 text-red-600"}`}>
                              {stock > 0 ? `${stock} متاح` : "نفد"}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedProduct && hasVariants && (
              <div className="flex items-end gap-2 p-2 bg-muted/10 rounded-md border border-border/40">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">اللون</label>
                  <select value={row.color} onChange={e => updateRow(0, "color", e.target.value)}
                    className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">اختر لون...</option>
                    {availableColors.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">المقاس</label>
                  <select value={row.size} disabled={!row.color} onChange={e => updateRow(0, "size", e.target.value)}
                    className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50">
                    <option value="">اختر مقاس...</option>
                    {sizesForColor.map((s: string) => {
                      const v = productVariants.find((pv: any) => pv.color === row.color && pv.size === s);
                      const a = v ? (v.totalQuantity ?? 0) : 0;
                      return <option key={s} value={s} disabled={a === 0}>{s} {a === 0 ? "(نفد)" : `(${a})`}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">الكمية</label>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => updateRow(0, "quantity", Math.max(1, row.quantity - 1))}
                      className="w-7 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">-</button>
                    <span className="w-8 text-center text-sm font-bold">{row.quantity}</span>
                    <button type="button" onClick={() => updateRow(0, "quantity", avail !== null ? Math.min(avail, row.quantity + 1) : row.quantity + 1)}
                      className="w-7 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">+</button>
                  </div>
                </div>
                {avail !== null && (
                  <span className={`text-[9px] font-bold mb-2 shrink-0 ${avail <= 5 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>متاح:{avail}</span>
                )}
              </div>
            )}

            {(!selectedProduct || !hasVariants) && (
              <div>
                <label className="text-xs font-medium mb-1.5 block">الكمية *</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => updateRow(0, "quantity", Math.max(1, row.quantity - 1))}
                    className="w-9 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">-</button>
                  <span className="w-10 text-center text-sm font-bold">{row.quantity}</span>
                  <button type="button" onClick={() => updateRow(0, "quantity", row.quantity + 1)}
                    className="w-9 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">+</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block">سعر البيع (ج.م) *</label>
                <Input type="number" min={0} value={unitPrice || ""} onChange={e => setUnitPrice(Number(e.target.value))} className="h-9 text-sm" />
              </div>
              {canViewFinancials && (
                <div>
                  <label className="text-xs font-medium mb-1.5 block">تكلفة الوحدة (ج.م)</label>
                  <Input type="number" min={0} value={costPrice ?? ""} onChange={e => setCostPrice(e.target.value ? Number(e.target.value) : null)} className="h-9 text-sm" />
                </div>
              )}
            </div>
          </div>

          {/* ── قسم 3: الشحن ── */}
          <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-muted/20">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />بيانات الشحن</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block">شركة الشحن</label>
                <select value={shippingCompanyId ?? ""} onChange={e => setShippingCompanyId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">بدون شركة</option>
                  {(shippingCompanies as any[]).map((sc: any) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">رقم التتبع</label>
                <Input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="رقم التتبع" className="h-9 text-sm" dir="ltr" />
              </div>
              {canViewFinancials && (
                <div>
                  <label className="text-xs font-medium mb-1.5 block">تكلفة الشحن (ج.م)</label>
                  <Input type="number" min={0} value={shippingCost ?? ""} onChange={e => setShippingCost(e.target.value ? Number(e.target.value) : null)} className="h-9 text-sm" />
                </div>
              )}
            </div>
          </div>

          {/* ── قسم 4: الإعلان والفريق ── */}
          <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-muted/20">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5" />تتبع الإعلان والفريق</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block">مصدر الطلب</label>
                <select value={adSource ?? ""} onChange={e => setAdSource(e.target.value || null)}
                  className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">اختر المصدر</option>
                  {AD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">اسم الحملة</label>
                <Input value={adCampaign} onChange={e => setAdCampaign(e.target.value)} placeholder="اسم الحملة الإعلانية" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">المخزن</label>
                <select value={warehouseId ?? ""} onChange={e => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">اختر مخزن</option>
                  {(warehouses as any[]).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">الراسل</label>
                <select value={assignedUserId ?? ""} onChange={e => setAssignedUserId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">اختر موظف</option>
                  {(users as any[]).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── قسم 5: ملاحظات ── */}
          <div>
            <label className="text-xs font-medium mb-1.5 block">ملاحظات</label>
            <Textarea className="min-h-[60px] text-sm resize-none" value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." />
          </div>

        </div>

        <DialogFooter className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1">إلغاء</Button>
          <Button size="sm" onClick={handleSubmit}
            disabled={updateOrder.isPending || unitPrice <= 0}
            className="flex-1 gap-1">
            <Save className="w-3 h-3" />{updateOrder.isPending ? "جاري الحفظ..." : "حفظ التعديل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Invoice Edit Dialog (تعديل بيانات الفاتورة كاملة) ──────────────────────
function InvoiceEditDialog({ open, onOpenChange, primaryOrder, orders, shippingCompanies, warehouses, users, canViewFinancials, products, allVariants, onSuccess }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  primaryOrder: any; orders: any[];
  shippingCompanies: any[]; warehouses: any[]; users: any[];
  canViewFinancials: boolean;
  products: any[]; allVariants: any[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateOrder = useUpdateOrder();

  // state للمنتجات — كل منتج ليه quantity و unitPrice و costPrice و notes و color و size
  const [productsState, setProductsState] = useState<{ id: number; quantity: number; unitPrice: number; costPrice: number | null; notes: string; color: string; size: string; variantId: number | null }[]>([]);

  useEffect(() => {
    if (open && orders.length > 0) {
      setProductsState(orders.map(o => ({
        id: o.id,
        quantity: o.quantity ?? 1,
        unitPrice: o.unitPrice ?? 0,
        costPrice: o.costPrice ?? null,
        notes: o.notes ?? "",
        color: o.color ?? "",
        size: o.size ?? "",
        variantId: o.variantId ?? null,
      })));
    }
  }, [open, orders]);

  const invoiceEditSchema = z.object({
    customerName:      z.string().min(2, "الاسم مطلوب"),
    phone:             z.string().optional().nullable(),
    city:              z.string().optional().nullable(),
    address:           z.string().optional().nullable(),
    shippingCompanyId: z.coerce.number().optional().nullable(),
    shippingCost:      z.coerce.number().min(0).optional().nullable(),
    warehouseId:       z.coerce.number().optional().nullable(),
    assignedUserId:    z.coerce.number().optional().nullable(),
    adSource:          z.string().optional().nullable(),
    adCampaign:        z.string().optional().nullable(),
    notes:             z.string().optional().nullable(),
  });

  type InvoiceEditValues = z.infer<typeof invoiceEditSchema>;

  const form = useForm<InvoiceEditValues>({
    resolver: zodResolver(invoiceEditSchema),
    defaultValues: {
      customerName:      primaryOrder?.customerName ?? "",
      phone:             primaryOrder?.phone ?? "",
      city:              primaryOrder?.city ?? "",
      address:           primaryOrder?.address ?? "",
      shippingCompanyId: primaryOrder?.shippingCompanyId ?? null,
      shippingCost:      primaryOrder?.shippingCost ?? 0,
      warehouseId:       primaryOrder?.warehouseId ?? null,
      assignedUserId:    primaryOrder?.assignedUserId ?? null,
      adSource:          primaryOrder?.adSource ?? null,
      adCampaign:        primaryOrder?.adCampaign ?? null,
      notes:             primaryOrder?.notes ?? "",
    },
  });

  // إعادة تحميل القيم لما الـ dialog يفتح
  useEffect(() => {
    if (open && primaryOrder) {
      form.reset({
        customerName:      primaryOrder.customerName ?? "",
        phone:             primaryOrder.phone ?? "",
        city:              primaryOrder.city ?? "",
        address:           primaryOrder.address ?? "",
        shippingCompanyId: primaryOrder.shippingCompanyId ?? null,
        shippingCost:      primaryOrder.shippingCost ?? 0,
        warehouseId:       primaryOrder.warehouseId ?? null,
        assignedUserId:    primaryOrder.assignedUserId ?? null,
        adSource:          primaryOrder.adSource ?? null,
        adCampaign:        primaryOrder.adCampaign ?? null,
        notes:             primaryOrder.notes ?? "",
      });
    }
  }, [open, primaryOrder]);

  const handleSubmit = async (values: InvoiceEditValues) => {
    try {
      // نحدّث كل طلبات الفاتورة — بيانات العميل والشحن مشتركة، والمنتج لكل طلب على حدة
      await Promise.all(orders.map(o => {
        const ps = productsState.find(p => p.id === o.id);
        return updateOrder.mutateAsync({ id: o.id, data: {
          customerName:      values.customerName,
          phone:             values.phone || null,
          city:              values.city || null,
          address:           values.address || null,
          shippingCompanyId: values.shippingCompanyId || null,
          shippingCost:      values.shippingCost ?? null,
          warehouseId:       values.warehouseId || null,
          assignedUserId:    values.assignedUserId || null,
          adSource:          values.adSource || null,
          adCampaign:        values.adCampaign || null,
          notes:             ps?.notes || null,
          quantity:          ps?.quantity ?? o.quantity,
          unitPrice:         ps?.unitPrice ?? o.unitPrice,
          costPrice:         ps?.costPrice ?? null,
          color:             ps?.color || null,
          size:              ps?.size || null,
          variantId:         ps?.variantId ?? null,
        } as any });
      }));
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
      toast({ title: "تم الحفظ", description: `تم تحديث بيانات فاتورة ${primaryOrder.invoiceNumber} بنجاح.` });
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({ title: "خطأ", description: "فشل الحفظ.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl"
        onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Pencil className="w-4 h-4 text-primary" />
            تعديل بيانات الفاتورة — {primaryOrder?.invoiceNumber}
            <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">{orders.length} منتجات</Badge>
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-1">

            {/* بيانات العميل */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Phone className="w-3 h-3" />بيانات العميل
              </p>
              <FormField control={form.control} name="customerName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">اسم العميل *</FormLabel>
                  <FormControl><Input className="h-9 text-sm" {...field} /></FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" />الهاتف</FormLabel>
                    <FormControl><Input placeholder="01x-xxxx-xxxx" className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />المحافظة</FormLabel>
                    <FormControl><Input placeholder="القاهرة..." className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />العنوان بالتفصيل</FormLabel>
                  <FormControl><Input placeholder="الحي، الشارع، رقم المنزل..." className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
            </div>

            {/* الشحن */}
            <div className="space-y-3 pt-2 border-t border-border/60">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Truck className="w-3 h-3" />بيانات الشحن
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="shippingCompanyId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">شركة الشحن</FormLabel>
                    <Select value={field.value?.toString() || "none"} onValueChange={v => field.onChange(v === "none" ? null : Number(v))}>
                      <SelectTrigger className="h-9 text-sm bg-card"><SelectValue placeholder="اختر شركة" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون</SelectItem>
                        {shippingCompanies?.filter((c: any) => c.isActive).map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                {canViewFinancials && (
                  <FormField control={form.control} name="shippingCost" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs flex items-center gap-1"><DollarSign className="w-3 h-3 text-emerald-600" />تكلفة الشحن (ج.م)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" placeholder="0" className="h-9 text-sm"
                          {...field} value={field.value ?? ""}
                          onChange={e => field.onChange(e.target.value ? Number(e.target.value) : 0)} />
                      </FormControl>
                    </FormItem>
                  )} />
                )}
              </div>
            </div>

            {/* تتبع الإعلان والفريق */}
            <div className="space-y-3 pt-2 border-t border-border/60">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Megaphone className="w-3 h-3 text-purple-400" />تتبع الإعلان والفريق
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="adSource" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs flex items-center gap-1"><Megaphone className="w-3 h-3" />مصدر الطلب</FormLabel>
                    <Select value={field.value ?? "none"} onValueChange={v => field.onChange(v === "none" ? null : v)}>
                      <SelectTrigger className="h-9 text-sm bg-card">
                        <SelectValue placeholder="اختر المصدر">
                          {field.value && field.value !== "none" && (
                            <span className="flex items-center gap-2">
                              <AdSourceIcon value={field.value} />
                              {AD_SOURCES.find(s => s.value === field.value)?.label}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— غير محدد —</SelectItem>
                        {AD_SOURCES.map(s => (
                          <SelectItem key={s.value} value={s.value}>
                            <span className="flex items-center gap-2"><AdSourceIcon value={s.value} />{s.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="adCampaign" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">اسم الحملة</FormLabel>
                    <FormControl><Input placeholder="Summer 2025..." className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="warehouseId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs flex items-center gap-1"><Warehouse className="w-3 h-3" />المخزن</FormLabel>
                    <Select value={field.value?.toString() ?? "none"} onValueChange={v => field.onChange(v === "none" ? null : Number(v))}>
                      <SelectTrigger className="h-9 text-sm bg-card"><SelectValue placeholder="اختر مخزن" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— غير محدد —</SelectItem>
                        {warehouses?.map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}{w.isDefault ? " ★" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="assignedUserId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs flex items-center gap-1"><UserCheck className="w-3 h-3" />الراسل</FormLabel>
                    <Select value={field.value?.toString() ?? "none"} onValueChange={v => field.onChange(v === "none" ? null : Number(v))}>
                      <SelectTrigger className="h-9 text-sm bg-card"><SelectValue placeholder="اختر موظف" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— غير محدد —</SelectItem>
                        {users?.filter((u: any) => u.isActive).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.displayName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* منتجات الفاتورة */}
            <div className="space-y-3 pt-2 border-t border-border/60">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Package className="w-3 h-3" />منتجات الفاتورة
              </p>
              {orders.map((o, idx) => {
                const ps = productsState.find(p => p.id === o.id);
                if (!ps) return null;
                const productImg = (products as any[]).find((p: any) => p.name === o.product)?.image ?? null;
                // variants لهذا المنتج
                const productObj = (products as any[]).find((p: any) => p.name === o.product);
                const productVariants = productObj
                  ? (allVariants as any[]).filter((v: any) => v.productId === productObj.id)
                  : [];
                const hasVariants = productVariants.length > 0;
                const availableColors = [...new Set(productVariants.map((v: any) => v.color))] as string[];
                const sizesForColor = productVariants.filter((v: any) => v.color === ps.color).map((v: any) => v.size);

                const updatePs = (field: string, value: any) =>
                  setProductsState(prev => prev.map(p => p.id === o.id ? { ...p, [field]: value } : p));

                return (
                  <div key={o.id} className="p-3 rounded-lg border border-border/60 bg-muted/10 space-y-2">
                    {/* اسم المنتج + صورة */}
                    <div className="flex items-center gap-2">
                      {productImg ? (
                        <img src={productImg} alt={o.product} className="w-8 h-8 rounded object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-muted border border-border flex items-center justify-center shrink-0">
                          <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <p className="text-sm font-bold truncate flex-1">{o.product}</p>
                    </div>

                    {/* اللون والمقاس — لو المنتج عنده variants */}
                    {hasVariants && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-1 block">اللون</label>
                          <select value={ps.color} onChange={e => {
                            const newColor = e.target.value;
                            const firstVariant = productVariants.find((v: any) => v.color === newColor);
                            updatePs("color", newColor);
                            updatePs("size", "");
                            updatePs("variantId", null);
                          }} className="w-full h-8 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring">
                            <option value="">اختر لون...</option>
                            {availableColors.map((c: string) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-1 block">المقاس</label>
                          <select value={ps.size} disabled={!ps.color} onChange={e => {
                            const newSize = e.target.value;
                            const variant = productVariants.find((v: any) => v.color === ps.color && v.size === newSize);
                            updatePs("size", newSize);
                            updatePs("variantId", variant?.id ?? null);
                            if (variant?.unitPrice) updatePs("unitPrice", variant.unitPrice);
                            if (variant?.costPrice) updatePs("costPrice", variant.costPrice);
                          }} className="w-full h-8 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50">
                            <option value="">اختر مقاس...</option>
                            {sizesForColor.map((s: string) => {
                              const v = productVariants.find((pv: any) => pv.color === ps.color && pv.size === s);
                              const avail = v ? (v.totalQuantity ?? 0) : 0;
                              return <option key={s} value={s} disabled={avail === 0}>{s} {avail === 0 ? "(نفد)" : `(${avail})`}</option>;
                            })}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">الكمية</label>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setProductsState(prev => prev.map(p => p.id === o.id ? { ...p, quantity: Math.max(1, p.quantity - 1) } : p))}
                            className="w-7 h-8 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">-</button>
                          <span className="w-8 text-center text-sm font-bold">{ps.quantity}</span>
                          <button type="button" onClick={() => setProductsState(prev => prev.map(p => p.id === o.id ? { ...p, quantity: p.quantity + 1 } : p))}
                            className="w-7 h-8 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">+</button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">سعر البيع (ج.م)</label>
                        <Input type="number" min={0} value={ps.unitPrice || ""} onChange={e => setProductsState(prev => prev.map(p => p.id === o.id ? { ...p, unitPrice: Number(e.target.value) } : p))} className="h-8 text-sm" />
                      </div>
                      {canViewFinancials && (
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-1 block">تكلفة الوحدة (ج.م)</label>
                          <Input type="number" min={0} value={ps.costPrice ?? ""} onChange={e => setProductsState(prev => prev.map(p => p.id === o.id ? { ...p, costPrice: e.target.value ? Number(e.target.value) : null } : p))} className="h-8 text-sm" />
                        </div>
                      )}
                      <div className={canViewFinancials ? "" : "col-span-2"}>
                        <label className="text-[10px] text-muted-foreground mb-1 block">ملاحظات</label>
                        <Input value={ps.notes} onChange={e => setProductsState(prev => prev.map(p => p.id === o.id ? { ...p, notes: e.target.value } : p))} placeholder="ملاحظة للمنتج..." className="h-8 text-sm" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ملاحظات عامة */}
            <div className="pt-2 border-t border-border/60">
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">ملاحظات</FormLabel>
                  <FormControl>
                    <Textarea placeholder="أي ملاحظات إضافية..." className="min-h-[60px] text-sm resize-none" {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <DialogFooter className="flex gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1">إلغاء</Button>
              <Button type="submit" size="sm" disabled={updateOrder.isPending} className="flex-1 gap-1">
                <Save className="w-3 h-3" />{updateOrder.isPending ? "جاري الحفظ..." : `حفظ (${orders.length} طلبات)`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceView({ orders, currentId, shippingCompanies, products, allVariants, onRefresh, isAdmin, canViewFinancials, canViewProfitability, formatCurrency, warehouses, users, canEdit, canDelete, canCreate, externalShowAddProduct, onExternalShowAddProductChange, externalShowEdit, onExternalShowEditChange }: {
  orders: any[]; currentId: number; shippingCompanies: any[]; products: any[]; allVariants: any[];
  onRefresh: () => void; isAdmin: boolean; canViewFinancials: boolean; canViewProfitability: boolean; formatCurrency: (n: number) => string;
  warehouses: any[]; users: any[]; canEdit: boolean; canDelete: boolean; canCreate: boolean;
  externalShowAddProduct?: boolean; onExternalShowAddProductChange?: (v: boolean) => void;
  externalShowEdit?: boolean; onExternalShowEditChange?: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteId, setShowDeleteId] = useState<number | null>(null);
  const [showInvoiceEdit, setShowInvoiceEdit] = useState(false);

  // sync external controls from parent header buttons
  useEffect(() => {
    if (externalShowAddProduct) { setShowAddProduct(true); onExternalShowAddProductChange?.(false); }
  }, [externalShowAddProduct]);
  useEffect(() => {
    if (externalShowEdit) { setShowInvoiceEdit(true); onExternalShowEditChange?.(false); }
  }, [externalShowEdit]);

  const primaryOrder = orders.find(o => o.id === currentId) || orders[0];
  const invoiceTotal = orders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);

  const handleDeleteItem = async (id: number) => {
    setDeletingId(id);
    try {
      await ordersApi.delete(id);
      queryClient.removeQueries({ queryKey: getGetOrderQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
      toast({ title: "تم الحذف", description: "تم حذف المنتج من الفاتورة." });
      if (id === currentId) {
        const remaining = orders.filter(o => o.id !== id);
        if (remaining.length > 0) navigate(`/orders/${remaining[0].id}`);
        else navigate("/shipments-list");
      } else { onRefresh(); }
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "فشل الحذف.", variant: "destructive" });
    } finally { setDeletingId(null); setShowDeleteId(null); }
  };

  return (
    <div className="space-y-4">
      {/* Header الفاتورة */}
      <Card className="border-primary/40 bg-card">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">فاتورة</span>
              <span className="text-sm font-black text-primary">{primaryOrder.invoiceNumber}</span>
              <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">{orders.length} منتجات</Badge>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">إجمالي الفاتورة</p>
              <p className="text-lg font-black text-primary">{formatCurrency(invoiceTotal)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border/40">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground font-medium">العميل</span>
              <span className="text-sm font-bold truncate">{primaryOrder.customerName}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1"><Phone className="w-3 h-3" />الواتف</span>
              <span className="text-sm font-semibold text-foreground/90 truncate">{primaryOrder.phone || "—"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1"><MapPin className="w-3 h-3" />المحافظة</span>
              <span className="text-sm font-semibold text-foreground/90 truncate">{primaryOrder.city || "—"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1"><MapPin className="w-3 h-3" />العنوان</span>
              <span className="text-xs font-semibold text-foreground/90 line-clamp-2">{primaryOrder.address || "—"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Single product: بطاقة كبيرة تملي الشاشة ── */}
      {orders.length === 1 ? (() => {
        const o = orders[0];
        const productImg = products.find((p: any) => p.name === o.product)?.image ?? null;
        const hasCost = (o.costPrice ?? 0) > 0;
        const qty = o.status === "partial_received" && o.partialQuantity ? o.partialQuantity : o.quantity;
        const revenue = qty * (o.unitPrice ?? 0);
        const cost = qty * (o.costPrice ?? 0);
        // تكلفة الشحن الفعلية = تكلفة المندوب (شركة الشحن) المرتبط بالشحنة، مش قيمة ثابتة على السطر
        const courierCompany = shippingCompanies.find((sc: any) => sc.id === (o.shippingCompanyId ?? primaryOrder?.shippingCompanyId));
        const shipping = Math.abs(Number(courierCompany?.shippingCost ?? o.shippingCost ?? 0));
        const netProfit = revenue - cost - shipping;
        const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;
        const isRet = o.status === "returned";

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* البطاقة الرئيسية — عمودين */}
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden shadow-sm">

              {/* صورة + اسم المنتج */}
              <div className="flex items-center gap-4 p-4">
                {/* الصورة */}
                <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border border-border/60 bg-muted shadow-sm">
                  {productImg ? (
                    <img src={productImg} alt={o.product}
                      className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 opacity-25 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* تفاصيل المنتج */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">المنتج</p>
                    <h2 className="text-base sm:text-lg md:text-xl font-black text-foreground leading-tight">{o.product}</h2>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Badge className={`text-xs font-bold px-3 py-1 ${statusClasses[o.status] || ""}`}>
                        {statusLabels[o.status] || o.status}
                      </Badge>
                      {o.status === "in_shipping" || o.status === "in_transit" ? (
                        (order as any).assignedUserName ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                            🚚 مع {(order as any).assignedUserName}
                          </span>
                        ) : (order as any).shippingCompanyName ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                            🚚 مع {(order as any).shippingCompanyName}
                          </span>
                        ) : null
                      ) : null}
                      {o.color && <Badge variant="outline" className="text-xs border-border">{o.color}</Badge>}
                      {o.size && <Badge variant="outline" className="text-xs border-border">{o.size}</Badge>}
                    </div>
                  </div>

                  {/* الأرقام */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-muted/50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-muted-foreground mb-1">الكمية</p>
                      <p className="text-lg sm:text-2xl font-black text-foreground">{o.quantity}</p>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-2 sm:p-3 text-center">
                      <p className="text-[10px] text-muted-foreground mb-1">سعر الوحدة</p>
                      <p className="text-sm sm:text-lg font-black text-foreground">{formatCurrency(o.unitPrice ?? 0)}</p>
                    </div>
                    <div className="bg-primary/10 border border-primary/30 rounded-xl p-2 sm:p-3 text-center">
                      <p className="text-[10px] text-primary/70 mb-1">الإجمالي</p>
                      <p className="text-base sm:text-xl font-black text-primary">{formatCurrency(o.totalPrice ?? 0)}</p>
                    </div>
                  </div>

                  {o.notes && (
                    <div className="bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
                      <p className="text-[10px] text-muted-foreground mb-0.5">ملاحظات</p>
                      <p className="text-xs text-foreground">{o.notes}</p>
                    </div>
                  )}

                  {/* ملاحظة الاستلام — مرتجع أو استلام جزئي */}
                  {(o.status === "returned" || o.status === "partial_received") && (() => {
                    const received = o.returnReceived === 1 || o.returnReceived === true;
                    const isRet    = o.status === "returned";
                    return (
                      <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border ${
                        received
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-amber-500/10 border-amber-500/30"
                      }`}>
                        <span className="text-lg">{received ? "✓" : "⏳"}</span>
                        <div>
                          <p className={`text-xs font-bold ${received ? "text-emerald-400" : "text-amber-400"}`}>
                            {received
                              ? (isRet ? "تم استلام الشحنة المرتجعة بنجاح" : "تم استلام الكمية الجزئية بنجاح")
                              : (isRet ? "لم يتم استلام الشحنة بعد" : "لم يتم استلام الكمية الجزئية بعد")}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {received
                              ? (isRet ? "تم استلام المرتجع وإعادته للمخزن" : "تم استلام الجزء المُرتجع وإعادته للمخزن")
                              : "بانتظار التأكيد — البضاعة لا تزال عند شركة الشحن"}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* شريط التفاصيل السفلي */}
              <div className="border-t border-border px-5 py-3 bg-muted/20 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {o.shippingCompanyName && (
                    <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" />{o.shippingCompanyName}</span>
                  )}
                  {o.warehouseName && (
                    <span className="flex items-center gap-1"><Warehouse className="w-3.5 h-3.5" />{o.warehouseName}</span>
                  )}
                  {o.employeeName && (
                    <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" />{o.employeeName}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar — ملخص + ربحية */}
            <div className="space-y-4">

              {/* ملخص مالي */}
              <Card className="border-primary/30">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />الملخص المالي
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">سعر الوحدة</span>
                    <span className="font-semibold">{formatCurrency(o.unitPrice ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">الكمية</span>
                    <span className="font-semibold">× {o.quantity}</span>
                  </div>
                  {shipping > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">الشحن</span>
                      <span className="font-semibold">{formatCurrency(shipping)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">الإجمالي</span>
                    <span className="font-black text-xl text-primary">{formatCurrency(o.totalPrice ?? 0)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* ربحية — للأدمن فقط */}
              {canViewProfitability && hasCost && (
                <Card className={`border ${!isRet && netProfit >= 0 ? "border-emerald-900/50 bg-emerald-900/5" : "border-red-900/50 bg-red-900/5"}`}>
                  <CardHeader className="pb-2 pt-4 px-4 border-b border-border">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      {!isRet && netProfit >= 0
                        ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                      تحليل الربحية
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-3 space-y-2 text-xs">
                    {isRet && (
                      <div className="p-2 rounded bg-red-900/20 text-red-400 border border-red-900/30 text-[10px] font-semibold">
                        ⚠ الطلب مرتجع
                      </div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">الإيرادات</span><span className="text-primary font-semibold">{formatCurrency(revenue)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">تكلفة البضاعة</span><span className="text-amber-400">-{formatCurrency(cost)}</span></div>
                    {shipping > 0 && <div className="flex justify-between"><span className="text-muted-foreground">تكلفة الشحن</span><span className="text-orange-400">-{formatCurrency(shipping)}</span></div>}
                    <Separator />
                    <div className="flex justify-between items-center pt-1">
                      <span className="font-bold">الربح الصافي</span>
                      <span className={`font-black text-base ${!isRet && netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(netProfit)}</span>
                    </div>
                    {revenue > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">هامش الربح</span>
                        <span className={`font-bold ${margin >= 20 ? "text-emerald-400" : margin >= 10 ? "text-amber-400" : "text-red-400"}`}>{margin}%</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            </div>
          </div>
        );
      })() : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── العمود الرئيسي: قائمة المنتجات ── */}
          <div className="lg:col-span-2 space-y-3">

            {/* هيدر القسم */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Package className="w-4 h-4 text-primary" />
                </div>
                منتجات الفاتورة
                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{orders.length}</span>
              </h3>
              {false && (
                <button onClick={() => setShowAddProduct(true)}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary border border-dashed border-primary/40 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors">
                  <Plus className="w-3.5 h-3.5" />إضافة منتج
                </button>
              )}
            </div>

            {/* بطاقات المنتجات */}
            <div className="space-y-2">
              {orders.map((o, idx) => {
                const isThis = o.id === currentId;
                const productImg = products.find((p: any) => p.name === o.product)?.image ?? null;
                const isRet = o.status === "returned";
                return (
                  <div key={o.id} className={`group relative rounded-xl border transition-all ${
                    isThis
                      ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                      : isRet
                        ? "border-red-900/30 bg-red-900/5"
                        : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
                  }`}>
                    <div className="flex items-stretch gap-0">

                      {/* رقم ترتيب */}
                      <div className={`w-8 shrink-0 flex items-center justify-center rounded-r-xl text-xs font-black ${
                        isThis ? "bg-primary/20 text-primary" : "bg-muted/60 text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </div>

                      {/* صورة المنتج */}
                      <div className="w-16 h-16 shrink-0 my-2 mr-2 rounded-lg overflow-hidden border border-border/50 bg-muted flex items-center justify-center">
                        {productImg ? (
                          <img src={productImg} alt={o.product} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-6 h-6 text-muted-foreground opacity-40" />
                        )}
                      </div>

                      {/* التفاصيل */}
                      <div className="flex-1 min-w-0 py-2.5 pr-3 pl-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {isThis && (
                              <span className="text-[9px] text-primary font-black bg-primary/10 px-1.5 py-0.5 rounded-full inline-block mb-1">← الحالي</span>
                            )}
                            <p className="text-sm font-bold text-foreground truncate">{o.product}</p>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <Badge className={`text-[9px] font-bold px-1.5 py-0 h-4 ${statusClasses[o.status] || ""}`}>
                                {statusLabels[o.status] || o.status}
                              </Badge>
                              {o.color && <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{o.color}</span>}
                              {o.size && <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{o.size}</span>}
                            </div>
                          </div>
                          {canDelete && (
                            <Button variant="ghost" size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-900/20 hover:text-red-300 shrink-0 transition-opacity"
                              onClick={() => setShowDeleteId(o.id)} disabled={deletingId === o.id}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>

                        {/* الأرقام */}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">الكمية:</span>
                            <span className="font-bold text-foreground">{o.quantity}</span>
                          </div>
                          <div className="w-px h-3 bg-border/60" />
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">السعر:</span>
                            <span className="font-bold text-foreground">{formatCurrency(o.unitPrice)}</span>
                          </div>
                          <div className="w-px h-3 bg-border/60" />
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">الإجمالي:</span>
                            <span className="font-black text-primary">{formatCurrency(o.totalPrice)}</span>
                          </div>
                        </div>
                        {o.notes && (
                          <p className="text-[10px] text-muted-foreground italic mt-1.5 border-t border-border/40 pt-1.5 line-clamp-1">
                            {o.notes}
                          </p>
                        )}

                        {/* ملاحظة الاستلام — تظهر فقط للمرتجع والاستلام الجزئي */}
                        {(o.status === "returned" || o.status === "partial_received") && (() => {
                          const received = o.returnReceived === 1 || o.returnReceived === true;
                          const isRet    = o.status === "returned";
                          return (
                            <div className={`flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md text-[10px] font-semibold border ${
                              received
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            }`}>
                              <span>{received ? "✓" : "⏳"}</span>
                              <span>
                                {received
                                  ? (isRet ? "تم استلام الشحنة المرتجعة بنجاح" : "تم استلام الكمية الجزئية بنجاح")
                                  : (isRet ? "بانتظار استلام الشحنة المرتجعة" : "بانتظار استلام الكمية الجزئية")}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Sidebar: الملخص المالي + الربحية ── */}
          <div className="space-y-4">
            <Card className="border-primary/30 bg-card">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />الملخص المالي
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2 text-sm">
                {orders.map(o => (
                  <div key={o.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[55%]">
                      {o.product}{o.color ? ` — ${o.color}` : ""}{o.size ? ` / ${o.size}` : ""}
                    </span>
                    <span className="font-semibold">{formatCurrency(o.totalPrice ?? 0)}</span>
                  </div>
                ))}
                <Separator className="border-border" />
                <div className="flex justify-between">
                  <span className="font-bold text-xs">إجمالي الفاتورة</span>
                  <span className="font-black text-lg text-primary">{formatCurrency(invoiceTotal)}</span>
                </div>
              </CardContent>
            </Card>
            {canViewProfitability && (() => {
              const hasCost = orders.some(o => (o.costPrice ?? 0) > 0);
              if (!hasCost) return null;
              let totalRevenue = 0, totalCost = 0, totalShipping = 0, hasReturn = false, allReturned = true;
              for (const o of orders) {
                const qty = o.status === "partial_received" && o.partialQuantity ? o.partialQuantity : o.quantity;
                const isRet = o.status === "returned";
                const retToStock = isRet && (o.returnReceived === 1 || o.returnReceived === true);
                if (isRet) { hasReturn = true; } else { allReturned = false; }
                if (!isRet) totalRevenue += qty * o.unitPrice;
                if (!retToStock) totalCost += qty * (o.costPrice ?? 0);
                // تكلفة الشحن الفعلية = تكلفة المندوب (شركة الشحن) المرتبط بالشحنة
                const courierCompany = shippingCompanies.find((sc: any) => sc.id === (o.shippingCompanyId ?? primaryOrder?.shippingCompanyId));
                totalShipping += Math.abs(Number(courierCompany?.shippingCost ?? o.shippingCost ?? 0));
              }
              const netProfit = totalRevenue - totalCost - totalShipping;
              const margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
              const isPositive = netProfit >= 0;
              return (
                <Card className={`border ${allReturned ? "border-red-900/50 bg-red-900/5" : isPositive ? "border-emerald-900/50 bg-emerald-900/5" : "border-red-900/50 bg-red-900/5"}`}>
                  <CardHeader className="pb-2 pt-4 px-4 border-b border-border">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      {isPositive && !allReturned ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                      تحليل الربحية
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-3 space-y-2 text-xs">
                    {hasReturn && (
                      <div className={`p-2 rounded text-[10px] font-semibold border ${allReturned ? "bg-red-900/20 text-red-400 border-red-900/30" : "bg-amber-900/20 text-amber-400 border-amber-900/30"}`}>
                        {allReturned ? "⚠ الفاتورة مرتجعة بالكامل" : "↩ بعض المنتجات مرتجعة"}
                      </div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">الإيرادات</span><span className="text-primary font-semibold">{formatCurrency(totalRevenue)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">تكلفة البضاعة</span><span className="text-amber-400">-{formatCurrency(totalCost)}</span></div>
                    {totalShipping > 0 && <div className="flex justify-between"><span className="text-muted-foreground">تكلفة الشحن</span><span className="text-orange-400">-{formatCurrency(totalShipping)}</span></div>}
                    <Separator />
                    <div className="flex justify-between items-center pt-1">
                      <span className="font-bold">الربح الصافي</span>
                      <span className={`font-black text-base ${isPositive && !allReturned ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(netProfit)}</span>
                    </div>
                    {totalRevenue > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">هامش الربح</span>
                        <span className={`font-bold ${margin >= 20 ? "text-emerald-400" : margin >= 10 ? "text-amber-400" : "text-red-400"}`}>{margin}%</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </div>
      )}

      <EditOrderRowDialog
        open={!!editingOrder} onOpenChange={v => { if (!v) setEditingOrder(null); }}
        order={editingOrder} shippingCompanies={shippingCompanies}
        products={products} allVariants={allVariants}
        warehouses={warehouses} users={users}
        onSuccess={onRefresh}
      />
      <AddProductDialog
        open={showAddProduct} onOpenChange={setShowAddProduct}
        order={primaryOrder} onSuccess={onRefresh}
      />
      <AlertDialog open={!!showDeleteId} onOpenChange={v => { if (!v) setShowDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المنتج</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا المنتج من الفاتورة؟ لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => showDeleteId && handleDeleteItem(showDeleteId)}
              disabled={!!deletingId} className="bg-red-600 hover:bg-red-700 text-white">
              {deletingId ? "جاري الحذف..." : "نعم، احذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Invoice Edit Dialog ── */}
      <InvoiceEditDialog
        open={showInvoiceEdit}
        onOpenChange={setShowInvoiceEdit}
        primaryOrder={primaryOrder}
        orders={orders}
        shippingCompanies={shippingCompanies}
        warehouses={warehouses}
        users={users}
        canViewFinancials={canViewFinancials}
        products={products}
        allVariants={allVariants}
        onSuccess={onRefresh}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// StatusSelect — Custom professional dropdown
// ─────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "pending",          label: "قيد الانتظار",         icon: "⏳", color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-600/40",   dot: "bg-amber-400" },
  { value: "warehouse_ready",  label: "قيد الشحن في المخزن",  icon: "🏭", color: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-600/40",    dot: "bg-teal-400" },
  { value: "in_shipping",      label: "قيد الشحن",            icon: "🚛", color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-600/40",     dot: "bg-sky-400" },
  { value: "received",         label: "استلم",                icon: "✅", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-600/40", dot: "bg-emerald-400" },
  { value: "delayed",          label: "مؤجل",                 icon: "⚠️", color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-600/40",    dot: "bg-blue-400" },
  { value: "returned",         label: "مرتجع",                icon: "↩️", color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-600/40",     dot: "bg-red-400" },
  { value: "partial_received", label: "استلام جزئي",          icon: "◑",  color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-600/40",  dot: "bg-purple-400" },
] as const;

function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  // fallback mapping للقيم القديمة في الـ DB لأقرب حالة من الـ 7 الحالية
  const LEGACY_STATUS_MAP: Record<string, string> = {
    waiting: "pending",
    confirmed: "warehouse_ready",
    picked_up: "warehouse_ready",
    in_transit: "in_shipping",
    out_for_delivery: "in_shipping",
    delivered: "received",
    cancelled: "returned",
  };
  const normalizedValue = LEGACY_STATUS_MAP[value] ?? value;
  const current = STATUS_OPTIONS.find((o) => o.value === normalizedValue) ?? STATUS_OPTIONS[0];

  // إغلاق لو ضغط برا
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 220),
      });
    }
    setOpen((p) => !p);
  };

  return (
    <div className="relative select-none" style={{ minWidth: 190 }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={`
          w-full flex items-center gap-2 px-3 h-9 rounded-lg border text-sm font-semibold
          transition-all duration-150 cursor-pointer
          ${current.bg} ${current.border} ${current.color}
          hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed
          shadow-sm
        `}
      >
        <span className="text-base leading-none">{current.icon}</span>
        <span className="flex-1 text-right">{current.label}</span>
        <svg
          className={`w-4 h-4 opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown — fixed عشان ميتقطعش بـ overflow */}
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={dropRef}
          style={{
            position: "fixed",
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            zIndex: 9999,
          }}
          className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
        >
          <div className="p-1.5 flex flex-col gap-0.5">
            {STATUS_OPTIONS.map((opt) => {
              const isActive = opt.value === normalizedValue;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold
                    transition-all duration-100 text-right cursor-pointer
                    ${isActive
                      ? `${opt.bg} ${opt.color} ${opt.border} border`
                      : "hover:bg-muted text-foreground border border-transparent"}
                  `}
                >
                  <span className="text-base leading-none w-5 text-center">{opt.icon}</span>
                  <span className="flex-1">{opt.label}</span>
                  {isActive && (
                    <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Urgent Button (نفس زرار البيان بالظبط) ─────────────────────────────────
function ShipmentUrgentButton({
  manifestId,
  shipmentId,
  isUrgent,
  urgentNote,
  onToggled,
  disabled = false,
}: {
  manifestId: number;
  shipmentId: number;
  isUrgent: boolean;
  urgentNote?: string | null;
  onToggled: () => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [note, setNote] = useState(urgentNote ?? "");

  const mutation = useMutation({
    mutationFn: (payload: { isUrgent: boolean; urgentNote?: string | null }) =>
      apiFetch(`/shipment-manifests/${manifestId}/items/${shipmentId}/urgent`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_: any, vars: any) => {
      toast({
        title: vars.isUrgent ? "🔴 تم وضع الاستعجال" : "تم إلغاء الاستعجال",
        description: vars.isUrgent ? "سيظهر إشعار للمندوب فوراً" : undefined,
      });
      setShowNoteDialog(false);
      onToggled();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUrgent) {
      mutation.mutate({ isUrgent: false, urgentNote: null });
    } else {
      setNote("");
      setShowNoteDialog(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || mutation.isPending}
        title={isUrgent ? `إلغاء الاستعجال${urgentNote ? ` — ${urgentNote}` : ""}` : "استعجال هذه الشحنة"}
        className={`
          flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-black border transition-all duration-200
          ${isUrgent
            ? "bg-red-500/20 border-red-500/60 text-red-400 hover:bg-red-500/30 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)]"
            : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400"}
          ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} h-8
        `}
      >
        <Zap className={`w-3 h-3 shrink-0 ${isUrgent ? "fill-red-400" : ""}`} />
        {isUrgent ? "مستعجل!" : "استعجال"}
      </button>

      {showNoteDialog && (
        <Dialog open onOpenChange={open => { if (!open) setShowNoteDialog(false); }}>
          <DialogContent className="bg-card border-red-500/30 max-w-sm" dir="rtl"
            onClick={e => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-400">
                <Zap className="w-4 h-4 fill-red-400" />
                استعجال الشحنة
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-1">
              <p className="text-xs text-muted-foreground">
                سيصل إشعار استعجال للمندوب فور الحفظ. أضف سبباً اختيارياً يظهر له.
              </p>
              <div>
                <Label className="text-xs mb-1.5 block">سبب الاستعجال (اختياري)</Label>
                <Input
                  placeholder="مثال: العميل مستعجل جداً — اتصل قبل التوصيل"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="h-8 text-sm bg-background border-red-500/30 focus:border-red-500"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") mutation.mutate({ isUrgent: true, urgentNote: note.trim() || null }); }}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 h-8 text-xs font-black bg-red-500 hover:bg-red-600 text-white gap-1.5"
                  onClick={() => mutation.mutate({ isUrgent: true, urgentNote: note.trim() || null })}
                  disabled={mutation.isPending}
                >
                  <Zap className="w-3.5 h-3.5 fill-white" />
                  {mutation.isPending ? "جاري الإرسال..." : "استعجال الآن"}
                </Button>
                <Button variant="outline" className="h-8 text-xs border-border" onClick={() => setShowNoteDialog(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ── بيانات العميل التجاري لاختيار الراسل (نفس منطق new-shipment.tsx) ──
interface ShipmentClient { id: number; name: string; phone?: string; phone2?: string; city?: string; region?: string; governorate?: string; address?: string; warehouseId?: number | null; avatar?: string | null; defaultAdSource?: string | null }
// ── مناطق التوصيل (نفس منطق new-shipment.tsx) ──
interface ShipmentZone { id: number; name: string; fromGovernorate?: string; toGovernorate?: string; price: number; isActive?: boolean }
// ── أنواع الشحنات وأسعارها (نفس منطق new-shipment.tsx) ──
interface ParcelTypePricing { id: number; parcelType: string; label?: string; basePrice: number; isActive?: boolean }
const PARCEL_LABELS: Record<string, string> = {
  document: "مستندات", normal: "عادي", fragile: "قابل للكسر",
  heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس", food: "طعام", other: "أخرى",
};

const AVATAR_COLORS = [
  ["#f59e0b","#78350f"],["#10b981","#064e3b"],["#3b82f6","#1e3a8a"],
  ["#8b5cf6","#4c1d95"],["#ef4444","#7f1d1d"],["#ec4899","#831843"],
  ["#06b6d4","#164e63"],["#f97316","#7c2d12"],
];
function getAvatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function ClientAvatar({ avatar, name, className = "w-6 h-6 text-[10px]" }: { avatar?: string | null; name: string; className?: string }) {
  if (avatar && avatar.startsWith("data:")) {
    return <img src={avatar} className={`${className} rounded-full object-cover border border-border/50 shrink-0`} />;
  }
  const [bg, fg] = getAvatarColor(name || "؟");
  return (
    <div className={`${className} rounded-full flex items-center justify-center font-bold shrink-0 border border-primary/20`}
      style={{ background: bg, color: fg }}>
      {(name || "؟").charAt(0)}
    </div>
  );
}

export default function OrderDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, canViewFinancials, canViewProfitability, user, can } = useAuth();
  const canEdit        = isAdmin || can("orders.edit");
  const canDelete      = isAdmin || can("orders.delete");
  const canCreate      = isAdmin || can("orders.create");
  const canFinancials  = isAdmin || can("orders.financials");
  const canWriteOrders = isAdmin || canEdit || canCreate;
  const [isEditing, setIsEditing] = useState(false);
  const [showPartialInput, setShowPartialInput] = useState(false);
  const [partialQty, setPartialQty] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showWaDialog, setShowWaDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>("");
  const [isClosing, setIsClosing] = useState(false);

  // Add product dialog state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [invoiceShowAddProduct, setInvoiceShowAddProduct] = useState(false);
  const [invoiceShowEdit, setInvoiceShowEdit] = useState(false);
  const [addProductName, setAddProductName] = useState("");
  const [addProductQty, setAddProductQty] = useState(1);
  const [addProductPrice, setAddProductPrice] = useState(0);
  const [addProductColor, setAddProductColor] = useState("");
  const [addProductSize, setAddProductSize] = useState("");
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  // Return reason state
  const [showReturnInput, setShowReturnInput] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [returnIsDamaged, setReturnIsDamaged] = useState(false);
  const [returnReceived, setReturnReceived] = useState<boolean | null>(null); // null = لم يُحدد
  const [selectDisplayStatus, setSelectDisplayStatus] = useState<string | null>(null); // قيمة مؤقتة للـ Select
  const returnSectionRef = useRef<HTMLDivElement>(null);

  // Dialog تحويل لـ "قيد الشحن" — اختيار المندوب
  const [showInShippingDialog, setShowInShippingDialog] = useState(false);
  const [inShippingCourierId, setInShippingCourierId] = useState<number | null>(null);

  const initializedRef = useRef(false);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["shipment-detail", id],
    queryFn: () => apiFetch<any>(`/shipments/${id}`),
    enabled: !!id,
    staleTime: 0,
  });

  // ── العميل التجاري المرتبط بالشحنة (الراسل) — يُستخدم لو senderName/senderPhone فاضيين ──
  const senderClientId = (order as any)?.clientId ?? null;
  const { data: senderCommercialClient } = useQuery({
    queryKey: ["finance-clients"],
    queryFn: () => apiFetch<{ id: number; name: string; phone: string | null; phone2: string | null; city: string | null; address: string | null; region: string | null; whatsappGroupLink: string | null }[]>("/finance/clients"),
    enabled: !!senderClientId,
    staleTime: 60_000,
    select: (list) => list.find(c => c.id === senderClientId) ?? null,
  });

  // بيانات الراسل النهائية — من حقول الشحنة المباشرة، وإلا من العميل التجاري المرتبط
  const senderInfo = {
    name: (order as any)?.senderName || senderCommercialClient?.name || null,
    phone: (order as any)?.senderPhone || senderCommercialClient?.phone || senderCommercialClient?.phone2 || null,
    city: (order as any)?.senderCity || senderCommercialClient?.city || senderCommercialClient?.region || null,
    address: senderCommercialClient?.address || null,
    isFromClient: !((order as any)?.senderName) && !!senderCommercialClient,
    whatsappGroupLink: senderCommercialClient?.whatsappGroupLink || null,
  };

  // ── قائمة العملاء التجاريين لاختيار الراسل في التعديل (نفس منطق new-shipment.tsx) ──
  const { data: shipmentClients = [] } = useQuery<ShipmentClient[]>({
    queryKey: ["clients-for-shipment"],
    queryFn: () => apiFetch<ShipmentClient[]>("/finance/clients/for-shipment"),
  });
  const [editClientOpen, setEditClientOpen] = useState(false);


  // الشحنات مش بيها invoiceNumber — نعطل الـ query ده
  const invoiceNumber = null;
  const { data: invoiceOrders = [], refetch: refetchInvoiceOrders, isLoading: isInvoiceLoading, isFetching: isInvoiceFetching, isError: isInvoiceError } = useQuery({
    queryKey: ["invoice-orders", invoiceNumber],
    queryFn: () => ordersApi.byInvoice(invoiceNumber!),
    enabled: false,
    staleTime: 30_000,
    retry: 1,
    placeholderData: (prev: any) => prev,
  });
  // كل أوردرات الفاتورة ماعدا الحالي (للعرض في القائمة)
  const otherInvoiceOrders = invoiceOrders.filter((o: any) => o.id !== id);

  const { data: shipmentZones = [] } = useQuery<ShipmentZone[]>({ queryKey: ["shipment-zones"], queryFn: () => apiFetch("/shipments/zones") });
  // كل مناطق التوصيل — محافظة - منطقة (بدون تكرار لنفس الاسم) — نفس منطق new-shipment.tsx
  const editToGovernorates = useMemo(() => {
    const seen = new Set<string>();
    return shipmentZones
      .filter(z => z.isActive !== false)
      .map(z => {
        const gov = z.toGovernorate?.trim() || "";
        const area = z.name?.trim() || "";
        const label = gov && area ? `${gov} - ${area}` : (gov || area);
        return { label, zone: z };
      })
      .filter(x => x.label)
      .filter(x => {
        const key = x.label.replace(/\s+/g, " ").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [shipmentZones]);
  const [editZoneOpen, setEditZoneOpen] = useState(false);
  const { data: parcelPricing = [] } = useQuery<ParcelTypePricing[]>({ queryKey: ["parcel-pricing"], queryFn: () => apiFetch("/shipments/parcel-pricing") });
  const { data: shippingCompanies } = useQuery({ queryKey: ["shipping"], queryFn: shippingApi.list });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: productsApi.list });
  const { data: allVariants } = useQuery({ queryKey: ["variants"], queryFn: variantsApi.listAll });
  const { data: warehouses }        = useQuery({ queryKey: ["warehouses"], queryFn: warehousesApi.list });
  const { data: users }             = useQuery({ queryKey: ["users"],      queryFn: usersApi.list, enabled: isAdmin });
  // بنود المنتجات المرتبطة بالشحنة
  const { data: shipmentItems = [] } = useQuery({
    queryKey: ["shipment-items", id],
    queryFn:  () => apiFetch<any[]>(`/shipments/${id}/items`),
    enabled:  !!id,
  });
  // الشحنات مش عندها manifest — معطل
  const manifestStatus = null;
  const invoiceManifestStatus = null;

  // mutation لتحديث حالة الشحنة
  const updateOrder = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/shipments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onMutate: async ({ id, data }) => {
      // optimistic update — حدّث الـ UI فوراً
      await queryClient.cancelQueries({ queryKey: ["shipment-detail", id] });
      const prev = queryClient.getQueryData(["shipment-detail", id]);
      queryClient.setQueryData(["shipment-detail", id], (old: any) =>
        old ? { ...old, ...data } : old
      );
      return { prev };
    },
    onError: (_err, { id }, ctx: any) => {
      queryClient.setQueryData(["shipment-detail", id], ctx?.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipment-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
      queryClient.invalidateQueries({ queryKey: ["shipments-stats"] });
    },
  });

  // Edit form — inline product search state (same as AddProductDialog)
  const [editSelectedProduct, setEditSelectedProduct] = useState<any>(null);
  const [editSearchQuery, setEditSearchQuery] = useState("");
  const [editSearchOpen, setEditSearchOpen] = useState(false);
  const [editVariantRows, setEditVariantRows] = useState<{ color: string; size: string; quantity: number }[]>([{ color: "", size: "", quantity: 1 }]);

  // legacy (kept for TS compat — unused after refactor)
  const [editProductId, setEditProductId] = useState<number | null>(null);
  const [editColor, setEditColor] = useState<string>("");

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      customerName: "", phone: "", city: "", address: "", zoneId: null,
      clientId: null,
      senderName: "", senderPhone: "", senderPhone2: "", receiverPhone2: "",
      parcelType: "", weight: "",
      shippingCost: 0, shippingCompanyId: null, trackingNumber: null,
      warehouseId: null, assignedUserId: null,
      adSource: null, adCampaign: null, notes: "",
      rejectionPolicy: null,
    },
  });

  useEffect(() => {
    if (order && !initializedRef.current) {
      form.reset({
        customerName:      (order as any).receiverName ?? order.customerName ?? "",
        phone:             (order as any).receiverPhone ?? order.phone ?? "",
        city:              (order as any).receiverCity ?? (order as any).city ?? "",
        address:           (order as any).receiverAddress ?? order.address ?? "",
        zoneId:            (order as any).zoneId ?? null,
        clientId:          (order as any).clientId ?? null,
        senderName:        (order as any).senderName ?? "",
        senderPhone:       (order as any).senderPhone ?? "",
        senderPhone2:      (order as any).senderPhone2 ?? "",
        receiverPhone2:    (order as any).receiverPhone2 ?? "",
        parcelType:        (order as any).parcelType ?? "",
        weight:            (order as any).weight ?? "",
        shippingCost:      (order as any).shippingFee ?? (order as any).shippingCost ?? 0,
        shippingCompanyId: (order as any).shippingCompanyId ?? null,
        trackingNumber:    (order as any).trackingNumber ?? null,
        warehouseId:       (order as any).warehouseId ?? null,
        assignedUserId:    (order as any).assignedUserId ?? null,
        adSource:          (order as any).adSource ?? null,
        adCampaign:        (order as any).adCampaign ?? null,
        canOpen:           (order as any).canOpen ?? null,
        isDivisible:       (order as any).isDivisible ?? null,
        rejectionPolicy:   (order as any).rejectionPolicy ?? null,
        notes:             (order as any).notes ?? order.notes ?? "",
      });
      initializedRef.current = true;
    }
  }, [order, form]);

  useEffect(() => {
    if (!showReturnInput) return;
    const frame = window.requestAnimationFrame(() => {
      returnSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showReturnInput]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-charts"] });
    queryClient.invalidateQueries({ queryKey: ["orders-summary"] });
    // ← مهم: invalidate الفاتورة المتعددة عشان الـ UI يتحدث
    if (invoiceNumber) {
      queryClient.invalidateQueries({ queryKey: ["invoice-orders", invoiceNumber] });
    }
    // invalidate الأوردر الحالي نفسه
    queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
  };

  const handleStatusChange = (newStatus: string) => {
    if (!order) return;
    // returned و partial_received دايماً بيفتحوا الكارت حتى لو الحالة نفسها
    if (order.status === newStatus && newStatus !== "returned" && newStatus !== "partial_received") return;

    // reset دايماً أول حاجة
    setSelectDisplayStatus(null);
    setShowReturnInput(false);
    setShowPartialInput(false);
    setReturnReason("");
    setReturnNote("");
    setReturnIsDamaged(false);
    setReturnReceived(null);
    setPartialQty("");
    const activeManifest = manifestStatus?.manifestStatus === "open"
      ? manifestStatus
      : invoiceManifestStatus?.manifestStatus === "open"
      ? invoiceManifestStatus
      : null;

    if (newStatus === "partial_received") {
      setSelectDisplayStatus("partial_received");
      setShowPartialInput(true);
      return;
    }
    if (newStatus === "returned") {
      setSelectDisplayStatus("returned");
      setShowReturnInput(true);
      return;
    }

    if (newStatus === "in_shipping") {
      setSelectDisplayStatus("in_shipping");
      setInShippingCourierId((order as any).shippingCompanyId ?? null);
      setShowInShippingDialog(true);
      return;
    }

    if (activeManifest) {
      toast({
        title: "⛔ لا يمكن تعديل حالة الطلب",
        description: `هذا الطلب مرتبط ببيان شحن مفتوح (${activeManifest.manifestNumber}). يجب تعديل حالته من داخل البيان في قسم شركات الشحن فقط.`,
        variant: "destructive",
      });
      return;
    }

    setSelectDisplayStatus(newStatus);
    apiFetch(`/shipments/${id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["shipment-detail", id] });
        queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
        setSelectDisplayStatus(null);
        toast({ title: "تم تحديث الحالة" });
      })
      .catch(() => { setSelectDisplayStatus(null); toast({ title: "خطأ", description: "فشل تحديث الحالة.", variant: "destructive" }); });
  };

  const handlePartialReceived = () => {
    const pQty = parseInt(partialQty);
    if (isNaN(pQty) || pQty < 1) { toast({ title: "خطأ", description: "أدخل كمية صحيحة.", variant: "destructive" }); return; }

    const LOCKED_P = ["received", "partial_received"];
    const partialTargetId = invoiceOrders.length > 1
      ? (invoiceOrders.find((o: any) => !LOCKED_P.includes(o.status))?.id ?? id)
      : id;
    updateOrder.mutate({ id: partialTargetId, data: { status: "partial_received", partialQuantity: pQty } }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(["shipment-detail", id], (old: any) => old ? { ...old, status: "partial_received", partialQuantity: pQty } : old);
        queryClient.invalidateQueries({ queryKey: ["shipment-detail", id] });
        queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
        queryClient.invalidateQueries({ queryKey: ["shipments-stats"] });
        invalidateAll();
        setShowPartialInput(false);
        setPartialQty("");
        setSelectDisplayStatus(null);
        toast({ title: "تم التحديث", description: `تم استلام ${pQty} وحدة جزئياً.` });
      },
      onError: () => {
        setSelectDisplayStatus(null);
        toast({ title: "خطأ", description: "فشل التحديث.", variant: "destructive" });
      },
    });
  };

  const handleReturnConfirm = () => {
    if (!returnReason) { toast({ title: "خطأ", description: "اختر سبب الإرجاع.", variant: "destructive" }); return; }
    if (returnReason === "other" && !returnNote.trim()) { toast({ title: "خطأ", description: "اكتب سبب الإرجاع.", variant: "destructive" }); return; }

    // لو الطلب في بيان شحن مفتوح → يطلب تحديد returnReceived، غير كده تلقائي true
    const inManifest = manifestStatus?.manifestStatus === "open";
    const finalReturnReceived = inManifest ? returnReceived : true;
    if (inManifest && returnReceived === null) { toast({ title: "خطأ", description: "حدد هل تم استلام المرتجع أم لا.", variant: "destructive" }); return; }

    // ظپظٹ invoice mode: ظ†ط³طھط®ط¯ظ… ط£ظٹ ط£ظˆط±ط¯ط± ط؛ظٹط± locked ط¹ط´ط§ظ† ط§ظ„ط³ظٹط±ظپط± ظٹط؛ظٹط± ظƒظ„ ط§ظ„ظپط§طھظˆط±ط©
    const LOCKED_S = ["received", "partial_received"];
    const returnTargetId = invoiceOrders.length > 1
      ? (invoiceOrders.find((o: any) => !LOCKED_S.includes(o.status))?.id ?? id)
      : id;
    updateOrder.mutate({
      id: returnTargetId,
      data: {
        status: "returned",
        returnReason,
        returnNote: returnReason === "other" ? returnNote.trim() : null,
        isDamaged: returnIsDamaged,
        returnReceived: finalReturnReceived,
      } as any,
    }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetOrderQueryKey(id), updated);
        // invalidate manifest-status عشان يتحدث بعد تغيير returnReceived
        queryClient.invalidateQueries({ queryKey: ["order-manifest-status", id] });
        queryClient.invalidateQueries({ queryKey: ["invoice-manifest-status"] });
        invalidateAll();
        setShowReturnInput(false);
        setReturnReason("");
        setReturnNote("");
        setReturnIsDamaged(false);
        setReturnReceived(null);
        setSelectDisplayStatus(null);
        const msg = returnReceived
          ? (returnIsDamaged ? "تم تسجيل المرتجع التالف — لم يُضاف للمخزون." : "تم استلام المرتجع وأُضيف للمخزون.")
          : "تم تسجيل المرتجع — مازال عند شركة الشحن.";
        toast({ title: "تم التسجيل", description: msg });
      },
      onError: () => {
        setSelectDisplayStatus(null);
        toast({ title: "خطأ", description: "فشل تحديث الحالة.", variant: "destructive" });
      },
    });
  };

  const onSubmitEdit = (values: EditFormValues) => {
    // map order form fields → shipment fields
    updateOrder.mutate({ id, data: {
      receiverName:      values.customerName,
      receiverPhone:     values.phone ?? null,
      receiverPhone2:    values.receiverPhone2 ?? null,
      receiverCity:      values.city ?? null,
      receiverAddress:   values.address ?? null,
      zoneId:            values.zoneId ?? null,
      zonePrice:         values.zoneId ? (shipmentZones.find(z => z.id === values.zoneId)?.price ?? undefined) : undefined,
      clientId:          values.clientId ?? null,
      senderName:        values.senderName ?? null,
      senderPhone:       values.senderPhone ?? null,
      senderPhone2:      values.senderPhone2 ?? null,
      parcelType:        values.parcelType || null,
      parcelTypePrice:   values.parcelType ? (parcelPricing.find(p => p.parcelType === values.parcelType)?.basePrice ?? undefined) : undefined,
      weight:            values.weight || null,
      warehouseId:       values.warehouseId ?? null,
      shippingFee:       values.shippingCost ?? null,
      shippingCompanyId: values.shippingCompanyId || null,
      trackingNumber:    values.trackingNumber || null,
      assignedUserId:    values.assignedUserId || null,
      canOpen:           values.canOpen ?? null,
      isDivisible:       values.isDivisible ?? null,
      rejectionPolicy:   values.rejectionPolicy ?? null,
      notes:             values.notes ?? null,
    } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["shipment-detail", id] });
        queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
        setIsEditing(false);
        initializedRef.current = false;
        toast({ title: "تم الحفظ ✅", description: "تم حفظ التعديلات بنجاح." });
      },
      onError: () => toast({ title: "خطأ", description: "فشل الحفظ.", variant: "destructive" }),
    });
  };

  const handleAddProduct = async () => {
    if (!order || !addProductName.trim() || addProductPrice <= 0) return;
    setIsAddingProduct(true);
    try {
      await ordersApi.batchCreate({
        invoiceNumber: (order as any).invoiceNumber ?? undefined,
        customerName: order.customerName,
        phone: order.phone ?? null,
        city: (order as any).city ?? null,
        address: order.address ?? null,
        shippingCompanyId: order.shippingCompanyId ?? null,
        notes: null,
        items: [{
          product: addProductName.trim(),
          color: addProductColor || null,
          size: addProductSize || null,
          quantity: addProductQty,
          unitPrice: addProductPrice,
        }],
      });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
      setShowAddProduct(false);
      setAddProductName(""); setAddProductQty(1); setAddProductPrice(0);
      setAddProductColor(""); setAddProductSize("");
      toast({ title: "تم إضافة المنتج", description: `${addProductName} اتضاف لنفس الفاتورة بنجاح.` });
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "فشل إضافة المنتج.", variant: "destructive" });
    } finally {
      setIsAddingProduct(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // احذف الشحنة عن طريق endpoint الشحنات الصح
      await apiFetch(`/shipments/${id}`, { method: "DELETE" });

      // امسح الشحنة من الكاش
      queryClient.removeQueries({ queryKey: ["shipment-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      queryClient.invalidateQueries({ queryKey: ["shipments-stats"] });

      toast({ title: "تم الحذف", description: "تم حذف الشحنة بنجاح." });
      navigate("/shipments-list");
    } catch (err: any) {
      const msg = err?.message || "فشل حذف الشحنة.";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleShipmentPrint = async () => {
    if (!order) return;

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

    const o = order as any;
    const dateLabel = format(new Date(order.createdAt), "yyyy/MM/dd HH:mm");
    const shipNum   = o.shipmentNumber ?? `#${order.id.toString().padStart(4,"0")}`;
    const tracking  = o.trackingNumber  ?? "—";
    const fmtCurr   = (n: number) =>
      new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
    const PARCEL_LABELS_AR: Record<string, string> = {
      document: "مستندات", normal: "عادي", regular: "عادي", fragile: "قابل للكسر",
      heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس", food: "طعام", other: "أخرى",
    };

    const shippingFee  = Number(o.shippingFee  || 0);
    const codAmount    = Number(o.codAmount    || 0);
    const insuranceFee = Number(o.insuranceFee || 0);
    const storedTotal  = Number(o.totalAmount  || 0);
    const totalAmount  = storedTotal > 0 ? storedTotal : shippingFee + codAmount + insuranceFee;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>شحنة ${shipNum}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}
body{font-family:'Cairo',Tahoma,Arial,sans-serif;background:#fff;color:#111;direction:rtl;font-size:15px}
.page{max-width:800px;margin:20px auto;padding:28px 32px;background:#fff}

/* HEADER */
.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:3px solid #111;margin-bottom:20px}
.header-title{font-size:28px;font-weight:900;letter-spacing:-0.5px}
.header-title span{font-size:16px;font-weight:600;color:#555;display:block;margin-top:4px}
.replacement-badge{display:inline-flex;align-items:center;gap:6px;background:#7c3aed;color:#fff;font-size:13px;font-weight:900;padding:5px 14px;border-radius:999px;margin-top:8px}
.logo{width:90px;height:90px;object-fit:contain;border-radius:8px}

/* TRACKING BAR */
.tracking-bar{background:#111;color:#fff;border-radius:8px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;gap:16px;flex-wrap:wrap}
.tracking-item{text-align:center}
.tracking-item .t-label{font-size:11px;color:#aaa;font-weight:600;margin-bottom:4px}
.tracking-item .t-value{font-size:17px;font-weight:900;color:#fff}
.tracking-item .t-value.highlight{color:#f0c040;font-size:20px}
.tracking-item .t-value.green{color:#4ade80}

/* PARTIES */
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;direction:ltr}
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
.detail-box.highlight{background:#fff;border:2px solid #111}
.detail-box.highlight .d-label{color:#555}
.detail-box.highlight .d-value{color:#111;font-size:22px}

/* NOTES */
.notes-box{border:2px dashed #ccc;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:14px;font-weight:700;color:#333;line-height:1.8}
.notes-box .n-title{font-size:12px;font-weight:700;color:#888;margin-bottom:4px}

/* BARCODE AREA */
.barcode-area{border:2px solid #111;border-radius:8px;padding:14px 20px;text-align:center;margin-bottom:20px;background:#fafafa}
.barcode-area .b-label{font-size:12px;font-weight:700;color:#666;margin-bottom:6px}
.barcode-num{font-size:30px;font-weight:900;letter-spacing:4px;color:#111;font-family:monospace}

/* SHIPMENT FLAGS (فتح/تجزئة) */
.flags-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
.flag-badge{border:1px solid #ddd;border-radius:6px;padding:12px;text-align:center;background:#fafafa;display:flex;flex-direction:column;align-items:center;gap:4px}
.flag-badge .flag-label{font-size:11px;font-weight:700;color:#666}
.flag-badge .flag-value{font-size:16px;font-weight:900;color:#111}

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
  .flags-row{gap:6px;margin-bottom:10px}
  .flag-badge{padding:8px}
  .flag-badge .flag-label{font-size:9px}
  .flag-badge .flag-value{font-size:13px}
  .footer{padding-top:8px;font-size:11px}
  .header,.tracking-bar,.parties,.details-row,.notes-box,.barcode-area,.flags-row{page-break-inside:avoid}
}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-title">
      بوليصة شحن
      <span>رقم الشحنة: ${shipNum} &nbsp;|&nbsp; ${dateLabel}</span>
      ${o.isReplacementRequested ? `<div class="replacement-badge">🔄 طلب استبدال</div>` : ""}
    </div>
    <img class="logo" src="${logoUrl}" alt="Logo" onerror="this.style.display='none'"/>
  </div>

  <!-- TRACKING BAR -->
  <div class="tracking-bar">
    <div class="tracking-item">
      <div class="t-label">طريقة الدفع</div>
      <div class="t-value">${o.paymentMethod === "cod" ? "عند الاستلام" : o.paymentMethod === "prepaid" ? "مدفوع مسبقاً" : "لاحقاً"}</div>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="parties">
    <!-- الراسل (يسار) -->
    <div class="party-box">
      <div class="party-title">📤 الراسل</div>
      <div class="party-name">${o.senderName || "—"}</div>
      ${o.senderPhone ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${o.senderPhone}</span></div>` : ""}
      ${o.senderPhone2 ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${o.senderPhone2}</span></div>` : ""}
      ${o.senderCity ? `<div class="party-row"><span class="icon">📍</span><span class="val">${o.senderCity}</span></div>` : ""}
    </div>
    <!-- المستلم (يمين) -->
    <div class="party-box receiver">
      <div class="party-title">📦 المستلم</div>
      <div class="party-name">${o.receiverName || order.customerName || "—"}</div>
      ${(o.receiverPhone || order.phone) ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${o.receiverPhone || order.phone}</span></div>` : ""}
      ${o.receiverPhone2 ? `<div class="party-row"><span class="icon">📞</span><span class="val phone">${o.receiverPhone2}</span></div>` : ""}
      ${(o.receiverCity || o.city) ? `<div class="party-row"><span class="icon">📍</span><span class="val">${o.receiverCity || o.city}</span></div>` : ""}
      ${(o.receiverAddress || order.address) ? `<div class="party-row"><span class="icon">🏠</span><span class="val">${o.receiverAddress || order.address}</span></div>` : ""}
    </div>
  </div>

  <!-- DETAILS -->
  <div class="details-row" style="grid-template-columns:repeat(3,1fr)">
    <div class="detail-box">
      <div class="d-label">نوع الشحنة</div>
      <div class="d-value">${PARCEL_LABELS_AR[o.parcelType] || o.parcelType || "—"}</div>
    </div>
    <div class="detail-box">
      <div class="d-label">${o.weight ? "الوزن" : "عدد القطع"}</div>
      <div class="d-value">${o.weight ? `${o.weight} كجم` : (o.pieces || "—")}</div>
    </div>
    <div class="detail-box highlight">
      <div class="d-label">الإجمالي</div>
      <div class="d-value">${fmtCurr(totalAmount)}</div>
    </div>
  </div>

  <!-- SHIPMENT FLAGS: حالة الفتح + التجزئة (تظهر فقط لو تم تحديدها فعلياً) -->
  ${(o.canOpen !== null && o.canOpen !== undefined) || (o.isDivisible !== null && o.isDivisible !== undefined) ? `
  <div class="flags-row">
    ${(o.canOpen !== null && o.canOpen !== undefined) ? `
    <div class="flag-badge">
      <div class="flag-label">حالة الشحنة</div>
      <div class="flag-value">${o.canOpen === 0 || o.canOpen === "0" ? "غير مسموح بفتح الشحنة" : "مسموح بفتح الشحنة"}</div>
    </div>` : ""}
    ${(o.isDivisible !== null && o.isDivisible !== undefined) ? `
    <div class="flag-badge">
      <div class="flag-label">تجزئة الشحنة</div>
      <div class="flag-value">${o.isDivisible === 1 || o.isDivisible === "1" ? "الشحنة قابلة للتجزئة" : "الشحنة غير قابلة للتجزئة"}</div>
    </div>` : ""}
  </div>` : ""}

  ${o.notes ? `
  <div class="notes-box">
    <div class="n-title">ملاحظات</div>
    ${o.notes}
  </div>` : ""}

  <!-- FOOTER -->
  <div class="footer">
    <span>شحنة رقم: <strong>${shipNum}</strong>${o.assignedUserName ? ` &nbsp;|&nbsp; المندوب: <strong>${o.assignedUserName}</strong>` : ""}</span>
    <span class="date">طُبع في: ${dateLabel}</span>
  </div>

</div>
</body></html>`);

    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 1200);
  };

  const handlePrint = async () => {
    if (!order) return;

    // استخدم كل منتجات الفاتورة لو متاحة، وإلا الطلب الفردي
    const printOrders: any[] = invoiceOrders.length >= 1 ? invoiceOrders : [order];
    const inv = order.invoiceNumber ?? `#${id}`;
    const dateLabel = format(new Date(order.createdAt), "yyyy/MM/dd HH:mm");
    const logoUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
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

    const fmtEN = (n: number) =>
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

    const totalQty = printOrders.reduce((s: number, o: any) => s + (o.quantity ?? 0), 0);
    const invoiceTotal = printOrders.reduce((s: number, o: any) => s + (o.totalPrice ?? 0), 0);
    const shippingCostTotal = printOrders.reduce((s: number, o: any) => s + Math.abs(o.shippingCost ?? 0), 0);

    // حساب الربحية
    const hasCost = printOrders.some((o: any) => (o.costPrice ?? 0) > 0);
    let totalRevenue = 0, totalCost = 0;
    if (hasCost) {
      for (const o of printOrders) {
        const isRet = o.status === "returned";
        const retToStock = isRet && (o.returnReceived === 1 || o.returnReceived === true);
        const qty = o.status === "partial_received" && o.partialQuantity ? o.partialQuantity : o.quantity;
        if (!isRet) totalRevenue += qty * (o.unitPrice ?? 0);
        if (!retToStock) totalCost += qty * (o.costPrice ?? 0);
      }
    }
    const netProfit = totalRevenue - totalCost - shippingCostTotal;
    const margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

    // صفوف المنتجات
    const rowsHtml = printOrders.map((o: any, idx: number) => {
      const variantLabel = [o.color, o.size].filter(Boolean).join(" / ") || "—";
      const isRet = o.status === "returned";
      const statusAr = (statusLabels as any)[o.status] || o.status;
      return `
        <tr class="${isRet ? "row-returned" : ""}">
          <td>${idx + 1}</td>
          <td class="name">${o.product ?? "—"}</td>
          <td>${variantLabel}</td>
          <td>${o.quantity ?? 1}</td>
          <td>${fmtEN(o.unitPrice ?? 0)}</td>
          <td class="total-cell">${fmtEN(o.totalPrice ?? 0)}</td>
          <td><span class="status-badge">${statusAr}</span></td>
        </tr>`;
    }).join("");

    // قسم الربحية — للأدمن فقط
    const profitHtml = hasCost && canViewProfitability ? `
      <div class="profit-section">
        <div class="section-title">📊 تحليل الربحية</div>
        <div class="profit-grid">
          <div class="profit-row"><span>الإيرادات</span><span class="revenue">${fmtEN(totalRevenue)}</span></div>
          <div class="profit-row"><span>تكلفة البضاعة</span><span class="cost">- ${fmtEN(totalCost)}</span></div>
          ${shippingCostTotal > 0 ? `<div class="profit-row"><span>تكلفة الشحن</span><span class="cost">- ${fmtEN(shippingCostTotal)}</span></div>` : ""}
          <div class="profit-row profit-net"><span>الربح الصافي</span><span class="${netProfit >= 0 ? "positive" : "negative"}">${fmtEN(netProfit)}</span></div>
          <div class="profit-row"><span>هامش الربح</span><span class="${margin >= 20 ? "positive" : margin >= 10 ? "warn" : "negative"}">${margin}%</span></div>
        </div>
      </div>` : "";
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>فاتورة ${inv}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}
body{font-family:'Cairo',Tahoma,Arial,sans-serif;background:#fff;color:#111;font-size:15px;direction:rtl}
.page{max-width:860px;margin:24px auto;background:#fff;padding:32px 36px}

/* ── HEADER ── */
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #ddd;margin-bottom:18px}
.header-left .inv-title{font-size:26px;font-weight:900;color:#111;margin-bottom:6px}
.header-left .inv-meta{font-size:14px;color:#555;line-height:2;font-weight:600}
.header-right .logo{width:140px;height:140px;border-radius:12px;object-fit:contain;border:none;background:transparent;margin-top:16px}

/* ── CLIENT BOX ── */
.client-box{border:1px solid #ccc;border-radius:6px;padding:14px 20px;margin-bottom:18px;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
.client-col{display:flex;flex-direction:column;gap:6px}
.client-row{font-size:15px;color:#222;font-weight:700}
.client-row span.label{color:#555;font-weight:600;margin-left:4px}

/* ── TABLE ── */
table{width:100%;border-collapse:collapse;margin-bottom:18px}
thead tr{background:#333;color:#fff}
th{padding:12px 10px;font-size:15px;font-weight:800;text-align:center}
th:nth-child(2){text-align:right}
tbody tr{border-bottom:1px solid #e0e0e0}
tbody tr:last-child{border-bottom:2px solid #ccc}
td{padding:11px 10px;text-align:center;font-size:15px;font-weight:600;color:#222}
td.name{font-weight:800;text-align:right}
td.num{font-weight:800}
tr.row-returned td{color:#aaa;text-decoration:line-through}

/* ── SUMMARY ── */
.summary-wrap{display:flex;justify-content:flex-start}
.summary-table{width:360px;border:1px solid #ccc;border-radius:6px;overflow:hidden}
.s-row{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;font-size:15px;border-bottom:1px solid #e4e4e4}
.s-row:last-child{border:none;background:#fff;border-top:2px solid #111;color:#111;font-size:17px;font-weight:900;padding:13px 16px}
.s-row:last-child .s-val{color:#111}
.s-lbl{font-weight:600;color:#444}
.s-row:last-child .s-lbl{color:#111;font-weight:700}
.s-val{font-weight:800;color:#111}

/* ── PROFIT ── */
.profit-wrap{margin-top:18px;border:1px solid #ddd;border-radius:6px;overflow:hidden}
.profit-head{background:#f5f5f5;padding:10px 16px;font-size:14px;font-weight:800;color:#444;border-bottom:1px solid #ddd}
.profit-body{padding:10px 16px}
.p-row{display:flex;justify-content:space-between;padding:7px 0;font-size:15px;font-weight:700;border-bottom:1px solid #f2f2f2}
.p-row:last-child{border:none;font-size:16px;font-weight:900;padding-top:10px;border-top:2px solid #ddd !important;margin-top:4px}
.p-rev{color:#1a7a4a}.p-cost{color:#b04a00}
.p-pos{color:#1a7a4a}.p-neg{color:#c0392b}.p-warn{color:#d68910}

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
      <div class="inv-title">فاتورة بيع</div>
      <div class="inv-meta">
        رقم الفاتورة: ${inv}<br>
        التاريخ: ${dateLabel}<br>
        ${printOrders.length} منتج / ${totalQty} قطعة
      </div>
    </div>
    <div class="header-right">
      <img class="logo" src="${logoUrl}" alt="CAPRINA" onerror="this.style.display='none'"/>
    </div>
  </div>

  <!-- CLIENT -->
  <div class="client-box">
    <div class="client-col">
      <div class="client-row"><span class="label">العميل:</span>${order.customerName ?? "—"}</div>
      <div class="client-row"><span class="label">المحافظة:</span>${(order as any).city ?? "—"}</div>
    </div>
    <div class="client-col" style="text-align:left">
      <div class="client-row"><span class="label">الهاتف:</span><span style="direction:ltr;display:inline-block">${order.phone ?? "—"}</span></div>
      <div class="client-row"><span class="label">العنوان:</span>${order.address ?? "—"}</div>
    </div>
  </div>

  <!-- PRODUCTS TABLE -->
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th style="text-align:right">المنتج</th>
        <th>اللون / المقاس</th>
        <th>الكمية</th>
        <th>سعر الوحدة</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${printOrders.map((o: any, idx: number) => {
      const variantLabel = [o.color, o.size].filter(Boolean).join(" / ") || "—";
      const isRet = o.status === "returned";
      return `<tr class="${isRet ? "row-returned" : ""}">
        <td class="num">${idx + 1}</td>
        <td class="name">${o.product ?? "—"}</td>
        <td>${variantLabel}</td>
        <td class="num">${o.quantity ?? 1}</td>
        <td>${fmtEN(o.unitPrice ?? 0)}</td>
        <td class="num">${fmtEN(o.totalPrice ?? 0)}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>

  <!-- SUMMARY -->
  <div class="summary-wrap">
    <div class="summary-table">
      <div class="s-row"><span class="s-lbl">إجمالي المنتجات</span><span class="s-val">${fmtEN(invoiceTotal)}</span></div>
      <div class="s-row"><span class="s-lbl">تكلفة الشحن</span><span class="s-val">${fmtEN(shippingCostTotal)}</span></div>
      <div class="s-row"><span class="s-lbl">الإجمالي الكلي</span><span class="s-val">${fmtEN(invoiceTotal + shippingCostTotal)}</span></div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">CAPRINA — شكراً لتعاملكم معنا</div>

</div>
</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      // ننتظر الـ fonts تتحمل قبل الطباعة
      if ((printWindow as any).document.fonts?.ready) {
        (printWindow as any).document.fonts.ready.then(() => {
          setTimeout(() => { printWindow.focus(); printWindow.print(); }, 300);
        });
      } else {
        setTimeout(() => { printWindow.focus(); printWindow.print(); }, 1200);
      }
    };
  };

  // ── Cash registers for close dialog ──
  const { data: cashData } = useQuery({
    queryKey: ["cash-registers-list"],
    queryFn: cashRegistersApi.list,
    enabled: isAdmin,
  });

  // ── لو الطلب في فاتورة متعددة، نجيب كل الأوردرات عشان نحسب الإجمالي الصح ──
  const { data: invoiceSiblings } = useQuery({
    queryKey: ["invoice-group", order?.invoiceNumber],
    queryFn: () => apiFetch<any[]>(`/orders/by-invoice/${encodeURIComponent(order!.invoiceNumber!)}`),
    enabled: !!order?.invoiceNumber,
    staleTime: 0,
  });

  // إجمالي الإيراد اللي هيتحول للخزنة — لو متعدد يجمع كل الأوردرات غير المغلقة
  const closeInvoiceAmount = invoiceSiblings
    ? invoiceSiblings
        .filter((o: any) => !["received","partial_received","returned"].includes(o.status))
        .reduce((s: number, o: any) => s + (o.totalPrice ?? 0), 0)
    : (order?.totalPrice ?? 0);

  // مبلغ الإغلاق للشحنة = shippingFee (المبلغ الفعلي اللي بيتحول للخزنة)
  const isShipmentOrder = !!(order && ((order as any).receiverName || (order as any).shippingFee));
  const shipmentCloseAmount = isShipmentOrder
    ? Number((order as any).shippingFee || 0) + Number((order as any).codAmount || 0)
    : closeInvoiceAmount;

  const handleCloseInvoice = async () => {
    if (!order) return;
    const regId = parseInt(selectedRegisterId);
    if (!regId) return;
    setIsClosing(true);
    try {
      const targetStatus = isShipmentOrder ? "closed" :
        (order.status === "received" || order.status === "partial_received")
          ? order.status
          : "received";
      await new Promise<void>((resolve, reject) => {
        updateOrder.mutate(
          { id: order.id, data: { status: targetStatus, cashRegisterId: regId } as any },
          { onSuccess: () => resolve(), onError: (e) => reject(e) }
        );
      });
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["cash-registers-list"] });
      const amount = isShipmentOrder ? shipmentCloseAmount : closeInvoiceAmount;
      toast({
        title: "✅ تم إغلاق الطلب",
        description: `تم تحويله لـ «استلم» وإيداع ${new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(amount)} في الخزنة`,
      });
      setShowCloseDialog(false);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message ?? "فشل إغلاق الطلب", variant: "destructive" });
    } finally {
      setIsClosing(false);
    }
  };

  const handleWhatsApp = () => { setShowWaDialog(true); };

  const handleWaSent = () => {
    if (!order) return;
    const FINAL_STATUSES = ["received", "returned", "partial_received"];
    if (!FINAL_STATUSES.includes(order.status)) {
      updateOrder.mutate(
        { id, data: { status: "warehouse_ready" as any } },
        {
          onSuccess: (updated: any) => {
            queryClient.setQueryData(getGetOrderQueryKey(id), updated);
            invalidateAll();
            toast({ title: "تم إرسال واتساب ✅", description: "تم تحويل الشحنة لـ «قيد الشحن في المخزن»" });
          },
        }
      );
    } else {
      toast({ title: "تم فتح واتساب ✅", description: "الرسالة جاهزة للإرسال" });
    }
  };

  if (isLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">جاري التحميل...</div>;
  if (error || !order) return (
    <div className="p-12 text-center">
      <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
      <h2 className="text-lg font-bold mb-2">الطلب غير موجود</h2>
      <Link href="/shipments-list"><Button variant="outline" className="mt-3">العودة للطلبات</Button></Link>
    </div>
  );
  // لو invoiceNumber موجود ولسه بنجيب الطلبات (أول fetch فقط وما فيش بيانات قديمة) → نستنى
  if (invoiceNumber && isInvoiceLoading && !isInvoiceError && invoiceOrders.length === 0) return <div className="p-12 text-center text-muted-foreground animate-pulse">جاري التحميل...</div>;

  const shippingCompany = shippingCompanies?.find(c => c.id === order.shippingCompanyId);
  const orderReturnReason = (order as any).returnReason as string | null;
  const orderReturnNote = (order as any).returnNote as string | null;
  const isOrderLocked = (order.status === "received" || order.status === "partial_received") && !isAdmin;
  const isOrderClosed = order.status === "closed";
  const isManifestLocked = !!invoiceManifestStatus;
  // لو invoiceNumber موجود ولسه loading → ننتظر قبل ما نحدد الوضع (إلا لو حصل error → نعرض الطلب الفردي)
  // isInvoiceMode: ظ„ط§ طھطھط£ط«ط± ط¨ط§ظ„ظ€ refetch â€” طھط³طھط®ط¯ظ… invoiceOrders.length ظ…ط¨ط§ط´ط±ط© (placeholderData ط¨طھط­طھظپط¸ ط¨ط§ظ„ط¨ظٹط§ظ†ط§طھ)
  const isInvoiceMode = !!invoiceNumber && !isInvoiceError && invoiceOrders.length >= 1;

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-in fade-in duration-500">

      {/* ── Dialogs مشتركة بين invoice mode و single mode ── */}
      <Dialog open={showPartialInput} onOpenChange={v => { if (!v) { setShowPartialInput(false); setPartialQty(""); setSelectDisplayStatus(null); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Package className="w-4 h-4 text-purple-400" />استلام جزئي
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">كم وحدة تم استلامها من أصل <span className="font-bold text-foreground">{order?.quantity}</span>؟</p>
          <Input
            type="number"
            min="1"
            max={order?.quantity}
            placeholder={`الحد الأقصى: ${order?.quantity}`}
            value={partialQty}
            onChange={e => setPartialQty(e.target.value)}
            className="h-9 text-sm"
          />
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowPartialInput(false); setPartialQty(""); setSelectDisplayStatus(null); }}>إلغاء</Button>
            <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={handlePartialReceived} disabled={updateOrder.isPending}>
              {updateOrder.isPending ? "جاري..." : "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReturnInput} onOpenChange={v => { if (!v) { setShowReturnInput(false); setReturnReason(""); setReturnNote(""); setReturnIsDamaged(false); setReturnReceived(null); setSelectDisplayStatus(null); } }}>
        <DialogContent className="max-w-md overflow-y-auto max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <RotateCcw className="w-4 h-4 text-red-400" />تسجيل مرتجع — ما سبب الإرجاع؟
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">سيتم تحويل {invoiceOrders.length > 1 ? `${invoiceOrders.length} منتج` : "1 منتج"} إلى «مرتجع».</p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">سبب الإرجاع *</Label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger className="h-9 text-sm bg-card border-red-800 focus:ring-red-700">
                  <SelectValue placeholder="اختر السبب..." />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {returnReason === "other" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">اكتب السبب *</Label>
                <Textarea
                  placeholder="اكتب سبب الإرجاع بالتفصيل..."
                  className="min-h-[70px] text-sm resize-none bg-card border-red-800 focus:ring-red-700"
                  value={returnNote}
                  onChange={e => setReturnNote(e.target.value)}
                />
              </div>
            )}
            {manifestStatus?.manifestStatus === "open" && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">هل تم استلام المرتجع؟ *</p>
                <div className="flex gap-2.5">
                  <button type="button" onClick={() => setReturnReceived(true)}
                    className="flex-1 relative outline-none cursor-pointer p-0 border-0 bg-transparent"
                    style={{ borderRadius: 14 }}>
                    <div className="absolute inset-0 top-1 rounded-[14px] transition-colors" style={{
                      background: returnReceived === true ? "#085041" : "var(--color-background-secondary)",
                      border: returnReceived === true ? "none" : "1.5px solid #9FE1CB",
                    }} />
                    <div className={`relative z-10 flex flex-col items-center gap-1.5 px-3 pt-3 pb-4 rounded-[14px] transition-all ${returnReceived === true ? "mb-1" : "mb-0"}`} style={{
                      background: returnReceived === true ? "#0F6E56" : "var(--color-background-primary)",
                      border: returnReceived === true ? "none" : "1.5px solid #9FE1CB",
                      boxShadow: returnReceived === true ? "inset 0 0 0 2px rgba(159,225,203,0.4)" : "none",
                      transform: returnReceived === true ? "translateY(2px)" : "none",
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={returnReceived === true ? "#E1F5EE" : "#1D9E75"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7L9 18l-5-5"/></svg>
                      <span className="text-[11px] font-semibold leading-tight" style={{ color: returnReceived === true ? "#E1F5EE" : "#0F6E56" }}>تم الاستلام</span>
                      <span className="text-[9px] leading-tight" style={{ color: returnReceived === true ? "rgba(225,245,238,0.7)" : "#5F5E5A" }}>يُعاد للمخزن</span>
                    </div>
                  </button>
                  <button type="button" onClick={() => setReturnReceived(false)}
                    className="flex-1 relative outline-none cursor-pointer p-0 border-0 bg-transparent"
                    style={{ borderRadius: 14 }}>
                    <div className="absolute inset-0 top-1 rounded-[14px] transition-colors" style={{
                      background: returnReceived === false ? "#412402" : "var(--color-background-secondary)",
                      border: returnReceived === false ? "none" : "1.5px solid #FAC775",
                    }} />
                    <div className={`relative z-10 flex flex-col items-center gap-1.5 px-3 pt-3 pb-4 rounded-[14px] transition-all ${returnReceived === false ? "mb-1" : "mb-0"}`} style={{
                      background: returnReceived === false ? "#854F0B" : "var(--color-background-primary)",
                      border: returnReceived === false ? "none" : "1.5px solid #FAC775",
                      boxShadow: returnReceived === false ? "inset 0 0 0 2px rgba(250,199,117,0.4)" : "none",
                      transform: returnReceived === false ? "translateY(2px)" : "none",
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={returnReceived === false ? "#FAEEDA" : "#BA7517"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                      <span className="text-[11px] font-semibold leading-tight" style={{ color: returnReceived === false ? "#FAEEDA" : "#854F0B" }}>مازال في الشحن</span>
                      <span className="text-[9px] leading-tight" style={{ color: returnReceived === false ? "rgba(250,238,218,0.7)" : "#5F5E5A" }}>لا يؤثر على المخزن</span>
                    </div>
                  </button>
                </div>
                <p className="text-[10px] text-center font-medium" style={{ color: returnReceived === true ? "#0F6E56" : returnReceived === false ? "#854F0B" : "var(--color-text-secondary)" }}>
                  {returnReceived === true && "✓ سيتم إرجاع البضاعة للمخزن تلقائياً"}
                  {returnReceived === false && "⏳ مرتجع مازال في شركة الشحن — لن يؤثر على المخزن"}
                  {returnReceived === null && "⚠ مطلوب — حدد حالة الاستلام"}
                </p>
              </div>
            )}
            <div
              className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer transition-colors ${returnIsDamaged ? "border-amber-700 bg-amber-900/20" : "border-border bg-card/50"}`}
              onClick={() => setReturnIsDamaged(v => !v)}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${returnIsDamaged ? "bg-amber-600 border-amber-600" : "border-muted-foreground"}`}>
                {returnIsDamaged && <X className="w-2.5 h-2.5 text-white" />}
              </div>
              <div>
                <p className={`text-xs font-bold ${returnIsDamaged ? "text-amber-400" : "text-muted-foreground"}`}>
                  <AlertTriangle className="w-3 h-3 inline ml-1" />المنتج تالف / غير صالح للبيع
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {returnIsDamaged ? "⚠ لن يُضاف للمخزون — سيُسجَّل كخسارة" : "في حالة التيك، لن يُرجَع للمخزون"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="h-8 text-xs bg-red-700 hover:bg-red-600 text-white gap-1" onClick={handleReturnConfirm} disabled={updateOrder.isPending || (manifestStatus?.manifestStatus === "open" && returnReceived === null)}>
                <RotateCcw className="w-3 h-3" />{updateOrder.isPending ? "جاري..." : "تأكيد الإرجاع"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowReturnInput(false); setReturnReason(""); setReturnNote(""); setReturnIsDamaged(false); setReturnReceived(null); setSelectDisplayStatus(null); }}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── وضع الفاتورة المتعددة: عرض مختلف تماماً ── */}
      {isInvoiceMode && (
        <>
          {/* ── هيدر الفاتورة ── */}
          <div className="rounded-xl overflow-hidden border border-border shadow-sm">
            {/* صف العنوان الرئيسي */}
            <div className="bg-card px-4 py-3 flex items-center justify-between gap-3 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <Link href="/shipments-list">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0 hover:bg-muted">
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-base font-bold truncate">شحنة {(order as any).shipmentNumber ?? invoiceNumber}</h1>
                    <Badge className={`shrink-0 font-bold text-[10px] px-2 py-0.5 ${statusClasses[order.status] || ""}`}>
                      {statusLabels[order.status] || order.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {format(new Date(order.createdAt), "yyyy/MM/dd HH:mm")} · {invoiceOrders.length} منتج
                  </p>
                </div>
              </div>
            </div>

            {/* صف الأزرار */}
            <div className="bg-muted/30 px-3 py-2 flex items-center gap-1.5 flex-wrap">
              {/* زرار الطباعة — للكل */}
              <Button variant="outline" size="sm" onClick={handleShipmentPrint}
                className="h-8 text-xs gap-1.5 border-border bg-card hover:bg-muted">
                <Printer className="w-3.5 h-3.5" />طباعة
              </Button>

              {/* الأزرار دي للأدمن فقط */}
              {isAdmin && (<>
                {/* حذف */}
                {canDelete && (
                  <Button variant="outline" size="sm"
                    onClick={() => {
                      if (isManifestLocked) {
                        toast({ title: "⛔ ممنوع حذف الطلب", description: `هذا الطلب مرتبط ببيان شحن مفتوح (${invoiceManifestStatus?.manifestNumber})`, variant: "destructive" });
                        return;
                      }
                      if (!isOrderLocked) setShowDeleteDialog(true);
                    }}
                    disabled={isOrderLocked}
                    className="h-8 text-xs gap-1.5 border-red-800 text-red-400 hover:bg-red-900/20 disabled:opacity-40 bg-card">
                    <Trash2 className="w-3.5 h-3.5" />حذف
                  </Button>
                )}

                {/* تعديل */}
                {canEdit && (
                  <Button variant="outline" size="sm"
                    onClick={() => !isOrderLocked && setInvoiceShowEdit(true)}
                    disabled={isOrderLocked}
                    className="h-8 text-xs gap-1.5 border-border bg-card disabled:opacity-40">
                    {isOrderLocked ? <Lock className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}تعديل
                  </Button>
                )}

                {/* إغلاق */}
                {(() => {
                  const isAlreadyClosed = ["received","partial_received","returned","closed"].includes(order.status);
                  return (
                    <Button variant="outline" size="sm"
                      onClick={isAlreadyClosed ? undefined : () => {
                        const regs = (cashData as any)?.registers ?? [];
                        const defaultReg = regs.find((r: any) => r.isDefault) ?? regs[0];
                        if (defaultReg) setSelectedRegisterId(String(defaultReg.id));
                        setShowCloseDialog(true);
                      }}
                      disabled={isAlreadyClosed}
                      className={`h-8 text-xs gap-1.5 border ${isAlreadyClosed ? "bg-muted/30 text-muted-foreground border-border cursor-not-allowed opacity-60" : "bg-card hover:bg-emerald-500/10 text-emerald-400 border-emerald-600/50 hover:border-emerald-500"}`}>
                      {isAlreadyClosed ? <Lock className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {isAlreadyClosed ? "مغلق" : "إغلاق"}
                    </Button>
                  );
                })()}

                {/* استعجال — جنب الإغلاق، يظهر بس لو الشحنة في بيان */}
                {!!(order as any).manifestId && (
                  <ShipmentUrgentButton
                    manifestId={(order as any).manifestId}
                    shipmentId={id}
                    isUrgent={!!(order as any).isUrgent}
                    urgentNote={(order as any).urgentNote}
                    onToggled={() => queryClient.invalidateQueries({ queryKey: ["shipment-detail", id] })}
                  />
                )}
              </>)}

              {/* واتساب — للكل */}
              <Button variant="outline" size="sm"
                onClick={handleWhatsApp}
                className="h-8 text-xs gap-1.5 border-green-700 text-green-400 hover:bg-green-500/10 bg-card">
                <MessageCircle className="w-3.5 h-3.5" />واتساب
              </Button>

              {/* تغيير الحالة — للأدمن فقط */}
              {isAdmin && canWriteOrders && (
                <div className="mr-auto">
                  <StatusSelect
                    value={selectDisplayStatus ?? order.status}
                    onChange={handleStatusChange}
                    disabled={updateOrder.isPending}
                  />
                </div>
              )}
            </div>
          </div>
          <InvoiceView
            orders={invoiceOrders}
            currentId={id}
            shippingCompanies={shippingCompanies ?? []}
            products={products ?? []}
            allVariants={allVariants ?? []}
            warehouses={warehouses ?? []}
            users={users ?? []}
            isAdmin={isAdmin}
            canViewFinancials={canViewFinancials}
            canViewProfitability={canViewProfitability}
            canEdit={canEdit}
            canDelete={canDelete}
            canCreate={canCreate}
            externalShowAddProduct={invoiceShowAddProduct}
            onExternalShowAddProductChange={setInvoiceShowAddProduct}
            externalShowEdit={invoiceShowEdit}
            onExternalShowEditChange={setInvoiceShowEdit}
            formatCurrency={formatCurrency}
            onRefresh={() => {
              refetchInvoiceOrders();
              queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
            }}
          />

        </>
      )}

      {/* ── وضع الطلب الفردي ── */}
      {!isInvoiceMode && <><div className="rounded-xl overflow-hidden border border-border shadow-sm">
        {/* صف العنوان */}
        <div className="bg-card px-4 py-3 flex items-center justify-between gap-3 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/shipments-list">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0 hover:bg-muted"><ArrowRight className="h-4 w-4" /></Button>
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold truncate">شحنة {(order as any).shipmentNumber ?? `#${order.id.toString().padStart(4,"0")}`}</h1>
                {!isEditing && (
                  <Badge variant="outline" className={`shrink-0 font-bold border text-[10px] ${statusClasses[selectDisplayStatus ?? order.status] || ""}`}>
                    {statusLabels[selectDisplayStatus ?? order.status] || order.status}
                  </Badge>
                )}
                {!isEditing && (order.status === "in_shipping" || order.status === "in_transit") && (order as any).assignedUserName && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                    🚚 مع {(order as any).assignedUserName}
                  </span>
                )}
                {!isEditing && (order.status === "in_shipping" || order.status === "in_transit") && !(order as any).assignedUserName && (order as any).shippingCompanyName && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                    🚚 مع {(order as any).shippingCompanyName}
                  </span>
                )}
                {!isEditing && (order.status === "in_shipping" || order.status === "in_transit") && !(order as any).assignedUserName && !(order as any).shippingCompanyName && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                    🚚 عند شركة الشحن
                  </span>
                )}
                {isOrderLocked && (
                  <Badge variant="outline" className="shrink-0 text-[9px] font-bold border-amber-700 bg-amber-900/10 text-amber-400 gap-1 flex items-center">
                    <Lock className="w-2.5 h-2.5" /> مقفل
                  </Badge>
                )}
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => updateOrder.mutate({ id: order.id, data: { isReplacementRequested: (order as any).isReplacementRequested ? 0 : 1 } })}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-colors cursor-pointer
                      ${(order as any).isReplacementRequested
                        ? "border-purple-600 bg-purple-900/20 text-purple-400"
                        : "border-border text-muted-foreground hover:border-purple-600/40 hover:text-purple-400"}`}
                    title="تحديد الشحنة كطلب استبدال — يظهر في الفاتورة"
                  >
                    <span className={`w-3 h-3 rounded-[4px] border flex items-center justify-center shrink-0
                      ${(order as any).isReplacementRequested ? "bg-purple-500 border-purple-500" : "border-muted-foreground/50"}`}>
                      {(order as any).isReplacementRequested && (
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </span>
                    🔄 طلب استبدال
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(order.createdAt), "yyyy/MM/dd HH:mm")}</p>
            </div>
          </div>
        </div>

        {/* صف الأزرار */}
        <div className="bg-muted/30 px-3 py-2 flex items-center gap-1.5 flex-wrap">
          {/* فاتورة — للكل */}
          <Button variant="outline" size="sm" onClick={handleShipmentPrint}
            className="h-8 text-xs gap-1.5 border-border bg-card hover:bg-muted">
            <Printer className="w-3.5 h-3.5" />طباعة
          </Button>

          {/* واتساب — للكل */}
          {(order.status === "pending" || order.status === "warehouse_ready") && (
            <Button variant="outline" size="sm" onClick={handleWhatsApp}
              className="h-8 text-xs gap-1.5 border-green-700 text-green-400 hover:bg-green-500/10 bg-card">
              <MessageCircle className="w-3.5 h-3.5" />واتساب
            </Button>
          )}

          {/* الأزرار للأدمن فقط */}
          {isAdmin && !isEditing && (<>
            <StatusSelect
              value={selectDisplayStatus ?? order.status}
              onChange={handleStatusChange}
              disabled={updateOrder.isPending}
            />
            {canEdit && (
              <Button variant="outline" size="sm"
                onClick={() => {
                    if (!isOrderLocked) {
                      navigate(`/shipments/${id}/edit`);
                    }
                  }}
                disabled={isOrderLocked}
                title={isOrderLocked ? "الطلب مقفل — فقط المدير يمكنه التعديل" : undefined}
                className="h-8 text-xs gap-1.5 border-border bg-card disabled:opacity-40">
                {isOrderLocked ? <Lock className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}تعديل
              </Button>
            )}
            {canDelete && (
              <Button variant="outline" size="sm"
                onClick={() => {
                  if (isManifestLocked) {
                    toast({ title: "⛔ ممنوع حذف الطلب", description: `هذا الطلب مرتبط ببيان شحن مفتوح (${invoiceManifestStatus?.manifestNumber}) — لا يمكن حذفه طالما البيان مفتوح. أغلق البيان أولاً ثم احذف الطلب.`, variant: "destructive" });
                    return;
                  }
                  if (!isOrderLocked) setShowDeleteDialog(true);
                }}
                disabled={isOrderLocked}
                title={isManifestLocked ? `ممنوع الحذف — الطلب في بيان مفتوح (${invoiceManifestStatus?.manifestNumber})` : isOrderLocked ? "الطلب مقفل — فقط المدير يمكنه الحذف" : undefined}
                className="h-8 text-xs gap-1.5 border-red-800 text-red-400 hover:bg-red-900/20 bg-card disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" />حذف
              </Button>
            )}
            {(() => {
              const isAlreadyClosed = ["received","partial_received","returned","closed"].includes(order.status);
              return (
                <Button variant="outline" size="sm"
                  onClick={isAlreadyClosed ? undefined : () => {
                    const regs = (cashData as any)?.registers ?? [];
                    const defaultReg = regs.find((r: any) => r.isDefault) ?? regs[0];
                    if (defaultReg) setSelectedRegisterId(String(defaultReg.id));
                    setShowCloseDialog(true);
                  }}
                  disabled={isAlreadyClosed}
                  className={`h-8 text-xs gap-1.5 border ${isAlreadyClosed ? "bg-muted/30 text-muted-foreground border-border cursor-not-allowed opacity-60" : "bg-card hover:bg-emerald-500/10 text-emerald-400 border-emerald-600/50 hover:border-emerald-500"}`}>
                  {isAlreadyClosed ? <Lock className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {isAlreadyClosed ? "مغلق" : "إغلاق"}
                </Button>
              );
            })()}

            {/* استعجال — جنب الإغلاق */}
            {!!(order as any).manifestId && (
              <ShipmentUrgentButton
                manifestId={(order as any).manifestId}
                shipmentId={id}
                isUrgent={!!(order as any).isUrgent}
                urgentNote={(order as any).urgentNote}
                onToggled={() => queryClient.invalidateQueries({ queryKey: ["shipment-detail", id] })}
              />
            )}
          </>)}
        </div>
      </div>



      {/* Partial received Dialog */}
      <Dialog open={showPartialInput} onOpenChange={v => { if (!v) { setShowPartialInput(false); setPartialQty(""); setSelectDisplayStatus(null); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Package className="w-4 h-4 text-purple-400" />استلام جزئي
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">كم وحدة تم استلامها من أصل <span className="font-bold text-foreground">{order?.quantity}</span>؟</p>
          <Input
            type="number"
            min="1"
            max={order?.quantity}
            placeholder={`الحد الأقصى: ${order?.quantity}`}
            value={partialQty}
            onChange={e => setPartialQty(e.target.value)}
            className="h-9 text-sm"
          />
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowPartialInput(false); setPartialQty(""); setSelectDisplayStatus(null); }}>إلغاء</Button>
            <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={handlePartialReceived} disabled={updateOrder.isPending}>
              {updateOrder.isPending ? "جاري..." : "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog قيد الشحن — اختيار المندوب */}
      <Dialog open={showInShippingDialog} onOpenChange={v => { if (!v) { setShowInShippingDialog(false); setInShippingCourierId(null); setSelectDisplayStatus(null); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Truck className="w-4 h-4 text-blue-400" />تحويل إلى قيد الشحن
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">اختر مندوب الشحن المسؤول عن هذه الشحنة:</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">المندوب <span className="text-red-500">*</span></Label>
              <select
                value={inShippingCourierId ?? ""}
                onChange={e => setInShippingCourierId(e.target.value ? Number(e.target.value) : null)}
                className="w-full h-10 text-sm rounded-md border border-input bg-card px-3 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— اختر المندوب —</option>
                {((shippingCompanies as any[]) || []).filter((c: any) => c.isActive !== false).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowInShippingDialog(false); setInShippingCourierId(null); setSelectDisplayStatus(null); }}>إلغاء</Button>
            <Button
              size="sm"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              disabled={!inShippingCourierId || updateOrder.isPending}
              onClick={() => {
                if (!inShippingCourierId) return;
                apiFetch(`/shipments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "in_shipping", shippingCompanyId: inShippingCourierId }) })
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ["shipment-detail", id] });
                    queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
                    setShowInShippingDialog(false);
                    setSelectDisplayStatus(null);
                    setInShippingCourierId(null);
                    const courier = ((shippingCompanies as any[]) || []).find((c: any) => c.id === inShippingCourierId);
                    toast({ title: `✅ قيد الشحن مع ${courier?.name ?? "المندوب"}` });
                  })
                  .catch(() => { setSelectDisplayStatus(null); setShowInShippingDialog(false); toast({ title: "خطأ", description: "فشل تحديث الحالة.", variant: "destructive" }); });
              }}
            >
              <Truck className="w-3.5 h-3.5" />
              {updateOrder.isPending ? "جاري..." : "تأكيد الشحن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return reason Dialog */}
      <Dialog open={showReturnInput} onOpenChange={v => { if (!v) { setShowReturnInput(false); setReturnReason(""); setReturnNote(""); setReturnIsDamaged(false); setReturnReceived(null); setSelectDisplayStatus(null); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <RotateCcw className="w-4 h-4 text-red-400" />تسجيل مرتجع — ما سبب الإرجاع؟
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">سيتم تحويل {invoiceOrders.length > 1 ? `${invoiceOrders.length} منتج` : "1 منتج"} إلى «مرتجع».</p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">سبب الإرجاع *</Label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger className="h-9 text-sm bg-card border-red-800 focus:ring-red-700">
                  <SelectValue placeholder="اختر السبب..." />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {returnReason === "other" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">اكتب السبب *</Label>
                <Textarea
                  placeholder="اكتب سبب الإرجاع بالتفصيل..."
                  className="min-h-[70px] text-sm resize-none bg-card border-red-800 focus:ring-red-700"
                  value={returnNote}
                  onChange={e => setReturnNote(e.target.value)}
                />
              </div>
            )}
            {/* هل تم استلام المرتجع؟ — يظهر فقط لو الطلب في بيان شحن مفتوح */}
            {manifestStatus?.manifestStatus === "open" && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">هل تم استلام المرتجع؟ *</p>
              <div className="flex gap-2.5">
                {/* تم الاستلام */}
                <button type="button" onClick={() => setReturnReceived(true)}
                  className="flex-1 relative outline-none cursor-pointer p-0 border-0 bg-transparent"
                  style={{ borderRadius: 14 }}>
                  <div className="absolute inset-0 top-1 rounded-[14px] transition-colors" style={{
                    background: returnReceived === true ? "#085041" : "var(--color-background-secondary)",
                    border: returnReceived === true ? "none" : "1.5px solid #9FE1CB",
                  }} />
                  <div className={`relative z-10 flex flex-col items-center gap-1.5 px-3 pt-3 pb-4 rounded-[14px] transition-all ${returnReceived === true ? "mb-1" : "mb-0"}`} style={{
                    background: returnReceived === true ? "#0F6E56" : "var(--color-background-primary)",
                    border: returnReceived === true ? "none" : "1.5px solid #9FE1CB",
                    boxShadow: returnReceived === true ? "inset 0 0 0 2px rgba(159,225,203,0.4)" : "none",
                    transform: returnReceived === true ? "translateY(2px)" : "none",
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                      stroke={returnReceived === true ? "#E1F5EE" : "#1D9E75"}
                      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 7L9 18l-5-5"/>
                    </svg>
                    <span className="text-[11px] font-semibold leading-tight" style={{ color: returnReceived === true ? "#E1F5EE" : "#0F6E56" }}>تم الاستلام</span>
                    <span className="text-[9px] leading-tight" style={{ color: returnReceived === true ? "rgba(225,245,238,0.7)" : "#5F5E5A" }}>يُعاد للمخزن</span>
                  </div>
                </button>
                {/* مازال في الشحن */}
                <button type="button" onClick={() => setReturnReceived(false)}
                  className="flex-1 relative outline-none cursor-pointer p-0 border-0 bg-transparent"
                  style={{ borderRadius: 14 }}>
                  <div className="absolute inset-0 top-1 rounded-[14px] transition-colors" style={{
                    background: returnReceived === false ? "#412402" : "var(--color-background-secondary)",
                    border: returnReceived === false ? "none" : "1.5px solid #FAC775",
                  }} />
                  <div className={`relative z-10 flex flex-col items-center gap-1.5 px-3 pt-3 pb-4 rounded-[14px] transition-all ${returnReceived === false ? "mb-1" : "mb-0"}`} style={{
                    background: returnReceived === false ? "#854F0B" : "var(--color-background-primary)",
                    border: returnReceived === false ? "none" : "1.5px solid #FAC775",
                    boxShadow: returnReceived === false ? "inset 0 0 0 2px rgba(250,199,117,0.4)" : "none",
                    transform: returnReceived === false ? "translateY(2px)" : "none",
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                      stroke={returnReceived === false ? "#FAEEDA" : "#BA7517"}
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="3" width="15" height="13" rx="2"/>
                      <path d="M16 8h4l3 5v3h-7V8z"/>
                      <circle cx="5.5" cy="18.5" r="2.5"/>
                      <circle cx="18.5" cy="18.5" r="2.5"/>
                    </svg>
                    <span className="text-[11px] font-semibold leading-tight" style={{ color: returnReceived === false ? "#FAEEDA" : "#854F0B" }}>مازال في الشحن</span>
                    <span className="text-[9px] leading-tight" style={{ color: returnReceived === false ? "rgba(250,238,218,0.7)" : "#5F5E5A" }}>لا يؤثر على المخزن</span>
                  </div>
                </button>
              </div>
              <p className="text-[10px] text-center font-medium" style={{
                color: returnReceived === true ? "#0F6E56" : returnReceived === false ? "#854F0B" : "var(--color-text-secondary)",
              }}>
                {returnReceived === true && "✓ سيتم إرجاع البضاعة للمخزن تلقائياً"}
                {returnReceived === false && "⏳ مرتجع مازال في شركة الشحن — لن يؤثر على المخزن"}
                {returnReceived === null && "⚠ مطلوب — حدد حالة الاستلام"}
              </p>
            </div>
            )}
            {/* Damaged checkbox */}
            <div
              className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer transition-colors ${returnIsDamaged ? "border-amber-700 bg-amber-900/20" : "border-border bg-card/50"}`}
              onClick={() => setReturnIsDamaged(v => !v)}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${returnIsDamaged ? "bg-amber-600 border-amber-600" : "border-muted-foreground"}`}>
                {returnIsDamaged && <X className="w-2.5 h-2.5 text-white" />}
              </div>
              <div>
                <p className={`text-xs font-bold ${returnIsDamaged ? "text-amber-400" : "text-muted-foreground"}`}>
                  <AlertTriangle className="w-3 h-3 inline ml-1" />
                  المنتج تالف / غير صالح للبيع
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {returnIsDamaged ? "⚠ لن يُضاف للمخزون — سيُسجَّل كخسارة" : "في حالة التيك، لن يُرجَع للمخزون"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="h-8 text-xs bg-red-700 hover:bg-red-600 text-white gap-1" onClick={handleReturnConfirm} disabled={updateOrder.isPending || (manifestStatus?.manifestStatus === "open" && returnReceived === null)}>
                <RotateCcw className="w-3 h-3" />{updateOrder.isPending ? "جاري..." : "تأكيد الإرجاع"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowReturnInput(false); setReturnReason(""); setReturnNote(""); setReturnIsDamaged(false); setReturnReceived(null); setSelectDisplayStatus(null); }}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── بيانات البيان (لو الطلب في بيان شحن ومش في قيد الانتظار) ──────────────────────────── */}
      {manifestStatus && order.status !== "pending" && (
        <Card className={`border ${
          manifestStatus.deliveryStatus === "returned"
            ? "border-red-800 bg-red-900/10"
            : manifestStatus.deliveryStatus === "delivered"
            ? "border-emerald-800 bg-emerald-900/10"
            : manifestStatus.deliveryStatus === "partial_received"
            ? "border-teal-800 bg-teal-900/10"
            : manifestStatus.deliveryStatus === "postponed"
            ? "border-orange-800 bg-orange-900/10"
            : "border-border bg-muted/5"
        }`}>
          <CardContent className="p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground">بيان الشحن</span>
                <Link href={`/shipping/manifests/${manifestStatus.manifestId}`}>
                  <span className="text-xs font-mono text-primary hover:underline cursor-pointer">{manifestStatus.manifestNumber}</span>
                </Link>
                <Badge variant="outline" className={`text-[9px] font-bold ${manifestStatus.manifestStatus === "open" ? "border-green-600 text-green-500" : "border-border text-muted-foreground"}`}>
                  {manifestStatus.manifestStatus === "open" ? "مفتوح" : "مغلق"}
                </Badge>
              </div>
              <Badge variant="outline" className={`text-[10px] font-bold border ${
                manifestStatus.deliveryStatus === "delivered" ? "border-emerald-600 text-emerald-400" :
                manifestStatus.deliveryStatus === "returned" ? "border-red-600 text-red-400" :
                manifestStatus.deliveryStatus === "postponed" ? "border-orange-600 text-orange-400" :
                manifestStatus.deliveryStatus === "partial_received" ? "border-teal-600 text-teal-400" :
                "border-border text-muted-foreground"
              }`}>
                {{
                  delivered: "مسلَّم ✓",
                  returned: "مرتجع",
                  postponed: "مؤجل",
                  partial_received: `استلم جزئي${manifestStatus.partialQuantity ? ` (${manifestStatus.partialQuantity})` : ""}`,
                  pending: "قيد الانتظار",
                }[manifestStatus.deliveryStatus] ?? manifestStatus.deliveryStatus}
              </Badge>
            </div>

            {/* حالة المرتجع — تظهر فقط لو حالة الطلب الفعلية = returned */}
            {manifestStatus.deliveryStatus === "returned" && order.status === "returned" && (() => {
              // اعتمد على order.returnReceived كمصدر رئيسي
              const rr = (order as any).returnReceived ?? manifestStatus.returnReceived;
              return (
                <div className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold ${
                  rr === 1 || rr === true
                    ? "bg-emerald-900/20 text-emerald-400 border border-emerald-700"
                    : rr === 0 || rr === false
                    ? "bg-orange-900/20 text-orange-400 border border-orange-700"
                    : "bg-muted/20 text-muted-foreground border border-border"
                }`}>
                  {(rr === 1 || rr === true) && <><CheckCircle2 className="w-3.5 h-3.5" /> تم استلام المرتجع — البضاعة رجعت للمخزن</>}
                  {(rr === 0 || rr === false) && <><Clock className="w-3.5 h-3.5" /> المرتجع مازال عند شركة الشحن — لم يُستلم بعد</>}
                </div>
              );
            })()}

            {manifestStatus.deliveryNote && (
              <p className="text-xs text-muted-foreground">ملاحظة: {manifestStatus.deliveryNote}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── حالة كل منتج في الفاتورة المتعددة ───────────────────────────────── */}
      {invoiceOrders && invoiceOrders.length > 1 && (
        <Card className="border-border bg-muted/5">
          <CardContent className="p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground">حالة منتجات الفاتورة في البيان</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {invoiceOrders.map((item: any) => {
                const isThis = item.id === id;
                const ds = item.status;
                const dsColor =
                  ds === "delivered" ? "border-emerald-600 text-emerald-400 bg-emerald-900/10" :
                  ds === "returned" ? "border-red-600 text-red-400 bg-red-900/10" :
                  ds === "partial_received" ? "border-teal-600 text-teal-400 bg-teal-900/10" :
                  ds === "postponed" ? "border-orange-600 text-orange-400 bg-orange-900/10" :
                  "border-border text-muted-foreground bg-muted/10";
                const dsLabel: Record<string, string> = {
                  delivered: "✓ مسلَّم",
                  returned: "↩ مرتجع",
                  partial_received: `◑ استلم جزئي${item.partialQuantity != null ? ` (${item.partialQuantity}/${item.quantity})` : ""}`,
                  postponed: "⏸ مؤجل",
                  pending: "⏳ قيد الانتظار",
                };
                const subStatus = (() => {
                  if (ds === "returned") {
                    if (item.returnReceived === 1) return <span className="text-[9px] text-emerald-400">✓ المرتجع في المخزن</span>;
                    if (item.returnReceived === 0) return <span className="text-[9px] text-orange-400">🚚 المرتجع عند الشحن</span>;
                  }
                  if (ds === "partial_received") {
                    if (item.returnReceived === 0) return <span className="text-[9px] text-orange-400">🚚 الباقي عند الشحن</span>;
                    if (item.returnReceived === 1) return <span className="text-[9px] text-emerald-400">✓ الباقي في المخزن</span>;
                  }
                  return null;
                })();
                return (
                  <div key={item.id} className={`flex items-center justify-between rounded-md px-2.5 py-1.5 border ${isThis ? "border-primary/40 bg-primary/5" : "border-border bg-transparent"}`}>
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className={`text-xs font-semibold truncate ${isThis ? "text-primary" : "text-foreground"}`}>
                        {isThis && <span className="text-[9px] text-primary font-bold ml-1">← هذا الطلب</span>}
                        {item.product}
                      </span>
                      <span className="text-[9px] text-muted-foreground">كمية: {item.quantity}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      {ds ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[9px] font-bold border ${dsColor}`}>
                          {dsLabel[ds] ?? ds}
                        </span>
                      ) : (
                        <span className="text-[9px] text-muted-foreground">لا يوجد بيان</span>
                      )}
                      {subStatus}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">

          {/* ── بطاقة بيانات الشحنة ── */}
          {!isEditing && (() => {
            const shippingFee  = Math.abs(Number((order as any).shippingFee  || (order as any).shippingCost || 0));
            const codAmount    = Number((order as any).codAmount    || 0);
            const insuranceFee = Math.abs(Number((order as any).insuranceFee || 0));
            const storedTotal  = Number((order as any).totalAmount  || 0);
            const totalAmount  = storedTotal > 0 ? storedTotal : codAmount + shippingFee + insuranceFee;
            return (
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">

                {/* ── Header: اسم المستلم + الـ badges ── */}
                <div className="px-5 pt-4 pb-3 border-b border-border/50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground font-semibold mb-1">المستلم</p>
                      <h2 className="text-xl font-black text-foreground leading-tight">
                        {(order as any).receiverName || order.customerName || "—"}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <Badge className={`text-xs font-bold px-3 py-1 ${statusClasses[order.status] || ""}`}>
                        {statusLabels[order.status] || order.status}
                      </Badge>
                      {(order.status === "in_shipping" || order.status === "in_transit") && (order as any).assignedUserName && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                          🚚 مع {(order as any).assignedUserName}
                        </span>
                      )}
                      {(order.status === "in_shipping" || order.status === "in_transit") && !(order as any).assignedUserName && (order as any).shippingCompanyName && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2 py-0.5">
                          🚚 مع {(order as any).shippingCompanyName}
                        </span>
                      )}
                      {(order as any).paymentMethod && (
                        <Badge variant="outline" className="text-[10px] border-amber-600/50 text-amber-400 px-2 py-0.5">
                          {(order as any).paymentMethod === "cod" ? "COD" : (order as any).paymentMethod === "prepaid" ? "مدفوع مسبقاً" : "لاحقاً"}
                        </Badge>
                      )}
                      {(order as any).parcelType && (
                        <Badge variant="outline" className="text-[10px] border-border/60 text-muted-foreground px-2 py-0.5">{(order as any).parcelType}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── بيانات الاتصال والموقع — قائمة عمودية ── */}
                <div className="px-5 py-3 space-y-3 border-b border-border/50">
                  {/* هاتف المستلم */}
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 shrink-0 pt-0.5">
                      <Phone className="w-3 h-3 text-primary/60" />هاتف المستلم
                    </span>
                    <div className="text-left" dir="ltr">
                      <span className="text-sm font-bold text-foreground block">{(order as any).receiverPhone || order.phone || "—"}</span>
                      {(order as any).receiverPhone2 && (
                        <span className="text-[11px] text-muted-foreground block">{(order as any).receiverPhone2}</span>
                      )}
                    </div>
                  </div>
                  {/* المحافظة */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 shrink-0">
                      <MapPin className="w-3 h-3 text-primary/60" />المحافظة
                    </span>
                    <span className="text-sm font-bold text-foreground text-left">
                      {(order as any).receiverCity || (order as any).city || (order as any).zoneLabel || "—"}
                    </span>
                  </div>
                  {/* العنوان */}
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 shrink-0 pt-0.5">
                      <MapPin className="w-3 h-3 text-primary/60" />العنوان
                    </span>
                    <span className="text-sm font-semibold text-foreground text-left leading-snug max-w-[60%]">
                      {(order as any).receiverAddress || order.address || "—"}
                    </span>
                  </div>
                </div>

                {/* ── الملخص المالي — 4 خانات ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-border/50">
                  <div className="px-4 py-3.5 text-center" style={{borderLeft:"1px solid hsl(var(--border)/0.5)"}}>
                    <p className="text-[10px] text-muted-foreground mb-1 font-medium">حالة الشحنة (الفتح)</p>
                    <p className="text-sm font-black text-foreground">
                      {(order as any).canOpen === 1 || (order as any).canOpen === "1" ? "مسموح بفتح الشحنة" : (order as any).canOpen === 0 || (order as any).canOpen === "0" ? "غير مسموح بفتح الشحنة" : "—"}
                    </p>
                  </div>
                  <div className="px-4 py-3.5 text-center" style={{borderLeft:"1px solid hsl(var(--border)/0.5)"}}>
                    <p className="text-[10px] text-muted-foreground mb-1 font-medium">تجزئة الشحنة</p>
                    <p className="text-sm font-black text-foreground">
                      {(order as any).isDivisible === 1 || (order as any).isDivisible === "1" ? "قابلة للتجزئة" : (order as any).isDivisible === 0 || (order as any).isDivisible === "0" ? "غير قابلة" : "—"}
                    </p>
                  </div>
                  <div className="px-4 py-3.5 text-center" style={{borderLeft:"1px solid hsl(var(--border)/0.5)"}}>
                    <p className="text-[10px] text-muted-foreground mb-1 font-medium">حالة الرفض</p>
                    <p className="text-sm font-black text-foreground">
                      {(order as any).rejectionPolicy === "full_fee" ? "دفع الشحن كاملا" : (order as any).rejectionPolicy === "free" ? "الشحن مجانا" : "—"}
                    </p>
                  </div>
                  <div className="px-4 py-3.5 text-center bg-primary/5">
                    <p className="text-[10px] text-primary/70 mb-1 font-medium">الإجمالي</p>
                    <p className="text-xl font-black text-primary">{formatCurrency(totalAmount)}</p>
                  </div>
                </div>

                {/* ── COD + ملاحظات ── */}
                {(canViewFinancials && codAmount > 0 || (order as any).notes) && (
                  <div className="px-4 py-3 border-b border-border/50 space-y-2">
                    {canViewFinancials && codAmount > 0 && (
                      <div className="flex items-center justify-between bg-amber-900/10 border border-amber-800/30 rounded-xl px-4 py-2.5">
                        <span className="text-xs text-amber-400/80 font-medium flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5" />COD — مبلغ عند الاستلام
                        </span>
                        <span className="text-base font-black text-amber-400">{formatCurrency(codAmount)}</span>
                      </div>
                    )}
                    {(order as any).notes && (
                      <div className="flex items-start gap-2.5 bg-muted/30 rounded-xl px-4 py-2.5 border border-border/40">
                        <MessageCircle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-xs text-foreground">{(order as any).notes}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── حالة المرتجع / الاستلام الجزئي ── */}
                {(order.status === "returned" || order.status === "partial_received") && (() => {
                  const received = (order as any).returnReceived === 1 || (order as any).returnReceived === true;
                  const isRet    = order.status === "returned";
                  return (
                    <div className={`mx-4 mb-3 mt-3 flex items-center gap-3 rounded-xl px-4 py-3 border ${
                      received ? "bg-emerald-500/10 border-emerald-500/30" : "bg-amber-500/10 border-amber-500/30"
                    }`}>
                      <span className="text-lg shrink-0">{received ? "✓" : "⏳"}</span>
                      <div>
                        <p className={`text-xs font-bold ${received ? "text-emerald-400" : "text-amber-400"}`}>
                          {received
                            ? (isRet ? "تم استلام الشحنة المرتجعة بنجاح" : "تم استلام الكمية الجزئية بنجاح")
                            : (isRet ? "لم يتم استلام الشحنة بعد" : "لم يتم استلام الكمية الجزئية بعد")}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {received
                            ? (isRet ? "تم استلام المرتجع وإعادته للمخزن" : "تم استلام الجزء المُرتجع وإعادته للمخزن")
                            : "بانتظار التأكيد — البضاعة لا تزال عند شركة الشحن"}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Footer: شركة الشحن / المندوب / رقم التتبع / أنشأه ── */}
                <div className="px-5 py-3 bg-muted/10 flex items-center gap-3 flex-wrap">
                  {(order as any).trackingNumber && (
                    <span className="flex items-center gap-1.5 text-xs font-mono bg-muted/60 px-2.5 py-1 rounded-lg border border-border/50 text-muted-foreground">
                      <span className="text-primary/50">#</span>{(order as any).trackingNumber}
                    </span>
                  )}
                  {(order as any).shippingCompanyName && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <Truck className="w-3.5 h-3.5 text-primary/50" />{(order as any).shippingCompanyName}
                    </span>
                  )}
                  {(order as any).assignedUserName && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-500/60" />{(order as any).assignedUserName}
                    </span>
                  )}
                  {(order as any).createdByName && (
                    <span className="text-[10px] text-muted-foreground/40 mr-auto">أنشأه: {(order as any).createdByName}</span>
                  )}
                </div>

              </div>
            );
          })()}

          {/* ── بطاقة تفاصيل الراسل — منفصلة تحت بطاقة المستلم ── */}
          {!isEditing && senderInfo.name && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
              <div className="px-5 pt-4 pb-3 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[10px] text-muted-foreground font-semibold">الراسل</p>
                      {senderInfo.isFromClient && (
                        <Badge variant="outline" className="text-[9px] font-bold border-primary/40 text-primary px-1.5 py-0 h-4">
                          من ملف العميل التجاري
                        </Badge>
                      )}
                    </div>
                    <h2 className="text-lg font-black text-foreground leading-tight">
                      {senderInfo.name}
                    </h2>
                  </div>
                  {senderInfo.phone && (
                    <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5 h-9 bg-green-600 hover:bg-green-700 text-white shrink-0"
                      onClick={async () => {
                        const DEFAULT_SENDER_ISSUE_BODY =
                          `السلام عليكم يا {senderName} 👋\n\n` +
                          `بنتواصل معاك بخصوص شحنة العميل *{receiverName}*.\n\n` +
                          `*تفاصيل الشحنة:*\n` +
                          `• رقم البوليصة: *{shipmentNumber}*\n` +
                          `• رقم التتبع: *{trackingNumber}*\n` +
                          `• حالة الشحنة: *{status}*\n` +
                          `• هاتف المستلم: *{receiverPhone}*\n` +
                          `• المنطقة: *{zone}*\n` +
                          `• رسوم الشحن: *{shippingFee}*\n` +
                          `• مبلغ COD: *{codAmount}*\n\n` +
                          `فيه مشكلة بخصوص العميل ده، ياريت نتواصل بخصوصها 🙏\n\n` +
                          `شكراً لتعاونك.`;
                        let templateBody = DEFAULT_SENDER_ISSUE_BODY;
                        try {
                          const waSettings = await apiFetch<{ templates: { name: string; body: string }[] }>("/whatsapp/settings");
                          const tpl = waSettings?.templates?.find(t => t.name === "مشكلة العميل");
                          if (tpl) templateBody = tpl.body;
                        } catch {
                          // استخدم الرسالة الافتراضية لو فشل تحميل القالب
                        }
                        const body = applySenderIssueTemplate(templateBody, {
                          id: order.id,
                          shipmentNumber: (order as any).shipmentNumber ?? null,
                          receiverName: (order as any).receiverName || order.customerName || "—",
                          receiverPhone: (order as any).receiverPhone || order.phone || null,
                          senderName: senderInfo.name,
                          trackingNumber: (order as any).trackingNumber ?? null,
                          status: statusLabels[order.status] || order.status,
                          shippingFee: (order as any).shippingFee ?? (order as any).shippingCost ?? 0,
                          codAmount: (order as any).codAmount ?? 0,
                          zoneLabel: (order as any).receiverCity || (order as any).city || (order as any).zoneLabel || null,
                        });
                        const link = buildWhatsAppLink(senderInfo.phone!, body);
                        window.open(link, "_blank", "noopener,noreferrer");
                      }}
                      title="إرسال رسالة لرقم الراسل مباشرة"
                    >
                      <MessageCircle className="w-4 h-4" />
                      واتساب الراسل
                    </Button>
                    {senderInfo.whatsappGroupLink && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-9 border-green-600/40 text-green-600 hover:bg-green-600/10 shrink-0"
                        onClick={async () => {
                          const DEFAULT_SENDER_ISSUE_BODY =
                            `مرحباً {senderName} 👋\n\n` +
                            `بخصوص الشحنة رقم *{shipmentNumber}*:\n` +
                            `• اسم المستلم: *{receiverName}*\n` +
                            `• حالة الشحنة: *{status}*\n` +
                            `• هاتف المستلم: *{receiverPhone}*\n` +
                            `• المنطقة: *{zone}*\n` +
                            `• رسوم الشحن: *{shippingFee}*\n` +
                            `• مبلغ COD: *{codAmount}*\n\n` +
                            `فيه مشكلة بخصوص العميل ده، ياريت نتواصل بخصوصها 🙏\n\n` +
                            `شكراً لتعاونك.`;
                          let templateBody = DEFAULT_SENDER_ISSUE_BODY;
                          try {
                            const waSettings = await apiFetch<{ templates: { name: string; body: string }[] }>("/whatsapp/settings");
                            const tpl = waSettings?.templates?.find(t => t.name === "مشكلة العميل");
                            if (tpl) templateBody = tpl.body;
                          } catch {
                            // استخدم الرسالة الافتراضية لو فشل تحميل القالب
                          }
                          const body = applySenderIssueTemplate(templateBody, {
                            id: order.id,
                            shipmentNumber: (order as any).shipmentNumber ?? null,
                            receiverName: (order as any).receiverName || order.customerName || "—",
                            receiverPhone: (order as any).receiverPhone || order.phone || null,
                            senderName: senderInfo.name,
                            trackingNumber: (order as any).trackingNumber ?? null,
                            status: statusLabels[order.status] || order.status,
                            shippingFee: (order as any).shippingFee ?? (order as any).shippingCost ?? 0,
                            codAmount: (order as any).codAmount ?? 0,
                            zoneLabel: (order as any).receiverCity || (order as any).city || (order as any).zoneLabel || null,
                          });

                          // نسخ الرسالة: نجرب الـ Clipboard API الحديثة الأول، ثم نتحقق فعليًا إن
                          // النسخ نجح (readText) لأن بعض المتصفحات زي Brave بترجع resolved كاذب
                          // من writeText من غير ما تكتب فعليًا (خصوصًا بعد await async). لو التحقق
                          // فشل، أو الكتابة نفسها فشلت، نرجع لطريقة execCommand القديمة اللي
                          // بتشتغل sync ومش محتاجة إذن المتصفح.
                          let copied = false;
                          try {
                            await navigator.clipboard.writeText(body);
                            const verify = await navigator.clipboard.readText();
                            copied = verify === body;
                          } catch {
                            copied = false;
                          }
                          if (!copied) {
                            try {
                              const textarea = document.createElement("textarea");
                              textarea.value = body;
                              textarea.style.position = "fixed";
                              textarea.style.opacity = "0";
                              document.body.appendChild(textarea);
                              textarea.focus();
                              textarea.select();
                              copied = document.execCommand("copy");
                              document.body.removeChild(textarea);
                            } catch {
                              copied = false;
                            }
                          }

                          toast(
                            copied
                              ? {
                                  title: "📋 تم نسخ الرسالة بنجاح",
                                  description: "هيتفتح جروب العميل دلوقتي — اضغط Ctrl+V داخل مربع إرسال الرسالة في واتساب عشان تلزقها.",
                                  duration: 6000,
                                }
                              : {
                                  title: "⚠️ تعذر نسخ الرسالة تلقائياً",
                                  description: "هتحتاج تنسخ الرسالة يدويًا وتبعتها في الجروب.",
                                  variant: "destructive",
                                  duration: 8000,
                                }
                          );

                          // فتح جروب الواتساب مباشرة بالرابط النهائي — من غير نافذة فاضية أو prompt
                          // بينهم، عشان التاب الجديد ميتجمدش أو يفضل فاضي
                          window.open(senderInfo.whatsappGroupLink!, "_blank", "noopener,noreferrer");
                        }}
                        title="نسخ رسالة مشكلة العميل وفتح جروب واتساب الخاص بالعميل"
                      >
                        <Users className="w-4 h-4" />
                        جروب العميل
                      </Button>
                    )}
                    </div>
                  )}
                </div>
              </div>
              <div className="px-5 py-3 space-y-2.5">
                {senderInfo.phone && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 shrink-0 pt-0.5">
                      <Phone className="w-3 h-3 text-primary/60" />هاتف الراسل
                    </span>
                    <span className="text-sm font-bold text-foreground text-left" dir="ltr">
                      {senderInfo.phone}
                    </span>
                  </div>
                )}
                {senderInfo.city && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 shrink-0 pt-0.5">
                      <MapPin className="w-3 h-3 text-primary/60" />المحافظة
                    </span>
                    <span className="text-sm font-semibold text-foreground text-left">
                      {senderInfo.city}
                    </span>
                  </div>
                )}
                {senderInfo.address && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 shrink-0 pt-0.5">
                      <MapPin className="w-3 h-3 text-primary/60" />العنوان
                    </span>
                    <span className="text-sm font-semibold text-foreground text-left leading-snug max-w-[60%]">
                      {senderInfo.address}
                    </span>
                  </div>
                )}
                {!senderInfo.phone && !senderInfo.city && !senderInfo.address && (
                  <p className="text-xs text-muted-foreground text-center py-2">لا توجد بيانات تواصل إضافية للراسل</p>
                )}
              </div>
            </div>
          )}


          {isEditing && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitEdit)}>
                <Card className="border-primary/30 bg-card shadow-lg overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-border bg-primary/5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                        <Pencil className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">تعديل الطلب</p>
                        <p className="text-[10px] text-muted-foreground truncate">طلب #{order.id.toString().padStart(4,"0")}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setIsEditing(false); initializedRef.current = false; setEditProductId(null); setEditColor(""); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <CardContent className="p-0">
                    {/* القسم الأول: بيانات المرسل */}
                    <div className="px-4 sm:px-5 py-4 border-b border-border/60">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <UserCheck className="w-3 h-3" />بيانات المرسل
                      </p>
                      <FormField control={form.control} name="clientId" render={({ field }) => (
                        <FormItem className="mb-3">
                          <FormLabel className="text-xs text-muted-foreground">العميل التجاري (الراسل)</FormLabel>
                          <FormControl>
                            <Popover open={editClientOpen} onOpenChange={setEditClientOpen}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  role="combobox"
                                  aria-expanded={editClientOpen}
                                  className="flex h-9 w-full items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                  {(() => {
                                    const c = shipmentClients.find(x => x.id === field.value);
                                    if (!c) return <span className="flex items-center gap-2 text-muted-foreground"><UserCheck className="w-3.5 h-3.5" />اختر العميل...</span>;
                                    return (
                                      <span className="flex items-center gap-2">
                                        <ClientAvatar avatar={c.avatar} name={c.name} className="w-5 h-5 text-[9px]" />
                                        <span className="text-xs font-bold">{c.name}</span>
                                      </span>
                                    );
                                  })()}
                                  <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start" side="bottom" sideOffset={4} avoidCollisions={false}>
                                <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                                  <CommandInput placeholder="ابحث بالاسم أو المحافظة/المدينة..." className="text-sm" />
                                  <CommandList className="max-h-[260px]">
                                    <CommandEmpty className="text-xs text-muted-foreground py-4">لا يوجد عميل بهذا الاسم</CommandEmpty>
                                    <CommandGroup>
                                      {shipmentClients.filter(c => c.name).map(c => {
                                        const gov = c.region || c.city || c.governorate || "";
                                        return (
                                          <CommandItem
                                            key={c.id}
                                            value={`${c.name} ${gov} ${c.phone || ""}`}
                                            onSelect={() => {
                                              form.setValue("clientId", c.id);
                                              form.setValue("senderName", c.name);
                                              form.setValue("senderPhone", c.phone || "");
                                              setEditClientOpen(false);
                                            }}
                                            className="text-sm flex items-center justify-between gap-3"
                                          >
                                            <span className="flex items-center gap-2">
                                              <Check className={`w-3.5 h-3.5 shrink-0 ${field.value === c.id ? "opacity-100 text-primary" : "opacity-0"}`} />
                                              <ClientAvatar avatar={c.avatar} name={c.name} className="w-6 h-6 text-[10px]" />
                                              <div className="flex flex-col">
                                                <span className="text-xs font-bold">{c.name}</span>
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                  {c.phone && <span>{c.phone}</span>}
                                                  {c.phone && gov && <span>·</span>}
                                                  {gov && <span className="text-primary/70">{gov}</span>}
                                                </span>
                                              </div>
                                            </span>
                                          </CommandItem>
                                        );
                                      })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </FormControl>
                        </FormItem>
                      )} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField control={form.control} name="senderName" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">اسم الراسل</FormLabel>
                            <FormControl>
                              <Input readOnly disabled className="h-9 text-sm bg-muted/40 border-border/70" {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="senderPhone" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />هاتف المرسل</FormLabel>
                            <FormControl>
                              <Input readOnly disabled className="h-9 text-sm bg-muted/40 border-border/70" placeholder="01x-xxxx-xxxx" dir="ltr" {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="senderPhone2" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />هاتف الراسل 2</FormLabel>
                            <FormControl>
                              <Input className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20" placeholder="رقم بديل" dir="ltr" {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                      </div>
                    </div>

                    {/* القسم الثاني: بيانات المستلم */}
                    <div className="px-4 sm:px-5 py-4 border-b border-border/60">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Phone className="w-3 h-3" />بيانات المستلم
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField control={form.control} name="customerName" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">اسم المستلم *</FormLabel>
                            <FormControl>
                              <Input className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20" {...field} />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="phone" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />رقم الهاتف</FormLabel>
                            <FormControl>
                              <Input className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20" placeholder="01x-xxxx-xxxx" dir="ltr" {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="receiverPhone2" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />هاتف بديل</FormLabel>
                            <FormControl>
                              <Input className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20" placeholder="01x-xxxx-xxxx" dir="ltr" {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        <FormField control={form.control} name="city" render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />المحافظة (نص حر)</FormLabel>
                            <FormControl>
                              <Input className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20" placeholder="القاهرة، الإسكندرية..." {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="zoneId" render={({ field }) => {
                          const selectedEditZone = shipmentZones.find(z => z.id === field.value);
                          return (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />المنطقة / المدينة</FormLabel>
                            <Popover open={editZoneOpen} onOpenChange={setEditZoneOpen}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  role="combobox"
                                  aria-expanded={editZoneOpen}
                                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background border-border/70 px-3 py-2 text-sm shadow-sm focus:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/20"
                                >
                                  <span className={selectedEditZone ? "" : "text-muted-foreground"}>
                                    {selectedEditZone ? (editToGovernorates.find(g => g.zone.id === selectedEditZone.id)?.label ?? selectedEditZone.name) : "اختر المحافظة / المنطقة..."}
                                  </span>
                                  <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start" side="bottom" sideOffset={4} avoidCollisions={false}>
                                <Command>
                                  <CommandInput placeholder="ابحث عن المحافظة..." className="text-sm" />
                                  <CommandList className="max-h-[260px]">
                                    <CommandEmpty className="text-xs text-muted-foreground py-4">لا توجد محافظة بهذا الاسم</CommandEmpty>
                                    <CommandGroup>
                                      {editToGovernorates.map(({ label, zone }) => (
                                        <CommandItem
                                          key={zone.id}
                                          value={label}
                                          onSelect={() => { field.onChange(zone.id); setEditZoneOpen(false); }}
                                          className="text-sm flex items-center justify-between gap-3"
                                        >
                                          <span className="flex items-center gap-2">
                                            <Check className={`w-3.5 h-3.5 shrink-0 ${field.value === zone.id ? "opacity-100 text-primary" : "opacity-0"}`} />
                                            {label}
                                          </span>
                                          <span className="text-xs text-muted-foreground font-bold">{formatCurrency(zone.price)}</span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            {selectedEditZone && <p className="text-[10px] text-primary mt-1">سعر التوصيل: {formatCurrency(selectedEditZone.price)}</p>}
                          </FormItem>
                          );
                        }} />
                        <FormField control={form.control} name="address" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />العنوان بالتفصيل</FormLabel>
                            <FormControl>
                              <Input className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20" placeholder="الحي، الشارع، رقم المنزل..." {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                      </div>
                    </div>

                    {/* القسم الثالث: بيانات الشحن */}
                    <div className="px-4 sm:px-5 py-4 border-b border-border/60">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Truck className="w-3 h-3" />بيانات الشحن
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField control={form.control} name="parcelType" render={({ field }) => {
                          const selectedPricing = parcelPricing.find(p => p.parcelType === field.value);
                          return (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><Package className="w-3 h-3" />نوع الشحنة</FormLabel>
                            <Select value={field.value || "none"} onValueChange={v => field.onChange(v === "none" ? null : v)}>
                              <SelectTrigger className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20"><SelectValue placeholder="اختر نوع الشحنة..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">بدون تحديد</SelectItem>
                                {parcelPricing.filter(p => p.isActive !== false).map(p => (
                                  <SelectItem key={p.id} value={p.parcelType}>
                                    <span className="flex items-center justify-between gap-4 w-full">
                                      <span>{p.label || PARCEL_LABELS[p.parcelType] || p.parcelType}</span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedPricing && <p className="text-[10px] text-primary mt-1">سعر النوع: {formatCurrency(selectedPricing.basePrice)}</p>}
                          </FormItem>
                          );
                        }} />
                        <FormField control={form.control} name="weight" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><Boxes className="w-3 h-3" />الوزن (كجم)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20" placeholder="0.00" {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="trackingNumber" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" />رقم التتبع</FormLabel>
                            <FormControl>
                              <Input className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20" placeholder="رقم التتبع لدى شركة الشحن" {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="warehouseId" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><Warehouse className="w-3 h-3" />المخزن</FormLabel>
                            <Select value={field.value?.toString() || "none"} onValueChange={v => field.onChange(v === "none" ? null : Number(v))}>
                              <SelectTrigger className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20"><SelectValue placeholder="اختر المخزن..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— غير محدد —</SelectItem>
                                {(warehouses as any[])?.map((w: any) => (
                                  <SelectItem key={w.id} value={String(w.id)}>{w.name}{w.city ? ` — ${w.city}` : ""}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="assignedUserId" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><UserCheck className="w-3 h-3" />الموظف المسؤول</FormLabel>
                            <Select value={field.value?.toString() || "none"} onValueChange={v => field.onChange(v === "none" ? null : Number(v))}>
                              <SelectTrigger className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20"><SelectValue placeholder="اختر الموظف..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— غير محدد —</SelectItem>
                                {(users as any[])?.map((u: any) => (
                                  <SelectItem key={u.id} value={String(u.id)}>{u.name || u.username}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="shippingCompanyId" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" />شركة الشحن</FormLabel>
                            <Select value={field.value?.toString() || "none"} onValueChange={v => field.onChange(v === "none" ? null : Number(v))}>
                              <SelectTrigger className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20"><SelectValue placeholder="اختر شركة" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">بدون</SelectItem>
                                {shippingCompanies?.filter((c: any) => c.isActive).map((c: any) => (
                                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="canOpen" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">حالة الشحنة (الفتح)</FormLabel>
                            <Select value={field.value === null || field.value === undefined ? "none" : String(field.value)} onValueChange={v => field.onChange(v === "none" ? null : Number(v))}>
                              <SelectTrigger className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20"><SelectValue placeholder="اختر..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">بدون تحديد</SelectItem>
                                <SelectItem value="1">مسموح بفتح الشحنة</SelectItem>
                                <SelectItem value="0">غير مسموح بفتح الشحنة</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="isDivisible" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">تجزئة الشحنة</FormLabel>
                            <Select value={field.value === null || field.value === undefined ? "none" : String(field.value)} onValueChange={v => field.onChange(v === "none" ? null : Number(v))}>
                              <SelectTrigger className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20"><SelectValue placeholder="اختر..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">بدون تحديد</SelectItem>
                                <SelectItem value="1">الشحنة قابلة للتجزئة</SelectItem>
                                <SelectItem value="0">الشحنة غير قابلة للتجزئة</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="rejectionPolicy" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">حالة الرفض</FormLabel>
                            <Select value={field.value ?? "none"} onValueChange={v => field.onChange(v === "none" ? null : v)}>
                              <SelectTrigger className="h-9 text-sm bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20"><SelectValue placeholder="اختر..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">بدون تحديد</SelectItem>
                                <SelectItem value="full_fee">يتم دفع مبلغ الشحن كاملا</SelectItem>
                                <SelectItem value="free">الشحن مجانا</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                      </div>
                    </div>

                    {/* القسم الخامس: الملاحظات */}
                    <div className="px-4 sm:px-5 py-4 border-b border-border/60">
                      <FormField control={form.control} name="notes" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">ملاحظات</FormLabel>
                          <FormControl>
                            <Textarea className="min-h-[64px] text-sm resize-none bg-background border-border/70 focus-visible:border-primary focus-visible:ring-primary/20" placeholder="أي ملاحظات إضافية..." {...field} value={field.value ?? ""} />
                          </FormControl>
                        </FormItem>
                      )} />
                    </div>
                    {invoiceNumber && (
                      <div className="px-4 sm:px-5 py-4 border-b border-border/60 bg-muted/5">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                            <Package className="w-3 h-3" />منتجات الفاتورة ({invoiceOrders.length > 0 ? invoiceOrders.length : 1})
                          </p>
                          <button
                            type="button"
                            onClick={() => { setIsEditing(false); setTimeout(() => setShowAddProduct(true), 100); }}
                            className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-md transition-colors"
                          >
                            <Plus className="w-3 h-3" />إضافة منتج
                          </button>
                        </div>
                        {otherInvoiceOrders.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {otherInvoiceOrders.map((o: any) => (
                              <div key={o.id} className="flex items-center justify-between text-[10px] text-muted-foreground bg-background px-2.5 py-1.5 rounded border border-border/40">
                                <span className="font-medium">{o.product}{o.color ? ` — ${o.color}` : ""}{o.size ? ` / ${o.size}` : ""}</span>
                                <span className="font-bold">{o.quantity} وحدة</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* أزرار الحفظ */}
                    <div className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <Button
                        type="button" variant="ghost" size="sm"
                        onClick={() => { setIsEditing(false); initializedRef.current = false; setEditProductId(null); setEditColor(""); }}
                        className="h-9 px-4 text-sm text-muted-foreground hover:text-foreground w-full sm:w-auto"
                      >
                        إلغاء
                      </Button>
                      <Button
                        type="submit" size="sm"
                        disabled={updateOrder.isPending}
                        className="h-9 px-6 text-sm gap-2 font-bold w-full sm:w-auto"
                      >
                        {updateOrder.isPending
                          ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />جاري الحفظ...</>
                          : <><Save className="w-3.5 h-3.5" />حفظ التعديلات</>
                        }
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </form>
            </Form>
          )}
          {!isEditing && (
            <div className="space-y-4">

            {/* ملاحظات */}
            {order.notes && (
              <div className="bg-muted/20 p-3 rounded text-sm border border-border">
                <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
                {order.notes}
              </div>
            )}

            {/* سبب الإرجاع */}
            {order.status === "returned" && orderReturnReason && (
              <div className="p-3 rounded border border-red-900 bg-red-900/10">
                <p className="text-xs text-red-400 font-bold mb-1 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" />سبب الإرجاع
                </p>
                <p className="text-sm font-semibold text-red-300">{returnReasonLabel(orderReturnReason)}</p>
                {orderReturnNote && <p className="text-xs text-muted-foreground mt-1">{orderReturnNote}</p>}
              </div>
            )}

            </div>
          )}
        </div>

        {/* ── Sidebar: الملخص المالي + تحليل الربحية ── */}
        <div className="md:col-span-1 space-y-4">

          {/* ── الملخص المالي ── */}
          <Card className="border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
              <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">الملخص المالي</p>
                <p className="text-[10px] text-muted-foreground">تفاصيل الدفع والتكاليف</p>
              </div>
            </div>
            <CardContent className="p-4 space-y-3">
              {(() => {
                const cod         = Number((order as any).codAmount    ?? 0);
                const shippingFee = Math.abs(Number((order as any).shippingFee  ?? (order as any).shippingCost ?? 0));
                const insurance   = Math.abs(Number((order as any).insuranceFee ?? 0));
                const collected   = Number((order as any).collectedAmount ?? 0);
                const payMethod   = (order as any).paymentMethod as string | null;
                const storedTotal = Number((order as any).totalAmount ?? 0);
                // الإجمالي = القيمة المخزّنة فعليًا (سعر الشحنة الذي أدخله المستخدم)، وإلا يُحسب من COD + رسوم الشحن كحل احتياطي
                const total       = storedTotal > 0 ? storedTotal : (payMethod === "cod" ? (cod + shippingFee) : shippingFee + insurance);
                const payLabel    = payMethod === "cod" ? "عند الاستلام" : payMethod === "prepaid" ? "مدفوع مسبقاً" : payMethod === "deferred" ? "لاحقاً" : "—";

                return (
                  <>
                    {/* طريقة الدفع */}
                    <div className="flex justify-between items-center text-xs py-1">
                      <span className="text-muted-foreground">طريقة الدفع</span>
                      <span className="font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">{payLabel}</span>
                    </div>

                    {/* COD */}
                    {cod > 0 && (
                      <div className="flex justify-between items-center text-xs py-1 border-t border-border/50">
                        <span className="text-muted-foreground">مبلغ COD</span>
                        <span className="font-bold text-amber-400">{formatCurrency(cod)}</span>
                      </div>
                    )}

                    {/* رسوم الشحن (تُخصم من COD) */}
                    {shippingFee > 0 && (
                      <div className="flex justify-between items-center text-xs py-1 border-t border-border/50">
                        <span className="text-muted-foreground">رسوم الشحن {payMethod === "cod" ? "(تُخصم)" : ""}</span>
                        <span className="font-semibold text-red-400">{payMethod === "cod" ? `- ${formatCurrency(shippingFee)}` : formatCurrency(shippingFee)}</span>
                      </div>
                    )}

                    {/* رسوم التأمين */}
                    {insurance > 0 && (
                      <div className="flex justify-between items-center text-xs py-1 border-t border-border/50">
                        <span className="text-muted-foreground">رسوم التأمين</span>
                        <span className="font-semibold text-orange-400">{formatCurrency(insurance)}</span>
                      </div>
                    )}

                    {/* الإجمالي */}
                    <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-primary/20">
                      <span className="font-bold text-sm">الإجمالي</span>
                      <span className="font-black text-xl text-primary">{formatCurrency(total)}</span>
                    </div>

                    {/* تم تحصيله */}
                    {collected > 0 && (
                      <div className="flex justify-between items-center text-xs py-2 px-3 rounded-lg bg-emerald-900/10 border border-emerald-900/30 mt-1">
                        <span className="text-emerald-400/80">تم تحصيله</span>
                        <span className="font-bold text-emerald-400">{formatCurrency(collected)}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* ── تحليل الربحية ── */}
          {canViewProfitability && (() => {
            // ── الحالات التي يظهر فيها التحليل ───────────────────────────────
            // نعرض التحليل من حالة "قيد الشحن" (in_shipping) فصاعداً
            const ACTIVE_STATUSES = ["in_shipping", "in_transit", "picked_up", "out_for_delivery", "delivered", "partial_received", "returned", "delayed", "with_courier", "at_warehouse", "returned_to_warehouse", "return_delivered", "postponed"];
            const canShowAnalysis = ACTIVE_STATUSES.includes(order.status);

            if (!canShowAnalysis) {
              return (
                <Card className="overflow-hidden border border-border">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center border bg-muted/30 border-border">
                      <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">تحليل الربحية</p>
                      <p className="text-[10px] text-muted-foreground">يظهر بعد انتقال الشحنة لحالة "قيد الشحن"</p>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">يظهر التحليل بعد انتقال الشحنة لحالة "قيد الشحن"</p>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            // ── حساب الأرقام ─────────────────────────────────────────────────
            // إيرادات الشحن = سعر المنطقة + سعر نوع الطرد (ما بيدفعه الراسل لشركتنا)
            const zonePrice       = Math.abs(Number((order as any).zonePrice       ?? 0));
            const parcelTypePrice = Math.abs(Number((order as any).parcelTypePrice ?? 0));
            const shippingRevenue = zonePrice + parcelTypePrice; // إيراد شركتنا من الشحن

            // تكلفة الشحن الفعلية = تكلفة المندوب (شركة الشحن) المرتبط فعلياً بالشحنة
            const courierCompany  = (shippingCompanies ?? []).find((sc: any) => String(sc.id) === String((order as any).shippingCompanyId));
            const shippingCost    = courierCompany?.shippingCost != null
              ? Math.abs(Number(courierCompany.shippingCost))
              : Math.abs(Number((order as any).shippingFee ?? (order as any).shippingCost ?? 0));
            const insuranceFee    = Math.abs(Number((order as any).insuranceFee ?? 0));

            // صافي الشحن = إيراد الشحن - تكلفة الشحن الفعلية
            const isReturned      = order.status === "returned";
            const shippingNet     = isReturned
              ? -(shippingCost + insuranceFee)
              : shippingRevenue - shippingCost - insuranceFee;
            const isPositive      = shippingNet >= 0 && !isReturned;

            const marginPct = shippingRevenue > 0 && !isReturned
              ? Math.round((shippingNet / shippingRevenue) * 100)
              : 0;

            return (
              <Card className={`overflow-hidden border ${isPositive ? "border-emerald-900/40" : "border-red-900/40"}`}>
                <div className={`flex items-center gap-3 px-4 py-3 border-b ${isPositive ? "border-emerald-900/30 bg-emerald-900/10" : "border-red-900/30 bg-red-900/10"}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${isPositive ? "bg-emerald-900/20 border-emerald-900/30" : "bg-red-900/20 border-red-900/30"}`}>
                    {isPositive ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">تحليل الربحية</p>
                    <p className={`text-[10px] font-semibold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                      {isReturned ? "شحنة مرتجعة" : isPositive ? "ربح" : "خسارة"}
                    </p>
                  </div>
                </div>
                <CardContent className="p-4 space-y-2.5">
                  {isReturned && (
                    <div className="text-[10px] font-semibold text-red-400 bg-red-900/20 px-3 py-2 rounded-lg border border-red-900/30">
                      ⚠ الشحنة مرتجعة — لا يوجد إيراد
                    </div>
                  )}

                  {/* إيرادات الشحن */}
                  {!isReturned && (
                    <>
                      {zonePrice > 0 && (
                        <div className="flex justify-between items-center text-xs py-1">
                          <span className="text-muted-foreground">سعر المنطقة</span>
                          <span className="font-semibold text-emerald-400">+{formatCurrency(zonePrice)}</span>
                        </div>
                      )}
                      {parcelTypePrice > 0 && (
                        <div className="flex justify-between items-center text-xs py-1 border-t border-border/30">
                          <span className="text-muted-foreground">سعر نوع الطرد</span>
                          <span className="font-semibold text-emerald-400">+{formatCurrency(parcelTypePrice)}</span>
                        </div>
                      )}
                      {shippingRevenue > 0 && (
                        <div className="flex justify-between items-center text-xs py-1 border-t border-border/50 bg-emerald-900/5 px-2 rounded">
                          <span className="text-muted-foreground font-medium">إجمالي الإيراد</span>
                          <span className="font-bold text-emerald-400">{formatCurrency(shippingRevenue)}</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* تكاليف الشحن */}
                  {shippingCost > 0 && (
                    <div className="flex justify-between items-center text-xs py-1 border-t border-border/50">
                      <span className="text-muted-foreground">تكلفة الشحن الفعلية</span>
                      <span className="font-semibold text-orange-400">-{formatCurrency(shippingCost)}</span>
                    </div>
                  )}
                  {insuranceFee > 0 && (
                    <div className="flex justify-between items-center text-xs py-1 border-t border-border/30">
                      <span className="text-muted-foreground">رسوم التأمين</span>
                      <span className="font-semibold text-orange-400">-{formatCurrency(insuranceFee)}</span>
                    </div>
                  )}

                  {/* الصافي */}
                  <div className={`flex justify-between items-center pt-2 mt-1 border-t-2 ${isPositive ? "border-emerald-900/40" : "border-red-900/40"}`}>
                    <span className="font-bold text-sm">صافي الشحن</span>
                    <span className={`font-black text-xl ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                      {formatCurrency(shippingNet)}
                    </span>
                  </div>

                  {/* هامش الربح */}
                  {marginPct !== 0 && !isReturned && (
                    <div className="flex justify-between items-center text-xs py-2 px-3 rounded-lg bg-muted/40 border border-border/50">
                      <span className="text-muted-foreground">هامش الربح</span>
                      <span className={`font-bold ${marginPct > 30 ? "text-emerald-400" : marginPct > 0 ? "text-amber-400" : "text-red-400"}`}>
                        {marginPct}%
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

        </div>
      </div>

      {/* ── Add Product Dialog ── */}
      <AddProductDialog
        open={showAddProduct}
        onOpenChange={setShowAddProduct}
        order={order}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["invoice-orders", invoiceNumber] });
          refetchInvoiceOrders();
        }}
      />
      </>}

      {/* Close Invoice Dialog */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              إغلاق الشحنة وتحويل المبلغ للخزنة
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {isShipmentOrder
                ? "سيتم تغيير حالة الشحنة إلى «مغلق» وإيداع مبلغ الشحن في الخزنة المحددة."
                : "سيتم تحويل الطلب إلى «استلم» وإيداع المبلغ في الخزنة المحددة."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2 space-y-3">
            {isShipmentOrder && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm border border-border/50">
                {Number((order as any).codAmount || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">COD</span>
                    <span className="font-semibold text-amber-400">
                      {new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(Number((order as any).codAmount))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">رسوم الشحن</span>
                  <span className="font-semibold">
                    {new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(Number((order as any).shippingFee || 0))}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border/50 pt-1.5">
                  <span className="font-bold text-xs">الإجمالي المحوّل</span>
                  <span className="font-black text-emerald-400">
                    {new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(shipmentCloseAmount)}
                  </span>
                </div>
              </div>
            )}
            {!isShipmentOrder && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">المبلغ:</span>
                <span className="font-bold text-emerald-400">
                  {new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(closeInvoiceAmount)}
                </span>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">اختر الخزنة</label>
              <select
                value={selectedRegisterId}
                onChange={(e) => setSelectedRegisterId(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">-- اختر خزنة --</option>
                {((cashData as any)?.registers ?? []).map((r: any) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name}{r.isDefault ? " (افتراضية)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseInvoice}
              disabled={isClosing || !selectedRegisterId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isClosing ? "جاري الإغلاق..." : "تأكيد الإغلاق"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog — يظهر في الوضعين (فردي ومتعدد) */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الشحنة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف شحنة{" "}
              <span className="font-bold text-foreground">
                {(order as any).shipmentNumber ?? `#${order.id.toString().padStart(4,"0")}`}
              </span>{" "}
              للمستلم{" "}
              <span className="font-bold text-foreground">
                {(order as any).receiverName || order.customerName}
              </span>؟
              {" "}لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white">
              {isDeleting ? "جاري الحذف..." : "نعم، احذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* WhatsApp dialog — shipment logic */}
      {order && (
        <WhatsAppShipmentDialog
          open={showWaDialog}
          onOpenChange={setShowWaDialog}
          onSent={handleWaSent}
          shipment={{
            id: order.id,
            shipmentNumber: (order as any).shipmentNumber ?? `#${order.id.toString().padStart(4,"0")}`,
            receiverName: (order as any).receiverName || order.customerName,
            receiverPhone: (order as any).receiverPhone || order.phone || null,
            receiverCity: (order as any).receiverCity ?? (order as any).city ?? null,
            receiverAddress: (order as any).receiverAddress ?? (order as any).address ?? null,
            senderName: (order as any).senderName ?? null,
            senderPhone: (order as any).senderPhone ?? null,
            senderCity: (order as any).senderCity ?? null,
            trackingNumber: (order as any).trackingNumber ?? null,
            status: statusLabels[order.status] || order.status,
            shippingFee: (order as any).shippingFee ?? null,
            codAmount: (order as any).codAmount ?? null,
            zoneLabel: (order as any).zoneLabel ?? null,
          }}
        />
      )}
    </div>
  );
}