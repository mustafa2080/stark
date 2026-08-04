import { Router, type IRouter } from "express";
import { eq, desc, gte, lte, and, sql, lt, isNull, like, or } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, expensesTable, shippingFinancialInvoicesTable, ordersTable, shippingManifestsTable, shippingManifestOrdersTable, cashRegistersTable, cashTransactionsTable, shippingCompaniesTable, clientAccountPaymentsTable } from "@workspace/db";
import { z } from "zod";
import { getTenantId } from "../middlewares/requireTenant.js";
import { invalidateSmartCache, invalidateChartsCache } from "./analytics.js";

const router: IRouter = Router();

// ── Expenses ────────────────────────────────────────────────────────────────
const ExpenseSchema = z.object({
  title: z.string().min(1),
  category: z.string().default("other"),
  amount: z.number().min(0),
  referenceId: z.string().nullish(),
  supplierId: z.number().nullish(),
  shippingCompanyId: z.number().nullish(),
  clientId: z.number().nullish(),
  cashRegisterId: z.number().nullish(),
  notes: z.string().nullish(),
  expenseDate: z.string(),
});

// ── helper: بناء شروط الفلترة للمصروفات ──────────────────────────────────
function buildExpenseConditions(query: Record<string, any>) {
  const { from, to, category, search } = query;
  const conditions: any[] = [];
  if (from)     conditions.push(gte(expensesTable.expenseDate, new Date(from as string)));
  if (to)       conditions.push(lte(expensesTable.expenseDate, new Date(to   as string)));
  if (category && category !== "all") conditions.push(eq(expensesTable.category, category as string));
  if (search) {
    const q = `%${search}%`;
    conditions.push(or(like(expensesTable.title, q), like(expensesTable.notes, q), like(expensesTable.referenceId, q)));
  }
  return conditions;
}

