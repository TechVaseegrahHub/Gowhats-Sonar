const express = require('express');
const router = express.Router();
const CourierConfig = require('../models/CourierConfig');
const auth = require('../middleware/auth');

// Get Courier List (Create defaults if not exists)
router.get('/', auth, async (req, res) => {
  try {
    let config = await CourierConfig.findOne({ tenantId: req.user.tenant_id });
    
    // If no config exists, create default popular ones to help the user
    if (!config) {
      config = await CourierConfig.create({
        tenantId: req.user.tenant_id,
        couriers: [
          { name: 'Professional Courier', trackingUrlBase: 'https://www.professionalcourier.in/track-shipment?awb=' },
          { name: 'DTDC', trackingUrlBase: 'https://www.dtdc.in/tracking.asp?awbno=' },
          { name: 'India Post', trackingUrlBase: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?' },
          { name: 'Delhivery', trackingUrlBase: 'https://www.delhivery.com/track/package/' },
          { name: 'ST Courier', trackingUrlBase: 'https://stcourier.com/track/shipment?' },
          { name: 'Trackon', trackingUrlBase: 'https://trackon.in/?tracking_number=' },
          { name: 'In-Person / Self', trackingUrlBase: '' }
        ]
      });
    }
    
    res.json(config);
  } catch (error) {
    console.error('Error fetching courier config:', error);
    res.status(500).json({ error: 'Server error fetching couriers' });
  }
});

// Update Courier List
router.post('/', auth, async (req, res) => {
  try {
    const { couriers } = req.body;
    
    const config = await CourierConfig.findOneAndUpdate(
      { tenantId: req.user.tenant_id },
      { $set: { couriers } },
      { new: true, upsert: true }
    );
    
    res.json(config);
  } catch (error) {
    console.error('Error saving courier config:', error);
    res.status(500).json({ error: 'Server error saving couriers' });
  }
});

module.exports = router;
