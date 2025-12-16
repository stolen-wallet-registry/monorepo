import type { Meta, StoryObj } from '@storybook/react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './select';

const meta = {
  title: 'Primitives/Select',
  component: Select,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select option" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option1">Option 1</SelectItem>
        <SelectItem value="option2">Option 2</SelectItem>
        <SelectItem value="option3">Option 3</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const WithGroups: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select chain" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Layer 2</SelectLabel>
          <SelectItem value="base">Base</SelectItem>
          <SelectItem value="optimism">Optimism</SelectItem>
          <SelectItem value="arbitrum">Arbitrum</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Layer 1</SelectLabel>
          <SelectItem value="ethereum">Ethereum</SelectItem>
          <SelectItem value="polygon">Polygon</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const ChainSelector: Story = {
  name: 'Chain Selector',
  render: () => (
    <Select defaultValue="base">
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select chain" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="base">Base (Recommended)</SelectItem>
        <SelectItem value="optimism">Optimism</SelectItem>
        <SelectItem value="arbitrum">Arbitrum</SelectItem>
        <SelectItem value="ethereum">Ethereum Mainnet</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const RegistryTypeSelector: Story = {
  name: 'Registry Type',
  render: () => (
    <Select defaultValue="wallet">
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Select registry" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="wallet">Stolen Wallet Registry</SelectItem>
        <SelectItem value="transaction">Transaction Registry</SelectItem>
        <SelectItem value="contract">Fraudulent Contract Registry</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const SmallSize: Story = {
  render: () => (
    <Select>
      <SelectTrigger size="sm" className="w-[140px]">
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="es">Spanish</SelectItem>
        <SelectItem value="fr">French</SelectItem>
        <SelectItem value="de">German</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Disabled" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option1">Option 1</SelectItem>
      </SelectContent>
    </Select>
  ),
};
