const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const pdfStorageDir = path.join(__dirname, 'pdfstore');

const COLORS = {
  navy: '#17324D',
  navyDark: '#10263A',
  slate: '#425466',
  muted: '#6B7785',
  line: '#D5DCE3',
  panel: '#F4F7FA',
  green: '#258A48',
  greenLight: '#EAF6EE',
  orange: '#D96716',
  orangeLight: '#FFF1E7',
  gray: '#718096',
  grayLight: '#EEF1F4',
  white: '#FFFFFF',
};

const COM_INSPECTION_FIELDS = [
  { key: 'parkingLotLights', label: 'Parking Lot Lights' },
  { key: 'securityLights', label: 'Rear Security Lights' },
  { key: 'underCanopyLights', label: 'Under-Canopy Lights' },
  { key: 'tenantSigns', label: 'Tenant Signs' },
  { key: 'graffiti', label: 'Graffiti' },
  { key: 'dumpsters', label: 'Dumpsters' },
  { key: 'trashCans', label: 'Sidewalk Trash Cans' },
  { key: 'waterLeaks', label: 'Parking Lot / Irrigation Leaks' },
  { key: 'waterLeaksTenant', label: 'Tenant-Specific Water Leaks' },
  { key: 'dangerousTrees', label: 'Trees & Branches' },
  { key: 'brokenCurbs', label: 'Parking Lot Curbing' },
  { key: 'potholes', label: 'Potholes' },
];

const LEGACY_FIELD_MAPPINGS = {
  LTR: {
    title: 'Long-Term Rental Inspection Checklist',
    fields: {
      businessName: 'Property Name',
      propertyAddress: 'Property Address',
      toiletriesStocked: 'Toiletries Need Re-stocked?',
      furnitureCorrect: 'Furniture in Correct Place?',
      checkoutProcedure: 'Guest Checkout Procedure Followed?',
      propertyDamage: 'Any Damage to Property?',
      additionalComments: 'Additional Comments',
    },
  },
  RES: {
    title: 'Residential Property Inspection Checklist',
    fields: {
      businessName: 'Property Name',
      propertyAddress: 'Property Address',
      lawnCondition: 'Lawn and Landscaping Condition?',
      plumbingLeaks: 'Any Plumbing Leaks?',
      electricalIssues: 'Electrical Issues Present?',
      HVACWorking: 'HVAC System Functional?',
      additionalComments: 'Additional Comments',
    },
  },
  STR: {
    title: 'Short-Term Rental Inspection Checklist',
    fields: {
      businessName: 'Property Name',
      propertyAddress: 'Property Address',
      toiletriesStocked: 'Toiletries Need Re-stocked?',
      furnitureCorrect: 'Furniture in Correct Place?',
      checkoutProcedure: 'Guest Checkout Procedure Followed?',
      propertyDamage: 'Any Damage to Property?',
      additionalComments: 'Additional Comments',
    },
  },
};

function getAZTimestamps(date = new Date()) {
  const timeZone = 'America/Phoenix';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  const filenameStamp = `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}-AZMT`;
  const displayStamp = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  return { filenameStamp, displayStamp: `${displayStamp} AZ` };
}

function cleanValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function hasValue(value) {
  const normalized = cleanValue(value).toLowerCase();
  return normalized !== '' && normalized !== 'n/a' && normalized !== 'none';
}

