import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileSpreadsheet, CheckCircle2,
  ArrowRight, ArrowLeft, Settings2, Eye, Loader2,
  RotateCcw, Info, Link2, Package, Undo2, AlertTriangle, GitMerge, List,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { importApi, type ParsedImport } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";

// ─── Types ─────────────────────────────────────────────────────────────────────
type ImportMode = "products" | "returns" | "inventory" | "shipments";

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  hint: string;
}

// ─── Field definitions per mode ────────────────────────────────────────────────
const PRODUCTS_FIELDS: FieldDef[] = [
  { key: "name",           label: "اسم المنتج",        required: true,  hint: "product, item, name, منتج, اسم" },
  { key: "sku",            label: "SKU",               required: false, hint: "sku, code, كود, رقم" },
  { key: "unitPrice",      label: "سعر البيع (ج.م)",  required: false, hint: "price, sell, بيع, سعر, selling" },
  { key: "costPrice",      label: "سعر التكلفة (ج.م)", required: false, hint: "cost, تكلفة, شراء, buying" },
  { key: "totalQuantity",  label: "الكمية",            required: false, hint: "qty, quantity, كمية, stock" },
  { key: "lowStockThreshold", label: "حد التنبيه",    required: false, hint: "threshold, minimum, حد, تنبيه" },
  { key: "color",          label: "اللون",             required: false, hint: "color, colour, لون" },
  { key: "size",           label: "المقاس",            required: false, hint: "size, مقاس, قياس" },
];

const RETURNS_FIELDS: FieldDef[] = [
  { key: "orderId",      label: "رقم الطلب",     required: false, hint: "id, order_id, رقم, طلب" },
  { key: "customerName", label: "اسم العميل",    required: false, hint: "customer, name, اسم, عميل" },
  { key: "product",      label: "المنتج",         required: false, hint: "product, item, منتج" },
  { key: "reason",       label: "سبب الإرجاع",  required: false, hint: "reason, سبب, ملاحظة" },
];

// نفس حقول فورم "شحنة جديدة" بالظبط، عشان يترفع الملف بدون مشاكل
const SHIPMENTS_FIELDS: FieldDef[] = [
  { key: "senderName",      label: "اسم الراسل",             required: true,  hint: "اسم الراسل، sender، senderName" },
  { key: "senderPhone",     label: "هاتف الراسل",            required: false, hint: "هاتف الراسل، رقم الراسل، senderPhone" },
  { key: "senderPhone2",    label: "هاتف الراسل 2",          required: true,  hint: "هاتف بديل، senderPhone2" },
  { key: "senderCity",      label: "محافظة الراسل",          required: false, hint: "محافظة الراسل، senderCity" },
  { key: "receiverName",    label: "اسم المستلم",            required: true,  hint: "اسم المستلم، receiver، receiverName" },
  { key: "receiverPhone",   label: "هاتف المستلم",           required: false, hint: "هاتف المستلم، رقم المستلم، receiverPhone" },
  { key: "receiverPhone2",  label: "هاتف المستلم 2",         required: true,  hint: "هاتف بديل، receiverPhone2" },
  { key: "receiverAddress", label: "عنوان المستلم",          required: false, hint: "العنوان، address، receiverAddress" },
  { key: "receiverCity",    label: "محافظة/مدينة المستلم",  required: false, hint: "المحافظة، المدينة، city" },
  { key: "zone",            label: "منطقة التوصيل",          required: false, hint: "المحافظة - المنطقة، zone، منطقة" },
  { key: "parcelType",      label: "نوع الشحنة",              required: false, hint: "عادي، مستندات، fragile، parcelType" },
  { key: "weight",          label: "الوزن (كجم)",            required: false, hint: "الوزن، weight" },
  { key: "pieces",          label: "عدد القطع",              required: false, hint: "القطع، pieces، عدد" },
  { key: "description",     label: "وصف الشحنة",             required: false, hint: "الوصف، description" },
  { key: "paymentMethod",   label: "طريقة الدفع",            required: false, hint: "COD، مدفوع مسبقاً، آجل، paymentMethod" },
  { key: "codAmount",       label: "سعر الشحنة (الإجمالي)", required: false, hint: "السعر، الإجمالي، codAmount" },
  { key: "notes",           label: "ملاحظات",                 required: false, hint: "ملاحظات، notes" },
  { key: "warehouse",       label: "المخزن",                  required: true,  hint: "اسم المخزن، warehouse" },
  { key: "canOpen",         label: "حالة الشحنة (الفتح)",    required: true,  hint: "نعم/لا، canOpen، هل يمكن الفتح" },
  { key: "isDivisible",     label: "حالة التجزئة",            required: true,  hint: "نعم/لا، isDivisible، قابلة للتجزئة" },
  { key: "rejectionPolicy", label: "حالة الرفض",              required: true,  hint: "دفع كامل/مجاني، rejectionPolicy" },
];

