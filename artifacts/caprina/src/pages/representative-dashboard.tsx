import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Redirect } from "wouter";
import { Truck, Package, CheckCircle2, RotateCcw, Clock, MapPin, AlertCircle, FileText, Lock, CheckCheck, AlertTriangle, Hourglass, ChevronRight, ChevronLeft, Unlock, PackageCheck, Award, BarChart3, Phone, DollarSign, ShieldCheck, Activity, ArrowUp, ArrowDown, Minus, LayoutDashboard, ClipboardList, TrendingUp, Zap, ListChecks, PlayCircle, PhoneCall } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  waiting: "انتظار", confirmed: "مؤكدة", picked_up: "تم الاستلام",
  in_transit: "في الطريق", out_for_delivery: "خرجت للتسليم",
  delivered: "تم التسليم", partial_received: "استلام جزئي",
  delayed: "متأخرة", returned: "مرتجع", cancelled: "ملغية",
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

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl p-4 border relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, rgba(${color},0.15) 0%, rgba(${color},0.05) 100%)`,
               border: `1px solid rgba(${color},0.3)`, boxShadow: `0 0 20px rgba(${color},0.1)` }}>
      <span className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-10"
        style={{ background: `radial-gradient(circle, rgba(${color},1) 0%, transparent 70%)` }} />
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="w-4 h-4" style={{ color: `rgba(${color},1)` }} />
      </div>
      <p className="text-2xl font-black" style={{ color: `rgba(${color},1)` }}>{value}</p>
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
    <div className="rounded-2xl p-4 border relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, rgba(${grade.glow},0.12) 0%, rgba(${grade.glow},0.04) 100%)`,
               border: `1px solid rgba(${grade.glow},0.3)`, boxShadow: `0 0 30px rgba(${grade.glow},0.12)` }}>
      <p className="text-xs font-bold mb-3 flex items-center gap-1.5">
        <Award className="w-3.5 h-3.5" style={{ color: grade.color }} /> نقطة الأداء الشهرية
      </p>
      <div className="flex items-center gap-4">
        {/* Ring */}
        <div className="relative w-28 h-28 shrink-0">
          <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
            <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
            <circle cx="56" cy="56" r={r} fill="none" stroke={grade.color} strokeWidth="10"
              strokeLinecap="round" strokeDasharray={`${fill} ${c}`}
              style={{ filter: `drop-shadow(0 0 8px ${grade.color})`, transition: "stroke-dasharray 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black" style={{ color: grade.color }}>{score}</span>
            <span className="text-[10px] text-muted-foreground font-bold">{grade.label}</span>
          </div>
        </div>
        {/* breakdown */}
        <div className="flex-1 space-y-2.5">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">نسبة التسليم</span>
              <span className="font-bold text-emerald-400">{deliveryRate}%</span>
            </div>
            <div className="w-full bg-muted/20 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${deliveryRate}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">معدل الإرجاع</span>
              <span className={`font-bold ${returnRate > 30 ? "text-red-400" : "text-emerald-400"}`}>{returnRate}%</span>
            </div>
            <div className="w-full bg-muted/20 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${returnRate}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">نشاط الشحنات</span>
              <span className="font-bold text-blue-400">{total} شحنة</span>
            </div>
            <div className="w-full bg-muted/20 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(100, activityScore)}%` }} />
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

// ─── Urgent Banner Component ──────────────────────────────────────────────────
function UrgentBanner({ urgentItems }: { urgentItems: any[] }) {
  const alertedRef = useRef(false);

  useEffect(() => {
    if (alertedRef.current) return;
    alertedRef.current = true;

    // اهتزاز الموبايل (3 نبضات قوية)
    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300, 100, 500]);
    }

    // صوت تنبيه قوي بالـ Web Audio API
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
      // تكرار بعد 1.5 ثانية
      setTimeout(() => {
        playBeep(880, 0,    0.18, 0.6);
        playBeep(1100, 0.22, 0.18, 0.6);
        playBeep(1320, 0.44, 0.30, 0.7);
      }, 1500);
    } catch (_) {}
  }, []);

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
            <span className="urgent-dot relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
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
      {/* Performance Score */}
      <PerformanceScore
        deliveryRate={d?.deliveryRate ?? 0}
        returnRate={d?.returnRate ?? 0}
        total={d?.total ?? 0}
      />

      {/* Weekly Trend */}
      <div className="rounded-2xl border bg-card/60 p-4">
        <p className="text-xs font-bold mb-3 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-blue-400" /> مقارنة الأسبوع
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-background/40 p-3">
            <p className="text-[10px] text-muted-foreground mb-1">تسليم هذا الأسبوع</p>
            <p className="text-xl font-black text-emerald-400">{wDelivered}</p>
            <TrendBadge current={wDelivered} prev={pwDelivered} label="تسليم" />
          </div>
          <div className="rounded-xl bg-background/40 p-3">
            <p className="text-[10px] text-muted-foreground mb-1">مرتجع هذا الأسبوع</p>
            <p className="text-xl font-black text-red-400">{wReturned}</p>
            <TrendBadge current={wReturned} prev={pwReturned} label="إرجاع" />
          </div>
          <div className="rounded-xl bg-background/40 p-3">
            <p className="text-[10px] text-muted-foreground mb-1">الأسبوع الفائت</p>
            <p className="text-xl font-black">{prevWeek.length}</p>
            <span className="text-[10px] text-muted-foreground">شحنة</span>
          </div>
          <div className="rounded-xl bg-background/40 p-3">
            <p className="text-[10px] text-muted-foreground mb-1">هذا الأسبوع</p>
            <p className="text-xl font-black text-primary">{thisWeek.length}</p>
            <TrendBadge current={thisWeek.length} prev={prevWeek.length} label="إجمالي" />
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
              <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-red-400 bg-red-500/15 border border-red-500/40 rounded-full px-1.5 py-0.5 animate-pulse">
                <Zap className="w-2.5 h-2.5 fill-red-400" /> مستعجل
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
    onSuccess: () => { toast({ title: "✅ تم تأكيد التسليم للتاجر" }); onSaved(); },
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
      toast({ title: "✅ تم قفل البيان بنجاح" });
      qc.invalidateQueries({ queryKey: ["rep-manifest", manifestId] });
      qc.invalidateQueries({ queryKey: ["rep-manifests"] });
      setConfirmClose(false);
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
  const courierCostManual = manifest.courierCostManual != null ? Number(manifest.courierCostManual) : 0;
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

      {!locked && (
        <div className="pt-2">
          {!confirmClose ? (
            <Button className="w-full gap-2" onClick={() => setConfirmClose(true)}>
              <Lock className="w-4 h-4" /> قفل البيان
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
    </div>
  );
}

// ─── تاب البيانات — قائمة بيانات الشحن بتاعة المندوب ─────────────────────────
function ManifestsTab({ companyId }: { companyId: number | null }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rep-manifests", companyId],
    queryFn: () => apiFetch(`/shipment-manifests?companyId=${companyId}`),
    enabled: !!companyId,
  });
  const manifests = (data as any[]) ?? [];

  if (selectedId) {
    return <ManifestDetail manifestId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (isLoading) return <p className="text-xs text-muted-foreground text-center py-8">جاري التحميل...</p>;

  return (
    <div className="space-y-2">
      {manifests.map((m: any) => (
        <Card key={m.id} className="p-3 bg-card/60 border-border cursor-pointer hover:bg-card/90 transition-colors"
          onClick={() => setSelectedId(m.id)}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black font-mono">{m.manifestNumber}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {m.createdAt ? format(new Date(m.createdAt), "dd/MM/yyyy", { locale: ar }) : ""} · {m.shipmentCount ?? 0} شحنة
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={m.status === "closed" ? "border-red-500/30 text-red-400 bg-red-500/10 text-[9px]" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[9px]"}>
                {m.status === "closed" ? "مغلق" : "مفتوح"}
              </Badge>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </Card>
      ))}
      {manifests.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">لا توجد بيانات شحن حالياً</p>
      )}
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
  const statusKey = task.isUrgent ? "urgent" : (task.deliveryStatus ?? task.status ?? "pending");
  const info = TASK_STATUS_PRIORITY[statusKey] ?? TASK_STATUS_PRIORITY["waiting"];

  return (
    <div className={`rounded-2xl border p-3 space-y-2.5 transition-all ${task.isUrgent ? "border-red-500/50 bg-red-950/30" : "border-border/60 bg-card/60"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {task.isUrgent && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-red-400 bg-red-500/15 border border-red-500/40 rounded-full px-1.5 py-0.5 animate-pulse shrink-0">
                <Zap className="w-2.5 h-2.5 fill-red-400" /> مستعجل
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

      {/* Call button */}
      {task.receiverPhone && (
        <a href={`tel:${task.receiverPhone}`}
          className="flex items-center justify-center gap-1.5 w-full h-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/20 transition-colors">
          <PhoneCall className="w-3.5 h-3.5" /> {task.receiverPhone}
        </a>
      )}
    </div>
  );
}

function TodayTasksTab({ companyId }: { companyId: number | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rep-today-tasks", companyId],
    queryFn: () => apiFetch(`/representative/today-tasks${companyId ? `?companyId=${companyId}` : ""}`),
    enabled: true,
    refetchInterval: 60_000, // تحديث تلقائي كل دقيقة
  });

  const bulkMutation = useMutation({
    mutationFn: () => apiFetch("/representative/shipments/bulk-start-day", {
      method: "PATCH",
      body: JSON.stringify({ companyId }),
    }),
    onSuccess: (res: any) => {
      const updated = res?.updated ?? 0;
      toast({ title: `🚀 تم تحديث ${updated} شحنة إلى "خرجت للتسليم"` });
      setConfirmed(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["rep-shipments"] });
      qc.invalidateQueries({ queryKey: ["rep-dashboard"] });
      qc.invalidateQueries({ queryKey: ["rep-all-shipments"] });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
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
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-primary" />
            <p className="text-xs font-bold">
              {outTasks.length} شحنة جاهزة للتسليم — ابدأ يومك دلوقتي
            </p>
          </div>
          {!confirmed ? (
            <button onClick={() => setConfirmed(true)}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-black flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all shadow-lg"
              style={{ boxShadow: "0 0 20px rgba(var(--primary-rgb, 99,102,241),0.3)" }}>
              <PlayCircle className="w-4 h-4" /> 🚀 بدأت اليوم — حوّل الكل للتسليم
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-amber-400 text-center font-bold">
                ⚠️ هيغيّر {outTasks.length} شحنة لـ "خرجت للتسليم" — متأكد؟
              </p>
              <div className="flex gap-2">
                <button onClick={() => bulkMutation.mutate()}
                  disabled={bulkMutation.isPending}
                  className="flex-1 h-9 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-500 disabled:opacity-60 transition-all">
                  {bulkMutation.isPending ? "بيحدّث..." : "✅ أيوه، ابدأ"}
                </button>
                <button onClick={() => setConfirmed(false)}
                  className="flex-1 h-9 rounded-xl border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/60">
                  إلغاء
                </button>
              </div>
            </div>
          )}
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

// ─── NAV ITEMS definition ─────────────────────────────────────────────────────
type TabId = "performance" | "shipments" | "manifests" | "tasks";
const NAV_ITEMS: { id: TabId; label: string; sublabel: string; Icon: React.ElementType; activeColor: string; activeBg: string; glowColor: string }[] = [
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

      {/* Collapsed toggle button — يظهر لما الـ sidebar مقفول */}
      {!open && (
        <button
          onClick={onToggle}
          className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 flex-col items-center justify-center gap-1 w-8 h-20 rounded-l-xl border border-border/60 border-r-0 transition-all hover:w-10"
          style={{
            background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
            boxShadow: "-4px 0 16px rgba(0,0,0,0.15)",
          }}
          title="فتح القائمة"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

    <aside
      dir="rtl"
      className={`hidden md:flex flex-col w-56 shrink-0 h-screen fixed right-0 top-0 z-40 overflow-y-auto transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      style={{
        background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
        borderLeft: "1px solid hsl(var(--border))",
        boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.2)" : "none",
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Brand ── */}
      <div className="px-4 pt-5 pb-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          {company?.logo
            ? <img src={company.logo} className="w-10 h-10 rounded-xl object-cover border border-border shadow" alt="" />
            : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shadow">
                <Truck className="w-5 h-5 text-primary" />
              </div>
            )}
          <div className="min-w-0">
            <p className="text-sm font-black truncate leading-tight">{company?.name ?? u?.displayName ?? "المندوب"}</p>
            <p className="text-[10px] text-muted-foreground">بوابة المندوب</p>
          </div>
        </div>

        {/* delivery rate pill */}
        {d && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border px-3 py-2"
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
      <nav className="flex-1 px-3 py-4 space-y-1.5">
        {NAV_ITEMS.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-right transition-all duration-200 group ${
                isActive
                  ? `${item.activeBg} ${item.activeColor}`
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
              style={isActive ? { boxShadow: `0 0 16px ${item.glowColor}` } : {}}
            >
              {/* Icon bubble */}
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${
                isActive
                  ? "bg-current/10"
                  : "bg-muted/30 group-hover:bg-muted/60"
              }`}>
                <item.Icon className={`w-4 h-4 ${isActive ? "" : "opacity-60 group-hover:opacity-90"}`} />
              </span>
              <div className="min-w-0 text-right">
                <p className={`text-sm font-bold leading-tight ${isActive ? "" : "text-foreground/80"}`}>{item.label}</p>
                <p className="text-[10px] opacity-60 leading-none mt-0.5">{item.sublabel}</p>
              </div>
              {isActive && (
                <span className="mr-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "currentColor" }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="px-4 pb-4 pt-2 border-t border-border/30">
        <button
          onClick={onClose}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-all"
        >
          <ChevronRight className="w-3 h-3" /> إغلاق القائمة
        </button>
      </div>
    </aside>
    </>
  );
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────
function MobileBottomNav({ active, onSelect }: { active: TabId; onSelect: (t: TabId) => void }) {
  return (
    <nav
      dir="rtl"
      className="md:hidden fixed bottom-0 right-0 left-0 z-50 flex items-stretch"
      style={{
        background: "hsl(var(--card))",
        borderTop: "1px solid hsl(var(--border))",
        paddingBottom: "env(safe-area-inset-bottom)",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.25)",
      }}
    >
      {NAV_ITEMS.map(item => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 relative transition-all duration-200"
          >
            {/* active glow pill */}
            {isActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full"
                style={{ background: item.glowColor.replace("0.35", "1") }}
              />
            )}
            {/* icon container */}
            <span className={`w-10 h-7 rounded-xl flex items-center justify-center transition-all duration-200 ${
              isActive ? item.activeBg : ""
            }`}
              style={isActive ? { boxShadow: `0 0 10px ${item.glowColor}` } : {}}>
              <item.Icon className={`w-4.5 h-4.5 transition-all duration-200 ${isActive ? item.activeColor : "text-muted-foreground"}`}
                style={{ width: "18px", height: "18px" }} />
            </span>
            <span className={`text-[10px] font-bold transition-colors duration-200 ${isActive ? item.activeColor : "text-muted-foreground"}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default function RepresentativeDashboard() {
  const { user, isRepresentative } = useAuth();
  const [activeTab, setActiveTab] = useState<"shipments" | "manifests" | "performance" | "tasks">("performance");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ─── SSE: استقبال إشعارات الاستعجال الفورية ───────────────────────────────
  const { toast } = useToast();
  useEffect(() => {
    if (!user) return;
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
        onSelect={(t) => { setActiveTab(t); setSidebarOpen(false); }}
        company={company}
        user={user}
        d={d}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ─── Main Content ─── */}
      <div className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ${sidebarOpen ? "md:mr-56" : "md:mr-0"}`}>
        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-40 flex items-center gap-3 px-4 py-3 border-b border-border/50"
          style={{ background: "hsl(var(--card))", backdropFilter: "blur(8px)" }}>
          {company?.logo
            ? <img src={company.logo} className="w-8 h-8 rounded-lg object-cover border border-border" alt="" />
            : <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Truck className="w-4 h-4 text-primary/60" />
              </div>}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black truncate">{company?.name ?? user?.displayName}</h1>
            <p className="text-[10px] text-muted-foreground">بوابة المندوب</p>
          </div>
          {d && (
            <Badge variant="outline"
              className={d.deliveryRate >= 70 ? "text-[10px] border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : d.deliveryRate >= 40 ? "text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10" : "text-[10px] border-red-500/40 text-red-400 bg-red-500/10"}>
              {d.deliveryRate}% تسليم
            </Badge>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 p-4 pb-24 md:pb-6 space-y-4 animate-in fade-in duration-500">

          {/* ─── Today Strip (always visible) ─── */}
          <TodayStrip shipments={allShipments} />

          {/* ─── Performance Tab ─── */}
          {activeTab === "performance" && (
            <PerformanceTab d={d} allShipments={allShipments} />
          )}

          {/* ─── Manifests Tab ─── */}
          {activeTab === "manifests" && <ManifestsTab companyId={company?.id ?? null} />}

          {/* ─── Today Tasks Tab ─── */}
          {activeTab === "tasks" && <TodayTasksTab companyId={company?.id ?? null} />}

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

              {/* Shipments list */}
              <div className="space-y-2">
                {s?.data?.map((sh: any) => (
                  <Card key={sh.id} className="p-3 bg-card/60 border-border">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{sh.receiverName}</p>
                        <p className="text-[10px] text-muted-foreground flex gap-1 flex-wrap mt-0.5">
                          <span className="font-mono text-primary/70">{sh.shipmentNumber}</span>
                          {sh.receiverPhone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{sh.receiverPhone}</span>}
                          {sh.receiverCity && <span>· {sh.receiverCity}</span>}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[9px] shrink-0 border ${STATUS_COLOR[sh.status] ?? "border-border"}`}>
                        {STATUS_LABELS[sh.status] ?? sh.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-[11px] mt-2">
                      <span className="text-muted-foreground">{sh.createdAt ? format(new Date(sh.createdAt), "dd/MM/yyyy", { locale: ar }) : ""}</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(Number(sh.codAmount ?? 0))}</span>
                    </div>
                    {sh.returnReason && sh.status === "returned" && (
                      <p className="text-[10px] text-red-400/80 mt-1 border-t border-border/30 pt-1">
                        ↩ {sh.returnReason}
                      </p>
                    )}
                  </Card>
                ))}
                {s?.data?.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">لا توجد شحنات</p>
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
        <MobileBottomNav active={activeTab} onSelect={setActiveTab} />
      </div>{/* end main content */}
    </div>
  );
}
