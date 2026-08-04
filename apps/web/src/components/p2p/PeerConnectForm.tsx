/**
 * PeerConnectForm: the single input in the P2P pairing flow.
 *
 * Used by the relayer (the gas payer) to paste the pairing code published by the party being
 * helped. The code carries the wallet the relayer would be paying for as well as the peer to
 * dial, so this input is validated with `decodePairingToken` rather than a peer-ID check —
 * and a bare peer ID is refused, with the decoder's own explanation, instead of being accepted
 * as a pairing with an unknown wallet (audit V4).
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@swr/ui';
import { decodePairingToken } from '@/lib/p2p/pairingToken';
import { logger } from '@/lib/logger';

const formSchema = z.object({
  // superRefine rather than refine so the decoder's own message survives: it is the only
  // place that can say "that is a Peer ID on its own, ask for the full code", which is what
  // stops a user from concluding the app is broken and hunting for a way around it.
  peerId: z.string().superRefine((value, ctx) => {
    const result = decodePairingToken(value);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.message });
    }
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface PeerConnectFormProps {
  /** Called with the raw pairing code once it parses. The caller decodes it again — this form
   * validates, it does not own the binding. */
  onConnect: (pairingCode: string) => Promise<void>;
  /** Whether connection is in progress */
  isConnecting?: boolean;
  /** Error message to display */
  error?: string | null;
}

/**
 * Form for connecting to a partner using their pairing code.
 */
export function PeerConnectForm({ onConnect, isConnecting, error }: PeerConnectFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      peerId: '',
    },
  });

  const handleSubmit = async (values: FormValues) => {
    logger.p2p.info('Initiating peer connection from pairing code');
    try {
      await onConnect(values.peerId);
    } catch (err) {
      logger.p2p.error('Peer connection failed', {}, err as Error);
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
              <FormLabel>Partner pairing code</FormLabel>
              <FormControl>
                <Input
                  placeholder="swr1:<peer id>:<wallet address>"
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
          {isConnecting ? 'Connecting...' : 'Connect to Partner'}
        </Button>
      </form>
    </Form>
  );
}
