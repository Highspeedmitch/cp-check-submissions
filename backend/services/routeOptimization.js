const { haversineMiles } = require("./pricingGeography");

const METERS_PER_MILE = 1609.344;

function routeMetric(matrix, fromIndex, toIndex) {
  const durationSeconds = Number(matrix?.durationsSeconds?.[fromIndex]?.[toIndex]);
  const distanceMeters = Number(matrix?.distancesMeters?.[fromIndex]?.[toIndex]);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0
    || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new Error("Routing could not connect every selected property.");
  }
  return { durationSeconds, distanceMeters };
}

function exactOpenRoute(points, matrix) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 6) {
    throw new Error("Route ordering requires between 2 and 6 properties.");
  }
  let best = null;
  const used = new Array(points.length).fill(false);
  const order = [];

  function visit(totalDurationSeconds, totalDistanceMeters) {
    if (order.length === points.length) {
      const signature = order.map((index) => String(points[index].id)).join("|");
      if (!best
        || totalDurationSeconds < best.totalDurationSeconds
        || (totalDurationSeconds === best.totalDurationSeconds
          && totalDistanceMeters < best.totalDistanceMeters)
        || (totalDurationSeconds === best.totalDurationSeconds
          && totalDistanceMeters === best.totalDistanceMeters
          && signature < best.signature)) {
        best = {
          indices: [...order],
          signature,
          totalDurationSeconds,
          totalDistanceMeters,
        };
      }
      return;
    }

    for (let index = 0; index < points.length; index += 1) {
      if (used[index]) continue;
      let duration = totalDurationSeconds;
      let distance = totalDistanceMeters;
      if (order.length) {
        const leg = routeMetric(matrix, order[order.length - 1], index);
        duration += leg.durationSeconds;
        distance += leg.distanceMeters;
        if (best && duration > best.totalDurationSeconds) continue;
      }
      used[index] = true;
      order.push(index);
      visit(duration, distance);
      order.pop();
      used[index] = false;
    }
  }

  visit(0, 0);
  return {
    orderedPropertyIds: best.indices.map((index) => String(points[index].id)),
    totalMinutes: Number((best.totalDurationSeconds / 60).toFixed(1)),
    totalMiles: Number((best.totalDistanceMeters / METERS_PER_MILE).toFixed(1)),
  };
}

function modeledMatrix(points, { averageMilesPerHour = 25, roadDistanceFactor = 1.2 } = {}) {
  const distancesMeters = points.map((from) => points.map((to) => (
    haversineMiles(from, to) * roadDistanceFactor * METERS_PER_MILE
  )));
  return {
    provider: "modeled_coordinates",
    profile: "approximate",
    distancesMeters,
    durationsSeconds: distancesMeters.map((row) => row.map((meters) => (
      ((meters / METERS_PER_MILE) / averageMilesPerHour) * 60 * 60
    ))),
  };
}

module.exports = { exactOpenRoute, modeledMatrix };
