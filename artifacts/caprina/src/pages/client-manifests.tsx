import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import {
  FileText, ChevronLeft, Lock, LockOpen, Package,
  CheckCircle2, Clock, RotateCcw, AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface ClientPortalManifestListItem {
  id: number;
  manifestNumber: string;
  status: "open" | "closed";
  notes: string | null;
  invoicePrice: string | null;
  shipmentCount: number;
  statusCounts: { pending: number; delayed: number; returned: number; delivered: number; partial: number };
  createdAt: string;
  closedAt: string | null;
}

export default function ClientManifestsPage() {
  const { data: manifests, isLoading } = useQuery<ClientPortalManifestListItem[]>({
    queryKey: ["client-portal-manifests"],
    queryFn: () => apiFetch("/client-portal/manifests"),
    staleTime: 15_000,
  });

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

        {/* ── List ── */}
        {isLoading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">جاري التحميل...</div>
        ) : !manifests || manifests.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-muted/25 border border-border">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">لا توجد بيانات شحن بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {manifests.map((m) => (
              <ManifestCard key={m.id} manifest={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ManifestCard({ manifest }: { manifest: ClientPortalManifestListItem }) {
  const sc = manifest.statusCounts;
  const total = manifest.shipmentCount;
  const completed = (sc.delivered ?? 0) + (sc.partial ?? 0);
  const deliveryPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isOpen = manifest.status === "open";

  return (
    <Link href={`/client-manifests/${manifest.id}`}>
      <div className="group cursor-pointer rounded-2xl border border-border bg-muted/20 hover:bg-muted/35 hover:border-primary/40 transition-all p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isOpen ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-sm truncate">{manifest.manifestNumber}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  isOpen
                    ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800"
                    : "bg-muted text-muted-foreground border border-border"
                }`}>
                  {isOpen ? <LockOpen className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                  {isOpen ? "مفتوح" : "مغلق"}
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

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
          <MiniStat icon={Package} value={total} label="إجمالي" />
          <MiniStat icon={CheckCircle2} value={sc.delivered ?? 0} label="مسلَّم" tone="emerald" />
          <MiniStat icon={Clock} value={sc.pending ?? 0} label="قيد الانتظار" tone="muted" />
          <MiniStat icon={AlertCircle} value={sc.delayed ?? 0} label="مؤجل" tone="orange" />
          <MiniStat icon={RotateCcw} value={sc.returned ?? 0} label="مرتجع" tone="red" />
        </div>

        {/* ── Progress bar ── */}
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

function MiniStat({ icon: Icon, value, label, tone = "default" }: {
  icon: React.ElementType; value: number; label: string;
  tone?: "default" | "emerald" | "orange" | "red" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    emerald: "text-emerald-400",
    orange: "text-orange-400",
    red: "text-red-400",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-background/40 border border-border/40">
      <Icon className={`w-3.5 h-3.5 ${toneClass}`} />
      <span className={`text-sm font-black ${toneClass}`}>{value}</span>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}
