import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowRight, Package, Truck, CheckCircle2, Clock, MapPin,
  Phone, User, Warehouse, RotateCcw, XCircle, AlertTriangle,
  Copy, Receipt,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

// ── ترتيب مراحل التتبع الأساسية ─────────────────────────────────────────
const TIMELINE_STEPS = [
  { key: "confirmed",   label: "تم تأكيد الطلب",       icon: Receipt },
  { key: "warehouse",   label: "استلام في المخزن",      icon: Warehouse },
  { key: "in_transit",  label: "قيد التوصيل",           icon: Truck },
  { key: "delivered",   label: "تم التسليم",            icon: CheckCircle2 },
];

function stepIndexForStatus(status: string): number {
  if (["pending", "waiting", "confirmed"].includes(status)) return 0;
  if (["warehouse_ready", "at_warehouse", "still_in_warehouse"].includes(status)) return 1;
  if (["in_transit", "picked_up", "out_for_delivery", "with_courier"].includes(status)) return 2;
  if (["delivered", "received", "partial_received"].includes(status)) return 3;
  return -1; // حالات خاصة (مرتجع/ملغي/متأخر) تتعامل بشكل منفصل
}

function specialStatusMeta(status: string) {
  if (status === "returned" || status === "returned_to_warehouse") return { label: "تم إرجاع الشحنة", color: "#db2777", icon: RotateCcw };
  if (status === "cancelled") return { label: "تم إلغاء الشحنة", color: "#dc2626", icon: XCircle };
  if (status === "delayed") return { label: "الشحنة متأخرة", color: "#d97706", icon: AlertTriangle };
  return null;
}

// ── Timeline component ────────────────────────────────────────────────────
function StatusTimeline({ status }: { status: string }) {
  const special = specialStatusMeta(status);
  const activeIdx = stepIndexForStatus(status);

  if (special) {
    const Icon = special.icon;
    return (
      <div className="rounded-2xl p-6 flex flex-col items-center gap-3"
        style={{ background: `${special.color}12`, border: `1px solid ${special.color}33` }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${special.color}22` }}>
          <Icon size={30} style={{ color: special.color }} />
        </div>
        <p className="text-base font-black" style={{ color: special.color }}>{special.label}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between relative">
        <div className="absolute top-5 right-5 left-5 h-0.5" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="absolute top-5 right-5 h-0.5 transition-all duration-700"
          style={{
            background: "#22c55e",
            width: activeIdx <= 0 ? "0%" : `${(activeIdx / (TIMELINE_STEPS.length - 1)) * 100}%`,
            left: "auto",
          }} />
        {TIMELINE_STEPS.map((step, i) => {
          const done = i <= activeIdx;
          const Icon = step.icon;
          return (
            <div key={step.key} className="relative flex flex-col items-center gap-2 z-10" style={{ flex: 1 }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-500"
                style={{
                  background: done ? "#22c55e" : "rgba(255,255,255,0.06)",
                  border: done ? "none" : "1px solid rgba(255,255,255,0.1)",
                }}>
                <Icon size={16} color={done ? "#052e13" : "rgba(255,255,255,0.3)"} />
              </div>
              <span className="text-[11px] text-center font-bold" style={{ color: done ? "#fff" : "rgba(255,255,255,0.35)" }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
        <Icon size={14} className="text-white/40" />
      </div>
      <span className="text-xs text-white/40 flex-shrink-0 w-24">{label}</span>
      <span className="text-sm text-white/85 font-bold truncate">{value || "—"}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════
export default function ClientShipmentPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ shipment: any; items: any[] }>({
    queryKey: ["client-shipment", id],
    queryFn: () => apiFetch(`/client-portal/shipments/${id}`),
    enabled: !!user && !!id,
  });

  const shipment = data?.shipment;
  const items = data?.items ?? [];

  const copyTracking = () => {
    if (!shipment?.trackingNumber) return;
    navigator.clipboard.writeText(shipment.trackingNumber);
    toast({ title: "تم النسخ", description: "تم نسخ كود التتبع" });
  };

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6" style={{ background: "#0a0a0a" }} dir="rtl">
      <div className="max-w-[900px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/client-dashboard")}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/60"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <ArrowRight size={16} />
          </button>
          <div>
            <h1 className="text-xl font-black text-white">تفاصيل الشحنة</h1>
            <p className="text-xs text-white/40">متابعة حالة شحنتك لحظة بلحظة</p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-white/30">جارٍ التحميل...</div>
        ) : error || !shipment ? (
          <div className="rounded-2xl p-10 flex flex-col items-center gap-3 text-white/30"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Package size={40} className="opacity-30" />
            <p className="text-sm">تعذر العثور على هذه الشحنة أو لا تملك صلاحية عرضها</p>
          </div>
        ) : (
          <>

            {/* ── Tracking code header ── */}
            <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">كود التتبع:</span>
                <span className="font-mono text-white font-bold">{shipment.trackingNumber || shipment.shipmentNumber || shipment.id}</span>
              </div>
              <button onClick={copyTracking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                <Copy size={12} /> نسخ
              </button>
            </div>

            {/* ── Timeline ── */}
            <StatusTimeline status={shipment.status} />

            {/* ── Details grid ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs text-white/40 mb-2 font-bold">بيانات الاستلام</p>
                <InfoRow icon={User} label="المستلم" value={shipment.receiverName} />
                <InfoRow icon={Phone} label="الهاتف" value={shipment.receiverPhone} />
                <InfoRow icon={MapPin} label="المدينة" value={shipment.receiverCity} />
                <InfoRow icon={MapPin} label="العنوان" value={shipment.receiverAddress} />
              </div>

              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs text-white/40 mb-2 font-bold">بيانات الشحنة</p>
                <InfoRow icon={Receipt} label="قيمة الطرد" value={`${fn(Number(shipment.codAmount ?? 0))} ج.م`} />
                <InfoRow icon={Package} label="عدد القطع" value={items.length || shipment.piecesCount || 1} />
                <InfoRow icon={Clock} label="تاريخ الإنشاء"
                  value={shipment.createdAt ? new Date(shipment.createdAt).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" }) : "—"} />
                {shipment.notes && <InfoRow icon={AlertTriangle} label="ملاحظات" value={shipment.notes} />}
              </div>
            </div>

            {/* ── Items list (لو موجودين) ── */}
            {items.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs text-white/40 mb-3 font-bold">محتويات الشحنة</p>
                <div className="space-y-2">
                  {items.map((it: any, i: number) => (
                    <div key={it.id ?? i} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                      style={{ background: "rgba(255,255,255,0.03)" }}>
                      <span className="text-white/80">{it.productName || it.name || `الصنف ${i + 1}`}</span>
                      <span className="text-white/50 text-xs">الكمية: {it.quantity ?? 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
