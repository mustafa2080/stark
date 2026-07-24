import { Router } from "express";
import { db, tenantsTable, usersTable, appSettingsTable } from "@workspace/db";
import { hashPassword } from "../lib/auth.js";
import { eq, desc, sql } from "drizzle-orm";

// ── Default plan prices (fallback) ───────────────────────────────────────────
const DEFAULT_PLAN_PRICES = {
  free_trial: { monthlyPrice: null, yearlyPrice: null, yearlySaving: null, priceDisplay: "مجاناً",       period: "14 يوم"   },
  starter:    { monthlyPrice: 199,  yearlyPrice: 1990, yearlySaving: 398,  priceDisplay: "١٩٩",           period: "شهرياً"   },
  pro:        { monthlyPrice: 399,  yearlyPrice: 3990, yearlySaving: 798,  priceDisplay: "٣٩٩",           period: "شهرياً"   },
  enterprise: { monthlyPrice: null, yearlyPrice: null, yearlySaving: null, priceDisplay: "تواصل معنا",   period: ""          },
};
const PRICES_KEY = "plan_prices";

function parseJson(val: string | null | undefined): Record<string, any> {
  if (!val) return {};
  try { return JSON.parse(val); } catch { return {}; }
}

async function getStoredPrices(): Promise<typeof DEFAULT_PLAN_PRICES> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, PRICES_KEY));
  if (!row) return DEFAULT_PLAN_PRICES;
  const stored = parseJson(row.value);
  return { ...DEFAULT_PLAN_PRICES, ...stored };
}

// ── PUBLIC router: GET /api/public/plan-prices — بدون auth ───────────────────
export const publicAdminRouter = Router();

publicAdminRouter.get("/public/plan-prices", async (_req, res): Promise<void> => {
  try {
    const prices = await getStoredPrices();
    res.json(prices);
  } catch {
    res.json(DEFAULT_PLAN_PRICES);
  }
});

// ── ADMIN router: /api/admin/* — بعد requireAuth + super_admin فقط ──────────
const router = Router();

function requireSuperAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "super_admin") {
    res.status(403).json({ error: "ممنوع — هذه الصفحة للأدمن الرئيسي فقط" });
    return;
  }
  next();
}
// NOTE: requireSuperAdmin is applied per-route below, not via router.use(),
// because this router is mounted with no path prefix in routes/index.ts.
// A path-less router.use() here would run for every request that reaches
// any router mounted after it (e.g. /notifications), not just /admin/*.

// ── GET /api/admin/plan-prices ────────────────────────────────────────────────
router.get("/admin/plan-prices", requireSuperAdmin, async (_req, res): Promise<void> => {
  const prices = await getStoredPrices();
  res.json(prices);
});

// ── PATCH /api/admin/plan-prices ──────────────────────────────────────────────
router.patch("/admin/plan-prices", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const incoming = req.body as Record<string, any>;
    const existing = await getStoredPrices();
    const merged: any = { ...existing };

    for (const planKey of Object.keys(DEFAULT_PLAN_PRICES)) {
      if (incoming[planKey] !== undefined) {
        merged[planKey] = { ...existing[planKey as keyof typeof existing], ...incoming[planKey] };

        const monthly = merged[planKey].monthlyPrice != null ? parseInt(merged[planKey].monthlyPrice) : null;
        const yearly  = merged[planKey].yearlyPrice  != null ? parseInt(merged[planKey].yearlyPrice)  : null;

        // priceDisplay: لو مفيش سعر → حسب الـ plan
        if (monthly && !isNaN(monthly)) {
          merged[planKey].priceDisplay = monthly.toLocaleString("ar-EG");
        } else {
          // reset للـ default display
          merged[planKey].priceDisplay = DEFAULT_PLAN_PRICES[planKey as keyof typeof DEFAULT_PLAN_PRICES].priceDisplay;
          merged[planKey].monthlyPrice = null;
          merged[planKey].yearlyPrice  = null;
          merged[planKey].yearlySaving = null;
        }

        // yearlySaving
        if (monthly && yearly && !isNaN(monthly) && !isNaN(yearly)) {
          merged[planKey].yearlySaving = (monthly * 12) - yearly;
        }
      }
    }

    const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, PRICES_KEY));
    if (row) {
      await db.update(appSettingsTable)
        .set({ value: JSON.stringify(merged), updatedAt: new Date() })
        .where(eq(appSettingsTable.key, PRICES_KEY));
    } else {
      await db.insert(appSettingsTable).values({ key: PRICES_KEY, value: JSON.stringify(merged), updatedAt: new Date() });
    }

    res.json(merged);
  } catch (e: any) {
    res.status(500).json({ error: "فشل حفظ الأسعار", detail: e?.message });
  }
});

