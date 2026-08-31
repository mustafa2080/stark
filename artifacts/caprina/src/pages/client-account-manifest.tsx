import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Plus, Users, Edit2, Trash2, Phone, MapPin, ToggleLeft, ToggleRight,
  FileSpreadsheet, TrendingUp, ImagePlus, X as XIcon, Camera, Target,
  ChevronDown, Lock, Unlock, Truck, Package, Search, SlidersHorizontal, X,
  LayoutGrid, List, Check, Wallet, FileText, CircleUserRound, FolderOpen, FolderLock,
} from "lucide-react";

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

type Client = {
  id: number; name: string; phone: string | null; phone2: string | null;
  email: string | null; address: string | null; city: string | null; region: string | null;
  taxNumber: string | null; commercialReg: string | null; paymentTerms: string | null;
  creditLimit: string; totalOrders: number; totalSales: string; totalPaid: string;
  netRevenue?: string; profitMargin?: number; netRevenueDue?: string;
  accountBalance?: number; accountRemaining?: number;
  notes: string | null; isActive: boolean; createdAt: string; avatar: string | null;
  warehouseId: number | null;
  hasOpenManifest?: boolean;
  latestManifestId?: number | null;
};

const emptyForm = {
  name: "", phone: "", phone2: "", address: "", city: "", region: "",
  paymentTerms: "فوري", creditLimit: "0", notes: "", isActive: true, avatar: "",
};

