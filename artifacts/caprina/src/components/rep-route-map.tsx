import { useEffect, useRef, useState, useCallback } from "react";
import MapGL, { Marker } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@/contexts/ThemeContext";
import { EGYPT_CENTER, EGYPT_DEFAULT_ZOOM } from "@/lib/egypt-governorates";
import { apiFetch } from "@/lib/api";
import { MapPin, Navigation, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

let rtlPluginRegistered = false;
function ensureRtlTextPlugin() {
  if (rtlPluginRegistered) return;
  rtlPluginRegistered = true;
  try {
    maplibregl.setRTLTextPlugin("/mapbox-gl-rtl-text.js", true);
  } catch {
    // اتسجل قبل كده (HMR/StrictMode) — آمن نتجاهله
  }
}

// ─── Hook: يبعت موقع المندوب للسيرفر كل دقيقة طول ما الصفحة مفتوحة ──────────
function useLocationBroadcast(enabled: boolean) {
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;

    let cancelled = false;

    const sendLocation = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled) return;
          const { latitude, longitude } = pos.coords;
          setLastCoords({ lat: latitude, lng: longitude });
          setPermissionDenied(false);
          try {
            await apiFetch("/representative/location", {
              method: "PATCH",
              body: JSON.stringify({ lat: latitude, lng: longitude }),
            });
          } catch (_) {
            // فشل تحديث الشبكة مؤقتًا — هيحاول تاني بعد دقيقة، مش لازم نزعج المندوب
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setPermissionDenied(true);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
      );
    };

    sendLocation(); // إرسال فوري عند فتح الصفحة
    const interval = setInterval(sendLocation, 60_000); // ثم كل دقيقة

    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled]);

  return { lastCoords, permissionDenied };
}

// ─── Hook: يحوّل الإحداثيات لاسم مكان مقروء (Reverse Geocoding عبر Nominatim) ──
function useReverseGeocode(lat: number | null | undefined, lng: number | null | undefined) {
  const [placeName, setPlaceName] = useState<string | null>(null);

  useEffect(() => {
    if (lat == null || lng == null) { setPlaceName(null); return; }
    let cancelled = false;

    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = geocodeCache.get(key);
    if (cached) { setPlaceName(cached); return; }

    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ar&zoom=14`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const addr = data?.address || {};
        const parts = [
          addr.suburb || addr.neighbourhood || addr.quarter,
          addr.city || addr.town || addr.village || addr.county,
        ].filter(Boolean);
        const name = parts.length ? parts.join("، ") : (data?.display_name ?? null);
        geocodeCache.set(key, name);
        setPlaceName(name);
      })
      .catch(() => { if (!cancelled) setPlaceName(null); });

    return () => { cancelled = true; };
  }, [lat, lng]);

  return placeName;
}

const geocodeCache = new Map<string, string | null>();

export function RepRouteMap({ enabled = true }: { enabled?: boolean }) {
  const { theme } = useTheme();
  const { lastCoords, permissionDenied } = useLocationBroadcast(enabled);
  const [serverLocation, setServerLocation] = useState<{ lat: number | null; lng: number | null; updatedAt: string | null } | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => { ensureRtlTextPlugin(); }, []);

  // آخر موقع محفوظ في السيرفر (fallback لو الـ geolocation لسه ما استجابش)
  const fetchServerLocation = useCallback(async () => {
    try {
      const data = await apiFetch("/representative/location");
      setServerLocation(data as any);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchServerLocation(); }, [fetchServerLocation]);
  useEffect(() => {
    if (lastCoords) fetchServerLocation();
  }, [lastCoords, fetchServerLocation]);

  const point = lastCoords
    ? lastCoords
    : (serverLocation?.lat != null && serverLocation?.lng != null)
      ? { lat: serverLocation.lat, lng: serverLocation.lng }
      : null;

  // لما الموقع يتحدّث، نحرّك الخريطة برفق للنقطة الجديدة بدل ما نجبرها (controlled)
  useEffect(() => {
    if (!point || !mapRef.current) return;
    mapRef.current.flyTo?.({ center: [point.lng, point.lat], zoom: 14, duration: 800 });
  }, [point?.lat, point?.lng]);

  const mapStyle = theme === "dark" ? STYLE_DARK : STYLE_LIGHT;
  const updatedAt = serverLocation?.updatedAt;
  const placeName = useReverseGeocode(point?.lat, point?.lng);


  return (
    <div className="rounded-2xl border bg-card/60 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-border/50 flex items-center justify-between">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Navigation className="w-3.5 h-3.5 text-primary" /> خريطة السير
        </p>
        {updatedAt && (
          <span className="text-[10px] text-muted-foreground">
            آخر تحديث: {formatDistanceToNow(new Date(updatedAt), { locale: ar, addSuffix: true })}
          </span>
        )}
      </div>

      {permissionDenied && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-400">
            محتاج تسمح بالوصول للموقع من إعدادات المتصفح عشان تظهر خريطة السير
          </p>
        </div>
      )}

      <div style={{ height: 260 }} className="relative">
        <MapGL
          ref={mapRef}
          mapStyle={mapStyle}
          mapLib={maplibregl}
          initialViewState={
            point
              ? { longitude: point.lng, latitude: point.lat, zoom: 14 }
              : { longitude: EGYPT_CENTER.lng, latitude: EGYPT_CENTER.lat, zoom: EGYPT_DEFAULT_ZOOM }
          }
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
        >
          {point && (
            <Marker longitude={point.lng} latitude={point.lat} anchor="bottom">
              <div className="relative flex flex-col items-center">
                {placeName && (
                  <div className="absolute -top-8 whitespace-nowrap px-2 py-1 rounded-lg bg-card border border-border/60 shadow-md text-[10px] font-medium text-foreground">
                    {placeName}
                  </div>
                )}
                <span className="absolute -top-1 w-8 h-8 rounded-full bg-primary/25 animate-ping" />
                <div className="relative w-7 h-7 rounded-full bg-primary border-2 border-white shadow-lg flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-primary-foreground" fill="currentColor" />
                </div>
              </div>
            </Marker>
          )}
        </MapGL>

        {!point && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <p className="text-xs text-muted-foreground">بننتظر تحديد موقعك...</p>
          </div>
        )}
      </div>
    </div>
  );
}
