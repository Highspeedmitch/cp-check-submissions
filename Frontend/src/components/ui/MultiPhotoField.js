import React, { useEffect, useMemo } from "react";
import { mergePhotoSelection } from "../../services/photoUpload";

function PhotoThumbnail({ file, onRemove }) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  return (
    <div style={{ width: 92 }}>
      <img src={previewUrl} alt={file.name || "Selected photo"}
        style={{ width: 92, height: 72, objectFit: "cover", borderRadius: 6 }} />
      <button type="button" className="beta-text-button" onClick={onRemove}>Remove</button>
    </div>
  );
}

export default function MultiPhotoField({
  fieldKey,
  label,
  files = [],
  onChange,
  maxFiles = 6,
}) {
  const addFiles = (fileList) => {
    const selected = Array.from(fileList || []);
    if (selected.length) onChange(mergePhotoSelection(files, selected, maxFiles));
  };
  return (
    <div className="beta-form-field">
      <strong>Photos for: {label}</strong>
      <input key={`${fieldKey}-${files.length}`} type="file" accept="image/*" multiple
        onChange={(event) => addFiles(event.currentTarget.files)} />
      <small>{files.length} of {maxFiles} photos attached. Select again to add more.</small>
      {files.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {files.map((file, index) => (
          <PhotoThumbnail key={`${file.name}-${file.lastModified}-${index}`} file={file}
            onRemove={() => onChange(files.filter((_item, photoIndex) => photoIndex !== index))} />
        ))}
      </div>}
      {files.length > 0 && <button type="button" className="beta-text-button" onClick={() => onChange([])}>
        Clear section photos
      </button>}
    </div>
  );
}
