import { useEffect, useState } from "react";
import { motion, animate, useReducedMotion } from "framer-motion";
import {
  Medal, Award, Trophy, Crown, Sprout, ShieldCheck, Gem, Star, Target, Lightbulb, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Info, Lock, Flag, CalendarDays, Gauge, Pencil, Check, X, Loader2,
  Rocket, Flame, Sparkles, Zap, Settings2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ═══════════════════════════════════════════════════════════════════════════
// كارت مستوى العميل الشهري (8 مستويات: مبتدئ ← برونز ← سيلفر ← ... ← أسطورة)
// بيتعرض في لوحة الأدمن (تفاصيل العميل) وفي بوابة العميل — نفس الداتا من الـ API.
// حدود المستويات وأسماءها وألوانها وصورها بيعدّلها الأدمن (client-tier-settings.tsx)،
// والـ API بيرجّعها جاهزة جوه data.ladder / data.tier / data.nextTier.
// ═══════════════════════════════════════════════════════════════════════════

export type TierKey = string;
export type TierIconKey = "sprout" | "medal" | "award" | "trophy" | "shield" | "gem" | "star" | "crown";

/** هوية المستوى — الحقول الاختيارية للتوافق مع API قديم لسه مرجّعش اللون/الأيقونة/الصورة */
export interface TierBrand {
  key: TierKey;
  name: string;
  min: number;
  max?: number | null;
  color?: string;
  icon?: TierIconKey;
  image?: string | null;
}

export interface ClientTierData {
  month: { key: string; label: string; daysElapsed: number; daysInMonth: number; daysLeft: number };
  count: number;
  returns: number;
  tier: TierBrand | null;
  nextTier: (TierBrand & { remaining: number }) | null;
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
  ladder: (TierBrand & { perks: string[]; status: "achieved" | "current" | "locked" })[];
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
  tier: { key: TierKey; name: string; color?: string; icon?: TierIconKey } | null;
  nextTier: { key: TierKey; name: string; min: number; remaining: number } | null;
  progressPct: number;
  /** التارجت الشهري (0 = لسه متحددش) */
  target?: number;
}

export const TIER_ICONS: Record<TierIconKey, typeof Medal> = {
  sprout: Sprout, medal: Medal, award: Award, trophy: Trophy,
  shield: ShieldCheck, gem: Gem, star: Star, crown: Crown,
};

/** قيم احتياطية لو الـ API لسه بيرجّع مستويات من غير لون/أيقونة (نفس افتراضيات السيرفر) */
const TIER_FALLBACK: Record<string, { color: string; icon: TierIconKey; name: string }> = {
  starter:  { color: "#e2e8f0", icon: "crown",  name: "STARTER" },
  bronze:   { color: "#d08a4a", icon: "crown",  name: "BRONZE" },
  silver:   { color: "#a8b3c5", icon: "crown",  name: "SILVER" },
  gold:     { color: "#f5b82e", icon: "crown",  name: "GOLD" },
  vip:      { color: "#38bdf8", icon: "crown",  name: "VIP" },
  vip_plus: { color: "#a855f7", icon: "crown",  name: "VIP PLUS" },
  elite:    { color: "#ef4444", icon: "crown",  name: "ELITE" },
  partner:  { color: "#f3d9a0", icon: "shield", name: "STARK PARTNER" },
};
const NONE_COLOR = "#64748b";

/** بيضيف شفافية للون hex (#rrggbb) */
export const alpha = (hex: string, a: number) =>
  /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + Math.round(a * 255).toString(16).padStart(2, "0") : hex;

export interface TierLook { color: string; soft: string; Icon: typeof Medal; image: string | null; name: string }

/** بيحوّل أي وصف مستوى (من الـ API) لشكل جاهز للرسم: لون + أيقونة + صورة + اسم */
export function tierLook(
  t: { key?: string | null; name?: string; color?: string; icon?: TierIconKey; image?: string | null } | null | undefined,
): TierLook {
  if (!t || !t.key) return { color: NONE_COLOR, soft: alpha(NONE_COLOR, 0.14), Icon: Target, image: null, name: "بدون مستوى" };
  const fb = TIER_FALLBACK[t.key];
  const color = t.color ?? fb?.color ?? NONE_COLOR;
  return {
    color,
    soft: alpha(color, 0.16),
    Icon: TIER_ICONS[t.icon ?? fb?.icon ?? "medal"],
    image: t.image ?? null,
    name: t.name ?? fb?.name ?? t.key,
  };
}

const n = (v: number) => v.toLocaleString("en-US");

/** نطاق المستوى: 0–100 / 101–200 / 2001+ */
export const rangeLabel = (t: { min: number; max?: number | null }) =>
  t.max == null ? `${n(t.min)}+` : `${n(t.min)}–${n(t.max)}`;

// ── شعار المستوى: الصورة اللي الأدمن رفعها، أو الأيقونة الافتراضية ──────────
export function TierEmblem({ look, size = 40, glow = false, className = "" }: {
  look: TierLook; size?: number; glow?: boolean; className?: string;
}) {
  return (
    <div
      className={`relative shrink-0 rounded-full flex items-center justify-center overflow-hidden ${className}`}
      style={{
        width: size, height: size,
        background: look.image ? "hsl(var(--card))" : look.soft,
        border: `2px solid ${look.color}`,
        boxShadow: glow ? `0 0 0 4px ${alpha(look.color, 0.15)}, 0 0 22px ${alpha(look.color, 0.45)}` : undefined,
      }}
    >
      {look.image
        ? <img src={look.image} alt={look.name} className="w-full h-full object-cover" draggable={false} />
        : <look.Icon style={{ color: look.color, width: size * 0.5, height: size * 0.5 }} />}
    </div>
  );
}

// ── بادج صغير للمستوى (يُستخدم في قايمة العملاء وأي مكان تاني) ─────────────
export function TierBadge({ tierKey, name, color, icon, size = "sm", className = "" }: {
  tierKey: TierKey | null | undefined; name?: string; color?: string; icon?: TierIconKey;
  size?: "sm" | "md"; className?: string;
}) {
  const look = tierLook(tierKey ? { key: tierKey, name, color, icon } : null);
  const Icon = look.Icon;
  const pad = size === "md" ? "px-2.5 py-1 text-xs gap-1.5" : "px-2 py-0.5 text-[10px] gap-1";
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold border whitespace-nowrap ${pad} ${className}`}
      style={{ color: look.color, background: look.soft, borderColor: `${look.color}55` }}
    >
      <Icon className={size === "md" ? "w-3.5 h-3.5" : "w-3 h-3"} />
      {name ?? look.name}
    </span>
  );
}

// ── عدّاد بيعدّ من 0 للرقم (احترامًا لـ reduced-motion بيعرض الرقم مباشرة) ──
function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setV(value); return; }
    const c = animate(0, value, { duration: 1.1, ease: "easeOut", onUpdate: x => setV(Math.round(x)) });
    return () => c.stop();
  }, [value, reduce]);
  return <>{n(v)}</>;
}

// ── الدايرة: تقدّم العميل نحو المستوى التالي، وفي النص شعار المستوى الحالي ────
function TierRing({ data }: { data: ClientTierData }) {
  const reduce = useReducedMotion();
  const look = tierLook(data.tier);
  const reached = !!data.target?.reached;
  const color = reached ? "#34d399" : look.color;
  const SIZE = 168, R = 70, C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, data.progressPct));
  const gid = `tier-grad-${data.tier?.key ?? "none"}${reached ? "-ok" : ""}`;
  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      {/* هالة متحركة حوالين الدايرة */}
      <motion.div
        aria-hidden
        className="absolute inset-3 rounded-full blur-xl"
        style={{ background: `conic-gradient(from 0deg, ${alpha(color, 0.6)}, transparent 35%, ${alpha(color, 0.35)} 65%, transparent)` }}
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
      />
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="relative -rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity=".55" />
          </linearGradient>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="hsl(var(--muted))" strokeOpacity=".35" strokeWidth="10" />
        <motion.circle
          cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={`url(#${gid})`} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - pct / 100) }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 7px ${alpha(color, 0.45)})` }}
        />
      </svg>
      {/* نقطة لامعة بتدور حوالين الدايرة */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          animate={{ rotate: 360 }}
          transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
        >
          <span
            className="absolute left-1/2 -translate-x-1/2 top-[10px] w-2 h-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 10px 2px ${alpha(color, 0.85)}` }}
          />
        </motion.div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <motion.div
          animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <TierEmblem look={look} size={62} glow />
        </motion.div>
        <p className="text-[13px] font-black leading-none mt-1.5" style={{ color: data.tier ? look.color : undefined }}>
          {data.tier ? look.name : "بداية"}
        </p>
        {data.target ? (
          <>
            <p className="text-[11px] font-bold leading-none mt-1.5">{n(data.count)} / {n(data.target.value)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% من التارجت</p>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-1.5">{pct}% للمستوى التالي</p>
        )}
      </div>
    </div>
  );
}

// ── سلّم المستويات: كارت لكل مستوى (شعار + اسم + نطاق الشحنات) ───────────────
function TierLadder({ data }: { data: ClientTierData }) {
  const reduce = useReducedMotion();
  const tierProgress = Math.max(0, Math.min(100, data.tierProgressPct ?? data.progressPct));
  // شكل الدرع السداسي (زي بوستر ستارك)
  const HEX = "polygon(9% 0, 91% 0, 100% 50%, 91% 100%, 9% 100%, 0 50%)";
  const SPARKS = [
    { top: "18%", left: "14%", size: 4, delay: 0 },
    { top: "28%", left: "82%", size: 3, delay: 0.7 },
    { top: "70%", left: "20%", size: 3, delay: 1.3 },
    { top: "76%", left: "78%", size: 4, delay: 0.4 },
  ];
  const last = data.ladder.length - 1;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="rtl">
      {data.ladder.map((step, i) => {
        const look = tierLook(step);
        const isCur = step.status === "current";
        const done = step.status === "achieved";
        const active = isCur || done;
        const premium = isCur || i === last;
        return (
          <motion.div
            key={step.key}
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            whileHover={reduce ? undefined : { y: -4, scale: 1.03 }}
            transition={{ delay: reduce ? 0 : i * 0.06, duration: 0.4, ease: "easeOut" }}
            className="relative"
            style={{
              filter: isCur
                ? `drop-shadow(0 6px 16px ${alpha(look.color, 0.55)})`
                : active
                  ? `drop-shadow(0 3px 9px ${alpha(look.color, 0.28)})`
                  : `drop-shadow(0 2px 6px ${alpha(look.color, 0.14)})`,
            }}
          >
            {/* توهّج نابض ورا المستوى الحالي */}
            {isCur && !reduce && (
              <motion.div
                aria-hidden
                className="absolute inset-3 rounded-full blur-2xl pointer-events-none"
                style={{ background: alpha(look.color, 0.5) }}
                animate={{ opacity: [0.25, 0.7, 0.25] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            {/* الإطار المتدرّج */}
            <div
              style={{
                clipPath: HEX,
                padding: 1.5,
                background: `linear-gradient(135deg, ${alpha(look.color, isCur ? 1 : active ? 0.85 : 0.5)}, ${alpha(look.color, 0.15)} 55%, ${alpha(look.color, isCur ? 0.8 : 0.35)})`,
              }}
            >
              <div
                className="relative overflow-hidden flex flex-col items-center text-center gap-1.5 px-4 pt-3.5 pb-3.5"
                style={{
                  clipPath: HEX,
                  background: `radial-gradient(130% 100% at 50% 0%, ${alpha(look.color, isCur ? 0.34 : active ? 0.2 : 0.11)}, hsl(var(--card)) 72%)`,
                }}
              >
                {/* لمعة بتعدّي على المستوى الحالي وآخر مستوى */}
                {premium && !reduce && (
                  <motion.div
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-1/3 pointer-events-none"
                    style={{ background: `linear-gradient(100deg, transparent, ${alpha(look.color, 0.3)}, transparent)` }}
                    initial={{ x: "-120%" }}
                    animate={{ x: "420%" }}
                    transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                  />
                )}
                {/* نقط لامعة بتومّض حوالين المستوى الحالي */}
                {isCur && !reduce && SPARKS.map((s, k) => (
                  <motion.span
                    key={k}
                    aria-hidden
                    className="absolute rounded-full pointer-events-none"
                    style={{ width: s.size, height: s.size, top: s.top, left: s.left, background: look.color, boxShadow: `0 0 8px 1px ${look.color}` }}
                    animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 0.4] }}
                    transition={{ duration: 2.2, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
                  />
                ))}
                {/* رقم المستوى */}
                <span
                  className="absolute top-1.5 right-7 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{
                    border: `1.5px solid ${alpha(look.color, active ? 0.9 : 0.5)}`,
                    color: look.color,
                    background: alpha(look.color, 0.12),
                  }}
                >
                  {i + 1}
                </span>
                <motion.div
                  className="relative"
                  animate={isCur && !reduce ? { y: [0, -3, 0] } : undefined}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <TierEmblem look={look} size={isCur ? 56 : 46} glow={isCur} className={active ? "" : "opacity-75"} />
                  {done && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-card flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" style={{ color: look.color }} />
                    </span>
                  )}
                  {!active && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center">
                      <Lock className="w-2.5 h-2.5 text-muted-foreground/70" />
                    </span>
                  )}
                </motion.div>
                <p className="text-[12px] font-black leading-none tracking-wide" style={{ color: look.color, opacity: active ? 1 : 0.85 }}>
                  {step.name}
                </p>
                <p className="text-[10px] text-muted-foreground leading-none">{rangeLabel(step)} شحنة</p>
                {isCur && (
                  <>
                    {data.nextTier && (
                      <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: look.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${tierProgress}%` }}
                          transition={{ duration: 1.1, ease: "easeOut" }}
                        />
                      </div>
                    )}
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: alpha(look.color, 0.2), color: look.color }}>
                      أنت هنا
                    </span>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── تاريخ آخر 6 شهور ───────────────────────────────────────────────────────
function TierHistory({ data }: { data: ClientTierData }) {
  const max = Math.max(1, ...data.history.map(h => h.count), data.ladder[1]?.min ?? 1);
  const lookOf = (key: TierKey | null) => tierLook(data.ladder.find(l => l.key === key) ?? (key ? { key } : null));
  return (
    <div>
      <p className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
        <CalendarDays className="w-3 h-3" /> آخر 6 شهور
      </p>
      <div className="flex items-end gap-2 h-[74px]" dir="rtl">
        {[...data.history].reverse().map((h, i) => {
          const st = lookOf(h.tierKey);
          const isCur = i === 0;
          const has = h.count > 0 && !!h.tierKey;
          return (
            <div key={h.key} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${h.label}: ${h.count} شحنة${has ? ` — ${st.name}` : ""}`}>
              <span className="text-[9px] text-muted-foreground leading-none">{h.count > 0 ? n(h.count) : ""}</span>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${Math.max(4, (h.count / max) * 48)}px`,
                  background: has ? st.color : "hsl(var(--muted-foreground)/.35)",
                  opacity: isCur ? 1 : 0.6,
                  boxShadow: isCur && has ? `0 0 10px ${alpha(st.color, 0.4)}` : undefined,
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

export function ClientTierCard({ data, isLoading, variant = "client", className = "", onSaveTarget, onEditTiers }: {
  data: ClientTierData | null | undefined;
  isLoading?: boolean;
  variant?: "admin" | "client";
  className?: string;
  /** لو موجودة (للأدمن بس) بيظهر زرار تحديد/تعديل التارجت الشهري. لازم ترمي error لو الحفظ فشل. */
  onSaveTarget?: (value: number) => Promise<void>;
  /** لو موجودة (للأدمن بس) بيظهر زرار "إعدادات المستويات" (حدود + صور + ألوان) */
  onEditTiers?: () => void;
}) {
  const reduce = useReducedMotion();
  if (isLoading) {
    return <Card className={`p-5 animate-pulse h-[300px] ${className}`} />;
  }
  if (!data) return null;

  const look = tierLook(data.tier);
  const glow = data.tier ? look.color : NONE_COLOR;
  const isAdmin = variant === "admin";
  const currentStep = data.ladder.find(l => l.status === "current");
  const perksStep = currentStep && currentStep.perks.length > 0 ? currentStep
    : data.ladder.find(l => l.key === data.nextTier?.key && l.perks.length > 0);
  const perksLook = perksStep ? tierLook(perksStep) : null;
  const curStep = currentStep ?? data.tier;

  return (
    <Card
      dir="rtl"
      className={`card-glow relative overflow-hidden border-border p-4 sm:p-5 ${className}`}
      style={{
        background: `linear-gradient(145deg, ${alpha(glow, 0.09)} 0%, hsl(var(--card)/.90) 55%)`,
        boxShadow: `0 0 0 1px ${alpha(glow, 0.22)}, 0 6px 28px -8px ${alpha(glow, 0.25)}`,
      }}
    >
      {/* شريط لامع بيعدّي على أعلى الكارت */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="absolute top-0 left-0 h-[2px] w-1/3 pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${glow}, transparent)` }}
          initial={{ x: "-100%" }}
          animate={{ x: "300%" }}
          transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
        />
      )}

      {/* ── الهيدر ── */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <p className="text-sm font-black flex items-center gap-2">
          <Gauge className="w-4 h-4" style={{ color: glow }} />
          {isAdmin ? "مستوى العميل الشهري" : "مستواك هذا الشهر"}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && data.atRisk && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-700 bg-amber-900/30 text-amber-400">
              <TrendingDown className="w-3 h-3" /> معرّض للتراجع
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground">
            <CalendarDays className="w-3 h-3" /> {data.month.label} · باقي {data.month.daysLeft} يوم
          </span>
          {isAdmin && onEditTiers && (
            <button
              type="button" onClick={onEditTiers}
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              <Settings2 className="w-3 h-3" /> إعدادات المستويات
            </button>
          )}
        </div>
      </div>

      {/* ── رسالة تشجيع للعميل (مش بتظهر للأدمن) ── */}
      {!isAdmin && data.motivation && <MotivationBanner m={data.motivation} />}

      <div className="grid gap-5 md:grid-cols-2">
        {/* ── العمود الأول: الدايرة + الأرقام ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <TierRing data={data} />
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-[11px] text-muted-foreground">{isAdmin ? "شحنات العميل في" : "شحناتك في"} {data.month.label}</p>
                <p className="text-3xl font-black leading-tight" style={{ color: data.tier ? look.color : undefined }}>
                  <CountUp value={data.count} /> <span className="text-xs font-bold text-muted-foreground">شحنة</span>
                </p>
                {curStep && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    مستوى {look.name}: {rangeLabel(curStep)} شحنة في الشهر
                  </p>
                )}
              </div>
              {data.nextTier ? (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  باقي <b className="text-foreground">{n(data.nextTier.remaining)}</b> شحنة للوصول إلى{" "}
                  <TierBadge tierKey={data.nextTier.key} name={data.nextTier.name} color={data.nextTier.color} icon={data.nextTier.icon} />
                </p>
              ) : (
                <p className="text-[11px] font-bold" style={{ color: look.color }}>وصلت لأعلى مستوى 🎉</p>
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

          {perksStep && perksLook && (
            <div className="rounded-xl border p-3" style={{ borderColor: alpha(perksLook.color, 0.25), background: perksLook.soft }}>
              <p className="text-[11px] font-bold mb-1.5" style={{ color: perksLook.color }}>
                مزايا المستوى {perksStep.name}
              </p>
              <ul className="space-y-1">
                {perksStep.perks.map((p, i) => (
                  <li key={i} className="text-[11px] flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" style={{ color: perksLook.color }} /> {p}
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

      {/* ── سلّم المستويات (عرض كامل) ── */}
      <div className="mt-5 pt-4 border-t border-border/60">
        <p className="text-[11px] font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
          <Trophy className="w-3 h-3" /> مستويات الشحنات الشهرية
        </p>
        <TierLadder data={data} />
      </div>
    </Card>
  );
}
