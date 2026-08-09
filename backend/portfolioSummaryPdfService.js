const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const LOGO_PATH = path.resolve(__dirname, "../Frontend/public/apple-touch-icon.png");
const COLORS = {
  navy: "#17324D",
  navyDark: "#10263A",
  blue: "#0F7EF2",
  ink: "#17212B",
  slate: "#425466",
  muted: "#6B7785",
  line: "#D5DCE3",
  panel: "#F4F7FA",
  green: "#258A48",
  orange: "#D96716",
  white: "#FFFFFF",
};

function safeFilenameSegment(value, fallback = "Portfolio") {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90)
    .trim();
  return normalized || fallback;
}

function portfolioSummaryFileName(report) {
  return `${safeFilenameSegment(report.organizationName)} - ${safeFilenameSegment(report.periodLabel, "Monthly")} Portfolio Summary.pdf`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function drawHeader(doc) {
  doc.save().rect(0, 0, doc.page.width, 88).fill(COLORS.navyDark).restore();
  if (fs.existsSync(LOGO_PATH)) {
    doc.save();
    doc.roundedRect(42, 22, 42, 42, 7).clip();
    doc.image(LOGO_PATH, 42, 22, { width: 42, height: 42 });
    doc.restore();
  }
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(15).text("AFTERLIGHT", 98, 26);
  doc.fillColor("#C8D9EA").font("Helvetica").fontSize(8.5).text("MONTHLY PORTFOLIO REPORTING", 98, 47);
}

function drawSectionTitle(doc, title, subtitle, y) {
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(16).text(title, 42, y);
  if (subtitle) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9.5).text(subtitle, 42, y + 23, { width: 510 });
  }
  return y + (subtitle ? 52 : 30);
}

function drawMetricCard(doc, { x, y, width, label, value, context }) {
  doc.save().roundedRect(x, y, width, 82, 7).fillAndStroke(COLORS.panel, COLORS.line).restore();
  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(label.toUpperCase(), x + 12, y + 12, { width: width - 24 });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(22).text(String(value), x + 12, y + 30, { width: width - 24 });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5).text(context, x + 12, y + 61, { width: width - 24 });
}

function drawBulletList(doc, title, items, x, y, width, accent) {
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(11).text(title, x, y);
  let cursor = y + 21;
  if (!items.length) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text("No items were recorded for this section.", x, cursor, { width });
    return cursor + 28;
  }
  items.forEach((item) => {
    doc.save().circle(x + 4, cursor + 5, 3).fill(accent).restore();
    doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8.8).text(item, x + 14, cursor, {
      width: width - 14,
      lineGap: 2,
    });
    cursor += doc.heightOfString(item, { width: width - 14, lineGap: 2 }) + 11;
  });
  return cursor;
}

function deltaLabel(value) {
  const amount = Number(value || 0);
  if (!amount) return "No change";
  return `${amount > 0 ? "+" : ""}${formatNumber(amount)}`;
}

function drawCoverPage(doc, report) {
  drawHeader(doc);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(25)
    .text("Monthly Executive Portfolio Summary", 42, 116, { width: 520 });
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(10.5)
    .text(`${report.periodLabel} | ${report.organizationName}`, 42, 151, { width: 520 });
  doc.fillColor(COLORS.muted).fontSize(9)
    .text(`Prepared for ${report.recipientSnapshot.name} | Reporting timezone: ${report.reportingTimezone}`, 42, 170, { width: 520 });

  const metrics = report.metrics;
  const cardWidth = 124;
  const cardGap = 8;
  drawMetricCard(doc, {
    x: 42, y: 205, width: cardWidth,
    label: "Submitted reports", value: formatNumber(metrics.submissionCount),
    context: `${deltaLabel(report.comparison.submissionCountDelta)} month over month`,
  });
  drawMetricCard(doc, {
    x: 42 + cardWidth + cardGap, y: 205, width: cardWidth,
    label: "Portfolio coverage", value: `${metrics.propertiesWithSubmissionsCount}/${metrics.managedPropertyCount}`,
    context: "Managed properties with a submission",
  });
  drawMetricCard(doc, {
    x: 42 + (cardWidth + cardGap) * 2, y: 205, width: cardWidth,
    label: "With issues", value: `${formatNumber(metrics.inspectionsWithIssuesPercent)}%`,
    context: `${metrics.inspectionsWithIssuesCount} of ${metrics.reportableSubmissionCount} reportable`,
  });
  drawMetricCard(doc, {
    x: 42 + (cardWidth + cardGap) * 3, y: 205, width: cardWidth,
    label: "Issue occurrences", value: formatNumber(metrics.totalIssueOccurrences),
    context: `${deltaLabel(report.comparison.totalIssueOccurrencesDelta)} month over month`,
  });

  let y = drawSectionTitle(
    doc,
    "Executive Overview",
    "A concise interpretation of the deterministic portfolio metrics shown in this report.",
    315
  );
  doc.save().roundedRect(42, y, 510, 115, 7).fillAndStroke(COLORS.panel, COLORS.line).restore();
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(10)
    .text(report.narrative.executiveSummary, 57, y + 16, { width: 480, lineGap: 3 });
  y += 137;

  const leftY = drawBulletList(doc, "Highlights", report.narrative.highlights || [], 42, y, 238, COLORS.green);
  const rightY = drawBulletList(doc, "Areas to Review", report.narrative.attentionAreas || [], 314, y, 238, COLORS.orange);
  y = Math.max(leftY, rightY) + 10;

  if (report.narrative.disclaimer) {
    doc.fillColor(COLORS.muted).font("Helvetica-Oblique").fontSize(7.5)
      .text(report.narrative.disclaimer, 42, Math.min(y, 742), { width: 510 });
  }
}

