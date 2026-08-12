import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import Map, { Marker, Popup, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@/contexts/ThemeContext";
import { getGovernorateCoord, EGYPT_CENTER, EGYPT_DEFAULT_ZOOM } from "@/lib/egypt-governorates";
import type { LiveMapCity } from "@/lib/api";
import { Users, Package, AlertTriangle, MapPinned, Filter, Trophy, Clock4, Radio } from "lucide-react";

// تفعيل دعم عرض النصوص العربية/RTL بشكل صحيح (بدون هذا الـ plugin تظهر
// الحروف العربية منفصلة/معكوسة على الخريطة لأن MapLibre لا يدعم RTL shaping افتراضيًا)
let rtlPluginRegistered = false;
function ensureRtlTextPlugin() {
  if (rtlPluginRegistered) return;
  rtlPluginRegistered = true;
  try {
    maplibregl.setRTLTextPlugin(
      "/mapbox-gl-rtl-text.js",
      true // lazy load — يتحمل فقط عند الحاجة لعرض نص RTL
    );
  } catch {
    // بيرمي خطأ لو اتسجل قبل كده (مثلاً بسبب React StrictMode/HMR في التطوير) — آمن نتجاهله
  }
}

// خرائط أساسية مجانية (بدون مفتاح API)
// ملحوظة: استخدمنا نفس ستايل "Liberty" (خريطة واقعية بتفاصيل شوارع/مباني واضحة)
// في الوضعين الفاتح والداكن بدل ستايل "dark" المبسّط اللي كان بيظهر كبقعة سوداء
// شبه مجردة بدون تفاصيل — بناءً على طلب المدير أن تكون الخريطة واقعية وواضحة.
const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/liberty";

interface LiveMapProps {
  cities: LiveMapCity[];
  isLoading?: boolean;
  busiestCity?: { city: string; total: number } | null;
  mostDelayedCity?: { city: string; delayRate: number } | null;
}

// حجم الفقاعة يتدرّج حسب عدد الشحنات (بحد أدنى وأقصى مقروء بصريًا)
function bubbleSize(total: number, maxTotal: number): number {
  if (maxTotal <= 0) return 24;
  const ratio = Math.sqrt(total / maxTotal);
  return Math.round(24 + ratio * 36); // بين 24px و 60px
}

// تدرج لوني ناعم يعكس heatScore: أخضر (هادئ) → كهرماني (مزدحم) → أحمر (متأخر بشدة)
function bubbleTone(heatScore: number): { base: string; light: string; dark: string } {
  if (heatScore >= 66) return { base: "#ef4444", light: "#fca5a5", dark: "#b91c1c" };
  if (heatScore >= 33) return { base: "#f59e0b", light: "#fcd34d", dark: "#b45309" };
  return { base: "#10b981", light: "#6ee7b7", dark: "#047857" };
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  in_shipping: { label: "قيد الشحن", className: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  warehouse_ready: { label: "بالمخزن", className: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
  received: { label: "تم التسليم", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  delayed: { label: "مؤجل", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  returned: { label: "مرتجع", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  pending: { label: "قيد الانتظار", className: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
};

function statusMeta(status: string) {
  return STATUS_LABEL[status] ?? { label: status, className: "bg-slate-500/15 text-slate-600 dark:text-slate-400" };
}

export function LiveMap({ cities, isLoading, busiestCity, mostDelayedCity }: LiveMapProps) {
  const { theme } = useTheme();
  const [selected, setSelected] = useState<LiveMapCity | null>(null);
  const [selectedGov, setSelectedGov] = useState<string>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const mapRef = useRef<MapRef | null>(null);

  useEffect(() => {
    ensureRtlTextPlugin();
  }, []);

  const allPoints = useMemo(() => {
    return cities
      .map((c) => {
        const coord = getGovernorateCoord(c.city);
        if (!coord) return null;
        return { ...c, ...coord };
      })
      .filter((p): p is LiveMapCity & { lat: number; lng: number } => p !== null);
  }, [cities]);

  // قائمة المحافظات المتاحة فعليًا في البيانات الحالية (مرتبة أبجديًا)
  const availableGovernorates = useMemo(
    () => [...allPoints].map((p) => p.city).sort((a, b) => a.localeCompare(b, "ar")),
    [allPoints]
  );

  const points = useMemo(() => {
    let list = allPoints;
    if (activeOnly) list = list.filter((p) => p.inTransit > 0);
    if (selectedGov !== "all") list = list.filter((p) => p.city === selectedGov);
    return list;
  }, [allPoints, activeOnly, selectedGov]);

  const maxTotal = useMemo(() => Math.max(1, ...points.map((p) => p.total)), [points]);
  const mapStyle = theme === "dark" ? STYLE_DARK : STYLE_LIGHT;

  // أعلى 3 محافظات ازدحامًا لعرضها في اللوحة الجانبية
  const topCongested = useMemo(
    () => [...allPoints].sort((a, b) => b.total - a.total).slice(0, 3),
    [allPoints]
  );

  const handleMarkerClick = useCallback((city: LiveMapCity, e: { originalEvent: MouseEvent }) => {
    e.originalEvent.stopPropagation();
    setSelected(city);
  }, []);

  const handleSidebarSelect = useCallback((city: LiveMapCity) => {
    setSelected(city);
    setSelectedGov(city.city);
  }, []);

  // لما تتغير المحافظة المختارة، نزوم على مركزها أو نرجع لعرض مصر كلها
  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedGov === "all") {
      mapRef.current.flyTo({ center: [EGYPT_CENTER.lng, EGYPT_CENTER.lat], zoom: EGYPT_DEFAULT_ZOOM, duration: 900 });
      return;
    }
    const coord = getGovernorateCoord(selectedGov);
    if (coord) {
      mapRef.current.flyTo({ center: [coord.lng, coord.lat], zoom: 9, duration: 900 });
    }
  }, [selectedGov]);

  if (isLoading) {
    return <div className="w-full h-full min-h-[420px] rounded-xl bg-muted animate-pulse" />;
  }

  if (allPoints.length === 0) {
    return (
      <div className="w-full h-full min-h-[420px] rounded-xl bg-muted/40 border border-dashed flex items-center justify-center">
        <span className="text-xs text-muted-foreground">لا توجد بيانات شحن كافية لعرضها على الخريطة</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden border flex">
      {/* لوحة إحصائيات جانبية */}
      <div className="hidden lg:flex w-[168px] shrink-0 flex-col gap-2 p-2 border-l bg-background/60 overflow-y-auto z-10">
        {busiestCity && (
          <div className="rounded-lg border bg-background/90 p-2 space-y-0.5">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Trophy className="w-3 h-3 text-amber-500" /> الأكثر ازدحامًا</div>
            <div className="text-[11px] font-bold truncate">{busiestCity.city}</div>
            <div className="text-[10px] text-muted-foreground">{busiestCity.total} شحنة</div>
          </div>
        )}
        {mostDelayedCity && (
          <div className="rounded-lg border bg-background/90 p-2 space-y-0.5">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock4 className="w-3 h-3 text-red-500" /> الأعلى تأخيرًا</div>
            <div className="text-[11px] font-bold truncate">{mostDelayedCity.city}</div>
            <div className="text-[10px] text-red-500 font-semibold">{mostDelayedCity.delayRate}% تأخير</div>
          </div>
        )}
        <div className="rounded-lg border bg-background/90 p-2 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Radio className="w-3 h-3 text-sky-500" /> أعلى 3 محافظات</div>
          {topCongested.map((c, i) => (
            <button
              key={c.city}
              onClick={() => handleSidebarSelect(c)}
              className="w-full flex items-center justify-between text-[10px] hover:bg-muted/60 rounded px-1 py-0.5 transition-colors"
            >
              <span className="flex items-center gap-1 truncate"><span className="text-muted-foreground">{i + 1}.</span> {c.city}</span>
              <span className="font-semibold shrink-0">{c.total}</span>
            </button>
          ))}
        </div>
        {(() => {
          const alerts = allPoints.filter((p) => p.delayed + p.problem > 0).sort((a, b) => (b.delayed + b.problem) - (a.delayed + a.problem)).slice(0, 4);
          if (alerts.length === 0) return null;
          return (
            <div className="rounded-lg border bg-background/90 p-2 space-y-1.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><AlertTriangle className="w-3 h-3 text-red-500" /> تنبيهات فورية</div>
              {alerts.map((p) => (
                <button
                  key={p.city}
                  onClick={() => handleSidebarSelect(p)}
                  className="w-full flex items-center justify-between text-[10px] hover:bg-muted/60 rounded px-1 py-0.5 transition-colors"
                >
                  <span className="truncate">{p.city}</span>
                  <span className="font-semibold text-red-500 shrink-0">{p.delayed + p.problem}</span>
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      <div className="relative flex-1 min-w-0">
      {/* شريط الفلترة: اختيار محافظة + تبديل "نشطة فقط" */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 flex-wrap max-w-[calc(100%-1rem)]">
        <div className="flex items-center gap-1.5 bg-background/90 backdrop-blur border rounded-md px-2 py-1 shadow-sm">
          <MapPinned className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <select
            value={selectedGov}
            onChange={(e) => setSelectedGov(e.target.value)}
            className="text-[11px] bg-transparent outline-none max-w-[120px] cursor-pointer"
            dir="rtl"
          >
            <option value="all">كل المحافظات</option>
            {availableGovernorates.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setActiveOnly((v) => !v)}
          className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border shadow-sm transition-colors ${
            activeOnly
              ? "bg-sky-500 text-white border-sky-500"
              : "bg-background/90 backdrop-blur text-muted-foreground hover:text-foreground"
          }`}
          title="عرض المحافظات اللي فيها شحنات قيد التوصيل فقط"
        >
          <Filter className="w-3.5 h-3.5" />
          نشطة فقط
        </button>
      </div>

      <Map
        ref={mapRef}
        initialViewState={{ longitude: EGYPT_CENTER.lng, latitude: EGYPT_CENTER.lat, zoom: EGYPT_DEFAULT_ZOOM }}
        mapStyle={mapStyle}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        onClick={() => setSelected(null)}
      >
        <NavigationControl position="top-left" showCompass={false} />

        {points.map((p) => {
          const size = bubbleSize(p.total, maxTotal);
          const tone = bubbleTone(p.heatScore);
          const hasIssue = p.delayed + p.problem > 0;
          return (
            <Marker key={p.city} longitude={p.lng} latitude={p.lat} anchor="center"
              onClick={(e) => handleMarkerClick(p, e)}>
              <div className="flex flex-col items-center cursor-pointer transition-transform hover:scale-110" title={p.city}>
                <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
                  {hasIssue && (
                    <span
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{ backgroundColor: `${tone.base}40`, animationDuration: "1.8s" }}
                    />
                  )}
                  <div
                    className="relative flex items-center justify-center rounded-full w-full h-full"
                    style={{
                      background: `radial-gradient(circle at 35% 30%, ${tone.light}, ${tone.base} 65%, ${tone.dark})`,
                      boxShadow: `0 2px 8px ${tone.base}55, inset 0 1px 2px rgba(255,255,255,0.4)`,
                      border: `1.5px solid ${tone.dark}`,
                    }}
                  >
                    <span className="text-[10px] font-bold text-white drop-shadow-sm">{p.total}</span>
                  </div>
                </div>
                <span
                  dir="rtl"
                  className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap bg-background/90 backdrop-blur border shadow-sm"
                >
                  {p.city}
                </span>
              </div>
            </Marker>
          );
        })}

        {selected && (() => {
          const coord = getGovernorateCoord(selected.city);
          if (!coord) return null;
          return (
            <Popup
              longitude={coord.lng}
              latitude={coord.lat}
              anchor="bottom"
              onClose={() => setSelected(null)}
              closeButton={false}
              offset={18}
              className="live-map-popup"
            >
              <div className="text-xs space-y-2 min-w-[220px] max-w-[260px] p-1" dir="rtl">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{selected.city}</span>
                  {selected.delayRate > 0 && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${selected.delayRate >= 33 ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600"}`}>
                      {selected.delayRate}% تأخير
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="flex items-center justify-between bg-muted/40 rounded px-1.5 py-1">
                    <span className="text-muted-foreground flex items-center gap-1"><Package className="w-3 h-3" /> إجمالي</span>
                    <span className="font-semibold">{selected.total}</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/40 rounded px-1.5 py-1">
                    <span className="text-muted-foreground">قيد التوصيل</span>
                    <span className="font-semibold text-sky-500">{selected.inTransit}</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/40 rounded px-1.5 py-1">
                    <span className="text-muted-foreground">تم التسليم</span>
                    <span className="font-semibold text-emerald-500">{selected.delivered}</span>
                  </div>
                  {selected.representativesCount > 0 && (
                    <div className="flex items-center justify-between bg-muted/40 rounded px-1.5 py-1">
                      <span className="text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> مندوبين</span>
                      <span className="font-semibold">{selected.representativesCount}</span>
                    </div>
                  )}
                </div>

                {selected.shipments.length > 0 && (
                  <div className="pt-1 border-t space-y-1">
                    <div className="text-[10px] text-muted-foreground font-semibold">آخر الشحنات</div>
                    <div className="max-h-[160px] overflow-y-auto space-y-1">
                      {selected.shipments.map((s) => {
                        const meta = statusMeta(s.status);
                        return (
                          <div key={s.id} className="flex items-center justify-between gap-1.5 bg-muted/30 rounded px-1.5 py-1">
                            <div className="min-w-0">
                              <div className="font-semibold text-[10.5px] truncate">{s.receiverName || "بدون اسم"}</div>
                              <div className="text-[9px] text-muted-foreground truncate">{s.shipmentNumber || `#${s.id}`}</div>
                            </div>
                            <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${meta.className}`}>
                              {meta.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Popup>
          );
        })()}
      </Map>

        {points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-muted-foreground bg-background/90 backdrop-blur px-3 py-1.5 rounded-md border shadow-sm">
              لا توجد شحنات مطابقة لهذا الفلتر
            </span>
          </div>
        )}

        <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-background/85 backdrop-blur px-2 py-1 rounded-md border text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #6ee7b7, #10b981 65%, #047857)" }} /> هادئ</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #fcd34d, #f59e0b 65%, #b45309)" }} /> مزدحم</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #fca5a5, #ef4444 65%, #b91c1c)" }} /> متأخر</span>
        </div>
      </div>
    </div>
  );
}
