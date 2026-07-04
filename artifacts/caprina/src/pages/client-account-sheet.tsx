import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, User, Phone, MapPin, Printer, Lock, Package,
  RotateCcw, ListOrdered, Truck, Loader2, CheckCircle2, UserCog, BarChart3,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────
const fmt = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

type SheetOrder = {
  id: number;
  customerName: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  senderName: string | null;
  warehouseName: string | null;
  assignedUserName: string | null;
  unitPrice: number;
  totalPrice: number;
  shippingCost: number;
  collectedAmount: number | null;
  status: string;
  returnReceived: number | null;
  product: string;
  invoiceNumber: string | null;
  createdAt: string;
  notes: string | null;
};

type SheetResponse = {
  client: { name: string; phone: string | null; city: string | null; address: string | null } | null;
  orders: SheetOrder[];
  stats: {
    newOrders: number;
    returnedNotReceived: number;
    delayedOrInDelivery: number;
    totalOrders: number;
    statusDistribution: { status: string; count: number; percentage: number }[];
    weeklyShipments: number;
  } | null;
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  waiting:           { label: "انتظار",        color: "text-amber-400",   bg: "bg-amber-900/20",   border: "border-amber-700" },
  confirmed:         { label: "مؤكدة",         color: "text-teal-400",    bg: "bg-teal-900/20",    border: "border-teal-700" },
  picked_up:         { label: "تم الاستلام",    color: "text-sky-400",     bg: "bg-sky-900/20",     border: "border-sky-700" },
  in_transit:        { label: "في الطريق",      color: "text-sky-400",     bg: "bg-sky-900/20",     border: "border-sky-700" },
  out_for_delivery:  { label: "خرجت للتسليم",   color: "text-blue-400",    bg: "bg-blue-900/20",    border: "border-blue-700" },
  delayed:           { label: "مؤجل",           color: "text-orange-400",  bg: "bg-orange-900/20",  border: "border-orange-700" },
  delivered:         { label: "تم التسليم",     color: "text-emerald-400", bg: "bg-emerald-900/20", border: "border-emerald-700" },
  partial_received:  { label: "استلام جزئي",    color: "text-cyan-400",    bg: "bg-cyan-900/20",    border: "border-cyan-700" },
  returned:          { label: "مرتجع",          color: "text-red-400",    bg: "bg-red-900/20",     border: "border-red-700" },
  cancelled:         { label: "ملغي",           color: "text-slate-400",   bg: "bg-slate-900/20",   border: "border-slate-700" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border" };
  return (
    <Badge variant="outline" className={`text-[10px] ${cfg.border} ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </Badge>
  );
}

// ── مربع إحصائي ──────────────────────────────────────────────────────────
function StatBox({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <Card className="p-4 border-border relative overflow-hidden">
      <div className="absolute -top-6 -left-6 w-20 h-20 rounded-full opacity-10" style={{ background: color }} />
      <div className="relative z-10 flex items-center justify-between">
        <div>
          <p className="text-2xl font-black">{fmt(value)}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </Card>
  );
}

type SearchMatch = { name: string; phone: string; shipmentsCount: number };

type ClientRow = {
  name: string; phone: string; city: string | null;
  shipmentsCount: number; totalAmount: number; collectedAmount: number; remainingAmount: number;
  lastOrderAt: string;
};

export default function ClientAccountSheetPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchName, setSearchName] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [activePhone, setActivePhone] = useState("");
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [collectedInput, setCollectedInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [tableFilter, setTableFilter] = useState("");

  const hasSearch = !!activePhone;

  const { data, isLoading, isFetching } = useQuery<SheetResponse>({
    queryKey: ["client-account-sheet", activePhone],
    queryFn: () => apiFetch<SheetResponse>(`/client-account-sheet/orders?phone=${encodeURIComponent(activePhone)}`),
    enabled: hasSearch,
  });

  // كل العملاء — بتتحمّل لما لسه مفيش بحث نشط، وبتتفلتر محليًا فورًا مع الكتابة
  const { data: allClientsData, isLoading: isLoadingAllClients } = useQuery<{ clients: ClientRow[] }>({
    queryKey: ["client-account-sheet-all-clients"],
    queryFn: () => apiFetch<{ clients: ClientRow[] }>("/client-account-sheet/all-clients"),
    enabled: !hasSearch,
  });

  const filteredClients = useMemo(() => {
    const list = allClientsData?.clients ?? [];
    const q = tableFilter.trim();
    if (!q) return list;
    const qNorm = q.replace(/\D/g, "");
    return list.filter((c) =>
      c.name?.toLowerCase().includes(q.toLowerCase()) ||
      (qNorm && c.phone?.replace(/\D/g, "").includes(qNorm)) ||
      (!qNorm && c.phone?.includes(q))
    );
  }, [allClientsData, tableFilter]);

  // اختيار مباشر برقم تليفون (مفتاح دقيق)
  const selectPhone = (phone: string) => {
    setMatches(null);
    setActivePhone(phone.trim());
  };

  const runSearch = async () => {
    const name = searchName.trim();
    const phone = searchPhone.trim();

    if (!name && !phone) {
      toast({ title: "لازم تكتب اسم أو رقم تليفون للبحث", variant: "destructive" });
      return;
    }

    // البحث بالفون دايماً دقيق ومباشر — أفضل مفتاح لأن الاسم ممكن يتكرر أو يختلف فى الكتابة
    if (phone) {
      selectPhone(phone);
      return;
    }

    // البحث بالاسم بيرجع قائمة أرقام مطابقة لاختيار الصح منها
    setSearching(true);
    setMatches(null);
    setActivePhone("");
    try {
      const res = await apiFetch<{ matches: SearchMatch[] }>(`/client-account-sheet/search?name=${encodeURIComponent(name)}`);
      if (res.matches.length === 0) {
        toast({ title: "مفيش نتائج", description: "مفيش عميل بهذا الاسم فى الشحنات" });
      } else if (res.matches.length === 1) {
        selectPhone(res.matches[0].phone);
      } else {
        setMatches(res.matches);
      }
    } catch (e: any) {
      toast({ title: "حصل خطأ فى البحث", description: e.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const collectedMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number | null }) =>
      apiFetch(`/client-account-sheet/orders/${id}/collected`, {
        method: "PATCH",
        body: JSON.stringify({ collectedAmount: amount }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-sheet"] });
      toast({ title: "تم تحديث المبلغ المحصَّل" });
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; remainingDelayedCount: number }>("/client-account-sheet/close", {
        method: "POST",
        body: JSON.stringify({ phone: activePhone, notes: closeNotes || null }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["client-account-sheet"] });
      toast({
        title: "تم إقفال الحساب",
        description: res.remainingDelayedCount > 0
          ? `فاضل ${res.remainingDelayedCount} أوردر مؤجل لسه شغال في مركز العمليات`
          : "كل الأوردرات اتقفلت",
      });
      setCloseDialogOpen(false);
      setCloseNotes("");
    },
    onError: (e: any) => toast({ title: "حصل خطأ فى الإقفال", description: e.message, variant: "destructive" }),
  });

  const handlePrint = () => window.print();

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-black flex items-center gap-2">
            <User className="w-5 h-5 text-primary" /> حساب العميل
          </h1>
          <p className="text-xs text-muted-foreground mt-1">شيت حساب الزبون — أوردرات + إقفال حساب</p>
        </div>
      </div>

      {/* شريط البحث */}
      <Card className="p-4 border-border print:hidden">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="اسم العميل"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            className="flex-1"
          />
          <Input
            placeholder="رقم التليفون (أدق)"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            className="flex-1"
          />
          <Button onClick={runSearch} disabled={isFetching || searching} className="gap-2">
            {(isFetching || searching) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            بحث
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          البحث بالتليفون دقيق ومباشر. البحث بالاسم فقط هيوريك كل الأرقام المطابقة عشان تختار العميل الصح
          (لأن نفس الاسم ممكن يتكرر لأكتر من زبون).
        </p>
      </Card>

      {/* قائمة المرشحين لما البحث بالاسم يرجع أكتر من رقم */}
      {matches && matches.length > 0 && (
        <Card className="p-4 border-border print:hidden">
          <p className="text-sm font-bold mb-3">فيه أكتر من عميل بنفس الاسم — اختار الرقم الصح:</p>
          <div className="space-y-2">
            {matches.map((m) => (
              <button
                key={m.phone}
                onClick={() => selectPhone(m.phone)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/20 transition-colors text-right"
              >
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-primary" />
                  <div>
                    <p className="font-bold text-sm">{m.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {m.phone}</p>
                  </div>
                </div>
                <Badge variant="outline">{m.shipmentsCount} شحنة</Badge>
              </button>
            ))}
          </div>
        </Card>
      )}

      {!hasSearch && !matches && (
        <Card className="border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <Input
              placeholder="فلترة سريعة بالاسم أو رقم التليفون..."
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {isLoadingAllClients && (
            <div className="p-10 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري تحميل قائمة العملاء...
            </div>
          )}

          {!isLoadingAllClients && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="p-2.5 text-right font-bold">اسم العميل</th>
                    <th className="p-2.5 text-right font-bold">الفون</th>
                    <th className="p-2.5 text-right font-bold">المحافظة</th>
                    <th className="p-2.5 text-right font-bold">عدد الشحنات</th>
                    <th className="p-2.5 text-right font-bold">إجمالي القيمة</th>
                    <th className="p-2.5 text-right font-bold">المحصَّل</th>
                    <th className="p-2.5 text-right font-bold">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((c) => (
                    <tr
                      key={c.phone}
                      className="border-b border-border/50 hover:bg-muted/10 cursor-pointer"
                      onClick={() => selectPhone(c.phone)}
                    >
                      <td className="p-2.5 font-bold hover:underline decoration-dotted underline-offset-2">{c.name}</td>
                      <td className="p-2.5 flex items-center gap-1"><Phone className="w-3 h-3 text-muted-foreground" /> {c.phone}</td>
                      <td className="p-2.5">{c.city || "—"}</td>
                      <td className="p-2.5"><Badge variant="outline">{c.shipmentsCount}</Badge></td>
                      <td className="p-2.5 font-bold">{fmt(c.totalAmount)}</td>
                      <td className="p-2.5">{fmt(c.collectedAmount)}</td>
                      <td className={`p-2.5 font-bold ${c.remainingAmount > 0 ? "text-amber-400" : "text-emerald-400"}`}>{fmt(c.remainingAmount)}</td>
                    </tr>
                  ))}
                  {filteredClients.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {tableFilter ? "مفيش نتائج مطابقة" : "لا يوجد عملاء"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {hasSearch && isLoading && (
        <Card className="p-10 border-border text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...
        </Card>
      )}

      {hasSearch && !isLoading && data && !data.client && (
        <Card className="p-10 border-border text-center text-muted-foreground">
          مفيش أوردرات لهذا العميل
        </Card>
      )}

      {hasSearch && !isLoading && data?.client && (
        <>
          {/* بيانات العميل + أزرار */}
          <Card className="p-4 border-border">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="space-y-1">
                <button
                  className="font-bold text-lg flex items-center gap-2 hover:underline decoration-dotted underline-offset-4"
                  onClick={() => navigate(`/finance/client-account-sheet/detail/${encodeURIComponent(activePhone)}`)}
                >
                  <User className="w-4 h-4 text-primary" /> {data.client.name}
                </button>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  {data.client.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {data.client.phone}</span>}
                  {data.client.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {data.client.city}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <Button
                  variant="outline" size="sm"
                  onClick={() => navigate(`/finance/client-account-sheet/detail/${encodeURIComponent(activePhone)}`)}
                  className="gap-2"
                >
                  <BarChart3 className="w-4 h-4" /> تفاصيل الحساب
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                  <Printer className="w-4 h-4" /> طباعة
                </Button>
                <Button size="sm" onClick={() => setCloseDialogOpen(true)} className="gap-2 bg-red-600 hover:bg-red-700 text-white">
                  <Lock className="w-4 h-4" /> إقفال الحساب
                </Button>
              </div>
            </div>
          </Card>

          {/* المربعات الأربعة */}
          {data.stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="أوردرات جديدة" value={data.stats.newOrders} icon={Package} color="#f59e0b" />
              <StatBox label="مرتجع لم يصل" value={data.stats.returnedNotReceived} icon={RotateCcw} color="#ef4444" />
              <StatBox label="مؤجل / تحت التسليم" value={data.stats.delayedOrInDelivery} icon={Truck} color="#3b82f6" />
              <StatBox label="إجمالي عدد الأوردرات" value={data.stats.totalOrders} icon={ListOrdered} color="#10b981" />
            </div>
          )}

          {/* الجدول */}
          <Card className="border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="p-2.5 text-right font-bold">اسم العميل</th>
                  <th className="p-2.5 text-right font-bold">الفون</th>
                  <th className="p-2.5 text-right font-bold">المحافظة</th>
                  <th className="p-2.5 text-right font-bold">العنوان</th>
                  <th className="p-2.5 text-right font-bold">اسم الراسل</th>
                  <th className="p-2.5 text-right font-bold">الفرع المستلم منه</th>
                  <th className="p-2.5 text-right font-bold">المندوب</th>
                  <th className="p-2.5 text-right font-bold">سعر الشحنة</th>
                  <th className="p-2.5 text-right font-bold">قيمة الشحنة</th>
                  <th className="p-2.5 text-right font-bold">قيمة الشحن</th>
                  <th className="p-2.5 text-right font-bold">المحصَّل فعلياً</th>
                  <th className="p-2.5 text-right font-bold">حالة الأوردر</th>
                  <th className="p-2.5 text-right font-bold">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-2.5 font-bold">{o.customerName}</td>
                    <td className="p-2.5">{o.phone || "—"}</td>
                    <td className="p-2.5">{o.city || "—"}</td>
                    <td className="p-2.5 max-w-[160px] truncate" title={o.address ?? ""}>{o.address || "—"}</td>
                    <td className="p-2.5">{o.senderName || "—"}</td>
                    <td className="p-2.5">{o.warehouseName || "—"}</td>
                    <td className="p-2.5">
                      {o.assignedUserName
                        ? <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 bg-primary/10 text-primary"><UserCog className="w-3 h-3" /> {o.assignedUserName}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2.5">{fmt(o.unitPrice)}</td>
                    <td className="p-2.5 font-bold">{fmt(o.totalPrice)}</td>
                    <td className="p-2.5">{fmt(o.shippingCost)}</td>
                    <td className="p-2.5 print:hidden">
                      {editingId === o.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={collectedInput}
                            onChange={(e) => setCollectedInput(e.target.value)}
                            className="h-7 w-20 text-xs"
                            autoFocus
                          />
                          <Button size="icon" className="h-7 w-7" onClick={() =>
                            collectedMutation.mutate({ id: o.id, amount: collectedInput === "" ? null : Number(collectedInput) })
                          }>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="hover:underline decoration-dotted underline-offset-2"
                          onClick={() => { setEditingId(o.id); setCollectedInput(o.collectedAmount != null ? String(o.collectedAmount) : ""); }}
                        >
                          {o.collectedAmount != null ? fmt(o.collectedAmount) : <span className="text-muted-foreground">تحديد</span>}
                        </button>
                      )}
                    </td>
                    <td className="p-2.5 hidden print:table-cell">{o.collectedAmount != null ? fmt(o.collectedAmount) : "—"}</td>
                    <td className="p-2.5"><StatusBadge status={o.status} /></td>
                    <td className="p-2.5 max-w-[180px] truncate" title={o.notes ?? ""}>{o.notes || "—"}</td>
                  </tr>
                ))}
                {data.orders.length === 0 && (
                  <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">لا يوجد أوردرات</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* Dialog إقفال الحساب */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="w-4 h-4 text-red-500" /> إقفال حساب العميل</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              هيتم إقفال كل الأوردرات الحالية لهذا العميل ماعدا المؤجلة/تحت التسليم
              (لسه شغالة في مركز العمليات). العملية دي هتتسجل كسجل مغلق ومينفعش يترجع.
            </p>
            <Textarea
              placeholder="ملاحظات على الإقفال (اختياري)"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {closeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              تأكيد الإقفال
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
