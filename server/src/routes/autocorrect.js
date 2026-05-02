const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');

// ─── Shared Helper ────────────────────────────────────────────────────────────

async function callDeepSeek(apiKey, systemPrompt, userPrompt) {
  const response = await axios.post(
    'https://api.deepseek.com/chat/completions',
    {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   }
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
  return response;
}

// ─── Shared Validation ────────────────────────────────────────────────────────

function validateRequest(req, res) {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'No text provided' });
    return null;
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    res.status(400).json({ error: 'Text cannot be empty or whitespace' });
    return null;
  }

  if (trimmed.length > 5000) {
    res.status(400).json({ error: 'Text too long. Maximum 5000 characters allowed.' });
    return null;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'DeepSeek API key not configured' });
    return null;
  }

  return { text: trimmed, apiKey };
}

// ─── Route 1: Autocorrect ─────────────────────────────────────────────────────

router.post('/', auth, async (req, res) => {
  try {
    const validated = validateRequest(req, res);
    if (!validated) return;

    const { text, apiKey } = validated;

    const systemPrompt = `You are a professional communication assistant with the following tasks:
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
- Maintain the core message of the original text`;

    const userPrompt = `Correct and refine the language in this text, making it polite and professional: ${text}`;

    const response = await callDeepSeek(apiKey, systemPrompt, userPrompt);

    if (response.data && response.data.choices && response.data.choices[0]) {
      const correctedText = response.data.choices[0].message.content
        .trim()
        .replace(/^"|"$/g, '');

      return res.json({
        success: true,
        correctedText
      });
    } else {
      throw new Error('Invalid response from DeepSeek API');
    }

  } catch (error) {
    console.error('Autocorrect error:', error);
    res.status(500).json({
      error: 'Failed to autocorrect text',
      details: error.response?.data || error.message
    });
  }
});

// ─── Route 2: Thanglish to English ───────────────────────────────────────────

router.post('/thanglish-to-english', auth, async (req, res) => {
  try {
    const validated = validateRequest(req, res);
    if (!validated) return;

    const { text, apiKey } = validated;

    const systemPrompt = `You are an expert translator and communication refinement specialist:

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
- Ensure cultural sensitivity in translation`;

    const userPrompt = `Translate this Thanglish text to polite, professional English, removing any rudeness: ${text}`;

    const response = await callDeepSeek(apiKey, systemPrompt, userPrompt);

    if (response.data && response.data.choices && response.data.choices[0]) {
      const translatedText = response.data.choices[0].message.content
        .trim()
        .replace(/^"|"$/g, '');

      return res.json({
        success: true,
        translatedText
      });
    } else {
      throw new Error('Invalid response from DeepSeek API');
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
