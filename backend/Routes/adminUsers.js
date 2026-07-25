const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Organization = require("../models/organization");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const {
  normalizeAccountStatus,
  isValidAccountStatus,
} = require("../utils/accountStatus");

const router = express.Router();
const editableRoles = ["user", "property_manager", "contractor", "cleaner"];

router.use((req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  next();
});

router.get("/", async (req, res) => {
  const [organization, users] = await Promise.all([
    Organization.findById(req.user.organizationId).lean(),
    User.find({
      organizationId: req.user.organizationId,
      role: { $in: editableRoles },
    }).select("username email role accountStatus tokenVersion").sort({ username: 1 }).lean(),
  ]);
  res.json({
    users,
    properties: organization.properties.map((property) => ({
      _id: property._id,
      name: property.name,
      propertyManagers: property.propertyManagers || [],
    })),
  });
});

router.put("/:userId", async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.userId,
      organizationId: req.user.organizationId,
      role: { $ne: "admin" },
    });
    if (!user) return res.status(404).json({ error: "Editable user not found." });

    const { username, email, role, accountStatus, propertyIds = [] } = req.body;
    const normalizedAccountStatus = normalizeAccountStatus(accountStatus);
    if (!username?.trim() || !email?.trim()) {
      return res.status(400).json({ error: "Name and email are required." });
    }
    if (!editableRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role." });
    }
    if (!isValidAccountStatus(normalizedAccountStatus)) {
      return res.status(400).json({ error: "Invalid account status." });
    }
    const duplicate = await User.findOne({
      _id: { $ne: user._id },
      email: email.trim().toLowerCase(),
    });
    if (duplicate) return res.status(409).json({ error: "That email is already in use." });

    const organization = await Organization.findById(req.user.organizationId);
    const validPropertyIds = new Set(organization.properties.map((property) => property._id.toString()));
    const assignedIds = new Set(propertyIds.map(String));
    if ([...assignedIds].some((id) => !validPropertyIds.has(id))) {
      return res.status(400).json({ error: "One or more properties are outside this organization." });
    }
    if (role !== "property_manager") assignedIds.clear();

    const before = {
      username: user.username,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
    };
    organization.properties.forEach((property) => {
      property.propertyManagers = (property.propertyManagers || [])
        .filter((id) => id.toString() !== user._id.toString());
      if (assignedIds.has(property._id.toString())) property.propertyManagers.push(user._id);
    });
    user.username = username.trim();
    user.email = email.trim().toLowerCase();
    user.role = role;
    user.accountStatus = normalizedAccountStatus;
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await Promise.all([
      organization.save(),
      user.save(),
      UserAudit.create({
        organizationId: req.user.organizationId,
        targetUserId: user._id,
        changedBy: req.user.userId,
        action: "user_updated",
        changes: {
          before,
          after: {
            username: user.username,
            email: user.email,
            role,
            accountStatus: normalizedAccountStatus,
          },
          propertyIds: [...assignedIds],
        },
      }),
    ]);
    res.json({ success: true, user });
  } catch (error) {
    console.error("User management update error:", error);
    res.status(500).json({ error: "Unable to update user." });
  }
});

router.post("/:userId/send-password-reset", async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.userId,
      organizationId: req.user.organizationId,
      role: { $ne: "admin" },
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "highspeedmitch@gmail.com", pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: "highspeedmitch@gmail.com",
      to: user.email,
      subject: "Password Reset Request",
      text: `Click the link to reset your password: https://cp-check-submissions-dev.onrender.com/reset-password?token=${resetToken}`,
    });
    await UserAudit.create({
      organizationId: req.user.organizationId,
      targetUserId: user._id,
      changedBy: req.user.userId,
      action: "password_reset_sent",
    });
    res.json({ message: "Password reset link sent." });
  } catch (error) {
    res.status(500).json({ error: "Unable to send password reset." });
  }
});

router.get("/:userId/audit", async (req, res) => {
  const audits = await UserAudit.find({
    organizationId: req.user.organizationId,
    targetUserId: req.params.userId,
  }).populate("changedBy", "username email").sort({ createdAt: -1 }).limit(50).lean();
  res.json(audits);
});

module.exports = router;
