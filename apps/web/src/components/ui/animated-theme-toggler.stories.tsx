import type { Meta, StoryObj } from '@storybook/react';
import { AnimatedThemeToggler } from './animated-theme-toggler';
import { ThemeProvider } from '@/providers/ThemeProvider';

const meta = {
  title: 'Theme/AnimatedThemeToggler',
  component: AnimatedThemeToggler,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
A theme toggle button with View Transitions API animation.
Uses a circular reveal animation in supported browsers (Chrome, Edge).
Falls back to instant switch in Safari/Firefox.

**Note:** This component controls color scheme (light/dark) only,
not the theme variant (base/hacker). Use the Storybook toolbar
to test different theme variants.
        `,
      },
    },
  },
  tags: ['autodocs'],
  // Wrap in ThemeProvider for useTheme hook
  decorators: [
    (Story) => (
      <ThemeProvider defaultColorScheme="light" defaultVariant="base">
        <div className="p-8 bg-background text-foreground rounded-lg border">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof AnimatedThemeToggler>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const CustomDuration: Story = {
  args: {
    duration: 800,
  },
  parameters: {
    docs: {
      description: {
        story: 'Slower animation (800ms instead of default 400ms).',
      },
    },
  },
};

export const Styled: Story = {
  args: {
    className: 'p-2 rounded-full hover:bg-accent transition-colors',
  },
};

export const InHeader: Story = {
  name: 'In Header Context',
  decorators: [
    (Story) => (
      <header className="flex items-center justify-between p-4 bg-background border-b w-[400px] rounded-lg">
        <span className="font-semibold">Stolen Wallet Registry</span>
        <Story />
      </header>
    ),
  ],
  args: {
    className: 'p-2 rounded-md hover:bg-accent',
  },
};

export const WithLabel: Story = {
  name: 'With Visible Label',
  decorators: [
    (Story) => (
      <div className="p-4 bg-background text-foreground rounded-lg border">
        <div className="flex items-center gap-2">
          <Story />
          <span className="text-sm text-muted-foreground">Toggle theme</span>
        </div>
      </div>
    ),
  ],
  args: {
    className: 'p-2 rounded-md hover:bg-accent',
  },
};
