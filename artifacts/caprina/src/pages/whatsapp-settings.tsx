import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Plus, Pencil, Trash2, Star, StarOff, Save, X, Phone, Info, Copy, Check, Truck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { type WaSettings, type WaTemplate, TEMPLATE_VARIABLES, SHIPPING_TEMPLATE_VARIABLES, SENDER_ISSUE_TEMPLATE_VARIABLES, MANIFEST_DELIVERY_TEMPLATE_VARIABLES } from "@/lib/whatsapp";
import { useAuth } from "@/contexts/AuthContext";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function WhatsAppSettingsPage() {
  const { isAdmin, can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!isAdmin && !can("settings.whatsapp")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
        <p className="text-muted-foreground text-sm max-w-xs">ليس لديك صلاحية لإعدادات واتساب. تواصل مع المدير.</p>
      </div>
    );
  }

  const { data: settings, isLoading } = useQuery<WaSettings>({
    queryKey: ["whatsapp-settings"],
    queryFn: () => apiFetch<WaSettings>("/whatsapp/settings"),
  });

  const [businessPhone, setBusinessPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newBody, setNewBody] = useState("");
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // ─── قالب إشعار الشحن (warehouse_ready) ───────────────────────────────
  const NOTIFY_TEMPLATE_NAME = "إشعار الشحن";
  const DEFAULT_NOTIFY_BODY =
    `أهلاً يا {customerName} 👋\n\n` +
    `أوردرك رقم *#${"{orderNumber}"}* من *CAPRINA* خرج للشحن! 📦\n\n` +
    `📌 المنتج: *{product}* × {quantity}\n` +
    `💰 المبلغ: *{amount}*\n\n` +
    `المندوب في طريقه إليك — يرجى الاستعداد للاستلام والدفع ✅\n\n` +
    `شكراً لثقتك في CAPRINA ❤️`;

  // ─── قالب متابعة الشحن ──────────────────────────────────────────────────
  const SHIPPING_TEMPLATE_NAME = "متابعة الشحن";
  const DEFAULT_SHIPPING_BODY =
    `السلام عليكم يا {customerName} 👋\n\n` +
    `بنتواصل معاكم من *CAPRINA* بخصوص طلبكم رقم *#${"{orderNumber}"}*.\n\n` +
    `هل وصلكم الطلب بشكل سليم؟ 📦\n` +
    `لو عندكم أي استفسار إحنا دايماً هنا.\n\n` +
    `شكراً لثقتكم في CAPRINA ❤️`;

  // ─── قالب مشكلة العميل (يُرسل للراسل) ──────────────────────────────────
  const SENDER_ISSUE_TEMPLATE_NAME = "مشكلة العميل";
  const DEFAULT_SENDER_ISSUE_BODY =
    `السلام عليكم يا {senderName} 👋\n\n` +
    `بنتواصل معاك بخصوص شحنة العميل *{receiverName}*.\n\n` +
    `*تفاصيل الشحنة:*\n` +
    `• رقم البوليصة: *{shipmentNumber}*\n` +
    `• رقم التتبع: *{trackingNumber}*\n` +
    `• حالة الشحنة: *{status}*\n` +
    `• هاتف المستلم: *{receiverPhone}*\n` +
    `• المنطقة: *{zone}*\n` +
    `• رسوم الشحن: *{shippingFee}*\n` +
    `• مبلغ COD: *{codAmount}*\n\n` +
    `فيه مشكلة بخصوص العميل ده، ياريت نتواصل بخصوصها 🙏\n\n` +
    `شكراً لتعاونك.`;

  // ─── قالب متابعة تسليم البيان (يُرسل للعميل من جدول الطلبيات في البيان) ─
  const MANIFEST_DELIVERY_TEMPLATE_NAME = "متابعة تسليم البيان";
  const DEFAULT_MANIFEST_DELIVERY_BODY =
    `السلام عليكم يا {customerName} 👋\n\n` +
    `بنتواصل معاك بخصوص شحنتك رقم *#${"{shipmentNumber}"}*.\n\n` +
    `💰 إجمالي المبلغ: *{totalPrice}*\n` +
    `🚚 المندوب: *{representativeName}*\n\n` +
    `ياريت التأكد من استلام الشحنة والمبلغ بشكل سليم 🙏\n\n` +
    `شكراً لثقتك 🌹`;

  const templates = settings?.templates ?? [];
  const notifyTpl = templates.find(t => t.name === NOTIFY_TEMPLATE_NAME) ?? null;
  const shippingTpl = templates.find(t => t.name === SHIPPING_TEMPLATE_NAME) ?? null;
  const senderIssueTpl = templates.find(t => t.name === SENDER_ISSUE_TEMPLATE_NAME) ?? null;
  const manifestDeliveryTpl = templates.find(t => t.name === MANIFEST_DELIVERY_TEMPLATE_NAME) ?? null;

  const [notifyBody, setNotifyBody] = useState(DEFAULT_NOTIFY_BODY);
  const [savingNotify, setSavingNotify] = useState(false);
  const [editingNotify, setEditingNotify] = useState(false);

  const [shippingBody, setShippingBody] = useState(DEFAULT_SHIPPING_BODY);
  const [savingShipping, setSavingShipping] = useState(false);
  const [editingShipping, setEditingShipping] = useState(false);

  const [senderIssueBody, setSenderIssueBody] = useState(DEFAULT_SENDER_ISSUE_BODY);
  const [savingSenderIssue, setSavingSenderIssue] = useState(false);
  const [editingSenderIssue, setEditingSenderIssue] = useState(false);

  const [manifestDeliveryBody, setManifestDeliveryBody] = useState(DEFAULT_MANIFEST_DELIVERY_BODY);
  const [savingManifestDelivery, setSavingManifestDelivery] = useState(false);
  const [editingManifestDelivery, setEditingManifestDelivery] = useState(false);

  useEffect(() => {
    if (notifyTpl) setNotifyBody(notifyTpl.body);
  }, [notifyTpl?.id]);

  useEffect(() => {
    if (shippingTpl) setShippingBody(shippingTpl.body);
  }, [shippingTpl?.id]);

  useEffect(() => {
    if (senderIssueTpl) setSenderIssueBody(senderIssueTpl.body);
  }, [senderIssueTpl?.id]);

  useEffect(() => {
    if (manifestDeliveryTpl) setManifestDeliveryBody(manifestDeliveryTpl.body);
  }, [manifestDeliveryTpl?.id]);

  const handleSaveNotifyTemplate = async () => {
    setSavingNotify(true);
    try {
      if (notifyTpl) {
        await apiFetch(`/whatsapp/templates/${notifyTpl.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: NOTIFY_TEMPLATE_NAME, body: notifyBody }),
        });
      } else {
        await apiFetch("/whatsapp/templates", {
          method: "POST",
          body: JSON.stringify({ name: NOTIFY_TEMPLATE_NAME, body: notifyBody }),
        });
      }
      refresh();
      setEditingNotify(false);
      toast({ title: "تم حفظ قالب إشعار الشحن ✅" });
    } catch {
      toast({ title: "خطأ", description: "فشل حفظ القالب", variant: "destructive" });
    } finally {
      setSavingNotify(false);
    }
  };



  const handleSaveShippingTemplate = async () => {
    setSavingShipping(true);
    try {
      if (shippingTpl) {
        // عدّل القالب الموجود
        await apiFetch(`/whatsapp/templates/${shippingTpl.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: SHIPPING_TEMPLATE_NAME, body: shippingBody }),
        });
      } else {
        // أضف قالب جديد
        await apiFetch("/whatsapp/templates", {
          method: "POST",
          body: JSON.stringify({ name: SHIPPING_TEMPLATE_NAME, body: shippingBody }),
        });
      }
      refresh();
      setEditingShipping(false);
      toast({ title: "تم حفظ قالب متابعة الشحن ✅" });
    } catch {
      toast({ title: "خطأ", description: "فشل حفظ القالب", variant: "destructive" });
    } finally {
      setSavingShipping(false);
    }
  };

  const handleSaveSenderIssueTemplate = async () => {
    setSavingSenderIssue(true);
    try {
      if (senderIssueTpl) {
        await apiFetch(`/whatsapp/templates/${senderIssueTpl.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: SENDER_ISSUE_TEMPLATE_NAME, body: senderIssueBody }),
        });
      } else {
        await apiFetch("/whatsapp/templates", {
          method: "POST",
          body: JSON.stringify({ name: SENDER_ISSUE_TEMPLATE_NAME, body: senderIssueBody }),
        });
      }
      refresh();
      setEditingSenderIssue(false);
      toast({ title: "تم حفظ قالب مشكلة العميل ✅" });
    } catch {
      toast({ title: "خطأ", description: "فشل حفظ القالب", variant: "destructive" });
    } finally {
      setSavingSenderIssue(false);
    }
  };

  const handleSaveManifestDeliveryTemplate = async () => {
    setSavingManifestDelivery(true);
    try {
      if (manifestDeliveryTpl) {
        await apiFetch(`/whatsapp/templates/${manifestDeliveryTpl.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: MANIFEST_DELIVERY_TEMPLATE_NAME, body: manifestDeliveryBody }),
        });
      } else {
        await apiFetch("/whatsapp/templates", {
          method: "POST",
          body: JSON.stringify({ name: MANIFEST_DELIVERY_TEMPLATE_NAME, body: manifestDeliveryBody }),
        });
      }
      refresh();
      setEditingManifestDelivery(false);
      toast({ title: "تم حفظ قالب متابعة تسليم البيان ✅" });
    } catch {
      toast({ title: "خطأ", description: "فشل حفظ القالب", variant: "destructive" });
    } finally {
      setSavingManifestDelivery(false);
    }
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });

  const handleSavePhone = async () => {
    setSavingPhone(true);
    try {
      await apiFetch("/whatsapp/settings", {
        method: "PATCH",
        body: JSON.stringify({ businessPhone }),
      });
      refresh();
      toast({ title: "تم الحفظ", description: "تم حفظ رقم واتساب الشركة" });
    } catch {
      toast({ title: "خطأ", description: "فشل حفظ الرقم", variant: "destructive" });
    } finally {
      setSavingPhone(false);
    }
  };

  const handleAddTemplate = async () => {
    if (!newName.trim() || !newBody.trim()) {
      toast({ title: "خطأ", description: "اسم القالب والنص مطلوبان", variant: "destructive" });
      return;
    }
    try {
      await apiFetch("/whatsapp/templates", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), body: newBody.trim() }),
      });
      refresh();
      setShowNewForm(false);
      setNewName("");
      setNewBody("");
      toast({ title: "تم إضافة القالب ✅" });
    } catch {
      toast({ title: "خطأ", description: "فشل إضافة القالب", variant: "destructive" });
    }
  };

  const handleEditTemplate = async (tpl: WaTemplate) => {
    try {
      await apiFetch(`/whatsapp/templates/${tpl.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName.trim(), body: newBody.trim() }),
      });
      refresh();
      setEditingId(null);
      setNewName("");
      setNewBody("");
      toast({ title: "تم تحديث القالب ✅" });
    } catch {
      toast({ title: "خطأ", description: "فشل التحديث", variant: "destructive" });
    }
  };

  const handleSetDefault = async (tpl: WaTemplate) => {
    try {
      await apiFetch(`/whatsapp/templates/${tpl.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      });
      refresh();
      toast({ title: `"${tpl.name}" هو القالب الافتراضي الآن` });
    } catch {
      toast({ title: "خطأ", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/whatsapp/templates/${id}`, { method: "DELETE" });
      refresh();
      toast({ title: "تم حذف القالب" });
    } catch {
      toast({ title: "خطأ", description: "فشل الحذف", variant: "destructive" });
    }
  };

  const startEdit = (tpl: WaTemplate) => {
    setEditingId(tpl.id);
    setNewName(tpl.name);
    setNewBody(tpl.body);
    setShowNewForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewName("");
    setNewBody("");
  };

  const copyVar = (v: string) => {
    navigator.clipboard.writeText(v).then(() => {
      setCopiedVar(v);
      setTimeout(() => setCopiedVar(null), 1500);
    });
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-green-500" />
          إعدادات واتساب
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          إدارة رقم واتساب الشركة وقوالب رسائل التأكيد
        </p>
      </div>

      {/* Business Phone Card */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4 text-green-500" />
            رقم واتساب الشركة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            الرقم الذي تُرسل منه رسائل التأكيد. يُفتح واتساب على الجهاز بهذا الرقم تلقائياً.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="مثال: 01012345678 أو +201012345678"
              value={businessPhone || settings?.businessPhone || ""}
              onChange={e => setBusinessPhone(e.target.value)}
              className="bg-muted/20 flex-1"
              disabled={!isAdmin}
              dir="ltr"
            />
            {isAdmin && (
              <Button
                onClick={handleSavePhone}
                disabled={savingPhone}
                className="gap-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <Save className="w-3.5 h-3.5" />
                حفظ
              </Button>
            )}
          </div>
          <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-400">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              عند الضغط على زرار واتساب في أي أوردر، يُفتح التطبيق على هاتفك مباشرةً برسالة جاهزة مرسلة للعميل.
              لإرسال من رقم شركة محدد، استخدم جهاز الشركة أو واتساب الويب على حساب الشركة.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Variables Reference */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">المتغيرات المتاحة في القوالب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">قوالب تأكيد الطلب:</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map(v => (
                <button
                  key={v.var}
                  onClick={() => copyVar(v.var)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border hover:border-primary text-xs transition-all"
                  title="انقر للنسخ"
                >
                  <code className="text-primary font-mono">{v.var}</code>
                  <span className="text-muted-foreground">= {v.label}</span>
                  {copiedVar === v.var
                    ? <Check className="w-3 h-3 text-green-500" />
                    : <Copy className="w-3 h-3 text-muted-foreground" />
                  }
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">قوالب متابعة الشحن:</p>
            <div className="flex flex-wrap gap-2">
              {SHIPPING_TEMPLATE_VARIABLES.map(v => (
                <button
                  key={v.var}
                  onClick={() => copyVar(v.var)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:border-blue-500 text-xs transition-all"
                  title="انقر للنسخ"
                >
                  <code className="text-blue-500 font-mono">{v.var}</code>
                  <span className="text-muted-foreground">= {v.label}</span>
                  {copiedVar === v.var
                    ? <Check className="w-3 h-3 text-green-500" />
                    : <Copy className="w-3 h-3 text-muted-foreground" />
                  }
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">انقر على أي متغير لنسخه ثم الصقه في القالب</p>
        </CardContent>
      </Card>

      {/* ─── قالب إشعار الشحن (warehouse_ready) ──────────────────────────── */}
      <Card className="border-teal-500/30 bg-teal-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4 text-teal-500" />
            قالب إشعار الشحن
            {notifyTpl && (
              <Badge className="text-[10px] bg-teal-600/20 text-teal-400 border-teal-600/30 font-bold mr-auto">
                محفوظ ✓
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            هذه الرسالة تُستخدم تلقائياً عند الضغط على زر واتساب لطلب بحالة <strong>«قيد الشحن في المخزن»</strong>.
            تُرسل للعميل إشعاراً بأن طلبه خرج للشحن.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map(v => (
              <button
                key={v.var}
                onClick={() => copyVar(v.var)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-teal-500/10 border border-teal-500/30 hover:border-teal-500 text-xs transition-all"
                title="انقر للنسخ"
              >
                <code className="text-teal-400 font-mono text-[10px]">{v.var}</code>
                {copiedVar === v.var
                  ? <Check className="w-2.5 h-2.5 text-green-500" />
                  : <Copy className="w-2.5 h-2.5 text-muted-foreground" />
                }
              </button>
            ))}
          </div>
          {editingNotify || !notifyTpl ? (
            <div className="space-y-3">
              <Textarea
                value={notifyBody}
                onChange={e => setNotifyBody(e.target.value)}
                className="bg-muted/20 text-sm min-h-[160px] resize-none font-[Cairo] leading-relaxed"
                dir="rtl"
                disabled={!isAdmin}
              />
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveNotifyTemplate}
                    disabled={savingNotify}
                    className="gap-1 h-8 bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingNotify ? "جاري الحفظ..." : "حفظ القالب"}
                  </Button>
                  {notifyTpl && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditingNotify(false); setNotifyBody(notifyTpl.body); }} className="h-8 gap-1">
                      <X className="w-3.5 h-3.5" />إلغاء
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setNotifyBody(DEFAULT_NOTIFY_BODY)}
                    className="h-8 text-xs text-muted-foreground"
                  >
                    استعادة الافتراضي
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-[Cairo] leading-relaxed bg-muted/20 rounded-md p-3 border border-teal-500/20">
                {notifyTpl.body}
              </pre>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditingNotify(true); setNotifyBody(notifyTpl.body); }}
                  className="h-8 gap-1 text-xs border-teal-500/40 text-teal-400 hover:bg-teal-500/10"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  تعديل القالب
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── قالب متابعة الشحن ─────────────────────────────────────────────── */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-500" />
            قالب متابعة الشحن مع العميل
            {shippingTpl && (
              <Badge className="text-[10px] bg-blue-600/20 text-blue-400 border-blue-600/30 font-bold mr-auto">
                محفوظ ✓
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            هذه الرسالة تُستخدم تلقائياً في قسم <strong>متابعة الشحن</strong> عند الضغط على زر واتساب.
            يمكنك تعديلها وحفظها، وستُطبَّق على جميع الطلبات المتأخرة.
          </p>

          {/* معاينة المتغيرات الخاصة */}
          <div className="flex flex-wrap gap-1.5">
            {SHIPPING_TEMPLATE_VARIABLES.map(v => (
              <button
                key={v.var}
                onClick={() => copyVar(v.var)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30 hover:border-blue-500 text-xs transition-all"
                title="انقر للنسخ"
              >
                <code className="text-blue-400 font-mono text-[10px]">{v.var}</code>
                {copiedVar === v.var
                  ? <Check className="w-2.5 h-2.5 text-green-500" />
                  : <Copy className="w-2.5 h-2.5 text-muted-foreground" />
                }
              </button>
            ))}
          </div>

          {editingShipping || !shippingTpl ? (
            <div className="space-y-3">
              <Textarea
                value={shippingBody}
                onChange={e => setShippingBody(e.target.value)}
                className="bg-muted/20 text-sm min-h-[200px] resize-none font-[Cairo] leading-relaxed"
                dir="rtl"
                disabled={!isAdmin}
              />
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveShippingTemplate}
                    disabled={savingShipping}
                    className="gap-1 h-8 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingShipping ? "جاري الحفظ..." : "حفظ القالب"}
                  </Button>
                  {shippingTpl && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditingShipping(false); setShippingBody(shippingTpl.body); }} className="h-8 gap-1">
                      <X className="w-3.5 h-3.5" />إلغاء
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShippingBody(DEFAULT_SHIPPING_BODY)}
                    className="h-8 text-xs text-muted-foreground"
                  >
                    استعادة الافتراضي
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-[Cairo] leading-relaxed bg-muted/20 rounded-md p-3 border border-blue-500/20">
                {shippingTpl.body}
              </pre>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditingShipping(true); setShippingBody(shippingTpl.body); }}
                  className="h-8 gap-1 text-xs border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  تعديل القالب
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── قالب مشكلة العميل (يُرسل للراسل) ─────────────────────────────── */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            قالب مشكلة العميل — يُرسل للراسل
            {senderIssueTpl && (
              <Badge className="text-[10px] bg-amber-600/20 text-amber-400 border-amber-600/30 font-bold mr-auto">
                محفوظ ✓
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            هذه الرسالة تُستخدم عند الضغط على زر واتساب في بطاقة <strong>«الراسل»</strong> بتفاصيل الشحنة.
            تُرسل للراسل تفاصيل شحنة المستلم عند وجود مشكلة مع العميل.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SENDER_ISSUE_TEMPLATE_VARIABLES.map(v => (
              <button
                key={v.var}
                onClick={() => copyVar(v.var)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 hover:border-amber-500 text-xs transition-all"
                title="انقر للنسخ"
              >
                <code className="text-amber-500 font-mono text-[10px]">{v.var}</code>
                {copiedVar === v.var
                  ? <Check className="w-2.5 h-2.5 text-green-500" />
                  : <Copy className="w-2.5 h-2.5 text-muted-foreground" />
                }
              </button>
            ))}
          </div>
          {editingSenderIssue || !senderIssueTpl ? (
            <div className="space-y-3">
              <Textarea
                value={senderIssueBody}
                onChange={e => setSenderIssueBody(e.target.value)}
                className="bg-muted/20 text-sm min-h-[200px] resize-none font-[Cairo] leading-relaxed"
                dir="rtl"
                disabled={!isAdmin}
              />
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveSenderIssueTemplate}
                    disabled={savingSenderIssue}
                    className="gap-1 h-8 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingSenderIssue ? "جاري الحفظ..." : "حفظ القالب"}
                  </Button>
                  {senderIssueTpl && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditingSenderIssue(false); setSenderIssueBody(senderIssueTpl.body); }} className="h-8 gap-1">
                      <X className="w-3.5 h-3.5" />إلغاء
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSenderIssueBody(DEFAULT_SENDER_ISSUE_BODY)}
                    className="h-8 text-xs text-muted-foreground"
                  >
                    استعادة الافتراضي
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-[Cairo] leading-relaxed bg-muted/20 rounded-md p-3 border border-amber-500/20">
                {senderIssueTpl.body}
              </pre>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditingSenderIssue(true); setSenderIssueBody(senderIssueTpl.body); }}
                  className="h-8 gap-1 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  تعديل القالب
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── قالب متابعة تسليم البيان (يُرسل للعميل من جدول الطلبيات في البيان) ─ */}
      <Card className="border-teal-500/30 bg-teal-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4 text-teal-500" />
            قالب متابعة تسليم البيان — يُرسل للعميل
            {manifestDeliveryTpl && (
              <Badge className="text-[10px] bg-teal-600/20 text-teal-400 border-teal-600/30 font-bold mr-auto">
                محفوظ ✓
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            هذه الرسالة تُستخدم عند الضغط على أيقونة واتساب في جدول <strong>«الطلبيات في البيان»</strong> بصفحة بيان العميل.
            تُرسل للعميل لتأكيد استلام شحنته والمبلغ.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MANIFEST_DELIVERY_TEMPLATE_VARIABLES.map(v => (
              <button
                key={v.var}
                onClick={() => copyVar(v.var)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-teal-500/10 border border-teal-500/30 hover:border-teal-500 text-xs transition-all"
                title="انقر للنسخ"
              >
                <code className="text-teal-500 font-mono text-[10px]">{v.var}</code>
                {copiedVar === v.var
                  ? <Check className="w-2.5 h-2.5 text-green-500" />
                  : <Copy className="w-2.5 h-2.5 text-muted-foreground" />
                }
              </button>
            ))}
          </div>
          {editingManifestDelivery || !manifestDeliveryTpl ? (
            <div className="space-y-3">
              <Textarea
                value={manifestDeliveryBody}
                onChange={e => setManifestDeliveryBody(e.target.value)}
                className="bg-muted/20 text-sm min-h-[200px] resize-none font-[Cairo] leading-relaxed"
                dir="rtl"
                disabled={!isAdmin}
              />
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveManifestDeliveryTemplate}
                    disabled={savingManifestDelivery}
                    className="gap-1 h-8 bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingManifestDelivery ? "جاري الحفظ..." : "حفظ القالب"}
                  </Button>
                  {manifestDeliveryTpl && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditingManifestDelivery(false); setManifestDeliveryBody(manifestDeliveryTpl.body); }} className="h-8 gap-1">
                      <X className="w-3.5 h-3.5" />إلغاء
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setManifestDeliveryBody(DEFAULT_MANIFEST_DELIVERY_BODY)}
                    className="h-8 text-xs text-muted-foreground"
                  >
                    استعادة الافتراضي
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-[Cairo] leading-relaxed bg-muted/20 rounded-md p-3 border border-teal-500/20">
                {manifestDeliveryTpl.body}
              </pre>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditingManifestDelivery(true); setManifestDeliveryBody(manifestDeliveryTpl.body); }}
                  className="h-8 gap-1 text-xs border-teal-500/40 text-teal-400 hover:bg-teal-500/10"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  تعديل القالب
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Templates */}
      <Card className="border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">قوالب الرسائل</CardTitle>
          {isAdmin && !showNewForm && !editingId && (
            <Button
              size="sm"
              onClick={() => { setShowNewForm(true); setNewName(""); setNewBody(""); }}
              className="h-8 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="w-3.5 h-3.5" />قالب جديد
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* New Template Form */}
          {showNewForm && (
            <div className="border border-green-600/30 rounded-lg p-4 space-y-3 bg-green-500/5">
              <p className="text-sm font-bold text-green-500">قالب جديد</p>
              <div>
                <Label className="text-xs mb-1 block">اسم القالب</Label>
                <Input
                  placeholder="مثال: تأكيد الشحن، متابعة، ..."
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="bg-muted/20 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">نص الرسالة</Label>
                <Textarea
                  placeholder={`استخدم المتغيرات مثل {customerName}، {orderNumber}، {amount}...`}
                  value={newBody}
                  onChange={e => setNewBody(e.target.value)}
                  className="bg-muted/20 text-sm min-h-[120px] resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddTemplate} className="gap-1 h-8 bg-green-600 hover:bg-green-700 text-white">
                  <Save className="w-3.5 h-3.5" />حفظ
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewForm(false)} className="h-8 gap-1">
                  <X className="w-3.5 h-3.5" />إلغاء
                </Button>
              </div>
            </div>
          )}

          {/* Template List */}
          {templates.length === 0 && !showNewForm ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              لا توجد قوالب — اضغط «قالب جديد» لإضافة أول قالب
            </div>
          ) : (
            <div className="space-y-3">
              {templates
                .filter(tpl => tpl.name !== NOTIFY_TEMPLATE_NAME && tpl.name !== SHIPPING_TEMPLATE_NAME && tpl.name !== SENDER_ISSUE_TEMPLATE_NAME)
                .map(tpl => (
                <div key={tpl.id} className={`border rounded-lg p-4 ${tpl.isDefault ? "border-green-600/40 bg-green-500/5" : "border-border bg-card"}`}>
                  {editingId === tpl.id ? (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs mb-1 block">اسم القالب</Label>
                        <Input
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          className="bg-muted/20 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">نص الرسالة</Label>
                        <Textarea
                          value={newBody}
                          onChange={e => setNewBody(e.target.value)}
                          className="bg-muted/20 text-sm min-h-[120px] resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleEditTemplate(tpl)} className="gap-1 h-8 bg-green-600 hover:bg-green-700 text-white">
                          <Save className="w-3.5 h-3.5" />حفظ
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8 gap-1">
                          <X className="w-3.5 h-3.5" />إلغاء
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{tpl.name}</span>
                          {tpl.isDefault && (
                            <Badge className="text-[9px] bg-green-600/20 text-green-500 border-green-600/30 font-bold">
                              ★ افتراضي
                            </Badge>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            {!tpl.isDefault && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-yellow-500"
                                title="تعيين كافتراضي"
                                onClick={() => handleSetDefault(tpl)}
                              >
                                <Star className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => startEdit(tpl)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(tpl.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-[Cairo] leading-relaxed bg-muted/20 rounded-md p-3 border border-border">
                        {tpl.body}
                      </pre>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
