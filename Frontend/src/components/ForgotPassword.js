import React, { useState } from "react";
import { apiUrl } from "../services/api";
import {
  PASSWORD_RESET_REQUEST_MESSAGE,
  passwordResetFailureMessage,
} from "../services/authMessages";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(""); // ✅ State for success message

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setMessage(""); // Clear previous message

    try {
      const response = await fetch(apiUrl("/api/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (response.ok) {
        setMessage(PASSWORD_RESET_REQUEST_MESSAGE);
      } else {
        setMessage(passwordResetFailureMessage(response.status));
      }
    } catch (_error) {
      setMessage(passwordResetFailureMessage(0));
    }
  };

  return (
    <div className="container">
      <h2>Forgot Password</h2>
      {message && <p className="success-message">{message}</p>} {/* ✅ Success Message */}
      
      <form onSubmit={handleForgotPassword}>
        <input
          type="email"
          placeholder="Enter your email"
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit">Submit</button>
      </form>

      <div style={{ marginTop: "1rem" }}>
        <a href="/login">Back to Login</a>
      </div>
    </div>
  );
}

export default ForgotPassword;
