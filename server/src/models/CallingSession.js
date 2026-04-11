const mongoose = require('mongoose');

const callingSessionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  callId:   { type: String, required: true, unique: true },
  customerPhone: { type: String, required: true },
  direction: { type: String, enum: ['BUSINESS_INITIATED', 'USER_INITIATED'] },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'accepted', 'rejected', 'completed', 'failed', 'terminated'],
    default: 'initiated'
  },
  sdpOffer:  String,
  sdpAnswer: String,
  startedAt: Date,
  endedAt:   Date,
  duration:  Number, // seconds from Meta webhook
  permissionType: { type: String, enum: ['temporary', 'permanent'] }
}, { timestamps: true });

module.exports = mongoose.model('CallingSession', callingSessionSchema);
