import React, { useState } from "react";

function ScheduleConsultation() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Here you would normally send the details to your backend or a scheduling service.
    setMessage("Consultation scheduled! We will contact you shortly.");
    // Optionally clear the form:
    setName("");
    setEmail("");
    setPhone("");
  };

  return (
    <div className="schedule-consultation">
      <h2>Schedule a Consultation</h2>
      {message && <p className="consultation-message">{message}</p>}
      <form onSubmit={handleSubmit} className="consultation-form">
        <label>
          Name:
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Email:
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Phone:
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <button type="submit">Schedule Now</button>
      </form>
    </div>
  );
}

export default ScheduleConsultation;
