import { PackagePlus } from "lucide-react";

// ── Placeholder: سيتم استبدالها بنموذج إنشاء الشحنة الكامل (نفس فورم الأدمن) لاحقًا ──
export default function ClientShipmentsNewPage() {
  return (
    <div className="min-h-screen -m-4 md:-m-6 p-4 md:p-6 bg-background flex items-center justify-center" dir="rtl">
      <div className="max-w-md text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <PackagePlus size={28} className="text-primary" />
        </div>
        <h1 className="text-xl font-black text-foreground">إنشاء شحنة جديدة</h1>
        <p className="text-sm text-muted-foreground">
          هذه الصفحة قيد الإنشاء حاليًا وسيتم تفعيلها قريبًا لتتيح لك إنشاء شحنة جديدة مباشرة من هنا.
        </p>
      </div>
    </div>
  );
}
