const rateLimit = require("express-rate-limit");

function limiter({ windowMs, limit, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    ...(keyGenerator ? { keyGenerator, validate: false } : {}),
  });
}

const apiLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: "Too many requests. Please try again later.",
});

const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many sign-in attempts. Please try again later.",
});

const mfaLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many MFA attempts. Please try again later.",
});

const accountRecoveryLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: "Too many account recovery attempts. Please try again later.",
});

const registrationLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: "Too many registration attempts. Please try again later.",
});

const uploadLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many uploads. Please wait before trying again.",
  keyGenerator: (req) => String(req.user?.userId || req.ip),
});

const calendarFeedLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  message: "Too many calendar refreshes. Please try again later.",
});

const invoiceEmailActionLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many invoice approval attempts. Please wait before trying again.",
});

module.exports = {
  apiLimiter,
  loginLimiter,
  mfaLimiter,
  accountRecoveryLimiter,
  registrationLimiter,
  uploadLimiter,
  calendarFeedLimiter,
  invoiceEmailActionLimiter,
};
