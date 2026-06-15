import { Router } from "express";
import ExcelJS from "exceljs";
import { db, cashRegistersTable, cashTransactionsTable, shippingFinancialInvoicesTable, shippingCompaniesTable, shippingManifestsTable, CREDIT_TYPES, DEBIT_TYPES } from "@workspace/db";
import { eq, desc, sql, and, gte, lte, ne, inArray, isNull } from "drizzle-orm";
import { getTenantId } from "../middlewares/requireTenant.js";

const creditSql = sql.raw([...CREDIT_TYPES].map(t => `'${t}'`).join(","));
const debitSql  = sql.raw([...DEBIT_TYPES].map(t => `'${t}'`).join(","));

export const cashRegistersRouter = Router();

const TX_LABELS_AR: Record<string, string> = {
  deposit: "إيداع", withdrawal: "سحب", order_collected: "تحصيل طلب",
  shipping_transfer: "تحويل شحن", cash_sale: "مبيعات نقدية",
  expense_paid: "دفع مصروف", purchase_paid: "دفع مورد",
  transfer_in: "تحويل وارد", transfer_out: "تحويل صادر",
};


// ─── GET /api/cash-registers ─────────────────────────────────────────────────
cashRegistersRouter.get("/", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const tReg = tenantId !== null ? and(eq(cashRegistersTable.isActive, true), eq(cashRegistersTable.tenantId, tenantId)) : eq(cashRegistersTable.isActive, true);
    const registers = await db.select().from(cashRegistersTable).where(tReg).orderBy(cashRegistersTable.type);
    const total = registers.reduce((s, r) => s + parseFloat(r.balance ?? "0"), 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const summaries = await Promise.all(registers.map(async (reg) => {
      const [s] = await db.select({
        totalIn:  sql<number>`COALESCE(SUM(CASE WHEN type IN (${creditSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END), 0)`,
        totalOut: sql<number>`COALESCE(SUM(CASE WHEN type IN (${debitSql})  THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END), 0)`,
        txCount:  sql<number>`COUNT(*)`,
      }).from(cashTransactionsTable).where(and(eq(cashTransactionsTable.registerId, reg.id), gte(cashTransactionsTable.transactionDate, monthStart)));
      return { registerId: reg.id, monthlyIn: Number(s?.totalIn??0), monthlyOut: Number(s?.totalOut??0), txCount: Number(s?.txCount??0) };
    }));
    const registersWithSummary = registers.map(r => ({
      ...r,
      monthlyIn:  summaries.find(s=>s.registerId===r.id)?.monthlyIn  ?? 0,
      monthlyOut: summaries.find(s=>s.registerId===r.id)?.monthlyOut ?? 0,
      txCount:    summaries.find(s=>s.registerId===r.id)?.txCount    ?? 0,
    }));
    res.json({ registers: registersWithSummary, totalBalance: total });
  } catch (err) { res.status(500).json({ error: "فشل جلب الخزن" }); }
});