function addDetailPage(doc, title, subtitle) {
  doc.addPage();
  drawHeader(doc);
  return drawSectionTitle(doc, title, subtitle, 112);
}

function drawPropertyActivity(doc, report) {
  let y = addDetailPage(
    doc,
    "Property Activity",
    "Counts reflect records captured for the report month and do not represent a safety or compliance score."
  );
  const columns = [
    { label: "Property", x: 42, width: 214, key: "name", align: "left" },
    { label: "Scheduled", x: 266, width: 60, key: "scheduledInspectionCount", align: "right" },
    { label: "Completed", x: 336, width: 60, key: "completedAssignmentCount", align: "right" },
    { label: "Reports", x: 406, width: 55, key: "submissionCount", align: "right" },
    { label: "Issues", x: 471, width: 50, key: "issueOccurrenceCount", align: "right" },
  ];

  const drawTableHeader = () => {
    doc.save().rect(42, y, 510, 27).fill(COLORS.navy).restore();
    columns.forEach((column) => {
      doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5)
        .text(column.label.toUpperCase(), column.x + 6, y + 9, {
          width: column.width - 12,
          align: column.align,
        });
    });
    y += 27;
  };
  drawTableHeader();

  report.metrics.propertyActivity.forEach((property, index) => {
    if (y > 730) {
      y = addDetailPage(doc, "Property Activity", "Continued from the previous page.");
      drawTableHeader();
    }
    if (index % 2 === 0) doc.save().rect(42, y, 510, 29).fill(COLORS.panel).restore();
    columns.forEach((column) => {
      const value = column.key === "name" ? property[column.key] : formatNumber(property[column.key]);
      doc.fillColor(COLORS.slate).font(column.key === "name" ? "Helvetica-Bold" : "Helvetica").fontSize(8)
        .text(value, column.x + 6, y + 9, {
          width: column.width - 12,
          align: column.align,
          ellipsis: true,
        });
    });
    doc.save().moveTo(42, y + 29).lineTo(552, y + 29).strokeColor(COLORS.line).lineWidth(0.5).stroke().restore();
    y += 29;
  });

  y += 25;
  if (y > 670) y = addDetailPage(doc, "Issue Trends", "Current-month checklist fields marked as issues.");
  else y = drawSectionTitle(doc, "Issue Trends", "Current-month checklist fields marked as issues.", y);
  const issues = report.metrics.issues.slice(0, 12);
  if (!issues.length) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9)
      .text("No structured issue responses were recorded for this period.", 42, y, { width: 510 });
  } else {
    issues.forEach((issue) => {
      if (y > 744) y = addDetailPage(doc, "Issue Trends", "Continued from the previous page.");
      doc.fillColor(COLORS.slate).font("Helvetica-Bold").fontSize(8.5)
        .text(issue.label, 42, y, { width: 330 });
      doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8.5)
        .text(`${issue.occurrences} occurrences | ${issue.propertyCount} properties`, 382, y, { width: 170, align: "right" });
      y += 20;
    });
  }
}

function drawFooters(doc, report) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.save().moveTo(42, 752).lineTo(552, 752).strokeColor(COLORS.line).lineWidth(0.5).stroke().restore();
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
      .text(`Afterlight | ${report.periodLabel} portfolio snapshot`, 42, 760, { width: 390, lineBreak: false });
    doc.text(`Page ${index + 1} of ${range.count}`, 452, 760, { width: 100, align: "right", lineBreak: false });
  }
}

function generateMonthlyPortfolioSummaryPDF(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 42, right: 42, bottom: 20, left: 42 },
      bufferPages: true,
      info: {
        Title: `${report.periodLabel} Monthly Executive Portfolio Summary`,
        Author: "Afterlight",
        Subject: `Portfolio reporting for ${report.organizationName}`,
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve({
      pdfBuffer: Buffer.concat(chunks),
      fileName: portfolioSummaryFileName(report),
    }));

    drawCoverPage(doc, report);
    drawPropertyActivity(doc, report);
    drawFooters(doc, report);
    doc.end();
  });
}

module.exports = {
  portfolioSummaryFileName,
  generateMonthlyPortfolioSummaryPDF,
};