// ─── Auto-detect ───────────────────────────────────────────────────────────────
function autoDetect(headers: string[], fields: FieldDef[]): Record<string, string> {
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/[_\s\-]/g, "")          // شيل المسافات والشرطات
      .replace(/ة/g, "ه")               // توحيد التاء المربوطة
      .replace(/أ|إ|آ/g, "ا")           // توحيد الألف
      .replace(/ى/g, "ي");              // توحيد الألف المقصورة
  const result: Record<string, string> = Object.fromEntries(fields.map(f => [f.key, ""]));
  const used = new Set<string>();
  const PATTERNS: Record<string, string[]> = {
    name:             ["اسمالعميل", "اسم", "customername", "name", "customer", "عميل"],
    phone:            ["رقمالهاتف", "هاتف", "phone", "mobile", "tel", "رقم"],
    city:             ["المحافظه", "محافظه", "city"],
    address:          ["العنوان", "عنوان", "address", "addr"],
    product:          ["الصنف", "صنف", "المنتج", "منتج", "product", "item"],
    color:            ["اللون", "لون", "color", "colour"],
    size:             ["المقاسالمعادل", "المقاس", "مقاس", "size"],
    quantity:         ["العدد", "عدد", "الكميه", "كميه", "quantity", "qty"],
    price:            ["السعر", "سعر", "سعرالوحده", "price", "unitprice"],
    notes:            ["ملاحظات", "ملاحظه", "notes", "remarks"],
    warehouseId:      ["المخزنالصادرمنه", "المخزنالصادر", "المخزن", "مخزن", "warehouse"],
    shippingCost:     ["تكلفهالشحن", "شحن", "shippingcost", "shipping"],
    unitPrice:        ["سعرالبيع", "بيع", "selling", "unitprice", "price", "سعر"],
    costPrice:        ["سعرالتكلفه", "تكلفه", "cost", "شراء", "buying"],
    totalQuantity:    ["الكميه", "كميه", "quantity", "qty", "stock"],
    lowStockThreshold:["حدالتنبيه", "حد", "threshold", "minimum", "تنبيه"],
    sku:              ["sku", "code", "كود", "رمز"],
    orderId:          ["رقمالطلب", "id", "orderid", "رقم", "طلب"],
    customerName:     ["اسمالعميل", "اسم", "customer", "name", "عميل"],
    reason:           ["سبب", "reason", "ملاحظه", "notes"],
    senderName:       ["اسمالراسل", "الراسل", "sendername", "sender"],
    senderPhone:      ["هاتفالراسل", "رقمالراسل", "senderphone"],
    senderPhone2:     ["هاتفالراسل2", "senderphone2"],
    senderCity:       ["محافظهالراسل", "sendercity"],
    receiverName:     ["اسمالمستلم", "المستلم", "receivername", "receiver"],
    receiverPhone:    ["هاتفالمستلم", "رقمالمستلم", "receiverphone"],
    receiverPhone2:   ["هاتفالمستلم2", "receiverphone2"],
    receiverAddress:  ["عنوانالمستلم", "العنوان", "عنوان", "address", "receiveraddress"],
    receiverCity:     ["محافظهالمستلم", "مدينهالمستلم", "المحافظه", "المدينه", "city", "receivercity"],
    zone:             ["منطقهالتوصيل", "المنطقه", "منطقه", "zone"],
    parcelType:       ["نوعالشحنه", "نوعالطرد", "parceltype"],
    weight:           ["الوزن", "وزن", "weight"],
    pieces:           ["عددالقطع", "القطع", "قطع", "pieces"],
    description:      ["وصفالشحنه", "الوصف", "description"],
    paymentMethod:    ["طريقهالدفع", "الدفع", "paymentmethod"],
    codAmount:        ["سعرالشحنه", "الاجمالي", "codamount"],
    warehouse:        ["المخزن", "مخزن", "warehouse"],
    canOpen:          ["حالهالشحنهالفتح", "حالهالفتح", "الفتح", "canopen"],
    isDivisible:      ["حالهالتجزئه", "التجزئه", "isdivisible"],
    rejectionPolicy:  ["حالهالرفض", "الرفض", "rejectionpolicy"],
  };
  for (const field of fields) {
    const patterns = PATTERNS[field.key] ?? [];
    for (const pattern of patterns) {
      const match = headers.find(h => norm(h) === pattern && !used.has(h));
      if (match) { result[field.key] = match; used.add(match); break; }
    }
    if (!result[field.key]) {
      for (const pattern of patterns) {
        const match = headers.find(h => norm(h).includes(pattern) && !used.has(h));
        if (match) { result[field.key] = match; used.add(match); break; }
      }
    }
  }
  return result;
}

