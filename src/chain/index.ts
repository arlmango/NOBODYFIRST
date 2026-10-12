// Local chain (Anvil) mode: public entry point.
// createChainLevelController() wires the real manifest check, viem clients, wallet and storage.

import { createReadClient, createWalletGateway, getInjectedProvider } from './clients';
import { createController } from './controller';
import { fetchManifest, verifyDeployment } from './deployment';
import { createChainGateway } from './game';
import { browserStorage, createPendingStore } from './pending';
import type { ControllerEnv, DeploymentResult } from './ports';
import type { FetchLike } from './deployment';
import type { ChainLevelController } from './types';

const fetchFn: FetchLike = (url, init) => fetch(url, init);

export * from './types';
export { describeContractError, describePlanRejection, classifyError, decodeRevertData } from './errors';

export function createChainLevelController(): ChainLevelController {
  const provider = getInjectedProvider();
  const env: ControllerEnv = {
    async loadDeployment(): Promise<DeploymentResult> {
      const parsed = await fetchManifest(fetchFn);
      if (!parsed.ok) return { check: parsed, gateway: null };
      const client = createReadClient(parsed.manifest);
      const check = await verifyDeployment(parsed.manifest, client);
      if (!check.ok) return { check, gateway: null };
      return { check, gateway: createChainGateway(check.manifest, client, provider, fetchFn) };
    },
    wallet: provider ? createWalletGateway(provider) : null,
    pending: createPendingStore(browserStorage()),
  };
  return createController(env);
}
