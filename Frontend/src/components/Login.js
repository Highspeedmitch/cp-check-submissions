// Login.js
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

function Login({ setUser }) {
  const [email, setEmail] = useState("");  
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
      });

      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (response.ok) {
          localStorage.setItem("token", data.token);
          localStorage.setItem("orgName", data.orgName || "Your Organization");
          localStorage.setItem("role", data.role || "user");
          localStorage.setItem("loginTime", new Date().toISOString());
          setUser(true);
          navigate("/dashboard");
        } else {
          alert(data.message);
        }
      } catch (jsonError) {
        console.error("❌ Unexpected response:", text);
        alert("Unexpected server response. Please try again.");
      }
    } catch (error) {
      console.error("❌ Login error:", error);
      alert("Server error. Please try again.");
    }
  };

  return (
    <div className="container">
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
      <div style={{ marginTop: "1rem" }}>
        <Link to="/forgot-password" style={{ textDecoration: "none", color: "blue" }}>
          Forgot Password?
        </Link>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <span style={{ marginRight: "8px" }}>Don't have an account?</span>
        <Link to="/register">
          <button type="button">Register</button>
        </Link>
      </div>
    </div>
  );
}

export default Login;
