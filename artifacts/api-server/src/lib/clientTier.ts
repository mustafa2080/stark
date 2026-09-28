import { db, clientsTable, shipmentsTable } from "@workspace/db";
import { and, eq, gte, isNull, notInArray, or, sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════
// نظام مستويات العملاء التجاريين (Bronze → Silver → Gold → VIP)
// ─ المستوى بيتحدد من عدد شحنات العميل في الشهر الحالي، وبيبدأ من الصفر كل شهر.
// ─ ده المصدر الوحيد للحسبة: لوحة الأدمن وبوابة العميل بيقروا من نفس الدالة
//   فالأرقام والمستوى بيطلعوا متطابقين 100%.
// ─ لتغيير الحدود أو إضافة صلاحيات كل مستوى: عدّل TIER_LADDER تحت بس.
// ═══════════════════════════════════════════════════════════════════════════

export type TierKey = "bronze" | "silver" | "gold" | "vip";

export interface TierDef {
  key: TierKey;
  name: string;
  /** أقل عدد شحنات في الشهر للوصول للمستوى */
  min: number;
  /** صلاحيات/مزايا المستوى — بتظهر للعميل والأدمن لو مش فاضية */
  perks: string[];
}

export const TIER_LADDER: TierDef[] = [
  { key: "bronze", name: "برونزي", min: 10,  perks: [] },
  { key: "silver", name: "فضي",    min: 30,  perks: [] },
  { key: "gold",   name: "ذهبي",   min: 75,  perks: [] },
  { key: "vip",    name: "VIP",    min: 150, perks: [] },
];

// نفس الـ whitelist المستخدم في كارت "إجمالي الشحنات" — الشحنة اللي لسه
// "قيد الانتظار/مؤكدة" (أو ملغية) متتحسبش في المستوى.
const EXCLUDED_STATUSES = ["pending", "waiting", "confirmed", "cancelled"];
const RETURN_STATUSES = new Set(["returned"]);

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const cairoFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
});

function cairoYMD(d: Date): { y: number; m: number; d: number } {
  const p = cairoFmt.formatToParts(d);
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return { y: g("year"), m: g("month"), d: g("day") };
}

const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function tierForCount(n: number): TierDef | null {
  let hit: TierDef | null = null;
  for (const t of TIER_LADDER) if (n >= t.min) hit = t;
  return hit;
}

export interface TierShipmentRow { createdAt: Date | string | null; status: string }

export interface TierTip { kind: "goal" | "success" | "warning" | "info"; text: string }

/** رسالة تحفيزية للعميل — بتتغير حسب موقفه الفعلي في الشهر (مش عبارة ثابتة) */
export type MotivationStage =
  | "new_month" | "start" | "push" | "almost" | "on_track" | "target_reached" | "top";

export interface TierMotivation {
  stage: MotivationStage;
  headline: string;
  message: string;
  /** المعدل اليومي المطلوب للوصول للهدف الأقرب (null لو مش منطبق) */
  dailyPace: number | null;
  /** اسم الهدف الأقرب (مستوى أو تارجت) عشان الواجهة تعرضه */
  focusLabel: string | null;
}

/** التارجت الشهري اللي الأدمن كاتبه للعميل (عدد شحنات في الشهر) */
export interface ClientTarget {
  value: number;
  remaining: number;
  /** نسبة التحقيق 0–100 (بتتقفل على 100 حتى لو العميل عدّى التارجت) */
  pct: number;
  reached: boolean;
  /** نسبة التحقيق المتوقعة بنهاية الشهر (ممكن تعدّي 100) — null لو لسه بدري */
  projectedPct: number | null;
}

