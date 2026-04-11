const OpenAI = require('openai');
const axios = require('axios');
const crypto = require('crypto');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');
const { generateSignedUrl } = require('../utils/s3Service');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Enhanced caches
const embeddingsCache = new NodeCache({ stdTTL: 3600 });
const responseCache = new NodeCache({ stdTTL: 1800 });
const conversationCache = new NodeCache({ stdTTL: 600 }); // Increased to 10 minutes
const rateLimitCache = new NodeCache({ stdTTL: 60 });
const imageMatchCache = new NodeCache({ stdTTL: 900 });

const COLOR_SYNONYM_GROUPS = {
  black: ['black', 'jet', 'charcoal', 'graphite', 'ebony', 'ink'],
  white: ['white', 'offwhite', 'off-white', 'ivory', 'cream', 'eggshell', 'snow', 'pearl'],
  gray: ['gray', 'grey', 'silver', 'slate', 'ash', 'steel'],
  red: ['red', 'maroon', 'burgundy', 'crimson', 'ruby', 'wine'],
  orange: ['orange', 'coral', 'amber', 'rust', 'terracotta', 'peach', 'tangerine'],
  yellow: ['yellow', 'mustard', 'gold', 'golden', 'lemon', 'ochre'],
  green: ['green', 'olive', 'lime', 'mint', 'emerald', 'forest', 'sage', 'seafoam'],
  blue: ['blue', 'navy', 'azure', 'cobalt', 'indigo', 'royal', 'teal', 'cyan', 'aqua', 'aquamarine', 'turquoise', 'sky', 'skyblue', 'babyblue'],
  purple: ['purple', 'violet', 'lavender', 'lilac', 'plum', 'mauve', 'eggplant'],
  pink: ['pink', 'rose', 'fuchsia', 'magenta', 'blush', 'salmon'],
  brown: ['brown', 'tan', 'beige', 'khaki', 'camel', 'mocha', 'chocolate', 'taupe', 'sand', 'coffee'],
  multi: [
    'multi', 'multicolor', 'multi-color', 'multicolour', 'multi-colour', 'colorful', 'colourful',
    'mixed', 'assorted', 'rainbow', 'gradient', 'ombre', 'two tone', 'two-tone', 'twotone',
    'dual tone', 'dual-tone', 'dualtone', 'colorblock', 'colourblock', 'tie dye', 'tie-dye'
  ]
};

const COLOR_PREFIXES = [
  'light', 'dark', 'deep', 'pale', 'pastel', 'bright', 'neon',
  'soft', 'muted', 'dusty', 'warm', 'cool', 'rich'
];

const COLOR_COMPATIBILITY_MAP = {
  black: ['gray', 'brown', 'multi'],
  white: ['gray', 'yellow', 'brown', 'multi'],
  gray: ['black', 'white', 'blue', 'multi'],
  red: ['brown', 'purple', 'pink', 'orange', 'multi'],
  orange: ['red', 'yellow', 'brown', 'multi'],
  yellow: ['orange', 'brown', 'white', 'green', 'multi'],  // FIX: added green (yellow+green sarees common)
  green: ['blue', 'yellow', 'brown', 'multi'],
  blue: ['purple', 'gray', 'green', 'multi'],
  purple: ['blue', 'red', 'pink', 'brown', 'multi'],
  pink: ['red', 'purple', 'white', 'multi'],
  brown: ['red', 'orange', 'yellow', 'purple', 'black', 'multi'],
  multi: ['black', 'white', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown']
};

const COLOR_TOKEN_TO_CANONICAL = Object.entries(COLOR_SYNONYM_GROUPS).reduce((acc, [canonical, variants]) => {
  variants.forEach((token) => {
    const normalized = String(token || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized) {
      acc[normalized] = canonical;
    }
  });
  return acc;
}, {});

const FABRIC_SYNONYM_GROUPS = {
  tissue: ['tissue', 'tissue-silk', 'tissue silk', 'tissuesilk', 'kora', 'kora silk', 'kora-silk'],
  zari: ['zari', 'zaree', 'zariwork', 'zari-work', 'zari weave', 'zariweave', 'brocade', 'brocade-zari', 'brocadezari'],
  kanchi: ['kanchi', 'kanchipuram', 'kanjeevaram', 'kanjivaram', 'kanjipuram', 'kanjiveram', 'kanjevaram'],
  banarasi: ['banarasi', 'benarasi', 'banarsi'],
  silk: ['silk', 'pattu', 'rawsilk', 'raw silk', 'mulberry', 'tussar', 'tussar silk', 'tasar', 'tasar silk', 'eri', 'muga'],
  cotton: ['cotton', 'cottonsilk', 'cotton-silk', 'silkcotton', 'silk-cotton', 'cottonsilk'],
  linen: ['linen', 'linen-silk', 'linensilk'],
  georgette: ['georgette'],
  chiffon: ['chiffon'],
  organza: ['organza'],
  jacquard: ['jacquard'],
  crepe: ['crepe'],
  net: ['net', 'netted'],
  satin: ['satin'],
  velvet: ['velvet'],
  chanderi: ['chanderi'],
  kota: ['kota', 'kota doria', 'kotadoria'],
  jamdani: ['jamdani'],
  ikat: ['ikat', 'pochampally', 'pochampalli'],
  kalamkari: ['kalamkari'],
  mysore: ['mysore', 'mysuru']
};

const FABRIC_TOKEN_TO_CANONICAL = Object.entries(FABRIC_SYNONYM_GROUPS).reduce((acc, [canonical, variants]) => {
  variants.forEach((token) => {
    const normalized = String(token || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized) {
      acc[normalized] = canonical;
    }
  });
  return acc;
}, {});

const APPAREL_PRODUCT_HINTS = new Set([
  'saree', 'sari', 'lehenga', 'dupatta', 'kurti', 'salwar', 'blouse',
  'dress', 'shirt', 'tshirt', 'tee', 'top', 'skirt', 'pants', 'jeans',
  'fashion', 'apparel', 'garment', 'clothing', 'outfit', 'wear',
  'silk', 'cotton', 'fabric', 'textile', 'muslin', 'tissue', 'kora'  // FIX: added fabric keywords
]);

// IMPROVED: Conversation state tracking
class ConversationState {
  constructor() {
    this.lastQuery = '';
    this.lastResponse = '';
    this.lastContext = '';
    this.pendingQuestion = false; // Track if bot asked a question
    this.productMentioned = null; // Track mentioned product
    this.timestamp = new Date();
  }
}

function checkRateLimit(tenantId, phoneNumber) {
  const key = `${tenantId}_${phoneNumber}`;
  const current = rateLimitCache.get(key) || 0;
  const maxRequests = 8;

  if (current >= maxRequests) {
    return false;
  }

  rateLimitCache.set(key, current + 1);
  return true;
}

async function createEmbedding(text, retries = 2) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid text input for embedding');
  }

  const cacheKey = crypto.createHash('md5').update(text.toLowerCase()).digest('hex');
  const cached = embeddingsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text.slice(0, 8000),
        encoding_format: "float"
      });

      const embedding = response.data[0].embedding;
      embeddingsCache.set(cacheKey, embedding, 3600);
      return embedding;

    } catch (error) {
      console.error(`Embedding attempt ${i + 1} failed:`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
    }
  }
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// IMPROVED: Search ALL vectors, not just first 30
async function findMostRelevantDocument(queryEmbedding, vectors, threshold = 0.60) {
  if (!queryEmbedding || !vectors || vectors.length === 0) {
    return { doc: null, similarity: 0, matches: [] };
  }

  const similarities = [];

  // Search ALL vectors, not just first 30
  for (let i = 0; i < vectors.length; i++) {
    const doc = vectors[i];
    if (doc.embedding && doc.embedding.length > 0) {
      const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
      similarities.push({
        doc,
        similarity,
        index: i
      });
    }
  }

  similarities.sort((a, b) => b.similarity - a.similarity);

  const topMatches = similarities.slice(0, 5); // Get top 5 matches
  const bestMatch = similarities[0];

  console.log(`📊 Top 5 similarity scores:`, topMatches.map(m =>
    `${m.similarity.toFixed(3)} - ${m.doc.text.substring(0, 50)}...`
  ));

  if (bestMatch && bestMatch.similarity >= threshold) {
    console.log(`✅ Match found: ${bestMatch.similarity.toFixed(3)} (threshold: ${threshold})`);
    return {
      doc: bestMatch.doc,
      similarity: bestMatch.similarity,
      matches: topMatches
    };
  }

  console.log(`⚠️ No match above threshold ${threshold}. Best: ${bestMatch?.similarity?.toFixed(3) || 0}`);
  return {
    doc: null,
    similarity: bestMatch?.similarity || 0,
    matches: topMatches
  };
}

