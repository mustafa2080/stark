import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Package, Truck, MapPin, CheckCircle, Clock,
  AlertTriangle, ArrowRight, Phone, User, XCircle,
} from "lucide-react";
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
  receiverName: string;
  receiverPhone?: string;
  receiverCity?: string;
  receiverAddress?: string;
  status: string;
  parcelType?: string;
  weight?: string | number;
  notes?: string;
  createdAt?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Package; step: number }> = {
  pending:          { label: "قيد الانتظار",        color: "#facc15", bg: "rgba(250,204,21,0.1)",  icon: Clock,         step: 0 },
  warehouse_ready:  { label: "قيد الشحن في المخزن", color: "#fb923c", bg: "rgba(251,146,60,0.1)",  icon: Package,       step: 1 },
  in_shipping:      { label: "قيد الشحن",           color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  icon: Truck,         step: 2 },
  received:         { label: "تم الاستلام",         color: "#4ade80", bg: "rgba(74,222,128,0.1)",  icon: CheckCircle,   step: 3 },
  partial_received: { label: "استلام جزئي",         color: "#22d3ee", bg: "rgba(34,211,238,0.1)",  icon: CheckCircle,   step: 3 },
  delayed:          { label: "مؤجل",                color: "#f97316", bg: "rgba(249,115,22,0.1)",  icon: AlertTriangle, step: 2 },
  returned:         { label: "مرتجع",               color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: ArrowRight,    step: 2 },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function TrackClientPage() {
  const [location, navigate] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
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
              return (
                <div
                  key={shipment.id}
                  className="rounded-2xl p-5 relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${cfg.color}12 0%, rgba(255,255,255,0.03) 40%, rgba(0,0,0,0.3) 100%)`,
                    border: `1px solid ${cfg.color}40`,
                    boxShadow: `0 0 30px ${cfg.color}18, 0 8px 32px rgba(0,0,0,0.4)`,
                  }}
                >
                  {/* shine */}
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(120deg, rgba(255,255,255,0.05) 0%, transparent 40%)" }} />

                  <div className="relative flex items-start gap-4">
                    {/* Status icon */}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${cfg.color}30, rgba(255,255,255,0.06))`,
                        border: `1px solid ${cfg.color}55`,
                        boxShadow: `0 0 16px ${cfg.color}33`,
                      }}>
                      <StatusIcon size={22} style={{ color: cfg.color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Status + tracking */}
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span className="font-black text-sm" style={{ color: cfg.color }}>{cfg.label}</span>
                        <span className="text-xs text-white/30 font-mono" dir="ltr">
                          {shipment.trackingNumber || shipment.shipmentNumber || `#${shipment.id}`}
                        </span>
                      </div>

                      {/* Receiver */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <User size={11} className="text-white/30" />
                          <span className="text-sm font-bold text-white">{shipment.receiverName}</span>
                        </div>
                        {shipment.receiverPhone && (
                          <div className="flex items-center gap-1.5" dir="ltr">
                            <Phone size={11} className="text-white/30" />
                            <span className="text-xs text-white/50">{shipment.receiverPhone}</span>
                          </div>
                        )}
                        {shipment.receiverCity && (
                          <div className="flex items-center gap-1">
                            <MapPin size={11} className="text-white/30" />
                            <span className="text-xs text-white/40">{shipment.receiverCity}</span>
                          </div>
                        )}
                      </div>

                      {/* Details row */}
                      {(shipment.parcelType || shipment.weight) && (
                        <div className="flex gap-3 mt-2">
                          {shipment.parcelType && (
                            <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.07)" }}>
                              {shipment.parcelType}
                            </span>
                          )}
                          {shipment.weight && (
                            <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.07)" }}>
                              {shipment.weight} كجم
                            </span>
                          )}
                        </div>
                      )}

                      {/* Notes */}
                      {shipment.notes && (
                        <p className="text-xs text-white/30 mt-2 leading-relaxed">{shipment.notes}</p>
                      )}
                    </div>
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
