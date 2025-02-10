// models/organization.js
const mongoose = require('mongoose');

const PropertySchema = new mongoose.Schema({
    name: { type: String, required: true },
    lat: { type: Number },
    lng: { type: Number },
    emails: { type: [String], default: [] },
    accessInstructions: { type: String, default: "" },
    customFields: [
        {
            name: { type: String, required: true }, // Field name
            type: { type: String, enum: ["text", "yesno"], required: true } // Field type
        }
    ]
});

const OrganizationSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    orgType: { 
        type: String, 
        enum: ["COM", "RES", "LTR", "STR"], // Allowed organization types
        required: true 
    },
    properties: { type: [PropertySchema], default: [] },
});

module.exports = mongoose.model('Organization', OrganizationSchema);