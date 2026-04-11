const mongoose = require('mongoose');

// ✅ Helper Map: Converts WhatsApp State Codes to Full Names
const stateCodeMap = {
  "AN": "Andaman and Nicobar Islands",
  "AP": "Andhra Pradesh",
  "AR": "Arunachal Pradesh",
  "AS": "Assam",
  "BR": "Bihar",
  "CG": "Chandigarh",
  "CH": "Chhattisgarh",
  "DN": "Dadra and Nagar Haveli",
  "DD": "Daman and Diu",
  "DL": "Delhi",
  "GA": "Goa",
  "GJ": "Gujarat",
  "HR": "Haryana",
  "HP": "Himachal Pradesh",
  "JK": "Jammu and Kashmir",
  "JH": "Jharkhand",
  "KA": "Karnataka",
  "KL": "Kerala",
  "LA": "Ladakh",
  "LD": "Lakshadweep",
  "MP": "Madhya Pradesh",
  "MH": "Maharashtra",
  "MN": "Manipur",
  "ML": "Meghalaya",
  "MZ": "Mizoram",
  "NL": "Nagaland",
  "OR": "Odisha",
  "PY": "Puducherry",
  "PB": "Punjab",
  "RJ": "Rajasthan",
  "SK": "Sikkim",
  "TN": "Tamil Nadu",
  "TG": "Telangana",
  "TR": "Tripura",
  "UP": "Uttar Pradesh",
  "UT": "Uttarakhand",
  "WB": "West Bengal"
};

const shippingCalculationSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  customerPhone: { type: String, required: true, index: true },
  orderDetails: {
    orderId: String,
    orderAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    itemCount: { type: Number, default: 1 },
    packageWeight: { type: Number, default: 0.5 }
  },
  customerAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  availableShippingOptions: [{
    methodId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingMethod' },
    methodName: String,
    courierType: { type: String, enum: ['freeshipping', 'courier', 'slab'] }, // Added slab here for schema validation
    isEligible: { type: Boolean, default: true },
    shippingCost: { type: Number, min: 0 },
    totalCost: Number,
    estimatedDeliveryDays: { type: Number, default: 5 },
    estimatedDeliveryTime: String,
    supportsCOD: { type: Boolean, default: true },
    isFreeShipping: { type: Boolean, default: false },
    shortfall: Number,
    savings: Number,
    reason: String,
    _id: false
  }],
  selectedShipping: {
    methodId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingMethod' },
    methodName: String,
    shippingCost: Number,
    totalCost: Number,
    selectedAt: Date
  },
  calculationStatus: {
    type: String,
    enum: ['pending', 'calculated', 'selected', 'completed'],
    default: 'pending'
  },
  flowToken: String,
  sessionData: {
    messageId: String,
    flowCompletedAt: Date,
    shippingListSentAt: Date,
    selectionReceivedAt: Date
  },
  freeShippingApplied: { type: Boolean, default: false },
  freeShippingDetails: {
    methodId: mongoose.Schema.Types.ObjectId,
    methodName: String,
    shippingCost: { type: Number, default: 0 },
    minOrderAmount: Number,
    savings: Number,
    reason: String
  },
  metadata: {
    source: { type: String, default: 'whatsapp_flow' },
    userAgent: String,
    ipAddress: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

shippingCalculationSchema.index({ tenantId: 1, customerPhone: 1 });
shippingCalculationSchema.index({ tenantId: 1, calculationStatus: 1 });
shippingCalculationSchema.index({ flowToken: 1 });
shippingCalculationSchema.index({ createdAt: -1 });

shippingCalculationSchema.statics.findByFlowToken = function(tenantId, flowToken) {
  return this.findOne({ tenantId, flowToken });
};

shippingCalculationSchema.statics.findActiveByPhone = function(tenantId, customerPhone) {
  return this.findOne({
    tenantId,
    customerPhone,
    calculationStatus: { $in: ['pending', 'calculated'] }
  }).sort({ createdAt: -1 });
};

// Core Calculation Logic
shippingCalculationSchema.methods.calculateShippingOptions = async function() {
  try {
    // ✅ Use mongoose.model to avoid caching issues with require
    const ShippingMethod = mongoose.model('ShippingMethod');

    // Get active shipping methods for this tenant
    const shippingMethods = await ShippingMethod.find({
      tenantId: this.tenantId,
      isActive: true
    });

    console.log(`📦 Calculating shipping for order amount: ₹${this.orderDetails.orderAmount}`);

    // Normalize State Name
	let customerState = this.customerAddress?.state;

	// Guard against corrupted crypto/signature strings
	if (customerState && (
	    customerState.startsWith('sig:') ||
	    customerState.includes('MCow') ||
	    customerState.length > 50
	)) {
	    console.warn(`⚠️ Corrupted state value detected, clearing it`);
	    customerState = null;
	}

	if (customerState && customerState.length === 2 && stateCodeMap[customerState.toUpperCase()]) {
	    customerState = stateCodeMap[customerState.toUpperCase()];
	    console.log(`🔄 Normalized State Code: ${this.customerAddress.state} -> ${customerState}`);
	} else {
	    console.log(`ℹ️ Using State Name directly: ${customerState}`);
	}
	   
   const options = [];
    let freeShippingApplied = false;
    let freeShippingDetails = null;

    for (const method of shippingMethods) {
      const option = {
        methodId: method._id,
        methodName: method.methodName,
        courierType: method.courierType,
        supportsCOD: method.supportsCOD !== undefined ? method.supportsCOD : true,
        estimatedDeliveryDays: method.estimatedDeliveryDays || 5,
        estimatedDeliveryTime: method.estimatedDeliveryTime || '3-5 business days'
      };

      if (method.courierType === 'freeshipping') {
        const minOrderAmount = method.freeShippingAmount || 0;
        if (this.orderDetails.orderAmount >= minOrderAmount) {
          freeShippingApplied = true;
          freeShippingDetails = {
            methodId: method._id,
            methodName: method.methodName,
            shippingCost: 0,
            minOrderAmount: minOrderAmount,
            savings: 0,
            reason: `Free shipping applied (order above ₹${minOrderAmount.toFixed(2)})`
          };
          console.log(`✅ FREE SHIPPING QUALIFIED: ${method.methodName}`);
        }
      }
      // ✅ FIXED: Now includes 'slab' type!
      else if (method.courierType === 'courier' || method.courierType === 'slab') {
        
        const cost = method.calculateCost(this.orderDetails.orderAmount, this.orderDetails.packageWeight, customerState);

        if (cost !== null) {
            option.isEligible = true;
            option.shippingCost = cost;
            option.isFreeShipping = false;
            option.reason = method.courierType === 'slab' ? 'Slab Rate' : (method.useStateWiseRates ? `State-wise rate for ${customerState}` : `Fixed rate`);
            option.totalCost = this.orderDetails.orderAmount + option.shippingCost;

            options.push(option);
            console.log(`🚚 Added option: ${method.methodName} - ₹${option.shippingCost}`);
        } else {
             console.log(`❌ Method ${method.methodName} not eligible (State: ${customerState})`);
        }
      }
    }

    // Update savings if free shipping applied
    if (freeShippingApplied && options.length > 0) {
        const cheapestOption = options.reduce((min, opt) => opt.shippingCost < min ? opt.shippingCost : min, options[0].shippingCost);
        freeShippingDetails.savings = cheapestOption;
    }

    this.availableShippingOptions = options;
    this.freeShippingApplied = freeShippingApplied;
    this.freeShippingDetails = freeShippingDetails;
    this.calculationStatus = 'calculated';
    await this.save();

    console.log(`✅ Calculated: ${options.length} options, Free Shipping: ${freeShippingApplied}`);

    return options;
  } catch (error) {
    console.error('❌ Error calculating shipping options:', error);
    throw error;
  }
};

shippingCalculationSchema.methods.shouldApplyFreeShipping = function() {
  return this.freeShippingApplied && this.freeShippingDetails;
};

shippingCalculationSchema.methods.getFreeShippingDetails = function() {
  return this.freeShippingDetails;
};

shippingCalculationSchema.methods.selectShippingMethod = function(methodId, methodName, shippingCost) {
  this.selectedShipping = {
    methodId,
    methodName,
    shippingCost,
    totalCost: this.orderDetails.orderAmount + shippingCost,
    selectedAt: new Date()
  };
  this.calculationStatus = 'selected';
  this.sessionData.selectionReceivedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('ShippingCalculation', shippingCalculationSchema);
