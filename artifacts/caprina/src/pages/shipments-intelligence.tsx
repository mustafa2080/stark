
// ─── شريط التنبيهات الذكية — مولّدة تلقائيًا من الباك اند حسب حالة الأرقام ───
function AlertsBanner({ alerts }: { alerts: ShipmentsIntelligenceResponse["alerts"] }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const meta = ALERT_META[a.level] ?? ALERT_META.info;
        const Icon = meta.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.06 }}
            className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
            style={{ background: meta.bg, borderColor: `${meta.color}33` }}
          >
            <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
            <p className="text-xs font-medium text-gray-200">{a.message}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── حاوية قسم زجاجية موحّدة لكل الصفحة ──────────────────────────────────────
function SectionCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className="rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-sm p-4 md:p-5"
      style={{ boxShadow: "0 8px 30px -12px rgba(0,0,0,0.5)" }}
    >
      {children}
    </motion.div>
  );
}

// ─── KPI Card صغير — للصف العلوي، مع مقارنة اتجاه لو موجودة ─────────────────
function KpiTile({
  icon: Icon, label, value, sub, color, delay,
}: { icon: any; label: string; value: string; sub?: string; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
      whileHover={{ y: -3 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-4 transition-shadow duration-300"
      style={{ boxShadow: `0 4px 20px -6px ${color}30` }}
    >
      <div className="absolute -top-8 -left-8 h-20 w-20 rounded-full opacity-25 blur-2xl" style={{ background: color }} />
      <div className="relative flex items-center justify-between mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}1f` }}>
          <Icon className="w-4.5 h-4.5" style={{ color }} />
        </div>
      </div>
      <p className="relative text-[11px] font-medium text-gray-400 mb-0.5">{label}</p>
      <p className="relative text-xl font-black text-white tabular-nums">{value}</p>
      {sub && <p className="relative text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </motion.div>
  );
}

// ─── عنوان قسم موحّد مع وصف تفصيلي دايمًا يشرح الرقم إيه معناه ──────────────
function SectionHeader({ icon: Icon, title, subtitle, color, badge }: { icon: any; title: string; subtitle?: string; color: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-2.5 mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1f`, boxShadow: `0 0 14px -4px ${color}55` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {badge && (
        <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={{ color, background: `${color}18` }}>
          {badge}
        </span>
      )}
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1220]/95 backdrop-blur-md px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-gray-400 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="font-bold text-white">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── توزيع الحالات — Donut تفاعلي مع تفاصيل رقمية كاملة لكل حالة ────────────
function StatusDonut({ data }: { data: ShipmentsIntelligenceResponse["statusDistribution"] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
      <div className="relative h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="label"
              cx="50%" cy="50%" innerRadius={62} outerRadius={92}
              paddingAngle={2} cornerRadius={6}
              isAnimationActive animationDuration={900}
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.status}
                  fill={d.color}
                  stroke="none"
                  style={{
                    filter: active === i ? `drop-shadow(0 0 10px ${d.color}aa)` : "none",
                    opacity: active === null || active === i ? 1 : 0.45,
                    transition: "all .25s ease",
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-white">{fmt(total)}</span>
          <span className="text-[10px] text-gray-500">إجمالي الشحنات</span>
        </div>
      </div>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div
            key={d.status}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors"
            style={{ background: active === i ? `${d.color}14` : "transparent" }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color, boxShadow: `0 0 6px ${d.color}88` }} />
              <span className="text-xs text-gray-300">{d.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tabular-nums">{fmt(d.value)}</span>
              <span className="text-[10px] text-gray-500 w-8 text-left">{d.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ترند الشحنات على مدار الفترة — يومي مع مقارنة إجمالي/تسليم/مرتجع ───────
function TrendChart({ data }: { data: ShipmentsIntelligenceResponse["trend"] }) {
  const chartData = data.map(d => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="siTotalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="siDeliveredGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="siReturnedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="dateLabel" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="total" name="إجمالي" stroke="#a78bfa" strokeWidth={2} fill="url(#siTotalGrad)" isAnimationActive animationDuration={900} />
        <Area type="monotone" dataKey="delivered" name="تم التسليم" stroke="#22c55e" strokeWidth={2} fill="url(#siDeliveredGrad)" isAnimationActive animationDuration={900} />
        <Area type="monotone" dataKey="returned" name="مرتجع" stroke="#ef4444" strokeWidth={2} fill="url(#siReturnedGrad)" isAnimationActive animationDuration={900} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── أعمار الشحنات المعلقة حاليًا — تفصيل زمني كامل مش رقم واحد ─────────────
function AgingBars({ data }: { data: ShipmentsIntelligenceResponse["agingAnalysis"] }) {
  const colors = ["#22c55e", "#eab308", "#f97316", "#ef4444"];
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={26} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="count" name="عدد الشحنات" radius={[8, 8, 0, 0]} isAnimationActive animationDuration={900}>
            {data.map((d, i) => <Cell key={d.key} fill={colors[i] ?? "#94a3b8"} />)}
            <LabelList dataKey="count" position="top" fill="#e5e7eb" fontSize={11} fontWeight={700} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-gray-500 text-center mt-1">
        إجمالي الشحنات المعلقة حاليًا: <span className="text-white font-bold">{fmt(total)}</span> شحنة
      </p>
    </div>
  );
}

// ─── صف مُرتّب بشريط تقدّم — نظرة سريعة على العنصر ──────────────────────────
function RankedRow({
  rank, title, subtitle, value, valueLabel, pct, pctColor, icon: Icon, delay,
}: {
  rank: number; title: string; subtitle?: string; value: string; valueLabel: string;
  pct: number; pctColor: string; icon: any; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className="group relative rounded-xl border border-white/8 bg-white/[0.02] p-3 hover:bg-white/[0.05] hover:border-white/15 transition-all duration-300"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-white/5 text-[11px] font-bold text-gray-400">
            {rank}
          </div>
          <Icon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{title}</p>
            {subtitle && <p className="text-[10px] text-gray-500 truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="text-left shrink-0">
          <p className="text-xs font-bold text-white tabular-nums">{value}</p>
          <p className="text-[10px] text-gray-500">{valueLabel}</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          transition={{ duration: 0.8, delay: delay + 0.1, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: pctColor, boxShadow: `0 0 8px ${pctColor}88` }}
        />
      </div>
    </motion.div>
  );
}

// ─── جدول تفصيلي — كل الأرقام لكل عنصر جنب بعض (مش تلخيص، تفصيل كامل) ───────
function DetailTable({
  columns, rows, accentColor,
}: {
  columns: { key: string; label: string; align?: "right" | "left" | "center" }[];
  rows: Array<Record<string, any>>;
  accentColor: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-white/[0.04] border-b border-white/8">
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-3 py-2.5 font-bold text-gray-400 whitespace-nowrap ${
                  col.align === "left" ? "text-left" : col.align === "center" ? "text-center" : "text-right"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors"
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`px-3 py-2.5 whitespace-nowrap ${
                    col.align === "left" ? "text-left" : col.align === "center" ? "text-center" : "text-right"
                  } ${col.key === columns[0].key ? "font-semibold text-white" : "text-gray-300 tabular-nums"}`}
                  style={col.key === "successRate" || col.key === "returnRate" ? { color: row[`${col.key}Color`] ?? undefined } : undefined}
                >
                  {row[col.key]}
                </td>
              ))}
            </motion.tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-gray-500">لا توجد بيانات كافية للفترة المختارة</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── تلوين ديناميكي حسب قيمة النسبة (نجاح = أخضر، خطر = أحمر) ───────────────
function rateColor(pct: number, inverted = false): string {
  const p = inverted ? 100 - pct : pct;
  if (p >= 80) return "#22c55e";
  if (p >= 60) return "#38bdf8";
  if (p >= 40) return "#f59e0b";
  return "#ef4444";
}

// ─── أسباب المرتجعات — تفصيل كامل لكل سبب بالعدد والنسبة وشريط مقارنة ────────
function ReturnReasonsBreakdown({ data }: { data: ShipmentsIntelligenceResponse["returnReasons"] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  if (data.length === 0) {
    return <p className="text-center text-gray-500 text-xs py-10">لا توجد مرتجعات مسجّلة في هذه الفترة 🎉</p>;
  }
  return (
    <div className="space-y-2.5">
      {data.map((r, i) => (
        <motion.div
          key={r.reason}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05 }}
          className="rounded-lg border border-white/8 bg-white/[0.02] p-3"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-white">{r.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-400 tabular-nums">{fmt(r.count)}</span>
              <span className="text-[10px] text-gray-500">({r.pct}%)</span>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(r.count / maxCount) * 100}%` }}
              transition={{ duration: 0.7, delay: i * 0.05 + 0.1 }}
              className="h-full rounded-full bg-gradient-to-l from-red-500 to-orange-400"
              style={{ boxShadow: "0 0 8px rgba(239,68,68,0.5)" }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── النبض المالي — تفصيل كامل: متوقع/محصّل/فرق/نسبة تحصيل/مزيج طرق الدفع ───
function FinancialPulsePanel({ data }: { data: ShipmentsIntelligenceResponse["financialPulse"] }) {
  const gap = data.codExpected - data.codCollected;
  const mixTotal = data.paymentMix.cod + data.paymentMix.prepaid + data.paymentMix.deferred || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="text-[10px] text-gray-500 mb-1">المبلغ المتوقع تحصيله (COD)</p>
          <p className="text-lg font-black text-white">{fc(data.codExpected)}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="text-[10px] text-gray-500 mb-1">المبلغ المحصَّل فعليًا</p>
          <p className="text-lg font-black text-emerald-400">{fc(data.codCollected)}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="text-[10px] text-gray-500 mb-1">الفرق (لم يُحصّل بعد)</p>
          <p className={`text-lg font-black ${gap > 0 ? "text-amber-400" : "text-emerald-400"}`}>{fc(Math.abs(gap))}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="text-[10px] text-gray-500 mb-1">إجمالي رسوم الشحن</p>
          <p className="text-lg font-black text-cyan-400">{fc(data.shippingFeesTotal)}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-gray-400">نسبة التحصيل</span>
          <span className="text-xs font-bold" style={{ color: rateColor(data.collectionRate) }}>{data.collectionRate}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${data.collectionRate}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: rateColor(data.collectionRate), boxShadow: `0 0 10px ${rateColor(data.collectionRate)}88` }}
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] text-gray-400 mb-2">توزيع طرق الدفع</p>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5">
          <div style={{ width: `${(data.paymentMix.cod / mixTotal) * 100}%`, background: "#f59e0b" }} />
          <div style={{ width: `${(data.paymentMix.prepaid / mixTotal) * 100}%`, background: "#22c55e" }} />
          <div style={{ width: `${(data.paymentMix.deferred / mixTotal) * 100}%`, background: "#a78bfa" }} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />الدفع عند الاستلام: {fmt(data.paymentMix.cod)}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />مدفوع مسبقًا: {fmt(data.paymentMix.prepaid)}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" />آجل: {fmt(data.paymentMix.deferred)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── شريط التنبيهات الذكية — مولّدة تلقائيًا من الباك اند حسب حالة الأرقام ───
function AlertsBanner({ alerts }: { alerts: ShipmentsIntelligenceResponse["alerts"] }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const meta = ALERT_META[a.level] ?? ALERT_META.info;
        const Icon = meta.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.06 }}
            className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
            style={{ background: meta.bg, borderColor: `${meta.color}33` }}
          >
            <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
            <p className="text-xs font-medium text-gray-200">{a.message}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── حاوية قسم زجاجية موحّدة لكل الصفحة ──────────────────────────────────────
function SectionCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className="rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-sm p-4 md:p-5"
      style={{ boxShadow: "0 8px 30px -12px rgba(0,0,0,0.5)" }}
    >
      {children}
    </motion.div>
  );
}

