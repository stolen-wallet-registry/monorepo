import type { Meta, StoryObj } from '@storybook/react';
import { Search, Mail, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
} from './input-group';

const meta: Meta<typeof InputGroup> = {
  title: 'UI/InputGroup',
  component: InputGroup,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[400px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof InputGroup>;

/**
 * Input with search icon on the left.
 */
export const WithLeadingIcon: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <Search className="size-4 text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search..." />
    </InputGroup>
  ),
};

/**
 * Input with text prefix.
 */
export const WithTextPrefix: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example.com" />
    </InputGroup>
  ),
};

/**
 * Input with text suffix.
 */
export const WithTextSuffix: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="0.00" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>ETH</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Email input with icon and domain suffix.
 */
export const EmailInput: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <Mail className="size-4 text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput placeholder="username" type="text" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>@company.com</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Password input with toggle visibility button.
 */
export const PasswordWithToggle: Story = {
  render: function PasswordStory() {
    const [showPassword, setShowPassword] = useState(false);
    return (
      <InputGroup>
        <InputGroupInput type={showPassword ? 'text' : 'password'} placeholder="Enter password" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    );
  },
};

/**
 * Input with copy button.
 */
export const WithCopyButton: Story = {
  render: function CopyStory() {
    const [copied, setCopied] = useState(false);
    const value = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

    const handleCopy = () => {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <InputGroup>
        <InputGroupInput value={value} readOnly />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" onClick={handleCopy} aria-label="Copy to clipboard">
            {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    );
  },
};

/**
 * Input with action button.
 */
export const WithActionButton: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <Search className="size-4 text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search addresses..." />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="sm" variant="default">
          Search
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/**
 * Textarea variant with character count.
 */
export const TextareaWithCount: Story = {
  render: function TextareaStory() {
    const [value, setValue] = useState('');
    const maxLength = 280;

    return (
      <InputGroup>
        <InputGroupTextarea
          placeholder="Write a description..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={maxLength}
          rows={3}
        />
        <InputGroupAddon align="block-end">
          <InputGroupText
            className={value.length >= maxLength ? 'text-destructive' : 'text-muted-foreground'}
          >
            {value.length}/{maxLength}
          </InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    );
  },
};

/**
 * Label above input (block-start alignment).
 */
export const WithBlockLabel: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="block-start" className="border-b border-border">
        <InputGroupText className="font-medium text-foreground">Wallet Address</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="0x..." />
    </InputGroup>
  ),
};

/**
 * Error state.
 */
export const ErrorState: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <Mail className="size-4 text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput placeholder="email@example.com" aria-invalid="true" />
    </InputGroup>
  ),
};
