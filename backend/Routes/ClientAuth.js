const express = require("express");

const router = express.Router();

router.post("/register-client", async (req, res) => res.status(410).json({
  code: "INVITATION_REQUIRED",
  message: "Property owner registration requires an organization invitation.",
}));

module.exports = router;
