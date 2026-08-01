import {
  hydrateInspectionDraft,
  inspectionDraftHasContent,
  serializeInspectionDraft,
} from "./inspectionDrafts";

test("recognizes responses and photos as durable draft content", () => {
  expect(inspectionDraftHasContent({ issue: "" }, {})).toBe(false);
  expect(inspectionDraftHasContent({ issue: "yes" }, {})).toBe(true);
  expect(inspectionDraftHasContent({}, { issue: [new File(["photo"], "issue.jpg")] })).toBe(true);
});

test("serializes and restores inspection photo files", () => {
  const photo = new File(["photo-data"], "issue.jpg", {
    type: "image/jpeg",
    lastModified: 1234,
  });
  const record = serializeInspectionDraft({
    key: "draft-1",
    responses: { issue: "yes" },
    photoGroups: { issue: [photo] },
    metadata: { formType: "commercial" },
  });

  const restored = hydrateInspectionDraft(record);

  expect(restored.responses).toEqual({ issue: "yes" });
  expect(restored.metadata.formType).toBe("commercial");
  expect(restored.photoGroups.issue[0]).toBeInstanceOf(File);
  expect(restored.photoGroups.issue[0].name).toBe("issue.jpg");
  expect(restored.photoGroups.issue[0].type).toBe("image/jpeg");
});