// IMPROVED: Enhanced conversation context
function getConversationContext(tenantId, phoneNumber) {
  const key = `${tenantId}_${phoneNumber}`;
  return conversationCache.get(key) || new ConversationState();
}

function setConversationContext(tenantId, phoneNumber, context) {
  const key = `${tenantId}_${phoneNumber}`;
  conversationCache.set(key, context, 600); // 10 minutes
}

// IMPROVED: Better product name extraction
function extractProductName(text) {
  const normalized = text.toLowerCase().trim();

  // Common product name patterns
  const patterns = [
    /(?:do you have|have you got|looking for|want|need|about|tell me about)\s+([a-z\s]+?)(?:\s+oil|\s+powder|\s+hydrosol)?(?:\?|$)/i,
    /^([a-z\s]+?)(?:\s+oil|\s+powder|\s+hydrosol)?(?:\?|$)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return normalized.replace(/\?|\.|\!|,/g, '').trim();
}

// IMPROVED: Enhanced keyword matching with fuzzy search
function findKeywordMatch(userInput, vectors) {
  const productName = extractProductName(userInput);
  const inputWords = productName.split(/\s+/).filter(word => word.length > 2);

  console.log(`🔍 Searching for: "${productName}" (words: ${inputWords.join(', ')})`);

  let matches = [];

  vectors.forEach((doc, index) => {
    if (doc.text) {
      const docText = doc.text.toLowerCase();
      let score = 0;

      // Exact product name match (highest priority)
      if (docText.includes(productName)) {
        score += 100;
      }

      // Individual word matching
      inputWords.forEach(word => {
        if (docText.includes(word)) {
          score += 10;
        }
      });

      // Fuzzy matching for variations (citrullus vs citrulus)
      inputWords.forEach(word => {
        const fuzzyPattern = word.split('').join('.*');
        const regex = new RegExp(fuzzyPattern, 'i');
        if (regex.test(docText)) {
          score += 5;
        }
      });

      if (score > 0) {
        matches.push({ doc, score, index });
      }
    }
  });

  matches.sort((a, b) => b.score - a.score);

  if (matches.length > 0) {
    console.log(`🔑 Keyword matches found:`, matches.slice(0, 3).map(m =>
      `Score ${m.score}: ${m.doc.text.substring(0, 80)}...`
    ));
    return matches[0].doc;
  }

  console.log(`❌ No keyword matches found`);
  return null;
}

// IMPROVED: Handle follow-up queries with context awareness
function handleFollowUpQueries(userInput, conversationState) {
  if (!conversationState || !conversationState.lastContext) return null;

  const input = userInput.toLowerCase().trim();

  // Affirmative responses
  const affirmativeKeywords = [
    'yes', 'yeah', 'yep', 'sure', 'okay', 'ok', 'tell me more',
    'more info', 'continue', 'go ahead', 'please', 'interested',
    'would like', 'want to know'
  ];

  // Negative responses - IMPROVED with variations
  const negativeKeywords = [
    'no', 'nope', 'not interested', 'no thanks',
    'noo', 'nooo', 'nah', 'na', 'nope', 'no thank you'
  ];

  const isAffirmative = affirmativeKeywords.some(keyword =>
    input === keyword || input.includes(keyword)
  );

  const isNegative = negativeKeywords.some(keyword =>
    input === keyword || input === keyword + '.' || input === keyword + '!'
  );

  if (conversationState.pendingQuestion) {
    if (isAffirmative) {
      conversationState.pendingQuestion = false;

      if (conversationState.lastContext) {
        return {
          response: `🤖 Here's more information:\n\n${conversationState.lastContext.substring(0, 500)}${conversationState.lastContext.length > 500 ? '...' : ''}\n\nWould you like to know about pricing or how to use it?`,
          usedContext: true
        };
      }
    } else if (isNegative) {
      conversationState.pendingQuestion = false;
      return {
        response: "🤖 No problem! Is there anything else I can help you with?",
        usedContext: true
      };
    }
  }

  return null;
}

// MAIN FUNCTION: Enhanced WhatsApp RAG response
async function getWhatsAppRAGResponse(userInput, knowledgeBase, tenantId, phoneNumber, retries = 2) {
  try {
    if (!checkRateLimit(tenantId, phoneNumber)) {
      console.log('⏱️ Rate limit exceeded');
      return "🤖 Please wait a moment before asking again.";
    }

    if (!userInput || typeof userInput !== 'string') {
      throw new Error('Invalid user input');
    }

    if (!knowledgeBase || !knowledgeBase.vectors || knowledgeBase.vectors.length === 0) {
      console.warn(`❌ Knowledge base missing for tenant: ${tenantId}`);
      return "🤖 I don't have access to the knowledge base right now. Please contact our support team.";
    }

    const cacheKey = crypto.createHash('md5').update(`whatsapp_${tenantId}_${userInput.toLowerCase()}`).digest('hex');
    const cachedResponse = responseCache.get(cacheKey);
    if (cachedResponse) {
      console.log('📦 Using cached response');
      return cachedResponse;
    }

    console.log(`🔍 Processing query: "${userInput}"`);

    // Get conversation state
    let conversationState = getConversationContext(tenantId, phoneNumber);

    // Handle common greetings
    const greeting = getCommonGreeting(userInput);
    if (greeting) {
      conversationState = new ConversationState();
      setConversationContext(tenantId, phoneNumber, conversationState);
      responseCache.set(cacheKey, greeting, 300);
      return greeting;
    }

    // Handle follow-up queries
    const followUp = handleFollowUpQueries(userInput, conversationState);
    if (followUp && followUp.usedContext) {
      setConversationContext(tenantId, phoneNumber, conversationState);
      responseCache.set(cacheKey, followUp.response, 300);
      return followUp.response;
    }

    // Create embedding for semantic search
    const inputEmbedding = await createEmbedding(userInput.toLowerCase());

    // IMPROVED: Lower threshold and search all vectors
    const SIMILARITY_THRESHOLD = 0.60; // Lowered from 0.68
    const { doc: relevantDoc, similarity, matches } = await findMostRelevantDocument(
      inputEmbedding,
      knowledgeBase.vectors,
      SIMILARITY_THRESHOLD
    );

    let context = null;
    let searchMethod = null;

    // Try semantic search first
    if (relevantDoc) {
      context = relevantDoc.text;
      searchMethod = 'semantic';
      console.log(`✅ Semantic match: ${similarity.toFixed(3)}`);
    } else {
      // Fallback to keyword search
      console.log(`🔄 Trying keyword search...`);
      const keywordMatch = findKeywordMatch(userInput, knowledgeBase.vectors);

      if (keywordMatch) {
        context = keywordMatch.text;
        searchMethod = 'keyword';
        console.log(`✅ Keyword match found`);
      }
    }

    // No match found
    if (!context) {
      console.log(`❌ No match found (best similarity: ${similarity.toFixed(3)})`);

      const fallbackMessage = "🤖 I can help you with information about our herbal products. Could you please rephrase your question or ask about a specific product from our catalog?";

      conversationState.lastQuery = userInput;
      conversationState.lastResponse = fallbackMessage;
      setConversationContext(tenantId, phoneNumber, conversationState);

      responseCache.set(cacheKey, fallbackMessage, 300);
      return fallbackMessage;
    }

    // Generate AI response with context
    const aiResponse = await generateResponseFromContext(
      userInput,
      context,
      tenantId,
      phoneNumber,
      conversationState,
      similarity
    );

    if (aiResponse) {
      // Update conversation state
      conversationState.lastQuery = userInput;
      conversationState.lastResponse = aiResponse;
      conversationState.lastContext = context;
      conversationState.timestamp = new Date();

      // Check if response contains a question
      conversationState.pendingQuestion = aiResponse.includes('?');

      // Extract product name if mentioned
      const productName = extractProductName(userInput);
      if (productName) {
        conversationState.productMentioned = productName;
      }

      setConversationContext(tenantId, phoneNumber, conversationState);
      responseCache.set(cacheKey, aiResponse, 1800);

      console.log(`✅ Response generated via ${searchMethod} search`);
      return aiResponse;
    }

    // Final fallback
    const contextResponse = `🤖 Based on our catalog:\n\n${context.substring(0, 400)}${context.length > 400 ? '...' : ''}\n\nFor complete details, please contact our support team.`;
    responseCache.set(cacheKey, contextResponse, 300);
    return contextResponse;

  } catch (error) {
    console.error('❌ RAG response error:', error);
    return "🤖 I'm experiencing technical difficulties. Please try again or contact our support team.";
  }
}

// IMPROVED: Dynamic token allocation
async function generateResponseFromContext(userInput, context, tenantId, phoneNumber, conversationState = null, similarity = null, retries = 3) {

  const getMaxTokens = (input) => {
    const inputLength = input.length;
    const words = input.split(/\s+/).length;

    if (inputLength < 20 || words <= 3) return 80;
    else if (inputLength < 50 || words <= 8) return 120;
    else return 180;
  };

  const maxTokens = getMaxTokens(userInput);
  console.log(`📝 Token allocation: ${maxTokens} tokens`);

  for (let i = 0; i < retries; i++) {
    try {
      const wordLimit = maxTokens < 100 ? "60 words" : maxTokens < 140 ? "90 words" : "130 words";

      let systemPrompt = `You are a helpful WhatsApp customer service assistant for Vaseegrah Veda herbal products.

CONTEXT FROM CATALOG:
---
${context}
---

INSTRUCTIONS:
1. Answer based ONLY on the context above
2. Be conversational and professional
3. Keep responses under ${wordLimit}
4. Include specific details from context (sizes, prices, uses)
5. Start EVERY response with 🤖 emoji
6. Use natural tone without excessive friendliness
7. Don't always end with questions
8. If context mentions the product, confirm availability clearly

IMPORTANT: Always start your response with 🤖 emoji`;

      if (conversationState && conversationState.lastQuery) {
        systemPrompt += `\n9. Previous conversation context: User asked "${conversationState.lastQuery}"`;
      }

      const timeout = 12000 + (i * 3000);

      const response = await axios.post(
        `${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`,
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInput }
          ],
          max_tokens: maxTokens,
          temperature: 0.4,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: timeout
        }
      );

      const aiResponse = response.data.choices[0]?.message?.content?.trim();

      if (!aiResponse) {
        throw new Error('Empty response from DeepSeek');
      }

      console.log(`✅ AI response generated (${maxTokens} tokens)`);
      return aiResponse;

    } catch (aiError) {
      console.error(`DeepSeek attempt ${i + 1} failed: ${aiError.message}`);

      if (i === retries - 1) {
        // Smart fallback
        return `🤖 Based on our catalog: ${context.substring(0, 300)}... Contact us for complete details.`;
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

function getCommonGreeting(userInput) {
  const input = userInput.toLowerCase().trim();

  const greetings = ['hi', 'hello', 'hey', 'namaste', 'good morning', 'good afternoon', 'good evening'];
  const thanks = ['thank you', 'thanks', 'thx', 'thank u'];
  const byes = ['bye', 'goodbye', 'see you', 'take care'];

  if (greetings.some(g => input === g || input.startsWith(g + ' ') || input.startsWith(g + ','))) {
    return "🤖 I'm here to help you with Vaseegrah Veda herbal products. What would you like to know?";
  }

  if (thanks.some(t => input.includes(t))) {
    return "🤖 You're welcome! Anything else I can help you with?";
  }

  if (byes.some(b => input.includes(b))) {
    return "🤖 Feel free to reach out anytime for product information.";
  }

  return null;
}

async function testWhatsAppRAGConnection() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set');
    }

    const testEmbedding = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: "test connection",
      encoding_format: "float"
    });

    if (!testEmbedding.data[0].embedding) {
      throw new Error('OpenAI embeddings failed');
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY not set');
    }

    const testResponse = await axios.post(
      `${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`,
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    if (!testResponse.data.choices[0].message.content) {
      throw new Error('DeepSeek chat failed');
    }

    console.log('✅ RAG AI stack connection successful');
    return true;

  } catch (error) {
    console.error('❌ RAG AI connection failed:', error.message);
    return false;
  }
 }

 function extractJsonFromModelOutput(content) {
   if (!content) return {};
   if (typeof content === 'object') return content;

   const text = String(content).trim();
   if (!text) return {};

   try {
     return JSON.parse(text);
   } catch (error) {
     // Ignore and try fallback parsing below.
   }

   const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
   if (fencedMatch?.[1]) {
     try {
       return JSON.parse(fencedMatch[1].trim());
     } catch (error) {
       // Ignore and continue.
     }
   }

   const firstBrace = text.indexOf('{');
   const lastBrace = text.lastIndexOf('}');
   if (firstBrace !== -1 && lastBrace > firstBrace) {
     const jsonCandidate = text.slice(firstBrace, lastBrace + 1);
     try {
       return JSON.parse(jsonCandidate);
     } catch (error) {
       // Ignore and return empty object.
     }
   }

   return {};
 }

 function inferMimeTypeFromPath(filePath) {
   const ext = path.extname(filePath || '').toLowerCase();
   const map = {
     '.jpg': 'image/jpeg',
     '.jpeg': 'image/jpeg',
     '.png': 'image/png',
     '.webp': 'image/webp',
     '.gif': 'image/gif',
     '.bmp': 'image/bmp',
     '.tif': 'image/tiff',
     '.tiff': 'image/tiff'
   };

   return map[ext] || 'image/jpeg';
 }

 async function fetchRemoteImage(imageUrl) {
   const response = await axios.get(imageUrl, {
     responseType: 'arraybuffer',
     timeout: 20000,
     maxContentLength: 15 * 1024 * 1024
   });

   return {
     buffer: Buffer.from(response.data),
     mimeType: response.headers?.['content-type'] || inferMimeTypeFromPath(imageUrl)
   };
 }

 async function loadImageAsDataUrl(imageUrl, imageS3Key = '') {
   let imageBuffer = null;
   let mimeType = 'image/jpeg';

   const trySignedUrl = async () => {
     if (!imageS3Key) return false;

     try {
       const signedUrl = await generateSignedUrl(imageS3Key, 600);
       const remote = await fetchRemoteImage(signedUrl);
       imageBuffer = remote.buffer;
       mimeType = remote.mimeType || mimeType;
       return true;
     } catch (error) {
       console.warn('Could not load image via signed URL:', error.message);
       return false;
     }
   };

   if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
     try {
       const remote = await fetchRemoteImage(imageUrl);
       imageBuffer = remote.buffer;
       mimeType = remote.mimeType || mimeType;
     } catch (error) {
       console.warn('Direct remote image fetch failed:', error.message);
       await trySignedUrl();
     }
   } else if (imageUrl) {
     const normalizedPath = imageUrl.split('?')[0].replace(/\\/g, '/').replace(/^\/+/, '');
     const localCandidates = [
       path.resolve(__dirname, '../../', normalizedPath),
       path.resolve(process.cwd(), normalizedPath),
       path.resolve(process.cwd(), '..', normalizedPath)
     ];

     for (const candidatePath of localCandidates) {
       if (fs.existsSync(candidatePath)) {
         imageBuffer = await fs.promises.readFile(candidatePath);
         mimeType = inferMimeTypeFromPath(candidatePath);
         break;
       }
     }

     if (!imageBuffer) {
       await trySignedUrl();
     }
   } else {
     await trySignedUrl();
   }

   if (!imageBuffer) {
     throw new Error('Unable to load image for analysis');
   }

   return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
 }

