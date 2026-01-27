'use client';

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@swr/ui';

interface RegistryCardProps {
  title: string;
  description: string;
  status: 'active' | 'coming-soon' | 'operator-only';
  icon: React.ReactNode;
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

export function RegistryCard({ title, description, status, icon, className }: RegistryCardProps) {
  const isHighlighted = status === 'active' || status === 'operator-only';
  const badge = getStatusBadge(status);
  const showBadge = status !== 'active';

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-300',
        status === 'active'
          ? 'border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5'
          : status === 'operator-only'
            ? 'border-border/70 bg-gradient-to-br from-muted/30 to-transparent hover:border-primary/30 hover:shadow-md'
            : 'border-border/50 opacity-75 hover:opacity-90',
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
          {showBadge && (
            <Badge variant={badge.variant} className="text-xs">
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
