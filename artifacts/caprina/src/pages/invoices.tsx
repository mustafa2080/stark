import { useListOrders } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { shippingApi, ordersApi, apiFetch } from "@/lib/api";
import { useState, useMemo, useEffect, useRef } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, FileText, CheckSquare, Square, Package, Truck } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";

const statusLabels: Record<string, string> = {
  pending:          "قيد الانتظار",
  warehouse_ready:  "قيد الشحن في المخزن",
  in_shipping:      "قيد الشحن",
  received:         "استلم",
  delayed:          "مؤجل",
  returned:         "مرتجع",
  partial_received: "استلم جزئي",
};

const statusClasses: Record<string, string> = {
  pending:          "bg-amber-50   dark:bg-amber-900/30   text-amber-700   dark:text-amber-400   border-amber-300   dark:border-amber-800",
  warehouse_ready:  "bg-teal-50    dark:bg-teal-900/30    text-teal-700    dark:text-teal-400    border-teal-300    dark:border-teal-800",
  in_shipping:      "bg-sky-50     dark:bg-sky-900/30     text-sky-700     dark:text-sky-400     border-sky-300     dark:border-sky-800",
  received:         "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
  delayed:          "bg-blue-50    dark:bg-blue-900/30    text-blue-700    dark:text-blue-400    border-blue-300    dark:border-blue-800",
  returned:         "bg-red-50     dark:bg-red-900/30     text-red-700     dark:text-red-400     border-red-300     dark:border-red-800",
  partial_received: "bg-purple-50  dark:bg-purple-900/30  text-purple-700  dark:text-purple-400  border-purple-300  dark:border-purple-800",
};

const formatCurrency = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  const isWhole = rounded % 1 === 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rounded) + " ج.م";
};

type InvoiceListStatus = "all" | "warehouse_ready" | "in_shipping" | "received" | "delayed" | "returned" | "partial_received";

// ─── حالات شحنة الـ shipments table ─────────────────────────────────────────
const shipmentStatusLabels: Record<string, string> = {
  waiting:          "انتظار",
  confirmed:        "مؤكدة",
  picked_up:        "تم الاستلام",
  in_transit:       "في الطريق",
  out_for_delivery: "خرجت للتسليم",
  delivered:        "تم التسليم",
  delayed:          "متأخرة",
  returned:         "مرتجع",
  cancelled:        "ملغية",
  warehouse_ready:  "قيد الشحن في المخزن",
};

const shipmentStatusClasses: Record<string, string> = {
  waiting:          "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  confirmed:        "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-800",
  picked_up:        "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-800",
  in_transit:       "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-800",
  out_for_delivery: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800",
  delivered:        "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
  delayed:          "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800",
  returned:         "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800",
  cancelled:        "bg-gray-50 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400 border-gray-300 dark:border-gray-800",
  warehouse_ready:  "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-800",
};

