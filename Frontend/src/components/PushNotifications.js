// Frontend/src/components/PushNotifications.js

// Utility: Convert VAPID public key from URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
  
  // Register service worker and subscribe for push notifications
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.register('/sw.js')
      .then(swReg => {
        console.log('Service Worker is registered', swReg);
        return Notification.requestPermission();
      })
      .then(permission => {
        if (permission !== 'granted') {
          throw new Error('Notification permission not granted');
        }
        return navigator.serviceWorker.ready;
      })
      .then(swReg => {
        // Use the REACT_APP_ prefixed VAPID public key from your environment
        const vapidPublicKey = process.env.REACT_APP_VAPID_PUBLIC_KEY; 
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
        
        // Subscribe the user for push notifications
        return swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
      })
      .then(subscription => {
        console.log('User is subscribed:', subscription);
        // Send the subscription details to your server for storage.
        return fetch('/api/save-subscription', {
          method: 'POST',
          body: JSON.stringify(subscription),
          headers: {
            'Content-Type': 'application/json'
          }
        });
      })
      .catch(err => console.error('Service Worker Error', err));
  } else {
    console.warn('Push messaging is not supported');
  }
  