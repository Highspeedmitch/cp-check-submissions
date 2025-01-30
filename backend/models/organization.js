const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    properties: [String], // List of property names
    emails: [String], // List of recipients
});

module.exports = mongoose.model('Organization', OrganizationSchema);
