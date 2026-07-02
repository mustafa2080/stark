import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { desc, eq, and, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { verifyToken } from "../lib/auth.js";
import { registerNotifSseClient } from "../lib/notifications.js";

const router: IRouter = Router();

// ─── GET /notifications/sse — لازم قبل requireAuth لأن EventSource مش بيبعت header ─
router.get("/notifications/sse", (req: Request, res: Response): void => {
  const rawToken = (req.query.token as string) || (req.headers.authorization?.replace("Bearer ", "") ?? "");
  if (!rawToken) { res.status(401).json({ error: "غير مصرح" }); return; }
  const user = verifyToken(rawToken) as any;
  if (!user) { res.status(401).json({ error: "انتهت الجلسة" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const unregister = registerNotifSseClient(user.tenantId ?? null, res);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch (_) { cleanup(); }
  }, 25000);

  function cleanup() {
    clearInterval(heartbeat);
    unregister();
  }

  req.on("close", cleanup);
  req.on("error", cleanup);
});

export default router;

// ─── Protected routes (need requireAuth applied by caller router group) ──────
export const notificationsProtectedRouter: IRouter = Router();

// GET /notifications — آخر الإشعارات (افتراضي 30)
notificationsProtectedRouter.get("/notifications", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const tenantId = user?.tenantId ?? null;
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const rows = tenantId == null
    ? await db.select().from(notificationsTable).where(sql`${notificationsTable.tenantId} IS NULL`).orderBy(desc(notificationsTable.createdAt)).limit(limit)
    : await db.select().from(notificationsTable).where(eq(notificationsTable.tenantId, tenantId)).orderBy(desc(notificationsTable.createdAt)).limit(limit);
  res.json({ notifications: rows });
});

// GET /notifications/unread-count
notificationsProtectedRouter.get("/notifications/unread-count", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const tenantId = user?.tenantId ?? null;
  const cond = tenantId == null
    ? and(sql`${notificationsTable.tenantId} IS NULL`, eq(notificationsTable.isRead, false))
    : and(eq(notificationsTable.tenantId, tenantId), eq(notificationsTable.isRead, false));
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(notificationsTable).where(cond);
  res.json({ count: Number(row?.count ?? 0) });
});

// PATCH /notifications/:id/read
notificationsProtectedRouter.patch("/notifications/:id/read", async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, id));
  res.json({ success: true });
});

// PATCH /notifications/read-all
notificationsProtectedRouter.patch("/notifications/read-all", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const tenantId = user?.tenantId ?? null;
  const cond = tenantId == null
    ? sql`${notificationsTable.tenantId} IS NULL`
    : eq(notificationsTable.tenantId, tenantId);
  await db.update(notificationsTable).set({ isRead: true }).where(cond);
  res.json({ success: true });
});
