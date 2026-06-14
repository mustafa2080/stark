import { useParams, Link, useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { shippingApi, manifestsApi, shipmentsApi, shipmentManifestsApi, type ShippingManifestListItem, type ShipmentManifestListItem } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateManifestDialog } from "./shipping-companies";
import {
  ArrowRight, Truck, PackagePlus, FileText, Lock,
  CheckCircle2, RotateCcw, Clock, TrendingUp, TrendingDown,
  ChevronRight, Calendar, Package, Phone, Globe, X, Send,
  MapPin, User, Search,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency", currency: "EGP", maximumFractionDigits: 0,
  }).format(n);

function DeliveryBar({ delivered, returned, pending, total }: {
  delivered: number; returned: number; pending: number; total: number;
}) {
  if (total === 0) return null;
  const d = (delivered / total) * 100;
  const r = (returned / total) * 100;
  const p = (pending / total) * 100;
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden flex mt-2">
      <div className="h-1.5 bg-emerald-500" style={{ width: `${d}%` }} />
      <div className="h-1.5 bg-red-500" style={{ width: `${r}%` }} />
      <div className="h-1.5 bg-amber-500" style={{ width: `${p}%` }} />
    </div>
  );
}

function ManifestCard({ m, isLatest }: { m: ShippingManifestListItem & { delivered?: number; returned?: number; pending?: number }; isLatest: boolean }) {
  return (
    <Link href={`/shipping/manifests/${m.id}`}>
      <div className={`group flex items-stretch gap-0 hover:bg-muted/10 transition-colors cursor-pointer rounded-lg border ${m.status === "closed" ? "border-border bg-card/50" : "border-primary/30 bg-primary/5"}`}>
        <div className={`w-1 rounded-r-lg shrink-0 ${m.status === "closed" ? "bg-emerald-500" : "bg-blue-500"}`} />
        <div className="flex-1 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm">{m.manifestNumber}</span>
                {isLatest && m.status === "open" && (
                  <Badge variant="outline" className="text-[9px] border-primary/50 bg-primary/10 text-primary">الأحدث</Badge>
                )}
                {m.notes?.includes("مرحَّل") && (
                  <Badge variant="outline" className="text-[9px] border-amber-700 bg-amber-900/20 text-amber-400">مرحَّل</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" />
                  {format(new Date(m.createdAt), "yyyy/MM/dd")}
                </span>
                {m.closedAt ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Lock className="w-2.5 h-2.5" />
                    أُغلق {format(new Date(m.closedAt), "yyyy/MM/dd")}
                  </span>
                ) : (
                  <span className="text-blue-500">
                    منذ {formatDistanceToNow(new Date(m.createdAt), { locale: ar, addSuffix: false })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant="outline"
                className={`text-[9px] font-bold border ${m.status === "closed"
                  ? "border-emerald-700 bg-emerald-900/20 text-emerald-400"
                  : "border-blue-700 bg-blue-900/20 text-blue-400"}`}
              >
                {m.status === "closed"
                  ? <><Lock className="w-2.5 h-2.5 inline ml-0.5" />مغلق</>
                  : <><Clock className="w-2.5 h-2.5 inline ml-0.5" />مفتوح</>}
              </Badge>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2 text-[11px] flex-wrap">
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3 text-muted-foreground" />
              <span className="font-bold">{m.orderCount}</span>
              <span className="text-muted-foreground">طلبية</span>
            </span>
            {m.delivered !== undefined && (
              <>
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="font-bold">{m.delivered}</span> مسلَّم
                </span>
                <span className="flex items-center gap-1 text-red-400">
                  <RotateCcw className="w-3 h-3" />
                  <span className="font-bold">{m.returned}</span> مرتجع
                </span>
                {(m.pending ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <Clock className="w-3 h-3" />
                    <span className="font-bold">{m.pending}</span> معلَّق
                  </span>
                )}
              </>
            )}
            {m.invoicePrice != null && (
              <span className="flex items-center gap-1 text-primary font-bold mr-auto">
                {formatCurrency(m.invoicePrice)}
              </span>
            )}
          </div>

          {m.delivered !== undefined && m.orderCount > 0 && (
            <DeliveryBar
              delivered={m.delivered}
              returned={m.returned ?? 0}
              pending={m.pending ?? 0}
              total={m.orderCount}
            />
          )}
        </div>
      </div>
    </Link>
  );
}

export default function ShippingCompanyDetailPage() {
  const params = useParams();
  const companyId = Number(params.id);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [showNewManifest, setShowNewManifest] = useState(false);
  const [showNewShipmentManifest, setShowNewShipmentManifest] = useState(false);
  const [expandedShipmentManifests, setExpandedShipmentManifests] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [activeTab, setActiveTab] = useState<"manifests" | "shipments">("manifests");
  const { can, isAdmin } = useAuth();
  const canFinancials = isAdmin || can("shipping.financials");
  const canManifests  = isAdmin || can("shipping.manifests");

  const { data: companies } = useQuery({ queryKey: ["shipping"], queryFn: shippingApi.list });
  const company = companies?.find((c) => c.id === companyId);

  const { data: manifests, isLoading } = useQuery({
    queryKey: ["shipping-manifests", companyId],
    queryFn: () => manifestsApi.list(companyId),
    enabled: !isNaN(companyId),
  });

  const { data: stats } = useQuery({
    queryKey: ["company-stats", companyId],
    queryFn: () => manifestsApi.companyStats(companyId),
    enabled: !isNaN(companyId),
  });

  const { data: shipmentsData, isLoading: shipmentsLoading } = useQuery({
    queryKey: ["company-shipments", companyId],
    queryFn: () => shipmentsApi.list({ shippingCompanyId: companyId, limit: 100 }),
    enabled: !isNaN(companyId) && activeTab === "shipments",
  });
  const shipments = shipmentsData?.data ?? [];

  const { data: shipmentManifests } = useQuery({
    queryKey: ["shipment-manifests", companyId],
    queryFn: () => shipmentManifestsApi.list(companyId),
    enabled: !isNaN(companyId) && activeTab === "shipments",
  });
  const openShipmentManifest = shipmentManifests?.find((m) => m.status === "open") ?? null;

  if (isNaN(companyId)) return <div className="p-8 text-center text-muted-foreground">معرّف غير صحيح</div>;

  const openManifests   = manifests?.filter((m) => m.status === "open")   ?? [];
  const closedManifests = manifests?.filter((m) => m.status === "closed") ?? [];
  const latestOpenId    = openManifests[0]?.id;

  // ── فلتر التاريخ ──
  const filterByDate = (list: typeof openManifests) => {
    if (!dateFrom && !dateTo) return list;
    return list.filter((m) => {
      const d = new Date(m.createdAt);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo   && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  };
  const filteredOpen   = filterByDate(openManifests);
  const filteredClosed = filterByDate(closedManifests);
  const hasDateFilter  = !!(dateFrom || dateTo);

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/shipping">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-border">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border">
            {company?.logo
              ? <img src={company.logo} alt={company.name} className="w-full h-full object-cover" />
              : <Truck className="w-5 h-5 text-muted-foreground" />
            }
          </div>
          <div>
            <h1 className="text-xl font-bold">{company?.name ?? "…"}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {company?.phone && (
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{company.phone}</span>
              )}
              {company?.website && (
                <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{company.website}</span>
              )}
              <Badge
                variant="outline"
                className={`text-[9px] font-bold border ${company?.isActive ? "border-emerald-800 bg-emerald-900/30 text-emerald-400" : "border-border text-muted-foreground"}`}
              >
                {company?.isActive ? "نشط" : "موقف"}
              </Badge>
            </div>
          </div>
        </div>
        {canManifests && (
          <Button
            size="sm"
            className="h-8 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold shrink-0"
            onClick={() => setShowNewManifest(true)}
          >
            <PackagePlus className="w-3.5 h-3.5" />بيان جديد
          </Button>
        )}
      </div>

      {/* ─── Stats Cards ─── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي الطلبيات</p>
            <p className="text-2xl font-black">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">{stats.manifestCount} بيان</p>
          </Card>
          <Card className="border-emerald-900/40 bg-emerald-900/10 p-3 text-center">
            <p className="text-[10px] text-emerald-400 mb-0.5">مُسلَّم</p>
            <p className="text-2xl font-black text-emerald-400">{stats.delivered}</p>
            <p className="text-[10px] text-emerald-600">{stats.deliveryRate}% تسليم</p>
          </Card>
          <Card className="border-red-900/40 bg-red-900/10 p-3 text-center">
            <p className="text-[10px] text-red-400 mb-0.5">مُرتجَع</p>
            <p className="text-2xl font-black text-red-400">{stats.returned}</p>
            <p className="text-[10px] text-amber-600">{(stats as any).postponed ?? stats.pending} مؤجَّل</p>
          </Card>
          <Card className={`p-3 text-center border ${stats.netProfit >= 0 ? "border-primary/30 bg-primary/5" : "border-red-900/40 bg-red-900/10"}`}>
            {canFinancials ? (
              <>
                <p className="text-[10px] text-muted-foreground mb-0.5">صافي الربح</p>
                <p className={`text-xl font-black ${stats.netProfit >= 0 ? "text-primary" : "text-red-400"}`}>
                  {formatCurrency(Math.abs(stats.netProfit))}
                </p>
                <p className="text-[10px] flex items-center justify-center gap-0.5 text-muted-foreground">
                  {stats.netProfit >= 0
                    ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                    : <TrendingDown className="w-3 h-3 text-red-400" />}
                  {stats.netProfit >= 0 ? "ربح" : "خسارة"}
                </p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground mb-0.5">البيانات</p>
                <p className="text-xl font-black text-muted-foreground">—</p>
                <p className="text-[10px] text-muted-foreground/50">غير مصرّح</p>
              </>
            )}
          </Card>
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        <button
          onClick={() => setActiveTab("manifests")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px ${
            activeTab === "manifests"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          البيانات
          {manifests && <Badge variant="outline" className="text-[9px] ml-1">{manifests.length}</Badge>}
        </button>
        <button
          onClick={() => setActiveTab("shipments")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px ${
            activeTab === "shipments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          الشحنات
          {shipmentsData && <Badge variant="outline" className="text-[9px] ml-1">{shipmentsData.total}</Badge>}
        </button>
      </div>

      {/* ─── Tab: Manifests ─── */}
      {activeTab === "manifests" && <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2 pt-3">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />مفتوح: {openManifests.length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />مغلق: {closedManifests.length}
            </span>
          </div>
        </div>

        {/* ── فلتر التاريخ ── */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Calendar className="w-3.5 h-3.5" />من:
          </div>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-7 text-xs w-36 px-2"
          />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">إلى:</div>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-7 text-xs w-36 px-2"
          />
          {hasDateFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
            >
              <X className="w-3 h-3" />مسح
            </Button>
          )}
          {hasDateFilter && (
            <span className="text-[10px] text-muted-foreground">
              ({filteredOpen.length + filteredClosed.length} نتيجة)
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm animate-pulse">جاري التحميل...</div>
        ) : !manifests || manifests.length === 0 ? (
          <div className="py-16 text-center">
            <Truck className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="text-muted-foreground text-sm">لا توجد بيانات شحن بعد</p>
            <Button size="sm" className="mt-4 gap-1" onClick={() => setShowNewManifest(true)}>
              <PackagePlus className="w-3.5 h-3.5" />إنشاء أول بيان
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOpen.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider px-1">
                  مفتوح — يحتاج متابعة
                </p>
                {filteredOpen.map((m) => (
                  <ManifestCard key={m.id} m={m} isLatest={m.id === latestOpenId} />
                ))}
                {filteredClosed.length > 0 && <div className="border-t border-border my-3" />}
              </>
            )}
            {filteredClosed.length > 0 && (
              <>
                {filteredOpen.length > 0 && (
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    مُغلق — مكتمل
                  </p>
                )}
                {filteredClosed.map((m) => (
                  <ManifestCard key={m.id} m={m} isLatest={false} />
                ))}
              </>
            )}
            {hasDateFilter && filteredOpen.length === 0 && filteredClosed.length === 0 && (
              <div className="py-10 text-center text-muted-foreground text-sm">
                لا توجد بيانات في هذا النطاق الزمني
              </div>
            )}
          </div>
        )}
      </div>}

      {/* ─── Tab: Shipments ─── */}
      {activeTab === "shipments" && (
        <div className="pt-3 space-y-4">
          {/* ── بيانات شحن الشحنات ── */}
          {canManifests && (
            <Card className="border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  className="flex-1 h-8 text-xs gap-1 border-border text-muted-foreground"
                  onClick={() => setExpandedShipmentManifests(!expandedShipmentManifests)}
                >
                  <FileText className="w-3.5 h-3.5" />
                  بيانات شحن الشحنات
                  {shipmentManifests && <Badge variant="outline" className="text-[9px] mr-1">{shipmentManifests.length}</Badge>}
                  {expandedShipmentManifests
                    ? <ChevronRight className="w-3.5 h-3.5 mr-auto rotate-90 transition-transform" />
                    : <ChevronRight className="w-3.5 h-3.5 mr-auto transition-transform" />}
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold shrink-0"
                  onClick={() => {
                    if (openShipmentManifest) setExpandedShipmentManifests(true);
                    else setShowNewShipmentManifest(true);
                  }}
                >
                  <PackagePlus className="w-3.5 h-3.5" />بيان شحنات جديد
                </Button>
              </div>

              {openShipmentManifest && (
                <p className="text-[10px] text-amber-400 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  يوجد بيان مفتوح حالياً: {openShipmentManifest.manifestNumber} — {openShipmentManifest.shipmentCount} شحنة. يجب تقفيله أولاً قبل إنشاء بيان جديد.
                </p>
              )}

              {expandedShipmentManifests && (
                <div className="mt-3 space-y-1.5 pt-3 border-t border-border">
                  {!shipmentManifests ? (
                    <p className="text-xs text-muted-foreground text-center py-3">جاري التحميل...</p>
                  ) : shipmentManifests.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">لا توجد بيانات شحن شحنات بعد</p>
                  ) : (
                    shipmentManifests.map((m) => (
                      <ShipmentManifestRow key={m.id} manifest={m} companyId={companyId} qc={qc} />
                    ))
                  )}
                </div>
              )}
            </Card>
          )}

          {shipmentsLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm animate-pulse">جاري التحميل...</div>
          ) : shipments.length === 0 ? (
            <div className="py-16 text-center">
              <Send className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground text-sm">لا توجد شحنات مرتبطة بهذه الشركة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {shipments.map((s: any) => {
                const statusColors: Record<string, string> = {
                  waiting:           "border-amber-700 bg-amber-900/20 text-amber-400",
                  confirmed:         "border-blue-700 bg-blue-900/20 text-blue-400",
                  picked_up:         "border-indigo-700 bg-indigo-900/20 text-indigo-400",
                  warehouse_ready:   "border-purple-700 bg-purple-900/20 text-purple-400",
                  in_transit:        "border-cyan-700 bg-cyan-900/20 text-cyan-400",
                  in_shipping:       "border-cyan-700 bg-cyan-900/20 text-cyan-400",
                  out_for_delivery:  "border-sky-700 bg-sky-900/20 text-sky-400",
                  delivered:         "border-emerald-700 bg-emerald-900/20 text-emerald-400",
                  received:          "border-emerald-700 bg-emerald-900/20 text-emerald-400",
                  returned:          "border-red-700 bg-red-900/20 text-red-400",
                  cancelled:         "border-red-700 bg-red-900/20 text-red-400",
                };
                const statusLabels: Record<string, string> = {
                  waiting: "انتظار", confirmed: "مؤكد", picked_up: "تم الاستلام",
                  warehouse_ready: "جاهز", in_transit: "في الطريق", in_shipping: "في الشحن",
                  out_for_delivery: "خرج للتسليم", delivered: "مسلَّم", received: "مستلم",
                  returned: "مرتجع", cancelled: "ملغي",
                };
                const colorClass = statusColors[s.status] ?? "border-border bg-card text-muted-foreground";
                return (
                  <Link key={s.id} href={`/shipments/${s.id}`}>
                    <div className="group flex items-stretch gap-0 hover:bg-muted/10 transition-colors cursor-pointer rounded-lg border border-border bg-card/50">
                      <div className={`w-1 rounded-r-lg shrink-0 ${s.status === "delivered" || s.status === "received" ? "bg-emerald-500" : s.status === "returned" || s.status === "cancelled" ? "bg-red-500" : "bg-blue-500"}`} />
                      <div className="flex-1 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm">{s.shipmentNumber}</span>
                              {s.trackingNumber && (
                                <span className="text-[10px] text-muted-foreground font-mono">{s.trackingNumber}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <User className="w-2.5 h-2.5" />{s.receiverName}
                              </span>
                              {s.receiverCity && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5" />{s.receiverCity}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="w-2.5 h-2.5" />
                                {format(new Date(s.createdAt), "yyyy/MM/dd")}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className={`text-[9px] font-bold border ${colorClass}`}>
                              {statusLabels[s.status] ?? s.status}
                            </Badge>
                            {canFinancials && s.codAmount && Number(s.codAmount) > 0 && (
                              <span className="text-xs font-bold text-primary">{formatCurrency(Number(s.codAmount))}</span>
                            )}
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* New manifest dialog (orders) */}
      {showNewManifest && company && companies && (
        <CreateManifestDialog
          company={company}
          allCompanies={companies}
          onClose={() => setShowNewManifest(false)}
          onCreated={(m) => {
            qc.invalidateQueries({ queryKey: ["shipping-manifests", companyId] });
            qc.invalidateQueries({ queryKey: ["company-stats", companyId] });
            setShowNewManifest(false);
            navigate(`/shipping/manifests/${m.id}`);
          }}
        />
      )}

      {/* New shipment manifest dialog (shipments) */}
      {showNewShipmentManifest && company && (
        <CreateShipmentManifestDialog
          company={company}
          onClose={() => setShowNewShipmentManifest(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["shipment-manifests", companyId] });
            qc.invalidateQueries({ queryKey: ["company-shipment-stats", companyId] });
            qc.invalidateQueries({ queryKey: ["company-shipments", companyId] });
            setShowNewShipmentManifest(false);
            setExpandedShipmentManifests(true);
          }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ─── بيانات شحن الشحنات (Shipment Manifests) ──────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

const SHIPMENT_MANIFEST_STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار", delivered: "مُسلَّم", returned: "مرتجع", delayed: "مؤجل",
};
const SHIPMENT_MANIFEST_STATUS_COLORS: Record<string, string> = {
  pending: "border-blue-700 bg-blue-900/20 text-blue-400",
  delivered: "border-emerald-700 bg-emerald-900/20 text-emerald-400",
  returned: "border-red-700 bg-red-900/20 text-red-400",
  delayed: "border-amber-700 bg-amber-900/20 text-amber-400",
};

function ShipmentManifestRow({ manifest, companyId, qc }: {
  manifest: ShipmentManifestListItem;
  companyId: number;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const { can, isAdmin } = useAuth();
  const canManifests = isAdmin || can("shipping.manifests");

  const { data: detail } = useQuery({
    queryKey: ["shipment-manifest-detail", manifest.id],
    queryFn: () => shipmentManifestsApi.get(manifest.id),
    enabled: expanded,
  });

  const toggleLockMutation = useMutation({
    mutationFn: (status: "open" | "closed") => shipmentManifestsApi.update(manifest.id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-manifests", companyId] });
      qc.invalidateQueries({ queryKey: ["company-shipment-stats", companyId] });
      toast({ title: "تم التحديث" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => shipmentManifestsApi.delete(manifest.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-manifests", companyId] });
      qc.invalidateQueries({ queryKey: ["company-shipment-stats", companyId] });
      qc.invalidateQueries({ queryKey: ["company-shipments", companyId] });
      toast({ title: "تم حذف البيان" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ shipmentId, deliveryStatus }: { shipmentId: number; deliveryStatus: "pending" | "delivered" | "returned" | "delayed" }) =>
      shipmentManifestsApi.updateItem(manifest.id, shipmentId, { deliveryStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipment-manifest-detail", manifest.id] });
      qc.invalidateQueries({ queryKey: ["shipment-manifests", companyId] });
      qc.invalidateQueries({ queryKey: ["company-shipment-stats", companyId] });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const locked = manifest.status === "closed";

  return (
    <div className="rounded-md bg-muted/20 border border-border/40 overflow-hidden">
      <div
        className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <p className="text-xs font-bold flex items-center gap-1.5">
            {manifest.manifestNumber}
            <Badge variant="outline" className={`text-[9px] font-bold border ${manifest.status === "open" ? "border-blue-700 bg-blue-900/20 text-blue-400" : "border-emerald-700 bg-emerald-900/20 text-emerald-400"}`}>
              {manifest.status === "open" ? <><Clock className="w-2.5 h-2.5 inline ml-0.5" />مفتوح</> : <><Lock className="w-2.5 h-2.5 inline ml-0.5" />مغلق</>}
            </Badge>
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {format(new Date(manifest.createdAt), "yyyy/MM/dd")} · {manifest.shipmentCount} شحنة
          </p>
        </div>
        <div className="flex items-center gap-1">
          {canManifests && (
            <>
              <Button
                variant="outline" size="sm" className="h-7 text-[10px] gap-1"
                onClick={(e) => { e.stopPropagation(); toggleLockMutation.mutate(locked ? "open" : "closed"); }}
                disabled={toggleLockMutation.isPending}
              >
                {locked ? <><Lock className="w-3 h-3" />فتح</> : <><Lock className="w-3 h-3" />تقفيل</>}
              </Button>
              <Button
                variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                onClick={(e) => { e.stopPropagation(); if (confirm("هل أنت متأكد من حذف هذا البيان؟")) deleteMutation.mutate(); }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/40">
          {!detail ? (
            <p className="text-xs text-muted-foreground text-center py-3">جاري التحميل...</p>
          ) : detail.items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">لا توجد شحنات في هذا البيان</p>
          ) : (
            detail.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{item.shipment?.receiverName ?? "—"}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{item.shipment?.shipmentNumber}</p>
                </div>
                {locked || !canManifests ? (
                  <Badge variant="outline" className={`text-[9px] font-bold border shrink-0 ${SHIPMENT_MANIFEST_STATUS_COLORS[item.deliveryStatus] ?? "border-border text-muted-foreground"}`}>
                    {SHIPMENT_MANIFEST_STATUS_LABELS[item.deliveryStatus] ?? item.deliveryStatus}
                  </Badge>
                ) : (
                  <select
                    className="h-7 text-[10px] bg-background border border-border rounded-md px-1.5 shrink-0"
                    value={item.deliveryStatus}
                    onChange={(e) => updateItemMutation.mutate({ shipmentId: item.shipmentId, deliveryStatus: e.target.value as any })}
                    disabled={updateItemMutation.isPending}
                  >
                    {Object.entries(SHIPMENT_MANIFEST_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CreateShipmentManifestDialog({
  company,
  onClose,
  onCreated,
}: {
  company: { id: number; name: string };
  onClose: () => void;
  onCreated?: (manifest: { id: number; manifestNumber: string; shipmentCount: number }) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");

  // الحالات اللي تعتبر "متاحة" للإضافة لبيان شحن جديد
  const AVAILABLE_STATUSES = ["waiting", "confirmed", "delayed"];

  const { data, isLoading } = useQuery({
    queryKey: ["shipments-available-for-manifest", company.id],
    queryFn: () => shipmentsApi.list({ shippingCompanyId: company.id, limit: 200 }),
  });

  const availableShipments = useMemo(() => {
    return (data?.data ?? []).filter((s: any) => AVAILABLE_STATUSES.includes(s.status));
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableShipments;
    const q = search.toLowerCase();
    return availableShipments.filter((s: any) =>
      s.receiverName?.toLowerCase().includes(q) ||
      s.shipmentNumber?.toLowerCase().includes(q) ||
      (s.receiverPhone && s.receiverPhone.includes(q)) ||
      (s.trackingNumber && s.trackingNumber.toLowerCase().includes(q)) ||
      (s.receiverCity && s.receiverCity.toLowerCase().includes(q))
    );
  }, [availableShipments, search]);

  const toggleAll = () => {
    if (filtered.length > 0 && filtered.every((s: any) => selectedIds.has(s.id))) {
      const next = new Set(selectedIds);
      filtered.forEach((s: any) => next.delete(s.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach((s: any) => next.add(s.id));
      setSelectedIds(next);
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      shipmentManifestsApi.create({
        shippingCompanyId: company.id,
        shipmentIds: Array.from(selectedIds),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (manifest) => {
      queryClient.invalidateQueries({ queryKey: ["shipment-manifests", company.id] });
      queryClient.invalidateQueries({ queryKey: ["shipments-available-for-manifest", company.id] });
      queryClient.invalidateQueries({ queryKey: ["company-shipments", company.id] });
      toast({ title: "تم إنشاء البيان", description: `${manifest.manifestNumber} — ${manifest.shipmentCount} شحنة` });
      if (onCreated) onCreated(manifest);
      else onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            إنشاء بيان شحن شحنات — {company.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 mt-2">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم / رقم الشحنة / الهاتف..."
                className="h-9 text-sm bg-background pr-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!isLoading && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {filtered.length} شحنة
              </span>
            )}
          </div>

          {!isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((s: any) => selectedIds.has(s.id))}
                  onCheckedChange={toggleAll}
                />
                <span className="text-xs text-muted-foreground">تحديد الكل ({filtered.length})</span>
              </div>
              <span className="text-xs font-bold text-primary">{selectedIds.size} محددة</span>
            </div>
          )}

          <div className="overflow-y-auto flex-1 border border-border rounded-md">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">جاري تحميل الشحنات...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">
                  {availableShipments.length === 0
                    ? "لا توجد شحنات متاحة حالياً لهذه الشركة (انتظار / مؤكدة / متأخرة)"
                    : "لا توجد نتائج تطابق البحث"}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[auto_1fr_1fr_90px_90px] gap-0 border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold text-muted-foreground sticky top-0">
                  <div className="w-5" />
                  <div>المستلم</div>
                  <div>المدينة / العنوان</div>
                  <div className="text-left">التحصيل</div>
                  <div>الحالة</div>
                </div>
                {filtered.map((s: any) => {
                  const isSelected = selectedIds.has(s.id);
                  const STATUS_LABELS: Record<string, string> = { waiting: "انتظار", confirmed: "مؤكدة", delayed: "متأخرة" };
                  const STATUS_COLORS: Record<string, string> = {
                    waiting: "border-amber-700 bg-amber-900/20 text-amber-400",
                    confirmed: "border-blue-700 bg-blue-900/20 text-blue-400",
                    delayed: "border-orange-700 bg-orange-900/20 text-orange-400",
                  };
                  return (
                    <div
                      key={s.id}
                      className={`grid grid-cols-[auto_1fr_1fr_90px_90px] gap-0 items-center px-3 py-2.5 border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/8" : ""}`}
                      onClick={() => toggleOne(s.id)}
                    >
                      <div className="w-5 flex items-center">
                        <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                      </div>
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold truncate">{s.receiverName}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span className="font-mono text-primary/70">{s.shipmentNumber}</span>
                          {s.receiverPhone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{s.receiverPhone}</span>}
                        </p>
                      </div>
                      <div className="min-w-0 pr-2">
                        {s.receiverCity && (
                          <p className="text-xs truncate flex items-center gap-1"><MapPin className="w-2.5 h-2.5 text-muted-foreground" />{s.receiverCity}</p>
                        )}
                        {s.receiverAddress && (
                          <p className="text-[10px] text-muted-foreground truncate">{s.receiverAddress}</p>
                        )}
                      </div>
                      <div className="text-left text-xs font-bold">
                        {Number(s.codAmount) > 0 ? formatCurrency(Number(s.codAmount)) : "—"}
                      </div>
                      <div>
                        <Badge variant="outline" className={`text-[9px] font-bold border ${STATUS_COLORS[s.status] ?? "border-border text-muted-foreground"}`}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">ملاحظات (اختياري)</Label>
            <Textarea
              placeholder="ملاحظات على البيان..."
              className="min-h-[50px] text-sm resize-none bg-background"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 h-9 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => createMutation.mutate()}
              disabled={selectedIds.size === 0 || createMutation.isPending}
            >
              {createMutation.isPending ? "جاري الإنشاء..." : `إنشاء البيان (${selectedIds.size} شحنة)`}
            </Button>
            <Button variant="outline" className="h-9 text-sm border-border" onClick={onClose}>إلغاء</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
