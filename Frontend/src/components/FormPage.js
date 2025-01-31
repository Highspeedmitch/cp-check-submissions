import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

function FormPage() {
  const { property } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    businessName: '',
    propertyAddress: '',
    fireSafetyMeasures: '',
    securitySystems: '',
    maintenanceSchedule: '',
    additionalNotes: '',
    parkingLotLights: '',
    underCanopyLights: '',
    graffiti: '',
    parkingBumpers: '',
    dumpsters: '',
    waterLeaks: '',
    dangerousTrees: '',
    trashCans: '',
    brokenCurbs: '',
    potholes: ''
  });

  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const payload = { ...formData, selectedProperty: property };

      const response = await fetch('https://cp-check-submissions-dev-backend.onrender.com/api/submit-form', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setSubmitted(true);
      } else {
        alert('Error: ' + data.message);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Error submitting form. Please try again.');
    }
  };

  return (
    <div className="container">
      <h1>{property} – Commercial Property Inspection Checklist</h1>
      {submitted ? (
        <div>
          <h2>{message}</h2>
          <button onClick={() => navigate('/dashboard')}>Return To Dashboard</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>Business Name:</label>
          <input type="text" name="businessName" onChange={handleChange} required />

          <label>Property Address:</label>
          <input type="text" name="propertyAddress" onChange={handleChange} required />

          <label>Fire Safety Measures:</label>
          <textarea name="fireSafetyMeasures" onChange={handleChange} required></textarea>

          <label>Security Systems:</label>
          <textarea name="securitySystems" onChange={handleChange} required></textarea>

          <label>Maintenance Schedule:</label>
          <textarea name="maintenanceSchedule" onChange={handleChange} required></textarea>

          <h2>Additional Property Condition Checks</h2>

          <label>Parking Lot Lights:</label>
          <textarea name="parkingLotLights" onChange={handleChange}></textarea>

          <label>Under Canopy Lights / Tenant Signs:</label>
          <textarea name="underCanopyLights" onChange={handleChange}></textarea>

          <label>Graffiti:</label>
          <textarea name="graffiti" onChange={handleChange}></textarea>

          <label>Parking Bumpers:</label>
          <textarea name="parkingBumpers" onChange={handleChange}></textarea>

          <label>Dumpsters:</label>
          <textarea name="dumpsters" onChange={handleChange}></textarea>

          <label>Water Leaks:</label>
          <textarea name="waterLeaks" onChange={handleChange}></textarea>

          <label>Dangerous Trees:</label>
          <textarea name="dangerousTrees" onChange={handleChange}></textarea>

          <label>Trash Cans:</label>
          <textarea name="trashCans" onChange={handleChange}></textarea>

          <label>Broken Parking Lot Curbing:</label>
          <textarea name="brokenCurbs" onChange={handleChange}></textarea>

          <label>Major Potholes:</label>
          <textarea name="potholes" onChange={handleChange}></textarea>

          <label>Additional Notes:</label>
          <textarea name="additionalNotes" onChange={handleChange}></textarea>

          <button type="submit">Submit Checklist</button>
        </form>
      )}
    </div>
  );
}

export default FormPage;