// ─── Persistence ───────────────────────────────────────────────────────────────
const saveMapping = (mode: ImportMode, m: Record<string, string>) => {
  try { localStorage.setItem(`caprina_mapping_${mode}_v1`, JSON.stringify(m)); } catch {}
};
const loadMapping = (mode: ImportMode): Record<string, string> | null => {
  try { const r = localStorage.getItem(`caprina_mapping_${mode}_v1`); return r ? JSON.parse(r) : null; } catch { return null; }
};

// ─── Steps ─────────────────────────────────────────────────────────────────────
function Steps({ current }: { current: number }) {
  const steps = ["رفع الملف", "ضبط الأعمدة", "معاينة", "النتيجة"];
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={i} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 text-[11px] font-bold ${active ? "text-primary" : done ? "text-emerald-400" : "text-muted-foreground"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border
                ${active ? "bg-primary text-black border-primary" : done ? "bg-emerald-500 text-black border-emerald-500" : "border-border text-muted-foreground"}`}>
                {done ? "✓" : idx}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < steps.length - 1 && <div className={`w-8 h-px ${done ? "bg-emerald-500" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function cellDisplay(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ─── Mode Selector ─────────────────────────────────────────────────────────────
const MODES: { id: ImportMode; label: string; desc: string; icon: any; color: string }[] = [
  { id: "shipments", label: "شحنات",     desc: "استورد قائمة شحنات جاهزة مباشرة",      icon: Package,      color: "border-teal-700/40 bg-teal-900/5 text-teal-400" },
  { id: "products",  label: "منتجات",     desc: "استورد منتجات بأسعار البيع والتكلفة",   icon: Package,      color: "border-amber-700/40 bg-amber-900/5 text-amber-400" },
  { id: "returns",   label: "مرتجعات",   desc: "سجّل مرتجعات بالجملة من ملف Excel",    icon: Undo2,        color: "border-red-800/40 bg-red-900/5 text-red-400" },
  { id: "inventory", label: "مخزون",     desc: "تحديث كميات المخزون عبر SKU",          icon: Package,      color: "border-green-700/40 bg-green-900/5 text-green-400" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Import() {
  const { isAdmin, can } = useAuth();
  // ── Import access guard ────────────────────────────────────────────────────
  if (!isAdmin && !can("tools.import")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
        <p className="text-muted-foreground text-sm max-w-xs">ليس لديك صلاحية للاستيراد. تواصل مع المدير.</p>
      </div>
    );
  }
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ImportMode | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [fileName, setFileName] = useState("");
  const [hasSavedMapping, setHasSavedMapping] = useState(false);
  const [duplicateCustomers, setDuplicateCustomers] = useState<{ name: string; count: number; rows: number[] }[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<"separate" | "merge" | null>(null);

  const currentFields = mode === "products" ? PRODUCTS_FIELDS
    : mode === "shipments" ? SHIPMENTS_FIELDS
    : RETURNS_FIELDS ?? [];

  useEffect(() => {
    if (mode) setHasSavedMapping(!!loadMapping(mode));
  }, [mode]);

  const reset = () => {
    setStep(1); setParsed(null); setMapping({}); setResult(null); setError(null); setFileName("");
    setDuplicateCustomers([]); setDuplicateAction(null);
  };

  // ── Detect duplicate customers (خاص بوضع الطلبات المحذوف - يرجع دايمًا فاضي) ──
  const detectDuplicates = (_rows: any[][], _hdrs: string[], _mp: Record<string, string>) => {
    return [] as { name: string; count: number; rows: number[] }[];
  };
  const resetAll = () => { reset(); setMode(null); };
  const handleFile = useCallback(async (file: File) => {
    if (!mode) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) { setError("يرجى رفع ملف Excel (.xlsx, .xls) أو CSV."); return; }
    setError(null); setIsLoading(true); setFileName(file.name);

    // Inventory mode: direct upload, no column mapping step
    if (mode === "inventory") {
      try {
        const data = await importApi.uploadInventory(file);
        setResult(data);
        setStep(4);
        queryClient.invalidateQueries({ queryKey: ["variants"] });
      } catch (e: any) {
        setError(e.message || "فشل معالجة الملف.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const parseFn = mode === "products" ? importApi.parseProducts
        : mode === "shipments" ? importApi.parseShipments
        : importApi.parseReturns;
      const data = await parseFn(file);
      if (!data.headers.length) { setError("لم يتم العثور على أعمدة."); setIsLoading(false); return; }
      setParsed(data);

      const saved = loadMapping(mode);
      const auto = autoDetect(data.headers, currentFields);
      if (saved) {
        const merged: Record<string, string> = { ...auto };
        Object.keys(saved).forEach(k => {
          if (saved[k] && data.headers.includes(saved[k])) merged[k] = saved[k];
        });
        setMapping(merged);
      } else {
        setMapping(auto);
      }
      setStep(2);
    } catch (e: any) {
      setError(e.message || "فشل قراءة الملف.");
    } finally {
      setIsLoading(false);
    }
  }, [mode, currentFields]);

  // ── Execute Import ─────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsed || !mode) return;
    setIsLoading(true); setError(null);
    saveMapping(mode, mapping);
    setHasSavedMapping(true);
    try {
      let res: any;
      const payload = { headers: parsed.headers, rows: parsed.allRows, mapping, duplicateAction: duplicateAction ?? "separate" };
      if (mode === "products") res = await importApi.executeProducts(payload);
      else if (mode === "shipments") res = await importApi.executeShipments(payload);
      else res = await importApi.executeReturns(payload);
      setResult(res);
      setStep(4);
      if (res.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["variants"] });
        queryClient.invalidateQueries({ queryKey: ["analytics-profit"] });
        if (mode === "shipments") queryClient.invalidateQueries({ queryKey: ["shipments"] });
        const modeLabel = mode === "products" ? "منتجات" : mode === "shipments" ? "شحنات" : "مرتجعات";
        toast({
          title: `تم الاستيراد بنجاح`,
          description: `تم استيراد ${res.imported} ${modeLabel} بنجاح.${res.errors?.length ? ` (${res.errors.length} أخطاء)` : ""}`,
        });
      }
    } catch (e: any) {
      setError(e.message || "فشل الاستيراد.");
    } finally {
      setIsLoading(false);
    }
  };

  const getPreviewRow = (row: any[]): Record<string, any> => {
    const headers = parsed?.headers ?? [];
    const result: Record<string, any> = {};
    currentFields.forEach(f => {
      const col = mapping[f.key];
      const idx = col ? headers.indexOf(col) : -1;
      result[f.key] = idx >= 0 ? row[idx] : "";
    });
    return result;
  };

  const requiredMissing = currentFields.filter(f => f.required && !mapping[f.key]);

  // ─── Mode Selection ───────────────────────────────────────────────────────────
  if (!mode) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in duration-500">
        <div>
          <h1 className="text-2xl font-bold">استيراد Excel</h1>
          <p className="text-muted-foreground text-sm mt-0.5">اختر نوع الاستيراد</p>
        </div>
        <div className="grid gap-3">
          {MODES.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`w-full text-right p-4 rounded-xl border-2 transition-all hover:scale-[1.01] active:scale-[0.99] ${m.color}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background/30 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-base">{m.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{m.desc}</p>
                  </div>
                  <ArrowLeft className="w-4 h-4 mr-auto opacity-60" />
                </div>
              </button>
            );
          })}
        </div>
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex gap-3">
            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="font-bold text-foreground mb-1">ارفع أي تنسيق Excel أو CSV</p>
              بعد الرفع ستختار أي عمود يقابل أي حقل. النظام يحاول تعرّف الأعمدة تلقائياً ويحفظ إعدادك لاستخدامه في المرات القادمة.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const modeInfo = MODES.find(m => m.id === mode)!;
  const ModeIcon = modeInfo.icon;

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={resetAll} className="text-muted-foreground hover:text-foreground transition-colors text-xs flex items-center gap-1">
            <ArrowRight className="w-3.5 h-3.5" />استيراد Excel
          </button>
          <span className="text-border">›</span>
          <div className="flex items-center gap-2">
            <ModeIcon className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">استيراد {modeInfo.label}</span>
          </div>
        </div>
        {step > 1 && (
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 border-border text-xs">
            <RotateCcw className="w-3 h-3" />ملف جديد
          </Button>
        )}
      </div>

      <Steps current={step} />

      {/* ── Step 1: Upload ─────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {hasSavedMapping && (
            <Card className="border-emerald-900/40 bg-emerald-900/5">
              <CardContent className="p-3 flex items-center gap-2 text-xs text-emerald-400">
                <Link2 className="w-3.5 h-3.5 shrink-0" />
                لديك إعداد أعمدة محفوظ سيُطبَّق تلقائياً على الملف الجديد
              </CardContent>
            </Card>
          )}
          {mode === "products" && (
            <Card className="border-amber-900/40 bg-amber-900/5">
              <CardContent className="p-3 flex gap-3 text-xs">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-muted-foreground leading-relaxed">
                  كل صف يمثل منتجاً أو <span className="text-amber-400 font-bold">SKU (لون + مقاس)</span>. إذا كان المنتج موجوداً بنفس الاسم، سيتم تحديث أسعاره.
                  إذا أضفت لون ومقاس، سيُنشأ SKU جديد تحت نفس المنتج.
                </p>
              </CardContent>
            </Card>
          )}
          {mode === "inventory" && (
            <Card className="border-green-900/40 bg-green-900/5">
              <CardContent className="p-3 flex gap-3 text-xs">
                <Info className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                <p className="text-muted-foreground leading-relaxed">
                  الملف يجب أن يحتوي على عمود <span className="text-green-400 font-bold">SKU</span> (أو: باركود، كود)
                  وعمود <span className="text-green-400 font-bold">الكمية المضافة</span> (أو: كمية، qty). يمكن إضافة
                  عمود <span className="text-green-400 font-bold">سعر التكلفة</span> اختيارياً لتحديث التكلفة في نفس الوقت.
                  الكميات تُضاف على الرصيد الحالي ولا تحل محله.
                </p>
              </CardContent>
            </Card>
          )}
          {mode === "returns" && (
            <Card className="border-red-900/40 bg-red-900/5">
              <CardContent className="p-3 flex gap-3 text-xs">
                <Info className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-muted-foreground leading-relaxed">
                  حدّد الطلبات بـ<span className="text-red-400 font-bold">رقم الطلب</span> أو بـ(اسم العميل + المنتج).
                  سيتم تغيير حالة الطلبات إلى &quot;مُرتجع&quot; وإضافة سبب الإرجاع في الملاحظات.
                </p>
              </CardContent>
            </Card>
          )}
          {mode === "shipments" && (
            <Card className="border-teal-900/40 bg-teal-900/5">
              <CardContent className="p-3 flex gap-3 text-xs">
                <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <p className="text-muted-foreground leading-relaxed">
                  نفس بيانات فورم <span className="text-teal-400 font-bold">"شحنة جديدة"</span> بالظبط.
                  <span className="text-teal-400 font-bold"> اسم الراسل، اسم المستلم، والمخزن</span> حقول مطلوبة.
                  لو حددت <span className="text-teal-400 font-bold">منطقة توصيل</span> أو <span className="text-teal-400 font-bold">نوع شحنة</span>، لازم تكون مطابقة لاسم موجود بالفعل في النظام
                  وإلا هيظهر خطأ واضح لكل صف يوضح سبب الرفض.
                </p>
              </CardContent>
            </Card>
          )}

          <div
            className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200
              ${isDragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/10"}
              ${isLoading ? "pointer-events-none opacity-70" : ""}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            {isLoading ? (
              <div className="space-y-3">
                <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
                <p className="text-sm font-bold text-primary">جاري قراءة الملف...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                  {isDragging ? <FileSpreadsheet className="w-8 h-8 text-primary" /> : <Upload className="w-8 h-8 text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-bold">{isDragging ? "أفلت الملف هنا" : "اسحب الملف هنا أو انقر للاختيار"}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">يدعم: .xlsx, .xls, .csv — حتى 15MB</p>
                </div>
              </div>
            )}
          </div>
          {error && <ErrorCard message={error} />}
        </div>
      )}

      {/* ── Step 2: Column Mapping ─────────────────────────────────────────────── */}
      {step === 2 && parsed && (
        <div className="space-y-4">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-bold text-sm flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-primary" />ربط الأعمدة
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono text-foreground">{fileName}</span> &nbsp;|&nbsp;
                    <span className="text-emerald-400">{parsed.totalRows} صف</span> &nbsp;|&nbsp;
                    {parsed.headers.length} عمود
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground"
                  onClick={() => setMapping(autoDetect(parsed.headers, currentFields))}>
                  <RotateCcw className="w-3 h-3" />اكتشاف تلقائي
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentFields.map(field => (
                  <div key={field.key}>
                    <Label className="text-xs mb-1.5 flex items-center gap-1.5">
                      {field.label}
                      {field.required
                        ? <Badge variant="outline" className="text-[8px] border-primary/40 text-primary px-1 py-0">مطلوب</Badge>
                        : <Badge variant="outline" className="text-[8px] border-border text-muted-foreground px-1 py-0">اختياري</Badge>
                      }
                    </Label>
                    <Select
                      value={mapping[field.key] || "__none__"}
                      onValueChange={v => setMapping(m => ({ ...m, [field.key]: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger className="h-9 text-xs bg-background border-border">
                        <SelectValue placeholder="— غير مربوط —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— غير مربوط —</SelectItem>
                        {parsed.headers.filter(h => h?.trim()).map(h => (
                          <SelectItem key={h} value={h}>
                            <div className="flex items-center gap-2">
                              <span>{h}</span>
                              {parsed.sample[0] && parsed.headers.indexOf(h) >= 0 && (
                                <span className="text-muted-foreground text-[10px] font-mono truncate max-w-[100px]">
                                  {cellDisplay(parsed.sample[0][parsed.headers.indexOf(h)])}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{field.hint}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground mb-2 font-bold uppercase tracking-wider">الأعمدة المتاحة في الملف</p>
              <div className="flex flex-wrap gap-1.5">
                {parsed.headers.map((h, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] font-mono border-border">{h}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {requiredMissing.length > 0 && (
            <ErrorCard message={`الحقول المطلوبة غير مربوطة: ${requiredMissing.map(f => f.label).join("، ")}`} />
          )}
          {error && <ErrorCard message={error} />}

          <div className="flex justify-between">
            <Button variant="outline" size="sm" className="border-border gap-1" onClick={() => setStep(1)}>
              <ArrowRight className="w-3.5 h-3.5" />رجوع
            </Button>
            <Button size="sm" className="gap-1 font-bold" onClick={() => {
              if (parsed) {
                const dups = detectDuplicates(parsed.allRows, parsed.headers, mapping);
                setDuplicateCustomers(dups);
                setDuplicateAction(dups.length > 0 ? null : "separate");
              }
              setStep(3);
            }} disabled={requiredMissing.length > 0}>
              معاينة<ArrowLeft className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ────────────────────────────────────────────────────── */}
      {step === 3 && parsed && (
        <div className="space-y-4">

          {/* ── Duplicate customers warning ───────────────────────────────────── */}
          {duplicateCustomers.length > 0 && (
            <Card className="border-amber-700/50 bg-amber-900/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-amber-400 text-sm mb-1">
                      {duplicateCustomers.length === 1
                        ? "عميل واحد عنده أكثر من طلب في الملف"
                        : `${duplicateCustomers.length} عملاء عندهم أكثر من طلب في الملف`}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {duplicateCustomers.map(d => (
                        <Badge key={d.name} variant="outline" className="border-amber-700/50 text-amber-300 text-[10px] gap-1">
                          {d.name}
                          <span className="bg-amber-700/40 rounded px-1">{d.count} طلبات</span>
                          <span className="text-amber-600 font-mono">صفوف: {d.rows.join("، ")}</span>
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">كيف تريد التعامل مع هذه الطلبات؟</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setDuplicateAction("separate")}
                        className={`p-3 rounded-lg border text-right transition-all ${duplicateAction === "separate"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <List className="w-4 h-4 shrink-0" />
                          <span className="font-bold text-xs">طلبات منفصلة</span>
                        </div>
                        <p className="text-[10px] opacity-70">كل صف يُستورد كطلب مستقل كما هو</p>
                      </button>
                      <button
                        onClick={() => setDuplicateAction("merge")}
                        className={`p-3 rounded-lg border text-right transition-all ${duplicateAction === "merge"
                          ? "border-emerald-500 bg-emerald-900/20 text-emerald-400"
                          : "border-border hover:border-emerald-700/40 text-muted-foreground hover:text-foreground"}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <GitMerge className="w-4 h-4 shrink-0" />
                          <span className="font-bold text-xs">دمج في طلب واحد</span>
                        </div>
                        <p className="text-[10px] opacity-70">طلبات نفس العميل تُجمع في طلب واحد</p>
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-primary" />
                <p className="font-bold text-sm">معاينة أول 5 صفوف</p>
                <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                  {parsed.totalRows} صف إجمالي
                </Badge>
              </div>

              <div className="overflow-x-auto rounded border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      {currentFields.filter(f => mapping[f.key]).map(f => (
                        <TableHead key={f.key} className="text-right text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {f.label}
                            {f.required && <span className="text-primary">*</span>}
                          </div>
                          <div className="text-[9px] text-muted-foreground font-normal font-mono">← {mapping[f.key]}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.sample.map((row, ri) => {
                      const mapped = getPreviewRow(row);
                      return (
                        <TableRow key={ri} className="border-border hover:bg-muted/10">
                          {currentFields.filter(f => mapping[f.key]).map(f => (
                            <TableCell key={f.key} className={`text-xs ${f.required && !mapped[f.key] ? "text-red-400" : ""}`}>
                              {cellDisplay(mapped[f.key])}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                سيتم استيراد <span className="font-bold text-foreground">{parsed.totalRows}</span> صف بعد التأكيد.
              </p>
            </CardContent>
          </Card>

          {error && <ErrorCard message={error} />}

          <div className="flex justify-between">
            <Button variant="outline" size="sm" className="border-border gap-1" onClick={() => setStep(2)}>
              <ArrowRight className="w-3.5 h-3.5" />تعديل الأعمدة
            </Button>
            <Button size="sm" className="gap-1.5 font-bold min-w-[140px]" onClick={handleImport}
              disabled={isLoading || (duplicateCustomers.length > 0 && duplicateAction === null)}>
              {isLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الاستيراد...</>
                : duplicateCustomers.length > 0 && duplicateAction === null
                  ? <>⚠ اختر كيفية التعامل مع التكرار</>
                  : <>تأكيد الاستيراد<ArrowLeft className="w-3.5 h-3.5" /></>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Result ─────────────────────────────────────────────────────── */}
      {step === 4 && result && (
        <div className="space-y-4">
          <Card className={`border ${(result.imported ?? result.updated ?? 0) > 0 ? "border-emerald-800 bg-emerald-900/10" : "border-amber-800 bg-amber-900/10"}`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${(result.imported ?? result.updated ?? 0) > 0 ? "bg-emerald-500/20" : "bg-amber-500/20"}`}>
                  <CheckCircle2 className={`w-6 h-6 ${(result.imported ?? result.updated ?? 0) > 0 ? "text-emerald-400" : "text-amber-400"}`} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-base mb-2">
                    {mode === "inventory" ? "نتيجة تحديث المخزون" : "نتيجة الاستيراد"}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {mode === "inventory" ? (
                      <>
                        <div className="text-center">
                          <p className="text-2xl font-black text-emerald-400">{result.updated}</p>
                          <p className="text-xs text-muted-foreground">SKU محدّث</p>
                        </div>
                        {result.failed > 0 && (
                          <div className="text-center">
                            <p className="text-2xl font-black text-red-400">{result.failed}</p>
                            <p className="text-xs text-muted-foreground">فشل</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                    <div className="text-center">
                      <p className="text-2xl font-black text-emerald-400">{result.imported}</p>
                      <p className="text-xs text-muted-foreground">تم استيراده</p>
                    </div>
                    {result.importedProducts !== undefined && (
                      <div className="text-center">
                        <p className="text-lg font-black text-amber-400">{result.importedProducts}</p>
                        <p className="text-xs text-muted-foreground">منتج جديد</p>
                      </div>
                    )}
                    {result.importedVariants !== undefined && (
                      <div className="text-center">
                        <p className="text-lg font-black text-primary">{result.importedVariants}</p>
                        <p className="text-xs text-muted-foreground">SKU جديد</p>
                      </div>
                    )}
                    {result.failed > 0 && (
                      <div className="text-center">
                        <p className="text-2xl font-black text-red-400">{result.failed}</p>
                        <p className="text-xs text-muted-foreground">فشل</p>
                      </div>
                    )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {result.errors?.length > 0 && (
            <Card className="border-red-900/40 bg-red-900/5">
              <CardContent className="p-4">
                <p className="text-xs font-bold text-red-400 mb-2">تفاصيل الأخطاء</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {result.errors.map((e: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground font-mono">{e}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button className="flex-1 font-bold gap-2" onClick={resetAll}>
              <Upload className="w-4 h-4" />استيراد ملف آخر
            </Button>
            <Button variant="outline" className="border-border" onClick={reset}>
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-red-900/40 bg-red-900/10">
      <CardContent className="p-3 flex gap-2 text-xs text-red-400">
        <span className="font-bold shrink-0">⚠</span>
        <span>{message}</span>
      </CardContent>
    </Card>
  );
}
