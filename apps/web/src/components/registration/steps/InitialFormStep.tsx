/**
 * Initial form step for registration.
 *
 * Collects addresses and NFT options, then triggers acknowledgement signing.
 */

import { useState, useRef, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAccount, useChainId } from 'wagmi';
import { isAddress } from 'viem';
import { initialFormSchema, type InitialFormInput } from '@/lib/schemas';

import {
  Button,
  Alert,
  AlertDescription,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@swr/ui';
import { AddressInput } from '@/components/composed/AddressInput';
import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { useRegistrationStore } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useSignEIP712 } from '@/hooks/useSignEIP712';
import { useGenerateHashStruct } from '@/hooks/useGenerateHashStruct';
import { useContractNonce } from '@/hooks/useContractNonce';
import { storeSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import type { Address, Hex } from '@/lib/types/ethereum';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';

export interface InitialFormStepProps {
  /** Called when step is complete */
  onComplete: () => void;
}

// Form values type from shared schema
type FormValues = InitialFormInput;

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
    resolver: zodResolver(initialFormSchema),
    defaultValues: {
      registeree: address || '',
      relayer: isSelfRelay ? '' : address || '',
    },
  });

  // Local state
  const [showSignature, setShowSignature] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus>('idle');
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signature, setSignature] = useState<Hex | null>(null);

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

  // Destructure form methods for stable references (React Hook Form best practice)
  const { getValues, setValue } = form;

  // Sync registeree with connected wallet for ALL registration types before form submission
  // Once showSignature is true, the registeree is locked
  useEffect(() => {
    if (!showSignature && address) {
      const previousRegisteree = getValues('registeree');
      if (previousRegisteree !== address) {
        logger.wallet.debug('Syncing registeree with connected wallet', {
          registrationType,
          previousRegisteree,
          newRegisteree: address,
        });
        setValue('registeree', address);
      }
    }
  }, [address, showSignature, registrationType, getValues, setValue]);

  // Watch form values for validation using useWatch (React Compiler compatible)
  const watchedRelayer = useWatch({ control: form.control, name: 'relayer' });
  const watchedRegisteree = useWatch({ control: form.control, name: 'registeree' });

  // Determine forwarder address (who will submit the tx)
  // Use explicit type narrowing to ensure valid Ethereum address format
  const forwarderAddress = isSelfRelay
    ? isAddress(watchedRelayer)
      ? (watchedRelayer as Address)
      : undefined
    : address;

  // Contract hooks
  const { nonce, isLoading: nonceLoading, isError: nonceError } = useContractNonce(address);
  const {
    data: hashStructData,
    isLoading: hashLoading,
    isError: hashError,
    refetch: refetchHashStruct,
  } = useGenerateHashStruct(
    forwarderAddress, // Already validated via isAddress check above
    SIGNATURE_STEP.ACKNOWLEDGEMENT
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
    areAddressesEqual(watchedRelayer as Address, watchedRegisteree as Address);

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
      registeree: values.registeree as Address,
      relayer: (isSelfRelay ? values.relayer : values.registeree) as Address,
    };
    setFormValues(formData);
    logger.store.debug('Form values saved to store', formData);

    // Refetch hash struct to get fresh deadline (result used in handleSign)
    logger.contract.debug('Refetching hash struct for fresh deadline');
    await refetchHashStruct();

    // Show signature card (this also locks registeree from further wallet changes)
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

    if (!address || nonce === undefined) {
      logger.signature.error('Missing required data for acknowledgement signing', {
        address,
        hashStructData: !!hashStructData,
        nonce,
      });
      setSignatureError('Missing required data for signing');
      setSignatureStatus('error');
      return;
    }

    // Refetch hash struct to get fresh deadline
    logger.contract.debug('Refetching hash struct for fresh deadline');
    const refetchResult = await refetchHashStruct();
    // Refetch returns raw contract data [deadline, hashStruct], transform if present
    const rawData = refetchResult?.data as [bigint, Hex] | undefined;
    const freshDeadline = rawData?.[0] ?? hashStructData?.deadline;

    if (freshDeadline === undefined) {
      logger.signature.error('Failed to get hash struct data');
      setSignatureError('Failed to load signing data. Please try again.');
      setSignatureStatus('error');
      return;
    }

    setSignatureStatus('signing');
    setSignatureError(null);

    try {
      const forwarder = isSelfRelay ? (form.getValues('relayer') as Address) : address;

      // Generate reportedChainId (raw chain ID) and incidentTimestamp
      const reportedChainId = BigInt(chainId);
      const incidentTimestamp = 0n; // TODO: Add incident timestamp selection UI (block/tx picker)

      logger.signature.info('Requesting EIP-712 acknowledgement signature', {
        wallet: address,
        forwarder,
        reportedChainId,
        incidentTimestamp: incidentTimestamp.toString(),
        nonce: nonce.toString(),
        deadline: freshDeadline.toString(),
        chainId,
      });

      const sig = await signAcknowledgement({
        wallet: address,
        trustedForwarder: forwarder,
        reportedChainId,
        incidentTimestamp,
        nonce,
        deadline: freshDeadline,
      });

      logger.signature.info('Acknowledgement signature obtained', {
        signaturePreview: `${sig.slice(0, 10)}...${sig.slice(-8)}`,
      });

      // Store signature with all required fields
      storeSignature({
        signature: sig,
        deadline: freshDeadline,
        nonce,
        address,
        chainId,
        step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
        storedAt: Date.now(),
        reportedChainId,
        incidentTimestamp,
      });
      logger.signature.debug('Acknowledgement signature stored in sessionStorage');

      setSignature(sig);
      setSignatureStatus('success');

      logger.acknowledgement.info('Acknowledgement signing complete, advancing to next step');
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
    const forwarder = isSelfRelay ? (form.getValues('relayer') as Address) : address;

    return (
      <div className="space-y-4">
        {/* Back button */}
        <Button
          variant="outline"
          onClick={() => {
            // Clear pending completion timeout
            if (completionTimeoutRef.current) {
              clearTimeout(completionTimeoutRef.current);
              completionTimeoutRef.current = null;
            }
            // Reset signature state
            resetSigning();
            setSignatureStatus('idle');
            setSignatureError(null);
            setSignature(null);
            // Return to form
            setShowSignature(false);
          }}
          disabled={isSigning}
        >
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
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sign the EIP-712 acknowledgement message to claim your intent to register the
              connected wallet to the Stolen Wallet Registry.
            </p>
            <SignatureCard
              type="acknowledgement"
              data={{
                registeree: address,
                trustedForwarder: forwarder,
                nonce,
                deadline: hashStructData.deadline,
                chainId,
              }}
              status={signatureStatus}
              error={signatureError}
              signature={signature}
              onSign={handleSign}
              onRetry={handleRetry}
            />
          </div>
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
                <AddressInput {...field} readOnly addressType="ethereum" className="bg-muted" />
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
                <div className="flex items-center gap-2">
                  <FormLabel>Gas Wallet Address</FormLabel>
                  <InfoTooltip
                    content="This is a separate wallet you control that has funds for gas fees. After signing with your stolen wallet, you'll switch to this wallet to submit the transaction."
                    side="right"
                  />
                </div>
                <FormControl>
                  <AddressInput {...field} placeholder="0x..." addressType="ethereum" />
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
