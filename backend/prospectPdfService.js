const PDFDocument = require("pdfkit");

const NAVY = "#17324D";
const SLATE = "#475569";
const ORANGE = "#D97706";
const LINE = "#D7DEE7";

function addFooter(doc, businessName) {
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    const y = doc.page.height - 35;
    doc.moveTo(44, y - 7).lineTo(doc.page.width - 44, y - 7).strokeColor(LINE).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(SLATE)
      .text(`${businessName} | Complimentary exterior assessment`, 44, y, { width: 350 });
    doc.text(`Page ${page + 1} of ${range.count}`, 430, y, { width: 120, align: "right" });
  }
}

function ensureSpace(doc, height) {
  if (doc.y + height > doc.page.height - 65) doc.addPage();
}

function generateProspectAssessmentPDF({ assessment, photoBuffers = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 44, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.rect(0, 0, doc.page.width, 118).fill(NAVY);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(20)
      .text(assessment.templateSnapshot.title, 44, 38, { width: 510 });
    doc.font("Helvetica").fontSize(10).text("Prepared by Afterlight", 44, 76);
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(17)
      .text(assessment.businessName, 44, 145);
    doc.fillColor(SLATE).font("Helvetica").fontSize(10)
      .text(assessment.propertyAddress, 44, 172);
    doc.text(`Assessment date: ${new Date(assessment.createdAt).toLocaleDateString("en-US")}`, 44, 190);
    doc.moveDown(3);
    doc.fillColor(SLATE).fontSize(9)
      .text("This limited visual assessment reflects conditions observable from publicly accessible or authorized areas. It is not a code, safety, engineering, or comprehensive property inspection.");
    doc.moveDown(1.5);

    const fields = assessment.templateSnapshot.fields || [];
    const photosByField = new Map();
    photoBuffers.forEach((photo) => {
      const group = photosByField.get(photo.fieldName) || [];
      group.push(photo.imageBuffer);
      photosByField.set(photo.fieldName, group);
    });

    fields.forEach((field) => {
      const value = String(assessment.responses[field.key] || "").trim();
      const description = String(assessment.responses[`${field.key}Description`] || "").trim();
      if (!value && !description) return;
      if (field.type === "yes_no_issue" && value.toLowerCase() !== "yes") return;
      ensureSpace(doc, 65);
      const findingY = doc.y;
      doc.rect(44, findingY, 4, 35).fill(ORANGE);
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11)
        .text(field.reportLabel || field.label, 58, findingY, { width: 485 });
      doc.fillColor(SLATE).font("Helvetica").fontSize(9)
        .text(description || value, 58, findingY + 18, { width: 485 });
      doc.y = Math.max(doc.y, findingY + 43);
      doc.moveDown(1.4);
      for (const buffer of photosByField.get(field.key) || []) {
        ensureSpace(doc, 230);
        try {
          doc.image(buffer, 58, doc.y, { fit: [470, 215], align: "center" });
          doc.y += 225;
        } catch {
          doc.fillColor(SLATE).text("A submitted image could not be rendered.");
        }
      }
      doc.moveDown(0.6);
    });

    addFooter(doc, assessment.businessName);
    doc.end();
  });
}

module.exports = { generateProspectAssessmentPDF };
