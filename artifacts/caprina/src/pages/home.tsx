import React, { useState } from "react";
import { trackingImg } from "../trackingImg";
import { useLocation } from "wouter";
import { Package, MapPin, Phone, Mail, Menu, X, ChevronDown, Truck, CheckCircle, Clock, Shield, Star, Users, FileText, ArrowLeft, Sun, Moon, LayoutDashboard } from "lucide-react";

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
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-4xl" dir="rtl">
      <div
        className="flex items-center justify-between px-5 h-[58px] rounded-2xl backdrop-blur-xl transition-all duration-500"
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
        <button onClick={() => scrollTo("home")} className="flex items-center gap-3 group">
          <div className="relative">
            <img src="/logo.jpg" alt="STARK" className="w-10 h-10 rounded-xl object-cover ring-2 ring-white/10 group-hover:ring-white/30 transition-all duration-300" />
          </div>
          <span
            className="hidden sm:block font-black text-lg tracking-[0.25em]"
            style={{
              color: darkMode ? "#ffffff" : "#111111",
              letterSpacing: "0.25em",
              textShadow: darkMode ? "0 0 20px rgba(255,255,255,0.3)" : "none",
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
        <div className="flex items-center gap-2">
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
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300"
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
            <span className="hidden sm:inline">لوحة التحكم</span>
          </button>

          {/* Mobile Menu Toggle */}
          <button
            className={`md:hidden p-2 rounded-xl transition-colors ${darkMode ? "text-white hover:bg-white/10" : "text-black hover:bg-black/10"}`}
            onClick={() => setMenuOpen(v => !v)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {/* Mobile Menu — تحت الـ pill */}
      {menuOpen && (
        <div
          className="mt-2 rounded-2xl overflow-hidden px-3 py-3 flex flex-col gap-1"
          style={{
            background: darkMode ? "rgba(10,10,10,0.95)" : "rgba(255,255,255,0.97)",
            border: darkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.09)",
            boxShadow: darkMode ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.10)",
          }}
        >
          {navLinks.map(l => {
            const isActive = activeSection === l.id;
            return (
              <button
                key={l.id}
                onClick={() => { scrollTo(l.id); setMenuOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-right w-full ${
                  isActive
                    ? darkMode ? "bg-white/10 text-white" : "bg-black/6 text-black"
                    : darkMode ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:text-black hover:bg-black/4"
                }`}
              >
                {isActive && <span className="w-1.5 h-1.5 rounded-full" style={{ background: darkMode ? "#c0c0c0" : "#333" }} />}
                {l.label}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────
function HeroSection() {
  const [, navigate] = useLocation();
  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black pt-20" dir="rtl">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0d0d0d] to-[#1a1a1a]" />
      <div className="absolute inset-0" style={{ opacity: 0.55 }}>
        <img src={trackingImg} alt="" className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60" />
      </div>
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto" style={{ paddingBottom: "340px", marginTop: "-40px" }}>
        <div
          className="inline-flex items-center gap-3 rounded-full px-5 py-2.5 mb-8"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08) inset",
          }}
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{ width: 28, height: 28, background: "rgba(255,255,255,0.12)" }}
          >
            <Truck size={14} className="text-white" />
          </span>
          <span className="text-white/90 text-sm font-medium tracking-wide">
            شركة شحن محلية موثوقة منذ 2001
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        </div>
        <h1 className="flex items-center justify-center gap-3 mb-4" dir="ltr">
          <span
            className="inline-block text-5xl md:text-7xl font-black"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #e0e0e0 40%, #a0a0a0 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 40px rgba(255,255,255,0.25))",
              letterSpacing: "-0.02em",
            }}
          >
            STARK
          </span>
          <span style={{ width: 1, height: 40, background: "rgba(255,255,255,0.2)", display: "inline-block", borderRadius: 1 }} />
          <span
            className="inline-block text-xl md:text-2xl font-light tracking-widest"
            style={{
              background: "linear-gradient(135deg, #b0b0b0 0%, #e0e0e0 35%, #909090 65%, #c8c8c8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 10px rgba(180,180,180,0.25))",
              letterSpacing: "0.25em",
            }}
          >
            للشحن
          </span>
        </h1>

      </div>
    </section>
  );
}

// ─── Tracking Section ─────────────────────────────────────────────────────────
function TrackingSection({ darkMode }: { darkMode: boolean }) {
  const [trackingNum, setTrackingNum] = useState("");
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
      className="relative z-20 pb-16"
      dir="rtl"
      style={{
        marginTop: "-220px",
        background: "transparent",
      }}
    >
      {/* overlay */}
      <div className="w-full relative" style={{ zIndex: 1 }}>
        <div
          className="relative p-8 text-center"
          style={{
            background: "rgba(0,0,0,0.25)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <div className="relative max-w-3xl mx-auto" style={{ zIndex: 2, marginTop: "-240px" }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-white/10">
          <Package size={28} className="text-white" />
        </div>
        <h2 className="text-3xl font-black mb-2 text-white">تتبع الشحنة</h2>
        <p className="mb-8 text-gray-300">يمكنك تتبع شحنتك ومعرفة حالتها الدائمة في أي وقت</p>
        <div className="flex gap-3 max-w-lg mx-auto mb-10">
          <input
            type="text"
            value={trackingNum}
            onChange={e => setTrackingNum(e.target.value)}
            placeholder="أدخل رقم التتبع مثال: 1TRK12345678"
            className="flex-1 border rounded-xl px-4 py-3 focus:outline-none text-sm transition-colors bg-white/10 border-white/20 text-white placeholder-white/40 focus:border-white/50 backdrop-blur-sm"
          />
          <button className="font-bold px-6 py-3 rounded-xl transition-colors text-sm whitespace-nowrap bg-white text-black hover:bg-gray-100">
            تتبع
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 border rounded-xl flex items-center justify-center bg-white/10 border-white/20 backdrop-blur-sm">
                  <step.icon size={18} className="text-gray-300" />
                </div>
                <span className="text-xs text-gray-400">{step.label}</span>
              </div>
              {i < steps.length - 1 && <div className="w-8 h-px mb-4 bg-white/20" />}
            </div>
          ))}
        </div>
          </div>{/* end content */}
          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <button onClick={() => navigate("/contract")} className="border border-[#555] text-white font-bold px-8 py-3 rounded-xl hover:border-white/50 transition-colors flex items-center gap-2 text-sm">
              <FileText size={16} /> تعاقد معنا
            </button>
          </div>
        </div>{/* end glass card */}
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
    <section id="about" className={`py-20 ${darkMode ? "bg-black" : "bg-white"}`} dir="rtl">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className={`text-3xl font-black mb-4 ${darkMode ? "text-white" : "text-black"}`}>من نحن</h2>
            <p className={`leading-relaxed mb-6 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
              تُعدّ <bdi className="font-bold" style={{ unicodeBidi: "embed", direction: "ltr" }}>STARK</bdi> لوجستيك من أبرز شركات الشحن والخدمات اللوجستية داخل مصر،
              حيث تقدّم خدماتها للأفراد والشركات في جميع المحافظات والمدن على مستوى الجمهورية منذ عام 2001.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {features.map((f, i) => (
                <div key={i} className={`border rounded-xl p-4 flex items-center gap-3 ${darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-gray-50 border-gray-200"}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? "bg-white/10" : "bg-black/8"}`}>
                    <f.icon size={18} className={darkMode ? "text-gray-300" : "text-gray-600"} />
                  </div>
                  <span className={`font-semibold text-sm ${darkMode ? "text-gray-200" : "text-gray-800"}`}>{f.label}</span>
                </div>
              ))}
            </div>
            <button onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })} className={`inline-flex items-center gap-2 mt-6 transition-colors text-sm ${darkMode ? "text-gray-300 hover:text-white" : "text-gray-500 hover:text-black"}`}>
              المزيد <ArrowLeft size={16} />
            </button>
          </div>
          <div className={`border rounded-2xl p-8 text-center ${darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-gray-50 border-gray-200"}`}>
            <img src="/logo.jpg" alt="STARK" className="w-24 h-24 rounded-2xl mx-auto mb-4 object-cover" />
            <h3 className={`font-bold text-xl mb-1 ${darkMode ? "text-white" : "text-black"}`}>شركة STARK للشحن</h3>
            <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>خدمة الشحن الموثوقة في مصر</p>
            <div className={`grid grid-cols-3 gap-4 mt-6 pt-6 border-t ${darkMode ? "border-[#222]" : "border-gray-200"}`}>
              {[["4+", "سنة خبرة"], ["27", "محافظة"], ["99%", "رضا العملاء"]].map(([val, lbl], i) => (
                <div key={i}>
                  <div className={`text-2xl font-black ${darkMode ? "text-white" : "text-black"}`}>{val}</div>
                  <div className={`text-xs mt-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{lbl}</div>
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
    <section ref={sectionRef} id="services" className={`py-20 overflow-hidden ${darkMode ? "bg-[#0a0a0a]" : "bg-gray-100"}`} dir="rtl">
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

      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-14">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${darkMode ? "bg-white/10" : "bg-black/8"}`}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 0.5s ease, transform 0.5s ease",
            }}
          >
            <Truck size={28} className={darkMode ? "text-white" : "text-black"} />
          </div>
          <h2
            className={`text-3xl font-black mb-2 ${darkMode ? "text-white" : "text-black"}`}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 0.5s 0.1s ease, transform 0.5s 0.1s ease",
            }}
          >
            دورة الشحن
          </h2>
          <p
            className={darkMode ? "text-gray-400" : "text-gray-500"}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 0.5s 0.18s ease, transform 0.5s 0.18s ease",
            }}
          >
            كيف توصل شحنتك من باب التاجر لباب العميل في خطوات بسيطة
          </p>
        </div>

        {/* Cards + connectors */}
        <div className="relative flex flex-col md:flex-row items-stretch gap-0 md:gap-0">
          {steps.map((s, i) => {
            const isHovered = hoveredIdx === i;
            const delay = visible ? `${i * 0.1}s` : "0s";
            return (
              <React.Fragment key={i}>
                {/* Card */}
                <div
                  className="flex-1 relative"
                  style={{
                    animation: visible ? `cycleCardIn 0.55s cubic-bezier(0.34,1.56,0.64,1) ${delay} both` : "none",
                    opacity: visible ? undefined : 0,
                  }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <div
                    className={`border rounded-2xl p-5 text-center relative h-full flex flex-col items-center mx-1 md:mx-2 transition-all duration-300 ${
                      darkMode ? "bg-[#111] border-[#222]" : "bg-white border-gray-200"
                    }`}
                    style={{
                      transform: isHovered ? "translateY(-10px) scale(1.03)" : "translateY(0) scale(1)",
                      boxShadow: isHovered
                        ? darkMode
                          ? "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.12)"
                          : "0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)"
                        : "none",
                      borderColor: isHovered
                        ? darkMode ? "rgba(192,192,192,0.4)" : "rgba(0,0,0,0.25)"
                        : undefined,
                      transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.35s ease, border-color 0.35s ease",
                    }}
                  >
                    {/* Number badge */}
                    <div
                      className={`absolute -top-3 right-1/2 w-6 h-6 rounded-full text-xs font-black flex items-center justify-center z-10 ${
                        darkMode ? "bg-white text-black" : "bg-black text-white"
                      }`}
                      style={{
                        animation: visible ? `cycleNumPop 0.5s cubic-bezier(0.34,1.56,0.64,1) ${parseFloat(delay) + 0.25}s both` : "none",
                        opacity: visible ? undefined : 0,
                        right: "50%",
                        transform: "translateX(50%)",
                      }}
                    >
                      {s.num}
                    </div>

                    {/* Icon */}
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 mt-4 transition-all duration-300 ${
                        darkMode ? "bg-white/10" : "bg-black/6"
                      }`}
                      style={{
                        animation: isHovered ? "cycleIconSpin 0.6s ease" : "none",
                        background: isHovered
                          ? darkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)"
                          : undefined,
                      }}
                    >
                      <s.icon size={22} className={darkMode ? "text-gray-300" : "text-gray-600"} />
                    </div>

                    <h3 className={`font-bold text-sm mb-2 ${darkMode ? "text-white" : "text-black"}`}>{s.title}</h3>
                    <p className={`text-xs leading-relaxed flex-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{s.desc}</p>

                    {/* Bottom glow line on hover */}
                    <div
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-500"
                      style={{
                        width: isHovered ? "70%" : "0%",
                        background: darkMode
                          ? "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)"
                          : "linear-gradient(90deg, transparent, rgba(0,0,0,0.3), transparent)",
                      }}
                    />
                  </div>
                </div>

                {/* Connector arrow between cards */}
                {i < steps.length - 1 && (
                  <div
                    className="hidden md:flex items-center justify-center flex-shrink-0 w-6 z-10"
                    style={{ marginTop: "0" }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "2px",
                        background: darkMode
                          ? "linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.35), rgba(255,255,255,0.15))"
                          : "linear-gradient(90deg, rgba(0,0,0,0.1), rgba(0,0,0,0.25), rgba(0,0,0,0.1))",
                        transformOrigin: "right",
                        animation: visible ? `connectorGrow 0.4s ease ${i * 0.1 + 0.45}s both` : "none",
                        opacity: visible ? undefined : 0,
                      }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-3 justify-center mt-10">
          {[{ icon: Shield, label: "الخدمة" }, { icon: MapPin, label: "الاعتمادية" }, { icon: Users, label: "الوصول المحلي" }, { icon: Star, label: "الخبرة" }].map((t, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 border rounded-xl px-4 py-2 transition-all duration-300 cursor-default ${darkMode ? "bg-[#111] border-[#222] hover:border-[#444] hover:bg-[#1a1a1a]" : "bg-white border-gray-200 hover:border-gray-400 hover:bg-gray-50"}`}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(16px)",
                transition: `opacity 0.4s ${0.55 + i * 0.07}s ease, transform 0.4s ${0.55 + i * 0.07}s ease, background 0.3s, border-color 0.3s`,
              }}
            >
              <t.icon size={15} className={darkMode ? "text-gray-400" : "text-gray-500"} />
              <span className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{t.label}</span>
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
    <section id="contract" className={`py-20 ${darkMode ? "bg-black" : "bg-white"}`} dir="rtl">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${darkMode ? "bg-white/10" : "bg-black/8"}`}>
          <FileText size={28} className={darkMode ? "text-white" : "text-black"} />
        </div>
        <h2 className={`text-3xl font-black mb-2 ${darkMode ? "text-white" : "text-black"}`}>عقد شركة STARK للشحن</h2>
        <p className={`mb-8 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>عقد خدمات الشحن والتوصيل • شركة STARK للشحن</p>
        <div className="space-y-3 mb-8 text-right">
          {items.map((item, i) => (
            <div key={i} className={`flex items-center gap-4 border rounded-xl px-5 py-4 ${darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-gray-50 border-gray-200"}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${darkMode ? "bg-white/10" : "bg-black/8"}`}>
                <item.icon size={18} className={darkMode ? "text-gray-300" : "text-gray-600"} />
              </div>
              <span className={`font-medium ${darkMode ? "text-gray-200" : "text-gray-700"}`}>{item.label}</span>
            </div>
          ))}
        </div>
        <a
          href="/contract"
          className={`inline-flex items-center gap-2 font-bold px-8 py-3.5 rounded-xl transition-all duration-300 ${darkMode ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}
          style={{ boxShadow: darkMode ? "0 4px 20px rgba(255,255,255,0.15)" : "0 4px 20px rgba(0,0,0,0.2)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)"; }}
        >
          <FileText size={18} /> عرض العقد كاملاً
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
    <section id="features" className={`relative py-24 overflow-hidden ${darkMode ? "bg-[#0a0a0a]" : "bg-gray-100"}`} dir="rtl">

      {/* ─── SVG curved lines background ─── */}
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

      <div className="relative z-10 max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-14">
          <span className={`inline-block text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-4 ${darkMode ? "bg-white/8 text-gray-400 border border-white/10" : "bg-black/5 text-gray-500 border border-black/8"}`}>
            مميزاتنا
          </span>
          <h2 className={`text-4xl font-black mb-3 ${darkMode ? "text-white" : "text-black"}`}>لماذا STARK؟</h2>
          <p className={`text-base max-w-xl mx-auto ${darkMode ? "text-gray-400" : "text-gray-500"}`}>حلول لوجستية متكاملة مناسبة لكل احتياجاتك</p>
        </div>

        {/* Cards — alternating short / tall */}
        <div className="flex items-end gap-5 justify-center">
          {features.map((f, i) => (
            <div
              key={i}
              className={`relative flex-1 rounded-3xl p-7 flex flex-col items-center text-center border
                ${darkMode ? "bg-[#111] border-[#222]" : "bg-white border-gray-200"}`}
              style={{
                minHeight: f.tall ? "380px" : "260px",
                transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.35s ease, border-color 0.35s ease",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.transform = "translateY(-12px)";
                el.style.borderColor = darkMode ? "rgba(192,192,192,0.5)" : "rgba(0,0,0,0.3)";
                el.style.boxShadow = darkMode
                  ? "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(192,192,192,0.15), 0 0 40px rgba(192,192,192,0.07)"
                  : "0 24px 64px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.10)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget;
                el.style.transform = "translateY(0)";
                el.style.borderColor = darkMode ? "#222" : "#e5e7eb";
                el.style.boxShadow = "none";
              }}
            >
              {/* inner glow on hover */}
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none opacity-0 transition-opacity duration-500 hover:opacity-100"
                style={{ background: darkMode ? "linear-gradient(135deg,rgba(255,255,255,0.04),transparent 60%)" : "linear-gradient(135deg,rgba(0,0,0,0.025),transparent 60%)" }}
              />

              {/* icon circle */}
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 mt-2
                ${darkMode ? "bg-[#1a1a1a] border border-[#2a2a2a]" : "bg-gray-100 border border-gray-200"}`}>
                <f.icon size={26} className={darkMode ? "text-gray-300" : "text-gray-600"} strokeWidth={1.5} />
              </div>

              <h3 className={`text-xl font-black mb-3 ${darkMode ? "text-white" : "text-black"}`}>{f.title}</h3>
              <p className={`text-sm leading-relaxed ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{f.desc}</p>
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

  React.useEffect(() => {
    fetch("/api/users")
      .then(r => r.json())
      .then(data => {
        const list = (Array.isArray(data) ? data : data.users ?? [])
          .filter((u: any) => u.avatar)
          .slice(0, 12);
        setClients(list);
      })
      .catch(() => {});
  }, []);

  const placeholders = Array.from({ length: 12 }, (_, i) => ({ id: -i, name: `عميل ${i + 1}`, avatar: null }));
  const items = clients.length >= 4 ? clients : placeholders;
  const doubled = [...items, ...items];

  const glowVars = [
    "rgba(192,192,192,0.15)",
    "rgba(255,255,255,0.08)",
    "rgba(160,160,160,0.12)",
  ];

  const Circle = ({ item, idx }: { item: typeof items[0]; idx: number }) => {
    const glow = glowVars[idx % glowVars.length];
    return (
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: "50%",
          flexShrink: 0,
          background: "linear-gradient(135deg,#1a1a1a 0%,#111 100%)",
          border: `1px solid ${glow}`,
          boxShadow: `0 0 18px ${glow}, 0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.7)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          transition: "all 0.35s cubic-bezier(0.34,1.56,0.64,1)",
          cursor: "pointer",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.transform = "scale(1.1)";
          el.style.boxShadow = `0 0 28px rgba(255,255,255,0.12), 0 0 0 1px rgba(255,255,255,0.1) inset, 0 12px 40px rgba(0,0,0,0.8)`;
          el.style.borderColor = "rgba(255,255,255,0.25)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.transform = "scale(1)";
          el.style.boxShadow = `0 0 18px ${glow}, 0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.7)`;
          el.style.borderColor = glow;
        }}
      >
        {item.avatar ? (
          <img src={item.avatar} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
        ) : (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontWeight: 600, textAlign: "center", padding: 4 }}>LOGO</span>
        )}
      </div>
    );
  };

  return (
    <section className="py-20 bg-[#0a0a0a] overflow-hidden" dir="rtl">
      <style>{`
        @keyframes scrollLeft  { 0%{transform:translateX(0)}   100%{transform:translateX(-50%)} }
        @keyframes scrollRight { 0%{transform:translateX(-50%)} 100%{transform:translateX(0)}   }
        .clients-t1 { animation: scrollLeft  30s linear infinite; }
        .clients-t2 { animation: scrollRight 36s linear infinite; }
      `}</style>

      <div className="text-center mb-12 px-4">
        <div
          className="inline-block text-xs font-bold tracking-widest mb-4 rounded-full px-4 py-1.5"
          style={{ color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          عملاؤنا
        </div>
        <h2 className="text-3xl font-black text-white mb-2" style={{ letterSpacing: "-0.02em" }}>يثقون فينا</h2>
        <p className="text-sm" style={{ color: "#444" }}>أكثر من 200 عميل يعتمدون على STARK للشحن يومياً</p>
      </div>

      {/* Row 1 — left */}
      <div className="relative mb-5" style={{ maskImage: "linear-gradient(to right,transparent 0%,black 12%,black 88%,transparent 100%)", WebkitMaskImage: "linear-gradient(to right,transparent 0%,black 12%,black 88%,transparent 100%)" }}>
        <div className="clients-t1 flex gap-5" style={{ width: "max-content" }}>
          {doubled.map((item, i) => <Circle key={`t1-${i}`} item={item} idx={i} />)}
        </div>
      </div>

      {/* Row 2 — right */}
      <div className="relative" style={{ maskImage: "linear-gradient(to right,transparent 0%,black 12%,black 88%,transparent 100%)", WebkitMaskImage: "linear-gradient(to right,transparent 0%,black 12%,black 88%,transparent 100%)" }}>
        <div className="clients-t2 flex gap-5" style={{ width: "max-content" }}>
          {[...doubled].reverse().map((item, i) => <Circle key={`t2-${i}`} item={item} idx={i} />)}
        </div>
      </div>
    </section>
  );
}

// ─── Contact Section ──────────────────────────────────────────────────────────
function ContactSection({ darkMode }: { darkMode: boolean }) {
  return (
    <section id="contact" className={`py-20 ${darkMode ? "bg-black" : "bg-white"}`} dir="rtl">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className={`text-3xl font-black mb-2 ${darkMode ? "text-white" : "text-black"}`}>اتصل بنا</h2>
          <p className={darkMode ? "text-gray-400" : "text-gray-500"}>افضل طرق للحصول على المساعدة المطلوبة</p>
        </div>
        <div className="text-center">
          <a
            href="mailto:info@alexander-eg.com"
            className={`inline-flex items-center gap-2 font-bold px-8 py-3.5 rounded-xl transition-colors ${darkMode ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}
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
          <img src="/logo.jpg" alt="STARK" className="w-8 h-8 rounded-lg object-cover" />
          <span className="text-gray-400 text-sm">شركة STARK للشحن</span>
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
