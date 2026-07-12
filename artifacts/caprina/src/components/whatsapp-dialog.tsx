import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Send, Eye, Phone, ArrowRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { type WaSettings, type WaTemplate, type WhatsAppOrderData, type WhatsAppShipmentData, applyTemplate, applyShipmentTemplate, buildWhatsAppLink, formatEgyptianPhone } from "@/lib/whatsapp";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: WhatsAppOrderData | null;
  onSent?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending:          "قيد الانتظار",
  warehouse_ready:  "قيد الشحن في المخزن",
  in_shipping:      "قيد الشحن",
  received:         "مستلم",
  delayed:          "متأخر",
  returned:         "مرتجع",
  partial_received: "مستلم جزئياً",
};

// يشيل بلوك "تفاصيل الطلب" (المنتج/شركة الشحن/رقم التتبع/مدة الشحن) لو موجود بالقالب
const stripOrderDetailsBlockDlg = (body: string): string => {
  return body
    .replace(/\*?تفاصيل الطلب:?\*?\n(?:[•\-][^\n]*\n?)+\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

// يضيف فقرة تتبع الشحنة (رقم هاتف العميل) لو القالب لا يحتوي عليها أصلاً — احتياطي فقط، القالب المحفوظ يحتوي عليها افتراضياً
const withTrackingFooterDlg = (body: string, o: WhatsAppOrderData): string => {
  const cleaned = stripOrderDetailsBlockDlg(body);
  if (/لتتبع شحنتك|رقم الهاتف/.test(cleaned)) return cleaned;
  const phoneForTrack = o.phone ?? "—";
  return (
    cleaned +
    `\n——————————————\n` +
    `📍 لتتبع شحنتك يرجى كتابة البيانات الآتية:\n` +
    `• رقم الهاتف: ${phoneForTrack}`
  );
};

export function WhatsAppDialog({ open, onOpenChange, order, onSent }: Props) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [preview, setPreview] = useState("");
  const [editingBody, setEditingBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const { isAdmin } = useAuth();

  const { data: settings } = useQuery<WaSettings>({
    queryKey: ["whatsapp-settings"],
    queryFn: () => apiFetch<WaSettings>("/whatsapp/settings"),
    staleTime: 60_000,
    enabled: isAdmin,
    retry: false,
  });

  const templates = settings?.templates ?? [];
  const defaultTpl = templates.find(t => t.isDefault) ?? templates[0];

  useEffect(() => {
    if (!open || !order) return;
    const tpl = templates.find(t => t.id === selectedId) ?? defaultTpl;
    if (tpl) {
      setSelectedId(tpl.id);
      const body = withTrackingFooterDlg(applyTemplate(tpl.body, order), order);
      setEditingBody(body);
      setPreview(body);
    }
  }, [open, order, templates.length]);

  useEffect(() => {
    if (!order) return;
    setPreview(editingBody);
  }, [editingBody, order]);

  const selectTemplate = (tpl: WaTemplate) => {
    if (!order) return;
    setSelectedId(tpl.id);
    const body = withTrackingFooterDlg(applyTemplate(tpl.body, order), order);
    setEditingBody(body);
  };

  const handleSend = () => {
    if (!order?.phone || !editingBody) return;
    const link = buildWhatsAppLink(order.phone, editingBody);
    window.open(link, "_blank", "noopener,noreferrer");
    onSent?.();
    onOpenChange(false);
  };

  if (!order) return null;

  const formattedPhone = order.phone ? formatEgyptianPhone(order.phone) : null;
  const willChangeStatus = order.status === "pending";
  const alreadyWarehouseReady = order.status === "warehouse_ready";
  const isReminder = order.status === "in_shipping" || order.status === "delayed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-500">
            <MessageCircle className="w-5 h-5" />
            إرسال واتساب — {order.customerName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isReminder ? "إرسال تذكير للعميل" : "اختر قالباً أو عدّل الرسالة قبل الإرسال"}
          </DialogDescription>
        </DialogHeader>

        {/* Customer info */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border text-sm">
          <Phone className="w-4 h-4 text-green-500 shrink-0" />
          <span className="font-bold">{order.customerName}</span>
          <span className="text-muted-foreground font-mono text-xs mr-auto ltr">{formattedPhone ?? "لا يوجد رقم"}</span>
          {!order.phone && (
            <Badge variant="destructive" className="text-[9px]">لا يوجد رقم</Badge>
          )}
        </div>

        {/* Auto status-change banner — pending → warehouse_ready */}
        {willChangeStatus && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-xs text-sky-400">
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            <span>
              بعد الإرسال ستتغير الحالة تلقائياً إلى
              <span className="font-bold mx-1 text-sky-300">«قيد الشحن في المخزن»</span>
            </span>
          </div>
        )}

        {/* Already warehouse_ready banner */}
        {alreadyWarehouseReady && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-xs text-teal-400">
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            <span>
              الطلب بالفعل في حالة
              <span className="font-bold mx-1 text-teal-300">«قيد الشحن في المخزن»</span>
              — سيُرسل الواتساب بدون تغيير الحالة
            </span>
          </div>
        )}

        {/* Reminder badge */}
        {isReminder && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              إرسال تذكير — الأوردر حالته
              <span className="font-bold mx-1">«{STATUS_LABELS[order.status] ?? order.status}»</span>
              ولن تتغير الحالة
            </span>
          </div>
        )}

        {/* Template chooser */}
        {templates.length > 0 && (
          <div>
            <Label className="text-xs font-bold mb-2 block">القوالب المتاحة</Label>
            <div className="flex flex-wrap gap-2">
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => selectTemplate(tpl)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    selectedId === tpl.id
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-card text-muted-foreground border-border hover:border-green-500 hover:text-green-500"
                  }`}
                >
                  {tpl.name}
                  {tpl.isDefault && <span className="mr-1 opacity-70">★</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs font-bold">نص الرسالة</Label>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-[10px] text-primary flex items-center gap-1 hover:underline"
            >
              <Eye className="w-3 h-3" />
              {showPreview ? "تعديل" : "معاينة"}
            </button>
          </div>

          {showPreview ? (
            <div
              className="bg-[#dcf8c6] dark:bg-green-900/30 text-[#111] dark:text-green-100 rounded-xl rounded-tl-none p-3 text-sm leading-relaxed whitespace-pre-wrap min-h-[120px] font-[Cairo]"
              style={{ direction: "rtl" }}
            >
              {preview}
            </div>
          ) : (
            <Textarea
              value={editingBody}
              onChange={e => setEditingBody(e.target.value)}
              className="min-h-[120px] text-sm leading-relaxed resize-none bg-muted/20"
              placeholder="اكتب رسالتك هنا..."
            />
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            {editingBody.length} حرف
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleSend}
            disabled={!order.phone || !editingBody.trim()}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2 font-bold"
          >
            <Send className="w-4 h-4" />
            {isReminder ? "فتح واتساب — إرسال تذكير" : "فتح واتساب وإرسال"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
            إلغاء
          </Button>
        </div>
        {!order.phone && (
          <p className="text-xs text-destructive text-center">
            لا يوجد رقم هاتف لهذا العميل — يجب إضافته أولاً
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── WhatsApp Shipment Dialog ──────────────────────────────────────────────────
interface ShipmentDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent?: () => void;
  shipment: WhatsAppShipmentData | null;
}

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  waiting: "في الانتظار", confirmed: "مؤكدة", picked_up: "تم الاستلام",
  in_transit: "قيد الشحن", out_for_delivery: "خرجت للتسليم",
  delivered: "مُسلَّمة", delayed: "متأخرة", returned: "مرتجعة", cancelled: "ملغاة",
};

const DEFAULT_SHIPMENT_TEMPLATE = `السلام عليكم يا {receiverName} 👋

بنتواصل معاكم من *STARK* بخصوص شحنتكم رقم *#{shipmentNumber}*.

📍 الحالة: *{status}*
🔍 رقم التتبع: *{trackingNumber}*
💰 رسوم الشحن: *{shippingFee}*

هل وصلكم الطلب بشكل سليم؟ 📦
لو عندكم أي استفسار إحنا دايماً هنا.

شكراً لثقتكم في STARK ❤️
——————————————
📍 لتتبع شحنتك يرجى كتابة البيانات الآتية:
• اسم الاستور: *{senderName}*
• رقم الهاتف: *{receiverPhone}*`;

export function WhatsAppShipmentDialog({ open, onOpenChange, onSent, shipment }: ShipmentDialogProps) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [editingBody, setEditingBody] = useState("");
  const [preview, setPreview] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const { isAdmin } = useAuth();

  const { data: settings } = useQuery<WaSettings>({
    queryKey: ["whatsapp-settings"],
    queryFn: () => apiFetch<WaSettings>("/whatsapp/settings"),
    staleTime: 60_000,
    retry: false,
  });

  const templates = settings?.templates ?? [];
  // فلتر القوالب اللي فيها shipment placeholders بس
  const shipmentTemplates = templates.filter(t =>
    /\{receiverName\}|\{shipmentNumber\}|\{trackingNumber\}|\{shippingFee\}|\{codAmount\}|\{zone\}/.test(t.body)
  );
  const defaultTpl = shipmentTemplates.find(t => t.isDefault) ?? shipmentTemplates[0];

  // يشيل بلوك "تفاصيل الطلب" (المنتج/شركة الشحن/رقم التتبع/مدة الشحن) لو موجود بالقالب
  const stripOrderDetailsBlock = (body: string): string => {
    return body
      .replace(/\*?تفاصيل الطلب:?\*?\n(?:•[^\n]*\n?)+\n?/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  // يضيف فقرة تتبع الشحنة (اسم الاستور + هاتف المستلم) لو القالب لا يحتوي عليها أصلاً
  const withTrackingFooter = (body: string, s: WhatsAppShipmentData): string => {
    const cleaned = stripOrderDetailsBlock(body);
    if (/لتتبع شحنتك|اسم الاستور/.test(cleaned)) return cleaned;
    const senderNameForTrack = s.senderName ?? "—";
    const receiverPhoneForTrack = s.receiverPhone ?? "—";
    return (
      cleaned +
      `\n——————————————\n` +
      `📍 لتتبع شحنتك يرجى كتابة البيانات الآتية:\n` +
      `• اسم الاستور: ${senderNameForTrack}\n` +
      `• رقم الهاتف: ${receiverPhoneForTrack}`
    );
  };

  useEffect(() => {
    if (!open || !shipment) return;
    // استخدم قالب شحنة لو موجود، وإلا DEFAULT_SHIPMENT_TEMPLATE
    const body = withTrackingFooter(
      applyShipmentTemplate(defaultTpl ? defaultTpl.body : DEFAULT_SHIPMENT_TEMPLATE, shipment),
      shipment
    );
    setSelectedId(defaultTpl?.id ?? "");
    setEditingBody(body);
    setPreview(body);
  }, [open, shipment, templates.length]);

  useEffect(() => {
    if (!shipment) return;
    setPreview(editingBody);
  }, [editingBody, shipment]);

  const selectTemplate = (tpl: WaTemplate) => {
    if (!shipment) return;
    setSelectedId(tpl.id);
    setEditingBody(withTrackingFooter(applyShipmentTemplate(tpl.body, shipment), shipment));
  };

  const handleSend = () => {
    if (!shipment?.receiverPhone || !editingBody) return;
    const link = buildWhatsAppLink(shipment.receiverPhone, editingBody);
    window.open(link, "_blank", "noopener,noreferrer");
    onOpenChange(false);
    onSent?.();
  };

  if (!shipment) return null;

  const formattedPhone = shipment.receiverPhone ? formatEgyptianPhone(shipment.receiverPhone) : null;
  const statusLabel = SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-500">
            <MessageCircle className="w-5 h-5" />
            واتساب — {shipment.receiverName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            اختر قالباً أو عدّل الرسالة قبل الإرسال للمستلم
          </DialogDescription>
        </DialogHeader>

        {/* Receiver info */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border text-sm">
          <Phone className="w-4 h-4 text-green-500 shrink-0" />
          <span className="font-bold">{shipment.receiverName}</span>
          <span className="text-muted-foreground font-mono text-xs mr-auto" dir="ltr">{formattedPhone ?? "لا يوجد رقم"}</span>
          {!shipment.receiverPhone && (
            <Badge variant="destructive" className="text-[9px]">لا يوجد رقم</Badge>
          )}
        </div>

        {/* Shipment info strip */}
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="bg-muted/30 rounded-lg px-2.5 py-2 border border-border">
            <p className="text-muted-foreground mb-0.5">رقم البوليصة</p>
            <p className="font-bold text-xs">{shipment.shipmentNumber ?? "#" + shipment.id}</p>
          </div>
          <div className="bg-muted/30 rounded-lg px-2.5 py-2 border border-border">
            <p className="text-muted-foreground mb-0.5">الحالة</p>
            <p className="font-bold text-xs">{statusLabel}</p>
          </div>
          <div className="bg-muted/30 rounded-lg px-2.5 py-2 border border-border">
            <p className="text-muted-foreground mb-0.5">رقم التتبع</p>
            <p className="font-bold text-xs">{shipment.trackingNumber ?? "—"}</p>
          </div>
        </div>

        {/* Template chooser */}
        {shipmentTemplates.length > 0 && (
          <div>
            <Label className="text-xs font-bold mb-2 block">القوالب المتاحة</Label>
            <div className="flex flex-wrap gap-2">
              {shipmentTemplates.map(tpl => (
                <button key={tpl.id} onClick={() => selectTemplate(tpl)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    selectedId === tpl.id
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-card text-muted-foreground border-border hover:border-green-500 hover:text-green-500"
                  }`}>
                  {tpl.name}{tpl.isDefault && <span className="mr-1 opacity-70">★</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs font-bold">نص الرسالة</Label>
            <button onClick={() => setShowPreview(!showPreview)}
              className="text-[10px] text-primary flex items-center gap-1 hover:underline">
              <Eye className="w-3 h-3" />{showPreview ? "تعديل" : "معاينة"}
            </button>
          </div>
          {showPreview ? (
            <div className="bg-[#dcf8c6] dark:bg-green-900/30 text-[#111] dark:text-green-100 rounded-xl rounded-tl-none p-3 text-sm leading-relaxed whitespace-pre-wrap min-h-[120px] font-[Cairo]" style={{ direction: "rtl" }}>
              {preview}
            </div>
          ) : (
            <Textarea value={editingBody} onChange={e => setEditingBody(e.target.value)}
              className="min-h-[120px] text-sm leading-relaxed resize-none bg-muted/20"
              placeholder="اكتب رسالتك هنا..." />
          )}
          <p className="text-[10px] text-muted-foreground mt-1">{editingBody.length} حرف</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button onClick={handleSend} disabled={!shipment.receiverPhone || !editingBody.trim()}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2 font-bold">
            <Send className="w-4 h-4" />فتح واتساب وإرسال
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
