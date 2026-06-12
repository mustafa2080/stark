import React, { useState, useMemo, memo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListOrders } from "@workspace/api-client-react";
import { analyticsApi, apiFetch, type ChartsData, type ChartDayItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  PieChart, Pie, Cell, Sector, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

// ─── Month Picker Helper ────────────────────────────────────────────────────
function buildMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  // 12 شهر ماضي + 6 شهر قادمة
  for (let i = -12; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
    opts.push({ value, label });
  }
  return opts;
}

const MONTH_OPTIONS = buildMonthOptions();
const CURRENT_MONTH = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
})();

// ─── Color palette — modern flat ───────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: "قيد الانتظار",          color: "#eab308", bg: "#eab30818" }, // 🟡 أصفر
  warehouse_ready:  { label: "قيد الشحن في المخزن",  color: "#f97316", bg: "#f9731618" }, // 🟠 برتقالي
  in_shipping:      { label: "قيد الشحن",             color: "#3b82f6", bg: "#3b82f618" }, // 🔵 أزرق
  out_for_delivery: { label: "خرجت للتسليم",          color: "#f59e0b", bg: "#f59e0b18" }, // 🟠 أمبر
  received:         { label: "مُسلَّم",               color: "#22c55e", bg: "#22c55e18" }, // 🟢 أخضر
  delayed:          { label: "مؤجل",                  color: "#8b5cf6", bg: "#8b5cf618" }, // 🟣 بنفسجي
  returned:         { label: "مرتجع",                 color: "#ef4444", bg: "#ef444418" }, // 🔴 أحمر
  partial_received: { label: "استلم جزئي",            color: "#06b6d4", bg: "#06b6d418" }, // 🩵 سماوي
};

const SOURCE_CFG: Record<string, { label: string; emoji: string; color: string }> = {
  facebook:  { label: "فيسبوك",   emoji: "📘", color: "#1877F2" },
  tiktok:    { label: "تيك توك",  emoji: "🎵", color: "#ff0050" },
  instagram: { label: "إنستجرام", emoji: "📷", color: "#E1306C" },
  whatsapp:  { label: "واتساب",   emoji: "💬", color: "#25D366" },
  organic:   { label: "عضوي",     emoji: "🌱", color: "#22c55e" },
  other:     { label: "أخرى",     emoji: "📌", color: "#8b5cf6" },
};

// ─── Shipment status config ───────────────────────────────────────────────────
const SHIPMENT_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: "قيد الانتظار",        color: "#eab308", bg: "#eab30818" }, // 🟡 أصفر
  warehouse_ready:  { label: "قيد الشحن في المخزن", color: "#f97316", bg: "#f9731618" }, // 🟠 برتقالي
  in_shipping:      { label: "قيد الشحن",            color: "#3b82f6", bg: "#3b82f618" }, // 🔵 أزرق
  received:         { label: "مُسلَّم",              color: "#22c55e", bg: "#22c55e18" }, // 🟢 أخضر
  delivered:        { label: "مُسلَّم",              color: "#22c55e", bg: "#22c55e18" }, // 🟢 أخضر
  delayed:          { label: "مؤجل",                 color: "#8b5cf6", bg: "#8b5cf618" }, // 🟣 بنفسجي
  returned:         { label: "مرتجع",                color: "#ef4444", bg: "#ef444418" }, // 🔴 أحمر
  partial_received: { label: "استلم جزئي",           color: "#06b6d4", bg: "#06b6d418" }, // 🩵 سماوي
  out_for_delivery: { label: "خرجت للتسليم",        color: "#f59e0b", bg: "#f59e0b18" }, // 🟠 أمبر
  cancelled:        { label: "ملغاة",                color: "#6b7280", bg: "#6b728018" }, // ⚪ رمادي
};

const BAR_COLOR = "#f59e0b";

const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

// ─── Hover (active) shape — smooth expand with glow ────────────────────────
function ActiveDonutShape(props: any) {
  const {
    cx, cy, innerRadius, outerRadius,
    startAngle, endAngle, fill,
    payload, percent, value,
  } = props;
  const cfg = STATUS_CFG[payload.status] ?? { label: payload.status, color: fill };

  return (
    <g tabIndex={-1} style={{ outline: "none" }}>
      {/* Glow ring */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={outerRadius + 5}
        outerRadius={outerRadius + 9}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.2}
        cornerRadius={6}
      />
      {/* Main segment — slightly expanded */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius - 4}
        outerRadius={outerRadius + 7}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={6}
        tabIndex={-1}
        style={{ outline: "none" }}
      />
      {/* Center text: count */}
      <text x={cx} y={cy - 14} textAnchor="middle"
        fill="hsl(var(--foreground))" fontSize={26} fontWeight={900}
        fontFamily="inherit" style={{ pointerEvents: "none", userSelect: "none" }}>
        {value}
      </text>
      {/* Center text: label */}
      <text x={cx} y={cy + 8} textAnchor="middle"
        fill="hsl(var(--muted-foreground))" fontSize={11}
        fontFamily="inherit" style={{ pointerEvents: "none", userSelect: "none" }}>
        {cfg.label}
      </text>
      {/* Center text: percent */}
      <text x={cx} y={cy + 26} textAnchor="middle"
        fill={fill} fontSize={14} fontWeight={800}
        fontFamily="inherit" style={{ pointerEvents: "none", userSelect: "none" }}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    </g>
  );
}

