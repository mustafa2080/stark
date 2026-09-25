// ══════════════════════════════════════════════════════════════════════════
// Dialog اختيار نوع المشاركة — إيصال عادي أو فاتورة رسمية بشعار الشركة
// ══════════════════════════════════════════════════════════════════════════
import { Package, FileText } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChooseReceipt: () => void;
  onChooseInvoice: () => void;
}

export function ShareChoiceDialog({ open, onOpenChange, onChooseReceipt, onChooseInvoice }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-primary">مشاركة الشحنة</DialogTitle>
          <DialogDescription className="text-xs">
            اختر نوع المشاركة اللي عايزها
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => { onOpenChange(false); onChooseReceipt(); }}
            className="w-full flex items-center gap-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors p-4 text-right"
          >
            <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">مشاركة إيصال</p>
              <p className="text-xs text-muted-foreground">صورة إشعار حالة الشحنة — للعميل</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => { onOpenChange(false); onChooseInvoice(); }}
            className="w-full flex items-center gap-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors p-4 text-right"
          >
            <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">مشاركة فاتورة</p>
              <p className="text-xs text-muted-foreground">فاتورة رسمية بشعار الشركة وتفاصيل الشحن الكاملة</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
