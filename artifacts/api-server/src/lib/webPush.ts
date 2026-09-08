import webpush from "web-push";
import { db, pushSubscriptionsTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@starkvector.com";

let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
} else {
  console.warn("[webPush] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY غير مضبوطين — إشعارات التليفون معطّلة");
}

// بعض الحسابات القديمة كانت محفوظة بـ super-admin، بينما الجديدة تستخدم
// super_admin. لازم الاتنين يستقبلوا الـ Push حتى لا يضيع تنبيه المدير العام.
const ADMIN_ROLES = ["admin", "super_admin", "super-admin"];

interface WebPushPayload {
  title: string;
  message?: string | null;
  link?: string | null;
  severity?: string;
}

// ─── بعت إشعار Web Push لكل الأدمنز/المدراء في النظام كله ───────────────────
// فشل هنا أبداً ميوقفش أي حاجة تانية — دايمًا try/catch منفصل تمامًا عن SSE
export async function sendPushToAllAdmins(payload: WebPushPayload): Promise<void> {
  if (!configured) return;
  try {
    const admins = await db.select({ id: usersTable.id }).from(usersTable)
      .where(inArray(usersTable.role, ADMIN_ROLES));
    if (admins.length === 0) return;
    const adminIds = admins.map(a => a.id);
    await sendPushToUsers(adminIds, payload);
  } catch (err) {
    console.error("[webPush] sendPushToAllAdmins failed:", err);
  }
}

// ─── بعت إشعار Web Push لمستخدم واحد بعينه (كل أجهزته المسجّلة) ─────────────
export async function sendPushToUser(userId: number, payload: WebPushPayload): Promise<void> {
  return sendPushToUsers([userId], payload);
}

async function sendPushToUsers(userIds: number[], payload: WebPushPayload): Promise<void> {
  if (!configured || userIds.length === 0) return;
  try {
    const subs = await db.select().from(pushSubscriptionsTable)
      .where(inArray(pushSubscriptionsTable.userId, userIds));
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.message || "",
      link: payload.link || "/",
      severity: payload.severity || "info",
    });

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err: any) {
        // 404/410 = الاشتراك ده مش شغال دلوقتي (المستخدم مسحه أو غيّر الصلاحية) → احذفه من الداتابيز
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id)).catch(() => {});
        } else {
          console.error("[webPush] sendNotification failed:", err?.statusCode, err?.body);
        }
      }
    }));
  } catch (err) {
    console.error("[webPush] sendPushToUsers failed:", err);
  }
}

export function getVapidPublicKey(): string | undefined {
  return VAPID_PUBLIC_KEY;
}