function truncate(value, maxLength) {
  const text = cleanValue(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function humanizeFieldName(fieldName) {
  const configured = COM_INSPECTION_FIELDS.find((field) => field.key === fieldName);
  if (configured) return configured.label;
  return cleanValue(fieldName)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getCommercialResults(formData) {
  return COM_INSPECTION_FIELDS.map((field) => {
    const rawValue = cleanValue(formData[field.key]).toLowerCase();
    let status = 'not_assessed';
    if (rawValue === 'yes') status = 'attention';
    if (rawValue === 'no') status = 'ok';

    return {
      ...field,
      status,
      description: cleanValue(formData[`${field.key}Description`]),
    };
  });
}

function groupPhotos(photoBuffers) {
  const grouped = {};
  (photoBuffers || []).forEach(({ fieldName, imageBuffer }) => {
    if (!fieldName || !imageBuffer || imageBuffer.length === 0) return;
    if (!grouped[fieldName]) grouped[fieldName] = [];
    grouped[fieldName].push(imageBuffer);
  });
  return grouped;
}

function drawBrandMark(doc, x, y) {
  doc.save();
  doc.lineWidth(2.2).strokeColor(COLORS.white);
  doc.roundedRect(x, y, 42, 42, 7).stroke();
  doc
    .moveTo(x + 10, y + 22)
    .lineTo(x + 18, y + 30)
    .lineTo(x + 33, y + 13)
    .stroke();
  doc.restore();
}

function drawPrimaryHeader(doc) {
  const width = doc.page.width;
  doc.rect(0, 0, width, 88).fill(COLORS.navy);
  drawBrandMark(doc, 44, 23);
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(19)
    .text('INSPECTORS GADGET', 101, 26, { characterSpacing: 0.5 });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .text('PROPERTY INSPECTION REPORT', 102, 53, { characterSpacing: 1.6 });
}

function drawContinuationHeader(doc, propertyName, sectionTitle) {
  const width = doc.page.width;
  doc.rect(0, 0, width, 64).fill(COLORS.navy);
  drawBrandMark(doc, 42, 12);
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(sectionTitle, 98, 16, { width: width - 140 });
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(propertyName, 98, 38, { width: width - 140 });
  return 84;
}

function drawBadge(doc, x, y, width, label, status) {
  const isAttention = status === 'attention';
  const isOk = status === 'ok';
  const background = isAttention ? COLORS.orangeLight : isOk ? COLORS.greenLight : COLORS.grayLight;
  const foreground = isAttention ? COLORS.orange : isOk ? COLORS.green : COLORS.gray;
  doc.roundedRect(x, y, width, 22, 5).fill(background);
  doc
    .fillColor(foreground)
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text(label, x + 7, y + 7, { width: width - 14, align: 'center' });
}

function drawSummaryCard(doc, x, y, width, count, label, status) {
  const color = status === 'attention' ? COLORS.orange : status === 'ok' ? COLORS.green : COLORS.gray;
  doc.roundedRect(x, y, width, 52, 6).fillAndStroke(COLORS.white, COLORS.line);
  doc.circle(x + 25, y + 26, 14).fill(color);
  if (status === 'ok') {
    doc
      .save()
      .lineWidth(2.2)
      .strokeColor(COLORS.white)
      .moveTo(x + 18, y + 26)
      .lineTo(x + 23, y + 31)
      .lineTo(x + 32, y + 20)
      .stroke()
      .restore();
  } else {
    doc
      .fillColor(COLORS.white)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(status === 'attention' ? '!' : '-', x + 14, y + 18, { width: 22, align: 'center' });
  }
  doc
    .fillColor(color)
    .font('Helvetica-Bold')
    .fontSize(17)
    .text(String(count), x + 45, y + 9, { width: width - 52, align: 'center' });
  doc
    .fontSize(7.5)
    .text(label, x + 45, y + 31, { width: width - 52, align: 'center', characterSpacing: 0.3 });
}

function drawCommercialOverview(doc, formData, displayStamp, results) {
  const left = 44;
  const contentWidth = doc.page.width - 88;
  const propertyName = cleanValue(formData.selectedProperty || formData.property || formData.businessName) || 'Commercial Property';
  const propertyAddress = cleanValue(formData.propertyAddress) || 'Address not provided';
  const counts = results.reduce(
    (summary, result) => {
      summary[result.status] += 1;
      return summary;
    },
    { ok: 0, attention: 0, not_assessed: 0 }
  );
  const overallStatus = counts.attention > 0 ? 'attention' : counts.not_assessed > 0 ? 'not_assessed' : 'ok';

  drawPrimaryHeader(doc);
  doc
    .fillColor(COLORS.navyDark)
    .font('Helvetica-Bold')
    .fontSize(19)
    .text('Monthly Commercial Property Inspection', left, 108, { width: contentWidth });

  const metaY = 145;
  const labelWidth = 63;
  const valueX = left + labelWidth;
  const rows = [
    ['Property:', propertyName],
    ['Address:', propertyAddress],
    ['Submitted:', displayStamp],
  ];
  rows.forEach(([label, value], index) => {
    const y = metaY + index * 18;
    doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(9).text(label, left, y, { width: labelWidth });
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(9).text(truncate(value, 55), valueX, y, { width: 295 });
  });

  const overallLabel = overallStatus === 'attention' ? 'ATTENTION NEEDED' : overallStatus === 'ok' ? 'ALL ITEMS OK' : 'INCOMPLETE';
  drawBadge(doc, doc.page.width - 196, 150, 152, overallLabel, overallStatus);

  const summaryY = 210;
  const gap = 11;
  const cardWidth = (contentWidth - gap * 2) / 3;
  drawSummaryCard(doc, left, summaryY, cardWidth, counts.ok, 'ITEMS OK', 'ok');
  drawSummaryCard(doc, left + cardWidth + gap, summaryY, cardWidth, counts.attention, 'NEED ATTENTION', 'attention');
  drawSummaryCard(doc, left + (cardWidth + gap) * 2, summaryY, cardWidth, counts.not_assessed, 'NOT ASSESSED', 'not_assessed');

  drawResultsTable(doc, results, left, 287, contentWidth);
  drawObservationSummary(doc, formData, left, 664, contentWidth);

  return { propertyName, counts };
}

function drawResultsTable(doc, results, x, y, width) {
  doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(13).text('Inspection Results', x, y);
  const tableY = y + 23;
  const headerHeight = 23;
  const rowHeight = 25;
  const areaWidth = 205;
  const statusWidth = 90;
  const observationWidth = width - areaWidth - statusWidth;

  doc.roundedRect(x, tableY, width, headerHeight, 4).fill(COLORS.navy);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7.5);
  doc.text('AREA', x + 9, tableY + 8, { width: areaWidth - 18 });
  doc.text('STATUS', x + areaWidth, tableY + 8, { width: statusWidth, align: 'center' });
  doc.text('OBSERVATION', x + areaWidth + statusWidth + 8, tableY + 8, { width: observationWidth - 16 });

  results.forEach((result, index) => {
    const rowY = tableY + headerHeight + index * rowHeight;
    if (index % 2 === 1) doc.rect(x, rowY, width, rowHeight).fill('#FAFBFC');
    doc.rect(x, rowY, width, rowHeight).stroke(COLORS.line);
    doc
      .moveTo(x + areaWidth, rowY)
      .lineTo(x + areaWidth, rowY + rowHeight)
      .moveTo(x + areaWidth + statusWidth, rowY)
      .lineTo(x + areaWidth + statusWidth, rowY + rowHeight)
      .stroke(COLORS.line);

    doc.fillColor(COLORS.navyDark).font('Helvetica').fontSize(8.3).text(result.label, x + 9, rowY + 8, {
      width: areaWidth - 18,
      ellipsis: true,
      height: 11,
    });

    const statusLabel = result.status === 'attention' ? 'ATTENTION' : result.status === 'ok' ? 'OK' : 'NOT ASSESSED';
    drawBadge(doc, x + areaWidth + 8, rowY + 2, statusWidth - 16, statusLabel, result.status);

    const observation = result.status === 'attention'
      ? result.description || 'Issue noted; no description provided'
      : result.status === 'not_assessed'
        ? 'No response recorded'
        : '—';
    doc
      .fillColor(COLORS.slate)
      .font('Helvetica')
      .fontSize(7.6)
      .text(truncate(observation, 55), x + areaWidth + statusWidth + 8, rowY + 8, {
        width: observationWidth - 16,
        ellipsis: true,
        height: 11,
      });
  });
}

function drawObservationSummary(doc, formData, x, y, width) {
  const comments = cleanValue(formData.additionalComments);
  const activity = cleanValue(formData.homelessActivity);
  const summary = comments || activity || 'No additional observations were provided.';
  doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(11.5).text('General Observations', x, y);
  doc.roundedRect(x, y + 20, width, 46, 5).fillAndStroke(COLORS.panel, COLORS.line);
  doc
    .fillColor(COLORS.slate)
    .font('Helvetica')
    .fontSize(8.5)
    .text(truncate(summary, 190), x + 11, y + 32, { width: width - 22, height: 25, ellipsis: true });
}

function addDetailPage(doc, propertyName) {
  doc.addPage();
  return drawContinuationHeader(doc, propertyName, 'Findings & Photo Evidence');
}

function ensureDetailSpace(doc, y, needed, propertyName) {
  if (y + needed <= doc.page.height - 58) return y;
  return addDetailPage(doc, propertyName);
}

function drawDetailNotes(doc, formData, propertyName, startY) {
  const notes = [
    { label: 'Homeless Activity', value: cleanValue(formData.homelessActivity) },
    { label: 'Additional Comments', value: cleanValue(formData.additionalComments) },
  ].filter((note) => hasValue(note.value));

  let y = startY;
  if (notes.length === 0) return y;

  doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(13).text('Additional Observations', 44, y);
  y += 25;
  notes.forEach((note) => {
    const textHeight = Math.max(18, doc.font('Helvetica').fontSize(9).heightOfString(note.value, { width: doc.page.width - 112 }));
    y = ensureDetailSpace(doc, y, textHeight + 42, propertyName);
    doc.roundedRect(44, y, doc.page.width - 88, textHeight + 28, 5).fillAndStroke(COLORS.panel, COLORS.line);
    doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(9).text(note.label, 56, y + 10);
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(9).text(note.value, 56, y + 27, { width: doc.page.width - 112 });
    y += textHeight + 40;
  });
  return y + 4;
}

function drawPhotoCard(doc, buffer, x, y, width, caption) {
  const cardHeight = 180;
  doc.roundedRect(x, y, width, cardHeight, 5).fillAndStroke(COLORS.white, COLORS.line);
  doc.rect(x + 7, y + 7, width - 14, 143).fill(COLORS.panel);
  try {
    doc.image(buffer, x + 7, y + 7, {
      fit: [width - 14, 143],
      align: 'center',
      valign: 'center',
    });
  } catch (error) {
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica-Oblique')
      .fontSize(8)
      .text('Image could not be rendered', x + 16, y + 72, { width: width - 32, align: 'center' });
  }
  doc
    .fillColor(COLORS.slate)
    .font('Helvetica')
    .fontSize(7.8)
    .text(caption, x + 9, y + 158, { width: width - 18, align: 'center', ellipsis: true, height: 11 });
  return cardHeight;
}

function drawFindingSection(doc, result, buffers, propertyName, startY) {
  const contentWidth = doc.page.width - 88;
  let y = ensureDetailSpace(doc, startY, 78, propertyName);
  doc.rect(44, y, 4, 37).fill(COLORS.orange);
  doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(11).text(result.label, 57, y + 1, { width: 290 });
  drawBadge(doc, doc.page.width - 143, y, 99, 'ATTENTION', 'attention');
  doc
    .fillColor(COLORS.slate)
    .font('Helvetica')
    .fontSize(8.7)
    .text(result.description || 'No description was provided.', 57, y + 20, { width: contentWidth - 13 });
  y += 50;

  if (!buffers || buffers.length === 0) {
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8).text('No photo evidence submitted.', 57, y);
    return y + 25;
  }

  const gap = 12;
  const cardWidth = (contentWidth - gap) / 2;
  for (let index = 0; index < buffers.length; index += 2) {
    y = ensureDetailSpace(doc, y, 192, propertyName);
    drawPhotoCard(doc, buffers[index], 44, y, cardWidth, `${result.label} · Photo ${index + 1}`);
    if (buffers[index + 1]) {
      drawPhotoCard(doc, buffers[index + 1], 44 + cardWidth + gap, y, cardWidth, `${result.label} · Photo ${index + 2}`);
    }
    y += 192;
  }
  return y + 4;
}

function drawUnmatchedPhotoSection(doc, fieldName, buffers, propertyName, startY) {
  const result = {
    key: fieldName,
    label: humanizeFieldName(fieldName),
    status: 'attention',
    description: 'Additional submitted photo evidence.',
  };
  return drawFindingSection(doc, result, buffers, propertyName, startY);
}

function drawCommercialDetails(doc, formData, results, groupedPhotos, propertyName) {
  const attentionResults = results.filter((result) => result.status === 'attention');
  const hasNotes = hasValue(formData.homelessActivity) || hasValue(formData.additionalComments);
  const configuredKeys = new Set(results.map((result) => result.key));
  const unmatchedPhotoFields = Object.keys(groupedPhotos).filter((fieldName) => !configuredKeys.has(fieldName));
  const shouldRender = attentionResults.length > 0 || hasNotes || unmatchedPhotoFields.length > 0;
  if (!shouldRender) return;

  let y = addDetailPage(doc, propertyName);
  y = drawDetailNotes(doc, formData, propertyName, y);

  if (attentionResults.length > 0) {
    y = ensureDetailSpace(doc, y, 30, propertyName);
    doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(13).text('Items Requiring Attention', 44, y);
    y += 28;
    attentionResults.forEach((result) => {
      y = drawFindingSection(doc, result, groupedPhotos[result.key] || [], propertyName, y);
    });
  }

  unmatchedPhotoFields.forEach((fieldName) => {
    y = drawUnmatchedPhotoSection(doc, fieldName, groupedPhotos[fieldName], propertyName, y);
  });
}

function drawPageFooters(doc, propertyName) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // Footer text intentionally sits inside the page's normal bottom margin.
    // Temporarily relax that margin so PDFKit does not auto-create a new page.
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 39;
    doc.moveTo(44, y - 8).lineTo(doc.page.width - 44, y - 8).stroke(COLORS.line);
    doc
      .fillColor(COLORS.slate)
      .font('Helvetica')
      .fontSize(7.5)
      .text(`${propertyName}  •  Monthly Inspection`, 44, y, { width: 280 });
    doc.text(`Page ${index - range.start + 1} of ${range.count}`, doc.page.width - 145, y, { width: 101, align: 'right' });
    doc
      .fillColor(COLORS.muted)
      .fontSize(6.8)
      .text('Generated by Inspectors Gadget', 44, y + 12, { width: doc.page.width - 88, align: 'center' });
    doc.page.margins.bottom = originalBottomMargin;
  }
}

