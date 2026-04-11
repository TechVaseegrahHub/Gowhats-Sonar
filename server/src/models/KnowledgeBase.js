const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    unique: true
  },
  fileName: String,
  fileSize: Number,
  content: String,
  chunksCount: {
    type: Number,
    default: 0
  },
  vectors: [{
    text: String,
    embedding: [Number],
    lastUpdated: Date
  }],
  hasKnowledgeBase: {
    type: Boolean,
    default: false
  },
  uploadedAt: Date,
  uploadInProgress: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
