import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Package, Truck, MapPin, CheckCircle, Clock, AlertTriangle, XCircle, ArrowRight, Phone, User, Warehouse, UserCheck, CircleCheck } from "lucide-react";
import { Navbar, Footer } from "./home";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Shipment {
  id: number;
  shipmentNumber?: string;
  trackingNumber?: string;
  senderName: string;
  senderPhone?: string;
  senderCity?: string;
  receiverName: string;
  receiverPhone?: string;
  receiverAddress?: string;
  receiverCity?: string;
  status: string;
  parcelType?: string;
  weight?: string | number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  // المخزن والمندوب
  warehouseId?: number | null;
  warehouseName?: string | null;
  warehouseCity?: string | null;
  shippingCompanyId?: number | null;
  shippingCompanyName?: string | null;
  shippingCompanyPhone?: string | null;
  // courierName/courierPhone = بيانات المندوب من shippingCompanies join
  courierName?: string | null;
  courierPhone?: string | null;
}

// ─── Status config ─────────────────────────────────────────────────────────────
// step: ترتيب المرحلة الطبيعية للشحنة (0 → 6). الحالات الاستثنائية (مرتجع/ملغي/مؤجل)
// مالهاش step تصاعدي عادي — بنعاملها بشكل خاص في الـ timeline (isException: true)
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