// ─── Percentage label inside each segment ───────────────────────────────────
function PctLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.07) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x} y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
      style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))" }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ─── Donut tooltip ──────────────────────────────────────────────────────────
function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const cfg = STATUS_CFG[d.status] ?? { label: d.status, color: "#888", bg: "#88881a" };
  return (
    <div
      className="rounded-xl border px-3 py-2.5 text-xs shadow-xl"
      style={{ background: "hsl(var(--card))", borderColor: cfg.color + "44" }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.color }} />
        <span className="font-bold text-foreground">{cfg.label}</span>
      </div>
      <p className="text-muted-foreground">{d.count} طلب  •  {d.pct}%</p>
    </div>
  );
}

// ─── Main Donut Card ────────────────────────────────────────────────────────
const StatusDonut = memo(function StatusDonut({
  data, total, onStatusClick, selectedStatus,
}: {
  data: ChartsData["statusBreakdown"];
  total: number;
  onStatusClick?: (status: string | null) => void;
  selectedStatus?: string | null;
}) {
  const sorted = useMemo(() => [...(data ?? [])].sort((a, b) => b.count - a.count), [data]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const ORDER = ["warehouse_ready", "received", "pending", "returned", "in_shipping", "delayed", "partial_received"];
  const orderedItems = useMemo(() => [
    ...ORDER.map(s => sorted.find(i => i.status === s)).filter(Boolean),
    ...sorted.filter(i => !ORDER.includes(i.status)),
  ] as typeof sorted, [sorted]);

  return (
    <div className="space-y-5">
      <div className="relative" style={{ height: 240 }}>
        {/* Show center total only when nothing is hovered */}
        {activeIndex === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <p className="text-4xl font-black text-foreground leading-none">{total}</p>
            <p className="text-xs text-muted-foreground mt-1">إجمالي الطلبات</p>
          </div>
        )}

        <ResponsiveContainer width="100%" height="100%">
          <PieChart tabIndex={-1} style={{ outline: "none" }}>
            <Pie
              data={sorted}
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={3}
              dataKey="count"
              stroke="none"
              cornerRadius={5}
              startAngle={90}
              endAngle={-270}
              labelLine={false}
              label={activeIndex === null ? <PctLabel /> : undefined}
              activeIndex={activeIndex ?? undefined}
              activeShape={ActiveDonutShape}
              animationBegin={0}
              animationDuration={600}
              animationEasing="ease-out"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={(entry) => onStatusClick?.(
                selectedStatus === entry.status ? null : entry.status
              )}
              style={{ cursor: onStatusClick ? "pointer" : "default", outline: "none" }}
            >
              {sorted.map((d, i) => {
                const cfg = STATUS_CFG[d.status];
                const isSelected = selectedStatus === d.status;
                return (
                  <Cell
                    key={i}
                    fill={cfg?.color ?? "#888"}
                    opacity={selectedStatus && !isSelected ? 0.35 : 1}
                  />
                );
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="space-y-1">
      <div className="flex flex-col gap-1.5">
          {orderedItems.map((item) => {
            const cfg = STATUS_CFG[item.status] ?? { label: item.status, color: "#888", bg: "#88881a" };
            const isSelected = selectedStatus === item.status;
            return (
              <button
                key={item.status}
                type="button"
                onClick={() => onStatusClick?.(isSelected ? null : item.status)}
                className="w-full flex items-center gap-3 rounded-lg px-2 py-1 transition-all text-right"
                style={{
                  background: isSelected ? cfg.bg : "transparent",
                  border: isSelected ? `1px solid ${cfg.color}55` : "1px solid transparent",
                  cursor: onStatusClick ? "pointer" : "default",
                }}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cfg.color }} />
                <span className="text-xs font-semibold text-foreground flex-1 truncate">{cfg.label}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md shrink-0"
                  style={{ background: cfg.bg, color: cfg.color }}>
                  {item.count}
                </span>
                <span className="text-xs font-black w-9 text-right shrink-0" style={{ color: cfg.color }}>
                  {item.pct}%
                </span>
                {isSelected && (
                  <span className="text-[9px] font-bold shrink-0" style={{ color: cfg.color }}>▼</span>
                )}
              </button>
            );
          })}
      </div>
      </div>
    </div>
  );
});

// ─── Bar tooltip ─────────────────────────────────────────────────────────────
function BarTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isToday = d.isToday;
  // format date from d.date (YYYY-MM-DD)
  const dateFormatted = d.date
    ? new Date(d.date).toLocaleDateString("ar-EG", { day: "numeric", month: "long" })
    : "";
  return (
    <div
      className="rounded-xl border px-3 py-2.5 text-xs shadow-xl min-w-[130px]"
      style={{
        background: "hsl(var(--card))",
        borderColor: isToday ? "#f59e0b88" : "hsl(var(--border))",
      }}
    >
      {/* Day name + date */}
      <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-border/50">
        {isToday && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />}
        <p className="font-black text-foreground">{d.label}</p>
        <p className="text-muted-foreground text-[10px] mr-auto">{dateFormatted}</p>
      </div>
      {/* Orders */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">الطلبات</span>
        <span className="font-black" style={{ color: BAR_COLOR }}>{d.orders} طلب</span>
      </div>
      {/* Revenue */}
      {d.revenue > 0 && (
        <div className="flex items-center justify-between gap-3 mt-1">
          <span className="text-muted-foreground">الإيرادات</span>
          <span className="font-bold text-emerald-500 text-[11px]">{fc(d.revenue)}</span>
        </div>
      )}
      {d.orders === 0 && (
        <p className="text-muted-foreground/60 text-[10px] mt-1 text-center">لا طلبات هذا اليوم</p>
      )}
    </div>
  );
}

// ─── Custom X-Axis Tick ────────────────────────────────────────────────────────
function CustomXTick({ x, y, payload }: any) {
  const d = payload?.value ?? {};
  const isToday = d.isToday;
  const shortDate = d.date
    ? new Date(d.date).toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" })
    : "";
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Day name */}
      <text
        x={0} y={0} dy={12}
        textAnchor="middle"
        fill={isToday ? "#f59e0b" : "hsl(var(--muted-foreground))"}
        fontSize={isToday ? 10 : 9}
        fontWeight={isToday ? 900 : 600}
      >
        {d.label ?? ""}
      </text>
      {/* Date */}
      <text
        x={0} y={0} dy={24}
        textAnchor="middle"
        fill={isToday ? "#f59e0baa" : "hsl(var(--muted-foreground)/0.6)"}
        fontSize={8}
      >
        {shortDate}
      </text>
    </g>
  );
}

