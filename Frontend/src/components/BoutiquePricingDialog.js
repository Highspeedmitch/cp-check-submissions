import React, { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

const MAX_PROPERTIES = 3;
let nextBoutiquePropertyId = 1;

const PROPERTY_TYPE_LABELS = {
  free_standing: "Free standing",
  strip_mall: "Strip mall",
  individual_suite: "Individual suite",
};

const REVIEW_LABELS = {
  known_issues: "Known property concerns may affect the final scope and pricing.",
  routing_provider_fallback: "Live road routing was unavailable, so the coordinate fallback requires review.",
  travel_distance: "At least one trip exceeds the automatic Boutique travel range.",
};

function money(cents) {
  if (!Number.isFinite(Number(cents))) return "Not calculated";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(cents) / 100);
}

function newProperty() {
  return {
    id: `boutique-property-${nextBoutiquePropertyId++}`,
    address: "",
    candidate: null,
    locationResults: [],
    grossSquareFeet: "",
    propertyType: "free_standing",
  };
}

export function boutiqueEstimateSummaryText(estimate) {
  if (!estimate) return "";
  const propertyCount = estimate.inputs?.propertyCount || estimate.properties?.length || 0;
  return [
    `Afterlight Boutique estimate for ${propertyCount} ${propertyCount === 1 ? "property" : "properties"}.`,
    `${money(estimate.boutiqueService?.baseMonthlyFeeCents)} monthly organization fee plus ${money(estimate.estimatedMonthlyCents)} monthly visit service.`,
    `${money(estimate.boutiqueService?.estimatedContractMonthlyCents)} estimated contract total per month.`,
    estimate.requiresManualReview
      ? "Manual pricing review required before presenting a quote."
      : "No automatic manual-review flags were identified.",
  ].join(" ");
}

