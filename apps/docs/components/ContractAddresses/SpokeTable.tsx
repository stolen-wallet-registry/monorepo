import { type SpokeNetworkConfig } from '@swr/chains';

import { ContractTable, type ContractDef } from './ContractTable';

const spokeContractDefs: ContractDef<SpokeNetworkConfig>[] = [
  { label: 'Spoke Registry', getter: (s) => s.spokeContracts?.spokeRegistry },
  { label: 'Fee Manager', getter: (s) => s.spokeContracts?.feeManager },
  { label: 'Hyperlane Adapter', getter: (s) => s.spokeContracts?.bridgeAdapters?.hyperlane },
];

export function SpokeTable({ spokes }: { spokes: SpokeNetworkConfig[] }) {
  return (
    <ContractTable
      networks={spokes}
      defs={spokeContractDefs}
      emptyMessage="No spoke deployments found."
    />
  );
}
