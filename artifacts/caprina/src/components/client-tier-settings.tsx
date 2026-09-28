import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { TierEmblem, tierLook, alpha, type TierBrand, type TierIconKey } from "@/components/client-tier-card";

// ═══════════════════════════════════════════════════════════════════════════
// إعدادات مستويات العملاء (للأدمن): لكل فئة → الاسم + بداية الفئة + نهايتها
// (عدد الشحنات في الشهر) + اللون + صورة/شعار اختياري. كل فئة بتتحدد لوحدها،
// وآخر فئة تقدر تسيب نهايتها فاضية (مفتوحة لفوق).
// ═══════════════════════════════════════════════════════════════════════════

type TierFull = TierBrand & { icon: TierIconKey; color: string; image: string | null };
interface SettingsResponse { ladder: TierFull[]; defaults: TierFull[] }

interface Row { key: string; name: string; min: string; max: string; color: string; image: string | null; icon: TierIconKey }

const toRows = (l: TierFull[]): Row[] =>
  l.map(t => ({
    key: t.key, name: t.name, min: String(t.min), max: t.max === null || t.max === undefined ? "" : String(t.max),
    color: t.color, image: t.image ?? null, icon: t.icon,
  }));

const MAX_IMAGE_CHARS = 120_000; // نفس حد السيرفر
const IMG_SIZE = 128;

