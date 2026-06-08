import React, { useState } from "react";
import { authApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, LogIn, Truck, Shield, Clock, MapPin } from "lucide-react";

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
    { icon: Truck,  label: "27 محافظة مغطاة" },
    { icon: Shield, label: "99% رضا العملاء" },
    { icon: Clock,  label: "تسليم سريع وآمن" },
    { icon: MapPin, label: "تتبع لحظي مستمر" },
  ];

  return (
    <div className="min-h-screen bg-black flex" dir="rtl">

      {/* ── Left panel — branding ── */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 relative overflow-hidden p-12">
        {/* bg image */}
        <div className="absolute inset-0">
          <img src="/stark.jpg" alt="" className="w-full h-full object-cover object-center opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-l from-black via-black/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
        </div>

        {/* Logo top */}
        <div className="relative z-10 flex items-center gap-3">
          <img src="/logo.jpg" alt="STARK" className="w-11 h-11 rounded-xl object-cover ring-2 ring-white/10" />
          <span className="text-white font-black text-xl tracking-[0.25em]" style={{ textShadow: "0 0 20px rgba(255,255,255,0.3)" }}>
            STARK
          </span>
        </div>

        {/* Center text */}
        <div className="relative z-10">
          <h1 className="text-5xl font-black text-white leading-tight mb-4">
            منصة إدارة<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500">
              عمليات الشحن
            </span>
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed max-w-sm">
            نظام متكامل لإدارة الطلبات والشحنات وتتبعها في الوقت الفعلي
          </p>
        </div>

        {/* Stats bottom */}
        <div className="relative z-10 grid grid-cols-2 gap-3">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-2xl px-4 py-3 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <s.icon size={16} className="text-gray-300" />
              </div>
              <span className="text-gray-300 text-sm font-medium">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* subtle grid bg */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <img src="/logo.jpg" alt="STARK" className="w-12 h-12 rounded-xl object-cover" />
            <span className="text-white font-black text-2xl tracking-[0.25em]">STARK</span>
          </div>

          {/* Card */}
          <div
            className="rounded-3xl p-8 border"
            style={{
              background: "linear-gradient(135deg, #111 0%, #0d0d0d 100%)",
              borderColor: "rgba(255,255,255,0.08)",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,0.8)",
            }}
          >
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 overflow-hidden ring-2 ring-white/10 shadow-lg">
                <img src="/logo.jpg" alt="STARK" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-2xl font-black text-white mb-1">أهلاً بك</h2>
              <p className="text-gray-500 text-sm">سجّل دخولك للوصول للوحة التحكم</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-2 block tracking-wide uppercase">
                  اسم المستخدم
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm outline-none transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-2 block tracking-wide uppercase">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    className="w-full rounded-xl px-4 py-3 pl-12 text-white placeholder-gray-600 text-sm outline-none transition-all duration-200"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full font-black py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm mt-2 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #d0d0d0 0%, #ffffff 50%, #b0b0b0 100%)",
                  color: "#000",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.2), 0 8px 32px rgba(255,255,255,0.1)",
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
              >
                {loading
                  ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  : <><LogIn size={17} /> دخول للوحة التحكم</>
                }
              </button>
            </form>
          </div>

          {/* Back link */}
          <div className="text-center mt-6">
            <button
              onClick={() => navigate("/")}
              className="text-gray-600 hover:text-gray-300 text-sm transition-colors"
            >
              ← العودة للصفحة الرئيسية
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-gray-700 text-xs mt-8">
            © 2026 STARK لوجستيك — جميع الحقوق محفوظة
          </p>
        </div>
      </div>
    </div>
  );
}
