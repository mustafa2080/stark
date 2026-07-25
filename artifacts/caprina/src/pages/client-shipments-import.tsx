import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileSpreadsheet, CheckCircle2,
  ArrowRight, ArrowLeft, Settings2, Eye, Loader2,
  RotateCcw, Info, Package,
} from "lucide-react";
import { importApi, type ParsedImport } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";

// ─── Field definitions (نفس حقول فورم "شحنة جديدة" بتاع العميل، بدون اسم الراسل) ──
interface FieldDef { key: string; label: string; required: boolean; hint: string }

const CLIENT_SHIPMENTS_FIELDS: FieldDef[] = [
  { key: "receiverName",    label: "اسم المستلم",            required: true,  hint: "اسم المستلم، receiver، receiverName" },
  { key: "receiverPhone",   label: "هاتف المستلم",           required: false, hint: "هاتف المستلم، رقم المستلم، receiverPhone" },
  { key: "receiverPhone2",  label: "هاتف المستلم 2",         required: false, hint: "هاتف بديل، receiverPhone2" },
  { key: "receiverAddress", label: "عنوان المستلم",          required: false, hint: "العنوان، address، receiverAddress" },
  { key: "receiverCity",    label: "محافظة/مدينة المستلم",  required: false, hint: "المحافظة، المدينة، city" },
  { key: "zone",            label: "منطقة التوصيل",          required: false, hint: "المحافظة - المنطقة، zone، منطقة" },
  { key: "parcelType",      label: "نوع الشحنة",              required: false, hint: "عادي، مستندات، fragile، parcelType" },
  { key: "weight",          label: "الوزن (كجم)",            required: false, hint: "الوزن، weight" },
  { key: "description",     label: "وصف الشحنة",             required: false, hint: "الوصف، description" },
  { key: "paymentMethod",   label: "طريقة الدفع",            required: false, hint: "COD، مدفوع مسبقاً، آجل، paymentMethod" },
  { key: "codAmount",       label: "سعر الشحنة (الإجمالي)", required: false, hint: "السعر، الإجمالي، codAmount" },
  { key: "notes",           label: "ملاحظات",                 required: false, hint: "ملاحظات، notes" },
  { key: "canOpen",         label: "حالة الشحنة (الفتح)",    required: false, hint: "نعم/لا، canOpen، هل يمكن الفتح" },
  { key: "isDivisible",     label: "حالة التجزئة",            required: false, hint: "نعم/لا، isDivisible، قابلة للتجزئة" },
  { key: "rejectionPolicy", label: "حالة الرفض",              required: false, hint: "دفع كامل/مجاني، rejectionPolicy" },
];

