import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, DollarSign, History, CheckCircle2, Calendar } from "lucide-react";
import { format } from "date-fns";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency", currency: "EGP", maximumFractionDigits: 0,
  }).format(n);

/**
 * تاب محفظة المندوب في صفحة الأدمن (/shipping/company/:id).
 * نفس مصدر بيانات بوابة المندوب (/representative/wallet + /representative/dashboard)
 * بس معروض من جهة الأدمن. لازم companyId يتبعت مع userId عشان الـ endpoint يحسب الرصيد للأدمن.
 * الكومبوننت بيتعرض بس لو المستخدم عنده صلاحية الماليات (canFinancials) — الصفحة هي اللي بتتحكم.
 */
export function RepWalletPanel({ companyId }: { companyId: number }) {
  const { data: repAccount } = useQuery({
    queryKey: ["rep-account", companyId],
    queryFn: () => apiFetch(`/shipping-companies/${companyId}/representative`).catch(() => null),
    enabled: !isNaN(companyId),
    retry: false,
  });
  const repUserId = (repAccount as any)?.id;

  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ["rep-wallet", repUserId, companyId],
    queryFn: () => apiFetch(`/representative/wallet?userId=${repUserId}&companyId=${companyId}`),
    enabled: !!repUserId,
  });
  const walletTransactions = (walletData as any)?.transactions ?? [];
  const totalSettled = (walletData as any)?.totalSettled ?? 0;
  const currentBalance = (walletData as any)?.currentBalance ?? 0;

  const { data: repDash } = useQuery({
    queryKey: ["rep-wallet-open-manifest", companyId],
    queryFn: () => apiFetch(`/representative/dashboard?companyId=${companyId}`),
    enabled: !isNaN(companyId),
  });
  const openPending = (repDash as any)?.openManifestPending ?? 0;

  return (
    <div className="pt-3 space-y-4">
      {!repUserId ? (
        <div className="py-16 text-center">
          <Wallet className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground text-sm">لا يوجد حساب مندوب مرتبط بهذه الشركة</p>
        </div>
      ) : (
        <>
          {/* ── كارت الرصيد الحالي ── */}
          <div className="rounded-2xl p-5 relative overflow-hidden"
            style={{
              background: "linear-gradient(145deg, rgba(52,211,153,0.13) 0%, rgba(45,212,191,0.06) 50%, rgba(0,0,0,0.15) 100%)",
              border: "1px solid rgba(52,211,153,0.3)",
            }}>
            <span className="absolute -top-8 -left-8 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(52,211,153,0.14) 0%, transparent 70%)" }} />
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)" }}>
                  <Wallet className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium">المستحق على المندوب للشركة (البيان المفتوح)</p>
                  <p className="text-2xl font-black text-emerald-400 leading-tight">{formatCurrency(currentBalance)}</p>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">المحصَّل من العملاء − تكلفة الشحن · يُصفَّر عند قفل البيان</p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground">{(repAccount as any)?.displayName ?? "المندوب"}</p>
                <Badge variant="outline" className="text-[9px] font-bold border-emerald-800 bg-emerald-900/30 text-emerald-400 mt-1">
                  نشط
                </Badge>
              </div>
            </div>
          </div>

          {/* ── إجمالي التصفيات (أرشيف) ── */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                <DollarSign className="w-3 h-3" />المطلوب المتبقي
              </p>
              <p className="text-xl font-black text-amber-400">{formatCurrency(openPending)}</p>
            </Card>
            <Card className="border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                <DollarSign className="w-3 h-3" />إجمالي المُصفّى
              </p>
              <p className="text-xl font-black text-primary">{formatCurrency(totalSettled)}</p>
            </Card>
            <Card className="border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                <History className="w-3 h-3" />عدد التصفيات
              </p>
              <p className="text-xl font-black">{walletTransactions.length}</p>
            </Card>
          </div>

          {/* ── سجل التصفيات ── */}
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />سجل تصفية البيانات
            </p>
            {walletLoading ? (
              <div className="py-10 text-center text-muted-foreground text-sm animate-pulse">جاري التحميل...</div>
            ) : walletTransactions.length === 0 ? (
              <div className="py-14 text-center">
                <History className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground text-sm">لا توجد تصفيات مسجّلة بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {walletTransactions.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-emerald-900/20 border border-emerald-800/40">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">
                          {t.manifestNumber ? `تقفيل بيان ${t.manifestNumber}` : "تصفية رصيد"}
                        </p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          {format(new Date(t.createdAt), "yyyy/MM/dd - HH:mm")}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-emerald-400 shrink-0">{formatCurrency(Number(t.amount))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