function renderCommercialReport(doc, formData, photoBuffers, displayStamp) {
  const results = getCommercialResults(formData);
  const groupedPhotos = groupPhotos(photoBuffers);
  const { propertyName } = drawCommercialOverview(doc, formData, displayStamp, results);
  drawCommercialDetails(doc, formData, results, groupedPhotos, propertyName);
  drawPageFooters(doc, propertyName);
}

function renderLegacyReport(doc, orgType, formData, photoBuffers, displayStamp) {
  const config = LEGACY_FIELD_MAPPINGS[orgType] || {
    title: 'Property Inspection Checklist',
    fields: {
      businessName: 'Business Name',
      propertyAddress: 'Property Address',
      additionalComments: 'Additional Comments',
    },
  };

  doc.fontSize(20).text(config.title, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Submission Timestamp: ${displayStamp}`, { align: 'center' });
  doc.moveDown(1);

  Object.entries(config.fields).forEach(([field, displayName]) => {
    const value = formData[field] || 'N/A';
    doc.fontSize(14).text(`${displayName}: ${value}`);
    if (formData[`${field}Description`]) {
      doc.fontSize(12).text(`  Description: ${formData[`${field}Description`]}`);
    }
    doc.moveDown(0.5);
  });

  const grouped = groupPhotos(photoBuffers);
  if (Object.keys(grouped).length === 0) {
    doc.moveDown(1).fontSize(14).text('No photos uploaded.', { italic: true });
    return;
  }

  Object.entries(grouped).forEach(([field, buffers]) => {
    doc.addPage();
    doc.fontSize(16).text(`Photos for: ${humanizeFieldName(field)}`, { underline: true });
    doc.moveDown(1);
    buffers.forEach((buffer, index) => {
      if (doc.y + 480 > doc.page.height - 50) doc.addPage();
      doc.fontSize(12).text(`Image #${index + 1}`);
      doc.moveDown(0.5);
      doc.image(buffer, { fit: [doc.page.width - 100, 450], align: 'center' });
      doc.moveDown(2);
    });
  });
}

