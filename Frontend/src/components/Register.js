import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';


function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    organizationName: '',
    username: '',
    email: '',              // ✅ We'll pass this to the backend
    password: '',
    confirmPassword: '',
    properties: [],         // if needed
    emails: [],             // if needed
  });

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    // ✅ Validate password match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      const response = await fetch('https://cp-check-submissions-dev.onrender.com/register', { // your backend
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: formData.organizationName,
          username: formData.username,
          email: formData.email,           // pass email
          password: formData.password,
          properties: formData.properties, // if needed
          emails: formData.emails         // if needed
        })
      });

      const data = await response.json();
      if (response.ok) {
        setMessage('Registration successful! Redirecting to login...');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(data.message || 'Registration failed');
      }
    } catch (err) {
      setError('Error submitting form. Please try again.');
    }
  };

  return (
    <div className="container">
      <h1>Register</h1>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <label>Organization Name:</label>
        <input
          type="text"
          name="organizationName"
          onChange={handleChange}
          required
        />

        <label>Username:</label>
        <input
          type="text"
          name="username"
          onChange={handleChange}
          required
        />

        <label>Email:</label>
        <input
          type="email"
          name="email"
          onChange={handleChange}
          required
        />

        <label>Password:</label>
        <input
          type="password"
          name="password"
          onChange={handleChange}
          required
        />

        <label>Confirm Password:</label>
        <input
          type="password"
          name="confirmPassword"
          onChange={handleChange}
          required
        />

        <button type="submit">Register</button>
      </form>
    </div>
  );
}

export default Register;
