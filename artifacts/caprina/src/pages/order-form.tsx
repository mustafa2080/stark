import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link } from "wouter";
import {
  ArrowRight, Save, Phone, MapPin, Layers, DollarSign, Megaphone,
  Warehouse, UserCheck, Plus, Trash2, Package, ChevronUp, ChevronDown, X,
} from "lucide-react";
import { getListOrdersQueryKey, getGetOrdersSummaryQueryKey, getGetRecentOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { productsApi, variantsApi, shippingApi, warehousesApi, usersApi, ordersApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/utils";
import { ProductSearchCombobox } from "@/components/product-search-combobox";
import { useState, useRef, useEffect, useMemo } from "react";

// أيقونات SVG لمصادر الإعلان
const AdSourceIcon = ({ value, className = "w-4 h-4 shrink-0" }: { value: string; className?: string }) => {
  if (value === "facebook") return (
    <svg className={className} viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
  );
  if (value === "tiktok") return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>
  );
  if (value === "instagram") return (
    <svg className={className} viewBox="0 0 24 24" fill="url(#igGrad)"><defs><linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="25%" stopColor="#e6683c"/><stop offset="50%" stopColor="#dc2743"/><stop offset="75%" stopColor="#cc2366"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
  );
  if (value === "whatsapp") return (
    <svg className={className} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  );
  if (value === "organic") return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
  );
  if (value === "other") return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
  );
  return null;
};

const AD_SOURCES = [
  { value: "facebook",  label: "فيسبوك" },
  { value: "tiktok",   label: "تيك توك" },
  { value: "instagram",label: "إنستجرام" },
  { value: "whatsapp", label: "واتساب" },
  { value: "organic",  label: "ويبسايت" },
  { value: "other",    label: "أخرى" },
];

const itemSchema = z.object({
  product:     z.string().min(1, "اسم المنتج مطلوب."),
  color:       z.string().optional().nullable(),
  size:        z.string().optional().nullable(),
  quantity:    z.coerce.number().int().min(1, "الكمية 1 على الأقل."),
  unitPrice:   z.coerce.number().min(0, "السعر يجب أن يكون موجباً."),
  costPrice:   z.coerce.number().min(0).optional().nullable(),
  productId:   z.coerce.number().optional().nullable(),
  variantId:   z.coerce.number().optional().nullable(),
});

const formSchema = z.object({
  customerName:      z.string().min(2, "اسم العميل يجب أن يكون حرفين على الأقل."),
  phone:             z.string().optional().nullable(),
  city:              z.string().optional().nullable(),
  address:           z.string().optional().nullable(),
  shippingCost:      z.coerce.number().min(0).optional().nullable(),
  shippingCompanyId: z.coerce.number().optional().nullable(),
  warehouseId:       z.coerce.number().optional().nullable(),
  assignedUserId:    z.coerce.number().optional().nullable(),
  adSource:          z.string().optional().nullable(),
  adCampaign:        z.string().optional().nullable(),
  notes:             z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, "أضف منتجاً واحداً على الأقل."),
});

type FormValues = z.infer<typeof formSchema>;
type ItemValues = z.infer<typeof itemSchema>;

const emptyItem = (): ItemValues => ({
  product: "", color: "", size: "", quantity: 1,
  unitPrice: 0, costPrice: null, productId: null, variantId: null,
});



