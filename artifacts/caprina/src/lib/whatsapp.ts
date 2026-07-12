export interface WaTemplate {
  id: string;
  name: string;
  body: string;
  isDefault: boolean;
}

export interface WaSettings {
  businessPhone: string;
  templates: WaTemplate[];
}

export interface WhatsAppOrderData {
  id: number;
  customerName: string;
  product: string;
  quantity: number;
  totalPrice: number;
  status: string;
  phone?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
}

export interface WhatsAppShipmentData {
  id: number;
  shipmentNumber?: string | null;
  receiverName: string;
  receiverPhone?: string | null;
  senderName?: string | null;
  trackingNumber?: string | null;
  status: string;
  shippingFee?: number | string | null;
  codAmount?: number | string | null;
  zoneLabel?: string | null;
}

export function applyShipmentTemplate(templateBody: string, s: WhatsAppShipmentData): string {
  const formatCurr = (n: number | string | null | undefined) =>
    new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);
  const orderNumFallback = s.shipmentNumber ?? s.id.toString().padStart(4, "0");
  return templateBody
    .replace(/\{receiverName\}/g,    s.receiverName)
    .replace(/\{customerName\}/g,    s.receiverName)
    .replace(/\{shipmentNumber\}/g,  orderNumFallback)
    .replace(/\{orderNumber\}/g,     orderNumFallback)
    .replace(/\{trackingNumber\}/g,  s.trackingNumber ?? "—")
    .replace(/\{status\}/g,          s.status)
    .replace(/\{shippingFee\}/g,     formatCurr(s.shippingFee))
    .replace(/\{codAmount\}/g,       formatCurr(s.codAmount))
    .replace(/\{amount\}/g,          formatCurr(s.codAmount ?? s.shippingFee))
    .replace(/\{zone\}/g,            s.zoneLabel ?? "—")
    .replace(/\{senderName\}/g,      s.senderName ?? "—")
    .replace(/\{receiverPhone\}/g,   s.receiverPhone ?? "—")
    .replace(/\{product\}/g,         "شحنة")
    .replace(/\{quantity\}/g,        "1")
    .replace(/\{shippingCompany\}/g, "—")
    .replace(/\{daysPending\}/g,     "0");
}

export const SHIPMENT_TEMPLATE_VARIABLES = [
  { var: "{receiverName}",   label: "اسم المستلم" },
  { var: "{shipmentNumber}", label: "رقم البوليصة" },
  { var: "{trackingNumber}", label: "رقم التتبع" },
  { var: "{status}",         label: "حالة الشحنة" },
  { var: "{shippingFee}",    label: "رسوم الشحن" },
  { var: "{codAmount}",      label: "مبلغ COD" },
  { var: "{zone}",           label: "المنطقة" },
  { var: "{senderName}",     label: "اسم الراسل (الاستور)" },
  { var: "{receiverPhone}",  label: "هاتف المستلم" },
];

// ─── قالب "مشكلة العميل" — يُرسل للراسل تفاصيل شحنة المستلم ───────────────
export function applySenderIssueTemplate(templateBody: string, s: WhatsAppShipmentData): string {
  const formatCurr = (n: number | string | null | undefined) =>
    new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(n) || 0);
  return templateBody
    .replace(/\{senderName\}/g,      s.senderName ?? "—")
    .replace(/\{receiverName\}/g,    s.receiverName)
    .replace(/\{receiverPhone\}/g,   s.receiverPhone ?? "—")
    .replace(/\{shipmentNumber\}/g,  s.shipmentNumber ?? String(s.id))
    .replace(/\{trackingNumber\}/g,  s.trackingNumber ?? "—")
    .replace(/\{status\}/g,          s.status)
    .replace(/\{shippingFee\}/g,     formatCurr(s.shippingFee))
    .replace(/\{codAmount\}/g,       formatCurr(s.codAmount))
    .replace(/\{zone\}/g,            s.zoneLabel ?? "—");
}

export const SENDER_ISSUE_TEMPLATE_VARIABLES = [
  { var: "{senderName}",     label: "اسم الراسل" },
  { var: "{receiverName}",   label: "اسم المستلم" },
  { var: "{receiverPhone}",  label: "هاتف المستلم" },
  { var: "{shipmentNumber}", label: "رقم البوليصة" },
  { var: "{trackingNumber}", label: "رقم التتبع" },
  { var: "{status}",         label: "حالة الشحنة" },
  { var: "{shippingFee}",    label: "رسوم الشحن" },
  { var: "{codAmount}",      label: "مبلغ COD" },
  { var: "{zone}",           label: "المنطقة" },
];


export interface WhatsAppShippingData {
  id: number;
  customerName: string;
  product: string;
  trackingNumber?: string | null;
  shippingCompany?: string | null;
  daysPending: number;
  phone?: string | null;
}

export function formatEgyptianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("002")) return `+${digits.slice(2)}`;
  if (digits.startsWith("20"))  return `+${digits}`;
  if (digits.startsWith("0"))   return `+20${digits.slice(1)}`;
  if (digits.length === 10)     return `+20${digits}`;
  return `+20${digits}`;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

