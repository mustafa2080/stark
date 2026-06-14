import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startSubscriptionCron } from "./lib/subscriptionCron.js";
import { db, usersTable, shipmentsTable } from "@workspace/db";
import { hashPassword } from "./lib/auth.js";
import { eq, sql, or, and, isNull } from "drizzle-orm";

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
app.get("/api/shipments/track/:number", async (req: Request, res: Response): Promise<void> => {
  try {
    const { number } = req.params;
    const rows = await db
      .select()
      .from(shipmentsTable)
      .where(
        and(
          isNull(shipmentsTable.deletedAt),
          or(
            eq(shipmentsTable.trackingNumber, number),
            eq(shipmentsTable.shipmentNumber,  number),
          )
        )
      )
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

seedDefaultAdmin();
backfillEmployeeProfileIds();
startSubscriptionCron(); // ← Cron الاشتراكات

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
ensureAppSettingsTable();

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
ensureVariantColorHex();

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
ensureOrdersInvoiceNumber();

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
ensureShippingManifestColumns();

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
ensureShippingCompanyLogo();

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
ensureEmployeeProfileAvatar();

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
ensureCashRegisterIsDefault();

export default app;
