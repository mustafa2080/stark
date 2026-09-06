import { useState, useMemo, useRef, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight, Users, ShoppingBag, TrendingUp, TrendingDown,
  ChevronRight, ChevronLeft, Calendar, Package, Phone, MapPin,
  Clock, CheckCircle2, Target, Edit2, Check, X,
  Download, FileSpreadsheet, FileText, Loader2, Bell, RefreshCw, Truck,
  Send, User, PackagePlus, Lock, LockOpen, Search, LayoutDashboard, Eye,
  Hourglass, RotateCcw, PackageX, PackageCheck, AlertCircle, ChevronDown,
  Printer, ClipboardList,
} from "lucide-react";
import { format, formatDistanceToNow, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";
import { apiFetch, clientAccountManifestsApi, clientReturnManifestsApi, shipmentsApi, type ClientAccountManifestListItem, type ClientReturnManifestListItem, type ClientReturnManifestItem } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { returnReasonLabel } from "@/lib/order-constants";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

// ── Glow style helpers ──────────────────────────────────────────────────────
const GLOW = {
  neutral: {
    style: {
      background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--card)/.80) 100%)",
      boxShadow: "0 0 0 1px hsl(var(--border)/.7), 0 4px 20px -6px rgba(99,102,241,.12), 0 1px 4px rgba(0,0,0,.18)",
      transition: "box-shadow .25s, transform .2s",
    },
  },
  teal: {
    style: {
      background: "linear-gradient(145deg, rgba(13,148,136,.12) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(13,148,136,.30), 0 4px 22px -6px rgba(13,148,136,.28), 0 0 40px -14px rgba(13,148,136,.20)",
    },
  },
  red: {
    style: {
      background: "linear-gradient(145deg, rgba(220,38,38,.10) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(220,38,38,.28), 0 4px 22px -6px rgba(220,38,38,.25), 0 0 40px -14px rgba(220,38,38,.18)",
    },
  },
  emerald: {
    style: {
      background: "linear-gradient(145deg, rgba(16,185,129,.10) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(16,185,129,.32), 0 4px 24px -6px rgba(16,185,129,.28), 0 0 44px -12px rgba(16,185,129,.22)",
    },
  },
  amber: {
    style: {
      background: "linear-gradient(145deg, rgba(245,158,11,.09) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(245,158,11,.28), 0 4px 22px -6px rgba(245,158,11,.22), 0 0 40px -14px rgba(245,158,11,.16)",
    },
  },
  blue: {
    style: {
      background: "linear-gradient(145deg, rgba(59,130,246,.10) 0%, hsl(var(--card)/.85) 100%)",
      boxShadow: "0 0 0 1px rgba(59,130,246,.28), 0 4px 22px -6px rgba(59,130,246,.22), 0 0 40px -14px rgba(59,130,246,.16)",
    },
  },
  danger: {
    style: {
      background: "linear-gradient(145deg, rgba(226,75,74,.14) 0%, hsl(var(--card)/.90) 100%)",
      boxShadow: "0 0 0 1px rgba(226,75,74,.42), 0 4px 26px -4px rgba(226,75,74,.30), 0 0 48px -10px rgba(226,75,74,.24)",
    },
  },
} as const;


const fmt = (n: string | number) =>
  new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 0,
  }).format(Number(n));

