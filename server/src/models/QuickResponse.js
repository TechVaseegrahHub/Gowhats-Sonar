const mongoose = require('mongoose');

const quickResponseSchema = new mongoose.Schema(
  {
    shortcut: {
      type: String,
      required: [true, 'Shortcut is required'],
      trim: true,
      validate: {
        validator: function(v) {
          return v.startsWith('/');
        },
        message: props => 'Shortcut must start with a slash (/)'
      }
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true
    },
    tenant_id: {
      type: String,
      required: true
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// IMPORTANT: Create a COMPOUND index for tenant-scoped uniqueness
// This ensures shortcuts are unique only within a tenant
quickResponseSchema.index({ shortcut: 1, tenant_id: 1 }, { unique: true });

// Remove any global uniqueness constraint on just the shortcut field
// If you had something like this before, remove it:
// quickResponseSchema.index({ shortcut: 1 }, { unique: true });

// Index for text search
quickResponseSchema.index({ message: 'text' });

// Ensure shortcut starts with /
quickResponseSchema.pre('save', function(next) {
  if (!this.shortcut.startsWith('/')) {
    this.shortcut = `/${this.shortcut}`;
  }
  next();
});

quickResponseSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.shortcut && !update.shortcut.startsWith('/')) {
    update.shortcut = `/${update.shortcut}`;
  }
  next();
});

const QuickResponse = mongoose.model('QuickResponse', quickResponseSchema);

module.exports = QuickResponse;