import type { Response } from "express";
import { db, notificationsTable, type NotificationType, type NotificationSeverity } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";

// ─── SSE: مخزن اتصالات المستخدمين مرتبة بـ tenantId (null = مستخدم بدون tenant) ──
const notifSseClients = new Map<string, Set<Response>>();
// ─── SSE: مخزن اتصالات مرتبة بـ userId — للإشعارات الموجّهة لمستخدم بعينه (زي العميل) ──
const notifSseClientsByUser = new Map<number, Set<Response>>();
// ─── SSE: مخزن اتصالات كل الأدمنز (admin/super_admin) بغض النظر عن الـ tenant ──
// الإشعارات العامة (زي "شحنة جديدة من العميل") المفروض توصل لأي أدمن في النظام كله
const notifSseAdminClients = new Set<Response>();

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

function tenantKey(tenantId: number | null | undefined): string {
  return tenantId == null ? "global" : String(tenantId);
}

export function registerNotifSseClient(
  tenantId: number | null | undefined,
  res: Response,
  userId?: number | null,
  role?: string | null,
): () => void {
  const key = tenantKey(tenantId);
  if (!notifSseClients.has(key)) notifSseClients.set(key, new Set());
  notifSseClients.get(key)!.add(res);

  if (userId != null) {
    if (!notifSseClientsByUser.has(userId)) notifSseClientsByUser.set(userId, new Set());
    notifSseClientsByUser.get(userId)!.add(res);
  }

  const isAdmin = role != null && ADMIN_ROLES.has(role);
  if (isAdmin) notifSseAdminClients.add(res);

  return () => {
    notifSseClients.get(key)?.delete(res);
    if (userId != null) notifSseClientsByUser.get(userId)?.delete(res);
    if (isAdmin) notifSseAdminClients.delete(res);
  };
}

// ─── بث لكل الأدمنز في النظام كله (بغض النظر عن الـ tenant) ────────────────────
function broadcastToAllAdmins(payload: object): void {
  console.log(`[broadcastToAllAdmins] connectedAdmins=${notifSseAdminClients.size}`);
  if (notifSseAdminClients.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of notifSseAdminClients) {
    try { res.write(data); } catch (_) { /* cleaned up on close */ }
  }
}

function sendToUser(userId: number, payload: object): void {
  const clients = notifSseClientsByUser.get(userId);
  if (!clients || clients.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch (_) { /* cleaned up on close */ }
  }
}

interface CreateNotificationOptions {
  tenantId?: number | null;
  // لو محدد، الإشعار موجّه لهذا المستخدم بعينه (مثلاً إشعار للعميل نفسه) — غير كده بيبث لكل الـ tenant
  targetUserId?: number | null;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: number;
  link?: string;
}

// ─── إنشاء إشعار + بثه فورًا (للعميل الموجّه له، أو لكل الأدمنز في النظام) ──────
export async function pushNotification(opts: CreateNotificationOptions): Promise<void> {
  try {
    console.log("[pushNotification] creating:", { tenantId: opts.tenantId, targetUserId: opts.targetUserId, type: opts.type });
    const [result] = await db.insert(notificationsTable).values({
      tenantId: opts.tenantId ?? null,
      targetUserId: opts.targetUserId ?? null,
      type: opts.type,
      severity: opts.severity ?? "info",
      title: opts.title,
      message: opts.message ?? null,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      link: opts.link ?? null,
      isRead: false,
      readBy: [],
    });
    const insertId = (result as any).insertId as number;
    const payload = {
      id: insertId,
      tenantId: opts.tenantId ?? null,
      targetUserId: opts.targetUserId ?? null,
      type: opts.type,
      severity: opts.severity ?? "info",
      title: opts.title,
      message: opts.message ?? null,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      link: opts.link ?? null,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    // لو الإشعار موجّه لمستخدم بعينه، ابعته له بس — غير كده يوصل لكل الأدمنز في النظام كله
    if (opts.targetUserId != null) {
      sendToUser(opts.targetUserId, payload);
    } else {
      broadcastToAllAdmins(payload);
    }
  } catch (err) {
    // فشل الإشعار مايوقفش العملية الأساسية أبداً
    console.error("pushNotification failed:", err);
  }
}
