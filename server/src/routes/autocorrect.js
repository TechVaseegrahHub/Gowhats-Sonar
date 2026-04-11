const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');

// Autocorrect text using DeepSeek API
router.post('/', auth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY; // ✅ Changed from OPENAI_API_KEY

    if (!apiKey) {
      return res.status(500).json({ error: 'DeepSeek API key not configured' }); // ✅ Updated error message
    }

    const response = await axios.post(
      'https://api.deepseek.com/chat/completions', // ✅ Changed endpoint
      {
        model: 'deepseek-chat', // ✅ Changed from gpt-3.5-turbo
        messages: [
          {
            role: 'system',
            content: `You are a professional communication assistant with the following tasks:
1. Correct grammar and spelling errors
2. Refine language to be polite, professional, and respectful
3. Remove any potentially offensive or harsh language
4. Ensure the corrected text maintains the original meaning
5. Use diplomatic and courteous phrasing
6. Output only the corrected text without any additional commentary or quotes

Guidelines:
- Transform casual language to professional tone
- Replace harsh expressions with softer alternatives
- Ensure grammatical correctness
- Maintain the core message of the original text`
          },
          {
            role: 'user',
            content: `Correct and refine the language in this text, making it polite and professional: "${text}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 1024
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      const correctedText = response.data.choices[0].message.content.trim().replace(/^"|"$/g, '');

      return res.json({
        success: true,
        correctedText
      });
    } else {
      throw new Error('Invalid response from DeepSeek API'); // ✅ Updated error message
    }
  } catch (error) {
    console.error('Autocorrect error:', error);
    res.status(500).json({
      error: 'Failed to autocorrect text',
      details: error.response?.data || error.message
    });
  }
});

// Thanglish to English route using DeepSeek API
router.post('/thanglish-to-english', auth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY; // ✅ Changed from OPENAI_API_KEY

    if (!apiKey) {
      return res.status(500).json({ error: 'DeepSeek API key not configured' }); // ✅ Updated error message
    }

    const response = await axios.post(
      'https://api.deepseek.com/chat/completions', // ✅ Changed endpoint
      {
        model: 'deepseek-chat', // ✅ Changed from gpt-3.5-turbo
        messages: [
          {
            role: 'system',
            content: `You are an expert translator and communication refinement specialist:

Translation and Refinement Guidelines:
1. Convert Thanglish (Tamil written in English characters) to proper English
2. Ensure the translation is grammatically correct
3. Refine the language to be polite, professional, and respectful
4. Remove any colloquial or potentially offensive expressions
5. Maintain the original message's core intent
6. Use diplomatic and courteous language
7. Output only the translated text without quotes or additional commentary

Specific Transformation Rules:
- Replace casual/rude address terms with respectful alternatives
- Soften harsh language
- Use professional and considerate phrasing
- Ensure cultural sensitivity in translation`
          },
          {
            role: 'user',
            content: `Translate this Thanglish text to polite, professional English, removing any rudeness: "${text}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 1024
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      const translatedText = response.data.choices[0].message.content.trim().replace(/^"|"$/g, '');

      return res.json({
        success: true,
        translatedText
      });
    } else {
      throw new Error('Invalid response from DeepSeek API'); // ✅ Updated error message
    }
  } catch (error) {
    console.error('Thanglish translation error:', error);
    res.status(500).json({
      error: 'Failed to translate Thanglish text',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;