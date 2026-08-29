import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startSubscriptionCron } from "./lib/subscriptionCron.js";
import { startReconciliationCron } from "./lib/reconcileCron.js";
import { db, usersTable, shipmentsTable } from "@workspace/db";
import { hashPassword } from "./lib/auth.js";
import { eq, sql, or, and, isNull, desc, like } from "drizzle-orm";

import crypto from "node:crypto";

const app: Express = express();

// ─── Trust proxy (for Apache reverse proxy) ──────────────────────────────────
app.set("trust proxy", 1);

// ─── Security: Helmet (sets secure HTTP headers) ────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ─── Security: CORS — restrict to ALLOWED_ORIGINS env var ───────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ─── Security: Global rate limiter ──────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جداً، يرجى المحاولة بعد قليل" },
  skip: (req) => {
    // مش بنحسب polling endpoints أو login في الـ global rate limit
    const url = req.url || "";
    return (
      url.includes("/auth/me") ||
      url.includes("/brand") ||
      url.includes("/auth/login")
    );
  },
});
app.use(globalLimiter);

// ─── Logging ─────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ─── Public tracking endpoint — NO auth, registered before router ────────────
// Rate limit صارم مخصص للتتبع العام (بدون تسجيل دخول) — عشان محدش يقدر يستخدمه
// في حصاد بيانات (scraping) أو تخمين أرقام شحنات بالقوة الغاشمة.
const publicTrackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جداً، يرجى المحاولة بعد دقيقة" },
});
app.get("/api/shipments/track/:number", publicTrackLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { number } = req.params;
    const trackNumber = Array.isArray(number) ? number[0] : number;
    const rows = await db
      .select()
      .from(shipmentsTable)
      .where(
        and(
          isNull(shipmentsTable.deletedAt),
          or(
            eq(shipmentsTable.trackingNumber, trackNumber),
            eq(shipmentsTable.shipmentNumber,  trackNumber),
          )
        )
      )
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(1);
    if (!rows.length) { res.status(404).json({ error: "لم يتم العثور على الشحنة" }); return; }
    res.set("Cache-Control", "no-store");
    res.json(rows[0]);
  } catch (e) {
    console.error("[GET /api/shipments/track]", e);
    res.status(500).json({ error: "خطأ في البحث" });
  }
});

app.use("/api", router);

// ─── Public track-by-client endpoint ─────────────────────────────────────────
app.get("/api/shipments/track-by-client", publicTrackLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const name  = (req.query.name  as string | undefined)?.trim();
    const phone = (req.query.phone as string | undefined)?.trim();
    if (!name || !phone) { res.status(400).json({ error: "يرجى إدخال اسم العميل ورقم الهاتف" }); return; }
    const rows = await db
      .select()
      .from(shipmentsTable)
      .where(
        and(
          isNull(shipmentsTable.deletedAt),
          like(shipmentsTable.senderName, `%${name}%`),
          or(
            eq(shipmentsTable.senderPhone,  phone),
            eq(shipmentsTable.senderPhone2, phone),
          )
        )
      )
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(20);
    if (!rows.length) { res.status(404).json({ error: "لم يتم العثور على شحنات لهذا العميل" }); return; }
    res.set("Cache-Control", "no-store");
    res.json(rows);
  } catch (e) {
    console.error("[GET /api/shipments/track-by-client]", e);
    res.status(500).json({ error: "خطأ في البحث" });
  }
});

// ─── Global JSON error handler (must be AFTER routes) ────────────────────────
// Ensures all unhandled errors return JSON instead of an HTML error page.
import type { Request, Response, NextFunction } from "express";
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[global error handler]", err);
  res.status(err.status ?? 500).json({
    error: err.message ?? "حدث خطأ غير متوقع",
  });
});

