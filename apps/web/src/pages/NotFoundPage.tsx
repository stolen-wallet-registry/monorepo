/**
 * 404 Not Found page.
 */

import { useLocation } from 'wouter';
import { Home } from 'lucide-react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@swr/ui';

export function NotFoundPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="container max-w-md py-16">
      <Card className="text-center">
        <CardHeader>
          <CardTitle className="text-6xl font-bold text-muted-foreground">404</CardTitle>
          <CardDescription className="text-lg">Page Not Found</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Button onClick={() => setLocation('/')}>
            <Home className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
