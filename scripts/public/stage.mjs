// Public demo staging: build (npm run build:public), copy ONLY dist-public/ + vercel.json into
// build/public-staging/, write build/public-staging.manifest.json (outside the staging dir), then
// verify the staging dir with verify-staging.mjs. Exits non-zero on any failure.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist-public');
const STAGING = join(ROOT, 'build', 'public-staging');
const MANIFEST = join(ROOT, 'build', 'public-staging.manifest.json');
const TEMPLATE = join(ROOT, 'scripts', 'public', 'vercel.json.template');
const VERIFY = join(ROOT, 'scripts', 'public', 'verify-staging.mjs');
const BUILD_COMMAND = 'npm run build:public';

const fail = (msg) => {
  console.error(`STAGE FAILED: ${msg}`);
  process.exit(1);
};

const toPosix = (p) => p.split('\\').join('/');

/** Recursively list files under dir (relative POSIX paths, sorted). Symlinks are rejected. */
async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const st = await lstat(full);
    if (st.isSymbolicLink()) fail(`symbolic link refused: ${toPosix(relative(ROOT, full))}`);
    if (st.isDirectory()) out.push(...(await listFiles(full, base)));
    else if (st.isFile()) out.push(toPosix(relative(base, full)));
    else fail(`unsupported entry: ${toPosix(relative(ROOT, full))}`);
  }
  return out.sort();
}

/** Copy only regular files (directories are created as needed). */
async function copyFilesOnly(srcDir, dstDir) {
  for (const rel of await listFiles(srcDir)) {
    const dst = join(dstDir, rel);
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(join(srcDir, rel), dst);
  }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// 1. Build. Abort on failure.
console.log(`> ${BUILD_COMMAND}`);
const build = spawnSync('npm', ['run', 'build:public'], { cwd: ROOT, stdio: 'inherit' });
if (build.error) fail(`could not start build: ${build.error.message}`);
if (build.status !== 0) fail(`build exited with ${build.status} (aborting; staging not touched)`);

const distStat = await stat(DIST).catch(() => null);
if (!distStat?.isDirectory()) fail('dist-public/ was not produced');

// 2. Wipe and recreate staging; copy only dist-public contents + vercel.json.
await rm(STAGING, { recursive: true, force: true });
await mkdir(STAGING, { recursive: true });
await copyFilesOnly(DIST, STAGING);
await copyFile(TEMPLATE, join(STAGING, 'vercel.json'));

// 3. Manifest (outside the staging dir).
const stagedFiles = await listFiles(STAGING);
const files = [];
let totalBytes = 0;
for (const rel of stagedFiles) {
  const buf = await readFile(join(STAGING, rel));
  files.push({ path: rel, size: buf.length, sha256: sha256(buf) });
  totalBytes += buf.length;
}

// sourceId: sha256 over sorted (relative path + content) of the source inputs.
const sourceRoots = ['src'];
const sourceFiles = [];
for (const d of sourceRoots) sourceFiles.push(...(await listFiles(join(ROOT, d))).map((f) => `${d}/${f}`));
for (const f of [
  'index.html',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
  'scripts/public/vercel.json.template',
]) {
  if (!(await stat(join(ROOT, f)).catch(() => null))) fail(`source input missing: ${f}`);
  sourceFiles.push(f);
}
sourceFiles.sort();
const sourceHash = createHash('sha256');
for (const rel of sourceFiles) {
  sourceHash.update(rel + '\0');
  sourceHash.update(await readFile(join(ROOT, rel)));
  sourceHash.update('\0');
}

const npmVersion = spawnSync('npm', ['-v'], { encoding: 'utf8' }).stdout.trim();
const manifest = {
  generatedAt: new Date().toISOString(),
  command: BUILD_COMMAND,
  buildExitCode: build.status,
  node: process.version,
  npm: npmVersion,
  sourceId: sourceHash.digest('hex'),
  sourceInputs: sourceFiles,
  stagingDir: toPosix(relative(ROOT, STAGING)),
  totalFiles: files.length,
  totalBytes,
  files,
};
await mkdir(dirname(MANIFEST), { recursive: true });
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`staged ${files.length} files, ${totalBytes} bytes -> ${toPosix(relative(ROOT, STAGING))}`);
console.log(`manifest -> ${toPosix(relative(ROOT, MANIFEST))} (sourceId ${manifest.sourceId})`);

// 4. Verify. Non-zero on any violation.
const verify = spawnSync(process.execPath, [VERIFY], { cwd: ROOT, stdio: 'inherit' });
if (verify.status !== 0) fail(`verify-staging exited with ${verify.status}`);
console.log('STAGE OK');
