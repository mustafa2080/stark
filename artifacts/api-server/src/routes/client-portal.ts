import { Router, type IRouter } from "express";
import { eq, and, desc, isNull, sql, or } from "drizzle-orm";
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
} from "@workspace/db";
import { z } from "zod";
import { signToken, comparePassword, hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { generateShipmentNumber, syncShipmentInventory } from "./shipments.js";
import { pushNotification } from "../lib/notifications.js";

const router: IRouter = Router();

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
async function getClientShipments(tenantId: number | null, normalizedPhone: string, userId?: number | null) {
  const conds: any[] = [
    isNull(shipmentsTable.deletedAt),
    userId != null
      ? or(
          eq(shipmentsTable.createdByUserId, userId),
          sql`RIGHT(REGEXP_REPLACE(${shipmentsTable.receiverPhone}, '[^0-9]', ''), 9) = ${normalizedPhone}`,
        )
      : sql`RIGHT(REGEXP_REPLACE(${shipmentsTable.receiverPhone}, '[^0-9]', ''), 9) = ${normalizedPhone}`,
  ];
  if (tenantId !== null) conds.push(eq(shipmentsTable.tenantId, tenantId));
  return db.select().from(shipmentsTable).where(and(...conds)).orderBy(desc(shipmentsTable.createdAt));
}

// ─── GET /client-portal/stats — إحصائيات دائرية (زي الصورة) + KPIs ─────────
router.get("/client-portal/stats", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ total: 0, breakdown: [] }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client || !client.normalizedPhone) { res.json({ total: 0, breakdown: [] }); return; }

    const shipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone, user.id);

    const total = shipments.length;
    const counts: Record<string, number> = {};
    for (const s of shipments) counts[s.status] = (counts[s.status] ?? 0) + 1;

    // تجميع الحالات في مجموعات رئيسية مطابقة للصورة
    const delivered   = counts["delivered"] ?? 0;
    const inTransit   = (counts["in_transit"] ?? 0) + (counts["picked_up"] ?? 0) + (counts["out_for_delivery"] ?? 0);
    const waiting      = (counts["waiting"] ?? 0) + (counts["confirmed"] ?? 0);
    const returned     = counts["returned"] ?? 0;
    const delayed      = counts["delayed"] ?? 0;
    const cancelled    = counts["cancelled"] ?? 0;
    const partial      = counts["partial_received"] ?? 0;

    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

    const breakdown = [
      { key: "delivered", label: "تم التسليم",  count: delivered, pct: pct(delivered), color: "#22c55e" },
      { key: "in_transit", label: "قيد التوصيل", count: inTransit, pct: pct(inTransit), color: "#3b82f6" },
      { key: "waiting", label: "في الانتظار",   count: waiting, pct: pct(waiting), color: "#f1f5f9" },
      { key: "returned", label: "مرتجع",         count: returned, pct: pct(returned), color: "#ec4899" },
      { key: "delayed", label: "متأخرة",         count: delayed, pct: pct(delayed), color: "#f59e0b" },
      { key: "cancelled", label: "ملغية",        count: cancelled, pct: pct(cancelled), color: "#ef4444" },
      { key: "partial_received", label: "استلام جزئي", count: partial, pct: pct(partial), color: "#a855f7" },
    ].filter(b => b.count > 0);

    // ماليات سريعة
    const totalCod       = shipments.reduce((s, x) => s + parseFloat(x.codAmount ?? "0"), 0);
    const totalCollected  = shipments.reduce((s, x) => s + parseFloat(x.collectedAmount ?? "0"), 0);
    const totalShippingFee = shipments.reduce((s, x) => s + parseFloat(x.shippingFee ?? "0"), 0);

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
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /client-portal/shipments — جدول شحنات العميل (فلترة + بحث + صفحات) ─
router.get("/client-portal/shipments", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.clientId) { res.json({ data: [], total: 0 }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)).limit(1);
    if (!client || !client.normalizedPhone) { res.json({ data: [], total: 0 }); return; }

    const status = (req.query.status as string | undefined)?.trim();
    const search = (req.query.search as string | undefined)?.trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    let shipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone, user.id);

    if (status && status !== "all") {
      shipments = shipments.filter(s => s.status === status);
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

    res.json({ data: paged, total, page, pageSize });
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

    const shipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone, user.id);

    // ── تقسيم الشحنات: مستلمة (delivered/partial_received) و غير مستلمة (الباقي عدا الملغية/المرتجعة) ──
    const receivedStatuses = new Set(["delivered", "partial_received"]);
    const closedStatuses   = new Set(["delivered", "partial_received", "cancelled", "returned"]);
    const received    = shipments.filter(s => receivedStatuses.has(s.status));
    const notReceived  = shipments.filter(s => !closedStatuses.has(s.status));

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
          deliveredCount: shipments.filter(s => s.assignedUserId === Number(topRepId) && receivedStatuses.has(s.status)).length,
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

    // ── المستحق للسداد (مجموع الفواتير غير المسددة بالكامل) ──
    const invConds: any[] = [eq(clientInvoicesTable.normalizedPhone, client.normalizedPhone)];
    if (user.tenantId !== null && user.tenantId !== undefined) invConds.push(eq(clientInvoicesTable.tenantId, user.tenantId));
    const unpaidInvoices = await db.select({
      totalAmount: clientInvoicesTable.totalAmount, paidAmount: clientInvoicesTable.paidAmount,
    }).from(clientInvoicesTable).where(and(...invConds));
    const outstandingBalance = unpaidInvoices.reduce(
      (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)), 0
    );

    res.json({
      client,
      representative,
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

    res.json({ payments, invoices, creditLimit: client.creditLimit, accountStatus: client.accountStatus });
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

    const allShipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone, user.id);

    // ── اجمع كل shipmentIds اللي دخلت فاتورة قبل كده ────────────────────────
    const invConds: any[] = [eq(clientInvoicesTable.normalizedPhone, client.normalizedPhone)];
    if (user.tenantId !== null && user.tenantId !== undefined) invConds.push(eq(clientInvoicesTable.tenantId, user.tenantId));
    const existingInvoices = await db.select({ shipmentIds: clientInvoicesTable.shipmentIds })
      .from(clientInvoicesTable).where(and(...invConds));
    const alreadyInvoiced = new Set<number>();
    for (const inv of existingInvoices) {
      for (const id of (inv.shipmentIds ?? [])) alreadyInvoiced.add(id);
    }

    const invoiceable = allShipments.filter(s => !alreadyInvoiced.has(s.id));
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
    const allShipments = await getClientShipments(tenantId, client.normalizedPhone, user.id);
    const ownedIds = new Set(allShipments.map(s => s.id));
    const invalidIds = shipmentIds.filter(id => !ownedIds.has(id));
    if (invalidIds.length > 0) {
      res.status(403).json({ error: "بعض الشحنات المختارة غير تابعة لحسابك" });
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

export default router;
