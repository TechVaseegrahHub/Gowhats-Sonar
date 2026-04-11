// models/TenantConfig.js
const mongoose = require('mongoose');

const TenantConfigSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  businessName: {
    type: String,
    required: true,
    default: 'My Business'
  },
  
  businessType: {
    type: String,
    enum: [
      'ecommerce',
      'service',
      'restaurant',
      'real_estate',
      'education',
      'healthcare',
      'automotive',
      'travel',
      'custom'
    ],
    default: 'ecommerce'
  },
  
  businessIndustry: {
    type: String,
    default: 'General'
  },
  
  botConfig: {
    botName: {
      type: String,
      default: 'Assistant'
    },
    
    botPersonality: {
      type: String,
      enum: ['professional', 'friendly', 'casual', 'formal'],
      default: 'professional'
    },
    
    language: {
      type: String,
      default: 'en'
    },
    
    greetingMessage: {
      type: String,
      default: 'I\'m here to help you. What would you like to know?'
    },
    
    fallbackMessage: {
      type: String,
      default: 'I can help you with information from our catalog. Could you please rephrase your question?'
    },
    
    thanksMessage: {
      type: String,
      default: 'You\'re welcome! Anything else I can help you with?'
    },
    
    goodbyeMessage: {
      type: String,
      default: 'Feel free to reach out anytime!'
    },
    
    noResponseMessage: {
      type: String,
      default: 'Alright! Feel free to ask if you need any information.'
    }
  },
  
  terminology: {
    itemName: {
      type: String,
      default: 'products'
    },
    
    catalogName: {
      type: String,
      default: 'catalog'
    },
    
    pricingTerm: {
      type: String,
      default: 'price'
    }
  },
  
  responseConfig: {
    maxWordCount: {
      type: Number,
      default: 150,
      min: 50,
      max: 300
    },
    
    includeEmoji: {
      type: Boolean,
      default: true
    },
    
    emojiStyle: {
      type: String,
      default: '🤖'
    },
    
    alwaysAskFollowUp: {
      type: Boolean,
      default: false
    },
    
    mentionBusinessName: {
      type: Boolean,
      default: true
    },
    
    formalTone: {
      type: Boolean,
      default: false
    }
  },
  
  contactInfo: {
    supportPhone: String,
    supportEmail: String,
    website: String,
    workingHours: String
  },
  
  customInstructions: {
    type: String,
    default: ''
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

TenantConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('TenantConfig', TenantConfigSchema);
