import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  MapPin, ArrowRight, Package, Search, Loader2, ChevronDown,
  Truck, ShieldCheck, Clock, Sparkles,
} from "lucide-react";
import { Navbar, Footer, SocialFloat } from "./home";

const BASE = "/api";

// ─── Types ──────────────────────────────────────────────────────────────────
interface ZonePrice {
  id: number;
  from: string;
  to: string;
  area: string;
  price: number;
}

// الفروع الأساسية اللي بيتشحن منها — القاهرة والإسكندرية فقط
const BRANCHES = ["القاهرة", "الإسكندرية"];

// توحيد الهمزات/التاء المربوطة عشان "الاسكندرية" و"الإسكندرية" يتطابقوا
const normalize = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLowerCase().replace(/ة/g, "ه").replace(/[أإآ]/g, "ا");

// ─── Branch Selector (pill buttons — mobile-first, big tap targets) ─────────
function BranchPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
      {BRANCHES.map(b => {
        const active = value === b;
        return (
          <button
            key={b}
            onClick={() => onChange(b)}
            className="relative rounded-2xl py-4 px-3 sm:py-5 text-center transition-all duration-300 overflow-hidden"
            style={{
              background: active
                ? "linear-gradient(135deg, rgba(212,175,55,0.16) 0%, rgba(212,175,55,0.04) 100%)"
                : "rgba(255,255,255,0.03)",
              border: active ? "1.5px solid rgba(212,175,55,0.55)" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: active ? "0 0 28px rgba(212,175,55,0.15), inset 0 1px 0 rgba(255,255,255,0.06)" : "none",
            }}
          >
            {active && (
              <span
                className="absolute -top-8 -left-8 w-20 h-20 rounded-full blur-2xl pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(212,175,55,0.35), transparent 70%)" }}
              />
            )}
            <div className="relative flex flex-col items-center gap-1.5">
              <MapPin size={18} style={{ color: active ? "#d4af37" : "rgba(255,255,255,0.35)" }} />
              <span className="font-bold text-sm sm:text-base" style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.55)" }}>
                {b}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Destination Combobox (searchable dropdown) ──────────────────────────────
function DestinationPicker({
  options, value, onChange, disabled,
}: { options: string[]; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = normalize(query);
    return options.filter(o => normalize(o).includes(q));
  }, [options, query]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className="w-full flex items-center justify-between rounded-2xl px-4 py-4 sm:py-4.5 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: open ? "1.5px solid rgba(212,175,55,0.5)" : "1.5px solid rgba(255,255,255,0.1)",
          boxShadow: open ? "0 0 24px rgba(212,175,55,0.12)" : "none",
        }}
      >
        <span className="flex items-center gap-2.5 text-sm sm:text-base" style={{ color: value ? "#fff" : "rgba(255,255,255,0.4)" }}>
          <Package size={16} style={{ color: value ? "#d4af37" : "rgba(255,255,255,0.3)" }} />
          {value || (disabled ? "اختر فرع الشحن أولاً" : "اختر محافظة الوصول")}
        </span>
        <ChevronDown size={18} className="transition-transform duration-300" style={{ color: "rgba(255,255,255,0.4)", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && !disabled && (
        <div
          className="absolute z-30 mt-2 w-full rounded-2xl overflow-hidden"
          style={{
            background: "rgba(10,10,10,0.98)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="p-2 border-b border-white/8">
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ابحث عن محافظة..."
                dir="rtl"
                className="w-full bg-transparent rounded-xl py-2.5 pr-9 pl-3 text-sm text-white placeholder-white/30 focus:outline-none"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="text-center text-xs py-6" style={{ color: "rgba(255,255,255,0.3)" }}>لا توجد نتائج</p>
            )}
            {filtered.map(o => (
              <button
                key={o}
                onClick={() => { onChange(o); setOpen(false); setQuery(""); }}
                className="w-full text-right px-4 py-3 text-sm transition-colors hover:bg-white/6"
                style={{ color: o === value ? "#d4af37" : "rgba(255,255,255,0.75)" }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Route Line — signature element: an animated line that "draws" itself   ──
// from the branch dot to the destination dot the moment a price is found.    ──
// This is the one visual the page is built around: it literally shows the    ──
// route being quoted, instead of decorating the result with generic icons.  ──
function RouteLine({ from, to, ready }: { from: string; to: string; ready: boolean }) {
  return (
    <div className="relative w-full h-16 sm:h-20 flex items-center justify-between px-2 sm:px-6" dir="rtl">
      {/* نقطة البداية (الفرع) */}
      <div className="relative z-10 flex flex-col items-center gap-1.5 shrink-0">
        <div
          className="w-3 h-3 rounded-full transition-all duration-500"
          style={{
            background: ready ? "#d4af37" : "rgba(255,255,255,0.25)",
            boxShadow: ready ? "0 0 14px rgba(212,175,55,0.8)" : "none",
          }}
        />
        <span className="text-[11px] sm:text-xs font-semibold whitespace-nowrap" style={{ color: ready ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>
          {from || "الفرع"}
        </span>
      </div>

      {/* الخط المتحرك */}
      <div className="absolute left-0 right-0 top-[9px] sm:top-[11px] mx-10 sm:mx-16" style={{ height: 6 }}>
        <svg width="100%" height="6" style={{ overflow: "visible", display: "block" }}>
          <line x1="0" y1="3" x2="100%" y2="3" stroke="rgba(255,255,255,0.08)" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
          <line
            x1="0" y1="3" x2="100%" y2="3"
            stroke="#d4af37" strokeWidth="2" strokeLinecap="round"
            pathLength={100}
            style={{
              strokeDasharray: 100,
              strokeDashoffset: ready ? 0 : 100,
              transition: "stroke-dashoffset 0.9s cubic-bezier(0.65,0,0.35,1)",
              filter: ready ? "drop-shadow(0 0 6px rgba(212,175,55,0.7))" : "none",
            }}
          />
        </svg>
        {/* شاحنة صغيرة بتتحرك على الخط */}
        {ready && (
          <span
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{ background: "#d4af37", boxShadow: "0 0 8px rgba(212,175,55,0.9)", animation: "routeTruck 0.9s cubic-bezier(0.65,0,0.35,1) forwards" }}
          />
        )}
      </div>

      {/* نقطة الوصول */}
      <div className="relative z-10 flex flex-col items-center gap-1.5 shrink-0">
        <div
          className="w-3 h-3 rounded-full transition-all duration-500"
          style={{
            background: ready ? "#d4af37" : "rgba(255,255,255,0.25)",
            boxShadow: ready ? "0 0 14px rgba(212,175,55,0.8)" : "none",
            transitionDelay: ready ? "0.7s" : "0s",
          }}
        />
        <span className="text-[11px] sm:text-xs font-semibold whitespace-nowrap" style={{ color: ready ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>
          {to || "الوجهة"}
        </span>
      </div>

      <style>{`
        @keyframes routeTruck {
          0%   { right: 0%; opacity: 1; }
          85%  { opacity: 1; }
          100% { right: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Price Result Card ────────────────────────────────────────────────────────
function PriceResult({ price, from, to }: { price: number | null; from: string; to: string; }) {
  if (price === null) {
    return (
      <div
        className="rounded-2xl px-5 py-8 text-center"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.12)" }}
      >
        <Sparkles size={20} className="mx-auto mb-2" style={{ color: "rgba(255,255,255,0.2)" }} />
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
          اختر الفرع والمحافظة عشان نطلعلك السعر فورًا
        </p>
      </div>
    );
  }

  return (
    <div
      key={`${from}-${to}-${price}`}
      className="relative rounded-2xl px-5 py-7 sm:py-8 text-center overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(212,175,55,0.10) 0%, rgba(255,255,255,0.02) 60%)",
        border: "1px solid rgba(212,175,55,0.3)",
        boxShadow: "0 0 40px rgba(212,175,55,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
        animation: "priceReveal 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
      }}
    >
      <div className="absolute -top-10 right-1/2 translate-x-1/2 w-40 h-40 rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(212,175,55,0.25), transparent 70%)" }} />
      <p className="relative text-xs font-semibold tracking-widest mb-2" style={{ color: "rgba(212,175,55,0.75)" }}>
        سعر التوصيل العادي
      </p>
      <p className="relative flex items-baseline justify-center gap-1.5">
        <span className="text-4xl sm:text-5xl font-black" style={{ color: "#f0d060", textShadow: "0 0 30px rgba(212,175,55,0.35)" }}>
          {price.toLocaleString("ar-EG")}
        </span>
        <span className="text-base sm:text-lg font-bold" style={{ color: "rgba(212,175,55,0.7)" }}>ج.م</span>
      </p>
      <p className="relative text-xs mt-2" style={{ color: "rgba(255,255,255,0.35)" }}>
        من {from} إلى {to}
      </p>

      <style>{`
        @keyframes priceReveal {
          from { opacity: 0; transform: scale(0.92) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Track Shipment Widget — mobile-first: one big input + one big button ───
function TrackWidget() {
  const [, navigate] = useLocation();
  const [number, setNumber] = useState("");
  const [shake, setShake] = useState(false);

  const toEnglishDigits = (value: string) =>
    value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
         .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

  const handleTrack = () => {
    const n = toEnglishDigits(number.trim()).trim();
    if (!n) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    navigate(`/track/${encodeURIComponent(n)}`);
  };

  return (
    <div
      className="rounded-3xl p-5 sm:p-7"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <Search size={16} style={{ color: "rgba(255,255,255,0.6)" }} />
        </div>
        <div>
          <h3 className="font-bold text-sm sm:text-base text-white">هل تبحث عن تحديثات حول شحنتك؟</h3>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>أدخل رقم الشحنة لمعرفة حالتها فورًا</p>
        </div>
      </div>

      <div
        className="flex flex-col sm:flex-row gap-2.5"
        style={{ animation: shake ? "shakeInput 0.4s ease" : "none" }}
      >
        <input
          type="text"
          inputMode="numeric"
          value={number}
          onChange={e => setNumber(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleTrack(); }}
          placeholder="مثال: 1234567890"
          dir="ltr"
          className="flex-1 rounded-xl px-4 py-4 sm:py-3.5 text-white placeholder-white/30 focus:outline-none transition-all duration-300"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1.5px solid rgba(255,255,255,0.12)",
            fontSize: "16px",
            textAlign: "center",
            letterSpacing: "0.05em",
          }}
          onFocus={e => { e.currentTarget.style.border = "1.5px solid rgba(212,175,55,0.5)"; }}
          onBlur={e => { e.currentTarget.style.border = "1.5px solid rgba(255,255,255,0.12)"; }}
        />
        <button
          onClick={handleTrack}
          className="shrink-0 rounded-xl px-6 py-4 sm:py-3.5 font-bold text-sm transition-all duration-300 active:scale-95 flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg, #d4af37 0%, #f0d060 50%, #b8942a 100%)",
            color: "#1a1400",
            boxShadow: "0 4px 20px rgba(212,175,55,0.25)",
          }}
        >
          <Search size={16} />
          تتبع الشحنة
        </button>
      </div>

      <style>{`
        @keyframes shakeInput {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}

// ─── Trust strip — small credibility row, not a generic "why choose us" grid ─
function TrustStrip() {
  const items = [
    { icon: Truck,       label: "توصيل لكل المحافظات" },
    { icon: Clock,       label: "أسعار محدثة أول بأول" },
    { icon: ShieldCheck, label: "شحنات مؤمّنة بالكامل" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map((it, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5 text-center rounded-xl py-3 px-1.5"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <it.icon size={16} style={{ color: "rgba(255,255,255,0.4)" }} />
          <span className="text-[10px] sm:text-[11px] leading-tight" style={{ color: "rgba(255,255,255,0.45)" }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ShippingRatesPage() {
  const [, navigate] = useLocation();
  const [darkMode] = useState(true);

  const [zones, setZones] = useState<ZonePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [fromBranch, setFromBranch] = useState("");
  const [toGov, setToGov] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/shipments/public-prices`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: ZonePrice[]) => { if (!cancelled) { setZones(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // كل محافظات الوصول المتاحة من الفرع المختار (بدون تكرار)
  const destinations = useMemo(() => {
    if (!fromBranch) return [];
    const nb = normalize(fromBranch);
    const seen = new Set<string>();
    return zones
      .filter(z => normalize(z.from) === nb)
      .filter(z => {
        const key = normalize(z.to);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(z => z.to)
      .sort((a, b) => a.localeCompare(b, "ar"));
  }, [zones, fromBranch]);

  // السعر المطابق للفرع + المحافظة المختارة
  const matchedPrice = useMemo(() => {
    if (!fromBranch || !toGov) return null;
    const match = zones.find(z => normalize(z.from) === normalize(fromBranch) && normalize(z.to) === normalize(toGov));
    return match ? match.price : null;
  }, [zones, fromBranch, toGov]);

  // لو غيّر الفرع، نصفّر المحافظة المختارة لو مش متاحة في الفرع الجديد
  useEffect(() => {
    if (toGov && !destinations.some(d => normalize(d) === normalize(toGov))) {
      setToGov("");
    }
  }, [fromBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col" dir="rtl">
      <Navbar darkMode={darkMode} toggleDarkMode={() => {}} />

      <main className="flex-1 flex flex-col items-center pt-24 sm:pt-28 pb-16 sm:pb-20 px-3 sm:px-4">
        <div className="w-full max-w-2xl">
          {/* Back */}
          <button
            onClick={() => navigate("/")}
            className="mb-6 sm:mb-8 flex items-center gap-2 text-xs sm:text-sm transition-colors"
            style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
          >
            <ArrowRight size={16} />
            الرجوع للرئيسية
          </button>

          {/* Header */}
          <div className="text-center mb-8 sm:mb-10">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: "linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.04))",
                border: "1px solid rgba(212,175,55,0.3)",
                boxShadow: "0 0 24px rgba(212,175,55,0.15)",
              }}
            >
              <Truck size={26} style={{ color: "#d4af37" }} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black mb-2 text-white">
              أسعار التوصيل والشحن
            </h1>
            <p className="text-sm px-4" style={{ color: "rgba(255,255,255,0.4)" }}>
              اختر فرع الاستلام والمحافظة اللي هتوصل لها، وشوف السعر فورًا
            </p>
          </div>

          {/* Pricing Card */}
          <div
            className="rounded-3xl p-5 sm:p-7 mb-6 sm:mb-8"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <Loader2 size={24} className="animate-spin" style={{ color: "rgba(212,175,55,0.6)" }} />
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>جاري تحميل الأسعار...</p>
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>تعذّر تحميل الأسعار حاليًا</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>حاول تاني بعد لحظات، أو تواصل معنا مباشرة</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-bold tracking-widest mb-2.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  1. اختر فرع الاستلام
                </p>
                <BranchPicker value={fromBranch} onChange={setFromBranch} />

                <p className="text-xs font-bold tracking-widest mt-6 mb-2.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  2. اختر محافظة الوصول
                </p>
                <DestinationPicker options={destinations} value={toGov} onChange={setToGov} disabled={!fromBranch} />

                <div className="mt-6 mb-2">
                  <RouteLine from={fromBranch} to={toGov} ready={matchedPrice !== null} />
                </div>

                <PriceResult price={matchedPrice} from={fromBranch} to={toGov} />
              </>
            )}
          </div>

          <div className="mb-8 sm:mb-10">
            <TrustStrip />
          </div>

          {/* Track shipment */}
          <TrackWidget />
        </div>
      </main>

      <SocialFloat darkMode={darkMode} />
      <Footer />
    </div>
  );
}
