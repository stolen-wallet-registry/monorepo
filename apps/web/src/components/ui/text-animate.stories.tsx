import type { Meta, StoryObj } from '@storybook/react';
import { TextAnimate } from './text-animate';

const meta = {
  title: 'UI/TextAnimate',
  component: TextAnimate,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    animation: {
      control: 'select',
      options: [
        'fadeIn',
        'blurIn',
        'blurInUp',
        'blurInDown',
        'slideUp',
        'slideDown',
        'slideLeft',
        'slideRight',
        'scaleUp',
        'scaleDown',
      ],
    },
    by: {
      control: 'select',
      options: ['text', 'word', 'character', 'line'],
    },
    as: {
      control: 'select',
      options: ['p', 'h1', 'h2', 'h3', 'span', 'div'],
    },
    startOnView: {
      control: 'boolean',
    },
    once: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof TextAnimate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Stolen Wallet Registry',
    animation: 'fadeIn',
    by: 'word',
  },
};

export const BlurIn: Story = {
  args: {
    children: 'Report stolen wallets',
    animation: 'blurIn',
    by: 'word',
  },
};

export const BlurInUp: Story = {
  args: {
    children: 'Protect the community',
    animation: 'blurInUp',
    by: 'word',
  },
};

export const SlideUp: Story = {
  args: {
    children: 'Cross-chain fraud detection',
    animation: 'slideUp',
    by: 'word',
  },
};

export const ByCharacter: Story = {
  name: 'Character Animation',
  args: {
    children: 'STOLEN',
    animation: 'fadeIn',
    by: 'character',
    className: 'text-4xl font-bold',
  },
};

export const ByText: Story = {
  name: 'Whole Text Animation',
  args: {
    children: 'Decentralized Registry',
    animation: 'scaleUp',
    by: 'text',
    className: 'text-2xl',
  },
};

export const AsHeading: Story = {
  name: 'As H1 Heading',
  args: {
    children: 'Fraud Registry',
    animation: 'blurInUp',
    by: 'word',
    as: 'h1',
    className: 'text-4xl font-bold',
  },
};

export const AllAnimations: Story = {
  args: {
    children: 'All animations demo',
  },
  render: () => (
    <div className="flex flex-col gap-6">
      <TextAnimate animation="fadeIn" by="word">
        fadeIn animation
      </TextAnimate>
      <TextAnimate animation="blurIn" by="word">
        blurIn animation
      </TextAnimate>
      <TextAnimate animation="blurInUp" by="word">
        blurInUp animation
      </TextAnimate>
      <TextAnimate animation="slideUp" by="word">
        slideUp animation
      </TextAnimate>
      <TextAnimate animation="slideLeft" by="word">
        slideLeft animation
      </TextAnimate>
      <TextAnimate animation="scaleUp" by="word">
        scaleUp animation
      </TextAnimate>
    </div>
  ),
};
