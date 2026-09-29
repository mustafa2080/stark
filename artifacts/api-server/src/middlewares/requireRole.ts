import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@workspace/db";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    // super_admin له كل الصلاحيات دايماً
    if (user.role === "super_admin") {
      next();
      return;
    }
    if (!roles.includes(user.role as UserRole)) {
      res.status(403).json({ error: "ليس لديك صلاحية لهذه العملية" });
      return;
    }
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    res.status(403).json({ error: "هذه العملية تتطلب صلاحية المدير" });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user || user.role !== "super_admin") {
    res.status(403).json({ error: "هذه العملية متاحة للسوبر أدمن فقط" });
    return;
  }
  next();
}

export function isAdmin(req: Request): boolean {
  return req.user?.role === "admin" || req.user?.role === "super_admin";
}

// يسمح للمدير دايماً، أو لأي يوزر عنده الـ permission المحدد
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    if (user.role === "admin" || user.role === "super_admin") {
      next();
      return;
    }
    const perms: string[] = Array.isArray((user as any).permissions) ? (user as any).permissions : [];
    if (perms.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({ error: "ليس لديك صلاحية لهذه العملية" });
  };
}

// ── صلاحيات تفصيلية بقراءة طازة من الداتابيز ────────────────────────────────────
// الـ JWT عمره 7 أيام، فلو اتشالت صلاحية من يوزر لازم تتطبق فورًا على الـ API مش بعد ما يسجّل دخول تاني.
// المنطق مطابق لـ can() في AuthContext (الفرونت):
//  • "*" → كل الصلاحيات.
//  • صلاحيات فاضية ومفيش "__customized__" → مستخدم قديم: الأدمن بس ليه الافتراضي الكامل.
//  • غير كده → لازم المفتاح يكون موجود بالظبط (حتى للأدمن). الـ super_admin بس هو اللي بيتجاوز.
export type PermissionChecker = (key: string) => boolean;

function flattenPerms(raw: unknown): string[] {
  let parsed: any = raw;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  const flat: string[] = [];
  for (const item of parsed) {
    if (typeof item === "string") flat.push(item);
    else if (Array.isArray(item)) for (const sub of item) if (typeof sub === "string") flat.push(sub);
  }
  return [...new Set(flat)];
}

export async function loadPermissionChecker(req: Request): Promise<PermissionChecker | null> {
  const tokenUser = req.user;
  if (!tokenUser) return null;
  if (tokenUser.role === "super_admin") return () => true;

  const [row] = await db
    .select({ role: usersTable.role, permissions: usersTable.permissions, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.id, tokenUser.id))
    .limit(1);
  if (!row || row.isActive === false) return null;
  if (row.role === "super_admin") return () => true;

  const raw = flattenPerms(row.permissions);
  if (raw.includes("*")) return () => true;

  const customized = raw.includes("__customized__");
  const real = raw.filter(p => p !== "__customized__" && !p.startsWith("__rolename__"));

  if (!customized && real.length === 0) {
    // مستخدم قديم بدون صلاحيات محددة → الأدمن بس يعدّي
    return () => row.role === "admin";
  }
  const set = new Set(real);
  return (key: string) => set.has(key);
}

/** بيسمح لو اليوزر عنده أي واحدة من الصلاحيات المذكورة (قراءة طازة من الداتابيز) — بيحط الـ checker في res.locals.can */
export function requireFreshPermission(...keys: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    try {
      const can = await loadPermissionChecker(req);
      if (!can || !keys.some(k => can(k))) {
        res.status(403).json({ error: "ليس لديك صلاحية لهذه العملية" });
        return;
      }
      res.locals.can = can;
      next();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}
