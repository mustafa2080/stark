import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, RefreshCw, Trash2, Layers, Image as ImageIcon, X, Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────
type ParcelType = "document" | "normal" | "fragile" | "heavy" | "electronics" | "clothing" | "food" | "other";
interface ParcelTypePricing { id: number; parcelType: ParcelType; label?: string; basePrice: string | number; imageUrl?: string | null }

const PARCEL_LABELS: Record<ParcelType, string> = {
  document: "مستندات", normal: "طرد عادي", fragile: "قابل للكسر",
  heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس",
  food: "طعام", other: "أخري",
};

// ─── API helpers ──────────────────────────────────────────────────────────────
function apiHeaders() {
  const token = localStorage.getItem("caprina_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { headers: apiHeaders(), ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || r.statusText); }
  return r.json();
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ParcelTypesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editPrices, setEditPrices] = useState<Record<number, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newImage, setNewImage] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  // حالة تعديل الصورة لكل كارد
  const [editImgId, setEditImgId] = useState<number | null>(null);
  const [editImgPreview, setEditImgPreview] = useState<string | null>(null);
  const [savingImg, setSavingImg] = useState(false);

  // ── ضغط وتحويل الصورة لـ base64 ────────────────────────────────────────────
  const compressImage = (file: File, onDone: (b64: string) => void, onStart?: () => void) => {
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
  };

  const handleImageFile = (file: File) =>
    compressImage(file, (b64) => { setNewImage(b64); setUploadingImg(false); }, () => setUploadingImg(true));

  // حفظ صورة نوع موجود
  const handleSaveImage = async (id: number) => {
    if (!editImgPreview) return;
    setSavingImg(true);
    try {
      await apiFetch(`/parcel-type-pricing/${id}`, { method: "PUT", body: JSON.stringify({ imageUrl: editImgPreview }) });
      qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] });
      toast({ title: "تم حفظ الصورة ✅" });
      setEditImgId(null); setEditImgPreview(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSavingImg(false);
    }
  };

  // حذف صورة نوع موجود
  const handleRemoveImage = async (id: number) => {
    setSavingImg(true);
    try {
      await apiFetch(`/parcel-type-pricing/${id}`, { method: "PUT", body: JSON.stringify({ imageUrl: null }) });
      qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] });
      toast({ title: "تم حذف الصورة" });
      setEditImgId(null); setEditImgPreview(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSavingImg(false);
    }
  };

  const { data: pricing = [], isLoading } = useQuery({
    queryKey: ["parcel-type-pricing"],
    queryFn: () => apiFetch<ParcelTypePricing[]>("/parcel-type-pricing"),
  });

  const initMutation = useMutation({
    mutationFn: () => apiFetch("/parcel-type-pricing/init", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] }); toast({ title: "تمت التهيئة ✅" }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, basePrice }: { id: number; basePrice: number }) =>
      apiFetch(`/parcel-type-pricing/${id}`, { method: "PUT", body: JSON.stringify({ basePrice }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] }); toast({ title: "تم التحديث ✅" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: (d: any) => apiFetch("/parcel-type-pricing", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] });
      toast({ title: "تمت الإضافة ✅" });
      setAddOpen(false); setNewType(""); setNewLabel(""); setNewPrice(""); setNewImage(null);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/parcel-type-pricing/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parcel-type-pricing"] }); toast({ title: "تم الحذف" }); },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const ICONS: Record<string, string> = {
    document: "📄", normal: "📦", fragile: "🔮", heavy: "⚖️",
    electronics: "💻", clothing: "👕", food: "🍱", other: "📫",
  };

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-foreground flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            أنواع الشحنات وأسعارها
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">إدارة أسعار أنواع الطرود</p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-black flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-500" /> أسعار أنواع الشحنات
          </CardTitle>
          <div className="flex gap-2">
            {pricing.length === 0 && (
              <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8"
                onClick={() => initMutation.mutate()} disabled={initMutation.isPending}>
                {initMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                تهيئة الأسعار الافتراضية
              </Button>
            )}
            <Button size="sm" className="text-xs gap-1.5 h-8"
              onClick={() => setAddOpen(true)}>
              <Plus className="w-3 h-3" /> إضافة نوع جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : pricing.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-xs text-muted-foreground mb-3">لا توجد أسعار — اضغط "تهيئة الأسعار الافتراضية" لإضافة الأنواع الـ 8</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pricing.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
                  {/* صورة / إيموجي + زر تغيير واضح */}
                  <div className="relative shrink-0">
                    <input
                      id={`img-edit-${p.id}`} type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        setEditImgId(p.id);
                        compressImage(f, (b64) => setEditImgPreview(b64));
                        e.target.value = "";
                      }}
                    />
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-border">
                      {(editImgId === p.id && editImgPreview) ? (
                        <img src={editImgPreview} className="w-full h-full object-cover" alt="preview" />
                      ) : p.imageUrl ? (
                        <img src={p.imageUrl} className="w-full h-full object-cover" alt={p.label ?? ""} />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-2xl bg-muted/30">{ICONS[p.parcelType] ?? "📦"}</span>
                      )}
                    </div>
                    {/* زر كاميرا دايماً ظاهر */}
                    <button
                      type="button"
                      className="absolute -bottom-1.5 -left-1.5 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center shadow hover:bg-primary/80 transition-colors"
                      title="تغيير الصورة"
                      onClick={() => document.getElementById(`img-edit-${p.id}`)?.click()}
                    >
                      <ImageIcon className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">{p.label || PARCEL_LABELS[p.parcelType as ParcelType] || p.parcelType}</p>
                    <p className="text-[10px] text-muted-foreground">سعر إضافي على رسوم المنطقة</p>
                    {/* أزرار حفظ/إلغاء الصورة */}
                    {editImgId === p.id && editImgPreview && (
                      <div className="flex gap-1.5 mt-1">
                        <button
                          className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5"
                          onClick={() => handleSaveImage(p.id)} disabled={savingImg}>
                          {savingImg ? <RefreshCw className="w-3 h-3 animate-spin" /> : "✓ حفظ الصورة"}
                        </button>
                        <span className="text-muted-foreground text-[10px]">|</span>
                        <button className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditImgId(null); setEditImgPreview(null); }}>إلغاء</button>
                        {p.imageUrl && (
                          <>
                            <span className="text-muted-foreground text-[10px]">|</span>
                            <button className="text-[10px] text-red-500 hover:text-red-600"
                              onClick={() => handleRemoveImage(p.id)} disabled={savingImg}>حذف الصورة</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      className="text-xs h-8 w-24 text-center"
                      value={editPrices[p.id] ?? String(p.basePrice)}
                      onChange={e => setEditPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                    />
                    <Button size="sm" className="h-8 text-xs px-3"
                      onClick={() => updateMutation.mutate({ id: p.id, basePrice: Number(editPrices[p.id] ?? p.basePrice) })}
                      disabled={updateMutation.isPending}>
                      حفظ
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => { if (confirm("حذف هذا النوع؟")) deleteMutation.mutate(p.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-4 border-t border-border pt-3">
            💡 السعر الإجمالي للشحنة = سعر المنطقة + سعر نوع الشحنة + رسوم التأمين
          </p>
        </CardContent>
      </Card>

      {/* ── Add Type Dialog ── */}
      {addOpen && (
        <Dialog open onOpenChange={() => setAddOpen(false)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-sm font-black flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-500" /> إضافة نوع شحنة جديد
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-bold mb-1.5 block">المعرف (بالإنجليزية) <span className="text-red-500">*</span></Label>
                <Input className="text-sm" placeholder="مثال: special" value={newType}
                  onChange={e => setNewType(e.target.value.toLowerCase().replace(/\s/g, "_"))} />
                <p className="text-[10px] text-muted-foreground mt-1">حروف إنجليزية صغيرة وشرطة سفلية فقط</p>
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">الاسم بالعربية <span className="text-red-500">*</span></Label>
                <Input className="text-sm" placeholder="مثال: شحنة خاصة" value={newLabel}
                  onChange={e => setNewLabel(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-bold mb-1.5 block">السعر الإضافي (جنيه) <span className="text-red-500">*</span></Label>
                <Input type="number" className="text-sm" placeholder="0" value={newPrice}
                  onChange={e => setNewPrice(e.target.value)} />
              </div>

              {/* ── صورة نوع الشحنة ── */}
              <div>
                <Label className="text-xs font-bold mb-1.5 block">صورة نوع الشحنة (اختياري)</Label>
                <div
                  className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer
                    ${newImage ? "border-primary/50 bg-primary/5" : "border-border bg-muted/10 hover:border-primary/40 hover:bg-muted/20"}`}
                  onClick={() => document.getElementById("parcel-img-upload")?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageFile(f); }}
                >
                  <input id="parcel-img-upload" type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }} />
                  {newImage ? (
                    <div className="flex items-center gap-3 p-3">
                      <img src={newImage} alt="preview"
                        className="w-16 h-16 rounded-lg object-cover border border-border shrink-0" />
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
                      {uploadingImg ? (
                        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
                      ) : (
                        <>
                          <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                          <p className="text-xs text-muted-foreground">اسحب صورة هنا أو اضغط للاختيار</p>
                          <p className="text-[10px] text-muted-foreground/60">PNG, JPG — يتم الضغط تلقائياً</p>
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
    </div>
  );
}

