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
  // ملحوظة: السيرفر (2 CPU cores) بيشغّل starkvector-api و caprina-api مع
  // بعض على نفس الجهاز، وكلاهما بيشارك نفس max_connections = 151 على مستوى
  // المايسكول. بنفضّل fork mode بـ instance واحد (مش cluster) عشان مفيش
  // core فاضي أصلاً، وconnectionLimit متحفظ عشان نسيب هامش لـ caprina وأي
  // اتصالات تانية (phpMyAdmin, backups, cron).
  connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 10),
  waitForConnections: true,   // الطلب يستنى في الطابور بدل ما يفشل فوراً لو كل الاتصالات مشغولة
  queueLimit: 0,               // 0 = طابور غير محدود (أفضل من رفض الطلب فجأة)
  enableKeepAlive: true,       // يمنع قطع الاتصال الخامل مع MariaDB/Hostinger
  keepAliveInitialDelay: 10_000,
  connectTimeout: 10_000,      // 10 ثواني كحد أقصى لمحاولة الاتصال بدل ما يعلّق للأبد
});
export const db = drizzle(pool, { schema, mode: "default" });

export * from "./schema";
