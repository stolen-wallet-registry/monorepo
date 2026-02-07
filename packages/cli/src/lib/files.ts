import { readFile } from 'fs/promises';
import { parse as parseCSV } from 'csv-parse/sync';
import { isAddress, isHash, type Address, type Hex } from 'viem';
import { chainIdToBytes32, caip2ToBytes32 } from './caip.js';

export interface WalletEntry {
  address: Address;
  chainId: Hex;
}

export interface TransactionEntry {
  txHash: Hex;
  chainId: Hex;
}

export interface ContractEntry {
  address: Address;
  chainId: Hex;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE FORMATS
// ═══════════════════════════════════════════════════════════════════════════

interface WalletFileEntry {
  address: string;
  chainId?: string | number; // Optional, defaults to Base
}

interface TransactionFileEntry {
  txHash: string;
  chainId?: string | number;
}

interface ContractFileEntry {
  address: string;
  chainId?: string | number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════════════════

export async function parseWalletFile(
  filePath: string,
  defaultChainId: bigint = 8453n // Base
): Promise<WalletEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  const ext = filePath.split('.').pop()?.toLowerCase();

  let entries: WalletFileEntry[];

  if (ext === 'json') {
    entries = JSON.parse(content);
  } else if (ext === 'csv') {
    entries = parseCSV(content, { columns: true, skip_empty_lines: true });
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  return entries.map((e, i) => {
    if (!isAddress(e.address)) {
      throw new Error(`Invalid address at index ${i}: ${e.address}`);
    }

    const chainId = e.chainId
      ? typeof e.chainId === 'string' && e.chainId.includes(':')
        ? caip2ToBytes32(e.chainId)
        : chainIdToBytes32(BigInt(e.chainId))
      : chainIdToBytes32(defaultChainId);

    return {
      address: e.address as Address,
      chainId,
    };
  });
}

export async function parseTransactionFile(
  filePath: string,
  defaultChainId: bigint = 8453n
): Promise<TransactionEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  const ext = filePath.split('.').pop()?.toLowerCase();

  let entries: TransactionFileEntry[];

  if (ext === 'json') {
    entries = JSON.parse(content);
  } else if (ext === 'csv') {
    entries = parseCSV(content, { columns: true, skip_empty_lines: true });
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  return entries.map((e, i) => {
    // Coerce to string for CSV-parsed values and validate with viem's isHash
    const txHashString = String(e.txHash);
    if (!isHash(txHashString)) {
      throw new Error(`Invalid tx hash at index ${i}: ${e.txHash}`);
    }

    const chainId = e.chainId
      ? typeof e.chainId === 'string' && e.chainId.includes(':')
        ? caip2ToBytes32(e.chainId)
        : chainIdToBytes32(BigInt(e.chainId))
      : chainIdToBytes32(defaultChainId);

    return {
      txHash: txHashString as Hex,
      chainId,
    };
  });
}

export async function parseContractFile(
  filePath: string,
  defaultChainId: bigint = 8453n
): Promise<ContractEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  const ext = filePath.split('.').pop()?.toLowerCase();

  let entries: ContractFileEntry[];

  if (ext === 'json') {
    entries = JSON.parse(content);
  } else if (ext === 'csv') {
    entries = parseCSV(content, { columns: true, skip_empty_lines: true });
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  return entries.map((e, i) => {
    if (!isAddress(e.address)) {
      throw new Error(`Invalid address at index ${i}: ${e.address}`);
    }

    const chainId = e.chainId
      ? typeof e.chainId === 'string' && e.chainId.includes(':')
        ? caip2ToBytes32(e.chainId)
        : chainIdToBytes32(BigInt(e.chainId))
      : chainIdToBytes32(defaultChainId);

    return {
      address: e.address as Address,
      chainId,
    };
  });
}