// ─── POST /api/cash-registers ────────────────────────────────────────────────
cashRegistersRouter.post("/", async (req, res) => {
  try {
    const { name, type = "branch", description, initialBalance = 0, isDefault = false } = req.body as any;
    const safeBalance = parseFloat(initialBalance) || 0;
    const now = new Date();

    // لو الخزنة الجديدة هتبقى default → اشيل الـ default من أي خزنة تانية
    if (isDefault) {
      await db.update(cashRegistersTable)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(cashRegistersTable.isDefault, true));
    }

    const [result] = await db.insert(cashRegistersTable).values({ name, type, description: description || null, balance: String(safeBalance), isDefault: isDefault ? true : false, createdByUserId: req.body.userId ?? null, createdByName: req.body.userName ?? null, createdAt: now, updatedAt: now });
    const newId = (result as any).insertId;
    if (safeBalance > 0) {
      await db.insert(cashTransactionsTable).values({ registerId: newId, type: "deposit", amount: String(safeBalance), balanceBefore: "0", balanceAfter: String(safeBalance), description: "رصيد افتتاحي", transactionDate: now, createdByUserId: req.body.userId ?? null, createdByName: req.body.userName ?? null, createdAt: now });
    }
    if (type === "main") {
      try {
        const pendingInvoices = await db.select().from(shippingFinancialInvoicesTable).where(eq(shippingFinancialInvoicesTable.status, "pending"));
        let runningBalance = safeBalance;
        for (const inv of pendingInvoices) {
          const totalDue = Number(inv.netDue ?? 0); const alreadyPaid = Number(inv.paidAmount ?? 0); const remaining = totalDue - alreadyPaid;
          if (remaining <= 0) continue;
          const balanceBefore = runningBalance; const balanceAfter = runningBalance + remaining; runningBalance = balanceAfter;
          const [manifest] = inv.manifestId ? await db.select().from(shippingManifestsTable).where(eq(shippingManifestsTable.id, inv.manifestId)) : [null];
          const [company] = await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, inv.shippingCompanyId));
          await db.insert(cashTransactionsTable).values({ registerId: newId, type: "shipping_transfer" as any, amount: String(remaining), balanceBefore: String(balanceBefore), balanceAfter: String(balanceAfter), description: `تحصيل بيان شحن ${manifest?.manifestNumber ?? inv.invoiceNumber} - ${company?.name ?? ""}`, referenceNumber: inv.invoiceNumber, transactionDate: now, createdByUserId: req.body.userId ?? null, createdByName: req.body.userName ?? null, createdAt: now });
          await db.update(shippingFinancialInvoicesTable).set({ status: "paid", paidAmount: String(totalDue), paidAt: now, updatedAt: now }).where(eq(shippingFinancialInvoicesTable.id, inv.id));
        }
        if (runningBalance !== safeBalance) await db.update(cashRegistersTable).set({ balance: String(runningBalance), updatedAt: now }).where(eq(cashRegistersTable.id, newId));
      } catch (e) { console.error("[cash-register create main]", e); }
    }
    res.json({ success: true, id: newId });
  } catch (err: any) {
    console.error("[POST /cash-registers]", err);
    res.status(500).json({ error: "فشل إنشاء الخزنة", detail: err?.message ?? String(err) });
  }
});

// ─── GET smart-alerts, analytics, alerts ─────────────────────────────────────
cashRegistersRouter.get("/smart-alerts", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const tReg = tenantId !== null ? and(eq(cashRegistersTable.isActive, true), eq(cashRegistersTable.tenantId, tenantId)) : eq(cashRegistersTable.isActive, true);
    const registers = await db.select().from(cashRegistersTable).where(tReg);
    const now = new Date(); const dayAgo = new Date(now.getTime()-86400000); const weekAgo = new Date(now.getTime()-604800000);
    const alerts: any[] = [];
    for (const r of registers) {
      if (r.lowBalanceThreshold && parseFloat(r.balance??"0") <= parseFloat(r.lowBalanceThreshold))
        alerts.push({ type:"danger", title:`رصيد "${r.name}" منخفض`, detail:`الرصيد: ${parseFloat(r.balance??'0').toLocaleString("ar-EG")} ج.م — الحد: ${parseFloat(r.lowBalanceThreshold).toLocaleString("ar-EG")} ج.م`, registerId:r.id });
    }
    const bigTransfers = await db.select().from(cashTransactionsTable).where(and(eq(cashTransactionsTable.type,"transfer_out"),gte(cashTransactionsTable.createdAt,dayAgo),sql`CAST(amount AS DECIMAL(14,2)) >= 5000`)).orderBy(desc(cashTransactionsTable.createdAt));
    if (bigTransfers.length>0) { const total=bigTransfers.reduce((s,t)=>s+parseFloat(t.amount??"0"),0); alerts.push({type:"warning",title:`${bigTransfers.length} تحويل كبير آخر 24 ساعة`,detail:`إجمالي: ${total.toLocaleString("ar-EG")} ج.م`}); }
    for (const r of registers) {
      const [last]=await db.select({lastDate:sql<Date>`MAX(transaction_date)`}).from(cashTransactionsTable).where(eq(cashTransactionsTable.registerId,r.id));
      if ((!last?.lastDate||new Date(last.lastDate)<weekAgo)&&parseFloat(r.balance??"0")>0) alerts.push({type:"info",title:`خزنة "${r.name}" بدون حركات 7 أيام`,detail:`الرصيد المجمّد: ${parseFloat(r.balance??'0').toLocaleString("ar-EG")} ج.م`,registerId:r.id});
    }
    for (const r of registers) {
      if (parseFloat(r.balance??"0")===0) { const [cnt]=await db.select({c:sql<number>`COUNT(*)`}).from(cashTransactionsTable).where(eq(cashTransactionsTable.registerId,r.id)); if (Number(cnt?.c??0)>0) alerts.push({type:"warning",title:`خزنة "${r.name}" رصيدها صفر`,detail:"تحتاج إيداع أو تحويل",registerId:r.id}); }
    }
    res.json({ alerts, generatedAt: now });
  } catch (err) { console.error(err); res.status(500).json({ error: "فشل جلب التنبيهات الذكية" }); }
});

