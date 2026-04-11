// models/FlowConfiguration.js
const mongoose = require('mongoose');

const flowConfigurationSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  // Flow identification
  flowId: {
    type: String,
    required: true,
    index: true
  },

  flowName: {
    type: String,
    required: true,
    trim: true
  },

  flowType: {
    type: String,
    enum: ['order_completion', 'registration', 'appointment', 'survey', 'feedback', 'lead_capture', 'custom'],
    required: true,
    index: true
  },

  description: {
    type: String,
    default: ''
  },

  // ✅ Field mapping - maps flow response fields to your system
  fieldMapping: {
    type: Map,
    of: {
      fieldName: String,        // Field name in flow JSON response (e.g., "customer_name")
      displayName: String,      // Display name for UI (e.g., "Customer Name")
      dataType: {
        type: String,
        enum: ['text', 'number', 'dropdown', 'date', 'email', 'phone', 'boolean', 'array', 'object'],
        default: 'text'
      },
      isRequired: Boolean,
      category: {
        type: String,
        enum: ['customer_info', 'address', 'preferences', 'business_info', 'payment_info', 'custom'],
        default: 'custom'
      },
      validationRules: {
        minLength: Number,
        maxLength: Number,
        pattern: String,
        min: Number,
        max: Number,
        allowedValues: [String]
      },
      defaultValue: mongoose.Schema.Types.Mixed,
      transformFunction: String  // Optional: name of function to transform value
    },
    default: {}
  },

  // ✅ Trigger configuration - when to send this flow
  triggerConfig: {
    triggerType: {
      type: String,
      enum: ['order_placed', 'button_click', 'keyword', 'manual', 'scheduled', 'webhook', 'catalog_order'],
      default: 'manual'
    },
    triggerKeywords: [String],
    triggerButtonId: String,
    autoSend: {
      type: Boolean,
      default: false
    },
    conditions: [{
      field: String,
      operator: {
        type: String,
        enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains']
      },
      value: mongoose.Schema.Types.Mixed
    }]
  },

  // ✅ Flow message template
  flowMessage: {
    headerType: {
      type: String,
      enum: ['text', 'image', 'video', 'document', 'none'],
      default: 'text'
    },
    headerText: {
      type: String,
      default: ''
    },
    headerMediaUrl: String,
    bodyText: {
      type: String,
      required: true
    },
    footerText: {
      type: String,
      default: 'Powered by GoWhats!'
    },
    buttonText: {
      type: String,
      default: 'Continue'
    },
    // ✅ Support for dynamic variables in messages
    variables: {
      type: Map,
      of: String,
      default: {}
    }
  },

  // ✅ Initial data to pass to flow (optional)
  initialFlowData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // ✅ Automated actions after flow completion
  automatedActions: [{
    actionType: {
      type: String,
      enum: [
        'send_message', 
        'create_order', 
        'send_payment', 
        'send_email', 
        'trigger_webhook', 
        'assign_tag', 
        'create_lead',
        'update_contact',
        'send_shipping_options',
        'none'
      ]
    },
    enabled: {
      type: Boolean,
      default: true
    },
    config: {
      messageTemplate: String,
      webhookUrl: String,
      webhookMethod: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'PATCH'],
        default: 'POST'
      },
      webhookHeaders: mongoose.Schema.Types.Mixed,
      tagIds: [String],
      emailTemplate: String,
      emailTo: String,
      orderConfig: mongoose.Schema.Types.Mixed,
      paymentConfig: {
        enabled: Boolean,
        configurationName: String,
        currency: {
          type: String,
          default: 'INR'
        },
        amountField: String,  // Which field contains the amount
        itemType: {
          type: String,
          enum: ['physical-goods', 'digital-goods'],
          default: 'physical-goods'
        }
      },
      shippingConfig: {
        enabled: Boolean,
        calculateShipping: Boolean,
        addressFields: {
          nameField: String,
          phoneField: String,
          addressLine1Field: String,
          addressLine2Field: String,
          cityField: String,
          stateField: String,
          pincodeField: String,
          countryField: String
        }
      }
    },
    executionOrder: {
      type: Number,
      default: 0
    },
    executeOnCondition: {
      enabled: Boolean,
      conditions: [{
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed
      }]
    }
  }],

  // ✅ Confirmation message after flow completion
  confirmationMessage: {
    enabled: {
      type: Boolean,
      default: true
    },
    messageTemplate: {
      type: String,
      default: 'Thank you! Your information has been received successfully.'
    },
    includeSubmittedData: {
      type: Boolean,
      default: true
    },
    dataDisplayFormat: {
      type: String,
      enum: ['list', 'paragraph', 'table'],
      default: 'list'
    }
  },

  // ✅ Analytics and tracking
  analytics: {
    totalSent: {
      type: Number,
      default: 0
    },
    totalCompleted: {
      type: Number,
      default: 0
    },
    totalFailed: {
      type: Number,
      default: 0
    },
    averageCompletionTime: {
      type: Number,
      default: 0
    },
    lastUsedAt: Date,
    conversionRate: {
      type: Number,
      default: 0
    }
  },

  // Status and metadata
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  isDeleted: {
    type: Boolean,
    default: false
  },

  version: {
    type: Number,
    default: 1
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: true
});

