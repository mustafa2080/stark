import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Plus, Wallet, ArrowUpCircle, ArrowDownCircle, ArrowRightLeft,
  Star, Trash2, TrendingUp, TrendingDown, RefreshCw,
  Search, Download, ChevronLeft, ChevronRight, FileSpreadsheet,
  Building2, CreditCard, Pencil, X, Bell, BellOff, Settings2, BarChart3, Filter, SlidersHorizontal, Archive, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiFetch as _apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const apiFetch = async (url: string, options?: RequestInit) => {
  return _apiFetch<any>(url.replace(/^\/api/, ""), options);
};

const fmt = (v: string | number) =>
  Number(v).toLocaleString("ar-EG", { minimumFractionDigits: 2 }) + " ج.م";
const fmtShort = (v: number) =>
  v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0);

const TX_LABELS: Record<string, { label: string; color: string }> = {
  deposit:          { label: "إيداع",            color: "text-emerald-500" },
  withdrawal:       { label: "سحب",              color: "text-rose-500"    },
  order_collected:  { label: "تحصيل طلب",        color: "text-emerald-500" },
  shipping_transfer:{ label: "تحويل شحن",        color: "text-emerald-500" },
  cash_sale:        { label: "مبيعات نقدية",     color: "text-emerald-500" },
  expense_paid:     { label: "دفع مصروف",        color: "text-rose-500"    },
  purchase_paid:    { label: "دفع مورد",         color: "text-rose-500"    },
  transfer_in:      { label: "تحويل وارد",       color: "text-sky-500"     },
  transfer_out:     { label: "تحويل صادر",       color: "text-amber-500"   },
};

const CREDIT_TYPES = ["deposit","order_collected","shipping_transfer","cash_sale","transfer_in"];

interface CashRegister {
  id: number; name: string; type: "main"|"branch";
  balance: string; description?: string; isActive: boolean;
  monthlyIn: number; monthlyOut: number; txCount: number;
  lowBalanceThreshold?: string;
}
interface CashTransaction {
  id: number; registerId: number; type: string; amount: string;
  balanceBefore: string; balanceAfter: string;
  description?: string; referenceNumber?: string;
  transactionDate: string; createdByName?: string;
}
interface Alert { registerId: number; name: string; balance: number; threshold: number; type: string; }

