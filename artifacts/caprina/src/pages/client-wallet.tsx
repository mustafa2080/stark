import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CheckCircle2, AlertCircle, TrendingUp, FileText,
  RefreshCcw, ArrowDownCircle, ArrowUpCircle, Receipt, Clock, RotateCcw,
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

interface ManifestTxnRow {
  type: "manifest" | "manifest_payment";
  date: string;
  label: string;
  amount: number;
  manifestId?: number;
  manifestNumber?: string;
}

interface WalletResponse {
  payments: PaymentRow[];
  invoices: InvoiceRow[];
  creditLimit: string;
  accountStatus: string;
  clientBalance: number;
  manifestTransactions: ManifestTxnRow[];
  manifestTransactionsSummary: { totalManifestsValue: number; totalManifestsPaid: number; netBalance: number };
}

// ── Summary card (glow + shadow + gradient) ────────────────────────────────
function SummaryCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="relative rounded-2xl p-4 overflow-hidden group transition-transform duration-300 hover:-translate-y-0.5"
      style={{
        background: `linear-gradient(160deg, ${color}14 0%, hsl(var(--muted)/0.35) 55%)`,
        border: `1px solid ${color}33`,
        boxShadow: `0 4px 20px -6px ${color}40, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}>
      {/* glow blob */}
      <div className="absolute -top-6 -left-6 w-20 h-20 rounded-full blur-2xl opacity-60 pointer-events-none transition-opacity duration-300 group-hover:opacity-90"
        style={{ background: color }} />
      <div className="relative flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(145deg, ${color} 0%, ${color}99 100%)`,
            boxShadow: `0 3px 12px -2px ${color}80, inset 0 1px 0 rgba(255,255,255,0.25)`,
          }}>
          <Icon size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
          <p className="text-base font-black text-foreground truncate">{value}</p>
        </div>
      </div>
      {sub && <p className="relative text-[10px] text-muted-foreground/70 mt-2 pt-2 border-t border-border/40">{sub}</p>}
    </div>
  );
}

