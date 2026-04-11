const mongoose = require('mongoose');

const workflowSchema = new mongoose.Schema({
  workflow: String,
  buttonText: String,
  message: String
});

const botConfigurationSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true, unique: true },
  
  welcomeMessageType: {
    type: String,
    enum: ['Text', 'Interactive'],
    default: 'Interactive'
  },
  
  interactiveType: {
    type: String,
    enum: ['Button', 'List'],
    default: 'Button'
  },
  
  headerType: {
    type: String,
    enum: ['None', 'Text', 'Image', 'Video', 'Document'],
    default: 'None'
  },
  
  headerText: String,
  headerMediaUrl: String,
  messageBody: { type: String, required: true },
  footerText: String,
  
  workflows: [workflowSchema],
  workflowMessages: [workflowSchema],
  
  triggerWords: [String],
  
  // Enhanced bot personality settings
  botPersonality: {
    type: String,
    enum: ['professional', 'friendly', 'casual', 'technical', 'luxury'],
    default: 'friendly'
  },
  
  businessType: {
    type: String,
    enum: ['ecommerce', 'service', 'healthcare', 'education', 'restaurant', 'beauty', 'fitness', 'real_estate', 'other'],
    default: 'other'
  },
  
  responseStyle: {
    includeEmojis: { type: Boolean, default: true },
    askFollowups: { type: Boolean, default: true },
    includeContactInfo: { type: Boolean, default: true },
    responseLength: {
      type: String,
      enum: ['brief', 'detailed', 'comprehensive'],
      default: 'detailed'
    }
  },
  
  customInstructions: {
    type: String,
    maxLength: 500,
    default: ''
  },
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Check if model already exists before compiling
module.exports = mongoose.models.BotConfiguration || mongoose.model('BotConfiguration', botConfigurationSchema);
