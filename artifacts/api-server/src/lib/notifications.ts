import type { Response } from "express";
import { db, notificationsTable, type NotificationType, type NotificationSeverity } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";

// ─── SSE: مخزن اتصالات المستخدمين مرتبة بـ tenantId (null = مستخدم بدون tenant) ──
const notifSseClients = new Map<string, Set<Response>>();

function tenantKey(tenantId: number | null | undefined): string {
  return tenantId == null ? "global" : String(tenantId);
}

export function registerNotifSseClient(tenantId: number | null | undefined, res: Response): () => void {
  const key = tenantKey(tenantId);
  if (!notifSseClients.has(key)) notifSseClients.set(key, new Set());
  notifSseClients.get(key)!.add(res);
  return () => {
    notifSseClients.get(key)?.delete(res);
  };
}

function broadcastToTenant(tenantId: number | null | undefined, payload: object): void {
  const key = tenantKey(tenantId);
  const clients = notifSseClients.get(key);
  if (!clients || clients.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch (_) { /* cleaned up on close */ }
  }
}

interface CreateNotificationOptions {
  tenantId?: number | null;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: number;
  link?: string;
}

// ─── إنشاء إشعار + بثه فورًا لكل المتصلين على نفس الـ tenant ──────────────────
export async function pushNotification(opts: CreateNotificationOptions): Promise<void> {
  try {
    const [result] = await db.insert(notificationsTable).values({
      tenantId: opts.tenantId ?? null,
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
    broadcastToTenant(opts.tenantId ?? null, {
      id: insertId,
      tenantId: opts.tenantId ?? null,
      type: opts.type,
      severity: opts.severity ?? "info",
      title: opts.title,
      message: opts.message ?? null,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      link: opts.link ?? null,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // فشل الإشعار مايوقفش العملية الأساسية أبداً
    console.error("pushNotification failed:", err);
  }
}
