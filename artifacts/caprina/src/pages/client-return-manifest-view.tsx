import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useParams, Link } from "wouter";
import {
  ArrowRight, FileText, Lock, LockOpen, Package,
  Printer, AlertCircle, Phone, MapPin, Layers,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const formatCurrency = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);

const RETURN_REASON_LABELS: Record<string, string> = {
  refused_paid: "رفض الاستلام (مدفوع)",
  refused_unpaid: "رفض الاستلام (غير مدفوع)",
  quality: "مشكلة في الجودة",
  unaware: "لا يعلم عن الشحنة",
  cancel_requested: "طلب إلغاء",
  no_answer: "لا يوجد رد",
  out_of_coverage: "خارج نطاق التغطية",
  wrong_address: "عنوان خاطئ",
  other: "سبب آخر",
};

interface ReturnManifestItem {
  id: number;
  manifestId: number;
  shipmentId: number;
  shipmentNumber: string;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverCity: string | null;
  codAmount: string | null;
  returnReason: string | null;
  addedAt: string;
}

interface ReturnManifestDetail {
  id: number;
  manifestNumber: string;
  status: "open" | "closed";
  notes: string | null;
  createdAt: string;
  closedAt: string | null;
  items: ReturnManifestItem[];
  stats: { total: number; totalCodAmount: number };
}

