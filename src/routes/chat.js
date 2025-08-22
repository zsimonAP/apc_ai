//src/routes/chat.js

import { Router } from 'express';
import { streamChat } from '../services/ollama.js';

const router = Router();

router.post('/', async (req, res) => {
  const { model, messages, options } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'model and messages[] are required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx-friendly
  // Make sure nothing else tries to buffer this response
  // (compression filter already skips this route)
  res.flushHeaders?.();

  // Keep the socket open
  req.socket.setTimeout(0);

  // Helper to send SSE frames
  const send = (obj) => {
    res.write(`data: ${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n\n`);
  };

  try {
    // Start streaming from Ollama; forward each NDJSON line as an SSE "data" frame
    await streamChat({ model, messages, options }, (line) => {
      // line is a NDJSON string (e.g., {"message":{"content":"..."}, "done":false})
      send(line);
    });
  } catch (e) {
    console.error('[chat] error:', e);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'chat failed' })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
