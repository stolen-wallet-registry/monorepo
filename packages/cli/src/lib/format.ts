import { formatEther } from 'viem';
import chalk from 'chalk';

/**
 * Render an operator batch fee for display.
 *
 * Operator batches are free by default (`FeeManager.operatorBatchFeeUsdCents` ships as 0),
 * so the common case is a zero quote. Printing that as "0.0 ETH" reads like a failed lookup;
 * saying it plainly avoids operators wondering whether the quote actually resolved.
 *
 * The fee mechanism is retained on-chain and the DAO can enable it, so this still renders a
 * real amount whenever the quote is non-zero.
 */
export function formatBatchFee(fee: bigint): string {
  if (fee === 0n) {
    return `${chalk.green('Free')} ${chalk.gray('(operators pay gas only)')}`;
  }
  return `${chalk.yellow(formatEther(fee))} ETH`;
}