// ── Single product item row ───────────────────────────────────────────────────
function ProductItem({
  index, control, watch, setValue, remove, products, allVariants, canViewFinancials, isOnly,
  onVariantRowsChange,
}: {
  index: number; control: any; watch: any; setValue: any;
  remove: () => void; products: any[]; allVariants: any[];
  canViewFinancials: boolean; isOnly: boolean;
  onVariantRowsChange: (index: number, rows: {color: string; size: string; quantity: number}[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const productId   = watch(`items.${index}.productId`);
  const qty         = watch(`items.${index}.quantity`) || 0;
  const price       = watch(`items.${index}.unitPrice`) || 0;
  const cost        = watch(`items.${index}.costPrice`) || 0;
  const productName = watch(`items.${index}.product`) || `منتج ${index + 1}`;

  const productVariants = allVariants.filter((v: any) => v.productId === Number(productId));
  const availableColors = [...new Set(productVariants.map((v: any) => v.color))] as string[];
  const selectedProduct = products.find((p: any) => p.id === Number(productId));

  const [variantRows, setVariantRows] = useState<{color: string; size: string; quantity: number}[]>([
    { color: "", size: "", quantity: 1 }
  ]);

  const revenue   = qty * price;
  const costTotal = qty * cost;
  const profit    = revenue - costTotal;

  // لما الـ variantRows تتغير → بلّغ الـ parent + حدّث أول item في الـ form
  const applyRows = (rows: {color: string; size: string; quantity: number}[]) => {
    setVariantRows(rows);
    onVariantRowsChange(index, rows);
    // حدّث الـ form item الحالي بأول row معبية
    const first = rows.find(r => r.color && r.size);
    if (first) {
      const fv = productVariants.find((v: any) => v.color === first.color && v.size === first.size);
      setValue(`items.${index}.color`, first.color);
      setValue(`items.${index}.size`, first.size);
      // الكمية = مجموع كل الـ rows المعبية
      const totalQty = rows.filter(r => r.color && r.size).reduce((sum, r) => sum + (r.quantity || 0), 0);
      setValue(`items.${index}.quantity`, totalQty || first.quantity);
      setValue(`items.${index}.variantId`, fv?.id ?? null);
      if (fv?.unitPrice) setValue(`items.${index}.unitPrice`, fv.unitPrice);
      if (fv?.costPrice) setValue(`items.${index}.costPrice`, fv.costPrice);
    }
  };

  const updateRow = (i: number, key: string, val: any) => {
    setVariantRows(rows => {
      const next = rows.map((r, idx) => idx === i ? { ...r, [key]: val, ...(key === "color" ? { size: "" } : {}) } : r);
      applyRows(next);
      return next;
    });
  };

  const addRow = () => {
    const next = [...variantRows, { color: "", size: "", quantity: 1 }];
    setVariantRows(next);
    onVariantRowsChange(index, next);
  };

  const removeRow = (i: number) => {
    const next = variantRows.filter((_, idx) => idx !== i);
    applyRows(next);
  };

  const handleSelectProduct = (p: any) => {
    setValue(`items.${index}.productId`, p.id);
    setValue(`items.${index}.product`, p.name);
    if (p.costPrice) setValue(`items.${index}.costPrice`, p.costPrice);
    setValue(`items.${index}.variantId`, null);
    setValue(`items.${index}.color`, "");
    setValue(`items.${index}.size`, "");
    const init = [{ color: "", size: "", quantity: 1 }];
    setVariantRows(init);
    onVariantRowsChange(index, init);
  };

  const handleClearProduct = () => {
    setValue(`items.${index}.productId`, null);
    setValue(`items.${index}.product`, "");
    setValue(`items.${index}.variantId`, null);
    setValue(`items.${index}.color`, "");
    setValue(`items.${index}.size`, "");
    setValue(`items.${index}.unitPrice`, 0);
    setValue(`items.${index}.costPrice`, null);
    const init = [{ color: "", size: "", quantity: 1 }];
    setVariantRows(init);
    onVariantRowsChange(index, init);
  };

  return (
    <Card className="border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border cursor-pointer select-none bg-muted/20 hover:bg-muted/30 transition-colors"
        onClick={() => setCollapsed(c => !c)}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">{index + 1}</div>
          <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-bold truncate max-w-[120px]">{productName}</span>
          {variantRows.filter(r => r.color && r.size).length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {variantRows.filter(r => r.color && r.size).map((r, i) => (
                <Badge key={i} variant="outline" className="text-[9px] font-bold border-primary/30 text-primary">
                  {r.color} {r.size} ×{r.quantity}
                </Badge>
              ))}
            </div>
          ) : qty > 0 && price > 0 ? (
            <Badge variant="outline" className="text-[9px] font-bold border-primary/30 text-primary">
              {qty} × {formatCurrency(price)}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isOnly && (
            <button type="button" onClick={e => { e.stopPropagation(); remove(); }}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {!collapsed && (
        <CardContent className="px-4 pb-4 pt-3 space-y-3">

          {/* Product selector — stock only, no manual entry */}
          <div>
            <label className="text-xs font-medium flex items-center gap-1 mb-1.5 text-foreground">
              <Layers className="w-3 h-3" />اختر من المخزون *
            </label>
            {productId && selectedProduct ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-md">
                <div className="flex items-center gap-2 min-w-0">
                  {(selectedProduct as any).image ? (
                    <img src={(selectedProduct as any).image} alt={selectedProduct.name} className="w-8 h-8 rounded object-cover border border-emerald-300 shrink-0" />
                  ) : (
                    <Package className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  <span className="text-sm font-bold truncate">{selectedProduct.name}</span>
                </div>
                <button type="button" onClick={handleClearProduct}
                  className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors" title="تغيير المنتج">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <ProductSearchCombobox products={products} allVariants={allVariants} onSelect={handleSelectProduct} />
            )}
          </div>

          {/* Color & Size (variants) */}
          {productId && productVariants.length > 0 && (
            <div className="space-y-2">
              {variantRows.map((row, ri) => {
                const sizesForColor = productVariants.filter((v: any) => v.color === row.color).map((v: any) => v.size);
                const rowVariant = productVariants.find((v: any) => v.color === row.color && v.size === row.size);
                const avail = rowVariant ? (rowVariant.totalQuantity ?? 0) : null;
                return (
                  <div key={ri} className="flex items-end gap-2 p-2 bg-muted/10 rounded-md border border-border/40">
                    {/* اللون */}
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">اللون</label>
                      <select
                        value={row.color}
                        onChange={e => updateRow(ri, "color", e.target.value)}
                        className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">اختر لون...</option>
                        {availableColors.map((c: string) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {/* المقاس */}
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">المقاس</label>
                      <select
                        value={row.size}
                        disabled={!row.color}
                        onChange={e => updateRow(ri, "size", e.target.value)}
                        className="w-full h-9 text-sm rounded-md border border-input bg-card px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                      >
                        <option value="">اختر مقاس...</option>
                        {sizesForColor.map((s: string) => {
                          const v = productVariants.find((pv: any) => pv.color === row.color && pv.size === s);
                          const a = v ? (v.totalQuantity ?? 0) : 0;
                          return <option key={s} value={s} disabled={a === 0}>{s} {a === 0 ? "(نفد)" : `(${a})`}</option>;
                        })}
                      </select>
                    </div>
                    {/* الكمية */}
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">الكمية</label>
                      <div className="flex items-center gap-1">
                        <button type="button"
                          onClick={() => updateRow(ri, "quantity", Math.max(1, row.quantity - 1))}
                          className="w-7 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">−</button>
                        <span className="w-8 text-center text-sm font-bold">{row.quantity}</span>
                        <button type="button"
                          onClick={() => updateRow(ri, "quantity", avail !== null ? Math.min(avail, row.quantity + 1) : row.quantity + 1)}
                          className="w-7 h-9 flex items-center justify-center rounded border border-input bg-card hover:bg-muted text-sm font-bold">+</button>
                      </div>
                    </div>
                    {/* حذف الصف */}
                    {variantRows.length > 1 && (
                      <button type="button" onClick={() => removeRow(ri)}
                        className="mb-0.5 p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* متاح badge */}
                    {avail !== null && (
                      <span className={`text-[9px] font-bold mb-1 shrink-0 ${avail <= 5 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                        متاح:{avail}
                      </span>
                    )}
                  </div>
                );
              })}
              {/* زر إضافة لون/مقاس آخر */}
              <button type="button" onClick={addRow}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-primary border border-dashed border-primary/40 hover:bg-primary/5 py-2 rounded-md transition-colors">
                <Plus className="w-3.5 h-3.5" />أضف لون / مقاس آخر
              </button>
            </div>
          )}

          {/* Qty & Price */}
          <div className="grid grid-cols-2 gap-3">
            <FormField control={control} name={`items.${index}.quantity`} render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">الكمية *</FormLabel>
                <FormControl><Input type="number" min="1" className="h-9 text-sm" {...field} /></FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )} />
            <FormField control={control} name={`items.${index}.unitPrice`} render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">سعر البيع (ج.م) *</FormLabel>
                <FormControl><Input type="number" min="0" step="0.01" className="h-9 text-sm" {...field} /></FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )} />
          </div>

          {/* Cost & profit (admin only) */}
          {canViewFinancials && productId && (
            <div className="space-y-2">
              <FormField control={control} name={`items.${index}.costPrice`} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />تكلفة الوحدة (ج.م)
                  </FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.01" placeholder="0" className="h-9 text-sm"
                      {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)} />
                  </FormControl>
                </FormItem>
              )} />
              {cost > 0 && (
                <div className="grid grid-cols-3 gap-2 p-2 bg-background/50 rounded border border-border text-center">
                  <div><p className="text-[9px] text-muted-foreground">إيرادات</p><p className="text-xs font-bold text-primary">{formatCurrency(revenue)}</p></div>
                  <div><p className="text-[9px] text-muted-foreground">التكلفة</p><p className="text-xs font-bold text-amber-700 dark:text-amber-400">{formatCurrency(costTotal)}</p></div>
                  <div><p className="text-[9px] text-muted-foreground">الربح</p><p className={`text-xs font-bold ${profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{formatCurrency(profit)}</p></div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────────────
export default function OrderForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { canViewFinancials, isAdmin } = useAuth();

  const { data: products = [] }     = useQuery({ queryKey: ["products"],   queryFn: productsApi.list });
  const { data: allVariants = [] }  = useQuery({ queryKey: ["variants"],   queryFn: variantsApi.listAll });
  const { data: shippingCompanies } = useQuery({ queryKey: ["shipping"],   queryFn: shippingApi.list });
  const { data: warehouses }        = useQuery({ queryKey: ["warehouses"], queryFn: warehousesApi.list });
  const { data: users }             = useQuery({ queryKey: ["users"],      queryFn: usersApi.list, enabled: isAdmin });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: "", phone: "", city: "", address: "",
      shippingCost: 0, notes: "",
      warehouseId: null, assignedUserId: null, adSource: null, adCampaign: null,
      shippingCompanyId: null, items: [emptyItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items        = form.watch("items");
  const shippingCost = form.watch("shippingCost") || 0;
  const totalRevenue = items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);
  const totalCost    = items.reduce((s, it) => s + (it.quantity || 0) * (it.costPrice || 0), 0);
  const totalProfit  = totalRevenue - totalCost - shippingCost;
  const totalMargin  = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
  const totalQty     = items.reduce((s, it) => s + (it.quantity || 0), 0);
  const [submitting, setSubmitting] = useState(false);

  // نحتفظ بالـ variantRows لكل item بالـ index
  const variantRowsMapRef = useRef<Map<number, {color: string; size: string; quantity: number}[]>>(new Map());

  const handleVariantRowsChange = (index: number, rows: {color: string; size: string; quantity: number}[]) => {
    variantRowsMapRef.current.set(index, rows);
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      // expand variant rows: كل item تتحول لـ items متعددة لو فيها أكتر من row
      const expandedItems: typeof values.items = [];
      values.items.forEach((item, idx) => {
        const rows = variantRowsMapRef.current.get(idx);
        if (rows && rows.length > 0) {
          const filled = rows.filter(r => r.color && r.size);
          if (filled.length > 0) {
            filled.forEach(r => {
              const variant = allVariants.find((v: any) => v.productId === item.productId && v.color === r.color && v.size === r.size);
              expandedItems.push({
                ...item,
                color: r.color,
                size: r.size,
                quantity: r.quantity,
                variantId: variant?.id ?? item.variantId,
                unitPrice: variant?.unitPrice ?? item.unitPrice,
                costPrice: variant?.costPrice ?? item.costPrice,
              });
            });
            return;
          }
        }
        expandedItems.push(item);
      });

      const result = await ordersApi.batchCreate({
        customerName: values.customerName, phone: values.phone || null,
        city: values.city || null, address: values.address || null,
        shippingCost: values.shippingCost || null,
        shippingCompanyId: values.shippingCompanyId || null,
        warehouseId: values.warehouseId || null,
        assignedUserId: values.assignedUserId || null,
        adSource: values.adSource || null, adCampaign: values.adCampaign || null,
        notes: values.notes || null,
        items: expandedItems.map(item => ({
          product: item.product, color: item.color || null, size: item.size || null,
          quantity: item.quantity, unitPrice: item.unitPrice,
          costPrice: item.costPrice ?? null,
          productId: item.productId || null, variantId: item.variantId || null,
        })),
      });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-profit"] });
      toast({
        title: `تم إنشاء الطلب — فاتورة ${result.invoiceNumber}`,
        description: result.orders.length > 1
          ? `${result.orders.length} منتجات في فاتورة واحدة للعميل ${values.customerName}`
          : `الطلب #${result.orders[0]?.id} تم إنشاؤه بنجاح للعميل ${values.customerName}`,
      });
      setLocation(`/invoices/${encodeURIComponent(result.invoiceNumber)}`);
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "فشل إنشاء الطلب.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <Link href="/orders">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-border">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">طلب جديد</h1>
          <p className="text-muted-foreground text-xs mt-0.5">أدخل تفاصيل الطلب</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">

              {/* Customer */}
              <Card className="border-border bg-card">
                <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-sm font-bold">بيانات العميل</CardTitle></CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">اسم العميل *</FormLabel>
                      <FormControl><Input placeholder="أحمد محمد" className="h-9 text-sm" {...field} /></FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" />رقم الهاتف</FormLabel>
                        <FormControl><Input placeholder="05xxxxxxxx" className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                      </FormItem>
                    )} />
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
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />المحافظة</FormLabel>
                        <FormControl><Input placeholder="القاهرة، الإسكندرية..." className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />العنوان بالتفصيل</FormLabel>
                        <FormControl><Input placeholder="الحي، الشارع، رقم المنزل..." className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>

              {/* Products */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />المنتجات
                    <Badge variant="outline" className="text-[10px] font-bold border-primary/30 text-primary">
                      {fields.length} {fields.length === 1 ? "منتج" : "منتجات"}
                    </Badge>
                  </h2>
                  <button type="button" onClick={() => append(emptyItem())}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/30 hover:bg-primary/5 px-3 py-1.5 rounded-md transition-colors">
                    <Plus className="w-3.5 h-3.5" />أضف منتجاً
                  </button>
                </div>

                {fields.map((field, index) => (
                  <ProductItem key={field.id} index={index}
                    control={form.control} watch={form.watch} setValue={form.setValue}
                    remove={() => remove(index)} products={products} allVariants={allVariants}
                    canViewFinancials={canViewFinancials} isOnly={fields.length === 1}
                    onVariantRowsChange={handleVariantRowsChange} />
                ))}

                {fields.length >= 2 && (
                  <button type="button" onClick={() => append(emptyItem())}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground border border-dashed border-border hover:border-primary/50 hover:text-primary py-3 rounded-lg transition-colors">
                    <Plus className="w-3.5 h-3.5" />أضف منتجاً آخر
                  </button>
                )}
              </div>

              {/* Shipping cost */}
              {canViewFinancials && (
                <Card className="border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/5">
                  <CardHeader className="pb-2 pt-4 px-4 border-b border-border">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />تكلفة الشحن الكلية
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-3">
                    <FormField control={form.control} name="shippingCost" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">تكلفة الشحن (ج.م) — تُوزَّع على المنتجات</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" placeholder="0" className="h-9 text-sm"
                            {...field} value={field.value ?? ""}
                            onChange={e => field.onChange(e.target.value ? Number(e.target.value) : 0)} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </CardContent>
                </Card>
              )}

              {/* Tracking */}
              <Card className="border-purple-900/40 bg-purple-900/5">
                <CardHeader className="pb-2 pt-4 px-4 border-b border-border">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Megaphone className="w-3.5 h-3.5 text-purple-400" />تتبع الإعلان والفريق
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-3">
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
                                <span className="flex items-center gap-2">
                                  <AdSourceIcon value={s.value} />
                                  {s.label}
                                </span>
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
                </CardContent>
              </Card>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">ملاحظات</FormLabel>
                  <FormControl><Textarea placeholder="أي تعليمات خاصة..." className="min-h-[60px] text-sm resize-none" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
            </div>

            {/* Summary sidebar */}
            <div>
              <Card className="border-primary/30 bg-card sticky top-4">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm font-bold text-primary">الملخص</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {items.map((it, i) => it.product && (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground truncate max-w-[100px]">{it.product}</span>
                        <span className="font-bold shrink-0">{formatCurrency((it.quantity || 0) * (it.unitPrice || 0))}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 text-xs pt-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">عدد المنتجات</span><span>{fields.length}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">إجمالي الكمية</span><span>{totalQty}</span></div>
                    <div className="border-t border-border pt-2 flex justify-between">
                      <span className="font-bold">إجمالي البيع</span>
                      <span className="font-bold text-base text-primary">{formatCurrency(totalRevenue)}</span>
                    </div>
                    {canViewFinancials && totalCost > 0 && (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">التكلفة</span><span className="text-amber-700 dark:text-amber-400">-{formatCurrency(totalCost)}</span></div>
                        {shippingCost > 0 && <div className="flex justify-between"><span className="text-muted-foreground">الشحن</span><span className="text-amber-700 dark:text-amber-400">-{formatCurrency(shippingCost)}</span></div>}
                        <div className="border-t border-border pt-2 flex justify-between">
                          <span className="font-bold">الربح الصافي</span>
                          <span className={`font-bold text-base ${totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{formatCurrency(totalProfit)}</span>
                        </div>
                        {totalRevenue > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">هامش الربح</span>
                            <span className={`font-bold ${totalMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : totalMargin >= 10 ? "text-amber-700 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{totalMargin}%</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <Button type="submit" className="w-full gap-2 bg-primary text-primary-foreground font-bold text-sm h-9" disabled={submitting}>
                    {submitting ? "جاري الحفظ..." : <><Save className="w-4 h-4" />{fields.length > 1 ? `إنشاء فاتورة (${fields.length} منتجات)` : "إنشاء الطلب"}</>}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
