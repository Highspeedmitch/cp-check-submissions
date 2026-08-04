const Assignment = require("../models/assignment");

const ASSIGNMENT_SCHEDULE_KEY = {
  propertyName: 1,
  startDate: 1,
  organizationId: 1,
};

function matchesScheduleKey(index = {}) {
  const fields = Object.keys(ASSIGNMENT_SCHEDULE_KEY);
  const indexFields = Object.keys(index.key || {});
  return fields.length === indexFields.length
    && fields.every((field, position) => (
      indexFields[position] === field
      && index.key[field] === ASSIGNMENT_SCHEDULE_KEY[field]
    ));
}

function isScheduledOnlyIndex(index = {}) {
  return index.unique === true
    && index.partialFilterExpression?.status === "scheduled";
}

async function ensureAssignmentSchedulingIndex({ AssignmentModel = Assignment } = {}) {
  let indexes;
  try {
    indexes = await AssignmentModel.collection.indexes();
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound" && error.code !== 26) throw error;
    indexes = [];
  }
  const scheduleIndex = indexes.find(matchesScheduleKey);

  if (scheduleIndex && isScheduledOnlyIndex(scheduleIndex)) {
    return { changed: false, indexName: scheduleIndex.name };
  }

  if (scheduleIndex) {
    try {
      await AssignmentModel.collection.dropIndex(scheduleIndex.name);
    } catch (error) {
      if (error.codeName !== "IndexNotFound" && error.code !== 27) throw error;
    }
  }

  await AssignmentModel.createIndexes();
  return {
    changed: Boolean(scheduleIndex),
    indexName: "scheduled_property_start_organization_unique",
  };
}

module.exports = {
  ASSIGNMENT_SCHEDULE_KEY,
  ensureAssignmentSchedulingIndex,
  isScheduledOnlyIndex,
  matchesScheduleKey,
};
