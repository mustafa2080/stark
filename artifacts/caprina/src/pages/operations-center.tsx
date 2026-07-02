import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, type TopPerformersResponse, type OperationsKpisResponse } from "@/lib/api";
import {
  Search, Bell, Mail, Globe, Sun, Download,
  Package, PackageCheck, Truck, Undo2, Star, DollarSign,
  AlertTriangle, AlertOctagon, Users, Phone, MapPin,
  Brain, Zap, TrendingUp, TrendingDown, Plus, Upload, Briefcase,
  UserPlus, FileText, LogOut, Wallet, Activity,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Line,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  mockDelayedShipments, mockProblemShipments,
  mockTodayOutbound, mockActiveReps, mockClientsNeedFollowup,
  mockFinancials, mockKpis, mockAiInsights, mockAlerts,
  mockRevenueTrend,
  mockStatusDistribution, mockRecentShipments, mockDailyReps,
  mockExecutiveSummary,
} from "@/lib/operations-center-mock-data";

const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));

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

// ── Radial KPI gauge ─────────────────────────────────────────────────────────
function KpiGauge({ value, label, suffix }: { value: number; label: string; suffix: string }) {
  const r = 34, c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 80 ? "#10b981" : value >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-2 p-3">
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
    </div>
  );
}

const KPI_ICON_META: Record<string, { icon: any; bg: string; color: string; spark: string }> = {
  total:      { icon: Package,      bg: "bg-blue-500/10",    color: "text-blue-500",    spark: "#3b82f6" },
  delivered:  { icon: PackageCheck, bg: "bg-emerald-500/10", color: "text-emerald-500", spark: "#10b981" },
  inShipping: { icon: Truck,        bg: "bg-sky-500/10",     color: "text-sky-500",     spark: "#0ea5e9" },
  returned:   { icon: Undo2,        bg: "bg-amber-500/10",   color: "text-amber-500",   spark: "#f59e0b" },
  delayed:    { icon: AlertTriangle, bg: "bg-violet-500/10",  color: "text-violet-500",  spark: "#8b5cf6" },
  revenue:    { icon: DollarSign,   bg: "bg-teal-500/10",    color: "text-teal-500",    spark: "#14b8a6" },
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
    placeholderData: (prev: OperationsKpisResponse | undefined) => prev,
  });
}

