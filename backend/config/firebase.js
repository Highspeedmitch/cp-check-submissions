const admin = require("firebase-admin");

function initializeFirebase(env = process.env) {
  const configured = Boolean(
    env.FIREBASE_PROJECT_ID
    && env.FIREBASE_CLIENT_EMAIL
    && env.FIREBASE_PRIVATE_KEY
  );
  if (!configured || admin.apps.length) return configured;
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
  return true;
}

module.exports = { initializeFirebase };
