import { useState, useMemo } from "react";
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
  RotateCcw, ListOrdered, Truck, Loader2, CheckCircle2,
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
  } | null;
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:          { label: "جديد",          color: "text-amber-400",   bg: "bg-amber-900/20",   border: "border-amber-700" },
  warehouse_ready:  { label: "جاهز للشحن",     color: "text-teal-400",    bg: "bg-teal-900/20",    border: "border-teal-700" },
  in_shipping:      { label: "قيد الشحن",      color: "text-sky-400",     bg: "bg-sky-900/20",     border: "border-sky-700" },
  delayed:          { label: "مؤجل",           color: "text-orange-400",  bg: "bg-orange-900/20",  border: "border-orange-700" },
  received:         { label: "استلم",          color: "text-emerald-400", bg: "bg-emerald-900/20", border: "border-emerald-700" },
  partial_received: { label: "استلام جزئي",    color: "text-cyan-400",    bg: "bg-cyan-900/20",    border: "border-cyan-700" },
  returned:         { label: "مرتجع",          color: "text-red-400",    bg: "bg-red-900/20",     border: "border-red-700" },
  cancelled:        { label: "ملغي",           color: "text-slate-400",   bg: "bg-slate-900/20",   border: "border-slate-700" },
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

export default function ClientAccountSheetPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchName, setSearchName] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [activeName, setActiveName] = useState("");
  const [activePhone, setActivePhone] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [collectedInput, setCollectedInput] = useState("");

  const hasSearch = !!(activeName || activePhone);

  const { data, isLoading, isFetching } = useQuery<SheetResponse>({
    queryKey: ["client-account-sheet", activeName, activePhone],
    queryFn: () => {
      const q = new URLSearchParams();
      if (activePhone) q.set("phone", activePhone);
      else if (activeName) q.set("name", activeName);
      return apiFetch<SheetResponse>(`/client-account-sheet/orders?${q.toString()}`);
    },
    enabled: hasSearch,
  });

  const runSearch = () => {
    if (!searchName.trim() && !searchPhone.trim()) {
      toast({ title: "لازم تكتب اسم أو رقم تليفون للبحث", variant: "destructive" });
      return;
    }
    setActiveName(searchName.trim());
    setActivePhone(searchPhone.trim());
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
        body: JSON.stringify({ name: activeName || null, phone: activePhone || null, notes: closeNotes || null }),
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
          <Button onClick={runSearch} disabled={isFetching} className="gap-2">
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            بحث
          </Button>
        </div>
      </Card>

      {!hasSearch && (
        <Card className="p-10 border-border border-dashed text-center text-muted-foreground">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
          دوّر عن عميل بالاسم أو رقم التليفون عشان تشوف شيت حسابه
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
                <p className="font-bold text-lg flex items-center gap-2"><User className="w-4 h-4 text-primary" /> {data.client.name}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  {data.client.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {data.client.phone}</span>}
                  {data.client.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {data.client.city}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
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
                  <tr><td colSpan={12} className="p-8 text-center text-muted-foreground">لا يوجد أوردرات</td></tr>
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