/** يضغط ويصغّر الصورة قبل تحويلها لـ base64 */
function resizeAndCompressImage(file: File, maxDim = 320, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        } else {
          if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas غير مدعوم")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("تعذّر قراءة الصورة"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

/** أفاتار العميل — صورة دائرية أو حروف الاسم */
const AVATAR_COLORS = [
  ["#f59e0b", "#78350f"], ["#10b981", "#064e3b"], ["#3b82f6", "#1e3a8a"],
  ["#8b5cf6", "#4c1d95"], ["#ef4444", "#7f1d1d"], ["#ec4899", "#831843"],
  ["#06b6d4", "#164e63"], ["#f97316", "#7c2d12"],
];
function getAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function ClientAvatar({ avatar, name, size = "md" }: { avatar?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "w-14 h-14 text-2xl" : size === "sm" ? "w-7 h-7 text-xs" : "w-10 h-10 text-sm";
  if (avatar && avatar.startsWith("data:")) {
    return <img src={avatar} className={`${dims} rounded-full object-cover border-2 border-border/50 shrink-0`} alt={name} />;
  }
  const [bg, fg] = getAvatarColor(name || "؟");
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0 border border-border/20`}
      style={{ background: bg, color: fg }}>
      {name ? getInitials(name) : "؟"}
    </div>
  );
}

/** حقل رفع صورة العميل */
function AvatarUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "خطأ", description: "يجب اختيار ملف صورة (PNG, JPG, WEBP).", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const compressed = await resizeAndCompressImage(file);
      onChange(compressed);
    } catch (err: any) {
      toast({ title: "خطأ", description: err?.message ?? "تعذّر معالجة الصورة.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      e.target.value = "";
    }
  };
  return (
    <div>
      <Label className="text-xs mb-1.5 block flex items-center gap-1"><ImagePlus className="w-3 h-3" />صورة العميل</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative shrink-0">
            <img src={value} className="w-14 h-14 rounded-full object-cover border-2 border-border" alt="avatar" />
            <button
              type="button"
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80 transition-colors"
              onClick={() => onChange("")}
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div
            className="w-14 h-14 rounded-full bg-muted/30 border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/60 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full" disabled={isProcessing} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="w-3.5 h-3.5" />
            {isProcessing ? "جاري المعالجة..." : value ? "تغيير الصورة" : "رفع صورة"}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, WEBP — يتم ضغط الصورة وتصغيرها تلقائياً</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

type ClientShipmentItem = {
  id: number;
  shipmentNumber: string;
  status: string;
  receiverName: string;
  receiverCity: string;
  codAmount: string | number | null;
  shippingFee: string | number | null;
  createdAt: string;
  pieces: number | null;
};

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  waiting: "انتظار", confirmed: "مؤكد", picked_up: "تم الاستلام",
  warehouse_ready: "جاهز للشحن", in_transit: "قيد الشحن", in_shipping: "في الشحن",
  out_for_delivery: "خرج للتسليم", delivered: "مسلَّم", received: "مستلم",
  partial_received: "استلام جزئي", delayed: "مؤجل",
  returned: "مرتجع", cancelled: "ملغي",
};
const SHIPMENT_STATUS_COLORS: Record<string, string> = {
  waiting: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  confirmed: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  picked_up: "border-indigo-500/40 bg-indigo-500/10 text-indigo-400",
  warehouse_ready: "border-purple-500/40 bg-purple-500/10 text-purple-400",
  in_transit: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
  in_shipping: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
  out_for_delivery: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  delivered: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  received: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  partial_received: "border-teal-500/40 bg-teal-500/10 text-teal-400",
  delayed: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  returned: "border-red-500/40 bg-red-500/10 text-red-500",
  cancelled: "border-red-500/40 bg-red-500/10 text-red-500",
};

type ClientAccountManifestItem = {
  id: number;
  manifestNumber: string;
  status: string;
  createdAt: string;
  closedAt: string | null;
  shipmentCount: number;
  statusCounts: { pending: number; delayed: number; returned: number; delivered: number; partial: number };
};

const MANIFEST_STATUS_LABELS: Record<string, string> = {
  open: "مفتوح", closed: "مغلق",
};
const MANIFEST_STATUS_COLORS: Record<string, string> = {
  open: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  closed: "border-border text-muted-foreground",
};

/** قائمة منسدلة تعرض البيان المفتوح (وباقي بيانات العميل) — بالضغط عليها يودّي لتفاصيل البيان */
function ClientManifestsDropdown({ clientId }: { clientId: number }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<ClientAccountManifestItem[]>({
    queryKey: ["client-account-manifests-dropdown", clientId],
    queryFn: () => apiFetch(`/client-account-manifests?clientId=${clientId}`),
    enabled: open,
  });
  const manifests = data ?? [];
  const shown = manifests.slice(0, 8);

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="w-full h-8 mt-2 text-xs gap-1.5 font-bold justify-between"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      >
        <span className="flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" />
          البيانات {data ? `(${data.length})` : ""}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && (
        <div
          className="mt-1.5 rounded-lg border border-border bg-background/60 max-h-64 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <div className="p-3 text-center text-xs text-muted-foreground">جاري التحميل...</div>
          ) : shown.length ? (
            <>
              {shown.map((m) => (
                <button
                  key={m.id}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-right hover:bg-muted/30 border-b border-border/30 last:border-b-0 transition-colors"
                  onClick={() => navigate(`/finance/client-account-sheet/manifest/${m.id}`)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                    <div className="min-w-0 text-right">
                      <p className="text-xs font-bold truncate">{m.manifestNumber}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {fmtDate(m.createdAt)} · {m.shipmentCount} شحنة
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] font-bold shrink-0 ${MANIFEST_STATUS_COLORS[m.status] ?? "border-border text-muted-foreground"}`}
                  >
                    {MANIFEST_STATUS_LABELS[m.status] ?? m.status}
                  </Badge>
                </button>
              ))}
              {manifests.length > shown.length && (
                <button
                  className="w-full px-3 py-2 text-center text-[11px] font-bold text-primary hover:bg-muted/30 transition-colors"
                  onClick={() => navigate(`/finance/client-account-sheet/client/${clientId}`)}
                >
                  عرض كل البيانات ({manifests.length}) ←
                </button>
              )}
            </>
          ) : (
            <div className="p-3 text-center">
              <p className="text-xs text-muted-foreground mb-2">لا يوجد بيانات لهذا العميل بعد</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1.5 w-full"
                onClick={() => navigate(`/finance/client-account-sheet/client/${clientId}`)}
              >
                <Truck className="w-3 h-3" />
                عرض حساب العميل
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClientAccountManifestsPage() {
  const { toast } = useToast();
  const { can, isAdmin } = useAuth();
  const canEdit = isAdmin || can("finance.clients.edit") || can("finance.edit");
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"recent" | "sales" | "name">("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "profile">("grid");
  // ─── فلتر حالة بيان حساب العميل (مفتوح/مغلق) — طلب المدير: تسهيل التركيز
  // على العملاء اللي لسه بياناتهم مفتوحة (بيتفعّل بوضوح في عرض "بروفايل"،
  // ومتاح أيضاً في باقي الأوضاع). "all" = بدون فلترة حسب حالة البيان.
  const [manifestStatusFilter, setManifestStatusFilter] = useState<"all" | "open" | "closed">("all");

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["finance-clients"],
    queryFn: () => apiFetch<Client[]>("/finance/clients"),
  });

  const filteredClients = (clients ?? [])
    .filter((c) => {
      const q = searchTerm.trim().toLowerCase();
      if (!q) return true;
      return (
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.phone2?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
      );
    })
    .filter((c) => {
      if (statusFilter === "active") return c.isActive;
      if (statusFilter === "inactive") return !c.isActive;
      return true;
    })
    .filter((c) => {
      if (manifestStatusFilter === "open") return !!c.hasOpenManifest;
      // "بيانات مغلقة" = عنده بيان واحد على الأقل (latestManifestId موجود)
      // ومفيش عنده بيان مفتوح دلوقتي — عميل مالوش أي بيان خالص لا يُعتبر
      // "بيانات مغلقة" ولازم ميتفلترش معاه.
      if (manifestStatusFilter === "closed") return !c.hasOpenManifest && !!c.latestManifestId;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "ar");
      if (sortBy === "sales") return parseFloat(b.totalSales ?? "0") - parseFloat(a.totalSales ?? "0");
      return b.id - a.id;
    });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) =>
      apiFetch<Client>("/finance/clients", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-clients"] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast({ title: "تمت إضافة العميل" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof emptyForm> }) =>
      apiFetch<Client>(`/finance/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-clients"] });
      setDialogOpen(false);
      setEditingClient(null);
      setForm(emptyForm);
      toast({ title: "تم التحديث" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/finance/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-clients"] });
      setDeleteClient(null);
      toast({ title: "تم الحذف" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => { setEditingClient(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (c: Client) => {
    setEditingClient(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      phone2: c.phone2 ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      region: c.region ?? "",
      paymentTerms: c.paymentTerms ?? "فوري",
      creditLimit: c.creditLimit != null ? String(c.creditLimit) : "0",
      notes: c.notes ?? "",
      isActive: c.isActive,
      avatar: c.avatar ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast({ title: "خطأ", description: "اسم العميل مطلوب.", variant: "destructive" }); return; }
    const data: any = {
      ...form,
      phone: form.phone || null,
      phone2: form.phone2 || null,
      address: form.address || null,
      city: form.city || null,
      region: form.region || null,
      paymentTerms: form.paymentTerms || null,
      creditLimit: form.creditLimit || "0",
      notes: form.notes || null,
      avatar: form.avatar || null,
    };
    if (editingClient) updateMutation.mutate({ id: editingClient.id, data });
    else createMutation.mutate(data as any);
  };

  const toggleActive = (c: Client) => updateMutation.mutate({ id: c.id, data: { isActive: !c.isActive } });

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">حسابات العملاء</h1>
          <p className="text-muted-foreground text-sm mt-0.5">إدارة العملاء التجاريين وبيانات حساباتهم</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/finance/client-account-dashboard")} className="gap-2 font-bold text-sm">
            <TrendingUp className="w-4 h-4" />الداشبورد
          </Button>
          {canEdit && (
            <Button onClick={openAdd} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm">
              <Plus className="w-4 h-4" />إضافة عميل
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative overflow-hidden rounded-2xl p-4"
          style={{
            background: "linear-gradient(135deg, rgba(96,165,250,0.18) 0%, rgba(59,130,246,0.08) 100%)",
            border: "1px solid rgba(96,165,250,0.3)",
            boxShadow: "0 0 24px rgba(96,165,250,0.15), 0 4px 12px rgba(96,165,250,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
          <span className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10" style={{ background: "radial-gradient(circle, rgba(96,165,250,1) 0%, transparent 70%)" }} />
          <p className="text-xs text-muted-foreground">إجمالي العملاء</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "rgba(96,165,250,1)" }}>{clients?.length ?? 0}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl p-4"
          style={{
            background: "linear-gradient(135deg, rgba(52,211,153,0.18) 0%, rgba(16,185,129,0.08) 100%)",
            border: "1px solid rgba(52,211,153,0.3)",
            boxShadow: "0 0 24px rgba(52,211,153,0.15), 0 4px 12px rgba(52,211,153,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
          <span className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10" style={{ background: "radial-gradient(circle, rgba(52,211,153,1) 0%, transparent 70%)" }} />
          <p className="text-xs text-muted-foreground">نشط</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "rgba(52,211,153,1)" }}>{clients?.filter(c => c.isActive).length ?? 0}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div
          className="flex items-center gap-0.5 rounded-full bg-muted/60 p-1 shrink-0 self-start"
        >
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            title="عرض شبكي"
            className={`h-8 w-10 flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            title="عرض قائمة"
            className={`h-8 flex items-center gap-1 px-3 rounded-full transition-colors ${viewMode === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="w-4 h-4" />
            {viewMode === "list" && <Check className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("profile")}
            title="عرض بروفايل"
            className={`h-8 flex items-center gap-1 px-3 rounded-full transition-colors ${viewMode === "profile" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <CircleUserRound className="w-4 h-4" />
            {viewMode === "profile" && <Check className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث بالاسم أو الهاتف أو المدينة..."
            className="w-full rounded-xl bg-white/5 border border-white/10 pr-9 pl-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <Select value={manifestStatusFilter} onValueChange={(v: any) => setManifestStatusFilter(v)}>
          <SelectTrigger className="w-full sm:w-[130px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل البيانات</SelectItem>
            <SelectItem value="open">بيانات مفتوحة</SelectItem>
            <SelectItem value="closed">بيانات مغلقة</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-full sm:w-[130px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل العملاء</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="inactive">موقف</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-full sm:w-[130px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">الأحدث</SelectItem>
            <SelectItem value="sales">الأكثر مبيعات</SelectItem>
            <SelectItem value="name">الاسم</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
      ) : filteredClients.length ? viewMode === "profile" ? (
        // ─── عرض بروفايل — دايرة بصورة/لوجو العميل + الاسم + مؤشر حالة البيان
        // (مفتوح/مغلق). الضغط على البروفايل يودّي مباشرة لصفحة حساب العميل،
        // وفيها زرار الإغلاق نفسه (بطلب المدير: ما يحتاجش يتنقل لأكتر من صفحة).
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {filteredClients
            // عرض "بروفايل" خاص بالعملاء اللي عندهم بيان حساب فعلاً (مفتوح أو
            // مغلق) — العميل اللي مالوش أي بيان خالص (latestManifestId=null)
            // لا يظهر هنا حتى مع فلتر "كل البيانات"، لأن مفيش بيان يوديه له.
            .filter((client) => !!client.latestManifestId)
            .map((client, idx) => {
            const isOpen = !!client.hasOpenManifest;
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => navigate(
                  client.latestManifestId
                    // from=client-account-sheet: عشان زرار الرجوع جوه صفحة
                    // تفاصيل البيان يرجّع هنا بالظبط (صفحة حسابات العملاء)
                    // مش لصفحة حساب العميل العامة — طلب المدير.
                    ? `/finance/client-account-sheet/manifest/${client.latestManifestId}?from=client-account-sheet`
                    : `/finance/clients/${client.id}`
                )}
                className="profile-card-enter profile-card-hover flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-white/5 transition-colors text-center"
                style={{ animationDelay: `${Math.min(idx, 24) * 30}ms` }}
              >
                <div className="relative">
                  <span
                    className={`profile-avatar-glow absolute inset-0 rounded-full blur-md pointer-events-none ${
                      isOpen ? "bg-emerald-500/40" : "bg-muted-foreground/30"
                    }`}
                  />
                  <div className="profile-avatar-wrap relative">
                    <ClientAvatar avatar={client.avatar} name={client.name} size="lg" />
                  </div>
                  <span
                    title={isOpen ? "بيان مفتوح" : "بيان مغلق"}
                    className={`status-dot-pulse absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-background transition-transform duration-300 group-hover:scale-110 ${
                      isOpen ? "bg-emerald-500 text-emerald-500" : "bg-muted-foreground/60 text-muted-foreground/60"
                    }`}
                  >
                    {isOpen ? <FolderOpen className="w-3 h-3 text-white" /> : <FolderLock className="w-3 h-3 text-white" />}
                  </span>
                </div>
                <p className="text-xs font-bold truncate max-w-full">{client.name}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "flex flex-col gap-2.5"}>
          {filteredClients.map((client, idx) => {
            const palettes = [
              { rgb: "251,146,60",  rgb2: "251,191,36"  },
              { rgb: "56,189,248",  rgb2: "96,165,250"  },
              { rgb: "167,139,250", rgb2: "192,132,252" },
              { rgb: "52,211,153",  rgb2: "45,212,191"  },
              { rgb: "244,114,182", rgb2: "232,121,249" },
              { rgb: "251,191,36",  rgb2: "250,204,21"  },
            ];
            const p = palettes[idx % palettes.length];
            const isActive = client.isActive;
            return (
              <div key={client.id} className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300"
                style={{
                  background: isActive
                    ? `linear-gradient(145deg, rgba(${p.rgb},0.13) 0%, rgba(${p.rgb2},0.06) 50%, rgba(0,0,0,0.15) 100%)`
                    : "rgba(255,255,255,0.02)",
                  border: isActive
                    ? `1px solid rgba(${p.rgb},0.35)`
                    : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: isActive
                    ? `0 0 32px rgba(${p.rgb},0.12), 0 8px 24px rgba(${p.rgb},0.08), inset 0 1px 0 rgba(255,255,255,0.06)`
                    : "0 2px 8px rgba(0,0,0,0.15)",
                }}>
                {isActive && (
                  <span className="absolute -top-8 -left-8 w-32 h-32 rounded-full pointer-events-none"
                    style={{ background: `radial-gradient(circle, rgba(${p.rgb},0.12) 0%, transparent 70%)` }} />
                )}
                <div className="flex items-start justify-between relative">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0" style={isActive ? { filter: `drop-shadow(0 0 8px rgba(${p.rgb},0.5))` } : {}}>
                      <ClientAvatar avatar={client.avatar} name={client.name} size="md" />
                    </div>
                    <div>
                      <button
                        className="font-bold text-sm hover:underline cursor-pointer transition-colors text-right"
                        style={isActive ? { color: `rgba(${p.rgb},1)` } : {}}
                        onClick={() => navigate(`/finance/clients/${client.id}`)}
                      >
                        {client.name}
                      </button>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[9px] font-bold border" style={isActive ? {
                          borderColor: `rgba(${p.rgb},0.5)`,
                          background: `rgba(${p.rgb},0.1)`,
                          color: `rgba(${p.rgb},1)`,
                        } : { borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.3)" }}>
                          {client.isActive ? "نشط" : "موقف"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-primary" onClick={() => toggleActive(client)}>
                          {client.isActive ? <ToggleRight className="w-4 h-4" style={{ color: `rgba(${p.rgb},1)` }} /> : <ToggleLeft className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-primary" onClick={() => openEdit(client)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => setDeleteClient(client)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 relative">
                  {client.phone && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Phone className="w-3 h-3" />{client.phone}
                      </p>
                      <a
                        href={`https://wa.me/${client.phone.replace(/[^0-9]/g, "").replace(/^0/, "20")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`تواصل مع ${client.name} على واتساب`}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-[#25D366]/15 hover:bg-[#25D366] border-2 border-[#25D366]/50 hover:border-[#25D366] transition-all hover:scale-110 shrink-0 group"
                      >
                        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#25D366] group-hover:fill-white transition-colors" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.83L.057 23.215a.75.75 0 0 0 .921.921l5.455-1.43A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.706 9.706 0 0 1-4.951-1.355l-.355-.211-3.676.964.982-3.589-.232-.371A9.706 9.706 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                        </svg>
                      </a>
                    </div>
                  )}
                  {client.city && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <MapPin className="w-3 h-3" />{client.city}{client.region ? ` — ${client.region}` : ""}
                    </p>
                  )}
                  {client.notes && <p className="text-xs text-muted-foreground pt-1 border-t" style={{ borderColor: `rgba(${p.rgb},0.15)` }}>{client.notes}</p>}
                </div>

                {/* إحصائيات مالية */}
                <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: `rgba(${p.rgb},0.15)` }}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" />إجمالي المبيعات</span>
                    <span className="font-bold" style={isActive ? { color: `rgba(${p.rgb},1)` } : {}}>{formatCurrency(parseFloat(client.totalSales ?? "0"))}</span>
                  </div>

                  {/* إجمالي صافي الإيراد وهامش صافي الإيراد — كارت مطوي، بيبان بس لما تدوس عليه */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between text-xs group/nr"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Wallet className="w-3 h-3" />إجمالي صافي الإيراد
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${parseFloat(client.netRevenueDue ?? "0") >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {formatCurrency(parseFloat(client.netRevenueDue ?? "0"))}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform group-data-[state=open]/nr:rotate-180" />
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground pr-4">إجمالي صافي الإيراد</span>
                        <span className={`font-bold ${parseFloat(client.netRevenue ?? "0") >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatCurrency(parseFloat(client.netRevenue ?? "0"))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground pr-4">هامش صافي الإيراد</span>
                        <span className={`font-bold ${
                          (client.profitMargin ?? 0) >= 20 ? "text-emerald-400"
                          : (client.profitMargin ?? 0) >= 10 ? "text-amber-400"
                          : "text-red-400"
                        }`}>
                          {client.profitMargin ?? 0}%
                        </span>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">عدد الطلبات</span>
                    <span className="font-bold">{client.totalOrders ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">رصيد العميل</span>
                    <span className="font-bold text-emerald-400">{formatCurrency(client.accountBalance ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">المتبقي</span>
                    <span className={`font-bold ${(client.accountRemaining ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {formatCurrency(client.accountRemaining ?? 0)}
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  className="w-full h-8 mt-3 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                  onClick={() => navigate(`/finance/clients/${client.id}`)}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />عرض حساب العميل
                </Button>

                <ClientManifestsDropdown clientId={client.id} />
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="border-border p-12 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
          {searchTerm || statusFilter !== "all" ? (
            <>
              <p className="font-bold">لا توجد نتائج مطابقة</p>
              <p className="text-sm text-muted-foreground mt-1">جرّب تعديل كلمة البحث أو الفلتر.</p>
            </>
          ) : (
            <>
              <p className="font-bold">لا يوجد عملاء</p>
              <p className="text-sm text-muted-foreground mt-1">أضف العملاء التجاريين الذين تتعامل معهم.</p>
              {canEdit && <Button onClick={openAdd} className="mt-4 gap-2 text-sm"><Plus className="w-4 h-4" />إضافة عميل</Button>}
            </>
          )}
        </Card>
      )}

      {/* Add/Edit Client Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{editingClient ? "تعديل بيانات العميل" : "إضافة عميل"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <AvatarUploader value={form.avatar} onChange={v => setForm(f => ({ ...f, avatar: v }))} />
            <div>
              <Label className="text-xs mb-1.5 block">الاسم / الشركة *</Label>
              <Input placeholder="شركة النور للتجارة" className="h-9 text-sm bg-background" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><Phone className="w-3 h-3" />الهاتف</Label>
                <Input placeholder="01xxxxxxxxx" className="h-9 text-sm bg-background" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">هاتف إضافي</Label>
                <Input placeholder="01xxxxxxxxx" className="h-9 text-sm bg-background" value={form.phone2} onChange={e => setForm(f => ({ ...f, phone2: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">العنوان</Label>
              <Input placeholder="الشارع والحي" className="h-9 text-sm bg-background" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><MapPin className="w-3 h-3" />المدينة</Label>
                <Input placeholder="القاهرة" className="h-9 text-sm bg-background" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">المحافظة</Label>
                <Input placeholder="الجيزة" className="h-9 text-sm bg-background" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">شروط الدفع</Label>
                <Select value={form.paymentTerms} onValueChange={v => setForm(f => ({ ...f, paymentTerms: v }))}>
                  <SelectTrigger className="h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["فوري", "آجل 15 يوم", "آجل 30 يوم", "آجل 60 يوم", "آجل 90 يوم"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><Target className="w-3 h-3" />الهدف</Label>
                <Input type="number" min={0} placeholder="1000000" className="h-9 text-sm bg-background" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">ملاحظات</Label>
              <Textarea placeholder="معلومات إضافية..." className="min-h-[70px] text-sm resize-none bg-background" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-md">
              <span className="text-xs font-medium">حالة العميل</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 mr-auto" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}>
                {form.isActive ? <><ToggleRight className="w-4 h-4 text-emerald-400" />نشط</> : <><ToggleLeft className="w-4 h-4" />موقف</>}
              </Button>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 h-9 text-sm font-bold bg-primary text-primary-foreground" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : editingClient ? "حفظ" : "إضافة"}
              </Button>
              <Button variant="outline" className="h-9 text-sm border-border" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteClient} onOpenChange={() => setDeleteClient(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف العميل "{deleteClient?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteClient && deleteMutation.mutate(deleteClient.id)} className="bg-red-600 hover:bg-red-700 text-white">
              نعم، احذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
