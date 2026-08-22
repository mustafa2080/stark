import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import {
  FileText, ChevronLeft, Lock, LockOpen, Package,
  CheckCircle2, Clock, RotateCcw, AlertCircle, Hourglass,
  Wallet, PackageX, PackageCheck,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ClientPortalManifestListItem {
  id: number;
  manifestNumber: string;
  status: "open" | "closed";
  notes: string | null;
  invoicePrice: string | null;
  shipmentCount: number;
  statusCounts: {
    pending: number; shipping: number; delayed: number;
    returned: number; delivered: number; partial: number;
  };
  createdAt: string;
  closedAt: string | null;
  scheduledCloseAt: string | null;
  revenueDisbursementRequestedAt: string | null;
  pendingShipmentsCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// هل موعد الإغلاق المجدول اليوم أو قبل النهاردة (يعني هيتقفل خلال ساعات)؟
// ─────────────────────────────────────────────────────────────────────────
function isClosingSoon(scheduledCloseAt: string | null): boolean {
  if (!scheduledCloseAt) return false;
  const target = new Date(scheduledCloseAt);
  const now = new Date();
  const startOfTargetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return startOfTargetDay.getTime() <= startOfToday.getTime();
}

export default function ClientManifestsPage() {
  const queryClient = useQueryClient();
  const { data: manifests, isLoading } = useQuery<ClientPortalManifestListItem[]>({
    queryKey: ["client-portal-manifests"],
    queryFn: () => apiFetch("/client-portal/manifests"),
    staleTime: 15_000,
  });

  const disburseMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/client-portal/manifests/${id}/request-disbursement`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-portal-manifests"] });
    },
  });

  const { openManifest, recentlyClosedManifests, archivedManifests } = useMemo(() => {
    if (!manifests) return { openManifest: null, recentlyClosedManifests: [], archivedManifests: [] };

    const open = manifests.find((m) => m.status === "open") ?? null;
    const closed = manifests.filter((m) => m.status === "closed");

    const recentlyClosed = closed.filter((m) => !m.revenueDisbursementRequestedAt);
    const archived = closed.filter((m) => !!m.revenueDisbursementRequestedAt);

    return { openManifest: open, recentlyClosedManifests: recentlyClosed, archivedManifests: archived };
  }, [manifests]);

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[1000px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            بياناتي
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            قائمة بيانات الشحن الخاصة بحسابك — اضغط على أي بيان لعرض تفاصيله
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">جاري التحميل...</div>
        ) : !manifests || manifests.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-muted/25 border border-border">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">لا توجد بيانات شحن بعد</p>
          </div>
        ) : (
          <div className="space-y-5">
            {openManifest && <OpenManifestCard manifest={openManifest} />}

            {recentlyClosedManifests.length > 0 && (
              <div className="space-y-2.5">
                {recentlyClosedManifests.map((m) => (
                  <RecentlyClosedCard
                    key={m.id}
                    manifest={m}
                    onDisburse={() => disburseMutation.mutate(m.id)}
                    isPending={disburseMutation.isPending && disburseMutation.variables === m.id}
                  />
                ))}
              </div>
            )}

            {archivedManifests.length > 0 && (
              <div className="space-y-3">
                {(openManifest || recentlyClosedManifests.length > 0) && (
                  <p className="text-xs font-bold text-muted-foreground/70 pt-2">البيانات المغلقة</p>
                )}
                <div className="space-y-3">
                  {archivedManifests.map((m) => (
                    <ArchivedManifestCard key={m.id} manifest={m} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// البيان المفتوح — كارت كبير مع ساعة رملية متحركة وتاريخ الإغلاق التلقائي
// ═══════════════════════════════════════════════════════════════════════
function OpenManifestCard({ manifest }: { manifest: ClientPortalManifestListItem }) {
  const { toast } = useToast();
  const sc = manifest.statusCounts;
  const total = manifest.shipmentCount;
  const completed = (sc.delivered ?? 0) + (sc.partial ?? 0);
  const deliveryPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const closingSoon = isClosingSoon(manifest.scheduledCloseAt);
  const closingDayLabel = manifest.scheduledCloseAt
    ? format(new Date(manifest.scheduledCloseAt), "EEEE", { locale: ar })
    : null;

  const handleClick = () => {
    toast({
      title: "البيان لم يغلق بعد",
      description: "البيان لم يغلق بعد من طرف المدير يرجى انتظار اغلاقه",
      variant: "destructive",
    });
  };

  return (
    <div
      onClick={handleClick}
      className="group cursor-not-allowed relative overflow-hidden rounded-2xl border border-emerald-700/40 bg-gradient-to-br from-emerald-950/20 via-muted/20 to-transparent opacity-70 transition-all p-4 sm:p-5"
    >
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full blur-3xl opacity-30 bg-emerald-500/30" />

        <div className="relative flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Hourglass className="w-3.5 h-3.5 text-amber-400 animate-[spin_2.5s_linear_infinite]" />
            <span className="text-[11px] font-bold text-amber-300">
              {closingSoon || !closingDayLabel
                ? "البيان حالياً قيد العمل — سيتم إغلاق البيان خلال ساعات"
                : `البيان حالياً قيد العمل — سيتم الإغلاق يوم ${closingDayLabel} القادم`}
            </span>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground/30" />
        </div>

        <div className="relative flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-sm truncate">{manifest.manifestNumber}</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-emerald-900/30 text-emerald-400 border border-emerald-800">
                <LockOpen className="w-2.5 h-2.5" /> مفتوح
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}
            </p>
          </div>
        </div>

        <div className="relative grid grid-cols-2 sm:grid-cols-5 gap-2">
          <MiniStat icon={Package} value={total} label="إجمالي" />
          <MiniStat icon={CheckCircle2} value={sc.delivered ?? 0} label="مسلَّم" tone="emerald" />
          <MiniStat icon={Clock} value={sc.pending ?? 0} label="قيد الانتظار" tone="muted" />
          <MiniStat icon={AlertCircle} value={sc.delayed ?? 0} label="مؤجل" tone="orange" />
          <MiniStat icon={RotateCcw} value={sc.returned ?? 0} label="مرتجع" tone="red" />
        </div>

        {total > 0 && (
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>نسبة التسليم</span>
              <span className="font-bold text-foreground">{deliveryPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deliveryPct}%` }} />
            </div>
          </div>
        )}

        {!!manifest.pendingShipmentsCount && manifest.pendingShipmentsCount > 0 && (
          <div className="relative mt-3 flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2">
            <PackageX className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-bold text-amber-300">
              لديك {manifest.pendingShipmentsCount} شحنة معلّقة ستُضاف تلقائيًا للبيان القادم عند إغلاق هذا البيان
            </span>
          </div>
        )}
      </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// البيان المغلق حديثًا — كارت مصغر + زرار صرف الإيراد
