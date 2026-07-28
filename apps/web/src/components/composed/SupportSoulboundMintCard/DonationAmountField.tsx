/**
 * Donation amount entry: linked ETH/USD inputs, preset buttons and the minimum warning.
 *
 * The amount itself is owned by SupportSoulboundMintCard - the mint handlers need it -
 * so this component only renders the two-way-bound fields it is given.
 */

import { Button, Input, Label } from '@swr/ui';
import { formatEther } from 'viem';

/** Preset donation amounts in ETH for quick selection */
const DONATION_PRESETS = [0.001, 0.005, 0.01, 0.05, 0.1] as const;

interface DonationAmountFieldProps {
  /** Current amount in ETH, as typed */
  ethInput: string;
  /** Current amount in USD, as typed or derived */
  usdInput: string;
  onEthChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUsdChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPresetClick: (amount: number) => void;
  /** Disables the inputs while a mint is in flight */
  isMinting: boolean;
  /** ETH price in USD, 0 when unknown (disables the USD field) */
  ethPrice: number;
  /** Whether the minimum donation warning should be shown */
  showMinimumWarning: boolean;
  /** Contract minimum donation in wei */
  minWei: bigint;
}

export function DonationAmountField({
  ethInput,
  usdInput,
  onEthChange,
  onUsdChange,
  onPresetClick,
  isMinting,
  ethPrice,
  showMinimumWarning,
  minWei,
}: DonationAmountFieldProps) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Donation Amount</Label>
        <p className="text-xs text-muted-foreground mt-1">Enter any amount you'd like to donate</p>
      </div>

      {/* ETH and USD inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <Input
            type="text"
            inputMode="decimal"
            value={ethInput}
            onChange={onEthChange}
            disabled={isMinting}
            className="pr-12"
            placeholder="0.01"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            ETH
          </span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            type="text"
            inputMode="decimal"
            value={usdInput}
            onChange={onUsdChange}
            disabled={isMinting || !ethPrice}
            className="pl-7 pr-12"
            placeholder={ethPrice ? '0.00' : '...'}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            USD
          </span>
        </div>
      </div>

      {/* Quick amount buttons - centered */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground text-center">Suggested amounts</p>
        <div className="flex flex-wrap justify-center gap-2">
          {DONATION_PRESETS.map((amount) => (
            <Button
              key={amount}
              type="button"
              variant={ethInput === amount.toString() ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPresetClick(amount)}
              disabled={isMinting}
              className="text-xs"
            >
              {amount} ETH
            </Button>
          ))}
        </div>
      </div>

      {/* Minimum amount warning */}
      {showMinimumWarning && (
        <p className="text-xs text-destructive text-center">
          Minimum donation: {formatEther(minWei)} ETH
        </p>
      )}
    </div>
  );
}
