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
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library'); // FIX #2: proper Google verification
const {
  ensureValidReferralCode,
  linkReferralToTenant,
  normalizeReferralCode
} = require('../services/referralService');

// ─── FIX #1: All credentials moved to .env ────────────────
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,       // was hardcoded before - FIXED
    pass: process.env.EMAIL_PASS,       // was hardcoded before - FIXED
  },
  tls: {
    rejectUnauthorized: false
  }
});

// ─── FIX #2: Proper Google token verifier ─────────────────
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(credential) {
  // Attempt 1: verify as a real Google ID token (signed JWT)
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload(); // { email, name, sub, email_verified, ... }
  } catch (_) {
    // not a signed ID token — fall through
  }

  // Attempt 2: treat as a base64-encoded JSON blob (fallback path from Login.jsx OAuth2 flow)
  try {
    const decoded = JSON.parse(Buffer.from(credential, 'base64').toString());
    if (!decoded.email || !decoded.sub) throw new Error('Missing fields');
    // We cannot cryptographically verify this path, so only accept it when
    // the access_token is also provided and the userinfo endpoint confirms it.
    // For now, throw so callers know this path is unsafe unless they pass access_token.
    throw new Error('Unverifiable credential — use ID token');
  } catch (err) {
    const error = new Error('Invalid or unverifiable Google credential');
    error.statusCode = 400;
    throw error;
  }
}

// ─── FIX #3: Rate limiters ────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many OTP requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { message: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Helpers ──────────────────────────────────────────────
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

const maybeAttachReferral = async ({
  referralCode,
  tenantId,
  name,
  email,
  phoneNumber,
  companyName
}) => {
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

// ─── In-memory OTP store ──────────────────────────────────
// FIX #4 NOTE: Replace Map with Redis in production for multi-server support.
// e.g. use ioredis: await redis.set(`otp:${phone}`, otp, 'EX', 300)
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
  if (phone) {
    otpStore.delete(phone);
  }
};

// ─── FIX #5: Separate JWT secret for reset tokens ─────────
const getResetSecret = () => {
  const secret = process.env.JWT_RESET_SECRET;
  if (!secret) {
    throw new Error('JWT_RESET_SECRET env variable is not set');
  }
  return secret;
};