export function applyTemplate(templateBody: string, order: WhatsAppOrderData): string {
  return templateBody
    .replace(/\{customerName\}/g, order.customerName)
    .replace(/\{orderNumber\}/g, order.id.toString().padStart(4, "0"))
    .replace(/\{product\}/g, order.product)
    .replace(/\{quantity\}/g, String(order.quantity))
    .replace(/\{amount\}/g, formatCurrency(order.totalPrice))
    .replace(/\{status\}/g, order.status)
    .replace(/\{phone\}/g, order.phone ?? "—")
    // الأوردر العادي مفيهوش "استور/راسل" منفصل في الداتابيز (بعكس الشحنات) —
    // فبنستخدم اسم الشركة الثابت هنا بدل ما تفضل الفقرة فاضية أو "—"
    .replace(/\{senderName\}/g, order.senderName ?? "STARK")
    .replace(/\{senderPhone\}/g, order.senderPhone ?? order.phone ?? "—");
}

export function buildWhatsAppLink(phone: string, message: string): string {
  const intlPhone = formatEgyptianPhone(phone).replace("+", "");
  return `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`;
}

export function openWhatsAppWithTemplate(order: WhatsAppOrderData, template: WaTemplate): boolean {
  if (!order.phone) return false;
  const message = applyTemplate(template.body, order);
  const link = buildWhatsAppLink(order.phone, message);
  window.open(link, "_blank", "noopener,noreferrer");
  return true;
}

// Legacy: open with default built-in message (fallback if templates not loaded)
export function openWhatsApp(order: WhatsAppOrderData): boolean {
  if (!order.phone) return false;
  const statusNote =
    order.status === "pending"
      ? "أوردرك دلوقتي قيد التأكيد وهيتشحن قريباً! 🚀"
      : "أوردرك دلوقتي قيد الشحن وفي طريقه إليك! 📦";
  const message =
    `أهلاً يا ${order.customerName} 👋\n\n` +
    `بنأكد عليك أوردرك رقم *#${order.id.toString().padStart(4, "0")}* من *CAPRINA* 🛍️\n\n` +
    `📌 المنتج: *${order.product}* × ${order.quantity}\n` +
    `💰 الإجمالي: *${formatCurrency(order.totalPrice)}*\n\n` +
    `${statusNote}\n\n` +
    `شكراً لثقتك في CAPRINA ❤️\n_WIN OR DIE_`;
  const link = buildWhatsAppLink(order.phone, message);
  window.open(link, "_blank", "noopener,noreferrer");
  return true;
}

export function applyShippingTemplate(templateBody: string, order: WhatsAppShippingData): string {
  const orderNum = order.id.toString().padStart(4, "0");
  const tracking = order.trackingNumber ?? "—";
  const company  = order.shippingCompany ?? "—";
  return templateBody
    .replace(/\{customerName\}/g, order.customerName)
    .replace(/\{orderNumber\}/g, orderNum)
    .replace(/\{product\}/g, order.product)
    .replace(/\{trackingNumber\}/g, tracking)
    .replace(/\{shippingCompany\}/g, company)
    .replace(/\{daysPending\}/g, String(order.daysPending));
}

export const TEMPLATE_VARIABLES = [
  { var: "{customerName}", label: "اسم العميل" },
  { var: "{orderNumber}", label: "رقم الأوردر" },
  { var: "{product}", label: "المنتج" },
  { var: "{quantity}", label: "الكمية" },
  { var: "{amount}", label: "المبلغ الإجمالي" },
  { var: "{status}", label: "حالة الأوردر" },
  { var: "{phone}", label: "رقم هاتف العميل" },
  { var: "{senderName}", label: "اسم الاستور" },
  { var: "{senderPhone}", label: "رقم هاتف الاستور" },
];

export const SHIPPING_TEMPLATE_VARIABLES = [
  { var: "{customerName}", label: "اسم العميل" },
  { var: "{orderNumber}", label: "رقم الأوردر" },
  { var: "{product}", label: "المنتج" },
  { var: "{shippingCompany}", label: "شركة الشحن" },
  { var: "{trackingNumber}", label: "رقم التتبع" },
  { var: "{daysPending}", label: "أيام الانتظار" },
];

// ─── قالب "متابعة تسليم البيان" — يُرسل للمستلم من جدول الطلبيات في البيان ──
export interface WhatsAppManifestDeliveryData {
  customerName: string;
  phone?: string | null;
  shipmentNumber?: string | null;
  totalPrice: number;
  representativeName?: string | null;
}

export function applyManifestDeliveryTemplate(templateBody: string, d: WhatsAppManifestDeliveryData): string {
  const formatCurr = (n: number) =>
    new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
  return templateBody
    .replace(/\{customerName\}/g,      d.customerName)
    .replace(/\{shipmentNumber\}/g,     d.shipmentNumber ?? "—")
    .replace(/\{totalPrice\}/g,         formatCurr(d.totalPrice))
    .replace(/\{representativeName\}/g, d.representativeName ?? "المندوب");
}

export const MANIFEST_DELIVERY_TEMPLATE_VARIABLES = [
  { var: "{customerName}",      label: "اسم العميل" },
  { var: "{shipmentNumber}",    label: "رقم الشحنة" },
  { var: "{totalPrice}",        label: "إجمالي سعر الشحنة" },
  { var: "{representativeName}", label: "اسم المندوب" },
];
