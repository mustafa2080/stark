import { useState, useMemo } from "react";
import { useLocation } from "wouter";
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
  RotateCcw, ListOrdered, Truck, Loader2, CheckCircle2, UserCog, BarChart3, ListFilter, X,
  ArrowUp, ArrowDown, ArrowUpDown, LayoutGrid, List as ListIcon, Wallet,
  Building2, Send, Warehouse, StickyNote, Hash, Calendar, DollarSign, Receipt, FileSpreadsheet,
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
  assignedUserName: string | null;
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
    statusDistribution: { status: string; count: number; percentage: number }[];
    weeklyShipments: number;
  } | null;
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  waiting:           { label: "انتظار",        color: "text-amber-400",   bg: "bg-amber-900/20",   border: "border-amber-700" },
  confirmed:         { label: "مؤكدة",         color: "text-teal-400",    bg: "bg-teal-900/20",    border: "border-teal-700" },
  picked_up:         { label: "تم الاستلام",    color: "text-sky-400",     bg: "bg-sky-900/20",     border: "border-sky-700" },
  in_transit:        { label: "في الطريق",      color: "text-sky-400",     bg: "bg-sky-900/20",     border: "border-sky-700" },
  out_for_delivery:  { label: "خرجت للتسليم",   color: "text-blue-400",    bg: "bg-blue-900/20",    border: "border-blue-700" },
  delayed:           { label: "مؤجل",           color: "text-orange-400",  bg: "bg-orange-900/20",  border: "border-orange-700" },
  delivered:         { label: "تم التسليم",     color: "text-emerald-400", bg: "bg-emerald-900/20", border: "border-emerald-700" },
  partial_received:  { label: "استلام جزئي",    color: "text-cyan-400",    bg: "bg-cyan-900/20",    border: "border-cyan-700" },
  returned:          { label: "مرتجع",          color: "text-red-400",    bg: "bg-red-900/20",     border: "border-red-700" },
  cancelled:         { label: "ملغي",           color: "text-slate-400",   bg: "bg-slate-900/20",   border: "border-slate-700" },
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

