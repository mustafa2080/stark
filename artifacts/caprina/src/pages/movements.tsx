import { useState, useCallback, useMemo, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import {
  ArrowDownCircle, ArrowUpCircle, BarChart3, CalendarDays,
  Filter, Package, Plus, X, TrendingDown, TrendingUp, Activity, Printer, Pencil,
  ArrowRightLeft, Trash2, CheckSquare, ChevronUp, ChevronDown, Warehouse as WarehouseIcon,
  Search, PackageCheck, Loader2, MapPin,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { movementsApi, productsApi, warehousesApi, shippingApi, shipmentsApi, variantsApi, type MovementType, type MovementReason, type InventoryMovement, type Shipment } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// ─── Label helpers ────────────────────────────────────────────────────────────

const REASON_LABELS: Record<MovementReason, string> = {
  sale:         "بيع",
  partial_sale: "بيع جزئي",
  return:       "مرتجع",
  manual_in:    "إضافة يدوية",
  manual_out:   "خصم يدوي",
  adjustment:   "تسوية",
  to_shipping:  "تحويل لشركة الشحن",
  from_shipping:"إرجاع من شركة الشحن",
  damaged:      "تالف",
  transfer:     "تحويل بين مواقع",
};

const REASON_COLORS: Record<MovementReason, string> = {
  sale:         "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  partial_sale: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
  return:       "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  manual_in:    "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800",
  manual_out:   "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  adjustment:   "bg-muted text-muted-foreground border-border",
  to_shipping:  "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  from_shipping:"bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800",
  damaged:      "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
  transfer:     "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800",
};

const formatQty = (type: MovementType, qty: number) =>
  type === "IN" ? `+${qty}` : `-${qty}`;

const formatNum = (n: number) =>
  new Intl.NumberFormat("ar-EG").format(n);

/**
 * يحوّل التاريخ القادم من الـ API بشكل صحيح.
 * MariaDB datetime لا يحتوي على timezone — القيمة مخزونة بتوقيت السيرفر (UTC أو EET).
 * لو الـ string مش فيه 'Z' ولا offset → نضيف 'Z' عشان JS يعاملها كـ UTC.
 */
function parseMovementDate(raw: string | Date): Date {
  if (raw instanceof Date) return raw;
  // لو مفيش timezone indicator → افترض UTC
  if (typeof raw === "string" && !raw.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(raw)) {
    return new Date(raw + "Z");
  }
  return new Date(raw);
}

/** عرض التاريخ بالتوقيت المصري EET = UTC+2 (أو EEST = UTC+3 في الصيف) */
function formatMovementDate(raw: string | Date): string {
  const date = parseMovementDate(raw);
  return date.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ─── Column Filter Types & Component ─────────────────────────────────────────
type ColKey = "date" | "type" | "product" | "variant" | "qty" | "reason" | "order" | "customer" | "phone" | "location" | "notes";
type ColFilters = Record<ColKey, Set<string>>;

// ColFilterBtn معمول generic (<K extends string>) عشان يتقدر يتستخدم مع أي
// نوع أعمدة (ColKey لجدول الحركات، أو ShipmentColKey لجدول الشحنات جوه حاوية
// نقل الشحنات) من غير تكرار نفس الكومبوننت مرتين.
function ColFilterBtn<K extends string>({ col, colFilters, getColOptions, toggleColFilter, clearColFilter }: {
  col: K;
  colFilters: Record<K, Set<string>>;
  getColOptions: (col: K) => string[];
  toggleColFilter: (col: K, val: string) => void;
  clearColFilter: (col: K) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // بدل ما نعمل createPortal لـ document.body دايمًا (اللي بيخرج البانل من
  // شجرة الـ FocusScope بتاع أي Radix Dialog مفتوح ويخليه "مرفوض" منه)،
  // بنلاقي أقرب [role="dialog"] مفتوح فعليًا وقت الضغط على الزرار ونعمل
  // الـ portal جواه. كده Radix بيعتبر البانل جزء طبيعي من شجرته فمايحاولش
  // يرجّع الفوكس منه، ومفيش داعي نتسابق مع الـ FocusScope بـ event listeners.
  // لو الزرار مش جوه أي Dialog (استخدام عادي برة مودال)، بيرجع document.body
  // زي ما كان بالظبط — فمفيش أي كسر لأي استخدام حالي.
  const [portalTarget, setPortalTarget] = useState<Element>(() =>
    typeof document !== "undefined" ? document.body : (null as unknown as Element)
  );
  // panelStyle بيتحسب ديناميكيًا (بدل top/left ثابتين) عشان يراعي حدود
  // الشاشة الفعلية من كل الاتجاهات: لو مفيش مساحة كافية تحت الزرار، البانل
  // بيفتح لفوق بدل ما ينزل تحت حافة الشاشة ويتقطع. maxHeight بيتحسب هو
  // كمان من المساحة الفعلية المتاحة بدل رقم ثابت، عشان الـ scroll الداخلي
  // يبقى له معنى (مفيش جزء "مقطوع" برة الشاشة أصلًا).
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({ top: 0, left: 0 });
  const active = colFilters[col].size > 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ملحوظة: كان هنا useEffect بيحاول يسبق Radix's FocusScope بـ
  // stopImmediatePropagation على focusin/pointerdown/keydown مسجلة على
  // window، عشان نمنعه يرجّع الفوكس بالقوة لجوه الـ Dialog كل ما نحاول
  // نضغط أو نكتب جوه البانل. اتأكد إنه مش شغال لأن Radix مسجل هو كمان على
  // window بنفس مرحلة الـ capture، وسبقنا بالتسجيل زمنيًا (وقت ما الـ Dialog
  // نفسه يتفتح، قبل ما بانل الفلتر يتفتح أصلاً) — فبينفذ هو الأول دايمًا
  // بغض النظر عن أي شيء تاني. الحل الجذري الفعلي مش إننا نتسابق مع Radix،
  // لكن إننا خلينا الـ portal (تحت) يترندر جوه شجرة الـ Dialog نفسها (عن
  // طريق portalTarget) بدل document.body، فـ Radix بقى يعتبر البانل جزء
  // طبيعي من الـ scope بتاعه ومابيحاولش يرجّع الفوكس منه أصلاً.

  // React's onWheel prop بيتسجل كـ passive listener افتراضيًا في المتصفحات
  // الحديثة، وده بيخلي e.preventDefault() جواه يتجاهله المتصفح تمامًا (بدون
  // أي خطأ ظاهر، بس من غير تأثير حقيقي) — وده كان بيخلي حركة العجلة تكمل
  // طريقها لأقرب عنصر تاني خلف البانل بصريًا (الجدول) حتى بعد إضافة
  // preventDefault/stopPropagation كـ prop عادي. الحل الوحيد المضمون هو
  // تسجيل الـ listener يدويًا بـ addEventListener مع { passive: false }
  // صراحة، وده بيتاح بس لما نستخدم الـ DOM API مباشرة مش الـ React prop.
  // نفس مبدأ الـ bypass اللي فوق: نسجل على window بمرحلة الـ capture عشان
  // نسبق أي listener تاني (زي overflow-y-auto بتاع جدول الشحنات تحت البانل)
  // ونمنعه يستحوذ على حركة العجلة أصلاً. التسجيل على listRef لوحده (زي
  // قبل كده) كان بيوقف الانتشار من جوه العنصر، لكن معتمدًا على إن الـ
  // event.target يبقى فعلاً جوه البانل — ولو فيه أي عنصر تاني (الجدول
  // تحت الـ portal) بياخد الـ event الأول بسبب ترتيب الـ DOM/الـ
  // event-delegation، السكرول كان بيسرّب للجدول. التسجيل على window
  // بالـ capture هنا بيضمن تنفيذنا الأول دايمًا، بنفس منطق الـ
  // pointerdown/focusin/keydown اللي فوق بالظبط.
  useEffect(() => {
    if (!open) return;
    const onWheel = (e: WheelEvent) => {
      if (!panelRef.current || !panelRef.current.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = listRef.current;
      if (el) el.scrollTop += e.deltaY;
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
  }, [open]);

  const PANEL_MARGIN = 8; // مسافة أمان من حواف الشاشة
  const PANEL_GAP = 6;    // مسافة بين الزرار والبانل

  // البانل بيتعمله createPortal لـ document.body وposition:fixed، يعني هو
  // مش محبوس بصريًا جوه أي container داخلي (زي جدول بارتفاع محدود 45vh جوه
  // مودال أكبر) — البانل ظاهر فوق كل حاجة. فالمساحة الصح اللي نحسب عليها
  // هي الشاشة (viewport) كاملة، مش أقرب overflow-y-auto (اللي ممكن يكون
  // صغير جدًا، زي جدول 45vh جوه مودال 90vh، فيدي مساحة أصغر بكتير من
  // الحقيقة الظاهرة على الشاشة فعليًا).
  const MIN_PANEL_HEIGHT = 220; // كفاية لهيدر + ترتيب + بحث + كذا صف مع سكرول حقيقي

  const handleOpen = () => {
    if (!open && btnRef.current) {
      // أقرب Dialog مفتوح فعليًا حوالين الزرار (Radix بيحط role="dialog" على
      // الـ DialogContent). لو موجود، بنعمل الـ portal جواه بدل document.body
      // — كده البانل بيبقى جزء من شجرة الـ FocusScope فمايترفضش منها.
      const dialogEl = btnRef.current.closest('[role="dialog"]');
      setPortalTarget(dialogEl ?? document.body);

      const r = btnRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 640;
      const panelW = isMobile ? window.innerWidth - PANEL_MARGIN * 2 : 224;

      // نحاول نحاذي حافة البانل اليمنى مع حافة الزرار اليمنى (طبيعي في RTL:
      // البانل يمتد من الزرار لناحية الشمال) بدل ما نحاذي الحافة الشمال زي
      // كود LTR. لو ده هيخرّج البانل برة الشاشة من أي ناحية، نلزّقه بأقرب
      // حافة (يمين أو شمال) مع هامش أمان — بدل ما نعتمد بس على r.left اللي
      // بيطلّع البانل خارج حدود الشاشة لما الزرار يبقى قريب من حافة الشاشة
      // اليمنى (عمود "الكود" أول عمود في جدول RTL).
      const idealLeft = r.right - panelW;
      const left = isMobile
        ? PANEL_MARGIN
        : Math.max(PANEL_MARGIN, Math.min(idealLeft, window.innerWidth - panelW - PANEL_MARGIN));

      const spaceBelow = window.innerHeight - r.bottom - PANEL_GAP - PANEL_MARGIN;
      const spaceAbove = r.top - PANEL_GAP - PANEL_MARGIN;
      // نفتح لفوق لو المساحة تحت أقل من الحد الأدنى المريح والمساحة فوق أكبر منها فعليًا.
      const openUpward = spaceBelow < MIN_PANEL_HEIGHT && spaceAbove > spaceBelow;
      const availableSpace = Math.max(MIN_PANEL_HEIGHT, openUpward ? spaceAbove : spaceBelow);
      const maxHeight = Math.min(availableSpace, 420);

      // height (مش بس maxHeight) ضرورية هنا: من غيرها، الـ flex-column
      // container بياخد ارتفاعه من مجموع محتواه الطبيعي (هيدر+ترتيب+بحث+كل
      // الخيارات) طول ما هو أصغر من الـ max-height، فـ flex-1 الداخلية
      // (القايمة القابلة للسكرول) ملهاش أي مساحة "فايضة" تتقص وتعمل scroll
      // فيها — البانل كله كان بيتمدد بدل ما يقف عند حد ثابت ويسيب القايمة تسكرول.
      const style: React.CSSProperties = {
        left,
        height: maxHeight,
        maxHeight,
      };
      if (openUpward) {
        style.bottom = window.innerHeight - r.top + PANEL_GAP;
      } else {
        style.top = r.bottom + PANEL_GAP;
      }
      setPanelStyle(style);
    }
    setOpen(o => !o);
    setSearch("");
  };

  let opts = getColOptions(col);
  if (search) opts = opts.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  if (sort === "desc") opts = [...opts].reverse();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        title="فلتر"
        className={`flex items-center justify-center w-5 h-5 rounded transition-all shrink-0 ${active ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
      >{active ? (
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        )}
      </button>
      {open && portalTarget && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            ...panelStyle,
            zIndex: 2147483002,
            display: "flex",
            flexDirection: "column",
            // كان لازم pointerEvents: "auto" صراحة هنا زمان لأن الـ portal
            // كان بيروح لـ document.body، واللي Radix بيحط عليه
            // pointer-events: none وقت ما أي Dialog يفتح — فالبانل كان بيرث
            // القيمة دي ومفيش حدث ماوس بيوصله. دلوقتي الـ portal بيروح
            // لـ portalTarget (جوه الـ Dialog نفسه لو موجود)، فالمشكلة
            // مبقتش موجودة من الأساس، بس سايبينها كـ safety net مايضرش.
            pointerEvents: "auto",
          }}
          className="bg-background border border-border rounded-xl shadow-2xl text-[11px] w-[calc(100vw-16px)] sm:w-56 overflow-hidden"
          dir="rtl"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/20 shrink-0">
            <span className="text-[11px] font-bold text-foreground">فلتر العمود</span>
            {active && (
              <button type="button" onClick={() => clearColFilter(col)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-destructive hover:bg-destructive/10 transition-all">
                <X className="w-3 h-3" />مسح
              </button>
            )}
          </div>
          <div className="flex gap-1.5 p-2 border-b border-border/50 shrink-0">
            <button type="button" onClick={() => setSort("asc")}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] transition-all ${sort === "asc" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronUp className="w-2.5 h-2.5" />أ→ي
            </button>
            <button type="button" onClick={() => setSort("desc")}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] transition-all ${sort === "desc" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground hover:bg-muted/30"}`}>
              <ChevronDown className="w-2.5 h-2.5" />ي→أ
            </button>
          </div>
          <div className="px-2 pt-2 shrink-0">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث..."
                className="w-full h-7 text-[10px] pr-6 pl-2 rounded-lg border border-border bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary mb-1"
              />
            </div>
          </div>
          <div
            ref={listRef}
            className="overflow-y-auto overscroll-contain px-1.5 pb-2 pt-1 min-h-0 flex-1"
          >
            {opts.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-[10px]">لا توجد خيارات</p>
            ) : opts.map(val => (
              <label key={val} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={colFilters[col].has(val)}
                  onChange={() => toggleColFilter(col, val)}
                  className="w-3 h-3 accent-primary shrink-0"
                />
                <span className="truncate">{val}</span>
              </label>
            ))}
          </div>
        </div>,
        portalTarget
      )}
    </>
  );
}

// ─── Shipments Warehouse-Transfer Dialog ──────────────────────────────────────
// نقل شحنة واحدة أو عدة شحنات بين المخازن، مع انعكاس فوري على حالة الشحنة
// (تبقى "قيد الشحن في المخزن" ويظهر تحتها اسم المخزن الحالي في صفحة الشحنات).

// ── ترجمة حالات الشحنات (نفس خريطة warehouses.tsx) ──────────────────────────
const TRANSFER_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  waiting:          { label: "قيد الانتظار",       color: "text-muted-foreground", bg: "bg-muted/20" },
  confirmed:        { label: "مؤكدة",              color: "text-sky-600",          bg: "bg-sky-500/10" },
  picked_up:        { label: "تم الاستلام",         color: "text-blue-600",         bg: "bg-blue-500/10" },
  in_transit:       { label: "في الطريق",           color: "text-indigo-600",       bg: "bg-indigo-500/10" },
  out_for_delivery: { label: "مع المندوب",          color: "text-amber-600",        bg: "bg-amber-500/10" },
  warehouse_ready:  { label: "قيد الشحن فى المخزن", color: "text-orange-600",       bg: "bg-orange-500/10" },
  delivered:        { label: "مسلّمة",             color: "text-emerald-600",      bg: "bg-emerald-500/10" },
  returned:         { label: "مرتجع",              color: "text-red-600",          bg: "bg-red-500/10" },
  cancelled:        { label: "ملغية",              color: "text-gray-500",         bg: "bg-gray-500/10" },
  partial_delivered:{ label: "تسليم جزئي",          color: "text-violet-600",       bg: "bg-violet-500/10" },
  partial_received: { label: "مرتجع عن استلام جزئي", color: "text-teal-600",         bg: "bg-teal-500/10" },
};

// الحالات الوحيدة المسموحة في حاوية "نقل شحنات بين المخازن" — أي حالة تانية
// (في الطريق، مسلّمة، ملغية...) مش شحنة موجودة فعليًا في مخزن تقدر تنقلها.
const TRANSFERABLE_STATUSES = ["warehouse_ready", "returned", "partial_received"] as const;
type TransferStatusKey = typeof TRANSFERABLE_STATUSES[number];

const formatTransferCurrency = (value: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(value || 0);

// ─── فلاتر الأعمدة لجدول الشحنات (حاوية نقل الشحنات) — نفس نمط ColFilterBtn
// المستخدم في جدول الحركات الرئيسي، بأعمدة خاصة بجدول الشحنات.
type ShipmentColKey = "code" | "date" | "sender" | "receiver" | "phone" | "city" | "price";
type ShipmentColFilters = Record<ShipmentColKey, Set<string>>;
const EMPTY_SHIPMENT_COL_FILTERS: ShipmentColFilters = {
  code: new Set(), date: new Set(), sender: new Set(), receiver: new Set(),
  phone: new Set(), city: new Set(), price: new Set(),
};

function ShipmentTransferTableRow({
  shipment, checked, onToggle,
}: {
  shipment: Shipment;
  checked: boolean;
  onToggle: () => void;
}) {
  const s = shipment as any;
  const currentWarehouseName = s.warehouseName as string | undefined;
  const si = TRANSFER_STATUS_MAP[shipment.status];
  const shippingPrice = Number(s.totalAmount ?? s.shippingFee ?? 0);
  return (
    <TableRow
      className={`cursor-pointer border-border ${checked ? "bg-primary/5" : "hover:bg-muted/20"}`}
      onClick={onToggle}
    >
      <TableCell className="text-center p-2" onClick={e => e.stopPropagation()}>
        <Checkbox checked={checked} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell className="text-center font-mono text-xs text-primary font-bold whitespace-nowrap">
        {shipment.shipmentNumber ?? `#${shipment.id}`}
      </TableCell>
      <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
        {shipment.createdAt ? format(new Date(shipment.createdAt), "yyyy/MM/dd") : "—"}
      </TableCell>
      <TableCell className="text-center text-xs font-medium whitespace-nowrap">
        {shipment.senderName ?? "—"}
      </TableCell>
      <TableCell className="text-center text-xs font-medium whitespace-nowrap">
        {shipment.receiverName ?? "—"}
      </TableCell>
      <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap" dir="ltr">
        {shipment.receiverPhone ?? "—"}
      </TableCell>
      <TableCell className="text-center text-xs whitespace-nowrap">
        <span className="inline-flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
          {shipment.receiverCity ?? "—"}
        </span>
      </TableCell>
      <TableCell className="text-center text-xs font-bold text-primary whitespace-nowrap">
        {formatTransferCurrency(shippingPrice)}
      </TableCell>
      <TableCell className="text-center whitespace-nowrap">
        <span
          className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${si?.bg ?? "bg-muted"} ${si?.color ?? "text-muted-foreground"}`}
        >
          {si?.label ?? shipment.status}
        </span>
        {currentWarehouseName && (
          <div className="inline-flex items-center gap-1 text-[9px] font-semibold text-teal-600 dark:text-teal-400 mt-0.5">
            <WarehouseIcon className="w-2.5 h-2.5" />{currentWarehouseName}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function ShipmentsTransferDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // الحالات المسموحة في حاوية النقل: قيد الشحن في المخزن / مرتجع / مرتجع عن استلام جزئي فقط.
  // لا توجد قيمة "كل الحالات" — الافتراضي "قيد الشحن في المخزن" وهي الأكثر استخدامًا للنقل.
  const [statusFilter, setStatusFilter] = useState<TransferStatusKey>("warehouse_ready");
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<Set<number>>(new Set());
  // "" = لم يُختر مخزن بعد (لا توجد قيمة "كل الفروع"، ولا "بدون مخزن" كوجهة).
  const [fromWarehouseId, setFromWarehouseId] = useState<string>("");
  const [toWarehouseId, setToWarehouseId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // ─── فلاتر الأعمدة (زي الإكسيل): زرار "إنشاء فلتر" بيظهر أيقونة فلتر فوق
  // كل عمود؛ "إلغاء الفلتر" بيمسح كل الفلاتر المطبقة ويخفي الأيقونات.
  const [showShipmentColFilters, setShowShipmentColFilters] = useState(false);
  const [shipmentColFilters, setShipmentColFilters] = useState<ShipmentColFilters>(EMPTY_SHIPMENT_COL_FILTERS);
  const shipmentColFilterHasActive = Object.values(shipmentColFilters).some(s => s.size > 0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: warehousesApi.list,
  });

  // لو المستخدم اختار "نقل من" مخزن معيّن، نمنع اختيار نفس المخزن كوجهة —
  // ولو الوجهة الحالية بقت نفس المصدر، نفضّيها ليختار وجهة تانية.
  useEffect(() => {
    if (fromWarehouseId && toWarehouseId === fromWarehouseId) {
      setToWarehouseId("");
    }
  }, [fromWarehouseId]);

  // نعرض فقط الحالات المسموح نقلها (قيد الشحن في المخزن / مرتجع / مرتجع عن استلام جزئي)،
  // والافتراضي "قيد الشحن في المخزن". البحث (رقم شحنة/اسم/فون) بيشتغل جنب فلتر الحالة.
  const { data: shipmentsRes, isLoading } = useQuery({
    queryKey: ["shipments-for-transfer", debouncedSearch, statusFilter],
    queryFn: () => shipmentsApi.list({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      status: statusFilter,
      limit: 1000,
    }),
  });

  // استخراج قيمة نصية من الشحنة لعمود فلتر معيّن — نفس مبدأ getColVal في جدول
  // الحركات، لكن بأعمدة جدول الشحنات (الكود، التاريخ، الراسل، المستلم، الهاتف،
  // المحافظة، سعر الشحنة).
  const getShipmentColVal = useCallback((col: ShipmentColKey, s: Shipment): string => {
    switch (col) {
      case "code":     return s.shipmentNumber ?? `#${s.id}`;
      case "date":     return s.createdAt ? format(new Date(s.createdAt), "yyyy/MM/dd") : "—";
      case "sender":   return s.senderName ?? "—";
      case "receiver": return s.receiverName ?? "—";
      case "phone":    return s.receiverPhone ?? "—";
      case "city":     return s.receiverCity ?? "—";
      case "price":    return formatTransferCurrency(Number((s as any).totalAmount ?? (s as any).shippingFee ?? 0));
      default:         return "—";
    }
  }, []);

  // فلاتر "نقل من" (المخزن الحالي) والتاريخ + فلاتر الأعمدة (زي الإكسيل)
  // بتتطبق كلها على الفرونت — العدد محدود (limit 1000) فمفيش داعي لتعديل
  // الـ backend عشانهم.
  const shipments = useMemo(() => {
    let list = shipmentsRes?.data ?? [];
    if (fromWarehouseId) {
      list = list.filter(s => String((s as any).warehouseId ?? "") === fromWarehouseId);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter(s => s.createdAt && new Date(s.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter(s => s.createdAt && new Date(s.createdAt) <= to);
    }
    if (shipmentColFilterHasActive) {
      list = list.filter(s =>
        (Object.keys(shipmentColFilters) as ShipmentColKey[]).every(col => {
          const set = shipmentColFilters[col];
          if (set.size === 0) return true;
          return set.has(getShipmentColVal(col, s));
        })
      );
    }
    return list;
  }, [shipmentsRes, fromWarehouseId, dateFrom, dateTo, shipmentColFilters, shipmentColFilterHasActive, getShipmentColVal]);

  // خيارات كل عمود مبنية من كامل نتيجة البحث/الحالة (قبل فلاتر الأعمدة نفسها
  // وقبل فلاتر نقل-من/التاريخ) — زي الإكسيل بالظبط: قايمة الخيارات ثابتة
  // ومتأثرتش بفلاتر الأعمدة التانية المطبقة حاليًا.
  const getShipmentColOptions = useCallback((col: ShipmentColKey): string[] => {
    const base = shipmentsRes?.data ?? [];
    const vals = [...new Set(base.map(s => getShipmentColVal(col, s)))]
      .filter(v => v && v !== "—");
    return vals.sort((a, b) => a.localeCompare(b, "ar"));
  }, [shipmentsRes, getShipmentColVal]);

  const toggleShipmentColFilter = useCallback((col: ShipmentColKey, val: string) => {
    setShipmentColFilters(prev => {
      const next = new Set(prev[col]);
      next.has(val) ? next.delete(val) : next.add(val);
      return { ...prev, [col]: next };
    });
  }, []);

  const clearShipmentColFilter = useCallback((col: ShipmentColKey) => {
    setShipmentColFilters(prev => ({ ...prev, [col]: new Set() }));
  }, []);

  const toggleShipment = (id: number) => {
    setSelectedShipmentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllShipments = () => {
    if (selectedShipmentIds.size === shipments.length && shipments.length > 0) {
      setSelectedShipmentIds(new Set());
    } else {
      setSelectedShipmentIds(new Set(shipments.map(s => s.id)));
    }
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["shipments-for-transfer"] });
    qc.invalidateQueries({ queryKey: ["shipments-list"] });
    qc.invalidateQueries({ queryKey: ["shipments-stats"] });
    qc.invalidateQueries({ queryKey: ["warehouse-shipments"] });
    qc.invalidateQueries({ queryKey: ["warehouse-stats"] });
    qc.invalidateQueries({ queryKey: ["warehouses"] });
    qc.invalidateQueries({ queryKey: ["movements"] });
    qc.invalidateQueries({ queryKey: ["movements-totals"] });
  };

  const handleConfirm = async () => {
    if (selectedShipmentIds.size === 0) {
      toast({ title: "اختر شحنة واحدة على الأقل", variant: "destructive" });
      return;
    }
    // الوجهة إجبارية: مفيش نقل "بدون مخزن" — كان بيخلّي الشحنة تخرج من أي مخزن.
    if (!toWarehouseId) {
      toast({ title: "اختر المخزن المنقول إليه", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await warehousesApi.transferShipmentsBulk({
        shipmentIds: Array.from(selectedShipmentIds),
        toWarehouseId: Number(toWarehouseId),
        notes: notes.trim() || undefined,
      });
      invalidateAll();
      toast({
        title: `✅ تم نقل ${res.transferred} شحنة`,
        description: res.notFound.length > 0 ? `تعذّر العثور على ${res.notFound.length} شحنة` : undefined,
      });
      onClose();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const allSelected = shipments.length > 0 && selectedShipmentIds.size === shipments.length;

  // منع الإغلاق التلقائي عند الضغط بره الحاوية — الإغلاق بقى مخصص لزر (X) فقط
  // عشان منضيعش التحديدات لو المستخدم ضغط بالغلط برة الشاشة أثناء العمل.
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-[min(1400px,95vw)]! w-full max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <PackageCheck className="w-4 h-4 text-teal-600" />
              نقل شحنات بين المخازن
            </DialogTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* بحث + فلتر حالة */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث برقم الشحنة، اسم المستلم، أو رقم الفون..."
                className="h-9 text-sm pr-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as TransferStatusKey); setSelectedShipmentIds(new Set()); }}>
              <SelectTrigger className="h-9 text-xs w-52 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* فقط: قيد الشحن في المخزن / مرتجع / مرتجع عن استلام جزئي — مفيش "كل الحالات".
                    باقي الحالات مش شحنات موجودة فعليًا داخل مخزن تقدر تنقلها. */}
                {TRANSFERABLE_STATUSES.map((k) => (
                  <SelectItem key={k} value={k}>{TRANSFER_STATUS_MAP[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* فلاتر: نقل من (المخزن الحالي) + التاريخ من/إلى */}
          <div className="flex gap-2 flex-wrap">
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs flex items-center gap-1"><WarehouseIcon className="w-3 h-3" />نقل من</Label>
              <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر المخزن..." /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}{w.city ? ` — ${w.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs flex items-center gap-1"><CalendarDays className="w-3 h-3" />من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs flex items-center gap-1"><CalendarDays className="w-3 h-3" />إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>

          {/* جدول الشحنات القابلة للاختيار — نفس تصميم جدول الشحنات الرئيسي */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAllShipments} />
                تحديد الكل ({shipments.length})
              </label>
              <div className="flex items-center gap-2">
                {selectedShipmentIds.size > 0 && (
                  <span className="text-[11px] font-bold text-primary">{selectedShipmentIds.size} محدد</span>
                )}
                {shipments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (showShipmentColFilters) {
                        setShipmentColFilters(EMPTY_SHIPMENT_COL_FILTERS);
                      }
                      setShowShipmentColFilters(v => !v);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${showShipmentColFilters ? "border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10" : "border-primary/40 text-primary bg-primary/5 hover:bg-primary/10"}`}
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill={showShipmentColFilters ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    {showShipmentColFilters ? "إلغاء الفلتر" : "إنشاء فلتر"}
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[45vh] overflow-y-auto overflow-x-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />جاري التحميل...
                </div>
              ) : shipments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">لا توجد شحنات مطابقة</p>
              ) : (
                <Table className="min-w-[900px] text-xs">
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-10 text-center"></TableHead>
                      <TableHead className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1">الكود {showShipmentColFilters && <ColFilterBtn col="code" colFilters={shipmentColFilters} getColOptions={getShipmentColOptions} toggleColFilter={toggleShipmentColFilter} clearColFilter={clearShipmentColFilter} />}</div>
                      </TableHead>
                      <TableHead className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1">التاريخ {showShipmentColFilters && <ColFilterBtn col="date" colFilters={shipmentColFilters} getColOptions={getShipmentColOptions} toggleColFilter={toggleShipmentColFilter} clearColFilter={clearShipmentColFilter} />}</div>
                      </TableHead>
                      <TableHead className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1">الراسل {showShipmentColFilters && <ColFilterBtn col="sender" colFilters={shipmentColFilters} getColOptions={getShipmentColOptions} toggleColFilter={toggleShipmentColFilter} clearColFilter={clearShipmentColFilter} />}</div>
                      </TableHead>
                      <TableHead className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1">المستلم {showShipmentColFilters && <ColFilterBtn col="receiver" colFilters={shipmentColFilters} getColOptions={getShipmentColOptions} toggleColFilter={toggleShipmentColFilter} clearColFilter={clearShipmentColFilter} />}</div>
                      </TableHead>
                      <TableHead className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1">الهاتف {showShipmentColFilters && <ColFilterBtn col="phone" colFilters={shipmentColFilters} getColOptions={getShipmentColOptions} toggleColFilter={toggleShipmentColFilter} clearColFilter={clearShipmentColFilter} />}</div>
                      </TableHead>
                      <TableHead className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1">المحافظة {showShipmentColFilters && <ColFilterBtn col="city" colFilters={shipmentColFilters} getColOptions={getShipmentColOptions} toggleColFilter={toggleShipmentColFilter} clearColFilter={clearShipmentColFilter} />}</div>
                      </TableHead>
                      <TableHead className="text-center text-xs">
                        <div className="flex items-center justify-center gap-1">سعر الشحنة {showShipmentColFilters && <ColFilterBtn col="price" colFilters={shipmentColFilters} getColOptions={getShipmentColOptions} toggleColFilter={toggleShipmentColFilter} clearColFilter={clearShipmentColFilter} />}</div>
                      </TableHead>
                      <TableHead className="text-center text-xs">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shipments.map(s => (
                      <ShipmentTransferTableRow
                        key={s.id}
                        shipment={s}
                        checked={selectedShipmentIds.has(s.id)}
                        onToggle={() => toggleShipment(s.id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* المخزن الهدف */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><WarehouseIcon className="w-3 h-3" />نقل إلى المخزن</Label>
            <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن..." /></SelectTrigger>
              <SelectContent>
                {warehouses
                  .filter((w: any) => !fromWarehouseId || String(w.id) !== fromWarehouseId)
                  .map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}{w.city ? ` — ${w.city}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">ملاحظة (اختياري)</Label>
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="سبب النقل أو أي تفاصيل..."
              className="min-h-[50px] text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-xs h-8">إلغاء</Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || selectedShipmentIds.size === 0 || !toWarehouseId}
            className="text-xs h-8 gap-1 bg-teal-600 hover:bg-teal-700 text-white"
          >
            <ArrowRightLeft className="w-3 h-3" />
            {saving ? "جاري النقل..." : `نقل ${selectedShipmentIds.size || ""} شحنة`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── صف الجدول كمكوّن منفصل + memo ─────────────────────────────────────────────
// فحص بطء الماوس/التهنيج عند تحديد الشحنات: السبب كان رسم كل الـ 76+ صف من
// جديد عند أي تحديد واحد، لأن الصف كان JSX مضمّن (inline) جوه خريطة map()
// في الكومبوننت الرئيسي بدون أي memoization — أي setState (زي toggleSelect)
// كان بيعيد رسم الجدول بالكامل. الحل: فصل الصف في مكوّن مستقل بـ React.memo،
// وتمرير `checked` كـ boolean بدل الـ Set كامل (selectedIds) عشان الصف
// ميعملش re-render إلا لو حالة التحديد الخاصة بيه هو نفسه اتغيرت.
interface MovementTableRowProps {
  m: InventoryMovement;
  checked: boolean;
  isAdmin: boolean;
  onToggleSelect: (id: number) => void;
  onEdit: (m: InventoryMovement) => void;
  onDelete: (id: number) => void;
  deleteDisabled: boolean;
}

const MovementTableRow = memo(function MovementTableRow({
  m, checked, isAdmin, onToggleSelect, onEdit, onDelete, deleteDisabled,
}: MovementTableRowProps) {
  const isTransfer = m.reason === "transfer";
  return (
    <TableRow className={`border-border hover:bg-muted/20 ${checked ? "bg-destructive/5" : ""}`}>
      {isAdmin && (
        <TableCell className="text-center">
          <Checkbox
            checked={checked}
            onCheckedChange={() => onToggleSelect(m.id)}
            aria-label="تحديد الصف"
          />
        </TableCell>
      )}
      <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
        {formatMovementDate(m.createdAt)}
      </TableCell>
      <TableCell className="text-center">
        {isTransfer ? (
          <div className="flex items-center justify-center gap-1">
            <ArrowRightLeft className="w-3 h-3 text-violet-600 dark:text-violet-400" />
            <span className="text-[9px] font-bold text-violet-600 dark:text-violet-400">تحويل</span>
          </div>
        ) : m.type === "IN" ? (
          <div className="flex items-center justify-center gap-1">
            <TrendingDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">دخول</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1">
            <TrendingUp className="w-3 h-3 text-red-600 dark:text-red-400" />
            <span className="text-[9px] font-bold text-red-600 dark:text-red-400">خروج</span>
          </div>
        )}
      </TableCell>
      <TableCell className="text-[11px] font-semibold truncate max-w-[96px]">{m.product}</TableCell>
      <TableCell className="text-[11px] text-muted-foreground">
        {m.color || m.size ? (
          <div className="flex items-center gap-1">
            {m.color && <Badge variant="outline" className="text-[9px] border-border px-1">{m.color}</Badge>}
            {m.size && <Badge variant="outline" className="text-[9px] border-primary/40 text-primary px-1">{m.size}</Badge>}
          </div>
        ) : "—"}
      </TableCell>
      <TableCell className="text-center">
        <span className={`font-bold text-[12px] ${isTransfer ? "text-violet-600 dark:text-violet-400" : m.type === "IN" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {isTransfer ? m.quantity : formatQty(m.type, m.quantity)}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="outline" className={`text-[9px] font-bold border px-1 ${REASON_COLORS[m.reason] ?? "bg-muted text-muted-foreground border-border"}`}>
          {REASON_LABELS[m.reason] ?? m.reason}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        {m.shipmentId ? (
          <a href={`/shipments/${m.shipmentId}`} onClick={e => e.stopPropagation()} className="text-[9px] font-mono text-teal-600 dark:text-teal-400 hover:underline">
            {m.shipmentNumber ?? `#${m.shipmentId}`}
          </a>
        ) : m.orderId ? (
          <a href={`/orders/${m.orderId}`} onClick={e => e.stopPropagation()} className="text-[9px] font-mono text-primary hover:underline">
            #{String(m.orderId).padStart(4, "0")}
          </a>
        ) : "—"}
      </TableCell>
      <TableCell className="text-[11px] truncate max-w-[80px]">
        {m.customerName ?? "—"}
      </TableCell>
      <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap text-right" style={{ unicodeBidi: "plaintext" }}>
        {m.customerPhone ?? "—"}
      </TableCell>
      <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
        {isTransfer && m.fromLocation && m.toLocation ? (
          <div className="flex items-center gap-1 text-violet-700 dark:text-violet-300 font-medium">
            <span className="text-[9px]">{m.fromLocation}</span>
            <ArrowRightLeft className="w-2.5 h-2.5 shrink-0" />
            <span className="text-[9px]">{m.toLocation}</span>
          </div>
        ) : (m as any).warehouseName ?? "—"}
      </TableCell>
      <TableCell className="text-[11px] text-muted-foreground max-w-[80px] truncate">{m.notes || "—"}</TableCell>
      <TableCell className="text-center">
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10" title="تعديل" onClick={() => onEdit(m)}>
          <Pencil className="w-3 h-3" />
        </Button>
      </TableCell>
      {isAdmin && (
        <TableCell className="text-center">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="حذف" onClick={() => onDelete(m.id)} disabled={deleteDisabled}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function Movements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  // ─── Bulk selection state ─────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ─── نقل شحنات بين المخازن ────────────────────────────────────────────────
  const [showShipmentsTransfer, setShowShipmentsTransfer] = useState(false);

  // useCallback هنا مش رفاهية: toggleSelect بتتمرر كـ prop لكل صف في الجدول (76+ صف)،
  // ولو الـ reference بتاعها بيتغير كل render هيكسر الـ React.memo على MovementTableRow
  // ويرجّعنا لنفس مشكلة إعادة رسم كل الصفوف عند أي تحديد.
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.size === movements.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(movements.map((m: InventoryMovement) => m.id)));
    }
  };

  // Dialog mode: "manual" | "transfer"
  const [dialogMode, setDialogMode] = useState<"manual" | "transfer">("manual");

  // Filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterReason, setFilterReason] = useState<string>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // ─── بحث نصي شامل (اسم المنتج، اللون/المقاس، الموقع، الملاحظات، رقم الأوردر) ──
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);


  const [showDialog, setShowDialog] = useState(false);
  const [editingMovement, setEditingMovement] = useState<InventoryMovement | null>(null);
  const [form, setForm] = useState({
    product: "",
    color: "",
    size: "",
    quantity: "1",
    type: "IN" as MovementType,
    reason: "manual_in" as MovementReason,
    notes: "",
    productId: "",
    variantId: "",
    warehouseId: "",
    fromLocation: "",
    toLocation: "",
  });

  const filters = useMemo(() => ({
    type: filterType !== "all" ? filterType as MovementType : undefined,
    reason: filterReason !== "all" ? filterReason as MovementReason : undefined,
    productId: filterProduct !== "all" ? parseInt(filterProduct) : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [filterType, filterReason, filterProduct, dateFrom, dateTo]);

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movements", filters],
    queryFn: () => movementsApi.list(filters),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: totals } = useQuery({
    queryKey: ["movements-totals", filters],
    queryFn: () => movementsApi.totals(filters),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: productsApi.list,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: warehousesApi.list,
  });

  const { data: shippingCompanies = [] } = useQuery({
    queryKey: ["shipping-companies"],
    queryFn: shippingApi.list,
  });

  const { data: allVariants } = useQuery({
    queryKey: ["variants"],
    queryFn: variantsApi.listAll,
  });

  // Build location options: warehouses + shipping companies
  const locationOptions = useMemo(() => {
    const wh = (warehouses as any[]).map((w: any) => ({ value: `مخزن: ${w.name}`, label: `🏭 مخزن: ${w.name}` }));
    const sc = (shippingCompanies as any[]).map((c: any) => ({ value: `شركة شحن: ${c.name}`, label: `🚚 شركة شحن: ${c.name}` }));
    return [...wh, ...sc];
  }, [warehouses, shippingCompanies]);

  // ─── Excel-style Column Filters ──────────────────────────────────────────
  const [colFilters, setColFilters] = useState<ColFilters>({
    date: new Set(), type: new Set(), product: new Set(), variant: new Set(),
    qty: new Set(), reason: new Set(), order: new Set(), customer: new Set(), phone: new Set(),
    location: new Set(), notes: new Set(),
  });
  const [showColFilters, setShowColFilters] = useState(false);
  const colFilterHasActive = Object.values(colFilters).some(s => s.size > 0);

  const getColVal = useCallback((col: ColKey, m: InventoryMovement): string => {
    const isTransfer = m.reason === "transfer";
    switch (col) {
      case "date":     return formatMovementDate(m.createdAt);
      case "type":     return isTransfer ? "تحويل" : m.type === "IN" ? "دخول" : "خروج";
      case "product":  return m.product ?? "";
      case "variant":  return [m.color, m.size].filter(Boolean).join(" / ") || "—";
      case "qty":      return isTransfer ? String(m.quantity) : formatQty(m.type, m.quantity);
      case "reason":   return REASON_LABELS[m.reason] ?? m.reason;
      case "order":    return m.shipmentNumber ? m.shipmentNumber : m.orderId ? `#${String(m.orderId).padStart(4, "0")}` : "—";
      case "customer": return m.customerName ?? "—";
      case "phone":    return m.customerPhone ?? "—";
      case "location": return isTransfer && m.fromLocation && m.toLocation
        ? `${m.fromLocation} ← ${m.toLocation}`
        : (m as any).warehouseName ?? "—";
      case "notes":    return m.notes || "—";
      default:         return "";
    }
  }, []);

  // نص سليم = فقط عربي/إنجليزي/أرقام/مسافات/رموز شائعة — نشيل أي garbled encoding
  const isReadableText = (s: string) => /^[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿a-zA-Z0-9\s\-_#\/\(\)،.,:؟!@٠-٩]+$/.test(s.trim());

  const getColOptions = useCallback((col: ColKey): string[] => {
    const vals = [...new Set((movements as InventoryMovement[]).map(m => getColVal(col, m)))]
      .filter(v => v && v !== "—" && (col !== "notes" || isReadableText(v)));
    return vals.sort((a, b) => a.localeCompare(b, "ar"));
  }, [movements, getColVal]);

  const toggleColFilter = useCallback((col: ColKey, val: string) => {
    setColFilters(prev => {
      const next = new Set(prev[col]);
      next.has(val) ? next.delete(val) : next.add(val);
      return { ...prev, [col]: next };
    });
  }, []);

  const clearColFilter = useCallback((col: ColKey) => {
    setColFilters(prev => ({ ...prev, [col]: new Set() }));
  }, []);

  const colFilteredMovements = useMemo(() => {
    let list = movements as InventoryMovement[];

    if (colFilterHasActive) {
      list = list.filter(m =>
        (Object.keys(colFilters) as ColKey[]).every(col => {
          const s = colFilters[col];
          if (s.size === 0) return true;
          return s.has(getColVal(col, m));
        })
      );
    }

    if (debouncedSearchQuery) {
      const q = debouncedSearchQuery.toLowerCase();
      list = list.filter(m => {
        const haystack = [
          m.product,
          m.color,
          m.size,
          m.notes,
          m.orderId ? `#${String(m.orderId).padStart(4, "0")}` : "",
          m.orderId ? String(m.orderId) : "",
          m.shipmentNumber,
          m.customerName,
          m.customerPhone,
          (m as any).warehouseName,
          m.fromLocation,
          m.toLocation,
          REASON_LABELS[m.reason],
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }

    return list;
  }, [movements, colFilters, colFilterHasActive, getColVal, debouncedSearchQuery]);

  const createMutation = useMutation({
    mutationFn: movementsApi.create,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["movements-totals"] });
      // حدّث المخزون دايماً — سواء transfer أو manual أو أي سبب تاني
      queryClient.invalidateQueries({ queryKey: ["variants"] });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-intelligence"] });
      queryClient.invalidateQueries({ queryKey: ["smart-insights"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["variant-wh-stock"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "تم التسجيل", description: "تم تسجيل الحركة بنجاح." });
    },
    onError: () => toast({ title: "خطأ", description: "فشل تسجيل الحركة.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => movementsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["movements-totals"] });
      setEditingMovement(null);
      resetForm();
      toast({ title: "تم التعديل", description: "تم تعديل الحركة بنجاح." });
    },
    onError: () => toast({ title: "خطأ", description: "فشل تعديل الحركة.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => movementsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["movements-totals"] });
      toast({ title: "تم الحذف", description: "تم حذف الحركة بنجاح." });
    },
    onError: () => toast({ title: "خطأ", description: "فشل حذف الحركة.", variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => movementsApi.deleteBulk(ids),
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["movements-totals"] });
      setSelectedIds(new Set());
      toast({ title: "تم الحذف", description: `تم حذف ${ids.length} حركة بنجاح.` });
    },
    onError: () => toast({ title: "خطأ", description: "فشل حذف الحركات المحددة.", variant: "destructive" }),
  });

  // useCallback لنفس سبب toggleSelect — بتتمرر لكل صف في الجدول.
  const handleDelete = useCallback((id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الحركة؟")) return;
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedIds.size} حركة؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  const resetForm = () => setForm({
    product: "", color: "", size: "", quantity: "1",
    type: "IN", reason: "manual_in", notes: "",
    productId: "", variantId: "", warehouseId: "",
    fromLocation: "", toLocation: "",
  });

  const hasFilter = filterType !== "all" || filterReason !== "all" || filterProduct !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setFilterType("all"); setFilterReason("all");
    setFilterProduct("all"); setDateFrom(""); setDateTo("");
  };

  const handleCreate = () => {
    if (dialogMode === "transfer") {
      if (!form.product.trim()) { toast({ title: "خطأ", description: "أدخل اسم المنتج.", variant: "destructive" }); return; }
      if (!form.fromLocation) { toast({ title: "خطأ", description: "اختر الموقع المصدر.", variant: "destructive" }); return; }
      if (!form.toLocation) { toast({ title: "خطأ", description: "اختر الموقع الوجهة.", variant: "destructive" }); return; }
      if (form.fromLocation === form.toLocation) { toast({ title: "خطأ", description: "الموقع المصدر والوجهة لا يمكن أن يكونا نفس الموقع.", variant: "destructive" }); return; }
      const qty = parseInt(form.quantity);
      if (!qty || qty < 1) { toast({ title: "خطأ", description: "أدخل كمية صحيحة.", variant: "destructive" }); return; }
      createMutation.mutate({
        product: form.product.trim(),
        color: form.color.trim() || null,
        size: form.size.trim() || null,
        quantity: qty,
        type: "OUT",
        reason: "transfer",
        fromLocation: form.fromLocation,
        toLocation: form.toLocation,
        notes: form.notes.trim() || null,
        productId: form.productId ? parseInt(form.productId) : null,
        variantId: form.variantId ? parseInt(form.variantId) : null,
        warehouseId: form.warehouseId ? parseInt(form.warehouseId) : null,
      });
      return;
    }
    if (!form.product.trim()) { toast({ title: "خطأ", description: "أدخل اسم المنتج.", variant: "destructive" }); return; }
    const qty = parseInt(form.quantity);
    if (!qty || qty < 1) { toast({ title: "خطأ", description: "أدخل كمية صحيحة.", variant: "destructive" }); return; }
    createMutation.mutate({
      product: form.product.trim(),
      color: form.color.trim() || null,
      size: form.size.trim() || null,
      quantity: qty,
      type: form.type,
      reason: form.reason,
      notes: form.notes.trim() || null,
      productId: form.productId ? parseInt(form.productId) : null,
      variantId: form.variantId ? parseInt(form.variantId) : null,
      warehouseId: form.warehouseId ? parseInt(form.warehouseId) : null,
    });
  };

  const handleTypeChange = (t: MovementType) => {
    setForm(f => ({ ...f, type: t, reason: t === "IN" ? "manual_in" : "manual_out" }));
  };

  // useCallback لنفس سبب toggleSelect — بتتمرر لكل صف في الجدول.
  const openEdit = useCallback((m: InventoryMovement) => {
    setEditingMovement(m);
    setDialogMode(m.reason === "transfer" ? "transfer" : "manual");
    setForm({
      product: m.product, color: m.color ?? "", size: m.size ?? "",
      quantity: String(m.quantity), type: m.type, reason: m.reason,
      notes: m.notes ?? "",
      productId: m.productId ? String(m.productId) : "",
      variantId: m.variantId ? String(m.variantId) : "",
      warehouseId: m.warehouseId ? String(m.warehouseId) : "",
      fromLocation: m.fromLocation ?? "",
      toLocation: m.toLocation ?? "",
    });
  }, []);

  const handleSave = () => {
    if (!form.product.trim()) { toast({ title: "خطأ", description: "أدخل اسم المنتج.", variant: "destructive" }); return; }
    const qty = parseInt(form.quantity);
    if (!qty || qty < 1) { toast({ title: "خطأ", description: "أدخل كمية صحيحة.", variant: "destructive" }); return; }
    if (dialogMode === "transfer") {
      if (!form.fromLocation) { toast({ title: "خطأ", description: "اختر الموقع المصدر.", variant: "destructive" }); return; }
      if (!form.toLocation) { toast({ title: "خطأ", description: "اختر الموقع الوجهة.", variant: "destructive" }); return; }
    }
    const payload = {
      product: form.product.trim(), color: form.color.trim() || null,
      size: form.size.trim() || null, quantity: qty,
      type: dialogMode === "transfer" ? "OUT" as MovementType : form.type,
      reason: dialogMode === "transfer" ? "transfer" as MovementReason : form.reason,
      notes: form.notes.trim() || null,
      warehouseId: form.warehouseId ? parseInt(form.warehouseId) : null,
      fromLocation: form.fromLocation || null,
      toLocation: form.toLocation || null,
    };
    if (editingMovement) {
      updateMutation.mutate({ id: editingMovement.id, data: payload });
    } else {
      createMutation.mutate({ ...payload, productId: form.productId ? parseInt(form.productId) : null, variantId: form.variantId ? parseInt(form.variantId) : null });
    }
  };

  const handlePrint = () => {
    const printDate = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const activeFilters: string[] = [];
    if (filterType !== "all")    activeFilters.push(`النوع: ${filterType === "IN" ? "دخول" : "خروج"}`);
    if (filterReason !== "all")  activeFilters.push(`السبب: ${REASON_LABELS[filterReason as MovementReason] ?? filterReason}`);
    if (filterProduct !== "all") {
      const pName = products.find(p => String(p.id) === filterProduct)?.name ?? filterProduct;
      activeFilters.push(`المنتج: ${pName}`);
    }
    if (dateFrom) activeFilters.push(`من: ${dateFrom}`);
    if (dateTo)   activeFilters.push(`إلى: ${dateTo}`);
    const filtersRow = activeFilters.length > 0
      ? `<div class="filters">🔍 فلاتر مطبقة: ${activeFilters.join(" &nbsp;|&nbsp; ")}</div>`
      : `<div class="filters">عرض: كل الحركات</div>`;
    const rows = movements.map(m => {
      const isIn = m.type === "IN";
      const isTransfer = m.reason === "transfer";
      const dateStr = formatMovementDate(m.createdAt);
      const locationInfo = isTransfer && m.fromLocation && m.toLocation
        ? `${m.fromLocation} ← ${m.toLocation}`
        : (m as any).warehouseName ?? "—";
      return `<tr>
        <td>${dateStr}</td>
        <td style="text-align:center;font-weight:bold;color:${isTransfer ? "#7c3aed" : isIn ? "#16a34a" : "#dc2626"}">${isTransfer ? "⇄ تحويل" : isIn ? "⬆ دخول" : "⬇ خروج"}</td>
        <td style="font-weight:600">${m.product}</td>
        <td style="text-align:center">${[m.color, m.size].filter(Boolean).join(" / ") || "—"}</td>
        <td style="text-align:center;font-weight:bold;color:${isTransfer ? "#7c3aed" : isIn ? "#16a34a" : "#dc2626"}">${isTransfer ? m.quantity : isIn ? "+" : "-"}${isTransfer ? "" : m.quantity}</td>
        <td style="text-align:center">${REASON_LABELS[m.reason] ?? m.reason}</td>
        <td style="text-align:center">${m.orderId ? `#${String(m.orderId).padStart(4, "0")}` : "—"}</td>
        <td style="text-align:center">${locationInfo}</td>
        <td style="color:#6b7280">${m.notes ?? "—"}</td>
      </tr>`;
    }).join("");
    const win = window.open("", "_blank", "width=1000,height=750");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/><title>حركات المخزون</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:24px;color:#111;font-size:12px}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a1a2e;padding-bottom:14px;margin-bottom:14px}
.header h1{font-size:20px;font-weight:900;color:#1a1a2e}.header .meta{text-align:left;font-size:11px;color:#6b7280}
.filters{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:7px 12px;font-size:11px;color:#374151;margin-bottom:14px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;text-align:center}
.kpi .val{font-size:22px;font-weight:900}.kpi .lbl{font-size:10px;color:#6b7280;margin-top:2px}
.kpi.in{border-color:#86efac;background:#f0fdf4}.kpi.out{border-color:#fca5a5;background:#fef2f2}.kpi.bal{border-color:#93c5fd;background:#eff6ff}
table{width:100%;border-collapse:collapse}thead tr{background:#1a1a2e}
thead th{color:#fff;font-size:11px;padding:8px 10px;text-align:right;font-weight:700}
tbody td{padding:7px 10px;font-size:11px;border-bottom:1px solid #f3f4f6}
tbody tr:nth-child(even) td{background:#f9fafb}tbody tr:last-child td{border-bottom:none}
.footer{margin-top:18px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
</style></head><body>
<div class="header"><div><h1>📦 تقرير حركات المخزون</h1><p style="font-size:11px;color:#6b7280;margin-top:4px">كابرينا — نظام إدارة المخزون</p></div>
<div class="meta"><div>تاريخ الطباعة: ${printDate}</div><div style="margin-top:4px">إجمالي السجلات: <strong>${movements.length} حركة</strong></div></div></div>
${filtersRow}
<div class="kpis">
<div class="kpi in"><div class="val" style="color:#16a34a">+${formatNum(totals?.totalIn ?? 0)}</div><div class="lbl">إجمالي الداخل</div></div>
<div class="kpi out"><div class="val" style="color:#dc2626">-${formatNum(totals?.totalOut ?? 0)}</div><div class="lbl">إجمالي الخارج</div></div>
<div class="kpi bal"><div class="val" style="color:${(totals?.balance ?? 0) >= 0 ? "#2563eb" : "#ea580c"}">${formatNum(totals?.balance ?? 0)}</div><div class="lbl">الرصيد الصافي</div></div>
</div>
<table><thead><tr><th>التاريخ والوقت</th><th style="text-align:center">النوع</th><th>المنتج</th><th style="text-align:center">اللون/المقاس</th><th style="text-align:center">الكمية</th><th style="text-align:center">السبب</th><th style="text-align:center">رقم الطلب</th><th style="text-align:center">الموقع</th><th>ملاحظات</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="footer">كابرينا — تقرير حركات المخزون | ${printDate}</div>
<script>window.onload=()=>{window.print()}</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><Activity className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />حركات المخزون</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">سجل كامل لكل دخول وخروج وتحويل في المخزن</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <Button variant="outline" className="gap-2 text-sm font-bold h-9 flex-1 sm:flex-none min-w-[120px]" onClick={handlePrint} disabled={movements.length === 0}>
            <Printer className="w-4 h-4" /><span className="hidden sm:inline">طباعة</span>
            {hasFilter && <span className="text-[9px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold">مفلترة</span>}
          </Button>
          {isAdmin && selectedIds.size > 0 && (
            <Button
              variant="destructive"
              className="gap-2 font-bold text-sm h-9 flex-1 sm:flex-none min-w-[150px]"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
              حذف المحدد ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" className="gap-2 bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800 font-bold text-sm h-9 flex-1 sm:flex-none min-w-[170px]"
            onClick={() => setShowShipmentsTransfer(true)}>
            <PackageCheck className="w-4 h-4" />نقل شحنات لمخزن
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/10">
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowDownCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-500 shrink-0" />
            <div><p className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase tracking-widest font-bold">إجمالي الداخل</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatNum(totals?.totalIn ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">وحدة</p></div>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10">
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowUpCircle className="w-8 h-8 text-red-500 shrink-0" />
            <div><p className="text-[10px] text-red-700 dark:text-red-400 uppercase tracking-widest font-bold">إجمالي الخارج</p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{formatNum(totals?.totalOut ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">وحدة</p></div>
          </CardContent>
        </Card>
        <Card className={(totals?.balance ?? 0) >= 0 ? "border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-900/10" : "border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-900/10"}>
          <CardContent className="p-4 flex items-center gap-3">
            <BarChart3 className={`w-8 h-8 ${(totals?.balance ?? 0) >= 0 ? "text-sky-500" : "text-orange-500"} shrink-0`} />
            <div>
              <p className={`text-[10px] ${(totals?.balance ?? 0) >= 0 ? "text-sky-700 dark:text-sky-400" : "text-orange-700 dark:text-orange-400"} uppercase tracking-widest font-bold`}>الرصيد</p>
              {/* لما يكون في فلتر على منتج → اعرض الرصيد الحقيقي من المخزون */}
              {totals?.currentStock != null ? (
                <>
                  <p className={`text-2xl font-bold ${totals.currentStock >= 0 ? "text-sky-700 dark:text-sky-300" : "text-orange-700 dark:text-orange-300"}`}>
                    {formatNum(totals.currentStock)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">رصيد فعلي في المخزون</p>
                </>
              ) : (
                <>
                  <p className={`text-2xl font-bold ${(totals?.balance ?? 0) >= 0 ? "text-sky-700 dark:text-sky-300" : "text-orange-700 dark:text-orange-300"}`}>
                    {formatNum(totals?.balance ?? 0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">وحدة</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardContent className="p-3 space-y-2">
          {/* بحث نصي شامل */}
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث بالمنتج، اللون/المقاس، رقم الأوردر، الموقع، أو الملاحظات..."
              className="h-9 text-sm pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 text-xs bg-card border-border">
                <div className="flex items-center gap-1.5"><Filter className="w-3 h-3 text-muted-foreground" /><SelectValue placeholder="النوع" /></div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="IN">دخول (IN)</SelectItem>
                <SelectItem value="OUT">خروج (OUT)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterReason} onValueChange={setFilterReason}>
              <SelectTrigger className="h-8 text-xs bg-card border-border"><SelectValue placeholder="السبب" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأسباب</SelectItem>
                <SelectItem value="sale">بيع</SelectItem>
                <SelectItem value="partial_sale">بيع جزئي</SelectItem>
                <SelectItem value="return">مرتجع</SelectItem>
                <SelectItem value="manual_in">إضافة يدوية</SelectItem>
                <SelectItem value="manual_out">خصم يدوي</SelectItem>
                <SelectItem value="adjustment">تسوية</SelectItem>
                <SelectItem value="to_shipping">تحويل لشركة الشحن</SelectItem>
                <SelectItem value="from_shipping">إرجاع من شركة الشحن</SelectItem>
                <SelectItem value="transfer">تحويل بين مواقع</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterProduct} onValueChange={setFilterProduct}>
              <SelectTrigger className="h-8 text-xs bg-card border-border">
                <div className="flex items-center gap-1.5"><Package className="w-3 h-3 text-muted-foreground" /><SelectValue placeholder="المنتج" /></div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المنتجات</SelectItem>
                {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <CalendarDays className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <Input type="date" className="h-8 text-xs pr-7 bg-card border-border w-full" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="relative">
              <CalendarDays className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <Input type="date" className="h-8 text-xs pr-7 bg-card border-border w-full" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
          {hasFilter && (
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
                <X className="w-3 h-3" />مسح الفلاتر
              </Button>
            </div>
          )}
          {showColFilters && (
            <div className="mt-3 xl:hidden rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs font-bold text-foreground">فلاتر الأعمدة</p>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground" onClick={() => setShowColFilters(false)}>
                  <X className="w-3 h-3" />إغلاق
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["date", "التاريخ"],
                  ["type", "النوع"],
                  ["product", "المنتج"],
                  ["variant", "اللون/المقاس"],
                  ["qty", "الكمية"],
                  ["reason", "السبب"],
                  ["order", "الطلب"],
                  ["location", "الموقع"],
                  ["notes", "ملاحظات"],
                ] as const).map(([col, label]) => (
                  <div key={col} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
                    <span className="text-[10px] font-medium text-muted-foreground truncate">{label}</span>
                    <ColFilterBtn
                      col={col}
                      colFilters={colFilters}
                      getColOptions={getColOptions}
                      toggleColFilter={toggleColFilter}
                      clearColFilter={clearColFilter}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            جدول الحركات
            {!isLoading && <Badge variant="outline" className="text-[9px] font-normal border-border text-muted-foreground mr-1">{movements.length} حركة</Badge>}
          </CardTitle>
          {!isLoading && movements.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (showColFilters) {
                  setColFilters({ date: new Set(), type: new Set(), product: new Set(), variant: new Set(), qty: new Set(), reason: new Set(), order: new Set(), customer: new Set(), phone: new Set(), location: new Set(), notes: new Set() });
                }
                setShowColFilters(v => !v);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${showColFilters ? "border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10" : "border-primary/40 text-primary bg-primary/5 hover:bg-primary/10"}`}
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill={showColFilters ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {showColFilters ? "إلغاء الفلتر" : "إنشاء فلتر"}
            </button>
          )}
        </CardHeader>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : movements.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="font-bold">لا توجد حركات</p>
            <p className="text-sm text-muted-foreground mt-1">لم يتم تسجيل أي حركة مخزون حتى الآن.</p>
          </div>
        ) : colFilteredMovements.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="font-bold">لا توجد نتائج مطابقة</p>
            <p className="text-sm text-muted-foreground mt-1">جرّب تعديل كلمة البحث أو مسح الفلاتر.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <Table className="min-w-[1020px] [&_th]:px-2 [&_td]:px-2 [&_th]:py-2 [&_td]:py-1.5">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {isAdmin && (
                    <TableHead className="w-8 text-center">
                      <Checkbox
                        checked={movements.length > 0 && selectedIds.size === movements.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="تحديد الكل"
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-right text-[11px] w-24">
                    <div className="flex items-center gap-1">التاريخ {showColFilters && <ColFilterBtn col="date" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-center text-[11px] w-16">
                    <div className="flex items-center justify-center gap-1">النوع {showColFilters && <ColFilterBtn col="type" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-right text-[11px] w-24">
                    <div className="flex items-center gap-1">المنتج {showColFilters && <ColFilterBtn col="product" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-right text-[11px] w-20">
                    <div className="flex items-center gap-1">اللون / المقاس {showColFilters && <ColFilterBtn col="variant" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-center text-[11px] w-12">
                    <div className="flex items-center justify-center gap-1">الكمية {showColFilters && <ColFilterBtn col="qty" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-center text-[11px] w-20">
                    <div className="flex items-center justify-center gap-1">السبب {showColFilters && <ColFilterBtn col="reason" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-center text-[11px] w-16">
                    <div className="flex items-center justify-center gap-1">طلب {showColFilters && <ColFilterBtn col="order" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-right text-[11px] w-20">
                    <div className="flex items-center gap-1">العميل {showColFilters && <ColFilterBtn col="customer" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-right text-[11px] w-20">
                    <div className="flex items-center gap-1">الفون {showColFilters && <ColFilterBtn col="phone" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-right text-[11px] w-32">
                    <div className="flex items-center gap-1">الموقع {showColFilters && <ColFilterBtn col="location" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-right text-[11px] w-20">
                    <div className="flex items-center gap-1">ملاحظات {showColFilters && <ColFilterBtn col="notes" colFilters={colFilters} getColOptions={getColOptions} toggleColFilter={toggleColFilter} clearColFilter={clearColFilter} />}</div>
                  </TableHead>
                  <TableHead className="text-center text-[11px] w-10">تعديل</TableHead>
                  {isAdmin && <TableHead className="text-center text-[11px] w-10">حذف</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {colFilteredMovements.map((m: InventoryMovement) => (
                  <MovementTableRow
                    key={m.id}
                    m={m}
                    checked={selectedIds.has(m.id)}
                    isAdmin={isAdmin}
                    onToggleSelect={toggleSelect}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    deleteDisabled={deleteMutation.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </Card>

      {/* Create/Transfer Dialog */}
      <Dialog open={showDialog} onOpenChange={v => { setShowDialog(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogMode === "transfer"
                ? <><ArrowRightLeft className="w-4 h-4 text-violet-600" />تسجيل تحويل بين مواقع</>
                : <><Plus className="w-4 h-4 text-primary" />تسجيل حركة يدوية</>
              }
            </DialogTitle>
          </DialogHeader>

          {dialogMode === "transfer" ? (
            <div className="space-y-3 py-1">
              {/* Transfer form */}
              <div>
                <Label className="text-xs mb-1.5 block">المنتج *</Label>
                <Select value={form.productId || "manual"} onValueChange={v => {
                  if (v === "manual") { setForm(f => ({ ...f, productId: "", product: "" })); }
                  else { const p = products.find(p => String(p.id) === v); setForm(f => ({ ...f, productId: v, product: p?.name ?? "" })); }
                }}>
                  <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="اختر أو اكتب..." /></SelectTrigger>
                  <SelectContent><SelectItem value="manual">كتابة يدوية</SelectItem>{products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                {(!form.productId || form.productId === "manual") && (
                  <Input className="h-9 text-sm mt-1.5 bg-background" placeholder="اسم المنتج..." value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} />
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs mb-1.5 block">اللون</Label><Input className="h-9 text-sm bg-background" placeholder="أسود..." value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1.5 block">المقاس</Label><Input className="h-9 text-sm bg-background" placeholder="M, L..." value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1.5 block">الكمية *</Label><Input type="number" min="1" className="h-9 text-sm bg-background" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              </div>
              {/* From → To */}
              <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/10 p-3 space-y-2.5">
                <p className="text-xs font-bold text-violet-700 dark:text-violet-400 flex items-center gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5" />مسار التحويل</p>
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">من (المصدر) *</Label>
                  <Select value={form.fromLocation || "none"} onValueChange={v => setForm(f => ({ ...f, fromLocation: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="اختر الموقع المصدر..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">اختر الموقع...</SelectItem>
                      {locationOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-center"><ArrowRightLeft className="w-4 h-4 text-violet-400" /></div>
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">إلى (الوجهة) *</Label>
                  <Select value={form.toLocation || "none"} onValueChange={v => setForm(f => ({ ...f, toLocation: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="اختر الموقع الوجهة..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">اختر الموقع...</SelectItem>
                      {locationOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs mb-1.5 block">ملاحظات</Label><Textarea className="min-h-[60px] text-sm resize-none bg-background" placeholder="سبب التحويل..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              {/* Manual movement form */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">النوع *</Label>
                  <Select value={form.type} onValueChange={v => handleTypeChange(v as MovementType)}>
                    <SelectTrigger className="h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="IN">دخول (IN)</SelectItem><SelectItem value="OUT">خروج (OUT)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">السبب *</Label>
                  <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v as MovementReason }))}>
                    <SelectTrigger className="h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {form.type === "IN" ? (<><SelectItem value="manual_in">إضافة يدوية</SelectItem><SelectItem value="return">مرتجع</SelectItem><SelectItem value="adjustment">تسوية</SelectItem></>)
                      : (<><SelectItem value="manual_out">خصم يدوي</SelectItem><SelectItem value="sale">بيع</SelectItem><SelectItem value="adjustment">تسوية</SelectItem></>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">المنتج *</Label>
                <Select value={form.productId || "manual"} onValueChange={v => {
                  if (v === "manual") { setForm(f => ({ ...f, productId: "", product: "", variantId: "", color: "", size: "" })); }
                  else { const p = products.find(p => String(p.id) === v); setForm(f => ({ ...f, productId: v, product: p?.name ?? "", variantId: "", color: "", size: "" })); }
                }}>
                  <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="اختر أو اكتب..." /></SelectTrigger>
                  <SelectContent><SelectItem value="manual">كتابة يدوية</SelectItem>{products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                {(!form.productId || form.productId === "manual") && (
                  <Input className="h-9 text-sm mt-1.5 bg-background" placeholder="اسم المنتج..." value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} />
                )}
              </div>
              {/* Variant selector — يظهر لما يتاختار منتج */}
              {form.productId && form.productId !== "manual" && (() => {
                const pvs = allVariants?.filter((v: any) => String(v.productId) === form.productId) ?? [];
                if (pvs.length === 0) return null;
                return (
                  <div>
                    <Label className="text-xs mb-1.5 block">النوع / المقاس *</Label>
                    <Select value={form.variantId || "none"} onValueChange={v => {
                      if (v === "none") { setForm(f => ({ ...f, variantId: "", color: "", size: "" })); return; }
                      const pv = pvs.find((x: any) => String(x.id) === v);
                      setForm(f => ({ ...f, variantId: v, color: pv?.color ?? "", size: pv?.size ?? "" }));
                    }}>
                      <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="اختر النوع..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">اختر النوع...</SelectItem>
                        {pvs.map((pv: any) => (
                          <SelectItem key={pv.id} value={String(pv.id)}>
                            {pv.color} / {pv.size} — (مخزون: {pv.totalQuantity ?? 0})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs mb-1.5 block">اللون</Label><Input className="h-9 text-sm bg-background" placeholder="أسود..." value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1.5 block">المقاس</Label><Input className="h-9 text-sm bg-background" placeholder="M, L..." value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1.5 block">الكمية *</Label><Input type="number" min="1" className="h-9 text-sm bg-background" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">المخزن</Label>
                <Select value={form.warehouseId || "none"} onValueChange={v => setForm(f => ({ ...f, warehouseId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="اختر مخزناً..." /></SelectTrigger>
                  <SelectContent><SelectItem value="none">بدون مخزن</SelectItem>{warehouses.map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}{w.isDefault ? " ★" : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs mb-1.5 block">ملاحظات</Label><Textarea className="min-h-[60px] text-sm resize-none bg-background" placeholder="سبب إضافي..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowDialog(false); resetForm(); }}>إلغاء</Button>
            <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}
              className={`gap-1 ${dialogMode === "transfer" ? "bg-violet-600 hover:bg-violet-700 text-white" : ""}`}>
              {dialogMode === "transfer" ? <ArrowRightLeft className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {createMutation.isPending ? "جاري..." : dialogMode === "transfer" ? "تسجيل التحويل" : "تسجيل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingMovement} onOpenChange={v => { if (!v) { setEditingMovement(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogMode === "transfer"
                ? <><ArrowRightLeft className="w-4 h-4 text-violet-600" />تعديل التحويل</>
                : <><Pencil className="w-4 h-4 text-primary" />تعديل الحركة</>
              }
            </DialogTitle>
          </DialogHeader>

          {dialogMode === "transfer" ? (
            <div className="space-y-3 py-1">
              <div><Label className="text-xs mb-1.5 block">المنتج *</Label><Input className="h-9 text-sm bg-background" value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs mb-1.5 block">اللون</Label><Input className="h-9 text-sm bg-background" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1.5 block">المقاس</Label><Input className="h-9 text-sm bg-background" value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1.5 block">الكمية *</Label><Input type="number" min="1" className="h-9 text-sm bg-background" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              </div>
              <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/10 p-3 space-y-2.5">
                <p className="text-xs font-bold text-violet-700 dark:text-violet-400 flex items-center gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5" />مسار التحويل</p>
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">من (المصدر) *</Label>
                  <Select value={form.fromLocation || "none"} onValueChange={v => setForm(f => ({ ...f, fromLocation: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">اختر الموقع...</SelectItem>
                      {locationOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-center"><ArrowRightLeft className="w-4 h-4 text-violet-400" /></div>
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">إلى (الوجهة) *</Label>
                  <Select value={form.toLocation || "none"} onValueChange={v => setForm(f => ({ ...f, toLocation: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">اختر الموقع...</SelectItem>
                      {locationOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs mb-1.5 block">ملاحظات</Label><Textarea className="min-h-[60px] text-sm resize-none bg-background" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">النوع *</Label>
                  <Select value={form.type} onValueChange={v => handleTypeChange(v as MovementType)}>
                    <SelectTrigger className="h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="IN">دخول (IN)</SelectItem><SelectItem value="OUT">خروج (OUT)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">السبب *</Label>
                  <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v as MovementReason }))}>
                    <SelectTrigger className="h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {form.type === "IN" ? (<><SelectItem value="manual_in">إضافة يدوية</SelectItem><SelectItem value="return">مرتجع</SelectItem><SelectItem value="adjustment">تسوية</SelectItem></>)
                      : (<><SelectItem value="manual_out">خصم يدوي</SelectItem><SelectItem value="sale">بيع</SelectItem><SelectItem value="adjustment">تسوية</SelectItem></>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs mb-1.5 block">المنتج *</Label><Input className="h-9 text-sm bg-background" value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs mb-1.5 block">اللون</Label><Input className="h-9 text-sm bg-background" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1.5 block">المقاس</Label><Input className="h-9 text-sm bg-background" value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} /></div>
                <div><Label className="text-xs mb-1.5 block">الكمية *</Label><Input type="number" min="1" className="h-9 text-sm bg-background" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">المخزن</Label>
                <Select value={form.warehouseId || "none"} onValueChange={v => setForm(f => ({ ...f, warehouseId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="اختر مخزناً..." /></SelectTrigger>
                  <SelectContent><SelectItem value="none">بدون مخزن</SelectItem>{warehouses.map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}{w.isDefault ? " ★" : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs mb-1.5 block">ملاحظات</Label><Textarea className="min-h-[60px] text-sm resize-none bg-background" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setEditingMovement(null); resetForm(); }}>إلغاء</Button>
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}
              className={`gap-1 ${dialogMode === "transfer" ? "bg-violet-600 hover:bg-violet-700 text-white" : ""}`}>
              <Pencil className="w-3.5 h-3.5" />
              {updateMutation.isPending ? "جاري..." : "حفظ التعديلات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showShipmentsTransfer && (
        <ShipmentsTransferDialog onClose={() => setShowShipmentsTransfer(false)} />
      )}
    </div>
  );
}
