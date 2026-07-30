import { type HubNetworkConfig } from '@swr/chains';

import { ContractTable, type ContractDef } from './ContractTable';

const hubContractDefs: ContractDef<HubNetworkConfig>[] = [
  { label: 'Registry Hub', getter: (h) => h.hubContracts?.registryHub },
  { label: 'Wallet Registry', getter: (h) => h.hubContracts?.stolenWalletRegistry },
  { label: 'Transaction Registry', getter: (h) => h.hubContracts?.stolenTransactionRegistry },
  { label: 'Contract Registry', getter: (h) => h.hubContracts?.fraudulentContractRegistry },
  { label: 'Cross-Chain Inbox', getter: (h) => h.hubContracts?.crossChainInbox },
  { label: 'Operator Registry', getter: (h) => h.hubContracts?.operatorRegistry },
  { label: 'Operator Submitter', getter: (h) => h.hubContracts?.operatorSubmitter },
  { label: 'Fee Manager', getter: (h) => h.hubContracts?.feeManager },
  { label: 'Wallet Soulbound', getter: (h) => h.hubContracts?.walletSoulbound },
  { label: 'Support Soulbound', getter: (h) => h.hubContracts?.supportSoulbound },
  { label: 'Soulbound Receiver', getter: (h) => h.hubContracts?.soulboundReceiver },
];

export function HubTable({ hubs }: { hubs: HubNetworkConfig[] }) {
  return (
    <ContractTable
      networks={hubs}
      defs={hubContractDefs}
      emptyMessage="No hub deployments found."
    />
  );
}
