import { mergePhotoSelection, scaledDimensions } from "./photoUpload";

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