// ─── Month Picker Component ──────────────────────────────────────────────────
type WeeklyView = "current" | "prev" | "monthly" | "custom";

const VIEW_TABS: { id: WeeklyView; label: string; emoji: string; color: string }[] = [
  { id: "current",  label: "الأسبوع الحالي",  emoji: "📅", color: "#FFD54F" },
  { id: "prev",     label: "الأسبوع الماضي",  emoji: "⏪", color: "#7E57C2" },
  { id: "monthly",  label: "الشهر الحالي",    emoji: "📆", color: "#26A69A" },
  { id: "custom",   label: "شهر مخصص",        emoji: "🗓️", color: "#FFB74D" },
];

function MonthPickerDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = MONTH_OPTIONS.find(o => o.value === value);

  return (
    <div className="relative" dir="rtl">
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          background: "rgba(255,183,77,0.15)",
          border: "1px solid rgba(255,183,77,0.45)",
          borderRadius: 14,
          padding: "6px 14px",
          color: "#FFB74D",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
        }}
      >
        🗓️ {selected?.label ?? "اختر شهر"}
        <span style={{ fontSize: 9, opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            background: "hsl(var(--popover))",
            border: "1px solid rgba(255,183,77,0.3)",
            borderRadius: 16,
            boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
            maxHeight: 280,
            overflowY: "auto",
            minWidth: 180,
            padding: "6px 4px",
          }}
        >
          {MONTH_OPTIONS.map(opt => {
            const isSelected = opt.value === value;
            const isCurrent = opt.value === CURRENT_MONTH;
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "7px 12px",
                  borderRadius: 10,
                  background: isSelected ? "rgba(255,183,77,0.2)" : "transparent",
                  border: "none",
                  color: isSelected ? "#FFB74D" : "hsl(var(--foreground))",
                  fontSize: 11,
                  fontWeight: isSelected ? 800 : 500,
                  cursor: "pointer",
                  textAlign: "right",
                  gap: 8,
                }}
              >
                <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 9 }}>
                  {isCurrent ? "📍" : ""}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Weekly Bars View Tabs ───────────────────────────────────────────────────
function WeeklyViewTabs({
  active,
  onChange,
  customMonth,
  onCustomMonthChange,
}: {
  active: WeeklyView;
  onChange: (v: WeeklyView) => void;
  customMonth: string;
  onCustomMonthChange: (m: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        padding: "0 2px 10px 2px",
        direction: "rtl",
      }}
    >
      {VIEW_TABS.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              borderRadius: 20,
              border: `1.5px solid ${isActive ? tab.color : "hsl(var(--border))"}`,
              background: isActive
                ? `linear-gradient(135deg, ${tab.color}28, ${tab.color}14)`
                : "hsl(var(--muted)/0.5)",
              color: isActive ? tab.color : "hsl(var(--muted-foreground))",
              fontSize: 10.5,
              fontWeight: isActive ? 800 : 500,
              cursor: "pointer",
              boxShadow: isActive ? `0 0 12px ${tab.color}44` : "none",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 11 }}>{tab.emoji}</span>
            {tab.label}
          </button>
        );
      })}

      {/* Month dropdown يظهر لما تختار custom */}
      {active === "custom" && (
        <MonthPickerDropdown value={customMonth} onChange={onCustomMonthChange} />
      )}
    </div>
  );
}