// ─── Seed default admin on startup ───────────────────────────────────────────
// Generates a strong random password on first run and logs it ONCE.
// Change this password immediately after first login.
async function seedDefaultAdmin() {
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (existing.length > 0) return;

    // Generate a secure random password instead of a hardcoded one
    const randomPassword = crypto.randomBytes(12).toString("base64url");
    const passwordHash = await hashPassword(randomPassword);

    await db.insert(usersTable).values({
      username: "admin",
      passwordHash,
      displayName: "المدير",
      role: "admin",
      permissions: [],
      isActive: true,
    });

    // Log the password clearly — change it immediately after first login
    logger.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.warn(`  DEFAULT ADMIN CREATED`);
    logger.warn(`  Username : admin`);
    logger.warn(`  Password : ${randomPassword}`);
    logger.warn(`  ⚠️  Change this password immediately after first login!`);
    logger.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (err) {
    logger.error({ err }, "Failed to seed default admin");
  }
}

// ─── Backfill: employee profile IDs + displayNames ───────────────────────────
async function backfillEmployeeProfileIds() {
  try {
    await db.execute(sql`
      UPDATE employee_profiles ep
      JOIN users u ON ep.user_id = u.id
      SET ep.display_name = u.display_name
      WHERE ep.display_name IS NULL
    `);
    await db.execute(sql`
      UPDATE employee_kpis k
      JOIN employee_profiles ep ON ep.user_id = k.user_id
      SET k.profile_id = ep.id
      WHERE k.profile_id IS NULL AND k.user_id IS NOT NULL
    `);
    await db.execute(sql`
      UPDATE employee_daily_logs l
      JOIN employee_profiles ep ON ep.user_id = l.user_id
      SET l.profile_id = ep.id
      WHERE l.profile_id IS NULL AND l.user_id IS NOT NULL
    `);
  } catch (err) {
    logger.error({ err }, "Failed to backfill employee profile IDs");
  }
}

// ⚠️ مهم (تحديث 2026-08-29): بعد الانتقال لـ PM2 cluster mode (2 instances)،
// أي كود بيتنفذ عند الـ startup هنا (seed، migrations، cron jobs) هيشتغل مرتين
// — مرة لكل instance — لو سبناه زي ما هو. ده مش خطر كبير للـ migrations نفسها
// (كلها idempotent، بتستخدم IF NOT EXISTS/Duplicate column check) لكنه:
//  (أ) بيضاعف الحمل على الداتابيز وقت كل restart من غير أي فايدة،
//  (ب) بيخلي الـ cron jobs (subscriptionCron وreconciliationCron) تشتغل مرتين
//      كل دورة — تحديثات مكررة (idempotent برضه، بس مضيعة موارد ومربكة في اللوج).
// PM2 cluster mode بيدّي كل instance متغير NODE_APP_INSTANCE (بيبدأ من "0").
// بنقصر الـ startup tasks دي على instance "0" بس، عشان تتنفذ مرة واحدة فعلياً
// بغض النظر عن عدد الـ instances.
const IS_PRIMARY_INSTANCE = (process.env.NODE_APP_INSTANCE ?? "0") === "0";

if (IS_PRIMARY_INSTANCE) {
  seedDefaultAdmin();
  backfillEmployeeProfileIds();
  startSubscriptionCron(); // ← Cron الاشتراكات
  startReconciliationCron(); // ← Cron تسوية حالات الشحنات مع البيانات (كل 10 دقايق)
} else {
  logger.info("Skipping startup tasks (seed/migrations/cron) — not primary instance");
}

// ─── Process-level error guards ──────────────────────────────────────────────
// من غيرهم أي استثناء غير متوقع بيسقط العملية كلها والسيرفر يقع لحد ما حد يعمله.
// بنسجل الخطأ ونكمل شغال — الأفضلية للتوافر، والأخطاء بتتراقب في اللوج.
process.on("uncaughtException", (err) => {
  logger.error({ err }, "UNCAUGHT_EXCEPTION — استثناء غير متوقع خارج الـ request handler");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "UNHANDLED_REJECTION — Promise مرفوض بدون catch");
});

