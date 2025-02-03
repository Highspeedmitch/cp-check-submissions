const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const pdfStorageDir = path.join(__dirname, 'pdfstore');

function generateChecklistPDF(formData, photoBuffers) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
  
      if (!fs.existsSync(pdfStorageDir)) {
        fs.mkdirSync(pdfStorageDir, { recursive: true });
      }
  
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `checklist-${timestamp}.pdf`;
      const filePath = path.join(pdfStorageDir, fileName);
      const pdfStream = fs.createWriteStream(filePath);
  
      doc.pipe(pdfStream);
  
      doc.fontSize(20).text('Commercial Property Inspection Checklist', { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(14).text(`Business Name: ${formData.businessName || 'N/A'}`);
      doc.text(`Property Address: ${formData.propertyAddress || 'N/A'}`);
      doc.text(`Fire Safety Measures: ${formData.fireSafetyMeasures || 'N/A'}`);
      doc.text(`Security Systems: ${formData.securitySystems || 'N/A'}`);
      doc.text(`Maintenance Schedule: ${formData.maintenanceSchedule || 'N/A'}`);
      doc.moveDown(1);
  
      doc.fontSize(14).text('Additional Notes:', { underline: true });
      doc.text(`${formData.additionalNotes || 'None'}`);
      doc.moveDown(1);
  
      const fields = [
        'parkingLotLights', 'underCanopyLights', 'graffiti',
        'waterLeaks', 'dangerousTrees', 'brokenCurbs', 'potholes'
    ];

    fields.forEach(field => {
        const response = formData[field] === 'yes' ? 'Yes' : 'No';
        doc.text(`${field.replace(/([A-Z])/g, ' $1')}: ${response}`);

        if (formData[field] === 'yes' && formData[`${field}Description`]) {
            doc.text(`Description: ${formData[`${field}Description`]}`);
        }
    });

      // ✅ Embed all photos
      if (photoBuffers.length > 0) {
        photoBuffers.forEach((photo, index) => {
          const imageBuffer = Buffer.from(photo, 'base64');
          doc.addPage();
          doc.image(imageBuffer, { fit: [500, 500], align: 'center', valign: 'center' });
          doc.moveDown(1);
          doc.text(`Attached Photo #${index + 1}`, { align: 'center' });
        });
      }
  
      doc.end();
  
      pdfStream.on('finish', () => resolve({ pdfStream: fs.createReadStream(filePath), filePath, fileName }));
      pdfStream.on('error', reject);
    });
  }
  

module.exports = { generateChecklistPDF };
