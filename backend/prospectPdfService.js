const path = require("path");
const { generateChecklistPDF } = require("./pdfservice");

async function generateProspectAssessmentPDF({ assessment, photoBuffers = [] }) {
  const reportIdentity = assessment.businessName
    || assessment.propertyAddress
    || "Prospective Property";
  const result = await generateChecklistPDF({
    ...assessment.responses,
    selectedProperty: reportIdentity,
    businessName: assessment.businessName,
    propertyAddress: assessment.propertyAddress,
    submittedAt: assessment.createdAt,
    orgType: "COM",
  }, photoBuffers, assessment.templateSnapshot, {
    reportTitle: assessment.templateSnapshot.title
      || "Complimentary Exterior Property Assessment",
    headerSubtitle: "PROPERTY OPPORTUNITY REPORT",
    detailTitle: "Opportunities & Photo Evidence",
    findingsTitle: "Observed Opportunities",
    resultsTitle: "Assessment Results",
    footerLabel: "Complimentary Exterior Assessment",
    onlyAssessed: true,
    logoPath: path.resolve(__dirname, "../Frontend/public/apple-touch-icon.png"),
    notice: "Limited exterior visual assessment; not a code, safety, engineering, or comprehensive inspection.",
  });
  return result.pdfBuffer;
}

module.exports = { generateProspectAssessmentPDF };
