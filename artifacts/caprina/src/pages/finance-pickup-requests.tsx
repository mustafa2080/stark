import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Truck, Phone, MapPin, Package, Calendar, RefreshCw, AlertTriangle, User, Clock, CheckCircle2, Ban, Truck as TruckIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface AdminPickupRequest {
  id: number;
  requestNumber: string | null;
  pickupContactName: string;
  pickupPhone: string;
  pickupAddress: string;
  pickupCity: string | null;
  piecesCount: number | null;
  estimatedWeight: string | null;
  notes: string | null;
  preferredDate: string | null;
  preferredTimeSlot: string | null;
  status: string;
  rejectionReason: string | null;
  portalClientId: number | null;
  clientName: string;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending:   { label: "بانتظار الموافقة", color: "amber",   icon: Clock },
  approved:  { label: "تمت الموافقة",     color: "blue",    icon: CheckCircle2 },
  assigned:  { label: "تم تعيين مندوب",   color: "violet",  icon: TruckIcon },
  picked_up: { label: "تم الاستلام",       color: "green",   icon: CheckCircle2 },
  cancelled: { label: "ملغي",             color: "slate",   icon: Ban },
  rejected:  { label: "مرفوض",            color: "red",     icon: AlertTriangle },
};

const TIME_SLOTS: Record<string, string> = {
  morning: "صباحاً (9 - 12)", afternoon: "ظهراً (12 - 4)", evening: "مساءً (4 - 8)",
};

const STATUS_FILTERS = [
  { value: "all",       label: "الكل" },
  { value: "pending",   label: "بانتظار الموافقة" },
  { value: "approved",  label: "تمت الموافقة" },
  { value: "assigned",  label: "تم تعيين مندوب" },
  { value: "picked_up", label: "تم الاستلام" },
  { value: "cancelled", label: "ملغي" },
  { value: "rejected",  label: "مرفوض" },
];