// Indexes for performance
flowConfigurationSchema.index({ tenantId: 1, flowType: 1 });
flowConfigurationSchema.index({ tenantId: 1, isActive: 1 });
flowConfigurationSchema.index({ flowId: 1 });
flowConfigurationSchema.index({ tenantId: 1, 'triggerConfig.triggerKeywords': 1 });
flowConfigurationSchema.index({ tenantId: 1, 'triggerConfig.triggerType': 1 });

// ✅ Static methods
flowConfigurationSchema.statics.findByFlowId = function(tenantId, flowId) {
  return this.findOne({
    tenantId: tenantId,
    flowId: flowId,
    isActive: true,
    isDeleted: false
  });
};

flowConfigurationSchema.statics.findByTriggerKeyword = function(tenantId, keyword) {
  return this.findOne({
    tenantId: tenantId,
    'triggerConfig.triggerKeywords': keyword.toLowerCase(),
    'triggerConfig.autoSend': true,
    isActive: true,
    isDeleted: false
  });
};

flowConfigurationSchema.statics.findByTriggerType = function(tenantId, triggerType) {
  return this.find({
    tenantId: tenantId,
    'triggerConfig.triggerType': triggerType,
    'triggerConfig.autoSend': true,
    isActive: true,
    isDeleted: false
  });
};

flowConfigurationSchema.statics.findActiveFlows = function(tenantId, flowType = null) {
  const query = {
    tenantId: tenantId,
    isActive: true,
    isDeleted: false
  };

  if (flowType) {
    query.flowType = flowType;
  }

  return this.find(query).sort({ createdAt: -1 });
};

// ✅ Instance methods
flowConfigurationSchema.methods.incrementUsage = async function() {
  this.analytics.totalSent += 1;
  this.analytics.lastUsedAt = new Date();
  return this.save();
};

flowConfigurationSchema.methods.incrementCompletion = async function() {
  this.analytics.totalCompleted += 1;
  this.analytics.conversionRate = (this.analytics.totalCompleted / this.analytics.totalSent) * 100;
  return this.save();
};

flowConfigurationSchema.methods.incrementFailure = async function() {
  this.analytics.totalFailed += 1;
  return this.save();
};

// ✅ Extract and transform field data from flow response
flowConfigurationSchema.methods.extractFieldData = function(flowResponseData) {
  const extractedData = {};
  const categorizedData = {};

  for (const [key, mapping] of this.fieldMapping.entries()) {
    const fieldName = mapping.fieldName || key;
    let value = flowResponseData[fieldName] || flowResponseData[key];

    if (value !== undefined && value !== null) {
      // Apply transformation if specified
      if (mapping.transformFunction) {
        value = this.applyTransformation(value, mapping.transformFunction);
      }

      // Apply validation
      if (mapping.isRequired && (!value || value === '')) {
        throw new Error(`Required field ${mapping.displayName || key} is missing`);
      }

      // Type conversion
      value = this.convertDataType(value, mapping.dataType);

      const displayName = mapping.displayName || key;
      extractedData[displayName] = value;

      // Categorize data
      const category = mapping.category || 'custom';
      if (!categorizedData[category]) {
        categorizedData[category] = {};
      }
      categorizedData[category][displayName] = value;
    }
  }

  return {
    flat: extractedData,
    categorized: categorizedData,
    raw: flowResponseData
  };
};

// ✅ Convert data types
flowConfigurationSchema.methods.convertDataType = function(value, dataType) {
  try {
    switch (dataType) {
      case 'number':
        return Number(value);
      case 'boolean':
        return Boolean(value);
      case 'date':
        return new Date(value);
      case 'array':
        return Array.isArray(value) ? value : [value];
      case 'object':
        return typeof value === 'object' ? value : JSON.parse(value);
      default:
        return String(value);
    }
  } catch (error) {
    console.error(`Error converting ${value} to ${dataType}:`, error);
    return value;
  }
};

// ✅ Apply transformation function
flowConfigurationSchema.methods.applyTransformation = function(value, functionName) {
  const transformations = {
    'uppercase': (v) => String(v).toUpperCase(),
    'lowercase': (v) => String(v).toLowerCase(),
    'trim': (v) => String(v).trim(),
    'phone_format': (v) => String(v).replace(/\D/g, ''),
    'capitalize': (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase()
  };

  return transformations[functionName] ? transformations[functionName](value) : value;
};

// ✅ Get actions for execution
flowConfigurationSchema.methods.getExecutableActions = function(flowResponseData) {
  return this.automatedActions
    .filter(action => {
      if (!action.enabled) return false;
      
      // Check execution conditions
      if (action.executeOnCondition?.enabled) {
        return this.evaluateConditions(action.executeOnCondition.conditions, flowResponseData);
      }
      
      return true;
    })
    .sort((a, b) => a.executionOrder - b.executionOrder);
};

// ✅ Evaluate conditions
flowConfigurationSchema.methods.evaluateConditions = function(conditions, data) {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every(condition => {
    const value = data[condition.field];
    
    switch (condition.operator) {
      case 'equals':
        return value == condition.value;
      case 'not_equals':
        return value != condition.value;
      case 'greater_than':
        return Number(value) > Number(condition.value);
      case 'less_than':
        return Number(value) < Number(condition.value);
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'not_contains':
        return !String(value).includes(String(condition.value));
      default:
        return true;
    }
  });
};

// ✅ Replace variables in template
flowConfigurationSchema.methods.replaceVariables = function(template, data) {
  let result = template;
  
  // Replace {{field_name}} with actual values
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  }
  
  return result;
};

module.exports = mongoose.model('FlowConfiguration', flowConfigurationSchema);
