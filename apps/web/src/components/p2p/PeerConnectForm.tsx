/**
 * PeerConnectForm component for connecting to a remote peer by ID.
 *
 * Used by the registeree to connect to a relayer.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { peerIdFromString } from '@libp2p/peer-id';
import { isPeerId } from '@libp2p/interface';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/logger';

const formSchema = z.object({
  peerId: z.string().refine(
    (value) => {
      try {
        const peerId = peerIdFromString(value);
        return isPeerId(peerId);
      } catch {
        return false;
      }
    },
    { message: 'Invalid Peer ID. Please check and try again.' }
  ),
});

type FormValues = z.infer<typeof formSchema>;

interface PeerConnectFormProps {
  /** Called when connection is initiated */
  onConnect: (peerId: string) => Promise<void>;
  /** Whether connection is in progress */
  isConnecting?: boolean;
  /** Error message to display */
  error?: string | null;
}

/**
 * Form for connecting to a remote peer by their ID.
 */
export function PeerConnectForm({ onConnect, isConnecting, error }: PeerConnectFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      peerId: '',
    },
  });

  const handleSubmit = async (values: FormValues) => {
    logger.p2p.info('Initiating peer connection', { targetPeerId: values.peerId });
    try {
      await onConnect(values.peerId);
    } catch (err) {
      logger.p2p.error('Peer connection failed', { targetPeerId: values.peerId }, err as Error);
      // Error will be shown via the error prop from parent
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="peerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Partner Peer ID</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter your relayer's Peer ID"
                  {...field}
                  disabled={isConnecting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && (
          <div role="alert" aria-live="polite" className="text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isConnecting}>
          {isConnecting ? 'Connecting...' : 'Connect to Peer'}
        </Button>
      </form>
    </Form>
  );
}
