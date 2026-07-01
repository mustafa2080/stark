import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo, memo } from "react";
import { useGetOrdersSummary, useGetRecentOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ChartsSection, WeeklyBars, ChartCard, StatusDonutWithOrders, ShipmentStatusDonut, WeeklyShipmentBars } from "@/components/charts-section";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useAuth } from "@/contexts/AuthContext";
import {
  TrendingUp, TrendingDown, DollarSign, Package, AlertCircle,
  Plus, Activity, Boxes, ArrowUpRight, ArrowDownRight,
  Star, Wallet, BarChart3, ShoppingCart, AlertTriangle, RefreshCw, Bell, Brain, Zap, Archive, Clock,
  Receipt, Building2, FileText, X, AlertOctagon, Users, Truck, Globe, Search, PackageCheck, CheckCircle2, Loader2,
  Undo2, Timer,
} from "lucide-react";
import {
  analyticsApi, type PeriodProfit, type ProductProfit, type FinancialSummary, type Alert,
  productsApi, cashRegistersApi, shippingApi, manifestsApi, teamAnalyticsApi, type TeamMemberExtStats,
  employeeApi, usersApi, apiFetch, type OperationsKpiCard, type PerformanceMetric, type CityActivityResponse, type OpsAlertsResponse, type OpsAlert,
  type ShipmentsProfitResponse,
} from "@/lib/api";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FaFacebook, FaTiktok, FaInstagram, FaWhatsapp } from "react-icons/fa";
import { PiPlantFill } from "react-icons/pi";
import { FiMoreHorizontal } from "react-icons/fi";

// ── Avatar helpers ──────────────────────────────────────────────────────────
const AVATAR_COLORS_DB = [
  ["#f59e0b","#78350f"],["#10b981","#064e3b"],["#3b82f6","#1e3a8a"],
  ["#8b5cf6","#4c1d95"],["#ef4444","#7f1d1d"],["#ec4899","#831843"],
  ["#06b6d4","#164e63"],["#f97316","#7c2d12"],
];
function dbAvatarColor(name: string): [string, string] {
  try {
    const safeName = (name && typeof name === "string") ? name : "?";
    let h = 0; for (let i = 0; i < safeName.length; i++) h = safeName.charCodeAt(i) + ((h << 5) - h);
    const color = AVATAR_COLORS_DB[Math.abs(h) % AVATAR_COLORS_DB.length];
    if (!color || !Array.isArray(color) || color.length < 2) return ["#6b7280", "#fff"];
    return color as [string, string];
  } catch { return ["#6b7280", "#fff"]; }
}
function dbInitials(name: string) {
  try {
    const safeName = (name && typeof name === "string" ? name : "?").trim();
    const p = safeName.split(/\s+/);
    const first = p[0]?.[0] ?? safeName[0] ?? "?";
    const second = p[1]?.[0] ?? p[0]?.[1] ?? first;
    return p.length >= 2 ? (first + second).toUpperCase() : safeName.slice(0,2).toUpperCase();
  } catch { return "؟"; }
}
function DashClientAvatar({ avatar, name }: { avatar?: string|null; name: string }) {
  if (avatar && avatar.startsWith("data:"))
    return <img src={avatar} className="w-9 h-9 rounded-full object-cover border border-border/50 shrink-0" />;
  const [bg, fg] = dbAvatarColor(name || "?");
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-border/20"
      style={{ background: bg, color: fg }}>
      {name ? dbInitials(name) : "؟"}
    </div>
  );
}



// ─── Helpers ──────────────────────────────────────────────────────────────────
const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));
const pct = (n: number, color = true) => {
  if (!color) return `${n}%`;
  return n;
};

// حالات الشحنة — تتطابق مع DB schema (نفس enum في shipments-page.tsx)
const STATUS_LABELS: Record<string, string> = {
  pending:          "قيد الانتظار",
  warehouse_ready:  "قيد الشحن في المخزن",
  in_shipping:      "قيد الشحن",
  received:         "استلم",
  partial_received: "استلام جزئي",
  delayed:          "مؤجل",
  returned:         "مرتجع",
};
// ألوان الحالات — متطابقة مع shipments-page.tsx
const STATUS_CLASSES: Record<string, string> = {
  pending:          "bg-amber-50    dark:bg-amber-900/30   text-amber-700   dark:text-amber-300   border-amber-200   dark:border-amber-700",
  warehouse_ready:  "bg-orange-50   dark:bg-orange-900/30  text-orange-600  dark:text-orange-400  border-orange-200  dark:border-orange-700",
  in_shipping:      "bg-sky-50      dark:bg-sky-900/30     text-sky-700     dark:text-sky-300     border-sky-200     dark:border-sky-700",
  received:         "bg-emerald-50  dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
  partial_received: "bg-cyan-50     dark:bg-cyan-900/30    text-cyan-700    dark:text-cyan-300    border-cyan-200    dark:border-cyan-700",
  delayed:          "bg-violet-50   dark:bg-violet-900/30  text-violet-700  dark:text-violet-300  border-violet-200  dark:border-violet-700",
  returned:         "bg-red-50      dark:bg-red-900/30     text-red-700     dark:text-red-300     border-red-200     dark:border-red-700",
};

// ─── Operations KPI Cards (شريط الكروت العلوي) ──────────────────────────────
const KPI_META: Record<string, { icon: any; iconBg: string; iconColor: string; sparkColor: string }> = {
  total:      { icon: Boxes,       iconBg: "bg-blue-500/10",    iconColor: "text-blue-500",    sparkColor: "#3b82f6" },
  delivered:  { icon: PackageCheck,iconBg: "bg-emerald-500/10", iconColor: "text-emerald-500", sparkColor: "#10b981" },
  inShipping: { icon: Truck,       iconBg: "bg-sky-500/10",     iconColor: "text-sky-500",     sparkColor: "#0ea5e9" },
  returned:   { icon: Undo2,       iconBg: "bg-amber-500/10",   iconColor: "text-amber-500",   sparkColor: "#f59e0b" },
  delayed:    { icon: Timer,       iconBg: "bg-violet-500/10",  iconColor: "text-violet-500",  sparkColor: "#8b5cf6" },
  revenue:    { icon: DollarSign,  iconBg: "bg-teal-500/10",    iconColor: "text-teal-500",    sparkColor: "#14b8a6" },
};

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <div className="h-8" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100, h = 32;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  const gradId = `spark-grad-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OperationsKpiCardItem({ card, formatAsCurrency }: { card: OperationsKpiCard; formatAsCurrency?: boolean }) {
  const meta = KPI_META[card.key] ?? KPI_META.total;
  const Icon = meta.icon;
  const isPositiveTrend = card.change >= 0;
  // للمرتجع/المؤجل: الزيادة سيئة (أحمر) بعكس باقي الكروت
  const inverseTrend = card.key === "returned" || card.key === "delayed";
  const trendIsGood = inverseTrend ? !isPositiveTrend : isPositiveTrend;
  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-2.5 sm:p-4">
        <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBg}`}>
            <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${meta.iconColor}`} />
          </div>
          <span className={`text-[9px] sm:text-[10px] font-bold flex items-center gap-0.5 shrink-0 ${
            trendIsGood ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}>
            {isPositiveTrend ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(card.change)}%
          </span>
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground font-bold mb-0.5 truncate">{card.label}</p>
        <p className="text-base sm:text-2xl font-black truncate">
          {formatAsCurrency ? fc(card.value) : fn(card.value)}
        </p>
        <div className="mt-1.5 sm:mt-2 -mx-1">
          <MiniSparkline data={card.sparkline} color={meta.sparkColor} />
        </div>
      </CardContent>
    </Card>
  );
}

function OperationsKpiRow() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-operations-kpis"],
    queryFn: analyticsApi.operationsKpis,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: any) => prev,
  });

  if (isLoading && !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-border bg-card overflow-hidden">
            <CardContent className="p-2.5 sm:p-4 space-y-2 animate-pulse">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-muted" />
              <div className="h-2.5 w-16 bg-muted rounded" />
              <div className="h-5 w-12 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {data.cards.map((card) => (
        <OperationsKpiCardItem key={card.key} card={card} formatAsCurrency={card.key === "revenue"} />
      ))}
    </div>
  );
}

// ─── Performance Metrics (6 دوائر) ──────────────────────────────────────────
// اتجاه "الأفضل": هل ارتفاع القيمة كويس ولا وحش، لتلوين الدائرة والسهم بشكل صحيح
const METRIC_DIRECTION: Record<string, "higher_is_better" | "lower_is_better"> = {
  onTimeRate:       "higher_is_better",
  avgDeliveryHours: "lower_is_better",
  returnRate:       "lower_is_better",
  delayRate:        "lower_is_better",
  avgRating:        "higher_is_better",
  avgPickupHours:   "lower_is_better",
};

