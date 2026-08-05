const crypto = require("node:crypto");

const certificateCache = new Map();
const CERTIFICATE_CACHE_MS = 60 * 60 * 1000;
const MAX_CERTIFICATE_BYTES = 64 * 1024;

const SIGNED_FIELDS = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
};

function parseTopicArn(topicArn) {
  const parts = String(topicArn || "").split(":");
  if (parts.length < 6 || parts[0] !== "arn" || parts[2] !== "sns") {
    throw new Error("SNS message contains an invalid topic ARN.");
  }
  return {
    partition: parts[1],
    region: parts[3],
    accountId: parts[4],
    topicName: parts.slice(5).join(":"),
  };
}

function snsDnsSuffix(partition) {
  if (partition === "aws-cn") return "amazonaws.com.cn";
  if (partition === "aws-iso") return "c2s.ic.gov";
  if (partition === "aws-iso-b") return "sc2s.sgov.gov";
  if (partition === "aws-iso-e") return "cloud.adc-e.uk";
  if (partition === "aws-iso-f") return "csp.hci.ic.gov";
  return "amazonaws.com";
}

function assertTrustedSnsUrl(value, topicArn, { certificate = false } = {}) {
  const topic = parseTopicArn(topicArn);
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("SNS URL must use trusted HTTPS transport.");
  }

  const suffix = snsDnsSuffix(topic.partition);
  const allowedHosts = new Set([
    `sns.${topic.region}.${suffix}`,
    `sns-signing.${topic.region}.${suffix}`,
  ]);
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("SNS URL does not match the notification topic region.");
  }
  if (certificate) {
    if (url.search || url.hash || !/^\/SimpleNotificationService-[A-Za-z0-9_-]+\.pem$/.test(url.pathname)) {
      throw new Error("SNS signing certificate URL is invalid.");
    }
  }
  return url;
}

function buildCanonicalSnsMessage(message) {
  const fields = SIGNED_FIELDS[message?.Type];
  if (!fields) throw new Error("Unsupported SNS message type.");
  return fields
    .filter((field) => message[field] !== undefined && message[field] !== null)
    .sort()
    .map((field) => `${field}\n${message[field]}\n`)
    .join("");
}

async function fetchSigningCertificate(url, { fetchImpl = global.fetch } = {}) {
  const cached = certificateCache.get(url.href);
  if (cached && cached.expiresAt > Date.now()) return cached.pem;
  if (typeof fetchImpl !== "function") throw new Error("SNS certificate retrieval is unavailable.");

  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Unable to retrieve the SNS signing certificate.");
  const pem = await response.text();
  if (!pem || Buffer.byteLength(pem, "utf8") > MAX_CERTIFICATE_BYTES) {
    throw new Error("SNS signing certificate response is invalid.");
  }

  const certificate = new crypto.X509Certificate(pem);
  const now = Date.now();
  if (now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo)) {
    throw new Error("SNS signing certificate is outside its validity period.");
  }
  if (!/(?:^|\n)CN=(?:sns|sns-signing)[^\n,]*/i.test(certificate.subject)) {
    throw new Error("SNS signing certificate has an unexpected subject.");
  }

  certificateCache.set(url.href, {
    pem,
    expiresAt: Math.min(now + CERTIFICATE_CACHE_MS, Date.parse(certificate.validTo)),
  });
  return pem;
}

async function verifySnsMessage(message, {
  expectedTopicArn = process.env.SES_EVENT_TOPIC_ARN,
  loadCertificate = fetchSigningCertificate,
} = {}) {
  if (!expectedTopicArn) throw new Error("SES event topic is not configured.");
  if (message?.TopicArn !== expectedTopicArn) throw new Error("SNS message came from an unexpected topic.");
  if (message.SignatureVersion !== "2") throw new Error("SNS message must use signature version 2.");
  if (!message.Signature || !message.SigningCertURL) throw new Error("SNS message signature is incomplete.");

  const certificateUrl = assertTrustedSnsUrl(message.SigningCertURL, expectedTopicArn, { certificate: true });
  const certificate = await loadCertificate(certificateUrl);
  const valid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(buildCanonicalSnsMessage(message), "utf8"),
    certificate,
    Buffer.from(message.Signature, "base64")
  );
  if (!valid) throw new Error("SNS message signature is invalid.");
  return true;
}

async function confirmSnsSubscription(message, {
  expectedTopicArn = process.env.SES_EVENT_TOPIC_ARN,
  fetchImpl = global.fetch,
} = {}) {
  const url = assertTrustedSnsUrl(message?.SubscribeURL, expectedTopicArn);
  if (typeof fetchImpl !== "function") throw new Error("SNS subscription confirmation is unavailable.");
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("SNS subscription confirmation failed.");
}

module.exports = {
  assertTrustedSnsUrl,
  buildCanonicalSnsMessage,
  confirmSnsSubscription,
  parseTopicArn,
  verifySnsMessage,
};
