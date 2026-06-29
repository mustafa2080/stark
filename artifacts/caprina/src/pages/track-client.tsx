import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Package, Truck, MapPin, CheckCircle, Clock,
  AlertTriangle, ArrowRight, Phone, User, XCircle,
  CircleCheck, UserCheck, Warehouse,
} from "lucide-react";
import { Navbar, Footer } from "./home";
import ShipmentStatusHero from "../components/ShipmentStatusHero";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Shipment {
  id: number;
  shipmentNumber?: string;
  trackingNumber?: string;
  senderName: string;
  senderPhone?: string;
  receiverName: string;
  receiverPhone?: string;
  receiverCity?: string;
  receiverAddress?: string;
  status: string;
  parcelType?: string;
  weight?: string | number;
  notes?: string;
  returnReason?: string | null;
  createdAt?: string;
  warehouseName?: string | null;
  warehouseCity?: string | null;
  courierName?: string | null;
  courierPhone?: string | null;
  courierLogo?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Package; step: number; isException?: boolean }> = {
  pending:                 { label: "تم استلام الطلب",                color: "#facc15", bg: "rgba(250,204,21,0.1)",  icon: Clock,         step: 0 },
  waiting:                 { label: "تم استلام الطلب",                color: "#facc15", bg: "rgba(250,204,21,0.1)",  icon: Clock,         step: 0 },
  confirmed:               { label: "تم تأكيد الشحنة",                 color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  icon: CircleCheck,   step: 1 },
  warehouse_ready:         { label: "في مخزن الشحن",                  color: "#2dd4bf", bg: "rgba(45,212,191,0.1)",  icon: Package,       step: 2 },
  at_warehouse:            { label: "في مخزن الشحن",                  color: "#2dd4bf", bg: "rgba(45,212,191,0.1)",  icon: Package,       step: 2 },
  picked_up:               { label: "تم استلامها من المندوب",          color: "#22d3ee", bg: "rgba(34,211,238,0.1)",  icon: Truck,         step: 3 },
  in_shipping:             { label: "قيد الشحن",                      color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  icon: Truck,         step: 4 },
  in_transit:              { label: "قيد الشحن",                      color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  icon: Truck,         step: 4 },
  with_courier:            { label: "مع مندوب التوصيل",                color: "#f97316", bg: "rgba(249,115,22,0.1)",  icon: Truck,         step: 5 },
  out_for_delivery:        { label: "خرجت للتسليم",                   color: "#f97316", bg: "rgba(249,115,22,0.1)",  icon: Truck,         step: 5 },
  received:                { label: "تم التسليم بنجاح",                color: "#4ade80", bg: "rgba(74,222,128,0.1)",  icon: CheckCircle,   step: 6 },
  delivered:                { label: "تم التسليم بنجاح",                color: "#4ade80", bg: "rgba(74,222,128,0.1)",  icon: CheckCircle,   step: 6 },
  partial_received:        { label: "استلام جزئي",                    color: "#22d3ee", bg: "rgba(34,211,238,0.1)",  icon: CheckCircle,   step: 6 },
  delayed:                 { label: "الشحنة مؤجلة",                    color: "#fb923c", bg: "rgba(251,146,60,0.1)",  icon: AlertTriangle, step: -1, isException: true },
  returned:                { label: "الشحنة مرتجعة",                   color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: ArrowRight,    step: -1, isException: true },
  returned_to_warehouse:   { label: "مرتجعة — في المخزن",              color: "#fb923c", bg: "rgba(251,146,60,0.1)",  icon: Package,       step: -1, isException: true },
  return_delivered:        { label: "مرتجعة — تم التسليم للراسل",      color: "#a3e635", bg: "rgba(163,230,53,0.1)",  icon: CheckCircle,   step: -1, isException: true },
  cancelled:               { label: "الشحنة ملغية",                    color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: XCircle,       step: -1, isException: true },
};

// الحالات اللي معاها الشحنة فعلياً "مع المندوب" — هنا بس بنعرض بيانات المندوب
const COURIER_VISIBLE_STATUSES = new Set([
  "picked_up", "in_shipping", "in_transit", "with_courier", "out_for_delivery",
]);

