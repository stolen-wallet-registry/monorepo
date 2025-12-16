'use client';

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

interface ToasterComponentProps extends ToasterProps {
  /** Color scheme for the toaster. Defaults to 'system' which auto-detects. */
  colorScheme?: 'light' | 'dark' | 'system';
}

const Toaster = ({ colorScheme = 'system', ...props }: ToasterComponentProps) => {
  return (
    <Sonner
      theme={colorScheme}
      className="toaster group"
      closeButton
      richColors
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        duration: 4000,
        classNames: {
          closeButton:
            'absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-100 hover:text-foreground',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
