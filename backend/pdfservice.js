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

        // ✅ Title
        doc.fontSize(20).text('Commercial Property Inspection Checklist', { align: 'center' });
        doc.moveDown(1);
        
        // ✅ General Information
        doc.fontSize(14).text(`Business Name: ${formData.businessName || 'N/A'}`);
        doc.text(`Property Address: ${formData.propertyAddress || 'N/A'}`);
        doc.text(`Fire Safety Measures: ${formData.fireSafetyMeasures || 'N/A'}`);
        doc.text(`Security Systems: ${formData.securitySystems || 'N/A'}`);
        doc.text(`Maintenance Schedule: ${formData.maintenanceSchedule || 'N/A'}`);
        doc.moveDown(1);

        // ✅ Additional Notes Section
        doc.fontSize(14).text('Additional Notes:', { underline: true });
        doc.text(`${formData.additionalNotes || 'None'}`);
        doc.moveDown(1);

        // ✅ Property Condition Checks
        const conditionFields = [
            { label: "Parking Lot Lights", key: "parkingLotLights" },
            { label: "Under Canopy Lights / Tenant Signs", key: "underCanopyLights" },
            { label: "Graffiti", key: "graffiti" },
            { label: "Water Leaks", key: "waterLeaks" },
            { label: "Dangerous Trees", key: "dangerousTrees" },
            { label: "Broken Parking Lot Curbing", key: "brokenCurbs" },
            { label: "Major Potholes", key: "potholes" },
        ];

        conditionFields.forEach(field => {
            doc.fontSize(14).text(`${field.label}: ${formData[field.key] || 'N/A'}`);
            if (formData[`${field.key}Description`]) {
                doc.fontSize(12).text(`  - Description: ${formData[`${field.key}Description`]}`);
            }
            doc.moveDown(0.5);
        });

        doc.moveDown(1);

        // ✅ Embed Photos with Labels
        if (photoBuffers.length > 0) {
            doc.addPage(); // Start a new page for photos
            doc.fontSize(16).text('Inspection Photos:', { underline: true });
            doc.moveDown(1);

            photoBuffers.forEach((photo, index) => {
                const fieldLabel = conditionFields[index]?.label || `Photo ${index + 1}`;
                
                doc.fontSize(14).text(fieldLabel, { underline: true });
                doc.moveDown(0.5);

                try {
                    const imageBuffer = Buffer.from(photo, 'base64');
                    doc.image(imageBuffer, {
                        fit: [450, 300], // Resize image
                        align: 'center',
                        valign: 'center'
                    });
                } catch (error) {
                    doc.fontSize(12).fillColor('red').text(`⚠️ Error embedding image: ${fieldLabel}`);
                    console.error(`❌ Error embedding image for ${fieldLabel}:`, error);
                }

                doc.moveDown(1);
            });
        }

        doc.end();

        pdfStream.on('finish', () => resolve({ pdfStream: fs.createReadStream(filePath), filePath, fileName })); // ✅ Return the correct filename
        pdfStream.on('error', reject);
    });
}

module.exports = { generateChecklistPDF };
