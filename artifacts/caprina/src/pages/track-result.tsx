import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Package, Truck, MapPin, CheckCircle, Clock, AlertTriangle, XCircle, ArrowRight, Phone, User } from "lucide-react";
import { Navbar, Footer } from "./home";

// ─── Types ────────────────────────────────────────────────────────────────────
type ShipmentStatus =
  | "pending" | "warehouse_ready" | "in_shipping" | "received"
  | "partial_received" | "delayed" | "returned";

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
}

// ─── Status config — تتطابق مع DB schema (نفس enum في shipments-page.tsx) ─────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Package; step: number }> = {
  pending:          { label: "قيد الانتظار",        color: "#facc15", bg: "rgba(250,204,21,0.1)",  icon: Clock,         step: 0 },
  warehouse_ready:  { label: "قيد الشحن في المخزن", color: "#fb923c", bg: "rgba(251,146,60,0.1)",  icon: Package,       step: 1 },
  in_shipping:      { label: "قيد الشحن",           color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  icon: Truck,         step: 2 },
  received:         { label: "تم الاستلام",         color: "#4ade80", bg: "rgba(74,222,128,0.1)",  icon: CheckCircle,   step: 3 },
  partial_received: { label: "استلام جزئي",         color: "#22d3ee", bg: "rgba(34,211,238,0.1)",  icon: CheckCircle,   step: 3 },
  delayed:          { label: "مؤجل",                color: "#f97316", bg: "rgba(249,115,22,0.1)",  icon: AlertTriangle, step: 2 },
  returned:         { label: "مرتجع",               color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: ArrowRight,    step: 2 },
};

const STEPS = [
  { label: "قيد الانتظار",        icon: Clock },
  { label: "قيد الشحن في المخزن", icon: Package },
  { label: "قيد الشحن",           icon: Truck },
  { label: "تم الاستلام",         icon: CheckCircle },
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
          <div className="rounded-2xl p-4 sm:p-6 text-center"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
            <StatusIcon size={40} className="mx-auto mb-3" style={{ color: cfg.color }} />
            <p className="text-xl sm:text-2xl font-black mb-1 break-words" style={{ color: cfg.color }}>{cfg.label}</p>
            <p className="text-xs text-white/40 break-all">
              {shipment.trackingNumber || shipment.shipmentNumber}
            </p>
          </div>

          {/* Progress steps */}
          {shipment.status !== "returned" && (
            <div className="rounded-2xl p-3 sm:p-5" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between">
                {STEPS.map((step, i) => {
                  const done    = i <= cfg.step;
                  const current = i === cfg.step;
                  const Icon    = step.icon;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <div className="relative flex items-center w-full">
                        {i > 0 && (
                          <div className="flex-1 h-px mr-1"
                            style={{ background: i <= cfg.step ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)" }} />
                        )}
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: done ? (current ? cfg.color : "rgba(255,255,255,0.15)") : "rgba(255,255,255,0.05)",
                            border: `1.5px solid ${done ? cfg.color : "rgba(255,255,255,0.1)"}`,
                            boxShadow: current ? `0 0 12px ${cfg.color}66` : "none",
                          }}>
                          <Icon size={13} className="sm:hidden" style={{ color: done ? (current ? "#fff" : "rgba(255,255,255,0.7)") : "rgba(255,255,255,0.2)" }} />
                          <Icon size={14} className="hidden sm:block" style={{ color: done ? (current ? "#fff" : "rgba(255,255,255,0.7)") : "rgba(255,255,255,0.2)" }} />
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className="flex-1 h-px ml-1"
                            style={{ background: i < cfg.step ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)" }} />
                        )}
                      </div>
                      <span className="text-center break-words px-0.5" style={{ fontSize: 8, color: done ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)", lineHeight: 1.2 }}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="rounded-2xl p-4 sm:p-5 flex flex-col gap-4" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)" }}>
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
          </div>

        </div>
      )}
      </main>

      <Footer />
    </div>
  );
}
