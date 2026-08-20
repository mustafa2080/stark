import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowRight, Package, Plus, MapPin, Phone, User, Calendar,
  Clock, X, Truck, CheckCircle2, Ban, AlertCircle, FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ─── أيام الاستلام الثابتة عند شركة الشحن: السبت والثلاثاء فقط ─────────────
// بنحسب أقرب يوم استلام قادم (شامل النهاردة لو النهاردة نفسها سبت أو تلات) ونبني
// ملحوظة تلقائية للعميل توضّحله يستنى مكالمة المندوب امتى بالظبط.
const PICKUP_DAYS = [6, 2]; // 6 = السبت، 2 = الثلاثاء (0 = الأحد حسب getDay)
const AR_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function nextPickupDay(from: Date = new Date()): { date: Date; dayName: string; isToday: boolean } {
  for (let add = 0; add <= 7; add++) {
    const d = new Date(from);
    d.setDate(from.getDate() + add);
    if (PICKUP_DAYS.includes(d.getDay())) {
      return { date: d, dayName: AR_DAY_NAMES[d.getDay()], isToday: add === 0 };
    }
  }
  // fallback نظري (مستحيل يوصله لأن PICKUP_DAYS بتتكرر كل أسبوع)
  return { date: from, dayName: AR_DAY_NAMES[from.getDay()], isToday: true };
}

function buildAutoNote(): string {
  const { dayName, isToday } = nextPickupDay();
  const dayLabel = isToday ? `${dayName} (النهاردة)` : `${dayName} القادم`;
  return `سوف يتم استلام طلباتك يوم ${dayLabel}، الرجاء تجهيز الشحنات وانتظار مكالمة المندوب يوم ${dayName}.`;
}

interface PickupRequest {
  id: number;
  requestNumber: string | null;
  pickupContactName: string;
  pickupPhone: string;
  pickupAddress: string;
  pickupCity: string | null;
  piecesCount: number | null;
  estimatedWeight: string | null;
  notes: string | null;
  preferredDate: string | null;
  preferredTimeSlot: string | null;
  status: string;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending:   { label: "بانتظار الموافقة", color: "#f59e0b", icon: Clock },
  approved:  { label: "تمت الموافقة",     color: "#3b82f6", icon: CheckCircle2 },
  assigned:  { label: "تم تعيين مندوب",   color: "#8b5cf6", icon: Truck },
  picked_up: { label: "تم الاستلام",       color: "#22c55e", icon: CheckCircle2 },
  cancelled: { label: "ملغي",             color: "#64748b", icon: Ban },
  rejected:  { label: "مرفوض",            color: "#ef4444", icon: AlertCircle },
};

const TIME_SLOTS = [
  { value: "morning",   label: "صباحاً (9 - 12)" },
  { value: "afternoon", label: "ظهراً (12 - 4)" },
  { value: "evening",   label: "مساءً (4 - 8)" },
];

