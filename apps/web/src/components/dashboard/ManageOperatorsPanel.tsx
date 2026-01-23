/**
 * Manage Operators Panel
 *
 * DAO-only panel for adding and revoking operators.
 * Uses viem to encode transaction data for Safe Transaction Builder.
 */

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Checkbox,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ExplorerLink,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@swr/ui';
import {
  Copy,
  Check,
  Plus,
  Trash2,
  AlertCircle,
  ExternalLink,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { useChainId, useWriteContract, usePublicClient } from 'wagmi';
import { encodeFunctionData, isAddress } from 'viem';
import { useOperators, type OperatorInfo } from '@/hooks/dashboard';
import { useWalletType } from '@/hooks/useWalletType';
import { operatorRegistryAbi } from '@/lib/contracts/abis';
import { getOperatorRegistryAddress } from '@/lib/contracts/addresses';
import { cn } from '@/lib/utils';
import type { Address, Hex } from '@/lib/types/ethereum';

/** Capability bitmask values matching the contract */
const CAPABILITIES = {
  WALLET: 0x01,
  TX: 0x02,
  CONTRACT: 0x04,
} as const;

/** Permission description for header tooltip */
const PERMISSIONS_TOOLTIP =
  'Permissions grant operators access to submit batch registrations to specific registries (Wallet, Transaction, or Contract).';

interface TransactionData {
  to: Address;
  value: string;
  data: Hex;
  operation: 'approve' | 'revoke';
  summary: string;
}

interface TransactionDialogProps {
  transaction: TransactionData;
  onClose: () => void;
}

function TransactionDialog({ transaction, onClose }: TransactionDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      console.warn('Failed to copy to clipboard');
    }
  };

  // Safe Transaction Builder JSON format
  const safeTxJson = JSON.stringify(
    {
      version: '1.0',
      chainId: '8453', // Base mainnet
      meta: {
        name: `SWR: ${transaction.operation === 'approve' ? 'Approve' : 'Revoke'} Operator`,
        description: transaction.summary,
      },
      transactions: [
        {
          to: transaction.to,
          value: transaction.value,
          data: transaction.data,
        },
      ],
    },
    null,
    2
  );

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Transaction Ready for Safe</DialogTitle>
        <DialogDescription>
          Copy the transaction data below to use in Safe Transaction Builder.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {/* Summary */}
        <div className="p-3 bg-muted rounded-md">
          <p className="text-sm">{transaction.summary}</p>
        </div>

        {/* Individual fields */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Target Contract</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-muted p-2 rounded-md break-all">
                {transaction.to}
              </code>
              <Button variant="ghost" size="sm" onClick={() => handleCopy('to', transaction.to)}>
                {copiedField === 'to' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Calldata</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-muted p-2 rounded-md break-all max-h-24 overflow-y-auto">
                {transaction.data}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy('data', transaction.data)}
              >
                {copiedField === 'data' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Value (ETH)</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-muted p-2 rounded-md">{transaction.value}</code>
            </div>
          </div>
        </div>

        {/* Full JSON for Transaction Builder */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Safe Transaction Builder JSON</Label>
            <Button variant="ghost" size="sm" onClick={() => handleCopy('json', safeTxJson)}>
              {copiedField === 'json' ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48">
            {safeTxJson}
          </pre>
        </div>

        {/* Instructions */}
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground mb-2">To execute this transaction:</p>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
            <li>Open your Safe at safe.global</li>
            <li>Go to Apps → Transaction Builder</li>
            <li>Click "Upload" and paste the JSON above, or manually enter the fields</li>
            <li>Review and submit for signing</li>
          </ol>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" asChild>
            <a href="https://app.safe.global" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Safe
            </a>
          </Button>
          <Button onClick={onClose} className="flex-1">
            Close
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

interface AddOperatorFormProps {
  contractAddress: Address | undefined;
  /** For Smart Contract wallets: show calldata dialog */
  onGenerate: (tx: TransactionData) => void;
  /** For EOA wallets: execute transaction directly */
  onExecute: (operatorAddress: Address, capabilities: number, name: string) => Promise<void>;
  /** Wallet type detection result */
  isEOA: boolean;
  isWalletTypeLoading: boolean;
  /** Transaction state */
  isPending: boolean;
  isConfirming: boolean;
}

function AddOperatorForm({
  contractAddress,
  onGenerate,
  onExecute,
  isEOA,
  isWalletTypeLoading,
  isPending,
  isConfirming,
}: AddOperatorFormProps) {
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [canWallet, setCanWallet] = useState(true);
  const [canTx, setCanTx] = useState(false);
  const [canContract, setCanContract] = useState(true);

  const hasCapability = canWallet || canTx || canContract;
  const isValid = isAddress(address) && name.trim().length > 0 && hasCapability && contractAddress;
  const isBusy = isPending || isConfirming || isWalletTypeLoading;

  const handleAction = async () => {
    if (!isValid || !contractAddress) return;

    // Build capabilities bitmask
    let capabilities = 0;
    if (canWallet) capabilities |= CAPABILITIES.WALLET;
    if (canTx) capabilities |= CAPABILITIES.TX;
    if (canContract) capabilities |= CAPABILITIES.CONTRACT;

    if (isEOA) {
      // EOA: Execute transaction directly
      await onExecute(address as Address, capabilities, name.trim());
      // Reset form on success
      setAddress('');
      setName('');
    } else {
      // Smart Contract: Generate calldata for Safe
      const calldata = encodeFunctionData({
        abi: operatorRegistryAbi,
        functionName: 'approveOperator',
        args: [address as Address, capabilities, name.trim()],
      });

      // Build capability summary
      const caps: string[] = [];
      if (canWallet) caps.push('Wallet');
      if (canTx) caps.push('Transaction');
      if (canContract) caps.push('Contract');

      onGenerate({
        to: contractAddress,
        value: '0',
        data: calldata,
        operation: 'approve',
        summary: `Approve "${name.trim()}" (${address.slice(0, 6)}...${address.slice(-4)}) with ${caps.join(', ')} registry access`,
      });
    }
  };

  const getButtonContent = () => {
    if (isWalletTypeLoading) {
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Detecting Wallet...
        </>
      );
    }
    if (isPending) {
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Confirm in Wallet...
        </>
      );
    }
    if (isConfirming) {
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Confirming...
        </>
      );
    }
    if (isEOA) {
      return (
        <>
          <Plus className="h-4 w-4 mr-2" />
          Execute Transaction
        </>
      );
    }
    return (
      <>
        <Plus className="h-4 w-4 mr-2" />
        Generate Calldata
      </>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Add New Operator</CardTitle>
        <CardDescription>
          {isEOA
            ? 'Execute a transaction to approve a new operator.'
            : 'Generate transaction data to approve a new operator via Safe.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="address">Operator Address</Label>
            <Input
              id="address"
              placeholder="0x..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isBusy}
            />
            {address && !isAddress(address) && (
              <p className="text-xs text-destructive">Invalid Ethereum address</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Operator Name</Label>
            <Input
              id="name"
              placeholder="e.g., Coinbase, ZachXBT"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isBusy}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Capabilities</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={canWallet}
                onCheckedChange={(c) => setCanWallet(c === true)}
                disabled={isBusy}
              />
              <span className="text-sm">Wallet Registry</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={canTx}
                onCheckedChange={(c) => setCanTx(c === true)}
                disabled={isBusy}
              />
              <span className="text-sm">Transaction Registry</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={canContract}
                onCheckedChange={(c) => setCanContract(c === true)}
                disabled={isBusy}
              />
              <span className="text-sm">Contract Registry</span>
            </label>
          </div>
          {!hasCapability && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Select at least one capability
            </p>
          )}
        </div>

        <Button onClick={handleAction} disabled={!isValid || isBusy} className="w-full sm:w-auto">
          {getButtonContent()}
        </Button>
      </CardContent>
    </Card>
  );
}

interface OperatorListProps {
  operators: OperatorInfo[];
  isLoading: boolean;
  onRevoke: (operator: OperatorInfo) => void;
  /** Address currently being revoked (for loading state) */
  revokingAddress?: Address;
  /** Transaction is pending user confirmation */
  isPending: boolean;
  /** Transaction is confirming on-chain */
  isConfirming: boolean;
}

function OperatorList({
  operators,
  isLoading,
  onRevoke,
  revokingAddress,
  isPending,
  isConfirming,
}: OperatorListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (operators.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">No operators to manage.</p>
    );
  }

  const isRevoking = (address: string) =>
    revokingAddress?.toLowerCase() === address.toLowerCase() && (isPending || isConfirming);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 cursor-help">
                    Permissions
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[300px]">
                  <p className="text-xs whitespace-pre-line">{PERMISSIONS_TOOLTIP}</p>
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {operators.map((operator) => (
            <TableRow key={operator.address}>
              <TableCell className="font-medium">{operator.identifier}</TableCell>
              <TableCell>
                <ExplorerLink
                  value={operator.address as Address}
                  type="address"
                  showDisabledIcon={false}
                />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {operator.canSubmitWallet && (
                    <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30">
                      WALLET
                    </Badge>
                  )}
                  {operator.canSubmitTransaction && (
                    <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30">
                      TX
                    </Badge>
                  )}
                  {operator.canSubmitContract && (
                    <Badge className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30">
                      CONTRACT
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRevoke(operator)}
                  disabled={isRevoking(operator.address)}
                >
                  {isRevoking(operator.address) ? (
                    <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export interface ManageOperatorsPanelProps {
  className?: string;
}

/**
 * Panel for DAO to manage operators.
 *
 * Dual-mode execution:
 * - EOA wallets: Execute transactions directly via wagmi
 * - Smart Contract wallets (Safe): Generate calldata for Safe Transaction Builder
 *
 * @example
 * ```tsx
 * <ManageOperatorsPanel />
 * ```
 */
export function ManageOperatorsPanel({ className }: ManageOperatorsPanelProps) {
  const chainId = useChainId();
  const contractAddress = getOperatorRegistryAddress(chainId);
  const { operators, isLoading, isError, refetch } = useOperators();
  const { isEOA, isLoading: isWalletTypeLoading } = useWalletType();
  const publicClient = usePublicClient();
  const [transaction, setTransaction] = useState<TransactionData | null>(null);

  // Transaction state tracking
  const [revokingAddress, setRevokingAddress] = useState<Address | undefined>(undefined);
  const [isApprovePending, setIsApprovePending] = useState(false);
  const [isApproveConfirming, setIsApproveConfirming] = useState(false);
  const [isRevokePending, setIsRevokePending] = useState(false);
  const [isRevokeConfirming, setIsRevokeConfirming] = useState(false);

  // wagmi hook for EOA direct execution
  const { writeContractAsync } = useWriteContract();

  // EOA: Execute approve operator directly with full transaction flow
  const handleExecuteApprove = useCallback(
    async (operatorAddress: Address, capabilities: number, name: string) => {
      if (!contractAddress || !publicClient) return;

      setIsApprovePending(true);
      try {
        const hash = await writeContractAsync({
          address: contractAddress,
          abi: operatorRegistryAbi,
          functionName: 'approveOperator',
          args: [operatorAddress, capabilities, name],
        });

        // Wait for confirmation
        setIsApprovePending(false);
        setIsApproveConfirming(true);
        await publicClient.waitForTransactionReceipt({ hash });

        // Success - refetch operators
        refetch();
      } catch {
        // Error handling - state will be reset in finally
      } finally {
        setIsApprovePending(false);
        setIsApproveConfirming(false);
      }
    },
    [contractAddress, publicClient, writeContractAsync, refetch]
  );

  // EOA: Execute revoke operator directly with full transaction flow
  const handleExecuteRevoke = useCallback(
    async (operator: OperatorInfo) => {
      if (!contractAddress || !publicClient) return;

      setRevokingAddress(operator.address as Address);
      setIsRevokePending(true);
      try {
        const hash = await writeContractAsync({
          address: contractAddress,
          abi: operatorRegistryAbi,
          functionName: 'revokeOperator',
          args: [operator.address as Address],
        });

        // Wait for confirmation
        setIsRevokePending(false);
        setIsRevokeConfirming(true);
        await publicClient.waitForTransactionReceipt({ hash });

        // Success - refetch operators
        refetch();
      } catch {
        // Error handling - state will be reset in finally
      } finally {
        setRevokingAddress(undefined);
        setIsRevokePending(false);
        setIsRevokeConfirming(false);
      }
    },
    [contractAddress, publicClient, writeContractAsync, refetch]
  );

  // Handle revoke action (EOA or Safe)
  const handleRevoke = useCallback(
    async (operator: OperatorInfo) => {
      if (!contractAddress) return;

      if (isEOA) {
        // EOA: Execute directly
        await handleExecuteRevoke(operator);
      } else {
        // Smart Contract: Generate calldata for Safe
        const calldata = encodeFunctionData({
          abi: operatorRegistryAbi,
          functionName: 'revokeOperator',
          args: [operator.address as Address],
        });

        setTransaction({
          to: contractAddress,
          value: '0',
          data: calldata,
          operation: 'revoke',
          summary: `Revoke operator "${operator.identifier}" (${operator.address.slice(0, 6)}...${operator.address.slice(-4)})`,
        });
      }
    },
    [contractAddress, isEOA, handleExecuteRevoke]
  );

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load operators.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      <AddOperatorForm
        contractAddress={contractAddress}
        onGenerate={setTransaction}
        onExecute={handleExecuteApprove}
        isEOA={isEOA}
        isWalletTypeLoading={isWalletTypeLoading}
        isPending={isApprovePending}
        isConfirming={isApproveConfirming}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Operators</CardTitle>
          <CardDescription>
            {isEOA
              ? 'Click the trash icon to revoke an operator.'
              : 'Click the trash icon to generate a revoke transaction.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OperatorList
            operators={operators}
            isLoading={isLoading}
            onRevoke={handleRevoke}
            revokingAddress={revokingAddress}
            isPending={isRevokePending}
            isConfirming={isRevokeConfirming}
          />
        </CardContent>
      </Card>

      <Dialog open={!!transaction} onOpenChange={() => setTransaction(null)}>
        {transaction && (
          <TransactionDialog transaction={transaction} onClose={() => setTransaction(null)} />
        )}
      </Dialog>
    </div>
  );
}
