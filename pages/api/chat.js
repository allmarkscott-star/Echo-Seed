export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

function sanitizeMessages(messages) {
  return messages.map(function(msg) {
    if (!Array.isArray(msg.content)) return msg;
    var cleanContent = msg.content.map(function(block) {
      // If it's a document block, make sure it's only PDF - otherwise convert to text placeholder
      if (block.type === 'document') {
        var mediaType = block.source && block.source.media_type;
        if (mediaType !== 'application/pdf') {
          return { type: 'text', text: '[File attachment — content not available]' };
        }
      }
      return block;
    });
    return Object.assign({}, msg, { content: cleanContent });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, systemPrompt } = req.body;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: sanitizeMessages(messages)
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
