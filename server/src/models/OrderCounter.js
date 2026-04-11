const mongoose = require('mongoose');

const orderCounterSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  counterType: {
    type: String,
    enum: ['order', 'ticket', 'registration'],
    default: 'order'
  },
  nextOrderNumber: {
    type: Number,
    default: 1000,
    min: 1
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ✅ Compound unique index to prevent collisions
orderCounterSchema.index({ tenantId: 1, counterType: 1 }, { unique: true });

// ✅ FIXED: Returns ONLY the number (e.g., 1001)
orderCounterSchema.statics.getNextOrderNumber = async function(tenantId, counterType = 'order') {
  try {
    const counter = await this.findOneAndUpdate(
      {
        tenantId: tenantId,
        counterType: counterType
      },
      {
        $inc: { nextOrderNumber: 1 },
        $set: { lastUpdated: new Date() }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    // Return plain number
    return counter.nextOrderNumber;

  } catch (error) {
    console.error('❌ Error generating order number:', error);
    // Fallback random number
    return 1000 + Math.floor(Math.random() * 8999);
  }
};

// ✅ Reset counter method
orderCounterSchema.statics.resetCounter = async function(tenantId, startFrom = 1000, counterType = 'order') {
  const counter = await this.findOneAndUpdate(
    { tenantId: tenantId, counterType: counterType },
    {
      nextOrderNumber: startFrom,
      lastUpdated: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return counter;
};

// ✅ Initialize tenant counter
orderCounterSchema.statics.initializeTenant = async function(tenantId, startFrom = 1000, counterType = 'order') {
  const existingCounter = await this.findOne({
    tenantId: tenantId,
    counterType: counterType
  });

  if (existingCounter) {
    return existingCounter;
  }

  const newCounter = await this.create({
    tenantId: tenantId,
    counterType: counterType,
    nextOrderNumber: startFrom,
    lastUpdated: new Date()
  });

  return newCounter;
};

const OrderCounter = mongoose.model('OrderCounter', orderCounterSchema);

// ✅ Self-healing: Remove old conflicting index
(async () => {
  try {
    await OrderCounter.collection.dropIndex('tenantId_1');
    console.log('✅ Dropped old conflicting index "tenantId_1"');
  } catch (error) {
    if (error.code !== 27) {
      // Index doesn't exist, ignore
    }
  }
})();

module.exports = OrderCounter;
