import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, shipmentsApi, financeClientsApi, shippingApi, cashRegistersApi, type Shipment, type FinanceClientSearchResult, type ShippingCompany, type TopPerformersResponse, type OperationsKpisResponse, type OperationsCenterResponse, type StatusDistributionResponse, type RecentEventsResponse, type RecentShipmentsResponse, type FinancialDashboardResponse, type FinancialDashboardPeriod, type ExecutiveSummaryResponse, type OpsAlertsResponse, type PerformanceMetricsResponse, type RevenueTrendResponse, type RepsDailyResponse, type LiveMapResponse, type FinancialSummary, type ManifestsPnlSummary, type ShipmentChartsData, type AlertsResponse, type ProfitAnalytics } from "@/lib/api";
import { LiveMap } from "@/components/live-map";
import { NotificationBell } from "@/components/notification-bell";
import { ShipmentStatusDonut, WeeklyShipmentBars } from "@/components/charts-section";
import {
  Search, Bell, Sun, Moon, Clock, Download, Loader2, Building2,
  Package, PackageCheck, Truck, Undo2, Star, DollarSign,
  AlertTriangle, AlertOctagon, AlertCircle, Users, Phone, MapPin,
  Brain, Zap, TrendingUp, TrendingDown, Plus, Upload, Briefcase,
  UserPlus, FileText, LogOut, Wallet, Activity, X,
  Calendar as CalendarIcon, ChevronDown,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Line,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { exportOperationsReportPdf } from "@/lib/operations-report";

const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));

// ── نوع الفلتر الزمني الموحّد (يوم/أسبوع/شهر/سنة/فترة محددة) ───────────────────
type OcPeriodFilter =
  | { type: "today" | "week" | "month" | "year" }
  | { type: "custom"; from: string; to: string }; // from/to بصيغة YYYY-MM-DD

const timeAgo = (iso: string): string => {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `منذ ${diffH} ساعة`;
  return `منذ ${Math.round(diffH / 24)} يوم`;
};

// خريطة ثابتة لألوان حالات "آخر الشحنات" (تفادي Tailwind dynamic classes)
const RECENT_STATUS_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 border-emerald-300",
  sky:     "bg-sky-500/15 text-sky-600 border-sky-300",
  amber:   "bg-amber-500/15 text-amber-600 border-amber-300",
  red:     "bg-red-500/15 text-red-600 border-red-300",
};

// ── Mini Sparkline ───────────────────────────────────────────────────────────
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <div className="h-8" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100, h = 32;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  const gradId = `oc-spark-${color.replace("#", "")}`;
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

// ── كارت ربح الفترة (اليوم/الأسبوع/الشهر) — من بيانات المناديب + الخزينة ─────
function OcPeriodCard({
  label, data, tone, active, onClick,
}: {
  label: string;
  data: ManifestsPnlSummary;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isProfit = data.totalRevenue >= 0;
  return (
    <Card
      className={`oc-kpi-card overflow-hidden cursor-pointer transition-all duration-200 ${active ? "" : "opacity-70 hover:opacity-100"}`}
      style={{ ["--tone" as any]: tone, ...(active ? { borderColor: tone } : {}) }}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
        <div
          className="flex items-center justify-between gap-1 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setIsOpen((v) => !v); }}
        >
          <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={`text-[9px] font-bold border px-1.5 ${
              data.returnRate > 20 ? "border-red-400 text-red-600 dark:border-red-800 dark:text-red-400" : "border-border text-muted-foreground"
            }`}>{data.returnRate}%↩</Badge>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
          </div>
        </div>
        <div
          className="grid transition-all duration-300 ease-in-out"
          style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0 }}
        >
          <div className="overflow-hidden min-h-0">
            <div className="space-y-2 sm:space-y-3 pt-2 sm:pt-3">
              <div className="min-w-0">
                <p className={`text-lg sm:text-2xl font-black leading-tight truncate ${isProfit ? "" : "text-red-600 dark:text-red-400"}`} style={isProfit ? { color: active ? tone : undefined } : undefined}>
                  {fc(data.totalRevenue)}
                </p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground">صافي الإيراد</p>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-2 border-t border-border/50">
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground leading-tight">إيرادات</p>
                  <p className="text-[11px] sm:text-xs font-bold text-primary truncate">{fc(data.totalRevenue)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground leading-tight">التكلفة</p>
                  <p className="text-[11px] sm:text-xs font-bold text-amber-700 dark:text-amber-400 truncate">{fc(data.totalExpenses)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground leading-tight">الطلبات</p>
                  <p className="text-[11px] sm:text-xs font-bold">{fn(data.orders)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground leading-tight">مرتجع</p>
                  <p className="text-[11px] sm:text-xs font-bold text-red-600 dark:text-red-400">{fn(data.returnCount)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Radial KPI gauge (مع سهم/خط توصيل لصندوق النسبة فوقها) ───────────────────
function KpiGauge({ value, label, suffix, onClick }: { value: number; label: string; suffix: string; onClick?: () => void }) {
  const r = 34, c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 80 ? "#10b981" : value >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 p-3 pt-1 rounded-lg text-right ${onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
    >
      {/* خط توصيل قصير + صندوق النسبة فوق الدائرة */}
      <svg viewBox="0 0 80 26" className="w-20 h-[26px]" style={{ overflow: "visible" }}>
        <line x1="40" y1="26" x2="40" y2="8" stroke={color} strokeWidth={1.3} />
        <rect x="16" y="0" width="48" height="16" rx="4" fill={color} />
        <text x="40" y="11.5" textAnchor="middle" style={{ fontSize: 10, fontWeight: 800, fill: "#fff" }}>
          {value}%
        </text>
      </svg>
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="8" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{value}%</div>
      </div>
      <div className="text-center">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{suffix}</div>
      </div>
    </button>
  );
}

const KPI_ICON_META: Record<string, { icon: any; bg: string; color: string; spark: string; tone: string }> = {
  total:      { icon: Package,      bg: "bg-blue-500/10",    color: "text-blue-500",    spark: "#3b82f6", tone: "#3b82f6" },
  delivered:  { icon: PackageCheck, bg: "bg-emerald-500/10", color: "text-emerald-500", spark: "#10b981", tone: "#10b981" },
  inShipping: { icon: Truck,        bg: "bg-sky-500/10",     color: "text-sky-500",     spark: "#0ea5e9", tone: "#0ea5e9" },
  returned:   { icon: Undo2,        bg: "bg-amber-500/10",   color: "text-amber-500",   spark: "#f59e0b", tone: "#f59e0b" },
  delayed:    { icon: AlertTriangle, bg: "bg-violet-500/10",  color: "text-violet-500",  spark: "#8b5cf6", tone: "#8b5cf6" },
  revenue:    { icon: DollarSign,   bg: "bg-teal-500/10",    color: "text-teal-500",    spark: "#14b8a6", tone: "#14b8a6" },
};

// ── أفاتار مندوب بسيط (صورة أو أحرف اسم) ─────────────────────────────────────
const AVATAR_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#f97316"];
function repAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function repInitials(name: string): string {
  const parts = (name || "؟").trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : (name || "؟").slice(0, 2);
}
function RepAvatar({ avatar, name }: { avatar: string | null; name: string }) {
  if (avatar && avatar.startsWith("data:"))
    return <img src={avatar} className="w-7 h-7 rounded-full object-cover border border-border/50 shrink-0" />;
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
      style={{ background: repAvatarColor(name) }}>
      {repInitials(name)}
    </div>
  );
}

// ── جلب أفضل العملاء والمندوبين (بيانات حقيقية من الباك اند) — حسب الفترة المختارة ──
function useTopPerformers(filter: OcPeriodFilter) {
  const params = filter.type === "custom"
    ? { period: "custom", from: filter.from, to: filter.to }
    : { period: filter.type };
  return useQuery({
    queryKey: ["analytics-top-performers", filter],
    queryFn: () => analyticsApi.topPerformers(params),
    staleTime: 3 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: TopPerformersResponse | undefined) => prev,
  });
}

// ── جلب كروت KPI الرئيسية (بيانات حقيقية من الباك اند) — حسب الفترة المختارة ──
function useOperationsKpis(filter: OcPeriodFilter) {
  const params = filter.type === "custom"
    ? { period: "custom", from: filter.from, to: filter.to }
    : { period: filter.type };
  return useQuery({
    queryKey: ["analytics-operations-kpis", filter],
    queryFn: () => analyticsApi.operationsKpis(params),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: OperationsKpisResponse | undefined) => prev,
  });
}

// ── جلب بيانات العمود الجانبي (شحنات متأخرة/مشكلة/خارجة/مندوبين/عملاء) ───────
function useOperationsCenter() {
  return useQuery({
    queryKey: ["analytics-operations-center"],
    queryFn: analyticsApi.operationsCenter,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: OperationsCenterResponse | undefined) => prev,
  });
}

// ── جلب توزيع الشحنات حسب الحالة (بيانات حقيقية من الباك اند) ────────────────
function useStatusDistribution() {
  return useQuery({
    queryKey: ["analytics-status-distribution"],
    queryFn: analyticsApi.statusDistribution,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 3 * 60_000,
    placeholderData: (prev: StatusDistributionResponse | undefined) => prev,
  });
}

// ── جلب أحدث التنبيهات (بيانات حقيقية من الباك اند) ───────────────────────────
function useRecentEvents() {
  return useQuery({
    queryKey: ["analytics-recent-events"],
    queryFn: analyticsApi.recentEvents,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: RecentEventsResponse | undefined) => prev,
  });
}

