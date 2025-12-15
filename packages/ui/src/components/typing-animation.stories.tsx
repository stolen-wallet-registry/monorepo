import type { Meta, StoryObj } from '@storybook/react';
import { TypingAnimation } from './typing-animation';

const meta = {
  title: 'Magic UI/TypingAnimation',
  component: TypingAnimation,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    duration: {
      control: { type: 'range', min: 50, max: 300, step: 10 },
    },
    delay: {
      control: { type: 'range', min: 0, max: 2000, step: 100 },
    },
    loop: {
      control: 'boolean',
    },
    showCursor: {
      control: 'boolean',
    },
    blinkCursor: {
      control: 'boolean',
    },
    cursorStyle: {
      control: 'select',
      options: ['line', 'block', 'underscore'],
    },
  },
} satisfies Meta<typeof TypingAnimation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Stolen Wallet Registry',
    className: 'text-2xl',
  },
};

export const WithDelay: Story = {
  args: {
    children: 'Loading...',
    delay: 1000,
    className: 'text-xl',
  },
};

export const FastTyping: Story = {
  args: {
    children: 'Quick typing animation',
    duration: 50,
    className: 'text-xl',
  },
};

export const SlowTyping: Story = {
  args: {
    children: 'Slow typing animation',
    duration: 200,
    className: 'text-xl',
  },
};

export const MultipleWords: Story = {
  name: 'Multiple Words (Loop)',
  args: {
    words: ['Report fraud', 'Protect wallets', 'Stay secure'],
    loop: true,
    className: 'text-2xl font-bold',
  },
};

export const BlockCursor: Story = {
  args: {
    children: 'Block cursor style',
    cursorStyle: 'block',
    className: 'text-xl',
  },
};

export const UnderscoreCursor: Story = {
  args: {
    children: 'Underscore cursor',
    cursorStyle: 'underscore',
    className: 'text-xl',
  },
};

export const NoCursor: Story = {
  args: {
    children: 'No cursor visible',
    showCursor: false,
    className: 'text-xl',
  },
};

export const HackerStyle: Story = {
  name: 'Hacker Terminal Style',
  args: {
    words: ['> Initializing...', '> Scanning blockchain...', '> Wallet compromised'],
    loop: true,
    cursorStyle: 'block',
    className: 'font-mono text-xl text-primary',
  },
};