export interface ClientTierSummary {
  month: { key: string; label: string; daysElapsed: number; daysInMonth: number; daysLeft: number };
  count: number;
  returns: number;
  tier: { key: TierKey; name: string } | null;
  nextTier: { key: TierKey; name: string; min: number; remaining: number } | null;
  /** تقدّم العميل داخل الشريحة الحالية نحو المستوى التالي (0–100) */
  // لو الأدمن حدد تارجت للعميل بيبقى progressPct = نسبة التارجت، وإلا نسبة المستوى التالي
  progressPct: number;
  /** تقدّم العميل نحو المستوى التالي (لسلّم المستويات) — دايمًا مبني على المستويات */
  tierProgressPct: number;
  /** التارجت الشهري للعميل (null = لسه متحددش) */
  target: ClientTarget | null;
  prevMonth: { label: string; count: number; tierKey: TierKey | null };
  trendPct: number | null;
  projected: { count: number; tierKey: TierKey | null } | null;
  atRisk: boolean;
  history: { key: string; label: string; count: number; tierKey: TierKey | null }[];
  ladder: (TierDef & { status: "achieved" | "current" | "locked" })[];
  tips: TierTip[];
  /** رسالة تشجيع شخصية للعميل (بتظهر في بوابة العميل بس) */
  motivation: TierMotivation;
}

export function buildTierSummary(rows: TierShipmentRow[], now: Date = new Date(), targetValue = 0): ClientTierSummary {
  const today = cairoYMD(now);
  const daysInMonth = new Date(Date.UTC(today.y, today.m, 0)).getUTCDate();
  const daysElapsed = today.d;
  const daysLeft = daysInMonth - daysElapsed;

  // ── تجميع الشحنات على مفتاح الشهر (بتوقيت القاهرة) ──
  const counts = new Map<string, number>();
  let returns = 0;
  const curKey = monthKey(today.y, today.m);
  for (const r of rows) {
    if (!r.createdAt) continue;
    const c = cairoYMD(new Date(r.createdAt));
    const k = monthKey(c.y, c.m);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (k === curKey && RETURN_STATUSES.has(r.status)) returns++;
  }

  const count = counts.get(curKey) ?? 0;
  const tier = tierForCount(count);
  const tierIdx = tier ? TIER_LADDER.findIndex(t => t.key === tier.key) : -1;
  const next = TIER_LADDER[tierIdx + 1] ?? null;

  let progressPct = 100;
  if (next) {
    const floor = tier ? tier.min : 0;
    progressPct = Math.max(0, Math.min(100, Math.round(((count - floor) / (next.min - floor)) * 100)));
  }

  // ── آخر 6 شهور ──
  const history: ClientTierSummary["history"] = [];
  for (let i = 5; i >= 0; i--) {
    const s = shiftMonth(today.y, today.m, -i);
    const n = counts.get(monthKey(s.y, s.m)) ?? 0;
    history.push({ key: monthKey(s.y, s.m), label: AR_MONTHS[s.m - 1], count: n, tierKey: tierForCount(n)?.key ?? null });
  }
  const prevH = history[history.length - 2];
  const prevMonth = { label: prevH.label, count: prevH.count, tierKey: prevH.tierKey };

  // ── توقّع نهاية الشهر (بعد 5 أيام على الأقل عشان الرقم يبقى منطقي) ──
  const projected = count > 0 && daysElapsed >= 5
    ? (() => {
        const p = Math.round((count / daysElapsed) * daysInMonth);
        return { count: p, tierKey: tierForCount(p)?.key ?? null };
      })()
    : null;

  const targetInfo: ClientTarget | null = targetValue > 0
    ? {
        value: targetValue,
        remaining: Math.max(0, targetValue - count),
        pct: Math.min(100, Math.round((count / targetValue) * 100)),
        reached: count >= targetValue,
        projectedPct: projected ? Math.round((projected.count / targetValue) * 100) : null,
      }
    : null;

  const trendPct = prevMonth.count > 0 && projected
    ? Math.round(((projected.count - prevMonth.count) / prevMonth.count) * 100)
    : null;

  const rank = (k: TierKey | null) => (k ? TIER_LADDER.findIndex(t => t.key === k) : -1);
  const atRisk = !!projected && daysElapsed >= 10 && rank(projected.tierKey) < rank(prevMonth.tierKey);

  const nextInfo = next
    ? { key: next.key, name: next.name, min: next.min, remaining: Math.max(0, next.min - count) }
    : null;

  const ladder = TIER_LADDER.map((t, i) => ({
    ...t,
    status: (i < tierIdx ? "achieved" : i === tierIdx ? "current" : "locked") as "achieved" | "current" | "locked",
  }));

  const tips = buildTips({
    count, returns, tier, next: nextInfo, daysElapsed, daysLeft, daysInMonth,
    prevMonth, projected, atRisk, monthLabel: AR_MONTHS[today.m - 1], target: targetInfo,
  });

  const motivation = buildMotivation({
    count, tier, next: nextInfo, daysElapsed, daysLeft, projected,
    prevMonth, trendPct, monthLabel: AR_MONTHS[today.m - 1], target: targetInfo, dayOfMonth: today.d,
  });

  return {
    month: { key: curKey, label: AR_MONTHS[today.m - 1], daysElapsed, daysInMonth, daysLeft },
    count, returns,
    tier: tier ? { key: tier.key, name: tier.name } : null,
    nextTier: nextInfo,
    progressPct: targetInfo ? targetInfo.pct : progressPct,
    tierProgressPct: progressPct,
    target: targetInfo,
    prevMonth, trendPct, projected, atRisk, history, ladder, tips, motivation,
  };
}

