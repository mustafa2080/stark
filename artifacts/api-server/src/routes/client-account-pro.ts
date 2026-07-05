import { Router, type IRouter } from "express";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import {
  db,
  shipmentsTable,
  receiverClientsTable,
  clientPaymentsTable,
  clientInvoicesTable,
  CLIENT_PAYMENT_METHODS,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getTenantId } from "../middlewares/requireTenant.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.slice(-9);
}

function currentUser(req: any) {
  return { id: req.user?.id as number | undefined, name: req.user?.displayName as string | undefined };
}

// ─── إيجاد/إنشاء سجل receiver_clients تلقائياً أول ما نحتاجه ────────────────
async function ensureReceiverClient(tenantId: number | null, phone: string, name: string, city?: string | null) {
  const normalized = normalizePhone(phone);
  const conditions: any[] = [eq(receiverClientsTable.normalizedPhone, normalized)];
  if (tenantId !== null) conditions.push(eq(receiverClientsTable.tenantId, tenantId));

  const [existing] = await db.select().from(receiverClientsTable).where(and(...conditions));
  if (existing) return existing;

  const now = new Date();
  const insertResult = await db.insert(receiverClientsTable).values({
    tenantId,
    normalizedPhone: normalized,
    name,
    phone,
    city: city ?? null,
    accountStatus: "active",
    paymentMethod: "cod",
    creditLimit: "0",
    createdAt: now,
    updatedAt: now,
  });
  const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
  const [created] = await db.select().from(receiverClientsTable).where(eq(receiverClientsTable.id, insertId));
  return created;
}

// ─── GET /client-account-pro/profile ── بروفايل العميل الكامل ──────────────
router.get("/client-account-pro/profile", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const phone = (req.query.phone as string | undefined)?.trim();
    if (!phone) { res.status(400).json({ error: "لازم رقم تليفون" }); return; }

    const normalized = normalizePhone(phone);
    if (!normalized) { res.status(400).json({ error: "رقم التليفون غير صالح" }); return; }

    const conditions: any[] = [eq(receiverClientsTable.normalizedPhone, normalized)];
    if (tenantId !== null) conditions.push(eq(receiverClientsTable.tenantId, tenantId));
    const [client] = await db.select().from(receiverClientsTable).where(and(...conditions));

    if (!client) { res.json({ client: null }); return; }
    res.json({ client });
  } catch (err: any) {
    console.error("client-account-pro/profile error:", err);
    res.status(500).json({ error: "حصل خطأ فى جلب بروفايل العميل" });
  }
});

// ─── PATCH /client-account-pro/profile ── تحديث بيانات العميل ──────────────
const UpdateProfileSchema = z.object({
  phone: z.string().min(1),
  name: z.string().optional(),
  email: z.string().nullish(),
  city: z.string().nullish(),
  address: z.string().nullish(),
  creditLimit: z.number().nullish(),
  paymentMethod: z.enum(["cod", "prepaid", "deferred"]).optional(),
  internalNotes: z.string().nullish(),
});

router.patch("/client-account-pro/profile", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const parsed = UpdateProfileSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { phone, ...updates } = parsed.data;

    const client = await ensureReceiverClient(tenantId, phone, updates.name ?? phone);
    const before = { ...client };

    const setValues: any = { updatedAt: new Date() };
    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.email !== undefined) setValues.email = updates.email;
    if (updates.city !== undefined) setValues.city = updates.city;
    if (updates.address !== undefined) setValues.address = updates.address;
    if (updates.creditLimit !== undefined) setValues.creditLimit = String(updates.creditLimit ?? 0);
    if (updates.paymentMethod !== undefined) setValues.paymentMethod = updates.paymentMethod;
    if (updates.internalNotes !== undefined) setValues.internalNotes = updates.internalNotes;

    await db.update(receiverClientsTable).set(setValues).where(eq(receiverClientsTable.id, client.id));

    await logAudit({
      action: "update", entityType: "client", entityId: null as any,
      entityName: `تحديث بروفايل ${client.name} (${phone})`,
      before, after: setValues,
      ...currentUser(req),
    }).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    console.error("client-account-pro/profile PATCH error:", err);
    res.status(500).json({ error: "حصل خطأ فى تحديث بيانات العميل" });
  }
});

