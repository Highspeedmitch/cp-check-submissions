const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAPBOX_GEOCODING_URL,
  MAPBOX_MATRIX_URL,
  createMapboxPricingClient,
} = require("../services/mapboxPricing");

test("Mapbox address search uses v6, Tucson proximity, and returns safe candidates", async () => {
  let requestedUrl;
  const client = createMapboxPricingClient({
    environment: { MAPBOX_ACCESS_TOKEN: "test-mapbox-token" },
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          features: [{
            id: "address.1",
            geometry: { coordinates: [-110.88, 32.22] },
            properties: {
              mapbox_id: "address.1",
              full_address: "100 Example Road, Tucson, Arizona 85710, United States",
              match_code: { confidence: "high" },
              coordinates: { longitude: -110.88, latitude: 32.22, accuracy: "rooftop" },
            },
          }],
        }),
      };
    },
  });

  const results = await client.searchAddresses("100 Example Road, Tucson, AZ", {
    proximity: { lat: 32.25, lng: -110.93 },
  });
  assert.equal(`${requestedUrl.origin}${requestedUrl.pathname}`, MAPBOX_GEOCODING_URL);
  assert.equal(requestedUrl.searchParams.get("q"), "100 Example Road, Tucson, AZ");
  assert.equal(requestedUrl.searchParams.get("proximity"), "-110.93,32.25");
  assert.equal(requestedUrl.searchParams.get("types"), "address");
  assert.equal(requestedUrl.searchParams.get("autocomplete"), "false");
  assert.deepEqual(results, [{
    locationId: "address.1",
    label: "100 Example Road, Tucson, Arizona 85710, United States",
    lat: 32.22,
    lng: -110.88,
    confidence: "high",
    accuracy: "rooftop",
  }]);
  assert.equal(JSON.stringify(results).includes("test-mapbox-token"), false);
});

test("Mapbox driving matrix returns validated road distances and travel times", async () => {
  let requestedUrl;
  const client = createMapboxPricingClient({
    environment: { MAPBOX_ACCESS_TOKEN: "test-mapbox-token" },
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: "Ok",
          durations: [[0, 600], [660, 0]],
          distances: [[0, 8046.72], [8207.6544, 0]],
        }),
      };
    },
  });

  const matrix = await client.getDrivingMatrix([
    { name: "Operations base", lat: 32.25, lng: -110.93 },
    { name: "Candidate", lat: 32.22, lng: -110.88 },
  ]);
  assert.match(`${requestedUrl.origin}${requestedUrl.pathname}`, new RegExp(`^${MAPBOX_MATRIX_URL}`));
  assert.equal(requestedUrl.searchParams.get("annotations"), "duration,distance");
  assert.equal(matrix.profile, "mapbox/driving");
  assert.deepEqual(matrix.durationsSeconds, [[0, 600], [660, 0]]);
  assert.deepEqual(matrix.distancesMeters, [[0, 8046.72], [8207.6544, 0]]);
});

test("Mapbox configuration and provider failures never expose token or response details", async () => {
  let fetchCalls = 0;
  const missingTokenClient = createMapboxPricingClient({
    environment: {},
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("should not run");
    },
  });
  await assert.rejects(
    missingTokenClient.searchAddresses("100 Example Road, Tucson, AZ"),
    (error) => error.code === "PRICING_ROUTING_NOT_CONFIGURED"
      && error.fallbackEligible === true
  );
  assert.equal(fetchCalls, 0);

  const unauthorizedClient = createMapboxPricingClient({
    environment: { MAPBOX_ACCESS_TOKEN: "private-test-token" },
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  await assert.rejects(
    unauthorizedClient.searchAddresses("100 Example Road, Tucson, AZ"),
    (error) => error.code === "PRICING_ROUTING_AUTHORIZATION_FAILED"
      && !error.message.includes("private-test-token")
  );
});

test("Mapbox input and matrix validation fail safely", async () => {
  const client = createMapboxPricingClient({
    environment: { MAPBOX_ACCESS_TOKEN: "test-mapbox-token" },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ durations: [[0]], distances: [[0]] }),
    }),
  });
  await assert.rejects(client.searchAddresses("x"), /complete property address/);
  await assert.rejects(client.searchAddresses("bad;address"), /semicolon/);
  await assert.rejects(client.getDrivingMatrix([{ lat: 32.2, lng: -110.9 }]), /between 2 and 25/);
  await assert.rejects(client.getDrivingMatrix([
    { lat: 32.2, lng: -110.9 },
    { lat: 32.3, lng: -110.8 },
  ]), /incomplete matrix/);
});
