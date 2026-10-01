import { useMemo, useState, type ReactNode } from "react";
import { PieChart, Pie, Cell } from "recharts";

// ═══════════════════════════════════════════════════════════════════════════
// SegDonut — الدايرة الموحّدة لكل صفحات التحليل
// نفس شكل دايرة "إجمالي الشحنات" في لوحة التحكم: حلقة سميكة، شرايح بينها فراغ،
// أطراف مدورة، والرقم في النص. بتتستخدم لأي دايرة (إجمالي / هدف / نسبة).
// ═══════════════════════════════════════════════════════════════════════════
export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
  /** شريحة خلفية (المتبقي) — مش بتتفاعل مع الـ hover */
  track?: boolean;
};

const EMPTY_TRACK: DonutSegment = { key: "__empty", label: "", value: 1, color: "#ffffff12", track: true };
const defaultFmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n || 0));

export function SegDonut({
  segments, size = 220, inner = 52, outer = 78, padding = 3, corner = 5,
  activeKey, onHover, children,
}: {
  segments: DonutSegment[];
  size?: number;
  inner?: number;
  outer?: number;
  padding?: number;
  corner?: number;
  /** لو اتبعت (حتى null) الـ hover بيتدار من برّه (مثلًا من الـ legend) */
  activeKey?: string | null;
  onHover?: (key: string | null) => void;
  children?: ReactNode;
}) {
  const [innerHover, setInnerHover] = useState<string | null>(null);
  const active = activeKey !== undefined ? activeKey : innerHover;
  const setActive = (k: string | null) => { setInnerHover(k); onHover?.(k); };

  const data = useMemo(() => {
    const live = segments.filter((s) => s.value > 0);
    return live.length ? live : [EMPTY_TRACK];
  }, [segments]);
  const single = data.length === 1;

  return (
    <div
      className="relative shrink-0 select-none outline-none focus:outline-none"
      style={{ width: size, height: size, WebkitTapHighlightColor: "transparent" }}
      tabIndex={-1}
    >
      <PieChart width={size} height={size} tabIndex={-1} style={{ outline: "none" }}>
        <Pie
          data={data} dataKey="value" nameKey="label"
          cx="50%" cy="50%"
          innerRadius={`${inner}%`} outerRadius={`${outer}%`}
          paddingAngle={single ? 0 : padding} cornerRadius={single ? 0 : corner}
          stroke="none" startAngle={90} endAngle={-270}
          labelLine={false}
          isAnimationActive animationBegin={0} animationDuration={600} animationEasing="ease-out"
          onMouseEnter={(_, i) => { const s = data[i]; if (s && !s.track) setActive(s.key); }}
          onMouseLeave={() => setActive(null)}
        >
          {data.map((d) => {
            const dim = active !== null && !d.track && d.key !== active;
            return (
              <Cell
                key={d.key} fill={d.color} fillOpacity={dim ? 0.4 : 1}
                style={{
                  outline: "none", transition: "fill-opacity .2s, filter .2s",
                  filter: !d.track && d.key === active ? `drop-shadow(0 0 8px ${d.color}aa)` : undefined,
                }}
              />
            );
          })}
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DonutLegend — كبسولات الشرح تحت الدايرة (نقطة لون + الاسم + العدد + النسبة)
// ═══════════════════════════════════════════════════════════════════════════
export function DonutLegend({
  items, total, activeKey, onHover, format = defaultFmt, showPct = true, className = "",
}: {
  items: DonutSegment[];
  total?: number;
  activeKey?: string | null;
  onHover?: (key: string | null) => void;
  format?: (n: number) => string;
  showPct?: boolean;
  className?: string;
}) {
  const sum = total ?? items.reduce((s, d) => s + d.value, 0);
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${className}`}>
      {items.map((d) => {
        const isActive = activeKey === d.key;
        return (
          <div
            key={d.key}
            onMouseEnter={() => onHover?.(d.key)}
            onMouseLeave={() => onHover?.(null)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold cursor-default transition"
            style={{ background: `${d.color}18`, boxShadow: isActive ? `0 0 0 1.5px ${d.color}` : undefined }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-white/80 truncate flex-1">{d.label}</span>
            <span className="font-black tabular-nums" style={{ color: d.color }}>{format(d.value)}</span>
            {showPct && (
              <span className="text-white/45 tabular-nums">{sum > 0 ? Math.round((d.value / sum) * 100) : 0}%</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
