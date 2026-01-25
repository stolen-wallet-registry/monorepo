/**
 * Registry type card component.
 *
 * Displays a registry type (wallet, transaction, contract) with status badge.
 * Cards are clickable when an onClick handler is provided.
 */

import type { ComponentProps } from 'react';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@swr/ui';
import { cn } from '@/lib/utils';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

export interface RegistryCardProps {
  /** Registry title */
  title: string;
  /** Registry description */
  description: React.ReactNode;
  /** Icon to display */
  icon: React.ReactNode;
  /** Click handler for navigation */
  onClick?: () => void;
  /** Optional badge (e.g., Operators Only) */
  badge?: { label: string; variant?: BadgeVariant };
  /** Additional class names */
  className?: string;
}

export function RegistryCard({
  title,
  description,
  icon,
  onClick,
  badge,
  className,
}: RegistryCardProps) {
  const isClickable = Boolean(onClick);

  return (
    <Card
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        'relative overflow-hidden transition-all duration-300',
        'border-primary/20 bg-gradient-to-br from-primary/5 to-transparent',
        isClickable &&
          'cursor-pointer hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          {badge && (
            <Badge variant={badge.variant ?? 'secondary'} className="text-xs">
              {badge.label}
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
