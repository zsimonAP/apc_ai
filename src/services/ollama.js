const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// List local models
export async function listLocalModels() {
  const r = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!r.ok) throw new Error(`tags failed: ${r.status}`);
  return r.json();
}

// Pull a model (non-streaming)
export async function pullModel(model) {
  const r = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: false }),
  });
  if (!r.ok) throw new Error(`pull failed: ${r.status}`);
  return r.json();
}

/**
 * Stream chat using Ollama /api/chat (preferred for multi-turn)
 * body: { model, messages, options }
 * callback: receives each NDJSON line (string)
 */
export async function streamChat(body, onChunk) {
  const r = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stream: true, ...body }),
  });

  if (!r.ok || !r.body) {
    throw new Error(`ollama chat start failed: ${r.status}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    // Ollama streams NDJSON lines; forward each line separately
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) onChunk(trimmed);
    }
  }
}
