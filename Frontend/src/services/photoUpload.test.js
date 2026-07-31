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
