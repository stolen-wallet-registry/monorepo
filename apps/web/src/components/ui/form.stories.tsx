import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form';
import { Input } from './input';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

// Use a wrapper component for the meta since Form is FormProvider
function FormWrapper({ children }: { children: React.ReactNode }) {
  return <div className="w-full">{children}</div>;
}

const meta = {
  title: 'Primitives/Form',
  component: FormWrapper,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof FormWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic form schema
const basicSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
});

type BasicFormValues = z.infer<typeof basicSchema>;

function BasicFormExample() {
  const form = useForm<BasicFormValues>({
    resolver: zodResolver(basicSchema),
    defaultValues: {
      username: '',
      email: '',
    },
  });

  function onSubmit(values: BasicFormValues) {
    console.log(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-[350px] space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormDescription>Your public display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="Enter email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}

export const Default: Story = {
  args: { children: null },
  render: () => <BasicFormExample />,
};

// Wallet registration schema
const walletSchema = z.object({
  walletAddress: z
    .string()
    .min(1, 'Wallet address is required')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  relayerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')
    .optional()
    .or(z.literal('')),
  mintNft: z.boolean(),
  notifyExchanges: z.boolean(),
});

type WalletFormValues = z.infer<typeof walletSchema>;

function WalletRegistrationFormExample() {
  const form = useForm<WalletFormValues>({
    resolver: zodResolver(walletSchema),
    defaultValues: {
      walletAddress: '',
      relayerAddress: '',
      mintNft: true,
      notifyExchanges: false,
    },
  });

  function onSubmit(values: WalletFormValues) {
    console.log(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-[400px] space-y-6">
        <FormField
          control={form.control}
          name="walletAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Compromised Wallet Address</FormLabel>
              <FormControl>
                <Input placeholder="0x..." className="font-mono" {...field} />
              </FormControl>
              <FormDescription>The wallet address you want to register as stolen.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="relayerAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trusted Relayer (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="0x..." className="font-mono" {...field} />
              </FormControl>
              <FormDescription>
                Address that can submit the registration on your behalf.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="mintNft"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Mint Soulbound NFT</FormLabel>
                <FormDescription>
                  Creates an on-chain marker visible to all wallets and exchanges.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notifyExchanges"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Notify Connected Exchanges</FormLabel>
                <FormDescription>Send alerts to registered exchange operators.</FormDescription>
              </div>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full">
          Sign Acknowledgement
        </Button>
      </form>
    </Form>
  );
}

export const WalletRegistration: Story = {
  name: 'Wallet Registration Form',
  args: { children: null },
  render: () => <WalletRegistrationFormExample />,
};

// Chain selector form
const chainSchema = z.object({
  chain: z.string().min(1, 'Please select a chain'),
  registryType: z.string().min(1, 'Please select a registry type'),
});

type ChainFormValues = z.infer<typeof chainSchema>;

function ChainSelectorFormExample() {
  const form = useForm<ChainFormValues>({
    resolver: zodResolver(chainSchema),
    defaultValues: {
      chain: '',
      registryType: '',
    },
  });

  function onSubmit(values: ChainFormValues) {
    console.log(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-[350px] space-y-6">
        <FormField
          control={form.control}
          name="chain"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Blockchain Network</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a chain" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="base">Base (Recommended)</SelectItem>
                  <SelectItem value="optimism">Optimism</SelectItem>
                  <SelectItem value="arbitrum">Arbitrum</SelectItem>
                  <SelectItem value="ethereum">Ethereum Mainnet</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Where the registration will be recorded.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="registryType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Registry Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select registry" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="wallet">Stolen Wallet</SelectItem>
                  <SelectItem value="transaction">Fraudulent Transaction</SelectItem>
                  <SelectItem value="contract">Malicious Contract</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Type of fraud you are reporting.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">Continue</Button>
      </form>
    </Form>
  );
}

export const ChainSelector: Story = {
  name: 'Chain & Registry Selector',
  args: { children: null },
  render: () => <ChainSelectorFormExample />,
};

// Form with validation errors shown
const errorSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});

type ErrorFormValues = z.infer<typeof errorSchema>;

function FormWithErrorsExample() {
  const form = useForm<ErrorFormValues>({
    resolver: zodResolver(errorSchema),
    defaultValues: {
      walletAddress: 'invalid-address',
    },
  });

  // Trigger validation on mount to show errors
  React.useEffect(() => {
    form.trigger();
  }, [form]);

  return (
    <Form {...form}>
      <form className="w-[400px] space-y-6">
        <FormField
          control={form.control}
          name="walletAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Compromised Wallet Address</FormLabel>
              <FormControl>
                <Input placeholder="0x..." className="font-mono" {...field} />
              </FormControl>
              <FormDescription>The wallet address you want to register as stolen.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}

export const WithValidationErrors: Story = {
  name: 'With Validation Errors',
  args: { children: null },
  render: () => <FormWithErrorsExample />,
};
