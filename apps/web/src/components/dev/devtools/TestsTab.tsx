/**
 * DevTools "tests" tab panel - toast variants and the ErrorBoundary trigger.
 *
 * The error itself is thrown by a component the parent mounts (via errorKey), so this
 * panel only reports the intent upwards through onTriggerError.
 */

import { toast } from 'sonner';

interface TestsTabProps {
  /** Called when the user asks for an error to be thrown, to test the ErrorBoundary */
  onTriggerError: () => void;
}

export function TestsTab({ onTriggerError }: TestsTabProps) {
  return (
    <>
      {/* Toast Tests */}
      <div className="mb-4">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">Toast Tests</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toast.success('Success! Operation completed.')}
            className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
          >
            Success
          </button>
          <button
            type="button"
            onClick={() => toast.error('Error! Something went wrong.')}
            className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
          >
            Error
          </button>
          <button
            type="button"
            onClick={() => toast.warning('Warning! Check this out.')}
            className="rounded bg-yellow-600 px-2 py-1 text-xs text-white hover:bg-yellow-700"
          >
            Warning
          </button>
          <button
            type="button"
            onClick={() => toast.info('Info: Here is some information.')}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
          >
            Info
          </button>
          <button
            type="button"
            onClick={() => {
              const id = toast.loading('Loading... (auto-completes in 2s)');
              setTimeout(() => {
                toast.success('Loading complete!', { id });
              }, 2000);
            }}
            className="rounded bg-gray-600 px-2 py-1 text-xs text-white hover:bg-gray-700"
          >
            Loading
          </button>
        </div>
      </div>

      {/* Error Boundary Test */}
      <div className="border-t border-border pt-3">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">Error Boundary Test</h4>
        <button
          type="button"
          onClick={onTriggerError}
          className="rounded bg-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-800"
        >
          Trigger Error
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          Throws an error to test the ErrorBoundary UI
        </p>
      </div>
    </>
  );
}