router.get("/finance/expenses", async (req, res): Promise<void> => {
  const { page = "1", limit = "25" } = req.query;
  const tenantId = getTenantId(req);
  const conditions = buildExpenseConditions(req.query);
  if (tenantId !== null) conditions.push(eq(expensesTable.tenantId, tenantId));
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` })
    .from(expensesTable)
    .where(conditions.length ? and(...conditions) : undefined);

  const expenses = await db.select().from(expensesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expensesTable.expenseDate))
    .limit(parseInt(limit as string))
    .offset(offset);

  res.json({ expenses, total: Number(total), page: parseInt(page as string), limit: parseInt(limit as string) });
});

// ── تصدير Excel للمصروفات ─────────────────────────────────────────────────
router.get("/finance/expenses/export-excel", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conditions = buildExpenseConditions(req.query);
  if (tenantId !== null) conditions.push(eq(expensesTable.tenantId, tenantId));
  const expenses = await db.select().from(expensesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expensesTable.expenseDate));

  const CAT_LABELS: Record<string, string> = {
    shipping_fees:"مصاريف شحن", warehouse_rent:"إيجار مخزن", salary:"مرتبات",
    marketing:"تسويق وإعلانات", packaging:"تغليف", utilities:"كهرباء / خدمات",
    maintenance:"صيانة", returns_loss:"خسائر مرتجعات", other:"أخرى",
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Caprina"; wb.created = new Date();
  const ws = wb.addWorksheet("المصروفات", { views: [{ rightToLeft: true }] });

  ws.columns = [
    { header: "#",          key: "id",          width: 8  },
    { header: "العنوان",    key: "title",        width: 30 },
    { header: "التصنيف",    key: "category",     width: 20 },
    { header: "المبلغ",     key: "amount",       width: 16 },
    { header: "التاريخ",    key: "expenseDate",  width: 14 },
    { header: "رقم مرجعي", key: "referenceId",  width: 16 },
    { header: "ملاحظات",   key: "notes",        width: 30 },
    { header: "بواسطة",    key: "createdByName",width: 18 },
  ];

  // تنسيق الهيدر
  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDEA821" } };
    cell.font = { bold: true, color: { argb: "FF000000" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(1).height = 22;

  let totalAmount = 0;
  expenses.forEach((e, i) => {
    const amt = parseFloat(e.amount ?? "0");
    totalAmount += amt;
    const row = ws.addRow({
      id: e.id,
      title: e.title,
      category: CAT_LABELS[e.category ?? ""] ?? e.category,
      amount: amt,
      expenseDate: e.expenseDate ? new Date(e.expenseDate).toLocaleDateString("ar-EG") : "",
      referenceId: e.referenceId ?? "",
      notes: e.notes ?? "",
      createdByName: e.createdByName ?? "",
    });
    row.getCell("amount").numFmt = '#,##0.00 "ج.م"';
    if (i % 2 === 1) {
      row.eachCell(cell => { cell.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFF9F9F9" } }; });
    }
  });

  // صف الإجمالي
  const totalRow = ws.addRow({ title: "الإجمالي", amount: totalAmount });
  totalRow.getCell("title").font = { bold: true };
  totalRow.getCell("amount").numFmt = '#,##0.00 "ج.م"';
  totalRow.getCell("amount").font = { bold: true, color: { argb: "FFC0392B" } };
  totalRow.eachCell(cell => { cell.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFFFF3CD" } }; });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="expenses-${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.post("/finance/expenses", async (req, res): Promise<void> => {
  const parsed = ExpenseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date();
  const user = (req as any).user;
  const data = parsed.data;
  const amt = data.amount;

  if (data.category === "client_payment" && !data.clientId) {
    res.status(400).json({ error: "لازم تحدد العميل عند اختيار تصنيف سداد حساب عميل" });
    return;
  }

  // ── تحديد الخزنة: المحددة من المستخدم أو الافتراضية تلقائياً ────────────
  let reg: any = null;
  let balBefore = 0;
  let balAfter  = 0;
  let resolvedRegisterId: number | null = data.cashRegisterId ?? null;

  if (resolvedRegisterId) {
    const [found] = await db.select().from(cashRegistersTable)
      .where(and(eq(cashRegistersTable.id, resolvedRegisterId), eq(cashRegistersTable.isActive, true)));
    if (!found) { res.status(404).json({ error: "الخزنة المحددة غير موجودة أو غير نشطة" }); return; }
    balBefore = parseFloat(found.balance ?? "0");
    balAfter  = balBefore - amt;
    if (balAfter < 0) {
      res.status(400).json({ error: `رصيد الخزنة "${found.name}" مش كفاية — المتاح: ${balBefore.toLocaleString("ar-EG")} ج.م` });
      return;
    }
    reg = found;
  } else {
    const registers = await db.select().from(cashRegistersTable)
      .where(eq(cashRegistersTable.isActive, true))
      .orderBy(cashRegistersTable.id);
    const defaultReg = registers.find((r: any) => r.isDefault) ?? registers[0] ?? null;
    if (defaultReg) {
      balBefore = parseFloat(defaultReg.balance ?? "0");
      balAfter  = balBefore - amt;
      if (balAfter < 0) {
        res.status(400).json({ error: `رصيد الخزنة الافتراضية "${defaultReg.name}" مش كفاية — المتاح: ${balBefore.toLocaleString("ar-EG")} ج.م` });
        return;
      }
      reg = defaultReg;
      resolvedRegisterId = defaultReg.id;
    }
  }

  const result = await db.insert(expensesTable).values({
    ...data,
    cashRegisterId: resolvedRegisterId,
    expenseDate: new Date(data.expenseDate),
    createdByUserId: user?.id,
    createdByName: user?.displayName,
    createdAt: now,
  });
  const expenseId = (result as any)[0]?.insertId;

  if (reg && resolvedRegisterId) {
    await db.update(cashRegistersTable)
      .set({ balance: String(balAfter), updatedAt: now })
      .where(eq(cashRegistersTable.id, resolvedRegisterId));

    await db.insert(cashTransactionsTable).values({
      registerId: resolvedRegisterId,
      type: "expense_paid",
      amount: String(amt),
      balanceBefore: String(balBefore),
      balanceAfter: String(balAfter),
      description: data.title,
      referenceNumber: data.referenceId ?? undefined,
      expenseId,
      transactionDate: new Date(data.expenseDate),
      createdByUserId: user?.id ?? null,
      createdByName: user?.displayName ?? null,
      createdAt: now,
    });
  }

  // ── سداد حساب عميل: نسجّل مبلغ السداد عشان يتخصم من رصيد العميل ────────
  if (data.category === "client_payment" && data.clientId) {
    await db.insert(clientAccountPaymentsTable).values({
      tenantId: getTenantId(req),
      clientId: data.clientId,
      amount: String(amt),
      expenseId,
      notes: data.notes ?? null,
      createdByUserId: user?.id ?? null,
      createdByName: user?.displayName ?? null,
      createdAt: now,
    });
  }

  const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, expenseId));
  invalidateSmartCache(getTenantId(req));
  invalidateChartsCache(getTenantId(req));
  res.status(201).json(expense);
});

// ── تقرير المصروفات شهر بشهر (MoM) ─────────────────────────────────────────
router.get("/finance/expenses/monthly-breakdown", async (req, res): Promise<void> => {
  const monthsBack = parseInt((req.query.months as string) ?? "6");
  const tenantId = getTenantId(req);
  const now = new Date();
  const results: Record<string, Record<string, number>> = {};
  const monthLabels: string[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const label = d.toLocaleDateString("ar-EG", { month: "short", year: "numeric" });
    monthLabels.push(label);

    const monthConditions: any[] = [
      gte(expensesTable.expenseDate, from),
      lte(expensesTable.expenseDate, to),
    ];
    if (tenantId !== null) monthConditions.push(eq(expensesTable.tenantId, tenantId));

    const rows = await db.select({
      category: expensesTable.category,
      total: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL(14,2))), 0)`,
    }).from(expensesTable).where(and(...monthConditions)).groupBy(expensesTable.category);

    results[label] = {};
    for (const row of rows) {
      results[label][row.category ?? "other"] = Number(row.total);
    }
  }

  const allCategories = Array.from(
    new Set(Object.values(results).flatMap(m => Object.keys(m)))
  );

  res.json({ months: monthLabels, categories: allCategories, data: results });
});

