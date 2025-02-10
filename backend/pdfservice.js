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

    // ✅ Extract orgType from formData
    const orgType = formData.orgType || "COM";
    console.log(`📌 Generating PDF for orgType: ${orgType}`);

    // ✅ Define field mappings dynamically based on orgType
    let title = "Property Inspection Checklist";
    let fieldMappings = {};

    switch (orgType) {
      case "COM":
        title = "Commercial Property Inspection Checklist";
        fieldMappings = {
          businessName: "Business Name",
          propertyAddress: "Property Address",
          homelessActivity: "Any Homeless Activity?",
          additionalComments: "Additional Comments",
          parkingLotLights: "Parking Lot Lights out?",
          securityLights: "Security Lights out?",
          underCanopyLights: "Under Canopy Lights out?",
          tenantSigns: "Tenant Signs out?",
          graffiti: "Graffiti on property?",
          dumpsters: "Trash overflowing from Dumpsters?",
          trashCans: "Trash overflowing from Trashcans?",
          waterLeaks: "General Water Leaks?",
          waterLeaksTenant: "Tenant-Specific Water Leaks?",
          dangerousTrees: "Dangerous Trees?",
          brokenCurbs: "Broken Parking Lot Curbing?",
          potholes: "Major Potholes?"
        };
        break;

      case "LTR":
        title = "Long-Term Rental Inspection Checklist";
        fieldMappings = {
          businessName: "Property Name",
          propertyAddress: "Property Address",
          toiletriesStocked: "Toiletries Need Re-stocked?",
          furnitureCorrect: "Furniture in Correct Place?",
          checkoutProcedure: "Guest Checkout Procedure Followed?",
          propertyDamage: "Any Damage to Property?",
          additionalComments: "Additional Comments"
        };
        break;

      case "RES":
        title = "Residential Property Inspection Checklist";
        fieldMappings = {
          businessName: "Property Name",
          propertyAddress: "Property Address",
          lawnCondition: "Lawn and Landscaping Condition?",
          plumbingLeaks: "Any Plumbing Leaks?",
          electricalIssues: "Electrical Issues Present?",
          HVACWorking: "HVAC System Functional?",
          additionalComments: "Additional Comments"
        };
        break;

      case "STR":
        title = "Short-Term Rental Inspection Checklist";
        fieldMappings = {
          businessName: "Property Name",
          propertyAddress: "Property Address",
          toiletriesStocked: "Toiletries Need Re-stocked?",
          furnitureCorrect: "Furniture in Correct Place?",
          checkoutProcedure: "Guest Checkout Procedure Followed?",
          propertyDamage: "Any Damage to Property?",
          additionalComments: "Additional Comments"
        };
        break;

      default:
        console.warn("⚠️ Unknown orgType, defaulting to Commercial fields.");
        fieldMappings = {
          businessName: "Business Name",
          propertyAddress: "Property Address",
          additionalComments: "Additional Comments"
        };
    }

    // ✅ Title
    doc.fontSize(20).text(title, { align: 'center' });
    doc.moveDown(1);

    // ✅ Print the text fields dynamically
    Object.keys(fieldMappings).forEach(field => {
      const displayName = fieldMappings[field];
      const value = formData[field] || "N/A";

      doc.fontSize(14).text(`${displayName}: ${value}`);
      // If there's a description (e.g., plumbingLeaksDescription), print that
      if (formData[`${field}Description`]) {
        doc.fontSize(12).text(`  Description: ${formData[`${field}Description`]}`);
      }

      doc.moveDown(0.5);
    });

    // ✅ Handle photos dynamically
    if (photoBuffers && photoBuffers.length > 0) {
      // Group images by field name
      const grouped = {};
      photoBuffers.forEach(({ fieldName, imageBuffer }) => {
        if (!imageBuffer || imageBuffer.length === 0) {
          return; // Skip empty buffers
        }
        if (!grouped[fieldName]) {
          grouped[fieldName] = [];
        }
        grouped[fieldName].push(imageBuffer);
      });

      // Loop through grouped images and add them to the PDF
      Object.keys(grouped).forEach(field => {
        doc.addPage();
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

          // Add spacing
          doc.moveDown(50);
        });

        doc.moveDown(2); // Space before the next field’s page
      });

    } else {
      doc.moveDown(1);
      doc.fontSize(14).text("No photos uploaded.", { italic: true });
    }

    // ✅ Finalize
    doc.end();

    pdfStream.on('finish', () => {
      resolve({ pdfStream: fs.createReadStream(filePath), filePath, fileName });
    });
    pdfStream.on('error', reject);
  });
}

module.exports = { generateChecklistPDF };
