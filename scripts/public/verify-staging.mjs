// Verifies build/public-staging/ before upload. Writes evidence/stage4/staging-verification.json
// and evidence/stage4/staging-verification.log (ends with "EXIT <code>"). Exit 1 on any violation.
import { createHash } from 'node:crypto';
import { mkdir, lstat, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STAGING = resolve(process.argv[2] ?? join(ROOT, 'build', 'public-staging'));
const MANIFEST = join(ROOT, 'build', 'public-staging.manifest.json');
const TEMPLATE = join(ROOT, 'scripts', 'public', 'vercel.json.template');
const EVIDENCE_DIR = join(ROOT, 'evidence', 'stage4');

const NOTICE = 'Interactive demo · No blockchain transaction is sent.';
const DESCRIPTION =
  'Play the first level in your browser. The Solidity prototype has been tested locally; public testnet play is not available yet.';

const FORBIDDEN_PATH_SUBSTRINGS = [
  '.env', 'node_modules', 'contracts', '.tools', 'cache', 'evidence', '.claude-flow',
  '.vercel', 'test-provider', '.test.', '.map', 'anvil', 'deployments', 'scratch', 'docs',
];
// Matched as whole tokens of the path (split on / . _ -) so hashed asset names are not hit by accident.
const FORBIDDEN_PATH_TOKENS = ['lib', 'out'];

const FORBIDDEN_STRINGS = [
  'local-deployment', 'local-anvil', '127.0.0.1', 'localhost', '8545', 'eth_requestAccounts',
  'window.ethereum', '__nfTestProvider', '__NF_TEST', 'ac0974bec39a17e3', 'mnemonic', 'private key',
  'Private Keys', 'viem', 'Connect wallet', 'Local blockchain', 'Preview Room 02',
];

// Absolute URLs allowed in the bundle: XML namespace identifiers only.
const ALLOWED_URL = /^https?:\/\/www\.w3\.org\/(1999\/xhtml|2000\/svg|1998\/Math\/MathML|1999\/xlink|2000\/xmlns\/|XML\/1998\/namespace)$/;
// Explained exceptions (reported, not violations). Empty until a bundle string is reviewed.
const EXPLAINED_URLS = new Map([
  [
    'https://react.dev/errors/',
    'React 19 production error-decoder prefix inside minified error text (react-dom). Only a string; the app issues no request to it and CSP connect-src is self-only.',
  ],
]);

const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.svg', '.xml', '.webmanifest', '.map']);
const ALLOWED_ASSET_EXT = new Set(['.png', '.js', '.css']);

const violations = [];
const warnings = [];
const violate = (kind, detail) => violations.push({ kind, detail });

const toPosix = (p) => p.split('\\').join('/');

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const st = await lstat(full);
    if (st.isSymbolicLink()) {
      out.push({ rel: toPosix(relative(base, full)), symlink: true });
    } else if (st.isDirectory()) {
      out.push(...(await walk(full, base)));
    } else if (st.isFile()) {
      out.push({ rel: toPosix(relative(base, full)), size: st.size, full });
    } else {
      out.push({ rel: toPosix(relative(base, full)), other: true });
    }
  }
  return out;
}

const dirStat = await stat(STAGING).catch(() => null);
if (!dirStat?.isDirectory()) {
  violate('missing', `staging directory not found: ${STAGING}`);
}

const entries = dirStat?.isDirectory() ? await walk(STAGING) : [];
const files = [];
for (const e of entries) {
  if (e.symlink) violate('symlink', e.rel);
  else if (e.other) violate('unsupported-entry', e.rel);
  else files.push(e);
}

// 1. Exact file set.
const rootAllowed = new Set(['index.html', 'vercel.json']);
for (const f of files) {
  const { rel } = f;
  if (rootAllowed.has(rel)) continue;
  if (rel.startsWith('assets/')) {
    if (!ALLOWED_ASSET_EXT.has(extname(rel))) violate('asset-type', `${rel} (only .png .js .css allowed under assets/)`);
    continue;
  }
  violate('unexpected-file', rel);
}
for (const required of ['index.html', 'vercel.json']) {
  if (!files.some((f) => f.rel === required)) violate('missing-file', required);
}
const assetJs = files.filter((f) => f.rel.startsWith('assets/') && extname(f.rel) === '.js');
const assetCss = files.filter((f) => f.rel.startsWith('assets/') && extname(f.rel) === '.css');
if (assetJs.length === 0) violate('missing-file', 'assets/*.js (no script bundle)');
if (assetCss.length === 0) violate('missing-file', 'assets/*.css (no stylesheet)');

// 2. Forbidden path fragments.
for (const f of files) {
  const lower = f.rel.toLowerCase();
  for (const frag of FORBIDDEN_PATH_SUBSTRINGS) {
    if (lower.includes(frag)) violate('forbidden-path', `${f.rel} contains "${frag}"`);
  }
  const tokens = lower.split(/[/._-]+/);
  for (const tok of FORBIDDEN_PATH_TOKENS) {
    if (tokens.includes(tok)) violate('forbidden-path', `${f.rel} has path token "${tok}"`);
  }
}

