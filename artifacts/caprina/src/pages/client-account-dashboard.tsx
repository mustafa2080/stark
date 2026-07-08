import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users, Package, CheckCircle2, Clock, Warehouse, AlertTriangle,
  RotateCcw, TrendingUp, Crown, ThumbsDown, Search,
  ArrowRight, Phone, MapPin, Sparkles,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector,
} from "recharts";
import { Badge } from "@/components/ui/badge";

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmt  = (v: number) => Number(v).toLocaleString("ar-EG", { maximumFractionDigits: 0 });
const fmtF = (v: number) => Number(v).toLocaleString("ar-EG", { maximumFractionDigits: 0 }) + " ج.م";

// ─── Animated Counter ─────────────────────────────────────────────────────────
function AnimNum({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const start = ref.current; const diff = value - start;
    const dur = 900; const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + diff * ease));
      if (t < 1) requestAnimationFrame(step); else ref.current = value;
    };
    requestAnimationFrame(step);
  }, [value]);
  return <>{display.toLocaleString("ar-EG")}</>;
}

// ─── KPI Themes (Glow + Shadow + Gradient) ───────────────────────────────────
const THEMES: Record<string, {
  grad: string; border: string; shadow: string;
  iconBg: string; iconBorder: string; topLine: string; orb: string; hex: string;
}> = {
  blue: {
    grad: "linear-gradient(135deg, rgba(59,130,246,0.13) 0%, rgba(96,165,250,0.05) 60%, rgba(0,0,0,0) 100%)",
    border: "rgba(59,130,246,0.35)",
    shadow: "0 0 0 1px rgba(59,130,246,0.15), 0 8px 40px rgba(59,130,246,0.22), 0 2px 8px rgba(59,130,246,0.10)",
    iconBg: "linear-gradient(135deg,rgba(59,130,246,0.28),rgba(96,165,250,0.12))",
    iconBorder: "rgba(59,130,246,0.45)",
    topLine: "linear-gradient(90deg,transparent,#3b82f6,transparent)",
    orb: "rgba(59,130,246,0.12)", hex: "#3b82f6",
  },
  emerald: {
    grad: "linear-gradient(135deg, rgba(16,185,129,0.13) 0%, rgba(52,211,153,0.05) 60%, rgba(0,0,0,0) 100%)",
    border: "rgba(16,185,129,0.35)",
    shadow: "0 0 0 1px rgba(16,185,129,0.15), 0 8px 40px rgba(16,185,129,0.22), 0 2px 8px rgba(16,185,129,0.10)",
    iconBg: "linear-gradient(135deg,rgba(16,185,129,0.28),rgba(52,211,153,0.12))",
    iconBorder: "rgba(16,185,129,0.45)",
    topLine: "linear-gradient(90deg,transparent,#10b981,transparent)",
    orb: "rgba(16,185,129,0.12)", hex: "#10b981",
  },
  violet: {
    grad: "linear-gradient(135deg, rgba(167,139,250,0.13) 0%, rgba(192,132,252,0.05) 60%, rgba(0,0,0,0) 100%)",
    border: "rgba(167,139,250,0.35)",
    shadow: "0 0 0 1px rgba(167,139,250,0.15), 0 8px 40px rgba(167,139,250,0.22), 0 2px 8px rgba(167,139,250,0.10)",
    iconBg: "linear-gradient(135deg,rgba(167,139,250,0.28),rgba(192,132,252,0.12))",
    iconBorder: "rgba(167,139,250,0.45)",
    topLine: "linear-gradient(90deg,transparent,#a78bfa,transparent)",
    orb: "rgba(167,139,250,0.12)", hex: "#a78bfa",
  },
  amber: {
    grad: "linear-gradient(135deg, rgba(245,158,11,0.13) 0%, rgba(251,191,36,0.05) 60%, rgba(0,0,0,0) 100%)",
    border: "rgba(245,158,11,0.35)",
    shadow: "0 0 0 1px rgba(245,158,11,0.15), 0 8px 40px rgba(245,158,11,0.22), 0 2px 8px rgba(245,158,11,0.10)",
    iconBg: "linear-gradient(135deg,rgba(245,158,11,0.28),rgba(251,191,36,0.12))",
    iconBorder: "rgba(245,158,11,0.45)",
    topLine: "linear-gradient(90deg,transparent,#f59e0b,transparent)",
    orb: "rgba(245,158,11,0.12)", hex: "#f59e0b",
  },
  rose: {
    grad: "linear-gradient(135deg, rgba(244,63,94,0.13) 0%, rgba(251,113,133,0.05) 60%, rgba(0,0,0,0) 100%)",
    border: "rgba(244,63,94,0.35)",
    shadow: "0 0 0 1px rgba(244,63,94,0.15), 0 8px 40px rgba(244,63,94,0.22), 0 2px 8px rgba(244,63,94,0.10)",
    iconBg: "linear-gradient(135deg,rgba(244,63,94,0.28),rgba(251,113,133,0.12))",
    iconBorder: "rgba(244,63,94,0.45)",
    topLine: "linear-gradient(90deg,transparent,#f43f5e,transparent)",
    orb: "rgba(244,63,94,0.12)", hex: "#f43f5e",
  },
  cyan: {
    grad: "linear-gradient(135deg, rgba(56,189,248,0.13) 0%, rgba(103,232,249,0.05) 60%, rgba(0,0,0,0) 100%)",
    border: "rgba(56,189,248,0.35)",
    shadow: "0 0 0 1px rgba(56,189,248,0.15), 0 8px 40px rgba(56,189,248,0.22), 0 2px 8px rgba(56,189,248,0.10)",
    iconBg: "linear-gradient(135deg,rgba(56,189,248,0.28),rgba(103,232,249,0.12))",
    iconBorder: "rgba(56,189,248,0.45)",
    topLine: "linear-gradient(90deg,transparent,#38bdf8,transparent)",
    orb: "rgba(56,189,248,0.12)", hex: "#38bdf8",
  },
};