// ══════════════════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ══════════════════════════════════════════════════════════════════════════
export default function OperationsCenterPage() {
  const { user } = useAuth();
  const { data: topPerformers, isLoading: topPerformersLoading } = useTopPerformers();
  const topClients = topPerformers?.topClients ?? [];
  const topReps = topPerformers?.topReps ?? [];
  const { data: opsKpis, isLoading: opsKpisLoading } = useOperationsKpis();
  const overviewCards = opsKpis?.cards ?? [];
  const today = new Intl.DateTimeFormat("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {/* ── الهيدر العلوي ───────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">مرحباً بك، {user?.name || "بشمهندس"} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">{today} — هذه نظرة شاملة على حالة الشركة الآن</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="بحث سريع..." className="pr-9 w-56" />
          </div>
          <Button variant="outline" size="icon"><Bell className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon"><Mail className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon"><Globe className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon"><Sun className="w-4 h-4" /></Button>
          <Button variant="default" className="gap-2">
            <Download className="w-4 h-4" /> تصدير تقرير شامل
          </Button>
        </div>
      </div>

      {/* ── صف الكروت العلوي ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {opsKpisLoading && overviewCards.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden animate-pulse">
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
              <Card key={c.key} className="overflow-hidden">
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

      {/* ── الصف الثاني: مركز العمليات + الخريطة + KPIs ────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* العمود الجانبي — مركز العمليات */}
        <div className="xl:col-span-1 space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-500" /> شحنات متأخرة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {mockDelayedShipments.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0">
                  <div>
                    <div className="font-semibold">{s.id}</div>
                    <div className="text-muted-foreground">{s.client} — {s.city}</div>
                  </div>
                  <Badge variant="destructive" className="text-[10px]">{s.hours} ساعة</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> شحنات فيها مشكلة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {mockProblemShipments.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0">
                  <div>
                    <div className="font-semibold">{s.id}</div>
                    <div className="text-muted-foreground">{s.client} — {s.city}</div>
                  </div>
                  <Badge className="text-[10px] bg-amber-500/15 text-amber-600 border-amber-300">{s.issue}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-500" /> المندوبين الموجودين حالياً
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {mockActiveReps.map((r) => (
                <div key={r.name} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0">
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-muted-foreground">{r.area}</div>
                  </div>
                  <Badge variant={r.status === "متاح" ? "default" : "secondary"} className="text-[10px]">{r.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="w-4 h-4 text-fuchsia-500" /> عملاء محتاجين متابعة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {mockClientsNeedFollowup.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0">
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-muted-foreground">{c.reason}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{c.lastContact}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* الخريطة المباشرة (نسخة بصرية ثابتة) */}
        <div className="xl:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-500" /> الخريطة المباشرة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-full h-72 rounded-xl bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-transparent border border-dashed flex items-center justify-center overflow-hidden">
                {mockActiveReps.map((r, i) => (
                  <div key={r.name} className="absolute flex flex-col items-center gap-1"
                    style={{ top: `${25 + i * 20}%`, left: `${20 + i * 25}%` }}>
                    <div className="w-3 h-3 rounded-full bg-sky-500 ring-4 ring-sky-500/20 animate-pulse" />
                    <span className="text-[10px] bg-background/80 px-1.5 py-0.5 rounded border">{r.area}</span>
                  </div>
                ))}
                <span className="text-xs text-muted-foreground">عرض تفاعلي للخريطة قريباً — نسخة تجريبية حالياً</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* مؤشرات الأداء الرئيسية */}
        <div className="xl:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" /> مؤشرات الأداء
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-1">
              {mockKpis.map((k) => (
                <KpiGauge key={k.key} value={k.value} label={k.label} suffix={k.suffix} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── الصف الثالث: أرباح + اتجاه إيرادات + AI ────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* ملخص الأرباح */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-teal-500" /> ملخص الأرباح
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="w-full h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[
                    { name: "أرباح اليوم", value: mockFinancials.todayProfit },
                    { name: "تكلفة تشغيل", value: mockFinancials.operatingCost },
                  ]} dataKey="value" innerRadius={40} outerRadius={60} paddingAngle={3}>
                    <Cell fill="#14b8a6" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip formatter={(v: number) => fc(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><div className="text-muted-foreground">أرباح اليوم</div><div className="font-bold">{fc(mockFinancials.todayProfit)}</div></div>
              <div><div className="text-muted-foreground">أرباح الشهر</div><div className="font-bold">{fc(mockFinancials.monthProfit)}</div></div>
              <div><div className="text-muted-foreground">تكلفة التشغيل</div><div className="font-bold">{fc(mockFinancials.operatingCost)}</div></div>
            </div>
          </CardContent>
        </Card>

        {/* اتجاه الإيرادات والأرباح */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> اتجاه الإيرادات والأرباح
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockRevenueTrend}>
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
          </CardContent>
        </Card>

        {/* مركز الذكاء الاصطناعي */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-fuchsia-500" /> مركز الذكاء الاصطناعي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mockAiInsights.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-muted/40">
                <Zap className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                  a.type === "warning" ? "text-amber-500" : a.type === "alert" ? "text-red-500" :
                  a.type === "opportunity" ? "text-emerald-500" : "text-blue-500"}`} />
                <span>{a.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── أفضل العملاء / أفضل المندوبين ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
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
              <table className="w-full text-xs">
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
            )}
          </CardContent>
        </Card>

        <Card>
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
              <table className="w-full text-xs">
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
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── الصف الرابع ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* توزيع الشحنات حسب الحالة */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-500" /> توزيع الشحنات حسب الحالة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mockStatusDistribution} dataKey="value" nameKey="status" innerRadius={38} outerRadius={60} paddingAngle={3}>
                    {mockStatusDistribution.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 mt-2">
              {mockStatusDistribution.map((s) => (
                <div key={s.status} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.status}</span>
                  <span className="font-semibold">{fn(s.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* أحدث التنبيهات */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-red-500" /> أحدث التنبيهات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mockAlerts.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-2 text-xs border-b last:border-0 pb-2 last:pb-0">
                <span>{a.text}</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{a.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* آخر الشحنات */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" /> آخر الشحنات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-right font-medium pb-2">الرقم</th>
                  <th className="text-right font-medium pb-2">العميل</th>
                  <th className="text-right font-medium pb-2">الحالة</th>
                  <th className="text-right font-medium pb-2">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {mockRecentShipments.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 font-semibold">{s.id}</td>
                    <td className="py-2">{s.client}</td>
                    <td className="py-2">
                      <Badge className={`text-[10px] ${RECENT_STATUS_CLASSES[s.statusColor] || ""}`}>{s.status}</Badge>
                    </td>
                    <td className="py-2">{fc(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ── إجراءات سريعة + جدول المندوبين اليومي ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" /> إجراءات سريعة
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: "شحنة جديدة", icon: Plus, color: "text-emerald-500" },
              { label: "استيراد Excel", icon: Upload, color: "text-amber-500" },
              { label: "عمل جديد", icon: Briefcase, color: "text-blue-500" },
              { label: "مندوب جديد", icon: UserPlus, color: "text-sky-500" },
              { label: "تقرير جديد", icon: FileText, color: "text-purple-500" },
              { label: "إغلاق شيفت", icon: LogOut, color: "text-red-500" },
            ].map((a) => (
              <Button key={a.label} variant="outline" className="h-16 flex-col gap-1 text-xs">
                <a.icon className={`w-4 h-4 ${a.color}`} />
                {a.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="w-4 h-4 text-sky-500" /> جدول المندوبين اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-right font-medium pb-2">المندوب</th>
                  <th className="text-right font-medium pb-2">الشحنات</th>
                  <th className="text-right font-medium pb-2">تم التسليم</th>
                  <th className="text-right font-medium pb-2">ساعات العمل</th>
                </tr>
              </thead>
              <tbody>
                {mockDailyReps.map((r) => (
                  <tr key={r.name} className="border-b last:border-0">
                    <td className="py-2 font-semibold">{r.name}</td>
                    <td className="py-2">{r.shipments}</td>
                    <td className="py-2">{r.delivered}</td>
                    <td className="py-2">{r.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ── شاشة المدير التنفيذي ─────────────────────────────────────────── */}
      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-500" /> شاشة المدير التنفيذي — نظرة سريعة
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 text-center">
          <div><div className="text-lg font-black">{fc(mockExecutiveSummary.revenue)}</div><div className="text-[11px] text-muted-foreground">الإيرادات</div></div>
          <div><div className="text-lg font-black">{fc(mockExecutiveSummary.profit)}</div><div className="text-[11px] text-muted-foreground">الأرباح</div></div>
          <div><div className="text-lg font-black text-emerald-500">{mockExecutiveSummary.growthRate}%</div><div className="text-[11px] text-muted-foreground">معدل النمو</div></div>
          <div><div className="text-lg font-black">{fn(mockExecutiveSummary.clientsCount)}</div><div className="text-[11px] text-muted-foreground">عدد العملاء</div></div>
          <div><div className="text-lg font-black">{fn(mockExecutiveSummary.shipmentsCount)}</div><div className="text-[11px] text-muted-foreground">عدد الشحنات</div></div>
          <div><div className="text-lg font-black">{mockExecutiveSummary.successRate}%</div><div className="text-[11px] text-muted-foreground">نسبة النجاح</div></div>
          <div><div className="text-lg font-black">{mockExecutiveSummary.topArea}</div><div className="text-[11px] text-muted-foreground">أكثر المناطق نشاطاً</div></div>
          <div><div className="text-lg font-black text-blue-500">{fc(mockExecutiveSummary.nextMonthForecast)}</div><div className="text-[11px] text-muted-foreground">توقعات الشهر القادم</div></div>
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
