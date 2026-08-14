import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireRole";
import { getTenantId } from "../middlewares/requireTenant";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ── helpers: key per tenant ──────────────────────────────────────────────────
function phoneKey(tenantId: number | null): string {
  return tenantId !== null ? `whatsapp_business_phone_t${tenantId}` : "whatsapp_business_phone";
}
function templatesKey(tenantId: number | null): string {
  return tenantId !== null ? `whatsapp_templates_t${tenantId}` : "whatsapp_templates";
}

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO app_settings (\`key\`, \`value\`, \`updated_at\`)
        VALUES (${key}, ${value}, NOW())
        ON DUPLICATE KEY UPDATE \`value\` = ${value}, \`updated_at\` = NOW()`
  );
}

interface WaTemplate {
  id: string;
  name: string;
  body: string;
  isDefault: boolean;
}

const DEFAULT_TEMPLATES: WaTemplate[] = [
  {
    id: "default_confirm",
    name: "تأكيد الأوردر",
    body: "أهلاً يا {customerName} 👋\n\nبنأكد عليك أوردرك رقم *#{orderNumber}* 🛍️\n\n📌 المنتج: *{product}* × {quantity}\n💰 الإجمالي: *{amount}*\n\nأوردرك دلوقتي قيد التأكيد وهيتشحن قريباً! 🚀\n\nشكراً لثقتك! ❤️",
    isDefault: true,
  },
  {
    id: "default_shipping",
    name: "إشعار الشحن",
    body: "أهلاً يا {customerName} 👋\n\nأوردرك رقم *#{orderNumber}* خرج للشحن! 📦\n\n📌 المنتج: *{product}* × {quantity}\n💰 المبلغ: *{amount}*\n\nالمندوب في طريقه إليك — يرجى الاستعداد للاستلام والدفع ✅",
    isDefault: false,
  },
  {
    id: "default_followup",
    name: "متابعة بعد التأجيل",
    body: "أهلاً يا {customerName} 👋\n\nبنتابع معاك بخصوص أوردرك رقم *#{orderNumber}*.\n\n📌 المنتج: *{product}*\n💰 المبلغ: *{amount}*\n\nإيه الوقت المناسب ليك نعيد التوصيل؟ 🙏",
    isDefault: false,
  },
  {
    id: "default_shipping_followup",
    name: "متابعة الشحن",
    body: "مرحباً {customerName} 👋\n\nمعاك فريق *STARK* بخصوص شحنتك رقم *#{orderNumber}*\n\n📦 المنتج: *{product}*\n🚚 شركة الشحن: *{shippingCompany}*\n🔖 رقم التتبع: *{trackingNumber}*\n⏳ مدة الشحن: *{daysPending} يوم*\n\nحبينا نطمّن عليك ونتأكد إن كل حاجة تمام معاك 🙏\nلو الشحنة وصلتك، تقدر تأكدلنا وتقفل الطلب.\nولو لسه ماوصلتش أو حابب تسأل عن أي تفصيلة، احنا هنا في خدمتك في أي وقت.\n\nشكراً لثقتك في *STARK* ⚡",
    isDefault: false,
  },
];

async function getTemplates(tenantId: number | null): Promise<WaTemplate[]> {
  // لو التينانت الحالي معندوش قوالب متحفوظة خاصة بيه، نرجع للقوالب العامة
  // (المحفوظة بمفتاح واحد بدون رقم تينانت) بدل القوالب الافتراضية الفارغة —
  // عشان لو الأدمن حفظ قالب وهو مش مربوط بتينانت (أو تينانت مختلف)، يفضل
  // ظاهر لكل الموظفين/المندوبين بدل ما يختفي.
  let raw = await getSetting(templatesKey(tenantId));
  if (!raw && tenantId !== null) raw = await getSetting(templatesKey(null));
  if (!raw) return DEFAULT_TEMPLATES;
  let saved: WaTemplate[];
  try { saved = JSON.parse(raw); }
  catch { return DEFAULT_TEMPLATES; }

  for (const def of DEFAULT_TEMPLATES) {
    const exists = saved.some(t => t.name === def.name);
    if (!exists) saved.push({ ...def });
  }
  return saved;
}

// ── GET /api/whatsapp/settings ───────────────────────────────────────────────
// requireAuth فقط — أي موظف محتاج يقرأ القوالب عشان زرار الواتساب
router.get("/whatsapp/settings", requireAuth, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const [phone, templates] = await Promise.all([
    getSetting(phoneKey(tenantId)),
    getTemplates(tenantId),
  ]);
  res.json({ businessPhone: phone ?? "", templates });
});

// ── PATCH /api/whatsapp/settings ─────────────────────────────────────────────
router.patch("/whatsapp/settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const { businessPhone } = req.body as { businessPhone?: string };
  if (businessPhone !== undefined) await setSetting(phoneKey(tenantId), businessPhone);
  const [phone, templates] = await Promise.all([
    getSetting(phoneKey(tenantId)),
    getTemplates(tenantId),
  ]);
  res.json({ businessPhone: phone ?? "", templates });
});

// ── POST /api/whatsapp/templates ─────────────────────────────────────────────
router.post("/whatsapp/templates", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const { name, body } = req.body as { name?: string; body?: string };
  if (!name?.trim() || !body?.trim()) {
    res.status(400).json({ error: "name and body are required" });
    return;
  }
  const templates = await getTemplates(tenantId);
  const newTemplate: WaTemplate = {
    id: `tpl_${Date.now()}`,
    name: name.trim(),
    body: body.trim(),
    isDefault: false,
  };
  templates.push(newTemplate);
  await setSetting(templatesKey(tenantId), JSON.stringify(templates));
  res.json(newTemplate);
});

// ── PATCH /api/whatsapp/templates/:id ────────────────────────────────────────
router.patch("/whatsapp/templates/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { name, body, isDefault } = req.body as { name?: string; body?: string; isDefault?: boolean };
  const templates = await getTemplates(tenantId);
  const idx = templates.findIndex(t => t.id === id);
  if (idx === -1) { res.status(404).json({ error: "Template not found" }); return; }
  if (name !== undefined) templates[idx].name = name.trim();
  if (body !== undefined) templates[idx].body = body.trim();
  if (isDefault !== undefined) {
    if (isDefault) templates.forEach((t, i) => { t.isDefault = i === idx; });
    else templates[idx].isDefault = false;
  }
  await setSetting(templatesKey(tenantId), JSON.stringify(templates));
  res.json(templates[idx]);
});

// ── DELETE /api/whatsapp/templates/:id ───────────────────────────────────────
router.delete("/whatsapp/templates/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const templates = await getTemplates(tenantId);
  const filtered = templates.filter(t => t.id !== id);
  await setSetting(templatesKey(tenantId), JSON.stringify(filtered));
  res.json({ success: true });
});

export default router;
