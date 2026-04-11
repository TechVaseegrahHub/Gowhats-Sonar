const mongoose = require('mongoose');

const eventTicketSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  ticketId: {
    type: String,
    required: true
  },
  orderId: {
    type: String,
    ref: 'Order'
  },

  // ✅ NEW: Link to RegistrationConfig
  registrationConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RegistrationConfig',
    default: null
  },

  customerPhone: {
    type: String,
    required: true
  },
  customerName: {
    type: String
  },
  participantCount: {
    type: Number,
    default: 1
  },

  // ✅ NEW: Store full registration form data
  flowData: {
    type: Object,
    default: {}
  },

  // ✅ NEW: Store parsed registration fields for easy access
  registrationDetails: {
    name: String,
    email: String,
    phone: String,
    location: String,
    businessName: String,
    hasBusiness: String,
    participants: Number,
    extraFields: { type: Object, default: {} }
  },

  status: {
    type: String,
    enum: ['pending_payment', 'active', 'used', 'cancelled'],
    default: 'active'
  },

  // ✅ NEW: Payment tracking
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'free'],
    default: 'free'
  },
  paymentGateway: {
    type: String,
    enum: ['razorpay', 'stripe', 'free', null],
    default: null
  },
  amountPaid: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },

  checkInTime: {
    type: Date
  },
  checkedInBy: {
    type: String
  },
  qrCodeString: {
    type: String
  },
  amount: {
    type: Number,
    default: null
  },

  // ✅ Manual payment override — independent of Stripe/Order
  manualPaymentStatus: {
    type: String,
    enum: ['paid', 'unpaid', null],
    default: null  // null = derive from linked Order
  },

  // ✅ NEW: Track if QR was sent successfully
  qrSentAt: {
    type: Date,
    default: null
  },
  qrSentSuccess: {
    type: Boolean,
    default: false
  },

  // ✅ NEW: For group tickets - which group index this ticket is
  groupIndex: {
    type: Number,
    default: 1
  },

  // ✅ NEW: Is this the master ticket (first in group)
  isMasterTicket: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });

// ✅ Unique per tenant, not globally
eventTicketSchema.index({ tenantId: 1, ticketId: 1 }, { unique: true });

// ✅ NEW: Index for fast lookup by orderId
eventTicketSchema.index({ tenantId: 1, orderId: 1 });

// ✅ NEW: Index for registration config lookups
eventTicketSchema.index({ tenantId: 1, registrationConfigId: 1 });

module.exports = mongoose.model('EventTicket', eventTicketSchema);