function RadialMetricGauge({ metric }: { metric: PerformanceMetric }) {
  const direction = METRIC_DIRECTION[metric.key] ?? "higher_is_better";
  const isGoodTrend = direction === "higher_is_better" ? metric.change >= 0 : metric.change <= 0;

  // نسبة الملء للدائرة (0-100%)
  let pct: number;
  if (metric.max != null) {
    pct = Math.min(100, Math.max(0, (metric.value / metric.max) * 100));
  } else {
    // للساعات (بدون سقف ثابت): نعتبر 6 ساعات = 100% كمرجع بصري فقط
    pct = Math.min(100, Math.max(0, 100 - (metric.value / 6) * 100));
  }

  const color = direction === "higher_is_better"
    ? (pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444")
    : (pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444");

  const size = 84, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  const displayValue = metric.unit === "/5"
    ? metric.value.toFixed(1)
    : metric.unit === "%"
      ? `${metric.value}%`
      : metric.value.toFixed(1);

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center gap-1.5 sm:gap-2">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/30" />
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm sm:text-lg font-black" style={{ color }}>{displayValue}</span>
          </div>
        </div>
        <p className="text-[9px] sm:text-[11px] font-bold text-muted-foreground leading-tight">{metric.label}</p>
        {metric.key === "avgRating" ? (
          <span className="text-[8px] sm:text-[9px] text-muted-foreground">
            {metric.ratingsCount ? `${fn(metric.ratingsCount)} تقييم` : "لا توجد تقييمات بعد"}
          </span>
        ) : (
          <span className={`text-[8px] sm:text-[9px] font-bold flex items-center gap-0.5 ${
            isGoodTrend ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}>
            {metric.change > 0 ? "+" : ""}{metric.change} عن أمس
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function PerformanceMetricsRow() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-performance-metrics"],
    queryFn: analyticsApi.performanceMetrics,
    staleTime: 3 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: any) => prev,
  });

  if (isLoading && !data) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-border bg-card overflow-hidden">
            <CardContent className="p-3 sm:p-4 flex flex-col items-center gap-2 animate-pulse">
              <div className="w-[84px] h-[84px] rounded-full bg-muted" />
              <div className="h-2.5 w-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <h2 className="text-xs sm:text-sm font-bold text-muted-foreground mb-2 sm:mb-3">مؤشرات الأداء الرئيسية</h2>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
        {data.metrics.map((metric) => (
          <RadialMetricGauge key={metric.key} metric={metric} />
        ))}
      </div>
    </div>
  );
}

// ─── الخريطة الرمزية (توزيع الشحنات على المحافظات) ──────────────────────────────
// إحداثيات تقريبية (0-100) لموقع كل محافظة على خريطة SVG مبسطة لمصر — رمزية
// وليست جغرافية دقيقة، مرتبة نسبيًا (شمال/جنوب، شرق/غرب) لتعطي إحساسًا صحيحًا بالموقع.
const GOVERNORATE_COORDS: Record<string, { x: number; y: number }> = {
  "الإسكندرية":     { x: 28, y: 10 },
  "مطروح":          { x: 14, y: 14 },
  "البحيرة":        { x: 32, y: 18 },
  "كفر الشيخ":      { x: 42, y: 14 },
  "دمياط":          { x: 52, y: 12 },
  "بورسعيد":        { x: 60, y: 14 },
  "الإسماعيلية":    { x: 58, y: 22 },
  "السويس":         { x: 60, y: 28 },
  "شمال سيناء":     { x: 74, y: 16 },
  "جنوب سيناء":     { x: 72, y: 34 },
  "القليوبية":      { x: 44, y: 24 },
  "الغربية":        { x: 40, y: 20 },
  "المنوفية":       { x: 38, y: 22 },
  "الشرقية":        { x: 50, y: 22 },
  "القاهرة":        { x: 46, y: 28 },
  "الجيزة":         { x: 40, y: 30 },
  "الفيوم":         { x: 36, y: 36 },
  "بني سويف":       { x: 40, y: 42 },
  "المنيا":         { x: 38, y: 50 },
  "أسيوط":          { x: 40, y: 58 },
  "الوادي الجديد":  { x: 20, y: 60 },
  "سوهاج":          { x: 42, y: 66 },
  "قنا":            { x: 44, y: 74 },
  "الأقصر":         { x: 46, y: 82 },
  "أسوان":          { x: 46, y: 90 },
  "البحر الأحمر":   { x: 62, y: 60 },
};

const CITY_STATUS_COLOR = { inTransit: "#3b82f6", delivered: "#10b981", delayed: "#ef4444", problem: "#f59e0b" } as const;

function EgyptActivityMap() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-city-activity"],
    queryFn: analyticsApi.cityActivity,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: CityActivityResponse | undefined) => prev,
  });
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  if (isLoading && !data) {
    return (
      <Card className="border-border bg-card overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          <div className="h-64 sm:h-80 bg-muted/30 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.cities.length === 0) {
    return (
      <Card className="border-border bg-card overflow-hidden">
        <CardContent className="p-4 sm:p-6 text-center text-xs sm:text-sm text-muted-foreground">
          مفيش نشاط شحنات مسجل بمحافظة محددة خلال آخر 30 يوم
        </CardContent>
      </Card>
    );
  }

  const maxTotal = Math.max(...data.cities.map(c => c.total), 1);
  const selected = selectedCity ? data.cities.find(c => c.city === selectedCity) : null;

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h2 className="text-xs sm:text-sm font-bold text-muted-foreground">الخريطة المباشرة</h2>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground">{data.totalActiveCities} محافظة نشطة</span>
        </div>

        <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] max-h-80 sm:max-h-96 mx-auto">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* مربع خلفية رمزي يمثل حدود مصر تقريبًا */}
            <rect x="10" y="8" width="70" height="86" rx="3" className="fill-muted/20 stroke-border" strokeWidth="0.4" />
            {data.cities.map((c) => {
              const coord = GOVERNORATE_COORDS[c.city];
              if (!coord) return null;
              const radius = 1.6 + (c.total / maxTotal) * 3;
              const dominant: keyof typeof CITY_STATUS_COLOR =
                c.problem >= c.delayed && c.problem >= c.inTransit && c.problem >= c.delivered ? "problem"
                : c.delayed >= c.inTransit && c.delayed >= c.delivered ? "delayed"
                : c.inTransit >= c.delivered ? "inTransit"
                : "delivered";
              const isSelected = selectedCity === c.city;
              return (
                <g key={c.city} onClick={() => setSelectedCity(isSelected ? null : c.city)} className="cursor-pointer">
                  {isSelected && (
                    <circle cx={coord.x} cy={coord.y} r={radius + 2} fill="none" stroke={CITY_STATUS_COLOR[dominant]} strokeWidth="0.5" opacity="0.5" />
                  )}
                  <circle cx={coord.x} cy={coord.y} r={radius} fill={CITY_STATUS_COLOR[dominant]} opacity={isSelected ? 1 : 0.85} />
                  <title>{c.city}: {c.total} شحنة</title>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mt-2 sm:mt-3 text-[8px] sm:text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: CITY_STATUS_COLOR.delivered }} />تسليم</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: CITY_STATUS_COLOR.inTransit }} />قيد التوصيل</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: CITY_STATUS_COLOR.delayed }} />متأخر</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: CITY_STATUS_COLOR.problem }} />مشكلة</span>
        </div>

        {/* تفاصيل المحافظة المختارة */}
        {selected && (
          <div className="mt-2 sm:mt-3 p-2 sm:p-3 rounded-lg bg-muted/30 border border-border">
            <p className="text-[10px] sm:text-xs font-bold mb-1.5">{selected.city} — {fn(selected.total)} شحنة</p>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center">
              <div><p className="text-[9px] sm:text-[11px] font-black" style={{ color: CITY_STATUS_COLOR.delivered }}>{selected.delivered}</p><p className="text-[7px] sm:text-[9px] text-muted-foreground">تسليم</p></div>
              <div><p className="text-[9px] sm:text-[11px] font-black" style={{ color: CITY_STATUS_COLOR.inTransit }}>{selected.inTransit}</p><p className="text-[7px] sm:text-[9px] text-muted-foreground">توصيل</p></div>
              <div><p className="text-[9px] sm:text-[11px] font-black" style={{ color: CITY_STATUS_COLOR.delayed }}>{selected.delayed}</p><p className="text-[7px] sm:text-[9px] text-muted-foreground">تأخير</p></div>
              <div><p className="text-[9px] sm:text-[11px] font-black" style={{ color: CITY_STATUS_COLOR.problem }}>{selected.problem}</p><p className="text-[7px] sm:text-[9px] text-muted-foreground">مشكلة</p></div>
            </div>
          </div>
        )}

        {!selected && (
          <p className="text-center text-[8px] sm:text-[9px] text-muted-foreground mt-2">اضغط على أي نقطة لعرض تفاصيل المحافظة</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── سايدبار العمليات (شحنات متأخرة/بها مشكلة/خارجة اليوم/مندوبين/متابعة) ────────
function useOpsAlerts() {
  return useQuery({
    queryKey: ["analytics-ops-alerts"],
    queryFn: analyticsApi.opsAlerts,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 3 * 60_000,
    placeholderData: (prev: OpsAlertsResponse | undefined) => prev,
  });
}

function OpsSidebarCards() {
  const { data, isLoading } = useOpsAlerts();

  if (isLoading && !data) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-3 sm:p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted/40 rounded-lg animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const items = [
    { icon: Clock, label: "شحنات متأخرة", value: data.sidebar.delayedShipments, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
    { icon: AlertTriangle, label: "شحنات بها مشكلة", value: data.sidebar.problemShipments, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
    { icon: Truck, label: "شحنات خارجة اليوم", value: data.sidebar.outToday, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/30" },
    { icon: Users, label: "مندوبين متصلين الآن", value: data.sidebar.activeRepresentatives, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", sub: `من ${data.sidebar.totalRepresentatives}` },
    { icon: AlertCircle, label: "عملاء يحتاجون متابعة", value: data.sidebar.clientsNeedingFollowup, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30" },
  ];

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <h2 className="text-xs sm:text-sm font-bold text-muted-foreground mb-2 sm:mb-3">نظرة سريعة</h2>
        <div className="space-y-1.5 sm:space-y-2">
          {items.map((it) => (
            <div key={it.label} className={`flex items-center justify-between gap-2 rounded-lg p-2 sm:p-2.5 ${it.bg}`}>
              <div className="flex items-center gap-2 min-w-0">
                <it.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${it.color}`} />
                <span className="text-[10px] sm:text-xs font-medium text-foreground truncate">{it.label}</span>
              </div>
              <div className="text-left shrink-0">
                <span className={`text-sm sm:text-base font-black ${it.color}`}>{it.value}</span>
                {it.sub && <span className="text-[8px] sm:text-[9px] text-muted-foreground block">{it.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── قسم الذكاء الاصطناعي (تنبيهات تشغيلية ذكية) ────────────────────────────────
const OPS_ALERT_STYLE: Record<OpsAlert["type"], { icon: any; color: string; bg: string; label: string }> = {
  critical:    { icon: AlertOctagon,   color: "text-red-600 dark:text-red-400",     bg: "bg-red-50 dark:bg-red-950/30",     label: "تحذير" },
  warning:     { icon: AlertTriangle,  color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", label: "تنبيه" },
  info:        { icon: Zap,            color: "text-sky-600 dark:text-sky-400",     bg: "bg-sky-50 dark:bg-sky-950/30",     label: "ملحوظة" },
  opportunity: { icon: TrendingUp,     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", label: "فرصة" },
};

function OpsSmartAlertsPanel() {
  const { data, isLoading } = useOpsAlerts();

  if (isLoading && !data) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-3 sm:p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted/40 rounded-lg animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
          <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 dark:text-purple-400" />
          <h2 className="text-xs sm:text-sm font-bold text-muted-foreground">الذكاء الاصطناعي</h2>
        </div>
        {data.alerts.length === 0 ? (
          <p className="text-[10px] sm:text-xs text-muted-foreground text-center py-4">
            مفيش تنبيهات لافتة حاليًا — الأداء ضمن المعدل الطبيعي
          </p>
        ) : (
          <div className="space-y-1.5 sm:space-y-2">
            {data.alerts.map((alert) => {
              const style = OPS_ALERT_STYLE[alert.type];
              return (
                <div key={alert.id} className={`flex items-start gap-2 sm:gap-2.5 rounded-lg p-2 sm:p-2.5 ${style.bg}`}>
                  <style.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 mt-0.5 ${style.color}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[8px] sm:text-[9px] font-bold ${style.color}`}>{style.label}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs font-bold text-foreground leading-tight mt-0.5">{alert.title}</p>
                    <p className="text-[9px] sm:text-[11px] text-muted-foreground leading-tight mt-0.5">{alert.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ملخص الأرباح (donut) + اتجاه الإيرادات والأرباح ─────────────────────────────
function useShipmentsProfit() {
  return useQuery({
    queryKey: ["analytics-shipments-profit"],
    queryFn: analyticsApi.shipmentsProfit,
    staleTime: 3 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: ShipmentsProfitResponse | undefined) => prev,
  });
}

const PROFIT_SEGMENT_COLORS = {
  revenue: "#10b981", operating: "#f59e0b", shipping: "#3b82f6", other: "#a855f7", loss: "#ef4444",
} as const;

function ShipmentsProfitDonut() {
  const { data, isLoading } = useShipmentsProfit();

  if (isLoading && !data) {
    return (
      <Card className="border-border bg-card overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          <div className="h-56 sm:h-64 bg-muted/30 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const m = data.month;
  // نبني شرائح الدونات من التكاليف الثلاثة (تشغيل/شحن/أخرى) بالنسبة للإيراد الإجمالي
  const segments = [
    { key: "operating", label: "تكلفة التشغيل", value: m.cost, color: PROFIT_SEGMENT_COLORS.operating },
    { key: "shipping", label: "تكلفة الشحن", value: m.shippingSpend, color: PROFIT_SEGMENT_COLORS.shipping },
    { key: "other", label: "مصروفات أخرى", value: m.otherExpenses, color: PROFIT_SEGMENT_COLORS.other },
    { key: "net", label: "صافي الربح", value: Math.max(0, m.netProfit), color: PROFIT_SEGMENT_COLORS.revenue },
  ].filter(s => s.value > 0);

  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const size = 140, stroke = 20, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h2 className="text-xs sm:text-sm font-bold text-muted-foreground">ملخص الأرباح</h2>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground">آخر 30 يوم</span>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/20" />
              {segments.map((seg) => {
                const fraction = seg.value / total;
                const dashArray = c;
                const dashOffset = c - fraction * c;
                const rotation = (cumulative / total) * 360;
                cumulative += seg.value;
                return (
                  <circle
                    key={seg.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color} strokeWidth={stroke}
                    strokeDasharray={dashArray} strokeDashoffset={dashOffset}
                    style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "50% 50%", transition: "stroke-dashoffset 0.6s ease" }}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base sm:text-xl font-black text-foreground">{fn(Math.round(m.netProfit))}</span>
              <span className="text-[8px] sm:text-[9px] text-muted-foreground">صافي الربح</span>
            </div>
          </div>

          <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
            <div className="flex items-center justify-between text-[10px] sm:text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full" style={{ background: PROFIT_SEGMENT_COLORS.revenue }} />إجمالي الإيرادات</span>
              <span className="font-bold text-foreground">{fn(Math.round(m.revenue))}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] sm:text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full" style={{ background: PROFIT_SEGMENT_COLORS.operating }} />تكلفة التشغيل</span>
              <span className="font-bold text-foreground">{fn(Math.round(m.cost))}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] sm:text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full" style={{ background: PROFIT_SEGMENT_COLORS.shipping }} />تكلفة الشحن</span>
              <span className="font-bold text-foreground">{fn(Math.round(m.shippingSpend))}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] sm:text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-full" style={{ background: PROFIT_SEGMENT_COLORS.other }} />مصروفات أخرى</span>
              <span className="font-bold text-foreground">{fn(Math.round(m.otherExpenses))}</span>
            </div>
            <div className="pt-1.5 sm:pt-2 border-t border-border flex items-center justify-between text-[10px] sm:text-xs">
              <span className="font-bold text-foreground">صافي الربح</span>
              <span className={`font-black ${m.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {fn(Math.round(m.netProfit))}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ShipmentsRevenueTrendChart() {
  const { data, isLoading } = useShipmentsProfit();

  if (isLoading && !data) {
    return (
      <Card className="border-border bg-card overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          <div className="h-56 sm:h-64 bg-muted/30 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const chartData = data.dailyTrend.map(d => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }),
  }));

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h2 className="text-xs sm:text-sm font-bold text-muted-foreground">اتجاه الإيرادات والأرباح</h2>
          <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />الإيرادات</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />الأرباح</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, padding: "6px 10px" }}
              formatter={(v: number, name: string) => [fn(v), name === "revenue" ? "الإيرادات" : "الأرباح"]}
              labelStyle={{ color: "hsl(var(--foreground))", fontSize: 10, fontWeight: "bold" }}
            />
            <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="profit" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Period Card ───────────────────────────────────────────────────────────────
function PeriodCard({ label, data, accent }: { label: string; data: PeriodProfit; accent: string }) {
  const isProfit = data.netProfit >= 0;
  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-1.5 sm:p-4 space-y-1 sm:space-y-3">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[8px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
          <Badge variant="outline" className={`text-[7px] sm:text-[9px] font-bold border shrink-0 px-1 ${
            data.returnRate > 20 ? "border-red-400 text-red-600 dark:border-red-800 dark:text-red-400" : "border-border text-muted-foreground"
          }`}>{data.returnRate}%↩</Badge>
        </div>
        <div className="min-w-0">
          <p className={`text-sm sm:text-2xl font-black leading-tight truncate ${isProfit ? accent : "text-red-600 dark:text-red-400"}`}>{fc(data.netProfit)}</p>
          <p className="text-[7px] sm:text-[10px] text-muted-foreground">صافي الربح</p>
        </div>
        <div className="grid grid-cols-2 gap-x-1 gap-y-1 sm:gap-x-3 sm:gap-y-1.5 pt-1 sm:pt-2 border-t border-border">
          <div className="min-w-0">
            <p className="text-[7px] sm:text-[9px] text-muted-foreground leading-tight">إيرادات</p>
            <p className="text-[8px] sm:text-xs font-bold text-primary truncate">{fc(data.revenue - data.shippingCost)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[7px] sm:text-[9px] text-muted-foreground leading-tight">التكلفة</p>
            <p className="text-[8px] sm:text-xs font-bold text-amber-700 dark:text-amber-400 truncate">{fc(data.cost)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[7px] sm:text-[9px] text-muted-foreground leading-tight">الطلبات</p>
            <p className="text-[9px] sm:text-xs font-bold">{fn(data.orders)}</p>
          </div>
          <div>
            <p className="text-[7px] sm:text-[9px] text-muted-foreground leading-tight">مرتجع</p>
            <p className="text-[9px] sm:text-xs font-bold text-red-600 dark:text-red-400">{fn(data.returnCount)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Product Row ───────────────────────────────────────────────────────────────
function ProductRow({ product, rank, image }: { product: ProductProfit; rank: number; image?: string | null }) {
  const isPositive = product.profit >= 0;
  return (
    <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
      {/* رقم الترتيب */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
        rank === 1 ? "bg-amber-500 text-black" : rank === 2 ? "bg-zinc-400 text-black" : rank === 3 ? "bg-amber-700 text-white" : "bg-muted text-muted-foreground"
      }`}>{rank}</div>
      {/* صورة المنتج */}
      {image ? (
        <img src={image} alt={product.name} className="w-10 h-10 rounded-full object-cover border-2 border-border shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-muted border-2 border-border flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      {/* اسم المنتج والتفاصيل */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[11px] sm:text-xs truncate">{product.name}</p>
        <p className="text-[9px] sm:text-[10px] text-muted-foreground">{fn(product.quantity)} وحدة • {product.margin}% هامش</p>
      </div>
      {/* الربح والسهم */}
      <div className="flex items-center gap-1.5 shrink-0">
        <p className={`text-[11px] sm:text-xs font-black ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {fc(product.profit)}
        </p>
        {isPositive
          ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
          : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
        }
      </div>
    </div>
  );
}

// ─── Damaged Orders Modal ───────────────────────────────────────────────────
function DamagedOrdersModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-damaged-orders"],
    queryFn: () => apiFetchDashboard<{ orders: any[]; totalDamagedValue: number; totalLoss: number; count: number }>("/analytics/damaged-orders"),
    staleTime: 30000,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-red-200 dark:border-red-900/50 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-red-600 dark:text-red-400" />
            <h2 className="text-sm font-black text-red-700 dark:text-red-400">تفاصيل التوالف</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
            <X className="w-4 h-4 text-red-600 dark:text-red-400" />
          </button>
        </div>

        {/* Summary */}
        {data && (
          <div className="grid grid-cols-3 gap-2 p-3 border-b border-border bg-muted/20">
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground">عدد التوالف</p>
              <p className="text-base font-black text-red-600 dark:text-red-400">{data.count}</p>
            </div>
            <div className="text-center border-x border-border">
              <p className="text-[9px] text-muted-foreground">قيمة البضاعة</p>
              <p className="text-sm font-black text-red-600 dark:text-red-400">{fc(data.totalDamagedValue)}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground">الخسارة الكلية</p>
              <p className="text-sm font-black text-red-700 dark:text-red-300">{fc(data.totalLoss)}</p>
            </div>
          </div>
        )}

        {/* Orders List */}
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">جاري التحميل...</div>
          ) : !data || data.orders.length === 0 ? (
            <div className="py-10 text-center">
              <AlertOctagon className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground">لا توجد توالف مسجّلة</p>
            </div>
          ) : (
            data.orders.map((o: any) => (
              <Link key={o.id} href={`/orders/${o.id}`} onClick={onClose}>
                <div className="flex items-start justify-between p-3 rounded-lg border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/5 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors cursor-pointer gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-black truncate">{o.customerName}</span>
                      {o.invoiceNumber && (
                        <span className="text-[9px] font-mono text-primary/70 shrink-0">{o.invoiceNumber}</span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-foreground/80 truncate">
                      {o.product}{o.color ? ` • ${o.color}` : ""}{o.size ? ` / ${o.size}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {o.quantity} قطعة × {fc(o.costPrice)} تكلفة
                      {o.phone && <span className="mr-2 opacity-60">{o.phone}</span>}
                    </p>
                    {(o.returnReason || o.returnNote) && (
                      <p className="text-[9px] text-red-500/70 mt-0.5 truncate">
                        {o.returnReason === "quality" ? "جودة المنتج" :
                         o.returnReason === "size_mismatch" ? "مقاس غير مناسب" :
                         o.returnReason === "customer_refused" ? "عميل غير جاد" :
                         o.returnReason === "customer_requested_return" ? "طلب العميل" :
                         o.returnReason === "delay" ? "تأخير" :
                         o.returnNote || o.returnReason || ""}
                      </p>
                    )}
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-xs font-black text-red-600 dark:text-red-400">{fc(o.damagedCost)}</p>
                    <p className="text-[9px] text-muted-foreground">قيمة البضاعة</p>
                    <p className="text-[10px] font-bold text-red-700 dark:text-red-300 mt-0.5">{fc(o.totalLoss)}</p>
                    <p className="text-[9px] text-muted-foreground">إجمالي الخسارة</p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// helper fetch للداشبورد (خارج الـ apiFetch العام)
function apiFetchDashboard<T>(path: string): Promise<T> {
  const token = localStorage.getItem("caprina_token");
  return fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }).then(r => r.json());
}

// ─── Financial Row ──────────────────────────────────────────────────────────────
function FinRow({ label, value, color = "text-foreground", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-1.5 sm:py-2 border-b border-border/50 last:border-0 gap-0.5 sm:gap-2 min-w-0">
      <span className="text-[10px] sm:text-xs text-muted-foreground min-w-0 break-words">{label}</span>
      <div className="text-right min-w-0">
        <span className={`text-[10px] sm:text-xs font-bold block ${color}`}>{value}</span>
        {sub && <p className="text-[8px] sm:text-[9px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── PWA Install Banner ───────────────────────────────────────────────────────
function PwaInstallBanner() {
  const { canInstall, isInstalled, install, dismiss, isDismissed } = usePwaInstall();

  if (!canInstall || isInstalled || isDismissed) return null;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-xl sm:rounded-2xl border border-amber-500/30 px-3 py-3 sm:px-4 sm:py-3"
         style={{ background: "linear-gradient(135deg, #c9971c0d 0%, #f0b4290a 100%)" }}>
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl overflow-hidden shrink-0 border border-amber-500/30">
          <img src="./logo.jpg" alt="CAPRINA" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-black text-foreground leading-tight">ثبّت التطبيق على جهازك</p>
          <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 leading-tight">
            تجربة أسرع كتطبيق أصلي بدون متصفح
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto sm:mr-auto">
        <button type="button" onClick={dismiss}
          className="text-[10px] text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-muted/20 transition-colors">
          لاحقاً
        </button>
        <button type="button" onClick={install}
          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap">
          <span>⬇</span>تثبيت
        </button>
      </div>
    </div>
  );
}

// ─── Live Clock — memo عشان الـ setInterval مش يسبب re-render للـ Dashboard ──
const LiveClock = memo(function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const h = time.getHours();
  const ampm = h >= 12 ? "م" : "ص";
  const h12 = h % 12 || 12;
  const mm = String(time.getMinutes()).padStart(2, "0");
  const ss = String(time.getSeconds()).padStart(2, "0");
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 select-none">
      <Clock className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" style={{ color: "hsl(43 74% 50%)" }} />
      <span className="font-black text-lg sm:text-xl tabular-nums" style={{ color: "hsl(43 74% 50%)" }}>{h12}:{mm}:{ss}</span>
      <span className="text-xs sm:text-sm font-bold" style={{ color: "hsl(43 74% 50%)" }}>{ampm}</span>
    </div>
  );
});

// ─── Ad Sources meta ─────────────────────────────────────────────────────────
const AD_SOURCE_META: Record<string, { label: string; iconColor: string; gradFrom: string; gradTo: string; icon: React.ElementType }> = {
  facebook:  { label: "فيسبوك",   icon: FaFacebook,       iconColor: "#ffffff", gradFrom: "#1877F2", gradTo: "#0d4fa8" },
  tiktok:    { label: "تيك توك",  icon: FaTiktok,         iconColor: "#ffffff", gradFrom: "#010101", gradTo: "#333333" },
  instagram: { label: "إنستجرام", icon: FaInstagram,      iconColor: "#ffffff", gradFrom: "#833ab4", gradTo: "#fd1d1d" },
  organic:   { label: "ويبسايت",  icon: Globe,            iconColor: "#ffffff", gradFrom: "#6366f1", gradTo: "#4338ca" },
  unknown:   { label: "عضوي",     icon: Globe,            iconColor: "#ffffff", gradFrom: "#94a3b8", gradTo: "#64748b" },
  whatsapp:  { label: "واتساب",   icon: FaWhatsapp,       iconColor: "#ffffff", gradFrom: "#25D366", gradTo: "#128C7E" },
  other:     { label: "أخرى",     icon: FiMoreHorizontal, iconColor: "#ffffff", gradFrom: "#6b7280", gradTo: "#374151" },
};
function getAdMeta(src: string) { return AD_SOURCE_META[src] ?? AD_SOURCE_META.other; }

/** Card للمنصة الإعلانية في الداشبورد */
function DashAdSourceCard({ source, orders, revenue, profit, returnRate, maxRevenue, canViewFinancials, isBest, shippingShare = 0 }: {
  source: string; orders: number; revenue: number; profit: number; returnRate: number;
  maxRevenue: number; canViewFinancials: boolean; isBest: boolean; shippingShare?: number;
}) {
  const meta = getAdMeta(source);
  const Icon = meta.icon;
  const revenueAfterShipping = revenue - shippingShare;
  const barPct = Math.max(4, Math.round((revenue / maxRevenue) * 100));

  return (
    <div className={`relative rounded-xl border bg-card p-3 sm:p-4 space-y-2.5 transition-all ${isBest ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}`}>
      {isBest && (
        <span className="absolute top-2 left-2 text-[8px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
          الأفضل
        </span>
      )}

      {/* أيقونة + اسم */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${meta.gradFrom}, ${meta.gradTo})` }}>
          <Icon style={{ color: meta.iconColor }} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-xs sm:text-sm truncate">{meta.label}</p>
          <p className="text-[9px] text-muted-foreground">{new Intl.NumberFormat("ar-EG").format(orders)} طلب</p>
        </div>
        <Badge variant="outline" className={`text-[8px] h-4 shrink-0 ${returnRate > 30 ? "border-red-400 text-red-500" : returnRate > 15 ? "border-amber-400 text-amber-500" : "border-emerald-400 text-emerald-500"}`}>
          {returnRate}% رجوع
        </Badge>
      </div>

      {/* progress bar الإيرادات */}
      <div className="space-y-0.5">
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>الإيرادات</span>
          <span className={`font-bold ${revenueAfterShipping >= 0 ? "text-foreground" : "text-red-500"}`}>
            {new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(revenueAfterShipping)}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="h-1.5 rounded-full transition-all duration-700"
            style={{ width: `${barPct}%`, background: `linear-gradient(90deg, ${meta.gradFrom}, ${meta.gradTo})` }} />
        </div>
      </div>

      {/* صافي الربح */}
      {canViewFinancials && (
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-[9px] text-muted-foreground">صافي الربح</span>
          <span className={`text-[10px] sm:text-xs font-black ${profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
            {profit >= 0 ? "▲" : "▼"} {new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Math.abs(profit))}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Team member row for dashboard ────────────────────────────────────────────
function DashTeamMemberRow({ member, rank, maxScore, showProfit }: {
  member: TeamMemberExtStats; rank: number; maxScore: number; showProfit: boolean;
}) {
  const scorePct = maxScore > 0 ? Math.round((member.score / maxScore) * 100) : 0;
  const avatarColors = dbAvatarColor(member.displayName || "?");
  const rankColors = [
    "bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 ring-1 ring-yellow-400/40",
    "bg-slate-300/20 text-slate-500 dark:text-slate-300 ring-1 ring-slate-400/30",
    "bg-orange-400/20 text-orange-600 dark:text-orange-400 ring-1 ring-orange-400/30",
  ];
  const rankCls = rank <= 3 ? rankColors[Math.max(0, Math.min(rankColors.length - 1, rank - 1))] : "bg-muted/20 text-muted-foreground";

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/20 transition-colors">
      {/* rank + avatar */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${rankCls}`}>
        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
      </div>
      {member.avatar && member.avatar.startsWith("data:") ? (
        <img src={member.avatar} className="w-8 h-8 rounded-full object-cover border border-border/50 shrink-0" alt={member.displayName} />
      ) : (
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 border border-border/30"
          style={{ background: avatarColors[0], color: avatarColors[1] }}>
          {dbInitials(member.displayName || "?")}
        </div>
      )}
      {/* info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold truncate">{member.displayName}</p>
          <span className={`text-[10px] font-black shrink-0 ${
            member.deliveryRate >= 70 ? "text-emerald-500" : member.deliveryRate >= 50 ? "text-amber-500" : "text-red-500"
          }`}>{member.deliveryRate}%</span>
        </div>
        {/* mini progress bar */}
        <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${
            scorePct >= 70 ? "bg-emerald-500" : scorePct >= 40 ? "bg-amber-400" : "bg-rose-400"
          }`} style={{ width: `${scorePct}%` }} />
        </div>
        {/* stats row */}
        <div className="flex gap-2.5 mt-1">
          <span className="text-[9px] text-emerald-600 dark:text-emerald-400">✓ {member.delivered}</span>
          <span className="text-[9px] text-red-500">↩ {member.returned}</span>
          <span className="text-[9px] text-muted-foreground">{member.returnRate}% مرتجع</span>
          {showProfit && (
            <span className={`text-[9px] font-semibold ms-auto shrink-0 ${member.profit >= 0 ? "text-emerald-500" : "text-red-400"}`}>
              {new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(member.profit)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
type Period = "today" | "week" | "month";

/** Card لشركة شحن في الداشبورد مع إحصائياتها */
function DashShippingCompanyRow({ company, allStats, allManifests, canViewFinancials }: {
  company: any;
  allStats?: Record<number, any>;
  allManifests?: Record<number, any[]>;
  canViewFinancials: boolean;
}) {
  const stats = allStats?.[company.id] ?? null;
  const manifests = allManifests?.[company.id] ?? [];
  const openManifest = manifests.find((m: any) => m.status === "open") ?? null;
  const deliveryRate = stats?.deliveryRate ?? 0;
  const rateColor = deliveryRate >= 70 ? "text-emerald-500 dark:text-emerald-400" : deliveryRate >= 40 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400";
  const barColor   = deliveryRate >= 70 ? "bg-emerald-500" : deliveryRate >= 40 ? "bg-amber-500" : "bg-red-500";
  const borderColor = deliveryRate >= 70 ? "border-emerald-200 dark:border-emerald-900/40" : deliveryRate >= 40 ? "border-amber-200 dark:border-amber-900/40" : "border-border";

  return (
    <Link href={`/shipping/company/${company.id}`}>
      <div className={`rounded-xl border ${borderColor} bg-card hover:bg-muted/20 transition-colors cursor-pointer p-3 sm:p-4 space-y-3`}>

        {/* ── Header: لوجو + اسم + نسبة ── */}
        <div className="flex items-center gap-2.5">
          {company.logo && company.logo.startsWith("data:") ? (
            <img src={company.logo} className="w-10 h-10 rounded-full object-cover border-2 border-border/50 shrink-0" alt={company.name} />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-primary/60" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs sm:text-sm truncate">{company.name}</p>
            {company.phone && (
              <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{company.phone}</p>
            )}
          </div>
          {stats && (
            <span className={`text-sm font-black shrink-0 ${rateColor}`}>{deliveryRate}%</span>
          )}
        </div>

        {/* ── Progress bar ── */}
        {stats && (
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>نسبة التسليم</span>
              <span className={`font-bold ${rateColor}`}>{deliveryRate}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div className={`h-1.5 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${deliveryRate}%` }} />
            </div>
          </div>
        )}

        {/* ── Stats grid ── */}
        {stats ? (
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 py-1.5 px-1">
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{stats.delivered}</p>
              <p className="text-[8px] sm:text-[9px] text-muted-foreground">مُسلَّم</p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 py-1.5 px-1">
              <p className="text-sm font-black text-red-500 dark:text-red-400">{stats.returned}</p>
              <p className="text-[8px] sm:text-[9px] text-muted-foreground">مرتجع</p>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 py-1.5 px-1">
              <p className="text-sm font-black text-amber-600 dark:text-amber-400">{stats.pending + (stats.postponed ?? 0)}</p>
              <p className="text-[8px] sm:text-[9px] text-muted-foreground">قيد الشحن</p>
            </div>
          </div>
        ) : (
          <div className="h-10 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* ── Footer: بيان مفتوح + صافي الربح ── */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/50 flex-wrap">
          {openManifest ? (
            <Badge variant="outline" className="text-[8px] sm:text-[9px] border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 h-5 gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
              بيان مفتوح · {openManifest.orderCount} طلب
            </Badge>
          ) : (
            <span className="text-[8px] sm:text-[9px] text-muted-foreground/60">لا يوجد بيان مفتوح</span>
          )}
          {canViewFinancials && stats && stats.netProfit !== undefined && (
            <span className={`text-[9px] sm:text-[10px] font-black mr-auto ${stats.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
              {stats.netProfit >= 0 ? "▲" : "▼"} {new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Math.abs(stats.netProfit))}
            </span>
          )}
        </div>

      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { isAdmin, canViewFinancials, can } = useAuth();
  // ── Dashboard permission shortcuts ───────────────────────────────────
  const canSeeFinancials    = isAdmin || can("dashboard.financials");
  const canSeeShippingStats = isAdmin || can("dashboard.shipping_stats");
  const canSeeReturns       = isAdmin || can("dashboard.returns");
  const canSeeTeam          = isAdmin || can("dashboard.team");
  const [period, setPeriod] = useState<Period>("today");
  const [showDamagedModal, setShowDamagedModal] = useState(false);
  const [clientPeriod, setClientPeriod] = useState<"thisWeek" | "lastWeek" | "thisMonth">("thisWeek");
  const { data: summary } = useGetOrdersSummary({
    query: { queryKey: ["orders-summary"], staleTime: 60_000, refetchOnWindowFocus: false, refetchInterval: 120_000 },
  });
  const { data: recentOrders, isLoading: isRecentLoading } = useGetRecentOrders({
    query: { queryKey: ["recent-orders"], staleTime: 60_000, refetchOnWindowFocus: false, refetchInterval: 120_000 },
  });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: productsApi.list, staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery({
    queryKey: ["analytics-profit", period],
    queryFn: () => analyticsApi.profit({ period }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
    enabled: canViewFinancials,
  });
  const { data: fin, isLoading: isFinLoading } = useQuery({
    queryKey: ["analytics-financial", period],
    queryFn: () => analyticsApi.financialSummary({ period }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
    enabled: canViewFinancials,
  });
  const { data: alertsData } = useQuery({
    queryKey: ["analytics-alerts"],
    queryFn: analyticsApi.alerts,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
  });
  const { data: smartData } = useQuery({
    queryKey: ["smart-insights"],
    queryFn: analyticsApi.smartInsights,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
  });
  const { data: recentClients = [] } = useQuery<any[]>({
    queryKey: ["recent-clients-dashboard"],
    queryFn: () => apiFetchDashboard<any[]>("/finance/clients?limit=5"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
    enabled: isAdmin || can("finance.view"),
  });
  const { data: shipmentsStatus } = useQuery({
    queryKey: ["analytics-shipments-status"],
    queryFn: () => apiFetchDashboard<{ statusBreakdown: { status: string; count: number; pct: number }[]; total: number }>("/analytics/shipments-status"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: any) => prev,
  });
  const { data: teamPerf = [] } = useQuery<TeamMemberExtStats[]>({
    queryKey: ["team-perf-dashboard"],
    queryFn: () => teamAnalyticsApi.teamPerformanceExtended(),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
    enabled: isAdmin || can("team.performance"),
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list(),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
    enabled: isAdmin || can("settings.users"),
  });
  const { data: saleOrders = [] } = useQuery<any[]>({
    queryKey: ["sale-orders-dashboard-chart"],
    queryFn: () => apiFetchDashboard<any[]>("/finance/sale-orders?limit=200"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
    enabled: isAdmin || can("finance.view"),
  });
  const { data: chartsData } = useQuery({
    queryKey: ["analytics-charts"],
    queryFn: analyticsApi.charts,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: any) => prev,
  });
  const { data: shipmentChartsData } = useQuery({
    queryKey: ["analytics-shipment-charts"],
    queryFn: analyticsApi.shipmentCharts,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: any) => prev,
  });
  const { data: productPerformance = [], isLoading: isPerfLoading } = useQuery<any[]>({
    queryKey: ["analytics-product-performance"],
    queryFn: analyticsApi.productPerformance,
    staleTime: 30 * 60 * 1000,          // ✅ 30 دقيقة — متطابق مع cache الـ backend
    gcTime: 60 * 60 * 1000,             // ✅ يفضل في الـ cache ساعة كاملة
    placeholderData: (prev: any[] | undefined) => prev,     // ✅ يعرض الداتا القديمة فوراً عند الـ reload
    refetchOnWindowFocus: false,         // ✅ مش يعيد التحميل كل ما تفتح التاب
    refetchOnMount: false,               // ✅ لو الداتا موجودة في الكاش متجيبهاش تاني
    enabled: canViewFinancials,
  });

  const { data: shippingFollowup = [] } = useQuery<any[]>({
    queryKey: ["shipping-followup-dashboard"],
    queryFn: analyticsApi.shippingFollowup,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev,
    enabled: isAdmin || can("shipping.view"),
  });

  const { data: shippingCompanies = [] } = useQuery<any[]>({
    queryKey: ["shipping"],
    queryFn: shippingApi.list,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: isAdmin || can("shipping.view"),
  });

  // ── Batch shipping stats: request واحد لكل الشركات بدل N+1 ──
  const { data: allShippingStats = {} } = useQuery<Record<number, any>>({
    queryKey: ["shipping-stats-all"],
    queryFn: async () => {
      if (!shippingCompanies.length) return {};
      const results = await Promise.all(
        shippingCompanies.map((c: any) => manifestsApi.companyStats(c.id).then(s => [c.id, s] as const).catch(() => [c.id, null] as const))
      );
      return Object.fromEntries(results);
    },
    enabled: shippingCompanies.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: allShippingManifests = {} } = useQuery<Record<number, any[]>>({
    queryKey: ["shipping-manifests-all"],
    queryFn: async () => {
      if (!shippingCompanies.length) return {};
      const results = await Promise.all(
        shippingCompanies.map((c: any) => manifestsApi.list(c.id).then(ms => [c.id, ms] as const).catch(() => [c.id, []] as const))
      );
      return Object.fromEntries(results);
    },
    enabled: shippingCompanies.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: employeeProfiles = [] } = useQuery<any[]>({
    queryKey: ["employee-profiles-dashboard"],
    queryFn: () => employeeApi.listProfiles(),
    staleTime: 120000,
    enabled: isAdmin,
  });

  const { data: cashRegisters } = useQuery({
    queryKey: ["cash-registers-list"],
    queryFn: cashRegistersApi.list,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev,
    enabled: canViewFinancials,
  });
  const totalCash = cashRegisters?.totalBalance ?? 0;

  // ── خريطة موحدة للصور: تجمع allUsers + employeeProfiles + teamPerf (userId → avatar) ──
  const avatarMap = useMemo(() => {
    const map = new Map<number, string>();
    // أولاً: من teamPerf — بيانات أساسية
    for (const m of (teamPerf as any[])) {
      if (m.userId && m.avatar) map.set(m.userId, m.avatar);
    }
    // ثانياً: من employeeProfiles — يغلب teamPerf لو فيه صورة محدثة
    for (const emp of employeeProfiles) {
      if ((emp as any).userId && (emp as any).avatar) map.set((emp as any).userId, (emp as any).avatar);
    }
    // ثالثاً: من allUsers (إدارة المستخدمين) — الأولوية القصوى
    for (const u of (allUsers as any[])) {
      if (u.id && u.avatar) map.set(u.id, u.avatar);
    }
    return map;
  }, [employeeProfiles, teamPerf, allUsers]);

  // ── حساب trend ديناميكي لكل منتج من آخر 7 أسابيع ──
  const productTrendMap = useMemo(() => {
    if (!saleOrders?.length) return {} as Record<string, number[]>;
    const now = new Date();
    const weeks = 7;
    const map: Record<string, number[]> = {};
    for (let w = 0; w < weeks; w++) {
      const from = new Date(now);
      from.setDate(now.getDate() - (weeks - w) * 7);
      const to = new Date(from);
      to.setDate(from.getDate() + 7);
      saleOrders.forEach((order: any) => {
        const d = new Date(order.createdAt || order.date || 0);
        if (d >= from && d < to) {
          const items: any[] = order.items || order.orderItems || [];
          items.forEach((item: any) => {
            const name = item.productName || item.name || "";
            if (!name) return;
            if (!map[name]) map[name] = Array(weeks).fill(0);
            map[name][w] += item.quantity || 1;
          });
        }
      });
    }
    return map;
  }, [saleOrders]);

  const highAlerts = alertsData?.alerts.filter(a => a.severity === "high" && a.type !== "HIGH_RETURN") ?? [];
  const allAlerts = alertsData?.alerts ?? [];

  const lowStockAlerts = alertsData?.alerts.filter(a => a.type === "LOW_STOCK") ?? [];

  const hasCostData = fin && (fin.cashIn > 0 || fin.inventoryAtCost > 0);
  const noCostWarning = fin && fin.cashIn > 0 && fin.costOfGoods === 0;

  return (
    <>
    <div className="space-y-3 sm:space-y-4 lg:space-y-5 pb-4 sm:pb-0 min-w-0 overflow-x-hidden">

      {/* ── Header ── */}
      <div className="flex flex-col gap-2">
        {/* Row 1: العنوان + ساعة */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-sm sm:text-xl lg:text-2xl font-bold truncate">لوحة إدارة العمليات</h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs hidden sm:block">CAPRINA OS.Dashboard</p>
          </div>
          <LiveClock />
        </div>
        {/* Row 2: الأزرار — سطر مستقل على الموبايل */}
        <div className="flex items-center gap-1.5 flex-wrap px-3 sm:px-0">
          {canViewFinancials && (
            <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5 bg-muted/30">
              {([
                { key: "today", label: "اليوم" },
                { key: "week",  label: "أسبوع" },
                { key: "month", label: "شهر" },
              ] as { key: Period; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-bold transition-colors ${
                    period === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <Link href="/smart" className="mr-auto sm:mr-0">
            <button className="flex items-center gap-1 border border-primary/30 text-primary hover:bg-primary/5 px-2 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-colors">
              <Brain className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>ذكاء</span>
            </button>
          </Link>
        </div>
      </div>

      {/* === Operations KPI Cards === */}
      <OperationsKpiRow />

      {/* === Performance Metrics (6 دوائر) === */}
      <PerformanceMetricsRow />
      <EgyptActivityMap />

      {/* === سايدبار (نظرة سريعة) + الذكاء الاصطناعي === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <OpsSidebarCards />
        <OpsSmartAlertsPanel />
      </div>

      {/* === تحذير متابعة الشحن === */}
      {shippingFollowup.length > 0 && (() => {
        const urgent   = shippingFollowup.filter((o: any) => o.daysPending >= 7);
        const delayed  = shippingFollowup.filter((o: any) => o.daysPending >= 3 && o.daysPending < 7);
        const isUrgent = urgent.length > 0;
        return (
          <div className={`flex items-start gap-2.5 sm:gap-3 rounded-xl border p-3 sm:p-4 ${
            isUrgent
              ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800"
              : "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60"
          }`}>
            {/* أيقونة */}
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${
              isUrgent ? "bg-red-100 dark:bg-red-900/40" : "bg-amber-100 dark:bg-amber-900/30"
            }`}>
              {isUrgent
                ? <AlertOctagon className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400" />
                : <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400" />
              }
            </div>
            {/* المحتوى */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-xs sm:text-sm font-black ${
                  isUrgent ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"
                }`}>
                  {isUrgent ? <><span className="animate-pulse" style={{filter:"drop-shadow(0 0 6px #ef4444) drop-shadow(0 0 12px #ef4444)"}}>🚨</span>{" عاجل — شحنات تجاوزت 7 أيام!"}</> : "⚠️ تنبيه — شحنات تحتاج متابعة"}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {urgent.length > 0 && (
                    <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full">
                      {urgent.length} عاجل ≥7 أيام
                    </span>
                  )}
                  {delayed.length > 0 && (
                    <span className="text-[9px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full">
                      {delayed.length} متأخر 3-7 أيام
                    </span>
                  )}
                </div>
              </div>
              <p className={`text-[10px] sm:text-xs mt-1 ${
                isUrgent ? "text-red-600/80 dark:text-red-400/80" : "text-amber-600/80 dark:text-amber-400/80"
              }`}>
                تأكد من متابعة هذه الشحنات مع شركات الشحن وتحديث أرقام التتبع في الطلبات.
              </p>
              {/* أبرز الطلبات */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {shippingFollowup.slice(0, 4).map((o: any) => (
                  <Link key={o.id} href={`/orders/${o.id}`}>
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${
                      o.daysPending >= 7
                        ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400"
                        : "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
                    }`}>
                      <span>{o.customerName}</span>
                      <span className="opacity-60">•</span>
                      <span>{o.daysPending}ي</span>
                    </span>
                  </Link>
                ))}
                {shippingFollowup.length > 4 && (
                  <span className="text-[9px] text-muted-foreground self-center">
                    +{shippingFollowup.length - 4} أخرى
                  </span>
                )}
              </div>
            </div>
            {/* زر متابعة */}
            <Link href="/shipping-followup" className="shrink-0">
              <button className={`text-[10px] sm:text-xs font-black px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                isUrgent
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-amber-500 hover:bg-amber-400 text-white"
              }`}>
                متابعة الشحنات ←
              </button>
            </Link>
          </div>
        );
      })()}

      {/* === NO COST DATA WARNING (admin only) === */}
      {canViewFinancials && noCostWarning && (
        <div className="flex items-start gap-2 sm:gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-2.5 sm:p-3">
          <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] sm:text-sm font-bold text-amber-700 dark:text-amber-400">تحذير: بيانات التكلفة غير مكتملة</p>
            <p className="text-[9px] sm:text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">
              بعض المنتجات ليس لها سعر تكلفة. أضف costPrice للمنتجات لتفعيل الحساب المالي الدقيق.
            </p>
          </div>
          <Link href="/inventory" className="text-[10px] sm:text-xs text-primary hover:underline shrink-0 self-center">المخزون</Link>
        </div>
      )}

      {/* === FINANCIAL OVERVIEW BANNER === */}
      {canViewFinancials && canSeeFinancials && fin && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/5 overflow-hidden">
          <div className="p-3 sm:p-4">
            {/* الرقم الكبير */}
            <div className="mb-2 sm:mb-3">
              <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                إجمالي أرصدة الخزن
              </p>
              <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-emerald-600 dark:text-emerald-400 leading-tight">
                {fc(totalCash)}
              </p>
            </div>
            {/* بطاقتان صغيرتان */}
            <div className="grid grid-cols-2 gap-2 mb-2 sm:mb-3">
              <div className="bg-background/40 border border-border rounded-lg px-2 py-2 sm:px-4 sm:py-3">
                <p className="text-[8px] sm:text-[9px] text-muted-foreground">صافي الربح</p>
                <p className={`text-sm sm:text-lg font-black ${fin.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{fc(fin.netProfit)}</p>
                <p className="text-[8px] sm:text-[9px] text-muted-foreground">{fin.netMargin}%</p>
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-2 py-2 sm:px-4 sm:py-3">
                <p className="text-[8px] sm:text-[9px] text-muted-foreground">في الطريق</p>
                <p className="text-sm sm:text-lg font-black text-primary">{fc(fin.pendingRevenue)}</p>
                <p className="text-[8px] sm:text-[9px] text-muted-foreground">محتمل</p>
              </div>
            </div>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 sm:p-3 bg-background/30 rounded-lg border border-border/40">
              <div className="text-center">
                <p className="text-[8px] sm:text-[9px] font-bold text-muted-foreground mb-0.5">المقبوض</p>
                <p className="font-black text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">{fc(fin.cashIn - fin.shippingSpend)}</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] sm:text-[9px] font-bold text-muted-foreground mb-0.5">تكلفة البضاعة</p>
                <p className="font-black text-amber-700 dark:text-amber-400 text-xs sm:text-sm">{fc(fin.costOfGoods)}</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] sm:text-[9px] font-bold text-muted-foreground mb-0.5">تكلفة الشحن</p>
                <p className="font-black text-orange-600 dark:text-orange-400 text-xs sm:text-sm">{fc(fin.shippingSpend)}</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] sm:text-[9px] font-bold text-muted-foreground mb-0.5">خسائر المرتجعات</p>
                <p className="font-black text-red-600 dark:text-red-400 text-xs sm:text-sm">{fc(fin.returnLoss)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SMART ALERTS === */}
      {allAlerts.length > 0 && (
        <div className="space-y-1.5">
          {highAlerts.map(alert => (
            <div key={alert.id} className="flex items-center gap-2 sm:gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg p-2.5 sm:p-3">
              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600 dark:text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs font-bold text-red-700 dark:text-red-400 truncate">{alert.title}</p>
                <p className="text-[9px] sm:text-[11px] text-red-600/70 dark:text-red-400/70 truncate">{alert.detail}</p>
              </div>
              {alert.type === "LOW_STOCK" && (
                <Link href="/inventory" className="text-[9px] sm:text-xs text-primary hover:underline shrink-0">إدارة</Link>
              )}
              {(alert.type === "HIGH_RETURN" || alert.type === "LOSING_PRODUCT") && (
                <Link href="/product-performance" className="text-[9px] sm:text-xs text-primary hover:underline shrink-0">تحليل</Link>
              )}
            </div>
          ))}
          {alertsData && alertsData.counts.total > highAlerts.length && (
            <div className="flex items-center gap-2 sm:gap-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 rounded-lg p-2 sm:p-2.5">
              <Bell className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-[9px] sm:text-xs text-amber-700/80 dark:text-amber-400/80 flex-1 min-w-0 truncate">
                {alertsData.counts.medium > 0 && `${alertsData.counts.medium} تنبيه متوسط`}
                {alertsData.counts.medium > 0 && alertsData.counts.low > 0 && " • "}
                {alertsData.counts.low > 0 && `${alertsData.counts.low} تنبيه منخفض`}
              </p>
              <Link href="/product-performance" className="text-[9px] sm:text-xs text-primary hover:underline shrink-0">عرض الكل ←</Link>
            </div>
          )}
        </div>
      )}

      {/* === PERIOD CARDS (admin only) === */}
      {canViewFinancials && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 px-3 sm:px-0">
          {isAnalyticsLoading ? (
            [1,2,3].map(i => <Card key={i} className="animate-pulse h-32 sm:h-36 border-border" />)
          ) : analytics ? (
            <>
              {([
                { key: "today" as Period, label: "اليوم",        data: analytics.today, accent: "text-primary" },
                { key: "week"  as Period, label: "هذا الأسبوع", data: analytics.week,  accent: "text-emerald-600 dark:text-emerald-400" },
                { key: "month" as Period, label: "هذا الشهر",   data: analytics.month, accent: "text-amber-700 dark:text-amber-400" },
              ]).map(({ key, label, data, accent }) => (
                <div
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={`w-full min-w-0 rounded-xl cursor-pointer transition-all duration-200 ${
                    period === key
                      ? "border-2 border-primary shadow-lg"
                      : "border-2 border-transparent opacity-70 hover:opacity-90 hover:shadow-sm"
                  }`}
                >
                  <PeriodCard label={label} data={data} accent={period === key ? accent : "text-muted-foreground"} />
                </div>
              ))}
            </>
          ) : null}
        </div>
      )}

      {/* === ملخص الأرباح + اتجاه الإيرادات والأرباح === */}
      {canViewFinancials && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3 px-3 sm:px-0">
          <ShipmentsProfitDonut />
          <ShipmentsRevenueTrendChart />
        </div>
      )}

      {/* === PWA INSTALL BANNER === */}
      <PwaInstallBanner />

      {/* === VISUAL CHARTS === */}
      {chartsData ? (
        <div className="space-y-3 sm:space-y-4">
          {/* الصف الأول: الدونات + ملخص الحالات */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <ChartCard
              title="توزيع حالات الشحنات"
              dot="#06b6d4"
              liveTag
            >
              {shipmentsStatus && shipmentsStatus.total > 0
                ? <ShipmentStatusDonut data={shipmentsStatus.statusBreakdown} total={shipmentsStatus.total} />
                : <StatusDonutWithOrders data={chartsData?.statusBreakdown ?? []} total={chartsData?.total ?? 0} />
              }

              {/* ── أحدث العملاء ── */}
              {recentClients.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" /> أحدث العملاء
                    </p>
                    <Link href="/finance/clients" className="text-[10px] text-primary hover:underline">
                      عرض الكل ←
                    </Link>
                  </div>
                  <div className="space-y-0.5">
                    {recentClients.slice(0, 5).map((c: any) => (
                      <Link
                        key={c.id}
                        href={`/finance/clients/${c.id}`}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors group"
                      >
                        <DashClientAvatar avatar={c.avatar} name={c.name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                            {c.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {c.email || c.phone || c.city || "—"}
                          </p>
                        </div>
                        <span className="text-[9px] text-muted-foreground shrink-0 bg-muted/40 px-1.5 py-0.5 rounded-full">
                          {c.createdAt ? (() => {
                            const mins = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 60000);
                            if (mins < 60) return `${mins}د`;
                            const hrs = Math.floor(mins / 60);
                            if (hrs < 24) return `${hrs}س`;
                            return `${Math.floor(hrs / 24)}ي`;
                          })() : "—"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>

            {/* ── الكارت الثاني: ملخص حالات الشحنات ── */}
            <ChartCard
              title="ملخص الشحنات"
              subtitle="توزيع الحالات الإجمالي"
              dot="#8b5cf6"
            >
              {shipmentsStatus && shipmentsStatus.total > 0 ? (
                <div className="space-y-2">
                  {/* الإجمالي */}
                  <div className="flex items-center justify-between px-1 pb-2 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">إجمالي الشحنات</span>
                    <span className="text-2xl font-black text-foreground">{shipmentsStatus.total}</span>
                  </div>
                  {/* الحالات */}
                  <div className="space-y-1.5">
                    {shipmentsStatus.statusBreakdown
                      .sort((a: any, b: any) => b.count - a.count)
                      .slice(0, 8)
                      .map((s: any) => {
                        const cfgMap: Record<string, { label: string; color: string }> = {
                          pending:          { label: "قيد الانتظار",          color: "#eab308" },
                          warehouse_ready:  { label: "قيد الشحن في المخزن",  color: "#14b8a6" },
                          in_shipping:      { label: "قيد الشحن",             color: "#3b82f6" },
                          out_for_delivery: { label: "خرجت للتسليم",          color: "#f59e0b" },
                          received:         { label: "استلم",                 color: "#22c55e" },
                          partial_received: { label: "استلم جزئي",            color: "#06b6d4" },
                          returned:         { label: "مرتجع",                 color: "#ef4444" },
                          cancelled:        { label: "ملغية",                 color: "#6b7280" },
                          delayed:          { label: "مؤجل",                  color: "#8b5cf6" },
                          delivered:        { label: "تم التسليم",            color: "#22c55e" },
                        };
                        const cfg = cfgMap[s.status] ?? { label: s.status, color: "#94a3b8" };
                        return (
                          <div key={s.status} className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.color }} />
                            <span className="text-xs text-foreground flex-1 truncate">{cfg.label}</span>
                            <span className="text-xs font-black shrink-0" style={{ color: cfg.color }}>{s.count}</span>
                            <div className="w-16 h-1.5 rounded-full overflow-hidden bg-muted/40 shrink-0">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${s.pct}%`, background: cfg.color }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 w-7 text-right">{s.pct}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <span className="text-3xl opacity-20">🚚</span>
                  <span className="text-xs text-muted-foreground">لا توجد شحنات بعد</span>
                </div>
              )}
            </ChartCard>
          </div>

          {/* الصف الثاني: الشحنات الأسبوعية (عرض كامل) */}
          <ChartCard
            title="الشحنات الأسبوعية"
            subtitle="الأسبوع الحالي والأسبوع الماضي والشهر الحالي"
            dot="#3b82f6"
          >
            <WeeklyShipmentBars data={shipmentChartsData} />
          </ChartCard>
        </div>
      ) : (
        <ChartsSection />
      )}

      {/* === SMART QUICK INSIGHTS === */}
      {smartData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">

          {/* أفضل منصة */}
          <Link href="/smart">
            <div className="flex items-center gap-2 sm:gap-2.5 p-2 sm:p-3 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-colors cursor-pointer">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg shrink-0 overflow-hidden">
                {!smartData.adAttribution.bestSource || smartData.adAttribution.bestSource.source === "facebook" ? (
                  <svg viewBox="0 0 36 36" className="w-full h-full" fill="none">
                    <rect width="36" height="36" rx="8" fill="#1877F2"/>
                    <path d="M25 18c0-3.866-3.134-7-7-7s-7 3.134-7 7c0 3.493 2.559 6.39 5.906 6.917V20.28h-1.777V18h1.777v-1.541c0-1.754 1.045-2.722 2.643-2.722.765 0 1.566.137 1.566.137v1.722h-.882c-.869 0-1.139.54-1.139 1.094V18h1.938l-.31 2.28h-1.628v4.637C22.441 24.39 25 21.493 25 18z" fill="white"/>
                  </svg>
                ) : smartData.adAttribution.bestSource.source === "tiktok" ? (
                  <svg viewBox="0 0 36 36" className="w-full h-full" fill="none">
                    <rect width="36" height="36" rx="8" fill="#010101"/>
                    <path d="M22.5 9h-2.8v12.2a2.9 2.9 0 01-2.9 2.7 2.9 2.9 0 01-2.9-2.9 2.9 2.9 0 012.9-2.9c.28 0 .55.04.8.11V15.3a6.1 6.1 0 00-.8-.05 5.95 5.95 0 00-5.95 5.95A5.95 5.95 0 0016.8 27a5.95 5.95 0 005.95-5.95V15.1a8.6 8.6 0 005.05 1.63v-2.8a5.8 5.8 0 01-5.3-4.93z" fill="white"/>
                  </svg>
                ) : smartData.adAttribution.bestSource.source === "instagram" ? (
                  <svg viewBox="0 0 36 36" className="w-5 h-5" fill="none">
                    <defs>
                      <linearGradient id="igGrad" x1="0" y1="36" x2="36" y2="0" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#F58529"/>
                        <stop offset="40%" stopColor="#DD2A7B"/>
                        <stop offset="100%" stopColor="#8134AF"/>
                      </linearGradient>
                    </defs>
                    <rect width="36" height="36" rx="8" fill="url(#igGrad)"/>
                    <rect x="10" y="10" width="16" height="16" rx="5" stroke="white" strokeWidth="1.8" fill="none"/>
                    <circle cx="18" cy="18" r="4" stroke="white" strokeWidth="1.8" fill="none"/>
                    <circle cx="23.5" cy="12.5" r="1.1" fill="white"/>
                  </svg>
                ) : smartData.adAttribution.bestSource.source === "whatsapp" ? (
                  <svg viewBox="0 0 36 36" className="w-5 h-5" fill="none">
                    <rect width="36" height="36" rx="8" fill="#25D366"/>
                    <path d="M18 9a9 9 0 00-7.8 13.5L9 27l4.7-1.2A9 9 0 1018 9zm0 16.4a7.4 7.4 0 01-3.8-1l-.27-.16-2.8.73.75-2.72-.18-.28A7.4 7.4 0 1118 25.4zm4.07-5.54c-.22-.11-1.32-.65-1.52-.72-.2-.07-.35-.11-.5.11-.15.22-.58.72-.71.87-.13.15-.26.17-.48.06-.22-.11-.93-.34-1.77-1.09-.65-.58-1.09-1.3-1.22-1.52-.13-.22-.01-.34.1-.45.1-.1.22-.26.33-.39.11-.13.15-.22.22-.37.07-.15.04-.28-.02-.39-.06-.11-.5-1.2-.68-1.64-.18-.43-.36-.37-.5-.38h-.43c-.15 0-.39.06-.59.28-.2.22-.78.76-.78 1.86s.8 2.16.91 2.31c.11.15 1.57 2.4 3.8 3.36.53.23.95.37 1.27.47.53.17 1.02.14 1.4.09.43-.06 1.32-.54 1.51-1.06.19-.52.19-.97.13-1.06-.06-.09-.2-.15-.42-.26z" fill="white"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 36 36" className="w-5 h-5" fill="none">
                    <rect width="36" height="36" rx="8" fill="#16a34a"/>
                    <path d="M18 10c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 3c1.2 0 2.32.35 3.26.95L13.95 21.26A4.96 4.96 0 0113 18c0-2.76 2.24-5 5-5zm0 10c-1.2 0-2.32-.35-3.26-.95l7.31-7.31c.6.94.95 2.06.95 3.26 0 2.76-2.24 5-5 5z" fill="white"/>
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground font-bold">أفضل منصة</p>
                {smartData.adAttribution.bestSource ? (
                  <>
                    <p className="text-[10px] sm:text-xs font-black truncate">
                      {smartData.adAttribution.bestSource.source === "facebook" ? "فيسبوك" :
                       smartData.adAttribution.bestSource.source === "tiktok" ? "تيك توك" :
                       smartData.adAttribution.bestSource.source === "instagram" ? "إنستجرام" :
                       smartData.adAttribution.bestSource.source === "whatsapp" ? "واتساب" :
                       smartData.adAttribution.bestSource.source === "organic" ? "ويبسايت" :
                       smartData.adAttribution.bestSource.source === "unknown" ? "عضوي" : "أخرى"}
                    </p>
                    {canViewFinancials && (
                      <p className="text-[8px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 font-bold truncate">
                        {new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(smartData.adAttribution.bestSource.profit)}
                      </p>
                    )}
                  </>
                ) : <p className="text-[10px] sm:text-xs text-muted-foreground">لا بيانات</p>}
              </div>
            </div>
          </Link>

          {/* نجوم / راكد */}
          <Link href="/smart">
            <div className="flex items-center gap-2 sm:gap-2.5 p-2 sm:p-3 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-colors cursor-pointer">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-500" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground font-bold">نجوم / راكد</p>
                <p className="text-[10px] sm:text-xs font-black">{smartData.stars.length} نجوم</p>
                <p className="text-[8px] sm:text-[10px] text-amber-600 dark:text-amber-400 truncate">{smartData.deadStock.length} منتج راكد</p>
              </div>
            </div>
          </Link>

          {/* المرتجعات — مخفية لو ماعندوش dashboard.returns */}
          {canSeeReturns && (
          <Link href="/smart">
            <div className={`flex items-center gap-2 sm:gap-2.5 p-2 sm:p-3 rounded-xl border bg-card hover:bg-primary/5 transition-colors cursor-pointer ${
              smartData.returnInsights.highReturnProducts.length > 0 ? "border-red-300 dark:border-red-800" : "border-border"
            }`}>
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                smartData.returnInsights.highReturnProducts.length > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"
              }`}>
                <svg viewBox="0 0 24 24" className={`w-4 h-4 ${smartData.returnInsights.highReturnProducts.length > 0 ? "text-red-500" : "text-muted-foreground"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 .49-3.86"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground font-bold">المرتجعات</p>
                <p className="text-[10px] sm:text-xs font-black">{smartData.returnInsights.totalReturnRate}% معدل</p>
                {smartData.returnInsights.highReturnProducts.length > 0 ? (
                  <p className="text-[8px] sm:text-[10px] text-red-600 dark:text-red-400 font-bold truncate">{smartData.returnInsights.highReturnProducts.length} تجاوز 50%</p>
                ) : (
                  <p className="text-[8px] sm:text-[10px] text-emerald-600 dark:text-emerald-400">تحت السيطرة</p>
                )}
              </div>
            </div>
          </Link>
          )}

          {/* سينفد قريباً */}
          <Link href="/smart">
            <div className={`flex items-center gap-2 sm:gap-2.5 p-2 sm:p-3 rounded-xl border bg-card hover:bg-primary/5 transition-colors cursor-pointer ${
              smartData.stockPredictor.some(i => (i.daysUntilStockout ?? 99) <= 3) ? "border-red-300 dark:border-red-800" : "border-border"
            }`}>
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                smartData.stockPredictor.some(i => (i.daysUntilStockout ?? 99) <= 3) ? "bg-red-100 dark:bg-red-900/30" : "bg-sky-100 dark:bg-sky-900/20"
              }`}>
                <svg viewBox="0 0 24 24" className={`w-4 h-4 ${smartData.stockPredictor.some(i => (i.daysUntilStockout ?? 99) <= 3) ? "text-red-500" : "text-sky-500"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v6M12 22v-2M4.93 4.93l4.24 4.24M16.24 16.24l1.42 1.42M2 12h2M22 12h-2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.42 1.42"/>
                  <circle cx="12" cy="12" r="4"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground font-bold">سينفد قريباً</p>
                <p className="text-[10px] sm:text-xs font-black">{smartData.stockPredictor.length} منتج</p>
                {smartData.stockPredictor.length > 0 && (
                  <p className={`text-[8px] sm:text-[10px] font-bold truncate ${smartData.stockPredictor.some(i => (i.daysUntilStockout ?? 99) <= 3) ? "text-red-600 dark:text-red-400" : "text-sky-600 dark:text-sky-400"}`}>
                    خلال 14 يوم
                  </p>
                )}
              </div>
            </div>
          </Link>

        </div>
      )}

      {/* === MAIN GRID === */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_300px] gap-3 sm:gap-4 lg:gap-5 items-start">
        <div className="min-w-0 space-y-3 sm:space-y-4 order-2 lg:order-1">
          {canViewFinancials && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* ── أفضل المنتجات ربحاً ───────────────────────────────── */}
              <Card className="border-border">
                <CardHeader className="py-2.5 sm:py-3 px-3 sm:px-4 border-b border-border">
                  <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5 sm:gap-2">
                    <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 dark:text-emerald-400" />
                    أفضل المنتجات ربحاً
                    <span className="text-[9px] sm:text-[10px] text-muted-foreground font-normal mr-auto">مرتبة بصافي الربح</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3 px-3 sm:px-4">
                  {isAnalyticsLoading ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">جاري التحميل...</div>
                  ) : analytics?.topProducts?.length ? (
                    <div className="flex flex-col gap-2">
                      {analytics.topProducts.map((p, i) => (
                        <ProductRow
                          key={p.name}
                          product={p}
                          rank={i + 1}
                          image={products?.find(pr => pr.name === p.name)?.image ?? null}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-muted-foreground text-xs">
                      <Star className="w-6 h-6 mx-auto mb-2 opacity-20" />
                      أضف بيانات التكلفة للمنتجات لتفعيل هذا القسم
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── أفضل المنتجات مبيعاً ─────────────────────────────── */}
              <Card className="border-border">
                <CardHeader className="py-2.5 sm:py-3 px-3 sm:px-4 border-b border-border">
                  <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5 sm:gap-2">
                    <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500" />
                    أكثر المنتجات مبيعاً
                    <span className="text-[9px] sm:text-[10px] text-muted-foreground font-normal mr-auto">مرتبة بعدد الطلبات</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3 px-3 sm:px-4">
                  {/* رسم بياني منحني - مبيعات المنتجات */}
                  {productPerformance?.products && productPerformance.products.length > 0 && (() => {
                    const activeProductNames = new Set(products?.map(pr => pr.name.trim().toLowerCase()) ?? []);
                    const chartData = [...productPerformance.products]
                      .filter(p => activeProductNames.has(p.name.trim().toLowerCase()))
                      .sort((a, b) => b.totalOrders - a.totalOrders)
                      .slice(0, 7)
                      .map(p => ({
                        name: p.name.length > 8 ? p.name.slice(0, 8) + "…" : p.name,
                        qty: p.totalSalesQty,
                        orders: p.totalOrders,
                      }));
                    return (
                      <div className="mb-3 rounded-xl overflow-hidden border border-border bg-card/60 p-2">
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <p className="text-[9px] text-muted-foreground font-medium">الوحدات المباعة لكل منتج</p>
                          <p className="text-[10px] font-black text-amber-500">
                            {fn(chartData.reduce((s, p) => s + p.qty, 0))} وحدة
                          </p>
                        </div>
                        <ResponsiveContainer width="100%" height={100}>
                          <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                            <defs>
                              <linearGradient id="salesGradientTop" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="name" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                            <YAxis hide domain={[0, 'auto']} />
                            <Tooltip
                              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 10, padding: "4px 8px" }}
                              formatter={(v: number, name: string) => [fn(v), name === "qty" ? "وحدة" : "طلب"]}
                              labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 9 }}
                            />
                            <Area type="monotone" dataKey="qty" stroke="#f59e0b" strokeWidth={2.5} fill="url(#salesGradientTop)" dot={{ fill: "#f59e0b", r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: "#f59e0b" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                  {/* قائمة المنتجات */}
                  {isPerfLoading ? (
                    <div className="flex flex-col gap-2">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/20 animate-pulse">
                          <div className="w-6 h-6 rounded-full bg-muted shrink-0" />
                          <div className="w-10 h-10 rounded-xl bg-muted shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3 bg-muted rounded w-3/4" />
                            <div className="h-2 bg-muted rounded w-1/2" />
                          </div>
                          <div className="w-10 h-6 bg-muted rounded shrink-0" />
                          <div className="space-y-1 text-right shrink-0">
                            <div className="h-3 bg-muted rounded w-14" />
                            <div className="h-2 bg-muted rounded w-10" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : productPerformance?.products?.length ? (
                    <div className="flex flex-col gap-2">
                      {[...productPerformance.products]
                        .filter(p => (products?.map(pr => pr.name.trim().toLowerCase()) ?? []).includes(p.name.trim().toLowerCase()))
                        .sort((a, b) => b.totalOrders - a.totalOrders)
                        .slice(0, 5)
                        .map((p, i) => (
                          <div key={p.name} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                            {/* رقم الترتيب */}
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                              i === 0 ? "bg-amber-500 text-black" : i === 1 ? "bg-zinc-400 text-black" : i === 2 ? "bg-amber-700 text-white" : "bg-muted text-muted-foreground"
                            }`}>{i + 1}</div>
                            {/* صورة المنتج */}
                            <div className="w-10 h-10 rounded-xl bg-muted border-2 border-border flex items-center justify-center shrink-0 overflow-hidden">
                              {p.image
                                ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                : <Package className="w-5 h-5 text-muted-foreground" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-[11px] sm:text-xs truncate">{p.name}</p>
                              <p className="text-[9px] text-muted-foreground">{fn(p.totalOrders)} طلب • {fn(p.totalSalesQty)} وحدة</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Sparkline ديناميكي */}
                              {(() => {
                                const raw = Array.isArray(productTrendMap[p.name]) ? productTrendMap[p.name] : [];
                                const hasPositiveTrend = raw.some(v => Number.isFinite(v) && v > 0);
                                const pts = (hasPositiveTrend
                                  ? raw
                                  : [0.15, 0.3, 0.45, 0.55, 0.65, 0.8, 1].map(r => Math.round(p.totalOrders * r)))
                                  .filter((v): v is number => Number.isFinite(v));
                                if (!pts.length) return null;
                                const max = Math.max(...pts, 1);
                                const W = 44, H = 26;
                                const coords = pts.length === 1
                                  ? [[0, H / 2], [W, H / 2]] as [number, number][]
                                  : pts.map((v, idx) => [
                                      (idx / (pts.length - 1)) * W,
                                      H - (v / max) * (H - 4) - 1,
                                    ] as [number, number]);
                                const lastCoord = coords[coords.length - 1];
                                const d = coords.map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
                                const color = "#f59e0b"; // دهبي دايماً
                                return (
                                  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
                                    <defs>
                                      <linearGradient id={`sg-${i}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
                                        <stop offset="100%" stopColor={color} stopOpacity="0"/>
                                      </linearGradient>
                                    </defs>
                                    <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#sg-${i})`} />
                                    <path d={d} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    {lastCoord && <circle cx={lastCoord[0]} cy={lastCoord[1]} r="2.5" fill={color} />}
                                  </svg>
                                );
                              })()}
                              <div className="text-right">
                                <p className="text-[11px] font-black text-amber-600 dark:text-amber-400">{fc(p.totalRevenue)}</p>
                                <p className="text-[8px] text-muted-foreground">{fn(p.totalOrders)} طلب</p>
                              </div>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  ) : (
                    <div className="py-6 text-center text-muted-foreground text-xs">
                      <Package className="w-6 h-6 mx-auto mb-2 opacity-20" />
                      لا توجد بيانات
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── منتجات ذات نسبة إرجاع مرتفعة ─────────────────────────── */}
          {canViewFinancials && analytics?.losingProducts && analytics.losingProducts.length > 0 && (
            <Card className="border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/5">
              <CardHeader className="py-2.5 sm:py-3 px-3 sm:px-4 border-b border-red-200 dark:border-red-900/30">
                <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5 sm:gap-2">
                  <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-600 dark:text-red-400" />
                  منتجات ذات نسبة إرجاع مرتفعة
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-3 px-3 sm:px-4">
                {analytics.losingProducts.map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-1.5 sm:py-2 border-b border-red-100 dark:border-red-900/20 last:border-0 text-[10px] sm:text-xs gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{p.name}</p>
                      <p className="text-muted-foreground text-[9px] sm:text-[11px]">{p.orderCount} طلب • {p.returnCount} مرتجع</p>
                    </div>
                    <div className="text-right flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <div>
                        <Badge variant="outline" className="border-red-400 text-red-600 dark:border-red-800 dark:text-red-400 text-[8px] sm:text-[10px] block mb-0.5 sm:mb-1">{p.returnRate}% مرتجع</Badge>
                        <p className="text-red-600 dark:text-red-400 font-bold text-[9px] sm:text-[10px]">{fc(p.profit)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}





          {/* شركات الشحن النشطة — مخفية لو ماعندوش dashboard.shipping_stats */}
          {canSeeShippingStats && (() => {
            const activeCompanies = shippingCompanies.filter((c: any) => c.isActive);
            return (
              <Card className="border-border overflow-hidden">
                <CardHeader className="py-2.5 sm:py-3 px-3 sm:px-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5 sm:gap-2">
                      <Truck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />شركات الشحن النشطة
                      {activeCompanies.length > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 border-primary/30 text-primary/70">{activeCompanies.length}</Badge>
                      )}
                    </CardTitle>
                    <Link href="/shipping/companies" className="text-[10px] sm:text-xs text-primary hover:underline">إدارة الكل ←</Link>
                  </div>
                </CardHeader>
                {activeCompanies.length === 0 ? (
                  <div className="p-6 sm:p-8 text-center">
                    <Truck className="w-7 h-7 sm:w-8 sm:h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                    <p className="text-muted-foreground text-xs sm:text-sm">لا توجد شركات شحن نشطة</p>
                    <Link href="/shipping/companies" className="text-primary text-[10px] sm:text-xs mt-1 inline-block">إضافة شركة ←</Link>
                  </div>
                ) : (
                  <div className="p-2.5 sm:p-3 grid grid-cols-1 gap-2.5">
                    {activeCompanies.map((company: any) => (
                      <DashShippingCompanyRow
                        key={company.id}
                        company={company}
                        allStats={allShippingStats}
                        allManifests={allShippingManifests}
                        canViewFinancials={canViewFinancials}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })()}

          {/* ── المنصات الإعلانية النشطة ── */}
          {smartData != null && (smartData.adAttribution?.breakdown?.length ?? 0) > 0 && (
            <Card className="border-border overflow-hidden">
              <CardHeader className="py-2.5 sm:py-3 px-3 sm:px-4 border-b border-border">
                {(() => {
                  const ad = smartData!.adAttribution!;
                  return (
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5 sm:gap-2">
                    <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500" />
                    المنصات الإعلانية النشطة
                    <Badge variant="outline" className="text-[9px] h-4 border-amber-400/40 text-amber-600 dark:text-amber-400">
                      {ad.breakdown.length} منصة
                    </Badge>
                  </CardTitle>
                  <Link href="/smart" className="text-[10px] sm:text-xs text-primary hover:underline">تحليل مفصل ←</Link>
                </div>
                  );
                })()}

                {/* Best source summary strip */}
                {smartData!.adAttribution?.bestSource && (() => {
                  const best = getAdMeta(smartData!.adAttribution!.bestSource!.source);
                  const BestIcon = best.icon;
                  return (
                    <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                      style={{ background: `linear-gradient(135deg, ${best.gradFrom}18, ${best.gradTo}10)`, border: `1px solid ${best.gradFrom}30` }}>
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `linear-gradient(135deg, ${best.gradFrom}, ${best.gradTo})` }}>
                        <BestIcon style={{ color: best.iconColor, fontSize: "0.75rem" }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">الأعلى أداءً:</span>
                      <span className="text-[10px] font-black">{best.label}</span>
                      <span className="text-[10px] text-muted-foreground mr-auto">
                        {new Intl.NumberFormat("ar-EG").format(smartData!.adAttribution!.bestSource!.orders)} طلب
                      </span>
                      {canViewFinancials && (
                        <span className={`text-[10px] font-black ${smartData!.adAttribution!.bestSource!.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                          {new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(smartData!.adAttribution!.bestSource!.profit)}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </CardHeader>

              <div className="p-2.5 sm:p-3 grid grid-cols-1 gap-2.5">
                {(() => {
                  const breakdown = smartData!.adAttribution!.breakdown!;
                  const maxRevenue = Math.max(...breakdown.map((s: any) => s.revenue), 1);
                  const bestSrc = smartData!.adAttribution?.bestSource?.source;
                  const totalOrders = breakdown.reduce((s: number, x: any) => s + x.orders, 0);
                  const totalShipping = fin?.shippingSpend ?? 0;
                  return breakdown.map((s: any) => {
                    const shippingShare = totalOrders > 0 ? (s.orders / totalOrders) * totalShipping : 0;
                    return (
                      <DashAdSourceCard
                        key={s.source}
                        source={s.source}
                        orders={s.orders}
                        revenue={s.revenue}
                        profit={s.profit}
                        returnRate={s.returnRate}
                        maxRevenue={maxRevenue}
                        canViewFinancials={canViewFinancials}
                        isBest={s.source === bestSrc}
                        shippingShare={shippingShare}
                      />
                    );
                  });
                })()}
              </div>

              {/* إحصائية إجمالية في الأسفل */}
              {canViewFinancials && (() => {
                const breakdown = smartData!.adAttribution!.breakdown!;
                const totalOrders  = breakdown.reduce((s: number, x: any) => s + x.orders, 0);
                const totalRevenue = breakdown.reduce((s: number, x: any) => s + x.revenue, 0);
                const totalProfit  = breakdown.reduce((s: number, x: any) => s + x.profit, 0);
                const shippingCost = fin?.shippingSpend ?? 0;
                const revenueAfterShipping = totalRevenue - shippingCost;
                return (
                  <div className="mx-2.5 sm:mx-3 mb-2.5 sm:mb-3 grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/20 p-2.5 text-center">
                    <div>
                      <p className="text-sm font-black">{new Intl.NumberFormat("ar-EG").format(totalOrders)}</p>
                      <p className="text-[9px] text-muted-foreground">إجمالي الطلبات</p>
                    </div>
                    <div>
                      <p className={`text-sm font-black ${revenueAfterShipping >= 0 ? "text-primary" : "text-red-500"}`}>
                        {new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(revenueAfterShipping)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">إيرادات بعد الشحن</p>
                    </div>
                    <div>
                      <p className={`text-sm font-black ${totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(totalProfit)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">صافي الربح الكلي</p>
                    </div>
                  </div>
                );
              })()}
            </Card>
          )}

          {/* ── تتبع أداء فريق المبيعات — مخفي لو ماعندوش dashboard.team ── */}
          {canSeeTeam && (teamPerf.length > 0 || (isAdmin && employeeProfiles.length > 0)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* تتبع أداء فريق المبيعات */}
          {teamPerf.length > 0 && (
            <Card className="border-border overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    أداء فريق المبيعات
                    <Badge variant="outline" className="text-[11px] h-5 px-2 border-emerald-400/40 text-emerald-600 dark:text-emerald-400">
                      {teamPerf.filter(m => m.userId !== 0).length} عضو
                    </Badge>
                  </CardTitle>
                  <Link href="/team-performance" className="text-xs text-primary hover:underline font-medium">تفاصيل ←</Link>
                </div>
              </CardHeader>

              {/* منحنى أداء */}
              {(() => {
                const chartData = teamPerf.slice(0, 5).map(m => ({
                  name: (m.displayName || "؟").split(" ")[0],
                  تسليم: m.deliveryRate,
                  مرتجع: m.returnRate,
                }));
                return (
                  <div className="px-3 pt-2 pb-1">
                    <ResponsiveContainer width="100%" height={80}>
                      <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: -24 }}>
                        <defs>
                          <linearGradient id="teamDelivery2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                        <Tooltip contentStyle={{ fontSize: 11, padding: "4px 8px", borderRadius: 6 }} formatter={(v: any, n: string) => [`${v}%`, n]} />
                        <Area type="monotone" dataKey="تسليم" stroke="#10b981" strokeWidth={2} fill="url(#teamDelivery2)" dot={{ r: 3, fill: "#10b981" }} />
                        <Area type="monotone" dataKey="مرتجع" stroke="#ef4444" strokeWidth={1.5} fill="none" dot={{ r: 2, fill: "#ef4444" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}

              {/* قائمة الأعضاء */}
              <div className="divide-y divide-border/60">
                {teamPerf.slice(0, 4).map((m, i) => {
                  const [bg, fg] = dbAvatarColor(m.displayName || "?");
                  const unifiedAvatar = avatarMap.get(m.userId) ?? null;
                  return (
                  <div key={m.userId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-xs font-black text-muted-foreground w-4">{i + 1}</span>
                    {unifiedAvatar ? (
                      <img src={unifiedAvatar} className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-border" alt={m.displayName} />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: bg, color: fg }}>
                        {dbInitials(m.displayName || "?")}
                      </div>
                    )}
                    <span className="text-sm font-bold truncate flex-1">{(m.displayName || "؟").split(" ")[0]}</span>
                    <span className={`text-sm font-black ${m.deliveryRate >= 70 ? "text-emerald-500" : "text-amber-500"}`}>{m.deliveryRate}%</span>
                  </div>
                  );
                })}
              </div>

              {/* footer */}
              {(() => {
                const totalOrders = teamPerf.reduce((s, m) => s + m.total, 0);
                const avgDelivery = teamPerf.length > 0 ? Math.round(teamPerf.reduce((s, m) => s + m.deliveryRate, 0) / teamPerf.length) : 0;
                return (
                  <div className="mx-3 mb-3 mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/20 p-2.5 text-center">
                    <div><p className="text-base font-black">{new Intl.NumberFormat("ar-EG").format(totalOrders)}</p><p className="text-[10px] text-muted-foreground mt-0.5">إجمالي الطلبات</p></div>
                    <div><p className={`text-base font-black ${avgDelivery >= 70 ? "text-emerald-500" : "text-amber-500"}`}>{avgDelivery}%</p><p className="text-[10px] text-muted-foreground mt-0.5">متوسط التسليم</p></div>
                  </div>
                );
              })()}
            </Card>
          )}

          {/* إدارة الفريق */}
          {isAdmin && employeeProfiles.length > 0 && (
            <Card className="border-border overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-violet-500" />
                    أداء فريق العمل
                    <Badge variant="outline" className="text-[11px] h-5 px-2 border-violet-400/40 text-violet-600 dark:text-violet-400">
                      {employeeProfiles.length} موظف
                    </Badge>
                  </CardTitle>
                  <Link href="/team" className="text-xs text-primary hover:underline font-medium">إدارة ←</Link>
                </div>
              </CardHeader>

              <div className="divide-y divide-border/60 max-h-64 overflow-y-auto">
                {employeeProfiles.map((emp: any) => {
                  const [bg, fg] = dbAvatarColor(emp.displayName || "?");
                  // نستخدم avatarMap الموحد بدل البحث في teamPerf مباشرة
                  const avatarSrc = avatarMap.get(emp.userId) ?? emp.avatar ?? null;
                  return (
                    <Link key={emp.id} href="/team">
                      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors cursor-pointer">
                        {avatarSrc ? (
                          <img src={avatarSrc} className="w-9 h-9 rounded-full object-cover border-2 border-border/50 shrink-0" alt={emp.displayName} />
                        ) : (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                            style={{ background: bg, color: fg }}>
                            {dbInitials(emp.displayName || "?")}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{emp.displayName}</p>
                          <p className="text-[11px] text-foreground/70 truncate mt-0.5 font-medium">
                            {emp.jobTitle || (emp.role === "admin" ? "مدير" : emp.role === "manager" ? "مشرف" : "موظف")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-sm font-black ${(emp as any).kpiCount > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                            {(emp as any).kpiCount ?? 0}
                          </span>
                          <span className="text-[10px] text-muted-foreground">KPI</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* footer */}
              <div className="mx-3 mb-3 mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/20 p-2.5 text-center">
                <div><p className="text-base font-black">{employeeProfiles.length}</p><p className="text-[10px] text-muted-foreground mt-0.5">الموظفين</p></div>
                <div>
                  <p className="text-base font-black text-emerald-500">
                    {employeeProfiles.reduce((s: number, e: any) => s + ((e as any).kpiCount || 0), 0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">إجمالي KPI</p>
                </div>
              </div>
            </Card>
          )}

            </div>
          )}
          {/* ── مركز التحكم — منقول بعد تأثير المرتجعات ── */}

        </div>

        {/* RIGHT SIDEBAR */}
        <div className="space-y-3 sm:space-y-4 order-1 lg:order-2 min-w-0">
          {/* إجراءات سريعة — أفقي على الموبايل */}
          <div>
            <h2 className="text-xs sm:text-sm font-bold mb-1.5 sm:mb-2">إجراءات سريعة</h2>
            <div className="flex gap-2 sm:flex-col sm:gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
              <Link href="/orders/new" className="flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground py-2 px-3 rounded-md text-xs font-bold hover:bg-primary/90 transition-colors whitespace-nowrap">
                <Plus className="w-3.5 h-3.5 shrink-0" />إضافة طلب
              </Link>
              <Link href="/inventory" className="flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-1.5 border border-border bg-card text-foreground hover:bg-muted/30 transition-colors py-2 px-3 rounded-md text-xs font-semibold whitespace-nowrap">
                <Boxes className="w-3.5 h-3.5 shrink-0" />إدارة المخزون
              </Link>
              <Link href="/import" className="flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-1.5 border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors py-2 px-3 rounded-md text-xs font-semibold whitespace-nowrap">
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />استيراد Excel
              </Link>
            </div>
          </div>

          {canViewFinancials && fin && (
            <Card className="border-border overflow-hidden">
              <CardContent className="p-3 sm:p-4 space-y-0.5 sm:space-y-1">
                <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3 flex items-center gap-1 sm:gap-1.5">
                  <Boxes className="w-2.5 h-2.5 sm:w-3 sm:h-3" />قيمة المخزون
                </p>
                <FinRow label="بسعر التكلفة" value={fc(fin.inventoryAtCost)} color="text-amber-700 dark:text-amber-400" />
                <FinRow label="بسعر البيع" value={fc(fin.inventoryAtSell)} color="text-primary" />
                <div className="mt-1 pt-1.5 sm:pt-2 border-t border-border flex justify-between items-center">
                  <span className="text-[9px] sm:text-[10px] text-muted-foreground">الربح المحتمل</span>
                  <span className={`text-[10px] sm:text-xs font-black ${fin.potentialInventoryProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {fc(fin.potentialInventoryProfit)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {canViewFinancials && fin && (
            <Card className="border-border">
              <CardContent className="p-3 sm:p-4">
                <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3 flex items-center gap-1 sm:gap-1.5">
                  <BarChart3 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />التدفق النقدي الكلي
                </p>
                <FinRow label="إجمالي المقبوض" value={fc(fin.cashIn - fin.shippingSpend)} color="text-emerald-600 dark:text-emerald-400" />
                <FinRow label="تكلفة البضاعة" value={`(${fc(fin.costOfGoods)})`} color="text-amber-700 dark:text-amber-400" />
                <FinRow label="تكلفة الشحن" value={`(${fc(fin.shippingSpend)})`} color="text-orange-600 dark:text-orange-400" />
                <FinRow label="خسائر المرتجعات" value={`(${fc(fin.returnLoss)})`} color="text-red-600 dark:text-red-400" sub={`${fin.returnCount} طلب مرتجع`} />
                <div className={`mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t-2 flex justify-between items-center ${fin.netProfit >= 0 ? "border-emerald-500 dark:border-emerald-800" : "border-red-500 dark:border-red-800"}`}>
                  <span className="text-[11px] sm:text-sm font-bold">صافي الربح</span>
                  <span className={`text-[11px] sm:text-sm font-black ${fin.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {fc(fin.netProfit)}
                  </span>
                </div>
                {fin.grossMargin > 0 && (
                  <p className="text-[8px] sm:text-[9px] text-muted-foreground text-center mt-1.5 sm:mt-2">
                    هامش إجمالي: {fin.grossMargin}% • هامش صافي: {fin.netMargin}%
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {summary && (
            <Card className="border-border">
              <CardContent className="p-3 sm:p-4 space-y-0.5 sm:space-y-1">
                <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3 flex items-center gap-1 sm:gap-1.5">
                  <ShoppingCart className="w-2.5 h-2.5 sm:w-3 sm:h-3" />ملخص الطلبات
                </p>
                {[
                  { label: "قيد الانتظار", val: summary.pendingOrders, color: "text-amber-700 dark:text-amber-400" },
                  { label: "مُسلَّم", val: summary.receivedOrders, color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "قيد الشحن", val: summary.shippingOrders ?? 0, color: "text-sky-600 dark:text-sky-400" },
                  { label: "في المخزن", val: summary.warehouseReadyOrders ?? 0, color: "text-orange-600 dark:text-orange-400" },
                  { label: "مرتجع", val: summary.returnedOrders ?? 0, color: "text-red-600 dark:text-red-400" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex justify-between text-[10px] sm:text-xs py-1 border-b border-border/30 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-bold ${color}`}>{val}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-1.5 sm:pt-2 flex justify-between text-[10px] sm:text-xs mt-1">
                  <span className="text-muted-foreground font-bold">الإجمالي</span>
                  <span className="font-bold">{summary.totalOrders}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {canViewFinancials && fin && fin.completedOrders > 0 && (
            <Card className="border-border">
              <CardContent className="p-3 sm:p-4">
                <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3 flex items-center gap-1 sm:gap-1.5">
                  <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3" />مقاييس الطلبات
                </p>
                <FinRow label="متوسط ربح الطلب" value={fc(fin.avgProfitPerOrder)} color={fin.avgProfitPerOrder >= 0 ? "text-primary" : "text-red-600 dark:text-red-400"} />
                <FinRow label="متوسط قيمة الطلب" value={fc(fin.avgOrderValue)} color="text-foreground" />
                <FinRow label="متوسط تكلفة الطلب" value={fc(fin.avgCostPerOrder)} color="text-amber-700 dark:text-amber-400" />
                <FinRow label="نسبة الإرجاع الكلية" value={`${fin.returnRate}%`} color={fin.returnRate >= 20 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"} />
              </CardContent>
            </Card>
          )}

          {allAlerts.length > 0 && (
            <Card className="border-border">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1 sm:gap-1.5">
                    <Bell className="w-2.5 h-2.5 sm:w-3 sm:h-3" />التنبيهات الذكية
                  </p>
                  <Badge variant="outline" className={`text-[8px] sm:text-[9px] ${alertsData?.counts.high ? "border-red-400 text-red-600 dark:border-red-800 dark:text-red-400" : "border-amber-400 text-amber-700 dark:border-amber-800 dark:text-amber-400"}`}>
                    {alertsData?.counts.total}
                  </Badge>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  {allAlerts.slice(0, 5).map(alert => (
                    <div key={alert.id} className="flex items-start gap-1.5 sm:gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1 sm:mt-1.5 shrink-0 ${
                        alert.severity === "high" ? "bg-red-500" : alert.severity === "medium" ? "bg-amber-500" : "bg-muted-foreground"
                      }`} />
                      <div className="min-w-0">
                        <p className="text-[9px] sm:text-[10px] font-bold text-foreground truncate">{alert.title}</p>
                        <p className="text-[8px] sm:text-[9px] text-muted-foreground truncate">{alert.detail}</p>
                      </div>
                    </div>
                  ))}
                  {allAlerts.length > 5 && (
                    <Link href="/product-performance" className="text-[9px] sm:text-[10px] text-primary hover:underline block text-center mt-1">
                      +{allAlerts.length - 5} تنبيه آخر
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {canViewFinancials && fin && fin.returnRevLost > 0 && (
            <Card className="border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/5">
              <CardContent className="p-3 sm:p-4">
                <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest text-red-500/70 dark:text-red-400/60 mb-2 sm:mb-3 flex items-center gap-1 sm:gap-1.5">
                  <RefreshCw className="w-2.5 h-2.5 sm:w-3 sm:h-3" />تأثير المرتجعات
                </p>
                <FinRow label="إيرادات فُقدت" value={fc(fin.returnRevLost)} color="text-red-600 dark:text-red-400" sub="بيع كان مخطط" />
                <FinRow label="تكلفة محملة" value={fc(fin.returnLoss)} color="text-red-600 dark:text-red-400" sub="شحن + بضاعة" />
                {fin.returnDamagedValue > 0 && (
                  <div
                    className="flex items-center justify-between py-1.5 sm:py-2 border-b border-border/50 last:border-0 gap-2 cursor-pointer group hover:bg-red-50/50 dark:hover:bg-red-900/10 rounded px-1 -mx-1 transition-colors"
                    onClick={() => setShowDamagedModal(true)}
                    title="اضغط لعرض تفاصيل التوالف"
                  >
                    <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors flex items-center gap-1">
                      <AlertOctagon className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                      قيمة التوالف
                    </span>
                    <div className="text-right min-w-0">
                      <span className="text-[10px] sm:text-xs font-bold block text-red-700 dark:text-red-300 group-hover:underline">{fc(fin.returnDamagedValue)}</span>
                      <p className="text-[8px] sm:text-[9px] text-muted-foreground group-hover:text-red-500/70 transition-colors">اضغط لعرض التفاصيل</p>
                    </div>
                  </div>
                )}
                <div className="mt-1.5 sm:mt-2 text-center">
                  <p className="text-[10px] sm:text-xs font-black text-red-600 dark:text-red-400">{fin.returnRate}% نسبة الإرجاع</p>
                  <p className="text-[8px] sm:text-[9px] text-muted-foreground">{fin.returnCount} من {fin.totalOrders} طلب</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── مركز التحكم ─────────────────────────────────────────── */}
          {(() => {
            const pendingShip   = recentOrders?.filter((o:any) => o.status === "confirmed" || o.status === "processing") ?? [];
            const unpaidOld     = (() => {
              try {
                return (summary as any)?.unpaidOld ?? 0;
              } catch { return 0; }
            })();
            const highAlertList = highAlerts ?? [];
            const lowStock      = lowStockAlerts ?? [];

            const tasks: { id:string; icon:any; color:string; bg:string; label:string; count:number; href:string; priority:"high"|"med"|"low" }[] = [
              pendingShip.length > 0 && {
                id:"ship", icon: Package, color:"text-amber-400", bg:"bg-amber-400/10",
                label:`${pendingShip.length} طلب في انتظار الشحن`, count:pendingShip.length,
                href:"/orders", priority:"high" as const,
              },
              lowStock.length > 0 && {
                id:"stock", icon: Archive, color:"text-orange-400", bg:"bg-orange-400/10",
                label:`${lowStock.length} منتج وصل للحد الأدنى`, count:lowStock.length,
                href:"/inventory", priority:"high" as const,
              },
              highAlertList.length > 0 && {
                id:"alert", icon: AlertTriangle, color:"text-red-400", bg:"bg-red-400/10",
                label:`${highAlertList.length} تنبيه يحتاج تدخل فوري`, count:highAlertList.length,
                href:"/smart", priority:"high" as const,
              },
              unpaidOld > 0 && {
                id:"unpaid", icon: Receipt, color:"text-rose-400", bg:"bg-rose-400/10",
                label:`فواتير متأخرة السداد`, count:unpaidOld,
                href:"/finance/sales", priority:"med" as const,
              },
              recentClients.length > 0 && {
                id:"newclient", icon: Users, color:"text-sky-400", bg:"bg-sky-400/10",
                label:`${recentClients.length} عميل جديد هذا الشهر`, count:recentClients.length,
                href:"/finance/clients", priority:"low" as const,
              },
            ].filter(Boolean) as any[];

            const todaySales  = (analytics as any)?.today?.totalSales  ?? 0;
            const yestSales   = (analytics as any)?.yesterday?.totalSales ?? 0;
            const salesDiff   = yestSales > 0 ? Math.round(((todaySales - yestSales) / yestSales) * 100) : null;
            const todayOrders = (summary as any)?.todayOrders ?? 0;
            const yestOrders  = (summary as any)?.yesterdayOrders ?? 0;
            const ordersDiff  = yestOrders > 0 ? Math.round(((todayOrders - yestOrders) / yestOrders) * 100) : null;

            if (tasks.length === 0 && salesDiff === null) return null;

            return (
              <Card className="border-border overflow-hidden">
                <CardHeader className="py-2.5 px-3 sm:px-4 border-b border-border">
                  <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-primary" />
                    مركز التحكم
                    {tasks.filter(t=>t.priority==="high").length > 0 && (
                      <span className="mr-auto text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">
                        {tasks.filter(t=>t.priority==="high").length} يحتاج تدخل
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {(salesDiff !== null || ordersDiff !== null) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-b border-border">
                      {[
                        { label:"المبيعات اليوم", diff:salesDiff, icon:TrendingUp },
                        { label:"الطلبات اليوم",  diff:ordersDiff, icon:ShoppingCart },
                      ].map((item,i) => (
                        <div key={i} className={`p-3 sm:p-3 ${i===0?"sm:border-l border-border":""} flex items-center gap-2 min-w-0`}>
                          <item.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground break-words">{item.label}</p>
                            {item.diff !== null ? (
                              <p className={`text-xs font-black break-words ${item.diff >= 0 ? "text-emerald-400":"text-red-400"}`}>
                                {item.diff >= 0 ? "▲":"▼"} {Math.abs(item.diff)}% عن أمس
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">لا توجد بيانات أمس</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {tasks.length > 0 && (
                    <div className="divide-y divide-border/50">
                      {tasks.map(task => (
                        <Link key={task.id} href={task.href}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/10 transition-colors group">
                          <div className={`w-7 h-7 rounded-lg ${task.bg} flex items-center justify-center shrink-0`}>
                            <task.icon className={`w-3.5 h-3.5 ${task.color}`} />
                          </div>
                          <p className="flex-1 text-xs text-foreground/80 group-hover:text-foreground transition-colors">
                            {task.label}
                          </p>
                          {task.priority === "high" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
                          )}
                          {task.priority === "med" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          )}
                          <ArrowUpRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                        </Link>
                      ))}
                    </div>
                  )}
                  {tasks.length === 0 && (
                    <div className="flex items-center gap-2 px-3 py-4 text-emerald-400">
                      <Zap className="w-4 h-4" />
                      <p className="text-xs font-semibold">كل حاجة تمام — مفيش مهام معلقة 🎉</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

        </div>
      </div>
    </div>

    {showDamagedModal && <DamagedOrdersModal onClose={() => setShowDamagedModal(false)} />}
    </>
  );
}