// ─── POST /client-account-pro/suspend ── تعليق/تفعيل حساب العميل ───────────
const SuspendSchema = z.object({
  phone: z.string().min(1),
  suspend: z.boolean(),
  reason: z.string().nullish(),
});

router.post("/client-account-pro/suspend", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const parsed = SuspendSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { phone, suspend, reason } = parsed.data;

    const client = await ensureReceiverClient(tenantId, phone, phone);
    const { id: userId, name: userName } = currentUser(req);

    await db.update(receiverClientsTable).set({
      accountStatus: suspend ? "suspended" : "active",
      suspendedAt: suspend ? new Date() : null,
      suspendedByUserId: suspend ? (userId ?? null) : null,
      suspendedByName: suspend ? (userName ?? null) : null,
      suspendReason: suspend ? (reason ?? null) : null,
      updatedAt: new Date(),
    }).where(eq(receiverClientsTable.id, client.id));

    await logAudit({
      action: "update", entityType: "client", entityId: null as any,
      entityName: `${suspend ? "تعليق" : "تفعيل"} حساب ${client.name} (${phone})`,
      after: { accountStatus: suspend ? "suspended" : "active", reason },
      userId, userName,
    }).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    console.error("client-account-pro/suspend error:", err);
    res.status(500).json({ error: "حصل خطأ فى تعليق/تفعيل الحساب" });
  }
});

// ─── GET /client-account-pro/statement ── كشف حساب (شحنات + تحصيلات مرتبة زمنياً) ─
router.get("/client-account-pro/statement", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const phone = (req.query.phone as string | undefined)?.trim();
    if (!phone) { res.status(400).json({ error: "لازم رقم تليفون" }); return; }
    const normalized = normalizePhone(phone);
    if (!normalized) { res.status(400).json({ error: "رقم التليفون غير صالح" }); return; }

    const shipConditions: any[] = [
      isNull(shipmentsTable.deletedAt),
      sql`RIGHT(REGEXP_REPLACE(${shipmentsTable.receiverPhone}, '[^0-9]', ''), 9) = ${normalized}`,
    ];
    if (tenantId !== null) shipConditions.push(eq(shipmentsTable.tenantId, tenantId));
    const shipments = await db.select().from(shipmentsTable).where(and(...shipConditions)).orderBy(desc(shipmentsTable.createdAt));

    const payConditions: any[] = [eq(clientPaymentsTable.normalizedPhone, normalized)];
    if (tenantId !== null) payConditions.push(eq(clientPaymentsTable.tenantId, tenantId));
    const payments = await db.select().from(clientPaymentsTable).where(and(...payConditions)).orderBy(desc(clientPaymentsTable.paidAt));

    type Entry = { date: string; type: "debit" | "credit"; description: string; amount: number; refId: number; balance?: number };
    const entries: Entry[] = [];

    for (const s of shipments) {
      entries.push({
        date: s.createdAt as any,
        type: "debit",
        description: `شحنة #${s.shipmentNumber ?? s.id} — ${s.description ?? ""}`.trim(),
        amount: Number(s.totalAmount ?? 0),
        refId: s.id,
      });
    }
    for (const p of payments) {
      entries.push({
        date: p.paidAt as any,
        type: "credit",
        description: `تحصيل — ${p.receiptNumber ?? ""}`.trim(),
        amount: Number(p.amount ?? 0),
        refId: p.id,
      });
    }

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    for (const e of entries) {
      runningBalance += e.type === "debit" ? e.amount : -e.amount;
      e.balance = runningBalance;
    }

    entries.reverse(); // الأحدث أولاً للعرض

    res.json({
      entries,
      totalDebit: shipments.reduce((s: number, o: any) => s + Number(o.totalAmount ?? 0), 0),
      totalCredit: payments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0),
      currentBalance: runningBalance,
    });
  } catch (err: any) {
    console.error("client-account-pro/statement error:", err);
    res.status(500).json({ error: "حصل خطأ فى جلب كشف الحساب" });
  }
});

