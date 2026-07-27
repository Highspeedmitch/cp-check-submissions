// Register.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from "./ui/PageHeader";
import { apiUrl } from "../services/api";

function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    organizationName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    properties: [],
    adminPasskey: '' // new field for admin registration
  });

  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAdminToggle = (e) => {
    setIsAdmin(e.target.checked);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Prepare payload: if not admin, remove adminPasskey field
    const payload = { ...formData };
    if (!isAdmin) {
      delete payload.adminPasskey;
    }

    try {
      setSubmitting(true);
      const response = await fetch(apiUrl("/api/register"), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(data.message || "Registration failed");
      }
    } catch (err) {
      console.error(err);
      setError("Error submitting registration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="beta-page beta-auth-page">
      <main className="beta-page-shell beta-register-shell">
        <PageHeader
          onBack={() => navigate("/login")}
          eyebrow="Afterlight"
          title="Create your account"
          subtitle="Join your organization and start managing property work in one place."
        />

        <div className="beta-register-layout">
          <aside className="beta-register-intro">
            <img src="/apple-touch-icon.png" alt="" className="beta-register-logo" />
            <p className="beta-eyebrow">One connected workspace</p>
            <h2>From property check to documented follow-up.</h2>
            <p>Access assignments, submit inspection reports, monitor invoices, and keep property activity organized.</p>
            <ul>
              <li>Property-specific assignments</li>
              <li>Timestamped inspection reporting</li>
              <li>Invoice and notification visibility</li>
            </ul>
          </aside>

          <section className="beta-panel beta-register-card">
            {message && <p className="beta-alert success" role="status">{message}</p>}
            {error && <p className="beta-alert error" role="alert">{error}</p>}
            <form onSubmit={handleSubmit}>
              <div className="beta-form-grid">
                <label className="beta-form-field full">Organization name
                  <input type="text" name="organizationName" value={formData.organizationName}
                    onChange={handleChange} autoComplete="organization" required />
                </label>
                <label className="beta-form-field full">Your name
                  <input type="text" name="username" value={formData.username}
                    onChange={handleChange} autoComplete="name" required />
                </label>
                <label className="beta-form-field full">Email
                  <input type="email" name="email" value={formData.email}
                    onChange={handleChange} autoComplete="email" required />
                </label>
                <label className="beta-form-field">Password
                  <input type="password" name="password" value={formData.password}
                    onChange={handleChange} autoComplete="new-password" required />
                </label>
                <label className="beta-form-field">Confirm password
                  <input type="password" name="confirmPassword" value={formData.confirmPassword}
                    onChange={handleChange} autoComplete="new-password" required />
                </label>
              </div>

              <label className="beta-role-toggle">
                <input type="checkbox" checked={isAdmin} onChange={handleAdminToggle} />
                <span>
                  <strong>Register as an organization administrator</strong>
                  <small>Requires the administrator passkey supplied during onboarding.</small>
                </span>
              </label>

              {isAdmin && (
                <label className="beta-form-field">Administrator passkey
                  <input type="password" name="adminPasskey" value={formData.adminPasskey}
                    onChange={handleChange} autoComplete="off" required />
                </label>
              )}

              <button type="submit" className="beta-button beta-register-submit" disabled={submitting}>
                {submitting ? "Creating account…" : "Create Account"}
              </button>
              <p className="beta-register-signin">
                Already registered? <button type="button" onClick={() => navigate("/login")}>Sign in</button>
              </p>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

export default Register;
