import { Router, type IRouter } from "express";
import { db, usersTable, USER_ROLES, employeeProfilesTable } from "@workspace/db";
import { eq, and, isNull, or } from "drizzle-orm";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireAdmin } from "../middlewares/requireRole.js";
import { logAudit } from "../lib/audit.js";
import { getTenantId } from "../middlewares/requireTenant.js";

const router: IRouter = Router();
router.use(requireAuth);

function parsePermissions(permissions: any): string[] {
  let parsed = permissions;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  const flat: string[] = [];
  for (const item of parsed) {
    if (typeof item === "string") flat.push(item);
    else if (Array.isArray(item)) {
      for (const sub of item) { if (typeof sub === "string") flat.push(sub); }
    }
  }
  return [...new Set(flat)];
}

// GET /users
router.get("/", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const currentUser = (req as any).user;
  const isSuperAdmin = currentUser?.role === "super_admin";

  const query = db.select({
    id: usersTable.id,
    username: usersTable.username,
    displayName: usersTable.displayName,
    role: usersTable.role,
    permissions: usersTable.permissions,
    isActive: usersTable.isActive,
    avatar: usersTable.avatar,
    showProfileLink: usersTable.showProfileLink,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
    jobTitle: employeeProfilesTable.jobTitle,
    department: employeeProfilesTable.department,
  }).from(usersTable)
    .leftJoin(employeeProfilesTable, eq(employeeProfilesTable.userId, usersTable.id));

  // super_admin → يجيب كل المستخدمين بدون فلتر
  // admin عنده tenantId → يجيب users بنفس tenantId فقط
  const users = isSuperAdmin
    ? await query.orderBy(usersTable.createdAt)
    : tenantId !== null
      ? await query.where(eq(usersTable.tenantId, tenantId)).orderBy(usersTable.createdAt)
      : await query.where(isNull(usersTable.tenantId)).orderBy(usersTable.createdAt);

  res.json(users.map(u => ({ ...u, permissions: parsePermissions(u.permissions) })));
});

