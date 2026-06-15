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
      var data = await sb('memories?select=*&order=created_at.asc');
      res.json(data || []);
    } else if (req.method === 'POST') {
      var text = req.body.text;
      var result = await sb('memories', {
        method: 'POST',
        body: JSON.stringify({ text: text })
      });
      res.json(result);
    } else if (req.method === 'DELETE') {
      await sb('memories?id=neq.00000000-0000-0000-0000-000000000000', { method: 'DELETE' });
      res.json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
 
