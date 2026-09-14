// ══════════════════════════════════════════════════════════════════════════
// Dialog مشاركة صورة الشحنة — يولّد الصورة، يعرض preview، ويبعتها واتساب
// ══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { Share2, Download, Send, Loader2, MessageCircle, Printer } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  type ShipmentShareData,
  generateShipmentShareImage,
  dataUrlToFile,
} from "@/lib/shipment-share-card";
import { formatEgyptianPhone, buildWhatsAppLink } from "@/lib/whatsapp";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipment: ShipmentShareData | null;
}

export function ShareShipmentImageDialog({ open, onOpenChange, shipment }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !shipment) {
      setImageUrl(null);
      setError(null);
      return;
    }
    setIsGenerating(true);
    setError(null);
    generateShipmentShareImage(shipment)
      .then(setImageUrl)
      .catch((e) => {
        console.error(e);
        setError("تعذر توليد الصورة. حاول مرة أخرى.");
      })
      .finally(() => setIsGenerating(false));
  }, [open, shipment]);

  if (!shipment) return null;

  const fileName = `شحنة-${shipment.shipmentNumber ?? shipment.id}.png`;

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── مشاركة عبر Web Share API (يفتح شاشة المشاركة بتاعة الجهاز — واتساب متضمن) ──
  const handleNativeShare = async () => {
    if (!imageUrl) return;
    try {
      const file = await dataUrlToFile(imageUrl, fileName);
      const canShareFiles = (navigator as any).canShare?.({ files: [file] });
      if (navigator.share && canShareFiles) {
        await navigator.share({
          files: [file],
          title: `شحنة ${shipment.shipmentNumber ?? shipment.id}`,
        });
        return;
      }
      // Fallback: مفيش دعم لمشاركة الملفات — نزّل الصورة وافتح واتساب بنص بسيط
      handleDownload();
      if (shipment.receiverPhone) {
        const link = buildWhatsAppLink(
          shipment.receiverPhone,
          "تفاصيل شحنتك 📦 (الصورة تم تحميلها — أرفقها هنا)"
        );
        window.open(link, "_blank", "noopener,noreferrer");
      }
      toast({
        title: "تم تحميل الصورة",
        description: "المتصفح ده مش بيدعم إرفاق الصور تلقائياً — تم فتح واتساب وتحميل الصورة، أرفقها يدوياً.",
      });
    } catch (e: any) {
      if (e?.name === "AbortError") return; // المستخدم ألغى المشاركة
      console.error(e);
      toast({ title: "تعذرت المشاركة", variant: "destructive" });
    }
  };

  // ── طباعة الصورة على ورقة A4 حقيقية (مركزية، بهوامش مناسبة) ──────────────
  const handlePrint = () => {
    if (!imageUrl) return;
    const printWindow = window.open("", "_blank", "width=800,height=1000");
    if (!printWindow) {
      toast({ title: "تعذر فتح نافذة الطباعة", description: "تأكد إن الـ popup blocker متوقف", variant: "destructive" });
      return;
    }
    printWindow.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8" />
<title>طباعة شحنة ${shipment.shipmentNumber ?? shipment.id}</title>
<style>
  @page { size: A4; margin: 12mm; }
  html, body {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
    background: #fff;
    display: flex; align-items: flex-start; justify-content: center;
  }
  .print-wrap {
    width: 100%;
    display: flex;
    justify-content: center;
  }
  img {
    /* أقصى عرض/ارتفاع يملأ صفحة A4 (بعد خصم الهوامش) مع الحفاظ على النسبة */
    max-width: 186mm;   /* 210mm - 2×12mm هامش */
    max-height: 273mm;  /* 297mm - 2×12mm هامش */
    width: auto; height: auto;
    object-fit: contain;
  }
  @media print {
    html, body { width: 210mm; height: 297mm; }
  }
</style>
</head>
<body>
  <div class="print-wrap">
    <img src="${imageUrl}" alt="شحنة ${shipment.shipmentNumber ?? shipment.id}" />
  </div>
  <script>
    const img = document.querySelector("img");
    function doPrint() { window.focus(); window.print(); }
    if (img.complete) { doPrint(); } else { img.onload = doPrint; }
    window.onafterprint = () => window.close();
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  // ── فتح واتساب مباشرة على رقم المستلم (مع تحميل الصورة أولاً للإرفاق اليدوي) ──
  const handleOpenWhatsAppDirect = () => {
    if (!shipment.receiverPhone) {
      toast({ title: "لا يوجد رقم هاتف للمستلم", variant: "destructive" });
      return;
    }
    handleDownload();
    const link = buildWhatsAppLink(shipment.receiverPhone, "");
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const formattedPhone = shipment.receiverPhone ? formatEgyptianPhone(shipment.receiverPhone) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Share2 className="w-5 h-5" />
            مشاركة صورة الشحنة
          </DialogTitle>
          <DialogDescription className="text-xs">
            صورة جاهزة بكل بيانات الشحنة — تقدر تبعتها للعميل مباشرة بدل صورة النظام
          </DialogDescription>
        </DialogHeader>

        {/* Preview */}
        <div className="rounded-xl border border-border overflow-hidden bg-muted/20 flex items-center justify-center min-h-[360px] p-2">
          {isGenerating && (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2 className="w-6 h-6 animate-spin" />
              جاري توليد الصورة...
            </div>
          )}
          {error && (
            <div className="text-destructive text-sm py-10 text-center px-4">{error}</div>
          )}
          {imageUrl && !isGenerating && (
            <img src={imageUrl} alt="صورة الشحنة" className="max-w-full max-h-[580px] rounded-md object-contain shadow-sm" />
          )}
        </div>

        {shipment.receiverPhone && (
          <div className="text-xs text-muted-foreground text-center" dir="ltr">
            {formattedPhone}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">
          <Button
            onClick={handleNativeShare}
            disabled={!imageUrl || isGenerating}
            className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 font-bold"
          >
            <MessageCircle className="w-4 h-4" />
            مشاركة عبر واتساب
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={!imageUrl || isGenerating}
              className="flex-1 gap-2"
            >
              <Download className="w-4 h-4" />
              تحميل الصورة
            </Button>
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={!imageUrl || isGenerating}
              className="flex-1 gap-2"
            >
              <Printer className="w-4 h-4" />
              طباعة
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={handleOpenWhatsAppDirect}
            disabled={!imageUrl || isGenerating || !shipment.receiverPhone}
            className="w-full gap-2 border-green-700 text-green-500 hover:bg-green-500/10"
          >
            <Send className="w-4 h-4" />
            فتح واتساب
          </Button>
        </div>
        {!shipment.receiverPhone && (
          <p className="text-xs text-destructive text-center">
            لا يوجد رقم هاتف للمستلم — يمكنك تحميل الصورة ومشاركتها يدوياً
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