export default function Invoices() {
  const { brand } = useBrand();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const preselectedInvoiceNumber = params.get("invoiceNumber");

  // ── تاب نشط ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"orders" | "shipments">("orders");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    preselectedInvoiceNumber ? new Set([preselectedInvoiceNumber]) : new Set()
  );
  const [statusFilter, setStatusFilter] = useState<InvoiceListStatus>("all");
  const [perPage, setPerPage] = useState<number>(4);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<Set<number>>(new Set());

  const { data: allOrders, isLoading } = useListOrders({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const { data: shippingCompanies } = useQuery({ queryKey: ["shipping"], queryFn: shippingApi.list });
  const { data: directInvoiceOrders, isLoading: isDirectInvoiceLoading } = useQuery({
    queryKey: ["invoice-direct-print", preselectedInvoiceNumber],
    queryFn: () => ordersApi.byInvoice(preselectedInvoiceNumber!),
    enabled: !!preselectedInvoiceNumber,
  });

  // ── شحنات بحالة warehouse_ready فقط ─────────────────────────────────────
  const { data: shipmentsData, isLoading: isShipmentsLoading } = useQuery({
    queryKey: ["shipments-invoices"],
    queryFn: () => apiFetch<{ data: any[]; total: number }>("/shipments?status=warehouse_ready&limit=200"),
    enabled: true,
  });
  const warehouseShipments: any[] = useMemo(() => {
    const rows = (shipmentsData as any)?.data ?? (Array.isArray(shipmentsData) ? shipmentsData : []);
    return rows;
  }, [shipmentsData]);

  const rawOrders = useMemo(() => {
    if (!allOrders) return [];
    return allOrders.filter(o => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (statusFilter === "all" && o.status !== "warehouse_ready") return false;
      return true;
    });
  }, [allOrders, statusFilter]);

  // ─── Group orders by invoiceNumber ───────────────────────────────────────
  type InvoiceGroup = {
    invoiceNumber: string;
    representativeId: number;
    orders: typeof rawOrders;
    customerName: string;
    totalPrice: number;
    status: string;
    createdAt: string;
    phone: string | null;
    city: string | null;
    shippingCompanyId: number | null;
  };

  const invoiceGroups = useMemo<InvoiceGroup[]>(() => {
    const map = new Map<string, { rep: (typeof rawOrders)[0]; orders: typeof rawOrders }>();
    for (const o of rawOrders) {
      const key = (o as any).invoiceNumber ?? `solo-${o.id}`;
      if (!map.has(key)) {
        const invoiceOrders: any[] | undefined = (o as any)._invoiceOrders;
        const realOrders = (invoiceOrders && invoiceOrders.length > 0) ? (invoiceOrders as typeof rawOrders) : [o];
        map.set(key, { rep: o, orders: realOrders });
      } else {
        const existing = map.get(key)!;
        const alreadyHasId = existing.orders.some((x: any) => x.id === o.id);
        if (!alreadyHasId) existing.orders = [...existing.orders, o];
      }
    }
    if (preselectedInvoiceNumber && directInvoiceOrders?.length && !map.has(preselectedInvoiceNumber)) {
      map.set(preselectedInvoiceNumber, {
        rep: directInvoiceOrders[0] as (typeof rawOrders)[0],
        orders: directInvoiceOrders as typeof rawOrders,
      });
    }
    return Array.from(map.entries()).map(([invoiceNumber, { rep, orders }]) => ({
      invoiceNumber,
      representativeId: rep.id,
      orders,
      customerName: rep.customerName,
      totalPrice: orders.reduce((s, o) => s + o.totalPrice, 0),
      status: rep.status,
      createdAt: rep.createdAt,
      phone: rep.phone ?? null,
      city: (rep as any).city ?? null,
      shippingCompanyId: (rep as any).shippingCompanyId ?? null,
    }));
  }, [rawOrders, directInvoiceOrders, preselectedInvoiceNumber]);

  // ── تطبيق الفلاتر على invoiceGroups ──────────────────────────────────────
  const filtered = useMemo(() => invoiceGroups, [invoiceGroups]);

  // ─── Cache & prefetch ─────────────────────────────────────────────────────
  const [realOrdersCache, setRealOrdersCache] = useState<Map<string, any[]>>(new Map());
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!invoiceGroups.length) return;
    const toFetch = invoiceGroups.filter(grp =>
      grp.invoiceNumber && !grp.invoiceNumber.startsWith("solo-") && !fetchedRef.current.has(grp.invoiceNumber)
    );
    if (!toFetch.length) return;
    toFetch.forEach(grp => fetchedRef.current.add(grp.invoiceNumber));
    Promise.all(toFetch.map(async grp => {
      try {
        const orders = await ordersApi.byInvoice(grp.invoiceNumber);
        return { key: grp.invoiceNumber, orders: orders.length > 0 ? orders : grp.orders };
      } catch { return { key: grp.invoiceNumber, orders: grp.orders }; }
    })).then(results => {
      setRealOrdersCache(prev => {
        const next = new Map(prev);
        results.forEach(r => next.set(r.key, r.orders));
        return next;
      });
    });
  }, [invoiceGroups, statusFilter]);

  useEffect(() => { setRealOrdersCache(new Map()); fetchedRef.current = new Set(); }, [statusFilter]);

  // ─── إجماليات ──────────────────────────────────────────────────────────
  const totalAmount = useMemo(() => filtered.reduce((s, g) => s + g.totalPrice, 0), [filtered]);

  // ─── Select helpers ───────────────────────────────────────────────────────
  const toggleSelect    = (inv: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(inv) ? n.delete(inv) : n.add(inv); return n; });
  const isSelected      = (inv: string) => selectedIds.has(inv);
  const selectAll       = () => setSelectedIds(new Set(filtered.map(g => g.invoiceNumber)));
  const clearAll        = () => setSelectedIds(new Set());
  const selectAllPages  = () => setSelectedIds(new Set(invoiceGroups.map(g => g.invoiceNumber)));

  // ─── Print ────────────────────────────────────────────────────────────────
  const handlePrint = async (invoiceNumbers = selectedIds) => {
    const selected = invoiceGroups.filter(g => invoiceNumbers.has(g.invoiceNumber));
    if (!selected.length) { alert("اختر فواتير للطباعة أولاً."); return; }

    const realOrdersMap = new Map<string, any[]>();
    await Promise.all(selected.map(async (grp) => {
      if (grp.invoiceNumber.startsWith("solo-")) { realOrdersMap.set(grp.invoiceNumber, grp.orders); return; }
      try {
        const orders = await ordersApi.byInvoice(grp.invoiceNumber);
        if (orders?.length) {
          realOrdersMap.set(grp.invoiceNumber, orders);
          return;
        }
      } catch {}
      if (realOrdersCache.has(grp.invoiceNumber)) { realOrdersMap.set(grp.invoiceNumber, realOrdersCache.get(grp.invoiceNumber)!); return; }
      if (directInvoiceOrders?.length && (directInvoiceOrders[0] as any).invoiceNumber === grp.invoiceNumber) {
        realOrdersMap.set(grp.invoiceNumber, directInvoiceOrders as any[]); return;
      }
      realOrdersMap.set(grp.invoiceNumber, grp.orders);
    }));

    let logoB64 = "";
    const logoSrc = brand.logoUrl || "/logo.jpg";
    try {
      const r = await fetch(logoSrc);
      const blob = await r.blob();
      logoB64 = await new Promise<string>(res => { const reader = new FileReader(); reader.onload = () => res(reader.result as string); reader.readAsDataURL(blob); });
    } catch {}
    const brandName = brand.name || "CAPRINA";
    const brandTagline = brand.tagline || "WIN OR DIE";

    const pageGroups: typeof selected[] = [];
    for (let i = 0; i < selected.length; i += perPage) pageGroups.push(selected.slice(i, i + perPage));

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const styles = `
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap');
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; background: white; color: #000; font-size: 9pt; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { display: grid; grid-template-rows: 1fr 1fr; gap: 2mm; width: 297mm; height: 210mm; padding: 2mm 3mm; page-break-after: always; box-sizing: border-box; }
      .page:last-child { page-break-after: avoid; }
      .page.single-row { grid-template-rows: 1fr; height: 105mm; }
      .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; align-items: stretch; min-height: 0; height: 100%; }
      .inv-row.single { grid-template-columns: 1fr; }
      .empty-slot { border: 2px dashed #ddd; border-radius: 2mm; background: #fafafa; width: 100%; height: 100%; min-height: 0; }
      .inv { border: 2px solid #000; border-radius: 2mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; background: white; width: 100%; height: 100%; min-height: 0; }
      .inv-hdr { background: #1a1a1a; color: white; display: flex; align-items: center; justify-content: space-between; padding: 1.5mm 2.5mm; gap: 2mm; flex-shrink: 0; }
      .hdr-date { font-size: 7pt; font-weight: 700; white-space: nowrap; direction: ltr; text-align: right; }
      .hdr-logo { display: flex; align-items: center; gap: 1.5mm; }
      .logo-img { width: 12mm; height: 12mm; object-fit: contain; border-radius: 1.5mm; background: white; padding: 0.5mm; box-shadow: 0 0 0 1px rgba(255,255,255,0.2); }
      .logo-txt { font-size: 10pt; font-weight: 900; letter-spacing: 2px; line-height: 1; }
      .logo-sub { font-size: 4.5pt; font-weight: 700; opacity: 0.7; letter-spacing: 2px; }
      .cust-row { display: flex; align-items: center; justify-content: space-between; padding: 1mm 2.5mm; border-bottom: 1.5px solid #000; background: #f0f0f0; flex-shrink: 0; gap: 2mm; }
      .cust-phone { font-size: 9pt; font-weight: 800; direction: ltr; color: #000; }
      .cust-name { font-size: 11pt; font-weight: 900; color: #000; }
      .inv-body { padding: 0.8mm 2.5mm 0.3mm; flex: 1 1 auto; display: flex; flex-direction: column; justify-content: space-between; overflow: visible; }
      .inv-mid-spacer { display: none; }
      .total-bar-wrap { margin-top: auto; }
      .inv-bottom { padding: 0.4mm 2.5mm; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.6mm; border-top: 1px solid #ddd; background: #fafafa; justify-content: space-evenly; }
      .inv-footer { border-top: 2px solid #1a1a1a; background: #1a1a1a; padding: 0.8mm 2.5mm; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 2mm; }
      .table-wrap { overflow: visible; }
      .total-bar { flex-shrink: 0; }
      .prod-table { width: 100%; border-collapse: collapse; }
      .prod-table th { background: #1a1a1a; color: white; border: 1px solid #333; padding: 0.7mm 1.2mm; font-weight: 800; font-size: 7pt; text-align: center; }
      .prod-table td { border: 1px solid #bbb; padding: 0.7mm 1.2mm; text-align: center; font-size: 7pt; font-weight: 700; vertical-align: middle; line-height: 1.2; color: #000; }
      .prod-table td.name-col { text-align: right; font-weight: 800; }
      .prod-table .total-row td { background: #e0e0e0; font-weight: 900; font-size: 8.5pt; border-color: #888; color: #000; }
      .prod-table .total-row td.t-label { text-align: right; }
      .info-strip { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #bbb; border-radius: 1mm; overflow: hidden; flex-shrink: 0; }
      .info-cell { padding: 0.6mm 1.5mm; border-left: 1px solid #bbb; display: flex; flex-direction: column; }
      .info-cell:last-child { border-left: none; }
      .info-lbl { font-size: 5.5pt; font-weight: 700; color: #555; }
      .info-val { font-size: 7pt; font-weight: 800; color: #000; min-height: 2.5mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .addr-box { border: 1px solid #bbb; border-radius: 1mm; padding: 0.6mm 1.5mm; flex-shrink: 0; }
      .addr-lbl { font-size: 5.5pt; font-weight: 700; color: #555; }
      .addr-val { font-size: 7pt; font-weight: 800; color: #000; word-break: break-word; line-height: 1.3; }
      .notes-box { background: #fff8e1; border: 1px solid #ffe082; border-right: 3px solid #f59e0b; border-radius: 1mm; padding: 0.5mm 2mm; font-size: 5.5pt; font-weight: 700; color: #222; display: flex; gap: 1.5mm; flex-shrink: 0; line-height: 1.3; }
      .notes-box b { color: #92400e; white-space: nowrap; font-size: 6pt; font-weight: 900; }
      .confirm-box { border: 1px solid #999; border-radius: 1mm; padding: 0.5mm 2mm; font-size: 5pt; font-weight: 700; color: #111; flex-shrink: 0; display: flex; gap: 1.5mm; align-items: flex-start; line-height: 1.3; background: #f5f5f5; }
      .confirm-box .cb-lbl { font-weight: 900; color: #000; font-size: 5.5pt; white-space: nowrap; }
      .policy-txt { font-size: 6pt; font-weight: 600; color: #ccc; text-align: left; line-height: 1.5; }
      .footer-brand { font-size: 8pt; font-weight: 900; color: #fff; letter-spacing: 2px; }
      .empty-slot { border: 1px dashed #ddd; border-radius: 2mm; background: #fafafa; }
    `;

    const invoiceHTML = (grp: InvoiceGroup) => {
      const realOrders = realOrdersMap.get(grp.invoiceNumber) ?? grp.orders;
      const rep = realOrders[0];
      const company = shippingCompanies?.find(c => c.id === rep.shippingCompanyId);
      const trackingNumber = (rep as any).trackingNumber ?? (rep as any).tracking_number ?? "";
      const notes = (rep as any).notes ?? (rep as any).note ?? (rep as any).orderNotes ?? "";
      const shippingCost = (rep as any).shippingCost ?? (rep as any).shipping_cost ?? 0;
      const dateStr = format(new Date(grp.createdAt), "yyyy/MM/dd");
      const logoEl = logoB64
        ? `<img src="${logoB64}" class="logo-img" alt="${brandName}" />`
        : `<div style="width:14mm;height:14mm;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);border-radius:1.5mm;font-size:7pt;font-weight:900;color:white;letter-spacing:1px;">${brandName.substring(0,2)}</div>`;
      const address = rep.address ?? "";
      const orderNum = String(rep.id).padStart(4, "0");
      const city = (rep as any).city ?? "";

      const tblFontSize = "7";
      const cellPad = "0.7mm 1.2mm";
      const hdrPad = "1.5mm 2.5mm";
      const custPad = "1mm 2.5mm";
      const bottomPad = "0.4mm 1.2mm";
      const bottomFontSize = "5.5";
      const logoSize = "12mm";

      const rowCount = realOrders.length + (shippingCost > 0 ? 1 : 0);
      const makeProductRows = () => {
        return realOrders.map((o: any) => {
          const color = o.color ?? "";
          const size = o.size ?? "";
          const partialQuantity = o.partialQuantity ?? null;
          const displayQty = partialQuantity != null ? `${partialQuantity} / ${o.quantity}` : `${o.quantity}`;
          return `<tr><td class="name-col" style="padding:${cellPad}">${o.product}</td><td style="padding:${cellPad}">${size || "&#8212;"}</td><td style="padding:${cellPad}">${color || "&#8212;"}</td><td style="font-weight:900;padding:${cellPad}">${displayQty}</td><td style="padding:${cellPad}">${Math.round(o.unitPrice * 100) / 100 % 1 === 0 ? o.unitPrice.toLocaleString("en-US") : o.unitPrice.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})}</td><td style="font-weight:900;padding:${cellPad}">${Math.round(o.totalPrice * 100) / 100 % 1 === 0 ? o.totalPrice.toLocaleString("en-US") : o.totalPrice.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`;
        }).join("");
      };

      const totalQty = realOrders.reduce((s: number, o: any) => s + o.quantity, 0);
      const totalPrice = realOrders.reduce((s: number, o: any) => s + o.totalPrice, 0);

      return { html: () => `<div class="inv"><div class="inv-hdr" style="padding:${hdrPad}"><div class="hdr-logo"><div style="width:${logoSize};height:${logoSize};flex-shrink:0">${logoB64 ? `<img src="${logoB64}" style="width:100%;height:100%;object-fit:contain;border-radius:1.5mm;background:white;padding:0.5mm;" alt="${brandName}" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);border-radius:1.5mm;font-size:7pt;font-weight:900;color:white;">${brandName.substring(0,2)}</div>`}</div><div style="text-align:left;line-height:1.2;margin-right:2mm"><div class="logo-txt" style="font-size:11pt">${brandName}</div><div class="logo-sub">${brandTagline}</div></div></div><div class="hdr-date" style="font-size:8pt">${dateStr}<br/><span style="font-size:5pt;opacity:0.5">ORDER #${orderNum}</span></div></div><div class="cust-row" style="padding:${custPad}"><div class="cust-name" style="font-size:12pt">${grp.customerName}</div><div class="cust-phone" style="font-size:13pt">&#128222; ${grp.phone ?? "&#8212;"}</div></div><div class="inv-body"><div class="table-wrap"><table class="prod-table" style="font-size:${tblFontSize}pt"><thead><tr><th style="width:30%;padding:${cellPad}">الصنف</th><th style="width:14%;padding:${cellPad}">المقاس</th><th style="width:18%;padding:${cellPad}">اللون</th><th style="width:10%;padding:${cellPad}">العدد</th><th style="width:14%;padding:${cellPad}">السعر</th><th style="width:14%;padding:${cellPad}">الإجمالي</th></tr></thead><tbody>${makeProductRows()}${shippingCost > 0 ? `<tr><td class="name-col" colspan="4" style="color:#777;font-size:${(parseFloat(tblFontSize)*0.85).toFixed(1)}pt;padding:${cellPad}">مصاريف الشحن</td><td colspan="2" style="font-weight:700;padding:${cellPad}">${shippingCost.toLocaleString("en-US")}</td></tr>` : ""}</tbody></table></div><div class="total-bar-wrap"><div style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;border:1px solid #000;border-radius:1mm;padding:1.2mm 2.5mm;font-size:10pt;font-weight:900;color:#fff;margin-bottom:0.5mm"><span>الإجمالي الكلي</span><span style="font-size:12pt;letter-spacing:1px">${(totalPrice + shippingCost).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span></div></div></div><div class="inv-mid-spacer"></div><div class="inv-bottom" style="font-size:${bottomFontSize}pt"><div class="info-strip"><div class="info-cell" style="padding:${bottomPad}"><span class="info-lbl">المحافظة</span><span class="info-val">${city || "&#8212;"}</span></div><div class="info-cell" style="padding:${bottomPad}"><span class="info-lbl">شركة الشحن</span><span class="info-val">${company ? company.name : "&#8212;"}</span></div><div class="info-cell" style="padding:${bottomPad}"><span class="info-lbl">رقم التتبع</span><span class="info-val" style="direction:ltr;text-align:right">${trackingNumber || "&#8212;"}</span></div></div><div class="addr-box" style="padding:${bottomPad}"><div class="addr-lbl">العنوان بالتفصيل</div><div class="addr-val">${address || "&#8212;"}</div></div><div class="notes-box" style="padding:${bottomPad};font-size:${bottomFontSize}pt"><b>&#128203; ملاحظات:</b><span>${notes || "&#8212;"}</span></div><div class="confirm-box" style="padding:${bottomPad};font-size:${bottomFontSize}pt"><span class="cb-lbl">&#10003; التاكيد علي الشحن:</span><span>تم التاكيد مع العميل &#8212; في حاله عدم الاستلام بيتم دفع مصاريف الشحن كامله المتفق عليها</span></div></div><div class="inv-footer"><div class="policy-txt">الاسترجاع فقط اثناء تواجد المندوب &middot; الاستبدال خلال 7 أيام &middot; ضمان 6 أشهر &middot; احتفظ بالفاتورة</div><div class="footer-brand">${brandName}</div></div></div>`, rowCount };
    };

    const pagesHTML = pageGroups.map(group => {
      const cols = perPage === 1 ? 1 : 2;
      const builtAll = group.map(g => invoiceHTML(g));
      let rowsHTML = "";
      for (let i = 0; i < builtAll.length; i += cols) {
        const rowBuilt = builtAll.slice(i, i + cols);
        const rowInvoices = rowBuilt.map(b => b.html()).join("");
        const rowEmpties = rowBuilt.length < cols ? '<div class="empty-slot"></div>' : "";
        const isSingle = cols === 1 ? " single" : "";
        rowsHTML += `<div class="inv-row${isSingle}">${rowInvoices}${rowEmpties}</div>`;
      }
      const rowCount = Math.ceil(group.length / cols);
      const pageClass = rowCount <= 1 ? "page single-row" : "page";
      return `<div class="${pageClass}">${rowsHTML}</div>`;
    }).join("");

    printWindow.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فواتير ${brandName}</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet"><style>${styles}</style></head><body>${pagesHTML}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { setTimeout(() => { printWindow.focus(); printWindow.print(); }, 600); };
  };

  const autoPrintTriggeredRef = useRef(false);

  // ─── Print Shipments ──────────────────────────────────────────────────────
  const handleShipmentPrint = async () => {
    const selected = warehouseShipments.filter((sh: any) => selectedShipmentIds.has(sh.id));
    if (!selected.length) { alert("اختر شحنات للطباعة أولاً."); return; }

    let logoB64 = "";
    const logoSrc = brand.logoUrl || "/logo.jpg";
    try {
      const r = await fetch(logoSrc);
      const blob = await r.blob();
      logoB64 = await new Promise<string>(res => { const reader = new FileReader(); reader.onload = () => res(reader.result as string); reader.readAsDataURL(blob); });
    } catch {}
    const brandName = brand.name || "CAPRINA";
    const brandTagline = brand.tagline || "WIN OR DIE";

    const cols = perPage === 1 ? 1 : 2;
    const pageGroups: any[][] = [];
    for (let i = 0; i < selected.length; i += perPage) pageGroups.push(selected.slice(i, i + perPage));

    const shipmentInvoiceHTML = (sh: any) => {
      const company = shippingCompanies?.find((c: any) => c.id === sh.shippingCompanyId);
      const dateStr = sh.createdAt ? format(new Date(sh.createdAt), "yyyy/MM/dd") : "";
      const shipNum = sh.shipmentNumber ?? String(sh.id).padStart(4, "0");
      const cod = parseFloat(sh.codAmount) || 0;
      const fee = parseFloat(sh.shippingFee) || 0;
      const total = cod + fee;
      return `<div class="inv">
        <div class="inv-hdr">
          <div class="hdr-logo">
            <div style="width:12mm;height:12mm;flex-shrink:0">${logoB64 ? `<img src="${logoB64}" style="width:100%;height:100%;object-fit:contain;border-radius:1.5mm;background:white;padding:0.5mm;" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);border-radius:1.5mm;font-size:7pt;font-weight:900;color:white;">${brandName.substring(0,2)}</div>`}</div>
            <div style="text-align:left;line-height:1.2;margin-right:2mm"><div class="logo-txt">${brandName}</div><div class="logo-sub">${brandTagline}</div></div>
          </div>
          <div class="hdr-date">${dateStr}<br/><span style="font-size:5pt;opacity:0.5">SHP #${shipNum}</span></div>
        </div>
        <div class="cust-row">
          <div class="cust-name">${sh.receiverName}</div>
          <div class="cust-phone">&#128222; ${sh.receiverPhone ?? "&#8212;"}</div>
        </div>
        <div class="inv-body">
          <div class="table-wrap">
            <table class="prod-table">
              <thead><tr><th style="width:40%">البيان</th><th style="width:30%">المرسل</th><th style="width:30%">المبلغ</th></tr></thead>
              <tbody>
                <tr><td class="name-col">${sh.description || "شحنة"}</td><td>${sh.senderName}</td><td style="font-weight:900">${cod.toLocaleString("en-US")} ج.م</td></tr>
                ${fee > 0 ? `<tr><td class="name-col" colspan="2">رسوم الشحن</td><td style="font-weight:700">${fee.toLocaleString("en-US")} ج.م</td></tr>` : ""}
              </tbody>
            </table>
          </div>
          <div class="total-bar-wrap">
            <div style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;border:1px solid #000;border-radius:1mm;padding:1.2mm 2.5mm;font-size:10pt;font-weight:900;color:#fff;margin-bottom:0.5mm">
              <span>الإجمالي</span><span style="font-size:12pt">${total.toLocaleString("en-US")} ج.م</span>
            </div>
          </div>
        </div>
        <div class="inv-bottom">
          <div class="info-strip">
            <div class="info-cell"><span class="info-lbl">المدينة</span><span class="info-val">${sh.receiverCity || "&#8212;"}</span></div>
            <div class="info-cell"><span class="info-lbl">شركة الشحن</span><span class="info-val">${company ? company.name : "&#8212;"}</span></div>
            <div class="info-cell"><span class="info-lbl">رقم التتبع</span><span class="info-val" style="direction:ltr;text-align:right">${sh.trackingNumber || "&#8212;"}</span></div>
          </div>
          <div class="addr-box"><div class="addr-lbl">العنوان</div><div class="addr-val">${sh.receiverAddress || "&#8212;"}</div></div>
          ${sh.notes ? `<div class="notes-box"><b>&#128203; ملاحظات:</b><span>${sh.notes}</span></div>` : ""}
        </div>
        <div class="inv-footer">
          <div class="policy-txt">الاسترجاع فقط اثناء تواجد المندوب &middot; احتفظ بالفاتورة</div>
          <div class="footer-brand">${brandName}</div>
        </div>
      </div>`;
    };

    const styles = `
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap');
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: white; color: #000; font-size: 9pt; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { display: grid; grid-template-rows: 1fr 1fr; gap: 2mm; width: 297mm; height: 210mm; padding: 2mm 3mm; page-break-after: always; box-sizing: border-box; }
      .page:last-child { page-break-after: avoid; }
      .page.single-row { grid-template-rows: 1fr; height: 105mm; }
      .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; align-items: stretch; min-height: 0; height: 100%; }
      .inv-row.single { grid-template-columns: 1fr; }
      .empty-slot { border: 2px dashed #ddd; border-radius: 2mm; }
      .inv { border: 2px solid #000; border-radius: 2mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; background: white; width: 100%; height: 100%; min-height: 0; }
      .inv-hdr { background: #1a1a1a; color: white; display: flex; align-items: center; justify-content: space-between; padding: 1.5mm 2.5mm; gap: 2mm; flex-shrink: 0; }
      .hdr-date { font-size: 7pt; font-weight: 700; white-space: nowrap; direction: ltr; text-align: right; }
      .hdr-logo { display: flex; align-items: center; gap: 1.5mm; }
      .logo-txt { font-size: 10pt; font-weight: 900; letter-spacing: 2px; }
      .logo-sub { font-size: 4.5pt; font-weight: 700; opacity: 0.7; letter-spacing: 2px; }
      .cust-row { display: flex; align-items: center; justify-content: space-between; padding: 1mm 2.5mm; border-bottom: 1.5px solid #000; background: #f0f0f0; flex-shrink: 0; gap: 2mm; }
      .cust-phone { font-size: 9pt; font-weight: 800; direction: ltr; }
      .cust-name { font-size: 11pt; font-weight: 900; }
      .inv-body { padding: 0.8mm 2.5mm 0.3mm; flex: 1 1 auto; display: flex; flex-direction: column; justify-content: space-between; }
      .total-bar-wrap { margin-top: auto; }
      .inv-bottom { padding: 0.4mm 2.5mm; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.6mm; border-top: 1px solid #ddd; background: #fafafa; }
      .inv-footer { border-top: 2px solid #1a1a1a; background: #1a1a1a; padding: 0.8mm 2.5mm; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; }
      .prod-table { width: 100%; border-collapse: collapse; }
      .prod-table th { background: #1a1a1a; color: white; border: 1px solid #333; padding: 0.7mm 1.2mm; font-weight: 800; font-size: 7pt; text-align: center; }
      .prod-table td { border: 1px solid #bbb; padding: 0.7mm 1.2mm; text-align: center; font-size: 7pt; font-weight: 700; }
      .prod-table td.name-col { text-align: right; font-weight: 800; }
      .info-strip { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #bbb; border-radius: 1mm; overflow: hidden; }
      .info-cell { padding: 0.6mm 1.5mm; border-left: 1px solid #bbb; display: flex; flex-direction: column; }
      .info-cell:last-child { border-left: none; }
      .info-lbl { font-size: 5.5pt; font-weight: 700; color: #555; }
      .info-val { font-size: 7pt; font-weight: 800; color: #000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .addr-box { border: 1px solid #bbb; border-radius: 1mm; padding: 0.6mm 1.5mm; }
      .addr-lbl { font-size: 5.5pt; font-weight: 700; color: #555; }
      .addr-val { font-size: 7pt; font-weight: 800; }
      .notes-box { background: #fff8e1; border: 1px solid #ffe082; border-right: 3px solid #f59e0b; border-radius: 1mm; padding: 0.5mm 2mm; font-size: 5.5pt; font-weight: 700; display: flex; gap: 1.5mm; }
      .notes-box b { color: #92400e; font-size: 6pt; white-space: nowrap; }
      .policy-txt { font-size: 6pt; font-weight: 600; color: #ccc; }
      .footer-brand { font-size: 8pt; font-weight: 900; color: #fff; letter-spacing: 2px; }
    `;

    const pagesHTML = pageGroups.map(group => {
      let rowsHTML = "";
      for (let i = 0; i < group.length; i += cols) {
        const rowItems = group.slice(i, i + cols);
        const rowContent = rowItems.map((sh: any) => shipmentInvoiceHTML(sh)).join("");
        const empty = rowItems.length < cols ? '<div class="empty-slot"></div>' : "";
        rowsHTML += `<div class="inv-row${cols === 1 ? " single" : ""}">${rowContent}${empty}</div>`;
      }
      const rowCount = Math.ceil(group.length / cols);
      return `<div class="${rowCount <= 1 ? "page single-row" : "page"}">${rowsHTML}</div>`;
    }).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فواتير الشحنات - ${brandName}</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet"><style>${styles}</style></head><body>${pagesHTML}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { setTimeout(() => { printWindow.focus(); printWindow.print(); }, 600); };
  };

  useEffect(() => {
    if (!preselectedInvoiceNumber || autoPrintTriggeredRef.current) return;
    if (isLoading || isDirectInvoiceLoading || !invoiceGroups.length) return;
    if (!invoiceGroups.some(g => g.invoiceNumber === preselectedInvoiceNumber)) return;
    const grp = invoiceGroups.find(g => g.invoiceNumber === preselectedInvoiceNumber);
    const hasCache = realOrdersCache.has(preselectedInvoiceNumber);
    const hasDirectOrders = directInvoiceOrders && directInvoiceOrders.length > 0;
    const ordersReady = hasCache || hasDirectOrders || (grp && grp.orders.length > 1);
    if (!ordersReady) return;
    const nextSelectedIds = new Set([preselectedInvoiceNumber]);
    setSelectedIds(nextSelectedIds);
    autoPrintTriggeredRef.current = true;
    void handlePrint(nextSelectedIds);
  }, [preselectedInvoiceNumber, isLoading, isDirectInvoiceLoading, invoiceGroups, realOrdersCache, directInvoiceOrders]);

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-in fade-in duration-500" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">فواتير الشحنات</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            تظهر الشحنات في مرحلة «قيد الشحن في المخزن»
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground whitespace-nowrap">فواتير/صفحة:</span>
            <Select value={String(perPage)} onValueChange={(v) => setPerPage(Number(v))}>
              <SelectTrigger className="w-28 h-9 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 فاتورة</SelectItem>
                <SelectItem value="2">2 فواتير</SelectItem>
                <SelectItem value="4">4 فواتير</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => void handleShipmentPrint()} className="gap-2 font-bold text-sm h-9" disabled={selectedShipmentIds.size === 0}>
              <Printer className="w-4 h-4" />طباعة ({selectedShipmentIds.size})
            </Button>
          </div>
      </div>

      {/* ══════════════ فواتير الشحنات ══════════════ */}

      <div className="space-y-3">
          {/* شريط معلومات */}
          <Card className="border-border overflow-hidden">
            <div className="p-3 flex items-center gap-2 flex-wrap">
              <Button
                variant="outline" size="sm"
                className="h-8 text-xs gap-1 border-border"
                onClick={() => setSelectedShipmentIds(new Set(warehouseShipments.map((s: any) => s.id)))}
              >
                <CheckSquare className="w-3.5 h-3.5" />تحديد الكل ({warehouseShipments.length})
              </Button>
              {selectedShipmentIds.size > 0 && (
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setSelectedShipmentIds(new Set())}>
                  <Square className="w-3.5 h-3.5" />إلغاء التحديد
                </Button>
              )}
              {selectedShipmentIds.size > 0 && (
                <span className="text-xs text-primary font-bold">{selectedShipmentIds.size} محدد</span>
              )}
              {!isShipmentsLoading && (
                <span className="text-xs text-muted-foreground mr-auto">
                  {warehouseShipments.length} شحنة
                  {warehouseShipments.length > 0 && (
                    <span className="mr-1 text-primary font-bold">
                      · {formatCurrency(warehouseShipments.reduce((s: number, sh: any) => s + (parseFloat(sh.codAmount) || 0), 0))} COD
                    </span>
                  )}
                </span>
              )}
            </div>
          </Card>

          {/* قائمة الشحنات */}
          {isShipmentsLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
          ) : warehouseShipments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {warehouseShipments.map((sh: any) => {
                const sel = selectedShipmentIds.has(sh.id);
                const company = shippingCompanies?.find((c: any) => c.id === sh.shippingCompanyId);
                return (
                  <Card
                    key={sh.id}
                    onClick={() => setSelectedShipmentIds(prev => {
                      const n = new Set(prev);
                      n.has(sh.id) ? n.delete(sh.id) : n.add(sh.id);
                      return n;
                    })}
                    className={`border p-4 cursor-pointer transition-all select-none ${
                      sel
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                        : "border-border bg-card hover:border-primary/40 hover:bg-muted/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {sel
                          ? <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                          : <Square className="w-4 h-4 text-muted-foreground shrink-0" />}
                        <div>
                          <p className="font-bold text-sm leading-tight">{sh.receiverName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            #{sh.shipmentNumber ?? String(sh.id).padStart(4, "0")}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[9px] font-bold border shrink-0 ${shipmentStatusClasses[sh.status] || ""}`}>
                        {shipmentStatusLabels[sh.status] ?? sh.status}
                      </Badge>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex justify-between items-center">
                        <span className="text-foreground font-medium">COD</span>
                        <span className="font-bold text-primary">{formatCurrency(parseFloat(sh.codAmount) || 0)}</span>
                      </div>
                      {(parseFloat(sh.shippingFee) || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span>رسوم الشحن</span>
                          <span className="font-semibold">{formatCurrency(parseFloat(sh.shippingFee) || 0)}</span>
                        </div>
                      )}
                      {sh.description && (
                        <p className="text-foreground font-medium truncate">📦 {sh.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5">
                        {company && <span className="flex items-center gap-0.5">🚚 {company.name}</span>}
                        {sh.receiverPhone && <span className="font-mono text-[11px]">📞 {sh.receiverPhone}</span>}
                        {sh.receiverCity && <span>📍 {sh.receiverCity}</span>}
                      </div>
                      {sh.trackingNumber && (
                        <p className="font-mono text-[10px] opacity-70 dir-ltr text-left">🔎 {sh.trackingNumber}</p>
                      )}
                      <p className="text-[10px] opacity-60">{sh.createdAt ? format(new Date(sh.createdAt), "yyyy/MM/dd") : ""}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-border p-12 text-center">
              <Truck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
              <p className="font-bold">لا توجد شحنات</p>
              <p className="text-sm text-muted-foreground mt-1">سيظهر هنا الشحنات التي حالتها «قيد الشحن في المخزن»</p>
            </Card>
          )}
      </div>
    </div>
  );
}