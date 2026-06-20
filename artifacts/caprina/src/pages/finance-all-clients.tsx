import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useMemo, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Search, Filter, ChevronLeft, ChevronRight,
  ArrowRight, TrendingUp, ShoppingCart, Receipt,
  MapPin, Phone, CheckCircle2, XCircle, X,
  ArrowUpDown, Eye, Edit2, Camera, ToggleLeft, ToggleRight, Target,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

// ── helpers ────────────────────────────────────────────────────────────────
const fmt = (n: string | number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n));

// ── types ──────────────────────────────────────────────────────────────────
type Client = {
  id: number; name: string; phone: string | null; phone2: string | null;
  email: string | null; address: string | null; city: string | null; region: string | null;
  taxNumber: string | null; commercialReg: string | null; paymentTerms: string | null;
  creditLimit: string; totalOrders: number; totalSales: string; totalPaid: string;
  notes: string | null; isActive: boolean; createdAt: string; avatar: string | null;
};

// ── Avatar helpers ──────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  ["#f59e0b","#78350f"],["#10b981","#064e3b"],["#3b82f6","#1e3a8a"],
  ["#8b5cf6","#4c1d95"],["#ef4444","#7f1d1d"],["#ec4899","#831843"],
  ["#06b6d4","#164e63"],["#f97316","#7c2d12"],
];
function getAvatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function ClientAvatar({ avatar, name, size = "md" }: { avatar?: string|null; name: string; size?: "sm"|"md"|"lg" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : size === "lg" ? "w-14 h-14 text-2xl" : "w-9 h-9 text-sm";
  if (avatar && avatar.startsWith("data:")) {
    return <img src={avatar} className={`${sz} rounded-full object-cover border border-border/50 shrink-0`} />;
  }
  const [bg, fg] = getAvatarColor(name || "?");
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold shrink-0 border border-border/20`}
      style={{ background: bg, color: fg }}>
      {name ? getInitials(name) : "؟"}
    </div>
  );
}

// ── Edit Dialog ────────────────────────────────────────────────────────────
const emptyForm = {
  name: "", phone: "", phone2: "", email: "", address: "", city: "", region: "",
  taxNumber: "", commercialReg: "", paymentTerms: "فوري",
  creditLimit: "0", notes: "", isActive: true, avatar: "",
};

function EditClientDialog({ client, open, onClose, onSuccess }: {
  client: Client; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    if (open) setForm({
      name: client.name,
      phone: client.phone ?? "",
      phone2: client.phone2 ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
      city: client.city ?? "",
      region: client.region ?? "",
      taxNumber: client.taxNumber ?? "",
      commercialReg: client.commercialReg ?? "",
      paymentTerms: client.paymentTerms ?? "فوري",
      creditLimit: String(client.creditLimit ?? "0"),
      notes: client.notes ?? "",
      isActive: client.isActive,
      avatar: client.avatar ?? "",
    });
  }, [open, client]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name, phone: form.phone || null, phone2: form.phone2 || null,
        email: form.email || null, address: form.address || null,
        city: form.city || null, region: form.region || null,
        taxNumber: form.taxNumber || null, commercialReg: form.commercialReg || null,
        paymentTerms: form.paymentTerms || null,
        creditLimit: parseFloat(form.creditLimit) || 0,
        notes: form.notes || null, isActive: form.isActive,
        avatar: form.avatar || null,
      };
      return apiFetch<any>(`/finance/clients/${client.id}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast({ title: "تم تحديث بيانات العميل ✅" });
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof typeof form, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">تعديل — {client.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">

          {/* Avatar Upload */}
          <div>
            <Label className="text-xs mb-2 block">صورة العميل</Label>
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <ClientAvatar avatar={form.avatar} name={form.name || "؟"} size="lg" />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="flex items-center gap-2 cursor-pointer bg-muted/20 hover:bg-muted/40 border border-border hover:border-primary/50 transition-all rounded-lg px-3 py-2 text-xs font-medium">
                  <Camera className="w-3.5 h-3.5 text-primary" />
                  {form.avatar ? "تغيير الصورة" : "رفع صورة"}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) { alert("الصورة كبيرة جداً — الحد الأقصى 2MB"); return; }
                      const reader = new FileReader();
                      reader.onload = ev => f("avatar", ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {form.avatar && (
                  <button type="button" onClick={() => f("avatar", "")}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors px-3 py-1.5 rounded-lg hover:bg-destructive/10 border border-transparent hover:border-destructive/20">
                    <X className="w-3 h-3" /> حذف الصورة
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground px-1">PNG أو JPG — بحد أقصى 2MB</p>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">الاسم / الشركة *</Label>
            <Input placeholder="شركة النور للتجارة" className="h-9 text-sm bg-background" value={form.name} onChange={e => f("name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">الهاتف</Label>
              <Input placeholder="01xxxxxxxxx" className="h-9 text-sm bg-background" value={form.phone} onChange={e => f("phone", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">هاتف إضافي</Label>
              <Input placeholder="01xxxxxxxxx" className="h-9 text-sm bg-background" value={form.phone2} onChange={e => f("phone2", e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">العنوان</Label>
            <Input placeholder="الشارع والحي" className="h-9 text-sm bg-background" value={form.address} onChange={e => f("address", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">المدينة</Label>
              <Input placeholder="القاهرة" className="h-9 text-sm bg-background" value={form.city} onChange={e => f("city", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">المحافظة</Label>
              <Input placeholder="الجيزة" className="h-9 text-sm bg-background" value={form.region} onChange={e => f("region", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">شروط الدفع</Label>
              <Select value={form.paymentTerms} onValueChange={v => f("paymentTerms", v)}>
                <SelectTrigger className="h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["فوري","آجل 15 يوم","آجل 30 يوم","آجل 60 يوم","آجل 90 يوم"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block flex items-center gap-1"><Target className="w-3 h-3" />الهدف</Label>
              <Input type="number" min={0} placeholder="1000000" className="h-9 text-sm bg-background" value={form.creditLimit} onChange={e => f("creditLimit", e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">ملاحظات</Label>
            <Textarea placeholder="أي ملاحظات..." className="min-h-[60px] text-sm resize-none bg-background" value={form.notes} onChange={e => f("notes", e.target.value)} rows={2} />
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-md">
            <span className="text-xs font-medium">حالة العميل</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 mr-auto" onClick={() => f("isActive", !form.isActive)}>
              {form.isActive
                ? <><ToggleRight className="w-4 h-4 text-emerald-400" />نشط</>
                : <><ToggleLeft className="w-4 h-4" />غير نشط</>}
            </Button>
          </div>

          <div className="flex gap-2 pt-1">
            <Button className="flex-1 h-9 text-sm font-bold bg-primary text-primary-foreground"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.name.trim()}>
              {mutation.isPending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
            </Button>
            <Button variant="outline" className="h-9 text-sm border-border" onClick={onClose}>إلغاء</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ColumnFilter ───────────────────────────────────────────────────────────
function ColumnFilter({ label, options, selected, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const ref    = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  };

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  return (
    <>
      <button ref={btnRef} onClick={handleOpen}
        className={`flex items-center gap-1 text-[10px] font-bold rounded px-1.5 py-0.5 transition-colors ${
          selected.length > 0 ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
        }`}>
        <Filter className="w-2.5 h-2.5" />{label}
        {selected.length > 0 && (
          <span className="bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-black">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div ref={ref} style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999 }}
          className="bg-card border border-border rounded-lg shadow-xl w-48 py-1 max-h-64 overflow-y-auto">
          {options.length === 0
            ? <p className="text-[11px] text-muted-foreground text-center py-3">لا يوجد خيارات</p>
            : options.map(o => (
              <label key={o.value}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20 cursor-pointer">
                <input type="checkbox" checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                  className="w-3 h-3 accent-primary" />
                <span className="text-[11px] text-foreground">{o.label}</span>
              </label>
            ))}
          {selected.length > 0 && (
            <button onClick={() => onChange([])}
              className="w-full text-[10px] text-destructive hover:underline py-1.5 border-t border-border mt-1">
              مسح الفلتر
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
const PER_PAGE = 15;

export default function AllClientsPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [search,      setSearch]      = useState("");
  const [page,        setPage]        = useState(1);
  const [sortBy,      setSortBy]      = useState<"name"|"totalSales"|"totalOrders"|"createdAt">("totalSales");
  const [sortDir,     setSortDir]     = useState<"asc"|"desc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [filterCity,         setFilterCity]         = useState<string[]>([]);
  const [filterStatus,       setFilterStatus]       = useState<string[]>([]);
  const [filterPaymentTerms, setFilterPaymentTerms] = useState<string[]>([]);
  const [editClient,  setEditClient]  = useState<Client | null>(null);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["finance-clients"],
    queryFn: () => apiFetch<Client[]>("/finance/clients"),
    staleTime: 30_000,
  });

  const cityOptions         = useMemo(() => [...new Set(clients.map(c => c.city).filter(Boolean))].map(v => ({ value: v!, label: v! })), [clients]);
  const paymentTermsOptions = useMemo(() => [...new Set(clients.map(c => c.paymentTerms).filter(Boolean))].map(v => ({ value: v!, label: v! })), [clients]);
  const statusOptions       = [{ value: "true", label: "نشط" }, { value: "false", label: "موقف" }];

  const totalSales   = useMemo(() => clients.reduce((s, c) => s + parseFloat(c.totalSales ?? "0"), 0), [clients]);
  const totalPaid    = useMemo(() => clients.reduce((s, c) => s + parseFloat(c.totalPaid  ?? "0"), 0), [clients]);
  const totalOrders  = useMemo(() => clients.reduce((s, c) => s + (c.totalOrders ?? 0), 0), [clients]);
  const activeCount  = useMemo(() => clients.filter(c => c.isActive).length, [clients]);

  const filtered = useMemo(() => {
    let r = clients.filter(c => {
      if (search && !c.name.includes(search) && !(c.phone ?? "").includes(search) && !(c.city ?? "").includes(search)) return false;
      if (filterCity.length         && !filterCity.includes(c.city ?? ""))                 return false;
      if (filterStatus.length       && !filterStatus.includes(String(c.isActive)))         return false;
      if (filterPaymentTerms.length && !filterPaymentTerms.includes(c.paymentTerms ?? "")) return false;
      return true;
    });
    r = [...r].sort((a, b) => {
      let va: any, vb: any;
      if (sortBy === "name")              { va = a.name;                            vb = b.name; }
      else if (sortBy === "totalSales")   { va = parseFloat(a.totalSales ?? "0");   vb = parseFloat(b.totalSales ?? "0"); }
      else if (sortBy === "totalOrders")  { va = a.totalOrders ?? 0;               vb = b.totalOrders ?? 0; }
      else                               { va = a.createdAt;                       vb = b.createdAt; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
    return r;
  }, [clients, search, filterCity, filterStatus, filterPaymentTerms, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageData   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const activeFiltersCount = filterCity.length + filterStatus.length + filterPaymentTerms.length;

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
    setPage(1);
  };

  const SortBtn = ({ col, label }: { col: typeof sortBy; label: string }) => (
    <button onClick={() => toggleSort(col)}
      className={`flex items-center gap-0.5 text-[10px] font-bold transition-colors ${
        sortBy === col ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}>
      {label}
      <ArrowUpDown className={`w-2.5 h-2.5 ${sortBy === col ? "text-primary" : ""}`} />
    </button>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/finance/clients")}
            className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center hover:bg-muted/60 transition-colors">
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">جميع العملاء التجاريين</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {isLoading ? "جاري التحميل..." : `${filtered.length} عميل من أصل ${clients.length}`}
            </p>
          </div>
        </div>
        <Button onClick={() => navigate("/finance/clients")}
          className="gap-2 bg-primary text-primary-foreground font-bold text-sm h-9">
          <Users className="w-4 h-4" />إدارة العملاء
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي العملاء",    value: clients.length, sub: `${activeCount} نشط`, icon: <Users className="w-5 h-5" />,       color: "text-foreground" },
          { label: "إجمالي الشحنات",    value: totalOrders, sub: `محصَّل ${fmt(totalPaid)}`, icon: <TrendingUp className="w-5 h-5" />, color: "text-primary" },
          { label: "إجمالي الطلبات",    value: totalOrders,     sub: `متوسط ${clients.length ? Math.round(totalOrders / clients.length) : 0} طلب/عميل`, icon: <ShoppingCart className="w-5 h-5" />, color: "text-foreground" },
          { label: "المتبقي غير محصَّل", value: fmt(totalSales - totalPaid), sub: `${clients.length ? Math.round((totalPaid / totalSales) * 100) || 0 : 0}% نسبة التحصيل`, icon: <Receipt className="w-5 h-5" />, color: "text-amber-400" },
        ].map((k, i) => (
          <Card key={i} className="border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground">{k.icon}</div>
            </div>
            <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-primary mt-1">{k.sub}</p>
          </Card>
        ))}
      </div>

      {/* Table Card */}
      <Card className="border-border bg-card">

        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-border gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute right-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="بحث بالاسم أو التليفون أو المدينة..."
                className="h-8 text-xs bg-background pr-8 w-56"
                value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Button variant="outline" size="sm"
              className={`h-8 text-xs gap-1 border-border relative ${showFilters || activeFiltersCount > 0 ? "border-primary text-primary" : ""}`}
              onClick={() => setShowFilters(v => !v)}>
              <Filter className="w-3 h-3" />فلتر
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary rounded-full text-[9px] text-primary-foreground flex items-center justify-center font-black">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
            {activeFiltersCount > 0 && (
              <button onClick={() => { setFilterCity([]); setFilterStatus([]); setFilterPaymentTerms([]); }}
                className="flex items-center gap-1 text-[11px] text-destructive hover:underline">
                <X className="w-3 h-3" />مسح الفلاتر
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            عرض {Math.min((page - 1) * PER_PAGE + 1, filtered.length)}–{Math.min(page * PER_PAGE, filtered.length)} من {filtered.length}
          </p>
        </div>

        {/* Col Headers */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border bg-muted/5 text-[10px] font-bold text-muted-foreground">
          <div className="col-span-3 flex items-center gap-1">
            {showFilters
              ? <ColumnFilter label="اسم العميل" options={clients.map(c => ({ value: c.name, label: c.name }))} selected={[]} onChange={() => {}} />
              : <SortBtn col="name" label="اسم العميل" />}
          </div>
          <div className="col-span-2 flex items-center gap-1">
            {showFilters
              ? <ColumnFilter label="الحالة" options={statusOptions} selected={filterStatus} onChange={v => { setFilterStatus(v); setPage(1); }} />
              : <span>الحالة</span>}
          </div>
          <div className="col-span-2 flex items-center gap-1">
            {showFilters
              ? <ColumnFilter label="المدينة" options={cityOptions} selected={filterCity} onChange={v => { setFilterCity(v); setPage(1); }} />
              : <span>المدينة</span>}
          </div>
          <div className="col-span-2 flex items-center gap-1">
            {showFilters
              ? <ColumnFilter label="شروط الدفع" options={paymentTermsOptions} selected={filterPaymentTerms} onChange={v => { setFilterPaymentTerms(v); setPage(1); }} />
              : <span>شروط الدفع</span>}
          </div>
          <div className="col-span-1 flex items-center gap-1">
            <SortBtn col="totalOrders" label="الطلبات" />
          </div>
          <div className="col-span-1 flex items-center gap-1">
            <SortBtn col="totalOrders" label="الشحنات" />
          </div>
          <div className="col-span-1 text-left">إجراءات</div>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground text-sm animate-pulse">جاري التحميل...</div>
        ) : pageData.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">لا يوجد عملاء مطابقون</p>
          </div>
        ) : pageData.map((c) => {
          return (
            <div key={c.id}
              className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/50 hover:bg-muted/10 transition-colors items-center group">

              {/* اسم + أفاتار + تليفون */}
              <div className="col-span-3 flex items-center gap-2 min-w-0 cursor-pointer"
                onClick={() => navigate(`/finance/clients/${c.id}`)}>
                <ClientAvatar avatar={c.avatar} name={c.name} size="md" />
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{c.name}</p>
                  {c.phone && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Phone className="w-2.5 h-2.5" />{c.phone}
                    </p>
                  )}
                </div>
              </div>

              {/* الحالة */}
              <div className="col-span-2">
                <Badge variant="outline"
                  className={`text-[9px] border ${c.isActive
                    ? "border-emerald-700 bg-emerald-900/20 text-emerald-400"
                    : "border-border text-muted-foreground"}`}>
                  {c.isActive
                    ? <><CheckCircle2 className="w-2.5 h-2.5 ml-0.5" />نشط</>
                    : <><XCircle     className="w-2.5 h-2.5 ml-0.5" />موقف</>}
                </Badge>
              </div>

              {/* المدينة */}
              <div className="col-span-2">
                {c.city
                  ? <span className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3 text-muted-foreground" />{c.city}</span>
                  : <span className="text-[10px] text-muted-foreground">—</span>}
              </div>

              {/* شروط الدفع */}
              <div className="col-span-2">
                <span className="text-[10px] bg-muted/30 rounded-full px-2 py-0.5">{c.paymentTerms ?? "—"}</span>
              </div>

              {/* الطلبات */}
              <div className="col-span-1">
                <span className="text-xs font-bold">{c.totalOrders ?? 0}</span>
              </div>

              {/* الشحنات */}
              <div className="col-span-1">
                <span className="text-xs font-bold">{c.totalOrders ?? 0}</span>
              </div>

              {/* إجراءات */}
              <div className="col-span-1 flex justify-end items-center gap-1">
                <button
                  onClick={e => { e.stopPropagation(); setEditClient(c); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => navigate(`/finance/clients/${c.id}`)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors opacity-0 group-hover:opacity-100">
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-border">
            <Button variant="outline" size="icon" className="h-7 w-7"
              disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = totalPages <= 5 ? i + 1
                  : page <= 3 ? i + 1
                  : page >= totalPages - 2 ? totalPages - 4 + i
                  : page - 2 + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded text-xs font-bold transition-colors ${
                      page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted/30 text-muted-foreground"
                    }`}>{p}</button>
                );
              })}
            </div>
            <Button variant="outline" size="icon" className="h-7 w-7"
              disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </Card>

      {/* Edit Dialog */}
      {editClient && (
        <EditClientDialog
          client={editClient}
          open={!!editClient}
          onClose={() => setEditClient(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["finance-clients"] })}
        />
      )}
    </div>
  );
}
