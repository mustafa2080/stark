import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  db,
  tripSettlementsTable,
  tripSettlementRepsTable,
  tripSettlementRepPaymentsTable,
  tripSettlementClientsTable,
  expensesTable,
  clientAccountPaymentsTable,
  usersTable,
  clientsTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getTenantId } from "../middlewares/requireTenant.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── هلبرز ─────────────────────────────────────────────────────────────────
function actor(req: any) {
  const u = req.user;
  return { id: u?.id ?? null, name: u?.displayName ?? u?.name ?? u?.username ?? "مستخدم" };
}

async function generateSettlementNumber(): Promise<string> {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const [{ c }] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(tripSettlementsTable)
    .where(sql`DATE(${tripSettlementsTable.createdAt}) = CURDATE()`);
  const seq = String(Number(c) + 1).padStart(3, "0");
  return `TS-${ymd}-${seq}`;
}

export async function recomputeSettlementTotals(settlementId: number) {
  const [{ repsTotal }] = await db
    .select({ repsTotal: sql<string>`COALESCE(SUM(${tripSettlementRepsTable.balance}),0)` })
    .from(tripSettlementRepsTable)
    .where(eq(tripSettlementRepsTable.settlementId, settlementId));

  const [{ clientsTotal }] = await db
    .select({ clientsTotal: sql<string>`COALESCE(SUM(${tripSettlementClientsTable.balance}),0)` })
    .from(tripSettlementClientsTable)
    .where(and(eq(tripSettlementClientsTable.settlementId, settlementId), eq(tripSettlementClientsTable.status, "pending")));

  const repsNum = Number(repsTotal) || 0;
  const clientsNum = Number(clientsTotal) || 0;
  // "السالب" = إجمالي أرصدة المناديب - إجمالي أرصدة العملاء المتبقية (غير المسددة)
  const net = repsNum - clientsNum;

  await db.update(tripSettlementsTable)
    .set({ totalRepsBalance: String(repsNum), totalClientsBalance: String(clientsNum), netBalance: String(net) })
    .where(eq(tripSettlementsTable.id, settlementId));

  return { repsTotal: repsNum, clientsTotal: clientsNum, netBalance: net };
}

// عدد الرحلات المتتالية (بما فيها الحالية) اللي رصيد نفس العميل فيها سالب على
// التوالي — بتتبع سلسلة rolled_from_id للخلف. بتوقف أول ما تلاقي رصيد غير سالب
// أو تخلص السلسلة (مفيش رولوفر أكتر). بتستخدم في تنبيه "عميل متكرر السالب".
async function getConsecutiveNegativeStreak(clientRow: { id: number; clientId: number | null; balance: string }): Promise<number> {
  if (!clientRow.clientId || Number(clientRow.balance) >= 0) return 0;
  let streak = 1;
  let cursorId: number | null = clientRow.id;
  for (let i = 0; i < 12; i++) {
    const [row] = await db.select({
      rolledFromId: tripSettlementClientsTable.rolledFromId,
    }).from(tripSettlementClientsTable).where(eq(tripSettlementClientsTable.id, cursorId!));
    const prevId = row?.rolledFromId ?? null;
    if (!prevId) break;
    const [prev] = await db.select({
      balance: tripSettlementClientsTable.balance,
      rolledFromId: tripSettlementClientsTable.rolledFromId,
    }).from(tripSettlementClientsTable).where(eq(tripSettlementClientsTable.id, prevId));
    if (!prev || Number(prev.balance) >= 0) break;
    streak++;
    cursorId = prevId;
  }
  return streak;
}

export async function recomputeRepBalance(repRowId: number) {
  const [{ total }] = await db
    .select({ total: sql<string>`COALESCE(SUM(${tripSettlementRepPaymentsTable.amount}),0)` })
    .from(tripSettlementRepPaymentsTable)
    .where(eq(tripSettlementRepPaymentsTable.repRowId, repRowId));
  await db.update(tripSettlementRepsTable).set({ balance: String(Number(total) || 0) }).where(eq(tripSettlementRepsTable.id, repRowId));
}

