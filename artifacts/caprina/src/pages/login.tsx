import React, { useState } from "react";
import { authApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { Navbar, Footer } from "@/pages/home";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
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

  const dm = darkMode;

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-500"
      style={{ background: dm ? "#080808" : "#f5f5f5" }}
    >
      {/* ── نفس الـ Navbar بتاع الصفحة الرئيسية ── */}
      <Navbar darkMode={dm} toggleDarkMode={() => setDarkMode(v => !v)} />

      {/* ── Main content ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 relative overflow-hidden" dir="rtl">

        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="/stark.jpg"
            alt=""
            className="w-full h-full object-cover object-center"
            style={{ filter: `brightness(${dm ? 0.55 : 0.75}) saturate(1.05)` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: dm
                ? "radial-gradient(ellipse at center, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.60) 100%)"
                : "radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.45) 100%)",
            }}
          />
        </div>

        {/* ── Card — horizontal layout ── */}
        <div
          className="relative z-10 w-full rounded-3xl overflow-hidden"
          style={{
            maxWidth: 860,
            background: dm ? "rgba(6,6,6,0.72)" : "rgba(255,255,255,0.75)",
            border: dm ? "1px solid rgba(255,255,255,0.11)" : "1px solid rgba(0,0,0,0.10)",
            boxShadow: dm
              ? "0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)"
              : "0 24px 60px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.9)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
          }}
        >
          <div className="flex flex-row">

            {/* ── Left side — branding ── */}
            <div
              className="hidden md:flex flex-col items-center justify-center px-10 py-12"
              style={{
                flex: "0 0 300px",
                borderLeft: dm ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)",
                background: dm
                  ? "linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)"
                  : "linear-gradient(160deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.01) 100%)",
              }}
            >
              <div className="relative mb-5">
                <div
                  className="absolute inset-0 rounded-3xl"
                  style={{
                    background: dm ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)",
                    filter: "blur(22px)",
                    transform: "scale(1.6)",
                  }}
                />
                <img
                  src="/logo.jpg"
                  alt="STARK"
                  className="relative w-[88px] h-[88px] rounded-3xl object-cover"
                  style={{
                    boxShadow: dm
                      ? "0 0 0 1px rgba(255,255,255,0.16), 0 16px 40px rgba(0,0,0,0.5)"
                      : "0 0 0 1px rgba(0,0,0,0.1), 0 12px 32px rgba(0,0,0,0.15)",
                  }}
                />
              </div>
              <h1
                className="text-3xl font-black tracking-[0.4em] mb-2"
                style={{
                  color: dm ? "#ffffff" : "#111",
                  textShadow: dm ? "0 2px 24px rgba(255,255,255,0.2)" : "none",
                }}
              >
                STARK
              </h1>
              <p
                className="text-xs text-center leading-relaxed"
                style={{ color: dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.4)", letterSpacing: "0.07em" }}
              >
                شركة الشحن الموثوقة في مصر
              </p>
              <div
                className="w-12 my-6"
                style={{
                  height: 1,
                  background: dm
                    ? "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)"
                    : "linear-gradient(90deg, transparent, rgba(0,0,0,0.15), transparent)",
                }}
              />
              <p
                className="text-xs text-center leading-6"
                style={{ color: dm ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.3)" }}
              >
                منصة إدارة الطلبات والشحن<br />لمتاجر الكوميرس المصرية
              </p>
            </div>

            {/* ── Right side — form ── */}
            <div className="flex-1 px-8 md:px-10 py-12">
              {/* Mobile logo */}
              <div className="flex md:hidden items-center gap-3 mb-8">
                <img src="/logo.jpg" alt="STARK" className="w-10 h-10 rounded-xl object-cover" />
                <span className="font-black text-xl tracking-[0.3em]" style={{ color: dm ? "#fff" : "#111" }}>
                  STARK
                </span>
              </div>

              <h2 className="text-2xl font-black mb-1" style={{ color: dm ? "#fff" : "#111" }}>
                تسجيل الدخول
              </h2>
              <p className="text-sm mb-8" style={{ color: dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.42)" }}>
                أدخل بياناتك للوصول للوحة التحكم
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Username */}
                <div>
                  <label
                    className="block text-[11px] font-bold mb-2 tracking-widest uppercase"
                    style={{ color: dm ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.45)" }}
                  >
                    اسم المستخدم
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="أدخل اسم المستخدم"
                    autoFocus
                    className="w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all duration-200"
                    style={{
                      background: dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
                      border: dm ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.10)",
                      color: dm ? "#fff" : "#111",
                      caretColor: dm ? "#fff" : "#111",
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";
                      e.currentTarget.style.background   = dm ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.07)";
                      e.currentTarget.style.boxShadow    = dm ? "0 0 0 3px rgba(255,255,255,0.05)" : "0 0 0 3px rgba(0,0,0,0.04)";
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
                      e.currentTarget.style.background   = dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
                      e.currentTarget.style.boxShadow    = "none";
                    }}
                  />
                </div>

                {/* Password */}
                <div>
                  <label
                    className="block text-[11px] font-bold mb-2 tracking-widest uppercase"
                    style={{ color: dm ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.45)" }}
                  >
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="أدخل كلمة المرور"
                      className="w-full rounded-xl px-4 py-3.5 pl-12 text-sm outline-none transition-all duration-200"
                      style={{
                        background: dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
                        border: dm ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.10)",
                        color: dm ? "#fff" : "#111",
                        caretColor: dm ? "#fff" : "#111",
                      }}
                      onFocus={e => {
                        e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";
                        e.currentTarget.style.background   = dm ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.07)";
                        e.currentTarget.style.boxShadow    = dm ? "0 0 0 3px rgba(255,255,255,0.05)" : "0 0 0 3px rgba(0,0,0,0.04)";
                      }}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = dm ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
                        e.currentTarget.style.background   = dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
                        e.currentTarget.style.boxShadow    = "none";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200"
                      style={{ color: dm ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)" }}
                      onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = dm ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)")}
                      onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = dm ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)")}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full font-black py-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2.5 text-[15px] disabled:opacity-50 mt-1"
                  style={{
                    background: dm
                      ? "linear-gradient(135deg, #c8c8c8 0%, #ffffff 50%, #b0b0b0 100%)"
                      : "linear-gradient(135deg, #1a1a1a 0%, #333 50%, #111 100%)",
                    color: dm ? "#000" : "#fff",
                    boxShadow: dm
                      ? "0 0 0 1px rgba(255,255,255,0.18), 0 8px 28px rgba(255,255,255,0.12)"
                      : "0 0 0 1px rgba(0,0,0,0.15), 0 8px 28px rgba(0,0,0,0.18)",
                  }}
                  onMouseEnter={e => {
                    if (!loading) {
                      (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = dm
                        ? "0 0 0 1px rgba(255,255,255,0.28), 0 16px 48px rgba(255,255,255,0.2)"
                        : "0 0 0 1px rgba(0,0,0,0.2), 0 16px 48px rgba(0,0,0,0.25)";
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = dm
                      ? "0 0 0 1px rgba(255,255,255,0.18), 0 8px 28px rgba(255,255,255,0.12)"
                      : "0 0 0 1px rgba(0,0,0,0.15), 0 8px 28px rgba(0,0,0,0.18)";
                  }}
                >
                  {loading
                    ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <><LogIn size={17} /> دخول للوحة التحكم</>
                  }
                </button>

                {/* Register link */}
                <div className="flex items-center justify-center gap-2 pt-2">
                  <span className="text-sm" style={{ color: dm ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)" }}>
                    ليس لديك حساب؟
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate("/register")}
                    className="flex items-center gap-1.5 text-sm font-bold transition-all duration-200"
                    style={{ color: dm ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)" }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.color = dm ? "#ffffff" : "#000000";
                      (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.color = dm ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)";
                      (e.currentTarget as HTMLButtonElement).style.textDecoration = "none";
                    }}
                  >
                    <UserPlus size={15} />
                    إنشاء حساب جديد
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      </div>

      {/* ── نفس الـ Footer بتاع الصفحة الرئيسية ── */}
      <Footer />
    </div>
  );
}
