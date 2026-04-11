/**
 * Migration Script: Add country code to existing user phone numbers
 * 
 * Usage:
 *   node migrate_phone_country_code.js
 *   node migrate_phone_country_code.js --dry-run       (preview only, no writes)
 *   node migrate_phone_country_code.js --country +91   (custom country code)
 * 
 * Default country code: +91 (India)
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ─── Parse CLI args ──────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const codeIdx    = args.indexOf('--country');
const COUNTRY_CODE = codeIdx !== -1 ? args[codeIdx + 1] : '+91';

// ─── MongoDB URI ──────────────────────────────────────────────────────────────
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://techvaseegrah:gowhats$tech2k25@gowhats.toqv1xm.mongodb.net/gowhats?retryWrites=true&w=majority&appName=Gowhats';

// ─── Inline User schema (mirrors models/User.js) ─────────────────────────────
const userSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true },
    email:        { type: String, required: true, unique: true },
    password:     { type: String, required: true },
    tenant_id:    { type: String, required: true },
    phone_number: { type: String, required: true },
    company_name: { type: String, required: true },
    role:         { type: String, enum: ['admin', 'user'], default: 'admin' },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the phone number already carries a country code.
 * Handles: +91XXXXXXXXXX  /  0091XXXXXXXXXX  /  91XXXXXXXXXX (10-digit suffix)
 */
function hasCountryCode(phone) {
  if (!phone) return false;
  const cleaned = phone.trim();

  // Already starts with + → has country code
  if (cleaned.startsWith('+')) return true;

  // Starts with 00 → international dialling prefix
  if (cleaned.startsWith('00')) return true;

  // 12-digit number starting with 91 → likely +91 without the +
  // Adjust the logic below if you serve multiple countries
  if (/^91\d{10}$/.test(cleaned)) return true;

  return false;
}

/**
 * Strips any existing separators/spaces and prepends the country code.
 */
function applyCountryCode(phone, countryCode) {
  const cleaned = phone.trim().replace(/\s+/g, '');
  return `${countryCode}${cleaned}`;
}

// ─── Main migration ───────────────────────────────────────────────────────────
async function migrate() {
  console.log('─────────────────────────────────────────────');
  console.log('  Phone Number Country-Code Migration');
  console.log('─────────────────────────────────────────────');
  console.log(`  Country code  : ${COUNTRY_CODE}`);
  console.log(`  Mode          : ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '✏️  LIVE (will write to DB)'}`);
  console.log('─────────────────────────────────────────────\n');

  await mongoose.connect(MONGODB_URI);
  console.log('✅  Connected to MongoDB\n');

  // Fetch ALL users (small datasets) — for very large collections, use cursor streaming
  const users = await User.find({}).select('_id name email phone_number').lean();

  console.log(`📋  Total users found: ${users.length}\n`);

  const toUpdate   = [];
  const alreadyOk  = [];
  const skipped    = [];   // blank / null phone numbers

  for (const u of users) {
    const phone = (u.phone_number || '').toString().trim();

    if (!phone) {
      skipped.push({ id: u._id, email: u.email, reason: 'empty phone number' });
      continue;
    }

    if (hasCountryCode(phone)) {
      alreadyOk.push({ id: u._id, email: u.email, phone });
    } else {
      const newPhone = applyCountryCode(phone, COUNTRY_CODE);
      toUpdate.push({ id: u._id, email: u.email, oldPhone: phone, newPhone });
    }
  }

  // ── Summary before writing ────────────────────────────────────────────────
  console.log(`✅  Already have country code : ${alreadyOk.length}`);
  console.log(`⚠️   Need update               : ${toUpdate.length}`);
  console.log(`⛔  Skipped (blank)            : ${skipped.length}\n`);

  if (toUpdate.length === 0) {
    console.log('🎉  Nothing to update. All phone numbers already have a country code.');
    await mongoose.disconnect();
    return;
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  console.log('── Changes to be applied ─────────────────────');
  toUpdate.forEach(({ email, oldPhone, newPhone }) => {
    console.log(`  ${email.padEnd(35)} ${oldPhone.padEnd(15)} →  ${newPhone}`);
  });
  console.log('──────────────────────────────────────────────\n');

  if (DRY_RUN) {
    console.log('🔍  Dry-run complete. No changes written to the database.');
    await mongoose.disconnect();
    return;
  }

  // ── Write updates ─────────────────────────────────────────────────────────
  console.log('✏️   Writing updates …\n');

  let successCount = 0;
  let failCount    = 0;

  for (const { id, email, newPhone } of toUpdate) {
    try {
      await User.updateOne(
        { _id: id },
        { $set: { phone_number: newPhone } }
      );
      console.log(`  ✅  Updated: ${email}  →  ${newPhone}`);
      successCount++;
    } catch (err) {
      console.error(`  ❌  Failed : ${email}  —  ${err.message}`);
      failCount++;
    }
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(`  Migration complete`);
  console.log(`  ✅  Updated  : ${successCount}`);
  console.log(`  ❌  Failed   : ${failCount}`);
  console.log('─────────────────────────────────────────────\n');

  if (skipped.length > 0) {
    console.log('⛔  Users with blank phone numbers (manual review needed):');
    skipped.forEach(({ email, reason }) =>
      console.log(`    • ${email}  (${reason})`)
    );
    console.log('');
  }

  await mongoose.disconnect();
  console.log('👋  Disconnected from MongoDB');
}

migrate().catch(err => {
  console.error('💥  Migration failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