// ─── جلب/فتح البيان الحالي المفتوح — مستخرجة كدالة مشتركة عشان تُستخدم من
// GET /trip-settlements/current وكمان من الترحيل التلقائي (lib/tripSettlementSync.ts)
// عند إغلاق بيان مندوب/عميل. actorId/actorName اختياريين (null للترحيل الآلي بدون يوزر).
export async function getOrCreateOpenSettlement(
  tenantId: number | null,
  actorId: number | null = null,
  actorName: string | null = "نظام تلقائي",
): Promise<typeof tripSettlementsTable.$inferSelect> {
  const tenantCond = tenantId !== null ? eq(tripSettlementsTable.tenantId, tenantId) : undefined;

  let [open] = await db.select().from(tripSettlementsTable)
    .where(tenantCond ? and(eq(tripSettlementsTable.status, "open"), tenantCond) : eq(tripSettlementsTable.status, "open"))
    .orderBy(desc(tripSettlementsTable.id))
    .limit(1);

  if (!open) {
    const settlementNumber = await generateSettlementNumber();
    const now = new Date();
    const [created] = await db.insert(tripSettlementsTable).values({
      tenantId: tenantId ?? null,
      settlementNumber,
      status: "open",
      createdByUserId: actorId,
      createdByName: actorName,
      createdAt: now,
    });
    const id = (created as any).insertId as number;
    [open] = await db.select().from(tripSettlementsTable).where(eq(tripSettlementsTable.id, id));
  }

  return open;
}

// ─── قائمة المناديب الحقيقيين (role = representative) — للـ Select في الفرونت ─
router.get("/trip-settlements/reps-list", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const tenantCond = tenantId !== null ? eq(usersTable.tenantId, tenantId) : undefined;
    const cond = tenantCond
      ? and(eq(usersTable.role, "representative"), eq(usersTable.isActive, true), tenantCond)
      : and(eq(usersTable.role, "representative"), eq(usersTable.isActive, true));

    const reps = await db.select({
      id: usersTable.id,
      name: usersTable.displayName,
      username: usersTable.username,
    }).from(usersTable).where(cond).orderBy(usersTable.displayName);

    res.json({ reps });
  } catch (e) {
    console.error("[GET /trip-settlements/reps-list]", e);
    res.status(500).json({ error: "خطأ في جلب قائمة المناديب" });
  }
});

// ─── قائمة العملاء الحقيقيين — للـ Select في الفرونت ──────────────────────────
router.get("/trip-settlements/clients-list", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const tenantCond = tenantId !== null ? eq(clientsTable.tenantId, tenantId) : undefined;
    const cond = tenantCond
      ? and(eq(clientsTable.isActive, true), tenantCond)
      : eq(clientsTable.isActive, true);

    const clients = await db.select({
      id: clientsTable.id,
      name: clientsTable.name,
      phone: clientsTable.phone,
    }).from(clientsTable).where(cond).orderBy(clientsTable.name);

    res.json({ clients });
  } catch (e) {
    console.error("[GET /trip-settlements/clients-list]", e);
    res.status(500).json({ error: "خطأ في جلب قائمة العملاء" });
  }
});

// ─── جلب/فتح البيان الحالي المفتوح (بيتفتح تلقائياً لو مفيش) ─────────────────
router.get("/trip-settlements/current", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const who = actor(req);
    const open = await getOrCreateOpenSettlement(tenantId, who.id, who.name);
    res.json({ settlement: open });
  } catch (e) {
    console.error("[GET /trip-settlements/current]", e);
    res.status(500).json({ error: "خطأ في جلب البيان الحالي" });
  }
});

