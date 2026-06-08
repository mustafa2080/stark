import React, { useState } from "react";
import { authApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, LayoutDashboard, Package, MapPin, Phone, Mail, Menu, X, ChevronDown, Truck, CheckCircle, Clock, Shield, Star, Users, FileText, ArrowLeft } from "lucide-react";

// ─── Login Modal ─────────────────────────────────────────────────────────────
function LoginModal({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم المستخدم وكلمة المرور", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const data = await authApi.login(username.trim(), password);
      login(data.token, data.user);
      navigate("/");
    } catch {
      toast({ title: "خطأ في تسجيل الدخول", description: "اسم المستخدم أو كلمة المرور غير صحيحة", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0a0a0a] border border-[#333] rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <button onClick={onClose} className="absolute top-4 left-4 text-gray-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
        <div className="text-center mb-6">
          <img src="/stark.jpg" alt="Logo" className="w-16 h-16 rounded-xl mx-auto mb-3 object-cover" style={{objectPosition: "50% 10%"}} />
          <h2 className="text-xl font-bold text-white">تسجيل الدخول</h2>
          <p className="text-gray-400 text-sm mt-1">أدخل بياناتك للوصول للنظام</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-300 mb-1.5 block">اسم المستخدم</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="أدخل اسم المستخدم"
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#888] transition-colors text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-1.5 block">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 pl-12 text-white placeholder-gray-500 focus:outline-none focus:border-[#888] transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm mt-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <><LogIn size={18} /> دخول</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ onLoginClick }: { onLoginClick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navLinks = [
    { label: "الرئيسية", href: "#home" },
    { label: "من نحن", href: "#about" },
    { label: "خدماتنا", href: "#services" },
    { label: "العقد والتعاقد", href: "#contract" },
    { label: "اتصل بنا", href: "#contact" },
  ];
  return (
    <nav className="fixed top-0 inset-x-0 z-40 bg-black/90 backdrop-blur-md border-b border-[#222]" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="STARK" className="w-9 h-9 rounded-lg object-cover" />
          <span className="hidden sm:block font-black tracking-[0.2em] text-base" style={{background: "linear-gradient(135deg, #e8e8e8 0%, #ffffff 50%, #a0a0a0 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "0.2em"}}>STARK</span>
        </div>
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(l => (
            <a key={l.href} href={l.href} className="text-gray-300 hover:text-white text-sm transition-colors">{l.label}</a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onLoginClick}
            className="relative group flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold overflow-hidden transition-all duration-300"
            style={{
              background: "linear-gradient(135deg, #c0c0c0 0%, #f5f5f5 50%, #a8a8a8 100%)",
              color: "#0a0a0a",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.15), 0 4px 20px rgba(255,255,255,0.1)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1px rgba(255,255,255,0.3), 0 4px 28px rgba(255,255,255,0.25)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1px rgba(255,255,255,0.15), 0 4px 20px rgba(255,255,255,0.1)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            }}
          >
            <LayoutDashboard size={15} />
            <span>لوحة التحكم</span>
          </button>
          <button className="md:hidden text-white" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="md:hidden bg-black border-t border-[#222] px-4 py-3 flex flex-col gap-3">
          {navLinks.map(l => (
            <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="text-gray-300 hover:text-white text-sm py-1">{l.label}</a>
          ))}
        </div>
      )}
    </nav>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────
function HeroSection({ onLoginClick }: { onLoginClick: () => void }) {
  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black" dir="rtl">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0d0d0d] to-[#1a1a1a]" />
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-20 left-20 w-64 h-64 rounded-full bg-gray-400 blur-3xl" />
      </div>
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 mb-6">
          <Truck size={16} className="text-gray-300" />
          <span className="text-gray-300 text-sm">شركة شحن محلية موثوقة منذ 1999</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight">
          شركة ستارك<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500">للشحن</span>
        </h1>
        <p className="text-gray-300 text-lg md:text-xl mb-8 max-w-2xl mx-auto leading-relaxed">
          ستارك لوجستيك — خدمات شحن محلية سريعة وموثوقة تطال كل مصر، اطمن — سيب الشحن علينا
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="#tracking" className="bg-white text-black font-bold px-8 py-3.5 rounded-xl hover:bg-gray-100 transition-colors flex items-center gap-2">
            <Package size={18} /> تتبع شحنتك
          </a>
          <a href="#contract" className="border border-[#444] text-white font-bold px-8 py-3.5 rounded-xl hover:border-[#888] transition-colors flex items-center gap-2">
            <FileText size={18} /> تعاقد معنا
          </a>
        </div>
      </div>
      <a href="#tracking" className="absolute bottom-8 left-1/2 -translate-x-1/2 text-gray-500 animate-bounce">
        <ChevronDown size={28} />
      </a>
    </section>
  );
}

// ─── Tracking Section ─────────────────────────────────────────────────────────
function TrackingSection() {
  const [trackingNum, setTrackingNum] = useState("");
  const steps = [
    { icon: FileText, label: "تم التسجيل" },
    { icon: Package, label: "جارى التجميع" },
    { icon: Truck, label: "جاري الشحن" },
    { icon: MapPin, label: "داخل التوصيل" },
    { icon: CheckCircle, label: "تم التسليم" },
  ];
  return (
    <section id="tracking" className="py-20 bg-[#0a0a0a]" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Package size={28} className="text-white" />
        </div>
        <h2 className="text-3xl font-black text-white mb-2">تتبع الشحنة</h2>
        <p className="text-gray-400 mb-8">يمكنك تتبع شحنتك ومعرفة حالتها الدائمة في أي وقت</p>
        <div className="flex gap-3 max-w-lg mx-auto mb-10">
          <input
            type="text"
            value={trackingNum}
            onChange={e => setTrackingNum(e.target.value)}
            placeholder="أدخل رقم التتبع مثال: 1TRK12345678"
            className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#666] text-sm"
          />
          <button className="bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors text-sm whitespace-nowrap">
            تتبع
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 bg-[#1a1a1a] border border-[#333] rounded-xl flex items-center justify-center">
                  <step.icon size={18} className="text-gray-400" />
                </div>
                <span className="text-xs text-gray-500">{step.label}</span>
              </div>
              {i < steps.length - 1 && <div className="w-8 h-px bg-[#333] mb-4" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── About Section ────────────────────────────────────────────────────────────
function AboutSection() {
  const features = [
    { icon: Star, label: "الخبرة" },
    { icon: Shield, label: "الاعتمادية" },
    { icon: MapPin, label: "الوصول المحلى" },
    { icon: Users, label: "الخدمة" },
  ];
  return (
    <section id="about" className="py-20 bg-black" dir="rtl">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-black text-white mb-4">من نحن</h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              أحد ستارك لوجستيك من أبز شركات الشحن والخدمات اللوجستية داخل مصر حيث تقدم خدمة للأفراد والشركات بجميع المحافظات والمدن على المستوى الجمهورية منذ عام 1999.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {features.map((f, i) => (
                <div key={i} className="bg-[#0d0d0d] border border-[#222] rounded-xl p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                    <f.icon size={18} className="text-gray-300" />
                  </div>
                  <span className="text-gray-200 font-semibold text-sm">{f.label}</span>
                </div>
              ))}
            </div>
            <a href="#services" className="inline-flex items-center gap-2 mt-6 text-gray-300 hover:text-white transition-colors text-sm">
              المزيد <ArrowLeft size={16} />
            </a>
          </div>
          <div className="bg-[#0d0d0d] border border-[#222] rounded-2xl p-8 text-center">
            <img src="/stark.jpg" alt="ستارك" className="w-24 h-24 rounded-2xl mx-auto mb-4 object-cover" style={{objectPosition: "50% 10%"}} />
            <h3 className="text-white font-bold text-xl mb-1">شركة ستارك للشحن</h3>
            <p className="text-gray-400 text-sm">خدمة الشحن الموثوقة في مصر</p>
            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-[#222]">
              {[["25+", "سنة خبرة"], ["27", "محافظة"], ["99%", "رضا العملاء"]].map(([val, lbl], i) => (
                <div key={i}>
                  <div className="text-2xl font-black text-white">{val}</div>
                  <div className="text-xs text-gray-500 mt-1">{lbl}</div>
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
function ShippingCycleSection() {
  const steps = [
    { num: "1", title: "تسجيل الشحنة", desc: "سجل شحنتك بسرعة وسهولة من خلال لوحة التحكم أو تواصل معنا مباشرة", icon: FileText },
    { num: "2", title: "طلب البيك أب", desc: "نستقبل طلبك ونرسل مندوب لاستلام الشحنة من موقعك", icon: Truck },
    { num: "3", title: "الفرز والتجميع", desc: "تُفرز الشحنات وتُجمع لتسريع وتحسين عمليات التوزيع", icon: Package },
    { num: "4", title: "جاري التوصيل", desc: "تنطلق الشحنة برحلتها نحو وجهتها مع تتبع فوري مستمر", icon: MapPin },
    { num: "5", title: "تم التسليم والتحصيل", desc: "يتم تسليم الشحنة للمستلم وتحصيل المبلغ إن وجد بأمان وسرعة", icon: CheckCircle },
  ];
  return (
    <section id="services" className="py-20 bg-[#0a0a0a]" dir="rtl">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Truck size={28} className="text-white" />
          </div>
          <h2 className="text-3xl font-black text-white mb-2">دورة الشحن</h2>
          <p className="text-gray-400">كيف توصل شحنتك من باب التاجر لباب العميل في خطوات بسيطة</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {steps.map((s, i) => (
            <div key={i} className="bg-[#111] border border-[#222] rounded-2xl p-5 text-center relative">
              <div className="absolute -top-3 right-1/2 translate-x-1/2 w-6 h-6 bg-white text-black rounded-full text-xs font-black flex items-center justify-center">
                {s.num}
              </div>
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-3 mt-2">
                <s.icon size={22} className="text-gray-300" />
              </div>
              <h3 className="text-white font-bold text-sm mb-2">{s.title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          {[{ icon: Shield, label: "الخدمة" }, { icon: MapPin, label: "الاعتمادية" }, { icon: Users, label: "الوصول المحلي" }, { icon: Star, label: "الخبرة" }].map((t, i) => (
            <div key={i} className="flex items-center gap-2 bg-[#111] border border-[#222] rounded-xl px-4 py-2">
              <t.icon size={15} className="text-gray-400" />
              <span className="text-gray-300 text-sm">{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Contract Section ─────────────────────────────────────────────────────────
function ContractSection() {
  const items = [
    { icon: FileText, label: "الظروف المتعاقدة" },
    { icon: Shield, label: "التمهيد" },
    { icon: Star, label: "بنود العقد" },
  ];
  return (
    <section id="contract" className="py-20 bg-black" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 text-center">
        <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <FileText size={28} className="text-white" />
        </div>
        <h2 className="text-3xl font-black text-white mb-2">عقد شركة ستارك للشحن</h2>
        <p className="text-gray-400 mb-8">عقد خدمات الشحن والتوصيل • شركة ستارك للشحن</p>
        <div className="space-y-3 mb-8 text-right">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-4 bg-[#0d0d0d] border border-[#222] rounded-xl px-5 py-4">
              <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <item.icon size={18} className="text-gray-300" />
              </div>
              <span className="text-gray-200 font-medium">{item.label}</span>
            </div>
          ))}
        </div>
        <a
          href="#contact"
          className="inline-flex items-center gap-2 bg-white text-black font-bold px-8 py-3.5 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <FileText size={18} /> العقد والتعاقد
        </a>
      </div>
    </section>
  );
}

// ─── Features Section ─────────────────────────────────────────────────────────
function FeaturesSection() {
  const features = [
    { icon: Truck, title: "تسليم سريع", desc: "خدمات شحن سريعة من أقصى الشمال لأقصى الجنوب، من الساعة الأولى تلاقي البضاعة وصلت" },
    { icon: MapPin, title: "تتبع لحظي", desc: "تابع شحناتك في المدن الكبرى باستخدام GPS المدمج والتحديث على عناوين فورية" },
    { icon: Shield, title: "تغليف أمن", desc: "نوفر تغليف احترافي وآمن للبضائع بأنواعها المختلفة أيًا كان حجمها ووزنها" },
    { icon: Clock, title: "دعم 24/7", desc: "خدمة عملاء دائمة على مدار الساعة 7 أيام أسبوعياً لمساعدتك في كل استفساراتك" },
  ];
  return (
    <section id="features" className="py-20 bg-[#0a0a0a]" dir="rtl">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-black text-white mb-2">مميزاتنا</h2>
          <p className="text-gray-400">حلول لوجستية فاملة مناسبة لكل أنواع احتياجات عملائك</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div key={i} className="bg-[#111] border border-[#222] rounded-2xl p-6 text-center hover:border-[#444] transition-colors">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <f.icon size={26} className="text-gray-300" />
              </div>
              <h3 className="text-white font-bold mb-2">{f.title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Contact Section ──────────────────────────────────────────────────────────
function ContactSection() {
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
    <section id="contact" className="py-20 bg-black" dir="rtl">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-black text-white mb-2">اتصل بنا</h2>
          <p className="text-gray-400">افضل طرق للحصول على المساعدة المطلوبة</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {branches.map((b, i) => (
            <div key={i} className="bg-[#0d0d0d] border border-[#222] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                  <MapPin size={18} className="text-gray-300" />
                </div>
                <h3 className="text-white font-bold">{b.name}</h3>
              </div>
              <p className="text-gray-400 text-sm mb-1">{b.address}</p>
              <p className="text-gray-500 text-sm mb-4">{b.phone}</p>
              <a
                href="#"
                className="inline-flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors border border-[#333] hover:border-[#666] rounded-lg px-3 py-1.5"
              >
                <Phone size={14} /> اتصل الآن
              </a>
            </div>
          ))}
        </div>
        <div className="text-center">
          <a
            href="mailto:info@alexander-eg.com"
            className="inline-flex items-center gap-2 bg-white text-black font-bold px-8 py-3.5 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <Mail size={18} /> تواصل معنا
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="py-8 bg-[#050505] border-t border-[#1a1a1a]" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/stark.jpg" alt="ستارك" className="w-8 h-8 rounded-lg object-cover" style={{objectPosition: "50% 10%"}} />
          <span className="text-gray-400 text-sm">شركة ستارك للشحن</span>
        </div>
        <p className="text-gray-600 text-xs">جميع الحقوق محفوظة © 2025</p>
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
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="bg-black min-h-screen">
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      <Navbar onLoginClick={() => setShowLogin(true)} />
      <HeroSection onLoginClick={() => setShowLogin(true)} />
      <TrackingSection />
      <AboutSection />
      <ShippingCycleSection />
      <ContractSection />
      <FeaturesSection />
      <ContactSection />
      <Footer />
    </div>
  );
}
