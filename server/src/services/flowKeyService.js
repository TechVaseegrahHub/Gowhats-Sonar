// services/flowKeyService.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Tenant = require('../models/Tenant');

class FlowKeyService {
  constructor(tenant) {
    this.tenant = tenant;
  }

  async generateKeyPair() {
    return new Promise((resolve, reject) => {
      try {
        const tenantSalt = this.tenant._id.toString() + Date.now();

        crypto.generateKeyPair('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        }, async (err, publicKey, privateKey) => {
          if (err) {
            return reject(err);
          }

          
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async uploadPublicKey() {
    try {
      if (!this.tenant.whatsappConfig || !this.tenant.whatsappConfig.accessToken) {
        throw new Error('WhatsApp not configured for this tenant');
      }

      if (!this.tenant.flowConfig?.publicKey) {
        await this.generateKeyPair();
        // Refresh tenant data to get the new keys
        this.tenant = await Tenant.findById(this.tenant._id);
      }

      const url = `https://graph.facebook.com/v22.0/${this.tenant.whatsappConfig.phoneNumberId}/whatsapp_business_encryption`;

      // Create form data with the public key
      const formData = new URLSearchParams();
      formData.append('business_public_key', this.tenant.flowConfig.publicKey);

      // Upload the public key
      const response = await axios.post(url, formData, {
        headers: {
          'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Update status in the database
      await Tenant.findByIdAndUpdate(this.tenant._id, {
        $set: {
          'flowConfig.keyStatus': 'VALID',
          'flowConfig.keyUploadedAt': new Date()
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error uploading public key:', error.response?.data || error);

      // Update status in the database
      await Tenant.findByIdAndUpdate(this.tenant._id, {
        $set: {
          'flowConfig.keyStatus': 'FAILED',
          'flowConfig.keyUploadError': error.message
        }
      });

      throw error;
    }
  }

  async getPublicKeyStatus() {
    try {
      if (!this.tenant.whatsappConfig || !this.tenant.whatsappConfig.accessToken) {
        throw new Error('WhatsApp not configured for this tenant');
      }

      const url = `https://graph.facebook.com/v22.0/${this.tenant.whatsappConfig.phoneNumberId}/whatsapp_business_encryption`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.tenant.whatsappConfig.accessToken}`
        }
      });

      // Update status in the database
      await Tenant.findByIdAndUpdate(this.tenant._id, {
        $set: {
          'flowConfig.keyStatus': response.data.business_public_key_signature_status,
          'flowConfig.keyCheckedAt': new Date()
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error checking public key status:', error.response?.data || error);
      throw error;
    }
  }
}

module.exports = FlowKeyService;