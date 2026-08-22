import { Router, type IRouter } from "express";
import { eq, and, desc, isNull, sql, or, inArray, count, ne } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import {
  db,
  usersTable,
  tenantsTable,
  clientsTable,
  shipmentsTable,
  shipmentItemsTable,
  clientPaymentsTable,
  clientInvoicesTable,
  pickupRequestsTable,
  shippingCompaniesTable,
  shipmentZonesTable,
  parcelTypePricingTable,
  clientAccountManifestsTable,
  clientAccountManifestItemsTable,
  warehousesTable,
  clientAccountPaymentsTable,
  clientReturnManifestsTable,
  clientReturnManifestItemsTable,
  shipmentManifestItemsTable,
} from "@workspace/db";
import { z } from "zod";
import multer from "multer";
import ExcelJS from "exceljs";
import { signToken, comparePassword, hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { generateShipmentNumber, syncShipmentInventory } from "./shipments.js";
import { pushNotification } from "../lib/notifications.js";
import { computeClosedManifestsForClient } from "../lib/clientAccountBalance.js";
import { autoAddShipmentToClientAccountManifest } from "./client-account-manifests.js";

const router: IRouter = Router();
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ─── Helpers ──────────────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  const digitsOnly = (raw ?? "").replace(/\D/g, "");
  return digitsOnly.slice(-9);
}

function parsePermissions(permissions: any): string[] {
  let parsed = permissions;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  const flat: string[] = [];
  for (const item of parsed) {
    if (typeof item === "string") flat.push(item);
    else if (Array.isArray(item)) { for (const sub of item) { if (typeof sub === "string") flat.push(sub); } }
  }
  return [...new Set(flat)];
}

function requireClientRole(req: any, res: any, next: any) {
  if (req.user?.role !== "client") {
    const roleLabels: Record<string, string> = {
      representative: "مندوب",
      admin: "أدمن",
      employee: "موظف",
      super_admin: "أدمن رئيسي",
    };
    const currentRoleLabel = roleLabels[req.user?.role] ?? req.user?.role ?? "غير معروف";
    res.status(403).json({
      error: `هذا المسار مخصص لحسابات العملاء فقط. حسابك الحالي مسجل كـ "${currentRoleLabel}" — لو عايز تستخدم بوابة العميل، سجّل حساب عميل منفصل من صفحة "إنشاء حساب عميل".`,
      currentRole: req.user?.role ?? null,
      requiredRole: "client",
    });
    return;
  }
  next();
}

// ─── Rate limit للتسجيل ──────────────────────────────────────────────────
const clientRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل كثيرة، يرجى المحاولة لاحقاً" },
});

const clientLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات دخول كثيرة، يرجى الانتظار قليلاً" },
  skipSuccessfulRequests: true,
});

// ══════════════════════════════════════════════════════════════════════════
// بيانات مساعدة عامة (بدون auth) لصفحة إنشاء حساب عميل — نفس بيانات فورم
// "إضافة عميل تجاري" في الداشبورد (محافظات)
// ══════════════════════════════════════════════════════════════════════════
async function getRegisterTenant() {
  const [tenant] = await db.select().from(tenantsTable)
    .where(eq(tenantsTable.isActive, true))
    .orderBy(tenantsTable.id)
    .limit(1);
  return tenant;
}

