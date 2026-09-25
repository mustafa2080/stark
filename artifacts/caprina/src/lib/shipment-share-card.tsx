// ══════════════════════════════════════════════════════════════════════════
// بطاقة مشاركة الشحنة — صورة احترافية على شكل بوليصة شحن، بالطول
// تُستخدم لمشاركتها مع العميل بدل فاتورة النظام العادية
//
// ملاحظة مهمة: البطاقة دي بترسم بـ Canvas 2D API مباشرة (مش html2canvas).
// السبب: html2canvas مش بيدعم رسم نص عربي RTL بشكل صحيح — الحروف بتتقطع
// وبتترسم بترتيب غلط. الـ Canvas 2D الأصلي في المتصفح بيدعم direction:"rtl"
// بشكل سليم 100%، فالحل الموثوق الوحيد هو رسم كل شيء يدويًا بالإحداثيات.
// ══════════════════════════════════════════════════════════════════════════

import { logoBase64 } from "./logo";

export interface ShipmentShareData {
  id: number;
  shipmentNumber?: string | null;
  trackingNumber?: string | null;
  status: string;
  statusLabel?: string | null;
  createdAt?: string | null;

  receiverName?: string | null;
  receiverPhone?: string | null;
  receiverPhone2?: string | null;
  receiverCity?: string | null;
  receiverAddress?: string | null;

  senderName?: string | null;
  senderPhone?: string | null;
  senderCity?: string | null;

  parcelType?: string | null;
  weight?: string | null;

  zoneLabel?: string | null;            // المحافظة / المنطقة
  shippingCompanyName?: string | null;  // شركة الشحن
  assignedUserName?: string | null;     // المندوب الحالي

  shippingFee?: number | string | null;
  codAmount?: number | string | null;
  totalAmount?: number | string | null;

  canOpen?: number | string | null;      // 1 = مسموح، 0 = غير مسموح
  isDivisible?: number | string | null;  // 1 = قابلة للتجزئة
  rejectionPolicy?: string | null;       // "free" = شحن مجاني عند الرفض

  note?: string | null; // الملاحظة المخصصة (سبب الرفض / ملاحظة الإرسال)

  products?: { name?: string | null; color?: string | null; size?: string | null; quantity?: number | string | null }[];

  // ── بيانات إضافية خاصة بصورة الفاتورة (مشاركة فاتورة) — نفس شكل "فاتورة بيع" في الطباعة ──
  invoiceNumber?: string | null;
  shippingCostTotal?: number | string | null; // تكلفة الشحن (شركة الشحن) — تُضاف لإجمالي المنتجات في صندوق الإجمالي
  invoiceItems?: {
    product?: string | null;
    color?: string | null;
    size?: string | null;
    quantity?: number | string | null;
    unitPrice?: number | string | null;
    totalPrice?: number | string | null;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  // ─── القيم الحقيقية الحالية لحالة الشحنة (نفس STATUS_LABELS في order-constants.ts) ───
  pending:          "قيد الانتظار",
  warehouse_ready:  "قيد الشحن في المخزن",
  in_shipping:      "قيد الشحن",
  received:         "تم التسليم",
  replaced:         "تم الاستبدال",
  parcel_picked:    "تم إحضار الطرد",
  partial_received: "استلام جزئي",
  delayed:          "مؤجلة",
  returned:         "مرتجع",
  // ─── fallback للقيم القديمة في الـ DB ─────────────────────────────────
  waiting: "قيد المراجعة", confirmed: "تم التأكيد", picked_up: "تم الاستلام",
  in_transit: "في الطريق إلى المستلم", out_for_delivery: "خرجت للتسليم", delivered: "تم التسليم",
  cancelled: "ملغاة", postponed: "مؤجلة", problem: "تحتاج متابعة",
};

const STATUS_THEME: Record<string, { base: string; badgeBg: string; badgeText: string }> = {
  // ─── القيم الحقيقية الحالية ─────────────────────────────────────────
  received:         { base: "#0fb88a", badgeBg: "#dcfce7", badgeText: "#15803d" },
  replaced:         { base: "#8b5cf6", badgeBg: "#ede9fe", badgeText: "#5b21b6" },
  parcel_picked:    { base: "#06b6d4", badgeBg: "#cffafe", badgeText: "#155e75" },
  partial_received: { base: "#0891b2", badgeBg: "#cffafe", badgeText: "#155e75" },
  returned:         { base: "#f04452", badgeBg: "#fee2e2", badgeText: "#b91c1c" },
  delayed:          { base: "#f5a623", badgeBg: "#fef3c7", badgeText: "#92400e" },
  warehouse_ready:  { base: "#2f7bf5", badgeBg: "#dbeafe", badgeText: "#1d4ed8" },
  in_shipping:      { base: "#2f7bf5", badgeBg: "#dbeafe", badgeText: "#1d4ed8" },
  pending:          { base: "#8b8fa3", badgeBg: "#e5e7eb", badgeText: "#374151" },
  // ─── fallback للقيم القديمة ─────────────────────────────────────────
  delivered:        { base: "#0fb88a", badgeBg: "#dcfce7", badgeText: "#15803d" },
  cancelled:        { base: "#f04452", badgeBg: "#fee2e2", badgeText: "#b91c1c" },
  problem:          { base: "#f5a623", badgeBg: "#fef3c7", badgeText: "#92400e" },
  postponed:        { base: "#f5a623", badgeBg: "#fef3c7", badgeText: "#92400e" },
  in_transit:       { base: "#2f7bf5", badgeBg: "#dbeafe", badgeText: "#1d4ed8" },
  out_for_delivery: { base: "#2f7bf5", badgeBg: "#dbeafe", badgeText: "#1d4ed8" },
  picked_up:        { base: "#2f7bf5", badgeBg: "#dbeafe", badgeText: "#1d4ed8" },
  confirmed:        { base: "#2f7bf5", badgeBg: "#dbeafe", badgeText: "#1d4ed8" },
  waiting:          { base: "#8b8fa3", badgeBg: "#e5e7eb", badgeText: "#374151" },
};
const DEFAULT_THEME = { base: "#5b62f0", badgeBg: "#e0e7ff", badgeText: "#3730a3" };

const PAYMENT_LABELS: Record<string, string> = {
  cod: "عند الاستلام", cash: "عند الاستلام", prepaid: "مدفوع مسبقًا", paid: "مدفوع مسبقًا",
};

function text(value: unknown, fallback = "—") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

/** يحول لون hex (#rrggbb) إلى rgba بشفافية معينة، لاستخدامه في التدرجات اللونية. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** يفتّح لون hex بنسبة معينة (لعمل تدرج فاتح من نفس لون الحالة). */
function lightenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? amount.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "0";
}

const FONT = "Cairo, 'Segoe UI', Tahoma, Arial, sans-serif";

async function ensureFontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`500 24px ${FONT}`),
      document.fonts.load(`600 24px ${FONT}`),
      document.fonts.load(`700 24px ${FONT}`),
      document.fonts.load(`800 24px ${FONT}`),
      document.fonts.load(`900 24px ${FONT}`),
    ]);
    await document.fonts.ready;
  } catch {
    // fallback fonts موجودة أصلاً في الـ font stack
  }
}

let cachedLogoImg: HTMLImageElement | null = null;
/** يحمّل صورة شعار STARK الحقيقية (base64) مرة واحدة ويعيد استخدامها في كل استدعاء لاحق. */
function loadLogoImage(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (cachedLogoImg && cachedLogoImg.complete) {
      resolve(cachedLogoImg);
      return;
    }
    const img = new Image();
    img.onload = () => {
      cachedLogoImg = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = logoBase64;
  });
}