// ── Avatar helpers — نفس اللي في finance-clients.tsx ──────────────────────
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
function ClientAvatar({ avatar, name, size = "md" }: { avatar?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : size === "lg" ? "w-14 h-14 text-2xl" : "w-10 h-10 text-sm";
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

// ── شريط التقدم للفاتورة — زي DeliveryBar ──────────────────────────────────
function InvoiceProgressBar({
  paid, total,
}: { paid: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.min((paid / total) * 100, 100);
  const unpaidPct = 100 - pct;
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden flex mt-2">
      <div className="h-1.5 bg-emerald-500" style={{ width: `${pct}%` }} />
      <div className="h-1.5 bg-red-500/40" style={{ width: `${unpaidPct}%` }} />
    </div>
  );
}

// ── أنواع البيانات ──────────────────────────────────────────────────────────
type SaleOrder = {
  id: number; soNumber: string; status: string; paymentStatus: string;
  totalAmount: string; paidAmount: string;
  createdAt: string; closedAt?: string | null;
  itemCount?: number;
};

type Client = {
  id: number; name: string; phone: string | null; phone2: string | null;
  email: string | null; address: string | null; city: string | null; region: string | null;
  creditLimit: string; totalOrders: number; totalSales: string; totalPaid: string;
  notes: string | null; isActive: boolean; createdAt: string; avatar: string | null;
};

type ClientDetail = Client & { orders: SaleOrder[]; deliveryRate?: number };

type ClientShipment = {
  id: number; shipmentNumber: string; status: string;
  receiverName: string; receiverCity: string | null;
  receiverPhone?: string | null; receiverAddress?: string | null;
  codAmount: string | null; shippingFee: string | null;
  createdAt: string; pieces: number | null;
  returnReason?: string | null; returnReceived?: number | null;
  manifestId?: number | null;
  manifestNumber?: string | null;
  manifestDeliveryStatus?: string | null;
  manifestPartialQty?: number | null;
  manifestReturnReceived?: number | null;
  isDelayed?: boolean;
};

// ── بطاقة الفاتورة — زي ManifestCard بالظبط ────────────────────────────────
function InvoiceCard({ order, isLatest }: { order: SaleOrder; isLatest: boolean }) {
  const [, navigate] = useLocation();
  const total  = parseFloat(order.totalAmount ?? "0");
  const paid   = order.paymentStatus === "paid" ? total : parseFloat(order.paidAmount ?? "0");
  const unpaid = order.paymentStatus === "paid" ? 0 : Math.max(0, total - paid);
  const isProcessing = ["draft", "confirmed", "processing"].includes(order.status);
  const statusLabel = order.status === "draft" ? "مسودة" : order.status === "confirmed" ? "مؤكد" : "قيد التجهيز";

  return (
    <div
      className={`group flex items-stretch gap-0 hover:bg-muted/10 transition-colors cursor-pointer rounded-lg border ${
        isProcessing ? "border-amber-500/30 bg-amber-900/5" : "border-border bg-card/50"
      }`}
      onClick={() => navigate(`/finance/sales/${order.id}`)}
    >
      {/* شريط اللون الجانبي */}
      <div className={`w-1 rounded-r-lg shrink-0 ${isProcessing ? "bg-amber-500" : "bg-emerald-500"}`} />

      <div className="flex-1 px-4 py-3.5">
        {/* رأس البطاقة */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-sm">{order.soNumber}</span>
              {isLatest && isProcessing && (
                <Badge variant="outline" className="text-[9px] border-amber-500/50 bg-amber-900/20 text-amber-400">الأحدث</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" />
                {format(new Date(order.createdAt), "yyyy/MM/dd")}
              </span>
              {order.status === "delivered" && order.closedAt ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  سُلِّم {format(new Date(order.closedAt), "yyyy/MM/dd")}
                </span>
              ) : (
                <span className="text-amber-500">
                  منذ {formatDistanceToNow(new Date(order.createdAt), { locale: ar, addSuffix: false })}
                </span>
              )}
            </div>
          </div>

          {/* Badge الحالة + سهم */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={`text-[9px] font-bold border ${
                isProcessing
                  ? "border-amber-700 bg-amber-900/20 text-amber-400"
                  : "border-emerald-700 bg-emerald-900/20 text-emerald-400"
              }`}
            >
              {isProcessing
                ? <><Clock className="w-2.5 h-2.5 inline ml-0.5" />{statusLabel}</>
                : <><CheckCircle2 className="w-2.5 h-2.5 inline ml-0.5" />تم التسليم</>}
            </Badge>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>

        {/* أرقام الفاتورة */}
        <div className="flex items-center gap-3 mt-2 text-[11px] flex-wrap">
          {order.itemCount != null && (
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3 text-muted-foreground" />
              <span className="font-bold">{order.itemCount}</span>
              <span className="text-muted-foreground">صنف</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            <span className="font-bold">{fmt(paid)}</span> مدفوع
          </span>
          {unpaid > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <Clock className="w-3 h-3" />
              <span className="font-bold">{fmt(unpaid)}</span> متبقي
            </span>
          )}
          <span className="flex items-center gap-1 text-primary font-bold mr-auto">
            {fmt(total)}
          </span>
        </div>

        {/* شريط الدفع */}
        {total > 0 && <InvoiceProgressBar paid={paid} total={total} />}
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية — نسخة من ShippingCompanyDetailPage بمنطق العملاء ───────
export default function CommercialClientDetailPage() {
  const params   = useParams();
  const clientId = Number(params.id);
  const qc       = useQueryClient();
  const [, navigate] = useLocation();

  // ── تابات: البيانات / الشحنات / الداشبورد ────────────────────────────────
  const [activeTab, setActiveTab] = useState<"data" | "shipments" | "dashboard" | "statement" | "returns">("dashboard");
  const [showNewManifest, setShowNewManifest] = useState(false);
  const [showOpenManifestWarning, setShowOpenManifestWarning] = useState(false);
  const [statementFrom, setStatementFrom] = useState("");
  const [statementTo,   setStatementTo]   = useState("");
  const { toast } = useToast();

  // ── تعديل الهدف inline ──────────────────────────────────────────────────
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput,   setTargetInput]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const targetMutation = useMutation({
    mutationFn: (newLimit: number) =>
      apiFetch<any>(`/finance/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({ creditLimit: newLimit }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-detail", clientId] });
      setEditingTarget(false);
    },
  });

  // ── إعادة حساب إحصائيات العميل (عدد/مبلغ الأوردرات) من أوامر البيع الحالية ──
  // مفيد بعد أي تعديل على منطق الحساب في الباك إند (مثلاً استبعاد أوردرات "مسودة")
  // عشان القيم المخزّنة (client.totalOrders...) تتزامن مع الحساب الجديد فورًا.
  const syncStatsMutation = useMutation({
    mutationFn: () =>
      apiFetch<any>(`/finance/clients/${clientId}/sync`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-detail", clientId] });
      toast({ title: "تم تحديث إحصائيات العميل بنجاح" });
    },
    onError: (err: any) => {
      toast({ title: "تعذّر تحديث الإحصائيات", description: err?.message, variant: "destructive" });
    },
  });

  const startEdit = (currentLimit: number) => {
    setTargetInput(String(currentLimit > 0 ? currentLimit : 1_000_000));
    setEditingTarget(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmEdit = () => {
    const val = parseFloat(targetInput.replace(/,/g, ""));
    if (!isNaN(val) && val > 0) targetMutation.mutate(val);
  };

  const { data, isLoading } = useQuery<ClientDetail>({
    queryKey: ["client-detail", clientId],
    queryFn: () => apiFetch<ClientDetail>(`/finance/clients/${clientId}`),
    enabled: !isNaN(clientId),
  });

  // ── رصيد العميل الإجمالي (مجموع صافي المستحق لكل بيانات العميل — كل الحالات) ─────────────
  const { data: balanceData } = useQuery<{ clientId: number; balance: number; manifestsCount: number }>({
    queryKey: ["client-account-balance", clientId],
    queryFn: () => apiFetch(`/client-account-manifests/balance/${clientId}`),
    enabled: !isNaN(clientId),
  });

  // ── شحنات العميل ──────────────────────────────────────────────────────────
  const { data: shipmentsData } = useQuery<{ shipments: ClientShipment[]; total: number }>({
    queryKey: ["client-shipments", clientId],
    queryFn: () => apiFetch(`/finance/clients/${clientId}/shipments`),
    enabled: !isNaN(clientId),
  });
  const clientShipments = shipmentsData?.shipments ?? [];

  // ── بيانات حساب العميل (Client Account Manifests — شحنات) ──────────────────
  const { data: manifests, isLoading: manifestsLoading } = useQuery<ClientAccountManifestListItem[]>({
    queryKey: ["client-account-manifests", clientId],
    queryFn: () => clientAccountManifestsApi.list(clientId),
    enabled: !isNaN(clientId),
  });
  const openManifest = manifests?.find(m => m.status === "open") ?? null;
  const { adminOpenManifest, adminRecentlyClosedManifests, adminArchivedManifests } = useMemo(() => {
    if (!manifests) {
      return {
        adminOpenManifest: null,
        adminRecentlyClosedManifests: [] as ClientAccountManifestListItem[],
        adminArchivedManifests: [] as ClientAccountManifestListItem[],
      };
    }

    const open = manifests.find((m) => m.status === "open") ?? null;
    const closed = manifests.filter((m) => m.status === "closed");

    return {
      adminOpenManifest: open,
      adminRecentlyClosedManifests: closed.slice(0, 2),
      adminArchivedManifests: closed.slice(2),
    };
  }, [manifests]);

  const handleNewManifestClick = () => {
    if (openManifest) setShowOpenManifestWarning(true);
    else setShowNewManifest(true);
  };

  // ── تصدير Excel ──────────────────────────────────────────────────────────
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPDF,   setExportingPDF]   = useState(false);

  const exportExcel = useCallback(async () => {
    if (!data) return;
    setExportingExcel(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Caprina OS";
      wb.created = new Date();

      const ws = wb.addWorksheet("كشف الحساب", { views: [{ rightToLeft: true }] });

      const TARGET_VAL = parseFloat(data.creditLimit ?? "0") > 0 ? parseFloat(data.creditLimit) : 100;
      const tOrders = data.totalOrders ?? 0;
      const tSales  = parseFloat(data.totalSales ?? "0");
      const tPaid   = parseFloat(data.totalPaid  ?? "0");
      const tUnpaid = Math.max(0, tSales - tPaid);
      const pct     = Math.min((tOrders / TARGET_VAL) * 100, 100).toFixed(1);

      const bAll = (cell: any, color = "FFB0BEC5") => {
        const s = { style: "thin" as const, color: { argb: color } };
        cell.border = { top: s, left: s, bottom: s, right: s };
      };

      // ══ سطر 1: عنوان ══
      ws.mergeCells("A1:G1");
      const t1 = ws.getCell("A1");
      t1.value     = `كشف حساب — ${data.name}`;
      t1.font      = { name: "Arial", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
      t1.alignment = { horizontal: "center", vertical: "middle" };
      t1.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      ws.getRow(1).height = 44;

      // ══ سطر 2: تاريخ ══
      ws.mergeCells("A2:G2");
      const t2 = ws.getCell("A2");
      t2.value     = `تاريخ الإصدار: ${format(new Date(), "yyyy/MM/dd  HH:mm")}`;
      t2.font      = { name: "Arial", size: 9, italic: true, color: { argb: "FF94A3B8" } };
      t2.alignment = { horizontal: "center", vertical: "middle" };
      t2.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F1A2E" } };
      ws.getRow(2).height = 18;
      ws.getRow(3).height = 8;

      // ══ سطرات 4-5: ملخص أرقام (4 بلوكات) ══
      const smColors  = ["FF0D9488","FF16A34A","FFDC2626","FF1D4ED8"];
      const smBGs     = ["FF0D3331","FF052E16","FF450A0A","FF1E3A5F"];
      const smLabels  = ["إجمالي الشحنات","إجمالي المدفوع","المديونية",`تحقيق الهدف`];
      const smVals    = [data.orders.filter(o => ["delivered", "closed"].includes(o.status)).length, tPaid, tUnpaid, parseFloat(pct)];
      const smFmts    = ['#,##0','#,##0','#,##0','0.0"%"'];
      const smCols    = [["A","B"],["C","D"],["E","F"],["G","G"]];

      smLabels.forEach((lbl, i) => {
        const [c1, c2] = smCols[i];
        if (c1 !== c2) { ws.mergeCells(`${c1}4:${c2}4`); ws.mergeCells(`${c1}5:${c2}5`); }
        const hCell = ws.getCell(`${c1}4`);
        hCell.value     = lbl;
        hCell.font      = { name: "Arial", size: 9, bold: true, color: { argb: smColors[i] } };
        hCell.alignment = { horizontal: "center", vertical: "middle" };
        hCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: smBGs[i] } };
        bAll(hCell, smColors[i]);
        ws.getRow(4).height = 20;

        const vCell = ws.getCell(`${c1}5`);
        vCell.value     = smVals[i];
        vCell.numFmt    = smFmts[i];
        vCell.font      = { name: "Arial", size: 14, bold: true, color: { argb: smColors[i] } };
        vCell.alignment = { horizontal: "center", vertical: "middle" };
        vCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: smBGs[i] } };
        bAll(vCell, smColors[i]);
        ws.getRow(5).height = 32;
      });

      ws.getRow(6).height = 8;

      // ══ أعمدة الجدول ══
      ws.columns = [
        { key: "soNumber",  width: 20 },
        { key: "createdAt", width: 14 },
        { key: "status",    width: 16 },
        { key: "payStatus", width: 14 },
        { key: "total",     width: 18 },
        { key: "paid",      width: 18 },
        { key: "unpaid",    width: 18 },
      ];

      // ══ سطر 7: رأس الجدول ══
      const hdr = ws.addRow(["رقم الفاتورة","التاريخ","الحالة","حالة الدفع","الإجمالي","المدفوع","المتبقي"]);
      hdr.eachCell(cell => {
        cell.font      = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
        bAll(cell, "FF3B82F6");
      });
      hdr.height = 24;

      // ══ صفوف الفواتير ══
      const stMap: Record<string,string> = { draft:"مسودة", confirmed:"مؤكد", processing:"قيد التجهيز", delivered:"تم التسليم", closed:"مغلق" };
      const pyMap: Record<string,string> = { paid:"مسدد", partial:"جزئي", unpaid:"غير مسدد" };

      data.orders.forEach((o, i) => {
        const tot  = parseFloat(o.totalAmount ?? "0");
        const pd   = o.paymentStatus === "paid" ? tot : parseFloat(o.paidAmount ?? "0");
        const unp  = Math.max(0, tot - pd);
        const rowBG = i % 2 === 0 ? "FFF0F4FA" : "FFFFFFFF";
        const isProc = ["draft","confirmed","processing"].includes(o.status);

        const row = ws.addRow({
          soNumber:  o.soNumber,
          createdAt: format(new Date(o.createdAt), "yyyy/MM/dd"),
          status:    stMap[o.status]          ?? o.status,
          payStatus: pyMap[o.paymentStatus]   ?? o.paymentStatus,
          total: tot, paid: pd, unpaid: unp,
        });

        row.eachCell(cell => {
          cell.font      = { name: "Arial", size: 10, color: { argb: "FF1E293B" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: rowBG } };
          bAll(cell, "FFD1D5DB");
        });

        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0';
        row.getCell(7).numFmt = '#,##0';

        // لون خلية الحالة
        row.getCell(3).font = { name:"Arial", size:10, bold:true, color:{ argb: isProc ? "FFD97706" : "FF059669" } };
        row.getCell(3).fill = { type:"pattern", pattern:"solid", fgColor:{ argb: isProc ? "FFFEF3C7" : "FFD1FAE5" } };

        // لون المتبقي
        if (unp > 0) {
          row.getCell(7).font = { name:"Arial", size:10, bold:true, color:{ argb:"FFDC2626" } };
          row.getCell(7).fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFFEE2E2" } };
        } else {
          row.getCell(7).font = { name:"Arial", size:10, color:{ argb:"FF059669" } };
        }
        row.height = 22;
      });

      // ══ صف الإجمالي ══
      const totRow = ws.addRow(["","","","الإجمالي", tSales, tPaid, tUnpaid]);
      totRow.eachCell(cell => {
        cell.font      = { name:"Arial", size:11, bold:true, color:{ argb:"FFFFFFFF" } };
        cell.fill      = { type:"pattern", pattern:"solid", fgColor:{ argb:"FF1D4ED8" } };
        cell.alignment = { horizontal:"center", vertical:"middle" };
        bAll(cell, "FF60A5FA");
      });
      totRow.getCell(5).numFmt = '#,##0';
      totRow.getCell(6).numFmt = '#,##0';
      totRow.getCell(7).numFmt = '#,##0';
      if (tUnpaid > 0) totRow.getCell(7).font = { name:"Arial", size:11, bold:true, color:{ argb:"FFFBBF24" } };
      totRow.height = 26;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `كشف-حساب-${data.name}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingExcel(false);
    }
  }, [data]);

  // ── تصدير PDF (print) ─────────────────────────────────────────────────────
  const exportPDF = useCallback(() => {
    if (!data) return;
    setExportingPDF(true);
    const TARGET_VAL = parseFloat(data.creditLimit ?? "0") > 0 ? parseFloat(data.creditLimit) : 100;
    const tOrders = data.totalOrders ?? 0;
    const tSales  = parseFloat(data.totalSales  ?? "0");
    const tPaid   = parseFloat(data.totalPaid   ?? "0");
    const tUnpaid = Math.max(0, tSales - tPaid);
    const pct     = Math.min((tOrders / TARGET_VAL) * 100, 100).toFixed(1);
    const fmtNum  = (n: number) => new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n);
    const statusMap: Record<string, string> = {
      draft: "مسودة", confirmed: "مؤكد", processing: "قيد التجهيز", delivered: "تم التسليم", closed: "مغلق",
    };

    const rows = data.orders.map((o, i) => {
      const total  = parseFloat(o.totalAmount ?? "0");
      const paid   = o.paymentStatus === "paid" ? total : parseFloat(o.paidAmount ?? "0");
      const unpaid = Math.max(0, total - paid);
      const bg = i % 2 === 0 ? "#1e293b" : "#0f172a";
      return `
        <tr style="background:${bg}">
          <td>${o.soNumber}</td>
          <td>${format(new Date(o.createdAt), "yyyy/MM/dd")}</td>
          <td>${statusMap[o.status] ?? o.status}</td>
          <td>${fmtNum(total)}</td>
          <td style="color:#34d399">${fmtNum(paid)}</td>
          <td style="color:${unpaid > 0 ? "#f87171" : "#94a3b8"};font-weight:${unpaid > 0 ? "bold" : "normal"}">${fmtNum(unpaid)}</td>
        </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8">
<title>كشف حساب — ${data.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; padding: 32px; }
  h1  { font-size: 22px; font-weight: 900; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #64748b; margin-bottom: 20px; }
  .summary { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
  .stat { background: #1e293b; border-radius: 8px; padding: 12px; text-align: center; }
  .stat-label { font-size: 10px; color: #64748b; margin-bottom: 4px; }
  .stat-value { font-size: 16px; font-weight: 900; }
  .goal-bar { height: 4px; background: #334155; border-radius: 99px; margin-top: 6px; overflow:hidden; }
  .goal-fill { height: 4px; background: ${parseFloat(pct) >= 75 ? "#10b981" : parseFloat(pct) >= 50 ? "#f59e0b" : "#3b82f6"}; border-radius: 99px; width: ${pct}%; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #334155; padding: 10px 8px; text-align: center; font-size: 10px; color: #94a3b8; }
  td { padding: 9px 8px; text-align: center; border-bottom: 1px solid #1e293b; }
  tfoot td { background: #1d4ed8; font-weight: 900; font-size: 12px; padding: 11px 8px; }
  @media print { body { background: #fff; color: #000; } .stat { background: #f1f5f9; } th { background: #e2e8f0; color: #334155; } tfoot td { background: #1d4ed8; color: #fff; } }
</style></head>
<body>
  <h1>كشف حساب — ${data.name}</h1>
  <p class="meta">تاريخ الطباعة: ${format(new Date(), "yyyy/MM/dd HH:mm")}</p>
  <div class="summary">
    <div class="stat"><div class="stat-label">إجمالي الفواتير</div><div class="stat-value">${data.orders.length}</div></div>
    <div class="stat"><div class="stat-label">إجمالي الشحنات</div><div class="stat-value" style="color:#2dd4bf">${data.orders.filter(o => ["delivered", "closed"].includes(o.status)).length}</div></div>
    <div class="stat"><div class="stat-label">المديونية</div><div class="stat-value" style="color:#f87171">${fmtNum(tUnpaid)}</div></div>
    <div class="stat">
      <div class="stat-label">تحقيق الهدف</div>
      <div class="stat-value" style="color:${parseFloat(pct) >= 75 ? "#10b981" : parseFloat(pct) >= 50 ? "#f59e0b" : "#3b82f6"}">${pct}%</div>
      <div class="goal-bar"><div class="goal-fill"></div></div>
      <div style="font-size:9px;color:#64748b;margin-top:4px">الهدف: ${fmtNum(TARGET_VAL)}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الحالة</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">الإجمالي</td><td>${fmtNum(tSales)}</td><td>${fmtNum(tPaid)}</td><td>${fmtNum(tUnpaid)}</td></tr></tfoot>
  </table>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.onload = () => { win.print(); setExportingPDF(false); };
    } else {
      setExportingPDF(false);
    }
  }, [data]);

  if (isNaN(clientId))
    return <div className="p-8 text-center text-muted-foreground">معرّف غير صحيح</div>;

  const client      = data;
  const creditLimit = parseFloat(client?.creditLimit ?? "0");
  // ✅ totalSales و totalPaid بيجوا live من الـ API (محسوبين من الفواتير الفعلية)
  const totalSales  = parseFloat(client?.totalSales  ?? "0");
  const totalPaid   = parseFloat(client?.totalPaid   ?? "0");
  const allOrders        = data?.orders ?? [];
  // المديونية = إجمالي المبيعات - إجمالي المدفوع (محسوبين live من الـ API)
  const unpaid = Math.max(0, totalSales - totalPaid);
  // ✅ نسبة التسليم الحقيقية من الـ API (delivered ÷ total)
  const deliveryRate = data?.deliveryRate ?? 0;
  // نسبة تحقيق الهدف (عدد الأوردرات ÷ creditLimit كهدف)
  const totalOrdersCount = client?.totalOrders ?? 0;
  const salesPct    = Math.min((totalOrdersCount / (creditLimit > 0 ? creditLimit : 100)) * 100, 100);
  const remaining   = Math.max(0, creditLimit - totalOrdersCount);

  const processingOrders = allOrders.filter(o => ["draft", "confirmed", "processing"].includes(o.status));
  const deliveredOrders  = allOrders.filter(o => ["delivered", "closed"].includes(o.status));
  const latestProcessingId = processingOrders[0]?.id;

  const TARGET = creditLimit > 0 ? creditLimit : 100;
  const monthlyTarget = Math.round(TARGET / 12);

  // ── مؤشر الخطر 0–100 (كلما قل كان أأمن) ────────────────────────────────
  const riskScore = useMemo(() => {
    if (!client || allOrders.length === 0) return null;

    // 1. نسبة السداد (0–40 نقطة خطر) — كلما قلت النسبة زاد الخطر
    const payRate = totalSales > 0 ? totalPaid / totalSales : 0;
    const payRisk = Math.round((1 - payRate) * 40);

    // 2. عمر الديون (0–35 نقطة) — أقدم فاتورة غير مسددة
    const unpaidOrders = allOrders.filter(o => o.paymentStatus !== "paid");
    let debtAgeRisk = 0;
    if (unpaidOrders.length > 0) {
      const oldestDays = Math.max(...unpaidOrders.map(o => {
        const diff = Date.now() - new Date(o.createdAt).getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
      }));
      if (oldestDays > 90)      debtAgeRisk = 35;
      else if (oldestDays > 60) debtAgeRisk = 25;
      else if (oldestDays > 30) debtAgeRisk = 15;
      else                       debtAgeRisk = 5;
    }

    // 3. انتظام الشراء (0–25 نقطة) — لو مفيش أوردر آخر 60 يوم
    const sortedDates = allOrders
      .map(o => new Date(o.createdAt).getTime())
      .sort((a, b) => b - a);
    let regularityRisk = 0;
    if (sortedDates.length > 0) {
      const daysSinceLast = Math.floor((Date.now() - sortedDates[0]) / (1000 * 60 * 60 * 24));
      if (daysSinceLast > 90)      regularityRisk = 25;
      else if (daysSinceLast > 60) regularityRisk = 18;
      else if (daysSinceLast > 30) regularityRisk = 10;
      else                          regularityRisk = 0;
    }

    const total = Math.min(100, payRisk + debtAgeRisk + regularityRisk);
    return { total, payRisk, debtAgeRisk, regularityRisk };
  }, [client, allOrders, totalSales, totalPaid]);
  // ── بيانات الـ Donut chart ───────────────────────────────────────────────
  const donutData = useMemo(() => [
    { name: "الأوردرات الفعلية", value: Math.min(totalOrdersCount, TARGET) },
    { name: "المتبقي للهدف",     value: Math.max(0, TARGET - totalOrdersCount) },
  ], [totalOrdersCount, TARGET]);

  // ── بيانات الـ Line chart — آخر 6 أشهر ─────────────────────────────────
  const monthlyData = useMemo(() => {
    const months: { label: string; sales: number; target: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d     = subMonths(new Date(), i);
      const start = startOfMonth(d);
      const end   = endOfMonth(d);
      // عدد الأوردرات في الشهر
      const ordersCount = allOrders.filter(o => {
          const cd = new Date(o.createdAt);
          return cd >= start && cd <= end;
        }).length;
      months.push({
        label: format(d, "MMM", { locale: ar }),
        sales: ordersCount,
        target: monthlyTarget,
      });
    }
    return months;
  }, [allOrders, monthlyTarget]);

  // ── أكثر المنتجات شراءً ──────────────────────────────────────────────────
  const { data: topProductsData } = useQuery<{
    items: { productName: string; quantity: number; totalValue: number; percentage: number }[];
    grandTotal: number;
  }>({
    queryKey: ["client-top-products", clientId],
    queryFn:  () => apiFetch(`/finance/clients/${clientId}/top-products`),
    enabled:  !isNaN(clientId),
  });

  const PRODUCT_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899"];

  // ── معدل تكرار الشراء ────────────────────────────────────────────────────
  const purchaseFrequency = useMemo(() => {
    if (!allOrders || allOrders.length === 0) return null;

    // ترتيب الفواتير من الأقدم للأحدث
    const sorted = [...allOrders]
      .map(o => new Date(o.createdAt).getTime())
      .sort((a, b) => a - b);

    const lastOrderDate = new Date(sorted[sorted.length - 1]);
    const daysSinceLast = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));

    // متوسط الأيام بين كل فاتورة والتالية
    let avgDays: number | null = null;
    if (sorted.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const diff = Math.floor((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24));
        gaps.push(diff);
      }
      avgDays = Math.round(gaps.reduce((s, d) => s + d, 0) / gaps.length);
    }

    // هل فاتت أكثر من 30 يوم؟
    const isOverdue = daysSinceLast > 30;
    // هل قريب من الـ 30 يوم؟ (بين 20 و30)
    const isWarning = daysSinceLast >= 20 && daysSinceLast <= 30;

    return { lastOrderDate, daysSinceLast, avgDays, isOverdue, isWarning };
  }, [allOrders]);

  // ── توقع اكتمال الهدف ────────────────────────────────────────────────────
  const goalForecast = useMemo(() => {
    if (!allOrders || allOrders.length === 0) return null;
    if (totalSales >= TARGET) return { done: true, completionDate: null, monthsLeft: 0, dailyRate: 0, confidence: "high" as const };

    const now = Date.now();

    // الـ span من أقدم فاتورة لحد دلوقتي — بيشتغل حتى مع فاتورة واحدة
    const sorted = [...allOrders].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const oldestTs  = new Date(sorted[0].createdAt).getTime();
    const spanDays  = Math.max((now - oldestTs) / (1000 * 60 * 60 * 24), 1);
    const dailyRate = totalSales / spanDays;

    if (dailyRate <= 0) return null;

    const remaining  = TARGET - totalSales;
    const daysNeeded = Math.ceil(remaining / dailyRate);

    // guard: أكثر من 10 سنين = توقع مش منطقي
    if (daysNeeded > 3650) return null;

    const completionDate = new Date(now + daysNeeded * 24 * 60 * 60 * 1000);
    if (isNaN(completionDate.getTime())) return null;

    const monthsLeft = Math.ceil(daysNeeded / 30);

    const confidence: "high" | "medium" | "low" =
      allOrders.length >= 5 && spanDays >= 30 ? "high"
      : allOrders.length >= 2 ? "medium"
      : "low";

    return { done: false, completionDate, monthsLeft, daysNeeded, dailyRate, confidence };
  }, [allOrders, totalSales, TARGET]);

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500" dir="rtl">

      {/* ─── Header — زي ShippingCompanyDetailPage ─── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full border-border shrink-0"
            onClick={() => navigate("/finance/clients")}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border">
            <ClientAvatar avatar={client?.avatar} name={client?.name ?? "؟"} size="md" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{client?.name ?? "…"}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {client?.phone && (
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</span>
              )}
              {(client?.city || client?.address) && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {[client.address, client.city, client.region].filter(Boolean).join("، ")}
                </span>
              )}
              <Badge variant="outline" className={`text-[9px] font-bold border ${
                client?.isActive
                  ? "border-emerald-800 bg-emerald-900/30 text-emerald-400"
                  : "border-border text-muted-foreground"
              }`}>
                {client?.isActive ? "نشط" : "موقف"}
              </Badge>
            </div>
          </div>
        </div>
        {/* ─── أزرار التصدير + بيان جديد ─── */}
        {client && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              size="sm"
              onClick={handleNewManifestClick}
              className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              بيان جديد
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              disabled={exportingExcel}
              className="h-8 gap-1.5 text-xs border-emerald-800 text-emerald-400 hover:bg-emerald-900/20"
            >
              {exportingExcel
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileSpreadsheet className="w-3.5 h-3.5" />}
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportPDF}
              disabled={exportingPDF}
              className="h-8 gap-1.5 text-xs border-blue-800 text-blue-400 hover:bg-blue-900/20"
            >
              {exportingPDF
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5" />}
              PDF
            </Button>
          </div>
        )}
      </div>

      {/* ─── Tabs — البيانات / الشحنات / الداشبورد ─── */}
      <div className="flex items-center gap-1 border-b border-border pb-0 overflow-x-auto">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px shrink-0 ${
            activeTab === "dashboard"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          الداشبورد
        </button>
        <button
          onClick={() => setActiveTab("data")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px shrink-0 ${
            activeTab === "data"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          البيانات
          {allOrders.length > 0 && <Badge variant="outline" className="text-[9px] ml-1">{allOrders.length}</Badge>}
        </button>
        <button
          onClick={() => setActiveTab("shipments")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px shrink-0 ${
            activeTab === "shipments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          الشحنات
          {clientShipments.length > 0 && <Badge variant="outline" className="text-[9px] ml-1">{clientShipments.length}</Badge>}
        </button>
        <button
          onClick={() => setActiveTab("returns")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px shrink-0 ${
            activeTab === "returns"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          المرتجعات
        </button>
        <button
          onClick={() => { setStatementFrom(""); setStatementTo(""); setActiveTab("statement"); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px shrink-0 ${
            activeTab === "statement"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          كشف حساب
        </button>
      </div>

      {/* ══════════════════════════ Tab: الداشبورد ══════════════════════════ */}
      {activeTab === "dashboard" && (
      <div className="space-y-5 pt-1">

      {/* ─── Stats Cards — زي شركات الشحن بس بأرقام العميل ─── */}
      {!isLoading && client && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="card-glow border-teal-900/40 p-3 text-center" style={GLOW.teal.style}>
            <p className="text-[10px] text-teal-400 mb-0.5">إجمالي الشحنات</p>
            <p className="text-xl font-black text-teal-400">{clientShipments.length}</p>
            <p className="text-[10px] text-teal-600">
              {clientShipments.filter(s => ["received","delivered"].includes(s.status)).length} مسلّمة
              {" · "}
              {clientShipments.filter(s => ["returned"].includes(s.status)).length} مرتجع
              {" · "}
              {clientShipments.filter(s => s.isDelayed).length} مؤجل
            </p>
          </Card>
          <Card className="card-glow border-emerald-900/40 p-3 text-center" style={GLOW.emerald.style}>
            <p className="text-[10px] text-emerald-400 mb-0.5">إجمالي رصيد العميل</p>
            {(balanceData?.manifestsCount ?? 0) > 0 ? (
              <>
                <p className="text-xl font-black text-emerald-400">{fmt(balanceData?.balance ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground">{balanceData?.manifestsCount ?? 0} بيان</p>
              </>
            ) : (
              <p className="text-[11px] font-semibold text-emerald-400/80 leading-snug px-1">
                سيتم عرض الإجمالي بعد إغلاق البيان
              </p>
            )}
          </Card>
          <Card
            className={`card-glow p-3 text-center border ${salesPct >= 75 ? "border-emerald-900/40" : salesPct >= 50 ? "border-amber-900/40" : "border-primary/30"}`}
            style={salesPct >= 75 ? GLOW.emerald.style : salesPct >= 50 ? GLOW.amber.style : GLOW.blue.style}
          >
            <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
              تحقيق الهدف
              <button
                onClick={() => syncStatsMutation.mutate()}
                disabled={syncStatsMutation.isPending}
                title="تحديث الإحصائيات"
                className="text-muted-foreground/50 hover:text-primary transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${syncStatsMutation.isPending ? "animate-spin" : ""}`} />
              </button>
            </p>
            <p className={`text-2xl font-black ${salesPct >= 75 ? "text-emerald-400" : salesPct >= 50 ? "text-amber-400" : "text-primary"}`}>
              {salesPct.toFixed(1)}%
            </p>
            <div className="w-full bg-muted/30 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all ${salesPct >= 75 ? "bg-emerald-500" : salesPct >= 50 ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${Math.min(salesPct, 100)}%` }}
              />
            </div>

            {/* الهدف قابل للتعديل inline */}
            {editingTarget ? (
              <div className="flex items-center gap-1 mt-2 justify-center">
                <Input
                  ref={inputRef}
                  type="number"
                  value={targetInput}
                  onChange={e => setTargetInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") setEditingTarget(false); }}
                  className="h-6 text-[11px] text-center w-24 px-1 bg-background border-primary/50"
                />
                <button
                  onClick={confirmEdit}
                  disabled={targetMutation.isPending}
                  className="w-5 h-5 rounded flex items-center justify-center bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60 transition-colors"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setEditingTarget(false)}
                  className="w-5 h-5 rounded flex items-center justify-center bg-muted/40 text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEdit(creditLimit)}
                className="flex items-center justify-center gap-1 mt-1.5 mx-auto group"
              >
                <p className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                  {creditLimit > 0 ? `هدف ${creditLimit} أوردر` : `هدف 100 أوردر`}
                </p>
                <Edit2 className="w-2.5 h-2.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </button>
            )}
          </Card>
        </div>
      )}

      {/* ─── Charts: Donut + Line ─── */}
      {!isLoading && client && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Donut — مقياس الهدف */}
          <Card className="card-glow border-border p-4" style={GLOW.neutral.style}>
            <p className="text-xs font-bold mb-3 flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
              مقياس الهدف
            </p>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0" style={{ width: 110, height: 110 }}>
                <PieChart width={110} height={110}>
                  <Pie
                    data={donutData}
                    cx={55} cy={55}
                    innerRadius={34} outerRadius={50}
                    startAngle={90} endAngle={-270}
                    dataKey="value" strokeWidth={0}
                  >
                    <Cell fill={salesPct >= 75 ? "#10b981" : salesPct >= 50 ? "#f59e0b" : "#3b82f6"} />
                    <Cell fill="hsl(var(--muted)/0.3)" />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className={`text-lg font-black leading-none ${salesPct >= 75 ? "text-emerald-400" : salesPct >= 50 ? "text-amber-400" : "text-blue-400"}`}>
                    {Math.round(salesPct)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">من الهدف</p>
                </div>
              </div>
              <div className="flex-1 space-y-2.5">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: salesPct >= 75 ? "#10b981" : salesPct >= 50 ? "#f59e0b" : "#3b82f6" }} />
                    <p className="text-[10px] text-muted-foreground">الأوردرات الفعلية</p>
                  </div>
                  <p className="text-sm font-black text-primary">{totalOrdersCount} أوردر</p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />
                    <p className="text-[10px] text-muted-foreground">المتبقي للهدف</p>
                  </div>
                  <p className="text-sm font-black text-muted-foreground">{Math.max(0, TARGET - totalOrdersCount)} أوردر</p>
                </div>
                <div className="pt-1 border-t border-border">
                  <p className="text-[10px] text-muted-foreground">الهدف الكلي</p>
                  <p className="text-xs font-bold">{TARGET} أوردر</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Line chart — النمو الشهري */}
          <Card className="card-glow border-border p-4" style={GLOW.neutral.style}>
            <p className="text-xs font-bold mb-1 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
              النمو الشهري
            </p>
            <div className="flex items-center gap-3 mb-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-5 h-0.5 bg-blue-400 inline-block rounded" />المبيعات
              </span>
              <span className="flex items-center gap-1">
                <span className="w-5 h-0.5 border-t border-dashed border-amber-400 inline-block" />الهدف الشهري
              </span>
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={monthlyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}K` : String(v)} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, direction: "rtl" }}
                  formatter={(v: any, name: string) => [`${v} أوردر`, name === "sales" ? "الأوردرات" : "الهدف"]}
                  labelFormatter={(l) => `شهر ${l}`}
                />
                <ReferenceLine y={monthlyTarget} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
                <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2}
                  dot={{ fill: "#3b82f6", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[9px] text-muted-foreground text-center mt-1">
              الهدف الشهري: {monthlyTarget} أوردر
            </p>
          </Card>
        </div>
      )}

      {/* ─── مؤشر الخطر ─── */}
      {!isLoading && client && riskScore !== null && (() => {
        const s = riskScore.total;
        const isLow    = s <= 30;
        const isMed    = s > 30 && s <= 65;
        const isHigh   = s > 65;
        const color    = isLow ? "#10b981" : isMed ? "#f59e0b" : "#e24b4a";
        const bgClass  = isLow ? "border-emerald-900/40 bg-emerald-900/10" : isMed ? "border-amber-900/40 bg-amber-900/10" : "border-red-900/40 bg-red-900/10";
        const glowCls  = isLow ? "card-glow-emerald" : isMed ? "card-glow-amber" : "card-glow-danger";
        const label    = isLow ? "آمن" : isMed ? "تحت المراقبة" : "خطر مرتفع";
        const textCls  = isLow ? "text-emerald-400" : isMed ? "text-amber-400" : "text-red-400";

        const bars = [
          { label: "نسبة السداد",      max: 40, val: riskScore.payRisk,         icon: "ti-coin" },
          { label: "عمر الديون",       max: 35, val: riskScore.debtAgeRisk,     icon: "ti-calendar-x" },
          { label: "انتظام الشراء",   max: 25, val: riskScore.regularityRisk,  icon: "ti-repeat" },
        ];

        return (
          <Card className={`card-glow ${glowCls} border p-4 ${bgClass}`}
            style={isLow ? GLOW.emerald.style : isMed ? GLOW.amber.style : GLOW.danger.style}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold flex items-center gap-2">
                <i className="ti ti-shield-half" style={{ fontSize: 15, color }} aria-hidden="true" />
                مؤشر الخطر
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isLow ? "border-emerald-700 bg-emerald-900/30 text-emerald-400"
                : isMed ? "border-amber-700 bg-amber-900/30 text-amber-400"
                : "border-red-700 bg-red-900/30 text-red-400"
              }`}>{label}</span>
            </div>

            <div className="flex items-center gap-5">
              {/* الـ Score الكبير */}
              <div className="shrink-0 text-center w-20">
                <p className={`text-4xl font-black leading-none ${textCls}`}>{s}</p>
                <p className="text-[9px] text-muted-foreground mt-1">من 100</p>
                {/* شريط نصف دائري بسيط */}
                <div className="mt-2 w-full bg-muted/30 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${s}%`, background: color }} />
                </div>
              </div>

              {/* تفاصيل العوامل */}
              <div className="flex-1 space-y-2.5">
                {bars.map(b => {
                  const pct = b.max > 0 ? Math.round((b.val / b.max) * 100) : 0;
                  const barColor = pct >= 70 ? "#e24b4a" : pct >= 40 ? "#f59e0b" : "#10b981";
                  return (
                    <div key={b.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <i className={`ti ${b.icon}`} style={{ fontSize: 11 }} aria-hidden="true" />
                          {b.label}
                        </span>
                        <span className="text-[10px] font-bold" style={{ color: barColor }}>
                          {b.val}/{b.max}
                        </span>
                      </div>
                      <div className="w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[9px] text-muted-foreground mt-3 border-t border-border/50 pt-2">
              {isLow  && "العميل ملتزم بالسداد ونشيط في الشراء — لا توجد مخاطر حالياً."}
              {isMed  && "يوجد بعض التأخر في السداد أو انتظام الشراء — يُنصح بالمتابعة."}
              {isHigh && "تحذير: ديون متأخرة أو توقف في الشراء — يستلزم تدخلاً فورياً."}
            </p>
          </Card>
        );
      })()}

      {/* ─── أكثر المنتجات شراءً ─── */}
      {!isLoading && client && topProductsData && topProductsData.items.length > 0 && (
        <Card className="card-glow border-border p-4" style={GLOW.neutral.style}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-muted-foreground" />
              أكثر المنتجات شراءً
            </p>
            <span className="text-[10px] text-muted-foreground">
              إجمالي: {fmt(topProductsData.grandTotal)}
            </span>
          </div>

          <div className="space-y-3">
            {topProductsData.items.map((item, i) => (
              <div key={item.productName}>
                {/* الصف الرئيسي */}
                <div className="flex items-center gap-3 mb-1.5">
                  {/* الرقم */}
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 text-white"
                    style={{ background: PRODUCT_COLORS[i] }}
                  >
                    {i + 1}
                  </div>

                  {/* الاسم + الكمية */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold truncate">{item.productName}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {item.quantity.toLocaleString("ar-EG")} قطعة
                        </span>
                        <span className="text-[11px] font-black" style={{ color: PRODUCT_COLORS[i] }}>
                          {fmt(item.totalValue)}
                        </span>
                      </div>
                    </div>

                    {/* شريط النسبة */}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-muted/30 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full transition-all duration-700"
                          style={{ width: `${item.percentage}%`, background: PRODUCT_COLORS[i] }}
                        />
                      </div>
                      <span className="text-[10px] font-bold w-8 text-left shrink-0" style={{ color: PRODUCT_COLORS[i] }}>
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* mini donut للمقارنة البصرية */}
          {topProductsData.items.length > 1 && (
            <div className="mt-4 pt-3 border-t border-border flex items-center gap-4">
              <div className="shrink-0">
                <PieChart width={80} height={80}>
                  <Pie
                    data={topProductsData.items}
                    dataKey="totalValue"
                    nameKey="productName"
                    cx={40} cy={40}
                    innerRadius={22} outerRadius={36}
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                  >
                    {topProductsData.items.map((_, i) => (
                      <Cell key={i} fill={PRODUCT_COLORS[i]} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {topProductsData.items.map((item, i) => (
                  <div key={item.productName} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PRODUCT_COLORS[i] }} />
                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{item.productName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─── توقع اكتمال الهدف ─── */}
      {!isLoading && client && goalForecast && (() => {
        const gf = goalForecast;

        if (gf.done) return (
          <Card className="card-glow border-emerald-900/40 p-4" style={GLOW.emerald.style}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-900/40 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-400">🎉 تم تحقيق الهدف!</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  المبيعات {fmt(totalSales)} تجاوزت الهدف {fmt(TARGET)}
                </p>
              </div>
            </div>
          </Card>
        );

        const confColor   = gf.confidence === "high" ? "#10b981" : gf.confidence === "medium" ? "#f59e0b" : "#94a3b8";
        const confLabel   = gf.confidence === "high" ? "توقع موثوق" : gf.confidence === "medium" ? "توقع تقريبي" : "بيانات قليلة";
        const progressPct = Math.min((totalSales / TARGET) * 100, 100);
        const monthName   = gf.completionDate
          ? format(gf.completionDate, "MMMM yyyy", { locale: ar })
          : null;

        return (
          <Card className="card-glow border-border p-4" style={GLOW.neutral.style}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                توقع اكتمال الهدف
              </p>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ borderColor: confColor + "80", background: confColor + "15", color: confColor }}
              >
                {confLabel}
              </span>
            </div>

            {/* الشهر المتوقع — كبير في المنتصف */}
            <div className="text-center mb-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-[10px] text-muted-foreground mb-1">الشهر المتوقع لاكتمال الهدف</p>
              <p className="text-2xl font-black text-primary leading-none">{monthName}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {gf.daysNeeded! <= 30
                  ? `خلال ${gf.daysNeeded} يوم فقط 🚀`
                  : `بعد ~${gf.monthsLeft} شهر`}
              </p>
            </div>

            {/* شريط التقدم نحو الهدف */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5 text-[10px]">
                <span className="text-muted-foreground">المبيعات الحالية</span>
                <span className="font-bold">{progressPct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-muted/30 rounded-full h-3 overflow-hidden relative">
                <div
                  className="h-3 rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: progressPct >= 75 ? "#10b981" : progressPct >= 50 ? "#f59e0b" : "#3b82f6",
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[9px] text-muted-foreground">
                <span>{fmt(totalSales)}</span>
                <span>الهدف: {fmt(TARGET)}</span>
              </div>
            </div>

            {/* إحصائيات الحساب */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">المتبقي</p>
                <p className="text-xs font-black text-red-400">{fmt(TARGET - totalSales)}</p>
              </div>
              <div className="text-center border-x border-border/50">
                <p className="text-[9px] text-muted-foreground">معدل يومي</p>
                <p className="text-xs font-black text-primary">{fmt(Math.round(gf.dailyRate))}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground">أيام متبقية</p>
                <p className="text-xs font-black">{gf.daysNeeded!.toLocaleString("ar-EG")}</p>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* ─── معدل تكرار الشراء ─── */}
      {!isLoading && client && purchaseFrequency && (() => {
        const pf = purchaseFrequency;
        const cardClass = pf.isOverdue
          ? "border-red-900/40 bg-red-900/10"
          : pf.isWarning
          ? "border-amber-900/40 bg-amber-900/10"
          : "border-border bg-card";
        const glowCard = pf.isOverdue ? "card-glow-danger" : pf.isWarning ? "card-glow-amber" : "card-glow";
        const textCls = pf.isOverdue ? "text-red-400" : pf.isWarning ? "text-amber-400" : "text-emerald-400";
        const badgeClass = pf.isOverdue
          ? "border-red-700 bg-red-900/30 text-red-400"
          : pf.isWarning
          ? "border-amber-700 bg-amber-900/30 text-amber-400"
          : "border-emerald-700 bg-emerald-900/30 text-emerald-400";
        const badgeLabel = pf.isOverdue ? "تنبيه — تجاوز 30 يوم" : pf.isWarning ? "قريب من 30 يوم" : "نشيط";

        return (
          <Card className={`card-glow ${glowCard} border p-4 ${cardClass}`}
            style={pf.isOverdue ? GLOW.danger.style : pf.isWarning ? GLOW.amber.style : GLOW.neutral.style}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                معدل تكرار الشراء
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${badgeClass}`}>
                {pf.isOverdue && <Bell className="w-2.5 h-2.5" />}
                {badgeLabel}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* آخر شراء */}
              <div className="text-center p-3 rounded-lg bg-muted/10 border border-border/50">
                <p className="text-[10px] text-muted-foreground mb-1">آخر شراء</p>
                <p className={`text-lg font-black leading-none ${textCls}`}>
                  {pf.daysSinceLast === 0 ? "اليوم" : `${pf.daysSinceLast}`}
                </p>
                {pf.daysSinceLast > 0 && (
                  <p className="text-[9px] text-muted-foreground mt-0.5">يوم مضى</p>
                )}
                <p className="text-[9px] text-muted-foreground mt-1 border-t border-border/30 pt-1">
                  {format(pf.lastOrderDate, "dd/MM/yyyy")}
                </p>
              </div>

              {/* متوسط الفترة */}
              <div className="text-center p-3 rounded-lg bg-muted/10 border border-border/50">
                <p className="text-[10px] text-muted-foreground mb-1">متوسط الفترة</p>
                {pf.avgDays !== null ? (
                  <>
                    <p className="text-lg font-black leading-none text-primary">{pf.avgDays}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">يوم / طلب</p>
                    <p className="text-[9px] text-muted-foreground mt-1 border-t border-border/30 pt-1">
                      من {allOrders.length} فاتورة
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-black leading-none text-muted-foreground">—</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">فاتورة واحدة</p>
                  </>
                )}
              </div>

              {/* التقييم */}
              <div className="text-center p-3 rounded-lg bg-muted/10 border border-border/50">
                <p className="text-[10px] text-muted-foreground mb-1">الحالة</p>
                <p className={`text-lg font-black leading-none ${textCls}`}>
                  {pf.isOverdue ? "⚠️" : pf.isWarning ? "⏳" : "✅"}
                </p>
                <p className={`text-[9px] font-bold mt-0.5 ${textCls}`}>
                  {pf.isOverdue ? "غائب" : pf.isWarning ? "تحت المراقبة" : "منتظم"}
                </p>
                <p className="text-[9px] text-muted-foreground mt-1 border-t border-border/30 pt-1">
                  {pf.isOverdue
                    ? `منذ ${pf.daysSinceLast} يوم`
                    : pf.avgDays !== null
                    ? `كل ~${pf.avgDays} يوم`
                    : "أول طلب"}
                </p>
              </div>
            </div>

            {/* شريط الـ 30 يوم */}
            {pf.daysSinceLast <= 60 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-muted-foreground">منذ آخر شراء</span>
                  <span className="text-[9px] text-muted-foreground">حد التنبيه (30 يوم)</span>
                </div>
                <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min((pf.daysSinceLast / 30) * 100, 100)}%`,
                      background: pf.isOverdue ? "#e24b4a" : pf.isWarning ? "#f59e0b" : "#10b981",
                    }}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
                  {pf.isOverdue
                    ? `⚠️ تجاوز حد التنبيه بـ ${pf.daysSinceLast - 30} يوم — يُنصح بالتواصل مع العميل`
                    : pf.isWarning
                    ? `متبقي ${30 - pf.daysSinceLast} يوم على حد التنبيه`
                    : `العميل نشيط — متبقي ${30 - pf.daysSinceLast} يوم على حد التنبيه`}
                </p>
              </div>
            )}
          </Card>
        );
      })()}

      </div>
      )}
      {/* ══════════════════════════ نهاية تاب الداشبورد ══════════════════════════ */}

      {/* ─── Tab: البيانات (فواتير البيع + بيانات الحساب) ─── */}
      {activeTab === "data" && (
        <div className="pt-3 space-y-4">

          {/* ── بيان حساب العميل المفتوح/المغلق ── */}
          <Card className="border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                className="flex-1 h-8 text-xs gap-1 border-border text-muted-foreground justify-start"
              >
                <FileText className="w-3.5 h-3.5" />
                بيانات حساب العميل
                {manifests && <Badge variant="outline" className="text-[9px] mr-1">{manifests.length}</Badge>}
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold shrink-0"
                onClick={handleNewManifestClick}
              >
                <PackagePlus className="w-3.5 h-3.5" />بيان جديد
              </Button>
            </div>

            {openManifest && (
              <p className="text-[10px] text-amber-400 mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                يوجد بيان مفتوح حالياً: {openManifest.manifestNumber} — {openManifest.shipmentCount} شحنة. يجب تقفيله أولاً قبل إنشاء بيان جديد.
              </p>
            )}

            {manifestsLoading ? (
              <p className="text-xs text-muted-foreground text-center py-3">جاري التحميل...</p>
            ) : manifests && manifests.length > 0 ? (
              <div className="mt-3 space-y-4 pt-3 border-t border-border">
                {adminOpenManifest && (
                  <AdminOpenManifestCard manifest={adminOpenManifest} clientId={clientId} qc={qc} />
                )}

                {adminRecentlyClosedManifests.length > 0 && (
                  <div className="space-y-2.5">
                    {adminRecentlyClosedManifests.map((m) => (
                      <AdminRecentlyClosedManifestCard key={m.id} manifest={m} clientId={clientId} qc={qc} />
                    ))}
                  </div>
                )}

                {adminArchivedManifests.length > 0 && (
                  <div className="space-y-3">
                    {(adminOpenManifest || adminRecentlyClosedManifests.length > 0) && (
                      <p className="text-xs font-bold text-muted-foreground/70 pt-1">البيانات المغلقة</p>
                    )}
                    {adminArchivedManifests.map((m) => (
                      <AdminArchivedManifestCard key={m.id} manifest={m} clientId={clientId} qc={qc} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">لا توجد بيانات حساب بعد</p>
            )}
          </Card>

          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />قيد التجهيز: {processingOrders.length}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />تم التسليم: {deliveredOrders.length}
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm animate-pulse">جاري التحميل...</div>
          ) : (processingOrders.length + deliveredOrders.length) === 0 ? (
            <div className="py-16 text-center">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground text-sm">لا توجد فواتير بيع بعد</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* قيد التجهيز */}
              {processingOrders.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider px-1">
                    قيد التجهيز — تحتاج متابعة
                  </p>
                  {processingOrders.map(o => (
                    <InvoiceCard key={o.id} order={o} isLatest={o.id === latestProcessingId} />
                  ))}
                  {deliveredOrders.length > 0 && <div className="border-t border-border my-3" />}
                </>
              )}
              {/* تم التسليم */}
              {deliveredOrders.length > 0 && (
                <>
                  {processingOrders.length > 0 && (
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                      تم التسليم — مكتمل
                    </p>
                  )}
                  {deliveredOrders.map(o => (
                    <InvoiceCard key={o.id} order={o} isLatest={false} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: الشحنات — نفس تصميم كروت الشحنات في shipping-company-detail ─── */}
      {activeTab === "shipments" && (
        <div className="pt-3">
          {clientShipments.length === 0 ? (
            <div className="py-16 text-center">
              <Send className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground text-sm">لا توجد شحنات مرتبطة بهذا العميل</p>
            </div>
          ) : (
            <div className="space-y-2">
              {clientShipments.map((s) => {
                const statusColors: Record<string, string> = {
                  waiting:           "border-amber-700 bg-amber-900/20 text-amber-400",
                  confirmed:         "border-blue-700 bg-blue-900/20 text-blue-400",
                  picked_up:         "border-indigo-700 bg-indigo-900/20 text-indigo-400",
                  warehouse_ready:   "border-purple-700 bg-purple-900/20 text-purple-400",
                  in_transit:        "border-cyan-700 bg-cyan-900/20 text-cyan-400",
                  in_shipping:       "border-cyan-700 bg-cyan-900/20 text-cyan-400",
                  out_for_delivery:  "border-sky-700 bg-sky-900/20 text-sky-400",
                  delivered:         "border-emerald-700 bg-emerald-900/20 text-emerald-400",
                  received:          "border-emerald-700 bg-emerald-900/20 text-emerald-400",
                  partial_received:  "border-teal-700 bg-teal-900/20 text-teal-400",
                  delayed:           "border-violet-700 bg-violet-900/20 text-violet-400",
                  returned:          "border-red-700 bg-red-900/20 text-red-400",
                  cancelled:         "border-red-700 bg-red-900/20 text-red-400",
                };
                const statusLabels: Record<string, string> = {
                  waiting: "انتظار", confirmed: "مؤكد", picked_up: "تم الاستلام",
                  warehouse_ready: "جاهز", in_transit: "قيد الشحن", in_shipping: "في الشحن",
                  out_for_delivery: "خرج للتسليم", delivered: "مسلَّم", received: "مستلم",
                  partial_received: "استلام جزئي", delayed: "مؤجل",
                  returned: "مرتجع", cancelled: "ملغي",
                };
                const colorClass = statusColors[s.status] ?? "border-border bg-card text-muted-foreground";
                return (
                  <Link key={s.id} href={`/finance/client-shipment/${s.id}`}>
                    <div className="group flex items-stretch gap-0 hover:bg-muted/10 transition-colors cursor-pointer rounded-lg border border-border bg-card/50">
                      <div className={`w-1 rounded-r-lg shrink-0 ${
                        s.status === "delivered" || s.status === "received" ? "bg-emerald-500"
                        : s.status === "returned" || s.status === "cancelled" ? "bg-red-500"
                        : "bg-blue-500"
                      }`} />
                      <div className="flex-1 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm">{s.shipmentNumber}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <User className="w-2.5 h-2.5" />{s.receiverName}
                              </span>
                              {s.receiverCity && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5" />{s.receiverCity}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="w-2.5 h-2.5" />
                                {format(new Date(s.createdAt), "yyyy/MM/dd")}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className={`text-[9px] font-bold border ${colorClass}`}>
                              {statusLabels[s.status] ?? s.status}
                            </Badge>
                            {s.codAmount && Number(s.codAmount) > 0 && (
                              <span className="text-xs font-bold text-primary">{fmt(s.codAmount)} ج.م</span>
                            )}
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════ Tab: المرتجعات ══════════════════════════ */}
      {activeTab === "returns" && (
        <ReturnsTabContent shipments={clientShipments} clientId={clientId} />
      )}

      {/* ─── Dialog: إنشاء بيان جديد ─── */}
      {showNewManifest && client && (
        <CreateSaleOrderManifestDialog
          clientId={clientId}
          clientName={client.name}
          onClose={() => setShowNewManifest(false)}
          onCreated={(manifest) => {
            qc.invalidateQueries({ queryKey: ["client-account-manifests", clientId] });
            setShowNewManifest(false);
            navigate(`/finance/client-account-sheet/manifest/${manifest.id}`);
          }}
        />
      )}

      {/* ─── AlertDialog: تحذير وجود بيان مفتوح ─── */}
      <AlertDialog open={showOpenManifestWarning} onOpenChange={setShowOpenManifestWarning}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">يوجد بيان مفتوح بالفعل</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              يوجد بيان حساب مفتوح حالياً{openManifest ? ` (${openManifest.manifestNumber})` : ""}. يجب إغلاقه أولاً قبل إنشاء بيان جديد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowOpenManifestWarning(false)}>حسناً</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Dialog: كشف حساب العميل ─── */}
      {activeTab === "statement" && client && (
        <ClientStatementDialog
          client={client}
          clientId={clientId}
          orders={allOrders}
          from={statementFrom}
          to={statementTo}
          onFromChange={setStatementFrom}
          onToChange={setStatementTo}
          onClose={() => setActiveTab("dashboard")}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ─── ReturnsTabContent — تبويب المرتجعات: تم تسليمها / لم تُسلَّم بعد ──────
// ════════════════════════════════════════════════════════════════════════════
function ReturnsTabContent({ shipments, clientId }: { shipments: ClientShipment[]; clientId: number }) {
  // مرتجع كامل (status = returned) + المرتجع بتاع الاستلام الجزئي فقط (partial_delivered)
  // partial_received لوحدها مش مرتجع — لسه استلام جزئي عادي جاري، مفيهوش استرجاع مسجل
  const allReturns = useMemo(
    () => shipments.filter(s =>
      s.status === "returned" ||
      s.manifestDeliveryStatus === "partial_delivered"
    ),
    [shipments]
  );
  const receivedReturns = useMemo(
    () => allReturns.filter(s => s.manifestReturnReceived === 1),
    [allReturns]
  );
  const pendingReturns = useMemo(
    () => allReturns.filter(s => s.manifestReturnReceived !== 1),
    [allReturns]
  );
  const [filterMode, setFilterMode] = useState<"all" | "pending" | "received" | "manifests">("all");
  const showPending  = filterMode === "all" || filterMode === "pending";
  const showReceived = filterMode === "all" || filterMode === "received";
  const [receivedSearch, setReceivedSearch] = useState("");

  const filteredReceivedReturns = useMemo(() => {
    const q = receivedSearch.trim().replace(/\D/g, "");
    if (!q) return receivedReturns;
    return receivedReturns.filter(s => (s.receiverPhone ?? "").replace(/\D/g, "").includes(q));
  }, [receivedReturns, receivedSearch]);

  return (
    <div className="space-y-5 pt-1">

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card
          className={`card-glow border-border p-3 text-center cursor-pointer transition-all ${filterMode === "all" ? "ring-2 ring-primary" : ""}`}
          style={GLOW.neutral.style}
          onClick={() => setFilterMode("all")}
        >
          <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي المرتجعات</p>
          <p className="text-xl font-black">{allReturns.length}</p>
        </Card>
        <Card
          className={`card-glow border-emerald-800/50 p-3 text-center cursor-pointer transition-all ${filterMode === "received" ? "ring-2 ring-emerald-500" : ""}`}
          style={GLOW.emerald.style}
          onClick={() => setFilterMode(m => m === "received" ? "all" : "received")}
        >
          <p className="text-[10px] text-muted-foreground mb-0.5">تم تسليمها للعميل</p>
          <p className="text-xl font-black text-emerald-400">{receivedReturns.length}</p>
        </Card>
        <Card
          className={`card-glow border-red-800/50 p-3 text-center cursor-pointer transition-all ${filterMode === "pending" ? "ring-2 ring-red-500" : ""}`}
          style={GLOW.red.style}
          onClick={() => setFilterMode(m => m === "pending" ? "all" : "pending")}
        >
          <p className="text-[10px] text-muted-foreground mb-0.5">لم يتم تسليمها بعد</p>
          <p className="text-xl font-black text-red-400">{pendingReturns.length}</p>
        </Card>
        <Card
          className={`card-glow border-sky-800/50 p-3 text-center cursor-pointer transition-all ${filterMode === "manifests" ? "ring-2 ring-sky-500" : ""}`}
          style={GLOW.neutral.style}
          onClick={() => setFilterMode(m => m === "manifests" ? "all" : "manifests")}
        >
          <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
            <ClipboardList className="w-3 h-3" /> بيانات المرتجعات
          </p>
          <p className="text-xl font-black text-sky-400">📋</p>
        </Card>
      </div>

      {/* ─── قسم: بضاعة لسه عند شركة الشحن (لم تُسلَّم) ─── */}
      {showPending && pendingReturns.length > 0 && (
        <div
          className="rounded-xl border-2 border-red-500/70 bg-red-950/30 p-4"
          style={{ boxShadow: "0 0 30px 6px rgba(239,68,68,0.4), 0 0 60px 10px rgba(239,68,68,0.15), inset 0 0 20px 2px rgba(239,68,68,0.05)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🚚</span>
            <h2 className="font-bold text-sm text-red-400">
              بضاعة لسه عند مندوب الشحن ({pendingReturns.length})
            </h2>
            <span className="text-[10px] text-red-400/60">— اضغط "تم الاستلام" لما توصلك من الشركة</span>
          </div>
          <div className="flex flex-col gap-2">
            {pendingReturns.map(s => (
              <ReturnShipmentRow key={s.id} s={s} clientId={clientId} />
            ))}
          </div>
        </div>
      )}

      {/* ─── قسم: مرتجعات تم تسليمها للعميل ─── */}
      {showReceived && receivedReturns.length > 0 && (
        <div
          className="rounded-xl border-2 border-emerald-500/70 bg-emerald-950/30 p-4"
          style={{ boxShadow: "0 0 30px 6px rgba(16,185,129,0.35), 0 0 60px 10px rgba(16,185,129,0.12), inset 0 0 20px 2px rgba(16,185,129,0.05)" }}
        >
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <PackageCheck className="w-4 h-4 text-emerald-400" />
            <h2 className="font-bold text-sm text-emerald-400">
              مرتجعات تم تسليمها للعميل ({filteredReceivedReturns.length})
            </h2>
            <div className="relative flex-1 min-w-[160px] max-w-xs mr-auto">
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={receivedSearch}
                onChange={e => setReceivedSearch(e.target.value)}
                placeholder="بحث برقم التليفون..."
                className="w-full text-[11px] bg-background/50 border border-emerald-800/40 rounded-lg pr-8 pl-2 py-1.5 outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {filteredReceivedReturns.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">لا توجد نتائج مطابقة للبحث</div>
            ) : filteredReceivedReturns.map(s => (
              <div
                key={s.id}
                className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-lg border border-emerald-800/30 bg-emerald-950/30 px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-xs truncate text-foreground">{s.receiverName}</span>
                    {s.manifestDeliveryStatus === "partial_delivered" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-teal-900/40 text-teal-400">مرتجع عن استلام جزئي</span>
                    )}
                    {s.receiverPhone && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Phone className="w-3 h-3" />{s.receiverPhone}
                      </span>
                    )}
                    {s.receiverCity && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin className="w-3 h-3" />{s.receiverCity}
                      </span>
                    )}
                  </div>
                  {s.receiverAddress && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.receiverAddress}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {s.shipmentNumber}
                    {s.manifestNumber && <span className="text-muted-foreground/70"> — بيان: {s.manifestNumber}</span>}
                  </p>
                  {s.returnReason && (
                    <p className="text-[10px] font-semibold text-emerald-400/80 mt-0.5">{returnReasonLabel(s.returnReason)}</p>
                  )}
                  {s.manifestPartialQty != null && s.manifestDeliveryStatus === "partial_delivered" && (
                    <p className="text-[10px] font-semibold text-teal-400/80 mt-0.5">
                      الكمية المرتجعة من الاستلام الجزئي: {s.manifestPartialQty}
                    </p>
                  )}
                </div>
                <div className="text-left shrink-0 flex items-center gap-2">
                  <div>
                    <p className="font-bold text-xs text-primary">{formatCurrency(parseFloat(s.codAmount ?? "0"))}</p>
                    <p className="text-[10px] text-muted-foreground">{format(new Date(s.createdAt), "yyyy/MM/dd")}</p>
                  </div>
                  <span className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-600 bg-emerald-900/40 text-emerald-300 text-[10px] font-bold">
                    ✅ تم الاستلام
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── قسم: بيانات المرتجعات (كل البيانات، مفتوحة ومغلقة) ─── */}
      {filterMode === "manifests" && (
        <ReturnManifestsListSection clientId={clientId} />
      )}

      {receivedReturns.length === 0 && pendingReturns.length === 0 && (
        <div className="py-10 text-center text-xs text-muted-foreground">لا توجد مرتجعات لهذا العميل حتى الآن</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ReturnManifestsListSection — قايمة كل بيانات المرتجعات (مفتوحة ومغلقة)
// بحث برقم البيان + فتح تفاصيل أي بيان (تاريخ، مندوب، ملاحظات، المرتجعات)
// ════════════════════════════════════════════════════════════════════════════
function ReturnManifestsListSection({ clientId }: { clientId: number }) {
  const [search, setSearch] = useState("");
  const [openManifestId, setOpenManifestId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-return-manifests", clientId],
    queryFn: () => clientReturnManifestsApi.list(clientId),
  });

  const manifests = data?.manifests ?? [];
  const closedManifests = useMemo(() => manifests.filter(m => m.status !== "open"), [manifests]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return closedManifests;
    return closedManifests.filter(m => m.manifestNumber.toLowerCase().includes(q));
  }, [closedManifests, search]);

  return (
    <div className="space-y-4">
      <ReturnOpenManifestCard clientId={clientId} />

      <div className="rounded-xl border-2 border-sky-500/50 bg-sky-950/10 p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <ClipboardList className="w-4 h-4 text-sky-400" />
        <h2 className="font-bold text-sm text-sky-400">البيانات المغلقة ({filtered.length})</h2>
        <div className="relative flex-1 min-w-[160px] max-w-xs mr-auto">
          <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم البيان..."
            className="w-full text-[11px] bg-background/50 border border-sky-800/40 rounded-lg pr-8 pl-2 py-1.5 outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          {search ? "لا توجد بيانات مطابقة للبحث" : "لا توجد بيانات مرتجعات مغلقة بعد"}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(m => (
            <ReturnManifestListRow
              key={m.id}
              manifest={m}
              isOpen={openManifestId === m.id}
              onToggle={() => setOpenManifestId(id => id === m.id ? null : m.id)}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

// ─── صف بيان واحد داخل قايمة "بيانات المرتجعات" — قابل للفتح لعرض التفاصيل ───
function ReturnManifestListRow({ manifest, isOpen, onToggle }: {
  manifest: ClientReturnManifestListItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [, navigate] = useLocation();

  return (
    <button
      type="button"
      onClick={() => navigate(`/finance/return-manifest/${manifest.id}`)}
      className="group w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-card/50 hover:bg-muted/30 hover:border-primary/40 transition-colors text-right"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          manifest.status === "open" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
        )}>
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0 text-right">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xs truncate">{manifest.manifestNumber}</span>
            {manifest.status === "open" ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 bg-emerald-900/30 text-emerald-400 border border-emerald-800">
                <LockOpen className="w-2.5 h-2.5" /> مفتوح
              </span>
            ) : (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 bg-muted text-muted-foreground border border-border">
                <Lock className="w-2.5 h-2.5" /> مغلق
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}
            {manifest.itemsCount != null && ` — ${manifest.itemsCount} مرتجع`}
          </p>
        </div>
      </div>
      <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground group-hover:text-primary shrink-0 transition-colors">
        عرض التفاصيل <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
      </span>
    </button>
  );
}
// ════════════════════════════════════════════════════════════════════════════
// ReturnOpenManifestCard — كارت بيان المرتجعات المفتوح، مدمج داخل الصفحة
// نفس شكل AdminOpenManifestCard (تاب البيانات) — كارت ملخّص + رابط لصفحة التفاصيل المستقلة
// ════════════════════════════════════════════════════════════════════════════
function ReturnOpenManifestCard({ clientId }: { clientId: number }) {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["client-return-manifests", clientId],
    queryFn: () => clientReturnManifestsApi.list(clientId),
  });

  const openManifest = data?.manifests?.find(m => m.status === "open") ?? null;

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["client-return-manifest-detail", openManifest?.id],
    queryFn: () => clientReturnManifestsApi.get(openManifest!.id),
    enabled: !!openManifest,
  });

  const items = detail?.items ?? [];
  const totalCod = items.reduce((sum, it) => sum + parseFloat(it.codAmount ?? "0"), 0);

  if (isLoading || detailLoading) {
    return (
      <div className="rounded-2xl border border-border bg-muted/20 p-5 text-center text-xs text-muted-foreground animate-pulse">
        جاري تحميل بيان المرتجعات...
      </div>
    );
  }

  if (!openManifest) {
    return (
      <div className="rounded-2xl border border-border bg-muted/20 p-5 text-center text-xs text-muted-foreground">
        لا يوجد بيان مرتجعات مفتوح حاليًا — سيتم إنشاء بيان جديد تلقائيًا أول ما يتم تسليم مرتجع للعميل.
      </div>
    );
  }

  const total = items.length;

  return (
    <button
      type="button"
      onClick={() => navigate(`/finance/return-manifest/${openManifest.id}`)}
      className="group relative overflow-hidden w-full text-right rounded-2xl border border-emerald-700/40 bg-gradient-to-br from-emerald-950/20 via-muted/20 to-transparent hover:border-emerald-600/60 transition-all p-4 sm:p-5"
    >
      <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full blur-3xl opacity-30 bg-emerald-500/30" />

      <div className="relative flex items-center gap-2 mb-3">
        <Hourglass className="w-3.5 h-3.5 text-amber-400 animate-[spin_2.5s_linear_infinite]" />
        <span className="text-[11px] font-bold text-amber-300">
          البيان حالياً قيد العمل — يتم إضافة شحنات العميل عليه
        </span>
      </div>

      <div className="relative flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-sm truncate">{openManifest.manifestNumber}</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-emerald-900/30 text-emerald-400 border border-emerald-800">
                <LockOpen className="w-2.5 h-2.5" /> مفتوح
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {format(new Date(openManifest.createdAt), "d MMMM yyyy", { locale: ar })}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-bold text-primary shrink-0">
          عرض التفاصيل <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        </span>
      </div>

      <div className="relative grid grid-cols-2 gap-2">
        <AdminManifestMiniStat icon={CheckCircle2} value={total} label="عدد المرتجعات في البيان" tone="emerald" />
        <AdminManifestMiniStat icon={Package} value={Number(totalCod.toFixed(0))} label="إجمالي القيمة (ج.م)" />
      </div>
    </button>
  );
}

// ─── صف شحنة مرتجعة لسه عند شركة الشحن — بزرارين تفاعليين ─────────────────
function ReturnShipmentRow({ s, clientId }: { s: ClientShipment; clientId: number }) {
  const isPartial = s.manifestDeliveryStatus === "partial_delivered";
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-lg border border-red-800/30 bg-red-950/30 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-xs truncate text-foreground">{s.receiverName}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isPartial ? "bg-teal-900/40 text-teal-400" : "bg-red-900/40 text-red-400"}`}>
            {isPartial ? "مرتجع عن استلام جزئي" : "مرتجع"}
          </span>
          {s.receiverPhone && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Phone className="w-3 h-3" />{s.receiverPhone}
            </span>
          )}
          {s.receiverCity && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="w-3 h-3" />{s.receiverCity}
            </span>
          )}
        </div>
        {s.receiverAddress && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.receiverAddress}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {s.shipmentNumber}
          {s.manifestNumber && <span className="text-muted-foreground/70"> — بيان: {s.manifestNumber}</span>}
        </p>
        {s.returnReason && (
          <p className="text-[10px] font-semibold text-red-400 mt-0.5">{returnReasonLabel(s.returnReason)}</p>
        )}
        {isPartial && s.manifestPartialQty != null && (
          <p className="text-[10px] font-semibold text-teal-400 mt-0.5">
            الكمية المرتجعة من الاستلام الجزئي: {Math.max(0, (s.pieces ?? 0) - s.manifestPartialQty)} من {s.pieces ?? "-"}
          </p>
        )}
      </div>
      <div className="flex gap-1.5 w-full sm:w-auto sm:shrink-0">
        {s.manifestId ? (
          <SimpleReturnReceivedButton shipment={s} clientId={clientId} />
        ) : (
          <span className="text-[10px] text-muted-foreground px-2">غير مرتبط ببيان</span>
        )}
      </div>
    </div>
  );
}

// ─── زرار "تم الاستلام" (= تأكيد تسليم المرتجع للعميل) ─────────────────────
// دوسة الزرار = ترحيل المرتجع لبيان مرتجعات مفتوح + وضع علامة returnReceived=1
// على بند البيان الأصلي (يختفي من "لم يتم تسليمها بعد").
function SimpleReturnReceivedButton({ shipment, clientId }: { shipment: ClientShipment; clientId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => clientReturnManifestsApi.confirmDelivery(clientId, shipment.id),
    onSuccess: () => {
      toast({ title: "تم تسليم المرتجع للعميل ✅", description: "تم ترحيله لبيان المرتجعات المفتوح" });
      qc.invalidateQueries({ queryKey: ["client-shipments"] });
      qc.invalidateQueries({ queryKey: ["client-return-manifests"] });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={mutation.isPending}
        className="flex flex-1 sm:flex-initial flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all min-w-[72px] border-border text-muted-foreground hover:border-emerald-700 hover:text-emerald-400 hover:bg-emerald-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="text-sm">✅</span>
        <span>تم الاستلام</span>
      </button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تسليم المرتجع للعميل</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من تسليم مرتجع الشحنة <strong>{shipment.shipmentNumber}</strong> ({shipment.receiverName}) للعميل؟
              <br />سيتم ترحيله لبيان المرتجعات المفتوح الخاص بالعميل.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>لا، تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-700 text-white hover:bg-emerald-600"
              onClick={() => { setConfirmOpen(false); mutation.mutate(); }}
            >
              نعم، تم التسليم
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ─── ClientStatementDialog — كشف حساب تفاعلي بفلترة تاريخ ──────────────────
// ════════════════════════════════════════════════════════════════════════════
type StatementTxn = {
  type: "manifest" | "payment" | "sale_order";
  date: string;
  label: string;
  amount: number;
  direction: "due" | "paid";
  refId: number;
  runningBalance: number;
};

function ClientStatementDialog({ client, clientId, orders, from, to, onFromChange, onToChange, onClose }: {
  client: Client;
  clientId: number;
  orders: SaleOrder[];
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClose: () => void;
}) {
  const [exporting, setExporting] = useState<"excel" | null>(null);

  // ── كشف الحساب الموحّد: بيانات مغلقة (شحن) + سدادات + أوامر بيع ──
  // نفس الرقم بالظبط اللي بيظهر في كارت "رصيد العميل" بالداشبورد (endpoint مشترك).
  const { data: statementData, isLoading: statementLoading } = useQuery<{
    transactions: StatementTxn[];
    transactionsSummary: { manifestsTotal: number; paymentsTotal: number; saleOrdersTotal: number; saleOrdersPaidTotal: number; netBalance: number };
  }>({
    queryKey: ["client-statement", clientId, from, to],
    queryFn: () => apiFetch(`/finance/clients/${clientId}/statement${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`),
    enabled: !!clientId,
  });
  const transactions = statementData?.transactions ?? [];
  const txnSummary = statementData?.transactionsSummary;

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const d = new Date(o.createdAt);
      if (from && d < new Date(from)) return false;
      if (to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        if (d > toEnd) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, from, to]);

  const stMap: Record<string, string> = {
    draft: "مسودة", confirmed: "مؤكد", processing: "قيد التجهيز",
    delivered: "مسلَّم", closed: "مغلق",
  };
  const pyLabel = (o: SaleOrder, unpaid: number) =>
    o.paymentStatus === "paid" ? "كامل" : unpaid > 0 && parseFloat(o.paidAmount ?? "0") > 0 ? "جزئي" : "غير مدفوع";
  const pyColorClass = (o: SaleOrder, unpaid: number) =>
    o.paymentStatus === "paid"
      ? "border-emerald-700 bg-emerald-900/20 text-emerald-400"
      : unpaid > 0 && parseFloat(o.paidAmount ?? "0") > 0
      ? "border-amber-700 bg-amber-900/20 text-amber-400"
      : "border-red-700 bg-red-900/20 text-red-400";

  let totalAmount = 0, totalPaid = 0;
  filtered.forEach(o => {
    const t = parseFloat(o.totalAmount ?? "0");
    const p = o.paymentStatus === "paid" ? t : parseFloat(o.paidAmount ?? "0");
    totalAmount += t; totalPaid += p;
  });
  const totalUnpaid = Math.max(0, totalAmount - totalPaid);

  const handlePrint = () => {
    const rangeLabel = from || to
      ? `الفترة من ${from ? format(new Date(from), "yyyy/MM/dd") : "بداية التعاملات"} إلى ${to ? format(new Date(to), "yyyy/MM/dd") : "تاريخه"}`
      : "كافة الفترات";

    // ── نفس البيانات الظاهرة فعليًا على الشاشة: الحركة المالية الموحّدة ──
    const mustaqSum   = (txnSummary?.manifestsTotal ?? 0) + (txnSummary?.saleOrdersTotal ?? totalAmount);
    const paidSum     = (txnSummary?.paymentsTotal ?? 0) + (txnSummary?.saleOrdersPaidTotal ?? totalPaid);
    const netBalance  = txnSummary?.netBalance ?? totalUnpaid;

    const rows = transactions.map((t, i) => `
        <tr>
          <td class="c-idx">${i + 1}</td>
          <td>${format(new Date(t.date), "yyyy/MM/dd")}</td>
          <td class="c-label">${t.label}</td>
          <td class="c-num ${t.direction === "paid" ? "pos" : ""}">${t.direction === "paid" ? "−" : "+"}${fmt(t.amount)}</td>
          <td class="c-num ${t.runningBalance > 0 ? "neg" : "pos"}">${fmt(Math.abs(t.runningBalance))}</td>
        </tr>`).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8">
<title>كشف حساب — ${client.name}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Cairo","Tahoma",Arial,sans-serif; color: #1e293b; background:#fff; font-size: 12px; line-height: 1.5; }

  .letterhead { display:flex; align-items:center; justify-content:space-between; border-bottom: 3px solid #1e3a5f; padding-bottom: 14px; margin-bottom: 18px; }
  .company-name { font-size: 22px; font-weight: 900; color:#1e3a5f; letter-spacing: .5px; }
  .company-sub  { font-size: 10px; color:#64748b; margin-top: 2px; }
  .doc-badge { text-align:left; }
  .doc-badge .doc-title { font-size: 15px; font-weight:900; color:#fff; background:#1e3a5f; padding:6px 16px; border-radius: 4px; display:inline-block; }
  .doc-badge .doc-date  { font-size: 9px; color:#64748b; margin-top:6px; }

  .info-bar { display:flex; justify-content:space-between; gap: 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding: 10px 16px; margin-bottom: 18px; }
  .info-item .lbl { font-size: 9px; color:#94a3b8; font-weight:700; }
  .info-item .val { font-size: 13px; color:#1e293b; font-weight:800; margin-top:2px; }

  .summary { display:grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px; }
  .stat { border-radius: 6px; padding: 12px 8px; text-align:center; border: 1px solid; }
  .stat .lbl { font-size: 9.5px; font-weight:700; margin-bottom: 4px; }
  .stat .val { font-size: 17px; font-weight:900; }
  .stat.blue    { background:#eff6ff; border-color:#bfdbfe; } .stat.blue .lbl,.stat.blue .val{color:#1d4ed8;}
  .stat.green   { background:#ecfdf5; border-color:#a7f3d0; } .stat.green .lbl,.stat.green .val{color:#047857;}
  .stat.amber   { background:#fffbeb; border-color:#fde68a; } .stat.amber .lbl,.stat.amber .val{color:#b45309;}
  .stat.red     { background:#fef2f2; border-color:#fecaca; } .stat.red .lbl,.stat.red .val{color:#b91c1c;}

  table { width:100%; border-collapse: collapse; }
  thead th { background:#1e3a5f; color:#fff; font-size:10.5px; font-weight:800; padding: 9px 6px; text-align:center; border: 1px solid #1e3a5f; }
  tbody td { padding: 7px 6px; text-align:center; font-size: 11px; border: 1px solid #e2e8f0; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  .c-idx { color:#94a3b8; font-size:10px; width: 26px; }
  .c-num { font-variant-numeric: tabular-nums; font-weight:700; }
  .c-label { text-align:right; }
  td.pos { color:#059669; }
  td.neg { color:#dc2626; font-weight:900; }

  .net-bar { display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 16px; margin-bottom:14px; }
  .net-bar .lbl { font-size:11px; font-weight:800; color:#64748b; }
  .net-bar .val { font-size:16px; font-weight:900; }
  .net-bar .val.due { color:#b91c1c; }
  .net-bar .val.credit { color:#047857; }

  tfoot td { background:#1e3a5f; color:#fff; font-weight:900; font-size:12px; padding:10px 6px; border:1px solid #1e3a5f; }
  tfoot td.neg-total { background:#b91c1c; }

  .empty-row td { padding: 30px; color:#94a3b8; font-size:12px; }

  .footer { display:flex; justify-content:space-between; margin-top: 40px; padding-top: 16px; }
  .sig { text-align:center; width: 180px; }
  .sig .line { border-top: 1px solid #94a3b8; margin-top: 34px; padding-top: 4px; font-size: 10px; color:#64748b; }
  .stamp-note { font-size: 9px; color:#94a3b8; text-align:center; margin-top: 26px; }
</style></head>
<body>
  <div class="letterhead">
    <div>
      <div class="company-name">Stark Vector</div>
      <div class="company-sub">إدارة الشحن والخدمات اللوجستية</div>
    </div>
    <div class="doc-badge">
      <span class="doc-title">كشف حساب عميل</span>
      <div class="doc-date">تاريخ الإصدار: ${format(new Date(), "yyyy/MM/dd — HH:mm")}</div>
    </div>
  </div>

  <div class="info-bar">
    <div class="info-item">
      <div class="lbl">اسم العميل</div>
      <div class="val">${client.name}</div>
    </div>
    ${client.phone ? `<div class="info-item"><div class="lbl">رقم الهاتف</div><div class="val">${client.phone}</div></div>` : ""}
    <div class="info-item">
      <div class="lbl">الفترة</div>
      <div class="val">${rangeLabel}</div>
    </div>
  </div>

  <div class="summary">
    <div class="stat blue"><div class="lbl">عدد الحركات</div><div class="val">${transactions.length}</div></div>
    <div class="stat amber"><div class="lbl">إجمالي المستحق</div><div class="val">${fmt(mustaqSum)}</div></div>
    <div class="stat green"><div class="lbl">المدفوع</div><div class="val">${fmt(paidSum)}</div></div>
    <div class="stat red"><div class="lbl">المتبقي</div><div class="val">${fmt(netBalance)}</div></div>
  </div>

  <div class="net-bar">
    <span class="lbl">الرصيد الصافي</span>
    <span class="val ${netBalance > 0 ? "due" : "credit"}">${fmt(Math.abs(netBalance))} ج.م ${netBalance > 0 ? "(مستحق)" : netBalance < 0 ? "(له)" : ""}</span>
  </div>

  <table>
    <thead>
      <tr>
        <th>م</th><th>التاريخ</th><th>الحركة</th>
        <th>المبلغ</th><th>الرصيد بعدها</th>
      </tr>
    </thead>
    <tbody>
      ${transactions.length ? rows : `<tr class="empty-row"><td colspan="5">لا توجد حركات مالية مسجّلة لهذا العميل حتى الآن</td></tr>`}
    </tbody>
    ${transactions.length ? `
    <tfoot>
      <tr>
        <td colspan="3">الرصيد الصافي</td>
        <td colspan="2" class="${netBalance > 0 ? "neg-total" : ""}">${fmt(Math.abs(netBalance))} ج.م ${netBalance > 0 ? "(مستحق)" : netBalance < 0 ? "(له)" : ""}</td>
      </tr>
    </tfoot>` : ""}
  </table>

  <div class="footer">
    <div class="sig"><div class="line">توقيع المسؤول</div></div>
    <div class="sig"><div class="line">توقيع العميل</div></div>
  </div>
  <p class="stamp-note">هذا الكشف صادر إلكترونياً من نظام Stark Vector ولا يحتاج توقيعاً لاعتماده داخلياً.</p>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.onload = () => win.print();
    }
  };

  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Stark Vector";
      wb.created = new Date();
      const ws = wb.addWorksheet("كشف الحساب", {
        views: [{ rightToLeft: true, showGridLines: false }],
      });

      // ── ألوان الشركة (هوية موحّدة، هادئة، مناسبة للطباعة) ──
      const NAVY   = "FF1E3A5F"; // هيدر أساسي
      const NAVY_D = "FF162B47"; // خط حدود الهيدر
      const INK    = "FF1E293B"; // نص أساسي
      const MUTED  = "FF64748B"; // نص ثانوي
      const LINE   = "FFD9DEE7"; // خطوط الجدول
      const ROW_ALT= "FFF4F7FB"; // صف متبدل
      const GREEN  = "FF047857"; const GREEN_BG = "FFECFDF5"; const GREEN_BR = "FFA7F3D0";
      const AMBER  = "FFB45309"; const AMBER_BG = "FFFFFBEB"; const AMBER_BR = "FFFDE68A";
      const RED    = "FFB91C1C"; const RED_BG   = "FFFEF2F2"; const RED_BR   = "FFFECACA";
      const BLUE   = "FF1D4ED8"; const BLUE_BG  = "FFEFF6FF"; const BLUE_BR  = "FFBFDBFE";

      const thin = (color: string) => ({ style: "thin" as const, color: { argb: color } });
      const bAll = (cell: any, color = LINE) => {
        cell.border = { top: thin(color), left: thin(color), bottom: thin(color), right: thin(color) };
      };

      ws.columns = [
        { key: "idx", width: 6 }, { key: "date", width: 14 }, { key: "label", width: 34 },
        { key: "amount", width: 18 }, { key: "balance", width: 18 },
        { key: "col6", width: 8 }, { key: "col7", width: 8 },
      ];

      // ══ سطر 1-2: هيدر الشركة ══
      ws.mergeCells("A1:D2");
      const cName = ws.getCell("A1");
      cName.value = "Stark Vector";
      cName.font = { name: "Arial", size: 20, bold: true, color: { argb: NAVY } };
      cName.alignment = { horizontal: "right", vertical: "bottom" };

      ws.mergeCells("E1:G1");
      const cDocTitle = ws.getCell("E1");
      cDocTitle.value = "كشف حساب عميل";
      cDocTitle.font = { name: "Arial", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
      cDocTitle.alignment = { horizontal: "center", vertical: "middle" };
      cDocTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      ws.getRow(1).height = 26;

      ws.mergeCells("E2:G2");
      const cDate = ws.getCell("E2");
      cDate.value = `تاريخ الإصدار: ${format(new Date(), "yyyy/MM/dd — HH:mm")}`;
      cDate.font = { name: "Arial", size: 9, color: { argb: MUTED } };
      cDate.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(2).height = 22;

      ws.mergeCells("A3:D3");
      const cSub = ws.getCell("A3");
      cSub.value = "إدارة الشحن والخدمات اللوجستية";
      cSub.font = { name: "Arial", size: 9, color: { argb: MUTED } };
      cSub.alignment = { horizontal: "right", vertical: "top" };
      ws.getRow(3).height = 16;

      // خط فاصل تحت الهيدر
      for (let c = 1; c <= 7; c++) {
        ws.getCell(4, c).border = { bottom: { style: "medium", color: { argb: NAVY } } };
      }
      ws.getRow(4).height = 4;

      // ══ سطر 5-6: بيانات العميل + الفترة ══
      const rangeLabel = from || to
        ? `${from ? format(new Date(from), "yyyy/MM/dd") : "البداية"}  إلى  ${to ? format(new Date(to), "yyyy/MM/dd") : "تاريخه"}`
        : "كافة الفترات";

      ws.mergeCells("A6:B6");
      ws.getCell("A6").value = "اسم العميل:";
      ws.getCell("A6").font = { name: "Arial", size: 9, bold: true, color: { argb: MUTED } };
      ws.getCell("A6").alignment = { horizontal: "right" };
      ws.mergeCells("C6:D6");
      ws.getCell("C6").value = client.name;
      ws.getCell("C6").font = { name: "Arial", size: 11, bold: true, color: { argb: INK } };
      ws.getCell("C6").alignment = { horizontal: "right" };

      ws.mergeCells("E6:E6");
      ws.getCell("E6").value = "الفترة:";
      ws.getCell("E6").font = { name: "Arial", size: 9, bold: true, color: { argb: MUTED } };
      ws.getCell("E6").alignment = { horizontal: "right" };
      ws.mergeCells("F6:G6");
      ws.getCell("F6").value = rangeLabel;
      ws.getCell("F6").font = { name: "Arial", size: 10, bold: true, color: { argb: INK } };
      ws.getCell("F6").alignment = { horizontal: "right" };
      ws.getRow(6).height = 20;

      if (client.phone) {
        ws.mergeCells("A7:B7");
        ws.getCell("A7").value = "رقم الهاتف:";
        ws.getCell("A7").font = { name: "Arial", size: 9, bold: true, color: { argb: MUTED } };
        ws.getCell("A7").alignment = { horizontal: "right" };
        ws.mergeCells("C7:D7");
        ws.getCell("C7").value = client.phone;
        ws.getCell("C7").font = { name: "Arial", size: 10, color: { argb: INK } };
        ws.getCell("C7").alignment = { horizontal: "right" };
        ws.getRow(7).height = 18;
      }
      ws.getRow(8).height = 10;

      // ── نفس البيانات الظاهرة فعليًا على الشاشة: الحركة المالية الموحّدة ──
      const mustaqSum   = (txnSummary?.manifestsTotal ?? 0) + (txnSummary?.saleOrdersTotal ?? totalAmount);
      const paidSum     = (txnSummary?.paymentsTotal ?? 0) + (txnSummary?.saleOrdersPaidTotal ?? totalPaid);
      const netBalance  = txnSummary?.netBalance ?? totalUnpaid;

      // ══ سطر 9-10: بطاقات الملخص ══
      const smLabels = ["عدد الحركات", "إجمالي المستحق", "المدفوع", "المتبقي"];
      const smVals   = [transactions.length, mustaqSum, paidSum, netBalance];
      const smFmts   = ['#,##0', '#,##0" ج.م"', '#,##0" ج.م"', '#,##0" ج.م"'];
      const smFG     = [BLUE, AMBER, GREEN, RED];
      const smBG     = [BLUE_BG, AMBER_BG, GREEN_BG, RED_BG];
      const smBR     = [BLUE_BR, AMBER_BR, RED_BR, RED_BR];
      // كل بطاقة تاخد عمود واحد إلا الأخيرة عمودين (G فاضي)
      const smCols   = [["A","A"],["B","C"],["D","E"],["F","G"]];

      smLabels.forEach((lbl, i) => {
        const [c1, c2] = smCols[i];
        if (c1 !== c2) { ws.mergeCells(`${c1}9:${c2}9`); ws.mergeCells(`${c1}10:${c2}10`); }
        const hCell = ws.getCell(`${c1}9`);
        hCell.value = lbl;
        hCell.font = { name: "Arial", size: 9, bold: true, color: { argb: smFG[i] } };
        hCell.alignment = { horizontal: "center", vertical: "middle" };
        hCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: smBG[i] } };
        bAll(hCell, smBR[i]);
        ws.getRow(9).height = 20;

        const vCell = ws.getCell(`${c1}10`);
        vCell.value = smVals[i];
        vCell.numFmt = smFmts[i];
        vCell.font = { name: "Arial", size: 14, bold: true, color: { argb: smFG[i] } };
        vCell.alignment = { horizontal: "center", vertical: "middle" };
        vCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: smBG[i] } };
        bAll(vCell, smBR[i]);
        ws.getRow(10).height = 30;
      });
      ws.getRow(11).height = 10;

      // ══ سطر 12: رأس الجدول ══
      const hdr = ws.getRow(12);
      hdr.values = ["م", "التاريخ", "الحركة", "المبلغ", "الرصيد بعدها"];
      hdr.eachCell(cell => {
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
        bAll(cell, NAVY_D);
      });
      hdr.height = 24;

      // ══ صفوف الحركات (نفس بيانات الشاشة: بيانات شحن + سدادات + أوامر بيع) ══
      transactions.forEach((t, i) => {
        const rowBG = i % 2 === 0 ? "FFFFFFFF" : ROW_ALT;
        const isPaid = t.direction === "paid";
        const balDue = t.runningBalance > 0;

        const row = ws.addRow([
          i + 1, format(new Date(t.date), "yyyy/MM/dd"), t.label,
          (isPaid ? -1 : 1) * t.amount, Math.abs(t.runningBalance),
        ]);
        row.eachCell(cell => {
          cell.font = { name: "Arial", size: 10, color: { argb: INK } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBG } };
          bAll(cell, LINE);
        });
        row.getCell(1).font = { name: "Arial", size: 9, color: { argb: MUTED } };
        row.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(3).font = {
          name: "Arial", size: 10,
          color: { argb: isPaid ? GREEN : t.type === "manifest" ? BLUE : AMBER },
        };
        row.getCell(4).numFmt = '#,##0;-#,##0';
        row.getCell(4).font = { name: "Arial", size: 10, bold: true, color: { argb: isPaid ? GREEN : INK } };
        row.getCell(5).numFmt = '#,##0';
        row.getCell(5).font = balDue
          ? { name: "Arial", size: 10, bold: true, color: { argb: RED } }
          : { name: "Arial", size: 10, bold: true, color: { argb: GREEN } };
        row.height = 20;
      });

      if (transactions.length === 0) {
        ws.mergeCells(`A13:G13`);
        const emptyCell = ws.getCell("A13");
        emptyCell.value = "لا توجد حركات مالية مسجّلة لهذا العميل حتى الآن";
        emptyCell.font = { name: "Arial", size: 10, color: { argb: MUTED } };
        emptyCell.alignment = { horizontal: "center", vertical: "middle" };
        ws.getRow(13).height = 40;
      }

      // ══ صف الرصيد الصافي ══
      const totRow = ws.addRow(["", "", "الرصيد الصافي" + (netBalance > 0 ? " (مستحق)" : netBalance < 0 ? " (له)" : ""), "", Math.abs(netBalance)]);
      ws.mergeCells(`A${totRow.number}:C${totRow.number}`);
      ws.mergeCells(`D${totRow.number}:E${totRow.number}`);
      totRow.eachCell(cell => {
        cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        bAll(cell, NAVY_D);
      });
      totRow.getCell(5).numFmt = '#,##0" ج.م"';
      if (netBalance > 0) {
        totRow.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
      }
      totRow.height = 26;

      // ══ تذييل: توقيعات ══
      const sigRowNum = totRow.number + 3;
      ws.mergeCells(`A${sigRowNum}:B${sigRowNum}`);
      ws.getCell(`A${sigRowNum}`).value = "____________________";
      ws.getCell(`A${sigRowNum}`).font = { name: "Arial", size: 10, color: { argb: MUTED } };
      ws.getCell(`A${sigRowNum}`).alignment = { horizontal: "center" };
      ws.mergeCells(`F${sigRowNum}:G${sigRowNum}`);
      ws.getCell(`F${sigRowNum}`).value = "____________________";
      ws.getCell(`F${sigRowNum}`).font = { name: "Arial", size: 10, color: { argb: MUTED } };
      ws.getCell(`F${sigRowNum}`).alignment = { horizontal: "center" };

      const sigLabelRow = sigRowNum + 1;
      ws.mergeCells(`A${sigLabelRow}:B${sigLabelRow}`);
      ws.getCell(`A${sigLabelRow}`).value = "توقيع المسؤول";
      ws.getCell(`A${sigLabelRow}`).font = { name: "Arial", size: 9, color: { argb: MUTED } };
      ws.getCell(`A${sigLabelRow}`).alignment = { horizontal: "center" };
      ws.mergeCells(`F${sigLabelRow}:G${sigLabelRow}`);
      ws.getCell(`F${sigLabelRow}`).value = "توقيع العميل";
      ws.getCell(`F${sigLabelRow}`).font = { name: "Arial", size: 9, color: { argb: MUTED } };
      ws.getCell(`F${sigLabelRow}`).alignment = { horizontal: "center" };

      const noteRow = sigLabelRow + 2;
      ws.mergeCells(`A${noteRow}:G${noteRow}`);
      ws.getCell(`A${noteRow}`).value = "هذا الكشف صادر إلكترونياً من نظام Stark Vector ولا يحتاج توقيعاً لاعتماده داخلياً.";
      ws.getCell(`A${noteRow}`).font = { name: "Arial", size: 8, italic: true, color: { argb: MUTED } };
      ws.getCell(`A${noteRow}`).alignment = { horizontal: "center" };

      // إعدادات الطباعة
      ws.pageSetup = {
        paperSize: 9, orientation: "portrait", fitToPage: true,
        fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `كشف-حساب-${client.name}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div dir="rtl" className="w-full">
      <div className="space-y-4">
          {/* رأس المودال */}
          <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
            <div className="flex items-center gap-2 order-2 sm:order-1">
              <Button
                variant="outline" size="sm"
                onClick={handlePrint}
                className="h-8 gap-1.5 text-xs border-blue-800 text-blue-400 hover:bg-blue-900/20"
              >
                <FileText className="w-3.5 h-3.5" />
                طباعة
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={handleExportExcel}
                disabled={exporting === "excel"}
                className="h-8 gap-1.5 text-xs border-emerald-800 text-emerald-400 hover:bg-emerald-900/20"
              >
                {exporting === "excel"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FileSpreadsheet className="w-3.5 h-3.5" />}
                تصدير Excel
              </Button>
            </div>
            <div className="order-1 sm:order-2 flex-1 min-w-[200px]">
              <h2 className="text-right flex items-center gap-2 text-base sm:text-lg font-semibold">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                كشف حساب — {client.name}
              </h2>
            </div>
          </div>

          {/* فلتر التاريخ */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 print:hidden">
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">من تاريخ</Label>
              <Input
                type="date"
                value={from}
                onChange={e => onFromChange(e.target.value)}
                className="h-9 text-xs bg-background"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">إلى تاريخ</Label>
              <Input
                type="date"
                value={to}
                onChange={e => onToChange(e.target.value)}
                className="h-9 text-xs bg-background"
              />
            </div>
          </div>

          {/* بطاقات الملخص — من الحركة الموحدة (بيانات مغلقة + سدادات + أوامر بيع) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <Card className="p-3 text-center border-red-900/40" style={GLOW.red.style}>
              <p className="text-[10px] text-red-400 mb-1 font-bold">المتبقي</p>
              <p className="text-base sm:text-xl font-black text-red-400 truncate">
                {fmt(txnSummary?.netBalance ?? totalUnpaid)} ج.م
              </p>
            </Card>
            <Card className="p-3 text-center border-emerald-900/40" style={GLOW.emerald.style}>
              <p className="text-[10px] text-emerald-400 mb-1 font-bold">المدفوع</p>
              <p className="text-base sm:text-xl font-black text-emerald-400 truncate">
                {fmt((txnSummary?.paymentsTotal ?? 0) + (txnSummary?.saleOrdersPaidTotal ?? totalPaid))} ج.م
              </p>
            </Card>
            <Card className="p-3 text-center border-amber-900/40" style={GLOW.amber.style}>
              <p className="text-[10px] text-amber-400 mb-1 font-bold">إجمالي المستحق</p>
              <p className="text-base sm:text-xl font-black text-amber-400 truncate">
                {fmt((txnSummary?.manifestsTotal ?? 0) + (txnSummary?.saleOrdersTotal ?? totalAmount))} ج.م
              </p>
            </Card>
            <Card className="p-3 text-center border-primary/30" style={GLOW.blue.style}>
              <p className="text-[10px] text-primary mb-1 font-bold">عدد الحركات</p>
              <p className="text-base sm:text-xl font-black text-primary">{transactions.length}</p>
            </Card>
          </div>

          {/* ─── الحركة المالية الموحّدة: بيانات مغلقة + سدادات + أوامر بيع ─── */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-primary" />
                الحركة المالية الكاملة (شحن + مبيعات + سدادات)
              </h3>
              {txnSummary && (
                <span className={`text-xs font-black ${txnSummary.netBalance > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  الرصيد الصافي: {fmt(Math.abs(txnSummary.netBalance))} ج.م {txnSummary.netBalance > 0 ? "(مستحق)" : txnSummary.netBalance < 0 ? "(له)" : ""}
                </span>
              )}
            </div>

            {statementLoading ? (
              <p className="text-center text-muted-foreground text-xs py-6">جاري تحميل الحركات...</p>
            ) : transactions.length === 0 ? (
              <p className="text-center text-muted-foreground text-xs py-6">لا توجد حركات مالية مسجّلة لهذا العميل حتى الآن</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                      <tr className="text-muted-foreground">
                        <th className="px-3 py-2 font-bold text-center">التاريخ</th>
                        <th className="px-3 py-2 font-bold text-right">الحركة</th>
                        <th className="px-3 py-2 font-bold text-center">المبلغ</th>
                        <th className="px-3 py-2 font-bold text-center">الرصيد بعدها</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t, i) => (
                        <tr key={`${t.type}-${t.refId}-${i}`} className={i % 2 === 0 ? "bg-card" : "bg-muted/10"}>
                          <td className="px-3 py-2 text-center text-muted-foreground whitespace-nowrap">
                            {format(new Date(t.date), "yyyy/M/d")}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={t.type === "payment" ? "text-emerald-400" : t.type === "manifest" ? "text-sky-400" : "text-amber-400"}>
                              {t.label}
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-center font-bold ${t.direction === "paid" ? "text-emerald-400" : "text-foreground"}`}>
                            {t.direction === "paid" ? "−" : "+"}{fmt(t.amount)} ج.م
                          </td>
                          <td className={`px-3 py-2 text-center font-bold ${t.runningBalance > 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {fmt(Math.abs(t.runningBalance))} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* أوامر البيع — تظهر فقط لو للعميل أوامر بيع فعلية (نظام قديم) */}
          {orders.length > 0 && (
          <>
          {/* الجدول — Desktop (تفاصيل أوامر البيع فقط) */}
          <h3 className="text-xs font-bold text-muted-foreground pt-1">تفاصيل أوامر البيع</h3>
          <div className="hidden sm:block rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground">
                    <th className="px-3 py-2 font-bold text-center">رقم الأمر</th>
                    <th className="px-3 py-2 font-bold text-center">التاريخ</th>
                    <th className="px-3 py-2 font-bold text-center">الحالة</th>
                    <th className="px-3 py-2 font-bold text-center">الإجمالي</th>
                    <th className="px-3 py-2 font-bold text-center">المدفوع</th>
                    <th className="px-3 py-2 font-bold text-center">المتبقي</th>
                    <th className="px-3 py-2 font-bold text-center">الدفع</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                        لا توجد أوامر في هذه الفترة
                      </td>
                    </tr>
                  ) : filtered.map((o, i) => {
                    const tot = parseFloat(o.totalAmount ?? "0");
                    const pd  = o.paymentStatus === "paid" ? tot : parseFloat(o.paidAmount ?? "0");
                    const unp = Math.max(0, tot - pd);
                    return (
                      <tr key={o.id} className={i % 2 === 0 ? "bg-card" : "bg-muted/10"}>
                        <td className="px-3 py-2 text-center font-bold text-amber-400">{o.soNumber}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{format(new Date(o.createdAt), "yyyy/M/d")}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant="outline" className="text-[9px] border-emerald-700 bg-emerald-900/20 text-emerald-400">
                            {stMap[o.status] ?? o.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center font-bold">{fmt(tot)} ج.م</td>
                        <td className="px-3 py-2 text-center text-emerald-400">{fmt(pd)} ج.م</td>
                        <td className="px-3 py-2 text-center font-bold text-red-400">{fmt(unp)} ج.م</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant="outline" className={`text-[9px] font-bold border ${pyColorClass(o, unp)}`}>
                            {pyLabel(o, unp)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* الجدول — Mobile (كروت) */}
          <div className="sm:hidden space-y-2">
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground text-xs py-8">لا توجد أوامر في هذه الفترة</p>
            ) : filtered.map(o => {
              const tot = parseFloat(o.totalAmount ?? "0");
              const pd  = o.paymentStatus === "paid" ? tot : parseFloat(o.paidAmount ?? "0");
              const unp = Math.max(0, tot - pd);
              return (
                <Card key={o.id} className="p-3 border-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-black text-sm text-amber-400">{o.soNumber}</span>
                    <Badge variant="outline" className={`text-[9px] font-bold border ${pyColorClass(o, unp)}`}>
                      {pyLabel(o, unp)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
                    <span>{format(new Date(o.createdAt), "yyyy/MM/dd")}</span>
                    <Badge variant="outline" className="text-[9px] border-emerald-700 bg-emerald-900/20 text-emerald-400">
                      {stMap[o.status] ?? o.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div>
                      <p className="text-[9px] text-muted-foreground">الإجمالي</p>
                      <p className="text-xs font-bold">{fmt(tot)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground">المدفوع</p>
                      <p className="text-xs font-bold text-emerald-400">{fmt(pd)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground">المتبقي</p>
                      <p className="text-xs font-bold text-red-400">{fmt(unp)}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          </>
          )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ─── Admin Client Account Manifest Cards — نفس تجربة حساب العميل ──────────
// ════════════════════════════════════════════════════════════════════════════
function AdminOpenManifestCard({ manifest, clientId, qc }: {
  manifest: ClientAccountManifestListItem;
  clientId: number;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const sc = manifest.statusCounts;
  const total = manifest.shipmentCount;
  const completed = (sc.delivered ?? 0) + (sc.partial ?? 0);
  // "قيد العمل" = pending الحقيقي القادم من الـ API (مش طرح حسابي)، عشان
  // مجموع كل الكروت (مسلَّم + مؤجل + مرتجع + استلم جزء + قيد العمل) يطابق
  // total بالظبط دايمًا مهما كانت الحالات الموجودة جوة البيان.
  const inProgress = sc.pending ?? 0;
  const deliveryPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-emerald-700/40 bg-gradient-to-br from-emerald-950/20 via-muted/20 to-transparent hover:border-emerald-600/60 transition-all p-4 sm:p-5">
      <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full blur-3xl opacity-30 bg-emerald-500/30" />

      <div className="relative flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Hourglass className="w-3.5 h-3.5 text-amber-400 animate-[spin_2.5s_linear_infinite]" />
          <span className="text-[11px] font-bold text-amber-300">
            البيان حالياً قيد العمل — يتم إضافة شحنات العميل عليه
          </span>
        </div>
        <ChevronLeft className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
      </div>

      <div className="relative flex items-center justify-between gap-3 mb-4 flex-wrap">
        <Link href={`/finance/client-account-sheet/manifest/${manifest.id}`} className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-sm truncate">{manifest.manifestNumber}</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-emerald-900/30 text-emerald-400 border border-emerald-800">
                <LockOpen className="w-2.5 h-2.5" /> مفتوح
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}
            </p>
          </div>
        </Link>
        <AdminManifestActions manifest={manifest} clientId={clientId} qc={qc} />
      </div>

      <div className="relative grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        <AdminManifestMiniStat icon={Package} value={total} label="إجمالي الأوردرات" />
        <AdminManifestMiniStat icon={CheckCircle2} value={sc.delivered ?? 0} label="مُسلَّم" tone="emerald" loading />
        <AdminManifestMiniStat icon={Clock} value={sc.delayed ?? 0} label="مؤجل" tone="orange" loading />
        <AdminManifestMiniStat icon={RotateCcw} value={sc.returned ?? 0} label="مرتجع" tone="red" loading />
        <AdminManifestMiniStat icon={PackageCheck} value={sc.partial ?? 0} label="استلم جزء" tone="teal" loading />
        <AdminManifestMiniStat icon={PackageX} value={inProgress} label="قيد العمل" tone="rose" loading />
      </div>

      {total > 0 && (
        <div className="relative mt-4">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>نسبة التسليم</span>
            <span className="font-bold text-foreground">{deliveryPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deliveryPct}%` }} />
          </div>
        </div>
      )}

      {!!manifest.pendingShipmentsCount && manifest.pendingShipmentsCount > 0 && (
        <div className="relative mt-3 rounded-xl border border-amber-700/40 bg-amber-950/20 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Hourglass className="w-3.5 h-3.5 text-amber-400 animate-[spin_2.5s_linear_infinite]" />
              <span className="text-[11px] font-bold text-amber-300">الأوردرات الجديدة</span>
            </div>
            <span className="text-lg font-black text-amber-300">{manifest.pendingShipmentsCount}</span>
          </div>
          <p className="text-[11px] font-bold text-amber-300 mt-2">
            الأوردرات الجديدة سوف تُضاف تلقائيًا للبيان القادم عند إغلاق هذا البيان
          </p>
        </div>
      )}
    </div>
  );
}

function AdminRecentlyClosedManifestCard({ manifest, clientId, qc }: {
  manifest: ClientAccountManifestListItem;
  clientId: number;
  qc: ReturnType<typeof useQueryClient>;
}) {
  return (
    <div className="rounded-xl border border-sky-700/40 bg-gradient-to-l from-sky-950/15 via-muted/15 to-transparent p-3.5 flex items-center justify-between gap-3 flex-wrap">
      <Link href={`/finance/client-account-sheet/manifest/${manifest.id}`} className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-sky-500/10 text-sky-400">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-xs truncate">{manifest.manifestNumber}</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-900/30 text-sky-400 border border-sky-800">
              تم إغلاق البيان
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {manifest.closedAt && `أُغلق في ${format(new Date(manifest.closedAt), "d MMMM yyyy", { locale: ar })}`}
            {manifest.invoicePrice && ` — ${formatCurrency(Number(manifest.invoicePrice))}`}
          </p>
        </div>
      </Link>
      <AdminManifestActions manifest={manifest} clientId={clientId} qc={qc} compact />
    </div>
  );
}

function AdminArchivedManifestCard({ manifest, clientId, qc }: {
  manifest: ClientAccountManifestListItem;
  clientId: number;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const sc = manifest.statusCounts;
  const total = manifest.shipmentCount;
  const completed = (sc.delivered ?? 0) + (sc.partial ?? 0);
  const deliveryPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="group rounded-2xl border border-border bg-muted/20 hover:bg-muted/35 hover:border-primary/40 transition-all p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <Link href={`/finance/client-account-sheet/manifest/${manifest.id}`} className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-sm truncate">{manifest.manifestNumber}</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-muted text-muted-foreground border border-border">
                <Lock className="w-2.5 h-2.5" /> مغلق — تم إغلاقه
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}
              {manifest.closedAt && ` — أُغلق في ${format(new Date(manifest.closedAt), "d MMMM yyyy", { locale: ar })}`}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <AdminManifestActions manifest={manifest} clientId={clientId} qc={qc} compact />
          <ChevronLeft className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
        <AdminManifestMiniStat icon={Package} value={total} label="إجمالي" />
        <AdminManifestMiniStat icon={CheckCircle2} value={sc.delivered ?? 0} label="مسلَّم" tone="emerald" />
        <AdminManifestMiniStat icon={Clock} value={sc.pending ?? 0} label="قيد الانتظار" tone="muted" />
        <AdminManifestMiniStat icon={AlertCircle} value={sc.delayed ?? 0} label="مؤجل" tone="orange" />
        <AdminManifestMiniStat icon={RotateCcw} value={sc.returned ?? 0} label="مرتجع" tone="red" />
      </div>

      {total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>نسبة التسليم</span>
            <span className="font-bold text-foreground">{deliveryPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deliveryPct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function AdminManifestActions({ manifest, clientId, qc, compact = false }: {
  manifest: ClientAccountManifestListItem;
  clientId: number;
  qc: ReturnType<typeof useQueryClient>;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const toggleLockMutation = useMutation({
    mutationFn: (status: "open" | "closed") =>
      clientAccountManifestsApi.update(manifest.id, { status }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["client-account-manifests", clientId] });
      setCloseError(null);
      setShowCloseConfirm(false);
      if (res?.rolled) {
        toast({
          title: "🔒 تم إغلاق البيان بنجاح",
          description: `تم ترحيل ${res.rolled.orderCount} فاتورة غير مكتملة إلى بيان جديد: ${res.rolled.manifestNumber}`,
          duration: 8000,
        });
      } else {
        toast({ title: "تم التحديث" });
      }
    },
    onError: (e: any) => {
      setCloseError(e.message || "حدث خطأ غير متوقع");
      toast({ title: "خطأ", description: e.message, variant: "destructive", duration: 10000 });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => clientAccountManifestsApi.delete(manifest.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-account-manifests", clientId] });
      toast({ title: "تم حذف البيان" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {manifest.status === "open" ? (
        <Button
          size="sm" variant="outline"
          className={cn(
            "gap-1 border-emerald-700 text-emerald-400 hover:bg-emerald-900/20",
            compact ? "h-7 text-[10px] px-2" : "h-8 text-xs px-3",
          )}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCloseError(null); setShowCloseConfirm(true); }}
          disabled={toggleLockMutation.isPending}
        >
          <Lock className="w-3 h-3" />إغلاق
        </Button>
      ) : (
        <Button
          size="sm" variant="outline"
          className={cn(
            "gap-1 border-blue-700 text-blue-400 hover:bg-blue-900/20",
            compact ? "h-7 text-[10px] px-2" : "h-8 text-xs px-3",
          )}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleLockMutation.mutate("open"); }}
          disabled={toggleLockMutation.isPending}
        >
          <LockOpen className="w-3 h-3" />فتح
        </Button>
      )}

      {manifest.shipmentCount === 0 && (
        <Button
          size="sm" variant="ghost"
          className={cn("text-red-400 hover:bg-red-900/20", compact ? "h-7 text-[10px] px-2" : "h-8 text-xs px-3")}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm("حذف هذا البيان؟")) deleteMutation.mutate(); }}
        >
          حذف
        </Button>
      )}

      {showCloseConfirm && (
        <Dialog open onOpenChange={setShowCloseConfirm}>
          <DialogContent className="max-w-md bg-card border-border" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-sm font-black flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" /> إغلاق البيان
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-amber-400 leading-relaxed">
              سيتم إغلاق البيان، وأي فواتير لسه قيد التجهيز غير مسلَّمة هيتم ترحيلها تلقائياً لبيان جديد مفتوح.
            </p>
            {closeError && (
              <p className="text-xs text-red-400 font-semibold leading-relaxed border border-red-900/40 bg-red-950/20 rounded-md p-2 mb-1">
                ⚠️ {closeError}
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm" className="h-8 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { setCloseError(null); toggleLockMutation.mutate("closed"); }}
                disabled={toggleLockMutation.isPending}
              >
                {toggleLockMutation.isPending ? "جاري الإغلاق..." : "تأكيد الإغلاق والترحيل"}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowCloseConfirm(false)}>إلغاء</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AdminManifestMiniStat({ icon: Icon, value, label, tone = "default", loading = false }: {
  icon: typeof Package;
  value: number;
  label: string;
  tone?: "default" | "emerald" | "orange" | "red" | "muted" | "teal" | "rose";
  loading?: boolean;
}) {
  const toneClass = {
    default: "text-foreground",
    emerald: "text-emerald-400",
    orange: "text-orange-400",
    red: "text-red-400",
    muted: "text-muted-foreground",
    teal: "text-teal-400",
    rose: "text-rose-400",
  }[tone];

  return (
    <div className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-background/40 border border-border/40 relative">
      <Icon className={cn("w-3.5 h-3.5", toneClass)} />
      <span className={cn("text-sm font-black", toneClass)}>{value}</span>
      <span className="text-[9px] text-muted-foreground flex items-center gap-1">
        {label}
        {loading && <Clock className="w-2 h-2 animate-spin opacity-50" />}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ─── ClientManifestRow — صف بيان حساب واحد (فتح/قفل/ترحيل/حذف) ─────────────
// ════════════════════════════════════════════════════════════════════════════
function ClientManifestRow({ manifest, clientId, qc }: {
  manifest: ClientAccountManifestListItem;
  clientId: number;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { toast } = useToast();
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const toggleLockMutation = useMutation({
    mutationFn: (status: "open" | "closed") =>
      clientAccountManifestsApi.update(manifest.id, { status }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["client-account-manifests", clientId] });
      setCloseError(null);
      setShowCloseConfirm(false);
      if (res?.rolled) {
        toast({
          title: "🔒 تم إغلاق البيان بنجاح",
          description: `تم ترحيل ${res.rolled.orderCount} فاتورة غير مكتملة إلى بيان جديد: ${res.rolled.manifestNumber}`,
          duration: 8000,
        });
      } else {
        toast({ title: "تم التحديث" });
      }
    },
    onError: (e: any) => {
      setCloseError(e.message || "حدث خطأ غير متوقع");
      toast({ title: "خطأ", description: e.message, variant: "destructive", duration: 10000 });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => clientAccountManifestsApi.delete(manifest.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-account-manifests", clientId] });
      toast({ title: "تم حذف البيان" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const sc = manifest.statusCounts;
  const total = manifest.shipmentCount;
  const completed = (sc.delivered ?? 0) + (sc.partial ?? 0);
  const pending = total - completed;

  return (
    <div className={`rounded-lg border ${manifest.status === "closed" ? "border-border bg-card/50" : "border-primary/30 bg-primary/5"}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <Link href={`/finance/client-account-sheet/manifest/${manifest.id}`} className="flex-1 min-w-0 text-right cursor-pointer">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-sm">{manifest.manifestNumber}</span>
            <Badge variant="outline" className={`text-[9px] font-bold border ${
              manifest.status === "closed"
                ? "border-emerald-700 bg-emerald-900/20 text-emerald-400"
                : "border-blue-700 bg-blue-900/20 text-blue-400"
            }`}>
              {manifest.status === "closed"
                ? <><Lock className="w-2.5 h-2.5 inline ml-0.5" />مغلق</>
                : <><Clock className="w-2.5 h-2.5 inline ml-0.5" />مفتوح</>}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" />{format(new Date(manifest.createdAt), "yyyy/MM/dd")}</span>
            <span className="flex items-center gap-1"><Package className="w-2.5 h-2.5" />{total} شحنة</span>
            <span className="text-emerald-400">{completed} مكتملة</span>
            {pending > 0 && <span className="text-amber-400">{pending} جارية</span>}
          </div>
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          {manifest.status === "open" ? (
            <Button
              size="sm" variant="outline"
              className="h-7 text-[10px] gap-1 border-emerald-700 text-emerald-400 hover:bg-emerald-900/20"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCloseError(null); setShowCloseConfirm(true); }}
              disabled={toggleLockMutation.isPending}
            >
              <Lock className="w-3 h-3" />إغلاق
            </Button>
          ) : (
            <Button
              size="sm" variant="outline"
              className="h-7 text-[10px] gap-1 border-blue-700 text-blue-400 hover:bg-blue-900/20"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleLockMutation.mutate("open"); }}
              disabled={toggleLockMutation.isPending}
            >
              فتح
            </Button>
          )}
          {total === 0 && (
            <Button
              size="sm" variant="ghost"
              className="h-7 text-[10px] text-red-400 hover:bg-red-900/20"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm("حذف هذا البيان؟")) deleteMutation.mutate(); }}
            >
              حذف
            </Button>
          )}
        </div>
      </div>

      {/* تأكيد الإغلاق + الترحيل */}
      {showCloseConfirm && (
        <div className="px-3 pb-3 pt-1 border-t border-border/50">
          <p className="text-[11px] text-amber-400 mb-2">
            سيتم إغلاق البيان، وأي فواتير لسه قيد التجهيز (غير مسلَّمة) هيتم ترحيلها تلقائياً لبيان جديد مفتوح.
          </p>
          {closeError && (
            <p className="text-[10px] text-red-400 font-semibold leading-relaxed border border-red-900/40 bg-red-950/20 rounded-md p-2 mb-2">
              ⚠️ {closeError}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm" className="h-7 text-[10px] flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { setCloseError(null); toggleLockMutation.mutate("closed"); }}
              disabled={toggleLockMutation.isPending}
            >
              {toggleLockMutation.isPending ? "جاري الإغلاق..." : "تأكيد الإغلاق والترحيل"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setShowCloseConfirm(false)}>إلغاء</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ─── CreateSaleOrderManifestDialog — إنشاء بيان جديد (اختيار فواتير) ───────
// ════════════════════════════════════════════════════════════════════════════
function CreateSaleOrderManifestDialog({
  clientId, clientName, onClose, onCreated,
}: {
  clientId: number;
  clientName: string;
  onClose: () => void;
  onCreated?: (manifest: { id: number; manifestNumber: string; shipmentCount: number }) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");

  // الشحنات المتاحة (قيد الشحن في المخزن، لهذا العميل تحديدًا)
  const { data, isLoading } = useQuery({
    queryKey: ["shipments-available-for-manifest", clientId],
    queryFn: () => shipmentsApi.list({ clientId, status: "warehouse_ready", limit: 500 }),
  });

  const orders = ((data?.data ?? []) as any[]).filter((s) => s.status === "warehouse_ready");

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter((o: any) =>
      o.shipmentNumber?.toLowerCase().includes(q) ||
      o.receiverName?.toLowerCase().includes(q) ||
      (o.receiverPhone && o.receiverPhone.includes(q)) ||
      (o.trackingNumber && o.trackingNumber.toLowerCase().includes(q))
    );
  }, [orders, search]);

  const toggleAll = () => {
    if (filtered.length > 0 && filtered.every(o => selectedIds.has(o.id))) {
      const next = new Set(selectedIds);
      filtered.forEach(o => next.delete(o.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach(o => next.add(o.id));
      setSelectedIds(next);
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      try {
        return await clientAccountManifestsApi.create({
          clientId,
          shipmentIds: Array.from(selectedIds),
          notes: notes.trim() || undefined,
        });
      } catch (err: any) {
        // 409 = يوجد بيان مفتوح → أضف الشحنات له تلقائياً
        if (err?.status === 409 || err?.message?.includes("409") || err?.message?.includes("مفتوح")) {
          const manifests = await clientAccountManifestsApi.list(clientId);
          const openManifest = manifests.find(m => m.status === "open");
          if (!openManifest) throw err;
          const result = await clientAccountManifestsApi.addShipments(openManifest.id, Array.from(selectedIds));
          return {
            id: openManifest.id,
            manifestNumber: openManifest.manifestNumber,
            shipmentCount: result.added,
            _addedToExisting: true,
          } as any;
        }
        throw err;
      }
    },
    onSuccess: (manifest: any) => {
      qc.invalidateQueries({ queryKey: ["client-account-manifests", clientId] });
      qc.invalidateQueries({ queryKey: ["shipments-available-for-manifest", clientId] });
      if (manifest._addedToExisting) {
        toast({ title: "تمت الإضافة للبيان المفتوح", description: `${manifest.manifestNumber} — أُضيف ${manifest.shipmentCount} شحنة للبيان الموجود` });
      } else {
        toast({ title: "تم إنشاء البيان", description: `${manifest.manifestNumber} — ${manifest.shipmentCount} شحنة` });
      }
      if (onCreated) onCreated(manifest);
      else onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const stMap: Record<string, string> = { draft: "مسودة", confirmed: "مؤكد", processing: "قيد التجهيز", delivered: "تم التسليم", closed: "مغلق" };
  const pyMap: Record<string, string> = { paid: "مسدد", partial: "جزئي", unpaid: "غير مسدد" };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border w-[94vw] sm:w-full max-w-3xl max-h-[90vh] flex flex-col p-4 sm:p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2 pr-8 text-base sm:text-lg">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            إنشاء بيان جديد
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-right truncate pr-8">{clientName}</p>
          <p className="text-[10px] text-amber-400/80 text-right pr-8 mt-0.5">
            الشحنات المعروضة هنا هي فقط اللي حالتها "قيد الشحن فى المخزن"
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 mt-2">
          {/* Search + counter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الشحنة / اسم المستلم..."
                className="h-9 text-sm bg-background pr-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!isLoading && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {orders.length} شحنة متاحة
              </span>
            )}
          </div>

          {/* Select-all row */}
          {!isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every(o => selectedIds.has(o.id))}
                  onCheckedChange={toggleAll}
                />
                <span className="text-xs text-muted-foreground">تحديد الكل ({filtered.length} شحنة)</span>
              </div>
              <span className="text-xs font-bold text-primary">{selectedIds.size} شحنة محددة</span>
            </div>
          )}

          {/* Shipments list */}
          <div className="overflow-y-auto flex-1 border border-border rounded-md">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">جاري تحميل الشحنات...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">
                  {orders.length === 0
                    ? "لا توجد شحنات قيد الشحن في المخزن حالياً لهذا العميل"
                    : "لا توجد نتائج تطابق البحث"}
                </p>
              </div>
            ) : (
              filtered.map((o: any) => {
                const isSelected = selectedIds.has(o.id);
                const cod = Number(o.codAmount ?? o.totalAmount ?? 0);
                return (
                  <div
                    key={o.id}
                    onClick={() => toggleOne(o.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/8" : ""}`}
                  >
                    <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{o.shipmentNumber}</span>
                        <Badge variant="outline" className="text-[9px] font-bold border border-purple-700 bg-purple-900/20 text-purple-400">
                          قيد الشحن بالمخزن
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span>{o.receiverName} {o.receiverCity ? `· ${o.receiverCity}` : ""}</span>
                        <span className="font-bold text-foreground">
                          {fmt(cod)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs mb-1.5 block">ملاحظات (اختياري)</Label>
            <Textarea
              placeholder="ملاحظات على البيان..."
              className="min-h-[50px] text-sm resize-none bg-background"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="w-full sm:flex-1 h-10 sm:h-9 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => createMutation.mutate()}
              disabled={selectedIds.size === 0 || createMutation.isPending}
            >
              {createMutation.isPending ? "جاري الإنشاء..." : `إنشاء البيان (${selectedIds.size} فاتورة)`}
            </Button>
            <Button variant="outline" className="w-full sm:w-auto h-10 sm:h-9 text-sm border-border" onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
