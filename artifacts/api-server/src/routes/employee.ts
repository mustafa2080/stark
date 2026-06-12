import { Router, type IRouter } from "express";
import { eq, and, or, gte, lte, desc, isNotNull, isNull, like, sum } from "drizzle-orm";
import {
  db,
  usersTable,
  ordersTable,
  employeeProfilesTable,
  employeeKpisTable,
  employeeDailyLogsTable,
  attendanceTable,
  appSettingsTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin, requireSuperAdmin } from "../middlewares/requireRole";
import { getTenantId } from "../middlewares/requireTenant.js";

const router: IRouter = Router();
router.use(requireAuth);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helper: compute actual KPI value from orders
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function profitFromOrder(o: typeof ordersTable.$inferSelect): number {
  const qty =
    o.status === "partial_received" && o.partialQuantity ? o.partialQuantity : o.quantity;
  const cost = (o.costPrice ?? 0) * qty;
  const shipping = o.shippingCost ?? 0;
  if (o.status === "received" || o.status === "partial_received") {
    const rev =
      o.status === "partial_received" && o.partialQuantity
        ? o.unitPrice * o.partialQuantity
        : o.totalPrice;
    return rev - cost - shipping;
  }
  if (o.status === "returned") return -(cost + shipping);
  return 0;
}

async function computeActualValue(
  metric: string,
  userId: number,
  dateFrom: Date,
  dateTo: Date,
  tenantId?: number | null
): Promise<number | null> {
  if (metric === "manual") return null;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        or(
          eq(ordersTable.assignedUserId, userId),
          eq(ordersTable.createdByUserId, userId)
        ),
        gte(ordersTable.createdAt, dateFrom),
        lte(ordersTable.createdAt, dateTo),
        isNull(ordersTable.deletedAt),
        tenantId != null ? eq(ordersTable.tenantId, tenantId) : undefined
      )
    );

  if (orders.length === 0) {
    if (metric === "delivery_rate" || metric === "return_rate") return 0;
    return 0;
  }

  switch (metric) {
    case "delivery_rate": {
      const delivered = orders.filter(
        (o) => o.status === "received" || o.status === "partial_received"
      ).length;
      return Math.round((delivered / orders.length) * 100);
    }
    case "return_rate": {
      const returned = orders.filter((o) => o.status === "returned").length;
      return Math.round((returned / orders.length) * 100);
    }
    case "total_orders": {
      // ط¹ط¯ ط§ظ„ظ€ invoices ط§ظ„ظپط±ظٹط¯ط© (ظ…ط´ ط§ظ„ظ€ rows) â€” ظ†ظپط³ ظ…ظ†ط·ظ‚ orders.tsx
      const uniqueInvoices = new Set(orders.map(o => o.invoiceNumber ?? `solo-${o.id}`));
      return uniqueInvoices.size;
    }
    case "profit":
      return Math.round(orders.reduce((s, o) => s + profitFromOrder(o), 0));
    case "revenue":
      return Math.round(
        orders
          .filter((o) => o.status === "received" || o.status === "partial_received")
          .reduce((s, o) => {
            const rev =
              o.status === "partial_received" && o.partialQuantity
                ? o.unitPrice * o.partialQuantity
                : o.totalPrice;
            return s + rev;
          }, 0)
      );
    default:
      return null;
  }
}