function KpiCard({ label, value, sub, icon: Icon, theme, isMoney }: {
  label: string; value: number; sub?: string; icon: any; theme: keyof typeof THEMES; isMoney?: boolean;
}) {
  const t = THEMES[theme];
  return (
    <div
      className="rounded-[22px] p-4 sm:p-5 relative overflow-hidden group transition-all duration-300 hover:-translate-y-1.5"
      style={{ background: t.grad, border: `1px solid ${t.border}`, boxShadow: t.shadow, backdropFilter: "blur(14px)" }}
    >
      <div className="absolute inset-x-8 top-0 h-px pointer-events-none" style={{ background: t.topLine }} />
      <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full pointer-events-none transition-opacity duration-300 group-hover:opacity-100 opacity-70"
        style={{ background: `radial-gradient(circle, ${t.orb} 0%, transparent 70%)` }} />
      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-3 sm:mb-4 relative z-10"
        style={{ background: t.iconBg, border: `1px solid ${t.iconBorder}`, boxShadow: `0 4px 14px ${t.orb}, inset 0 1px 0 rgba(255,255,255,0.15)` }}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: t.hex, filter: `drop-shadow(0 0 6px ${t.hex}88)` }} />
      </div>
      <p className="text-[11px] sm:text-xs text-muted-foreground mb-1 font-semibold relative z-10 tracking-wide">{label}</p>
      <p className="text-xl sm:text-2xl font-black relative z-10 leading-tight" style={{ color: t.hex, textShadow: `0 0 20px ${t.hex}55` }}>
        <AnimNum value={value} />
        {isMoney && <span className="text-[10px] sm:text-xs font-normal text-muted-foreground mr-1">ج.م</span>}
      </p>
      {sub && <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 pt-2 relative z-10" style={{ borderTop: `1px solid ${t.border}` }}>{sub}</p>}
    </div>
  );
}

// ─── Active Pie Sector (hover fade-in / fade-out grow) ───────────────────────
function renderActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g style={{ transition: "all 0.25s ease-out" }}>
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: `drop-shadow(0 0 10px ${fill}aa)`, transition: "all 0.25s ease-out" }}
      />
    </g>
  );
}