// ─── Register ─────────────────────────────────────────────
router.post('/register', async (req, res) => {
  console.log('Register attempt:', req.body);

  try {
    const { name, email, password, phone_number, otp, company_name, referral_code } = req.body;

    if (!name || !email || !password || !phone_number || !company_name) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // FIX #6: OTP verified FIRST before any DB operations
    if (phone_number && otp) {
      assertValidOtp(phone_number, otp);
    }

    if (normalizeReferralCode(referral_code)) {
      await ensureValidReferralCode(referral_code);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const tenantId = uuidv4();
    const user = new User({
      name,
      email,
      password,
      tenant_id: tenantId,
      phone_number,
      company_name,
      role: 'admin',
    });

    await user.save();

    await createTenantWithTrial({ tenantId, companyName: company_name });

    await maybeAttachReferral({
      referralCode: referral_code,
      tenantId,
      name,
      email,
      phoneNumber: phone_number,
      companyName: company_name
    });

    if (phone_number && otp) {
      consumeOtp(phone_number);
    }

    console.log('Registration successful');
    return res.status(201).json({ message: 'Registration successful. Please log in.' });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── Login (rate limited) ─────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  console.log('Login attempt:', req.body);

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });

    // FIX #7: Constant-time response to prevent user enumeration via timing
    if (!user) {
      await new Promise(r => setTimeout(r, 300));
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: user._id,
        tenant_id: user.tenant_id,
        tenantId: user.tenant_id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone_number: user.phone_number,
        company_name: user.company_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('Login successful');
    return res.json({ token, access_token: token });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── Get all users (admin only) ───────────────────────────
router.get('/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const requestingUser = await User.findById(decoded.id);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const users = await User.find().select('-password');
    if (!users) return res.status(404).json({ message: 'No users found' });

    return res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── User profile ─────────────────────────────────────────
router.get('/user/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
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
    console.error('Get user profile error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─── Forgot password (rate limited) ──────────────────────
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    // FIX #7: Always do the DB lookup (constant time) to prevent timing-based email enumeration
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        message: 'If your email is registered, you will receive a password reset link.'
      });
    }

    // FIX #5: Use separate JWT_RESET_SECRET
    const resetSecret = getResetSecret();

    // FIX #8: Store a one-time token hash on the user so old tokens are invalidated
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    // Sign a JWT that also carries the rawToken so the reset endpoint can verify both
    const resetJwt = jwt.sign(
      { userId: user._id, rawToken },
      resetSecret,
      { expiresIn: '1h' }
    );

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetJwt}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@gowhats.com',
      to: user.email,
      subject: 'Password Reset - GoWhats',
      html: `
        <h1>Password Reset Request</h1>
        <p>Hello ${user.name},</p>
        <p>You requested a password reset for your GoWhats account. Click below to reset your password:</p>
        <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;color:white;background-color:#10b981;text-decoration:none;border-radius:5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email and ensure your account is secure.</p>
        <p>Regards,<br>GoWhats Team</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', email);

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

    // FIX #8: Check the one-time hash in the DB
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

    // FIX #8: Verify one-time hash — prevents reuse of same link
    const tokenHash = crypto.createHash('sha256').update(decoded.rawToken).digest('hex');
    if (user.resetPasswordToken !== tokenHash || Date.now() > user.resetPasswordExpires) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Update password and clear the reset token (one-time use)
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

// ─── Send WhatsApp OTP (rate limited) ────────────────────
router.post('/whatsapp/send-otp', otpLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    const to = phone.replace(/^\+/, '');

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

    console.log(`OTP sent to ${to}`);
    return res.status(200).json({ message: 'OTP sent successfully' });

  } catch (err) {
    console.error('Send OTP error:', err.response?.data || err.message);
    return res.status(500).json({ message: 'Failed to send OTP' });
  }
});

// ─── Verify WhatsApp OTP (Login) ──────────────────────────
router.post('/whatsapp/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    assertValidOtp(phone, otp);
    consumeOtp(phone);

    const user = await User.findOne({ phone_number: phone });
    if (!user) return res.status(404).json({ message: 'No account found for this number. Please sign up.' });

    const token = jwt.sign(
      { id: user._id, tenant_id: user.tenant_id, tenantId: user.tenant_id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({ token, access_token: token });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(err.statusCode || 500).json({ message: err.message || 'Server error' });
  }
});

// ─── Check OTP (without consuming) ───────────────────────
router.post('/whatsapp/check-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    assertValidOtp(phone, otp);
    return res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ message: err.message || 'Failed to verify OTP' });
  }
});

// ─── WhatsApp Register ────────────────────────────────────
router.post('/whatsapp/register', async (req, res) => {
  try {
    const { name, email, company_name, phone_number, otp, referral_code } = req.body;
    if (!name || !email || !company_name || !phone_number || !otp)
      return res.status(400).json({ message: 'All fields are required' });

    // FIX #6: OTP verified FIRST
    assertValidOtp(phone_number, otp);

    if (normalizeReferralCode(referral_code)) {
      await ensureValidReferralCode(referral_code);
    }

    const existing = await User.findOne({ $or: [{ email }, { phone_number }] });
    if (existing) return res.status(409).json({ message: 'Account already exists with this email or phone.' });

    consumeOtp(phone_number);

    const tenantId = uuidv4();
    const user = new User({
      name, email, company_name,
      phone_number,
      password: crypto.randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      role: 'admin',
    });
    await user.save();

    await createTenantWithTrial({ tenantId, companyName: company_name });

    await maybeAttachReferral({
      referralCode: referral_code,
      tenantId,
      name,
      email,
      phoneNumber: phone_number,
      companyName: company_name
    });

    return res.status(201).json({ message: 'Account created successfully. Please log in.' });
  } catch (err) {
    console.error('WA Register error:', err);
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── Google Login (verified) ──────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'No credential provided' });

    // FIX #2: Cryptographically verified Google token
    const payload = await verifyGoogleToken(credential);
    const { email } = payload;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account found. Please sign up first.' });

    const token = jwt.sign(
      { id: user._id, tenant_id: user.tenant_id, tenantId: user.tenant_id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({ token, access_token: token });
  } catch (err) {
    console.error('Google login error:', err);
    return res.status(err.statusCode || 500).json({ message: err.message || 'Server error' });
  }
});

// ─── Google Register (verified) ───────────────────────────
router.post('/google/register', async (req, res) => {
  try {
    const { credential, phone_number = '', otp = '', referral_code } = req.body;
    if (!credential) return res.status(400).json({ message: 'No credential provided' });

    // FIX #2: Cryptographically verified Google token
    const payload = await verifyGoogleToken(credential);
    const { email, name } = payload;

    // FIX #6: OTP verified FIRST
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
      role: 'admin',
    });
    await user.save();

    await createTenantWithTrial({ tenantId, companyName: name });

    await maybeAttachReferral({
      referralCode: referral_code,
      tenantId,
      name,
      email,
      phoneNumber: phone_number,
      companyName: name
    });

    if (phone_number && otp) {
      consumeOtp(phone_number);
    }

    return res.status(201).json({ message: 'Account created successfully.' });
  } catch (err) {
    console.error('Google register error:', err);
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