// ─── Ensure app_settings table exists (safe for VPS without migrations) ──────
async function ensureAppSettingsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
        \`value\` LONGTEXT,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    // Migrate existing TEXT column to LONGTEXT (safe to run multiple times)
    await db.execute(sql`
      ALTER TABLE app_settings MODIFY COLUMN \`value\` LONGTEXT
    `);
    logger.info("app_settings table ensured");
  } catch (err) {
    logger.error({ err }, "Failed to ensure app_settings table");
  }
}
if (IS_PRIMARY_INSTANCE) ensureAppSettingsTable();

// ─── Ensure color_hex column exists in product_variants (safe migration) ──────
async function ensureVariantColorHex() {
  try {
    await db.execute(sql`
      ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex VARCHAR(20) NULL
    `);
    logger.info("product_variants.color_hex column ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure color_hex column");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureVariantColorHex();

// ─── Ensure invoice_number column exists in orders (safe migration) ───────────
async function ensureOrdersInvoiceNumber() {
  try {
    // MySQL 8+: ADD COLUMN IF NOT EXISTS
    await db.execute(sql`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50) NULL
    `);
    logger.info("orders.invoice_number column ensured");
  } catch (err: any) {
    // Older MySQL / already exists — ignore duplicate column errors
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure invoice_number column");
    }
  }
  try {
    await db.execute(sql`
      ALTER TABLE orders ADD INDEX idx_orders_invoice_number (invoice_number)
    `);
  } catch {
    // Index may already exist — ignore
  }
}
if (IS_PRIMARY_INSTANCE) ensureOrdersInvoiceNumber();

// ─── Ensure shipping_manifests columns exist (safe migration) ─────────────────
async function ensureShippingManifestColumns() {
  const stmts: Array<() => Promise<any>> = [
    () => db.execute(sql`ALTER TABLE shipping_manifests ADD COLUMN IF NOT EXISTS invoice_price DECIMAL(10,2) NULL`),
    () => db.execute(sql`ALTER TABLE shipping_manifests ADD COLUMN IF NOT EXISTS invoice_notes TEXT NULL`),
    () => db.execute(sql`ALTER TABLE shipping_manifests ADD COLUMN IF NOT EXISTS manual_shipping_cost DECIMAL(10,2) NULL`),
    () => db.execute(sql`ALTER TABLE shipping_manifests ADD COLUMN IF NOT EXISTS closed_at DATETIME NULL`),
  ];
  for (const fn of stmts) {
    try { await fn(); } catch (err: any) {
      if (err?.message && !err.message.includes("Duplicate column")) {
        logger.error({ err }, "ensureShippingManifestColumns failed");
      }
    }
  }
  logger.info("shipping_manifests columns ensured");
}
if (IS_PRIMARY_INSTANCE) ensureShippingManifestColumns();

// ─── Ensure shipping_companies.logo column exists ─────────────────────────────
async function ensureShippingCompanyLogo() {
  try {
    await db.execute(sql`
      ALTER TABLE shipping_companies ADD COLUMN IF NOT EXISTS logo LONGTEXT NULL
    `);
    logger.info("shipping_companies.logo column ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure shipping_companies.logo column");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureShippingCompanyLogo();

// ─── Ensure users.shipping_company_id column exists (للمندوبين) ──────────────
async function ensureUsersShippingCompanyId() {
  try {
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS shipping_company_id INT NULL
    `);
    logger.info("users.shipping_company_id column ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure users.shipping_company_id column");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureUsersShippingCompanyId();

// ─── Ensure users.default_ad_source column exists (مصدر الإعلان الافتراضي للموظف) ──
async function ensureUsersDefaultAdSource() {
  try {
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS default_ad_source VARCHAR(50) NULL
    `);
    logger.info("users.default_ad_source column ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure users.default_ad_source column");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureUsersDefaultAdSource();

// ─── Ensure clients.default_ad_source column exists (مصدر الطلب الافتراضي للعميل التجاري) ──
async function ensureClientsDefaultAdSource() {
  try {
    await db.execute(sql`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS default_ad_source VARCHAR(50) NULL
    `);
    logger.info("clients.default_ad_source column ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure clients.default_ad_source column");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureClientsDefaultAdSource();

// ─── Ensure clients.whatsapp_group_link column exists (رابط جروب واتساب العميل التجاري) ──
async function ensureClientsWhatsappGroupLink() {
  try {
    await db.execute(sql`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_group_link VARCHAR(500) NULL
    `);
    logger.info("clients.whatsapp_group_link column ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure clients.whatsapp_group_link column");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureClientsWhatsappGroupLink();

// ─── Ensure client_account_closures.client_id column exists (ربط إقفال حساب العميل التجاري) ──
async function ensureClientAccountClosuresClientId() {
  try {
    await db.execute(sql`
      ALTER TABLE client_account_closures ADD COLUMN IF NOT EXISTS client_id INT NULL
    `);
    logger.info("client_account_closures.client_id column ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure client_account_closures.client_id column");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureClientAccountClosuresClientId();

// ─── Ensure client_account_manifests.scheduled_close_at / revenue_disbursement_requested_at columns exist ──
async function ensureClientAccountManifestsScheduleColumns() {
  try {
    await db.execute(sql`
      ALTER TABLE client_account_manifests ADD COLUMN IF NOT EXISTS scheduled_close_at DATETIME NULL
    `);
    await db.execute(sql`
      ALTER TABLE client_account_manifests ADD COLUMN IF NOT EXISTS revenue_disbursement_requested_at DATETIME NULL
    `);
    logger.info("client_account_manifests.scheduled_close_at / revenue_disbursement_requested_at columns ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure client_account_manifests schedule columns");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureClientAccountManifestsScheduleColumns();

// ─── Ensure trip_settlements (تسوية الرحلات والتحصيل) tables exist ──────────
async function ensureTripSettlementTables() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trip_settlements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NULL,
        settlement_number VARCHAR(100) NOT NULL,
        title VARCHAR(255) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        notes TEXT NULL,
        previous_settlement_id INT NULL,
        total_reps_balance DECIMAL(14,2) NULL,
        total_clients_balance DECIMAL(14,2) NULL,
        net_balance DECIMAL(14,2) NULL,
        created_by_user_id INT NULL,
        created_by_name VARCHAR(255) NULL,
        closed_by_user_id INT NULL,
        closed_by_name VARCHAR(255) NULL,
        created_at DATETIME NOT NULL,
        closed_at DATETIME NULL,
        INDEX idx_ts_tenant_status (tenant_id, status)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trip_settlement_reps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        settlement_id INT NOT NULL,
        user_id INT NULL,
        rep_name VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        balance DECIMAL(14,2) NOT NULL DEFAULT 0,
        notes TEXT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        INDEX idx_tsr_settlement (settlement_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trip_settlement_rep_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rep_row_id INT NOT NULL,
        method VARCHAR(30) NOT NULL,
        amount DECIMAL(14,2) NOT NULL,
        note VARCHAR(255) NULL,
        created_at DATETIME NOT NULL,
        INDEX idx_tsrp_rep (rep_row_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trip_settlement_clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        settlement_id INT NOT NULL,
        client_id INT NULL,
        client_name VARCHAR(255) NOT NULL,
        alix_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        vcash_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        cash_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        balance DECIMAL(14,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        paid_amount DECIMAL(14,2) NULL,
        paid_at DATETIME NULL,
        expense_id INT NULL,
        client_payment_id INT NULL,
        notes TEXT NULL,
        rolled_from_id INT NULL,
        is_rolled_over TINYINT NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        INDEX idx_tsc_settlement (settlement_id),
        INDEX idx_tsc_client (client_id)
      )
    `);
    logger.info("trip_settlements tables ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure trip_settlements tables");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureTripSettlementTables();

// ─── Ensure client_account_manifests / client_account_manifest_items tables exist ──
async function ensureClientAccountManifestsTables() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS client_account_manifests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NULL,
        manifest_number VARCHAR(100) NOT NULL,
        client_id INT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'open',
        notes TEXT NULL,
        invoice_price DECIMAL(10,2) NULL,
        invoice_notes TEXT NULL,
        manual_shipping_cost DECIMAL(10,2) NULL,
        created_at DATETIME NOT NULL,
        closed_at DATETIME NULL,
        scheduled_close_at DATETIME NULL,
        revenue_disbursement_requested_at DATETIME NULL,
        INDEX idx_cam_client (client_id),
        INDEX idx_cam_tenant (tenant_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS client_account_manifest_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        manifest_id INT NOT NULL,
        shipment_id INT NOT NULL,
        delivery_status VARCHAR(50) NOT NULL DEFAULT 'pending',
        delivery_note TEXT NULL,
        partial_quantity INT NULL,
        delivered_at DATETIME NULL,
        return_received INT NULL,
        return_reason VARCHAR(100) NULL,
        added_at DATETIME NOT NULL,
        is_urgent INT DEFAULT 0,
        urgent_note VARCHAR(255) NULL,
        urgent_at DATETIME NULL,
        INDEX idx_cami_manifest (manifest_id),
        INDEX idx_cami_shipment (shipment_id)
      )
    `);
    logger.info("client_account_manifests tables ensured");
  } catch (err: any) {
    logger.error({ err }, "Failed to ensure client_account_manifests tables");
  }
}
if (IS_PRIMARY_INSTANCE) ensureClientAccountManifestsTables();

// ─── Ensure client_return_manifests / client_return_manifest_items tables exist ──
async function ensureClientReturnManifestsTables() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS client_return_manifests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NULL,
        manifest_number VARCHAR(100) NOT NULL,
        client_id INT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'open',
        notes TEXT NULL,
        created_at DATETIME NOT NULL,
        closed_at DATETIME NULL,
        INDEX idx_crm_client (client_id),
        INDEX idx_crm_tenant (tenant_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS client_return_manifest_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        manifest_id INT NOT NULL,
        shipment_id INT NOT NULL,
        shipment_number VARCHAR(100) NOT NULL,
        receiver_name VARCHAR(255) NULL,
        receiver_phone VARCHAR(50) NULL,
        receiver_city VARCHAR(100) NULL,
        cod_amount DECIMAL(10,2) NULL,
        return_reason VARCHAR(100) NULL,
        added_at DATETIME NOT NULL,
        INDEX idx_crmi_manifest (manifest_id),
        INDEX idx_crmi_shipment (shipment_id)
      )
    `);
    logger.info("client_return_manifests tables ensured");
  } catch (err: any) {
    logger.error({ err }, "Failed to ensure client_return_manifests tables");
  }
}
if (IS_PRIMARY_INSTANCE) ensureClientReturnManifestsTables();


// ─── Ensure employee_profiles.avatar column exists ────────────────────────────
async function ensureEmployeeProfileAvatar() {
  try {
    await db.execute(sql`
      ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS avatar LONGTEXT NULL
    `);
    logger.info("employee_profiles.avatar column ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure employee_profiles.avatar column");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureEmployeeProfileAvatar();

// ─── Ensure cash_registers.is_default column exists ──────────────────────────
async function ensureCashRegisterIsDefault() {
  try {
    await db.execute(sql`
      ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS is_default TINYINT(1) NOT NULL DEFAULT 0
    `);
    // لو مفيش خزنة default → عيّن الخزنة الرئيسية تلقائياً
    const [rows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM cash_registers WHERE is_default = 1`);
    const cnt = (rows as any)[0]?.cnt ?? 0;
    if (Number(cnt) === 0) {
      await db.execute(sql`
        UPDATE cash_registers SET is_default = 1 WHERE type = 'main' ORDER BY id LIMIT 1
      `);
    }
    logger.info("cash_registers.is_default column ensured");
  } catch (err: any) {
    if (err?.message && !err.message.includes("Duplicate column")) {
      logger.error({ err }, "Failed to ensure is_default column");
    }
  }
}
if (IS_PRIMARY_INSTANCE) ensureCashRegisterIsDefault();

export default app;
