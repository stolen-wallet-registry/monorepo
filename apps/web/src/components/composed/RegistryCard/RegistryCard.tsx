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
  status: 'active' | 'coming-soon';
  /** Icon to display */
  icon: React.ReactNode;
  /** Click handler for active registries */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
}

export function RegistryCard({
  title,
  description,
  status,
  icon,
  onClick,
  className,
}: RegistryCardProps) {
  const isActive = status === 'active';

  return (
    <Card
      role={isActive ? 'button' : undefined}
      tabIndex={isActive ? 0 : undefined}
      onClick={isActive ? onClick : undefined}
      onKeyDown={
        isActive
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
        isActive
          ? 'cursor-pointer border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          : 'border-border/50 opacity-75',
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="mb-3 flex items-center justify-between">
          <div
            className={cn(
              'flex size-12 items-center justify-center rounded-lg',
              isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            {icon}
          </div>
          <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs">
            {isActive ? 'Active' : 'Coming Soon'}
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
