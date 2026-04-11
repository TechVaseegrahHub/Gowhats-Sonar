const mongoose = require('mongoose');

const referralPayoutSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReferralPartner',
      required: true,
      index: true
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReferralClient',
      required: true,
      index: true
    },
    tenantId: { type: String, required: true, index: true },
    batchMonth: { type: String, required: true, index: true },
    currency: { type: String, default: 'INR' },
    amount: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'failed'],
      default: 'pending'
    },
    provider: { type: String, default: 'razorpay' },
    providerPayoutId: { type: String, default: '', index: true },
    providerStatus: { type: String, default: '' },
    note: { type: String, default: '' },
    initiatedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: '' },
    responsePayload: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

referralPayoutSchema.index({ clientId: 1, batchMonth: 1 }, { unique: true });
referralPayoutSchema.index({ partnerId: 1, status: 1, batchMonth: 1 });

module.exports = mongoose.models.ReferralPayout || mongoose.model('ReferralPayout', referralPayoutSchema);

