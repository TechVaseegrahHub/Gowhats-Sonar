// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// Config
const WHATSAPP_API_VERSION = 'v22.0';
const WHATSAPP_API_URL = 'https://graph.facebook.com';

// Update WhatsApp Business Profile
router.post('/business-profile/:phoneNumberId', async (req, res) => {
  try {
    const { phoneNumberId } = req.params;
    const { messaging_product, about, address, description, email, vertical, websites } = req.body;
    
    // Get access token from your secure storage
    const accessToken = await getAccessToken(); // Implement this function
    
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/whatsapp_business_profile`,
      {
        messaging_product,
        about,
        address,
        description,
        email,
        vertical,
        websites
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Error updating WhatsApp business profile:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update WhatsApp business profile',
      error: error.response?.data || error.message
    });
  }
});

router.post('/upload-profile-picture', auth, checkTenant, async (req, res) => {
  try {
    console.log("Upload request received:", req.files);
    
    // Check if file exists in the request
    if (!req.files || !req.files.file) {
      console.log("No file in request:", req.files);
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    const { phoneNumberId } = req.body;
    if (!phoneNumberId) {
      return res.status(400).json({
        success: false,
        message: 'Phone number ID is required'
      });
    }
    
    console.log(`Uploading profile picture for phone ID: ${phoneNumberId}`);
    console.log(`File size: ${req.files.file.size} File type: ${req.files.file.mimetype}`);
    
    // Get the uploaded file
    const uploadedFile = req.files.file;
    const filePath = `/tmp/${Date.now()}_${uploadedFile.name}`;
    
    // Save file temporarily
    await uploadedFile.mv(filePath);
    
    // Rest of your implementation...
    
    return res.json({
      success: true,
      message: 'Profile picture updated successfully'
    });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload profile picture',
      error: error.message
    });
  }
});

// Backend routes for WhatsApp integration
app.get('/api/whatsapp/business-profile/:phoneNumberId', authenticateUser, async (req, res) => {
    try {
      const { phoneNumberId } = req.params;
      
      // Call Meta's Graph API using your access token
      const response = await axios.get(
        `https://graph.facebook.com/v22.0/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
          }
        }
      );
      
      res.json({
        success: true,
        data: response.data
      });
    } catch (error) {
      console.error('Error fetching WhatsApp profile:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch WhatsApp profile',
        error: error.message
      });
    }
  });
  
// Make sure this endpoint is correctly defined
router.get('/business-profile/:phoneNumberId', async (req, res) => {
  try {
    const { phoneNumberId } = req.params;
    
    // Get tenant
    const tenant = await Tenant.findById(req.user.tenant_id);
    if (!tenant || !tenant.whatsappConfig || !tenant.whatsappConfig.accessToken) {
      return res.status(401).json({
        success: false,
        message: 'WhatsApp configuration not found'
      });
    }
    
    // Use tenant's access token
    const accessToken = tenant.whatsappConfig.accessToken;
    
    // Call Meta's Graph API
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Error fetching WhatsApp profile:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch WhatsApp profile',
      error: error.message
    });
  }
});

  router.post('/business-profile/:phoneNumberId', authenticateUser, async (req, res) => {
    try {
      const { phoneNumberId } = req.params;
      const { messaging_product, about, address, description, email, vertical, websites } = req.body;
      
      // Call Meta's Graph API to update the profile
      const response = await axios.post(
        `https://graph.facebook.com/v22.0/${phoneNumberId}/whatsapp_business_profile`,
        {
          messaging_product,
          about,
          address,
          description,
          email,
          vertical,
          websites
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      res.json({
        success: true,
        data: response.data
      });
    } catch (error) {
      console.error('Error updating profile:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to update WhatsApp profile',
        error: error.response?.data || error.message
      });
    }
  });

  // Add this to your backend routes
router.get('/current-whatsapp-config', [auth, checkTenant], async (req, res) => {
    try {
      const tenant = await Tenant.findById(req.user.tenant_id);
      if (!tenant || !tenant.whatsappConfig) {
        return res.status(404).json({
          success: false,
          message: 'WhatsApp configuration not found'
        });
      }
      
      res.json({
        success: true,
        phoneNumberId: tenant.whatsappConfig.phoneNumberId,
        businessAccountId: tenant.whatsappConfig.businessAccountId
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching WhatsApp configuration',
        error: error.message
      });
    }
  });

router.get('/api/whatsapp/config', [auth, checkTenant], async (req, res) => {
    try {
      const tenant = await Tenant.findById(req.user.tenant_id);
      
      if (!tenant || !tenant.whatsappConfig || !tenant.whatsappConfig.phoneNumberId) {
        return res.status(404).json({
          success: false,
          message: 'WhatsApp configuration not found'
        });
      }
      
      res.json({
        success: true,
        phoneNumberId: tenant.whatsappConfig.phoneNumberId,
        businessAccountId: tenant.whatsappConfig.businessAccountId
      });
    } catch (error) {
      console.error('Error fetching WhatsApp config:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching WhatsApp configuration',
        error: error.message
      });
    }
  });

module.exports = router;  