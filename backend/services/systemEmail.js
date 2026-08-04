const AWS = require("aws-sdk");
const nodemailer = require("nodemailer");

function requireValues(config, ignoredKeys) {
  const missing = Object.entries(config)
    .filter(([key, value]) => !ignoredKeys.includes(key) && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(
      `Amazon SES email is not configured. Missing: ${missing.join(", ")}.`
    );
  }
}

function requiredEmailConfig() {
  const config = {
    provider: "ses",
    senderAddress: process.env.SYSTEM_EMAIL_ADDRESS,
    senderName: process.env.SYSTEM_EMAIL_NAME || "Afterlight Notifications",
    region: process.env.SES_REGION,
    accessKeyId: process.env.SES_ACCESS_KEY_ID,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY,
    sessionToken: process.env.SES_SESSION_TOKEN || "",
  };
  requireValues(config, ["provider", "senderName", "sessionToken"]);
  return config;
}

function senderHeader({ senderName, senderAddress }) {
  const safeName = String(senderName).replaceAll('"', "");
  return safeName ? `"${safeName}" <${senderAddress}>` : senderAddress;
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

function createSesClient(config) {
  const credentials = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };
  if (config.sessionToken) credentials.sessionToken = config.sessionToken;
  return new AWS.SES({
    apiVersion: "2010-12-01",
    region: config.region,
    credentials,
  });
}

async function sendWithSes(mimeMessage, config, sesClient = createSesClient(config)) {
  const result = await sesClient.sendRawEmail({
    Source: config.senderAddress,
    RawMessage: { Data: mimeMessage },
  }).promise();
  return {
    accepted: true,
    status: "accepted",
    provider: "ses",
    messageId: result.MessageId,
    sender: config.senderAddress,
  };
}

async function sendSystemEmail(mailOptions, dependencies = {}) {
  const config = requiredEmailConfig();
  const mimeMessage = await createMimeMessage(mailOptions, config);
  return sendWithSes(mimeMessage, config, dependencies.sesClient);
}

module.exports = {
  sendSystemEmail,
  requiredEmailConfig,
};
