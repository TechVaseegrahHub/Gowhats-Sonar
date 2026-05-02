// models/DeviceSession.js
const mongoose = require('mongoose');

const deviceSessionSchema = new mongoose.Schema({
  // ✅ FIX: Removed "unique: true" so multiple users can register on the same device ID
  device_id:    { type: String, required: true },
  account_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenant_id:    { type: String, required: true },
  session_name: { type: String, default: 'Unknown Device' },
  person_name:  { type: String, default: '' },
  role: {
    type: String,
    enum:['customer_care', 'manager', 'admin', 'accountant', 'developer'],
    required: true
  },
  access_code:  { type: String, default: null },   // ← per-user PIN (shared across their devices)
  browser:      { type: String, default: '' },
  os:           { type: String, default: '' },
  gpu:          { type: String, default: '' },
  cpu_cores:    { type: Number, default: 0 },
  ram:          { type: Number, default: 0 },
  ip_address:   { type: String, default: '' },
  is_online:    { type: Boolean, default: true },
  last_seen_at: { type: Date, default: Date.now },
  is_active:    { type: Boolean, default: true },
  expires_at: {
    type: Date,
    default: () => {
      const d = new Date();
      d.setDate(d.getDate() + 90);
      return d;
    }
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

// Indexes
// ✅ FIX: Added composite unique index (One active session per user, per device)
deviceSessionSchema.index({ device_id: 1, account_id: 1 }, { unique: true }); 
deviceSessionSchema.index({ tenant_id: 1 });
deviceSessionSchema.index({ account_id: 1 });
deviceSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 }); // TTL — auto delete after 90 days

module.exports = mongoose.models.DeviceSession
  || mongoose.model('DeviceSession', deviceSessionSchema);