// ─── Auto-detect columns ───────────────────────────────────────────────────
function autoDetect(headers: string[], fields: FieldDef[]): Record<string, string> {
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/[_\s\-]/g, "")
      .replace(/ة/g, "ه")
      .replace(/أ|إ|آ/g, "ا")
      .replace(/ى/g, "ي");
  const result: Record<string, string> = Object.fromEntries(fields.map(f => [f.key, ""]));
  const used = new Set<string>();
  const PATTERNS: Record<string, string[]> = {
    receiverName:     ["اسمالمستلم", "المستلم", "receivername", "receiver"],
    receiverPhone:    ["هاتفالمستلم", "رقمالمستلم", "receiverphone"],
    receiverPhone2:   ["هاتفالمستلم2", "receiverphone2"],
    receiverAddress:  ["عنوانالمستلم", "العنوان", "عنوان", "address", "receiveraddress"],
    receiverCity:     ["محافظهالمستلم", "مدينهالمستلم", "المحافظه", "المدينه", "city", "receivercity"],
    zone:             ["منطقهالتوصيل", "المنطقه", "منطقه", "zone"],
    parcelType:       ["نوعالشحنه", "نوعالطرد", "parceltype"],
    weight:           ["الوزن", "وزن", "weight"],
    description:      ["وصفالشحنه", "الوصف", "description"],
    paymentMethod:    ["طريقهالدفع", "الدفع", "paymentmethod"],
    codAmount:        ["سعرالشحنه", "الاجمالي", "codamount"],
    notes:            ["ملاحظات", "ملاحظه", "notes"],
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

// ─── Persistence ───────────────────────────────────────────────────────────
const saveMapping = (m: Record<string, string>) => {
  try { localStorage.setItem("caprina_client_shipments_mapping_v1", JSON.stringify(m)); } catch {}
};
const loadMapping = (): Record<string, string> | null => {
  try { const r = localStorage.getItem("caprina_client_shipments_mapping_v1"); return r ? JSON.parse(r) : null; } catch { return null; }
};

function cellDisplay(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ─── Steps indicator ───────────────────────────────────────────────────────
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

// ─── Main ───────────────────────────────────────────────────────────────────
export default function ClientShipmentsImportPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [fileName, setFileName] = useState("");
  const [hasSavedMapping, setHasSavedMapping] = useState(false);

  useEffect(() => { setHasSavedMapping(!!loadMapping()); }, []);

  const reset = () => {
    setStep(1); setParsed(null); setMapping({}); setResult(null); setError(null); setFileName("");
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) { setError("يرجى رفع ملف Excel (.xlsx, .xls) أو CSV."); return; }
    setError(null); setIsLoading(true); setFileName(file.name);
    try {
      const data = await importApi.parseClientShipments(file);
      if (!data.headers.length) { setError("لم يتم العثور على أعمدة."); setIsLoading(false); return; }
      setParsed(data);

      const saved = loadMapping();
      const auto = autoDetect(data.headers, CLIENT_SHIPMENTS_FIELDS);
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
  }, []);

  const handleImport = async () => {
    if (!parsed) return;
    setIsLoading(true); setError(null);
    saveMapping(mapping);
    setHasSavedMapping(true);
    try {
      const res = await importApi.executeClientShipments({ headers: parsed.headers, rows: parsed.allRows, mapping });
      setResult(res);
      setStep(4);
      if (res.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ["client-portal-shipments-full"] });
        queryClient.invalidateQueries({ queryKey: ["client-portal-stats"] });
        toast({
          title: "تم الاستيراد بنجاح",
          description: `تم استيراد ${res.imported} شحنة بنجاح.${res.errors?.length ? ` (${res.errors.length} أخطاء)` : ""}`,
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
    CLIENT_SHIPMENTS_FIELDS.forEach(f => {
      const col = mapping[f.key];
      const idx = col ? headers.indexOf(col) : -1;
      result[f.key] = idx >= 0 ? row[idx] : "";
    });
    return result;
  };

  const requiredMissing = CLIENT_SHIPMENTS_FIELDS.filter(f => f.required && !mapping[f.key]);

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/client-shipments")} className="text-muted-foreground hover:text-foreground transition-colors text-xs flex items-center gap-1">
            <ArrowRight className="w-3.5 h-3.5" />قائمة الشحنات
          </button>
          <span className="text-border">›</span>
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">تحميل شحنات من إكسيل</span>
          </div>
        </div>
        {step > 1 && (
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 border-border text-xs">
            <RotateCcw className="w-3 h-3" />ملف جديد
          </Button>
        )}
      </div>

      <Steps current={step} />

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <div className="space-y-4">
          {hasSavedMapping && (
            <Card className="border-emerald-900/40 bg-emerald-900/5">
              <CardContent className="p-3 flex items-center gap-2 text-xs text-emerald-400">
                <Info className="w-3.5 h-3.5 shrink-0" />
                لديك إعداد أعمدة محفوظ سيُطبَّق تلقائياً على الملف الجديد
              </CardContent>
            </Card>
          )}
          <Card className="border-teal-900/40 bg-teal-900/5">
            <CardContent className="p-3 flex gap-3 text-xs">
              <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <p className="text-muted-foreground leading-relaxed">
                نفس بيانات فورم <span className="text-teal-400 font-bold">"إنشاء شحنة"</span> بالظبط.
                <span className="text-teal-400 font-bold"> اسم المستلم</span> هو الحقل الوحيد المطلوب.
                لو حددت <span className="text-teal-400 font-bold">منطقة توصيل</span> أو <span className="text-teal-400 font-bold">نوع شحنة</span>، لازم تكون مطابقة لاسم موجود بالفعل في النظام
                وإلا هيظهر خطأ واضح لكل صف يوضح سبب الرفض.
              </p>
            </CardContent>
          </Card>

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

      {/* ── Step 2: Column Mapping ── */}
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
                  onClick={() => setMapping(autoDetect(parsed.headers, CLIENT_SHIPMENTS_FIELDS))}>
                  <RotateCcw className="w-3 h-3" />اكتشاف تلقائي
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CLIENT_SHIPMENTS_FIELDS.map(field => (
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
            <Button size="sm" className="gap-1 font-bold" onClick={() => setStep(3)} disabled={requiredMissing.length > 0}>
              معاينة<ArrowLeft className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && parsed && (
        <div className="space-y-4">
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
                      {CLIENT_SHIPMENTS_FIELDS.filter(f => mapping[f.key]).map(f => (
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
                          {CLIENT_SHIPMENTS_FIELDS.filter(f => mapping[f.key]).map(f => (
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
            <Button size="sm" className="gap-1.5 font-bold min-w-[140px]" onClick={handleImport} disabled={isLoading}>
              {isLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الاستيراد...</>
                : <>تأكيد الاستيراد<ArrowLeft className="w-3.5 h-3.5" /></>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Result ── */}
      {step === 4 && result && (
        <div className="space-y-4">
          <Card className={`border ${(result.imported ?? 0) > 0 ? "border-emerald-800 bg-emerald-900/10" : "border-amber-800 bg-amber-900/10"}`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${(result.imported ?? 0) > 0 ? "bg-emerald-500/20" : "bg-amber-500/20"}`}>
                  <CheckCircle2 className={`w-6 h-6 ${(result.imported ?? 0) > 0 ? "text-emerald-400" : "text-amber-400"}`} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-base mb-2">نتيجة الاستيراد</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-black text-emerald-400">{result.imported}</p>
                      <p className="text-xs text-muted-foreground">تم استيرادها</p>
                    </div>
                    {result.failed > 0 && (
                      <div className="text-center">
                        <p className="text-2xl font-black text-red-400">{result.failed}</p>
                        <p className="text-xs text-muted-foreground">فشل</p>
                      </div>
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
            <Button className="flex-1 font-bold gap-2" onClick={reset}>
              <Upload className="w-4 h-4" />استيراد ملف آخر
            </Button>
            <Button variant="outline" className="border-border" onClick={() => navigate("/client-shipments")}>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