// ─── GET /client-account-pro/payments ── سجل التحصيلات ─────────────────────
router.get("/client-account-pro/payments", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const phone = (req.query.phone as string | undefined)?.trim();
    if (!phone) { res.status(400).json({ error: "لازم رقم تليفون" }); return; }
    const normalized = normalizePhone(phone);
    if (!normalized) { res.status(400).json({ error: "رقم التليفون غير صالح" }); return; }

    const conditions: any[] = [eq(clientPaymentsTable.normalizedPhone, normalized)];
    if (tenantId !== null) conditions.push(eq(clientPaymentsTable.tenantId, tenantId));
    const payments = await db.select().from(clientPaymentsTable).where(and(...conditions)).orderBy(desc(clientPaymentsTable.paidAt));

    res.json({ payments });
  } catch (err: any) {
    console.error("client-account-pro/payments GET error:", err);
    res.status(500).json({ error: "حصل خطأ فى جلب سجل التحصيلات" });
  }
});

// ─── POST /client-account-pro/payments ── تسجيل تحصيل جديد ─────────────────
const CreatePaymentSchema = z.object({
  phone: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.enum(CLIENT_PAYMENT_METHODS).default("cash"),
  receiptNumber: z.string().nullish(),
  linkedShipmentId: z.number().nullish(),
  notes: z.string().nullish(),
  paidAt: z.string().nullish(),
});

router.post("/client-account-pro/payments", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreatePaymentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const data = parsed.data;
    const normalized = normalizePhone(data.phone);
    if (!normalized) { res.status(400).json({ error: "رقم التليفون غير صالح" }); return; }

    const { id: userId, name: userName } = currentUser(req);
    const now = new Date();

    const insertResult = await db.insert(clientPaymentsTable).values({
      tenantId,
      clientPhone: data.phone,
      normalizedPhone: normalized,
      amount: String(data.amount),
      paymentMethod: data.paymentMethod,
      receiptNumber: data.receiptNumber ?? null,
      linkedShipmentId: data.linkedShipmentId ?? null,
      receivedByUserId: userId ?? null,
      receivedByName: userName ?? null,
      notes: data.notes ?? null,
      paidAt: data.paidAt ? new Date(data.paidAt) : now,
      createdAt: now,
    });
    const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;

    await logAudit({
      action: "create", entityType: "client_payment", entityId: insertId,
      entityName: `تحصيل ${data.amount} من ${data.phone}`,
      after: { amount: data.amount, paymentMethod: data.paymentMethod },
      userId, userName,
    }).catch(() => {});

    res.json({ success: true, id: insertId });
  } catch (err: any) {
    console.error("client-account-pro/payments POST error:", err);
    res.status(500).json({ error: "حصل خطأ فى تسجيل التحصيل" });
  }
});

// ─── DELETE /client-account-pro/payments/:id ── حذف تحصيل (غلط بالخطأ) ─────
router.delete("/client-account-pro/payments/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [existing] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
    if (!existing) { res.status(404).json({ error: "التحصيل غير موجود" }); return; }

    await db.delete(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));

    const { id: userId, name: userName } = currentUser(req);
    await logAudit({
      action: "delete", entityType: "client_payment", entityId: id,
      entityName: `حذف تحصيل ${existing.amount} من ${existing.clientPhone}`,
      before: existing, userId, userName,
    }).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    console.error("client-account-pro/payments DELETE error:", err);
    res.status(500).json({ error: "حصل خطأ فى حذف التحصيل" });
  }
});