// ── جلب آخر الشحنات (بيانات حقيقية من الباك اند) ──────────────────────────────
function useRecentShipments() {
  return useQuery({
    queryKey: ["analytics-recent-shipments"],
    queryFn: analyticsApi.recentShipments,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
    placeholderData: (prev: RecentShipmentsResponse | undefined) => prev,
  });
}

// ── جلب ملخص الأرباح (بيانات حقيقية من الباك اند) ─────────────────────────────
function useFinancialDashboard() {
  return useQuery({
    queryKey: ["analytics-financial-dashboard"],
    queryFn: analyticsApi.financialDashboard,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: FinancialDashboardResponse | undefined) => prev,
  });
}

// ── جلب تنبيهات الذكاء الاصطناعي/العمليات (بيانات حقيقية من الباك اند) ────────
function useOpsAlerts() {
  return useQuery({
    queryKey: ["analytics-ops-alerts"],
    queryFn: analyticsApi.opsAlerts,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: OpsAlertsResponse | undefined) => prev,
  });
}

// ── جلب شاشة المدير التنفيذي (بيانات حقيقية من الباك اند) ─────────────────────
function useExecutiveSummary() {
  return useQuery({
    queryKey: ["analytics-executive-summary"],
    queryFn: analyticsApi.executiveSummary,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: ExecutiveSummaryResponse | undefined) => prev,
  });
}

// ── جلب مؤشرات الأداء الدائرية (بيانات حقيقية من الباك اند) — حسب الفترة المختارة ──
function usePerformanceMetrics(filter: OcPeriodFilter) {
  const params = filter.type === "custom"
    ? { period: "custom", from: filter.from, to: filter.to }
    : { period: filter.type };
  return useQuery({
    queryKey: ["analytics-performance-metrics", filter],
    queryFn: () => analyticsApi.performanceMetrics(params),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: PerformanceMetricsResponse | undefined) => prev,
  });
}

// ── جلب اتجاه الإيرادات والأرباح اليومي (بيانات حقيقية من الباك اند) ──────────
function useRevenueTrend() {
  return useQuery({
    queryKey: ["analytics-revenue-trend"],
    queryFn: analyticsApi.revenueTrend,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: RevenueTrendResponse | undefined) => prev,
  });
}

// ── جلب جدول المندوبين اليومي — فلتر فترة مستقل (اليوم/الأسبوع/فترة محددة) ───
function useRepsDaily(filter: OcPeriodFilter) {
  const params = filter.type === "custom"
    ? { period: "custom" as const, from: filter.from, to: filter.to }
    : { period: filter.type };
  return useQuery({
    queryKey: ["analytics-reps-daily", filter],
    queryFn: () => analyticsApi.repsDaily(params as any),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: RepsDailyResponse | undefined) => prev,
  });
}

// ── جلب بيانات الخريطة المباشرة (تجميع حسب المحافظة + مندوبين) ───────────────
function useLiveMap() {
  return useQuery({
    queryKey: ["analytics-live-map"],
    queryFn: analyticsApi.liveMap,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000, // تحديث كل دقيقتين لأنها "مباشرة"
    placeholderData: (prev: LiveMapResponse | undefined) => prev,
  });
}

// ── جلب إجمالي أرصدة الخزن (بيانات حقيقية من الباك اند) ───────────────────────
function useCashRegisters() {
  return useQuery({
    queryKey: ["cash-registers-list-oc"],
    queryFn: cashRegistersApi.list,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: { registers: any[]; totalBalance: number } | undefined) => prev,
  });
}

// ── جلب الملخص المالي حسب الفترة (بيانات حقيقية من الباك اند) ─────────────────
function useFinancialSummary(filter: OcPeriodFilter) {
  const params = filter.type === "custom"
    ? { period: "custom", from: filter.from, to: filter.to }
    : { period: filter.type };
  return useQuery({
    queryKey: ["analytics-financial-summary-oc", filter],
    queryFn: () => analyticsApi.financialSummary(params),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: FinancialSummary | undefined) => prev,
  });
}

const OC_PERIOD_TABS: { key: "today" | "week" | "month" | "year"; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "week",  label: "أسبوع" },
  { key: "month", label: "شهر" },
  { key: "year",  label: "سنة" },
];

const ocFmtDate = (d: Date) =>
  d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });

// ── فلتر الفترة الزمني الموحّد: تبويبات + زر "فترة محددة" بتقويم منبثق ─────────
function OcPeriodFilterBar({
  value, onChange,
}: {
  value: OcPeriodFilter;
  onChange: (v: OcPeriodFilter) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<{ from?: Date; to?: Date }>(() =>
    value.type === "custom"
      ? { from: new Date(value.from), to: new Date(value.to) }
      : {}
  );
  const [navMonth, setNavMonth] = useState<Date>(() =>
    value.type === "custom" ? new Date(value.from) : new Date()
  );

  const OC_MONTH_NAMES = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const navYear = navMonth.getFullYear();
  const navMonthIdx = navMonth.getMonth();
  const ocYearOptions = Array.from({ length: (new Date().getFullYear() + 1) - 2020 + 1 }, (_, i) => 2020 + i);

  const isCustom = value.type === "custom";
  const customLabel = isCustom
    ? `${ocFmtDate(new Date(value.from))} - ${ocFmtDate(new Date(value.to))}`
    : "فترة محددة";

  const applyCustomRange = () => {
    if (!draftRange.from || !draftRange.to) return;
    const toYmd = (d: Date) => d.toISOString().slice(0, 10);
    onChange({ type: "custom", from: toYmd(draftRange.from), to: toYmd(draftRange.to) });
    setPopoverOpen(false);
  };

  return (
    <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 flex-wrap">
      {OC_PERIOD_TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange({ type: t.key })}
          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
            value.type === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
          }`}
        >
          {t.label}
        </button>
      ))}
      <Dialog open={popoverOpen} onOpenChange={setPopoverOpen}>
        <DialogTrigger asChild>
          <button
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
              isCustom ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            <CalendarIcon className="w-3 h-3" />
            {customLabel}
            <ChevronDown className="w-3 h-3" />
          </button>
        </DialogTrigger>
        <DialogContent className="w-auto max-w-fit p-4">
          <div className="flex flex-col items-center gap-3" dir="rtl">
            <div className="flex items-center gap-2 w-full justify-center">
              <Select
                value={String(navMonthIdx)}
                onValueChange={(v) => setNavMonth(new Date(navYear, Number(v), 1))}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OC_MONTH_NAMES.map((name, idx) => (
                    <SelectItem key={idx} value={String(idx)} className="text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(navYear)}
                onValueChange={(v) => setNavMonth(new Date(Number(v), navMonthIdx, 1))}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ocYearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={(r: any) => setDraftRange(r ?? {})}
              month={navMonth}
              onMonthChange={setNavMonth}
              numberOfMonths={2}
              dir="rtl"
              className="scale-110 origin-top"
            />
            <div className="flex items-center justify-between gap-3 w-full pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {draftRange.from && draftRange.to
                  ? `${ocFmtDate(draftRange.from)} → ${ocFmtDate(draftRange.to)}`
                  : "اختر تاريخ البداية والنهاية"}
              </span>
              <Button size="sm" disabled={!draftRange.from || !draftRange.to} onClick={applyCustomRange}>
                تطبيق
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── فلتر فترة مصغّر ومستقل خاص بجدول "أفضل المندوبين" (اليوم/أسبوع + فترة محددة) ──
function RepPeriodFilterBar({
  value, onChange,
}: {
  value: OcPeriodFilter;
  onChange: (v: OcPeriodFilter) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<{ from?: Date; to?: Date }>(() =>
    value.type === "custom"
      ? { from: new Date(value.from), to: new Date(value.to) }
      : {}
  );
  const [navMonth, setNavMonth] = useState<Date>(() =>
    value.type === "custom" ? new Date(value.from) : new Date()
  );

  const REP_MONTH_NAMES = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const navYear = navMonth.getFullYear();
  const navMonthIdx = navMonth.getMonth();
  const repYearOptions = Array.from({ length: (new Date().getFullYear() + 1) - 2020 + 1 }, (_, i) => 2020 + i);

  const isCustom = value.type === "custom";
  const customLabel = isCustom
    ? `${ocFmtDate(new Date(value.from))} - ${ocFmtDate(new Date(value.to))}`
    : "فترة محددة";

  const applyCustomRange = () => {
    if (!draftRange.from || !draftRange.to) return;
    const toYmd = (d: Date) => d.toISOString().slice(0, 10);
    onChange({ type: "custom", from: toYmd(draftRange.from), to: toYmd(draftRange.to) });
    setPopoverOpen(false);
  };

  return (
    <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 flex-wrap">
      {[{ key: "today" as const, label: "يومي" }, { key: "week" as const, label: "أسبوعي" }].map((t) => (
        <button
          key={t.key}
          onClick={() => onChange({ type: t.key })}
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
            value.type === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
          }`}
        >
          {t.label}
        </button>
      ))}
      <Dialog open={popoverOpen} onOpenChange={setPopoverOpen}>
        <DialogTrigger asChild>
          <button
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
              isCustom ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            <CalendarIcon className="w-2.5 h-2.5" />
            {customLabel}
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="w-auto max-w-fit p-4">
          <div className="flex flex-col items-center gap-3" dir="rtl">
            <div className="flex items-center gap-2 w-full justify-center">
              <Select
                value={String(navMonthIdx)}
                onValueChange={(v) => setNavMonth(new Date(navYear, Number(v), 1))}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REP_MONTH_NAMES.map((name, idx) => (
                    <SelectItem key={idx} value={String(idx)} className="text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(navYear)}
                onValueChange={(v) => setNavMonth(new Date(Number(v), navMonthIdx, 1))}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {repYearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={(r: any) => setDraftRange(r ?? {})}
              month={navMonth}
              onMonthChange={setNavMonth}
              numberOfMonths={2}
              dir="rtl"
              className="scale-110 origin-top"
            />
            <div className="flex items-center justify-between gap-3 w-full pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {draftRange.from && draftRange.to
                  ? `${ocFmtDate(draftRange.from)} → ${ocFmtDate(draftRange.to)}`
                  : "اختر تاريخ البداية والنهاية"}
              </span>
              <Button size="sm" disabled={!draftRange.from || !draftRange.to} onClick={applyCustomRange}>
                تطبيق
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── جلب ملخص أرباح المناديب + مصروفات الخزنة حسب الفترة ───────────────────────
function useManifestsPnlSummary(filter: OcPeriodFilter) {
  const params = filter.type === "custom"
    ? { period: "custom", from: filter.from, to: filter.to }
    : { period: filter.type };
  return useQuery({
    queryKey: ["analytics-manifests-pnl-summary-oc", filter],
    queryFn: () => analyticsApi.manifestsPnlSummary(params),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: ManifestsPnlSummary | undefined) => prev,
  });
}

// ── جلب بيانات الشحنات الأسبوعية (بيانات حقيقية من الباك اند) ─────────────────
function useShipmentCharts() {
  return useQuery({
    queryKey: ["analytics-shipment-charts-oc"],
    queryFn: analyticsApi.shipmentCharts,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    placeholderData: (prev: ShipmentChartsData | undefined) => prev,
  });
}

// ── جلب ملخص الربح لكل الفترات (اليوم/الأسبوع/الشهر) — من بيانات المناديب + الخزينة ────
function usePeriodProfit(ocPeriodFilter: OcPeriodFilter) {
  const isCustom = ocPeriodFilter.type === "custom";
  const results = useQuery({
    queryKey: [
      "analytics-manifests-pnl-summary-periods-oc",
      isCustom ? ocPeriodFilter.from : null,
      isCustom ? ocPeriodFilter.to : null,
    ],
    queryFn: async () => {
      const [today, week, month, custom] = await Promise.all([
        analyticsApi.manifestsPnlSummary({ period: "today" }),
        analyticsApi.manifestsPnlSummary({ period: "week" }),
        analyticsApi.manifestsPnlSummary({ period: "month" }),
        isCustom
          ? analyticsApi.manifestsPnlSummary({ period: "custom", from: ocPeriodFilter.from, to: ocPeriodFilter.to })
          : Promise.resolve(null as ManifestsPnlSummary | null),
      ]);
      return { today, week, month, custom };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: { today: ManifestsPnlSummary; week: ManifestsPnlSummary; month: ManifestsPnlSummary; custom: ManifestsPnlSummary | null } | undefined) => prev,
  });
  return results;
}

// ── جلب التنبيهات الذكية (مخزون منخفض / مرتجعات عالية) — منقول من لوحة التحكم ─
function useSmartAlerts() {
  return useQuery({
    queryKey: ["analytics-alerts-oc"],
    queryFn: analyticsApi.alerts,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev: AlertsResponse | undefined) => prev,
  });
}

