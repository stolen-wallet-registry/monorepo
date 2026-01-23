/**
 * Operators Table
 *
 * Displays a list of approved operators with their capabilities.
 * When canManage is true, shows add/edit/delete functionality for DAO owners.
 */

import { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  Badge,
  Button,
  Input,
  Label,
  Checkbox,
  ExplorerLink,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@swr/ui';
import {
  HelpCircle,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { useChainId, useWriteContract, usePublicClient } from 'wagmi';
import { encodeFunctionData, isAddress } from 'viem';
import { useOperators, type OperatorInfo } from '@/hooks/dashboard';
import { useWalletType } from '@/hooks/useWalletType';
import { operatorRegistryAbi } from '@/lib/contracts/abis';
import { getOperatorRegistryAddress } from '@/lib/contracts/addresses';
import type { Address, Hex } from '@/lib/types/ethereum';

/** Permission description for header tooltip */
const PERMISSIONS_TOOLTIP =
  'Permissions grant operators access to submit batch registrations to specific registries (Wallet, Transaction, or Contract).';

/** Capability bitmask values matching the contract */
const CAPABILITIES = {
  WALLET: 0x01,
  TX: 0x02,
  CONTRACT: 0x04,
} as const;

interface TransactionData {
  to: Address;
  value: string;
  data: Hex;
  operation: 'approve' | 'revoke' | 'update';
  summary: string;
}

interface CapabilitiesBadgeProps {
  operator: OperatorInfo;
}

/**
 * Displays capability badges for an operator with color coding.
 */
function CapabilitiesBadge({ operator }: CapabilitiesBadgeProps) {
  return (
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
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION DIALOG (for Safe wallet users)
// ═══════════════════════════════════════════════════════════════════════════

interface TransactionDialogProps {
  transaction: TransactionData;
  chainId: number;
  onClose: () => void;
}

function TransactionDialog({ transaction, chainId, onClose }: TransactionDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Silently fail
    }
  };

  const operationLabel =
    transaction.operation === 'approve'
      ? 'Approve'
      : transaction.operation === 'update'
        ? 'Update'
        : 'Revoke';

  const safeTxJson = JSON.stringify(
    {
      version: '1.0',
      chainId: String(chainId),
      meta: {
        name: `SWR: ${operationLabel} Operator`,
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
        <div className="p-3 bg-muted rounded-md">
          <p className="text-sm">{transaction.summary}</p>
        </div>

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

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://help.safe.global/en/articles/234052-transaction-builder"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Transaction Builder Guide
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

// ═══════════════════════════════════════════════════════════════════════════
// EDIT CAPABILITIES DIALOG
// ═══════════════════════════════════════════════════════════════════════════

interface EditCapabilitiesDialogProps {
  operator: OperatorInfo;
  onSave: (capabilities: number) => void;
  onClose: () => void;
  isPending: boolean;
}

function EditCapabilitiesDialog({
  operator,
  onSave,
  onClose,
  isPending,
}: EditCapabilitiesDialogProps) {
  const [canWallet, setCanWallet] = useState(operator.canSubmitWallet);
  const [canTx, setCanTx] = useState(operator.canSubmitTransaction);
  const [canContract, setCanContract] = useState(operator.canSubmitContract);

  const hasCapability = canWallet || canTx || canContract;

  const handleSave = () => {
    let capabilities = 0;
    if (canWallet) capabilities |= CAPABILITIES.WALLET;
    if (canTx) capabilities |= CAPABILITIES.TX;
    if (canContract) capabilities |= CAPABILITIES.CONTRACT;
    onSave(capabilities);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit Operator Permissions</DialogTitle>
        <DialogDescription>Update capabilities for {operator.identifier}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Capabilities</Label>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={canWallet}
                onCheckedChange={(c) => setCanWallet(c === true)}
                disabled={isPending}
              />
              <span className="text-sm">Wallet Registry</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={canTx}
                onCheckedChange={(c) => setCanTx(c === true)}
                disabled={isPending}
              />
              <span className="text-sm">Transaction Registry</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={canContract}
                onCheckedChange={(c) => setCanContract(c === true)}
                disabled={isPending}
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
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!hasCapability || isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </DialogContent>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADD OPERATOR FORM
// ═══════════════════════════════════════════════════════════════════════════

interface AddOperatorFormProps {
  contractAddress: Address | undefined;
  onGenerate: (tx: TransactionData) => void;
  onExecute: (operatorAddress: Address, capabilities: number, name: string) => Promise<void>;
  isEOA: boolean;
  isWalletTypeLoading: boolean;
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

    let capabilities = 0;
    if (canWallet) capabilities |= CAPABILITIES.WALLET;
    if (canTx) capabilities |= CAPABILITIES.TX;
    if (canContract) capabilities |= CAPABILITIES.CONTRACT;

    if (isEOA) {
      await onExecute(address as Address, capabilities, name.trim());
      setAddress('');
      setName('');
    } else {
      const calldata = encodeFunctionData({
        abi: operatorRegistryAbi,
        functionName: 'approveOperator',
        args: [address as Address, capabilities, name.trim()],
      });

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
    if (isWalletTypeLoading)
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Detecting...
        </>
      );
    if (isPending)
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Confirm in Wallet...
        </>
      );
    if (isConfirming)
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Confirming...
        </>
      );
    return (
      <>
        <Plus className="h-4 w-4 mr-2" />
        {isEOA ? 'Add Operator' : 'Generate Calldata'}
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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export interface OperatorsTableProps {
  className?: string;
  /** Show revoked operators too */
  showRevoked?: boolean;
  /** Enable management features (add/edit/delete) for DAO owners */
  canManage?: boolean;
}

/**
 * Displays list of approved operators.
 * When canManage is true, includes add/edit/delete functionality.
 */
export function OperatorsTable({
  className,
  showRevoked = false,
  canManage = false,
}: OperatorsTableProps) {
  const chainId = useChainId();
  const { operators, isLoading, isError, refetch } = useOperators({
    approvedOnly: !showRevoked,
  });
  const { isEOA, isLoading: isWalletTypeLoading } = useWalletType();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Get contract address
  let contractAddress: Address | undefined;
  try {
    contractAddress = getOperatorRegistryAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  // State for dialogs
  const [transaction, setTransaction] = useState<TransactionData | null>(null);
  const [editingOperator, setEditingOperator] = useState<OperatorInfo | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Transaction states
  const [isApprovePending, setIsApprovePending] = useState(false);
  const [isApproveConfirming, setIsApproveConfirming] = useState(false);

  // EOA: Execute approve operator
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

        setIsApprovePending(false);
        setIsApproveConfirming(true);
        await publicClient.waitForTransactionReceipt({ hash });
        refetch();
      } finally {
        setIsApprovePending(false);
        setIsApproveConfirming(false);
      }
    },
    [contractAddress, publicClient, writeContractAsync, refetch]
  );

  // Handle edit capabilities
  const handleEditCapabilities = useCallback(
    async (operator: OperatorInfo, capabilities: number) => {
      if (!contractAddress || !publicClient) return;

      if (isEOA) {
        setActionInProgress(operator.address);
        try {
          const hash = await writeContractAsync({
            address: contractAddress,
            abi: operatorRegistryAbi,
            functionName: 'updateCapabilities',
            args: [operator.address as Address, capabilities],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          refetch();
          setEditingOperator(null);
        } finally {
          setActionInProgress(null);
        }
      } else {
        const calldata = encodeFunctionData({
          abi: operatorRegistryAbi,
          functionName: 'updateCapabilities',
          args: [operator.address as Address, capabilities],
        });

        setTransaction({
          to: contractAddress,
          value: '0',
          data: calldata,
          operation: 'update',
          summary: `Update capabilities for "${operator.identifier}" (${operator.address.slice(0, 6)}...${operator.address.slice(-4)})`,
        });
        setEditingOperator(null);
      }
    },
    [contractAddress, publicClient, isEOA, writeContractAsync, refetch]
  );

  // Handle revoke operator
  const handleRevoke = useCallback(
    async (operator: OperatorInfo) => {
      if (!contractAddress || !publicClient) return;

      if (isEOA) {
        setActionInProgress(operator.address);
        try {
          const hash = await writeContractAsync({
            address: contractAddress,
            abi: operatorRegistryAbi,
            functionName: 'revokeOperator',
            args: [operator.address as Address],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          refetch();
        } finally {
          setActionInProgress(null);
        }
      } else {
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
    [contractAddress, publicClient, isEOA, writeContractAsync, refetch]
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
    <div className="space-y-6">
      {/* Add Operator Form - only for DAO */}
      {canManage && (
        <AddOperatorForm
          contractAddress={contractAddress}
          onGenerate={setTransaction}
          onExecute={handleExecuteApprove}
          isEOA={isEOA}
          isWalletTypeLoading={isWalletTypeLoading}
          isPending={isApprovePending}
          isConfirming={isApproveConfirming}
        />
      )}

      {/* Operators Table */}
      <Card className={className}>
        <CardHeader>
          <CardTitle>Approved Operators</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : operators.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No approved operators yet.
            </p>
          ) : (
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
                    <TableHead>Approved</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operators.map((operator) => {
                    const approvedDate = new Date(Number(operator.approvedAt) * 12 * 1000);
                    const dateString = approvedDate.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });
                    const isActionInProgress = actionInProgress === operator.address;

                    return (
                      <TableRow key={operator.address}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{operator.identifier}</span>
                            {!operator.approved && (
                              <Badge variant="destructive" className="w-fit text-xs mt-1">
                                Revoked
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ExplorerLink
                            value={operator.address as Address}
                            type="address"
                            showDisabledIcon={false}
                          />
                        </TableCell>
                        <TableCell>
                          <CapabilitiesBadge operator={operator} />
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{dateString}</span>
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingOperator(operator)}
                                disabled={isActionInProgress}
                              >
                                {isActionInProgress ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Pencil className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRevoke(operator)}
                                disabled={isActionInProgress}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Dialog (for Safe) */}
      <Dialog open={!!transaction} onOpenChange={() => setTransaction(null)}>
        {transaction && (
          <TransactionDialog
            transaction={transaction}
            chainId={chainId}
            onClose={() => setTransaction(null)}
          />
        )}
      </Dialog>

      {/* Edit Capabilities Dialog */}
      <Dialog open={!!editingOperator} onOpenChange={() => setEditingOperator(null)}>
        {editingOperator && (
          <EditCapabilitiesDialog
            operator={editingOperator}
            onSave={(caps) => handleEditCapabilities(editingOperator, caps)}
            onClose={() => setEditingOperator(null)}
            isPending={!!actionInProgress}
          />
        )}
      </Dialog>
    </div>
  );
}
