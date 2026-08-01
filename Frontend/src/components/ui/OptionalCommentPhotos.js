import React from "react";
import MultiPhotoField from "./MultiPhotoField";

export default function OptionalCommentPhotos({
  enabled,
  onEnabledChange,
  files = [],
  onChange,
  fieldKey = "additionalComments",
  label = "Additional Comments",
  prompt = "Include photos related to these additional comments",
}) {
  return (
    <div>
      <label className="beta-template-checkbox">
        <input type="checkbox" checked={enabled}
          onChange={(event) => {
            onEnabledChange(event.target.checked);
            if (!event.target.checked) onChange([]);
          }} />
        {prompt}
      </label>
      {enabled && <MultiPhotoField fieldKey={fieldKey} label={label}
        files={files} onChange={onChange} />}
    </div>
  );
}
