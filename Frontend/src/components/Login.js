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
        body: JSON.stringify({ email, password }),
      });

      // Read the response as text and attempt to parse it as JSON
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (response.ok) {
          // Save the token
          localStorage.setItem("token", data.token);
          // Save the organization name if provided, otherwise default
          if (data.orgName) {
            localStorage.setItem("orgName", data.orgName);
          } else {
            localStorage.setItem("orgName", "Your Organization");
          }
          // Save the current login time to help reset the checklist per session
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
      <div style={{ marginTop: "1rem" }}>
        <span style={{ marginRight: "8px" }}>Don't have an account?</span>
        <button type="button" onClick={() => navigate('/register')}>
          Register
        </button>
      </div>
    </div>
  );
}

export default Login;
