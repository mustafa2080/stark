import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, CheckCircle2, AlertCircle, TrendingUp, FileText,
  RefreshCcw, ArrowDownCircle, ArrowUpCircle, Receipt, Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Helpers ─────────────────────────────────────────────────────────────
const fc = (n: number | string) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);

const fd = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }) : "—";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  wallet: "محفظة إلكترونية",
  instapay: "انستاباي",
  other: "أخرى",
};

const INVOICE_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  unpaid:  { label: "غير مدفوعة",   color: "#dc2626", bg: "rgba(239,68,68,0.12)" },
  partial: { label: "مدفوعة جزئياً", color: "#d97706", bg: "rgba(245,158,11,0.12)" },
  paid:    { label: "مدفوعة",        color: "#16a34a", bg: "rgba(34,197,94,0.12)" },
};

interface PaymentRow {
  id: number;
  amount: string;
  paymentMethod: string;
  receiptNumber: string | null;
  linkedShipmentId: number | null;
  notes: string | null;
  paidAt: string;
}

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  periodFrom: string | null;
  periodTo: string | null;
  shipmentIds: number[];
  totalAmount: string;
  paidAmount: string;
  status: string;
  createdAt: string;
}

interface WalletResponse {
  payments: PaymentRow[];
  invoices: InvoiceRow[];
  creditLimit: string;
  accountStatus: string;
}

// ── Summary card ──────────────────────────────────────────────────────────
function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3 bg-muted/40 border border-border">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}22` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
        <p className="text-base font-black text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Section shell ─────────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden bg-muted/25 border border-border">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Icon size={16} className="text-muted-foreground" />
        <p className="text-sm font-black text-foreground">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════
export default function ClientWalletPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"payments" | "invoices">("payments");

  const { data, isLoading, refetch, isRefetching } = useQuery<WalletResponse>({
    queryKey: ["client-portal-wallet"],
    queryFn: () => apiFetch("/client-portal/wallet"),
    enabled: !!user,
    staleTime: 20_000,
  });

  const payments = data?.payments ?? [];
  const invoices = data?.invoices ?? [];

  const totalCollected = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
  const totalPaidOnInvoices = invoices.reduce((s, i) => s + Number(i.paidAmount || 0), 0);
  const outstanding = Math.max(0, totalInvoiced - totalPaidOnInvoices);

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-foreground">التسويات المالية</h1>
            <p className="text-sm text-muted-foreground mt-1">سجل مدفوعاتك وفواتيرك ومستحقاتك بالتفصيل</p>
          </div>
          <button onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
            <RefreshCcw size={15} className={isRefetching ? "animate-spin" : ""} /> تحديث
          </button>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={CheckCircle2} label="إجمالي المحصّل" value={fc(totalCollected)} color="#22c55e" />
          <SummaryCard icon={Receipt} label="إجمالي الفواتير" value={fc(totalInvoiced)} color="#3b82f6" />
          <SummaryCard icon={AlertCircle} label="المستحق عليك" value={fc(outstanding)} color="#f59e0b" />
          <SummaryCard icon={Wallet} label="الحد الائتماني" value={fc(data?.creditLimit ?? 0)} color="#a855f7" />
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-2">
          <button onClick={() => setTab("payments")}
            className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-colors",
              tab === "payments" ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground")}>
            <ArrowDownCircle size={14} className="inline-block ml-1.5 -mt-0.5" /> سجل التحصيلات ({payments.length})
          </button>
          <button onClick={() => setTab("invoices")}
            className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-colors",
              tab === "invoices" ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground")}>
            <FileText size={14} className="inline-block ml-1.5 -mt-0.5" /> الفواتير ({invoices.length})
          </button>
        </div>

        {/* ── Payments Tab ── */}
        {tab === "payments" && (
          <SectionCard title="سجل التحصيلات" icon={ArrowDownCircle}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" dir="rtl">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">التاريخ</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">المبلغ</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">طريقة الدفع</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">رقم الإيصال</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">شحنة مرتبطة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">جارٍ التحميل...</td></tr>
                  ) : payments.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">لا يوجد تحصيلات مسجلة بعد</td></tr>
                  ) : payments.map(p => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-3 text-foreground/60">
                        <span className="inline-flex items-center gap-1.5"><Clock size={12} className="text-muted-foreground/50" /> {fd(p.paidAt)}</span>
                      </td>
                      <td className="px-4 py-3 font-bold" style={{ color: "#22c55e" }}>{fc(p.amount)}</td>
                      <td className="px-4 py-3 text-foreground/70">{PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{p.receiptNumber || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.linkedShipmentId ? `#${p.linkedShipmentId}` : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground/70 max-w-[200px] truncate">{p.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Invoices Tab ── */}
        {tab === "invoices" && (
          <SectionCard title="الفواتير" icon={FileText}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" dir="rtl">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">رقم الفاتورة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">الفترة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">عدد الشحنات</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">الإجمالي</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">المدفوع</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">الحالة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">تاريخ الإصدار</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">جارٍ التحميل...</td></tr>
                  ) : invoices.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">لا يوجد فواتير مسجلة بعد</td></tr>
                  ) : invoices.map(inv => {
                    const meta = INVOICE_STATUS_META[inv.status] ?? { label: inv.status, color: "#64748b", bg: "rgba(100,116,139,0.12)" };
                    return (
                      <tr key={inv.id} className="border-t border-border">
                        <td className="px-4 py-3 font-mono text-foreground/70">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {inv.periodFrom && inv.periodTo ? `${fd(inv.periodFrom)} — ${fd(inv.periodTo)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground/60">{inv.shipmentIds?.length ?? 0}</td>
                        <td className="px-4 py-3 font-bold text-foreground/90">{fc(inv.totalAmount)}</td>
                        <td className="px-4 py-3" style={{ color: "#22c55e" }}>{fc(inv.paidAmount)}</td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{fd(inv.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

      </div>
    </div>
  );
}
