import { Router } from 'express';
import multer from 'multer';
import { extractTextFromUpload } from '../services/extractors.js';
import { streamChat } from '../services/ollama.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// NOTE: Mount path is /api/chat, so this must be '/' to keep endpoint at /api/chat
router.post('/', upload.single('file'), async (req, res) => {
  try {
    // We expect multipart/form-data with fields:
    // - model: string
    // - messages: JSON string (array of {role, content})
    // - file: optional upload
    const model = (req.body?.model || '').toString() || process.env.DEFAULT_MODEL || 'unknown';

    let messages = [];
    try {
      messages = JSON.parse(req.body?.messages || '[]');
      if (!Array.isArray(messages)) messages = [];
    } catch {
      messages = [];
    }

    // If a file was uploaded, extract text and inject as a system message
    if (req.file?.buffer?.length) {
      let fileContext = await extractTextFromUpload(req.file.buffer, req.file.originalname);

      // Clamp text length to avoid blowing up context
      const MAX_CHARS = 40_000;
      if (fileContext.length > MAX_CHARS) {
        fileContext = fileContext.slice(0, MAX_CHARS) + '\n\n…[truncated]';
      }

      const sysMsg = {
        role: 'system',
        content:
          `You are analyzing an uploaded file. Use it to answer the user.\n` +
          `Filename: ${req.file.originalname}\n\n` +
          `===== FILE CONTENT START =====\n${fileContext}\n===== FILE CONTENT END =====`,
      };

      // Prepend so it applies to the current turn
      messages = [sysMsg, ...messages];
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Hand off to Ollama streaming; your streamChat should emit `data: {...}\n\n` chunks
    await streamChat({ model, messages }, res);
  } catch (err) {
    console.error(err);
    // If headers already sent (SSE started), just end
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Upload failed' })}\n\n`);
      return res.end();
    }
    res.status(500).json({ ok: false, error: err?.message || 'Upload failed' });
  }
});

export default router;