function normalizeTokenList(values = []) {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'just', 'your', 'into',
    'about', 'what', 'when', 'where', 'will', 'would', 'could', 'should', 'like', 'looks',
    'look', 'give', 'want', 'need', 'please', 'product', 'item', 'image', 'photo'
   ]);

   const source = Array.isArray(values) ? values : [values];
   const tokens = new Set();

   source
     .filter(Boolean)
     .map(value => String(value).toLowerCase())
     .forEach(value => {
       value
         .replace(/[^a-z0-9\s]/g, ' ')
         .split(/\s+/)
         .filter(token => token && token.length > 2 && !stopWords.has(token))
         .forEach(token => tokens.add(token));
     });

  return Array.from(tokens);
}

function canonicalizeColorToken(token = '') {
  if (!token) return null;

  const normalized = String(token).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized) return null;

  if (COLOR_TOKEN_TO_CANONICAL[normalized]) {
    return COLOR_TOKEN_TO_CANONICAL[normalized];
  }

if (normalized.endsWith('ish')) {
    const trimmed = normalized.slice(0, -3);
    const ishCandidates = [trimmed, `${trimmed}e`, `${trimmed}y`];
    for (const candidate of ishCandidates) {
      if (COLOR_TOKEN_TO_CANONICAL[candidate]) {
        return COLOR_TOKEN_TO_CANONICAL[candidate];
      }
    }
  }

  const prefix = COLOR_PREFIXES.find((item) => normalized.startsWith(item) && normalized.length > item.length + 2);
  if (prefix) {
    const remainder = normalized.slice(prefix.length);
    if (COLOR_TOKEN_TO_CANONICAL[remainder]) {
      return COLOR_TOKEN_TO_CANONICAL[remainder];
    }
  }

  return null;
}

