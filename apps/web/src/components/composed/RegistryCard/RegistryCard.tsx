/**
 * Registry type card component.
 *
 * Displays a registry type (wallet, transaction, contract) with status badge.
 * Active registries are clickable, coming-soon registries are disabled.
 */

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@swr/ui';
import { cn } from '@/lib/utils';

export interface RegistryCardProps {
  /** Registry title */
  title: string;
  /** Registry description */
  description: string;
  /** Status - active registries are clickable */
  status: 'active' | 'coming-soon' | 'operator-only';
  /** Icon to display */
  icon: React.ReactNode;
  /** Click handler for active registries */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
}

function getStatusBadge(status: RegistryCardProps['status']) {
  switch (status) {
    case 'active':
      return { label: 'Active', variant: 'default' as const };
    case 'operator-only':
      return { label: 'Operators Only', variant: 'outline' as const };
    case 'coming-soon':
    default:
      return { label: 'Coming Soon', variant: 'secondary' as const };
  }
}

export function RegistryCard({
  title,
  description,
  status,
  icon,
  onClick,
  className,
}: RegistryCardProps) {
  const isClickable = status === 'active';
  const isHighlighted = status === 'active' || status === 'operator-only';
  const badge = getStatusBadge(status);

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
        isClickable
          ? 'cursor-pointer border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          : status === 'operator-only'
            ? 'border-border/70 bg-gradient-to-br from-muted/30 to-transparent'
            : 'border-border/50 opacity-75',
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="mb-3 flex items-center justify-between">
          <div
            className={cn(
              'flex size-12 items-center justify-center rounded-lg',
              isHighlighted ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            {icon}
          </div>
          <Badge variant={badge.variant} className="text-xs">
            {badge.label}
          </Badge>
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
