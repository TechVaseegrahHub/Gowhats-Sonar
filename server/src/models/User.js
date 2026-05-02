const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  tenant_id: {
    type: String,
    required: true,
    index: true          
  },
  phone_number: {
    type: String,
    required: true,
    unique: true        
  },
  company_name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'admin'
  },
  access_code: {
    type: String,
    default: null
  },
  device_security: {
    type: Boolean,
    default: true
  },
  googleCalendarTokens: {
    type: Object,
    default: null
  },
  resetPasswordToken: {
    type: String,
    default: null,
    select: false      
  },
  resetPasswordExpires: {
    type: Date,
    default: null,
    select: false       
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
