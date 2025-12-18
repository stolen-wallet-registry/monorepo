import { Alert, AlertDescription, AlertTitle, Button } from '@swr/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Compact fallback UI for ErrorBoundary when step rendering fails.
 * Designed to fit within card content areas.
 */
export function StepErrorFallback() {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Step Error</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>Something went wrong while loading this step.</span>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Reload Page
        </Button>
      </AlertDescription>
    </Alert>
  );
}
