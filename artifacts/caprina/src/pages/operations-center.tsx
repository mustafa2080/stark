import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, shipmentsApi, financeClientsApi, shippingApi, type Shipment, type FinanceClientSearchResult, type ShippingCompany, type TopPerformersResponse, type OperationsKpisResponse, type OperationsCenterResponse, type StatusDistributionResponse, type RecentEventsResponse, type RecentShipmentsResponse, type FinancialDashboardResponse, type FinancialDashboardPeriod, type ExecutiveSummaryResponse, type OpsAlertsResponse, type PerformanceMetricsResponse, type RevenueTrendResponse, type LiveMapResponse } from "@/lib/api";
import { LiveMap } from "@/components/live-map";
import { NotificationBell } from "@/components/notification-bell";
import {
  Search, Bell, Sun, Moon, Clock, Download, Loader2, Building2,
  Package, PackageCheck, Truck, Undo2, Star, DollarSign,
  AlertTriangle, AlertOctagon, Users, Phone, MapPin,
  Brain, Zap, TrendingUp, TrendingDown, Plus, Upload, Briefcase,
  UserPlus, FileText, LogOut, Wallet, Activity, X,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Line,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  mockTodayOutbound,
  mockTopPerformers,
  mockOperationsKpis,
  mockOperationsCenter,
  mockStatusDistribution,
  mockRecentEvents,
  mockRecentShipments,
  mockFinancialDashboard,
  mockOpsAlerts,
  mockExecutiveSummary,
  mockPerformanceMetrics,
  mockRevenueTrend as mockRevenueTrendDays,
  mockLiveMap,
} from "@/lib/operations-center-mock-data";
import { exportOperationsReportPdf } from "@/lib/operations-report";

const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));
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

// ── جلب أفضل العملاء (بيانات حقيقية من الباك اند) ────────────────────────────
function useTopPerformers() {
  return useQuery({
    queryKey: ["analytics-top-performers"],
    queryFn: analyticsApi.topPerformers,
    staleTime: 3 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    initialData: mockTopPerformers as unknown as TopPerformersResponse,
    placeholderData: (prev: TopPerformersResponse | undefined) => prev,
  });
}

// ── جلب كروت KPI الرئيسية (بيانات حقيقية من الباك اند) ───────────────────────
function useOperationsKpis() {
  return useQuery({
    queryKey: ["analytics-operations-kpis"],
    queryFn: analyticsApi.operationsKpis,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    initialData: mockOperationsKpis as unknown as OperationsKpisResponse,
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
    initialData: mockOperationsCenter as unknown as OperationsCenterResponse,
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
    initialData: mockStatusDistribution as unknown as StatusDistributionResponse,
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
    initialData: mockRecentEvents as unknown as RecentEventsResponse,
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
    initialData: mockRecentShipments as unknown as RecentShipmentsResponse,
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
    initialData: mockFinancialDashboard as unknown as FinancialDashboardResponse,
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
    initialData: mockOpsAlerts as unknown as OpsAlertsResponse,
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
    initialData: mockExecutiveSummary as unknown as ExecutiveSummaryResponse,
    placeholderData: (prev: ExecutiveSummaryResponse | undefined) => prev,
  });
}

// ── جلب مؤشرات الأداء الدائرية (بيانات حقيقية من الباك اند) ───────────────────
function usePerformanceMetrics() {
  return useQuery({
    queryKey: ["analytics-performance-metrics"],
    queryFn: analyticsApi.performanceMetrics,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    initialData: mockPerformanceMetrics as unknown as PerformanceMetricsResponse,
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
    initialData: { days: mockRevenueTrendDays } as unknown as RevenueTrendResponse,
    placeholderData: (prev: RevenueTrendResponse | undefined) => prev,
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
    initialData: mockLiveMap as unknown as LiveMapResponse,
    placeholderData: (prev: LiveMapResponse | undefined) => prev,
  });
}

