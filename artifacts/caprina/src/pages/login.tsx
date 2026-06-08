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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" dir="rtl">

      {/* ── Background image — full vivid ── */}
      <div className="absolute inset-0">
        <img
          src="/stark.jpg"
          alt=""
          className="w-full h-full object-cover object-center"
          style={{ filter: "brightness(0.72) saturate(1.1)" }}
        />
        {/* subtle dark gradient at edges only */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      </div>

      {/* ── Login Card ── */}
      <div className="relative z-10 w-full max-w-[420px] mx-4">
        <div
          className="rounded-3xl px-10 py-10"
          style={{
            background: "rgba(5, 5, 5, 0.68)",
            border: "1px solid rgba(255,255,255,0.13)",
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.55), 0 1.5px 0 rgba(255,255,255,0.07) inset",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
          }}
        >
          {/* ── Logo + Brand ── */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              {/* glow behind logo */}
              <div
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: "rgba(255,255,255,0.18)",
                  filter: "blur(18px)",
                  transform: "scale(1.5)",
                }}
              />
              <img
                src="/logo.jpg"
                alt="STARK"
                className="relative w-[72px] h-[72px] rounded-2xl object-cover"
                style={{
                  boxShadow:
                    "0 0 0 1px rgba(255,255,255,0.18), 0 12px 36px rgba(0,0,0,0.55)",
                }}
              />
            </div>

            <h1
              className="text-3xl font-black text-white tracking-[0.4em]"
              style={{ textShadow: "0 2px 24px rgba(255,255,255,0.25)" }}
            >
              STARK
            </h1>
            <p
              className="text-xs mt-1"
              style={{ color: "rgba(255,255,255,0.38)", letterSpacing: "0.1em" }}
            >
              شركة الشحن الموثوقة في مصر
            </p>
          </div>

          {/* ── Divider ── */}
          <div
            className="mb-7"
            style={{
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
            }}
          />

          {/* ── Heading ── */}
          <div className="text-center mb-7">
            <h2 className="text-xl font-black text-white mb-1">تسجيل الدخول</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.38)" }}>
              أدخل بياناتك للوصول للوحة التحكم
            </p>
          </div>

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Username */}
            <div>
              <label
                className="block text-[11px] font-bold mb-2 tracking-widest uppercase"
                style={{ color: "rgba(255,255,255,0.42)" }}
              >
                اسم المستخدم
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                autoFocus
                className="w-full rounded-xl px-4 py-3.5 text-white text-sm outline-none transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  caretColor: "#fff",
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.38)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.05)";
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-[11px] font-bold mb-2 tracking-widest uppercase"
                style={{ color: "rgba(255,255,255,0.42)" }}
              >
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  className="w-full rounded-xl px-4 py-3.5 pl-12 text-white text-sm outline-none transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    caretColor: "#fff",
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.38)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.05)";
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200"
                  style={{ color: "rgba(255,255,255,0.32)" }}
                  onMouseEnter={e =>
                    ((e.currentTarget as HTMLButtonElement).style.color =
                      "rgba(255,255,255,0.85)")
                  }
                  onMouseLeave={e =>
                    ((e.currentTarget as HTMLButtonElement).style.color =
                      "rgba(255,255,255,0.32)")
                  }
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-black py-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2.5 text-[15px] disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, #c8c8c8 0%, #ffffff 50%, #b0b0b0 100%)",
                color: "#000",
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.18), 0 8px 28px rgba(255,255,255,0.14)",
                marginTop: 4,
              }}
              onMouseEnter={e => {
                if (!loading) {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "translateY(-2px)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 0 0 1px rgba(255,255,255,0.28), 0 16px 48px rgba(255,255,255,0.22)";
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform =
                  "translateY(0)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  "0 0 0 1px rgba(255,255,255,0.18), 0 8px 28px rgba(255,255,255,0.14)";
              }}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={17} />
                  دخول للوحة التحكم
                </>
              )}
            </button>
          </form>
        </div>

        {/* ── Footer row ── */}
        <div className="flex items-center justify-between mt-5 px-1">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-sm transition-colors duration-200"
            style={{ color: "rgba(255,255,255,0.38)" }}
            onMouseEnter={e =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                "rgba(255,255,255,0.85)")
            }
            onMouseLeave={e =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                "rgba(255,255,255,0.38)")
            }
          >
            <ArrowRight size={14} />
            العودة للرئيسية
          </button>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.22)" }}>
            © 2026 STARK
          </span>
        </div>
      </div>
    </div>
  );
}
