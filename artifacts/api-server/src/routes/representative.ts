import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc, isNull, count, sql } from "drizzle-orm";
import { db, shipmentsTable, shippingCompaniesTable, usersTable, shipmentZonesTable, auditLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── Block PATCH/POST/DELETE for representatives ──────────────────────────────
function blockRepresentativeWrites(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (user?.role === "representative" && ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    res.status(403).json({ error: "المندوب لا يملك صلاحية التعديل" });
    return;
  }
  next();
}
router.use(blockRepresentativeWrites);

// ─── Only representatives and admins ─────────────────────────────────────────
function requireRepresentativeOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "غير مصرح" }); return; }
  const allowed = ["representative", "admin", "super_admin", "super-admin"];
  if (!allowed.includes(user.role)) {
    res.status(403).json({ error: "غير مصرح — هذه الصفحة للمناديب فقط" });
    return;
  }
  next();
}

// ─── GET /representative/me ───────────────────────────────────────────────────
router.get("/me", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (user.role === "representative" && !user.shippingCompanyId) {
    res.status(400).json({ error: "المندوب غير مرتبط بشركة شحن" });
    return;
  }
  const companyId = user.shippingCompanyId ?? null;
  let company = null;
  if (companyId) {
    const [c] = await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, companyId)).limit(1);
    company = c ?? null;
  }
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  const { passwordHash: _, ...safeUser } = dbUser as any;
  res.json({ user: safeUser, company });
});

// ─── GET /representative/shipments ───────────────────────────────────────────
router.get("/shipments", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const companyId = user.role === "representative"
    ? user.shippingCompanyId
    : req.query.companyId ? parseInt(req.query.companyId as string) : null;
  if (!companyId) { res.status(400).json({ error: "companyId مطلوب" }); return; }

  const page     = Math.max(1, parseInt((req.query.page as string) ?? "1"));
  const limit    = Math.min(100, parseInt((req.query.limit as string) ?? "50"));
  const offset   = (page - 1) * limit;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo   = req.query.dateTo as string | undefined;
  const status   = req.query.status as string | undefined;

  const conditions: any[] = [eq(shipmentsTable.shippingCompanyId, companyId), isNull(shipmentsTable.deletedAt)];
  if (dateFrom) conditions.push(sql`${shipmentsTable.createdAt} >= ${new Date(dateFrom)}`);
  if (dateTo)   conditions.push(sql`${shipmentsTable.createdAt} <= ${new Date(dateTo + "T23:59:59")}`);
  if (status)   conditions.push(eq(shipmentsTable.status, status));
  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db.select({
      id: shipmentsTable.id, shipmentNumber: shipmentsTable.shipmentNumber,
      trackingNumber: shipmentsTable.trackingNumber, receiverName: shipmentsTable.receiverName,
      receiverPhone: shipmentsTable.receiverPhone, receiverCity: shipmentsTable.receiverCity,
      status: shipmentsTable.status, codAmount: shipmentsTable.codAmount,
      createdAt: shipmentsTable.createdAt, actualDelivery: shipmentsTable.actualDelivery,
      returnReason: shipmentsTable.returnReason, zoneName: shipmentZonesTable.name,
    })
      .from(shipmentsTable)
      .leftJoin(shipmentZonesTable, eq(shipmentsTable.zoneId, shipmentZonesTable.id))
      .where(where).orderBy(desc(shipmentsTable.createdAt)).limit(limit).offset(offset),
    db.select({ cnt: count() }).from(shipmentsTable).where(where).then(r => r[0]?.cnt ?? 0),
  ]);

  await logAudit({ action: "login", entityType: "representative_view", entityId: companyId,
    entityName: `shipments-page=${page}`, userId: user.id, userName: user.displayName });

  res.json({ data: rows, total: Number(totalRows), page, limit });
});