// POST /users
router.post("/", requireAdmin, async (req, res): Promise<void> => {
  const { username, password, displayName, role, permissions } = req.body as {
    username: string; password: string; displayName: string;
    role: string; permissions?: string[];
  };

  if (!username || !password || !displayName) {
    res.status(400).json({ error: "اسم المستخدم وكلمة المرور والاسم مطلوبة" });
    return;
  }
  if (!USER_ROLES.includes(role as any)) {
    res.status(400).json({ error: "الدور غير صحيح" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.username, username.trim().toLowerCase())).limit(1);
  if (existing.length) {
    res.status(409).json({ error: "اسم المستخدم موجود مسبقاً" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const creatorTenantId = getTenantId(req);
  const { avatar: avatarData } = req.body as { avatar?: string };
  const insertResult = await db.insert(usersTable).values({
    username: username.trim().toLowerCase(),
    passwordHash,
    displayName: displayName.trim(),
    role: role as any,
    permissions: permissions ?? [],
    isActive: true,
    avatar: avatarData ?? null,
    ...(creatorTenantId !== null ? { tenantId: creatorTenantId } : {}),
  });
  const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
  const [newUser] = await db.select({
    id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
    role: usersTable.role, permissions: usersTable.permissions, isActive: usersTable.isActive,
    avatar: usersTable.avatar, createdAt: usersTable.createdAt, updatedAt: usersTable.updatedAt,
  }).from(usersTable).where(eq(usersTable.id, insertId));

  await logAudit({
    action: "create", entityType: "user", entityId: newUser.id, entityName: newUser.displayName,
    after: { username: newUser.username, role: newUser.role },
    userId: req.user!.id, userName: req.user!.displayName,
  });

  res.status(201).json({ ...newUser, permissions: parsePermissions(newUser.permissions) });
});

// PATCH /users/:id
router.patch("/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { displayName, role, permissions, isActive, password, avatar, jobTitle, department, showProfileLink } = req.body as {
    displayName?: string; role?: string; permissions?: string[];
    isActive?: boolean; password?: string; avatar?: string | null;
    jobTitle?: string | null; department?: string | null;
    showProfileLink?: boolean;
  };

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

  // تأكد إن الـ admin بيعدل فقط users من نفس الـ tenant
  const editorTenantId = getTenantId(req);
  const isSuperAdminEditor = req.user?.role === "super_admin";
  if (!isSuperAdminEditor && editorTenantId !== null && existing.tenantId !== editorTenantId) {
    res.status(403).json({ error: "ليس لديك صلاحية تعديل هذا المستخدم" });
    return;
  }

  if (isActive === false && existing.role === "admin") {
    const adminCount = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
    const activeAdmins = adminCount.filter(a => a.id !== id);
    if (activeAdmins.length === 0) {
      res.status(400).json({ error: "لا يمكن تعطيل المدير الوحيد في النظام" });
      return;
    }
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (displayName !== undefined) updates.displayName = displayName.trim();
  if (role !== undefined && USER_ROLES.includes(role as any)) updates.role = role as any;
  if (permissions !== undefined) {
    updates.permissions = Array.isArray(permissions) ? permissions : [];
    console.log(`[PATCH /users/${id}] saving permissions:`, JSON.stringify(updates.permissions));
  }
  if (avatar !== undefined) updates.avatar = avatar ?? null;
  if (isActive !== undefined) updates.isActive = isActive;
  if (showProfileLink !== undefined) updates.showProfileLink = showProfileLink;
  if (password) {
    if (password.length < 6) { res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return; }
    updates.passwordHash = await hashPassword(password);
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, id));

  // ── sync employee_profile المرتبط بنفس الـ userId ──
  const profileUpdates: Record<string, any> = {};
  if (displayName !== undefined) profileUpdates.displayName = displayName.trim();
  if (avatar !== undefined) profileUpdates.avatar = avatar ?? null;
  if (jobTitle !== undefined) profileUpdates.jobTitle = jobTitle ?? null;
  if (department !== undefined) profileUpdates.department = department ?? null;
  if (Object.keys(profileUpdates).length > 0) {
    await db.update(employeeProfilesTable)
      .set(profileUpdates)
      .where(eq(employeeProfilesTable.userId, id));
  }
  const [updated] = await db.select({
    id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
    role: usersTable.role, permissions: usersTable.permissions, isActive: usersTable.isActive,
    createdAt: usersTable.createdAt, updatedAt: usersTable.updatedAt,
  }).from(usersTable).where(eq(usersTable.id, id));

  await logAudit({
    action: "update", entityType: "user", entityId: id, entityName: updated.displayName,
    before: { role: existing.role, isActive: existing.isActive, displayName: existing.displayName },
    after: { role: updated.role, isActive: updated.isActive, displayName: updated.displayName },
    userId: req.user!.id, userName: req.user!.displayName,
  });

  res.json({ ...updated, permissions: parsePermissions(updated.permissions) });
});

// DELETE /users/:id
router.delete("/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: "لا يمكنك حذف حسابك الخاص" });
    return;
  }
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

  // تأكد إن الـ admin بيحذف فقط users من نفس الـ tenant
  const deleterTenantId = getTenantId(req);
  const isSuperAdminDeleter = req.user?.role === "super_admin";
  if (!isSuperAdminDeleter && deleterTenantId !== null && existing.tenantId !== deleterTenantId) {
    res.status(403).json({ error: "ليس لديك صلاحية حذف هذا المستخدم" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));

  await logAudit({
    action: "delete", entityType: "user", entityId: id, entityName: existing.displayName,
    before: { username: existing.username, role: existing.role },
    userId: req.user!.id, userName: req.user!.displayName,
  });

  res.status(204).send();
});

export default router;
