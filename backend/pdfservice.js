const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const pdfStorageDir = path.join(__dirname, 'pdfstore'); // Ensure PDFs save in backend/pdfstore

function generateChecklistPDF(formData) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });

        if (!fs.existsSync(pdfStorageDir)) {
            fs.mkdirSync(pdfStorageDir, { recursive: true });
        }

        const fileName = `checklist-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
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

        doc.end();

        pdfStream.on('finish', () => resolve(fs.createReadStream(filePath))); // ✅ Return readable stream
        pdfStream.on('error', reject);
    });
}

module.exports = { generateChecklistPDF };