function generateChecklistPDF(formData, photoBuffers) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(pdfStorageDir)) {
        fs.mkdirSync(pdfStorageDir, { recursive: true });
      }

      const sourceDate = formData?.submittedAt ? new Date(formData.submittedAt) : new Date();
      const safeSourceDate = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
      const { filenameStamp, displayStamp } = getAZTimestamps(safeSourceDate);
      const fileName = `checklist-${filenameStamp}.pdf`;
      const filePath = path.join(pdfStorageDir, fileName);
      const pdfStream = fs.createWriteStream(filePath);
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 44,
        bufferPages: true,
        info: {
          Title: 'Property Inspection Report',
          Author: 'Inspectors Gadget',
          Subject: cleanValue(formData.selectedProperty || formData.property || formData.businessName),
        },
      });

      doc.pipe(pdfStream);
      const orgType = cleanValue(formData.orgType || 'COM').toUpperCase();
      if (orgType === 'COM') {
        renderCommercialReport(doc, formData, photoBuffers, displayStamp);
      } else {
        renderLegacyReport(doc, orgType, formData, photoBuffers, displayStamp);
      }
      doc.end();

      pdfStream.on('finish', () => {
        resolve({ pdfStream: fs.createReadStream(filePath), filePath, fileName });
      });
      pdfStream.on('error', reject);
      doc.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateChecklistPDF };
