import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRegistryStatus } from './useRegistryStatus';
import type { Address } from '@/lib/types/ethereum';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useChainId: () => 31337, // localhost
  usePublicClient: () => ({
    multicall: vi.fn(),
  }),
}));

// Mock contract addresses with controllable behavior
let mockContractAddress: string | null = '0x5fbdb2315678afecb367f032d93f642f64180aa3';
vi.mock('@swr/chains', async () => {
  const actual = await vi.importActual('@swr/chains');
  return {
    ...actual,
    getWalletRegistryAddress: () => {
      if (mockContractAddress === null) {
        throw new Error('No contract for this chain');
      }
      return mockContractAddress;
    },
  };
});

// Mock the contract query function
vi.mock('@/lib/contracts/query', async () => {
  const actual = await vi.importActual('@/lib/contracts/query');
  return {
    ...actual,
    queryRegistryStatus: vi.fn(),
  };
});

// Import the mocked function to control its behavior
import { queryRegistryStatus } from '@/lib/contracts/query';
const mockQueryRegistryStatus = vi.mocked(queryRegistryStatus);

// Create a wrapper with QueryClient for testing hooks that use useQuery
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useRegistryStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset controllable mock to default
    mockContractAddress = '0x5fbdb2315678afecb367f032d93f642f64180aa3';
  });

  const sampleAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address;

  it('returns loading state initially', async () => {
    // Mock a slow response
    mockQueryRegistryStatus.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                isRegistered: false,
                isPending: false,
                registrationData: null,
                acknowledgementData: null,
              }),
            100
          )
        )
    );

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isRegistered).toBe(false);
    expect(result.current.isPending).toBe(false);
  });

  it('returns registered status when wallet is registered', async () => {
    mockQueryRegistryStatus.mockResolvedValue({
      isRegistered: true,
      isPending: false,
      registrationData: {
        reportedChainId: '0x0000000000000000000000000000000000000000000000000000000000000000',
        sourceChainId: '0x0000000000000000000000000000000000000000000000000000000000000000',
        messageId: '0x0000000000000000000000000000000000000000000000000000000000000000',
        registeredAt: 12345678n,
        incidentTimestamp: 0n,
        bridgeId: 0,
        isSponsored: false,
      },
      acknowledgementData: null,
    });

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isRegistered).toBe(true);
    expect(result.current.isPending).toBe(false);
    expect(result.current.registrationData).toEqual({
      reportedChainId: '0x0000000000000000000000000000000000000000000000000000000000000000',
      sourceChainId: '0x0000000000000000000000000000000000000000000000000000000000000000',
      messageId: '0x0000000000000000000000000000000000000000000000000000000000000000',
      registeredAt: 12345678n,
      incidentTimestamp: 0n,
      bridgeId: 0,
      isSponsored: false,
    });
  });

  it('returns pending status when wallet has acknowledgement', async () => {
    mockQueryRegistryStatus.mockResolvedValue({
      isRegistered: false,
      isPending: true,
      registrationData: null,
      acknowledgementData: {
        trustedForwarder: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as Address,
        startBlock: 100n,
        expiryBlock: 200n,
      },
    });

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isRegistered).toBe(false);
    expect(result.current.isPending).toBe(true);
    expect(result.current.acknowledgementData).toEqual({
      trustedForwarder: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      startBlock: 100n,
      expiryBlock: 200n,
    });
  });

  it('returns not found status when wallet is clean', async () => {
    mockQueryRegistryStatus.mockResolvedValue({
      isRegistered: false,
      isPending: false,
      registrationData: null,
      acknowledgementData: null,
    });

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isRegistered).toBe(false);
    expect(result.current.isPending).toBe(false);
    expect(result.current.registrationData).toBeNull();
    expect(result.current.acknowledgementData).toBeNull();
  });

  it('skips query when address is undefined', async () => {
    const { result } = renderHook(() => useRegistryStatus({ address: undefined }), {
      wrapper: createWrapper(),
    });

    // Should not be loading when disabled
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRegistered).toBe(false);
    expect(result.current.isPending).toBe(false);

    // Verify queryRegistryStatus was never called
    expect(mockQueryRegistryStatus).not.toHaveBeenCalled();
  });

  it('returns error state when query fails', async () => {
    const testError = new Error('Contract read failed');
    mockQueryRegistryStatus.mockRejectedValue(testError);

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBe(testError);
  });

  it('provides refetch function', async () => {
    mockQueryRegistryStatus.mockResolvedValue({
      isRegistered: false,
      isPending: false,
      registrationData: null,
      acknowledgementData: null,
    });

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear mock to track refetch call
    mockQueryRegistryStatus.mockClear();

    // Call refetch
    result.current.refetch();

    // Wait for refetch to complete
    await waitFor(() => {
      expect(mockQueryRegistryStatus).toHaveBeenCalled();
    });
  });

  it('handles missing contract address gracefully', () => {
    // Set mock to throw (simulates unsupported chain)
    mockContractAddress = null;

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }), {
      wrapper: createWrapper(),
    });

    // Should not be loading when disabled (no contract address)
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRegistered).toBe(false);
    expect(result.current.isPending).toBe(false);

    // Verify queryRegistryStatus was never called (query disabled)
    expect(mockQueryRegistryStatus).not.toHaveBeenCalled();
  });
});