// مراحل التتبع العمودية (Timeline) — بالترتيب الطبيعي للشحنة
const TIMELINE_STEPS = [
  { step: 0, label: "تم استلام الطلب",        sublabel: "جاري تجهيز شحنتك",              icon: Clock },
  { step: 2, label: "في مخزن الشحن",          sublabel: "الشحنة جاهزة للتسليم للمندوب",   icon: Package },
  { step: 4, label: "قيد الشحن",              sublabel: "الشحنة مع شركة الشحن",          icon: Truck },
  { step: 5, label: "مع مندوب التوصيل",       sublabel: "هتوصلك قريب جداً",               icon: UserCheck },
  { step: 6, label: "تم التسليم",             sublabel: "وصلت الشحنة بنجاح",             icon: CheckCircle },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function TrackResultPage() {
  const params = useParams<{ number: string }>();
  const [, navigate] = useLocation();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!params.number) return;
    setLoading(true);
    setError(null);
    fetch(`/api/shipments/track/${encodeURIComponent(params.number)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || "خطأ")))
      .then(data => { setShipment(data); setLoading(false); })
      .catch(err => { setError(typeof err === "string" ? err : "لم يتم العثور على الشحنة"); setLoading(false); });
  }, [params.number]);

  const cfg = shipment ? (STATUS_CONFIG[shipment.status] ?? STATUS_CONFIG.pending) : null;
  const StatusIcon = cfg?.icon ?? Package;

  const [darkMode, setDarkMode] = useState(true);

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col" dir="rtl">
      <Navbar darkMode={darkMode} toggleDarkMode={() => setDarkMode(p => !p)} />

      <main className="flex-1 flex flex-col items-center justify-start pt-24 sm:pt-28 pb-16 sm:pb-20 px-3 sm:px-4">
        {/* Back */}
        <button
          onClick={() => navigate("/")}
          className="self-start mb-6 sm:mb-8 flex items-center gap-2 text-xs sm:text-sm text-white/40 hover:text-white/80 transition-colors"
        >
          <ArrowRight size={16} />
          الرجوع للرئيسية
        </button>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-4 mt-10">
          <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
          <p className="text-white/40 text-sm">جاري البحث عن الشحنة...</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="w-full max-w-md mt-6 rounded-2xl p-8 text-center"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <XCircle size={40} className="mx-auto mb-4" style={{ color: "#ef4444" }} />
          <p className="text-white font-bold mb-1">لم يتم العثور على الشحنة</p>
          <p className="text-white/40 text-sm mb-6">{error}</p>
          <button onClick={() => navigate("/")}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-black"
            style={{ background: "linear-gradient(135deg,#fff,#d0d0d0)" }}>
            حاول مرة أخرى
          </button>
        </div>
      )}

      {/* Result */}
      {!loading && shipment && cfg && (
        <div className="w-full max-w-lg lg:max-w-2xl flex flex-col gap-4 sm:gap-5">

          {/* Status card */}
          <div className="rounded-2xl p-4 sm:p-6 text-center relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${cfg.color}1a 0%, rgba(255,255,255,0.04) 35%, rgba(0,0,0,0.3) 100%)`,
              border: `1px solid ${cfg.color}55`,
              boxShadow: `0 0 40px ${cfg.color}26, 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}>
            {/* shine overlay */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(120deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.04) 100%)" }} />
            <div className="relative">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{
                  background: `linear-gradient(135deg, ${cfg.color}33 0%, rgba(255,255,255,0.08) 50%, ${cfg.color}11 100%)`,
                  border: `1px solid ${cfg.color}66`,
                  boxShadow: `0 0 24px ${cfg.color}40, inset 0 1px 0 rgba(255,255,255,0.15)`,
                }}>
                <StatusIcon size={32} style={{ color: cfg.color, filter: `drop-shadow(0 0 8px ${cfg.color}99)` }} />
              </div>
              <p className="text-xl sm:text-2xl font-black mb-1 break-words"
                style={{
                  background: `linear-gradient(135deg, #fff 0%, ${cfg.color} 50%, #fff 100%)`,
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  filter: `drop-shadow(0 0 12px ${cfg.color}55)`,
                }}>{cfg.label}</p>
              <p className="text-xs text-white/40 break-all tracking-wider">
                {shipment.trackingNumber || shipment.shipmentNumber}
              </p>
            </div>
          </div>

          {/* Progress steps */}
          {shipment.status !== "returned" && (
            <div className="rounded-2xl p-3 sm:p-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(200,210,220,0.08) 0%, rgba(255,255,255,0.03) 40%, rgba(160,180,200,0.06) 70%, rgba(0,0,0,0.3) 100%)",
                border: "1px solid rgba(200,220,240,0.15)",
                boxShadow: `0 0 30px ${cfg.color}18, 0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.3)`,
              }}>
              {/* metallic sheen */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(110deg, rgba(255,255,255,0.07) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.04) 100%)" }} />
              <div className="flex items-center justify-between">
                {TIMELINE_STEPS.map((step, i) => {
                  const done    = i <= cfg.step;
                  const current = i === cfg.step;
                  const Icon    = step.icon;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <div className="relative flex items-center w-full">
                        {i > 0 && (
                          <div className="flex-1 h-px mr-1"
                            style={{ background: i <= cfg.step ? `linear-gradient(90deg, rgba(255,255,255,0.5), ${cfg.color}99)` : "rgba(255,255,255,0.1)" }} />
                        )}
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: done
                              ? (current
                                  ? `linear-gradient(135deg, ${cfg.color} 0%, #fff 50%, ${cfg.color} 100%)`
                                  : "linear-gradient(135deg, rgba(255,255,255,0.35), rgba(255,255,255,0.1))")
                              : "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                            border: `1.5px solid ${done ? (current ? cfg.color : "rgba(255,255,255,0.3)") : "rgba(255,255,255,0.08)"}`,
                            boxShadow: current ? `0 0 16px ${cfg.color}99, inset 0 1px 0 rgba(255,255,255,0.4)` : (done ? "inset 0 1px 0 rgba(255,255,255,0.2)" : "none"),
                          }}>
                          <Icon size={13} className="sm:hidden" style={{ color: done ? (current ? "#000" : "rgba(255,255,255,0.85)") : "rgba(255,255,255,0.2)" }} />
                          <Icon size={14} className="hidden sm:block" style={{ color: done ? (current ? "#000" : "rgba(255,255,255,0.85)") : "rgba(255,255,255,0.2)" }} />
                        </div>
                        {i < TIMELINE_STEPS.length - 1 && (
                          <div className="flex-1 h-px ml-1"
                            style={{ background: i < cfg.step ? `linear-gradient(90deg, ${cfg.color}99, rgba(255,255,255,0.5))` : "rgba(255,255,255,0.1)" }} />
                        )}
                      </div>
                      <span className="text-center break-words px-0.5" style={{ fontSize: 8, color: done ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)", lineHeight: 1.2 }}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="rounded-2xl p-4 sm:p-5 flex flex-col gap-4 relative overflow-hidden"
            style={{
              background: "linear-gradient(160deg, rgba(180,195,215,0.07) 0%, rgba(255,255,255,0.025) 30%, rgba(100,120,140,0.04) 60%, rgba(0,0,0,0.35) 100%)",
              border: "1px solid rgba(180,200,220,0.12)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25)",
            }}>
            {/* metallic sheen */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.05) 0%, transparent 40%, transparent 70%, rgba(255,255,255,0.03) 100%)" }} />
            <p className="text-xs text-white/30 font-bold tracking-widest border-b border-white/5 pb-3">تفاصيل الشحنة</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0">
                <p className="text-xs text-white/30 mb-1 flex items-center gap-1"><User size={10}/> المُرسِل</p>
                <p className="text-sm font-bold text-white break-words">{shipment.senderName}</p>
                {shipment.senderPhone && <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5" dir="ltr"><Phone size={10}/>{shipment.senderPhone}</p>}
                {shipment.senderCity  && <p className="text-xs text-white/30 mt-0.5 break-words"><MapPin size={10} className="inline ml-1"/>{shipment.senderCity}</p>}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white/30 mb-1 flex items-center gap-1"><User size={10}/> المُستلِم</p>
                <p className="text-sm font-bold text-white break-words">{shipment.receiverName}</p>
                {shipment.receiverPhone   && <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5" dir="ltr"><Phone size={10}/>{shipment.receiverPhone}</p>}
                {shipment.receiverCity    && <p className="text-xs text-white/30 mt-0.5 break-words"><MapPin size={10} className="inline ml-1"/>{shipment.receiverCity}</p>}
                {shipment.receiverAddress && <p className="text-xs text-white/25 mt-0.5 leading-tight break-words">{shipment.receiverAddress}</p>}
              </div>
            </div>

            {(shipment.parcelType || shipment.weight) && (
              <div className="flex gap-3 pt-2 border-t border-white/5">
                {shipment.parcelType && (
                  <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-xs text-white/30 mb-0.5">نوع الشحنة</p>
                    <p className="text-sm font-bold text-white">{shipment.parcelType}</p>
                  </div>
                )}
                {shipment.weight && (
                  <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-xs text-white/30 mb-0.5">الوزن</p>
                    <p className="text-sm font-bold text-white">{shipment.weight} كجم</p>
                  </div>
                )}
              </div>
            )}

            {shipment.notes && (
              <div className="pt-2 border-t border-white/5">
                <p className="text-xs text-white/30 mb-1">ملاحظات</p>
                <p className="text-sm text-white/60 break-words" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{shipment.notes}</p>
              </div>
            )}

            {/* ── مخزن و مندوب ── */}
            {(shipment.warehouseName || (COURIER_VISIBLE_STATUSES.has(shipment.status) && shipment.courierName)) && (
              <div className="pt-2 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {shipment.warehouseName && (
                  <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-xs text-white/30 mb-1 flex items-center gap-1">
                      <Warehouse size={10} />مكان الشحنة
                    </p>
                    <p className="text-sm font-bold text-white">
                      {shipment.warehouseName}
                      {shipment.warehouseCity && <span className="text-xs text-white/40 mr-1">({shipment.warehouseCity})</span>}
                    </p>
                  </div>
                )}
                {COURIER_VISIBLE_STATUSES.has(shipment.status) && shipment.courierName && (
                  <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-xs text-white/30 mb-1 flex items-center gap-1">
                      <UserCheck size={10} />مندوب التوصيل
                    </p>
                    <p className="text-sm font-bold text-white">{shipment.courierName}</p>
                    {shipment.courierPhone && (
                      <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1" dir="ltr">
                        <Phone size={10} />{shipment.courierPhone}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
      </main>

      <Footer />
    </div>
  );
}
