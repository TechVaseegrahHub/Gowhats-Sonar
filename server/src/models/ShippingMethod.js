const mongoose = require('mongoose');

const shippingMethodSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  methodName: { type: String, required: true, trim: true },
  courierType: { type: String, required: true, enum: ['freeshipping', 'courier', 'slab'] },
  trackingUrl: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  freeShippingAmount: { type: Number, min: 0 },
  fixedShippingRate: { type: Number, min: 0 },
  useStateWiseRates: { type: Boolean, default: false },
  stateRates:[{ state: String, rate: { type: Number, min: 0 }, _id: false }],
  slabConfig: {
    zoneAStates: { type: [String], default: [] },
    zoneASlabs:[{ min: Number, max: Number, rate: Number, _id: false }],
    zoneBSlabs:[{ min: Number, max: Number, rate: Number, _id: false }],
    dynamicIncrement: {
      enabled: { type: Boolean, default: false },
      thresholdAmount: { type: Number, default: 1100 },
      baseRate: { type: Number, default: 150 },
      everyAmount: { type: Number, default: 200 },
      addRate: { type: Number, default: 30 }
    }
  },
  description: String,
  estimatedDeliveryDays: { type: Number, default: 5 },
  estimatedDeliveryTime: { type: String, default: '3-5 business days' },
  supportsCOD: { type: Boolean, default: true },
  maxWeight: { type: Number, default: 50 },
  restrictions: {
    minOrderAmount: { type: Number, default: 0 },
    maxOrderAmount: Number,
    excludedPincodes: [String],
    includedPincodes: [String]
  },
  displayOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

shippingMethodSchema.index({ tenantId: 1, isActive: 1 });

// ✅ UPDATED: Calculation Logic with DEBUG LOGS and NaN/Infinity Protection
shippingMethodSchema.methods.calculateCost = function(orderAmount, packageWeight, state) {
  const amount = parseFloat(orderAmount) || 0;
  console.log(`\n--- Shipping Calc (${this.methodName}) ---`);
  console.log(`Type: ${this.courierType}, Amount: ${amount}, State: ${state}`);

  // 1. Free Shipping
  if (this.courierType === 'freeshipping') {
    const freeAmt = parseFloat(this.freeShippingAmount) || 0;
    return amount >= freeAmt ? 0 : null;
  }

  // 2. Slab / Excel Logic
  else if (this.courierType === 'slab') {
    const config = this.slabConfig;
    const currentState = (state || "").toLowerCase().trim();

    // Check Config
    if(!config || !config.zoneAStates) {
        console.log("❌ Slab config missing or invalid");
        return null;
    }

    // Check Zone A
    const isZoneA = config.zoneAStates.some(s => currentState.includes(s.toLowerCase().trim()));
    console.log(`Zone A Check: '${currentState}' in[${config.zoneAStates}]? ${isZoneA}`);

    // --- ZONE A ---
    if (isZoneA) {
      const slab = config.zoneASlabs.find(s => amount >= s.min && amount <= s.max);
      if (slab) {
          console.log(`✅ Found Zone A Slab: ${slab.min}-${slab.max} = ₹${slab.rate}`);
          return parseFloat(slab.rate) || 0;
      }
      console.log(`❌ No Zone A slab matches amount ${amount}`);
      return null;
    }

    // --- ZONE B ---
    else {
      // Dynamic Rule
      if (config.dynamicIncrement?.enabled) {
        const thresholdAmount = parseFloat(config.dynamicIncrement.thresholdAmount) || 0;
        const everyAmount = parseFloat(config.dynamicIncrement.everyAmount) || 1; // Prevent division by zero
        const baseRate = parseFloat(config.dynamicIncrement.baseRate) || 0;
        const addRate = parseFloat(config.dynamicIncrement.addRate) || 0;

        if (amount > thresholdAmount) {
          const extraAmount = amount - thresholdAmount;
          const segments = Math.ceil(extraAmount / everyAmount);
          const cost = baseRate + (segments * addRate);
          console.log(`✅ Dynamic Rule Applied: ₹${cost}`);
          return cost;
        }
      }

      const slab = config.zoneBSlabs.find(s => amount >= s.min && amount <= s.max);
      if (slab) {
          console.log(`✅ Found Zone B Slab: ${slab.min}-${slab.max} = ₹${slab.rate}`);
          return parseFloat(slab.rate) || 0;
      }

      console.log(`❌ No Zone B slab matches amount ${amount}`);
      return null;
    }
  }

  // 3. Courier
  else {
    if (this.useStateWiseRates && state) {
      const stateRate = this.getRateForState(state);
      return stateRate !== null ? (parseFloat(stateRate) || 0) : (parseFloat(this.fixedShippingRate) || 0);
    }
    return parseFloat(this.fixedShippingRate) || 0;
  }
};

shippingMethodSchema.methods.getRateForState = function(state) {
  if (!this.stateRates) return null;
  const stateRate = this.stateRates.find(sr => sr.state.toLowerCase() === state.toLowerCase());
  return stateRate ? stateRate.rate : null;
};

shippingMethodSchema.methods.getTrackingUrl = function(trackingNumber) {
  if (!this.trackingUrl || !trackingNumber) return null;
  return this.trackingUrl.replace('{tracking_number}', trackingNumber);
};

module.exports = mongoose.model('ShippingMethod', shippingMethodSchema);
