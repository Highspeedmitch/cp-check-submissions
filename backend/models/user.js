// user.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  role: { type: String, enum: ['admin', 'user'], default: 'user' }, //Add role field, default user
  resetPasswordToken: { type: String, default: null },  // Ensure this field exists
  resetPasswordExpires: { type: Date, default: null }   // Ensure this field exists
});

module.exports = mongoose.model('User', UserSchema);
