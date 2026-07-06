import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  clientAccountProApi, type ReceiverPaymentMethod, type ClientPaymentMethod,
  type AdjustmentType, type AdjustmentDirection, ADJUSTMENT_TYPE_LABELS,
} from "@/lib/api";
import {
  Phone, Mail, ArrowRight, Wallet, Plus, ChevronDown,
  Users2, MessageSquareText, RotateCcw, Receipt, FileSpreadsheet,
  Save, Ban, CheckCircle2, ShieldAlert, ShieldCheck, Loader2,
  ArrowDownCircle, ArrowUpCircle, Activity, TrendingUp, TrendingDown,
  CreditCard, Trash2, Send, Building2, Lock, LockOpen, AlertTriangle, XCircle,
} from "lucide-react";
import { HealthScoreRing } from "@/components/client-account/HealthScoreRing";
import { MiniSparkline } from "@/components/client-account/MiniSparkline";
import { StatCard } from "@/components/client-account/StatCard";
import { AdjustmentsTab } from "@/components/client-account/AdjustmentsTab";
import { ClosuresTab } from "@/components/client-account/ClosuresTab";

const fmt = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });

const fmtDateTime = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }) +
    " " + date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
};

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  return `منذ ${day} يوم`;
}

function initials(name: string) {
  return (name || "؟").trim().charAt(0);
}

const PAYMENT_METHOD_LABELS: Record<ClientPaymentMethod, string> = {
  cash: "نقدي", bank_transfer: "تحويل بنكي", wallet: "محفظة إلكترونية",
  instapay: "انستاباي", other: "أخرى",
};
const RECEIVER_PAYMENT_METHOD_LABELS: Record<ReceiverPaymentMethod, string> = {
  cod: "الدفع عند الاستلام", prepaid: "مدفوع مسبقاً", deferred: "الدفع لاحق",
};

type DetailResponse = {
  client: { name: string; phone: string | null; city: string | null; address: string | null } | null;
  totals: {
    totalShippingValue: number;
    totalCollected: number;
    totalRemaining: number;
    ordersCount: number;
  } | null;
  statusDistribution: { status: string; count: number; percentage: number }[];
  weeklyShipments: number;
  closures: {
    id: number;
    clientName: string;
    clientPhone: string;
    ordersCount: number;
    totalShippingValue: string;
    totalCollected: string;
    totalShippingFee: string;
    notes: string | null;
    closedByName: string | null;
    createdAt: string;
  }[];
};

// المكونات البصرية الخالصة (Health Score, Sparkline, StatCard) انتقلت إلى
// src/components/client-account/ لإعادة الاستخدام وتقليل حجم هذا الملف.

