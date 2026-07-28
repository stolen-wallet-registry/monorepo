import { allNetworks, type SpokeNetworkConfig } from '@swr/chains';

import { SpokeTable } from './SpokeTable';

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
          <h4>Local Development</h4>
          <p>
            These addresses are from <code>pnpm deploy:crosschain</code> using deterministic Anvil
            deployer nonces. Click any address to copy.
          </p>
          <SpokeTable spokes={localSpokes} />
        </>
      )}
    </>
  );
}
