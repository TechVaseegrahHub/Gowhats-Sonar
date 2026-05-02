const mongoose = require('mongoose');
 
const knowledgeBaseSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  fileName: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: null
  },
  chunksCount: {
    type: Number,
    default: 0
  },
  hasKnowledgeBase: {
    type: Boolean,
    default: false
  },
  uploadInProgress: {
    type: Boolean,
    default: false
  },
  uploadedAt: {
    type: Date,
    default: null
  },
  websiteUrl: {
    type: String,
    default: null
  },
 
  // ── DEPRECATED ──────────────────────────────────────────────────────────────
  // Vectors are no longer stored in MongoDB.
  // They live in the Python agent's FAISS index at data/customers/<tenantId>/
  // This field is kept as an empty array for backward compatibility only.
  vectors: {
    type: Array,
    default: []
  }
 
}, { timestamps: true });
 
module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
