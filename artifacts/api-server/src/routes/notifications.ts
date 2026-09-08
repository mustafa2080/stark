import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { desc, eq, and, sql } from "drizzle-orm";
import { db, notificationsTable, pushSubscriptionsTable } from "@workspace/db";
import { verifyToken } from "../lib/auth.js";
import { registerNotifSseClient } from "../lib/notifications.js";
import { getVapidPublicKey, isWebPushConfigured, sendPushToUser } from "../lib/webPush.js";

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

  const unregister = registerNotifSseClient(user.tenantId ?? null, res, user.id ?? null, user.role ?? null);

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

const ADMIN_ROLES = new Set(["admin", "super_admin", "super-admin"]);

// GET /notifications — آخر الإشعارات (افتراضي 30)
// الأدمن (admin/super_admin) يشوف كل الإشعارات العامة في النظام كله بغض النظر عن الـ tenant
// أي دور تاني (عميل، مندوب، إلخ) يشوف بس الإشعارات الموجّهة له شخصياً — مش إشعارات التينانت العامة
// (الإشعارات العامة زي "شحنة جديدة"/"عميل جديد" مُخصَّصة للأدمن فقط، حتى لو كانت tenantId نفسه)
notificationsProtectedRouter.get("/notifications", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const tenantId = user?.tenantId ?? null;
  const userId = user?.id ?? null;
  const isAdmin = ADMIN_ROLES.has(user?.role);
  const limit = Math.min(Number(req.query.limit) || 30, 100);

  const tenantCond = isAdmin
    ? sql`${notificationsTable.targetUserId} IS NULL`
    : sql`${notificationsTable.targetUserId} = ${userId}`;

  const rows = await db.select().from(notificationsTable).where(tenantCond).orderBy(desc(notificationsTable.createdAt)).limit(limit);
  res.json({ notifications: rows });
});

// GET /notifications/unread-count
notificationsProtectedRouter.get("/notifications/unread-count", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const tenantId = user?.tenantId ?? null;
  const userId = user?.id ?? null;
  const isAdmin = ADMIN_ROLES.has(user?.role);

  const tenantCond = isAdmin
    ? sql`${notificationsTable.targetUserId} IS NULL`
    : sql`${notificationsTable.targetUserId} = ${userId}`;

  const [row] = await db.select({ count: sql<number>`count(*)` }).from(notificationsTable)
    .where(and(tenantCond, eq(notificationsTable.isRead, false)));
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
  const userId = user?.id ?? null;
  const isAdmin = ADMIN_ROLES.has(user?.role);
  const cond = isAdmin
    ? sql`${notificationsTable.targetUserId} IS NULL`
    : sql`${notificationsTable.targetUserId} = ${userId}`;
  await db.update(notificationsTable).set({ isRead: true }).where(cond);
  res.json({ success: true });
});

// GET /notifications/push/vapid-key — المفتاح العام اللي الفرونت محتاجه يسجل بيه subscription
notificationsProtectedRouter.get("/notifications/push/vapid-key", (_req: Request, res: Response): void => {
  const key = getVapidPublicKey();
  if (!key) { res.status(503).json({ error: "إشعارات التليفون غير مفعّلة حالياً" }); return; }
  res.json({ publicKey: key });
});

// POST /notifications/push/subscribe — تسجيل جهاز جديد (أو تحديثه لو الـ endpoint موجود)
notificationsProtectedRouter.post("/notifications/push/subscribe", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const userId = user?.id ?? null;
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) { res.status(400).json({ error: "بيانات الاشتراك غير مكتملة" }); return; }

  const existing = await db.select({ id: pushSubscriptionsTable.id }).from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint)).limit(1);

  if (existing.length > 0) {
    await db.update(pushSubscriptionsTable)
      .set({ userId, p256dh: keys.p256dh, auth: keys.auth })
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));
  } else {
    await db.insert(pushSubscriptionsTable).values({
      userId, endpoint, p256dh: keys.p256dh, auth: keys.auth,
    });
  }
  res.json({ success: true });
});

// POST /notifications/push/test — اختبار حقيقي يصل للجهاز نفسه حتى لو الـPWA مقفول.
// متاح للأدمن فقط ولا ينشئ سجلاً في جدول الإشعارات.
notificationsProtectedRouter.post("/notifications/push/test", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (!user?.id) { res.status(401).json({ error: "غير مصرح" }); return; }
  if (!ADMIN_ROLES.has(user.role)) { res.status(403).json({ error: "اختبار إشعارات النظام متاح للأدمن فقط" }); return; }
  if (!isWebPushConfigured()) { res.status(503).json({ error: "مفاتيح إشعارات النظام غير مضبوطة على السيرفر" }); return; }

  const subscriptions = await db.select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, user.id)).limit(1);
  if (subscriptions.length === 0) { res.status(409).json({ error: "هذا الجهاز غير مشترك في إشعارات النظام بعد" }); return; }

  await sendPushToUser(user.id, {
    title: "اختبار إشعارات STARK",
    message: "تم إرسال إشعار النظام بنجاح إلى هذا الجهاز.",
    link: "/profile",
    severity: "success",
  });
  res.json({ success: true });
});

// DELETE /notifications/push/subscribe — إلغاء تسجيل جهاز (لما المستخدم يوقف الإشعارات)
notificationsProtectedRouter.delete("/notifications/push/subscribe", async (req: Request, res: Response): Promise<void> => {
  const { endpoint } = req.body || {};
  if (!endpoint) { res.status(400).json({ error: "endpoint مطلوب" }); return; }
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
  res.json({ success: true });
});
