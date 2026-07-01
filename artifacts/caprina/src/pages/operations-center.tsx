import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { analyticsApi, type OperationsCenterResponse } from "@/lib/api";
import {
  Clock, AlertTriangle, Truck, PhoneCall, RefreshCw,
  MapPin, CircleDot, PackageCheck, PackageX,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fc = (n: string | number | null) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n ?? 0));

const STATUS_LABELS: Record<string, string> = {
  in_shipping: "قيد الشحن",
  warehouse_ready: "قيد الشحن في المخزن",
};
const STATUS_CLASSES: Record<string, string> = {
  in_shipping: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  warehouse_ready: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = Math.round(diffMs / (1000 * 60 * 60));
  if (hrs < 1) return "الآن";
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.round(hrs / 24);
  return `منذ ${days} يوم`;
}

// ─── كارت ملخص علوي (5 كروت) ─────────────────────────────────────────────────
function SummaryCard({
  icon: Icon, label, value, color, bg, border, sub,
}: {
  icon: any; label: string; value: number; color: string; bg: string; border: string; sub?: string;
}) {
  return (
    <Card className={`border ${border} bg-card overflow-hidden`}>
      <CardContent className="p-3.5 sm:p-4 flex items-center gap-3">
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs text-muted-foreground font-bold truncate">{label}</p>
          <p className={`text-xl sm:text-2xl font-black ${color}`}>{value}</p>
          {sub && <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── قسم: الشحنات المتأخرة (🔴) ──────────────────────────────────────────────
function DelayedShipmentsSection({ data }: { data: OperationsCenterResponse }) {
  return (
    <Card className="border-red-500/15 bg-card overflow-hidden">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-red-500" />
            </div>
            <h2 className="text-sm font-bold text-foreground">الشحنات المتأخرة</h2>
            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
              {data.summary.delayedCount}
            </span>
          </div>
        </div>
        {data.delayedShipments.length === 0 ? (
          <EmptyState text="لا توجد شحنات متأخرة حاليًا 🎉" />
        ) : (
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {data.delayedShipments.map((s) => (
              <Link key={s.id} href={`/shipments/${s.id}`}>
                <div className="flex items-center justify-between gap-2 rounded-lg p-2.5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-colors cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground truncate">{s.receiverName}</span>
                      {s.trackingNumber && <span className="text-[10px] text-muted-foreground shrink-0">#{s.trackingNumber}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      {s.receiverCity && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{s.receiverCity}</span>}
                      <span>{fc(s.totalAmount)}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-red-400 bg-red-500/10 rounded-full px-2 py-1 shrink-0">
                    منذ {s.delayedHours} س
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── قسم: الشحنات اللي فيها مشكلة (🟠) ───────────────────────────────────────
function ProblemShipmentsSection({ data }: { data: OperationsCenterResponse }) {
  return (
    <Card className="border-amber-500/15 bg-card overflow-hidden">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <h2 className="text-sm font-bold text-foreground">شحنات فيها مشكلة</h2>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              {data.summary.problemCount}
            </span>
          </div>
        </div>
        {data.problemShipments.length === 0 ? (
          <EmptyState text="لا توجد شحنات بها مشاكل 👍" />
        ) : (
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {data.problemShipments.map((s) => (
              <Link key={s.id} href={`/shipments/${s.id}`}>
                <div className="flex items-center justify-between gap-2 rounded-lg p-2.5 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 transition-colors cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground truncate">{s.receiverName}</span>
                      {s.trackingNumber && <span className="text-[10px] text-muted-foreground shrink-0">#{s.trackingNumber}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      {s.receiverCity && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{s.receiverCity}</span>}
                      <span>{fc(s.totalAmount)}</span>
                    </div>
                  </div>
                  <PackageX className="w-4 h-4 text-amber-500 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── قسم: شحنات خارجة اليوم (🟢) ─────────────────────────────────────────────
function OutTodaySection({ data }: { data: OperationsCenterResponse }) {
  return (
    <Card className="border-emerald-500/15 bg-card overflow-hidden">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <PackageCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <h2 className="text-sm font-bold text-foreground">شحنات خارجة اليوم</h2>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              {data.summary.outTodayCount}
            </span>
          </div>
        </div>
        {data.outToday.length === 0 ? (
          <EmptyState text="لا توجد شحنات خارجة اليوم بعد" />
        ) : (
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {data.outToday.map((s) => (
              <Link key={s.id} href={`/shipments/${s.id}`}>
                <div className="flex items-center justify-between gap-2 rounded-lg p-2.5 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 transition-colors cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground truncate">{s.receiverName}</span>
                      {s.trackingNumber && <span className="text-[10px] text-muted-foreground shrink-0">#{s.trackingNumber}</span>}
                    </div>
                    {s.receiverCity && (
                      <div className="flex items-center gap-0.5 mt-0.5 text-[10px] text-muted-foreground">
                        <MapPin className="w-2.5 h-2.5" />{s.receiverCity}
                      </div>
                    )}
                  </div>
                  <span className={`text-[9px] font-bold rounded-full px-2 py-1 border shrink-0 ${STATUS_CLASSES[s.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── قسم: المندوبين الموجودين حاليًا (🚚) ────────────────────────────────────
function RepresentativesSection({ data }: { data: OperationsCenterResponse }) {
  return (
    <Card className="border-sky-500/15 bg-card overflow-hidden">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Truck className="w-4 h-4 text-sky-500" />
            </div>
            <h2 className="text-sm font-bold text-foreground">المندوبين</h2>
            <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded-full px-2 py-0.5">
              {data.summary.onlineRepsCount} / {data.summary.totalRepsCount} متصل
            </span>
          </div>
        </div>
        {data.representatives.length === 0 ? (
          <EmptyState text="لا يوجد مندوبين مسجلين بعد" />
        ) : (
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {data.representatives.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg p-2.5 bg-muted/30 border border-border/40">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center text-xs font-bold text-sky-400">
                      {r.displayName?.[0] ?? "؟"}
                    </div>
                    <CircleDot className={`w-3 h-3 absolute -bottom-0.5 -left-0.5 ${r.isOnline ? "text-emerald-500 fill-emerald-500" : "text-muted-foreground fill-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{r.displayName}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {r.activeShipments} نشطة · نجاح {r.successRate}%
                    </p>
                  </div>
                </div>
                <span className={`text-[9px] font-bold rounded-full px-2 py-1 shrink-0 ${r.isOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                  {r.isOnline ? "متصل الآن" : "غير متصل"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── قسم: عملاء يحتاجون متابعة (📞) ──────────────────────────────────────────
function FollowupClientsSection({ data }: { data: OperationsCenterResponse }) {
  return (
    <Card className="border-purple-500/15 bg-card overflow-hidden">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <PhoneCall className="w-4 h-4 text-purple-500" />
            </div>
            <h2 className="text-sm font-bold text-foreground">عملاء يحتاجون متابعة</h2>
            <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-full px-2 py-0.5">
              {data.summary.followupCount}
            </span>
          </div>
        </div>
        {data.clientsNeedingFollowup.length === 0 ? (
          <EmptyState text="لا يوجد عملاء بحاجة لمتابعة الآن 👍" />
        ) : (
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {data.clientsNeedingFollowup.map((c) => (
              <div key={c.clientName} className="flex items-center justify-between gap-2 rounded-lg p-2.5 bg-purple-500/5 border border-purple-500/10">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">{c.clientName}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{timeAgo(c.lastIssueAt)}</p>
                </div>
                <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 rounded-full px-2 py-1 shrink-0">
                  {c.issueCount} مشاكل
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Empty state موحّد ────────────────────────────────────────────────────────
function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function SectionSkeleton() {
  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardContent className="p-3.5 sm:p-4 space-y-2">
        <div className="h-6 w-32 bg-muted/40 rounded animate-pulse mb-2" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </CardContent>
    </Card>
  );
}

// ─── الصفحة الرئيسية: مركز العمليات ───────────────────────────────────────────
export default function OperationsCenterPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["operations-center"],
    queryFn: analyticsApi.operationsCenter,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev: OperationsCenterResponse | undefined) => prev,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="space-y-4 sm:space-y-5" dir="rtl">
      {/* ── رأس الصفحة ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-foreground">مركز العمليات</h1>
          <p className="text-xs text-muted-foreground mt-0.5">نظرة تشغيلية شاملة على كل ما يحتاج انتباهك الآن</p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 rounded-lg px-3 py-2 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {isLoading && !data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted/30 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 5 }).map((_, i) => <SectionSkeleton key={i} />)}
          </div>
        </>
      ) : !data ? (
        <Card className="border-border bg-card">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            تعذّر تحميل بيانات مركز العمليات
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── صف الملخص: 5 كروت (متأخرة/مشكلة/خارجة/مندوبين/متابعة) ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            <SummaryCard icon={Clock} label="شحنات متأخرة" value={data.summary.delayedCount}
              color="text-red-500" bg="bg-red-500/10" border="border-red-500/15" />
            <SummaryCard icon={AlertTriangle} label="شحنات بها مشكلة" value={data.summary.problemCount}
              color="text-amber-500" bg="bg-amber-500/10" border="border-amber-500/15" />
            <SummaryCard icon={PackageCheck} label="شحنات خارجة اليوم" value={data.summary.outTodayCount}
              color="text-emerald-500" bg="bg-emerald-500/10" border="border-emerald-500/15" />
            <SummaryCard icon={Truck} label="مندوبين متصلين" value={data.summary.onlineRepsCount}
              color="text-sky-500" bg="bg-sky-500/10" border="border-sky-500/15" sub={`من ${data.summary.totalRepsCount}`} />
            <SummaryCard icon={PhoneCall} label="عملاء يحتاجون متابعة" value={data.summary.followupCount}
              color="text-purple-500" bg="bg-purple-500/10" border="border-purple-500/15" />
          </div>

          {/* ── الشبكة الرئيسية: القوائم التفصيلية الخمسة ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <DelayedShipmentsSection data={data} />
            <ProblemShipmentsSection data={data} />
            <OutTodaySection data={data} />
            <RepresentativesSection data={data} />
            <FollowupClientsSection data={data} />
          </div>
        </>
      )}
    </div>
  );
}
