import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import {
  clientAccountProApi, type ReceiverClientProfile, type ClientStatementResponse,
  type ClientPaymentDTO, type ClientInvoiceDTO, type ClientAnalyticsResponse,
  type ClientPaymentMethod, type ReceiverPaymentMethod,
} from "@/lib/api";
import {
  Activity, Wallet, FileText, Receipt, ShieldCheck, ShieldAlert,
  Plus, Trash2, Save, Ban, CheckCircle2, TrendingDown, TrendingUp,
  ArrowDownCircle, ArrowUpCircle, Loader2, Heart,
} from "lucide-react";

const fmt = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n ?? 0));
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });

const PAYMENT_METHOD_LABELS: Record<ClientPaymentMethod, string> = {
  cash: "نقدي", bank_transfer: "تحويل بنكي", wallet: "محفظة إلكترونية",
  instapay: "انستاباي", other: "أخرى",
};
const RECEIVER_PAYMENT_METHOD_LABELS: Record<ReceiverPaymentMethod, string> = {
  cod: "الدفع عند الاستلام", prepaid: "مدفوع مسبقاً", deferred: "الدفع لاحق",
};

// ─── دائرة Health Score ──────────────────────────────────────────────────────
function HealthScoreRing({ score }: { score: number }) {
  const r = 42, circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const label = score >= 75 ? "ممتاز" : score >= 50 ? "متوسط" : "ضعيف";
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-24 h-24 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9"
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black" style={{ color }}>{score}</span>
          <Heart className="w-3 h-3" style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-sm font-bold" style={{ color }}>{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">مؤشر صحة الحساب — من 100</p>
      </div>
    </div>
  );
}

