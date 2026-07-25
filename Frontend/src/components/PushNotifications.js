import React, { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { useNavigate } from "react-router-dom";

const API = "https://cp-check-submissions-dev-backend.onrender.com/api/notifications";

function getDeviceId() {
  let deviceId = localStorage.getItem("notificationDeviceId");
  if (!deviceId) {
    deviceId = window.crypto?.randomUUID?.()
      || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("notificationDeviceId", deviceId);
  }
  return deviceId;
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  };
}

async function responseBody(response, fallback) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function saveNativeToken(token) {
  if (!token) return;
  const response = await fetch(`${API}/devices`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      token,
      platform: Capacitor.getPlatform(),
      deviceId: getDeviceId(),
    }),
  });
  await responseBody(response, "Unable to register native notifications.");
}

async function registerWebPush(requestPermission) {
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  if (isAppleMobile && !isStandalone) {
    throw new Error("On iPhone or iPad, add this app to your Home Screen before enabling notifications.");
  }
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    throw new Error("Web Push is not available. On iPhone, add this app to your Home Screen first.");
  }
  let permission = window.Notification?.permission || "default";
  if (requestPermission && permission !== "granted") {
    permission = await window.Notification.requestPermission();
  }
  if (permission !== "granted") return permission;

  const registration = await navigator.serviceWorker.register("/service-worker.js");
  const keyResponse = await fetch(`${API}/web-push-key`, {
    headers: authHeaders(),
  });
  const { publicKey } = await responseBody(keyResponse, "Web Push is not configured.");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const saveResponse = await fetch(`${API}/web-subscriptions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceId: getDeviceId(),
    }),
  });
  await responseBody(saveResponse, "Unable to register Web Push.");
  return permission;
}

export default function PushNotifications({ enabled }) {
  const navigate = useNavigate();
  const [permission, setPermission] = useState("unknown");
  const [error, setError] = useState("");
  const isNative = Capacitor.isNativePlatform();

  const register = useCallback(async (requestPermission = false) => {
    try {
      if (!isNative) {
        const result = await registerWebPush(requestPermission);
        setPermission(result);
        setError("");
        return;
      }

      const supported = await FirebaseMessaging.isSupported();
      if (!supported.isSupported) {
        setPermission("unsupported");
        return;
      }
      let status = await FirebaseMessaging.checkPermissions();
      if (requestPermission && status.receive !== "granted") {
        status = await FirebaseMessaging.requestPermissions();
      }
      setPermission(status.receive);
      if (status.receive === "granted") {
        const { token } = await FirebaseMessaging.getToken();
        await saveNativeToken(token);
        setError("");
      }
    } catch (registrationError) {
      setError(registrationError.message);
      setPermission("unavailable");
    }
  }, [isNative]);

  useEffect(() => {
    if (!enabled || process.env.NODE_ENV === "test") return undefined;
    const handles = [];
    let active = true;

    if (isNative) {
      Promise.all([
        FirebaseMessaging.addListener("tokenReceived", ({ token }) => {
          saveNativeToken(token).catch((tokenError) => setError(tokenError.message));
        }),
        FirebaseMessaging.addListener("notificationActionPerformed", ({ notification }) => {
          const route = notification?.data?.route;
          if (typeof route === "string" && route.startsWith("/")) navigate(route);
        }),
      ]).then((listeners) => {
        if (active) handles.push(...listeners);
        else listeners.forEach((handle) => handle.remove());
      });
    }

    register(false);
    return () => {
      active = false;
      handles.forEach((handle) => handle.remove());
    };
  }, [enabled, isNative, navigate, register]);

  if (!enabled || permission === "granted") return null;

  return (
    <aside className="notification-permission-banner" role="status">
      <span>
        {error || "Enable notifications to receive assignment and payment updates."}
      </span>
      {permission !== "denied" && (
        <button type="button" onClick={() => register(true)}>
          Enable Notifications
        </button>
      )}
    </aside>
  );
}
