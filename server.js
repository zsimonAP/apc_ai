import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { helmetMw, isProd } from './security.js';
import { cookies, csrfMw, apiLimiter, loginLimiter, validators, login, logout, requireAuth, whoami } from './auth.js';
import { registerOllamaRoutes } from './ollamaProxy.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // for secure cookies behind reverse proxies


// Global security
app.use(helmetMw);
app.use(cookies);
app.use(express.json({ limit: '2mb' }));


// CORS: same-origin by default; adjust if you place UI behind another domain
app.use(cors({ origin: false }));


// CSRF protection on mutating requests
app.use(csrfMw);


// CSRF token route (safe, GET)
app.get('/api/csrf', (_req, res) => {
res.json({ csrfToken: res.locals.csrfToken || (res.locals.csrfToken = _req.csrfToken()) });
});


// Auth
app.post('/api/login', loginLimiter, validators, login);
app.post('/api/logout', requireAuth, logout);
app.get('/api/profile', requireAuth, whoami);


// Ollama proxy routes
registerOllamaRoutes(app);


// Static UI (no client-side persistence)
app.use(express.static(path.join(__dirname, 'public'), {
setHeaders: (res, _path) => {
if (_path.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
}
}));


// Fallback to index
app.get('*', (_req, res) => {
res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`UI listening on :${port} ${isProd ? '(prod)' : '(dev)'} `));