function computeKpiScore(
  actual: number,
  target: number,
  direction: string
): number {
  if (target === 0) return actual === 0 ? 100 : 0;
  if (direction === "lower_is_better") {
    return actual <= target ? 100 : Math.max(0, Math.round((target / actual) * 100));
  }
  return Math.min(100, Math.round((actual / target) * 100));
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Resolve profile with merged displayName
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function mergeProfile(profile: typeof employeeProfilesTable.$inferSelect, user: typeof usersTable.$inferSelect | null) {
  return {
    ...profile,
    displayName: profile.displayName ?? user?.displayName ?? "â€”",
    username: user?.username ?? null,
    role: user?.role ?? "team_only",
    isActive: user?.isActive ?? true,
    isSystemUser: user !== null,
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Employee Profiles CRUD
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// â”€â”€â”€ ط¯ط§ظ„ط© ط­ط³ط§ط¨ ط¯ظˆط±ط© ط§ظ„ط±ط§طھط¨: ظ…ظ† 26 ط§ظ„ط´ظ‡ط± ط§ظ„ط³ط§ط¨ظ‚ ظ„ظ€ 25 ط§ظ„ط´ظ‡ط± ط§ظ„ط­ط§ظ„ظٹ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getPayPeriod(monthParam: string): { dateFrom: Date; dateTo: Date; periodLabel: string } {
  let year: number, month: number;
  if (monthParam) {
    [year, month] = monthParam.split("-").map(Number);
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  // ظ…ظ†: 26 ط§ظ„ط´ظ‡ط± ط§ظ„ط³ط§ط¨ظ‚
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const dateFrom  = new Date(prevYear, prevMonth - 1, 26, 0, 0, 0, 0);
  // ط¥ظ„ظ‰: 25 ط§ظ„ط´ظ‡ط± ط§ظ„ط­ط§ظ„ظٹ
  const dateTo    = new Date(year, month - 1, 25, 23, 59, 59, 999);
  const periodLabel = `${prevYear}-${String(prevMonth).padStart(2,"0")}-26 â†’ ${year}-${String(month).padStart(2,"0")}-25`;
  return { dateFrom, dateTo, periodLabel };
}

router.get("/employee-profiles", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);

  // ط¬ظ„ط¨ ظƒظ„ ط§ظ„ظ€ profiles ظ…ط¹ ط§ظ„ظ€ users ط¨ظ€ leftJoin
  const rows = await db
    .select({ profile: employeeProfilesTable, user: usersTable })
    .from(employeeProfilesTable)
    .leftJoin(usersTable, eq(employeeProfilesTable.userId, usersTable.id));

  // ظپظ„طھط±ط© ط¨ط§ظ„ظ€ tenant ظ…ظ† ط§ظ„ظ€ profile ظ…ط¨ط§ط´ط±ط©
  const filtered = tenantId !== null
    ? rows.filter(r => (r.profile as any).tenantId === tenantId)
    : rows.filter(r => (r.profile as any).tenantId === null);

  // ط¬ظ„ط¨ kpiCount ظ„ظƒظ„ profile ط¯ظپط¹ط© ظˆط§ط­ط¯ط©
  const allKpis = await db.select().from(employeeKpisTable).where(eq(employeeKpisTable.isActive, true));
  const kpiCountMap: Record<number, number> = {};
  const kpisByProfile: Record<number, any[]> = {};
  for (const k of allKpis) {
    if (k.profileId == null) continue;
    kpiCountMap[k.profileId] = (kpiCountMap[k.profileId] ?? 0) + 1;
    if (!kpisByProfile[k.profileId]) kpisByProfile[k.profileId] = [];
    kpisByProfile[k.profileId].push(k);
  }

  // ط¬ظ„ط¨ ط§ظ„ط­ط¶ظˆط± ظ„ظ„ط´ظ‡ط± ط§ظ„ط­ط§ظ„ظٹ ظ„ظƒظ„ profile
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const attRecords = await db.select({
    profileId: attendanceTable.profileId,
    status: attendanceTable.status,
  }).from(attendanceTable).where(like(attendanceTable.date, `${monthStr}-%`));

  const attMap: Record<number, { workedDays: number; absentDays: number; lateDays: number }> = {};
  for (const r of attRecords) {
    if (r.profileId == null) continue;
    if (!attMap[r.profileId]) attMap[r.profileId] = { workedDays: 0, absentDays: 0, lateDays: 0 };
    if (r.status === "present") attMap[r.profileId].workedDays++;
    if (r.status === "late")    { attMap[r.profileId].workedDays++; attMap[r.profileId].lateDays++; }
    if (r.status === "absent")  attMap[r.profileId].absentDays++;
    if (r.status === "half_day") attMap[r.profileId].workedDays += 0.5;
  }

  // ─── نفس getPayPeriod اللي بيستخدمه employee-report ────────────────────────
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { dateFrom: mFrom, dateTo: mTo } = getPayPeriod(currentMonthStr);
  const periodStart = mFrom.toISOString().slice(0, 10);
  const periodEnd   = mTo.toISOString().slice(0, 10);

  // نفس employee-report بالظبط:
  // reportDayNumber  = now.getDate()
  // reportDaysInMonth = أيام الشهر اللي فيه dateFrom (مش عدد أيام الفترة)
  const dayNum      = now.getDate();
  const daysInMonth = new Date(mFrom.getFullYear(), mFrom.getMonth() + 1, 0).getDate();

  const allLogs = await db
    .select({ profileId: employeeDailyLogsTable.profileId, kpiId: employeeDailyLogsTable.kpiId, total: sum(employeeDailyLogsTable.value) })
    .from(employeeDailyLogsTable)
    .where(and(gte(employeeDailyLogsTable.date, periodStart), lte(employeeDailyLogsTable.date, periodEnd)))
    .groupBy(employeeDailyLogsTable.profileId, employeeDailyLogsTable.kpiId);
  const logsMap: Record<number, Record<number, number>> = {};
  for (const l of allLogs) {
    if (l.profileId == null || l.kpiId == null) continue;
    if (!logsMap[l.profileId]) logsMap[l.profileId] = {};
    logsMap[l.profileId][l.kpiId] = parseFloat(String(l.total ?? "0"));
  }

  // ─── today's logs لحساب dailyScore ──────────────────────────────────────────
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayLogs = await db
    .select({ profileId: employeeDailyLogsTable.profileId, kpiId: employeeDailyLogsTable.kpiId, total: sum(employeeDailyLogsTable.value) })
    .from(employeeDailyLogsTable)
    .where(and(eq(employeeDailyLogsTable.date, todayStr)))
    .groupBy(employeeDailyLogsTable.profileId, employeeDailyLogsTable.kpiId);
  const todayLogsMap: Record<number, Record<number, number>> = {};
  for (const l of todayLogs) {
    if (l.profileId == null || l.kpiId == null) continue;
    if (!todayLogsMap[l.profileId]) todayLogsMap[l.profileId] = {};
    todayLogsMap[l.profileId][l.kpiId] = parseFloat(String(l.total ?? "0"));
  }
  // pay-period vars لحساب dailyScore بنفس منطق daily-logs route
  const periodDays = Math.round((mTo.getTime() - mFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const dayNumberInPeriod = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - mFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const dailyScoreMap: Record<number, number | null> = {};
  const todayDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayDateObjEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // ─── overallScore + dailyScore: نفس منطق employee-report بالظبط ────────────
  const overallScoreMap: Record<number, number | null> = {};
  // mFrom و mTo و currentMonthStr معرّفين فوق من getPayPeriod

  await Promise.all(filtered.map(async (r) => {
    const pid = r.profile.id;
    try {
      const kpis2 = kpisByProfile[pid] ?? [];
      const profileLogs = logsMap[pid] ?? {};       // cumulative الشهر
      const todayProfileLogs = todayLogsMap[pid] ?? {}; // اليوم فقط
      const userId2  = (r.profile as any).userId ?? null;
      const tenantId2 = (r.profile as any).tenantId ?? null;

      // ── شهري: نفس employee-report للشهر الحالي ──────────────────────────────
      // effectiveTarget = round((targetValue / daysInMonth) * dayNum)  ← progressive
      const scoredM: { score: number; weight: number }[] = [];
      for (const kpi of kpis2) {
        let actual: number | null = null;
        if (kpi.metric === "manual") {
          actual = profileLogs[kpi.id] ?? 0;
        } else {
          actual = userId2 ? await computeActualValue(kpi.metric, userId2, mFrom, mTo, tenantId2) : null;
        }
        if (actual === null) continue;
        const effTarget = Math.max(1, Math.round((kpi.targetValue / daysInMonth) * dayNum));
        scoredM.push({ score: computeKpiScore(actual, effTarget, kpi.direction ?? "higher_is_better"), weight: kpi.weight ?? 1 });
      }
      const twM = scoredM.reduce((s, k) => s + k.weight, 0);
      overallScoreMap[pid] = scoredM.length > 0
        ? twM > 0
          ? Math.round(scoredM.reduce((s, k) => s + k.score * k.weight, 0) / twM)
          : Math.round(scoredM.reduce((s, k) => s + k.score, 0) / scoredM.length)
        : null;

      // ── fallback شهري من الطلبات لو مفيش KPIs (نفس employee-report) ──────────
      if (overallScoreMap[pid] === null && userId2) {
        const mOrders = await db.select().from(ordersTable).where(and(
          or(eq(ordersTable.assignedUserId, userId2), eq(ordersTable.createdByUserId, userId2)),
          gte(ordersTable.createdAt, mFrom), lte(ordersTable.createdAt, mTo),
          isNull(ordersTable.deletedAt),
          tenantId2 != null ? eq(ordersTable.tenantId, tenantId2) : undefined
        ));
        if (mOrders.length > 0) {
          const _sp: Record<string, number> = { pending:1,in_shipping:2,warehouse_ready:3,delayed:4,partial_received:5,received:6,returned:7 };
          const _imap = new Map<string, (typeof ordersTable.$inferSelect)[]>();
          for (const o of mOrders) { const k = o.invoiceNumber ?? `solo-${o.id}`; if (!_imap.has(k)) _imap.set(k,[]); _imap.get(k)!.push(o); }
          const _inv = Array.from(_imap.values()).map(rows => { const ss=rows.map(r=>r.status); return [...ss].sort((a,b)=>(_sp[a]??99)-(_sp[b]??99))[0]; });
          const mDel = _inv.filter(s => s === "received" || s === "partial_received").length;
          const mRet = _inv.filter(s => s === "returned").length;
          const mClosed = mDel + mRet;
          if (mClosed > 0) {
            const cdr = Math.round((mDel / mClosed) * 100);
            const crr = Math.round((mRet / mClosed) * 100);
            overallScoreMap[pid] = Math.round(cdr * 0.6 + Math.max(0, 100 - crr * 2) * 0.4);
          }
        }
      }

      // ── يومي: نفس daily-logs route — تراكمي من بداية الفترة + هدف pay-period ──
      const scoredD: { score: number; weight: number }[] = [];
      for (const kpi of kpis2) {
        let todayActual: number | null = null;
        if (kpi.metric === "manual") {
          // تراكمي من بداية الـ pay period (نفس daily-logs route)
          todayActual = profileLogs[kpi.id] ?? 0;
        } else {
          // للـ non-manual: احسب اليوم فقط من computeActualValue
          todayActual = userId2 ? await computeActualValue(kpi.metric, userId2, todayDateObj, todayDateObjEnd, tenantId2) : null;
        }
        if (todayActual === null) continue;
        // نفس daily-logs route: manual → تراكمي progressive، auto → هدف يوم واحد
        const effDailyTarget = kpi.metric === "manual"
          ? Math.round((kpi.targetValue / periodDays) * dayNumberInPeriod)
          : Math.max(1, Math.round(kpi.targetValue / periodDays));
        scoredD.push({ score: computeKpiScore(todayActual, effDailyTarget, kpi.direction ?? "higher_is_better"), weight: kpi.weight ?? 1 });
      }
      const twD = scoredD.reduce((s, k) => s + k.weight, 0);
      dailyScoreMap[pid] = scoredD.length > 0
        ? twD > 0
          ? Math.round(scoredD.reduce((s, k) => s + k.score * k.weight, 0) / twD)
          : Math.round(scoredD.reduce((s, k) => s + k.score, 0) / scoredD.length)
        : null;

      // ── fallback يومي من طلبات اليوم لو مفيش KPIs (نفس profile.tsx) ──────────
      if (dailyScoreMap[pid] === null && userId2) {
        const dOrders = await db.select().from(ordersTable).where(and(
          or(eq(ordersTable.assignedUserId, userId2), eq(ordersTable.createdByUserId, userId2)),
          gte(ordersTable.createdAt, todayDateObj), lte(ordersTable.createdAt, todayDateObjEnd),
          isNull(ordersTable.deletedAt),
          tenantId2 != null ? eq(ordersTable.tenantId, tenantId2) : undefined
        ));
        if (dOrders.length > 0) {
          const dDel = dOrders.filter(o => o.status === "received" || o.status === "partial_received").length;
          const dRet = dOrders.filter(o => o.status === "returned").length;
          const dClosed = dDel + dRet;
          if (dClosed > 0) {
            const dcdr = Math.round((dDel / dClosed) * 100);
            const dcrr = Math.round((dRet / dClosed) * 100);
            dailyScoreMap[pid] = Math.round(dcdr * 0.6 + Math.max(0, 100 - dcrr * 2) * 0.4);
          }
        }
      }

    } catch { overallScoreMap[pid] = null; dailyScoreMap[pid] = null; }
  }));
  res.json(filtered.map((r) => ({
    ...mergeProfile(r.profile, r.user),
    kpiCount: kpiCountMap[r.profile.id] ?? 0,
    attendanceSummary: attMap[r.profile.id] ?? { workedDays: 0, absentDays: 0, lateDays: 0 },
    attendanceScore: (() => {
      const att = attMap[r.profile.id] ?? { workedDays: 0 };
      return dayNum > 0 ? Math.min(100, Math.round((att.workedDays / dayNum) * 100)) : null;
    })(),
    overallScore: overallScoreMap[r.profile.id] ?? null,
    dailyScore: dailyScoreMap[r.profile.id] ?? null,
  })));
});

// GET by profile ID
router.get("/employee-profiles/:profileId", async (req, res): Promise<void> => {
  const profileId = parseInt(String(req.params.profileId));
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }

  const [row] = await db
    .select({ profile: employeeProfilesTable, user: usersTable })
    .from(employeeProfilesTable)
    .leftJoin(usersTable, eq(employeeProfilesTable.userId, usersTable.id))
    .where(eq(employeeProfilesTable.id, profileId));

  if (!row) { res.status(404).json({ error: "ط§ظ„ظ…ظˆط¸ظپ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }); return; }

  const kpis = await db
    .select()
    .from(employeeKpisTable)
    .where(eq(employeeKpisTable.profileId, profileId))
    .orderBy(employeeKpisTable.createdAt);

  res.json({
    ...mergeProfile(row.profile, row.user),
    kpis,
  });
});

const ProfileSchema = z.object({
  userId: z.number().int().positive().optional(),
  displayName: z.string().min(1).optional(),
  jobTitle: z.string().nullish(),
  department: z.string().nullish(),
  monthlySalary: z.number().min(0).optional(),
  hireDate: z.string().nullish(),
  notes: z.string().nullish(),
  avatar: z.string().nullish(),
});

// POST â€” create or upsert profile
router.post("/employee-profiles", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ProfileSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;

  // If userId given, check if profile already exists
  if (data.userId) {
    const [existing] = await db
      .select()
      .from(employeeProfilesTable)
      .where(eq(employeeProfilesTable.userId, data.userId));

    if (existing) {
      await db
        .update(employeeProfilesTable)
        .set({
          jobTitle: data.jobTitle ?? null,
          department: data.department ?? null,
          monthlySalary: data.monthlySalary ?? 0,
          hireDate: data.hireDate ?? null,
          notes: data.notes ?? null,
          avatar: data.avatar !== undefined ? (data.avatar ?? null) : undefined,
        })
        .where(eq(employeeProfilesTable.userId, data.userId));
      const [updated] = await db.select().from(employeeProfilesTable).where(eq(employeeProfilesTable.userId, data.userId!));
      res.json(updated);
      return;
    }
  }

  // Create new profile
  const creatorTenantId = getTenantId(req);
  const insertResult = await db
    .insert(employeeProfilesTable)
    .values({
      tenantId: creatorTenantId ?? undefined,
      userId: data.userId ?? null,
      displayName: data.displayName ?? null,
      jobTitle: data.jobTitle ?? null,
      department: data.department ?? null,
      monthlySalary: data.monthlySalary ?? 0,
      hireDate: data.hireDate ?? null,
      notes: data.notes ?? null,
      avatar: data.avatar ?? null,
    });
  const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
  const [created] = await db.select().from(employeeProfilesTable).where(eq(employeeProfilesTable.id, insertId));
  res.status(201).json(created);
});

router.patch("/employee-profiles/:profileId", requireAdmin, async (req, res): Promise<void> => {
  const profileId = parseInt(String(req.params.profileId));
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }

  const Schema = ProfileSchema.partial();
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // طھط­ظ‚ظ‚ ظ…ظ† ظˆط¬ظˆط¯ ط§ظ„ظ…ظ„ظپ ط£ظˆظ„ط§ظ‹
  const [existing] = await db.select({ id: employeeProfilesTable.id }).from(employeeProfilesTable).where(eq(employeeProfilesTable.id, profileId));
  if (!existing) { res.status(404).json({ error: "ط§ظ„ظ…ظ„ظپ ط§ظ„ط´ط®طµظٹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }); return; }

  await db
    .update(employeeProfilesTable)
    .set({ ...parsed.data as any, updatedAt: new Date() })
    .where(eq(employeeProfilesTable.id, profileId));

  // â”€â”€ sync users table ظ„ظˆ ط§ظ„ظ€ profile ظ…ط±طھط¨ط· ط¨ظ€ userId â”€â”€
  const [updatedProfile] = await db.select().from(employeeProfilesTable).where(eq(employeeProfilesTable.id, profileId));
  if (updatedProfile.userId) {
    const userUpdates: Record<string, any> = {};
    if (parsed.data.displayName !== undefined) userUpdates.displayName = parsed.data.displayName;
    if (parsed.data.avatar !== undefined) userUpdates.avatar = parsed.data.avatar ?? null;
    if (Object.keys(userUpdates).length > 0) {
      await db.update(usersTable).set(userUpdates).where(eq(usersTable.id, updatedProfile.userId));
    }
  }

  const [updated] = await db.select().from(employeeProfilesTable).where(eq(employeeProfilesTable.id, profileId));
  res.json(updated);
});

router.delete("/employee-profiles/:profileId", requireAdmin, async (req, res): Promise<void> => {
  const profileId = parseInt(String(req.params.profileId));
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }
  await db.delete(employeeProfilesTable).where(eq(employeeProfilesTable.id, profileId));
  res.status(204).send();
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Employee KPIs CRUD  (all keyed by profileId)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const KpiSchema = z.object({
  profileId: z.number().int().positive(),
  name: z.string().min(1),
  metric: z.string().default("manual"),
  targetValue: z.number(),
  unit: z.string().default("%"),
  direction: z.enum(["higher_is_better", "lower_is_better"]).default("higher_is_better"),
  weight: z.number().min(0).max(100).default(100),
  salaryWeight: z.number().min(0).max(100).default(0),
  overtargetBonus: z.number().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  description: z.string().nullish(),
});

router.get("/employee-kpis/:profileId", async (req, res): Promise<void> => {
  const profileId = parseInt(String(req.params.profileId));
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }
  const kpis = await db
    .select()
    .from(employeeKpisTable)
    .where(eq(employeeKpisTable.profileId, profileId))
    .orderBy(employeeKpisTable.createdAt);
  res.json(kpis);
});

router.post("/employee-kpis", requireAdmin, async (req, res): Promise<void> => {
  const parsed = KpiSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Resolve userId from profile for auto-computed metrics
  const [profile] = await db
    .select()
    .from(employeeProfilesTable)
    .where(eq(employeeProfilesTable.id, parsed.data.profileId));
  const userId = profile?.userId ?? null;

  const kpiInsertResult = await db
    .insert(employeeKpisTable)
    .values({
      profileId: parsed.data.profileId,
      userId,
      name: parsed.data.name,
      metric: parsed.data.metric,
      targetValue: parsed.data.targetValue,
      unit: parsed.data.unit,
      direction: parsed.data.direction,
      weight: parsed.data.weight,
      salaryWeight: parsed.data.salaryWeight,
      overtargetBonus: parsed.data.overtargetBonus,
      isActive: parsed.data.isActive,
      description: parsed.data.description ?? null,
    });
  const kpiInsertId = (kpiInsertResult as any)[0]?.insertId ?? (kpiInsertResult as any).insertId;
  const [kpi] = await db.select().from(employeeKpisTable).where(eq(employeeKpisTable.id, kpiInsertId));
  res.status(201).json(kpi);
});

router.patch("/employee-kpis/:kpiId", requireAdmin, async (req, res): Promise<void> => {
  const kpiId = parseInt(String(req.params.kpiId));
  if (isNaN(kpiId)) { res.status(400).json({ error: "Invalid kpiId" }); return; }

  const Schema = KpiSchema.partial().omit({ profileId: true });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const kpiUpdateResult = await db
    .update(employeeKpisTable)
    .set(parsed.data as any)
    .where(eq(employeeKpisTable.id, kpiId));
  if (!(kpiUpdateResult as any)[0]?.affectedRows) { res.status(404).json({ error: "ط§ظ„ظ…ط¤ط´ط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }); return; }
  const [updated] = await db.select().from(employeeKpisTable).where(eq(employeeKpisTable.id, kpiId));
  res.json(updated);
});

router.delete("/employee-kpis/:kpiId", requireSuperAdmin, async (req, res): Promise<void> => {
  const kpiId = parseInt(String(req.params.kpiId));
  if (isNaN(kpiId)) { res.status(400).json({ error: "Invalid kpiId" }); return; }
  await db.delete(employeeKpisTable).where(eq(employeeKpisTable.id, kpiId));
  res.status(204).send();
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Monthly Report  (by profileId)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get("/analytics/employee-report/:profileId", async (req, res): Promise<void> => {
  const profileId = parseInt(String(req.params.profileId));
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }

  const monthParam = (req.query.month as string) || "";
  const mode = (req.query.mode as string) || "monthly"; // "monthly" | "daily"
  const dateParam = (req.query.date as string) || ""; // YYYY-MM-DD for daily mode

  let dateFrom: Date;
  let dateTo: Date;
  let resolvedMonth: string;

  if (mode === "daily" && dateParam) {
    // daily mode: range = start of day → end of day
    const d = new Date(dateParam);
    dateFrom = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    dateTo   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    resolvedMonth = dateParam.slice(0, 7);
  } else {
    const period = getPayPeriod(monthParam);
    dateFrom = period.dateFrom;
    dateTo   = period.dateTo;
    resolvedMonth = monthParam || `${dateFrom.getFullYear()}-${String(dateFrom.getMonth() + 1).padStart(2, "0")}`;
  }

  const [row] = await db
    .select({ profile: employeeProfilesTable, user: usersTable })
    .from(employeeProfilesTable)
    .leftJoin(usersTable, eq(employeeProfilesTable.userId, usersTable.id))
    .where(eq(employeeProfilesTable.id, profileId));

  if (!row) { res.status(404).json({ error: "الموظف غير موجود" }); return; }

  const profile = row.profile;
  const userRow = row.user;
  const userId = profile.userId;

  const kpis = await db
    .select()
    .from(employeeKpisTable)
    .where(and(eq(employeeKpisTable.profileId, profileId), eq(employeeKpisTable.isActive, true)));

  // daily mode: use dateParam directly to avoid UTC timezone shift
  // monthly mode: use resolvedMonth to build correct date range
  const manualLogsDateStart = mode === "daily" && dateParam
    ? dateParam
    : `${resolvedMonth}-01`;
  const manualLogsDateEnd = mode === "daily" && dateParam
    ? dateParam
    : `${resolvedMonth}-31`;
  const manualLogs = await db
    .select({ kpiId: employeeDailyLogsTable.kpiId, total: sum(employeeDailyLogsTable.value) })
    .from(employeeDailyLogsTable)
    .where(
      and(
        eq(employeeDailyLogsTable.profileId, profileId),
        gte(employeeDailyLogsTable.date, manualLogsDateStart),
        lte(employeeDailyLogsTable.date, manualLogsDateEnd)
      )
    )
    .groupBy(employeeDailyLogsTable.kpiId);
  const manualCumulativeMap = new Map(
    manualLogs.map(r => [r.kpiId, parseFloat(String(r.total ?? "0"))])
  );

  // Order stats (only for system users)
  let orderStats = {
    total: 0, delivered: 0, returned: 0, pending: 0,
    deliveryRate: 0, returnRate: 0, totalRevenue: 0, totalProfit: 0,
  };

  if (userId) {
    const tenantId = (profile as any).tenantId;
    const orders = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          or(
            eq(ordersTable.assignedUserId, userId),
            eq(ordersTable.createdByUserId, userId)
          ),
          gte(ordersTable.createdAt, dateFrom),
          lte(ordersTable.createdAt, dateTo),
          isNull(ordersTable.deletedAt),
          tenantId != null ? eq(ordersTable.tenantId, tenantId) : undefined
        )
      );

    // â”€â”€ ط­ط³ط§ط¨ ط§ظ„ط¥ط­طµط§ط¦ظٹط§طھ ط¹ظ„ظ‰ ظ…ط³طھظˆظ‰ ط§ظ„ظ€ invoice (ظ…ط´ ط§ظ„ظ€ rows) â”€â”€
    // ظ†ظپط³ ظ…ظ†ط·ظ‚ buildPerUserInvoices ظپظٹ team-analytics.ts
    const STATUS_PRIORITY: Record<string, number> = {
      pending: 1, in_shipping: 2, warehouse_ready: 3, delayed: 4,
      partial_received: 5, received: 6, returned: 7,
    };
    const invoiceRowsMap = new Map<string, (typeof ordersTable.$inferSelect)[]>();
    for (const o of orders) {
      const key = o.invoiceNumber ?? `solo-${o.id}`;
      if (!invoiceRowsMap.has(key)) invoiceRowsMap.set(key, []);
      invoiceRowsMap.get(key)!.push(o);
    }
    const invoiceStatuses = Array.from(invoiceRowsMap.values()).map(rows => {
      const statuses = rows.map(r => r.status);
      if (statuses.length === 1) return { status: statuses[0], rows };
      const resolved = [...statuses].sort(
        (a, b) => (STATUS_PRIORITY[a] ?? 99) - (STATUS_PRIORITY[b] ?? 99)
      )[0];
      return { status: resolved, rows };
    });
    const totalInvoices = invoiceStatuses.length;
    const delivered = invoiceStatuses.filter(
      (i) => i.status === "received" || i.status === "partial_received"
    ).length;
    const returned = invoiceStatuses.filter((i) => i.status === "returned").length;
    const pending = invoiceStatuses.filter(
      (i) => i.status !== "received" && i.status !== "partial_received" && i.status !== "returned"
    ).length;
    const totalRevenue = orders
      .filter((o) => o.status === "received" || o.status === "partial_received")
      .reduce((s, o) => {
        const rev =
          o.status === "partial_received" && o.partialQuantity
            ? o.unitPrice * o.partialQuantity
            : o.totalPrice;
        return s + rev;
      }, 0);
    const totalProfit = orders.reduce((s, o) => s + profitFromOrder(o), 0);
    orderStats = {
      total: totalInvoices,
      delivered,
      returned,
      pending,
      deliveryRate: totalInvoices > 0 ? Math.round((delivered / totalInvoices) * 100) : 0,
      returnRate: totalInvoices > 0 ? Math.round((returned / totalInvoices) * 100) : 0,
      totalRevenue,
      totalProfit,
    };
  }

  // For manual KPIs: if the month is still in progress, compare against
  // the progressive target (monthlyTarget * daysPassed / daysInMonth)
  // In daily mode: compare against daily target (monthlyTarget / daysInMonth).
  const now = new Date();
  const isCurrentMonth =
    dateFrom.getFullYear() === now.getFullYear() &&
    dateFrom.getMonth() === now.getMonth();
  const reportDayNumber  = isCurrentMonth ? now.getDate() : dateTo.getDate();
  const reportDaysInMonth = new Date(dateFrom.getFullYear(), dateFrom.getMonth() + 1, 0).getDate();

  const evaluatedKpis = await Promise.all(
    kpis.map(async (kpi) => {
      let actualValue: number | null;
      if (kpi.metric === "manual") {
        // daily mode: today's value only; monthly mode: cumulative sum
        actualValue = manualCumulativeMap.get(kpi.id) ?? 0;
      } else {
        actualValue = userId
          ? await computeActualValue(kpi.metric, userId, dateFrom, dateTo, (profile as any).tenantId)
          : 0;
      }
      // daily mode: compare today's value vs (monthlyTarget / daysInMonth)
      // monthly current: compare cumulative vs progressive target so far
      // monthly past: compare vs full monthly target
      const effectiveTarget = mode === 'daily'
        ? Math.round(kpi.targetValue / reportDaysInMonth)
        : isCurrentMonth
          ? Math.max(1, Math.round((kpi.targetValue / reportDaysInMonth) * reportDayNumber))
          : kpi.targetValue;
      const score =
        actualValue !== null
          ? computeKpiScore(actualValue, effectiveTarget, kpi.direction)
          : null;
      const achieved =
        score !== null ? (kpi.direction === "lower_is_better" ? score >= 70 : score >= 80) : null;
      return { ...kpi, actualValue, score, achieved, effectiveTarget };
    })
  );

  const scoredKpis = evaluatedKpis.filter((k) => k.score !== null);
  const baseSalary = profile.monthlySalary ?? 0;
  const kpiFinancials = evaluatedKpis.reduce(
    (acc, kpi) => {
      const salaryWeight = (kpi as any).salaryWeight ?? 0;
      const overtargetBonus = (kpi as any).overtargetBonus ?? 0;
      const salaryImpact = baseSalary > 0 ? Math.round((salaryWeight / 100) * baseSalary) : 0;
      const bonusImpact = baseSalary > 0 ? Math.round((overtargetBonus / 100) * baseSalary) : 0;

      acc.totalSalaryWeight += salaryWeight;
      acc.achievedCount += kpi.achieved === true ? 1 : 0;
      acc.failedCount += kpi.achieved === false ? 1 : 0;
      acc.overTargetCount += kpi.score !== null && kpi.score > 100 ? 1 : 0;
      acc.totalDeduction += kpi.achieved === false && salaryWeight > 0 ? salaryImpact : 0;
      acc.totalBonus += kpi.score !== null && kpi.score > 100 && overtargetBonus > 0 ? bonusImpact : 0;
      return acc;
    },
    {
      totalSalaryWeight: 0,
      totalDeduction: 0,
      totalBonus: 0,
      achievedCount: 0,
      failedCount: 0,
      overTargetCount: 0,
    }
  );
  let overallScore: number | null = null;
  if (scoredKpis.length > 0) {
    const totalWeight = scoredKpis.reduce((s, k) => s + k.weight, 0);
    overallScore =
      totalWeight > 0
        ? Math.round(scoredKpis.reduce((s, k) => s + k.score! * k.weight, 0) / totalWeight)
        : Math.round(scoredKpis.reduce((s, k) => s + k.score!, 0) / scoredKpis.length);
  }

  // fallback: ظ„ظˆ ظ…ظپظٹط´ KPIs â€” ظ†ط­ط³ط¨ ظ…ظ† ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ظ…ط؛ظ„ظ‚ط© ظپظ‚ط· (delivered + returned)
  if (overallScore === null && orderStats.total > 0) {
    const closedCount = orderStats.delivered + orderStats.returned;
    if (closedCount > 0) {
      const closedDeliveryRate = Math.round((orderStats.delivered / closedCount) * 100);
      const closedReturnRate   = Math.round((orderStats.returned  / closedCount) * 100);
      const returnPenalty      = Math.max(0, 100 - closedReturnRate * 2);
      overallScore = Math.round(closedDeliveryRate * 0.6 + returnPenalty * 0.4);
    }
    // ظ„ظˆ ظ…ظپظٹط´ ط·ظ„ط¨ط§طھ ظ…ط؛ظ„ظ‚ط© ط®ط§ظ„طµ â†’ ظ…ظپظٹط´ score ط¨ط¹ط¯ (ظƒظ„ ط§ظ„ط·ظ„ط¨ط§طھ ظ„ط³ظ‡ pending)
  }

  const rating =
    overallScore === null ? "ظ„ط§ طھظˆط¬ط¯ ط¨ظٹط§ظ†ط§طھ"
    : overallScore >= 90 ? "ظ…ظ…طھط§ط²"
    : overallScore >= 75 ? "ط¬ظٹط¯ ط¬ط¯ط§ظ‹"
    : overallScore >= 60 ? "ط¬ظٹط¯"
    : overallScore >= 40 ? "ظ…ظ‚ط¨ظˆظ„"
    : "ط¶ط¹ظٹظپ";

  res.json({
    profileId,
    userId: userId ?? null,
    username: userRow?.username ?? null,
    displayName: profile.displayName ?? userRow?.displayName ?? "â€”",
    role: userRow?.role ?? "team_only",
    isSystemUser: userRow !== null,
    profile,
    period: {
      mode,
      month: resolvedMonth,
      date: mode === "daily" ? dateParam : undefined,
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    },
    orderStats,
    kpis: evaluatedKpis,
    kpiFinancials: {
      ...kpiFinancials,
      totalSalaryWeight: Math.round(kpiFinancials.totalSalaryWeight),
      totalDeduction: Math.round(kpiFinancials.totalDeduction),
      totalBonus: Math.round(kpiFinancials.totalBonus),
      salaryAtRiskPercent: Math.round(kpiFinancials.totalSalaryWeight),
    },
    overallScore,
    rating,
    salary: baseSalary,
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /analytics/my-report?month=YYYY-MM  (current user from token)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/analytics/my-report", async (req, res): Promise<void> => {
  const userId = (req as any).user?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db
    .select({ profile: employeeProfilesTable, user: usersTable })
    .from(employeeProfilesTable)
    .leftJoin(usersTable, eq(employeeProfilesTable.userId, usersTable.id))
    .where(eq(employeeProfilesTable.userId, userId));

  if (!row || !row.profile) {
    // No employee profile â€” return basic stats from orders only
  const monthParam = (req.query.month as string) || "";
  const { dateFrom, dateTo } = getPayPeriod(monthParam);

    const orders = await db
      .select()
      .from(ordersTable)
      .where(and(
        or(
          eq(ordersTable.assignedUserId, userId),
          eq(ordersTable.createdByUserId, userId)
        ),
        gte(ordersTable.createdAt, dateFrom),
        lte(ordersTable.createdAt, dateTo),
        isNull(ordersTable.deletedAt)
      ));

    const [userRow] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    // â”€â”€ ط¹ط¯ ط§ظ„ظ€ invoices ط§ظ„ظپط±ظٹط¯ط© â”€â”€
    const _sp0: Record<string, number> = { pending:1,in_shipping:2,warehouse_ready:3,delayed:4,partial_received:5,received:6,returned:7 };
    const _imap0 = new Map<string, (typeof ordersTable.$inferSelect)[]>();
    for (const o of orders) { const k = o.invoiceNumber ?? `solo-${o.id}`; if (!_imap0.has(k)) _imap0.set(k,[]); _imap0.get(k)!.push(o); }
    const _inv0 = Array.from(_imap0.values()).map(rows => { const ss=rows.map(r=>r.status); return [...ss].sort((a,b)=>(_sp0[a]??99)-(_sp0[b]??99))[0]; });
    const totalInvoices0 = _inv0.length;
    const delivered = _inv0.filter(s => s === "received" || s === "partial_received").length;
    const returned = _inv0.filter(s => s === "returned").length;
    const pending = _inv0.filter(s => s !== "received" && s !== "partial_received" && s !== "returned").length;
    const totalRevenue = orders.filter(o => o.status === "received" || o.status === "partial_received")
      .reduce((s, o) => s + (o.status === "partial_received" && o.partialQuantity ? o.unitPrice * o.partialQuantity : o.totalPrice), 0);
    const totalProfit = orders.reduce((s, o) => s + profitFromOrder(o), 0);

    const deliveryRate = totalInvoices0 > 0 ? Math.round((delivered / totalInvoices0) * 100) : 0;
    const returnRate   = totalInvoices0 > 0 ? Math.round((returned  / totalInvoices0) * 100) : 0;

    // fallback score ظ…ظ† ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ظ…ط؛ظ„ظ‚ط© ظپظ‚ط·
    let noProfileScore: number | null = null;
    if (orders.length > 0) {
      const closedCount0 = delivered + returned;
      if (closedCount0 > 0) {
        const closedDR = Math.round((delivered / closedCount0) * 100);
        const closedRR = Math.round((returned  / closedCount0) * 100);
        const returnPenalty = Math.max(0, 100 - closedRR * 2);
        noProfileScore = Math.round(closedDR * 0.6 + returnPenalty * 0.4);
      }
    }
    const noProfileRating =
      noProfileScore === null ? "ظ„ط§ طھظˆط¬ط¯ ط¨ظٹط§ظ†ط§طھ"
      : noProfileScore >= 90 ? "ظ…ظ…طھط§ط²"
      : noProfileScore >= 75 ? "ط¬ظٹط¯ ط¬ط¯ط§ظ‹"
      : noProfileScore >= 60 ? "ط¬ظٹط¯"
      : noProfileScore >= 40 ? "ظ…ظ‚ط¨ظˆظ„"
      : "ط¶ط¹ظٹظپ";

    res.json({
      profileId: null,
      userId,
      displayName: userRow?.displayName ?? "â€”",
      noProfile: true,
      period: { month: monthParam || `${dateFrom.getFullYear()}-${String(dateFrom.getMonth() + 1).padStart(2, "0")}`, from: dateFrom.toISOString(), to: dateTo.toISOString() },
      orderStats: { total: totalInvoices0, delivered, returned, pending, deliveryRate, returnRate, totalRevenue, totalProfit },
      kpis: [],
      kpiFinancials: { totalSalaryWeight: 0, totalDeduction: 0, totalBonus: 0, achievedCount: 0, failedCount: 0, overTargetCount: 0, salaryAtRiskPercent: 0 },
      overallScore: noProfileScore,
      rating: noProfileRating,
      salary: 0,
    });
  }

  // Has profile â€” run full report logic directly (no redirect)
  const profileId = row.profile.id;
  const profile = row.profile;
  const userRow = row.user;

  const modeParam  = (req.query.mode  as string) || "monthly";
  const dateParam  = (req.query.date  as string) || "";
  const monthParam = (req.query.month as string) || "";

  // في الـ daily mode: نحسب من بداية اليوم لنهايته
  let dateFrom: Date;
  let dateTo: Date;
  if (modeParam === "daily" && dateParam) {
    dateFrom = new Date(`${dateParam}T00:00:00.000Z`);
    dateTo   = new Date(`${dateParam}T23:59:59.999Z`);
  } else {
    ({ dateFrom, dateTo } = getPayPeriod(monthParam));
  }

  const kpis = await db
    .select()
    .from(employeeKpisTable)
    .where(and(eq(employeeKpisTable.profileId, profileId), eq(employeeKpisTable.isActive, true)));

  // daily mode: use dateParam directly to avoid UTC timezone shift
  // monthly mode: use monthParam to build correct date range
  const _now = new Date();
  const effectiveMonth = monthParam || `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`;

  // في daily mode للـ manual KPIs: نجيب cumulative من بداية الـ pay period لليوم المختار
  // عشان نقدر نحسب المتوقع التراكمي بنفس منطق daily-logs
  let manualStartMR: string;
  let manualEndMR: string;
  let dailyPeriodDays = 30;
  let dailyDayNumberInPeriod = 1;

  if (modeParam === "daily" && dateParam) {
    const { dateFrom: dpFrom, dateTo: dpTo } = getPayPeriod(dateParam.slice(0, 7));
    manualStartMR = dpFrom.toISOString().slice(0, 10);
    manualEndMR   = dateParam;
    dailyPeriodDays = Math.round((dpTo.getTime() - dpFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const selectedDay = new Date(dateParam + "T00:00:00.000");
    dailyDayNumberInPeriod = Math.max(1, Math.round((selectedDay.getTime() - dpFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  } else {
    manualStartMR = `${effectiveMonth}-01`;
    manualEndMR   = `${effectiveMonth}-31`;
  }

  const monthStartMR = manualStartMR;
  const monthEndMR   = manualEndMR;
  const manualLogsMR = await db
    .select({ kpiId: employeeDailyLogsTable.kpiId, total: sum(employeeDailyLogsTable.value) })
    .from(employeeDailyLogsTable)
    .where(and(
      eq(employeeDailyLogsTable.profileId, profileId),
      gte(employeeDailyLogsTable.date, monthStartMR),
      lte(employeeDailyLogsTable.date, monthEndMR)
    ))
    .groupBy(employeeDailyLogsTable.kpiId);
  const manualCumulativeMapMR = new Map(
    manualLogsMR.map(r => [r.kpiId, parseFloat(String(r.total ?? "0"))])
  );

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(
      or(
        eq(ordersTable.assignedUserId, userId),
        eq(ordersTable.createdByUserId, userId)
      ),
      gte(ordersTable.createdAt, dateFrom),
      lte(ordersTable.createdAt, dateTo),
      isNull(ordersTable.deletedAt),
      (profile as any).tenantId != null ? eq(ordersTable.tenantId, (profile as any).tenantId) : undefined
    ));

  const totalRevenue = orders.filter(o => o.status === "received" || o.status === "partial_received")
    .reduce((s, o) => s + (o.status === "partial_received" && o.partialQuantity ? o.unitPrice * o.partialQuantity : o.totalPrice), 0);
  const totalProfit = orders.reduce((s, o) => s + profitFromOrder(o), 0);

  // â”€â”€ ط¹ط¯ ط§ظ„ظ€ invoices ط§ظ„ظپط±ظٹط¯ط© â”€â”€
  const _sp2: Record<string, number> = { pending:1,in_shipping:2,warehouse_ready:3,delayed:4,partial_received:5,received:6,returned:7 };
  const _imap2 = new Map<string, (typeof ordersTable.$inferSelect)[]>();
  for (const o of orders) { const k = o.invoiceNumber ?? `solo-${o.id}`; if (!_imap2.has(k)) _imap2.set(k,[]); _imap2.get(k)!.push(o); }
  const _inv2 = Array.from(_imap2.values()).map(rows => { const ss=rows.map(r=>r.status); return [...ss].sort((a,b)=>(_sp2[a]??99)-(_sp2[b]??99))[0]; });
  const totalInvoices2 = _inv2.length;
  const delivered = _inv2.filter(s => s === "received" || s === "partial_received").length;
  const returned  = _inv2.filter(s => s === "returned").length;
  const pending   = _inv2.filter(s => s !== "received" && s !== "partial_received" && s !== "returned").length;

  const orderStats = {
    total: totalInvoices2,
    delivered,
    returned,
    pending,
    deliveryRate: totalInvoices2 > 0 ? Math.round((delivered / totalInvoices2) * 100) : 0,
    returnRate:   totalInvoices2 > 0 ? Math.round((returned  / totalInvoices2) * 100) : 0,
    totalRevenue,
    totalProfit,
  };

  // Progressive target for manual KPIs (same logic as employee-report)
  const nowMR = new Date();
  const isCurrentMonthMR =
    dateFrom.getFullYear() === nowMR.getFullYear() &&
    dateFrom.getMonth() === nowMR.getMonth();
  const reportDayNumberMR   = isCurrentMonthMR ? nowMR.getDate() : dateTo.getDate();
  const reportDaysInMonthMR = new Date(dateFrom.getFullYear(), dateFrom.getMonth() + 1, 0).getDate();

  const evaluatedKpis = await Promise.all(
    kpis.map(async (kpi) => {
      let actualValue: number | null;
      if (kpi.metric === "manual") {
        actualValue = manualCumulativeMapMR.get(kpi.id) ?? 0;
      } else {
        actualValue = await computeActualValue(kpi.metric, userId, dateFrom, dateTo, (profile as any).tenantId);
      }
      const effectiveTarget = modeParam === "daily"
        ? kpi.metric === "manual"
          // manual في daily: تراكمي حتى اليوم (نفس منطق daily-logs)
          ? Math.max(1, Math.round((kpi.targetValue / dailyPeriodDays) * dailyDayNumberInPeriod))
          // auto في daily: هدف يوم واحد
          : Math.max(1, Math.round(kpi.targetValue / dailyPeriodDays))
        : isCurrentMonthMR
          ? Math.max(1, Math.round((kpi.targetValue / reportDaysInMonthMR) * reportDayNumberMR))
          : kpi.targetValue;
      const score = actualValue !== null ? computeKpiScore(actualValue, effectiveTarget, kpi.direction) : null;
      const achieved = score !== null ? (kpi.direction === "lower_is_better" ? score >= 70 : score >= 80) : null;
      return { ...kpi, actualValue, score, achieved, effectiveTarget };
    })
  );

  const scoredKpis = evaluatedKpis.filter(k => k.score !== null);
  const baseSalary = profile.monthlySalary ?? 0;
  const kpiFinancials = evaluatedKpis.reduce((acc, kpi) => {
    const salaryWeight    = (kpi as any).salaryWeight ?? 0;
    const overtargetBonus = (kpi as any).overtargetBonus ?? 0;
    const salaryImpact    = baseSalary > 0 ? Math.round((salaryWeight / 100) * baseSalary) : 0;
    const bonusImpact     = baseSalary > 0 ? Math.round((overtargetBonus / 100) * baseSalary) : 0;
    acc.totalSalaryWeight += salaryWeight;
    acc.achievedCount     += kpi.achieved === true  ? 1 : 0;
    acc.failedCount       += kpi.achieved === false ? 1 : 0;
    acc.overTargetCount   += kpi.score !== null && kpi.score > 100 ? 1 : 0;
    acc.totalDeduction    += kpi.achieved === false && salaryWeight > 0 ? salaryImpact : 0;
    acc.totalBonus        += kpi.score !== null && kpi.score > 100 && overtargetBonus > 0 ? bonusImpact : 0;
    return acc;
  }, { totalSalaryWeight: 0, totalDeduction: 0, totalBonus: 0, achievedCount: 0, failedCount: 0, overTargetCount: 0 });

  let overallScore: number | null = null;
  if (scoredKpis.length > 0) {
    const totalWeight = scoredKpis.reduce((s, k) => s + k.weight, 0);
    overallScore = totalWeight > 0
      ? Math.round(scoredKpis.reduce((s, k) => s + k.score! * k.weight, 0) / totalWeight)
      : Math.round(scoredKpis.reduce((s, k) => s + k.score!, 0) / scoredKpis.length);
  }

  // fallback: ظ„ظˆ ظ…ظپظٹط´ KPIs â€” ظ†ط­ط³ط¨ ظ…ظ† ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ظ…ط؛ظ„ظ‚ط© ظپظ‚ط· (delivered + returned)
  if (overallScore === null && orderStats.total > 0) {
    const closedCount = orderStats.delivered + orderStats.returned;
    if (closedCount > 0) {
      const closedDeliveryRate = Math.round((orderStats.delivered / closedCount) * 100);
      const closedReturnRate   = Math.round((orderStats.returned  / closedCount) * 100);
      const returnPenalty      = Math.max(0, 100 - closedReturnRate * 2);
      overallScore = Math.round(closedDeliveryRate * 0.6 + returnPenalty * 0.4);
    }
    // ظ„ظˆ ظƒظ„ ط§ظ„ط·ظ„ط¨ط§طھ ظ„ط³ظ‡ pending â†’ ظ…ظپظٹط´ score
  }

  const rating =
    overallScore === null ? "ظ„ط§ طھظˆط¬ط¯ ط¨ظٹط§ظ†ط§طھ"
    : overallScore >= 90 ? "ظ…ظ…طھط§ط²"
    : overallScore >= 75 ? "ط¬ظٹط¯ ط¬ط¯ط§ظ‹"
    : overallScore >= 60 ? "ط¬ظٹط¯"
    : overallScore >= 40 ? "ظ…ظ‚ط¨ظˆظ„"
    : "ط¶ط¹ظٹظپ";

  res.json({
    profileId,
    userId,
    displayName: profile.displayName ?? userRow?.displayName ?? "â€”",
    period: {
      month: monthParam || `${dateFrom.getFullYear()}-${String(dateFrom.getMonth() + 1).padStart(2, "0")}`,
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    },
    orderStats,
    kpis: evaluatedKpis,
    kpiFinancials: {
      ...kpiFinancials,
      totalSalaryWeight: Math.round(kpiFinancials.totalSalaryWeight),
      totalDeduction: Math.round(kpiFinancials.totalDeduction),
      totalBonus: Math.round(kpiFinancials.totalBonus),
      salaryAtRiskPercent: Math.round(kpiFinancials.totalSalaryWeight),
    },
    overallScore,
    rating,
    salary: baseSalary,
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /employee-orders/:profileId?month=YYYY-MM
// ط·ظ„ط¨ط§طھ ط§ظ„ظ…ظˆط¸ظپ (createdBy ط£ظˆ assigned) ظ…ط¹ ط¥ط­طµط§ط¦ظٹط§طھظ‡ط§ ط§ظ„ظƒط§ظ…ظ„ط©
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/employee-orders/:profileId", async (req, res): Promise<void> => {
  const profileId = parseInt(String(req.params.profileId));
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }

  const monthParam = (req.query.month as string | undefined) || "";
  const { dateFrom, dateTo } = getPayPeriod(monthParam);

  // ط¬ظ„ط¨ ط§ظ„ظ€ profile ظˆط§ظ„ظ€ userId
  const [row] = await db
    .select({ profile: employeeProfilesTable, user: usersTable })
    .from(employeeProfilesTable)
    .leftJoin(usersTable, eq(employeeProfilesTable.userId, usersTable.id))
    .where(eq(employeeProfilesTable.id, profileId));

  if (!row) { res.status(404).json({ error: "ط§ظ„ظ…ظˆط¸ظپ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }); return; }

  const reqUser = (req as any).user;
  const isSuperOrAdmin = reqUser?.role === "super_admin" || reqUser?.role === "admin";
  const tenantId = getTenantId(req);

  // ط¬ظ„ط¨ ط·ظ„ط¨ط§طھ ط§ظ„ظ…ظˆط¸ظپ â€” ط¯ط§ظٹظ…ط§ظ‹ ظپظ„طھط± ط¹ظ„ظ‰ userId ط¨طھط§ط¹ ط§ظ„ظ…ظˆط¸ظپ (ظ…ط´ ط§ظ„ظ€ requester)
  const targetUserId = row.profile.userId;
  if (!targetUserId) {
    res.json({
      orders: [], stats: { total: 0, delivered: 0, returned: 0, pending: 0, inShipping: 0,
        deliveryRate: 0, returnRate: 0, totalRevenue: 0, totalProfit: 0 },
      kpiImpact: { deliveryRate: 0, returnRate: 0, totalOrders: 0, revenue: 0, profit: 0 },
    });
    return;
  }

  const orderConditions: any[] = [
    isNull(ordersTable.deletedAt),                        // ط§ط³طھط¨ط¹ط§ط¯ ط§ظ„ظ…ط­ط°ظˆظپط© ط¯ط§ظٹظ…ط§ظ‹
    eq(ordersTable.createdByUserId, targetUserId),        // ط·ظ„ط¨ط§طھ ط§ظ„ظ…ظˆط¸ظپ ط¯ظ‡ ط¨ط§ظ„طھط­ط¯ظٹط¯
    gte(ordersTable.createdAt, dateFrom),
    lte(ordersTable.createdAt, dateTo),
  ];
  if (tenantId !== null) orderConditions.push(eq(ordersTable.tenantId, tenantId));

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...orderConditions))
    .orderBy(desc(ordersTable.createdAt));

  // â”€â”€ Group rows â†’ invoices (ظ†ظپط³ ظ…ظ†ط·ظ‚ buildPerUserInvoices) â”€â”€
  const _SP: Record<string, number> = { pending:1, in_shipping:2, warehouse_ready:3, delayed:4, partial_received:5, received:6, returned:7 };
  const invRowsMap = new Map<string, (typeof ordersTable.$inferSelect)[]>();
  for (const o of orders) {
    const k = o.invoiceNumber ?? `solo-${o.id}`;
    if (!invRowsMap.has(k)) invRowsMap.set(k, []);
    invRowsMap.get(k)!.push(o);
  }

  // resolve ظƒظ„ invoice: status ط£ظˆظ„ظˆظٹط© + ط¨ظٹط§ظ†ط§طھ ظ…ظ† ط£ظˆظ„ row
  type ResolvedInvoice = {
    id: number; invoiceNumber: string | null; customerName: string;
    product: string; quantity: number; unitPrice: number; totalPrice: number;
    status: string; city: string | null; adSource: string | null;
    shippingCost: number | null; createdAt: string; color: string | null; size: string | null;
    productCount: number; // ط¹ط¯ط¯ ط§ظ„ظ…ظ†طھط¬ط§طھ ط¯ط§ط®ظ„ ط§ظ„ظپط§طھظˆط±ط©
  };

  const resolvedInvoices: ResolvedInvoice[] = Array.from(invRowsMap.values()).map(rows => {
    const statuses = rows.map(r => r.status);
    const resolvedStatus = [...statuses].sort((a, b) => (_SP[a] ?? 99) - (_SP[b] ?? 99))[0];
    const first = rows[0];
    const totalQty   = rows.reduce((s, r) => s + r.quantity, 0);
    const totalPrice = rows.reduce((s, r) => s + r.totalPrice, 0);
    // ط§ط³ظ… ط§ظ„ظ…ظ†طھط¬ط§طھ ظ…ط¬ظ…ط¹ظٹظ†
    const productNames = [...new Set(rows.map(r => r.product ?? ""))].join(" + ");
    return {
      id:            first.id,
      invoiceNumber: first.invoiceNumber,
      customerName:  first.customerName,
      product:       productNames,
      quantity:      totalQty,
      unitPrice:     first.unitPrice,
      totalPrice,
      status:        resolvedStatus,
      city:          first.city,
      adSource:      first.adSource,
      shippingCost:  first.shippingCost,
      createdAt:     first.createdAt instanceof Date ? first.createdAt.toISOString() : String(first.createdAt),
      color:         rows.length > 1 ? null : first.color,
      size:          rows.length > 1 ? null : first.size,
      productCount:  rows.length,
    };
  });

  // sort ط¨ط§ظ„ط£ط­ط¯ط«
  resolvedInvoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // ط­ط³ط§ط¨ ط§ظ„ط¥ط­طµط§ط¦ظٹط§طھ ط¹ظ„ظ‰ ظ…ط³طھظˆظ‰ ط§ظ„ظ€ invoice
  const totalInv    = resolvedInvoices.length;
  const deliveredInv  = resolvedInvoices.filter(i => i.status === "received" || i.status === "partial_received");
  const returnedInv   = resolvedInvoices.filter(i => i.status === "returned");
  const inShippingInv = resolvedInvoices.filter(i => i.status === "in_shipping");
  const pendingInv    = resolvedInvoices.filter(i => !["received","partial_received","returned"].includes(i.status));

  const totalRevenue = deliveredInv.reduce((s, i) => s + i.totalPrice, 0);
  const totalProfit  = orders.reduce((s, o) => s + profitFromOrder(o), 0);

  const stats = {
    total:        totalInv,
    delivered:    deliveredInv.length,
    returned:     returnedInv.length,
    inShipping:   inShippingInv.length,
    pending:      pendingInv.length,
    deliveryRate: totalInv > 0 ? Math.round((deliveredInv.length / totalInv) * 100) : 0,
    returnRate:   totalInv > 0 ? Math.round((returnedInv.length  / totalInv) * 100) : 0,
    totalRevenue: Math.round(totalRevenue),
    totalProfit:  Math.round(totalProfit),
  };

  const kpiImpact = {
    deliveryRate: stats.deliveryRate,
    returnRate:   stats.returnRate,
    totalOrders:  stats.total,
    revenue:      stats.totalRevenue,
    profit:       stats.totalProfit,
  };

  const simplifiedOrders = resolvedInvoices.map(i => ({
    id:            i.id,
    invoiceNumber: i.invoiceNumber,
    customerName:  i.customerName,
    product:       i.product,
    quantity:      i.quantity,
    unitPrice:     i.unitPrice,
    totalPrice:    i.totalPrice,
    status:        i.status,
    city:          i.city,
    adSource:      i.adSource,
    shippingCost:  i.shippingCost,
    createdAt:     i.createdAt,
    color:         i.color,
    size:          i.size,
    productCount:  i.productCount,
  }));

  res.json({ orders: simplifiedOrders, stats, kpiImpact });
});

// All users without profile (for setup)
router.get("/users-without-profile", async (req, res): Promise<void> => {
  const allUsers = await db.select().from(usersTable).where(eq(usersTable.isActive, true));
  const profiles = await db.select().from(employeeProfilesTable);
  const profiledUserIds = new Set(profiles.map((p) => p.userId).filter(Boolean));
  const unprofiledUsers = allUsers.filter((u) => !profiledUserIds.has(u.id));
  res.json(unprofiledUsers);
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Daily Logs  (all keyed by profileId)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get("/employee-daily-logs/:profileId", async (req, res): Promise<void> => {
  const profileId = parseInt(String(req.params.profileId));
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }

  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  // ── استخدام نفس getPayPeriod زي employee-report ──────────────────────────
  // الفترة: من 26 الشهر السابق → 25 الشهر الحالي
  const dateMonthStr = date.slice(0, 7); // YYYY-MM
  const { dateFrom: periodStart, dateTo: periodEnd } = getPayPeriod(dateMonthStr);

  // عدد أيام الفترة الكاملة (دايماً ~30-31 يوم)
  const periodDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // اليوم رقم كام في الفترة (من 1)
  const selectedDay = new Date(date + "T00:00:00.000");
  const dayNumberInPeriod = Math.max(1, Math.round((selectedDay.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  // month range for cumulative sum — من بداية الفترة لليوم المختار
  const monthStart = periodStart.toISOString().slice(0, 10);
  const monthEnd   = date;

  // Get userId from profile for auto-computed metrics
  const [profile] = await db
    .select()
    .from(employeeProfilesTable)
    .where(eq(employeeProfilesTable.id, profileId));
  const userId = profile?.userId ?? null;

  const [kpis, logs, monthlyLogs] = await Promise.all([
    db.select().from(employeeKpisTable).where(
      and(eq(employeeKpisTable.profileId, profileId), eq(employeeKpisTable.isActive, true))
    ),
    // today's logs only (for the input field current value)
    db.select().from(employeeDailyLogsTable).where(
      and(eq(employeeDailyLogsTable.profileId, profileId), eq(employeeDailyLogsTable.date, date))
    ),
    // all logs this month (for cumulative sum)
    db.select().from(employeeDailyLogsTable).where(
      and(
        eq(employeeDailyLogsTable.profileId, profileId),
        gte(employeeDailyLogsTable.date, monthStart),
        lte(employeeDailyLogsTable.date, monthEnd)
      )
    ),
  ]);

  const logsMap = new Map(logs.map(l => [l.kpiId, l]));

  // build cumulative map per kpiId
  const cumulativeMap = new Map<number, number>();
  for (const log of monthlyLogs) {
    cumulativeMap.set(log.kpiId, (cumulativeMap.get(log.kpiId) ?? 0) + (log.value ?? 0));
  }

  const result = await Promise.all(
    kpis.map(async (kpi) => {
      const log = logsMap.get(kpi.id);
      let autoValue: number | null = null;
      if (kpi.metric !== "manual" && userId) {
        autoValue = await computeActualValue(kpi.metric, userId, dayStart, dayEnd);
      }

      // manual KPIs: use cumulative monthly sum for progress/achieved
      // todayValue: what was entered today (shown in input field)
      const todayValue      = kpi.metric === "manual" ? (log?.value ?? null) : null;
      const cumulativeValue = kpi.metric === "manual" ? (cumulativeMap.get(kpi.id) ?? null) : null;
      const actualValue     = kpi.metric === "manual" ? cumulativeValue : autoValue;

      // الهدف اليومي = الهدف الشهري / 30 يوم ثابت دايما
      const dayOfMonth = new Date(date + "T00:00:00.000").getDate();
      let dailyTarget: number;
      if (kpi.metric === "manual") {
        dailyTarget = Math.round((kpi.targetValue / 30) * dayOfMonth);
      } else {
        dailyTarget = Math.max(1, Math.round(kpi.targetValue / 30));
      }

      const score = actualValue !== null
        ? computeKpiScore(actualValue, dailyTarget, kpi.direction)
        : null;
      const achieved = actualValue !== null
        ? (kpi.direction === "lower_is_better" ? actualValue <= dailyTarget : actualValue >= dailyTarget)
        : null;
      return {
        ...kpi,
        date,
        actualValue,
        cumulativeValue,
        todayValue,
        dailyTarget,
        logId: log?.id ?? null,
        logNotes: log?.notes ?? null,
        score,
        achieved,
      };
    })
  );

  res.json({ date, kpis: result });
});

router.get("/employee-daily-logs/:profileId/week", async (req, res): Promise<void> => {
  const profileId = parseInt(String(req.params.profileId));
  if (isNaN(profileId)) { res.status(400).json({ error: "Invalid profileId" }); return; }

  const endDate = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const end = new Date(endDate);

  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const [profile] = await db
    .select()
    .from(employeeProfilesTable)
    .where(eq(employeeProfilesTable.id, profileId));
  const userId = profile?.userId ?? null;

  const kpis = await db.select().from(employeeKpisTable).where(
    and(eq(employeeKpisTable.profileId, profileId), eq(employeeKpisTable.isActive, true))
  );

  const logs = await db.select().from(employeeDailyLogsTable).where(
    and(
      eq(employeeDailyLogsTable.profileId, profileId),
      gte(employeeDailyLogsTable.date, dates[0]),
      lte(employeeDailyLogsTable.date, endDate)
    )
  );

  const kpiWeeks = await Promise.all(
    kpis.map(async (kpi) => {
      const weekDays = await Promise.all(
        dates.map(async (date) => {
          const log = logs.find(l => l.kpiId === kpi.id && l.date === date);
          let actualValue: number | null = null;
          if (kpi.metric !== "manual" && userId) {
            const dayStart = new Date(`${date}T00:00:00.000Z`);
            const dayEnd = new Date(`${date}T23:59:59.999Z`);
            actualValue = await computeActualValue(kpi.metric, userId, dayStart, dayEnd);
          } else {
            actualValue = log?.value ?? null;
          }
          const { dateFrom: wPeriodStart, dateTo: wPeriodEnd } = getPayPeriod(date.slice(0, 7));
          const wPeriodDays = Math.round((wPeriodEnd.getTime() - wPeriodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const dailyTarget = Math.round(kpi.targetValue / wPeriodDays);
          const achieved = actualValue !== null
            ? (kpi.direction === "lower_is_better" ? actualValue <= dailyTarget : actualValue >= dailyTarget)
            : null;
          return { date, actualValue, dailyTarget, achieved };
        })
      );
      return { kpiId: kpi.id, kpiName: kpi.name, days: weekDays };
    })
  );

  res.json({ dates, kpiWeeks });
});

const DailyLogSchema = z.object({
  profileId: z.number().int().positive(),
  kpiId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number(),
  notes: z.string().nullish(),
});

router.post("/employee-daily-logs", async (req, res): Promise<void> => {
  const parsed = DailyLogSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { profileId, kpiId, date, value, notes } = parsed.data;

  // Resolve userId from profile
  const [profile] = await db
    .select()
    .from(employeeProfilesTable)
    .where(eq(employeeProfilesTable.id, profileId));
  const userId = profile?.userId ?? null;

  const [existing] = await db
    .select()
    .from(employeeDailyLogsTable)
    .where(
      and(
        eq(employeeDailyLogsTable.profileId, profileId),
        eq(employeeDailyLogsTable.kpiId, kpiId),
        eq(employeeDailyLogsTable.date, date)
      )
    );

  if (existing) {
    await db
      .update(employeeDailyLogsTable)
      .set({ value, notes: notes ?? null, updatedAt: new Date() })
      .where(eq(employeeDailyLogsTable.id, existing.id));
    const [updated] = await db.select().from(employeeDailyLogsTable).where(eq(employeeDailyLogsTable.id, existing.id));
    res.json(updated);
  } else {
    const logInsertResult = await db
      .insert(employeeDailyLogsTable)
      .values({ profileId, userId, kpiId, date, value, notes: notes ?? null });
    const logInsertId = (logInsertResult as any)[0]?.insertId ?? (logInsertResult as any).insertId;
    const [created] = await db.select().from(employeeDailyLogsTable).where(eq(employeeDailyLogsTable.id, logInsertId));
    res.status(201).json(created);
  }
});

// â”€â”€ GET /employee/team-ranking?month=YYYY-MM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ظٹط±ط¬ط¹ ظƒظ„ ط§ظ„ظ…ظˆط¸ظپظٹظ† ظ…ط±طھط¨ظٹظ† ط­ط³ط¨ overallScore ظ…ظ† ط§ظ„ط£ط¹ظ„ظ‰ ظ„ظ„ط£ظ‚ظ„
router.get("/team-ranking", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);

  // ط¬ظٹط¨ ظƒظ„ ط§ظ„ظ€ profiles ظپظٹ ظ†ظپط³ ط§ظ„ظ€ tenant
  const profilesQuery = db.select({
    id: employeeProfilesTable.id,
    displayName: employeeProfilesTable.displayName,
    jobTitle: employeeProfilesTable.jobTitle,
    department: employeeProfilesTable.department,
    avatar: employeeProfilesTable.avatar,
    userId: employeeProfilesTable.userId,
  }).from(employeeProfilesTable)
    .leftJoin(usersTable, eq(usersTable.id, employeeProfilesTable.userId));

  const profiles = tenantId !== null
    ? await profilesQuery.where(eq(usersTable.tenantId, tenantId))
    : await profilesQuery;

  // ظ„ظƒظ„ profile ط§ط­ط³ط¨ ط§ظ„ظ€ overallScore
  const ranking = await Promise.all(profiles.map(async (profile) => {
    const kpis = await db.select().from(employeeKpisTable).where(
      and(eq(employeeKpisTable.profileId, profile.id), eq(employeeKpisTable.isActive, true))
    );
    if (kpis.length === 0) return { ...profile, overallScore: null, achievedCount: 0, totalKpis: 0 };

    const { dateFrom: kpiFrom, dateTo: kpiTo } = getPayPeriod(month);
    const startDate = kpiFrom.toISOString().slice(0, 10);
    const endDate   = kpiTo.toISOString().slice(0, 10);

    const evaluated = await Promise.all(kpis.map(async (kpi) => {
      const logs = await db.select({ value: employeeDailyLogsTable.value })
        .from(employeeDailyLogsTable)
        .where(and(
          eq(employeeDailyLogsTable.kpiId, kpi.id),
          eq(employeeDailyLogsTable.profileId, profile.id),
          gte(employeeDailyLogsTable.date, startDate),
          lte(employeeDailyLogsTable.date, endDate)
        ));
      const actualValue = logs.length > 0 ? logs.reduce((s, l) => s + (l.value ?? 0), 0) : null;
      const score = actualValue !== null ? computeKpiScore(actualValue, kpi.targetValue, kpi.direction) : null;
      return { score, weight: kpi.weight ?? 1, achieved: score !== null ? score >= 100 : null };
    }));

    const scored = evaluated.filter(k => k.score !== null);
    const totalWeight = scored.reduce((s, k) => s + k.weight, 0);
    const overallScore = scored.length > 0 && totalWeight > 0
      ? Math.round(scored.reduce((s, k) => s + k.score! * k.weight, 0) / totalWeight)
      : null;
    const achievedCount = evaluated.filter(k => k.achieved === true).length;

    return { ...profile, overallScore, achievedCount, totalKpis: kpis.length };
  }));

  // ط±طھظ‘ط¨ ظ…ظ† ط§ظ„ط£ط¹ظ„ظ‰ ظ„ظ„ط£ظ‚ظ„ (null ظپظٹ ط§ظ„ط¢ط®ط±)
  ranking.sort((a, b) => {
    if (a.overallScore === null && b.overallScore === null) return 0;
    if (a.overallScore === null) return 1;
    if (b.overallScore === null) return -1;
    return b.overallScore - a.overallScore;
  });

  res.json(ranking);
});

// â”€â”€ GET /employee/star-employees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/star-employees", requireAuth, async (req, res): Promise<void> => {
  const [setting] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "star_employees")).limit(1);
  if (!setting?.value) { res.json([]); return; }
  try {
    const ids: number[] = JSON.parse(setting.value);
    if (!ids.length) { res.json([]); return; }
    const profiles = await db.select({
      id: employeeProfilesTable.id,
      displayName: employeeProfilesTable.displayName,
      jobTitle: employeeProfilesTable.jobTitle,
      department: employeeProfilesTable.department,
      avatar: employeeProfilesTable.avatar,
    }).from(employeeProfilesTable).where(
      or(...ids.map(id => eq(employeeProfilesTable.id, id)))
    );
    // ط±طھظ‘ط¨ظ‡ظ… ط¨ظ†ظپط³ طھط±طھظٹط¨ ط§ظ„ط§ط®طھظٹط§ط±
    const ordered = ids.map(id => profiles.find(p => p.id === id)).filter(Boolean);
    res.json(ordered);
  } catch { res.json([]); }
});

// â”€â”€ POST /employee/star-employees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/star-employees", requireSuperAdmin, async (req, res): Promise<void> => {
  const { profileIds } = req.body as { profileIds: number[] };
  if (!Array.isArray(profileIds) || profileIds.length > 3) {
    res.status(400).json({ error: "ط£ظ‚طµظ‰ 3 ظ…ظˆط¸ظپظٹظ† ظ†ط¬ظˆظ…" }); return;
  }
  const value = JSON.stringify(profileIds);
  const existing = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "star_employees")).limit(1);
  if (existing.length) {
    await db.update(appSettingsTable).set({ value, updatedAt: new Date() }).where(eq(appSettingsTable.key, "star_employees"));
  } else {
    await db.insert(appSettingsTable).values({ key: "star_employees", value, updatedAt: new Date() });
  }
  res.json({ success: true, profileIds });
});

export default router;
