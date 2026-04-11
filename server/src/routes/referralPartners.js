const express = require('express');
const jwt = require('jsonwebtoken');
const ReferralPartner = require('../models/ReferralPartner');
const referralAuth = require('../middleware/referralAuth');
const {
  normalizeReferralCode,
  generateUniqueReferralCode,
  buildPartnerDashboardPayload
} = require('../services/referralService');
const { resolveCountryFromPhone } = require('../services/referralPricingService');

const router = express.Router();

const buildReferralToken = (partner) =>
  jwt.sign(
    {
      id: partner._id,
      email: partner.email,
      businessName: partner.businessName,
      phoneNumber: partner.phoneNumber,
      referralCode: partner.referralCode
    },
    process.env.REFERRAL_JWT_SECRET || process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

router.post('/auth/register', async (req, res) => {
  try {
    const { businessName, email, phoneNumber, password } = req.body || {};

    if (!businessName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'Business name, email, phone number and password are required'
      });
    }

    const existingPartner = await ReferralPartner.findOne({
      $or: [
        { email: String(email).toLowerCase() },
        { phoneNumber }
      ]
    });

    if (existingPartner) {
      return res.status(409).json({
        success: false,
        message: 'Referral company account already exists with this email or phone'
      });
    }

    const country = resolveCountryFromPhone(phoneNumber);
    const referralCode = await generateUniqueReferralCode(businessName);

    const partner = await ReferralPartner.create({
      businessName,
      email: String(email).toLowerCase(),
      phoneNumber,
      password,
      referralCode: normalizeReferralCode(referralCode),
      countryCode: country?.code || 'IN',
      currency: country?.currency || 'INR'
    });

    return res.status(201).json({
      success: true,
      message: 'Referral company account created successfully',
      token: buildReferralToken(partner),
      partner: {
        id: String(partner._id),
        businessName: partner.businessName,
        email: partner.email,
        phoneNumber: partner.phoneNumber,
        referralCode: partner.referralCode
      }
    });
  } catch (error) {
    console.error('Referral partner registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create referral company account'
    });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const partner = await ReferralPartner.findOne({
      email: String(email).toLowerCase()
    });

    if (!partner || !(await partner.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid referral company credentials'
      });
    }

    partner.lastLoginAt = new Date();
    await partner.save();

    return res.json({
      success: true,
      token: buildReferralToken(partner),
      partner: {
        id: String(partner._id),
        businessName: partner.businessName,
        email: partner.email,
        phoneNumber: partner.phoneNumber,
        referralCode: partner.referralCode
      }
    });
  } catch (error) {
    console.error('Referral partner login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to login referral company'
    });
  }
});

router.get('/dashboard', referralAuth, async (req, res) => {
  try {
    const month = String(req.query.month || '').trim();
    const payload = await buildPartnerDashboardPayload({
      partnerId: req.referralPartner.id,
      monthKey: month
    });

    if (!payload) {
      return res.status(404).json({
        success: false,
        message: 'Referral company not found'
      });
    }

    return res.json({
      success: true,
      ...payload
    });
  } catch (error) {
    console.error('Referral dashboard error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load referral dashboard'
    });
  }
});

module.exports = router;

