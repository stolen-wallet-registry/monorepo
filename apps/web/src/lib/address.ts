/**
 * Address utilities for Ethereum address manipulation and validation.
 */

import { getAddress, isAddress } from 'viem';
import type { Address } from '@/lib/types/ethereum';

/**
 * Truncates an Ethereum address for display purposes.
 * @param address - The full Ethereum address
 * @param chars - Number of characters to show on each side (default: 4)
 * @returns Truncated address like "0x1234...5678"
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Validates if a string is a valid Ethereum address.
 * @param address - The string to validate
 * @returns true if valid Ethereum address, false otherwise
 */
export function isValidEthereumAddress(address: string): boolean {
  if (!address) return false;
  return isAddress(address);
}

/**
 * Formats an address to checksum format (EIP-55).
 * @param address - The address to format
 * @returns Checksummed address
 * @throws Error if address is invalid
 */
export function formatAddress(address: string): Address {
  return getAddress(address);
}

/**
 * Compares two addresses for equality (case-insensitive).
 * @param a - First address
 * @param b - Second address
 * @returns true if addresses are equal
 */
export function areAddressesEqual(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  if (!a || !b) return false;
  if (!isValidEthereumAddress(a) || !isValidEthereumAddress(b)) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Type guard to check if value is a valid address string.
 */
export function isAddressString(value: unknown): value is Address {
  return typeof value === 'string' && isValidEthereumAddress(value);
}
