// Login.js
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { storeAuthentication } from "../services/session";

function Login({ setUser }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded = JSON.parse(atob(token.split(".")[1])); // Decode token
        const currentTime = Date.now() / 1000;

        if (decoded.exp && decoded.exp > currentTime) {
          if (decoded.role === "client") {
            navigate("/client/dashboard");
          } else {
            navigate("/dashboard");
          }
        } else {        
          localStorage.removeItem("token");
          localStorage.removeItem("role");
        }
      } catch (error) {
        console.error("❌ Error decoding token:", error);
        localStorage.removeItem("token");
        localStorage.removeItem("role");
      }
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const response = await fetch(
        "https://cp-check-submissions-dev-backend.onrender.com/api/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.toLowerCase(), password }),
          credentials: "include",
        }
      );
  
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (response.ok) {
          storeAuthentication(data);
          localStorage.setItem("loginTime", new Date().toISOString());
  
          if (data.organizationId) {
            localStorage.setItem("organizationId", data.organizationId);
          }
  
          // Decode token to store userId
          try {
            const decoded = JSON.parse(atob(data.token.split(".")[1]));
            if (decoded.userId) {
              localStorage.setItem("userId", decoded.userId);
            }
          } catch (decodeError) {
            console.error("Error decoding token for userId:", decodeError);
          }
  
          // ✅ Set user to logged in
          if (setUser) setUser(true);
  
          // ✅ Navigate based on role
          if (data.role === "client") {
            localStorage.setItem("role", "client");
            navigate("/client/dashboard");
          } else {
            localStorage.setItem("role", data.role || "user");
            navigate("/dashboard");
          }          
        } else {
          setError(data.message || "Unable to sign in.");
        }
      } catch (jsonError) {
        console.error("Unexpected non-JSON login response.");
        setError("Unexpected server response. Please try again.");
      }
    } catch (error) {
      console.error("❌ Login error:", error);
      setError("Server error. Please try again.");
    }
  };
  

  return (
    <div className="login-container">
      {/* Branding Banner */}
      <div className="login-banner">
        <img
          src="/apple-touch-icon.png"
          alt="Inspectors Gadget Logo"
          className="login-logo"
        />
        <h1 className="brand-title">Inspectors Gadget</h1>
      </div>

      {/* Login Form */}
      <div className="login-box">
        <h2>Login</h2>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Login</button>
        </form>

        {/* Forgot Password Link */}
        <div className="link-container">
          <Link to="/forgot-password" className="link">
            Forgot Password?
          </Link>
        </div>

        <div className="register-container">
          <span>Don't have an account?</span>
          <Link to="/register">
            <button type="button" className="register-btn">
              Register
            </button>
            </Link>
            <div className="link-container">
          <Link to="/client-registration" className="link">
            Property Owner?
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
