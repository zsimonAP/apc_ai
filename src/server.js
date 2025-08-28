import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import csvRoutes from "./routes/csv.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Security & perf
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

// Basic rate limit for API routes (skip static)
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 120 }));

// ⚠️ Compression can break SSE. Skip for chat streaming.
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.startsWith('/api/chat')) return false;
      return compression.filter(req, res);
    },
  })
);

// Routes
import modelsRouter from './routes/models.js';
import chatRouter from './routes/chat.js';

app.use('/api/models', modelsRouter);
app.use('/api/chat', chatRouter);
app.use("/api/csv", csvRoutes);

// Health
app.get('/api/healthz', (req, res) => {
  res.json({
    ok: true,
    environment: process.env.NODE_ENV || 'development',
    model: process.env.DEFAULT_MODEL || 'unknown',
  });
});

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Default to chat page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/chat/chat.html'));
});

app.listen(PORT, () => {
  console.log(`[web] listening on http://localhost:${PORT}`);
});
