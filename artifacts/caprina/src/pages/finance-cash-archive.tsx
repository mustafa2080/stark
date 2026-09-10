import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw, Star, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch as _apiFetch } from "@/lib/api";

const apiFetch = async (url: string, options?: RequestInit) => {
  return _apiFetch<any>(url.replace(/^\/api/, ""), options);
};

const fmt = (v: string | number) =>
  Number(v).toLocaleString("ar-EG", { minimumFractionDigits: 2 }) + " ج.م";

interface CashRegister {
  id: number; name: string; type: "main" | "branch";
  balance: string; description?: string; isActive: boolean;
  archivedAt?: string;
}

export default function FinanceCashArchivePage() {

  // ── Finance access guard ───────────────────────────────────────────────────
  const { isAdmin: _fAdmin, can } = useAuth();
  const _fCan = can;
  if (!_fAdmin && !_fCan("finance.cash")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
        <p className="text-muted-foreground text-sm max-w-xs">ليس لديك صلاحية لعرض صفحة الماليات. تواصل مع المدير.</p>
      </div>
    );
  }
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ registers: CashRegister[] }>({
    queryKey: ["/api/cash-registers/archived"],
    queryFn: () => apiFetch("/api/cash-registers/archived"),
    staleTime: 0,
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/cash-registers/${id}/restore`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cash-registers"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-registers/archived"] });
      toast({ title: "✅ تم استعادة الخزنة" });
    },
    onError: (e: any) =>
      toast({ title: "❌ خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/cash-registers/${id}/permanent`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cash-registers/archived"] });
      toast({ title: "✅ تم حذف الخزنة نهائياً" });
    },
    onError: (e: any) =>
      toast({ title: "❌ خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm"
          style={{ background: "rgba(100,100,100,0.12)" }}>
          <Archive className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-black">أرشيف الخزن</h1>
          <p className="text-xs text-muted-foreground mt-0.5">الخزن المؤرشفة — استعادة أو حذف نهائي</p>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">جارٍ التحميل...</span>
        </div>
      ) : !data || data.registers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 gap-4 text-muted-foreground rounded-2xl border border-border/40 bg-muted/10">
          <Archive className="w-14 h-14 opacity-15" />
          <div className="text-center">
            <p className="text-sm font-semibold">لا توجد خزن مؤرشفة</p>
            <p className="text-xs mt-1 opacity-60">الخزن المؤرشفة ستظهر هنا</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.registers.map(r => (
            <div key={r.id}
              className="relative overflow-hidden rounded-[22px] p-5"
              style={{
                background: "hsl(var(--muted)/0.3)",
                border: "1px solid hsl(var(--border)/0.5)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}>
              <div className="absolute inset-x-6 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(150,150,150,0.3), transparent)" }} />

              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-muted">
                    {r.type === "main"
                      ? <Star className="w-4 h-4 text-muted-foreground" />
                      : <Archive className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-muted-foreground line-through">{r.name}</p>
                    <span className="text-[10px] text-muted-foreground/50">
                      أُرشف {r.archivedAt ? new Date(r.archivedAt).toLocaleDateString("ar-EG") : "—"}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {r.type === "main" ? "رئيسية" : "فرعية"}
                </span>
              </div>

              <p className="text-xl font-black text-muted-foreground mb-2">{fmt(r.balance)}</p>

              {r.description && (
                <p className="text-[11px] text-muted-foreground/60 mb-3 truncate">{r.description}</p>
              )}

              <div className="flex gap-2 mt-3">
                {can("finance_cash_archive.restore_button") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5 text-xs h-8 rounded-xl border-emerald-300/50 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                  disabled={restoreMut.isPending || deleteMut.isPending}
                  onClick={() => {
                    if (confirm(`استعادة خزنة "${r.name}"؟`))
                      restoreMut.mutate(r.id);
                  }}>
                  <RotateCcw className="w-3 h-3" />
                  استعادة
                </Button>
                )}
                {can("finance_cash_archive.delete_button") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5 text-xs h-8 rounded-xl border-rose-300/50 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                  disabled={restoreMut.isPending || deleteMut.isPending}
                  onClick={() => {
                    if (confirm(`⚠️ حذف "${r.name}" نهائياً؟\nلن تتمكن من استعادتها بعد الحذف.`))
                      deleteMut.mutate(r.id);
                  }}>
                  <Trash2 className="w-3 h-3" />
                  حذف نهائي
                </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
