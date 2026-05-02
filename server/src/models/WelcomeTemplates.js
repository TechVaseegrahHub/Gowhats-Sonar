// models/WelcomeTemplates.js
const mongoose = require('mongoose');

const workflowSchema = new mongoose.Schema({
  workflow: {
    type: String,
    required: [true, 'Workflow type is required'],
    enum: ['Visit Website', 'Shop Our Collection', 'Talk with Our Team', 'Product Suggestions'],
    trim: true
  },
  buttonText: {
    type: String,
    required: [true, 'Button text is required'],
    maxlength: [20, 'Button text cannot exceed 20 characters'],
    trim: true
  },
  url: {
    type: String,
    trim: true,
    default: null
  }
}, { _id: false });

const workflowMessageSchema = new mongoose.Schema({
  workflow: {
    type: String,
    required: [true, 'Workflow type is required'],
    enum: ['Visit Website', 'Shop Our Collection', 'Talk with Our Team', 'Product Suggestions'],
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true
  },
  // ✅ FIX: Store per-tenant URL for Visit Website workflow
  url: {
    type: String,
    trim: true,
    default: null
  },
  isCustomized: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const botConfigurationSchema = new mongoose.Schema({
  tenant_id: {
    type: String,
    required: true
  },
  welcomeMessageType: {
    type: String,
    enum: ['Interactive', 'Simple Text'],
    default: 'Interactive'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  interactiveType: {
    type: String,
    enum: ['Button', 'List'],
    default: 'Button'
  },
  headerText: {
    type: String,
    default: 'Welcome to Vaseegrah Veda!',
    maxlength: 60,
    trim: true
  },
  messageBody: {
    type: String,
    required: [true, 'Message body is required'],
    maxlength: 1024,
    default: 'Ready to embrace the freshness of nature? Share us your Hair/Skin concerns, Our team will guide you to the perfect herbal solution tailored for you! 🌿 ✨',
    trim: true
  },

  triggerWords: {
    type: [String],
    default: ['hi', 'hello', 'hey', 'start', 'help', 'namaste', 'வணக்கம்'],
    validate: {
      validator: function (words) {
        return words.length > 0;
      },
      message: 'At least one trigger word is required'
    }
  },

  workflows: {
    type: [workflowSchema],
    validate: [
      {
        validator: function (workflows) {
          return workflows.length >= 1 && workflows.length <= 4;
        },
        message: 'You can only have up to 4 workflows'
      }
    ],
    default: [
      { workflow: 'Visit Website', buttonText: 'Visit Website' },
      { workflow: 'Shop Our Collection', buttonText: 'Shop Our Collection' },
      { workflow: 'Talk with Our Team', buttonText: 'Talk with Our Team' },
      { workflow: 'Product Suggestions', buttonText: 'Product Suggestions' }
    ]
  },

  workflowMessages: {
    type: [workflowMessageSchema],
    default: [
      {
        // ✅ FIX: No hardcoded URL in message body — tenant must configure their own URL
        workflow: 'Visit Website',
        message: "Click the link below to visit our website! 🙏",
        url: null,
        isCustomized: false
      },
      {
        workflow: 'Shop Our Collection',
        message: "To shop our products, click the 'WhatsApp Shop' button above.\n\nഎങ്ങൾ തയാരിപ്പുകളൈ വാങ്ങക, മേലുള്ള 'വാട്ട്സ്അപ്പു ഷോപ്പു' പൊത്തൻ കിളിക്ക് സെയ്യവും.",
        url: null,
        isCustomized: false
      },
      {
        workflow: 'Talk with Our Team',
        message: "Hi 👋 Our customer support executive, is available to resolve your queries from 9am to 6pm & will get in touch with you soon. We appreciate your patience! ❤️\n\nവണക്കം 👋 എങ്ങൾ വാടിക്കയാളര് ആധരവു പിരതിനിധി, 9 മണി മുതൽ 6 മണി വരെ ഉങ്ങൾ കേൾവികൾക്കു പതിളാഴിക്ക തയാറാക ഉള്ളാര് & വിറൈവിൽ ഉങ്ങളൈത് തൊടർപു കൊൾവാര്. ഉങ്ങൾ പൊറുമൈക്കു നൻറി! ❤️",
        url: null,
        isCustomized: false
      },
      {
        workflow: 'Product Suggestions',
        message: "🤖 AI Assistant activated! I'm here to help you find the perfect products. Tell me what you're looking for or describe your needs, and I'll provide personalized recommendations based on our product catalog.",
        url: null,
        isCustomized: false
      }
    ]
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

// Update the updatedAt field before saving
botConfigurationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('BotConfiguration', botConfigurationSchema, 'botconfigurations');
