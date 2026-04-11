const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  templateName: { type: String, required: true },
  templateStatus: { type: String, default: 'APPROVED' },
  templateLanguage: { type: String, default: 'en' },
  audienceType: { type: String, required: true, default: 'all' },
  recipients: { type: [String], required: true },

  // Carousel Support
  isCarousel: { type: Boolean, default: false },
  carouselCards: [{
    cardIndex: Number,
    mediaUrl: String,
    mediaType: { type: String, enum: ['image', 'video'] },
    mediaMimeType: String,
    mediaFileName: String
  }],

  // Single Media Support
  hasMedia: { type: Boolean, default: false },
  mediaType: { type: String, enum: ['image', 'video', 'document', null], default: null },
  mediaUrl: String,
  mediaMimeType: String,
  mediaFileName: String,
  // Added absolute path for reliable scheduler file reading
  mediaAbsolutePath: String,
  whatsappMediaId: String,

  // Scheduling
  isScheduled: { type: Boolean, default: false },
  scheduledDate: { type: Date, default: Date.now },
  scheduledTime: String,
  timezone: { type: String, default: 'Asia/Kolkata' },
  days: [String], // For recurring (if used)

  // Stats
  sentCount: { type: Number, default: 0 },
  deliveredCount: { type: Number, default: 0 },
  readCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },

  // Tracking arrays
  sentMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  deliveredMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  readMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  failedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],

  status: {
    type: String,
    // ✅ ADDED 'pending' and kept everything lowercase to match logic
    enum: ['draft', 'pending', 'scheduled', 'processing', 'completed', 'failed', 'paused', 'cancelled'],
    default: 'draft'
  },

// Conversion Tracking
conversionCount: { type: Number, default: 0 },
conversions: [{
  phone: String,
  convertedAt: { type: Date, default: Date.now },
  conversionType: { type: String, default: 'reply' }
}],

  processing: { type: Boolean, default: false },
  processingStartedAt: Date,
  lastProcessedAt: Date,
  completedAt: Date,
  processingError: String,
  processingErrors: [{
    recipient: String,
    error: String,
    timestamp: Date
  }],

  tenantId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Broadcast', broadcastSchema);
