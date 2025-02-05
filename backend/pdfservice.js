// pdfservice.js
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

    // 1) Checklist Title
    doc.fontSize(20).text('Commercial Property Inspection Checklist', { align: 'center' });
    doc.moveDown(1);

    // 2) Render text fields as before (omitted here for brevity)
    // e.g., your fieldMappings loop
    // ...

    // 3) Group and render photos by fieldName
    if (photoBuffers && photoBuffers.length > 0) {
      // Start a new page for images (optional)
      doc.addPage();
      doc.fontSize(18).text('Inspection Photos', { underline: true });
      doc.moveDown(1);

      // Group images by fieldName
      const grouped = {};
      photoBuffers.forEach(({ fieldName, imageBuffer }) => {
        // If the buffer is empty, skip
        if (!imageBuffer || imageBuffer.length === 0) {
          console.error(`❌ Skipping empty buffer for field "${fieldName}"`);
          return;
        }
        if (!grouped[fieldName]) {
          grouped[fieldName] = [];
        }
        grouped[fieldName].push(imageBuffer);
      });

      // Iterate each field in grouped
      Object.keys(grouped).forEach((field) => {
        // Field header
        doc.fontSize(16).text(`Photos for: ${field}`, { bold: true, underline: true });
        doc.moveDown(1);

        const buffers = grouped[field];
        buffers.forEach((buffer, idx) => {
          // If near the bottom of the page, add a new page
          if (doc.y + 320 > doc.page.height - 50) {
            doc.addPage();
            doc.moveDown(1);
          }

          // Label each image
          doc.fontSize(12).text(`Image #${idx + 1}`);
          doc.moveDown(0.5);

          // Draw the image
          doc.image(buffer, {
            fit: [640, 480],
            align: 'center',
          });

          doc.moveDown(50); // space before the next image
        });

        // Add some vertical space before the next field's images
        doc.moveDown(1);
      });
    } else {
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
