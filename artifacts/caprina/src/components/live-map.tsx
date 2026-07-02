import { useMemo, useState, useCallback, useEffect } from "react";
import Map, { Marker, Popup, NavigationControl } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@/contexts/ThemeContext";
import { getGovernorateCoord, EGYPT_CENTER, EGYPT_DEFAULT_ZOOM } from "@/lib/egypt-governorates";
import type { LiveMapCity } from "@/lib/api";
import { Users, Package, AlertTriangle } from "lucide-react";

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
const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

interface LiveMapProps {
  cities: LiveMapCity[];
  isLoading?: boolean;
}

// حجم الفقاعة يتدرّج حسب عدد الشحنات (بحد أدنى وأقصى مقروء بصريًا)
function bubbleSize(total: number, maxTotal: number): number {
  if (maxTotal <= 0) return 22;
  const ratio = Math.sqrt(total / maxTotal);
  return Math.round(22 + ratio * 34); // بين 22px و 56px
}

// لون الفقاعة يعكس heatScore: أخضر (هادئ) → كهرماني (مزدحم) → أحمر (متأخر بشدة)
function bubbleColor(heatScore: number): string {
  if (heatScore >= 66) return "#ef4444";
  if (heatScore >= 33) return "#f59e0b";
  return "#10b981";
}

export function LiveMap({ cities, isLoading }: LiveMapProps) {
  const { theme } = useTheme();
  const [selected, setSelected] = useState<LiveMapCity | null>(null);

  useEffect(() => {
    ensureRtlTextPlugin();
  }, []);

  const points = useMemo(() => {
    return cities
      .map((c) => {
        const coord = getGovernorateCoord(c.city);
        if (!coord) return null;
        return { ...c, ...coord };
      })
      .filter((p): p is LiveMapCity & { lat: number; lng: number } => p !== null);
  }, [cities]);

  const maxTotal = useMemo(() => Math.max(1, ...points.map((p) => p.total)), [points]);
  const mapStyle = theme === "dark" ? STYLE_DARK : STYLE_LIGHT;

  const handleMarkerClick = useCallback((city: LiveMapCity, e: { originalEvent: MouseEvent }) => {
    e.originalEvent.stopPropagation();
    setSelected(city);
  }, []);

  if (isLoading) {
    return <div className="w-full h-full min-h-[420px] rounded-xl bg-muted animate-pulse" />;
  }

  if (points.length === 0) {
    return (
      <div className="w-full h-full min-h-[420px] rounded-xl bg-muted/40 border border-dashed flex items-center justify-center">
        <span className="text-xs text-muted-foreground">لا توجد بيانات شحن كافية لعرضها على الخريطة</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden border">
      <Map
        initialViewState={{ longitude: EGYPT_CENTER.lng, latitude: EGYPT_CENTER.lat, zoom: EGYPT_DEFAULT_ZOOM }}
        mapStyle={mapStyle}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        onClick={() => setSelected(null)}
      >
        <NavigationControl position="top-left" showCompass={false} />

        {points.map((p) => {
          const size = bubbleSize(p.total, maxTotal);
          const color = bubbleColor(p.heatScore);
          return (
            <Marker key={p.city} longitude={p.lng} latitude={p.lat} anchor="center"
              onClick={(e) => handleMarkerClick(p, e)}>
              <div className="flex flex-col items-center cursor-pointer transition-transform hover:scale-110" title={p.city}>
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: size, height: size,
                    backgroundColor: `${color}33`,
                    border: `2px solid ${color}`,
                    boxShadow: p.delayed + p.problem > 0 ? `0 0 0 4px ${color}22` : undefined,
                  }}
                >
                  <span className="text-[10px] font-bold" style={{ color }}>{p.total}</span>
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
              <div className="text-xs space-y-1.5 min-w-[160px] p-1" dir="rtl">
                <div className="font-bold text-sm">{selected.city}</div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Package className="w-3 h-3" /> إجمالي الشحنات</span>
                  <span className="font-semibold">{selected.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">قيد التوصيل</span>
                  <span className="font-semibold text-sky-500">{selected.inTransit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">تم التسليم</span>
                  <span className="font-semibold text-emerald-500">{selected.delivered}</span>
                </div>

                {(selected.delayed > 0 || selected.problem > 0) && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" /> متأخرة/مشاكل</span>
                    <span className="font-semibold text-red-500">{selected.delayed + selected.problem}</span>
                  </div>
                )}
                {selected.representativesCount > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> المندوبين</span>
                    <span className="font-semibold">{selected.representativesCount}</span>
                  </div>
                )}
              </div>
            </Popup>
          );
        })()}
      </Map>

      <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-background/85 backdrop-blur px-2 py-1 rounded-md border text-[10px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> هادئ</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> مزدحم</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> متأخر</span>
      </div>
    </div>
  );
}
