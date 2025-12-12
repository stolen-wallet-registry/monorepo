/**
 * Address input with real-time validation.
 *
 * Shows visual feedback (checkmark/warning) based on address validity.
 * Currently supports Ethereum addresses; extensible for multi-chain.
 */

import * as React from 'react';
import { forwardRef, useMemo } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { isAddress } from 'viem';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type AddressType = 'ethereum' | 'solana' | 'bitcoin' | 'auto';

export interface AddressInputProps extends Omit<React.ComponentProps<'input'>, 'type'> {
  /** Type of address to validate (default: 'ethereum') */
  addressType?: AddressType;
  /** Whether to show validation icon (default: true) */
  showValidation?: boolean;
  /** Custom validation function (overrides addressType validation) */
  validate?: (value: string) => boolean;
}

/**
 * Validates an address based on its type.
 * Currently only Ethereum is fully implemented.
 */
function validateAddress(value: string, type: AddressType): boolean | null {
  if (!value || value.length === 0) return null; // Empty = no validation state

  switch (type) {
    case 'ethereum':
      return isAddress(value);
    case 'solana':
      // Solana: Base58, 32-44 characters
      // Basic validation - future: use @solana/web3.js
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
    case 'bitcoin':
      // Bitcoin: P2PKH (1...), P2SH (3...), Bech32 (bc1...)
      // Basic validation - future: use bitcoinjs-lib
      return (
        /^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value) ||
        /^bc1[a-zA-HJ-NP-Z0-9]{39,59}$/.test(value)
      );
    case 'auto':
      // Try to auto-detect based on format
      if (value.startsWith('0x')) return isAddress(value);
      if (value.startsWith('bc1') || /^(1|3)[1-9A-HJ-NP-Za-km-z]/.test(value)) {
        return (
          /^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value) ||
          /^bc1[a-zA-HJ-NP-Z0-9]{39,59}$/.test(value)
        );
      }
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return true; // Solana-like
      return false;
    default:
      return null;
  }
}

/**
 * Input component with real-time address validation feedback.
 */
export const AddressInput = forwardRef<HTMLInputElement, AddressInputProps>(
  (
    { addressType = 'ethereum', showValidation = true, validate, value, className, ...props },
    ref
  ) => {
    const stringValue = typeof value === 'string' ? value : '';

    const isValid = useMemo(() => {
      if (validate) return validate(stringValue);
      return validateAddress(stringValue, addressType);
    }, [stringValue, addressType, validate]);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type="text"
          value={value}
          className={cn('font-mono pr-10', className)}
          {...props}
        />
        {showValidation && isValid !== null && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            {isValid ? (
              <Check className="h-4 w-4 text-green-500" aria-label="Valid address" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive" aria-label="Invalid address" />
            )}
          </div>
        )}
      </div>
    );
  }
);

AddressInput.displayName = 'AddressInput';