function splitCompoundColorToken(value = '') {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.length < 6) return [];

  const found = new Set();
  for (let idx = 3; idx <= normalized.length - 3; idx += 1) {
    const left = normalized.slice(0, idx);
    const right = normalized.slice(idx);
    const leftColor = COLOR_TOKEN_TO_CANONICAL[left];
    const rightColor = COLOR_TOKEN_TO_CANONICAL[right];
    if (leftColor && rightColor) {
      found.add(leftColor);
      found.add(rightColor);
    }
  }

  return Array.from(found);
}

function canonicalizeFabricToken(token = '') {
  if (!token) return null;
  const normalized = String(token).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized) return null;
  if (FABRIC_TOKEN_TO_CANONICAL[normalized]) {
    return FABRIC_TOKEN_TO_CANONICAL[normalized];
  }
  return null;
}

function normalizeColorList(values = []) {
  const source = Array.isArray(values) ? values : [values];
  const colors = new Set();

  source
    .filter(Boolean)
    .map(value => String(value).toLowerCase())
    .forEach((value) => {
      const pieces = value.split(/[,/|&]+|\band\b|\bor\b|\bto\b|\bwith\b|\bplus\b|\bgradient\b|\bombre\b/g);

      pieces.forEach((piece) => {
        const trimmedPiece = piece.trim();
        if (!trimmedPiece) return;

        const exactColor = canonicalizeColorToken(trimmedPiece);
        if (exactColor) {
          colors.add(exactColor);
        }

        splitCompoundColorToken(trimmedPiece)
          .forEach((compoundColor) => colors.add(compoundColor));
   
        trimmedPiece
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(Boolean)
          .forEach((word) => {
            const mapped = canonicalizeColorToken(word);
            if (mapped) {
              colors.add(mapped);
            }
          });
      });
    });

  return Array.from(colors);
}

function normalizeFabricList(values = []) {
  const source = Array.isArray(values) ? values : [values];
  const fabrics = new Set();

  source
    .filter(Boolean)
    .map(value => String(value).toLowerCase())
    .forEach((value) => {
      const pieces = value.split(/[,/|&]+|\band\b|\bor\b|\bto\b|\bwith\b|\bplus\b/g);

      pieces.forEach((piece) => {
        const trimmedPiece = piece.trim();
        if (!trimmedPiece) return;

        const exactFabric = canonicalizeFabricToken(trimmedPiece);
        if (exactFabric) {
          fabrics.add(exactFabric);
        }

        trimmedPiece
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(Boolean)
          .forEach((word) => {
            const mapped = canonicalizeFabricToken(word);
            if (mapped) {
              fabrics.add(mapped);
            }
          });
      });
    });

  return Array.from(fabrics);
}

function extractColorSignalsFromText(text = '') {
  if (!text) return [];
  return normalizeColorList([text]);
}

function extractFabricSignalsFromText(text = '') {
  if (!text) return [];
  return normalizeFabricList([text]);
}

function getSignalColorsForMatching(signals = null) {
  if (!signals) return [];

  // ✅ FIX: Only use target_product_colors as primary signal.
  // dominant_colors often picks up background/lighting/skin tones in customer photos.
  // For apparel images, dominant colors are unreliable — use product-specific colors only.
  const targetColors = signals.targetProductColors || [];
  if (targetColors.length > 0) {
    return Array.from(new Set(targetColors));
  }

  // Fall back to caption colors if no target product colors identified
  const captionColors = signals.captionColors || [];
  if (captionColors.length > 0) {
    return Array.from(new Set(captionColors));
  }

  // Last resort: use dominant colors (least reliable for apparel)
  return Array.from(new Set(signals.dominantColors || []));
}

function areColorsCompatible(colorA, colorB) {
  if (!colorA || !colorB) return false;
  if (colorA === colorB) return true;

  const mapA = COLOR_COMPATIBILITY_MAP[colorA] || [];
  const mapB = COLOR_COMPATIBILITY_MAP[colorB] || [];
  return mapA.includes(colorB) || mapB.includes(colorA);
}

function buildColorMatchDetails(signalColors = [], inventoryColors = []) {
  const exact = [];
  const compatible = [];

  signalColors.forEach((signalColor) => {
    inventoryColors.forEach((inventoryColor) => {
      if (signalColor === inventoryColor) {
        exact.push(signalColor);
      } else if (areColorsCompatible(signalColor, inventoryColor)) {
        compatible.push(`${signalColor}:${inventoryColor}`);
      }
    });
  });

  return {
    exactOverlap: Array.from(new Set(exact)),
    compatibleOverlap: Array.from(new Set(compatible))
  };
}

