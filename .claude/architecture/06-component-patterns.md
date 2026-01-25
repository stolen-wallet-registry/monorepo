# Component Patterns

UI organization, Storybook workflow, and testing patterns.

---

## Component Hierarchy

```
Pages (StandardRegistrationPage, etc.)
    ↓
Registration Steps (InitialFormStep, GracePeriodStep, etc.)
    ↓
Composed Components (AddressInput, SignatureCard, TransactionCard)
    ↓
UI Primitives (shadcn/ui: Button, Card, Input, Form)
```

---

## Directory Structure

```
src/components/
├── ui/                    # shadcn/ui primitives - DON'T MODIFY
├── composed/              # Business components - ADD STORIES
│   └── ComponentName/
│       ├── ComponentName.tsx
│       ├── ComponentName.stories.tsx
│       ├── ComponentName.test.tsx  (optional)
│       └── index.ts
├── registration/          # Flow-specific components
│   ├── StepRenderer.tsx
│   └── steps/
├── layout/                # Layout, Header
└── dev/                   # DevTools, debug panels
```

---

## Key Rules

1. **Check shadcn/ui first** - Browse https://ui.shadcn.com/docs/components before creating new components
2. **Composed = shadcn primitives + business logic** - Don't reinvent primitives
3. **Co-locate files** - Component, story, test, index in same directory
4. **Barrel exports** - Each component directory has `index.ts`

---

## Composed Component Pattern

```typescript
// ComponentName/index.ts
export { ComponentName, type ComponentNameProps } from './ComponentName';

// ComponentName/ComponentName.tsx
export interface ComponentNameProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;  // Always provide escape hatch
}

export function ComponentName({ value, onChange, className }: ComponentNameProps) {
  return (
    <div className={cn('base-classes', className)}>
      {/* Compose shadcn primitives */}
    </div>
  );
}
```

**Key patterns:**

- `forwardRef` for input-like components
- `className` prop for styling escape hatch
- Status-driven rendering: `type Status = 'idle' | 'loading' | 'success' | 'error'`
- ARIA roles for custom interactive elements

---

## Storybook

**Config:** `apps/web/.storybook/`

**Story structure:**

```typescript
const meta = {
  title: 'Composed/ComponentName',
  component: ComponentName,
  tags: ['autodocs'],
} satisfies Meta<typeof ComponentName>;

export default meta;

// Static story
export const Default: Story = { args: { prop: 'value' } };

// Interactive story
export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState('');
    return <ComponentName value={value} onChange={setValue} />;
  },
};
```

**Organization:**

- `Primitives/` - shadcn/ui components
- `Composed/` - Business components
- `MagicUI/` - Animation components

---

## Testing

**Setup:** `src/test/setup.ts`, `src/test/test-utils.tsx`

**What to test:**

- Props rendering correctly
- User interactions (clicks, keyboard)
- Callback invocations
- Accessibility attributes

**What NOT to test:**

- shadcn/ui primitives
- Visual appearance (use Storybook)
- CSS classes

**Example:**

```typescript
it('calls onSelect when clicking', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<Component onSelect={onSelect} />);

  await user.click(screen.getByText('Option'));
  expect(onSelect).toHaveBeenCalledWith('option');
});
```

---

## Accessibility Checklist

- `role="radiogroup"` / `role="radio"` for custom selection
- `aria-checked`, `aria-disabled`, `aria-invalid` states
- `tabIndex={isDisabled ? -1 : 0}` for focus management
- Keyboard handlers for Enter/Space
- `aria-label` on icon-only buttons

---

## Custom Icons (web3icons-compatible)

Custom icons not in `@web3icons/react` live in `apps/landing/components/landing/CrossChainVisualization/shared/icons.tsx`.

**Reference:** `ChainalysisLogo`, `SealTeamLogo`, `HyperlaneLogo`

**Pattern:** Extract icon path from brand SVG, use `fill="currentColor"`, include `role="img"` + `<title>`. ViewBox should match path bounds (web3icons uses 24x24, but SVG scaling handles other sizes). Prefer `variant="mono"` for dark mode.

**Multi-color brand icons:** Some brand icons (e.g., `HyperlaneLogo`) use fixed fills for specific brand colors rather than `currentColor`. The Hyperlane logo uses `fill="#D631B9"` for magenta paths and `className="fill-white dark:fill-white"` for white/light paths to maintain brand integrity across themes.
