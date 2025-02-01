// Register.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
      const response = await fetch('https://cp-check-submissions-dev-backend.onrender.com/api/register', {
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
    }
  };

  return (
    <div className="container">
      <h2>Register</h2>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <label>Organization Name:</label>
        <input type="text" name="organizationName" onChange={handleChange} required />

        <label>Username:</label>
        <input type="text" name="username" onChange={handleChange} required />

        <label>Email:</label>
        <input type="email" name="email" onChange={handleChange} required />

        <label>Password:</label>
        <input type="password" name="password" onChange={handleChange} required />

        <label>Confirm Password:</label>
        <input type="password" name="confirmPassword" onChange={handleChange} required />

        {/* Toggle to register as admin */}
        <label>
          <input type="checkbox" checked={isAdmin} onChange={handleAdminToggle} />
          Register as Admin
        </label>
        {isAdmin && (
          <>
            <label>Admin Passkey:</label>
            <input type="text" name="adminPasskey" onChange={handleChange} required />
          </>
        )}

        <button type="submit">Register</button>
      </form>
    </div>
  );
}

export default Register;
