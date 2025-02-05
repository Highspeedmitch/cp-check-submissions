// FormPage.js
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
    trashCans: '',
    waterLeaks: '',
    waterLeaksTenant: '',
    dangerousTrees: '',
    brokenCurbs: '',
    potholes: '',
    photos: {} // Now each fieldName will store an array of Files
  });

  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /**
   * Handle multiple file uploads for a given field.
   * We'll store an array of files in formData.photos[fieldName].
   */
  const handleFileChange = (e, fieldName) => {
    const files = e.target.files; // This is a FileList
    if (!files || files.length === 0) return;

    setFormData(prev => {
      const updatedPhotos = { ...prev.photos };
      // If this field doesn't exist yet, initialize an empty array
      if (!updatedPhotos[fieldName]) {
        updatedPhotos[fieldName] = [];
      }

      // Convert each File into a new File that includes fieldName in the name
      for (let i = 0; i < files.length; i++) {
        const originalFile = files[i];
        const newFile = new File([originalFile], `${fieldName}-${originalFile.name}`, {
          type: originalFile.type,
        });
        updatedPhotos[fieldName].push(newFile);
      }

      return {
        ...prev,
        photos: updatedPhotos
      };
    });
  };

  /**
   * Submit the form with all text fields + photos in FormData
   */
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

      // Append photos
      Object.keys(formData.photos).forEach((field) => {
        const files = formData.photos[field];
        if (Array.isArray(files)) {
          files.forEach((file) => {
            formDataToSend.append('photos', file);
          });
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
        {/* Only show this if we're NOT submitted yet */}
        {!submitted && (
        <div className="return-to-dash">
          <button onClick={() => navigate('/dashboard')}>Return To Dashboard</button>
        </div>
)}
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
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'parkingLotLights')} />
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
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'securityLights')} />
      <textarea name="securityLightsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}
  </div>
  <div>
  <label>Are any under canopy lights out?:
    <select name="underCanopyLights" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.underCanopyLights === 'yes' && (
    <>
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'underCanopyLights')} />
      <textarea name="underCanopyLightsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}
  </div>
  <div>
  <label>Are any tenant signs out?:
    <select name="tenantSigns" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.tenantSigns === 'yes' && (
    <>
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'tenantSigns')} />
      <textarea name="tenantSignsDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
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
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'graffiti')} />
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
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'dumpsters')} />
      <textarea name="dumpstersDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
    </>
  )}
  </div>
  <div>
<label>Is there trash overflowing from the trashcans on sidewalks?:
    <select name="trashCans" onChange={handleChange}>
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </label>
  {formData.trashCans === 'yes' && (
    <>
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'trashCans')} />
      <textarea name="trashCansDescription" onChange={handleChange} placeholder="Describe the issue"></textarea>
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
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'waterLeaks')} />
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
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'waterLeaksTenant')} />
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
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'dangerousTrees')} />
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
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'brokenCurbs')} />
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
      <input type="file"
      accept="image/*"
      capture="camera"
      multiple
      onChange={(e) => handleFileChange(e, 'potholes')} />
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