router.delete("/finance/expenses/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const now = new Date();
    const user = (req as any).user;

    const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
    if (!expense) { res.status(404).json({ error: "المصروف غير موجود" }); return; }

    if (expense.cashRegisterId) {
      const [reg] = await db.select().from(cashRegistersTable)
        .where(eq(cashRegistersTable.id, expense.cashRegisterId));

      if (reg) {
        const balBefore = parseFloat(reg.balance ?? "0");
        const amt       = parseFloat(expense.amount ?? "0");
        const balAfter  = balBefore + amt;

        await db.update(cashRegistersTable)
          .set({ balance: String(balAfter), updatedAt: now })
          .where(eq(cashRegistersTable.id, reg.id));

        await db.insert(cashTransactionsTable).values({
          registerId:    reg.id,
          type:          "deposit",
          amount:        String(amt),
          balanceBefore: String(balBefore),
          balanceAfter:  String(balAfter),
          description:   `إلغاء مصروف: ${expense.title}`,
          referenceNumber: String(id),
          transactionDate: now,
          createdByUserId: user?.id   ?? null,
          createdByName:   user?.displayName ?? null,
          createdAt:     now,
        });
      }
    }

    await db.delete(expensesTable).where(eq(expensesTable.id, id));
    invalidateSmartCache(getTenantId(req));
    invalidateChartsCache(getTenantId(req));
    res.status(204).send();
  } catch (err) { console.error("[DELETE expense]", err); res.status(500).json({ error: "فشل حذف المصروف" }); }
});

// ── Shipping Financial Invoices ─────────────────────────────────────────────
const ShipInvSchema = z.object({
  invoiceNumber: z.string().min(1),
  shippingCompanyId: z.number(),
  manifestId: z.number().nullish(),
  periodFrom: z.string().nullish(),
  periodTo: z.string().nullish(),
  totalOrders: z.number().int().default(0),
  deliveredOrders: z.number().int().default(0),
  returnedOrders: z.number().int().default(0),
  grossRevenue: z.number().default(0),
  shippingFees: z.number().default(0),
  returnFees: z.number().default(0),
  netDue: z.number().default(0),
  notes: z.string().nullish(),
  invoiceDate: z.string(),
  dueDate: z.string().nullish(),
});

router.get("/finance/shipping-invoices", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conditions: any[] = [];
  if (tenantId !== null) conditions.push(sql.raw(`shipping_companies.tenant_id = ${tenantId}`));
  const invoices = await db.select({ inv: shippingFinancialInvoicesTable })
    .from(shippingFinancialInvoicesTable)
    .leftJoin(shippingCompaniesTable, eq(shippingFinancialInvoicesTable.shippingCompanyId, shippingCompaniesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(shippingFinancialInvoicesTable.invoiceDate));
  res.json(invoices.map(r => r.inv));
});

