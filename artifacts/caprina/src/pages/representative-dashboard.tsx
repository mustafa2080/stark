import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, shippingApi, manifestsApi, shipmentManifestsApi, shipmentsApi, type ShippingCompany, type Shipment } from "@/lib/api";
import { Redirect, useLocation, Link } from "wouter";
import ShippingCompaniesPage from "@/pages/representative-shipping-companies";
import { Truck, Package, CheckCircle2, RotateCcw, Clock, MapPin, AlertCircle, FileText, Lock, CheckCheck, AlertTriangle, Hourglass, ChevronRight, ChevronLeft, Unlock, PackageCheck, Award, BarChart3, Phone, DollarSign, ShieldCheck, Activity, ArrowUp, ArrowDown, Minus, LayoutDashboard, ClipboardList, TrendingUp, Zap, ListChecks, PlayCircle, PhoneCall, LogOut, Calendar, Star, PackagePlus, ChevronDown, ChevronUp, TrendingDown, Search, Check, ChevronsUpDown, X as XIcon, ImagePlus, KeyRound, UserPlus, Edit2, Save, MessageCircle, Volume2, VolumeX, Wallet, Sun, Moon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { formatDistanceToNow } from "date-fns";
import { RepRouteMap } from "@/components/rep-route-map";
import { useTheme } from "@/contexts/ThemeContext";
import { RETURN_REASONS } from "@/lib/order-constants";
import { applyDeliveryReadyTemplate } from "@/lib/whatsapp";

const STATUS_LABELS: Record<string, string> = {
  waiting: "قيد الانتظار", pending: "قيد الانتظار",
  warehouse_ready: "قيد الشحن في المخزن", confirmed: "قيد الشحن في المخزن", picked_up: "قيد الشحن في المخزن",
  in_shipping: "قيد الشحن", in_transit: "قيد الشحن", out_for_delivery: "قيد الشحن",
  delivered: "استلم", received: "استلم",
  partial_received: "استلام جزئي",
  delayed: "مؤجل", returned: "مرتجع", cancelled: "مرتجع",
};
const STATUS_COLOR: Record<string, string> = {
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  partial_received: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  returned: "bg-red-500/15 text-red-400 border-red-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  out_for_delivery: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_transit: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  delayed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};
const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

// ─── خيارات حالة التسليم لكارت الشحنة في تاب "الشحنات" ───────────────────────
// نفس الأربع حالات المتاحة للمندوب جوه البيان (مسلَّم/استلام جزئي/مؤجل/مرتجع)،
// بس بيحدّثوا shipmentsTable.status مباشرة عن طريق PATCH /shipments/:id.
// الباك إند بيعمل sync تلقائي (syncShipmentStatusToManifests) فيحدّث deliveryStatus
// جوه أي بيان مرتبط بنفس الشحنة، فمفيش حاجة إضافية مطلوبة هنا غير التحديث المباشر.
const SHIPMENT_TAB_STATUS_OPTIONS: { value: string; label: string; color: string; bg: string }[] = [
  { value: "delivered",         label: "مسلَّم ✓",   color: "text-emerald-400", bg: "border-emerald-500/40 bg-emerald-900/10" },
  { value: "partial_received",  label: "استلام جزئي", color: "text-teal-400",    bg: "border-teal-500/40 bg-teal-900/10" },
  { value: "delayed",           label: "مؤجل",        color: "text-orange-400",  bg: "border-orange-500/40 bg-orange-900/10" },
  { value: "returned",          label: "مرتجع",       color: "text-red-400",     bg: "border-red-500/40 bg-red-900/10" },
];

const RETURN_REASONS_NEED_VALUE_TAB = ["refused_paid", "quality"];

function ShipmentStatusEditor({ shipment, onSaved }: { shipment: any; onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>(shipment.status);
  const [note, setNote] = useState<string>(shipment.notes ?? "");
  const [returnReason, setReturnReason] = useState<string>(shipment.returnReason ?? "");
  const [partialQty, setPartialQty] = useState<string>(shipment.partialQuantity?.toString() ?? "");
  const [deliveredValueReceived, setDeliveredValueReceived] = useState<string>(
    shipment.collectedAmount != null ? String(shipment.collectedAmount) : ""
  );
  const [returnValueReceived, setReturnValueReceived] = useState<string>(
    shipment.collectedAmount != null ? String(shipment.collectedAmount) : ""
  );

  const RETURN_REASONS_NEED_VALUE = ["refused_paid", "refused_unpaid", "quality"];
  const needsReturnValue = status === "returned" && RETURN_REASONS_NEED_VALUE.includes(returnReason);

  const needsNote = status === "delayed" || status === "returned";

  const mutation = useMutation({
    mutationFn: () => {
      const body: any = { status };
      if (note.trim()) body.notes = note.trim();
      if (status === "returned") {
        body.returnReason = returnReason || null;
        if (needsReturnValue && returnValueReceived.trim() !== "" && !isNaN(Number(returnValueReceived))) {
          body.collectedAmount = Number(returnValueReceived);
        }
      }
      if (status === "partial_received") {
        body.partialQuantity = partialQty.trim() !== "" ? parseInt(partialQty) : null;
      }
      if (
        (status === "delivered" || status === "partial_received") &&
        deliveredValueReceived.trim() !== "" &&
        !isNaN(Number(deliveredValueReceived))
      ) {
        body.collectedAmount = Number(deliveredValueReceived);
      }
      return apiFetch(`/shipments/${shipment.id}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast({ title: "تم تحديث حالة الشحنة" });
      setOpen(false);
      onSaved();
    },
    onError: (e: any) => {
      toast({ title: "خطأ", description: e?.message ?? "تعذر تحديث الحالة", variant: "destructive" });
    },
  });

  const disabled =
    mutation.isPending ||
    (needsNote && !note.trim()) ||
    (status === "partial_received" && partialQty.trim() === "") ||
    (needsReturnValue && returnValueReceived.trim() === "");

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] px-1.5 text-primary hover:text-primary gap-1"
        onClick={(e) => {
          e.stopPropagation();
          setStatus(shipment.status);
          setNote(shipment.notes ?? "");
          setReturnReason(shipment.returnReason ?? "");
          setPartialQty(shipment.partialQuantity?.toString() ?? "");
          setDeliveredValueReceived(shipment.collectedAmount != null ? String(shipment.collectedAmount) : "");
          setReturnValueReceived(shipment.collectedAmount != null ? String(shipment.collectedAmount) : "");
          setOpen(true);
        }}
      >
        <Edit2 className="w-3 h-3" />تقفيل
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">تحديث حالة الشحنة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] mb-1 block text-muted-foreground">حالة التسليم</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 text-xs w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIPMENT_TAB_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      <span className={o.color}>{o.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {status === "partial_received" && (
              <div className="space-y-2 border border-teal-700/40 rounded-md p-2.5 bg-teal-900/10">
                <Label className="text-[10px] font-bold text-teal-400">الكمية المستلمة</Label>
                <input
                  type="number"
                  min={0}
                  value={partialQty}
                  onChange={(e) => setPartialQty(e.target.value)}
                  className="h-8 w-full rounded border border-teal-700/50 bg-background px-2 text-xs"
                  placeholder="مطلوب"
                />
                <Label className="text-[10px] font-bold text-teal-400 pt-1 block">
                  القيمة المستلمة فعليًا (اختياري)
                </Label>
                <input
                  type="number"
                  min={0}
                  value={deliveredValueReceived}
                  onChange={(e) => setDeliveredValueReceived(e.target.value)}
                  className="h-8 w-full rounded border border-teal-700/50 bg-background px-2 text-xs"
                  placeholder={shipment.totalAmount != null ? `الإجمالي: ${shipment.totalAmount}` : "المبلغ المستلم"}
                />
              </div>
            )}

            {status === "delivered" && (
              <div className="space-y-2 border border-emerald-700/40 rounded-md p-2.5 bg-emerald-900/10">
                <Label className="text-[10px] font-bold text-emerald-400">
                  القيمة المستلمة فعليًا (اختياري)
                </Label>
                <input
                  type="number"
                  min={0}
                  value={deliveredValueReceived}
                  onChange={(e) => setDeliveredValueReceived(e.target.value)}
                  className="h-8 w-full rounded border border-emerald-700/50 bg-background px-2 text-xs"
                  placeholder={shipment.totalAmount != null ? `الإجمالي: ${shipment.totalAmount}` : "المبلغ المستلم"}
                />
              </div>
            )}

            {status === "returned" && (
              <div className="space-y-2 border border-red-700/40 rounded-md p-2.5 bg-red-900/10">
                <Label className="text-[10px] mb-1 block text-muted-foreground">سبب الإرجاع</Label>
                <Select value={returnReason} onValueChange={setReturnReason}>
                  <SelectTrigger className="h-8 text-xs w-full bg-background border-red-800/60">
                    <SelectValue placeholder="اختر السبب..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {needsReturnValue && (
                  <div className="pt-1">
                    <Label className="text-[10px] font-bold text-red-400">
                      القيمة المستلمة (مطلوب)
                    </Label>
                    <input
                      type="number"
                      min={0}
                      value={returnValueReceived}
                      onChange={(e) => setReturnValueReceived(e.target.value)}
                      className="h-8 w-full rounded border border-red-700/50 bg-background px-2 text-xs mt-1"
                      placeholder={shipment.totalAmount != null ? `الإجمالي: ${shipment.totalAmount}` : "المبلغ المستلم"}
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-[10px] mb-1 block text-muted-foreground">
                {needsNote ? "سبب / ملاحظة (مطلوب)" : "ملاحظة (اختياري)"}
              </Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-8 text-xs bg-background"
                placeholder={
                  status === "delayed" ? "مثال: العميل طلب التأجيل..."
                  : status === "returned" ? "مثال: العميل رفض الاستلام..."
                  : "ملاحظة (اختياري)..."
                }
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => mutation.mutate()}
                disabled={disabled}
              >
                <Save className="w-3 h-3" />
                {mutation.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl p-4 border relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, rgba(${color},0.09) 0%, hsl(var(--card)) 65%)`,
               border: `1px solid rgba(${color},0.22)` }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `rgba(${color},0.12)` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: `rgba(${color},1)` }} />
        </span>
      </div>
      <p className="text-2xl font-black tracking-tight" style={{ color: `rgba(${color},1)` }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function DeliveryRing({ rate }: { rate: number }) {
  const r = 36; const c = 2 * Math.PI * r;
  const fill = (rate / 100) * c;
  const color = rate >= 70 ? "#34d399" : rate >= 40 ? "#fbbf24" : "#f87171";
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${fill} ${c}`}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black" style={{ color }}>{rate}%</span>
        <span className="text-[9px] text-muted-foreground">تسليم</span>
      </div>
    </div>
  );
}

// ─── Performance Score Component ──────────────────────────────────────────────
function PerformanceScore({ deliveryRate, returnRate, total }: { deliveryRate: number; returnRate: number; total: number }) {
  // score = delivery rate weighted 60% + (100 - returnRate) weighted 30% + activity 10%
  const activityScore = Math.min(100, total * 2); // كل شحنة = 2 نقطة لحد 100
  const score = Math.round(deliveryRate * 0.6 + (100 - returnRate) * 0.3 + activityScore * 0.1);
  const grade = score >= 85 ? { label: "ممتاز", color: "#34d399", glow: "52,211,153" }
    : score >= 70 ? { label: "جيد جداً", color: "#60a5fa", glow: "96,165,250" }
    : score >= 55 ? { label: "جيد", color: "#fbbf24", glow: "251,191,36" }
    : { label: "يحتاج تحسين", color: "#f87171", glow: "248,113,113" };

  const r = 42; const c = 2 * Math.PI * r;
  const fill = (score / 100) * c;

  return (
    <div className="rounded-2xl p-5 border relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, rgba(${grade.glow},0.10) 0%, hsl(var(--card)) 60%)`,
               border: `1px solid rgba(${grade.glow},0.25)`, boxShadow: `0 1px 0 rgba(255,255,255,0.03) inset, 0 0 24px rgba(${grade.glow},0.08)` }}>
      <p className="text-xs font-bold mb-4 flex items-center gap-1.5 text-foreground/90">
        <Award className="w-4 h-4" style={{ color: grade.color }} /> نقطة الأداء الشهرية
      </p>
      <div className="flex items-center gap-5">
        {/* Ring */}
        <div className="relative w-28 h-28 shrink-0">
          <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
            <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
            <circle cx="56" cy="56" r={r} fill="none" stroke={grade.color} strokeWidth="9"
              strokeLinecap="round" strokeDasharray={`${fill} ${c}`}
              style={{ filter: `drop-shadow(0 0 6px ${grade.color})`, transition: "stroke-dasharray 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black tracking-tight" style={{ color: grade.color }}>{score}</span>
            <span className="text-[10px] text-muted-foreground font-bold mt-0.5">{grade.label}</span>
          </div>
        </div>
        {/* breakdown */}
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="text-muted-foreground">نسبة التسليم</span>
              <span className="font-bold text-emerald-400">{deliveryRate}%</span>
            </div>
            <div className="w-full bg-muted/15 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${deliveryRate}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="text-muted-foreground">معدل الإرجاع</span>
              <span className={`font-bold ${returnRate > 30 ? "text-red-400" : "text-emerald-400"}`}>{returnRate}%</span>
            </div>
            <div className="w-full bg-muted/15 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all duration-700 ${returnRate > 30 ? "bg-red-500" : "bg-emerald-500/60"}`} style={{ width: `${returnRate}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="text-muted-foreground">نشاط الشحنات</span>
              <span className="font-bold text-foreground/80">{total} شحنة</span>
            </div>
            <div className="w-full bg-muted/15 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-primary/70 transition-all duration-700" style={{ width: `${Math.min(100, activityScore)}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trend Badge ──────────────────────────────────────────────────────────────
function TrendBadge({ current, prev, label }: { current: number; prev: number; label: string }) {
  const diff = current - prev;
  const pct = prev > 0 ? Math.round(Math.abs(diff / prev) * 100) : 0;
  if (diff === 0) return <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Minus className="w-3 h-3" />{label} ثابت</span>;
  const up = diff > 0;
  return (
    <span className={`text-[10px] flex items-center gap-0.5 font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {pct}% {label}
    </span>
  );
}

// ─── علامة استعجال (إيموجي وامض بتوهج أحمر، تُستخدم في كل مكان فيه استعجال) ──
function PoliceLight({ size = "sm" }: { size?: "sm" | "md" }) {
  const textSize = size === "md" ? "text-sm" : "text-xs";
  return (
    <span
      className={`animate-pulse ${textSize} shrink-0 leading-none`}
      style={{
        filter: "drop-shadow(rgb(239, 68, 68) 0px 0px 6px) drop-shadow(rgb(239, 68, 68) 0px 0px 12px)",
      }}
    >
      🚨
    </span>
  );
}

// ─── صوت واهتزاز تنبيه الاستعجال (مشترك بين البانر وكروت الشحنات) ─────────────
function useUrgentAlertSound(active: boolean, soundMuted: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!active) return;

    const playAlert = () => {
      // اهتزاز الموبايل (3 نبضات قوية)
      if (navigator.vibrate) {
        navigator.vibrate([300, 100, 300, 100, 500]);
      }
      // صوت تنبيه قوي بالـ Web Audio API
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        // بعض المتصفحات (خصوصًا الموبايل) بتبدأ الـ AudioContext في وضع suspended
        // لحد ما يحصل تفاعل مباشر من المستخدم — لازم نعمل resume في كل مرة قبل التشغيل
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
        const playBeep = (freq: number, start: number, duration: number, gain: number) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          osc.type = "square";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
          gainNode.gain.setValueAtTime(0, ctx.currentTime + start);
          gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
          gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
          osc.start(ctx.currentTime + start);
          osc.stop(ctx.currentTime + start + duration + 0.05);
        };
        // 3 نغمات تصاعدية حادة
        playBeep(880, 0,    0.18, 0.6);
        playBeep(1100, 0.22, 0.18, 0.6);
        playBeep(1320, 0.44, 0.30, 0.7);
      } catch (_) {}
    };

    // نغمة فورية عند ظهور البانر
    if (!soundMuted) playAlert();

    // تكرار الصوت كل 4 ثواني لحد ما يتم إيقافه يدويًا
    intervalRef.current = setInterval(() => {
      if (!soundMuted) playAlert();
    }, 4000);

    // فتح/تفعيل الصوت عند أول تفاعل من المستخدم (المتصفحات بتمنع الصوت التلقائي
    // قبل أي تفاعل مباشر — لو حصل tap/click في الصفحة، نتأكد إن الـ AudioContext شغال)
    const unlockAudio = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    document.addEventListener("click", unlockAudio);
    document.addEventListener("touchstart", unlockAudio);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
  }, [active, soundMuted]);

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);
}

// ─── Urgent Banner Component ──────────────────────────────────────────────────
function UrgentBanner({ urgentItems }: { urgentItems: any[] }) {
  const [soundMuted, setSoundMuted] = useState(false);
  useUrgentAlertSound(urgentItems.length > 0, soundMuted);

  return (
    <>
      <style>{`
        @keyframes urgentShake {
          0%,100% { transform: translateX(0); }
          10%,30%,50%,70%,90% { transform: translateX(-5px); }
          20%,40%,60%,80% { transform: translateX(5px); }
        }
        @keyframes urgentGlow {
          0%,100% { box-shadow: 0 0 18px rgba(239,68,68,0.5), 0 0 40px rgba(239,68,68,0.2); }
          50% { box-shadow: 0 0 35px rgba(239,68,68,0.9), 0 0 70px rgba(239,68,68,0.4), inset 0 0 20px rgba(239,68,68,0.1); }
        }
        @keyframes urgentFlash {
          0%,100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .urgent-banner { animation: urgentShake 0.6s ease 0.1s, urgentGlow 1.2s ease-in-out infinite; }
        .urgent-icon { animation: urgentFlash 0.8s ease-in-out infinite; }
        .urgent-dot { animation: urgentFlash 0.5s ease-in-out infinite; }
      `}</style>
      <div className="urgent-banner relative overflow-hidden rounded-2xl border-2 border-red-500 bg-red-950/60 p-3">
        {/* خلفية نابضة */}
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 via-transparent to-red-900/20 pointer-events-none" />
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-red-500/30 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="urgent-icon w-9 h-9 rounded-full bg-red-600 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.8)] shrink-0">
              <Zap className="w-5 h-5 fill-white text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-black text-red-300 leading-tight">
                ⚠️ {urgentItems.length} {urgentItems.length === 1 ? "شحنة مستعجلة!" : "شحنات مستعجلة!"}
              </p>
              <p className="text-[11px] text-red-400 font-bold">سلّمها فوراً — أولوية قصوى</p>
            </div>
            <button
              type="button"
              onClick={() => setSoundMuted(m => !m)}
              title={soundMuted ? "تشغيل صوت التنبيه" : "إيقاف صوت التنبيه"}
              className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-full border transition-colors ${
                soundMuted
                  ? "border-zinc-500/40 bg-zinc-800/60 text-zinc-400"
                  : "border-red-400/50 bg-red-500/20 text-red-200 hover:bg-red-500/30"
              }`}
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <PoliceLight size="md" />
          </div>
          <div className="space-y-2">
            {urgentItems.map((i: any) => (
              <div key={i.shipmentId ?? i.id}
                className="flex items-start gap-2 rounded-xl bg-red-500/20 border border-red-500/50 px-3 py-2.5">
                <Zap className="w-3.5 h-3.5 fill-red-400 text-red-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-white truncate">{i.customerName}</p>
                  {i.urgentNote && (
                    <p className="text-[10px] text-red-200 mt-0.5 truncate">↳ {i.urgentNote}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {i.phone && <span className="text-[10px] text-red-300 font-bold">{i.phone}</span>}
                    {i.city && <span className="text-[10px] text-red-300">📍 {i.city}</span>}
                    {i.urgentAt && (
                      <span className="text-[9px] text-red-400/80">
                        {format(new Date(i.urgentAt), "HH:mm", { locale: ar })}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-black text-emerald-300 shrink-0">
                  {Number(i.totalPrice ?? 0).toLocaleString("ar-EG")} ج.م
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── كارت شحنة مستعجلة في تاب "الشحنات" — نفس ستايل بانر الاستعجال ───────────
function UrgentShipmentCard({ sh, onSaved, waHref }: { sh: any; onSaved: () => void; waHref?: string }) {
  const [soundMuted, setSoundMuted] = useState(false);
  useUrgentAlertSound(!!sh.isUrgent, soundMuted);

  if (!sh.isUrgent) {
    return (
      <Card className="p-3 bg-card/60 border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{sh.receiverName}</p>
            <p className="text-[10px] text-muted-foreground flex gap-1 flex-wrap mt-0.5">
              <span className="font-mono text-primary/70">{sh.shipmentNumber}</span>
              {sh.receiverPhone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{sh.receiverPhone}</span>}
              {sh.receiverCity && <span>· {sh.receiverCity}</span>}
            </p>
            {sh.receiverAddress && (
              <p className="text-[10px] text-muted-foreground/70 flex items-start gap-1 mt-0.5">
                <MapPin className="w-2.5 h-2.5 mt-0.5 shrink-0 text-primary/40" />
                <span className="truncate">{sh.receiverAddress}</span>
              </p>
            )}
          </div>
          <Badge variant="outline" className={`text-[9px] shrink-0 border ${STATUS_COLOR[sh.status] ?? "border-border"}`}>
            {STATUS_LABELS[sh.status] ?? sh.status}
          </Badge>
        </div>
        <div className="flex justify-between text-[11px] mt-2">
          <span className="text-muted-foreground">{sh.createdAt ? format(new Date(sh.createdAt), "dd/MM/yyyy", { locale: ar }) : ""}</span>
          <span className="font-bold text-emerald-400">{formatCurrency(Number(sh.codAmount ?? 0) + Number(sh.shippingFee ?? 0))}</span>
        </div>
        {Array.isArray(sh.items) && sh.items.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-border/20 space-y-0.5">
            {sh.items.map((it: any, idx: number) => (
              <p key={idx} className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                <Package className="w-2.5 h-2.5 shrink-0 text-primary/50" />
                <span className="truncate">
                  {it.product || "منتج"}
                  {it.color ? ` · ${it.color}` : ""}
                  {it.size ? ` · ${it.size}` : ""}
                </span>
                <span className="font-bold shrink-0">× {it.quantity}</span>
              </p>
            ))}
          </div>
        )}
        {sh.returnReason && sh.status === "returned" && (
          <p className="text-[10px] text-red-400/80 mt-1 border-t border-border/30 pt-1">↩ {sh.returnReason}</p>
        )}
        <div className="flex items-center justify-end gap-1.5 mt-1.5 pt-1.5 border-t border-border/20">
          {sh.receiverPhone && (
            <a href={`tel:${sh.receiverPhone}`} title="اتصال بالعميل"
              className="flex items-center justify-center w-6 h-6 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" title="ابعت رسالة واتساب للعميل"
              className="flex items-center justify-center w-6 h-6 shrink-0 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
              <MessageCircle className="w-3.5 h-3.5" />
            </a>
          )}
          <ShipmentStatusEditor shipment={sh} onSaved={onSaved} />
        </div>
      </Card>
    );
  }

  return (
    <>
      <style>{`
        @keyframes urgentGlowCard {
          0%,100% { box-shadow: 0 0 14px rgba(239,68,68,0.4), 0 0 30px rgba(239,68,68,0.15); }
          50% { box-shadow: 0 0 26px rgba(239,68,68,0.75), 0 0 55px rgba(239,68,68,0.3), inset 0 0 16px rgba(239,68,68,0.1); }
        }
        .urgent-card-glow { animation: urgentGlowCard 1.2s ease-in-out infinite; }
      `}</style>
      <div className="urgent-card-glow relative overflow-hidden rounded-2xl border-2 border-red-500 bg-red-950/60 p-3">
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 via-transparent to-red-900/20 pointer-events-none" />
        <div className="absolute -top-8 -left-8 w-28 h-28 rounded-full bg-red-500/30 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-100 bg-red-600 rounded-full px-2.5 py-1 shrink-0">
              <PoliceLight /> مستعجل
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-black text-white truncate">{sh.receiverName}</p>
              <p className="text-[10px] text-red-300 font-mono">{sh.shipmentNumber}</p>
            </div>
          </div>

          {sh.receiverCity && (
            <p className="text-[10px] text-red-300 flex items-center gap-1 mb-1">
              <MapPin className="w-3 h-3" /> {sh.receiverCity}
            </p>
          )}

          {sh.receiverAddress && (
            <p className="text-[10px] text-red-200/80 flex items-start gap-1 mb-1.5">
              <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-red-300/50" />
              <span>{sh.receiverAddress}</span>
            </p>
          )}

          <p className="text-[10px] text-red-300/70 mb-1.5">
            {sh.createdAt ? format(new Date(sh.createdAt), "dd/MM/yyyy", { locale: ar }) : ""}
          </p>

          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-black text-emerald-300">{formatCurrency(Number(sh.codAmount ?? 0) + Number(sh.shippingFee ?? 0))}</span>
            <button
              type="button"
              onClick={() => setSoundMuted(m => !m)}
              title={soundMuted ? "تشغيل صوت التنبيه" : "إيقاف صوت التنبيه"}
              className={`flex items-center justify-center w-7 h-7 shrink-0 rounded-full border transition-colors ${
                soundMuted
                  ? "border-zinc-500/40 bg-zinc-800/60 text-zinc-400"
                  : "border-red-400/50 bg-red-500/20 text-red-200 hover:bg-red-500/30"
              }`}
            >
              {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {sh.urgentNote && (
            <div className="rounded-lg bg-red-500/25 border border-red-400/40 px-3 py-1.5 mb-2">
              <p className="text-[11px] text-red-100 font-bold flex items-center gap-1">
                <Zap className="w-3 h-3 fill-red-200 text-red-200 shrink-0" /> {sh.urgentNote}
              </p>
            </div>
          )}

          {Array.isArray(sh.items) && sh.items.length > 0 && (
            <div className="rounded-lg bg-red-950/40 border border-red-400/20 px-2.5 py-1.5 mb-2 space-y-0.5">
              {sh.items.map((it: any, idx: number) => (
                <p key={idx} className="text-[10px] text-red-200/90 flex items-center gap-1 truncate">
                  <Package className="w-2.5 h-2.5 shrink-0 text-red-300/60" />
                  <span className="truncate">
                    {it.product || "منتج"}
                    {it.color ? ` · ${it.color}` : ""}
                    {it.size ? ` · ${it.size}` : ""}
                  </span>
                  <span className="font-bold shrink-0">× {it.quantity}</span>
                </p>
              ))}
            </div>
          )}

          {sh.receiverPhone && (
            <a href={`tel:${sh.receiverPhone}`}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 transition-colors py-2 text-white font-bold text-sm mb-2">
              <Phone className="w-4 h-4" /> {sh.receiverPhone}
            </a>
          )}

          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className={`text-[9px] shrink-0 border ${STATUS_COLOR[sh.status] ?? "border-border"}`}>
              {STATUS_LABELS[sh.status] ?? sh.status}
            </Badge>
            <div className="flex items-center gap-1.5">
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer" title="ابعت رسالة واتساب للعميل"
                  className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg border border-green-400/40 bg-green-500/15 text-green-300 hover:bg-green-500/25 transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" />
                </a>
              )}
              <ShipmentStatusEditor shipment={sh} onSaved={onSaved} />
            </div>
          </div>
          {sh.returnReason && sh.status === "returned" && (
            <p className="text-[10px] text-red-200/80 mt-1.5 border-t border-red-400/20 pt-1.5">↩ {sh.returnReason}</p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── COD Settlement Card ──────────────────────────────────────────────────────
function CodSettlementCard({ shipments }: { shipments: any[] }) {
  const delivered = shipments.filter(s => s.status === "delivered");
  const returned = shipments.filter(s => s.status === "returned");
  const partial = shipments.filter(s => s.status === "partial_received");
  const inProgress = shipments.filter(s => !["delivered","returned","cancelled","partial_received"].includes(s.status));

  const codDelivered = delivered.reduce((s, sh) => s + Number(sh.codAmount ?? 0), 0);
  const codReturned  = returned.reduce((s, sh) => s + Number(sh.codAmount ?? 0), 0);
  const codPending   = inProgress.reduce((s, sh) => s + Number(sh.codAmount ?? 0), 0);
  const total = codDelivered + codReturned;

  return (
    <div className="rounded-2xl border bg-card/60 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-border/50">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> التسوية المالية (COD)
        </p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border/50">
        <div className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground mb-1">محصَّل</p>
          <p className="text-sm font-black text-emerald-400">{formatCurrency(codDelivered)}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">{delivered.length} طلب</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground mb-1">مرتجع</p>
          <p className="text-sm font-black text-red-400">{formatCurrency(codReturned)}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">{returned.length} طلب</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground mb-1">معلق</p>
          <p className="text-sm font-black text-amber-400">{formatCurrency(codPending)}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">{inProgress.length} طلب</p>
        </div>
      </div>
      {total > 0 && (
        <div className="px-4 pb-3 pt-2">
          <div className="flex justify-between text-[11px] mb-1.5">
            <span className="text-muted-foreground">توزيع الـ COD</span>
            <span className="font-bold">{formatCurrency(total)}</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            <div className="bg-emerald-500 rounded-r-full" style={{ width: `${total > 0 ? (codDelivered/total)*100 : 0}%` }} />
            <div className="bg-red-500" style={{ width: `${total > 0 ? (codReturned/total)*100 : 0}%` }} />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> محصَّل</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> مرتجع</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Today Stats Strip ────────────────────────────────────────────────────────
function TodayStrip({ shipments }: { shipments: any[] }) {
  const today = new Date().toDateString();
  const todayShips = shipments.filter(s => s.createdAt && new Date(s.createdAt).toDateString() === today);
  if (todayShips.length === 0) return null;
  const delivered = todayShips.filter(s => s.status === "delivered").length;
  const returned  = todayShips.filter(s => s.status === "returned").length;
  const pending   = todayShips.filter(s => !["delivered","returned","cancelled","partial_received"].includes(s.status)).length;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-bold">اليوم</span>
        <Badge className="text-[10px] h-4 px-1.5 bg-primary/20 text-primary border-0">{todayShips.length}</Badge>
      </div>
      <div className="flex items-center gap-3 text-[11px]">
        <span className="text-emerald-400 font-bold">✓ {delivered}</span>
        <span className="text-red-400 font-bold">↩ {returned}</span>
        <span className="text-amber-400 font-bold">⏳ {pending}</span>
      </div>
    </div>
  );
}

// ─── Top Zones Chart ──────────────────────────────────────────────────────────
// ─── Customer Ratings Card ─────────────────────────────────────────────────
function StarRow({ rating, size = "w-3.5 h-3.5" }: { rating: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${size} ${n <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function CustomerRatingsCard({ avg, count, recent }: {
  avg: number | null; count: number;
  recent: { rating: number; comment: string | null; createdAt: string; receiverName: string | null }[];
}) {
  if (!count) return null;
  return (
    <div className="rounded-2xl border bg-card/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-400" /> تقييم العملاء
        </p>
        {avg != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-amber-400">{avg.toFixed(1)}</span>
            <StarRow rating={avg} />
          </div>
        )}
      </div>
      <div className="space-y-2.5">
        {recent.slice(0, 5).map((r, i) => (
          <div key={i} className="rounded-xl bg-background/40 p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold truncate">{r.receiverName || "عميل"}</p>
              <StarRow rating={r.rating} size="w-3 h-3" />
            </div>
            {r.comment && (
              <p className="text-[11px] text-muted-foreground line-clamp-2">{r.comment}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopZonesCard({ zones, total }: { zones: { name: string; count: number }[]; total: number }) {
  if (!zones.length) return null;
  const max = zones[0].count;
  const colors = ["bg-blue-500","bg-indigo-500","bg-violet-500","bg-purple-500","bg-fuchsia-500"];
  return (
    <div className="rounded-2xl border bg-card/60 p-4">
      <p className="text-xs font-bold mb-3 flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-primary" /> أعلى المناطق تسليماً
      </p>
      <div className="space-y-2.5">
        {zones.slice(0, 5).map((z, i) => (
          <div key={z.name}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-foreground font-medium flex items-center gap-1">
                <span className="text-[9px] font-black text-muted-foreground w-4">{i + 1}</span>
                {z.name}
              </span>
              <span className="font-bold text-muted-foreground">{z.count} <span className="text-[9px]">({total > 0 ? Math.round(z.count/total*100) : 0}%)</span></span>
            </div>
            <div className="w-full bg-muted/20 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full ${colors[i]}`} style={{ width: `${(z.count/max)*100}%`, transition: "width 0.8s ease" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Performance Tab ──────────────────────────────────────────────────────────
function PerformanceTab({ d, allShipments }: { d: any; allShipments: any[] }) {
  // حساب بيانات الأسبوع الحالي والأسبوع اللي فاته
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
  const prevWeekStart = new Date(now); prevWeekStart.setDate(now.getDate() - 14);

  const thisWeek = allShipments.filter(s => s.createdAt && new Date(s.createdAt) >= weekStart);
  const prevWeek = allShipments.filter(s => {
    const d = new Date(s.createdAt ?? 0);
    return d >= prevWeekStart && d < weekStart;
  });

  const wDelivered = thisWeek.filter(s => s.status === "delivered").length;
  const wReturned  = thisWeek.filter(s => s.status === "returned").length;
  const pwDelivered = prevWeek.filter(s => s.status === "delivered").length;
  const pwReturned  = prevWeek.filter(s => s.status === "returned").length;

  // شحنات مؤجلة (تحتاج اهتمام)
  const needsAttention = allShipments.filter(s =>
    ["delayed","waiting","out_for_delivery","in_transit"].includes(s.status)
  );

  return (
    <div className="space-y-3">
      {/* Hero: عنوان الصفحة + ملخص سريع */}
      <div className="rounded-2xl p-4 border relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, hsl(var(--card)) 70%)",
                 border: "1px solid rgba(139,92,246,0.25)" }}>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/15">
            <TrendingUp className="w-5 h-5 text-violet-400" />
          </span>
          <div>
            <p className="text-sm font-black text-foreground/90">أدائي وإحصائياتي</p>
            <p className="text-[11px] text-muted-foreground">نظرة شاملة على أدائك خلال الفترة الحالية</p>
          </div>
        </div>
      </div>

      {/* Performance Score */}
      <PerformanceScore
        deliveryRate={d?.deliveryRate ?? 0}
        returnRate={d?.returnRate ?? 0}
        total={d?.total ?? 0}
      />

      {/* Customer Ratings */}
      <CustomerRatingsCard
        avg={d?.ratingsAvg ?? null}
        count={d?.ratingsCount ?? 0}
        recent={d?.recentRatings ?? []}
      />

      {/* Weekly Trend */}
      <div className="rounded-2xl border bg-card/60 p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-blue-400" /> مقارنة الأسبوع
          </p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary/70" /> هذا الأسبوع</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/30" /> الأسبوع الفائت</span>
          </div>
        </div>

        <div className="space-y-4">
          {/* إجمالي الشحنات */}
          <div>
            <div className="flex justify-between items-center text-[11px] mb-1.5">
              <span className="text-muted-foreground">إجمالي الشحنات</span>
              <TrendBadge current={thisWeek.length} prev={prevWeek.length} label="إجمالي" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-muted/15 overflow-hidden">
                <div className="h-2 rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.min(100, (thisWeek.length / Math.max(1, Math.max(thisWeek.length, prevWeek.length))) * 100)}%` }} />
              </div>
              <span className="text-xs font-black w-8 text-left">{thisWeek.length}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full bg-muted/10 overflow-hidden">
                <div className="h-1.5 rounded-full bg-muted-foreground/30 transition-all duration-700"
                  style={{ width: `${Math.min(100, (prevWeek.length / Math.max(1, Math.max(thisWeek.length, prevWeek.length))) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground w-8 text-left">{prevWeek.length}</span>
            </div>
          </div>

          {/* شحنات تم تسليمها */}
          <div>
            <div className="flex justify-between items-center text-[11px] mb-1.5">
              <span className="text-muted-foreground">تسليم</span>
              <TrendBadge current={wDelivered} prev={pwDelivered} label="تسليم" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-muted/15 overflow-hidden">
                <div className="h-2 rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, (wDelivered / Math.max(1, Math.max(wDelivered, pwDelivered))) * 100)}%` }} />
              </div>
              <span className="text-xs font-black w-8 text-left text-emerald-400">{wDelivered}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full bg-muted/10 overflow-hidden">
                <div className="h-1.5 rounded-full bg-muted-foreground/30 transition-all duration-700"
                  style={{ width: `${Math.min(100, (pwDelivered / Math.max(1, Math.max(wDelivered, pwDelivered))) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground w-8 text-left">{pwDelivered}</span>
            </div>
          </div>

          {/* شحنات مرتجعة */}
          <div>
            <div className="flex justify-between items-center text-[11px] mb-1.5">
              <span className="text-muted-foreground">إرجاع</span>
              <TrendBadge current={pwReturned} prev={wReturned} label="إرجاع" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-muted/15 overflow-hidden">
                <div className="h-2 rounded-full bg-red-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, (wReturned / Math.max(1, Math.max(wReturned, pwReturned))) * 100)}%` }} />
              </div>
              <span className="text-xs font-black w-8 text-left text-red-400">{wReturned}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full bg-muted/10 overflow-hidden">
                <div className="h-1.5 rounded-full bg-muted-foreground/30 transition-all duration-700"
                  style={{ width: `${Math.min(100, (pwReturned / Math.max(1, Math.max(wReturned, pwReturned))) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground w-8 text-left">{pwReturned}</span>
            </div>
          </div>
        </div>
      </div>

      {/* COD Settlement */}
      <CodSettlementCard shipments={allShipments} />

      {/* Top Zones */}
      <TopZonesCard zones={d?.zones ?? []} total={d?.total ?? 0} />

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> تحتاج متابعة ({needsAttention.length})
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {needsAttention.slice(0, 10).map(sh => (
              <div key={sh.id} className="flex items-center justify-between bg-background/30 rounded-lg px-2 py-1.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold truncate">{sh.receiverName}</p>
                  <p className="text-[9px] text-muted-foreground font-mono">{sh.shipmentNumber}</p>
                </div>
                <Badge variant="outline" className={`text-[9px] shrink-0 border ${STATUS_COLOR[sh.status] ?? "border-border"}`}>
                  {STATUS_LABELS[sh.status] ?? sh.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── حالات بيان الشحن (manifest item delivery status) ─────────────────────
const MANIFEST_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending",           label: "قيد الانتظار" },
  { value: "delivered",         label: "مسلَّم ✓" },
  { value: "partial_delivered", label: "مسلَّم جزئي" },
  { value: "delayed",           label: "مؤجل" },
  { value: "returned",          label: "مرتجع" },
];
const MANIFEST_STATUS_COLOR: Record<string, string> = {
  pending: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  partial_delivered: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  delayed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  returned: "bg-red-500/15 text-red-400 border-red-500/30",
};
const manifestStatusLabel = (v: string) => MANIFEST_STATUS_OPTIONS.find(o => o.value === v)?.label ?? v;

// ─── صف شحنة جوّا تفاصيل البيان — تعديل الحالة من المندوب ────────────────────
function ManifestItemRow({ item, manifestId, locked, onSaved }: {
  item: any; manifestId: number; locked: boolean; onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string>(item.deliveryStatus);
  const [note, setNote] = useState(item.deliveryNote ?? "");
  const [partialQty, setPartialQty] = useState(item.partialQuantity?.toString() ?? "");
  const [returnReceived, setReturnReceived] = useState<boolean | null>(
    item.returnReceived === 1 ? true : item.returnReceived === 0 ? false : null
  );
  const [returnReason, setReturnReason] = useState(item.returnReason ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      if (status === "partial_delivered") {
        const qty = parseInt(partialQty);
        if (partialQty === "" || isNaN(qty) || qty < 0) throw new Error("لازم تدخل الكمية المستلمة");
        if (qty > (item.quantity ?? 1)) throw new Error(`الكمية لا يمكن أن تتجاوز ${item.quantity}`);
      }
      return apiFetch(`/shipment-manifests/${manifestId}/items/${item.shipmentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          deliveryStatus: status,
          deliveryNote: note.trim() || null,
          partialQuantity: status === "partial_delivered" && partialQty !== "" ? parseInt(partialQty) : null,
          returnReceived: status === "returned" || status === "partial_delivered" ? returnReceived : null,
          returnReason: status === "returned" ? (returnReason || null) : null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "✅ تم تحديث حالة الشحنة" });
      setEditing(false);
      onSaved();
      // تزامن مع صفحة الشحنات
      qc.invalidateQueries({ queryKey: ["shipments-list"] });
      qc.invalidateQueries({ queryKey: ["shipments-stats"] });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const needsNote = status === "returned" || status === "delayed";
  const hasChanges =
    status !== item.deliveryStatus ||
    note !== (item.deliveryNote ?? "") ||
    partialQty !== (item.partialQuantity?.toString() ?? "");

  return (
    <Card className={`p-3 border-border space-y-2 ${(item.isUrgent === 1 || item.isUrgent === true) ? "bg-red-500/5 border-red-500/30" : "bg-card/60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-bold truncate">{item.customerName}</p>
            {(item.isUrgent === 1 || item.isUrgent === true) && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black text-red-400 bg-red-500/15 border border-red-500/40 rounded-full px-1.5 py-0.5">
                <PoliceLight /> مستعجل
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground flex gap-1 flex-wrap mt-0.5">
            <span className="font-mono text-primary/70">{item.invoiceNumber}</span>
            {item.phone && <span>· {item.phone}</span>}
            {item.city && <span>· {item.city}</span>}
          </p>
          {(item.isUrgent === 1 || item.isUrgent === true) && item.urgentNote && (
            <p className="text-[10px] text-red-300/70 mt-0.5">⚡ {item.urgentNote}</p>
          )}
        </div>
        <Badge variant="outline" className={`text-[9px] shrink-0 border ${MANIFEST_STATUS_COLOR[item.deliveryStatus] ?? "border-border"}`}>
          {manifestStatusLabel(item.deliveryStatus)}
        </Badge>
      </div>

      {!editing ? (
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-emerald-400">{Number(item.totalPrice ?? 0).toLocaleString("ar-EG")} ج.م</span>
          {!locked && (
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setEditing(true)}>
              تعديل الحالة
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 pt-1 border-t border-border/50">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MANIFEST_STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {status === "partial_delivered" && (
            <input type="number" min={0} max={item.quantity ?? 1} value={partialQty}
              onChange={e => setPartialQty(e.target.value)}
              placeholder={`الكمية المستلمة (من ${item.quantity ?? 1})`}
              className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs" />
          )}

          {(status === "returned" || status === "partial_delivered") && (
            <div className="flex gap-2">
              <button onClick={() => setReturnReceived(true)}
                className={`flex-1 h-7 text-[10px] rounded-md border ${returnReceived === true ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "border-border text-muted-foreground"}`}>
                تم الاستلام في المخزن
              </button>
              <button onClick={() => setReturnReceived(false)}
                className={`flex-1 h-7 text-[10px] rounded-md border ${returnReceived === false ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "border-border text-muted-foreground"}`}>
                لسه عند الشحن
              </button>
            </div>
          )}

          {status === "returned" && (
            <input value={returnReason} onChange={e => setReturnReason(e.target.value)}
              placeholder="سبب الإرجاع (اختياري)"
              className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs" />
          )}

          {needsNote && (
            <Textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="ملاحظة (اختياري)" className="text-xs min-h-[50px]" />
          )}

          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-[11px] flex-1" disabled={!hasChanges || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? "بيحفظ..." : "حفظ"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setEditing(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── مرتجعات لسه معاك — لسه مرجعتهاش للتاجر ──────────────────────────────────
function StillWithCourierRow({ item, manifestId, locked, onSaved }: {
  item: any; manifestId: number; locked: boolean; onSaved: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => apiFetch(`/shipment-manifests/${manifestId}/items/${item.shipmentId}`, {
      method: "PATCH",
      body: JSON.stringify({
        deliveryStatus: item.deliveryStatus,
        deliveryNote: item.deliveryNote ?? null,
        partialQuantity: item.partialQuantity ?? null,
        returnReceived: true,
        returnReason: item.returnReason ?? null,
      }),
    }),
    onSuccess: () => {
      toast({ title: "✅ تم تأكيد التسليم للتاجر" });
      onSaved();
      qc.invalidateQueries({ queryKey: ["shipments-list"] });
      qc.invalidateQueries({ queryKey: ["shipments-stats"] });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex items-center justify-between gap-2 bg-background/40 rounded-lg px-2 py-1.5">
      <div className="min-w-0">
        <p className="text-[11px] font-bold truncate">{item.customerName}</p>
        <p className="text-[9px] text-muted-foreground font-mono">{item.invoiceNumber}</p>
      </div>
      {!locked && (
        <Button size="sm" className="h-6 text-[10px] shrink-0 gap-1" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          <CheckCheck className="w-3 h-3" /> تم التسليم للتاجر
        </Button>
      )}
    </div>
  );
}

function StillWithCourierSection({ items, manifestId, locked, onSaved }: {
  items: any[]; manifestId: number; locked: boolean; onSaved: () => void;
}) {
  const pending = items.filter(i =>
    (i.deliveryStatus === "returned" || i.deliveryStatus === "partial_delivered") && i.returnReceived !== 1
  );
  if (pending.length === 0) return null;

  return (
    <Card className="p-3 border-amber-500/40 bg-amber-500/5 space-y-2">
      <p className="text-xs font-bold text-amber-400 flex items-center gap-1">
        <Truck className="w-3.5 h-3.5" /> مرتجعات لسه معاك ({pending.length})
      </p>
      <p className="text-[10px] text-muted-foreground">اضغط "تم التسليم للتاجر" لما ترجّع البضاعة دي فعلياً</p>
      <div className="space-y-1.5">
        {pending.map(item => (
          <StillWithCourierRow key={item.id} item={item} manifestId={manifestId} locked={locked} onSaved={onSaved} />
        ))}
      </div>
    </Card>
  );
}

// ─── تفاصيل البيان — قائمة الشحنات + إغلاق البيان ────────────────────────────
function ManifestDetail({ manifestId, onBack }: { manifestId: number; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmClose, setConfirmClose] = useState(false);
  const [showClosedSummary, setShowClosedSummary] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rep-manifest", manifestId],
    queryFn: () => apiFetch(`/shipment-manifests/${manifestId}`),
  });
  const manifest = data as any;
  const locked = manifest?.status === "closed";

  const closeMutation = useMutation({
    mutationFn: () => apiFetch(`/shipment-manifests/${manifestId}`, {
      method: "PATCH", body: JSON.stringify({ status: "closed" }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep-manifest", manifestId] });
      qc.invalidateQueries({ queryKey: ["rep-manifests"] });
      // تزامن مع صفحة الشحنات — الحالات بتتغير جوه البيان لازم تنعكس فورًا
      qc.invalidateQueries({ queryKey: ["shipments-list"] });
      qc.invalidateQueries({ queryKey: ["shipments-stats"] });
      // تزامن مع شاشة "الشحنات/المهام" في تطبيق المندوب — البيان اتقفل، زرار "تقفيل" لازم يختفي فورًا
      qc.invalidateQueries({ queryKey: ["rep-today-tasks"] });
      qc.invalidateQueries({ queryKey: ["rep-shipments"] });
      qc.invalidateQueries({ queryKey: ["rep-all-shipments"] });
      qc.invalidateQueries({ queryKey: ["rep-dashboard"] });
      setConfirmClose(false);
      setShowClosedSummary(true);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !manifest) {
    return <p className="text-xs text-muted-foreground text-center py-8">جاري التحميل...</p>;
  }

  const st = manifest.stats ?? {};
  const items = (manifest.items as any[]) ?? [];
  const total = st.total ?? 0;
  const delivered = st.delivered ?? 0;
  const returned = st.returned ?? 0;
  const partial = st.partial ?? 0;
  const pendingDelayed = (st.pending ?? 0) + (st.delayed ?? 0);
  const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;
  const returnRate = total > 0 ? Math.round((returned / total) * 100) : 0;
  const pendingRate = total > 0 ? Math.round((pendingDelayed / total) * 100) : 0;

  const codTotal = items.reduce((s, i) => s + Number(i.totalPrice ?? 0), 0);
  const codDelivered = items.filter(i => i.deliveryStatus === "delivered").reduce((s, i) => s + Number(i.totalPrice ?? 0), 0);
  const codReturned = items.filter(i => i.deliveryStatus === "returned").reduce((s, i) => s + Number(i.totalPrice ?? 0), 0);

  const invoicePrice = manifest.invoicePrice != null ? Number(manifest.invoicePrice) : null;
  const courierCostManual = Number(manifest.courierCostManual ?? 0);
  const netDueToCompany = st.netDueToCompany ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-4 h-4" /> رجوع للبيانات
        </button>
        <Badge variant="outline" className={locked ? "border-red-500/30 text-red-400 bg-red-500/10" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"}>
          {locked ? <Lock className="w-3 h-3 ml-1" /> : <Unlock className="w-3 h-3 ml-1" />}
          {locked ? "مغلق" : "مفتوح"}
        </Badge>
      </div>

      <p className="text-sm font-black font-mono text-center">{manifest.manifestNumber}</p>

      {/* ── بانر الشحنات المستعجلة ── */}
      {(() => {
        const urgentItems = items.filter((i: any) => i.isUrgent === 1 || i.isUrgent === true);
        if (urgentItems.length === 0) return null;
        return <UrgentBanner urgentItems={urgentItems} />;
      })()}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="إجمالي الطلبيات" value={total} color="96,165,250" icon={Package} />
        <KpiCard label="مسلَّم" value={delivered} sub={`${deliveryRate}% نسبة التسليم`} color="52,211,153" icon={CheckCircle2} />
        <KpiCard label="مرتجع" value={returned} sub={`${returnRate}% نسبة الإرجاع`} color="248,113,113" icon={RotateCcw} />
        <KpiCard label="مؤجل / معلّق" value={pendingDelayed} sub={`${pendingRate}% من الإجمالي`} color="251,191,36" icon={Hourglass} />
      </div>
      {partial > 0 && (
        <Card className="p-2.5 bg-card/60 border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1"><PackageCheck className="w-3.5 h-3.5 text-teal-400" /> استلام جزئي</span>
          <span className="text-sm font-black text-teal-400">{partial}</span>
        </Card>
      )}

      {/* نسبة التسليم */}
      <Card className="p-3 bg-card/60 border-border">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-bold">نسبة التسليم</p>
          <p className="text-sm font-black text-emerald-400">{deliveryRate}%</p>
        </div>
        <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${deliveryRate}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
          <span>مرتجع: {returned}</span>
          <span>مؤجل: {pendingDelayed}</span>
          <span>مسلَّم: {delivered}</span>
        </div>
      </Card>

      {/* فاتورة البيان */}
      <Card className="p-3 bg-card/60 border-border flex items-center justify-between">
        <div>
          <p className="text-xs font-bold">فاتورة البيان</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">المبلغ المتفق عليه معك</p>
        </div>
        <p className="text-sm font-black">{invoicePrice != null ? formatCurrency(invoicePrice) : "لم يُحدّد بعد"}</p>
      </Card>

      {/* بيان التسوية */}
      <Card className="p-3 bg-card/60 border-border space-y-2">
        <p className="text-xs font-bold flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-primary" /> بيان التسوية مع الإدارة</p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-background/40 p-2">
            <p className="text-[10px] text-muted-foreground">إجمالي COD المسلَّم</p>
            <p className="text-sm font-black text-emerald-400">{formatCurrency(codDelivered)}</p>
          </div>
          <div className="rounded-lg bg-background/40 p-2">
            <p className="text-[10px] text-muted-foreground">صافي المستحق عليك</p>
            <p className="text-sm font-black">{netDueToCompany != null ? formatCurrency(netDueToCompany) : "—"}</p>
          </div>
        </div>
        {courierCostManual !== 0 && (
          <div className="flex justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
            <span>تكلفة متفق عليها مخصومة</span>
            <span className="text-red-400 font-bold">-{formatCurrency(courierCostManual)}</span>
          </div>
        )}
      </Card>

      <StillWithCourierSection items={items} manifestId={manifestId} locked={locked}
        onSaved={() => qc.invalidateQueries({ queryKey: ["rep-manifest", manifestId] })} />

      <div className="space-y-2">
        {items.map(item => (
          <ManifestItemRow key={item.id} item={item} manifestId={manifestId} locked={locked}
            onSaved={() => qc.invalidateQueries({ queryKey: ["rep-manifest", manifestId] })} />
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">لا توجد شحنات في هذا البيان</p>
        )}
      </div>

      {/* ملخص COD */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-2.5 bg-card/60 border-border text-center">
          <p className="text-[10px] text-muted-foreground">COD إجمالي</p>
          <p className="text-sm font-black">{formatCurrency(codTotal)}</p>
        </Card>
        <Card className="p-2.5 bg-card/60 border-border text-center">
          <p className="text-[10px] text-muted-foreground">COD المسلَّم</p>
          <p className="text-sm font-black text-emerald-400">{formatCurrency(codDelivered)}</p>
        </Card>
        <Card className="p-2.5 bg-card/60 border-border text-center">
          <p className="text-[10px] text-muted-foreground">COD المرتجع</p>
          <p className="text-sm font-black text-red-400">{formatCurrency(codReturned)}</p>
        </Card>
      </div>

      {/* ── رسالة ملخص ما بعد الإغلاق — تظهر مرة واحدة فور تأكيد القفل ── */}
      {showClosedSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-6 border-emerald-500/40 bg-gradient-to-b from-emerald-500/10 to-card space-y-4 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
              <PackageCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <p className="text-base font-black text-emerald-400">تم قفل البيان بنجاح</p>
              <p className="text-xs text-muted-foreground mt-1">راجع البيانات التالية قبل توريد المبالغ والمرتجعات</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-right">
                <p className="text-[11px] text-amber-300/90">💰 الرصيد المستحق عليك</p>
                <p className="text-xl font-black text-amber-400 mt-0.5">
                  {netDueToCompany != null ? formatCurrency(netDueToCompany) : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">برجاء توريد المبلغ للشركة في أقرب وقت</p>
              </div>
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-right">
                <p className="text-[11px] text-red-300/90">↩ عدد المرتجعات</p>
                <p className="text-xl font-black text-red-400 mt-0.5">{returned} شحنة</p>
                <p className="text-[10px] text-muted-foreground mt-1">برجاء ردهم للشركة في أقرب وقت</p>
              </div>
            </div>
            <Button className="w-full gap-2" onClick={() => setShowClosedSummary(false)}>
              <CheckCircle2 className="w-4 h-4" /> تمام، هوريها
            </Button>
          </Card>
        </div>
      )}

      {!locked && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
          {!confirmClose ? (
            <Button size="lg" className="w-full gap-2 h-14 text-base font-black bg-primary hover:bg-primary/90" onClick={() => setConfirmClose(true)}>
              <Lock className="w-5 h-5" /> قفل البيان
            </Button>
          ) : (
            <Card className="p-3 border-amber-500/30 bg-amber-500/5 space-y-2">
              <p className="text-xs flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" /> هتقفل البيان؟ مش هتقدر تعدّل بعد القفل.
              </p>
              {pendingDelayed > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  فيه {pendingDelayed} شحنة لسه قيد الانتظار/مؤجلة — هتفضل من غير تحديث.
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 gap-1" disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
                  <PackageCheck className="w-3.5 h-3.5" /> {closeMutation.isPending ? "بيقفل..." : "تأكيد القفل"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmClose(false)}>إلغاء</Button>
              </div>
            </Card>
          )}
        </div>
      )}
      {!locked && <div className="h-20" />}
    </div>
  );
}

// ─── تاب البيانات (manifests) ─── اتشال RepManifestsTab المختصر القديم من
// هنا؛ التاب دلوقتي بيستخدم ShippingCompaniesPage (embedded) اللي مستوردة
// فوق من representative-shipping-companies.tsx، وفيها نفس CompanyStats/
// CompanyManifests بالإضافة لكارت بيانات المندوب الكامل (اسم/صورة/هاتف).

function ManifestsTab({ companyId }: { companyId: number | null }) {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["rep-manifests", companyId],
    queryFn: () => apiFetch(`/shipment-manifests?companyId=${companyId}`),
    enabled: !!companyId,
  });
  const manifests = (data as any[]) ?? [];

  if (isLoading) return <p className="text-xs text-muted-foreground text-center py-8">جاري التحميل...</p>;

  return (
    <div className="space-y-2">
      {manifests.map((m: any, idx: number) => (
        <RepManifestCard key={m.id} m={m} isLatest={idx === 0} onOpen={() => setLocation(`/representative/manifests/${m.id}`)} />
      ))}
      {manifests.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">لا توجد بيانات شحن حالياً</p>
      )}
    </div>
  );
}

// ─── كارت البيان — نفس تصميم صفحة الأدمن (shipping-company-detail.tsx) ───────
function RepManifestCard({ m, isLatest, onOpen }: { m: any; isLatest: boolean; onOpen: () => void }) {
  const sc = m.statusCounts ?? { delivered: 0, returned: 0, pending: 0, delayed: 0, partial: 0 };
  const total = m.shipmentCount ?? 0;
  const delivered = (sc.delivered ?? 0) + (sc.partial ?? 0);
  const returned = sc.returned ?? 0;
  const pending = (sc.pending ?? 0) + (sc.delayed ?? 0);
  const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

  return (
    <div
      onClick={onOpen}
      className={`group flex items-stretch gap-0 hover:bg-muted/10 transition-colors cursor-pointer rounded-lg border ${
        m.status === "closed" ? "border-border bg-card/50" : "border-primary/30 bg-primary/5"
      }`}
    >
      <div className={`w-1 rounded-r-lg shrink-0 ${m.status === "closed" ? "bg-emerald-500" : "bg-blue-500"}`} />
      <div className="flex-1 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-sm">{m.manifestNumber}</span>
              {isLatest && m.status === "open" && (
                <Badge variant="outline" className="text-[9px] border-primary/50 bg-primary/10 text-primary">الأحدث</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" />{format(new Date(m.createdAt), "yyyy/MM/dd")}
              </span>
              {m.closedAt ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <Lock className="w-2.5 h-2.5" />أُغلق {format(new Date(m.closedAt), "yyyy/MM/dd")}
                </span>
              ) : (
                <span className="text-blue-500">
                  منذ {formatDistanceToNow(new Date(m.createdAt), { locale: ar, addSuffix: false })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={`text-[9px] font-bold border ${
              m.status === "closed"
                ? "border-emerald-700 bg-emerald-900/20 text-emerald-400"
                : "border-blue-700 bg-blue-900/20 text-blue-400"
            }`}>
              {m.status === "closed"
                ? <><Lock className="w-2.5 h-2.5 inline ml-0.5" />مغلق</>
                : <><Clock className="w-2.5 h-2.5 inline ml-0.5" />مفتوح</>}
            </Badge>
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2 text-[11px] flex-wrap">
          <span className="flex items-center gap-1">
            <Package className="w-3 h-3 text-muted-foreground" />
            <span className="font-bold">{total}</span><span className="text-muted-foreground">شحنة</span>
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /><span className="font-bold">{delivered}</span> مسلَّم
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <RotateCcw className="w-3 h-3" /><span className="font-bold">{returned}</span> مرتجع
          </span>
          {pending > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <Clock className="w-3 h-3" /><span className="font-bold">{pending}</span> معلَّق
            </span>
          )}
          {m.invoicePrice != null && (
            <span className="flex items-center gap-1 text-primary font-bold mr-auto">
              {formatCurrency(Number(m.invoicePrice))}
            </span>
          )}
        </div>

        {total > 0 && (
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden flex mt-2">
            <div className="h-1.5 bg-emerald-500" style={{ width: `${deliveryRate}%` }} />
            <div className="h-1.5 bg-red-500" style={{ width: `${total > 0 ? (returned / total) * 100 : 0}%` }} />
            <div className="h-1.5 bg-amber-500" style={{ width: `${total > 0 ? (pending / total) * 100 : 0}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Today Tasks Tab ──────────────────────────────────────────────────────────
const TASK_STATUS_PRIORITY: Record<string, { label: string; color: string; dot: string }> = {
  urgent:            { label: "مستعجل",        color: "bg-red-500/15 text-red-400 border-red-500/40",       dot: "bg-red-500" },
  pending:           { label: "قيد التسليم",  color: "bg-blue-500/15 text-blue-400 border-blue-500/40",    dot: "bg-blue-500" },
  delayed:           { label: "مؤجل",          color: "bg-amber-500/15 text-amber-400 border-amber-500/40", dot: "bg-amber-500" },
  partial_delivered: { label: "جزئي",          color: "bg-teal-500/15 text-teal-400 border-teal-500/30",    dot: "bg-teal-400" },
  out_for_delivery:  { label: "خرج للتسليم",  color: "bg-blue-500/15 text-blue-400 border-blue-500/40",    dot: "bg-blue-500" },
  in_transit:        { label: "في الطريق",    color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/40", dot: "bg-indigo-400" },
  waiting:           { label: "انتظار",        color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",    dot: "bg-zinc-500" },
};

function TaskCard({ task }: { task: any }) {
  const { user } = useAuth();
  const statusKey = task.isUrgent ? "urgent" : (task.deliveryStatus ?? task.status ?? "pending");
  const info = TASK_STATUS_PRIORITY[statusKey] ?? TASK_STATUS_PRIORITY["waiting"];

  const { data: waSettings } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: () => apiFetch("/whatsapp/settings"),
    staleTime: 5 * 60_000,
  });
  const deliveryReadyTpl = (waSettings as any)?.templates?.find((t: any) => t.name === "طلب استعداد للاستلام");
  const whatsappMessage = deliveryReadyTpl
    ? applyDeliveryReadyTemplate(deliveryReadyTpl.body, {
        customerName: task.receiverName,
        representativeName: (user as any)?.name ?? "",
        shipmentNumber: task.shipmentNumber,
        codAmount: task.codAmount,
        receiverCity: task.receiverCity,
        senderName: (task as any).senderName,
        totalPrice: (task as any).totalPrice,
        parcelType: (task as any).parcelType,
        senderPhone: (task as any).senderPhone,
        senderCity: (task as any).senderCity,
        senderGovernorate: (task as any).senderGovernorate,
        pieces: (task as any).pieces,
        weight: (task as any).weight,
        receiverAddress: (task as any).receiverAddress,
      })
    : "";
  const waPhone = (task.receiverPhone ?? "").replace(/\D/g, "");
  const waHref = waPhone
    ? `https://wa.me/${waPhone.startsWith("0") ? "2" + waPhone : waPhone}${whatsappMessage ? `?text=${encodeURIComponent(whatsappMessage)}` : ""}`
    : undefined;

  return (
    <div className={`rounded-2xl border p-3 space-y-2.5 transition-all ${task.isUrgent ? "border-red-500/50 bg-red-950/30" : "border-border/60 bg-card/60"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {task.isUrgent && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black text-red-400 bg-red-500/15 border border-red-500/40 rounded-full px-1.5 py-0.5 shrink-0">
                <PoliceLight /> مستعجل
              </span>
            )}
            <p className="text-xs font-black truncate">{task.receiverName}</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono text-primary/60">{task.shipmentNumber}</p>
        </div>
        <Badge variant="outline" className={`text-[9px] shrink-0 border ${info.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${info.dot} ml-1 inline-block`} />
          {info.label}
        </Badge>
      </div>

      {/* Info row */}
      <div className="flex items-center gap-3 flex-wrap">
        {task.receiverCity && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="w-3 h-3 text-primary/50" /> {task.receiverCity}
          </span>
        )}
        {task.zoneName && task.zoneName !== task.receiverCity && (
          <span className="text-[10px] text-muted-foreground/60">({task.zoneName})</span>
        )}
        <span className="text-[11px] font-bold text-emerald-400 mr-auto">
          {Number(task.codAmount ?? 0).toLocaleString("ar-EG")} ج.م
        </span>
      </div>

      {/* Urgent note */}
      {task.isUrgent && task.urgentNote && (
        <p className="text-[10px] text-red-300/80 bg-red-500/10 rounded-lg px-2 py-1">
          ⚡ {task.urgentNote}
        </p>
      )}

      {/* Call + WhatsApp buttons */}
      {task.receiverPhone && (
        <div className="flex items-center gap-1.5">
          <a href={`tel:${task.receiverPhone}`}
            className="flex items-center justify-center gap-1.5 flex-1 h-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/20 transition-colors">
            <PhoneCall className="w-3.5 h-3.5" /> {task.receiverPhone}
          </a>
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer"
              title="ابعت رسالة واتساب للعميل"
              className="flex items-center justify-center w-8 h-8 shrink-0 rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function TodayTasksTab({ companyId }: { companyId: number | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rep-today-tasks", companyId],
    queryFn: () => apiFetch(`/representative/today-tasks${companyId ? `?companyId=${companyId}` : ""}`),
    enabled: true,
    refetchInterval: 60_000, // تحديث تلقائي كل دقيقة
  });

  const d = data as any;
  const tasks: any[] = d?.tasks ?? [];
  const summary = d?.summary ?? { urgent: 0, outForDelivery: 0, pending: 0, total: 0 };

  // فصل المهام لمجموعات
  const urgentTasks   = tasks.filter(t => t.isUrgent);
  const outTasks      = tasks.filter(t => !t.isUrgent && t.deliveryStatus === "pending");
  const delayedTasks  = tasks.filter(t => !t.isUrgent && t.deliveryStatus === "delayed");
  const partialTasks  = tasks.filter(t => !t.isUrgent && t.deliveryStatus === "partial_delivered");
  const canStartDay   = outTasks.length > 0;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-muted/20 animate-pulse" />)}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <CheckCheck className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="text-sm font-bold text-emerald-400">مفيش مهام نشطة اليوم!</p>
        <p className="text-xs text-muted-foreground">كل الشحنات مسلَّمة أو ملغية</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Summary Strip ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-center">
          <p className="text-xl font-black text-red-400">{summary.urgent}</p>
          <p className="text-[10px] text-red-400/80 font-bold">مستعجل</p>
        </div>
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 text-center">
          <p className="text-xl font-black text-blue-400">{summary.outForDelivery}</p>
          <p className="text-[10px] text-blue-400/80 font-bold">خرج للتسليم</p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
          <p className="text-xl font-black text-amber-400">{summary.pending}</p>
          <p className="text-[10px] text-amber-400/80 font-bold">معلّق / مؤجل</p>
        </div>
      </div>

      {/* ── زر بدأت اليوم ── */}
      {canStartDay && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-primary" />
            <p className="text-xs font-bold">
              {outTasks.length} شحنة جاهزة للتسليم — ابدأ يومك دلوقتي
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            💡 نصيحة: رتّب شحناتك حسب المنطقة قبل ما تنزل، وابعت لوكيشن لكل عميل قبل الوصول عشان توفّر وقتك وتقلل المكالمات.
          </p>
        </div>
      )}

      {/* ── مستعجلة أولاً ── */}
      {urgentTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black text-red-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 fill-red-400" /> مستعجلة — سلّمها فوراً ({urgentTasks.length})
          </p>
          {urgentTasks.map(t => <TaskCard key={`${t.id}-${t.manifestId}`} task={t} />)}
        </div>
      )}

      {/* ── قيد التسليم (pending) ── */}
      {outTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> قيد التسليم ({outTasks.length})
          </p>
          {outTasks.map(t => <TaskCard key={`${t.id}-${t.manifestId}`} task={t} />)}
        </div>
      )}

      {/* ── مؤجلة ── */}
      {delayedTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> مؤجلة ({delayedTasks.length})
          </p>
          {delayedTasks.map(t => <TaskCard key={`${t.id}-${t.manifestId}`} task={t} />)}
        </div>
      )}

      {/* ── استلام جزئي ── */}
      {partialTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
            <PackageCheck className="w-3.5 h-3.5" /> استلام جزئي ({partialTasks.length})
          </p>
          {partialTasks.map(t => <TaskCard key={`${t.id}-${t.manifestId}`} task={t} />)}
        </div>
      )}
    </div>
  );
}

// ===== MERGED FROM representative-shipping-companies.tsx =====
// الحالات اللي تعتبر "متاحة" للإضافة لبيان شحن شحنات جديد — قيد الشحن في المخزن فقط
const AVAILABLE_SHIPMENT_STATUSES = ["waiting"];

const SHIPMENT_STATUS_LABELS_LOCAL: Record<string, string> = {
  ...STATUS_LABELS,
};

function CompanyAvatar({ logo, name, size = "md" }: { logo?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "w-14 h-14" : size === "sm" ? "w-7 h-7" : "w-10 h-10";
  const iconSize = size === "lg" ? "w-7 h-7" : size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  if (logo && logo.startsWith("data:"))
    return <img src={logo} className={`${dims} rounded-full object-cover border-2 border-border/50 shrink-0`} alt={name} />;
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0`}>
      <Truck className={`${iconSize} text-primary/60`} />
    </div>
  );
}

/** حقل رفع اللوجو */
/** يضغط ويصغّر الصورة قبل تحويلها لـ base64 — يمنع خطأ 500 الناتج عن تجاوز
 *  max_allowed_packet في MySQL عند رفع صور موبايل عالية الدقة بدون ضغط */
function resizeAndCompressImage(file: File, maxDim = 320, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        } else {
          if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas غير مدعوم")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("تعذّر قراءة الصورة"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "خطأ", description: "يجب اختيار ملف صورة (PNG, JPG, WEBP).", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const compressed = await resizeAndCompressImage(file);
      onChange(compressed);
    } catch (err: any) {
      toast({ title: "خطأ", description: err?.message ?? "تعذّر معالجة الصورة.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      // تصفير قيمة input عشان يقدر المستخدم يختار نفس الملف تاني لو احتاج
      e.target.value = "";
    }
  };
  return (
    <div>
      <Label className="text-xs mb-1.5 block flex items-center gap-1"><ImagePlus className="w-3 h-3" />صورة المندوب</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative shrink-0">
            <img src={value} className="w-14 h-14 rounded-full object-cover border-2 border-border" alt="logo" />
            <button
              type="button"
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80 transition-colors"
              onClick={() => onChange("")}
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div
            className="w-14 h-14 rounded-full bg-muted/30 border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/60 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full" disabled={isProcessing} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="w-3.5 h-3.5" />
            {isProcessing ? "جاري المعالجة..." : value ? "تغيير الصورة" : "رفع صورة"}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, WEBP — يتم ضغط الصورة وتصغيرها تلقائياً</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function DeliveryBar({ rate }: { rate: number }) {
  const color = rate >= 70 ? "bg-emerald-500" : rate >= 40 ? "bg-amber-500" : "bg-red-500";
  const textColor = rate >= 70 ? "text-emerald-400" : rate >= 40 ? "text-amber-400" : "text-red-400";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">نسبة التسليم</span>
        <span className={`text-xs font-black ${textColor}`}>{rate}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

function CompanyStats({ companyId, canViewFinancials }: { companyId: number; canViewFinancials: boolean }) {
  const { data: stats } = useQuery({
    queryKey: ["company-stats", companyId],
    queryFn: () => manifestsApi.companyStats(companyId),
    staleTime: 30000,
  });
  const { data: shipmentStats } = useQuery({
    queryKey: ["company-shipment-stats", companyId],
    queryFn: () => shipmentManifestsApi.companyStats(companyId),
    staleTime: 30000,
  });
  const { data: manifests } = useQuery({
    queryKey: ["shipping-manifests", companyId],
    queryFn: () => manifestsApi.list(companyId),
    staleTime: 10000,
  });
  const { data: shipmentManifests } = useQuery({
    queryKey: ["shipment-manifests", companyId],
    queryFn: () => shipmentManifestsApi.list(companyId),
    staleTime: 10000,
  });
  const openManifest = manifests?.find(m => m.status === "open") ?? null;
  const openShipmentManifest = shipmentManifests?.find(m => m.status === "open") ?? null;
  // البيان المفتوح الفعلي — نظام الشحنات له الأولوية
  const activeManifest = openShipmentManifest ?? openManifest;
  if (!stats && !shipmentStats) return null;

  // ─── دمج إحصائيات نظام الطلبات (القديم) ونظام الشحنات (الجديد) ─────────────
  const merged = {
    delivered:     (stats?.delivered ?? 0)     + (shipmentStats?.delivered ?? 0),
    partial:       ((stats as any)?.partial ?? 0) + (shipmentStats?.partial ?? 0),
    returned:      (stats?.returned ?? 0)      + (shipmentStats?.returned ?? 0),
    total:         (stats?.total ?? 0)         + (shipmentStats?.total ?? 0),
    netProfit:     (stats?.netProfit ?? 0)     + (shipmentStats?.netProfit ?? 0),
    manifestCount: (stats?.manifestCount ?? 0) + (shipmentStats?.manifestCount ?? 0),
  };
  const deliveryRate = merged.total > 0
    ? Math.round(((merged.delivered + merged.partial) / merged.total) * 100)
    : 0;

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      <DeliveryBar rate={deliveryRate} />
      {/* صف: مسلم | مسلم جزئي | مرتجع */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {/* مسلم */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 relative">
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]" />
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]" />
          <p className="text-[10px] text-emerald-300/70 mb-0.5">مُسلَّم</p>
          <p className="text-sm font-black text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]">{merged.delivered}</p>
        </div>
        {/* مسلم جزئي */}
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-lg p-2 relative">
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_6px_2px_rgba(45,212,191,0.6)]" />
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_6px_2px_rgba(45,212,191,0.6)]" />
          <p className="text-[10px] text-teal-300/70 mb-0.5">مُسلَّم جزئي</p>
          <p className="text-sm font-black text-teal-400 drop-shadow-[0_0_6px_rgba(45,212,191,0.8)]">{merged.partial}</p>
        </div>
        {/* مرتجع */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 relative">
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.6)]" />
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.6)]" />
          <p className="text-[10px] text-red-300/70 mb-0.5">مُرتجَع</p>
          <p className="text-sm font-black text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.8)]">{merged.returned}</p>
        </div>
      </div>
      {/* قسم البيان الحالي */}
      <div className="bg-muted/20 border border-border/40 rounded-lg p-2">
        <p className="text-[10px] text-muted-foreground text-center mb-1.5">البيان الحالي</p>
        {activeManifest ? (
          <div className="space-y-1.5">
            <p className="text-sm font-black text-amber-400 text-center drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]">• {(activeManifest as any).shipmentCount ?? (activeManifest as any).orderCount ?? 0} •</p>
            <div className="grid grid-cols-4 gap-1">
              {/* قيد الانتظار */}
              <div className="flex flex-col items-center bg-blue-500/10 border border-blue-500/20 rounded-lg py-1.5 px-0.5 relative">
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_5px_1px_rgba(96,165,250,0.7)]" />
                <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_5px_1px_rgba(96,165,250,0.7)]" />
                <span className="text-[11px] font-black text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.9)]">{(activeManifest as any).statusCounts?.pending ?? (activeManifest as any).pendingCount ?? 0}</span>
                <span className="text-[7px] text-muted-foreground leading-tight text-center mt-0.5">قيد الانتظار</span>
              </div>
              {/* شحنات مؤجلة */}
              <div className="flex flex-col items-center bg-amber-500/10 border border-amber-500/20 rounded-lg py-1.5 px-0.5 relative">
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_5px_1px_rgba(251,191,36,0.7)]" />
                <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_5px_1px_rgba(251,191,36,0.7)]" />
                <span className="text-[11px] font-black text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.9)]">{(activeManifest as any).statusCounts?.delayed ?? (activeManifest as any).postponedCount ?? 0}</span>
                <span className="text-[7px] text-muted-foreground leading-tight text-center mt-0.5">شحنات مؤجلة</span>
              </div>
              {/* شحنات مرتجعة */}
              <div className="flex flex-col items-center bg-red-500/10 border border-red-500/20 rounded-lg py-1.5 px-0.5 relative">
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-red-400 shadow-[0_0_5px_1px_rgba(248,113,113,0.7)]" />
                <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-red-400 shadow-[0_0_5px_1px_rgba(248,113,113,0.7)]" />
                <span className="text-[11px] font-black text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.9)]">{(activeManifest as any).statusCounts?.returned ?? (activeManifest as any).returnedCount ?? 0}</span>
                <span className="text-[7px] text-muted-foreground leading-tight text-center mt-0.5">شحنات مرتجعة</span>
              </div>
              {/* توصيل جزئي */}
              <div className="flex flex-col items-center bg-teal-500/10 border border-teal-500/20 rounded-lg py-1.5 px-0.5 relative">
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-teal-400 shadow-[0_0_5px_1px_rgba(45,212,191,0.7)]" />
                <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-teal-400 shadow-[0_0_5px_1px_rgba(45,212,191,0.7)]" />
                <span className="text-[11px] font-black text-teal-400 drop-shadow-[0_0_5px_rgba(45,212,191,0.9)]">{(activeManifest as any).statusCounts?.partial ?? (activeManifest as any).partialCount ?? 0}</span>
                <span className="text-[7px] text-muted-foreground leading-tight text-center mt-0.5">مرتجع جزئي</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm font-black text-muted-foreground text-center">—</p>
        )}
      </div>
      {canViewFinancials && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">صافي الربح / الخسارة</span>
          <span className={`font-black ${merged.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {merged.netProfit >= 0 ? <TrendingUp className="inline w-3 h-3 mr-0.5" /> : <TrendingDown className="inline w-3 h-3 mr-0.5" />}
            {formatCurrency(Math.abs(merged.netProfit))}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">عدد البيانات</span>
        <span className="font-bold">{merged.manifestCount}</span>
      </div>
    </div>
  );
}

function CompanyManifests({ company, allCompanies, canShipping }: { company: ShippingCompany; allCompanies: ShippingCompany[]; canShipping: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showBlockedAlert, setShowBlockedAlert] = useState(false);
  const [, navigate] = useLocation();

  const { data: manifests } = useQuery({
    queryKey: ["shipping-manifests", company.id],
    queryFn: () => manifestsApi.list(company.id),
    staleTime: 10000,
  });

  // بيانات شحن الشحنات (النظام الجديد) — نتحقق من وجود بيان مفتوح قبل السماح بإنشاء بيان جديد
  const { data: shipmentManifests } = useQuery({
    queryKey: ["shipment-manifests", company.id],
    queryFn: () => shipmentManifestsApi.list(company.id),
    staleTime: 10000,
  });

  const openManifest = manifests?.find(m => m.status === "open");
  const openShipmentManifest = shipmentManifests?.find(m => m.status === "open");

  const handleNewManifest = () => {
    if (openShipmentManifest) {
      setShowBlockedAlert(true);
    } else {
      setShowNewDialog(true);
    }
  };

  // بعد إنشاء البيان — انقل لصفحة تفاصيل البيان مباشرةً
  const handleManifestCreated = (manifest: { id: number; manifestNumber: string; shipmentCount: number }) => {
    navigate(`/shipping/shipment-manifests/${manifest.id}`);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] gap-1 border-border text-muted-foreground" onClick={() => setExpanded(!expanded)}>
          <FileText className="w-3 h-3" />البيانات
          {expanded ? <ChevronUp className="w-3 h-3 mr-auto" /> : <ChevronDown className="w-3 h-3 mr-auto" />}
        </Button>
        {canShipping && (
          <Button size="sm" className="h-7 text-[11px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold" onClick={handleNewManifest}>
            <PackagePlus className="w-3 h-3" />بيان جديد
          </Button>
        )}
      </div>

      {/* تحذير: يوجد بيان مفتوح */}
      <AlertDialog open={showBlockedAlert} onOpenChange={setShowBlockedAlert}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
              <Clock className="w-5 h-5" />
              لا يمكن إنشاء بيان جديد
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <span className="block">يوجد بيان شحن مفتوح حالياً لشركة <strong>{company.name}</strong>:</span>
              <span className="block font-bold text-foreground">
                {openShipmentManifest?.manifestNumber} — {openShipmentManifest?.shipmentCount} شحنة
              </span>
              <span className="block text-muted-foreground">
                يرجى تقفيل البيان الحالي أولاً قبل إنشاء بيان جديد.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إغلاق</AlertDialogCancel>
            {openShipmentManifest && (
              <AlertDialogAction
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => { setShowBlockedAlert(false); setExpanded(true); }}
              >
                عرض البيان المفتوح
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {expanded && (
        <div className="mt-2 space-y-1.5 max-h-[320px] overflow-y-auto pr-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
          {/* بيانات الشحنات (النظام الجديد) */}
          {shipmentManifests && shipmentManifests.length > 0 && (
            <>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide px-1">بيانات الشحنات</p>
              {shipmentManifests.map(m => (
                <Link key={`sm-${m.id}`} href={`/shipping/shipment-manifests/${m.id}`}>
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors border border-primary/10">
                    <div>
                      <p className="text-xs font-bold">{m.manifestNumber}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(m.createdAt), "yyyy/MM/dd")} · {m.shipmentCount} شحنة</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] font-bold border ${m.status === "open" ? "border-blue-700 bg-blue-900/20 text-blue-400" : "border-emerald-700 bg-emerald-900/20 text-emerald-400"}`}>
                      {m.status === "open" ? "مفتوح" : "مغلق"}
                    </Badge>
                  </div>
                </Link>
              ))}
            </>
          )}
          {/* بيانات الطلبات (النظام القديم) */}
          {manifests && manifests.length > 0 && (
            <>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide px-1 mt-2">بيانات الطلبات</p>
              {manifests.map(m => (
                <Link key={`m-${m.id}`} href={`/shipping/manifests/${m.id}`}>
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors">
                    <div>
                      <p className="text-xs font-bold">{m.manifestNumber}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(m.createdAt), "yyyy/MM/dd")} · {m.orderCount} طلب</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] font-bold border ${m.status === "open" ? "border-blue-700 bg-blue-900/20 text-blue-400" : "border-emerald-700 bg-emerald-900/20 text-emerald-400"}`}>
                      {m.status === "open" ? "مفتوح" : "مغلق"}
                    </Badge>
                  </div>
                </Link>
              ))}
            </>
          )}
          {(!shipmentManifests || shipmentManifests.length === 0) && (!manifests || manifests.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-3">لا توجد بيانات شحن بعد</p>
          )}
        </div>
      )}

      {showNewDialog && (
        <CreateManifestDialog
          company={company}
          allCompanies={allCompanies}
          onClose={() => setShowNewDialog(false)}
          onCreated={handleManifestCreated}
        />
      )}
    </div>
  );
}

export function CreateManifestDialog({
  company,
  allCompanies,
  onClose,
  onCreated,
}: {
  company: ShippingCompany;
  allCompanies: ShippingCompany[];
  onClose: () => void;
  onCreated?: (manifest: { id: number; manifestNumber: string; shipmentCount: number }) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");

  // شحنات قيد الشحن في المخزن فقط (warehouse_ready) — من كل الشركات بدون فلتر
  // ملاحظة: "waiting" = قيد الانتظار (حالة مختلفة تماماً) — مش المقصود هنا
  const { data, isLoading } = useQuery({
    queryKey: ["shipments-available-for-manifest", "warehouse_ready"],
    queryFn: () => shipmentsApi.list({ status: "warehouse_ready", limit: 500 }),
  });

  const allCompanyShipments = data?.data ?? [];

  // فلتر صارم على المستوى ده: الباك إند بيوسّع "warehouse_ready" ليشمل "picked_up" برضه
  // (alias قديم لأغراض تانية)، فلازم نتأكد إننا بنعرض فقط الشحنات اللي لسه فعلياً
  // "قيد الشحن في المخزن" ولسه ماتسلمتش من شركة الشحن.
  const availableShipmentsAllZones = (allCompanyShipments as Shipment[]).filter(
    (s) => s.status === "warehouse_ready"
  );

  // فلترة على مناطق المندوب (zoneIds) — لو المندوب محدد له مناطق تغطية،
  // بنعرض بس الشحنات اللي منطقتها ضمن المناطق دي. لو مفيش مناطق محددة للمندوب،
  // بنعرض كل الشحنات المتاحة زي ما كان (بدون فلتر) عشان مايتقفلش الفلو على مناديب قدامى.
  const companyZoneIds = useMemo(() => {
    const raw = company.zoneIds;
    if (!raw) return null;
    if (Array.isArray(raw)) return new Set(raw.map((z) => Number(z)));
    try {
      const parsed = JSON.parse(raw as string);
      if (Array.isArray(parsed)) return new Set(parsed.map((z) => Number(z)));
    } catch {
      // raw مش JSON — تجاهل
    }
    return null;
  }, [company.zoneIds]);

  const availableShipments = useMemo(() => {
    if (!companyZoneIds || companyZoneIds.size === 0) return availableShipmentsAllZones;
    // الشحنات اللي معاها zoneId بنفلترها على مناطق المندوب.
    // الشحنات اللي مفيش zoneId مسجل ليها (قديمة أو اتعملت من غير تحديد منطقة)
    // بنسيبها تظهر برضو مؤقتاً — عشان ما تختفيش شحنات فعلية من البيان.
    return availableShipmentsAllZones.filter(
      (s) => s.zoneId == null || companyZoneIds.has(Number(s.zoneId))
    );
  }, [availableShipmentsAllZones, companyZoneIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableShipments;
    const q = search.toLowerCase();
    return availableShipments.filter((s: Shipment) =>
      s.receiverName?.toLowerCase().includes(q) ||
      s.shipmentNumber?.toLowerCase().includes(q) ||
      (s.receiverPhone && s.receiverPhone.includes(q)) ||
      (s.trackingNumber && s.trackingNumber.toLowerCase().includes(q)) ||
      (s.receiverCity && s.receiverCity.toLowerCase().includes(q))
    );
  }, [availableShipments, search]);

  const toggleAll = () => {
    if (filtered.length > 0 && filtered.every((s: Shipment) => selectedIds.has(s.id))) {
      const next = new Set(selectedIds);
      filtered.forEach((s: Shipment) => next.delete(s.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach((s: Shipment) => next.add(s.id));
      setSelectedIds(next);
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["shipment-manifests", company.id] });
    queryClient.invalidateQueries({ queryKey: ["shipments-available-for-manifest", "waiting"] });
    queryClient.invalidateQueries({ queryKey: ["company-shipments", company.id] });
    queryClient.invalidateQueries({ queryKey: ["company-stats", company.id] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      try {
        return await shipmentManifestsApi.create({
          shippingCompanyId: company.id,
          shipmentIds: Array.from(selectedIds),
          notes: notes.trim() || undefined,
        });
      } catch (err: any) {
        // 409 = يوجد بيان مفتوح → أضف الشحنات له تلقائياً
        if (err?.status === 409 || err?.message?.includes("409") || err?.message?.includes("مفتوح")) {
          const manifests = await shipmentManifestsApi.list(company.id);
          const openManifest = manifests.find((m: any) => m.status === "open");
          if (!openManifest) throw err;
          const result = await shipmentManifestsApi.addShipments(openManifest.id, Array.from(selectedIds));
          // نرجع شكل مشابه لـ create response عشان onSuccess يشتغل
          return {
            id: openManifest.id,
            manifestNumber: openManifest.manifestNumber,
            shipmentCount: result.added,
            _addedToExisting: true,
          } as any;
        }
        throw err;
      }
    },
    onSuccess: (manifest: any) => {
      invalidateAll();
      if (manifest._addedToExisting) {
        toast({
          title: "تمت الإضافة للبيان المفتوح",
          description: `${manifest.manifestNumber} — أُضيف ${manifest.shipmentCount} شحنة للبيان الموجود`,
        });
      } else {
        toast({ title: "تم إنشاء البيان", description: `${manifest.manifestNumber} — ${manifest.shipmentCount} شحنة` });
      }
      if (onCreated) onCreated(manifest);
      else onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border w-[94vw] sm:w-full max-w-3xl max-h-[90vh] flex flex-col p-4 sm:p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2 pr-8 text-base sm:text-lg">
            <Truck className="w-4 h-4 text-primary shrink-0" />
            إنشاء بيان شحن جديد
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-right truncate pr-8">{company.name}</p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 mt-2">
          {/* Search + counter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم / رقم الشحنة / الهاتف..."
                className="h-9 text-sm bg-background pr-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!isLoading && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {availableShipments.length} شحنة متاحة
              </span>
            )}
          </div>

          {/* Select-all row */}
          {!isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((s: Shipment) => selectedIds.has(s.id))}
                  onCheckedChange={toggleAll}
                />
                <span className="text-xs text-muted-foreground">
                  تحديد الكل ({filtered.length} شحنة)
                </span>
              </div>
              <span className="text-xs font-bold text-primary">
                {selectedIds.size} شحنة محددة
              </span>
            </div>
          )}

          {/* Shipments table */}
          <div className="overflow-y-auto flex-1 border border-border rounded-md">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">
                جاري تحميل الشحنات...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">
                  {availableShipments.length === 0
                    ? allCompanyShipments.length === 0
                      ? "لا توجد شحنات حالياً — يمكنك إضافة شحنات جديدة من قسم الشحنات"
                      : availableShipmentsAllZones.length === 0
                        ? "لا توجد شحنات قيد الشحن في المخزن جاهزة للبيان — باقي الشحنات في حالات أخرى (مؤكدة / تم الاستلام / قيد الشحن / تم التسليم...)"
                        : "لا توجد شحنات في مناطق تغطية هذا المندوب حالياً"
                    : "لا توجد نتائج تطابق البحث"}
                </p>
              </div>
            ) : (
              <>
                {/* Table header — desktop only */}
                <div className="hidden sm:grid sm:grid-cols-[auto_2fr_1fr_100px_120px] gap-0 border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold text-muted-foreground sticky top-0">
                  <div className="w-5" />
                  <div className="pr-2">المستلم</div>
                  <div className="pr-2">المدينة</div>
                  <div className="text-center">إجمالي الشحنة</div>
                  <div className="text-center">الحالة</div>
                </div>
                {/* Rows */}
                {filtered.map((s: Shipment) => {
                  const isSelected = selectedIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => toggleOne(s.id)}
                      className={`border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/8" : ""}`}
                    >
                      {/* Desktop row */}
                      <div className="hidden sm:grid sm:grid-cols-[auto_2fr_1fr_100px_120px] gap-0 items-center px-3 py-2.5">
                        <div className="w-5 flex items-center">
                          <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                        </div>
                        {/* Receiver */}
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold truncate">{s.receiverName}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <span className="font-mono text-primary/70">{s.shipmentNumber}</span>
                            {s.receiverPhone && (
                              <span className="text-muted-foreground/70">· {s.receiverPhone}</span>
                            )}
                          </p>
                        </div>
                        {/* City */}
                        <div className="min-w-0 pr-2">
                          <p className="text-xs truncate">{s.receiverCity || "—"}</p>
                        </div>
                        {/* Total value */}
                        <div className="text-center text-xs font-bold">
                          {formatCurrency(Number(s.codAmount ?? s.totalAmount ?? 0) + Number(s.shippingFee ?? 0))}
                        </div>
                        {/* Status */}
                        <div className="flex justify-center">
                          <Badge variant="outline" className="text-[8px] font-bold border px-1 py-0.5 text-center leading-tight whitespace-normal text-wrap max-w-[115px]">
                            {SHIPMENT_STATUS_LABELS_LOCAL[s.status] ?? s.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Mobile card */}
                      <div className="flex sm:hidden items-start gap-2.5 px-3 py-3">
                        <div className="pt-0.5 shrink-0">
                          <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold truncate">{s.receiverName}</p>
                            <Badge variant="outline" className="text-[9px] font-bold border shrink-0">
                              {SHIPMENT_STATUS_LABELS_LOCAL[s.status] ?? s.status}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                            <span className="font-mono text-primary/70">{s.shipmentNumber}</span>
                            {s.receiverPhone && (
                              <span className="text-muted-foreground/70">· {s.receiverPhone}</span>
                            )}
                          </p>
                          <div className="flex items-center justify-between gap-2 text-[11px] pt-0.5">
                            <span className="text-muted-foreground truncate">{s.receiverCity || "—"}</span>
                            <span className="font-bold shrink-0">{formatCurrency(Number(s.codAmount ?? s.totalAmount ?? 0) + Number(s.shippingFee ?? 0))}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs mb-1.5 block">ملاحظات (اختياري)</Label>
            <Textarea
              placeholder="ملاحظات على البيان..."
              className="min-h-[50px] text-sm resize-none bg-background"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="w-full sm:flex-1 h-10 sm:h-9 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => createMutation.mutate()}
              disabled={selectedIds.size === 0 || createMutation.isPending}
            >
              {createMutation.isPending
                ? "جاري الإنشاء..."
                : `إنشاء البيان (${selectedIds.size} شحنة)`}
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto h-10 sm:h-9 text-sm border-border"
              onClick={onClose}
            >
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── RepresentativeDialog — إنشاء/تحديث حساب دخول المندوب ──────────────────
function RepresentativeDialog({
  companyId,
  companyName,
  mode = "account",
  onClose,
}: {
  companyId: number;
  companyName: string;
  /** account = إنشاء/تحديث الحساب | password = تغيير الباسورد فقط */
  mode?: "account" | "password";
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPass, setShowPass] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["rep-account", companyId],
    queryFn: () => apiFetch(`/shipping-companies/${companyId}/representative`).catch(() => null),
  });
  const rep = existing as any;
  const isEdit = !!rep;

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/shipping-companies/${companyId}/representative`, {
      method: "POST",
      body: JSON.stringify({
        username: username || rep?.username,
        password: password || undefined,
        displayName: displayName || undefined,
      }),
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["rep-account", companyId] });
      toast({ title: data.created ? "✅ تم إنشاء حساب المندوب" : "✅ تم تحديث حساب المندوب" });
      onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // وضع تغيير الباسورد فقط
  if (mode === "password") {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-card border-border max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="w-4 h-4 text-primary" />
              تغيير كلمة مرور المندوب
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{companyName}</p>
          </DialogHeader>
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">جاري التحقق...</p>
          ) : !rep ? (
            <div className="rounded-lg bg-amber-900/20 border border-amber-500/30 p-3 text-xs text-amber-400 mt-2">
              لا يوجد حساب دخول لهذا المندوب بعد. قم بإنشاء الحساب أولاً.
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs text-muted-foreground">
                الحساب: <strong className="text-foreground">{rep.username}</strong>
              </div>
              <div>
                <Label className="text-xs mb-1 block">كلمة المرور الجديدة *</Label>
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    placeholder="6 أحرف على الأقل"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-8 text-sm bg-background pl-8"
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute left-2 top-1.5 text-muted-foreground hover:text-foreground">
                    <KeyRound className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 h-8 text-xs font-bold bg-primary text-primary-foreground"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || !password || password.length < 6}
                >
                  {mutation.isPending ? "جاري الحفظ..." : "تغيير كلمة المرور"}
                </Button>
                <Button variant="outline" className="h-8 text-xs border-border" onClick={onClose}>إلغاء</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // وضع إنشاء/تحديث الحساب (الافتراضي)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-4 h-4 text-primary" />
            {isEdit ? "تحديث حساب المندوب" : "إنشاء حساب دخول للمندوب"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{companyName}</p>
        </DialogHeader>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-4">جاري التحقق...</p>
        ) : (
          <div className="space-y-3 mt-2">
            {isEdit && (
              <div className="rounded-lg bg-emerald-900/20 border border-emerald-500/30 p-3 text-xs text-emerald-400">
                حساب موجود: <strong>{rep.username}</strong> — آخر تحديث: {rep.updatedAt ? new Date(rep.updatedAt).toLocaleDateString("ar-EG") : "—"}
              </div>
            )}
            <div>
              <Label className="text-xs mb-1 block">اسم المستخدم {isEdit && "(اتركه فارغاً للإبقاء)"}</Label>
              <Input
                placeholder={rep?.username ?? "مثال: courier_ahmed"}
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                className="h-8 text-sm bg-background"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">{isEdit ? "كلمة مرور جديدة (اتركها فارغة للإبقاء)" : "كلمة المرور *"}</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="6 أحرف على الأقل"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-8 text-sm bg-background pl-8"
                  dir="ltr"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute left-2 top-1.5 text-muted-foreground hover:text-foreground">
                  <KeyRound className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">الاسم المعروض (اختياري)</Label>
              <Input
                placeholder={rep?.displayName ?? companyName}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="h-8 text-sm bg-background"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 h-8 text-xs font-bold bg-primary text-primary-foreground"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || (!isEdit && (!username || !password))}
              >
                {mutation.isPending ? "جاري الحفظ..." : isEdit ? "تحديث" : "إنشاء الحساب"}
              </Button>
              <Button variant="outline" className="h-8 text-xs border-border" onClick={onClose}>إلغاء</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ===== END MERGED BLOCK =====


// ─── NAV ITEMS definition ─────────────────────────────────────────────────────
export type TabId = "home" | "performance" | "shipments" | "manifests" | "tasks" | "profile";
export const NAV_ITEMS: { id: TabId; label: string; sublabel: string; Icon: React.ElementType; activeColor: string; activeBg: string; glowColor: string }[] = [
  {
    id: "home",
    label: "الرئيسية",
    sublabel: "نظرة عامة",
    Icon: LayoutDashboard,
    activeColor: "text-primary",
    activeBg: "bg-primary/15 border-primary/30",
    glowColor: "rgba(34,197,94,0.35)",
  },
  {
    id: "performance",
    label: "أدائي",
    sublabel: "الإحصائيات",
    Icon: TrendingUp,
    activeColor: "text-violet-400",
    activeBg: "bg-violet-500/15 border-violet-500/30",
    glowColor: "rgba(139,92,246,0.35)",
  },
  {
    id: "shipments",
    label: "الشحنات",
    sublabel: "قائمة الطلبات",
    Icon: Package,
    activeColor: "text-sky-400",
    activeBg: "bg-sky-500/15 border-sky-500/30",
    glowColor: "rgba(14,165,233,0.35)",
  },
  {
    id: "manifests",
    label: "البيانات",
    sublabel: "بيانات الشحن",
    Icon: ClipboardList,
    activeColor: "text-emerald-400",
    activeBg: "bg-emerald-500/15 border-emerald-500/30",
    glowColor: "rgba(52,211,153,0.35)",
  },
  {
    id: "tasks",
    label: "مهامي",
    sublabel: "قائمة اليوم",
    Icon: ListChecks,
    activeColor: "text-orange-400",
    activeBg: "bg-orange-500/15 border-orange-500/30",
    glowColor: "rgba(249,115,22,0.35)",
  },
];

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────
function DesktopSidebar({
  active, onSelect, company, user: u, d, open, onToggle, onClose,
}: {
  active: TabId; onSelect: (t: TabId) => void;
  company: any; user: any; d: any;
  open: boolean; onToggle: () => void; onClose: () => void;
}) {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const activeItem = NAV_ITEMS.find(n => n.id === active)!;
  return (
    <>
      {/* Overlay — يظهر لما الـ sidebar مفتوح */}
      {open && (
        <div
          className="hidden md:block fixed inset-0 z-30"
          onClick={onClose}
        />
      )}

      {/* Collapsed rail — يظهر لما الـ sidebar مقفول: أيقونات التابات واضحة + زرار فتح */}
      {!open && (
        <div
          className="hidden md:flex fixed right-3 top-3 bottom-3 z-40 flex-col items-center py-4 gap-2 w-[64px] rounded-[26px] cursor-pointer"
          style={{
            background: "rgba(20,20,26,0.68)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.06) inset",
          }}
          onClick={onToggle}
        >
          {/* Logo/Brand mini */}
          <div className="mb-2">
            {company?.logo
              ? <img src={company.logo} className="w-9 h-9 rounded-2xl object-cover border border-white/10 shadow" alt="" />
              : (
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/20 flex items-center justify-center shadow">
                  <Truck className="w-[18px] h-[18px] text-primary" />
                </div>
              )}
          </div>

          {/* Nav icons */}
          <div className="flex-1 flex flex-col gap-1.5">
            {NAV_ITEMS.map(item => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={(e) => { e.stopPropagation(); onSelect(item.id); }}
                  title={item.label}
                  className="relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300"
                >
                  {isActive && (
                    <span className="absolute inset-0 rounded-2xl transition-all duration-300"
                      style={{
                        background: item.glowColor.replace("0.35", "0.18"),
                        boxShadow: `0 0 0 1px ${item.glowColor.replace("0.35", "0.28")} inset, 0 0 16px ${item.glowColor}`,
                      }} />
                  )}
                  <item.Icon className={`relative w-5 h-5 transition-all duration-300 ${isActive ? item.activeColor : "text-white/50 hover:text-white/80"}`} />
                </button>
              );
            })}
          </div>

          {/* Open toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="w-11 h-9 rounded-2xl flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/[0.06] transition-all"
            title="فتح القائمة"
          >
            <ChevronLeft className="w-[18px] h-[18px]" />
          </button>

          {/* Theme toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
            className="w-11 h-9 rounded-2xl flex items-center justify-center transition-all active:scale-90"
            title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
            style={{
              background: theme === "dark" ? "linear-gradient(135deg,#1e3a5f,#0f172a)" : "linear-gradient(135deg,#fbbf24,#f59e0b)",
              boxShadow: theme === "dark" ? "0 0 8px rgba(96,165,250,0.35)" : "0 0 8px rgba(251,191,36,0.5)",
            }}
          >
            {theme === "dark" ? <Moon className="w-4 h-4 text-blue-300" /> : <Sun className="w-4 h-4 text-white" />}
          </button>

          {/* Logout */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); setConfirmingLogout(true); }}
            className="w-11 h-9 rounded-2xl flex items-center justify-center text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="تسجيل خروج"
          >
            <LogOut className="w-[17px] h-[17px]" />
          </button>
        </div>
      )}

    <aside
      dir="rtl"
      className={`hidden md:flex flex-col w-64 shrink-0 h-[calc(100vh-24px)] fixed right-3 top-3 z-40 overflow-y-auto rounded-[26px] transition-all duration-300 ${open ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+12px)] opacity-0"}`}
      style={{
        background: "rgba(20,20,26,0.72)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.06) inset",
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Brand ── */}
      <div className="px-4 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          {company?.logo
            ? <img src={company.logo} className="w-10 h-10 rounded-2xl object-cover border border-white/10 shadow" alt="" />
            : (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/20 flex items-center justify-center shadow">
                <Truck className="w-5 h-5 text-primary" />
              </div>
            )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black truncate leading-tight">{company?.name ?? u?.displayName ?? "المندوب"}</p>
            <p className="text-[10px] text-muted-foreground">بوابة المندوب</p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 active:scale-90"
            style={{
              background: theme === "dark" ? "linear-gradient(135deg,#1e3a5f,#0f172a)" : "linear-gradient(135deg,#fbbf24,#f59e0b)",
              boxShadow: theme === "dark" ? "0 0 8px rgba(96,165,250,0.35)" : "0 0 8px rgba(251,191,36,0.5)",
            }}
          >
            {theme === "dark" ? <Moon className="w-4 h-4 text-blue-300" /> : <Sun className="w-4 h-4 text-white" />}
          </button>
        </div>

        {/* delivery rate pill */}
        {d && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border px-3 py-2"
            style={{
              background: d.deliveryRate >= 70 ? "rgba(52,211,153,0.08)" : d.deliveryRate >= 40 ? "rgba(251,191,36,0.08)" : "rgba(248,113,113,0.08)",
              borderColor: d.deliveryRate >= 70 ? "rgba(52,211,153,0.3)" : d.deliveryRate >= 40 ? "rgba(251,191,36,0.3)" : "rgba(248,113,113,0.3)",
            }}>
            <ShieldCheck className="w-3.5 h-3.5 shrink-0"
              style={{ color: d.deliveryRate >= 70 ? "#34d399" : d.deliveryRate >= 40 ? "#fbbf24" : "#f87171" }} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground leading-none mb-0.5">نسبة التسليم</p>
              <p className="text-sm font-black leading-none"
                style={{ color: d.deliveryRate >= 70 ? "#34d399" : d.deliveryRate >= 40 ? "#fbbf24" : "#f87171" }}>
                {d.deliveryRate}%
              </p>
            </div>
            {d.highReturnRisk && (
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            )}
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="relative w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-right transition-all duration-300 group"
            >
              {isActive && (
                <span className="absolute inset-0 rounded-2xl transition-all duration-300"
                  style={{
                    background: item.glowColor.replace("0.35", "0.14"),
                    boxShadow: `0 0 0 1px ${item.glowColor.replace("0.35", "0.24")} inset`,
                  }} />
              )}
              {/* Icon bubble */}
              <span className={`relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                isActive ? "bg-white/10" : "bg-white/[0.04] group-hover:bg-white/[0.08]"
              }`}>
                <item.Icon className={`w-4 h-4 ${isActive ? item.activeColor : "text-white/50 group-hover:text-white/80"}`} />
              </span>
              <div className="relative min-w-0 text-right">
                <p className={`text-sm font-bold leading-tight ${isActive ? item.activeColor : "text-white/70 group-hover:text-white/90"}`}>{item.label}</p>
                <p className="relative text-[10px] opacity-50 leading-none mt-0.5">{item.sublabel}</p>
              </div>
              {isActive && (
                <span className="relative mr-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "currentColor" }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] space-y-1.5">
        {confirmingLogout ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-3 space-y-2.5">
            <p className="text-[11px] text-red-300/90 text-center font-bold">متأكد إنك عايز تسجل خروج؟</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingLogout(false)}
                className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white/60 hover:text-white/90 bg-white/[0.04] hover:bg-white/[0.08] transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={() => logout()}
                className="flex-1 py-2 rounded-xl text-[11px] font-black text-white bg-red-500/90 hover:bg-red-500 transition-all shadow-lg shadow-red-950/30"
              >
                تأكيد الخروج
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingLogout(true)}
            className="group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-right overflow-hidden border border-red-500/[0.14] bg-red-500/[0.04] hover:bg-red-500/[0.09] hover:border-red-500/25 transition-all duration-300"
          >
            <span className="relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10 border border-red-500/20 group-hover:bg-red-500/15 transition-all duration-300">
              <LogOut className="w-4 h-4 text-red-400" />
            </span>
            <span className="text-[13px] font-bold text-red-400/90 group-hover:text-red-400">تسجيل خروج</span>
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
        >
          <ChevronRight className="w-3 h-3" /> إغلاق القائمة
        </button>
      </div>
    </aside>
    </>
  );
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────
export function MobileBottomNav({ active, onSelect }: { active: TabId; onSelect: (t: TabId) => void }) {
  const activeIndex = NAV_ITEMS.findIndex(n => n.id === active);
  return (
    <nav
      dir="rtl"
      className="md:hidden fixed bottom-0 right-0 left-0 z-50 flex justify-center px-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
    >
      <div
        className="flex items-stretch gap-0.5 rounded-[26px] px-1.5 py-1.5 w-full max-w-md"
        style={{
          background: "rgba(20,20,26,0.72)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.06) inset",
        }}
      >
        {NAV_ITEMS.map((item, i) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="relative flex-1 flex flex-col items-center justify-center py-2 gap-1 rounded-[20px] transition-all duration-300"
            >
              {isActive && (
                <span
                  className="absolute inset-0 rounded-[20px] transition-all duration-300"
                  style={{
                    background: item.glowColor.replace("0.35", "0.16"),
                    boxShadow: `0 0 0 1px ${item.glowColor.replace("0.35", "0.25")} inset`,
                  }}
                />
              )}
              <span className="relative flex items-center justify-center transition-transform duration-300"
                style={{ transform: isActive ? "translateY(-1px) scale(1.05)" : "none" }}>
                <item.Icon className={`w-[19px] h-[19px] transition-colors duration-300 ${isActive ? item.activeColor : "text-muted-foreground/70"}`} />
              </span>
              <span className={`relative text-[9.5px] font-bold transition-all duration-300 ${isActive ? item.activeColor : "text-muted-foreground/70"}`}
                style={{ opacity: isActive ? 1 : 0.85 }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── HOME TAB — النظرة العامة (تصميم الداشبورد الجديد) ───────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── هيدر بطاقة قابل للطي (زرار سهم للطي/الفتح + زرار "الكل" اختياري) ────────
function CollapsibleCardHeader({
  icon: Icon, iconColor, title, collapsed, onToggleCollapse, actionLabel, onAction,
}: {
  icon: React.ElementType; iconColor: string; title: string;
  collapsed: boolean; onToggleCollapse: () => void;
  actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div className="px-4 pt-3 pb-2 border-b border-border/50 flex items-center justify-between gap-2">
      <button onClick={onToggleCollapse} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? "-rotate-90" : "rotate-90"}`} />
      </button>
      <p className="text-xs font-bold flex items-center gap-1.5 flex-1">
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} /> {title}
      </p>
      {actionLabel && (
        <button onClick={onAction} className="text-[10px] text-muted-foreground hover:text-primary transition-colors shrink-0">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─── 1) بطاقة ملخص المهام اليومية ─────────────────────────────────────────────
function TasksSummaryCard({ allShipments, onNavigate }: { allShipments: any[]; onNavigate: (t: TabId) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const today = new Date().toDateString();
  const todayShipments = allShipments.filter(s => s.createdAt && new Date(s.createdAt).toDateString() === today);
  const delivered = todayShipments.filter(s => s.status === "delivered" || s.status === "partial_received").length;
  const inProgress = todayShipments.filter(s => !["delivered", "returned", "cancelled", "partial_received"].includes(s.status)).length;
  const returned = todayShipments.filter(s => s.status === "returned").length;
  const total = todayShipments.length;

  // أحدث 10 شحنات النهاردة، بترتيب تنازلي
  const recent = [...todayShipments]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 10);

  const statusDot = (status: string) => {
    if (status === "delivered" || status === "partial_received") return "bg-emerald-500";
    if (status === "returned") return "bg-red-500";
    if (status === "delayed") return "bg-amber-500";
    return "bg-primary";
  };

  const numberBadgeCls = (status: string) => {
    if (status === "delivered" || status === "partial_received") return "bg-emerald-500/15 text-emerald-400";
    if (status === "returned") return "bg-red-500/15 text-red-400";
    if (status === "delayed") return "bg-amber-500/15 text-amber-400";
    return "bg-primary/15 text-primary";
  };

  return (
    <div className="rounded-2xl border bg-card/60 overflow-hidden flex flex-col h-full">
      <CollapsibleCardHeader
        icon={ListChecks} iconColor="text-primary" title="ملخص المهام اليومية"
        collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)}
        actionLabel="الكل" onAction={() => onNavigate("tasks")}
      />

      {!collapsed && (
        <>
          <div className="p-4 pb-2">
            <p className="text-[11px] text-muted-foreground mb-1">شحنات اليوم</p>
            <p className="text-4xl font-black text-foreground leading-none">{total}</p>
          </div>

          {/* KPI pills */}
          <div className="px-4 grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-2 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">تم التسليم</p>
              <p className="text-base font-black text-blue-400">{delivered}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">قيد التوصيل</p>
              <p className="text-base font-black text-emerald-400">{inProgress}</p>
            </div>
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-2 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">مرتجعة</p>
              <p className="text-base font-black text-red-400">{returned}</p>
            </div>
          </div>

          {/* قائمة شحنات اليوم */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5 max-h-72">
            {recent.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">لا توجد شحنات اليوم</p>
            )}
            {recent.map((s, i) => (
              <div key={s.id ?? i} className="flex items-center gap-2 text-[11px] py-1">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold ${numberBadgeCls(s.status)}`}>
                  {i + 1}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(s.status)}`} />
                <span className="truncate flex-1 text-foreground/90">{s.receiverCity || s.receiverName || "—"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 2) بطاقة التحصيل المالي (COD) ────────────────────────────────────────────
function CodSummaryCard({ d, allShipments, onNavigate }: { d: any; allShipments: any[]; onNavigate: (t: TabId) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const totalCollected = d?.totalCollected ?? 0;
  // المطلوب المتبقي = COD بتاع الشحنات الغير متحصلة بعد (قيد التوصيل / مؤجلة)
  const pendingCod = allShipments
    .filter(s => !["delivered", "partial_received", "returned", "cancelled"].includes(s.status))
    .reduce((sum, s) => sum + Number(s.codAmount ?? 0), 0);

  // آخر 4 شحنات تم تحصيلها فعليًا، كسجل "تاريخ التحصيل"
  // المبلغ المعروض = collectedAmount الفعلي (زي تاب الشحنات)، مع fallback على codAmount لو مش متسجل
  const lastCollected = [...allShipments]
    .filter(s => s.status === "delivered" || s.status === "partial_received")
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 4)
    .map(s => ({
      ...s,
      displayAmount: Number(s.collectedAmount) > 0 ? Number(s.collectedAmount) : Number(s.codAmount ?? 0),
    }));

  return (
    <div className="rounded-2xl border bg-card/60 overflow-hidden flex flex-col h-full">
      <CollapsibleCardHeader
        icon={DollarSign} iconColor="text-emerald-400" title="التحصيل والمالية (COD)"
        collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)}
      />

      {!collapsed && (
        <>
          <div className="p-4 pb-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">إجمالي المحصل اليوم</p>
              <p className="text-lg font-black text-emerald-400 leading-tight">{formatCurrency(totalCollected)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">المطلوب المتبقي</p>
              <p className="text-lg font-black text-amber-400 leading-tight">{formatCurrency(pendingCod)}</p>
            </div>
          </div>

          {/* تاريخ التحصيل الأخير */}
          <div className="px-4 py-2">
            <p className="text-[10px] text-muted-foreground mb-2">تاريخ التحصيل الأخير</p>
            <div className="space-y-1.5">
              {lastCollected.length === 0 && (
                <p className="text-[11px] text-muted-foreground/70 text-center py-2">لا يوجد تحصيل بعد</p>
              )}
              {lastCollected.map((s, i) => (
                <div key={s.id ?? i} className="flex items-center justify-between text-[11px] border-b border-border/30 pb-1.5 last:border-0">
                  <span className="font-mono text-primary/70 shrink-0">{s.shipmentNumber ?? s.id}</span>
                  <span className="text-muted-foreground truncate mx-2 flex-1 text-center">
                    {s.createdAt ? format(new Date(s.createdAt), "dd/MM/yyyy", { locale: ar }) : "—"}
                  </span>
                  <span className="font-bold text-emerald-400 shrink-0">{formatCurrency(s.displayAmount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 pb-4 mt-auto">
            <button
              onClick={() => onNavigate("shipments")}
              className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
            >
              تاريخ التحصيل
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 2.5) بطاقة محفظتي (سجل تصفية البيانات المُقفلة) ─────────────────────────
// كل بيان يقفله المندوب بنفسه، القيمة المستحقة منه (COD بعد خصم تكلفة الشحن)
// بتتصفّر فورًا وتتسجل هنا كـ "تصفية". الرصيد الحالي (غير المُقفل) موجود في
// كارت "التحصيل والمالية" فوق — الكارت ده أرشيف بس لتاريخ التصفيات.
function WalletHistoryCard() {
  const [collapsed, setCollapsed] = useState(false);
  const { data: wallet } = useQuery({
    queryKey: ["rep-wallet"],
    queryFn: () => apiFetch(`/representative/wallet`),
  });

  const transactions = wallet?.transactions ?? [];
  const totalSettled = wallet?.totalSettled ?? 0;

  return (
    <div className="rounded-2xl border bg-card/60 overflow-hidden flex flex-col h-full">
      <CollapsibleCardHeader
        icon={Wallet} iconColor="text-teal-400" title="محفظتي"
        collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)}
      />

      {!collapsed && (
        <>
          <div className="p-4 pb-2">
            <p className="text-[10px] text-muted-foreground mb-1">إجمالي المُصفّى (كل الوقت)</p>
            <p className="text-lg font-black text-teal-400 leading-tight">{formatCurrency(totalSettled)}</p>
          </div>

          <div className="px-4 py-2">
            <p className="text-[10px] text-muted-foreground mb-2">آخر التصفيات</p>
            <div className="space-y-1.5">
              {transactions.length === 0 && (
                <p className="text-[11px] text-muted-foreground/70 text-center py-2">لا يوجد بيانات مُقفلة بعد</p>
              )}
              {transactions.slice(0, 4).map((t: any, i: number) => (
                <div key={t.id ?? i} className="flex items-center justify-between text-[11px] border-b border-border/30 pb-1.5 last:border-0">
                  <span className="font-mono text-primary/70 shrink-0">{t.manifestNumber}</span>
                  <span className="text-muted-foreground truncate mx-2 flex-1 text-center">
                    {t.createdAt ? format(new Date(t.createdAt), "dd/MM/yyyy", { locale: ar }) : "—"}
                  </span>
                  <span className="font-bold text-teal-400 shrink-0">{formatCurrency(Number(t.amount ?? 0))}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 3) بطاقة أدائي (معدل النجاح + تقييم العملاء + سجل الحوافز) ──────────────
function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3 h-3 ${i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

// ─── رسم موجي بسيط (Area Chart) بدون مكتبات خارجية ────────────────────────────
function MiniAreaChart({ data }: { data: { label: string; rate: number }[] }) {
  const w = 140; const h = 56; const pad = 4;
  const maxVal = Math.max(...data.map(d => d.rate), 10);
  const stepX = (w - pad * 2) / (data.length - 1 || 1);

  const points = data.map((d, i) => ({
    x: pad + i * stepX,
    y: h - pad - (d.rate / maxVal) * (h - pad * 2),
  }));

  // مسار منحني ناعم باستخدام نقاط تحكم بسيطة (Catmull-Rom-ish)
  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const midX = (prev.x + p.x) / 2;
    return `${acc} Q ${midX} ${prev.y} ${midX} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`;
  }, "");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;

  return (
    <div className="flex flex-col items-center">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <defs>
          <linearGradient id="miniAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#miniAreaGradient)" />
        <path d={linePath} fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between w-full mt-1" style={{ maxWidth: w }}>
        {data.map((d, i) => (
          <span key={i} className="text-[8px] text-muted-foreground flex-1 text-center">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

function MyPerformanceCard({ d, allShipments, onNavigate }: { d: any; allShipments: any[]; onNavigate: (t: TabId) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const overallRate = d?.deliveryRate ?? 0;

  // معدل يومي لآخر 7 أيام: نسبة تسليم كل يوم
  const dailyRates = Array.from({ length: 7 }).map((_, idx) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - idx));
    const dayKey = day.toDateString();
    const dayShipments = allShipments.filter(s => s.createdAt && new Date(s.createdAt).toDateString() === dayKey);
    const delivered = dayShipments.filter(s => s.status === "delivered" || s.status === "partial_received").length;
    const rate = dayShipments.length > 0 ? Math.round((delivered / dayShipments.length) * 100) : 0;
    return { label: format(day, "EEEEEE", { locale: ar }), rate };
  });

  const ratingsAvg = d?.ratingsAvg ?? null;
  const recentRatings: any[] = d?.recentRatings ?? [];

  const r = 30; const c = 2 * Math.PI * r;
  const fill = (overallRate / 100) * c;
  const ringColor = overallRate >= 70 ? "#34d399" : overallRate >= 40 ? "#fbbf24" : "#f87171";

  return (
    <div className="rounded-2xl border bg-card/60 overflow-hidden flex flex-col h-full">
      <CollapsibleCardHeader
        icon={Activity} iconColor="text-primary" title="أدائي"
        collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)}
      />

      {!collapsed && (
        <>
          <div className="p-4 grid grid-cols-2 gap-3">
            {/* معدل النجاح الإجمالي */}
            <div className="flex flex-col items-center justify-center">
              <p className="text-[10px] text-muted-foreground mb-2">معدل النجاح الإجمالي</p>
              <div className="relative w-20 h-20">
                <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                  <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--muted))" strokeOpacity="0.25" strokeWidth="7" />
                  <circle cx="40" cy="40" r={r} fill="none" stroke={ringColor} strokeWidth="7"
                    strokeLinecap="round" strokeDasharray={`${fill} ${c}`} style={{ transition: "stroke-dasharray 1s ease" }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black" style={{ color: ringColor }}>{overallRate}%</span>
                </div>
              </div>
            </div>

            {/* معدل النجاح اليومي — area chart موجي */}
            <div className="flex flex-col">
              <p className="text-[10px] text-muted-foreground mb-2 text-center">معدل النجاح اليومي</p>
              <MiniAreaChart data={dailyRates} />
            </div>
          </div>

          {/* تقييم العملاء */}
          <div className="px-4 pb-2">
            <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400" /> تقييم العملاء
              {ratingsAvg != null && <span className="font-bold text-foreground/80">({ratingsAvg})</span>}
            </p>
            <div className="space-y-2 max-h-28 overflow-y-auto">
              {recentRatings.length === 0 && (
                <p className="text-[11px] text-muted-foreground/70 text-center py-2">لا توجد تقييمات بعد</p>
              )}
              {recentRatings.slice(0, 2).map((rt: any, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-muted/40 flex items-center justify-center shrink-0 text-[10px] font-bold text-muted-foreground">
                    {rt.receiverName?.[0] ?? "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold truncate">{rt.receiverName ?? "العميل"}</p>
                      <StarRating value={rt.rating} />
                    </div>
                    {rt.comment && <p className="text-[10px] text-muted-foreground truncate">{rt.comment}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* سجل الحوافز والمكافآت */}
          <div className="px-4 pb-4 mt-auto pt-2 border-t border-border/40">
            <button
              onClick={() => onNavigate("performance")}
              className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="flex items-center gap-1.5"><Award className="w-3.5 h-3.5" /> سجل الحوافز والمكافآت</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 5) بطاقة إدارة المرتجعات المتقدمة ────────────────────────────────────────
function ReturnsManagementCard({ allShipments, onNavigate }: { allShipments: any[]; onNavigate: (t: TabId) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const returns = allShipments
    .filter(s => s.status === "returned" || s.status === "partial_received")
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 8);

  const stateBadge = (status: string) => {
    if (status === "returned") return { label: "تم الإرجاع", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    return { label: "تأجيل", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  };

  return (
    <div className="rounded-2xl border bg-card/60 overflow-hidden flex flex-col h-full">
      <CollapsibleCardHeader
        icon={RotateCcw} iconColor="text-red-400" title="إدارة المرتجعات المتقدمة"
        collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)}
        actionLabel="الكل" onAction={() => onNavigate("shipments")}
      />

      {!collapsed && (
        <div className="flex-1 overflow-y-auto max-h-80">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-card">
              <tr className="text-muted-foreground border-b border-border/40">
                <th className="text-right font-medium px-3 py-2">العميل</th>
                <th className="text-right font-medium px-2 py-2">الحالة</th>
                <th className="text-right font-medium px-2 py-2">السبب</th>
                <th className="text-right font-medium px-3 py-2">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 && (
                <tr><td colSpan={4} className="text-center text-muted-foreground py-6">لا توجد مرتجعات</td></tr>
              )}
              {returns.map((s, i) => {
                const badge = stateBadge(s.status);
                return (
                  <tr key={s.id ?? i} className="border-b border-border/20 last:border-0">
                    <td className="px-3 py-2 font-mono text-primary/80">{s.shipmentNumber ?? s.id}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[9px] font-bold ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground truncate max-w-[90px]">{s.returnReason ?? "—"}</td>
                    <td className="px-3 py-2">
                      <button className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/25 transition-colors">
                        <Phone className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 6) بطاقة مركز الدعم والتواصل + التنبيهات العاجلة ─────────────────────────
function SupportAndAlertsCard({ tasksSummary }: { tasksSummary?: { urgent: number; outForDelivery: number; pending: number; total: number } }) {
  const [collapsedSupport, setCollapsedSupport] = useState(false);
  const [collapsedAlerts, setCollapsedAlerts] = useState(false);
  const contacts = [
    { label: "Supervisor Call", Icon: PhoneCall, color: "text-emerald-400" },
    { label: "Live Chat Support", Icon: Phone, color: "text-blue-400" },
    { label: "Technical Help Desk", Icon: Zap, color: "text-violet-400" },
    { label: "System Status", Icon: ShieldCheck, color: "text-primary" },
  ];
  const quickActions = [
    { label: "مؤثث الدعم", color: "text-emerald-400" },
    { label: "سُتلن المسير", color: "text-blue-400" },
    { label: "سُتلن التوصيل", color: "text-violet-400" },
    { label: "ستلن السوي", color: "text-amber-400" },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* مركز الدعم والتواصل */}
      <div className="rounded-2xl border bg-card/60 overflow-hidden">
        <CollapsibleCardHeader
          icon={PhoneCall} iconColor="text-primary" title="مركز الدعم والتواصل"
          collapsed={collapsedSupport} onToggleCollapse={() => setCollapsedSupport(c => !c)}
        />
        {!collapsedSupport && (
          <div className="p-4 grid grid-cols-2 gap-2">
            {contacts.map((c, i) => (
              <button key={i} className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-muted/10 px-2.5 py-2 text-[10px] font-bold hover:bg-muted/20 transition-colors">
                <c.Icon className={`w-3.5 h-3.5 shrink-0 ${c.color}`} />
                <span className="truncate">{c.label}</span>
              </button>
            ))}
            {quickActions.map((a, i) => (
              <button key={`qa-${i}`} className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-muted/10 px-2.5 py-2 text-[10px] font-bold hover:bg-muted/20 transition-colors">
                <span className={`truncate ${a.color}`}>{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* التنبيهات العاجلة */}
      <div className="rounded-2xl border bg-card/60 overflow-hidden flex-1">
        <CollapsibleCardHeader
          icon={AlertTriangle} iconColor="text-amber-400" title="التنبيهات العاجلة"
          collapsed={collapsedAlerts} onToggleCollapse={() => setCollapsedAlerts(c => !c)}
        />
        {!collapsedAlerts && (
          <div className="p-3 space-y-2">
            {(!tasksSummary || tasksSummary.urgent === 0) && (
              <p className="text-[11px] text-muted-foreground text-center py-4">لا توجد تنبيهات عاجلة الآن</p>
            )}
            {tasksSummary && tasksSummary.urgent > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <p className="text-[11px] text-red-400 font-bold flex-1">
                  لديك {tasksSummary.urgent} شحنة مستعجلة تحتاج متابعة فورية
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── لوحة الإشعارات المنسدلة ──────────────────────────────────────────────────
function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["rep-notifications"],
    queryFn: () => apiFetch("/notifications?limit=20"),
  });
  const notifs: any[] = (data as any)?.notifications ?? [];

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep-notifications"] });
      qc.invalidateQueries({ queryKey: ["rep-notifications-unread"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rep-notifications"] });
      qc.invalidateQueries({ queryKey: ["rep-notifications-unread"] });
    },
  });

  return (
    <>
      {/* overlay لغلق اللوحة عند الضغط برّه */}
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div
        className="fixed z-[100] w-80 max-w-[92vw] rounded-2xl border bg-card shadow-2xl overflow-hidden left-1/2 -translate-x-1/2 top-20 sm:left-auto sm:right-4 sm:translate-x-0"
        style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.45)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <p className="text-xs font-bold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-primary" /> الإشعارات
          </p>
          <div className="flex items-center gap-2">
            {notifs.some(n => !n.isRead) && (
              <button onClick={() => markAllMutation.mutate()} className="text-[10px] text-primary hover:underline">
                تعليم الكل كمقروء
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading && (
            <p className="text-xs text-muted-foreground text-center py-8">جاري التحميل...</p>
          )}
          {!isLoading && notifs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="text-xs text-muted-foreground">لا توجد إشعارات حالياً</p>
            </div>
          )}
          {notifs.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
              className={`w-full text-right px-4 py-3 border-b border-border/30 last:border-0 transition-colors hover:bg-muted/10 ${!n.isRead ? "bg-primary/5" : ""}`}
            >
              <div className="flex items-start gap-2">
                {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-[11px] ${!n.isRead ? "font-bold text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                  {n.message && <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-2">{n.message}</p>}
                  {n.createdAt && (
                    <p className="text-[9px] text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ar })}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── تاب البروفايل ────────────────────────────────────────────────────────────
function ProfileTab({ user, company, logout, d, allShipments, onNavigate }: {
  user: any; company: any; logout: () => void; d?: any; allShipments?: any[]; onNavigate?: (t: TabId) => void;
}) {
  const [confirmLogout, setConfirmLogout] = useState(false);

  const deliveryRate = d?.deliveryRate ?? 0;
  const totalShipments = d?.total ?? (allShipments?.length ?? 0);
  const ratingsAvg = d?.ratingsAvg ?? null;
  const ratingsCount = d?.ratingsCount ?? 0;

  const grade = deliveryRate >= 85 ? { label: "ممتاز", color: "#34d399", glow: "52,211,153" }
    : deliveryRate >= 70 ? { label: "جيد جداً", color: "#60a5fa", glow: "96,165,250" }
    : deliveryRate >= 55 ? { label: "جيد", color: "#fbbf24", glow: "251,191,36" }
    : { label: "بداية الطريق", color: "#a1a1aa", glow: "161,161,170" };

  const r = 40; const c = 2 * Math.PI * r;
  const fill = (deliveryRate / 100) * c;

  const statCards = [
    { label: "إجمالي الشحنات", value: totalShipments, Icon: Package, color: "96,165,250" },
    { label: "نسبة التسليم", value: `${deliveryRate}%`, Icon: CheckCircle2, color: "52,211,153" },
    { label: "تقييم العملاء", value: ratingsAvg != null ? ratingsAvg.toFixed(1) : "—", Icon: Star, color: "251,191,36" },
  ];

  const infoRows = [
    { label: "الاسم الكامل", value: user?.displayName ?? "—", Icon: ShieldCheck },
    { label: "رقم الهاتف", value: user?.phone ?? "—", Icon: PhoneCall },
    { label: "اسم المستخدم", value: user?.username ?? "—", Icon: Lock },
    { label: "شركة الشحن", value: company?.name ?? "—", Icon: Truck },
  ];

  return (
    <div className="space-y-3">
      {/* زرار رجوع */}
      {onNavigate && (
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors px-1 py-1 -mb-1">
          <ChevronRight className="w-4 h-4" />
          رجوع
        </button>
      )}

      {/* Hero — بطاقة الهوية الرئيسية بحلقة الأداء */}
      <div className="rounded-2xl p-6 border relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, rgba(${grade.glow},0.14) 0%, hsl(var(--card)) 65%)`,
                 border: `1px solid rgba(${grade.glow},0.28)`,
                 boxShadow: `0 1px 0 rgba(255,255,255,0.03) inset, 0 0 32px rgba(${grade.glow},0.10)` }}>
        {/* زخرفة خلفية */}
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full blur-3xl pointer-events-none"
          style={{ background: `rgba(${grade.glow},0.15)` }} />

        <div className="relative flex flex-col items-center text-center gap-4">
          {/* Avatar بحلقة تقدم الأداء */}
          <div className="relative w-24 h-24 shrink-0">
            <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90 absolute inset-0">
              <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
              <circle cx="48" cy="48" r={r} fill="none" stroke={grade.color} strokeWidth="4"
                strokeLinecap="round" strokeDasharray={`${fill} ${c}`}
                style={{ filter: `drop-shadow(0 0 6px ${grade.color})`, transition: "stroke-dasharray 1s ease" }} />
            </svg>
            <div className="absolute inset-1.5 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shadow-lg">
              <span className="text-3xl font-black text-primary">{(user?.displayName ?? "م")[0]}</span>
            </div>
            {/* شارة الشركة الصغيرة */}
            {company?.logo && (
              <img src={company.logo} className="absolute -bottom-1 -left-1 w-7 h-7 rounded-lg object-cover border-2 border-card shadow" alt="" />
            )}
          </div>

          <div>
            <p className="text-lg font-black">{user?.displayName ?? "المندوب"}</p>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `rgba(${grade.glow},0.15)`, color: grade.color }}>
                <Award className="w-3 h-3" /> {grade.label}
              </span>
              <span className="text-[11px] text-muted-foreground">· مندوب توصيل</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center justify-center gap-1">
              <Truck className="w-3 h-3 text-primary/60" /> {company?.name ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-3 gap-2.5">
        {statCards.map((s, i) => (
          <div key={i} className="rounded-2xl p-3 border relative overflow-hidden text-center"
            style={{ background: `linear-gradient(135deg, rgba(${s.color},0.09) 0%, hsl(var(--card)) 65%)`,
                     border: `1px solid rgba(${s.color},0.22)` }}>
            <span className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1.5" style={{ background: `rgba(${s.color},0.12)` }}>
              <s.Icon className="w-3.5 h-3.5" style={{ color: `rgba(${s.color},1)` }} />
            </span>
            <p className="text-base font-black leading-tight" style={{ color: `rgba(${s.color},1)` }}>{s.value}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* تقييم العملاء التفصيلي */}
      {ratingsCount > 0 && (
        <div className="rounded-2xl border bg-card/60 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            </span>
            <div>
              <p className="text-xs font-bold">تقييم العملاء</p>
              <p className="text-[10px] text-muted-foreground">بناءً على {ratingsCount} تقييم</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <Star key={n} className={`w-4 h-4 ${ratingsAvg && n <= Math.round(ratingsAvg) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25"}`} />
            ))}
          </div>
        </div>
      )}

      {/* بيانات الحساب */}
      <div className="rounded-2xl border bg-card/60 overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-border/50">
          <p className="text-xs font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" /> بيانات الحساب
          </p>
        </div>
        <div className="divide-y divide-border/30">
          {infoRows.map((row, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <row.Icon className="w-3.5 h-3.5 text-primary/70" />
                </span>
                {row.label}
              </span>
              <span className="text-xs font-bold">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* بيانات الشحن — إدارة بياناته الخاصة (نفس تاب manifests، بدون navigation/reload) */}
      <button
        onClick={() => onNavigate?.("manifests")}
        className="w-full rounded-2xl border bg-card/60 px-4 py-3.5 flex items-center justify-between hover:bg-card/90 transition-colors">
        <span className="flex items-center gap-2 text-xs font-bold">
          <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-primary/70" />
          </span>
          البيانات
        </span>
        <ChevronLeft className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* تسجيل خروج */}
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
        {!confirmLogout ? (
          <Button variant="outline" className="w-full gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-400"
            onClick={() => setConfirmLogout(true)}>
            <LogOut className="w-4 h-4" /> تسجيل الخروج
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-red-400 text-center">متأكد إنك عايز تسجل خروج؟</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-8 text-[11px]" onClick={() => setConfirmLogout(false)}>
                إلغاء
              </Button>
              <Button className="flex-1 h-8 text-[11px] bg-red-500 hover:bg-red-600" onClick={logout}>
                تأكيد الخروج
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── شريط علوي خاص بالنظرة العامة (يطابق تصميم الموك أب) ─────────────────────
function HomeHeader({ company, user, onNavigate }: { company: any; user: any; onNavigate: (t: TabId) => void }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const { data: unreadData } = useQuery({
    queryKey: ["rep-notifications-unread"],
    queryFn: () => apiFetch("/notifications/unread-count"),
    refetchInterval: 30_000,
  });
  const unreadCount = (unreadData as any)?.count ?? 0;

  return (
    <div className="rounded-2xl border bg-card/60 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      {/* يمين: بروفايل + إشعارات */}
      <div className="flex items-center gap-2 order-2 md:order-1">
        <button
          onClick={() => onNavigate("profile")}
          className="w-9 h-9 rounded-xl border border-border/50 bg-muted/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <div className="relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative w-9 h-9 rounded-xl border border-border/50 bg-muted/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
        </div>
      </div>

      {/* وسط: عنوان الصفحة */}
      <h1 className="order-1 md:order-2 text-sm md:text-base font-black text-primary flex-1 md:flex-none text-center md:text-right">
        بوابة إدارة التوصيل
      </h1>

      {/* شمال: لوجو الشركة + اسم المندوب */}
      <div className="flex items-center gap-2.5 order-3">
        <div className="text-left">
          <p className="text-xs font-black leading-tight">{user?.displayName ?? "المندوب"}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{company?.name ?? "بوابة المندوب"}</p>
        </div>
        {company?.logo
          ? <img src={company.logo} className="w-9 h-9 rounded-xl object-cover border border-border shadow" alt="" />
          : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shadow">
              <Truck className="w-4 h-4 text-primary" />
            </div>
          )}
      </div>
    </div>
  );
}

// ─── HomeTab: تجميع كل البطاقات في نفس تقسيم الصورة ──────────────────────────
function HomeTab({ d, company, user, allShipments, onNavigate }: {
  d: any; company: any; user: any; allShipments: any[]; onNavigate: (t: TabId) => void;
}) {
  return (
    <div className="space-y-4">
      <HomeHeader company={company} user={user} onNavigate={onNavigate} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* الصف الأول */}
        <TasksSummaryCard allShipments={allShipments} onNavigate={onNavigate} />
        <CodSummaryCard d={d} allShipments={allShipments} onNavigate={onNavigate} />
        <MyPerformanceCard d={d} allShipments={allShipments} onNavigate={onNavigate} />

        {/* الصف الثاني */}
        <div className="rounded-2xl border bg-card/60 overflow-hidden">
          <RepRouteMap enabled={true} />
        </div>
        <ReturnsManagementCard allShipments={allShipments} onNavigate={onNavigate} />
        <SupportAndAlertsCard />
        <WalletHistoryCard />
      </div>
    </div>
  );
}

export default function RepresentativeDashboard() {
  const { user, isRepresentative, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  // نقرأ آخر تاب كان مفتوح من sessionStorage عشان لو المندوب عمل refresh
  // (F5) الصفحة تفضل واقفة في نفس المكان بدل ما ترجعله للرئيسية كل مرة
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    try {
      const saved = sessionStorage.getItem("rep_dashboard_tab") as TabId | null;
      const valid: TabId[] = ["home", "performance", "shipments", "manifests", "tasks", "profile"];
      if (saved && valid.includes(saved)) return saved;
    } catch {}
    return "home";
  });
  // كل التابات بما فيهم "manifests" (بياناتي) بتتغيّر جوه نفس الداشبورد —
  // مفيش أي navigate/route change، عشان الصفحة تفضل single-page state
  // ومتفضلش الـ sidebar/header يعملوا reload أو remount كل ما نغيّر تاب
  const handleNavSelect = (id: TabId) => {
    setActiveTab(id);
    try { sessionStorage.setItem("rep_dashboard_tab", id); } catch {}
  };
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [shipmentSearch, setShipmentSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ─── SSE: استقبال إشعارات الاستعجال الفورية ───────────────────────────────
  const { toast } = useToast();
  useEffect(() => {
    if (!user) return;
    // SSE خاص بالمناديب فقط — السوبر أدمن والأدمن مش عندهم shippingCompanyId
    if (user.role !== "representative") return;
    const token = localStorage.getItem("caprina_token") || "";
    const url = `/api/representative/sse${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type !== "urgent") return;

        // اهتزاز قوي
        if (navigator.vibrate) navigator.vibrate([400, 100, 400, 100, 600]);

        // صوت إنذار حاد
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const beep = (f: number, t: number, d: number) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = "square";
            o.frequency.setValueAtTime(f, ctx.currentTime + t);
            g.gain.setValueAtTime(0, ctx.currentTime + t);
            g.gain.linearRampToValueAtTime(0.7, ctx.currentTime + t + 0.01);
            g.gain.linearRampToValueAtTime(0, ctx.currentTime + t + d);
            o.start(ctx.currentTime + t);
            o.stop(ctx.currentTime + t + d + 0.05);
          };
          beep(880, 0, 0.18); beep(1100, 0.22, 0.18); beep(1320, 0.44, 0.3);
          setTimeout(() => { beep(880, 0, 0.18); beep(1100, 0.22, 0.18); beep(1320, 0.44, 0.3); }, 1000);
        } catch (_) {}

        // توست إشعار
        toast({
          title: `⚡ شحنة مستعجلة — بيان ${payload.manifestNumber ?? ""}`,
          description: `${payload.customerName ?? ""} ${payload.urgentNote ? `· ${payload.urgentNote}` : ""}`,
          variant: "destructive",
          duration: 8000,
        });
      } catch (_) {}
    };

    return () => es.close();
  }, [user]);

  // الصفحة دي خاصة بالمندوب بس — السوبر أدمن والأدمن عندهم صفحة "مناديب الشحن" الكاملة
  if (user && !isRepresentative) return <Redirect to="/dashboard" />;

  const qParams = new URLSearchParams();
  if (dateFrom) qParams.set("dateFrom", dateFrom);
  if (dateTo)   qParams.set("dateTo",   dateTo);

  const { data: dash } = useQuery({
    queryKey: ["rep-dashboard", dateFrom, dateTo],
    queryFn: () => apiFetch(`/representative/dashboard?${qParams}`),
    enabled: !!user,
  });

  const shipParams = new URLSearchParams(qParams);
  shipParams.set("page", String(page));
  shipParams.set("limit", "100");
  if (statusFilter) shipParams.set("status", statusFilter);

  // نجيب كل الشحنات بدون فلتر حالة عشان نستخدمها في تاب الأداء
  const allShipsParams = new URLSearchParams();
  allShipsParams.set("page", "1");
  allShipsParams.set("limit", "500");

  const { data: ships } = useQuery({
    queryKey: ["rep-shipments", dateFrom, dateTo, statusFilter, page],
    queryFn: () => apiFetch(`/representative/shipments?${shipParams}`),
    enabled: !!user,
  });

  const { data: allShipsData } = useQuery({
    queryKey: ["rep-all-shipments"],
    queryFn: () => apiFetch(`/representative/shipments?${allShipsParams}`),
    enabled: !!user,
  });

  const { data: meData } = useQuery({
    queryKey: ["rep-me"],
    queryFn: () => apiFetch("/representative/me"),
    enabled: !!user,
  });

  const d = dash as any;
  const s = ships as any;
  const allShipments: any[] = (allShipsData as any)?.data ?? [];
  const company = (meData as any)?.company;

  const filteredRepShipments = (() => {
    const list: any[] = s?.data ?? [];
    const q = shipmentSearch.trim().toLowerCase();
    if (!q) return list;
    const qPhone = q.replace(/\s/g, "");
    return list.filter((sh: any) => {
      const name  = (sh.receiverName  ?? "").toLowerCase();
      const phone = (sh.receiverPhone ?? "").replace(/\s/g, "");
      return name.includes(q) || phone.includes(qPhone);
    });
  })();

  // ─── واتساب لكارت الشحنة في تاب "الشحنات" (نفس رسالة "طلب استعداد للاستلام" في مهامي) ───
  const { data: repWaSettings } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: () => apiFetch("/whatsapp/settings"),
    staleTime: 5 * 60_000,
  });
  const repDeliveryReadyTpl = (repWaSettings as any)?.templates?.find((t: any) => t.name === "طلب استعداد للاستلام");
  const buildShipmentWaHref = (sh: any) => {
    const phone = (sh.receiverPhone ?? "").replace(/\D/g, "");
    if (!phone) return undefined;
    const message = repDeliveryReadyTpl
      ? applyDeliveryReadyTemplate(repDeliveryReadyTpl.body, {
          customerName: sh.receiverName,
          representativeName: (user as any)?.name ?? "",
          shipmentNumber: sh.shipmentNumber,
          codAmount: sh.codAmount,
          receiverCity: sh.receiverCity,
          senderName: sh.senderName,
          totalPrice: sh.totalPrice,
          parcelType: sh.parcelType,
          senderPhone: sh.senderPhone,
          senderCity: sh.senderCity,
          senderGovernorate: sh.senderGovernorate,
          pieces: sh.pieces,
          weight: sh.weight,
          receiverAddress: sh.receiverAddress,
        })
      : "";
    return `https://wa.me/${phone.startsWith("0") ? "2" + phone : phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  };

  // Quick filter buttons للحالات الرئيسية
  const QUICK_FILTERS = [
    { value: "", label: "الكل", color: "border-border text-muted-foreground" },
    { value: "delivered", label: "مسلَّم", color: "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" },
    { value: "returned", label: "مرتجع", color: "border-red-500/50 text-red-400 bg-red-500/10" },
    { value: "delayed", label: "مؤجل", color: "border-amber-500/50 text-amber-400 bg-amber-500/10" },
    { value: "out_for_delivery", label: "خرج للتسليم", color: "border-blue-500/50 text-blue-400 bg-blue-500/10" },
  ];

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      {/* ─── Desktop Sidebar ─── */}
      <DesktopSidebar
        active={activeTab}
        onSelect={(t) => { handleNavSelect(t); setSidebarOpen(false); }}
        company={company}
        user={user}
        d={d}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ─── Main Content ─── */}
      <div className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ${sidebarOpen ? "md:mr-[280px]" : "md:mr-[88px]"}`}>
        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-40 border-b border-border/50"
          style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)", backdropFilter: "blur(12px)" }}>
          {/* Row 1: logo + name + logout */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-2">
            {company?.logo
              ? <img src={company.logo} className="w-12 h-12 rounded-xl object-cover border-2 border-primary/20 shadow-lg" alt="" />
              : <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border-2 border-primary/20 flex items-center justify-center shadow-lg">
                  <Truck className="w-6 h-6 text-primary" />
                </div>}
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-black truncate leading-tight">{company?.name ?? user?.displayName}</h1>
              <p className="text-[11px] text-muted-foreground font-medium">بوابة المندوب · {user?.displayName}</p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 active:scale-90"
              style={{
                background: theme === "dark" ? "linear-gradient(135deg,#1e3a5f,#0f172a)" : "linear-gradient(135deg,#fbbf24,#f59e0b)",
                boxShadow: theme === "dark" ? "0 0 8px rgba(96,165,250,0.35)" : "0 0 8px rgba(251,191,36,0.5)",
              }}
            >
              {theme === "dark" ? <Moon className="w-4 h-4 text-blue-300" /> : <Sun className="w-4 h-4 text-white" />}
            </button>
            <button onClick={logout}
              className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-xl hover:bg-destructive/10">
              <LogOut className="w-5 h-5" />
              <span className="text-[9px] font-bold">خروج</span>
            </button>
          </div>
          {/* Row 2: KPI strip */}
          {d && (
            <div className="flex items-center gap-2 px-4 pb-3">
              <div className={`flex-1 flex items-center gap-1.5 rounded-xl px-3 py-1.5 border ${d.deliveryRate >= 70 ? "bg-emerald-500/10 border-emerald-500/30" : d.deliveryRate >= 40 ? "bg-amber-500/10 border-amber-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${d.deliveryRate >= 70 ? "text-emerald-400" : d.deliveryRate >= 40 ? "text-amber-400" : "text-red-400"}`} />
                <span className="text-[11px] font-black" style={{ color: d.deliveryRate >= 70 ? "#34d399" : d.deliveryRate >= 40 ? "#fbbf24" : "#f87171" }}>{d.deliveryRate}%</span>
                <span className="text-[10px] text-muted-foreground">تسليم</span>
              </div>
              <div className="flex-1 flex items-center gap-1.5 rounded-xl px-3 py-1.5 border bg-blue-500/10 border-blue-500/30">
                <Package className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-[11px] font-black text-blue-400">{d.total}</span>
                <span className="text-[10px] text-muted-foreground">شحنة</span>
              </div>
              <div className="flex-1 flex items-center gap-1.5 rounded-xl px-3 py-1.5 border bg-violet-500/10 border-violet-500/30">
                <DollarSign className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-[11px] font-black text-violet-400">{Math.round((d.totalCollected ?? 0) / 1000)}K</span>
                <span className="text-[10px] text-muted-foreground">ج.م</span>
              </div>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 p-4 pb-24 md:pb-6 space-y-4 animate-in fade-in duration-500">

          {/* ─── Today Strip (يظهر في كل التابات ما عدا الرئيسية) ─── */}
          {activeTab !== "home" && <TodayStrip shipments={allShipments} />}

          {/* ─── Home Tab (النظرة العامة الجديدة) ─── */}
          {activeTab === "home" && (
            <HomeTab
              d={d}
              company={company}
              user={user}
              allShipments={allShipments}
              onNavigate={handleNavSelect}
            />
          )}

          {/* ─── Performance Tab ─── */}
          {activeTab === "performance" && (
            <PerformanceTab d={d} allShipments={allShipments} />
          )}

          {/* ─── Manifests Tab (بياناتي) ───
              بيستخدم نفس صفحة representative-shipping-companies.tsx كاملة
              (بدل RepManifestsTab المختصر القديم)، بس embedded جوه الداشبورد
              نفسه بدون أي route/navigate — نفس الـ single-page state تمامًا ── */}
          {activeTab === "manifests" && <ShippingCompaniesPage embedded />}

          {/* ─── Today Tasks Tab ─── */}
          {activeTab === "tasks" && <TodayTasksTab companyId={company?.id ?? null} />}

          {/* ─── Profile Tab ─── */}
          {activeTab === "profile" && <ProfileTab user={user} company={company} logout={logout} d={d} allShipments={allShipments} onNavigate={handleNavSelect} />}

          {/* ─── Shipments Tab ─── */}
          {activeTab === "shipments" && (
            <div className="space-y-4">
              {/* KPI Cards */}
              {d && (
                <div className="grid grid-cols-2 gap-3">
                  <KpiCard label="إجمالي الشحنات"  value={d.total}      color="96,165,250"  icon={Package} />
                  <KpiCard label="تم التسليم"        value={d.delivered}  color="52,211,153"  icon={CheckCircle2} />
                  <KpiCard label="قيد التسليم"       value={d.inProgress} color="251,191,36"  icon={Clock} />
                  <KpiCard label="مرتجع"             value={d.returned}   color="248,113,113" icon={RotateCcw} />
                </div>
              )}

              {/* Date filter */}
              <div className="flex flex-wrap gap-2">
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground flex-1 min-w-0" />
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground flex-1 min-w-0" />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
                    className="h-8 px-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60">
                    مسح
                  </button>
                )}
              </div>

              {/* Quick status filter buttons */}
              <div className="flex gap-1.5 flex-wrap">
                {QUICK_FILTERS.map(f => (
                  <button key={f.value} onClick={() => { setStatusFilter(f.value); setPage(1); }}
                    className={`h-7 px-3 text-[11px] rounded-full border font-bold transition-all ${statusFilter === f.value ? f.color : "border-border/50 text-muted-foreground hover:bg-muted/30"}`}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* بحث بالاسم / رقم الهاتف */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="search"
                  inputMode="search"
                  placeholder="ابحث بالاسم أو رقم الهاتف..."
                  value={shipmentSearch}
                  onChange={(e) => setShipmentSearch(e.target.value)}
                  className="h-10 sm:h-9 text-sm w-full pr-9 pl-8 bg-card/60 border-border focus-visible:ring-primary/40"
                />
                {shipmentSearch && (
                  <button
                    type="button"
                    onClick={() => setShipmentSearch("")}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Shipments list — جدول واحد لكل الشاشات (ديسكتوب وموبايل) مع scroll أفقي */}
              <div className="rounded-2xl border bg-card/60 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-right text-xs">#</TableHead>
                      <TableHead className="text-right text-xs">التاريخ</TableHead>
                      <TableHead className="text-right text-xs">المستلم</TableHead>
                      <TableHead className="text-right text-xs">الهاتف</TableHead>
                      <TableHead className="text-right text-xs">المحافظة</TableHead>
                      <TableHead className="text-right text-xs">COD</TableHead>
                      <TableHead className="text-center text-xs">الحالة</TableHead>
                      <TableHead className="text-center text-xs w-32">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRepShipments.map((sh: any) => {
                      const waHref = buildShipmentWaHref(sh);
                      return (
                        <TableRow key={sh.id} className={`border-border hover:bg-muted/20 ${sh.isUrgent ? "bg-red-500/5" : ""}`}>
                          <TableCell className="font-mono text-xs text-primary font-bold">
                            {sh.shipmentNumber}
                            {sh.isUrgent && (
                              <span className="mr-1 inline-flex items-center gap-0.5 text-[9px] font-black text-red-400">
                                <Zap className="w-2.5 h-2.5 fill-red-400" /> مستعجل
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {sh.createdAt ? format(new Date(sh.createdAt), "dd/MM/yyyy", { locale: ar }) : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-semibold">{sh.receiverName || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{sh.receiverPhone || "—"}</TableCell>
                          <TableCell className="text-xs font-medium">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                              {sh.receiverCity || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-bold text-emerald-400">
                            {formatCurrency(Number(sh.codAmount ?? 0) + Number(sh.shippingFee ?? 0))}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[9px] font-bold border ${STATUS_COLOR[sh.status] ?? "border-border"}`}>
                              {STATUS_LABELS[sh.status] ?? sh.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {sh.receiverPhone && (
                                <a href={`tel:${sh.receiverPhone}`} title="اتصال بالعميل"
                                  className="flex items-center justify-center w-6 h-6 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {waHref && (
                                <a href={waHref} target="_blank" rel="noopener noreferrer" title="ابعت رسالة واتساب للعميل"
                                  className="flex items-center justify-center w-6 h-6 shrink-0 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <ShipmentStatusEditor shipment={sh} onSaved={() => queryClient.invalidateQueries({ queryKey: ["rep-shipments"] })} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {s?.data?.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">لا توجد شحنات</p>
                )}
                {s?.data && s.data.length > 0 && filteredRepShipments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">لا توجد نتائج مطابقة للبحث</p>
                )}
              </div>

              {/* Pagination */}
              {s && s.total > 100 && (
                <div className="flex justify-center gap-2 mt-3">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="h-7 px-3 text-xs rounded-md border border-border bg-muted/20 disabled:opacity-40">
                    السابق
                  </button>
                  <span className="text-xs text-muted-foreground self-center">
                    {page} / {Math.ceil(s.total / 100)}
                  </span>
                  <button disabled={page >= Math.ceil(s.total / 100)} onClick={() => setPage(p => p + 1)}
                    className="h-7 px-3 text-xs rounded-md border border-border bg-muted/20 disabled:opacity-40">
                    التالي
                  </button>
                </div>
              )}
            </div>
          )}

        </div>{/* end content area */}

        {/* ─── Mobile Bottom Nav ─── */}
        <MobileBottomNav active={activeTab} onSelect={handleNavSelect} />
      </div>{/* end main content */}
    </div>
  );
}