/** يرسم شعار STARK الحقيقي (من الصورة) داخل مربع بارتفاع h، محافظًا على نسبة الأبعاد، ويعيد العرض الفعلي المرسوم. */
/** يرسم شعار STARK الحقيقي (من الصورة) داخل دايرة بيضاء، محافظًا على نسبة الأبعاد بالكامل (بدون قص)، ويعيد قطر الدايرة الفعلي المرسوم. */
function drawStarkLogoImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, h: number): number {
  const ratio = img.naturalWidth / img.naturalHeight;
  // الدايرة لازم تكون كبيرة بما يكفي إنها تحتوي أطول ضلع من اللوجو بالكامل
  // + هامش داخلي، وإلا اللوجو (لو مستطيل) هيتقص عند حواف الدايرة.
  const longestSide = h * Math.max(ratio, 1 / ratio);
  const innerPad = longestSide * 0.16; // هامش داخلي بين اللوجو وحافة الدايرة
  const diameter = longestSide + innerPad * 2;
  const radius = diameter / 2;
  const cx = x + radius;
  const cy = y + radius;

  ctx.save();
  ctx.shadowColor = "rgba(18, 21, 28, 0.16)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#e9eaf0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // اللوجو بيترسم بالحجم الفعلي بتاعه (h ارتفاع) في منتصف الدايرة تمامًا —
  // بدون أي قص، فالشعار بالكامل (بما فيه أي هوامش شفافة حوله) يظهر واضح.
  const logoH = h;
  const logoW = logoH * ratio;
  ctx.drawImage(img, cx - logoW / 2, cy - logoH / 2, logoW, logoH);

  return diameter;
}

// ── أدوات رسم مساعدة ────────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | { tl: number; tr: number; br: number; bl: number }) {
  const rad = typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r;
  ctx.beginPath();
  ctx.moveTo(x + rad.tl, y);
  ctx.lineTo(x + w - rad.tr, y);
  ctx.arcTo(x + w, y, x + w, y + rad.tr, rad.tr);
  ctx.lineTo(x + w, y + h - rad.br);
  ctx.arcTo(x + w, y + h, x + w - rad.br, y + h, rad.br);
  ctx.lineTo(x + rad.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad.bl, rad.bl);
  ctx.lineTo(x, y + rad.tl);
  ctx.arcTo(x, y, x + rad.tl, y, rad.tl);
  ctx.closePath();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: { size: number; weight?: number; color: string; align?: CanvasTextAlign; dir?: "rtl" | "ltr" }
) {
  ctx.direction = opts.dir ?? "rtl";
  ctx.textAlign = opts.align ?? (opts.dir === "ltr" ? "left" : "right");
  ctx.textBaseline = "alphabetic";
  ctx.font = `${opts.weight ?? 500} ${opts.size}px ${FONT}`;
  ctx.fillStyle = opts.color;
  ctx.fillText(str, x, y);
}

// نص بيتقص بـ "…" لو أعرض من maxWidth — بيمنع تداخل نصين متقابلين في نفس الصف (مثلاً عمودين في صندوق بيانات العميل)
function drawTruncatedText(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  maxWidth: number,
  opts: { size: number; weight?: number; color: string; align?: CanvasTextAlign }
) {
  ctx.direction = "rtl";
  ctx.textAlign = opts.align ?? "right";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${opts.weight ?? 500} ${opts.size}px ${FONT}`;
  ctx.fillStyle = opts.color;
  let out = str;
  if (ctx.measureText(out).width > maxWidth) {
    while (out.length > 1 && ctx.measureText(out + "…").width > maxWidth) {
      out = out.slice(0, -1);
    }
    out = out + "…";
  }
  ctx.fillText(out, x, y);
}

function countWrapLines(ctx: CanvasRenderingContext2D, str: string, maxW: number, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const words = str.split(" ");
  let line = "";
  let count = 1;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { count++; line = w; } else { line = t; }
  }
  return count;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  opts: { size: number; weight?: number; color: string; align?: CanvasTextAlign }
): number {
  ctx.direction = "rtl";
  ctx.textAlign = opts.align ?? "right";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${opts.weight ?? 500} ${opts.size}px ${FONT}`;
  ctx.fillStyle = opts.color;

  const words = str.split(" ");
  let line = "";
  let lineCount = 0;
  const lines: string[] = [];
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);

  for (const l of lines) {
    ctx.fillText(l, x, y + lineCount * lineHeight);
    lineCount++;
  }
  return lineCount;
}

