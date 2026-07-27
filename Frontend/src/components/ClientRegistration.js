import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../services/api";

function ClientRegistration() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [adminEmail, setAdminEmail] = useState(""); // The admin’s email
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    // Send this data to a new route, e.g. POST /api/register-client
    try {
      const response = await fetch(apiUrl("/api/register-client"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          adminEmail,
          password
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage("Registration successful! Please log in.");
        // Optionally redirect to login
        setTimeout(() => navigate("/login"), 3000);
      } else {
        setMessage(data.message || "Registration failed.");
      }
    } catch (error) {
      console.error("Error registering client:", error);
      setMessage("Server error. Please try again later.");
    }
  };

  return (
    <div className="container">
      <h2>Property Owner Registration</h2>
      {message && <p>{message}</p>}
      <form onSubmit={handleSubmit}>
        <label>First Name:</label>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />

        <label>Last Name:</label>
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />

        <label>Email (Client):</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label>Admin’s Email:</label>
        <input
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          required
        />

        <label>Password:</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label>Confirm Password:</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <button type="submit">Register</button>
      </form>
    </div>
  );
}

export default ClientRegistration;
