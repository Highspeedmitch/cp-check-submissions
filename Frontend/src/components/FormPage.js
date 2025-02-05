import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

function FormPage() {
  const { property } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    businessName: '',
    propertyAddress: '',
    securityLights: '',
    homelessActivity: '',
    additionalComments: '',
    parkingLotLights: '',
    underCanopyLights: '',
    graffiti: '',
    parkingBumpers: '',
    dumpsters: '',
    trashcans: '',
    waterLeaks: '',
    waterLeaksTenant:'',
    dangerousTrees: '',
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
      // Rename file with field name to help backend identify it
      const newFile = new File([file], `${fieldName}-${file.name}`, { type: file.type });
  
      setFormData(prev => ({
        ...prev,
        photos: { ...prev.photos, [fieldName]: newFile }  // Store file object with labeled name
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
          <label>Shopping Center Name:</label>
          <input type="text" name="businessName" onChange={handleChange} required />

          <label>Property Address:</label>
          <input type="text" name="propertyAddress" onChange={handleChange} required />

          <h2>Additional Property Condition Checks</h2>

<div className="additional-checks">
  <div>
  <label>Are parking lot lights out?:
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
  </div>
  <div>
  <label>Are Rear security lights out?:
    <select name="securityLights" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.securityLights === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'securityLights')} />
      <textarea name="securityLightsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}
  </div>
  <div>
  <label>Are under canopy lights / Tenant signs out?:
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
  </div>
  <div>
  <label>Is there graffiti on or around the property?:
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
  </div>
  <div>
<label>Is there trash overflowing from the dumpsters?:
    <select name="dumpsters" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.dumpsters === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'dumpsters')} />
      <textarea name="dumpstersDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}
  </div>
  <div>
<label>Is there trash overflowing from the trashcans on sidewalks?:
    <select name="trashcans" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.trashcans === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'trashcans')} />
      <textarea name="trashcansDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}
  </div>
  <div>
  <label>Are there any visible water leaks in parking lot? ie. irrigation leak:
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
</div>
<div>
  <label>Are there any visible water leaks from specific tenant? ie. swamp cooler leak:
    <select name="waterLeaksTenant" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.waterLeaksTenant === 'yes' && (
    <>
      <input type="file" accept="image/*" capture="camera" onChange={(e) => handleFileChange(e, 'waterLeaksTenant')} />
      <textarea name="waterLeaksTenantDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}
</div>
<div>
  <label>Are there any obviously dangerous trees / branches?:
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
</div>
<div>
  <label>Is there any broken parking lot curbing?:
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
</div>
<div>
  <label>Are there any major potholes?:
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
</div>
          <label>Is there any homeless activity of note?:</label>
          <textarea name="homelessActivity" onChange={handleChange}></textarea>

          <label>Additional Comments:</label>
          <textarea name="additionalComments" onChange={handleChange}></textarea>

          <button type="submit" className='submit button'>Submit Checklist</button>
        </form>
      )}
    </div>
  );
}

export default FormPage;