// ─── قائمة البيانات (المؤرشفة + المفتوحة) ────────────────────────────────────
router.get("/trip-settlements", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const tenantCond = tenantId !== null ? eq(tripSettlementsTable.tenantId, tenantId) : undefined;
    const rows = await db.select().from(tripSettlementsTable)
      .where(tenantCond)
      .orderBy(desc(tripSettlementsTable.id))
      .limit(100);
    res.json({ settlements: rows });
  } catch (e) {
    console.error("[GET /trip-settlements]", e);
    res.status(500).json({ error: "خطأ في جلب البيانات" });
  }
});

// ─── تفاصيل بيان واحد (مناديب + عملاء) ───────────────────────────────────────
router.get("/trip-settlements/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [settlement] = await db.select().from(tripSettlementsTable).where(eq(tripSettlementsTable.id, id));
    if (!settlement) { res.status(404).json({ error: "البيان غير موجود" }); return; }

    const reps = await db.select().from(tripSettlementRepsTable)
      .where(eq(tripSettlementRepsTable.settlementId, id))
      .orderBy(tripSettlementRepsTable.sortOrder, tripSettlementRepsTable.id);

    const repIds = reps.map(r => r.id);
    const payments = repIds.length
      ? await db.select().from(tripSettlementRepPaymentsTable).where(sql`${tripSettlementRepPaymentsTable.repRowId} IN (${sql.join(repIds, sql`,`)})`)
      : [];

    const clients = await db.select().from(tripSettlementClientsTable)
      .where(eq(tripSettlementClientsTable.settlementId, id))
      .orderBy(tripSettlementClientsTable.sortOrder, tripSettlementClientsTable.id);

    const repsWithPayments = reps.map(r => ({ ...r, payments: payments.filter(p => p.repRowId === r.id) }));

    // تنبيه "عميل متكرر السالب": نحسب السلسلة بس للمعلّق وسالب فعلاً — توفير queries.
    const clientsWithStreak = await Promise.all(clients.map(async c => {
      const negativeStreak = c.status === "pending" ? await getConsecutiveNegativeStreak(c) : 0;
      return { ...c, negativeStreak };
    }));

    res.json({ settlement, reps: repsWithPayments, clients: clientsWithStreak });
  } catch (e) {
    console.error("[GET /trip-settlements/:id]", e);
    res.status(500).json({ error: "خطأ في جلب تفاصيل البيان" });
  }
});

// ─── إضافة مندوب ──────────────────────────────────────────────────────────────
const RepSchema = z.object({ repName: z.string().min(1), notes: z.string().nullish(), userId: z.number().nullish() });
router.post("/trip-settlements/:id/reps", async (req, res): Promise<void> => {
  try {
    const settlementId = Number(req.params.id);
    const [settlement] = await db.select().from(tripSettlementsTable).where(eq(tripSettlementsTable.id, settlementId));
    if (!settlement) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (settlement.status !== "open") { res.status(400).json({ error: "البيان مقفول" }); return; }

    const body = RepSchema.parse(req.body);
    const [created] = await db.insert(tripSettlementRepsTable).values({
      settlementId, repName: body.repName, notes: body.notes ?? null, userId: body.userId ?? null,
      status: "active", balance: "0", createdAt: new Date(),
    });
    res.json({ id: (created as any).insertId });
  } catch (e) {
    console.error("[POST /trip-settlements/:id/reps]", e);
    res.status(400).json({ error: "خطأ في إضافة المندوب" });
  }
});

// ─── تعديل/حذف صف مندوب ───────────────────────────────────────────────────────
router.patch("/trip-settlements/reps/:repId", async (req, res): Promise<void> => {
  try {
    const repId = Number(req.params.repId);
    const body = z.object({ repName: z.string().min(1).optional(), notes: z.string().nullish() }).parse(req.body);
    await db.update(tripSettlementRepsTable).set(body as any).where(eq(tripSettlementRepsTable.id, repId));
    res.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /trip-settlements/reps/:repId]", e);
    res.status(400).json({ error: "خطأ في التعديل" });
  }
});

