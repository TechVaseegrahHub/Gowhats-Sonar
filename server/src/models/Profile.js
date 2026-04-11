// models/Profile.js
const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  whatsappBusinessId: {
    type: String,
    required: true
  },
  accessToken: {
    type: String,
    required: true
  },
  profilePictureUrl: {
    type: String
  },
  // Other tenant properties
}, { timestamps: true });

// ✅ FIX: Changed model name to 'Profile' AND added the existence check
module.exports = mongoose.models.Profile || mongoose.model('Profile', profileSchema);