// ─── GET /client-account-pro/invoices ── فواتير العميل ──────────────────────
router.get("/client-account-pro/invoices", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const phone = (req.query.phone as string | undefined)?.trim();
    if (!phone) { res.status(400).json({ error: "لازم رقم تليفون" }); return; }
    const normalized = normalizePhone(phone);
    if (!normalized) { res.status(400).json({ error: "رقم التليفون غير صالح" }); return; }

    const conditions: any[] = [eq(clientInvoicesTable.normalizedPhone, normalized)];
    if (tenantId !== null) conditions.push(eq(clientInvoicesTable.tenantId, tenantId));
    const invoices = await db.select().from(clientInvoicesTable).where(and(...conditions)).orderBy(desc(clientInvoicesTable.createdAt));

    res.json({ invoices });
  } catch (err: any) {
    console.error("client-account-pro/invoices GET error:", err);
    res.status(500).json({ error: "حصل خطأ فى جلب الفواتير" });
  }
});

// ─── POST /client-account-pro/invoices ── إنشاء فاتورة من شحنات محددة ──────
const CreateInvoiceSchema = z.object({
  phone: z.string().min(1),
  shipmentIds: z.array(z.number()).min(1),
  periodFrom: z.string().nullish(),
  periodTo: z.string().nullish(),
  notes: z.string().nullish(),
});

router.post("/client-account-pro/invoices", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const data = parsed.data;
    const normalized = normalizePhone(data.phone);
    if (!normalized) { res.status(400).json({ error: "رقم التليفون غير صالح" }); return; }

    const { id: userId, name: userName } = currentUser(req);
    const now = new Date();

    const shipConditions: any[] = [
      isNull(shipmentsTable.deletedAt),
      sql`${shipmentsTable.id} IN (${sql.join(data.shipmentIds.map((id) => sql`${id}`), sql`, `)})`,
    ];
    const shipments = await db.select().from(shipmentsTable).where(and(...shipConditions));
    const totalAmount = shipments.reduce((s: number, o: any) => s + Number(o.totalAmount ?? 0), 0);

    const invoiceNumber = `INV-${Date.now()}`;

    const insertResult = await db.insert(clientInvoicesTable).values({
      tenantId,
      invoiceNumber,
      clientPhone: data.phone,
      normalizedPhone: normalized,
      periodFrom: data.periodFrom ? new Date(data.periodFrom) : null,
      periodTo: data.periodTo ? new Date(data.periodTo) : null,
      shipmentIds: data.shipmentIds,
      totalAmount: String(totalAmount),
      paidAmount: "0",
      status: "unpaid",
      notes: data.notes ?? null,
      createdByUserId: userId ?? null,
      createdByName: userName ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;

    await logAudit({
      action: "create", entityType: "client_invoice", entityId: insertId,
      entityName: `فاتورة ${invoiceNumber} — ${data.phone}`,
      after: { totalAmount, shipmentsCount: data.shipmentIds.length },
      userId, userName,
    }).catch(() => {});

    res.json({ success: true, id: insertId, invoiceNumber });
  } catch (err: any) {
    console.error("client-account-pro/invoices POST error:", err);
    res.status(500).json({ error: "حصل خطأ فى إنشاء الفاتورة" });
  }
});

// ─── PATCH /client-account-pro/invoices/:id ── تحديث حالة/مبلغ مدفوع فاتورة ─
const UpdateInvoiceSchema = z.object({
  paidAmount: z.number().nonnegative().optional(),
  status: z.enum(["unpaid", "partial", "paid"]).optional(),
});

router.patch("/client-account-pro/invoices/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const parsed = UpdateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existing] = await db.select().from(clientInvoicesTable).where(eq(clientInvoicesTable.id, id));
    if (!existing) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }

    const setValues: any = { updatedAt: new Date() };
    if (parsed.data.paidAmount !== undefined) setValues.paidAmount = String(parsed.data.paidAmount);
    if (parsed.data.status !== undefined) setValues.status = parsed.data.status;

    await db.update(clientInvoicesTable).set(setValues).where(eq(clientInvoicesTable.id, id));

    const { id: userId, name: userName } = currentUser(req);
    await logAudit({
      action: "update", entityType: "client_invoice", entityId: id,
      entityName: `تحديث فاتورة ${existing.invoiceNumber}`,
      before: { paidAmount: existing.paidAmount, status: existing.status },
      after: setValues, userId, userName,
    }).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    console.error("client-account-pro/invoices PATCH error:", err);
    res.status(500).json({ error: "حصل خطأ فى تحديث الفاتورة" });
  }
});

