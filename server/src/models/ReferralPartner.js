const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const bankDetailsSchema = new mongoose.Schema(
  {
    accountHolderName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    bankName: { type: String, default: '' }
  },
  { _id: false }
);

const payoutProviderSchema = new mongoose.Schema(
  {
    contactId: { type: String, default: '' },
    fundAccountId: { type: String, default: '' },
    lastError: { type: String, default: '' },
    lastPayoutAt: { type: Date, default: null }
  },
  { _id: false }
);

const referralPartnerSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phoneNumber: { type: String, required: true, unique: true, trim: true },
    countryCode: { type: String, default: 'IN' },
    currency: { type: String, default: 'INR' },
    sharePercent: { type: Number, default: 50, min: 0, max: 100 },
    referralCode: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    password: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    bankDetails: { type: bankDetailsSchema, default: () => ({}) },
    payoutProvider: { type: payoutProviderSchema, default: () => ({}) },
    lastLoginAt: { type: Date, default: null }
  },
  { timestamps: true }
);

referralPartnerSchema.pre('save', async function savePassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

referralPartnerSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.ReferralPartner || mongoose.model('ReferralPartner', referralPartnerSchema);

