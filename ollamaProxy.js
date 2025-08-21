// ollamaProxy.js - minimal proxy to Ollama with streaming pass-through
import { requireAuth } from './auth.js';
import { noStore } from './security.js';


const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';


export function registerOllamaRoutes(app) {
// List installed models
app.get('/api/models', requireAuth, noStore, async (req, res) => {
try {
const r = await fetch(`${OLLAMA_URL}/api/tags`);
if (!r.ok) return res.status(502).json({ error: 'Ollama error' });
const data = await r.json();
res.setHeader('Cache-Control', 'no-store');
res.json(data);
} catch (e) {
res.status(502).json({ error: 'Ollama unreachable' });
}
});


// Chat (NDJSON stream pass-through) — no persistence
app.post('/api/chat', requireAuth, noStore, async (req, res) => {
try {
const { model, messages, options } = req.body || {};
if (!model || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid payload' });


const upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ model, messages, stream: true, options: options || {} })
});


if (!upstream.ok || !upstream.body) {
return res.status(502).json({ error: 'Ollama error' });
}


res.setHeader('Content-Type', 'application/x-ndjson');
res.setHeader('Cache-Control', 'no-store');


// Pipe chunks through without buffering
for await (const chunk of upstream.body) {
res.write(chunk);
}
res.end();
} catch (e) {
// If client aborted, just end
if (!res.headersSent) res.status(500).json({ error: 'Proxy error' });
else try { res.end(); } catch {}
}
});
}