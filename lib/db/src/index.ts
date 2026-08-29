import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// ── إعدادات الـ connection pool ──────────────────────────────────────────────
// افتراضياً mysql2 بيستخدم connectionLimit = 10 فقط، ده قليل جداً لو فيه
// تزامن حقيقي (عدة يوزرز بيفتحوا الداشبورد في نفس الوقت + عدة PM2 instances).
// القيم دي قابلة للتعديل عبر متغيرات البيئة من غير الحاجة لتعديل الكود.
export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  // ملحوظة (تحديث 2026-08-29): starkvector-api بقى شغال cluster mode بـ 2
  // instances (كان fork instance واحد) — كل instance عنده pool منفصل خاص بيه،
  // فالـ connectionLimit هنا هو *لكل instance*، مش إجمالي. مع caprina-api
  // (instance واحد) شغالة على نفس الجهاز وبتشارك نفس max_connections = 151
  // على مستوى المايسكول، الإجمالي التقريبي = (هنا × 2 لـ stark) + caprina.
  // قللنا الـ default هنا من 10 لـ 8 لكل instance عشان الإجمالي (8×2 + 10 ≈ 26)
  // يفضل بعيد عن الحد الأقصى ويسيب هامش لـ phpMyAdmin/backups/cron.
  connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 8),
  waitForConnections: true,   // الطلب يستنى في الطابور بدل ما يفشل فوراً لو كل الاتصالات مشغولة
  queueLimit: 0,               // 0 = طابور غير محدود (أفضل من رفض الطلب فجأة)
  enableKeepAlive: true,       // يمنع قطع الاتصال الخامل مع MariaDB/Hostinger
  keepAliveInitialDelay: 10_000,
  connectTimeout: 10_000,      // 10 ثواني كحد أقصى لمحاولة الاتصال بدل ما يعلّق للأبد
});
export const db = drizzle(pool, { schema, mode: "default" });

export * from "./schema";
