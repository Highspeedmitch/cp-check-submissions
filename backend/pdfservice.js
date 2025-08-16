const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const pdfStorageDir = path.join(__dirname, 'pdfstore');

// Helper: get AZ timestamp for filename and display
function getAZTimestamps(date = new Date()) {
  const tz = 'America/Phoenix';

  // Parts for filename (YYYY-MM-DD_HH-mm-ss)
  const partsFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (t) => partsFmt.find(p => p.type === t)?.value;

  const y = get('year');
  const m = get('month');
  const d = get('day');
  const hh = get('hour');
  const mm = get('minute');
  const ss = get('second');

  const filenameStamp = `${y}-${m}-${d}_${hh}-${mm}-${ss}-AZMT`;

  // Friendly display string (e.g., August 16, 2025, 2:07 PM)
  const displayFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const displayStamp = `${displayFmt.format(date)} AZMT`;

  return { filenameStamp, displayStamp };
}

function generateChecklistPDF(formData, photoBuffers) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });

    if (!fs.existsSync(pdfStorageDir)) {
      fs.mkdirSync(pdfStorageDir, { recursive: true });
    }

    // If you ever pass an explicit inspection time from the client, prefer that here:
    // const sourceDate = formData?.submittedAt ? new Date(formData.submittedAt) : new Date();
    const sourceDate = new Date();
    const { filenameStamp, displayStamp } = getAZTimestamps(sourceDate);

    const fileName = `checklist-${filenameStamp}.pdf`;
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
    doc.moveDown(0.5);
    // NEW: show AZMT submission time prominently
    doc.fontSize(12).text(`Submission Timestamp (AZMT): ${displayStamp}`, { align: 'center' });
    doc.moveDown(1);

    // ✅ Print the text fields dynamically
    Object.keys(fieldMappings).forEach(field => {
      const displayName = fieldMappings[field];
      const value = formData[field] || "N/A";

      doc.fontSize(14).text(`${displayName}: ${value}`);
      if (formData[`${field}Description`]) {
        doc.fontSize(12).text(`  Description: ${formData[`${field}Description`]}`);
      }
      doc.moveDown(0.5);
    });

    // ✅ Handle photos dynamically
    if (photoBuffers && photoBuffers.length > 0) {
      const grouped = {};
      photoBuffers.forEach(({ fieldName, imageBuffer }) => {
        if (!imageBuffer || imageBuffer.length === 0) return;
        if (!grouped[fieldName]) grouped[fieldName] = [];
        grouped[fieldName].push(imageBuffer);
      });

      Object.keys(grouped).forEach(field => {
        doc.addPage();
        doc.fontSize(16).text(`Photos for: ${field}`, { underline: true });
        doc.moveDown(1);

        const buffers = grouped[field];
        buffers.forEach((buffer, idx) => {
          if (doc.y + 480 > doc.page.height - 50) {
            doc.addPage();
            doc.moveDown(1);
          }
          doc.fontSize(12).text(`Image #${idx + 1}`);
          doc.moveDown(0.5);
          doc.image(buffer, { fit: [640, 480], align: 'center' });
          doc.moveDown(50);
        });

        doc.moveDown(2);
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