// ── Create Pickup Modal ────────────────────────────────────────────────────
function CreatePickupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();

  // بيانات العميل التجاري المسجّل — نستخدمها لتعبئة الفورم تلقائيًا
  const { data: clientData } = useQuery<any>({
    queryKey: ["client-profile-me"],
    queryFn: () => apiFetch<any>("/finance/clients/me"),
    staleTime: 30_000,
  });

  const [form, setForm] = useState(() => ({
    pickupContactName: "", pickupPhone: "", pickupAddress: "", pickupCity: "",
    piecesCount: "1", estimatedWeight: "", notes: buildAutoNote(), preferredTimeSlot: "morning",
  }));
  // بنتابع هل العميل عدّل الملاحظة بنفسه — لو لأ، نفضل نحدّثها تلقائيًا لو
  // الفورم فضل مفتوح عبر منتصف الليل (نادر لكن ممكن) عشان اليوم المحسوب يفضل صحيح
  const [notesTouched, setNotesTouched] = useState(false);
  // لو بيانات العميل وصلت بعد أول render، نعبّي الحقول اللي لسه فاضية بس —
  // من غير ما نلغي أي حاجة كتبها العميل بنفسه لو بدأ يكتب قبل ما البيانات توصل.
  const [prefilled, setPrefilled] = useState(false);
  if (clientData && !prefilled) {
    setPrefilled(true);
    setForm(f => ({
      ...f,
      pickupContactName: f.pickupContactName || clientData.name || "",
      pickupPhone:        f.pickupPhone || clientData.phone || "",
      pickupCity:         f.pickupCity || clientData.city || "",
      pickupAddress:       f.pickupAddress || clientData.address || "",
    }));
  }

  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (k === "notes") setNotesTouched(true);
    setForm(f => ({ ...f, [k]: e.target.value }));
  };

  const submit = async () => {
    if (!form.pickupContactName.trim() || !form.pickupPhone.trim() || !form.pickupAddress.trim()) {
      toast({ title: "بيانات ناقصة", description: "يرجى إدخال الاسم، الهاتف، والعنوان", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/client-portal/pickup-requests", {
        method: "POST",
        body: JSON.stringify({
          pickupContactName: form.pickupContactName,
          pickupPhone: form.pickupPhone,
          pickupAddress: form.pickupAddress,
          pickupCity: form.pickupCity || undefined,
          piecesCount: Number(form.piecesCount) || 1,
          estimatedWeight: form.estimatedWeight ? Number(form.estimatedWeight) : undefined,
          notes: form.notes || undefined,
          preferredTimeSlot: form.preferredTimeSlot,
        }),
      });
      toast({ title: "✅ تم إرسال طلب الالتقاط", description: "سيتم التواصل معك لتأكيد الموعد" });
      onCreated();
      onClose();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "فشل إرسال الطلب", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none";
  const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto" dir="rtl"
        style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white">طلب التقاط جديد</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50" style={{ background: "rgba(255,255,255,0.06)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">اسم جهة الاتصال *</label>
            <input value={form.pickupContactName} onChange={set("pickupContactName")} className={inputCls} style={inputStyle} placeholder="اسم المسؤول عن التسليم" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">رقم الهاتف *</label>
              <input value={form.pickupPhone} onChange={set("pickupPhone")} className={inputCls} style={inputStyle} placeholder="01xxxxxxxxx" />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">المدينة</label>
              <input value={form.pickupCity} onChange={set("pickupCity")} className={inputCls} style={inputStyle} placeholder="القاهرة" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">عنوان الالتقاط *</label>
            <textarea value={form.pickupAddress} onChange={set("pickupAddress")} rows={2} className={inputCls} style={inputStyle} placeholder="العنوان بالتفصيل" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">عدد الطلبيات</label>
              <input type="number" min={1} value={form.piecesCount} onChange={set("piecesCount")} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">الوزن التقريبي (كجم)</label>
              <input type="number" step="0.1" value={form.estimatedWeight} onChange={set("estimatedWeight")} className={inputCls} style={inputStyle} placeholder="اختياري" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">الفترة المفضلة</label>
            <select value={form.preferredTimeSlot} onChange={set("preferredTimeSlot")} className={inputCls} style={inputStyle}>
              {TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">ملاحظات</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2} className={inputCls} style={inputStyle} placeholder="اختياري" />
          </div>

          <button onClick={submit} disabled={loading}
            className="w-full rounded-xl py-3 text-sm font-bold text-black mt-2"
            style={{ background: "#fff", opacity: loading ? 0.6 : 1 }}>
            {loading ? "جارٍ الإرسال..." : "إرسال طلب الالتقاط"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════
export default function ClientPickupRequestsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ data: PickupRequest[]; total: number }>({
    queryKey: ["client-pickup-requests"],
    queryFn: () => apiFetch("/client-portal/pickup-requests"),
    enabled: !!user,
    staleTime: 15_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/client-portal/pickup-requests/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      toast({ title: "تم إلغاء الطلب" });
      queryClient.invalidateQueries({ queryKey: ["client-pickup-requests"] });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const requests = data?.data ?? [];

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[900px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/client-dashboard")}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-foreground/70 bg-muted/40 border border-border">
              <ArrowRight size={16} />
            </button>
            <div>
              <h1 className="text-xl font-black text-foreground">طلبات الالتقاط</h1>
              <p className="text-xs text-muted-foreground">اطلب استلام شحنتك من عندك</p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-foreground text-background">
            <Plus size={16} /> طلب جديد
          </button>
        </div>

        {/* ── List ── */}
        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground">جارٍ التحميل...</div>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl p-12 flex flex-col items-center gap-3 text-muted-foreground bg-muted/25 border border-border">
            <Package size={44} className="opacity-30" />
            <p className="text-sm">لا توجد طلبات التقاط بعد</p>
            <button onClick={() => setShowModal(true)} className="text-xs font-bold underline text-muted-foreground mt-1">
              أنشئ أول طلب الآن
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(r => {
              const meta = STATUS_META[r.status] ?? STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <div key={r.id} className="rounded-2xl p-4 bg-muted/25 border border-border">

                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.requestNumber || `#${r.id}`}</span>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1"
                        style={{ background: `${meta.color}18`, color: meta.color }}>
                        <Icon size={11} /> {meta.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground/70">
                      {new Date(r.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 text-foreground/70"><User size={13} className="text-muted-foreground/60" /> {r.pickupContactName}</div>
                    <div className="flex items-center gap-2 text-foreground/70"><Phone size={13} className="text-muted-foreground/60" /> {r.pickupPhone}</div>
                    <div className="flex items-center gap-2 text-foreground/70 sm:col-span-2"><MapPin size={13} className="text-muted-foreground/60" /> {r.pickupAddress}{r.pickupCity ? ` - ${r.pickupCity}` : ""}</div>
                    {r.preferredDate && (
                      <div className="flex items-center gap-2 text-foreground/70">
                        <Calendar size={13} className="text-muted-foreground/60" />
                        {new Date(r.preferredDate).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
                        {r.preferredTimeSlot && ` - ${TIME_SLOTS.find(t => t.value === r.preferredTimeSlot)?.label ?? ""}`}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-foreground/70"><Package size={13} className="text-muted-foreground/60" /> {r.piecesCount ?? 1} قطعة</div>
                  </div>

                  {r.notes && (
                    <div className="flex items-start gap-2 mt-2.5 text-xs text-muted-foreground">
                      <FileText size={13} className="text-muted-foreground/60 mt-0.5" /> {r.notes}
                    </div>
                  )}

                  {r.status === "pending" && (
                    <div className="mt-3 pt-3 flex justify-end border-t border-border">
                      <button onClick={() => cancelMutation.mutate(r.id)} disabled={cancelMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                        <X size={12} /> إلغاء الطلب
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <CreatePickupModal onClose={() => setShowModal(false)} onCreated={() => refetch()} />
      )}
    </div>
  );
}