export default function ClientReturnManifestViewPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data: manifest, isLoading, error } = useQuery<ReturnManifestDetail>({
    queryKey: ["client-portal-return-manifest", id],
    queryFn: () => apiFetch(`/client-portal/return-manifests/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        جاري التحميل...
      </div>
    );
  }

  if (error || !manifest) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p>تعذر جلب بيانات هذا البيان</p>
        <Link href="/client-returns">
          <button className="text-primary text-xs font-bold">العودة للمرتجعات</button>
        </Link>
      </div>
    );
  }

  const isOpen = manifest.status === "open";
  const items = manifest.items;
  const totalCod = manifest.stats.totalCodAmount;

  return (
    <>
      <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background print:hidden" dir="rtl">
        <div className="max-w-[1100px] mx-auto space-y-5">

          {/* ── Header ── */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted/40 via-muted/10 to-transparent p-4 sm:p-5">
            <div className={`absolute -top-10 -left-10 w-40 h-40 rounded-full blur-3xl opacity-40 ${isOpen ? "bg-teal-500/30" : "bg-slate-400/20"}`} />
            <div className="relative flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Link href="/client-returns">
                  <button className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted/40 border border-border hover:bg-muted/60 hover:border-primary/40 transition-all">
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">{manifest.manifestNumber}</h1>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm ${
                      isOpen
                        ? "bg-emerald-900/30 text-emerald-400 border border-emerald-700/60 shadow-emerald-900/30"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}>
                      {isOpen ? <LockOpen className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                      {isOpen ? "مفتوح" : "مغلق"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                    {format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}
                    {manifest.closedAt && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                        أُغلق في {format(new Date(manifest.closedAt), "d MMMM yyyy", { locale: ar })}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border hover:bg-muted/60 hover:border-primary/30 transition-all shadow-sm"
              >
                <Printer size={15} /> طباعة
              </button>
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1 py-4 rounded-2xl bg-muted/25 border border-border">
              <Layers className="w-4 h-4 text-foreground" />
              <span className="text-xl font-black">{manifest.stats.total}</span>
              <span className="text-[11px] text-muted-foreground">عدد المرتجعات</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-4 rounded-2xl bg-muted/25 border border-border">
              <Package className="w-4 h-4 text-teal-400" />
              <span className="text-xl font-black text-teal-400">{formatCurrency(totalCod)}</span>
              <span className="text-[11px] text-muted-foreground">إجمالي القيمة</span>
            </div>
            {manifest.notes && (
              <div className="flex flex-col items-center justify-center gap-1 py-4 rounded-2xl bg-muted/25 border border-border">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground text-center px-2">{manifest.notes}</span>
              </div>
            )}
          </div>

          {/* ── Items list ── */}
          {items.length === 0 ? (
            <div className="text-center py-16 rounded-2xl bg-muted/25 border border-border">
              <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">لا توجد مرتجعات في هذا البيان بعد</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl p-4 border border-border bg-card/60">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-foreground">{item.receiverName || "—"}</span>
                        {item.returnReason && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-orange-300" style={{ background: "rgba(245,158,11,0.12)" }}>
                            {RETURN_REASON_LABELS[item.returnReason] ?? item.returnReason}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        {item.receiverPhone && (
                          <span className="flex items-center gap-1"><Phone size={12} /> {item.receiverPhone}</span>
                        )}
                        {item.receiverCity && (
                          <span className="flex items-center gap-1"><MapPin size={12} /> {item.receiverCity}</span>
                        )}
                        <span className="flex items-center gap-1"><FileText size={12} /> {item.shipmentNumber}</span>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-lg font-black text-foreground">{formatCurrency(item.codAmount)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(item.addedAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PrintDocument manifest={manifest} items={items} isOpen={isOpen} totalCod={totalCod} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ── PrintDocument — قالب طباعة رسمي، نفس نمط بيان الشحنات بالظبط
// ─────────────────────────────────────────────────────────────────────────
function PrintDocument({ manifest, items, isOpen, totalCod }: {
  manifest: ReturnManifestDetail;
  items: ReturnManifestItem[];
  isOpen: boolean;
  totalCod: number;
}) {
  return (
    <div className="hidden print:block" dir="rtl">
      <div className="print-doc">
        {/* ── ترويسة رسمية ── */}
        <div className="print-header">
          <div className="print-header-brand">
            <div className="print-logo">STARK</div>
            <div className="print-brand-text">
              <p className="print-brand-name">Stark Shipping &amp; Logistics</p>
              <p className="print-brand-sub">نظام إدارة الشحن والبيانات</p>
            </div>
          </div>
          <div className="print-header-meta">
            <p className="print-doc-title">بيان مرتجعات</p>
            <p className="print-doc-number">{manifest.manifestNumber}</p>
          </div>
        </div>

        <div className="print-divider" />

        {/* ── معلومات البيان ── */}
        <div className="print-info-grid">
          <div className="print-info-item">
            <span className="print-info-label">تاريخ الإنشاء</span>
            <span className="print-info-value">{format(new Date(manifest.createdAt), "d MMMM yyyy", { locale: ar })}</span>
          </div>
          <div className="print-info-item">
            <span className="print-info-label">الحالة</span>
            <span className="print-info-value">{isOpen ? "مفتوح" : "مغلق"}</span>
          </div>
          {manifest.closedAt && (
            <div className="print-info-item">
              <span className="print-info-label">تاريخ الإغلاق</span>
              <span className="print-info-value">{format(new Date(manifest.closedAt), "d MMMM yyyy", { locale: ar })}</span>
            </div>
          )}
          <div className="print-info-item">
            <span className="print-info-label">إجمالي المرتجعات</span>
            <span className="print-info-value">{items.length}</span>
          </div>
        </div>

        {/* ── جدول المرتجعات ── */}
        <table className="print-items-table">
          <thead>
            <tr>
              <th style={{ width: "22px" }}>#</th>
              <th style={{ width: "20%" }}>اسم العميل</th>
              <th style={{ width: "15%" }}>الهاتف</th>
              <th style={{ width: "18%" }}>المدينة</th>
              <th style={{ width: "16%" }}>رقم الشحنة</th>
              <th style={{ width: "16%" }}>سبب الإرجاع</th>
              <th style={{ width: "70px" }}>القيمة</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id}>
                <td className="print-cell-center">{idx + 1}</td>
                <td>{item.receiverName || "—"}</td>
                <td className="print-cell-ltr">{item.receiverPhone || "—"}</td>
                <td>{item.receiverCity || "—"}</td>
                <td className="print-cell-mono">{item.shipmentNumber}</td>
                <td>{RETURN_REASON_LABELS[item.returnReason ?? ""] ?? (item.returnReason || "—")}</td>
                <td className="print-cell-center">{formatCurrency(item.codAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── الملخص المالي النهائي ── */}
        <table className="print-financial-table">
          <tbody>
            <tr>
              <td className="print-financial-label">إجمالي قيمة المرتجعات</td>
              <td className="print-financial-value">{formatCurrency(totalCod)}</td>
            </tr>
          </tbody>
        </table>

        {/* ── التوقيعات ── */}
        <div className="print-signatures">
          <div className="print-signature-block">
            <p className="print-signature-label">توقيع المندوب</p>
            <div className="print-signature-line" />
          </div>
          <div className="print-signature-block">
            <p className="print-signature-label">توقيع العميل</p>
            <div className="print-signature-line" />
          </div>
        </div>

        {/* ── تذييل ── */}
        <div className="print-footer">
          <span>تم إنشاء هذا المستند إلكترونيًا بواسطة نظام Stark لإدارة الشحن</span>
          <span>{format(new Date(), "d MMMM yyyy — HH:mm", { locale: ar })}</span>
        </div>
      </div>

      {/* ── أنماط الطباعة — نفس أنماط بيان الشحنات بالظبط ── */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm 12mm;
          }
          html, body {
            background: #ffffff !important;
          }
        }

        .print-doc {
          font-family: "Segoe UI", Tahoma, Arial, sans-serif;
          color: #111111;
          background: #ffffff;
          width: 100%;
        }

        .print-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 10px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .print-header-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .print-logo {
          width: 44px;
          height: 44px;
          border: 2px solid #111111;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 12px;
          letter-spacing: 0.5px;
        }
        .print-brand-name {
          font-weight: 900;
          font-size: 15px;
          margin: 0;
        }
        .print-brand-sub {
          font-size: 10px;
          color: #555555;
          margin: 2px 0 0;
        }
        .print-header-meta {
          text-align: left;
        }
        .print-doc-title {
          font-size: 11px;
          color: #555555;
          margin: 0;
          font-weight: 700;
        }
        .print-doc-number {
          font-size: 18px;
          font-weight: 900;
          margin: 2px 0 0;
        }

        .print-divider {
          border-bottom: 2px solid #111111;
          margin-bottom: 12px;
        }

        .print-info-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 14px;
          padding: 10px 12px;
          border: 1px solid #cccccc;
          border-radius: 6px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .print-info-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .print-info-label {
          font-size: 9px;
          color: #666666;
          font-weight: 700;
        }
        .print-info-value {
          font-size: 12px;
          font-weight: 900;
        }

        .print-items-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          margin-bottom: 14px;
          font-size: 10px;
        }
        .print-items-table th {
          background: #111111 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color: #ffffff;
          padding: 6px 5px;
          font-size: 9.5px;
          font-weight: 700;
          text-align: right;
          border: 1px solid #111111;
          word-break: break-word;
          overflow-wrap: break-word;
        }
        .print-items-table td {
          border: 1px solid #999999;
          padding: 5px;
          text-align: right;
          word-break: break-word;
          overflow-wrap: break-word;
          vertical-align: top;
          line-height: 1.4;
        }
        .print-items-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .print-items-table tr:nth-child(even) {
          background: #f7f7f7 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-cell-center { text-align: center; }
        .print-cell-ltr { direction: ltr; text-align: right; }
        .print-cell-mono { font-family: "Courier New", monospace; font-size: 9.5px; }

        .print-financial-table {
          width: 50%;
          margin-inline-start: auto;
          border-collapse: collapse;
          margin-bottom: 24px;
          font-size: 11px;
        }
        .print-financial-table td {
          border: 1px solid #111111;
          padding: 7px 10px;
        }
        .print-financial-label {
          background: #f2f2f2;
          font-weight: 700;
        }
        .print-financial-value {
          font-weight: 900;
          text-align: left;
        }

        .print-signatures {
          display: flex;
          justify-content: space-between;
          gap: 40px;
          margin-top: 30px;
          margin-bottom: 20px;
        }
        .print-signature-block {
          flex: 1;
        }
        .print-signature-label {
          font-size: 10px;
          font-weight: 700;
          color: #333333;
          margin: 0 0 26px;
        }
        .print-signature-line {
          border-top: 1px solid #111111;
        }

        .print-footer {
          display: flex;
          justify-content: space-between;
          border-top: 1px solid #cccccc;
          padding-top: 8px;
          font-size: 8.5px;
          color: #777777;
        }

        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }

        .print-financial-table,
        .print-signatures,
        .print-footer {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      `}</style>
    </div>
  );
}
