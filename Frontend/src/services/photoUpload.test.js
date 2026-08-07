import {
  appendOptimizedPhotos,
  mergePhotoSelection,
  scaledDimensions,
  submitInspectionJob,
} from "./photoUpload";

test("preserves dimensions already within the upload bound", () => {
  expect(scaledDimensions(1200, 900)).toEqual({ width: 1200, height: 900 });
});

test("scales landscape and portrait images without changing aspect ratio", () => {
  expect(scaledDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  expect(scaledDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
});

test("repeated photo selections accumulate instead of replacing earlier files", () => {
  const first = { name: "first.jpg" };
  const second = { name: "second.jpg" };
  expect(mergePhotoSelection([], [first])).toEqual([first]);
  expect(mergePhotoSelection([first], [second])).toEqual([first, second]);
});

test("photo uploads preserve custom field names with separators", async () => {
  const payload = new FormData();
  const file = new File(["photo"], "image.txt", { type: "text/plain" });
  await appendOptimizedPhotos(payload, { "loading-dock": [file] });
  expect(payload.get("photos").name).toBe("loading-dock--image.txt");
});

test("inspection submissions queue metadata separately from photo content", async () => {
  const api = {
    post: jest.fn()
      .mockResolvedValueOnce({ jobId: "job-1", status: "uploading", uploads: [] })
      .mockResolvedValueOnce({ jobId: "job-1", status: "queued" }),
    get: jest.fn().mockResolvedValue({ jobId: "job-1", status: "completed" }),
  };
  const result = await submitInspectionJob({
    api,
    property: "Test Property",
    orgType: "COM",
    responses: { graffiti: "no" },
    photoGroups: {},
  });
  expect(result.status).toBe("completed");
  expect(api.post.mock.calls[0][0]).toBe("/api/inspection-jobs");
  expect(api.post.mock.calls[0][1].photos).toEqual([]);
  expect(api.post.mock.calls[1][0]).toBe("/api/inspection-jobs/job-1/complete-uploads");
});

test("resource submissions preserve the scheduled assignment identity", async () => {
  const api = {
    post: jest.fn()
      .mockResolvedValueOnce({ jobId: "job-resource", status: "uploading", uploads: [] })
      .mockResolvedValueOnce({ jobId: "job-resource", status: "queued" }),
    get: jest.fn().mockResolvedValue({ jobId: "job-resource", status: "completed" }),
  };
  await submitInspectionJob({
    api,
    property: "Winterhaven Square",
    orgType: "COM",
    assignmentId: "assignment-owner-1",
    responses: { graffiti: "no" },
    photoGroups: {},
  });

  expect(api.post.mock.calls[0][1].assignmentId).toBe("assignment-owner-1");
});

test("inspection photos upload directly using the signed S3 form", async () => {
  const originalFetch = global.fetch;
  const originalCreateImageBitmap = global.createImageBitmap;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  global.createImageBitmap = jest.fn().mockResolvedValue({
    width: 100,
    height: 100,
    close: jest.fn(),
  });
  const api = {
    post: jest.fn()
      .mockResolvedValueOnce({
        jobId: "job-2",
        status: "uploading",
        uploads: [{ uploadId: "photo-1", url: "https://uploads.example", fields: { key: "photo-key" } }],
      })
      .mockResolvedValueOnce({ jobId: "job-2", status: "queued" }),
    get: jest.fn().mockResolvedValue({ jobId: "job-2", status: "completed" }),
  };
  try {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" });
    const result = await submitInspectionJob({
      api,
      property: "Test Property",
      orgType: "COM",
      responses: { graffiti: "yes" },
      photoGroups: { graffiti: [file] },
    });
    expect(result.status).toBe("completed");
    expect(global.fetch).toHaveBeenCalledWith("https://uploads.example", expect.objectContaining({ method: "POST" }));
  } finally {
    global.fetch = originalFetch;
    global.createImageBitmap = originalCreateImageBitmap;
  }
});

test("draft storage failure warns but does not block the inspection API", async () => {
  const api = {
    post: jest.fn()
      .mockResolvedValueOnce({ jobId: "job-draft-warning", status: "uploading", uploads: [] })
      .mockResolvedValueOnce({ jobId: "job-draft-warning", status: "queued" }),
    get: jest.fn().mockResolvedValue({ jobId: "job-draft-warning", status: "completed" }),
  };
  const saveDraft = jest.fn().mockRejectedValue(new Error("Load failed"));
  const onWarning = jest.fn();

  const result = await submitInspectionJob({
    api,
    property: "Winterhaven Square",
    orgType: "COM",
    responses: { graffiti: "no" },
    photoGroups: {},
    draft: {
      key: "draft-1",
      responses: { graffiti: "no" },
      photoGroups: {},
    },
    saveDraft,
    onWarning,
  });

  expect(result.status).toBe("completed");
  expect(saveDraft).toHaveBeenCalledTimes(1);
  expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({ phase: "draft_storage" }));
  expect(api.post.mock.calls[0][0]).toBe("/api/inspection-jobs");
});

test("API network failures identify the preparation phase", async () => {
  const api = {
    post: jest.fn().mockRejectedValue(new TypeError("Load failed")),
    get: jest.fn(),
  };

  await expect(submitInspectionJob({
    api,
    property: "Winterhaven Square",
    orgType: "COM",
    responses: { graffiti: "no" },
    photoGroups: {},
  })).rejects.toMatchObject({
    name: "InspectionSubmissionError",
    phase: "api_preparation",
    message: "Afterlight could not begin this inspection submission. Check your connection and try again.",
  });
});

test("direct upload network failures identify the photo upload phase", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new TypeError("Load failed"));
  const api = {
    post: jest.fn().mockResolvedValue({
      jobId: "job-photo-failure",
      status: "uploading",
      uploads: [{ uploadId: "photo-1", url: "https://uploads.example", fields: { key: "photo-key" } }],
    }),
    get: jest.fn(),
  };
  try {
    const file = new File(["gif"], "photo.gif", { type: "image/gif" });
    await expect(submitInspectionJob({
      api,
      property: "Winterhaven Square",
      orgType: "COM",
      responses: { graffiti: "yes" },
      photoGroups: { graffiti: [file] },
    })).rejects.toMatchObject({
      name: "InspectionSubmissionError",
      phase: "photo_upload",
      jobId: "job-photo-failure",
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  } finally {
    global.fetch = originalFetch;
  }
});
