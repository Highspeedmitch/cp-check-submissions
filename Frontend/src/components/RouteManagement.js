import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import PageHeader from "./ui/PageHeader";

const EMPTY_ROUTE = { name: "", region: "", propertyIds: [] };

function id(value) {
  return String(value?._id || value || "");
}

export default function RouteManagement() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [properties, setProperties] = useState([]);
  const [regions, setRegions] = useState([]);
  const [maxProperties, setMaxProperties] = useState(6);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState(EMPTY_ROUTE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [routeData, propertyData] = await Promise.all([
        api.get("/api/service-routes?includeArchived=true"),
        api.get("/api/properties"),
      ]);
      setRoutes(routeData.routes || []);
      setRegions((routeData.regions || []).filter((region) => region !== "Uncategorized"));
      setMaxProperties(routeData.maxPropertiesPerRoute || 6);
      setProperties(propertyData || []);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load routes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeRoutes = routes.filter((route) => route.status !== "archived");
  const archivedRoutes = routes.filter((route) => route.status === "archived");
  const currentRoute = routes.find((route) => id(route) === editingId);
  const propertyById = useMemo(() => new Map(properties.map((property) => [id(property), property])), [properties]);
  const matchingProperties = properties.filter((property) => (
    String(property.region || "Uncategorized").toLowerCase() === draft.region.toLowerCase()
  ));
  const routeByPropertyId = useMemo(() => {
    const result = new Map();
    activeRoutes.forEach((route) => (route.propertyIds || []).forEach((propertyId) => {
      if (id(route) !== editingId) result.set(String(propertyId), route.name);
    }));
    return result;
  }, [activeRoutes, editingId]);

  function startNew() {
    setEditingId("");
    setDraft({ ...EMPTY_ROUTE, region: regions[0] || "" });
    setMessage("");
    setError("");
  }

  function editRoute(route) {
    setEditingId(id(route));
    setDraft({
      name: route.name,
      region: route.region,
      propertyIds: (route.propertyIds || []).map(String),
    });
    setMessage("");
    setError("");
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  function toggleProperty(propertyId, checked) {
    const value = String(propertyId);
    setDraft((current) => ({
      ...current,
      propertyIds: checked
        ? [...current.propertyIds, value].slice(0, maxProperties)
        : current.propertyIds.filter((item) => item !== value),
    }));
  }

  function moveStop(index, direction) {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.propertyIds.length) return current;
      const propertyIds = [...current.propertyIds];
      [propertyIds[index], propertyIds[nextIndex]] = [propertyIds[nextIndex], propertyIds[index]];
      return { ...current, propertyIds };
    });
  }

  async function suggestOrder() {
    if (busy || draft.propertyIds.length < 2) return;
    setBusy("suggest");
    setMessage("");
    setError("");
    try {
      const result = await api.post("/api/service-routes/suggest-order", {
        propertyIds: draft.propertyIds,
      });
      setDraft((current) => ({ ...current, propertyIds: result.orderedPropertyIds || current.propertyIds }));
      setMessage(`${result.message} Estimated travel between stops: ${result.totalMiles} miles / ${result.totalMinutes} minutes.`);
    } catch (err) {
      setError(err.message || "Unable to suggest a stop order.");
    } finally {
      setBusy("");
    }
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy("save");
    setMessage("");
    setError("");
    try {
      const result = editingId
        ? await api.put(`/api/service-routes/${editingId}`, draft)
        : await api.post("/api/service-routes", draft);
      setMessage(result.message || (editingId ? "Route updated." : "Route created."));
      setEditingId("");
      setDraft({ ...EMPTY_ROUTE, region: regions[0] || "" });
      await load();
    } catch (err) {
      setError(err.message || "Unable to save the route.");
    } finally {
      setBusy("");
    }
  }

  async function changeStatus(route, status) {
    const verb = status === "archived" ? "archive" : "restore";
    if (status === "archived" && !window.confirm(
      `Archive ${route.name}? Existing scheduled route assignments will remain unchanged.`
    )) return;
    setBusy(`${verb}-${id(route)}`);
    setMessage("");
    setError("");
    try {
      const result = await api.put(`/api/service-routes/${id(route)}/status`, { status });
      setMessage(result.message || `Route ${verb}d.`);
      if (editingId === id(route)) startNew();
      await load();
    } catch (err) {
      setError(err.message || `Unable to ${verb} the route.`);
    } finally {
      setBusy("");
    }
  }

  const renderRoute = (route) => (
    <article className={`beta-route-card${route.status === "archived" ? " archived" : ""}`} key={id(route)}>
      <div className="beta-route-card-heading">
        <div>
          <span className="beta-eyebrow">{route.region}</span>
          <h3>{route.name}</h3>
          <p>{route.properties.length} stop{route.properties.length === 1 ? "" : "s"} · Version {route.version}</p>
        </div>
        <span className={`beta-status ${route.status === "archived" ? "declined" : "success"}`}>
          {route.status}
        </span>
      </div>
      <ol className="beta-route-stop-summary">
        {(route.properties || []).map((property) => (
          <li key={id(property)}><span>{property.stopIndex + 1}</span><div><strong>{property.name}</strong><small>{property.physicalAddress || "Address not configured"}</small></div></li>
        ))}
      </ol>
      <div className="beta-card-actions">
        {route.status !== "archived" ? (
          <>
            <button type="button" className="beta-button secondary compact" onClick={() => editRoute(route)}>Edit route</button>
            <button type="button" className="beta-button danger compact" disabled={Boolean(busy)} onClick={() => changeStatus(route, "archived")}>Archive</button>
          </>
        ) : (
          <button type="button" className="beta-button secondary compact" disabled={Boolean(busy)} onClick={() => changeStatus(route, "active")}>Restore route</button>
        )}
      </div>
    </article>
  );

  return (
    <div className="beta-page">
      <main className="beta-page-shell">
        <PageHeader
          onBack={() => navigate("/dashboard")}
          eyebrow="Organization administration"
          title="Regions & Routes"
          subtitle="Build ordered, reusable groups of nearby properties for scheduling and work access."
          actions={<button type="button" className="beta-button" onClick={startNew}>+ New route</button>}
        />

        {message && <p className="beta-alert success" role="status">{message}</p>}
        {error && <p className="beta-alert error" role="alert">{error}</p>}

        <section className="beta-panel beta-route-editor" aria-labelledby="route-editor-title">
          <div className="beta-section-heading">
            <div>
              <p className="beta-eyebrow">{editingId ? "Edit route" : "New route"}</p>
              <h2 id="route-editor-title">{editingId ? currentRoute?.name || "Edit route" : "Define a route"}</h2>
              <p>Choose one region and order 2 to {maxProperties} stops. Saving an edit changes future user and resource scope; existing scheduled work keeps its snapshot.</p>
            </div>
          </div>
          <form onSubmit={save}>
            <div className="beta-form-grid">
              <label className="beta-form-field">Route name
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Tucson - East/Central" required />
              </label>
              <label className="beta-form-field">Region
                <select value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value, propertyIds: [] })} required>
                  <option value="">Select a named region</option>
                  {regions.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
              </label>
            </div>

            {draft.region && (
              <div className="beta-route-builder">
                <fieldset className="beta-property-access">
                  <legend>Properties in {draft.region}</legend>
                  {!matchingProperties.length && <p>No properties currently use this region.</p>}
                  {matchingProperties.map((property) => {
                    const conflict = routeByPropertyId.get(id(property));
                    const checked = draft.propertyIds.includes(id(property));
                    const limitReached = !checked && draft.propertyIds.length >= maxProperties;
                    return (
                      <label key={id(property)} className={conflict ? "is-disabled" : ""}>
                        <input type="checkbox" checked={checked} disabled={Boolean(conflict) || limitReached}
                          onChange={(event) => toggleProperty(id(property), event.target.checked)} />
                        <span><strong>{property.name}</strong><small>{conflict ? `Already in ${conflict}` : property.physicalAddress || "Address not configured"}</small></span>
                      </label>
                    );
                  })}
                </fieldset>

                <section className="beta-route-order" aria-label="Ordered route stops">
                  <div className="beta-route-order-heading">
                    <div><strong>Suggested stop order</strong><small>{draft.propertyIds.length}/{maxProperties} stops selected</small></div>
                    <div className="beta-route-order-tools">
                      <small>The field operative sees this order as guidance.</small>
                      <button type="button" className="beta-button secondary compact"
                        disabled={Boolean(busy) || draft.propertyIds.length < 2}
                        onClick={suggestOrder}>{busy === "suggest" ? "Optimizing…" : "Suggest efficient order"}</button>
                    </div>
                  </div>
                  {!draft.propertyIds.length && <p className="beta-empty-state">Select properties to build the ordered stop list.</p>}
                  <ol>
                    {draft.propertyIds.map((propertyId, index) => {
                      const property = propertyById.get(propertyId);
                      return (
                        <li key={propertyId}>
                          <span className="beta-route-stop-number">{index + 1}</span>
                          <div><strong>{property?.name || "Property"}</strong><small>{property?.physicalAddress || "Address not configured"}</small></div>
                          <div className="beta-route-order-actions">
                            <button type="button" disabled={index === 0} onClick={() => moveStop(index, -1)} aria-label={`Move ${property?.name || "property"} earlier`}>↑</button>
                            <button type="button" disabled={index === draft.propertyIds.length - 1} onClick={() => moveStop(index, 1)} aria-label={`Move ${property?.name || "property"} later`}>↓</button>
                            <button type="button" onClick={() => toggleProperty(propertyId, false)} aria-label={`Remove ${property?.name || "property"}`}>×</button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {draft.propertyIds.length >= 2 && <small className="beta-route-order-note">
                    The suggestion minimizes travel between selected stops. The first stop is not tied to an operative's home or shift origin, so the reverse order may also be practical.
                  </small>}
                </section>
              </div>
            )}

            <div className="beta-card-actions">
              {editingId && <button type="button" className="beta-button secondary" onClick={startNew}>Cancel edit</button>}
              <button type="submit" className="beta-button" disabled={Boolean(busy) || draft.propertyIds.length < 2 || draft.propertyIds.length > maxProperties}>
                {busy === "save" ? "Saving…" : editingId ? "Save route changes" : "Create route"}
              </button>
            </div>
          </form>
        </section>

        <section className="beta-route-directory" aria-labelledby="active-routes-title">
          <div className="beta-section-heading"><div><h2 id="active-routes-title">Active routes</h2><p>Route membership grants future eligibility for every constituent property.</p></div></div>
          {loading ? <div className="beta-empty-state">Loading routes…</div>
            : activeRoutes.length ? <div className="beta-route-grid">{activeRoutes.map(renderRoute)}</div>
              : <div className="beta-empty-state">No active routes have been created.</div>}
        </section>

        {archivedRoutes.length > 0 && (
          <section className="beta-route-directory" aria-labelledby="archived-routes-title">
            <div className="beta-section-heading"><div><h2 id="archived-routes-title">Archived routes</h2><p>Existing scheduled work is retained; archived routes no longer grant future scope.</p></div></div>
            <div className="beta-route-grid">{archivedRoutes.map(renderRoute)}</div>
          </section>
        )}
      </main>
    </div>
  );
}