// ── Financial hero banner ──────────────────────────────────────────────────
function FinanceHero({ outstanding, totalCollected, totalInvoiced }: { outstanding: number; totalCollected: number; totalInvoiced: number }) {
  const isOwing = outstanding > 0;
  const isOverpaid = outstanding < 0; // العميل اتصرفله أكتر من المستحق (رصيد زيادة له)
  const heroColor = isOwing ? "#f59e0b" : "#22c55e";

  return (
    <div className="relative rounded-3xl p-6 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${heroColor}1f 0%, hsl(var(--muted)/0.4) 45%, hsl(var(--muted)/0.25) 100%)`,
        border: `1px solid ${heroColor}30`,
        boxShadow: `0 12px 40px -12px ${heroColor}45, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}>
      {/* ambient glow blobs */}
      <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full blur-3xl opacity-40 pointer-events-none" style={{ background: heroColor }} />
      <div className="absolute -bottom-20 -left-16 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: "#3b82f6" }} />

      <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <p className="text-xs font-bold text-muted-foreground mb-1.5">
            {isOwing ? "المستحق لك حالياً" : isOverpaid ? "رصيد زيادة لك (مصروف أكتر من المستحق)" : "حسابك متوازن تماماً"}
          </p>
          <p className="text-4xl font-black tracking-tight" style={{ color: heroColor }}>
            {fc(Math.abs(outstanding))}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-2">
            من إجمالي مستحقات {fc(totalInvoiced)} — تم صرف {fc(totalCollected)} لك بالفعل
          </p>
        </div>

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
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"payments" | "invoices">("payments");

  const { data, isLoading, refetch, isRefetching } = useQuery<WalletResponse>({
    queryKey: ["client-portal-wallet"],
    queryFn: () => apiFetch("/client-portal/wallet"),
    enabled: !!user,
    staleTime: 20_000,
  });

  const payments = data?.payments ?? [];
  const invoices = data?.invoices ?? [];
  const manifestTxns = data?.manifestTransactions ?? [];

  const totalCollected = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  // ── المستحق/رصيد العميل: نفس مصدر الحقيقة الموحّد (بيانات حساب العميل
  // المقفولة ناقص السدادات — computeClosedManifestsForClient بالباك إند)، مش
  // نظام الفواتير القديم (clientInvoicesTable) اللي غالبًا فاضي للعملاء اللي
  // بيشتغلوا بنظام "بيان حساب العميل" — كان بيخلي الصفحة تقول "متوازن تمامًا"
  // برغم إن عليه مبلغ فعلي ظاهر صح في لوحة الأدمن.
  const totalInvoiced = data?.manifestTransactionsSummary?.totalManifestsValue ?? 0;
  const totalPaidOnInvoices = data?.manifestTransactionsSummary?.totalManifestsPaid ?? 0;
  const outstanding = data?.clientBalance ?? 0;

  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-foreground">التسويات المالية</h1>
            <p className="text-sm text-muted-foreground mt-1">سجل مدفوعاتك وفواتيرك ومستحقاتك بالتفصيل</p>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button onClick={() => setLocation("/client-returns")}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <RotateCcw size={15} /> المرتجعات
            </button>
            <button onClick={() => refetch()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-foreground/70 bg-muted/40 border border-border">
              <RefreshCcw size={15} className={isRefetching ? "animate-spin" : ""} /> تحديث
            </button>
          </div>
        </div>

        {/* ── Financial hero ── */}
        <FinanceHero
          outstanding={outstanding}
          totalCollected={totalCollected}
          totalInvoiced={totalInvoiced}
        />

        {/* ── تفاصيل حركة حساب الشحن (بيانات مغلقة + سدادات) ── */}
        {manifestTxns.length > 0 && (
          <SectionCard title="تفاصيل حركة حساب الشحن" icon={FileText}>
            <div className="divide-y divide-border/60">
              {manifestTxns.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{fd(t.date)}</p>
                  </div>
                  <span className={cn("text-sm font-black shrink-0", t.amount >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {t.amount >= 0 ? "+" : ""}{fc(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={CheckCircle2} label="إجمالي المصروف لك" value={fc(totalCollected)} color="#22c55e" />
          <SummaryCard icon={Receipt} label="إجمالي المستحقات" value={fc(totalInvoiced)} color="#3b82f6" />
          <SummaryCard icon={AlertCircle} label="المستحق لك" value={fc(outstanding)} color="#f59e0b" />
        </div>

        {/* ── Tabs ── */}
        <div className="grid grid-cols-2 sm:flex items-center gap-2">
          <button onClick={() => setTab("payments")}
            className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-colors text-center",
              tab === "payments" ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground")}>
            <ArrowDownCircle size={14} className="inline-block ml-1.5 -mt-0.5" /> سجل المدفوعات لك ({payments.length})
          </button>
          <button onClick={() => setTab("invoices")}
            className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-colors text-center",
              tab === "invoices" ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground")}>
            <FileText size={14} className="inline-block ml-1.5 -mt-0.5" /> الفواتير ({invoices.length})
          </button>
        </div>

        {/* ── Payments Tab ── */}
        {tab === "payments" && (
          <SectionCard title="سجل المدفوعات لك" icon={ArrowDownCircle}>
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-border">
              {isLoading ? (
                <div className="text-center py-10 text-muted-foreground text-sm">جارٍ التحميل...</div>
              ) : payments.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">لا يوجد مدفوعات مسجلة بعد</div>
              ) : payments.map(p => (
                <div key={p.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-foreground/60">
                      <Clock size={12} className="text-muted-foreground/50" /> {fd(p.paidAt)}
                    </span>
                    <span className="font-bold text-sm" style={{ color: "#22c55e" }}>{fc(p.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">طريقة الدفع</span>
                    <span className="text-foreground/70">{PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">رقم الإيصال</span>
                    <span className="font-mono text-muted-foreground">{p.receiptNumber || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">شحنة مرتبطة</span>
                    <span className="text-muted-foreground">{p.linkedShipmentId ? `#${p.linkedShipmentId}` : "—"}</span>
                  </div>
                  {p.notes && (
                    <div className="text-xs text-muted-foreground/70 pt-1 border-t border-border/40">{p.notes}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
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
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">لا يوجد مدفوعات مسجلة بعد</td></tr>
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
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-border">
              {isLoading ? (
                <div className="text-center py-10 text-muted-foreground text-sm">جارٍ التحميل...</div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">لا يوجد فواتير مسجلة بعد</div>
              ) : invoices.map(inv => {
                const meta = INVOICE_STATUS_META[inv.status] ?? { label: inv.status, color: "#64748b", bg: "rgba(100,116,139,0.12)" };
                return (
                  <div key={inv.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-foreground/70">{inv.invoiceNumber}</span>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">الفترة</span>
                      <span className="text-muted-foreground">
                        {inv.periodFrom && inv.periodTo ? `${fd(inv.periodFrom)} — ${fd(inv.periodTo)}` : "—"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
                      <div>
                        <p className="text-[10px] text-muted-foreground">إجمالي المستحق</p>
                        <p className="text-xs font-bold text-foreground/90">{fc(inv.totalAmount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">المصروف لك</p>
                        <p className="text-xs font-bold" style={{ color: "#22c55e" }}>{fc(inv.paidAmount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">عدد الشحنات</p>
                        <p className="text-xs font-bold text-foreground/60">{inv.shipmentIds?.length ?? 0}</p>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70">تاريخ الإصدار: {fd(inv.createdAt)}</div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs" dir="rtl">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">رقم الفاتورة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">الفترة</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">عدد الشحنات</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">إجمالي المستحق</th>
                    <th className="text-right font-bold text-muted-foreground px-4 py-3">المصروف لك</th>
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
