import { allNetworks, type HubNetworkConfig } from '@swr/chains';

import { HubTable } from './HubTable';
import { LocalDevNote } from './LocalDevNote';

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
          <LocalDevNote />
          <HubTable hubs={localHubs} />
        </>
      )}
    </>
  );
}
