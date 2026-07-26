import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
}

// ─────────────────────────────────────────────────────────────────────────
// حساب أقرب تاريخ إغلاق (أحد أو أربعاء) اعتمادًا على اليوم الحالي
// الأحد = 0, الأربعاء = 3 في getDay()
// ─────────────────────────────────────────────────────────────────────────
function getNextClosingDate(from: Date = new Date()): Date {
  const day = from.getDay();
  const daysUntil = (target: number) => {
    const diff = (target - day + 7) % 7;
    return diff === 0 ? 0 : diff;
  };
  const untilSunday = daysUntil(0);
  const untilWednesday = daysUntil(3);

  if (untilSunday === 0 || untilWednesday === 0) {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate());
  }

  const nearest = Math.min(untilSunday, untilWednesday);
  const result = new Date(from);
  result.setDate(from.getDate() + nearest);
  return result;
}

function isClosingToday(from: Date = new Date()): boolean {
  const day = from.getDay();
  return day === 0 || day === 3;
}

// ─────────────────────────────────────────────────────────────────────────
// تتبع "تم صرف الإيراد" — محلي فقط (localStorage) لحد ما يتضاف تسجيل فعلي بالباك إند
// ─────────────────────────────────────────────────────────────────────────
const DISBURSED_KEY = "client_manifests_disbursed_ids";

function getDisbursedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(DISBURSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function markDisbursed(id: number) {
  const current = getDisbursedIds();
  current.add(id);
  localStorage.setItem(DISBURSED_KEY, JSON.stringify(Array.from(current)));
}

export default function ClientManifestsPage() {
  const { data: manifests, isLoading } = useQuery<ClientPortalManifestListItem[]>({
    queryKey: ["client-portal-manifests"],
    queryFn: () => apiFetch("/client-portal/manifests"),
    staleTime: 15_000,
  });

  const [disbursedIds, setDisbursedIds] = useState<Set<number>>(() => getDisbursedIds());

  const handleDisburse = (id: number) => {
    markDisbursed(id);
    setDisbursedIds(getDisbursedIds());
  };

  const { openManifest, recentlyClosedManifests, archivedManifests } = useMemo(() => {
    if (!manifests) return { openManifest: null, recentlyClosedManifests: [], archivedManifests: [] };

    const open = manifests.find((m) => m.status === "open") ?? null;
    const closed = manifests.filter((m) => m.status === "closed");

    const recentlyClosed = closed.filter((m) => !disbursedIds.has(m.id));
    const archived = closed.filter((m) => disbursedIds.has(m.id));

    return { openManifest: open, recentlyClosedManifests: recentlyClosed, archivedManifests: archived };
  }, [manifests, disbursedIds]);

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
                  <RecentlyClosedCard key={m.id} manifest={m} onDisburse={() => handleDisburse(m.id)} />
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
  const sc = manifest.statusCounts;
  const total = manifest.shipmentCount;
  const completed = (sc.delivered ?? 0) + (sc.partial ?? 0);
  const deliveryPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const closingToday = isClosingToday();
  const closingDate = getNextClosingDate();
  const closingDayLabel = format(closingDate, "EEEE", { locale: ar });

  return (
    <Link href={`/client-manifests/${manifest.id}`}>
      <div className="group cursor-pointer relative overflow-hidden rounded-2xl border border-emerald-700/40 bg-gradient-to-br from-emerald-950/20 via-muted/20 to-transparent hover:border-emerald-600/60 transition-all p-4 sm:p-5">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full blur-3xl opacity-30 bg-emerald-500/30" />

        <div className="relative flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Hourglass className="w-3.5 h-3.5 text-amber-400 animate-[spin_2.5s_linear_infinite]" />
            <span className="text-[11px] font-bold text-amber-300">
              {closingToday
                ? "البيان حالياً قيد العمل — سيتم إغلاق البيان خلال ساعات"
                : `البيان حالياً قيد العمل — سيتم الإغلاق يوم ${closingDayLabel} القادم`}
            </span>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
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

        <div className="relative grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <MiniStat icon={Package} value={total} label="إجمالي الأوردرات" />
          <MiniStat icon={CheckCircle2} value={sc.delivered ?? 0} label="مُسلَّم" tone="emerald" loading />
          <MiniStat icon={Clock} value={sc.delayed ?? 0} label="مؤجل" tone="orange" loading />
          <MiniStat icon={RotateCcw} value={sc.returned ?? 0} label="مرتجع" tone="red" loading />
          <MiniStat icon={PackageCheck} value={sc.partial ?? 0} label="استلم جزء" tone="teal" loading />
          <MiniStat icon={PackageX} value={sc.returned ?? 0} label="مرتجع لم يصل" tone="rose" loading />
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
      </div>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// البيان المغلق حديثًا — كارت مصغر + زرار صرف الإيراد
// ═══════════════════════════════════════════════════════════════════════
function RecentlyClosedCard({ manifest, onDisburse }: { manifest: ClientPortalManifestListItem; onDisburse: () => void }) {
  const [showNotice, setShowNotice] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDisburse();
    setShowNotice(true);
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
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-sky-600 hover:bg-sky-500 transition-colors"
        >
          <Wallet className="w-3.5 h-3.5" /> صرف الإيراد
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
