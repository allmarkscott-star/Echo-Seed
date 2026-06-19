const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

async function sb(path, options) {
  options = options || {};
  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  Object.assign(headers, options.headers || {});
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body || undefined
  });
  var text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      var convId = req.query.conversation_id;
      if (!convId) return res.status(400).json({ error: 'conversation_id required' });
      var rows = await sb('chat_messages?conversation_id=eq.' + encodeURIComponent(convId) + '&select=*&order=seq.asc');
      res.json(rows || []);

    } else if (req.method === 'POST') {
      var body = req.body;
      var result = await sb('chat_messages', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          conversation_id: body.conversation_id,
          seq: body.seq,
          role: body.role,
          content: body.content,
          display_text: body.displayText || null,
          image_previews: body.imagePreviews || null
        })
      });
      res.json(result);

    } else if (req.method === 'DELETE') {
      var delConvId = req.query.conversation_id;
      var fromSeq = req.query.fromSeq;
      if (!delConvId) return res.status(400).json({ error: 'conversation_id required' });
      var path = 'chat_messages?conversation_id=eq.' + encodeURIComponent(delConvId);
      if (fromSeq !== undefined) {
        path += '&seq=gte.' + encodeURIComponent(fromSeq);
      }
      await sb(path, { method: 'DELETE' });
      res.json({ success: true });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
