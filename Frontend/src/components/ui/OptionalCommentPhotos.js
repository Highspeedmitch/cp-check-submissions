import React from "react";
import MultiPhotoField from "./MultiPhotoField";

export default function OptionalCommentPhotos({
  enabled,
  onEnabledChange,
  files = [],
  onChange,
}) {
  return (
    <div>
      <label className="beta-template-checkbox">
        <input type="checkbox" checked={enabled}
          onChange={(event) => {
            onEnabledChange(event.target.checked);
            if (!event.target.checked) onChange([]);
          }} />
        Include photos related to these additional comments
      </label>
      {enabled && <MultiPhotoField fieldKey="additionalComments" label="Additional Comments"
        files={files} onChange={onChange} />}
    </div>
  );
}