export default function BoutiquePricingDialog({ onClose }) {
  const [properties, setProperties] = useState(() => [newProperty()]);
  const [sameScheduledVisit, setSameScheduledVisit] = useState(true);
  const [hasKnownIssues, setHasKnownIssues] = useState(false);
  const [locationBusy, setLocationBusy] = useState("");
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function clearResult() {
    setEstimate(null);
    setError("");
    setMessage("");
  }

  function updateProperty(propertyId, changes) {
    setProperties((current) => current.map((property) => (
      property.id === propertyId ? { ...property, ...changes } : property
    )));
    clearResult();
  }

  function updateAddress(propertyId, address) {
    updateProperty(propertyId, { address, candidate: null, locationResults: [] });
  }

  async function searchAddress(property) {
    if (!property.address.trim() || locationBusy) return;
    setLocationBusy(property.id);
    setError("");
    setMessage("");
    try {
      const result = await api.post("/api/platform/pricing-locations", {
        query: property.address,
      });
      const locationResults = Array.isArray(result.results) ? result.results : [];
      if (!locationResults.length) {
        setError(`No matching address was found for ${property.address}.`);
      }
      setProperties((current) => current.map((item) => (
        item.id === property.id ? { ...item, locationResults } : item
      )));
    } catch (requestError) {
      setError(requestError.message || "Unable to search for the property address.");
    } finally {
      setLocationBusy("");
    }
  }

  function chooseLocation(propertyId, location) {
    updateProperty(propertyId, {
      address: location.label,
      candidate: {
        id: location.locationId,
        name: location.label,
        lat: Number(location.lat),
        lng: Number(location.lng),
      },
      locationResults: [],
    });
    setMessage("Property location confirmed.");
  }

  function addProperty() {
    if (properties.length >= MAX_PROPERTIES) return;
    setProperties((current) => [...current, newProperty()]);
    clearResult();
  }

  function removeProperty(propertyId) {
    if (properties.length <= 1) return;
    setProperties((current) => current.filter((property) => property.id !== propertyId));
    clearResult();
  }

  async function calculate(event) {
    event.preventDefault();
    if (busy) return;
    const invalidSize = properties.find((property) => {
      const squareFeet = Number(property.grossSquareFeet);
      return !Number.isInteger(squareFeet) || squareFeet < 1 || squareFeet >= 5000;
    });
    if (invalidSize) {
      setError("Every Boutique property must have a whole-number square footage below 5,000.");
      return;
    }
    if (properties.some((property) => !property.candidate)) {
      setError("Find and confirm the address for every Boutique property before calculating.");
      return;
    }
    setBusy(true);
    setEstimate(null);
    setError("");
    setMessage("");
    try {
      setEstimate(await api.post("/api/platform/pricing-estimate", {
        pricingMode: "boutique",
        properties: properties.map((property) => ({
          grossSquareFeet: Number(property.grossSquareFeet),
          propertyType: property.propertyType,
          candidate: property.candidate,
        })),
        sameScheduledVisit: properties.length === 1 ? true : sameScheduledVisit,
        hasKnownIssues,
      }));
    } catch (requestError) {
      setError(requestError.message || "Unable to calculate the Boutique estimate.");
    } finally {
      setBusy(false);
    }
  }

  async function copySummary() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(boutiqueEstimateSummaryText(estimate));
      setMessage("Boutique estimate summary copied.");
      setError("");
    } catch (_error) {
      setError("Unable to copy the estimate. Select the displayed values instead.");
    }
  }

  return (
    <div className="beta-dialog-overlay boutique-pricing-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy && !locationBusy) onClose();
    }}>
      <section className="beta-dialog boutique-pricing-dialog" role="dialog" aria-modal="true"
        aria-labelledby="boutique-pricing-title">
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Small-portfolio managed service</span>
            <h2 id="boutique-pricing-title">Boutique estimate</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close Boutique estimator"
            disabled={busy || Boolean(locationBusy)} onClick={onClose}>&times;</button>
        </div>
        <p className="beta-dialog-copy">
          Price one to three monthly Afterlight-serviced properties. Each property must be under 5,000 square feet; the $75 organization fee is included once.
        </p>

        <form className="boutique-pricing-form" onSubmit={calculate}>
          <div className="boutique-pricing-properties">
            {properties.map((property, index) => (
              <section className="boutique-pricing-property" key={property.id}
                aria-labelledby={`${property.id}-title`}>
                <div className="platform-pricing-property-heading">
                  <h3 id={`${property.id}-title`}>Property {index + 1}</h3>
                  {properties.length > 1 && (
                    <button type="button" className="beta-text-button" onClick={() => removeProperty(property.id)}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="platform-pricing-address-search">
                  <label className="beta-form-field" htmlFor={`${property.id}-address`}>
                    Property address
                    <input id={`${property.id}-address`} value={property.address} maxLength="240" required
                      onChange={(event) => updateAddress(property.id, event.target.value)} />
                  </label>
                  <button type="button" className="beta-button secondary"
                    disabled={!property.address.trim() || Boolean(locationBusy) || busy}
                    onClick={() => searchAddress(property)}>
                    {locationBusy === property.id ? "Finding..." : "Find address"}
                  </button>
                </div>
                {property.locationResults.length > 0 && (
                  <fieldset className="platform-pricing-location-results">
                    <legend>Confirm property {index + 1}</legend>
                    {property.locationResults.map((location) => (
                      <label key={location.locationId}>
                        <input type="radio" name={`${property.id}-location`}
                          onChange={() => chooseLocation(property.id, location)} />
                        <span><strong>{location.label}</strong><small>Mapbox match: {location.confidence}</small></span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {property.candidate && <p className="platform-pricing-location-confirmed">Confirmed: {property.candidate.name}</p>}
                <div className="beta-form-grid">
                  <label className="beta-form-field">
                    Gross square footage
                    <input type="number" min="1" max="4999" step="1" required
                      value={property.grossSquareFeet}
                      onChange={(event) => updateProperty(property.id, { grossSquareFeet: event.target.value })} />
                  </label>
                  <label className="beta-form-field">
                    Property type
                    <select value={property.propertyType}
                      onChange={(event) => updateProperty(property.id, { propertyType: event.target.value })}>
                      {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                        <option value={value} key={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
            ))}
          </div>

          <div className="boutique-pricing-controls">
            <button type="button" className="beta-button secondary" disabled={properties.length >= MAX_PROPERTIES || busy}
              onClick={addProperty}>Add property</button>
            <span>{properties.length} of {MAX_PROPERTIES} properties</span>
          </div>

          {properties.length > 1 && (
            <label className="beta-template-checkbox">
              <input type="checkbox" checked={sameScheduledVisit}
                onChange={(event) => { setSameScheduledVisit(event.target.checked); clearResult(); }} />
              Service these properties on the same monthly route and service date
            </label>
          )}
          <label className="beta-template-checkbox">
            <input type="checkbox" checked={hasKnownIssues}
              onChange={(event) => { setHasKnownIssues(event.target.checked); clearResult(); }} />
            Known site concerns are expected
          </label>

          {error && <p className="beta-alert error" role="alert">{error}</p>}
          {message && <p className="beta-alert success" role="status">{message}</p>}

          <div className="beta-dialog-actions">
            <button type="button" className="beta-button secondary" disabled={busy || Boolean(locationBusy)} onClick={onClose}>Close</button>
            <button type="submit" className="beta-button" disabled={busy || Boolean(locationBusy)}>
              {busy ? "Calculating..." : "Calculate Boutique estimate"}
            </button>
          </div>
        </form>

        {estimate && (
          <section className="boutique-pricing-result" aria-label="Boutique pricing result">
            <div className="beta-section-heading">
              <div><span className="beta-eyebrow">Formula {estimate.version}</span><h3>Boutique monthly estimate</h3></div>
              <button type="button" className="beta-button secondary compact" onClick={copySummary}>Copy summary</button>
            </div>
            <div className="platform-pricing-metrics boutique">
              <article><span>Organization fee</span><strong>{money(estimate.boutiqueService?.baseMonthlyFeeCents)}</strong></article>
              <article><span>Property work</span><strong>{money(estimate.baseVisitTotalCents)}</strong></article>
              <article><span>Travel adjustment</span><strong>{money(estimate.travelAdjustmentCents)}</strong></article>
              <article><span>Monthly contract total</span><strong>{money(estimate.boutiqueService?.estimatedContractMonthlyCents)}</strong></article>
            </div>
            <div className="platform-pricing-table-wrap">
              <table>
                <thead><tr><th>Property</th><th>Size</th><th>Type</th><th>Base work</th><th>Travel</th><th>Visit total</th></tr></thead>
                <tbody>{estimate.properties.map((property) => (
                  <tr key={property.index}>
                    <td>{property.name}</td>
                    <td>{Number(property.grossSquareFeet).toLocaleString()} sq ft</td>
                    <td>{PROPERTY_TYPE_LABELS[property.propertyType] || property.propertyType}</td>
                    <td>{money(property.baseVisitCents)}</td>
                    <td>{money(property.travelAdjustmentCents)}</td>
                    <td>{money(property.estimatedPerVisitCents ?? property.estimatedMonthlyCents)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="boutique-route-summary">
              <strong>{estimate.geography?.method === "road_matrix" ? "Road-matrix travel" : "Coordinate fallback"}</strong>
              {(estimate.geography?.trips || []).map((trip, index) => (
                <p key={`${index}-${trip.stopNames?.join("-")}`}>
                  {trip.stopNames?.join(" -> ") || `Trip ${index + 1}`} {" | "} {trip.roundTripMiles} mi {" | "} {trip.roundTripMinutes} min round trip
                </p>
              ))}
            </div>
            {estimate.requiresManualReview && (
              <div className="beta-alert warning" role="status">
                <strong>Manual pricing review required</strong>
                <ul>{estimate.manualReviewReasons.map((reason) => (
                  <li key={reason}>{REVIEW_LABELS[reason] || reason.replaceAll("_", " ")}</li>
                ))}</ul>
              </div>
            )}
          </section>
        )}
      </section>
    </div>
  );
}
