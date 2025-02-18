import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import FormPage from "./components/FormPage"; // Commercial form
import Register from "./components/Register";
import PropertySelector from "./components/PropertySelector";
import AdminSubmissions from "./components/AdminSubmissions";
import ForgotPassword from "./components/ForgotPassword";
import ResetPassword from "./components/ResetPassword";
import Scheduler from "./components/Scheduler";
import ResidentialForm from "./components/ResidentialForm";
import LongTermRental from "./components/LongTermRental";
import ShortTermRental from "./components/ShortTermRental";
import STReditProperty from "./components/STReditProperty"; // New STR Admin Edit Page
import AccessInstructions from "./components/AccessInstructions";
import Payments from "./components/Payments"; // Payments Page
import ProfitUpload from "./components/ProfitUpload";
import ClientDashboard from "./components/ClientDashboard";
import ClientRegistration from "./components/ClientRegistration";
// Import Firebase Messaging
import { FirebaseMessaging } from "@capacitor-firebase/messaging";

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setUser(true);
      setRole(localStorage.getItem("role")); // Fetch user role
    }

    async function requestPermission() {
      try {
        const result = await FirebaseMessaging.requestPermissions();
        console.log("Push Permission:", result);
      } catch (error) {
        console.error("Push Permission Error:", error);
      }
    }

    requestPermission();
  }, []);

  return (
    <Routes>
      <Route path="/" element={!user ? <Login setUser={setUser} /> : <Navigate to="/dashboard" />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      
      {/* Force clients away from the standard dashboard */}
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
      <Route path="/scheduler" element={<Scheduler />} />
      <Route path="/access-instructions/:property" element={<AccessInstructions />} />
      {/* New STR Admin Edit Property Route */}
      <Route path="/admin/edit-property/:propertyName" element={user ? <STReditProperty /> : <Navigate to="/" />} />
      {/* Payments Page - Only Admins */}
      <Route path="/payments" element={user && role === "admin" ? <Payments /> : <Navigate to="/" />} />
      {/* Profit Uploads - Only for AzRoots Admins */}
      <Route path="/profit-uploads" element={user && role === "admin" ? <ProfitUpload /> : <Navigate to="/" />} />
      {/* Client Dashboard - Only for Clients */}
      <Route path="/client/dashboard" element={user && role === "client" ? <ClientDashboard /> : <Navigate to="/" />} />
      {/* Client Registration */}
      <Route path="/client-registration" element={<ClientRegistration />} />
      {/* 404 Redirect */}
      <Route path="*" element={<Navigate to="/" />} />
      <Route path="/client-dashboard/:property" element={<ClientDashboard />} />
    </Routes>
  );
}

export default App;
