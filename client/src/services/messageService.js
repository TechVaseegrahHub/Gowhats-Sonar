import api from '../utils/axios';

const region = process.env.AWS_REGION || 'ap-south-1';

export const sendTemplateMessage = async (templateName, recipient, params = {}) => {
  try {
    const response = await api.post('/api/messages/send-template', {
      template: {
        name: templateName,
        language: {
          code: 'en_US'
        },
        components: [
          {
            type: "body",
            parameters: Object.entries(params).map(([key, value]) => ({
              type: "text",
              text: value
            }))
          }
        ]
      },
      to: recipient
    });
    return response.data;
  } catch (error) {
    console.error('Failed to send template message:', error);
    throw error;
  }
};




export const sendBroadcastMessage = async (templateName, recipients, parameters = {}, tenantId = null) => {
  try {
    if (!templateName || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('Invalid parameters: templateName and recipients array are required');
    }

    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication token not found');
    }

    const effectiveTenantId = tenantId || localStorage.getItem('tenantId') || 'default-tenant';
    
    console.log(`Starting broadcast of template "${templateName}" to ${recipients.length} recipients for tenant ${effectiveTenantId}`);
    console.log(`Template parameters:`, parameters);
    
    const results = [];
    const errors = [];
    
    for (const recipient of recipients) {
      try {
        console.log(`Sending template "${templateName}" to ${recipient}`);
        
       
        const formattedRecipient = recipient.startsWith('+')
          ? recipient.substring(1).replace(/\D/g, '')
          : recipient.replace(/\D/g, '');
        
        const payload = {
          templateName: templateName,
          recipientPhone: formattedRecipient,
          parameters: Object.keys(parameters).length > 0 ? parameters : null
        };
        
        console.log('Sending with payload:', payload);
        
        const response = await axios.post(
          '/api/messages/send-template',
          payload,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Tenant-ID': effectiveTenantId
            }
          }
        );
        
        console.log(`Response for ${recipient}:`, response.data);
        
        if (response.data) {
          results.push({
            recipient: formattedRecipient,
            messageId: response.data.messageId,
            success: true
          });
        } else {
          throw new Error('Unknown error occurred');
        }
      } catch (err) {
        console.error(`Failed to send to ${recipient}:`, {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          message: err.message,
          fullError: err.response?.data?.error || err.response?.data,
          stack: err.stack
        });
        
        errors.push({ 
          recipient, 
          error: err.response?.data?.message || err.response?.data?.error || err.message 
        });
      }
    }
    
    return {
      success: results.length,
      failed: errors.length,
      results,
      errors
    };
  } catch (error) {
    console.error('Error in sendBroadcastMessage:', error);
    throw error;
  }
};
