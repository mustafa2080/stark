import { useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  ArrowRight, User, Phone, Mail, MapPin, Edit2, X, Check, Loader2,
  Camera, Package, CheckCircle2, Clock, Truck, ShieldCheck, AlertTriangle,
  Trash2, Building2, ChevronLeft, Ban, PackageCheck, PackageX, Wallet, Search, MessageCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

const AVATAR_COLORS = [
  ["#f59e0b","#78350f"],["#10b981","#064e3b"],["#3b82f6","#1e3a8a"],
  ["#8b5cf6","#4c1d95"],["#ef4444","#7f1d1d"],["#ec4899","#831843"],
  ["#06b6d4","#164e63"],["#f97316","#7c2d12"],
];
function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) {
  const p = (name || "؟").trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function ClientAvatar({ avatar, name, size = 88 }: { avatar?: string | null; name: string; size?: number }) {
  if (avatar?.startsWith("data:"))
    return <img src={avatar} className="rounded-full object-cover border-4 border-primary/30" style={{ width: size, height: size }} />;
  const [bg, fg] = avatarColor(name || "؟");
  return (
    <div className="rounded-full flex items-center justify-center font-black border-4 border-primary/30"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.32 }}>
      {name ? initials(name) : "؟"}
    </div>
  );
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  waiting:          { label: "انتظار",       color: "#94a3b8" },
  confirmed:        { label: "مؤكدة",         color: "#3b82f6" },
  picked_up:        { label: "تم الاستلام",   color: "#3b82f6" },
  in_transit:       { label: "قيد التوصيل",  color: "#f59e0b" },
  out_for_delivery: { label: "خرجت للتسليم", color: "#f59e0b" },
  delivered:        { label: "تم التسليم",   color: "#22c55e" },
  partial_received: { label: "استلام جزئي",  color: "#a855f7" },
  delayed:          { label: "متأخرة",        color: "#f97316" },
  returned:         { label: "مرتجع",         color: "#ec4899" },
  cancelled:        { label: "ملغية",         color: "#ef4444" },
};
function ShipmentsDonutChart({ breakdown, days, onDaysChange }: {
  breakdown: Record<string, number>; days: number | "all"; onDaysChange: (d: number | "all") => void;
}) {
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  const DAYS_OPTIONS: { value: number | "all"; label: string }[] = [
    { value: 7, label: "7 أيام" }, { value: 30, label: "30 يوم" }, { value: 90, label: "90 يوم" }, { value: "all", label: "الكل" },
  ];

  if (total === 0) {
    return (
      <div className="rounded-2xl p-5 bg-card border border-border">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted-foreground font-bold">إحصائيات الشحنات</p>
          <select value={String(days)} onChange={(e) => onDaysChange(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="px-2 py-1 rounded-lg text-[11px] font-bold bg-muted/40 border border-border outline-none">
            {DAYS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 text-center min-h-[160px]">
          <Package className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">لا توجد شحنات في هذه المدة</p>
        </div>
      </div>
    );
  }

  const R = 70, CX = 90, CY = 90, STROKE = 26;
  const circumference = 2 * Math.PI * R;
  let cumulative = 0;
  const segments = entries.map(([status, count]) => {
    const meta = STATUS_META[status] ?? { label: status, color: "#94a3b8" };
    const fraction = count / total;
    const dash = fraction * circumference;
    const gap = circumference - dash;
    const offset = -cumulative * circumference;
    cumulative += fraction;
    return { status, count, meta, dash, gap, offset, pct: Math.round(fraction * 100) };
  });

  return (
    <div className="rounded-2xl p-5 bg-card border border-border">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground font-bold">إحصائيات الشحنات</p>
        <select value={String(days)} onChange={(e) => onDaysChange(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="px-2 py-1 rounded-lg text-[11px] font-bold bg-muted/40 border border-border outline-none">
          {DAYS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="relative flex-shrink-0" style={{ width: CX * 2, height: CY * 2 }}>
          <svg viewBox={`0 0 ${CX * 2} ${CY * 2}`} width={CX * 2} height={CY * 2} style={{ transform: "rotate(-90deg)" }}>
            {segments.map((seg) => (
              <circle
                key={seg.status}
                cx={CX} cy={CY} r={R}
                fill="none"
                stroke={seg.meta.color}
                strokeWidth={STROKE}
                strokeDasharray={`${seg.dash} ${seg.gap}`}
                strokeDashoffset={seg.offset}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-black text-foreground">{fn(total)}</p>
            <p className="text-[10px] text-muted-foreground">الإجمالي</p>
          </div>
        </div>
        <div className="flex-1 w-full grid grid-cols-2 gap-x-3 gap-y-2">
          {segments.map((seg) => (
            <div key={seg.status} className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.meta.color }} />
              <span className="text-[11px] text-muted-foreground truncate flex-1">{seg.meta.label}</span>
              <span className="text-[11px] font-bold text-foreground flex-shrink-0">{fn(seg.count)} ({seg.pct}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: "#94a3b8" };
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ background: `${meta.color}1a`, color: meta.color, border: `1px solid ${meta.color}40` }}>
      {meta.label}
    </span>
  );
}

function EditableField({ icon: Icon, label, value, editing, onChange, type = "text", placeholder }: {
  icon: any; label: string; value: string; editing: boolean; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted/50 mt-0.5">
        <Icon size={14} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
        {editing ? (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-muted/40 border border-border outline-none focus:border-primary/50 transition-colors"
          />
        ) : (
          <p className="text-sm font-bold text-foreground truncate">{value || "—"}</p>
        )}
      </div>
    </div>
  );
}

function ShipmentRow({ s, onClick }: { s: any; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-muted/25 border border-border hover:bg-muted/40 transition-colors text-right md:hidden">
      <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
        <Package size={15} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">{s.shipmentNumber || `#${s.id}`}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {s.createdAt ? format(new Date(s.createdAt), "dd MMM yyyy", { locale: ar }) : "—"}
          {s.trackingNumber ? ` • ${s.trackingNumber}` : ""}
        </p>
      </div>
      <StatusBadge status={s.status} />
      <ChevronLeft size={16} className="text-muted-foreground/50 flex-shrink-0" />
    </button>
  );
}

function ShipmentsTable({ shipments, onRowClick }: { shipments: any[]; onRowClick: (s: any) => void }) {
  if (shipments.length === 0) {
    return <div className="hidden md:block py-10 text-center text-sm text-muted-foreground">لا توجد شحنات هنا</div>;
  }
  return (
    <div className="hidden md:block overflow-auto max-h-[520px]">
      <table className="w-full text-right">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground whitespace-nowrap">الكود</th>
            <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground whitespace-nowrap">التاريخ</th>
            <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground whitespace-nowrap">المستلم</th>
            <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground whitespace-nowrap">الوجهة</th>
            <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground whitespace-nowrap">قيمة الطرد</th>
            <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground whitespace-nowrap">حالة الطلب</th>
            <th className="px-3 py-2.5 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s: any) => (
            <tr key={s.id} onClick={() => onRowClick(s)}
              className="border-b border-border/60 last:border-0 hover:bg-muted/25 cursor-pointer transition-colors">
              <td className="px-3 py-3 text-sm font-bold text-primary whitespace-nowrap">{s.shipmentNumber || `#${s.id}`}</td>
              <td className="px-3 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                {s.createdAt ? format(new Date(s.createdAt), "dd MMM yyyy", { locale: ar }) : "—"}
              </td>
              <td className="px-3 py-3 text-sm font-bold truncate max-w-[160px]">{s.receiverName || "—"}</td>
              <td className="px-3 py-3 text-[12px] text-muted-foreground truncate max-w-[160px]">
                {[s.receiverCity, s.receiverAddress].filter(Boolean).join(" - ") || "—"}
              </td>
              <td className="px-3 py-3 text-sm font-bold whitespace-nowrap">{fn(Number(s.totalAmount || s.codAmount || 0))}</td>
              <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={s.status} /></td>
              <td className="px-3 py-3"><ChevronLeft size={15} className="text-muted-foreground/50" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function ClientAccountPage() {
  const { user, refreshUser, logout } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"received" | "pending">("pending");
  const [chartDays, setChartDays] = useState<number | "all">(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", city: "", address: "" });
  const [avatarDraft, setAvatarDraft] = useState<string | null | undefined>(undefined);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["client-portal-profile-full"],
    queryFn: () => apiFetch("/client-portal/profile-full"),
    enabled: !!user,
    staleTime: 15_000,
  });

  const { data: chartData } = useQuery<any>({
    queryKey: ["client-portal-profile-full-chart", chartDays],
    queryFn: () => apiFetch(`/client-portal/profile-full${chartDays !== "all" ? `?days=${chartDays}` : ""}`),
    enabled: !!user,
    staleTime: 15_000,
  });

  const client = data?.client;
  const representative = data?.representative;
  const summary = data?.shipmentsSummary ?? { total: 0, received: 0, notReceived: 0 };
  const statusBreakdown = chartData?.statusBreakdown ?? {};
  const pendingApprovals = data?.pendingApprovals ?? { pickupRequests: 0 };
  const outstandingBalance = data?.outstandingBalance ?? 0;
  const receivedShipments = data?.receivedShipments ?? [];
  const pendingShipments = data?.pendingShipments ?? [];

  function startEdit() {
    setForm({
      name: client?.name || "",
      email: client?.email || "",
      city: client?.city || "",
      address: client?.address || "",
    });
    setAvatarDraft(client?.avatar ?? null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setAvatarDraft(undefined);
  }

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "الصورة كبيرة جداً", description: "الحد الأقصى 2 ميجابايت", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarDraft(reader.result as string);
    reader.readAsDataURL(file);
  }

  const saveMutation = useMutation({
    mutationFn: (payload: any) => apiFetch("/client-portal/profile", { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast({ title: "✅ تم حفظ بياناتك بنجاح" });
      qc.invalidateQueries({ queryKey: ["client-portal-profile-full"] });
      qc.invalidateQueries({ queryKey: ["client-portal-profile"] });
      refreshUser();
      setIsEditing(false);
      setAvatarDraft(undefined);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function saveProfile() {
    const payload: Record<string, any> = {};
    if (form.name.trim() && form.name.trim() !== client?.name) payload.name = form.name.trim();
    if (form.email !== (client?.email || "")) payload.email = form.email.trim();
    if (form.city !== (client?.city || "")) payload.city = form.city.trim();
    if (form.address !== (client?.address || "")) payload.address = form.address.trim();
    if (avatarDraft !== undefined && avatarDraft !== client?.avatar) payload.avatar = avatarDraft;

    if (Object.keys(payload).length === 0) { setIsEditing(false); return; }
    saveMutation.mutate(payload);
  }

  const deleteMutation = useMutation({
    mutationFn: (password: string) => apiFetch("/client-portal/account", { method: "DELETE", body: JSON.stringify({ password }) }),
    onSuccess: () => {
      toast({ title: "تم حذف حسابك", description: "نتمنى لك التوفيق" });
      logout();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const cancelShipmentMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/client-portal/shipments/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      toast({ title: "تم إلغاء الشحنة" });
      qc.invalidateQueries({ queryKey: ["client-portal-profile-full"] });
      setCancelTarget(null);
    },
    onError: (e: any) => toast({ title: "لا يمكن الإلغاء", description: e.message, variant: "destructive" }),
  });

  const shownShipments = useMemo(() => {
    const base = tab === "received" ? receivedShipments : pendingShipments;
    const q = searchQuery.trim().toLowerCase();
    return base.filter((s: any) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [s.shipmentNumber, s.trackingNumber, s.receiverName, s.receiverCity, s.receiverAddress]
        .filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [tab, receivedShipments, pendingShipments, searchQuery, statusFilter]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center" dir="rtl">
        <User className="w-12 h-12 text-muted-foreground/30" />
        <p className="font-black text-lg">لا يوجد حساب عميل مرتبط</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[1000px] mx-auto space-y-5 pb-10">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/client-dashboard")}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-foreground/70 bg-muted/40 border border-border flex-shrink-0">
            <ArrowRight size={16} />
          </button>
          <div>
            <h1 className="text-xl font-black text-foreground">بروفايلي</h1>
            <p className="text-xs text-muted-foreground">بياناتك الشخصية وسجل شحناتك</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Left column: profile card ── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Top summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate("/client-pickup-requests")}
                className="rounded-2xl p-4 bg-card border border-border text-center hover:bg-muted/20 transition-colors">
                <Clock className="w-5 h-5 mx-auto mb-1.5 text-amber-500" />
                <p className="text-xl font-black text-amber-500">{fn(pendingApprovals.pickupRequests)}</p>
                <p className="text-[11px] text-muted-foreground">بانتظار الموافقة</p>
              </button>
              <div className="rounded-2xl p-4 bg-card border border-border text-center">
                <Wallet className="w-5 h-5 mx-auto mb-1.5 text-primary" />
                <p className="text-xl font-black text-primary">{fn(outstandingBalance)} ج.م</p>
                <p className="text-[11px] text-muted-foreground">المستحق للسداد</p>
              </div>
            </div>

            {/* Profile Card */}
            <div className="rounded-2xl p-5 bg-card border border-border">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-muted-foreground font-bold">البيانات الشخصية</p>
                {!isEditing ? (
                  <button onClick={startEdit}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors">
                    <Edit2 size={12} /> تعديل
                  </button>
                ) : (
                  <button onClick={cancelEdit} disabled={saveMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-muted-foreground hover:bg-muted/40 transition-colors">
                    <X size={12} /> إلغاء
                  </button>
                )}
              </div>

              {/* Avatar */}
              <div className="flex flex-col items-center gap-2 mb-4">
                <div className="relative">
                  <ClientAvatar avatar={isEditing ? avatarDraft : client.avatar} name={isEditing ? form.name : client.name} />
                  {isEditing && (
                    <button onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-0 left-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-card shadow-md">
                      <Camera size={12} />
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
                </div>
                {isEditing && avatarDraft && (
                  <button onClick={() => setAvatarDraft(null)} className="flex items-center gap-1 text-[11px] text-red-500 font-bold">
                    <X size={11} /> إزالة الصورة
                  </button>
                )}
                {!isEditing && (
                  <div className="text-center">
                    <p className="font-black text-lg">{client.name}</p>
                    <span className={cn("inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
                      client.accountStatus === "active"
                        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                        : "bg-red-500/15 text-red-500 border border-red-500/30")}>
                      <ShieldCheck size={10} /> {client.accountStatus === "active" ? "حساب نشط" : "حساب موقوف"}
                    </span>
                  </div>
                )}
              </div>

              {/* Fields */}
              <div>
                <EditableField icon={User} label="الاسم" value={isEditing ? form.name : client.name}
                  editing={isEditing} onChange={(v) => setForm(f => ({ ...f, name: v }))} />
                <EditableField icon={Phone} label="رقم الهاتف" value={client.phone || ""} editing={false} onChange={() => {}} />
                <EditableField icon={Mail} label="البريد الإلكتروني" value={isEditing ? form.email : (client.email || "")}
                  editing={isEditing} onChange={(v) => setForm(f => ({ ...f, email: v }))} type="email" placeholder="example@mail.com" />
                <EditableField icon={MapPin} label="المدينة" value={isEditing ? form.city : (client.city || "")}
                  editing={isEditing} onChange={(v) => setForm(f => ({ ...f, city: v }))} />
                <EditableField icon={Building2} label="العنوان" value={isEditing ? form.address : (client.address || "")}
                  editing={isEditing} onChange={(v) => setForm(f => ({ ...f, address: v }))} />
              </div>

              {isEditing && (
                <button onClick={saveProfile} disabled={saveMutation.isPending || !form.name.trim()}
                  className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground disabled:opacity-50">
                  {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  حفظ التعديلات
                </button>
              )}
            </div>

            {/* Representative Card */}
            <div className="rounded-2xl p-5 bg-card border border-border">
              <p className="text-xs text-muted-foreground font-bold mb-4 flex items-center gap-1.5">
                <Truck size={13} /> المندوب المتابع
              </p>
              {representative ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <ClientAvatar avatar={representative.avatar} name={representative.name || "?"} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black truncate">{representative.name || "—"}</p>
                      {representative.companyName && (
                        <p className="text-[11px] text-muted-foreground truncate">{representative.companyName}</p>
                      )}
                    </div>
                  </div>
                  {(representative.phone || representative.companyPhone) && (
                    <div className="grid grid-cols-2 gap-2">
                      <a href={`tel:${representative.phone || representative.companyPhone}`}
                        className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-muted/40 border border-border text-sm font-bold hover:bg-muted/60 transition-colors">
                        <Phone size={13} /> اتصال
                      </a>
                      <a
                        href={`https://wa.me/2${(representative.phone || representative.companyPhone || "").replace(/\D/g, "").replace(/^0+/, "")}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm font-bold hover:bg-emerald-500/20 transition-colors">
                        <MessageCircle size={13} /> واتساب
                      </a>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="rounded-lg p-2.5 bg-muted/25 text-center">
                      <p className="text-lg font-black text-primary">{fn(representative.shipmentsCount || 0)}</p>
                      <p className="text-[10px] text-muted-foreground">إجمالي الشحنات معاه</p>
                    </div>
                    <div className="rounded-lg p-2.5 bg-muted/25 text-center">
                      <p className="text-lg font-black text-emerald-500">{fn(representative.deliveredCount || 0)}</p>
                      <p className="text-[10px] text-muted-foreground">تم التسليم</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">لا يوجد مندوب مرتبط بعد</p>
              )}
            </div>

            {/* Danger zone */}
            <div className="rounded-2xl p-5 bg-red-500/5 border border-red-500/20">
              <p className="text-xs text-red-500 font-bold mb-3 flex items-center gap-1.5">
                <AlertTriangle size={13} /> منطقة الخطر
              </p>
              <button onClick={() => setIsDeleteOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors">
                <Trash2 size={14} /> حذف حسابي نهائياً
              </button>
            </div>
          </div>

          {/* ── Right column: shipments ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Shipments donut chart */}
            <ShipmentsDonutChart breakdown={statusBreakdown} days={chartDays} onDaysChange={setChartDays} />

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl p-4 bg-card border border-border text-center">
                <Package className="w-5 h-5 mx-auto mb-1.5 text-primary" />
                <p className="text-xl font-black">{fn(summary.total)}</p>
                <p className="text-[11px] text-muted-foreground">إجمالي الشحنات</p>
              </div>
              <div className="rounded-2xl p-4 bg-card border border-border text-center">
                <PackageCheck className="w-5 h-5 mx-auto mb-1.5 text-emerald-500" />
                <p className="text-xl font-black text-emerald-500">{fn(summary.received)}</p>
                <p className="text-[11px] text-muted-foreground">تم استلامها</p>
              </div>
              <div className="rounded-2xl p-4 bg-card border border-border text-center">
                <PackageX className="w-5 h-5 mx-auto mb-1.5 text-amber-500" />
                <p className="text-xl font-black text-amber-500">{fn(summary.notReceived)}</p>
                <p className="text-[11px] text-muted-foreground">لسه ما استلمهاش</p>
              </div>
            </div>

            {/* Shipments list */}
            <div className="rounded-2xl bg-card border border-border overflow-hidden">
              <div className="flex gap-1 p-3 border-b border-border bg-muted/20">
                <button onClick={() => setTab("pending")}
                  className={cn("flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors",
                    tab === "pending" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  لسه مستلمهاش ({fn(summary.notReceived)})
                </button>
                <button onClick={() => setTab("received")}
                  className={cn("flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors",
                    tab === "received" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  تم استلامها ({fn(summary.received)})
                </button>
              </div>

              {/* Search + status filter */}
              <div className="flex flex-col sm:flex-row gap-2 p-3 border-b border-border">
                <div className="relative flex-1">
                  <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث بالكود، اسم المستلم، أو المدينة..."
                    className="w-full pr-9 pl-3 py-2 rounded-lg text-sm bg-muted/40 border border-border outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm bg-muted/40 border border-border outline-none focus:border-primary/50 transition-colors sm:w-44">
                  <option value="all">كل الحالات</option>
                  {Object.entries(STATUS_META).map(([status, meta]) => (
                    <option key={status} value={status}>{meta.label}</option>
                  ))}
                </select>
              </div>

              <ShipmentsTable shipments={shownShipments} onRowClick={(s) => navigate(`/client-shipment/${s.id}`)} />

              <div className="p-3 space-y-2 max-h-[520px] overflow-y-auto md:hidden">
                {shownShipments.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">لا توجد شحنات هنا</div>
                ) : (
                  shownShipments.map((s: any) => (
                    <div key={s.id} className="relative">
                      <ShipmentRow s={s} onClick={() => navigate(`/client-shipment/${s.id}`)} />
                      {["waiting", "confirmed"].includes(s.status) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCancelTarget(s); }}
                          className="absolute left-9 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                          title="إلغاء الشحنة">
                          <Ban size={13} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete Account Dialog ── */}
      <Dialog open={isDeleteOpen} onOpenChange={(o) => { setIsDeleteOpen(o); if (!o) setDeletePassword(""); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right text-red-500 flex items-center gap-2">
              <AlertTriangle size={18} /> حذف الحساب نهائياً
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هذا الإجراء سيقوم بتعطيل حسابك بالكامل ولن تتمكن من الدخول مرة أخرى. أدخل كلمة المرور للتأكيد.
          </p>
          <input
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="كلمة المرور"
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/40 border border-border outline-none focus:border-red-500/50 transition-colors"
          />
          <div className="flex items-center gap-2 pt-2">
            <button onClick={() => setIsDeleteOpen(false)} disabled={deleteMutation.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-foreground/70 bg-muted/50 disabled:opacity-50">
              إلغاء
            </button>
            <button onClick={() => deleteMutation.mutate(deletePassword)} disabled={deleteMutation.isPending || !deletePassword}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-600 text-white disabled:opacity-50">
              {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              حذف نهائي
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Shipment Dialog ── */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إلغاء الشحنة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من إلغاء الشحنة <span className="font-bold text-foreground">{cancelTarget?.shipmentNumber || `#${cancelTarget?.id}`}</span>؟
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={() => setCancelTarget(null)} disabled={cancelShipmentMutation.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-foreground/70 bg-muted/50 disabled:opacity-50">
              تراجع
            </button>
            <button onClick={() => cancelShipmentMutation.mutate(cancelTarget.id)} disabled={cancelShipmentMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-600 text-white disabled:opacity-50">
              {cancelShipmentMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              نعم، ألغِ الشحنة
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
