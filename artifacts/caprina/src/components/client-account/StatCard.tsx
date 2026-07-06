import { TrendingUp, TrendingDown } from "lucide-react";

// ─── كارت إحصائية علوي (مكوّن بصري خالص، بدون state) ─────────────────────────
export function StatCard({ label, value, icon: Icon, color, sub, trend }: {
  label: string; value: string; icon: any; color: string; sub?: string; trend?: "up" | "down";
}) {
  return (
    <div className="rounded-2xl p-4 relative overflow-hidden shrink-0"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
      <div className="absolute -top-6 -left-6 w-20 h-20 rounded-full pointer-events-none"
        style={{ background: `${color}14`, filter: "blur(16px)" }} />
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground mb-1.5 truncate">{label}</p>
          <p className="text-lg font-black truncate" style={{ color }}>{value}</p>
          {sub && (
            <p className={`text-[10px] mt-1 flex items-center gap-1 ${trend === "down" ? "text-red-400" : "text-emerald-400"}`}>
              {trend === "down" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {sub}
            </p>
          )}
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18` }}>
          <Icon className="w-4.5 h-4.5" style={{ color }} />
        </div>
      </div>
    </div>
  );
}