router.delete("/trip-settlements/reps/:repId", async (req, res): Promise<void> => {
  try {
    const repId = Number(req.params.repId);
    const [row] = await db.select().from(tripSettlementRepsTable).where(eq(tripSettlementRepsTable.id, repId));
    if (!row) { res.status(404).json({ error: "غير موجود" }); return; }
    await db.delete(tripSettlementRepsTable).where(eq(tripSettlementRepsTable.id, repId));
    await recomputeSettlementTotals(row.settlementId);
    res.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /trip-settlements/reps/:repId]", e);
    res.status(500).json({ error: "خطأ في الحذف" });
  }
});

// ─── وسائل الدفع المتعددة للمندوب ─────────────────────────────────────────────
const PaymentSchema = z.object({ method: z.string().min(1), amount: z.number(), note: z.string().nullish() });
router.post("/trip-settlements/reps/:repId/payments", async (req, res): Promise<void> => {
  try {
    const repId = Number(req.params.repId);
    const [rep] = await db.select().from(tripSettlementRepsTable).where(eq(tripSettlementRepsTable.id, repId));
    if (!rep) { res.status(404).json({ error: "المندوب غير موجود" }); return; }

    const body = PaymentSchema.parse(req.body);
    const [created] = await db.insert(tripSettlementRepPaymentsTable).values({
      repRowId: repId, method: body.method, amount: String(body.amount), note: body.note ?? null, createdAt: new Date(),
    });
    await recomputeRepBalance(repId);
    await recomputeSettlementTotals(rep.settlementId);
    res.json({ id: (created as any).insertId });
  } catch (e) {
    console.error("[POST /trip-settlements/reps/:repId/payments]", e);
    res.status(400).json({ error: "خطأ في إضافة وسيلة الدفع" });
  }
});

router.delete("/trip-settlements/rep-payments/:paymentId", async (req, res): Promise<void> => {
  try {
    const paymentId = Number(req.params.paymentId);
    const [payment] = await db.select().from(tripSettlementRepPaymentsTable).where(eq(tripSettlementRepPaymentsTable.id, paymentId));
    if (!payment) { res.status(404).json({ error: "غير موجود" }); return; }
    const [rep] = await db.select().from(tripSettlementRepsTable).where(eq(tripSettlementRepsTable.id, payment.repRowId));
    await db.delete(tripSettlementRepPaymentsTable).where(eq(tripSettlementRepPaymentsTable.id, paymentId));
    await recomputeRepBalance(payment.repRowId);
    if (rep) await recomputeSettlementTotals(rep.settlementId);
    res.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /trip-settlements/rep-payments/:paymentId]", e);
    res.status(500).json({ error: "خطأ في الحذف" });
  }
});

// ─── إضافة عميل ────────────────────────────────────────────────────────────
const ClientSchema = z.object({
  clientId: z.number().nullish(),
  clientName: z.string().min(1),
  alixAmount: z.number().default(0),
  vcashAmount: z.number().default(0),
  cashAmount: z.number().default(0),
  balance: z.number(),
  notes: z.string().nullish(),
});
router.post("/trip-settlements/:id/clients", async (req, res): Promise<void> => {
  try {
    const settlementId = Number(req.params.id);
    const [settlement] = await db.select().from(tripSettlementsTable).where(eq(tripSettlementsTable.id, settlementId));
    if (!settlement) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (settlement.status !== "open") { res.status(400).json({ error: "البيان مقفول" }); return; }

    const body = ClientSchema.parse(req.body);
    const [created] = await db.insert(tripSettlementClientsTable).values({
      settlementId,
      clientId: body.clientId ?? null,
      clientName: body.clientName,
      alixAmount: String(body.alixAmount),
      vcashAmount: String(body.vcashAmount),
      cashAmount: String(body.cashAmount),
      balance: String(body.balance),
      status: "pending",
      notes: body.notes ?? null,
      createdAt: new Date(),
    });
    await recomputeSettlementTotals(settlementId);
    res.json({ id: (created as any).insertId });
  } catch (e) {
    console.error("[POST /trip-settlements/:id/clients]", e);
    res.status(400).json({ error: "خطأ في إضافة العميل" });
  }
});

