import { lazy, Suspense, Component, type ReactNode, useRef, useEffect, useLayoutEffect } from "react";
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
const Orders                = lazy(() => import("@/pages/orders"));
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
const Login                 = lazy(() => import("@/pages/login"));
const Home                  = lazy(() => import("@/pages/home"));
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
    <div className="flex items-center justify-center min-h-[40vh]" dir="rtl">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-xs text-muted-foreground">جاري التحميل...</p>
      </div>
    </div>
  );
}

// ─── Scroll to top on every route change ─────────────────────────────────────
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    const scrollAll = () => {
      // اعمل scroll على كل العناصر الممكنة
      const el = document.getElementById("main-scroll-area");
      if (el) el.scrollTop = 0;
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    // مرة فورية
    scrollAll();
    // ومرة بعد ما الـ DOM يتحدث
    const raf = requestAnimationFrame(scrollAll);
    return () => cancelAnimationFrame(raf);
  }, [location]);
  return null;
}

// ─── Refresh permissions on every route change ───────────────────────────────
function PermissionRefresher() {
  const { user, refreshUser } = useAuth();
  const [location] = useLocation();
  const prevLocation = useRef<string | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    // نعمل refresh لما يتغير الـ route فقط — مش لما يتغير الـ user
    if (!user) return;
    if (refreshingRef.current) return;
    // مش محتاج refresh على صفحة البروفايل أو الصفحات اللي مش محتاجة permissions
    const skipRefreshPaths = ["/profile", "/login", "/home", "/subscription-expired"];
    if (prevLocation.current !== null && prevLocation.current !== location) {
      if (!skipRefreshPaths.includes(location)) {
        refreshingRef.current = true;
        refreshUser().finally(() => {
          refreshingRef.current = false;
        });
      }
    }
    prevLocation.current = location;
  }, [location]); // عمداً أزلنا user من الـ dependencies عشان نمنع الـ loop

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

  if (!user && location !== "/login" && location !== "/home") return <Redirect to="/home" />;

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
    const isLogin = location === "/login" || location === "/";
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

  if (location === "/home" || location === "/login") {
    // /login يعمل redirect لـ /home
    if (location === "/login") return <Redirect to="/home" />;
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/home" component={Home} />
        </Switch>
      </Suspense>
    );
  }

  if (!user) return <Redirect to="/home" />;

  // الادمن والسوبر ادمن → الداشبورد، باقي اليوزرات → لوحتي
  // لو المستخدم على / نوجهه للصفحة المناسبة
  if (location === "/") {
    if (user.role === "admin" || user.role === "super_admin") return <Redirect to="/dashboard" />;
    return <Redirect to="/my-dashboard" />;
  }

  return (
    <>
      <VideoBackgroundSync />
      <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/my-dashboard"             component={ProfilePage} />
          <Route path="/dashboard"                component={() => <ProtectedRoute permission="dashboard.view" component={Dashboard} />} />
          <Route path="/"                         component={() => <ProtectedRoute permission="dashboard.view" component={Dashboard} />} />
          <Route path="/orders"                   component={() => <ProtectedRoute permission="orders.view" component={Orders} />} />
          <Route path="/orders/new"               component={() => <ProtectedRoute permission="orders.create" component={OrderForm} />} />
          <Route path="/invoices/:invoiceNumber"  component={() => <ProtectedRoute permission="invoices.view" component={InvoiceGroupPage} />} />
          <Route path="/orders/:id"               component={() => <ProtectedRoute permission="orders.view" component={OrderDetail} />} />
          <Route path="/inventory"                component={() => <ProtectedRoute permission="inventory.view" component={Inventory} />} />
          <Route path="/shipping"                 component={() => <ProtectedRoute permission="shipping.view" component={ShippingCompanies} />} />
          <Route path="/shipping/manifests/:id"   component={() => <ProtectedRoute permission="shipping.view" component={ShippingManifestPage} />} />
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
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
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
