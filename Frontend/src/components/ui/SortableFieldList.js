import React, { useRef } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  canReorderField,
  reorderFields,
  reorderTargetKey,
} from "../../services/formFieldOrdering";

const FIELD_ITEM = "inspection-form-field";

function SortableFieldCard({ field, fields, onChange, renderField }) {
  const cardRef = useRef(null);
  const handleRef = useRef(null);
  const moveField = (targetKey) => onChange(reorderFields(fields, field.key, targetKey));
  const moveDroppedField = (sourceKey) => onChange(reorderFields(fields, sourceKey, field.key));
  const previousKey = reorderTargetKey(fields, field.key, -1);
  const nextKey = reorderTargetKey(fields, field.key, 1);
  const [{ isDragging }, drag] = useDrag(() => ({
    type: FIELD_ITEM,
    item: { key: field.key },
    canDrag: !field.locked,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [field.key, field.locked]);
  const [{ canDrop, isOver }, drop] = useDrop(() => ({
    accept: FIELD_ITEM,
    canDrop: (item) => canReorderField(fields, item.key, field.key),
    drop: (item) => moveDroppedField(item.key),
    collect: (monitor) => ({
      canDrop: monitor.canDrop(),
      isOver: monitor.isOver({ shallow: true }),
    }),
  }), [field.key, fields, onChange]);

  drop(cardRef);
  if (!field.locked) drag(handleRef);

  return (
    <article ref={cardRef} className={`beta-settings-card beta-sortable-field-card${isDragging ? " is-dragging" : ""}${isOver && canDrop ? " is-drop-target" : ""}`}>
      <div className="beta-sortable-field-toolbar">
        <div className="beta-sortable-field-identity">
          {field.locked ? (
            <span className="beta-field-lock" title="This field is fixed by the organization">Locked</span>
          ) : (
            <button ref={handleRef} type="button" className="beta-drag-handle"
              aria-label={`Drag ${field.label} to reorder`} title="Drag to reorder within this section">
              <span aria-hidden="true">{"\u2195"}</span> Drag
            </button>
          )}
          <span className="beta-field-section">{field.section || "Property Condition"}</span>
        </div>
        {!field.locked && (
          <div className="beta-reorder-buttons" aria-label={`Move ${field.label}`}>
            <button type="button" className="beta-icon-button" disabled={!previousKey}
              onClick={() => moveField(previousKey)} aria-label={`Move ${field.label} earlier`} title="Move earlier">{"\u2191"}</button>
            <button type="button" className="beta-icon-button" disabled={!nextKey}
              onClick={() => moveField(nextKey)} aria-label={`Move ${field.label} later`} title="Move later">{"\u2193"}</button>
          </div>
        )}
      </div>
      {renderField(field)}
    </article>
  );
}

function SortableFieldListContent({ fields, onChange, renderField, emptyMessage }) {
  if (!fields.length) return <div className="beta-empty-state">{emptyMessage}</div>;
  return (
    <div className="beta-template-custom-fields beta-sortable-field-list">
      {fields.map((field) => (
        <SortableFieldCard key={field.key} field={field} fields={fields}
          onChange={onChange} renderField={renderField} />
      ))}
    </div>
  );
}

export default function SortableFieldList(props) {
  return (
    <DndProvider backend={HTML5Backend}>
      <SortableFieldListContent {...props} />
    </DndProvider>
  );
}
