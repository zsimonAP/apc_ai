// src/services/extractors.js
import { fileTypeFromBuffer } from 'file-type';
import mammoth from 'mammoth';
import { parse as parseCsv } from 'csv-parse/sync';
// Node-friendly legacy ESM build (no DOMMatrix needed)
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractTextFromUpload(buffer, originalName = '') {
  if (!buffer || !buffer.length) return '';

  // Detect from magic bytes; fall back to extension.
  let mime = '';
  try {
    const ft = await fileTypeFromBuffer(buffer);
    mime = ft?.mime || '';
  } catch { /* ignore */ }
  if (!mime) mime = guessMimeFromName(originalName);

  try {
    if (mime === 'application/pdf') return await extractPdf(buffer);
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalName.toLowerCase().endsWith('.docx')
    ) {
      return await extractDocx(buffer);
    }
    if (mime === 'text/csv' || originalName.toLowerCase().endsWith('.csv')) {
      return extractCsv(buffer);
    }
    if (mime.startsWith('text/') || isLikelyText(originalName)) {
      return normalizeText(buffer.toString('utf8'));
    }

    // Fallback: try UTF-8 anyway
    return normalizeText(buffer.toString('utf8'));
  } catch {
    // Final fallback so the server never crashes
    try { return normalizeText(buffer.toString('utf8')); } catch { return ''; }
  }
}

function guessMimeFromName(name = '') {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (n.endsWith('.csv')) return 'text/csv';
  if (n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.log')) return 'text/plain';
  return 'application/octet-stream';
}

function isLikelyText(name = '') {
  return ['.txt', '.md', '.log'].some(ext => name.toLowerCase().endsWith(ext));
}

function normalizeText(s = '') {
  return s.replace(/\u0000/g, '').replace(/\r\n/g, '\n');
}

// ---------- Extractors ----------

async function extractPdf(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Flags tuned for Node/server usage
  const loadingTask = pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;

  let out = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const line = content.items
      .map(it => ('str' in it ? it.str : (it?.text) || ''))
      .join(' ')
      .trim();
    if (line) out += (out ? '\n' : '') + line;
  }

  return normalizeText(out);
}

async function extractDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return normalizeText(value || '');
}

function extractCsv(buffer) {
  const csv = buffer.toString('utf8');
  const rows = parseCsv(csv, { skip_empty_lines: true });
  return normalizeText(rows.map(r => r.join(', ')).join('\n'));
}