function tierName(k: TierKey | null): string {
  return TIER_LADDER.find(t => t.key === k)?.name ?? "بدون مستوى";
}

function buildTips(c: {
  count: number; returns: number;
  tier: TierDef | null; next: ClientTierSummary["nextTier"];
  daysElapsed: number; daysLeft: number; daysInMonth: number;
  prevMonth: ClientTierSummary["prevMonth"]; projected: ClientTierSummary["projected"];
  atRisk: boolean; monthLabel: string; target: ClientTarget | null;
}): TierTip[] {
  const tips: TierTip[] = [];
  const bronze = TIER_LADDER[0];

  // 0) التارجت الشهري اللي الأدمن محدده للعميل (لو موجود) — بيتعرض الأول
  if (c.target) {
    if (c.target.reached) {
      const over = c.count - c.target.value;
      tips.push({
        kind: "success",
        text: over > 0
          ? `حققت التارجت الشهري (${c.target.value} شحنة) وزيادة ${over} شحنة. كمّل على نفس المعدل.`
          : `حققت التارجت الشهري (${c.target.value} شحنة). كمّل لرفع مستواك.`,
      });
    } else {
      const perDay = c.daysLeft > 0 ? Math.ceil(c.target.remaining / c.daysLeft) : c.target.remaining;
      const pace = c.daysLeft > 0
        ? ` بمعدل ${perDay} شحنة يوميًا تقريبًا لباقي ${c.daysLeft} يوم.`
        : " والشهر بيخلص النهارده.";
      tips.push({ kind: "goal", text: `باقي ${c.target.remaining} شحنة على التارجت الشهري (${c.target.value} شحنة)${pace}` });
      if (c.projected && c.count > 0 && c.daysElapsed >= 10) {
        if (c.projected.count >= c.target.value) {
          tips.push({ kind: "success", text: `على المعدل الحالي هتحقق التارجت بنهاية الشهر (المتوقع ${c.projected.count} شحنة).` });
        } else {
          tips.push({ kind: "warning", text: `على المعدل الحالي هتقفل الشهر على ${c.projected.count} شحنة، أقل من التارجت بـ ${c.target.value - c.projected.count} شحنة.` });
        }
      }
    }
  }

  // 1) الهدف الأقرب
  if (c.count === 0) {
    tips.push({ kind: "goal", text: `لم تُسجَّل أي شحنة في ${c.monthLabel} حتى الآن — ${bronze.min} شحنة توصلك للمستوى ${bronze.name}.` });
  } else if (c.next) {
    const perDay = c.daysLeft > 0 ? Math.ceil(c.next.remaining / c.daysLeft) : c.next.remaining;
    const pace = c.daysLeft > 0
      ? ` — بمعدل ${perDay} شحنة يوميًا تقريبًا خلال الـ ${c.daysLeft} يوم المتبقية.`
      : " — واليوم هو آخر يوم في الشهر.";
    tips.push({ kind: "goal", text: `باقي ${c.next.remaining} شحنة للوصول إلى المستوى ${c.next.name}${pace}` });
  } else {
    tips.push({ kind: "success", text: `وصلت لأعلى مستوى (${c.tier?.name}). حافظ على ${TIER_LADDER[TIER_LADDER.length - 1].min} شحنة أو أكثر شهريًا لتثبيت مستواك.` });
  }

  // 2) الإيقاع مقابل المستوى التالي
  if (c.next && c.projected && c.count > 0) {
    if (c.projected.count >= c.next.min) {
      tips.push({ kind: "success", text: `بمعدلك الحالي ستصل إلى المستوى ${c.next.name} قبل نهاية الشهر (متوقّع ${c.projected.count} شحنة).` });
    } else if (c.daysElapsed >= 10) {
      tips.push({ kind: "warning", text: `بمعدلك الحالي ستنهي الشهر بحوالي ${c.projected.count} شحنة، أي أقل من حد المستوى ${c.next.name} بـ ${c.next.min - c.projected.count} شحنة.` });
    }
  }

  // 3) خطر النزول عن مستوى الشهر الماضي / بداية شهر جديد
  if (c.atRisk) {
    tips.push({ kind: "warning", text: `مستواك الشهر الماضي كان ${tierName(c.prevMonth.tierKey)} وممكن تنزل إلى ${tierName(c.projected?.tierKey ?? null)} إذا استمر المعدل الحالي.` });
  } else if (c.daysElapsed <= 3 && c.prevMonth.tierKey) {
    tips.push({ kind: "info", text: `بدأ شهر جديد — مستواك الشهر الماضي كان ${tierName(c.prevMonth.tierKey)}. ابدأ بقوة لتحافظ عليه.` });
  }

  // 4) نسبة المرتجع
  if (c.count >= 10) {
    const rate = Math.round((c.returns / c.count) * 100);
    if (rate >= 15) {
      tips.push({ kind: "warning", text: `نسبة المرتجع هذا الشهر ${rate}% — راجع بيانات المستلم وأكّد الطلب قبل الشحن لتقليلها.` });
    }
  }

  return tips.slice(0, c.target ? 5 : 4);
}

