import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import ClientDashboard from "./components/ClientDashboard";
import ClientProfitStatement from "./components/ClientProfitStatement"; // New component for profit statement view
import ScheduleConsultation from "./components/ScheduleConsultation";   // New component for consultation scheduling
import ClientRegistration from "./components/ClientRegistration";
import FormPage from "./components/FormPage";
import Register from "./components/Register";
import PropertySelector from "./components/PropertySelector";
import AdminSubmissions from "./components/AdminSubmissions";
import ForgotPassword from "./components/ForgotPassword";
import ResetPassword from "./components/ResetPassword";
import AzRootsScheduler from "./components/AzRootsScheduler";
import DefaultScheduler from "./components/Scheduler";
import ResidentialForm from "./components/ResidentialForm";
import LongTermRental from "./components/LongTermRental";
import ShortTermRental from "./components/ShortTermRental";
import STReditProperty from "./components/STReditProperty";
import AccessInstructions from "./components/AccessInstructions";
import AZRaccessinstructions from "./components/AZRaccessinstructions";
import Payments from "./components/Payments";
import ProfitUpload from "./components/ProfitUpload";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import EditPropertyWrapper from "./components/EditPropertyWrapper";
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

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      setUser(false);
      setRole(null);
      return;
    }

    setUser(true);
    
    // Fetch role AFTER user is confirmed logged in
    const storedRole = localStorage.getItem("role");
    console.log("🔹 Retrieved role from localStorage:", storedRole);

    if (storedRole) {
      setRole(storedRole);
    } else {
      console.warn("⚠️ Role is missing in localStorage, defaulting to 'user'");
      setRole("user");
    }
  }, [user]); // Re-run when `user` updates

  console.log("🔹 Final User State:", user);
  console.log("🔹 Final Role State:", role);

  return (
    <Routes>
      <Route path="/" element={!user ? <Login setUser={setUser} /> : <Navigate to="/dashboard" />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />

      {/* ✅ Ensure Clients Redirect Correctly */}
      <Route
        path="/dashboard"
        element={
          user
            ? role === "client"
              ? <Navigate to="/client/dashboard" />
              : <Dashboard setUser={setUser} />
            : <Navigate to="/" />
        }
      />

      <Route path="/property-selector" element={user ? <PropertySelector /> : <Navigate to="/" />} />
      <Route path="/form/:property" element={user ? <FormPage /> : <Navigate to="/" />} />
      <Route path="/residential-form/:property" element={user ? <ResidentialForm /> : <Navigate to="/" />} />
      <Route path="/long-term-rental-form/:property" element={user ? <LongTermRental /> : <Navigate to="/" />} />
      <Route path="/short-term-rental-form/:property" element={user ? <ShortTermRental /> : <Navigate to="/" />} />
      <Route path="/admin/submissions/:property" element={<AdminSubmissions />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/scheduler" element={<SchedulerWrapper />} />
      {/*<Route path="/access-instructions/:propertyName" element={<AccessInstructions />} />*/}

      {/* New STR Admin Edit Property Route */}
      {/*<Route path="/admin/edit-property/:propertyName" element={user ? <STReditProperty /> : <Navigate to="/" />} />*/}

      {/* Payments Page - Only Admins */}
      <Route path="/payments" element={user && role === "admin" ? <Payments /> : <Navigate to="/" />} />

      {/* Profit Uploads - Only for AzRoots Admins */}
      <Route path="/profit-uploads/:propertyName" element={user && role === "admin" ? <ProfitUpload /> : <Navigate to="/" />} />

      {/* Client Dashboard - Only for Clients */}
      <Route path="/client/dashboard" element={user && role === "client" ? <ClientDashboard /> : <Navigate to="/" />} />
      
      {/* New: Client Profit Statement Route */}
      <Route path="/client/profit-statement/:propertyId" element={user && role === "client" ? <ClientProfitStatement /> : <Navigate to="/" />} />

      {/* New: Client Consultation Scheduling Route */}
      <Route path="/client/schedule-consultation" element={user && role === "client" ? <ScheduleConsultation /> : <Navigate to="/" />} />

      {/* Client Registration */}
      <Route path="/client-registration" element={<ClientRegistration />} />
     
      {/* AZRAccessinstructions conditional render */}
      <Route path="/access-instructions/:propertyName" element={<AccessInstructionsWrapper />} />
      <Route path="/admin/edit-property/:propertyName" element={user ? <EditPropertyWrapper /> : <Navigate to="/" />}/>
      <Route path="/azr-access-instructions/:propertyName" element={<AZRaccessinstructions />} />
      {/* 404 Redirect */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
