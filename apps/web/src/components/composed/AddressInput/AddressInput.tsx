/**
 * Address input with real-time validation and ENS resolution.
 *
 * Shows visual feedback (checkmark/warning/spinner) based on address validity.
 * Supports ENS name resolution for Ethereum addresses.
 * Currently supports Ethereum addresses with full validation via viem.
 * Solana and Bitcoin use basic regex validation (consider adding proper
 * library validation with @solana/web3.js and bech32 for production use).
 */

import * as React from 'react';
import { forwardRef, useMemo, useEffect, useCallback } from 'react';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { isAddress } from 'viem';
import { Input } from '@swr/ui';
import { cn } from '@/lib/utils';
import { useEnsResolve } from '@/hooks/ens';
import { isEnsName } from '@/lib/ens';
import type { Address } from '@/lib/types/ethereum';

export type AddressType = 'ethereum' | 'solana' | 'bitcoin' | 'auto';

/**
 * Props for AddressInput component.
 *
 * NOTE: This is a controlled component. You must provide both `value` and `onChange`
 * for proper operation. Typical usage patterns:
 *
 * 1. With React state:
 *    const [address, setAddress] = useState('');
 *    <AddressInput value={address} onChange={(e) => setAddress(e.target.value)} />
 *
 * 2. With React Hook Form:
 *    <Controller
 *      name="address"
 *      control={control}
 *      render={({ field }) => <AddressInput {...field} />}
 *    />
 */
export interface AddressInputProps extends Omit<
  React.ComponentProps<'input'>,
  'type' | 'onChange'
> {
  /** Type of address to validate (default: 'ethereum') */
  addressType?: AddressType;
  /** Whether to show validation icon (default: true) */
  showValidation?: boolean;
  /** Custom validation function (overrides addressType validation). Return null for no validation state. */
  validate?: (value: string) => boolean | null;
  /**
   * Current value (required for controlled usage).
   * Must be provided along with onChange for the component to work correctly.
   */
  value?: string;
  /** Called when value changes (raw input, may be ENS or address) */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Called when a valid address is resolved (either direct input or ENS resolution) */
  onAddressResolved?: (address: Address | null) => void;
  /** Whether to enable ENS resolution (default: true for ethereum type) */
  enableEns?: boolean;
}

/**
 * Validates an address based on its type.
 *
 * Ethereum: Uses viem's isAddress for full checksum validation.
 * Solana: Basic Base58 regex (32-44 chars). For production, consider
 *   using @solana/web3.js PublicKey for proper base58 decoding and
 *   32-byte key validation.
 * Bitcoin: Basic regex for P2PKH/P2SH/Bech32 formats. For production,
 *   consider using the bech32 library for proper checksum verification.
 */
function validateAddress(value: string, type: AddressType): boolean | null {
  if (!value || value.length === 0) return null; // Empty = no validation state

  switch (type) {
    case 'ethereum':
      return isAddress(value);
    case 'solana':
      // Solana: Base58, 32-44 characters
      // TODO: Use @solana/web3.js PublicKey for proper validation
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
    case 'bitcoin':
      // Bitcoin: P2PKH (1...), P2SH (3...), Bech32 (bc1...)
      // TODO: Use bech32 library for proper checksum verification
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

// Validation state can be boolean, null, or 'loading' for ENS resolution
type ValidationState = boolean | null | 'loading';

/**
 * Input component with real-time address validation feedback and ENS resolution.
 */
export const AddressInput = forwardRef<HTMLInputElement, AddressInputProps>(
  (
    {
      addressType = 'ethereum',
      showValidation = true,
      validate,
      value,
      onChange,
      onAddressResolved,
      enableEns = true,
      className,
      placeholder,
      ...props
    },
    ref
  ) => {
    const stringValue = typeof value === 'string' ? value : '';

    // Determine if input looks like an ENS name (derived state, not useState)
    const isEnsInput = useMemo(
      () => enableEns && addressType === 'ethereum' && isEnsName(stringValue),
      [stringValue, enableEns, addressType]
    );

    // ENS resolution (only when input looks like ENS name)
    const ensInput = isEnsInput ? stringValue : undefined;
    const {
      address: resolvedAddress,
      isLoading: isEnsLoading,
      isError: isEnsError,
    } = useEnsResolve(ensInput);

    // Determine the effective address
    const effectiveAddress = useMemo(() => {
      if (isEnsInput && resolvedAddress) {
        return resolvedAddress;
      }
      if (isAddress(stringValue)) {
        return stringValue as Address;
      }
      return null;
    }, [stringValue, isEnsInput, resolvedAddress]);

    // Notify parent of resolved address
    useEffect(() => {
      onAddressResolved?.(effectiveAddress);
    }, [effectiveAddress, onAddressResolved]);

    // Validation state
    const validationState: ValidationState = useMemo(() => {
      // Empty value = no validation state (null)
      if (stringValue === '') return null;

      // Custom validator
      if (validate) return validate(stringValue);

      // ENS input
      if (isEnsInput) {
        if (isEnsLoading) return 'loading';
        if (isEnsError) return false;
        if (resolvedAddress) return true;
        return false;
      }

      // Direct address input
      return validateAddress(stringValue, addressType);
    }, [stringValue, isEnsInput, isEnsLoading, isEnsError, resolvedAddress, addressType, validate]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(e);
      },
      [onChange]
    );

    // Determine placeholder based on ENS support
    const effectivePlaceholder =
      placeholder ?? (enableEns && addressType === 'ethereum' ? '0x... or name.eth' : '0x...');

    // Render validation icon
    const renderValidationIcon = () => {
      if (!showValidation || validationState === null) return null;

      if (validationState === 'loading') {
        return (
          <Loader2
            className="h-4 w-4 animate-spin text-muted-foreground"
            aria-label="Resolving ENS name"
          />
        );
      }

      if (validationState === true) {
        return <Check className="h-4 w-4 text-green-500" aria-label="Valid address" />;
      }

      return <AlertCircle className="h-4 w-4 text-destructive" aria-label="Invalid address" />;
    };

    return (
      <div className="relative">
        <Input
          ref={ref}
          type="text"
          {...props}
          value={stringValue}
          onChange={handleChange}
          placeholder={effectivePlaceholder}
          aria-invalid={validationState === false}
          className={cn('font-mono pr-10', className)}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {renderValidationIcon()}
        </div>

        {/* Show resolved address hint when ENS is used */}
        {isEnsInput && resolvedAddress && (
          <p className="mt-1 text-xs text-muted-foreground">
            Resolves to: {resolvedAddress.slice(0, 10)}...{resolvedAddress.slice(-8)}
          </p>
        )}
      </div>
    );
  }
);

AddressInput.displayName = 'AddressInput';
