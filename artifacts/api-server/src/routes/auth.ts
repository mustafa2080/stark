import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db, usersTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, comparePassword, hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

// Helper: parse permissions from MariaDB (returns JSON as string, sometimes nested from JSON_ARRAY_APPEND)
function parsePermissions(permissions: any): string[] {
  let parsed = permissions;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  // flatten لأي nested arrays
  const flat: string[] = [];
  for (const item of parsed) {
    if (typeof item === "string") flat.push(item);
    else if (Array.isArray(item)) {
      for (const sub of item) { if (typeof sub === "string") flat.push(sub); }
    }
  }
  return [...new Set(flat)];
}

// ─── Brute-force protection: max 10 login attempts per 15 min per IP ────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل دخول كثيرة، يرجى الانتظار 15 دقيقة" },
  skipSuccessfulRequests: true,
});

const router: IRouter = Router();

// ─── Register limiter: max 5 per hour per IP ────────────────────────────────
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل كثيرة، يرجى المحاولة لاحقاً" },
});

// POST /auth/register — creates new tenant + owner super-admin account
router.post("/register", registerLimiter, async (req, res): Promise<void> => {
  const { displayName, username, password, phone, email, company } = req.body as {
    displayName: string; username: string; password: string;
    phone?: string; email?: string; company?: string;
  };

  // ── Validation ──────────────────────────────────────────────────────────
  if (!displayName?.trim() || !username?.trim() || !password) {
    res.status(400).json({ error: "الاسم واسم المستخدم وكلمة المرور مطلوبة" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }
  const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (cleanUsername.length < 3) {
    res.status(400).json({ error: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل (أحرف إنجليزية وأرقام)" });
    return;
  }

  // ── Check username uniqueness ────────────────────────────────────────────
  const [existing] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.username, cleanUsername)).limit(1);
  if (existing) {
    res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر" });
    return;
  }

  // ── Create tenant ────────────────────────────────────────────────────────
  const tenantName = (company?.trim()) || displayName.trim();
  const slug = cleanUsername + "_" + Date.now().toString(36);
  const trialDays = 14;
  const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  const graceUntil = new Date(expiresAt.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [tenantResult] = await db.insert(tenantsTable).values({
    name: tenantName,
    slug,
    plan: "free_trial",
    planStatus: "active",
    expiresAt,
    graceUntil,
    contactEmail: email?.trim() || null,
    contactPhone: phone?.trim() || null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const tenantId = (tenantResult as any).insertId as number;

  // ── Create owner user (super-admin) ─────────────────────────────────────
  const passwordHash = await hashPassword(password);
  const [userResult] = await db.insert(usersTable).values({
    tenantId,
    username: cleanUsername,
    displayName: displayName.trim(),
    passwordHash,
    role: "super-admin",
    permissions: JSON.stringify([]),
    phone: phone?.trim() || null,
    email: email?.trim() || null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
  const userId = (userResult as any).insertId as number;

  await logAudit({
    action: "register",
    entityType: "user",
    entityId: userId,
    entityName: displayName.trim(),
    userId,
    userName: displayName.trim(),
  });

  // ── Auto-login: return token ─────────────────────────────────────────────
  const [newUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const finalPerms = parsePermissions(newUser.permissions);
  const token = signToken({ ...newUser, permissions: finalPerms } as any);
  const { passwordHash: _, ...safeUser } = newUser;

  res.status(201).json({
    token,
    user: { ...safeUser, permissions: finalPerms, planStatus: "active" },
    message: "تم إنشاء الحساب بنجاح — تجربة مجانية 14 يوم",
  });
});

// POST /auth/login
router.post("/login", loginLimiter, async (req, res): Promise<void> => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username.trim().toLowerCase())).limit(1);
  if (!user || !user.isActive) {
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }

  const finalPerms = parsePermissions(user.permissions);
  const token = signToken({ ...user, permissions: finalPerms } as any);

  await logAudit({
    action: "login",
    entityType: "user",
    entityId: user.id,
    entityName: user.displayName,
    userId: user.id,
    userName: user.displayName,
  });

  const { passwordHash: _, ...safeUser } = user;
  let loginPlanStatus: string | null = null;
  if (user.tenantId) {
    const [tenant] = await db.select({ planStatus: tenantsTable.planStatus }).from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    loginPlanStatus = tenant?.planStatus ?? null;
  }
  res.json({ token, user: { ...safeUser, permissions: finalPerms, planStatus: loginPlanStatus } });
});

// GET /auth/me
router.get("/me", requireAuth, async (req, res): Promise<void> => {
  // منع الـ caching عشان الصلاحيات تيجي fresh من الـ DB دايماً
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
  if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
  const finalPerms = parsePermissions(user.permissions);
  const { passwordHash: _, ...safeUser } = user;
  // أضف planStatus من الـ tenant
  let planStatus: string | null = null;
  if (user.tenantId) {
    const [tenant] = await db.select({ planStatus: tenantsTable.planStatus }).from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    planStatus = tenant?.planStatus ?? null;
  }
  res.json({ ...safeUser, permissions: finalPerms, planStatus });
});

// PATCH /auth/update-profile — update avatar (and optionally displayName) for current user
router.patch("/update-profile", requireAuth, async (req, res): Promise<void> => {
  const { avatar, displayName } = req.body as { avatar?: string | null; displayName?: string };
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (avatar !== undefined) updates.avatar = avatar ?? null;
  if (displayName !== undefined && displayName.trim()) updates.displayName = displayName.trim();

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للتحديث" });
    return;
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.id));

  // sync employee_profile إذا كان مرتبطاً
  const { employeeProfilesTable } = await import("@workspace/db");
  const profileUpdates: Record<string, any> = {};
  if (updates.avatar !== undefined) profileUpdates.avatar = updates.avatar;
  if (updates.displayName !== undefined) profileUpdates.displayName = updates.displayName;
  if (Object.keys(profileUpdates).length > 0) {
    await db.update(employeeProfilesTable).set(profileUpdates).where(eq(employeeProfilesTable.userId, req.user!.id));
  }

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
  const { passwordHash: _, ...safeUser } = updated;
  res.json({ ...safeUser, permissions: parsePermissions(safeUser.permissions) });
});

// POST /auth/change-password
router.post("/change-password", requireAuth, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "كلمة المرور الحالية والجديدة مطلوبتان" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
  if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" }); return; }

  const newHash = await hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));

  res.json({ success: true });
});

export default router;