/** بيصغّر الصورة (قص من النص لمربع 128×128) ويرجّعها data URL خفيف */
async function fileToTierImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("الصورة لازم تكون PNG أو JPG أو WebP");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("تعذّر قراءة الصورة"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = IMG_SIZE; canvas.height = IMG_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("المتصفح مش بيدعم معالجة الصور");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, IMG_SIZE, IMG_SIZE);
    let out = canvas.toDataURL("image/webp", 0.9);
    if (out.length > MAX_IMAGE_CHARS) out = canvas.toDataURL("image/webp", 0.6);
    if (out.length > MAX_IMAGE_CHARS) throw new Error("الصورة كبيرة — جرّب صورة أبسط");
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function TierSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const pickIdx = useRef<number>(-1);
  const [rows, setRows] = useState<Row[]>([]);

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["client-tier-settings"],
    queryFn: () => apiFetch<SettingsResponse>("/finance/clients/tier-settings"),
    enabled: open,
    staleTime: 0,
  });

  // كل ما الدايلوج يتفتح أو الداتا توصل → نبدأ من المحفوظ
  useEffect(() => { if (open && data) setRows(toRows(data.ladder)); }, [open, data]);

  const errors = useMemo(() => {
    const errs: (string | null)[] = rows.map(() => null);
    rows.forEach((r, i) => {
      const min = Number(r.min);
      const max = Number(r.max);
      const isLast = i === rows.length - 1;
      if (r.name.trim().length < 1 || r.name.trim().length > 30) errs[i] = "الاسم من 1 لـ 30 حرف";
      else if (r.min.trim() === "" || !Number.isInteger(min) || min < 0) errs[i] = "بداية المستوى لازم تكون رقم صحيح";
      else if (r.max.trim() === "" && !isLast) errs[i] = "لازم تكتب نهاية المستوى (آخر فئة بس تقدر تسيبها فاضية)";
      else if (r.max.trim() !== "" && (!Number.isInteger(max) || max < min)) errs[i] = "النهاية لازم تكون رقم صحيح أكبر من أو يساوي البداية";
      else if (i > 0 && min <= Number(rows[i - 1].min)) errs[i] = `لازم تكون أكبر من بداية "${rows[i - 1].name || "السابق"}"`;
      else if (i > 0 && rows[i - 1].max.trim() !== "" && min <= Number(rows[i - 1].max)) errs[i] = `لازم تبدأ بعد نهاية "${rows[i - 1].name || "السابق"}" (${rows[i - 1].max})`;
    });
    return errs;
  }, [rows]);
  const hasErrors = errors.some(Boolean);

  const save = useMutation({
    mutationFn: () => apiFetch<SettingsResponse>("/finance/clients/tier-settings", {
      method: "PUT",
      body: JSON.stringify({
        tiers: rows.map(r => ({
          key: r.key, name: r.name.trim(), min: Number(r.min),
          max: r.max.trim() === "" ? null : Number(r.max),
          color: r.color, image: r.image,
        })),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-tier"] });
      qc.invalidateQueries({ queryKey: ["client-tier-settings"] });
      qc.invalidateQueries({ queryKey: ["finance-clients-tiers"] });
      qc.invalidateQueries({ queryKey: ["client-portal-tier"] });
      toast({ title: "تم حفظ إعدادات المستويات" });
      onOpenChange(false);
    },
    onError: (err: any) => toast({ title: "تعذّر حفظ الإعدادات", description: err?.message, variant: "destructive" }),
  });

  const patch = (i: number, p: Partial<Row>) => setRows(rs => rs.map((r, j) => {
    if (j === i) return { ...r, ...p };
    // لو الفئة اللي قبلها كانت متصلة بيها (نهايتها = بدايتي - 1) وغيّرت بدايتي، نهايتها تتحرك معايا.
    // ولو كانت منفصلة (فجوة أو ضبط يدوي) بنسيبها زي ما هي.
    if (j === i - 1 && p.min !== undefined) {
      const oldMin = Number(rs[i].min);
      const newMin = Number(p.min);
      if (Number.isInteger(oldMin) && Number.isInteger(newMin) && r.max.trim() !== "" && Number(r.max) === oldMin - 1) {
        return { ...r, max: String(newMin - 1) };
      }
    }
    return r;
  }));

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const i = pickIdx.current;
    e.target.value = "";
    if (!file || i < 0) return;
    try {
      patch(i, { image: await fileToTierImage(file) });
    } catch (err: any) {
      toast({ title: "تعذّر رفع الصورة", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إعدادات مستويات العملاء</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          حدّد لكل فئة بدايتها ونهايتها (عدد الشحنات في الشهر) بشكل مستقل. آخر فئة تقدر تسيب نهايتها فاضية عشان تبقى مفتوحة لفوق.
          لو سبت فجوة بين فئتين، العميل اللي شحناته جوه الفجوة مش هيدخل أي فئة. تقدر كمان تغيّر الاسم واللون وترفع صورة/شعار لكل فئة.
          التغيير بيتطبق على كل العملاء.
        </p>

        {isLoading || rows.length === 0 ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const isLast = i === rows.length - 1;
              const nextMin = rows[i + 1] ? Number(rows[i + 1].min) : NaN;
              const thisMax = Number(r.max);
              const gap = !isLast && r.max.trim() !== "" && Number.isFinite(nextMin) && Number.isFinite(thisMax) && nextMin - thisMax > 1
                ? `${thisMax + 1}–${nextMin - 1}`
                : null;
              const look = tierLook({ key: r.key, name: r.name || r.key, color: r.color, icon: r.icon, image: r.image });
              return (
                <div
                  key={r.key}
                  className="rounded-xl border p-3 grid gap-3 items-center sm:grid-cols-[auto_1fr_auto_auto_auto]"
                  style={{ borderColor: errors[i] ? "#ef4444" : alpha(r.color, 0.3), background: alpha(r.color, 0.05) }}
                >
                  {/* الشعار */}
                  <div className="flex items-center gap-2">
                    <TierEmblem look={look} size={52} />
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => { pickIdx.current = i; fileRef.current?.click(); }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md border border-border hover:bg-muted/40"
                      >
                        <ImagePlus className="w-3 h-3" /> {r.image ? "تغيير" : "رفع صورة"}
                      </button>
                      {r.image && (
                        <button
                          type="button" onClick={() => patch(i, { image: null })}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" /> حذف الصورة
                        </button>
                      )}
                    </div>
                  </div>

                  {/* الاسم */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">اسم المستوى {i + 1}</p>
                    <Input value={r.name} maxLength={30} onChange={e => patch(i, { name: e.target.value })} className="h-8 text-sm" />
                  </div>

                  {/* من */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">من (شحنة)</p>
                    <Input
                      type="number" min={0} step={1} inputMode="numeric"
                      value={r.min}
                      onChange={e => patch(i, { min: e.target.value })}
                      className="h-8 w-24 text-sm"
                    />
                  </div>

                  {/* إلى */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">إلى (شحنة)</p>
                    <Input
                      type="number" min={0} step={1} inputMode="numeric"
                      value={r.max} placeholder={isLast ? "∞ مفتوحة" : ""}
                      onChange={e => patch(i, { max: e.target.value })}
                      className="h-8 w-24 text-sm"
                    />
                  </div>

                  {/* اللون */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">اللون</p>
                    <input
                      type="color" value={r.color} onChange={e => patch(i, { color: e.target.value })}
                      className="h-8 w-12 rounded-md border border-border bg-transparent cursor-pointer p-0.5"
                    />
                  </div>

                  {errors[i] && <p className="text-[11px] text-red-400 sm:col-span-5">{errors[i]}</p>}
                  {!errors[i] && gap && (
                    <p className="text-[11px] text-amber-500 sm:col-span-5">
                      تنبيه: العميل اللي شحناته من {gap} في الشهر مش هيدخل أي فئة.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickFile} />

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button" variant="outline" size="sm" disabled={!data || save.isPending}
            onClick={() => data && setRows(toRows(data.defaults))}
          >
            <RotateCcw className="w-3.5 h-3.5 ml-1.5" /> استرجاع الافتراضي
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={save.isPending}>إلغاء</Button>
            <Button type="button" size="sm" disabled={hasErrors || save.isPending || rows.length === 0} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin ml-1.5" />} حفظ
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