// ── دونات بخطوط توصيل خارجية (leader lines) لتوزيع الشحنات حسب الحالة ────────
function LeaderLineDonut({
  data,
  total,
  onSegmentClick,
}: {
  data: { status: string; label: string; color: string; value: number }[];
  total: number;
  onSegmentClick?: (status: string, label: string, color: string) => void;
}) {
  const size = 280;
  const padX = 64; // مساحة إضافية يمين ويسار لصناديق الـ labels داخل الـ viewBox نفسه
  const vbWidth = size + padX * 2;
  const cx = vbWidth / 2;
  const cy = size / 2;
  const rOuter = 72;
  const rInner = 46;
  const gapDeg = 2.2; // فجوة صغيرة بين القطاعات

  const sum = data.reduce((s, d) => s + d.value, 0) || 1;

  // نحسب زوايا كل قطاع (0deg = أعلى المنتصف، اتجاه عقارب الساعة)
  let cursor = 0;
  const segments = data.map((d) => {
    const sweep = (d.value / sum) * 360;
    const startDeg = cursor + gapDeg / 2;
    const endDeg = cursor + sweep - gapDeg / 2;
    cursor += sweep;
    const midDeg = (startDeg + endDeg) / 2;
    return { ...d, startDeg, endDeg: Math.max(endDeg, startDeg), midDeg, pct: Math.round((d.value / sum) * 100) };
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

  // نبعد التسميات الجانبية عن بعض رأسياً لو متقاربة عشان متتكسرش فوق بعض
  const labelWidth = 58;
  const leftLabels = segments.filter((s) => Math.cos(toRad(s.midDeg)) < 0).sort((a, b) => point(0, a.midDeg).y - point(0, b.midDeg).y);
  const rightLabels = segments.filter((s) => Math.cos(toRad(s.midDeg)) >= 0).sort((a, b) => point(0, a.midDeg).y - point(0, b.midDeg).y);

  const spaceOut = (list: typeof segments, side: "left" | "right") => {
    const minGap = 26;
    const anchors = list.map((s) => point(rOuter + 4, s.midDeg).y);
    for (let i = 1; i < anchors.length; i++) {
      if (anchors[i] - anchors[i - 1] < minGap) anchors[i] = anchors[i - 1] + minGap;
    }
    return list.map((s, i) => ({ ...s, labelY: anchors[i], side }));
  };

  const placed = [...spaceOut(leftLabels, "left"), ...spaceOut(rightLabels, "right")];

  return (
    <div className="w-full flex items-center justify-center py-2">
      <svg viewBox={`0 0 ${vbWidth} ${size}`} width="100%" height={size} style={{ maxWidth: "100%" }} preserveAspectRatio="xMidYMid meet">
        {segments.map((s) => (
          <path
            key={s.status}
            d={arcPath(s.startDeg, s.endDeg)}
            fill={s.color}
            className={onSegmentClick ? "cursor-pointer transition-opacity hover:opacity-80" : undefined}
            onClick={() => onSegmentClick?.(s.status, s.label, s.color)}
          />
        ))}

        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground" style={{ fontSize: 22, fontWeight: 900 }}>
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>
          الإجمالي
        </text>

        {placed.map((s) => {
          const edge = point(rOuter, s.midDeg);
          const bendX = cx + (size / 2 - 4) * Math.sign(edge.x - cx || 1) * 0.62;
          const boxX = s.side === "left" ? bendX - labelWidth : bendX;
          return (
            <g
              key={`label-${s.status}`}
              className={onSegmentClick ? "cursor-pointer" : undefined}
              onClick={() => onSegmentClick?.(s.status, s.label, s.color)}
            >
              <polyline
                points={`${edge.x},${edge.y} ${bendX},${s.labelY} ${s.side === "left" ? boxX + labelWidth : boxX},${s.labelY}`}
                fill="none"
                stroke={s.color}
                strokeWidth={1.5}
              />
              <rect x={boxX} y={s.labelY - 10} width={labelWidth} height={20} rx={5} fill={s.color} />
              <text
                x={boxX + labelWidth / 2}
                y={s.labelY + 4}
                textAnchor="middle"
                style={{ fontSize: 11, fontWeight: 800, fill: "#fff" }}
              >
                {s.value} ({s.pct}%)
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
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

// ── ساعة مباشرة بتوقيت القاهرة ───────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeParts = useMemo(() => {
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

  return (
    <div className="oc-kpi-card flex items-center gap-3 px-4 py-2 rounded-xl" style={{ ["--tone" as any]: "#0ea5e9" }}>
      <Clock className="w-5 h-5 text-sky-500 shrink-0" />
      <div className="flex items-baseline gap-0.5 font-mono tabular-nums leading-none" dir="ltr">
        <span className="text-2xl font-black">{timeParts.h}</span>
        <span className="text-2xl font-black text-muted-foreground">:</span>
        <span className="text-2xl font-black">{timeParts.m}</span>
        <span className="text-base font-bold text-muted-foreground">:{timeParts.s}</span>
        <span className="text-xs font-bold text-sky-500 mr-1.5">{timeParts.period}</span>
      </div>
      <span className="text-xs text-muted-foreground border-r pr-2.5 mr-1">توقيت القاهرة</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ══════════════════════════════════════════════════════════════════════════
export default function OperationsCenterPage() {
  const { user, logout, can } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [statusModal, setStatusModal] = useState<{ status: string; label: string; color: string } | null>(null);
  const [financialModal, setFinancialModal] = useState<{ key: string; label: string; color: string } | null>(null);
  const [perfMetricModal, setPerfMetricModal] = useState<{ key: string; label: string; value: number; unit: string; max: number | null } | null>(null);
  const [overviewCardModal, setOverviewCardModal] = useState<string | null>(null);
  const { data: topPerformers, isLoading: topPerformersLoading } = useTopPerformers();
  const topClients = topPerformers?.topClients ?? [];
  const topReps = topPerformers?.topReps ?? [];
  const { data: opsKpis, isLoading: opsKpisLoading } = useOperationsKpis();
  const overviewCards = opsKpis?.cards ?? [];
  const { data: opsCenter, isLoading: opsCenterLoading } = useOperationsCenter();
  const delayedShipments = opsCenter?.delayedShipments ?? [];
  const problemShipments = opsCenter?.problemShipments ?? [];
  const outTodayShipments = opsCenter?.outToday ?? [];
  const representatives = opsCenter?.representatives ?? [];
  const clientsNeedingFollowup = opsCenter?.clientsNeedingFollowup ?? [];
  const { data: statusDist, isLoading: statusDistLoading } = useStatusDistribution();
  const statusDistribution = statusDist?.distribution ?? [];
  const { data: recentEventsData, isLoading: recentEventsLoading } = useRecentEvents();
  const recentEvents = recentEventsData?.events ?? [];
  const { data: recentShipmentsData, isLoading: recentShipmentsLoading } = useRecentShipments();
  const recentShipments = recentShipmentsData?.shipments ?? [];
  const { data: financialData, isLoading: financialLoading } = useFinancialDashboard();
  const { data: opsAlertsData, isLoading: opsAlertsLoading } = useOpsAlerts();
  const aiInsights = opsAlertsData?.alerts ?? [];
  const { data: executiveSummary, isLoading: executiveSummaryLoading } = useExecutiveSummary();
  const { data: perfMetricsData, isLoading: perfMetricsLoading } = usePerformanceMetrics();
  const performanceMetrics = perfMetricsData?.metrics ?? [];
  const { data: revenueTrendData, isLoading: revenueTrendLoading } = useRevenueTrend();
  const revenueTrend = revenueTrendData?.days ?? [];
  const { data: liveMapData, isLoading: liveMapLoading } = useLiveMap();
  const liveMapCities = liveMapData?.cities ?? [];
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
          name: c.name, phone: c.phone ?? null, shipmentsCount: c.shipmentsCount, revenue: c.revenue, successRate: c.successRate,
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">مرحباً بك، {user?.displayName} 👋</h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <p className="text-sm text-muted-foreground">{today} — هذه نظرة شاملة على حالة الشركة الآن</p>
            <LiveClock />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <GlobalQuickSearch />
          <NotificationBell className="flex items-center justify-center w-9 h-9 rounded-md border hover:bg-accent hover:text-accent-foreground" />
          <Button variant="outline" size="icon" onClick={toggleTheme} title={theme === "dark" ? "التبديل للوضع الفاتح" : "التبديل للوضع الداكن"}>
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button variant="default" className="gap-2" onClick={handleExportReport} disabled={isExportingReport}>
            {isExportingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExportingReport ? "جارٍ تجهيز التقرير..." : "تصدير تقرير شامل"}
          </Button>
        </div>
      </div>

      {/* ── صف الكروت العلوي ────────────────────────────────────────────── */}
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

      {/* ── الصف الثاني: مركز العمليات + الخريطة + KPIs ────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-stretch">
        {/* العمود الجانبي — مركز العمليات */}
        <div className="xl:col-span-1 flex flex-col gap-3">
          <Card className="oc-kpi-card" style={{ ["--tone" as any]: "#ef4444" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-500" /> شحنات متأخرة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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

          <Card className="oc-kpi-card" style={{ ["--tone" as any]: "#f59e0b" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> شحنات فيها مشكلة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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

          <Card className="oc-kpi-card" style={{ ["--tone" as any]: "#10b981" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-emerald-500" /> شحنات خارجة اليوم
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{mockTodayOutbound.count} <span className="text-xs text-muted-foreground font-normal">/ {mockTodayOutbound.target}</span></div>
              <div className="w-full h-2 bg-muted rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(mockTodayOutbound.count / mockTodayOutbound.target) * 100}%` }} />
              </div>
            </CardContent>
          </Card>

          <Card className="oc-kpi-card" style={{ ["--tone" as any]: "#0ea5e9" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-500" /> المندوبين الموجودين حالياً
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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

          <Card className="oc-kpi-card" style={{ ["--tone" as any]: "#d946ef" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="w-4 h-4 text-fuchsia-500" /> عملاء محتاجين متابعة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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
              <LiveMap cities={liveMapCities} isLoading={liveMapLoading && liveMapCities.length === 0} />
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
                  <div><div className="text-muted-foreground">أرباح اليوم</div><div className="font-bold">{fc(financialData?.today.netProfit ?? 0)}</div></div>
                  <div><div className="text-muted-foreground">أرباح الشهر</div><div className="font-bold">{fc(financialData?.month.netProfit ?? 0)}</div></div>
                  <div><div className="text-muted-foreground">تكلفة التشغيل</div><div className="font-bold">{fc(financialData?.month.operatingCost ?? 0)}</div></div>
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
              <span className="text-[10px] font-normal text-muted-foreground">(آخر 30 يوم)</span>
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
                    <tr key={`${c.name}-${c.phone}`} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="font-semibold">{c.name}</div>
                        {c.phone && <div className="text-[10px] text-muted-foreground" dir="ltr">{c.phone}</div>}
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
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="w-4 h-4 text-sky-500" /> أفضل المندوبين
              <span className="text-[10px] font-normal text-muted-foreground">(آخر 30 يوم)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topPerformersLoading && topReps.length === 0 ? (
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
        {/* توزيع الشحنات حسب الحالة */}
        <Card className="oc-kpi-card xl:col-span-1" style={{ ["--tone" as any]: "#f97316" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-500" /> توزيع الشحنات حسب الحالة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusDistLoading && statusDistribution.length === 0 ? (
              <div className="h-40 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full border-8 border-muted animate-pulse" />
              </div>
            ) : statusDistribution.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-10">لا توجد بيانات كافية</div>
            ) : (
              <>
                <LeaderLineDonut
                  data={statusDistribution}
                  total={statusDistribution.reduce((s, d) => s + d.value, 0)}
                  onSegmentClick={(status, label, color) => setStatusModal({ status, label, color })}
                />
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
                  {statusDistribution.map((s) => (
                    <div
                      key={s.status}
                      className="flex items-center justify-between text-[11px] cursor-pointer hover:opacity-70 transition-opacity"
                      onClick={() => setStatusModal({ status: s.status, label: s.label, color: s.color })}
                    >
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                      <span className="font-semibold">{fn(s.value)}</span>
                    </div>
                  ))}
                </div>

                {statusModal && (
                  <StatusShipmentsDropdown
                    status={statusModal.status}
                    label={statusModal.label}
                    color={statusModal.color}
                    onClose={() => setStatusModal(null)}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* أحدث التنبيهات */}
        <Card className="oc-kpi-card xl:col-span-1" style={{ ["--tone" as any]: "#ef4444" }}>
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
              <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
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
              { label: "عمل جديد", icon: Briefcase, color: "text-blue-500", path: "/orders/new", permission: "orders.create" },
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
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="w-4 h-4 text-sky-500" /> جدول المندوبين اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opsCenterLoading && representatives.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">جاري تحميل البيانات...</div>
            ) : representatives.length === 0 ? (
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
                  {representatives.map((r) => (
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