// ─── Weekly Sales Card (Glass Dark Redesign) ─────────────────────────────────
const GLASS_BAR_COLOR = "#FFD54F";
const GLASS_PURPLE = "#7E57C2";
const GLASS_GREEN = "#26A69A";
const GLASS_ORANGE = "#FFB74D";

function GlassBarTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-xl px-3.5 py-2 text-center shadow-xl"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid rgba(255,213,79,0.4)",
        minWidth: 90,
        direction: "rtl",
      }}
    >
      <p style={{ color: "#FFD54F", fontWeight: 900, fontSize: 12, marginBottom: 2 }}>{d.label}</p>
      <p className="font-bold text-foreground" style={{ fontSize: 13 }}>{d.orders} طلب</p>
      {d.revenue > 0 && (
        <p className="text-muted-foreground" style={{ fontSize: 10, marginTop: 2 }}>{fc(d.revenue)}</p>
      )}
    </div>
  );
}

function GlassXTick({ x, y, payload, enriched }: any) {
  const label: string = payload?.value ?? "";
  const dayData = enriched?.find((d: any) => d.label === label);
  const isToday = dayData?.isToday ?? false;
  const shortDate = dayData?.date
    ? new Date(dayData.date).toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" })
    : "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0} y={0} dy={13}
        textAnchor="middle"
        fill={isToday ? GLASS_BAR_COLOR : "hsl(var(--muted-foreground))"}
        fontSize={isToday ? 10 : 9}
        fontWeight={isToday ? 900 : 600}
      >
        {label}
      </text>
      <text
        x={0} y={0} dy={26}
        textAnchor="middle"
        fill={isToday ? "#f59e0b88" : "hsl(var(--muted-foreground))"}
        fontSize={8}
        fontWeight={400}
      >
        {shortDate}
      </text>
    </g>
  );
}


// â”€â”€â”€ Sales View Filter Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type SalesView = "current" | "prev" | "monthly";

const SALES_VIEW_TABS: { id: SalesView; label: string; emoji: string; color: string }[] = [
  { id: "current", label: "الأسبوع الحالي", emoji: "📅", color: "#FFD54F" },
  { id: "prev",    label: "الأسبوع الماضي", emoji: "⏪",         color: "#7E57C2" },
  { id: "monthly", label: "الشهر الحالي",   emoji: "📆",         color: "#26A69A" },
];

