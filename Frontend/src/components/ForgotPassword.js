import React, { useState } from "react";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(""); // ✅ State for success message

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setMessage(""); // Clear previous message

    try {
      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setMessage("Your password reset request has been processed. If the email matches an account, you will receive an email with instructions on how to reset your password.");
      } else {
        const data = await response.json();
        setMessage(data.message || "An error occurred. Please try again.");
      }
    } catch (error) {
      console.error("❌ Forgot Password Error:", error);
      setMessage("An error occurred. Please try again.");
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
