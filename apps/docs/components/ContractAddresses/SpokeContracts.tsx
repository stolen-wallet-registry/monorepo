import { allNetworks, type SpokeNetworkConfig } from '@swr/chains';

import { SpokeTable } from './SpokeTable';
import { LocalDevNote } from './LocalDevNote';

export function SpokeContracts() {
  const deployedSpokes = allNetworks.filter(
    (n): n is SpokeNetworkConfig => n.role === 'spoke' && !n.isLocal && n.spokeContracts !== null
  );

  const localSpokes = allNetworks.filter(
    (n): n is SpokeNetworkConfig => n.role === 'spoke' && n.isLocal && n.spokeContracts !== null
  );

  return (
    <>
      {deployedSpokes.length > 0 ? (
        <SpokeTable spokes={deployedSpokes} />
      ) : (
        <p>
          <em>No testnet or mainnet spoke deployments yet.</em>
        </p>
      )}
      {localSpokes.length > 0 && (
        <>
          <LocalDevNote />
          <SpokeTable spokes={localSpokes} />
        </>
      )}
    </>
  );
}