router.post("/finance/shipping-invoices", async (req, res): Promise<void> => {
  const parsed = ShipInvSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date();
  const user = (req as any).user;
  const data = parsed.data;
  const result = await db.insert(shippingFinancialInvoicesTable).values({
    ...data,
    grossRevenue: String(data.grossRevenue),
    shippingFees: String(data.shippingFees),
    returnFees: String(data.returnFees),
    netDue: String(data.netDue),
    paidAmount: "0",
    status: "pending",
    invoiceDate: new Date(data.invoiceDate),
    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    periodFrom: data.periodFrom ? new Date(data.periodFrom) : undefined,
    periodTo: data.periodTo ? new Date(data.periodTo) : undefined,
    createdByUserId: user?.id,
    createdByName: user?.displayName,
    createdAt: now,
    updatedAt: now,
  });
  const id = (result as any)[0]?.insertId;
  const [inv] = await db.select().from(shippingFinancialInvoicesTable).where(eq(shippingFinancialInvoicesTable.id, id));
  res.status(201).json(inv);
});

router.patch("/finance/shipping-invoices/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { status, paidAmount } = req.body;
  const now = new Date();
  const user = (req as any).user;

  const [inv] = await db.select().from(shippingFinancialInvoicesTable).where(eq(shippingFinancialInvoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }

  const prevStatus = inv.status;
  const newStatus  = status ?? prevStatus;
  const prevPaid   = parseFloat(inv.paidAmount ?? "0");
  const netDue     = parseFloat(inv.netDue ?? "0");
  const newPaid    = paidAmount !== undefined ? parseFloat(String(paidAmount)) : prevPaid;

  const updates: any = { updatedAt: now };
  if (status)                               updates.status    = newStatus;
  if (paidAmount !== undefined)             updates.paidAmount = String(newPaid);
  if (newPaid > 0 && prevPaid === 0)        updates.paidAt    = now;

  // ── ربط بالخزنة: لما الفاتورة تتحول لـ paid أضف المبلغ للخزنة ────────────
  if (newStatus === "paid" && prevStatus !== "paid") {
    try {
      const amountToCredit = newPaid > 0 ? newPaid : netDue;
      const regs = await db.select().from(cashRegistersTable)
        .where(eq(cashRegistersTable.isActive, true))
        .orderBy(cashRegistersTable.id);
      const reg = regs.find((r: any) => r.isDefault)
               ?? regs.find((r: any) => r.type === "main")
               ?? regs[0]
               ?? null;

      if (reg) {
        const bb = parseFloat(reg.balance ?? "0");
        const ba = bb + amountToCredit;
        await db.update(cashRegistersTable)
          .set({ balance: String(ba), updatedAt: now })
          .where(eq(cashRegistersTable.id, reg.id));
        await db.insert(cashTransactionsTable).values({
          registerId:      reg.id,
          type:            "shipping_transfer",
          amount:          String(amountToCredit),
          balanceBefore:   String(bb),
          balanceAfter:    String(ba),
          description:     `تحصيل فاتورة شحن ${inv.invoiceNumber}`,
          referenceNumber: inv.invoiceNumber,
          transactionDate: now,
          createdByUserId: user?.id   ?? null,
          createdByName:   user?.displayName ?? null,
          createdAt:       now,
        });
        updates.paidAmount = String(amountToCredit);
        updates.paidAt     = now;
      }
    } catch (e) { console.error("[shipping-invoice paid]", e); }
  }

  // ── لو تم التراجع عن paid → ارجع المبلغ من الخزنة ────────────────────────
  if (prevStatus === "paid" && newStatus !== "paid" && prevPaid > 0) {
    try {
      const regs = await db.select().from(cashRegistersTable)
        .where(eq(cashRegistersTable.isActive, true))
        .orderBy(cashRegistersTable.id);
      const reg = regs.find((r: any) => r.isDefault)
               ?? regs.find((r: any) => r.type === "main")
               ?? regs[0]
               ?? null;

      if (reg) {
        const bb = parseFloat(reg.balance ?? "0");
        const ba = Math.max(0, bb - prevPaid);
        await db.update(cashRegistersTable)
          .set({ balance: String(ba), updatedAt: now })
          .where(eq(cashRegistersTable.id, reg.id));
        await db.insert(cashTransactionsTable).values({
          registerId:      reg.id,
          type:            "withdrawal",
          amount:          String(prevPaid),
          balanceBefore:   String(bb),
          balanceAfter:    String(ba),
          description:     `إلغاء تحصيل فاتورة شحن ${inv.invoiceNumber}`,
          referenceNumber: inv.invoiceNumber,
          transactionDate: now,
          createdByUserId: user?.id   ?? null,
          createdByName:   user?.displayName ?? null,
          createdAt:       now,
        });
        updates.paidAmount = "0";
        updates.paidAt     = null;
      }
    } catch (e) { console.error("[shipping-invoice unpaid]", e); }
  }

  await db.update(shippingFinancialInvoicesTable).set(updates).where(eq(shippingFinancialInvoicesTable.id, id));
  const [updated] = await db.select().from(shippingFinancialInvoicesTable).where(eq(shippingFinancialInvoicesTable.id, id));
  res.json(updated);
});

