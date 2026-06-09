import React, { useState } from "react";
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
      <div className="absolute inset-0 opacity-55">
        <img src="/stark.jpg" alt="" className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60" />
      </div>
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 mb-6">
          <Truck size={16} className="text-gray-300" />
          <span className="text-gray-300 text-sm">شركة شحن محلية موثوقة منذ 1999</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-white mb-4 leading-tight tracking-tight">
          <span
            className="inline-block"
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
          <br />
          <span
            className="inline-block text-3xl md:text-4xl font-light tracking-[0.35em] uppercase mt-1"
            style={{
              color: "rgba(255,255,255,0.55)",
              letterSpacing: "0.35em",
            }}
          >
            للشحن
          </span>
        </h1>
        <p className="text-gray-300 text-lg md:text-xl mb-8 max-w-2xl mx-auto leading-relaxed">
          STARK لوجستيك — خدمات شحن محلية سريعة وموثوقة تطال كل مصر، اطمن — سيب الشحن علينا
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button onClick={() => document.getElementById("tracking")?.scrollIntoView({ behavior: "smooth" })} className="bg-white text-black font-bold px-8 py-3.5 rounded-xl hover:bg-gray-100 transition-colors flex items-center gap-2">
            <Package size={18} /> تتبع شحنتك
          </button>
          <button onClick={() => navigate("/login")} className="border border-[#444] text-white font-bold px-8 py-3.5 rounded-xl hover:border-[#888] transition-colors flex items-center gap-2">
            <FileText size={18} /> تعاقد معنا
          </button>
        </div>
      </div>
      <button onClick={() => document.getElementById("tracking")?.scrollIntoView({ behavior: "smooth" })} className="absolute bottom-8 left-1/2 -translate-x-1/2 text-gray-500 animate-bounce">
        <ChevronDown size={28} />
      </button>
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
    <section id="tracking" className="relative z-10 -mt-20 pb-16" dir="rtl">
      <div className="max-w-full px-0">
        <div
          className="relative p-10 text-center overflow-hidden"
          style={{
            boxShadow: darkMode ? "0 24px 64px rgba(0,0,0,0.6)" : "0 24px 64px rgba(0,0,0,0.10)",
            backgroundImage: `url('/tracking.jpeg')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {/* Dark overlay فوق الـ background image */}
          <div className="absolute inset-0 z-0" style={{
            background: darkMode ? "rgba(5,5,5,0.55)" : "rgba(255,255,255,0.60)",
          }} />
          {/* Content */}
          <div className="relative z-10">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${darkMode ? "bg-white/10" : "bg-black/8"}`}>
          <Package size={28} className={darkMode ? "text-white" : "text-black"} />
        </div>
        <h2 className={`text-3xl font-black mb-2 ${darkMode ? "text-white" : "text-black"}`}>تتبع الشحنة</h2>
        <p className={`mb-8 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>يمكنك تتبع شحنتك ومعرفة حالتها الدائمة في أي وقت</p>
        <div className="flex gap-3 max-w-lg mx-auto mb-10">
          <input
            type="text"
            value={trackingNum}
            onChange={e => setTrackingNum(e.target.value)}
            placeholder="أدخل رقم التتبع مثال: 1TRK12345678"
            className={`flex-1 border rounded-xl px-4 py-3 placeholder-gray-400 focus:outline-none text-sm transition-colors ${darkMode ? "bg-[#1a1a1a] border-[#333] text-white focus:border-[#666]" : "bg-white border-gray-300 text-black focus:border-gray-500"}`}
          />
          <button className={`font-bold px-6 py-3 rounded-xl transition-colors text-sm whitespace-nowrap ${darkMode ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}>
            تتبع
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-10 h-10 border rounded-xl flex items-center justify-center ${darkMode ? "bg-[#1a1a1a] border-[#333]" : "bg-white border-gray-300"}`}>
                  <step.icon size={18} className={darkMode ? "text-gray-400" : "text-gray-500"} />
                </div>
                <span className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{step.label}</span>
              </div>
              {i < steps.length - 1 && <div className={`w-8 h-px mb-4 ${darkMode ? "bg-[#333]" : "bg-gray-300"}`} />}
            </div>
          ))}
        </div>
          </div>{/* end z-10 content */}
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
    <section id="about" className={`py-20 ${darkMode ? "bg-black" : "bg-white"}`} dir="rtl">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className={`text-3xl font-black mb-4 ${darkMode ? "text-white" : "text-black"}`}>من نحن</h2>
            <p className={`leading-relaxed mb-6 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
              أحد STARK لوجستيك من أبز شركات الشحن والخدمات اللوجستية داخل مصر حيث تقدم خدمة للأفراد والشركات بجميع المحافظات والمدن على المستوى الجمهورية منذ عام 1999.
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
              {[["25+", "سنة خبرة"], ["27", "محافظة"], ["99%", "رضا العملاء"]].map(([val, lbl], i) => (
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
  const steps = [
    { num: "1", title: "تسجيل الشحنة", desc: "سجل شحنتك بسرعة وسهولة من خلال لوحة التحكم أو تواصل معنا مباشرة", icon: FileText },
    { num: "2", title: "طلب البيك أب", desc: "نستقبل طلبك ونرسل مندوب لاستلام الشحنة من موقعك", icon: Truck },
    { num: "3", title: "الفرز والتجميع", desc: "تُفرز الشحنات وتُجمع لتسريع وتحسين عمليات التوزيع", icon: Package },
    { num: "4", title: "جاري التوصيل", desc: "تنطلق الشحنة برحلتها نحو وجهتها مع تتبع فوري مستمر", icon: MapPin },
    { num: "5", title: "تم التسليم والتحصيل", desc: "يتم تسليم الشحنة للمستلم وتحصيل المبلغ إن وجد بأمان وسرعة", icon: CheckCircle },
  ];
  return (
    <section id="services" className={`py-20 ${darkMode ? "bg-[#0a0a0a]" : "bg-gray-100"}`} dir="rtl">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${darkMode ? "bg-white/10" : "bg-black/8"}`}>
            <Truck size={28} className={darkMode ? "text-white" : "text-black"} />
          </div>
          <h2 className={`text-3xl font-black mb-2 ${darkMode ? "text-white" : "text-black"}`}>دورة الشحن</h2>
          <p className={darkMode ? "text-gray-400" : "text-gray-500"}>كيف توصل شحنتك من باب التاجر لباب العميل في خطوات بسيطة</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {steps.map((s, i) => (
            <div key={i} className={`border rounded-2xl p-5 text-center relative ${darkMode ? "bg-[#111] border-[#222]" : "bg-white border-gray-200"}`}>
              <div className={`absolute -top-3 right-1/2 translate-x-1/2 w-6 h-6 rounded-full text-xs font-black flex items-center justify-center ${darkMode ? "bg-white text-black" : "bg-black text-white"}`}>
                {s.num}
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 mt-2 ${darkMode ? "bg-white/10" : "bg-black/6"}`}>
                <s.icon size={22} className={darkMode ? "text-gray-300" : "text-gray-600"} />
              </div>
              <h3 className={`font-bold text-sm mb-2 ${darkMode ? "text-white" : "text-black"}`}>{s.title}</h3>
              <p className={`text-xs leading-relaxed ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          {[{ icon: Shield, label: "الخدمة" }, { icon: MapPin, label: "الاعتمادية" }, { icon: Users, label: "الوصول المحلي" }, { icon: Star, label: "الخبرة" }].map((t, i) => (
            <div key={i} className={`flex items-center gap-2 border rounded-xl px-4 py-2 ${darkMode ? "bg-[#111] border-[#222]" : "bg-white border-gray-200"}`}>
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
        <button
          onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
          className={`inline-flex items-center gap-2 font-bold px-8 py-3.5 rounded-xl transition-colors ${darkMode ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}
        >
          <FileText size={18} /> العقد والتعاقد
        </button>
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

// ─── Contact Section ──────────────────────────────────────────────────────────
function ContactSection({ darkMode }: { darkMode: boolean }) {
  const branches = [
    {
      name: "فرع الهرم",
      address: "الجيزة - بك فلما أبو الهول",
      phone: "تليفون : الهرم",
    },
    {
      name: "فرع جسر السويس",
      address: "القاهرة - جسر السويس، كافيه من تلاتة",
      phone: "تليفون : جسر السويس",
    },
  ];
  return (
    <section id="contact" className={`py-20 ${darkMode ? "bg-black" : "bg-white"}`} dir="rtl">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className={`text-3xl font-black mb-2 ${darkMode ? "text-white" : "text-black"}`}>اتصل بنا</h2>
          <p className={darkMode ? "text-gray-400" : "text-gray-500"}>افضل طرق للحصول على المساعدة المطلوبة</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {branches.map((b, i) => (
            <div key={i} className={`border rounded-2xl p-6 ${darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? "bg-white/10" : "bg-black/8"}`}>
                  <MapPin size={18} className={darkMode ? "text-gray-300" : "text-gray-600"} />
                </div>
                <h3 className={`font-bold ${darkMode ? "text-white" : "text-black"}`}>{b.name}</h3>
              </div>
              <p className={`text-sm mb-1 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>{b.address}</p>
              <p className={`text-sm mb-4 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{b.phone}</p>
              <a
                href="#"
                className={`inline-flex items-center gap-2 text-sm transition-colors rounded-lg px-3 py-1.5 border ${darkMode ? "text-gray-300 hover:text-white border-[#333] hover:border-[#666]" : "text-gray-600 hover:text-black border-gray-300 hover:border-gray-500"}`}
              >
                <Phone size={14} /> اتصل الآن
              </a>
            </div>
          ))}
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

// ─── Home Page (default export) ───────────────────────────────────────────────
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
      <ContactSection darkMode={darkMode} />
      <Footer />
    </div>
  );
}
