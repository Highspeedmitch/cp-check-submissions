const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const DEFAULT_LOGO_PATH = path.resolve(__dirname, '../Frontend/public/logo512.png');
const DETAIL_PAGE_TOP = 84;
const DETAIL_PAGE_BOTTOM_MARGIN = 58;
const PHOTO_CARD_HEIGHT = 180;
const PHOTO_ROW_HEIGHT = 190;

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
  return String(value).replace(/\r\n?/g, '\n').trim();
}

function safeFilenameSegment(value, fallback = 'Property') {
  const normalized = cleanValue(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const limited = normalized.slice(0, 90).trim().replace(/[.\s]+$/g, '');
  return limited || fallback;
}

function buildChecklistFileName(formData, filenameStamp) {
  const propertyName = formData?.selectedProperty
    || formData?.property
    || formData?.businessName;
  return `${safeFilenameSegment(propertyName)} - ${filenameStamp}.pdf`;
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

function getOrderedTemplateFields(template) {
  if (!Array.isArray(template?.fields)) return null;
  return template.fields
    .map((field, index) => ({
      field,
      index,
      order: Number.isFinite(Number(field.order)) ? Number(field.order) : index,
    }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ field }) => field);
}

function getCommercialResults(formData, template) {
  const orderedFields = getOrderedTemplateFields(template);
  const configuredFields = orderedFields
    ? orderedFields
      .filter((field) => field.type === 'yes_no_issue')
      .map((field) => ({
        key: field.key,
        label: field.reportLabel || field.label || humanizeFieldName(field.key),
      }))
    : COM_INSPECTION_FIELDS;
  return configuredFields.map((field) => {
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

function drawBrandMark(doc, x, y, logoPath = DEFAULT_LOGO_PATH) {
  const selectedLogoPath = logoPath || DEFAULT_LOGO_PATH;
  if (fs.existsSync(selectedLogoPath)) {
    doc.save();
    doc.roundedRect(x, y, 42, 42, 7).clip();
    // The source icon includes generous square padding. Enlarging it inside
    // the clipped tile keeps the owl legible at report-header size.
    doc.image(selectedLogoPath, x - 14, y - 11, { width: 69, height: 69 });
    doc.restore();
    doc.save().lineWidth(0.8).strokeColor(COLORS.white).roundedRect(x, y, 42, 42, 7).stroke().restore();
    return;
  }
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

function drawPrimaryHeader(doc, options = {}) {
  const width = doc.page.width;
  doc.rect(0, 0, width, 88).fill(COLORS.navy);
  drawBrandMark(doc, 44, 23, options.logoPath);
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(19)
    .text('AFTERLIGHT', 101, 26, { characterSpacing: 0.5 });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .text(options.headerSubtitle || 'PROPERTY INSPECTION REPORT', 102, 53, { characterSpacing: 1.6 });
}

function drawContinuationHeader(doc, propertyName, sectionTitle, options = {}) {
  const width = doc.page.width;
  doc.rect(0, 0, width, 64).fill(COLORS.navy);
  drawBrandMark(doc, 42, 12, options.logoPath);
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

function drawCompactTableBadge(doc, x, y, width, rowHeight, label, status) {
  const isAttention = status === 'attention';
  const isOk = status === 'ok';
  const background = isAttention ? COLORS.orangeLight : isOk ? COLORS.greenLight : COLORS.grayLight;
  const foreground = isAttention ? COLORS.orange : isOk ? COLORS.green : COLORS.gray;
  const height = Math.max(13, rowHeight - 3);
  const fontSize = rowHeight < 19 ? 6.8 : 8.2;
  const top = y + Math.max(2.5, (height - fontSize) / 2 - 0.5);
  doc.roundedRect(x, y, width, height, Math.min(5, height / 3)).fill(background);
  doc
    .fillColor(foreground)
    .font('Helvetica-Bold')
    .fontSize(fontSize)
    .text(label, x + 5, top, {
      width: width - 10,
      height: height - 2,
      align: 'center',
      ellipsis: true,
    });
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

function drawCommercialOverview(doc, formData, displayStamp, results, template, options = {}) {
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

  drawPrimaryHeader(doc, options);
  doc
    .fillColor(COLORS.navyDark)
    .font('Helvetica-Bold')
    .fontSize(19)
    .text(options.reportTitle || 'Monthly Commercial Property Inspection', left, 108, { width: contentWidth });

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

  drawResultsTable(doc, results, left, 287, contentWidth, options);
  drawObservationSummary(doc, formData, left, 660, contentWidth, template, options);
  if (options.notice) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5)
      .text(options.notice, left, 196, { width: contentWidth, align: 'center', height: 9, ellipsis: true });
  }

  return { propertyName, counts };
}

function drawResultsTable(doc, results, x, y, width, options = {}) {
  doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(13)
    .text(options.resultsTitle || 'Inspection Results', x, y);
  const tableY = y + 23;
  const headerHeight = 23;
  // Reserve the bottom of page one for the 300-character cover summary.
  // Effective templates allow up to 18 checks, so the dense case uses a
  // compact row and badge rather than colliding with General Observations.
  const rowHeight = Math.min(25, Math.max(16.5, 315 / Math.max(results.length, 1)));
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

    const textTop = rowY + Math.max(4, (rowHeight - 8.3) / 2);
    doc.fillColor(COLORS.navyDark).font('Helvetica').fontSize(rowHeight < 19 ? 7.3 : 8.3).text(result.label, x + 9, textTop, {
      width: areaWidth - 18,
      ellipsis: true,
      height: Math.max(9, rowHeight - 5),
    });

    const statusLabel = result.status === 'attention' ? 'ATTENTION' : result.status === 'ok' ? 'OK' : 'NOT ASSESSED';
    drawCompactTableBadge(
      doc,
      x + areaWidth + 8,
      rowY + 1.5,
      statusWidth - 16,
      rowHeight,
      statusLabel,
      result.status
    );

    const observation = result.status === 'attention'
      ? result.description || 'Issue noted; no description provided'
      : result.status === 'not_assessed'
        ? 'No response recorded'
        : '—';
    doc
      .fillColor(COLORS.slate)
      .font('Helvetica')
      .fontSize(rowHeight < 19 ? 7.1 : 7.6)
      .text(truncate(observation, 55), x + areaWidth + statusWidth + 8, textTop, {
        width: observationWidth - 16,
        ellipsis: true,
        height: Math.max(9, rowHeight - 5),
      });
  });
}

function getObservationSummary(formData, template) {
  const orderedFields = getOrderedTemplateFields(template);
  if (orderedFields) {
    const summaryField = orderedFields.find((field) => (
      field.key === 'generalObservations'
      && ['text', 'textarea'].includes(field.type)
    ));
    if (!summaryField) return null;
    return cleanValue(formData[summaryField.key]) || 'No general observations were provided.';
  }

  return cleanValue(formData.generalObservations)
    || cleanValue(formData.additionalComments)
    || cleanValue(formData.homelessActivity)
    || 'No additional observations were provided.';
}

function drawObservationSummary(doc, formData, x, y, width, template, options = {}) {
  const coverSummary = options.coverSummary || null;
  const summary = cleanValue(coverSummary?.text) || getObservationSummary(formData, template);
  if (summary === null) return;
  const disclaimer = cleanValue(coverSummary?.disclaimer);
  const panelY = y + 20;
  const panelHeight = 58;
  doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(11.5).text('General Observations', x, y);
  doc.roundedRect(x, panelY, width, panelHeight, 5).fillAndStroke(COLORS.panel, COLORS.line);
  doc
    .fillColor(COLORS.slate)
    .font('Helvetica')
    .fontSize(8.3)
    .text(truncate(summary, 300), x + 11, panelY + 8, {
      width: width - 22,
      height: disclaimer ? 31 : 42,
      ellipsis: true,
    });
  if (disclaimer) {
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica-Oblique')
      .fontSize(6.3)
      .text(disclaimer, x + 11, panelY + 44, {
        width: width - 22,
        height: 8,
        ellipsis: true,
      });
  }
}

function addDetailPage(doc, propertyName, options = {}) {
  doc.addPage();
  return drawContinuationHeader(
    doc,
    propertyName,
    options.detailTitle || 'Findings & Photo Evidence',
    options
  );
}

function ensureDetailSpace(doc, y, needed, propertyName, options = {}) {
  if (y + needed <= doc.page.height - DETAIL_PAGE_BOTTOM_MARGIN) return y;
  return addDetailPage(doc, propertyName, options);
}

function drawDetailNotes(doc, formData, propertyName, startY, template, options = {}) {
  const configuredNotes = getOrderedTemplateFields(template)?.filter((field) =>
    ['text', 'textarea'].includes(field.type)
    && !['businessName', 'propertyAddress'].includes(field.key)
    && (field.key !== 'generalObservations' || Boolean(options.coverSummary?.text))
  ).map((field) => ({
    label: field.reportLabel || field.label,
    value: cleanValue(formData[field.key]),
  }));
  const notes = (configuredNotes || [
    { label: 'Homeless Activity', value: cleanValue(formData.homelessActivity) },
    { label: 'Additional Comments', value: cleanValue(formData.additionalComments) },
  ]).filter((note) => hasValue(note.value));

  let y = startY;
  if (notes.length === 0) return y;

  doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(13).text('Additional Observations', 44, y);
  y += 25;
  notes.forEach((note) => {
    const textHeight = Math.max(18, doc.font('Helvetica').fontSize(9).heightOfString(note.value, { width: doc.page.width - 112 }));
    y = ensureDetailSpace(doc, y, textHeight + 42, propertyName, options);
    doc.roundedRect(44, y, doc.page.width - 88, textHeight + 28, 5).fillAndStroke(COLORS.panel, COLORS.line);
    doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(9).text(note.label, 56, y + 10);
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(9).text(note.value, 56, y + 27, { width: doc.page.width - 112 });
    y += textHeight + 40;
  });
  return y + 4;
}

function drawPhotoCard(doc, buffer, x, y, width, caption) {
  doc.roundedRect(x, y, width, PHOTO_CARD_HEIGHT, 5).fillAndStroke(COLORS.white, COLORS.line);
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
  return PHOTO_CARD_HEIGHT;
}

function findingDescription(result) {
  return cleanValue(result.description) || 'No description was provided.';
}

function measureFindingCard(doc, result) {
  const contentWidth = doc.page.width - 88;
  const titleWidth = contentWidth - 143;
  const descriptionWidth = contentWidth - 26;
  const titleHeight = Math.max(
    13,
    doc.font('Helvetica-Bold').fontSize(11).heightOfString(result.label, { width: titleWidth })
  );
  const descriptionTop = 11 + titleHeight + 7;
  const descriptionHeight = Math.max(
    11,
    doc.font('Helvetica').fontSize(8.7).heightOfString(findingDescription(result), {
      width: descriptionWidth,
      lineGap: 1,
    })
  );
  return {
    contentWidth,
    titleWidth,
    descriptionWidth,
    descriptionTop,
    height: Math.max(62, descriptionTop + descriptionHeight + 12),
  };
}

function findingSectionHeight(cardHeight, photoCount) {
  if (!photoCount) return cardHeight + 37;
  return cardHeight + 12 + Math.ceil(photoCount / 2) * PHOTO_ROW_HEIGHT + 4;
}

function canKeepFindingTogether(doc, sectionHeight) {
  return sectionHeight <= doc.page.height - DETAIL_PAGE_BOTTOM_MARGIN - DETAIL_PAGE_TOP;
}

function drawFindingCard(doc, result, y, layout) {
  doc.roundedRect(44, y, layout.contentWidth, layout.height, 5).fillAndStroke(COLORS.panel, COLORS.line);
  doc.rect(44, y + 6, 4, layout.height - 12).fill(COLORS.orange);
  doc
    .fillColor(COLORS.navyDark)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(result.label, 57, y + 11, { width: layout.titleWidth });
  drawBadge(doc, doc.page.width - 143, y + 9, 99, 'ATTENTION', 'attention');
  doc
    .fillColor(COLORS.slate)
    .font('Helvetica')
    .fontSize(8.7)
    .text(findingDescription(result), 57, y + layout.descriptionTop, {
      width: layout.descriptionWidth,
      lineGap: 1,
    });
}

function drawFindingSection(doc, result, buffers, propertyName, startY, options = {}) {
  const contentWidth = doc.page.width - 88;
  const cardLayout = measureFindingCard(doc, result);
  const sectionHeight = findingSectionHeight(cardLayout.height, buffers?.length || 0);
  const initialSpace = buffers?.length ? cardLayout.height + 12 + PHOTO_ROW_HEIGHT : sectionHeight;
  let y = ensureDetailSpace(
    doc,
    startY,
    canKeepFindingTogether(doc, sectionHeight) ? sectionHeight : initialSpace,
    propertyName,
    options
  );
  drawFindingCard(doc, result, y, cardLayout);
  y += cardLayout.height + 12;

  if (!buffers || buffers.length === 0) {
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8).text('No photo evidence submitted.', 57, y);
    return y + 25;
  }

  const gap = 12;
  const cardWidth = (contentWidth - gap) / 2;
  for (let index = 0; index < buffers.length; index += 2) {
    y = ensureDetailSpace(doc, y, PHOTO_ROW_HEIGHT, propertyName, options);
    drawPhotoCard(doc, buffers[index], 44, y, cardWidth, `${result.label} · Photo ${index + 1}`);
    if (buffers[index + 1]) {
      drawPhotoCard(doc, buffers[index + 1], 44 + cardWidth + gap, y, cardWidth, `${result.label} · Photo ${index + 2}`);
    }
    y += PHOTO_ROW_HEIGHT;
  }
  return y + 4;
}

function drawUnmatchedPhotoSection(doc, fieldName, buffers, propertyName, startY, options = {}) {
  const result = {
    key: fieldName,
    label: humanizeFieldName(fieldName),
    status: 'attention',
    description: 'Additional submitted photo evidence.',
  };
  return drawFindingSection(doc, result, buffers, propertyName, startY, options);
}

function drawCommercialDetails(doc, formData, results, groupedPhotos, propertyName, template, options = {}) {
  const attentionResults = results.filter((result) => result.status === 'attention');
  const orderedFields = getOrderedTemplateFields(template);
  const hasNotes = orderedFields
    ? orderedFields.some((field) =>
      ['text', 'textarea'].includes(field.type)
      && !['businessName', 'propertyAddress'].includes(field.key)
      && hasValue(formData[field.key])
    )
    : hasValue(formData.homelessActivity) || hasValue(formData.additionalComments);
  const configuredKeys = new Set(results.map((result) => result.key));
  const unmatchedPhotoFields = Object.keys(groupedPhotos).filter((fieldName) => !configuredKeys.has(fieldName));
  const shouldRender = attentionResults.length > 0 || hasNotes || unmatchedPhotoFields.length > 0;
  if (!shouldRender) return;

  let y = addDetailPage(doc, propertyName, options);
  y = drawDetailNotes(doc, formData, propertyName, y, template, options);

  if (attentionResults.length > 0) {
    const firstResult = attentionResults[0];
    const firstCard = measureFindingCard(doc, firstResult);
    const firstSectionHeight = findingSectionHeight(
      firstCard.height,
      groupedPhotos[firstResult.key]?.length || 0
    );
    const titleAndFirstFindingHeight = 28 + firstSectionHeight;
    y = ensureDetailSpace(
      doc,
      y,
      canKeepFindingTogether(doc, titleAndFirstFindingHeight) ? titleAndFirstFindingHeight : 30,
      propertyName,
      options
    );
    doc.fillColor(COLORS.navyDark).font('Helvetica-Bold').fontSize(13)
      .text(options.findingsTitle || 'Items Requiring Attention', 44, y);
    y += 28;
    attentionResults.forEach((result) => {
      y = drawFindingSection(doc, result, groupedPhotos[result.key] || [], propertyName, y, options);
    });
  }

  unmatchedPhotoFields.forEach((fieldName) => {
    y = drawUnmatchedPhotoSection(doc, fieldName, groupedPhotos[fieldName], propertyName, y, options);
  });
}

function drawPageFooters(doc, propertyName, options = {}) {
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
      .text(`${propertyName}  |  ${options.footerLabel || 'Monthly Inspection'}`, 44, y, { width: 340 });
    doc.text(`Page ${index - range.start + 1} of ${range.count}`, doc.page.width - 145, y, { width: 101, align: 'right' });
    doc
      .fillColor(COLORS.muted)
      .fontSize(6.8)
      .text('Generated by Afterlight', 44, y + 12, { width: doc.page.width - 88, align: 'center' });
    doc.page.margins.bottom = originalBottomMargin;
  }
}

function renderCommercialReport(doc, formData, photoBuffers, displayStamp, template, options = {}) {
  const allResults = getCommercialResults(formData, template);
  const results = options.onlyAssessed
    ? allResults.filter((result) => result.status !== 'not_assessed')
    : allResults;
  const groupedPhotos = groupPhotos(photoBuffers);
  const { propertyName } = drawCommercialOverview(doc, formData, displayStamp, results, template, options);
  drawCommercialDetails(doc, formData, results, groupedPhotos, propertyName, template, options);
  drawPageFooters(doc, propertyName, options);
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

function generateChecklistPDF(formData, photoBuffers, template = null, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const sourceDate = formData?.submittedAt ? new Date(formData.submittedAt) : new Date();
      const safeSourceDate = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
      const { filenameStamp, displayStamp } = getAZTimestamps(safeSourceDate);
      const fileName = buildChecklistFileName(formData, filenameStamp);
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 44,
        bufferPages: true,
        info: {
          Title: 'Property Inspection Report',
          Author: 'Afterlight',
          Subject: cleanValue(formData.selectedProperty || formData.property || formData.businessName),
        },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve({ pdfBuffer: Buffer.concat(chunks), fileName }));
      doc.on('error', reject);
      const orgType = cleanValue(formData.orgType || 'COM').toUpperCase();
      if (orgType === 'COM') {
        renderCommercialReport(doc, formData, photoBuffers, displayStamp, template, options);
      } else {
        renderLegacyReport(doc, orgType, formData, photoBuffers, displayStamp);
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateChecklistPDF,
  getCommercialResults,
  getObservationSummary,
  getOrderedTemplateFields,
  findingSectionHeight,
  buildChecklistFileName,
};
