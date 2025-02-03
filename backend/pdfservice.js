const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const pdfStorageDir = path.join(__dirname, 'pdfstore');

function generateChecklistPDF(formData, photoBase64) {
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

    doc.text(`Parking Lot Lights: ${formData.parkingLotLights || 'N/A'}`);
    doc.text(`Under Canopy Lights / Tenant Signs: ${formData.underCanopyLights || 'N/A'}`);
    doc.text(`Graffiti: ${formData.graffiti || 'N/A'}`);
    doc.text(`Parking Bumpers: ${formData.parkingBumpers || 'N/A'}`);
    doc.text(`Dumpsters: ${formData.dumpsters || 'N/A'}`);
    doc.text(`Water Leaks: ${formData.waterLeaks || 'N/A'}`);
    doc.text(`Dangerous Trees: ${formData.dangerousTrees || 'N/A'}`);
    doc.text(`Trash Cans: ${formData.trashCans || 'N/A'}`);
    doc.text(`Broken Parking Lot Curbing: ${formData.brokenCurbs || 'N/A'}`);
    doc.text(`Major Potholes: ${formData.potholes || 'N/A'}`);
    
    doc.moveDown(1);

    // ✅ Embed the Photo if Available
    if (photoBase64) {
      const imageBuffer = Buffer.from(photoBase64, 'base64');
      doc.image(imageBuffer, { fit: [1080, 1080], align: 'center', valign: 'center' });
      doc.moveDown(1);
      doc.text('Attached Photo', { align: 'center' });
    }

    doc.end();

    pdfStream.on('finish', () => resolve({ pdfStream: fs.createReadStream(filePath), filePath, fileName }));
    pdfStream.on('error', reject);
  });
}

module.exports = { generateChecklistPDF };
