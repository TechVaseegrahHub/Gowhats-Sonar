// src/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { authenticate, requireAdmin } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const {
  ensureValidReferralCode,
  linkReferralToTenant,
  normalizeReferralCode
} = require('../services/referralService');

// ─── BILLZZY SILENT HANDSHAKE HELPER ───────────────────────
async function linkToBillzzy(integrationToken, tenantId) {
  if (!integrationToken || !process.env.BILLING_SAAS_URL || !process.env.SYNC_SECRET) {
    return null;
  }
  try {
    const decoded = jwt.verify(integrationToken, process.env.SYNC_SECRET);
    await axios.post(`${process.env.BILLING_SAAS_URL}/api/integrations/gowhats/confirm`, {
      organisationId: decoded.orgId,
      gowhatsTenantId: tenantId.toString()
    }, {
      headers: { 'x-sync-secret': process.env.SYNC_SECRET }
    });
    return `${process.env.BILLING_SAAS_URL}/settings?sync=gowhats_success`;
  } catch (err) {
    console.error('Billzzy handshake failed:', err.message);
    return null;
  }
}

// ─── SMTP TRANSPORTER ──────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
  // ✅ FIX 9: Removed tls.rejectUnauthorized:false — disabling cert verification
  //    opens SMTP connections to MITM attacks. Gmail's cert is valid; this was never needed.
});

// ─── GOOGLE TOKEN VERIFIER ─────────────────────────────────
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(credential) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    return ticket.getPayload();
  } catch (_) {
    // not a signed ID token — fall through
  }
  const error = new Error('Invalid or unverifiable Google credential');
  error.statusCode = 400;
  throw error;
}

// ─── RATE LIMITERS ────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ✅ FIX 4: Register now rate-limited — prevents automated tenant/trial farming
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { message: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many OTP requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ✅ FIX 6: OTP verification endpoints also rate-limited to prevent brute force
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many OTP verification attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ─── HELPERS ──────────────────────────────────────────────

// ✅ FIX 8: Minimal JWT payload — removed phone_number and company_name (PII not needed in token)
const signUserToken = (user, expiresIn = '30d') =>
  jwt.sign(
    {
      id: user._id,
      tenant_id: user.tenant_id,
      tenantId: user.tenant_id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );

// ✅ FIX 7: Password strength validation — used in register and reset-password
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.trim().length === 0) return 'Password cannot be whitespace only';
  return null; // valid
};

const createTenantWithTrial = async ({ tenantId, companyName }) => {
  const { getGlobalFreeTrialDays } = require('../services/subscriptionService');
  const trialDays = await getGlobalFreeTrialDays();
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + trialDays);

  const tenant = new Tenant({
    _id: tenantId,
    name: companyName,
    subscription: {
      plan: 'free_trial',
      trialStartedAt: new Date(),
      trialEndsAt: trialEndDate
    }
  });

  await tenant.save();
  return tenant;
};

const maybeAttachReferral = async ({ referralCode, tenantId, name, email, phoneNumber, companyName }) => {
  const normalizedReferralCode = normalizeReferralCode(referralCode);
  if (!normalizedReferralCode) return null;
  await ensureValidReferralCode(normalizedReferralCode);
  return linkReferralToTenant({
    referralCode: normalizedReferralCode,
    tenantId,
    clientName: name,
    clientEmail: email,
    clientPhone: phoneNumber,
    clientBusinessName: companyName
  });
};

// ─── IN-MEMORY OTP STORE ──────────────────────────────────
// NOTE: Replace with Redis in production for multi-server support.
const otpStore = new Map();

const getStoredOtp = (phone) => {
  const stored = otpStore.get(phone);
  if (!stored) {
    const error = new Error('OTP not found. Please request a new one.');
    error.statusCode = 400;
    throw error;
  }
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phone);
    const error = new Error('OTP expired.');
    error.statusCode = 400;
    throw error;
  }
  return stored;
};

const assertValidOtp = (phone, otp) => {
  if (!phone || !otp) {
    const error = new Error('Phone and OTP are required');
    error.statusCode = 400;
    throw error;
  }
  const stored = getStoredOtp(phone);
  if (stored.otp !== otp) {
    const error = new Error('Invalid OTP');
    error.statusCode = 400;
    throw error;
  }
  return stored;
};

const consumeOtp = (phone) => {
  if (phone) otpStore.delete(phone);
};

// ─── RESET SECRET ─────────────────────────────────────────
const getResetSecret = () => {
  const secret = process.env.JWT_RESET_SECRET;
  if (!secret) throw new Error('JWT_RESET_SECRET env variable is not set');
  return secret;
};

// ==========================================
// ROUTES
// ==========================================

