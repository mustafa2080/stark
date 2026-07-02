// ══════════════════════════════════════════════════════════════════════════
// مولّد تقرير العمليات الشامل (PDF احترافي - عربي RTL)
// يبني تقرير HTML مصمم خصيصاً للطباعة (منفصل عن الداشبورد) ثم يحوله لـ PDF
// ══════════════════════════════════════════════════════════════════════════
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export interface OperationsReportData {
  companyName: string;
  generatedAt: Date;
  overviewCards: { key: string; label: string; value: number; change: number }[];
  executiveSummary: {
    revenue: number; profit: number; growthRate: number; clientsCount: number;
    shipmentsCount: number; successRate: number; topArea: string; nextMonthForecast: number;
  } | null;
  financial: { today: { netProfit: number }; month: { netProfit: number; operatingCost: number } } | null;
  statusDistribution: { status: string; label: string; color: string; value: number }[];
  topClients: { name: string; phone: string | null; shipmentsCount: number; revenue: number; successRate: number }[];
  topReps: { name: string; assigned: number; successRate: number; avgRating: number; ratingsCount: number }[];
  representatives: { displayName: string; totalShipments: number; deliveredShipments: number; successRate: number }[];
  delayedShipments: { trackingNumber: string | null; receiverName: string; receiverCity: string | null; delayedHours: number }[];
  recentShipments: { trackingNumber: string; clientName: string; status: string; amount: number }[];
  revenueTrend: { day: string; revenue: number; profit: number }[];
}

const fc = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n ?? 0);
const fn = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n ?? 0));

function successBadge(rate: number): string {
  const bg = rate >= 80 ? "#d1fae5" : rate >= 50 ? "#fef3c7" : "#fee2e2";
  const fg = rate >= 80 ? "#059669" : rate >= 50 ? "#b45309" : "#dc2626";
  return `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:999px;font-weight:700;font-size:11px;">${rate}%</span>`;
}

