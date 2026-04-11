// client/src/services/templateService.js
import api from '../utils/axios';

export const createWhatsAppTemplate = async (templateData) => {
  try {
    const response = await api.post('/api/templates/create', {
      name: templateData.name,
      language: templateData.language,
      category: templateData.category,
      bodyText: templateData.body,
      headerType: templateData.header?.type?.toUpperCase() || 'NONE',  // ✅ Convert to uppercase
      headerText: templateData.header?.text || '',
      footerText: templateData.footer || '',
      buttons: templateData.buttons || []
    });

    return response.data;
  } catch (error) {
    console.error('❌ Template creation error:', error.response?.data || error);
    throw error;
  }
};
