import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Local-chain deployment manifest.
 * Served only by the dev and preview servers of the NON-public build (never emitted into a build
 * output), read from disk on every request so a restarted Anvil + redeploy is seen immediately.
 * Written by `scripts/chain/*`. Not registered at all in `--mode public`.
 */
const MANIFEST_URL = '/local-deployment.json';
const MANIFEST_FILE = fileURLToPath(new URL('./contracts/deployments/local-anvil.json', import.meta.url));

function localDeployment(): Plugin {
  const handler = async (
    req: { url?: string },
    res: { statusCode: number; setHeader(k: string, v: string): void; end(b: string): void },
    next: () => void,
  ) => {
    if (!req.url || req.url.split('?')[0] !== MANIFEST_URL) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    try {
      res.statusCode = 200;
      res.end(await readFile(MANIFEST_FILE, 'utf8'));
    } catch {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'local deployment manifest not found' }));
    }
  };
  return {
    name: 'nobody-first-local-deployment',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

const PUBLIC_DESCRIPTION =
  'Play the first level in your browser. The Solidity prototype has been tested locally; public testnet play is not available yet.';

/** Public build only: static description metadata. No external resources, no scripts. */
function publicMeta(): Plugin {
  return {
    name: 'nobody-first-public-meta',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `    <meta name="description" content="${PUBLIC_DESCRIPTION}" />\n  </head>`,
      );
    },
  };
}

/**
 * `vite build` (mode production) → ./dist: development build with the optional Local chain mode.
 * `vite build --mode public` → ./dist-public: the public demo. `__PUBLIC_BUILD__` is a compile-time
 * constant, so the Local chain code path (and viem) is eliminated from the public bundle.
 */
export default defineConfig(({ mode }) => {
  const isPublic = mode === 'public';
  return {
    plugins: [react(), isPublic ? publicMeta() : localDeployment()],
    define: { __PUBLIC_BUILD__: JSON.stringify(isPublic) },
    build: { outDir: isPublic ? 'dist-public' : 'dist', sourcemap: false },
    server: { host: '127.0.0.1', port: 5173 },
    preview: { host: '127.0.0.1', port: 4173 },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