function colorClasses(color: string) {
  const map: Record<string, string> = {
    amber:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800",
    green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800",
    slate:  "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-800",
    red:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800",
  };
  return map[color] ?? map.slate;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function FinancePickupRequestsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  // نجيب كل الطلبات مرة واحدة (بدون فلترة سيرفر) عشان نقدر نعرض عداد لكل حالة
  // في شريط التابات، والتبديل بين الحالات يبقى فوري من غير ريكوست جديد.
  const { data, isLoading, isError, error, refetch } = useQuery<{ data: AdminPickupRequest[]; total: number }>({
    queryKey: ["finance-pickup-requests"],
    queryFn: () => apiFetch(`/finance/pickup-requests`),
    staleTime: 15_000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/finance/pickup-requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      toast({ title: "تم تحديث حالة الطلب" });
      queryClient.invalidateQueries({ queryKey: ["finance-pickup-requests"] });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const allRequests = data?.data ?? [];
  const pendingCount = allRequests.filter(r => r.status === "pending").length;

  // عداد لكل حالة عشان يتعرض جنب اسمها في شريط التابات
  const countsByStatus: Record<string, number> = { all: allRequests.length };
  for (const r of allRequests) countsByStatus[r.status] = (countsByStatus[r.status] ?? 0) + 1;

  const requests = statusFilter === "all" ? allRequests : allRequests.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
          <Truck className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">طلبات الالتقاط</h1>
          <p className="text-base text-muted-foreground">طلبات استلام الشحنات المرسلة من العملاء</p>
        </div>
        <div className="mr-auto flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-sm">{allRequests.length} طلب</Badge>
          {pendingCount > 0 && statusFilter !== "pending" && (
            <Badge className="text-sm bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              {pendingCount} بانتظار الموافقة
            </Badge>
          )}
          <Button variant="outline" size="sm" className="h-9 text-sm gap-1.5" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </div>

      {/* شريط فلتر الحالات — تابات ثابتة فوق عشان تعرف الطلبات الحالية من غير نزول لتحت */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => {
            const isActive = statusFilter === f.value;
            const count = countsByStatus[f.value] ?? 0;
            const meta = f.value === "all" ? null : STATUS_META[f.value];
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? meta
                      ? colorClasses(meta.color) + " border-current"
                      : "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {f.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs font-bold leading-none",
                  isActive ? "bg-current/15" : "bg-muted-foreground/10"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <p className="font-medium text-red-600">تعذّر تحميل البيانات</p>
            <p className="text-xs text-center opacity-70">{error instanceof Error ? error.message : "خطأ في الاتصال بالسيرفر"}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 ml-1.5" />
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      )}

      {!isError && isLoading ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <Truck className="h-8 w-8 animate-bounce" />
          <p className="text-sm">جاري التحميل...</p>
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Package className="h-10 w-10 opacity-30" />
            <p className="font-medium">لا توجد طلبات التقاط</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const meta = STATUS_META[r.status] ?? STATUS_META.pending;
            const Icon = meta.icon;
            return (
              <div key={r.id} className={`rounded-xl border p-4 space-y-3 ${colorClasses(meta.color)}`}>
                {/* هيدر */}
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono opacity-60">{r.requestNumber || `#${r.id}`}</span>
                    <Badge className="text-sm gap-1 font-bold border-current bg-current/10 px-2.5 py-1">
                      <Icon className="h-4 w-4" />
                      {meta.label}
                    </Badge>
                    <span className="text-xs opacity-60">{formatDate(r.createdAt)}</span>
                  </div>
                  <Select
                    value={r.status}
                    onValueChange={(status) => updateStatusMutation.mutate({ id: r.id, status })}
                  >
                    <SelectTrigger className="h-8 text-sm w-[160px] bg-white/50 dark:bg-black/20 border-current">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_META).map(([value, m]) => (
                        <SelectItem key={value} value={value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* اسم العميل + الهاتف */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2.5 border-b border-current/15">
                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-current/10 border border-current/20">
                      <User className="h-5 w-5 opacity-80" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-wide opacity-50 mb-0.5">اسم العميل</div>
                      <div className="font-bold text-base truncate">{r.clientName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-current/10 border border-current/20">
                      <Phone className="h-5 w-5 opacity-80" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-wide opacity-50 mb-0.5">رقم الهاتف</div>
                      <a href={`tel:${r.pickupPhone}`} className="font-bold text-base truncate hover:underline block">{r.pickupPhone}</a>
                    </div>
                  </div>
                </div>

                {/* العنوان */}
                <div className="flex items-start gap-2 text-sm opacity-80">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 opacity-60" />
                  <span className="leading-relaxed">{r.pickupAddress}{r.pickupCity ? ` - ${r.pickupCity}` : ""}</span>
                </div>

                {/* عدد الشحنات + معاد الاستلام */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-lg bg-current/5 border border-current/10 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-xs uppercase tracking-wide opacity-50 mb-1">
                      <Package className="h-3.5 w-3.5" />
                      عدد الشحنات
                    </div>
                    <div className="text-base font-bold truncate">{r.piecesCount ?? 1}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-xs uppercase tracking-wide opacity-50 mb-1">
                      <Calendar className="h-3.5 w-3.5" />
                      معاد الاستلام
                    </div>
                    <div className="text-base font-medium truncate">
                      {r.preferredDate
                        ? new Date(r.preferredDate).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })
                        : <span className="opacity-50">غير محدد</span>}
                      {r.preferredTimeSlot && ` - ${TIME_SLOTS[r.preferredTimeSlot] ?? ""}`}
                    </div>
                  </div>
                  {r.estimatedWeight && (
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-xs uppercase tracking-wide opacity-50 mb-1">
                        الوزن التقريبي
                      </div>
                      <div className="text-base font-medium truncate">{r.estimatedWeight} كجم</div>
                    </div>
                  )}
                </div>

                {r.notes && (
                  <div className="flex items-start gap-2 text-sm opacity-70">
                    <span className="opacity-50 shrink-0">ملاحظات:</span>
                    <span className="leading-relaxed">{r.notes}</span>
                  </div>
                )}

                {r.status === "rejected" && r.rejectionReason && (
                  <div className="text-sm text-red-700 dark:text-red-300">
                    سبب الرفض: {r.rejectionReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
