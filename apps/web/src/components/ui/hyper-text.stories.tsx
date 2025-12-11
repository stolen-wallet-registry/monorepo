import type { Meta, StoryObj } from '@storybook/react';
import { HyperText } from './hyper-text';

const meta = {
  title: 'Magic UI/HyperText',
  component: HyperText,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    duration: {
      control: { type: 'range', min: 200, max: 2000, step: 100 },
    },
    delay: {
      control: { type: 'range', min: 0, max: 2000, step: 100 },
    },
    animateOnHover: {
      control: 'boolean',
    },
    startOnView: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof HyperText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'STOLEN WALLET',
    className: 'text-4xl font-bold',
  },
};

export const HoverToAnimate: Story = {
  name: 'Hover to Animate',
  args: {
    children: 'HOVER ME',
    animateOnHover: true,
    className: 'text-3xl font-bold cursor-pointer',
  },
};

export const StartOnView: Story = {
  name: 'Animate on View',
  args: {
    children: 'REGISTRY',
    startOnView: true,
    animateOnHover: false,
    className: 'text-4xl font-bold',
  },
};

export const FastScramble: Story = {
  args: {
    children: 'FAST',
    duration: 300,
    className: 'text-4xl font-bold',
  },
};

export const SlowScramble: Story = {
  args: {
    children: 'SLOW REVEAL',
    duration: 2000,
    className: 'text-3xl font-bold',
  },
};

export const WithDelay: Story = {
  args: {
    children: 'DELAYED START',
    delay: 1000,
    startOnView: false,
    animateOnHover: false,
    className: 'text-3xl font-bold',
  },
};

export const CustomCharacters: Story = {
  name: 'Custom Character Set',
  args: {
    children: 'HACKED',
    characterSet: '01'.split(''),
    className: 'text-4xl font-bold font-mono',
  },
};

export const HexCharacters: Story = {
  name: 'Hex Character Set',
  args: {
    children: 'BLOCKCHAIN',
    characterSet: '0123456789ABCDEF'.split(''),
    duration: 1200,
    className: 'text-3xl font-bold font-mono',
  },
};

export const RegistryBranding: Story = {
  name: 'Registry Branding',
  args: {
    children: 'FRAUD REGISTRY',
  },
  render: () => (
    <div className="flex flex-col items-center gap-4">
      <HyperText className="text-5xl font-bold">FRAUD</HyperText>
      <HyperText className="text-3xl" delay={400}>
        REGISTRY
      </HyperText>
    </div>
  ),
};
