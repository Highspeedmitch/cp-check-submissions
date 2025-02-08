// Frontend/src/components/PushNotifications.js

// Utility: Convert VAPID public key from URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
  
  // Initialize Push Notifications
  export function initPushNotifications() {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service workers are not supported in this browser');
      return;
    }
  
    if (!('PushManager' in window)) {
      console.warn('⚠️ Push notifications are not supported in this browser');
      return;
    }
  
    // Step 1: Ask for notification permission before registering the service worker
    Notification.requestPermission().then(permission => {
      if (permission !== 'granted') {
        console.error('❌ Notification permission denied by user');
        return;
      }
  
      // Step 2: Register the service worker
      navigator.serviceWorker.register('/sw.js')
        .then(swReg => {
          console.log('✅ Service Worker Registered:', swReg);
  
          return navigator.serviceWorker.ready;
        })
        .then(swReg => {
          const vapidPublicKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
          const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
  
          // Step 3: Subscribe user to push notifications
          return swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
        })
        .then(subscription => {
          console.log('📌 User is subscribed:', subscription);
  
          // Step 4: Send subscription to backend
          return fetch('/api/save-subscription', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: { 'Content-Type': 'application/json' }
          });
        })
        .catch(err => console.error('❌ Push Notification Error:', err));
    });
  }
  