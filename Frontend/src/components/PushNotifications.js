import { PushNotifications } from '@capacitor/push-notifications';

async function initPushNotifications() {
  // Request permission to receive notifications
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive === 'granted') {
    // Register with APNs
    await PushNotifications.register();
  } else {
    console.error('Push notification permission not granted');
  }

  // Listen for registration success
  PushNotifications.addListener('registration', token => {
    console.log('Push registration success, token: ', token.value);
    // You might want to send this token to your backend
  });

  // Listen for registration errors
  PushNotifications.addListener('registrationError', error => {
    console.error('Push registration error: ', error);
  });

  // Listen for incoming notifications (foreground)
  PushNotifications.addListener('pushNotificationReceived', notification => {
    console.log('Push notification received: ', notification);
    // You can display an in-app alert or update your state here
  });

  // Listen for notification actions (background/tapped notifications)
  PushNotifications.addListener('pushNotificationActionPerformed', notification => {
    console.log('Push notification action performed: ', notification);
    // Handle navigation or state updates based on the notification payload
  });
}

// Call this function in a useEffect in your App component