// ── دونات مصغّرة بخطوط توصيل خارجية (leader lines) — لكارد ملخص الأرباح ──────
function MiniLeaderLineDonut({
  data,
  centerLabel,
  centerValue,
  onSegmentClick,
}: {
  data: { key: string; label: string; color: string; value: number }[];
  centerLabel: string;
  centerValue: string;
  onSegmentClick?: (key: string, label: string, color: string) => void;
}) {
  const size = 190;
  const padX = 46;
  const vbWidth = size + padX * 2;
  const cx = vbWidth / 2;
  const cy = size / 2;
  const rOuter = 50;
  const rInner = 32;
  const gapDeg = 2.5;

  const sum = data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1;

  let cursor = 0;
  const segments = data.map((d) => {
    const val = Math.max(d.value, 0);
    const sweep = (val / sum) * 360;
    const startDeg = cursor + gapDeg / 2;
    const endDeg = cursor + sweep - gapDeg / 2;
    cursor += sweep;
    const midDeg = (startDeg + endDeg) / 2;
    return { ...d, value: val, startDeg, endDeg: Math.max(endDeg, startDeg), midDeg, pct: Math.round((val / sum) * 100) };
  });

  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const point = (r: number, deg: number) => ({ x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) });

  const arcPath = (startDeg: number, endDeg: number) => {
    const large = endDeg - startDeg > 180 ? 1 : 0;
    const p1 = point(rOuter, startDeg);
    const p2 = point(rOuter, endDeg);
    const p3 = point(rInner, endDeg);
    const p4 = point(rInner, startDeg);
    return [
      `M ${p1.x} ${p1.y}`,
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y}`,
      "Z",
    ].join(" ");
  };

  const labelWidth = 46;
  const leftLabels = segments.filter((s) => Math.cos(toRad(s.midDeg)) < 0).sort((a, b) => point(0, a.midDeg).y - point(0, b.midDeg).y);
  const rightLabels = segments.filter((s) => Math.cos(toRad(s.midDeg)) >= 0).sort((a, b) => point(0, a.midDeg).y - point(0, b.midDeg).y);

  const spaceOut = (list: typeof segments, side: "left" | "right") => {
    const minGap = 22;
    const anchors = list.map((s) => point(rOuter + 4, s.midDeg).y);
    for (let i = 1; i < anchors.length; i++) {
      if (anchors[i] - anchors[i - 1] < minGap) anchors[i] = anchors[i - 1] + minGap;
    }
    return list.map((s, i) => ({ ...s, labelY: anchors[i], side }));
  };

  const placed = [...spaceOut(leftLabels, "left"), ...spaceOut(rightLabels, "right")];

  return (
    <div className="w-full flex items-center justify-center py-1">
      <svg viewBox={`0 0 ${vbWidth} ${size}`} width="100%" height={size} style={{ maxWidth: "100%" }} preserveAspectRatio="xMidYMid meet">
        {segments.map((s) => (
          <path
            key={s.key}
            d={arcPath(s.startDeg, s.endDeg)}
            fill={s.color}
            className={onSegmentClick ? "cursor-pointer transition-opacity hover:opacity-80" : undefined}
            onClick={() => onSegmentClick?.(s.key, s.label, s.color)}
          />
        ))}

        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground" style={{ fontSize: 14, fontWeight: 900 }}>
          {centerValue}
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>
          {centerLabel}
        </text>

        {placed.map((s) => {
          const edge = point(rOuter, s.midDeg);
          const bendX = cx + (size / 2 - 2) * Math.sign(edge.x - cx || 1) * 0.66;
          const boxX = s.side === "left" ? bendX - labelWidth : bendX;
          return (
            <g
              key={`label-${s.key}`}
              className={onSegmentClick ? "cursor-pointer" : undefined}
              onClick={() => onSegmentClick?.(s.key, s.label, s.color)}
            >
              <polyline
                points={`${edge.x},${edge.y} ${bendX},${s.labelY} ${s.side === "left" ? boxX + labelWidth : boxX},${s.labelY}`}
                fill="none"
                stroke={s.color}
                strokeWidth={1.3}
              />
              <rect x={boxX} y={s.labelY - 9} width={labelWidth} height={18} rx={4} fill={s.color} />
              <text
                x={boxX + labelWidth / 2}
                y={s.labelY + 4}
                textAnchor="middle"
                style={{ fontSize: 9, fontWeight: 800, fill: "#fff" }}
              >
                {s.pct}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── قائمة منسدلة لتفاصيل بند مالي معيّن (تُفتح أسفل دونة ملخص الأرباح) ───────
function FinancialBreakdownDropdown({
  itemKey, label, color, financialData, onClose,
}: {
  itemKey: string;
  label: string;
  color: string;
  financialData: FinancialDashboardResponse | undefined;
  onClose: () => void;
}) {
  const FIELD_MAP: Record<string, keyof FinancialDashboardPeriod> = {
    revenue: "revenue",
    cost: "cost",
    shippingSpend: "shippingSpend",
    otherExpenses: "otherExpenses",
  };
  const field = FIELD_MAP[itemKey] ?? "revenue";
  const today = financialData?.today;
  const month = financialData?.month;

  return (
    <div className="relative mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
        <div
          className="absolute -top-1.5 right-1/2 translate-x-1/2 w-3 h-3 rotate-45 border-t border-r bg-card"
          style={{ borderColor: "inherit" }}
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b" style={{ background: `${color}14` }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-sm font-bold truncate">{label}</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">اليوم</span>
            <span className="font-bold">{fc(today ? Number(today[field] ?? 0) : 0)}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">الشهر الحالي</span>
            <span className="font-bold">{fc(month ? Number(month[field] ?? 0) : 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">عدد الطلبات (الشهر)</span>
            <span className="font-bold">{fn(month?.orders ?? 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── قائمة منسدلة لتفاصيل مؤشر أداء معيّن (تُفتح أسفل شبكة المؤشرات الدائرية) ──
function PerformanceMetricDropdown({
  label, value, unit, max, onClose,
}: {
  label: string;
  value: number;
  unit: string;
  max: number | null;
  onClose: () => void;
}) {
  const pct = max != null ? value : Math.min(100, Math.round((value / 48) * 100));
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const rating = pct >= 80 ? "ممتاز" : pct >= 50 ? "متوسط" : "يحتاج تحسين";

  return (
    <div className="relative mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
        <div
          className="absolute -top-1.5 right-1/2 translate-x-1/2 w-3 h-3 rotate-45 border-t border-r bg-card"
          style={{ borderColor: "inherit" }}
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b" style={{ background: `${color}14` }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-sm font-bold truncate">{label}</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">القيمة الحالية</span>
            <span className="font-bold">{unit === "%" ? `${value}%` : `${value} ${unit}`}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">التقييم</span>
            <Badge className="text-[10px]" style={{ background: `${color}22`, color, borderColor: `${color}55` }}>{rating}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">النسبة الدائرية</span>
            <span className="font-bold">{pct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── قائمة منسدلة لتفاصيل الشحنات حسب الحالة (تُفتح أسفل الدونة مباشرة) ───────
function StatusShipmentsDropdown({
  status, label, color, onClose,
}: {
  status?: string;
  label: string;
  color: string;
  onClose: () => void;
}) {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["status-shipments-dropdown", status ?? "all"],
    queryFn: () => shipmentsApi.list({ status, limit: 100 }),
    staleTime: 30_000,
  });

  const shipments = data?.data ?? [];

  return (
    <div className="relative mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
        {/* سهم صغير يوصل القائمة بصريًا بالدونة فوقها */}
        <div
          className="absolute -top-1.5 right-1/2 translate-x-1/2 w-3 h-3 rotate-45 border-t border-r bg-card"
          style={{ borderColor: "inherit" }}
        />
        {/* هيدر القائمة */}
        <div
          className="flex items-center justify-between gap-2 px-3 py-2.5 border-b"
          style={{ background: `${color}14` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-sm font-bold truncate">{label}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {isFetching ? "..." : `${fn(data?.total ?? shipments.length)} شحنة`}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* محتوى القائمة */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : shipments.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8">لا توجد شحنات بهذه الحالة حالياً</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-muted-foreground border-b">
                  <th className="text-right font-medium py-2 px-3">رقم الشحنة</th>
                  <th className="text-right font-medium py-2 px-3">المستلم</th>
                  <th className="text-right font-medium py-2 px-3">الوجهة</th>
                  <th className="text-right font-medium py-2 px-3">القيمة</th>
                  <th className="text-right font-medium py-2 px-3">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="py-2 px-3 font-semibold whitespace-nowrap">{s.shipmentNumber ?? `#${s.id}`}</td>
                    <td className="py-2 px-3 truncate max-w-[110px]">{s.receiverName}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{s.zoneGovernorate ?? s.receiverCity ?? "—"}</td>
                    <td className="py-2 px-3 font-semibold whitespace-nowrap">{fc(Number(s.totalAmount ?? 0))}</td>
                    <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                      {new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(new Date(s.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* فوتر: رابط لعرض الكل في صفحة الشحنات */}
        {shipments.length > 0 && (
          <div className="border-t px-3 py-2 bg-muted/20">
            <a
              href={status ? `/shipments?status=${encodeURIComponent(status)}` : "/shipments"}
              className="text-[11px] font-semibold text-primary hover:underline flex items-center justify-center gap-1"
            >
              عرض كل الشحنات في صفحة الشحنات ←
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── قائمة منسدلة لتفاصيل الإيرادات (تُفتح أسفل كارد "إجمالي الإيرادات") ──────
function RevenueBreakdownDropdown({
  color, financialData, onClose,
}: {
  color: string;
  financialData: FinancialDashboardResponse | undefined;
  onClose: () => void;
}) {
  const today = financialData?.today;
  const month = financialData?.month;

  return (
    <div className="relative mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
        <div
          className="absolute -top-1.5 right-1/2 translate-x-1/2 w-3 h-3 rotate-45 border-t border-r bg-card"
          style={{ borderColor: "inherit" }}
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b" style={{ background: `${color}14` }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-sm font-bold truncate">تفاصيل الإيرادات</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">إيرادات اليوم</span>
            <span className="font-bold">{fc(today?.revenue ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">إيرادات الشهر</span>
            <span className="font-bold">{fc(month?.revenue ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">مصاريف الشحن (الشهر)</span>
            <span className="font-bold">{fc(month?.shippingSpend ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">مصاريف أخرى (الشهر)</span>
            <span className="font-bold">{fc(month?.otherExpenses ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">صافي الربح (الشهر)</span>
            <span className="font-bold text-emerald-500">{fc(month?.netProfit ?? 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── بحث سريع شامل (شحنات + عملاء + شركات شحن) ────────────────────────────────
type QuickSearchResult =
  | { kind: "shipment"; item: Shipment }
  | { kind: "client"; item: FinanceClientSearchResult }
  | { kind: "company"; item: ShippingCompany };

function GlobalQuickSearch() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const { data: shipmentsRes, isFetching: shipmentsLoading } = useQuery({
    queryKey: ["quick-search-shipments", debouncedQuery],
    queryFn: () => shipmentsApi.list({ search: debouncedQuery, limit: 5 }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const { data: clientsRes, isFetching: clientsLoading } = useQuery({
    queryKey: ["quick-search-clients", debouncedQuery],
    queryFn: () => financeClientsApi.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const { data: companiesRes, isFetching: companiesLoading } = useQuery({
    queryKey: ["quick-search-companies"],
    queryFn: () => shippingApi.list(),
    staleTime: 5 * 60_000,
  });

  const isLoading = shipmentsLoading || clientsLoading || companiesLoading;

  const results: QuickSearchResult[] = useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const out: QuickSearchResult[] = [];
    for (const s of shipmentsRes?.data ?? []) out.push({ kind: "shipment", item: s });
    for (const c of clientsRes ?? []) out.push({ kind: "client", item: c });
    const qLower = debouncedQuery.toLowerCase();
    for (const co of companiesRes ?? []) {
      if (co.name.toLowerCase().includes(qLower) || (co.phone ?? "").includes(debouncedQuery)) {
        out.push({ kind: "company", item: co });
      }
    }
    return out.slice(0, 15);
  }, [shipmentsRes, clientsRes, companiesRes, debouncedQuery]);

  const goTo = (r: QuickSearchResult) => {
    setIsOpen(false);
    setQuery("");
    if (r.kind === "shipment") navigate(`/shipments/${r.item.id}`);
    else if (r.kind === "client") navigate(`/finance/clients/${r.item.id}`);
    else navigate(`/shipping`);
  };

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (results.length > 0) goTo(results[0]);
        }}
      >
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="بحث سريع: شحنة، عميل، شركة شحن..."
          className="pr-9 w-64"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        />
        {isLoading && debouncedQuery.length >= 2 && (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
        )}
      </form>

      {isOpen && debouncedQuery.length >= 2 && (
        <div className="absolute top-full mt-1.5 w-80 max-h-96 overflow-y-auto rounded-lg border bg-popover shadow-lg z-50 text-right">
          {isLoading && results.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">جارٍ البحث...</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">لا توجد نتائج لـ "{debouncedQuery}"</div>
          ) : (
            <div className="py-1">
              {results.map((r, i) => (
                <button
                  key={`${r.kind}-${r.item.id}-${i}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goTo(r)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted transition-colors text-right"
                >
                  {r.kind === "shipment" && <Package className="w-4 h-4 text-sky-500 shrink-0" />}
                  {r.kind === "client" && <Users className="w-4 h-4 text-emerald-500 shrink-0" />}
                  {r.kind === "company" && <Building2 className="w-4 h-4 text-amber-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    {r.kind === "shipment" && (
                      <>
                        <div className="font-semibold truncate">{r.item.shipmentNumber ?? `#${r.item.id}`}</div>
                        <div className="text-muted-foreground truncate">{r.item.receiverName} — {r.item.receiverCity ?? "—"}</div>
                      </>
                    )}
                    {r.kind === "client" && (
                      <>
                        <div className="font-semibold truncate">{r.item.name}</div>
                        <div className="text-muted-foreground truncate">{r.item.phone ?? "—"} {r.item.city ? `— ${r.item.city}` : ""}</div>
                      </>
                    )}
                    {r.kind === "company" && (
                      <>
                        <div className="font-semibold truncate">{r.item.name}</div>
                        <div className="text-muted-foreground truncate">{r.item.phone ?? "شركة شحن"}</div>
                      </>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {r.kind === "shipment" ? "شحنة" : r.kind === "client" ? "عميل" : "شركة"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ساعة مباشرة بتوقيت القاهرة (hook) ────────────────────────────────────────
function useLiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).formatToParts(now);
    const get = (type: string) => formatted.find((p) => p.type === type)?.value ?? "";
    return {
      h: get("hour"),
      m: get("minute"),
      s: get("second"),
      period: get("dayPeriod").toUpperCase(),
    };
  }, [now]);
}
// ══════════════════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ══════════════════════════════════════════════════════════════════════════
export default function OperationsCenterPage() {
  const { user, logout, can } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const timeParts = useLiveClock();
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [financialModal, setFinancialModal] = useState<{ key: string; label: string; color: string } | null>(null);
  const [perfMetricModal, setPerfMetricModal] = useState<{ key: string; label: string; value: number; unit: string; max: number | null } | null>(null);
  const [overviewCardModal, setOverviewCardModal] = useState<string | null>(null);
  const [ocPeriodFilter, setOcPeriodFilter] = useState<OcPeriodFilter>({ type: "today" });
  const [repsPeriodFilter, setRepsPeriodFilter] = useState<OcPeriodFilter>({ type: "week" });
  const { data: repsPerformers, isLoading: repsPerformersLoading } = useTopPerformers(repsPeriodFilter);
  const [isTreasuryOpen, setIsTreasuryOpen] = useState(false);
  const { data: cashRegisters, isLoading: cashRegistersLoading } = useCashRegisters();
  const totalCash = cashRegisters?.totalBalance ?? 0;
  const { data: cashPeriodSummary, isLoading: cashPeriodLoading } = useFinancialSummary(ocPeriodFilter);
  const { data: manifestsPnlSummary, isLoading: manifestsPnlLoading } = useManifestsPnlSummary(ocPeriodFilter);
  const { data: periodProfitData, isLoading: periodProfitLoading } = usePeriodProfit(ocPeriodFilter);
  const { data: shipmentChartsOc, isLoading: shipmentChartsOcLoading } = useShipmentCharts();
  const { data: smartAlertsData } = useSmartAlerts();
  const smartHighAlerts = smartAlertsData?.alerts.filter((a) => a.severity === "high" && a.type !== "HIGH_RETURN") ?? [];
  const smartAllAlerts = smartAlertsData?.alerts ?? [];
  const { data: topPerformers, isLoading: topPerformersLoading } = useTopPerformers(ocPeriodFilter);
  const topClients = topPerformers?.topClients ?? [];
  const topReps = repsPerformers?.topReps ?? [];
  const { data: opsKpis, isLoading: opsKpisLoading } = useOperationsKpis(ocPeriodFilter);
  const overviewCards = opsKpis?.cards ?? [];
  const { data: opsCenter, isLoading: opsCenterLoading } = useOperationsCenter();
  const delayedShipments = opsCenter?.delayedShipments ?? [];
  const problemShipments = opsCenter?.problemShipments ?? [];
  const outTodayShipments = opsCenter?.outToday ?? [];
  const representatives = opsCenter?.representatives ?? [];
  const clientsNeedingFollowup = opsCenter?.clientsNeedingFollowup ?? [];
  const { data: statusDist, isLoading: statusDistLoading } = useStatusDistribution();
  const statusDistribution = statusDist?.distribution ?? [];
  const statusDistTotal = statusDist?.total ?? 0;
  const statusDonutData = useMemo(
    () => statusDistribution.map((d) => ({
      status: d.status,
      count: d.value,
      pct: statusDistTotal > 0 ? Math.round((d.value / statusDistTotal) * 100) : 0,
    })),
    [statusDistribution, statusDistTotal],
  );
  const { data: recentEventsData, isLoading: recentEventsLoading } = useRecentEvents();
  const recentEvents = recentEventsData?.events ?? [];
  const { data: recentShipmentsData, isLoading: recentShipmentsLoading } = useRecentShipments();
  const recentShipments = recentShipmentsData?.shipments ?? [];
  const { data: financialData, isLoading: financialLoading } = useFinancialDashboard();
  const { data: opsAlertsData, isLoading: opsAlertsLoading } = useOpsAlerts();
  const aiInsights = opsAlertsData?.alerts ?? [];
  const { data: executiveSummary, isLoading: executiveSummaryLoading } = useExecutiveSummary();
  const { data: perfMetricsData, isLoading: perfMetricsLoading } = usePerformanceMetrics(ocPeriodFilter);
  const performanceMetrics = perfMetricsData?.metrics ?? [];
  const { data: revenueTrendData, isLoading: revenueTrendLoading } = useRevenueTrend();
  const revenueTrend = revenueTrendData?.days ?? [];
  const { data: liveMapData, isLoading: liveMapLoading } = useLiveMap();
  const liveMapCities = liveMapData?.cities ?? [];
  const [repsDailyFilter, setRepsDailyFilter] = useState<OcPeriodFilter>({ type: "today" });
  const { data: repsDailyData, isLoading: repsDailyLoading } = useRepsDaily(repsDailyFilter);
  const repsDailyRows = repsDailyData?.representatives ?? [];
  const today = new Intl.DateTimeFormat("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());

  const handleExportReport = async () => {
    if (isExportingReport) return;
    setIsExportingReport(true);
    try {
      await exportOperationsReportPdf({
        companyName: "STARK Logistics",
        generatedAt: new Date(),
        overviewCards: overviewCards.map((c) => ({ key: c.key, label: c.label, value: c.value, change: c.change })),
        executiveSummary: executiveSummary ?? null,
        financial: financialData
          ? {
              today: { netProfit: financialData.today.netProfit },
              month: { netProfit: financialData.month.netProfit, operatingCost: financialData.month.operatingCost },
            }
          : null,
        statusDistribution,
        topClients: topClients.map((c) => ({
          name: c.name, phone: c.phone, shipmentsCount: c.shipmentsCount, revenue: c.revenue, successRate: c.successRate,
        })),
        topReps: topReps.map((r) => ({
          name: r.name, assigned: r.assigned, successRate: r.successRate, avgRating: r.avgRating, ratingsCount: r.ratingsCount,
        })),
        representatives: representatives.map((r) => ({
          displayName: r.displayName, totalShipments: r.totalShipments, deliveredShipments: r.deliveredShipments, successRate: r.successRate,
        })),
        delayedShipments: delayedShipments.map((s) => ({
          trackingNumber: s.trackingNumber ?? null, receiverName: s.receiverName, receiverCity: s.receiverCity ?? null, delayedHours: s.delayedHours,
        })),
        recentShipments: recentShipments.map((s) => ({
          trackingNumber: s.trackingNumber, clientName: s.clientName, status: s.status, amount: s.amount,
        })),
        revenueTrend: revenueTrend.map((d) => ({ day: d.day, revenue: d.revenue, profit: d.profit })),
      });
    } catch (err) {
      console.error("فشل تصدير التقرير:", err);
      window.alert("حدث خطأ أثناء تصدير التقرير. حاول مرة أخرى.");
    } finally {
      setIsExportingReport(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <style>{`
        .oc-card {
          position: relative;
          background: linear-gradient(160deg, hsl(var(--card)) 0%, hsl(var(--card)) 55%, color-mix(in srgb, hsl(var(--primary)) 6%, hsl(var(--card))) 100%);
          box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.02) inset;
          transition: box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease;
        }
        .oc-card:hover {
          box-shadow: 0 2px 4px rgba(0,0,0,0.06), 0 16px 36px -14px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 24px -6px color-mix(in srgb, hsl(var(--primary)) 35%, transparent);
          transform: translateY(-2px);
          border-color: color-mix(in srgb, hsl(var(--primary)) 30%, hsl(var(--border)));
        }
        .oc-kpi-card {
          position: relative;
          overflow: hidden;
          background: linear-gradient(155deg, hsl(var(--card)) 0%, hsl(var(--card)) 60%, color-mix(in srgb, var(--tone, #3b82f6) 10%, hsl(var(--card))) 100%);
          box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 10px 26px -14px color-mix(in srgb, var(--tone, #3b82f6) 45%, transparent), 0 0 0 1px color-mix(in srgb, var(--tone, #3b82f6) 12%, hsl(var(--border)));
          transition: box-shadow 0.28s ease, transform 0.28s ease, border-color 0.28s ease;
        }
        .oc-kpi-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(120px 90px at 88% -10%, color-mix(in srgb, var(--tone, #3b82f6) 22%, transparent), transparent 70%);
          pointer-events: none;
        }
        .oc-kpi-card:hover {
          box-shadow: 0 3px 6px rgba(0,0,0,0.05), 0 18px 40px -16px color-mix(in srgb, var(--tone, #3b82f6) 60%, transparent), 0 0 0 1px color-mix(in srgb, var(--tone, #3b82f6) 35%, hsl(var(--border))), 0 0 28px -8px color-mix(in srgb, var(--tone, #3b82f6) 55%, transparent);
          transform: translateY(-3px);
        }
      `}</style>
      {/* ── الهيدر العلوي ───────────────────────────────────────────────── */}
      <div className="oc-card rounded-2xl px-4 sm:px-5 py-4 relative z-[60]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* يمين: الترحيب + التاريخ */}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2">
              مرحباً بك، {user?.displayName} <span className="inline-block">👋</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{today} — هذه نظرة شاملة على حالة الشركة الآن</p>
          </div>

          {/* شمال: الساعة + الأدوات */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:shrink-0">
            {/* الساعة */}
            <div className="flex items-center gap-2 text-muted-foreground shrink-0">
              <Clock className="w-4 h-4 text-sky-500" />
              <div className="flex items-baseline gap-0.5 font-mono tabular-nums leading-none" dir="ltr">
                <span className="text-base font-bold text-foreground">{timeParts.h}</span>
                <span className="text-base font-bold text-muted-foreground">:</span>
                <span className="text-base font-bold text-foreground">{timeParts.m}</span>
                <span className="text-xs font-semibold text-sky-500 mr-1">{timeParts.period}</span>
              </div>
              <span className="text-xs hidden sm:inline">توقيت القاهرة</span>
            </div>

            <div className="hidden sm:block w-px h-6 bg-border shrink-0" />

            {/* شريط الأدوات */}
            <div className="flex items-center gap-2 flex-wrap">
              <GlobalQuickSearch />
              <NotificationBell className="flex items-center justify-center w-9 h-9 rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors shrink-0" />
              <Button variant="outline" size="icon" className="shrink-0" onClick={toggleTheme} title={theme === "dark" ? "التبديل للوضع الفاتح" : "التبديل للوضع الداكن"}>
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <Button variant="default" className="gap-2 shrink-0" onClick={handleExportReport} disabled={isExportingReport}>
                {isExportingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="hidden sm:inline">{isExportingReport ? "جارٍ تجهيز التقرير..." : "تصدير تقرير شامل"}</span>
                <span className="sm:hidden">تصدير</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── التنبيهات الذكية (منقول من لوحة التحكم) ────────────────────── */}
      {smartAllAlerts.length > 0 && (
        <div className="space-y-1.5">
          {smartHighAlerts.map((alert) => (
            <div key={alert.id} className="flex items-center gap-2 sm:gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg p-2.5 sm:p-3">
              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600 dark:text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs font-bold text-red-700 dark:text-red-400 truncate">{alert.title}</p>
                <p className="text-[9px] sm:text-[11px] text-red-600/70 dark:text-red-400/70 truncate">{alert.detail}</p>
              </div>
              {alert.type === "LOW_STOCK" && (
                <a href="/inventory" className="text-[9px] sm:text-xs text-primary hover:underline shrink-0">إدارة</a>
              )}
              {(alert.type === "HIGH_RETURN" || alert.type === "LOSING_PRODUCT") && (
                <a href="/product-performance" className="text-[9px] sm:text-xs text-primary hover:underline shrink-0">تحليل</a>
              )}
            </div>
          ))}
          {smartAlertsData && smartAlertsData.counts.total > smartHighAlerts.length && (
            <div className="flex items-center gap-2 sm:gap-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 rounded-lg p-2 sm:p-2.5">
              <Bell className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-[9px] sm:text-xs text-amber-700/80 dark:text-amber-400/80 flex-1 min-w-0 truncate">
                {smartAlertsData.counts.medium > 0 && `${smartAlertsData.counts.medium} تنبيه متوسط`}
                {smartAlertsData.counts.medium > 0 && smartAlertsData.counts.low > 0 && " • "}
                {smartAlertsData.counts.low > 0 && `${smartAlertsData.counts.low} تنبيه منخفض`}
              </p>
              <a href="/product-performance" className="text-[9px] sm:text-xs text-primary hover:underline shrink-0">عرض الكل ←</a>
            </div>
          )}
        </div>
      )}

      {/* ── صف الكروت العلوي ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground font-semibold">نظرة عامة على الشحنات والإيرادات</span>
        <OcPeriodFilterBar value={ocPeriodFilter} onChange={setOcPeriodFilter} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {opsKpisLoading && overviewCards.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="oc-kpi-card overflow-hidden animate-pulse">
              <CardContent className="p-4 space-y-2">
                <div className="w-9 h-9 rounded-lg bg-muted" />
                <div className="h-5 w-16 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))
        ) : (
          overviewCards.map((c) => {
            const meta = KPI_ICON_META[c.key] ?? KPI_ICON_META.total;
            const Icon = meta.icon;
            const isUp = c.change >= 0;
            return (
              <Card
                key={c.key}
                className="oc-kpi-card overflow-hidden cursor-pointer"
                style={{ ["--tone" as any]: meta.tone }}
                onClick={() => setOverviewCardModal(overviewCardModal === c.key ? null : c.key)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${meta.bg}`}>
                      <Icon className={`w-4.5 h-4.5 ${meta.color}`} />
                    </div>
                    <Badge variant={isUp ? "default" : "destructive"} className="gap-1 text-[10px]">
                      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(c.change)}%
                    </Badge>
                  </div>
                  <div>
                    <div className="text-xl font-black">
                      {c.key === "revenue" ? fc(c.value) : fn(c.value)}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                  </div>
                  <MiniSparkline data={c.sparkline} color={meta.spark} />
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ── إجمالي أرصدة الخزن (منقول من لوحة التحكم) ────────────────────── */}
      <Card className="oc-card overflow-hidden" style={{ ["--tone" as any]: "#10b981" }}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              type="button"
              className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest"
              onClick={() => setIsTreasuryOpen((v) => !v)}
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-500" /> إجمالي أرصدة الخزن
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isTreasuryOpen ? "rotate-180" : ""}`} />
            </button>
            <OcPeriodFilterBar value={ocPeriodFilter} onChange={setOcPeriodFilter} />
          </div>

          {!isTreasuryOpen && (
            <button
              type="button"
              onClick={() => setIsTreasuryOpen(true)}
              className="w-full text-center text-xs text-muted-foreground py-3 hover:text-foreground transition-colors"
            >
              اضغط للعرض
            </button>
          )}
          <div
            className="grid transition-all duration-300 ease-in-out"
            style={{ gridTemplateRows: isTreasuryOpen ? "1fr" : "0fr", opacity: isTreasuryOpen ? 1 : 0 }}
          >
            <div className="overflow-hidden min-h-0">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4 pt-1">
            {/* العمود الأيمن: الرقم الكبير + التفاصيل */}
            <div className="flex-1 min-w-0">
              {cashRegistersLoading && !cashRegisters ? (
                <div className="h-10 w-40 bg-muted rounded animate-pulse mb-3" />
              ) : (
                <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 leading-tight mb-3">
                  {fc(totalCash)}
                </p>
              )}

              {cashPeriodLoading && !cashPeriodSummary ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-14 bg-muted rounded-lg animate-pulse" />
                  <div className="h-14 bg-muted rounded-lg animate-pulse" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-background/40 border border-border rounded-lg px-3 py-2">
                    <p className="text-[9px] text-muted-foreground">صافي الإيرادات</p>
                    <p className={`text-sm sm:text-base font-black ${(manifestsPnlSummary?.netRevenue ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                      {fc(manifestsPnlSummary?.netRevenue ?? 0)}
                    </p>
                  </div>
                  <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                    <p className="text-[9px] text-muted-foreground">في الطريق</p>
                    <p className="text-sm sm:text-base font-black text-primary">{fc(cashPeriodSummary?.pendingRevenue ?? 0)}</p>
                    <p className="text-[9px] text-muted-foreground">محتمل</p>
                  </div>
                </div>
              )}
            </div>

            {/* العمود الأيسر: إجمالي الإيرادات / إجمالي المصاريف / صافي الإيراد */}
            <div className="lg:w-[46%] shrink-0 grid grid-cols-3 gap-2 p-2.5 bg-background/30 rounded-lg border border-border/40 self-stretch content-center">
              <div className="text-center">
                <p className="text-[9px] font-bold text-muted-foreground mb-0.5">إجمالي الإيرادات</p>
                <p className="font-black text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
                  {manifestsPnlLoading && !manifestsPnlSummary ? "—" : fc(manifestsPnlSummary?.totalRevenue ?? 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-bold text-muted-foreground mb-0.5">إجمالي المصاريف</p>
                <p className="font-black text-red-600 dark:text-red-400 text-xs sm:text-sm">
                  {manifestsPnlLoading && !manifestsPnlSummary ? "—" : fc(manifestsPnlSummary?.totalExpenses ?? 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-bold text-muted-foreground mb-0.5">صافي الإيراد</p>
                <p className={`font-black text-xs sm:text-sm ${(manifestsPnlSummary?.netRevenue ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {manifestsPnlLoading && !manifestsPnlSummary ? "—" : fc(manifestsPnlSummary?.netRevenue ?? 0)}
                </p>
              </div>
            </div>
          </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── ربح الفترات: اليوم / الأسبوع / الشهر (منقول من لوحة التحكم) ──── */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 ${ocPeriodFilter.type === "custom" && periodProfitData?.custom ? "xl:grid-cols-4" : ""} gap-3`}>
        {periodProfitLoading && !periodProfitData ? (
          [1, 2, 3].map((i) => <Card key={i} className="oc-kpi-card animate-pulse h-40" />)
        ) : periodProfitData ? (
          <>
            {([
              { key: "today" as const, label: "اليوم", data: periodProfitData.today, tone: "#3b82f6" },
              { key: "week" as const, label: "هذا الأسبوع", data: periodProfitData.week, tone: "#10b981" },
              { key: "month" as const, label: "هذا الشهر", data: periodProfitData.month, tone: "#f59e0b" },
            ]).map(({ key, label, data, tone }) => (
              <OcPeriodCard
                key={key}
                label={label}
                data={data}
                tone={tone}
                active={ocPeriodFilter.type === key}
                onClick={() => setOcPeriodFilter({ type: key })}
              />
            ))}
            {ocPeriodFilter.type === "custom" && periodProfitData.custom && (
              <OcPeriodCard
                key="custom"
                label="الفترة المحددة"
                data={periodProfitData.custom}
                tone="#8b5cf6"
                active={true}
                onClick={() => {}}
              />
            )}
          </>
        ) : null}
      </div>

      {overviewCardModal && (() => {
        const activeCard = overviewCards.find((c) => c.key === overviewCardModal);
        if (!activeCard) return null;
        const meta = KPI_ICON_META[overviewCardModal] ?? KPI_ICON_META.total;
        if (overviewCardModal === "revenue") {
          return (
            <RevenueBreakdownDropdown
              color={meta.tone}
              financialData={financialData}
              onClose={() => setOverviewCardModal(null)}
            />
          );
        }
        const statusMap: Record<string, string | undefined> = {
          total: undefined,
          delivered: "delivered",
          inShipping: "inShipping",
          returned: "returned",
          delayed: "delayed",
        };
        return (
          <StatusShipmentsDropdown
            status={statusMap[overviewCardModal]}
            label={activeCard.label}
            color={meta.tone}
            onClose={() => setOverviewCardModal(null)}
          />
        );
      })()}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-1">
          {statusDistLoading && statusDonutData.length === 0 ? (
            <div className="h-56 rounded-2xl bg-muted animate-pulse" />
          ) : statusDonutData.length === 0 ? (
            <div className="rounded-2xl border border-[#2a2210] bg-[#0d0d0d] flex flex-col items-center justify-center h-40 gap-2">
              <span className="text-3xl opacity-20">🚚</span>
              <span className="text-xs text-muted-foreground">لا توجد شحنات بعد</span>
            </div>
          ) : (
            <ShipmentStatusDonut data={statusDonutData} total={statusDistTotal} />
          )}
        </div>

        <Card className="oc-card xl:col-span-2 overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" style={{ boxShadow: "0 0 8px #3b82f6cc, 0 0 20px #3b82f655" }} />
                الشحنات الأسبوعية
              </CardTitle>
              <p className="text-[10px] mt-0.5 text-muted-foreground">الأسبوع الحالي والأسبوع الماضي والشهر الحالي</p>
            </div>
          </CardHeader>
          <CardContent>
            {shipmentChartsOcLoading && !shipmentChartsOc ? (
              <div className="h-56 rounded bg-muted animate-pulse" />
            ) : (
              <WeeklyShipmentBars data={shipmentChartsOc} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── الصف الثاني: مركز العمليات + الخريطة + KPIs ────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-stretch xl:h-[680px]">
        {/* العمود الجانبي — مركز العمليات (سكرول واحد موحّد للحاويات الأربع) */}
        <div className="xl:col-span-1 flex flex-col gap-3 xl:h-full xl:overflow-y-auto pr-1 min-h-0">
          <Card className="oc-kpi-card shrink-0 flex flex-col" style={{ ["--tone" as any]: "#ef4444" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-500" /> شحنات متأخرة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 overflow-y-auto min-h-0 pr-4 pl-2">
              {opsCenterLoading && delayedShipments.length === 0 ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0 animate-pulse">
                    <div className="space-y-1">
                      <div className="h-3 w-20 bg-muted rounded" />
                      <div className="h-2.5 w-28 bg-muted rounded" />
                    </div>
                    <div className="h-4 w-12 bg-muted rounded" />
                  </div>
                ))
              ) : delayedShipments.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">لا توجد شحنات متأخرة حالياً 🎉</div>
              ) : (
                delayedShipments.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <div className="font-semibold">{s.trackingNumber ?? `#${s.id}`}</div>
                      <div className="text-muted-foreground">{s.receiverName} — {s.receiverCity ?? "—"}</div>
                    </div>
                    <Badge variant="destructive" className="text-[10px]">{s.delayedHours} ساعة</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="oc-kpi-card shrink-0 flex flex-col" style={{ ["--tone" as any]: "#f59e0b" }}>
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> شحنات فيها مشكلة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pr-4 pl-2">
              {opsCenterLoading && problemShipments.length === 0 ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0 animate-pulse">
                    <div className="space-y-1">
                      <div className="h-3 w-20 bg-muted rounded" />
                      <div className="h-2.5 w-28 bg-muted rounded" />
                    </div>
                    <div className="h-4 w-12 bg-muted rounded" />
                  </div>
                ))
              ) : problemShipments.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">لا توجد شحنات بها مشكلة حالياً 🎉</div>
              ) : (
                problemShipments.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <div className="font-semibold">{s.trackingNumber ?? `#${s.id}`}</div>
                      <div className="text-muted-foreground">{s.receiverName} — {s.receiverCity ?? "—"}</div>
                    </div>
                    <Badge className="text-[10px] bg-amber-500/15 text-amber-600 border-amber-300">مرتجعة</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="oc-kpi-card shrink-0 flex flex-col" style={{ ["--tone" as any]: "#0ea5e9" }}>
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-500" /> المندوبين الموجودين حالياً
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pr-4 pl-2">
              {opsCenterLoading && representatives.length === 0 ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                ))
              ) : representatives.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">لا يوجد مندوبين متصلين حالياً</p>
              ) : (
                representatives.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-2">
                      <RepAvatar avatar={null} name={r.displayName} />
                      <div>
                        <div className="font-semibold">{r.displayName}</div>
                        <div className="text-muted-foreground">{r.activeShipments} شحنة نشطة · {r.successRate}% نجاح</div>
                      </div>
                    </div>
                    <Badge variant={r.isOnline ? "default" : "secondary"} className="text-[10px]">{r.isOnline ? "متصل" : "غير متصل"}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="oc-kpi-card shrink-0 flex flex-col" style={{ ["--tone" as any]: "#d946ef" }}>
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="w-4 h-4 text-fuchsia-500" /> عملاء محتاجين متابعة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pr-4 pl-2">
              {opsCenterLoading && clientsNeedingFollowup.length === 0 ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                ))
              ) : clientsNeedingFollowup.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">لا يوجد عملاء يحتاجون متابعة حالياً</p>
              ) : (
                clientsNeedingFollowup.map((c) => (
                  <div key={c.clientName} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <div className="font-semibold">{c.clientName}</div>
                      <div className="text-muted-foreground">{c.issueCount} مشكلة مفتوحة</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(c.lastIssueAt)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* الخريطة المباشرة (MapLibre GL — تجميع الشحنات حسب المحافظة) */}
        <div className="xl:col-span-2">
          <Card className="oc-kpi-card h-full flex flex-col" style={{ ["--tone" as any]: "#06b6d4" }}>
            <CardHeader className="pb-2 flex-row items-center justify-between shrink-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-500" /> الخريطة المباشرة
              </CardTitle>
              {liveMapData && (
                <span className="text-[10px] text-muted-foreground">
                  {liveMapData.totalActiveCities} محافظة نشطة · {liveMapData.totalActiveShipments} شحنة جارية
                </span>
              )}
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <LiveMap
                cities={liveMapCities}
                isLoading={liveMapLoading && liveMapCities.length === 0}
                busiestCity={liveMapData?.busiestCity ?? null}
                mostDelayedCity={liveMapData?.mostDelayedCity ?? null}
              />
            </CardContent>
          </Card>
        </div>

        {/* مؤشرات الأداء الرئيسية */}
        <div className="xl:col-span-1">
          <Card className="oc-kpi-card h-full" style={{ ["--tone" as any]: "#6366f1" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" /> مؤشرات الأداء
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-1">
              {perfMetricsLoading && performanceMetrics.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 rounded bg-muted animate-pulse" />
                ))
              ) : (
                performanceMetrics.map((m) => {
                  // القيم بدون max (بالساعات) تُطبَّع لعرض دائري بحد أقصى منطقي 48 ساعة
                  const gaugeValue = m.max != null ? m.value : Math.min(100, Math.round((m.value / 48) * 100));
                  const suffix = m.unit === "%" ? "%" : `${m.value} ${m.unit}`;
                  return (
                    <KpiGauge
                      key={m.key}
                      value={gaugeValue}
                      label={m.label}
                      suffix={suffix}
                      onClick={() => setPerfMetricModal({ key: m.key, label: m.label, value: m.value, unit: m.unit, max: m.max ?? null })}
                    />
                  );
                })
              )}
              {perfMetricModal && (
                <div className="col-span-2">
                  <PerformanceMetricDropdown
                    label={perfMetricModal.label}
                    value={perfMetricModal.value}
                    unit={perfMetricModal.unit}
                    max={perfMetricModal.max}
                    onClose={() => setPerfMetricModal(null)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── الصف الثالث: أرباح + اتجاه إيرادات + AI ────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* ملخص الأرباح */}
        <Card className="oc-kpi-card xl:col-span-1" style={{ ["--tone" as any]: "#14b8a6" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-teal-500" /> ملخص الأرباح
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {financialLoading && !financialData ? (
              <div className="h-40 rounded bg-muted animate-pulse" />
            ) : (
              <>
                <MiniLeaderLineDonut
                  centerLabel="الإجمالي"
                  centerValue={fc(financialData?.month.revenue ?? 0)}
                  data={[
                    { key: "revenue", label: "إيرادات", color: "#10b981", value: financialData?.month.revenue ?? 0 },
                    { key: "cost", label: "تكلفة", color: "#ef4444", value: financialData?.month.cost ?? 0 },
                    { key: "shippingSpend", label: "شحن", color: "#f59e0b", value: financialData?.month.shippingSpend ?? 0 },
                    { key: "otherExpenses", label: "أخرى", color: "#64748b", value: financialData?.month.otherExpenses ?? 0 },
                  ]}
                  onSegmentClick={(key, label, color) => setFinancialModal({ key, label, color })}
                />

                {financialModal && (
                  <FinancialBreakdownDropdown
                    itemKey={financialModal.key}
                    label={financialModal.label}
                    color={financialModal.color}
                    financialData={financialData}
                    onClose={() => setFinancialModal(null)}
                  />
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><div className="text-muted-foreground">أرباح اليوم</div><div className={`font-bold ${(periodProfitData?.today.netRevenue ?? 0) >= 0 ? "" : "text-red-600 dark:text-red-400"}`}>{fc(periodProfitData?.today.netRevenue ?? 0)}</div></div>
                  <div><div className="text-muted-foreground">أرباح الشهر</div><div className={`font-bold ${(periodProfitData?.month.netRevenue ?? 0) >= 0 ? "" : "text-red-600 dark:text-red-400"}`}>{fc(periodProfitData?.month.netRevenue ?? 0)}</div></div>
                  <div><div className="text-muted-foreground">تكلفة التشغيل</div><div className="font-bold">{fc(periodProfitData?.month.totalExpenses ?? 0)}</div></div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* اتجاه الإيرادات والأرباح */}
        <Card className="oc-kpi-card xl:col-span-2" style={{ ["--tone" as any]: "#3b82f6" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> اتجاه الإيرادات والأرباح
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueTrendLoading && revenueTrend.length === 0 ? (
              <div className="h-56 rounded bg-muted animate-pulse" />
            ) : (
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrend}>
                  <defs>
                    <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => fc(v)} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#rev-grad)" strokeWidth={2} />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>

        {/* مركز الذكاء الاصطناعي */}
        <Card className="oc-kpi-card xl:col-span-1" style={{ ["--tone" as any]: "#d946ef" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-fuchsia-500" /> مركز الذكاء الاصطناعي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {opsAlertsLoading && aiInsights.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 rounded bg-muted animate-pulse" />
              ))
            ) : aiInsights.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">لا توجد تنبيهات حالياً — كل شيء يسير بشكل طبيعي</p>
            ) : (
              aiInsights.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-muted/40">
                  <Zap className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                    a.type === "warning" ? "text-amber-500" : a.type === "critical" ? "text-red-500" :
                    a.type === "opportunity" ? "text-emerald-500" : "text-blue-500"}`} />
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-muted-foreground">{a.detail}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── أفضل العملاء / أفضل المندوبين ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="oc-kpi-card" style={{ ["--tone" as any]: "#a855f7" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-500" /> أفضل العملاء
              <span className="text-[10px] font-normal text-muted-foreground">({topPerformers?.periodLabel ?? "هذا الشهر"})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topPerformersLoading && topClients.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">جاري تحميل البيانات...</div>
            ) : topClients.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات كافية بعد</div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-right font-medium pb-2">العميل</th>
                    <th className="text-right font-medium pb-2">الشحنات</th>
                    <th className="text-right font-medium pb-2">الإيرادات</th>
                    <th className="text-right font-medium pb-2">نسبة النجاح</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((c) => (
                    <tr key={c.clientId} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <RepAvatar avatar={c.avatar} name={c.name} />
                          <div>
                            <div className="font-semibold">{c.name}</div>
                            {c.phone && <div className="text-[10px] text-muted-foreground" dir="ltr">{c.phone}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2">{fn(c.shipmentsCount)}</td>
                      <td className="py-2">{fc(c.revenue)}</td>
                      <td className="py-2">
                        <Badge className={`text-[10px] ${c.successRate >= 80 ? "bg-emerald-500/15 text-emerald-600 border-emerald-300" :
                          c.successRate >= 50 ? "bg-amber-500/15 text-amber-600 border-amber-300" :
                          "bg-red-500/15 text-red-600 border-red-300"}`}>{c.successRate}%</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="oc-kpi-card" style={{ ["--tone" as any]: "#0ea5e9" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-500" /> أفضل المندوبين
                <span className="text-[10px] font-normal text-muted-foreground">({repsPerformers?.periodLabel ?? "أسبوع"})</span>
              </span>
              <RepPeriodFilterBar value={repsPeriodFilter} onChange={setRepsPeriodFilter} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {repsPerformersLoading && topReps.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">جاري تحميل البيانات...</div>
            ) : topReps.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات كافية بعد</div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-right font-medium pb-2">المندوب</th>
                    <th className="text-right font-medium pb-2">التقييم</th>
                    <th className="text-right font-medium pb-2">الشحنات</th>
                    <th className="text-right font-medium pb-2">نسبة النجاح</th>
                  </tr>
                </thead>
                <tbody>
                  {topReps.map((r) => (
                    <tr key={r.userId} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <RepAvatar avatar={r.avatar} name={r.name} />
                          <span className="font-semibold">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-2">
                        {r.ratingsCount > 0 ? (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {r.avgRating}
                            <span className="text-[10px] text-muted-foreground">({r.ratingsCount})</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">لا يوجد</span>
                        )}
                      </td>
                      <td className="py-2">{fn(r.assigned)}</td>
                      <td className="py-2">
                        <Badge className={`text-[10px] ${r.successRate >= 80 ? "bg-emerald-500/15 text-emerald-600 border-emerald-300" :
                          r.successRate >= 50 ? "bg-amber-500/15 text-amber-600 border-amber-300" :
                          "bg-red-500/15 text-red-600 border-red-300"}`}>{r.successRate}%</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── الصف الرابع ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* أحدث التنبيهات */}
        <Card className="oc-kpi-card xl:col-span-2" style={{ ["--tone" as any]: "#ef4444" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-red-500" /> أحدث التنبيهات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentEventsLoading && recentEvents.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start justify-between gap-2 text-xs border-b last:border-0 pb-2 last:pb-0 animate-pulse">
                  <div className="h-3 w-36 bg-muted rounded" />
                  <div className="h-3 w-14 bg-muted rounded" />
                </div>
              ))
            ) : recentEvents.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">لا توجد تنبيهات جديدة</div>
            ) : (
              recentEvents.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-2 text-xs border-b last:border-0 pb-2 last:pb-0">
                  <span>{a.label} — {a.receiverName} ({a.shipmentNumber})</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo(a.updatedAt)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* آخر الشحنات */}
        <Card className="oc-kpi-card xl:col-span-2" style={{ ["--tone" as any]: "#64748b" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" /> آخر الشحنات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentShipmentsLoading && recentShipments.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-6 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : recentShipments.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">لا توجد شحنات بعد</div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-72 -mx-2 px-2">
              <table className="w-full text-xs min-w-[420px]">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="text-muted-foreground border-b">
                    <th className="text-right font-medium pb-2">الرقم</th>
                    <th className="text-right font-medium pb-2">العميل</th>
                    <th className="text-right font-medium pb-2">الحالة</th>
                    <th className="text-right font-medium pb-2">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentShipments.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 font-semibold">{s.trackingNumber}</td>
                      <td className="py-2">{s.clientName}</td>
                      <td className="py-2">
                        <Badge className={`text-[10px] ${RECENT_STATUS_CLASSES[s.statusColor] || ""}`}>{s.status}</Badge>
                      </td>
                      <td className="py-2">{fc(s.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── إجراءات سريعة + جدول المندوبين اليومي ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="oc-kpi-card xl:col-span-1" style={{ ["--tone" as any]: "#eab308" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" /> إجراءات سريعة
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: "شحنة جديدة", icon: Plus, color: "text-emerald-500", path: "/shipments/new", permission: "orders.create" },
              { label: "استيراد Excel", icon: Upload, color: "text-amber-500", path: "/import", permission: "import.view" },
              { label: "طلب جديد", icon: Briefcase, color: "text-blue-500", path: "/orders/new", permission: "orders.create" },
              { label: "مندوب جديد", icon: UserPlus, color: "text-sky-500", path: "/users/manage", permission: "settings.users" },
              { label: "تقرير الأداء", icon: FileText, color: "text-purple-500", path: "/team-performance", permission: "analytics.team" },
              { label: "تسجيل الخروج", icon: LogOut, color: "text-red-500", action: "logout" as const },
            ].map((a) => {
              const allowed = a.action === "logout" ? true : can(a.permission);
              return (
                <Button
                  key={a.label}
                  variant="outline"
                  disabled={!allowed}
                  title={allowed ? undefined : "لا تملك صلاحية الوصول لهذا الإجراء"}
                  className="h-16 flex-col gap-1 text-xs disabled:opacity-40"
                  onClick={() => {
                    if (a.action === "logout") {
                      if (window.confirm("هل أنت متأكد من تسجيل الخروج وإنهاء الجلسة الحالية؟")) logout();
                      return;
                    }
                    if (a.path) navigate(a.path);
                  }}
                >
                  <a.icon className={`w-4 h-4 ${a.color}`} />
                  {a.label}
                </Button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="oc-kpi-card xl:col-span-2" style={{ ["--tone" as any]: "#0ea5e9" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-500" /> جدول المندوبين اليومي
              </span>
              <RepPeriodFilterBar value={repsDailyFilter} onChange={setRepsDailyFilter} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {repsDailyLoading && repsDailyRows.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">جاري تحميل البيانات...</div>
            ) : repsDailyRows.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">لا يوجد مندوبين حالياً</div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-xs min-w-[380px]">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-right font-medium pb-2">المندوب</th>
                    <th className="text-right font-medium pb-2">الشحنات</th>
                    <th className="text-right font-medium pb-2">تم التسليم</th>
                    <th className="text-right font-medium pb-2">نسبة النجاح</th>
                  </tr>
                </thead>
                <tbody>
                  {repsDailyRows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 font-semibold">{r.displayName}</td>
                      <td className="py-2">{r.totalShipments}</td>
                      <td className="py-2">{r.deliveredShipments}</td>
                      <td className="py-2">{r.successRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── شاشة المدير التنفيذي ─────────────────────────────────────────── */}
      <Card className="oc-kpi-card border-2" style={{ ["--tone" as any]: "#10b981" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-500" /> شاشة المدير التنفيذي — نظرة سريعة
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 text-center">
          {executiveSummaryLoading && !executiveSummary ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))
          ) : (
            <>
              <div><div className="text-lg font-black">{fc(executiveSummary?.revenue ?? 0)}</div><div className="text-[11px] text-muted-foreground">الإيرادات</div></div>
              <div><div className="text-lg font-black">{fc(executiveSummary?.profit ?? 0)}</div><div className="text-[11px] text-muted-foreground">الأرباح</div></div>
              <div><div className={`text-lg font-black ${(executiveSummary?.growthRate ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>{executiveSummary?.growthRate ?? 0}%</div><div className="text-[11px] text-muted-foreground">معدل النمو</div></div>
              <div><div className="text-lg font-black">{fn(executiveSummary?.clientsCount ?? 0)}</div><div className="text-[11px] text-muted-foreground">عدد العملاء</div></div>
              <div><div className="text-lg font-black">{fn(executiveSummary?.shipmentsCount ?? 0)}</div><div className="text-[11px] text-muted-foreground">عدد الشحنات</div></div>
              <div><div className="text-lg font-black">{executiveSummary?.successRate ?? 0}%</div><div className="text-[11px] text-muted-foreground">نسبة النجاح</div></div>
              <div><div className="text-lg font-black">{executiveSummary?.topArea ?? "—"}</div><div className="text-[11px] text-muted-foreground">أكثر المناطق نشاطاً</div></div>
              <div><div className="text-lg font-black text-blue-500">{fc(executiveSummary?.nextMonthForecast ?? 0)}</div><div className="text-[11px] text-muted-foreground">توقعات الشهر القادم</div></div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground border-t pt-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> النظام يعمل بكفاءة
        </div>
        <div>آخر نسخة احتياطية: اليوم 03:00 صباحاً</div>
        <div>© {new Date().getFullYear()} STARK Logistics — جميع الحقوق محفوظة</div>
      </div>
    </div>
  );
}