// ── GET /api/admin/tenants ────────────────────────────────────────────────────
router.get("/admin/tenants", requireSuperAdmin, async (_req, res): Promise<void> => {
  const tenants = await db.select().from(tenantsTable)
    .where(eq(tenantsTable.isActive, true))
    .orderBy(desc(tenantsTable.createdAt));
  res.json(tenants);
});

// ── GET /api/admin/tenants/:id ────────────────────────────────────────────────
router.get("/admin/tenants/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, parseInt(req.params.id)));
  if (!tenant) { res.status(404).json({ error: "غير موجود" }); return; }
  res.json(tenant);
});

// ── POST /api/admin/tenants ───────────────────────────────────────────────────
router.post("/admin/tenants", requireSuperAdmin, async (req, res): Promise<void> => {
  const { name, slug, plan, contactEmail, contactPhone, notes, durationDays, adminUsername, adminPassword, adminDisplayName } = req.body;
  if (!name || !slug || !plan || !durationDays || !adminUsername || !adminPassword) {
    res.status(400).json({ error: "name, slug, plan, durationDays, adminUsername, adminPassword مطلوبة" });
    return;
  }

  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.username, adminUsername.trim().toLowerCase())).limit(1);
  if (existingUser) {
    res.status(409).json({ error: "اسم المستخدم موجود بالفعل، اختر اسماً آخر" });
    return;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parseInt(durationDays));

  const [result] = await db.insert(tenantsTable).values({
    name, slug, plan, planStatus: "active",
    expiresAt, contactEmail, contactPhone, notes,
  });
  const tenantId = result.insertId;

  const passwordHash = await hashPassword(adminPassword);
  await db.insert(usersTable).values({
    username: adminUsername.trim().toLowerCase(),
    passwordHash,
    displayName: adminDisplayName || name,
    role: "admin",
    tenantId,
    permissions: ["*"],
    isActive: true,
  });

  res.status(201).json({ id: tenantId, message: "تم إنشاء الاشتراك والمستخدم بنجاح" });
});

// ── PATCH /api/admin/tenants/:id/activate ─────────────────────────────────────
router.patch("/admin/tenants/:id/activate", requireSuperAdmin, async (req, res): Promise<void> => {
  const { plan, durationDays } = req.body;
  if (!durationDays) { res.status(400).json({ error: "durationDays مطلوب" }); return; }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parseInt(durationDays));

  await db.update(tenantsTable).set({
    planStatus: "active",
    plan: plan ?? undefined,
    expiresAt,
    graceUntil: null as any,
    updatedAt: sql`NOW()`,
  }).where(eq(tenantsTable.id, parseInt(req.params.id)));

  res.json({ message: "تم تفعيل الاشتراك" });
});

// ── PATCH /api/admin/tenants/:id/suspend ─────────────────────────────────────
router.patch("/admin/tenants/:id/suspend", requireSuperAdmin, async (req, res): Promise<void> => {
  await db.update(tenantsTable).set({ planStatus: "suspended", updatedAt: sql`NOW()` })
    .where(eq(tenantsTable.id, parseInt(req.params.id)));
  res.json({ message: "تم إيقاف الاشتراك" });
});

// ── PATCH /api/admin/tenants/:id/expire ──────────────────────────────────────
router.patch("/admin/tenants/:id/expire", requireSuperAdmin, async (req, res): Promise<void> => {
  await db.update(tenantsTable).set({ planStatus: "expired", expiresAt: sql`NOW()`, updatedAt: sql`NOW()` })
    .where(eq(tenantsTable.id, parseInt(req.params.id)));
  res.json({ message: "تم إنهاء الاشتراك" });
});

// ── DELETE /api/admin/tenants/:id ────────────────────────────────────────────
router.delete("/admin/tenants/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const tenantId = parseInt(req.params.id);
  await db.delete(usersTable).where(eq(usersTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  res.json({ message: "تم حذف العميل نهائياً" });
});

export default router;