// ─── تاب: البروفايل ──────────────────────────────────────────────────────────
function ProfileTab({ phone, clientName }: { phone: string; clientName: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{
    email: string; city: string; address: string;
    creditLimit: string; paymentMethod: ReceiverPaymentMethod; internalNotes: string;
  } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["client-account-pro-profile", phone],
    queryFn: () => clientAccountProApi.getProfile(phone),
    enabled: !!phone,
  });

  const client = data?.client ?? null;

  const startEdit = () => {
    if (!client) {
      setForm({ email: "", city: "", address: "", creditLimit: "0", paymentMethod: "cod", internalNotes: "" });
    } else {
      setForm({
        email: client.email ?? "", city: client.city ?? "", address: client.address ?? "",
        creditLimit: client.creditLimit ?? "0", paymentMethod: client.paymentMethod, internalNotes: client.internalNotes ?? "",
      });
    }
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => clientAccountProApi.updateProfile({
      phone, name: clientName,
      email: form!.email || null, city: form!.city || null, address: form!.address || null,
      creditLimit: Number(form!.creditLimit || 0), paymentMethod: form!.paymentMethod,
      internalNotes: form!.internalNotes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-profile", phone] });
      toast({ title: "تم حفظ بيانات العميل" });
      setEditing(false);
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  const suspendMutation = useMutation({
    mutationFn: (suspend: boolean) => clientAccountProApi.suspend(phone, suspend, suspend ? suspendReason : null),
    onSuccess: (_r, suspend) => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-profile", phone] });
      toast({ title: suspend ? "تم تعليق الحساب" : "تم تفعيل الحساب" });
      setSuspendDialogOpen(false);
      setSuspendReason("");
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>;
  }

  const isSuspended = client?.accountStatus === "suspended";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {isSuspended ? (
            <Badge variant="outline" className="text-red-400 bg-red-900/10 border-red-700 gap-1">
              <ShieldAlert className="w-3 h-3" /> حساب موقوف
            </Badge>
          ) : (
            <Badge variant="outline" className="text-emerald-400 bg-emerald-900/10 border-emerald-700 gap-1">
              <ShieldCheck className="w-3 h-3" /> حساب نشط
            </Badge>
          )}
          {client?.accountNumber && (
            <Badge variant="outline" className="text-muted-foreground">#{client.accountNumber}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEdit}>تعديل البيانات</Button>
          )}
          {isSuspended ? (
            <Button size="sm" variant="outline" className="gap-1.5 text-emerald-500" onClick={() => suspendMutation.mutate(false)}>
              <CheckCircle2 className="w-3.5 h-3.5" /> تفعيل الحساب
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 text-red-500" onClick={() => setSuspendDialogOpen(true)}>
              <Ban className="w-3.5 h-3.5" /> تعليق الحساب
            </Button>
          )}
        </div>
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground mb-1">البريد الإلكتروني</p>
            <p className="text-sm font-bold">{client?.email || "—"}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground mb-1">العنوان</p>
            <p className="text-sm font-bold">{client?.address || "—"}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground mb-1">حد الائتمان</p>
            <p className="text-sm font-bold">{fmt(client?.creditLimit)} ج.م</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground mb-1">طريقة الدفع الافتراضية</p>
            <p className="text-sm font-bold">{RECEIVER_PAYMENT_METHOD_LABELS[client?.paymentMethod ?? "cod"]}</p>
          </Card>
          <Card className="p-3 md:col-span-2">
            <p className="text-[11px] text-muted-foreground mb-1">ملاحظات داخلية</p>
            <p className="text-sm">{client?.internalNotes || "—"}</p>
          </Card>
          {isSuspended && client?.suspendReason && (
            <Card className="p-3 md:col-span-2 border-red-700 bg-red-900/10">
              <p className="text-[11px] text-red-400 mb-1">سبب التعليق (بواسطة {client.suspendedByName ?? "—"})</p>
              <p className="text-sm">{client.suspendReason}</p>
            </Card>
          )}
        </div>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">البريد الإلكتروني</label>
              <Input value={form!.email} onChange={(e) => setForm((f) => ({ ...f!, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">المدينة</label>
              <Input value={form!.city} onChange={(e) => setForm((f) => ({ ...f!, city: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] text-muted-foreground mb-1 block">العنوان</label>
              <Input value={form!.address} onChange={(e) => setForm((f) => ({ ...f!, address: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">حد الائتمان</label>
              <Input type="number" value={form!.creditLimit} onChange={(e) => setForm((f) => ({ ...f!, creditLimit: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">طريقة الدفع الافتراضية</label>
              <Select value={form!.paymentMethod} onValueChange={(v) => setForm((f) => ({ ...f!, paymentMethod: v as ReceiverPaymentMethod }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECEIVER_PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] text-muted-foreground mb-1 block">ملاحظات داخلية</label>
              <Textarea value={form!.internalNotes} onChange={(e) => setForm((f) => ({ ...f!, internalNotes: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>إلغاء</Button>
            <Button size="sm" className="gap-1.5" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              <Save className="w-3.5 h-3.5" /> حفظ
            </Button>
          </div>
        </Card>
      )}

      {/* Dialog تعليق الحساب */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعليق حساب العميل</DialogTitle></DialogHeader>
          <Textarea
            placeholder="سبب التعليق (اختياري)..."
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>إلغاء</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={suspendMutation.isPending}
              onClick={() => suspendMutation.mutate(true)}
            >
              تأكيد التعليق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── تاب: كشف الحساب (Statement) — شكل فاتورة ────────────────────────────────
function StatementTab({ phone, clientName }: { phone: string; clientName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["client-account-pro-statement", phone],
    queryFn: () => clientAccountProApi.getStatement(phone),
    enabled: !!phone,
  });

  if (isLoading) {
    return <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>;
  }

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-[11px] text-muted-foreground mb-1">إجمالي مدين</p>
          <p className="text-lg font-black text-blue-400">{fmt(data?.totalDebit)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[11px] text-muted-foreground mb-1">إجمالي دائن</p>
          <p className="text-lg font-black text-emerald-400">{fmt(data?.totalCredit)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[11px] text-muted-foreground mb-1">الرصيد الحالي</p>
          <p className={`text-lg font-black ${(data?.currentBalance ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            {fmt(data?.currentBalance)}
          </p>
        </Card>
      </div>

      {/* شكل الفاتورة — نسخة للطباعة والعرض */}
      <Card className="overflow-hidden border-border" id="client-statement-print">
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/10">
          <div>
            <p className="text-sm font-black">كشف حساب — {clientName}</p>
            <p className="text-[11px] text-muted-foreground">{phone}</p>
          </div>
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold text-muted-foreground bg-muted/5">
                <th className="text-right py-2 px-3">التاريخ</th>
                <th className="text-right py-2 px-3">البيان</th>
                <th className="text-left py-2 px-3">مدين</th>
                <th className="text-left py-2 px-3">دائن</th>
                <th className="text-left py-2 px-3">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr key={`${e.type}-${e.refId}-${idx}`} className="border-b border-border/40 hover:bg-muted/10">
                  <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">{fmtDate(e.date)}</td>
                  <td className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      {e.type === "debit"
                        ? <ArrowDownCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        : <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      {e.description}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-left font-bold text-blue-400">{e.type === "debit" ? fmt(e.amount) : "—"}</td>
                  <td className="py-2 px-3 text-left font-bold text-emerald-400">{e.type === "credit" ? fmt(e.amount) : "—"}</td>
                  <td className="py-2 px-3 text-left font-bold">{fmt(e.balance)}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد حركات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── تاب: التحصيلات ──────────────────────────────────────────────────────────
function PaymentsTab({ phone }: { phone: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    amount: "", paymentMethod: "cash" as ClientPaymentMethod, receiptNumber: "", notes: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["client-account-pro-payments", phone],
    queryFn: () => clientAccountProApi.getPayments(phone),
    enabled: !!phone,
  });

  const createMutation = useMutation({
    mutationFn: () => clientAccountProApi.createPayment({
      phone, amount: Number(form.amount), paymentMethod: form.paymentMethod,
      receiptNumber: form.receiptNumber || null, notes: form.notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-payments", phone] });
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-statement", phone] });
      toast({ title: "تم تسجيل التحصيل" });
      setDialogOpen(false);
      setForm({ amount: "", paymentMethod: "cash", receiptNumber: "", notes: "" });
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientAccountProApi.deletePayment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-payments", phone] });
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-statement", phone] });
      toast({ title: "تم حذف التحصيل" });
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  const payments = data?.payments ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">سجل التحصيلات ({payments.length})</p>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> تسجيل تحصيل
        </Button>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] font-bold text-muted-foreground bg-muted/5">
                  <th className="text-right py-2 px-3">التاريخ</th>
                  <th className="text-right py-2 px-3">المبلغ</th>
                  <th className="text-right py-2 px-3">طريقة الدفع</th>
                  <th className="text-right py-2 px-3">رقم الإيصال</th>
                  <th className="text-right py-2 px-3">استلمها</th>
                  <th className="text-right py-2 px-3">ملاحظات</th>
                  <th className="text-left py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-muted/10">
                    <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">{fmtDate(p.paidAt)}</td>
                    <td className="py-2 px-3 font-bold text-emerald-400">{fmt(p.amount)}</td>
                    <td className="py-2 px-3">{PAYMENT_METHOD_LABELS[p.paymentMethod]}</td>
                    <td className="py-2 px-3 text-muted-foreground">{p.receiptNumber || "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground">{p.receivedByName || "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground">{p.notes || "—"}</td>
                    <td className="py-2 px-3 text-left">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-500"
                        onClick={() => deleteMutation.mutate(p.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد تحصيلات مسجلة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dialog تسجيل تحصيل جديد */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تسجيل تحصيل جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">المبلغ</label>
              <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">طريقة الدفع</label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v as ClientPaymentMethod }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">رقم الإيصال (اختياري)</label>
              <Input value={form.receiptNumber} onChange={(e) => setForm((f) => ({ ...f, receiptNumber: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">ملاحظات (اختياري)</label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button disabled={!form.amount || createMutation.isPending} onClick={() => createMutation.mutate()}>
              تسجيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── تاب: الفواتير ───────────────────────────────────────────────────────────
const INVOICE_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  unpaid:  { label: "غير مدفوعة",    color: "text-red-400",     bg: "bg-red-900/10",     border: "border-red-700" },
  partial: { label: "مدفوعة جزئياً", color: "text-amber-400",   bg: "bg-amber-900/10",   border: "border-amber-700" },
  paid:    { label: "مدفوعة",        color: "text-emerald-400", bg: "bg-emerald-900/10", border: "border-emerald-700" },
};

function InvoicesTab({ phone }: { phone: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["client-account-pro-invoices", phone],
    queryFn: () => clientAccountProApi.getInvoices(phone),
    enabled: !!phone,
  });

  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold">الفواتير ({invoices.length})</p>

      {isLoading ? (
        <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {invoices.map((inv) => {
            const cfg = INVOICE_STATUS_CFG[inv.status];
            const remaining = Number(inv.totalAmount) - Number(inv.paidAmount);
            return (
              <Card key={inv.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-primary" /> {inv.invoiceNumber}
                  </span>
                  <Badge variant="outline" className={`${cfg.border} ${cfg.bg} ${cfg.color}`}>{cfg.label}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mt-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                    <p className="text-sm font-bold">{fmt(inv.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">المدفوع</p>
                    <p className="text-sm font-bold text-emerald-400">{fmt(inv.paidAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">المتبقي</p>
                    <p className="text-sm font-bold text-amber-400">{fmt(remaining)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-3">{inv.shipmentIds.length} شحنة — {fmtDate(inv.createdAt)}</p>
              </Card>
            );
          })}
          {invoices.length === 0 && (
            <div className="col-span-2 text-center py-8 text-muted-foreground">لا توجد فواتير</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── تاب: التحليلات + Health Score ───────────────────────────────────────────
function AnalyticsTab({ phone }: { phone: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["client-account-pro-analytics", phone],
    queryFn: () => clientAccountProApi.getAnalytics(phone),
    enabled: !!phone,
  });

  if (isLoading) {
    return <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>;
  }

  const monthly = data?.monthly ?? [];
  const byGovernorate = data?.byGovernorate ?? [];
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.totalAmount));

  return (
    <div className="space-y-4">
      {/* Health Score */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <HealthScoreRing score={data?.healthScore ?? 0} />
          {data?.healthBreakdown && (
            <div className="flex gap-3 flex-wrap">
              <div className="text-center px-3">
                <p className="text-[10px] text-muted-foreground">صحة المرتجعات</p>
                <p className="text-sm font-bold">{data.healthBreakdown.returnHealthComponent}%</p>
              </div>
              <div className="text-center px-3">
                <p className="text-[10px] text-muted-foreground">الالتزام بالسداد</p>
                <p className="text-sm font-bold">{data.healthBreakdown.paymentComplianceRate}%</p>
              </div>
              <div className="text-center px-3">
                <p className="text-[10px] text-muted-foreground">حجم الشحنات</p>
                <p className="text-sm font-bold">{data.healthBreakdown.volumeScore}%</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-3 text-center">
        <p className="text-[11px] text-muted-foreground mb-1">معدل المرتجعات</p>
        <p className={`text-lg font-black ${(data?.returnRate ?? 0) > 20 ? "text-red-400" : "text-emerald-400"}`}>
          {data?.returnRate ?? 0}%
        </p>
      </Card>

      {/* رسم شهري بسيط بالأعمدة */}
      <Card className="p-4">
        <p className="text-sm font-bold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> النشاط الشهري (آخر 12 شهر)
        </p>
        <div className="flex items-end gap-1.5 h-32 overflow-x-auto">
          {monthly.map((m) => (
            <div key={m.month} className="flex flex-col items-center gap-1 min-w-[32px]" title={`${m.month}: ${fmt(m.totalAmount)}`}>
              <div className="w-5 rounded-t bg-primary/70 transition-all" style={{ height: `${(m.totalAmount / maxMonthly) * 100}px` }} />
              <span className="text-[9px] text-muted-foreground rotate-0">{m.month.slice(5)}</span>
            </div>
          ))}
          {monthly.length === 0 && <p className="text-muted-foreground text-xs w-full text-center py-8">لا توجد بيانات كافية</p>}
        </div>
      </Card>

      {/* توزيع المحافظات */}
      <Card className="p-4">
        <p className="text-sm font-bold mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> توزيع الشحنات بالمحافظة
        </p>
        <div className="space-y-2">
          {byGovernorate.slice(0, 6).map((g) => {
            const maxCount = Math.max(1, ...byGovernorate.map((x) => x.count));
            return (
              <div key={g.city} className="flex items-center gap-3">
                <span className="text-xs w-24 shrink-0 truncate">{g.city}</span>
                <div className="flex-1 h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${(g.count / maxCount) * 100}%` }} />
                </div>
                <span className="text-xs w-8 text-left text-muted-foreground">{g.count}</span>
              </div>
            );
          })}
          {byGovernorate.length === 0 && <p className="text-muted-foreground text-xs text-center py-4">لا توجد بيانات</p>}
        </div>
      </Card>
    </div>
  );
}

// ─── المكوّن الرئيسي — يجمع كل التابات ────────────────────────────────────────
export default function ClientAccountProPanel({ phone, clientName }: { phone: string; clientName: string }) {
  return (
    <Card className="p-4 border-border">
      <Tabs defaultValue="profile" dir="rtl">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="profile" className="gap-1.5 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" /> البروفايل
          </TabsTrigger>
          <TabsTrigger value="statement" className="gap-1.5 text-xs">
            <FileText className="w-3.5 h-3.5" /> كشف الحساب
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5 text-xs">
            <Wallet className="w-3.5 h-3.5" /> التحصيلات
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 text-xs">
            <Receipt className="w-3.5 h-3.5" /> الفواتير
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="profile"><ProfileTab phone={phone} clientName={clientName} /></TabsContent>
          <TabsContent value="statement"><StatementTab phone={phone} clientName={clientName} /></TabsContent>
          <TabsContent value="payments"><PaymentsTab phone={phone} /></TabsContent>
          <TabsContent value="invoices"><InvoicesTab phone={phone} /></TabsContent>
        </div>
      </Tabs>

      {/* تحليلات + Health Score — دايمًا ظاهرة تحت التابات */}
      <div className="mt-5 pt-5 border-t border-border">
        <p className="text-sm font-black mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> التحليلات ومؤشر صحة الحساب
        </p>
        <AnalyticsTab phone={phone} />
      </div>
    </Card>
  );
}
