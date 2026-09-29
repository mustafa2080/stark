import { useMemo, type CSSProperties } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, LabelList,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Trophy, CalendarDays, Gauge, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ClientTierData } from "@/components/client-tier-card";

// ═══════════════════════════════════════════════════════════════════════════
// كارت "النمو الشهري" (صفحة العميل التجاري) — شحنات آخر 6 شهور من الداتا الفعلية.
//  • الأعمدة متقسّمة: مسلّمة / مرتجع / أخرى، والرقم الإجمالي فوق كل عمود.
//  • الشهر الحالي بلون أهدأ (لسه ماخلصش) + خط التارجت الشهري لو الأدمن حدده.
//  • مؤشرات: شحنات الشهر الحالي (والمتوقع)، نمو آخر شهر مكتمل، المتوسط، أفضل شهر.
// الحساب بتوقيت القاهرة وبنفس فلتر كارت المستوى (الملغي مش بيتحسب) عشان الأرقام تتطابق.
// ═══════════════════════════════════════════════════════════════════════════

export interface GrowthShipment { createdAt: string; status: string }

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const DELIVERED = new Set(["delivered", "received"]);
const RETURNED = new Set(["returned"]);
const IGNORED = new Set(["cancelled", "pending", "waiting", "confirmed"]);

const C_DELIVERED = "#10b981";
const C_RETURNED = "#ef4444";
const C_OTHER = "#3b82f6";

const cairoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" });
function cairoYM(d: Date): { y: number; m: number } {
  const p = cairoFmt.formatToParts(d);
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return { y: g("year"), m: g("month") };
}
const n = (v: number) => v.toLocaleString("en-US");

interface Row {
  key: string; label: string;
  total: number; delivered: number; returned: number; other: number;
  rate: number | null;          // نسبة التسليم %
  isCurrent: boolean;
  changePct: number | null;     // التغيّر عن الشهر اللي قبله
  hasPrev: boolean;
}

function GrowthTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Row;
  return (
    <div dir="rtl" className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] shadow-lg min-w-[150px]">
      <p className="font-black mb-1.5">
        {d.label}{d.isCurrent && <span className="text-muted-foreground font-medium"> · جاري</span>}
      </p>
      <p className="flex items-center justify-between gap-4"><span className="text-muted-foreground">الإجمالي</span><b>{n(d.total)} شحنة</b></p>
      <p className="flex items-center justify-between gap-4"><span style={{ color: C_DELIVERED }}>مسلّمة</span><b>{n(d.delivered)}</b></p>
      <p className="flex items-center justify-between gap-4"><span style={{ color: C_RETURNED }}>مرتجع</span><b>{n(d.returned)}</b></p>
      <p className="flex items-center justify-between gap-4"><span style={{ color: C_OTHER }}>أخرى</span><b>{n(d.other)}</b></p>
      {d.rate !== null && (
        <p className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-border/60">
          <span className="text-muted-foreground">نسبة التسليم</span><b>{d.rate}%</b>
        </p>
      )}
      {d.hasPrev && d.changePct !== null && !d.isCurrent && (
        <p className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">عن الشهر السابق</span>
          <b style={{ color: d.changePct >= 0 ? C_DELIVERED : C_RETURNED }}>{d.changePct >= 0 ? "+" : ""}{d.changePct}%</b>
        </p>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: {
  icon: typeof Gauge; label: string; value: string; sub?: string; tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 min-w-0">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
        <Icon className="w-3 h-3 shrink-0" /> {label}
      </p>
      <p className="text-lg font-black leading-tight mt-0.5" style={tone ? { color: tone } : undefined}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground leading-snug truncate">{sub}</p>}
    </div>
  );
}

export function ClientGrowthCard({ shipments, tier, isLoading, className = "", style }: {
  shipments: GrowthShipment[];
  /** داتا المستوى — بنستخدمها للتارجت الشهري والمتوقع بنهاية الشهر (اختيارية) */
  tier?: ClientTierData | null;
  isLoading?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const rows = useMemo<Row[]>(() => {
    const now = cairoYM(new Date());
    const base = now.y * 12 + (now.m - 1);
    const list: Row[] = [];
    const idxByKey = new Map<string, number>();
    for (let i = 0; i < 6; i++) {
      const idx = base - (5 - i);
      const y = Math.floor(idx / 12), m = (idx % 12) + 1;
      const key = `${y}-${m}`;
      idxByKey.set(key, i);
      list.push({ key, label: AR_MONTHS[m - 1], total: 0, delivered: 0, returned: 0, other: 0, rate: null, isCurrent: i === 5, changePct: null, hasPrev: false });
    }
    for (const s of shipments) {
      if (!s.createdAt || IGNORED.has(s.status)) continue;
      const dt = new Date(s.createdAt);
      if (isNaN(dt.getTime())) continue;
      const { y, m } = cairoYM(dt);
      const i = idxByKey.get(`${y}-${m}`);
      if (i === undefined) continue;
      const r = list[i];
      r.total++;
      if (DELIVERED.has(s.status)) r.delivered++;
      else if (RETURNED.has(s.status)) r.returned++;
      else r.other++;
    }
    list.forEach((r, i) => {
      r.rate = r.total > 0 ? Math.round((r.delivered / r.total) * 100) : null;
      const prev = i > 0 ? list[i - 1] : null;
      r.hasPrev = !!prev && prev.total > 0;
      r.changePct = prev && prev.total > 0 ? Math.round(((r.total - prev.total) / prev.total) * 100) : null;
    });
    return list;
  }, [shipments]);

  if (isLoading) {
    return (
      <Card className={`p-4 ${className}`} style={style}>
        <div className="h-[260px] rounded-lg bg-muted/30 animate-pulse" />
      </Card>
    );
  }

  const cur = rows[5];
  const lastFull = rows[4];
  const beforeLast = rows[3];
  const completed = rows.slice(0, 5);
  const activeCompleted = completed.filter(r => r.total > 0);
  const avg = activeCompleted.length > 0 ? Math.round(activeCompleted.reduce((s, r) => s + r.total, 0) / activeCompleted.length) : 0;
  const best = rows.reduce((b, r) => (r.total > b.total ? r : b), rows[0]);
  const growth = lastFull.changePct;
  const isNewBusiness = beforeLast.total === 0 && lastFull.total > 0;
  const target = tier?.target && tier.target.value > 0 ? tier.target.value : 0;
  const projected = tier?.projected?.count ?? null;
  const grand = rows.reduce((s, r) => s + r.total, 0);
  const maxTotal = Math.max(...rows.map(r => r.total), 0);

  const growthUp = growth !== null && growth > 0;
  const growthDown = growth !== null && growth < 0;
  const GrowthIcon = growthUp ? TrendingUp : growthDown ? TrendingDown : Minus;
  const growthColor = growthUp ? C_DELIVERED : growthDown ? C_RETURNED : undefined;

  return (
    <Card className={`p-4 ${className}`} style={style} dir="rtl">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
        <div>
          <p className="text-xs font-bold flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            النمو الشهري
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">شحنات آخر 6 شهور (بتوقيت القاهرة، من غير الملغي)</p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C_DELIVERED }} />مسلّمة</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C_RETURNED }} />مرتجع</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C_OTHER }} />أخرى</span>
          {target > 0 && (
            <span className="flex items-center gap-1"><span className="w-4 border-t border-dashed border-amber-400 inline-block" />التارجت</span>
          )}
        </div>
      </div>

      {grand === 0 ? (
        <div className="h-[200px] flex flex-col items-center justify-center text-center gap-1.5 text-muted-foreground">
          <Activity className="w-6 h-6 opacity-50" />
          <p className="text-xs font-semibold">لا توجد شحنات في آخر 6 شهور</p>
          <p className="text-[10px]">هيظهر النمو هنا أول ما العميل يبدأ يشحن.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            <Kpi
              icon={CalendarDays} label={`شحنات ${cur.label}`} value={n(cur.total)}
              sub={projected !== null && projected > 0 ? `المتوقع بنهاية الشهر ≈ ${n(projected)}` : "الشهر لسه جاري"}
            />
            <Kpi
              icon={GrowthIcon} label={`نمو ${lastFull.label}`}
              value={growth !== null ? `${growth > 0 ? "+" : ""}${growth}%` : isNewBusiness ? "جديد" : "—"}
              sub={`مقارنة بـ ${beforeLast.label} (${n(beforeLast.total)})`}
              tone={growthColor}
            />
            <Kpi icon={Gauge} label="متوسط شهري" value={n(avg)} sub={activeCompleted.length > 0 ? `آخر ${activeCompleted.length} شهور مكتملة` : "لا يوجد شهر مكتمل"} />
            <Kpi icon={Trophy} label="أفضل شهر" value={best.total > 0 ? best.label : "—"} sub={best.total > 0 ? `${n(best.total)} شحنة` : undefined} />
          </div>

          <div dir="ltr" className="w-full">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={rows} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  domain={[0, Math.max(5, Math.ceil(Math.max(maxTotal, target) * 1.15))]}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v))}
                />
                <Tooltip content={<GrowthTooltip />} cursor={{ fill: "hsl(var(--muted) / .25)" }} />
                {target > 0 && (
                  <ReferenceLine
                    y={target} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5}
                    label={{ value: `التارجت ${n(target)}`, position: "insideTopRight", fill: "#f59e0b", fontSize: 10 }}
                  />
                )}
                <Bar dataKey="delivered" stackId="s" fill={C_DELIVERED} maxBarSize={44}>
                  {rows.map(r => <Cell key={r.key} fillOpacity={r.isCurrent ? 0.6 : 1} />)}
                </Bar>
                <Bar dataKey="returned" stackId="s" fill={C_RETURNED} maxBarSize={44}>
                  {rows.map(r => <Cell key={r.key} fillOpacity={r.isCurrent ? 0.6 : 1} />)}
                </Bar>
                <Bar dataKey="other" stackId="s" fill={C_OTHER} radius={[5, 5, 0, 0]} maxBarSize={44}>
                  {rows.map(r => <Cell key={r.key} fillOpacity={r.isCurrent ? 0.6 : 1} />)}
                </Bar>
                {/* الرقم الإجمالي فوق كل عمود (خط شفاف بس عشان الـ label) */}
                <Line dataKey="total" stroke="none" dot={false} activeDot={false} isAnimationActive={false} legendType="none" tooltipType="none">
                  <LabelList
                    dataKey="total" position="top" fontSize={11} fontWeight={700} fill="hsl(var(--foreground))"
                    formatter={(v: number) => (v > 0 ? n(v) : "")}
                  />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
