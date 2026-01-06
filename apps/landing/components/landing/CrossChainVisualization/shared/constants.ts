// Animation timing - sequential phases with pause
// Each beam animates for BEAM_DURATION, then waits until the cycle restarts
export const BEAM_DURATION = 2; // Each beam animation duration
export const PHASE_GAP = 0.5; // Gap between phases
export const CYCLE_PAUSE = 2.5; // Pause before restart

// Phase timing (sequential, not overlapping)
export const PHASE_1_START = 0; // Networks → Bridges
export const PHASE_1_END = BEAM_DURATION; // 2s

export const PHASE_2_START = PHASE_1_END + PHASE_GAP; // 2.5s - Bridges → Hub
export const PHASE_2_END = PHASE_2_START + BEAM_DURATION; // 4.5s

export const PHASE_3_START = PHASE_2_END + PHASE_GAP; // 5s - Hub → ALL Consumers (simultaneous)
export const PHASE_3_END = PHASE_3_START + BEAM_DURATION; // 7s

// Total cycle = animation time + pause
export const TOTAL_CYCLE = PHASE_3_END + CYCLE_PAUSE; // 9.5s

// Helper: calculate repeatDelay so all beams restart together
export const getRepeatDelay = (phaseStart: number) => TOTAL_CYCLE - phaseStart - BEAM_DURATION;

// CAIP-10 emission appears when data reaches the hub
export const EMIT_DELAY = PHASE_2_END; // When beam reaches hub (4.5s)

// Chain color and icon mapping for CAIP emissions
// Dark mode uses higher opacity backgrounds and lighter text colors for visibility
export const CHAIN_CONFIG: Record<string, { bg: string; text: string; icon: string }> = {
  'eip155:1': {
    bg: 'bg-[#627eea]/10 dark:bg-[#627eea]/25',
    text: 'text-[#627eea] dark:text-[#8b9eff]',
    icon: '⟠',
  }, // Ethereum
  'eip155:8453': {
    bg: 'bg-[#0052ff]/10 dark:bg-[#0052ff]/25',
    text: 'text-[#0052ff] dark:text-[#5c9aff]',
    icon: '🔵',
  }, // Base
  'eip155:10': {
    bg: 'bg-[#ff0420]/10 dark:bg-[#ff0420]/25',
    text: 'text-[#ff0420] dark:text-[#ff5c6a]',
    icon: '🔴',
  }, // Optimism
  'eip155:42161': {
    bg: 'bg-[#28a0f0]/10 dark:bg-[#28a0f0]/25',
    text: 'text-[#28a0f0] dark:text-[#6cc4ff]',
    icon: '🔷',
  }, // Arbitrum
  'eip155:43114': {
    bg: 'bg-[#e84142]/10 dark:bg-[#e84142]/25',
    text: 'text-[#e84142] dark:text-[#ff7a7b]',
    icon: '🔺',
  }, // Avalanche
  'eip155:56': {
    bg: 'bg-[#f0b90b]/10 dark:bg-[#f0b90b]/25',
    text: 'text-[#f0b90b] dark:text-[#ffd54f]',
    icon: '🟡',
  }, // BNB
  solana: {
    bg: 'bg-[#9945ff]/10 dark:bg-[#9945ff]/25',
    text: 'text-[#9945ff] dark:text-[#b980ff]',
    icon: '◎',
  }, // Solana
  bip122: {
    bg: 'bg-[#f7931a]/10 dark:bg-[#f7931a]/25',
    text: 'text-[#f7931a] dark:text-[#ffb54c]',
    icon: '₿',
  }, // Bitcoin
  cosmos: {
    bg: 'bg-[#2e3148]/10 dark:bg-[#6f7390]/25',
    text: 'text-[#6f7390] dark:text-[#a8adc0]',
    icon: '⚛',
  }, // Cosmos
};

// Get chain config (color + icon) from CAIP address
export function getChainConfig(caipAddress: string): { bg: string; text: string; icon: string } {
  const parts = caipAddress.split(':');
  if (parts.length >= 2) {
    // Try exact match first (namespace:chainId)
    const key = `${parts[0]}:${parts[1]}`;
    if (CHAIN_CONFIG[key]) return CHAIN_CONFIG[key];
    // Try namespace only (for bip122, cosmos, solana)
    if (CHAIN_CONFIG[parts[0]]) return CHAIN_CONFIG[parts[0]];
  }
  // Default
  return { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', icon: '📍' };
}

// Full CAIP-10 address examples (accounts) - valid format with checksummed addresses
export const CAIP10_ADDRESSES = [
  'eip155:1:0x742d35Cc6634C0532925a3b844Bc454e4438f44e', // Ethereum (42 chars)
  'eip155:8453:0x1a2b3c4d5e6f7890abcdef1234567890abcdef12', // Base
  'eip155:10:0x9f8e7d6c5b4a3210fedcba0987654321fedcba09', // Optimism
  'eip155:43114:0x7d6c5b4a3210fedcba0987654321fedcba098765', // Avalanche (valid hex)
  'eip155:56:0x890abcdef1234567890abcdef1234567890abcdef', // BNB Chain (valid hex)
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7S3P4HxJpyyigGzodYwHtCxZyUQe9JiBMHyRWXArAaKv', // Solana
  'bip122:000000000019d6689c085ae165831e93:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Bitcoin
  'cosmos:cosmoshub-4:cosmos1vk8e95f0f3z5yv0ew3w9q4z6d8y7x3p2s4m1n0', // Cosmos
];

// CAIP-220 transaction identifiers (chain:txHash format)
export const CAIP220_TRANSACTIONS = [
  'eip155:1:0xabc123def456789012345678901234567890abcdef1234567890abcdef123456',
  'eip155:8453:0x789xyz012345678901234567890123456789012345678901234567890abcdef',
];

// Combined examples with type indicator
export const CAIP_EXAMPLES = [
  ...CAIP10_ADDRESSES.map((addr) => ({ value: addr, type: 'address' as const })),
  ...CAIP220_TRANSACTIONS.map((tx) => ({ value: tx, type: 'transaction' as const })),
];

// Truncate CAIP address to reasonable length (show namespace:chainId + truncated address)
export function truncateCaip(value: string): string {
  // Format: namespace:chainId:address
  const parts = value.split(':');
  if (parts.length < 3) return value;

  const namespace = parts[0];
  let chainId = parts[1];
  const address = parts.slice(2).join(':');

  // Truncate very long chain IDs (Bitcoin genesis hash, Solana genesis)
  if (chainId.length > 12) {
    chainId = `${chainId.slice(0, 6)}...${chainId.slice(-4)}`;
  }

  // Truncate address more aggressively for compact display
  const truncatedAddress =
    address.length > 12 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;

  return `${namespace}:${chainId}:${truncatedAddress}`;
}
