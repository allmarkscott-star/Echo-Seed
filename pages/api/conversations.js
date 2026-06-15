const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

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
      var data = await sb('conversations?select=*&order=updated_at.desc');
      res.json(data || []);
    } else if (req.method === 'POST') {
      var conv = req.body;
      var result = await sb('conversations', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: conv.id,
          title: conv.title,
          messages: conv.messages || [],
          created_at: conv.createdAt || new Date().toISOString(),
          updated_at: conv.updatedAt || new Date().toISOString()
        })
      });
      res.json(result);
    } else if (req.method === 'DELETE') {
      var id = req.query.id;
      if (id) {
        await sb('conversations?id=eq.' + id, { method: 'DELETE' });
      }
      res.json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