// ─── GET /client-account-pro/analytics ── تحليلات + Health Score ──────────
router.get("/client-account-pro/analytics", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const phone = (req.query.phone as string | undefined)?.trim();
    if (!phone) { res.status(400).json({ error: "لازم رقم تليفون" }); return; }
    const normalized = normalizePhone(phone);
    if (!normalized) { res.status(400).json({ error: "رقم التليفون غير صالح" }); return; }

    const shipConditions: any[] = [
      isNull(shipmentsTable.deletedAt),
      sql`RIGHT(REGEXP_REPLACE(${shipmentsTable.receiverPhone}, '[^0-9]', ''), 9) = ${normalized}`,
    ];
    if (tenantId !== null) shipConditions.push(eq(shipmentsTable.tenantId, tenantId));
    const shipments = await db.select().from(shipmentsTable).where(and(...shipConditions)).orderBy(desc(shipmentsTable.createdAt));

    if (shipments.length === 0) {
      res.json({ monthly: [], byGovernorate: [], returnRate: 0, healthScore: 0, healthBreakdown: null });
      return;
    }

    // ── تجميع شهري (آخر 12 شهر) ─────────────────────────────────────────────
    const monthlyMap = new Map<string, { month: string; shipmentsCount: number; totalAmount: number; delivered: number; returned: number }>();
    for (const s of shipments) {
      const d = new Date(s.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthlyMap.get(key) ?? { month: key, shipmentsCount: 0, totalAmount: 0, delivered: 0, returned: 0 };
      entry.shipmentsCount++;
      entry.totalAmount += Number(s.totalAmount ?? 0);
      if (s.status === "delivered") entry.delivered++;
      if (s.status === "returned") entry.returned++;
      monthlyMap.set(key, entry);
    }
    const monthly = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

    // ── تجميع بالمحافظة ──────────────────────────────────────────────────────
    const govMap = new Map<string, number>();
    for (const s of shipments) {
      const gov = s.receiverCity ?? "غير محدد";
      govMap.set(gov, (govMap.get(gov) ?? 0) + 1);
    }
    const byGovernorate = [...govMap.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count);

    // ── معدل المرتجعات ───────────────────────────────────────────────────────
    const returnedCount = shipments.filter((s: any) => s.status === "returned").length;
    const returnRate = shipments.length ? Math.round((returnedCount / shipments.length) * 100) : 0;

    // ── الالتزام بالسداد (نسبة المحصَّل من الإجمالي) ────────────────────────
    const totalAmount = shipments.reduce((s: number, o: any) => s + Number(o.totalAmount ?? 0), 0);
    const totalCollected = shipments.reduce((s: number, o: any) => s + Number(o.collectedAmount ?? 0), 0);
    const paymentComplianceRate = totalAmount > 0 ? Math.round((totalCollected / totalAmount) * 100) : 100;

    // ── حجم الشحنات (نسبيًا: كل ما زاد العدد كل ما كان أفضل، بحد أقصى مرجعي 100 شحنة) ─
    const volumeScore = Math.min(100, Math.round((shipments.length / 100) * 100));

    // ── Health Score = متوسط 3 عوامل: (100-معدل المرتجعات) + الالتزام بالسداد + حجم الشحنات ─
    const returnHealthComponent = 100 - returnRate;
    const healthScore = Math.round((returnHealthComponent + paymentComplianceRate + volumeScore) / 3);

    res.json({
      monthly,
      byGovernorate,
      returnRate,
      healthScore,
      healthBreakdown: {
        returnHealthComponent,
        paymentComplianceRate,
        volumeScore,
      },
    });
  } catch (err: any) {
    console.error("client-account-pro/analytics error:", err);
    res.status(500).json({ error: "حصل خطأ فى جلب التحليلات" });
  }
});

export default router;
