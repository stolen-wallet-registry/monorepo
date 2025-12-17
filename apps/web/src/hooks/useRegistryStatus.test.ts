import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRegistryStatus } from './useRegistryStatus';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useChainId: () => 31337, // localhost
  useReadContracts: vi.fn(),
}));

// Mock contract addresses
vi.mock('@/lib/contracts/addresses', () => ({
  getContractAddress: () => '0x5fbdb2315678afecb367f032d93f642f64180aa3',
}));

// Import the mocked useReadContracts to control its behavior
import { useReadContracts } from 'wagmi';
const mockUseReadContracts = vi.mocked(useReadContracts);

describe('useRegistryStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`;

  it('returns loading state initially', () => {
    mockUseReadContracts.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useReadContracts>);

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isRegistered).toBe(false);
    expect(result.current.isPending).toBe(false);
  });

  it('returns registered status when wallet is registered', async () => {
    mockUseReadContracts.mockReturnValue({
      data: [
        { status: 'success', result: true }, // isRegistered
        { status: 'success', result: false }, // isPending
        {
          status: 'success',
          result: {
            registeredAt: 12345678n,
            registeredBy: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            isSponsored: false,
          },
        }, // getRegistration
        { status: 'success', result: { trustedForwarder: '0x0', startBlock: 0n, expiryBlock: 0n } }, // getAcknowledgement
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useReadContracts>);

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isRegistered).toBe(true);
    expect(result.current.isPending).toBe(false);
    expect(result.current.registrationData).toEqual({
      registeredAt: 12345678n,
      registeredBy: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
      isSponsored: false,
    });
  });

  it('returns pending status when wallet has acknowledgement', async () => {
    mockUseReadContracts.mockReturnValue({
      data: [
        { status: 'success', result: false }, // isRegistered
        { status: 'success', result: true }, // isPending
        {
          status: 'success',
          result: { registeredAt: 0n, registeredBy: '0x0', isSponsored: false },
        }, // getRegistration
        {
          status: 'success',
          result: {
            trustedForwarder: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            startBlock: 100n,
            expiryBlock: 200n,
          },
        }, // getAcknowledgement
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useReadContracts>);

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }));

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
    mockUseReadContracts.mockReturnValue({
      data: [
        { status: 'success', result: false }, // isRegistered
        { status: 'success', result: false }, // isPending
        {
          status: 'success',
          result: { registeredAt: 0n, registeredBy: '0x0', isSponsored: false },
        }, // getRegistration
        { status: 'success', result: { trustedForwarder: '0x0', startBlock: 0n, expiryBlock: 0n } }, // getAcknowledgement
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useReadContracts>);

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isRegistered).toBe(false);
    expect(result.current.isPending).toBe(false);
    expect(result.current.registrationData).toBeNull();
    expect(result.current.acknowledgementData).toBeNull();
  });

  it('skips query when address is undefined', () => {
    mockUseReadContracts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useReadContracts>);

    const { result } = renderHook(() => useRegistryStatus({ address: undefined }));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRegistered).toBe(false);
    expect(result.current.isPending).toBe(false);

    // Verify query was configured with enabled: false
    expect(mockUseReadContracts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          enabled: false,
        }),
      })
    );
  });

  it('returns error state when query fails', async () => {
    const testError = new Error('Contract read failed');
    mockUseReadContracts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: testError,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useReadContracts>);

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }));

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(testError);
  });

  it('provides refetch function', () => {
    const mockRefetch = vi.fn();
    mockUseReadContracts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as ReturnType<typeof useReadContracts>);

    const { result } = renderHook(() => useRegistryStatus({ address: sampleAddress }));

    result.current.refetch();
    expect(mockRefetch).toHaveBeenCalled();
  });
});
