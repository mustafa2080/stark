import { Phone, MessageCircle, UserCheck, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buildWhatsAppLink } from "@/lib/whatsapp";

/**
 * حاوية "المندوب المسؤول" في تفاصيل الشحنة.
 * مستخدمة في صفحتين: shipment-detail (الأدمن) و client-shipment-detail (بوابة العميل التجاري)
 * فأي تعديل في الشكل أو السلوك بيتعمل هنا مرة واحدة.
 */

export interface ShipmentCourierCardProps {
  /** اسم المندوب (assignedUserName من الـ API) */
  name?: string | null;
  /** رقم تليفون المندوب (assignedUserPhone من الـ API) */
  phone?: string | null;
  /** صورة المندوب اختيارية (base64 أو URL) */
  avatar?: string | null;
  /** رقم الشحنة، بيتحط في رسالة الواتساب الجاهزة */
  shipmentNumber?: string | null;
  /**
   * بيانات شركة الشحن/المندوب الخارجي — بتُستخدم كبديل لما مفيش مستخدم مندوب معيّن (assignedUser)
   * لأن الشحنة ممكن تكون "مع احمد بدوي" عن طريق shipping_companies مش users.
   */
  fallbackName?: string | null;
  fallbackPhone?: string | null;
  fallbackAvatar?: string | null;
}

/** أول حرفين من الاسم عشان الـ avatar الافتراضي */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 1);
  return parts[0].slice(0, 1) + parts[1].slice(0, 1);
}

/** رقم صالح للاتصال: يشيل أي رموز غير الأرقام و + */
function dialable(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

/** تنسيق للعرض فقط (010 1234 5678) */
function displayPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  return raw.trim();
}

export function ShipmentCourierCard({
  name, phone, avatar, shipmentNumber,
  fallbackName, fallbackPhone, fallbackAvatar,
}: ShipmentCourierCardProps) {
  // الأولوية للمستخدم المندوب المعيّن؛ لو مفيش → شركة الشحن/المندوب الخارجي (نفس ترتيب "🚚 مع ..." في الهيدر)
  const hasAssignedUser = (name ?? "").trim().length > 0;
  const cleanName = ((hasAssignedUser ? name : fallbackName) ?? "").trim();
  const cleanPhone = ((hasAssignedUser ? phone : fallbackPhone) ?? "").trim();
  avatar = hasAssignedUser ? avatar : fallbackAvatar;
  const hasCourier = cleanName.length > 0;
  const hasPhone = cleanPhone.replace(/\D/g, "").length >= 8;

  const waMessage = shipmentNumber
    ? `مرحباً، بخصوص الشحنة رقم ${shipmentNumber}`
    : "مرحباً";

  return (
    <Card className="border-border bg-card overflow-hidden" data-testid="shipment-courier-card">
      {/* ── الهيدر: نفس أسلوب كارت الملخص المالي ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
          <UserCheck className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">المندوب المسؤول</p>
          <p className="text-[10px] text-muted-foreground">للتواصل بخصوص توصيل الشحنة</p>
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        {!hasCourier ? (
          /* ── حالة: لسه مفيش مندوب معيّن ── */
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center">
              <UserX className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">لم يتم تعيين مندوب بعد</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              هيظهر هنا اسم المندوب ورقم التواصل بمجرد تعيينه على الشحنة
            </p>
          </div>
        ) : (
          <>
            {/* ── هوية المندوب ── */}
            <div className="flex items-center gap-3">
              {avatar ? (
                <img
                  src={avatar}
                  alt={cleanName}
                  className="w-11 h-11 rounded-full object-cover border border-border shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-black text-primary">{initials(cleanName)}</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{cleanName}</p>
                {hasPhone ? (
                  <p className="text-xs text-muted-foreground font-mono tabular-nums" dir="ltr">
                    {displayPhone(cleanPhone)}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">لا يوجد رقم تواصل مسجّل</p>
                )}
              </div>
            </div>

            {/* ── أزرار التواصل ── */}
            {hasPhone ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={`tel:${dialable(cleanPhone)}`}
                  className="flex items-center justify-center gap-1.5 h-9 rounded-lg border border-border bg-muted/40 text-xs font-bold text-foreground hover:bg-muted transition-colors"
                  aria-label={`اتصال بالمندوب ${cleanName}`}
                  data-testid="courier-call"
                >
                  <Phone className="w-3.5 h-3.5 text-primary" />
                  اتصال
                </a>
                <a
                  href={buildWhatsAppLink(cleanPhone, waMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 h-9 rounded-lg border border-emerald-600/30 bg-emerald-600/10 text-xs font-bold text-emerald-500 hover:bg-emerald-600/20 transition-colors"
                  aria-label={`مراسلة المندوب ${cleanName} على واتساب`}
                  data-testid="courier-whatsapp"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  واتساب
                </a>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ShipmentCourierCard;
