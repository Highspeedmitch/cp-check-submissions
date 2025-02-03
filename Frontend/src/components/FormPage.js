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
    photos: {}  // Store photos for each field
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
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          photos: { ...prev.photos, [fieldName]: reader.result }  // Store base64 photo for that field
        }));
      };
    }
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
          <select name="parkingLotLights" onChange={handleChange}>
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          {formData.parkingLotLights === 'yes' && (
            <>
              <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'parkingLotLights')} />
              <textarea name="parkingLotLightsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
            </>
          )}

          <label>Under Canopy Lights / Tenant Signs:</label>
          <select name="underCanopyLights" onChange={handleChange}>
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          {formData.underCanopyLights === 'yes' && (
            <>
              <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'underCanopyLights')} />
              <textarea name="underCanopyLightsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
            </>
          )}

          <label>Graffiti:</label>
          <select name="graffiti" onChange={handleChange}>
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          {formData.graffiti === 'yes' && (
            <>
              <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'graffiti')} />
              <textarea name="graffitiDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
            </>
          )}

          <label>Water Leaks:</label>
          <select name="waterLeaks" onChange={handleChange}>
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          {formData.waterLeaks === 'yes' && (
            <>
              <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'waterLeaks')} />
              <textarea name="waterLeaksDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
            </>
          )}

          <label>Dangerous Trees:</label>
          <select name="dangerousTrees" onChange={handleChange}>
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          {formData.dangerousTrees === 'yes' && (
            <>
              <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'dangerousTrees')} />
              <textarea name="dangerousTreesDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
            </>
          )}

          <label>Broken Parking Lot Curbing:</label>
          <select name="brokenCurbs" onChange={handleChange}>
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          {formData.brokenCurbs === 'yes' && (
            <>
              <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'brokenCurbs')} />
              <textarea name="brokenCurbsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
            </>
          )}

          <label>Major Potholes:</label>
          <select name="potholes" onChange={handleChange}>
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          {formData.potholes === 'yes' && (
            <>
              <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'potholes')} />
              <textarea name="potholesDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
            </>
          )}

          <label>Additional Notes:</label>
          <textarea name="additionalNotes" onChange={handleChange}></textarea>

          <button type="submit">Submit Checklist</button>
        </form>
      )}
    </div>
  );
}

export default FormPage;
