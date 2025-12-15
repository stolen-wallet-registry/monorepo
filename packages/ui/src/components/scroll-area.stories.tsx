import type { Meta, StoryObj } from '@storybook/react';
import { ScrollArea } from './scroll-area';
import { Separator } from './separator';

const meta = {
  title: 'Primitives/ScrollArea',
  component: ScrollArea,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const tags = Array.from({ length: 50 }).map((_, i, a) => `v1.2.0-beta.${a.length - i}`);

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-72 w-48 rounded-md border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Tags</h4>
        {tags.map((tag) => (
          <div key={tag}>
            <div className="text-sm">{tag}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

const wallets = [
  { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', date: 'Dec 10, 2025' },
  { address: '0x1234567890abcdef1234567890abcdef12345678', date: 'Dec 9, 2025' },
  { address: '0xabcdef1234567890abcdef1234567890abcdef12', date: 'Dec 8, 2025' },
  { address: '0x9876543210fedcba9876543210fedcba98765432', date: 'Dec 7, 2025' },
  { address: '0xfedcba9876543210fedcba9876543210fedcba98', date: 'Dec 6, 2025' },
  { address: '0x1111222233334444555566667777888899990000', date: 'Dec 5, 2025' },
  { address: '0xaaaa2222bbbb3333cccc4444dddd5555eeee6666', date: 'Dec 4, 2025' },
  { address: '0x0000111122223333444455556666777788889999', date: 'Dec 3, 2025' },
];

export const RegisteredWalletsList: Story = {
  name: 'Registered Wallets',
  render: () => (
    <ScrollArea className="h-[300px] w-[350px] rounded-md border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Recently Registered</h4>
        {wallets.map((wallet) => (
          <div key={wallet.address}>
            <div className="flex justify-between items-center py-2">
              <code className="text-xs font-mono">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </code>
              <span className="text-xs text-muted-foreground">{wallet.date}</span>
            </div>
            <Separator />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
];

export const LanguageSelector: Story = {
  name: 'Language List',
  render: () => (
    <ScrollArea className="h-[200px] w-[200px] rounded-md border">
      <div className="p-2">
        {languages.map((lang) => (
          <div
            key={lang.code}
            className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent cursor-pointer"
          >
            <span className="text-muted-foreground">{lang.code.toUpperCase()}</span>
            <span>{lang.name}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const HorizontalScroll: Story = {
  render: () => (
    <ScrollArea className="w-96 whitespace-nowrap rounded-md border">
      <div className="flex w-max space-x-4 p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="shrink-0 w-[150px] h-[100px] rounded-md border flex items-center justify-center bg-muted/30"
          >
            <span className="text-sm text-muted-foreground">Item {i + 1}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const TransactionHistory: Story = {
  name: 'Transaction History',
  render: () => (
    <ScrollArea className="h-[250px] w-[400px] rounded-md border">
      <div className="p-4 space-y-3">
        <h4 className="text-sm font-medium">Transaction History</h4>
        {[
          { type: 'Acknowledgement', hash: '0xabc...def', status: 'Confirmed' },
          { type: 'Registration', hash: '0x123...456', status: 'Confirmed' },
          { type: 'Acknowledgement', hash: '0x789...012', status: 'Pending' },
          { type: 'Registration', hash: '0xfed...cba', status: 'Failed' },
          { type: 'Acknowledgement', hash: '0x456...789', status: 'Confirmed' },
          { type: 'Registration', hash: '0x012...345', status: 'Confirmed' },
        ].map((tx, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">{tx.type}</div>
              <code className="text-xs text-muted-foreground">{tx.hash}</code>
            </div>
            <span
              className={
                tx.status === 'Confirmed'
                  ? 'text-green-600'
                  : tx.status === 'Failed'
                    ? 'text-destructive'
                    : 'text-yellow-600'
              }
            >
              {tx.status}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};