// ─── تعديل/حذف صف عميل ────────────────────────────────────────────────────────
router.patch("/trip-settlements/clients/:clientRowId", async (req, res): Promise<void> => {
  try {
    const clientRowId = Number(req.params.clientRowId);
    const [row] = await db.select().from(tripSettlementClientsTable).where(eq(tripSettlementClientsTable.id, clientRowId));
    if (!row) { res.status(404).json({ error: "غير موجود" }); return; }
    const body = z.object({
      clientName: z.string().min(1).optional(),
      alixAmount: z.number().optional(),
      vcashAmount: z.number().optional(),
      cashAmount: z.number().optional(),
      balance: z.number().optional(),
      notes: z.string().nullish(),
    }).parse(req.body);

    const patch: any = { ...body };
    if (body.alixAmount !== undefined) patch.alixAmount = String(body.alixAmount);
    if (body.vcashAmount !== undefined) patch.vcashAmount = String(body.vcashAmount);
    if (body.cashAmount !== undefined) patch.cashAmount = String(body.cashAmount);
    if (body.balance !== undefined) patch.balance = String(body.balance);

    await db.update(tripSettlementClientsTable).set(patch).where(eq(tripSettlementClientsTable.id, clientRowId));
    await recomputeSettlementTotals(row.settlementId);
    res.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /trip-settlements/clients/:clientRowId]", e);
    res.status(400).json({ error: "خطأ في التعديل" });
  }
});

router.delete("/trip-settlements/clients/:clientRowId", async (req, res): Promise<void> => {
  try {
    const clientRowId = Number(req.params.clientRowId);
    const [row] = await db.select().from(tripSettlementClientsTable).where(eq(tripSettlementClientsTable.id, clientRowId));
    if (!row) { res.status(404).json({ error: "غير موجود" }); return; }
    await db.delete(tripSettlementClientsTable).where(eq(tripSettlementClientsTable.id, clientRowId));
    await recomputeSettlementTotals(row.settlementId);
    res.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /trip-settlements/clients/:clientRowId]", e);
    res.status(500).json({ error: "خطأ في الحذف" });
  }
});

// ─── سداد الرصيد (زر "سداد الرصيد" → تأكيد → "خالص") ──────────────────────────
// بيخصم المبلغ من المصروفات (فئة client_payment) ويرحّله لحساب العميل تلقائياً،
// بنفس منطق "سداد حساب عميل" المستخدم في باقي النظام.
router.post("/trip-settlements/clients/:clientRowId/settle", async (req, res): Promise<void> => {
  try {
    const clientRowId = Number(req.params.clientRowId);
    const [row] = await db.select().from(tripSettlementClientsTable).where(eq(tripSettlementClientsTable.id, clientRowId));
    if (!row) { res.status(404).json({ error: "غير موجود" }); return; }
    if (row.status === "paid") { res.status(400).json({ error: "الرصيد ده اتسدد بالفعل" }); return; }

    const [settlement] = await db.select().from(tripSettlementsTable).where(eq(tripSettlementsTable.id, row.settlementId));
    const tenantId = getTenantId(req);
    const who = actor(req);
    const now = new Date();
    const amount = Math.abs(Number(row.balance) || 0);

    let expenseId: number | null = null;
    let clientPaymentId: number | null = null;

    if (row.clientId) {
      const [exp] = await db.insert(expensesTable).values({
        tenantId: tenantId ?? null,
        title: `سداد رصيد عميل — ${row.clientName} (${settlement?.settlementNumber ?? ""})`,
        category: "client_payment",
        amount: String(amount),
        clientId: row.clientId,
        referenceId: settlement?.settlementNumber ?? null,
        notes: `تسوية رحلة رقم ${settlement?.settlementNumber ?? row.settlementId}`,
        expenseDate: now,
        createdByUserId: who.id,
        createdByName: who.name,
        createdAt: now,
      });
      expenseId = (exp as any).insertId as number;

      const [cap] = await db.insert(clientAccountPaymentsTable).values({
        tenantId: tenantId ?? null,
        clientId: row.clientId,
        amount: String(amount),
        expenseId,
        notes: `سداد رصيد — تسوية رحلة ${settlement?.settlementNumber ?? row.settlementId}`,
        createdByUserId: who.id,
        createdByName: who.name,
        createdAt: now,
      });
      clientPaymentId = (cap as any).insertId as number;
    }

    await db.update(tripSettlementClientsTable).set({
      status: "paid",
      paidAmount: String(amount),
      paidAt: now,
      expenseId,
      clientPaymentId,
    }).where(eq(tripSettlementClientsTable.id, clientRowId));

    await recomputeSettlementTotals(row.settlementId);
    res.json({ ok: true, expenseId, clientPaymentId });
  } catch (e) {
    console.error("[POST /trip-settlements/clients/:clientRowId/settle]", e);
    res.status(500).json({ error: "خطأ في تنفيذ السداد" });
  }
});

