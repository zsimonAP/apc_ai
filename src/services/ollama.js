// src/services/ollama.js
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

// ----- Helpers -----
async function jsonOrText(resp) {
  try { return await resp.json(); } catch { return await resp.text(); }
}

// List local models
export async function listLocalModels() {
  const r = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!r.ok) {
    const body = await jsonOrText(r);
    throw new Error(`tags failed (${r.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return r.json(); // { models: [...] }
}

// Pull a model (non-streaming)
export async function pullModel(model) {
  const r = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: false }),
  });
  if (!r.ok) {
    const body = await jsonOrText(r);
    throw new Error(`pull failed (${r.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return r.json();
}

/**
 * Stream chat using Ollama /api/chat (preferred for multi-turn)
 * Usage A (SSE to client):
 *   await streamChat({ model, messages, options }, res)
 *
 * Usage B (callback per JSON object):
 *   await streamChat({ model, messages, options }, (obj) => { ... })
 */
export async function streamChat(body, resOrOnChunk) {
  const { model, messages, options } = body || {};
  if (!model) throw new Error('Missing model');
  if (!Array.isArray(messages)) throw new Error('Missing messages array');

  const r = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, options, stream: true }),
  });

  if (!r.ok || !r.body) {
    const text = await jsonOrText(r);
    if (r.status === 404) throw new Error(`Model "${model}" not found. Pull with: ollama pull ${model}`);
    throw new Error(`ollama chat start failed (${r.status}): ${typeof text === 'string' ? text : JSON.stringify(text)}`);
  }

  const isFn = typeof resOrOnChunk === 'function';
  const isRes = resOrOnChunk &&
                typeof resOrOnChunk.write === 'function' &&
                typeof resOrOnChunk.setHeader === 'function';

  // If responding via SSE, set headers
  if (isRes) {
    resOrOnChunk.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    resOrOnChunk.setHeader('Cache-Control', 'no-cache');
    resOrOnChunk.setHeader('Connection', 'keep-alive');
  } else if (!isFn) {
    throw new Error('streamChat requires either an Express response (SSE) or a callback function');
  }

  const forward = (obj) => {
    if (isFn) {
      try { resOrOnChunk(obj); } catch { /* ignore */ }
    } else {
      resOrOnChunk.write(`data: ${JSON.stringify(obj)}\n\n`);
    }
  };

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // NDJSON lines (sometimes prefixed with "data: ")
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;

        const jsonStr = line.startsWith('data: ') ? line.slice(6) : line;

        try {
          const obj = JSON.parse(jsonStr);
          forward(obj);
        } catch {
          // Fallback: forward raw text as content chunk
          forward({ message: { content: jsonStr }, done: false });
        }
      }
    }
  } finally {
    if (buf.trim()) {
      try { forward(JSON.parse(buf.trim())); } catch { /* ignore */ }
      buf = '';
    }
    forward({ done: true });
    if (isRes) resOrOnChunk.end();
  }
}
