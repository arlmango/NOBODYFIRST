// Stage-3 browser E2E driver (Local chain mode). Usage: node scripts/chain/e2e/run.mjs [S1 S1b ...]
// Preconditions: Anvil on 127.0.0.1:8545 deployed by local-chain.mjs; vite preview on 127.0.0.1:4173.
// Results: evidence/stage3/e2e-results.json (merged per scenario id).
import { ensureDirs, launchBrowser, log, resetRunArtifacts, saveResult } from './lib.mjs';
import { anvilAccounts, s1, s1b, s2, s3 } from './scenarios-core.mjs';
import { s4, s5, s6, s7, s8 } from './scenarios-errors.mjs';
import { s9, s10 } from './scenarios-static.mjs';
import { s11, s12, s12b } from './scenarios-round2.mjs';

const ALL = ['S1', 'S1b', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S12b'];

async function main() {
  ensureDirs();
  const requested = process.argv.slice(2);
  if (requested.length === 0) resetRunArtifacts();
  const ids = requested.length ? requested : ALL;
  const accs = anvilAccounts();
  const browser = await launchBrowser();
  const handlers = { S1: (b) => s1(b, accs[1]), S1b: (b) => s1b(b, accs[1]), S2: (b) => s2(b, accs[2]), S3: (b) => s3(b, accs), S4: (b) => s4(b, accs[8]), S5: (b) => s5(b, accs[6]), S6: (b) => s6(b, accs[9]), S7: (b) => s7(b, accs[7]), S8: (b) => s8(b, accs), S9: () => s9(), S10: (b) => s10(b), S11: (b) => s11(b, accs), S12: (b) => s12(b, accs), S12b: (b) => s12b(b, accs) };
  try {
    for (const id of ids) {
      if (!handlers[id]) throw new Error(`unknown scenario ${id}`);
      log(`== ${id}`);
      const startedAt = new Date().toISOString();
      try {
        const r = await handlers[id](browser);
        saveResult(id, { startedAt, ...r });
        log(`== ${id} ${r.status}`);
        if (r.status !== 'PASS') process.exitCode = 1;
      } catch (e) {
        saveResult(id, { startedAt, status: 'FAIL', error: String(e && e.message ? e.message : e), checks: [], observed: {} });
        log(`== ${id} FAIL (exception): ${e && e.message ? e.message : e}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  log(`fatal: ${e.message}`);
  process.exit(1);
});
