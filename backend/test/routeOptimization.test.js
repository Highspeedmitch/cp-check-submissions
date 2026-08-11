const test = require("node:test");
const assert = require("node:assert/strict");
const { exactOpenRoute, modeledMatrix } = require("../services/routeOptimization");

test("exact route ordering minimizes travel between up to six selected stops", () => {
  const points = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const matrix = {
    durationsSeconds: [
      [0, 60, 600],
      [60, 0, 60],
      [600, 60, 0],
    ],
    distancesMeters: [
      [0, 1000, 10000],
      [1000, 0, 1000],
      [10000, 1000, 0],
    ],
  };
  const result = exactOpenRoute(points, matrix);

  assert.deepEqual(result.orderedPropertyIds, ["a", "b", "c"]);
  assert.equal(result.totalMinutes, 2);
  assert.equal(result.totalMiles, 1.2);
});

test("modeled route matrices provide a deterministic fallback from coordinates", () => {
  const matrix = modeledMatrix([
    { id: "a", lat: 32.22, lng: -110.91 },
    { id: "b", lat: 32.23, lng: -110.90 },
  ]);
  assert.equal(matrix.provider, "modeled_coordinates");
  assert.equal(matrix.distancesMeters.length, 2);
  assert.ok(matrix.durationsSeconds[0][1] > 0);
});
