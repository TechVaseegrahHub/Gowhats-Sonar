// models/Booking.js
const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  bookingId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customerPhone: {
    type: String,
    required: true,
    index: true
  },
  customerName: String,
  
  // Registration Data
  registrationDetails: {
    type: Object, // Stores flow answers (Name, Location, etc.)
  },
  
  // Event/Service Details
  registrationConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RegistrationConfig'
  },
  participantCount: {
    type: Number,
    default: 1
  },
  
  // Payment Info
  amount: {
    type: Number,
    required: true,
    default: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'free'],
    default: 'pending'
  },
  paymentDetails: {
    transactionId: String,
    paymentMethod: String,
    paidAt: Date,
    razorpayOrderId: String,
    razorpayPaymentId: String
  },

  // Metadata
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'attended'],
    default: 'pending'
  },
  flowToken: String,
  ticketGenerated: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Booking', bookingSchema);
