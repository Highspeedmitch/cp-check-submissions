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

        const fieldMappings = {
            businessName: "Business Name",
            propertyAddress: "Property Address",
            fireSafetyMeasures: "Fire Safety Measures",
            securitySystems: "Security Systems",
            maintenanceSchedule: "Maintenance Schedule",
            additionalNotes: "Additional Notes",
            parkingLotLights: "Parking Lot Lights",
            underCanopyLights: "Under Canopy Lights",
            graffiti: "Graffiti",
            parkingBumpers: "Parking Bumpers",
            dumpsters: "Dumpsters",
            waterLeaks: "Water Leaks",
            dangerousTrees: "Dangerous Trees",
            trashCans: "Trash Cans",
            brokenCurbs: "Broken Parking Lot Curbing",
            potholes: "Major Potholes"
        };

        Object.keys(fieldMappings).forEach(field => {
            const displayName = fieldMappings[field];
            const value = formData[field] || "N/A";
            doc.fontSize(14).text(`${displayName}: ${value}`);
            
            // Check if there's a description field for this input
            if (formData[`${field}Description`]) {
                doc.fontSize(12).text(`  Description: ${formData[`${field}Description`]}`);
            }

            doc.moveDown(0.5);
        });

        // ✅ Ensure photos exist before adding a new page
        if (photoBuffers && photoBuffers.length > 0) {
            doc.addPage(); // Move photos to a new page
            doc.fontSize(18).text('Inspection Photos', { underline: true });
            doc.moveDown(1);

            photoBuffers.forEach(({ fieldName, imageBuffer }) => {
                if (!imageBuffer || imageBuffer.length === 0) {
                    console.error(`❌ Skipping image ${fieldName}: Empty buffer detected`);
                    return;
                }

                try {
                    doc.fontSize(14).text(`Photo: ${fieldMappings[fieldName] || fieldName}`, { bold: true }); // Label for the image
                    doc.moveDown(0.3);
                    
                    // Embed the image
                    doc.image(imageBuffer, {
                        fit: [400, 300], // Resize images to fit
                        align: 'center',
                        valign: 'center'
                    });
                    doc.moveDown(1.5); // Space after each image
                } catch (error) {
                    console.error(`❌ Error embedding image for ${fieldName}:`, error);
                }
            });
        } else {
            doc.fontSize(14).text("No photos uploaded.", { italic: true });
        }

        doc.end();

        pdfStream.on('finish', () => resolve({ pdfStream: fs.createReadStream(filePath), filePath, fileName }));
        pdfStream.on('error', reject);
    });
}

module.exports = { generateChecklistPDF };
