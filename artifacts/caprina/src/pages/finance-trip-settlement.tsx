import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Lock, CheckCircle2, Truck, Users, Archive,
  Wallet, Smartphone, Building2, Banknote, AlertTriangle, TrendingDown,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

const api = {
  get:   (url: string) => apiFetch<any>(url),
  post:  (url: string, body?: any) => apiFetch<any>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: (url: string, body: any) => apiFetch<any>(url, { method: "PATCH", body: JSON.stringify(body) }),
  del:   (url: string) => apiFetch<void>(url, { method: "DELETE" }),
};

const fmt = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n) + " ج.م";

const METHOD_LABELS: Record<string, { label: string; Icon: any; color: string }> = {
  cash:          { label: "كاش",         Icon: Banknote,   color: "#22c55e" },
  vodafone_cash: { label: "فودافون كاش", Icon: Smartphone, color: "#e11d48" },
  alix_branch:   { label: "فرع ALIX",    Icon: Building2,  color: "#3b82f6" },
  instapay:      { label: "انستا",       Icon: Wallet,     color: "#8b5cf6" },
  other:         { label: "أخرى",        Icon: Wallet,     color: "#64748b" },
};

type RepPayment = { id: number; method: string; amount: string; note?: string | null };
type Rep = {
  id: number; repName: string; status: string; balance: string; notes?: string | null;
  payments: RepPayment[];
};
type ClientRow = {
  id: number; clientId?: number | null; clientName: string;
  alixAmount: string; vcashAmount: string; cashAmount: string; balance: string;
  status: string; paidAmount?: string | null; notes?: string | null;
  isRolledOver?: number; rolledFromId?: number | null; negativeStreak?: number;
};
type Settlement = {
  id: number; settlementNumber: string; title?: string | null; status: string;
  totalRepsBalance?: string | null; totalClientsBalance?: string | null; netBalance?: string | null;
  createdAt: string; closedAt?: string | null;
};

