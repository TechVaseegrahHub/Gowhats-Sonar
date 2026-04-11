// models/DeviceSession.js  (FULL REPLACEMENT)
const mongoose = require('mongoose');

const deviceSessionSchema = new mongoose.Schema({
  device_id:    { type: String, required: true, unique: true },
  account_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenant_id:    { type: String, required: true },
  session_name: { type: String, default: 'Unknown Device' },
  person_name:  { type: String, default: '' },          // ← NEW: who registered this device
  role: {
    type: String,
    enum: ['customer_care', 'manager', 'admin', 'accountant', 'developer'],
    required: true
  },
  browser:      { type: String, default: '' },
  os:           { type: String, default: '' },
  gpu:          { type: String, default: '' },
  cpu_cores:    { type: Number, default: 0 },
  ram:          { type: Number, default: 0 },
  ip_address:   { type: String, default: '' },
  is_online:    { type: Boolean, default: true },
  last_seen_at: { type: Date, default: Date.now },
  is_active:    { type: Boolean, default: true },
  expires_at:   { type: Date, default: () => {           // ← NEW: 90-day expiry
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d;
  }},
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

deviceSessionSchema.index({ tenant_id: 1 });
deviceSessionSchema.index({ account_id: 1 });
deviceSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 }); // TTL index — auto delete

module.exports = mongoose.models.DeviceSession
  || mongoose.model('DeviceSession', deviceSessionSchema);