function evaluateColorAlignment(item = {}, signals = null) {
  const itemColorText = [
    item.name || '',
    item.description || '',
    Array.isArray(item.categories) ? item.categories.join(' ') : '',
    item.retailer_id || ''
  ]
    .filter(Boolean)
    .join(' ');

  const signalColors = getSignalColorsForMatching(signals);
  const inventoryColors = extractColorSignalsFromText(itemColorText);

  if (!signalColors.length) {
    return {
      signalColors: [],
      inventoryColors,
      overlap: [],
      compatibleOverlap: [],
      coverage: 0,
      hasStrongColorSignal: false,
      isMismatch: false,
      colorScore: 0
    };
  }

  if (!inventoryColors.length) {
    // ✅ FIX: If the catalog item has no color info, don't penalize it.
    // Many fabric/saree catalog items only have the product name without color tags.
    return {
      signalColors,
      inventoryColors: [],
      overlap: [],
      compatibleOverlap: [],
      coverage: 0,
      hasStrongColorSignal: true,
      isMismatch: false,   // ← was left as false before, keep it — no color data = no mismatch
      colorScore: 0
    };
  }

  const details = buildColorMatchDetails(signalColors, inventoryColors);
  const overlap = details.exactOverlap;
  const compatibleOverlap = details.compatibleOverlap;
  const matchedSignalColors = new Set([
    ...overlap,
    ...compatibleOverlap.map(pair => pair.split(':')[0]).filter(Boolean)
  ]);
  const coverage = signalColors.length
    ? (matchedSignalColors.size / signalColors.length)
    : 0;

  // ✅ FIX: isMismatch only fires if we have strong signal colors AND the catalog
  // item has color data AND there is zero overlap of any kind.
  // Previously this fired too aggressively for apparel images with background colors.
  // Now we also require signalColors.length <= 2 for a hard mismatch —
  // if the image has 3+ colors, background tones are likely included and we should be lenient.
  const isMismatch = (
    overlap.length === 0 &&
    compatibleOverlap.length === 0 &&
    signalColors.length <= 2  // ← KEY FIX: only reject on mismatch if signal is narrow/specific
  );

  let colorScore = (overlap.length * 18) + (compatibleOverlap.length * 9);
  if (isMismatch) {
    colorScore -= Math.min(22, signalColors.length * 8);
  } else if (coverage < 0.5) {
    colorScore -= 4;
  }

  return {
    signalColors,
    inventoryColors,
    overlap,
    compatibleOverlap,
    coverage,
    hasStrongColorSignal: true,
    isMismatch,
    colorScore
  };
}