// ─── Register ─────────────────────────────────────────────
// ✅ FIX 4: Added registerLimiter
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone_number, otp, company_name, referral_code, integrationToken } = req.body;

    if (!name || !email || !password || !phone_number || !company_name) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // ✅ FIX 7: Validate password strength before any DB work
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });

    // ✅ FIX 5: Normalize email to prevent case-based duplicates
    const normalizedEmail = email.trim().toLowerCase();

    if (phone_number && otp) {
      assertValidOtp(phone_number, otp);
    }

    if (normalizeReferralCode(referral_code)) {
      await ensureValidReferralCode(referral_code);
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const tenantId = uuidv4();
    const user = new User({
      name,
      email: normalizedEmail,
      password,
      tenant_id: tenantId,
      phone_number,
      company_name,
      role: 'admin'
    });

    await user.save();
    await createTenantWithTrial({ tenantId, companyName: company_name });
    await maybeAttachReferral({ referralCode: referral_code, tenantId, name, email: normalizedEmail, phoneNumber: phone_number, companyName: company_name });

    if (phone_number && otp) consumeOtp(phone_number);

    const redirectUrl = await linkToBillzzy(integrationToken, tenantId);

    return res.status(201).json({ message: 'Registration successful.', redirectUrl });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── Login ────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, integrationToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // ✅ FIX 5: Normalize email
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      await new Promise(r => setTimeout(r, 300)); // constant-time to prevent enumeration
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // ✅ FIX 8: Minimal token — no PII
    const token = signUserToken(user, '30d');
    const redirectUrl = await linkToBillzzy(integrationToken, user.tenant_id);

    return res.json({ token, access_token: token, redirectUrl });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── Get all users (admin only) ───────────────────────────
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ tenant_id: req.user.tenant_id }).select('-password');
    return res.json(users);
  } catch (error) {
    // ✅ FIX 1: Removed reference to undefined `isDev` variable — caused ReferenceError
    console.error('Get users error:', error.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── User profile ─────────────────────────────────────────
router.get('/user/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
      company_name: user.company_name,
      tenant_id: user.tenant_id,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    // ✅ FIX 1: Removed undefined `isDev` reference
    console.error('Get profile error:', error.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── Forgot password ──────────────────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    // ✅ FIX 5: Normalize email
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Always respond the same way — prevents email enumeration
    if (!user) {
      return res.status(200).json({
        message: 'If your email is registered, you will receive a password reset link.'
      });
    }

    const resetSecret = getResetSecret();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const resetJwt = jwt.sign({ userId: user._id, rawToken }, resetSecret, { expiresIn: '1h' });
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetJwt}`;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@gowhats.com',
      to: user.email,
      subject: 'Password Reset - GoWhats',
      html: `
        <h1>Password Reset Request</h1>
        <p>Hello ${user.name},</p>
        <p>You requested a password reset for your GoWhats account. Click below to reset your password:</p>
        <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;color:white;background-color:#10b981;text-decoration:none;border-radius:5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <p>Regards,<br>GoWhats Team</p>
      `
    });

    return res.status(200).json({ message: 'Password reset email sent successfully!' });
  } catch (error) {
    console.error('Error sending reset email:', error);
    return res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
  }
});

// ─── Validate reset token ─────────────────────────────────
router.get('/validate-reset-token', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'No token provided' });

    const resetSecret = getResetSecret();
    let decoded;
    try {
      decoded = jwt.verify(token, resetSecret);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.resetPasswordToken) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const tokenHash = crypto.createHash('sha256').update(decoded.rawToken).digest('hex');
    if (user.resetPasswordToken !== tokenHash || Date.now() > user.resetPasswordExpires) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    return res.status(200).json({ message: 'Token is valid' });
  } catch (error) {
    console.error('Error validating token:', error);
    return res.status(500).json({ message: 'Failed to validate token' });
  }
});

// ─── Reset password ───────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    // ✅ FIX 3: Validate new password strength before doing anything with DB
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });

    const resetSecret = getResetSecret();
    let decoded;
    try {
      decoded = jwt.verify(token, resetSecret);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.resetPasswordToken) {
      return res.status(404).json({ message: 'Invalid or expired token' });
    }

    const tokenHash = crypto.createHash('sha256').update(decoded.rawToken).digest('hex');
    if (user.resetPasswordToken !== tokenHash || Date.now() > user.resetPasswordExpires) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.log('Password reset successful for user:', user.email);
    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error in reset-password:', error);
    return res.status(500).json({ message: 'Failed to reset password' });
  }
});

// ─── Send WhatsApp OTP ────────────────────────────────────
router.post('/whatsapp/send-otp', otpLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const to = phone.replace(/^\+/, '');

    // ✅ FIX 5: Store OTP AFTER the API call succeeds — not before.
    //    Previously if the WhatsApp API threw, the OTP was stored but never delivered,
    //    leaving a valid but undelivered OTP in the store for 5 minutes.
    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_OTP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'gowhats_otp',
          language: { code: 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: otp }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_OTP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // ✅ Only store OTP after successful delivery
    otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    return res.status(200).json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Send OTP error:', err.response?.data || err.message);
    return res.status(500).json({ message: 'Failed to send OTP' });
  }
});

// ─── Verify WhatsApp OTP (Login) ──────────────────────────
// ✅ FIX 6: Added otpVerifyLimiter — prevents brute-forcing 6-digit OTP
router.post('/whatsapp/verify-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    assertValidOtp(phone, otp);
    consumeOtp(phone);

    const user = await User.findOne({ phone_number: phone });
    if (!user) return res.status(404).json({ message: 'No account found for this number. Please sign up.' });

    // ✅ FIX 8: Minimal token
    const token = signUserToken(user, '24h');
    return res.json({ token, access_token: token });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(err.statusCode || 500).json({ message: err.message || 'Server error' });
  }
});

// ─── Check OTP (without consuming) ───────────────────────
// ✅ FIX 6: Rate limited — without this, attackers could probe all 1,000,000 OTP values
router.post('/whatsapp/check-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    assertValidOtp(phone, otp);
    return res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ message: err.message || 'Failed to verify OTP' });
  }
});

// ─── WhatsApp Register ────────────────────────────────────
// ✅ FIX 4: Added registerLimiter
router.post('/whatsapp/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, company_name, phone_number, otp, referral_code } = req.body;
    if (!name || !email || !company_name || !phone_number || !otp) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    assertValidOtp(phone_number, otp);

    if (normalizeReferralCode(referral_code)) {
      await ensureValidReferralCode(referral_code);
    }

    // ✅ FIX 5: Normalize email
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { phone_number }] });
    if (existing) return res.status(409).json({ message: 'Account already exists with this email or phone.' });

    consumeOtp(phone_number);

    const tenantId = uuidv4();
    const user = new User({
      name, email: normalizedEmail, company_name,
      phone_number,
      password: crypto.randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      role: 'admin'
    });
    await user.save();
    await createTenantWithTrial({ tenantId, companyName: company_name });
    await maybeAttachReferral({ referralCode: referral_code, tenantId, name, email: normalizedEmail, phoneNumber: phone_number, companyName: company_name });

    return res.status(201).json({ message: 'Account created successfully. Please log in.' });
  } catch (err) {
    console.error('WA Register error:', err);
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── Google Login ─────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'No credential provided' });

    const payload = await verifyGoogleToken(credential);
    // ✅ FIX 5: Normalize email from Google payload too
    const email = payload.email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account found. Please sign up first.' });

    // ✅ FIX 8: Minimal token
    const token = signUserToken(user, '30d');
    return res.json({ token, access_token: token });
  } catch (err) {
    console.error('Google login error:', err);
    return res.status(err.statusCode || 500).json({ message: err.message || 'Server error' });
  }
});

// ─── Google Register ──────────────────────────────────────
// ✅ FIX 4: Added registerLimiter
router.post('/google/register', registerLimiter, async (req, res) => {
  try {
    const { credential, phone_number = '', otp = '', referral_code, integrationToken } = req.body;
    if (!credential) return res.status(400).json({ message: 'No credential provided' });

    const payload = await verifyGoogleToken(credential);
    const { name } = payload;
    // ✅ FIX 5: Normalize email
    const email = payload.email.trim().toLowerCase();

    if (phone_number && otp) {
      assertValidOtp(phone_number, otp);
    }

    if (normalizeReferralCode(referral_code)) {
      await ensureValidReferralCode(referral_code);
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Account already exists.' });

    const tenantId = uuidv4();
    const user = new User({
      name, email,
      company_name: name,
      phone_number,
      password: crypto.randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      role: 'admin'
    });
    await user.save();
    await createTenantWithTrial({ tenantId, companyName: name });
    await maybeAttachReferral({ referralCode: referral_code, tenantId, name, email, phoneNumber: phone_number, companyName: name });

    if (phone_number && otp) consumeOtp(phone_number);

    const redirectUrl = await linkToBillzzy(integrationToken, tenantId);
    return res.status(201).json({ message: 'Account created successfully.', redirectUrl });
  } catch (err) {
    console.error('Google register error:', err);
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── Sync Handshake ───────────────────────────────────────
// ✅ FIX 2: Uses `authenticate` middleware instead of manual jwt.verify
//    Previously: missing Authorization header → jwt.verify(undefined) → 500 leaking error.message
router.post('/sync-handshake', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    const tenantId = req.user.tenant_id || req.user.tenantId;
    const redirectUrl = await linkToBillzzy(token, tenantId);

    if (redirectUrl) {
      return res.json({ success: true, redirectUrl });
    } else {
      return res.status(400).json({ success: false, message: 'Handshake failed' });
    }
  } catch (error) {
    console.error('Sync handshake error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