export default function ClientAccountDetailPage() {
  const params = useParams<{ phone: string }>();
  const [, navigate] = useLocation();
  const phone = decodeURIComponent(params.phone ?? "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"statement" | "payments" | "invoices" | "analytics" | "adjustments" | "closures">("statement");
  const [statementFrom, setStatementFrom] = useState("");
  const [statementTo, setStatementTo] = useState("");

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<{
    email: string; city: string; address: string;
    creditLimit: string; paymentMethod: ReceiverPaymentMethod; internalNotes: string;
  } | null>(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "", paymentMethod: "cash" as ClientPaymentMethod, receiptNumber: "", notes: "",
  });

  const [closePeriodDialogOpen, setClosePeriodDialogOpen] = useState(false);
  const [closePeriodForm, setClosePeriodForm] = useState({ periodFrom: "", periodTo: "", notes: "" });
  const [closeSummary, setCloseSummary] = useState<{
    openingBalance: number; totalDebit: number; totalCredit: number;
    totalAdjustments: number; closingBalance: number; ordersCount: number;
  } | null>(null);

  const { data, isLoading } = useQuery<DetailResponse>({
    queryKey: ["client-account-detail", phone],
    queryFn: () => apiFetch<DetailResponse>(`/client-account-sheet/detail?phone=${encodeURIComponent(phone)}`),
    enabled: !!phone,
  });

  const { data: profileData } = useQuery({
    queryKey: ["client-account-pro-profile", phone],
    queryFn: () => clientAccountProApi.getProfile(phone),
    enabled: !!phone,
  });
  const client = profileData?.client ?? null;
  const isSuspended = client?.accountStatus === "suspended";

  const { data: statementData, isLoading: statementLoading } = useQuery({
    queryKey: ["client-account-pro-statement", phone],
    queryFn: () => clientAccountProApi.getStatement(phone),
    enabled: !!phone,
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ["client-account-pro-payments", phone],
    queryFn: () => clientAccountProApi.getPayments(phone),
    enabled: !!phone,
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ["client-account-pro-invoices", phone],
    queryFn: () => clientAccountProApi.getInvoices(phone),
    enabled: !!phone,
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["client-account-pro-analytics", phone],
    queryFn: () => clientAccountProApi.getAnalytics(phone),
    enabled: !!phone,
  });

  const { data: adjustmentsData, isLoading: adjustmentsLoading } = useQuery({
    queryKey: ["client-account-pro-adjustments", phone],
    queryFn: () => clientAccountProApi.getAdjustments(phone),
    enabled: !!phone,
  });

  const { data: periodsData, isLoading: periodsLoading } = useQuery({
    queryKey: ["client-account-pro-periods", phone],
    queryFn: () => clientAccountProApi.getPeriods(phone),
    enabled: !!phone,
  });

  // ── معاينة إقفال الفترة قبل التنفيذ: بتتحدث تلقائيًا مع تغيير التواريخ ──
  const { data: closePreviewData, isFetching: closePreviewLoading, error: closePreviewError } = useQuery({
    queryKey: ["client-account-pro-close-preview", phone, closePeriodForm.periodFrom, closePeriodForm.periodTo],
    queryFn: () => clientAccountProApi.previewPeriodClose({
      phone, periodFrom: closePeriodForm.periodFrom, periodTo: closePeriodForm.periodTo,
    }),
    enabled: !!phone && closePeriodDialogOpen && !closeSummary && !!closePeriodForm.periodFrom && !!closePeriodForm.periodTo,
    retry: false,
  });

  const creditStatus = profileData?.creditStatus ?? null;

  const saveProfileMutation = useMutation({
    mutationFn: () => clientAccountProApi.updateProfile({
      phone, name: data?.client?.name,
      email: profileForm!.email || null, city: profileForm!.city || null, address: profileForm!.address || null,
      creditLimit: Number(profileForm!.creditLimit || 0), paymentMethod: profileForm!.paymentMethod,
      internalNotes: profileForm!.internalNotes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-profile", phone] });
      toast({ title: "تم حفظ بيانات العميل" });
      setEditingProfile(false);
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

  const createPaymentMutation = useMutation({
    mutationFn: () => clientAccountProApi.createPayment({
      phone, amount: Number(paymentForm.amount), paymentMethod: paymentForm.paymentMethod,
      receiptNumber: paymentForm.receiptNumber || null, notes: paymentForm.notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-payments", phone] });
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-statement", phone] });
      toast({ title: "تم تسجيل التحصيل" });
      setPaymentDialogOpen(false);
      setPaymentForm({ amount: "", paymentMethod: "cash", receiptNumber: "", notes: "" });
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id: number) => clientAccountProApi.deletePayment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-payments", phone] });
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-statement", phone] });
      toast({ title: "تم حذف التحصيل" });
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  const createAdjustmentMutation = useMutation({
    mutationFn: (form: { type: AdjustmentType; direction: AdjustmentDirection; amount: string; reason: string }) =>
      clientAccountProApi.createAdjustment({
        phone, type: form.type, direction: form.direction,
        amount: Number(form.amount), reason: form.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-adjustments", phone] });
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-profile", phone] });
      toast({ title: "تم إضافة التسوية" });
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  const voidAdjustmentMutation = useMutation({
    mutationFn: (id: number) => clientAccountProApi.voidAdjustment(id, "إلغاء يدوي"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-adjustments", phone] });
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-profile", phone] });
      toast({ title: "تم إلغاء التسوية" });
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  const closePeriodMutation = useMutation({
    mutationFn: () => clientAccountProApi.closePeriod({
      phone, periodFrom: closePeriodForm.periodFrom, periodTo: closePeriodForm.periodTo,
      notes: closePeriodForm.notes || null,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-periods", phone] });
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-profile", phone] });
      setCloseSummary(res.summary);
      toast({ title: "تم إقفال الفترة بنجاح" });
    },
    onError: (e: any) => toast({ title: "تعذر إقفال الفترة", description: e.message, variant: "destructive" }),
  });

  const reopenPeriodMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => clientAccountProApi.reopenPeriod(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-periods", phone] });
      queryClient.invalidateQueries({ queryKey: ["client-account-pro-profile", phone] });
      toast({ title: "تم إعادة فتح الفترة" });
    },
    onError: (e: any) => toast({ title: "حصل خطأ", description: e.message, variant: "destructive" }),
  });

  const collectionPct = data?.totals && data.totals.totalShippingValue > 0
    ? Math.round((data.totals.totalCollected / data.totals.totalShippingValue) * 100)
    : 0;

  const returnedCount = useMemo(() => {
    const s = data?.statusDistribution.find(x => x.status === "returned");
    return s?.count ?? 0;
  }, [data?.statusDistribution]);

  const returnedPct = data?.totals?.ordersCount
    ? Math.round((returnedCount / data.totals.ordersCount) * 100 * 10) / 10
    : 0;

  const statementEntries = useMemo(() => {
    const entries = statementData?.entries ?? [];
    if (!statementFrom && !statementTo) return entries;
    return entries.filter(e => {
      const t = new Date(e.date).getTime();
      if (statementFrom && t < new Date(statementFrom).getTime()) return false;
      if (statementTo && t > new Date(statementTo).getTime() + 86400000) return false;
      return true;
    });
  }, [statementData?.entries, statementFrom, statementTo]);

  const startEditProfile = () => {
    if (!client) {
      setProfileForm({ email: "", city: "", address: "", creditLimit: "0", paymentMethod: "cod", internalNotes: "" });
    } else {
      setProfileForm({
        email: client.email ?? "", city: client.city ?? "", address: client.address ?? "",
        creditLimit: client.creditLimit ?? "0", paymentMethod: client.paymentMethod, internalNotes: client.internalNotes ?? "",
      });
    }
    setEditingProfile(true);
  };

  const exportStatementCsv = () => {
    const rows = [["التاريخ", "البيان", "مدين", "دائن", "الرصيد"]];
    statementEntries.forEach(e => rows.push([
      fmtDate(e.date), e.description,
      e.type === "debit" ? String(e.amount) : "", e.type === "credit" ? String(e.amount) : "", String(e.balance),
    ]));
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `كشف-حساب-${data?.client?.name ?? phone}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const monthly = analyticsData?.monthly ?? [];
  const returnRateValues = monthly.map(m => m.shipmentsCount > 0 ? Math.round((m.returned / m.shipmentsCount) * 1000) / 10 : 0);
  const successRateValues = monthly.map(m => m.shipmentsCount > 0 ? Math.round((m.delivered / m.shipmentsCount) * 1000) / 10 : 0);
  const revenueValues = monthly.map(m => m.totalAmount);
  const shipmentsCountValues = monthly.map(m => m.shipmentsCount);

  // ── تجميع "آخر النشاط" من التحصيلات + الفواتير + الإقفالات مرتبة بالوقت ──
  const activityFeed = useMemo(() => {
    const items: { icon: any; color: string; title: string; sub: string; at: string }[] = [];
    (paymentsData?.payments ?? []).forEach(p => items.push({
      icon: Wallet, color: "#10b981",
      title: `تم تسجيل دفعة بمبلغ ${fmt(p.amount)} ج.م`,
      sub: p.receiptNumber ? `إيصال ${p.receiptNumber}` : PAYMENT_METHOD_LABELS[p.paymentMethod],
      at: p.paidAt,
    }));
    (invoicesData?.invoices ?? []).forEach(inv => items.push({
      icon: Receipt, color: "#3b82f6",
      title: `تم إصدار فاتورة ${inv.invoiceNumber}`,
      sub: `${fmt(inv.totalAmount)} ج.م`,
      at: inv.createdAt,
    }));
    (data?.closures ?? []).forEach(c => items.push({
      icon: Ban, color: "#ef4444",
      title: "تم إقفال الحساب",
      sub: c.closedByName ? `بواسطة ${c.closedByName}` : "",
      at: c.createdAt,
    }));
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);
  }, [paymentsData?.payments, invoicesData?.invoices, data?.closures]);

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-16 text-sm">جاري التحميل...</p>;
  }

  if (!data?.client) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm">مفيش بيانات لهذا العميل</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigate(`/finance/client-account-sheet`)}>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
        <span>العملاء</span>
        <span>›</span>
        <span className="text-foreground font-medium">تفاصيل العميل</span>
      </div>

      {/* ══════════════ Header ══════════════ */}
      <div className="rounded-[22px] p-5 relative overflow-hidden"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <div className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(201,162,39,0.6), transparent)" }} />
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0"
              style={{ background: "rgba(201,162,39,0.15)", border: "2px solid rgba(201,162,39,0.35)", color: "#c9a227" }}>
              {initials(data.client.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black">{data.client.name}</h1>
                {isSuspended ? (
                  <Badge variant="outline" className="text-red-400 bg-red-900/10 border-red-700 gap-1 text-[10px]">
                    <ShieldAlert className="w-3 h-3" /> موقوف
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-emerald-400 bg-emerald-900/10 border-emerald-700 gap-1 text-[10px]">
                    <ShieldCheck className="w-3 h-3" /> نشط
                  </Badge>
                )}
                {creditStatus?.overLimit && (
                  <Badge variant="outline" className="text-red-400 bg-red-900/10 border-red-700 gap-1 text-[10px]">
                    <AlertTriangle className="w-3 h-3" /> تجاوز حد الائتمان بـ {fmt(creditStatus.overLimitAmount)} ج.م
                  </Badge>
                )}
                {client?.lastClosedPeriodTo && (
                  <Badge variant="outline" className="text-blue-400 bg-blue-900/10 border-blue-700 gap-1 text-[10px]">
                    <Lock className="w-3 h-3" /> مقفول حتى {fmtDate(client.lastClosedPeriodTo)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap mt-2">
                {client?.accountNumber && <span>رقم العميل: {client.accountNumber}</span>}
                {data.client.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {data.client.phone}</span>}
                {client?.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {client.email}</span>}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap mt-1.5">
                <span>حد الائتمان: <b className="text-foreground">{fmt(client?.creditLimit ?? 0)} ج.م</b></span>
                <span>طريقة الدفع: <b className="text-foreground">{RECEIVER_PAYMENT_METHOD_LABELS[client?.paymentMethod ?? "cod"]}</b></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <HealthScoreRing score={analyticsData?.healthScore ?? 0} />
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" className="gap-1.5" onClick={() => setPaymentDialogOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> تسجيل دفعة
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={exportStatementCsv}>
                <Send className="w-3.5 h-3.5" /> إرسال كشف حساب
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-[#c9a227] border-[#c9a227]/40"
                title="إقفال محاسبي لفترة زمنية: يحسب الرصيد الافتتاحي والختامي (لا يقفل الأوردرات نفسها)"
                onClick={() => { setCloseSummary(null); setClosePeriodDialogOpen(true); }}>
                <Lock className="w-3.5 h-3.5" /> إقفال فترة حساب
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    المزيد <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={startEditProfile}>تعديل بيانات العميل</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab("adjustments")}>إضافة تسوية/خصم</DropdownMenuItem>
                  {isSuspended ? (
                    <DropdownMenuItem onClick={() => suspendMutation.mutate(false)} className="text-emerald-500">
                      تفعيل الحساب
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => setSuspendDialogOpen(true)} className="text-red-500">
                      تعليق الحساب
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════ 6 Stat Cards ══════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="إجمالي المستحقات" value={`${fmt(data.totals?.totalRemaining)} ج.م`} icon={Wallet} color="#f59e0b" />
        <StatCard label="إجمالي المحصل" value={`${fmt(data.totals?.totalCollected)} ج.م`} icon={CheckCircle2} color="#10b981" sub={`${collectionPct}% نسبة تحصيل`} />
        <StatCard label="المبالغ المعلقة" value={`${fmt(data.totals?.totalRemaining)} ج.م`} icon={RotateCcw} color="#3b82f6" />
        <StatCard label="إجمالي الشحنات" value={fmt(data.totals?.ordersCount)} icon={Users2} color="#8b5cf6" sub={`${fmt(data.weeklyShipments)} آخر 7 أيام`} />
        <StatCard label="الشحنات المسلمة" value={fmt(data.statusDistribution.find(s => s.status === "delivered")?.count ?? 0)} icon={MessageSquareText} color="#06b6d4" />
        <StatCard label="المرتجعات" value={fmt(returnedCount)} icon={Ban} color="#ef4444" sub={`${returnedPct}% نسبة المرتجعات`} trend="down" />
      </div>

      {/* ══════════════ Tabs Bar ══════════════ */}
      <div className="flex items-center gap-1 rounded-2xl p-1.5 overflow-x-auto"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        {([
          ["statement", "كشف الحساب", Wallet],
          ["payments", "المدفوعات", CreditCard],
          ["invoices", "الفواتير", Receipt],
          ["analytics", "التحليلات", Activity],
          ["adjustments", "التسويات", ShieldAlert],
          ["closures", "الإقفالات السابقة", Ban],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              activeTab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ══════════════ محتوى: كشف الحساب + آخر الفواتير ══════════════ */}
      {activeTab === "statement" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={exportStatementCsv}>
                <FileSpreadsheet className="w-3.5 h-3.5" /> تصدير Excel
              </Button>
              <div className="flex items-center gap-2">
                <Input type="date" className="h-8 text-xs w-36" value={statementTo} onChange={e => setStatementTo(e.target.value)} />
                <span className="text-[10px] text-muted-foreground">إلى تاريخ</span>
                <Input type="date" className="h-8 text-xs w-36" value={statementFrom} onChange={e => setStatementFrom(e.target.value)} />
                <span className="text-[10px] text-muted-foreground">من تاريخ</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl p-2.5 text-center bg-muted/10">
                <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي مدين</p>
                <p className="text-sm font-black text-blue-400">{fmt(statementData?.totalDebit)}</p>
              </div>
              <div className="rounded-xl p-2.5 text-center bg-muted/10">
                <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي دائن</p>
                <p className="text-sm font-black text-emerald-400">{fmt(statementData?.totalCredit)}</p>
              </div>
              <div className="rounded-xl p-2.5 text-center bg-muted/10">
                <p className="text-[10px] text-muted-foreground mb-0.5">الرصيد الحالي</p>
                <p className={`text-sm font-black ${(statementData?.currentBalance ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {fmt(statementData?.currentBalance)}
                </p>
              </div>
            </div>

            {statementLoading ? (
              <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] font-bold text-muted-foreground">
                      <th className="text-right py-2 px-2">التاريخ</th>
                      <th className="text-right py-2 px-2">نوع العملية</th>
                      <th className="text-right py-2 px-2">مدين (ج.م)</th>
                      <th className="text-right py-2 px-2">دائن (ج.م)</th>
                      <th className="text-right py-2 px-2">الرصيد (ج.م)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementEntries.map((e, idx) => (
                      <tr key={`${e.type}-${e.refId}-${idx}`} className="border-b border-border/40 hover:bg-muted/10">
                        <td className="py-2.5 px-2 whitespace-nowrap text-muted-foreground">{fmtDateTime(e.date)}</td>
                        <td className="py-2.5 px-2">
                          <span className="flex items-center gap-1.5">
                            {e.type === "debit"
                              ? <ArrowDownCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              : <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                            {e.description}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 font-bold text-blue-400">{e.type === "debit" ? fmt(e.amount) : "-"}</td>
                        <td className="py-2.5 px-2 font-bold text-emerald-400">{e.type === "credit" ? fmt(e.amount) : "-"}</td>
                        <td className="py-2.5 px-2 font-bold">{fmt(e.balance)}</td>
                      </tr>
                    ))}
                    {statementEntries.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد حركات</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* آخر الفواتير — sidebar */}
          <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" /> آخر الفواتير</p>
              <button className="text-[11px] text-primary hover:underline" onClick={() => setActiveTab("invoices")}>عرض كل الفواتير</button>
            </div>
            <div className="space-y-2">
              {(invoicesData?.invoices ?? []).slice(0, 5).map(inv => {
                const cfg = inv.status === "paid"
                  ? { label: "مدفوعة", color: "text-emerald-400", bg: "bg-emerald-900/10", border: "border-emerald-700" }
                  : inv.status === "partial"
                  ? { label: "مدفوعة جزئياً", color: "text-amber-400", bg: "bg-amber-900/10", border: "border-amber-700" }
                  : { label: "غير مدفوعة", color: "text-red-400", bg: "bg-red-900/10", border: "border-red-700" };
                return (
                  <div key={inv.id} className="rounded-xl p-2.5 bg-muted/10 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-primary truncate">{inv.invoiceNumber}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(inv.createdAt)}</p>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-xs font-bold">{fmt(inv.totalAmount)}</p>
                      <Badge variant="outline" className={`${cfg.border} ${cfg.bg} ${cfg.color} text-[9px] mt-1`}>{cfg.label}</Badge>
                    </div>
                  </div>
                );
              })}
              {(invoicesData?.invoices ?? []).length === 0 && (
                <p className="text-center text-muted-foreground text-xs py-6">لا توجد فواتير</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ محتوى: المدفوعات ══════════════ */}
      {activeTab === "payments" && (
        <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">سجل التحصيلات ({(paymentsData?.payments ?? []).length})</p>
            <Button size="sm" className="gap-1.5" onClick={() => setPaymentDialogOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> تسجيل تحصيل
            </Button>
          </div>
          {paymentsLoading ? (
            <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold text-muted-foreground">
                    <th className="text-right py-2 px-2">التاريخ</th>
                    <th className="text-right py-2 px-2">المبلغ</th>
                    <th className="text-right py-2 px-2">طريقة الدفع</th>
                    <th className="text-right py-2 px-2">رقم الإيصال</th>
                    <th className="text-right py-2 px-2">استلمها</th>
                    <th className="text-right py-2 px-2">ملاحظات</th>
                    <th className="text-left py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(paymentsData?.payments ?? []).map(p => (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-muted/10">
                      <td className="py-2.5 px-2 whitespace-nowrap text-muted-foreground">{fmtDate(p.paidAt)}</td>
                      <td className="py-2.5 px-2 font-bold text-emerald-400">{fmt(p.amount)}</td>
                      <td className="py-2.5 px-2">{PAYMENT_METHOD_LABELS[p.paymentMethod]}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{p.receiptNumber || "—"}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{p.receivedByName || "—"}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{p.notes || "—"}</td>
                      <td className="py-2.5 px-2 text-left">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-500"
                          onClick={() => deletePaymentMutation.mutate(p.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(paymentsData?.payments ?? []).length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد تحصيلات مسجلة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ محتوى: الفواتير ══════════════ */}
      {activeTab === "invoices" && (
        <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <p className="text-sm font-bold mb-3">الفواتير ({(invoicesData?.invoices ?? []).length})</p>
          {invoicesLoading ? (
            <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(invoicesData?.invoices ?? []).map(inv => {
                const cfg = inv.status === "paid"
                  ? { label: "مدفوعة", color: "text-emerald-400", bg: "bg-emerald-900/10", border: "border-emerald-700" }
                  : inv.status === "partial"
                  ? { label: "مدفوعة جزئياً", color: "text-amber-400", bg: "bg-amber-900/10", border: "border-amber-700" }
                  : { label: "غير مدفوعة", color: "text-red-400", bg: "bg-red-900/10", border: "border-red-700" };
                const remaining = Number(inv.totalAmount) - Number(inv.paidAmount);
                return (
                  <div key={inv.id} className="rounded-xl p-3.5 bg-muted/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm flex items-center gap-1.5"><Receipt className="w-4 h-4 text-primary" /> {inv.invoiceNumber}</span>
                      <Badge variant="outline" className={`${cfg.border} ${cfg.bg} ${cfg.color}`}>{cfg.label}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mt-3">
                      <div><p className="text-[10px] text-muted-foreground">الإجمالي</p><p className="text-sm font-bold">{fmt(inv.totalAmount)}</p></div>
                      <div><p className="text-[10px] text-muted-foreground">المدفوع</p><p className="text-sm font-bold text-emerald-400">{fmt(inv.paidAmount)}</p></div>
                      <div><p className="text-[10px] text-muted-foreground">المتبقي</p><p className="text-sm font-bold text-amber-400">{fmt(remaining)}</p></div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-3">{inv.shipmentIds.length} شحنة — {fmtDate(inv.createdAt)}</p>
                  </div>
                );
              })}
              {(invoicesData?.invoices ?? []).length === 0 && (
                <div className="col-span-full text-center py-8 text-muted-foreground">لا توجد فواتير</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ محتوى: التحليلات ══════════════ */}
      {activeTab === "analytics" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <p className="text-xs text-muted-foreground mb-1">الإيرادات الشهرية (ج.م)</p>
            <p className="text-lg font-black mb-2">{fmt(revenueValues.at(-1) ?? 0)}</p>
            <MiniSparkline values={revenueValues} color="#8b5cf6" />
          </div>
          <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <p className="text-xs text-muted-foreground mb-1">عدد الشحنات شهرياً</p>
            <p className="text-lg font-black mb-2">{fmt(shipmentsCountValues.at(-1) ?? 0)}</p>
            <MiniSparkline values={shipmentsCountValues} color="#3b82f6" />
          </div>
          <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <p className="text-xs text-muted-foreground mb-1">نسبة النجاح (%)</p>
            <p className="text-lg font-black mb-2 text-emerald-400">{successRateValues.at(-1) ?? 0}%</p>
            <MiniSparkline values={successRateValues} color="#10b981" />
          </div>
          <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <p className="text-xs text-muted-foreground mb-1">نسبة المرتجعات (%)</p>
            <p className="text-lg font-black mb-2 text-red-400">{returnRateValues.at(-1) ?? 0}%</p>
            <MiniSparkline values={returnRateValues} color="#ef4444" />
          </div>

          <div className="md:col-span-2 rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <p className="text-sm font-bold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> توزيع الشحنات بالمحافظة</p>
            <div className="space-y-2">
              {(analyticsData?.byGovernorate ?? []).slice(0, 8).map(g => {
                const maxCount = Math.max(1, ...(analyticsData?.byGovernorate ?? []).map(x => x.count));
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
              {(analyticsData?.byGovernorate ?? []).length === 0 && (
                <p className="text-center text-muted-foreground text-xs py-4">لا توجد بيانات</p>
              )}
            </div>
          </div>

          {analyticsLoading && (
            <div className="md:col-span-2 p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>
          )}
        </div>
      )}

      {/* ══════════════ محتوى: التسويات/الخصومات ══════════════ */}
      {activeTab === "adjustments" && (
        <AdjustmentsTab
          adjustments={adjustmentsData?.adjustments ?? []}
          isLoading={adjustmentsLoading}
          onCreate={(form) => createAdjustmentMutation.mutate(form)}
          isCreating={createAdjustmentMutation.isPending}
          onVoid={(id) => voidAdjustmentMutation.mutate(id)}
        />
      )}

      {/* ══════════════ محتوى: الإقفالات السابقة ══════════════ */}
      {activeTab === "closures" && (
        <ClosuresTab
          closures={data.closures}
          periods={periodsData?.periods ?? []}
          periodsLoading={periodsLoading}
          onReopenPeriod={(id) => reopenPeriodMutation.mutate({ id, reason: "تصحيح يدوي" })}
        />
      )}

      {/* ══════════════ 3 أعمدة سفلية: مدفوعات / تحليلات مصغرة / نشاط ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* آخر المدفوعات */}
        <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">آخر المدفوعات</p>
            <button className="text-[11px] text-primary hover:underline" onClick={() => setActiveTab("payments")}>عرض الكل</button>
          </div>
          <div className="space-y-2">
            {(paymentsData?.payments ?? []).slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl p-2.5 bg-muted/10">
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{PAYMENT_METHOD_LABELS[p.paymentMethod]}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.receiptNumber || fmtDate(p.paidAt)}</p>
                </div>
                <p className="text-xs font-bold text-emerald-400 shrink-0">{fmt(p.amount)}</p>
              </div>
            ))}
            {(paymentsData?.payments ?? []).length === 0 && (
              <p className="text-center text-muted-foreground text-xs py-6">لا توجد مدفوعات</p>
            )}
          </div>
        </div>

        {/* تحليلات العميل — mini charts */}
        <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <p className="text-sm font-bold mb-3">تحليلات العميل</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">عدد الشحنات شهرياً</span>
                <span className="text-[10px] font-bold text-blue-400">{fmt(data.totals?.ordersCount)}</span>
              </div>
              <MiniSparkline values={shipmentsCountValues} color="#3b82f6" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">نسبة النجاح</span>
                <span className="text-[10px] font-bold text-emerald-400">{successRateValues.at(-1) ?? 0}%</span>
              </div>
              <MiniSparkline values={successRateValues} color="#10b981" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">نسبة المرتجعات</span>
                <span className="text-[10px] font-bold text-red-400">{returnedPct}%</span>
              </div>
              <MiniSparkline values={returnRateValues} color="#ef4444" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">إجمالي الإيرادات</span>
                <span className="text-[10px] font-bold text-purple-400">{fmt(data.totals?.totalShippingValue)}</span>
              </div>
              <MiniSparkline values={revenueValues} color="#8b5cf6" />
            </div>
          </div>
        </div>

        {/* آخر النشاط */}
        <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">آخر النشاط</p>
          </div>
          <div className="space-y-2.5">
            {activityFeed.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${item.color}18` }}>
                  <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{item.title}</p>
                  {item.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{timeAgo(item.at)}</span>
              </div>
            ))}
            {activityFeed.length === 0 && (
              <p className="text-center text-muted-foreground text-xs py-6">لا يوجد نشاط بعد</p>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════ Dialogs ══════════════ */}
      <Dialog open={editingProfile} onOpenChange={setEditingProfile}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل بيانات العميل</DialogTitle></DialogHeader>
          {profileForm && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">البريد الإلكتروني</label>
                <Input value={profileForm.email} onChange={e => setProfileForm(f => ({ ...f!, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">المدينة</label>
                <Input value={profileForm.city} onChange={e => setProfileForm(f => ({ ...f!, city: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] text-muted-foreground mb-1 block">العنوان</label>
                <Input value={profileForm.address} onChange={e => setProfileForm(f => ({ ...f!, address: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">حد الائتمان</label>
                <Input type="number" value={profileForm.creditLimit} onChange={e => setProfileForm(f => ({ ...f!, creditLimit: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">طريقة الدفع الافتراضية</label>
                <Select value={profileForm.paymentMethod} onValueChange={v => setProfileForm(f => ({ ...f!, paymentMethod: v as ReceiverPaymentMethod }))}>
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
                <Textarea value={profileForm.internalNotes} onChange={e => setProfileForm(f => ({ ...f!, internalNotes: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProfile(false)}>إلغاء</Button>
            <Button className="gap-1.5" disabled={saveProfileMutation.isPending} onClick={() => saveProfileMutation.mutate()}>
              <Save className="w-3.5 h-3.5" /> حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعليق حساب العميل</DialogTitle></DialogHeader>
          <Textarea placeholder="سبب التعليق (اختياري)..." value={suspendReason} onChange={e => setSuspendReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>إلغاء</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={suspendMutation.isPending} onClick={() => suspendMutation.mutate(true)}>
              تأكيد التعليق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تسجيل تحصيل جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">المبلغ</label>
              <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">طريقة الدفع</label>
              <Select value={paymentForm.paymentMethod} onValueChange={v => setPaymentForm(f => ({ ...f, paymentMethod: v as ClientPaymentMethod }))}>
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
              <Input value={paymentForm.receiptNumber} onChange={e => setPaymentForm(f => ({ ...f, receiptNumber: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">ملاحظات (اختياري)</label>
              <Textarea value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>إلغاء</Button>
            <Button disabled={!paymentForm.amount || createPaymentMutation.isPending} onClick={() => createPaymentMutation.mutate()}>
              تسجيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ Dialog: إقفال فترة حساب رسمي ══════════════ */}
      <Dialog open={closePeriodDialogOpen} onOpenChange={(open) => { setClosePeriodDialogOpen(open); if (!open) setCloseSummary(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="w-4 h-4 text-[#c9a227]" /> إقفال فترة حساب</DialogTitle></DialogHeader>
          {!closeSummary ? (
            <>
              <div className="space-y-3">
                {client?.lastClosedPeriodTo && (
                  <p className="text-[11px] text-amber-400 bg-amber-900/10 border border-amber-700/40 rounded-lg p-2">
                    آخر إقفال كان حتى {fmtDate(client.lastClosedPeriodTo)}. الفترة الجديدة لازم تبدأ بعد التاريخ ده.
                  </p>
                )}
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">من تاريخ</label>
                  <Input type="date" value={closePeriodForm.periodFrom} onChange={e => setClosePeriodForm(f => ({ ...f, periodFrom: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">إلى تاريخ</label>
                  <Input type="date" value={closePeriodForm.periodTo} onChange={e => setClosePeriodForm(f => ({ ...f, periodTo: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">ملاحظات (اختياري)</label>
                  <Textarea value={closePeriodForm.notes} onChange={e => setClosePeriodForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                {/* ── معاينة فورية قبل الإقفال الفعلي ── */}
                {closePeriodForm.periodFrom && closePeriodForm.periodTo && (
                  <div className="pt-1">
                    {closePreviewLoading ? (
                      <div className="p-4 text-center text-muted-foreground text-xs">
                        <Loader2 className="w-4 h-4 mx-auto mb-1.5 animate-spin" /> جاري حساب المعاينة...
                      </div>
                    ) : closePreviewError ? (
                      <p className="text-[11px] text-red-400 bg-red-900/10 border border-red-700/40 rounded-lg p-2">
                        {(closePreviewError as any)?.message || "تعذر حساب معاينة الإقفال"}
                      </p>
                    ) : closePreviewData?.summary ? (
                      <div className="space-y-2 rounded-xl p-3" style={{ background: "hsl(var(--muted)/0.15)" }}>
                        <p className="text-[11px] font-bold text-muted-foreground mb-1">معاينة الإقفال</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/40"><span className="text-[10px] text-muted-foreground">رصيد افتتاحي</span><b>{fmt(closePreviewData.summary.openingBalance)}</b></div>
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/40"><span className="text-[10px] text-muted-foreground">شحنات الفترة</span><b>{fmt(closePreviewData.summary.totalDebit)}</b></div>
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/40"><span className="text-[10px] text-muted-foreground">تحصيل الفترة</span><b className="text-emerald-400">{fmt(closePreviewData.summary.totalCredit)}</b></div>
                          <div className="flex items-center justify-between p-2 rounded-lg bg-background/40"><span className="text-[10px] text-muted-foreground">تسويات</span><b className="text-amber-400">{fmt(closePreviewData.summary.totalAdjustments)}</b></div>
                        </div>
                        <div className={`flex items-center justify-between p-2.5 rounded-lg font-black ${closePreviewData.summary.closingBalance > 0 ? "text-red-400" : "text-emerald-400"}`}
                          style={{ background: closePreviewData.summary.closingBalance > 0 ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)" }}>
                          <span className="text-xs">الرصيد المتوقع بعد الإقفال</span>
                          <span className="text-sm">{fmt(closePreviewData.summary.closingBalance)} ج.م</span>
                        </div>

                        {closePreviewData.summary.closingBalance > 0 && (
                          <p className="text-[11px] text-red-400 bg-red-900/10 border border-red-700/40 rounded-lg p-2 flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            هيقفل والعميل لسه عليه {fmt(closePreviewData.summary.closingBalance)} ج.م
                          </p>
                        )}
                        {closePreviewData.summary.overLimit && (
                          <p className="text-[11px] text-red-400 bg-red-900/10 border border-red-700/40 rounded-lg p-2 flex items-start gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            الرصيد الختامي متجاوز حد الائتمان بمقدار {fmt(closePreviewData.summary.overLimitAmount)} ج.م
                          </p>
                        )}
                        {closePreviewData.summary.unpaidInvoicesCount > 0 && (
                          <p className="text-[11px] text-amber-400 bg-amber-900/10 border border-amber-700/40 rounded-lg p-2 flex items-start gap-1.5">
                            <Receipt className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            فيه {closePreviewData.summary.unpaidInvoicesCount} فاتورة غير محصلة بالكامل ({fmt(closePreviewData.summary.unpaidInvoicesTotal)} ج.م)
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground text-center">{closePreviewData.summary.ordersCount} شحنة ستُضمّن فى هذه الفترة</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setClosePeriodDialogOpen(false)}>إلغاء</Button>
                <Button disabled={!closePeriodForm.periodFrom || !closePeriodForm.periodTo || closePeriodMutation.isPending}
                  onClick={() => closePeriodMutation.mutate()}>
                  {closePreviewData?.summary?.closingBalance != null && closePreviewData.summary.closingBalance > 0
                    ? "إقفال رغم وجود مديونية"
                    : "إقفال الفترة"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10"><span>رصيد افتتاحي</span><b>{fmt(closeSummary.openingBalance)} ج.م</b></div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10"><span>+ شحنات الفترة</span><b>{fmt(closeSummary.totalDebit)} ج.م</b></div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10"><span>- تحصيلات الفترة</span><b className="text-emerald-400">{fmt(closeSummary.totalCredit)} ج.م</b></div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10"><span>تسويات الفترة</span><b className="text-amber-400">{fmt(closeSummary.totalAdjustments)} ج.م</b></div>
                <div className="flex items-center justify-between p-3 rounded-lg font-black" style={{ background: "rgba(201,162,39,0.12)", color: "#c9a227" }}>
                  <span>الرصيد الختامي</span><span className="text-base">{fmt(closeSummary.closingBalance)} ج.م</span>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">{closeSummary.ordersCount} شحنة تم تضمينها فى هذه الفترة</p>
              </div>
              <DialogFooter>
                <Button onClick={() => { setClosePeriodDialogOpen(false); setCloseSummary(null); setClosePeriodForm({ periodFrom: "", periodTo: "", notes: "" }); }}>
                  تم
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
