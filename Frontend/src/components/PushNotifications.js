import React, { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../services/api";
import {
  clearNotificationBannerSnooze,
  notificationBannerIsSnoozed,
  snoozeNotificationBanner,
  withNotificationSetupTimeout,
} from "../services/notificationBanner";

const API = apiUrl("/api/notifications");

class NotificationSetupError extends Error {
  constructor(message, status = "unavailable") {
    super(message);
    this.name = "NotificationSetupError";
    this.status = status;
  }
}

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
    throw new NotificationSetupError(
      "On iPhone or iPad, add Afterlight to your Home Screen before enabling notifications.",
      "install_required"
    );
  }
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    throw new NotificationSetupError(
      "Notifications are not supported in this browser.",
      "unsupported"
    );
  }
  let permission = window.Notification?.permission || "default";
  if (requestPermission && permission !== "granted") {
    permission = await window.Notification.requestPermission();
  }
  if (permission !== "granted") return permission;

  const registration = await withNotificationSetupTimeout(
    navigator.serviceWorker.register("/service-worker.js"),
    "The notification service took too long to start. Please try again."
  );
  const keyResponse = await withNotificationSetupTimeout(
    fetch(`${API}/web-push-key`, { headers: authHeaders() }),
    "The notification configuration request timed out. Please try again."
  );
  const { publicKey } = await responseBody(keyResponse, "Web Push is not configured.");
  let subscription = await withNotificationSetupTimeout(
    registration.pushManager.getSubscription(),
    "The browser did not return its notification subscription. Please try again."
  );
  if (!subscription) {
    subscription = await withNotificationSetupTimeout(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }),
      "The browser could not finish enabling notifications. Please try again."
    );
  }
  const saveResponse = await withNotificationSetupTimeout(
    fetch(`${API}/web-subscriptions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        deviceId: getDeviceId(),
      }),
    }),
    "Afterlight could not finish saving this device. Please try again."
  );
  await responseBody(saveResponse, "Unable to register Web Push.");
  return permission;
}

export default function PushNotifications({ enabled }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [snoozed, setSnoozed] = useState(
    () => notificationBannerIsSnoozed(window.localStorage)
  );
  const registrationAttempt = useRef(0);
  const isNative = Capacitor.isNativePlatform();

  const register = useCallback(async (requestPermission = false) => {
    const attempt = ++registrationAttempt.current;
    try {
      setStatus(requestPermission ? "registering" : "checking");
      if (!isNative) {
        const result = await registerWebPush(requestPermission);
        if (attempt !== registrationAttempt.current) return;
        if (result === "granted") {
          clearNotificationBannerSnooze(window.localStorage);
          setSnoozed(false);
          setStatus("enabled");
        } else {
          setStatus(result === "denied" ? "denied" : "needs_permission");
        }
        setError("");
        return;
      }

      const supported = await FirebaseMessaging.isSupported();
      if (attempt !== registrationAttempt.current) return;
      if (!supported.isSupported) {
        setStatus("unsupported");
        return;
      }
      let status = await FirebaseMessaging.checkPermissions();
      if (requestPermission && status.receive !== "granted") {
        status = await FirebaseMessaging.requestPermissions();
      }
      if (attempt !== registrationAttempt.current) return;
      if (status.receive === "granted") {
        const { token } = await FirebaseMessaging.getToken();
        await saveNativeToken(token);
        if (attempt !== registrationAttempt.current) return;
        clearNotificationBannerSnooze(window.localStorage);
        setSnoozed(false);
        setStatus("enabled");
        setError("");
      } else {
        setStatus(status.receive === "denied" ? "denied" : "needs_permission");
      }
    } catch (registrationError) {
      if (attempt !== registrationAttempt.current) return;
      console.warn("Notification setup did not complete:", registrationError);
      const browserGranted = !isNative && window.Notification?.permission === "granted";
      setError(registrationError.message || "Notification setup did not complete.");
      setStatus(
        browserGranted
          ? "sync_error"
          : registrationError.status || "unavailable"
      );
    }
  }, [isNative]);

  const dismiss = () => {
    registrationAttempt.current += 1;
    snoozeNotificationBanner(window.localStorage);
    setSnoozed(true);
  };

  useEffect(() => {
    if (!enabled || process.env.NODE_ENV === "test") return undefined;
    const handles = [];
    let active = true;

    if (isNative) {
      Promise.all([
        FirebaseMessaging.addListener("tokenReceived", ({ token }) => {
          saveNativeToken(token).catch((tokenError) => setError(tokenError.message));
        }),
        FirebaseMessaging.addListener("notificationReceived", () => {
          window.dispatchEvent(new Event("afterlight-notification-received"));
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
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") register(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      handles.forEach((handle) => handle.remove());
    };
  }, [enabled, isNative, navigate, register]);

  if (
    !enabled
    || snoozed
    || ["checking", "enabled", "unsupported"].includes(status)
  ) {
    return null;
  }

  const content = {
    needs_permission: "Enable notifications to receive important workflow updates.",
    registering: "Connecting notifications…",
    denied: "Notifications are blocked in this browser. You can enable them in the browser's site settings.",
    install_required: error,
    sync_error: "Notifications are allowed, but this device could not be connected. You can retry now or continue without them.",
    unavailable: error || "Notifications are temporarily unavailable.",
  }[status] || error || "Notifications are temporarily unavailable.";

  const canRetry = ["needs_permission", "sync_error", "unavailable"].includes(status);

  return (
    <aside className="notification-permission-banner" role="status">
      <span>{content}</span>
      <div className="notification-permission-actions">
        {canRetry && (
          <button type="button" onClick={() => register(true)}>
            {status === "needs_permission" ? "Enable Notifications" : "Retry"}
          </button>
        )}
        <button type="button" className="notification-dismiss-button" onClick={dismiss}>
          {status === "denied" ? "Dismiss" : "Not Now"}
        </button>
      </div>
    </aside>
  );
}
