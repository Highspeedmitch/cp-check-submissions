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
            
            if (formData[`${field}Description`]) {
                doc.fontSize(12).text(`  Description: ${formData[`${field}Description`]}`);
            }

            doc.moveDown(0.5);
        });

        // ✅ Add images with correct labels
        // ✅ Add images with correct labels
if (photoBuffers && photoBuffers.length > 0) {
  doc.addPage(); 
  doc.fontSize(18).text('Inspection Photos', { underline: true });
  doc.moveDown(1);

  photoBuffers.forEach(({ fieldName, imageBuffer }, index) => {
    if (!imageBuffer || imageBuffer.length === 0) {
        console.error(`❌ Skipping image ${fieldName}: Empty buffer detected`);
        return;
    }

    try {
        // Check if there's enough space left, otherwise, add a new page
        if (doc.y + 320 > doc.page.height - 50) {
            doc.addPage();
            doc.moveDown(1);
        }

        doc.fontSize(14).text(`Photo for: ${fieldName}`, { bold: true, align: 'left' });
        doc.moveDown(0.5);

        doc.image(imageBuffer, {
            fit: [400, 300],
            align: 'center',
            padding:'300',
        });

        doc.moveDown(2); // ✅ Space before the next image

    } catch (error) {
        console.error(`❌ Error embedding image for ${fieldName}:`, error);
    }
});
}
else {
            doc.fontSize(14).text("No photos uploaded.", { italic: true });
        }

        doc.end();

        pdfStream.on('finish', () => resolve({ pdfStream: fs.createReadStream(filePath), filePath, fileName }));
        pdfStream.on('error', reject);
    });
}

module.exports = { generateChecklistPDF };
