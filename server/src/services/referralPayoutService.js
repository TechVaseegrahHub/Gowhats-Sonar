const axios = require('axios');
const ReferralPartner = require('../models/ReferralPartner');

const getPayoutConfig = () => {
  const keyId = process.env.REFERRAL_PAYOUT_KEY_ID || process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.REFERRAL_PAYOUT_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
  const sourceAccountNumber = process.env.REFERRAL_PAYOUT_ACCOUNT_NUMBER || process.env.RAZORPAYX_SOURCE_ACCOUNT_NUMBER || '';

  if (!keyId || !keySecret || !sourceAccountNumber) {
    throw new Error('Referral payout integration is not fully configured');
  }

  return {
    keyId,
    keySecret,
    sourceAccountNumber,
    baseUrl: 'https://api.razorpay.com/v1'
  };
};

const buildAuthHeader = ({ keyId, keySecret }) =>
  `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

const ensureBankDetails = (partner) => {
  const bankDetails = partner.bankDetails || {};
  if (!bankDetails.accountHolderName || !bankDetails.accountNumber || !bankDetails.ifscCode) {
    throw new Error('Partner bank details are incomplete');
  }
};

const createPartnerContact = async ({ partner, headers, baseUrl }) => {
  if (partner.payoutProvider?.contactId) {
    return partner.payoutProvider.contactId;
  }

  const response = await axios.post(
    `${baseUrl}/contacts`,
    {
      name: partner.bankDetails.accountHolderName || partner.businessName,
      email: partner.email,
      contact: String(partner.phoneNumber || '').replace(/^\+/, ''),
      type: 'vendor',
      reference_id: `partner_${partner._id}`
    },
    { headers }
  );

  await ReferralPartner.findByIdAndUpdate(partner._id, {
    $set: {
      'payoutProvider.contactId': response.data.id,
      'payoutProvider.lastError': ''
    }
  });

  return response.data.id;
};

const createPartnerFundAccount = async ({ partner, contactId, headers, baseUrl }) => {
  if (partner.payoutProvider?.fundAccountId) {
    return partner.payoutProvider.fundAccountId;
  }

  const response = await axios.post(
    `${baseUrl}/fund_accounts`,
    {
      contact_id: contactId,
      account_type: 'bank_account',
      bank_account: {
        name: partner.bankDetails.accountHolderName || partner.businessName,
        ifsc: partner.bankDetails.ifscCode,
        account_number: partner.bankDetails.accountNumber
      }
    },
    { headers }
  );

  await ReferralPartner.findByIdAndUpdate(partner._id, {
    $set: {
      'payoutProvider.fundAccountId': response.data.id,
      'payoutProvider.lastError': ''
    }
  });

  return response.data.id;
};

const createPartnerPayout = async ({ partner, amount, currency = 'INR', note = '', referenceId = '' }) => {
  if (String(currency).toUpperCase() !== 'INR') {
    throw new Error('Auto payout is supported only for INR commissions in this version');
  }

  ensureBankDetails(partner);
  const config = getPayoutConfig();
  const headers = {
    Authorization: buildAuthHeader(config),
    'Content-Type': 'application/json'
  };

  const contactId = await createPartnerContact({
    partner,
    headers,
    baseUrl: config.baseUrl
  });

  const refreshedPartner = await ReferralPartner.findById(partner._id).lean();
  const fundAccountId = await createPartnerFundAccount({
    partner: refreshedPartner,
    contactId,
    headers,
    baseUrl: config.baseUrl
  });

  const payoutResponse = await axios.post(
    `${config.baseUrl}/payouts`,
    {
      account_number: config.sourceAccountNumber,
      fund_account_id: fundAccountId,
      amount: Math.round(Number(amount || 0) * 100),
      currency: String(currency).toUpperCase(),
      mode: 'IMPS',
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: referenceId || `referral_${partner._id}_${Date.now()}`,
      narration: String(note || 'GoWhats referral payout').slice(0, 30),
      notes: {
        partner_id: String(partner._id),
        referral_code: partner.referralCode
      }
    },
    { headers }
  );

  await ReferralPartner.findByIdAndUpdate(partner._id, {
    $set: {
      'payoutProvider.lastPayoutAt': new Date(),
      'payoutProvider.lastError': ''
    }
  });

  return payoutResponse.data;
};

module.exports = {
  createPartnerPayout
};