// ═══════════ رسائل التحفيز ═══════════
// ─ الرسالة مبنية على موقف العميل الفعلي (قرّب؟ ماشي كويس؟ متأخر؟ بدأ الشهر؟)
//   وبأرقامه الحقيقية، مش عبارات عامة.
// ─ الاختيار من كل مجموعة ثابت طول اليوم (بيتغير يوم بيوم) عشان الرسالة
//   متتغيرش مع كل refresh وتبان عشوائية.
// ─ لتعديل الصياغة: عدّل المصفوفات جوه buildMotivation بس.

/** صيغة عربية سليمة لعدد الشحنات: شحنة واحدة / شحنتان / 5 شحنات / 12 شحنة */
function shipmentsPhrase(n: number): string {
  if (n === 1) return "شحنة واحدة";
  if (n === 2) return "شحنتان";
  if (n <= 10) return `${n} شحنات`;
  return `${n} شحنة`;
}

function buildMotivation(c: {
  count: number; tier: TierDef | null; next: ClientTierSummary["nextTier"];
  daysElapsed: number; daysLeft: number; projected: ClientTierSummary["projected"];
  prevMonth: ClientTierSummary["prevMonth"]; trendPct: number | null;
  monthLabel: string; target: ClientTarget | null; dayOfMonth: number;
}): TierMotivation {
  const pick = <T,>(arr: T[]): T => arr[c.dayOfMonth % arr.length];
  const t = c.target;
  const targetOpen = !!t && !t.reached;

  // ── 1) العميل حقق التارجت الشهري ──
  if (t?.reached) {
    const over = c.count - t.value;
    const extra = c.next
      ? ` وباقي ${shipmentsPhrase(c.next.remaining)} فقط للوصول إلى المستوى ${c.next.name}.`
      : " ومستواك في القمة، فاستمر لتثبيته.";
    return {
      stage: "target_reached",
      headline: pick(["إنجاز رائع هذا الشهر", "حققت هدفك الشهري", "أداء يستحق التقدير"]),
      message: (over > 0
        ? `تجاوزت التارجت الشهري (${t.value} شحنة) بزيادة ${shipmentsPhrase(over)}${extra}`
        : `أتممت التارجت الشهري (${t.value} شحنة) بنجاح${extra}`),
      dailyPace: null,
      focusLabel: c.next ? `مستوى ${c.next.name}` : null,
    };
  }

  // ── 2) أعلى مستوى ولا يوجد تارجت مفتوح ──
  if (!targetOpen && !c.next && c.tier) {
    return {
      stage: "top",
      headline: pick(["أنت في القمة", "مستوى استثنائي", "شريك من الطراز الأول"]),
      message: pick([
        `حافظت على مستوى ${c.tier.name} في ${c.monthLabel}. استمرارك بهذه الوتيرة هو ما يُثبّت مكانتك بين أفضل عملائنا.`,
        `وصلت إلى أعلى مستوى (${c.tier.name}) بجهدك المتواصل. كل شحنة إضافية تُعزّز موقعك وتحافظ على الفارق.`,
        `مستوى ${c.tier.name} لا يصل إليه إلا القليل. واصل بنفس الالتزام لتبقى في الصدارة.`,
      ]),
      dailyPace: null,
      focusLabel: null,
    };
  }

  // ── الهدف الأقرب: التارجت المفتوح أولًا، وإلا المستوى التالي ──
  const focusRemaining = targetOpen ? t!.remaining : (c.next?.remaining ?? 0);
  const focusName = targetOpen ? "التارجت الشهري" : `المستوى ${c.next?.name ?? ""}`.trim();
  const gapTotal = targetOpen ? t!.value : Math.max(1, (c.next?.min ?? 1) - (c.tier?.min ?? 0));
  const needPace = c.daysLeft > 0 ? Math.ceil(focusRemaining / c.daysLeft) : focusRemaining;
  const dailyPace = focusRemaining > 0 ? needPace : null;
  const rem = shipmentsPhrase(focusRemaining);

  // ── 3) قرّب جدًا من الهدف ──
  if (c.count > 0 && focusRemaining > 0 && focusRemaining <= Math.max(3, Math.ceil(gapTotal * 0.15))) {
    return {
      stage: "almost",
      headline: pick(["أنت على بعد خطوات من الهدف", "اقتربت جدًا", "دفعة أخيرة وتحسمها"]),
      message: pick([
        `باقي ${rem} فقط على ${focusName}. ركّز على شحناتك القادمة وستحسمها قريبًا.`,
        `أنجزت معظم الطريق نحو ${focusName}، ويفصلك عنه ${rem}. لا تتوقف الآن.`,
        `${rem} فقط تفصلك عن ${focusName} — الجهد الأكبر أصبح خلفك.`,
      ]),
      dailyPace,
      focusLabel: focusName,
    };
  }

  // ── 4) بداية شهر جديد ──
  if (c.daysElapsed <= 3) {
    const prev = c.prevMonth.tierKey
      ? ` مستواك الشهر الماضي كان ${tierName(c.prevMonth.tierKey)}، فابدأ الآن لتحافظ عليه أو تتخطاه.`
      : "";
    return {
      stage: "new_month",
      headline: pick(["بداية شهر جديدة", "صفحة جديدة في " + c.monthLabel, "انطلاقة قوية تصنع الفرق"]),
      message: pick([
        `الشحنات المبكرة هي أساس نتيجة الشهر كله. ابدأ بقوة نحو ${focusName}.${prev}`,
        `شهر ${c.monthLabel} فرصة جديدة لرفع مستواك. كل يوم من أول الشهر يخفف الضغط عليك في آخره.${prev}`,
        `من يبدأ مبكرًا يصل مرتاحًا. هدفك: ${focusName}.${prev}`,
      ]),
      dailyPace,
      focusLabel: focusName,
    };
  }

  // ── 5) لسه ما بدأش الشهر ──
  if (c.count === 0) {
    return {
      stage: "start",
      headline: pick(["ابدأ الآن", "أول شحنة تفتح الطريق", "الفرصة ما زالت قائمة"]),
      message: `لم تُسجَّل أي شحنة في ${c.monthLabel} حتى الآن. أول شحنة هي أهم خطوة، وبعدها تبدأ رحلتك نحو ${focusName}${c.daysLeft > 0 ? ` خلال الـ ${c.daysLeft} يوم المتبقية` : ""}.`,
      dailyPace,
      focusLabel: focusName,
    };
  }

  // ── 6) ماشي كويس: المتوقع يوصل للهدف ──
  const projectedHits = c.projected
    ? (targetOpen ? c.projected.count >= t!.value : !!c.next && c.projected.count >= c.next.min)
    : false;
  if (projectedHits && c.projected) {
    const trend = c.trendPct !== null && c.trendPct >= 5
      ? ` وأداؤك أفضل من ${c.prevMonth.label} بنسبة ${c.trendPct}%.`
      : "";
    return {
      stage: "on_track",
      headline: pick(["أداؤك يسير في الاتجاه الصحيح", "إيقاع ممتاز", "أنت على المسار الصحيح"]),
      message: pick([
        `بمعدلك الحالي ستصل إلى ${focusName} قبل نهاية ${c.monthLabel} (المتوقع ${c.projected.count} شحنة)${trend || "."}`,
        `استمرارك على هذا الإيقاع يضمن لك ${focusName} بنهاية الشهر${trend || "."}`,
        `النتائج تؤكد أن جهدك يؤتي ثماره: المتوقع ${c.projected.count} شحنة بنهاية الشهر${trend || "."}`,
      ]),
      dailyPace: null,
      focusLabel: focusName,
    };
  }

  // ── 7) محتاج دفعة: نصيحة صريحة برقم واقعي ──
  const avgDaily = c.daysElapsed > 0 ? c.count / c.daysElapsed : 0;
  const message = c.daysLeft <= 0
    ? `اليوم آخر يوم في ${c.monthLabel}، وكل شحنة تُضاف الآن تُحتسب في مستواك. باقي ${rem} على ${focusName}.`
    : needPace <= Math.max(1, Math.ceil(avgDaily * 1.5))
      ? `تحتاج نحو ${shipmentsPhrase(needPace)} يوميًا للوصول إلى ${focusName} خلال الـ ${c.daysLeft} يوم المتبقية، وهو قريب جدًا من معدلك الحالي. زيادة بسيطة كافية.`
      : `للوصول إلى ${focusName} تحتاج نحو ${shipmentsPhrase(needPace)} يوميًا خلال الـ ${c.daysLeft} يوم المتبقية. يتطلب الأمر رفع الوتيرة، وكل شحنة تُقرّبك خطوة.`;
  return {
    stage: "push",
    headline: pick(["الوقت ما زال في صالحك", "ارفع الوتيرة قليلًا", "الفرصة قائمة والفارق قابل للتعويض"]),
    message,
    dailyPace,
    focusLabel: focusName,
  };
}

