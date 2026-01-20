/**
 * Hook to track cross-chain soulbound mint confirmation.
 *
 * After a spoke chain transaction is confirmed, this hook polls the hub chain
 * to verify the soulbound token was actually minted.
 *
 * Flow:
 * 1. Spoke tx confirms → extract messageId from logs
 * 2. Poll hub chain hasMinted(wallet) or check token balance
 * 3. Returns 'confirmed' when hub shows token minted
 * 4. Returns 'timeout' if max polling time exceeded
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { decodeEventLog } from 'viem';
import {
  spokeSoulboundForwarderAbi,
  walletSoulboundAbi,
  supportSoulboundAbi,
} from '@/lib/contracts/abis';
import { getWalletSoulboundAddress, getSupportSoulboundAddress } from '@/lib/contracts/addresses';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { getBridgeMessageByIdUrl } from '@swr/chains';
import { logger } from '@/lib/logger';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

export type SoulboundConfirmationStatus =
  | 'idle' // Not started
  | 'extracting' // Extracting messageId from receipt
  | 'waiting' // Waiting before polling
  | 'polling' // Actively polling hub chain
  | 'confirmed' // Hub chain shows token minted
  | 'timeout'; // Max polling time exceeded

export interface UseCrossChainSoulboundConfirmationOptions {
  /** The spoke transaction hash */
  spokeHash: Hash | undefined;
  /** The spoke chain ID */
  spokeChainId: number | undefined;
  /** Type of mint: 'wallet' or 'support' */
  mintType: 'wallet' | 'support';
  /** Wallet address (for wallet mint or supporter address) */
  wallet: Address | undefined;
  /** Whether to start tracking */
  enabled: boolean;
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number;
  /** Max polling duration in ms (default: 180000 = 3 minutes) */
  maxPollingTime?: number;
}

export interface UseCrossChainSoulboundConfirmationResult {
  /** Current status */
  status: SoulboundConfirmationStatus;
  /** Hyperlane message ID (bytes32) */
  messageId: Hex | undefined;
  /** Hyperlane explorer URL */
  explorerUrl: string | undefined;
  /** Whether token is confirmed minted on hub */
  isMintedOnHub: boolean;
  /** Time elapsed since started (ms) */
  elapsedTime: number;
  /** Manually trigger refresh */
  refresh: () => void;
  /** Reset state */
  reset: () => void;
}

const DEFAULT_POLL_INTERVAL = 3000; // 3 seconds
const DEFAULT_MAX_POLLING_TIME = 180000; // 3 minutes
const INITIAL_DELAY = 2000; // 2 second delay before polling starts

