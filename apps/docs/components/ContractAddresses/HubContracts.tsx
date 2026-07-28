import { allNetworks, type HubNetworkConfig } from '@swr/chains';

import { HubTable } from './HubTable';

export function HubContracts() {
  const deployedHubs = allNetworks.filter(
    (n): n is HubNetworkConfig => n.role === 'hub' && !n.isLocal && n.hubContracts !== null
  );

  const localHubs = allNetworks.filter(
    (n): n is HubNetworkConfig => n.role === 'hub' && n.isLocal && n.hubContracts !== null
  );

  return (
    <>
      {deployedHubs.length > 0 ? (
        <HubTable hubs={deployedHubs} />
      ) : (
        <p>
          <em>No testnet or mainnet hub deployments yet.</em>
        </p>
      )}
      {localHubs.length > 0 && (
        <>
          <h4>Local Development</h4>
          <p>
            These addresses are from <code>pnpm deploy:crosschain</code> using deterministic Anvil
            deployer nonces. Click any address to copy.
          </p>
          <HubTable hubs={localHubs} />
        </>
      )}
    </>
  );
}
