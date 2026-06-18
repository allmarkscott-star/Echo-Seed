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
      if (block.type === 'document') {
        var mediaType = block.source && block.source.media_type;
        if (mediaType !== 'application/pdf') {
          return { type: 'text', text: '[File attachment]' };
        }
      }
      return block;
    });
    return Object.assign({}, msg, { content: cleanContent });
  });
}

function extractError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.error && err.error.message) return err.error.message;
  if (err.error && typeof err.error === 'string') return err.error;
  return JSON.stringify(err);
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
        max_tokens: 1500,
        system: systemPrompt,
        messages: sanitizeMessages(messages),
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search'
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: extractError(data.error || data) });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: extractError(error) });
  }
}