export function useCrossChainSoulboundConfirmation({
  spokeHash,
  spokeChainId,
  mintType,
  wallet,
  enabled,
  pollInterval = DEFAULT_POLL_INTERVAL,
  maxPollingTime = DEFAULT_MAX_POLLING_TIME,
}: UseCrossChainSoulboundConfirmationOptions): UseCrossChainSoulboundConfirmationResult {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [messageId, setMessageId] = useState<Hex | undefined>(undefined);
  const [pollingActive, setPollingActive] = useState(true);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLoggedConfirmationRef = useRef(false);
  const startingBalanceRef = useRef<bigint | null>(null);
  const prevRunKeyRef = useRef<string | null>(null);

  const hubChainId = getHubChainIdForEnvironment();
  const spokeClient = usePublicClient({ chainId: spokeChainId });

  // Reset state when a new confirmation run begins (different spokeHash or wallet)
  const runKey = `${spokeHash ?? ''}-${wallet ?? ''}`;
  useEffect(() => {
    if (runKey !== prevRunKeyRef.current && enabled) {
      // New run - reset all state
      prevRunKeyRef.current = runKey;
      setElapsedTime(0);
      setMessageId(undefined);
      setPollingActive(true);
      hasLoggedConfirmationRef.current = false;
      startingBalanceRef.current = null;
      startTimeRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [runKey, enabled]);

  // Get contract addresses on hub
  let hubContractAddress: Address | undefined;
  try {
    hubContractAddress =
      mintType === 'wallet'
        ? getWalletSoulboundAddress(hubChainId)
        : getSupportSoulboundAddress(hubChainId);
  } catch {
    hubContractAddress = undefined;
  }

  // Extract messageId from spoke transaction receipt
  useEffect(() => {
    if (!enabled || !spokeHash || !spokeClient || messageId) return;

    const extractMessageId = async () => {
      try {
        const receipt = await spokeClient.getTransactionReceipt({ hash: spokeHash });

        // Find MintRequestForwarded event
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: spokeSoulboundForwarderAbi,
              data: log.data,
              topics: log.topics,
            });

            if (decoded.eventName === 'MintRequestForwarded') {
              const msgId = (decoded.args as { messageId: Hex }).messageId;
              setMessageId(msgId);
              logger.contract.info('Extracted Hyperlane messageId from receipt', {
                spokeHash,
                messageId: msgId,
              });
              return;
            }
          } catch {
            // Not the event we're looking for
          }
        }

        logger.contract.warn('MintRequestForwarded event not found in receipt', { spokeHash });
      } catch (err) {
        logger.contract.error('Failed to extract messageId from receipt', {
          spokeHash,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void extractMessageId();
  }, [enabled, spokeHash, spokeClient, messageId]);

  // Calculate Hyperlane explorer URL
  const explorerUrl = useMemo(() => {
    if (!messageId) return undefined;
    try {
      return getBridgeMessageByIdUrl(messageId) ?? undefined;
    } catch {
      return undefined;
    }
  }, [messageId]);

  // Determine if we should poll (stops after confirmation/timeout)
  const shouldPoll =
    enabled && pollingActive && elapsedTime >= INITIAL_DELAY && elapsedTime < maxPollingTime;

  // Query hub chain for mint status
  // For wallet mints: use hasMinted(wallet) - one per wallet
  // For support mints: use balanceOf(wallet) > starting balance - multiple per wallet allowed
  const {
    data: mintQueryResult,
    refetch,
    isError: isQueryError,
  } = useReadContract({
    address: hubContractAddress,
    abi: mintType === 'wallet' ? walletSoulboundAbi : supportSoulboundAbi,
    functionName: mintType === 'wallet' ? 'hasMinted' : 'balanceOf',
    args: wallet ? [wallet] : undefined,
    chainId: hubChainId,
    query: {
      enabled: enabled && pollingActive && !!wallet && !!hubContractAddress,
      refetchInterval: shouldPoll ? pollInterval : false,
      staleTime: 1000,
    },
  });

  // Record starting balance for support mints (to detect new mints vs existing tokens)
  useEffect(() => {
    if (
      mintType === 'support' &&
      mintQueryResult !== undefined &&
      startingBalanceRef.current === null
    ) {
      startingBalanceRef.current = mintQueryResult as bigint;
    }
  }, [mintType, mintQueryResult]);

  // Normalize result: hasMinted returns boolean, balanceOf compares to starting balance
  const isMintedOnHub = useMemo(() => {
    if (mintQueryResult === undefined) return false;
    if (mintType === 'wallet') {
      return mintQueryResult as boolean;
    }
    // Support: current balance > starting balance means new token minted
    const currentBalance = mintQueryResult as bigint;
    const startingBalance = startingBalanceRef.current ?? 0n;
    return currentBalance > startingBalance;
  }, [mintQueryResult, mintType]);

  // Derive status
  const status: SoulboundConfirmationStatus = useMemo(() => {
    if (!enabled) return 'idle';
    if (!messageId && spokeHash) return 'extracting';
    if (isMintedOnHub === true) return 'confirmed';
    if (elapsedTime >= maxPollingTime) return 'timeout';
    if (elapsedTime < INITIAL_DELAY) return 'waiting';
    return 'polling';
  }, [enabled, messageId, spokeHash, isMintedOnHub, elapsedTime, maxPollingTime]);

  // Start elapsed time tracking
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
      queueMicrotask(() => setElapsedTime(0));
      return;
    }

    startTimeRef.current = Date.now();

    logger.contract.info('Starting cross-chain soulbound confirmation polling', {
      mintType,
      wallet,
      spokeHash,
      hubChainId,
    });

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Date.now() - startTimeRef.current);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
    };
  }, [enabled, mintType, wallet, spokeHash, hubChainId]);

  // Log status transitions and stop polling when done
  useEffect(() => {
    if (status === 'confirmed' && !hasLoggedConfirmationRef.current) {
      hasLoggedConfirmationRef.current = true;
      setPollingActive(false);
      // Stop the elapsed time interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      logger.contract.info('Cross-chain soulbound mint confirmed!', {
        mintType,
        wallet,
        messageId,
        elapsedTime,
      });
    }
    if (status === 'timeout') {
      setPollingActive(false);
      // Stop the elapsed time interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      logger.contract.warn('Cross-chain soulbound confirmation timeout', {
        mintType,
        wallet,
        elapsedTime,
      });
    }
  }, [status, mintType, wallet, messageId, elapsedTime]);

  // Log query errors
  useEffect(() => {
    if (status === 'polling' && isQueryError) {
      logger.contract.error('Cross-chain soulbound confirmation query error', {
        mintType,
        wallet,
        hubChainId,
      });
    }
  }, [status, isQueryError, mintType, wallet, hubChainId]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const reset = useCallback(() => {
    startTimeRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setElapsedTime(0);
    setMessageId(undefined);
    hasLoggedConfirmationRef.current = false;
    setPollingActive(true);
    startingBalanceRef.current = null;
  }, []);

  return {
    status,
    messageId,
    explorerUrl,
    isMintedOnHub,
    elapsedTime,
    refresh,
    reset,
  };
}
