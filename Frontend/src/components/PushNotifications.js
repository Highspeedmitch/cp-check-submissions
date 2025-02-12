import { useEffect } from "react";
import { PushNotifications } from "@capacitor/push-notifications";
export async function registerPush() {
  try {
      let permStatus = await PushNotifications.requestPermissions();
      if (permStatus.receive === 'granted') {
          await PushNotifications.register();
          console.log("✅ Push notifications registered!");

          PushNotifications.addListener('registration', (token) => {
              console.log("🔥 Push token received:", token.value);

              // Send this token to your backend
              fetch("https://cp-check-submissions-dev-backend.onrender.com/api/register-push-token", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId: localStorage.getItem("userId"), token: token.value })
              }).then(() => console.log("✅ Push token stored in backend!"))
                .catch(err => console.error("❌ Error storing token:", err));
          });

          PushNotifications.addListener('registrationError', (error) => {
              console.error("❌ Push registration error:", error);
          });

          PushNotifications.addListener('pushNotificationReceived', (notification) => {
              console.log("🔔 Push received:", notification);
          });
      }
  } catch (error) {
      console.error("❌ Push notification setup failed:", error);
  }
}
function PushNotificationsComponent() {
  useEffect(() => {
    const registerForPushNotifications = async () => {
      try {
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === "prompt") {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== "granted") {
          console.error("Push Notifications permission not granted");
          return;
        }

        await PushNotifications.register();

        PushNotifications.addListener("registration", (token) => {
          console.log("Push registration success:", token.value);
          // Send token to backend
          fetch("https://cp-check-submissions-dev-backend.onrender.com/api/save-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value }),
          });
        });

        PushNotifications.addListener("registrationError", (error) => {
          console.error("Push registration error:", error);
        });

        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.log("Push received:", notification);
          alert(`New notification: ${notification.title} - ${notification.body}`);
        });

        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("Push action:", action);
        });
      } catch (error) {
        console.error("Push Notifications error:", error);
      }
    };

    registerForPushNotifications();
  }, []);

  return null;
}
export async function registerPush() {
    try {
        let permStatus = await PushNotifications.requestPermissions();
        if (permStatus.receive === 'granted') {
            await PushNotifications.register();
            console.log("Push notifications registered!");
        }
    } catch (error) {
        console.error("Push notification registration failed:", error);
    }
}
export default PushNotificationsComponent;
