// ─── دائرة Health Score — مؤشر صحة حساب العميل (مكوّن بصري خالص، بدون state) ──
export function HealthScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = 27, circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-black" style={{ color }}>{score}</span>
          <span className="text-[8px] text-muted-foreground">/100</span>
        </div>
      </div>
      <span className="text-[10px] font-bold" style={{ color }}>
        {score >= 75 ? "ممتاز" : score >= 50 ? "متوسط" : "ضعيف"}
      </span>
    </div>
  );
}
