import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Package, Truck, MapPin, CheckCircle, Clock, AlertTriangle, XCircle, ArrowRight, Phone, User, Warehouse, UserCheck, CircleCheck } from "lucide-react";
import { Navbar, Footer } from "./home";

// ─── Status Illustration Banner ───────────────────────────────────────────────
function StatusIllustration({ status, color, warehouseName, courierName }: { status: string; color: string; warehouseName?: string | null; courierName?: string | null }) {
  // تصنيف الحالات
  const isPending    = ["pending","waiting","confirmed"].includes(status);
  const isWarehouse  = ["warehouse_ready","at_warehouse"].includes(status);
  const isShipping   = ["in_shipping","in_transit","picked_up"].includes(status);
  const isCourier    = ["with_courier","out_for_delivery"].includes(status);
  const isDelivered  = ["delivered","received","partial_received"].includes(status);
  const isReturned   = ["returned","returned_to_warehouse","return_delivered"].includes(status);
  const isCancelled  = status === "cancelled";
  const isDelayed    = status === "delayed";

  const c = color; // لون الحالة الحالية

  return (
    <div className="w-full rounded-2xl overflow-hidden relative flex items-center justify-center"
      style={{
        height: 220,
        background: `radial-gradient(ellipse at 50% 30%, ${c}22 0%, ${c}08 40%, rgba(0,0,0,0.6) 100%)`,
        border: `1px solid ${c}33`,
        boxShadow: `0 0 60px ${c}18, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}>

      {/* ── خلفية زخرفية ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* نقاط grid */}
        <svg width="100%" height="100%" className="absolute inset-0 opacity-10">
          <defs>
            <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill={c} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
        {/* حلقات ضوئية */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full opacity-20"
          style={{ background: `radial-gradient(circle, ${c}55 0%, transparent 70%)` }} />
      </div>

      {/* ══ PENDING / CONFIRMED ══ */}
      {isPending && (
        <div className="relative flex flex-col items-center gap-3">
          <style>{`
            @keyframes floatBox { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
            @keyframes shadowPulse { 0%,100%{transform:scaleX(1);opacity:0.5} 50%{transform:scaleX(0.6);opacity:0.15} }
            @keyframes dotBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }
          `}</style>
          {/* صندوق طرد */}
          <svg width="110" height="110" viewBox="0 0 110 110" style={{ animation:"floatBox 2.4s ease-in-out infinite" }}>
            {/* الجسم */}
            <rect x="15" y="45" width="80" height="55" rx="5" fill={`${c}22`} stroke={c} strokeWidth="1.5"/>
            {/* الغطاء */}
            <path d="M12 45 Q55 30 98 45" fill={`${c}18`} stroke={c} strokeWidth="1.5" strokeLinejoin="round"/>
            {/* خط وسط */}
            <line x1="55" y1="45" x2="55" y2="100" stroke={c} strokeWidth="1" strokeDasharray="4 3" opacity="0.5"/>
            {/* شريط لاصق */}
            <rect x="35" y="48" width="40" height="8" rx="2" fill={`${c}44`} stroke={c} strokeWidth="1"/>
            {/* لوجو */}
            <circle cx="55" cy="68" r="10" fill={`${c}33`} stroke={c} strokeWidth="1"/>
            <text x="55" y="73" textAnchor="middle" fontSize="11" fill={c} fontWeight="bold">✦</text>
            {/* تفاصيل جانبية */}
            <line x1="22" y1="60" x2="38" y2="60" stroke={c} strokeWidth="0.8" opacity="0.4"/>
            <line x1="22" y1="67" x2="38" y2="67" stroke={c} strokeWidth="0.8" opacity="0.4"/>
            <line x1="72" y1="60" x2="88" y2="60" stroke={c} strokeWidth="0.8" opacity="0.4"/>
            <line x1="72" y1="67" x2="88" y2="67" stroke={c} strokeWidth="0.8" opacity="0.4"/>
          </svg>
          {/* ظل متحرك */}
          <div className="w-16 h-2 rounded-full" style={{ background:`${c}55`, filter:"blur(5px)", animation:"shadowPulse 2.4s ease-in-out infinite" }} />
          {/* نص حالة */}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background:c, animation:"dotBlink 1.2s ease-in-out infinite" }} />
            <span className="text-xs font-bold" style={{ color:c }}>طلبك حاليا فى انتظار استلامه فى احد مخازنا</span>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background:c, animation:"dotBlink 1.2s 0.4s ease-in-out infinite" }} />
          </div>
        </div>
      )}

      {/* ══ WAREHOUSE ══ */}
      {isWarehouse && (
        <div className="relative flex flex-col items-center gap-3">
          <style>{`
            @keyframes lightBeam { 0%,100%{opacity:0.3} 50%{opacity:0.7} }
            @keyframes conveyorScroll { 0%{stroke-dashoffset:0} 100%{stroke-dashoffset:-30} }
          `}</style>
          <svg width="170" height="105" viewBox="0 0 170 105">
            {/* أرضية */}
            <rect x="0" y="90" width="170" height="15" rx="3" fill={`${c}11`} stroke={`${c}22`} strokeWidth="1"/>
            {/* مبنى المخزن */}
            <rect x="20" y="25" width="130" height="70" rx="4" fill={`${c}15`} stroke={c} strokeWidth="1.5"/>
            {/* السقف المثلث */}
            <polygon points="10,30 85,5 160,30" fill={`${c}22`} stroke={c} strokeWidth="1.5"/>
            {/* بوابة كبيرة */}
            <rect x="62" y="55" width="46" height="40" rx="4" fill={`${c}08`} stroke={c} strokeWidth="1.5"/>
            {/* خط وسط البوابة */}
            <line x1="85" y1="55" x2="85" y2="95" stroke={c} strokeWidth="1" opacity="0.5"/>
            {/* مقبض البوابة */}
            <circle cx="80" cy="77" r="2" fill={c} opacity="0.7"/>
            <circle cx="90" cy="77" r="2" fill={c} opacity="0.7"/>
            {/* نافذة يسار */}
            <rect x="28" y="40" width="25" height="20" rx="2" fill={`${c}18`} stroke={c} strokeWidth="1"/>
            <line x1="40" y1="40" x2="40" y2="60" stroke={c} strokeWidth="0.7" opacity="0.5"/>
            <line x1="28" y1="50" x2="53" y2="50" stroke={c} strokeWidth="0.7" opacity="0.5"/>
            {/* نافذة يمين */}
            <rect x="117" y="40" width="25" height="20" rx="2" fill={`${c}18`} stroke={c} strokeWidth="1"/>
            <line x1="129" y1="40" x2="129" y2="60" stroke={c} strokeWidth="0.7" opacity="0.5"/>
            <line x1="117" y1="50" x2="142" y2="50" stroke={c} strokeWidth="0.7" opacity="0.5"/>
            {/* ضوء مصنع على السقف */}
            <circle cx="85" cy="18" r="5" fill={`${c}44`} stroke={c} strokeWidth="1" style={{ animation:"lightBeam 2s ease-in-out infinite" }}/>
            {/* صندوقات داخل المخزن */}
            <rect x="30" y="70" width="20" height="18" rx="2" fill={`${c}25`} stroke={c} strokeWidth="1"/>
            <rect x="36" y="73" width="8" height="6" rx="1" fill={`${c}40`}/>
            <rect x="120" y="72" width="20" height="16" rx="2" fill={`${c}25`} stroke={c} strokeWidth="1"/>
            <rect x="126" y="75" width="8" height="5" rx="1" fill={`${c}40`}/>
            {/* إشارة المخزن */}
            <text x="85" y="22" textAnchor="middle" fontSize="6" fill={c} opacity="0.8" fontWeight="bold">STARK</text>
          </svg>
          <span className="text-xs font-bold" style={{ color:c }}>
            {warehouseName ? `طلبك الآن في مخزن فرع ${warehouseName}` : "الشحنة في مخزن الشحن"}
          </span>
        </div>
      )}

      {/* ══ IN SHIPPING (شاحنة متحركة) ══ */}
      {isShipping && (
        <div className="relative flex flex-col items-center gap-2 w-full px-4">
          <style>{`
            @keyframes truckMove { 0%{transform:translateX(35px)} 100%{transform:translateX(-35px)} }
            @keyframes wheelSpin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
            @keyframes cloudFloat { 0%,100%{opacity:0.3;transform:translateX(0)} 50%{opacity:0.6;transform:translateX(-8px)} }
            @keyframes roadLine { 0%{stroke-dashoffset:0} 100%{stroke-dashoffset:-48} }
          `}</style>
          {/* الشاحنة */}
          <div style={{ animation:"truckMove 2.2s ease-in-out infinite alternate", willChange:"transform" }}>
            <svg width="180" height="95" viewBox="0 0 180 95">
              {/* غيوم زخرفية */}
              <ellipse cx="30" cy="20" rx="22" ry="10" fill={`${c}18`} style={{ animation:"cloudFloat 3s ease-in-out infinite" }}/>
              <ellipse cx="150" cy="15" rx="18" ry="8" fill={`${c}14`} style={{ animation:"cloudFloat 3.5s 0.8s ease-in-out infinite" }}/>
              {/* هيكل الشاحنة */}
              <rect x="10" y="38" width="100" height="42" rx="3" fill={`${c}22`} stroke={c} strokeWidth="1.5"/>
              {/* المقدمة */}
              <path d="M110 50 L140 50 L148 62 L148 80 L110 80 Z" fill={`${c}33`} stroke={c} strokeWidth="1.5"/>
              {/* الزجاج */}
              <polygon points="112,52 138,52 145,62 112,62" fill={`${c}55`} stroke={c} strokeWidth="1"/>
              {/* مصباح أمامي */}
              <ellipse cx="146" cy="72" rx="4" ry="3" fill="#fffbe0" stroke={c} strokeWidth="1"/>
              <line x1="150" y1="70" x2="162" y2="68" stroke="#fffbe0" strokeWidth="1.5" opacity="0.8"/>
              {/* شعار الشركة */}
              <text x="55" y="65" textAnchor="middle" fontSize="10" fill={c} fontWeight="bold" opacity="0.7">STARK</text>
              <line x1="18" y1="55" x2="100" y2="55" stroke={`${c}33`} strokeWidth="0.8"/>
              {/* عجلات الشاحنة (بتدور) */}
              <g transform="translate(35,80)">
                <circle cx="0" cy="0" r="11" fill={`${c}18`} stroke={c} strokeWidth="1.5"/>
                <circle cx="0" cy="0" r="5" fill={`${c}33`} stroke={c} strokeWidth="1"/>
                <line x1="-10" y1="0" x2="10" y2="0" stroke={c} strokeWidth="1" style={{ transformOrigin:"0 0", animation:"wheelSpin 0.5s linear infinite" }}/>
                <line x1="0" y1="-10" x2="0" y2="10" stroke={c} strokeWidth="1" style={{ transformOrigin:"0 0", animation:"wheelSpin 0.5s linear infinite" }}/>
              </g>
              <g transform="translate(82,80)">
                <circle cx="0" cy="0" r="11" fill={`${c}18`} stroke={c} strokeWidth="1.5"/>
                <circle cx="0" cy="0" r="5" fill={`${c}33`} stroke={c} strokeWidth="1"/>
                <line x1="-10" y1="0" x2="10" y2="0" stroke={c} strokeWidth="1" style={{ transformOrigin:"0 0", animation:"wheelSpin 0.5s linear infinite" }}/>
                <line x1="0" y1="-10" x2="0" y2="10" stroke={c} strokeWidth="1" style={{ transformOrigin:"0 0", animation:"wheelSpin 0.5s linear infinite" }}/>
              </g>
              <g transform="translate(135,80)">
                <circle cx="0" cy="0" r="11" fill={`${c}18`} stroke={c} strokeWidth="1.5"/>
                <circle cx="0" cy="0" r="5" fill={`${c}33`} stroke={c} strokeWidth="1"/>
                <line x1="-10" y1="0" x2="10" y2="0" stroke={c} strokeWidth="1" style={{ transformOrigin:"0 0", animation:"wheelSpin 0.5s linear infinite" }}/>
                <line x1="0" y1="-10" x2="0" y2="10" stroke={c} strokeWidth="1" style={{ transformOrigin:"0 0", animation:"wheelSpin 0.5s linear infinite" }}/>
              </g>
            </svg>
          </div>
          {/* طريق متحرك */}
          <svg width="100%" height="18" viewBox="0 0 300 18" preserveAspectRatio="none" className="-mt-2">
            <rect width="300" height="10" y="4" rx="3" fill={`${c}15`} stroke={`${c}33`} strokeWidth="1"/>
            <line x1="0" y1="9" x2="300" y2="9" stroke={c} strokeWidth="1.5" strokeDasharray="24 12"
              style={{ animation:"roadLine 0.5s linear infinite" }}/>
          </svg>
          <span className="text-xs font-bold mt-1" style={{ color:c }}>
            {courierName ? `طلبك حالياً قيد الشحن مع المندوب ${courierName}` : "الشحنة في طريقها إليك"}
          </span>
        </div>
      )}

      {/* ══ WITH COURIER (سكوتر) ══ */}
      {isCourier && (
        <div className="relative flex flex-col items-center gap-2 w-full px-4">
          <style>{`
            @keyframes scooterBounce { 0%,100%{transform:translateY(0) translateX(20px)} 50%{transform:translateY(-5px) translateX(-20px)} }
            @keyframes personLean { 0%,100%{transform:rotate(-5deg)} 50%{transform:rotate(-10deg)} }
            @keyframes deliveryBlink { 0%,100%{opacity:1} 50%{opacity:0.4} }
          `}</style>
          <svg width="180" height="110" viewBox="0 0 180 110" style={{ animation:"scooterBounce 1.6s ease-in-out infinite", willChange:"transform" }}>
            {/* سكوتر */}
            {/* هيكل */}
            <path d="M50 70 Q70 55 100 60 L130 60 L140 70" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
            {/* مقعد */}
            <ellipse cx="88" cy="57" rx="20" ry="5" fill={`${c}33`} stroke={c} strokeWidth="1.5"/>
            {/* حقيبة توصيل */}
            <rect x="108" y="45" width="30" height="22" rx="4" fill={`${c}44`} stroke={c} strokeWidth="1.5"/>
            <text x="123" y="60" textAnchor="middle" fontSize="9" fill={c} fontWeight="bold">📦</text>
            {/* الموتور */}
            <ellipse cx="100" cy="65" rx="12" ry="8" fill={`${c}22`} stroke={c} strokeWidth="1"/>
            {/* العجلة الأمامية */}
            <circle cx="140" cy="82" r="16" fill={`${c}15`} stroke={c} strokeWidth="2"/>
            <circle cx="140" cy="82" r="7" fill={`${c}30`} stroke={c} strokeWidth="1.5"/>
            <line x1="124" y1="82" x2="156" y2="82" stroke={c} strokeWidth="1" style={{ transformOrigin:"140px 82px", animation:"wheelSpin 0.4s linear infinite" }}/>
            <line x1="140" y1="66" x2="140" y2="98" stroke={c} strokeWidth="1" style={{ transformOrigin:"140px 82px", animation:"wheelSpin 0.4s linear infinite" }}/>
            {/* العجلة الخلفية */}
            <circle cx="50" cy="82" r="16" fill={`${c}15`} stroke={c} strokeWidth="2"/>
            <circle cx="50" cy="82" r="7" fill={`${c}30`} stroke={c} strokeWidth="1.5"/>
            <line x1="34" y1="82" x2="66" y2="82" stroke={c} strokeWidth="1" style={{ transformOrigin:"50px 82px", animation:"wheelSpin 0.4s linear infinite" }}/>
            <line x1="50" y1="66" x2="50" y2="98" stroke={c} strokeWidth="1" style={{ transformOrigin:"50px 82px", animation:"wheelSpin 0.4s linear infinite" }}/>
            {/* السائق */}
            <g style={{ transformOrigin:"88px 55px", animation:"personLean 1.6s ease-in-out infinite" }}>
              {/* جسم */}
              <path d="M78 55 Q80 35 88 30 Q96 35 98 55" fill={`${c}33`} stroke={c} strokeWidth="1.5"/>
              {/* رأس */}
              <circle cx="88" cy="22" r="10" fill={`${c}44`} stroke={c} strokeWidth="1.5"/>
              {/* خوذة */}
              <path d="M78 22 Q88 10 98 22" fill={c} stroke={c} strokeWidth="1" opacity="0.8"/>
              {/* يد ممتدة */}
              <line x1="98" y1="45" x2="118" y2="58" stroke={c} strokeWidth="2" strokeLinecap="round"/>
            </g>
            {/* إشارة التوصيل */}
            <circle cx="30" cy="20" r="10" fill={`${c}22`} stroke={c} strokeWidth="1.5" style={{ animation:"deliveryBlink 1s ease-in-out infinite" }}/>
            <text x="30" y="25" textAnchor="middle" fontSize="10">📍</text>
          </svg>
          <svg width="100%" height="14" viewBox="0 0 300 14" preserveAspectRatio="none" className="-mt-1">
            <rect width="300" height="8" y="3" rx="3" fill={`${c}15`} stroke={`${c}33`} strokeWidth="1"/>
            <line x1="0" y1="7" x2="300" y2="7" stroke={c} strokeWidth="1" strokeDasharray="18 10"
              style={{ animation:"roadLine 0.35s linear infinite" }}/>
          </svg>
          <span className="text-xs font-bold mt-1" style={{ color:c }}>
            {courierName ? `طلبك حالياً قيد الشحن مع المندوب ${courierName}` : "المندوب في طريقه إليك الآن"}
          </span>
        </div>
      )}

      {/* ══ DELIVERED (احتفال) ══ */}
      {isDelivered && (
        <div className="relative flex flex-col items-center gap-3">
          <style>{`
            @keyframes checkPop { 0%{transform:scale(0.6);opacity:0} 70%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
            @keyframes confettiRain { 0%{transform:translateY(-30px) rotate(0);opacity:1} 100%{transform:translateY(90px) rotate(360deg);opacity:0} }
            @keyframes starSpin { 0%{transform:rotate(0) scale(1)} 50%{transform:rotate(180deg) scale(1.3)} 100%{transform:rotate(360deg) scale(1)} }
            @keyframes ringExpand { 0%{r:25;opacity:0.8} 100%{r:55;opacity:0} }
          `}</style>
          <svg width="160" height="145" viewBox="0 0 160 145">
            {/* حلقات انتشار */}
            <circle cx="80" cy="75" fill="none" stroke={c} strokeWidth="2" opacity="0.6" style={{ animation:"ringExpand 1.5s ease-out infinite" }}><animate attributeName="r" from="25" to="55" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite"/></circle>
            <circle cx="80" cy="75" fill="none" stroke={c} strokeWidth="1.5" opacity="0.4" style={{ animation:"ringExpand 1.5s 0.5s ease-out infinite" }}><animate attributeName="r" from="20" to="50" begin="0.5s" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.4" to="0" begin="0.5s" dur="1.5s" repeatCount="indefinite"/></circle>
            {/* دائرة الخلفية */}
            <circle cx="80" cy="75" r="42" fill={`${c}18`} stroke={c} strokeWidth="2"/>
            {/* علامة الصح */}
            <g style={{ animation:"checkPop 0.5s cubic-bezier(0.4,0,0.2,1) forwards" }}>
              <polyline points="55,75 73,93 108,58" fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
            {/* confetti */}
            {[
              [28,18,c,"confettiRain 1.8s 0s ease-in infinite","rectangle"],
              [130,10,`${c}aa`,"confettiRain 2s 0.3s ease-in infinite","circle"],
              [55,8,`${c}88`,"confettiRain 1.6s 0.7s ease-in infinite","rectangle"],
              [108,5,c,"confettiRain 2.2s 0.1s ease-in infinite","circle"],
              [15,40,`${c}cc`,"confettiRain 1.9s 0.5s ease-in infinite","rectangle"],
              [148,35,`${c}99`,"confettiRain 1.7s 0.9s ease-in infinite","circle"],
            ].map(([x,y,fill,anim,shape],i) =>
              shape === "circle"
                ? <circle key={i} cx={x as number} cy={y as number} r="4" fill={fill as string} style={{ animation: anim as string }}/>
                : <rect key={i} x={(x as number)-3} y={(y as number)-5} width="6" height="10" rx="1" fill={fill as string} style={{ animation: anim as string }}/>
            )}
            {/* نجوم */}
            {[[20,80,8],[145,60,7],[30,110,6],[140,100,9]].map(([x,y,s],i) => (
              <text key={i} x={x} y={y} textAnchor="middle" fontSize={s} style={{ animation:`starSpin ${1.5+i*0.3}s linear infinite` }}>⭐</text>
            ))}
          </svg>
          <span className="text-sm font-black" style={{ color:c, textShadow:`0 0 12px ${c}88` }}>
            {status === "partial_received" ? "تم الاستلام الجزئي ✅" : "تم التسليم بنجاح! 🎉"}
          </span>
        </div>
      )}

      {/* ══ RETURNED (مندوب حزين راجع) ══ */}
      {isReturned && (
        <div className="relative flex flex-col items-center gap-3">
          <style>{`
            @keyframes sadWalk { 0%,100%{transform:translateX(0) rotate(0deg)} 25%{transform:translateX(-8px) rotate(-2deg)} 75%{transform:translateX(8px) rotate(2deg)} }
            @keyframes tearDrop { 0%{transform:translateY(0);opacity:1} 100%{transform:translateY(18px);opacity:0} }
            @keyframes sadPulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
            @keyframes headDrop { 0%,100%{transform:rotate(-5deg)} 50%{transform:rotate(-15deg)} }
          `}</style>
          <svg width="180" height="160" viewBox="0 0 180 160">
            {/* خلفية دوائر حزينة */}
            <circle cx="90" cy="80" r="60" fill="rgba(248,113,113,0.06)" stroke="rgba(248,113,113,0.15)" strokeWidth="1"/>
            <circle cx="90" cy="80" r="45" fill="rgba(248,113,113,0.04)" stroke="rgba(248,113,113,0.1)" strokeWidth="1"/>

            {/* المندوب على السكوتر (راجع — يمين لشمال) */}
            <g style={{ animation:"sadWalk 2s ease-in-out infinite" }}>
              {/* السكوتر */}
              <path d="M55 105 Q75 92 100 96 L125 96 L133 105" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"/>
              <ellipse cx="88" cy="91" rx="18" ry="4" fill="rgba(248,113,113,0.3)" stroke="#f87171" strokeWidth="1.5"/>
              {/* حقيبة توصيل فاضية */}
              <rect x="102" y="80" width="26" height="19" rx="4" fill="rgba(248,113,113,0.2)" stroke="#f87171" strokeWidth="1.5"/>
              <line x1="108" y1="89" x2="122" y2="89" stroke="#f87171" strokeWidth="1" opacity="0.5"/>
              {/* علامة X على الحقيبة */}
              <line x1="108" y1="83" x2="122" y2="96" stroke="#f87171" strokeWidth="1.5" opacity="0.7"/>
              <line x1="122" y1="83" x2="108" y2="96" stroke="#f87171" strokeWidth="1.5" opacity="0.7"/>
              {/* عجلة أمامية */}
              <circle cx="133" cy="115" r="14" fill="rgba(248,113,113,0.12)" stroke="#f87171" strokeWidth="2"/>
              <circle cx="133" cy="115" r="6" fill="rgba(248,113,113,0.25)" stroke="#f87171" strokeWidth="1.5"/>
              {/* عجلة خلفية */}
              <circle cx="52" cy="115" r="14" fill="rgba(248,113,113,0.12)" stroke="#f87171" strokeWidth="2"/>
              <circle cx="52" cy="115" r="6" fill="rgba(248,113,113,0.25)" stroke="#f87171" strokeWidth="1.5"/>
              {/* جسم المندوب الحزين */}
              <g style={{ transformOrigin:"88px 90px", animation:"headDrop 2s ease-in-out infinite" }}>
                {/* جسم */}
                <path d="M78 90 Q80 72 88 67 Q96 72 98 90" fill="rgba(248,113,113,0.3)" stroke="#f87171" strokeWidth="1.5"/>
                {/* رأس محنية للأسفل */}
                <circle cx="88" cy="58" r="11" fill="rgba(248,113,113,0.35)" stroke="#f87171" strokeWidth="1.5"/>
                {/* خوذة */}
                <path d="M77 58 Q88 45 99 58" fill="#f87171" stroke="#f87171" strokeWidth="1" opacity="0.7"/>
                {/* وجه حزين */}
                {/* عيون حزينة */}
                <circle cx="84" cy="57" r="1.5" fill="#f87171"/>
                <circle cx="92" cy="57" r="1.5" fill="#f87171"/>
                {/* فم حزين (منحني للأسفل) */}
                <path d="M84 64 Q88 61 92 64" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round"/>
                {/* حاجب حزين */}
                <line x1="82" y1="53" x2="86" y2="55" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round"/>
                <line x1="90" y1="55" x2="94" y2="53" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round"/>
              </g>
              {/* دموع */}
              <circle cx="84" cy="70" r="2" fill="#f87171" style={{ animation:"tearDrop 1.5s 0s ease-in infinite"}} opacity="0.8"/>
              <circle cx="92" cy="70" r="2" fill="#f87171" style={{ animation:"tearDrop 1.5s 0.7s ease-in infinite"}} opacity="0.8"/>
            </g>

            {/* سهم الرجوع */}
            <g opacity="0.7" style={{ animation:"sadPulse 1.5s ease-in-out infinite" }}>
              <path d="M148 40 Q165 55 148 70" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"/>
              <polygon points="148,32 140,44 156,44" fill="#f87171"/>
              <text x="152" y="58" textAnchor="middle" fontSize="11" fill="#f87171">↩</text>
            </g>

            {/* نص مرتجع */}
            <text x="90" y="148" textAnchor="middle" fontSize="10" fill="#f87171" fontWeight="bold" opacity="0.8">مرتجع</text>
          </svg>
          <span className="text-xs font-bold" style={{ color:"#f87171" }}>عذراً، الشحنة في طريق العودة 😔</span>
        </div>
      )}

      {/* ══ CANCELLED ══ */}
      {isCancelled && (
        <div className="relative flex flex-col items-center gap-3">
          <style>{`@keyframes xShake { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-8deg)} 75%{transform:rotate(8deg)} }`}</style>
          <svg width="130" height="120" viewBox="0 0 130 120">
            <circle cx="65" cy="60" r="40" fill={`${c}15`} stroke={c} strokeWidth="2"/>
            <circle cx="65" cy="60" r="28" fill={`${c}22`} stroke={c} strokeWidth="1.5"/>
            <g style={{ animation:"xShake 1.2s ease-in-out infinite", transformOrigin:"65px 60px" }}>
              <line x1="48" y1="43" x2="82" y2="77" stroke={c} strokeWidth="5" strokeLinecap="round"/>
              <line x1="82" y1="43" x2="48" y2="77" stroke={c} strokeWidth="5" strokeLinecap="round"/>
            </g>
          </svg>
          <span className="text-xs font-bold" style={{ color:c }}>تم إلغاء الشحنة</span>
        </div>
      )}

      {/* ══ DELAYED ══ */}
      {isDelayed && (
        <div className="relative flex flex-col items-center gap-3">
          <style>{`@keyframes clockTick { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
          @keyframes warnPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
          <svg width="130" height="130" viewBox="0 0 130 130">
            {/* ساعة */}
            <circle cx="65" cy="65" r="42" fill={`${c}15`} stroke={c} strokeWidth="2"/>
            <circle cx="65" cy="65" r="35" fill={`${c}20`} stroke={c} strokeWidth="1"/>
            {/* أرقام الساعة */}
            {[12,3,6,9].map((n,i) => {
              const angle = i * 90 - 90;
              const rad = angle * Math.PI / 180;
              return <text key={n} x={65 + 26 * Math.cos(rad)} y={65 + 26 * Math.sin(rad) + 3} textAnchor="middle" fontSize="8" fill={c} opacity="0.7">{n}</text>
            })}
            {/* عقارب الساعة */}
            <line x1="65" y1="65" x2="65" y2="38" stroke={c} strokeWidth="3" strokeLinecap="round" style={{ transformOrigin:"65px 65px", animation:"clockTick 8s linear infinite" }}/>
            <line x1="65" y1="65" x2="88" y2="65" stroke={c} strokeWidth="2" strokeLinecap="round" style={{ transformOrigin:"65px 65px", animation:"clockTick 1s linear infinite" }}/>
            <circle cx="65" cy="65" r="3" fill={c}/>
            {/* علامة التحذير */}
            <g style={{ animation:"warnPulse 1s ease-in-out infinite" }}>
              <polygon points="65,15 55,30 75,30" fill="#fb923c" stroke="#fb923c" strokeWidth="1"/>
              <line x1="65" y1="19" x2="65" y2="26" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="65" cy="29" r="1" fill="#000"/>
            </g>
          </svg>
          <span className="text-xs font-bold" style={{ color:c }}>الشحنة متأخرة — جاري التتبع</span>
        </div>
      )}
    </div>
  );
}

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
  courierLogo?: string | null;
  // فرع العميل الأصلي (اللي صدرت منه الشحنة) — ثابت بغض النظر عن مكان الشحنة الحالي
  originWarehouseName?: string | null;
  originWarehouseCity?: string | null;
  // ملاحظة/سبب المندوب وقت الإرجاع أو التأجيل
  returnReason?: string | null;
  returnNote?: string | null;
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

  // الحالات اللي فيها "مكان الشحنة الحالي" له معنى (مرتجعة أو مؤجلة) —
  // في باقي الحالات (استلمت/جزئي/الخ) العميل مش محتاج يعرف مكانها الحالي.
  const showCurrentLocation = !!shipment && ["returned", "returned_to_warehouse", "delayed"].includes(shipment.status);
  // ملاحظة/سبب المندوب — بتظهر فقط في نفس حالات الاستثناء دي
  const showReturnInfo = showCurrentLocation && !!(shipment?.returnNote || shipment?.returnReason);

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

          {/* ── Status Illustration Banner ── */}
          <StatusIllustration status={shipment.status} color={cfg.color} warehouseName={shipment.warehouseName} courierName={shipment.courierName} />

          {/* ── Status Card (upgraded) ── */}
          <div className="rounded-3xl relative overflow-hidden"
            style={{
              background: `linear-gradient(145deg, ${cfg.color}1c 0%, rgba(10,10,15,0.92) 45%, ${cfg.color}0d 100%)`,
              border: `1px solid ${cfg.color}44`,
              boxShadow: `0 0 0 1px ${cfg.color}18, 0 0 60px ${cfg.color}30, 0 0 120px ${cfg.color}14, 0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.4)`,
            }}>
            {/* ambient glow top */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-64 h-24 pointer-events-none"
              style={{ background: `radial-gradient(ellipse, ${cfg.color}44 0%, transparent 70%)`, filter: "blur(20px)" }} />
            {/* shine diagonal */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(125deg, rgba(255,255,255,0.08) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.04) 100%)" }} />
            {/* bottom glow line */}
            <div className="absolute bottom-0 left-1/4 right-1/4 h-px pointer-events-none"
              style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}88, transparent)` }} />

            <div className="relative p-5 sm:p-7 flex items-center gap-5">
              {/* أيقونة الحالة */}
              <div className="relative flex-shrink-0">
                {/* هالة خارجية */}
                <div className="absolute inset-0 rounded-2xl"
                  style={{ boxShadow: `0 0 32px ${cfg.color}66, 0 0 64px ${cfg.color}33`, borderRadius: "18px" }} />
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center relative"
                  style={{
                    background: `linear-gradient(145deg, ${cfg.color}40 0%, ${cfg.color}18 50%, rgba(0,0,0,0.4) 100%)`,
                    border: `1.5px solid ${cfg.color}77`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.3)`,
                  }}>
                  <StatusIcon size={30} style={{ color: cfg.color, filter: `drop-shadow(0 0 10px ${cfg.color}) drop-shadow(0 0 20px ${cfg.color}88)` }} />
                </div>
              </div>

              {/* النص */}
              <div className="flex-1 min-w-0 text-right">
                <p className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: `${cfg.color}99` }}>حالة الشحنة</p>
                <p className="text-2xl sm:text-3xl font-black leading-tight break-words"
                  style={{
                    background: `linear-gradient(135deg, #ffffff 0%, ${cfg.color} 60%, #ffffff99 100%)`,
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                    filter: `drop-shadow(0 2px 8px ${cfg.color}55)`,
                  }}>{cfg.label}</p>
                <div className="flex items-center gap-2 mt-2 justify-end">
                  {/* نبضة حية */}
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: cfg.color }} />
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: cfg.color }} />
                  </span>
                  <p className="text-xs font-mono tracking-widest" style={{ color: `${cfg.color}88` }}>
                    {shipment.trackingNumber || shipment.shipmentNumber}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Progress Steps (upgraded) ── */}
          {!["returned","returned_to_warehouse","return_delivered","cancelled"].includes(shipment.status) && (
            <div className="rounded-3xl p-4 sm:p-6 relative overflow-hidden"
              style={{
                background: "linear-gradient(145deg, rgba(15,18,25,0.95) 0%, rgba(8,10,16,0.98) 100%)",
                border: `1px solid ${cfg.color}28`,
                boxShadow: `0 0 40px ${cfg.color}14, 0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.3)`,
              }}>
              {/* خط glow علوي */}
              <div className="absolute top-0 left-1/3 right-1/3 h-px pointer-events-none"
                style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}66, transparent)` }} />

              <div className="flex items-start justify-between gap-1">
                {TIMELINE_STEPS.map((s, i) => {
                  const stepIndex = TIMELINE_STEPS.findIndex(ts => ts.step === cfg.step);
                  const done    = i <= stepIndex;
                  const current = i === stepIndex;
                  const Icon    = s.icon;
                  return (
                    <div key={i} className="flex flex-col items-center gap-2 flex-1 min-w-0">
                      {/* خط + دائرة */}
                      <div className="relative flex items-center w-full">
                        {/* خط يسار */}
                        {i > 0 && (
                          <div className="flex-1 h-0.5 mr-0.5 rounded-full overflow-hidden">
                            <div className="h-full w-full" style={{
                              background: i <= stepIndex
                                ? `linear-gradient(90deg, ${cfg.color}88, ${cfg.color}cc)`
                                : "rgba(255,255,255,0.07)"
                            }}/>
                          </div>
                        )}
                        {/* الدائرة */}
                        <div className="relative flex-shrink-0">
                          {current && (
                            <div className="absolute inset-0 rounded-full animate-ping"
                              style={{ background: `${cfg.color}55`, transform: "scale(1.6)" }} />
                          )}
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center relative z-10"
                            style={{
                              background: current
                                ? `linear-gradient(145deg, ${cfg.color} 0%, ${cfg.color}bb 100%)`
                                : done
                                  ? `linear-gradient(145deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)`
                                  : "rgba(255,255,255,0.04)",
                              border: current
                                ? `1.5px solid ${cfg.color}`
                                : done
                                  ? "1.5px solid rgba(255,255,255,0.25)"
                                  : "1.5px solid rgba(255,255,255,0.07)",
                              boxShadow: current
                                ? `0 0 20px ${cfg.color}99, 0 0 40px ${cfg.color}44, inset 0 1px 0 rgba(255,255,255,0.35)`
                                : done
                                  ? "inset 0 1px 0 rgba(255,255,255,0.2)"
                                  : "none",
                            }}>
                            <Icon size={14}
                              style={{ color: current ? "#000" : done ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.18)" }}
                            />
                          </div>
                        </div>
                        {/* خط يمين */}
                        {i < TIMELINE_STEPS.length - 1 && (
                          <div className="flex-1 h-0.5 ml-0.5 rounded-full overflow-hidden">
                            <div className="h-full w-full" style={{
                              background: i < stepIndex
                                ? `linear-gradient(90deg, ${cfg.color}cc, ${cfg.color}88)`
                                : "rgba(255,255,255,0.07)"
                            }}/>
                          </div>
                        )}
                      </div>
                      {/* التسمية */}
                      <span className="text-center px-0.5 leading-tight" style={{
                        fontSize: 9,
                        fontWeight: current ? 700 : 500,
                        color: current ? cfg.color : done ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.2)",
                        textShadow: current ? `0 0 8px ${cfg.color}88` : "none",
                      }}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Details Card (upgraded) ── */}
          <div className="rounded-3xl p-5 sm:p-6 flex flex-col gap-5 relative overflow-hidden"
            style={{
              background: "linear-gradient(145deg, rgba(14,17,24,0.97) 0%, rgba(8,10,16,0.99) 100%)",
              border: `1px solid ${cfg.color}1e`,
              boxShadow: `0 0 30px ${cfg.color}10, 0 16px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.35)`,
            }}>
            {/* corner accent */}
            <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
              style={{ background: `radial-gradient(circle at top right, ${cfg.color}18 0%, transparent 60%)` }} />
            <div className="absolute bottom-0 left-0 w-24 h-24 pointer-events-none"
              style={{ background: `radial-gradient(circle at bottom left, ${cfg.color}0e 0%, transparent 60%)` }} />

            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b relative" style={{ borderColor: `${cfg.color}1a` }}>
              <div className="w-1 h-4 rounded-full" style={{ background: `linear-gradient(180deg, ${cfg.color}, ${cfg.color}44)`, boxShadow: `0 0 8px ${cfg.color}88` }} />
              <p className="text-xs font-bold tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>تفاصيل الشحنة</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* المرسل */}
              <div className="rounded-2xl p-3.5 relative overflow-hidden"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                  <User size={10}/> المُرسِل
                </p>
                <p className="text-sm font-bold text-white break-words">{shipment.senderName}</p>
                {shipment.senderPhone && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "rgba(255,255,255,0.4)" }} dir="ltr"><Phone size={10}/>{shipment.senderPhone}</p>}
                {shipment.senderCity  && <p className="text-xs mt-0.5 break-words" style={{ color: "rgba(255,255,255,0.3)" }}><MapPin size={10} className="inline ml-1"/>{shipment.senderCity}</p>}
              </div>
              {/* المستلم */}
              <div className="rounded-2xl p-3.5 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${cfg.color}0c 0%, rgba(255,255,255,0.02) 100%)`,
                  border: `1px solid ${cfg.color}22`,
                }}>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: `${cfg.color}88` }}>
                  <User size={10}/> المُستلِم
                </p>
                <p className="text-sm font-bold text-white break-words">{shipment.receiverName}</p>
                {shipment.receiverPhone   && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "rgba(255,255,255,0.4)" }} dir="ltr"><Phone size={10}/>{shipment.receiverPhone}</p>}
                {shipment.receiverCity    && <p className="text-xs mt-0.5 break-words" style={{ color: "rgba(255,255,255,0.3)" }}><MapPin size={10} className="inline ml-1"/>{shipment.receiverCity}</p>}
                {shipment.receiverAddress && <p className="text-xs mt-0.5 leading-tight break-words" style={{ color: "rgba(255,255,255,0.22)" }}>{shipment.receiverAddress}</p>}
              </div>
            </div>

            {(shipment.parcelType || shipment.weight) && (
              <div className="flex gap-2.5 pt-1 border-t" style={{ borderColor: `${cfg.color}18` }}>
                {shipment.parcelType && (
                  <div className="flex-1 rounded-2xl px-3.5 py-3 text-center relative overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>نوع الشحنة</p>
                    <p className="text-sm font-bold text-white">{shipment.parcelType}</p>
                  </div>
                )}
                {shipment.weight && (
                  <div className="flex-1 rounded-2xl px-3.5 py-3 text-center relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${cfg.color}0e 0%, rgba(0,0,0,0.2) 100%)`,
                      border: `1px solid ${cfg.color}22`
                    }}>
                    <p className="text-xs mb-1" style={{ color: `${cfg.color}77` }}>الوزن</p>
                    <p className="text-sm font-bold" style={{ color: cfg.color }}>{shipment.weight} كجم</p>
                  </div>
                )}
              </div>
            )}

            {shipment.notes && (
              <div className="rounded-2xl p-3.5 border-t" style={{ borderColor: `${cfg.color}18`, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-xs mb-1.5 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                  <span style={{ color: cfg.color }}>◆</span> ملاحظات
                </p>
                <p className="text-sm break-words leading-relaxed" style={{ color: "rgba(255,255,255,0.55)", overflowWrap: "anywhere", wordBreak: "break-word" }}>{shipment.notes}</p>
              </div>
            )}

            {/* ── تنبيه بخصوص الشحنة (سبب وملاحظة المندوب وقت الإرجاع/التأجيل) ── */}
            {showReturnInfo && (
              <div className="rounded-2xl p-3.5 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${cfg.color}14 0%, rgba(255,255,255,0.02) 100%)`,
                  border: `1px solid ${cfg.color}33`,
                }}>
                <p className="text-xs mb-1.5 flex items-center gap-1.5 font-bold" style={{ color: cfg.color }}>
                  <AlertTriangle size={11} /> تنبيه بخصوص الشحنة
                </p>
                {shipment.returnReason && (
                  <p className="text-sm font-semibold break-words leading-relaxed mb-1.5" style={{ color: "rgba(255,255,255,0.85)", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                    {shipment.returnReason}
                  </p>
                )}
                {shipment.returnNote && (
                  <p className="text-sm break-words leading-relaxed" style={{ color: "rgba(255,255,255,0.55)", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                    {shipment.returnNote}
                  </p>
                )}
              </div>
            )}

            {/* ── الشحنة صادرة من (فرع العميل الأصلي) — ثابت دايمًا بغض النظر عن الحالة ── */}
            {shipment.originWarehouseName && (
              <div className="pt-1" style={{ borderTop: `1px solid ${cfg.color}18` }}>
                <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-xs mb-1.5 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                    <Warehouse size={10} />الشحنة صادرة من
                  </p>
                  <p className="text-sm font-bold text-white">
                    {shipment.originWarehouseName}
                    {shipment.originWarehouseCity && <span className="text-xs mr-1" style={{ color: "rgba(255,255,255,0.4)" }}>({shipment.originWarehouseCity})</span>}
                  </p>
                </div>
              </div>
            )}

            {/* ── مكان الشحنة الحالي — يظهر بس لو الشحنة مرتجعة أو مؤجلة، عشان
                العميل يعرف يتواصل مع مين (الفرع لو في مخزن، أو المندوب لو معاه) ── */}
            {showCurrentLocation && (shipment.warehouseName || shipment.courierName) && (
              <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderTop: `1px solid ${cfg.color}18` }}>
                {shipment.warehouseName && (
                  <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-xs mb-1.5 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                      <Warehouse size={10} />مكان الشحنة
                    </p>
                    <p className="text-sm font-bold text-white">
                      شحنتك حاليًا في مخزن {shipment.warehouseName}
                      {shipment.warehouseCity && <span className="text-xs mr-1" style={{ color: "rgba(255,255,255,0.4)" }}>({shipment.warehouseCity})</span>}
                    </p>
                  </div>
                )}
                {!shipment.warehouseName && shipment.courierName && (
                  <div className="rounded-2xl p-3.5 relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${cfg.color}0e 0%, rgba(0,0,0,0.25) 100%)`,
                      border: `1px solid ${cfg.color}2a`,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08)`,
                    }}>
                    <p className="text-xs mb-2 flex items-center gap-1.5" style={{ color: `${cfg.color}88` }}>
                      <UserCheck size={10} />شحنتك حاليًا مع المندوب
                    </p>
                    <div className="flex items-center gap-3">
                      {shipment.courierLogo ? (
                        <img src={shipment.courierLogo} alt={shipment.courierName}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                          style={{ border: `1.5px solid ${cfg.color}44`, boxShadow: `0 0 12px ${cfg.color}44` }} />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: `${cfg.color}18`, border: `1.5px solid ${cfg.color}44`, boxShadow: `0 0 12px ${cfg.color}33` }}>
                          <Truck size={18} style={{ color: cfg.color }} />
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
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
                          style={{
                            background: "linear-gradient(135deg, rgba(37,211,102,0.2) 0%, rgba(37,211,102,0.08) 100%)",
                            border: "1px solid rgba(37,211,102,0.45)",
                            color: "#25d366",
                            boxShadow: "0 0 12px rgba(37,211,102,0.2)",
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.559 4.122 1.532 5.856L.057 23.882a.5.5 0 0 0 .61.61l6.089-1.465A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 0 1-5.031-1.371l-.361-.214-3.737.899.934-3.641-.235-.374A9.9 9.9 0 0 1 2.1 12C2.1 6.533 6.533 2.1 12 2.1S21.9 6.533 21.9 12 17.467 21.9 12 21.9z"/></svg>
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
      )}
      </main>

      <Footer />
    </div>
  );
}
