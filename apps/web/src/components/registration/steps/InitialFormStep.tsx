/**
 * Initial form step for registration.
 *
 * Collects addresses and NFT options, then triggers acknowledgement signing.
 */

import { useState, useRef, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAccount, useChainId } from 'wagmi';
import { isAddress } from 'viem';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { useRegistrationStore } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useSignEIP712 } from '@/hooks/useSignEIP712';
import { useAcknowledgementHashStruct } from '@/hooks/useGenerateHashStruct';
import { useContractNonce } from '@/hooks/useContractNonce';
import { storeSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';

export interface InitialFormStepProps {
  /** Called when step is complete */
  onComplete: () => void;
}

// Single schema for form validation (relayer is optional, validated in handleFormSubmit)
const formSchema = z.object({
  registeree: z.string().refine((val) => isAddress(val), {
    message: 'Invalid Ethereum address',
  }),
  relayer: z.string(),
  supportNFT: z.boolean(),
  walletNFT: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Initial form step that collects data and triggers ACK signing.
 */
export function InitialFormStep({ onComplete }: InitialFormStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { registrationType } = useRegistrationStore();
  const { setFormValues } = useFormStore();

  const isSelfRelay = registrationType === 'selfRelay';

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      registeree: address || '',
      relayer: isSelfRelay ? '' : address || '',
      supportNFT: false,
      walletNFT: false,
    },
  });

  // Local state
  const [showSignature, setShowSignature] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus>('idle');
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signature, setSignature] = useState<`0x${string}` | null>(null);

  // Ref for timeout cleanup
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

  // Watch form values for validation using useWatch (React Compiler compatible)
  const watchedRelayer = useWatch({ control: form.control, name: 'relayer' });
  const watchedRegisteree = useWatch({ control: form.control, name: 'registeree' });

  // Determine forwarder address (who will submit the tx)
  // Use explicit type narrowing to ensure valid Ethereum address format
  const forwarderAddress = isSelfRelay
    ? isAddress(watchedRelayer)
      ? (watchedRelayer as `0x${string}`)
      : undefined
    : address;

  // Contract hooks
  const { nonce, isLoading: nonceLoading, isError: nonceError } = useContractNonce(address);
  const {
    data: hashStructData,
    isLoading: hashLoading,
    isError: hashError,
    refetch: refetchHashStruct,
  } = useAcknowledgementHashStruct(
    forwarderAddress && isAddress(forwarderAddress) ? forwarderAddress : undefined
  );

  const { signAcknowledgement, isPending: isSigning, reset: resetSigning } = useSignEIP712();

  const isContractDataLoading = nonceLoading || hashLoading;
  const hasContractError = nonceError || hashError;

  // Validate relayer is different from registeree in self-relay mode
  const relayerSameAsRegisteree =
    isSelfRelay &&
    watchedRelayer &&
    watchedRegisteree &&
    isAddress(watchedRelayer) &&
    isAddress(watchedRegisteree) &&
    areAddressesEqual(watchedRelayer as `0x${string}`, watchedRegisteree as `0x${string}`);

  /**
   * Handle form submission - show signature card.
   */
  const handleFormSubmit = async (values: FormValues) => {
    logger.registration.info('Form submitted', {
      registrationType,
      registeree: values.registeree,
      relayer: isSelfRelay ? values.relayer : 'same as registeree',
      isSelfRelay,
    });

    // Validate relayer for self-relay mode
    if (isSelfRelay) {
      if (!values.relayer || !isAddress(values.relayer)) {
        logger.registration.warn('Invalid relayer address in self-relay mode', {
          relayer: values.relayer,
        });
        form.setError('relayer', {
          type: 'manual',
          message: 'Valid Ethereum address required',
        });
        return;
      }
      if (relayerSameAsRegisteree) {
        logger.registration.warn('Relayer same as registeree - validation failed', {
          registeree: values.registeree,
          relayer: values.relayer,
        });
        form.setError('relayer', {
          type: 'manual',
          message: 'Gas wallet must be different from stolen wallet',
        });
        return;
      }
    }

    // Save form values to store
    const formData = {
      registeree: values.registeree as `0x${string}`,
      relayer: (isSelfRelay ? values.relayer : values.registeree) as `0x${string}`,
      supportNFT: values.supportNFT,
      walletNFT: values.walletNFT,
    };
    setFormValues(formData);
    logger.store.debug('Form values saved to store', formData);

    // Refetch hash struct to get fresh deadline
    logger.contract.debug('Refetching hash struct for fresh deadline');
    await refetchHashStruct();

    // Show signature card
    logger.registration.info('Proceeding to signature step');
    setShowSignature(true);
  };

  /**
   * Handle signing the acknowledgement.
   */
  const handleSign = async () => {
    logger.signature.info('Acknowledgement sign requested', {
      hasAddress: !!address,
      hasHashStructData: !!hashStructData,
      hasNonce: nonce !== undefined,
    });

    if (!address || !hashStructData || nonce === undefined) {
      logger.signature.error('Missing required data for acknowledgement signing', {
        address,
        hashStructData: !!hashStructData,
        nonce,
      });
      setSignatureError('Missing required data for signing');
      setSignatureStatus('error');
      return;
    }

    setSignatureStatus('signing');
    setSignatureError(null);

    try {
      const forwarder = isSelfRelay ? (form.getValues('relayer') as `0x${string}`) : address;

      logger.signature.info('Requesting EIP-712 acknowledgement signature', {
        owner: address,
        forwarder,
        nonce: nonce.toString(),
        deadline: hashStructData.deadline.toString(),
        chainId,
      });

      const sig = await signAcknowledgement({
        owner: address,
        forwarder,
        nonce,
        deadline: hashStructData.deadline,
      });

      logger.signature.info('Acknowledgement signature obtained', {
        signaturePreview: `${sig.slice(0, 10)}...${sig.slice(-8)}`,
      });

      // Store signature
      storeSignature({
        signature: sig,
        deadline: hashStructData.deadline,
        nonce,
        address,
        chainId,
        step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
        storedAt: Date.now(),
      });
      logger.signature.debug('Acknowledgement signature stored in localStorage');

      setSignature(sig);
      setSignatureStatus('success');

      logger.registration.info('Acknowledgement signing complete, advancing to next step');
      // Clear any existing timeout before setting a new one
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
      // Advance to next step after short delay
      completionTimeoutRef.current = setTimeout(onComplete, 1000);
    } catch (err) {
      logger.signature.error(
        'Acknowledgement signing failed',
        { error: err instanceof Error ? err.message : String(err) },
        err instanceof Error ? err : undefined
      );
      setSignatureError(sanitizeErrorMessage(err));
      setSignatureStatus('error');
    }
  };

  /**
   * Handle retry after signing error.
   */
  const handleRetry = () => {
    resetSigning();
    setSignatureStatus('idle');
    setSignatureError(null);
  };

  // If not connected, show error
  if (!address) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Please connect your wallet to continue.</AlertDescription>
      </Alert>
    );
  }

  // Show signature card after form submit
  if (showSignature) {
    const forwarder = isSelfRelay ? (form.getValues('relayer') as `0x${string}`) : address;

    return (
      <div className="space-y-4">
        {/* Back button */}
        <Button variant="outline" onClick={() => setShowSignature(false)} disabled={isSigning}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Form
        </Button>

        {/* Loading state for contract data */}
        {isContractDataLoading && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center py-8 text-muted-foreground"
          >
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            Loading contract data...
          </div>
        )}

        {/* Error state for contract data */}
        {hasContractError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load contract data. Please try again.
              <Button variant="link" onClick={() => refetchHashStruct()} className="ml-2 p-0">
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Signature card */}
        {!isContractDataLoading && !hasContractError && hashStructData && nonce !== undefined && (
          <SignatureCard
            type="acknowledgement"
            data={{
              registeree: address,
              forwarder,
              nonce,
              deadline: hashStructData.deadline,
            }}
            status={signatureStatus}
            error={signatureError}
            signature={signature}
            onSign={handleSign}
            onRetry={handleRetry}
          />
        )}
      </div>
    );
  }

  // Show form
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        {/* Registeree field (read-only) */}
        <FormField
          control={form.control}
          name="registeree"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormLabel>Wallet to Register as Stolen</FormLabel>
                <InfoTooltip
                  content="This field shows your connected wallet address. You must sign with this wallet to prove ownership before registering it as stolen."
                  side="right"
                />
              </div>
              <FormControl>
                <Input {...field} readOnly className="font-mono bg-muted" />
              </FormControl>
              <FormDescription>
                This is your currently connected wallet. It will be registered as stolen.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Relayer field (self-relay only) */}
        {isSelfRelay && (
          <FormField
            control={form.control}
            name="relayer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gas Wallet Address</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="0x..." className="font-mono" />
                </FormControl>
                <FormDescription>
                  Enter the address of the wallet you&apos;ll use to pay gas fees. You&apos;ll need
                  to switch to this wallet after signing.
                </FormDescription>
                <FormMessage />
                {relayerSameAsRegisteree && (
                  <p className="text-sm text-destructive">
                    Gas wallet must be different from the stolen wallet.
                  </p>
                )}
              </FormItem>
            )}
          />
        )}

        {/* Soul Bound Token Options (Phase 2 - disabled for now) */}
        <div className="space-y-4 rounded-lg border p-4 bg-muted/50">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Optional Soul Bound Tokens</p>
            <InfoTooltip
              content="Soul Bound Tokens (SBTs) are non-transferable tokens permanently linked to your wallet address. Unlike regular NFTs, they cannot be sold or moved, making them ideal for identity and reputation markers."
              side="right"
            />
          </div>
          <FormField
            control={form.control}
            name="supportNFT"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled // Disabled for Phase 1
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="text-sm font-normal text-muted-foreground">
                    Support Token ($3) - Coming Soon
                  </FormLabel>
                </div>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="walletNFT"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled // Disabled for Phase 1
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="text-sm font-normal text-muted-foreground">
                    Wallet Token ($3) - Coming Soon
                  </FormLabel>
                </div>
              </FormItem>
            )}
          />
        </div>

        {/* Submit button */}
        <Button type="submit" className="w-full" size="lg" disabled={isContractDataLoading}>
          {isContractDataLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            'Continue to Sign Acknowledgement'
          )}
        </Button>
      </form>
    </Form>
  );
}
