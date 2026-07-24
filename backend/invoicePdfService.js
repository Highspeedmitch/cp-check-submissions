const PDFDocument = require("pdfkit");

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format(cents / 100);
}

function generateInvoicePDF(invoice, submitter) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const property = invoice.propertySnapshot;
    doc.fontSize(22).text("PROPERTY INSPECTION INVOICE", { align: "center" });
    doc.moveDown();
    doc.fontSize(11)
      .text(`Invoice: ${invoice.invoiceNumber}`)
      .text(`Invoice date: ${new Date().toLocaleDateString("en-US")}`)
      .text(`Submitted by: ${submitter.username || submitter.email}`)
      .text(`Submitter email: ${submitter.email}`);
    doc.moveDown();
    doc.fontSize(14).text("Bill To", { underline: true });
    doc.fontSize(11)
      .text(property.brokerageName || "Brokerage")
      .text(property.name || "")
      .text(property.address || "")
      .text(`Property code: ${property.propertyCode || "Not provided"}`);
    if (property.purchaseOrder) doc.text(`PO / Reference: ${property.purchaseOrder}`);
    doc.moveDown(2);

    const y = doc.y;
    doc.font("Helvetica-Bold")
      .text("Inspection date", 54, y)
      .text("Description", 190, y)
      .text("Amount", 455, y, { width: 100, align: "right" });
    doc.moveTo(54, y + 18).lineTo(558, y + 18).stroke();
    doc.font("Helvetica")
      .text(new Date(invoice.inspectionDate).toLocaleDateString("en-US"), 54, y + 30)
      .text(`Property inspection — ${property.propertyCode}`, 190, y + 30)
      .text(money(invoice.amountCents), 455, y + 30, { width: 100, align: "right" });
    doc.moveDown(5);
    doc.font("Helvetica-Bold").fontSize(14)
      .text(`Total: ${money(invoice.amountCents)}`, { align: "right" });
    if (property.billingInstructions) {
      doc.moveDown(3).font("Helvetica").fontSize(10)
        .text(`Billing instructions: ${property.billingInstructions}`);
    }
    doc.end();
  });
}

module.exports = { generateInvoicePDF };
