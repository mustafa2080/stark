import { useState } from "react";
import { motion } from "framer-motion";
import {
  Medal, Award, Trophy, Crown, Target, Lightbulb, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Info, Lock, Flag, CalendarDays, Gauge, Pencil, Check, X, Loader2,
  Rocket, Flame, Sparkles, Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ═══════════════════════════════════════════════════════════════════════════
// كارت مستوى العميل الشهري (برونزي / فضي / ذهبي / VIP)
// بيتعرض في لوحة الأدمن (تفاصيل العميل) وفي بوابة العميل — نفس الداتا من الـ API.
// ═══════════════════════════════════════════════════════════════════════════

export type TierKey = "bronze" | "silver" | "gold" | "vip";

export interface ClientTierData {
  month: { key: string; label: string; daysElapsed: number; daysInMonth: number; daysLeft: number };
  count: number;
  returns: number;
  tier: { key: TierKey; name: string } | null;
  nextTier: { key: TierKey; name: string; min: number; remaining: number } | null;
  /** لو في تارجت = نسبة التارجت، وإلا نسبة المستوى التالي */
  progressPct: number;
  /** نسبة التقدّم نحو المستوى التالي (لسلّم المستويات) */
  tierProgressPct: number;
  /** التارجت الشهري اللي الأدمن حدده للعميل (null = لسه متحددش) */
  target: { value: number; remaining: number; pct: number; reached: boolean; projectedPct: number | null } | null;
  prevMonth: { label: string; count: number; tierKey: TierKey | null };
  trendPct: number | null;
  projected: { count: number; tierKey: TierKey | null } | null;
  atRisk: boolean;
  history: { key: string; label: string; count: number; tierKey: TierKey | null }[];
  ladder: { key: TierKey; name: string; min: number; perks: string[]; status: "achieved" | "current" | "locked" }[];
  tips: { kind: "goal" | "success" | "warning" | "info"; text: string }[];
  /** رسالة تشجيع شخصية للعميل — اختيارية عشان الـ API القديم ممكن ما يرجعهاش */
  motivation?: TierMotivation;
}

export type MotivationStage =
  | "new_month" | "start" | "push" | "almost" | "on_track" | "target_reached" | "top";

export interface TierMotivation {
  stage: MotivationStage;
  headline: string;
  message: string;
  /** الشحنات اليومية المطلوبة للوصول للهدف الأقرب */
  dailyPace: number | null;
  focusLabel: string | null;
}

export interface ClientTierLite {
  count: number;
  tier: { key: TierKey; name: string } | null;
  nextTier: { key: TierKey; name: string; min: number; remaining: number } | null;
  progressPct: number;
  /** التارجت الشهري (0 = لسه متحددش) */
  target?: number;
}

export const TIER_STYLE: Record<TierKey | "none", { color: string; soft: string; label: string; Icon: typeof Medal }> = {
  none:   { color: "#64748b", soft: "rgba(100,116,139,.14)", label: "بدون مستوى", Icon: Target },
  bronze: { color: "#d08a4a", soft: "rgba(208,138,74,.16)",  label: "برونزي",     Icon: Medal  },
  silver: { color: "#cbd5e1", soft: "rgba(203,213,225,.14)", label: "فضي",        Icon: Award  },
  gold:   { color: "#f5b82e", soft: "rgba(245,184,46,.16)",  label: "ذهبي",       Icon: Trophy },
  vip:    { color: "#c084fc", soft: "rgba(192,132,252,.18)", label: "VIP",        Icon: Crown  },
};

const styleOf = (k: TierKey | null | undefined) => TIER_STYLE[k ?? "none"];
const n = (v: number) => v.toLocaleString("en-US");

// ── بادج صغير للمستوى (يُستخدم في قايمة العملاء وأي مكان تاني) ─────────────
export function TierBadge({ tierKey, name, size = "sm", className = "" }: {
  tierKey: TierKey | null | undefined; name?: string; size?: "sm" | "md"; className?: string;
}) {
  const s = styleOf(tierKey);
  const Icon = s.Icon;
  const pad = size === "md" ? "px-2.5 py-1 text-xs gap-1.5" : "px-2 py-0.5 text-[10px] gap-1";
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold border whitespace-nowrap ${pad} ${className}`}
      style={{ color: s.color, background: s.soft, borderColor: `${s.color}55` }}
    >
      <Icon className={size === "md" ? "w-3.5 h-3.5" : "w-3 h-3"} />
      {name ?? s.label}
    </span>
  );
}

// ── الدايرة: تقدّم العميل نحو المستوى التالي، وفي النص المستوى الحالي ────────
function TierRing({ data }: { data: ClientTierData }) {
  const s = styleOf(data.tier?.key ?? null);
  const reached = !!data.target?.reached;
  const color = reached ? "#34d399" : data.tier ? s.color : TIER_STYLE.bronze.color;
  const R = 54, C = 2 * Math.PI * R;
  const Icon = s.Icon;
  const pct = Math.max(0, Math.min(100, data.progressPct));
  const gid = `tier-grad-${data.tier?.key ?? "none"}${reached ? "-ok" : ""}`;
  return (
    <div className="relative shrink-0" style={{ width: 144, height: 144 }}>
      <svg width="144" height="144" viewBox="0 0 144 144" className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity=".55" />
          </linearGradient>
        </defs>
        <circle cx="72" cy="72" r={R} fill="none" stroke="hsl(var(--muted))" strokeOpacity=".35" strokeWidth="10" />
        <motion.circle
          cx="72" cy="72" r={R} fill="none" stroke={`url(#${gid})`} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - pct / 100) }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <Icon className="w-6 h-6 mb-1" style={{ color: data.tier ? s.color : "hsl(var(--muted-foreground))" }} />
        <p className="text-base font-black leading-none" style={{ color: data.tier ? s.color : undefined }}>
          {data.tier ? data.tier.name : "بداية"}
        </p>
        {data.target ? (
          <>
            <p className="text-[11px] font-bold leading-none mt-1.5">{n(data.count)} / {n(data.target.value)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% من التارجت</p>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-1">{pct}% للمستوى التالي</p>
        )}
      </div>
    </div>
  );
}

// ── سلّم المستويات ─────────────────────────────────────────────────────────
function TierLadder({ data }: { data: ClientTierData }) {
  const idx = data.ladder.findIndex(l => l.status === "current");
  const fill = idx === -1 ? 0 : data.nextTier ? (idx + (data.tierProgressPct ?? data.progressPct) / 100) / (data.ladder.length - 1) : 1;
  return (
    <div className="relative flex items-start" dir="rtl">
      <div className="absolute h-[3px] rounded-full bg-muted/40" style={{ top: 19, right: "12.5%", width: "75%" }} />
      <motion.div
        className="absolute h-[3px] rounded-full"
        style={{ top: 19, right: "12.5%", background: styleOf(data.tier?.key ?? "bronze").color }}
        initial={{ width: 0 }}
        animate={{ width: `${fill * 75}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      {data.ladder.map(step => {
        const st = styleOf(step.key);
        const Icon = st.Icon;
        const isCur = step.status === "current";
        const done = step.status === "achieved";
        return (
          <div key={step.key} className="relative flex-1 flex flex-col items-center text-center gap-1.5">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center border-2 bg-card"
              style={{
                borderColor: done || isCur ? st.color : "hsl(var(--border))",
                background: done || isCur ? st.soft : undefined,
                boxShadow: isCur ? `0 0 0 4px ${st.color}22, 0 0 18px ${st.color}55` : undefined,
              }}
            >
              {done ? <CheckCircle2 className="w-4 h-4" style={{ color: st.color }} />
                : isCur ? <Icon className="w-4 h-4" style={{ color: st.color }} />
                : <Lock className="w-3.5 h-3.5 text-muted-foreground/60" />}
            </div>
            <p className="text-[11px] font-bold leading-none" style={{ color: done || isCur ? st.color : "hsl(var(--muted-foreground))" }}>
              {step.name}
            </p>
            <p className="text-[10px] text-muted-foreground leading-none">{n(step.min)}+ شحنة</p>
          </div>
        );
      })}
    </div>
  );
}

// ── تاريخ آخر 6 شهور ───────────────────────────────────────────────────────
function TierHistory({ data }: { data: ClientTierData }) {
  const max = Math.max(1, ...data.history.map(h => h.count), data.ladder[0]?.min ?? 1);
  return (
    <div>
      <p className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
        <CalendarDays className="w-3 h-3" /> آخر 6 شهور
      </p>
      <div className="flex items-end gap-2 h-[74px]" dir="rtl">
        {[...data.history].reverse().map((h, i) => {
          const st = styleOf(h.tierKey);
          const isCur = i === 0;
          return (
            <div key={h.key} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${h.label}: ${h.count} شحنة`}>
              <span className="text-[9px] text-muted-foreground leading-none">{h.count > 0 ? n(h.count) : ""}</span>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${Math.max(4, (h.count / max) * 48)}px`,
                  background: h.tierKey ? st.color : "hsl(var(--muted-foreground)/.35)",
                  opacity: isCur ? 1 : 0.6,
                  boxShadow: isCur ? `0 0 10px ${st.color}66` : undefined,
                }}
              />
              <span className={`text-[9px] leading-none ${isCur ? "font-bold text-foreground" : "text-muted-foreground"}`}>{h.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── التارجت الشهري: عرض + تعديل (للأدمن بس — لو onSave موجودة) ─────────────
function TargetRow({ target, onSave }: {
  target: ClientTierData["target"];
  onSave?: (value: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  if (!target && !onSave) return null;

  const start = () => { setVal(target ? String(target.value) : ""); setEditing(true); };
  const num = Number(val);
  const valid = val.trim() !== "" && Number.isInteger(num) && num >= 0 && num <= 100000;
  const submit = async () => {
    if (!onSave || !valid || saving) return;
    setSaving(true);
    try { await onSave(num); setEditing(false); }
    catch { /* الصفحة بتعرض رسالة الخطأ — بنسيب المحرر مفتوح */ }
    finally { setSaving(false); }
  };

  if (editing && onSave) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <Flag className="w-3 h-3 text-muted-foreground shrink-0" />
          <Input
            autoFocus type="number" inputMode="numeric" min={0} max={100000} step={1}
            value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setEditing(false); }}
            placeholder="عدد الشحنات"
            className="h-7 w-24 text-xs px-2"
          />
          <button
            type="button" onClick={submit} disabled={!valid || saving} title="حفظ"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-emerald-600/90 text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button" onClick={() => setEditing(false)} disabled={saving} title="إلغاء"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">عدد الشحنات المطلوبة في الشهر — اكتب 0 لإلغاء التارجت.</p>
      </div>
    );
  }

  if (!target) {
    return (
      <button
        type="button" onClick={start}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
      >
        <Flag className="w-3 h-3" /> تحديد التارجت الشهري
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <Flag className="w-3 h-3 text-muted-foreground" />
      <span className="text-muted-foreground">التارجت الشهري</span>
      <b>{n(target.value)}</b>
      <span className="text-muted-foreground">شحنة</span>
      {target.reached && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-900/25 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" /> تحقق
        </span>
      )}
      {onSave && (
        <button
          type="button" onClick={start} title="تعديل التارجت"
          className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

const TIP_STYLE = {
  goal:    { Icon: Flag,          color: "#60a5fa", bg: "rgba(96,165,250,.10)"  },
  success: { Icon: CheckCircle2,  color: "#34d399", bg: "rgba(52,211,153,.10)"  },
  warning: { Icon: AlertTriangle, color: "#fbbf24", bg: "rgba(251,191,36,.10)"  },
  info:    { Icon: Info,          color: "#94a3b8", bg: "rgba(148,163,184,.10)" },
} as const;

// ── بانر التشجيع (للعميل بس) — رسالة مخصصة حسب موقفه الفعلي في الشهر ─────────
const MOTIVATION_STYLE: Record<MotivationStage, { Icon: typeof Rocket; color: string }> = {
  new_month:      { Icon: Rocket,     color: "#60a5fa" },
  start:          { Icon: Zap,        color: "#60a5fa" },
  push:           { Icon: Flame,      color: "#fb923c" },
  almost:         { Icon: Target,     color: "#fbbf24" },
  on_track:       { Icon: TrendingUp, color: "#34d399" },
  target_reached: { Icon: Trophy,     color: "#34d399" },
  top:            { Icon: Crown,      color: "#c084fc" },
};

function MotivationBanner({ m }: { m: TierMotivation }) {
  const st = MOTIVATION_STYLE[m.stage] ?? { Icon: Sparkles, color: "#94a3b8" };
  const Icon = st.Icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mb-5 rounded-xl border p-3.5 flex items-start gap-3"
      style={{
        borderColor: `${st.color}40`,
        background: `linear-gradient(120deg, ${st.color}1f 0%, ${st.color}08 70%)`,
        borderInlineStartWidth: 3,
        borderInlineStartColor: st.color,
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${st.color}26`, boxShadow: `0 0 14px ${st.color}40` }}
      >
        <Icon style={{ color: st.color, width: 18, height: 18 }} />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[13px] font-black leading-snug" style={{ color: st.color }}>{m.headline}</p>
        <p className="text-[12px] leading-relaxed text-foreground/90">{m.message}</p>
        {(m.dailyPace !== null || m.focusLabel) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {m.focusLabel && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">
                <Flag className="w-3 h-3" /> هدفك الحالي: {m.focusLabel}
              </span>
            )}
            {m.dailyPace !== null && m.dailyPace > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${st.color}1f`, color: st.color }}
              >
                <Gauge className="w-3 h-3" /> المطلوب ≈ {n(m.dailyPace)} شحنة يوميًا
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function ClientTierCard({ data, isLoading, variant = "client", className = "", onSaveTarget }: {
  data: ClientTierData | null | undefined;
  isLoading?: boolean;
  variant?: "admin" | "client";
  className?: string;
  /** لو موجودة (للأدمن بس) بيظهر زرار تحديد/تعديل التارجت الشهري. لازم ترمي error لو الحفظ فشل. */
  onSaveTarget?: (value: number) => Promise<void>;
}) {
  if (isLoading) {
    return <Card className={`p-5 animate-pulse h-[300px] ${className}`} />;
  }
  if (!data) return null;

  const s = styleOf(data.tier?.key ?? null);
  const glow = data.tier ? s.color : "#64748b";
  const isAdmin = variant === "admin";
  const currentStep = data.ladder.find(l => l.status === "current");
  const perksStep = currentStep && currentStep.perks.length > 0 ? currentStep
    : data.ladder.find(l => l.key === data.nextTier?.key && l.perks.length > 0);

  return (
    <Card
      dir="rtl"
      className={`card-glow border-border p-4 sm:p-5 ${className}`}
      style={{
        background: `linear-gradient(145deg, ${glow}14 0%, hsl(var(--card)/.90) 55%)`,
        boxShadow: `0 0 0 1px ${glow}38, 0 6px 28px -8px ${glow}40`,
      }}
    >
      {/* ── الهيدر ── */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-sm font-black flex items-center gap-2">
          <Gauge className="w-4 h-4" style={{ color: glow }} />
          {isAdmin ? "مستوى العميل الشهري" : "مستواك هذا الشهر"}
        </p>
        <div className="flex items-center gap-2">
          {isAdmin && data.atRisk && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-700 bg-amber-900/30 text-amber-400">
              <TrendingDown className="w-3 h-3" /> معرّض للتراجع
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground">
            <CalendarDays className="w-3 h-3" /> {data.month.label} · باقي {data.month.daysLeft} يوم
          </span>
        </div>
      </div>

      {/* ── رسالة تشجيع للعميل (مش بتظهر للأدمن) ── */}
      {!isAdmin && data.motivation && <MotivationBanner m={data.motivation} />}

      <div className="grid gap-5 md:grid-cols-2">
        {/* ── العمود الأول: الدايرة + الأرقام + السلّم ── */}
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <TierRing data={data} />
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-[11px] text-muted-foreground">{isAdmin ? "شحنات العميل في" : "شحناتك في"} {data.month.label}</p>
                <p className="text-3xl font-black leading-tight" style={{ color: data.tier ? s.color : undefined }}>
                  {n(data.count)} <span className="text-xs font-bold text-muted-foreground">شحنة</span>
                </p>
              </div>
              {data.nextTier ? (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  باقي <b className="text-foreground">{n(data.nextTier.remaining)}</b> شحنة للوصول إلى{" "}
                  <TierBadge tierKey={data.nextTier.key} name={data.nextTier.name} />
                </p>
              ) : (
                <p className="text-[11px] font-bold" style={{ color: s.color }}>وصلت لأعلى مستوى 🎉</p>
              )}
              <TargetRow target={data.target ?? null} onSave={isAdmin ? onSaveTarget : undefined} />
              <div className="flex flex-wrap gap-1.5">
                {data.trendPct !== null && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${data.trendPct >= 0 ? "bg-emerald-900/25 text-emerald-400" : "bg-red-900/25 text-red-400"}`}>
                    {data.trendPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {data.trendPct >= 0 ? "+" : ""}{data.trendPct}% عن {data.prevMonth.label}
                  </span>
                )}
                {data.projected && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-muted/40 text-muted-foreground">
                    المتوقع {n(data.projected.count)} بنهاية الشهر
                  </span>
                )}
              </div>
            </div>
          </div>

          <TierLadder data={data} />

          {perksStep && (
            <div className="rounded-xl border p-3" style={{ borderColor: `${styleOf(perksStep.key).color}40`, background: styleOf(perksStep.key).soft }}>
              <p className="text-[11px] font-bold mb-1.5" style={{ color: styleOf(perksStep.key).color }}>
                مزايا المستوى {perksStep.name}
              </p>
              <ul className="space-y-1">
                {perksStep.perks.map((p, i) => (
                  <li key={i} className="text-[11px] flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" style={{ color: styleOf(perksStep.key).color }} /> {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── العمود الثاني: النصائح + التاريخ ── */}
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Lightbulb className="w-3 h-3" /> {isAdmin ? "ملاحظات للمتابعة" : "نصائح لرفع مستواك"}
            </p>
            <ul className="space-y-2">
              {data.tips.map((t, i) => {
                const ts = TIP_STYLE[t.kind];
                const TipIcon = ts.Icon;
                return (
                  <li key={i} className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] leading-relaxed" style={{ background: ts.bg }}>
                    <TipIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: ts.color }} />
                    <span>{t.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <TierHistory data={data} />
        </div>
      </div>
    </Card>
  );
}
