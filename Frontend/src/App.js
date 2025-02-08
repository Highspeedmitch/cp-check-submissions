import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import FormPage from "./components/FormPage";
import Register from "./components/Register";
import PropertySelector from "./components/PropertySelector";
import AdminSubmissions from "./components/AdminSubmissions";
import ForgotPassword from "./components/ForgotPassword";
import ResetPassword from "./components/ResetPassword";
import Scheduler from "./components/Scheduler";
import { initPushNotifications } from "./components/PushNotifications";

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setUser(true);
    }
  }, []);

  // ✅ Register Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('✅ Service Worker Registered:', reg))
        .catch(err => console.error('❌ Service Worker Error:', err));
    }
  }, []);

  // ✅ Initialize push notifications after service worker is ready
  useEffect(() => {
    initPushNotifications();
  }, []);

  return (
    <Routes>
      <Route path="/" element={!user ? <Login setUser={setUser} /> : <Navigate to="/dashboard" />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={user ? <Dashboard setUser={setUser} /> : <Navigate to="/" />} />
      <Route path="/property-selector" element={user ? <PropertySelector /> : <Navigate to="/" />} />
      <Route path="/form/:property" element={user ? <FormPage /> : <Navigate to="/" />} />
      <Route path="*" element={<Navigate to="/" />} />
      <Route path="/admin/submissions/:property" element={<AdminSubmissions />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/scheduler" element={<Scheduler />} />
    </Routes>
  );
}

export default App;
