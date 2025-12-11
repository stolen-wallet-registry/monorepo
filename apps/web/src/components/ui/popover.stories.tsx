import type { Meta, StoryObj } from '@storybook/react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Primitives/Popover',
  component: Popover,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open Popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Dimensions</h4>
            <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="width">Width</Label>
              <Input id="width" defaultValue="100%" className="col-span-2 h-8" />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="height">Height</Label>
              <Input id="height" defaultValue="25px" className="col-span-2 h-8" />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const PeerIdPopover: Story = {
  name: 'P2P Peer ID Share',
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Share Peer ID</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Your Peer ID</h4>
            <p className="text-sm text-muted-foreground">
              Share this with your relay helper to connect.
            </p>
          </div>
          <div className="flex gap-2">
            <Input readOnly value="12D3KooWExample..." className="font-mono text-xs" />
            <Button size="sm" variant="secondary">
              Copy
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const ConnectPeerPopover: Story = {
  name: 'Connect to Peer',
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Connect to Peer</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Connect to Relay Helper</h4>
            <p className="text-sm text-muted-foreground">
              Enter your helper&apos;s Peer ID to establish connection.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="peerId">Peer ID</Label>
            <Input id="peerId" placeholder="12D3KooW..." className="font-mono text-xs" />
          </div>
          <Button className="w-full">Connect</Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const WalletInfoPopover: Story = {
  name: 'Wallet Info',
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="font-mono text-sm">
          0x742d...5f0bEb
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="grid gap-3">
          <div className="space-y-1">
            <h4 className="font-medium leading-none">Wallet Details</h4>
            <p className="text-xs text-muted-foreground font-mono break-all">
              0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
            </p>
          </div>
          <div className="grid gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="text-destructive font-medium">Compromised</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Registered</span>
              <span>Dec 10, 2025</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method</span>
              <span>P2P Relay</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full">
            View on Explorer
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const Positions: Story = {
  render: () => (
    <div className="flex gap-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Top</Button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-40">
          <p className="text-sm">Popover on top</p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Bottom</Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" className="w-40">
          <p className="text-sm">Popover on bottom</p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Left</Button>
        </PopoverTrigger>
        <PopoverContent side="left" className="w-40">
          <p className="text-sm">Popover on left</p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Right</Button>
        </PopoverTrigger>
        <PopoverContent side="right" className="w-40">
          <p className="text-sm">Popover on right</p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};
