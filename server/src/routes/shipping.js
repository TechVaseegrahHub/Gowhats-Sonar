// routes/shipping.js
const express = require('express');
const router = express.Router();
const ShippingMethod = require('../models/ShippingMethod');
const ShippingCalculation = require('../models/ShippingCalculation');
const auth = require('../middleware/auth');

// Helper function to get tenant ID from request
const getTenantId = (req) => {
  return req.user?.tenantId ||
         req.user?.tenant_id ||
         req.tenant?._id?.toString() ||
         req.user?.id;
};

// ==========================================
// 1. GET ALL METHODS
// ==========================================
router.get('/methods', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID required' });

    const methods = await ShippingMethod.find({
      tenantId: tenantId.toString(),
      isActive: true
    }).sort({ createdAt: -1 });

    res.json({ success: true, methods: methods, count: methods.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch shipping methods', error: error.message });
  }
});

// ==========================================
// 2. CREATE METHOD (Updated for Slab Config)
// ==========================================
router.post('/methods', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID required' });

    const {
      methodName,
      courierType,
      freeShippingAmount,
      fixedShippingRate,
      isActive,
      description,
      estimatedDeliveryDays,
      estimatedDeliveryTime,
      supportsCOD,
      maxWeight,
      restrictions,
      useStateWiseRates,
      stateRates,
      trackingUrl,
      // ✅ NEW: Receive Slab Config from Frontend
      slabConfig
    } = req.body;

    // --- Validation ---
    if (!methodName || !courierType) {
      return res.status(400).json({ success: false, message: 'Method name and courier type are required' });
    }

    if (courierType === 'freeshipping' && !freeShippingAmount) {
      return res.status(400).json({ success: false, message: 'Free shipping amount is required' });
    }

    // Courier Validation
    if (courierType === 'courier') {
      if (useStateWiseRates) {
        if (!stateRates || stateRates.length === 0) {
          return res.status(400).json({ success: false, message: 'At least one state rate is required' });
        }
      } else {
        if (!fixedShippingRate) {
          return res.status(400).json({ success: false, message: 'Fixed shipping rate is required' });
        }
      }
    }

    // Slab Validation
    if (courierType === 'slab' && !slabConfig) {
       return res.status(400).json({ success: false, message: 'Slab configuration is missing' });
    }

    // --- Create Object ---
    const shippingMethod = new ShippingMethod({
      tenantId: tenantId.toString(),
      methodName,
      courierType,
      freeShippingAmount: courierType === 'freeshipping' ? freeShippingAmount : undefined,
      fixedShippingRate: courierType === 'courier' ? (fixedShippingRate || 0) : undefined,
      isActive: isActive !== undefined ? isActive : true,
      description,
      estimatedDeliveryDays: estimatedDeliveryDays || 5,
      estimatedDeliveryTime: estimatedDeliveryTime || '3-5 business days',
      supportsCOD: supportsCOD !== undefined ? supportsCOD : true,
      maxWeight: maxWeight || 50,
      restrictions: restrictions || {},
      useStateWiseRates: !!useStateWiseRates,
      stateRates: useStateWiseRates ? stateRates : [],
      trackingUrl: trackingUrl || "",
      // ✅ NEW: Save Slab Config
      slabConfig: courierType === 'slab' ? slabConfig : undefined
    });

    await shippingMethod.save();
    res.status(201).json({ success: true, message: 'Shipping method created successfully', method: shippingMethod });

  } catch (error) {
    console.error('Error creating shipping method:', error);
    res.status(500).json({ success: false, message: 'Failed to create shipping method', error: error.message });
  }
});