// ─── Component ────────────────────────────────────────────────────────────────
export default function TrackClientPage() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const name  = params.get("name")  ?? "";
  const phone = params.get("phone") ?? "";

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [darkMode, setDarkMode]   = useState(true);

  useEffect(() => {
    if (!name || !phone) { setError("بيانات البحث ناقصة"); setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/shipments/track-by-client?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : r.json().then((d: any) => Promise.reject(d.error || "خطأ")))
      .then((data: Shipment[]) => { setShipments(data); setLoading(false); })
      .catch((err: unknown) => { setError(typeof err === "string" ? err : "لم يتم العثور على شحنات"); setLoading(false); });
  }, [name, phone]);

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col" dir="rtl">
      <Navbar darkMode={darkMode} toggleDarkMode={() => setDarkMode(p => !p)} />

      <main className="flex-1 flex flex-col items-center pt-24 sm:pt-28 pb-16 px-3 sm:px-4">
        {/* Back */}
        <button
          onClick={() => navigate("/")}
          className="self-start mb-6 flex items-center gap-2 text-xs sm:text-sm text-white/40 hover:text-white/80 transition-colors"
        >
          <ArrowRight size={16} /> الرجوع للرئيسية
        </button>

        {/* Hero — حالة الشحنة الرئيسية بالرسوم المتحركة */}
        {!loading && !error && shipments.length > 0 && (
          <ShipmentStatusHero
            status={shipments[0].status}
            trackingNumber={shipments[0].trackingNumber || shipments[0].shipmentNumber}
            returnReason={shipments[0].returnReason}
          />
        )}

        {/* Header */}
        {!loading && !error && shipments.length > 0 && (
          <div className="w-full max-w-2xl mb-6 text-right">
            <p className="text-white/60 text-sm">
              نتائج البحث عن: <span className="text-white font-bold">{name}</span>
              <span className="mx-2 text-white/20">|</span>
              <span className="text-white/40" dir="ltr">{phone}</span>
            </p>
            <p className="text-white/30 text-xs mt-1">{shipments.length} شحنة</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-4 mt-20">
            <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
            <p className="text-white/40 text-sm">جاري البحث...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="w-full max-w-md mt-10 rounded-2xl p-8 text-center"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <XCircle size={40} className="mx-auto mb-4" style={{ color: "#ef4444" }} />
            <p className="text-white font-bold mb-1">لم يتم العثور على شحنات</p>
            <p className="text-white/40 text-sm mb-6">{error}</p>
            <button onClick={() => navigate("/")}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-black"
              style={{ background: "linear-gradient(135deg,#fff,#d0d0d0)" }}>
              حاول مرة أخرى
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && shipments.length > 0 && (
          <div className="w-full max-w-2xl flex flex-col gap-4">
            {shipments.map(shipment => {
              const cfg = STATUS_CONFIG[shipment.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              const c = cfg.color;
              return (
                <div key={shipment.id} className="rounded-3xl relative overflow-hidden"
                  style={{
                    background: `linear-gradient(145deg, ${c}18 0%, rgba(10,10,15,0.94) 45%, ${c}0a 100%)`,
                    border: `1px solid ${c}40`,
                    boxShadow: `0 0 0 1px ${c}14, 0 0 50px ${c}28, 0 0 100px ${c}10, 0 20px 50px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.35)`,
                  }}>
                  {/* ambient glow */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-56 h-20 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse, ${c}38 0%, transparent 70%)`, filter: "blur(18px)" }} />
                  {/* shine diagonal */}
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(125deg, rgba(255,255,255,0.07) 0%, transparent 35%, transparent 70%, rgba(255,255,255,0.03) 100%)" }} />
                  {/* bottom glow line */}
                  <div className="absolute bottom-0 left-1/4 right-1/4 h-px pointer-events-none"
                    style={{ background: `linear-gradient(90deg, transparent, ${c}77, transparent)` }} />
                  {/* corner accent */}
                  <div className="absolute top-0 left-0 w-28 h-28 pointer-events-none"
                    style={{ background: `radial-gradient(circle at top left, ${c}14 0%, transparent 60%)` }} />

                  <div className="relative p-5">
                    {/* ── Header row: أيقونة + حالة + رقم تتبع ── */}
                    <div className="flex items-center gap-4 mb-4">
                      {/* أيقونة */}
                      <div className="relative flex-shrink-0">
                        <div className="absolute inset-0 rounded-xl pointer-events-none"
                          style={{ boxShadow: `0 0 24px ${c}55, 0 0 48px ${c}28`, borderRadius: 14 }} />
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center relative"
                          style={{
                            background: `linear-gradient(145deg, ${c}38 0%, ${c}14 50%, rgba(0,0,0,0.35) 100%)`,
                            border: `1.5px solid ${c}66`,
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.25)`,
                          }}>
                          <StatusIcon size={20} style={{ color: c, filter: `drop-shadow(0 0 8px ${c}) drop-shadow(0 0 16px ${c}88)` }} />
                        </div>
                      </div>

                      {/* حالة + تتبع */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: c }} />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: c }} />
                          </span>
                          <span className="font-black text-base leading-tight" style={{ color: c, textShadow: `0 0 12px ${c}66` }}>{cfg.label}</span>
                        </div>
                        <span className="text-xs font-mono tracking-widest" style={{ color: `${c}66` }} dir="ltr">
                          {shipment.trackingNumber || shipment.shipmentNumber || `#${shipment.id}`}
                        </span>
                      </div>
                    </div>

                    {/* ── بيانات المستلم ── */}
                    <div className="rounded-2xl p-3.5 mb-3"
                      style={{
                        background: `linear-gradient(135deg, ${c}0c 0%, rgba(255,255,255,0.02) 100%)`,
                        border: `1px solid ${c}20`,
                      }}>
                      <p className="text-xs mb-1.5 flex items-center gap-1.5" style={{ color: `${c}77` }}>
                        <User size={10}/> المُستلِم
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-bold text-white">{shipment.receiverName}</span>
                        {shipment.receiverPhone && (
                          <span className="text-xs flex items-center gap-1" style={{ color: "rgba(255,255,255,0.45)" }} dir="ltr">
                            <Phone size={10}/>{shipment.receiverPhone}
                          </span>
                        )}
                        {shipment.receiverCity && (
                          <span className="text-xs flex items-center gap-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                            <MapPin size={10}/>{shipment.receiverCity}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ── pills: نوع + وزن ── */}
                    {(shipment.parcelType || shipment.weight) && (
                      <div className="flex gap-2 mb-3">
                        {shipment.parcelType && (
                          <span className="text-xs px-3 py-1 rounded-xl font-medium"
                            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.09)" }}>
                            {shipment.parcelType}
                          </span>
                        )}
                        {shipment.weight && (
                          <span className="text-xs px-3 py-1 rounded-xl font-bold"
                            style={{ background: `${c}14`, color: c, border: `1px solid ${c}30` }}>
                            {shipment.weight} كجم
                          </span>
                        )}
                      </div>
                    )}

                    {/* ── ملاحظات ── */}
                    {shipment.notes && (
                      <p className="text-xs leading-relaxed mb-3 px-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                        <span style={{ color: c }}>◆ </span>{shipment.notes}
                      </p>
                    )}

                    {/* ── مخزن و مندوب ── */}
                    {(shipment.warehouseName || shipment.courierName) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t" style={{ borderColor: `${c}18` }}>
                        {shipment.warehouseName && (
                          <div className="rounded-2xl p-3"
                            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <p className="text-xs mb-1.5 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                              <Warehouse size={10}/>مكان الشحنة
                            </p>
                            <p className="text-sm font-bold text-white">
                              {shipment.warehouseName}
                              {shipment.warehouseCity && <span className="text-xs mr-1" style={{ color: "rgba(255,255,255,0.4)" }}>({shipment.warehouseCity})</span>}
                            </p>
                          </div>
                        )}
                        {shipment.courierName && (
                          <div className="rounded-2xl p-3"
                            style={{
                              background: `linear-gradient(135deg, ${c}0e 0%, rgba(0,0,0,0.22) 100%)`,
                              border: `1px solid ${c}28`,
                            }}>
                            <p className="text-xs mb-2 flex items-center gap-1.5" style={{ color: `${c}88` }}>
                              <UserCheck size={10}/>مندوب التوصيل
                            </p>
                            <div className="flex items-center gap-2.5">
                              {shipment.courierLogo ? (
                                <img src={shipment.courierLogo} alt={shipment.courierName}
                                  className="w-9 h-9 rounded-full object-cover shrink-0"
                                  style={{ border: `1.5px solid ${c}44`, boxShadow: `0 0 10px ${c}44` }} />
                              ) : (
                                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                  style={{ background: `${c}18`, border: `1.5px solid ${c}44`, boxShadow: `0 0 10px ${c}33` }}>
                                  <Truck size={16} style={{ color: c }} />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{shipment.courierName}</p>
                                {shipment.courierPhone && (
                                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }} dir="ltr">{shipment.courierPhone}</p>
                                )}
                              </div>
                              {shipment.courierPhone && (
                                <a
                                  href={`https://wa.me/${shipment.courierPhone.replace(/[^0-9]/g, "").replace(/^0/, "20")}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
                                  style={{
                                    background: "linear-gradient(135deg, rgba(37,211,102,0.2) 0%, rgba(37,211,102,0.07) 100%)",
                                    border: "1px solid rgba(37,211,102,0.45)",
                                    color: "#25d366",
                                    boxShadow: "0 0 10px rgba(37,211,102,0.18)",
                                  }}>
                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.559 4.122 1.532 5.856L.057 23.882a.5.5 0 0 0 .61.61l6.089-1.465A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 0 1-5.031-1.371l-.361-.214-3.737.899.934-3.641-.235-.374A9.9 9.9 0 0 1 2.1 12C2.1 6.533 6.533 2.1 12 2.1S21.9 6.533 21.9 12 17.467 21.9 12 21.9z"/></svg>
                                  واتساب
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
