import { useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// ShipmentStatusHero
// حاوية كبيرة فوق نتائج التتبع، بتعرض رسمة SVG واقعية متحركة حسب حالة الشحنة.
// ─────────────────────────────────────────────────────────────────────────────

type StatusGroup =
  | "pending"      // قيد الانتظار / تم التأكيد
  | "warehouse"    // في المخزن
  | "shipping"     // قيد الشحن (شاحنة بتجري)
  | "courier"      // مع المندوب / خرجت للتسليم
  | "delivered"    // تم التسليم
  | "exception";   // مرتجعة / ملغية / مؤجلة

const STATUS_GROUP_MAP: Record<string, StatusGroup> = {
  pending: "pending",
  waiting: "pending",
  confirmed: "pending",
  warehouse_ready: "warehouse",
  at_warehouse: "warehouse",
  picked_up: "shipping",
  in_shipping: "shipping",
  in_transit: "shipping",
  with_courier: "courier",
  out_for_delivery: "courier",
  received: "delivered",
  delivered: "delivered",
  partial_received: "delivered",
  return_delivered: "delivered",
  delayed: "exception",
  returned: "exception",
  returned_to_warehouse: "exception",
  cancelled: "exception",
};

const GROUP_META: Record<StatusGroup, { title: string; subtitle: string; accent: string; accent2: string; glow: string }> = {
  pending:   { title: "قيد الانتظار",      subtitle: "طلبك تم استلامه وفي انتظار التجهيز",       accent: "#facc15", accent2: "#fde68a", glow: "rgba(250,204,21,0.35)" },
  warehouse: { title: "في مخزن الشحن",     subtitle: "شحنتك الآن داخل أحد مخازننا للتجهيز",       accent: "#2dd4bf", accent2: "#5eead4", glow: "rgba(45,212,191,0.35)" },
  shipping:  { title: "قيد الشحن",         subtitle: "الشحنة في الطريق إليك الآن",                accent: "#60a5fa", accent2: "#93c5fd", glow: "rgba(96,165,250,0.35)" },
  courier:   { title: "مع مندوب التوصيل",  subtitle: "المندوب في طريقه لتسليم الشحنة",            accent: "#f97316", accent2: "#fdba74", glow: "rgba(249,115,22,0.35)" },
  delivered: { title: "تم التسليم بنجاح",  subtitle: "تم تسليم الشحنة بنجاح، شكراً لثقتك بنا",    accent: "#4ade80", accent2: "#86efac", glow: "rgba(74,222,128,0.35)" },
  exception: { title: "تنبيه بخصوص الشحنة", subtitle: "هناك تحديث يحتاج انتباهك بخصوص هذه الشحنة", accent: "#f87171", accent2: "#fca5a5", glow: "rgba(248,113,113,0.35)" },
};

interface ShipmentStatusHeroProps {
  status: string;
  trackingNumber?: string;
  returnReason?: string | null;
}

export default function ShipmentStatusHero({ status, trackingNumber, returnReason }: ShipmentStatusHeroProps) {
  const group = useMemo<StatusGroup>(() => STATUS_GROUP_MAP[status] ?? "pending", [status]);
  const meta = GROUP_META[group];

  return (
    <div
      className="w-full max-w-2xl mb-6 rounded-3xl relative overflow-hidden"
      style={{
        background: `linear-gradient(160deg, ${meta.accent}14 0%, rgba(255,255,255,0.025) 45%, rgba(0,0,0,0.35) 100%)`,
        border: `1px solid ${meta.accent}3a`,
        boxShadow: `0 0 60px ${meta.glow}, 0 20px 50px rgba(0,0,0,0.45)`,
      }}
    >
      {/* خلفية متوهجة ناعمة */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${meta.glow}, transparent 70%)`,
        }}
      />

      <div className="relative px-5 sm:px-8 pt-7 pb-6 flex flex-col items-center">
        {/* الرسمة */}
        <div className="w-full flex items-center justify-center" style={{ height: 180 }}>
          <StatusIllustration group={group} accent={meta.accent} accent2={meta.accent2} />
        </div>

        {/* النص */}
        <div className="text-center mt-3">
          <h2
            className="text-xl sm:text-2xl font-black mb-1"
            style={{ color: meta.accent, textShadow: `0 0 24px ${meta.glow}` }}
          >
            {meta.title}
          </h2>
          <p className="text-white/50 text-xs sm:text-sm">{meta.subtitle}</p>
          {group === "exception" && returnReason && (
            <div
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold"
              style={{
                background: `${meta.accent}1f`,
                border: `1px solid ${meta.accent}55`,
                color: meta.accent,
              }}
            >
              السبب: {returnReason}
            </div>
          )}
          {trackingNumber && (
            <p className="text-white/25 text-[11px] mt-2 font-mono" dir="ltr">
              #{trackingNumber}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusIllustration — بوابة اختيار الرسمة المناسبة
// ─────────────────────────────────────────────────────────────────────────────
function StatusIllustration({ group, accent, accent2 }: { group: StatusGroup; accent: string; accent2: string }) {
  switch (group) {
    case "pending":
      return <PendingIllustration accent={accent} accent2={accent2} />;
    case "warehouse":
      return <WarehouseIllustration accent={accent} accent2={accent2} />;
    case "shipping":
      return <ShippingTruckIllustration accent={accent} accent2={accent2} />;
    case "courier":
      return <CourierScooterIllustration accent={accent} accent2={accent2} />;
    case "delivered":
      return <DeliveredIllustration accent={accent} accent2={accent2} />;
    case "exception":
      return <ExceptionIllustration accent={accent} accent2={accent2} />;
    default:
      return <PendingIllustration accent={accent} accent2={accent2} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) قيد الانتظار — صندوق على منضدة + ساعة نابضة بهدوء
// ─────────────────────────────────────────────────────────────────────────────
function PendingIllustration({ accent, accent2 }: { accent: string; accent2: string }) {
  return (
    <svg viewBox="0 0 320 180" width="280" height="158" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="pendingBoxTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent2} stopOpacity="0.95" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="pendingBoxSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.25" />
        </linearGradient>
        <radialGradient id="pendingFloorGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* وهج أرضي */}
      <ellipse cx="160" cy="148" rx="95" ry="14" fill="url(#pendingFloorGlow)" />

      {/* ظل الصندوق */}
      <ellipse cx="150" cy="150" rx="58" ry="9" fill="black" opacity="0.35">
        <animate attributeName="rx" values="58;62;58" dur="3s" repeatCount="indefinite" />
      </ellipse>

      {/* الصندوق — يتمايل بهدوء (انتظار) */}
      <g transform="translate(150,118)">
        <animateTransform attributeName="transform" type="rotate" values="0;1.2;0;-1.2;0" dur="4s" repeatCount="indefinite" additive="sum" />
        <g transform="translate(-46,-40)">
          {/* جانب يمين */}
          <path d="M70,8 L92,18 L92,72 L70,64 Z" fill="url(#pendingBoxSide)" stroke={accent} strokeOpacity="0.4" strokeWidth="1" />
          {/* جانب يسار */}
          <path d="M0,18 L70,8 L70,64 L0,72 Z" fill={accent} fillOpacity="0.35" stroke={accent} strokeOpacity="0.4" strokeWidth="1" />
          {/* السطح العلوي */}
          <path d="M0,18 L46,0 L92,18 L70,8 L0,18 Z" fill="url(#pendingBoxTop)" stroke={accent2} strokeOpacity="0.6" strokeWidth="1" />
          {/* شريط لاصق متقاطع */}
          <path d="M46,0 L46,72" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeDasharray="4 3" />
          <path d="M2,20 L90,20" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        </g>
      </g>

      {/* ساعة معلقة فوق الصندوق — نبض هادئ */}
      <g transform="translate(150,46)">
        <circle r="22" fill="rgba(0,0,0,0.35)" stroke={accent} strokeOpacity="0.55" strokeWidth="2.5">
          <animate attributeName="r" values="22;23.5;22" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle r="22" fill="none" stroke={accent2} strokeOpacity="0.25" strokeWidth="6">
          <animate attributeName="stroke-opacity" values="0.1;0.35;0.1" dur="2.2s" repeatCount="indefinite" />
        </circle>
        {/* عقارب الساعة */}
        <line x1="0" y1="0" x2="0" y2="-11" stroke={accent2} strokeWidth="2.2" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite" />
        </line>
        <line x1="0" y1="0" x2="8" y2="0" stroke={accent2} strokeWidth="2" strokeLinecap="round" opacity="0.85">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3s" repeatCount="indefinite" />
        </line>
        <circle r="2" fill={accent2} />
        {/* أجراس صغيرة فوق الساعة */}
        <path d="M-15,-19 L-19,-25" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        <path d="M15,-19 L19,-25" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* نقاط انتظار "..." متتابعة */}
      <g transform="translate(150,154)">
        {[-14, 0, 14].map((dx, i) => (
          <circle key={i} cx={dx} cy="0" r="3" fill={accent}>
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.4s" begin={`${i * 0.22}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) في المخزن — واجهة مخزن بأرفف وصناديق ورافعة شوكية صغيرة
// ─────────────────────────────────────────────────────────────────────────────
function WarehouseIllustration({ accent, accent2 }: { accent: string; accent2: string }) {
  return (
    <svg viewBox="0 0 320 180" width="280" height="158" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="whRoof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent2} stopOpacity="0.9" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="whWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.06" />
        </linearGradient>
        <radialGradient id="whFloorGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="160" cy="160" rx="130" ry="12" fill="url(#whFloorGlow)" />

      {/* هيكل المخزن */}
      <g transform="translate(60,28)">
        {/* سقف مثلث (Truss) */}
        <path d="M0,28 L100,0 L200,28" fill="none" stroke={accent} strokeOpacity="0.6" strokeWidth="2.5" />
        <path d="M100,0 L100,28" stroke={accent} strokeOpacity="0.4" strokeWidth="1.5" />
        <path d="M50,14 L50,28 M150,14 L150,28" stroke={accent} strokeOpacity="0.3" strokeWidth="1.2" />

        {/* جسم المبنى */}
        <rect x="0" y="28" width="200" height="92" fill="url(#whWall)" stroke={accent} strokeOpacity="0.35" strokeWidth="1.5" rx="2" />

        {/* أرفف داخلية — 3 مستويات */}
        {[0, 1, 2].map((row) => (
          <g key={row} transform={`translate(14,${40 + row * 26})`}>
            <line x1="0" y1="0" x2="172" y2="0" stroke={accent} strokeOpacity="0.25" strokeWidth="1.5" />
            {[0, 1, 2, 3, 4].map((col) => {
              const filled = (row + col) % 2 === 0;
              return filled ? (
                <rect
                  key={col}
                  x={6 + col * 34}
                  y={-15}
                  width="22"
                  height="15"
                  rx="2"
                  fill={col % 2 === 0 ? accent2 : accent}
                  fillOpacity="0.55"
                  stroke={accent2}
                  strokeOpacity="0.4"
                  strokeWidth="1"
                >
                  <animate
                    attributeName="fill-opacity"
                    values="0.45;0.65;0.45"
                    dur="3s"
                    begin={`${(row * 5 + col) * 0.18}s`}
                    repeatCount="indefinite"
                  />
                </rect>
              ) : null;
            })}
          </g>
        ))}

        {/* باب رول كبير في النص بيلمع بهدوء */}
        <rect x="74" y="62" width="52" height="58" rx="3" fill="rgba(0,0,0,0.25)" stroke={accent2} strokeOpacity="0.5" strokeWidth="1.5" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="74" y1={68 + i * 10} x2="126" y2={68 + i * 10} stroke={accent2} strokeOpacity="0.2" strokeWidth="1" />
        ))}
      </g>

      {/* رافعة شوكية صغيرة بتتحرك يمين وشمال أمام المخزن */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="-18,0; 18,0; -18,0" dur="5s" repeatCount="indefinite" />
        <g transform="translate(160,150)">
          {/* عجل */}
          <circle cx="-14" cy="10" r="6" fill="#1a1a1a" stroke={accent} strokeOpacity="0.5" strokeWidth="1.5" />
          <circle cx="12" cy="10" r="6" fill="#1a1a1a" stroke={accent} strokeOpacity="0.5" strokeWidth="1.5" />
          {/* جسم الرافعة */}
          <rect x="-22" y="-14" width="36" height="18" rx="3" fill={accent} fillOpacity="0.5" stroke={accent2} strokeOpacity="0.6" strokeWidth="1.2" />
          {/* الشوكة */}
          <rect x="13" y="-6" width="14" height="3" fill={accent2} />
          <rect x="13" y="2" width="14" height="3" fill={accent2} />
          {/* صندوق محمول */}
          <rect x="22" y="-22" width="14" height="14" rx="2" fill={accent2} fillOpacity="0.8" />
          {/* السائق */}
          <circle cx="-6" cy="-22" r="5" fill={accent2} fillOpacity="0.9" />
        </g>
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) قيد الشحن — شاحنة شحن واقعية بتجري على طريق متحرك (animation فعلي)
// ─────────────────────────────────────────────────────────────────────────────
function ShippingTruckIllustration({ accent, accent2 }: { accent: string; accent2: string }) {
  return (
    <svg viewBox="0 0 320 180" width="280" height="158" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="truckCab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent2} stopOpacity="0.95" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="truckBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8eef5" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#c5ccd6" stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id="truckFloorGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id="truckSpeedClip">
          <rect x="0" y="0" width="320" height="180" />
        </clipPath>
      </defs>

      <ellipse cx="160" cy="158" rx="135" ry="12" fill="url(#truckFloorGlow)" />

      {/* خط الطريق — متحرك بسرعة يعطي إحساس الجري */}
      <g clipPath="url(#truckSpeedClip)">
        <line x1="0" y1="158" x2="320" y2="158" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <line x1="0" y1="158" x2="320" y2="158" stroke={accent2} strokeOpacity="0.5" strokeWidth="3" strokeDasharray="22 18">
          <animate attributeName="stroke-dashoffset" from="0" to="-80" dur="1s" repeatCount="indefinite" />
        </line>

        {/* خطوط سرعة خلف الشاحنة */}
        {[0, 1, 2].map((i) => (
          <line key={i} x1="280" y1={120 + i * 12} x2="240" y2={120 + i * 12} stroke={accent2} strokeOpacity="0.45" strokeWidth="2.5" strokeLinecap="round">
            <animate attributeName="x1" values="320;220" dur="0.7s" begin={`${i * 0.12}s`} repeatCount="indefinite" />
            <animate attributeName="x2" values="280;180" dur="0.7s" begin={`${i * 0.12}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.6;0" dur="0.7s" begin={`${i * 0.12}s`} repeatCount="indefinite" />
          </line>
        ))}
      </g>

      {/* الشاحنة كلها — رجة خفيفة لأعلى وأسفل توحي بالحركة على الطريق */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,0; 0,-2.5; 0,0" dur="0.45s" repeatCount="indefinite" />
        <g transform="translate(75,86)">
          {/* صندوق الشحن (الخلفي) */}
          <rect x="0" y="0" width="118" height="56" rx="4" fill="url(#truckBox)" stroke={accent} strokeOpacity="0.4" strokeWidth="1.5" />
          {/* خط شعار/شريط على الصندوق */}
          <rect x="0" y="38" width="118" height="9" fill={accent} fillOpacity="0.55" />
          <text x="59" y="26" textAnchor="middle" fontSize="13" fontWeight="900" fill={accent} fillOpacity="0.75" fontFamily="Arial">STARK</text>

          {/* الكابينة (الأمامية) */}
          <path d="M118,10 L150,10 Q160,10 162,22 L162,56 L118,56 Z" fill="url(#truckCab)" stroke={accent2} strokeOpacity="0.55" strokeWidth="1.5" />
          {/* زجاج الكابينة */}
          <path d="M124,16 L148,16 Q154,16 156,24 L156,32 L124,32 Z" fill="rgba(180,220,255,0.55)" stroke={accent2} strokeOpacity="0.3" strokeWidth="1" />
          {/* مصدات */}
          <rect x="159" y="44" width="6" height="8" fill="#222" rx="1" />
          {/* ضوء أمامي */}
          <circle cx="160" cy="40" r="3" fill="#fff7cc">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="0.5s" repeatCount="indefinite" />
          </circle>

          {/* عجلات */}
          <g>
            <circle cx="22" cy="58" r="11" fill="#161616" stroke="#3a3a3a" strokeWidth="2" />
            <circle cx="22" cy="58" r="4.5" fill={accent2} fillOpacity="0.7" />
            <circle cx="100" cy="58" r="11" fill="#161616" stroke="#3a3a3a" strokeWidth="2" />
            <circle cx="100" cy="58" r="4.5" fill={accent2} fillOpacity="0.7" />
            <circle cx="140" cy="58" r="11" fill="#161616" stroke="#3a3a3a" strokeWidth="2" />
            <circle cx="140" cy="58" r="4.5" fill={accent2} fillOpacity="0.7" />
            {/* دوران العجل */}
            {[22, 100, 140].map((cx, i) => (
              <line key={i} x1={cx} y1="50" x2={cx} y2="66" stroke="#555" strokeWidth="1.5">
                <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} 58`} to={`360 ${cx} 58`} dur="0.35s" repeatCount="indefinite" />
              </line>
            ))}
          </g>

          {/* عادم دخان خفيف */}
          <circle cx="-4" cy="46" r="3" fill="rgba(255,255,255,0.25)">
            <animate attributeName="cx" values="-4;-22" dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="r" values="2;7" dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </g>
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) مع مندوب التوصيل — سكوتر توصيل بصندوق خلفي متحرك بسرعة على الطريق
// ─────────────────────────────────────────────────────────────────────────────
function CourierScooterIllustration({ accent, accent2 }: { accent: string; accent2: string }) {
  return (
    <svg viewBox="0 0 320 180" width="280" height="158" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="scooterBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent2} stopOpacity="0.95" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id="scooterFloorGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id="scooterSpeedClip">
          <rect x="0" y="0" width="320" height="180" />
        </clipPath>
      </defs>

      <ellipse cx="160" cy="158" rx="135" ry="12" fill="url(#scooterFloorGlow)" />

      {/* الطريق المتحرك */}
      <g clipPath="url(#scooterSpeedClip)">
        <line x1="0" y1="160" x2="320" y2="160" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <line x1="0" y1="160" x2="320" y2="160" stroke={accent2} strokeOpacity="0.5" strokeWidth="3" strokeDasharray="18 14">
          <animate attributeName="stroke-dashoffset" from="0" to="-64" dur="0.7s" repeatCount="indefinite" />
        </line>
        {[0, 1, 2].map((i) => (
          <line key={i} x1="250" y1={118 + i * 10} x2="220" y2={118 + i * 10} stroke={accent2} strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round">
            <animate attributeName="x1" values="280;180" dur="0.5s" begin={`${i * 0.1}s`} repeatCount="indefinite" />
            <animate attributeName="x2" values="250;150" dur="0.5s" begin={`${i * 0.1}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.6;0" dur="0.5s" begin={`${i * 0.1}s`} repeatCount="indefinite" />
          </line>
        ))}
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) تم التسليم بنجاح — صندوق مفتوح وعلامة صح متوهجة
// ─────────────────────────────────────────────────────────────────────────────
function DeliveredIllustration({ accent, accent2 }: { accent: string; accent2: string }) {
  return (
    <svg viewBox="0 0 320 180" width="280" height="158" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="deliveredBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent2} stopOpacity="0.95" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id="deliveredGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* وهج أرضي */}
      <ellipse cx="160" cy="155" rx="100" ry="12" fill="url(#deliveredGlow)" />
      {/* ظل الصندوق */}
      <ellipse cx="160" cy="150" rx="62" ry="9" fill="black" opacity="0.3" />

      {/* الصندوق المفتوح */}
      <g transform="translate(160,118)">
        {/* جانب يسار */}
        <path d="M-55,-10 L-2,-26 L-2,32 L-55,46 Z" fill={accent} fillOpacity="0.45" stroke={accent} strokeOpacity="0.4" strokeWidth="1" />
        {/* جانب يمين */}
        <path d="M55,-10 L2,-26 L2,32 L55,46 Z" fill="url(#deliveredBox)" stroke={accent2} strokeOpacity="0.5" strokeWidth="1" />
        {/* الفتحات الداخلية (الصندوق مفتوح) */}
        <path d="M-55,-10 L-2,-26 L55,-10 L2,6 Z" fill={accent} fillOpacity="0.2" stroke={accent} strokeOpacity="0.5" strokeWidth="1" />

        {/* غطاء الصندوق المفتوح — يسار */}
        <path d="M-55,-10 L-30,-44 L20,-30 L-2,-26 Z" fill={accent2} fillOpacity="0.55" stroke={accent2} strokeOpacity="0.4" strokeWidth="1">
          <animateTransform attributeName="transform" type="rotate" values="0 -55 -10; -8 -55 -10; 0 -55 -10" dur="2.4s" repeatCount="indefinite" />
        </path>
        {/* غطاء الصندوق المفتوح — يمين */}
        <path d="M55,-10 L30,-44 L-20,-30 L2,-26 Z" fill={accent2} fillOpacity="0.4" stroke={accent2} strokeOpacity="0.4" strokeWidth="1">
          <animateTransform attributeName="transform" type="rotate" values="0 55 -10; 8 55 -10; 0 55 -10" dur="2.4s" repeatCount="indefinite" />
        </path>
      </g>

      {/* دائرة العلامة الناجحة */}
      <g transform="translate(160,72)">
        <circle r="26" fill={accent} fillOpacity="0.18" />
        <circle r="20" fill="url(#deliveredBox)" stroke="white" strokeOpacity="0.25" strokeWidth="1.5">
          <animate attributeName="r" values="18;21;18" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <path d="M-9,0 L-2,8 L11,-9" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <animate attributeName="opacity" values="0;1;1" dur="0.6s" begin="0.2s" fill="freeze" />
        </path>
        {/* توهج نابض حول العلامة */}
        <circle r="26" fill="none" stroke={accent2} strokeOpacity="0.3" strokeWidth="2">
          <animate attributeName="r" values="22;32;22" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) استثناء — مرتجع / ملغي / مؤجل
// ─────────────────────────────────────────────────────────────────────────────
function ExceptionIllustration({ accent, accent2 }: { accent: string; accent2: string }) {
  return (
    <svg viewBox="0 0 320 180" width="280" height="158" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="excBox" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent2} stopOpacity="0.9" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* أرضية */}
      <ellipse cx="160" cy="155" rx="90" ry="10" fill={accent} fillOpacity="0.12" />
      {/* صندوق مرتجع */}
      <rect x="110" y="80" width="100" height="70" rx="8" fill="url(#excBox)" />
      <rect x="110" y="80" width="100" height="18" rx="8" fill={accent} fillOpacity="0.3" />
      {/* سهم إرجاع */}
      <path d="M145 55 Q130 40 115 55 Q100 70 115 80" stroke={accent2} strokeWidth="3" fill="none" strokeLinecap="round">
        <animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="1.2s" repeatCount="indefinite" />
      </path>
      <polygon points="108,76 118,76 113,86" fill={accent2}>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="1.2s" repeatCount="indefinite" />
      </polygon>
      {/* علامة X */}
      <line x1="140" y1="105" x2="180" y2="140" stroke="white" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.8" />
      <line x1="180" y1="105" x2="140" y2="140" stroke="white" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.8" />
    </svg>
  );
}