cashRegistersRouter.get("/analytics", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const tReg = tenantId !== null ? and(eq(cashRegistersTable.isActive, true), eq(cashRegistersTable.tenantId, tenantId)) : eq(cashRegistersTable.isActive, true);
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const sixMonthsAgo   = new Date(now.getFullYear(), now.getMonth()-5, 1);

    // جيب الخزن الخاصة بالـ tenant أولاً
    const registers = await db.select().from(cashRegistersTable).where(tReg);
    const regIds = registers.map(r => r.id);

    // لو مفيش خزن → رجّع أصفار
    if (regIds.length === 0) {
      return res.json({ currentMonth:{totalIn:0,totalOut:0,net:0,txCount:0}, lastMonth:{totalIn:0,totalOut:0,net:0,txCount:0}, changes:{inPct:null,outPct:null,netPct:null}, monthlyChart:[], typeBreakdown:[], registerComparison:[], topTransactions:[] });
    }

    const tTx = inArray(cashTransactionsTable.registerId, regIds);

    const [thisMo]  = await db.select({totalIn:sql<number>`COALESCE(SUM(CASE WHEN type IN (${creditSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,totalOut:sql<number>`COALESCE(SUM(CASE WHEN type IN (${debitSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,txCount:sql<number>`COUNT(*)`}).from(cashTransactionsTable).where(and(tTx, gte(cashTransactionsTable.transactionDate, thisMonthStart)));
    const [lastMo]  = await db.select({totalIn:sql<number>`COALESCE(SUM(CASE WHEN type IN (${creditSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,totalOut:sql<number>`COALESCE(SUM(CASE WHEN type IN (${debitSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,txCount:sql<number>`COUNT(*)`}).from(cashTransactionsTable).where(and(tTx, gte(cashTransactionsTable.transactionDate, lastMonthStart), lte(cashTransactionsTable.transactionDate, lastMonthEnd)));

    const thisIn = Number(thisMo?.totalIn??0); const thisOut = Number(thisMo?.totalOut??0);
    const lastIn = Number(lastMo?.totalIn??0);  const lastOut = Number(lastMo?.totalOut??0);
    const pct = (cur: number, prev: number) => prev === 0 ? null : Math.round(((cur-prev)/prev)*100);

    const monthlyRows = await db.select({month:sql<string>`DATE_FORMAT(transaction_date,'%Y-%m')`,totalIn:sql<number>`COALESCE(SUM(CASE WHEN type IN (${creditSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,totalOut:sql<number>`COALESCE(SUM(CASE WHEN type IN (${debitSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`}).from(cashTransactionsTable).where(and(tTx, gte(cashTransactionsTable.transactionDate, sixMonthsAgo))).groupBy(sql`DATE_FORMAT(transaction_date,'%Y-%m')`).orderBy(sql`DATE_FORMAT(transaction_date,'%Y-%m')`);

    const typeRows = await db.select({type:cashTransactionsTable.type,total:sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL(14,2))),0)`,count:sql<number>`COUNT(*)`}).from(cashTransactionsTable).where(and(tTx, gte(cashTransactionsTable.transactionDate, thisMonthStart))).groupBy(cashTransactionsTable.type).orderBy(desc(sql`SUM(CAST(amount AS DECIMAL(14,2)))`));

    const regComparison = await Promise.all(registers.map(async (r) => {
      const [s] = await db.select({totalIn:sql<number>`COALESCE(SUM(CASE WHEN type IN (${creditSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,totalOut:sql<number>`COALESCE(SUM(CASE WHEN type IN (${debitSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,txCount:sql<number>`COUNT(*)`}).from(cashTransactionsTable).where(and(eq(cashTransactionsTable.registerId, r.id), gte(cashTransactionsTable.transactionDate, thisMonthStart)));
      return { id:r.id, name:r.name, type:r.type, balance:parseFloat(r.balance??'0'), monthlyIn:Number(s?.totalIn??0), monthlyOut:Number(s?.totalOut??0), txCount:Number(s?.txCount??0) };
    }));

    const topTx = await db.select().from(cashTransactionsTable).where(and(tTx, gte(cashTransactionsTable.transactionDate, thisMonthStart))).orderBy(desc(sql`CAST(amount AS DECIMAL(14,2))`)).limit(5);

    res.json({ currentMonth:{totalIn:thisIn,totalOut:thisOut,net:thisIn-thisOut,txCount:Number(thisMo?.txCount??0)}, lastMonth:{totalIn:lastIn,totalOut:lastOut,net:lastIn-lastOut,txCount:Number(lastMo?.txCount??0)}, changes:{inPct:pct(thisIn,lastIn),outPct:pct(thisOut,lastOut),netPct:pct(thisIn-thisOut,lastIn-lastOut)}, monthlyChart:monthlyRows.map(r=>({month:r.month,in:Number(r.totalIn),out:Number(r.totalOut),net:Number(r.totalIn)-Number(r.totalOut)})), typeBreakdown:typeRows.map(r=>({type:r.type,total:Number(r.total),count:Number(r.count)})), registerComparison:regComparison, topTransactions:topTx });
  } catch(err) { console.error(err); res.status(500).json({ error:"فشل جلب التحليلات" }); }
});

cashRegistersRouter.get("/alerts", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const tReg = tenantId !== null ? and(eq(cashRegistersTable.isActive, true), eq(cashRegistersTable.tenantId, tenantId)) : eq(cashRegistersTable.isActive, true);
    const registers=await db.select().from(cashRegistersTable).where(tReg);
    const alerts=registers.filter(r=>r.lowBalanceThreshold&&parseFloat(r.balance??"0")<=parseFloat(r.lowBalanceThreshold)).map(r=>({registerId:r.id,name:r.name,balance:parseFloat(r.balance??"0"),threshold:parseFloat(r.lowBalanceThreshold??"0"),type:r.type}));
    res.json({alerts});
  } catch(err){res.status(500).json({error:"فشل جلب التنبيهات"});}
});

// ─── POST transaction ─────────────────────────────────────────────────────────
cashRegistersRouter.post("/:id/transaction", async (req, res) => {
  try {
    const registerId=parseInt(req.params.id); const{type,amount,description,referenceNumber,transactionDate,orderId}=req.body as any; const amt=parseFloat(amount); const now=new Date();
    const[register]=await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id,registerId));
    if(!register)return res.status(404).json({error:"الخزنة مش موجودة"});
    const balanceBefore=parseFloat(register.balance??"0"); const DEBIT=["withdrawal","expense_paid","purchase_paid","transfer_out"]; const isDebit=DEBIT.includes(type);
    const balanceAfter=isDebit?balanceBefore-amt:balanceBefore+amt;
    if(isDebit&&balanceAfter<0)return res.status(400).json({error:`الرصيد مش كفاية — المتاح: ${balanceBefore.toLocaleString("ar-EG")} ج.م`});
    await db.update(cashRegistersTable).set({balance:String(balanceAfter),updatedAt:now}).where(eq(cashRegistersTable.id,registerId));
    await db.insert(cashTransactionsTable).values({registerId,type,amount:String(amt),balanceBefore:String(balanceBefore),balanceAfter:String(balanceAfter),description,referenceNumber,orderId:orderId?Number(orderId):null,transactionDate:transactionDate?new Date(transactionDate):now,createdByUserId:req.body.userId??null,createdByName:req.body.userName??null,createdAt:now});
    res.json({success:true,newBalance:balanceAfter});
  } catch(err){res.status(500).json({error:"فشل تسجيل الحركة"});}
});

// ─── POST transfer ────────────────────────────────────────────────────────────
cashRegistersRouter.post("/transfer", async (req, res) => {
  try {
    const{fromId,toId,amount,description}=req.body as any; const amt=parseFloat(amount); const now=new Date();
    const[from]=await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id,fromId));
    const[to]=await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id,toId));
    if(!from||!to)return res.status(404).json({error:"خزنة غير موجودة"});
    const fromBefore=parseFloat(from.balance??"0"); const toBefore=parseFloat(to.balance??"0");
    if(fromBefore-amt<0)return res.status(400).json({error:`رصيد "${from.name}" مش كفاية — المتاح: ${fromBefore.toLocaleString("ar-EG")} ج.م`});
    const fromAfter=fromBefore-amt; const toAfter=toBefore+amt;
    await db.update(cashRegistersTable).set({balance:String(fromAfter),updatedAt:now}).where(eq(cashRegistersTable.id,fromId));
    await db.update(cashRegistersTable).set({balance:String(toAfter),updatedAt:now}).where(eq(cashRegistersTable.id,toId));
    await db.insert(cashTransactionsTable).values([
      {registerId:fromId,type:"transfer_out",amount:String(amt),balanceBefore:String(fromBefore),balanceAfter:String(fromAfter),transferToRegisterId:toId,description:description??`تحويل إلى ${to.name}`,transactionDate:now,createdAt:now,createdByUserId:req.body.userId??null,createdByName:req.body.userName??null},
      {registerId:toId,type:"transfer_in",amount:String(amt),balanceBefore:String(toBefore),balanceAfter:String(toAfter),transferToRegisterId:fromId,description:description??`تحويل من ${from.name}`,transactionDate:now,createdAt:now,createdByUserId:req.body.userId??null,createdByName:req.body.userName??null},
    ]);
    res.json({success:true,fromBalance:fromAfter,toBalance:toAfter});
  } catch(err){res.status(500).json({error:"فشل التحويل"});}
});

// ─── GET transactions (with direction filter) ─────────────────────────────────
cashRegistersRouter.get("/:id/transactions", async (req, res) => {
  try {
    const registerId=parseInt(req.params.id); const{from,to,type,direction,page="1",limit="50"}=req.query as any;
    const pageNum=Math.max(1,parseInt(page)); const limitNum=Math.min(200,Math.max(1,parseInt(limit))); const offset=(pageNum-1)*limitNum;
    const conditions:any[]=[eq(cashTransactionsTable.registerId,registerId)];
    if(from)conditions.push(gte(cashTransactionsTable.transactionDate,new Date(from)));
    if(to){const toDate=new Date(to);toDate.setHours(23,59,59,999);conditions.push(lte(cashTransactionsTable.transactionDate,toDate));}
    if(type&&type!=="all")conditions.push(eq(cashTransactionsTable.type,type));
    if(direction==="in") conditions.push(sql`type IN (${creditSql})`);
    if(direction==="out")conditions.push(sql`type IN (${debitSql})`);
    const[stats]=await db.select({totalIn:sql<number>`COALESCE(SUM(CASE WHEN type IN (${creditSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,totalOut:sql<number>`COALESCE(SUM(CASE WHEN type IN (${debitSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,txCount:sql<number>`COUNT(*)`}).from(cashTransactionsTable).where(and(...conditions));
    const transactions=await db.select().from(cashTransactionsTable).where(and(...conditions)).orderBy(desc(cashTransactionsTable.transactionDate)).limit(limitNum).offset(offset);
    res.json({transactions,stats:{totalIn:Number(stats?.totalIn??0),totalOut:Number(stats?.totalOut??0),net:Number(stats?.totalIn??0)-Number(stats?.totalOut??0),txCount:Number(stats?.txCount??0)},pagination:{page:pageNum,limit:limitNum,total:Number(stats?.txCount??0)}});
  } catch(err){res.status(500).json({error:"فشل جلب الحركات"});}
});

// ─── GET export CSV ───────────────────────────────────────────────────────────
cashRegistersRouter.get("/:id/export", async (req, res) => {
  try {
    const registerId=parseInt(req.params.id); const{from,to,type,direction}=req.query as any;
    const[register]=await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id,registerId));
    if(!register)return res.status(404).json({error:"الخزنة مش موجودة"});
    const conditions:any[]=[eq(cashTransactionsTable.registerId,registerId)];
    if(from)conditions.push(gte(cashTransactionsTable.transactionDate,new Date(from)));
    if(to){const toDate=new Date(to);toDate.setHours(23,59,59,999);conditions.push(lte(cashTransactionsTable.transactionDate,toDate));}
    if(type&&type!=="all")conditions.push(eq(cashTransactionsTable.type,type));
    if(direction==="in") conditions.push(sql`type IN (${creditSql})`);
    if(direction==="out")conditions.push(sql`type IN (${debitSql})`);
    const transactions=await db.select().from(cashTransactionsTable).where(and(...conditions)).orderBy(desc(cashTransactionsTable.transactionDate)).limit(5000);
    const rows=[
      ["التاريخ","نوع الحركة","الاتجاه","المبلغ","الرصيد قبل","الرصيد بعد","مرجع","ملاحظة","بواسطة"],
      ...transactions.map(tx=>[new Date(tx.transactionDate).toLocaleDateString("ar-EG"),TX_LABELS_AR[tx.type]??tx.type,CREDIT_TYPES.includes(tx.type as any)?"دخل":"خروج",parseFloat(tx.amount??"0"),parseFloat(tx.balanceBefore??"0"),parseFloat(tx.balanceAfter??"0"),tx.referenceNumber??"",tx.description??"",tx.createdByName??""]),
    ];
    const csv="\uFEFF"+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const dateStr=new Date().toISOString().slice(0,10);
    res.setHeader("Content-Type","text/csv; charset=utf-8");
    res.setHeader("Content-Disposition",`attachment; filename="cash-${registerId}-${dateStr}.csv"`);
    res.send(csv);
  } catch(err){res.status(500).json({error:"فشل التصدير"});}
});

// ─── GET export Excel (exceljs) ───────────────────────────────────────────────
cashRegistersRouter.get("/:id/export-excel", async (req, res) => {
  try {
    const registerId=parseInt(req.params.id); const{from,to,type,direction}=req.query as any;
    const[register]=await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id,registerId));
    if(!register)return res.status(404).json({error:"الخزنة مش موجودة"});
    const conditions:any[]=[eq(cashTransactionsTable.registerId,registerId)];
    if(from)conditions.push(gte(cashTransactionsTable.transactionDate,new Date(from)));
    if(to){const toDate=new Date(to);toDate.setHours(23,59,59,999);conditions.push(lte(cashTransactionsTable.transactionDate,toDate));}
    if(type&&type!=="all")conditions.push(eq(cashTransactionsTable.type,type));
    if(direction==="in") conditions.push(sql`type IN (${creditSql})`);
    if(direction==="out")conditions.push(sql`type IN (${debitSql})`);
    const transactions=await db.select().from(cashTransactionsTable).where(and(...conditions)).orderBy(desc(cashTransactionsTable.transactionDate)).limit(5000);
    const[statsRow]=await db.select({totalIn:sql<number>`COALESCE(SUM(CASE WHEN type IN (${creditSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,totalOut:sql<number>`COALESCE(SUM(CASE WHEN type IN (${debitSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,txCount:sql<number>`COUNT(*)`}).from(cashTransactionsTable).where(and(...conditions));
    const totalIn=Number(statsRow?.totalIn??0); const totalOut=Number(statsRow?.totalOut??0);

    const wb=new ExcelJS.Workbook(); wb.creator="Caprina"; wb.created=new Date();

    // Sheet 1 — كشف الحساب
    const ws=wb.addWorksheet("كشف الحساب",{views:[{rightToLeft:true}]});
    ws.columns=[{header:"التاريخ",key:"date",width:14},{header:"نوع الحركة",key:"type",width:18},{header:"الاتجاه",key:"dir",width:10},{header:"المبلغ (ج.م)",key:"amount",width:14},{header:"الرصيد قبل",key:"before",width:16},{header:"الرصيد بعد",key:"after",width:16},{header:"رقم مرجعي",key:"ref",width:14},{header:"ملاحظة",key:"desc",width:28},{header:"بواسطة",key:"by",width:14}];
    ws.getRow(1).font={bold:true,size:11}; ws.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFDEA821"}};
    for(const tx of transactions){
      const isIn=CREDIT_TYPES.includes(tx.type as any);
      const row=ws.addRow({date:new Date(tx.transactionDate).toLocaleDateString("ar-EG"),type:TX_LABELS_AR[tx.type]??tx.type,dir:isIn?"دخل":"خروج",amount:parseFloat(tx.amount??"0"),before:parseFloat(tx.balanceBefore??"0"),after:parseFloat(tx.balanceAfter??"0"),ref:tx.referenceNumber??"",desc:tx.description??"",by:tx.createdByName??""});
      row.getCell("amount").font={color:{argb:isIn?"FF10B981":"FFF43F5E"},bold:true};
    }

    // Sheet 2 — ملخص
    const ws2=wb.addWorksheet("ملخص",{views:[{rightToLeft:true}]});
    ws2.columns=[{header:"البيان",key:"label",width:22},{header:"القيمة",key:"value",width:24}];
    ws2.getRow(1).font={bold:true,size:11}; ws2.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFDEA821"}};
    const summaryRows=[["الخزنة",register.name],["النوع",register.type==="main"?"رئيسية":"فرعية"],["الرصيد الحالي",parseFloat(register.balance??"0")],["من",from??"—"],["إلى",to??"—"],["إجمالي الدخل",totalIn],["إجمالي الخروج",totalOut],["الصافي",totalIn-totalOut],["عدد الحركات",Number(statsRow?.txCount??0)],["تاريخ التصدير",new Date().toLocaleDateString("ar-EG")]];
    summaryRows.forEach(([label,value])=>ws2.addRow({label,value}));

    const dateStr=new Date().toISOString().slice(0,10);
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="cash-${registerId}-${dateStr}.xlsx"`);
    await wb.xlsx.write(res); res.end();
  } catch(err){console.error(err);res.status(500).json({error:"فشل تصدير Excel"});}
});

// ─── GET flow, PATCH, DELETE ──────────────────────────────────────────────────
cashRegistersRouter.get("/:id/flow", async (req, res) => {
  try {
    const registerId=parseInt(req.params.id); const{days="30"}=req.query as any; const daysNum=Math.min(90,parseInt(days)); const since=new Date(); since.setDate(since.getDate()-daysNum);
    const rows=await db.select({day:sql<string>`DATE(transaction_date)`,totalIn:sql<number>`COALESCE(SUM(CASE WHEN type IN (${creditSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`,totalOut:sql<number>`COALESCE(SUM(CASE WHEN type IN (${debitSql}) THEN CAST(amount AS DECIMAL(14,2)) ELSE 0 END),0)`}).from(cashTransactionsTable).where(and(eq(cashTransactionsTable.registerId,registerId),gte(cashTransactionsTable.transactionDate,since))).groupBy(sql`DATE(transaction_date)`).orderBy(sql`DATE(transaction_date)`);
    res.json(rows.map(r=>({day:r.day,in:Number(r.totalIn),out:Number(r.totalOut),net:Number(r.totalIn)-Number(r.totalOut)})));
  } catch(err){res.status(500).json({error:"فشل جلب التدفق"});}
});

cashRegistersRouter.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, isDefault } = req.body as any;
    const now = new Date();

    // لو بيحدد isDefault = true → اشيل الـ default من الخزن الأخرى الأول
    if (isDefault === true) {
      await db.update(cashRegistersTable)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(cashRegistersTable.isDefault, true));
    }

    const updates: any = { updatedAt: now };
    if (name !== undefined)      updates.name        = name;
    if (description !== undefined) updates.description = description;
    if (isDefault !== undefined) updates.isDefault   = isDefault;

    await db.update(cashRegistersTable).set(updates).where(eq(cashRegistersTable.id, id));
    res.json({ success: true });
  } catch(err){ res.status(500).json({ error: "فشل التعديل" }); }
});

cashRegistersRouter.patch("/:id/threshold", async (req, res) => {
  try {
    const{lowBalanceThreshold}=req.body as any;
    await db.update(cashRegistersTable).set({lowBalanceThreshold:lowBalanceThreshold?String(lowBalanceThreshold):null,updatedAt:new Date()}).where(eq(cashRegistersTable.id,parseInt(req.params.id)));
    res.json({success:true});
  } catch(err){res.status(500).json({error:"فشل ضبط الحد"});}
});

cashRegistersRouter.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [reg] = await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id, id));
    if (!reg) return res.status(404).json({ error: "الخزنة مش موجودة" });
    if (reg.type === "main") return res.status(400).json({ error: "مش ممكن تحذف الخزنة الرئيسية" });
    if (parseFloat(reg.balance ?? "0") > 0) return res.status(400).json({ error: "حول الرصيد المتبقي قبل الأرشفة" });
    await db.update(cashRegistersTable).set({
      isActive: false,
      archivedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(cashRegistersTable.id, id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "فشل الأرشفة" }); }
});

// ─── GET /archived — جلب الخزن المؤرشفة ──────────────────────────────────────
cashRegistersRouter.get("/archived", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const tArchived = tenantId !== null
      ? and(eq(cashRegistersTable.isActive, false), eq(cashRegistersTable.tenantId, tenantId))
      : eq(cashRegistersTable.isActive, false);
    const archived = await db.select().from(cashRegistersTable)
      .where(tArchived)
      .orderBy(desc(cashRegistersTable.updatedAt));
    res.json({ registers: archived });
  } catch (err) { res.status(500).json({ error: "فشل جلب الأرشيف" }); }
});

// ─── PATCH /:id/restore — استعادة خزنة من الأرشيف ────────────────────────────
cashRegistersRouter.patch("/:id/restore", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [reg] = await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id, id));
    if (!reg) return res.status(404).json({ error: "الخزنة مش موجودة" });
    if (reg.isActive) return res.status(400).json({ error: "الخزنة شغالة بالفعل" });
    await db.update(cashRegistersTable).set({
      isActive: true,
      archivedAt: null,
      updatedAt: new Date(),
    }).where(eq(cashRegistersTable.id, id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "فشل الاستعادة" }); }
});

// ─── DELETE /:id/permanent — حذف نهائي من الأرشيف ────────────────────────────
cashRegistersRouter.delete("/:id/permanent", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [reg] = await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id, id));
    if (!reg) return res.status(404).json({ error: "الخزنة مش موجودة" });
    if (reg.isActive) return res.status(400).json({ error: "الخزنة شغالة — أرشفها الأول" });
    // حذف الحركات المرتبطة أولاً
    await db.delete(cashTransactionsTable).where(eq(cashTransactionsTable.registerId, id));
    // حذف الخزنة
    await db.delete(cashRegistersTable).where(eq(cashRegistersTable.id, id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "فشل الحذف النهائي" }); }
});

// ─── PATCH /api/cash-registers/transactions/:id — تعديل حركة ─────────────────
cashRegistersRouter.patch("/transactions/:id", async (req, res) => {
  try {
    const txId = parseInt(req.params.id);
    const { type, amount, description, referenceNumber, transactionDate } = req.body as any;

    const [tx] = await db.select().from(cashTransactionsTable).where(eq(cashTransactionsTable.id, txId));
    if (!tx) return res.status(404).json({ error: "الحركة مش موجودة" });

    const updates: any = { updatedAt: new Date() };
    if (type)              updates.type = type;
    if (amount)            updates.amount = String(parseFloat(amount));
    if (description !== undefined) updates.description = description;
    if (referenceNumber !== undefined) updates.referenceNumber = referenceNumber;
    if (transactionDate)   updates.transactionDate = new Date(transactionDate);

    await db.update(cashTransactionsTable).set(updates).where(eq(cashTransactionsTable.id, txId));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "فشل تعديل الحركة" }); }
});

// ─── DELETE /api/cash-registers/transactions/:id — حذف حركة ──────────────────
cashRegistersRouter.delete("/transactions/:id", async (req, res) => {
  try {
    const txId = parseInt(req.params.id);
    const [tx] = await db.select().from(cashTransactionsTable).where(eq(cashTransactionsTable.id, txId));
    if (!tx) return res.status(404).json({ error: "الحركة مش موجودة" });

    // نرجع الرصيد للخزنة
    const [reg] = await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id, tx.registerId));
    if (reg) {
      const currentBalance = parseFloat(reg.balance ?? "0");
      const txAmount = parseFloat(tx.amount ?? "0");
      const isCredit = CREDIT_TYPES.includes(tx.type as any);
      // لو كانت حركة دخل نشيلها من الرصيد، لو خروج نرجعها
      const newBalance = isCredit ? currentBalance - txAmount : currentBalance + txAmount;
      await db.update(cashRegistersTable).set({ balance: String(Math.max(0, newBalance)), updatedAt: new Date() }).where(eq(cashRegistersTable.id, tx.registerId));
    }

    await db.delete(cashTransactionsTable).where(eq(cashTransactionsTable.id, txId));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "فشل حذف الحركة" }); }
});