// ─── GET /representative/dashboard ───────────────────────────────────────────
router.get("/dashboard", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const companyId = user.role === "representative"
    ? user.shippingCompanyId
    : req.query.companyId ? parseInt(req.query.companyId as string) : null;
  if (!companyId) { res.status(400).json({ error: "companyId مطلوب" }); return; }

  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo   = req.query.dateTo as string | undefined;
  const conditions: any[] = [eq(shipmentsTable.shippingCompanyId, companyId), isNull(shipmentsTable.deletedAt)];
  if (dateFrom) conditions.push(sql`${shipmentsTable.createdAt} >= ${new Date(dateFrom)}`);
  if (dateTo)   conditions.push(sql`${shipmentsTable.createdAt} <= ${new Date(dateTo + "T23:59:59")}`);

  const all = await db.select({
    status: shipmentsTable.status, receiverCity: shipmentsTable.receiverCity,
    zoneName: shipmentZonesTable.name, codAmount: shipmentsTable.codAmount,
  })
    .from(shipmentsTable)
    .leftJoin(shipmentZonesTable, eq(shipmentsTable.zoneId, shipmentZonesTable.id))
    .where(and(...conditions));

  const total      = all.length;
  const delivered  = all.filter(s => s.status === "delivered").length;
  const partial    = all.filter(s => s.status === "partial_received").length;
  const returned   = all.filter(s => s.status === "returned").length;
  const inProgress = all.filter(s => !["delivered","returned","cancelled","partial_received"].includes(s.status)).length;
  const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;
  const returnRate   = total > 0 ? Math.round((returned / total) * 100) : 0;
  const totalCollected = all.filter(s => s.status === "delivered").reduce((sum, s) => sum + Number(s.codAmount ?? 0), 0);

  const zoneMap = new Map<string, number>();
  for (const s of all) {
    const zone = s.zoneName || s.receiverCity || "غير محدد";
    zoneMap.set(zone, (zoneMap.get(zone) ?? 0) + 1);
  }
  const zones = Array.from(zoneMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const [lastLogin] = await db.select({ createdAt: auditLogsTable.createdAt })
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.userId, user.id), eq(auditLogsTable.action, "login")))
    .orderBy(desc(auditLogsTable.createdAt)).limit(1);

  res.json({ total, delivered, partial, returned, inProgress, deliveryRate, returnRate,
    totalCollected, zones, topZone: zones[0] ?? null, lastLogin: lastLogin?.createdAt ?? null });
});

// ─── GET /representative/admin/representatives — قائمة المناديب للأدمن ────────
router.get("/admin/representatives", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (!["admin", "super_admin", "super-admin"].includes(user.role)) { res.status(403).json({ error: "غير مصرح" }); return; }

  const reps = await db.select({
    id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
    isActive: usersTable.isActive, shippingCompanyId: (usersTable as any).shippingCompanyId,
    updatedAt: usersTable.updatedAt, avatar: usersTable.avatar,
  })
    .from(usersTable)
    .where(and(
      eq(usersTable.role, "representative"),
      user.tenantId ? eq(usersTable.tenantId, user.tenantId) : sql`1=1`,
    ));

  const result = await Promise.all(reps.map(async (rep) => {
    const companyId = rep.shippingCompanyId;
    if (!companyId) return { ...rep, company: null, stats: null, lastLogin: null };
    const [company] = await db.select({ id: shippingCompaniesTable.id, name: shippingCompaniesTable.name })
      .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, companyId)).limit(1);
    const all = await db.select({ status: shipmentsTable.status })
      .from(shipmentsTable).where(and(eq(shipmentsTable.shippingCompanyId, companyId), isNull(shipmentsTable.deletedAt)));
    const total = all.length;
    const delivered = all.filter(s => s.status === "delivered").length;
    const partial   = all.filter(s => s.status === "partial_received").length;
    const returned  = all.filter(s => s.status === "returned").length;
    const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;
    const returnRate   = total > 0 ? Math.round((returned / total) * 100) : 0;
    const [lastLoginRow] = await db.select({ createdAt: auditLogsTable.createdAt })
      .from(auditLogsTable).where(and(eq(auditLogsTable.userId, rep.id), eq(auditLogsTable.action, "login")))
      .orderBy(desc(auditLogsTable.createdAt)).limit(1);
    return { ...rep, company: company ?? null,
      stats: { total, delivered, partial, returned, deliveryRate, returnRate, highReturnRisk: returnRate > 30 },
      lastLogin: lastLoginRow?.createdAt ?? null };
  }));
  res.json(result);
});

// ─── GET /representative/admin/representatives/:id/audit ─────────────────────
router.get("/admin/representatives/:id/audit", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (!["admin", "super_admin", "super-admin"].includes(user.role)) { res.status(403).json({ error: "غير مصرح" }); return; }
  const repId = parseInt(req.params.id);
  if (isNaN(repId)) { res.status(400).json({ error: "ID غير صحيح" }); return; }
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1"));
  const limit = 50; const offset = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    db.select().from(auditLogsTable).where(eq(auditLogsTable.userId, repId))
      .orderBy(desc(auditLogsTable.createdAt)).limit(limit).offset(offset),
    db.select({ cnt: count() }).from(auditLogsTable).where(eq(auditLogsTable.userId, repId)).then(r => Number(r[0]?.cnt ?? 0)),
  ]);
  res.json({ data: logs, total, page, limit });
});

export default router;
