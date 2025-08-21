import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the minimal UI
app.use(express.static(path.join(__dirname, "public"), { index: "index.html" }));

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:1b";

// Proxy to Ollama and stream the response back to the browser.
// No logging; no persistence.
app.post("/api/chat", async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    const upstream = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: true
      })
    });

    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status || 500);
      const text = await upstream.text().catch(() => "");
      return res.end(`Error from Ollama: ${upstream.status} ${text}`);
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value); // forward raw JSONL chunks to client
    }
    res.end();
  } catch {
    res.status(500).end("Server error.");
  }
});

// Simple health
app.get("/healthz", (_req, res) => res.json({ ok: true, model: OLLAMA_MODEL }));

const port = process.env.PORT || 3000;
app.listen(port);
