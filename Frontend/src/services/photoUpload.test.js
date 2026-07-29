import { scaledDimensions } from "./photoUpload";

test("preserves dimensions already within the upload bound", () => {
  expect(scaledDimensions(1200, 900)).toEqual({ width: 1200, height: 900 });
});

test("scales landscape and portrait images without changing aspect ratio", () => {
  expect(scaledDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  expect(scaledDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
});
