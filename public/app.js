// public/app.js
"use strict";

const els = {
  overlay: document.getElementById('login-overlay'),
  form: document.getElementById('login-form'),
  user: document.getElementById('username'),
  pass: document.getElementById('password'),
  err: document.getElementById('login-error'),
  model: document.getElementById('model'),
  clear: document.getElementById('clear'),
  logout: document.getElementById('logout'),
  msgs: document.getElementById('messages'),
  input: document.getElementById('input'),
  composer: document.getElementById('composer'),
};

let CSRF = '';
let messages = [];     // in-memory only (no persistence)
let busy = false;
let aborter = null;

async function getCSRF() {
  const r = await fetch('/api/csrf', { credentials: 'same-origin' });
  const j = await r.json();
  CSRF = j.csrfToken;
}

function uiAdd(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  els.msgs.appendChild(div);
  els.msgs.scrollTop = els.msgs.scrollHeight;
}

function uiPatchLast(text) {
  const last = els.msgs.lastElementChild;
  if (last) last.textContent = text;
  els.msgs.scrollTop = els.msgs.scrollHeight;
}

async function login(username, password) {
  const r = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF },
    body: JSON.stringify({ username, password })
  });
  if (!r.ok) throw new Error('Login failed');
}

async function loadModels() {
  const r = await fetch('/api/models', { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Failed to load models');
  const j = await r.json();
  const models = (j.models || []).map(m => m.name).sort();
  els.model.innerHTML = '';
  for (const name of models) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    els.model.appendChild(opt);
  }
  if (els.model.options.length > 0) els.model.selectedIndex = 0;
}

async function send() {
  if (busy) return;
  const content = (els.input.value || '').trim();
  if (!content) return;

  messages.push({ role: 'user', content });
  uiAdd('user', content);
  els.input.value = '';

  busy = true;
  aborter = new AbortController();

  // Placeholder assistant message to stream into
  messages.push({ role: 'assistant', content: '' });
  uiAdd('assistant', '');

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF },
      body: JSON.stringify({ model: els.model.value, messages }),
      signal: aborter.signal
    });

    if (!r.ok || !r.body) throw new Error('Chat failed');

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let acc = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += dec.decode(value, { stream: true });

      // Handle both \n and \r\n safely
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        line = line.replace(/\r$/, '').trim();
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          const piece = (obj && obj.message && obj.message.content) ?? obj?.response ?? '';
          if (piece) {
            acc += piece;
            uiPatchLast(acc);
          }
        } catch {
          // ignore parse errors for partial lines
        }
      }
    }

    // Update the in-memory messages with the assistant content
    messages[messages.length - 1].content = acc;
  } catch (e) {
    uiPatchLast('[stream aborted]');
  } finally {
    busy = false;
    aborter = null;
  }
}

function clearChat() {
  messages = [];
  els.msgs.innerHTML = '';
}

function bind() {
  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.err.textContent = '';
    try {
      await getCSRF();
      await login(els.user.value.trim(), els.pass.value);
      await loadModels();
      els.overlay.style.display = 'none';
    } catch {
      els.err.textContent = 'Invalid username or password';
    }
  });

  els.composer.addEventListener('submit', async (e) => {
    e.preventDefault();
    send();
  });

  els.clear.addEventListener('click', clearChat);

  els.logout.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST', headers: { 'x-csrf-token': CSRF } });
    } catch {}
    location.reload();
  });

  // Enter to send, Shift+Enter for newline
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

bind();
