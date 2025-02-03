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
    potholes: '',
    photos: {} // Store photos for each field
  });

  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e, fieldName) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        photos: { ...prev.photos, [fieldName]: file }
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const formDataToSend = new FormData();

      // Append all text fields
      Object.keys(formData).forEach((key) => {
        if (key !== "photos") {
          formDataToSend.append(key, formData[key]);
        }
      });
      
      // Append selected property explicitly
      formDataToSend.append('selectedProperty', property);
  
      // Append photos to FormData
      Object.keys(formData.photos).forEach((field) => {
        const file = formData.photos[field];
        if (file) {
          formDataToSend.append('photos', file);
        }
      });
  
      const response = await fetch('https://cp-check-submissions-dev-backend.onrender.com/api/submit-form', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formDataToSend,
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
          <input type="hidden" name="selectedProperty" value={property} /> {/* Ensure property is sent */}
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

<div className="additional-checks">
  <label>Parking Lot Lights:
    <select name="parkingLotLights" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.parkingLotLights === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'parkingLotLights')} />
      <textarea name="parkingLotLightsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}

  <label>Under Canopy Lights / Tenant Signs:
    <select name="underCanopyLights" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.underCanopyLights === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'underCanopyLights')} />
      <textarea name="underCanopyLightsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}

  <label>Graffiti:
    <select name="graffiti" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.graffiti === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'graffiti')} />
      <textarea name="graffitiDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}

  <label>Water Leaks:
    <select name="waterLeaks" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.waterLeaks === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'waterLeaks')} />
      <textarea name="waterLeaksDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}

  <label>Dangerous Trees:
    <select name="dangerousTrees" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.dangerousTrees === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'dangerousTrees')} />
      <textarea name="dangerousTreesDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}

  <label>Broken Parking Lot Curbing:
    <select name="brokenCurbs" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.brokenCurbs === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'brokenCurbs')} />
      <textarea name="brokenCurbsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}

  <label>Major Potholes:
    <select name="potholes" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.potholes === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'potholes')} />
      <textarea name="potholesDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}
</div>
          <label>Additional Notes:</label>
          <textarea name="additionalNotes" onChange={handleChange}></textarea>

          <button type="submit">Submit Checklist</button>
        </form>
      )}
    </div>
  );
}

export default FormPage;