router.get("/client/register/zones", async (_req, res): Promise<void> => {
  try {
    const tenant = await getRegisterTenant();
    if (!tenant) { res.json([]); return; }
    const rows = await db.select().from(shipmentZonesTable)
      .where(or(eq(shipmentZonesTable.tenantId, tenant.id), isNull(shipmentZonesTable.tenantId)));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// POST /client/register — تسجيل حساب عميل جديد داخل tenant موجود (عن طريق كود الشركة)
// ══════════════════════════════════════════════════════════════════════════
const clientRegisterSchema = z.object({
  displayName: z.string().trim().min(2, "الاسم مطلوب"),
  username: z.string().trim().min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  phone: z.string().trim().min(8, "رقم الهاتف مطلوب"),
  phone2: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  city: z.string().trim().optional(),
  region: z.string().trim().optional(),
  address: z.string().trim().optional(),
  // ── بيانات العميل التجاري ─────────────────────────────────────────────
  taxNumber: z.string().trim().optional(),
  commercialReg: z.string().trim().optional(),
  paymentTerms: z.string().trim().optional(),
  creditLimit: z.string().trim().optional(),
  whatsappGroupLink: z.string().trim().optional(),
  defaultAdSource: z.string().trim().optional(),
  avatar: z.string().optional(),
  notes: z.string().trim().optional(),
});

router.post("/client/register", clientRegisterLimiter, async (req, res): Promise<void> => {
  try {
    const parsed = clientRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" });
      return;
    }
    const {
      displayName, username, password, phone, phone2, email, city, region, address,
      taxNumber, commercialReg, paymentTerms, creditLimit,
      whatsappGroupLink, defaultAdSource,
      avatar, notes,
    } = parsed.data;

    // ── الشركة الوحيدة الحالية (STARK) — تُحدَّد تلقائياً بدون كود ────────
    const [tenant] = await db.select().from(tenantsTable)
      .where(eq(tenantsTable.isActive, true))
      .orderBy(tenantsTable.id)
      .limit(1);
    if (!tenant) {
      res.status(500).json({ error: "تعذر تحديد الشركة، يرجى التواصل مع الدعم الفني" });
      return;
    }

    // ── تحقق من اسم المستخدم ────────────────────────────────────────────
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (cleanUsername.length < 3) {
      res.status(400).json({ error: "اسم المستخدم يجب أن يكون 3 أحرف إنجليزية/أرقام على الأقل" });
      return;
    }
    const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.username, cleanUsername)).limit(1);
    if (existingUser) {
      res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر" });
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      res.status(400).json({ error: "رقم الهاتف غير صالح" });
      return;
    }

    const now = new Date();

    // ── إيجاد/إنشاء سجل clients لنفس التاجر ──────────────────────────────
    const [existingClient] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.tenantId, tenant.id), eq(clientsTable.normalizedPhone, normalizedPhone)))
      .limit(1);

    let clientId: number;
    if (existingClient) {
      // لو موجود بالفعل — تأكد إنه مش مرتبط بحساب تاني
      const [linkedUser] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.clientId, existingClient.id)).limit(1);
      if (linkedUser) {
        res.status(409).json({ error: "يوجد حساب مسجل بالفعل بهذا الرقم، يرجى تسجيل الدخول" });
        return;
      }
      clientId = existingClient.id;
      // حدّث بياناته الأساسية لو ناقصة
      await db.update(clientsTable).set({
        name: existingClient.name || displayName,
        phone2: existingClient.phone2 || (phone2 || null),
        email: existingClient.email || (email || null),
        city: existingClient.city || (city ?? null),
        region: existingClient.region || (region || null),
        address: existingClient.address || (address ?? null),
        taxNumber: existingClient.taxNumber || (taxNumber || null),
        commercialReg: existingClient.commercialReg || (commercialReg || null),
        paymentTerms: existingClient.paymentTerms || (paymentTerms || null),
        creditLimit: existingClient.creditLimit || (creditLimit || "0"),
        whatsappGroupLink: existingClient.whatsappGroupLink || (whatsappGroupLink || null),
        defaultAdSource: existingClient.defaultAdSource || (defaultAdSource || null),
        avatar: existingClient.avatar || (avatar || null),
        notes: existingClient.notes || (notes || null),
        clientType: existingClient.clientType === "normal" ? "commercial" : existingClient.clientType,
        updatedAt: now,
      }).where(eq(clientsTable.id, existingClient.id));
    } else {
      const insertResult = await db.insert(clientsTable).values({
        tenantId: tenant.id,
        normalizedPhone,
        name: displayName,
        phone,
        phone2: phone2 || null,
        email: email || null,
        city: city ?? null,
        region: region || null,
        address: address ?? null,
        accountStatus: "active",
        paymentMethod: "cod",
        clientType: "commercial",
        taxNumber: taxNumber || null,
        commercialReg: commercialReg || null,
        paymentTerms: paymentTerms || null,
        creditLimit: creditLimit || "0",
        whatsappGroupLink: whatsappGroupLink || null,
        defaultAdSource: defaultAdSource || null,
        avatar: avatar || null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      } as any);
      const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
      clientId = insertId;
    }

    // ── إنشاء حساب المستخدم (role = client) ──────────────────────────────
    const passwordHash = await hashPassword(password);
    const [userResult] = await db.insert(usersTable).values({
      tenantId: tenant.id,
      username: cleanUsername,
      displayName,
      passwordHash,
      role: "client",
      permissions: JSON.stringify(["client.view"]),
      phone,
      email: email || null,
      clientId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as any);
    const userId = (userResult as any).insertId as number;

    await logAudit({
      action: "login",
      entityType: "user",
      entityId: userId,
      entityName: displayName,
      userId,
      userName: displayName,
    }).catch(() => {});

    // ── إشعار فوري للأدمن بتسجيل عميل تجاري جديد من صفحة التسجيل العامة ──
    if (!existingClient) {
      pushNotification({
        tenantId: tenant.id,
        type: "system",
        severity: "info",
        title: "عميل تجاري جديد",
        message: `${displayName} — ${phone} سجّل حساب عميل تجاري جديد من صفحة التسجيل العامة`,
        entityType: "client",
        entityId: clientId,
        link: `/finance/clients`,
      }).catch(() => {});
    }

    const [newUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const finalPerms = parsePermissions(newUser.permissions);
    const token = signToken({ ...newUser, permissions: finalPerms } as any);
    const { passwordHash: _, ...safeUser } = newUser;

    res.status(201).json({
      token,
      // ملحوظة: العميل (role=client) مش تابع لنظام اشتراك الشركة — ما بنبعتش planStatus بتاع الـ tenant هنا
      user: { ...safeUser, permissions: finalPerms },
      message: "تم إنشاء حسابك بنجاح 🎉",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// POST /client/login — تسجيل دخول عميل (نفس منطق auth/login لكن مقصور على role=client)
// ══════════════════════════════════════════════════════════════════════════
router.post("/client/login", clientLoginLimiter, async (req, res): Promise<void> => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
      return;
    }
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.username, username.trim().toLowerCase())).limit(1);
    if (!user || !user.isActive || user.role !== "client") {
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }
    const finalPerms = parsePermissions(user.permissions);
    const token = signToken({ ...user, permissions: finalPerms } as any);

    await logAudit({
      action: "login", entityType: "user", entityId: user.id,
      entityName: user.displayName, userId: user.id, userName: user.displayName,
    }).catch(() => {});

    // ملحوظة: العميل (role=client) مش تابع لنظام اشتراك الشركة — ما بنبعتش planStatus بتاع الـ tenant هنا
    const { passwordHash: _, ...safeUser } = user;
    res.json({ token, user: { ...safeUser, permissions: finalPerms } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// كل الراوتات تحت محمية بـ requireAuth + requireClientRole
// ══════════════════════════════════════════════════════════════════════════
router.use("/client-portal", requireAuth, requireClientRole);

// ─── GET /client-portal/profile — بيانات العميل + بطاقة الحساب ─────────────
router.get("/client-portal/profile", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ client: null }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client) { res.json({ client: null }); return; }

    res.json({ client });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /client-portal/profile — تعديل بيانات العميل الأساسية ───────────
const updateProfileSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  city: z.string().trim().optional(),
  address: z.string().trim().optional(),
  avatar: z.string().nullable().optional(),
});
router.patch("/client-portal/profile", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.status(404).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.email !== undefined) updates.email = parsed.data.email || null;
    if (parsed.data.city !== undefined) updates.city = parsed.data.city;
    if (parsed.data.address !== undefined) updates.address = parsed.data.address;
    if (parsed.data.avatar !== undefined) updates.avatar = parsed.data.avatar ?? null;

    if (Object.keys(updates).length === 1) { // فقط updatedAt
      res.status(400).json({ error: "لا توجد بيانات للتحديث" });
      return;
    }

    await db.update(clientsTable).set(updates).where(eq(clientsTable.id, user.clientId));

    // مزامنة الاسم مع حساب المستخدم لو اتغير (يخلي اسم اليوزر متسق مع اسم العميل)
    if (parsed.data.name !== undefined) {
      await db.update(usersTable).set({ displayName: parsed.data.name, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    }

    const [updated] = await db.select().from(clientsTable).where(eq(clientsTable.id, user.clientId)).limit(1);
    res.json({ client: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /client-portal/account — العميل يحذف/يعطّل حسابه بنفسه ─────────
router.delete("/client-portal/account", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const { password } = req.body as { password?: string };
    if (!password) { res.status(400).json({ error: "كلمة المرور مطلوبة لتأكيد الحذف" }); return; }

    const [fullUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
    if (!fullUser) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

    const valid = await comparePassword(password, fullUser.passwordHash);
    if (!valid) { res.status(401).json({ error: "كلمة المرور غير صحيحة" }); return; }

    // تعطيل الحساب بدلاً من الحذف الفعلي (حفاظاً على سجل الشحنات وسلامة البيانات المالية)
    await db.update(usersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    if (user.clientId) {
      await db.update(clientsTable).set({ accountStatus: "suspended", updatedAt: new Date() })
        .where(eq(clientsTable.id, user.clientId));
    }

    await logAudit({
      action: "delete", entityType: "user", entityId: user.id,
      entityName: fullUser.displayName, userId: user.id, userName: fullUser.displayName,
    }).catch(() => {});

    res.json({ success: true, message: "تم حذف حسابك بنجاح" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: شحنات العميل — بيتحدد بمن أنشأها (createdByUserId) أو برقم هاتف المستلم (توافقاً مع شحنات قديمة أُدخلت يدويًا للأدمن) ──
async function getClientShipments(tenantId: number | null, normalizedPhone: string | null, userId?: number | null, clientId?: number | null) {
  // لو مفيش رقم هاتف متطبّع (عملاء قدام قبل الحساب التلقائي)، بنتجاهل شرط الفون
  // ونعتمد بس على createdByUserId/clientId عشان منمنعش الشحنات من الظهور
  const normalOwnership: any[] = [];
  if (normalizedPhone) {
    normalOwnership.push(sql`RIGHT(REGEXP_REPLACE(${shipmentsTable.receiverPhone}, '[^0-9]', ''), 9) = ${normalizedPhone}`);
  }
  if (userId != null) normalOwnership.push(eq(shipmentsTable.createdByUserId, userId));
  const normalCond = normalOwnership.length > 1
    ? or(...normalOwnership)!
    : normalOwnership.length === 1
      ? normalOwnership[0]
      : sql`1 = 0`; // مفيش أي معيار ملكية عادي متاح — منرجعش شحنات غلط بالغلط

  const scopedConds: any[] = [isNull(shipmentsTable.deletedAt)];
  const orBranches: any[] = [tenantId !== null ? and(normalCond, eq(shipmentsTable.tenantId, tenantId))! : normalCond];

  // شحنات الأدمن اللي حدد فيها clientId = هذا العميل بالذات — تظهر تلقائيًا في حسابه
  // ملاحظة: شحنات super_admin بتتخزن بـ tenant_id = NULL، فبنقبلها هنا كمان (مش بس تطابق الـ tenant الحالي)
  if (clientId != null) {
    orBranches.push(
      tenantId !== null
        ? and(eq(shipmentsTable.clientId, clientId), or(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.tenantId)))!
        : eq(shipmentsTable.clientId, clientId),
    );
  }

  scopedConds.push(or(...orBranches)!);
  return db.select().from(shipmentsTable).where(and(...scopedConds)).orderBy(desc(shipmentsTable.createdAt));
}


// ─── إجمالي رصيد العميل = مجموع صافي المستحق لكل البيانات "المقفولة" الخاصة به ──
// (نفس الدالة المشتركة المستخدمة في لوحة الأدمن — computeClosedManifestsForClient —
// لضمان تطابق 100% بين رصيد العميل في البوابة ورصيده في لوحة الأدمن)
async function computeClientBalance(clientId: number): Promise<number> {
  const { balance } = await computeClosedManifestsForClient(clientId);
  return balance;
}

// ─── GET /client-portal/stats — إحصائيات دائرية (زي الصورة) + KPIs ─────────
router.get("/client-portal/stats", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ total: 0, breakdown: [] }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client || !client.normalizedPhone) { res.json({ total: 0, breakdown: [] }); return; }

    const shipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone, user.id, client.id);

    const total = shipments.length;
    const counts: Record<string, number> = {};
    for (const s of shipments) counts[s.status] = (counts[s.status] ?? 0) + 1;

    // تجميع الحالات في مجموعات رئيسية مطابقة للصورة
    const delivered    = (counts["delivered"] ?? 0) + (counts["received"] ?? 0);
    const inShipping   = (counts["in_transit"] ?? 0) + (counts["picked_up"] ?? 0) + (counts["out_for_delivery"] ?? 0);
    const inWarehouse  = (counts["warehouse_ready"] ?? 0) + (counts["in_shipping"] ?? 0) + (counts["still_in_warehouse"] ?? 0);
    const waiting      = (counts["waiting"] ?? 0) + (counts["confirmed"] ?? 0);
    const returned     = counts["returned"] ?? 0;
    const delayed      = counts["delayed"] ?? 0;
    const cancelled    = counts["cancelled"] ?? 0;
    const partial      = counts["partial_received"] ?? 0;

    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

    const breakdown = [
      { key: "waiting", label: "قيد الانتظار",   count: waiting, pct: pct(waiting), color: "#f5a623" },
      { key: "in_transit", label: "قيد الشحن", count: inShipping, pct: pct(inShipping), color: "#4a7cf5" },
      { key: "warehouse_ready", label: "قيد الشحن في المخزن", count: inWarehouse, pct: pct(inWarehouse), color: "#2dd4bf" },
      { key: "delivered", label: "استلم",  count: delivered, pct: pct(delivered), color: "#22c55e" },
      { key: "partial_received", label: "استلم جزئى", count: partial, pct: pct(partial), color: "#38bdf8" },
      { key: "delayed", label: "مؤجل",         count: delayed, pct: pct(delayed), color: "#8b5cf6" },
      { key: "returned", label: "مرتجع",         count: returned, pct: pct(returned), color: "#ef4444" },
      { key: "cancelled", label: "ملغية",        count: cancelled, pct: pct(cancelled), color: "#6b7280" },
    ].filter(b => b.count > 0);

    // ماليات سريعة
    const totalCod       = shipments.reduce((s, x) => s + parseFloat(x.codAmount ?? "0"), 0);
    const totalCollected  = shipments.reduce((s, x) => s + parseFloat(x.collectedAmount ?? "0"), 0);
    const totalShippingFee = shipments.reduce((s, x) => s + parseFloat(x.shippingFee ?? "0"), 0);
    const clientBalance = await computeClientBalance(client.id);

    res.json({
      total,
      breakdown,
      finance: {
        totalCod: String(totalCod),
        totalCollected: String(totalCollected),
        totalShippingFee: String(totalShippingFee),
        outstanding: String(Math.max(0, totalCod - totalCollected)),
      },
      accountStatus: client.accountStatus,
      creditLimit: client.creditLimit,
      clientBalance,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /client-portal/smart-analytics — التحليل الذكي: توزيع جغرافي للتسليم والمرتجعات ─
const CLIENT_RETURN_REASON_LABELS: Record<string, string> = {
  size_mismatch: "مقاس غير مناسب",
  quality: "هرب من الاستلام بدون معاينة",
  customer_refused: "عميل غير جاد",
  customer_requested_return: "طلب العميل مرتجع",
  delay: "التأخير على العميل",
  other: "سبب آخر",
};

router.get("/client-portal/smart-analytics", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ delivered: null, returned: null }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client) { res.json({ delivered: null, returned: null }); return; }

    const allShipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone ?? null, user.id, client.id);

    // ── فلتر فترة زمنية اختياري (from/to بصيغة ISO) ──────────────────────
    const fromStr = (req.query.from as string | undefined)?.trim();
    const toStr = (req.query.to as string | undefined)?.trim();
    const fromDate = fromStr ? new Date(fromStr) : null;
    const toDate = toStr ? new Date(toStr) : null;
    if (toDate && !isNaN(toDate.getTime())) toDate.setHours(23, 59, 59, 999);

    let shipments = allShipments;
    if (fromDate && !isNaN(fromDate.getTime())) shipments = shipments.filter(s => s.createdAt && new Date(s.createdAt) >= fromDate);
    if (toDate && !isNaN(toDate.getTime())) shipments = shipments.filter(s => s.createdAt && new Date(s.createdAt) <= toDate);

    // ── الفترة السابقة (لنفس طول الفترة الحالية) للمقارنة ────────────────
    let prevShipments: typeof allShipments = [];
    const hasEffectiveFrom = fromDate && !isNaN(fromDate.getTime());
    const effectiveTo = (toDate && !isNaN(toDate.getTime())) ? toDate : new Date();
    if (hasEffectiveFrom) {
      const spanMs = effectiveTo.getTime() - fromDate!.getTime();
      const prevTo = new Date(fromDate!.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - spanMs);
      prevShipments = allShipments.filter(s => s.createdAt && new Date(s.createdAt) >= prevFrom && new Date(s.createdAt) <= prevTo);
    } else {
      // من غير فلتر تاريخ: قارن آخر 30 يوم بالـ 30 يوم اللي قبلها
      const now = new Date();
      const curFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const prevTo = new Date(curFrom.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevShipments = allShipments.filter(s => s.createdAt && new Date(s.createdAt) >= prevFrom && new Date(s.createdAt) <= prevTo);
      shipments = allShipments.filter(s => s.createdAt && new Date(s.createdAt) >= curFrom && new Date(s.createdAt) <= now);
      // ملاحظة: لو المستخدم فعلاً عايز "كل الوقت" بدون فلتر، الأصل يفضل شامل كل شيء لعرض التوزيع،
      // بس المقارنة بتاعة آخر 30 يوم مقصودة كـ "نبض" افتراضي. نرجّع shipments لكل الفترة عشان التوزيع الجغرافي يفضل شامل.
      shipments = allShipments;
    }

    const deliveredStatusesSet = new Set(["delivered", "received"]);
    const kpiOf = (list: typeof allShipments) => {
      const delivered = list.filter(s => deliveredStatusesSet.has(s.status));
      const returned = list.filter(s => s.status === "returned");
      const revenue = delivered.reduce((sum, x) => sum + parseFloat(x.codAmount ?? "0"), 0);
      const total = list.length;
      return {
        total,
        deliveredCount: delivered.length,
        returnedCount: returned.length,
        deliveryRate: total > 0 ? Math.round((delivered.length / total) * 100) : 0,
        returnRate: total > 0 ? Math.round((returned.length / total) * 100) : 0,
        totalRevenue: Math.round(revenue),
        avgOrderValue: delivered.length > 0 ? Math.round(revenue / delivered.length) : 0,
      };
    };
    const currentKpi = kpiOf(shipments);
    const prevKpi = kpiOf(prevShipments);
    const pctChange = (cur: number, prev: number) => {
      if (prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    };
    const kpis = {
      current: currentKpi,
      previous: prevKpi,
      changes: {
        deliveryRate: pctChange(currentKpi.deliveryRate, prevKpi.deliveryRate),
        returnRate: pctChange(currentKpi.returnRate, prevKpi.returnRate),
        totalRevenue: pctChange(currentKpi.totalRevenue, prevKpi.totalRevenue),
        avgOrderValue: pctChange(currentKpi.avgOrderValue, prevKpi.avgOrderValue),
        total: pctChange(currentKpi.total, prevKpi.total),
      },
    };

    // ── اتجاه شهري (Trend) — آخر 6 شهور من ضمن الشحنات المفلترة، أو كل الشحنات لو مفيش فلتر ──
    const trendSource = hasEffectiveFrom ? shipments : allShipments;
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = (d: Date) => new Intl.DateTimeFormat("ar-EG", { month: "short", year: "2-digit" }).format(d);
    const monthsBack = 6;
    const now2 = new Date();
    const monthBuckets: { key: string; label: string; delivered: number; returned: number; revenue: number }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
      monthBuckets.push({ key: monthKey(d), label: monthLabel(d), delivered: 0, returned: 0, revenue: 0 });
    }
    const bucketByKey = new Map(monthBuckets.map(b => [b.key, b]));
    for (const s of trendSource) {
      if (!s.createdAt) continue;
      const d = new Date(s.createdAt);
      const key = monthKey(d);
      const bucket = bucketByKey.get(key);
      if (!bucket) continue;
      if (deliveredStatusesSet.has(s.status)) {
        bucket.delivered += 1;
        bucket.revenue += parseFloat(s.codAmount ?? "0");
      } else if (s.status === "returned") {
        bucket.returned += 1;
      }
    }
    const trend = monthBuckets.map(b => ({ ...b, revenue: Math.round(b.revenue) }));

    const normalizeGov = (city: string | null | undefined) => (city ?? "").trim() || "غير محدد";

    // ── حاوية المبيعات: الشحنات المسلّمة ─────────────────────────────────
    const deliveredStatuses = new Set(["delivered", "received"]);
    const deliveredShipments = shipments.filter(s => deliveredStatuses.has(s.status));

    const deliveredByGov = new Map<string, { count: number; revenue: number; shipments: typeof shipments }>();
    for (const s of deliveredShipments) {
      const gov = normalizeGov(s.receiverCity);
      if (!deliveredByGov.has(gov)) deliveredByGov.set(gov, { count: 0, revenue: 0, shipments: [] });
      const entry = deliveredByGov.get(gov)!;
      entry.count += 1;
      entry.revenue += parseFloat(s.codAmount ?? "0");
      entry.shipments.push(s);
    }

    const deliveredTotal = deliveredShipments.length;
    const deliveredBreakdown = [...deliveredByGov.entries()]
      .map(([governorate, v]) => ({
        governorate, count: v.count, revenue: Math.round(v.revenue),
        pct: deliveredTotal > 0 ? Math.round((v.count / deliveredTotal) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // ── حاوية المرتجعات: الشحنات المرتجعة ────────────────────────────────
    const returnedShipments = shipments.filter(s => s.status === "returned");
    const returnedByGov = new Map<string, { count: number; reasons: Record<string, number> }>();
    for (const s of returnedShipments) {
      const gov = normalizeGov(s.receiverCity);
      if (!returnedByGov.has(gov)) returnedByGov.set(gov, { count: 0, reasons: {} });
      const entry = returnedByGov.get(gov)!;
      entry.count += 1;
      const reason = s.returnReason ?? "__none__";
      entry.reasons[reason] = (entry.reasons[reason] ?? 0) + 1;
    }

    const returnedTotal = returnedShipments.length;
    const returnedBreakdown = [...returnedByGov.entries()]
      .map(([governorate, v]) => ({
        governorate, count: v.count,
        pct: returnedTotal > 0 ? Math.round((v.count / returnedTotal) * 100) : 0,
        reasons: Object.entries(v.reasons)
          .map(([reason, count]) => ({
            reason,
            label: reason === "__none__" ? "غير محدد" : (CLIENT_RETURN_REASON_LABELS[reason] ?? reason),
            count,
            pct: v.count > 0 ? Math.round((count / v.count) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      total: shipments.length,
      kpis,
      trend,
      delivered: {
        total: deliveredTotal,
        totalRevenue: Math.round(deliveredShipments.reduce((s, x) => s + parseFloat(x.codAmount ?? "0"), 0)),
        byGovernorate: deliveredBreakdown,
      },
      returned: {
        total: returnedTotal,
        byGovernorate: returnedBreakdown,
      },
      healthScore: buildHealthScore(currentKpi, kpis.changes, returnedBreakdown),
      weekdayPerformance: buildWeekdayPerformance(shipments, deliveredStatusesSet),
      deliveryTimeByRegion: buildDeliveryTimeByRegion(deliveredShipments, normalizeGov),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── مؤشر صحة العميل: رقم واحد من 100 يلخّص نسبة التسليم + اتجاه الإيراد + تركّز المرتجعات ─
function buildHealthScore(
  currentKpi: { deliveryRate: number; returnRate: number },
  changes: { totalRevenue: number },
  returnedBreakdown: { pct: number; reasons: { pct: number }[] }[],
): { score: number; label: string; color: string; factors: { label: string; impact: "positive" | "negative" | "neutral"; note: string }[] } {
  const deliveryPoints = Math.round((currentKpi.deliveryRate / 100) * 50);
  const revenueClamped = Math.max(-30, Math.min(30, changes.totalRevenue));
  const revenuePoints = Math.round(((revenueClamped + 30) / 60) * 30);
  const maxReasonConcentration = returnedBreakdown.reduce((mx, gov) => {
    const topReasonPct = gov.reasons?.[0]?.pct ?? 0;
    return Math.max(mx, topReasonPct);
  }, 0);
  const concentrationPoints = Math.round(20 - (maxReasonConcentration / 100) * 20);

  const score = Math.max(0, Math.min(100, deliveryPoints + revenuePoints + concentrationPoints));

  let label: string, color: string;
  if (score >= 80) { label = "ممتاز"; color = "#10b981"; }
  else if (score >= 60) { label = "جيد"; color = "#60a5fa"; }
  else if (score >= 40) { label = "متوسط"; color = "#fbbf24"; }
  else { label = "محتاج متابعة"; color = "#f43f5e"; }

  const factors: { label: string; impact: "positive" | "negative" | "neutral"; note: string }[] = [
    {
      label: "نسبة التسليم",
      impact: currentKpi.deliveryRate >= 70 ? "positive" : currentKpi.deliveryRate >= 50 ? "neutral" : "negative",
      note: `${currentKpi.deliveryRate}% من شحناتك بتتسلم بنجاح`,
    },
    {
      label: "اتجاه الإيراد",
      impact: changes.totalRevenue > 5 ? "positive" : changes.totalRevenue < -5 ? "negative" : "neutral",
      note: changes.totalRevenue >= 0 ? `إيرادك في نمو ${changes.totalRevenue}%` : `إيرادك في تراجع ${Math.abs(changes.totalRevenue)}%`,
    },
    {
      label: "تركّز أسباب المرتجعات",
      impact: maxReasonConcentration >= 50 ? "negative" : maxReasonConcentration >= 30 ? "neutral" : "positive",
      note: maxReasonConcentration > 0 ? `أعلى سبب مرتجع بيمثل ${maxReasonConcentration}% في منطقة واحدة` : "مفيش تركّز واضح لسبب معين",
    },
  ];

  return { score, label, color, factors };
}

// ─── تحليل أداء أيام الأسبوع: أي يوم بيتسلم فيه أكتر وأي يوم بيترجع فيه أكتر ─
const WEEKDAY_LABELS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function buildWeekdayPerformance(
  shipments: { createdAt: Date | string | null; status: string }[],
  deliveredStatusesSet: Set<string>,
): { day: string; total: number; delivered: number; returned: number; deliveryRate: number; returnRate: number }[] {
  const buckets = WEEKDAY_LABELS_AR.map(day => ({ day, total: 0, delivered: 0, returned: 0 }));
  for (const s of shipments) {
    if (!s.createdAt) continue;
    const d = new Date(s.createdAt);
    if (isNaN(d.getTime())) continue;
    const bucket = buckets[d.getDay()];
    bucket.total += 1;
    if (deliveredStatusesSet.has(s.status)) bucket.delivered += 1;
    else if (s.status === "returned") bucket.returned += 1;
  }
  return buckets.map(b => ({
    ...b,
    deliveryRate: b.total > 0 ? Math.round((b.delivered / b.total) * 100) : 0,
    returnRate: b.total > 0 ? Math.round((b.returned / b.total) * 100) : 0,
  }));
}

// ─── متوسط وقت التسليم لكل منطقة: الفرق بالأيام بين إنشاء الشحنة وتاريخ التسليم الفعلي ─
function buildDeliveryTimeByRegion(
  deliveredShipments: { receiverCity: string | null; createdAt: Date | string | null; actualDelivery: Date | string | null }[],
  normalizeGov: (city: string | null | undefined) => string,
): { governorate: string; avgDays: number; count: number }[] {
  const byGov = new Map<string, { totalDays: number; count: number }>();
  for (const s of deliveredShipments) {
    if (!s.createdAt || !s.actualDelivery) continue;
    const created = new Date(s.createdAt);
    const delivered = new Date(s.actualDelivery);
    if (isNaN(created.getTime()) || isNaN(delivered.getTime())) continue;
    const days = (delivered.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (days < 0) continue;
    const gov = normalizeGov(s.receiverCity);
    if (!byGov.has(gov)) byGov.set(gov, { totalDays: 0, count: 0 });
    const entry = byGov.get(gov)!;
    entry.totalDays += days;
    entry.count += 1;
  }
  return [...byGov.entries()]
    .map(([governorate, v]) => ({ governorate, avgDays: Math.round((v.totalDays / v.count) * 10) / 10, count: v.count }))
    .filter(g => g.count >= 1)
    .sort((a, b) => a.avgDays - b.avgDays);
}

// ─── GET /client-portal/shipments — جدول شحنات العميل (فلترة + بحث + صفحات) ─
router.get("/client-portal/shipments", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ data: [], total: 0 }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client) { res.json({ data: [], total: 0 }); return; }

    const status = (req.query.status as string | undefined)?.trim();
    const search = (req.query.search as string | undefined)?.trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    // ملاحظة: normalizedPhone ممكن يكون فاضي لبعض العملاء القدام (قبل ما اتحسب تلقائي)،
    // في الحالة دي getClientShipments هتعتمد على تطابق clientId/createdByUserId بس، مش رقم الهاتف
    let shipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone ?? null, user.id, client.id);

    if (status && status !== "all") {
      // نفس تجميع الحالات المستخدم في /client-portal/stats — عشان الفلتر يتطابق مع الدونات
      const STATUS_GROUPS: Record<string, string[]> = {
        delivered:        ["delivered", "received"],
        in_transit:       ["in_transit", "picked_up", "out_for_delivery"],
        warehouse_ready:  ["warehouse_ready", "in_shipping", "still_in_warehouse"],
        waiting:          ["waiting", "confirmed"],
        returned:         ["returned"],
        delayed:          ["delayed"],
        cancelled:        ["cancelled"],
        partial_received: ["partial_received"],
      };
      const group = STATUS_GROUPS[status] ?? [status];
      shipments = shipments.filter(s => group.includes(s.status));
    }
    if (search) {
      const q = search.toLowerCase();
      shipments = shipments.filter(s =>
        (s.trackingNumber ?? "").toLowerCase().includes(q) ||
        (s.shipmentNumber ?? "").toLowerCase().includes(q) ||
        (s.receiverName ?? "").toLowerCase().includes(q) ||
        String(s.id).includes(q)
      );
    }

    const total = shipments.length;
    const startIdx = (page - 1) * pageSize;
    const paged = shipments.slice(startIdx, startIdx + pageSize);

    // إثراء الصفحة الحالية باسم المندوب (assignedUserId → displayName) — نفس منطق الأدمن
    const repUserIds = [...new Set(paged.map(s => s.assignedUserId).filter((v): v is number => !!v))];
    let repNameMap: Record<number, string> = {};
    if (repUserIds.length) {
      const repUsers = await db
        .select({ id: usersTable.id, displayName: usersTable.displayName })
        .from(usersTable)
        .where(inArray(usersTable.id, repUserIds));
      repNameMap = Object.fromEntries(repUsers.map(u => [u.id, u.displayName]));
    }

    // إثراء الصفحة الحالية بنفس بيانات جدول شحنات الأدمن (اسم المخزن، اسم شركة الشحن/المندوب،
    // ملاحظة التأجيل، القيمة الفعلية المستلمة) — نفس منطق /shipments بتاع الأدمن، لكن مقصور
    // على IDs الصفحة الحالية بس عشان الأداء.
    const pageIds = paged.map(s => s.id);
    const warehouseIds = [...new Set(paged.map(s => s.warehouseId).filter((v): v is number => !!v))];
    const shippingCoIds = [...new Set(paged.map(s => s.shippingCompanyId).filter((v): v is number => !!v))];

    let warehouseNameMap: Record<number, string> = {};
    if (warehouseIds.length) {
      const whs = await db.select({ id: warehousesTable.id, name: warehousesTable.name })
        .from(warehousesTable).where(inArray(warehousesTable.id, warehouseIds));
      warehouseNameMap = Object.fromEntries(whs.map(w => [w.id, w.name]));
    }
    let shippingCoNameMap: Record<number, string> = {};
    if (shippingCoIds.length) {
      const cos = await db.select({ id: shippingCompaniesTable.id, name: shippingCompaniesTable.name })
        .from(shippingCompaniesTable).where(inArray(shippingCompaniesTable.id, shippingCoIds));
      shippingCoNameMap = Object.fromEntries(cos.map(c => [c.id, c.name]));
    }

    // أحدث بند بيان شحن (لسبب التأجيل + القيمة المستلمة) لكل شحنة في الصفحة الحالية —
    // بنستخدم MAX(id) لكل shipmentId عشان ناخد أحدث سجل بس (نفس فكرة latestManifestItemIdSql في /shipments)
    let manifestItemMap: Record<number, { deliveryNote: string | null; deliveredValueReceived: string | null }> = {};
    let clientAccountItemMap: Record<number, { deliveredValueReceived: string | null }> = {};
    if (pageIds.length) {
      const latestManifestRows = await db
        .select({
          shipmentId: shipmentManifestItemsTable.shipmentId,
          deliveryNote: shipmentManifestItemsTable.deliveryNote,
          deliveredValueReceived: shipmentManifestItemsTable.deliveredValueReceived,
          id: shipmentManifestItemsTable.id,
        })
        .from(shipmentManifestItemsTable)
        .where(inArray(shipmentManifestItemsTable.shipmentId, pageIds))
        .orderBy(shipmentManifestItemsTable.id);
      // بما إن الصفوف مرتبة تصاعديًا بالـ id، آخر مرة نكتب فيها لكل shipmentId هي الأحدث فعليًا
      for (const row of latestManifestRows) {
        if (row.shipmentId == null) continue;
        manifestItemMap[row.shipmentId] = { deliveryNote: row.deliveryNote, deliveredValueReceived: row.deliveredValueReceived };
      }
      const latestClientAccountRows = await db
        .select({
          shipmentId: clientAccountManifestItemsTable.shipmentId,
          deliveredValueReceived: clientAccountManifestItemsTable.deliveredValueReceived,
          id: clientAccountManifestItemsTable.id,
        })
        .from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.shipmentId, pageIds))
        .orderBy(clientAccountManifestItemsTable.id);
      for (const row of latestClientAccountRows) {
        if (row.shipmentId == null) continue;
        clientAccountItemMap[row.shipmentId] = { deliveredValueReceived: row.deliveredValueReceived };
      }
    }

    const pagedWithRep = paged.map(s => ({
      ...s,
      assignedUserName: s.assignedUserId ? (repNameMap[s.assignedUserId] ?? null) : null,
      warehouseName: s.warehouseId ? (warehouseNameMap[s.warehouseId] ?? null) : null,
      shippingCompanyName: s.shippingCompanyId ? (shippingCoNameMap[s.shippingCompanyId] ?? null) : null,
      delayNote: manifestItemMap[s.id]?.deliveryNote ?? null,
      deliveredValueReceived: manifestItemMap[s.id]?.deliveredValueReceived ?? null,
      clientAccountDeliveredValueReceived: clientAccountItemMap[s.id]?.deliveredValueReceived ?? null,
    }));

    res.json({ data: pagedWithRep, total, page, pageSize });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /client-portal/shipments — إنشاء شحنة من بوابة العميل (مقفولة على العميل نفسه) ─
const clientCreateShipmentSchema = z.object({
  receiverName:    z.string().min(1),
  receiverPhone:   z.string().nullish(),
  receiverPhone2:  z.string().nullish(),
  receiverAddress: z.string().nullish(),
  receiverCity:    z.string().nullish(),
  zoneId:          z.number().int().positive().nullish(),
  zonePrice:       z.coerce.number().default(0),
  parcelType:      z.string().nullish(),
  parcelTypePrice: z.coerce.number().default(0),
  weight:          z.coerce.number().nullish(),
  pieces:          z.coerce.number().int().default(1),
  description:     z.string().nullish(),
  declaredValue:   z.coerce.number().default(0),
  canOpen:         z.union([z.boolean(), z.literal(0), z.literal(1)]).nullish(),
  isDivisible:     z.union([z.boolean(), z.literal(0), z.literal(1)]).nullish(),
  rejectionPolicy: z.enum(["full_fee", "free"]).nullish(),
  paymentMethod:   z.enum(["cod", "prepaid", "deferred"]).default("cod"),
  codAmount:       z.coerce.number().default(0),
  shippingFee:     z.coerce.number().default(0),
  insuranceFee:    z.coerce.number().default(0),
  totalAmount:     z.coerce.number().default(0),
  shippingCompanyId: z.number().int().positive().nullish(),
  notes:           z.string().nullish(),
  productId:       z.number().int().positive().nullish(),
  variantId:       z.number().int().positive().nullish(),
  items: z.array(z.object({
    productId:   z.number().int().positive().nullish(),
    variantId:   z.number().int().positive().nullish(),
    product:     z.string().nullish(),
    color:       z.string().nullish(),
    size:        z.string().nullish(),
    quantity:    z.coerce.number().int().min(1).default(1),
    unitPrice:   z.coerce.number().min(0).default(0),
    costPrice:   z.coerce.number().min(0).default(0),
  })).nullish(),
});

router.post("/client-portal/shipments", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    if (client.accountStatus === "suspended") {
      res.status(403).json({ error: "الحساب موقوف — يرجى التواصل مع الدعم" });
      return;
    }

    const parsed = clientCreateShipmentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const d = parsed.data;

    const tenantId = user.tenantId ?? null;
    const shipmentNumber = await generateShipmentNumber(tenantId);
    const now = new Date();

    let resolvedReceiverCity = d.receiverCity ?? undefined;
    if (!resolvedReceiverCity && d.zoneId) {
      const zone = await db.select({ toGovernorate: shipmentZonesTable.toGovernorate })
        .from(shipmentZonesTable)
        .where(eq(shipmentZonesTable.id, d.zoneId))
        .limit(1);
      resolvedReceiverCity = zone[0]?.toGovernorate ?? undefined;
    }

    const result = await db.insert(shipmentsTable).values({
      ...(tenantId !== null ? { tenantId } : {}),
      shipmentNumber,
      clientId:        client.id,
      // العميل هو صاحب الشحنة — بياناته الخاصة تتحدد من حسابه مش من الطلب
      senderName:      client.name,
      senderPhone:     client.phone ?? undefined,
      senderCity:      client.city ?? undefined,
      receiverName:    d.receiverName,
      receiverPhone:   d.receiverPhone  ?? undefined,
      receiverPhone2:  d.receiverPhone2 ?? undefined,
      receiverAddress: d.receiverAddress ?? undefined,
      receiverCity:    resolvedReceiverCity,
      zoneId:          d.zoneId      ?? undefined,
      zonePrice:       String(d.zonePrice),
      parcelType:      d.parcelType  ?? undefined,
      parcelTypePrice: String(d.parcelTypePrice),
      weight:          d.weight      ? String(d.weight) : undefined,
      pieces:          d.pieces,
      description:     d.description ?? undefined,
      productId:       d.productId   ?? undefined,
      variantId:       d.variantId   ?? undefined,
      declaredValue:   String(d.declaredValue),
      canOpen:         d.canOpen === undefined || d.canOpen === null ? null : Number(d.canOpen),
      isDivisible:     d.isDivisible === undefined || d.isDivisible === null ? null : Number(d.isDivisible),
      rejectionPolicy: d.rejectionPolicy ?? null,
      paymentMethod:   d.paymentMethod,
      codAmount:       String(d.codAmount),
      shippingFee:     String(d.shippingFee),
      insuranceFee:    String(d.insuranceFee),
      totalAmount:     String(d.totalAmount),
      collectedAmount: "0",
      // الحالة دايمًا "waiting" — الأدمن هو اللي يقرر يقبلها ويحولها warehouse_ready
      status:          "waiting",
      notes:           d.notes ?? undefined,
      shippingCompanyId: d.shippingCompanyId ?? undefined,
      createdByUserId: user.id,
      createdByName:   client.name,
      createdAt:       now,
      updatedAt:       now,
    });

    const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
    let newShipment = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, insertId)).limit(1);

    if (d.items && d.items.length > 0) {
      await db.insert(shipmentItemsTable).values(
        d.items.map((it) => ({
          shipmentId:  insertId,
          tenantId:    tenantId ?? null,
          productId:   it.productId ?? null,
          variantId:   it.variantId ?? null,
          product:     it.product ?? null,
          color:       it.color ?? null,
          size:        it.size ?? null,
          quantity:    it.quantity,
          unitPrice:   String(it.unitPrice),
          costPrice:   String(it.costPrice),
          totalPrice:  String(it.quantity * it.unitPrice),
          createdAt:   now,
          updatedAt:   now,
        }))
      );
    }

    await logAudit({
      action: "create", entityType: "shipment", entityId: insertId,
      entityName: shipmentNumber, userId: user.id, userName: client.name,
    }).catch(() => {});

    res.status(201).json(newShipment[0]);

    // إشعار فوري للأدمن (بث على مستوى الـ tenant) بشحنة جديدة من بوابة العميل
    // مع استثناء حساب العميل نفسه اللي أنشأ الشحنة من استقبال الإشعار
    pushNotification({
      tenantId,
      excludeUserId: user.id,
      type: "shipment_new",
      severity: "info",
      title: "شحنة جديدة من العميل",
      message: `${client.name} — ${d.receiverName} — ${resolvedReceiverCity ?? "بدون محافظة"}`,
      entityType: "shipment",
      entityId: insertId,
      link: `/shipments/${insertId}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /client-portal/shipments/:id — تفاصيل شحنة واحدة (بأمان — نفس العميل بس) ─
router.get("/client-portal/shipments/:id", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user.clientId || !id) { res.status(404).json({ error: "غير موجود" }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client) { res.status(404).json({ error: "غير موجود" }); return; }

    const conds: any[] = [eq(shipmentsTable.id, id), isNull(shipmentsTable.deletedAt)];
    if (user.tenantId !== null && user.tenantId !== undefined) conds.push(eq(shipmentsTable.tenantId, user.tenantId));
    const [shipment] = await db.select().from(shipmentsTable).where(and(...conds)).limit(1);

    if (!shipment) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

    // ── تحقق ملكية — لازم رقم هاتف المستلم يطابق رقم العميل صاحب الجلسة ────
    const shipmentNormalized = normalizePhone(shipment.receiverPhone ?? "");
    if (shipmentNormalized !== client.normalizedPhone) {
      res.status(403).json({ error: "غير مصرح لك بعرض هذه الشحنة" });
      return;
    }

    const items = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.shipmentId, id));
    res.json({ shipment, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /client-portal/shipments/:id/cancel — إلغاء شحنة (لو لسه في مرحلة مبكرة) ─
const CANCELLABLE_STATUSES = new Set(["waiting", "confirmed"]);
router.patch("/client-portal/shipments/:id/cancel", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user.clientId || !id) { res.status(404).json({ error: "غير موجود" }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client) { res.status(404).json({ error: "غير موجود" }); return; }

    const conds: any[] = [eq(shipmentsTable.id, id), isNull(shipmentsTable.deletedAt)];
    if (user.tenantId !== null && user.tenantId !== undefined) conds.push(eq(shipmentsTable.tenantId, user.tenantId));
    const [shipment] = await db.select().from(shipmentsTable).where(and(...conds)).limit(1);
    if (!shipment) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

    const shipmentNormalized = normalizePhone(shipment.receiverPhone ?? "");
    if (shipmentNormalized !== client.normalizedPhone) {
      res.status(403).json({ error: "غير مصرح لك بإلغاء هذه الشحنة" });
      return;
    }

    if (!CANCELLABLE_STATUSES.has(shipment.status)) {
      res.status(400).json({ error: "لا يمكن إلغاء الشحنة بعد بدء إجراءات الشحن الفعلية" });
      return;
    }

    await db.update(shipmentsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(shipmentsTable.id, id));

    await logAudit({
      action: "update", entityType: "shipment", entityId: id,
      entityName: shipment.shipmentNumber ?? String(id), userId: user.id, userName: client.name,
    }).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /client-portal/profile-full — بروفايل احترافي كامل: بيانات + مندوب + ملخص شحنات ─
router.get("/client-portal/profile-full", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ client: null }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client || !client.normalizedPhone) { res.json({ client: null }); return; }

    const shipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone, user.id, client.id);

    // ── تقسيم الشحنات: "تم استلامها" يعني تم استلام الشحنة داخليًا في الشركة
    // (وصلت المخزن على الأقل)، مش تسليمها للعميل النهائي. فبالتالي كل حالة من
    // "قيد الشحن في المخزن" وما بعدها (بما فيها التسليم والمرتجع والملغي) تُحسب
    // "تم استلامها". الحالة الوحيدة اللي تُحسب "لسه لم يتم استلامها" هي "قيد
    // الانتظار" (pending/waiting) — يعني الشحنة لسه ما وصلتش المخزن أصلًا.
    const notReceivedStatuses = new Set(["pending", "waiting"]);
    const received    = shipments.filter(s => !notReceivedStatuses.has(s.status));
    const notReceived  = shipments.filter(s => notReceivedStatuses.has(s.status));
    // ملحوظة: ده مختلف عن معنى "تم استلامها" فوق — هنا معناه الشحنة "استلمها
    // العميل النهائي فعليًا" (تسليم كامل أو جزئي)، مش مجرد وصولها للمخزن، فبنسيبه
    // بمنطقه الأصلي المنفصل خصيصًا لحساب أداء المندوب.
    const deliveredToCustomerStatuses = new Set(["delivered", "partial_received"]);

    // ── تحديد المندوب الأكثر تعاملاً مع العميل (assignedUserId على شحناته) ──
    const repCounts: Record<number, number> = {};
    for (const s of shipments) {
      if (s.assignedUserId) repCounts[s.assignedUserId] = (repCounts[s.assignedUserId] ?? 0) + 1;
    }
    let representative: any = null;
    const topRepId = Object.entries(repCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topRepId) {
      const [rep] = await db.select({
        id: usersTable.id, displayName: usersTable.displayName, phone: usersTable.phone,
        avatar: usersTable.avatar, shippingCompanyId: usersTable.shippingCompanyId,
      }).from(usersTable).where(eq(usersTable.id, Number(topRepId))).limit(1);
      if (rep) {
        let companyName: string | null = null, companyPhone: string | null = null;
        if (rep.shippingCompanyId) {
          const [company] = await db.select({ name: shippingCompaniesTable.name, phone: shippingCompaniesTable.phone })
            .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, rep.shippingCompanyId)).limit(1);
          companyName = company?.name ?? null;
          companyPhone = company?.phone ?? null;
        }
        representative = {
          id: rep.id, name: rep.displayName, phone: rep.phone, avatar: rep.avatar,
          companyName, companyPhone,
          shipmentsCount: repCounts[Number(topRepId)],
          deliveredCount: shipments.filter(s => s.assignedUserId === Number(topRepId) && deliveredToCustomerStatuses.has(s.status)).length,
        };
      }
    } else if (shipments[0]?.shippingCompanyId) {
      // fallback: لو مفيش مندوب معين، اعرض بيانات شركة الشحن بس
      const [company] = await db.select({ name: shippingCompaniesTable.name, phone: shippingCompaniesTable.phone })
        .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, shipments[0].shippingCompanyId)).limit(1);
      if (company) representative = { id: null, name: company.name, phone: company.phone, avatar: null, companyName: company.name, companyPhone: company.phone, shipmentsCount: shipments.length, deliveredCount: received.length };
    }

    // ── توزيع الشحنات حسب الحالة (لدائرة الإحصائيات) — قابل للفلترة بمدة زمنية عبر ?days=7|30|90 ──
    const daysParam = Number(req.query.days);
    const days = [7, 30, 90].includes(daysParam) ? daysParam : null;
    const breakdownSource = days
      ? shipments.filter(s => s.createdAt && (Date.now() - new Date(s.createdAt).getTime()) <= days * 24 * 60 * 60 * 1000)
      : shipments;
    const statusBreakdown: Record<string, number> = {};
    for (const s of breakdownSource) {
      statusBreakdown[s.status] = (statusBreakdown[s.status] ?? 0) + 1;
    }

    // ── طلبات الالتقاط بانتظار الموافقة ──
    const pickupConds: any[] = [
      eq(pickupRequestsTable.portalClientId, user.clientId),
      eq(pickupRequestsTable.status, "pending"),
      isNull(pickupRequestsTable.deletedAt),
    ];
    const pendingPickups = await db.select({ id: pickupRequestsTable.id }).from(pickupRequestsTable).where(and(...pickupConds));

    // ── المستحق للسداد — نفس رقم "إجمالي رصيد العميل" في لوحة الأدمن (العملاء
    // التجاريون → بيان العميل): مجموع قيمة البيانات المقفولة ناقص السدادات
    // المسجّلة (clientAccountPaymentsTable — بما فيها مصروفات "سداد حساب عميل").
    // نفس مصدر الحقيقة الموحّد (computeClosedManifestsForClient)، عشان الرقم
    // في بروفايل العميل يطابق تمامًا الرقم في الأدمن ويتحرك تلقائيًا مع أي سداد.
    const { balance: outstandingBalance } = await computeClosedManifestsForClient(client.id);

    // ── الفرع (المخزن) التابع للعميل ──
    let branch: any = null;
    if (client.warehouseId) {
      const [wh] = await db.select({
        id: warehousesTable.id, name: warehousesTable.name,
        address: warehousesTable.address, city: warehousesTable.city,
      }).from(warehousesTable).where(eq(warehousesTable.id, client.warehouseId)).limit(1);
      if (wh) branch = wh;
    }

    res.json({
      client,
      representative,
      branch,
      shipmentsSummary: {
        total: shipments.length,
        received: received.length,
        notReceived: notReceived.length,
      },
      statusBreakdown,
      pendingApprovals: { pickupRequests: pendingPickups.length },
      outstandingBalance,
      receivedShipments: received.slice(0, 50),
      pendingShipments: notReceived.slice(0, 50),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /client-portal/wallet — المحفظة / التسويات المالية ────────────────
router.get("/client-portal/wallet", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ payments: [], invoices: [] }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client || !client.normalizedPhone) { res.json({ payments: [], invoices: [] }); return; }

    const payConds: any[] = [eq(clientPaymentsTable.normalizedPhone, client.normalizedPhone)];
    if (user.tenantId !== null && user.tenantId !== undefined) payConds.push(eq(clientPaymentsTable.tenantId, user.tenantId));
    const payments = await db.select().from(clientPaymentsTable).where(and(...payConds)).orderBy(desc(clientPaymentsTable.paidAt)).limit(50);

    const invConds: any[] = [eq(clientInvoicesTable.normalizedPhone, client.normalizedPhone)];
    if (user.tenantId !== null && user.tenantId !== undefined) invConds.push(eq(clientInvoicesTable.tenantId, user.tenantId));
    const invoices = await db.select().from(clientInvoicesTable).where(and(...invConds)).orderBy(desc(clientInvoicesTable.createdAt)).limit(50);

    // ── حركة حساب الشحن الموحدة (بيانات مغلقة + سدادات) — نفس الدالة المشتركة
    // المستخدمة في كشف حساب الأدمن، لضمان تطابق تام في الأرقام ────────────────
    const { manifests: closedManifests, payments: manifestPayments, totalManifestsValue, totalPaid: manifestTotalPaid, balance: clientBalance } =
      await computeClosedManifestsForClient(client.id);

    type WalletTxn = {
      type: "manifest" | "manifest_payment";
      date: string;
      label: string;
      amount: number;
      manifestId?: number;
      manifestNumber?: string;
    };
    const manifestTxns: WalletTxn[] = [
      ...closedManifests.map(m => ({
        type: "manifest" as const,
        date: (m.closedAt ?? m.createdAt).toString(),
        label: `بيان شحن مغلق (${m.manifestNumber}) — ${m.itemsCount} شحنة`,
        amount: m.value,
        manifestId: m.id,
        manifestNumber: m.manifestNumber,
      })),
      ...manifestPayments.map(p => ({
        type: "manifest_payment" as const,
        date: p.createdAt.toString(),
        label: p.notes ? `سداد حساب — ${p.notes}` : "سداد حساب شحن",
        amount: -p.amount,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      payments,
      invoices,
      creditLimit: client.creditLimit,
      accountStatus: client.accountStatus,
      clientBalance,
      manifestTransactions: manifestTxns,
      manifestTransactionsSummary: {
        totalManifestsValue,
        totalManifestsPaid: manifestTotalPaid,
        netBalance: clientBalance,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /client-portal/pickup-requests — إنشاء طلب التقاط جديد ───────────
const createPickupSchema = z.object({
  pickupContactName: z.string().trim().min(2, "اسم جهة الاتصال مطلوب"),
  pickupPhone: z.string().trim().min(8, "رقم الهاتف مطلوب"),
  pickupAddress: z.string().trim().min(5, "العنوان مطلوب"),
  pickupCity: z.string().trim().optional(),
  piecesCount: z.number().int().min(1).optional(),
  estimatedWeight: z.number().optional(),
  notes: z.string().trim().optional(),
  preferredDate: z.string().optional(),
  preferredTimeSlot: z.enum(["morning", "afternoon", "evening"]).optional(),
});

router.post("/client-portal/pickup-requests", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.status(404).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const parsed = createPickupSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
    const d = parsed.data;
    const now = new Date();
    const requestNumber = `PU-${Date.now().toString().slice(-8)}`;

    const insertResult = await db.insert(pickupRequestsTable).values({
      tenantId: user.tenantId ?? null,
      portalClientId: user.clientId,
      requestNumber,
      pickupContactName: d.pickupContactName,
      pickupPhone: d.pickupPhone,
      pickupAddress: d.pickupAddress,
      pickupCity: d.pickupCity ?? null,
      piecesCount: d.piecesCount ?? 1,
      estimatedWeight: d.estimatedWeight != null ? String(d.estimatedWeight) : null,
      notes: d.notes ?? null,
      preferredDate: d.preferredDate ? new Date(d.preferredDate) : null,
      preferredTimeSlot: d.preferredTimeSlot ?? null,
      status: "pending",
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    } as any);
    const insertId = (insertResult as any).insertId ?? (insertResult as any)[0]?.insertId;

    const [created] = await db.select().from(pickupRequestsTable).where(eq(pickupRequestsTable.id, insertId)).limit(1);
    res.status(201).json({ request: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


router.get("/client-portal/pickup-requests", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ data: [], total: 0 }); return; }

    const conds: any[] = [
      eq(pickupRequestsTable.portalClientId, user.clientId),
      isNull(pickupRequestsTable.deletedAt),
    ];
    const rows = await db.select().from(pickupRequestsTable)
      .where(and(...conds)).orderBy(desc(pickupRequestsTable.createdAt));

    res.json({ data: rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /client-portal/invoiceable-shipments — شحنات العميل اللي لسه من غير فاتورة ─
router.get("/client-portal/invoiceable-shipments", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ data: [] }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client || !client.normalizedPhone) { res.json({ data: [] }); return; }

    const allShipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone, user.id, client.id);

    // ── اجمع كل shipmentIds اللي دخلت فاتورة قبل كده ────────────────────────
    const invConds: any[] = [eq(clientInvoicesTable.normalizedPhone, client.normalizedPhone)];
    if (user.tenantId !== null && user.tenantId !== undefined) invConds.push(eq(clientInvoicesTable.tenantId, user.tenantId));
    const existingInvoices = await db.select({ shipmentIds: clientInvoicesTable.shipmentIds })
      .from(clientInvoicesTable).where(and(...invConds));
    const alreadyInvoiced = new Set<number>();
    for (const inv of existingInvoices) {
      for (const id of (inv.shipmentIds ?? [])) alreadyInvoiced.add(id);
    }

    const invoiceable = allShipments.filter(s => !alreadyInvoiced.has(s.id) && s.status !== "warehouse_ready");
    res.json({ data: invoiceable });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /client-portal/invoices — العميل ينشئ فاتورة على شحنات مختارة بنفسه ─
const createClientInvoiceSchema = z.object({
  shipmentIds: z.array(z.number().int().positive()).min(1, "اختر شحنة واحدة على الأقل"),
});

router.post("/client-portal/invoices", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client || !client.normalizedPhone) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const parsed = createClientInvoiceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }); return; }
    const { shipmentIds } = parsed.data;

    const tenantId = user.tenantId ?? null;

    // ── تأكد إن كل الشحنات دي فعلاً بتاعة العميل نفسه (أمان) ────────────────
    const allShipments = await getClientShipments(tenantId, client.normalizedPhone, user.id, client.id);
    const ownedIds = new Set(allShipments.map(s => s.id));
    const invalidIds = shipmentIds.filter(id => !ownedIds.has(id));
    if (invalidIds.length > 0) {
      res.status(403).json({ error: "بعض الشحنات المختارة غير تابعة لحسابك" });
      return;
    }

    // ── تأكد إن ولا شحنة منهم لسه قيد الشحن في المخزن (مترحلتش بعد) ────────
    const warehouseReadyIds = new Set(allShipments.filter(s => s.status === "warehouse_ready").map(s => s.id));
    const notShippedIds = shipmentIds.filter(id => warehouseReadyIds.has(id));
    if (notShippedIds.length > 0) {
      res.status(409).json({ error: "بعض الشحنات المختارة لسه قيد الشحن في المخزن ولم تُرحّل بعد" });
      return;
    }

    // ── تأكد إن ولا شحنة منهم داخلة في فاتورة سابقة ─────────────────────────
    const invConds: any[] = [eq(clientInvoicesTable.normalizedPhone, client.normalizedPhone)];
    if (tenantId !== null && tenantId !== undefined) invConds.push(eq(clientInvoicesTable.tenantId, tenantId));
    const existingInvoices = await db.select({ shipmentIds: clientInvoicesTable.shipmentIds })
      .from(clientInvoicesTable).where(and(...invConds));
    const alreadyInvoiced = new Set<number>();
    for (const inv of existingInvoices) {
      for (const id of (inv.shipmentIds ?? [])) alreadyInvoiced.add(id);
    }
    const duplicateIds = shipmentIds.filter(id => alreadyInvoiced.has(id));
    if (duplicateIds.length > 0) {
      res.status(409).json({ error: "بعض الشحنات المختارة دخلت فاتورة قبل كده" });
      return;
    }

    // ── احسب إجمالي الفاتورة = مجموع رسوم الشحن للشحنات المختارة ──────────
    const selectedShipments = allShipments.filter(s => shipmentIds.includes(s.id));
    const totalAmount = selectedShipments.reduce((sum, s) => sum + Number(s.shippingFee ?? 0), 0);

    const now = new Date();
    const invoiceNumber = `CINV-${Date.now().toString().slice(-8)}`;

    const insertResult = await db.insert(clientInvoicesTable).values({
      tenantId,
      invoiceNumber,
      clientPhone: client.phone,
      normalizedPhone: client.normalizedPhone,
      shipmentIds,
      totalAmount: String(totalAmount),
      paidAmount: "0",
      status: "unpaid",
      createdByUserId: user.id,
      createdByName: client.name,
      createdAt: now,
      updatedAt: now,
    } as any);
    const insertId = (insertResult as any).insertId ?? (insertResult as any)[0]?.insertId;

    const [created] = await db.select().from(clientInvoicesTable).where(eq(clientInvoicesTable.id, insertId)).limit(1);

    await logAudit({
      action: "create", entityType: "client_invoice", entityId: insertId,
      entityName: invoiceNumber, userId: user.id, userName: client.name,
    }).catch(() => {});

    res.status(201).json({ invoice: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /client-portal/pickup-requests/:id/cancel — إلغاء طلب (لو لسه pending) ─
router.patch("/client-portal/pickup-requests/:id/cancel", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user.clientId || !id) { res.status(404).json({ error: "غير موجود" }); return; }

    const [existing] = await db.select().from(pickupRequestsTable)
      .where(and(eq(pickupRequestsTable.id, id), eq(pickupRequestsTable.portalClientId, user.clientId)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    if (existing.status !== "pending") {
      res.status(400).json({ error: "لا يمكن إلغاء الطلب بعد بدء إجراءات المعالجة" });
      return;
    }

    await db.update(pickupRequestsTable).set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(pickupRequestsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /client-portal/manifests — قائمة بيانات حساب العميل الحالي ─────────
router.get("/client-portal/manifests", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json([]); return; }

    const manifests = await db
      .select()
      .from(clientAccountManifestsTable)
      .where(eq(clientAccountManifestsTable.clientId, user.clientId))
      .orderBy(desc(clientAccountManifestsTable.createdAt));

    const ids = manifests.map(m => m.id);
    let statusCountMap: Record<number, { pending: number; shipping: number; delayed: number; returned: number; delivered: number; partial: number }> = {};
    let countMap: Record<number, number> = {};
    if (ids.length) {
      // ⚠️ كل الشحنات اللي جوة البيان بتتحسب هنا (بما فيها "قيد الانتظار" =
      // pending)، عشان shipmentCount + مجموع statusCounts يطابقوا بالظبط عدد
      // الشحنات الفعلي جوة البيان — نفس فيكس /client-account-manifests
      // (راوت الأدمن). قديمًا كان pending بيتشال بالكامل من هنا فكان الإجمالي
      // ("إجمالي الأوردرات") بيفرق عن عدد الشحنات الحقيقي في البيان.
      const counts = await db
        .select({
          manifestId: clientAccountManifestItemsTable.manifestId,
          deliveryStatus: clientAccountManifestItemsTable.deliveryStatus,
          cnt: count(),
        })
        .from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.manifestId, ids))
        .groupBy(clientAccountManifestItemsTable.manifestId, clientAccountManifestItemsTable.deliveryStatus);

      counts.forEach(r => {
        const mid = r.manifestId;
        countMap[mid] = (countMap[mid] ?? 0) + Number(r.cnt);
        if (!statusCountMap[mid]) statusCountMap[mid] = { pending: 0, shipping: 0, delayed: 0, returned: 0, delivered: 0, partial: 0 };
        const st = r.deliveryStatus ?? "pending";
        const n = Number(r.cnt);
        if (st === "shipping") statusCountMap[mid].shipping += n;
        else if (st === "delayed") statusCountMap[mid].delayed += n;
        else if (st === "returned") statusCountMap[mid].returned += n;
        else if (st === "delivered") statusCountMap[mid].delivered += n;
        else if (st === "partial_delivered") statusCountMap[mid].partial += n;
        // pending + أي حالة تانية غير متوقعة بتتحسب "قيد العمل"، عشان مجموع
        // كل الحقول يطابق shipmentCount دايمًا (نفس منطق راوت الأدمن).
        else statusCountMap[mid].pending += n;
      });
    }

    // ─── الشحنات "المعلّقة" الخاصة بالعميل: وصلت warehouse_ready أو أبعد
    // (مش لسه waiting/pending)، ومفيهاش أي صف خالص في جدول بنود بيانات حساب
    // العميل (بغض النظر عن أي بيان مفتوح أو مغلق). نفس منطق الالتقاط بالظبط
    // المستخدم في rolloverPendingItemsToNewManifest (client-account-manifests.ts)
    // عشان الرقم المعروض للعميل يطابق تمامًا اللي هيترحّل فعليًا عند الإغلاق.
    let pendingShipmentsCount = 0;
    const clientShipmentRows = await db
      .select({ id: shipmentsTable.id, status: shipmentsTable.status })
      .from(shipmentsTable)
      .where(eq(shipmentsTable.clientId, user.clientId));
    const eligibleShipmentIds = clientShipmentRows
      .filter(s => !["waiting", "pending"].includes(s.status))
      .map(s => s.id);
    if (eligibleShipmentIds.length) {
      const existingItemRows = await db
        .select({ shipmentId: clientAccountManifestItemsTable.shipmentId })
        .from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.shipmentId, eligibleShipmentIds));
      const alreadyInManifest = new Set(existingItemRows.map(r => r.shipmentId));
      pendingShipmentsCount = eligibleShipmentIds.filter(sid => !alreadyInManifest.has(sid)).length;
    }

    const result = manifests.map(m => ({
      ...m,
      shipmentCount: countMap[m.id] ?? 0,
      statusCounts: statusCountMap[m.id] ?? { pending: 0, shipping: 0, delayed: 0, returned: 0, delivered: 0, partial: 0 },
      // بيتضاف بس لبيان الـ "open" الحالي، لأنه هو الوحيد المعروض فوق للعميل
      // مع شريط نسبة التسليم. البيانات المغلقة/الأرشيف ما تحتاجش الرقم ده.
      pendingShipmentsCount: m.status === "open" ? pendingShipmentsCount : 0,
    }));

    res.json(result);
  } catch (e) {
    console.error("[GET /client-portal/manifests]", e);
    res.status(500).json({ error: "خطأ في جلب البيانات" });
  }
});

// ─── GET /client-portal/manifests/:id — تفاصيل بيان واحد (ملك العميل الحالي فقط) ──
router.get("/client-portal/manifests/:id", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user.clientId) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const [manifest] = await db.select().from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, id));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifest.clientId !== user.clientId) { res.status(403).json({ error: "غير مصرح لك بعرض هذا البيان" }); return; }

    // ── تصنيف العميل (لتحديد أي عمود سعر نستخدمه من جدول مناطق الشحن) ──────
    // نفس منطق /client-account-manifests/:id في الأدمن بالظبط.
    const [clientRow] = await db
      .select({ clientType: clientsTable.clientType })
      .from(clientsTable)
      .where(eq(clientsTable.id, manifest.clientId));
    const clientType = clientRow?.clientType ?? "normal";

    // ── الحالات اللي لسه معتبرة "لم تستلمها الشركة فعليًا" — بيان العميل ──────
    // متعرضش شحنات لسه بحالة قيد الانتظار (pending/waiting) أو مؤكدة بس لسه
    // مش داخلة المخزن (confirmed). البيان يبدأ من "قيد الشحن في المخزن" فصاعدًا.
    const PRE_WAREHOUSE_STATUSES = ["pending", "waiting", "confirmed"];

    const allItems = await db
      .select()
      .from(clientAccountManifestItemsTable)
      .where(eq(clientAccountManifestItemsTable.manifestId, id));

    const allShipmentIds = allItems.map(i => i.shipmentId);
    let allShipments: any[] = [];
    if (allShipmentIds.length) {
      allShipments = await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, allShipmentIds));
    }
    const shipmentStatusMap: Record<number, string> = {};
    allShipments.forEach(s => { shipmentStatusMap[s.id] = s.status; });

    const items = allItems.filter(i => {
      const st = shipmentStatusMap[i.shipmentId];
      return st != null && !PRE_WAREHOUSE_STATUSES.includes(st);
    });

    const shipmentIds = items.map(i => i.shipmentId);
    const shipmentMap: Record<number, any> = {};
    allShipments.forEach(s => { shipmentMap[s.id] = s; });

    // ── returnValueReceived للمرتجع بالأسباب المالية (رفض بعد المعاينة / تهرب) ──
    // القيمة دي بتتسجل في جدول بيان الشحن (shipment_manifest_items) مش في جدول
    // بيان حساب العميل نفسه، فبنجيبها هنا كـ fallback — نفس منطق الأدمن بالظبط
    // (client-account-manifests.ts) عشان الرقم في صفحة العميل يطابق الأدمن.
    let shipmentReturnValueMap: Record<number, number> = {};
    if (shipmentIds.length) {
      const smItems = await db
        .select({
          shipmentId: shipmentManifestItemsTable.shipmentId,
          returnValueReceived: shipmentManifestItemsTable.returnValueReceived,
          addedAt: shipmentManifestItemsTable.addedAt,
        })
        .from(shipmentManifestItemsTable)
        .where(and(
          inArray(shipmentManifestItemsTable.shipmentId, shipmentIds),
          eq(shipmentManifestItemsTable.deliveryStatus, "returned"),
        ));
      smItems
        .filter(r => r.returnValueReceived != null)
        .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime())
        .forEach(row => {
          shipmentReturnValueMap[row.shipmentId] = Number(row.returnValueReceived);
        });
    }

    // ── سعر المنطقة (zone pricing) حسب تصنيف العميل — نفس منطق الأدمن بالظبط ──
    // مش تكلفة المندوب (courierCost)، ده سعر التوصيل بتاع منطقة الشحنة، ونفس
    // مصدر الحقيقة اللي بتستخدمه /client-account-manifests/:id (getZoneShipping).
    const zoneIds = [...new Set(items.map(i => shipmentMap[i.shipmentId]?.zoneId).filter((v): v is number => !!v))];
    let zonePriceMap: Record<number, number> = {};
    if (zoneIds.length) {
      const zoneRows = await db.select().from(shipmentZonesTable).where(inArray(shipmentZonesTable.id, zoneIds));
      zonePriceMap = Object.fromEntries(zoneRows.map(z => {
        const priceByType =
          clientType === "vip"        ? z.priceVip :
          clientType === "commercial" ? z.priceCommercial :
          z.priceNormal;
        const resolved = (priceByType != null && Number(priceByType) > 0) ? priceByType : z.price;
        return [z.id, Number(resolved) || 0];
      }));
    }
    const getZoneShipping = (shipment: any) =>
      shipment?.zoneId ? (zonePriceMap[shipment.zoneId] ?? Number(shipment.shippingFee ?? 0)) : Number(shipment?.shippingFee ?? 0);

    const repUserIds = [...new Set(items.map(i => shipmentMap[i.shipmentId]?.assignedUserId).filter((v): v is number => !!v))];
    let repNameMap: Record<number, string> = {};
    if (repUserIds.length) {
      const repUsers = await db
        .select({ id: usersTable.id, displayName: usersTable.displayName })
        .from(usersTable)
        .where(inArray(usersTable.id, repUserIds));
      repNameMap = Object.fromEntries(repUsers.map(u => [u.id, u.displayName]));
    }

    const warehouseIds = [...new Set(items.map(i => shipmentMap[i.shipmentId]?.warehouseId).filter((v): v is number => !!v))];
    let warehouseNameMap: Record<number, string> = {};
    if (warehouseIds.length) {
      const warehouseRows = await db
        .select({ id: warehousesTable.id, name: warehousesTable.name })
        .from(warehousesTable)
        .where(inArray(warehousesTable.id, warehouseIds));
      warehouseNameMap = Object.fromEntries(warehouseRows.map(w => [w.id, w.name]));
    }

    // ── أسعار "الزيادة على نوع الشحنة" (basePrice = سعر العميل، مش repExtraCost
    // بتاع المندوب) — نفس منطق /client-account-manifests/:id في الأدمن بالظبط ──
    const parcelTypes = [...new Set(items.map(i => shipmentMap[i.shipmentId]?.parcelType).filter((v): v is string => !!v))];
    let parcelPricingMap: Record<string, { label: string; basePrice: number }> = {};
    if (parcelTypes.length) {
      const conds: any[] = [inArray(parcelTypePricingTable.parcelType, parcelTypes)];
      if (manifest.tenantId !== null && manifest.tenantId !== undefined) {
        conds.push(or(eq(parcelTypePricingTable.tenantId, manifest.tenantId), isNull(parcelTypePricingTable.tenantId)));
      }
      const pricingRows = await db
        .select({
          tenantId: parcelTypePricingTable.tenantId,
          parcelType: parcelTypePricingTable.parcelType,
          label: parcelTypePricingTable.label,
          basePrice: parcelTypePricingTable.basePrice,
        })
        .from(parcelTypePricingTable)
        .where(and(...conds));
      const currentTenantId = manifest.tenantId ?? null;
      for (const row of pricingRows) {
        const existing = parcelPricingMap[row.parcelType];
        const isTenantRow = row.tenantId !== null && row.tenantId !== undefined && row.tenantId === currentTenantId;
        if (!existing || isTenantRow) {
          parcelPricingMap[row.parcelType] = { label: row.label ?? row.parcelType, basePrice: Number(row.basePrice ?? 0) };
        }
      }
    }

    // نفس الأسباب المالية الثلاثة المستخدمة في الأدمن — لازم تفضل متطابقة عشان
    // القيمة المستلمة/سعر الشحن يطابقوا الظاهر فعليًا في صفحة الأدمن.
    const RETURN_REASONS_WITH_VALUE = new Set(["refused_paid", "refused_unpaid", "quality"]);

    const enrichedItems = items.map(item => {
      const sh = shipmentMap[item.shipmentId] ?? null;
      // fallback: السبب/القيمة الحقيقية ممكن تكون مسجلة على مستوى الشحنة نفسها
      // مش على مستوى item بيان حساب العميل — نفس منطق الأدمن بالظبط.
      const effectiveReturnReason = (item as any).returnReason ?? sh?.returnReason ?? null;
      const isReturnedWithValue = item.deliveryStatus === "returned"
        && RETURN_REASONS_WITH_VALUE.has(String(effectiveReturnReason ?? ""));
      // نفس مصدر الحقيقة الموحّد بتاع الأدمن بالظبط (client-account-manifests.ts:
      // getZoneShipping) — سعر المنطقة الحالي (zone pricing) حسب تصنيف العميل، وإلا
      // shippingFee الخام كـ fallback. لازم يفضل نفس المصدر عشان الرقمين ميختلفوش.
      const zoneShippingForItem = (item.deliveryStatus !== "returned" || isReturnedWithValue)
        ? getZoneShipping(sh)
        : 0;
      return {
        ...item,
        returnReason: effectiveReturnReason,
        partialQuantity: item.partialQuantity != null ? item.partialQuantity : (sh?.partialQuantity ?? null),
        returnValueReceived: isReturnedWithValue
          ? ((item as any).returnValueReceived != null
              ? (item as any).returnValueReceived
              : (shipmentReturnValueMap[item.shipmentId] ?? null))
          : null,
        shipment: sh,
        status:        sh?.status ?? null,
        customerName:  sh?.receiverName  ?? "",
        phone:         sh?.receiverPhone ?? "",
        city:          sh?.receiverCity  ?? "",
        address:       sh?.receiverAddress ?? "",
        senderName:    sh?.senderName    ?? "",
        quantity:      sh?.pieces        ?? 1,
        // نفس مصدر الحقيقة اللي بيعرضه الأدمن فعليًا (client-account-manifest-detail.tsx
        // adapter): totalPrice = sh.totalAmount الثابت المسجل على الشحنة نفسها، مش
        // codAmount + zoneShipping المُعاد حسابه لايف — الاتنين ممكن يختلفوا لو اتغيرت
        // أسعار المناطق بعد تسجيل الشحنة، والأدمن بيعرض القيمة الثابتة دايمًا.
        totalPrice:    Number(sh?.totalAmount ?? sh?.codAmount ?? 0),
        unitPrice:     Number(sh?.totalAmount ?? sh?.codAmount ?? 0),
        shippingCost:  zoneShippingForItem,
        // بيان العميل بيعرض سعر العميل (basePrice) — مش تكلفة المندوب الداخلية
        repExtraCost:  (zoneShippingForItem > 0 && sh?.parcelType) ? (parcelPricingMap[sh.parcelType]?.basePrice ?? 0) : 0,
        repExtraReason: (zoneShippingForItem > 0 && sh?.parcelType && (parcelPricingMap[sh.parcelType]?.basePrice ?? 0) > 0)
          ? (parcelPricingMap[sh.parcelType]?.label ?? sh.parcelType)
          : null,
        invoiceNumber: sh?.shipmentNumber ?? "",
        representativeName: sh?.assignedUserId ? (repNameMap[sh.assignedUserId] ?? null) : null,
        warehouseName: sh?.warehouseId ? (warehouseNameMap[sh.warehouseId] ?? null) : null,
      };
    });

    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending").length;
    const shipping  = items.filter(i => i.deliveryStatus === "shipping").length;
    const delayed   = items.filter(i => i.deliveryStatus === "delayed").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered").length;

    res.json({
      ...manifest,
      items: enrichedItems,
      stats: { total: items.length, delivered, returned, pending, shipping, delayed, partial },
    });
  } catch (e) {
    console.error("[GET /client-portal/manifests/:id]", e);
    res.status(500).json({ error: "خطأ في جلب البيان" });
  }
});

// ─── POST /client-portal/manifests/:manifestId/items/:itemId/confirm-return — العميل يأكد استلام البضاعة من شركة الشحن ──
// العميل يقدر بس يأكد "تم الاستلام" (returnReceived=1) — مفيش صلاحية للتراجع أو تعديل حالة الشحنة نفسها،
// ده محصور في الأدمن/المندوب فقط عبر /client-account-manifests.
router.post("/client-portal/manifests/:manifestId/items/:itemId/confirm-return", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }
    const manifestId = Number(req.params.manifestId);
    const itemId = Number(req.params.itemId);

    const [manifest] = await db.select().from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, manifestId));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifest.clientId !== user.clientId) { res.status(403).json({ error: "غير مصرح لك بهذا البيان" }); return; }

    const [item] = await db.select().from(clientAccountManifestItemsTable)
      .where(and(eq(clientAccountManifestItemsTable.id, itemId), eq(clientAccountManifestItemsTable.manifestId, manifestId)));
    if (!item) { res.status(404).json({ error: "الشحنة غير موجودة في هذا البيان" }); return; }

    await db.update(clientAccountManifestItemsTable)
      .set({ returnReceived: 1 })
      .where(eq(clientAccountManifestItemsTable.id, itemId));

    res.json({ success: true });
  } catch (e) {
    console.error("[POST /client-portal/manifests/:manifestId/items/:itemId/confirm-return]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الاستلام" });
  }
});

// ─── POST /client-portal/manifests/:id/request-disbursement — طلب صرف الإيراد ──
// إشعار بصري + تسجيل وقت الطلب بالباك إند (عشان الحالة تفضل محفوظة عبر الأجهزة/الجلسات).
// مفيش تحويل فعلي للأموال هنا — مجرد تسجيل نية العميل، وفريق العمل يتابع يدويًا.
router.post("/client-portal/manifests/:id/request-disbursement", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user.clientId) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const [manifest] = await db.select().from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, id));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifest.clientId !== user.clientId) { res.status(403).json({ error: "غير مصرح لك" }); return; }
    if (manifest.status !== "closed") { res.status(400).json({ error: "البيان لسه مفتوح — الإيراد بيترحّل بعد الإغلاق فقط" }); return; }

    if (!manifest.revenueDisbursementRequestedAt) {
      await db.update(clientAccountManifestsTable)
        .set({ revenueDisbursementRequestedAt: new Date() })
        .where(eq(clientAccountManifestsTable.id, id));
    }

    res.json({ success: true, message: "سيتم ترحيل الإيراد خلال 24 ساعة عبر مندوب أو محفظة فودافون كاش، وسيتم التواصل مع سيادتكم من أحد فريق العمل." });
  } catch (e) {
    console.error("[POST /client-portal/manifests/:id/request-disbursement]", e);
    res.status(500).json({ error: "خطأ في تسجيل طلب صرف الإيراد" });
  }
});

// ─── GET /client-portal/manifests/:id/benchmark — مقارنة أداء البيان بمتوسط كل العملاء ──
// بيرجع نسبة تسليم العميل الحالي في البيان ده، مقابل متوسط نسبة التسليم لكل
// العملاء الآخرين (من كل عناصر البيانات المغلقة+المفتوحة) — لطمأنة العميل وقت
// ظهور أرقام واطية، أو لتفسيرها بشكل موضوعي.
router.get("/client-portal/manifests/:id/benchmark", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user.clientId) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const [manifest] = await db.select().from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, id));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifest.clientId !== user.clientId) { res.status(403).json({ error: "غير مصرح لك" }); return; }

    // ── نسبة تسليم البيان الحالي ──────────────────────────────────────────
    const currentItems = await db.select({ deliveryStatus: clientAccountManifestItemsTable.deliveryStatus })
      .from(clientAccountManifestItemsTable)
      .where(eq(clientAccountManifestItemsTable.manifestId, id));
    const currentTotal = currentItems.length;
    const currentCompleted = currentItems.filter(
      i => i.deliveryStatus === "delivered" || i.deliveryStatus === "partial_delivered"
    ).length;
    const currentRate = currentTotal > 0 ? Math.round((currentCompleted / currentTotal) * 100) : 0;

    // ── متوسط نسبة التسليم عبر كل عملاء نفس الـ tenant (باستثناء بيانات العميل الحالي) ──
    const tenantCondition = manifest.tenantId != null
      ? or(eq(clientAccountManifestsTable.tenantId, manifest.tenantId), isNull(clientAccountManifestsTable.tenantId))
      : undefined;

    const otherManifests = await db
      .select({ id: clientAccountManifestsTable.id })
      .from(clientAccountManifestsTable)
      .where(and(tenantCondition, sql`${clientAccountManifestsTable.clientId} != ${manifest.clientId}`));

    let avgRate = currentRate; // fallback لو مفيش بيانات كافية للمقارنة
    if (otherManifests.length > 0) {
      const otherIds = otherManifests.map(m => m.id);
      const otherItems = await db
        .select({ deliveryStatus: clientAccountManifestItemsTable.deliveryStatus })
        .from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.manifestId, otherIds));
      const otherTotal = otherItems.length;
      const otherCompleted = otherItems.filter(
        i => i.deliveryStatus === "delivered" || i.deliveryStatus === "partial_delivered"
      ).length;
      if (otherTotal > 0) {
        avgRate = Math.round((otherCompleted / otherTotal) * 100);
      }
    }

    res.json({
      currentRate,
      averageRate: avgRate,
      comparedToAverage: currentRate - avgRate, // موجب = أفضل من المتوسط
      sampleSize: otherManifests.length,
    });
  } catch (e) {
    console.error("[GET /client-portal/manifests/:id/benchmark]", e);
    res.status(500).json({ error: "خطأ في حساب المقارنة" });
  }
});

// ─── GET /client-portal/returns — المرتجعات المجمّعة من كل بيانات العميل ────
// يشمل: مرتجع (returned)، مؤجل (delayed)، ومسلَّم جزئي لسه الباقي عند الشحن
router.get("/client-portal/returns", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json([]); return; }

    const manifests = await db
      .select({ id: clientAccountManifestsTable.id, manifestNumber: clientAccountManifestsTable.manifestNumber })
      .from(clientAccountManifestsTable)
      .where(eq(clientAccountManifestsTable.clientId, user.clientId));
    const manifestIds = manifests.map(m => m.id);
    const manifestNumberMap = Object.fromEntries(manifests.map(m => [m.id, m.manifestNumber]));
    if (!manifestIds.length) { res.json([]); return; }

    const items = await db
      .select()
      .from(clientAccountManifestItemsTable)
      .where(and(
        inArray(clientAccountManifestItemsTable.manifestId, manifestIds),
        inArray(clientAccountManifestItemsTable.deliveryStatus, ["returned", "delayed", "partial_delivered"]),
      ));

    const shipmentIds = items.map(i => i.shipmentId);
    let shipments: any[] = [];
    if (shipmentIds.length) {
      shipments = await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds));
    }
    const shipmentMap: Record<number, any> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    const result = items
      // partial_delivered لسه في الشحن فقط (اللي اتسلمت بالكامل بالفعل مستبعدة)
      .filter(i => i.deliveryStatus !== "partial_delivered" || i.returnReceived !== 1)
      .map(item => {
        const sh = shipmentMap[item.shipmentId] ?? null;
        return {
          id: item.id,
          shipmentId: item.shipmentId,
          manifestId: item.manifestId,
          manifestNumber: manifestNumberMap[item.manifestId] ?? "",
          deliveryStatus: item.deliveryStatus,
          deliveryNote: item.deliveryNote,
          returnReceived: item.returnReceived,
          returnReason: item.returnReason,
          partialQuantity: item.partialQuantity,
          customerName: sh?.receiverName ?? "",
          phone: sh?.receiverPhone ?? "",
          city: sh?.receiverCity ?? "",
          totalPrice: Number(sh?.codAmount ?? 0) || Number(sh?.totalAmount ?? 0),
          invoiceNumber: sh?.shipmentNumber ?? "",
          addedAt: item.addedAt,
        };
      });

    res.json(result);
  } catch (e) {
    console.error("[GET /client-portal/returns]", e);
    res.status(500).json({ error: "خطأ في جلب المرتجعات" });
  }
});

// ─── GET /client-portal/returns/analysis — تحليل المرتجعات: توزيع المناطق + مقارنة بمتوسط العملاء ──
router.get("/client-portal/returns/analysis", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ zones: [], clientReturnRate: 0, averageReturnRate: 0, comparisonNote: "" }); return; }

    // ── بيانات العميل الحالي ──────────────────────────────────────────────
    const myManifests = await db
      .select({ id: clientAccountManifestsTable.id, tenantId: clientAccountManifestsTable.tenantId })
      .from(clientAccountManifestsTable)
      .where(eq(clientAccountManifestsTable.clientId, user.clientId));
    const myManifestIds = myManifests.map(m => m.id);
    const tenantId = myManifests[0]?.tenantId ?? null;

    let myItems: any[] = [];
    if (myManifestIds.length) {
      myItems = await db.select().from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.manifestId, myManifestIds));
    }
    const myTotal = myItems.length;
    const myReturned = myItems.filter(i => i.deliveryStatus === "returned").length;
    const clientReturnRate = myTotal > 0 ? Math.round((myReturned / myTotal) * 100) : 0;

    // ── توزيع المرتجعات على المناطق (المدن) ──────────────────────────────
    const returnedItems = myItems.filter(i => i.deliveryStatus === "returned");
    const returnedShipmentIds = returnedItems.map(i => i.shipmentId);
    let returnedShipments: any[] = [];
    if (returnedShipmentIds.length) {
      returnedShipments = await db.select({ id: shipmentsTable.id, receiverCity: shipmentsTable.receiverCity })
        .from(shipmentsTable).where(inArray(shipmentsTable.id, returnedShipmentIds));
    }
    const cityMap: Record<number, string> = {};
    returnedShipments.forEach(s => { cityMap[s.id] = s.receiverCity || "غير محدد"; });

    const zoneCounts = new Map<string, number>();
    returnedItems.forEach(i => {
      const city = cityMap[i.shipmentId] ?? "غير محدد";
      zoneCounts.set(city, (zoneCounts.get(city) ?? 0) + 1);
    });
    const zones = Array.from(zoneCounts.entries())
      .map(([city, cnt]) => ({
        city,
        count: cnt,
        percentage: returnedItems.length > 0 ? Math.round((cnt / returnedItems.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // ── متوسط نسبة المرتجعات لباقي العملاء (نفس الـ tenant) ───────────────
    const tenantCondition = tenantId != null
      ? or(eq(clientAccountManifestsTable.tenantId, tenantId), isNull(clientAccountManifestsTable.tenantId))
      : undefined;
    const otherManifests = await db
      .select({ id: clientAccountManifestsTable.id })
      .from(clientAccountManifestsTable)
      .where(and(tenantCondition, sql`${clientAccountManifestsTable.clientId} != ${user.clientId}`));

    let averageReturnRate = clientReturnRate;
    if (otherManifests.length > 0) {
      const otherIds = otherManifests.map(m => m.id);
      const otherItems = await db.select({ deliveryStatus: clientAccountManifestItemsTable.deliveryStatus })
        .from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.manifestId, otherIds));
      const otherTotal = otherItems.length;
      const otherReturned = otherItems.filter(i => i.deliveryStatus === "returned").length;
      if (otherTotal > 0) averageReturnRate = Math.round((otherReturned / otherTotal) * 100);
    }

    const diff = clientReturnRate - averageReturnRate;
    let comparisonNote = "";
    if (otherManifests.length === 0) {
      comparisonNote = "لا توجد بيانات كافية للمقارنة حاليًا";
    } else if (diff <= 0) {
      comparisonNote = "الوضع يعتبر كويس إلى حدٍ ما مقارنةً ببعض العملاء الآخرين";
    } else if (diff <= 5) {
      comparisonNote = "نسبة المرتجعات قريبة من المتوسط العام";
    } else {
      comparisonNote = "نسبة المرتجعات أعلى من المتوسط العام بشكل ملحوظ";
    }

    res.json({
      zones,
      clientReturnRate,
      averageReturnRate,
      comparisonNote,
      sampleSize: otherManifests.length,
    });
  } catch (e) {
    console.error("[GET /client-portal/returns/analysis]", e);
    res.status(500).json({ error: "خطأ في تحليل المرتجعات" });
  }
});

// ─── GET /client-portal/return-manifests — بيانات المرتجعات الخاصة بالعميل الحالي ──
// (بيان مرتجعات مفتوح دايمًا + بيانات مغلقة سابقة) — نفس مفهوم client_return_manifests
// في الأدمن، لكن مقفول على العميل الحالي فقط. عرض/طباعة فقط، بدون أي تعديل من العميل.
router.get("/client-portal/return-manifests", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json([]); return; }

    const manifests = await db
      .select()
      .from(clientReturnManifestsTable)
      .where(eq(clientReturnManifestsTable.clientId, user.clientId))
      .orderBy(desc(clientReturnManifestsTable.createdAt));

    const ids = manifests.map(m => m.id);
    let countMap: Record<number, number> = {};
    let totalCodMap: Record<number, number> = {};
    if (ids.length) {
      const items = await db
        .select({
          manifestId: clientReturnManifestItemsTable.manifestId,
          codAmount: clientReturnManifestItemsTable.codAmount,
        })
        .from(clientReturnManifestItemsTable)
        .where(inArray(clientReturnManifestItemsTable.manifestId, ids));
      items.forEach(i => {
        countMap[i.manifestId] = (countMap[i.manifestId] ?? 0) + 1;
        totalCodMap[i.manifestId] = (totalCodMap[i.manifestId] ?? 0) + (Number(i.codAmount) || 0);
      });
    }

    const result = manifests.map(m => ({
      ...m,
      itemsCount: countMap[m.id] ?? 0,
      totalCodAmount: totalCodMap[m.id] ?? 0,
    }));

    res.json(result);
  } catch (e) {
    console.error("[GET /client-portal/return-manifests]", e);
    res.status(500).json({ error: "خطأ في جلب بيانات المرتجعات" });
  }
});

// ─── GET /client-portal/return-manifests/:id — تفاصيل بيان مرتجعات واحد (ملك العميل الحالي فقط) ──
router.get("/client-portal/return-manifests/:id", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user.clientId) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const [manifest] = await db.select().from(clientReturnManifestsTable)
      .where(eq(clientReturnManifestsTable.id, id)).limit(1);
    if (!manifest) { res.status(404).json({ error: "بيان المرتجعات غير موجود" }); return; }
    if (manifest.clientId !== user.clientId) { res.status(403).json({ error: "غير مصرح لك بعرض هذا البيان" }); return; }

    const items = await db.select().from(clientReturnManifestItemsTable)
      .where(eq(clientReturnManifestItemsTable.manifestId, id))
      .orderBy(desc(clientReturnManifestItemsTable.addedAt));

    const totalCodAmount = items.reduce((s, i) => s + (Number(i.codAmount) || 0), 0);

    res.json({ ...manifest, items, stats: { total: items.length, totalCodAmount } });
  } catch (e) {
    console.error("[GET /client-portal/return-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في جلب تفاصيل بيان المرتجعات" });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ─── استيراد شحنات العميل من إكسيل (client-portal) ─────────────────────────
// نفس منطق /shipments/import بتاع الأدمن، لكن العميل مقفول على نفسه (client.id
// و client.name/phone/city بتتحدد من الحساب مش من الإكسيل، ومفيش عمود "اسم راسل")
// ══════════════════════════════════════════════════════════════════════════

async function parseExcelToRaw(buffer: Buffer, originalname: string): Promise<{ headers: string[]; rows: any[][] }> {
  const isCSV = /\.csv$/i.test(originalname);
  const workbook = new ExcelJS.Workbook();

  if (isCSV) {
    const { Readable } = await import("stream");
    const stream = Readable.from(buffer.toString("utf-8"));
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(buffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };

  const actualColCount = worksheet.columnCount || worksheet.actualColumnCount || 0;
  let headers: string[] = [];
  const rows: any[][] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    const rawValues = row.values as any[];
    const values: any[] = [];
    const maxCol = Math.max(actualColCount, rawValues.length - 1);
    for (let c = 1; c <= maxCol; c++) {
      const v = rawValues[c];
      if (v === null || v === undefined) values.push("");
      else if (typeof v === "object" && "result" in v) values.push(v.result ?? "");
      else values.push(v);
    }
    if (rowNum === 1) {
      headers = values.map(v => String(v ?? "").trim());
    } else {
      if (values.some(v => String(v ?? "").trim() !== "")) rows.push(values);
    }
  });

  return { headers, rows };
}

// ─── POST /client-portal/shipments/import/parse ────────────────────────────
router.post("/client-portal/shipments/import/parse", importUpload.single("file"), async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }
    if (!req.file) { res.status(400).json({ error: "لم يتم رفع ملف" }); return; }

    const { headers, rows } = await parseExcelToRaw(req.file.buffer, req.file.originalname);
    if (!headers.length) { res.status(400).json({ error: "الملف فارغ أو غير مدعوم" }); return; }
    res.json({ headers, sample: rows.slice(0, 5), totalRows: rows.length, allRows: rows });
  } catch (err: any) {
    res.status(500).json({ error: `فشل قراءة الملف: ${err.message}` });
  }
});

// ─── POST /client-portal/shipments/import/execute ──────────────────────────
router.post("/client-portal/shipments/import/execute", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client) { res.status(403).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }
    if (client.accountStatus === "suspended") {
      res.status(403).json({ error: "الحساب موقوف — يرجى التواصل مع الدعم" });
      return;
    }

    const { headers, rows, mapping } = req.body as {
      headers: string[];
      rows: any[][];
      mapping: {
        receiverName?: string;
        receiverPhone?: string;
        receiverPhone2?: string;
        receiverAddress?: string;
        receiverCity?: string;
        zone?: string;
        parcelType?: string;
        weight?: string;
        pieces?: string;
        description?: string;
        paymentMethod?: string;
        codAmount?: string;
        notes?: string;
        canOpen?: string;
        isDivisible?: string;
        rejectionPolicy?: string;
      };
    };

    if (!headers?.length || !rows?.length || !mapping) {
      res.status(400).json({ error: "بيانات غير مكتملة" });
      return;
    }

    const tenantId = user.tenantId ?? null;

    const headerIdx: Record<string, number> = {};
    headers.forEach((h, i) => { headerIdx[h] = i; });
    const getCell = (row: any[], colName: string | undefined): string => {
      if (!colName) return "";
      const idx = headerIdx[colName];
      if (idx === undefined) return "";
      const v = row[idx];
      if (v === null || v === undefined) return "";
      return String(v).trim();
    };

    const zones = await db.select().from(shipmentZonesTable)
      .where(tenantId !== null ? eq(shipmentZonesTable.tenantId, tenantId) : undefined as any);
    const parcelPricing = await db.select().from(parcelTypePricingTable)
      .where(tenantId !== null ? eq(parcelTypePricingTable.tenantId, tenantId) : undefined as any);

    const norm = (s: string) => s.trim().toLowerCase();

    const findZone = (raw: string) => {
      if (!raw) return null;
      const n = norm(raw);
      return zones.find(z => {
        const name = norm(z.name || "");
        const gov = norm(z.toGovernorate || "");
        const combo = gov && name ? `${gov} - ${name}` : (gov || name);
        return name === n || combo === n || gov === n;
      }) ?? zones.find(z => norm(z.name || "").includes(n) || norm(z.toGovernorate || "").includes(n)) ?? null;
    };

    const PARCEL_TYPE_MAP: Record<string, string> = {
      "مستندات": "document", "document": "document",
      "عادي": "normal", "normal": "normal",
      "قابل للكسر": "fragile", "fragile": "fragile",
      "ثقيل": "heavy", "heavy": "heavy",
      "إلكترونيات": "electronics", "electronics": "electronics",
      "ملابس": "clothing", "clothing": "clothing",
      "طعام": "food", "food": "food",
      "أخرى": "other", "other": "other",
    };
    const findParcelPricing = (raw: string) => {
      if (!raw) return null;
      const n = norm(raw);
      const mappedType = PARCEL_TYPE_MAP[raw] ?? PARCEL_TYPE_MAP[n] ?? null;
      return parcelPricing.find(p => p.parcelType === mappedType)
        ?? parcelPricing.find(p => norm(p.label || "") === n || norm(p.parcelType) === n)
        ?? null;
    };

    const PAYMENT_METHOD_MAP: Record<string, string> = {
      "الدفع عند الاستلام": "cod", "الدفع عند الاستلام (cod)": "cod", "cod": "cod",
      "مدفوع مسبقا": "prepaid", "مدفوع مسبقاً": "prepaid", "prepaid": "prepaid",
      "آجل": "deferred", "اجل": "deferred", "deferred": "deferred",
    };

    const YES_NO_MAP: Record<string, number> = { "نعم": 1, "لا": 0 };
    const parseYesNo = (raw: string): number | null => {
      const n = raw.trim();
      return n in YES_NO_MAP ? YES_NO_MAP[n] : null;
    };

    const REJECTION_POLICY_MAP: Record<string, string> = {
      "دفع كامل": "full_fee", "مجاني": "free",
    };

    const errors: string[] = [];
    const validShipments: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const receiverName    = getCell(row, mapping.receiverName);
      const receiverPhone   = getCell(row, mapping.receiverPhone) || null;
      const receiverPhone2  = getCell(row, mapping.receiverPhone2) || null;
      const receiverAddress = getCell(row, mapping.receiverAddress) || null;
      const receiverCityRaw = getCell(row, mapping.receiverCity) || null;
      const zoneRaw          = getCell(row, mapping.zone);
      const parcelTypeRaw    = getCell(row, mapping.parcelType);
      const rawWeight        = getCell(row, mapping.weight);
      const rawPieces        = getCell(row, mapping.pieces);
      const description      = getCell(row, mapping.description) || null;
      const paymentMethodRaw = getCell(row, mapping.paymentMethod);
      const rawCodAmount     = getCell(row, mapping.codAmount);
      const notes            = getCell(row, mapping.notes) || null;
      const canOpenRaw        = getCell(row, mapping.canOpen);
      const isDivisibleRaw    = getCell(row, mapping.isDivisible);
      const rejectionPolicyRaw = getCell(row, mapping.rejectionPolicy);

      if (!receiverName) { errors.push(`الصف ${rowNum}: اسم المستلم مطلوب`); continue; }

      let zoneId: number | null = null;
      let zonePrice = 0;
      let resolvedReceiverCity = receiverCityRaw;
      if (zoneRaw) {
        const zone = findZone(zoneRaw);
        if (!zone) { errors.push(`الصف ${rowNum}: منطقة التوصيل "${zoneRaw}" غير موجودة في النظام`); continue; }
        zoneId = zone.id;
        zonePrice = Number(zone.price) || 0;
        if (!resolvedReceiverCity) resolvedReceiverCity = zone.toGovernorate ?? null;
      }

      let parcelType: string | null = null;
      let parcelTypePrice = 0;
      if (parcelTypeRaw) {
        const pricing = findParcelPricing(parcelTypeRaw);
        if (!pricing) { errors.push(`الصف ${rowNum}: نوع الشحنة "${parcelTypeRaw}" غير موجود في النظام`); continue; }
        parcelType = pricing.parcelType;
        parcelTypePrice = Number(pricing.basePrice) || 0;
      }

      const shippingFee = zonePrice + parcelTypePrice;

      const canOpen = canOpenRaw ? parseYesNo(canOpenRaw) : null;
      if (canOpenRaw && canOpen === null) { errors.push(`الصف ${rowNum}: حالة الفتح يجب أن تكون "نعم" أو "لا"`); continue; }

      const isDivisible = isDivisibleRaw ? parseYesNo(isDivisibleRaw) : null;
      if (isDivisibleRaw && isDivisible === null) { errors.push(`الصف ${rowNum}: حالة التجزئة يجب أن تكون "نعم" أو "لا"`); continue; }

      let rejectionPolicy: string | null = null;
      if (rejectionPolicyRaw) {
        rejectionPolicy = REJECTION_POLICY_MAP[rejectionPolicyRaw] ?? REJECTION_POLICY_MAP[norm(rejectionPolicyRaw)] ?? null;
        if (!rejectionPolicy) { errors.push(`الصف ${rowNum}: حالة الرفض يجب أن تكون "دفع كامل" أو "مجاني"`); continue; }
      }

      let paymentMethod = "cod";
      if (paymentMethodRaw) {
        paymentMethod = PAYMENT_METHOD_MAP[paymentMethodRaw] ?? PAYMENT_METHOD_MAP[norm(paymentMethodRaw)] ?? "";
        if (!paymentMethod) { errors.push(`الصف ${rowNum}: طريقة الدفع "${paymentMethodRaw}" غير معروفة`); continue; }
      }

      const totalAmount = rawCodAmount ? Number(rawCodAmount) : 0;
      if (rawCodAmount && Number.isNaN(totalAmount)) { errors.push(`الصف ${rowNum}: سعر الشحنة يجب أن يكون رقماً`); continue; }
      const codAmount = paymentMethod === "cod" ? (totalAmount - shippingFee) : totalAmount;

      const weight = rawWeight ? Number(rawWeight) : null;
      if (rawWeight && Number.isNaN(weight)) { errors.push(`الصف ${rowNum}: الوزن يجب أن يكون رقماً`); continue; }

      const pieces = rawPieces ? Number(rawPieces) : 1;
      if (rawPieces && (Number.isNaN(pieces) || pieces < 1)) { errors.push(`الصف ${rowNum}: عدد القطع غير صحيح`); continue; }

      validShipments.push({
        receiverName, receiverPhone, receiverPhone2, receiverAddress,
        receiverCity: resolvedReceiverCity,
        zoneId, zonePrice, parcelType, parcelTypePrice,
        weight, pieces, description, paymentMethod,
        codAmount, shippingFee, totalAmount, notes,
        canOpen, isDivisible, rejectionPolicy,
      });
    }

    if (validShipments.length === 0) {
      res.status(400).json({ error: "لا توجد صفوف صالحة للاستيراد", errors: errors.slice(0, 50), imported: 0, failed: errors.length });
      return;
    }

    // نحسب رقم البداية مرة واحدة فقط من الداتابيز، وبعدين نزوّد العداد محليًا لكل
    // صف — نفس إصلاح مشكلة أرقام الشحنات المكررة في استيراد الإدارة (import.ts).
    let imported = 0;
    const now = new Date();
    const firstShipmentNumber = await generateShipmentNumber(tenantId);
    const numberPrefix = firstShipmentNumber.slice(0, -4);
    let nextSeq = parseInt(firstShipmentNumber.slice(-4), 10);
    for (const s of validShipments) {
      try {
        const shipmentNumber = `${numberPrefix}${String(nextSeq).padStart(4, "0")}`;
        nextSeq++;
        const insertResult = await db.insert(shipmentsTable).values({
          ...(tenantId !== null ? { tenantId } : {}),
          shipmentNumber,
          clientId:        client.id,
          senderName:      client.name,
          senderPhone:     client.phone ?? undefined,
          senderCity:      client.city ?? undefined,
          receiverName:    s.receiverName,
          receiverPhone:   s.receiverPhone ?? undefined,
          receiverPhone2:  s.receiverPhone2 ?? undefined,
          receiverAddress: s.receiverAddress ?? undefined,
          receiverCity:    s.receiverCity ?? undefined,
          zoneId:          s.zoneId ?? undefined,
          zonePrice:       String(s.zonePrice),
          parcelType:      s.parcelType ?? undefined,
          parcelTypePrice: String(s.parcelTypePrice),
          weight:          s.weight != null ? String(s.weight) : undefined,
          pieces:          s.pieces,
          description:     s.description ?? undefined,
          declaredValue:   "0",
          canOpen:         s.canOpen === null ? null : Number(s.canOpen),
          isDivisible:     s.isDivisible === null ? null : Number(s.isDivisible),
          rejectionPolicy: s.rejectionPolicy ?? null,
          paymentMethod:   s.paymentMethod,
          codAmount:       String(s.codAmount),
          shippingFee:     String(s.shippingFee),
          insuranceFee:    "0",
          totalAmount:     String(s.totalAmount),
          collectedAmount: "0",
          status:          "waiting",
          notes:           s.notes ?? undefined,
          createdByUserId: user.id,
          createdByName:   client.name,
          createdAt:       now,
          updatedAt:       now,
        });
        imported++;

        // إضافة تلقائية لبيان حساب العميل المفتوح (لو موجود)، أو فتح بيان جديد له
        const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
        autoAddShipmentToClientAccountManifest(insertId, client.id, tenantId)
          .catch((e) => console.error("[client-portal import] auto-add manifest error", e));
      } catch (e: any) {
        errors.push(`فشل استيراد شحنة "${s.receiverName}": ${e.message}`);
      }
    }

    if (imported > 0) {
      logAudit({
        action: "create", entityType: "shipment", entityId: 0,
        entityName: `استيراد ${imported} شحنة من إكسيل`, userId: user.id, userName: client.name,
      }).catch(() => {});

      pushNotification({
        tenantId,
        excludeUserId: user.id,
        type: "shipment_new",
        severity: "info",
        title: "شحنات جديدة من العميل (استيراد)",
        message: `${client.name} — تم استيراد ${imported} شحنة`,
        entityType: "shipment",
        entityId: 0,
        link: `/shipments`,
      });
    }

    res.json({ imported, failed: errors.length, errors: errors.slice(0, 50) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
