// models/organization.js
const mongoose = require('mongoose');

const PropertySchema = new mongoose.Schema({
    name: { type: String, required: true },
    emails: { type: [String], default: [] }, // Emails specific to this property
});

const OrganizationSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    properties: { type: [PropertySchema], default: [] }, // Array of properties with their emails
});

module.exports = mongoose.model('Organization', OrganizationSchema);
