import React, { useEffect, useState } from "react";
import { activatePwaUpdate, PWA_UPDATE_EVENT } from "../services/pwa";

export default function PwaUpdateBanner() {
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    const handleUpdate = (event) => setRegistration(event.detail?.registration || null);
    window.addEventListener(PWA_UPDATE_EVENT, handleUpdate);
    return () => window.removeEventListener(PWA_UPDATE_EVENT, handleUpdate);
  }, []);

  if (!registration) return null;
  return (
    <aside className="pwa-update-banner" role="status">
      <span>An Afterlight update is ready.</span>
      <button type="button" onClick={() => activatePwaUpdate(registration)}>Update now</button>
    </aside>
  );
}
