import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, AlertTriangle, Phone, Package, Truck, Link2, RefreshCw, Hash, MessageCircle, CheckCircle2, MapPin, UserCircle2, FileText, Wallet, User } from "lucide-react";
import { analyticsApi, ordersApi, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { useState } from "react";
import { buildWhatsAppLink, formatEgyptianPhone, applyShippingTemplate, type WaSettings } from "@/lib/whatsapp";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function urgencyColor(days: number) {
  if (days >= 10) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800";
  if (days >= 7)  return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800";
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";
}

function urgencyLabel(days: number) {
  if (days >= 10) return "عاجل جداً";
  if (days >= 7)  return "عاجل";
  return "متأخر";
}

/** رسالة متابعة الشحن الافتراضية (fallback لو مفيش قالب) */
function buildDefaultShippingMessage(o: {
  id: number;
  customerName: string;
  product: string;
  trackingNumber?: string | null;
  shippingCompany?: string | null;
  daysPending: number;
}): string {
  const orderNum = o.id.toString().padStart(4, "0");
  const tracking = o.trackingNumber ? `• رقم التتبع: *${o.trackingNumber}*\n` : "";
  const company  = o.shippingCompany ? `• شركة الشحن: *${o.shippingCompany}*\n` : "";
  return (
    `السلام عليكم يا ${o.customerName},\n\n` +
    `بنتواصل معاكم من *CAPRINA* بخصوص طلبكم رقم *#${orderNum}*.\n\n` +
    `*تفاصيل الطلب:*\n` +
    `• المنتج: *${o.product}*\n` +
    `${company}${tracking}` +
    `• مدة الشحن: *${o.daysPending} يوم*\n\n` +
    `هل وصلكم الطلب بشكل سليم؟\n` +
    `لو عندكم أي استفسار إحنا دايماً هنا.\n\n` +
    `شكراً لثقتكم في CAPRINA`
  );
}

const FOLLOWED_KEY = "shippingFollowedUp";

export default function ShippingFollowupPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // تحميل الـ IDs اللي اتعملتلهم متابعة من localStorage
  const [followedIds, setFollowedIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(FOLLOWED_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const markFollowed = (id: number) => {
    setFollowedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(FOLLOWED_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const { data: orders = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["shipping-followup"],
    queryFn: analyticsApi.shippingFollowup,
    staleTime: 2 * 60 * 1000,
    throwOnError: false,
  });

  const { data: waSettings } = useQuery<WaSettings>({
    queryKey: ["whatsapp-settings"],
    queryFn: () => apiFetch<WaSettings>("/whatsapp/settings"),
    staleTime: 5 * 60 * 1000,
  });

  const shippingTemplate =
    waSettings?.templates?.find(t => t.name === "متابعة الشحن") ??
    waSettings?.templates?.find(t => t.isDefault) ??
    null;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const critical = orders.filter(o => o.daysPending >= 10);
  const urgent   = orders.filter(o => o.daysPending >= 7 && o.daysPending < 10);
  const late     = orders.filter(o => o.daysPending >= 3 && o.daysPending < 7);

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">متابعة الشحن</h1>
          <p className="text-sm text-muted-foreground">طلبات قيد الشحن منذ أكثر من 3 أيام</p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          <Badge variant="outline">{orders.length} طلب</Badge>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </div>

      {/* Summary Tiles */}
      {!isLoading && orders.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4 text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{critical.length}</div>
            <div className="text-xs text-red-700 dark:text-red-300 mt-1">عاجل جداً (+10 أيام)</div>
          </div>
          <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 p-4 text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{urgent.length}</div>
            <div className="text-xs text-orange-700 dark:text-orange-300 mt-1">عاجل (7-10 أيام)</div>
          </div>
          <div className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20 p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{late.length}</div>
            <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">متأخر (3-7 أيام)</div>
          </div>
        </div>
      )}

  {/* Error State */}
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

      {/* Orders List */}
      {!isError && isLoading ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <Truck className="h-8 w-8 animate-bounce" />
          <p className="text-sm">جاري التحميل...</p>
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <div className="text-4xl">✅</div>
            <p className="font-medium">كل الشحنات في الوقت المناسب!</p>
            <p className="text-sm text-center">لا توجد طلبات شحن متأخرة أكثر من 3 أيام</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o: any) => {
            const isFollowed = followedIds.has(o.id);
            return (
            <div
              key={o.id}
              className={`rounded-xl border p-4 space-y-3 ${urgencyColor(o.daysPending)}`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono opacity-60">#{o.id}</span>
                  {o.invoiceNumber && (
                    <span className="flex items-center gap-1 text-xs font-mono opacity-70">
                      <FileText className="h-3 w-3" />
                      {o.invoiceNumber}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className="text-xs border-current"
                  >
                    {urgencyLabel(o.daysPending)} — {o.daysPending} يوم
                  </Badge>
                  {isFollowed && (
                    <Badge className="text-xs gap-1 bg-green-600/20 text-green-700 dark:text-green-400 border border-green-600/40">
                      <CheckCircle2 className="h-3 w-3" />
                      تم المتابعة
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <Link href={`/shipments/${o.id}`}>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-current bg-white/50 dark:bg-black/20">
                      <Link2 className="h-3 w-3" />
                      فتح الشحنة
                    </Button>
                  </Link>
                  {o.phone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-7 text-xs gap-1 ${
                        isFollowed
                          ? "border-green-700 text-green-800 bg-green-100 dark:border-green-600 dark:text-green-300 dark:bg-green-900/40"
                          : "border-green-600 text-green-700 bg-green-50 hover:bg-green-100 dark:border-green-500 dark:text-green-400 dark:bg-green-950/30 dark:hover:bg-green-900/40"
                      }`}
                      onClick={() => {
                        const msg = shippingTemplate
                          ? applyShippingTemplate(shippingTemplate.body, {
                              id: o.id,
                              customerName: o.customerName,
                              product: o.product,
                              trackingNumber: o.trackingNumber,
                              shippingCompany: o.shippingCompany,
                              daysPending: o.daysPending,
                            })
                          : buildDefaultShippingMessage({
                              id: o.id,
                              customerName: o.customerName,
                              product: o.product,
                              trackingNumber: o.trackingNumber,
                              shippingCompany: o.shippingCompany,
                              daysPending: o.daysPending,
                            });
                        const link = buildWhatsAppLink(o.phone, msg);
                        window.open(link, "_blank", "noopener,noreferrer");
                        markFollowed(o.id);
                        toast({ title: "تم فتح واتساب", description: `تم تسجيل متابعة الأوردر #${o.id.toString().padStart(4,"0")}` });
                      }}
                    >
                      {isFollowed ? <CheckCircle2 className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                      {isFollowed ? "متابعة مرة أخرى" : "متابعة الشحن مع العميل"}
                    </Button>
                  )}
                </div>
              </div>

              {/* بيانات العميل الأساسية */}
              <div className="flex items-center gap-2.5 pb-2.5 border-b border-current/15">
                <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-current/10 border border-current/20">
                  <User className="h-4.5 w-4.5 opacity-80" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm truncate">{o.customerName}</div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {o.phone && (
                      <a href={`tel:${o.phone}`} className="flex items-center gap-1 text-xs opacity-80 hover:underline hover:opacity-100">
                        <Phone className="h-3 w-3" />
                        {o.phone}
                      </a>
                    )}
                    {o.city && (
                      <span className="flex items-center gap-1 text-xs opacity-80">
                        <span className="opacity-40">•</span>
                        <MapPin className="h-3 w-3" />
                        {o.city}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {o.address && (
                <div className="flex items-start gap-2 text-xs opacity-75">
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-60" />
                  <span className="leading-relaxed">{o.address}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Truck className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="text-sm truncate">{o.shippingCompany ?? "—"}</span>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="text-sm font-mono truncate">{o.trackingNumber || <span className="opacity-50">لا يوجد تتبع</span>}</span>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <Wallet className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="text-sm truncate">{o.shippingCost ? formatCurrency(o.shippingCost) : "—"} <span className="opacity-50 text-xs">شحن</span></span>
                </div>

                {o.assignedUserName && (
                  <div className="flex items-center gap-2 min-w-0">
                    <UserCircle2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="text-sm truncate">{o.assignedUserName}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs opacity-70 pt-1 border-t border-current/20">
                <span className="truncate">{o.product}</span>
                <span className="font-medium shrink-0">{formatCurrency(o.totalPrice)}</span>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {orders.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>تأكد من متابعة هذه الشحنات مع شركات الشحن وتحديث أرقام التتبع في الطلبات.</p>
        </div>
      )}
    </div>
  );
}
