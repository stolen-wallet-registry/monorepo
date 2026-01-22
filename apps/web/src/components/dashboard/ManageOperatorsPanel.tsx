/**
 * Manage Operators Panel
 *
 * DAO-only panel for adding and revoking operators.
 * Generates CLI commands instead of submitting transactions directly.
 */

import { useState } from 'react';
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
} from '@swr/ui';
import { Copy, Check, Plus, Trash2 } from 'lucide-react';
import { useOperators, type OperatorInfo } from '@/hooks/dashboard';
import { cn } from '@/lib/utils';
import type { Address } from '@/lib/types/ethereum';
import { isAddress } from 'viem';

interface GeneratedCommandProps {
  command: string;
  onClose: () => void;
}

function GeneratedCommand({ command, onClose }: GeneratedCommandProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Generated CLI Command</DialogTitle>
        <DialogDescription>Copy this command and run it in your terminal.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="relative group">
          <pre className="bg-muted rounded-md p-4 overflow-x-auto text-sm whitespace-pre-wrap break-all">
            <code>{command}</code>
          </pre>
          <Button variant="ghost" size="sm" className="absolute top-2 right-2" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          This command generates a Safe-compatible transaction. Import the output to Safe
          Transaction Builder to execute.
        </p>
        <Button onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    </DialogContent>
  );
}

interface AddOperatorFormProps {
  onGenerate: (command: string) => void;
}

function AddOperatorForm({ onGenerate }: AddOperatorFormProps) {
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [canWallet, setCanWallet] = useState(true);
  const [canTx, setCanTx] = useState(false);
  const [canContract, setCanContract] = useState(true);

  const isValid = isAddress(address) && name.trim().length > 0;

  const handleGenerate = () => {
    // Build capabilities bitmask
    const capabilities: string[] = [];
    if (canWallet) capabilities.push('wallet');
    if (canTx) capabilities.push('tx');
    if (canContract) capabilities.push('contract');

    const command = `swr operator approve \\
  --address ${address} \\
  --name "${name}" \\
  --capabilities ${capabilities.join(',')} \\
  --env mainnet \\
  --build-only \\
  --output ./output`;

    onGenerate(command);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Add New Operator</CardTitle>
        <CardDescription>Generate a CLI command to approve a new operator.</CardDescription>
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
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Capabilities</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={canWallet} onCheckedChange={(c) => setCanWallet(c === true)} />
              <span className="text-sm">Wallet Registry</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={canTx} onCheckedChange={(c) => setCanTx(c === true)} />
              <span className="text-sm">Transaction Registry</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={canContract} onCheckedChange={(c) => setCanContract(c === true)} />
              <span className="text-sm">Contract Registry</span>
            </label>
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={!isValid} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Generate CLI Command
        </Button>
      </CardContent>
    </Card>
  );
}

interface OperatorListProps {
  operators: OperatorInfo[];
  isLoading: boolean;
  onRevoke: (operator: OperatorInfo) => void;
}

function OperatorList({ operators, isLoading, onRevoke }: OperatorListProps) {
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

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Permissions</TableHead>
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
                    <Badge variant="secondary" className="text-xs">
                      WALLET
                    </Badge>
                  )}
                  {operator.canSubmitTransaction && (
                    <Badge variant="secondary" className="text-xs">
                      TX
                    </Badge>
                  )}
                  {operator.canSubmitContract && (
                    <Badge variant="secondary" className="text-xs">
                      CONTRACT
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onRevoke(operator)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
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
 * Panel for DAO to manage operators via CLI command generation.
 *
 * @example
 * ```tsx
 * <ManageOperatorsPanel />
 * ```
 */
export function ManageOperatorsPanel({ className }: ManageOperatorsPanelProps) {
  const { operators, isLoading, isError } = useOperators();
  const [generatedCommand, setGeneratedCommand] = useState<string | null>(null);

  const handleRevoke = (operator: OperatorInfo) => {
    const command = `swr operator revoke \\
  --address ${operator.address} \\
  --env mainnet \\
  --build-only \\
  --output ./output`;

    setGeneratedCommand(command);
  };

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
      <AddOperatorForm onGenerate={setGeneratedCommand} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Operators</CardTitle>
          <CardDescription>Click the trash icon to generate a revoke command.</CardDescription>
        </CardHeader>
        <CardContent>
          <OperatorList operators={operators} isLoading={isLoading} onRevoke={handleRevoke} />
        </CardContent>
      </Card>

      <Dialog open={!!generatedCommand} onOpenChange={() => setGeneratedCommand(null)}>
        {generatedCommand && (
          <GeneratedCommand command={generatedCommand} onClose={() => setGeneratedCommand(null)} />
        )}
      </Dialog>
    </div>
  );
}
