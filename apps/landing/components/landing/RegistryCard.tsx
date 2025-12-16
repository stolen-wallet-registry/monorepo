'use client';

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@swr/ui';

interface RegistryCardProps {
  title: string;
  description: string;
  status: 'active' | 'coming-soon';
  icon: React.ReactNode;
  className?: string;
}

export function RegistryCard({ title, description, status, icon, className }: RegistryCardProps) {
  const isActive = status === 'active';

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-300',
        isActive
          ? 'border-primary/20 bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5'
          : 'border-border/50 opacity-75 hover:opacity-90',
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