// ==========================================
// 3. UPDATE METHOD (Updated for Slab Config)
// ==========================================
router.put('/methods/:id', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const method = await ShippingMethod.findOne({ _id: req.params.id, tenantId: tenantId.toString() });

    if (!method) return res.status(404).json({ success: false, message: 'Shipping method not found' });

    const { courierType, useStateWiseRates, stateRates, fixedShippingRate, slabConfig } = req.body;

    // --- Validation for Updates ---
    const targetType = courierType || method.courierType;
    const targetUseState = useStateWiseRates !== undefined ? useStateWiseRates : method.useStateWiseRates;

    if (targetType === 'courier') {
       if (targetUseState) {
          const hasRates = (stateRates && stateRates.length > 0) || (method.stateRates && method.stateRates.length > 0);
          if (!hasRates) {
             return res.status(400).json({ success: false, message: 'At least one state rate is required' });
          }
       } else {
          const hasFixed = fixedShippingRate || method.fixedShippingRate;
          if (!hasFixed) {
             return res.status(400).json({ success: false, message: 'Fixed shipping rate is required' });
          }
       }
    }

    // --- Update Fields ---
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        method[key] = req.body[key];
      }
    });

    // ✅ Explicitly update slabConfig if provided (sometimes deep objects need explicit assignment)
    if (slabConfig && targetType === 'slab') {
        method.slabConfig = slabConfig;
    }

    await method.save();
    res.json({ success: true, message: 'Shipping method updated successfully', method: method });

  } catch (error) {
    console.error('Error updating shipping method:', error);
    res.status(500).json({ success: false, message: 'Failed to update shipping method', error: error.message });
  }
});

// ==========================================
// 4. TOGGLE ACTIVE STATUS
// ==========================================
router.patch('/methods/:id/toggle', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { isActive } = req.body;
    const method = await ShippingMethod.findOneAndUpdate(
      { _id: req.params.id, tenantId: tenantId.toString() },
      { isActive },
      { new: true }
    );
    if (!method) return res.status(404).json({ success: false, message: 'Shipping method not found' });
    res.json({ success: true, message: `Status updated`, method: method });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle shipping method', error: error.message });
  }
});

// ==========================================
// 5. DELETE METHOD
// ==========================================
router.delete('/methods/:id', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const method = await ShippingMethod.findOneAndDelete({ _id: req.params.id, tenantId: tenantId.toString() });
    if (!method) return res.status(404).json({ success: false, message: 'Shipping method not found' });
    res.json({ success: true, message: 'Shipping method deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete shipping method', error: error.message });
  }
});

// ==========================================
// 6. CALCULATE SHIPPING
// ==========================================
router.post('/calculate', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { customerPhone, orderDetails, customerAddress, flowToken } = req.body;

    if (!customerPhone || !orderDetails?.orderAmount) {
      return res.status(400).json({ success: false, message: 'Customer phone and order amount required' });
    }

    // Find existing pending calculation or create new
    let calculation = await ShippingCalculation.findOne({
      tenantId: tenantId.toString(),
      customerPhone,
      flowToken: flowToken || undefined,
      calculationStatus: { $in: ['pending', 'calculated'] }
    });

    if (!calculation) {
      calculation = new ShippingCalculation({
        tenantId: tenantId.toString(),
        customerPhone,
        orderDetails: {
          orderId: orderDetails.orderId || `ORD-${Date.now()}`,
          orderAmount: parseFloat(orderDetails.orderAmount),
          currency: orderDetails.currency || 'INR',
          itemCount: orderDetails.itemCount || 1,
          packageWeight: orderDetails.packageWeight || 0.5
        },
        customerAddress: customerAddress || {},
        flowToken: flowToken,
        calculationStatus: 'pending'
      });
    } else {
      // Update existing calculation details
      calculation.orderDetails = { ...calculation.orderDetails, ...orderDetails, orderAmount: parseFloat(orderDetails.orderAmount) };
      if (customerAddress) calculation.customerAddress = customerAddress;
    }

    // Calculate Options (Logic is now inside ShippingMethod.js model)
    const options = await calculation.calculateShippingOptions();

    res.json({
      success: true,
      message: 'Shipping options calculated',
      calculationId: calculation._id,
      shippingOptions: options
    });
  } catch (error) {
    console.error('Error calculating shipping:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate options', error: error.message });
  }
});

module.exports = router;