// ─── إغلاق الرحلة/البيان: أرشفة + فتح حاوية جديدة + ترحيل أرصدة العملاء ──────
router.post("/trip-settlements/:id/close", async (req, res): Promise<void> => {
  try {
    const settlementId = Number(req.params.id);
    const [settlement] = await db.select().from(tripSettlementsTable).where(eq(tripSettlementsTable.id, settlementId));
    if (!settlement) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (settlement.status !== "open") { res.status(400).json({ error: "البيان مقفول بالفعل" }); return; }

    const who = actor(req);
    const now = new Date();
    const tenantId = getTenantId(req);

    // 1) قفل صفوف المناديب (رصيدهم بيتحسب فقط دلوقتي بعد الإغلاق)
    await db.update(tripSettlementRepsTable).set({ status: "closed" }).where(eq(tripSettlementRepsTable.settlementId, settlementId));

    // 2) حساب الإجماليات النهائية
    const totals = await recomputeSettlementTotals(settlementId);

    // 3) قفل البيان نفسه
    await db.update(tripSettlementsTable).set({
      status: "closed",
      closedAt: now,
      closedByUserId: who.id,
      closedByName: who.name,
    }).where(eq(tripSettlementsTable.id, settlementId));

    // 4) فتح بيان جديد تلقائياً
    const settlementNumber = await generateSettlementNumber();
    const [created] = await db.insert(tripSettlementsTable).values({
      tenantId: tenantId ?? null,
      settlementNumber,
      status: "open",
      previousSettlementId: settlementId,
      createdByUserId: who.id,
      createdByName: who.name,
      createdAt: now,
    });
    const newSettlementId = (created as any).insertId as number;

    // 5) ترحيل العملاء اللي لسه ليهم/عليهم رصيد (مش "خالص") للبيان الجديد
    const pendingClients = await db.select().from(tripSettlementClientsTable)
      .where(and(eq(tripSettlementClientsTable.settlementId, settlementId), eq(tripSettlementClientsTable.status, "pending")));

    for (const c of pendingClients) {
      await db.insert(tripSettlementClientsTable).values({
        settlementId: newSettlementId,
        clientId: c.clientId,
        clientName: c.clientName,
        alixAmount: "0",
        vcashAmount: "0",
        cashAmount: "0",
        balance: c.balance,
        status: "pending",
        notes: c.notes,
        rolledFromId: c.id,
        createdAt: now,
      });
      await db.update(tripSettlementClientsTable).set({ isRolledOver: 1 }).where(eq(tripSettlementClientsTable.id, c.id));
    }

    if (pendingClients.length) await recomputeSettlementTotals(newSettlementId);

    const [newSettlement] = await db.select().from(tripSettlementsTable).where(eq(tripSettlementsTable.id, newSettlementId));
    res.json({ ok: true, closedTotals: totals, newSettlement });
  } catch (e) {
    console.error("[POST /trip-settlements/:id/close]", e);
    res.status(500).json({ error: "خطأ في إغلاق الرحلة" });
  }
});

export default router;
