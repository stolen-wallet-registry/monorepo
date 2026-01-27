/**
 * Registration method selector component.
 *
 * Allows users to choose between Standard, Self-Relay, and P2P-Relay
 * registration methods with descriptions of each.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@swr/ui';
import { cn } from '@/lib/utils';
import { Wallet, RefreshCw, Users } from 'lucide-react';
import type { RegistrationType } from '@/stores/registrationStore';
import type { RegistryType } from '@/lib/types';

/**
 * Reason keys for disabled methods.
 * Using keys instead of strings for i18n compatibility and type safety.
 */
type DisabledReasonKey = 'walletRegistered' | 'p2pUnavailable';

/**
 * Maps reason keys to user-facing labels and tooltip messages.
 */
const DISABLED_REASON_CONFIG: Record<DisabledReasonKey, { label: string; message: string }> = {
  walletRegistered: {
    label: 'Wallet Already Registered',
    message:
      'Your connected wallet is already registered. You can still help others by being a P2P relayer.',
  },
  p2pUnavailable: {
    label: 'P2P Relay Unavailable',
    message: 'Relay node not deployed yet. P2P relay is disabled in this deployment.',
  },
};

export interface MethodConfig {
  type: RegistrationType;
  title: string;
  description: string;
  requirements: string[];
  icon: React.ReactNode;
  disabled?: boolean;
  disabledReasonKey?: DisabledReasonKey;
}

export interface RegistrationMethodSelectorProps {
  /** Callback when a method is clicked */
  onSelect: (type: RegistrationType) => void;
  /** Whether P2P relay is available (has connected peer) */
  p2pAvailable?: boolean;
  /** Registry context to adjust copy */
  registryType?: RegistryType;
  /** Whether the connected wallet is already registered (blocks standard/selfRelay) */
  connectedWalletRegistered?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Default method configurations.
 */
const WALLET_METHODS: MethodConfig[] = [
  {
    type: 'standard',
    title: 'Standard Registration',
    description: 'Sign and pay from the same wallet you want to register as stolen.',
    requirements: ['Wallet access', 'Gas fees from same wallet'],
    icon: <Wallet className="h-6 w-6" />,
  },
  {
    type: 'selfRelay',
    title: 'Self-Relay Registration',
    description: 'Sign with the stolen wallet, then switch to a different wallet to pay gas fees.',
    requirements: ['Stolen wallet for signing', 'Second wallet to pay for gas'],
    icon: <RefreshCw className="h-6 w-6" />,
  },
  {
    type: 'p2pRelay',
    title: 'P2P Relay Registration',
    description: 'Sign with your stolen wallet and have a trusted helper pay the gas fees for you.',
    requirements: ['Stolen wallet for signing', 'Friend or trusted party who can pay for gas'],
    icon: <Users className="h-6 w-6" />,
  },
];

const TRANSACTION_METHODS: MethodConfig[] = [
  {
    type: 'standard',
    title: 'Standard Registration',
    description: 'Sign and pay from the wallet where the fraudulent transactions occurred.',
    requirements: [
      'Wallet where the fraudulent transactions occurred',
      'Gas fees from same wallet',
    ],
    icon: <Wallet className="h-6 w-6" />,
  },
  {
    type: 'selfRelay',
    title: 'Self-Relay Registration',
    description:
      'Sign with the wallet where the fraudulent transactions occurred, then switch to a different wallet to pay gas fees.',
    requirements: [
      'Wallet where the fraudulent transactions occurred',
      'Second wallet to pay for gas',
    ],
    icon: <RefreshCw className="h-6 w-6" />,
  },
  {
    type: 'p2pRelay',
    title: 'P2P Relay Registration',
    description:
      'Sign with the wallet where the fraudulent transactions occurred and have a trusted helper pay the gas fees for you.',
    requirements: [
      'Wallet where the fraudulent transactions occurred',
      'Friend or trusted party who can pay for gas',
    ],
    icon: <Users className="h-6 w-6" />,
  },
];

/**
 * Displays registration method options as selectable cards.
 */
export function RegistrationMethodSelector({
  onSelect,
  p2pAvailable = true,
  registryType = 'wallet',
  connectedWalletRegistered = false,
  className,
}: RegistrationMethodSelectorProps) {
  const baseMethods = registryType === 'transaction' ? TRANSACTION_METHODS : WALLET_METHODS;
  const methods = baseMethods.map((method) => {
    // For wallet registry: standard and selfRelay are blocked if wallet is already registered
    const isBlockedByRegistration =
      registryType === 'wallet' &&
      connectedWalletRegistered &&
      (method.type === 'standard' || method.type === 'selfRelay');

    // P2P relay is blocked if not available
    const isBlockedByP2pUnavailable = method.type === 'p2pRelay' && !p2pAvailable;

    let disabledReasonKey: DisabledReasonKey | undefined;
    if (isBlockedByRegistration) {
      disabledReasonKey = 'walletRegistered';
    } else if (isBlockedByP2pUnavailable) {
      disabledReasonKey = 'p2pUnavailable';
    }

    return {
      ...method,
      disabled: isBlockedByRegistration || isBlockedByP2pUnavailable,
      disabledReasonKey,
    };
  });

  return (
    <div
      role="group"
      aria-label="Registration method"
      className={cn('grid gap-4 md:grid-cols-3', className)}
    >
      {methods.map((method) => {
        const isDisabled = method.disabled;

        return (
          <Card
            key={method.type}
            role="button"
            tabIndex={isDisabled ? -1 : 0}
            aria-disabled={isDisabled}
            onClick={() => !isDisabled && onSelect(method.type)}
            onKeyDown={(e) => {
              if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(method.type);
              }
            }}
            className={cn(
              'group h-full cursor-pointer transition-all',
              isDisabled && 'opacity-50 cursor-not-allowed',
              !isDisabled && 'hover:ring-2 hover:ring-primary hover:border-primary hover:shadow-lg'
            )}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {method.icon}
                </div>
                {isDisabled && method.disabledReasonKey && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary">
                        {DISABLED_REASON_CONFIG[method.disabledReasonKey].label}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      {DISABLED_REASON_CONFIG[method.disabledReasonKey].message}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <CardTitle className="text-lg mt-2">{method.title}</CardTitle>
              <CardDescription className="min-h-[3rem]">{method.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Requirements
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {method.requirements.map((req, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
