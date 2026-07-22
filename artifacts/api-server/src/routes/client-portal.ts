import { Router, type IRouter } from "express";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import {
  db,
  usersTable,
  tenantsTable,
  receiverClientsTable,
  shipmentsTable,
  shipmentItemsTable,
  clientPaymentsTable,
  clientInvoicesTable,
  pickupRequestsTable,
} from "@workspace/db";
import { z } from "zod";
import { signToken, comparePassword, hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

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
    res.status(403).json({ error: "هذا المسار مخصص لحسابات العملاء فقط" });
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
// POST /client/register — تسجيل حساب عميل جديد داخل tenant موجود (عن طريق كود الشركة)
// ══════════════════════════════════════════════════════════════════════════
const clientRegisterSchema = z.object({
  displayName: z.string().trim().min(2, "الاسم مطلوب"),
  username: z.string().trim().min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  phone: z.string().trim().min(8, "رقم الهاتف مطلوب"),
  email: z.string().trim().email().optional().or(z.literal("")),
  city: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

router.post("/client/register", clientRegisterLimiter, async (req, res): Promise<void> => {
  try {
    const parsed = clientRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" });
      return;
    }
    const { displayName, username, password, phone, email, city, address } = parsed.data;

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

    // ── إيجاد/إنشاء سجل receiver_clients لنفس التاجر ─────────────────────
    const [existingClient] = await db.select().from(receiverClientsTable)
      .where(and(eq(receiverClientsTable.tenantId, tenant.id), eq(receiverClientsTable.normalizedPhone, normalizedPhone)))
      .limit(1);

    let receiverClientId: number;
    if (existingClient) {
      // لو موجود بالفعل — تأكد إنه مش مرتبط بحساب تاني
      const [linkedUser] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.receiverClientId, existingClient.id)).limit(1);
      if (linkedUser) {
        res.status(409).json({ error: "يوجد حساب مسجل بالفعل بهذا الرقم، يرجى تسجيل الدخول" });
        return;
      }
      receiverClientId = existingClient.id;
      // حدّث بياناته الأساسية لو ناقصة
      await db.update(receiverClientsTable).set({
        name: existingClient.name || displayName,
        email: existingClient.email || (email || null),
        city: existingClient.city || (city ?? null),
        address: existingClient.address || (address ?? null),
        updatedAt: now,
      }).where(eq(receiverClientsTable.id, existingClient.id));
    } else {
      const insertResult = await db.insert(receiverClientsTable).values({
        tenantId: tenant.id,
        normalizedPhone,
        name: displayName,
        phone,
        email: email || null,
        city: city ?? null,
        address: address ?? null,
        accountStatus: "active",
        paymentMethod: "cod",
        creditLimit: "0",
        createdAt: now,
        updatedAt: now,
      });
      const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
      receiverClientId = insertId;
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
      receiverClientId,
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
    if (!user.receiverClientId) { res.json({ client: null }); return; }

    const [client] = await db.select().from(receiverClientsTable)
      .where(eq(receiverClientsTable.id, user.receiverClientId)).limit(1);
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
});
router.patch("/client-portal/profile", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.receiverClientId) { res.status(404).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.email !== undefined) updates.email = parsed.data.email || null;
    if (parsed.data.city !== undefined) updates.city = parsed.data.city;
    if (parsed.data.address !== undefined) updates.address = parsed.data.address;

    await db.update(receiverClientsTable).set(updates).where(eq(receiverClientsTable.id, user.receiverClientId));
    const [updated] = await db.select().from(receiverClientsTable).where(eq(receiverClientsTable.id, user.receiverClientId)).limit(1);
    res.json({ client: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: شحنات العميل بحسب رقم الهاتف (matching زي client-account-pro) ──
async function getClientShipments(tenantId: number | null, normalizedPhone: string) {
  const conds: any[] = [
    isNull(shipmentsTable.deletedAt),
    sql`RIGHT(REGEXP_REPLACE(${shipmentsTable.receiverPhone}, '[^0-9]', ''), 9) = ${normalizedPhone}`,
  ];
  if (tenantId !== null) conds.push(eq(shipmentsTable.tenantId, tenantId));
  return db.select().from(shipmentsTable).where(and(...conds)).orderBy(desc(shipmentsTable.createdAt));
}

// ─── GET /client-portal/stats — إحصائيات دائرية (زي الصورة) + KPIs ─────────
router.get("/client-portal/stats", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.receiverClientId) { res.json({ total: 0, breakdown: [] }); return; }

    const [client] = await db.select().from(receiverClientsTable)
      .where(eq(receiverClientsTable.id, user.receiverClientId)).limit(1);
    if (!client) { res.json({ total: 0, breakdown: [] }); return; }

    const shipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone);

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
    if (!user.receiverClientId) { res.json({ data: [], total: 0 }); return; }

    const [client] = await db.select().from(receiverClientsTable)
      .where(eq(receiverClientsTable.id, user.receiverClientId)).limit(1);
    if (!client) { res.json({ data: [], total: 0 }); return; }

    const status = (req.query.status as string | undefined)?.trim();
    const search = (req.query.search as string | undefined)?.trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    let shipments = await getClientShipments(user.tenantId ?? null, client.normalizedPhone);

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

// ─── GET /client-portal/shipments/:id — تفاصيل شحنة واحدة (بأمان — نفس العميل بس) ─
router.get("/client-portal/shipments/:id", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user.receiverClientId || !id) { res.status(404).json({ error: "غير موجود" }); return; }

    const [client] = await db.select().from(receiverClientsTable)
      .where(eq(receiverClientsTable.id, user.receiverClientId)).limit(1);
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

// ─── GET /client-portal/wallet — المحفظة / التسويات المالية ────────────────
router.get("/client-portal/wallet", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user.receiverClientId) { res.json({ payments: [], invoices: [] }); return; }

    const [client] = await db.select().from(receiverClientsTable)
      .where(eq(receiverClientsTable.id, user.receiverClientId)).limit(1);
    if (!client) { res.json({ payments: [], invoices: [] }); return; }

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
    if (!user.receiverClientId) { res.status(404).json({ error: "لا يوجد حساب عميل مرتبط" }); return; }

    const parsed = createPickupSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
    const d = parsed.data;
    const now = new Date();
    const requestNumber = `PU-${Date.now().toString().slice(-8)}`;

    const insertResult = await db.insert(pickupRequestsTable).values({
      tenantId: user.tenantId ?? null,
      receiverClientId: user.receiverClientId,
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
    if (!user.receiverClientId) { res.json({ data: [], total: 0 }); return; }

    const conds: any[] = [
      eq(pickupRequestsTable.receiverClientId, user.receiverClientId),
      isNull(pickupRequestsTable.deletedAt),
    ];
    const rows = await db.select().from(pickupRequestsTable)
      .where(and(...conds)).orderBy(desc(pickupRequestsTable.createdAt));

    res.json({ data: rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /client-portal/pickup-requests/:id/cancel — إلغاء طلب (لو لسه pending) ─
router.patch("/client-portal/pickup-requests/:id/cancel", async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const id = Number(req.params.id);
    if (!user.receiverClientId || !id) { res.status(404).json({ error: "غير موجود" }); return; }

    const [existing] = await db.select().from(pickupRequestsTable)
      .where(and(eq(pickupRequestsTable.id, id), eq(pickupRequestsTable.receiverClientId, user.receiverClientId)))
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
