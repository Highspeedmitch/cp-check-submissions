export function fieldSection(field) {
  return String(field?.section || "Property Condition").trim() || "Property Condition";
}

function fieldSegment(fields, fieldIndex) {
  return fields.slice(0, fieldIndex).filter((field) => field.locked).length;
}

export function canReorderField(fields, sourceKey, targetKey) {
  const sourceIndex = fields.findIndex((field) => field.key === sourceKey);
  const targetIndex = fields.findIndex((field) => field.key === targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;
  const source = fields[sourceIndex];
  const target = fields[targetIndex];
  return !source.locked
    && !target.locked
    && fieldSection(source) === fieldSection(target)
    && fieldSegment(fields, sourceIndex) === fieldSegment(fields, targetIndex);
}

export function reorderFields(fields, sourceKey, targetKey) {
  if (!canReorderField(fields, sourceKey, targetKey)) return fields;
  const sourceIndex = fields.findIndex((field) => field.key === sourceKey);
  const source = fields[sourceIndex];
  const segment = fieldSegment(fields, sourceIndex);
  const eligibleIndexes = fields.reduce((indexes, field, index) => {
    if (!field.locked
      && fieldSection(field) === fieldSection(source)
      && fieldSegment(fields, index) === segment) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const sourceSlot = eligibleIndexes.findIndex((index) => fields[index].key === sourceKey);
  const targetSlot = eligibleIndexes.findIndex((index) => fields[index].key === targetKey);
  const reordered = eligibleIndexes.map((index) => fields[index]);
  const [moved] = reordered.splice(sourceSlot, 1);
  reordered.splice(targetSlot, 0, moved);

  const next = [...fields];
  eligibleIndexes.forEach((index, slot) => {
    next[index] = reordered[slot];
  });
  return next.map((field, order) => ({ ...field, order }));
}

export function reorderTargetKey(fields, sourceKey, direction) {
  const sourceIndex = fields.findIndex((field) => field.key === sourceKey);
  if (sourceIndex < 0 || fields[sourceIndex].locked) return null;
  const source = fields[sourceIndex];
  const segment = fieldSegment(fields, sourceIndex);
  const eligible = fields.filter((field, index) => (
    !field.locked
    && fieldSection(field) === fieldSection(source)
    && fieldSegment(fields, index) === segment
  ));
  const current = eligible.findIndex((field) => field.key === sourceKey);
  return eligible[current + direction]?.key || null;
}

export function orderFieldsByKeys(fields, requestedOrder = []) {
  const knownKeys = new Set(fields.map((field) => field.key));
  const uniqueRequested = [...new Set(requestedOrder.filter((key) => knownKeys.has(key)))];
  const requestedKeys = [
    ...uniqueRequested,
    ...fields.map((field) => field.key).filter((key) => !uniqueRequested.includes(key)),
  ];
  const requestedIndex = new Map(requestedKeys.map((key, index) => [key, index]));
  const lockedFields = fields.filter((field) => field.locked);
  const segments = Array.from({ length: lockedFields.length + 1 }, () => []);
  let segment = 0;

  fields.forEach((field, canonicalIndex) => {
    if (field.locked) {
      segment += 1;
    } else {
      segments[segment].push({ field, canonicalIndex });
    }
  });
  segments.forEach((items) => items.sort((left, right) => (
    requestedIndex.get(left.field.key) - requestedIndex.get(right.field.key)
    || left.canonicalIndex - right.canonicalIndex
  )));

  const ordered = [];
  segments.forEach((items, index) => {
    ordered.push(...items.map((item) => item.field));
    if (lockedFields[index]) ordered.push(lockedFields[index]);
  });
  return ordered.map((field, order) => ({ ...field, order }));
}
