import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { shipmentsApi, analyticsApi, Shipment, ShipmentChartsData } from "@/lib/api";
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Sector,
} from "recharts";
import {
  Package, TrendingUp, TrendingDown, DollarSign, AlertCircle,
  Search, Filter, ArrowUpRight, ArrowDownRight, Truck, Clock,
  CheckCircle2, XCircle, RotateCcw, MapPin, ChevronDown,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("ar-EG").format(Math.round(n));

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; glow: string }> = {
  waiting:          { label: "قيد الانتظار",  color: "#f59e0b", bg: "bg-amber-500/10",   glow: "shadow-amber-500/20" },
  in_transit:       { label: "قيد الشحن",     color: "#3b82f6", bg: "bg-blue-500/10",    glow: "shadow-blue-500/20" },
  delivered:        { label: "تم التوصيل",    color: "#10b981", bg: "bg-emerald-500/10", glow: "shadow-emerald-500/20" },
  partial_delivered:{ label: "توصيل جزئي",   color: "#06b6d4", bg: "bg-cyan-500/10",    glow: "shadow-cyan-500/20" },
  returned:         { label: "مرتجع",         color: "#ef4444", bg: "bg-red-500/10",     glow: "shadow-red-500/20" },
  partial_returned: { label: "مرتجع جزئي",   color: "#f97316", bg: "bg-orange-500/10",  glow: "shadow-orange-500/20" },
  cancelled:        { label: "ملغي",          color: "#6b7280", bg: "bg-gray-500/10",    glow: "shadow-gray-500/20" },
};

// ─── Pie active shape with animation ─────────────────────────────────────────
const renderActiveShape = (props: any) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value,
  } = props;
  return (
    <g>
      <text x={cx} y={cy - 10} textAnchor="middle" fill="#ffffff" className="text-sm font-bold" style={{ fontSize: 16, fontWeight: 700 }}>
        {value}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#9ca3af" style={{ fontSize: 11 }}>
        {(percent * 100).toFixed(1)}%
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 12} outerRadius={outerRadius + 16}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.4} />
    </g>
  );
};


// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, sub, color, trend, trendVal,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color: string; trend?: "up" | "down"; trendVal?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5
        shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5`}
      style={{ boxShadow: `0 4px 24px -4px ${color}33` }}
    >
      {/* glow orb */}
      <div
        className="absolute -top-6 -right-6 h-24 w-24 rounded-full opacity-20 blur-2xl"
        style={{ background: color }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
          {trendVal && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
              {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {trendVal}
            </div>
          )}
        </div>
        <div className="rounded-xl p-2.5" style={{ background: `${color}22` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
    </div>
  );
}


// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: "#9ca3af", bg: "bg-gray-500/10", glow: "" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg}`}
      style={{ color: s.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

// ─── Tooltip custom ──────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/90 backdrop-blur-sm px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-medium">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};


// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ShipmentPerformancePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [chartMode, setChartMode] = useState<"weekly" | "monthly">("weekly");
  const [activePieIndex, setActivePieIndex] = useState(0);
  const onPieEnter = useCallback((_: any, index: number) => setActivePieIndex(index), []);

  const { data: statsRaw } = useQuery({ queryKey: ["shipments-stats"], queryFn: () => shipmentsApi.stats() });
  const { data: charts }   = useQuery<ShipmentChartsData>({ queryKey: ["shipment-charts"], queryFn: () => analyticsApi.shipmentCharts() });
  const { data: listRaw, isLoading } = useQuery({
    queryKey: ["shipments-list-perf", statusFilter],
    queryFn: () => shipmentsApi.list({ status: statusFilter === "all" ? undefined : statusFilter, limit: 200 }),
  });

  const shipments: Shipment[] = listRaw?.data ?? [];

  // KPI calculations
  const stats = useMemo(() => {
    const total      = shipments.length || listRaw?.total || 0;
    const delivered  = shipments.filter(s => s.status === "delivered").length;
    const returned   = shipments.filter(s => s.status === "returned" || s.status === "partial_returned").length;
    const inTransit  = shipments.filter(s => s.status === "in_transit").length;
    const cod        = shipments.reduce((a, s) => a + parseFloat(s.codAmount || "0"), 0);
    const collected  = shipments.reduce((a, s) => a + parseFloat(s.collectedAmount || "0"), 0);
    const fee        = shipments.reduce((a, s) => a + parseFloat(s.shippingFee || "0"), 0);
    const delivRate  = total ? Math.round((delivered / total) * 100) : 0;
    return { total, delivered, returned, inTransit, cod, collected, fee, delivRate };
  }, [shipments, listRaw]);

  // Status pie data
  const pieData = useMemo(() => {
    const counts: Record<string, number> = {};
    shipments.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_MAP[status]?.label ?? status,
      value: count,
      color: STATUS_MAP[status]?.color ?? "#9ca3af",
    }));
  }, [shipments]);

  // chart data
  const chartData = chartMode === "weekly"
    ? (charts?.weeklyShipments ?? [])
    : (charts?.monthlyShipments ?? []);

  // week comparison
  const wc = charts?.weekComparison;

  // filtered table
  const filtered = useMemo(() =>
    shipments.filter(s =>
      !search ||
      s.shipmentNumber.toLowerCase().includes(search.toLowerCase()) ||
      s.senderName.toLowerCase().includes(search.toLowerCase()) ||
      s.receiverName.toLowerCase().includes(search.toLowerCase()) ||
      (s.receiverCity ?? "").toLowerCase().includes(search.toLowerCase())
    ),
    [shipments, search]
  );


  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-4 md:p-6 space-y-6" dir="rtl">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-l from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            أداء الشحنات
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">تحليل مالي شامل لحركة الشحنات</p>
        </div>

        {/* week comparison badges */}
        {wc && (
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs">
              <span className="text-gray-400">هذا الأسبوع:</span>
              <span className="font-bold text-white">{wc.thisWeek.count} شحنة</span>
              {wc.countChange !== null && (
                <span className={wc.countChange >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {wc.countChange >= 0 ? "▲" : "▼"} {Math.abs(wc.countChange)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs">
              <span className="text-gray-400">COD الأسبوع:</span>
              <span className="font-bold text-cyan-300">{fmt(wc.thisWeek.codAmount)} ج.م</span>
              {wc.codChange !== null && (
                <span className={wc.codChange >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {wc.codChange >= 0 ? "▲" : "▼"} {Math.abs(wc.codChange)}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KpiCard icon={Package}      label="إجمالي الشحنات"   value={fmt(stats.total)}      color="#3b82f6" />
        <KpiCard icon={CheckCircle2} label="تم التوصيل"        value={fmt(stats.delivered)}  color="#10b981"
          sub={`${stats.delivRate}% معدل التوصيل`}
          trend={stats.delivRate >= 70 ? "up" : "down"} trendVal={`${stats.delivRate}%`} />
        <KpiCard icon={DollarSign}   label="إجمالي COD"        value={`${fmt(stats.cod)} ج.م`}     color="#f59e0b" />
        <KpiCard icon={TrendingUp}   label="محصّل فعلي"         value={`${fmt(stats.collected)} ج.م`} color="#06b6d4" />
        <KpiCard icon={Truck}        label="قيد الشحن"         value={fmt(stats.inTransit)}   color="#8b5cf6" />
        <KpiCard icon={RotateCcw}    label="مرتجعات"           value={fmt(stats.returned)}    color="#ef4444" />
        <KpiCard icon={DollarSign}   label="رسوم الشحن"        value={`${fmt(stats.fee)} ج.م`}     color="#f97316" />
        <KpiCard icon={MapPin}       label="الشحنات الفلترة"   value={fmt(filtered.length)}   color="#6366f1" />
      </div>


      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Area / Line Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5"
          style={{ boxShadow: "0 4px 32px -8px #3b82f633" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">حركة الشحنات</h2>
            <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
              {(["weekly","monthly"] as const).map(m => (
                <button key={m}
                  onClick={() => setChartMode(m)}
                  className={`px-3 py-1.5 transition-colors ${chartMode === m ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                  {m === "weekly" ? "أسبوعي" : "شهري"}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="linear" dataKey="count" name="عدد الشحنات"
                stroke="#3b82f6" strokeWidth={2.5}
                dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
                activeDot={{ r: 7, fill: "#3b82f6", stroke: "#ffffff22", strokeWidth: 3 }}
                animationDuration={800} animationEasing="ease-out"
              />
              <Line
                type="linear" dataKey="codAmount" name="COD"
                stroke="#06b6d4" strokeWidth={2.5}
                dot={{ r: 4, fill: "#06b6d4", strokeWidth: 0 }}
                activeDot={{ r: 7, fill: "#06b6d4", stroke: "#ffffff22", strokeWidth: 3 }}
                animationDuration={1000} animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5"
          style={{ boxShadow: "0 4px 32px -8px #10b98133" }}>
          <h2 className="text-sm font-semibold text-white mb-4">توزيع الحالات</h2>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="50%"
                    innerRadius={52} outerRadius={75}
                    paddingAngle={3} dataKey="value"
                    activeIndex={activePieIndex}
                    activeShape={renderActiveShape}
                    onMouseEnter={onPieEnter}
                    animationBegin={0} animationDuration={900} animationEasing="ease-out"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" opacity={activePieIndex === i ? 1 : 0.75} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {pieData.map((d, i) => (
                  <div
                    key={i}
                    onMouseEnter={() => setActivePieIndex(i)}
                    className={`flex items-center justify-between text-xs rounded-lg px-2 py-1 cursor-pointer transition-all duration-200
                      ${activePieIndex === i ? "bg-white/10" : "hover:bg-white/5"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full transition-transform duration-200"
                        style={{ background: d.color, transform: activePieIndex === i ? "scale(1.4)" : "scale(1)" }} />
                      <span className={activePieIndex === i ? "text-white font-medium" : "text-gray-400"}>{d.name}</span>
                    </div>
                    <span className="font-medium" style={{ color: activePieIndex === i ? d.color : "#ffffff" }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">لا توجد بيانات</div>
          )}
        </div>
      </div>


      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث برقم الشحنة، المرسِل، المستلِم، المدينة..."
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pr-10 pl-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="relative">
          <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none rounded-xl border border-white/10 bg-white/5 py-2.5 pr-10 pl-8 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
          >
            <option value="all" className="bg-gray-900">كل الحالات</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <option key={k} value={k} className="bg-gray-900">{v.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden"
        style={{ boxShadow: "0 4px 32px -8px #6366f133" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">جدول الشحنات التفصيلي</h2>
          <span className="text-xs text-gray-400 bg-white/5 px-2.5 py-1 rounded-full">
            {fmt(filtered.length)} شحنة
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 text-sm gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            جاري التحميل...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-sm gap-2">
            <Package className="h-8 w-8 opacity-30" />
            لا توجد شحنات
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-500">
                  <th className="text-right px-4 py-3 font-medium">رقم الشحنة</th>
                  <th className="text-right px-4 py-3 font-medium">المرسِل</th>
                  <th className="text-right px-4 py-3 font-medium">المستلِم</th>
                  <th className="text-right px-4 py-3 font-medium">المدينة</th>
                  <th className="text-right px-4 py-3 font-medium">COD</th>
                  <th className="text-right px-4 py-3 font-medium">رسوم الشحن</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.slice(0, 100).map(s => (
                  <tr key={s.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-blue-400">{s.shipmentNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-white">{s.senderName}</td>
                    <td className="px-4 py-3 text-gray-300">{s.receiverName}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-400 text-xs">
                        <MapPin className="h-3 w-3" />{s.receiverCity ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-amber-400 font-medium">{fmt(parseFloat(s.codAmount || "0"))}</td>
                    <td className="px-4 py-3 text-cyan-400">{fmt(parseFloat(s.shippingFee || "0"))}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(s.createdAt).toLocaleDateString("ar-EG", { day:"2-digit", month:"short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <div className="text-center py-3 text-xs text-gray-500 border-t border-white/5">
                يُعرض أول 100 نتيجة من {fmt(filtered.length)}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
