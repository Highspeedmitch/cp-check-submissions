const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const pdfStorageDir = path.join(__dirname, 'pdfstore'); // Ensure PDFs save in backend/pdfstore

function generateChecklistPDF(formData, photoBuffers) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });

        if (!fs.existsSync(pdfStorageDir)) {
            fs.mkdirSync(pdfStorageDir, { recursive: true });
        }

        // ✅ Generate timestamp-based filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `checklist-${timestamp}.pdf`;
        const filePath = path.join(pdfStorageDir, fileName);
        const pdfStream = fs.createWriteStream(filePath);

        doc.pipe(pdfStream);

        // ✅ Add all fields to the PDF
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

        // ✅ Include all condition checks
        const fields = [
            "Parking Lot Lights", "Under Canopy Lights", "Graffiti", "Parking Bumpers",
            "Dumpsters", "Water Leaks", "Dangerous Trees", "Trash Cans",
            "Broken Parking Lot Curbing", "Major Potholes"
        ];

        fields.forEach(field => {
            const fieldName = field.replace(/ /g, ""); // Remove spaces for formData key matching
            if (formData[fieldName]) {
                doc.text(`${field}: ${formData[fieldName] || 'N/A'}`);
                if (formData[`${fieldName}Description`]) {
                    doc.text(`Description: ${formData[`${fieldName}Description`]}`);
                }
                doc.moveDown(0.5);
            }
        });

        // ✅ Add photos with labels
        if (photoBuffers && photoBuffers.length > 0) {
            doc.addPage(); // Move photos to a new page
            doc.fontSize(18).text('Inspection Photos', { underline: true });
            doc.moveDown(1);

            photoBuffers.forEach(({ fieldName, imageBuffer }, index) => {
                if (!imageBuffer || imageBuffer.length === 0) {
                    console.error(`❌ Skipping image ${fieldName}: Empty buffer detected`);
                    return;
                }

                try {
                    doc.fontSize(14).text(`${fieldName}`, { bold: true }); // Label for the image
                    doc.moveDown(0.3);
                    doc.image(imageBuffer, {
                        fit: [400, 300], // Reduce size for better layout
                        align: 'center'
                    });
                    doc.moveDown(1.5); // Space after each image
                } catch (error) {
                    console.error(`❌ Error embedding image for ${fieldName}:`, error);
                }
            });
        }

        doc.end();

        pdfStream.on('finish', () => resolve({ pdfStream: fs.createReadStream(filePath), filePath, fileName }));
        pdfStream.on('error', reject);
    });
}

module.exports = { generateChecklistPDF };
