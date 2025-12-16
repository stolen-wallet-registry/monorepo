/**
 * Registration method selector component.
 *
 * Allows users to choose between Standard, Self-Relay, and P2P-Relay
 * registration methods with descriptions of each.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from '@swr/ui';
import { cn } from '@/lib/utils';
import { Wallet, RefreshCw, Users } from 'lucide-react';
import type { RegistrationType } from '@/stores/registrationStore';

export interface MethodConfig {
  type: RegistrationType;
  title: string;
  description: string;
  requirements: string[];
  icon: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

export interface RegistrationMethodSelectorProps {
  /** Currently selected method */
  selected: RegistrationType | null;
  /** Callback when a method is selected */
  onSelect: (type: RegistrationType) => void;
  /** Whether P2P relay is available (has connected peer) */
  p2pAvailable?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Default method configurations.
 */
const DEFAULT_METHODS: MethodConfig[] = [
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
    requirements: ['Stolen wallet for signing', 'Second wallet for gas'],
    icon: <RefreshCw className="h-6 w-6" />,
  },
  {
    type: 'p2pRelay',
    title: 'P2P Relay Registration',
    description: 'Sign with your stolen wallet and have a trusted helper pay the gas fees for you.',
    requirements: ['Stolen wallet for signing', 'Connected helper peer'],
    icon: <Users className="h-6 w-6" />,
  },
];

/**
 * Displays registration method options as selectable cards.
 */
export function RegistrationMethodSelector({
  selected,
  onSelect,
  p2pAvailable = true,
  className,
}: RegistrationMethodSelectorProps) {
  const methods = DEFAULT_METHODS.map((method) => ({
    ...method,
    disabled: method.type === 'p2pRelay' && !p2pAvailable,
    disabledReason:
      method.type === 'p2pRelay' && !p2pAvailable ? 'No helper peer available' : undefined,
  }));

  return (
    <div
      role="radiogroup"
      aria-label="Registration method"
      className={cn('grid gap-4 md:grid-cols-3', className)}
    >
      {methods.map((method) => {
        const isSelected = selected === method.type;
        const isDisabled = method.disabled;

        return (
          <Card
            key={method.type}
            role="radio"
            tabIndex={isDisabled ? -1 : 0}
            aria-checked={isSelected}
            aria-disabled={isDisabled}
            onClick={() => !isDisabled && onSelect(method.type)}
            onKeyDown={(e) => {
              if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(method.type);
              }
            }}
            className={cn(
              'h-full cursor-pointer transition-all',
              isSelected && 'ring-2 ring-primary border-primary',
              isDisabled && 'opacity-50 cursor-not-allowed',
              !isSelected && !isDisabled && 'hover:border-primary/50'
            )}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    'p-2 rounded-lg',
                    isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  )}
                >
                  {method.icon}
                </div>
                {isSelected && <Badge variant="default">Selected</Badge>}
                {isDisabled && method.disabledReason && (
                  <Badge variant="secondary">{method.disabledReason}</Badge>
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