// ═══════════ DB helpers ═══════════

type ClientRow = { id: number; name: string; tenantId: number | null };

/** التارجت الشهري للعميل (عدد شحنات). بنقراه بـ raw SQL عشان الـ dist القديم ممكن ما يكونش فيه العمود. */
async function readClientTarget(clientId: number): Promise<number> {
  try {
    const [[row]] = await db.execute(sql`SELECT monthly_shipment_target AS t FROM clients WHERE id = ${clientId}`) as any;
    return Math.max(0, Number(row?.t ?? 0) || 0);
  } catch {
    return 0;
  }
}

/** شحنات العميل (آخر 6 شهور) — نفس تعريف "شحنات العميل" المستخدم في لوحة الأدمن (clientId أو اسم المرسل). */
export async function computeClientTier(client: ClientRow): Promise<ClientTierSummary> {
  const now = new Date();
  const t = cairoYMD(now);
  const from = shiftMonth(t.y, t.m, -5);
  const lowerBound = new Date(Date.UTC(from.y, from.m - 1, 1) - 2 * 86_400_000);

  // ⚠️ فلتر الـ tenant: شحنات كتير (خصوصًا القديمة / اللي جاية من بيانات مستوردة)
  // tenant_id بتاعها NULL بينما العميل نفسه tenant_id = 1. لو فلترنا بـ
  // eq(tenantId) بس، الشحنات دي كلها كانت بتختفي من المستوى (العميل يظهر 0).
  // فمطابقة الـ clientId (رقم فريد) من غير فلتر tenant، ومطابقة الاسم بس هي
  // اللي بتتقيّد بنفس الـ tenant (أو NULL) عشان أسماء متشابهة في tenants تانية متتخلطش.
  const nameMatch = client.tenantId !== null
    ? and(
        eq(shipmentsTable.senderName, client.name),
        or(eq(shipmentsTable.tenantId, client.tenantId), isNull(shipmentsTable.tenantId)),
      )!
    : eq(shipmentsTable.senderName, client.name);

  const rows = await db.select({ createdAt: shipmentsTable.createdAt, status: shipmentsTable.status })
    .from(shipmentsTable)
    .where(and(
      isNull(shipmentsTable.deletedAt),
      notInArray(shipmentsTable.status, EXCLUDED_STATUSES),
      or(eq(shipmentsTable.clientId, client.id), nameMatch)!,
      gte(shipmentsTable.createdAt, lowerBound),
    ));

  const target = await readClientTarget(client.id);
  return buildTierSummary(rows, now, target);
}