// 3. vercel.json must be exactly the template.
const stagedVercel = files.find((f) => f.rel === 'vercel.json');
if (stagedVercel) {
  const a = await readFile(stagedVercel.full);
  const b = await readFile(TEMPLATE);
  if (!a.equals(b)) violate('vercel-json', 'staged vercel.json differs from scripts/public/vercel.json.template');
}

// 4. Text scan, URL scan, notice/description presence.
const textFiles = files.filter((f) => TEXT_EXT.has(extname(f.rel)));
const urlHits = new Map(); // url -> Set(files)
const forbiddenHits = [];
const found = { notice: [], description: [] };
for (const f of textFiles) {
  const text = await readFile(f.full, 'utf8');
  const lower = text.toLowerCase();
  for (const needle of FORBIDDEN_STRINGS) {
    let idx = lower.indexOf(needle.toLowerCase());
    while (idx !== -1) {
      forbiddenHits.push({ file: f.rel, needle, context: text.slice(Math.max(0, idx - 40), idx + needle.length + 40) });
      idx = lower.indexOf(needle.toLowerCase(), idx + 1);
    }
  }
  for (const m of text.matchAll(/https?:\/\/[^\s"'`<>\\)]+/g)) {
    const url = m[0].replace(/[.,;:]+$/, '');
    if (!urlHits.has(url)) urlHits.set(url, new Set());
    urlHits.get(url).add(f.rel);
  }
  if (text.includes(NOTICE)) found.notice.push(f.rel);
  if (text.includes(DESCRIPTION)) found.description.push(f.rel);
}
for (const h of forbiddenHits) violate('forbidden-string', `"${h.needle}" in ${h.file}: ...${h.context}...`);

const urls = [];
for (const [url, where] of [...urlHits.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const entry = { url, files: [...where].sort() };
  if (ALLOWED_URL.test(url)) entry.status = 'allowed-namespace';
  else if (EXPLAINED_URLS.has(url)) {
    entry.status = 'explained';
    entry.explanation = EXPLAINED_URLS.get(url);
  } else {
    entry.status = 'violation';
    violate('external-url', `${url} in ${entry.files.join(', ')}`);
  }
  urls.push(entry);
}

if (found.notice.length === 0) violate('missing-text', `notice not found: "${NOTICE}"`);
if (found.description.length === 0) violate('missing-text', `description sentence not found: "${DESCRIPTION}"`);

// 5. Manifest, if present, must match the staged files.
const manifestStat = await stat(MANIFEST).catch(() => null);
let manifestCheck = 'absent';
if (manifestStat) {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const mismatches = [];
  const byPath = new Map(manifest.files.map((x) => [x.path, x]));
  for (const f of files) {
    const buf = await readFile(f.full);
    const m = byPath.get(f.rel);
    if (!m) mismatches.push(`not in manifest: ${f.rel}`);
    else if (m.sha256 !== createHash('sha256').update(buf).digest('hex') || m.size !== buf.length) {
      mismatches.push(`changed since staging: ${f.rel}`);
    }
  }
  for (const p of byPath.keys()) if (!files.some((f) => f.rel === p)) mismatches.push(`missing from staging: ${p}`);
  for (const m of mismatches) violate('manifest', m);
  manifestCheck = mismatches.length ? 'mismatch' : 'match';
} else {
  warnings.push('manifest not present; manifest check skipped');
}

const totalBytes = files.reduce((s, f) => s + f.size, 0);
const exit = violations.length ? 1 : 0;
const result = {
  verifiedAt: new Date().toISOString(),
  stagingDir: toPosix(relative(ROOT, STAGING)),
  files: files.map((f) => ({ path: f.rel, size: f.size })).sort((a, b) => a.path.localeCompare(b.path)),
  fileCount: files.length,
  totalBytes,
  notice: { text: NOTICE, foundIn: found.notice },
  description: { text: DESCRIPTION, foundIn: found.description },
  urls,
  manifestCheck,
  warnings,
  violations,
  exit,
};

const lines = [
  `public staging verification ${result.verifiedAt}`,
  `dir: ${result.stagingDir}`,
  `files: ${result.fileCount}, total bytes: ${totalBytes}`,
  ...result.files.map((f) => `  ${f.size.toString().padStart(9)}  ${f.path}`),
  `notice found in: ${found.notice.join(', ') || '(none)'}`,
  `description found in: ${found.description.join(', ') || '(none)'}`,
  urls.length === 0 ? 'absolute URLs: (none)' : `absolute URLs: ${urls.length}`,
  ...urls.map((u) => `  [${u.status}] ${u.url}  <- ${u.files.join(', ')}`),
  `manifest: ${manifestCheck}`,
  ...warnings.map((w) => `WARN ${w}`),
  ...violations.map((v) => `VIOLATION [${v.kind}] ${v.detail}`),
  violations.length ? `RESULT: ${violations.length} violation(s)` : 'RESULT: clean',
  `EXIT ${exit}`,
];

await mkdir(EVIDENCE_DIR, { recursive: true });
await writeFile(join(EVIDENCE_DIR, 'staging-verification.json'), JSON.stringify(result, null, 2) + '\n');
await writeFile(join(EVIDENCE_DIR, 'staging-verification.log'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exitCode = exit;
