import React, { useState } from "react";
import { authApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, LogIn, Truck, Shield, Clock, MapPin, ArrowRight } from "lucide-react";

export default function LoginPage() {
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

  const stats = [
    { icon: Truck,  label: "27 محافظة مغطاة",  sub: "تغطية شاملة لكل مصر" },
    { icon: Shield, label: "99% رضا العملاء",   sub: "خدمة موثوقة منذ 1999" },
    { icon: Clock,  label: "تسليم سريع وآمن",   sub: "في أقل وقت ممكن" },
    { icon: MapPin, label: "تتبع لحظي مستمر",   sub: "راقب شحنتك في أي وقت" },
  ];

  return (
    <div className="min-h-screen bg-[#080808] flex" dir="rtl">

      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] relative overflow-hidden p-16">
        <div className="absolute inset-0">
          <img src="/stark.jpg" alt="" className="w-full h-full object-cover object-center" style={{ opacity: 0.35 }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to left, #080808 0%, rgba(8,8,8,0.5) 40%, transparent 100%)" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, #080808 0%, transparent 50%)" }} />
        </div>

        <div className="relative z-10 flex items-center gap-4">
          <img src="/logo.jpg" alt="STARK" className="w-12 h-12 rounded-2xl object-cover" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.1)" }} />
          <span className="text-white font-black text-2xl tracking-[0.3em]" style={{ textShadow: "0 0 30px rgba(255,255,255,0.25)" }}>STARK</span>
        </div>

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full text-xs font-semibold tracking-widest uppercase" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
            <Truck size={13} /> منصة إدارة الشحن
          </div>
          <h1 className="text-6xl font-black text-white leading-[1.1] mb-6">
            إدارة شحناتك<br />
            <span style={{ background: "linear-gradient(135deg, #e0e0e0, #888)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              بكل سهولة
            </span>
          </h1>
          <p className="text-lg leading-relaxed max-w-md" style={{ color: "rgba(255,255,255,0.45)" }}>
            نظام متكامل لإدارة الطلبات والشحنات وتتبعها في الوقت الفعلي عبر 27 محافظة
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-4">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl px-5 py-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                <s.icon size={18} style={{ color: "rgba(255,255,255,0.7)" }} />
              </div>
              <div>
                <div className="text-white text-sm font-bold">{s.label}</div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 relative">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }} />

        <div className="relative w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-12">
            <img src="/logo.jpg" alt="STARK" className="w-14 h-14 rounded-2xl object-cover" />
            <span className="text-white font-black text-3xl tracking-[0.3em]">STARK</span>
          </div>

          {/* Header */}
          <div className="mb-10">
            <h2 className="text-4xl font-black text-white mb-3">تسجيل الدخول</h2>
            <p className="text-base" style={{ color: "rgba(255,255,255,0.4)" }}>
              أدخل بياناتك للوصول للوحة التحكم
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-3xl p-8 space-y-6" style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 40px 100px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}>

            {/* Card logo header */}
            <div className="flex items-center gap-3 pb-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <img src="/logo.jpg" alt="STARK" className="w-12 h-12 rounded-xl object-cover" style={{ boxShadow: "0 0 20px rgba(255,255,255,0.1)" }} />
              <div>
                <div className="text-white font-black text-lg tracking-widest">STARK</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>لوحة التحكم الرئيسية</div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div>
                <label className="block text-sm font-semibold mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
                  اسم المستخدم
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  autoFocus
                  className="w-full rounded-2xl px-5 py-4 text-white text-base outline-none transition-all duration-300 placeholder-[rgba(255,255,255,0.2)]"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(255,255,255,0.04)"; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    className="w-full rounded-2xl px-5 py-4 pl-14 text-white text-base outline-none transition-all duration-300 placeholder-[rgba(255,255,255,0.2)]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(255,255,255,0.04)"; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)"}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full font-black py-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 text-base disabled:opacity-50 mt-2"
                style={{
                  background: "linear-gradient(135deg, #c8c8c8 0%, #ffffff 50%, #b0b0b0 100%)",
                  color: "#000",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.15), 0 8px 40px rgba(255,255,255,0.12)",
                }}
                onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1px rgba(255,255,255,0.2), 0 16px 48px rgba(255,255,255,0.18)"; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1px rgba(255,255,255,0.15), 0 8px 40px rgba(255,255,255,0.12)"; }}
              >
                {loading
                  ? <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  : <><LogIn size={20} /> دخول للوحة التحكم</>
                }
              </button>
            </form>
          </div>

          {/* Back + footer */}
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: "rgba(255,255,255,0.3)" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"}
            >
              <ArrowRight size={15} /> العودة للرئيسية
            </button>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
              2026 STARK ©
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
