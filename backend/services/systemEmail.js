const nodemailer = require("nodemailer");

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function requiredEmailConfig() {
  const config = {
    tenantId: process.env.MICROSOFT_TENANT_ID,
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    senderAddress: process.env.SYSTEM_EMAIL_ADDRESS,
    senderName: process.env.SYSTEM_EMAIL_NAME || "Afterlight Notifications",
  };
  const missing = Object.entries(config)
    .filter(([key, value]) => key !== "senderName" && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(
      `Microsoft Graph email is not configured. Missing: ${missing.join(", ")}.`
    );
  }
  return config;
}

function senderHeader({ senderName, senderAddress }) {
  const safeName = String(senderName).replaceAll('"', "");
  return safeName ? `"${safeName}" <${senderAddress}>` : senderAddress;
}

async function acquireAccessToken({ forceRefresh = false } = {}) {
  const config = requiredEmailConfig();
  const now = Date.now();
  if (
    !forceRefresh
    && cachedAccessToken
    && cachedAccessTokenExpiresAt > now + TOKEN_EXPIRY_BUFFER_MS
  ) {
    return cachedAccessToken;
  }

  const tokenUrl =
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: GRAPH_SCOPE,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Microsoft Graph token request failed (${response.status}): ${detail.slice(0, 500)}`
    );
  }

  const token = await response.json();
  if (!token.access_token) {
    throw new Error("Microsoft Graph token response did not include an access token.");
  }
  cachedAccessToken = token.access_token;
  cachedAccessTokenExpiresAt = now + Number(token.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

async function createMimeMessage(mailOptions) {
  const config = requiredEmailConfig();
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  const result = await transport.sendMail({
    ...mailOptions,
    from: mailOptions.from || senderHeader(config),
  });
  return result.message;
}

async function graphSend(mimeMessage, accessToken) {
  const { senderAddress } = requiredEmailConfig();
  return fetch(
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(senderAddress)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/plain",
      },
      body: mimeMessage.toString("base64"),
    }
  );
}

async function sendSystemEmail(mailOptions) {
  const mimeMessage = await createMimeMessage(mailOptions);
  let accessToken = await acquireAccessToken();
  let response = await graphSend(mimeMessage, accessToken);
  if (response.status === 401) {
    accessToken = await acquireAccessToken({ forceRefresh: true });
    response = await graphSend(mimeMessage, accessToken);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Microsoft Graph sendMail failed (${response.status}): ${detail.slice(0, 500)}`
    );
  }
  return {
    accepted: true,
    status: response.status,
    sender: requiredEmailConfig().senderAddress,
  };
}

function resetTokenCache() {
  cachedAccessToken = null;
  cachedAccessTokenExpiresAt = 0;
}

module.exports = {
  sendSystemEmail,
  requiredEmailConfig,
  resetTokenCache,
};
