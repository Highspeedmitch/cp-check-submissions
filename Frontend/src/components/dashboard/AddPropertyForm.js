import React, { useEffect, useReducer, useRef, useState } from "react";
import { api } from "../../services/api";

const initialForm = {
  name: "",
  emails: "",
  lat: "",
  lng: "",
  address: "",
  billingAddress: "",
  propertyCode: "",
  defaultAmount: "",
  apMethod: "download",
  apDestination: "",
  propertyManagerId: "",
};

function formReducer(state, action) {
  if (action.type === "field") {
    return { ...state, [action.name]: action.value };
  }
  if (action.type === "coordinates") {
    return { ...state, lat: action.lat, lng: action.lng };
  }
  if (action.type === "reset") return initialForm;
  return state;
}

function AddPropertyForm({ orgType, onCreate, onClose }) {
  const [form, dispatch] = useReducer(formReducer, initialForm);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [propertyManagers, setPropertyManagers] = useState([]);
  const formRef = useRef(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    api.get("/api/admin-users")
      .then((data) => {
        setPropertyManagers(
          (data.users || []).filter(
            (user) => user.role === "property_manager" && user.accountStatus !== "inactive"
          )
        );
      })
      .catch(() => setError("Unable to load property managers."));
  }, []);

  const setField = (name) => (event) => {
    dispatch({ type: "field", name, value: event.target.value });
    setError("");
  };

  const handleGeocode = async (event) => {
    event.preventDefault();
    if (!form.address) {
      alert("Please enter an address to geocode.");
      return;
    }
    const mapboxToken = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) {
      console.error("REACT_APP_MAPBOX_ACCESS_TOKEN is not configured.");
      alert("Address lookup is temporarily unavailable.");
      return;
    }

    setBusy("geocode");
    try {
      const baseUrl = "https://api.mapbox.com/geocoding/v5/mapbox.places/";
      const url = `${baseUrl}${encodeURIComponent(form.address)}.json?access_token=${mapboxToken}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!data.features?.length) {
        alert("No geocoding results found. Please refine the address.");
        return;
      }
      const [lng, lat] = data.features[0].center;
      dispatch({
        type: "coordinates",
        lat: lat.toString(),
        lng: lng.toString(),
      });
      alert(`Geocoded to: ${lat}, ${lng}`);
    } catch (geocodeError) {
      console.error("Geocoding error:", geocodeError);
      alert("Error geocoding address. Check console.");
    } finally {
      setBusy("");
    }
  };

  const handleCreate = async () => {
    if (busy) return;
    setBusy("create");
    setError("");
    try {
      await onCreate(form);
    } catch (createError) {
      setError(createError.message || "Unable to create the property.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="add-property-form" ref={formRef}>
      <h3>Add New Property</h3>
      <label>
        Property Name:
        <input type="text" value={form.name} onChange={setField("name")} />
      </label>
      <label>
        Emails (comma-separated):
        <textarea value={form.emails} onChange={setField("emails")} />
      </label>
      <label>
        Physical Property Address (will geocode):
        <input type="text" value={form.address} onChange={setField("address")} />
      </label>
      <label>
        Assign to property manager (optional):
        <select
          value={form.propertyManagerId}
          onChange={setField("propertyManagerId")}
        >
          <option value="">Leave unassigned</option>
          {propertyManagers.map((manager) => (
            <option key={manager._id} value={manager._id}>
              {manager.username} ({manager.email})
            </option>
          ))}
        </select>
      </label>
      {orgType === "COM" && (
        <>
          <label>
            Invoice Billing Address:
            <input
              type="text"
              required
              value={form.billingAddress}
              onChange={setField("billingAddress")}
            />
          </label>
          <label>
            Brokerage Property Code:
            <input
              type="text"
              required
              value={form.propertyCode}
              onChange={setField("propertyCode")}
            />
          </label>
          <label>
            Default Check Amount (optional):
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.defaultAmount}
              onChange={setField("defaultAmount")}
            />
          </label>
          <label>
            AP Delivery:
            <select value={form.apMethod} onChange={setField("apMethod")}>
              <option value="download">Manual download</option>
              <option value="email">Email</option>
              <option value="portal">AP portal</option>
            </select>
          </label>
          {form.apMethod !== "download" && (
            <label>
              {form.apMethod === "email" ? "AP Email:" : "AP Portal / Instructions:"}
              <input
                type={form.apMethod === "email" ? "email" : "text"}
                value={form.apDestination}
                onChange={setField("apDestination")}
              />
            </label>
          )}
        </>
      )}
      <button
        onClick={handleGeocode}
        style={{ marginBottom: "1rem" }}
        disabled={Boolean(busy)}
      >
        {busy === "geocode" ? "Geocoding…" : "Geocode"}
      </button>
      <div style={{ marginBottom: "1rem" }}>
        <small>Lat: {form.lat || "N/A"}</small>
        <br />
        <small>Lng: {form.lng || "N/A"}</small>
      </div>
      {error && <p className="beta-alert error" role="alert">{error}</p>}
      <button onClick={handleCreate} disabled={Boolean(busy)}>
        {busy === "create" ? "Creating…" : "Create"}
      </button>
      <button disabled={Boolean(busy)} onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export default AddPropertyForm;
