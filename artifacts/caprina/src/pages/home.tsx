import React, { useState } from "react";
import { trackingImg } from "../trackingImg";
import { logoBase64 } from "@/lib/logo";
import { useLocation } from "wouter";
import { Package, MapPin, Phone, Mail, Menu, X, ChevronDown, Truck, CheckCircle, Clock, Shield, Star, Users, FileText, ArrowLeft, Sun, Moon, LayoutDashboard, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── STARK Glow Animation CSS ─────────────────────────────────────────────────
const starkGlowStyle = `
@keyframes starkGlow {
  0%   {
    filter: drop-shadow(0 0 6px rgba(255,255,255,0.10)) drop-shadow(0 0 15px rgba(255,255,255,0.06));
    letter-spacing: -0.02em;
  }
  25%  {
    filter: drop-shadow(0 0 18px rgba(255,255,255,0.35)) drop-shadow(0 0 45px rgba(220,220,255,0.20)) drop-shadow(0 0 80px rgba(180,180,255,0.10));
  }
  50%  {
    filter: drop-shadow(0 0 40px rgba(255,255,255,0.70)) drop-shadow(0 0 80px rgba(200,200,255,0.40)) drop-shadow(0 0 140px rgba(160,160,255,0.20)) drop-shadow(0 2px 0 rgba(255,255,255,0.9));
    letter-spacing: 0.01em;
  }
  75%  {
    filter: drop-shadow(0 0 18px rgba(255,255,255,0.35)) drop-shadow(0 0 45px rgba(220,220,255,0.20)) drop-shadow(0 0 80px rgba(180,180,255,0.10));
  }
  100% {
    filter: drop-shadow(0 0 6px rgba(255,255,255,0.10)) drop-shadow(0 0 15px rgba(255,255,255,0.06));
    letter-spacing: -0.02em;
  }
}
@keyframes starkGradientShift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes starkGlowSm {
  0%   { text-shadow: 0 0 3px rgba(255,255,255,0.08); }
  25%  { text-shadow: 0 0 8px rgba(255,255,255,0.45), 0 0 20px rgba(255,255,255,0.18); }
  50%  { text-shadow: 0 0 18px rgba(255,255,255,0.75), 0 0 40px rgba(200,200,255,0.35), 0 0 70px rgba(180,180,255,0.18); }
  75%  { text-shadow: 0 0 8px rgba(255,255,255,0.45), 0 0 20px rgba(255,255,255,0.18); }
  100% { text-shadow: 0 0 3px rgba(255,255,255,0.08); }
}
.stark-glow-text {
  animation: starkGlow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  background-size: 300% 300% !important;
  animation: starkGlow 4s cubic-bezier(0.4,0,0.6,1) infinite, starkGradientShift 4s ease infinite;
}
.stark-glow-text-sm {
  animation: starkGlowSm 4s cubic-bezier(0.4,0,0.6,1) infinite;
}
`;

// ─── Navbar ───────────────────────────────────────────────────────────────────
export function Navbar({ darkMode, toggleDarkMode }: { darkMode: boolean; toggleDarkMode: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const [location, navigate] = useLocation();
  const isHome = location === "/" || location === "/home";

  const navLinks = [
    { label: "الرئيسية", id: "home" },
    { label: "من نحن",   id: "about" },
    { label: "خدماتنا",  id: "services" },
    { label: "العقد والتعاقد", id: "contract" },
    { label: "اتصل بنا", id: "contact" },
  ];

  const scrollTo = (id: string) => {
    if (id === "home") {
      if (!isHome) { navigate("/"); return; }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!isHome) { navigate("/"); setTimeout(() => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 400); return; }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  React.useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      const sections = navLinks.map(l => l.id).filter(id => id !== "home");
      let found = "home";
      for (const id of [...sections].reverse()) {
        const el = document.getElementById(id);
        if (el && window.scrollY >= el.offsetTop - 100) {
          found = id;
          break;
        }
      }
      setActiveSection(found);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navBg = darkMode
    ? scrolled ? "bg-[#0a0a0a]/95 border-[#2a2a2a] shadow-lg shadow-black/40" : "bg-transparent border-transparent"
    : scrolled ? "bg-white/95 border-gray-200 shadow-lg shadow-gray-200/40" : "bg-transparent border-transparent";

  const logoText = "STARK";

  return (
    <nav className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] sm:w-[92%] max-w-4xl" dir="rtl">
      <div
        className="flex items-center justify-between px-3 sm:px-5 h-[52px] sm:h-[58px] rounded-2xl backdrop-blur-xl transition-all duration-500"
        style={{
          background: darkMode
            ? "rgba(10,10,10,0.85)"
            : "rgba(255,255,255,0.88)",
          border: darkMode
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(0,0,0,0.09)",
          boxShadow: darkMode
            ? "0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset"
            : "0 8px 32px rgba(0,0,0,0.10), 0 1px 0 rgba(255,255,255,0.8) inset",
        }}
      >
        {/* Logo */}
        <button onClick={() => scrollTo("home")} className="flex items-center gap-2 sm:gap-3 group">
          <div className="relative">
            <img src={logoBase64} alt="STARK" className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover ring-2 ring-white/10 group-hover:ring-white/30 transition-all duration-300" />
          </div>
          <span
            className="hidden sm:block font-black text-lg tracking-[0.25em] stark-glow-text-sm"
            style={{
              color: darkMode ? "#ffffff" : "#111111",
              letterSpacing: "0.25em",
            }}
          >
            {logoText}
          </span>
        </button>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(l => {
            const isActive = activeSection === l.id;
            return (
              <button
                key={l.id}
                onClick={() => scrollTo(l.id)}
                className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 group ${
                  isActive
                    ? darkMode ? "text-white" : "text-black"
                    : darkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-black"
                }`}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: darkMode
                        ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))"
                        : "linear-gradient(135deg, rgba(0,0,0,0.06), rgba(0,0,0,0.02))",
                      border: darkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
                    }}
                  />
                )}
                <span className="relative z-10">{l.label}</span>
                {isActive && (
                  <span
                    className="absolute bottom-1 right-1/2 translate-x-1/2 h-0.5 w-5 rounded-full"
                    style={{
                      background: darkMode
                        ? "linear-gradient(90deg, #c0c0c0, #ffffff)"
                        : "linear-gradient(90deg, #555, #000)",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Dark/Light Toggle */}
          <button
            onClick={toggleDarkMode}
            className={`p-2.5 rounded-xl transition-all duration-300 ${
              darkMode
                ? "bg-white/8 hover:bg-white/15 text-gray-300 hover:text-white border border-white/10"
                : "bg-black/5 hover:bg-black/10 text-gray-600 hover:text-black border border-black/8"
            }`}
            title={darkMode ? "الوضع النهاري" : "الوضع الليلي"}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Login Button */}
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300"
            style={{
              background: darkMode
                ? "linear-gradient(135deg, #c0c0c0 0%, #f5f5f5 50%, #a8a8a8 100%)"
                : "linear-gradient(135deg, #1a1a1a 0%, #333 50%, #111 100%)",
              color: darkMode ? "#0a0a0a" : "#ffffff",
              boxShadow: darkMode
                ? "0 0 0 1px rgba(255,255,255,0.15), 0 4px 20px rgba(255,255,255,0.1)"
                : "0 0 0 1px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.15)",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
          >
            <LayoutDashboard size={15} />
            <span className="hidden sm:inline">تسجيل الدخول</span>
          </button>

          {/* Mobile Menu Toggle — Animated Hamburger */}
          <button
            className={`md:hidden p-2 rounded-xl transition-colors focus:outline-none ${darkMode ? "text-white hover:bg-white/10" : "text-black hover:bg-black/10"}`}
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              {/* Top line */}
              <line
                x1="3" y1="6" x2="19" y2="6"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{
                  transformOrigin: "11px 6px",
                  transition: "transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.2s",
                  transform: menuOpen ? "rotate(45deg) translate(0px, 5px)" : "rotate(0deg) translate(0,0)",
                }}
              />
              {/* Middle line */}
              <line
                x1="3" y1="11" x2="19" y2="11"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{
                  transformOrigin: "11px 11px",
                  transition: "opacity 0.2s 0.1s, transform 0.2s",
                  opacity: menuOpen ? 0 : 1,
                  transform: menuOpen ? "scaleX(0)" : "scaleX(1)",
                }}
              />
              {/* Bottom line */}
              <line
                x1="3" y1="16" x2="19" y2="16"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{
                  transformOrigin: "11px 16px",
                  transition: "transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.2s",
                  transform: menuOpen ? "rotate(-45deg) translate(0px, -5px)" : "rotate(0deg) translate(0,0)",
                }}
              />
            </svg>
          </button>
        </div>
      </div>
      {/* Mobile Menu — animated slide + fade */}
      <div
        className="md:hidden overflow-hidden"
        style={{
          maxHeight: menuOpen ? "400px" : "0px",
          opacity: menuOpen ? 1 : 0,
          marginTop: menuOpen ? "8px" : "0px",
          transition: menuOpen
            ? "max-height 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease 0.05s, margin-top 0.3s ease"
            : "max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.18s ease, margin-top 0.3s ease",
        }}
      >
        <div
          className="rounded-2xl px-3 py-3 flex flex-col gap-1"
          style={{
            background: darkMode ? "rgba(10,10,10,0.97)" : "rgba(255,255,255,0.98)",
            border: darkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.09)",
            boxShadow: darkMode ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.10)",
            backdropFilter: "blur(16px)",
          }}
        >
          {navLinks.map((l, idx) => {
            const isActive = activeSection === l.id;
            return (
              <button
                key={l.id}
                onClick={() => { scrollTo(l.id); setMenuOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-right w-full ${
                  isActive
                    ? darkMode ? "bg-white/10 text-white" : "bg-black/6 text-black"
                    : darkMode ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:text-black hover:bg-black/4"
                }`}
                style={{
                  transition: `opacity 0.25s ease ${menuOpen ? idx * 0.05 + 0.08 : 0}s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1) ${menuOpen ? idx * 0.05 + 0.06 : 0}s`,
                  opacity: menuOpen ? 1 : 0,
                  transform: menuOpen ? "translateY(0)" : "translateY(-8px)",
                }}
              >
                {isActive && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: darkMode ? "#c0c0c0" : "#333" }} />}
                {l.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────
function HeroSection() {
  const [, navigate] = useLocation();
  return (
    <section id="hero" className="relative flex items-center justify-center overflow-hidden bg-black" dir="rtl"
      style={{ minHeight: "auto", paddingTop: "100px", paddingBottom: "32px" }}>
      {/* BG */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0d0d0d] to-[#1a1a1a]" />
      <div className="absolute inset-0" style={{ opacity: 0.50 }}>
        <img src={trackingImg} alt="" className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/80" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 text-center flex flex-col items-center"
        style={{ paddingBottom: "0px" }}>

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 sm:gap-3 rounded-full px-4 sm:px-5 py-2 sm:py-2.5 mb-6 sm:mb-8"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08) inset",
          }}
        >
          <span className="flex items-center justify-center rounded-full w-6 h-6 sm:w-7 sm:h-7"
            style={{ background: "rgba(255,255,255,0.12)" }}>
            <Truck size={12} className="text-white sm:hidden" />
            <Truck size={14} className="text-white hidden sm:block" />
          </span>
          <span className="text-white/90 text-xs sm:text-sm font-medium tracking-wide">
            شركة شحن محلية موثوقة منذ 2001
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        </div>

        {/* Title */}
        <h1 className="flex items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-5 flex-wrap" dir="ltr">
          <span
            className="inline-block font-black stark-glow-text"
            style={{
              fontSize: "clamp(52px, 14vw, 112px)",
              background: "linear-gradient(120deg, #c0c0c0 0%, #ffffff 20%, #f0f0f0 35%, #ffffff 50%, #d0d0ff 65%, #ffffff 80%, #b0b0b0 100%)",
              backgroundSize: "300% 300%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "-0.02em",
              textShadow: "none",
              willChange: "filter, letter-spacing",
              lineHeight: 1,
            }}
          >
            STARK
          </span>
          <span style={{ width: 1, height: "clamp(28px,5vw,48px)", background: "rgba(255,255,255,0.2)", display: "inline-block", borderRadius: 1, alignSelf: "center" }} />
          <span
            className="inline-block font-light"
            style={{
              fontSize: "clamp(16px, 4vw, 28px)",
              background: "linear-gradient(135deg, #b0b0b0 0%, #e0e0e0 35%, #909090 65%, #c8c8c8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 10px rgba(180,180,180,0.25))",
              letterSpacing: "0.2em",
            }}
          >
            للشحن
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-white/50 text-sm sm:text-base max-w-xs sm:max-w-md mx-auto leading-relaxed px-2">
          نوصل شحنتك لأي مكان في مصر بسرعة وأمان — 27 محافظة تحت خدمتك
        </p>
      </div>
    </section>
  );
}

// ─── Tracking Section ─────────────────────────────────────────────────────────
function TrackingSection({ darkMode }: { darkMode: boolean }) {
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const toEnglishDigits = (value: string) =>
    value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
         .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

  const isValidEgyptianPhone = (p: string) => /^01[0-9]{9}$/.test(p);

  const handleTrack = () => {
    const n = senderName.trim();
    const p = toEnglishDigits(senderPhone.trim()).replace(/[^0-9]/g, "");

    if (!n) {
      toast({ variant: "destructive", title: "بيانات ناقصة", description: "من فضلك أدخل اسم الراسل" });
      return;
    }
    if (!p) {
      toast({ variant: "destructive", title: "بيانات ناقصة", description: "من فضلك أدخل رقم هاتف الراسل" });
      return;
    }
    if (!isValidEgyptianPhone(p)) {
      toast({ variant: "destructive", title: "رقم هاتف غير صحيح", description: "رقم الهاتف لازم يبدأ بـ 01 ويتكون من 11 رقم" });
      return;
    }

    setIsTracking(true);
    navigate(`/track-client?name=${encodeURIComponent(n)}&phone=${encodeURIComponent(p)}`);
  };
  const steps = [
    { icon: FileText, label: "تم التسجيل" },
    { icon: Package, label: "جارى التجميع" },
    { icon: Truck, label: "جاري الشحن" },
    { icon: MapPin, label: "داخل التوصيل" },
    { icon: CheckCircle, label: "تم التسليم" },
  ];
  return (
    <section
      id="tracking"
      className="relative z-20 pb-12 sm:pb-16"
      dir="rtl"
      style={{
        marginTop: "0px",
        background: "transparent",
      }}
    >
      <div className="w-full relative" style={{ zIndex: 1 }}>
        <div
          className="relative px-4 sm:px-8 pt-4 pb-8 sm:pb-10 text-center"
          style={{
            background: "rgba(0,0,0,0.25)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <div className="relative max-w-3xl mx-auto" style={{ zIndex: 2 }}>
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 0 20px rgba(255,255,255,0.1)" }}>
              <Package size={24} className="text-white sm:hidden" />
              <Package size={28} className="text-white hidden sm:block" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black mb-2"
              style={{ background: "linear-gradient(135deg, #ffffff 0%, #d0d0d0 50%, #a0a0a0 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 20px rgba(255,255,255,0.3))" }}>
              تتبع الشحنة
            </h2>
            <p className="mb-6 sm:mb-8 text-xs sm:text-sm px-2" style={{ color: "rgba(200,200,200,0.75)", textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
              أدخل اسم الراسل ورقم هاتفك أنت لمعرفة حالة شحنتك
            </p>

            {/* Inputs */}
            <div className="flex flex-col gap-3 max-w-lg mx-auto mb-8 sm:mb-10 px-2 sm:px-0">
              <input
                type="text"
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleTrack(); }}
                placeholder="اسم الراسل   مثال: CELIA"
                disabled={isTracking}
                dir="rtl"
                className="w-full rounded-xl px-4 py-3.5 sm:py-3 focus:outline-none text-sm text-white placeholder-white/40 backdrop-blur-sm transition-all duration-300 disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1.5px solid rgba(255,255,255,0.6)",
                  boxShadow: "0 0 25px rgba(255,255,255,0.18), 0 0 60px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.15)",
                  fontSize: "16px",
                }}
                onFocus={e => { e.currentTarget.style.border = "1.5px solid rgba(255,255,255,0.9)"; e.currentTarget.style.boxShadow = "0 0 35px rgba(255,255,255,0.28), 0 0 80px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.2)"; }}
                onBlur={e => { e.currentTarget.style.border = "1.5px solid rgba(255,255,255,0.6)"; e.currentTarget.style.boxShadow = "0 0 25px rgba(255,255,255,0.18), 0 0 60px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.15)"; }}
              />
              <input
                type="tel"
                value={senderPhone}
                onChange={e => setSenderPhone(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleTrack(); }}
                placeholder="رقم هاتفك أنت   مثال: 01012345678"
                disabled={isTracking}
                dir="ltr"
                className="w-full rounded-xl px-4 py-3.5 sm:py-3 focus:outline-none text-sm text-white placeholder-white/40 backdrop-blur-sm transition-all duration-300 disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1.5px solid rgba(255,255,255,0.6)",
                  boxShadow: "0 0 25px rgba(255,255,255,0.18), 0 0 60px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.15)",
                  fontSize: "16px",
                }}
                onFocus={e => { e.currentTarget.style.border = "1.5px solid rgba(255,255,255,0.9)"; e.currentTarget.style.boxShadow = "0 0 35px rgba(255,255,255,0.28), 0 0 80px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.2)"; }}
                onBlur={e => { e.currentTarget.style.border = "1.5px solid rgba(255,255,255,0.6)"; e.currentTarget.style.boxShadow = "0 0 25px rgba(255,255,255,0.18), 0 0 60px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.15)"; }}
              />
              <button
                onClick={handleTrack}
                disabled={isTracking}
                className="w-full font-bold px-6 py-3.5 sm:py-3 rounded-xl transition-all duration-300 text-sm text-black hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #ffffff 0%, #d8d8d8 100%)", boxShadow: "0 0 20px rgba(255,255,255,0.2), 0 4px 12px rgba(0,0,0,0.3)", fontSize: "16px" }}>
                {isTracking ? (
                  <><Loader2 size={16} className="animate-spin" />جاري البحث...</>
                ) : "بحث عن الشحنة"}
              </button>
            </div>

            {/* Steps */}
            <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap px-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-1 sm:gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center backdrop-blur-sm transition-all duration-300 hover:scale-110"
                      style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 0 12px rgba(255,255,255,0.06)" }}>
                      <step.icon size={14} className="sm:hidden" style={{ color: "rgba(220,220,220,0.9)" }} />
                      <step.icon size={18} className="hidden sm:block" style={{ color: "rgba(220,220,220,0.9)" }} />
                    </div>
                    <span className="text-[10px] sm:text-xs" style={{ color: "rgba(180,180,180,0.8)", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{step.label}</span>
                  </div>
                  {i < steps.length - 1 && <div className="w-4 sm:w-8 h-px mb-4" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)" }} />}
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6 sm:mt-8 px-2 sm:px-0">
              <button onClick={() => navigate("/contract")} className="w-full sm:w-auto cursor-pointer border border-[#555] text-white font-bold px-8 py-3.5 sm:py-3 rounded-xl hover:border-white/50 transition-colors flex items-center justify-center gap-2 text-sm">
                <FileText size={16} /> تعاقد معنا
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── About Section ────────────────────────────────────────────────────────────
function AboutSection({ darkMode }: { darkMode: boolean }) {
  const features = [
    { icon: Star, label: "الخبرة" },
    { icon: Shield, label: "الاعتمادية" },
    { icon: MapPin, label: "الوصول المحلى" },
    { icon: Users, label: "الخدمة" },
  ];
  return (
    <section id="about" className={`py-16 sm:py-20 ${darkMode ? "bg-black" : "bg-white"}`} dir="rtl">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 items-center">
          <div>
            <h2 className={`text-2xl sm:text-3xl font-black mb-3 sm:mb-4 ${darkMode ? "text-white" : "text-black"}`}>من نحن</h2>
            <p className={`leading-relaxed mb-5 sm:mb-6 text-sm sm:text-base ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
              تُعدّ <bdi className="stark-glow-text-sm font-black" style={{ unicodeBidi: "embed", direction: "ltr", display: "inline-block", background: "linear-gradient(120deg, #c0c0c0 0%, #ffffff 35%, #d0d0ff 65%, #b0b0b0 100%)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STARK</bdi> لوجستيك من أبرز شركات الشحن والخدمات اللوجستية داخل مصر،
              حيث تقدّم خدماتها للأفراد والشركات في جميع المحافظات والمدن على مستوى الجمهورية منذ عام 2001.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {features.map((f, i) => (
                <div key={i} className={`border rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3 ${darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-gray-50 border-gray-200"}`}>
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${darkMode ? "bg-white/10" : "bg-black/8"}`}>
                    <f.icon size={16} className={darkMode ? "text-gray-300" : "text-gray-600"} />
                  </div>
                  <span className={`font-semibold text-xs sm:text-sm ${darkMode ? "text-gray-200" : "text-gray-800"}`}>{f.label}</span>
                </div>
              ))}
            </div>
            <button onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })} className={`inline-flex items-center gap-2 mt-5 sm:mt-6 transition-colors text-sm ${darkMode ? "text-gray-300 hover:text-white" : "text-gray-500 hover:text-black"}`}>
              المزيد <ArrowLeft size={16} />
            </button>
          </div>
          <div className={`border rounded-2xl p-6 sm:p-8 text-center ${darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-gray-50 border-gray-200"}`}>
            <img src={logoBase64} alt="STARK" className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl mx-auto mb-3 sm:mb-4 object-cover" />
            <h3 className={`font-bold text-lg sm:text-xl mb-1 ${darkMode ? "text-white" : "text-black"}`}>
              <span className="stark-glow-text-sm" style={{ display: "inline-block", background: "linear-gradient(120deg, #c0c0c0 0%, #ffffff 35%, #d0d0ff 65%, #b0b0b0 100%)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STARK</span> للشحن
            </h3>
            <p className={`text-xs sm:text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>خدمة الشحن الموثوقة في مصر</p>
            <div className={`grid grid-cols-3 gap-3 sm:gap-4 mt-5 sm:mt-6 pt-5 sm:pt-6 border-t ${darkMode ? "border-[#222]" : "border-gray-200"}`}>
              {[["4+", "سنة خبرة"], ["27", "محافظة"], ["99%", "رضا العملاء"]].map(([val, lbl], i) => (
                <div key={i}>
                  <div className={`text-xl sm:text-2xl font-black ${darkMode ? "text-white" : "text-black"}`}>{val}</div>
                  <div className={`text-[10px] sm:text-xs mt-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Shipping Cycle Section ───────────────────────────────────────────────────
function ShippingCycleSection({ darkMode }: { darkMode: boolean }) {
  const [visible, setVisible] = React.useState(false);
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  const sectionRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const steps = [
    { num: "1", title: "تسجيل الشحنة", desc: "سجل شحنتك بسرعة وسهولة من خلال لوحة التحكم أو تواصل معنا مباشرة", icon: FileText },
    { num: "2", title: "طلب البيك أب", desc: "نستقبل طلبك ونرسل مندوب لاستلام الشحنة من موقعك", icon: Truck },
    { num: "3", title: "الفرز والتجميع", desc: "تُفرز الشحنات وتُجمع لتسريع وتحسين عمليات التوزيع", icon: Package },
    { num: "4", title: "جاري التوصيل", desc: "تنطلق الشحنة برحلتها نحو وجهتها مع تتبع فوري مستمر", icon: MapPin },
    { num: "5", title: "تم التسليم والتحصيل", desc: "يتم تسليم الشحنة للمستلم وتحصيل المبلغ إن وجد بأمان وسرعة", icon: CheckCircle },
  ];

  return (
    <section ref={sectionRef} id="services" className={`py-16 sm:py-20 overflow-hidden ${darkMode ? "bg-[#0a0a0a]" : "bg-gray-100"}`} dir="rtl">
      <style>{`
        @keyframes cycleCardIn {
          from { opacity: 0; transform: translateY(40px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes cycleNumPop {
          0%   { transform: translateX(50%) scale(0); opacity: 0; }
          60%  { transform: translateX(50%) scale(1.25); opacity: 1; }
          100% { transform: translateX(50%) scale(1); opacity: 1; }
        }
        @keyframes cycleIconSpin {
          from { transform: rotateY(0deg); }
          to   { transform: rotateY(360deg); }
        }
        @keyframes connectorGrow {
          from { transform: scaleX(0); opacity: 0; }
          to   { transform: scaleX(1); opacity: 1; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-14">
          <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 ${darkMode ? "bg-white/10" : "bg-black/8"}`}
            style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: "opacity 0.5s ease, transform 0.5s ease" }}>
            <Truck size={24} className={`sm:hidden ${darkMode ? "text-white" : "text-black"}`} />
            <Truck size={28} className={`hidden sm:block ${darkMode ? "text-white" : "text-black"}`} />
          </div>
          <h2 className={`text-2xl sm:text-3xl font-black mb-2 ${darkMode ? "text-white" : "text-black"}`}
            style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: "opacity 0.5s 0.1s ease, transform 0.5s 0.1s ease" }}>
            دورة الشحن
          </h2>
          <p className={`text-sm sm:text-base ${darkMode ? "text-gray-400" : "text-gray-500"}`}
            style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: "opacity 0.5s 0.18s ease, transform 0.5s 0.18s ease" }}>
            كيف توصل شحنتك من باب التاجر لباب العميل في خطوات بسيطة
          </p>
        </div>

        {/* Cards — vertical on mobile, horizontal on desktop */}
        <div className="relative flex flex-col sm:flex-row items-stretch gap-3 sm:gap-0">
          {steps.map((s, i) => {
            const isHovered = hoveredIdx === i;
            const delay = visible ? `${i * 0.1}s` : "0s";
            return (
              <React.Fragment key={i}>
                <div
                  className="flex-1 relative"
                  style={{ animation: visible ? `cycleCardIn 0.55s cubic-bezier(0.34,1.56,0.64,1) ${delay} both` : "none", opacity: visible ? undefined : 0 }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <div
                    className={`border rounded-2xl p-4 sm:p-5 relative flex sm:flex-col items-center sm:text-center gap-4 sm:gap-0 mx-0 sm:mx-2 transition-all duration-300 h-full ${darkMode ? "bg-[#111] border-[#222]" : "bg-white border-gray-200"}`}
                    style={{
                      transform: isHovered ? "translateY(-10px) scale(1.03)" : "translateY(0) scale(1)",
                      boxShadow: isHovered ? (darkMode ? "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.12)" : "0 20px 60px rgba(0,0,0,0.12)") : "none",
                      borderColor: isHovered ? (darkMode ? "rgba(192,192,192,0.4)" : "rgba(0,0,0,0.25)") : undefined,
                      transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.35s ease, border-color 0.35s ease",
                    }}
                  >
                    {/* Number badge */}
                    <div
                      className={`absolute -top-3 right-1/2 w-6 h-6 rounded-full text-xs font-black flex items-center justify-center z-10 hidden sm:flex ${darkMode ? "bg-white text-black" : "bg-black text-white"}`}
                      style={{ animation: visible ? `cycleNumPop 0.5s cubic-bezier(0.34,1.56,0.64,1) ${parseFloat(delay) + 0.25}s both` : "none", right: "50%", transform: "translateX(50%)" }}
                    >{s.num}</div>
                    {/* Mobile number */}
                    <div className={`sm:hidden w-8 h-8 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 ${darkMode ? "bg-white text-black" : "bg-black text-white"}`}>{s.num}</div>

                    {/* Icon */}
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center sm:mb-3 sm:mt-4 flex-shrink-0 transition-all duration-300 ${darkMode ? "bg-white/10" : "bg-black/6"}`}
                      style={{ animation: isHovered ? "cycleIconSpin 0.6s ease" : "none" }}>
                      <s.icon size={18} className={`sm:hidden ${darkMode ? "text-gray-300" : "text-gray-600"}`} />
                      <s.icon size={22} className={`hidden sm:block ${darkMode ? "text-gray-300" : "text-gray-600"}`} />
                    </div>

                    <div className="flex-1 sm:flex-none">
                      <h3 className={`font-bold text-sm mb-1 sm:mb-2 ${darkMode ? "text-white" : "text-black"}`}>{s.title}</h3>
                      <p className={`text-xs leading-relaxed ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{s.desc}</p>
                    </div>

                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-500"
                      style={{ width: isHovered ? "70%" : "0%", background: darkMode ? "linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)" : "linear-gradient(90deg,transparent,rgba(0,0,0,0.3),transparent)" }} />
                  </div>
                </div>

                {/* Connector — only on desktop */}
                {i < steps.length - 1 && (
                  <div className="hidden sm:flex items-center justify-center flex-shrink-0 w-6 z-10">
                    <div style={{ width: "100%", height: "2px", background: darkMode ? "linear-gradient(90deg,rgba(255,255,255,0.15),rgba(255,255,255,0.35),rgba(255,255,255,0.15))" : "linear-gradient(90deg,rgba(0,0,0,0.1),rgba(0,0,0,0.25),rgba(0,0,0,0.1))", transformOrigin: "right", animation: visible ? `connectorGrow 0.4s ease ${i * 0.1 + 0.45}s both` : "none" }} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 sm:gap-3 justify-center mt-8 sm:mt-10">
          {[{ icon: Shield, label: "الخدمة" }, { icon: MapPin, label: "الاعتمادية" }, { icon: Users, label: "الوصول المحلي" }, { icon: Star, label: "الخبرة" }].map((t, i) => (
            <div key={i}
              className={`flex items-center gap-2 border rounded-xl px-3 sm:px-4 py-2 transition-all duration-300 cursor-default ${darkMode ? "bg-[#111] border-[#222] hover:border-[#444] hover:bg-[#1a1a1a]" : "bg-white border-gray-200 hover:border-gray-400 hover:bg-gray-50"}`}
              style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)", transition: `opacity 0.4s ${0.55 + i * 0.07}s ease, transform 0.4s ${0.55 + i * 0.07}s ease, background 0.3s, border-color 0.3s` }}>
              <t.icon size={14} className={darkMode ? "text-gray-400" : "text-gray-500"} />
              <span className={`text-xs sm:text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Contract Section ─────────────────────────────────────────────────────────
function ContractSection({ darkMode }: { darkMode: boolean }) {
  const items = [
    { icon: FileText, label: "الظروف المتعاقدة" },
    { icon: Shield, label: "التمهيد" },
    { icon: Star, label: "بنود العقد" },
  ];
  return (
    <section id="contract" className={`py-16 sm:py-20 ${darkMode ? "bg-black" : "bg-white"}`} dir="rtl">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 ${darkMode ? "bg-white/10" : "bg-black/8"}`}>
          <FileText size={22} className={`sm:hidden ${darkMode ? "text-white" : "text-black"}`} />
          <FileText size={28} className={`hidden sm:block ${darkMode ? "text-white" : "text-black"}`} />
        </div>
        <h2 className={`text-2xl sm:text-3xl font-black mb-2 ${darkMode ? "text-white" : "text-black"}`}>
          عقد شركة <span className="stark-glow-text-sm" style={{ display: "inline-block", background: "linear-gradient(120deg, #c0c0c0 0%, #ffffff 35%, #d0d0ff 65%, #b0b0b0 100%)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STARK</span> للشحن
        </h2>
        <p className={`mb-6 sm:mb-8 text-sm sm:text-base px-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          عقد خدمات الشحن والتوصيل • شركة <span className="stark-glow-text-sm" style={{ display: "inline-block", background: "linear-gradient(120deg, #c0c0c0 0%, #ffffff 35%, #d0d0ff 65%, #b0b0b0 100%)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STARK</span> للشحن
        </p>
        <div className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8 text-right">
          {items.map((item, i) => (
            <div key={i} className={`flex items-center gap-3 sm:gap-4 border rounded-xl px-4 sm:px-5 py-3 sm:py-4 ${darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-gray-50 border-gray-200"}`}>
              <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${darkMode ? "bg-white/10" : "bg-black/8"}`}>
                <item.icon size={16} className={`sm:hidden ${darkMode ? "text-gray-300" : "text-gray-600"}`} />
                <item.icon size={18} className={`hidden sm:block ${darkMode ? "text-gray-300" : "text-gray-600"}`} />
              </div>
              <span className={`font-medium text-sm sm:text-base ${darkMode ? "text-gray-200" : "text-gray-700"}`}>{item.label}</span>
            </div>
          ))}
        </div>
        <a
          href="/contract"
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 font-bold px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl transition-all duration-300 text-sm sm:text-base ${darkMode ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}
          style={{ boxShadow: darkMode ? "0 4px 20px rgba(255,255,255,0.15)" : "0 4px 20px rgba(0,0,0,0.2)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)"; }}
        >
          <FileText size={16} className="sm:hidden" /><FileText size={18} className="hidden sm:block" /> عرض العقد كاملاً
        </a>
      </div>
    </section>
  );
}

// ─── Features Section ─────────────────────────────────────────────────────────
function FeaturesSection({ darkMode }: { darkMode: boolean }) {
  const features = [
    { icon: Truck,   title: "تسليم سريع",  desc: "خدمات شحن سريعة مع أوقات توصيل مضمونة لتلبية احتياجاتك اللوجستية العاجلة", tall: false },
    { icon: MapPin,  title: "تتبع لحظي",   desc: "تتبع شحناتك في الوقت الفعلي باستخدام نظام GPS المتطور واحصل على تحديثات فورية", tall: true  },
    { icon: Shield,  title: "تغليف آمن",   desc: "حلول تغليف احترافية تضمن وصول بضائعك بأمان وسلامة إلى وجهتها", tall: false },
    { icon: Clock,   title: "دعم 24/7",    desc: "خدمة عملاء على مدار الساعة لمساعدتك في جميع استفسارات الشحن", tall: true  },
  ];

  const lineColor   = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const accentColor = darkMode ? "rgba(192,192,192,0.10)" : "rgba(0,0,0,0.06)";

  return (
    <section id="features" className={`relative py-16 sm:py-24 overflow-hidden ${darkMode ? "bg-[#0a0a0a]" : "bg-gray-100"}`} dir="rtl">
      {/* SVG bg lines */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,150 C200,80 400,220 600,150 C800,80 1000,220 1200,150"   fill="none" stroke={lineColor}   strokeWidth="1.5"/>
        <path d="M0,250 C150,180 350,320 550,250 C750,180 950,320 1200,250"  fill="none" stroke={lineColor}   strokeWidth="1"/>
        <path d="M0,350 C250,280 450,420 650,350 C850,280 1050,420 1200,350" fill="none" stroke={lineColor}   strokeWidth="1.5"/>
        <path d="M0,450 C200,380 400,520 600,450 C800,380 1000,520 1200,450" fill="none" stroke={lineColor}   strokeWidth="1"/>
        <path d="M100,0 C180,150 80,350 150,600"   fill="none" stroke={accentColor} strokeWidth="1"/>
        <path d="M400,0 C500,120 350,300 420,600"  fill="none" stroke={accentColor} strokeWidth="1.5"/>
        <path d="M750,0 C820,200 700,400 780,600"  fill="none" stroke={accentColor} strokeWidth="1"/>
        <path d="M1050,0 C1100,180 980,380 1050,600" fill="none" stroke={accentColor} strokeWidth="1.5"/>
        <ellipse cx="900" cy="200" rx="300" ry="120" fill="none" stroke={accentColor} strokeWidth="1"/>
        <ellipse cx="300" cy="400" rx="250" ry="100" fill="none" stroke={lineColor}   strokeWidth="1"/>
      </svg>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-14">
          <span className={`inline-block text-xs font-bold tracking-widest uppercase px-3 sm:px-4 py-1.5 rounded-full mb-3 sm:mb-4 ${darkMode ? "bg-white/8 text-gray-400 border border-white/10" : "bg-black/5 text-gray-500 border border-black/8"}`}>
            مميزاتنا
          </span>
          <h2 className={`text-2xl sm:text-4xl font-black mb-2 sm:mb-3 ${darkMode ? "text-white" : "text-black"}`}>
            لماذا <span className="stark-glow-text-sm" style={{ display: "inline-block", background: "linear-gradient(120deg, #c0c0c0 0%, #ffffff 35%, #d0d0ff 65%, #b0b0b0 100%)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STARK</span>؟
          </h2>
          <p className={`text-xs sm:text-base max-w-xl mx-auto px-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>حلول لوجستية متكاملة مناسبة لكل احتياجاتك</p>
        </div>

        {/* Cards — 2 col on mobile, 4 col on desktop, no alternating heights on mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {features.map((f, i) => (
            <div
              key={i}
              className={`relative rounded-xl sm:rounded-3xl p-3.5 sm:p-7 flex flex-col items-center text-center border
                ${darkMode ? "bg-[#111] border-[#222]" : "bg-white border-gray-200"}`}
              style={{
                minHeight: "160px",
                transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.35s ease, border-color 0.35s ease",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.transform = "translateY(-10px)";
                el.style.borderColor = darkMode ? "rgba(192,192,192,0.5)" : "rgba(0,0,0,0.3)";
                el.style.boxShadow = darkMode ? "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(192,192,192,0.15)" : "0 24px 64px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.10)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget;
                el.style.transform = "translateY(0)";
                el.style.borderColor = darkMode ? "#222" : "#e5e7eb";
                el.style.boxShadow = "none";
              }}
            >
              <div className="absolute inset-0 rounded-xl sm:rounded-3xl pointer-events-none opacity-0 transition-opacity duration-500 hover:opacity-100"
                style={{ background: darkMode ? "linear-gradient(135deg,rgba(255,255,255,0.04),transparent 60%)" : "linear-gradient(135deg,rgba(0,0,0,0.025),transparent 60%)" }} />
              <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-2.5 sm:mb-6 mt-0.5 sm:mt-2
                ${darkMode ? "bg-[#1a1a1a] border border-[#2a2a2a]" : "bg-gray-100 border border-gray-200"}`}>
                <f.icon size={17} className={`sm:hidden ${darkMode ? "text-gray-300" : "text-gray-600"}`} strokeWidth={1.5} />
                <f.icon size={26} className={`hidden sm:block ${darkMode ? "text-gray-300" : "text-gray-600"}`} strokeWidth={1.5} />
              </div>
              <h3 className={`text-sm sm:text-xl font-black mb-1.5 sm:mb-3 ${darkMode ? "text-white" : "text-black"}`}>{f.title}</h3>
              <p className={`text-[11px] sm:text-sm leading-relaxed ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Clients Section ──────────────────────────────────────────────────────────
function ClientsSection() {
  const [clients, setClients] = React.useState<{ id: number; name: string; avatar: string | null }[]>([]);
  const [count, setCount] = React.useState(0);
  const [visible, setVisible] = React.useState(false);
  const sectionRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    fetch("/api/clients-showcase")
      .then(r => r.json())
      .then(data => { const list = (Array.isArray(data) ? data : []).slice(0, 14); setClients(list); })
      .catch(() => {});
  }, []);

  // Intersection observer → trigger counter + reveal
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // Animated counter 0 → 200
  React.useEffect(() => {
    if (!visible) return;
    let frame: number;
    const duration = 1800;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * 200));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const placeholders = Array.from({ length: 20 }, (_, i) => ({ id: -i, name: `عميل ${i + 1}`, avatar: null }));
  const items = clients.length >= 1 ? clients : placeholders;

  // Trust stats
  const stats = [
    { value: "27", label: "محافظة نغطيها" },
    { value: "99%", label: "نسبة رضا العملاء" },
    { value: "24/7", label: "دعم متواصل" },
    { value: "2001", label: "سنة التأسيس" },
  ];



  const avatarColors = ["#1e3a5f","#2d1b4e","#1a3c2e","#3c1a1a","#2e2a10","#12303c"];

  return (
    <section ref={sectionRef} className="relative py-16 sm:py-24 bg-[#050505] overflow-hidden" dir="rtl">
      <style>{`
        @keyframes clientsScrollLeft  { 0%{transform:translateX(0)}   100%{transform:translateX(-50%)} }
        @keyframes clientsScrollRight { 0%{transform:translateX(-50%)} 100%{transform:translateX(0)}   }
        .clients-row1 { animation: clientsScrollLeft 25s linear infinite; }
        .clients-row1:hover { animation-play-state: paused; }
        @keyframes clientsFadeUp {
          from { opacity:0; transform:translateY(32px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes clientsCountPop {
          0%   { transform:scale(0.7); opacity:0; }
          60%  { transform:scale(1.08); }
          100% { transform:scale(1); opacity:1; }
        }
        @keyframes clientsGridReveal {
          from { opacity:0; transform:translateY(20px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
      `}</style>

      {/* ── Ambient glow blobs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{ position:"absolute", top:"10%", left:"15%", width:500, height:500, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(255,255,255,0.025) 0%, transparent 70%)", filter:"blur(60px)" }} />
        <div style={{ position:"absolute", bottom:"5%", right:"10%", width:400, height:400, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(200,200,200,0.018) 0%, transparent 70%)", filter:"blur(50px)" }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4">

        {/* ── Header ── */}
        <div
          className="text-center mb-10 sm:mb-16"
          style={{ opacity: visible ? 1 : 0, animation: visible ? "clientsFadeUp 0.6s ease both" : "none" }}
        >
          <div className="inline-flex items-center gap-2 rounded-full px-3 sm:px-4 py-1.5 mb-4 sm:mb-5 text-[11px] sm:text-xs font-bold tracking-widest"
            style={{ color:"rgba(255,255,255,0.35)", border:"1px solid rgba(255,255,255,0.09)", background:"rgba(255,255,255,0.03)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            عملاؤنا الموثوقون
          </div>

          {/* Big animated counter */}
          <div className="flex items-end justify-center gap-2 sm:gap-3 mb-3">
            <span
              className="font-black leading-none"
              style={{
                fontSize: "clamp(56px, 16vw, 120px)",
                background: "linear-gradient(135deg, #ffffff 0%, #b0b0b0 50%, #606060 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "drop-shadow(0 0 40px rgba(255,255,255,0.15))",
                letterSpacing: "-0.04em",
                animation: visible ? "clientsCountPop 0.7s 0.3s cubic-bezier(0.34,1.56,0.64,1) both" : "none",
              }}
            >
              {count}
            </span>
            <span
              className="font-black pb-1.5 sm:pb-3 text-3xl sm:text-5xl"
              style={{
                background: "linear-gradient(135deg,#ffffff 0%,#888 100%)",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              }}
            >+</span>
          </div>
          <h2
            className="text-xl sm:text-2xl md:text-3xl font-black text-white mb-2"
            style={{ letterSpacing:"-0.02em", opacity: visible ? 1 : 0, animation: visible ? "clientsFadeUp 0.6s 0.15s ease both" : "none" }}
          >
            عميل يثق في STARK يومياً
          </h2>
          <p
            className="text-xs sm:text-sm md:text-base px-2"
            style={{ color:"rgba(255,255,255,0.3)", opacity: visible ? 1 : 0, animation: visible ? "clientsFadeUp 0.6s 0.25s ease both" : "none" }}
          >
            من القاهرة لأسوان — نوصل في 27 محافظة بكل احترافية
          </p>
        </div>

        {/* ── Stats strip ── */}
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 mb-10 sm:mb-14"
          style={{ opacity: visible ? 1 : 0, animation: visible ? "clientsFadeUp 0.6s 0.35s ease both" : "none" }}
        >
          {stats.map((s, i) => (
            <div
              key={i}
              className="relative rounded-xl sm:rounded-2xl px-3 sm:px-5 py-4 sm:py-5 text-center overflow-hidden group"
              style={{
                background:"linear-gradient(135deg,#111 0%,#0d0d0d 100%)",
                border:"1px solid rgba(255,255,255,0.07)",
                transition:"border-color 0.3s, box-shadow 0.3s",
              }}
              onMouseEnter={e => { const el=e.currentTarget as HTMLDivElement; el.style.borderColor="rgba(255,255,255,0.18)"; el.style.boxShadow="0 0 28px rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { const el=e.currentTarget as HTMLDivElement; el.style.borderColor="rgba(255,255,255,0.07)"; el.style.boxShadow="none"; }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background:"linear-gradient(135deg,rgba(255,255,255,0.03),transparent 60%)" }} />
              <div className="text-lg sm:text-2xl font-black text-white mb-1" style={{ letterSpacing:"-0.02em" }}>{s.value}</div>
              <div className="text-[10px] sm:text-xs" style={{ color:"rgba(255,255,255,0.3)" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Scrolling client circles ── */}
        <div
          style={{ opacity: visible ? 1 : 0, animation: visible ? "clientsFadeUp 0.6s 0.45s ease both" : "none" }}
        >
          <p className="text-center text-[11px] sm:text-xs mb-4 sm:mb-6" style={{ color:"rgba(255,255,255,0.18)", letterSpacing:"0.12em" }}>— عملاؤنا —</p>

          <div
            className="relative overflow-hidden"
            style={{
              maskImage:"linear-gradient(to right,transparent 0%,black 8%,black 92%,transparent 100%)",
              WebkitMaskImage:"linear-gradient(to right,transparent 0%,black 8%,black 92%,transparent 100%)",
            }}
          >
            <div className="clients-row1" style={{ display:"flex", flexWrap:"nowrap", width:"max-content" }}>
              {[...items, ...items].map((item, i) => (
                <div
                  key={`c-${i}`}
                  className="group relative flex-shrink-0 w-[60px] h-[60px] sm:w-[76px] sm:h-[76px]"
                  style={{
                    borderRadius:"50%",
                    margin:"0 8px",
                    background:`linear-gradient(135deg, ${avatarColors[i % avatarColors.length]} 0%, #0d0d0d 100%)`,
                    border:"1px solid rgba(255,255,255,0.1)",
                    boxShadow:"0 4px 20px rgba(0,0,0,0.5)",
                    overflow:"hidden",
                    transition:"transform 0.3s ease, box-shadow 0.3s ease",
                    cursor:"default",
                  }}
                  onMouseEnter={e => { const el=e.currentTarget as HTMLDivElement; el.style.transform="scale(1.18)"; el.style.boxShadow="0 8px 32px rgba(0,0,0,0.8),0 0 0 2px rgba(255,255,255,0.18)"; }}
                  onMouseLeave={e => { const el=e.currentTarget as HTMLDivElement; el.style.transform="scale(1)"; el.style.boxShadow="0 4px 20px rgba(0,0,0,0.5)"; }}
                >
                  {item.avatar
                    ? <img src={item.avatar} alt={item.name} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                    : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:22, fontWeight:800, color:"rgba(255,255,255,0.25)" }}>{item.name[0]}</span>
                      </div>
                  }
                  {/* name on hover */}
                  <div
                    className="absolute inset-0 flex items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    style={{ background:"linear-gradient(to top,rgba(0,0,0,0.82) 0%,transparent 55%)", borderRadius:"50%" }}
                  >
                    <span style={{ fontSize:9, fontWeight:700, color:"#fff", paddingBottom:7, maxWidth:"90%", textAlign:"center", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{item.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

// ─── Contact Section ──────────────────────────────────────────────────────────
function ContactSection({ darkMode }: { darkMode: boolean }) {
  return (
    <section id="contact" className={`py-16 sm:py-20 ${darkMode ? "bg-black" : "bg-white"}`} dir="rtl">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className={`text-2xl sm:text-3xl font-black mb-2 ${darkMode ? "text-white" : "text-black"}`}>اتصل بنا</h2>
          <p className={`text-sm sm:text-base ${darkMode ? "text-gray-400" : "text-gray-500"}`}>افضل طرق للحصول على المساعدة المطلوبة</p>
        </div>
        <div className="text-center">
          <a
            href="mailto:info@alexander-eg.com"
            className={`inline-flex items-center gap-2 font-bold px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl transition-colors text-sm sm:text-base ${darkMode ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}
          >
            <Mail size={18} /> تواصل معنا
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
export function Footer() {
  return (
    <footer className="py-8 bg-[#050505] border-t border-[#1a1a1a]" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={logoBase64} alt="STARK" className="w-8 h-8 rounded-lg object-cover" />
          <span className="text-gray-400 text-sm"><span className="stark-glow-text-sm" style={{ display: "inline-block", background: "linear-gradient(120deg, #c0c0c0 0%, #ffffff 35%, #d0d0ff 65%, #b0b0b0 100%)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STARK</span> للشحن</span>
        </div>
        <p className="text-gray-600 text-xs">جميع الحقوق محفوظة © 2026</p>
        <div className="flex items-center gap-4">
          <a href="#" className="text-gray-500 hover:text-white transition-colors text-sm">سياسة الخصوصية</a>
          <a href="#" className="text-gray-500 hover:text-white transition-colors text-sm">الشروط والأحكام</a>
        </div>
      </div>
    </footer>
  );
}

// ─── Social Media Floating Button ────────────────────────────────────────────
export function SocialFloat({ darkMode }: { darkMode: boolean }) {
  const [open, setOpen] = useState(false);

  const socials = [
    {
      label: "واتساب",
      href: "https://wa.me/",
      color: "#25D366",
      glow: "rgba(37,211,102,0.45)",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      ),
    },
    {
      label: "فيسبوك",
      href: "https://facebook.com/",
      color: "#1877F2",
      glow: "rgba(24,119,242,0.45)",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
    },
    {
      label: "انستجرام",
      href: "https://instagram.com/",
      color: "url(#ig-grad)",
      glow: "rgba(225,48,108,0.45)",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <defs>
            <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f09433"/>
              <stop offset="25%" stopColor="#e6683c"/>
              <stop offset="50%" stopColor="#dc2743"/>
              <stop offset="75%" stopColor="#cc2366"/>
              <stop offset="100%" stopColor="#bc1888"/>
            </linearGradient>
          </defs>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
        </svg>
      ),
    },
    {
      label: "تيكتوك",
      href: "https://tiktok.com/",
      color: "#010101",
      glow: "rgba(105,201,208,0.45)",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z" fill="#69C9D0"/>
          <path d="M18.58 5.69a4.83 4.83 0 01-3.77-4.25V1h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V8.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V7.69a8.18 8.18 0 004.78 1.52V5.75a4.85 4.85 0 01-1.01-.06z" fill="#EE1D52"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed right-5 bottom-8 z-50 flex flex-col items-center gap-2.5" dir="ltr">
      {/* Pulse ring behind button */}
      {!open && (
        <span
          className="absolute bottom-0 right-0 w-14 h-14 rounded-full pointer-events-none"
          style={{
            background: "rgba(255,255,255,0.08)",
            animation: "socialPulse 2s ease-out infinite",
          }}
        />
      )}

      {/* Social icons — stacked above button */}
      <div className="flex flex-col items-center gap-2.5">
        {socials.map((s, i) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            title={s.label}
            className="flex items-center gap-2 group"
            style={{
              transition: `all 0.35s cubic-bezier(0.34,1.56,0.64,1)`,
              transitionDelay: open ? `${i * 55}ms` : `${(socials.length - 1 - i) * 40}ms`,
              opacity: open ? 1 : 0,
              transform: open ? "translateY(0) scale(1)" : "translateY(20px) scale(0.7)",
              pointerEvents: open ? "auto" : "none",
            }}
          >
            {/* Label tooltip */}
            <span
              className="text-xs font-medium px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap"
              style={{
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                backdropFilter: "blur(8px)",
              }}
            >
              {s.label}
            </span>
            {/* Icon circle */}
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-transform duration-200 hover:scale-110 active:scale-95"
              style={{
                background: s.color,
                boxShadow: `0 4px 20px ${s.glow}, 0 2px 8px rgba(0,0,0,0.3)`,
                border: "2px solid rgba(255,255,255,0.15)",
              }}
            >
              {s.icon}
            </div>
          </a>
        ))}
      </div>

      {/* Main toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="تواصل معنا"
        className="relative flex items-center justify-center rounded-full shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 focus:outline-none"
        style={{
          width: "56px",
          height: "56px",
          background: open
            ? "linear-gradient(135deg, #ff416c, #ff4b2b)"
            : "linear-gradient(135deg, #232526, #414345)",
          boxShadow: open
            ? "0 8px 32px rgba(255,65,108,0.5), 0 2px 12px rgba(0,0,0,0.4)"
            : "0 8px 32px rgba(0,0,0,0.45), 0 2px 12px rgba(0,0,0,0.3)",
          border: "2px solid rgba(255,255,255,0.15)",
        }}
      >
        <div
          style={{
            transition: "transform 0.45s cubic-bezier(0.34,1.56,0.64,1)",
            transform: open ? "rotate(135deg)" : "rotate(0deg)",
          }}
        >
          {open ? (
            /* X icon */
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" className="w-6 h-6">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          ) : (
            /* Share / connect icon */
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          )}
        </div>
      </button>

      <style>{`
        @keyframes socialPulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          70%  { transform: scale(1.9); opacity: 0;   }
          100% { transform: scale(1.9); opacity: 0;   }
        }
      `}</style>
    </div>
  );
}


export default function HomePage() {
  const [darkMode, setDarkMode] = useState(true);
  const toggleDarkMode = () => setDarkMode(v => !v);
  return (
    <div className={`min-h-screen transition-colors duration-500 ${darkMode ? "bg-black" : "bg-gray-50"}`}>
      <style>{starkGlowStyle}</style>
      <Navbar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      <HeroSection />
      <TrackingSection darkMode={darkMode} />
      <AboutSection darkMode={darkMode} />
      <ShippingCycleSection darkMode={darkMode} />
      <ContractSection darkMode={darkMode} />
      <FeaturesSection darkMode={darkMode} />
      <ClientsSection />
      <ContactSection darkMode={darkMode} />
      <Footer />
      <SocialFloat darkMode={darkMode} />
    </div>
  );
}
