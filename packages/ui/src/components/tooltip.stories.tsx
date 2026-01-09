import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { Button } from './button';
import { InfoIcon, HelpCircleIcon, CopyIcon } from 'lucide-react';

const meta = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>This is a tooltip</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon">
          <InfoIcon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>More information</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Positions: Story = {
  render: () => (
    <div className="flex gap-8">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Top</Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Tooltip on top</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Bottom</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Tooltip on bottom</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Left</Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Tooltip on left</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Right</Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Tooltip on right</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const AddressTooltip: Story = {
  name: 'Wallet Address Copy',
  render: () => (
    <div className="flex items-center gap-2">
      <code className="text-sm bg-muted px-2 py-1 rounded">0x742d...5f0bEb</code>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <CopyIcon className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Copy full address</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const HelpTooltip: Story = {
  name: 'Form Field Help',
  render: () => (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Grace Period</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center focus:outline-0 focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-label="What is the grace period?"
          >
            <HelpCircleIcon className="h-4 w-4 text-muted-foreground cursor-help" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[200px]">
          <p>
            A randomized delay of 1-4 minutes between acknowledgement and registration to prevent
            phishing attacks.
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const StatusTooltip: Story = {
  name: 'Status Badge Tooltip',
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive cursor-help focus:outline-0 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="View wallet status details"
        >
          Compromised
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Registered on Dec 10, 2025 via P2P Relay</p>
      </TooltipContent>
    </Tooltip>
  ),
};
