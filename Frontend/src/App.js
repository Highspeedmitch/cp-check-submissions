import React, { lazy, Suspense, useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./components/Login";
import OktaCallback from "./components/OktaCallback";
import PushNotifications from "./components/PushNotifications";
import AssumedAccessBanner from "./components/AssumedAccessBanner";
import SessionStatusBanner from "./components/SessionStatusBanner";
import PwaUpdateBanner from "./components/PwaUpdateBanner";
import { restoreSession, tokenNeedsRefresh } from "./services/session";

const Dashboard = lazy(() => import("./components/Dashboard"));
const ClientDashboard = lazy(() => import("./components/ClientDashboard"));
const ClientProfitStatement = lazy(() => import("./components/ClientProfitStatement"));
const ScheduleConsultation = lazy(() => import("./components/ScheduleConsultation"));
const ClientRegistration = lazy(() => import("./components/ClientRegistration"));
const FormPage = lazy(() => import("./components/FormPage"));
const PropertyFormSettings = lazy(() => import("./components/PropertyFormSettings"));
const OrganizationFormSettings = lazy(() => import("./components/OrganizationFormSettings"));
const OrganizationSecurity = lazy(() => import("./components/OrganizationSecurity"));
const Register = lazy(() => import("./components/Register"));
const InviteRegistration = lazy(() => import("./components/InviteRegistration"));
const AdminSubmissions = lazy(() => import("./components/AdminSubmissions"));
const ForgotPassword = lazy(() => import("./components/ForgotPassword"));
const ResetPassword = lazy(() => import("./components/ResetPassword"));
const AzRootsScheduler = lazy(() => import("./components/AzRootsScheduler"));
const DefaultScheduler = lazy(() => import("./components/Scheduler"));
const ResidentialForm = lazy(() => import("./components/ResidentialForm"));
const LongTermRental = lazy(() => import("./components/LongTermRental"));
const ShortTermRental = lazy(() => import("./components/ShortTermRental"));
const AccessInstructions = lazy(() => import("./components/AccessInstructions"));
const AZRaccessinstructions = lazy(() => import("./components/AZRaccessinstructions"));
const Payments = lazy(() => import("./components/Payments"));
const ProfitUpload = lazy(() => import("./components/ProfitUpload"));
const EditPropertyWrapper = lazy(() => import("./components/EditPropertyWrapper"));
const Billing = lazy(() => import("./components/Billing"));
const InvoiceReview = lazy(() => import("./components/InvoiceReview"));
const BidRequests = lazy(() => import("./components/BidRequests"));
const UserManagement = lazy(() => import("./components/UserManagement"));
const Reporting = lazy(() => import("./components/Reporting"));
const PlatformDashboard = lazy(() => import("./components/PlatformDashboard"));
const HelpCenter = lazy(() => import("./components/help/HelpCenter"));
const HelpArticle = lazy(() => import("./components/help/HelpArticle"));

function RouteLoading() {
  return (
    <div className="beta-page">
      <main className="beta-page-shell">
        <div className="beta-empty-state" role="status">Loading page…</div>
      </main>
    </div>
  );
}

function SchedulerWrapper() {
  // We check localStorage or a context/hook, whichever you prefer
  const role = localStorage.getItem("role");
  const orgName = localStorage.getItem("orgName");
  const isAzRootsAdmin = (role === "admin" && orgName === "AzRoots");

  // Return whichever component is appropriate
  if (isAzRootsAdmin) {
    return <AzRootsScheduler />;
  } else {
    return <DefaultScheduler />;
  }
}

function AccessInstructionsWrapper() {
  const role = localStorage.getItem("role");
  const orgName = localStorage.getItem("orgName");
  const isAzRootsAdmin = (role === "admin" && orgName === "AzRoots");

  if (isAzRootsAdmin) {
    return <AZRaccessinstructions />;
  } else {
    return <AccessInstructions />;
  }
}

function InvoiceReviewRoute({ user, role }) {
  const location = useLocation();
  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return role === "property_manager"
    ? <InvoiceReview />
    : <Navigate to="/billing" replace />;
}

function HelpRoute({ user, platformRole, assumedOrganization, children }) {
  const location = useLocation();
  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (platformRole && !assumedOrganization) return <Navigate to="/platform" replace />;
  return children;
}

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [platformRole, setPlatformRole] = useState(null);
  const [assumedOrganization, setAssumedOrganization] = useState(false);

  useEffect(() => {
    const handleSessionCleared = () => {
      setUser(false);
      setRole(null);
      setPlatformRole(null);
      setAssumedOrganization(false);
    };
    window.addEventListener("auth-session-cleared", handleSessionCleared);
    return () => window.removeEventListener("auth-session-cleared", handleSessionCleared);
  }, []);

  useEffect(() => {
    if (user === false) {
      setRole(null);
      setPlatformRole(null);
      setAssumedOrganization(false);
      return;
    }
    const token = localStorage.getItem("token");
    if (
      process.env.NODE_ENV !== "test" &&
      (!token || tokenNeedsRefresh(token, 0))
    ) {
      restoreSession().then((authenticated) => {
        setUser(authenticated);
        setRole(authenticated ? localStorage.getItem("role") || "user" : null);
        setPlatformRole(authenticated ? localStorage.getItem("platformRole") : null);
        setAssumedOrganization(
          authenticated && localStorage.getItem("assumedOrganization") === "true"
        );
      });
      return;
    }

    if (!token) {
      setUser(false);
      setRole(null);
      setPlatformRole(null);
      setAssumedOrganization(false);
      return;
    }

    setUser(true);
    
    // Fetch role AFTER user is confirmed logged in
    const storedRole = localStorage.getItem("role");
    if (storedRole) {
      setRole(storedRole);
    } else {
      setRole("user");
    }
    setPlatformRole(localStorage.getItem("platformRole"));
    setAssumedOrganization(localStorage.getItem("assumedOrganization") === "true");
  }, [user]);

  if (user === null) return null;

  return (
    <>
    <AssumedAccessBanner />
    <PwaUpdateBanner />
    {user === true && <SessionStatusBanner />}
    <PushNotifications enabled={user === true && (!platformRole || assumedOrganization)} />
    <Suspense fallback={<RouteLoading />}>
      <Routes>
      <Route path="/" element={!user
        ? <Login setUser={setUser} />
        : <Navigate to={platformRole && !assumedOrganization ? "/platform" : "/dashboard"} />} />
      <Route path="/join" element={<InviteRegistration />} />
      <Route path="/register" element={process.env.REACT_APP_ALLOW_PUBLIC_REGISTRATION === "true" ? <Register /> : <Navigate to="/join" replace />} />
      <Route path="/login" element={user
        ? <Navigate to={platformRole && !assumedOrganization ? "/platform" : "/dashboard"} />
        : <Login setUser={setUser} />} />
      <Route path="/login/callback" element={<OktaCallback setUser={setUser} />} />
      <Route path="/login/okta/callback" element={<OktaCallback setUser={setUser} />} />
      <Route path="/platform" element={
        user && platformRole === "platform_admin" && !assumedOrganization
          ? <PlatformDashboard />
          : <Navigate to="/" />
      } />

      {/* ✅ Ensure Clients Redirect Correctly */}
      <Route
        path="/dashboard"
        element={
          user
            ? platformRole && !assumedOrganization
              ? <Navigate to="/platform" />
              : role === "client"
              ? <Navigate to="/client/dashboard" />
              : <Dashboard setUser={setUser} />
            : <Navigate to="/" />
        }
      />

      <Route path="/form/:property" element={user ? <FormPage /> : <Navigate to="/" />} />
      <Route path="/property-form-settings/:property" element={user ? <PropertyFormSettings /> : <Navigate to="/" />} />
      <Route path="/organization-form-settings" element={user ? <OrganizationFormSettings /> : <Navigate to="/" />} />
      <Route path="/organization-security" element={
        user && role === "admin" && !assumedOrganization
          ? <OrganizationSecurity />
          : <Navigate to="/" />
      } />
      <Route path="/residential-form/:property" element={user ? <ResidentialForm /> : <Navigate to="/" />} />
      <Route path="/long-term-rental-form/:property" element={user ? <LongTermRental /> : <Navigate to="/" />} />
      <Route path="/short-term-rental-form/:property" element={user ? <ShortTermRental /> : <Navigate to="/" />} />
      <Route path="/admin/submissions/:property" element={<AdminSubmissions />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/scheduler" element={<SchedulerWrapper />} />
      {/* Payments Page - Only Admins */}
      <Route path="/payments" element={user && role === "admin" ? <Payments /> : <Navigate to="/" />} />
      <Route path="/billing" element={user && role !== "client" ? <Billing /> : <Navigate to="/" />} />
      <Route path="/billing/review/:id" element={<InvoiceReviewRoute user={user} role={role} />} />
      <Route path="/bid-requests" element={user && ["admin", "property_manager"].includes(role) ? <BidRequests /> : <Navigate to="/" />} />
      <Route path="/reporting" element={user && ["admin", "property_manager"].includes(role) ? <Reporting /> : <Navigate to="/" />} />
      <Route path="/admin/users" element={user && role === "admin" ? <UserManagement /> : <Navigate to="/" />} />
      <Route path="/help" element={
        <HelpRoute user={user} platformRole={platformRole} assumedOrganization={assumedOrganization}>
          <HelpCenter />
        </HelpRoute>
      } />
      <Route path="/help/:slug" element={
        <HelpRoute user={user} platformRole={platformRole} assumedOrganization={assumedOrganization}>
          <HelpArticle />
        </HelpRoute>
      } />

      {/* Profit Uploads - Only for AzRoots Admins */}
      <Route path="/profit-uploads/:propertyName" element={user && role === "admin" ? <ProfitUpload /> : <Navigate to="/" />} />

      {/* Client Dashboard - Only for Clients */}
      <Route path="/client/dashboard" element={user && role === "client" ? <ClientDashboard setUser={setUser} /> : <Navigate to="/" />} />
      
      <Route path="/client/profit-statement/:propertyId" element={user && role === "client" ? <ClientProfitStatement /> : <Navigate to="/" />} />

      <Route path="/client/schedule-consultation" element={user && role === "client" ? <ScheduleConsultation /> : <Navigate to="/" />} />

      {/* Client Registration */}
      <Route path="/client-registration" element={process.env.REACT_APP_ALLOW_PUBLIC_REGISTRATION === "true" ? <ClientRegistration /> : <Navigate to="/join" replace />} />
     
      {/* AZRAccessinstructions conditional render */}
      <Route path="/access-instructions/:propertyName" element={<AccessInstructionsWrapper />} />
      <Route path="/admin/edit-property/:propertyName" element={user ? <EditPropertyWrapper /> : <Navigate to="/" />}/>
      <Route path="/azr-access-instructions/:propertyName" element={<AZRaccessinstructions />} />
      {/* 404 Redirect */}
      <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
    </>
  );
}

export default App;
