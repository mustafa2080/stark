import type { Request, Response, NextFunction } from "express";
import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * checkSubscription — middleware يتحقق من صلاحية اشتراك الـ tenant
 *
 * الترتيب:
 * 1. super_admin → يعدي مباشرة بدون أي فحص
 * 2. يجيب الـ tenant من DB
 * 3. لو status = active أو grace → يكمل
 * 4. لو expired أو suspended → 403
 */
export async function checkSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;

  // ── 1. Super Admin Bypass ─────────────────────────────────────────────────
  if (user?.role === "super_admin" || user?.role === "super-admin") {
    next();
    return;
  }

  // ── 2. لو مفيش tenantId → bypass (نظام قديم بدون multi-tenant)
  if (!user?.tenantId) {
    next();
    return;
  }

  // ── 3. جيب الـ tenant من DB ───────────────────────────────────────────────
  let tenant;
  try {
    [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);
  } catch {
    res.status(500).json({ error: "subscription_check_failed", message: "فشل التحقق من الاشتراك" });
    return;
  }

  if (!tenant) {
    // tenant مش موجود في DB — bypass (single-tenant أو dev mode)
    next();
    return;
  }

  if (!tenant.isActive) {
    res.status(403).json({
      error: "tenant_not_found",
      message: "الاشتراك غير موجود — تواصل مع الإدارة",
    });
    return;
  }

  // ── 4. فحص الـ status ────────────────────────────────────────────────────
  const now = new Date();

  if (tenant.planStatus === "active") {
    // تأكد إن expires_at لسه ما فاتش (احتياط)
    if (tenant.expiresAt > now) {
      next();
      return;
    }
    // فات بدون cron — عامله expired
  }

  if (tenant.planStatus === "grace" && tenant.graceUntil && tenant.graceUntil > now) {
    // لسه في فترة السماح
    res.setHeader("X-Subscription-Warning", "grace_period");
    next();
    return;
  }

  // ── 5. الاشتراك منتهي أو موقوف ────────────────────────────────────────────
  const expiresAtStr = tenant.expiresAt.toLocaleDateString("ar-EG");
  res.status(403).json({
    error: "subscription_expired",
    message:
      tenant.planStatus === "suspended"
        ? "تم إيقاف اشتراكك — تواصل مع الإدارة"
        : `انتهى اشتراكك في ${expiresAtStr} — يرجى التجديد للمتابعة`,
    planStatus: tenant.planStatus,
    expiresAt:  tenant.expiresAt,
  });
}