function evaluateFabricAlignment(item = {}, signals = null) {
  const itemFabricText = [
    item.name || '',
    item.description || '',
    Array.isArray(item.categories) ? item.categories.join(' ') : '',
    item.retailer_id || ''
  ]
    .filter(Boolean)
    .join(' ');

  const signalFabrics = Array.from(new Set(signals?.fabricTokens || []));
  const inventoryFabrics = extractFabricSignalsFromText(itemFabricText);

  if (!signalFabrics.length) {
    return {
      signalFabrics: [],
      inventoryFabrics,
      overlap: [],
      hasStrongFabricSignal: false,
      isMismatch: false,
      fabricScore: 0
    };
  }

  if (!inventoryFabrics.length) {
    return {
      signalFabrics,
      inventoryFabrics: [],
      overlap: [],
      hasStrongFabricSignal: true,
      isMismatch: false,
      fabricScore: 0
    };
  }

  const overlap = signalFabrics.filter((token) => inventoryFabrics.includes(token));
  const isMismatch = overlap.length === 0;
  let fabricScore = overlap.length * 26;
  if (isMismatch) {
    fabricScore -= Math.min(30, signalFabrics.length * 12);
  }

  return {
    signalFabrics,
    inventoryFabrics,
    overlap,
    hasStrongFabricSignal: true,
    isMismatch,
    fabricScore
  };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hasApparelProductHints(...values) {
  const tokens = normalizeTokenList(values.filter(Boolean));
  return tokens.some(token => APPAREL_PRODUCT_HINTS.has(token));
}

function normalizeVisionSignals(rawSignals = {}, caption = '') {
  const titleGuess = String(
    rawSignals.title_guess ||
    rawSignals.product_name ||
    rawSignals.product ||
    ''
  ).trim();

  const brandGuess = String(rawSignals.brand_guess || rawSignals.brand || '').trim();
  const productType = String(rawSignals.product_type || rawSignals.type || '').trim();
  const category = String(rawSignals.category || '').trim();
  const keywords = normalizeTokenList(rawSignals.keywords || []);
  const attributes = normalizeTokenList(rawSignals.attributes || []);
  const summary = String(rawSignals.summary || '').trim();
  const dominantColors = normalizeColorList(
    rawSignals.dominant_colors ||
    rawSignals.primary_colors ||
    rawSignals.colors ||
    []
  );
  let targetProductColors = normalizeColorList(
    rawSignals.target_product_colors ||
    rawSignals.product_colors ||
    rawSignals.product_color ||
    rawSignals.color ||
    []
  );

  const fabricTokens = normalizeFabricList([
    rawSignals.title_guess,
    rawSignals.product_type,
    rawSignals.category,
    ...(rawSignals.keywords || []),
    ...(rawSignals.attributes || []),
    rawSignals.summary,
    caption
  ]);

  const parsedConfidence = Number(rawSignals.confidence);
  const confidence = Number.isFinite(parsedConfidence)
    ? clamp01(parsedConfidence)
    : 0;

  const captionTokens = normalizeTokenList(caption);
  const captionColors = extractColorSignalsFromText(caption);
  if (!targetProductColors.length && captionColors.length) {
    targetProductColors = captionColors;
  }

  const hasSignals = Boolean(
    titleGuess ||
    brandGuess ||
    productType ||
    category ||
    keywords.length ||
    attributes.length ||
    summary ||
    dominantColors.length ||
    targetProductColors.length ||
    fabricTokens.length
  );


    const apparelHints = hasApparelProductHints(
    titleGuess,
    brandGuess,
    productType,
    category,
    keywords.join(' '),
    attributes.join(' '),
    summary,
    caption
  );

  let isProductImage = typeof rawSignals.is_product_image === 'boolean'
    ? rawSignals.is_product_image
    : (confidence >= 0.45 || hasSignals || captionTokens.length > 0);

     // Wearable products (for example saree worn by a person) should not be rejected.
  if (!isProductImage && apparelHints) {
    isProductImage = true;
  }

  return {
    isProductImage,
    confidence,
    hasApparelSignals: apparelHints,
    titleGuess,
    brandGuess,
    productType,
    category,
    keywords,
    attributes,
    summary,
    dominantColors,
    targetProductColors,
    captionColors,
    fabricTokens
  };
}

function buildSearchTokens(signals, caption = '') {
  return normalizeTokenList([
    signals?.titleGuess,
    signals?.brandGuess,
    signals?.productType,
    signals?.category,
    ...(signals?.keywords || []),
    ...(signals?.attributes || []),
    ...(signals?.targetProductColors || []),
    ...(signals?.dominantColors || []),
    ...(signals?.fabricTokens || []),
    signals?.summary,
    caption
  ]);
}

function scoreInventoryMatch(item, tokens, signals) {
   const name = (item.name || '').toLowerCase();
   const description = (item.description || '').toLowerCase();
   const categories = Array.isArray(item.categories)
     ? item.categories.join(' ').toLowerCase()
     : '';
  const retailerId = (item.retailer_id || '').toLowerCase();

  let score = 0;
  const colorAnalysis = evaluateColorAlignment(item, signals);
  const fabricAnalysis = evaluateFabricAlignment(item, signals);

  const titleGuess = (signals?.titleGuess || '').toLowerCase();
  if (titleGuess) {
    if (name === titleGuess) score += 120;
    else if (name.includes(titleGuess) || titleGuess.includes(name)) score += 80;
  }

  const brandGuess = (signals?.brandGuess || '').toLowerCase();
  if (brandGuess) {
    if (name.includes(brandGuess)) score += 26;
    if (description.includes(brandGuess)) score += 16;
  }

  const productTypeGuess = (signals?.productType || '').toLowerCase();
  if (productTypeGuess) {
    if (name.includes(productTypeGuess)) score += 22;
    if (description.includes(productTypeGuess) || categories.includes(productTypeGuess)) score += 12;
  }

  const categoryGuess = (signals?.category || '').toLowerCase();
  if (categoryGuess && categories.includes(categoryGuess)) {
    score += 16;
  }

   for (const token of tokens) {
     if (name.includes(token)) score += 18;
     if (categories.includes(token)) score += 12;
     if (description.includes(token)) score += 8;
     if (retailerId.includes(token)) score += 10;
   }

   const availability = String(item.availability || '').toLowerCase();
   const isOutOfStock = availability.includes('out of stock') ||
     availability.includes('out_of_stock') ||
     availability.includes('discontinued') ||
     (typeof item.inventory === 'number' && item.inventory <= 0);

  if (isOutOfStock) score -= 20;

  score += colorAnalysis.colorScore;
  score += fabricAnalysis.fabricScore;

  return {
    lexicalScore: score,
    colorAnalysis,
    fabricAnalysis
  };
}

 function formatInventorySearchText(item) {
   return [
     item.name || '',
     item.description || '',
     Array.isArray(item.categories) ? item.categories.join(' ') : '',
     item.retailer_id || ''
   ]
     .filter(Boolean)
     .join(' ')
     .toLowerCase()
     .slice(0, 8000);
 }

 async function rankCandidatesWithSemanticScore(candidates, queryText) {
   if (!Array.isArray(candidates) || candidates.length === 0) {
     return [];
   }

   if (!queryText || !process.env.OPENAI_API_KEY) {
     return candidates.map(candidate => ({
       ...candidate,
       semanticScore: 0,
       finalScore: candidate.lexicalScore
     }));
   }

   try {
     const queryEmbedding = await createEmbedding(queryText.toLowerCase());

     const scored = await Promise.all(
       candidates.map(async (candidate) => {
         const productText = formatInventorySearchText(candidate.item);
         const productEmbedding = await createEmbedding(productText);
         const semanticScore = cosineSimilarity(queryEmbedding, productEmbedding);
         const finalScore = candidate.lexicalScore + Math.round(semanticScore * 100);

         return {
           ...candidate,
           semanticScore,
           finalScore
         };
       })
     );

     return scored.sort((a, b) => b.finalScore - a.finalScore);
   } catch (error) {
     console.warn('Semantic scoring fallback to lexical only:', error.message);
     return candidates
       .map(candidate => ({
         ...candidate,
         semanticScore: 0,
         finalScore: candidate.lexicalScore
       }))
       .sort((a, b) => b.finalScore - a.finalScore);
   }
 }

 async function analyzeProductImageSignals(imageUrl, imageS3Key = '', caption = '') {
   if (!process.env.OPENAI_API_KEY) {
     throw new Error('OPENAI_API_KEY not set');
   }

  const cacheKey = crypto
    .createHash('md5')
    .update(`image_signals_v2_${imageUrl || ''}_${imageS3Key || ''}_${caption.toLowerCase()}`)
    .digest('hex');

   const cached = imageMatchCache.get(cacheKey);
   if (cached) {
     return cached;
   }

   const imageDataUrl = await loadImageAsDataUrl(imageUrl, imageS3Key);

   const response = await openai.chat.completions.create({
     model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
     messages: [
       {
         role: 'system',
         content: 'You detect ecommerce products from customer images and return strict JSON only.'
       },
       {
         role: 'user',
         content: [
           {
              type: 'text',
              text: [
                'Analyze this customer image for product matching in an ecommerce catalog.',
                'Focus on the main/foreground product ONLY. Ignore background, skin tones, furniture, walls, props.',
                // ✅ FIX: Stronger instruction to Vision model about garment color focus
                'For garments/sarees/fabric: report ONLY the garment colors, NOT the background, person skin, or stage lighting.',
                'If a person is wearing a garment (for example saree, dress, shirt), treat the garment as the product.',
                'If the product is a saree/garment, identify fabric/weave/style (e.g., tissue, zari, kanchi, banarasi, silk, cotton, linen) and include these in keywords/attributes.',
                'In target_product_colors: put ONLY the garment/product colors, NOT background or person colors.',
                'Return ONLY valid JSON with EXACT keys:',
                '{"is_product_image":boolean,"confidence":number,"title_guess":string,"brand_guess":string,"product_type":string,"category":string,"keywords":[string],"attributes":[string],"dominant_colors":[string],"target_product_colors":[string],"summary":string}',
                'Use lowercase short color names in color arrays (example: ["yellow","green"]).',
		'If the product has gradients, patterns, or multiple colors, list EACH visible color (e.g. ["blue","green","white"]). You may include "multi" in addition to the specific colors.',
                'If uncertain, return empty string/array for uncertain fields.',
                `Customer caption: ${caption || 'none'}`
              ].join('\n')
            },
           {
             type: 'image_url',
             image_url: {
               url: imageDataUrl
             }
           }
         ]
       }
      ],
      temperature: 0,
      max_tokens: 320
    });

   const modelContent = response.choices?.[0]?.message?.content;
   const rawContent = Array.isArray(modelContent)
     ? modelContent.map(part => (typeof part === 'string' ? part : (part?.text || ''))).join('\n')
     : modelContent;

  const parsedSignals = extractJsonFromModelOutput(rawContent);
  const normalizedSignals = normalizeVisionSignals(parsedSignals, caption);

  imageMatchCache.set(cacheKey, normalizedSignals, 600);
  return normalizedSignals;
}

async function verifyVisualMatchAgainstCandidates(params = {}) {
  const {
    imageUrl = '',
    imageS3Key = '',
    caption = '',
    rankedCandidates = []
  } = params;

  if (!process.env.OPENAI_API_KEY || !Array.isArray(rankedCandidates) || rankedCandidates.length === 0) {
    return null;
  }

  const candidatePool = rankedCandidates
    .map((candidate, idx) => ({
      ...candidate,
      rankIndex: Number.isInteger(candidate.rankIndex) ? candidate.rankIndex : idx,
      imageUrl: candidate?.item?.image_url || ''
    }))
    .filter(candidate => candidate.imageUrl)
    .slice(0, 8);

  if (!candidatePool.length) {
    return null;
  }

  const cacheKey = crypto
    .createHash('md5')
    .update(`image_visual_verify_v1_${imageUrl}_${imageS3Key}_${caption.toLowerCase()}_${candidatePool.map(c => `${c.rankIndex}:${c.imageUrl}`).join('|')}`)
    .digest('hex');
  const cached = imageMatchCache.get(cacheKey);
  if (cached) return cached;

  try {
    const customerImageDataUrl = await loadImageAsDataUrl(imageUrl, imageS3Key);
    const content = [
      {
        type: 'text',
        text: [
          'Match the customer uploaded product image against candidate catalog images.',
          'Prioritize exact product type, color/shade, pattern, and material.',
          'Use fabric/weave cues (tissue, zari, kanchi, silk, cotton, linen) and border/pallu motifs to distinguish similar sarees.',
	'If the product is gradient/multicolor, consider it a color match when any visible color overlaps.',
          // ✅ FIX: Stronger instruction to ignore background in visual match too
          'For garments: focus ONLY on the garment fabric color and pattern, NOT background, person skin tone, jewelry, or lighting.',
          'Return ONLY JSON with keys:',
          '{"matched_candidate_index":number|null,"confidence":number,"color_match":"match|mismatch|uncertain","reason":string}',
          'matched_candidate_index is 1-based index from the provided candidates.',
          'If no candidate clearly matches, use null.',
          // ✅ FIX: Instruct model to be lenient about color match for fabrics
          'For fabric/saree images: use "uncertain" for color_match unless there is a very clear color mismatch (e.g. red vs blue). Lighting and photography differences are normal.'
        ].join('\n')
      },
      {
        type: 'text',
        text: `Customer caption: ${caption || 'none'}`
      },
      {
        type: 'text',
        text: 'Customer image'
      },
      {
        type: 'image_url',
        image_url: {
          url: customerImageDataUrl,
          detail: 'high'
        }
      }
    ];

    const loadedCandidates = [];

    for (let i = 0; i < candidatePool.length; i += 1) {
      const candidate = candidatePool[i];
      try {
        const candidateImageDataUrl = await loadImageAsDataUrl(candidate.imageUrl, '');
        loadedCandidates.push({
          ...candidate,
          visualIndex: loadedCandidates.length + 1
        });

        content.push(
          {
            type: 'text',
            text: `Candidate ${loadedCandidates.length}: ${candidate.item?.name || 'Unknown'} (retailer_id: ${candidate.item?.retailer_id || 'na'})`
          },
          {
            type: 'image_url',
            image_url: {
              url: candidateImageDataUrl,
              detail: 'high'
            }
          }
        );
      } catch (candidateLoadError) {
        console.warn(`Candidate image load skipped for ${candidate.item?._id}:`, candidateLoadError.message);
      }
    }

    if (!loadedCandidates.length) {
      return null;
    }

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a strict product image matcher for ecommerce.'
        },
        {
          role: 'user',
          content
        }
      ],
      temperature: 0,
      max_tokens: 220
    });

    const modelContent = response.choices?.[0]?.message?.content;
    const rawContent = Array.isArray(modelContent)
      ? modelContent.map(part => (typeof part === 'string' ? part : (part?.text || ''))).join('\n')
      : modelContent;
    const parsed = extractJsonFromModelOutput(rawContent);

    const candidateIndex = Number(parsed?.matched_candidate_index);
    const confidence = clamp01(Number(parsed?.confidence));
    const colorMatchRaw = String(parsed?.color_match || '').toLowerCase();
    const colorMatch = ['match', 'mismatch', 'uncertain'].includes(colorMatchRaw)
      ? colorMatchRaw
      : 'uncertain';
    const reason = String(parsed?.reason || '').trim();

    const selected = Number.isInteger(candidateIndex)
      ? loadedCandidates.find(candidate => candidate.visualIndex === candidateIndex)
      : null;

    const verification = {
      matchedRankIndex: selected ? selected.rankIndex : null,
      confidence,
      colorMatch,
      reason
    };

    imageMatchCache.set(cacheKey, verification, 300);
    return verification;
  } catch (error) {
    console.warn('Visual candidate verification skipped:', error.message);
    return null;
  }
}