export default function FinanceCashPage() {

  // ── Finance access guard ───────────────────────────────────────────────────
  const { isAdmin: _fAdmin, can: _fCan } = useAuth();
  if (!_fAdmin && !_fCan("finance.cash")) {
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

  const [activeTab, setActiveTab]   = useState<number | "all">("all");
  const [addRegOpen, setAddRegOpen] = useState(false);
  const [txOpen, setTxOpen]         = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [selectedReg, setSelectedReg] = useState<CashRegister | null>(null);

  const [ledgerFrom, setLedgerFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [ledgerTo,   setLedgerTo]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [ledgerType, setLedgerType] = useState("all");
  const [ledgerDirection, setLedgerDirection] = useState("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);

  const [newReg,  setNewReg]  = useState({ name: "", type: "branch", description: "", initialBalance: "", isDefault: false });
  const [txForm,  setTxForm]  = useState({ type: "deposit", amount: "", description: "", referenceNumber: "", transactionDate: format(new Date(), "yyyy-MM-dd") });
  const [transfer, setTransfer] = useState({ fromId: "", toId: "", amount: "", description: "" });
  const [editForm, setEditForm] = useState({ name: "", description: "", isDefault: false });
  const [thresholdVal, setThresholdVal] = useState("");

  // تاسك 1: column filter
  const [colFilterActive, setColFilterActive] = useState(false);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  // تاسك 2: تعديل/حذف حركة
  const [editTxOpen, setEditTxOpen] = useState(false);
  const [deleteTxId, setDeleteTxId] = useState<number | null>(null);
  const [selectedTx, setSelectedTx] = useState<CashTransaction | null>(null);
  const [editTxForm, setEditTxForm] = useState({ type: "", amount: "", description: "", referenceNumber: "", transactionDate: "" });

  const { data: regData, isLoading, isFetching } = useQuery<{ registers: CashRegister[]; totalBalance: number }>({
    queryKey: ["/api/cash-registers"],
    queryFn: () => apiFetch("/api/cash-registers"),
    refetchInterval: 30000,
    staleTime: 0,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  const { data: alertsData } = useQuery<{ alerts: Alert[] }>({
    queryKey: ["/api/cash-registers/alerts"],
    queryFn: () => apiFetch("/api/cash-registers/alerts"),
    refetchInterval: 180000, staleTime: 120000,
    refetchIntervalInBackground: false, placeholderData: (prev) => prev,
  });

  const { data: smartAlertsData } = useQuery<{ alerts: any[] }>({
    queryKey: ["/api/cash-registers/smart-alerts"],
    queryFn: () => apiFetch("/api/cash-registers/smart-alerts"),
    refetchInterval: 300000, staleTime: 180000,
    refetchIntervalInBackground: false, placeholderData: (prev) => prev,
  });

  const ledgerRegId = (typeof activeTab === "number") ? activeTab : null;

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ["/api/cash-registers/ledger", ledgerRegId, ledgerFrom, ledgerTo, ledgerType, ledgerDirection, ledgerPage],
    queryFn: () => {
      const params = new URLSearchParams({ from: ledgerFrom, to: ledgerTo, type: ledgerType, page: String(ledgerPage), limit: "25" });
      if (ledgerDirection !== "all") params.set("direction", ledgerDirection);
      return apiFetch(`/api/cash-registers/${ledgerRegId}/transactions?${params}`);
    },
    enabled: !!ledgerRegId,
    staleTime: 0, refetchOnWindowFocus: true, refetchIntervalInBackground: false,
    placeholderData: (prev: any) => prev,
  });

  const { data: flowData } = useQuery({
    queryKey: ["/api/cash-registers/flow", ledgerRegId],
    queryFn: () => apiFetch(`/api/cash-registers/${ledgerRegId}/flow?days=30`),
    enabled: !!ledgerRegId, staleTime: 120000, refetchIntervalInBackground: false, placeholderData: (prev: any) => prev,
  });

  const registers    = regData?.registers ?? [];
  const totalBalance = regData?.totalBalance ?? 0;
  const mainReg      = registers.find(r => r.type === "main");
  const activeReg    = typeof activeTab === "number" ? registers.find(r => r.id === activeTab) ?? null : null;
  const alerts       = alertsData?.alerts ?? [];
  const smartAlerts  = smartAlertsData?.alerts ?? [];
  const transactions: CashTransaction[] = ledgerData?.transactions ?? [];
  const stats        = ledgerData?.stats;
  const pagination   = ledgerData?.pagination;

  const hasActiveFilters = ledgerType !== "all" || ledgerDirection !== "all" || ledgerSearch !== "" ||
    ledgerFrom !== format(subDays(new Date(), 30), "yyyy-MM-dd") || ledgerTo !== format(new Date(), "yyyy-MM-dd");

  const clearFilters = () => {
    setLedgerFrom(format(subDays(new Date(), 30), "yyyy-MM-dd"));
    setLedgerTo(format(new Date(), "yyyy-MM-dd"));
    setLedgerType("all"); setLedgerDirection("all"); setLedgerSearch(""); setLedgerPage(1);
  };

  const filteredTx = useMemo(() =>
    ledgerSearch ? transactions.filter(tx =>
      tx.description?.includes(ledgerSearch) ||
      tx.referenceNumber?.includes(ledgerSearch) ||
      TX_LABELS[tx.type]?.label.includes(ledgerSearch)
    ) : transactions,
    [transactions, ledgerSearch]
  );

  // unique values لكل عمود — يجب أن يكون بعد filteredTx
  const colOptions = useMemo(() => ({
    type: [...new Set(filteredTx.map(tx => tx.type))].map(t => ({ value: t, label: TX_LABELS[t]?.label ?? t })),
    dir:  [{ value: "in", label: "دخل" }, { value: "out", label: "خروج" }],
    by:   [...new Set(filteredTx.map(tx => tx.createdByName ?? "").filter(Boolean))].map(v => ({ value: v, label: v })),
    date: [...new Set(filteredTx.map(tx => new Date(tx.transactionDate).toLocaleDateString("ar-EG")))].map(v => ({ value: v, label: v })),
  }), [filteredTx]);

  const buildExportParams = () => {
    const params = new URLSearchParams({ from: ledgerFrom, to: ledgerTo });
    if (ledgerType !== "all") params.set("type", ledgerType);
    if (ledgerDirection !== "all") params.set("direction", ledgerDirection);
    return params;
  };

  const handleExportCSV = async () => {
    if (!activeReg) return;
    try {
      const token = localStorage.getItem("caprina_token");
      const res = await fetch(`/api/cash-registers/${activeReg.id}/export?${buildExportParams()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("فشل التصدير");
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `كشف-${activeReg.name}-${ledgerFrom}-${ledgerTo}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { toast({ title: "❌ خطأ في التصدير", description: e.message, variant: "destructive" }); }
  };

  const handleExportExcel = async () => {
    if (!activeReg) return;
    try {
      const token = localStorage.getItem("caprina_token");
      const res = await fetch(`/api/cash-registers/${activeReg.id}/export-excel?${buildExportParams()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("فشل التصدير");
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `خزنة-${activeReg.name}-${ledgerFrom}-${ledgerTo}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { toast({ title: "❌ خطأ في التصدير", description: e.message, variant: "destructive" }); }
  };

  const addRegMut = useMutation({
    mutationFn: (d: any) => apiFetch("/api/cash-registers", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({queryKey:["/api/cash-registers"]}); setAddRegOpen(false); setNewReg({name:"",type:"branch",description:"",initialBalance:"",isDefault:false}); toast({title:"✅ تم إنشاء الخزنة"}); },
    onError: (e:any) => toast({title:"❌ خطأ", description:e.message, variant:"destructive"}),
  });

  const txMut = useMutation({
    mutationFn: (d: any) => apiFetch(`/api/cash-registers/${selectedReg!.id}/transaction`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({queryKey:["/api/cash-registers"]}); qc.invalidateQueries({queryKey:["/api/cash-registers/ledger"]}); qc.invalidateQueries({queryKey:["/api/cash-registers/alerts"]}); setTxOpen(false); setTxForm({type:"deposit",amount:"",description:"",referenceNumber:"",transactionDate:format(new Date(),"yyyy-MM-dd")}); toast({title:"✅ تم تسجيل الحركة"}); },
    onError: (e:any) => toast({title:"❌ خطأ", description:e.message, variant:"destructive"}),
  });

  const transferMut = useMutation({
    mutationFn: (d: any) => apiFetch("/api/cash-registers/transfer", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({queryKey:["/api/cash-registers"]}); qc.invalidateQueries({queryKey:["/api/cash-registers/ledger"]}); setTransferOpen(false); setTransfer({fromId:"",toId:"",amount:"",description:""}); toast({title:"✅ تم التحويل"}); },
    onError: (e:any) => toast({title:"❌ خطأ", description:e.message, variant:"destructive"}),
  });

  const editMut = useMutation({
    mutationFn: (d: any) => apiFetch(`/api/cash-registers/${selectedReg!.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({queryKey:["/api/cash-registers"]}); setEditOpen(false); toast({title:"✅ تم التعديل"}); },
    onError: (e:any) => toast({title:"❌ خطأ", description:e.message, variant:"destructive"}),
  });

  const thresholdMut = useMutation({
    mutationFn: (d: any) => apiFetch(`/api/cash-registers/${selectedReg!.id}/threshold`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({queryKey:["/api/cash-registers"]}); qc.invalidateQueries({queryKey:["/api/cash-registers/alerts"]}); setThresholdOpen(false); toast({title:"✅ تم ضبط حد التنبيه"}); },
    onError: (e:any) => toast({title:"❌ خطأ", description:e.message, variant:"destructive"}),
  });

  const delMut = useMutation({
    mutationFn: (id:number) => apiFetch(`/api/cash-registers/${id}`, { method:"DELETE" }),
    onSuccess: () => { qc.invalidateQueries({queryKey:["/api/cash-registers"]}); setActiveTab("all"); toast({title:"✅ تم أرشفة الخزنة"}); },
    onError: (e:any) => toast({title:"❌ خطأ", description:e.message, variant:"destructive"}),
  });

  // تاسك 2: mutations التعديل والحذف للحركات
  const editTxMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      apiFetch(`/api/cash-registers/transactions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cash-registers"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-registers/ledger"] });
      setEditTxOpen(false);
      toast({ title: "✅ تم تعديل الحركة" });
    },
    onError: (e: any) => toast({ title: "❌ خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteTxMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/cash-registers/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cash-registers"] });
      qc.invalidateQueries({ queryKey: ["/api/cash-registers/ledger"] });
      setDeleteTxId(null);
      toast({ title: "✅ تم حذف الحركة" });
    },
    onError: (e: any) => toast({ title: "❌ خطأ", description: e.message, variant: "destructive" }),
  });

  // تاسك 1: تطبيق column filters على الجدول
  const colFilteredTx = useMemo(() => {
    if (!colFilterActive || Object.values(colFilters).every(v => !v)) return filteredTx;
    return filteredTx.filter(tx => {
      if (colFilters.date && new Date(tx.transactionDate).toLocaleDateString("ar-EG") !== colFilters.date) return false;
      if (colFilters.type && tx.type !== colFilters.type) return false;
      if (colFilters.dir) {
        const isIn = CREDIT_TYPES.includes(tx.type);
        if (colFilters.dir === "in" && !isIn) return false;
        if (colFilters.dir === "out" && isIn) return false;
      }
      if (colFilters.by && tx.createdByName !== colFilters.by) return false;
      return true;
    });
  }, [filteredTx, colFilters, colFilterActive]);

  if (isLoading && !regData) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-2xl animate-pulse" style={{background:"#DEA82115"}} />
        <div className="absolute inset-0 flex items-center justify-center">
          <RefreshCw className="w-7 h-7 animate-spin" style={{color:"#DEA821"}} />
        </div>
      </div>
      <div className="text-center"><p className="text-sm font-medium text-foreground">جارٍ تحميل الخزنة</p></div>
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => navigate("/finance")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ChevronRight className="w-4 h-4" />
            لوحة الماليات
          </button>
          <h1 className="text-2xl font-black flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm" style={{background:"#DEA82120"}}>
              <Wallet className="w-5 h-5" style={{color:"#DEA821"}} />
            </div>
            إدارة الخزنة
          </h1>
          <p className="text-xs text-muted-foreground mt-1 mr-12">تتبع الرصيد والحركات النقدية لكل الخزن</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs rounded-xl border-border/60" onClick={() => navigate("/finance/cash/analytics")}>
            <BarChart3 className="w-3.5 h-3.5" /> تحليلات
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs rounded-xl border-border/60" onClick={() => setTransferOpen(true)}>
            <ArrowRightLeft className="w-3.5 h-3.5" /> تحويل
          </Button>
          <Button size="sm" className="gap-1.5 h-9 text-xs rounded-xl font-bold shadow-md text-black" style={{background:"#DEA821"}} onMouseEnter={e=>(e.currentTarget.style.background="#c8931c")} onMouseLeave={e=>(e.currentTarget.style.background="#DEA821")} onClick={() => setAddRegOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> خزنة جديدة
          </Button>
        </div>
      </div>

      {/* ── تنبيهات الرصيد المنخفض ── */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-rose-600 flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> تنبيهات الرصيد المنخفض</p>
          <div className="flex flex-wrap gap-2">
            {alerts.map(a => (
              <div key={a.registerId} className="flex items-center gap-2 bg-white/60 dark:bg-rose-900/20 border border-rose-300/40 px-3 py-1.5 rounded-lg text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="font-semibold text-rose-700 dark:text-rose-400">{a.name}</span>
                <span className="text-muted-foreground">رصيد: <span className="font-bold text-rose-600">{fmt(a.balance)}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── التنبيهات الذكية ── */}
      {smartAlerts.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-50/30 dark:bg-amber-950/20 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> تنبيهات ذكية</p>
          <div className="space-y-1.5">
            {smartAlerts.map((a: any, i: number) => (
              <div key={i} className={`flex items-start gap-2.5 text-xs rounded-lg px-3 py-2 ${a.type==="danger"?"bg-rose-100/50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400":a.type==="warning"?"bg-amber-100/50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400":a.type==="success"?"bg-emerald-100/50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400":"bg-sky-100/50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400"}`}>
                <span className="text-sm leading-none mt-0.5">{a.type==="danger"?"🔴":a.type==="warning"?"🟡":a.type==="success"?"🟢":"🔵"}</span>
                <div><p className="font-semibold">{a.title}</p>{a.detail&&<p className="opacity-70 mt-0.5">{a.detail}</p>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── إجمالي الكاش ── */}
      <div className="relative overflow-hidden rounded-2xl text-black p-6 shadow-2xl" style={{background:"linear-gradient(135deg, #DEA821 0%, #f5c842 50%, #DEA821 100%)", boxShadow:"0 20px 60px #DEA82140"}}>
        <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full bg-black/5" />
        <div className="absolute -bottom-10 -right-6 w-52 h-52 rounded-full bg-black/8" />
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold opacity-70 mb-2 flex items-center gap-1.5 uppercase tracking-widest"><Wallet className="w-3.5 h-3.5" /> إجمالي الكاش</p>
              <p className="text-5xl font-black tracking-tight leading-none drop-shadow-sm">{fmt(totalBalance)}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-sm" style={{background:"#00000018"}}><TrendingUp className="w-7 h-7" /></div>
          </div>
          <div className="flex items-center gap-2.5 mt-4">
            <span className="text-xs font-bold px-3 py-1 rounded-full" style={{background:"#00000015"}}>{registers.length} خزنة نشطة</span>
            {mainReg && <span className="text-xs font-bold px-3 py-1 rounded-full" style={{background:"#00000015"}}>رئيسية: {fmt(mainReg.balance)}</span>}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 flex-wrap border-b border-border/40 pb-3">
        <button onClick={() => setActiveTab("all")} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${activeTab==="all"?"bg-primary text-primary-foreground shadow-md":"text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>كل الخزن</button>
        {registers.map(r => (
          <button key={r.id} onClick={() => { setActiveTab(r.id); setLedgerPage(1); }} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${activeTab===r.id?"bg-primary text-primary-foreground shadow-md":"text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>
            {r.type==="main"?<Star className="w-3 h-3"/>:<Building2 className="w-3 h-3"/>}
            {r.name}
            {alerts.some(a=>a.registerId===r.id)&&<span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-pulse"/>}
          </button>
        ))}
      </div>

      {/* ── كل الخزن ── */}
      {activeTab === "all" && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {registers.map(r => {
            const net = r.monthlyIn - r.monthlyOut; const hasAlert = alerts.some(a=>a.registerId===r.id); const isMain = r.type==="main";
            const cardColor = isMain ? "#DEA821" : hasAlert ? "#ef4444" : "#7E57C2";
            const cardGlow  = isMain ? "rgba(222,168,33,0.28)" : hasAlert ? "rgba(239,68,68,0.22)" : "rgba(126,87,194,0.22)";
            const cardBg    = isMain
              ? "linear-gradient(135deg, rgba(222,168,33,0.38) 0%, rgba(222,168,33,0.14) 52%, rgba(255,255,255,0.06) 100%)"
              : hasAlert
              ? "linear-gradient(135deg, rgba(239,68,68,0.32) 0%, rgba(239,68,68,0.12) 52%, rgba(255,255,255,0.06) 100%)"
              : "linear-gradient(135deg, rgba(126,87,194,0.32) 0%, rgba(126,87,194,0.12) 52%, rgba(255,255,255,0.06) 100%)";
            return (
              <div key={r.id}
                className="group relative overflow-hidden rounded-[22px] p-5 cursor-pointer transition-all duration-300 hover:-translate-y-1"
                style={{ background: cardBg, border: `1px solid ${cardGlow}`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px ${cardGlow}`, backdropFilter: "blur(12px)" }}
                onClick={() => { setActiveTab(r.id); setLedgerPage(1); }}>
                {/* خط ضوء أعلى الكارد */}
                <div className="absolute inset-x-6 top-0 h-px pointer-events-none"
                  style={{ background: `linear-gradient(90deg, transparent, ${cardColor}, transparent)` }} />
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${isMain?"bg-gradient-to-br from-yellow-500/20 to-amber-500/10":"bg-gradient-to-br from-primary/15 to-primary/5"}`}>{isMain?<Star className="w-5 h-5 text-yellow-500"/>:<Building2 className="w-5 h-5 text-primary"/>}</div>
                    <div><p className="font-semibold text-sm leading-tight">{r.name}</p><span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 inline-block ${isMain?"bg-yellow-500/10 text-yellow-600 dark:text-yellow-400":"bg-muted text-muted-foreground"}`}>{isMain?"رئيسية":"فرعية"}</span></div>
                  </div>
                  <div className="flex gap-0.5">
                    {hasAlert&&<Bell className="w-3.5 h-3.5 text-rose-500 mx-1"/>}
                    <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={e=>{e.stopPropagation();setSelectedReg(r);setEditForm({name:r.name,description:r.description??"",isDefault:!!(r as any).isDefault});setEditOpen(true);}}><Pencil className="w-3 h-3 text-muted-foreground"/></button>
                    <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" onClick={e=>{e.stopPropagation();setSelectedReg(r);setThresholdVal(r.lowBalanceThreshold??"");setThresholdOpen(true);}}><Bell className="w-3 h-3 text-muted-foreground"/></button>
                  </div>
                </div>
                <p className={`text-3xl font-black tabular-nums mb-1 ${hasAlert?"text-rose-600":"text-emerald-600 dark:text-emerald-400"}`}>{fmt(r.balance)}</p>
                {r.lowBalanceThreshold&&(<p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1"><Bell className="w-2.5 h-2.5"/> حد: {fmt(r.lowBalanceThreshold)}</p>)}
                <div className="grid grid-cols-3 gap-2 text-center mt-3 pt-3 border-t border-border/40">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl py-2"><p className="text-[10px] text-muted-foreground mb-0.5">دخل</p><p className="text-xs font-bold text-emerald-600">+{fmtShort(r.monthlyIn)}</p></div>
                  <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl py-2"><p className="text-[10px] text-muted-foreground mb-0.5">خروج</p><p className="text-xs font-bold text-rose-600">-{fmtShort(r.monthlyOut)}</p></div>
                  <div className={`rounded-xl py-2 ${net>=0?"bg-emerald-50 dark:bg-emerald-900/20":"bg-rose-50 dark:bg-rose-900/20"}`}><p className="text-[10px] text-muted-foreground mb-0.5">صافي</p><p className={`text-xs font-bold ${net>=0?"text-emerald-600":"text-rose-600"}`}>{net>=0?"+":""}{fmtShort(net)}</p></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 gap-1 text-[11px] h-8 rounded-xl" onClick={e=>{e.stopPropagation();setSelectedReg(r);setTxOpen(true);}}><Plus className="w-3 h-3"/> حركة</Button>
                  <Button size="sm" variant="ghost" className="flex-1 gap-1 text-[11px] h-8 rounded-xl" onClick={e=>{e.stopPropagation();setActiveTab(r.id);}}><CreditCard className="w-3 h-3"/> كشف</Button>
                  {!isMain && (
                    <Button size="sm" variant="ghost"
                      className="gap-1 text-[11px] h-8 rounded-xl text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-rose-200 dark:border-rose-800"
                      onClick={e=>{e.stopPropagation();if(confirm(`أرشفة "${r.name}"؟\nسيتم نقلها للأرشيف ويمكنك استعادتها لاحقاً.`))delMut.mutate(r.id);}}>
                      <Trash2 className="w-3 h-3"/> حذف
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── كشف الحساب (خزنة مفردة) ── */}
      {activeTab !== "all" && activeReg && (
        <div className="space-y-3">
          {/* header الخزنة */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shadow-sm shrink-0 ${activeReg.type==="main"?"bg-gradient-to-br from-yellow-500/20 to-amber-500/10":"bg-gradient-to-br from-primary/15 to-primary/5"}`}>
                {activeReg.type==="main"?<Star className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500"/>:<Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary"/>}
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black">{activeReg.name}</h2>
                <p className="text-xs text-muted-foreground">الرصيد الحالي: <span className="font-bold text-emerald-600 text-sm">{fmt(activeReg.balance)}</span></p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs rounded-xl flex-1 sm:flex-none" onClick={() => { setSelectedReg(activeReg); setTxOpen(true); }}><Plus className="w-3.5 h-3.5"/> حركة جديدة</Button>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs rounded-xl" onClick={handleExportCSV}><Download className="w-3.5 h-3.5"/> CSV</Button>
              <Button size="sm" className="gap-1.5 h-8 text-xs rounded-xl text-black font-bold" style={{background:"#DEA821"}} onMouseEnter={e=>(e.currentTarget.style.background="#c8931c")} onMouseLeave={e=>(e.currentTarget.style.background="#DEA821")} onClick={handleExportExcel}><FileSpreadsheet className="w-3.5 h-3.5"/> Excel</Button>
            </div>
          </div>

          {/* ملخص stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: "إجمالي الدخل",  shortLabel: "دخل",   icon: <ArrowUpCircle className="w-3 h-3"/>, value: fmt(stats.totalIn),  color: "#26A69A", glow: "rgba(38,166,154,0.28)",  bg: "linear-gradient(135deg, rgba(38,166,154,0.44) 0%, rgba(38,166,154,0.16) 52%, rgba(255,255,255,0.08) 100%)" },
                { label: "إجمالي الخروج", shortLabel: "خروج",  icon: <ArrowDownCircle className="w-3 h-3"/>, value: fmt(stats.totalOut), color: "#ef4444", glow: "rgba(239,68,68,0.28)",   bg: "linear-gradient(135deg, rgba(239,68,68,0.42) 0%, rgba(239,68,68,0.16) 52%, rgba(255,255,255,0.08) 100%)" },
                { label: "الصافي",         shortLabel: "صافي",  icon: stats.net>=0?<TrendingUp className="w-3 h-3"/>:<TrendingDown className="w-3 h-3"/>, value: (stats.net>=0?"+":"")+fmt(stats.net), color: stats.net>=0?"#26A69A":"#ef4444", glow: stats.net>=0?"rgba(38,166,154,0.28)":"rgba(239,68,68,0.28)", bg: stats.net>=0?"linear-gradient(135deg, rgba(38,166,154,0.44) 0%, rgba(38,166,154,0.16) 52%, rgba(255,255,255,0.08) 100%)":"linear-gradient(135deg, rgba(239,68,68,0.42) 0%, rgba(239,68,68,0.16) 52%, rgba(255,255,255,0.08) 100%)" },
              ].map(c => (
                <div key={c.label} className="relative overflow-hidden rounded-[16px] sm:rounded-[18px] px-2 sm:px-4 py-3 sm:py-3.5 text-center"
                  style={{ background: c.bg, border: `1px solid ${c.glow}`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 24px ${c.glow}`, backdropFilter: "blur(12px)" }}>
                  <div className="absolute inset-x-6 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.color}, transparent)` }} />
                  <p className="text-[9px] sm:text-[10px] font-bold mb-1 flex items-center justify-center gap-1" style={{ color: c.color }}>
                    {c.icon}
                    <span className="hidden sm:inline">{c.label}</span>
                    <span className="sm:hidden">{c.shortLabel}</span>
                  </p>
                  <p className="text-sm sm:text-lg font-black leading-tight" style={{ color: c.color, textShadow: `0 0 14px ${c.color}88` }}>{c.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* تدفق المال chart */}
          {flowData && flowData.length > 0 && (
            <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5"/> تدفق الكاش — آخر 30 يوم</p>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={flowData} margin={{top:0,right:0,left:0,bottom:0}}>
                  <defs>
                    <linearGradient id="gin" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                    <linearGradient id="gout" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/><stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4}/>
                  <XAxis dataKey="day" tick={{fontSize:8}} tickFormatter={d=>d.slice(5)} stroke="hsl(var(--muted-foreground))"/>
                  <YAxis tick={{fontSize:8}} tickFormatter={fmtShort} width={28} stroke="hsl(var(--muted-foreground))"/>
                  <Tooltip formatter={(v:any,n:string)=>[fmt(v),n==="in"?"دخل":n==="out"?"خروج":"صافي"]} labelFormatter={l=>`يوم ${l}`} contentStyle={{fontSize:11,borderRadius:8}}/>
                  <Area type="monotone" dataKey="in" stroke="#10b981" strokeWidth={2} fill="url(#gin)" name="in"/>
                  <Area type="monotone" dataKey="out" stroke="#f43f5e" strokeWidth={2} fill="url(#gout)" name="out"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── أزرار التصدير + فلتر ── */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs rounded-xl" onClick={handleExportCSV}><Download className="w-3.5 h-3.5"/> <span className="hidden sm:inline">CSV</span></Button>
              <Button size="sm" className="gap-1.5 h-8 text-xs rounded-xl text-black font-bold" style={{background:"#DEA821"}} onMouseEnter={e=>(e.currentTarget.style.background="#c8931c")} onMouseLeave={e=>(e.currentTarget.style.background="#DEA821")} onClick={handleExportExcel}><FileSpreadsheet className="w-3.5 h-3.5"/> <span className="hidden sm:inline">Excel</span></Button>
            </div>
            <div className="flex gap-2">
              {colFilterActive && Object.values(colFilters).some(v => v) && (
                <button onClick={() => setColFilters({})} className="flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-600 px-2 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors border border-rose-300/40">
                  <X className="w-3 h-3"/> إلغاء
                </button>
              )}
              <button
                onClick={() => { setColFilterActive(v => !v); setColFilters({}); }}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${colFilterActive ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                <SlidersHorizontal className="w-3.5 h-3.5"/>
                <span className="hidden sm:inline">{colFilterActive ? "إخفاء الفلتر" : "إنشاء فلتر"}</span>
                <span className="sm:hidden">فلتر</span>
              </button>
            </div>
          </div>

          {/* ── جدول الحركات (desktop) / كاردات (mobile) ── */}
          <div className="relative overflow-hidden rounded-[22px]"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.18)" }}>
            <div className="absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(38,166,154,0.7), rgba(222,168,33,0.7), transparent)" }} />
            {ledgerLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                <RefreshCw className="w-4 h-4 animate-spin"/> جارٍ التحميل...
              </div>
            ) : filteredTx.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                <CreditCard className="w-8 h-8 opacity-30"/>
                <p className="text-xs">لا توجد حركات بهذه الفلاتر</p>
              </div>
            ) : (
              <>
                {/* ── موبايل: كاردات ── */}
                <div className="md:hidden divide-y divide-border/30">
                  {colFilteredTx.map((tx, i) => {
                    const isIn = CREDIT_TYPES.includes(tx.type);
                    const lbl = TX_LABELS[tx.type];
                    return (
                      <div key={tx.id} className={`p-3 flex flex-col gap-1.5 ${i%2===0?"bg-transparent":"bg-muted/10"}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isIn?"bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400":"bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"}`}>
                              {isIn?<ArrowUpCircle className="w-2.5 h-2.5"/>:<ArrowDownCircle className="w-2.5 h-2.5"/>}{isIn?"دخل":"خروج"}
                            </span>
                            <span className={`text-xs font-semibold ${lbl?.color??""}`}>{lbl?.label??tx.type}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => { setSelectedTx(tx); setEditTxForm({ type: tx.type, amount: tx.amount, description: tx.description ?? "", referenceNumber: tx.referenceNumber ?? "", transactionDate: tx.transactionDate.slice(0,10) }); setEditTxOpen(true); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><Pencil className="w-3 h-3"/></button>
                            <button onClick={() => { if (confirm("حذف هذه الحركة نهائياً؟")) deleteTxMut.mutate(tx.id); }} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-muted-foreground hover:text-rose-500 transition-colors"><Trash2 className="w-3 h-3"/></button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`text-base font-black tabular-nums ${isIn?"text-emerald-600":"text-rose-600"}`}>{isIn?"+":"-"}{fmt(tx.amount)}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(tx.transactionDate).toLocaleDateString("ar-EG")}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>رصيد بعد: <span className="font-semibold tabular-nums">{fmt(tx.balanceAfter)}</span></span>
                          {tx.createdByName && <span>{tx.createdByName}</span>}
                        </div>
                        {(tx.description || tx.referenceNumber) && (
                          <p className="text-[10px] text-muted-foreground/70 truncate">{tx.description}{tx.referenceNumber&&<span className="mr-1">#{tx.referenceNumber}</span>}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* ── ديسكتوب: جدول ── */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "hsl(var(--muted)/0.3)", borderBottom: "1px solid hsl(var(--border))" }}>
                        {[
                          { key: "date",   label: "التاريخ",    filterKey: "date", options: colOptions.date },
                          { key: "type",   label: "نوع الحركة", filterKey: "type", options: colOptions.type },
                          { key: "dir",    label: "الاتجاه",    filterKey: "dir",  options: colOptions.dir  },
                          { key: "amount", label: "المبلغ",     filterKey: "",     options: []              },
                          { key: "after",  label: "الرصيد بعد", filterKey: "",     options: []              },
                          { key: "desc",   label: "ملاحظة",     filterKey: "",     options: []              },
                          { key: "by",     label: "بواسطة",     filterKey: "by",   options: colOptions.by   },
                          { key: "actions",label: "",           filterKey: "",     options: []              },
                        ].map(col => (
                          <th key={col.key} className={`text-right p-3 text-xs font-semibold tracking-wide ${col.key === "by" ? "hidden lg:table-cell" : ""}`}
                            style={{ color: "hsl(var(--muted-foreground))" }}>
                            <div className="flex flex-col gap-1.5">
                              <span className="flex items-center gap-1">
                                {col.label}
                                {colFilterActive && col.filterKey && <Filter className="w-2.5 h-2.5 text-primary opacity-60"/>}
                              </span>
                              {colFilterActive && col.filterKey && col.options.length > 0 && (
                                <select
                                  value={colFilters[col.filterKey] ?? ""}
                                  onChange={e => setColFilters(p => ({ ...p, [col.filterKey]: e.target.value }))}
                                  onClick={e => e.stopPropagation()}
                                  className="w-full h-7 px-2 rounded-lg border border-border bg-background text-[10px] font-normal text-foreground outline-none focus:border-primary/50 cursor-pointer"
                                >
                                  <option value="">الكل</option>
                                  {col.options.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {colFilteredTx.map((tx, i) => {
                        const isIn = CREDIT_TYPES.includes(tx.type);
                        const lbl = TX_LABELS[tx.type];
                        return (
                          <tr key={tx.id} className={`group border-b border-border/20 transition-colors hover:bg-muted/30 ${i%2===0?"bg-transparent":"bg-muted/10"}`}>
                            <td className="p-3 text-muted-foreground">{new Date(tx.transactionDate).toLocaleDateString("ar-EG")}</td>
                            <td className="p-3"><span className={`font-semibold ${lbl?.color??""}`}>{lbl?.label??tx.type}</span></td>
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isIn?"bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400":"bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"}`}>
                                {isIn?<ArrowUpCircle className="w-2.5 h-2.5"/>:<ArrowDownCircle className="w-2.5 h-2.5"/>}
                                {isIn?"دخل":"خروج"}
                              </span>
                            </td>
                            <td className={`p-3 font-bold tabular-nums text-left ${isIn?"text-emerald-600":"text-rose-600"}`}>{isIn?"+":"-"}{fmt(tx.amount)}</td>
                            <td className="p-3 text-muted-foreground tabular-nums text-left">{fmt(tx.balanceAfter)}</td>
                            <td className="p-3 text-muted-foreground max-w-[180px] truncate">{tx.description??""}{tx.referenceNumber&&<span className="text-[10px] text-muted-foreground/60 mr-1">#{tx.referenceNumber}</span>}</td>
                            <td className="p-3 text-muted-foreground hidden lg:table-cell">{tx.createdByName??""}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setSelectedTx(tx); setEditTxForm({ type: tx.type, amount: tx.amount, description: tx.description ?? "", referenceNumber: tx.referenceNumber ?? "", transactionDate: tx.transactionDate.slice(0,10) }); setEditTxOpen(true); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil className="w-3 h-3"/></button>
                                <button onClick={() => { if (confirm("حذف هذه الحركة نهائياً؟")) deleteTxMut.mutate(tx.id); }} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-muted-foreground hover:text-rose-500 transition-colors"><Trash2 className="w-3 h-3"/></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* ── Pagination ── */}
          {pagination && pagination.total > pagination.limit && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{pagination.total} حركة إجمالي</span>
              <div className="flex items-center gap-1">
                <button disabled={ledgerPage<=1} onClick={()=>setLedgerPage(p=>p-1)} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4"/></button>
                <span className="px-3 py-1 rounded-lg bg-muted font-semibold">صفحة {ledgerPage} / {Math.ceil(pagination.total/pagination.limit)}</span>
                <button disabled={ledgerPage>=Math.ceil(pagination.total/pagination.limit)} onClick={()=>setLedgerPage(p=>p+1)} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"><ChevronLeft className="w-4 h-4"/></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ Dialogs ══════ */}

      {/* ── إضافة خزنة ── */}
      <Dialog open={addRegOpen} onOpenChange={setAddRegOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4"/> خزنة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1"><Label className="text-xs">الاسم *</Label><Input placeholder="مثل: خزنة الفرع الثالث" value={newReg.name} onChange={e=>setNewReg(p=>({...p,name:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">النوع</Label>
              <Select value={newReg.type} onValueChange={v=>setNewReg(p=>({...p,type:v}))}>
                <SelectTrigger className="text-sm"><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="branch">فرعية</SelectItem><SelectItem value="main">رئيسية</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">رصيد افتتاحي</Label><Input type="number" placeholder="0" value={newReg.initialBalance} onChange={e=>setNewReg(p=>({...p,initialBalance:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">ملاحظات</Label><Textarea placeholder="وصف اختياري" value={newReg.description} onChange={e=>setNewReg(p=>({...p,description:e.target.value}))} className="text-sm" rows={2}/></div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-xs font-semibold">تعيين كخزنة افتراضية</p>
                <p className="text-[11px] text-muted-foreground">تُستخدم تلقائياً للمصروفات وأوامر الشراء</p>
              </div>
              <button onClick={()=>setNewReg(p=>({...p,isDefault:!p.isDefault}))}
                className={`w-10 h-6 rounded-full transition-all duration-200 relative ${newReg.isDefault?"bg-emerald-500":"bg-muted"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${newReg.isDefault?"right-0.5":"left-0.5"}`}/>
              </button>
            </div>
            <Button className="w-full text-black font-bold" style={{background:"#DEA821"}} disabled={!newReg.name||addRegMut.isPending} onClick={()=>addRegMut.mutate(newReg)}>{addRegMut.isPending?"جارٍ الإنشاء...":"إنشاء الخزنة"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── تسجيل حركة ── */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="w-4 h-4"/> تسجيل حركة — {selectedReg?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1"><Label className="text-xs">نوع الحركة</Label>
              <Select value={txForm.type} onValueChange={v=>setTxForm(p=>({...p,type:v}))}>
                <SelectTrigger className="text-sm"><SelectValue/></SelectTrigger>
                <SelectContent>{Object.entries(TX_LABELS).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">المبلغ *</Label><Input type="number" placeholder="0.00" value={txForm.amount} onChange={e=>setTxForm(p=>({...p,amount:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">التاريخ</Label><Input type="date" value={txForm.transactionDate} onChange={e=>setTxForm(p=>({...p,transactionDate:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">رقم مرجعي</Label><Input placeholder="اختياري" value={txForm.referenceNumber} onChange={e=>setTxForm(p=>({...p,referenceNumber:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">ملاحظة</Label><Textarea placeholder="وصف الحركة" value={txForm.description} onChange={e=>setTxForm(p=>({...p,description:e.target.value}))} className="text-sm" rows={2}/></div>
            <Button className="w-full text-black font-bold" style={{background:"#DEA821"}} disabled={!txForm.amount||txMut.isPending} onClick={()=>txMut.mutate(txForm)}>{txMut.isPending?"جارٍ التسجيل...":"تسجيل الحركة"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── تحويل بين الخزن ── */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-4 h-4"/> تحويل بين الخزن</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1"><Label className="text-xs">من خزنة</Label>
              <Select value={transfer.fromId} onValueChange={v=>setTransfer(p=>({...p,fromId:v}))}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="اختر..."/></SelectTrigger>
                <SelectContent>{registers.map(r=><SelectItem key={r.id} value={String(r.id)}>{r.name} ({fmt(r.balance)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">إلى خزنة</Label>
              <Select value={transfer.toId} onValueChange={v=>setTransfer(p=>({...p,toId:v}))}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="اختر..."/></SelectTrigger>
                <SelectContent>{registers.filter(r=>String(r.id)!==transfer.fromId).map(r=><SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">المبلغ *</Label><Input type="number" placeholder="0.00" value={transfer.amount} onChange={e=>setTransfer(p=>({...p,amount:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">ملاحظة</Label><Input placeholder="اختياري" value={transfer.description} onChange={e=>setTransfer(p=>({...p,description:e.target.value}))} className="text-sm"/></div>
            <Button className="w-full text-black font-bold" style={{background:"#DEA821"}} disabled={!transfer.fromId||!transfer.toId||!transfer.amount||transferMut.isPending} onClick={()=>transferMut.mutate({...transfer,fromId:parseInt(transfer.fromId),toId:parseInt(transfer.toId),amount:parseFloat(transfer.amount)})}>{transferMut.isPending?"جارٍ التحويل...":"تأكيد التحويل"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── تعديل الخزنة ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4"/> تعديل — {selectedReg?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1"><Label className="text-xs">الاسم</Label><Input value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">ملاحظات</Label><Textarea value={editForm.description} onChange={e=>setEditForm(p=>({...p,description:e.target.value}))} className="text-sm" rows={2}/></div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-xs font-semibold">الخزنة الافتراضية</p>
                <p className="text-[11px] text-muted-foreground">تُستخدم تلقائياً للمصروفات وأوامر الشراء</p>
              </div>
              <button
                onClick={() => setEditForm(p => ({ ...p, isDefault: !p.isDefault }))}
                className={`w-10 h-6 rounded-full transition-all duration-200 relative ${editForm.isDefault ? "bg-emerald-500" : "bg-muted"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${editForm.isDefault ? "right-0.5" : "left-0.5"}`}/>
              </button>
            </div>
            <Button className="w-full text-black font-bold" style={{background:"#DEA821"}} disabled={editMut.isPending} onClick={()=>editMut.mutate(editForm)}>{editMut.isPending?"جارٍ الحفظ...":"حفظ التعديلات"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── حد التنبيه ── */}
      <Dialog open={thresholdOpen} onOpenChange={setThresholdOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Bell className="w-4 h-4"/> حد التنبيه — {selectedReg?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">سيتم إرسال تنبيه عندما يصل الرصيد إلى هذا الحد أو أقل.</p>
            <div className="space-y-1"><Label className="text-xs">الحد الأدنى (ج.م)</Label><Input type="number" placeholder="مثل: 1000" value={thresholdVal} onChange={e=>setThresholdVal(e.target.value)} className="text-sm"/></div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 text-xs gap-1" onClick={()=>thresholdMut.mutate({lowBalanceThreshold:null})}><BellOff className="w-3.5 h-3.5"/> إلغاء التنبيه</Button>
              <Button className="flex-1 text-black font-bold text-xs" style={{background:"#DEA821"}} disabled={thresholdMut.isPending} onClick={()=>thresholdMut.mutate({lowBalanceThreshold:parseFloat(thresholdVal)||null})}>{thresholdMut.isPending?"...":"حفظ"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── تعديل حركة ── */}
      <Dialog open={editTxOpen} onOpenChange={setEditTxOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4"/> تعديل الحركة</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1"><Label className="text-xs">نوع الحركة</Label>
              <Select value={editTxForm.type} onValueChange={v=>setEditTxForm(p=>({...p,type:v}))}>
                <SelectTrigger className="text-sm"><SelectValue/></SelectTrigger>
                <SelectContent>{Object.entries(TX_LABELS).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">المبلغ *</Label><Input type="number" value={editTxForm.amount} onChange={e=>setEditTxForm(p=>({...p,amount:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">التاريخ</Label><Input type="date" value={editTxForm.transactionDate} onChange={e=>setEditTxForm(p=>({...p,transactionDate:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">رقم مرجعي</Label><Input placeholder="اختياري" value={editTxForm.referenceNumber} onChange={e=>setEditTxForm(p=>({...p,referenceNumber:e.target.value}))} className="text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs">ملاحظة</Label><Textarea value={editTxForm.description} onChange={e=>setEditTxForm(p=>({...p,description:e.target.value}))} className="text-sm" rows={2}/></div>
            <Button className="w-full text-black font-bold" style={{background:"#DEA821"}} disabled={!editTxForm.amount||editTxMut.isPending} onClick={()=>editTxMut.mutate({id:selectedTx!.id,body:editTxForm})}>{editTxMut.isPending?"جارٍ الحفظ...":"حفظ التعديلات"}</Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
