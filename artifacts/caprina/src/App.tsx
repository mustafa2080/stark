import { lazy, Suspense, Component, type ReactNode, useRef, useEffect, useLayoutEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BrandProvider } from "@/contexts/BrandContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { BrandLogoMark } from "@/components/brand-logo";
import Layout from "@/components/layout";
import { SubscriptionBlocker } from "@/components/subscription-blocker";

// ─── Splash Screen ────────────────────────────────────────────────────────────
function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // بعد 1.8 ثانية ابدأ الـ fade out
    const fadeTimer = setTimeout(() => setFading(true), 1800);
    // بعد 2.5 ثانية اخفيها خالص
    const doneTimer = setTimeout(() => onDone(), 2500);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 0.7s ease",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "all",
      }}
    >
      {/* Logo */}
      <div
        style={{
          animation: "splashPop 0.6s cubic-bezier(0.34,1.56,0.64,1) both",
          marginBottom: "24px",
        }}
      >
        <img
          src="/logo.jpg"
          alt="STARK"
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            objectFit: "cover",
            boxShadow: "0 0 60px rgba(255,255,255,0.15), 0 0 0 1px rgba(255,255,255,0.1)",
          }}
        />
      </div>

      {/* Brand name */}
      <div
        style={{
          animation: "splashFadeUp 0.6s 0.2s ease both",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            color: "#fff",
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: "0.3em",
            margin: 0,
            textShadow: "0 0 30px rgba(255,255,255,0.3)",
          }}
        >
          STARK
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: 13,
            marginTop: 8,
            letterSpacing: "0.1em",
          }}
        >
          شركة الشحن الموثوقة في مصر
        </p>
      </div>

      {/* Loading bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 3,
          background: "linear-gradient(90deg, transparent, #fff, transparent)",
          animation: "splashBar 2s ease forwards",
          width: "0%",
        }}
      />

      <style>{`
        @keyframes splashPop {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes splashFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashBar {
          from { width: 0%; opacity: 1; }
          90%  { width: 100%; opacity: 1; }
          to   { width: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Global Error Boundary ───────────────────────────────────────────────────
interface EBState { hasError: boolean; errorMsg: string }
interface EBProps { children: ReactNode; onRetry?: () => void }
class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false, errorMsg: "" };
  static getDerivedStateFromError(err: unknown): EBState {
    const msg = err instanceof Error ? err.message : String(err);
    return { hasError: true, errorMsg: msg };
  }
  componentDidCatch(err: unknown) { console.error("[ErrorBoundary]", err); }

  handleRetry = () => {
    // نعمل clear للـ query cache عشان ما يرجعش نفس الخطأ المخزن
    this.props.onRetry?.();
    this.setState({ hasError: false, errorMsg: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6" dir="rtl">
        <div className="text-center max-w-sm space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-2xl">⚠️</div>
          <div>
            <p className="font-black text-foreground text-lg">حدث خطأ غير متوقع</p>
            <p className="text-muted-foreground text-sm mt-1">يرجى إعادة المحاولة.</p>
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.handleRetry}
              className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              حاول مرة أخرى
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-muted text-foreground px-5 py-2 rounded-lg text-sm font-bold hover:bg-muted/80 transition-colors"
            >
              إعادة تحميل
            </button>
          </div>
        </div>
      </div>
    );
  }
}

// ─── Lazy-loaded pages (loaded only when navigated to) ───────────────────────
const Dashboard             = lazy(() => import("@/pages/dashboard"));
const ShipmentsPage         = lazy(() => import("@/pages/shipments-page"));
const NewShipmentPage       = lazy(() => import("@/pages/new-shipment"));
const ShipmentDetailPage    = lazy(() => import("@/pages/shipment-detail"));
const OrderForm             = lazy(() => import("@/pages/order-form"));
const OrderDetail           = lazy(() => import("@/pages/order-detail"));
const Inventory             = lazy(() => import("@/pages/inventory"));
const ShippingCompanies     = lazy(() => import("@/pages/shipping-companies"));
const Invoices              = lazy(() => import("@/pages/invoices"));
const Import                = lazy(() => import("@/pages/import"));
const Movements             = lazy(() => import("@/pages/movements"));
const ProductPerformance    = lazy(() => import("@/pages/product-performance"));
const UsersPage             = lazy(() => import("@/pages/users"));
const AuditLogsPage         = lazy(() => import("@/pages/audit-logs"));
const ShippingManifestPage  = lazy(() => import("@/pages/shipping-manifest"));
const ShipmentManifestDetailPage = lazy(() => import("@/pages/shipping-manifest"));
const ShippingCompanyDetail = lazy(() => import("@/pages/shipping-company-detail"));
const WarehousesPage        = lazy(() => import("@/pages/warehouses"));
const TeamPerformancePage   = lazy(() => import("@/pages/team-performance"));
const AdsAnalyticsPage      = lazy(() => import("@/pages/ads-analytics"));
const TeamPage              = lazy(() => import("@/pages/team"));
const SmartAnalyticsPage    = lazy(() => import("@/pages/smart-analytics"));
const ArchivePage           = lazy(() => import("@/pages/archive"));
const ShippingFollowupPage  = lazy(() => import("@/pages/shipping-followup"));
const WhatsAppSettingsPage  = lazy(() => import("@/pages/whatsapp-settings"));
const SessionsReportPage    = lazy(() => import("@/pages/sessions-report"));
const ExportPage            = lazy(() => import("@/pages/export"));
const InvoiceGroupPage      = lazy(() => import("@/pages/invoice-group"));
const NotFound              = lazy(() => import("@/pages/not-found"));
const Home                  = lazy(() => import("@/pages/home"));
const LoginPage             = lazy(() => import("@/pages/login"));
const RegisterPage          = lazy(() => import("@/pages/register"));
const FinancePurchases      = lazy(() => import("@/pages/finance-purchases"));
const FinanceSales          = lazy(() => import("@/pages/finance-sales"));
const FinanceSaleDetail     = lazy(() => import("@/pages/finance-sale-detail"));
const FinanceSuppliers      = lazy(() => import("@/pages/finance-suppliers"));
const FinanceExpenses       = lazy(() => import("@/pages/finance-expenses"));
const FinanceShippingInvoices = lazy(() => import("@/pages/finance-shipping-invoices"));
const FinanceCash           = lazy(() => import("@/pages/finance-cash"));
const FinanceCashAnalytics  = lazy(() => import("@/pages/finance-cash-analytics"));
const FinanceCashArchive    = lazy(() => import("@/pages/finance-cash-archive"));
const FinanceHub            = lazy(() => import("@/pages/finance-hub"));
const FinanceClients              = lazy(() => import("@/pages/finance-clients"));
const CommercialClientDetail      = lazy(() => import("@/pages/commercial-client-detail"));
const SalesReportPage              = lazy(() => import("@/pages/finance-sales-report"));
const AllClientsPage              = lazy(() => import("@/pages/finance-all-clients"));

const SuperAdminPage        = lazy(() => import("@/pages/super-admin"));
const SubscriptionExpired   = lazy(() => import("@/pages/subscription-expired"));
const ProfilePage           = lazy(() => import("@/pages/profile"));
const ClientProfilePage     = lazy(() => import("@/pages/client-profile"));
const ContractPage          = lazy(() => import("@/pages/contract"));
const ShipmentsSettingsPage = lazy(() => import("@/pages/shipments"));
const ParcelTypesPage       = lazy(() => import("@/pages/parcel-types"));
const TrackResultPage       = lazy(() => import("@/pages/track-result"));
const TrackClientPage       = lazy(() => import("@/pages/track-client"));
const ClientsShowcasePage   = lazy(() => import("@/pages/clients-showcase"));

// ─── Global QueryClient with smart caching defaults ──────────────────────────
// MutationCache: أي mutation تنجح على الطلبات → invalidate الـ analytics فوراً
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const key = mutation.options.mutationKey;
      // كل mutation متعلقة بالطلبات أو الشحن تعمل invalidate للـ analytics
      const orderKeys = ["update-order", "create-order", "delete-order", "bulk-status", "bulk-delete"];
      const isOrderMutation =
        (Array.isArray(key) && key.some(k => orderKeys.some(ok => String(k).includes(ok)))) ||
        (mutation.options as any).__invalidatesCharts;
      if (isOrderMutation) {
        queryClient.invalidateQueries({ queryKey: ["analytics-charts"] });
        queryClient.invalidateQueries({ queryKey: ["orders-summary"] });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      retryDelay: 2000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

// ─── Page-level loading spinner ───────────────────────────────────────────────
function PageLoader() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 9000,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>

        {/* Logo + rotating rings */}
        <div style={{ position: "relative", width: 120, height: 120 }}>
          {/* outer spinning ring */}
          <svg
            width="120" height="120"
            viewBox="0 0 120 120"
            style={{ position: "absolute", top: 0, left: 0, animation: "starkSpin 1.4s linear infinite" }}
          >
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke="url(#starkGrad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray="80 260"
            />
            <defs>
              <linearGradient id="starkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
              </linearGradient>
            </defs>
          </svg>

          {/* inner counter-spin ring */}
          <svg
            width="120" height="120"
            viewBox="0 0 120 120"
            style={{ position: "absolute", top: 0, left: 0, animation: "starkSpinR 2.2s linear infinite" }}
          >
            <circle
              cx="60" cy="60" r="40"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1.5"
              strokeDasharray="14 22"
              strokeLinecap="round"
            />
          </svg>

          {/* Logo center */}
          <img
            src="/logo.jpg"
            alt="STARK"
            style={{
              position: "absolute",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 64, height: 64,
              borderRadius: 16,
              objectFit: "cover",
              boxShadow: "0 0 40px rgba(255,255,255,0.2), 0 0 0 1px rgba(255,255,255,0.1)",
            }}
          />
        </div>

        {/* STARK text + dots */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#fff", fontSize: 22, fontWeight: 900, letterSpacing: "0.3em", textShadow: "0 0 20px rgba(255,255,255,0.3)" }}>
            STARK
          </span>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, letterSpacing: "0.1em" }}>
            جاري التحميل...
          </span>
          <div style={{ display: "flex", gap: 7, marginTop: 4 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: `starkDot 1.2s ${i * 0.2}s ease-in-out infinite` }} />
            ))}
          </div>
        </div>

      </div>

      <style>{`
        @keyframes starkSpin  { to { transform: rotate(360deg);  } }
        @keyframes starkSpinR { to { transform: rotate(-360deg); } }
        @keyframes starkDot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

// ─── Scroll to top on every route change ─────────────────────────────────────
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    const el = document.getElementById("main-scroll-area");
    if (el) el.scrollTop = 0;
  }, [location]);
  return null;
}

// ─── Refresh permissions on every route change ───────────────────────────────
function PermissionRefresher() {
  // الـ polling في AuthContext كل 60 ثانية كافي — لا حاجة لـ refresh عند كل route change
  return null;
}

// ─── Auth guard (shown once, blocks pre-auth rendering) ──────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <BrandLogoMark size="md" className="mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user && location !== "/login" && location !== "/home" && location !== "/" && location !== "/register" && location !== "/contract" && location !== "/track-client" && !location.startsWith("/track/")) return <Redirect to="/" />;

  // ── Subscription expired check ──
  if (user && user.role !== "super_admin" && location !== "/subscription-expired") {
    const subStatus = user.planStatus;
    if (subStatus === "expired" || subStatus === "suspended") {
      return <Redirect to="/subscription-expired" />;
    }
  }
  if (user && user.role !== "super_admin" && location === "/subscription-expired") {
    const subStatus = user.planStatus;
    if (subStatus !== "expired" && subStatus !== "suspended") {
      return <Redirect to="/" />;
    }
  }

  return <>{children}</>;
}

// ─── Permission-protected route ───────────────────────────────────────────────
function ProtectedRoute({ permission, component: Comp }: { permission: string; component: React.ComponentType }) {
  const { can, user, isAdmin } = useAuth();

  // helper — يقبل الـ new keys مباشرة أو legacy keys
  const hasAccess = (() => {
    if (isAdmin) return true;
    // الـ new keys (تحتوي على نقطة)
    if (permission.includes(".")) return can(permission);
    // legacy keys — نفس المنطق القديم
    return can(permission);
  })();

  if (!hasAccess) {
    if (permission === "dashboard.view") {
      if (can("orders.view"))    return <Redirect to="/orders" />;
      if (can("inventory.view")) return <Redirect to="/inventory" />;
      if (can("analytics.view")) return <Redirect to="/product-performance" />;
      if (can("finance.view"))   return <Redirect to="/finance" />;
      return (
        <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
          <div className="text-center space-y-3 p-6">
            <p className="text-lg font-bold text-foreground">مرحباً {user?.displayName} 👋</p>
            <p className="text-sm text-muted-foreground">ليس لديك صلاحية الوصول لأي صفحة حتى الآن.</p>
            <p className="text-xs text-muted-foreground">تواصل مع المدير لإضافة الصلاحيات المناسبة.</p>
          </div>
        </div>
      );
    }
    return <Redirect to="/" />;
  }
  return <Comp />;
}

// ─── Video background sync with React router ─────────────────────────────────
function VideoBackgroundSync() {
  const [location] = useLocation();
  useEffect(() => {
    const isLogin = location === "/login" || location === "/home" || location === "/";
    const video = document.getElementById("login-bg-video") as HTMLVideoElement | null;
    const html = document.documentElement;
    if (!video) return;
    if (isLogin) {
      video.style.display = "block";
      html.classList.add("login-active");
      if (video.paused) video.play().catch(() => {});
    } else {
      video.style.display = "none";
      html.classList.remove("login-active");
      video.pause();
    }
  }, [location]);
  return null;
}

// ─── Router ───────────────────────────────────────────────────────────────────
function Router() {
  const { user } = useAuth();
  const [location] = useLocation();

  if (location === "/" || location === "/home" || location === "/login" || location === "/register" || location === "/contract" || location === "/track-client" || location.startsWith("/track/")) {
    if (location === "/home") return <Redirect to="/" />;
    // لو logged in → روح للداشبورد (بس مش من /contract)
    if (user && (location === "/" || location === "/login" || location === "/register")) {
      if (user.role === "admin" || user.role === "super_admin" || user.role === "super-admin") return <Redirect to="/dashboard" />;
      if (user.role === "client") return <Redirect to="/client-profile" />;
      return <Redirect to="/my-dashboard" />;
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/track/:number" component={TrackResultPage} />
          <Route path="/track-client" component={TrackClientPage} />
          <Route path="/contract" component={ContractPage} />
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />
        </Switch>
      </Suspense>
    );
  }

  if (!user) return <Redirect to="/" />;

  return (
    <>
      <VideoBackgroundSync />
      <Layout>
      <Suspense fallback={null}>
        <Switch>
          <Route path="/my-dashboard"             component={ProfilePage} />
          <Route path="/client-profile"           component={ClientProfilePage} />
          <Route path="/dashboard"                component={() => <ProtectedRoute permission="dashboard.view" component={Dashboard} />} />
          <Route path="/"                         component={() => <ProtectedRoute permission="dashboard.view" component={Dashboard} />} />
          <Route path="/orders"                   component={() => <ProtectedRoute permission="orders.view" component={ShipmentsPage} />} />
          <Route path="/shipments/new"            component={() => <ProtectedRoute permission="orders.create" component={NewShipmentPage} />} />
          <Route path="/shipments/:id"            component={() => <ProtectedRoute permission="orders.view" component={ShipmentDetailPage} />} />
          <Route path="/orders/new"               component={() => <ProtectedRoute permission="orders.create" component={OrderForm} />} />
          <Route path="/invoices/:invoiceNumber"  component={() => <ProtectedRoute permission="invoices.view" component={InvoiceGroupPage} />} />
          <Route path="/orders/:id"               component={() => <ProtectedRoute permission="orders.view" component={OrderDetail} />} />
          <Route path="/inventory"                component={() => <ProtectedRoute permission="inventory.view" component={Inventory} />} />
          <Route path="/shipping"                 component={() => <ProtectedRoute permission="shipping.view" component={ShippingCompanies} />} />
          <Route path="/shipping/manifests/:id"          component={() => <ProtectedRoute permission="shipping.view" component={ShippingManifestPage} />} />
          <Route path="/shipping/shipment-manifests/:id" component={() => <ProtectedRoute permission="shipping.view" component={ShipmentManifestDetailPage} />} />
          <Route path="/shipping/company/:id"     component={() => <ProtectedRoute permission="shipping.view" component={ShippingCompanyDetail} />} />
          <Route path="/invoices"                 component={() => <ProtectedRoute permission="invoices.view" component={Invoices} />} />
          <Route path="/import"                   component={() => <ProtectedRoute permission="import.view" component={Import} />} />
          <Route path="/movements"                component={() => <ProtectedRoute permission="inventory.movements" component={Movements} />} />
          <Route path="/product-performance"      component={() => <ProtectedRoute permission="analytics.products" component={ProductPerformance} />} />
          <Route path="/users"                    component={() => <ProtectedRoute permission="settings.users" component={UsersPage} />} />
          <Route path="/users/manage"             component={() => <ProtectedRoute permission="settings.users" component={UsersPage} />} />
          <Route path="/audit-logs"               component={() => <ProtectedRoute permission="settings.audit" component={AuditLogsPage} />} />
          <Route path="/warehouses"               component={() => <ProtectedRoute permission="inventory.view" component={WarehousesPage} />} />
          <Route path="/team-performance"         component={() => <ProtectedRoute permission="analytics.team" component={TeamPerformancePage} />} />
          <Route path="/ads-analytics"            component={() => <ProtectedRoute permission="analytics.ads" component={AdsAnalyticsPage} />} />
          <Route path="/team"                     component={() => <ProtectedRoute permission="team.manage" component={TeamPage} />} />
          <Route path="/smart"                    component={() => <ProtectedRoute permission="analytics.smart" component={SmartAnalyticsPage} />} />
          <Route path="/archive"                  component={() => <ProtectedRoute permission="orders.view" component={ArchivePage} />} />
          <Route path="/shipping-followup"        component={() => <ProtectedRoute permission="orders.view" component={ShippingFollowupPage} />} />
          <Route path="/whatsapp"                 component={() => <ProtectedRoute permission="settings.whatsapp" component={WhatsAppSettingsPage} />} />
          <Route path="/sessions-report"          component={() => <ProtectedRoute permission="settings.users" component={SessionsReportPage} />} />
          <Route path="/export"                   component={() => <ProtectedRoute permission="import.view" component={ExportPage} />} />
          {/* Finance */}
          <Route path="/finance"                  component={() => <ProtectedRoute permission="finance.view" component={FinanceHub} />} />
          <Route path="/finance/dashboard"        component={() => <Redirect to="/finance" />} />
          <Route path="/finance/purchases"        component={() => <ProtectedRoute permission="finance.view" component={FinancePurchases} />} />
          <Route path="/finance/sales"            component={() => <ProtectedRoute permission="finance.view" component={FinanceSales} />} />
          <Route path="/finance/sales/new"        component={() => <ProtectedRoute permission="finance.view" component={FinanceSales} />} />
          <Route path="/finance/sales/:id"        component={() => <ProtectedRoute permission="finance.view" component={FinanceSaleDetail} />} />
          <Route path="/finance/clients"          component={() => <ProtectedRoute permission="finance.view" component={FinanceClients} />} />
          <Route path="/finance/all-clients"      component={() => <ProtectedRoute permission="finance.view" component={AllClientsPage} />} />

          <Route path="/finance/clients/:id"      component={() => <ProtectedRoute permission="finance.view" component={CommercialClientDetail} />} />
          <Route path="/finance/sales-report"     component={() => <ProtectedRoute permission="finance.view" component={SalesReportPage} />} />
          <Route path="/finance/suppliers"        component={() => <ProtectedRoute permission="finance.view" component={FinanceSuppliers} />} />
          <Route path="/finance/expenses"         component={() => <ProtectedRoute permission="finance.view" component={FinanceExpenses} />} />
          <Route path="/finance/shipping-invoices" component={() => <ProtectedRoute permission="finance.view" component={FinanceShippingInvoices} />} />
          <Route path="/finance/cash"              component={() => <ProtectedRoute permission="finance.view" component={FinanceCash} />} />
          <Route path="/finance/cash/analytics"  component={() => <ProtectedRoute permission="finance.view" component={FinanceCashAnalytics} />} />
          <Route path="/finance/cash/archive"    component={() => <ProtectedRoute permission="finance.view" component={FinanceCashArchive} />} />
          {/* Super Admin */}
          <Route path="/super-admin" component={() => user?.role === "super_admin" ? <SuperAdminPage /> : <Redirect to="/" />} />
          {/* Profile */}
          <Route path="/profile" component={ProfilePage} />
          {/* Shipments */}
          <Route path="/shipments" component={() => <ProtectedRoute permission="dashboard.view" component={ShipmentsSettingsPage} />} />
          <Route path="/parcel-types" component={() => <ProtectedRoute permission="inventory.view" component={ParcelTypesPage} />} />
          <Route path="/clients-showcase" component={() => <ProtectedRoute permission="dashboard.view" component={ClientsShowcasePage} />} />
          {/* Subscription Expired */}
          <Route path="/subscription-expired" component={SubscriptionExpired} />
          <Route                                  component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
    </>
  );
}

// ─── App root ────────────────────────────────────────────────────────────────
function App() {
  const [showSplash, setShowSplash] = useState(() => {
    // بتظهر مرة واحدة بس في الـ session
    return !sessionStorage.getItem("splash_shown");
  });

  const handleSplashDone = () => {
    sessionStorage.setItem("splash_shown", "1");
    setShowSplash(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {showSplash && <SplashScreen onDone={handleSplashDone} />}
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ThemeProvider>
            <BrandProvider>
              <AuthProvider>
                <AuthGuard>
                  <ErrorBoundary onRetry={() => queryClient.clear()}>
                    <ScrollToTop />
                    <PermissionRefresher />
                    <Router />
                    <SubscriptionBlocker />
                  </ErrorBoundary>
                </AuthGuard>
              </AuthProvider>
            </BrandProvider>
          </ThemeProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