// ── رأس عمود قابل للفلترة والترتيب زي الإكسيل ────────────────────────────
function ColumnHeader({
  label, col, enabled, values, active, open, onToggleOpen, onToggleValue, onClear,
  sortable, sortActive, sortDir, onSort,
}: {
  label: string;
  col: string;
  enabled: boolean;
  values: string[];
  active?: Set<string>;
  open: boolean;
  onToggleOpen: () => void;
  onToggleValue: (col: string, value: string) => void;
  onClear: (col: string) => void;
  sortable?: boolean;
  sortActive?: boolean;
  sortDir?: "asc" | "desc";
  onSort?: () => void;
}) {
  const hasActive = !!active && active.size > 0;
  return (
    <div className="relative flex items-center gap-1.5">
      {sortable ? (
        <button
          onClick={onSort}
          className="flex items-center gap-1 hover:text-primary transition-colors"
        >
          <span>{label}</span>
          {sortActive ? (
            sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-30" />
          )}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {enabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleOpen(); }}
          className={`p-0.5 rounded hover:bg-muted/40 ${hasActive ? "text-primary" : "text-muted-foreground"}`}
          title="فلترة"
        >
          <ListFilter className="w-3 h-3" />
        </button>
      )}
      {enabled && open && (
        <div
          className="absolute top-full right-0 mt-1 z-20 w-52 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg p-2 text-[11px] font-normal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold">فلترة {label}</span>
            {hasActive && (
              <button className="text-muted-foreground hover:text-foreground flex items-center gap-0.5" onClick={() => onClear(col)}>
                <X className="w-3 h-3" /> مسح
              </button>
            )}
          </div>
          <div className="space-y-1">
            {values.map((v) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer hover:bg-muted/20 rounded px-1 py-0.5">
                <input
                  type="checkbox"
                  checked={active ? active.has(v) : false}
                  onChange={() => onToggleValue(col, v)}
                  className="accent-primary"
                />
                <span className="truncate">{v}</span>
              </label>
            ))}
            {values.length === 0 && <p className="text-muted-foreground text-center py-2">لا يوجد قيم</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── أفاتار حرف أول من اسم العميل ──────────────────────────────────────────
const AVATAR_PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
];
function nameToColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
function ClientAvatar({ name }: { name: string }) {
  const color = nameToColor(name || "?");
  const letter = (name || "?").trim().charAt(0);
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {letter}
    </div>
  );
}

// ── صف بيانات فى كارت تفاصيل الأوردر ──────────────────────────────────────
function DetailRow({ icon: Icon, label, value, highlight, color }: {
  icon: any; label: string; value: any; highlight?: boolean; color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-1 border-b border-border/40 last:border-b-0">
      <span className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        <Icon className="w-3.5 h-3.5" style={color ? { color } : undefined} />
        {label}
      </span>
      <span className={`text-sm text-left truncate ${highlight ? "font-black" : "font-bold"}`} style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

type SearchMatch = { name: string; phone: string; shipmentsCount: number };

type ClientRow = {
  name: string; phone: string; city: string | null;
  shipmentsCount: number; totalAmount: number; collectedAmount: number; remainingAmount: number;
  lastOrderAt: string;
};

export default function ClientAccountSheetPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [activePhone, setActivePhone] = useState("");
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [collectedInput, setCollectedInput] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [filtersEnabled, setFiltersEnabled] = useState(false);
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [sortCol, setSortCol] = useState<keyof ClientRow>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [detailOrder, setDetailOrder] = useState<SheetOrder | null>(null);

  const hasSearch = !!activePhone;

  const { data, isLoading, isFetching } = useQuery<SheetResponse>({
    queryKey: ["client-account-sheet", activePhone],
    queryFn: () => apiFetch<SheetResponse>(`/client-account-sheet/orders?phone=${encodeURIComponent(activePhone)}`),
    enabled: hasSearch,
  });

  // كل العملاء — بتتحمّل لما لسه مفيش بحث نشط، وبتتفلتر محليًا فورًا مع الكتابة
  const { data: allClientsData, isLoading: isLoadingAllClients } = useQuery<{ clients: ClientRow[] }>({
    queryKey: ["client-account-sheet-all-clients"],
    queryFn: () => apiFetch<{ clients: ClientRow[] }>("/client-account-sheet/all-clients"),
    enabled: !hasSearch,
  });

  const filteredClients = useMemo(() => {
    let list = allClientsData?.clients ?? [];
    const q = tableFilter.trim();
    if (q) {
      const qNorm = q.replace(/\D/g, "");
      list = list.filter((c) =>
        c.name?.toLowerCase().includes(q.toLowerCase()) ||
        (qNorm && c.phone?.replace(/\D/g, "").includes(qNorm)) ||
        (!qNorm && c.phone?.includes(q))
      );
    }
    for (const [col, values] of Object.entries(columnFilters)) {
      if (!values || values.size === 0) continue;
      list = list.filter((c) => values.has(String((c as any)[col] ?? "—")));
    }
    const sorted = [...list].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va ?? "").localeCompare(String(vb ?? ""), "ar");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [allClientsData, tableFilter, columnFilters, sortCol, sortDir]);

  const toggleSort = (col: keyof ClientRow) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  // القيم الفريدة لكل عمود، لبناء قائمة الفلتر زي الإكسيل
  const columnValues = useMemo(() => {
    const list = allClientsData?.clients ?? [];
    const cols = ["name", "phone", "city"] as const;
    const map: Record<string, string[]> = {};
    for (const col of cols) {
      const set = new Set<string>();
      for (const c of list) set.add(String((c as any)[col] ?? "—"));
      map[col] = Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
    }
    return map;
  }, [allClientsData]);

  const toggleColumnFilterValue = (col: string, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      const current = new Set(next[col] ?? []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      next[col] = current;
      return next;
    });
  };

  const clearColumnFilter = (col: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
  };

  // اختيار مباشر برقم تليفون (مفتاح دقيق)
  const selectPhone = (phone: string) => {
    setMatches(null);
    setActivePhone(phone.trim());
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
        body: JSON.stringify({ phone: activePhone, notes: closeNotes || null }),
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

  // ── تصدير Excel — بنفس شكل شيت STARK (تقفيل رحلة/حساب) ─────────────────
  const exportExcel = async () => {
    if (!data?.client || !data.orders?.length) {
      toast({ title: "مفيش بيانات للتصدير", variant: "destructive" });
      return;
    }
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "STARK";
    workbook.created = new Date();

    const C = {
      bg: "FF0B0F19",
      panel: "FF1E293B",
      teal: "FF14B8A6",
      tealBg: "FFCCFBF1",
      white: "FFFFFFFF",
      offWhite: "FFF8FAFC",
      darkText: "FF0F172A",
      green: "FF10B981",
      red: "FFEF4444",
      redBg: "FFFEE2E2",
      amber: "FFF59E0B",
      amberBg: "FFFEF3C7",
      blue: "FF3B82F6",
      gray: "FF64748B",
      grayBg: "FFF1F5F9",
    };
    const makeFill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
    const makeBorder = (argb = "FFCBD5E1") => {
      const side = { style: "thin" as const, color: { argb } };
      return { top: side, bottom: side, left: side, right: side };
    };
    const setCell = (cell: any, value: unknown, options?: {
      fill?: string; font?: Record<string, any>; align?: Record<string, any>; border?: string; numFmt?: string;
    }) => {
      cell.value = value as any;
      if (options?.fill) cell.fill = makeFill(options.fill);
      if (options?.font) cell.font = { name: "Tahoma", size: 10, ...options.font };
      if (options?.align) cell.alignment = options.align;
      if (options?.border) cell.border = makeBorder(options.border);
      if (options?.numFmt) cell.numFmt = options.numFmt;
    };

    const ws = workbook.addWorksheet("حساب العميل", { views: [{ state: "frozen", ySplit: 5, rightToLeft: true }] });
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws.pageMargins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.35, header: 0.15, footer: 0.15 };

    const colCount = 13;
    ws.columns = [
      { key: "customer", width: 18 }, { key: "phone", width: 14 }, { key: "city", width: 12 },
      { key: "address", width: 26 }, { key: "sender", width: 16 }, { key: "warehouse", width: 16 },
      { key: "agent", width: 14 }, { key: "unit", width: 12 }, { key: "total", width: 12 },
      { key: "shipping", width: 12 }, { key: "collected", width: 14 }, { key: "status", width: 14 },
      { key: "notes", width: 22 },
    ];

    const colLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
    const lastCol = colLetters[colCount - 1];

    // ── هيدر الشركة ──────────────────────────────────────────────────────
    ws.mergeCells(`A1:${lastCol}1`);
    setCell(ws.getCell("A1"), "STARK", {
      fill: C.bg, font: { bold: true, size: 20, color: { argb: C.white } },
      align: { horizontal: "center", vertical: "middle" }, border: C.bg,
    });
    ws.getRow(1).height = 32;

    const printDate = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    ws.mergeCells(`A2:${lastCol}2`);
    setCell(ws.getCell("A2"), `كشف حساب عميل   |   ${printDate}`, {
      fill: C.bg, font: { bold: true, size: 12, color: { argb: C.teal } },
      align: { horizontal: "center", vertical: "middle" }, border: C.bg,
    });
    ws.getRow(2).height = 24;

    ws.mergeCells(`A3:${lastCol}3`);
    setCell(
      ws.getCell("A3"),
      `العميل: ${data.client.name}   |   الفون: ${data.client.phone ?? "—"}   |   المحافظة: ${data.client.city ?? "—"}   |   عدد الأوردرات: ${data.orders.length}`,
      { fill: C.panel, font: { size: 10, color: { argb: C.white } }, align: { horizontal: "center", vertical: "middle" }, border: "FF334155" },
    );
    ws.getRow(3).height = 22;

    ws.mergeCells(`A4:${lastCol}4`);
    setCell(ws.getCell("A4"), "", { fill: C.bg, border: C.bg });
    ws.getRow(4).height = 8;

    // ── رؤوس الأعمدة ─────────────────────────────────────────────────────
    const headers = [
      "اسم العميل", "الفون", "المحافظة", "العنوان", "اسم الراسل", "الفرع المستلم منه",
      "المندوب", "سعر الشحنة", "قيمة الشحنة", "قيمة الشحن", "المحصَّل فعلياً", "حالة الأوردر", "ملاحظات",
    ];
    const headerRow = ws.getRow(5);
    headerRow.values = headers;
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      setCell(cell, cell.value, {
        fill: C.panel, font: { bold: true, color: { argb: C.white }, size: 10 },
        align: { horizontal: "center", vertical: "middle", wrapText: true }, border: "FF334155",
      });
    });

    // ── صفوف الأوردرات ───────────────────────────────────────────────────
    const statusFillMap: Record<string, string> = {
      delivered: C.green, returned: C.red, delayed: C.amber, partial_received: C.teal,
      in_transit: C.blue, out_for_delivery: C.blue, picked_up: C.blue,
      waiting: C.gray, confirmed: C.gray, cancelled: C.gray,
    };
    const statusBgMap: Record<string, string> = {
      delivered: "FFD1FAE5", returned: C.redBg, delayed: C.amberBg, partial_received: C.tealBg,
      in_transit: "FFDDEBFF", out_for_delivery: "FFDDEBFF", picked_up: "FFDDEBFF",
      waiting: C.grayBg, confirmed: C.grayBg, cancelled: C.grayBg,
    };

    data.orders.forEach((o, idx) => {
      const baseFill = idx % 2 === 0 ? C.white : C.offWhite;
      const row = ws.getRow(idx + 6);
      row.height = 26;
      const cfg = STATUS_CFG[o.status];
      const statusColor = statusFillMap[o.status] ?? C.gray;
      const statusBg = statusBgMap[o.status] ?? C.grayBg;

      setCell(row.getCell(1), o.customerName, { fill: baseFill, font: { bold: true, color: { argb: C.darkText } }, align: { horizontal: "right", vertical: "middle" }, border: "FFD1D5DB" });
      setCell(row.getCell(2), o.phone ?? "—", { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
      setCell(row.getCell(3), o.city ?? "—", { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
      setCell(row.getCell(4), o.address ?? "—", { fill: baseFill, font: { size: 9, color: { argb: C.darkText } }, align: { horizontal: "right", vertical: "middle", wrapText: true }, border: "FFD1D5DB" });
      setCell(row.getCell(5), o.senderName ?? "—", { fill: baseFill, font: { bold: true, color: { argb: C.blue } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
      setCell(row.getCell(6), o.warehouseName ?? "—", { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
      setCell(row.getCell(7), o.assignedUserName ?? "—", { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB" });
      setCell(row.getCell(8), Number(o.unitPrice ?? 0), { fill: baseFill, font: { color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: '#,##0 "ج.م"' });
      setCell(row.getCell(9), Number(o.totalPrice ?? 0), { fill: baseFill, font: { bold: true, color: { argb: C.darkText } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: '#,##0 "ج.م"' });
      setCell(row.getCell(10), Number(o.shippingCost ?? 0), { fill: baseFill, font: { color: { argb: C.amber } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: '#,##0 "ج.م"' });
      setCell(row.getCell(11), o.collectedAmount != null ? Number(o.collectedAmount) : "—", { fill: baseFill, font: { bold: true, color: { argb: C.green } }, align: { horizontal: "center", vertical: "middle" }, border: "FFD1D5DB", numFmt: o.collectedAmount != null ? '#,##0 "ج.م"' : undefined });
      setCell(row.getCell(12), cfg?.label ?? o.status, { fill: statusBg, font: { bold: true, color: { argb: statusColor } }, align: { horizontal: "center", vertical: "middle" }, border: statusColor });
      setCell(row.getCell(13), o.notes ?? "", { fill: baseFill, font: { size: 9, color: { argb: C.darkText } }, align: { horizontal: "right", vertical: "middle", wrapText: true }, border: "FFD1D5DB" });
    });

    // ── صف الإجمالي/الخصم ────────────────────────────────────────────────
    const totalValue = data.orders.reduce((s, o) => s + Number(o.totalPrice ?? 0), 0);
    const totalShipping = data.orders.reduce((s, o) => s + Number(o.shippingCost ?? 0), 0);
    const netDue = totalValue - totalShipping;

    const summaryRowIndex = data.orders.length + 7;
    const summaryRows = [
      { row: summaryRowIndex,     label: "خصم قيمة الشحن", value: -totalShipping },
      { row: summaryRowIndex + 1, label: "إجمالي قيمة الشحنات", value: totalValue },
    ];
    for (const item of summaryRows) {
      setCell(ws.getCell(`A${item.row}`), item.label, {
        fill: C.grayBg, font: { bold: true, color: { argb: C.bg }, size: 11 },
        align: { horizontal: "right", vertical: "middle" }, border: "FF334155",
      });
      const valueCol = colLetters[1];
      setCell(ws.getCell(`${valueCol}${item.row}`), item.value, {
        fill: item.value < 0 ? C.redBg : C.tealBg,
        font: { bold: true, color: { argb: item.value < 0 ? C.red : C.teal }, size: 11 },
        align: { horizontal: "center", vertical: "middle" }, border: item.value < 0 ? C.red : C.teal,
        numFmt: '#,##0 "ج.م"',
      });
      for (let i = 2; i < colCount; i++) {
        setCell(ws.getCell(`${colLetters[i]}${item.row}`), "", { fill: C.grayBg, border: "FF334155" });
      }
      ws.getRow(item.row).height = 22;
    }

    // ── المربعات الأربعة (الجاري / مرتجع لم يصل / الجديد / الإجمالي) ─────
    const statsRowStart = summaryRowIndex + 3;
    const statBoxes = [
      { label: "الجاري", value: data.stats?.delayedOrInDelivery ?? 0, color: C.blue },
      { label: "مرتجع لم يصل", value: data.stats?.returnedNotReceived ?? 0, color: C.red },
      { label: "الجديد", value: data.stats?.newOrders ?? 0, color: C.amber },
      { label: "الإجمالي", value: data.stats?.totalOrders ?? 0, color: C.teal },
    ];
    statBoxes.forEach((box, i) => {
      const startColIdx = i * 3;
      const startCol = colLetters[startColIdx];
      const endCol = colLetters[Math.min(startColIdx + 1, colCount - 1)];
      ws.mergeCells(`${startCol}${statsRowStart}:${endCol}${statsRowStart}`);
      setCell(ws.getCell(`${startCol}${statsRowStart}`), box.label, {
        fill: C.panel, font: { bold: true, color: { argb: C.white }, size: 10 },
        align: { horizontal: "center", vertical: "middle" }, border: "FF334155",
      });
      ws.mergeCells(`${startCol}${statsRowStart + 1}:${endCol}${statsRowStart + 1}`);
      setCell(ws.getCell(`${startCol}${statsRowStart + 1}`), box.value, {
        fill: C.white, font: { bold: true, color: { argb: box.color }, size: 16 },
        align: { horizontal: "center", vertical: "middle" }, border: box.color,
      });
    });
    ws.getRow(statsRowStart).height = 22;
    ws.getRow(statsRowStart + 1).height = 30;

    // ── صندوق الرصيد النهائي (الصافي) ────────────────────────────────────
    const balanceRow = statsRowStart + 3;
    ws.mergeCells(`A${balanceRow}:${colLetters[colCount - 4]}${balanceRow}`);
    setCell(ws.getCell(`A${balanceRow}`), "الرصيد (الصافي المستحق)", {
      fill: C.offWhite, font: { bold: true, color: { argb: C.bg }, size: 13 },
      align: { horizontal: "right", vertical: "middle" }, border: "FF334155",
    });
    ws.mergeCells(`${colLetters[colCount - 3]}${balanceRow}:${lastCol}${balanceRow}`);
    setCell(ws.getCell(`${colLetters[colCount - 3]}${balanceRow}`), netDue, {
      fill: C.teal, font: { bold: true, color: { argb: C.white }, size: 15 },
      align: { horizontal: "center", vertical: "middle" }, border: C.teal,
      numFmt: '#,##0 "ج.م"',
    });
    ws.getRow(balanceRow).height = 30;

    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.alignment) cell.alignment = { horizontal: "right", vertical: "middle" };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `حساب-${data.client.name}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "تم تصدير ملف الإكسيل" });
  };

  const printTotals = useMemo(() => {
    const orders = data?.orders ?? [];
    return orders.reduce(
      (acc, o) => {
        acc.totalValue += Number(o.totalPrice ?? 0);
        acc.totalShipping += Number(o.shippingCost ?? 0);
        acc.totalCollected += Number(o.collectedAmount ?? 0);
        return acc;
      },
      { totalValue: 0, totalShipping: 0, totalCollected: 0 }
    );
  }, [data]);

  return (
    <>
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto print:hidden">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-black flex items-center gap-2">
            <User className="w-5 h-5 text-primary" /> حساب العميل
          </h1>
          <p className="text-xs text-muted-foreground mt-1">شيت حساب الزبون — أوردرات + إقفال حساب</p>
        </div>
      </div>

      {/* ملخص سريع */}
      {!hasSearch && (
        <Card className="p-4 border-border print:hidden">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-bold">{fmt(filteredClients.length)} عميل</p>
                <p className="text-[11px] text-muted-foreground">
                  اضغط على أي صف فى الجدول تحت لعرض حساب العميل بالتفصيل
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted/30 text-muted-foreground"}`}
                  title="عرض كروت"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`p-2 transition-colors border-r border-border ${viewMode === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted/30 text-muted-foreground"}`}
                  title="عرض جدول"
                >
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>
              <Button
                variant={filtersEnabled ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setFiltersEnabled((v) => !v)}
              >
                <ListFilter className="w-4 h-4" />
                {filtersEnabled ? "إخفاء الفلاتر" : "إنشاء فلتر"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* قائمة المرشحين لما البحث بالاسم يرجع أكتر من رقم */}
      {matches && matches.length > 0 && (
        <Card className="p-4 border-border print:hidden">
          <p className="text-sm font-bold mb-3">فيه أكتر من عميل بنفس الاسم — اختار الرقم الصح:</p>
          <div className="space-y-2">
            {matches.map((m) => (
              <button
                key={m.phone}
                onClick={() => selectPhone(m.phone)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/20 transition-colors text-right"
              >
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-primary" />
                  <div>
                    <p className="font-bold text-sm">{m.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {m.phone}</p>
                  </div>
                </div>
                <Badge variant="outline">{m.shipmentsCount} شحنة</Badge>
              </button>
            ))}
          </div>
        </Card>
      )}

      {!hasSearch && !matches && (
        <Card className="border-border overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
            <Input
              placeholder="فلترة سريعة بالاسم أو رقم التليفون..."
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="max-w-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              عرض <span className="font-bold text-foreground">{fmt(filteredClients.length)}</span> من <span className="font-bold text-foreground">{fmt(allClientsData?.clients?.length ?? 0)}</span> عميل
            </p>
          </div>

          {isLoadingAllClients && (
            <div className="p-10 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري تحميل قائمة العملاء...
            </div>
          )}

          {!isLoadingAllClients && viewMode === "grid" && (
            <div className="p-4">
              {filteredClients.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {tableFilter ? "مفيش نتائج مطابقة" : "لا يوجد عملاء"}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filteredClients.map((c) => {
                    const pct = c.totalAmount > 0 ? Math.min(100, Math.round((c.collectedAmount / c.totalAmount) * 100)) : 0;
                    const color = nameToColor(c.name || "?");
                    return (
                      <button
                        key={c.phone}
                        onClick={() => selectPhone(c.phone)}
                        className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-center"
                      >
                        <div
                          className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-black shrink-0 group-hover:scale-105 transition-transform"
                          style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}
                        >
                          {(c.name || "?").trim().charAt(0)}
                        </div>
                        <div className="w-full min-w-0">
                          <p className="text-xs font-bold truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5" /> {c.phone}
                          </p>
                        </div>
                        <div className="w-full flex items-center justify-between text-[10px] px-0.5">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Package className="w-2.5 h-2.5" /> {c.shipmentsCount}
                          </span>
                          <span className={`font-bold ${c.remainingAmount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                            {fmt(c.remainingAmount)}
                          </span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-muted/30 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!isLoadingAllClients && viewMode === "table" && (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-card shadow-sm">
                    <th className="p-2.5 text-right font-bold whitespace-nowrap">
                      <ColumnHeader label="اسم العميل" col="name" enabled={filtersEnabled}
                        values={columnValues.name} active={columnFilters.name}
                        open={openFilterCol === "name"} onToggleOpen={() => setOpenFilterCol((v) => v === "name" ? null : "name")}
                        onToggleValue={toggleColumnFilterValue} onClear={clearColumnFilter}
                        sortable sortActive={sortCol === "name"} sortDir={sortDir} onSort={() => toggleSort("name")} />
                    </th>
                    <th className="p-2.5 text-right font-bold whitespace-nowrap">
                      <ColumnHeader label="الفون" col="phone" enabled={filtersEnabled}
                        values={columnValues.phone} active={columnFilters.phone}
                        open={openFilterCol === "phone"} onToggleOpen={() => setOpenFilterCol((v) => v === "phone" ? null : "phone")}
                        onToggleValue={toggleColumnFilterValue} onClear={clearColumnFilter} />
                    </th>
                    <th className="p-2.5 text-right font-bold whitespace-nowrap">
                      <ColumnHeader label="المحافظة" col="city" enabled={filtersEnabled}
                        values={columnValues.city} active={columnFilters.city}
                        open={openFilterCol === "city"} onToggleOpen={() => setOpenFilterCol((v) => v === "city" ? null : "city")}
                        onToggleValue={toggleColumnFilterValue} onClear={clearColumnFilter}
                        sortable sortActive={sortCol === "city"} sortDir={sortDir} onSort={() => toggleSort("city")} />
                    </th>
                    <th className="p-2.5 text-right font-bold whitespace-nowrap">
                      <ColumnHeader label="عدد الشحنات" col="shipmentsCount" enabled={false}
                        values={[]} open={false} onToggleOpen={() => {}} onToggleValue={() => {}} onClear={() => {}}
                        sortable sortActive={sortCol === "shipmentsCount"} sortDir={sortDir} onSort={() => toggleSort("shipmentsCount")} />
                    </th>
                    <th className="p-2.5 text-right font-bold whitespace-nowrap">
                      <ColumnHeader label="إجمالي القيمة" col="totalAmount" enabled={false}
                        values={[]} open={false} onToggleOpen={() => {}} onToggleValue={() => {}} onClear={() => {}}
                        sortable sortActive={sortCol === "totalAmount"} sortDir={sortDir} onSort={() => toggleSort("totalAmount")} />
                    </th>
                    <th className="p-2.5 text-right font-bold whitespace-nowrap">
                      <ColumnHeader label="المحصَّل" col="collectedAmount" enabled={false}
                        values={[]} open={false} onToggleOpen={() => {}} onToggleValue={() => {}} onClear={() => {}}
                        sortable sortActive={sortCol === "collectedAmount"} sortDir={sortDir} onSort={() => toggleSort("collectedAmount")} />
                    </th>
                    <th className="p-2.5 text-right font-bold whitespace-nowrap">
                      <ColumnHeader label="المتبقي" col="remainingAmount" enabled={false}
                        values={[]} open={false} onToggleOpen={() => {}} onToggleValue={() => {}} onClear={() => {}}
                        sortable sortActive={sortCol === "remainingAmount"} sortDir={sortDir} onSort={() => toggleSort("remainingAmount")} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((c, idx) => {
                    const pct = c.totalAmount > 0 ? Math.min(100, Math.round((c.collectedAmount / c.totalAmount) * 100)) : 0;
                    return (
                      <tr
                        key={c.phone}
                        className={`border-b border-border/40 hover:bg-primary/5 cursor-pointer transition-colors ${idx % 2 === 0 ? "bg-transparent" : "bg-muted/10"}`}
                        onClick={() => selectPhone(c.phone)}
                      >
                        <td className="p-2.5">
                          <div className="flex items-center gap-2">
                            <ClientAvatar name={c.name} />
                            <span className="font-bold hover:underline decoration-dotted underline-offset-2">{c.name}</span>
                          </div>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="w-3 h-3" /> {c.phone}
                          </span>
                        </td>
                        <td className="p-2.5">
                          {c.city ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-muted-foreground" /> {c.city}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-2.5">
                          <Badge variant="outline" className="font-bold">{c.shipmentsCount}</Badge>
                        </td>
                        <td className="p-2.5 font-bold whitespace-nowrap">{fmt(c.totalAmount)}</td>
                        <td className="p-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span>{fmt(c.collectedAmount)}</span>
                            <div className="w-12 h-1.5 rounded-full bg-muted/30 overflow-hidden hidden md:block">
                              <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className={`font-bold px-2 py-0.5 rounded-md ${c.remainingAmount > 0 ? "text-amber-400 bg-amber-900/10" : "text-emerald-400 bg-emerald-900/10"}`}>
                            {fmt(c.remainingAmount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredClients.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {tableFilter ? "مفيش نتائج مطابقة" : "لا يوجد عملاء"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
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
                <button
                  className="font-bold text-lg flex items-center gap-2 hover:underline decoration-dotted underline-offset-4"
                  onClick={() => navigate(`/finance/client-account-sheet/detail/${encodeURIComponent(activePhone)}`)}
                >
                  <User className="w-4 h-4 text-primary" /> {data.client.name}
                </button>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  {data.client.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {data.client.phone}</span>}
                  {data.client.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {data.client.city}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <Button
                  variant="outline" size="sm"
                  onClick={() => navigate(`/finance/client-account-sheet/detail/${encodeURIComponent(activePhone)}`)}
                  className="gap-2"
                >
                  <BarChart3 className="w-4 h-4" /> تفاصيل الحساب
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                  <Printer className="w-4 h-4" /> طباعة
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2">
                  <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
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
              <StatBox label="الجاري" value={data.stats.delayedOrInDelivery} icon={Truck} color="#3b82f6" />
              <StatBox label="مرتجع لم يصل" value={data.stats.returnedNotReceived} icon={RotateCcw} color="#ef4444" />
              <StatBox label="الجديد" value={data.stats.newOrders} icon={Package} color="#f59e0b" />
              <StatBox label="الإجمالي" value={data.stats.totalOrders} icon={ListOrdered} color="#10b981" />
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
                  <th className="p-2.5 text-right font-bold">المندوب</th>
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
                  <tr
                    key={o.id}
                    className="border-b border-border/50 hover:bg-primary/5 cursor-pointer transition-colors"
                    onClick={() => setDetailOrder(o)}
                  >
                    <td className="p-2.5 font-bold hover:underline decoration-dotted underline-offset-2">{o.customerName}</td>
                    <td className="p-2.5">{o.phone || "—"}</td>
                    <td className="p-2.5">{o.city || "—"}</td>
                    <td className="p-2.5 max-w-[160px] truncate" title={o.address ?? ""}>{o.address || "—"}</td>
                    <td className="p-2.5">{o.senderName || "—"}</td>
                    <td className="p-2.5">{o.warehouseName || "—"}</td>
                    <td className="p-2.5">
                      {o.assignedUserName
                        ? <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 bg-primary/10 text-primary"><UserCog className="w-3 h-3" /> {o.assignedUserName}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2.5">{fmt(o.unitPrice)}</td>
                    <td className="p-2.5 font-bold">{fmt(o.totalPrice)}</td>
                    <td className="p-2.5">{fmt(o.shippingCost)}</td>
                    <td className="p-2.5 print:hidden" onClick={(e) => e.stopPropagation()}>
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
                  <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">لا يوجد أوردرات</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* Dialog تفاصيل الأوردر — تصميم فاتورة احترافية بهوية STARK */}
      <Dialog open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden gap-0 border-border">
          {detailOrder && (() => {
            const o = detailOrder;
            const net = Number(o.totalPrice ?? 0) - Number(o.shippingCost ?? 0);
            const cfg = STATUS_CFG[o.status] ?? { label: o.status, color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border" };
            const collectPct = Number(o.totalPrice) > 0 && o.collectedAmount != null
              ? Math.min(100, Math.round((Number(o.collectedAmount) / Number(o.totalPrice)) * 100))
              : null;
            return (
              <>
                {/* هيدر داكن بهوية الشركة */}
                <div className="relative bg-[#0b0f19] px-6 pt-6 pb-5 overflow-hidden">
                  <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-primary/10 blur-2xl" />
                  <div className="absolute -bottom-14 -right-10 w-48 h-48 rounded-full bg-primary/5 blur-2xl" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-white">
                        <span className="text-lg font-black tracking-wide">STARK</span>
                        <span className="text-[10px] text-white/40 font-medium">كشف تفاصيل شحنة</span>
                      </div>
                      <p className="text-[11px] text-white/50 mt-2 flex items-center gap-1.5">
                        <Hash className="w-3 h-3" /> أوردر #{o.id}
                        {o.invoiceNumber && <span className="text-white/25">•</span>}
                        {o.invoiceNumber && <span>فاتورة {o.invoiceNumber}</span>}
                      </p>
                      <p className="text-[11px] text-white/40 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        {new Date(o.createdAt).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-[11px] shrink-0 ${cfg.border} ${cfg.bg} ${cfg.color} px-2.5 py-1`}>
                      {cfg.label}
                    </Badge>
                  </div>

                  {/* بطاقة العميل داخل الهيدر */}
                  <div className="relative mt-4 flex items-center gap-3 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-3">
                    <ClientAvatar name={o.customerName} />
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="text-sm font-black text-white truncate">{o.customerName}</DialogTitle>
                      <p className="text-[11px] text-white/50 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" /> {o.phone || "—"}
                        {o.city && <span className="text-white/25 mx-1">•</span>}
                        {o.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {o.city}</span>}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 max-h-[56vh] overflow-y-auto">
                  {/* قسم: بيانات الشحن */}
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Truck className="w-3 h-3" /> بيانات الشحن
                  </p>
                  <div className="rounded-xl border border-border overflow-hidden mb-4">
                    <DetailRow icon={Building2} label="العنوان" value={o.address || "—"} />
                    <DetailRow icon={Send} label="اسم الراسل" value={o.senderName || "—"} />
                    <DetailRow icon={Warehouse} label="الفرع المستلم منه" value={o.warehouseName || "—"} />
                    <DetailRow
                      icon={UserCog}
                      label="المندوب"
                      value={o.assignedUserName
                        ? <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 bg-primary/10 text-primary"><UserCog className="w-3 h-3" /> {o.assignedUserName}</Badge>
                        : "—"}
                    />
                    <DetailRow icon={Package} label="المنتج" value={o.product || "—"} />
                  </div>

                  {/* قسم: الحساب المالي */}
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Receipt className="w-3 h-3" /> الحساب المالي
                  </p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="p-3.5 space-y-0.5">
                      <DetailRow icon={DollarSign} label="سعر الشحنة" value={fmt(o.unitPrice)} />
                      <DetailRow icon={Package} label="قيمة الشحنة" value={fmt(o.totalPrice)} highlight />
                      <DetailRow icon={Truck} label="قيمة الشحن" value={fmt(o.shippingCost)} />
                      <DetailRow
                        icon={Wallet}
                        label="المحصَّل فعلياً"
                        value={o.collectedAmount != null ? fmt(o.collectedAmount) : "لم يُحدَّد"}
                        color={o.collectedAmount != null ? "#10b981" : undefined}
                      />
                    </div>

                    {collectPct != null && (
                      <div className="px-3.5 pb-3">
                        <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${collectPct}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 text-left">{collectPct}% من قيمة الشحنة</p>
                      </div>
                    )}

                    {/* الصافي — بارز زي إجمالي فاتورة */}
                    <div className="flex items-center justify-between px-3.5 py-3.5 bg-primary/5 border-t border-border">
                      <span className="flex items-center gap-2 text-sm font-black">
                        <Receipt className="w-4 h-4 text-primary" /> صافي المستحق
                      </span>
                      <span className="text-xl font-black text-primary">{fmt(net)}</span>
                    </div>
                  </div>

                  {o.notes && (
                    <div className="mt-4 rounded-xl border border-amber-700/30 bg-amber-900/10 p-3.5">
                      <p className="text-[11px] text-amber-400 flex items-center gap-1.5 font-black mb-1">
                        <StickyNote className="w-3.5 h-3.5" /> ملاحظات
                      </p>
                      <p className="text-xs text-foreground/90 leading-relaxed">{o.notes}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-border bg-muted/5">
                  <p className="text-[10px] text-muted-foreground">صادر إلكترونيًا عبر نظام STARK</p>
                  <Button variant="outline" size="sm" onClick={() => setDetailOrder(null)}>إغلاق</Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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

    {/* ── فاتورة الطباعة الاحترافية — تظهر فقط عند الطباعة ── */}
    {hasSearch && data?.client && (
      <div className="hidden print:block print-invoice" dir="rtl">
        <style>{`
          @media print {
            @page { size: A4; margin: 12mm; }
            body { background: #fff !important; }
          }
          .print-invoice {
            font-family: 'Cairo', 'Tahoma', sans-serif;
            color: #111;
            background: #fff;
          }
          .print-invoice * { color: #111 !important; box-shadow: none !important; }
          .inv-header {
            display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 3px solid #111; padding-bottom: 14px; margin-bottom: 18px;
          }
          .inv-brand { font-size: 22px; font-weight: 900; letter-spacing: 0.5px; }
          .inv-sub { font-size: 11px; color: #555 !important; margin-top: 2px; }
          .inv-meta { text-align: left; font-size: 11px; line-height: 1.7; }
          .inv-meta b { font-size: 13px; }
          .inv-client {
            display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;
            border: 1px solid #ccc; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px;
            font-size: 12px;
          }
          .inv-client .label { color: #666 !important; font-size: 10px; display: block; }
          .inv-client .value { font-weight: 700; }
          table.inv-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
          table.inv-table thead th {
            background: #111 !important; color: #fff !important;
            padding: 7px 6px; text-align: right; font-weight: 700;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          table.inv-table tbody td {
            padding: 6px; border-bottom: 1px solid #ddd; text-align: right;
          }
          table.inv-table tbody tr:nth-child(even) { background: #f7f7f7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .inv-totals {
            margin-top: 14px; display: flex; justify-content: flex-end;
          }
          .inv-totals table { border-collapse: collapse; font-size: 11.5px; min-width: 260px; }
          .inv-totals td { padding: 5px 10px; }
          .inv-totals .label-cell { color: #555 !important; }
          .inv-totals .value-cell { font-weight: 700; text-align: left; }
          .inv-totals .grand { border-top: 2px solid #111; font-size: 13px; font-weight: 900; }
          .inv-footer {
            margin-top: 28px; padding-top: 10px; border-top: 1px solid #ccc;
            font-size: 10px; color: #666 !important; display: flex; justify-content: space-between;
          }
        `}</style>

        <div className="inv-header">
          <div>
            <div className="inv-brand">STARK</div>
            <div className="inv-sub">كشف حساب عميل — Client Account Statement</div>
          </div>
          <div className="inv-meta">
            <div><b>تاريخ الطباعة:</b> {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</div>
            <div><b>عدد الأوردرات:</b> {fmt(data.orders.length)}</div>
          </div>
        </div>

        <div className="inv-client">
          <div>
            <span className="label">اسم العميل</span>
            <span className="value">{data.client.name}</span>
          </div>
          {data.client.phone && (
            <div>
              <span className="label">رقم الهاتف</span>
              <span className="value">{data.client.phone}</span>
            </div>
          )}
          {data.client.city && (
            <div>
              <span className="label">المحافظة</span>
              <span className="value">{data.client.city}</span>
            </div>
          )}
          {data.client.address && (
            <div>
              <span className="label">العنوان</span>
              <span className="value">{data.client.address}</span>
            </div>
          )}
        </div>

        <table className="inv-table">
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ</th>
              <th>المنتج</th>
              <th>الراسل</th>
              <th>المندوب</th>
              <th>قيمة الشحنة</th>
              <th>قيمة الشحن</th>
              <th>المحصَّل</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((o, i) => (
              <tr key={o.id}>
                <td>{i + 1}</td>
                <td>{new Date(o.createdAt).toLocaleDateString("ar-EG")}</td>
                <td>{o.product || "—"}</td>
                <td>{o.senderName || "—"}</td>
                <td>{o.assignedUserName || "—"}</td>
                <td>{fmt(o.totalPrice)}</td>
                <td>{fmt(o.shippingCost)}</td>
                <td>{o.collectedAmount != null ? fmt(o.collectedAmount) : "—"}</td>
                <td>{STATUS_CFG[o.status]?.label ?? o.status}</td>
              </tr>
            ))}
            {data.orders.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "16px" }}>لا يوجد أوردرات</td></tr>
            )}
          </tbody>
        </table>

        <div className="inv-totals">
          <table>
            <tbody>
              <tr>
                <td className="label-cell">إجمالي قيمة الشحنات</td>
                <td className="value-cell">{fmt(printTotals.totalValue)}</td>
              </tr>
              <tr>
                <td className="label-cell">إجمالي قيمة الشحن</td>
                <td className="value-cell">{fmt(printTotals.totalShipping)}</td>
              </tr>
              <tr>
                <td className="label-cell">إجمالي المحصَّل</td>
                <td className="value-cell">{fmt(printTotals.totalCollected)}</td>
              </tr>
              <tr className="grand">
                <td className="label-cell">الصافي</td>
                <td className="value-cell">{fmt(printTotals.totalValue - printTotals.totalShipping)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="inv-footer">
          <span>تم إصدار هذا الكشف إلكترونيًا عبر نظام STARK</span>
          <span>صفحة 1</span>
        </div>
      </div>
    )}
    </>
  );
}