/** يرسم شارة دائرية كبيرة (ختم "تم التسليم") فيها علامة صح كبيرة وواضحة في المنتصف. تُستخدم فقط لما الحالة delivered. */
function drawDeliveredStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);

  // هالة خفيفة حول الختم
  ctx.beginPath();
  ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, 0.12);
  ctx.fill();

  // الدائرة الرئيسية بتدرج
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, lightenHex(color, 0.12));
  grad.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // حلقة داخلية بيضاء (شكل ختم كلاسيكي)
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r - 7, 0, Math.PI * 2);
  ctx.stroke();

  // علامة صح كبيرة وواضحة في منتصف الختم
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = r * 0.15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const cs = r * 0.5;
  ctx.beginPath();
  ctx.moveTo(-cs * 0.62, 0);
  ctx.lineTo(-cs * 0.12, cs * 0.5);
  ctx.lineTo(cs * 0.68, -cs * 0.55);
  ctx.stroke();

  ctx.restore();

  // نص "تم التسليم" تحت الختم كشارة منفصلة (بدون دوران، واضح ومقروء)
  const labelY = cy + r + 22;
  ctx.font = `800 ${r * 0.28}px ${FONT}`;
  const labelText = "✓ تم التسليم";
  const labelW = ctx.measureText(labelText).width + r * 0.5;
  const labelH = r * 0.5;
  ctx.save();
  ctx.fillStyle = color;
  roundRect(ctx, cx - labelW / 2, labelY - labelH / 2, labelW, labelH, labelH / 2);
  ctx.fill();
  ctx.restore();
  ctx.font = `800 ${r * 0.24}px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "rtl";
  ctx.fillText("تم التسليم", cx, labelY + 1);
  ctx.textBaseline = "alphabetic";
}

// ── أيقونات مرسومة يدويًا (بدون SVG/صور خارجية) ───────────────────────────

function drawPhoneIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-20 * Math.PI) / 180);
  ctx.fillStyle = color;
  const r = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(-r * 0.15, -r);
  ctx.bezierCurveTo(-r * 0.7, -r, -r, -r * 0.55, -r * 0.62, -r * 0.05);
  ctx.bezierCurveTo(-r * 0.3, r * 0.35, r * 0.05, r * 0.7, r * 0.5, r * 0.95);
  ctx.bezierCurveTo(r * 0.75, r, r, r * 0.7, r * 0.92, r * 0.45);
  ctx.bezierCurveTo(r * 0.85, r * 0.25, r * 0.55, r * 0.1, r * 0.35, r * 0.2);
  ctx.bezierCurveTo(r * 0.15, r * 0.3, 0, r * 0.05, -r * 0.15, -r * 0.2);
  ctx.bezierCurveTo(-r * 0.3, -r * 0.42, -r * 0.55, -r * 0.55, -r * 0.4, -r * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPinIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  const r = size * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r * 0.62, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.arc(cx, cy - r * 0.15, r * 0.62, Math.PI * 0.85, Math.PI * 0.15, false);
  ctx.closePath();
  // شكل الدبوس: دائرة أعلى + مثلث سفلي
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.25, r * 0.5, 0, Math.PI * 2);
  ctx.moveTo(cx - r * 0.42, cy - r * 0.05);
  ctx.lineTo(cx, cy + r * 0.75);
  ctx.lineTo(cx + r * 0.42, cy - r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.25, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawHomeIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  const r = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.85, cy - r * 0.05);
  ctx.lineTo(cx, cy - r * 0.85);
  ctx.lineTo(cx + r * 0.85, cy - r * 0.05);
  ctx.lineTo(cx + r * 0.62, cy - r * 0.05);
  ctx.lineTo(cx + r * 0.62, cy + r * 0.7);
  ctx.lineTo(cx - r * 0.62, cy + r * 0.7);
  ctx.lineTo(cx - r * 0.62, cy - r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawUserIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  const r = size * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.38, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.95, r * 0.75, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

function drawCheckIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, lineWidth: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.5, cy + size * 0.02);
  ctx.lineTo(cx - size * 0.12, cy + size * 0.42);
  ctx.lineTo(cx + size * 0.55, cy - size * 0.38);
  ctx.stroke();
  ctx.restore();
}

/** يرسم شعار STARK: مربع أسود بزوايا مدورة فيه كلمة STARK بخط بولد مائل بسيط + نقطة حمراء صغيرة. */
function drawStarkLogo(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const padX = h * 0.32;
  ctx.font = `900 ${h * 0.44}px ${FONT}`;
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const w = ctx.measureText("STARK").width + padX * 2;

  ctx.save();
  ctx.fillStyle = "#12151c";
  roundRect(ctx, x, y, w, h, h * 0.22);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText("STARK", x + padX, y + h / 2 + 1);
  // نقطة حمراء صغيرة أعلى الحرف الأخير (لمسة تمييز)
  ctx.fillStyle = "#f04452";
  ctx.beginPath();
  ctx.arc(x + w - padX * 0.55, y + h * 0.24, h * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return w;
}

// ── أدوات إضافية للتصميم الجديد (إشعار حالة الشحنة) ─────────────────────

/** يرسم خلفية شحن خفيفة (طيارة + شاحنة + خطوط مخزن) بشفافية منخفضة، تُستخدم في الهيدر. */
function drawShippingBackdrop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#12151c";
  ctx.fillStyle = "#12151c";

  // خطوط مخزن/حاويات يمين تحت
  const baseY = y + h - 6;
  for (let i = 0; i < 5; i++) {
    const bx = x + w - 210 + i * 34;
    const bw = 26;
    const bh = 30 + (i % 2 === 0 ? 14 : 0);
    ctx.fillRect(bx, baseY - bh, bw, bh);
  }
  // خط أرضي
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w - 260, baseY);
  ctx.lineTo(x + w, baseY);
  ctx.stroke();

  // شاحنة مبسطة فوق الخط الأرضي
  ctx.globalAlpha = 0.2;
  const tx = x + w - 190;
  const ty = baseY - 34;
  ctx.fillRect(tx, ty, 70, 30); // جسم الشاحنة
  ctx.fillRect(tx + 70, ty + 10, 26, 20); // كابينة السائق
  ctx.beginPath();
  ctx.arc(tx + 16, ty + 32, 7, 0, Math.PI * 2);
  ctx.arc(tx + 54, ty + 32, 7, 0, Math.PI * 2);
  ctx.arc(tx + 84, ty + 32, 7, 0, Math.PI * 2);
  ctx.fill();

  // طيارة مبسطة أعلى يمين
  ctx.globalAlpha = 0.18;
  ctx.save();
  ctx.translate(x + w - 90, y + 32);
  ctx.rotate((-18 * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(-46, 0);
  ctx.lineTo(38, 0);
  ctx.lineTo(46, 4);
  ctx.lineTo(38, 8);
  ctx.lineTo(-46, 8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-22, -22);
  ctx.lineTo(-10, -22);
  ctx.lineTo(8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.lineTo(-22, 26);
  ctx.lineTo(-10, 26);
  ctx.lineTo(8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.restore();
}

/** يرسم أيقونة صندوق دائرية مع علامة (صح/تحذير/إكس) صغيرة في الزاوية، تُستخدم كأيقونة رئيسية أعلى الكارت. */
function drawBoxAvatarIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, badgeColor: string, badgeType: "check" | "warning" | "cross") {
  ctx.save();
  // دائرة خلفية رمادية فاتحة
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#eef0f4";
  ctx.fill();

  // جسم الصندوق (خطوط بسيطة بلون داكن)
  ctx.strokeStyle = "#12151c";
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const s = r * 0.62;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.55);
  ctx.lineTo(cx, cy - s * 0.95);
  ctx.lineTo(cx + s, cy - s * 0.55);
  ctx.lineTo(cx + s, cy + s * 0.55);
  ctx.lineTo(cx, cy + s * 0.95);
  ctx.lineTo(cx - s, cy + s * 0.55);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.55);
  ctx.lineTo(cx, cy - s * 0.15);
  ctx.lineTo(cx + s, cy - s * 0.55);
  ctx.moveTo(cx, cy - s * 0.15);
  ctx.lineTo(cx, cy + s * 0.95);
  ctx.stroke();

  // شارة صغيرة أسفل يمين الدائرة
  const badgeR = r * 0.36;
  const bx = cx + r * 0.72;
  const by = cy + r * 0.72;
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = badgeColor;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = badgeR * 0.28;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (badgeType === "check") {
    ctx.beginPath();
    ctx.moveTo(bx - badgeR * 0.45, by);
    ctx.lineTo(bx - badgeR * 0.1, by + badgeR * 0.35);
    ctx.lineTo(bx + badgeR * 0.5, by - badgeR * 0.4);
    ctx.stroke();
  } else if (badgeType === "cross") {
    ctx.beginPath();
    ctx.moveTo(bx - badgeR * 0.4, by - badgeR * 0.4);
    ctx.lineTo(bx + badgeR * 0.4, by + badgeR * 0.4);
    ctx.moveTo(bx + badgeR * 0.4, by - badgeR * 0.4);
    ctx.lineTo(bx - badgeR * 0.4, by + badgeR * 0.4);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(bx, by - badgeR * 0.4);
    ctx.lineTo(bx, by + badgeR * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by + badgeR * 0.35, badgeR * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.restore();
}

/** يرسم مثلث تحذير مملوء مع علامة تعجب بيضاء، أو دائرة صح، حسب نوع الحالة. */
function drawStatusGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, glyph: "warning" | "check") {
  ctx.save();
  if (glyph === "warning") {
    const r = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.92, cy + r * 0.75);
    ctx.lineTo(cx - r * 0.92, cy + r * 0.75);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = r * 0.16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.25);
    ctx.lineTo(cx, cy + r * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.52, r * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  } else {
    const r = size * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = r * 0.18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.35);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.32);
    ctx.stroke();
  }
  ctx.restore();
}

/** يرسم أيقونة ورقة/ملاحظة بسيطة (سطور نص) داخل مربع بحواف مدورة. */
function drawNoteIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  const r = size * 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.14;
  ctx.lineJoin = "round";
  roundRect(ctx, cx - r * 0.62, cy - r * 0.8, r * 1.24, r * 1.6, r * 0.18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.32, cy - r * 0.2);
  ctx.lineTo(cx + r * 0.32, cy - r * 0.2);
  ctx.moveTo(cx - r * 0.32, cy + r * 0.15);
  ctx.lineTo(cx + r * 0.32, cy + r * 0.15);
  ctx.moveTo(cx - r * 0.32, cy + r * 0.5);
  ctx.lineTo(cx + r * 0.05, cy + r * 0.5);
  ctx.stroke();
  ctx.restore();
}

/** يرسم أيقونة سماعة خدمة عملاء (هيدست) بسيطة. */
function drawHeadsetIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  const r = size * 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.05, r * 0.62, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  roundRect(ctx, cx - r * 0.72, cy + r * 0.05, r * 0.3, r * 0.5, r * 0.12);
  ctx.stroke();
  ctx.beginPath();
  roundRect(ctx, cx + r * 0.42, cy + r * 0.05, r * 0.3, r * 0.5, r * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.57, cy + r * 0.55);
  ctx.lineTo(cx + r * 0.57, cy + r * 0.72);
  ctx.arcTo(cx + r * 0.57, cy + r * 0.9, cx + r * 0.3, cy + r * 0.9, r * 0.15);
  ctx.lineTo(cx + r * 0.1, cy + r * 0.9);
  ctx.stroke();
  ctx.restore();
}

/** يرسم أيقونة كوكب/إنترنت بسيطة (دائرة بخطوط طول وعرض). */
function drawGlobeIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  const r = size * 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.35, r * 0.75, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.75, cy);
  ctx.lineTo(cx + r * 0.75, cy);
  ctx.stroke();
  ctx.restore();
}

/** يرسم أيقونة واتساب مبسطة (دائرة خضراء + شكل سماعة/فقاعة كلام). */
function drawWhatsappIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  const r = size * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#25d366";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = r * 0.14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.03, r * 0.5, Math.PI * 0.15, Math.PI * 1.6, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.28, cy + r * 0.42);
  ctx.lineTo(cx - r * 0.5, cy + r * 0.6);
  ctx.lineTo(cx - r * 0.35, cy + r * 0.28);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = "#25d366";
  ctx.lineWidth = r * 0.1;
  ctx.moveTo(cx - r * 0.2, cy - r * 0.12);
  ctx.bezierCurveTo(cx - r * 0.05, cy + r * 0.18, cx + r * 0.1, cy + r * 0.2, cx + r * 0.3, cy + r * 0.05);
  ctx.stroke();
  ctx.restore();
}

// ── الدالة الرئيسية ──────────────────────────────────────────────────────

/** يولد صورة إشعار حالة شحنة احترافية (هيدر بخلفية شحن + كارت أبيض بالتفاصيل + فوتر غامق). */
export async function generateShipmentShareImage(shipment: ShipmentShareData): Promise<string> {
  await ensureFontsReady();
  const logoImg = await loadLogoImage();

  const statusLabel = shipment.statusLabel || STATUS_LABELS[shipment.status] || shipment.status || "قيد التنفيذ";
  const theme = STATUS_THEME[shipment.status] || DEFAULT_THEME;
  const isDelivered = shipment.status === "received" || shipment.status === "delivered" || shipment.status === "replaced" || shipment.status === "parcel_picked";
  const isProblemLike = ["returned", "cancelled", "problem", "postponed", "delayed"].includes(shipment.status);
  const glyph: "warning" | "check" = isDelivered ? "check" : isProblemLike ? "warning" : "warning";
  const badgeType: "check" | "warning" | "cross" = isDelivered ? "check" : shipment.status === "cancelled" ? "cross" : "warning";

  const statusDescriptions: Record<string, string> = {
    // ─── القيم الحقيقية الحالية ─────────────────────────────────────────
    pending: "الشحنة قيد الانتظار حاليًا",
    warehouse_ready: "الشحنة جاهزة وقيد الشحن من المخزن",
    in_shipping: "الشحنة حاليًا في الطريق إلى المستلم",
    received: "تم تسليم الشحنة بنجاح لصاحبها",
    replaced: "تم تسليم البديل واستلام المنتج القديم بنجاح",
    parcel_picked: "تم استلام الطرد بنجاح",
    partial_received: "تم استلام جزء من الشحنة",
    delayed: "تم تأجيل تسليم الشحنة لموعد لاحق",
    returned: "تم إرجاع الشحنة إلى مستودعنا",
    // ─── fallback للقيم القديمة ─────────────────────────────────────────
    delivered: "تم تسليم الشحنة بنجاح لصاحبها",
    cancelled: "تم إلغاء الشحنة بناءً على الطلب",
    problem: "الشحنة تحتاج إلى متابعة إضافية",
    postponed: "تم تأجيل تسليم الشحنة لموعد لاحق",
    in_transit: "الشحنة حاليًا في الطريق إلى المستلم",
    out_for_delivery: "الشحنة خرجت للتسليم اليوم",
    picked_up: "تم استلام الشحنة من الراسل",
    confirmed: "تم تأكيد الشحنة وجارٍ تجهيزها",
    waiting: "الشحنة قيد المراجعة حاليًا",
  };
  const statusDesc = statusDescriptions[shipment.status] || "تم تحديث حالة شحنتك";

  const destination = [text(shipment.zoneLabel, ""), text(shipment.receiverCity, "")].filter(Boolean).join(" - ") || text(shipment.receiverCity, "غير محدد");
  const noteText = text(shipment.note, "");
  const hasNote = !!noteText;
  const noteTitle = shipment.status === "returned" ? "سبب الإرجاع" : shipment.status === "cancelled" ? "سبب الإلغاء" : "ملاحظة";
  const shipNumForRows = text(shipment.shipmentNumber);

  const W = 700;
  const SCALE = 2;
  const M = 40;
  const contentW = W - M * 2;

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d")!;

  const noteLines = hasNote ? countWrapLines(mctx, noteText, contentW - 2 * 24 - 60, 17, 700) : 0;
  const noteCardH = hasNote ? 30 + 40 + Math.max(1, noteLines) * 24 + 20 : 0;

  // ── بيانات العميل الكاملة (صفوف label:value) ───────────────────────────
  const rowLabelW = 118; // عرض ثابت لعمود التسمية (label) داخل صف البيانات
  const rowValueMaxW = contentW - 2 * 20 - rowLabelW - 12;
  const customerRows: { label: string; value: string; lines: number }[] = [
    { label: "اسم العميل", value: text(shipment.receiverName), lines: 1 },
    { label: "رقم الهاتف", value: [text(shipment.receiverPhone, ""), text(shipment.receiverPhone2, "")].filter(Boolean).join(" / ") || "—", lines: 1 },
    { label: "المحافظة", value: text(shipment.zoneLabel || shipment.receiverCity), lines: 1 },
    { label: "العنوان بالتفصيل", value: text(shipment.receiverAddress), lines: 1 },
    { label: "نوع الشحنة", value: text(shipment.parcelType), lines: 1 },
    { label: "رقم الشحنة", value: shipNumForRows, lines: 1 },
  ];
  customerRows.forEach((row) => {
    row.lines = Math.max(1, countWrapLines(mctx, row.value, rowValueMaxW, 16, 800));
  });
  const rowGap = 14;
  const rowLineH = 24;
  const customerRowsH = customerRows.reduce((sum, r) => sum + Math.max(1, r.lines) * rowLineH, 0) + rowGap * (customerRows.length - 1);
  const customerBoxPadY = 24;
  const customerBoxH = customerBoxPadY * 2 + customerRowsH;

  // ── شارات: قابلة للتجزئة + سياسة الرفض (شحن مجاني عند الرفض) ──────────
  const isDivisible = Number(shipment.isDivisible) === 1;
  const isFreeOnReject = shipment.rejectionPolicy === "free";
  const badges: { label: string; positive: boolean }[] = [
    { label: isDivisible ? "الشحنة قابلة للتجزئة" : "الشحنة غير قابلة للتجزئة", positive: isDivisible },
  ];
  if (isFreeOnReject) badges.push({ label: "شحن مجاني عند الرفض", positive: true });
  const badgesRowH = badges.length ? 52 : 0;

  // ── كارت قيمة الأوردر ────────────────────────────────────────────────
  const codAmount = Number(shipment.codAmount) || 0;
  const totalAmount = Number(shipment.totalAmount) || codAmount;
  const hasOrderValue = totalAmount > 0;
  const orderBoxH = hasOrderValue ? 84 : 0;

  // ── حساب الارتفاع الكلي ──────────────────────────────────────────────
  const headerH = 190;
  const cardPad = 32;
  let y = headerH;

  y += 24; // مسافة قبل الكارت الأبيض
  const cardTop = y;
  let innerY = cardPad;

  innerY += 96; // أيقونة الصندوق + "عزيزي العميل" + سطر الإبلاغ
  innerY += 30; // سطر "يرجى الاطلاع..."
  innerY -= 12; // تقليل الفراغ الزائد قبل صندوق المعلومات

  innerY += customerBoxH + 20;
  if (badges.length) innerY += badgesRowH + 20;
  if (hasOrderValue) innerY += orderBoxH + 20;

  const statusBoxH = 108;
  innerY += statusBoxH + 20;

  if (hasNote) innerY += noteCardH + 20;

  innerY += 20; // مسافة قبل نص الشكر
  const thanksLines = 3;
  innerY += thanksLines * 30 - 20; // نفس القفزة المستخدمة فعليًا وقت الرسم (cy += 30*thanksLines - 20)
  innerY += 62; // "مع أطيب التحيات" + "فريق STARK" + الخط تحته (نفس offsets الرسم: cy+24 → cy+50 → cy+62)

  const contactRowH = 78;
  innerY += contactRowH;
  innerY += cardPad;

  const cardH = innerY;
  y = cardTop + cardH;
  y += 28; // مسافة فاصلة واضحة بين الكارت الأبيض والفوتر الغامق (تمنع الالتصاق البصري)

  const footerH = 76;
  const H = y + footerH;

  // ── إنشاء الكانفاس ────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = Math.ceil(H) * SCALE;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("Canvas not supported");
  const ctx: CanvasRenderingContext2D = ctx2d;
  ctx.scale(SCALE, SCALE);

  // خلفية عامة فاتحة جدًا (رمادي-أبيض)
  ctx.fillStyle = "#f4f5f7";
  ctx.fillRect(0, 0, W, H);

  // ══ الهيدر ═══════════════════════════════════════════════════════════
  const headerGrad = ctx.createLinearGradient(0, 0, W, 0);
  headerGrad.addColorStop(0, "#f3f4f6");
  headerGrad.addColorStop(1, "#e2e4e9");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, W, headerH);
  drawShippingBackdrop(ctx, 0, 0, W, headerH);

  // شعار STARK + سلوجان — اللوجو كبير وواضح داخل دايرة بيضاء
  const logoY = 22;
  const logoDiameter = 92;
  let logoW = 0;
  if (logoImg) {
    logoW = drawStarkLogoImage(ctx, logoImg, M, logoY, logoDiameter);
  } else {
    logoW = drawStarkLogo(ctx, M, logoY, 48);
  }
  const dividerX = M + logoW + 24;
  const dividerCy = logoY + logoW / 2; // منتصف الدايرة رأسيًا، لضبط الخط الفاصل والسلوجان بجانبها
  ctx.strokeStyle = "rgba(18,21,28,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(dividerX, dividerCy - 32);
  ctx.lineTo(dividerX, dividerCy + 32);
  ctx.stroke();

  drawText(ctx, "شحنك بأمان ..", dividerX + 24, dividerCy - 6, { size: 18, weight: 700, color: "#12151c", align: "left", dir: "rtl" });
  drawText(ctx, "لأن راحتك تهمنا", dividerX + 24, dividerCy + 20, { size: 18, weight: 700, color: "#12151c", align: "left", dir: "rtl" });

  // ══ الكارت الأبيض ═══════════════════════════════════════════════════
  ctx.save();
  ctx.shadowColor = "rgba(18,21,28,0.10)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, M - 8, cardTop, contentW + 16, cardH, 22);
  ctx.fill();
  ctx.restore();

  let cy = cardTop + cardPad;

  // أيقونة الصندوق + "عزيزي العميل"
  const avatarR = 42;
  const avatarCx = W - M + 8 - avatarR - 4;
  drawBoxAvatarIcon(ctx, avatarCx, cy + avatarR - 6, avatarR, isDelivered ? "#15803d" : "#e04452", badgeType);

  const textRightX = avatarCx - avatarR - 20;
  drawText(ctx, "عزيزي العميل", textRightX, cy + 22, { size: 26, weight: 900, color: "#12151c", align: "right" });

  const shipNum = text(shipment.shipmentNumber);
  const msgY = cy + 56;
  const msgLabel = `نود إبلاغك بخصوص شحنتك رقم`;
  // القياس لازم يستخدم نفس الـ weight بتاع الرسم بالظبط، وإلا العرض المقاس
  // هيختلف عن العرض الفعلي ويحصل تراكب بين النص والرقم البرتقالي
  ctx.font = "700 17px " + FONT;
  const msgW = ctx.measureText(msgLabel).width;
  drawText(ctx, msgLabel, textRightX, msgY, { size: 17, weight: 700, color: "#171a22", align: "right" });
  drawText(ctx, shipNum, textRightX - msgW - 10, msgY, { size: 17, weight: 900, color: "#f16636", align: "right", dir: "ltr" });

  drawText(ctx, "يرجى الاطلاع على التفاصيل أدناه:", textRightX, msgY + 32, { size: 15, weight: 500, color: "#8b8fa3", align: "right" });

  cy += 96 + 30 - 12;

  // ── كارت بيانات العميل الكاملة (صفوف label:value رأسية) ────────────
  ctx.save();
  ctx.fillStyle = "#f7f8fa";
  roundRect(ctx, M, cy, contentW, customerBoxH, 16);
  ctx.fill();
  ctx.restore();

  {
    const rowRightX = W - M - 20; // بداية عمود القيمة (يمين)
    const rowValueRightEdge = rowRightX - rowLabelW - 12; // أقصى يمين لنص القيمة (بعد عمود التسمية)
    let ry = cy + customerBoxPadY;
    customerRows.forEach((row, i) => {
      const rh = Math.max(1, row.lines) * rowLineH;
      // التسمية (label) على أقصى اليمين بلون خافت
      drawText(ctx, row.label, rowRightX, ry + 17, { size: 14, weight: 700, color: "#8b8fa3", align: "right" });
      // القيمة تترسم يمينها عند حافة عمود القيمة (تحت التسمية شمالاً في RTL)
      if (row.lines > 1) {
        drawWrappedText(ctx, row.value, rowValueRightEdge, ry + 17, rowValueMaxW, rowLineH, { size: 16, weight: 800, color: "#171a22", align: "right" });
      } else {
        drawText(ctx, row.value, rowValueRightEdge, ry + 17, { size: 16, weight: 800, color: "#171a22", align: "right" });
      }
      ry += rh;
      if (i < customerRows.length - 1) {
        ctx.strokeStyle = "#e9eaef";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(M + 20, ry + rowGap / 2);
        ctx.lineTo(W - M - 20, ry + rowGap / 2);
        ctx.stroke();
        ry += rowGap;
      }
    });
  }
  cy += customerBoxH + 20;

  // ── صف شارات: قابلة للتجزئة + شحن مجاني عند الرفض ───────────────────
  if (badges.length) {
    let bx = W - M; // نبدأ من أقصى اليمين (RTL) ونتحرك شمالاً
    badges.forEach((b) => {
      ctx.font = "800 14px " + FONT;
      const bw = ctx.measureText(b.label).width + 44;
      const bColor = b.positive ? "#0fb88a" : "#8b8fa3";
      const bBg = b.positive ? "#e6f9f2" : "#eef0f3";
      bx -= bw;
      ctx.save();
      ctx.fillStyle = bBg;
      roundRect(ctx, bx, cy, bw, badgesRowH - 8, 12);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(bColor, 0.35);
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx, cy, bw, badgesRowH - 8, 12);
      ctx.stroke();
      ctx.restore();
      // نقطة صغيرة ملونة + نص الشارة
      ctx.save();
      ctx.fillStyle = bColor;
      ctx.beginPath();
      ctx.arc(bx + bw - 20, cy + (badgesRowH - 8) / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawText(ctx, b.label, bx + bw - 32, cy + (badgesRowH - 8) / 2 + 5, { size: 14, weight: 800, color: bColor, align: "right" });
      bx -= 10; // مسافة بين الشارات
    });
    cy += badgesRowH + 20;
  }

  // ── كارت قيمة الأوردر ────────────────────────────────────────────────
  if (hasOrderValue) {
    ctx.save();
    const orderGrad = ctx.createLinearGradient(M, cy, W - M, cy);
    orderGrad.addColorStop(0, "#fff7ed");
    orderGrad.addColorStop(1, "#fef3e8");
    ctx.fillStyle = orderGrad;
    roundRect(ctx, M, cy, contentW, orderBoxH, 16);
    ctx.fill();
    ctx.strokeStyle = hexToRgba("#f16636", 0.3);
    ctx.lineWidth = 1.5;
    roundRect(ctx, M, cy, contentW, orderBoxH, 16);
    ctx.stroke();
    ctx.restore();

    drawText(ctx, "إجمالي قيمة الأوردر", W - M - 24, cy + 32, { size: 15, weight: 700, color: "#9a5b2e", align: "right" });
    drawText(ctx, "شامل قيمة المنتج ورسوم الشحن", W - M - 24, cy + 56, { size: 12, weight: 600, color: "#b08355", align: "right" });
    drawText(ctx, `${money(totalAmount)} ج.م`, M + 24, cy + orderBoxH / 2 + 8, { size: 24, weight: 900, color: "#f16636", align: "left", dir: "ltr" });
    cy += orderBoxH + 20;
  }

  // ── كارت حالة الشحنة ─────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = lightenHex(theme.base, 0.88);
  roundRect(ctx, M, cy, contentW, statusBoxH, 16);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(theme.base, 0.35);
  ctx.lineWidth = 1.5;
  roundRect(ctx, M, cy, contentW, statusBoxH, 16);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = hexToRgba(theme.base, 0.3);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W - M - 118, cy + 18);
  ctx.lineTo(W - M - 118, cy + statusBoxH - 18);
  ctx.stroke();

  drawStatusGlyph(ctx, W - M - 60, cy + statusBoxH / 2, 40, theme.base, glyph);
  drawText(ctx, "حالة الشحنة", W - M - 140, cy + 32, { size: 15, weight: 700, color: theme.base, align: "right" });
  drawText(ctx, statusLabel, W - M - 140, cy + 64, { size: 24, weight: 900, color: "#12151c", align: "right" });
  drawText(ctx, statusDesc, W - M - 140, cy + 90, { size: 14, weight: 600, color: "#5b5f6d", align: "right" });
  cy += statusBoxH + 20;

  // ── كارت الملاحظة / سبب الإرجاع (مميز بصريًا عشان يلفت انتباه العميل) ──
  if (hasNote) {
    ctx.save();
    const noteGrad = ctx.createLinearGradient(M, cy, W - M, cy);
    noteGrad.addColorStop(0, "#fff8e6");
    noteGrad.addColorStop(1, "#fff1d6");
    ctx.fillStyle = noteGrad;
    roundRect(ctx, M, cy, contentW, noteCardH, 16);
    ctx.fill();
    ctx.strokeStyle = "#f0a63a";
    ctx.lineWidth = 2;
    roundRect(ctx, M, cy, contentW, noteCardH, 16);
    ctx.stroke();
    ctx.restore();

    // شريط لوني عريض جنب الكارت (يمين، RTL) عشان يلفت العين فورًا
    ctx.save();
    ctx.fillStyle = "#e58a1a";
    roundRect(ctx, W - M - 6, cy, 6, noteCardH, 3);
    ctx.fill();
    ctx.restore();

    // شارة أيقونة دائرية بارزة بدل الأيقونة الرفيعة العادية
    const noteIconCx = W - M - 24 - 16;
    const noteIconCy = cy + 30;
    ctx.save();
    ctx.fillStyle = "#f0a63a";
    ctx.beginPath();
    ctx.arc(noteIconCx, noteIconCy, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawNoteIcon(ctx, noteIconCx, noteIconCy, 22, "#ffffff");
    drawText(ctx, noteTitle, noteIconCx - 34, cy + 36, { size: 17, weight: 900, color: "#9a5b0e", align: "right" });
    drawWrappedText(ctx, noteText, W - M - 24, cy + 70, contentW - 48, 24, { size: 17, weight: 800, color: "#171a22" });
    cy += noteCardH + 20;
  }

  // ── نص شكر/رسالة ختامية ──────────────────────────────────────────────
  cy += 20;
  const thanksText1 = isProblemLike
    ? "نعتذر عن أي إزعاج قد يسببه هذا الأمر،"
    : "شكرًا لثقتك بنا،";
  const thanksText2 = isProblemLike
    ? "وفي حال رغبتك في إعادة إرسال الشحنة أو استفسار إضافي،"
    : "نتمنى أن تكون تجربتك معنا مُرضية دائمًا،";
  const thanksText3 = isProblemLike
    ? "يرجى التواصل معنا عبر القنوات التالية."
    : "ولا تتردد في التواصل معنا لأي استفسار.";

  drawText(ctx, thanksText1, W / 2, cy, { size: 16, weight: 600, color: "#5b5f6d", align: "center" });
  drawText(ctx, thanksText2, W / 2, cy + 28, { size: 16, weight: 600, color: "#5b5f6d", align: "center" });
  drawText(ctx, thanksText3, W / 2, cy + 56, { size: 16, weight: 600, color: "#5b5f6d", align: "center" });
  cy += 30 * thanksLines - 20;

  drawText(ctx, "مع أطيب التحيات،", W / 2, cy + 24, { size: 15, weight: 600, color: "#9aa0b1", align: "center" });

  // قياس عرض "فريق" و"STARK" فعليًا عشان نموضعهم جنب بعض بمسافة ثابتة بدل
  // إحداثيات مقفولة كانت بتخليهم يتلزقوا في بعض حسب عرض الخط الفعلي
  ctx.font = "700 15px " + FONT;
  const teamLabelW = ctx.measureText("فريق").width;
  ctx.font = "900 17px " + FONT;
  const teamW = ctx.measureText("STARK").width;
  const teamGap = 8;
  const teamTotalW = teamLabelW + teamGap + teamW;
  const teamStartX = W / 2 + teamTotalW / 2; // أقصى يمين المجموعة (بداية "فريق" في RTL)
  const starkCenterX = W / 2 - teamTotalW / 2 + teamW / 2; // مركز "STARK" على أقصى يسار المجموعة

  drawText(ctx, "فريق", teamStartX - teamLabelW / 2, cy + 50, { size: 15, weight: 700, color: "#12151c", align: "center" });
  drawText(ctx, "STARK", starkCenterX, cy + 50, { size: 17, weight: 900, color: "#12151c", align: "center", dir: "ltr" });
  ctx.strokeStyle = hexToRgba(theme.base, 0.4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - teamTotalW / 2 - 10, cy + 62);
  ctx.lineTo(W / 2 + teamTotalW / 2 + 10, cy + 62);
  ctx.stroke();

  // ── صف الاتصال ────────────────────────────────────────────────────────
  cy = cardTop + cardH - cardPad - contactRowH;
  ctx.strokeStyle = "#e4e6ec";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(M, cy - 4);
  ctx.lineTo(W - M, cy - 4);
  ctx.stroke();

  const contactCols = [
    { icon: "headset" as const, label: "خدمة العملاء", value: "0101 568 4864", sub: "متاح يوميًا من 9 ص - 10 م" },
    { icon: "globe" as const, label: "الموقع الإلكتروني", value: "www.starkvector.com", sub: "" },
    { icon: "whatsapp" as const, label: "واتساب", value: "0101 568 4864", sub: "" },
  ];
  const ccW = contentW / contactCols.length;
  contactCols.forEach((col, i) => {
    const colCx = W - M - ccW * i - ccW / 2;
    const iconCy = cy + 24;
    if (col.icon === "headset") drawHeadsetIcon(ctx, colCx, iconCy, 26, "#12151c");
    else if (col.icon === "globe") drawGlobeIcon(ctx, colCx, iconCy, 26, "#12151c");
    else drawWhatsappIcon(ctx, colCx, iconCy, 26);

    drawText(ctx, col.label, colCx, cy + 48, { size: 13, weight: 600, color: "#8b8fa3", align: "center" });
    drawText(ctx, col.value, colCx, cy + 66, { size: 15, weight: 800, color: "#12151c", align: "center", dir: "ltr" });
  });

  // ══ الفوتر الغامق ═══════════════════════════════════════════════════
  const footerY = H - footerH;
  ctx.fillStyle = "#12151c";
  ctx.fillRect(0, footerY, W, footerH);

  const footerLogoH = 44;
  let footerLogoW = 0;
  ctx.save();
  if (logoImg) {
    const ratio = logoImg.naturalWidth / logoImg.naturalHeight;
    footerLogoW = footerLogoH * ratio;
    ctx.drawImage(logoImg, M, footerY + (footerH - footerLogoH) / 2, footerLogoW, footerLogoH);
  } else {
    footerLogoW = drawStarkLogo(ctx, M, footerY + (footerH - 40) / 2, 40);
  }
  ctx.restore();
  drawText(ctx, "STARK", M + footerLogoW + 16, footerY + footerH / 2 - 2, { size: 19, weight: 900, color: "#ffffff", align: "left", dir: "ltr" });
  drawText(ctx, "LOGISTICS & SHIPPING SERVICES", M + footerLogoW + 16, footerY + footerH / 2 + 16, { size: 10, weight: 700, color: "#9aa0b1", align: "left", dir: "ltr" });

  ctx.font = "700 13px " + FONT;
  ctx.direction = "ltr";
  ctx.textAlign = "right";
  ctx.fillStyle = "#e4e6ec";
  ctx.fillText("FAST  •  SAFE  •  RELIABLE", W - M, footerY + footerH / 2 + 5);

  return canvas.toDataURL("image/png", 1);
}

// ══════════════════════════════════════════════════════════════════════════
// صورة "فاتورة بيع" — نفس تصميم فاتورة الطباعة (handlePrint) بالظبط:
// هيدر (عنوان + رقم فاتورة/تاريخ/عدد منتجات يمين، لوجو الشركة شمال) +
// صندوق بيانات العميل (اسم/محافظة يمين، هاتف/عنوان شمال) + جدول منتجات
// كامل (# / المنتج / اللون-المقاس / الكمية / سعر الوحدة / الإجمالي) +
// صندوق إجمالي (إجمالي المنتجات + تكلفة الشحن + الإجمالي الكلي) + فوتر.
// تُستخدم عند اختيار "مشاركة فاتورة" (بدل صورة الإيصال العادية).
// ══════════════════════════════════════════════════════════════════════════
export async function generateInvoiceShareImage(shipment: ShipmentShareData): Promise<string> {
  await ensureFontsReady();
  const logoImg = await loadLogoImage();

  const W = 700;
  const SCALE = 2;
  const M = 40;
  const contentW = W - M * 2;

  const invNum = text(shipment.invoiceNumber || shipment.shipmentNumber, `#${shipment.id}`);
  const dateLabel = text(shipment.createdAt, "—");
  const customerName = text(shipment.receiverName);
  const customerCity = text(shipment.receiverCity, "—");
  const customerPhone = text(shipment.receiverPhone, "—");
  const customerAddress = text(shipment.receiverAddress, "—");

  // بنود الفاتورة — نفس منطق الطباعة: منتجات الشحنة الفعلية (shipmentItems)، أو صف واحد افتراضي لو مفيش
  const rawItems = shipment.invoiceItems && shipment.invoiceItems.length > 0
    ? shipment.invoiceItems
    : [{ product: null, color: null, size: null, quantity: 1, unitPrice: 0, totalPrice: 0 }];
  const items = rawItems.map((it) => {
    const qty = Number(it.quantity) || 1;
    const unitPrice = Number(it.unitPrice) || 0;
    const totalPrice = it.totalPrice != null ? Number(it.totalPrice) : unitPrice * qty;
    return {
      product: text(it.product, "—"),
      variant: [text(it.color, ""), text(it.size, "")].filter(Boolean).join(" / "),
      qty, unitPrice, totalPrice,
    };
  });
  const totalQty = items.reduce((s, it) => s + it.qty, 0);
  const invoiceTotal = items.reduce((s, it) => s + it.totalPrice, 0);
  const shippingCostTotal = Number(shipment.shippingCostTotal) || 0;
  const grandTotal = invoiceTotal + shippingCostTotal;

  // ── حساب الارتفاع الكلي ──────────────────────────────────────────────
  const headerH = 130;
  const pagePad = 36;
  let cy = pagePad;

  // صندوق بيانات العميل
  const clientBoxH = 84;
  cy += clientBoxH + 22;

  // جدول المنتجات (هيدر + صف لكل منتج)
  const tableHeadH = 42;
  const tableRowH = 50;
  cy += tableHeadH + tableRowH * items.length + 22;

  // صندوق الإجمالي (إجمالي المنتجات + تكلفة الشحن + الإجمالي الكلي)
  const totalsRowH = 42;
  const totalsBoxH = totalsRowH * 3;
  cy += totalsBoxH + 26;

  const footerH = 46;
  const contentBottom = cy;
  const H = headerH + contentBottom + footerH;

  // ── إنشاء الكانفاس ────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = Math.ceil(H) * SCALE;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("Canvas not supported");
  const ctx: CanvasRenderingContext2D = ctx2d;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ══ الهيدر: عنوان الفاتورة + بياناتها (يمين) — لوجو الشركة (شمال) ═══════
  const logoDiameter = 88;
  const logoY = (headerH - logoDiameter) / 2 + 10;
  if (logoImg) {
    drawStarkLogoImage(ctx, logoImg, M, logoY, logoDiameter);
  } else {
    drawStarkLogo(ctx, M, logoY + logoDiameter / 2 - 24, 48);
  }
  drawText(ctx, "فاتورة بيع", W - M, 46, { size: 26, weight: 900, color: "#111111", align: "right" });
  drawText(ctx, `رقم الفاتورة: ${invNum}`, W - M, 74, { size: 14, weight: 700, color: "#555555", align: "right" });
  drawText(ctx, `التاريخ: ${dateLabel}`, W - M, 94, { size: 14, weight: 700, color: "#555555", align: "right" });
  drawText(ctx, `${items.length} منتج / ${totalQty} قطعة`, W - M, 114, { size: 14, weight: 700, color: "#555555", align: "right" });

  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, headerH);
  ctx.lineTo(W - M, headerH);
  ctx.stroke();

  cy = headerH + pagePad;

  // ── صندوق بيانات العميل ──────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;
  roundRect(ctx, M, cy, contentW, clientBoxH, 6);
  ctx.stroke();
  ctx.restore();
  const clientColW = contentW / 2 - 32;
  drawTruncatedText(ctx, `العميل: ${customerName}`, W - M - 20, cy + 30, clientColW, { size: 15, weight: 700, color: "#222222", align: "right" });
  drawTruncatedText(ctx, `المحافظة: ${customerCity}`, W - M - 20, cy + 58, clientColW, { size: 15, weight: 700, color: "#222222", align: "right" });
  drawTruncatedText(ctx, `الهاتف: ${customerPhone}`, M + 20, cy + 30, clientColW, { size: 15, weight: 700, color: "#222222", align: "left" });
  drawTruncatedText(ctx, `العنوان: ${customerAddress}`, M + 20, cy + 58, clientColW, { size: 15, weight: 700, color: "#222222", align: "left" });
  cy += clientBoxH + 22;

  // ── جدول المنتجات ─────────────────────────────────────────────────────
  const colRightEdge = W - M - 12; // #
  const colProductEdge = W - M - 48; // المنتج
  const colVariantCx = W - M - contentW * 0.44; // اللون/المقاس
  const colQtyCx = W - M - contentW * 0.62; // الكمية
  const colUnitCx = W - M - contentW * 0.79; // سعر الوحدة
  const colTotalEdge = M + 12; // الإجمالي

  ctx.save();
  ctx.fillStyle = "#333333";
  ctx.fillRect(M, cy, contentW, tableHeadH);
  ctx.restore();
  drawText(ctx, "#", colRightEdge, cy + tableHeadH / 2 + 5, { size: 13, weight: 800, color: "#ffffff", align: "right" });
  drawText(ctx, "المنتج", colProductEdge, cy + tableHeadH / 2 + 5, { size: 13, weight: 800, color: "#ffffff", align: "right" });
  drawText(ctx, "اللون/المقاس", colVariantCx, cy + tableHeadH / 2 + 5, { size: 12, weight: 800, color: "#ffffff", align: "center" });
  drawText(ctx, "الكمية", colQtyCx, cy + tableHeadH / 2 + 5, { size: 13, weight: 800, color: "#ffffff", align: "center" });
  drawText(ctx, "سعر الوحدة", colUnitCx, cy + tableHeadH / 2 + 5, { size: 12, weight: 800, color: "#ffffff", align: "center" });
  drawText(ctx, "الإجمالي", colTotalEdge, cy + tableHeadH / 2 + 5, { size: 13, weight: 800, color: "#ffffff", align: "left", dir: "ltr" });
  cy += tableHeadH;

  items.forEach((it, idx) => {
    ctx.save();
    ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#fafafb";
    ctx.fillRect(M, cy, contentW, tableRowH);
    ctx.strokeStyle = "#e4e4e4";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, cy + tableRowH);
    ctx.lineTo(W - M, cy + tableRowH);
    ctx.stroke();
    ctx.restore();
    drawText(ctx, String(idx + 1), colRightEdge, cy + tableRowH / 2 + 5, { size: 14, weight: 800, color: "#222222", align: "right" });
    drawText(ctx, it.product, colProductEdge, cy + tableRowH / 2 + (it.variant ? -3 : 5), { size: 14, weight: 800, color: "#171a22", align: "right" });
    if (it.variant) drawText(ctx, it.variant, colProductEdge, cy + tableRowH / 2 + 16, { size: 11, weight: 600, color: "#8b8fa3", align: "right" });
    drawText(ctx, String(it.qty), colQtyCx, cy + tableRowH / 2 + 5, { size: 14, weight: 800, color: "#171a22", align: "center" });
    drawText(ctx, money(it.unitPrice), colUnitCx, cy + tableRowH / 2 + 5, { size: 13, weight: 700, color: "#5b5f6d", align: "center" });
    drawText(ctx, money(it.totalPrice), colTotalEdge, cy + tableRowH / 2 + 5, { size: 14, weight: 900, color: "#171a22", align: "left", dir: "ltr" });
    cy += tableRowH;
  });
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, cy);
  ctx.lineTo(W - M, cy);
  ctx.stroke();
  cy += 22;

  // ── صندوق الإجمالي ────────────────────────────────────────────────────
  const summaryW = 320;
  const summaryX = M;
  ctx.save();
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;
  roundRect(ctx, summaryX, cy, summaryW, totalsBoxH, 6);
  ctx.stroke();
  ctx.restore();
  const totalsRows = [
    { label: "إجمالي المنتجات", value: `${money(invoiceTotal)} ج.م` },
    { label: "تكلفة الشحن", value: `${money(shippingCostTotal)} ج.م` },
  ];
  let ty = cy;
  totalsRows.forEach((row) => {
    drawText(ctx, row.label, summaryX + summaryW - 16, ty + totalsRowH / 2 + 5, { size: 14, weight: 600, color: "#444444", align: "right" });
    drawText(ctx, row.value, summaryX + 16, ty + totalsRowH / 2 + 5, { size: 15, weight: 800, color: "#111111", align: "left", dir: "ltr" });
    ty += totalsRowH;
    ctx.strokeStyle = "#e4e4e4";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(summaryX, ty);
    ctx.lineTo(summaryX + summaryW, ty);
    ctx.stroke();
  });
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(summaryX, ty);
  ctx.lineTo(summaryX + summaryW, ty);
  ctx.stroke();
  drawText(ctx, "الإجمالي الكلي", summaryX + summaryW - 16, ty + totalsRowH / 2 + 6, { size: 16, weight: 900, color: "#111111", align: "right" });
  drawText(ctx, `${money(grandTotal)} ج.م`, summaryX + 16, ty + totalsRowH / 2 + 6, { size: 18, weight: 900, color: "#111111", align: "left", dir: "ltr" });

  // ══ الفوتر ═══════════════════════════════════════════════════════════
  drawText(ctx, "STARK — شكراً لتعاملكم معنا", W / 2, H - footerH / 2 + 5, { size: 14, weight: 700, color: "#666666", align: "center" });
  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, H - footerH);
  ctx.lineTo(W - M, H - footerH);
  ctx.stroke();

  return canvas.toDataURL("image/png", 1);
}

export async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  // ملاحظة: كنا بنستخدم fetch(dataUrl) لتحويل الـ data URL لـ Blob، لكن الـ CSP
  // بتاع السيرفر (connect-src) مش بيسمح بجلب data: URLs عبر fetch — بيطلع
  // NetworkError. الحل: تحويل base64 → Blob يدويًا من غير أي طلب شبكة.
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = /data:(.*?);base64/.exec(meta);
  const mime = mimeMatch?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  return new File([blob], fileName, { type: mime });
}
