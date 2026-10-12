// Local static server for build/public-staging/ (verification only, not a deployment).
// Mirrors vercel.json: existing files are served as-is; any non-/assets/ path without a file
// falls back to index.html (the rewrite rule). Headers from vercel.json.template are applied, so
// CSP and security headers behave as they will on Vercel. Binds 127.0.0.1 only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const DIR = resolve(opt('--root', join(ROOT, 'build', 'public-staging')));
const PORT = Number(opt('--port', '4176'));
const HOST = '127.0.0.1';

const config = JSON.parse(await readFile(join(ROOT, 'scripts', 'public', 'vercel.json.template'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// Vercel-style source patterns: "(.*)" is the only capture used by the template.
const toRegExp = (source) => new RegExp('^' + source.split('(.*)').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*)') + '$');
const headerRules = (config.headers ?? []).map((h) => ({ re: toRegExp(h.source), headers: h.headers }));

function headersFor(pathname) {
  const out = {};
  for (const rule of headerRules) {
    if (rule.re.test(pathname)) for (const { key, value } of rule.headers) out[key] = value;
  }
  return out;
}

async function fileAt(rel) {
  const full = normalize(join(DIR, rel));
  if (!full.startsWith(DIR + '/') && full !== DIR) return null;
  const st = await stat(full).catch(() => null);
  return st?.isFile() ? full : null;
}

async function send(res, status, body, type, extra = {}) {
  res.writeHead(status, { 'Content-Type': type, ...extra });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed', 'text/plain');
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, 'Bad Request', 'text/plain');
    }
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    let file = await fileAt(rel);
    let served = pathname;
    if (!file && !pathname.startsWith('/assets/')) {
      file = await fileAt('index.html'); // rewrite: /((?!assets/).*) -> /index.html
      served = '/index.html';
    }
    if (!file) return send(res, 404, 'Not Found', 'text/plain', headersFor(pathname));
    const body = req.method === 'HEAD' ? '' : await readFile(file);
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    const extra = headersFor(served);
    const st = await stat(file);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, ...extra });
    res.end(body);
  } catch (err) {
    send(res, 500, String(err?.message ?? err), 'text/plain');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`serve-static pid=${process.pid} http://${HOST}:${PORT} root=${DIR}`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
