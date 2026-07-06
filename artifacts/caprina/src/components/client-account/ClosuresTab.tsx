import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Ban, Loader2, Lock, LockOpen } from "lucide-react";
import { type ClientAccountPeriodDTO } from "@/lib/api";

const fmt = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });

const fmtDateTime = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }) +
    " " + date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
};

export interface ClosureRow {
  id: number;
  clientName: string;
  clientPhone: string;
  ordersCount: number;
  totalShippingValue: string;
  totalCollected: string;
  totalShippingFee: string;
  notes: string | null;
  closedByName: string | null;
  createdAt: string;
}

interface ClosuresTabProps {
  closures: ClosureRow[];
  periods: ClientAccountPeriodDTO[];
  periodsLoading: boolean;
  onReopenPeriod: (id: number) => void;
}

// ─── تاب: الإقفالات السابقة + فترات الإقفال الرسمية (Period Lock) ─────────────
export function ClosuresTab({ closures, periods, periodsLoading, onReopenPeriod }: ClosuresTabProps) {
  const [closureSearch, setClosureSearch] = useState("");

  const filteredClosures = useMemo(() => {
    const q = closureSearch.trim();
    if (!q) return closures;
    return closures.filter(c =>
      (c.closedByName || "").includes(q) || (c.notes || "").includes(q) ||
      fmtDate(c.createdAt).includes(q) || String(c.ordersCount).includes(q)
    );
  }, [closures, closureSearch]);

  return (
    <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-sm font-bold">سجل إقفالات الحساب السابقة</p>
        {closures.length > 0 && (
          <Input
            placeholder="بحث بالتاريخ أو الموظف أو الملاحظات..."
            className="h-8 text-xs bg-background w-64"
            value={closureSearch}
            onChange={e => setClosureSearch(e.target.value)}
          />
        )}
      </div>
      {closures.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Ban className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
          <p className="text-xs">لا يوجد إقفالات سابقة لهذا العميل</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold text-muted-foreground">
                <th className="text-right py-2 px-2">التاريخ</th>
                <th className="text-right py-2 px-2">عدد الأوردرات</th>
                <th className="text-right py-2 px-2">قيمة الشحنات</th>
                <th className="text-right py-2 px-2">المحصَّل</th>
                <th className="text-right py-2 px-2">بواسطة</th>
                <th className="text-right py-2 px-2">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {filteredClosures.map(c => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="py-2.5 px-2">{fmtDate(c.createdAt)}</td>
                  <td className="py-2.5 px-2 font-bold">{c.ordersCount}</td>
                  <td className="py-2.5 px-2 font-bold">{fmt(c.totalShippingValue)}</td>
                  <td className="py-2.5 px-2 text-emerald-400 font-bold">{fmt(c.totalCollected)}</td>
                  <td className="py-2.5 px-2 text-muted-foreground">{c.closedByName || "—"}</td>
                  <td className="py-2.5 px-2 text-muted-foreground">{c.notes || "—"}</td>
                </tr>
              ))}
              {filteredClosures.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-xs">لا توجد نتائج مطابقة للبحث</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── فترات الإقفال الحقيقية (Period Lock) ── */}
      <div className="mt-5 pt-4 border-t border-border">
        <p className="text-sm font-bold mb-3 flex items-center gap-2"><Lock className="w-4 h-4 text-primary" /> فترات إقفال الحساب (رسمية)</p>
        {periodsLoading ? (
          <div className="p-6 text-center text-muted-foreground text-xs"><Loader2 className="w-5 h-5 mx-auto mb-1.5 animate-spin" /> جاري التحميل...</div>
        ) : periods.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-xs">لا توجد فترات مقفولة رسميًا بعد</div>
        ) : (
          <div className="space-y-2">
            {periods.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl p-3 flex-wrap"
                style={{ background: "hsl(var(--muted)/0.15)" }}>
                <div className="min-w-0">
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    {fmtDate(p.periodFrom)} → {fmtDate(p.periodTo)}
                    <Badge variant="outline" className={`text-[9px] gap-1 ${p.status === "closed" ? "text-emerald-400 border-emerald-700" : "text-amber-400 border-amber-700"}`}>
                      {p.status === "closed" ? <Lock className="w-2.5 h-2.5" /> : <LockOpen className="w-2.5 h-2.5" />}
                      {p.status === "closed" ? "مقفولة" : "معاد فتحها"}
                    </Badge>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {p.ordersCount} شحنة — بواسطة {p.closedByName || "—"} — {fmtDateTime(p.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-[10px] shrink-0">
                  <div><p className="text-muted-foreground">افتتاحي</p><p className="font-bold">{fmt(p.openingBalance)}</p></div>
                  <div><p className="text-muted-foreground">شحنات</p><p className="font-bold">{fmt(p.totalDebit)}</p></div>
                  <div><p className="text-muted-foreground">تحصيل</p><p className="font-bold text-emerald-400">{fmt(p.totalCredit)}</p></div>
                  <div><p className="text-muted-foreground">تسويات</p><p className="font-bold text-amber-400">{fmt(p.totalAdjustments)}</p></div>
                  <div><p className="text-muted-foreground">ختامي</p><p className="font-black text-[#c9a227]">{fmt(p.closingBalance)}</p></div>
                  {p.status === "closed" && (
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] text-red-400"
                      onClick={() => onReopenPeriod(p.id)}>
                      <LockOpen className="w-3 h-3 ml-1" /> إعادة فتح
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
