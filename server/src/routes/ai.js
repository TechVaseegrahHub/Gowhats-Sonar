router.post('/process-realtime-query', async (req, res) => {
  try {
    const { query, context, timestamp } = req.body;
    
    if (!DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const enhancedPrompt = `You are an AI assistant for GoWhats with access to REAL-TIME business data.
    Current timestamp: ${timestamp}
    Last data update: ${context.lastUpdated}
    
    CRITICAL: Use ONLY the actual numbers provided in the context. Do not make up or estimate any values.
    
    When answering questions about:
    - Orders: Use context.orders data
    - Broadcasts: Use context.broadcasts data  
    - Inventory: Use context.inventory data
    - Integrations: Use context.integrations data
    - Dashboard: Use context.dashboard data
    
    Provide specific, accurate answers with real numbers from the provided context.
    If data is null or unavailable, mention that the system is updating.
    Format responses clearly and be conversational but professional.`;

    const messages = [
      {
        role: 'system',
        content: enhancedPrompt
      },
      {
        role: 'user',
        content: `Query: ${query}\n\nReal-time Context:\n${JSON.stringify(context, null, 2)}`
      }
    ];

    const response = await axios.post(DEEPSEEK_API_URL, {
      model: 'deepseek-chat',
      messages: messages,
      max_tokens: 1500,
      temperature: 0.3, // Lower temperature for more accurate responses
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiResponse = response.data.choices[0].message.content;
    
    res.json({ 
      response: aiResponse,
      dataTimestamp: context.lastUpdated,
      usage: response.data.usage
    });

  } catch (error) {
    console.error('AI processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process query',
      details: error.message 
    });
  }
});