// ── DELETE /finance/shipping-invoices/:id ────────────────────────────────────
router.delete("/finance/shipping-invoices/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const now = new Date();
    const user = (req as any).user;
    const tenantId = getTenantId(req);

    const conds: any[] = [eq(shippingFinancialInvoicesTable.id, id)];
    // no tenantId column on shippingFinancialInvoicesTable

    const [inv] = await db.select().from(shippingFinancialInvoicesTable).where(and(...conds));
    if (!inv) { res.status(404).json({ error: "الفاتورة غير موجودة" }); return; }

    // لو الفاتورة كانت مدفوعة → ارجع المبلغ من الخزنة
    if (inv.status === "paid" && parseFloat(inv.paidAmount ?? "0") > 0) {
      try {
        const regs = await db.select().from(cashRegistersTable)
          .where(eq(cashRegistersTable.isActive, true))
          .orderBy(cashRegistersTable.id);
        const reg = regs.find((r: any) => r.isDefault)
                 ?? regs.find((r: any) => r.type === "main")
                 ?? regs[0]
                 ?? null;

        if (reg) {
          const paidAmt = parseFloat(inv.paidAmount ?? "0");
          const bb = parseFloat(reg.balance ?? "0");
          const ba = Math.max(0, bb - paidAmt);
          await db.update(cashRegistersTable)
            .set({ balance: String(ba), updatedAt: now })
            .where(eq(cashRegistersTable.id, reg.id));
          await db.insert(cashTransactionsTable).values({
            registerId:      reg.id,
            type:            "withdrawal",
            amount:          String(paidAmt),
            balanceBefore:   String(bb),
            balanceAfter:    String(ba),
            description:     `حذف فاتورة شحن ${inv.invoiceNumber}`,
            referenceNumber: inv.invoiceNumber,
            transactionDate: now,
            createdByUserId: user?.id ?? null,
            createdByName:   user?.displayName ?? null,
            createdAt:       now,
          });
        }
      } catch (e) { console.error("[delete shipping-invoice cash rollback]", e); }
    }

    await db.delete(shippingFinancialInvoicesTable).where(and(...conds));
    res.status(204).send();
  } catch (err: any) {
    console.error("[DELETE shipping-invoice]", err);
    res.status(500).json({ error: "فشل حذف الفاتورة" });
  }
});