async function findCatalogProductFromImage(params = {}) {
  const {
    tenantId,
    imageUrl = '',
    imageS3Key = '',
    caption = ''
  } = params;

  if (!tenantId) {
    throw new Error('tenantId is required for image catalog matching');
  }

  const cacheKey = crypto
    .createHash('md5')
    .update(`image_catalog_match_v4_${tenantId}_${imageUrl}_${imageS3Key}_${caption.toLowerCase()}`)  // bumped v3→v4 to bust old cache
    .digest('hex');

  const cachedMatch = imageMatchCache.get(cacheKey);
  if (cachedMatch) {
    return cachedMatch;
  }

  const InventoryItem = require('../models/inventory.js');
  const products = await InventoryItem.find({ tenant_id: tenantId })
    .select('_id tenant_id retailer_id name description categories price currency availability inventory image_url url whatsapp_sync_status whatsapp_sync_details')
    .lean();

  if (!products.length) {
    const emptyResult = {
      match: null,
      confidence: 0,
      reason: 'no_catalog_products',
      signals: null,
      topMatches: []
    };
    imageMatchCache.set(cacheKey, emptyResult, 300);
    return emptyResult;
  }

  let signals = null;
  try {
    signals = await analyzeProductImageSignals(imageUrl, imageS3Key, caption);
  } catch (error) {
    console.warn('Image signal extraction failed, using caption-only matching:', error.message);
  }

  if (
    signals &&
    signals.isProductImage === false &&
    signals.confidence < 0.2 &&
    !signals.hasApparelSignals &&
    !String(caption || '').trim()
  ) {
    const nonProductResult = {
      match: null,
      confidence: 0,
      reason: 'not_product_image',
      signals,
      topMatches: []
    };
    imageMatchCache.set(cacheKey, nonProductResult, 180);
    return nonProductResult;
  }

  const tokens = buildSearchTokens(signals, caption);
  if (!tokens.length) {
    const noTokensResult = {
      match: null,
      confidence: 0,
      reason: 'no_identifiable_tokens',
      signals,
      topMatches: []
    };
    imageMatchCache.set(cacheKey, noTokensResult, 180);
    return noTokensResult;
  }

  const lexicalRanked = products
    .map((item) => {
      const scored = scoreInventoryMatch(item, tokens, signals);
      return {
        item,
        lexicalScore: scored.lexicalScore,
        colorAnalysis: scored.colorAnalysis
      };
    })
    .filter(candidate => candidate.lexicalScore > 0)
    .sort((a, b) => b.lexicalScore - a.lexicalScore);

  if (!lexicalRanked.length) {
    const noMatchResult = {
      match: null,
      confidence: 0,
      reason: 'no_catalog_match',
      signals,
      topMatches: []
    };
    imageMatchCache.set(cacheKey, noMatchResult, 180);
    return noMatchResult;
  }

  const shortlist = lexicalRanked.slice(0, 14);
  const semanticQueryText = [
    signals?.titleGuess,
    signals?.brandGuess,
    signals?.productType,
    signals?.category,
    ...(signals?.keywords || []),
    ...(signals?.attributes || []),
    ...(signals?.targetProductColors || []),
    ...(signals?.dominantColors || []),
    ...(signals?.fabricTokens || []),
    signals?.summary,
    caption
  ]
    .filter(Boolean)
    .join(' ');

  const ranked = await rankCandidatesWithSemanticScore(shortlist, semanticQueryText);
  let best = ranked[0];

  if (!best) {
    return {
      match: null,
      confidence: 0,
      reason: 'no_ranked_result',
      signals,
      topMatches: []
    };
  }

  let visualVerification = null;
  try {
    visualVerification = await verifyVisualMatchAgainstCandidates({
      imageUrl,
      imageS3Key,
      caption,
      rankedCandidates: ranked.slice(0, 5).map((candidate, rankIndex) => ({
        ...candidate,
        rankIndex
      }))
    });
  } catch (visualError) {
    console.warn('Visual verification fallback:', visualError.message);
  }

 if (
    visualVerification?.matchedRankIndex !== null &&
    visualVerification?.confidence >= 0.55 &&
    visualVerification?.colorMatch !== 'mismatch'
  ) {
    const visuallyBest = ranked[visualVerification.matchedRankIndex];
    if (visuallyBest) {
      best = visuallyBest;
    }
  } else if (visualVerification?.matchedRankIndex === null && visualVerification?.confidence >= 0.78) {
    const visualRejectResult = {
      match: null,
      confidence: 0,
      reason: 'visual_no_match',
      signals,
      validation: {
        visualVerification
      },
      topMatches: ranked.slice(0, 3).map(candidate => ({
        id: candidate.item._id,
        name: candidate.item.name,
        retailer_id: candidate.item.retailer_id,
        lexicalScore: candidate.lexicalScore,
        semanticScore: Number((candidate.semanticScore || 0).toFixed(3)),
        finalScore: candidate.finalScore
      }))
    };
    imageMatchCache.set(cacheKey, visualRejectResult, 180);
    return visualRejectResult;
  }

  const runnerUp = ranked.find(candidate => String(candidate.item?._id) !== String(best.item?._id));
  const scoreMargin = best.finalScore - (runnerUp?.finalScore || 0);
  const lexicalGate = 20;
  const semanticGate = 0.66;
  const finalGate = 44;
  const hasStrongVisualConfirmation = Boolean(
    visualVerification &&
    visualVerification.matchedRankIndex !== null &&
    visualVerification.confidence >= 0.7 &&
    visualVerification.colorMatch !== 'mismatch'
  );
  const marginGate = hasStrongVisualConfirmation ? 0 : (best.semanticScore >= 0.85 ? 2 : 7);

  const textualColorMismatch = Boolean(best.colorAnalysis?.isMismatch && best.colorAnalysis?.hasStrongColorSignal);
  const textualFabricMismatch = Boolean(best.fabricAnalysis?.isMismatch && best.fabricAnalysis?.hasStrongFabricSignal);
  const visualColorMismatch = visualVerification?.colorMatch === 'mismatch';
  const hasFabricMismatch = Boolean(textualFabricMismatch);
const hasColorMismatch = hasStrongVisualConfirmation
    ? false
    : Boolean(textualColorMismatch || textualFabricMismatch || visualColorMismatch);

  const passesBaseGate = hasStrongVisualConfirmation || (
    best.lexicalScore >= lexicalGate ||
    best.semanticScore >= semanticGate ||
    best.finalScore >= finalGate
  );
  const passesMarginGate = hasStrongVisualConfirmation || !runnerUp || scoreMargin >= marginGate;
  const isConfident = passesBaseGate && passesMarginGate && !hasColorMismatch;

  const mapCandidate = (candidate) => ({
    id: candidate.item._id,
    name: candidate.item.name,
    retailer_id: candidate.item.retailer_id,
    lexicalScore: candidate.lexicalScore,
    semanticScore: Number((candidate.semanticScore || 0).toFixed(3)),
    finalScore: candidate.finalScore,
    colorOverlap: candidate.colorAnalysis?.overlap || [],
    compatibleColorOverlap: candidate.colorAnalysis?.compatibleOverlap || [],
    requestedColors: candidate.colorAnalysis?.signalColors || [],
    candidateColors: candidate.colorAnalysis?.inventoryColors || [],
    fabricOverlap: candidate.fabricAnalysis?.overlap || [],
    requestedFabrics: candidate.fabricAnalysis?.signalFabrics || [],
    candidateFabrics: candidate.fabricAnalysis?.inventoryFabrics || []
  });

  if (!isConfident) {
    const lowConfidenceReason = hasColorMismatch
      ? (hasFabricMismatch && !textualColorMismatch ? 'fabric_mismatch' : 'color_mismatch')
      : (passesMarginGate ? 'low_confidence_match' : 'ambiguous_match');

    const lowConfidenceResult = {
      match: null,
      confidence: 0,
      reason: lowConfidenceReason,
      signals,
      validation: {
        scoreMargin: Number(scoreMargin.toFixed(2)),
        marginGate,
        passesMarginGate,
        hasColorMismatch,
        visualVerification,
        requestedColors: best.colorAnalysis?.signalColors || [],
        candidateColors: best.colorAnalysis?.inventoryColors || [],
        matchedColors: best.colorAnalysis?.overlap || [],
        compatibleMatchedColors: best.colorAnalysis?.compatibleOverlap || [],
        requestedFabrics: best.fabricAnalysis?.signalFabrics || [],
        candidateFabrics: best.fabricAnalysis?.inventoryFabrics || [],
        matchedFabrics: best.fabricAnalysis?.overlap || []
      },
      topMatches: ranked.slice(0, 3).map(mapCandidate)
    };
    imageMatchCache.set(cacheKey, lowConfidenceResult, 180);
    return lowConfidenceResult;
  }

  const lexicalConfidence = clamp01(best.lexicalScore / 120);
  const semanticConfidence = clamp01(best.semanticScore || 0);
  const visionConfidence = clamp01(signals?.confidence || 0);
  const visualPairConfidence = clamp01(visualVerification?.confidence || 0);
  const colorConfidence = (() => {
    if (hasStrongVisualConfirmation && visualVerification?.colorMatch === 'match') {
      return 0.95;
    }

    if (!best.colorAnalysis?.hasStrongColorSignal) {
      return 0.55;
    }

    if (best.colorAnalysis.isMismatch && (!best.colorAnalysis.compatibleOverlap || !best.colorAnalysis.compatibleOverlap.length)) {
      return 0.08;
    }

    if (best.colorAnalysis.overlap?.length) {
      return clamp01(0.5 + (best.colorAnalysis.coverage * 0.5));
    }

    if (best.colorAnalysis.compatibleOverlap?.length) {
      return clamp01(0.4 + (best.colorAnalysis.coverage * 0.4));
    }

    return 0.3;
  })();

  const fabricConfidence = (() => {
    if (!best.fabricAnalysis?.hasStrongFabricSignal) {
      return 0.5;
    }

    if (best.fabricAnalysis.isMismatch) {
      return 0.05;
    }

    if (best.fabricAnalysis.overlap?.length) {
      return clamp01(0.5 + (best.fabricAnalysis.overlap.length / Math.max(1, best.fabricAnalysis.signalFabrics.length)) * 0.5);
    }

    return 0.3;
  })();

  let combinedConfidence = (
    (lexicalConfidence * 0.23) +
    (semanticConfidence * 0.24) +
    (visionConfidence * 0.15) +
    (colorConfidence * 0.15) +
    (visualPairConfidence * 0.15) +
    (fabricConfidence * 0.08)
  );

  if (visualVerification && visualVerification.matchedRankIndex === null && visualVerification.confidence >= 0.5) {
    combinedConfidence -= 0.08;
  }

  if (runnerUp && !hasStrongVisualConfirmation && scoreMargin < (marginGate + 2)) {
    combinedConfidence -= 0.1;
  }

  if (hasStrongVisualConfirmation) {
    combinedConfidence = Math.max(combinedConfidence, 0.72);
  }

  combinedConfidence = Number(clamp01(combinedConfidence).toFixed(2));

  const result = {
    match: best.item,
    confidence: combinedConfidence,
    score: best.finalScore,
    reason: 'matched',
    signals,
    validation: {
      scoreMargin: Number(scoreMargin.toFixed(2)),
      marginGate,
      visualVerification,
      requestedColors: best.colorAnalysis?.signalColors || [],
      candidateColors: best.colorAnalysis?.inventoryColors || [],
      matchedColors: best.colorAnalysis?.overlap || [],
      compatibleMatchedColors: best.colorAnalysis?.compatibleOverlap || [],
      colorCoverage: Number((best.colorAnalysis?.coverage || 0).toFixed(2)),
      requestedFabrics: best.fabricAnalysis?.signalFabrics || [],
      candidateFabrics: best.fabricAnalysis?.inventoryFabrics || [],
      matchedFabrics: best.fabricAnalysis?.overlap || []
    },
    topMatches: ranked.slice(0, 3).map(mapCandidate)
  };

  imageMatchCache.set(cacheKey, result, 300);
  return result;
}

 function getEmbeddingStats(vectors) {
   if (!vectors || !Array.isArray(vectors)) {
     return { total: 0, withEmbeddings: 0, withoutEmbeddings: 0 };
   }

   const total = vectors.length;
   const withEmbeddings = vectors.filter(v => v.embedding && v.embedding.length > 0).length;
   const withoutEmbeddings = total - withEmbeddings;

   return {
     total,
     withEmbeddings,
     withoutEmbeddings,
     embeddingPercentage: total > 0 ? Math.round((withEmbeddings / total) * 100) : 0
   };
 }

 module.exports = {
   createEmbedding,
   getWhatsAppRAGResponse,
   findMostRelevantDocument,
   cosineSimilarity,
   testWhatsAppRAGConnection,
   getEmbeddingStats,
   getCommonGreeting,
   findCatalogProductFromImage
 };