// ─── مفتاح تبديل الفترة الزمنية (اليوم/أسبوع/شهر/سنة) ───────────────────────
function PeriodSwitcher({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            value === p ? "bg-gradient-to-l from-cyan-500/90 to-violet-500/90 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

// ─── الصفحة الرئيسية — تجميع كل الأقسام + فلتر الفترة + حالات التحميل/الخطأ ──
export default function ShipmentsIntelligencePage() {
  const [period, setPeriod] = useState<Period>("month");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["shipments-intelligence", period],
    queryFn: () => analyticsApi.shipmentsIntelligence({ period }),
    staleTime: 60_000,
  });

  const cityRows = useMemo(() => {
    if (!data) return [];
    return data.cityPerformance.map(c => ({
      city: c.city,
      total: fmt(c.total),
      delivered: fmt(c.delivered),
      returned: fmt(c.returned),
      codValue: fc(c.codValue),
      successRate: `${c.successRate}%`,
      successRateColor: rateColor(c.successRate),
      returnRate: `${c.returnRate}%`,
      returnRateColor: rateColor(c.returnRate, true),
    }));
  }, [data]);

  const companyRows = useMemo(() => {
    if (!data) return [];
    return data.companyPerformance.map(c => ({
      companyName: c.companyName,
      total: fmt(c.total),
      delivered: fmt(c.delivered),
      returned: fmt(c.returned),
      successRate: `${c.successRate}%`,
      successRateColor: rateColor(c.successRate),
      returnRate: `${c.returnRate}%`,
      returnRateColor: rateColor(c.returnRate, true),
      avgDeliveryHours: `${c.avgDeliveryHours} س`,
      totalFees: fc(c.totalFees),
    }));
  }, [data]);

  const topCities = useMemo(() => {
    if (!data) return [];
    return [...data.cityPerformance].sort((a, b) => b.total - a.total).slice(0, 6);
  }, [data]);

  const topReps = useMemo(() => {
    if (!data) return [];
    return [...data.repPerformance].sort((a, b) => b.total - a.total).slice(0, 8);
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col items-center justify-center gap-3" dir="rtl">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-sm text-gray-400">جارِ تحليل بيانات الشحنات…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col items-center justify-center gap-3 p-6" dir="rtl">
        <AlertOctagon className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gray-400">تعذّر تحميل تحليل الشحنات، حاول مرة أخرى</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold hover:bg-white/10 transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-4 md:p-6 space-y-6" dir="rtl">
      {/* ── الهيدر ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(56,189,248,0.18), rgba(167,139,250,0.18))",
              boxShadow: "0 0 20px -4px rgba(167,139,250,0.4)",
            }}
          >
            <Brain className="w-5.5 h-5.5 text-violet-300" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              تحليل الشحنات الذكي
              {isFetching && <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />}
            </h1>
            <p className="text-[11px] text-gray-500">
              من {new Date(data.rangeFrom).toLocaleDateString("ar-EG")} إلى {new Date(data.rangeTo).toLocaleDateString("ar-EG")}
            </p>
          </div>
        </div>
        <PeriodSwitcher value={period} onChange={setPeriod} />
      </div>

      {/* ── التنبيهات الذكية ── */}
      <AlertsBanner alerts={data.alerts} />

      {/* ── Hero: Health Score + KPIs ── */}
      <SectionCard>
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
          <HealthScoreGauge score={data.healthScore} grade={data.healthGrade} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile icon={Package} label="إجمالي الشحنات" value={fmt(kpis.total)} color="#a78bfa" delay={0.05} />
            <KpiTile icon={CheckCircle2} label="نسبة التسليم" value={`${kpis.deliveryRate}%`} sub={`${fmt(kpis.delivered)} شحنة`} color="#22c55e" delay={0.1} />
            <KpiTile icon={RotateCcw} label="نسبة المرتجع" value={`${kpis.returnRate}%`} sub={`${fmt(kpis.returned)} شحنة`} color="#ef4444" delay={0.15} />
            <KpiTile icon={Clock} label="الالتزام بالوقت" value={`${kpis.onTimeRate}%`} color="#38bdf8" delay={0.2} />
            <KpiTile icon={Timer} label="متوسط زمن التسليم" value={`${kpis.avgDeliveryHours} س`} sub="من الاستلام للتسليم" color="#f59e0b" delay={0.25} />
            <KpiTile icon={Wallet} label="نسبة التحصيل" value={`${data.financialPulse.collectionRate}%`} color="#f59e0b" delay={0.3} />
            <KpiTile icon={Banknote} label="إجمالي COD محصَّل" value={fc(data.financialPulse.codCollected)} color="#22c55e" delay={0.35} />
            <KpiTile icon={CreditCard} label="إجمالي رسوم الشحن" value={fc(data.financialPulse.shippingFeesTotal)} color="#38bdf8" delay={0.4} />
          </div>
        </div>
      </SectionCard>

      {/* ── توزيع الحالات + الترند الزمني ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard delay={0.05}>
          <SectionHeader icon={PieChartIcon} title="توزيع حالات الشحنات" subtitle="كل الحالات بالعدد والنسبة المئوية" color="#a78bfa" />
          <StatusDonut data={data.statusDistribution} />
        </SectionCard>
        <SectionCard delay={0.1}>
          <SectionHeader icon={Activity} title="الترند الزمني" subtitle="إجمالي الشحنات مقابل التسليم والمرتجع يوميًا" color="#38bdf8" />
          <TrendChart data={data.trend} />
        </SectionCard>
      </div>

      {/* ── أعمار الشحنات المعلقة ── */}
      <SectionCard delay={0.1}>
        <SectionHeader
          icon={Clock}
          title="تحليل أعمار الشحنات المعلقة"
          subtitle="كل الشحنات اللي لسه في الطريق، مقسّمة حسب عدد الأيام من غير تحديث"
          color="#f59e0b"
          badge={`${data.agingAnalysis.reduce((a, d) => a + d.count, 0)} شحنة معلّقة`}
        />
        <AgingBars data={data.agingAnalysis} />
      </SectionCard>

      {/* ── أداء المدن — نظرة سريعة + جدول تفصيلي كامل ── */}
      <SectionCard delay={0.1}>
        <SectionHeader
          icon={MapPin}
          title="أداء المدن الجغرافي"
          subtitle="كل مدينة: إجمالي الشحنات، نسبة النجاح، نسبة الإرجاع، وقيمة التحصيل"
          color="#22c55e"
          badge={`${data.cityPerformance.length} مدينة`}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-5">
          {topCities.map((c, i) => (
            <RankedRow
              key={c.city}
              rank={i + 1}
              title={c.city}
              subtitle={`${fmt(c.delivered)} تسليم · ${fmt(c.returned)} مرتجع`}
              value={fmt(c.total)}
              valueLabel="شحنة"
              pct={c.successRate}
              pctColor={rateColor(c.successRate)}
              icon={MapPin}
              delay={i * 0.04}
            />
          ))}
        </div>
        <DetailTable
          accentColor="#22c55e"
          columns={[
            { key: "city", label: "المدينة" },
            { key: "total", label: "الإجمالي", align: "center" },
            { key: "delivered", label: "تم التسليم", align: "center" },
            { key: "returned", label: "مرتجع", align: "center" },
            { key: "codValue", label: "قيمة COD", align: "center" },
            { key: "successRate", label: "نسبة النجاح", align: "center" },
            { key: "returnRate", label: "نسبة الإرجاع", align: "center" },
          ]}
          rows={cityRows}
        />
      </SectionCard>

      {/* ── أداء شركات الشحن — جدول تفصيلي كامل ── */}
      <SectionCard delay={0.1}>
        <SectionHeader
          icon={Truck}
          title="أداء شركات الشحن"
          subtitle="مقارنة كاملة بين شركات الشحن: نسبة النجاح، متوسط زمن التسليم، وإجمالي الرسوم"
          color="#38bdf8"
          badge={`${data.companyPerformance.length} شركة`}
        />
        <DetailTable
          accentColor="#38bdf8"
          columns={[
            { key: "companyName", label: "شركة الشحن" },
            { key: "total", label: "الإجمالي", align: "center" },
            { key: "delivered", label: "تم التسليم", align: "center" },
            { key: "returned", label: "مرتجع", align: "center" },
            { key: "successRate", label: "نسبة النجاح", align: "center" },
            { key: "returnRate", label: "نسبة الإرجاع", align: "center" },
            { key: "avgDeliveryHours", label: "متوسط زمن التسليم", align: "center" },
            { key: "totalFees", label: "إجمالي الرسوم", align: "center" },
          ]}
          rows={companyRows}
        />
      </SectionCard>

      {/* ── أسباب المرتجعات + النبض المالي ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard delay={0.1}>
          <SectionHeader icon={RotateCcw} title="تحليل أسباب المرتجعات" subtitle="كل سبب إرجاع بالعدد والنسبة المئوية من إجمالي المرتجعات" color="#ef4444" />
          <ReturnReasonsBreakdown data={data.returnReasons} />
        </SectionCard>
        <SectionCard delay={0.15}>
          <SectionHeader icon={Wallet} title="النبض المالي" subtitle="تحصيل الدفع عند الاستلام ومزيج طرق الدفع" color="#f59e0b" />
          <FinancialPulsePanel data={data.financialPulse} />
        </SectionCard>
      </div>

      {/* ── أداء المناديب/المندوبين ── */}
      <SectionCard delay={0.1}>
        <SectionHeader
          icon={Users}
          title="أداء المناديب"
          subtitle="ترتيب المناديب حسب عدد الشحنات ونسبة النجاح في نفس الفترة"
          color="#a78bfa"
          badge={`${data.repPerformance.length} مندوب`}
        />
        {topReps.length === 0 ? (
          <p className="text-center text-gray-500 text-xs py-10">لا يوجد بيانات مناديب كافية لهذه الفترة</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {topReps.map((r, i) => (
              <RankedRow
                key={r.userId}
                rank={i + 1}
                title={r.name}
                subtitle={`${fmt(r.delivered)} تسليم · ${fmt(r.returned)} مرتجع`}
                value={fmt(r.total)}
                valueLabel="شحنة"
                pct={r.successRate}
                pctColor={rateColor(r.successRate)}
                icon={Users}
                delay={i * 0.04}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <p className="text-center text-[10px] text-gray-600 pb-2">
        آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")}
      </p>
    </div>
  );
}
