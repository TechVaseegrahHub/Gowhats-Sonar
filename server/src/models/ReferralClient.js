const mongoose = require('mongoose');

const referralClientSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReferralPartner',
      required: true,
      index: true
    },
    tenantId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    referralCode: { type: String, required: true, uppercase: true, trim: true },
    partnerBusinessName: { type: String, required: true, trim: true },
    clientName: { type: String, default: '' },
    clientBusinessName: { type: String, default: '' },
    clientEmail: { type: String, default: '' },
    clientPhone: { type: String, default: '' },
    countryCode: { type: String, default: '' },
    currency: { type: String, default: 'INR' },
    baseSubscriptionAmount: { type: Number, default: 0 },
    referralAddonAmount: { type: Number, default: 0 },
    subscriptionAmount: { type: Number, default: 0 },
    partnerShareAmount: { type: Number, default: 0 },
    gowhatsShareAmount: { type: Number, default: 0 },
    sharePercent: { type: Number, default: 50 },
    plan: {
      type: String,
      enum: ['free_trial', 'pro'],
      default: 'free_trial'
    },
    status: {
      type: String,
      enum: ['signed_up', 'payment_pending', 'commission_pending', 'payout_processing', 'payout_paid', 'payout_failed'],
      default: 'signed_up'
    },
    paymentStatus: {
      type: String,
      enum: ['not_started', 'pending', 'paid', 'failed'],
      default: 'not_started'
    },
    signedUpAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    signupMonthKey: { type: String, default: '' },
    paymentMonthKey: { type: String, default: '' },
    lastActivityAt: { type: Date, default: Date.now },
    lastPayoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReferralPayout',
      default: null
    }
  },
  { timestamps: true }
);

referralClientSchema.index({ partnerId: 1, signupMonthKey: -1 });
referralClientSchema.index({ partnerId: 1, paymentMonthKey: -1 });

module.exports = mongoose.models.ReferralClient || mongoose.model('ReferralClient', referralClientSchema);

