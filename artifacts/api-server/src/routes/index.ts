import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import productsRouter from "./products";
import variantsRouter from "./variants";
import shippingRouter from "./shipping";
import importRouter from "./import";
import movementsRouter from "./movements";
import analyticsRouter from "./analytics";
import authRouter from "./auth";
import usersRouter from "./users";
import auditRouter from "./audit";
import manifestsRouter from "./manifests";
import warehousesRouter from "./warehouses";
import teamAnalyticsRouter from "./team-analytics";
import employeeRouter from "./employee";
import brandRouter from "./brand";
import settingsRouter from "./settings";
import exportRouter from "./export";
import whatsappRouter from "./whatsapp";
import sessionsRouter from "./sessions";
import financeSuppliersRouter from "./finance-suppliers";
import financeOperationsRouter from "./finance-operations";
import financeHubRouter from "./finance-hub";
import { cashRegistersRouter } from "./cash-registers";
import attendanceRouter from "./attendance";
import adminTenantsRouter, { publicAdminRouter } from "./admin-tenants";
import financeSalesRouter from "./finance-sales";
import financeClientsRouter from "./finance-clients";
import shipmentsRouter, { publicShipmentsRouter } from "./shipments";
import clientsShowcaseRouter from "./clients-showcase";
import shipmentManifestsRouter from "./shipment-manifests";
import notificationsSseRouter, { notificationsProtectedRouter } from "./notifications";
import clientAccountSheetRouter from "./client-account-sheet";
import clientAccountManifestsRouter from "./client-account-manifests";
import saleOrderManifestsRouter from "./sale-order-manifests";
import clientAccountProRouter from "./client-account-pro";
import clientPortalRouter from "./client-portal";
import { requireAuth } from "../middlewares/requireAuth.js";
import { checkSubscription } from "../middlewares/checkSubscription.js";

const router: IRouter = Router();

// Public routes (no auth required)
router.use(healthRouter);
router.use("/auth", authRouter);
router.use(brandRouter);
router.use(settingsRouter);
router.use(clientsShowcaseRouter); // GET /clients-showcase — public for landing page
router.use(publicAdminRouter); // GET /public/plan-prices — بدون auth
router.use(publicShipmentsRouter); // GET /shipments/track/:number — public for tracking
router.use(notificationsSseRouter); // GET /notifications/sse — بيعمل auth يدوياً زي مندوب
router.use(clientPortalRouter); // /client/register, /client/login (public) + /client-portal/* (auth داخلي)

// All routes below require authentication
router.use(requireAuth);
router.use(checkSubscription);
router.use("/users", usersRouter);
router.use("/audit-logs", auditRouter);
router.use(importRouter);
router.use(movementsRouter);
router.use(analyticsRouter);
router.use(variantsRouter);
router.use(ordersRouter);
router.use(productsRouter);
router.use(shippingRouter);
router.use(manifestsRouter);
router.use(warehousesRouter);
router.use(teamAnalyticsRouter);
router.use(employeeRouter);
router.use(exportRouter);
router.use(whatsappRouter);
router.use("/sessions", sessionsRouter);
router.use(financeSuppliersRouter);
router.use(financeOperationsRouter);
router.use(financeHubRouter);
router.use("/cash-registers", cashRegistersRouter);
router.use(attendanceRouter);
router.use(financeSalesRouter);
router.use(financeClientsRouter);
router.use(shipmentsRouter);
router.use(shipmentManifestsRouter);
router.use(clientAccountSheetRouter);
router.use(clientAccountManifestsRouter);
router.use(saleOrderManifestsRouter);
router.use(clientAccountProRouter);
router.use(adminTenantsRouter); // /admin/* — بعد requireAuth عشان req.user يكون موجود
router.use(notificationsProtectedRouter);

export default router;
