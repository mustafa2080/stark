import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { analyticsApi, type LiveMapResponse, type LiveMapCity } from "@/lib/api";
import { GOVERNORATE_COORDS } from "@/lib/governorate-coords";
import {
  MapPin, Flame, Truck, Package, RefreshCw, AlertTriangle,
  TrendingUp, Users, Navigation,
} from "lucide-react";

const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

// ألوان الحالة الأساسية (نفس نظام الداشبورد)
const STATUS_COLOR = { inTransit: "#3b82f6", delivered: "#10b981", delayed: "#ef4444", problem: "#f59e0b" } as const;

// لون heat-score: أخضر (هادئ) → أصفر → برتقالي → أحمر (مزدحم/متأخر)
function heatColor(score: number) {
  if (score >= 70) return "#ef4444";
  if (score >= 45) return "#f59e0b";
  if (score >= 20) return "#eab308";
  return "#10b981";
}

// ─── كارت ملخص علوي ───────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg, border, sub }: {
  icon: any; label: string; value: string | number; color: string; bg: string; border: string; sub?: string;
}) {
  return (
    <Card className={`border ${border} bg-card overflow-hidden`}>
      <CardContent className="p-3.5 sm:p-4 flex items-center gap-3">
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs text-muted-foreground font-bold truncate">{label}</p>
          <p className={`text-lg sm:text-2xl font-black truncate ${color}`}>{value}</p>
          {sub && <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── الخريطة الرئيسية (SVG) بوضعين: توزيع الحالة / Heat Map ─────────────────
function MapCanvas({
  cities, selectedCity, onSelectCity, mode,
}: {
  cities: LiveMapCity[]; selectedCity: string | null; onSelectCity: (c: string | null) => void; mode: "status" | "heat";
}) {
  const maxTotal = Math.max(...cities.map(c => c.total), 1);

  return (
    <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] max-h-[520px] mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <rect x="10" y="8" width="70" height="86" rx="3" className="fill-muted/20 stroke-border" strokeWidth="0.4" />
        {cities.map((c) => {
          const coord = GOVERNORATE_COORDS[c.city];
          if (!coord) return null;
          const radius = 1.8 + (c.total / maxTotal) * 4;
          const isSelected = selectedCity === c.city;

          let fillColor: string;
          if (mode === "heat") {
            fillColor = heatColor(c.heatScore);
          } else {
            const dominant: keyof typeof STATUS_COLOR =
              c.problem >= c.delayed && c.problem >= c.inTransit && c.problem >= c.delivered ? "problem"
              : c.delayed >= c.inTransit && c.delayed >= c.delivered ? "delayed"
              : c.inTransit >= c.delivered ? "inTransit"
              : "delivered";
            fillColor = STATUS_COLOR[dominant];
          }

          return (
            <g key={c.city} onClick={() => onSelectCity(isSelected ? null : c.city)} className="cursor-pointer">
              {mode === "heat" && c.heatScore >= 45 && (
                <circle cx={coord.x} cy={coord.y} r={radius + 3} fill={fillColor} opacity="0.15">
                  <animate attributeName="r" values={`${radius + 2};${radius + 5};${radius + 2}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.2;0.05;0.2" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              {isSelected && (
                <circle cx={coord.x} cy={coord.y} r={radius + 2} fill="none" stroke={fillColor} strokeWidth="0.5" opacity="0.6" />
              )}
              <circle cx={coord.x} cy={coord.y} r={radius} fill={fillColor} opacity={isSelected ? 1 : 0.85} />
              <title>{c.city}: {c.total} شحنة</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── صف كارت مدينة في الشريط الجانبي ─────────────────────────────────────────
function CityRow({ city, isSelected, onSelect }: { city: LiveMapCity; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-right p-3 rounded-xl border transition-colors ${
        isSelected ? "bg-primary/10 border-primary/40" : "bg-card border-border hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm truncate">{city.city}</span>
        <span
          className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
          style={{ background: `${heatColor(city.heatScore)}22`, color: heatColor(city.heatScore) }}
        >
          {city.heatScore}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {fn(city.total)}</span>
        {city.delayed > 0 && (
          <span className="flex items-center gap-1 text-red-500"><AlertTriangle className="w-3 h-3" /> {fn(city.delayed)}</span>
        )}
        {city.representativesCount > 0 && (
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {city.representativesCount}</span>
        )}
      </div>
    </button>
  );
}

// ─── الصفحة الرئيسية ─────────────────────────────────────────────────────────
export default function LiveMap() {
  const [mode, setMode] = useState<"status" | "heat">("status");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["live-map"],
    queryFn: analyticsApi.liveMap,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const cities = data?.cities ?? [];
  const selected = useMemo(() => cities.find(c => c.city === selectedCity) ?? null, [cities, selectedCity]);
  const sortedByTotal = useMemo(() => [...cities].sort((a, b) => b.total - a.total), [cities]);

  return (
    <div className="p-4 sm:p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2">
            <Navigation className="w-6 h-6 text-primary" /> الخريطة المباشرة
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">توزيع الشحنات والمندوبين على المحافظات لحظيًا</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card border border-border text-sm font-bold hover:bg-muted/40 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> تحديث
        </button>
      </div>

      {/* كروت الملخص */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Package} label="شحنات نشطة" value={fn(data?.totalActiveShipments ?? 0)} color="text-blue-500" bg="bg-blue-500/10" border="border-blue-500/20" />
        <StatCard icon={MapPin} label="محافظات نشطة" value={fn(data?.totalActiveCities ?? 0)} color="text-emerald-500" bg="bg-emerald-500/10" border="border-emerald-500/20" />
        <StatCard icon={Truck} label="مندوبين متصلين" value={fn(data?.totalOnlineReps ?? 0)} color="text-violet-500" bg="bg-violet-500/10" border="border-violet-500/20" />
        <StatCard
          icon={Flame}
          label="الأكثر ازدحامًا"
          value={data?.busiestCity?.city ?? "—"}
          sub={data?.busiestCity ? `${fn(data.busiestCity.total)} شحنة` : undefined}
          color="text-amber-500" bg="bg-amber-500/10" border="border-amber-500/20"
        />
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        {/* الخريطة */}
        <Card className="border-border bg-card">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1">
                <button
                  onClick={() => setMode("status")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "status" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                >
                  حالة الشحنات
                </button>
                <button
                  onClick={() => setMode("heat")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "heat" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                >
                  Heat Map
                </button>
              </div>
              {data?.mostDelayedCity && (
                <span className="text-[11px] text-red-500 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> الأعلى تأخيرًا: {data.mostDelayedCity.city} ({data.mostDelayedCity.delayRate}%)
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="aspect-[4/5] sm:aspect-[3/4] max-h-[520px] mx-auto bg-muted/20 rounded-2xl animate-pulse" />
            ) : (
              <MapCanvas cities={cities} selectedCity={selectedCity} onSelectCity={setSelectedCity} mode={mode} />
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">
              {mode === "status" ? (
                <>
                  {Object.entries({ inTransit: "جارِ التوصيل", delivered: "تم التسليم", delayed: "متأخرة", problem: "بها مشكلة" }).map(([k, label]) => (
                    <span key={k} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[k as keyof typeof STATUS_COLOR] }} />
                      {label}
                    </span>
                  ))}
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> هادئ</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> متوسط</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> مزدحم</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> حرج</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* الشريط الجانبي: قائمة المحافظات / تفاصيل المحافظة المختارة */}
        <div className="space-y-3">
          {selected ? (
            <Card className="border-primary/30 bg-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base">{selected.city}</h3>
                  <button onClick={() => setSelectedCity(null)} className="text-xs text-muted-foreground hover:text-foreground">إغلاق ✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 font-bold">جارِ التوصيل: {fn(selected.inTransit)}</div>
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 font-bold">تم التسليم: {fn(selected.delivered)}</div>
                  <div className="p-2 rounded-lg bg-red-500/10 text-red-500 font-bold">متأخرة: {fn(selected.delayed)}</div>
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 font-bold">بها مشكلة: {fn(selected.problem)}</div>
                </div>
                <div className="text-xs text-muted-foreground">نسبة التأخير: <span className="font-bold text-foreground">{selected.delayRate}%</span></div>
                {selected.representatives.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground font-bold mb-1.5">المندوبون ({selected.representativesCount})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.representatives.map((r) => (
                        <span key={r} className="text-[10px] px-2 py-1 rounded-full bg-muted/50">{r}</span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <p className="text-xs text-muted-foreground px-1">اختر محافظة من الخريطة أو القائمة لعرض التفاصيل</p>
          )}

          <div className="space-y-2 max-h-[440px] overflow-y-auto pr-0.5">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/20 animate-pulse" />)
              : sortedByTotal.map((c) => (
                  <CityRow key={c.city} city={c} isSelected={selectedCity === c.city} onSelect={() => setSelectedCity(c.city === selectedCity ? null : c.city)} />
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}
