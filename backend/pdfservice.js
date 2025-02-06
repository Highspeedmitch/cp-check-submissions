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

    // 1) Title
    doc.fontSize(20).text('Commercial Property Inspection Checklist', { align: 'center' });
    doc.moveDown(1);

    // 2) Print the text fields
    const fieldMappings = {
      businessName:        "Business Name",
      propertyAddress:     "Property Address",
      homelessActivity:    "Any Homeless Activity?",
      additionalComments:  "Any Additional Comments?",
      parkingLotLights:    "Parking Lot Lights out?",
      securityLights:      "Security Lights out?",
      underCanopyLights:   "Under Canopy Lights out?",
      tenantSigns:         "Tenant signs out?",
      graffiti:            "Graffiti around the property?",
      dumpsters:           "Trash overflowing from Dumpsters?",
      trashCans:           "Trash overflowing from Trashcans?",
      waterLeaks:          "General Water Leaks?",
      waterLeaksTenant:    "Tenant Water Leaks?",
      dangerousTrees:      "Dangerous Trees?",
      brokenCurbs:         "Broken Parking Lot Curbing?",
      potholes:            "Major Potholes?"
    };

    // Loop over all fields in `fieldMappings` and print the values from `formData`
    Object.keys(fieldMappings).forEach(field => {
      const displayName = fieldMappings[field];
      const value = formData[field] || "N/A";

      doc.fontSize(14).text(`${displayName}: ${value}`);
      // If there's a description (e.g., waterLeaksDescription), print that
      if (formData[`${field}Description`]) {
        doc.fontSize(12).text(`  Description: ${formData[`${field}Description`]}`);
      }

      doc.moveDown(0.5);
    });

    // 3) Group and render photos by fieldName
    if (photoBuffers && photoBuffers.length > 0) {
      // Optional: add some vertical space or a new page
      // doc.addPage(); // Use doc.addPage() only if you want photos always on a separate page
      doc.moveDown(2);
      doc.fontSize(18).text('Inspection Photos', { underline: true });
      doc.moveDown(1);

      // Group images
      const grouped = {};
      photoBuffers.forEach(({ fieldName, imageBuffer }) => {
        if (!imageBuffer || imageBuffer.length === 0) {
          return; // skip empty buffers
        }
        if (!grouped[fieldName]) {
          grouped[fieldName] = [];
        }
        grouped[fieldName].push(imageBuffer);
      });

      // Print each field’s photos
      Object.keys(grouped).forEach(field => {
        doc.fontSize(16).text(`Photos for: ${field}`, { bold: true, underline: true });
        doc.moveDown(1);

        const buffers = grouped[field];
        buffers.forEach((buffer, idx) => {
          // If near bottom, add a new page
          if (doc.y + 480 > doc.page.height - 50) {
            doc.addPage();
            doc.moveDown(1);
          }

          doc.fontSize(12).text(`Image #${idx + 1}`);
          doc.moveDown(0.5);

          doc.image(buffer, {
            fit: [640, 480],
            align: 'center',
          });

          // Add space
          doc.moveDown(50);
        });

        doc.moveDown(2); // space before the next field’s photos
      });

    } else {
      doc.moveDown(1);
      doc.fontSize(14).text("No photos uploaded.", { italic: true });
    }

    // 4) Finalize
    doc.end();

    pdfStream.on('finish', () => {
      resolve({ pdfStream: fs.createReadStream(filePath), filePath, fileName });
    });
    pdfStream.on('error', reject);
  });
}

module.exports = { generateChecklistPDF };
