const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const {
  apiLimiter,
  calendarFeedLimiter,
  invoiceEmailActionLimiter,
} = require("./middleware/rateLimits");
const authenticateToken = require("./middleware/authenticateToken");
const requireCurrentOrganizationPresence = require("./middleware/requireCurrentOrganizationPresence");
const { getAllowedFrontendOrigins } = require("./utils/frontendUrls");
const mongoose = require("mongoose");
const { setupBackendErrorHandler } = require("./monitoring");

function createApp({ isReady = () => mongoose.connection.readyState === 1 } = {}) {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/health", (req, res) => {
    res.set("Cache-Control", "no-store");
    const ready = isReady();
    return res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "unavailable",
      service: "afterlight-api",
    });
  });
  app.use(cors({
    origin: getAllowedFrontendOrigins(),
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true,
  }));
  app.use(
    "/api/integrations/ses-events",
    apiLimiter,
    express.text({ type: ["application/json", "text/plain"], limit: "256kb" }),
    require("./Routes/sesEvents")
  );
  app.use("/api", apiLimiter);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));
  app.use(cookieParser());

  app.use(
    "/api/invoice-email-actions",
    invoiceEmailActionLimiter,
    require("./Routes/invoiceEmailActions")
  );

  app.use(
    "/calendar",
    calendarFeedLimiter,
    require("./Routes/calendarFeed").publicRouter
  );

  app.use("/api/properties", authenticateToken, require("./Routes/properties"));
  app.use("/api/profits", require("./Routes/profits"));
  app.use("/api/billing", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/billing"));
  app.use("/api/admin-users", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/adminUsers"));
  app.use("/api/bulk-onboarding", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/bulkOnboarding"));
  app.use("/api/organization-security", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/organizationSecurity"));
  app.use("/api/onboarding", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/onboarding"));
  app.use("/api/fulfillment", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/fulfillment"));
  app.use("/api/service-model-changes", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/serviceModelChanges"));
  app.use("/api/bid-requests", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/bidRequests"));
  app.use("/api/notifications", authenticateToken, require("./Routes/notifications"));
  app.use("/api/inspection-templates", authenticateToken, require("./Routes/inspectionTemplates"));
  app.use("/api/inspection-jobs", authenticateToken, require("./Routes/inspectionJobs"));
  app.use("/api/reporting", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/reporting"));
  app.use("/api/platform", require("./Routes/platform"));
  app.use("/api/platform-resources", require("./Routes/platformResources"));
  app.use("/api/resource-workspace", authenticateToken, require("./Routes/resourceWorkspace"));
  app.use("/api/calendar-feed", authenticateToken, require("./Routes/calendarFeed"));
  app.use("/api/client", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/ClientRoutes"));
  app.use("/api/airbnb-calendar", require("./Routes/airbnbCalendar"));
  app.use("/api/azroots/properties", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/azrootsProperties"));

  app.use("/api", require("./Routes/auth"));
  app.use("/api", require("./Routes/ClientAuth"));
  app.use("/api", require("./Routes/assignments"));
  app.use("/api/invitations", require("./Routes/invitations"));
  app.use("/api", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/submissions"));
  app.use("/api/admin", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/propertyAdministration"));
  app.use("/api/access-instructions", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/accessInstructions"));
  app.use("/api", authenticateToken, requireCurrentOrganizationPresence, require("./Routes/organizationDirectory"));

  setupBackendErrorHandler(app);
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error("Unhandled API error:", error);
    return res.status(500).json({ error: "An unexpected server error occurred." });
  });

  return app;
}

module.exports = { createApp };