// ─── Client Rank Row (Top / Least) ───────────────────────────────────────────
function ClientRankRow({ client, rank, positive }: { client: any; rank: number; positive: boolean }) {
  const [, navigate] = useLocation();
  const medal = ["🥇", "🥈", "🥉"][rank] ?? `#${rank + 1}`;
  return (
    <button
      onClick={() => navigate(`/finance/clients/${client.id}`)}
      className="w-full flex items-center gap-3 p-3 rounded-xl text-right transition-all hover:-translate-y-0.5"
      style={{
        background: positive ? "rgba(16,185,129,0.06)" : "rgba(244,63,94,0.06)",
        border: `1px solid ${positive ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)"}`,
      }}
    >
      <span className="text-lg font-black w-7 text-center shrink-0">{medal}</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{client.name}</p>
        <p className="text-[11px] text-muted-foreground">{client.shipmentsCount} شحنة · {client.deliveryRate}% تسليم</p>
      </div>
      <p className="text-sm font-black shrink-0" style={{ color: positive ? "#10b981" : "#f43f5e" }}>
        {fmtF(client.totalAmount)}
      </p>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientAccountDashboardPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["finance-clients-dashboard"],
    queryFn: () => apiFetch("/finance/clients-dashboard"),
    staleTime: 60_000,
  });

  const totals = data?.totals ?? {
    clients: 0, active: 0, shipments: 0, delivered: 0, waiting: 0, inWarehouse: 0, delayed: 0, returned: 0, revenue: 0, collected: 0,
  };
  const topClients: any[] = data?.topClients ?? [];
  const leastClients: any[] = data?.leastClients ?? [];
  const statusBreakdown: any[] = data?.statusBreakdown ?? [];
  const allClients: any[] = data?.clients ?? [];

  const filteredClients = allClients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/finance/clients")}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              داشبورد حسابات العملاء
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">تحليل شامل لأداء وشحنات كل العملاء التجاريين</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-muted-foreground text-sm">جاري تحميل الداشبورد...</div>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard label="إجمالي العملاء" value={totals.clients} sub={`${totals.active} نشط`} icon={Users} theme="blue" />
            <KpiCard label="إجمالي الشحنات" value={totals.shipments} icon={Package} theme="violet" />
            <KpiCard label="تم التسليم" value={totals.delivered} sub={totals.shipments ? `${Math.round((totals.delivered/totals.shipments)*100)}% من الإجمالي` : undefined} icon={CheckCircle2} theme="emerald" />
            <KpiCard label="قيد الانتظار" value={totals.waiting} icon={Clock} theme="cyan" />
            <KpiCard label="قيد الشحن بالمخزن" value={totals.inWarehouse} icon={Warehouse} theme="violet" />
            <KpiCard label="مؤجل" value={totals.delayed} icon={AlertTriangle} theme="amber" />
            <KpiCard label="مرتجع" value={totals.returned} icon={RotateCcw} theme="rose" />
            <KpiCard label="إجمالي المبيعات" value={totals.revenue} isMoney icon={TrendingUp} theme="emerald" />
          </div>

          {/* Status Distribution + Top/Least Clients */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Status Chart */}
            <div className="lg:col-span-1 rounded-2xl p-4 sm:p-5 relative overflow-hidden"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />توزيع حالات الشحنات
              </h3>
              {totals.shipments === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">لا توجد بيانات كافية</p>
              ) : (
                <>
                  <div className="h-[220px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusBreakdown}
                          dataKey="count"
                          nameKey="label"
                          innerRadius={62}
                          outerRadius={92}
                          paddingAngle={3}
                          cornerRadius={4}
                          activeIndex={activeIndex}
                          activeShape={renderActiveShape}
                          onMouseEnter={(_, i) => setActiveIndex(i)}
                          onMouseLeave={() => setActiveIndex(undefined)}
                        >
                          {statusBreakdown.map((s, i) => (
                            <Cell
                              key={i}
                              fill={s.color}
                              style={{
                                cursor: "pointer",
                                opacity: activeIndex === undefined || activeIndex === i ? 1 : 0.35,
                                transition: "opacity 0.25s ease-out",
                              }}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
                          formatter={(v: any, n: any) => [`${v} شحنة`, n]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center total (aligned with donut hole) */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl sm:text-3xl font-black leading-none">
                        <AnimNum value={totals.shipments} />
                      </span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground mt-1">إجمالي الشحنات</span>
                    </div>
                  </div>
                  <div className="space-y-1 mt-2">
                    {statusBreakdown.map((s, i) => (
                      <div
                        key={s.status}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseLeave={() => setActiveIndex(undefined)}
                        className="flex items-center justify-between text-xs rounded-lg px-2 py-1.5 transition-all duration-200 cursor-pointer"
                        style={{
                          background: activeIndex === i ? `${s.color}1a` : "transparent",
                          opacity: activeIndex === undefined || activeIndex === i ? 1 : 0.5,
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="px-1.5 py-0.5 rounded-md font-bold text-[10px]"
                            style={{ background: `${s.color}22`, color: s.color }}
                          >
                            {s.percentage}%
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded-md font-bold text-[10px]"
                            style={{ background: `${s.color}33`, color: s.color }}
                          >
                            {s.count}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5 font-semibold">
                          {s.label}
                          <span
                            className="w-2.5 h-2.5 rounded-full transition-transform duration-200"
                            style={{ background: s.color, transform: activeIndex === i ? "scale(1.3)" : "scale(1)" }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Top Clients */}
            <div className="lg:col-span-1 rounded-2xl p-4 sm:p-5"
              style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Crown className="w-4 h-4" style={{ color: "#10b981" }} />أفضل العملاء
              </h3>
              {topClients.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">لا يوجد بيانات كافية بعد</p>
              ) : (
                <div className="space-y-2">
                  {topClients.map((c, i) => <ClientRankRow key={c.id} client={c} rank={i} positive />)}
                </div>
              )}
            </div>

            {/* Least Clients */}
            <div className="lg:col-span-1 rounded-2xl p-4 sm:p-5"
              style={{ background: "rgba(244,63,94,0.04)", border: "1px solid rgba(244,63,94,0.15)" }}>
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <ThumbsDown className="w-4 h-4" style={{ color: "#f43f5e" }} />أقل العملاء نشاطًا
              </h3>
              {leastClients.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">لا يوجد بيانات كافية بعد</p>
              ) : (
                <div className="space-y-2">
                  {leastClients.map((c, i) => <ClientRankRow key={c.id} client={c} rank={i} positive={false} />)}
                </div>
              )}
            </div>
          </div>

          {/* Full Clients Table */}
          <div className="rounded-2xl p-4 sm:p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />كل العملاء ({filteredClients.length})
              </h3>
              <div className="relative w-full sm:w-64">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالاسم أو الهاتف أو المدينة..."
                  className="w-full rounded-lg bg-white/5 border border-white/10 pr-8 pl-3 py-1.5 text-xs outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>

            {filteredClients.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">لا توجد نتائج مطابقة</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="text-muted-foreground border-b border-white/10">
                      <th className="text-right py-2 font-semibold">العميل</th>
                      <th className="text-center py-2 font-semibold">الشحنات</th>
                      <th className="text-center py-2 font-semibold">مسلّم</th>
                      <th className="text-center py-2 font-semibold">مخزن</th>
                      <th className="text-center py-2 font-semibold">مؤجل</th>
                      <th className="text-center py-2 font-semibold">مرتجع</th>
                      <th className="text-center py-2 font-semibold">نسبة التسليم</th>
                      <th className="text-left py-2 font-semibold">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/finance/clients/${c.id}`)}
                        className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
                      >
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-bold">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                                {c.phone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{c.phone}</span>}
                                {c.city && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{c.city}</span>}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center font-bold">{fmt(c.shipmentsCount)}</td>
                        <td className="text-center"><Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">{c.delivered}</Badge></td>
                        <td className="text-center"><Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400">{c.inWarehouse}</Badge></td>
                        <td className="text-center"><Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500">{c.delayed}</Badge></td>
                        <td className="text-center"><Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-500">{c.returned}</Badge></td>
                        <td className="text-center font-bold">{c.deliveryRate}%</td>
                        <td className="text-left font-black" style={{ color: "#10b981" }}>{fmtF(c.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
