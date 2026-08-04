import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Receipt, Trash2, Wallet, Search, X, Filter,
  Download, FileSpreadsheet, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";

const api = {
  get:  (url: string)            => apiFetch<any>(url.replace(/^\/api/, "")),
  post: (url: string, body: any) => apiFetch<any>(url.replace(/^\/api/, ""), { method: "POST", body: JSON.stringify(body) }),
  del:  (url: string)            => apiFetch<void>(url.replace(/^\/api/, ""), { method: "DELETE" }),
};

const EXPENSE_CATEGORIES = [
  { value: "shipping_fees",   label: "مصاريف شحن إضافية للمناديب", color: "#3B82F6", glow: "rgba(59,130,246,0.25)" },
  { value: "warehouse_rent",  label: "إيجارات",                    color: "#8B5CF6", glow: "rgba(139,92,246,0.25)" },
  { value: "salary",          label: "مرتبات",                     color: "#10B981", glow: "rgba(16,185,129,0.25)" },
  { value: "marketing",       label: "تسويق وإعلانات",             color: "#F59E0B", glow: "rgba(245,158,11,0.25)" },
  { value: "utilities",       label: "كهرباء وخدمات",              color: "#EAB308", glow: "rgba(234,179,8,0.25)"  },
  { value: "returns_loss",    label: "خسائر مرتجعات",              color: "#EF4444", glow: "rgba(239,68,68,0.25)"  },
  { value: "branch_transfer", label: "انتقالات بين الفروع",        color: "#06B6D4", glow: "rgba(6,182,212,0.25)"  },
  { value: "pickup_fees",     label: "مصاريف بيك أب",              color: "#F97316", glow: "rgba(249,115,22,0.25)" },
  { value: "other",           label: "أخرى",                       color: "#6B7280", glow: "rgba(107,114,128,0.25)"},
  { value: "client_payment",  label: "سداد حساب عميل",             color: "#14B8A6", glow: "rgba(20,184,166,0.25)" },
];

const catLabel = (v: string) => EXPENSE_CATEGORIES.find(c => c.value === v)?.label ?? v;
const catColor = (v: string) => EXPENSE_CATEGORIES.find(c => c.value === v)?.color ?? "#6B7280";
const catGlow  = (v: string) => EXPENSE_CATEGORIES.find(c => c.value === v)?.glow  ?? "rgba(107,114,128,0.25)";
const fmt = (n: string | number) =>
  Number(n).toLocaleString("ar-EG", { minimumFractionDigits: 2 }) + " ج.م";

const PAGE_LIMIT = 25;
const defaultForm = () => ({
  title: "", category: "other", amount: "",
  referenceId: "", notes: "",
  expenseDate: format(new Date(), "yyyy-MM-dd"),
  cashRegisterId: "",
  clientId: "",
});

