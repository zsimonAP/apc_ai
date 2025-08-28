import { Router } from "express";
import multer from "multer";
import { extractTextFromUpload } from "../services/extractors.js";
import { streamChat } from "../services/ollama.js";

const router = Router();

// --- CSV system instruction to teach the model the csvjson protocol ---
const CSV_SYS_INSTRUCTION = `
If the user asks for a downloadable CSV, do NOT paste raw CSV.
Instead, reply with a fenced block labeled \`csvjson\` containing strictly valid JSON:
{
  "filename": "example.csv",
  "order": ["colA","colB"], // optional header order
  "rows": [ { "colA": "v1", "colB": "v2" }, ... ]
}
Only include those keys. No extra commentary outside the fenced block.
`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// NOTE: Mounted at /api/chat in server.js, so path must be '/' to keep endpoint at /api/chat
router.post("/", upload.single("file"), async (req, res) => {
  try {
    // Expect multipart/form-data with:
    // - model: string
    // - messages: JSON string (array of { role, content })
    // - file: optional upload
    const model =
      (req.body?.model || "").toString() ||
      process.env.DEFAULT_MODEL ||
      "unknown";

    let messages = [];
    try {
      messages = JSON.parse(req.body?.messages || "[]");
      if (!Array.isArray(messages)) messages = [];
    } catch {
      messages = [];
    }

    // If a file was uploaded, extract text and inject as a system message
    if (req.file?.buffer?.length) {
      let fileContext = await extractTextFromUpload(
        req.file.buffer,
        req.file.originalname
      );

      // Clamp text length to avoid blowing up context
      const MAX_CHARS = 40_000;
      if (fileContext.length > MAX_CHARS) {
        fileContext = fileContext.slice(0, MAX_CHARS) + "\n\n…[truncated]";
      }

      const fileSysMsg = {
        role: "system",
        content:
          `You are analyzing an uploaded file. Use it to answer the user.\n` +
          `Filename: ${req.file.originalname}\n\n` +
          `===== FILE CONTENT START =====\n${fileContext}\n===== FILE CONTENT END =====`,
      };

      // Prepend so it applies to the current turn
      messages = [fileSysMsg, ...messages];
    }

    // Always teach the model how to request CSV downloads
    messages = [{ role: "system", content: CSV_SYS_INSTRUCTION }, ...messages];

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // ---- Tee the SSE so we can detect a fenced csvjson/json block ----
    let assistantTextBuffer = "";
    const _write = res.write.bind(res);
    const _end = res.end.bind(res);

    res.write = (chunk, ...args) => {
      try {
        const s = chunk.toString();
        // Parse each SSE data line and accumulate assistant text
        for (const line of s.split("\n")) {
          const m = line.match(/^data:\s*(\{.*\})\s*$/);
          if (m) {
            try {
              const obj = JSON.parse(m[1]);
              // Append common streaming fields (NOW includes message.content)
              if (typeof obj?.message?.content === "string") {
                assistantTextBuffer += obj.message.content;
              } else if (typeof obj?.content === "string") {
                assistantTextBuffer += obj.content;
              } else if (typeof obj?.delta === "string") {
                assistantTextBuffer += obj.delta;
              } else if (typeof obj?.text === "string") {
                assistantTextBuffer += obj.text;
              }
            } catch {
              // ignore JSON parse errors of non-payload lines
            }
          }
        }
      } catch {
        // ignore tee errors to not disrupt normal streaming
      }
      return _write(chunk, ...args);
    };

    res.end = (...args) => {
      try {
        // Accept both ```csvjson and ```json fenced blocks
        const m = assistantTextBuffer.match(/```(?:csvjson|json)\s*([\s\S]*?)```/i);
        if (m) {
          let spec = null;
          try {
            spec = JSON.parse(m[1]);
          } catch {
            spec = null;
          }
          if (spec && typeof spec === "object") {
            // Send a custom SSE event the client can listen to
            const payload = JSON.stringify({ csvjson: spec });
            _write(`event: csv\n`);
            _write(`data: ${payload}\n\n`);
          }
        }
      } catch {
        // swallow detection errors to not break closing the stream
      }
      return _end(...args);
    };
    // ---- end tee ----

    // Hand off to Ollama streaming; streamChat should emit `data: {...}\n\n`
    await streamChat({ model, messages }, res);
  } catch (err) {
    console.error(err);
    // If headers already sent (SSE started), just end
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: "Upload failed" })}\n\n`);
      return res.end();
    }
    res
      .status(500)
      .json({ ok: false, error: err?.message || "Upload failed" });
  }
});

export default router;
