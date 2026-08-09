const { normalizePoint } = require("./pricingGeography");

const MAPBOX_GEOCODING_URL = "https://api.mapbox.com/search/geocode/v6/forward";
const MAPBOX_MATRIX_URL = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving";
const MAPBOX_REQUEST_TIMEOUT_MS = 5000;
const MAPBOX_MATRIX_MAX_COORDINATES = 25;

class PricingRoutingError extends Error {
  constructor(message, {
    code = "PRICING_ROUTING_UNAVAILABLE",
    status = 503,
    fallbackEligible = false,
  } = {}) {
    super(message);
    this.name = "PricingRoutingError";
    this.code = code;
    this.status = status;
    this.fallbackEligible = fallbackEligible;
  }
}

function mapboxAccessToken(environment = process.env) {
  const token = String(environment.MAPBOX_ACCESS_TOKEN || "").trim();
  if (!token) {
    throw new PricingRoutingError("Road routing is not configured.", {
      code: "PRICING_ROUTING_NOT_CONFIGURED",
      fallbackEligible: true,
    });
  }
  return token;
}

function normalizeAddressQuery(query) {
  const normalized = String(query || "").trim().replace(/\s+/g, " ");
  if (normalized.length < 5) {
    throw new PricingRoutingError("Enter a complete property address.", {
      code: "PRICING_ADDRESS_REQUIRED",
      status: 400,
    });
  }
  if (normalized.length > 240) {
    throw new PricingRoutingError("The property address must be 240 characters or fewer.", {
      code: "PRICING_ADDRESS_TOO_LONG",
      status: 400,
    });
  }
  if (normalized.includes(";")) {
    throw new PricingRoutingError("The property address cannot contain a semicolon.", {
      code: "PRICING_ADDRESS_INVALID",
      status: 400,
    });
  }
  return normalized;
}

function providerFailure(status) {
  if (status === 401 || status === 403) {
    return new PricingRoutingError("Road routing authorization is unavailable.", {
      code: "PRICING_ROUTING_AUTHORIZATION_FAILED",
      fallbackEligible: true,
    });
  }
  if (status === 422) {
    return new PricingRoutingError("Mapbox could not process the requested locations.", {
      code: "PRICING_ROUTING_INVALID_LOCATIONS",
      status: 422,
      fallbackEligible: true,
    });
  }
  return new PricingRoutingError("Road routing is temporarily unavailable.", {
    fallbackEligible: true,
  });
}

async function requestJson(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response?.ok) throw providerFailure(response?.status);
    try {
      return await response.json();
    } catch (_error) {
      throw new PricingRoutingError("Road routing returned an invalid response.", {
        code: "PRICING_ROUTING_INVALID_RESPONSE",
        fallbackEligible: true,
      });
    }
  } catch (error) {
    if (error instanceof PricingRoutingError) throw error;
    if (error?.name === "AbortError") {
      throw new PricingRoutingError("Road routing timed out.", {
        code: "PRICING_ROUTING_TIMEOUT",
        fallbackEligible: true,
      });
    }
    throw new PricingRoutingError("Road routing is temporarily unavailable.", {
      code: "PRICING_ROUTING_REQUEST_FAILED",
      fallbackEligible: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function addressResult(feature) {
  const properties = feature?.properties || {};
  const coordinates = properties.coordinates || {};
  const longitude = Number(coordinates.longitude ?? feature?.geometry?.coordinates?.[0]);
  const latitude = Number(coordinates.latitude ?? feature?.geometry?.coordinates?.[1]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return null;
  }
  const name = String(properties.name_preferred || properties.name || "").trim();
  const place = String(properties.place_formatted || "").trim();
  const label = String(properties.full_address || [name, place].filter(Boolean).join(", ")).trim();
  if (!label) return null;
  return {
    locationId: String(properties.mapbox_id || feature.id || `${longitude},${latitude}`),
    label,
    lat: latitude,
    lng: longitude,
    confidence: String(properties.match_code?.confidence || "unknown"),
    accuracy: coordinates.accuracy ? String(coordinates.accuracy) : null,
  };
}

function validateMatrix(matrix, pointCount, label) {
  if (!Array.isArray(matrix) || matrix.length !== pointCount) {
    throw new PricingRoutingError("Road routing returned an incomplete matrix.", {
      code: "PRICING_ROUTING_INVALID_RESPONSE",
      fallbackEligible: true,
    });
  }
  matrix.forEach((row) => {
    if (!Array.isArray(row) || row.length !== pointCount
      || row.some((value) => value !== null
        && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      throw new PricingRoutingError(`Road routing returned invalid ${label}.`, {
        code: "PRICING_ROUTING_INVALID_RESPONSE",
        fallbackEligible: true,
      });
    }
  });
  return matrix.map((row) => row.map((value) => (value === null ? null : Number(value))));
}

function createMapboxPricingClient({
  fetchImpl = globalThis.fetch,
  environment = process.env,
  timeoutMs = MAPBOX_REQUEST_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for Mapbox pricing.");
  }

  return {
    async searchAddresses(query, { proximity } = {}) {
      const token = mapboxAccessToken(environment);
      const normalizedQuery = normalizeAddressQuery(query);
      const url = new URL(MAPBOX_GEOCODING_URL);
      url.searchParams.set("q", normalizedQuery);
      url.searchParams.set("access_token", token);
      url.searchParams.set("types", "address");
      url.searchParams.set("country", "US");
      url.searchParams.set("language", "en");
      url.searchParams.set("autocomplete", "false");
      url.searchParams.set("limit", "5");
      if (proximity) {
        const point = normalizePoint(proximity, "Pricing search proximity");
        url.searchParams.set("proximity", `${point.lng},${point.lat}`);
      }
      const data = await requestJson(url, { fetchImpl, timeoutMs });
      const results = (Array.isArray(data?.features) ? data.features : [])
        .map(addressResult)
        .filter(Boolean);
      return results.filter((result, index) => results.findIndex((candidate) => (
        candidate.label === result.label
        && candidate.lat === result.lat
        && candidate.lng === result.lng
      )) === index);
    },

    async getDrivingMatrix(points) {
      const token = mapboxAccessToken(environment);
      if (!Array.isArray(points) || points.length < 2
        || points.length > MAPBOX_MATRIX_MAX_COORDINATES) {
        throw new PricingRoutingError(
          `Road routing requires between 2 and ${MAPBOX_MATRIX_MAX_COORDINATES} locations.`,
          { code: "PRICING_ROUTING_LOCATION_COUNT", status: 400 }
        );
      }
      const normalizedPoints = points.map((point, index) => (
        normalizePoint(point, `Routing location ${index + 1}`)
      ));
      const coordinates = normalizedPoints
        .map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`)
        .join(";");
      const url = new URL(`${MAPBOX_MATRIX_URL}/${coordinates}`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("annotations", "duration,distance");
      const data = await requestJson(url, { fetchImpl, timeoutMs });
      if (data?.code && data.code !== "Ok") throw providerFailure(422);
      return {
        provider: "mapbox",
        profile: "mapbox/driving",
        durationsSeconds: validateMatrix(data?.durations, normalizedPoints.length, "travel times"),
        distancesMeters: validateMatrix(data?.distances, normalizedPoints.length, "road distances"),
      };
    },
  };
}

module.exports = {
  MAPBOX_GEOCODING_URL,
  MAPBOX_MATRIX_URL,
  MAPBOX_REQUEST_TIMEOUT_MS,
  MAPBOX_MATRIX_MAX_COORDINATES,
  PricingRoutingError,
  mapboxAccessToken,
  normalizeAddressQuery,
  createMapboxPricingClient,
};