// ═══════════════════════════════════════════════════════════════════════
function RecentlyClosedCard({ manifest, onDisburse, isPending }: {
  manifest: ClientPortalManifestListItem; onDisburse: () => void; isPending: boolean;
}) {
  const [justRequested, setJustRequested] = useState(false);
  const showNotice = justRequested || !!manifest.revenueDisbursementRequestedAt;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (manifest.revenueDisbursementRequestedAt || isPending) return;
    onDisburse();
    setJustRequested(true);
  };

  return (
    <div className="rounded-xl border border-sky-700/40 bg-gradient-to-l from-sky-950/15 via-muted/15 to-transparent p-3.5 flex items-center justify-between gap-3 flex-wrap">
      <Link href={`/client-manifests/${manifest.id}`} className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-sky-500/10 text-sky-400">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-xs truncate">{manifest.manifestNumber}</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-900/30 text-sky-400 border border-sky-800">
              تم ترحيل الإيرادات للرصيد
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {manifest.closedAt && `أُغلق في ${format(new Date(manifest.closedAt), "d MMMM yyyy", { locale: ar })}`}
            {manifest.invoicePrice && ` — ${formatCurrency(Number(manifest.invoicePrice))}`}
          </p>
        </div>
      </Link>

      {!showNotice ? (
        <button
          onClick={handleClick}
          disabled={isPending}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 transition-colors"
        >
          <Wallet className="w-3.5 h-3.5" /> {isPending ? "جارِ الإرسال..." : "صرف الإيراد"}
        </button>
      ) : (
        <div className="shrink-0 max-w-[260px] text-[10px] text-sky-300 bg-sky-950/30 border border-sky-800/50 rounded-lg px-3 py-2 leading-relaxed">
          سيتم ترحيل الإيراد خلال 24 ساعة عبر مندوب أو محفظة فودافون كاش، وسيتم التواصل مع سيادتكم من أحد فريق العمل.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// البيانات المغلقة القديمة — نفس الشكل الأصلي
// ═══════════════════════════════════════════════════════════════════════
function ArchivedManifestCard({ manifest }: { manifest: ClientPortalManifestListItem }) {
  const sc = manifest.statusCounts;
  const total = manifest.shipmentCount;
  const completed = (sc.delivered ?? 0) + (sc.partial ?? 0);
  const deliveryPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Link href={`/client-manifests/${manifest.id}`}>
      <div className="group cursor-pointer rounded-2xl border border-border bg-muted/20 hover:bg-muted/35 hover:border-primary/40 transition-all p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-sm truncate">{manifest.manifestNumber}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-muted text-muted-foreground border border-border">
                  <Lock className="w-2.5 h-2.5" /> مغلق — تم إغلاقه
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}
                {manifest.closedAt && ` — أُغلق في ${format(new Date(manifest.closedAt), "d MMMM yyyy", { locale: ar })}`}
              </p>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
          <MiniStat icon={Package} value={total} label="إجمالي" />
          <MiniStat icon={CheckCircle2} value={sc.delivered ?? 0} label="مسلَّم" tone="emerald" />
          <MiniStat icon={Clock} value={sc.pending ?? 0} label="قيد الانتظار" tone="muted" />
          <MiniStat icon={AlertCircle} value={sc.delayed ?? 0} label="مؤجل" tone="orange" />
          <MiniStat icon={RotateCcw} value={sc.returned ?? 0} label="مرتجع" tone="red" />
        </div>

        {total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>نسبة التسليم</span>
              <span className="font-bold text-foreground">{deliveryPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deliveryPct}%` }} />
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

function MiniStat({ icon: Icon, value, label, tone = "default", loading = false }: {
  icon: React.ElementType; value: number; label: string;
  tone?: "default" | "emerald" | "orange" | "red" | "muted" | "teal" | "rose";
  loading?: boolean;
}) {
  const toneClass = {
    default: "text-foreground",
    emerald: "text-emerald-400",
    orange: "text-orange-400",
    red: "text-red-400",
    muted: "text-muted-foreground",
    teal: "text-teal-400",
    rose: "text-rose-400",
  }[tone];
  return (
    <div className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-background/40 border border-border/40 relative">
      <Icon className={cn("w-3.5 h-3.5", toneClass)} />
      <span className={cn("text-sm font-black", toneClass)}>{value}</span>
      <span className="text-[9px] text-muted-foreground flex items-center gap-1">
        {label}
        {loading && <Clock className="w-2 h-2 animate-spin opacity-50" />}
      </span>
    </div>
  );
}
