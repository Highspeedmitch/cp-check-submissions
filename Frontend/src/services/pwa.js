export const PWA_UPDATE_EVENT = "afterlight-pwa-update";

function announceUpdate(registration) {
  window.dispatchEvent(new CustomEvent(PWA_UPDATE_EVENT, { detail: { registration } }));
}

export async function getPwaRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/service-worker.js");
}

export function registerPwa() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  const register = async () => {
    try {
      const registration = await getPwaRegistration();
      if (!registration) return;
      if (registration.waiting) announceUpdate(registration);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            announceUpdate(registration);
          }
        });
      });
      registration.update().catch(() => {});
    } catch (error) {
      console.warn("Afterlight offline support could not start:", error);
    }
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export function activatePwaUpdate(registration) {
  registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
}