// ── بناء HTML التقرير كاملاً (مصمم للطباعة A4 - RTL) ─────────────────────────
function buildReportHtml(data: OperationsReportData): string {
  const dateStr = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  }).format(data.generatedAt);
  const timeStr = new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo",
  }).format(data.generatedAt);

  const kpiCardsHtml = data.overviewCards.map((c) => `
    <div class="kpi-card">
      <div class="kpi-value">${c.key === "revenue" ? fc(c.value) : fn(c.value)}</div>
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-change ${c.change >= 0 ? "up" : "down"}">${c.change >= 0 ? "▲" : "▼"} ${Math.abs(c.change)}%</div>
    </div>`).join("");

  const execHtml = data.executiveSummary ? `
    <div class="exec-grid">
      <div class="exec-item"><div class="exec-val">${fc(data.executiveSummary.revenue)}</div><div class="exec-lbl">الإيرادات</div></div>
      <div class="exec-item"><div class="exec-val">${fc(data.executiveSummary.profit)}</div><div class="exec-lbl">الأرباح</div></div>
      <div class="exec-item"><div class="exec-val" style="color:${data.executiveSummary.growthRate >= 0 ? "#059669" : "#dc2626"}">${data.executiveSummary.growthRate}%</div><div class="exec-lbl">معدل النمو</div></div>
      <div class="exec-item"><div class="exec-val">${fn(data.executiveSummary.clientsCount)}</div><div class="exec-lbl">عدد العملاء</div></div>
      <div class="exec-item"><div class="exec-val">${fn(data.executiveSummary.shipmentsCount)}</div><div class="exec-lbl">عدد الشحنات</div></div>
      <div class="exec-item"><div class="exec-val">${data.executiveSummary.successRate}%</div><div class="exec-lbl">نسبة النجاح</div></div>
      <div class="exec-item"><div class="exec-val">${data.executiveSummary.topArea || "—"}</div><div class="exec-lbl">أكثر المناطق نشاطاً</div></div>
      <div class="exec-item"><div class="exec-val" style="color:#2563eb">${fc(data.executiveSummary.nextMonthForecast)}</div><div class="exec-lbl">توقعات الشهر القادم</div></div>
    </div>` : `<p class="empty">لا توجد بيانات كافية</p>`;

  const financialHtml = data.financial ? `
    <table class="simple-table">
      <tr><td>أرباح اليوم</td><td class="num">${fc(data.financial.today.netProfit)}</td></tr>
      <tr><td>أرباح الشهر</td><td class="num">${fc(data.financial.month.netProfit)}</td></tr>
      <tr><td>تكلفة التشغيل (الشهر)</td><td class="num">${fc(data.financial.month.operatingCost)}</td></tr>
    </table>` : `<p class="empty">لا توجد بيانات كافية</p>`;

  const statusRows = data.statusDistribution.map((s) => {
    const total = data.statusDistribution.reduce((sum, x) => sum + x.value, 0) || 1;
    const pct = Math.round((s.value / total) * 100);
    return `<tr><td><span class="dot" style="background:${s.color}"></span>${s.label}</td><td class="num">${fn(s.value)}</td><td class="num">${pct}%</td></tr>`;
  }).join("");

  const topClientsRows = data.topClients.length ? data.topClients.map((c) => `
    <tr>
      <td>${c.name}${c.phone ? `<div class="sub">${c.phone}</div>` : ""}</td>
      <td class="num">${fn(c.shipmentsCount)}</td>
      <td class="num">${fc(c.revenue)}</td>
      <td class="num">${successBadge(c.successRate)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty">لا توجد بيانات كافية</td></tr>`;

  const topRepsRows = data.topReps.length ? data.topReps.map((r) => `
    <tr>
      <td>${r.name}</td>
      <td class="num">${r.ratingsCount > 0 ? `⭐ ${r.avgRating} (${r.ratingsCount})` : "—"}</td>
      <td class="num">${fn(r.assigned)}</td>
      <td class="num">${successBadge(r.successRate)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty">لا توجد بيانات كافية</td></tr>`;

  const repsRows = data.representatives.length ? data.representatives.map((r) => `
    <tr>
      <td>${r.displayName}</td>
      <td class="num">${fn(r.totalShipments)}</td>
      <td class="num">${fn(r.deliveredShipments)}</td>
      <td class="num">${successBadge(r.successRate)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty">لا يوجد مندوبين</td></tr>`;

  const delayedRows = data.delayedShipments.length ? data.delayedShipments.map((s) => `
    <tr>
      <td>${s.trackingNumber ?? "—"}</td>
      <td>${s.receiverName}</td>
      <td>${s.receiverCity ?? "—"}</td>
      <td class="num"><span style="color:#dc2626;font-weight:700;">${s.delayedHours} ساعة</span></td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty">لا توجد شحنات متأخرة 🎉</td></tr>`;

  const recentRows = data.recentShipments.length ? data.recentShipments.slice(0, 15).map((s) => `
    <tr>
      <td>${s.trackingNumber}</td>
      <td>${s.clientName}</td>
      <td>${s.status}</td>
      <td class="num">${fc(s.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty">لا توجد شحنات</td></tr>`;

  const revenueMax = Math.max(...data.revenueTrend.map((d) => d.revenue), 1);
  const trendBars = data.revenueTrend.map((d) => `
    <div class="trend-bar-wrap">
      <div class="trend-bar" style="height:${Math.max(4, (d.revenue / revenueMax) * 100)}%"></div>
      <div class="trend-day">${d.day}</div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', 'Tahoma', 'Segoe UI', Arial, sans-serif;
    direction: rtl; color: #1e293b; background: #ffffff; width: 794px;
  }
  .page { padding: 36px 40px; }
  .report-header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 4px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-badge {
    width: 46px; height: 46px; border-radius: 10px;
    background: linear-gradient(135deg,#0ea5e9,#0f172a);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 900; font-size: 20px;
  }
  .brand-name { font-size: 20px; font-weight: 900; color: #0f172a; }
  .brand-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .meta { text-align: left; font-size: 11px; color: #64748b; line-height: 1.7; }
  .report-title { font-size: 22px; font-weight: 900; margin: 6px 0 24px; color: #0f172a; }
  .section-title {
    font-size: 14px; font-weight: 800; color: #0f172a; margin: 26px 0 10px;
    display: flex; align-items: center; gap: 8px; border-right: 4px solid #0ea5e9; padding-right: 8px;
  }
  .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
  .kpi-card {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
    padding: 12px 10px; text-align: center;
  }
  .kpi-value { font-size: 15px; font-weight: 900; color: #0f172a; }
  .kpi-label { font-size: 10px; color: #64748b; margin-top: 4px; }
  .kpi-change { font-size: 10px; font-weight: 800; margin-top: 6px; }
  .kpi-change.up { color: #059669; } .kpi-change.down { color: #dc2626; }
  .exec-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .exec-item {
    background: linear-gradient(180deg,#f8fafc,#f1f5f9); border: 1px solid #e2e8f0;
    border-radius: 10px; padding: 14px 8px; text-align: center;
  }
  .exec-val { font-size: 16px; font-weight: 900; color: #0f172a; }
  .exec-lbl { font-size: 10px; color: #64748b; margin-top: 4px; }
  table.data-table, table.simple-table {
    width: 100%; border-collapse: collapse; font-size: 11px;
  }
  table.data-table th {
    background: #0f172a; color: #fff; text-align: right; padding: 8px 10px;
    font-weight: 700; font-size: 10.5px;
  }
  table.data-table td {
    padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;
  }
  table.data-table tr:nth-child(even) { background: #f8fafc; }
  table.simple-table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  td.num { text-align: left; font-weight: 700; }
  .sub { font-size: 9.5px; color: #94a3b8; direction: ltr; text-align: right; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 6px; }
  .empty { text-align: center; color: #94a3b8; padding: 16px; font-size: 11px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .trend-chart { display: flex; align-items: flex-end; gap: 6px; height: 90px; padding-top: 10px; }
  .trend-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .trend-bar { width: 100%; background: linear-gradient(180deg,#3b82f6,#93c5fd); border-radius: 3px 3px 0 0; }
  .trend-day { font-size: 8px; color: #94a3b8; margin-top: 4px; }
  .footer {
    margin-top: 32px; padding-top: 14px; border-top: 2px solid #e2e8f0;
    display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8;
  }
</style>
</head>
<body><div class="page">
  <div class="report-header">
    <div class="brand">
      <div class="brand-badge">S</div>
      <div><div class="brand-name">${data.companyName}</div><div class="brand-sub">STARK Logistics — نظام إدارة الشحن والعمليات</div></div>
    </div>
    <div class="meta">
      <div>تاريخ الإصدار: ${dateStr}</div>
      <div>الساعة: ${timeStr} (بتوقيت القاهرة)</div>
    </div>
  </div>
  <div class="report-title">التقرير الشامل لمركز العمليات</div>

  <div class="section-title">📊 نظرة عامة سريعة (KPIs)</div>
  <div class="kpi-grid">${kpiCardsHtml}</div>

  <div class="section-title">💼 شاشة المدير التنفيذي</div>
  ${execHtml}

  <div class="two-col" style="margin-top:22px;">
    <div>
      <div class="section-title">💰 ملخص الأرباح</div>
      ${financialHtml}
    </div>
    <div>
      <div class="section-title">📦 توزيع الشحنات حسب الحالة</div>
      <table class="data-table">
        <thead><tr><th>الحالة</th><th>العدد</th><th>النسبة</th></tr></thead>
        <tbody>${statusRows}</tbody>
      </table>
    </div>
  </div>

  <div class="section-title">📈 اتجاه الإيرادات (آخر ${data.revenueTrend.length} يوم)</div>
  <div class="trend-chart">${trendBars}</div>

  <div class="section-title">👥 أفضل العملاء (آخر 30 يوم)</div>
  <table class="data-table">
    <thead><tr><th>العميل</th><th>الشحنات</th><th>الإيرادات</th><th>نسبة النجاح</th></tr></thead>
    <tbody>${topClientsRows}</tbody>
  </table>

  <div class="section-title">🚚 أفضل المندوبين (آخر 30 يوم)</div>
  <table class="data-table">
    <thead><tr><th>المندوب</th><th>التقييم</th><th>الشحنات</th><th>نسبة النجاح</th></tr></thead>
    <tbody>${topRepsRows}</tbody>
  </table>

  <div class="section-title">📋 جدول المندوبين اليومي</div>
  <table class="data-table">
    <thead><tr><th>المندوب</th><th>الشحنات</th><th>تم التسليم</th><th>نسبة النجاح</th></tr></thead>
    <tbody>${repsRows}</tbody>
  </table>

  <div class="section-title">⚠️ شحنات متأخرة</div>
  <table class="data-table">
    <thead><tr><th>رقم التتبع</th><th>المستلم</th><th>المحافظة</th><th>مدة التأخير</th></tr></thead>
    <tbody>${delayedRows}</tbody>
  </table>

  <div class="section-title">🧾 آخر الشحنات</div>
  <table class="data-table">
    <thead><tr><th>الرقم</th><th>العميل</th><th>الحالة</th><th>المبلغ</th></tr></thead>
    <tbody>${recentRows}</tbody>
  </table>

  <div class="footer">
    <div>هذا التقرير مُولَّد آلياً من نظام STARK Logistics — سري وللاستخدام الداخلي فقط</div>
    <div>© ${data.generatedAt.getFullYear()} STARK Logistics — جميع الحقوق محفوظة</div>
  </div>
</div></body></html>`;
}

// ── تصدير التقرير إلى PDF (يبني عنصر HTML مخفي، يصوّره، يوزّعه على صفحات A4) ──
export async function exportOperationsReportPdf(data: OperationsReportData): Promise<void> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "-99999px";
  container.style.zIndex = "-1";
  container.innerHTML = buildReportHtml(data);
  document.body.appendChild(container);

  // ننتظر تحميل الخطوط قبل التصوير لضمان دقة النص العربي
  await (document as any).fonts?.ready?.catch(() => {});
  await new Promise((r) => setTimeout(r, 150));

  const pageEl = container.querySelector(".page") as HTMLElement;

  try {
    const canvas = await html2canvas(pageEl, {
      scale: 2.2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: pageEl.scrollWidth,
      windowHeight: pageEl.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const fileDate = new Intl.DateTimeFormat("en-CA").format(data.generatedAt);
    pdf.save(`تقرير-عمليات-STARK-${fileDate}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