const WeeklyBars = memo(function WeeklyBars({
  data,
  monthlySales,
  weekComparison,
}: {
  data: ChartsData["weeklySales"];
  monthlySales?: ChartsData["monthlySales"];
  weekComparison?: ChartsData["weekComparison"];
}) {
  const [salesView, setSalesView] = React.useState<SalesView>("current");
  const todayStr = new Date().toISOString().split("T")[0];
  const enriched = useMemo(() =>
    (data ?? []).map(d => ({ ...d, isToday: d.date === todayStr }))
  , [data, todayStr]);
  const monthlyEnriched = useMemo(
    () => (monthlySales ?? []).map(d => ({ ...d, isToday: d.date === todayStr })),
    [monthlySales, todayStr]
  );
  const prevWeekEnriched = useMemo(
    () => weekComparison?.prevWeekDays?.map(d => ({ ...d, isToday: false })) ?? [],
    [weekComparison]
  );

  // Active dataset based on selected filter
  const activeData = salesView === "current" ? enriched : salesView === "prev" ? prevWeekEnriched : monthlyEnriched;

  const { total, peak, revenue, hasData } = useMemo(() => {
    const total = activeData.reduce((s, d) => s + d.orders, 0);
    const peak = activeData.reduce((a, b) => b.orders > a.orders ? b : a, activeData[0] ?? { label: "—", orders: 0, revenue: 0, date: "", isToday: false });
    const revenue = activeData.reduce((s, d) => s + d.revenue, 0);
    return { total, peak, revenue, hasData: total > 0 };
  }, [activeData, salesView]);

  const maxOrders = Math.max(...activeData.map(d => d.orders), 1);
  const monthlyMaxOrders = Math.max(...monthlyEnriched.map(d => d.orders), 1);
  const prevWeekMaxOrders = Math.max(...prevWeekEnriched.map(d => d.orders), 1);
  const yMax = Math.ceil(maxOrders / 5) * 5 + 4;
  const monthlyYMax = Math.ceil(monthlyMaxOrders / 5) * 5 + 4;
  const prevWeekYMax = Math.ceil(prevWeekMaxOrders / 5) * 5 + 4;
  const monthlyTotalOrders = monthlyEnriched.reduce((s, d) => s + d.orders, 0);
  const monthlyRevenue = monthlyEnriched.reduce((s, d) => s + d.revenue, 0);
  const monthlyAverage = monthlyEnriched.length > 0 ? (monthlyTotalOrders / monthlyEnriched.length).toFixed(1) : "0.0";
  const monthlyTickInterval = monthlyEnriched.length > 24 ? 3 : monthlyEnriched.length > 16 ? 2 : monthlyEnriched.length > 10 ? 1 : 0;

  const statCards = [
    {
      label: "الإيرادات (بعد الشحن)",
      value: fc(Math.max(0, revenue)),
      color: GLASS_PURPLE,
      glow: "rgba(126,87,194,0.32)",
      background: "linear-gradient(135deg, rgba(126,87,194,0.42) 0%, rgba(126,87,194,0.16) 52%, rgba(255,255,255,0.08) 100%)",
    },
    {
      label: "الأكثر بيعًا",
      value: peak.orders > 0 ? peak.label : "لا يوجد",
      subValue: peak.orders > 0 ? `${peak.orders} طلب` : undefined,
      color: GLASS_GREEN,
      glow: "rgba(38,166,154,0.28)",
      background: "linear-gradient(135deg, rgba(38,166,154,0.44) 0%, rgba(38,166,154,0.18) 52%, rgba(255,255,255,0.08) 100%)",
    },
    {
      label: salesView === "monthly" ? "طلبيات الشهر" : salesView === "prev" ? "طلبيات الأسبوع الماضي" : "طلبيات الأسبوع",
      value: String(total),
      color: GLASS_ORANGE,
      glow: "rgba(255,183,77,0.28)",
      background: "linear-gradient(135deg, rgba(255,183,77,0.40) 0%, rgba(255,183,77,0.16) 52%, rgba(255,255,255,0.08) 100%)",
    },
  ];

  return (
    <div
      className="space-y-5 rounded-[26px] p-4 sm:p-5 bg-card dark:bg-[rgba(30,30,30,0.88)] light:bg-card"
      dir="rtl"
      style={{
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
      }}
    >

      {/* â”€â”€â”€ Filter Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", direction: "rtl" }}>
        {SALES_VIEW_TABS.map(tab => {
          const isActive = salesView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSalesView(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 14px", borderRadius: 20,
                border: `1.5px solid ${isActive ? tab.color : "hsl(var(--border))"}`,
                background: isActive ? `${tab.color}22` : "hsl(var(--muted)/0.5)",
                color: isActive ? tab.color : "hsl(var(--muted-foreground))",
                fontSize: 11, fontWeight: isActive ? 800 : 500,
                cursor: "pointer",
                boxShadow: isActive ? `0 0 12px ${tab.color}44` : "none",
                transition: "all 0.2s ease", whiteSpace: "nowrap",
              }}
            >
              <span style={{ fontSize: 12 }}>{tab.emoji}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="group relative overflow-hidden rounded-[18px] px-4 py-3.5 text-center transition-transform duration-300 hover:-translate-y-0.5"
            style={{
              background: card.background,
              border: `1px solid ${card.glow}`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 24px ${card.glow}`,
              backdropFilter: "blur(12px)",
            }}
          >
            <div
              className="absolute inset-x-6 top-0 h-px opacity-80"
              style={{ background: `linear-gradient(90deg, transparent, ${card.color}, transparent)` }}
            />
            <p className="text-[11px] font-bold tracking-tight text-foreground/80">{card.label}</p>
            <p
              className="mt-1 truncate text-xl font-black sm:text-2xl"
              style={{ color: card.color, textShadow: `0 0 14px ${card.color}88` }}
            >
              {card.value}
            </p>
            {card.subValue && (
              <p className="mt-0.5 text-[10px] font-semibold text-foreground/60">{card.subValue}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3">
      {hasData ? (
        <div
          className="rounded-[22px] px-2 py-3 sm:px-3"
          style={{
            background: "hsl(var(--muted)/0.3)",
            border: "1px solid hsl(var(--border))",
          }}
        >
          <div className="mb-3 px-2">
            <p className="text-[11px] font-bold text-foreground/80">
              {salesView === "current" ? "طلبيات الأسبوع الحالي" : salesView === "prev" ? "طلبيات الأسبوع الماضي" : "طلبيات الشهر الحالي"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {salesView === "current" ? "من بداية الأسبوع حتى اليوم" : salesView === "prev" ? "بيانات الأسبوع السابق" : "من أول الشهر حتى اليوم"}
            </p>
          </div>
          <div style={{ height: salesView === "monthly" ? 200 : 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeData} margin={{ top: 10, right: 8, left: -22, bottom: salesView === "monthly" ? 36 : 48 }}>
                <defs>
                  <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor={salesView === "monthly" ? GLASS_GREEN : salesView === "prev" ? GLASS_PURPLE : GLASS_BAR_COLOR} />
                    <stop offset="100%" stopColor={salesView === "monthly" ? "#0F766E" : salesView === "prev" ? "#4527A0" : "#E0A800"} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 5" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={(props: any) => <GlassXTick {...props} enriched={activeData} />}
                  axisLine={false}
                  tickLine={false}
                  interval={salesView === "monthly" ? (monthlyEnriched.length > 24 ? 3 : monthlyEnriched.length > 16 ? 2 : monthlyEnriched.length > 10 ? 1 : 0) : 0}
                />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, yMax]} />
                <Tooltip content={<GlassBarTip />} cursor={{ stroke: salesView === "monthly" ? GLASS_GREEN : salesView === "prev" ? GLASS_PURPLE : GLASS_BAR_COLOR, strokeWidth: 1, strokeDasharray: "4 4" }} />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke={`url(#lineGradient)`}
                  strokeWidth={3}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    const color = salesView === "monthly" ? GLASS_GREEN : salesView === "prev" ? GLASS_PURPLE : GLASS_BAR_COLOR;
                    return (
                      <circle
                        key={payload.date}
                        cx={cx} cy={cy} r={payload.isToday ? 6 : 4}
                        fill={payload.orders > 0 ? color : "hsl(var(--border))"}
                        stroke={payload.isToday ? "#fff" : color}
                        strokeWidth={payload.isToday ? 2 : 1}
                        style={payload.orders > 0 ? { filter: `drop-shadow(0 0 6px ${color}99)` } : {}}
                      />
                    );
                  }}
                  activeDot={{ r: 7, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Stats row for prev/monthly */}
          {salesView === "prev" && weekComparison && (
            <div className="mt-4 grid grid-cols-3 gap-2 px-2">
              <div className="flex flex-col items-center gap-1">
                <p className="text-[10px] text-muted-foreground">الطلبات</p>
                <p className="text-base font-black" style={{ color: GLASS_ORANGE }}>{weekComparison.prevWeek.orders}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-[10px] text-muted-foreground">الإيرادات (بعد الشحن)</p>
                <p className="text-base font-black" style={{ color: GLASS_PURPLE }}>{fc(weekComparison.prevWeek.revenue)}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-[10px] text-muted-foreground">متوسط/يوم</p>
                <p className="text-base font-black" style={{ color: GLASS_BAR_COLOR }}>{(weekComparison.prevWeek.orders / 7).toFixed(1)}</p>
              </div>
            </div>
          )}
          {salesView === "monthly" && (
            <div className="mt-3 grid grid-cols-3 gap-2 px-2">
              <div className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2" style={{ background: "rgba(255,183,77,0.08)" }}>
                <p className="text-[10px] text-muted-foreground">الطلبات</p>
                <p className="text-base font-black" style={{ color: GLASS_ORANGE }}>{monthlyTotalOrders}</p>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2" style={{ background: "rgba(126,87,194,0.08)" }}>
                <p className="text-[10px] text-muted-foreground">الإيرادات (بعد الشحن)</p>
                <p className="text-base font-black" style={{ color: GLASS_PURPLE }}>{fc(Math.max(0, monthlyRevenue))}</p>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2" style={{ background: "rgba(38,166,154,0.08)" }}>
                <p className="text-[10px] text-muted-foreground">متوسط/يوم</p>
                <p className="text-base font-black" style={{ color: GLASS_GREEN }}>{monthlyAverage}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex h-56 flex-col items-center justify-center gap-2 rounded-[22px] border border-border"
          style={{ background: "hsl(var(--muted)/0.3)" }}
        >
          <span className="text-4xl opacity-20">📊</span>
          <p className="text-xs text-muted-foreground">لا طلبات في هذه الفترة</p>
        </div>
      )}
      </div>
    </div>
  );
});