export default function FinanceExpenses() {

  // ── Finance access guard ───────────────────────────────────────────────────
  const { isAdmin: _fAdmin, can: _fCan } = useAuth();
  if (!_fAdmin && !_fCan("finance.expenses")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
        <p className="text-muted-foreground text-sm max-w-xs">ليس لديك صلاحية لعرض صفحة الماليات. تواصل مع المدير.</p>
      </div>
    );
  }
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  // ── Dialog state ──
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const F = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // ── فلاتر ──
  const [search,    setSearch]    = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [page,      setPage]      = useState(1);

  const hasFilters = search || filterCat !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setSearch(""); setFilterCat("all"); setDateFrom(""); setDateTo(""); setPage(1); };

  // ── بناء query params ──
  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    if (search)              p.set("search",   search);
    if (filterCat !== "all") p.set("category", filterCat);
    if (dateFrom)            p.set("from",     dateFrom);
    if (dateTo)              p.set("to",       dateTo);
    return p.toString();
  }, [search, filterCat, dateFrom, dateTo, page]);

  // ── جلب البيانات ──
  const { data, isLoading } = useQuery<{ expenses: any[]; total: number; page: number; limit: number }>({
    queryKey: ["finance-expenses", params],
    queryFn:  () => api.get(`/api/finance/expenses?${params}`),
    placeholderData: prev => prev,
  });

  const expenses  = data?.expenses ?? [];
  const total     = data?.total    ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  const { data: regData } = useQuery<{ registers: any[] }>({
    queryKey: ["/api/cash-registers"],
    queryFn:  () => api.get("/api/cash-registers"),
  });
  const registers = regData?.registers ?? [];

  // ── سداد حساب عميل: قائمة منسدلة بكل العملاء التجاريين + رصيد كل واحد ──
  const { data: clientsBalData } = useQuery<{ clients: { id: number; name: string; phone: string | null; balance: number }[] }>({
    queryKey: ["/api/client-account-manifests/clients-with-balance"],
    queryFn:  () => api.get("/api/client-account-manifests/clients-with-balance"),
    enabled:  form.category === "client_payment",
  });
  const clientsWithBalance = clientsBalData?.clients ?? [];
  const selectedClient = clientsWithBalance.find(c => String(c.id) === form.clientId) ?? null;
  const clientBalance  = selectedClient?.balance ?? null;

  const pickClient = (idStr: string) => {
    F("clientId", idStr);
    const c = clientsWithBalance.find(cl => String(cl.id) === idStr);
    const bal = c?.balance ?? 0;
    F("amount", bal > 0 ? String(bal) : "");
    // العنوان بيتولّد تلقائيًا من اسم العميل — مفيش داعي اليوزر يكتبه يدوي
    F("title", c ? `سداد رصيد — ${c.name}` : "");
  };

  const resetClientPayment = () => { F("clientId", ""); };

  // ── Mutations ──
  const save = useMutation({
    mutationFn: () => api.post("/api/finance/expenses", {
      ...form,
      amount: parseFloat(form.amount),
      cashRegisterId: form.cashRegisterId ? parseInt(form.cashRegisterId) : null,
      clientId: form.category === "client_payment" && form.clientId ? parseInt(form.clientId) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-registers"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-registers/alerts"] });
      setOpen(false); setForm(defaultForm()); resetClientPayment();
      toast({ title: form.category === "client_payment" ? "✅ تم تسجيل السداد وخصمه من رصيد العميل" : "✅ تمت إضافة المصروف وتم الخصم من الخزنة" });
    },
    onError: (e: any) => toast({ title: "❌ خطأ", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.del(`/api/finance/expenses/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance-expenses"] }); toast({ title: "تم الحذف" }); },
  });

  // ── تصدير ──
  const buildExportParams = () => {
    const p = new URLSearchParams();
    if (search)              p.set("search",   search);
    if (filterCat !== "all") p.set("category", filterCat);
    if (dateFrom)            p.set("from",     dateFrom);
    if (dateTo)              p.set("to",       dateTo);
    return p.toString();
  };

  const handleExportCSV = () => {
    if (!expenses.length) return;
    const header = ["#", "العنوان", "التصنيف", "المبلغ", "التاريخ", "رقم مرجعي", "ملاحظات"];
    const rows = expenses.map(e => [
      e.id, e.title, catLabel(e.category), e.amount,
      e.expenseDate ? format(new Date(e.expenseDate), "yyyy/MM/dd") : "",
      e.referenceId ?? "", e.notes ?? "",
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `expenses-${Date.now()}.csv`; a.click();
  };

  const handleExportExcel = () => {
    const q = buildExportParams();
    window.open(`/api/finance/expenses/export-excel${q ? "?" + q : ""}`, "_blank");
  };

  // ── ملخص الصفحة الحالية ──
  const pageTotal  = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const withCash   = expenses.filter(e => e.cashRegisterId).length;
  const selectedReg = registers.find(r => String(r.id) === form.cashRegisterId);

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => navigate("/finance")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ChevronRight className="w-4 h-4" />
            لوحة الماليات
          </button>
          <h1 className="text-2xl font-bold">المصروفات التشغيلية</h1>
          <p className="text-muted-foreground text-sm">تسجيل ومتابعة كل مصروفات الشركة — مع الربط التلقائي بالخزنة</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs rounded-xl" onClick={handleExportCSV}>
            <Download className="w-3.5 h-3.5"/> CSV
          </Button>
          <Button size="sm" className="gap-1.5 h-8 text-xs rounded-xl text-black font-bold"
            style={{background:"#DEA821"}}
            onMouseEnter={e=>(e.currentTarget.style.background="#c8931c")}
            onMouseLeave={e=>(e.currentTarget.style.background="#DEA821")}
            onClick={handleExportExcel}>
            <FileSpreadsheet className="w-3.5 h-3.5"/> Excel
          </Button>
          <Button onClick={() => setOpen(true)} className="gap-2 h-8 text-sm">
            <Plus className="w-4 h-4"/>مصروف جديد
          </Button>
        </div>
      </div>

      {/* ── KPI ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative overflow-hidden rounded-[20px] p-4 transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, rgba(239,68,68,0.42) 0%, rgba(239,68,68,0.16) 52%, rgba(255,255,255,0.06) 100%)",
            border: "1px solid rgba(239,68,68,0.30)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(239,68,68,0.22)",
            backdropFilter: "blur(12px)",
          }}>
          <div className="absolute inset-x-8 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, #EF4444, transparent)" }} />
          <p className="text-xs font-bold mb-1" style={{ color: "rgba(255,255,255,0.60)" }}>إجمالي الصفحة الحالية</p>
          <p className="text-2xl font-black" style={{ color: "#EF4444", textShadow: "0 0 16px rgba(239,68,68,0.55)" }}>{fmt(pageTotal)}</p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.40)" }}>{total} مصروف إجمالي</p>
        </div>
        <div className="relative overflow-hidden rounded-[20px] p-4 transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.42) 0%, rgba(16,185,129,0.16) 52%, rgba(255,255,255,0.06) 100%)",
            border: "1px solid rgba(16,185,129,0.30)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(16,185,129,0.22)",
            backdropFilter: "blur(12px)",
          }}>
          <div className="absolute inset-x-8 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, #10B981, transparent)" }} />
          <p className="text-xs font-bold mb-1" style={{ color: "rgba(255,255,255,0.60)" }}>مربوطة بخزنة (الصفحة)</p>
          <p className="text-2xl font-black" style={{ color: "#10B981", textShadow: "0 0 16px rgba(16,185,129,0.55)" }}>{withCash}</p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.40)" }}>خُصمت تلقائياً</p>
        </div>
      </div>

      {/* ── فلاتر ── */}
      <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold flex items-center gap-1.5"><Filter className="w-3.5 h-3.5"/> فلاتر البحث</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted transition-colors">
              <X className="w-3 h-3"/> مسح الفلاتر
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">من تاريخ</Label>
            <Input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(1);}} className="h-8 text-xs rounded-xl"/>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">إلى تاريخ</Label>
            <Input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(1);}} className="h-8 text-xs rounded-xl"/>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">التصنيف</Label>
            <Select value={filterCat} onValueChange={v=>{setFilterCat(v);setPage(1);}}>
              <SelectTrigger className="h-8 text-xs rounded-xl"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التصنيفات</SelectItem>
                {EXPENSE_CATEGORIES.map(c=><SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">بحث</Label>
            <div className="relative">
              <Search className="absolute right-2.5 top-2 w-3.5 h-3.5 text-muted-foreground"/>
              <Input placeholder="عنوان أو مرجع..." value={search}
                onChange={e=>{setSearch(e.target.value);setPage(1);}}
                className="h-8 text-xs rounded-xl pr-8"/>
            </div>
          </div>
        </div>
        {hasFilters && (
          <p className="text-[11px] text-muted-foreground">عرض {total} نتيجة</p>
        )}
      </div>

      {/* ── قائمة المصروفات ── */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20"/>
          <p>{hasFilters ? "لا توجد مصروفات بهذه الفلاتر" : "لا توجد مصروفات مسجّلة بعد"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((e: any) => {
            const reg   = registers.find(r => r.id === e.cashRegisterId);
            const color = catColor(e.category);
            const glow  = catGlow(e.category);
            return (
              <div key={e.id}
                className="group relative overflow-hidden rounded-[16px] px-4 py-3 flex items-center justify-between gap-3 transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: `linear-gradient(135deg, ${glow.replace("0.25","0.18")} 0%, rgba(255,255,255,0.03) 100%)`,
                  border: `1px solid ${glow.replace("0.25","0.20")}`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px ${glow}`,
                  backdropFilter: "blur(8px)",
                }}>
                <div className="absolute inset-x-10 top-0 h-px pointer-events-none"
                  style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: glow, border: `1px solid ${glow.replace("0.25","0.35")}` }}>
                    <Receipt className="w-4 h-4" style={{ color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: "hsl(var(--foreground))" }}>{e.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                        style={{ background: glow, color, border: `1px solid ${glow.replace("0.25","0.40")}` }}>
                        {catLabel(e.category)}
                      </span>
                      <span className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {e.expenseDate ? format(new Date(e.expenseDate), "yyyy/MM/dd") : ""}
                      </span>
                      {e.referenceId && <span className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>#{e.referenceId}</span>}
                      {reg && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium" style={{ color: "#10B981" }}>
                          <Wallet className="w-2.5 h-2.5"/> {reg.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-black text-sm" style={{ color, textShadow: `0 0 10px ${glow}` }}>{fmt(e.amount)}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500/10"
                    onClick={() => del.mutate(e.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-rose-400"/>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} مصروف إجمالي</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4"/>
            </button>
            <span className="px-3 py-1 rounded-lg bg-muted font-semibold">
              صفحة {page} / {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4"/>
            </button>
          </div>
        </div>
      )}

      {/* ── Dialog إضافة مصروف ── */}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setForm(defaultForm()); resetClientPayment(); } }}>
        <DialogContent className="bg-card border-border max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="w-4 h-4"/> مصروف جديد</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs mb-1 block">
                العنوان *{form.category === "client_payment" && <span className="text-muted-foreground font-normal"> (يتولّد تلقائيًا من اسم العميل)</span>}
              </Label>
              <Input
                className="h-9 text-sm"
                placeholder="مثال: إيجار مخزن يناير"
                value={form.title}
                onChange={e => F("title", e.target.value)}
                readOnly={form.category === "client_payment"}
                disabled={form.category === "client_payment"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">التصنيف</Label>
                <Select value={form.category} onValueChange={v => { F("category", v); if (v !== "client_payment") resetClientPayment(); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue/></SelectTrigger>
                  <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">المبلغ *</Label>
                <Input type="number" className="h-9 text-sm" placeholder="0" value={form.amount} onChange={e => F("amount", e.target.value)}/>
              </div>
            </div>

            {form.category === "client_payment" && (
              <div>
                <Label className="text-xs mb-1 block flex items-center gap-1">
                  <Search className="w-3 h-3 text-teal-500"/> العميل *
                </Label>
                <Select value={form.clientId} onValueChange={pickClient}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={clientsWithBalance.length ? "اختر العميل التجاري..." : "جاري تحميل العملاء..."}/>
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {clientsWithBalance.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} — رصيد: {fmt(c.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedClient && clientBalance !== null && (
                  <div className={`mt-1.5 text-xs px-2 py-1 rounded flex items-center gap-1.5 ${clientBalance > 0 ? "bg-teal-500/10 text-teal-700" : "bg-muted text-muted-foreground"}`}>
                    <Wallet className="w-3 h-3"/>
                    رصيد العميل الحالي: <strong>{fmt(clientBalance)}</strong>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">التاريخ *</Label>
                <Input type="date" className="h-9 text-sm" value={form.expenseDate} onChange={e => F("expenseDate", e.target.value)}/>
              </div>
              <div>
                <Label className="text-xs mb-1 block">رقم مرجعي</Label>
                <Input className="h-9 text-sm" placeholder="رقم فاتورة..." value={form.referenceId} onChange={e => F("referenceId", e.target.value)}/>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block flex items-center gap-1">
                <Wallet className="w-3 h-3 text-emerald-500"/> خصم من خزنة
              </Label>
              <Select value={form.cashRegisterId} onValueChange={v => F("cashRegisterId", v === "auto" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="خصم تلقائي من الخزنة الافتراضية"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">خصم تلقائي من الخزنة الافتراضية</SelectItem>
                  {registers.map(r => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name} — رصيد: {Number(r.balance).toLocaleString("ar-EG")} ج.م
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedReg && form.amount && (
                <div className={`mt-1.5 text-xs px-2 py-1 rounded flex items-center gap-1.5 ${parseFloat(selectedReg.balance ?? "0") >= parseFloat(form.amount || "0") ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"}`}>
                  <Wallet className="w-3 h-3"/>
                  الرصيد بعد الخصم: <strong>{(parseFloat(selectedReg.balance ?? "0") - parseFloat(form.amount || "0")).toLocaleString("ar-EG")} ج.م</strong>
                  {parseFloat(selectedReg.balance ?? "0") < parseFloat(form.amount || "0") && " ⚠️ رصيد غير كافٍ"}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs mb-1 block">ملاحظات</Label>
              <Textarea className="text-sm min-h-[60px]" value={form.notes} onChange={e => F("notes", e.target.value)}/>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 h-9 font-bold" onClick={() => save.mutate()}
                disabled={save.isPending || !form.title || !form.amount || (form.category === "client_payment" && !form.clientId)}>
                {save.isPending ? "جاري الحفظ..." : form.cashRegisterId ? `حفظ والخصم من ${registers.find(r=>String(r.id)===form.cashRegisterId)?.name ?? "الخزنة"}` : "حفظ والخصم من الخزنة الافتراضية"}
              </Button>
              <Button variant="outline" className="h-9 border-border" onClick={() => setOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