// ── Finance Analytics (P&L + Alerts + Trends) ─────────────────────────────
router.get("/finance/analytics", async (req, res): Promise<void> => {
  const { from, to } = req.query;
  const tenantId = getTenantId(req);

  const now = new Date();
  const curFrom  = from ? new Date(from as string) : new Date(now.getFullYear(), now.getMonth(), 1);
  const curTo    = to   ? new Date(to   as string) : now;
  const diffMs   = curTo.getTime() - curFrom.getTime();
  const prevTo   = new Date(curFrom.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - diffMs);

  async function fetchPeriodData(pFrom: Date, pTo: Date) {
    const pToEnd = new Date(pTo); pToEnd.setHours(23, 59, 59, 999);

    const tenantCond = tenantId !== null ? [eq(ordersTable.tenantId, tenantId)] : [];
    const tenantExpCond = tenantId !== null ? [eq(expensesTable.tenantId, tenantId)] : [];

    const ordersData = await db.select({
      revenue:  sql<number>`COALESCE(SUM(total_price), 0)`,
      cogs:     sql<number>`COALESCE(SUM(cost_price * quantity), 0)`,
      shipping: sql<number>`COALESCE(SUM(shipping_cost), 0)`,
      count:    sql<number>`COUNT(*)`,
    }).from(ordersTable).where(and(
      isNull(ordersTable.deletedAt),
      sql`status IN ('received','partial_received')`,
      gte(ordersTable.createdAt, pFrom),
      lte(ordersTable.createdAt, pToEnd),
      ...tenantCond,
    ));

    const [returnedData] = await db.select({
      count: sql<number>`COUNT(*)`,
      loss:  sql<number>`COALESCE(SUM(total_price), 0)`,
    }).from(ordersTable).where(and(
      isNull(ordersTable.deletedAt),
      eq(ordersTable.status as any, "returned"),
      gte(ordersTable.createdAt, pFrom),
      lte(ordersTable.createdAt, pToEnd),
      ...tenantCond,
    ));

    const [expData] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL(14,2))), 0)`,
    }).from(expensesTable).where(and(
      gte(expensesTable.expenseDate, pFrom),
      lte(expensesTable.expenseDate, pToEnd),
      ...tenantExpCond,
    ));

    const expByCategory = await db.select({
      category: expensesTable.category,
      total: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL(14,2))), 0)`,
    }).from(expensesTable).where(and(
      gte(expensesTable.expenseDate, pFrom),
      lte(expensesTable.expenseDate, pToEnd),
      ...tenantExpCond,
    )).groupBy(expensesTable.category);

    const [allOrdersData] = await db.select({
      total:     sql<number>`COUNT(*)`,
      delivered: sql<number>`SUM(CASE WHEN status IN ('received','partial_received') THEN 1 ELSE 0 END)`,
      returned:  sql<number>`SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END)`,
    }).from(ordersTable).where(and(
      isNull(ordersTable.deletedAt),
      gte(ordersTable.createdAt, pFrom),
      lte(ordersTable.createdAt, pToEnd),
      ...tenantCond,
    ));

    const revenue  = Number(ordersData[0]?.revenue  ?? 0);
    const cogs     = Number(ordersData[0]?.cogs     ?? 0);
    const shipping = Number(ordersData[0]?.shipping ?? 0);
    const expenses = Number(expData?.total ?? 0);
    const returnLoss  = Number(returnedData?.loss ?? 0);
    const grossProfit = revenue - cogs - shipping - returnLoss;
    const netProfit   = grossProfit - expenses;

    return {
      revenue, cogs, shipping, expenses, grossProfit, netProfit, returnLoss,
      netMargin: revenue > 0 ? +((netProfit / revenue) * 100).toFixed(1) : 0,
      grossMargin: revenue > 0 ? +((grossProfit / revenue) * 100).toFixed(1) : 0,
      ordersCount: Number(ordersData[0]?.count ?? 0),
      totalOrders: Number(allOrdersData?.total ?? 0),
      deliveredOrders: Number(allOrdersData?.delivered ?? 0),
      returnedOrders: Number(allOrdersData?.returned ?? 0),
      deliveryRate: Number(allOrdersData?.total ?? 0) > 0
        ? +((Number(allOrdersData?.delivered ?? 0) / Number(allOrdersData?.total ?? 0)) * 100).toFixed(1)
        : 0,
      returnRate: Number(allOrdersData?.total ?? 0) > 0
        ? +((Number(allOrdersData?.returned ?? 0) / Number(allOrdersData?.total ?? 0)) * 100).toFixed(1)
        : 0,
      expByCategory,
    };
  }

  const [cur, prev] = await Promise.all([
    fetchPeriodData(curFrom, curTo),
    fetchPeriodData(prevFrom, prevTo),
  ]);

  const pct = (a: number, b: number) => b === 0 ? null : +((( a - b) / b) * 100).toFixed(1);
  const comparison = {
    revenue:    pct(cur.revenue,    prev.revenue),
    netProfit:  pct(cur.netProfit,  prev.netProfit),
    expenses:   pct(cur.expenses,   prev.expenses),
    returnRate: pct(cur.returnRate, prev.returnRate),
    deliveryRate: pct(cur.deliveryRate, prev.deliveryRate),
  };

  const overdueInvoices = await db.select({
    id: shippingFinancialInvoicesTable.id,
    invoiceNumber: shippingFinancialInvoicesTable.invoiceNumber,
    netDue: shippingFinancialInvoicesTable.netDue,
    paidAmount: shippingFinancialInvoicesTable.paidAmount,
    dueDate: shippingFinancialInvoicesTable.dueDate,
  }).from(shippingFinancialInvoicesTable)
    .where(and(
      sql`status IN ('pending','verified')`,
      sql`due_date IS NOT NULL`,
      lt(shippingFinancialInvoicesTable.dueDate as any, now),
      // no tenantId column on shippingFinancialInvoicesTable
    ));

  const [inShipping] = await db.select({
    count:           sql<number>`COUNT(*)`,
    expectedRevenue: sql<number>`COALESCE(SUM(total_price), 0)`,
  }).from(ordersTable).where(and(
    isNull(ordersTable.deletedAt),
    eq(ordersTable.status as any, "in_shipping"),
    ...(tenantId !== null ? [eq(ordersTable.tenantId, tenantId)] : []),
  ));

  const unpaidConditions: any[] = [sql`status IN ('pending','verified')`];
  // no tenantId column on shippingFinancialInvoicesTable
  const [unpaidShipping] = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(net_due AS DECIMAL(14,2)) - COALESCE(CAST(paid_amount AS DECIMAL(14,2)),0)), 0)`,
    count: sql<number>`COUNT(*)`,
  }).from(shippingFinancialInvoicesTable)
    .where(and(...unpaidConditions));

  const topExpenseCategories = [...cur.expByCategory]
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 5)
    .map(e => ({ category: e.category, total: Number(e.total) }));

  const alerts: { type: "danger" | "warning" | "info" | "success"; message: string; detail?: string }[] = [];

  if (cur.netProfit < 0) {
    alerts.push({ type: "danger", message: "الشهر الحالي بخسارة صافية", detail: `الخسارة: ${Math.abs(cur.netProfit).toLocaleString("ar-EG")} ج.م` });
  } else if (cur.netMargin < 10 && cur.revenue > 0) {
    alerts.push({ type: "warning", message: "هامش الربح الصافي منخفض", detail: `الهامش الحالي ${cur.netMargin}% — المثالي فوق 20%` });
  }
  if (cur.returnRate > 25) {
    alerts.push({ type: "danger", message: "نسبة المرتجعات مرتفعة جداً", detail: `${cur.returnRate}% من الطلبات — المعدل الطبيعي أقل من 20%` });
  } else if (cur.returnRate > 18) {
    alerts.push({ type: "warning", message: "نسبة المرتجعات فوق المعدل", detail: `${cur.returnRate}% — راجع أسباب الرجوع` });
  }
  if (overdueInvoices.length > 0) {
    const totalOverdue = overdueInvoices.reduce((s, i) => s + Number(i.netDue) - Number(i.paidAmount), 0);
    alerts.push({ type: "danger", message: `${overdueInvoices.length} فاتورة شحن متأخر سدادها`, detail: `إجمالي المتأخر: ${totalOverdue.toLocaleString("ar-EG")} ج.م` });
  }
  if (comparison.expenses !== null && comparison.expenses > 30) {
    alerts.push({ type: "warning", message: "المصروفات ارتفعت بشكل ملحوظ", detail: `+${comparison.expenses}% مقارنة بالفترة السابقة` });
  }
  if (comparison.revenue !== null && comparison.revenue < -15) {
    alerts.push({ type: "warning", message: "انخفاض في الإيرادات", detail: `${comparison.revenue}% مقارنة بالفترة السابقة` });
  }
  if (comparison.netProfit !== null && comparison.netProfit > 20 && cur.netProfit > 0) {
    alerts.push({ type: "success", message: "أداء ممتاز — الربح ارتفع", detail: `+${comparison.netProfit}% مقارنة بالفترة السابقة` });
  }

  res.json({
    period: { from: curFrom, to: curTo },
    current: cur,
    previous: prev,
    comparison,
    alerts,
    cashFlow: {
      inShippingOrders: Number(inShipping?.count ?? 0),
      expectedIncoming: Number(inShipping?.expectedRevenue ?? 0),
      unpaidShippingDues: Number(unpaidShipping?.total ?? 0),
      unpaidShippingCount: Number(unpaidShipping?.count ?? 0),
      overdueInvoicesCount: overdueInvoices.length,
    },
    topExpenseCategories,
  });
});

export default router;
