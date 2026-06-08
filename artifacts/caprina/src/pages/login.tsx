import React, { useState } from "react";
import { authApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, LogIn, ArrowRight } from "lucide-react";

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

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" dir="rtl"
      style={{ background: "#080808" }}
    >
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img src="/stark.jpg" alt="" className="w-full h-full object-cover object-center" style={{ opacity: 0.15 }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(30,30,30,0.4) 0%, #080808 70%)" }} />
      </div>

      {/* Dot grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "36px 36px",
        maskImage: "radial-gradient(ellipse 80% 80% at center, black 30%, transparent 100%)",
      }} />

      {/* Glow behind card */}
      <div className="absolute" style={{
        width: 600, height: 600,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Card */}
      <div className="relative w-full max-w-lg mx-4">
        <div className="rounded-3xl p-10" style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 50px 120px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
        }}>

          {/* Logo + brand */}
          <div className="flex flex-col items-center mb-10">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-3xl blur-2xl" style={{ background: "rgba(255,255,255,0.12)", transform: "scale(1.3)" }} />
              <img src="/logo.jpg" alt="STARK" className="relative w-24 h-24 rounded-3xl object-cover" style={{
                boxShadow: "0 0 0 1px rgba(255,255,255,0.12), 0 20px 60px rgba(0,0,0,0.5)",
              }} />
            </div>
            <h1 className="text-3xl font-black text-white tracking-[0.3em] mb-2"
              style={{ textShadow: "0 0 40px rgba(255,255,255,0.2)" }}>
              STARK
            </h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)", letterSpacing: "0.05em" }}>
              شركة الشحن الموثوقة في مصر
            </p>
          </div>

          {/* Divider */}
          <div className="mb-8" style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }} />

          {/* Title */}
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-black text-white mb-2">تسجيل الدخول</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
              أدخل بياناتك للوصول للوحة التحكم
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Username */}
            <div>
              <label className="block text-sm font-semibold mb-2.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                اسم المستخدم
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                autoFocus
                className="w-full rounded-2xl px-5 py-4 text-white text-base outline-none transition-all duration-300"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  caretColor: "#fff",
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.28)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                  e.currentTarget.style.boxShadow = "0 0 0 4px rgba(255,255,255,0.04)";
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold mb-2.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  className="w-full rounded-2xl px-5 py-4 pl-14 text-white text-base outline-none transition-all duration-300"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    caretColor: "#fff",
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.28)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.boxShadow = "0 0 0 4px rgba(255,255,255,0.04)";
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)"}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-black py-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 text-base disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #c8c8c8 0%, #ffffff 50%, #aaa 100%)",
                color: "#000",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.15), 0 8px 40px rgba(255,255,255,0.1)",
                marginTop: "8px",
              }}
              onMouseEnter={e => {
                if (!loading) {
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1px rgba(255,255,255,0.2), 0 20px 50px rgba(255,255,255,0.18)";
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1px rgba(255,255,255,0.15), 0 8px 40px rgba(255,255,255,0.1)";
              }}
            >
              {loading
                ? <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                : <><LogIn size={20} /> دخول للوحة التحكم</>
              }
            </button>
          </form>
        </div>

        {/* Back + copyright */}
        <div className="flex items-center justify-between mt-6 px-2">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm transition-colors duration-200"
            style={{ color: "rgba(255,255,255,0.3)" }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"}
          >
            <ArrowRight size={15} /> العودة للرئيسية
          </button>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
            © 2026 STARK
          </span>
        </div>
      </div>
    </div>
  );
}