// ─── Ad Sources Card ─────────────────────────────────────────────────────────
const AdSources = memo(function AdSources({ data }: { data: ChartsData["adSourceBreakdown"] }) {
  const filtered = useMemo(() => data.filter(d => d.count > 0), [data]);

  if (!filtered.length) {
    return (
      <div className="flex flex-col items-center justify-center py-4 text-center space-y-3">
        <span className="text-5xl">📡</span>
        <div>
          <p className="text-sm font-bold text-foreground">لا توجد بيانات بعد</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[200px] mx-auto leading-relaxed">
            أضف مصدر الإعلان عند إنشاء أي طلب لتفعيل هذا القسم
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-center pt-1">
          {Object.entries(SOURCE_CFG).map(([k, v]) => (
            <span
              key={k}
              className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
              style={{ background: v.color + "18", color: v.color, border: `1px solid ${v.color}33` }}
            >
              {v.emoji} {v.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map(item => {
        const cfg = SOURCE_CFG[item.source] ?? { label: item.source, emoji: "📌", color: "#8b5cf6" };
        return (
          <div key={item.source} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-base leading-none">{cfg.emoji}</span>
                <span className="font-semibold text-foreground">{cfg.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{item.count} طلب</span>
                <span className="font-black w-8 text-right" style={{ color: cfg.color }}>
                  {item.pct}%
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-2 rounded-full overflow-hidden" style={{ background: cfg.color + "18" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${item.pct}%`, background: cfg.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});

// ─── Chart Card Wrapper ───────────────────────────────────────────────────────
function ChartCard({
  title,
  subtitle,
  dot,
  children,
  liveTag,
  glassStyle,
}: {
  title: string;
  subtitle?: string;
  dot: string;
  children: React.ReactNode;
  liveTag?: boolean;
  glassStyle?: boolean;
}) {
  if (glassStyle) {
    return (
      <div
        className="rounded-2xl overflow-hidden bg-card border border-border"
        style={{
          boxShadow: "0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px hsl(var(--border)/0.5) inset",
        }}
      >
        <div
          className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-border/50"
        >
          <div className="flex items-center gap-2.5">
            <span
              className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0"
              style={{ background: dot, boxShadow: `0 0 8px ${dot}cc, 0 0 20px ${dot}55` }}
            />
            <div>
              <p className="text-sm font-bold text-foreground">{title}</p>
              <p className="text-[10px] mt-0.5 text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {liveTag && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 shrink-0 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              مباشر
            </span>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-border/50 overflow-hidden"
      style={{
        background: "hsl(var(--card))",
        boxShadow:
          "0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(255,255,255,0.04) inset",
      }}
    >
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <span
            className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0"
            style={{ background: dot, boxShadow: `0 0 6px ${dot}88` }}
          />
          <div>
            <p className="text-sm font-bold text-foreground">{title}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        {liveTag && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 shrink-0 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            مباشر
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-hidden">
        {[80, 72, 72, 72, 72].map((w, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse shrink-0" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl bg-muted animate-pulse" style={{ height: 400 }} />
        ))}
      </div>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────
const KpiStrip = memo(function KpiStrip({ data, total }: { data: ChartsData["statusBreakdown"]; total: number }) {
  const sorted = useMemo(() => [...(data ?? [])].sort((a, b) => b.count - a.count), [data]);
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-0.5 no-scrollbar">
      {/* Total pill */}
      <div
        className="flex-none rounded-xl px-4 py-3 text-center min-w-[78px]"
        style={{ background: "#f59e0b14", border: "1px solid #f59e0b40" }}
      >
        <p className="text-xl font-black text-amber-500 leading-none">{total}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">الكل</p>
      </div>

      {/* Per-status pills */}
      {sorted.map(item => {
        const cfg = STATUS_CFG[item.status] ?? { label: item.status, color: "#888", bg: "#88881a" };
        return (
          <div
            key={item.status}
            className="flex-none rounded-xl px-3 py-3 text-center min-w-[72px]"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}40` }}
          >
            <p className="text-xl font-black leading-none" style={{ color: cfg.color }}>{item.count}</p>
            <p className="text-[10px] font-bold mt-0.5" style={{ color: cfg.color }}>{item.pct}%</p>
            <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{cfg.label}</p>
          </div>
        );
      })}
    </div>
  );
});

// ─── Filtered Orders List ─────────────────────────────────────────────────────
export function FilteredOrdersList({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "#888", bg: "#88881a" };

  const { data: orders, isLoading, error } = useQuery<any[]>({
    queryKey: ["orders-by-status-chart", status],
    queryFn: () => apiFetch<any[]>(`/analytics/orders-by-status?status=${status}`),
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
  });
  const fc = (n: number) =>
    new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

  return (
    <div
      className="mt-3 rounded-xl border overflow-hidden"
      style={{ borderColor: cfg.color + "44", background: cfg.bg }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: cfg.color + "33" }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
          <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
          {!isLoading && orders && (
            <span className="text-[10px] text-muted-foreground">({orders.length} طلب)</span>
          )}
        </div>
        <Link href={`/orders?status=${status}`} className="text-[10px] font-bold hover:underline" style={{ color: cfg.color }}>
          عرض الكل ←
        </Link>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">جاري التحميل...</div>
      ) : error ? (
        <div className="p-4 text-center text-xs text-red-500">
          خطأ في تحميل الطلبات — {(error as Error).message}
          <br />
          <Link href={`/orders?status=${status}`} className="underline mt-1 inline-block" style={{ color: cfg.color }}>
            افتح قسم الطلبات مباشرةً ←
          </Link>
        </div>
      ) : !orders?.length ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          لا توجد طلبات بحالة &quot;{cfg.label}&quot;
          <br />
          <Link href={`/orders?status=${status}`} className="underline mt-1 inline-block" style={{ color: cfg.color }}>
            تحقق في قسم الطلبات ←
          </Link>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: cfg.color + "22" }}>
          {orders.slice(0, 8).map(order => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-black/5 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 text-white"
                  style={{ background: cfg.color }}>
                  {order.customerName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{order.customerName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    #{order.id.toString().padStart(4, "0")} • {order.product}
                    {order.city ? ` • ${order.city}` : ""}
                  </p>
                </div>
              </div>
              <div className="text-left shrink-0 mr-2">
                <p className="text-xs font-black" style={{ color: cfg.color }}>{fc(order.totalPrice)}</p>
                <p className="text-[9px] text-muted-foreground">
                  {format(new Date(order.createdAt), "dd/MM")}
                </p>
              </div>
            </Link>
          ))}
          {orders.length > 8 && (
            <div className="px-4 py-2 text-center">
              <Link href={`/orders?status=${status}`} className="text-[10px] font-bold hover:underline" style={{ color: cfg.color }}>
                + {orders.length - 8} طلب آخر
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Exported Weekly Bars (standalone) ───────────────────────────────────────
export { WeeklyBars };

// ─── Exported Chart Card Wrapper ─────────────────────────────────────────────
export { ChartCard };

// ─── Status Donut + Expandable Orders (للاستخدام في الداشبورد) ───────────────
export function StatusDonutWithOrders({ data, total }: { data: ChartsData["statusBreakdown"]; total: number }) {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  return (
    <div>
      <StatusDonut
        data={data}
        total={total}
        selectedStatus={selectedStatus}
        onStatusClick={setSelectedStatus}
      />
      {selectedStatus && (
        <FilteredOrdersList status={selectedStatus} />
      )}
    </div>
  );
}

// ─── Shipment Status Donut ────────────────────────────────────────────────────
export const ShipmentStatusDonut = memo(function ShipmentStatusDonut({
  data, total,
}: {
  data: { status: string; count: number; pct: number }[];
  total: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const sorted = useMemo(() => [...data].sort((a, b) => b.count - a.count), [data]);

  return (
    <div className="space-y-4">
      {/* Donut */}
      <div className="relative" style={{ height: 220 }}>
        {activeIndex === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <p className="text-4xl font-black text-foreground leading-none">{total}</p>
            <p className="text-xs text-muted-foreground mt-1">إجمالي الشحنات</p>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <PieChart tabIndex={-1} style={{ outline: "none" }}>
            <Pie
              data={sorted}
              cx="50%" cy="50%"
              innerRadius="52%" outerRadius="78%"
              paddingAngle={3} dataKey="count"
              stroke="none" cornerRadius={5}
              startAngle={90} endAngle={-270}
              labelLine={false}
              activeIndex={activeIndex ?? undefined}
              activeShape={ActiveDonutShape}
              animationBegin={0} animationDuration={600} animationEasing="ease-out"
              onMouseEnter={(_, i) => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {sorted.map((d, i) => (
                <Cell key={i} fill={SHIPMENT_STATUS_CFG[d.status]?.color ?? "#888"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-1.5">
        {sorted.map((d) => {
          const cfg = SHIPMENT_STATUS_CFG[d.status] ?? { label: d.status, color: "#888", bg: "#88888818" };
          return (
            <div key={d.status}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold"
              style={{ background: cfg.bg }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.color }} />
              <span className="text-foreground truncate">{cfg.label}</span>
              <span className="mr-auto font-black" style={{ color: cfg.color }}>{d.count}</span>
              <span className="text-muted-foreground">{d.pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── Exported Component ──────────────────────────────────────────────────────
export function ChartsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-charts"],
    queryFn: analyticsApi.charts,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const { data: shipmentsStatus } = useQuery({
    queryKey: ["analytics-shipments-status"],
    queryFn: () => apiFetch<{ statusBreakdown: { status: string; count: number; pct: number }[]; total: number }>("/analytics/shipments-status"),
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <Skeleton />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">مركز التحليلات</h2>
          <p className="text-[11px] text-muted-foreground">ANALYTICS CENTER — بيانات حقيقية من قاعدة البيانات</p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          مباشر
        </span>
      </div>

      {/* KPI strip */}
      <KpiStrip data={data.statusBreakdown} total={data.total} />

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1 — Shipments Donut */}
        <ChartCard
          title="توزيع حالات الشحنات"
          subtitle="بيانات مباشرة من جدول الشحنات"
          dot="#06b6d4"
          liveTag
        >
          {shipmentsStatus && shipmentsStatus.total > 0
            ? <ShipmentStatusDonut data={shipmentsStatus.statusBreakdown} total={shipmentsStatus.total} />
            : <div className="flex flex-col items-center justify-center h-40 gap-2">
                <span className="text-3xl font-black text-muted-foreground">0</span>
                <span className="text-xs text-muted-foreground">لا توجد شحنات بعد</span>
              </div>
          }
        </ChartCard>

        {/* 2 — Weekly Bar */}
        <ChartCard
          title="الطلبيات الأسبوعية"
          subtitle="الأسبوع الحالي والأسبوع الماضي والشهر الحالي"
          dot="#f59e0b"
        >
          <WeeklyBars
            data={data.weeklySales}
            monthlySales={data.monthlySales}
            weekComparison={data.weekComparison}
          />
        </ChartCard>

        {/* 3 — Ad Sources */}
        <ChartCard
          title="مصادر الطلبات"
          subtitle="Ad Attribution Sources"
          dot="#8b5cf6"
        >
          <AdSources data={data.adSourceBreakdown} />
        </ChartCard>
      </div>
    </div>
  );
}
