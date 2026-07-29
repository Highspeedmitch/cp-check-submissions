const AWS = require("aws-sdk");
const nodemailer = require("nodemailer");

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;
const DEFAULT_PROVIDER = "graph";

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function emailProvider() {
  return String(process.env.SYSTEM_EMAIL_PROVIDER || DEFAULT_PROVIDER)
    .trim()
    .toLowerCase();
}

function requireValues(config, ignoredKeys, providerLabel) {
  const missing = Object.entries(config)
    .filter(([key, value]) => !ignoredKeys.includes(key) && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(
      `${providerLabel} email is not configured. Missing: ${missing.join(", ")}.`
    );
  }
}

function requiredEmailConfig(provider = emailProvider()) {
  const common = {
    provider,
    senderAddress: process.env.SYSTEM_EMAIL_ADDRESS,
    senderName: process.env.SYSTEM_EMAIL_NAME || "Afterlight Notifications",
  };

  if (provider === "ses") {
    const config = {
      ...common,
      region: process.env.SES_REGION,
      accessKeyId: process.env.SES_ACCESS_KEY_ID,
      secretAccessKey: process.env.SES_SECRET_ACCESS_KEY,
    };
    requireValues(config, ["provider", "senderName"], "Amazon SES");
    return config;
  }

  if (provider === "graph") {
    const config = {
      ...common,
      tenantId: process.env.MICROSOFT_TENANT_ID,
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    };
    requireValues(config, ["provider", "senderName"], "Microsoft Graph");
    return config;
  }

  throw new Error(
    `Unsupported system email provider "${provider}". Expected "ses" or "graph".`
  );
}

function senderHeader({ senderName, senderAddress }) {
  const safeName = String(senderName).replaceAll('"', "");
  return safeName ? `"${safeName}" <${senderAddress}>` : senderAddress;
}

async function acquireAccessToken(config, { forceRefresh = false } = {}) {
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

async function createMimeMessage(mailOptions, config) {
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

async function graphSend(mimeMessage, accessToken, config) {
  return fetch(
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(config.senderAddress)}/sendMail`,
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

function createSesClient(config) {
  return new AWS.SES({
    apiVersion: "2010-12-01",
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function sendWithSes(mimeMessage, config, sesClient = createSesClient(config)) {
  const result = await sesClient.sendRawEmail({
    Source: config.senderAddress,
    RawMessage: { Data: mimeMessage },
  }).promise();
  return {
    accepted: true,
    provider: "ses",
    messageId: result.MessageId,
    sender: config.senderAddress,
  };
}

async function sendWithGraph(mimeMessage, config) {
  let accessToken = await acquireAccessToken(config);
  let response = await graphSend(mimeMessage, accessToken, config);
  if (response.status === 401) {
    accessToken = await acquireAccessToken(config, { forceRefresh: true });
    response = await graphSend(mimeMessage, accessToken, config);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Microsoft Graph sendMail failed (${response.status}): ${detail.slice(0, 500)}`
    );
  }
  return {
    accepted: true,
    provider: "graph",
    status: response.status,
    sender: config.senderAddress,
  };
}

async function sendSystemEmail(mailOptions, dependencies = {}) {
  const config = requiredEmailConfig();
  const mimeMessage = await createMimeMessage(mailOptions, config);
  if (config.provider === "ses") {
    return sendWithSes(mimeMessage, config, dependencies.sesClient);
  }
  return sendWithGraph(mimeMessage, config);
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