export default function FinanceTripSettlement() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [viewingId, setViewingId] = useState<number | "current" | null>("current");
  const [showArchive, setShowArchive] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closePayments, setClosePayments] = useState<Record<number, { vodafone_cash: string; instapay: string }>>({});
  const [settleTarget, setSettleTarget] = useState<ClientRow | null>(null);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState("");
  const [addRepOpen, setAddRepOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState<"all" | "paid" | "pending">("all");
  const [editingRepId, setEditingRepId] = useState<number | null>(null);
  const [editingRepName, setEditingRepName] = useState("");

  // ── جلب البيان الحالي (لو viewingId === "current") أو بيان مؤرشف محدد ──────
  const { data: currentData } = useQuery({
    queryKey: ["trip-settlement-current"],
    queryFn: () => api.get("/trip-settlements/current"),
    enabled: viewingId === "current",
  });

  const activeId = viewingId === "current" ? currentData?.settlement?.id : viewingId;

  const { data: detail, isLoading } = useQuery({
    queryKey: ["trip-settlement-detail", activeId],
    queryFn: () => api.get(`/trip-settlements/${activeId}`),
    enabled: !!activeId,
  });

  const { data: archiveList } = useQuery({
    queryKey: ["trip-settlements-list"],
    queryFn: () => api.get("/trip-settlements"),
    enabled: showArchive,
  });

  const settlement: Settlement | undefined = detail?.settlement;
  const reps: Rep[] = detail?.reps ?? [];
  const clients: ClientRow[] = detail?.clients ?? [];
  const filteredClients = clients.filter(c => {
    if (clientFilter === "paid") return c.status === "paid";
    if (clientFilter === "pending") return c.status !== "paid";
    return true;
  });
  const isOpen = settlement?.status === "open";

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["trip-settlement-current"] });
    qc.invalidateQueries({ queryKey: ["trip-settlement-detail"] });
    qc.invalidateQueries({ queryKey: ["trip-settlements-list"] });
  }

  // ── mutations ──────────────────────────────────────────────────────────────
  const addRep = useMutation({
    mutationFn: (body: { repName: string; notes?: string }) => api.post(`/trip-settlements/${activeId}/reps`, body),
    onSuccess: () => { invalidateAll(); setAddRepOpen(false); toast({ title: "تمت إضافة المندوب" }); },
    onError: () => toast({ title: "خطأ في الإضافة", variant: "destructive" }),
  });

  const deleteRep = useMutation({
    mutationFn: (id: number) => api.del(`/trip-settlements/reps/${id}`),
    onSuccess: () => invalidateAll(),
  });

  const addClient = useMutation({
    mutationFn: (body: any) => api.post(`/trip-settlements/${activeId}/clients`, body),
    onSuccess: () => { invalidateAll(); setAddClientOpen(false); toast({ title: "تمت إضافة العميل" }); },
    onError: () => toast({ title: "خطأ في الإضافة", variant: "destructive" }),
  });

  const deleteClient = useMutation({
    mutationFn: (id: number) => api.del(`/trip-settlements/clients/${id}`),
    onSuccess: () => invalidateAll(),
  });

  const renameRep = useMutation({
    mutationFn: ({ id, repName }: { id: number; repName: string }) =>
      api.patch(`/trip-settlements/reps/${id}`, { repName }),
    onSuccess: () => invalidateAll(),
    onError: () => toast({ title: "خطأ في تعديل الاسم", variant: "destructive" }),
  });

  const settleClient = useMutation({
    mutationFn: ({ id, paymentMethod }: { id: number; paymentMethod?: string }) =>
      api.post(`/trip-settlements/clients/${id}/settle`, { paymentMethod }),
    onSuccess: () => { invalidateAll(); setSettleTarget(null); setSettlePaymentMethod(""); toast({ title: "تم السداد وترحيله لحساب العميل" }); },
    onError: () => toast({ title: "خطأ في السداد", variant: "destructive" }),
  });

  const addPayment = useMutation({
    mutationFn: ({ repId, method, amount, note }: { repId: number; method: string; amount: number; note?: string }) =>
      api.post(`/trip-settlements/reps/${repId}/payments`, { method, amount, note }),
  });

  const closeTrip = useMutation({
    mutationFn: async () => {
      // ── تسجيل مبالغ فودافون كاش / انستا لكل مندوب قبل الإغلاق ──────────────
      const entries = Object.entries(closePayments);
      for (const [repIdStr, vals] of entries) {
        const repId = Number(repIdStr);
        const vcash = Number(vals.vodafone_cash);
        const insta = Number(vals.instapay);
        if (vcash > 0) await addPayment.mutateAsync({ repId, method: "vodafone_cash", amount: vcash });
        if (insta > 0) await addPayment.mutateAsync({ repId, method: "instapay", amount: insta });
      }
      return api.post(`/trip-settlements/${activeId}/close`);
    },
    onSuccess: (data) => {
      invalidateAll();
      setCloseConfirmOpen(false);
      setClosePayments({});
      setViewingId("current");
      toast({ title: "تم إغلاق الرحلة وفتح حاوية جديدة", description: `رقم الرحلة الجديدة: ${data?.newSettlement?.settlementNumber ?? ""}` });
    },
    onError: () => toast({ title: "خطأ في الإغلاق", variant: "destructive" }),
  });

  const netBalance = Number(settlement?.netBalance ?? 0);

  // ── جاهزية الإغلاق: مناديب مقفولين + عملاء خالص + عملاء لسه معلّقين ──────────
  const repsClosedCount = reps.filter(r => r.status === "closed").length;
  const clientsPaidCount = clients.filter(c => c.status === "paid").length;
  const clientsPendingCount = clients.length - clientsPaidCount;
  const totalItems = reps.length + clients.length;
  const closedShare = totalItems > 0 ? repsClosedCount / totalItems : 0;
  const paidShare = totalItems > 0 ? clientsPaidCount / totalItems : 0;
  const readyCount = repsClosedCount + clientsPaidCount;

  // ── عملاء متكرري السالب (رصيد سالب رحلتين متتاليتين فأكتر) ───────────────────
  const repeatNegativeClients = clients.filter(c => c.status === "pending" && (c.negativeStreak ?? 0) >= 2);

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      {/* هيدر */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black flex items-center gap-2">
            <Truck className="w-5 h-5 text-orange-500" />
            تسوية الرحلات والتحصيل
          </h1>
          {settlement && (
            <p className="text-xs text-muted-foreground mt-1">
              رحلة رقم <span className="font-bold">{settlement.settlementNumber}</span>
              {settlement.status === "closed" && (
                <Badge className="mr-2 bg-slate-500/15 text-slate-400 border-slate-500/20">مؤرشفة</Badge>
              )}
              {settlement.status === "open" && (
                <Badge className="mr-2 bg-emerald-500/15 text-emerald-500 border-emerald-500/20">مفتوحة</Badge>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowArchive(v => !v)}>
            <Archive className="w-4 h-4 ml-1" /> الأرشيف
          </Button>
          {isOpen && (
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => setCloseConfirmOpen(true)}>
              <Lock className="w-4 h-4 ml-1" /> إغلاق الرحلة / البيان
            </Button>
          )}
        </div>
      </div>

      {/* أرشيف الرحلات */}
      {showArchive && (
        <Card className="p-3">
          <p className="text-xs font-bold mb-2 text-muted-foreground">الرحلات السابقة</p>
          <div className="flex flex-wrap gap-2">
            {(archiveList?.settlements ?? []).map((s: Settlement) => (
              <button
                key={s.id}
                onClick={() => setViewingId(s.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  activeId === s.id ? "bg-orange-500/15 border-orange-500/40 text-orange-500" : "border-border hover:bg-white/5"
                }`}
              >
                {s.closedAt ? format(new Date(s.closedAt), "yyyy/MM/dd") : s.settlementNumber} {s.status === "open" && "🟢"}
              </button>
            ))}
            <button
              onClick={() => setViewingId("current")}
              className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
            >
              ↩ الرحلة الحالية
            </button>
          </div>
        </Card>
      )}

      {/* حاوية الرحلة */}
      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground">جاري التحميل...</Card>
      ) : !settlement ? (
        <Card className="p-8 text-center text-muted-foreground">لا يوجد بيان</Card>
      ) : (
        <>
          {/* شريط جاهزية الإغلاق */}
          {isOpen && totalItems > 0 && (
            <Card className="p-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted-foreground">جاهزية الإغلاق</span>
                <span className="font-bold">{readyCount} من {totalItems} بنود مكتملة</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                <div className="h-full bg-emerald-500" style={{ width: `${closedShare * 100}%` }} />
                <div className="h-full bg-amber-500" style={{ width: `${paidShare * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {repsClosedCount} مناديب مقفولين</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {clientsPaidCount} عملاء خالص</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" /> {clientsPendingCount} عملاء معلّقين</span>
              </div>
            </Card>
          )}

          {/* شريط الإجماليات */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="p-3 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">إجمالي المناديب</p>
              <p className="text-lg font-black text-blue-500">{fmt(Number(settlement.totalRepsBalance ?? 0))}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">إجمالي العملاء</p>
              <p className="text-lg font-black text-amber-500">{fmt(Number(settlement.totalClientsBalance ?? 0))}</p>
            </Card>
            <Card className={`p-3 text-center col-span-2 md:col-span-1 ${netBalance < 0 ? "bg-rose-500/10 border-rose-500/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
              <p className="text-[11px] text-muted-foreground mb-1">السالب (الصافي)</p>
              <p className={`text-lg font-black ${netBalance < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                {fmt(netBalance)}
              </p>
            </Card>
          </div>

          {/* تنبيه العملاء المعلّقين ومتكرري السالب */}
          {(clientsPendingCount > 0 || repeatNegativeClients.length > 0) && (
            <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                {clientsPendingCount > 0 && (
                  <p>فيه {clientsPendingCount} عملاء معلّقين هيترحلوا تلقائيًا للرحلة الجديدة عند الإغلاق.</p>
                )}
                {repeatNegativeClients.map(c => (
                  <p key={c.id} className="flex items-center gap-1.5 text-rose-500">
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span className="font-bold">{c.clientName}</span> رصيده سالب {c.negativeStreak} رحلات متتالية — يحتاج متابعة.
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* عمود المناديب (يسار) */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold flex items-center gap-2 text-blue-500">
                  <Truck className="w-4 h-4" /> المناديب
                </h2>
                {isOpen && (
                  <Button size="sm" variant="outline" onClick={() => setAddRepOpen(true)}>
                    <Plus className="w-3.5 h-3.5 ml-1" /> إضافة مندوب
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {reps.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">لا يوجد مناديب في هذه الرحلة</p>}
                {reps.map(rep => (
                  <div key={rep.id} className="group rounded-lg border border-border px-3 py-2 hover:border-border/80 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {editingRepId === rep.id ? (
                          <Input
                            autoFocus
                            value={editingRepName}
                            onChange={(e) => setEditingRepName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingRepName.trim()) {
                                renameRep.mutate({ id: rep.id, repName: editingRepName.trim() });
                                setEditingRepId(null);
                              } else if (e.key === "Escape") {
                                setEditingRepId(null);
                              }
                            }}
                            onBlur={() => {
                              if (editingRepName.trim() && editingRepName.trim() !== rep.repName) {
                                renameRep.mutate({ id: rep.id, repName: editingRepName.trim() });
                              }
                              setEditingRepId(null);
                            }}
                            className="h-6 text-[13px] px-1.5 py-0"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!isOpen) return;
                              setEditingRepId(rep.id);
                              setEditingRepName(rep.repName === "غير محدد" ? "" : rep.repName);
                            }}
                            className={`font-bold text-[13px] truncate text-right ${rep.repName === "غير محدد" ? "text-amber-500" : ""} ${isOpen ? "hover:underline decoration-dotted" : ""}`}
                            title={isOpen ? "اضغط لتعديل اسم المندوب" : undefined}
                          >
                            {rep.repName}
                          </button>
                        )}
                        {rep.status === "closed" ? (
                          <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/20 text-[9px] px-1.5 py-0 h-4 shrink-0">مقفول</Badge>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-black text-[13px] text-blue-500 tabular-nums">{fmt(Number(rep.balance))}</span>
                        {isOpen && (
                          <button onClick={() => deleteRep.mutate(rep.id)} className="text-rose-500/50 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {rep.notes && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{rep.notes}</p>}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {rep.payments.map(p => {
                        const m = METHOD_LABELS[p.method] ?? METHOD_LABELS.other;
                        const Icon = m.Icon;
                        return (
                          <span key={p.id} className="text-[10px] pr-1.5 pl-2 py-0.5 rounded-md flex items-center gap-1 leading-none font-medium"
                            style={{ background: `${m.color}12`, border: `1px solid ${m.color}25`, color: m.color }}>
                            <Icon className="w-3 h-3" />
                            <span>{m.label}</span>
                            <span className="opacity-60">·</span>
                            <span className="tabular-nums font-black">{fmt(Number(p.amount))}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* عمود العملاء (يمين) */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold flex items-center gap-2 text-pink-500">
                  <Users className="w-4 h-4" /> العملاء
                </h2>
                {isOpen && (
                  <Button size="sm" variant="outline" onClick={() => setAddClientOpen(true)}>
                    <Plus className="w-3.5 h-3.5 ml-1" /> إضافة عميل
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1.5 mb-3">
                {([
                  { key: "all", label: "الكل" },
                  { key: "pending", label: "لسه لم يتم السداد" },
                  { key: "paid", label: "خالص" },
                ] as const).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setClientFilter(f.key)}
                    className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                      clientFilter === f.key
                        ? "bg-pink-500/15 text-pink-400 border-pink-500/30"
                        : "text-muted-foreground border-border hover:border-border/80"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {filteredClients.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    {clients.length === 0 ? "لا يوجد عملاء في هذه الرحلة" : "لا يوجد عملاء مطابقين للفلتر"}
                  </p>
                )}
                {filteredClients.map(c => {
                  const bal = Number(c.balance);
                  return (
                    <div key={c.id} className="group rounded-lg border border-border px-3 py-2 hover:border-border/80 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className="font-bold text-[13px] truncate">{c.clientName}</span>
                          {!!c.rolledFromId && (
                            <Badge className="text-[9px] px-1.5 py-0 h-4 bg-indigo-500/15 text-indigo-400 border-indigo-500/20 shrink-0">مرحّل</Badge>
                          )}
                          {(c.negativeStreak ?? 0) >= 2 && (
                            <Badge className="text-[9px] px-1.5 py-0 h-4 bg-rose-500/15 text-rose-500 border-rose-500/20 flex items-center gap-0.5 shrink-0">
                              <TrendingDown className="w-2.5 h-2.5" /> {c.negativeStreak}×
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`font-black text-[13px] tabular-nums ${bal < 0 ? "text-rose-500" : "text-emerald-500"}`}>{fmt(bal)}</span>
                          {isOpen && (
                            <button onClick={() => deleteClient.mutate(c.id)} className="text-rose-500/50 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {(Number(c.alixAmount) > 0 || Number(c.vcashAmount) > 0 || Number(c.cashAmount) > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {Number(c.alixAmount) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md leading-none" style={{ background: "#3b82f612", border: "1px solid #3b82f625", color: "#3b82f6" }}>ALIX {fmt(Number(c.alixAmount))}</span>
                          )}
                          {Number(c.vcashAmount) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md leading-none" style={{ background: "#e11d4812", border: "1px solid #e11d4825", color: "#e11d48" }}>V.CASH {fmt(Number(c.vcashAmount))}</span>
                          )}
                          {Number(c.cashAmount) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md leading-none" style={{ background: "#22c55e12", border: "1px solid #22c55e25", color: "#22c55e" }}>CASH {fmt(Number(c.cashAmount))}</span>
                          )}
                        </div>
                      )}
                      {c.notes && <p className="text-[10px] text-muted-foreground mt-1 truncate">{c.notes}</p>}
                      <div className="mt-1.5">
                        {c.status === "paid" ? (
                          <Badge className="text-[10px] px-1.5 py-0 h-[18px] bg-emerald-500/15 text-emerald-500 border-emerald-500/20">
                            <CheckCircle2 className="w-2.5 h-2.5 ml-0.5" /> خالص
                          </Badge>
                        ) : isOpen ? (
                          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => setSettleTarget(c)}>
                            سداد الرصيد
                          </Button>
                        ) : (
                          <Badge className="text-[10px] px-1.5 py-0 h-[18px] bg-amber-500/15 text-amber-500 border-amber-500/20">معلق</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* مودال إضافة مندوب */}
      <AddRepDialog open={addRepOpen} onOpenChange={setAddRepOpen} onSubmit={(b: { repName: string; notes?: string; userId?: number }) => addRep.mutate(b)} pending={addRep.isPending} />

      {/* مودال إضافة عميل */}
      <AddClientDialog open={addClientOpen} onOpenChange={setAddClientOpen} onSubmit={(b: any) => addClient.mutate(b)} pending={addClient.isPending} />

      {/* مودال تأكيد سداد الرصيد */}
      <Dialog open={!!settleTarget} onOpenChange={(o) => { if (!o) { setSettleTarget(null); setSettlePaymentMethod(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد سداد الرصيد</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm">
              سيتم خصم مبلغ <span className="font-black text-emerald-500">{settleTarget && fmt(Math.abs(Number(settleTarget.balance)))}</span> من
              المصروفات وترحيله لحساب العميل <span className="font-bold">{settleTarget?.clientName}</span>.
            </p>
            <div className="space-y-1">
              <Input
                placeholder="طريقة السداد (كاش، فودافون كاش، تحويل بنكي...) — اختياري"
                value={settlePaymentMethod}
                onChange={e => setSettlePaymentMethod(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">هتظهر للعميل في كشف حسابه ببوابة العميل.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              هذا الإجراء لا يمكن التراجع عنه يدويًا بعد التأكيد.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSettleTarget(null); setSettlePaymentMethod(""); }}>إلغاء</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={settleClient.isPending}
              onClick={() => settleTarget && settleClient.mutate({ id: settleTarget.id, paymentMethod: settlePaymentMethod.trim() || undefined })}
            >
              تأكيد السداد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* مودال تأكيد إغلاق الرحلة */}
      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تأكيد إغلاق الرحلة / البيان</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3 text-sm">
            <p>سيتم أرشفة الرحلة الحالية وفتح حاوية جديدة تلقائيًا.</p>
            <p>العملاء المسددون بالكامل ("خالص") لن يتم ترحيلهم.</p>
            <p>العملاء الذين لهم/عليهم رصيد متبقٍ سيتم ترحيل أرصدتهم تلقائيًا للرحلة الجديدة.</p>

            {reps.filter(r => r.status !== "closed").length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-bold text-muted-foreground">وسائل دفع المناديب (اختياري):</p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {reps.filter(r => r.status !== "closed").map(rep => {
                    const vals = closePayments[rep.id] ?? { vodafone_cash: "", instapay: "" };
                    const setVal = (key: "vodafone_cash" | "instapay", value: string) =>
                      setClosePayments(prev => ({ ...prev, [rep.id]: { ...vals, [key]: value } }));
                    return (
                      <div key={rep.id} className="rounded-lg border border-border p-2 space-y-1.5">
                        <p className="text-xs font-bold truncate">{rep.repName}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1.5 rounded-md border border-rose-500/25 bg-rose-500/5 px-2">
                            <Smartphone className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <Input
                              type="number"
                              placeholder="فودافون كاش"
                              value={vals.vodafone_cash}
                              onChange={e => setVal("vodafone_cash", e.target.value)}
                              className="border-0 bg-transparent h-8 px-1 focus-visible:ring-0"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 rounded-md border border-violet-500/25 bg-violet-500/5 px-2">
                            <Wallet className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            <Input
                              type="number"
                              placeholder="انستا"
                              value={vals.instapay}
                              onChange={e => setVal("instapay", e.target.value)}
                              className="border-0 bg-transparent h-8 px-1 focus-visible:ring-0"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseConfirmOpen(false)}>إلغاء</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" disabled={closeTrip.isPending} onClick={() => closeTrip.mutate()}>
              <Lock className="w-4 h-4 ml-1" /> تأكيد الإغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── مودال إضافة مندوب ───────────────────────────────────────────────────────
function AddRepDialog({ open, onOpenChange, onSubmit, pending }: any) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: repsListData } = useQuery({
    queryKey: ["trip-settlement-reps-list"],
    queryFn: () => api.get("/trip-settlements/reps-list"),
    enabled: open,
  });
  const repsList: { id: number; name: string }[] = repsListData?.reps ?? [];
  const isCustom = selectedId === "custom";
  const finalName = isCustom ? customName : (repsList.find(r => r.id === Number(selectedId))?.name ?? "");

  function reset() { setSelectedId(""); setCustomName(""); setNotes(""); }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>إضافة مندوب</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
            <SelectContent className="max-h-64 overflow-y-auto">
              {repsList.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
              <SelectItem value="custom">اسم آخر (يدوي)...</SelectItem>
            </SelectContent>
          </Select>
          {isCustom && (
            <Input placeholder="اسم المندوب" value={customName} onChange={e => setCustomName(e.target.value)} />
          )}
          <Textarea placeholder="ملاحظات (مصاريف فرع / سيارات...)" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            disabled={!finalName.trim() || pending}
            onClick={() => {
              const userId = !isCustom && selectedId ? Number(selectedId) : undefined;
              onSubmit({ repName: finalName, notes, userId });
              reset();
            }}
          >
            إضافة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── مودال إضافة عميل ────────────────────────────────────────────────────────
function AddClientDialog({ open, onOpenChange, onSubmit, pending }: any) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [alix, setAlix] = useState("0");
  const [vcash, setVcash] = useState("0");
  const [cash, setCash] = useState("0");
  const [balance, setBalance] = useState("0");
  const [notes, setNotes] = useState("");

  const { data: clientsListData } = useQuery({
    queryKey: ["trip-settlement-clients-list"],
    queryFn: () => api.get("/trip-settlements/clients-list"),
    enabled: open,
  });
  const clientsList: { id: number; name: string }[] = clientsListData?.clients ?? [];
  const isCustom = selectedId === "custom";
  const finalName = isCustom ? customName : (clientsList.find(c => c.id === Number(selectedId))?.name ?? "");

  // ─── جلب الرصيد الحقيقي تلقائيًا عند اختيار عميل من القائمة ─────────────────
  // نفس مصدر الحقيقة الموحّد (computeClosedManifestsForClient) المستخدم في
  // صفحة "العملاء التجاريون" وكشف الحساب — لمنع الفرق بين الرصيدين اللي كان
  // بيحصل لما المستخدم يكتب الرصيد يدويًا وينسى/يغلط في الرقم. الحقل يفضل
  // قابل للتعديل بعد التعبئة التلقائية لو محتاج تصحيح يدوي.
  const selectedClientId = !isCustom && selectedId ? Number(selectedId) : null;
  const { data: realBalanceData, isFetching: isFetchingBalance } = useQuery({
    queryKey: ["trip-settlement-client-real-balance", selectedClientId],
    queryFn: () => api.get(`/client-account-manifests/balance/${selectedClientId}`),
    enabled: open && !!selectedClientId,
  });
  useEffect(() => {
    if (selectedClientId && realBalanceData && typeof realBalanceData.balance === "number") {
      setBalance(String(realBalanceData.balance));
    }
  }, [selectedClientId, realBalanceData]);

  function reset() { setSelectedId(""); setCustomName(""); setAlix("0"); setVcash("0"); setCash("0"); setBalance("0"); setNotes(""); }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>إضافة عميل</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
            <SelectContent className="max-h-64 overflow-y-auto">
              {clientsList.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
              <SelectItem value="custom">اسم آخر (يدوي)...</SelectItem>
            </SelectContent>
          </Select>
          {isCustom && (
            <Input placeholder="اسم العميل" value={customName} onChange={e => setCustomName(e.target.value)} />
          )}
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" placeholder="ALIX" value={alix} onChange={e => setAlix(e.target.value)} />
            <Input type="number" placeholder="V.CASH" value={vcash} onChange={e => setVcash(e.target.value)} />
            <Input type="number" placeholder="CASH" value={cash} onChange={e => setCash(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Input type="number" placeholder="الرصيد المستحق (سالب لو عليه، موجب لو له)" value={balance} onChange={e => setBalance(e.target.value)} />
            {selectedClientId && (
              <p className="text-[11px] text-muted-foreground">
                {isFetchingBalance ? "جارِ جلب الرصيد الفعلي..." : "الرصيد اتحط تلقائيًا من رصيد العميل الفعلي — ممكن تعدّله لو محتاج."}
              </p>
            )}
          </div>
          <Textarea placeholder="ملاحظات" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            disabled={!finalName.trim() || pending}
            onClick={() => {
              const clientId = !isCustom && selectedId ? Number(selectedId) : undefined;
              onSubmit({
                clientId, clientName: finalName, alixAmount: Number(alix) || 0, vcashAmount: Number(vcash) || 0,
                cashAmount: Number(cash) || 0, balance: Number(balance) || 0, notes,
              });
              reset();
            }}
          >
            إضافة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