export interface ClientTierLite {
  count: number;
  tier: { key: TierKey; name: string } | null;
  nextTier: { key: TierKey; name: string; min: number; remaining: number } | null;
  progressPct: number;
  /** التارجت الشهري (0 = لسه متحددش) */
  target: number;
}

/** نسخة خفيفة لكل عملاء الـ tenant مرة واحدة — لعرض بادج المستوى في قايمة العملاء. */
export async function computeTiersForAllClients(tenantId: number | null): Promise<Record<number, ClientTierLite>> {
  const now = new Date();
  const t = cairoYMD(now);
  const curKey = monthKey(t.y, t.m);
  const lowerBound = new Date(Date.UTC(t.y, t.m - 1, 1) - 2 * 86_400_000);

  const clients = await db.select({ id: clientsTable.id, name: clientsTable.name })
    .from(clientsTable)
    .where(tenantId !== null ? eq(clientsTable.tenantId, tenantId) : undefined);

  const ships = await db.select({
    clientId: shipmentsTable.clientId,
    senderName: shipmentsTable.senderName,
    createdAt: shipmentsTable.createdAt,
  }).from(shipmentsTable).where(and(
    isNull(shipmentsTable.deletedAt),
    notInArray(shipmentsTable.status, EXCLUDED_STATUSES),
    gte(shipmentsTable.createdAt, lowerBound),
    // شحنات tenant_id بتاعها NULL لازم تتحسب برضه (نفس سبب computeClientTier)
    tenantId !== null ? or(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.tenantId)) : undefined,
  ));

  const targets = new Map<number, number>();
  try {
    const [trows] = await db.execute(
      tenantId !== null
        ? sql`SELECT id, monthly_shipment_target AS t FROM clients WHERE tenant_id = ${tenantId}`
        : sql`SELECT id, monthly_shipment_target AS t FROM clients`,
    ) as any;
    for (const r of trows ?? []) targets.set(Number(r.id), Math.max(0, Number(r.t) || 0));
  } catch { /* العمود لسه ماتعملش — نكمل من غير تارجت */ }

  const byId = new Map<number, number[]>();
  const byName = new Map<string, number[]>();
  for (const c of clients) {
    byId.set(c.id, [c.id]);
    byName.set(c.name, [...(byName.get(c.name) ?? []), c.id]);
  }

  const counts = new Map<number, number>();
  for (const s of ships) {
    if (!s.createdAt) continue;
    const cd = cairoYMD(new Date(s.createdAt));
    if (monthKey(cd.y, cd.m) !== curKey) continue;
    const owners = new Set<number>([
      ...(s.clientId != null ? byId.get(s.clientId) ?? [] : []),
      ...(byName.get(s.senderName) ?? []),
    ]);
    for (const id of owners) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const out: Record<number, ClientTierLite> = {};
  for (const c of clients) {
    const count = counts.get(c.id) ?? 0;
    const tier = tierForCount(count);
    const idx = tier ? TIER_LADDER.findIndex(x => x.key === tier.key) : -1;
    const next = TIER_LADDER[idx + 1] ?? null;
    const floor = tier ? tier.min : 0;
    const target = targets.get(c.id) ?? 0;
    out[c.id] = {
      count,
      tier: tier ? { key: tier.key, name: tier.name } : null,
      nextTier: next ? { key: next.key, name: next.name, min: next.min, remaining: Math.max(0, next.min - count) } : null,
      progressPct: target > 0
        ? Math.min(100, Math.round((count / target) * 100))
        : next ? Math.max(0, Math.min(100, Math.round(((count - floor) / (next.min - floor)) * 100))) : 100,
      target,
    };
  }
  return out;
}
